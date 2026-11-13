// QA tools: rate games while scrolling, hide the ones you don't like, and see/copy a report.
//
// - Every slide gets a thumbs-down ("Meh") next to the heart. Meh hides that game from your
//   feed on this device and skips to the next one (with Undo).
// - Every finished round is logged (plays, total seconds, best), so the report shows which
//   games people actually stick with.
// - Tap the GAME SCROLL logo to open the QA panel: every game with your rating and play stats,
//   unhide buttons, "Copy report" to paste into chat, "Frame lab" (src/framelab.js) for frame
//   timing, hitch causes and picture checks over the game, and "Phone test tour" (src/tour.js): a bot
//   plays every 3D game on this phone and every native plugin is asked whether it answers.
// - BENCHED games are hidden for everyone (still in the code, waiting for a fix or a delete).
import { store } from './util.js';
import { progress } from './kit/progress.js';
import { playstats } from './playstats.js';
import { perf } from './perf.js';

/** Hidden from the feed for everyone. Add an id here to pull a game without deleting its file. */
// ar-lab is the native AR test scene: opened from Settings > AR test, never in the feed.
export const BENCHED = new Set(['ar-lab']);

const K = 'gs_qa';
let db = store.get(K, {});            // { [id]: { r: 1|-1|0, t: when r last changed, plays, secs } }
const save = () => store.set(K, db);
const row = id => (db[id] ||= { r: 0, t: 0, plays: 0, secs: 0 });

export const rating = id => db[id]?.r || 0;
export const stats = id => db[id] || { r: 0, t: 0, plays: 0, secs: 0 };
export function setRating(id, r) { const x = row(id); x.r = r; x.t = Date.now(); save(); }

/* ---------- sync without a server ----------
   ratingsSnapshot() is a small JSON-able object to put inside the player's cloud save
   (Game Center / Play Games saved games). mergeRatings() folds in a snapshot from another
   device: the newer rating per game wins, play counts take the max. Safe to call repeatedly. */
export const ratingsSnapshot = () => JSON.parse(JSON.stringify(db));
export function mergeRatings(other) {
  if (!other || typeof other !== 'object') return;
  for (const [id, o] of Object.entries(other)) {
    const x = row(id);
    if ((o.t || 0) > (x.t || 0)) { x.r = o.r || 0; x.t = o.t; }
    x.plays = Math.max(x.plays, o.plays || 0); x.secs = Math.max(x.secs, o.secs || 0);
  }
  save();
}
export const isHidden = id => BENCHED.has(id) || rating(id) === -1;
export function logRound(id, ms) { const x = row(id); x.plays++; x.secs = Math.round(x.secs + ms / 1000); save(); }

/* ---------- toast with undo ---------- */
let toastEl, toastT;
export function toast(msg, undo) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'qa-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
  toastEl.innerHTML = `<span>${msg}</span>${undo ? '<button>Undo</button>' : ''}`;
  if (undo) toastEl.querySelector('button').onclick = () => { undo(); toastEl.classList.remove('on'); };
  toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 3500);
}

/* ---------- everyone's play (anonymous stats, last 30 days) ---------- */
function everyone(id) {
  const c = playstats.global(id);
  if (!c || !c.v) return '';
  return `everyone: ${c.v} views, ${c.p} plays, ${Math.round(100 * c.k / c.v)}% quick skips, ${Math.round(c.s / c.v)}s/view`;
}

/* ---------- smoothness (anonymous perf reports, src/perf.js) ---------- */
const smooth = c => c && c.f >= 120 ? `${Math.round(1000 * c.f / c.ms)} fps, ${(100 * c.sl / c.f).toFixed(1)}% slow, ${c.h} freezes` : '';
/** Everyone's numbers for a game, all phones together, from GET /perf. */
function everyoneSmooth(id) {
  const rows = (perf.global?.games || []).filter(r => r.game === id);
  if (!rows.length) return '';
  const t = rows.reduce((a, r) => ({ f: a.f + r.frames, ms: a.ms + r.ms, sl: a.sl + r.slow, h: a.h + r.hitches }), { f: 0, ms: 0, sl: 0, h: 0 });
  return smooth(t);
}
function perfLine(id) {
  const mine = smooth(perf.local(id)), all = everyoneSmooth(id);
  return [mine && `this phone: ${mine}`, all && `everyone: ${all}`].filter(Boolean).join(' · ');
}
/** Report lines: worst games on this phone, everyone's worst game+phone rows, and errors/crashes. */
function perfReport(games) {
  const title = id => games.find(g => g.id === id)?.title || id || 'feed';
  const mine = games.map(g => [g, perf.local(g.id)]).filter(([, c]) => c && c.f >= 120).sort((a, b) => b[1].sl / b[1].f - a[1].sl / a[1].f).slice(0, 10);
  const all = (perf.global?.games || []).filter(r => r.frames >= 300).slice(0, 15);
  const errs = (perf.global?.errors || []).slice(0, 15);
  const i = perf.info();
  return [
    `\nSTUTTERS ON THIS PHONE (${i.model}, ${i.os || i.platform}, ${i.form} screen, build ${i.app}):`,
    ...(mine.length ? mine.map(([g, c]) => `${g.id} (${g.title}) · ${smooth(c)}, longest ${Math.round(c.x)} ms`) : ['none measured yet']),
    ...(perf.global ? [
      `\nSTUTTERS, EVERYONE (worst game + phone, last ${perf.global.days} days):`,
      ...(all.length ? all.map(r => `${r.game} (${title(r.game)}) on ${r.model} ${r.form} · ${r.fps} fps, ${(100 * r.slow / r.frames).toFixed(1)}% slow, ${r.hitches} freezes, longest ${r.worst} ms`) : ['none yet']),
      `\nCRASHES AND ERRORS, EVERYONE:`,
      ...(errs.length ? errs.map(e => `${e.kind} ×${e.n} · ${title(e.game)} · ${e.msg}${e.place ? ' @ ' + e.place : ''} · ${e.models} · ${e.apps}`) : ['none reported']),
      `Full table: ${perf.reportUrl}`,
    ] : []),
  ];
}

