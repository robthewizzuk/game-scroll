// Tests for the Game Scroll API Worker.
//   cd workers/hearts && npx wrangler d1 migrations apply game-scroll-hearts --local && npm test
//
// 1. App Attest and Play Integrity checks, run directly in Node with a fake Apple CA / fake Google.
// 2. The Worker end to end (wrangler dev, local D1): hearts, limits, passes, ENFORCE, CORS.
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { webcrypto as crypto } from 'node:crypto';
import 'reflect-metadata';
import * as x509 from '@peculiar/x509';
import { encode as cborEncode } from 'cbor-x';
import { verifyAttestation, verifyAssertion } from './src/appattest.js';
import { verifyIntegrity, _reset } from './src/playintegrity.js';
import { newChallenge, checkChallenge, newSession, readSession } from './src/session.js';
import { cbor, b64u, sha256, concat } from './src/util.js';
import { cleanBatch } from './src/stats.js';
import { sharePage, shareGame, idFromPath } from './src/sharepage.js';
import { cleanPerf, perfPage } from './src/perf.js';
import { plausible, cleanSecs } from './src/scores.js';

x509.cryptoProvider.set(crypto);
const ok = msg => console.log('  ✓ ' + msg);
const rejects = async (p, re) => { await assert.rejects(p, e => re.test(e.message)); };

/* ---------- util ---------- */
{
  const v = { a: 1, b: Buffer.from([1, 2]), c: 'x', d: [1, -5, 300, 70000] };
  const d = cbor(new Uint8Array(cborEncode(v)));
  assert.deepEqual({ ...d, b: [...d.b] }, { ...v, b: [1, 2] });
  ok('CBOR decoder reads what cbor-x writes');
}

/* ---------- leaderboard quick checks ---------- */
{
  const meta = { goal: 30 };
  assert.equal(plausible(45, 60, meta), null, 'a good round is fine');
  assert.equal(plausible(45, 1, meta), 'round too short');
  assert.equal(plausible(40000, 3600, meta), 'higher than the game allows');
  assert.equal(plausible(5000, 30, meta), 'scored too fast');
  assert.equal(plausible(5000, 30, { goal: 30, scoreRate: 500 }), null, 'a game can allow faster scoring');
  assert.equal(plausible(900, 600, { goal: 30, scoreMax: 500 }), 'higher than the game allows', 'or a lower top');
  assert.equal(plausible(1e8, 60, null), null, 'unknown games only get the basic checks');
  assert.equal(cleanSecs(-1), null); assert.equal(cleanSecs('5'), null); assert.equal(cleanSecs(20000), null); assert.equal(cleanSecs(12.5), 12.5);
  ok('quick checks: too short, too high, too fast; games can set their own limits');
}

/* ---------- play stats and share pages ---------- */
{
  const known = new Map([['mini-golf', {}], ['stack-up', {}]]);
  const rows = cleanBatch({ 'mini-golf': { v: 3, p: 2, k: 9, s: 99999 }, 'stack-up': { v: 0, p: 0, k: 0, s: 0 }, 'nope': { v: 1 }, 'Bad!': { v: 1 } }, known);
  assert.deepEqual(rows, [['mini-golf', 3, 2, 3, 3600]]);
  assert.equal(cleanBatch([1, 2], known), null);
  const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => ['g' + i, { v: 1 }]));
  assert.equal(cleanBatch(many, null).length, 60);
  ok('stats batches drop unknown games, cap numbers and size');
  assert.equal(idFromPath('/Mini-Golf/'), 'mini-golf');
  assert.equal(idFromPath('/../etc'), null);
  // a catalogue entry as scripts/build-games.mjs writes it: the title, hint and tag are under meta
  const entry = { id: 'mini-golf', hash: 'abc123', file: 'games/mini-golf.abc123.js', meta: { id: 'mini-golf', title: 'Mini <Golf>', hint: 'Putt "it"', tag: 'POCKET' } };
  const page = sharePage(shareGame(entry), { webUrl: 'https://x.test/' });
  assert.match(page, /gamescroll:\/\/game\/mini-golf/);
  assert.match(page, /<h1>Mini &lt;Golf&gt;<\/h1>/);
  assert.match(page, /<title>Mini &lt;Golf&gt; · Game Scroll<\/title>/);
  assert.match(page, /Putt &quot;it&quot;/);
  assert.ok(!page.includes('<Golf>') && !page.includes('undefined'));
  assert.match(page, /https:\/\/x\.test\/\?g=mini-golf/);
  assert.match(sharePage(null), /didn’t work/);
  ok('share pages name the game, escape its text and link to the app and the browser version');
  // the catalogue couldn't be read: the game can't be named, but the links still open it
  const blind = sharePage(null, { webUrl: 'https://x.test/', id: 'mini-golf' });
  assert.match(blind, /gamescroll:\/\/game\/mini-golf/);
  assert.match(blind, /https:\/\/x\.test\/\?g=mini-golf/);
  assert.ok(!/didn’t work/.test(blind) && !blind.includes('undefined'));
  assert.ok(!sharePage(null, { webUrl: 'https://x.test/', id: '"><script>' }).includes('<script>'));
  assert.match(sharePage(shareGame({ id: 'mini-golf' }), { webUrl: 'https://x.test/' }), /\?g=mini-golf/);
  assert.equal(shareGame(undefined), null);
  ok('…and keep the game in their links when the catalogue can\'t be read');
}

