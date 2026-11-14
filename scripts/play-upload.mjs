#!/usr/bin/env node
// Uploads a signed app bundle (.aab) to a Google Play testing track, with the Play Developer API.
// No packages: Node's own crypto signs the service account's token, so no third-party code ever
// sees the key. Used by .github/workflows/android-play.yml; setup is in docs/google-play.md.
//
//   PLAY_SERVICE_ACCOUNT_JSON='{...}' node scripts/play-upload.mjs app.aab \
//     [--track internal] [--status completed] [--mapping mapping.txt] [--name "1.0.42"] [--package com.game_scroll.app] [--priority 0]
//
// --status: completed (testers get it now) or draft (waits in Play Console for you to roll it out).
// --priority: how much the update matters, 0 (default) to 5. The app (src/update.js) has Play download
//   0 to 3 in the background and offer a restart; 4 and 5 get Play's full-screen update at once, which
//   the player can't skip. Play keeps a release's priority for good: it can't be changed afterwards.
// Until Play has rolled out the app's first release, the API only takes drafts, so a "draft app"
// refusal is retried as a draft automatically.
import { createSign } from 'node:crypto';
import { appendFileSync, readFileSync, statSync } from 'node:fs';
import https from 'node:https';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const aab = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const PKG = opt('package', 'com.game_scroll.app');
const track = opt('track', 'internal');
let status = opt('status', 'completed');
const mapping = opt('mapping');
const name = opt('name');
const priority = Number(opt('priority', '0'));

if (!aab) { console.error('Usage: node scripts/play-upload.mjs <app.aab> [--track internal] [--status completed|draft]'); process.exit(2); }
if (!['completed', 'draft'].includes(status)) { console.error(`--status must be completed or draft, not ${status}`); process.exit(2); }
if (!Number.isInteger(priority) || priority < 0 || priority > 5) { console.error(`--priority must be a whole number from 0 to 5, not ${opt('priority')}`); process.exit(2); }
const raw = process.env.PLAY_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('PLAY_SERVICE_ACCOUNT_JSON is not set (the service account key, see docs/google-play.md)'); process.exit(2); }
let sa;
try { sa = JSON.parse(raw); } catch { console.error('PLAY_SERVICE_ACCOUNT_JSON is not valid JSON: paste the whole key file'); process.exit(2); }

/** One HTTPS request; no timeout, because Play can take minutes to process a big bundle. */
function call(method, url, { body, type = 'application/json', token } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const headers = { 'content-type': type };
    if (data) headers['content-length'] = data.length;
    if (token) headers.authorization = `Bearer ${token}`;
    const req = https.request(url, { method, headers }, (res) => {
      const parts = [];
      res.on('data', (d) => parts.push(d));
      res.on('end', () => {
        const text = Buffer.concat(parts).toString();
        let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { text }; }
        if (res.statusCode >= 300) {
          const err = new Error(`${method} ${url.replace(/\?.*/, '')}: ${res.statusCode} ${json.error?.message || text.slice(0, 500)}`);
          err.status = res.statusCode; err.detail = json.error?.message || text;
          reject(err);
        } else resolve(json);
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function accessToken() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const claim = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key).toString('base64url');
  const form = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` });
  const r = await call('POST', 'https://oauth2.googleapis.com/token', { body: form.toString(), type: 'application/x-www-form-urlencoded' });
  return r.access_token;
}

const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
const UP = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}`;
const isDraftApp = (e) => /draft app/i.test(e.detail || e.message);

try {
  const token = await accessToken();
  const size = (statSync(aab).size / 1048576).toFixed(1);
  const edit = await call('POST', `${API}/edits`, { body: {}, token });
  console.log(`Uploading ${aab} (${size} MB) to ${PKG}...`);
  const bundle = await call('POST', `${UP}/edits/${edit.id}/bundles?uploadType=media`,
    { body: readFileSync(aab), type: 'application/octet-stream', token });
  const vc = bundle.versionCode;
  console.log(`Play took version code ${vc}`);
  if (mapping) {
    // Nice to have: a failure here only means unreadable crash traces, so it never stops the release.
    try {
      await call('POST', `${UP}/edits/${edit.id}/apks/${vc}/deobfuscationFiles/proguard?uploadType=media`,
        { body: readFileSync(mapping), type: 'application/octet-stream', token });
      console.log('Uploaded the R8 mapping, so crash reports in Play Console show real names');
    } catch (e) { console.log(`::warning::Couldn't upload the R8 mapping (${e.message}); releasing anyway`); }
  }
  const putTrack = () => call('PUT', `${API}/edits/${edit.id}/tracks/${track}`, { token, body: {
    track, releases: [{ name: name || String(vc), versionCodes: [String(vc)], status, inAppUpdatePriority: priority }] } });
  try {
    await putTrack();
    await call('POST', `${API}/edits/${edit.id}:commit`, { body: {}, token });
  } catch (e) {
    if (status === 'draft' || !isDraftApp(e)) throw e;
    console.log('Play only takes draft releases until the app\'s first release has been rolled out: saving it as a draft.');
    status = 'draft';
    await putTrack();
    await call('POST', `${API}/edits/${edit.id}:commit`, { body: {}, token });
  }
  const urgent = priority >= 4 ? ` Update priority ${priority}: the app makes players update to it at once.` : priority ? ` Update priority ${priority}.` : '';
  console.log((status === 'completed'
    ? `Done: version ${vc} is live on the ${track} track. Testers get it from the Play Store shortly.`
    : `Done: version ${vc} is a draft on the ${track} track. Roll it out in Play Console → Test and release → Testing → ${track}.`) + urgent);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Google Play\nVersion code **${vc}** uploaded to the **${track}** track as **${status}**.${urgent}\n`);
  }
} catch (e) {
  console.error(e.message);
  if (e.status === 401 || e.status === 403) console.error('The service account can\'t publish this app: invite it in Play Console → Users and permissions (docs/google-play.md, step 4).');
  if (e.status === 404) console.error(`Play doesn't know ${PKG} yet, or the API isn't on: check the package name and that the Play Developer API is on (docs/google-play.md, step 4).`);
  if (/version code .* already been used/i.test(e.detail || '')) console.error('That version code is already on Play: run the workflow again (each run gets a new number).');
  process.exit(1);
}
