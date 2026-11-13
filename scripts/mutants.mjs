// Mutation check for the guards: puts one defect back at a time (skip the nonce check, accept a reused
// challenge, drop a licence entry...) and makes sure a test then fails. A guard whose test still
// passes with the defect in place isn't really tested, however green the check looks.
//   node scripts/mutants.mjs           worker and licence guards (needs `npm ci` in workers/hearts and
//                                      `npx wrangler d1 migrations apply game-scroll-hearts --local` there)
//   node scripts/mutants.mjs --all     also the signed catalogue (slow: builds the app; needs Playwright)
// Every file is put back in a finally, and checked afterwards, so a crash can't leave a mutant behind.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..'), HEARTS = join(ROOT, 'workers/hearts');
const worker = { cwd: HEARTS, cmd: ['node', 'test.mjs'], name: 'worker tests' };
const licences = { cwd: ROOT, cmd: ['node', 'scripts/licence-check.mjs'], name: 'licence check' };
const catalogue = { cwd: ROOT, cmd: ['node', 'scripts/catalogue-test.mjs'], name: 'catalogue test', slow: true };

// [what the defect does, file, text to change (must be there exactly once), what to put instead, test]
const MUTANTS = [
  ['Play Integrity: wrong nonce accepted', 'workers/hearts/src/playintegrity.js', "if (req.nonce !== challenge) fail('nonce mismatch');", '', worker],
  ['Play Integrity: unrecognised app accepted', 'workers/hearts/src/playintegrity.js', "if (!recognized && !(allowSideloaded && app.appRecognitionVerdict === 'UNRECOGNIZED_VERSION')) fail(", 'if (false) fail(', worker],
  ['Play Integrity: wrong package accepted', 'workers/hearts/src/playintegrity.js', "if (req.requestPackageName !== PACKAGE) fail('wrong package');", '', worker],
  ['App Attest: nonce not checked', 'workers/hearts/src/appattest.js', "if (!equal(extVal.subarray(extVal.length - 32), nonce)) fail('nonce mismatch');", '', worker],
  ['App Attest: first counter not checked', 'workers/hearts/src/appattest.js', "if (ad.counter !== 0) fail('counter not zero');", '', worker],
  ['App Attest: assertion signature not checked', 'workers/hearts/src/appattest.js', "derToRaw(obj.signature), nonce))) fail('bad signature');", "derToRaw(obj.signature), nonce))) {}", worker],
  ['pass: signature not checked', 'workers/hearts/src/session.js', "if (!equal(unb64(mac), await hmac(secret, 's:' + body))) return null;", '', worker],
  ['challenge: forged one accepted', 'workers/hearts/src/session.js', "if (!equal(mac, await hmac(secret, concat(enc.encode('c:'), body)))) return false;", '', worker],
  ['challenge: reused one accepted', 'workers/hearts/src/index.js', "if (!used.meta.changes) return json(req, { error: 'challenge already used' }, 400);", '', worker],
  ['ENFORCE: hearts without a pass accepted', 'workers/hearts/src/index.js', "else if (env.ENFORCE === 'on') return json(req, { error: 'app not verified', session: true }, 401);", '', worker],
  ['D1 reads: kept answers worked out again every time', 'workers/hearts/src/kept.js', 'if (row && row.at <= now && now - row.at < ttl * 1000) return { text: row.body, at: row.at };', '', worker],
  ['scores: too-short round accepted', 'workers/hearts/src/scores.js', "if (secs < MIN_SECS) return 'round too short';", '', worker],
  ['scores: round longer than the gap accepted', 'workers/hearts/src/scores.js', "if (last && now - last.at + SLACK_MS < secs * 1000) why =", 'if (false) why =', worker],
  ['scores: too-fast scoring accepted', 'workers/hearts/src/scores.js', "if (rate && score > rate * Math.max(secs, 1) + (goal || 0)) return 'scored too fast';", '', worker],
  ['licences: a dependency dropped from the list', 'src/licences.js', "{ name: 'Yuka', for: 'game AI', licence: 'MIT', spdx: 'MIT', packages: ['yuka'] },", '', licences],
  ['licences: a wrong licence listed', 'src/licences.js', "{ name: 'Yuka', for: 'game AI', licence: 'MIT', spdx: 'MIT',", "{ name: 'Yuka', for: 'game AI', licence: 'MIT', spdx: 'ISC',", licences],
  ['catalogue: signature not checked', 'src/remote.js', "const ok = await crypto.subtle.verify(", 'const ok = true || await crypto.subtle.verify(', catalogue],
];

const all = process.argv.includes('--all');
const run = t => spawnSync(t.cmd[0], t.cmd.slice(1), { cwd: t.cwd, encoding: 'utf8', timeout: 15 * 60000 });

// The tests must pass on the real code first, or a "caught" mutant would mean nothing.
const tests = [...new Set(MUTANTS.map(m => m[4]))].filter(t => all || !t.slow);
for (const t of tests) {
  const r = run(t);
  if (r.status !== 0) { console.error(`${t.name} fail without any mutant, fix that first:\n${(r.stdout + r.stderr).slice(-2000)}`); process.exit(1); }
}

const originals = new Map(), survived = [];
let tried = 0;
try {
  for (const [what, file, from, to, test] of MUTANTS) {
    if (test.slow && !all) continue;
    const path = join(ROOT, file), text = readFileSync(path, 'utf8');
    const n = text.split(from).length - 1;
    if (n !== 1) { console.error(`STALE  ${what}: "${from.slice(0, 60)}..." is in ${file} ${n} times (want 1); update scripts/mutants.mjs`); survived.push(what); continue; }
    originals.set(path, text);
    writeFileSync(path, text.replace(from, to));
    let r;
    try { r = run(test); } finally { writeFileSync(path, text); }
    tried++;
    if (r.status === 0) { survived.push(what); console.log(`MISSED ${what}  (${test.name} still pass)`); }
    else console.log(`caught ${what}`);
  }
} finally {
  for (const [path, text] of originals) if (readFileSync(path, 'utf8') !== text) writeFileSync(path, text);
}
console.log(survived.length ? `\n${survived.length} of ${tried} defects not caught: add a test that reaches each guard` : `\nall ${tried} defects caught`);
process.exit(survived.length ? 1 : 0);
