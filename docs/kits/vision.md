# gs.vision

The front camera: face, hands, body and hand signs; the back camera: everyday things and barcodes.

`gs.vision` (lazy): `Face` (`x`, `y`, `yaw`, `mouth`, `smile`, `blink`...), `Hands` (`pinch`, `open`, `point`...), `Body` (joints, `armsUp`, `lean`, `squat`, `jump`, `clap`), `CutOut` (the player cut out of the camera), `Signs` (thumbs up, victory...); runs on the phone's AI chip in the apps, so pass `{ preview: true }` if you draw `picture`. Back camera: `Objects({ want: ['cup', 'banana'], shape: W / H })` spots 80 everyday things (`seen(name)` once each time one comes into view, `seeing`, `count`, `list` of boxes, `Objects.names`); `Scanner({ shape })` reads barcodes and QR codes (`scan()` gives `{ text, kind, seed }` once per code: the same code makes the same seed on every phone; `Scanner.seed(word)` for a typed word instead). Both: `start()` from a tap, `update()` each frame, draw `picture` (a canvas already cut to `shape`), positions 0..1 of it.

<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->

## What's in it

From `src/gamescroll.d.ts` (`VisionPart`, line 826), where every option and field is described.

- `Face: new (o?: { preview?: boolean }) => { start(): void; stop(): void; update(): boolean; ready: boolean; found: boolean; backend?: string; picture: HTMLVideoElement …` (:827)
- `Hands: new (o?: { max?: number; preview?: boolean }) => { start(): void; stop(): void; update(): boolean; ready: boolean; found: boolean; backend?: string; picture: HT…` Each hand in list: x, y, tipX, tipY, pinch, pinchX, pinchY, open, fist, point, side, points, and shape: the hand as 40 numbers for gs.brains.Examples (of: 'hand'), the same wherever the hand is, however near, and… (:830)
- `Body: new (o?: { max?: number; preview?: boolean }) => { start(): void; stop(): void; update(): boolean; ready: boolean; found: boolean; picture: HTMLVideoElement | nu…` The whole body (stand back): joints by name, armsUp, leftUp, rightUp, lean, squat, jump, clap. (:832)
- `CutOut: new (o?: { soft?: number; size?: number }) => { start(): void; stop(): void; update(): boolean; ready: boolean; found: boolean; amount: number; soft: number; p…` The player cut out of the camera picture: draw cut.picture (a canvas, see-through round the person). (:838)
- `Signs: new (o?: { max?: number; sure?: number }) => { start(): void; stop(): void; update(): boolean; ready: boolean; found: boolean; list: { sign: string; score: numb…` Hand signs: thumbs-up, thumbs-down, victory, open-palm, fist, point-up, love. (:840)
- `Objects: { new (o?: { /** Names to look for (default: all 80). */ want?: string[]; /** How sure before a thing counts, 0..1 (.5). */ sure?: number; /** How many things…` Spots everyday things with the back camera, 80 of them (Objects.names: 'cup', 'banana', 'book', 'dog', 'chair'...), a few times a second: scavenger hunts and "show me a...". (:845)
- `Scanner: { new (o?: { /** Which kinds to read (default: all of Scanner.kinds). */ kinds?: VisionCodeKind[]; /** Seconds between looks (.15). */ every?: number; /** Wid…` Reads barcodes and QR codes with the back camera: the same code gives the same `seed` on every phone, to make a creature, a level or loot from anything in the house. (:854)
- `loadVision(): Promise<Loose>` (:861)

## From the maker kit