/* ---------- performance and crash reports ---------- */
{
  const known = new Map([['mini-golf', { title: 'Mini Golf' }]]);
  const b = cleanPerf({
    info: { platform: 'android', model: 'SM-F966B\u0000<x>', os: 'Android 16', app: '1.0.5', form: 'wide' },
    games: { 'mini-golf': { r: 2, f: 600, ms: 12000, w: 20000, sl: 900, h: 50, x: 99999 }, nope: { f: 10, ms: 100 }, 'mini-golf-x': 1 },
    errors: [{ kind: 'crash', game: 'mini-golf', msg: 'App closed', n: 999 }, { kind: 'weird', game: 'nope', msg: 'TypeError: x', place: 'a.js:1' }, { msg: '' }],
  }, known);
  assert.deepEqual(b.info, { platform: 'android', model: 'SM-F966B<x>', os: 'Android 16', app: '1.0.5', form: 'wide' });
  assert.deepEqual(b.games, [['mini-golf', 2, 600, 12000, 12000, 600, 50, 12000]]);
  assert.deepEqual(b.errors, [['crash', 'mini-golf', 'App closed', '', 50], ['error', '', 'TypeError: x', 'a.js:1', 1]]);
  assert.equal(cleanPerf({ games: [] }, known), null);
  assert.equal(cleanPerf({ info: { platform: 'pc', form: 'huge' } }, known).info.platform, 'web');
  ok('perf batches drop unknown games, clean text and keep numbers consistent');
  const d = 20769, at = d * 86400 + 21 * 3600 + 44 * 60;   // 12 Nov 2026, 21:44 UTC
  const slow = { rounds: 3, frames: 600, ms: 12000, work: 6000, slow: 120, hitches: 9, worst: 210 }, fine = { rounds: 1, frames: 600, ms: 10000, work: 2000, slow: 3, hitches: 0, worst: 40 };
  const report = { days: 14, at, game: '',
    phones: [{ platform: 'android', model: '<b>SM</b>', kind: '', app: '1.0.7 abc1234', d0: d - 3, d1: d, t1: at, builds: 2, rounds: 4, ms: 22000 },
      { platform: 'android', model: 'Robo', kind: 'robot', app: '1.0.7 abc1234', d0: d - 1, d1: d, t1: 0, builds: 40, rounds: 90, ms: 99000 }],
    games: [{ game: 'mini-golf', platform: 'android', model: '<b>SM</b>', form: 'wide', builds: 2, d0: d - 3, all: slow, app: '1.0.7 abc1234', d1: d, t1: at, now: fine },
      { game: 'old-game', platform: 'android', model: '<b>SM</b>', form: 'phone', builds: 1, d0: d - 3, all: slow, app: '1.0.5 "><i>x', d1: d - 3, t1: 0, now: slow }],
    errors: [{ kind: 'error', game: 'mini-golf', msg: '<script>alert(1)</script>', place: 'x.js:1', n: 4, d0: d - 3, d1: d - 2, t0: at, t1: 0, models: ['<b>SM</b>', 'Robo'],
      apps: [{ app: '1.0.6 fedcba9', d1: d - 2, t1: 0 }, { app: 'local', d1: d - 3, t1: 0 }], state: 'gone', newer: 2 },
    { kind: 'crash', game: '', msg: 'App closed while open', place: '', n: 1, d0: d, d1: d, t0: at, t1: at, models: ['Robo'], apps: [{ app: '1.0.7 abc1234', d1: d, t1: at }], state: 'now', newer: 0 }] };
  const page = perfPage(report, known, 'https://github.com/x/y');
  assert.ok(!page.includes('<script>') && !page.includes('<b>SM') && !page.includes('<i>x'));
  assert.match(page, /<a href="\?game=mini-golf">Mini Golf<\/a>/); assert.ok(!page.includes('?game=old-game'), 'only games in the catalogue get a page');
  assert.match(page, /class="n bad">20\.0%/); assert.match(page, /class="n ok">0\.5%/);   // every build, and the newest
  assert.match(page, /href="https:\/\/github\.com\/x\/y\/commit\/abc1234"/); assert.match(page, /12 Nov 21:44/);
  assert.match(page, /<td class=t>9 Nov<\/td><td class=t>10 Nov<\/td>/, 'no time is shown for a day whose time was not kept');
  assert.match(page, /Probably not: 2 newer builds have played it/); assert.match(page, /Yes: on the newest build that phone has run/);
  assert.match(page, /probably a test robot: 40 builds in 2 days/); assert.match(page, /<tr class=old><td>old-game/);
  assert.ok(page.indexOf('<details open><summary><b>&lt;b&gt;SM') > 0 && page.indexOf('<details><summary><b>Robo') < 0, 'a phone with no rows gets no block');
  assert.ok(!perfPage(report, known, 'javascript:alert(1)').includes('javascript:'));
  const one = perfPage({ ...report, game: 'mini-golf', games: [], history: [{ platform: 'android', model: '<b>SM</b>', form: 'wide', app: '1.0.7 abc1234', day: d, t0: at - 600, t1: at, ...fine }] }, known, 'https://github.com/x/y');
  assert.match(one, /Game Scroll performance: Mini Golf/); assert.match(one, /21:34 to 21:44/); assert.ok(!one.includes('?game='));
  ok('perf report page escapes reported text, flags slow games and says when and on which build');
}