/* ---------- report ---------- */
export function report(games, best) {
  const line = g => { const x = db[g.id] || {}, e = everyone(g.id); return `${g.id} (${g.title})${x.plays ? ` · ${x.plays} plays, ${x.secs}s, best ${best(g.id)}` : ''}${e ? ` · ${e}` : ''}`; };
  const by = r => games.filter(g => rating(g.id) === r);
  const played = games.filter(g => !rating(g.id) && db[g.id]?.plays);
  return [
    `Game Scroll QA report · ${new Date().toISOString().slice(0, 10)} · ${games.length} games`,
    `\nMEH (${by(-1).length}):`, ...by(-1).map(line),
    `\nLIKED (${by(1).length}):`, ...by(1).map(line),
    `\nPLAYED, NOT RATED (${played.length}):`, ...played.sort((a, b) => db[b.id].secs - db[a.id].secs).map(line),
    `\nNOT PLAYED YET: ${games.filter(g => !db[g.id]?.plays && !rating(g.id)).length}`,
    ...perfReport(games),
    `\nMOST SKIPPED BY EVERYONE (20+ views):`, ...games.filter(g => (playstats.global(g.id)?.v || 0) >= 20)
      .sort((a, b) => playstats.global(b.id).k / playstats.global(b.id).v - playstats.global(a.id).k / playstats.global(a.id).v).slice(0, 15).map(line),
  ].join('\n');
}

/* ---------- panel ---------- */
export function openPanel(games, best, onChange) {
  perf.load();   // everyone's smoothness, fetched only here (the report copied below uses it once it is in)
  const el = document.createElement('dialog'); el.className = 'qa-panel';
  const rated = games.filter(g => rating(g.id)).length, played = games.filter(g => db[g.id]?.plays).length;
  const rows = [...games].sort((a, b) => rating(a.id) - rating(b.id) || a.title.localeCompare(b.title)).map(g => {
    const x = db[g.id] || {}, r = rating(g.id);
    return `<li data-id="${g.id}"><span class="qa-r">${BENCHED.has(g.id) ? '⏸' : r > 0 ? '♥' : r < 0 ? '👎' : '·'}</span>
      <span class="qa-t">${g.title}<small>${x.plays ? `${x.plays} plays · ${x.secs}s · best ${best(g.id)}` : 'not played'}${everyone(g.id) ? `<br>${everyone(g.id)}` : ''}${perfLine(g.id) ? `<br>${perfLine(g.id)}` : ''}</small></span>
      ${r < 0 ? '<button class="qa-un">Unhide</button>' : ''}</li>`;
  }).join('');
  el.innerHTML = `<div class="qa-head"><b>QA</b><span>${played}/${games.length} played · ${rated} rated</span><button class="qa-x" aria-label="Close">✕</button></div>
    <p class="qa-help">👎 Meh on a game hides it from your feed. Copy the report and paste it into chat to flag games for removal.</p>
    <div class="qa-actions"><button class="qa-copy">Copy report</button><button class="qa-lab">Frame lab</button><button class="qa-lab qa-tour">Phone test tour</button>${perf.reportUrl ? `<a class="qa-perf" href="${perf.reportUrl}" target="_blank" rel="noopener">Crashes &amp; stutters ↗</a>` : ''}</div>
    <ul>${rows}</ul>`;
  document.body.appendChild(el);
  el.querySelector('.qa-x').onclick = () => el.close();
  // Frame lab (src/framelab.js): frame timing, hitch causes and picture checks over the game, on or off
  el.querySelector('.qa-lab').onclick = () => { el.close(); dispatchEvent(new Event('gs-framelab')); };
  // Phone test tour (src/tour.js): a bot plays each 3D game here and the native plugins are checked; one report to copy
  el.querySelector('.qa-tour').onclick = () => { el.close(); dispatchEvent(new Event('gs-tour')); };
  el.addEventListener('close', () => el.remove());
  el.querySelector('.qa-copy').onclick = async e => {
    const txt = report(games, best);
    try { await navigator.clipboard.writeText(txt); e.target.textContent = 'Copied ✓'; }
    catch { const t = document.createElement('textarea'); t.value = txt; t.rows = 10; e.target.replaceWith(t); t.select(); }
  };
  el.querySelectorAll('.qa-un').forEach(b => b.onclick = () => { const id = b.closest('li').dataset.id; setRating(id, 0); b.closest('li').querySelector('.qa-r').textContent = '·'; b.remove(); onChange?.(); });
  el.showModal();
}

// Ride along in the Game Center / Play Games cloud save so hearts and Meh follow you between devices.
progress.section('ratings', { snapshot: ratingsSnapshot, merge: mergeRatings });