From [Face and hands](../maker-kit.md#face-and-hands):

`const { Face, Hands } = gs.vision;` Face and hand tracking with the front camera, from Google's
[MediaPipe](https://ai.google.dev/edge/mediapipe) models. It all runs on the phone: no picture leaves it.
In the phone apps the models run on the phone's AI chip (Qualcomm's NPU on Snapdragon, the Neural
Engine on iPhone, else the CPU) through [ONNX Runtime](https://onnxruntime.ai), with the camera read
natively, so the game's frame time and the GPU stay free; on the web, MediaPipe runs in the page.
(Qualcomm's NPU libraries are not in the app: on a Snapdragon 8 Gen 2 or newer, the first time a game
starts face, hand or sound tracking, on Wi-Fi, the store app asks Google Play for them (the NPU from the next
start) and the test APKs from GitHub download them, about 40 MB (the NPU from the next game). Until then the
models run on the CPU.)

```js
reset() { face = new Face(); }           // loads the library first
update(dt) {
  if (!face.running) face.start();       // asks for the front camera the first time
  face.update();
  if (face.found) { ship.x = face.x * W; if (face.mouth > .5) chomp(); if (face.blink) jump(); }
}
```

- `Face`: `found`, `x`, `y` (0..1, mirrored like a selfie), `size`, `yaw`, `pitch`, `roll`, `mouth`,
  `smile`, `blink`, `winkLeft`, `winkRight`, `brows`, `points` (478), `shapes` (52 expressions by name).
- `Hands`: `list` of `{ x, y, tipX, tipY, pinch, pinchX, pinchY, open, fist, point, side, points, shape }`, `first`.
  `shape` is the hand as numbers for `gs.brains.Examples`: signs of your own ([Teach by example](#teach-by-example-signs-poses-moves-and-sounds-of-your-own)).
- `ready` is true once the camera and model are running; `failed` holds the error if the player
  said no to the camera. The app stops the camera when the round ends. `backend` says where it runs
  (`'npu'` on the AI chip).
- Drawing the camera picture (`face.picture`, a mirrored selfie view)? Make it with
  `new Face({ preview: true })` (or `Hands({ preview: true })`): the AI chip never passes pictures to
  the game, so with `preview` the tracker runs in the web view instead.
- The models (4 MB face, 8 MB hands, plus a 14 MB engine on the web) download from our games server
  the first time; `npm run ml` fetches the web ones for `npm run dev` (the AI chip's are in `ml-models/`).
  `npm run kit-browser`-style checks of the AI chip steps against MediaPipe: `node scripts/npu-test.cjs`.

From [Teach by example: signs, poses, moves and sounds of your own](../maker-kit.md#teach-by-example-signs-poses-moves-and-sounds-of-your-own):

`gs.brains.Examples` learns a thing from a few examples and says which one a new thing looks like, or
that it looks like none of them. The kits give the numbers: a hand's shape, a body's pose, a move made
with the phone, a sound. So a game can have its own hand signs, or let the player make up theirs.

```js
const { Examples } = gs.brains, { Hands } = gs.vision;
function make(api) {
  const hands = new Hands(), signs = new Examples(api, { name: 'signs', of: 'hand' });
  ...
  // teaching ("show me your rock"): when the player taps, take what the camera sees
  if (hands.first) signs.add('rock', hands.first.shape);
  // playing
  const g = hands.first && signs.guess(hands.first.shape);       // { name, sure, like } or null: none of them
  if (g && g.sure > .6) play(g.name);
}
```

- **One example is enough to start, three make it dependable.** With made-up hands that wobble like
  real takes, six signs a finger apart are known again 88% of the time from one example each, 94%
  from three and 97% from five, and almost never taken for another (the kit test measures it).
- **It works out which numbers matter** for each name (where its examples agree) and how much this
  player's takes vary, by leaving each example out in turn. A name can be two kinds of thing.
- **"None of them" is an answer.** A sign it was never shown is usually nothing; one that is a finger
  away from a taught sign is sometimes taken for it, so teach that one too, or check `sure`.
- `signs.undo()` takes back a bad take, `forget(name)` a whole name, `names` and `count(name)` say
  what it knows, `guess(x, { among: ['rock', 'paper'] })` asks about a few.
- **The maker's own examples come with the game**: teach it in `npm run dev`, press **B** in the debug
  overlay to copy `signs.pack()`, and pass it as `start`. The player's examples are saved with the
  game's brains (about 25 of a hand's shape, the newest kept).
- A guess takes a few microseconds, and nothing is downloaded beyond what the tracker already needs.
- Sensors still need a touch way to play. These shapes come from the camera, the mic and the motion
  sensors, so the card says so before Play like any other sensor game.

From [Body, cut-outs and hand signs](../maker-kit.md#body-cut-outs-and-hand-signs):

More of `gs.vision`, used like `Face` and `Hands` (make in `make()` or `reset()`, `start()` from a tap,
`update()` each frame). They run in the web view with MediaPipe on the graphics chip; positions are
0..1 and mirrored like a selfie.

- `Body`: stand back so the camera sees you. `joints` by name (`nose`, `leftHand`, `rightKnee`...: `x`,
  `y`, `seen`), and moves: `armsUp`, `leftUp`, `rightUp`, `lean` (-1..1), `squat` (0..1), `jump` and
  `clap` (true on the update they happen). Dance, dodge, exercise and goalkeeper games.
- `CutOut`: the player cut out of the camera picture. `cut.picture` is a canvas, see-through round
  the person, to draw inside your game (a face in the spaceship window, yourself on the cover of the
  level). `soft` sets the edge.
- `Signs`: `thumbs-up`, `thumbs-down`, `victory`, `open-palm`, `fist`, `point-up`, `love`. `sign` (the
  first hand's), `showing(name)`, and `made` (the sign that just started, for one-shot actions).

Like every camera game, keep a touch way to play.

From [A camera that knows things](../maker-kit.md#a-camera-that-knows-things):

Two more of `gs.vision`, and these look out of the **back** of the phone at the room: `Objects` knows
80 everyday things by name, and `Scanner` reads barcodes and QR codes. Make them in `make()` or
`reset()`, `start()` them from a tap, call `update()` every frame.

```js
const { Objects, Scanner } = gs.vision;

// a scavenger hunt
reset() { eyes = new Objects({ want: ['cup', 'banana', 'book', 'spoon'], shape: W / H }); }
down()  { eyes.start(); }                               // from a tap: asks for the camera
update(dt) {
  eyes.update();
  if (eyes.seen(target)) { score++; api.score(score); feel.coin(W / 2, H / 2); target = nextThing(); }
}
draw(c) {
  if (eyes.picture) c.drawImage(eyes.picture, 0, 0, W, H);          // the camera, already W x H shaped
  for (const o of eyes.list) c.strokeRect(o.left * W, o.top * H, o.w * W, o.h * H);
}
```

- **`Objects({ want, sure, max, every, shape, camera })`**: `want` is the names to look for (leave it
  out for all 80: `Objects.names` lists them, from `'cup'`, `'fork'`, `'banana'`, `'book'`, `'clock'`
  and `'scissors'` to `'dog'`, `'chair'`, `'bicycle'` and `'teddy bear'`; a few other words work too,
  such as `'phone'`, `'sofa'`, `'fridge'` and `'mug'`). A name it doesn't know throws when the game
  is made, so a typo shows up straight away. `sure` is how sure it must be (0..1, `.5`), `max` how many
  things at once (5), `every` the seconds between looks (`.25`).
  - `seen(name)`: true **once** each time one comes into view (it has to be there two looks running,
    so one blurry frame doesn't count). `seen()` with no name gives the name of whatever just arrived.
  - `seeing(name)`: how sure it is that one is in view now (0 when not). `count(name)`: how many.
  - `list`: what this look found, surest first: `{ name, sure, x, y, w, h, left, top }` (`x`, `y` is
    the middle). `top` is the surest, `found` whether there is anything.
- **`Scanner({ kinds, every, shape, camera })`**: reads QR codes and the striped codes on anything from
  a cereal box to a library book (`Scanner.kinds`: `'qr'`, `'ean-13'`, `'ean-8'`, `'upc-a'`, `'upc-e'`,
  `'code-128'`, `'code-39'`, `'code-93'`, `'codabar'`, `'itf'`, `'data-matrix'`, `'aztec'`, `'pdf417'`).
  - `scan()`: the code that has just been read, **once** each time one comes into view (else null):
    `{ text, kind, seed, x, y, w, h, left, top, corners }`.
  - `seed` is a whole number made from the text, the same for the same code on every phone and far
    apart for codes one digit apart: hand it to `gs.art.creature(seed)`, `gs.gen.dungeon(40, 30, { seed })`,
    `gs.math.rng(seed)`. A whole kitchen becomes a deck of monsters.
  - `code` is the code in view now (or null), `list` all of them, `backend` which reader is at work.
  - `Scanner.seed('any text')` gives the seed for a typed word.

```js
reset() { scanner = new Scanner({ shape: 1 }); monster = null; }
down(x, y) { if (shuffle.hit(x, y)) monster = gs.art.creature(Math.random() * 1e9 | 0); else scanner.start(); }   // "Surprise me"
update(dt) { scanner.update(); const code = scanner.scan(); if (code) { monster = gs.art.creature(code.seed); feel.powerup(W / 2, H / 2); } }
draw(c) { if (scanner.picture) c.drawImage(scanner.picture, 30, 60, 300, 300); /* a square window onto the camera */ }
```

More in docs/maker-kit.md: "A camera that knows things".

## In real games

No game uses `gs.vision` yet: the examples above are what there is.