/* ---------- sessions ---------- */
{
  const secret = 'test-secret-1234567890';
  const ch = await newChallenge(secret);
  assert.ok(/^[A-Za-z0-9_-]{16,500}$/.test(ch), 'challenge is a valid Play Integrity nonce');
  assert.equal(await checkChallenge(secret, ch), true);
  assert.equal(await checkChallenge('other-secret', ch), false);
  assert.equal(await checkChallenge(secret, ch, Date.now() + 6 * 60 * 1000), false);
  const s = await newSession(secret, 'device-aaaaaaaaaaaaaaaa', 'ios');
  assert.equal((await readSession(secret, s.token)).d, 'device-aaaaaaaaaaaaaaaa');
  // Flip the first character of the signature (the last one can carry unused padding bits).
  const [sb, sm] = s.token.split('.');
  assert.equal(await readSession(secret, sb + '.' + (sm[0] === 'A' ? 'B' : 'A') + sm.slice(1)), null);
  assert.equal(await readSession(secret, sb.slice(0, -2) + 'xx.' + sm), null);
  assert.equal(await readSession(secret, s.token, Date.now() + 25 * 3600 * 1000), null);
  ok('challenges and passes are signed and expire');
}

/* ---------- App Attest with a fake Apple CA ---------- */
const appId = 'TEAM123456.com.gamescroll.app';
async function fakeApple() {
  const P384 = { name: 'ECDSA', namedCurve: 'P-384', hash: 'SHA-384' };
  const rootKeys = await crypto.subtle.generateKey(P384, true, ['sign', 'verify']);
  const interKeys = await crypto.subtle.generateKey(P384, true, ['sign', 'verify']);
  const nb = new Date(Date.now() - 86400e3), na = new Date(Date.now() + 86400e3);
  const root = await x509.X509CertificateGenerator.createSelfSigned({ serialNumber: '01', name: 'CN=Fake Root', notBefore: nb, notAfter: na, keys: rootKeys, signingAlgorithm: P384,
    extensions: [new x509.BasicConstraintsExtension(true, undefined, true)] });
  const inter = await x509.X509CertificateGenerator.create({ serialNumber: '02', subject: 'CN=Fake Inter', issuer: root.subject, notBefore: nb, notAfter: na,
    publicKey: interKeys.publicKey, signingKey: rootKeys.privateKey, signingAlgorithm: P384, extensions: [new x509.BasicConstraintsExtension(true, undefined, true)] });
  return { root, inter, interKeys, nb, na, P384 };
}
async function fakeAttestation(ca, challenge, { app = appId, aaguid = 'appattestdevelop', counter = 0 } = {}) {
  const leafKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const point = new Uint8Array(await crypto.subtle.exportKey('raw', leafKeys.publicKey));
  const kid = await sha256(point);
  const aag = new TextEncoder().encode(aaguid.padEnd(16, '\0'));
  const cnt = new Uint8Array(4); new DataView(cnt.buffer).setUint32(0, counter);
  const authData = concat(await sha256(app), new Uint8Array([0x40]), cnt, aag, new Uint8Array([0, 32]), kid, new Uint8Array(10));
  const nonce = await sha256(concat(authData, await sha256(challenge)));
  // Apple's extension: SEQUENCE { [1] { OCTET STRING nonce } }
  const extVal = concat(new Uint8Array([0x30, 0x24, 0xa1, 0x22, 0x04, 0x20]), nonce);
  const leaf = await x509.X509CertificateGenerator.create({ serialNumber: '03', subject: 'CN=leaf', issuer: ca.inter.subject, notBefore: ca.nb, notAfter: ca.na,
    publicKey: leafKeys.publicKey, signingKey: ca.interKeys.privateKey, signingAlgorithm: ca.P384,
    extensions: [new x509.Extension('1.2.840.113635.100.8.2', false, extVal)] });
  const att = cborEncode({ fmt: 'apple-appattest', attStmt: { x5c: [Buffer.from(leaf.rawData), Buffer.from(ca.inter.rawData)], receipt: Buffer.alloc(0) }, authData: Buffer.from(authData) });
  return { keyId: Buffer.from(kid).toString('base64'), attestation: Buffer.from(att).toString('base64'), leafKeys };
}
async function fakeAssertion(leafKeys, challenge, counter, app = appId) {
  const cnt = new Uint8Array(4); new DataView(cnt.buffer).setUint32(0, counter);
  const authenticatorData = concat(await sha256(app), new Uint8Array([0x40]), cnt);
  const nonce = await sha256(concat(authenticatorData, await sha256(challenge)));
  const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, leafKeys.privateKey, nonce));
  const der = int => { let v = int; while (v.length > 1 && v[0] === 0 && !(v[1] & 0x80)) v = v.subarray(1); if (v[0] & 0x80) v = concat(new Uint8Array([0]), v); return concat(new Uint8Array([2, v.length]), v); };
  const r = der(raw.subarray(0, 32)), s = der(raw.subarray(32));
  const sig = concat(new Uint8Array([0x30, r.length + s.length]), r, s);
  return Buffer.from(cborEncode({ signature: Buffer.from(sig), authenticatorData: Buffer.from(authenticatorData) })).toString('base64');
}
{
  const ca = await fakeApple();
  const rootPem = ca.root.toString('pem');
  const ch = 'challenge-abc';
  const a = await fakeAttestation(ca, ch);
  const k = await verifyAttestation({ appId, keyId: a.keyId, attestation: a.attestation, challenge: ch, rootPem });
  assert.equal(k.env, 'development');
  ok('a genuine attestation is accepted');
  await rejects(verifyAttestation({ appId, keyId: a.keyId, attestation: a.attestation, challenge: 'other', rootPem }), /nonce/);
  ok('…but not for a different challenge');
  await rejects(verifyAttestation({ appId: 'OTHER.app', keyId: a.keyId, attestation: a.attestation, challenge: ch, rootPem }), /wrong app/);
  ok('…or a different app');
  await rejects(verifyAttestation({ appId, keyId: a.keyId, attestation: a.attestation, challenge: ch }), /not signed by Apple/);
  ok('…or a certificate chain that isn\'t Apple\'s (real root)');
  const b = await fakeAttestation(ca, ch);
  await rejects(verifyAttestation({ appId, keyId: b.keyId, attestation: a.attestation, challenge: ch, rootPem }), /key id/);
  ok('…or someone else\'s key id');
  await rejects(verifyAttestation({ appId: '', keyId: a.keyId, attestation: a.attestation, challenge: ch, rootPem }), /not set up/);
  const used = await fakeAttestation(ca, ch, { counter: 3 });
  await rejects(verifyAttestation({ appId, keyId: used.keyId, attestation: used.attestation, challenge: ch, rootPem }), /counter/);
  ok('…or a key that has already been used (counter not zero)');

  const as1 = await fakeAssertion(a.leafKeys, 'ch2', 1);
  assert.equal(await verifyAssertion({ appId, publicKey: k.publicKey, lastCounter: 0, assertion: as1, challenge: 'ch2' }), 1);
  ok('an assertion from the attested key is accepted');
  await rejects(verifyAssertion({ appId, publicKey: k.publicKey, lastCounter: 1, assertion: as1, challenge: 'ch2' }), /counter/);
  ok('…but not replayed');
  await rejects(verifyAssertion({ appId, publicKey: k.publicKey, lastCounter: 0, assertion: as1, challenge: 'ch3' }), /signature/);
  const other = await fakeAssertion(b.leafKeys, 'ch2', 5);
  await rejects(verifyAssertion({ appId, publicKey: k.publicKey, lastCounter: 0, assertion: other, challenge: 'ch2' }), /signature/);
  ok('…or signed by another key or for another challenge');
}

