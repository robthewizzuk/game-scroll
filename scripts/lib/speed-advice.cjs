// What to do about each kind of speed problem, shared by the speed report (scripts/budget.cjs, a game run
// on this machine) and the frame lab reader (budget.cjs --lab, a recording from a phone), so a maker and their
// AI tool get the same advice from both.

// Draw calls and triangles a frame that each class of phone keeps up with at its target rate, with the rest of
// the frame left for effects. Estimates from the Fold and test-phone runs, not a measured rule: a guide.
const PHONES = {
  low: { calls: 150, tris: 150e3, label: 'low (older Android, Console games)' },
  mid: { calls: 300, tris: 400e3, label: 'mid (most phones in use)' },
  top: { calls: 600, tris: 1e6, label: 'top (Fold 8, recent iPhones)' },
};
const GARBAGE_MB_S = 4;   // garbage the game's own calls make a second (on the slowed CPU) before collections show as hitches on a phone

const ADVICE = {
  slow: 'Find the slowest lines (below) and do less there each frame: skip work for things off screen, look things up in a grid (gs.math.Grid) or Things.near instead of checking every pair, and keep heavy work (paths, searches, building) in reset() or spread over frames.',
  hitches: 'Something heavy runs now and then: a level built mid-round, a big sort or search, many things made at once. Spread the work over frames or do it in reset().',
  garbage: 'New arrays, objects, closures or strings every frame: the phone stops to clear them, a hitch. Reuse them: keep a list and empty it (list.length = 0), filter in place, keep vectors for maths, build strings only when they change.',
  leak: 'Something is kept every frame or round: arrays that only grow, listeners added in reset(), meshes made and never removed. Clear lists in reset() and make meshes once in make().',
  calls: 'Each separate mesh is a draw call. Put repeated things in one InstancedMesh or gs.props, join still scenery into one mesh per material (gs.tabletop fuse(), BufferGeometryUtils.mergeGeometries), share materials, and hide what is far or behind.',
  tris: 'Use fewer segments on spheres and cylinders far from the camera, LOD (gs.props simplify, three.js LOD), or let gs.hd detail draw big meshes only as finely as shows.',
  shaders: 'Each shader built mid-round is a hitch of tens of milliseconds on a phone. Make every material, light and effect the round uses in make() or reset() (or its first update), and show things hidden rather than adding new ones mid-round.',
  textures: 'Pictures sent to the graphics chip mid-round: make canvas textures and materials in make() or reset(), and update one texture rather than making new ones.',
  gpu: 'The graphics chip is the slow part: fewer lamps with shadows, smaller effects (bloom, ambient occlusion, volumetric beams, reflections), fewer see-through layers on top of each other, and fewer triangles. The quality steps lower the resolution by themselves; the game\'s own scene is what is left.',
  cpu: 'The game\'s update() and draw() take most of the frame: see the slowest lines from npm run speed on this game, and do less there each frame.',
  heat: 'The phone heated up and slowed its chips: the same work costs more each minute. Aim for frame time well under the budget (half is safe for long play) rather than just under it.',
  memory: 'The phone ran low on memory: fewer and smaller pictures, share geometry between copies, and free levels behind the player (gs.regions).',
};

