// Door Committee: a Next Gen puzzle walk through the Hollowell Door Assurance Lab, a spotless test
// facility where every department of a game studio must sign off a door before it may ship. Each
// room is one department's idea of what a door should do, played for laughs: 26 rooms in four
// milestones (Concept, Alpha, Beta, Gold), then the door ships and the game ends. Nothing repeats.
// A round that runs out of time picks up again from the milestone it reached.
// Inspired by Liz England's essay "The Door Problem" (2014), in which every job on a game turns out
// to have its own questions about doors. Original facility, characters and lines.
//
// Tap the floor to walk (or hold and drag), tap a door to go to it. From the third room you carry
// the lab's one piece of equipment, a rubber doorstop: tap an open door to wedge it, and the wedge
// button calls it back. Keys: arrows walk, Space is the doorstop (and knocks on doors that want
// knocking), 1 and 2 answer a dialog box.
//
// The voices: four characters, each cast from the voices the phone has (gs.sound.say's `voice`), with
// the pauses written into the lines ("|" a beat, "||" a longer one). The Chair runs the meeting,
// Facilities owns the doorstop, the Door has a few lines of its own, and Monetisation and Marketing
// insist on reading their own memos. Every line is on screen too. In the apps each voice is also shaped
// (say's `size` and `fx`): the Chair comes over the building's tannoy, Facilities over his radio, the
// Door from inside the door, and Marketing as bright as an advert.
import gs from '../gamescroll.js';
const { sounds, sfx, noise, notes, say } = gs.sound;
const { haptic } = gs.device;
const { Juice } = gs.juice;
const { Keys } = gs.controls;
const { Ready } = gs.rounds;
const { NavGrid } = gs.ai;
const { HDView, Particles, pbr, rbox, surface, speckle, spot, THREE } = gs.hd;

let W = 300, H = 300;
const COLS = 11, ROWS = 9, MAXD = 6;
const MINT = '#3fe0b0', RED = '#ff4766', AMBER = '#ffb340', DULL = '#55606a', GOLD = '#ffd27a', SKY = '#9fc3ff', PINK = '#ff9fd0';
const wx = cx => cx - (COLS - 1) / 2, wz = cy => cy - (ROWS - 1) / 2;
const cxOf = x => Math.round(x + (COLS - 1) / 2), cyOf = z => Math.round(z + (ROWS - 1) / 2);

// ---------- the cast ----------
// size makes the same voice a bigger or smaller person, and fx is what it comes through. pitch is the
// pitch they are heard at: speak() asks the phone for it times their size and size brings it back down,
// so only the build of the voice changes, and a phone that can't shape a voice says the line as it always did
const CAST = {
  chair: { name: 'THE CHAIR', col: MINT, voice: { kind: 'woman', lang: 'en-GB' }, pitch: 1, rate: 1, size: 1, fx: 'tannoy' },
  norm: { name: 'FACILITIES', col: '#ffc23a', voice: { kind: 'man', lang: 'en-GB' }, pitch: .95, rate: .94, size: 1.08, fx: 'radio' },
  door: { name: 'THE DOOR', col: SKY, voice: { kind: 'man', lang: 'en-GB', take: 1 }, pitch: 1.1, rate: .84, size: 1.15, fx: { like: 'box', high: 2200 } },
  brand: { name: 'MARKETING', col: PINK, voice: { kind: 'woman', lang: ['en-US', 'en-GB'], take: 1 }, pitch: 1.07, rate: 1.14, size: .94, fx: 'bright' },
};
const SHAPES = typeof gs.sound.shaped === 'function';   // (an app from before voices could be shaped knows nothing of size: plain pitches there)
// each character's own little sound before they speak: the meeting-room chime, a radio click, a servo, a jingle
const CUES = {
  chair: () => notes('E5 C5', { len: .13, wave: 'sine', vol: .045 }),
  norm: () => noise(.06, { vol: .05, from: 2600, to: 1400, filter: 'bandpass', q: 3 }),
  door: () => sfx(180, .2, 'sine', .05, 70),
  brand: () => notes('E6 G6 B6', { len: .05, wave: 'triangle', vol: .035 }),
};

// ---------- the rooms: one department each ----------
// '#' wall, '.' floor, 'S' start, capital letters doors (specs below, E is the way out), k keycard, g gem,
// 1/2 robot stops, x y z floor plates, m the animator's mark, o a door that has left its frame
const R = '#.........#', TOP = '#####E#####', LOW = '#....S....#', END = '###########';
const PLAIN = [TOP, R, R, R, R, R, R, LOW, END];
const LANGS = [['German', 'AUSGANG'], ['French', 'SORTIE'], ['Spanish', 'SALIDA'], ['Italian', 'USCITA'], ['Dutch', 'UITGANG'], ['Welsh', 'ALLANFA'], ['Swedish', 'UTGÅNG'], ['Polish', 'WYJŚCIE']];
// the right answer first; the plates are shuffled
const RIDDLES = [
  { q: 'When is a door not a door?', a: ['WHEN IT IS AJAR', 'WHEN IT IS A WALL', 'ON TUESDAYS'], yes: 'Correct. | It is a pun. | I am told that is a kind of joke.' },
  { q: 'I have a handle but no hand, and a frame but no picture. | What am I?', a: ['A DOOR', 'A SAUCEPAN', 'A PAINTING'], yes: 'Correct. | I am a door. | It is nice to be noticed.' },
  { q: 'Knock, knock.', a: ["WHO'S THERE?", 'COME IN', 'NO THANK YOU'], yes: 'Nobody. | I am a door. | I do not know why I said that.' },
];
const ASKS = [
  { q: 'Open the door?', a: 'OPEN', b: 'CANCEL', ok: 'a' },
  { q: 'Are you sure?', a: 'CANCEL', b: 'OPEN', ok: 'b' },
  { q: 'Keep the door closed?', a: 'YES', b: 'NO', ok: 'b' },
];
const ROOMS = {
  creative: {
    dept: 'Creative Direction',
    memo: 'Item one. | The Creative Director has had a vision. | The game needs a door. || Tap the back wall where it should go.',
    done: 'Bold. | Visionary. | Rectangular.',
    map: [END, R, R, R, R, R, R, LOW, END], doors: {}, place: true,
  },
  level: {
    dept: 'Level Design',
    memo: 'Level Design have locked the door, and hidden the keycard somewhere | sensible.',
    done: 'The key was in a room. | With a door. | Level Design are very pleased with themselves.',
    map: [TOP, '#...#.....#', '#.k.#.....#', '#...A.....#', '#####.....#', R, R, LOW, END],
    doors: { E: { type: 'key', label: 'EXIT' }, A: { type: 'auto' } },
  },
  code: {
    dept: 'Gameplay Programming',
    memo: 'Programming made the door open when you are near it. | Nobody said which way round.',
    done: 'Programming have closed the ticket as | works as designed.',
    map: PLAIN, doors: { E: { type: 'shy', label: 'EXIT' } }, wedge: true,
  },
  ai: {
    dept: 'AI Programming',
    memo: 'A.I. Programming taught the door to recognise staff. | You are not staff. | You are a test.',
    done: 'The robot has filed a complaint about being followed.', after: ['norm', "His name's Keith."],
    map: [TOP, '#....2....#', R, '#####A#####', R, '#......1..#', R, LOW, END],
    doors: { E: { type: 'auto', label: 'EXIT' }, A: { type: 'staff', label: 'STAFF ONLY' } }, bot: 1.5,
  },
  art: {
    dept: 'Concept Art',
    memo: 'Concept Art have painted a stunning door. | Environment Art are still building the real one. || Somewhere.',
    done: 'Concept Art would like the real door to be | more heroic.',
    map: ['#####P#####', R, R, '#.........E', R, R, R, LOW, END],
    doors: { P: { type: 'paint', label: 'EXIT (CONCEPT)' }, E: { type: 'auto', dull: true } },
  },
  writing: {
    dept: 'Narrative',
    memo: 'Narrative have given the door a voice, a backstory, and a riddle. | Stand on the answer.',
    done: 'The backstory is forty pages long. | It has been minuted as | long.',
    map: [TOP, R, R, '#.x..y..z.#', R, R, R, LOW, END],
    doors: { E: { type: 'riddle', label: 'EXIT' } }, riddle: true,
  },
  money: {
    dept: 'Monetisation', by: 'brand',
    memo: 'Hi! Monetisation here! | Open this door right now for only five Door Gems! | Or wait twenty seconds, for free. | No pressure!',
    done: 'Thank you for your custom! | Please rate the door.',
    map: [TOP, '#g.......g#', '#..##.##..#', R, '#g.......g#', '#...#.#...#', '#....g....#', LOW, END],
    doors: { E: { type: 'pay' } },
  },
  sound: {
    dept: 'Sound Design',
    memo: 'Sound Design gave the door a lovely hum. | Lighting spent their whole budget on it. || Follow the hum.',
    done: 'Lighting would like you to know the dark was | intentional.',
    map: [END, R, R, R, R, R, R, LOW, END], doors: {}, dark: true,
  },
  anim: {
    dept: 'Animation',
    memo: 'Animation have motion captured the door opening. | It is very long, and it cannot be skipped. || Stand on the mark, and hold still.',
    done: 'And, scene. | Animation would like to go again, for safety.',
    map: [TOP, R, '#....m....#', R, R, R, R, LOW, END],
    doors: { E: { type: 'anim' } },
  },
  ui: {
    dept: 'User Interface',
    memo: 'User Interface have added a confirmation. | Walk up to the door, and read carefully.',
    done: 'User Interface are testing a version with four more dialogs.',
    map: PLAIN, doors: { E: { type: 'ui', label: 'EXIT' } },
  },
  net: {
    dept: 'Network Programming',
    memo: 'Netcode. | The door opens on the server. | Your screen finds out a second later. || Trust the sign, not the door.',
    done: 'Netcode report no complaints. | From players who could connect.',
    map: PLAIN, doors: { E: { type: 'lag' } },
  },
  qa: {
    dept: 'Quality Assurance',
    memo: 'QA must test this door before anyone may use it. | You are anyone. | Please help.',
    done: 'Bug filed. | Door has feelings. || Will not fix.',
    map: [TOP, R, R, '#####T#####', R, R, R, LOW, END],
    doors: { E: { type: 'qaexit', label: 'EXIT' }, T: { type: 'auto', label: 'TEST DOOR', qa: true } },
  },
  physics: {
    dept: 'Physics',
    memo: 'Physics have made the door a physics object. | It has left its frame. || Push it out of the way.',
    done: 'Physics describe the result as | emergent.',
    map: [TOP, R, R, '#####o#####', R, R, R, LOW, END],
    doors: { E: { type: 'auto', label: 'EXIT' } },
  },
  loc: {
    dept: 'Localisation',
    memo: 'Localisation have translated the exit sign. | And the cupboard signs. | The exit is the one in ',
    done: 'Localisation remind you that a cupboard is also a door. | Technically.',
    map: ['##A#B#C#D##', R, R, R, R, R, R, LOW, END],
    doors: { A: { type: 'loc' }, B: { type: 'loc' }, C: { type: 'loc' }, D: { type: 'loc' } }, loc: true,
  },
  music: {
    dept: 'Music',
    memo: 'The Composer has scored the door. | It only opens to its own tune. || Tap the door on four beats in a row.',
    done: 'The Composer has asked for a live orchestra. | Finance have left the meeting.',
    map: PLAIN, doors: { E: { type: 'beat' } },
  },
  combat: {
    dept: 'Combat Design',
    memo: 'Combat Design gave the door a health bar. | And a block. || Knock it down. Tap it when it is not blocking.',
    done: 'The door has been defeated. | Combat Design would like it to drop loot.', after: ['norm', "I'm not sweeping that up."],
    map: PLAIN, doors: { E: { type: 'hp' } },
  },
  legal: {
    dept: 'Legal',
    memo: 'Legal have found a very famous logo on the door. | Scrub it off before anybody notices. || Rub the door.',
    done: 'The door is now, legally, a door.',
    map: PLAIN, doors: { E: { type: 'legal', label: 'EXIT' } },
  },
  engine: {
    dept: 'Engine Programming',
    memo: 'To save memory, Engine Programming made both doors the same door. | They share one sensor. | It is on the first door.',
    done: 'Engine Programming saved four kilobytes. | They would like a parade.',
    map: [TOP, R, R, R, '#####A#####', R, R, LOW, END],
    doors: { E: { type: 'twin', label: 'EXIT' }, A: { type: 'twin', lead: true, label: 'DOOR (1)' } },
  },
  marketing: {
    dept: 'Marketing', by: 'brand',
    memo: "Marketing here! | We're filming the door for the trailer! | One take. No stopping. Don't bump the robot. || And, action!",
    done: "That's a wrap! | We'll add the explosions later.",
    map: [TOP, R, R, R, '#1.......2#', R, R, LOW, END],
    doors: { E: { type: 'auto', label: 'EXIT' } }, bot: 2.3, film: true,
  },
  analytics: {
    dept: 'Analytics',
    memo: 'Analytics found that players walk towards doors. | So, to raise engagement, | the door now walks away. || Pin it down.',
    done: 'Engagement is up four hundred percent. | Enjoyment was not measured.',
    map: [END, R, R, R, R, R, R, LOW, END], doors: {}, flee: true,
  },
  access: {
    dept: 'Accessibility',
    memo: 'Accessibility asked for a door that everybody can use. | It is wide. It opens by itself. It says what it is. || The committee could find nothing wrong with it. | We are unsettled.',
    done: 'A good door. | Minuted, with feeling.',
    map: ['####AEB####', R, R, R, R, R, R, LOW, END],
    doors: { E: { type: 'auto', wide: true, label: 'EXIT · THIS WAY' }, A: { type: 'wing' }, B: { type: 'wing' } },
  },
  merge: {
    dept: 'Build Engineering',
    memo: 'Two programmers each added a door. | The merge kept both. | In the same doorway.',
    done: 'The build is green. | Nobody knows why. | Nobody is to touch anything.',
    map: PLAIN, doors: { E: { type: 'merge', label: 'EXIT (MERGED)' } },
  },
  players: {
    dept: 'Community',
    memo: 'Players found they can skip this door by walking through the wall. | A fix is planned. || Until then, the door stays locked.',
    done: 'The committee did not see that. | Community are calling it a | feature.',
    map: PLAIN, doors: { E: { type: 'never', label: 'EXIT · LOCKED' }, G: { type: 'clip' } }, clip: true,
  },
  exec: {
    dept: 'The Directors',
    memo: 'The directors must all approve the door, at the same time. | They do not agree on anything. || Stand on the plates until all three are lit.',
    done: 'Unanimous. | We will not be asking how.',
    map: [TOP, R, R, R, '#..x.y.z..#', R, R, LOW, END],
    doors: { E: { type: 'exec', label: 'EXIT' } }, exec: true,
  },
  cut: {
    dept: 'Production',
    memo: 'Production have cut this door for scope. || Please enjoy the hole.',
    done: 'Ship it.',
    map: [TOP, R, R, '#..##.##..#', R, R, R, LOW, END],
    doors: { E: { type: 'cut' } },
  },
  ship: {
    dept: 'Launch',
    memo: 'This is the door. | Every department has signed it. | It opens. | It closes. || Go on.',
    done: 'Goodbye. | Mind the step.',
    map: PLAIN, doors: { E: { type: 'auto', label: 'THE DOOR' } },
  },
};
// the project plan: four milestones, each a checkpoint
const PLAN = [
  { name: 'Concept', rooms: ['creative', 'level', 'code', 'ai', 'art', 'writing'], done: 'Concept is signed off. | Six doors, and nobody cried. | The committee is cautiously suspicious.' },
  { name: 'Alpha', rooms: ['money', 'sound', 'anim', 'ui', 'net', 'qa', 'physics'], done: 'Alpha is signed off. | Thirteen doors. | I have stopped sleeping, which helps.' },
  { name: 'Beta', rooms: ['loc', 'music', 'combat', 'legal', 'engine', 'marketing', 'analytics'], done: 'Beta is signed off. | Twenty doors. | Somebody has brought biscuits. | I am choosing to see that as a sign.' },
  { name: 'Gold', rooms: ['access', 'merge', 'players', 'exec', 'cut', 'ship'] },
];
const ALL = PLAN.flatMap(m => m.rooms), FIRST = PLAN.map(m => ALL.indexOf(m.rooms[0]));
const WEDGE_FROM = ALL.indexOf('code');