/* ---------- Play Integrity with a fake Google ---------- */
{
  const rsa = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pk = Buffer.from(await crypto.subtle.exportKey('pkcs8', rsa.privateKey)).toString('base64');
  const saJson = JSON.stringify({ client_email: 'x@y.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${pk}\n-----END PRIVATE KEY-----\n` });
  let payload;
  const fetchFn = async (url, init) => {
    if (new URL(url).host === 'oauth2.googleapis.com') {
      const jwt = new URLSearchParams(init.body).get('assertion').split('.');
      const good = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', rsa.publicKey, Buffer.from(jwt[2], 'base64url'), new TextEncoder().encode(jwt[0] + '.' + jwt[1]));
      return new Response(JSON.stringify(good ? { access_token: 'at', expires_in: 3600 } : {}), { status: good ? 200 : 401 });
    }
    assert.equal(init.headers.Authorization, 'Bearer at');
    return new Response(JSON.stringify({ tokenPayloadExternal: payload }));
  };
  const base = ch => ({ requestDetails: { requestPackageName: 'com.game_scroll.app', nonce: ch, timestampMillis: String(Date.now()) },
    appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED', packageName: 'com.game_scroll.app' },
    deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] } });
  _reset();
  payload = base('n1');
  await verifyIntegrity({ saJson, token: 't', challenge: 'n1', fetchFn });
  ok('a Play-recognized app on a genuine device is accepted');
  await rejects(verifyIntegrity({ saJson, token: 't', challenge: 'n2', fetchFn }), /nonce/);
  payload = { ...base('n1'), requestDetails: { ...base('n1').requestDetails, requestPackageName: 'com.someone.else' } };
  await rejects(verifyIntegrity({ saJson, token: 't', challenge: 'n1', fetchFn }), /wrong package/);
  payload = { ...base('n1'), deviceIntegrity: { deviceRecognitionVerdict: [] } };
  await rejects(verifyIntegrity({ saJson, token: 't', challenge: 'n1', fetchFn }), /device/);
  payload = { ...base('n1'), appIntegrity: { appRecognitionVerdict: 'UNRECOGNIZED_VERSION' } };
  await rejects(verifyIntegrity({ saJson, token: 't', challenge: 'n1', fetchFn }), /not recognized/);
  await verifyIntegrity({ saJson, token: 't', challenge: 'n1', fetchFn, allowSideloaded: true });
  ok('wrong nonce, failed device and sideloaded app are refused (sideload allowed only when switched on)');
  await rejects(verifyIntegrity({ saJson: '', token: 't', challenge: 'n1', fetchFn }), /not set up/);
}