// Advice from a frame lab recording on a phone: the Copy summary text, or the Report's HTML (its summary is in it).
function fromLab(text) {
  const m = /const D=(\{[\s\S]*?\});\s*\n/.exec(text);
  if (m) { try { text = JSON.parse(m[1]).summary || text; } catch (_) { /* fall back to the text */ } }
  const out = [], said = new Set(), add = (what, why, k = what) => { if (said.has(k)) return; said.add(k); out.push({ what, text: `${why} ${ADVICE[k] || ''}`.trim() }); };
  const num = (re, s = text) => { const x = re.exec(s); return x ? +x[1] : null; };
  const head = text.split('\n')[0] || '';
  const fps = num(/avg ([\d.]+) fps/), low1 = num(/1% low (\d+)/), worst = num(/worst (\d+) ms/), stutters = num(/(\d+) stutters/), game = num(/game (\d+) fps/) || 60;
  const beat = 1000 / game;
  const facts = [];
  if (fps != null) facts.push(`${fps} fps average of ${game} wanted, 1% low ${low1}, worst frame ${worst} ms, ${stutters} stutters`);
  const cpu = /CPU per frame in ms \(middle\/95%\): ([^\n]*)/.exec(text)?.[1] || '';
  const part = name => { const x = new RegExp(`\\b${name} ([\\d.]+)/([\\d.]+)`).exec(cpu); return x ? { mid: +x[1], p95: +x[2] } : null; };
  const upd = part('update'), drw = part('draw'), d3 = part('3D'), gpu = part('GPU');
  const game95 = (upd?.p95 || 0) + (drw?.p95 || 0) - (d3?.p95 || 0);
  if (upd || drw) facts.push(`game CPU ${game95.toFixed(1)} ms a frame at 95% (update ${upd?.p95 ?? '?'}, draw ${drw?.p95 ?? '?'}${d3 ? `, of which 3D render ${d3.p95}` : ''}) of a ${beat.toFixed(1)} ms beat`);
  if (gpu) facts.push(`graphics chip ${gpu.p95} ms at 95%`);
  if (game95 > beat * .6) add('game CPU', `The game's own code takes ${game95.toFixed(1)} of the ${beat.toFixed(1)} ms each frame has.`, 'cpu');
  if (gpu && gpu.p95 > beat * .9) add('graphics chip', `The chip takes ${gpu.p95} ms of the ${beat.toFixed(1)} ms each frame has.`, 'gpu');
  const draws = /(\d+) draws, (\d+)k triangles a frame/.exec(text);
  if (draws) {
    const calls = +draws[1], tris = +draws[2] * 1000;
    facts.push(`${calls} draws and ${draws[2]}k triangles a frame`);
    if (calls > PHONES.mid.calls) add('draw calls', `${calls} draw calls a frame, over the mid phone's ${PHONES.mid.calls}.`, 'calls');
    if (tris > PHONES.mid.tris) add('triangles', `${draws[2]}k triangles a frame, over the mid phone's ${PHONES.mid.tris / 1000}k.`, 'tris');
  }
  const causes = /Hitch causes: ([^\n]*)/.exec(text)?.[1] || '';
  for (const c of causes.split('; ').filter(Boolean)) {
    const n = +(/^(\d+)×/.exec(c)?.[1] || 0), w = /worst (\d+) ms/.exec(c)?.[1];
    const say = `${n} hitch${n === 1 ? '' : 'es'} from ${c.replace(/^\d+× /, '').replace(/ \(worst.*$/, '')}${w ? ` (worst ${w} ms)` : ''}.`;
    if (/shaders built|made again|effects chain/.test(c)) add('shaders in play', say, 'shaders');
    else if (/textures uploaded/.test(c)) add('pictures in play', say, 'textures');
    else if (/garbage collected/.test(c)) add('garbage', say, 'garbage');
    else if (/game CPU over the beat|most in /.test(c)) add('game CPU', say, 'cpu');
    else if (/GPU over the beat/.test(c)) add('graphics chip', say, 'gpu');
  }
  if (/Heat \w+ → hot/.test(text) || /CPU speed \d+% → ([0-6]\d|\d)%/.test(text)) add('heat', 'The phone got hot during the recording.', 'heat');
  if (/Memory \w+ → (low|critical)/i.test(text)) add('memory', 'The phone was low on memory.', 'memory');
  if (fps != null && fps < game * .9 && !out.length) add('frame rate', `${fps} fps of ${game}, with no single cause: try npm run speed on this game for the slowest lines.`, 'slow');
  return { title: head, facts, warnings: out };
}

module.exports = { PHONES, GARBAGE_MB_S, ADVICE, fromLab };