// remarks: [who, line], said in order each time the same thing happens (the last one repeats)
const QUIPS = {
  key: [['chair', 'Locked. | Level Design are thrilled you noticed.'], ['chair', 'Still locked. | The keycard is in the little room.']],
  shy: [['chair', 'It closes when you come near. | Programming call that | realistic.'], ['norm', "Use the doorstop. | Tap the door while it's open."]],
  staff: [['chair', 'Staff only. | The door can tell.'], ['norm', "Follow Keith. | He's got the right face."]],
  paint: [['chair', 'That is a painting of a door. | It is very good.'], ['chair', 'Still a painting. | The real door is the dull one on the right.'], ['chair', 'You have walked into art. | Art won.']],
  pay: [['brand', 'Not enough Door Gems! | Have you thought about waiting?']],
  qaexit: [['chair', 'Locked until QA have finished with the other door.']],
  legal: [['chair', 'Legal hold. | Rub the logo off first.']],
  riddle: [['door', 'I am not opening until somebody answers my riddle. | Stand on a plate.']],
  anim: [['chair', 'It is mid-rehearsal. | Stand on the mark.']],
  ui: [['chair', 'It would like an answer first.']],
  lag: [['chair', 'Shut. | On the server, at least. | Watch the sign.']],
  beat: [['chair', 'It wants knocking in time. | Tap it on the beat.']],
  hp: [['chair', 'It still has health. | Keep tapping it.']],
  merge: [['chair', 'Both doors must be open at once. | Programmers call that a race.'], ['norm', 'Wedge one of them. | Then wait for the other.']],
  never: [['chair', 'Locked. | The fix is in the next patch.'], ['chair', 'Still locked. | Players went through the wall. | I am not suggesting anything.']],
  exec: [['chair', 'Not until all three directors agree.']],
  twin: [['chair', 'It shut when the first one shut. | They are the same door.'], ['norm', 'Wedge the first one, mate.']],
  auto: [['chair', 'The door did not open in time. | It has been spoken to.']],
  loc: [['norm', "That's my mop."], ['norm', "That's my other mop."], ['norm', 'I only had the two mops.']],
  slabStuck: [['norm', "It's wedged. | Funny, that."], ['norm', 'Try it from the side.']],
  wedgePaint: [['norm', "You can't wedge a painting, mate. | I've tried."]],
  wedgeShut: [['norm', "Wedges go in open doors. | That's the whole idea."]],
  wedgeLag: [['norm', 'It only looks open. | Watch the sign.']],
  wedgeLate: [['norm', 'Too slow. | It needs a gap.']],
  wedgeIn: [['chair', 'Wedged. | Programming call that | an edge case.'], null],
  issued: [['norm', 'Facilities. | Here is one doorstop. Rubber. | Tap an open door to wedge it. || I want it back.']],
  offBeat: [['chair', 'Off the beat. | The Composer is wincing.'], null, ['chair', 'The Composer has left the room.'], null],
  retake: [['chair', 'From the top.'], ['chair', 'And again. | With feeling.'], ['chair', 'Take four. | Animation have all day. | We do not.']],
  wrong: [['door', 'No. | I had hoped for more.'], ['door', 'Arguably. | But no.'], ['door', 'Incorrect. | I do admire the confidence.']],
  cancel: [['chair', 'Cancelled. | It will ask again. | It always asks again.'], null],
  pinned: [['norm', 'Got it.']],
  cutStop: [['brand', "Cut! | You stopped. | Heroes don't stop!"]],
  cutBot: [['brand', 'Cut! | Keith was in the shot!']],
  cutBonk: [['brand', 'Cut! | We can not use that!']],
  bonks: [['norm', 'Doors open easier than they break, mate.'], null],
  idle: [['chair', 'Take your time. | It is only the schedule.'], ['chair', 'The door will not sign itself off.'], null],
  low: [['chair', 'Ten seconds. | The committee are putting their coats on.'], ['chair', 'Ten seconds.']],
  quick: [['chair', 'Suspiciously efficient.'], null, null],
};
const TIME_UP = ['Time. | The committee will reconvene.', 'We are out of time. | We are always out of time.', 'Meeting adjourned. | The door remains a draft.'];

// ---------- 3D: built once per game module ----------
let v, light, lamp, walls, lows, bases, floorM, voidM, doorPool, painting, player, visor, bot, beacon, brush, keycard, gems, wedgeM, mop, sparks, matCache,
  plateM, slabM, glitchM, glitchMats;
function setup() {
  v = new HDView({ bg: '#0d1115', fog: 0, env: .3, sky: '#eef6ff', ground: '#3a4148', amb: .22, fov: 40 });
  v.exposure = .9;
  v.cam.near = .3; v.cam.far = 80; v.cam.updateProjectionMatrix();
  light = spot('#fffaf2', 14, 34, .62); light.position.set(0, 13, 4); light.target.position.set(0, 0, -.3); v.scene.add(light, light.target);
  v.onTier(T => light.setTier(T));
  lamp = new THREE.PointLight('#bff8e6', 1.2, 5, 1.6); v.scene.add(lamp);

  const tiles = surface(256, ({ col, h, r, size: S }) => {
    col.fillStyle = '#a9b3ba'; col.fillRect(0, 0, S, S); speckle(col, S, 400, '#929ca4', 1.2, .25);
    col.fillStyle = '#6c7780'; col.fillRect(0, 0, S, 5); col.fillRect(0, 0, 5, S);
    h.fillStyle = '#000'; h.fillRect(0, 0, S, 5); h.fillRect(0, 0, 5, S);
    r.fillStyle = '#555'; r.fillRect(8, 8, S - 16, S - 16);
  });
  const panel = surface(256, ({ col, h, size: S }) => {
    col.fillStyle = '#dde2e5'; col.fillRect(0, 0, S, S); speckle(col, S, 200, '#c5ccd1', 1, .2);
    col.fillStyle = '#c7cfd4'; col.fillRect(0, S * .55, S, 3); col.fillRect(0, 0, 3, S);
    h.fillStyle = '#000'; h.fillRect(0, S * .55, S, 3); h.fillRect(0, 0, 3, S);
    col.fillStyle = '#aab3b9'; for (const [x, y] of [[20, 20], [S - 20, 20], [20, S - 20], [S - 20, S - 20]]) { col.beginPath(); col.arc(x, y, 3, 0, 7); col.fill(); }
  });
  const wallMat = pbr('#ffffff', { tex: panel, rough: .4, metal: .05 });
  floorM = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), pbr('#ffffff', { tex: tiles, rep: [COLS, ROWS], rough: .3, metal: .05 }));
  floorM.rotation.x = -Math.PI / 2; floorM.receiveShadow = true; v.scene.add(floorM);
  voidM = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), pbr('#151a1f', { rough: .85 })); voidM.rotation.x = -Math.PI / 2; voidM.position.y = -.02; v.scene.add(voidM);
  walls = new THREE.InstancedMesh(rbox(1, 1.5, 1, .05), wallMat, COLS * ROWS); walls.castShadow = walls.receiveShadow = true; v.scene.add(walls);
  lows = new THREE.InstancedMesh(rbox(1, .3, 1, .05), wallMat, COLS * 2); lows.receiveShadow = true; v.scene.add(lows);
  bases = new THREE.InstancedMesh(new THREE.BoxGeometry(1.02, .05, 1.02), pbr(MINT, { glow: 1.8 }), COLS * ROWS); v.scene.add(bases);

  // doors: frame, sliding panel and a status light front and back; a second panel for the merged
  // door, and a dark doorway behind for the door that hangs on the wall
  const frameMat = pbr('#59646d', { rough: .3, metal: .6 }), panelMat = pbr('#2e373e', { rough: .3, metal: .5, clear: .6 });
  const stripeMat = pbr(MINT, { glow: 1.2, rough: .4 }), stripe2 = pbr(AMBER, { glow: 1.2, rough: .4 }), dark = pbr('#05070a', { rough: 1 });
  doorPool = [];
  for (let i = 0; i < MAXD; i++) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.07, 1.5, .34), frameMat); p.position.set(s * .465, .75, 0); p.castShadow = true; g.add(p); }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1, .24, .34), frameMat); lintel.position.y = 1.38; g.add(lintel);
    const lightMat = pbr('#ffffff', { glow: 2.2, glowCol: MINT });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(.7, .09, .37), lightMat); strip.position.y = 1.37; g.add(strip);
    const slide = new THREE.Group(); g.add(slide);
    const pn = new THREE.Mesh(rbox(.86, 1.25, .1, .03), panelMat); pn.position.y = .63; pn.castShadow = true; slide.add(pn);
    const st = new THREE.Mesh(new THREE.BoxGeometry(.87, .08, .11), stripeMat); st.position.y = .7; slide.add(st);
    const slide2 = new THREE.Group(); slide2.visible = false; g.add(slide2);
    const pn2 = new THREE.Mesh(rbox(.86, 1.25, .1, .03), panelMat); pn2.position.set(0, .63, -.11); slide2.add(pn2);
    const st2 = new THREE.Mesh(new THREE.BoxGeometry(.87, .08, .11), stripe2); st2.position.set(0, .7, -.11); slide2.add(st2);
    const back = new THREE.Mesh(new THREE.BoxGeometry(.86, 1.26, .03), dark); back.position.set(0, .63, -.13); back.visible = false; g.add(back);
    g.visible = false; v.scene.add(g);
    doorPool.push({ g, slide, slide2, back, lightMat });
  }
  // the painted door: gilded frame and an impossibly heroic glowing arch
  painting = new THREE.Group();
  const gold = pbr('#d8a640', { rough: .25, metal: 1 });
  const fr = new THREE.Mesh(rbox(1.3, 1.5, .14, .05), gold); fr.position.y = .75; painting.add(fr);
  for (const [x, y] of [[-.62, 1.47], [.62, 1.47], [-.62, .03], [.62, .03]]) { const orn = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), gold); orn.position.set(x, y, .06); painting.add(orn); }
  const canvasM = new THREE.Mesh(new THREE.BoxGeometry(1.08, 1.28, .04), pbr('#173b4a', { rough: .7 })); canvasM.position.set(0, .72, .05); painting.add(canvasM);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(.32, .045, 8, 24, Math.PI), pbr('#ffd27a', { glow: 3 })); arch.position.set(0, .92, .08); painting.add(arch);
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.09, .62, .03), pbr('#ffd27a', { glow: 3 })); leg.position.set(s * .32, .61, .08); painting.add(leg); }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.04, 10, 8), gold); knob.position.set(.18, .62, .1); painting.add(knob);
  painting.visible = false; v.scene.add(painting);

  // the test walker
  player = new THREE.Group(); player.userData.noHold = true;
  const suit = pbr('#f4f6f8', { rough: .35, clear: .4 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .42, 6, 14), suit); body.position.y = .45; body.castShadow = true; player.add(body);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(.215, .215, .05, 18), pbr(MINT, { glow: 1.6 })); belt.position.y = .42; player.add(belt);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 18, 12), suit); head.position.y = .93; head.castShadow = true; player.add(head);
  visor = new THREE.Mesh(new THREE.BoxGeometry(.24, .08, .1), pbr(MINT, { glow: 2.6 })); visor.position.set(0, .95, .12); player.add(visor);
  player.scale.setScalar(1.3); v.scene.add(player);
  // the custodial robot (staff; Facilities call him Keith)
  bot = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(.28, .32, .3, 20), pbr('#f0b43c', { rough: .35, clear: .5 })); shell.position.y = .2; shell.castShadow = true; bot.add(shell);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), pbr('#e9eef1', { rough: .2, metal: .3 })); dome.position.y = .35; bot.add(dome);
  beacon = new THREE.Mesh(new THREE.SphereGeometry(.06, 10, 8), pbr(AMBER, { glow: 4 })); beacon.position.y = .56; bot.add(beacon);
  brush = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .04, 8), pbr('#39424a', { rough: .9 })); brush.position.set(0, .03, .2); bot.add(brush);
  bot.visible = false; v.scene.add(bot);
  // keycard on a pedestal, door gems, the doorstop and a mop for the cupboards
  keycard = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, .55, 16), pbr('#dfe4e7', { rough: .3 })); ped.position.y = .27; ped.castShadow = true; keycard.add(ped);
  const card = new THREE.Mesh(rbox(.3, .03, .2, .01), pbr(MINT, { glow: 2.4 })); card.position.y = .7; card.name = 'card'; keycard.add(card);
  keycard.visible = false; v.scene.add(keycard);
  const gemMat = pbr('#ff4fa3', { glow: 2.6, rough: .15 });
  gems = []; for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(.15), gemMat); m.castShadow = true; m.visible = false; v.scene.add(m); gems.push(m); }
  wedgeM = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .14, 3), pbr('#ffc23a', { rough: .6, glow: .25 })); wedgeM.rotation.x = Math.PI / 2; wedgeM.castShadow = true; wedgeM.visible = false; v.scene.add(wedgeM);
  mop = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.2, 6), pbr('#c98a4b', { rough: .7 })); stick.position.y = .6; mop.add(stick);
  const mh = new THREE.Mesh(new THREE.BoxGeometry(.3, .12, .14), pbr('#d8dde0', { rough: 1 })); mh.position.y = .04; mop.add(mh);
  mop.visible = false; v.scene.add(mop);
  // floor plates (answers, the animator's mark, the directors), the door that left its frame, and a wall that isn't all there
  plateM = [];
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(.84, .04, .84), pbr('#2a3138', { glow: 1.5, glowCol: MINT, rough: .5 })); m.position.y = .025; m.visible = false; v.scene.add(m); plateM.push(m); }
  slabM = new THREE.Group();
  const sp = new THREE.Mesh(rbox(.86, 1.25, .1, .03), panelMat); sp.position.y = .63; sp.castShadow = true; slabM.add(sp);
  const ss = new THREE.Mesh(new THREE.BoxGeometry(.87, .08, .11), stripeMat); ss.position.y = .7; slabM.add(ss);
  slabM.visible = false; v.scene.add(slabM);
  glitchMats = [wallMat, pbr('#ff3df0', { glow: 1.6, rough: .8 }), pbr('#101418', { rough: .9 })];
  glitchM = new THREE.Mesh(rbox(1, 1.5, 1, .05), wallMat); glitchM.visible = false; v.scene.add(glitchM);
  sparks = new Particles(v, { max: 500, additive: true });
  matCache = { mint: new THREE.Color(MINT), red: new THREE.Color(RED), amber: new THREE.Color(AMBER), dull: new THREE.Color(DULL), gold: new THREE.Color(GOLD), sky: new THREE.Color(SKY) };
}