/* ---------- the Worker end to end ---------- */
const { unstable_startWorker } = await import('wrangler');
const SECRET = 'local-test-secret-' + Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex');
// origin: the address the Worker sees itself at (api.game-scroll.com unless given)
async function run(vars, fn, origin) {
  writeFileSync('.dev.vars', Object.entries({ SESSION_SECRET: SECRET, MANIFEST_URL: '', STATS_TTL: '0', ...vars }).map(([k, v]) => `${k}=${v}`).join('\n'));
  const w = await unstable_startWorker({ config: 'wrangler.toml', dev: { remote: false, server: { port: 0 }, logLevel: 'error', ...(origin ? { origin } : {}) } });
  try { await fn((await w.url).toString().replace(/\/$/, '')); } finally { await w.dispose(); rmSync('.dev.vars', { force: true }); }
}
// Fresh device ids per run too: local rate-limit counters outlive one run.
const run_ = Date.now().toString(36);
const A = 'test-device-a-' + run_, B = 'test-device-b-' + run_, game = 'test-game-' + run_;
// Each run uses its own fake address, since local rate-limit counters outlive one run.
const IP = '198.51.100.' + (1 + crypto.getRandomValues(new Uint8Array(1))[0] % 250) + '.' + Date.now() % 1e6;
const post = (url, path, body, headers = {}) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': IP, ...headers }, body: JSON.stringify(body) });

await run({}, async url => {
  let r = await post(url, '/heart', { device: A, game, on: true }); assert.equal(r.status, 200); assert.equal((await r.json()).n, 1);
  r = await post(url, '/heart', { device: A, game, on: true }); assert.equal((await r.json()).n, 1, 'same device twice counts once');
  r = await post(url, '/heart', { device: B, game, on: true }); assert.equal((await r.json()).n, 2);
  r = await post(url, '/heart', { device: A, game, on: false }); assert.equal((await r.json()).n, 1, 'un-heart takes it back');
  r = await post(url, '/heart', { device: A, game, on: false }); assert.equal((await r.json()).n, 1, 'un-heart twice takes one back');
  r = await post(url, '/heart', { device: A, game: game + '-new', on: false }); assert.equal((await r.json()).n, 0, 'never below zero');
  ok('hearts count once per device and can be taken back');
  r = await post(url, '/heart', { device: 'short', game, on: true }); assert.equal(r.status, 400);
  r = await post(url, '/heart', { device: A, game: 'Bad Id!', on: true }); assert.equal(r.status, 400);
  r = await post(url, '/heart', { device: A, game, on: true, pad: 'x'.repeat(2000) }); assert.equal(r.status, 400);
  ok('bad ids and oversized bodies are refused');
  r = await fetch(url + '/counts', { headers: { Origin: 'capacitor://localhost' } }); assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), 'capacitor://localhost');
  assert.equal((await r.json()).counts[game], 1);
  r = await fetch(url + '/counts', { headers: { Origin: 'https://evil.example' } });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  ok('counts readable; browsers only allowed from the app and test site');
  // leaderboards: best score kept per device, ranks, today's board, made-up names
  r = await post(url, '/score', { device: A, game, score: 50, secs: 10 }); assert.equal(r.status, 200);
  let sc = await r.json(); assert.deepEqual([sc.all.rank, sc.all.of, sc.day.rank], [1, 1, 1]);
  r = await post(url, '/score', { device: B, game, score: 80, secs: 10 }); sc = await r.json(); assert.deepEqual([sc.all.rank, sc.all.of], [1, 2]);
  r = await post(url, '/score', { device: A, game, score: 30, secs: 10 }); sc = await r.json(); assert.equal(sc.all.best, 50, 'a lower score keeps the best'); assert.equal(sc.all.rank, 2);
  r = await post(url, '/score', { device: A, game, score: -1, secs: 10 }); assert.equal(r.status, 400);
  r = await post(url, '/score', { device: A, game, score: 1e12, secs: 10 }); assert.equal(r.status, 400);
  r = await fetch(url + `/board?game=${game}&device=${A}&when=day`, { headers: { 'CF-Connecting-IP': IP } }); const bd = await r.json();
  assert.deepEqual(bd.top.map(t => t.score), [80, 50]); assert.equal(bd.me.rank, 2); assert.ok(bd.top[1].me && !bd.top[0].me);
  assert.match(bd.top[0].name, /^[A-Z][a-z]+ [A-Z][a-z]+ \d+$/);
  ok('leaderboards keep each device\'s best, rank it, and show made-up names');
  r = await post(url, '/score', { device: A, game, score: 60 }); assert.equal(r.status, 400, 'round length is needed');
  r = await post(url, '/score', { device: A, game, score: 60, secs: 1 }); assert.equal(r.status, 422, 'too short a round is not counted');
  r = await post(url, '/score', { device: A, game, score: 60, secs: 900 }); assert.equal(r.status, 422, 'a round longer than the time since the last one');
  assert.equal((await r.json()).why, 'round longer than the time since the last one');
  ok('quick checks turn away rounds that cannot be real');
  // Tiny Brains shared learning: trimmed average of each device's latest brain
  {
    const { pack } = await import('./src/brains.js');
    const brain = v => pack('2x3x2', new Float32Array(17).fill(v));
    r = await post(url, '/brain', { device: A, game, name: 'bot', shape: '2x3x2', w: brain(.5), steps: 900 }); assert.equal(r.status, 200);
    r = await post(url, '/brain', { device: B, game, name: 'bot', shape: '2x3x2', w: brain(1), steps: 900 }); assert.equal(r.status, 200);
    r = await post(url, '/brain', { device: A, game, name: 'bot', shape: '2x3x2', w: brain(1), steps: 10 }); assert.equal(r.status, 400, 'too little learning is refused');
    r = await post(url, '/brain', { device: A, game, name: 'bot', shape: '2x4x2', w: brain(1), steps: 900 }); assert.equal(r.status, 400, 'shape must match the numbers');
    r = await post(url, '/brain', { device: A, game, name: 'bot', shape: '200x200x2', w: brain(1), steps: 900 }); assert.equal(r.status, 400, 'too big');
    r = await fetch(url + `/brain?game=${game}&name=bot&shape=2x3x2`, { headers: { 'CF-Connecting-IP': IP } }); assert.equal(r.status, 200);
    const sb = await r.json(); assert.equal(sb.from, 2); assert.match(sb.w, /^tb1:2x3x2:/);
    r = await fetch(url + `/brain?game=${game}&name=nobody&shape=2x3x2`, { headers: { 'CF-Connecting-IP': IP } }); assert.equal(r.status, 404);
    ok('Tiny Brains: phones share brain numbers, checked, and get back the average');
  }
  // Without a pass: 10 writes a minute per address.
  let limitedAt = 0;
  for (let i = 0; i < 12 && !limitedAt; i++) { r = await post(url, '/heart', { device: B, game, on: i % 2 === 0 }); if (r.status === 429) limitedAt = i + 1; }
  assert.ok(limitedAt > 0, 'unverified hearts hit the per-address limit');
  ok('hearts without a pass are rate-limited per address');
  // With a pass the device limit applies instead.
  const s = await newSession(SECRET, A, 'android');
  r = await post(url, '/heart', { device: A, game, on: true }, { Authorization: 'Bearer ' + s.token }); assert.equal(r.status, 200);
  ok('a pass lifts the tight limit');
  r = await fetch(url + '/challenge', { headers: { 'CF-Connecting-IP': IP } }); assert.equal(r.status, 200);
  const { challenge } = await r.json();
  r = await post(url, '/session', { device: A, platform: 'android', challenge, token: 'x' }); assert.equal(r.status, 403);
  assert.match((await r.json()).reason, /not set up/);
  r = await post(url, '/session', { device: B, platform: 'android', challenge, token: 'x' }); assert.equal(r.status, 400);
  assert.match((await r.json()).error, /already used/, 'a challenge makes one pass at most');
  r = await fetch(url + '/challenge', { headers: { 'CF-Connecting-IP': IP } });
  r = await post(url, '/session', { device: A, platform: 'ios', challenge: (await r.json()).challenge, keyId: 'AAAA', attestation: 'AAAA' }); assert.equal(r.status, 403);
  r = await post(url, '/session', { device: A, platform: 'android', challenge: 'forged', token: 'x' }); assert.equal(r.status, 400);
  ok('passes need a real, unused challenge and a verified app');

  r = await post(url, '/stats', { device: A, games: { [game]: { v: 2, p: 1, k: 1, s: 30 } } }); assert.equal(r.status, 200);
  r = await post(url, '/stats', { device: A, games: { [game]: { v: 1, p: 0, k: 1, s: 0 } } }); assert.equal(r.status, 200);
  r = await fetch(url + '/stats'); assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).games[game], { v: 3, p: 1, k: 2, s: 30, wv: 3, wp: 1 });
  r = await post(url, '/stats', { device: A, games: 'x' }); assert.equal(r.status, 400);
  let lim = 0;
  for (let i = 0; i < 8 && !lim; i++) { r = await post(url, '/stats', { device: B, games: {} }); if (r.status === 429) lim = 1; }
  assert.ok(lim, 'stats batches are rate-limited');
  ok('play stats add up per game per day, and batches are rate-limited');

  const perfBody = { device: A, info: { platform: 'ios', model: 'iPhone17,1', os: 'iOS 26.1', app: 'test', form: 'phone' },
    games: { [game]: { r: 1, f: 1200, ms: 24000, w: 8000, sl: 60, h: 4, x: 180 } }, errors: [{ kind: 'error', game, msg: 'TypeError: boom', place: 'games/x.js:3', n: 2 }] };
  r = await post(url, '/perf', perfBody); assert.equal(r.status, 200);
  r = await post(url, '/perf', { ...perfBody, games: { [game]: { r: 1, f: 600, ms: 12000, w: 4000, sl: 0, h: 0, x: 300 } } }); assert.equal(r.status, 200);
  r = await fetch(url + '/perf'); assert.equal(r.status, 200);
  const pj = await r.json(), row = pj.games.find(x => x.game === game);
  assert.deepEqual({ rounds: row.rounds, frames: row.frames, slow: row.slow, worst: row.worst, fps: row.fps }, { rounds: 2, frames: 1800, slow: 60, worst: 300, fps: 50 });
  assert.equal(pj.errors.find(x => x.game === game && x.msg === 'TypeError: boom').n, 4);
  r = await fetch(url + '/perf/report'); assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/); assert.match(await r.text(), /TypeError: boom/);
  r = await post(url, '/perf', { device: A, games: 'x' }); assert.equal(r.status, 400);
  ok('perf reports add up per game and phone, and show on the report page');

  // When, and on which build: an old build reports an error, then a newer build plays the same game without it.
  const C = 'test-device-c-' + run_, other = { 'CF-Connecting-IP': IP + '.2' }, g2 = 'when-game-' + run_, phone = 'Fold-' + run_;
  const from = (app, errors = []) => ({ device: C, info: { platform: 'android', model: phone, os: 'Android 17', app, form: 'phone' }, games: { [g2]: { r: 1, f: 600, ms: 10000, w: 3000, sl: 6, h: 1, x: 90 } }, errors });
  const bug = [{ kind: 'error', game: g2, msg: 'TypeError: old bug', place: 'games/y.js:9' }];
  // this run's row: the local database keeps earlier runs' rows
  const errRow = async path => (await (await fetch(url + path)).text()).split('<tr>').find(row => row.includes(g2) && row.includes('TypeError: old bug'));
  r = await post(url, '/perf', from('1.0.1 aaaaaaa', bug), other); assert.equal(r.status, 200);
  assert.match(await errRow('/perf/report'), /Yes: on the newest build that phone has run/);
  await new Promise(done => setTimeout(done, 1100));   // times are kept to the second
  r = await post(url, '/perf', from('1.0.2 bbbbbbb'), other); assert.equal(r.status, 200);
  assert.match(await errRow('/perf/report'), /Probably not: 1 newer build has played it/);
  r = await fetch(url + '/perf/report?game=' + g2); assert.equal(r.status, 200);
  const hist = await r.text(), past = hist.slice(hist.indexOf('Smoothness by phone, day and build'));
  assert.ok(past.indexOf('1.0.2 ') > 0 && past.indexOf('1.0.2 ') < past.indexOf('1.0.1 '), 'a game\'s history lists the newest build first');
  assert.match(hist, /Probably not: 1 newer build has played it/); assert.match(hist, /commit\/bbbbbbb/); assert.ok(!hist.includes(game), 'one game\'s page shows only that game');
  await new Promise(done => setTimeout(done, 1100));
  r = await post(url, '/perf', from('1.0.2 bbbbbbb', bug), other); assert.equal(r.status, 200);
  assert.match(await errRow('/perf/report'), /Yes: on the newest build that phone has run/);
  assert.match(await errRow('/perf/report?game=' + g2), /Yes: on the newest build that ran this game on that phone/);
  r = await fetch(url + '/perf/report?game=Not%20a%20game'); assert.equal(r.status, 404);
  const main = await (await fetch(url + '/perf/report')).text();
  assert.match(main, new RegExp('<b>' + phone + '</b>')); assert.match(main, new RegExp('href="\\?game=' + g2 + '"'));
  ok('the report says when and on which build, whether an error is still happening, and has a page per game');
});