// word wrap for the memo panel
function wrap(c, text, maxW) {
  const out = []; let line = '';
  for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out;
}
// a line as written ("Bold. | Visionary. || Rectangular.") for the screen, and for speaking: parts with pauses
const flat = s => s.replace(/\s*\|+\s*/g, ' ');
function parts(s) {
  const out = [];
  for (const bit of s.split(/(\|\|?)/)) {
    if (bit === '|') out.push(.24); else if (bit === '||') out.push(.55);
    else if (bit.trim()) out.push(bit.trim().replace(/\bQA\b/g, 'Q A').replace(/\bDOOR\.EXE\b/g, 'door dot E X E'));
  }
  return out;
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

function make(api) {
  const fx = new Juice(), keys = new Keys(), ready = new Ready({ eat: false });   // the clock waits for the first touch, which also acts
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmp = new THREE.Vector3();
  let room, roomKey, idx, grid, nav, doors, P, B, items, score, time, t, roomT, hasKey, gemsGot, payT, scrub, qa, wedge,
    memo, memoT, quip, quipT, quipWho, quipTag, stamp, stampT, fade, leaving, nextT, path, waitT, bonkT, humT, langPick, ended, ptr, warnT, camLook,
    prog, voice, idleT, counts, plates, slab, riddle, anim, ui, beat, exec, film, fin, endT, banner, startAt, bonks, lowSaid;

  const cellAt = (cx, cy) => (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) ? '#' : grid[cy][cx];
  const doorAt = (cx, cy) => doors.find(d => d.cx === cx && d.cy === cy);
  const gap = d => d.type === 'merge' ? Math.min(d.o, d.o2) : d.o;   // how open the way through is
  const blocked = (cx, cy, who = P) => {
    const ch = cellAt(cx, cy);
    if (ch === '#') return true;
    const d = doorAt(cx, cy); if (!d) return false;
    if (d.type === 'paint') return true;
    return who === P ? gap(d) < .75 : gap(d) < .6;
  };

  // ---------- talking: every line is shown, and said by its character when nothing more important is being said ----------
  const showQuip = (s, sec = 2.6, who = null) => { quip = flat(s); quipT = sec; quipWho = who; quipTag = who === 'brand' && room.by === 'brand' ? room.dept.toUpperCase() : who ? CAST[who].name : null; };
  const quiet = () => !voice.q.length && !(voice.now && t < voice.until);   // nobody is talking, or waiting to
  function speak(who, line, pri = 1, after = false, show = 0) {
    if (voice.hold || (voice.now && t < voice.until && (after || pri < voice.pri))) {
      if (after || voice.hold) voice.q.push([who, line, pri, false, show]);
      return;
    }
    const c = CAST[who], mine = {}, at = t, read = 1.2 + line.length * .04;
    voice.now = mine; voice.pri = pri; voice.until = t + 2.5 + line.length * .11 / c.rate;
    if (show) showQuip(line, show, who);
    CUES[who]();
    say([.2, ...parts(line)], { voice: c.voice, pitch: c.pitch * (SHAPES ? c.size : 1), rate: c.rate, volume: .9, size: c.size, fx: c.fx })
      .then(ok => { if (voice.now === mine) voice.until = Math.min(voice.until, ok ? t + .3 : at + read); });   // no voice here: leave time to read it
  }
  /** A remark: on screen now (or when its turn comes, for after), and out loud. */
  function tell(who, line, { sec = 2.6, pri = 1, after = false } = {}) {
    if (after) return speak(who, line, pri, true, sec);
    showQuip(line, sec, who); speak(who, line, pri);
  }
  // the next remark of a kind: they are said in order, and the last one repeats (null: nothing more to say)
  function remark(kind, o) {
    const l = QUIPS[kind] || QUIPS.auto, i = counts[kind] = (counts[kind] || 0) + 1, q = l[Math.min(i, l.length) - 1];
    if (q) tell(q[0], q[1], o);
    return !!q;
  }

  function locked(d) {
    switch (d.type) {
      case 'key': return !hasKey;
      case 'staff': case 'paint': case 'never': return true;
      case 'pay': return gemsGot < 5 && payT > 0;
      case 'qaexit': return !qa.done;
      case 'legal': return scrub < 1;
      case 'riddle': return !riddle.solved;
      case 'anim': return anim.p < 1;
      case 'ui': return ui.stage < ASKS.length;
      case 'beat': return beat.n < 4;
      case 'hp': return d.hp > 0;
      case 'exec': return !exec.done;
      default: return false;
    }
  }
  function wantOpen(d) {
    if (d.type === 'cut' || d.type === 'clip' || d.type === 'flee' || d.wedged) return true;
    const pd = Math.hypot(P.x - d.x, P.z - d.z), bd = B.on ? Math.hypot(B.x - d.x, B.z - d.z) : 99;
    const inCell = cxOf(P.x) === d.cx && cyOf(P.z) === d.cy;
    switch (d.type) {
      case 'shy': return pd > 3.6 || (inCell && d.o > .5);
      case 'staff': return bd < 1.5 || (inCell && d.o > .5);
      case 'loc': return d.real ? pd < 1.6 : d.cupT > 0;
      case 'paint': case 'never': return false;
      case 'anim': return anim.p >= 1;
      case 'lag': return roomT % 3 < 1.3 || (inCell && d.o > .5);
      case 'twin': return doors.some(x => x.type === 'twin' && (x.wedged || (x.lead && Math.hypot(P.x - x.x, P.z - x.z) < 1.6))) || (inCell && d.o > .5);
      default: return !locked(d) && (pd < (d.wide ? 2.5 : 1.6) || bd < 1.4 || inCell);
    }
  }

  function placeDoor(i, ch, cx, cy, spec) {
    const pool = doorPool[i];
    const d = { ch, cx, cy, x: wx(cx), z: wz(cy), o: 0, o2: 0, vis: 0, wedged: false, cupT: 0, sq: 0, ...spec, pool };
    // which way the wall runs through the door
    const solid = c => c !== '.';
    const along = solid(cellAt(cx - 1, cy)) && solid(cellAt(cx + 1, cy));
    d.rot = along ? 0 : Math.PI / 2;
    d.out = [cx === 0 ? -1 : cx === COLS - 1 ? 1 : 0, cy === 0 ? -1 : cy === ROWS - 1 ? 1 : 0];
    pool.slide.position.x = 0; pool.slide.rotation.x = 0; pool.slide2.position.x = 0;
    pool.slide2.visible = d.type === 'merge'; pool.back.visible = d.type === 'flee'; pool.g.scale.set(d.wide ? 3 : 1, 1, 1);
    if (d.type === 'paint') {
      pool.g.visible = false;
      painting.visible = true; painting.position.set(d.x, 0, d.z + .52); painting.rotation.y = 0;
    } else {
      pool.g.visible = d.type !== 'cut' && d.type !== 'wing' && d.type !== 'clip';
      pool.g.position.set(d.x, 0, d.z); pool.g.rotation.y = d.rot;
    }
    if (d.type === 'hp') d.hp = 12;
    if (d.type === 'lag') d.hist = [];
    if (d.type === 'clip') { d.o = 1; glitchM.visible = true; glitchM.position.set(d.x, .75, d.z); }
    return d;
  }

  function loadRoom(key) {
    roomKey = key; room = ROOMS[key];
    grid = room.map.map(r => r.split(''));
    doors = []; items = []; plates = []; slab = null; hasKey = false; gemsGot = 0; payT = 20; scrub = 0; humT = 0;
    qa = { side: 's', cross: 0, stood: 0, done: false, gag: 0 };
    riddle = { solved: false, q: '', right: -1 }; anim = { p: 0, take: 1 }; ui = { stage: 0, open: false };
    beat = { n: 0, last: -9, tick: -1 }; exec = { on: [true, false, true], done: false }; film = { take: 1, rolling: false, still: 0, cutT: 0 };
    bonks = 0; idleT = 0;
    for (const p of doorPool) p.g.visible = false;
    for (const m of plateM) m.visible = false;
    painting.visible = false; keycard.visible = false; keycard.getObjectByName('card').visible = true; mop.visible = false; gems.forEach(g => g.visible = false);
    slabM.visible = false; glitchM.visible = false;
    B = { on: !!room.bot, speed: room.bot || 1.5, x: 0, z: 0, stops: [], at: 0, wait: 1, path: null };
    if (room.dark) {   // the hum comes from a door somewhere on the walls
      const spots = [];
      for (let x = 2; x <= COLS - 3; x++) spots.push([x, 0]);
      for (let y = 1; y <= 5; y++) spots.push([0, y], [COLS - 1, y]);
      const [cx, cy] = spots[(Math.random() * spots.length) | 0]; grid[cy][cx] = 'E';
    }
    if (room.clip) {   // the wall players walk through: somewhere that is not the door
      const [cx, cy] = [[8, 0], [2, 0], [0, 3], [COLS - 1, 3], [0, 5], [COLS - 1, 5]][(Math.random() * 6) | 0]; grid[cy][cx] = 'G';
    }
    let gi = 0, di = 0;
    langPick = null;
    if (room.loc) {
      const pool = LANGS.slice().sort(() => Math.random() - .5).slice(0, 4);
      langPick = (Math.random() * 4) | 0;
      'ABCD'.split('').forEach((L, i) => { room.doors[L].word = pool[i][1]; room.doors[L].lang = pool[i][0]; room.doors[L].real = i === langPick; });
      langPick = pool[langPick][0];
    }
    for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
      const ch = grid[cy][cx];
      if (ch === 'S') { P = { x: wx(cx), z: wz(cy), face: Math.PI }; startAt = { x: P.x, z: P.z }; grid[cy][cx] = '.'; }
      else if (ch === 'k') { keycard.visible = true; keycard.position.set(wx(cx), 0, wz(cy)); items.push({ kind: 'key', x: wx(cx), z: wz(cy) }); grid[cy][cx] = '.'; }
      else if (ch === 'g') { const m = gems[gi++]; m.visible = true; m.position.set(wx(cx), .5, wz(cy)); items.push({ kind: 'gem', x: wx(cx), z: wz(cy), m }); grid[cy][cx] = '.'; }
      else if (ch === '1' || ch === '2') { B.stops[+ch - 1] = { x: wx(cx), z: wz(cy) }; grid[cy][cx] = '.'; }
      else if (ch === 'x' || ch === 'y' || ch === 'z' || ch === 'm') {
        const i = plates.length, m = plateM[i]; m.visible = true; m.position.set(wx(cx), .025, wz(cy));
        plates.push({ i, cx, cy, x: wx(cx), z: wz(cy), m, mark: ch === 'm', dwell: 0, fired: false, flash: 0, label: '' }); grid[cy][cx] = '.';
      } else if (ch === 'o') { slab = { cx, cy, x: wx(cx), z: wz(cy), spin: 0 }; slabM.visible = true; grid[cy][cx] = '.'; }
      else if (/[A-Z]/.test(ch) && di < MAXD) {
        const spec = room.doors[ch] || { type: 'auto' };
        const d = placeDoor(di++, ch, cx, cy, { ...spec, exit: ch === 'E' || spec.type === 'wing' || spec.type === 'clip' || (room.loc && spec.real) });
        if (room.dark) { d.type = 'auto'; d.hum = true; }
        doors.push(d);
      }
    }
    if (room.flee) {   // the door that walks away hangs on the back wall and slides along it
      const d = placeDoor(di++, 'E', 5, 0, { type: 'flee', label: 'EXIT', exit: true });
      d.rot = 0; d.out = [0, -1]; d.z = wz(0) + .67; d.o = 1; d.to = d.x; d.pool.g.rotation.y = 0; doors.push(d);
    }
    if (room.riddle) {
      const r = RIDDLES[(Math.random() * RIDDLES.length) | 0], order = shuffle([0, 1, 2]);
      riddle = { solved: false, q: r.q, yes: r.yes, right: order.indexOf(0) };
      plates.forEach((pl, i) => { pl.label = r.a[order[i]]; });
    }
    if (room.exec) plates.forEach((pl, i) => { pl.label = ['ART', 'TECH', 'MONEY'][i]; });
    if (B.on) { B.x = B.stops[0].x; B.z = B.stops[0].z; }
    bot.visible = B.on;
    // walls and the low front wall; the painting hangs on a wall block
    let n = 0, l = 0, b = 0; const m = new THREE.Matrix4();
    for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
      const ch = grid[cy][cx], wall = ch === '#' || ch === 'P';
      if (!wall) continue;
      m.makeTranslation(wx(cx), cy === ROWS - 1 ? .15 : .75, wz(cy));
      if (cy === ROWS - 1) lows.setMatrixAt(l++, m); else walls.setMatrixAt(n++, m);
      m.makeTranslation(wx(cx), .06, wz(cy)); bases.setMatrixAt(b++, m);
    }
    walls.count = n; lows.count = l; bases.count = b;
    walls.instanceMatrix.needsUpdate = lows.instanceMatrix.needsUpdate = bases.instanceMatrix.needsUpdate = true;
    walls.computeBoundingSphere(); lows.computeBoundingSphere(); bases.computeBoundingSphere();
    nav = new NavGrid(COLS, ROWS, 1, (x, y) => { const ch = grid[y][x]; return ch === '#'; }, { diagonal: true });

    // light: the sound room is dark apart from the walker's own lamp
    const dark = !!room.dark;
    v.hemi.intensity = dark ? .03 : .22; light.intensity = dark ? 0 : 14; lamp.intensity = dark ? 6 : .5; lamp.distance = dark ? 4.2 : 5;
    v.envI = dark ? .04 : .3; bases.visible = !dark;
    path = null; waitT = 0; bonkT = 0; leaving = null; roomT = 0;
    if (wedge.state === 'stuck' || wedge.state === 'fly') wedge.state = wedge.issued ? 'hand' : 'none';
    wedgeM.visible = false;
    if (v.shadowsDirty) v.shadowsDirty();
  }
  // the room's memo, on screen and read out by whoever wrote it; pre: what the Chair says first
  function brief(pre = '', cap = 6) {
    const text = room.memo + (room.loc ? langPick + '.' : ''), who = room.by || 'chair';
    memo = { dept: room.dept, who, text: flat(text) }; memoT = 0;
    const sec = pre ? Math.min(cap, 1.2 + pre.length * .04) : 0;
    if (pre) { showQuip(pre, sec, 'chair'); memoT = -sec; speak('chair', pre, 2, true); }
    speak(who, text, 2, true);
    if (room.riddle) speak('door', riddle.q, 2, true);
    if (room.wedge && wedge.state === 'none') { wedge.state = 'hand'; wedge.issued = true; speak('norm', QUIPS.issued[0][1], 2, true, 4.5); }
    return sec;
  }

  // ---------- moving ----------
  function goTo(x, z) {
    let tx = Math.max(0, Math.min(COLS - 1, cxOf(x))), ty = Math.max(0, Math.min(ROWS - 1, cyOf(z)));
    if (cellAt(tx, ty) === '#') {   // nearest open cell to where the finger went
      let best = null, bd = 1e9;
      for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) if (cellAt(cx, cy) !== '#') { const dd = (wx(cx) - x) ** 2 + (wz(cy) - z) ** 2; if (dd < bd) { bd = dd; best = [cx, cy]; } }
      if (!best) return; [tx, ty] = best;
    }
    const px = cxOf(P.x) + .5, pz = cyOf(P.z) + .5;
    const r = nav.path(Math.max(.5, Math.min(COLS - .5, px)), Math.max(.5, Math.min(ROWS - .5, pz)), tx + .5, ty + .5);
    if (!r) return;
    path = r.slice(1).map(p => ({ x: p.x - COLS / 2, z: p.y - ROWS / 2 }));
    if (!path.length) path = null;
    waitT = 0;
  }
  function bonk(d, kind) {
    if (bonkT > 0) return;
    bonkT = .9; path = null;
    if (d) { const dx = P.x - d.x, dz = P.z - d.z, l = Math.hypot(dx, dz) || 1; P.x += dx / l * .18; P.z += dz / l * .18; }
    sounds.hit(); haptic('medium'); fx.shake(5);
    const [sx, sy] = v.toScreen(P.x, 1.2, P.z); fx.pop(sx, sy, 'BONK', { color: GOLD });
    if (room.film) return cut('cutBonk');
    if (d && d.type === 'loc') return tell('chair', 'That is a cupboard. | The exit is the ' + langPick + ' one.', { sec: 2.4 });
    if (!(++bonks === 3 && remark('bonks')) && kind) remark(kind);
  }
  // the door that left its frame: walking into it shoves it, and it slides until something stops it
  function shove(dx, dz) {
    const sx = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0, sz = sx ? 0 : Math.sign(dz);
    let n = 0;
    while (cellAt(slab.cx + sx * (n + 1), slab.cy + sz * (n + 1)) === '.') n++;
    if (!n) { if (bonkT <= 0) { bonkT = .9; path = null; sounds.hit(.8); haptic('medium'); fx.shake(3); remark('slabStuck'); } return; }
    slab.cx += sx * n; slab.cy += sz * n; slab.spin = (sx || sz) * .5; path = null;
    noise(.1 + n * .06, { vol: .07, from: 900, to: 300, filter: 'bandpass', q: 2 }); sounds.hit(.6); haptic('heavy'); fx.shake(3);
  }
  // steps the walker by (dx, dz); stops at walls and closed doors
  function step(dx, dz) {
    const l = Math.hypot(dx, dz); if (!l) return true;
    const lx = P.x + dx / l * .32, lz = P.z + dz / l * .32;
    const cx = cxOf(lx), cy = cyOf(lz);
    if (slab && cx === slab.cx && cy === slab.cy) { shove(dx, dz); return false; }
    if (blocked(cx, cy)) {
      const d = doorAt(cx, cy);
      if (d && d.type === 'merge' && d.wedged) return false;   // one is wedged: wait for the other
      if (d && d.type !== 'paint' && (!locked(d) || d.type === 'staff') && waitT < .7) { waitT += 1 / 60; return false; }   // give it a moment to open
      if (d) bonk(d, d.type); else path = null;
      return false;
    }
    waitT = 0; P.x += dx; P.z += dz; P.face = Math.atan2(dx, dz); return true;
  }

  // ---------- the doorstop ----------
  function throwWedge(d) {
    if (d.type === 'paint') return remark('wedgePaint');
    if (Math.max(d.o, d.o2) < .35 && !d.wedged) return remark(d.type === 'lag' && d.vis > .5 ? 'wedgeLag' : 'wedgeShut');
    wedge.state = 'fly'; wedge.t = 0; wedge.from = { x: P.x, z: P.z }; wedge.to = d; wedge.back = false;
    sounds.jump(); haptic('light');
  }
  function recall() {
    if (wedge.state !== 'stuck') return;
    const d = wedge.to; d.wedged = false;
    wedge.state = 'fly'; wedge.t = 0; wedge.from = { x: d.x, z: d.z }; wedge.back = true;
    sounds.select(); haptic('light');
  }
  function updateWedge(dt) {
    if (wedge.state !== 'fly') { wedgeM.visible = wedge.state === 'stuck'; if (wedgeM.visible) wedgeM.position.x = wedge.to.x; return; }
    wedge.t += dt / .38; const k = Math.min(1, wedge.t);
    const to = wedge.back ? { x: P.x, z: P.z } : wedge.to;
    wedgeM.visible = true;
    wedgeM.position.set(wedge.from.x + (to.x - wedge.from.x) * k, .1 + Math.sin(k * Math.PI) * 1.1, wedge.from.z + (to.z - wedge.from.z) * k);
    wedgeM.rotation.z += dt * 18;
    if (k < 1) return;
    if (wedge.back) { wedge.state = 'hand'; wedgeM.visible = false; return; }
    const d = wedge.to;
    if (Math.max(d.o, d.o2) > .3) {
      d.wedged = true; d.pin = d.o >= d.o2 ? 'a' : 'b'; wedge.state = 'stuck'; wedgeM.position.set(d.x, .07, d.z); wedgeM.rotation.set(Math.PI / 2, 0, d.rot);
      sounds.click(); haptic('heavy'); fx.shake(3);
      if (d.type === 'flee') remark('pinned', { sec: 1.6 }); else remark('wedgeIn', { sec: 2 });
      for (let i = 0; i < 18; i++) sparks.emit({ x: d.x, y: .1, z: d.z, vx: (Math.random() - .5) * 3, vy: Math.random() * 3, vz: (Math.random() - .5) * 3, life: .5, size: .07, col: [3, 2.2, .6], drag: 2, grav: 6, floor: .02 });
    } else { wedge.from = { x: d.x, z: d.z }; wedge.t = 0; wedge.back = true; remark('wedgeLate'); sounds.hit(.7); }
  }

  // ---------- taps ----------
  function doorBox(d) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const hw = d.wide ? 1.5 : .5, ax = d.rot ? 0 : hw, az = d.rot ? hw : 0;
    for (const s of [-1, 1]) for (const y of [0, 1.5]) {
      const [sx, sy] = v.toScreen(d.x + ax * s, y, d.z + az * s);
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { x0: x0 - 6, y0: y0 - 6, x1: x1 + 6, y1: y1 + 4 };
  }
  const inBox = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  function ground(x, y) {
    ndc.set(x / W * 2 - 1, -(y / H * 2 - 1)); ray.setFromCamera(ndc, v.cam);
    const o = ray.ray.origin, d = ray.ray.direction; if (d.y > -.01) return null;
    const k = -o.y / d.y; return { x: o.x + d.x * k, z: o.z + d.z * k };
  }
  const wedgeBtn = () => ({ x: W - 40, y: H - 40, r: 26 });
  // the confirmation box: where it sits, and its two buttons
  function dialog() {
    const w = Math.min(W - 36, 232), h = 90, x = (W - w) / 2, y = Math.min(H - h - 76, H * .56), bw = w / 2 - 18;
    return { x, y, w, h, a: { x0: x + 12, y0: y + h - 38, x1: x + 12 + bw, y1: y + h - 10 }, b: { x0: x + w - 12 - bw, y0: y + h - 38, x1: x + w - 12, y1: y + h - 10 } };
  }
  function answer(which) {   // a button in the confirmation box
    if (!ui.open) return;
    if (ASKS[ui.stage].ok === which) {
      ui.stage++; sounds.select(); haptic('tick');
      if (ui.stage >= ASKS.length) { ui.open = false; sounds.powerup(); haptic('success'); tell('chair', 'Preference saved. | Until next time.', { sec: 2 }); }
    } else { ui.stage = 0; time = Math.max(0, time - 2); sounds.hurt(); haptic('warning'); fx.shake(4); const [sx, sy] = v.toScreen(P.x, 1.2, P.z); fx.pop(sx, sy, '-2s', { color: '#ff8a9a' }); remark('cancel'); }
  }
  // a knock on a door that wants knocking: the composer's door on the beat, the fighter's door when it isn't blocking
  function knock(d) {
    const [sx, sy] = v.toScreen(d.x, 1.1, d.z);
    if (d.type === 'beat') {
      const b = Math.round(roomT / .5), off = Math.abs(roomT - b * .5);
      if (off <= .16 && b !== beat.last) {
        beat.n = b === beat.last + 1 ? beat.n + 1 : 1; beat.last = b;
        sfx(520 + beat.n * 130, .09, 'triangle', .07); haptic('light'); fx.pop(sx, sy, '♪', { color: MINT });
        if (beat.n >= 4) { notes('C5 E5 G5 C6', { len: .08, wave: 'triangle', vol: .06 }); haptic('success'); tell('chair', 'In time. | The Composer is weeping, in a good way.', { sec: 2 }); }
      } else if (b !== beat.last || off > .16) { if (beat.n) remark('offBeat', { sec: 1.8 }); beat.n = 0; beat.last = -9; sfx(150, .12, 'sawtooth', .05, -40); haptic('warning'); fx.pop(sx, sy, 'off beat', { color: '#ff8a9a' }); }
      return;
    }
    if (roomT % 1.7 > 1.15) { d.hp = Math.min(12, d.hp + 1); sfx(220, .08, 'square', .05, 80); haptic('tick'); fx.pop(sx, sy, 'BLOCKED', { color: '#ff8a9a' }); return; }
    d.hp--; d.sq = .12; sounds.hit(1 + (12 - d.hp) * .05); haptic('medium'); fx.shake(3); fx.pop(sx + (Math.random() - .5) * 30, sy, '-1', { color: GOLD });
    for (let i = 0; i < 8; i++) sparks.emit({ x: d.x, y: .8, z: d.z + .2, vx: (Math.random() - .5) * 4, vy: Math.random() * 3, vz: Math.random() * 3, life: .4, size: .06, col: [3, 2, .5], drag: 2, grav: 7, floor: .02 });
    if (d.hp <= 0) { sounds.boom(.8); haptic('heavy'); fx.shake(8); fx.flash('#ffffff', .2); fx.pop(sx, sy - 16, 'K.O.', { color: MINT }); }
  }
  const wantsKnock = d => (d.type === 'beat' && beat.n < 4) || (d.type === 'hp' && d.hp > 0);
  function tap(x, y) {
    if (leaving || ended || fin) return;
    if (ui.open) { const g = dialog(); if (inBox(g.a, x, y)) answer('a'); else if (inBox(g.b, x, y)) answer('b'); if (x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) return; }
    const wb = wedgeBtn();
    if (wedge.state !== 'none' && Math.hypot(x - wb.x, y - wb.y) < wb.r + 6) { if (wedge.state === 'stuck') recall(); else if (wedge.state === 'hand') { const d = nearestOpen(); if (d) throwWedge(d); else remark('wedgeShut'); } return; }
    // the Creative Director's room: tap the back wall to put a door there
    if (room.place && !doors.length) {
      const g = ground(x, y);   // a tap on the wall's face lands on the floor behind it
      if (g && cyOf(g.z) <= 0) return buildDoor(Math.max(1, Math.min(COLS - 2, cxOf(g.x))));
    }
    tapDoorOrFloor(x, y);
  }
  function buildDoor(cx) {    // the Creative Director's room: the door goes where you tapped
    grid[0][cx] = 'E'; nav.set(cx, 0, false);
    const d = placeDoor(0, 'E', cx, 0, { type: 'auto', label: 'EXIT', exit: true }); d.o = 0; doors.push(d);
    sounds.powerup(); haptic('success'); fx.shake(6); fx.flash('#ffffff', .25);
    for (let i = 0; i < 40; i++) sparks.emit({ x: d.x, y: .8, z: d.z + .3, vx: (Math.random() - .5) * 5, vy: Math.random() * 5, vz: Math.random() * 3, life: .8, size: .08, col: [.6, 3, 2.2], drag: 1.5, grav: 7, floor: .02 });
    tell('chair', 'Door added. | Minuted.', { sec: 2 });
    if (v.shadowsDirty) v.shadowsDirty();
  }

  function tapDoorOrFloor(x, y) {
    // doors first (they stand up out of the floor)
    let best = null, bz = -1e9;
    for (const d of doors) if (d.type !== 'cut' && d.type !== 'wing' && inBox(doorBox(d), x, y) && d.z > bz) { bz = d.z; best = d; }
    if (best) {
      if (wantsKnock(best)) return knock(best);
      if (best.type !== 'clip') {
        if (wedge.state === 'hand' && (Math.max(best.o, best.o2) > .35 || best.type === 'paint' || best.type === 'lag')) return throwWedge(best);
      }
      if (best.type === 'legal' && scrub < 1) showQuip('Rub the door to scrub the logo off.', 1.6);
      // walk up to it: the cell in front, on our side
      goTo(wx(best.cx), wz(best.type === 'flee' ? 1 : best.cy));
      sounds.blip(); return;
    }
    const g = ground(x, y); if (g) { goTo(g.x, g.z); sounds.blip(.8); }
  }
  function nearestOpen() {
    let best = null, bd = 1e9;
    for (const d of doors) if (Math.max(d.o, d.o2) > .35 && !d.wedged && d.type !== 'cut' && d.type !== 'clip' && d.type !== 'wing') { const dd = Math.hypot(P.x - d.x, P.z - d.z); if (dd < bd) { bd = dd; best = d; } }
    return best;
  }

  // ---------- the camera ----------
  const EL = 1.02, fitPts = [[-1, 0, 1], [1, 0, 1], [-1, 1.5, -1], [1, 1.5, -1], [-1, 1.5, 1], [1, 1.5, 1]];
  let fitD = 14, fitOff = 0, hudTop = 50;
  function aim(x, z, d) {
    v.cam.aspect = W / H; v.cam.updateProjectionMatrix();
    v.cam.position.set(x, Math.sin(EL) * d, z + fitOff + Math.cos(EL) * d); v.cam.lookAt(x, 0, z + fitOff); v.cam.updateMatrixWorld();
  }
  function bounds(x, z, hx, hz) {
    let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
    for (const [sx, y, sz] of fitPts) {
      tmp.set(x + sx * hx, y, z + sz * hz).project(v.cam);
      const px = (tmp.x + 1) / 2 * W, py = (1 - tmp.y) / 2 * H;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    return { x0, x1, y0, y1 };
  }
  function fitCamera(x, z, hx, hz) {
    const top = hudTop, bot = H - 6, side = 6;
    for (let pass = 0; pass < 2; pass++) {
      let lo = 3, hi = 60;
      for (let i = 0; i < 14; i++) {
        const d = (lo + hi) / 2; aim(x, z, d); const b = bounds(x, z, hx, hz);
        if (b.x0 < side || b.x1 > W - side || b.y1 - b.y0 > bot - top) lo = d; else hi = d;
      }
      fitD = hi; aim(x, z, fitD);
      // slide the view so the window sits between the HUD and the bottom
      const b = bounds(x, z, hx, hz), want = (top + bot) / 2, got = (b.y0 + b.y1) / 2;
      fitOff += (got - want) / Math.max(1, b.y1 - b.y0) * hz * 2 * .9;
      fitOff = Math.max(-6, Math.min(6, fitOff));
    }
    aim(x, z, fitD);
  }

  // ---------- the round ----------
  const saveProg = () => api.save({ at: prog.at, runs: prog.runs, shipped: prog.shipped, fail: prog.fail, failN: prog.failN });
  function signOff() {
    score++; api.score(score);
    stamp = { dept: room.dept }; stampT = 1.6;
    sounds.win(); haptic('success'); fx.shake(4);
    if (roomKey === 'ship') return shipIt();
    time = Math.min(99, time + 15);
    const quick = roomT < 4 && ready.playing && !room.place && roomKey !== 'access' && roomKey !== 'cut';
    let done = room.done;
    if (roomKey === 'money' && gemsGot < 5) done = 'Thank you for waiting! | We noticed.';
    if (roomKey === 'net' && doors[0].vis < .4) done = 'You walked through a closed door. | Netcode call that | prediction.';
    voice.q.length = 0;
    tell(room.by || 'chair', done, { sec: 3, pri: 2 });
    if (room.after) tell(room.after[0], room.after[1], { sec: 2, pri: 2, after: true });
    else if (quick) remark('quick', { sec: 1.6, pri: 2, after: true });
    nextT = .2;
  }
  function nextRoom() {
    idx++;
    const ms = FIRST.indexOf(idx);   // a milestone is done: a checkpoint, and a little more time
    loadRoom(ALL[idx]);
    const sec = brief(ms > 0 ? PLAN[ms - 1].done : '', 4.2);
    if (ms > 0) {   // the clock waits while the Chair minutes it
      prog.at = ms; prog.fail = ''; prog.failN = 0; saveProg();
      time = Math.min(99, time + 10); banner = { text: PLAN[ms - 1].name.toUpperCase() + ' APPROVED', t: sec, len: sec };
      notes('C5 E5 G5 C6 E6', { len: .09, wave: 'triangle', vol: .05 });
    }
    fade = 1;
  }
  // the last door: it ships, the Chair adjourns, and the round ends
  function shipIt() {
    fin = { t: 0, hush: 0 }; path = null;
    prog.at = 0; prog.shipped++; prog.fail = ''; prog.failN = 0; saveProg();
    api.win(); fx.flash('#ffffff', .3);
    notes('C5 E5 G5 C6 . G5 C6 E6', { len: .1, wave: 'triangle', vol: .06 });
    voice.q.length = 0;
    tell('door', 'Goodbye. | Mind the step.', { sec: 2.6, pri: 3 });
    tell('chair', 'The door has shipped. | Players will walk through it, and never notice it was there. || That is how we know it works. | Meeting adjourned.', { sec: 7.4, pri: 3, after: true });
    tell('norm', "Right. | I'll have that doorstop back.", { sec: 2.8, pri: 3, after: true });
  }
  function updateFinale(dt) {
    fin.t += dt; fade = Math.max(0, fade - dt * 4);
    if (Math.random() < dt * 40) {
      const c = [[.5, 3, 2.2], [3, 2.2, .6], [3, .7, 1.8], [.8, 1.6, 3]][(Math.random() * 4) | 0];
      sparks.emit({ x: (Math.random() - .5) * 9, y: 4 + Math.random() * 2, z: (Math.random() - .5) * 7, vx: (Math.random() - .5) * 1.5, vy: -1 - Math.random(), vz: (Math.random() - .5) * 1.5, life: 2.4, size: .09, col: c, drag: .6, grav: 1.6, floor: .02 });
    }
    sparks.update(dt);
    // the round ends a moment after the last line (the app stops all speech when it does)
    fin.hush = quiet() ? fin.hush + dt : 0;
    if (!fin.over && ((fin.t > 8 && fin.hush > 1.2) || fin.t > 30)) { fin.over = true; api.over(); }
  }
  function timeUp() {
    time = 0; ended = true; endT = 0; path = null;
    prog.runs++; if (prog.fail === roomKey) prog.failN++; else { prog.fail = roomKey; prog.failN = 1; }
    saveProg();
    sounds.lose(); haptic('error');
    tell('chair', TIME_UP[(prog.runs - 1) % TIME_UP.length], { sec: 3, pri: 3 });
  }
  // the director's cut: back to the start of the room for another take
  function cut(why) {
    if (film.cutT > 0) return;
    film.cutT = .9; film.take++; film.rolling = false; film.still = 0; path = null; bonkT = .9;
    P.x = startAt.x; P.z = startAt.z; P.face = Math.PI;
    sfx(900, .05, 'square', .06); sfx(600, .08, 'square', .06, -200); haptic('warning'); fx.flash('#ffffff', .2);
    remark(why, { sec: 2 });
  }

  // standing still on a plate for a moment presses it; walking across one doesn't
  function press(pl) {
    const [sx, sy] = v.toScreen(pl.x, .6, pl.z);
    if (room.riddle && !riddle.solved) {
      if (pl.i === riddle.right) { riddle.solved = true; pl.flash = 1; sounds.powerup(); haptic('success'); tell('door', riddle.yes, { sec: 3 }); }
      else { pl.flash = -1; time = Math.max(0, time - 3); sounds.hurt(); haptic('heavy'); fx.shake(5); fx.pop(sx, sy, '-3s', { color: '#ff8a9a' }); remark('wrong'); }
    } else if (room.exec && !exec.done) {
      for (const j of [[0, 1], [0, 1, 2], [1, 2]][pl.i]) exec.on[j] = !exec.on[j];
      sfx(exec.on[pl.i] ? 660 : 330, .1, 'triangle', .06); haptic('medium'); pl.flash = 1;
      if (exec.on.every(Boolean)) { exec.done = true; sounds.levelup ? sounds.levelup() : sounds.powerup(); haptic('success'); tell('chair', 'All three agree. | Quickly, before they talk to each other.', { sec: 2.4 }); }
    }
  }
  function updatePlates(dt) {
    const k = keys.axis(), still = !path && !leaving && !k.x && !k.y, cx = cxOf(P.x), cy = cyOf(P.z);
    for (const pl of plates) {
      const on = cx === pl.cx && cy === pl.cy;
      pl.flash *= Math.pow(.02, dt);
      if (pl.mark) {   // the animator's mark: hold the pose while the door does its long opening
        if (anim.p >= 1) continue;
        if (on && still) {
          anim.p = Math.min(1, anim.p + dt / 3.4);
          if (anim.p >= 1) { sounds.powerup(); haptic('success'); tell('chair', 'Hold. | Hold. | And, done.', { sec: 2 }); }
        } else if (anim.p > 0) { anim.p = 0; anim.take++; sfx(200, .15, 'sawtooth', .04, -60); haptic('warning'); remark('retake', { sec: 1.8 }); }
        continue;
      }
      if (!on) { pl.dwell = 0; pl.fired = false; continue; }
      if (still && !pl.fired && (pl.dwell += dt) > .25) { pl.fired = true; press(pl); }
    }
  }

  function updateDoors(dt) {
    const wide = doors.find(d => d.wide);
    for (const d of doors) {
      if (d.cupT > 0) d.cupT -= dt;
      const inCell = cxOf(P.x) === d.cx && cyOf(P.z) === d.cy, p = d.pool;
      if (d.type === 'wing') { d.o = wide.o; continue; }
      if (d.type === 'clip') {   // a wall that is not all there: it flickers, slowly enough to be kind to eyes
        const k = (roomT * 2.6) | 0, r = Math.sin(k * 91.7) * .5 + .5;
        glitchM.material = glitchMats[r > .8 ? 1 : r > .62 ? 2 : 0]; glitchM.position.y = .75 + (r > .9 ? .06 : 0);
        continue;
      }
      if (d.type === 'flee') {   // slides along the wall, away from whoever is coming, unless it is pinned
        if (d.wedged) d.to = wx(cxOf(d.x));
        else if (Math.abs(P.x - d.x) < 2.3 && P.z < wz(5)) d.to = P.x > 0 ? wx(1) : wx(COLS - 2);
        const mv = Math.sign(d.to - d.x) * Math.min(Math.abs(d.to - d.x), 9 * dt);
        if (mv && !d.moving) noise(.25, { vol: .05, from: 1800, to: 700, filter: 'bandpass', q: 3 });
        d.moving = !!mv; d.x += mv; d.cx = cxOf(d.x); p.g.position.x = d.x;
        p.slide.position.x = .88; p.lightMat.emissive.copy(d.wedged ? matCache.amber : matCache.mint); p.lightMat.emissiveIntensity = 2.2;
        continue;
      }
      if (d.type === 'merge') {   // two doors in one doorway, taking turns
        const a = roomT % 2.8 < 1.4, hold = inCell && gap(d) > .5;
        const ta = a || hold || (d.wedged && d.pin === 'a') ? 1 : 0, tb = !a || hold || (d.wedged && d.pin === 'b') ? 1 : 0;
        const o1 = d.o, o2 = d.o2;
        d.o += Math.sign(ta - d.o) * Math.min(Math.abs(ta - d.o), 3.2 * dt); d.o2 += Math.sign(tb - d.o2) * Math.min(Math.abs(tb - d.o2), 3.2 * dt);
        if ((o1 === 0 && d.o > 0) || (o2 === 0 && d.o2 > 0)) noise(.3, { vol: .04, from: 2400, to: 500, filter: 'bandpass', q: 2 });
        p.slide.position.x = d.o * .88; p.slide2.position.x = -d.o2 * .88;
        p.lightMat.emissive.copy(d.wedged ? matCache.amber : gap(d) > .7 ? matCache.mint : matCache.red); p.lightMat.emissiveIntensity = 2.2;
        continue;
      }
      const want = wantOpen(d);
      // safety sensor: never close on anyone standing in the doorway (QA's door excepted, see below)
      const occupied = inCell || (d.wide && cyOf(P.z) === d.cy && Math.abs(cxOf(P.x) - d.cx) <= 1) || (B.on && cxOf(B.x) === d.cx && cyOf(B.z) === d.cy);
      const target = want || (occupied && !d.qa) ? 1 : 0;
      const sp = d.type === 'shy' && !want ? 7 : 3.2;
      const before = d.o;
      if (d.type === 'anim' && anim.p < 1) {   // the long opening: a flourish, a rethink, and only then the door
        const q = anim.p;
        d.o = q < .2 ? q * 1.5 : q < .35 ? .3 - (q - .2) * 1.2 : q < .6 ? .12 + (q - .35) * 2.4 : q < .75 ? .72 - (q - .6) * 1.2 : .54 + (q - .75) * .6;
      } else d.o += Math.sign(target - d.o) * Math.min(Math.abs(target - d.o), sp * dt);
      if ((before === 0 && d.o > 0) || (before === 1 && d.o < 1)) { noise(.35, { vol: .05, from: 2400, to: 500, filter: 'bandpass', q: 2 }); }
      // QA's door: stand in it and it tries to close on you
      if (d.qa) {
        if (inCell && d.o > .7) { qa.gag += dt; if (qa.gag > .6) { qa.stood += dt; d.sq = Math.max(0, Math.sin((qa.gag - .6) * 7)) * .5; if (d.sq > .45 && bonkT <= 0) { bonkT = .5; sounds.hit(1.3); haptic('light'); fx.shake(2); if (!counts.sorry) { counts.sorry = 1; tell('door', 'Sorry. | So sorry. | It is my job.', { sec: 2 }); } } } }
        else { qa.gag = 0; d.sq *= .8; }
      } else if (d.type === 'hp') d.sq *= Math.pow(.01, dt);
      // localisation: the wrong doors are cupboards, and a mop falls out of each
      if (d.type === 'loc' && !d.real && d.cupT <= 0 && !d.cool && Math.hypot(P.x - d.x, P.z - d.z) < 1.25) {
        d.cupT = 1.4; d.cool = true;
        mop.visible = true; mop.position.set(d.x, 0, d.z + .4); mop.rotation.set(0, 0, 0); mop.userData = { t: 0 };
        path = null; P.z = Math.max(P.z, d.z + 1.35); time = Math.max(0, time - 3);
        sounds.hurt(); haptic('heavy'); fx.shake(7);
        const [sx, sy] = v.toScreen(P.x, 1.2, P.z); fx.pop(sx, sy, '-3s', { color: '#ff8a9a' });
        if (!remark('loc', { sec: 2.4 })) showQuip('A broom cupboard. The exit is the ' + langPick + ' one.', 2.4);
      }
      if (d.type === 'loc' && d.cool && d.cupT <= 0 && Math.hypot(P.x - d.x, P.z - d.z) > 1.8) d.cool = false;
      // the server's door: what you see is where it was a second ago
      if (d.type === 'lag') { d.hist.push([roomT, d.o]); while (d.hist.length > 1 && d.hist[1][0] <= roomT - 1) d.hist.shift(); d.vis = d.hist[0][0] <= roomT - 1 ? d.hist[0][1] : 0; }
      // look
      if (d.type === 'cut' || d.type === 'paint') continue;
      if (d.type === 'hp') {   // it flinches when hit, and falls flat when beaten
        const blocking = d.hp > 0 && roomT % 1.7 > 1.15;
        p.slide.position.x = d.hp > 0 ? (blocking ? 0 : d.sq * (Math.random() - .5)) : 0;
        p.slide.rotation.x += ((d.hp > 0 ? 0 : -1.5) - p.slide.rotation.x) * Math.min(1, dt * 9);
        p.lightMat.emissive.copy(d.hp <= 0 ? matCache.mint : blocking ? matCache.red : matCache.amber); p.lightMat.emissiveIntensity = blocking ? 3 : 2.2;
        continue;
      }
      p.slide.position.x = (d.type === 'lag' ? d.vis : d.o) * (1 - d.sq) * .88;
      let col = d.wedged ? matCache.amber : d.dull ? matCache.dull : d.type === 'shy' ? matCache.amber : locked(d) ? matCache.red : matCache.mint, glow = d.dull ? .4 : 2.2;
      if (d.hum) glow = Math.max(0, 1 - Math.hypot(P.x - d.x, P.z - d.z) / 2.6) * 3;
      if (d.type === 'lag') col = d.vis > .5 ? matCache.mint : matCache.red;
      if (d.type === 'beat' && beat.n < 4) { col = matCache.gold; glow = 1 + Math.max(0, 1 - (roomT % .5) / .18) * 3.5; }
      if (roomKey === 'ship') col = matCache.gold;
      p.lightMat.emissive.copy(col); p.lightMat.emissiveIntensity = glow;
    }
  }
  function updateBot(dt) {
    if (!B.on) return;
    if (!B.path) { B.wait -= dt; if (B.wait <= 0) { B.at = 1 - B.at; const s = B.stops[B.at]; const r = nav.path(B.x + COLS / 2, B.z + ROWS / 2, s.x + COLS / 2, s.z + ROWS / 2); B.path = r ? r.slice(1).map(p => ({ x: p.x - COLS / 2, z: p.y - ROWS / 2 })) : null; B.wait = room.film ? .8 : 1.4; } }
    else {
      const tgt = B.path[0], dx = tgt.x - B.x, dz = tgt.z - B.z, l = Math.hypot(dx, dz), sp = B.speed * dt;
      const ahead = l > .01 ? [cxOf(B.x + dx / l * .35), cyOf(B.z + dz / l * .35)] : [cxOf(B.x), cyOf(B.z)];
      const d = doorAt(ahead[0], ahead[1]);
      if (d && d.o < .6) { /* waits for its door */ }
      else if (l <= sp) { B.x = tgt.x; B.z = tgt.z; B.path.shift(); if (!B.path.length) B.path = null; }
      else { B.x += dx / l * sp; B.z += dz / l * sp; bot.rotation.y = Math.atan2(dx, dz); }
    }
    bot.position.set(B.x, 0, B.z); brush.rotation.y += dt * 14;
    beacon.material.emissiveIntensity = 2 + Math.sin(t * 8) * 2;
  }
  // any touch: the clock starts with the first one, which also swaps the Chair's welcome for the room's memo
  function begin() {
    if (ready.waiting && memoT < 0) { memoT = 0; quipT = 0; }
    ready.go(); idleT = Math.max(0, Math.min(idleT, 0));
  }
  // what the Chair says before the first memo of a round
  function welcome() {
    const days = Math.floor((api.away ? api.away() : 0) / 86400), ms = prog.at;
    let s;
    if (ms > 0) s = 'Welcome back. | ' + PLAN[ms - 1].name + ' is still signed off. | Nobody has dared to touch it. || We resume at ' + PLAN[ms].name + '.';
    else if (prog.shipped) s = 'The door shipped. | So, naturally, there is a sequel. | Door Two. || Same doors.';
    else if (prog.runs) s = 'The committee has reconvened. | From the top.';
    else s = 'Welcome to the Hollowell Door Assurance Lab. | I am the Chair of the Door Committee. | Every department must sign off the door before it ships. || There are twenty-six departments.';
    if (prog.runs && days >= 2) s = 'You were away for ' + days + ' days. | The door did not notice. | I did. || ' + s;
    else if (prog.failN >= 2 && ROOMS[prog.fail] && ALL.indexOf(prog.fail) === idx) s += ' ' + ROOMS[prog.fail].dept + ', again. | No judgement. || Some judgement.';
    return s;
  }

  return {
    reset() {
      if (!v) setup();
      const s = api.load(null) || {};
      prog = { at: Math.max(0, Math.min(PLAN.length - 1, s.at | 0)), runs: Math.max(0, s.runs | 0), shipped: Math.max(0, s.shipped | 0), fail: typeof s.fail === 'string' ? s.fail : '', failN: Math.max(0, s.failN | 0) };
      idx = FIRST[prog.at];
      score = 0; time = prog.at ? 60 : 50; t = 0; ended = false; endT = 0; fin = null; ready.reset(); banner = null; lowSaid = false;
      voice = { q: [], now: null, until: 0, pri: 0, hold: true }; counts = {};
      wedge = { state: idx > WEDGE_FROM ? 'hand' : 'none', issued: idx > WEDGE_FROM, t: 0, from: null, to: null, back: false };
      fade = 1; stamp = null; stampT = 0; quip = null; quipT = 0; quipWho = null; nextT = 0; warnT = 0;
      for (const d of doorPool) d.g.visible = false;
      loadRoom(ALL[idx]); brief(welcome());
      ptr = null; camLook = new THREE.Vector3(0, 0, -.1);
      sparks.clear(); fx.clear(); keys.clear();
    },
    resize(w, h) { W = w; H = h; },
    // keeps the round across hot reload (and lets tests open any room, and see where the walker is)
    snapshot() { return { room: roomKey, score, time, wedge: wedge.issued ? 'hand' : 'none', at: [P.x, P.z], done: !!(fin || ended) }; },
    restore(s) {
      if (!s || !ROOMS[s.room]) return;
      score = s.score | 0; time = Number.isFinite(s.time) ? s.time : 50; idx = ALL.indexOf(s.room);
      const has = s.wedge === 'hand' || idx > WEDGE_FROM;
      wedge = { state: has ? 'hand' : 'none', issued: has, t: 0, from: null, to: null, back: false };
      ended = false; fin = null; voice.q.length = 0; quip = null; quipT = 0;
      loadRoom(s.room); brief(); api.score(score);
    },
    update(dt) {
      dt = Math.min(dt, .05);
      fx.update(dt); t += dt; roomT += dt; memoT += dt;
      // the lines waiting to be said, one at a time
      voice.hold = false;
      if (voice.q.length && !(voice.now && t < voice.until)) speak(...voice.q.shift());
      if (quipT > 0) quipT -= dt; if (stampT > 0) stampT -= dt; if (bonkT > 0) bonkT -= dt; if (banner && (banner.t -= dt) <= 0) banner = null;
      if (fin) return updateFinale(dt);
      fade = Math.max(0, fade - dt * 2.5);
      if (ended) { endT += dt; if (endT < 99 && ((endT > 2.4 && quiet()) || endT > 7)) { endT = 99; api.over(); } sparks.update(dt); return; }
      const started = ready.update(dt);
      if (started && !banner) {
        time -= dt; idleT += dt;
        if (time < 10 && (warnT -= dt) <= 0) { warnT = 1; sounds.countdown && sounds.countdown(); }
        if (time < 10 && !lowSaid) { lowSaid = true; remark('low', { sec: 2 }); } else if (time > 14) lowSaid = false;
        if (time <= 0) return timeUp();
        if (idleT > 12 && !leaving) { idleT = -1e9; remark('idle'); }
      }
      if (film.cutT > 0) film.cutT -= dt;

      // walking: path from taps, or the arrow keys
      const k = keys.axis(), sp = 3.1 * dt;
      if (leaving) {
        P.x += leaving[0] * 2 * dt; P.z += leaving[1] * 2 * dt; P.face = Math.atan2(leaving[0], leaving[1]);
        nextT -= dt; fade = Math.min(1, fade + dt * 3.5);
        if (nextT <= -.35) { leaving = null; nextRoom(); }
      } else if (film.cutT > 0) { /* the director is talking */ }
      else if (k.x || k.y) { path = null; step(k.x * sp, k.y * sp); }
      else if (ptr && ptr.drag && (ptr.reT -= dt) <= 0) { ptr.reT = .15; const g = ground(ptr.x, ptr.y); if (g) goTo(g.x, g.z); }
      if (!leaving && path && path.length) {
        const tgt = path[0], dx = tgt.x - P.x, dz = tgt.z - P.z, l = Math.hypot(dx, dz);
        if (l <= sp) { if (step(dx, dz)) path.shift(); }
        else step(dx / l * sp, dz / l * sp);
        if (path && !path.length) path = null;
      }
      // items
      for (const it of items) {
        if (it.got || Math.hypot(P.x - it.x, P.z - it.z) > .6) continue;
        it.got = true;
        if (it.kind === 'key') { hasKey = true; keycard.getObjectByName('card').visible = false; sounds.powerup(); haptic('success'); tell('chair', 'Keycard acquired. | It says DOOR on it, for clarity.'); }
        else { gemsGot++; it.m.visible = false; sounds.coin(1 + gemsGot * .1); haptic('light'); const [sx, sy] = v.toScreen(it.x, 1, it.z); fx.pop(sx, sy, gemsGot + '/5 ◆', { color: PINK }); if (gemsGot === 5) { tell('brand', 'Purchase complete! | The door thanks you!'); sounds.levelup && sounds.levelup(); } }
        for (let i = 0; i < 16; i++) sparks.emit({ x: it.x, y: .6, z: it.z, vx: (Math.random() - .5) * 3, vy: Math.random() * 3, vz: (Math.random() - .5) * 3, life: .5, size: .07, col: it.kind === 'key' ? [.5, 3, 2] : [3, .6, 1.8], drag: 2, grav: 4 });
      }
      if (room.doors.E && room.doors.E.type === 'pay' && gemsGot < 5 && payT > 0 && started) { payT -= dt; if (payT <= 0) tell('brand', 'Your free door is ready! | Thank you for your patience!'); }
      // QA's checklist: through, back, and stand in it
      const T = doors.find(d => d.qa);
      if (T && !qa.done) {
        const cy = cyOf(P.z), side = cy < T.cy ? 'n' : cy > T.cy ? 's' : null;
        if (side && side !== qa.side) { qa.side = side; qa.cross++; sounds.select(); haptic('tick'); }
        if (qa.cross >= 2 && qa.stood >= 2.2) { qa.done = true; sounds.levelup ? sounds.levelup() : sounds.win(); haptic('success'); tell('chair', 'QA: all tests passed. | The exit is unlocked.'); }
      }
      // the hum: faster and higher the closer the door
      const hd = doors.find(d => d.hum);
      if (hd) {
        const dd = Math.hypot(P.x - hd.x, P.z - hd.z);
        if ((humT -= dt) <= 0) { humT = .14 + dd * .09; sfx(170 + Math.max(0, 9 - dd) * 45, .07, 'sine', .07); if (dd < 6) haptic('tick'); }
      }
      // the composer's door ticks its beat, with the accent on one
      if (roomKey === 'music' && beat.n < 4) {
        const b = Math.floor(roomT / .5);
        if (b !== beat.tick) { beat.tick = b; sfx(b % 4 ? 300 : 440, .04, 'square', .035); if (b > beat.last + 1 && beat.n) { beat.n = 0; beat.last = -9; } }
      }
      // user interface: the box pops up when you reach the door
      const ud = doors.find(d => d.type === 'ui');
      if (ud) { const near = Math.hypot(P.x - ud.x, P.z - ud.z) < 2.2 && ui.stage < ASKS.length; if (near && !ui.open) { sfx(880, .06, 'sine', .05); path = null; } ui.open = near; }
      // the trailer: one take, no stopping, mind the robot
      if (room.film && !leaving && film.cutT <= 0) {
        const moving = !!(path || k.x || k.y);
        if (moving && !film.rolling && Math.hypot(P.x - startAt.x, P.z - startAt.z) > .3) { film.rolling = true; film.still = 0; sfx(1200, .05, 'square', .05); }
        if (film.rolling) {
          film.still = moving ? 0 : film.still + dt;
          if (Math.hypot(P.x - B.x, P.z - B.z) < .62) cut('cutBot'); else if (film.still > .5) cut('cutStop');
        }
      }
      if (slab) { slab.x += (wx(slab.cx) - slab.x) * Math.min(1, dt * 14); slab.z += (wz(slab.cy) - slab.z) * Math.min(1, dt * 14); slab.spin *= Math.pow(.02, dt); }
      updatePlates(dt); updateDoors(dt); updateBot(dt); updateWedge(dt);
      // out through the exit
      if (!leaving && !ended) {
        const pcx = cxOf(P.x), pcy = cyOf(P.z);
        const e = doors.find(d => d.exit && gap(d) > .7 && (d.type === 'flee' ? d.wedged && !d.moving && pcy === 1 && pcx === d.cx : pcx === d.cx && pcy === d.cy));
        if (e) { leaving = e.out[0] || e.out[1] ? e.out : [0, -1]; path = null; signOff(); }
      }
      if (mop.visible) { const u = mop.userData; u.t += dt; mop.rotation.x = Math.min(1.45, u.t * 4); if (u.t > 1.6) mop.visible = false; }
      for (const it of items) if (it.kind === 'gem' && !it.got) { it.m.rotation.y += dt * 2.4; it.m.position.y = .5 + Math.sin(t * 3 + it.x) * .08; }
      keycard.getObjectByName('card').rotation.y += dt * 2;
      sparks.update(dt);
    },
    draw(c) {
      // the walker
      player.position.set(P.x, path || leaving ? Math.abs(Math.sin(t * 11)) * .05 : 0, P.z);
      player.rotation.y += Math.atan2(Math.sin(P.face - player.rotation.y), Math.cos(P.face - player.rotation.y)) * .3;
      lamp.position.set(P.x, 1.6, P.z + .2);
      if (slab) { slabM.position.set(slab.x, 0, slab.z); slabM.rotation.set(0, slab.spin * .5, slab.spin * .16); }
      // floor plates: what they are for says what colour they glow
      for (const pl of plates) {
        const m = pl.m.material; let col = matCache.sky, glow = 1.1;
        if (pl.mark) { col = anim.p >= 1 ? matCache.mint : matCache.gold; glow = 1 + anim.p * 2 + Math.sin(t * 6) * .3; }
        else if (room.exec) { const on = exec.on[pl.i]; col = on ? matCache.mint : matCache.dull; glow = on ? 2.4 : .5; }
        else if (room.riddle) { col = pl.flash < -.05 ? matCache.red : riddle.solved && pl.i === riddle.right ? matCache.mint : matCache.sky; glow = 1.1 + Math.abs(pl.flash) * 2; }
        m.emissive.copy(col); m.emissiveIntensity = glow;
      }
      // camera: a window of the room round the walker (the whole room where the screen is big enough),
      // fitted between the HUD and the bottom edge at any shape
      const hx = Math.min(5.9, W / 2 / 30), hz = Math.min(4.9, (H - 60) / 2 / 26);
      const gx = Math.max(-(5.9 - hx), Math.min(5.9 - hx, P.x)), gz = Math.max(-(4.9 - hz), Math.min(4.9 - hz, P.z));
      camLook.x += (gx - camLook.x) * .08; camLook.z += (gz - camLook.z) * .08;
      // the memo box sits at the top: the room makes way for it, so no door hides under it
      const memoLen = memo.text.length / 60 + 3.5, showMemo = memoT >= 0 && memoT < memoLen && !(quipT > 0);
      c.font = '500 12px Rubik, sans-serif';
      const mw = Math.min(W - 24, 440), lines = showMemo || quipT > 0 ? wrap(c, showMemo ? memo.text : quip, mw - 20).slice(0, 7) : [];
      const tag = showMemo || quipWho;
      const bh = lines.length ? 10 + lines.length * 15 + (tag ? 12 : 0) : 0;
      // (room is kept for a short remark all the time, so the floor doesn't shift under a finger each time somebody speaks)
      hudTop += (Math.max(H >= 380 ? 112 : 97, bh ? 34 + bh + 26 : 0) - hudTop) * .1;
      fitCamera(camLook.x, camLook.z, hx, hz);
      fx.begin(c); v.render(c, W, H); fx.end(c, W, H);
      const font = (wt, px) => `${wt} ${px}px Rubik, sans-serif`;
      const chip = (s, x, y, col, px = 10) => { c.font = font(700, px); const w = c.measureText(s).width + 12; c.fillStyle = '#0d1115cc'; c.fillRect(x - w / 2, y - px + 1, w, px + 5); c.fillStyle = col; c.fillText(s, x, y + 2); };

      // door labels, and what each department has bolted on
      c.textAlign = 'center';
      for (const d of doors) {
        if (d.type === 'wing' || d.type === 'clip') continue;
        const [sx, sy0] = v.toScreen(d.x, 1.62, d.z), sy = d.word && d.ch !== 'A' && d.ch !== 'C' ? sy0 - 15 : sy0;
        let label = d.label || (d.word) || '', col = d.type === 'staff' || d.type === 'never' ? RED : '#e9fff7';
        if (d.type === 'pay') { label = gemsGot >= 5 || payT <= 0 ? 'EXIT · PAID' : `5 ◆ or wait ${Math.ceil(payT)}s`; col = PINK; }
        if (d.type === 'lag') { label = d.o > .5 ? 'SERVER: OPEN' : 'SERVER: SHUT'; col = d.o > .5 ? MINT : RED; }
        if (d.type === 'anim') { label = anim.p >= 1 ? 'EXIT' : anim.p > 0 ? `TAKE ${anim.take} · ${Math.floor(anim.p * 100)}%` : 'EXIT · IN REHEARSAL'; col = GOLD; }
        if (d.type === 'beat') { label = beat.n >= 4 ? 'EXIT' : '♪ ' + '●'.repeat(beat.n) + '○'.repeat(4 - beat.n); col = GOLD; }
        if (d.type === 'hp') label = d.hp > 0 ? 'DOOR · ' + d.hp + ' HP' : 'EXIT · K.O.';
        if (roomKey === 'ship') col = GOLD;
        if (d.hum) label = '';
        if (label) chip(label, sx, sy, col);
        if (d.type === 'lag') chip('PING 1000 ms', sx, sy - 16, '#9fdcc9', 8);
        if (d.type === 'hp' && d.hp > 0) { c.fillStyle = '#0d1115cc'; c.fillRect(sx - 31, sy + 9, 62, 7); c.fillStyle = roomT % 1.7 > 1.15 ? RED : AMBER; c.fillRect(sx - 30, sy + 10, 60 * d.hp / 12, 5); }
        if (d.type === 'legal' && scrub < 1) {
          const b = doorBox(d), cx = (b.x0 + b.x1) / 2, cy = b.y0 + (b.y1 - b.y0) * .48, r = Math.min(b.x1 - b.x0, b.y1 - b.y0) * .3;
          c.globalAlpha = 1 - scrub;
          c.fillStyle = '#ffcc33'; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
          c.fillStyle = '#d12b4a'; c.beginPath();
          for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .38 : r * .82; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
          c.fill(); c.fillStyle = '#fff'; c.font = font(700, Math.max(7, r * .5)); c.fillText('™', cx + r * .95, cy - r * .7);
          c.globalAlpha = 1;
          c.fillStyle = '#0d1115aa'; c.fillRect(cx - 30, b.y1 + 4, 60, 6); c.fillStyle = MINT; c.fillRect(cx - 30, b.y1 + 4, 60 * scrub, 6);
        }
      }
      // plate labels: the riddle's answers, the directors, the mark
      for (const pl of plates) {
        const [sx, sy] = v.toScreen(pl.x, .05, pl.z);
        if (pl.mark) { if (anim.p < 1) chip(anim.p > 0 ? 'HOLD STILL' : 'STAND HERE', sx, sy - 14, GOLD, 9); }
        else if (pl.label) chip(pl.label, sx, sy + (pl.i % 2 ? 16 : -14), room.exec ? (exec.on[pl.i] ? MINT : '#aab4bb') : '#e9fff7', 9);
      }
      // the placement hint in the Creative Director's room
      if (room.place && !doors.length && roomT > 1.5) {
        const [sx, sy] = v.toScreen(0, 1.7, wz(0));
        c.globalAlpha = .55 + Math.sin(t * 5) * .35; c.fillStyle = MINT; c.font = font(700, 12); c.fillText('▼ tap the wall ▼', sx, sy - 4); c.globalAlpha = 1;
      }
      // the trailer shoot: letterbox bars and a recording light
      if (room.film) {
        c.fillStyle = '#000000b0'; c.fillRect(0, H - 22, W, 22);
        c.textAlign = 'left'; c.font = font(700, 10);
        c.fillStyle = film.rolling && (t * 2 | 0) % 2 ? RED : '#7a858c'; c.fillText('● REC', 12, H - 8);
        c.fillStyle = '#e9fff7'; c.fillText('TAKE ' + film.take, 58, H - 8);
        if (film.cutT > 0) { c.textAlign = 'center'; c.font = font(800, 34); c.fillStyle = '#ffffff'; c.fillText('CUT!', W / 2, H * .55); }
      }

      // HUD: time and how far through the plan
      c.textAlign = 'left'; c.font = font(700, 18);
      c.fillStyle = time < 10 && (t * 4 | 0) % 2 ? '#ff6070' : '#ffffffee'; c.fillText(Math.ceil(time) + 's', 12, 26);
      const ms = PLAN.findIndex(m => m.rooms.includes(roomKey));
      // (on one line where there is room beside the app's score badge, on two where there isn't)
      const sa = api.scoreArea ? api.scoreArea() : { x: W / 2 - 30, w: 60 }, stage = PLAN[ms].name.toUpperCase(), nth = `DOOR ${idx + 1} OF ${ALL.length}`;
      c.textAlign = 'right'; c.font = font(600, 11); c.fillStyle = '#e9fff7';
      if (W - 12 - c.measureText(stage + ' · ' + nth).width > sa.x + sa.w + 6) c.fillText(stage + ' · ' + nth, W - 12, 24);
      else { c.fillText(nth, W - 12, 28); c.font = font(700, 9); c.fillStyle = '#9fdcc9'; c.fillText(stage, W - 12, 16); }
      // the committee memo (or the latest remark), with who is speaking
      if (bh) {
        const bx = (W - mw) / 2, by = 34, who = CAST[showMemo ? memo.who : quipWho];
        const a = showMemo ? Math.min(1, (memoLen - memoT) * 2) : Math.min(1, quipT * 3);
        c.globalAlpha = a; c.fillStyle = '#0d1115d0'; c.fillRect(bx, by, mw, bh); c.fillStyle = who ? who.col : MINT; c.fillRect(bx, by, 4, bh);
        c.textAlign = 'left'; let yy = by + 16;
        if (tag) { c.font = font(700, 9); c.fillStyle = who ? who.col : MINT; c.fillText(showMemo ? 'MEMO · ' + memo.dept.toUpperCase() : quipTag, bx + 12, yy); yy += 14; }
        c.font = font(500, 12); c.fillStyle = '#eef4f6';
        const shown = showMemo ? Math.floor(memoT * 60) : 1e9; let used = 0;
        for (const ln of lines) { c.fillText(ln.slice(0, Math.max(0, shown - used)), bx + 12, yy); used += ln.length; yy += 15; }
        c.globalAlpha = 1;
      }
      c.font = font(700, 9); c.fillStyle = '#9fdcc9'; c.textAlign = 'left'; if (!showMemo && !(quipT > 0)) { c.textAlign = 'right'; c.fillText(memo.dept.toUpperCase() + (room.loc ? ' · EXIT IS IN ' + langPick.toUpperCase() : room.exec ? ' · LIGHT ALL THREE' : ''), W - 12, 40); }
      // the door's riddle stays up until it is answered
      if (room.riddle && !riddle.solved) {
        c.font = font(600, 11); c.textAlign = 'center';
        const cw = Math.min(310, W - 86), mid = Math.min(W / 2, W - 78 - cw / 2);
        const ls = wrap(c, '“' + flat(riddle.q) + '”', cw - 12), y0 = H - 12 - ls.length * 14;
        c.fillStyle = '#0d1115cc'; c.fillRect(mid - cw / 2, y0 - 12, cw, ls.length * 14 + 8);
        c.fillStyle = SKY; ls.forEach((s, i) => c.fillText(s, mid, y0 + i * 14));
      }
      // QA's checklist
      if (doors.some(d => d.qa)) {
        const items2 = [['Walk through the test door', qa.cross >= 1], ['Walk back through it', qa.cross >= 2], ['Stand in it until it gets upset', qa.stood >= 2.2]];
        c.font = font(600, 11); c.textAlign = 'left';
        items2.forEach(([s, ok], i) => { const y = H - 50 + i * 16; c.fillStyle = '#0d1115bb'; c.fillRect(8, y - 11, c.measureText('☐ ' + s).width + 10, 15); c.fillStyle = ok ? MINT : '#e9fff7'; c.fillText((ok ? '☑ ' : '☐ ') + s, 13, y); });
      }
      if (room.doors.E && room.doors.E.type === 'pay') { c.font = font(700, 13); c.textAlign = 'left'; c.fillStyle = PINK; c.fillText('◆ ' + gemsGot + ' / 5', 12, H - 16); }
      if (!ended && !fin) ready.draw(c, W, H, { text: 'The clock starts when you do', size: 13, y: H * .7 });
      // the confirmation box
      if (ui.open) {
        const g = dialog(), q = ASKS[ui.stage];
        c.fillStyle = '#00000055'; c.fillRect(g.x + 4, g.y + 5, g.w, g.h);
        c.fillStyle = '#e8ecef'; c.fillRect(g.x, g.y, g.w, g.h); c.fillStyle = '#2e6fd0'; c.fillRect(g.x, g.y, g.w, 18);
        c.textAlign = 'left'; c.font = font(700, 10); c.fillStyle = '#ffffff'; c.fillText('DOOR.EXE  (' + (ui.stage + 1) + ' of ' + ASKS.length + ')', g.x + 8, g.y + 13);
        c.font = font(600, 13); c.fillStyle = '#1b2228'; c.fillText(q.q, g.x + 12, g.y + 39);
        c.textAlign = 'center'; c.font = font(700, 11);
        for (const [b, s] of [[g.a, q.a], [g.b, q.b]]) { c.fillStyle = '#c9d1d7'; c.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); c.strokeStyle = '#7d8a93'; c.lineWidth = 1; c.strokeRect(b.x0 + .5, b.y0 + .5, b.x1 - b.x0 - 1, b.y1 - b.y0 - 1); c.fillStyle = '#1b2228'; c.fillText(s, (b.x0 + b.x1) / 2, b.y0 + 18); }
      }
      // the doorstop button
      if (wedge.state !== 'none') {
        const b = wedgeBtn();
        c.fillStyle = wedge.state === 'stuck' ? '#ffb340dd' : '#0d1115bb'; c.beginPath(); c.arc(b.x, b.y, b.r, 0, 7); c.fill();
        c.strokeStyle = '#ffc23a'; c.lineWidth = 2; c.stroke();
        c.fillStyle = wedge.state === 'stuck' ? '#0d1115' : '#ffc23a';
        c.beginPath(); c.moveTo(b.x - 12, b.y + 6); c.lineTo(b.x + 12, b.y + 6); c.lineTo(b.x + 12, b.y - 6); c.closePath(); c.fill();
        c.font = font(700, 8); c.textAlign = 'center'; c.fillStyle = '#ffe2a0';
        c.fillText(wedge.state === 'stuck' ? 'TAP: RECALL' : wedge.state === 'hand' ? 'DOORSTOP' : '…', b.x, b.y - b.r - 4);
      }
      // stamps: a door signed off, a milestone approved, the door shipped, the meeting adjourned
      const stampAt = (title, sub, col, k, a, y = H * .52) => {
        const s = 1.6 - k * .6;
        c.save(); c.translate(W / 2, y); c.rotate(-.12); c.scale(s, s); c.globalAlpha = a;
        c.font = font(800, 22); const hw = Math.max(92, c.measureText(title).width / 2 + 16);
        c.strokeStyle = col; c.lineWidth = 3; c.strokeRect(-hw, -26, hw * 2, 52);
        c.fillStyle = col; c.textAlign = 'center'; c.fillText(title, 0, 4);
        c.font = font(700, 10); c.fillText(sub, 0, 19);
        c.restore(); c.globalAlpha = 1;
      };
      if (fin) {
        stampAt('SHIPPED', 'ALL 26 DEPARTMENTS', GOLD, Math.min(1, fin.t * 6), Math.min(1, fin.t * 3), H * .5);
        c.textAlign = 'center'; c.font = font(600, 10); c.fillStyle = '#e9fff7'; c.globalAlpha = Math.max(0, Math.min(1, fin.t - 2));
        c.fillText('Inspired by Liz England\'s essay "The Door Problem"', W / 2, H * .5 + 54); c.globalAlpha = 1;
      } else if (ended) stampAt('ADJOURNED', 'OUT OF TIME · ' + room.dept.toUpperCase(), RED, Math.min(1, endT * 6), 1);
      else if (banner) stampAt(banner.text, 'MILESTONE · CHECKPOINT SAVED · +10s', GOLD, Math.min(1, (banner.len - banner.t) * 6), Math.min(1, banner.t * 2), H * .6);
      else if (stampT > 0 && stamp) stampAt('SIGNED OFF', stamp.dept.toUpperCase(), MINT, Math.min(1, (1.6 - stampT) * 6), Math.min(1, stampT * 2));
      if (fade > 0) { c.fillStyle = `rgba(13,17,21,${fade})`; c.fillRect(0, 0, W, H); }
    },
    down(x, y, id) {
      begin();
      // rubbing Legal's door starts a scrub, anything else is a tap
      const ld = doors.find(d => d.type === 'legal');
      if (ld && scrub < 1 && !ended && inBox(doorBox(ld), x, y)) { ptr = { id, x, y, scrub: true, lx: x, ly: y }; return; }
      ptr = { id, x, y, sx: x, sy: y, drag: false, reT: 0 };
      tap(x, y);
    },
    move(x, y, pressed, id) {
      if (!pressed || !ptr || ptr.id !== id) return;
      if (ptr.scrub) {
        if (scrub >= 1 || ended) return;
        scrub = Math.min(1, scrub + Math.hypot(x - ptr.lx, y - ptr.ly) / 900); ptr.lx = x; ptr.ly = y;
        if (Math.random() < .25) { noise(.06, { vol: .04, from: 4000, to: 2500, filter: 'highpass' }); haptic('tick'); }
        if (scrub >= 1) { sounds.powerup(); haptic('success'); tell('chair', 'Logo removed. | Legal have gone for a lie-down.'); }
        return;
      }
      ptr.x = x; ptr.y = y;
      if (!ptr.drag && Math.hypot(x - ptr.sx, y - ptr.sy) > 14) ptr.drag = !ui.open;
    },
    up(x, y, id) { if (ptr && ptr.id === id) ptr = null; },
    key(k, d) {
      keys.key(k, d);
      if (!d) return;
      begin();
      if (leaving || ended || fin) return;
      if (ui.open && (k === '1' || k === '2')) return answer(k === '1' ? 'a' : 'b');
      if (k === ' ' || k === 'Enter') {
        if (room.place && !doors.length) return buildDoor(cxOf(P.x));
        const kd = doors.find(wantsKnock); if (kd) return knock(kd);
        if (wedge.state === 'stuck') recall(); else if (wedge.state === 'hand') { const o = nearestOpen(); if (o) throwWedge(o); }
      }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'door-committee',
  title: 'Door Committee',
  tag: 'Next Gen · Puzzle',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 6, scoreMax: 26, scoreRate: 1,
  hint: 'Every department wants something different from the door: tap to walk, tap doors, and wedge the awkward ones open before the clock runs out. 26 doors to ship. Inspired by Liz England\'s essay "The Door Problem".',
  creator: 'Rob',
  make,
};