await run({ ENFORCE: 'on' }, async url => {
  let r = await post(url, '/heart', { device: A, game, on: true }); assert.equal(r.status, 401);
  const wrong = await newSession(SECRET, B, 'ios');
  r = await post(url, '/heart', { device: A, game, on: true }, { Authorization: 'Bearer ' + wrong.token }); assert.equal(r.status, 401);
  const s = await newSession(SECRET, A, 'ios');
  r = await post(url, '/heart', { device: A, game, on: true }, { Authorization: 'Bearer ' + s.token }); assert.equal(r.status, 200);
  r = await fetch(url + '/counts'); assert.equal(r.status, 200);
  r = await post(url, '/score', { device: A, game, score: 10, secs: 30 }); assert.equal(r.status, 401, 'scores need a pass too');
  r = await post(url, '/score', { device: A, game, score: 10, secs: 30 }, { Authorization: 'Bearer ' + wrong.token }); assert.equal(r.status, 401, '…for that device');
  ok('with ENFORCE on, hearts and scores need a pass for that device; counts stay public');
});

// play.game-scroll.com/<id>: the page a shared link opens, read from a live catalogue
{
  const catalogue = { v: 1, built: Date.now(), games: [
    { id: 'mini-golf', hash: 'abc123abc123', file: 'games/mini-golf.abc123abc123.js', bytes: 10, needs: {}, meta: { id: 'mini-golf', title: 'Mini Golf', tag: 'Pocket · Sport', hint: 'Putt it in.', w: 160, h: 160, goal: 9 } }] };
  let up = true;
  const host = createServer((req, res) => { res.writeHead(up ? 200 : 503, { 'Content-Type': 'application/json' }); res.end(up ? JSON.stringify(catalogue) : ''); });
  await new Promise(r => host.listen(0, '127.0.0.1', r));
  const vars = { MANIFEST_URL: `http://127.0.0.1:${host.address().port}/manifest.json`, WEB_PLAY_URL: 'https://x.test/' };
  await run(vars, async url => {
    let r = await fetch(url + '/mini-golf'), t = await r.text();
    assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(t, /<h1>Mini Golf<\/h1>/); assert.match(t, /<title>Mini Golf · Game Scroll<\/title>/); assert.match(t, /Putt it in\./);
    assert.match(t, /href="gamescroll:\/\/game\/mini-golf"/); assert.match(t, /href="https:\/\/x\.test\/\?g=mini-golf"/);
    r = await fetch(url + '/taken-down'); t = await r.text();
    assert.equal(r.status, 404); assert.match(t, /didn’t work/); assert.match(t, /href="https:\/\/x\.test\/"/); assert.ok(!t.includes('taken-down'));
    r = await fetch(url + '/'); assert.equal(r.status, 200); assert.match(await r.text(), /href="gamescroll:\/\/"/);
    r = await fetch(url + '/mini-golf', { method: 'POST' }); assert.equal(r.status, 405);
    ok('a shared link\'s page names the game and its buttons open that game; a game that has gone gets a page that leads to the feed');
  }, { hostname: 'play.game-scroll.com' });
  up = false;
  await run(vars, async url => {
    const r = await fetch(url + '/mini-golf'), t = await r.text();
    assert.equal(r.status, 200); assert.match(t, /href="gamescroll:\/\/game\/mini-golf"/); assert.match(t, /href="https:\/\/x\.test\/\?g=mini-golf"/);
    assert.ok(!/didn’t work/.test(t));
    ok('…and when the catalogue can\'t be read the buttons still open the shared game');
  }, { hostname: 'play.game-scroll.com' });
  host.close();
}

console.log('hearts worker: all checks passed');
