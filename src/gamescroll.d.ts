// Types for gs, the one thing a game imports (`import gs from '../gamescroll.js'`). Editors and AI
// tools read this file to autocomplete gs.* and the game definition; nothing ships from it. Big
// libraries (three.js, Rapier, Yuka, Tone) are typed loosely here: their own docs have the details.
// `npm run types-check` fails if a part of gs is missing from this file.

type Ctx = CanvasRenderingContext2D;
type XY = { x: number; y: number };
type XYZ = { x: number; y: number; z: number };
type Colour = string | string[];
type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------- the game ----------

export interface GameApi {
  /** Shows the score (the app draws it). */
  score(n: number): void;
  /** Ends the round: the app shows the game-over screen. */
  over(): void;
  /** Ends the round as a win. */
  win(): void;
  /** Does the player own this shop item? */
  has(itemId: string): boolean;
  /** Saves up to 8 KB of JSON for this game; it follows the player to a new phone (cloud save). False if it wasn't saved (too big, or a newer version of the game saved last). */
  save(data: unknown): boolean;
  /** A fresh copy of what save() kept, or `fallback` when there's nothing saved. */
  load(fallback?: unknown): Loose;
  clearSave(): void;
  /**
   * A second, larger save that stays on this phone: up to 512 KB of JSON, for big things that wouldn't be missed on a
   * new phone (a built world, drawings, recorded runs). False if it wasn't saved (too big, or a newer version saved last).
   */
  saveLocal(data: unknown): boolean;
  /** The phone-only save, or `fallback`. Call it in make() or reset(): the first read takes a moment, and the app waits for it there ("Loading…"). */
  loadLocal(fallback?: unknown): Loose;
  clearLocal(): void;
  /** Seconds since this game last ran on this phone (at most a week; about 0 once it has run this session). For idle games. */
  away(): number;
  /** The player's rounded position (needs `location` in the definition). Never fails: with no location it gives a stand-in, real: false, and why. */
  location(): Promise<GamePlace>;
  /** Calls cb now and each time the player moves to another grid cell, until the round ends or the returned stop() is called. */
  watchLocation(cb: (p: GamePlace) => void): () => void;
  /** Where the app's score badge sits (top centre), in game units, roomy enough for a 4-digit score: keep HUDs out of it. Changes with the screen (folding), so read it when drawing. */
  scoreArea(): { x: number; y: number; w: number; h: number; bottom: number };
  /** Where a finger that's down is heading by the next refresh, [x, y] in game units (id: that finger; none: the one that moved last). Null where the browser doesn't guess or the finger has stopped: draw to the real point then. */
  ahead(id?: number): [number, number] | null;
  /** Where this game's Tiny Brains keep what they learned. gs.brains reads it (new Brain(api, ...)); games don't. */
  brains: Loose;
}
/** What api.location() and api.watchLocation() give: a rounded position, or the stand-in (real: false; reason says why: 'denied', 'unavailable', 'not-playing', 'undeclared'...). */
export interface GamePlace { lat: number; lon: number; /** metres */ accuracy: number | null; real: boolean; precision: 'coarse' | 'precise' | null; reason?: string }

export interface Game {
  /** Set up everything for a new round here (Play again calls it too). */
  reset(): void;
  /** dt in seconds. */
  update(dt: number): void;
  /** Draw the whole frame in w × h game units. alpha (fixed-tick games): how far between the last two ticks, 0..1; else 1. */
  draw(c: Ctx, alpha?: number): void;
  down?(x: number, y: number, id: number): void;
  move?(x: number, y: number, pressed: boolean, id: number): void;
  up?(x: number, y: number, id: number): void;
  /** Desktop keys and controllers. */
  key?(k: string, isDown: boolean): void;
  /** Effects that keep playing behind the game-over screen. */
  fx?(dt: number): void;
  /** Fluid games (with maxW / maxH): the new size. */
  resize?(w: number, h: number): void;
  debug?(c: Ctx): void;
  pause?(): void;
  resume?(): void;
  /** Hot reload (npm run dev): what to carry over to the new code. Return plain data. */
  snapshot?(): unknown;
  /** Hot reload: called on the new game, after reset(), with what snapshot() returned. */
  restore?(data: unknown): void;
  [more: string]: Loose;
}

export interface GameDef {
  /** Same as the file name. */
  id: string;
  title: string;
  /** '<Style> · <Genre>', like 'Casual · Reflex'. */
  tag: string;
  /** One sentence that explains how to play. */
  hint: string;
  /** The score that counts as a win (a decent player gets there in about a minute). */
  goal: number;
  /** Leaderboard checks: the highest score a round can really reach (default: goal × 1000). */
  scoreMax?: number;
  /** Leaderboard checks: the most points a second a great player can keep up (default: goal × 2). */
  scoreRate?: number;
  w: number;
  h: number;
  /** Fixed game tick: update(1/tick) runs a whole number of times per frame on every screen rate (true = 60). */
  tick?: number | boolean;
  maxW?: number;
  maxH?: number;
  retro?: boolean;
  era?: 'color' | 'advance' | 'console' | 'nextgen' | 'ar' | 'board';
  pal?: string;
  creator?: string;
  location?: 'coarse' | 'precise';
  /** Save versions: raise version when a save's shape changes; migrate turns an older save into the new shape (migrateLocal: the same for the phone-only save). */
  save?: { version: number; migrate?(data: Loose, from: number): unknown; migrateLocal?(data: Loose, from: number): unknown };
  /** 'fine': move() gets every reading of a finger that's down (screens read touches faster than they draw), several per frame, oldest first. For drawing and tracing games; leave it out if the game reads one move's distance as a speed. */
  touch?: 'fine';
  /**
   * A soundtrack in one line: the app plays an original tune under each round, written from this mood and the
   * game's id, and has it follow the action (it builds towards the goal, lifts when the player scores, holds on
   * pause, stops at game over). 'happy' | 'calm' | 'tense' | 'spooky' | 'heroic' | 'sad' | 'silly' | 'chase' |
   * 'puzzle', or { mood, set, vol, seed, tempo, key, bars, voices }. set: the instruments; left out, pocket styles
   * play the chip sound and the others a synth group, band or orchestra to suit the mood. Leave `music` out of a
   * game that plays its own with gs.sound.music().
   */
  music?: MusicMood | { mood: MusicMood; set?: MusicSet; vol?: number; seed?: string | number; tempo?: number; key?: string; bars?: 4 | 8; voices?: Record<string, VoiceName | KitName | 'chip'> };
  /**
   * Pocket styles only: the look of an old handheld's screen. true, or { grid, ghost }: grid is how strong the fine
   * lines between pixels are (0 to .6), ghost how much of the last frame lingers (0 to .85; fast things leave a
   * short trail). Left out, the game is shown clean. Pixels are the same size on every phone either way.
   */
  lcd?: boolean | { grid?: number | boolean; ghost?: number | boolean };
  /** The most frames a second this game wants (the app picks a rate per phone, never above this). */
  fps?: number;
  /**
   * Next Gen and AR: frame generation on WebGPU, which makes the frames between real ones where the game
   * runs at half the screen's rate. Default: on, blending the last two frames. 'ahead': guess half a frame
   * past the newest instead (no added delay, for reflex and rhythm games). false: never (a game whose
   * look flickers on purpose, or whose picture changes in ways motion can't follow).
   */
  frameGen?: false | 'ahead';
  /** Credits paid for a win (10 if left out; double on the first win). */
  reward?: number;
  /** Things the player can buy for this game with credits; api.has(id) says whether one is in use this round. */
  shop?: { id: string; name: string; price: number; /** 'boost': used up by a round. 'unlock': kept. */ kind?: 'boost' | 'unlock'; desc?: string }[];
  /** true: this game gets its own best-score leaderboard (use sparingly: see docs/game-services.md). */
  board?: boolean;
  /** Fluid games (maxW / maxH): grow in steps of this many game units (a tile), not one at a time. */
  step?: number;
  /** Extra words for the feed's "For you" ranking, like 'theme:space'. */
  traits?: string[];
  /** 'world': needs native AR (walking around); the feed leaves it out on phones without it. Board games: false when the game's Table has ar: false, so the start card leaves the camera note out. */
  ar?: 'world' | false;
  make(api: GameApi): Game;
}

// ---------- core parts (always there) ----------

type SoundFx = (pitch?: number) => void;
export type SoundName = 'coin' | 'jump' | 'hurt' | 'hit' | 'boom' | 'laser' | 'shoot' | 'powerup' | 'select' | 'blip' | 'pop' | 'splash' | 'click' | 'win' | 'lose' | 'levelup' | 'countdown' | 'tick' | 'tock' | 'toggle' | 'back' | 'confirm' | 'deny' | 'open' | 'close' | 'step' | 'land' | 'dash' | 'skid' | 'flap' | 'bounce' | 'boing' | 'swoosh' | 'whoosh' | 'slip' | 'slash' | 'punch' | 'block' | 'clang' | 'bow' | 'reload' | 'zap' | 'charge' | 'shield' | 'thud' | 'crack' | 'shatter' | 'crumble' | 'blast' | 'gem' | 'key' | 'heal' | 'star' | 'chest' | 'combo' | 'perfect' | 'unlock' | 'cash' | 'drip' | 'bubble' | 'gust' | 'thunder' | 'crackle' | 'chirp' | 'croak' | 'buzz' | 'squeak' | 'growl' | 'beep' | 'alarm' | 'siren' | 'ring' | 'door' | 'lever' | 'teleport' | 'warp' | 'robot' | 'rev' | 'go' | 'buzzer' | 'fanfare' | 'tada' | 'whistle' | 'gong' | 'bell' | 'roll' | 'horn' | 'sad' | 'heart' | 'wobble' | 'squish' | 'plop' | 'zip' | 'honk' | 'twinkle' | 'pluck' | 'munch' | 'gulp';
/** Instrument sets for music(): 'chip' is square and triangle waves; the others are synths made in code (Tone.js). */
export type MusicSet = 'chip' | 'synth' | 'band' | 'orchestra';
/** Single voices, for music({ voices }) and instrument(). */
export type VoiceName = 'saw' | 'sub' | 'warm' | 'pulse' | 'epiano' | 'bassguitar' | 'organ' | 'pick' | 'flute' | 'cello' | 'strings' | 'harp' | 'brass' | 'bell' | 'kalimba' | 'marimba' | 'steelpan';
/** Drum kits, for music({ voices: { drums } }). */
export type KitName = 'kit' | '808' | 'concert';
export type MusicMood = 'happy' | 'calm' | 'tense' | 'spooky' | 'heroic' | 'sad' | 'silly' | 'chase' | 'puzzle';
export interface SoundPart {
  /** One beep: frequency, duration (s), wave, volume, pitch slide (Hz). */
  sfx(f?: number, d?: number, type?: OscillatorType, vol?: number, slide?: number): void;
  /**
   * Ready-made sounds (98): sounds.coin(), sounds.step()... Each takes a pitch multiplier (1 = normal). Ones that
   * repeat a lot (steps, hits, shots, whooshes) differ a touch each time; tuned ones (coins, jingles) play exact.
   * Menus: tick tock toggle back confirm deny open close select blip click. Moving: jump step land dash skid flap
   * bounce boing swoosh whoosh slip. Fights and breaking: hit hurt shoot laser boom blast slash punch block clang
   * bow reload zap charge shield thud crack shatter crumble. Rewards: coin gem key heal star chest combo perfect
   * unlock cash powerup levelup pop. Weather and animals: splash drip bubble gust thunder crackle chirp croak buzz
   * squeak growl. Machines: beep alarm siren ring door lever teleport warp robot rev. The round: countdown go win
   * lose buzzer fanfare tada whistle gong bell roll horn sad heart. Cartoon: wobble squish plop zip honk twinkle
   * pluck munch gulp.
   */
  sounds: Record<SoundName, SoundFx>;
  /** A note name ('C5', 'F#3') to Hz. */
  freq(note: string | number): number;
  /** One note. hold: seconds at full volume before it fades (0: fades from the start, like a pluck). wobble: [times a second, Hz either way] wavers the pitch. */
  tone(f: number | string, o?: { len?: number; wave?: OscillatorType; vol?: number; slide?: number; attack?: number; hold?: number; wobble?: [number, number]; at?: number; when?: number; out?: AudioNode; bus?: string }): void;
  noise(len?: number, o?: { vol?: number; from?: number; to?: number; filter?: BiquadFilterType; q?: number; at?: number; when?: number; attack?: number; hold?: number; out?: AudioNode; bus?: string }): void;
  /** The sound of a place: a reverb made in code. Play into sp.in (sound + echo) or give it to new Ears({ space }). Null without audio. */
  space(o?: { seconds?: number; decay?: number; wet?: number; bright?: number; pre?: number }): { in: AudioNode; tail: AudioNode; set(o: { wet?: number; bright?: number }, seconds?: number): Loose } | null;
  /** A steady background of noise (wind, rain, a river) that glides with set(); stops with the round, quiet while paused. */
  bed(o?: { vol?: number; from?: number; filter?: BiquadFilterType; q?: number; gusts?: number; out?: AudioNode }): { set(o: { vol?: number; from?: number; q?: number }, seconds?: number): Loose; stop(): void; [k: string]: Loose };
  /** Plays a tune like 'C5 E5 G5 - C6' ('-' is a rest). */
  notes(seq: string, o?: { len?: number; gap?: number; wave?: OscillatorType; vol?: number; at?: number }): number;
  /** Living music: the tune follows the play (tension from close calls, settles, a loss calms it, tempo leans to the player's pace). */
  follow(song: Loose, o?: { calm?: number; ease?: number; tempo?: [number, number]; pace?: number; brain?: Brain }): { readonly tension: number; readonly speed: number; feel(x?: number): Loose; tap(): Loose; lost(): Loose; won(): Loose; update(dt: number): Loose };
  /** Writes an original looping tune from a mood and a seed (same seed, same tune): pass it to music(). */
  compose(o?: { mood?: MusicMood; seed?: string | number; tempo?: number; key?: string; bars?: 4 | 8 }): { tempo: number; swing: number; layers: Record<string, number>; lead: string; bass: string; pad: string; pad2: string; arp: string; drums: string; drums2: string; lead2: string; info: { mood: string; key: string; mode: string; bars: number; chords: number[]; win: string; lose: string } };
  MOODS: Record<string, Loose>;
  /**
   * Background music from patterns; start it in update(), not reset(). set: the instruments, 'chip' (the default),
   * 'synth', 'band' or 'orchestra'; voices swaps single parts: { lead: 'bell', drums: 'kit' }. A set other than chip
   * uses Tone.js, which loads by itself: the tune plays in the chip sound until it's in.
   */
  music(o?: { tempo?: number; vol?: number; swing?: number; lead?: string; bass?: string; drums?: string; layers?: Record<string, number>; set?: MusicSet; voices?: Record<string, VoiceName | KitName | 'chip'>; [part: string]: Loose }): { start(): Loose; stop(): void; pause(): void; resume(): void; speed(x: number): Loose; layer(name: string, level?: number, fade?: number): Loose; intensity(x: number, fade?: number): Loose; readonly level: number; readonly playing: boolean; /** Where the tune is as the player hears it, in steps (a fraction), or -1 when it isn't playing. */ readonly pos: number; /** True once the set's instruments are in. */ readonly tuned: boolean; [k: string]: Loose };
  /** 3D sound: the listener follows the camera; sounds play at points in the world (HRTF in headphones). */
  Ears: new (o?: { ref?: number; max?: number; rolloff?: number; hrtf?: boolean; flat?: boolean; space?: { tail: AudioNode } | null; send?: number }) => {
    place(pos: { x: number; y: number; z?: number }, forward?: { x: number; y: number; z: number }, up?: { x: number; y: number; z: number }): Loose; place2d(x: number, y: number, facing?: number): Loose;
    tone(f: number | string, p: { x: number; y: number; z?: number }, o?: Loose): Loose; noise(len: number, p: { x: number; y: number; z?: number }, o?: Loose): Loose; zzfx(p: { x: number; y: number; z?: number }, ...params: (number | undefined)[]): Loose;
    play(name: string, p: { x: number; y: number; z?: number }, pitch?: number, o?: { muffled?: boolean }): Loose;
    loop(p: { x: number; y: number; z?: number }, wave?: OscillatorType, hz?: number, o?: { vol?: number; muffled?: boolean }): { move(p: { x: number; y: number; z?: number }): Loose; pitch(hz: number): Loose; volume(v: number): Loose; stop(): void };
    heard(p: { x: number; y: number; z?: number }): number;
  };
  /** ZzFX sound from its numbers (zzfx.micro). */
  zzfx(...params: number[]): void;
  zsound(...params: number[]): () => void;
  /** Tone.js (lazy: call it in make() or reset()). */
  Tone(): Loose;
  /** One instrument to play yourself (lazy: make it in make() or reset()): instrument('epiano').play('C4', { len: .4 }). */
  instrument(name: VoiceName, o?: { vol?: number }): { name: string; play(note: string | number, o?: { len?: number; vol?: number; at?: number }): Loose; free(): void };
  /** Which voice plays each part in each set, and the voices and drum kits themselves (their settings, read only). */
  SETS: Record<MusicSet, Record<string, string> | null>;
  VOICES: Record<VoiceName, Loose>;
  KITS: Record<KitName, Loose>;
  /** Seconds between a sound being played and the player hearing it (the phone's output, Bluetooth included where it says). gs.rhythm.Beat allows for it by itself. */
  delay(): number;
  /** Channels ('sfx', 'music', 'voice' or your own), ducking, room echo and muffle. Reset when the round ends. */
  mixer: {
    volume(name: string, v: number, fade?: number): Loose;
    duck(name?: string, to?: number, hold?: number, back?: number): Loose;
    room(r?: 'none' | 'room' | 'hall' | 'cave' | 'pipe' | { reverb?: number; size?: number; echo?: number; delay?: number }): Loose;
    muffle(x?: number, fade?: number): Loose;
    channel(name: string): { volume(v: number, fade?: number): Loose; duck(to?: number, hold?: number, back?: number): Loose };
    reset(): Loose;
  };
  /**
   * Speaks a line with the phone's own voices (text to speech). Resolves when it's said (false if it couldn't). Show the words too.
   * voice casts a character from the voices this phone has: 'woman' | 'man' | 'any', or { kind, lang (accents to try, in order),
   * take (the second, third... such voice, so a cast differs), like (voice names to prefer) }. An array of parts is said in
   * order with pauses (numbers, in seconds) between; a part can be { text, pitch, rate, volume, voice, lang } for its own delivery.
   */
  say(text: string | SayPart[], o?: { pitch?: number; rate?: number; volume?: number; lang?: string | string[]; voice?: SayVoice | null; onWord?: (at: number) => void }): Promise<boolean>;
  /** The voices this phone has to cast from (joke voices left out). kind is null when the phone doesn't say. */
  voices(): Promise<{ name: string; lang: string; kind: 'woman' | 'man' | null }[]>;
  stopTalking(): void;
  talking(): boolean;
}

/** A character's voice for gs.sound.say: a kind, or which accents to try, which take of that kind, and voices to prefer by name. */
export type SayVoice = 'woman' | 'man' | 'any' | { kind?: 'woman' | 'man' | 'any'; lang?: string | string[]; take?: number; like?: string | string[] };
/** One part of a spoken line: words, a pause in seconds, or words with their own delivery. */
export type SayPart = string | number | { text: string; pitch?: number; rate?: number; volume?: number; voice?: SayVoice | null; lang?: string | string[] };

export interface HapticEvent { at?: number; len?: number; strength?: number; sharpness?: number; to?: number }
declare const HAPTIC_NAMES: { tap: 1; thud: 1; heartbeat: 1; explosion: 1; charge: 1; engine: 1; rain: 1; rumble: 1; success: 1; fail: 1 };
export interface Mic { level(): number; pitch(): { hz: number; note: string; midi: number; clarity: number } | null; blow(): number; clapped(): boolean; whistle(): number; stop(): void }
export type HapticKind = 'light' | 'medium' | 'heavy' | 'tick' | 'success' | 'warning' | 'error';
export interface DevicePart {
  /** Steps walked since the round started (null until the step counter runs and the player allowed it). */
  steps(): { count: number; new: number; perMinute: number } | null;
  /** Air pressure and height change (metres) since the round started. */
  pressure(): { hPa: number; height: number } | null;
  /** The room's light (Android; some browsers). */
  light(): { lux: number; dark: boolean } | null;
  /** Something right over the top of the phone (Android). */
  near(): boolean | null;
  /** Does this phone have it? null while still being asked. */
  hasSensor(kind: 'steps' | 'pressure' | 'light' | 'near'): boolean | null;
  haptic(kind?: HapticKind): void;
  /** Morse-like buzz pattern: 0 short, 1 long. */
  buzz(pattern: (number | boolean)[], short?: number, long?: number, gap?: number): void;
  canBuzz(): boolean;
  /** Rich haptics: taps (no len) and buzzes (len s) with strength and sharpness 0..1, `to` fades a buzz, at in seconds. Or a name from HAPTICS. Returns its length (s). */
  hapticPattern(events: HapticEvent[] | keyof typeof HAPTIC_NAMES | string, o?: { len?: number; strength?: number }): number;
  /** Ready-made patterns: tap, thud, heartbeat, explosion, charge, engine, rain, rumble, success, fail. */
  HAPTICS: Readonly<Record<string, (o: { len?: number; strength?: number }) => HapticEvent[]>>;
  stopHaptics(): void;
  /** Ask for a sensor before Play: 'motion', 'mic', 'camera'... */
  want(feature: string): void;
  /** Tilt -1..1 on each axis, or null when there's no sensor (give a touch fallback). */
  tilt(): XY | null;
  calibrateTilt(): void;
  onMotion(cb: (m: Loose) => void): () => void;
  /** cb(strength) on each shake: about 28 (a light shake) to 70 and more (a hard one). */
  onShake(cb: (strength: number) => void): () => void;
  orientation(): Loose;
  /** Compass heading in degrees, or null. */
  heading(): number | null;
  faceDown(): boolean | null;
  /** The mic (call from a tap): level(), pitch() -> { hz, note, midi, clarity } | null, blow(), clapped(), whistle(), stop(); or null if refused. */
  startMic(): Promise<Mic | null>;
  stopMic(): void;
  startCamera(): Promise<Loose>;
  stopCamera(): void;
}

export interface UtilPart {
  clamp(v: number, a: number, b: number): number;
  rnd(a: number, b: number): number;
  /** Draws a tiny pixel map: each char keys into col, '.' is clear. */
  pix(c: Ctx, map: string[], x: number, y: number, col: Record<string, string>): void;
  disc(c: Ctx, x: number, y: number, r: number): void;
  hash(str: string): number;
  fmt(n: number): string;
  flickTracker(): Loose;
  /** The i-th letter: letter(0) is 'A' (wraps after 'Z'); { lower: true } for lower case. */
  letter(i: number, o?: { lower?: boolean }): string;
}

export interface Rng { (): number; int(a: number, b: number): number; pick<T>(list: T[]): T; [k: string]: Loose }
export interface Timer { cancel(): void; dead: boolean }
export interface MathPart {
  /** Seeded random numbers (same seed, same run). */
  rng(seed?: number | string): Rng;
  /** A seed that's the same for everyone today. */
  daily(salt?: string, date?: Date): number;
  seedOf(s: string): number;
  noise2(x: number, y: number): number;
  noise3(x: number, y: number, z: number): number;
  noiseSeed(seed: number | string): void;
  makeNoise(seed: number | string): (x: number, y: number, z?: number) => number;
  fbm(x: number, y: number, octaves?: number): number;
  vec: Loose;
  overlap(a: Loose, b: Loose): boolean;
  angleDiff(a: number, b: number): number;
  wrap(v: number, max: number): number;
  Grid: new (w: number, h: number, fill?: Loose) => Loose;
  /** Game timing that pauses with the game: timers.after(1.5, fn); timers.update(dt) each frame. */
  Timers: new () => { after(sec: number, fn: () => void): Timer; every(sec: number, fn: () => void): Timer; update(dt: number): void; clear(): void };
}

export interface PalettesPart { PAL: Record<string, string[]>; SHELL: Loose; C16: string[] }

/** spread: how much each particle's speed varies, 0..1 (default .6). The cone is angle + arc (radians). shrink: false keeps them full size as they fade. */
export interface BurstOpts { n?: number; speed?: number; spread?: number; life?: number; size?: number; shrink?: boolean; color?: Colour; shape?: string; angle?: number; arc?: number; gravity?: number; drag?: number; glow?: boolean }
export declare class Juice {
  constructor(o?: { pixel?: boolean; max?: number; font?: string; size?: number; color?: string });
  burst(x: number, y: number, o?: BurstOpts): this;
  emit(x: number, y: number, vx: number, vy: number, o?: BurstOpts): this;
  shake(amount: number): this;
  pop(x: number, y: number, text: string, o?: { color?: string; size?: number }): this;
  tween(obj: object, props: object, dur: number, ease?: (t: number) => number, delay?: number): Loose;
  flash(color?: string, a?: number, dur?: number): this;
  /** Hit-stop: freeze the action for a moment. */
  freeze(sec?: number): this;
  readonly frozen: boolean;
  update(dt: number): void;
  begin(c: Ctx): void;
  end(c: Ctx, W?: number, H?: number): void;
  clear(): void;
}
export interface JuicePart {
  Juice: typeof Juice;
  Particles: Loose; Popups: Loose; Shake: Loose; Tweens: Loose;
  ease: Record<string, (t: number) => number>;
  lerp(a: number, b: number, t: number): number;
  /** Smoothly approach target (frame-rate independent). */
  approach(cur: number, target: number, rate: number, dt: number): number;
  pulse(t: number, period?: number): number;
  /** Steps in order, together and staggered (anime.js, lazy: make it in make() or reset()). Times in seconds; tl.update(dt) each frame. */
  Timeline: new (o?: { loop?: boolean | number; alternate?: boolean; ease?: string | ((t: number) => number); duration?: number }) => Timeline;
  /** A delay that grows along a list of targets: stagger(.1). */
  stagger(each: number, o?: { from?: 'first' | 'center' | 'last' | number; start?: number; [k: string]: Loose }): Loose;
}
export interface Timeline {
  to(targets: object | object[], params: { duration?: number; delay?: number | Loose; ease?: string | ((t: number) => number); [k: string]: Loose }, position?: number | string): this;
  call(fn: () => void, position?: number | string): this;
  label(name: string, position?: number | string): this;
  update(dt: number): this; play(): this; pause(): this; seek(t: number): this; restart(): this;
  readonly duration: number; readonly done: boolean; time: number; speed: number; playing: boolean;
}

export declare class Feel {
  constructor(o?: { pixel?: boolean; sound?: boolean; buzz?: boolean });
  juice: Juice;
  readonly frozen: boolean;
  update(dt: number): this;
  begin(c: Ctx): this;
  end(c: Ctx, W: number, H: number): this;
  clear(): this;
  coin(x: number, y: number, o?: { color?: string; text?: string; pitch?: number }): this;
  hit(x: number, y: number, o?: { color?: string; power?: number }): this;
  boom(x: number, y: number, o?: { size?: number; color?: Colour }): this;
  hurt(x?: number, y?: number): this;
  jump(x: number, y: number): this;
  land(x: number, y: number, speed?: number): this;
  shoot(x: number, y: number, o?: { color?: string; angle?: number }): this;
  powerup(x: number, y: number, o?: { color?: string; text?: string }): this;
  combo(n: number, x: number, y: number, o?: { color?: string }): this;
  score(x: number, y: number, points: number, o?: { color?: string }): this;
  win(x?: number, y?: number): this;
  lose(): this;
  click(): this;
  play(zzfxParams: number[], buzz?: HapticKind): this;
}

interface Control { wants(x: number, y: number): boolean; release(): void; down(x: number, y: number, id?: number): boolean; move(x: number, y: number, pressed: boolean, id?: number): boolean; up(x: number, y: number, id?: number): boolean; draw(c: Ctx, o?: Loose): void }
export interface ControlsPart {
  /** Virtual thumbstick: x, y (-1..1), mag, angle, active. */
  Stick: new (o?: { x?: number; y?: number; r?: number; floating?: boolean; zone?: number[]; dead?: number; axis?: 'both' | 'x' | 'y'; color?: string }) => Control & { x: number; y: number; readonly mag: number; readonly angle: number; readonly active: boolean; place(x: number, y: number, zone?: number[]): void };
  /** Round button: isDown, pressed() once per press, released(), heldFor. */
  Button: new (o?: { x?: number; y?: number; r?: number; label?: string; zone?: number[]; color?: string }) => Control & { isDown: boolean; readonly heldFor: number; pressed(): boolean; released(): boolean; place(x: number, y: number, zone?: number[]): void };
  /** Tap, double tap, hold and swipe. */
  Gestures: new (o?: Loose) => Loose;
  /** Pinch, twist and two-finger pan (one-finger touches go to `one`). Reads: active, scale, angle, x, y. */
  TwoFingers: new (o?: { zone?: number[]; one?: Loose; minScale?: number; minTurn?: number; pinch?: (scale: number, x: number, y: number) => void; twist?: (angle: number, x: number, y: number) => void; pan?: (dx: number, dy: number) => void; start?: (x: number, y: number) => void; end?: (scale: number, angle: number) => void }) => Control & { readonly active: boolean; readonly scale: number; readonly angle: number; readonly x: number; readonly y: number; update(): void };
  /** Keyboard state: keys.held('ArrowLeft'), keys.axis(). Pass key(k, isDown) to keys.key. */
  Keys: new () => { key(k: string, isDown: boolean): void; held(k: string): boolean; axis(): XY; clear(): void };
  /** Hands each finger to the first control that wants it. */
  route(...controls: Loose[]): { down: Game['down']; move: Game['move']; up: Game['up'] };
  /** Left stick plus a right stick (right: 'stick') or named buttons (right: ['A', 'B']). */
  twoThumb(W: number, H: number, o?: { right?: 'stick' | string[]; r?: number }): Loose;
}

export interface PadState { [k: string]: Loose; pressed(button: string): boolean }
export interface PadPart { pad(i?: number): PadState | null; pads(): PadState[]; rumble(strength?: number, ms?: number, i?: number): void; padConnected(): boolean }

export type MoveType = 'swing' | 'punch' | 'throw' | 'flip' | 'twist' | 'knock' | 'shake' | 'any';
export interface MovesPart { Moves: new (o?: { sensitivity?: number }) => { on(type: MoveType, fn: (m: { type: string; dir?: string; power?: number }) => void): Loose; update(): void; stop(): void } }

/** The fonts gs.pixel.text draws. */
export type PixelFontName = 'small' | 'big' | 'silkscreen' | 'silkscreen bold' | 'tiny' | 'jersey' | 'terminal';
/** The fonts in the font library (names work in any case). */
export type FontName = 'Rubik' | 'Bangers' | 'Fredoka' | 'Titan One' | 'Bungee' | 'Orbitron' | 'Creepster' | 'Pirata One' | 'Rye' | 'Monoton' | 'Black Ops One' | 'Cinzel' | 'Patrick Hand' | 'Courier Prime' | 'Press Start 2P' | 'Silkscreen' | 'Tiny5' | 'Jersey 10' | 'VT323';
/** gs.fonts: open-licence fonts that ship inside the app; a font's file loads the first time a game names it. */
export interface FontsPart {
  /**
   * The string for c.font: font('Bangers', 34) is '400 34px "Bangers", Rubik, sans-serif'. Starts the font loading on
   * first use; the text draws in Rubik until it is in. weight: 400 by default; the nearest weight the font has is used.
   */
  font(name: FontName | (string & {}), size?: number, weight?: number): string;
  /** In make() or reset(): have these fonts in before the first frame ("Loading…" the first time). A name, or [name, weight]. */
  use(...names: (FontName | [FontName, number])[]): boolean;
  /** Is this font in and ready to draw? */
  ready(name: FontName | (string & {}), weight?: number): boolean;
  /** Every font: its name, what it looks like, the weights that ship, and for pixel fonts the size in px its pixels are crisp at (else 0). */
  readonly list: readonly { readonly name: FontName; readonly look: string; readonly weights: readonly number[]; readonly pixel: number }[];
}

export interface PixelPart {
  /**
   * Crisp pixel text with its top-left at x, y; returns the width drawn. font: 'small' (3×5 capitals), 'big' (8×8), or one
   * from the font library: 'silkscreen', 'silkscreen bold' (capitals 5 high), 'tiny' (5 high, with small letters),
   * 'jersey' (10 high), 'terminal' (14 high). A library font loads on first use; until then the text is in 'big'.
   */
  text(c: Ctx, str: string, x: number, y: number, o?: { size?: number; font?: PixelFontName; align?: 'left' | 'center' | 'right'; color?: string; outline?: string | null; shadow?: string | null }): number;
  /** Width and height in pixels at size 1. */
  measure(str: string, font?: PixelFontName): { w: number; h: number };
  sprite(art: string | string[], palette: Record<string, string> | string[]): Loose;
  anim(frames: (string | string[])[], palette: Record<string, string> | string[], fps?: number): Loose;
  tiles(art: Loose, palette: Loose, tw: number, th: number): Loose;
}

export interface GfxPart {
  shade(hex: string, amt: number): string;
  shadow(c: Ctx, x: number, y: number, rx: number, ry?: number, a?: number): void;
  box(c: Ctx, x: number, y: number, w: number, h: number, col: string, o?: { r?: number; drop?: boolean; rim?: boolean }): void;
  ball(c: Ctx, x: number, y: number, r: number, col: string, o?: { gloss?: number }): void;
  glow(c: Ctx, x: number, y: number, r: number, col: string, a?: number): void;
  backdrop(c: Ctx, x: number, y: number, w: number, h: number, top: string, bottom: string): void;
  post(c: Ctx, w: number, h: number): void;
  /** The materials, and the colour each starts as. */
  readonly MATERIALS: Readonly<Record<MaterialName, string>>;
  /**
   * A material made in code, to fill shapes with (no image files; worked out once and remembered). The same options give
   * the same material back. `c.fillStyle = m.at(x, y)` fills with the texture's corner at (x, y), so a thing that moves
   * carries its texture with it; m.pattern is the same at 0, 0; m.tile is the picture itself. For the smooth styles.
   */
  material(name: MaterialName | Material2D, o?: MaterialOptions): Material2D;
  /** A material's tile as numbers: a size x size RGBA picture that repeats without a seam (px: its size, 256). */
  texture(name: MaterialName, o?: MaterialOptions & { px?: number }): { size: number; data: Uint8ClampedArray };
  /**
   * A block of a material: rounded corners, lit from the top left, a soft shadow under it. r: corner radius (6). bevel:
   * the lit edge's width (2; 0 is flat). shadow: true, false, or how far it drops. tint: a colour washed over it
   * ('#ff000040'). anchor: [x, y] the texture is fixed to (by default the block's own corner, so it moves with it).
   */
  slab(c: Ctx, x: number, y: number, w: number, h: number, mat?: MaterialName | Material2D, o?: { r?: number; bevel?: number; shadow?: boolean | number; tint?: string | null; anchor?: [number, number] | null }): void;
  /**
   * Water in a rectangle with light moving on it. t: the game's time in seconds. color: the water at the top; deep: at
   * the bottom; light: the moving net of light; strength 0..1 (.5); scale (1); flow: [x, y] game units a second it drifts.
   * For a pond of another shape, clip to the shape first.
   */
  water(c: Ctx, x: number, y: number, w: number, h: number, t?: number, o?: { color?: string; deep?: string | null; light?: string; strength?: number; scale?: number; flow?: [number, number] }): void;
  /**
   * Keeps a drawing as a picture (one drawImage however much went into it) and adds the looks that are slow to draw
   * every frame: an outline, a glow, a soft shadow. draw(g, w, h) draws it once into a w by h box. Make it in make() or reset().
   */
  sticker(w: number, h: number, draw: (g: Ctx, w: number, h: number) => void, o?: { outline?: string; width?: number; glow?: string; glowSize?: number; shadow?: boolean | string; shadowBlur?: number; shadowX?: number; shadowY?: number; res?: number }): Sticker2D;
}
export type MaterialName = 'paper' | 'wood' | 'stone' | 'metal' | 'cloth' | 'water';
/** color: its main colour. seed: a different piece of it. scale: 1 is 128 game units a tile. contrast: 1 (0 flat, 2 strong). planks: boards down a wood tile. blocks: rows of stone blocks (even numbers). threads: across a cloth tile (32). */
export interface MaterialOptions { color?: string; seed?: number; scale?: number; contrast?: number; planks?: number; blocks?: number; threads?: number }
export interface Material2D {
  readonly name: string;
  /** The tile itself (a canvas), for drawImage. */
  readonly tile: CanvasImageSource;
  /** Game units one tile covers. */
  readonly span: number;
  /** The fill for c.fillStyle with the texture's corner at 0, 0. */
  readonly pattern: CanvasPattern;
  /** The fill for c.fillStyle with the texture's corner at (x, y). */
  at(x?: number, y?: number): CanvasPattern;
}
export interface Sticker2D {
  readonly w: number; readonly h: number;
  /** Draws it centred on (x, y). anchor: which point of the drawing sits on x, y ([.5, .5]; [0, 0] is its top left). */
  draw(c: Ctx, x: number, y: number, o?: { scale?: number; angle?: number; alpha?: number; flip?: boolean; anchor?: [number, number] | null }): void;
  /** Draw it afresh next time (something the drawing depends on changed). */
  redraw(): Sticker2D;
}

/** Options for a sketchy shape: stroke ('#222' or 'none'), strokeWidth (2), fill, fillStyle, roughness (1; 0 a ruler, 3 a shaky hand), bowing (1), dash ([on, off]). */
export interface SketchOptions {
  stroke?: string; strokeWidth?: number; fill?: string; fillStyle?: 'hachure' | 'solid' | 'zigzag' | 'cross-hatch' | 'dots' | 'dashed' | 'zigzag-line';
  fillWeight?: number; hachureGap?: number; hachureAngle?: number; roughness?: number; bowing?: number; dash?: [number, number] | number[];
}
type SketchPoint = [number, number] | { x: number; y: number };
/** Options for an ink stroke: size (8, the widest it gets), thinning (.5; 0 an even line), smoothing (.5), streamline (.5), taper (0, a length, true, or { start, end }), color, pressure (use the points' own pressure), spacing (for a line through a few far-apart points: adds points so none are further apart than this). */
export interface InkOptions { size?: number; thinning?: number; smoothing?: number; streamline?: number; taper?: number | boolean | { start?: number | boolean; end?: number | boolean }; color?: string; pressure?: boolean; spacing?: number }
type InkPoint = [number, number] | [number, number, number] | { x: number; y: number; pressure?: number };
/** gs.sketch: hand-drawn looks (Rough.js and perfect-freehand; loads on first use). */
export interface SketchPart {
  /**
   * A pen that draws sketchy shapes. A shape is worked out once and remembered wherever it is drawn. seed: a different
   * hand. boil: wobbles a second (0 keeps it still; call update(dt)).
   */
  Sketch: new (o?: SketchOptions & { seed?: number; boil?: number }) => {
    boil: number; seed: number; readonly remembered: number;
    update(dt: number): void; clear(): void;
    rect(c: Ctx, x: number, y: number, w: number, h: number, o?: SketchOptions): void;
    circle(c: Ctx, x: number, y: number, r: number, o?: SketchOptions): void;
    ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, o?: SketchOptions): void;
    line(c: Ctx, x1: number, y1: number, x2: number, y2: number, o?: SketchOptions): void;
    /** A closed shape through the points. */
    poly(c: Ctx, points: SketchPoint[], o?: SketchOptions): void;
    /** Straight lines from point to point, left open. */
    lines(c: Ctx, points: SketchPoint[], o?: SketchOptions): void;
    /** A smooth curve through the points. */
    curve(c: Ctx, points: SketchPoint[], o?: SketchOptions): void;
    /** Part of a circle, from angle `from` to `to` (radians). closed: a pie slice. */
    arc(c: Ctx, x: number, y: number, r: number, from: number, to: number, o?: SketchOptions & { closed?: boolean }): void;
    /** An SVG path, with its own 0, 0 at (x, y). */
    path(c: Ctx, x: number, y: number, d: string, o?: SketchOptions): void;
  };
  /** One ink stroke that grows as points are added and remembers its shape: add(x, y) while the finger moves, end() when it lifts, draw(c) each frame. */
  Ink: new (o?: InkOptions) => {
    readonly points: number[][]; readonly length: number; done: boolean;
    add(x: number, y: number, pressure?: number): Loose; end(): Loose; clear(): Loose;
    outline(): number[][];
    /** Is (x, y) on the ink (within r of it)? */
    hit(x: number, y: number, r?: number): boolean;
    draw(c: Ctx, o?: { color?: string }): boolean;
  };
  /** Draws one ink stroke through the points in one call (a gs.strokes Stroke works too). */
  ink(c: Ctx, points: InkPoint[] | { points: InkPoint[] }, o?: InkOptions): boolean;
  /** The outline of an ink stroke: [[x, y], ...], a closed shape to fill or to test. */
  inkOutline(points: InkPoint[] | { points: InkPoint[] }, o?: InkOptions, done?: boolean): number[][];
}

/** gs.icons: 528 drawn icons that look the same on every phone (game-icons.net, CC BY 3.0; loads on first use). */
export interface IconsPart {
  /**
   * Draws an icon centred on (x, y), `size` game units across. Names are the set's own ('broadsword', 'health-potion')
   * or one of about 100 plain words ('sword', 'heart', 'coin', 'star', 'key'...). color ('#fff'), outline (a colour),
   * width (the outline's, 1/16 of the size), angle, alpha, flip, pixel (hard pixels for the pixel styles). False if
   * there is no icon by that name.
   */
  icon(c: Ctx, name: string, x: number, y: number, size?: number, o?: { color?: string; outline?: string | null; width?: number; angle?: number; alpha?: number; flip?: boolean; pixel?: boolean }): boolean;
  /** Every icon's name, a to z. */
  readonly names: readonly string[];
  /** The plain words that also work, and the icon each is: { sword: 'broadsword', ... }. */
  readonly words: Readonly<Record<string, string>>;
  has(name: string): boolean;
  /** Icons whose name has this text in it. */
  find(text: string): string[];
  /** The icon as a Path2D on a 512 by 512 grid (to fill, stroke or clip with yourself), or null. */
  path(name: string): Path2D | null;
  /** The icon's SVG path data on a 512 by 512 grid, or null. */
  data(name: string): string | null;
  /** How many drawn icons are remembered right now. */
  remembered(): number;
}

/** Rapier 2D (lazy: make it in make() or reset()). */
export interface PhysicsPart { Physics: new (o?: { gravity?: number; walls?: number[]; [k: string]: Loose }) => Loose; Body: Loose; World: Loose; loadPhysics(): Promise<Loose>; physicsReady(): boolean }

/** Face and hand tracking (lazy). Positions are 0..1, mirrored like a selfie. In the phone apps it runs on the phone's AI chip
 *  (backend 'npu'), where the camera picture never reaches the game: pass `preview: true` if the game draws `picture`. */
export interface VisionPart {
  Face: new (o?: { preview?: boolean }) => { start(): void; stop(): void; update(): boolean; ready: boolean; found: boolean; backend?: string; picture: HTMLVideoElement | null; x: number; y: number; size: number; yaw: number; pitch: number; roll: number; mouth: number; smile: number; blink: boolean; winkLeft: boolean; winkRight: boolean; brows: number; [k: string]: Loose };
  Hands: new (o?: { max?: number; preview?: boolean }) => { start(): void; stop(): void; update(): boolean; ready: boolean; found: boolean; backend?: string; picture: HTMLVideoElement | null; list: Loose[]; first: Loose | null };
  /** The whole body (stand back): joints by name, armsUp, leftUp, rightUp, lean, squat, jump, clap. Web view only. */
  Body: new (o?: { max?: number; preview?: boolean }) => { start(): void; stop(): void; update(): boolean; ready: boolean; found: boolean; picture: HTMLVideoElement | null; x: number; y: number;
    joints: Record<'nose' | 'leftShoulder' | 'rightShoulder' | 'leftElbow' | 'rightElbow' | 'leftHand' | 'rightHand' | 'leftHip' | 'rightHip' | 'leftKnee' | 'rightKnee' | 'leftFoot' | 'rightFoot', { x: number; y: number; seen: number }>;
    armsUp: boolean; leftUp: boolean; rightUp: boolean; lean: number; squat: number; jump: boolean; clap: boolean; people: Loose[]; points: Loose[] };
  /** The player cut out of the camera picture: draw cut.picture (a canvas, see-through round the person). */
  CutOut: new (o?: { soft?: number; size?: number }) => { start(): void; stop(): void; update(): boolean; ready: boolean; found: boolean; amount: number; soft: number; picture: HTMLCanvasElement | null };
  /** Hand signs: thumbs-up, thumbs-down, victory, open-palm, fist, point-up, love. */
  Signs: new (o?: { max?: number; sure?: number }) => { start(): void; stop(): void; update(): boolean; ready: boolean; found: boolean; list: { sign: string; score: number; side: 'left' | 'right'; x: number; y: number }[]; sign: string; made: string | null; showing(name: string): boolean };
  /**
   * Spots everyday things with the back camera, 80 of them (Objects.names: 'cup', 'banana', 'book', 'dog', 'chair'...), a few times a
   * second: scavenger hunts and "show me a...". Positions are 0..1 of `picture`, the camera picture cut to `shape` (width / height).
   */
  Objects: {
    new (o?: { /** Names to look for (default: all 80). */ want?: string[]; /** How sure before a thing counts, 0..1 (.5). */ sure?: number; /** How many things at once (5). */ max?: number;
      /** Seconds between looks (.25). */ every?: number; /** Width / height the game draws the picture at (default: the camera's own). */ shape?: number; camera?: 'back' | 'front' }): VisionObjects;
    /** The 80 things it knows. */ readonly names: readonly string[];
  };
  /**
   * Reads barcodes and QR codes with the back camera: the same code gives the same `seed` on every phone, to make a creature, a level or
   * loot from anything in the house. The phone's own reader where it has one, ZXing elsewhere. Not lazy: make it any time.
   */
  Scanner: {
    new (o?: { /** Which kinds to read (default: all of Scanner.kinds). */ kinds?: VisionCodeKind[]; /** Seconds between looks (.15). */ every?: number;
      /** Width / height the game draws the picture at (default: the camera's own). */ shape?: number; camera?: 'back' | 'front'; /** How many codes at once (1). */ max?: number }): VisionScanner;
    readonly kinds: readonly VisionCodeKind[];
    /** The seed a text gives (the one a code with that text gives), 0 to 4,294,967,295: for a typed word in place of a code. */
    seed(text: string): number;
  };
  loadVision(): Promise<Loose>;
}
export type VisionCodeKind = 'qr' | 'ean-13' | 'ean-8' | 'upc-a' | 'upc-e' | 'code-128' | 'code-39' | 'code-93' | 'codabar' | 'itf' | 'data-matrix' | 'aztec' | 'pdf417';
/** Something Objects found: x, y is its middle, left, top its corner, all 0..1 of the picture. */
export interface VisionThing { name: string; sure: number; x: number; y: number; w: number; h: number; left: number; top: number }
/** A code Scanner read: its text, kind and seed; x, y is its middle, left, top its corner, corners its four corners, all 0..1 of the picture. */
export interface VisionCode { text: string; kind: VisionCodeKind; seed: number; x: number; y: number; w: number; h: number; left: number; top: number; corners: XY[] }
interface VisionLooker {
  /** Asks for the camera (call it from a tap). `failed` says why if it couldn't. */ start(): Promise<unknown>; stop(): void;
  /** Every update: true when a look has just come back. */ update(): boolean;
  ready: boolean; running: boolean; failed: unknown; found: boolean;
  /** The camera picture, already the shape asked for: c.drawImage(picture, 0, 0, W, H). null until the camera runs. */ readonly picture: HTMLCanvasElement | null;
}
export interface VisionObjects extends VisionLooker {
  /** What this look found, surest first. */ list: VisionThing[]; /** The surest (or null). */ top: VisionThing | null;
  /** True once for each time one comes into view. With no name: which thing just came into view (or null). */
  seen(name: string): boolean; seen(): string | null;
  /** How sure it is that one is in view now (0 when not). */ seeing(name: string): number;
  /** How many of them are in the picture now. */ count(name: string): number;
}
export interface VisionScanner extends VisionLooker {
  /** The code that has just been read, once for each time one comes into view (else null). */ scan(): VisionCode | null;
  /** The code in view now (or null). */ code: VisionCode | null; list: VisionCode[];
  /** 'phone' (the phone's own reader) or 'zxing'; null until started. */ backend: 'phone' | 'zxing' | null;
}

type LatLon = { lat: number; lon: number };
export interface GeoPart { distance(a: LatLon, b: LatLon): number; bearing(a: LatLon, b: LatLon): number; offset(p: LatLon, east: number, north: number): LatLon; toLocal(origin: LatLon, p: LatLon): XY; cellId(p: LatLon, metres?: number): string }

/** gs.real: real-world signals as game inputs. Worked out on the phone; no permission needed. */
export interface RealPart {
  /**
   * The sun where the player is. place: a { lat, lon } from api.location(); without one it is a guess from the
   * phone's clock and time zone (guess: true). when: a Date or a time in ms (default: now).
   */
  sun(place?: { lat: number; lon: number } | null, when?: Date | number): {
    /** Above the horizon. */ up: boolean;
    /** Degrees above the horizon (negative below it). */ height: number;
    /** Degrees clockwise from north, like gs.device.heading(). */ compass: number;
    /** 0 at night to 1 in full day, smooth through dawn and dusk. */ light: number;
    part: 'night' | 'dawn' | 'day' | 'dusk';
    /** Hours on the phone's clock (6.5 = half past six); null where the sun doesn't rise or set today. */ rise: number | null; set: number | null; noon: number | null;
    /** The hour for gs.sky's Sky so its sky matches the real one: 6 at sunrise, 12 at the sun's highest, 18 at sunset. */ hour: number;
    guess: boolean;
  };
  /** The moon where the player is (the phase is the same everywhere). */
  moon(place?: { lat: number; lon: number } | null, when?: Date | number): {
    /** 0 new, .25 first quarter, .5 full, .75 last quarter. */ phase: number;
    /** How much of its face is lit, 0 to 1. */ lit: number;
    waxing: boolean;
    name: 'new' | 'waxing crescent' | 'first quarter' | 'waxing gibbous' | 'full' | 'waning gibbous' | 'last quarter' | 'waning crescent';
    up: boolean; height: number; compass: number; guess: boolean;
  };
  /** The phone's battery: level 0 to 1 and charging (both null where the phone won't say), and whether power saving is on. */
  battery(): { level: number | null; charging: boolean | null; saver: boolean };
  /** Is the sound going to headphones (wired, USB or Bluetooth)? null when the phone won't say. */
  headphones(): boolean | null;
}

export interface Thing { dead?: boolean; tags?: Set<string>; x?: number; y?: number; r?: number; w?: number; h?: number; update?(dt: number, things: Loose): void; [k: string]: Loose }
/** A place that moves with its parent: x, y, angle, scale are relative; wx, wy, wangle, wscale are in game units after update(). */
export declare class Node {
  constructor(o?: { x?: number; y?: number; angle?: number; scale?: number; r?: number; w?: number; h?: number; [k: string]: Loose });
  x: number; y: number; angle: number; scale: number; visible: boolean; r?: number; w?: number; h?: number;
  readonly wx: number; readonly wy: number; readonly wangle: number; readonly wscale: number;
  parent: Node | null; children: Node[];
  add<T extends Node>(child: T): T; remove<T extends Node>(child: T): T; attach(parent: Node | null): this; update(): this;
  toWorld(x: number, y: number): XY; toLocal(x: number, y: number): XY; hit(x: number, y: number): boolean; pick(x: number, y: number): Node | null;
  each(fn: (n: Node) => void): this; draw(c: Ctx, fn: (c: Ctx, n: Node) => void): this;
  [k: string]: Loose;
}
export interface ThingsPart {
  Node: typeof Node;
  Things: new (o?: { plane?: 'xy' | 'xz'; cell?: number }) => {
    add<T extends object>(obj: T, ...tags: string[]): T & Thing;
    reuse<T extends object>(tag: string, make?: () => T, init?: (obj: T) => void): T & Thing;
    kill<T>(obj: T): T;
    tag<T>(obj: T, tag: string): T; untag<T>(obj: T, tag: string): T; is(obj: Loose, tag: string): boolean;
    all(tag?: string): Thing[]; count(tag?: string): number; first(tag: string): Thing | null; each(tag: string, fn: (t: Thing) => void): void;
    touch(a: Thing, b: Thing, pad?: number): boolean;
    hit(obj: Thing, tag: string, pad?: number): Thing | null;
    hitsOf(obj: Thing, tag: string, pad?: number): Thing[];
    hits(tagA: string, tagB: string, fn: (a: Thing, b: Thing) => void, pad?: number): void;
    near(x: number, y: number, radius: number, tag?: string): Thing[];
    nearest(x: number, y: number, tag?: string, ok?: (t: Thing) => boolean): Thing | null;
    cull(x0: number, y0: number, x1: number, y1: number, margin?: number, tag?: string): void;
    update(dt: number): void; sweep(): void; clear(): void;
  };
}

export interface Scene { enter?(scenes: Loose, data?: Loose): void; update?(dt: number, scenes: Loose): void; draw?(c: Ctx, scenes: Loose): void; [input: string]: Loose }
export interface RoundsPart {
  Scenes: new (scenes: Record<string, Scene>, start: string, o?: { fade?: number }) => { name: string; readonly scene: Scene; is(...names: string[]): boolean; go(name: string, o?: { fade?: number; data?: Loose }): Loose; after(sec: number, name: string, o?: Loose): Loose; readonly changing: boolean; readonly progress: number; readonly cover: number; update(dt: number): Loose; draw(c: Ctx, ...rest: Loose[]): Loose; input(kind: string, ...args: Loose[]): Loose };
  /** Waits for the first touch or key before the round starts: `if (!ready.update(dt)) return;` in update, `if (ready.go()) return;` in down. */
  Ready: new (o?: { eat?: boolean; text?: string }) => { waiting: boolean; readonly playing: boolean; t: number; since: number; eat: boolean; text: string; reset(): Loose; update(dt: number): boolean; go(): boolean; draw(c: Ctx, W: number, H: number, o?: { text?: string; x?: number; y?: number; color?: string; size?: number; font?: string; pixel?: boolean; shadow?: string | null }): Loose };
  Levels: new <T>(list: T[], o?: { loop?: boolean; start?: number }) => { readonly now: T; readonly number: number; readonly last: boolean; index: number; next(): Loose; restart(): Loose };
}

export interface PacingPart {
  ramp(t: number, from: number, to: number, seconds: number, ease?: (k: number) => number): number;
  Spawner: new (o?: { every?: number; fastest?: number; over?: number; jitter?: number; first?: number; max?: number; rnd?: () => number }) => { readonly gap: number; count: number; pause(sec: number): Loose; burst(n: number, gap?: number): Loose; update(dt: number, spawn: (i: number) => void): Loose; reset(): Loose };
  Waves: new (waves: Loose[], o?: { breather?: number; loop?: boolean; first?: number }) => { readonly wave: Loose; readonly number: number; readonly left: number; state: string; update(dt: number, spawn: (wave: Loose) => void, alive?: number): Loose; onStart?: Loose; [k: string]: Loose };
  Director: new (o?: { over?: number; start?: number; max?: number; ease?: number; calmFor?: number }) => { readonly level: number; readonly calm: boolean; hurt(amount?: number): Loose; scored(amount?: number): Loose; update(dt: number): Loose; pick(easy: number, hard: number): number };
}

export interface AimResult { target: Loose | null; on: boolean; lock: number; fire: boolean; angle?: number; dir?: Loose }
export interface AimPart {
  AimAssist: new (o?: { cone?: number; range?: number; pull?: number; slow?: number; autoFire?: number; stickTime?: number; strength?: number }) => {
    strength: number; target: Loose | null; on: boolean;
    turn(amount: number): number;
    update(dt: number, gun: XY | XYZ, aim: number | XYZ, targets: Loose[], o?: { sees?: (...xy: number[]) => boolean; lead?: number }): AimResult;
    reset(): Loose;
  };
}

export type Mood = 'calm' | 'suspicious' | 'alert' | 'searching';
export interface SensesPart {
  Senses: (new (o?: { range?: number; fov?: number; near?: number; hearing?: number; spotTime?: number; memory?: number; searchTime?: number; calmDown?: number }) => {
    mood: Mood; awareness: number; seen: boolean; lastSeen: XY | null; lookAt: XY | null; heard: XY | null; onMood?: (mood: Mood, prev: Mood) => void;
    inCone(me: XY & { facing?: number }, x: number, y: number): boolean;
    alert(x: number, y: number): Loose; suspect(x: number, y: number, amount?: number): Loose;
    update(dt: number, me: XY & { facing?: number }, target: (XY & { hidden?: boolean }) | null, o?: { sees?: (x1: number, y1: number, x2: number, y2: number) => boolean; noises?: Loose; light?: number }): Loose;
  }) & { alertAll(guards: Loose[], x: number, y: number, radius: number, from?: Loose): void };
  Noises: new () => { list: { x: number; y: number; loud: number; age: number }[]; make(x: number, y: number, loud?: number): Loose; update(dt: number): Loose; clear(): Loose };
}

/** The player's Reduce motion setting (read only). The kits already apply it. */
export interface PuzzleSolver {
  cell(id: string | number, values: Loose[]): this;
  allDiff(ids: (string | number)[]): this;
  sum(ids: (string | number)[], total: number): this;
  rule(ids: (string | number)[], ok: (values: Loose[]) => boolean): this;
  solve(o?: { known?: Record<string, Loose> | null; limit?: number; rng?: number | string | (() => number) | null }): { solution: Record<string, Loose> | null; count: number };
  unique(known?: Record<string, Loose>): boolean;
  grade(known?: Record<string, Loose>): { level: 'easy' | 'medium' | 'hard' | 'expert' | 'none'; guesses: number; open: number };
  carve(solution: Record<string, Loose>, o?: { rng?: number | string | (() => number); grade?: 'easy' | 'medium' | 'hard' | 'expert'; keep?: number }): Record<string, Loose>;
  hint(clues: Record<string, Loose>, moves?: Record<string, Loose>): { id: string | number | null; value: Loose; why: 'only' | 'last' | 'sum' | 'rule' | 'guess' | 'wrong'; wrong: (string | number)[] } | null;
}
export interface SearchGame<S, M> { moves(s: S): M[]; play(s: S, m: M): S; turn(s: S): Loose; score?(s: S, player: Loose): number; over?(s: S): boolean; winner?(s: S): Loose }
export interface SolvePart {
  Puzzle: new () => PuzzleSolver;
  Search: new <S = Loose, M = Loose>(game: SearchGame<S, M>) => {
    best(s: S, o?: { time?: number; depth?: number; skill?: number; rng?: number | string | (() => number); mode?: 'minimax' | 'mcts' }): M | null;
    rank(s: S, o?: { time?: number; depth?: number; mode?: 'minimax' | 'mcts'; rng?: number }): { move: M; value: number; visits?: number }[];
    /** best(), a few milliseconds at a time: call job.step(ms) each frame until it returns true, then play job.move. time is the total thinking time. */
    think(s: S, o?: { time?: number; depth?: number; skill?: number; rng?: number | string | (() => number); mode?: 'minimax' | 'mcts' }): SearchJob<M>;
    readonly nodes: number;
  };
}
export interface SearchJob<M = Loose> { done: boolean; move: M | null; ranked: { move: M; value: number; visits?: number }[]; spent: number; step(ms?: number): boolean }

// ---------- board games (gs.tabletop, docs/board-games.md) ----------
/** A point on the board in board units: x to the player's right, z towards the player, y up from the board's top. */
export interface BoardPoint { x?: number; y?: number; z?: number }
export type TableEase = 'linear' | 'in' | 'out' | 'inOut' | 'back' | 'bounce' | ((k: number) => number);
export type RoomName = 'study' | 'parlour' | 'tavern' | 'attic' | 'hall' | 'sunroom';
/** The room round the table in 3D: a ROOMS name to start from (like) and any of its fields changed. */
export interface RoomLook {
  like?: RoomName; bg?: string; wall?: string; floor?: [string, Record<string, Loose>]; rug?: string | null; wood?: string; felt?: string | null;
  lamp?: string; power?: number; sky?: string; ground?: string; amb?: number; env?: number;
  grade?: { saturation?: number; contrast?: number; shadows?: string; highlights?: string } | null;
}
export interface TableOptions {
  /** How wide the playing area is, in board units (10). */
  span?: number;
  /** Its real width in metres (.5): the room's proportions, and tabletop size in AR. */
  real?: number;
  /** How far the board's underside is below y = 0 (.3, a slab's thickness). */
  base?: number;
  room?: RoomName | RoomLook;
  table?: 'round' | 'square' | false;
  /** The camera's home, in degrees: pitch (56) down at the board, yaw round it, zoom (1; under 1 is closer). */
  pitch?: number; yaw?: number; zoom?: number;
  /** The board point the camera aims at: [x, y, z]. */
  look?: [number, number, number];
  minPitch?: number; maxPitch?: number;
  /** false leaves the AR chip out. */
  ar?: boolean;
  /** Metres wide on the floor in AR (.9). */
  arSize?: number;
  /** The area the camera fits on screen, [w, d] in board units, when it isn't span x span. */
  frame?: [number, number];
  /** Depth of field (a miniature look; best phones only). */
  blur?: boolean;
}
export interface TableChip { id: string; label: string; on?: boolean }
/** A tap from Table.up(): where it was, and chip when it was on one of the game's own chips. */
export interface TableTap { x: number; y: number; chip?: string }
export interface TableParticles {
  emit(e: { x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number; life?: number; size?: number; grow?: number; col?: Loose; a?: number; drag?: number; grav?: number; floor?: number; [more: string]: Loose }): void;
  update(dt: number): void; clear(): void;
}
/** Real dice thrown on the board (Table.dice). */
export interface DiceSet {
  /** The numbers showing now. */
  readonly values: number[];
  meshes: Loose[]; rolling: boolean;
  show(on?: boolean): DiceSet;
  /** Throws the dice (all but keep's indexes); resolves the numbers once they settle. */
  roll(o?: { keep?: number[]; from?: BoardPoint | null; push?: BoardPoint | null }): Promise<number[]>;
  /** Stands die i at a board point with its number kept. */
  park(i: number, at: { x: number; z: number }): DiceSet;
  rest(): void;
}
export interface TableT {
  /** Add the board and pieces here, in board units: the board's top is y = 0, the player sits at +z. */
  board: Loose;
  anchor: Loose; room: Loose; lamp: Loose;
  span: number; real: number; base: number;
  /** Seconds of game time on the table's clock. */
  t: number;
  mode: '3d' | 'ar'; W: number; H: number;
  /** The view on screen now: a gs.hd HDView (3D) or a gs.ar ARView (AR). */
  readonly v: Loose;
  /** The 3D room's view (always there) and AR's (null until AR is first tapped). */
  v3: Loose; va: Loose | null;
  /** True while AR's own screens are up: hide your HUD. */
  readonly hidden: boolean;
  /** True while a run() turn is still playing out. */
  readonly busy: boolean;
  /** True on a tall screen (a phone held upright), false on a wide one (an unfolded phone). */
  readonly tall: boolean;
  onTier(fn: (tier: Loose) => void): TableT;
  /** From the game's reset(): drops moves still playing and puts the camera home. */
  reset(): TableT;
  /** Stops the camera (before api.over() in AR). */
  stop(): TableT;
  /** First in update(dt). False while the game should wait (AR is finding the floor). */
  update(dt: number): boolean;
  tween(dur: number, fn: ((k: number, raw: number) => void) | null, o?: { ease?: TableEase; delay?: number }): Promise<void>;
  wait(s: number): Promise<void>;
  /** A promise from elsewhere, dropped if the round is reset meanwhile. */
  until<V>(p: Promise<V> | V): Promise<V>;
  /** Plays a turn written as an async function; busy is true while it runs. */
  run(fn: () => unknown): void;
  /** A gs.solve.Search opponent's move, thought about a little each frame. wait: seconds it takes at least (.5); slice: milliseconds a frame (4). */
  think<S = Loose, M = Loose>(search: Loose, state: S, o?: { time?: number; depth?: number; skill?: number; mode?: 'minimax' | 'mcts'; rng?: number | string | (() => number); wait?: number; slice?: number }): Promise<M | null>;
  hop(obj: Loose, to: BoardPoint, o?: { h?: number; time?: number; sound?: boolean; spin?: number; ease?: TableEase }): Promise<void>;
  slide(obj: Loose, to: BoardPoint, o?: { time?: number; ease?: TableEase; sound?: boolean }): Promise<void>;
  drop(obj: Loose, o?: { from?: number; time?: number; sound?: boolean }): Promise<void>;
  pop(obj: Loose, o?: { by?: number; time?: number }): Promise<void>;
  shake(amount?: number): TableT;
  /** Breaks a piece into rubble that tumbles and fades. */
  crumble(mesh: Loose, o?: { pieces?: number; push?: number; from?: { x: number; z: number } | null; life?: number }): Promise<void>;
  /** A burst of dust (or, with glow, sparks) at a board point. */
  puff(p: BoardPoint, o?: { col?: string; n?: number; speed?: number; size?: number; life?: number; up?: number; grav?: number; glow?: boolean }): TableT;
  lookAt(p: BoardPoint, o?: { zoom?: number | null; yaw?: number | null; pitch?: number | null }): TableT;
  lookHome(h?: { yaw?: number; pitch?: number; zoom?: number; look?: [number, number, number] } | null): TableT;
  /** The area the camera keeps on screen, in board units. */
  frame(w: number, d: number): TableT;
  setMode(mode: '3d' | 'ar'): TableT;
  onMode(fn: (mode: '3d' | 'ar') => void): TableT;
  draw(c: CanvasRenderingContext2D, W: number, H: number): void;
  /** The kit's chips (AR / 3D, View, Move) and messages, last in draw(); extra: your own chips. */
  hud(c: CanvasRenderingContext2D, W: number, H: number, extra?: TableChip[]): void;
  say(text: string, secs?: number): TableT;
  /** The players along the top; returns the y just below. */
  strip(c: CanvasRenderingContext2D, W: number, list: { name: string; col?: string; score?: number | string | null; note?: string }[], turn?: number, o?: { y?: number | null }): number;
  status(c: CanvasRenderingContext2D, W: number, y: number, text: string, col?: string): number;
  /** Pass the game's touches through these. down: true when the kit used the touch. */
  down(x: number, y: number, id?: number): boolean;
  /** The game is dragging something itself with this touch: the kit won't turn the view with it. */
  claim(id?: number): TableT;
  move(x: number, y: number, pressed?: boolean, id?: number): boolean;
  /** A tap ({ x, y }, with chip for one of your own chips), or null for a drag, a pinch or one of the kit's chips. */
  up(x: number, y: number, id?: number): TableTap | null;
  ray(x: number, y: number): Loose;
  /** Where a screen point meets the board's plane (at height h), in board units. */
  pick(x: number, y: number, h?: number): { x: number; y: number; z: number } | null;
  /** The one of objects under a screen point, nearest first. */
  over(x: number, y: number, objects: Loose[]): Loose | null;
  /** Screen [x, y, z] of a board point (z under 1 is in front of the camera). */
  toScreen(p: BoardPoint): [number, number, number];
  /** Index of the board point nearest a screen point within maxPx (34), or -1. */
  nearest(x: number, y: number, points: (BoardPoint | null)[], maxPx?: number): number;
  particles(o?: Loose): TableParticles;
  /** n real dice tumbling in gs.physics3d inside an unseen tray. Make them in setup. */
  dice(n?: number, o?: { size?: number; body?: string; pips?: string; tray?: { x: number; z: number; w: number; d: number } | null; gravity?: number; bounce?: number }): DiceSet;
}
export interface ChessMove { from: string; to: string; piece: string; color: 'w' | 'b'; captured: string | null; promotion: string | null; castle: 'k' | 'q' | null; enPassant: boolean; san: string }
export interface ChessT {
  readonly turn: 'w' | 'b'; readonly fen: string; readonly check: boolean; readonly mate: boolean; readonly stalemate: boolean; readonly draw: boolean; readonly over: boolean;
  readonly count: number;
  /** How the position stands for white, in pawns. */
  readonly balance: number;
  at(square: string): { type: string; color: 'w' | 'b' } | null;
  pieces(): { square: string; type: string; color: 'w' | 'b' }[];
  moves(square?: string | null): ChessMove[];
  move(m: { from: string; to: string; promotion?: string | null }): ChessMove | null;
  undo(): ChessMove | null;
  /** The computer's move for the side to move, thought about in a worker. level 1..5. */
  think(o?: { level?: number; time?: number | null }): Promise<{ from: string; to: string; promotion?: string | null } | null>;
}
/** Colour or a three.js material, and the options gs.hd.pbr takes (rough, metal, clear, glow, transparent, opacity...). */
export type PieceLook = string | Loose;
export interface TabletopPart {
  /** One board, played in a 3D room or in AR: the table, camera, picking, moves, dice. */
  Table: new (api: GameApi, o?: TableOptions) => TableT;
  ROOMS: Record<RoomName, RoomLook>;
  /** Table sounds, each with a volume 0..1. */
  sounds: Record<'clack' | 'tick' | 'clink' | 'rattle' | 'slide' | 'thud' | 'flip' | 'chime' | 'gong', (v?: number) => void>;
  /** A board: a slab with a top painted in code and a wooden rim, its top at y = 0. */
  slab(o?: { w?: number; d?: number; thick?: number; rim?: number; wood?: string; px?: number; paint?: ((g: Loose, size: number) => void) | null; rough?: number; strength?: number }): Loose;
  /** A flat picture lying on the board; mesh.userData.redraw(fn) paints it again. */
  decal(w: number, d: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, o?: { px?: number; lift?: number; rough?: number; glow?: number }): Loose;
  /** Polished wood with a straight grain, made in code (a material). */
  wood(colour?: string, o?: { repeat?: [number, number]; clear?: number }): Loose;
  die(size?: number, o?: { body?: string; pips?: string; rough?: number }): Loose;
  pawn(col?: PieceLook, o?: { r?: number; h?: number; [pbr: string]: Loose }): Loose;
  disc(col?: PieceLook, o?: { r?: number; h?: number; [pbr: string]: Loose }): Loose;
  stone(col?: PieceLook, o?: { r?: number; [pbr: string]: Loose }): Loose;
  ring(col?: string, o?: { r?: number; w?: number; glow?: number }): Loose;
  dot(col?: string, o?: { r?: number; glow?: number }): Loose;
  /** A pair of glowing eyes to add to a piece. */
  eyes(col?: PieceLook, o?: { y?: number; z?: number; gap?: number; r?: number; glow?: number }): Loose;
  chessman(kind: 'p' | 'r' | 'n' | 'b' | 'q' | 'k', col?: PieceLook, o?: Record<string, Loose>): Loose;
  /** Joins the meshes in a group that share a material into one mesh each. */
  fuse(group: Loose): Loose;
  COLOURS: { readonly players: readonly string[]; readonly light: string; readonly dark: string };
  shade(col: string, k: number): string;
  EASE: Record<'linear' | 'in' | 'out' | 'inOut' | 'back' | 'bounce', (k: number) => number>;
  /** Chess rules (chess.js) and a computer opponent; make it in make() or reset(). */
  Chess: (new (fen?: string | null) => ChessT) & { LEVELS: readonly { name: string; depth: number; time: number }[] };
  loadChess(): Promise<Loose>;
}
export interface VoxelWorld {
  readonly w: number; readonly h: number; readonly d: number; readonly scale: number; group: Loose; readonly meshing: number;
  block(name: string, color: string, o?: { see?: boolean }): number; id(b: string | number): number;
  get(x: number, y: number, z: number): number; solid(x: number, y: number, z: number): boolean; set(x: number, y: number, z: number, b: string | number): boolean;
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: string | number): this;
  sphere(cx: number, cy: number, cz: number, r: number, b?: string | number): { changed: number; gone: Record<number, number> };
  top(x: number, z: number): number;
  generate(o?: { seed?: string | number; kind?: 'hills' | 'flat' | 'island' | 'caves'; ground?: number; hills?: number; water?: number; trees?: number; caves?: boolean }): this;
  tree(x: number, y: number, z: number, height?: number): this;
  update(limit?: number): number; build(): this;
  ray(from: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, far?: number, o?: { solidOnly?: boolean }): { x: number; y: number; z: number; id: number; nx: number; ny: number; nz: number; dist: number } | null;
  move(box: { x: number; y: number; z: number; w?: number; h?: number; d?: number }, dx: number, dy: number, dz: number, o?: { step?: number }): { x: boolean; y: boolean; z: boolean; ground: boolean; inWater: boolean };
  pack(): string; unpack(text: string): this; dispose(): void;
}
export interface VoxelsPart {
  Voxels: new (o?: { size?: [number, number, number]; chunk?: number; scale?: number; shadows?: boolean; worker?: boolean; rough?: number }) => VoxelWorld;
  BLOCKS: Readonly<Record<'air' | 'grass' | 'dirt' | 'stone' | 'sand' | 'water' | 'wood' | 'leaves' | 'snow' | 'brick' | 'glass' | 'lava' | 'gold' | 'coal' | 'plank' | 'ice', number>>;
}
/** A solid thing in a liquid (fluid.ball, fluid.box, fluid.tube). */
export interface FluidSolid {
  x: number; y: number; z: number;
  /** Puts it somewhere (and turns it: a three.js Quaternion). Call it each frame for a thing that moves: the liquid feels how fast it goes. */
  set(x: number, y: number, z: number, turn?: Loose): this;
  /** A box round the room inside a hollow solid, [x0, y0, z0, x1, y1, z1], for fluid.amount() (right while it stands upright). */
  inside(): [number, number, number, number, number, number];
  /** Fills a hollow solid's room with liquid at rest, up to this much of its height (0..1). Returns how much went in. */
  fill(part?: number): number;
  remove(): void;
}
export interface FluidSolidOpts { x?: number; y?: number; z?: number; turn?: Loose; hollow?: number; open?: boolean; follow?: Loose }
/** A tap (fluid.pour): change any of these while it runs. */
export interface FluidTap { x: number; y: number; z: number; dir: [number, number, number]; rate: number; speed: number; spread: number; r: number | null; on: boolean; remove(): void }
export interface FluidDrain { x: number; y: number; z: number; r: number; readonly amount: number; remove(): void }
export type FluidKind = 'water' | 'lava' | 'slime' | 'honey';
export interface FluidT {
  /** 'gpu' when the fluid runs on the graphics chip (WebGPU), else 'cpu' (fewer, bigger drops). */
  readonly backend: 'gpu' | 'cpu';
  /** Drops in the fluid now, and the most it can have. */
  readonly count: number; readonly max: number;
  /** How much liquid one drop is (units cubed), and how wide a drop is. */
  readonly drop: number; readonly dropSize: number;
  /** How much more liquid fits; full: none (taps stop until some drains away). */
  readonly room: number; readonly full: boolean;
  /** Units a second squared. Change it any time (tilt the world). */
  gravity: { x: number; y: number; z: number };
  /** A tap: a stream from x, y, z going dir (down if you don't say) at speed (units a second), rate units cubed a second. */
  pour(o?: { x?: number; y?: number; z?: number; dir?: [number, number, number]; rate?: number; speed?: number; spread?: number; r?: number | null; on?: boolean }): FluidTap;
  /** A burst of liquid at a place. Returns how much went in. */
  splash(x: number, y: number, z: number, o?: { amount?: number; speed?: number; up?: number }): number;
  /** Liquid at rest in a block (any side you leave out is the box's own). Returns how much went in. */
  fill(block?: { x0?: number; y0?: number; z0?: number; x1?: number; y1?: number; z1?: number }): number;
  /** Takes all the liquid away (taps, solids and drains stay). */
  clear(): this;
  /** A solid ball. hollow: a wall this thick with room inside (open: a bowl; open: false: a sealed globe). */
  ball(o?: FluidSolidOpts & { r?: number }): FluidSolid;
  /** A solid box. hollow: a tank with walls this thick, open at the top (open: false: sealed). */
  box(o?: FluidSolidOpts & { w?: number; h?: number; d?: number }): FluidSolid;
  /** A solid post standing on its end. hollow: a cup with walls this thick, open at the top. */
  tube(o?: FluidSolidOpts & { r?: number; h?: number }): FluidSolid;
  /** The ground under the liquid: (x, z) => y. Call it again when the ground changes; null takes it away. */
  ground(fn: ((x: number, z: number) => number) | null): this;
  /** A drain: drops that reach it go, and its amount counts them. */
  drain(o?: { x?: number; y?: number; z?: number; r?: number }): FluidDrain;
  /** A blast: liquid within radius is thrown outwards at up to strength (units a second), and upwards at up. */
  push(x: number, y: number, z: number, o?: { radius?: number; strength?: number; up?: number }): this;
  update(dt: number): this;
  /** How much liquid there is (units cubed), in the whole fluid or in a box [x0, y0, z0, x1, y1, z1]. */
  amount(box?: readonly number[] | null): number;
  /** The height of the liquid's top at x, z, or null where it's dry. */
  level(x: number, z: number): number | null;
  /** How wet a place is: 0 dry .. 1 under the liquid. */
  wet(x: number, y: number, z: number): number;
  dispose(): void;
}
export interface FluidPart {
  /** A liquid in a box of your world: make it once with the scene, and clear() it each round. */
  Fluid: (new (view: Loose, o?: {
    box?: [number, number, number, number, number, number]; volume?: number; open?: boolean; kind?: FluidKind; colour?: string; foam?: string | false;
    thick?: number; rough?: number; glow?: number; gravity?: number | { x?: number; y?: number; z?: number }; drops?: number; size?: number; shadows?: boolean; gpu?: boolean; seed?: number;
  }) => FluidT) & {
    /** The most drops this phone runs well (on the graphics chip where it can). */
    max(): number;
  };
  KINDS: Readonly<Record<FluidKind, { colour: string; foam: string; thick: number; rough: number; glow: number }>>;
}
export interface TickPart {
  /** Ticks per second for the game being played; 0 when it runs one update per frame. */
  readonly rate: number; readonly on: boolean; readonly dt: number;
  /** How far the frame being drawn is between the last two ticks (0..1; 1 when off). */
  readonly alpha: number;
  /** Ticks since the round started. */
  readonly count: number;
  mix(before: number, now: number, alpha?: number): number;
  turn(before: number, now: number, alpha?: number): number;
}
export interface PrefsPart { readonly reduceMotion: boolean; /** 1 normally, smaller with Reduce motion: scale your own shakes and flashes by it. */ readonly motion: number }

// ---------- 2D worlds, characters, story, replays and look ----------

export declare class Camera2D {
  constructor(w: number, h: number, o?: { deadzone?: [number, number]; lag?: number; lead?: number; zoom?: number; bounds?: [number, number, number, number] | null; pixel?: boolean; x?: number; y?: number });
  /** The world point at the centre of the screen. */
  x: number; y: number; zoom: number; deadzone: [number, number]; lag: number; lead: number; bounds: [number, number, number, number] | null;
  readonly view: { x: number; y: number; w: number; h: number };
  update(dt: number, target?: { x: number; y: number; vx?: number; vy?: number }): this;
  snap(x: number, y: number): this;
  zoomIn(z: number, sec?: number): this;
  begin(c: Ctx): this; end(c: Ctx): this;
  /** A background layer moving at factor f of the camera (0 fixed, 1 with the world). */
  layer(c: Ctx, f: number, draw: (c: Ctx) => void, o?: { repeat?: [number, number] | null }): this;
  toWorld(sx: number, sy: number): XY; toScreen(wx: number, wy: number): XY;
  sees(x: number, y: number, w?: number, h?: number, margin?: number): boolean;
  offset(f?: number): [number, number];
}
export interface Camera2dPart { Camera2D: typeof Camera2D }

export interface Box { x: number; y: number; w: number; h: number; onGround?: boolean; [k: string]: Loose }
export interface TileHit { left: boolean; right: boolean; up: boolean; down: boolean; slope: number }
export interface TileKind { solid?: boolean; oneWay?: boolean; slope?: 1 | -1; [k: string]: Loose }
export declare class TileMap {
  constructor(cols: number, rows: number, o?: { size?: number; legend?: Record<string, TileKind> });
  /** '#' wall, '-' one-way, '/' '\' slopes, '.' empty; other letters are marks. */
  static fromText(text: string | string[], o?: { size?: number; legend?: Record<string, TileKind> }): TileMap;
  /** Auto-tiling: which neighbours join (same: characters that join, or a test). mask is 4-bit, blob 0..46. */
  edges(tx: number, ty: number, same?: string | ((ch: string, tx: number, ty: number) => boolean) | null, o?: { edge?: boolean }): TileEdges;
  cols: number; rows: number; size: number; readonly w: number; readonly h: number;
  marks: { ch: string; tx: number; ty: number; x: number; y: number }[];
  find(ch: string): { ch: string; tx: number; ty: number; x: number; y: number }[];
  clear(ch: string, to?: string): this;
  get(tx: number, ty: number): string; set(tx: number, ty: number, ch: string): this;
  info(tx: number, ty: number): TileKind; at(x: number, y: number): { tx: number; ty: number; ch: string };
  solid(tx: number, ty: number): boolean; slopeY(tx: number, ty: number, x: number): number | null;
  inside(tx: number, ty: number): boolean;
  /** Moves a box (x, y centre) by dx, dy, stopping at walls. */
  move(box: Box, dx: number, dy: number, o?: { drop?: boolean; stepDown?: number; stepUp?: number }): TileHit;
  ray(x0: number, y0: number, x1: number, y1: number): { x: number; y: number; tx: number; ty: number } | null;
  sees(x0: number, y0: number, x1: number, y1: number): boolean;
  walkable(): boolean[][];
  draw(c: Ctx, draw: (c: Ctx, ch: string, x: number, y: number, size: number, tx: number, ty: number) => void, cam?: Camera2D | null, o?: { empty?: boolean }): this;
}
export interface TileEdges { n: boolean; e: boolean; s: boolean; w: boolean; ne: boolean; se: boolean; sw: boolean; nw: boolean; mask: number; blob: number; blob8: number }
export interface TilesPart { TileMap: typeof TileMap; /** The 47 blob-tile masks in order (piece i's 8-bit mask). */ BLOB_MASKS: number[] }

interface MoverBase { x: number; y: number; w: number; h: number; vx: number; vy: number; onGround: boolean; facing: number; hit: Partial<TileHit>; readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }
export interface MoversPart {
  Platformer: new (o?: { x?: number; y?: number; w?: number; h?: number; jump?: number; jumpTime?: number; run?: number; accel?: number; airAccel?: number; stop?: number; coyote?: number; buffer?: number; cut?: number; fall?: number; wall?: boolean; wallSlide?: number; wallKick?: number; airJumps?: number }) => MoverBase & {
    jump: number; jumpTime: number; run: number; airJumps: number; wall: boolean;
    state: 'idle' | 'run' | 'jump' | 'fall' | 'wall'; jumped: boolean; landed: boolean; impact: number; onWall: -1 | 0 | 1;
    readonly gravity: number; readonly jumpSpeed: number;
    /** input: x -1..1, jump held now, down (drop through one-way platforms). map: a TileMap, or { floor: y }. */
    update(dt: number, map: TileMap | { floor: number } | null, input?: { x?: number; jump?: boolean; down?: boolean }): Loose;
  };
  TopDown: new (o?: { x?: number; y?: number; w?: number; h?: number; speed?: number; accel?: number; stop?: number }) => MoverBase & {
    speed: number; state: 'idle' | 'walk'; dir: XY;
    update(dt: number, map: TileMap | null, input?: { x?: number; y?: number }): Loose;
  };
}

export interface AnimState { frames?: number | number[]; fps?: number; loop?: boolean; lock?: boolean; then?: string; events?: Record<number, string> }
export interface AnimPart {
  Animator: new (states: Record<string, AnimState>, start?: string) => {
    readonly state: string; readonly frame: number; readonly progress: number; done: boolean; prev?: string;
    on(event: string, fn: (event: string, a: Loose) => void): Loose;
    play(name: string, restart?: boolean): Loose;
    update(dt: number, want?: string): Loose;
  };
}

export interface StoryLine { text: string; tags: Record<string, string | true>; choices: { text: string; index: number; tags: Record<string, string | true> }[] }
export interface StoryPart {
  /** Branching dialogue written in ink (lazy: make it in make() or reset()). */
  Story: new (source: string) => {
    readonly ended: boolean; readonly choices: StoryLine['choices']; vars: Record<string, Loose>; ink: Loose;
    next(): StoryLine; choose(index: number): Loose; go(section: string): Loose; bind(name: string, fn: (...a: Loose[]) => Loose): Loose;
    save(): string; load(json: string): Loose;
  };
  Typewriter: new (text?: string, o?: { speed?: number; pause?: number }) => { readonly shown: string; readonly done: boolean; ticked: boolean; text: string; show(text: string): Loose; skip(): Loose; update(dt: number): Loose };
  loadStory(): Promise<Loose>;
}

export declare class Ghost {
  constructor(o?: { every?: number });
  time: number; readonly length: number;
  record(dt: number, ...values: number[]): this;
  at(t: number): { x: number; y: number; v: number[]; done: boolean } | null;
  /** A short string for api.save(). */
  pack(maxBytes?: number, precision?: number): string;
  static unpack(s: string): Ghost;
}
export interface ReplayPart {
  Ghost: typeof Ghost;
  Recorder: new (o?: { seed?: number; max?: number }) => { seed: number; rng: Rng; readonly time: number; readonly data: { seed: number; frames: Loose[] }; event(kind: string, ...args: Loose[]): Loose; frame(dt: number): Loose };
  Replayer: new (data: { seed: number; frames: Loose[] }) => { rng: Rng; readonly done: boolean; step(game: Partial<Game>): number };
}

export interface Light { x: number; y: number; r: number; color?: string; power?: number; cone?: number; dir?: number; flicker?: number; shadows?: boolean }
export type ScreenEffect = 'crt' | 'bloom' | 'grade' | 'pixelate' | 'glitch' | 'rgbSplit' | 'film' | 'shockwave' | 'godrays' | 'zoomBlur' | 'blur' | 'outline' | 'grayscale';
export interface Look2dPart {
  /** Darkness with lights; walls (a TileMap, anything with ray(), or [x1, y1, x2, y2] segments) cast shadows. */
  Lights: new (w: number, h: number, o?: { dark?: number; color?: string; pixel?: boolean; rays?: number; scale?: number }) => { dark: number; color: string; draw(c: Ctx, lights: Light[], o?: { walls?: Loose; cam?: Camera2D | null; dt?: number }): Loose };
  /** Whole-screen effects with pixi-filters (lazy). Options are the pixi-filters filter's own. */
  Screen: new (effects?: Partial<Record<ScreenEffect, object | boolean | null>>) => { set(effects: Partial<Record<ScreenEffect, object | boolean | null>>): Loose; filter(name: ScreenEffect): Loose; apply(c: Ctx, dt?: number): Loose; shock(x: number, y: number, o?: object): Loose };
  /** Fast WebGL sprites with PixiJS (lazy). Sprites are PixiJS Sprites: x, y, rotation, scale, alpha, tint. */
  Batch: new (w: number, h: number, o?: { pixel?: boolean }) => { texture(src: Loose, w?: number, h?: number): Loose; add(tex: Loose, x?: number, y?: number, o?: { scale?: number; rotation?: number; alpha?: number; tint?: number }): Loose; remove(s: Loose): Loose; clear(): Loose; readonly count: number; draw(c: Ctx): Loose };
  loadLook2D(): Promise<Loose>;
}

export interface PathPoint { x: number; y: number; z: number; angle: number; dx: number; dy: number; dz: number; d: number }
export declare class Path {
  constructor(points: (number[] | { x: number; y: number; z?: number })[], o?: { loop?: boolean; kind?: 'smooth' | 'line' | 'bezier'; tension?: number; detail?: number });
  pts: { x: number; y: number; z: number }[]; readonly length: number; loop: boolean;
  at(d: number, out?: object): PathPoint; offset(d: number, side: number, out?: object): PathPoint;
  nearest(x: number, y: number, z?: number): { d: number; x: number; y: number; z: number; dist: number };
  spaced(step: number): PathPoint[]; trace(c: Ctx, from?: number, to?: number): this; build(): this; points3(V: Loose, step?: number): Loose[];
}
export interface PathsPart {
  Path: typeof Path;
  /** Moves along a path at a steady speed: x, y, z, angle, d, lap, done. */
  Follower: new (path: Path, o?: { speed?: number; end?: 'loop' | 'pingpong' | 'stop'; d?: number; side?: number }) => PathPoint & { speed: number; side: number; lap: number; done: boolean; update(dt: number): Loose };
}
export interface Bone { name: string; parent: string | null; len: number; angle: number; rest: number; z: number; data: Loose; w: { x: number; y: number; angle: number; ex: number; ey: number } }
export declare class Rig {
  constructor(o?: { x?: number; y?: number; scale?: number; flip?: boolean });
  x: number; y: number; scale: number; flip: boolean; playing: string | null;
  bone(name: string, o?: { parent?: string; at?: number; len?: number; angle?: number; z?: number; wobble?: { stiff?: number; damp?: number }; min?: number; max?: number; [k: string]: Loose }): this;
  get(name: string): Bone | undefined;
  pose(angles: Record<string, number>, o?: { rest?: boolean }): this; snapshot(): Record<string, number>;
  blend(a: Record<string, number>, b: Record<string, number>, t: number): this;
  clip(name: string, c: { len: number; loop?: boolean; keys: Record<string, [number, number][]>; ease?: (t: number) => number; events?: [number, string][] }): this;
  play(name: string, o?: { fade?: number; speed?: number; from?: number }): this; stop(): this; on(ev: string, fn: (rig: Rig, clip?: string) => void): this;
  update(dt: number): this; solve(dt?: number): this; world(name: string): Bone['w'] | null; kick(name: string, amount?: number): this;
  reach(upper: string, lower: string, tx: number, ty: number, o?: { bend?: 1 | -1; weight?: number }): boolean;
  look(name: string, tx: number, ty: number, weight?: number): this;
  draw(c: Ctx, fn: (c: Ctx, bone: Bone, w: Bone['w']) => void): this;
}
export interface BonesPart { Rig: typeof Rig }

// ---------- 3D and AI parts (load on first use; the app loads them before a game that needs them) ----------

/** What new gs.toon.View({ ... }) takes. */
export interface ToonViewOptions {
  bg?: string; fog?: [colour: string, near: number, far: number] | null; sun?: [number, number, number]; sunI?: number; sky?: string; ground?: string; amb?: number;
  /** false: blob() discs and no real shadows. (Real shadows are also off on low-end phones, where the discs show.) */
  shadows?: boolean;
  /** 0..1: how bright the rim of light on the sunny side of things is (default .35; 0 for none). */
  rim?: number;
  /** false if the bare background of a board view isn't ground (a drop, the sky): no shadows land on it. */
  floor?: boolean;
  /** A retro look: 'chunky' (240 lines, hard pixels, corners that snap, 32 shades a colour with a dither), 'soft' (240 lines scaled up smoothly), 'tube' (soft with scanlines), or your own mix. */
  retro?: 'chunky' | 'soft' | 'tube' | { lines?: number; smooth?: boolean; snap?: boolean; bits?: number; scan?: number } | null;
}
export interface ToonPart {
  View: new (o?: ToonViewOptions) => Loose; G: Loose; part: Loose; grp: Loose; blob: Loose; toon: Loose; flat: Loose; dude: Loose; has3D(): boolean; THREE: Loose;
  /** A jointed cel-shaded person h units tall (best 24 or more) with the gs.poses joints: figure().rig.play('walk'), rig.update(dt, { speed }) each frame. */
  figure(o?: { h?: number; body?: string; skin?: string; legs?: string; shoes?: string; hair?: string | null; eyes?: string | null }): Loose & { rig: RigT };
}
/** An HDView's extras for the ray-traced look: v.reflect(...meshes) (reflections on top-end phones), v.contact({ y, size }) (soft contact shadows) (mesh.userData.noAO = true keeps a mesh out of ambient occlusion). */
/** HDView extras: v.decal(mesh, point, normal, { size, colour, paint, life }), v.clearDecals(), v.bakeLight(at, { radius, strength }) (light probes, blended by v.probeAt or the camera), v.clearProbes(), v.bounce(box, { spacing, bounces, size }) (bounce light from a probe grid; returns { bake(), remove() }), v.clearBounce(), v.room(box, { size, strength, meshes }) (box-projected room reflections; returns { bake(), remove() }), v.detail(meshes, { px } | false) (cluster detail, a Nanite-style level of detail: big still meshes of 20,000 triangles or more are drawn in clusters by themselves, each part only as finely as shows; this asks for it on smaller meshes from 2,000 triangles, sets how many pixels the simpler parts may be out by, or with false draws them whole; also mesh.userData.detail = true | px | false), v.occluders(boxes | null, { max, w }) (occlusion culling: skip what's hidden behind big solid boxes { x0, x1, y0, y1, z0, z1 }, Box3s or box meshes; userData.noOcclude to always draw; v.occlusion.stats), v.shafts = 0..2 (sun shafts), v.upscaler = 'sgsr1' (one-frame upscaling instead of Snapdragon GSR 2), v.focus = { at, range, depth, blur } | null (depth of field, high and ultra), v.beams = { light, density, far, glow, strength, steps } | null (volumetric light: sun or spot beams through shadows, high and ultra), v.motionBlur = { amount, max, sharp, objects } | null (motion blur, high and ultra: the camera's move, and on WebGPU each thing's own; objects: false for the camera only), v.cut() (the camera jumped somewhere new: the upscaler and frame generation start fresh; big jumps are found by themselves), v.aimNow(cam => { cam.rotation.y = lookAngle; }) (frame generation's fresh aim: point the camera where the newest touch already says, without moving the game on; each made frame turns to it, so aiming answers at the screen's rate; gs.camera rigs and AR views do it themselves), v.precompile() (a promise: compiles the shaders of things added since, like a new floor, in the background; fade back in when it resolves), things needing a new shader mid-round wait hidden a frame or two while it builds in the background (mesh.userData.noHold = true draws at once), sun().fit(view, { far, near }) (near: a sharp shadow cascade over the first metres), sun().softShadows(deg = 2) (soft shadows that stay sharp where things touch: PCSS on WebGPU; deg is the sun's width in the sky), v.tone = 'aces' | 'neutral' | 'agx' (three.js's tone mappers: ACES the default film look, Neutral true colours, AgX soft bright hues), v.flare = true | { strength, threshold, spacing, fade, tint, dirt } (lens flare ghosts and lens dirt), v.oit = true (WebGPU: order-independent transparency, see-through things blend right in any order), v.liveBounce = 'screen' | 'voxel' | { kind, strength, res, box } | null (WebGPU, high and ultra: bounce light worked out every frame, following a moving sun or lamps; 'screen' is three's SSGI, 'voxel' three's VXGI, which also counts walls off screen), v.levelChanged() (the level's big still pieces changed: voxel bounce light rebuilds its picture of them), v.fog3d = { density, height, falloff, far, colour, glow, ambient, strength, noise, wind, lamps } | null (WebGPU, high and ultra: froxel fog lit by the sun through its shadows and by nearby lamps; WebGL keeps the view's plain fog), v.lut = 'film' | 'bleach' | 'noir' | 'sepia' | 'warm' | 'cold' | 'faded' | 'vivid' | 'night' | ((r, g, b) => [r, g, b]) | cubeFileText | null and v.lutAmount 0..1 (a colour look on the finished picture), v.autoExposure = true | { amount, min, max, speed, darken, key } (the eye adapts to dark and bright places, from how the scene looked when turned on; v.eye = null re-measures), v.shadowsDirty() (redraw every shadow map next frame; still and moving shadows are kept apart by themselves: __hd.shadowCache = false turns it off). */
export interface HdPart { ContactShadows: new (o?: { y?: number; size?: number; blur?: number; darkness?: number; opacity?: number; height?: number }) => Loose; HDView: new (...a: Loose[]) => Loose; HD: Loose; TIERS: Loose; hasHD(): boolean; pbr: Loose; rbox: Loose; surface: Loose; speckle: Loose; /** pbr(col, { rough, metal, glow, clear, sheen, tex, depth (parallax occlusion on WebGPU, in texture widths, e.g. .05), sss: true | { colour, power, scale, distortion, ambient, attenuation }, aniso (brushed metal streaks 0..1), anisoDir (radians), film (soap bubble / oil rainbow 0..1), glass: true | { thickness, ior, tint, distance }, wet (rain-soaked 0..1, porosity) }) (sss: subsurface scattering, light glowing through skin, wax, leaves). */ /** detail(big, fine, { times, strength }): mix a fine surface() normal (repeated `times` over) into a big one, so close-ups keep grain. Give it sets without repeat. */ detail(big: Loose, fine: Loose, o?: { times?: number; strength?: number }): Loose; /** panel(colour, intensity, w, h, { glow }): an area light, a glowing w x h rectangle shining out of its front (-z; aim with lookAt). */ panel(col?: string | number, i?: number, w?: number, h?: number, o?: { glow?: boolean }): Loose; /** lut(look, { size }): a colour look table for v.lut, from a name, (r, g, b) => [r, g, b] (screen colours 0..1) or .cube file text. */ lut(look: string | ((r: number, g: number, b: number) => number[]), o?: { size?: number }): Loose; /** pulse(material, { at, radius, strength, color, width, fill }): a glowing ring sweeping out from a point (sonar, shockwave). */ pulse(m: Loose, o?: { at?: { value: Loose }; radius?: { value: number }; strength?: { value: number }; color?: number[] | Loose; width?: number; fill?: number }): Loose; Particles: Loose;
  /** Tens of thousands of particles moved on the graphics chip with WebGPU (capped on the CPU with WebGL). new GPUParticles(view, opts); p.emit(count, burst); p.update(dt). Looks only: positions can't be read back. */
  GPUParticles: new (view: Loose, o?: { max?: number; additive?: boolean; gravity?: number; drag?: number; bounce?: number; floor?: number | null; turbulence?: { strength?: number; scale?: number; speed?: number } | null; wind?: Loose }) => {
    max: number; n: number;
    emit(count: number, burst?: { at?: number[] | Loose; radius?: number; vel?: number[] | Loose; spread?: number; life?: number | [number, number]; size?: number | [number, number]; color?: Loose; to?: Loose; alpha?: number; fadeIn?: boolean; ease?: number }): Loose;
    update(dt: number): void; clear(): void; dispose(): void;
  };
  sun: Loose; spot: Loose; THREE: Loose;
  /** A shared 256 x 256 tiling noise texture (four noise sizes in r, g, b, a) for your own shaders: clouds, water, grass. */
  noiseTex(): Loose;
  /** The shared WebGL renderer for kit bakes (gs.outdoors impostor()); null without 3D. */
  bakeRenderer(): Loose }
/** v.air(...) settings (Next Gen outdoor air): change them any time. */
export interface HdAir {
  haze: number; colour: Loose; sunColour: Loose | null; mist: number; mistFall: number; mistY: number; patchy: number;
  clouds: number; cloudShade: number; cloudHeight: number; cloudSize: number; wind: [number, number]; wet: number; sun: Loose | null;
}
/** v.grade: saturation and contrast (1 = no change), tints for the shadows and the highlights ('#rrggbb', a Color or [r, g, b]). */
export interface HdGrade { saturation?: number; contrast?: number; shadows?: Loose; highlights?: Loose }
/** What sun().fit(view, o) covered, in metres. */
export interface HdShadowFit { width: number; height: number; texel: number }
/**
 * AR (docs/ar-3d.md). new ARView({ occlude: true, walls: true, light: 'real' }) turns on AR phase 2 with native AR:
 * real things hide virtual ones, walls are mapped (surfaces() and hit() give them), and the sun and
 * reflections follow the room's real light. v.anchor(p, q) holds a real spot; v.marker(picture, { width })
 * finds a picture in the room (markerArt(seed) draws one phones find easily).
 */
export interface ArPart { ARView: new (...a: Loose[]) => Loose; FLOOR: Loose; arNote: Loose; markerArt: (seed?: number, size?: number) => HTMLCanvasElement; THREE: Loose }
export interface BricksPart { BRICK: Loose; BRICK_KEYS: Loose; STUD: Loose; brick: Loose; brick3d: Loose; stud: Loose; stud3d: Loose }
/** Rapier 3D (lazy). */
export interface Physics3dPart { World3D: new (o?: Loose) => Loose; loadPhysics3D(): Promise<Loose>; physics3DReady(): boolean }
/** A place in 3D for gs.fx3d: { x, y, z } (a three.js Vector3 fits). */
export interface Fx3dPos { x?: number; y?: number; z?: number }
/** A piece of text in the 3D world (a three.js Mesh: add it to a scene or a model). Change a field, then sync(). */
export interface Text3d {
  text: string; size: number; color: Loose; align: 'left' | 'center' | 'right'; outline: number; outlineColor: Loose; maxWidth: number;
  /** Its size in world units after the last sync(). */ readonly width: number; readonly height: number;
  /** Lays the letters out again after a change. */ sync(): Text3d;
  dispose(): void; [k: string]: Loose;
}
/** One running effect of a Particles3D. */
export interface Fx3dEffect {
  /** Where it makes its particles (a Vector3). */ readonly pos: Loose;
  /** Moves it. */ at(p: Fx3dPos): Fx3dEffect;
  /** Stops it making new particles; the ones flying finish. */ stop(): Fx3dEffect;
  /** Takes it and its particles away at once. */ remove(): void;
}
/** 3D text, 3D particle effects and extra screen effects (lazy). All of it draws on WebGL and on WebGPU. */
export interface Fx3dPart {
  /**
   * Sharp text inside the 3D world: scores over heads, signs, labels. size: the height of a capital letter in world
   * units; font: 'regular' | 'bold' | 'pixel', any gs.fonts name, or [name, weight]; outline: its width in world units;
   * maxWidth wraps at spaces; face: true always faces the camera.
   */
  text3d(str: string, o?: { size?: number; color?: Loose; font?: 'regular' | 'bold' | 'pixel' | FontName | [FontName, number]; align?: 'left' | 'center' | 'right'; outline?: number; outlineColor?: Loose; maxWidth?: number; face?: boolean }): Text3d;
  /** Particle effects for one scene: fx = new Particles3D(view.scene), then fx.update(dt) every frame. seed: the same particles every time (replays). */
  Particles3D: new (scene: Loose, o?: { seed?: number | null }) => {
    /** Your own effect: life, speed and size are [min, max]; colors [from, to]; rate a second, burst at the start; glow: false for soft dots like smoke. */
    make(pos: Fx3dPos, o?: { life?: number | [number, number]; speed?: number | [number, number]; size?: number | [number, number]; colors?: Loose[]; rate?: number; burst?: number; loop?: boolean; duration?: number; shape?: 'point' | 'sphere' | 'cone'; radius?: number; angle?: number; up?: boolean; gravity?: number; glow?: boolean; shrink?: boolean; grow?: boolean; fade?: boolean }): Fx3dEffect;
    /** A flame that keeps burning. */ fire(pos: Fx3dPos, o?: { size?: number; color?: Loose; end?: Loose }): Fx3dEffect;
    /** Rising smoke (keeps going). */ smoke(pos: Fx3dPos, o?: { size?: number; color?: Loose }): Fx3dEffect;
    /** A quick shower of sparks. */ sparks(pos: Fx3dPos, o?: { color?: Loose; count?: number; power?: number }): Fx3dEffect;
    /** An explosion: fire, smoke and sparks. */ boom(pos: Fx3dPos, o?: { size?: number }): Fx3dEffect;
    /** Twinkly magic (keeps going). */ magic(pos: Fx3dPos, o?: { color?: Loose; end?: Loose }): Fx3dEffect;
    /** Falling snow over an area round pos (keeps going). */ snow(pos: Fx3dPos, o?: { area?: number; rate?: number }): Fx3dEffect;
    /** How many particles are flying now. */ readonly count: number;
    update(dt: number): void;
    /** Takes every effect and particle away. */ clear(): void;
    dispose(): void;
  };
  /** A glowing edge round things (Next Gen views). pass.selectedObjects = [...] changes them; pass.remove() takes it off. */
  outline(view: Loose, objects: Loose[], o?: { color?: Loose; hidden?: Loose; strength?: number; thickness?: number; pulse?: number }): { selectedObjects: Loose[]; edgeStrength: number; edgeThickness: number; edgeGlow: number; pulsePeriod: number; visibleEdgeColor: Loose; hiddenEdgeColor: Loose; remove(): void; [k: string]: Loose };
  /** A digital glitch (Next Gen views): const g = glitch(view); a moment later g.remove(). */
  glitch(view: Loose, o?: { wild?: boolean }): { goWild: boolean; remove(): void; [k: string]: Loose };
  /** Motion trails (Next Gen views). damp 0..1: how long they linger (pass.damp = .9 changes it). */
  trails(view: Loose, damp?: number): { damp: number; remove(): void; [k: string]: Loose };
  /** Depth of field (Next Gen views): things `focus` units away are sharp. f.focus = 4 moves it, f.remove() turns it off. */
  focus(view: Loose, o?: { focus?: number; aperture?: number; maxblur?: number }): { focus: number; remove(): void };
  /** Big chunky pixels (Next Gen views). size in screen pixels (pass.size = 8 changes it). */
  pixelate(view: Loose, size?: number): { size: number; remove(): void; [k: string]: Loose };
  loadFx3d(): Promise<Loose>;
}
export type RigMode = 'chase' | 'shoulder' | 'first' | 'top' | 'side' | 'orbit' | 'rail' | 'fixed';
export interface CameraPart {
  CameraRig: new (view: Loose, o?: { mode?: RigMode; distance?: number; height?: number; side?: number; look?: number; lag?: number; lead?: number; fov?: number; walls?: Loose[]; pitchMin?: number; pitchMax?: number; rail?: Loose; at?: Loose }) => {
    yaw: number; pitch: number; mode: RigMode;
    update(dt: number, target: Loose): Loose; to(mode: RigMode, sec?: number, o?: Loose): Loose; set(o: Loose): Loose;
    shake(amount?: number): Loose; kick(deg?: number, sec?: number): Loose; forward(out?: Loose): Loose; right(out?: Loose): Loose;
  };
}
/** 3D paths from your level meshes (lazy). */
export interface Nav3dPart {
  NavMesh3D: new (objects: Loose | Loose[], o?: { radius?: number; height?: number; climb?: number; slope?: number; cell?: number; maxEdge?: number }) => {
    path(a: Loose, b: Loose): Loose[]; reachable(a: Loose, b: Loose): boolean; closest(p: Loose): Loose; random(p?: Loose, radius?: number): Loose | null;
    crowd(o?: { max?: number; maxRadius?: number }): { add(p: Loose, o?: { speed?: number; radius?: number; height?: number; accel?: number; separation?: number }): Loose; update(dt: number): Loose };
    destroy(): void;
  };
  loadNav3D(): Promise<Loose>; nav3DReady(): boolean;
}
export interface CharactersPart {
  lookAt(obj: Loose, target: Loose | null, dt?: number, o?: { max?: number; up?: number; speed?: number }): Loose;
  reach(upper: Loose, lower: Loose, target: Loose, o?: { pole?: Loose; length?: number; end?: Loose }): boolean;
  Steps: new (o?: { feet?: [number, number][]; stride?: number; lift?: number; time?: number; lead?: number; ground?: ((x: number, z: number) => number) | null }) => { feet: { pos: Loose; lifting: number; landed: boolean }[]; update(dt: number, body: Loose): Loose };
  Wobble: new (o?: { stiffness?: number; damping?: number }) => { value: number; hit(amount?: number): Loose; update(dt: number): Loose };
  /** Blend shapes on a mesh eased together, blinking by itself, lip sync to gs.sound.say. */
  Face: new (mesh: Loose, o?: { blinkEvery?: number; speed?: number }) => FaceT;
  /** Adds blend shapes to a geometry: fn sets out to how far each rest point p moves. */
  shapes(geo: Loose, fns: Record<string, (p: Loose, out: Loose) => void>): Loose;
  /** Mouth shapes over time for a line of speech. */
  visemes(text: string, o?: { rate?: number }): { t: number; ch: string; open: number; wide: number; round: number }[] & { end: number };
  FACE_SHAPES: string[];
}
export interface FaceT {
  blinkEvery: number; readonly talking: boolean;
  set(name: string, amount?: number): FaceT;
  say(text: string, o?: { pitch?: number; rate?: number; volume?: number; lang?: string }): Promise<boolean>;
  hush(): FaceT; mouth(level: number | null): FaceT; blink(): FaceT; update(dt: number): FaceT;
}
/** Thousands of flockers: on the graphics chip (WebGPU compute) where the phone can, else the CPU. */
export declare class Swarm {
  constructor(o?: { count?: number; w?: number; h?: number; speed?: number; sight?: number; separate?: number; align?: number; cohere?: number; wander?: number; edges?: 'wrap' | 'bounce'; seed?: number; gpu?: boolean | 'auto' });
  readonly count: number; living: number; gpu: boolean;
  x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array; alive: Uint8Array;
  speed: number; sight: number; separate: number; align: number; cohere: number; wander: number; edges: 'wrap' | 'bounce';
  /** Resolves true once it's moving on the GPU (false if it stays on the CPU). */
  ready: Promise<boolean>;
  /** Towards (x, y) this frame; strength < 0 pushes away. Up to 8 a frame. */
  pull(x: number, y: number, o?: { strength?: number; radius?: number }): this;
  obstacle(x: number, y: number, r: number): this; clearObstacles(): this;
  kill(i: number): this; revive(i: number, x: number, y: number): this; place(i: number, x: number, y: number): this;
  angle(i: number): number;
  /** Living ones within r of (x, y), as indices. */
  near(x: number, y: number, r: number): number[];
  /** 0 (all over) to 1 (all heading one way). */
  order(): number;
  update(dt: number): this; sync(): Promise<void>; dispose(): void;
  /** About how many this phone moves smoothly (8192 with the GPU, 2000 without). */
  static max(): number;
}
export interface AiPart { Crowd: new (...a: Loose[]) => Loose; NavGrid: new (...a: Loose[]) => Loose; Brain: new (...a: Loose[]) => Loose; YUKA: Loose; Swarm: typeof Swarm; Tree: typeof Tree; Choose: typeof Choose }

/** A behaviour tree (mistreevous MDSL text); agent gives each action and condition by name. Actions return Tree.ok, Tree.fail or nothing (still going). */
export declare class Tree {
  constructor(definition: string | object, agent: Record<string, (...a: Loose[]) => Loose>, o?: { seed?: number });
  static ok: string; static fail: string; static run: string;
  update(dt: number): this; reset(): this; readonly state: 'running' | 'ok' | 'failed'; path(): string[];
}
type Consideration = ((...a: Loose[]) => number) & { curve?: true };
/** Utility AI: the option whose considerations score highest (0..1, multiplied) wins; stick keeps the current pick a little longer. */
export declare class Choose {
  constructor(options: Record<string, Consideration | Consideration[] | { score: Consideration | Consideration[]; weight?: number }>, o?: { stick?: number; noise?: number; seed?: number });
  pick(...a: Loose[]): string; scores: Record<string, number>; current: string | null;
  static linear: Consideration; static quad: Consideration; static root: Consideration; static invert: Consideration;
  static logistic(mid?: number, k?: number): Consideration; static step(at?: number): Consideration;
}

/** Tiny Brains: a small neural network (tanh hidden layers, softmax out). */
export declare class TinyNet {
  constructor(sizes: number[], seed?: number);
  readonly sizes: number[]; readonly shape: string; readonly length: number; w: Float32Array;
  /** Probabilities for inputs x (reused array). */
  run(x: ArrayLike<number>): Float32Array;
  /** Makes `toward` more likely for x by `amount` (negative: less likely). */
  learn(x: ArrayLike<number>, toward: number, amount: number, ran?: boolean): this;
  copy(): TinyNet;
  pack(): string;
  static unpack(s: string): TinyNet | null;
}
export interface BrainOptions {
  name?: string;
  inputs: number;
  actions: number | string[];
  hidden?: number[];
  /** The game's own simple AI: the brain starts by copying it. */
  teacher?(see: number[]): number | string;
  /** Hard rules: return the action to use instead (or the same one). */
  rules?(see: number[], action: number | string): number | string | void;
  /** react: seconds between decisions; perSecond: most changes of mind a second; minNoise: share of random choices. */
  limits?: { react?: number; perSecond?: number; minNoise?: number };
  /** The player's win rate to aim for (0.6). */
  target?: number;
  learn?: number;
  drift?: number;
  /** Shared learning: start from everyone's average brain (true). */
  share?: boolean;
  /** Even steps: each number's step scaled to its own recent steps (true). */
  even?: boolean;
  /** Learn the player's real win chance at each skill level and aim the skill at the target (true). */
  odds?: boolean;
  /** Personalities: one extra input each; brain.style switches; the teacher and rules get it as a third argument. */
  styles?: string[];
  /** A wind-up before it changes what it's doing, so the player can read it (brain.telling). */
  tells?: boolean | { windup?: number; unsure?: number };
  /** A starting brain from your own play (Shadow.pack() or the debug overlay's B key). */
  start?: string;
  /** Lean towards what this player finds fun, from the app's signals (true). */
  fun?: boolean;
  /** Start a fresh brain at the player's usual level, and add to the profile (true). */
  profile?: boolean;
}
/** A Tiny Brain that learns as you play, with guard rails. */
export declare class Brain {
  constructor(api: GameApi | null, opts: BrainOptions);
  net: TinyNet; skill: number; trust: number; winRate: number; steps: number;
  /** The last action (its name when actions is a list). */
  readonly action: number | string;
  /** Picks an action for what it sees (numbers about -1..1), every frame. Returns its index. */
  act(see: number[], dt?: number): number;
  /** A moment that made the round exciting (about -1..1). */
  feel(x?: number): void;
  /** End of a duel or round: did the player win? */
  result(playerWon: boolean): void;
  /** The player's learned chance of winning a round at a skill level (default: the current one). */
  winChance(skill?: number): number;
  /** Forgets what it learned. */
  reset(): this;
  /** The personality it's playing; set a name or a mix ({ bold: .7, sneaky: .3 }). */
  style: string | Record<string, number> | undefined;
  /** During a wind-up (tells): what it's about to do. */
  readonly telling: { action: number | string; left: number; t: number } | null;
  /** How torn its last decision was, 0..1. */
  unsure: number;
  /** How fun rounds have looked lately (-1..1), and its learned lean (-0.3..0.3). */
  fun: number; lean: number; rounds: number;
  /** Learns from a move someone showed it (teach by playing). */
  watch(see: number[], action: number | string, amount?: number): this;
  /** The brain as text (for start). */
  pack(): string;
}
/** How this player plays, across every game (private, on the phone). */
export declare class Player {
  constructor(api: GameApi | null);
  readonly skill: number; readonly reaction: number; readonly aim: number;
  get(kind: string, fallback?: number): number; count(kind: string): number; note(kind: string, value: number): this; clear(): this;
}
/** A rival who remembers you between sessions. */
export declare class Nemesis {
  constructor(api: GameApi | null, opts: { name?: string; moves: number | string[]; target?: number; lines?: Partial<Record<'first' | 'back' | 'long' | 'habit' | 'won' | 'lost' | 'streak', string[]>> });
  record: { met: number; wins: number; losses: number; streak: number; last: number };
  readonly grudge: number; readonly habit: { move: number | string; sure: number } | null;
  met(now?: number): string | null; see(move: number | string): this; counter(skill?: number): number | string | null;
  result(playerWon: boolean): string | null; line(kind: string, vars?: Record<string, Loose>): string | null; forget(): this;
}
/** Copies how you play: race your own clone, or teach a brain by playing. */
export declare class Shadow {
  constructor(api: GameApi | null, opts: { name?: string; inputs: number; actions: number | string[]; hidden?: number[]; limits?: { react?: number; perSecond?: number; minNoise?: number }; rules?(see: number[], action: number | string): number | string | void; learn?: number });
  readonly action: number | string; like: number; seen: number; readonly ready: boolean;
  watch(see: number[], action: number | string): this; act(see: number[], dt?: number): number; pack(): string; reset(): this;
}
/** Learns the player's habits and guesses their next move. */
export declare class Predict {
  constructor(api: GameApi | null, opts: { moves: number | string[]; name?: string; learn?: number });
  /** The player made a move. */
  see(move: number | string): this;
  /** The most likely next move, or null before any moves. */
  guess(): number | string | null;
  /** A chance for each move (adds up to 1). */
  chances(): Float64Array;
  /** How sure the guess is, 0..1. */
  readonly sure: number;
  /** How often its guesses came true lately, 0..1. */
  right: number;
  /** Moves seen. */
  seen: number;
  /** Forgets every habit. */
  forget(): this;
}
export interface BrainMind { act(see: number[], dt?: number): number; readonly action: number | string; feel(x?: number): void; done(): void; readonly telling: { action: number | string; left: number; t: number } | null; readonly unsure: number; readonly style: string | undefined; }
export interface BrainsPart {
  Net: typeof TinyNet;
  Brain: typeof Brain;
  /** Every enemy in a wave is an experiment: wave.mind() per enemy (each with its own reaction time and action), mind.done() when it leaves. */
  Wave: new (brain: Brain, o?: { change?: number }) => { mind(o?: { style?: string }): BrainMind; /** How much the live minds disagree on these inputs, 0..1. */ unsure(see: number[]): number };
  /** Learns the player's habits and guesses their next move (board, card, rhythm, turn games). */
  Predict: typeof Predict;
  Player: typeof Player;
  Nemesis: typeof Nemesis;
  Shadow: typeof Shadow;
  /** Finds game-feel numbers whose trial result is closest to want (for makers, not players' phones). */
  tune(o: { params: Record<string, [number, number]>; trial(p: Record<string, number>): number; want: number; tries?: number; repeats?: number; seed?: number }): { params: Record<string, number>; result: number; tried: number; log: { params: Record<string, number>; result: number }[] };
  /** Tries moves ahead with your game's own step function. */
  Imagine: new <S>(o: { actions: number | string[]; step(state: S, action: number, dt: number): S; score(state: S): number; depth?: number; dt?: number; tries?: number; budget?: number; /** Always try every move: the same pick on every phone. */ fixed?: boolean; /** Switch planning off on low phones or when picks average over maxMs. */ auto?: boolean; maxMs?: number; /** The move while planning is off. */ fallback?(state: S): number | string; brain?: Brain; see?(state: S): number[] }) => { pick(state: S): number; readonly action: number | string; /** Rounds of tries the last pick used. */ readonly tried: number; /** Planning (false once auto switched it off). */ on: boolean; /** Why it's off: 'low phone' | 'too slow' | ''. */ why: string; /** Smoothed ms per pick. */ readonly cost: number };
  packWeights(sizes: number[], w: ArrayLike<number>): string;
  unpackWeights(s: string): { sizes: number[]; w: Float32Array } | null;
}

/** A tweak spec value: a number, [value, min, max, step?], a boolean, a '#colour', [choice, ...choices], or a function (a button). */
export type TweakSpec = Record<string, number | [number, number, number, number?] | boolean | string | string[] | (() => void)>;
/** Live sliders (npm run dev only); elsewhere it returns the starting values. Read the fields where they're used. */
export interface TweakFn {
  (name: string, spec: TweakSpec): Record<string, Loose>;
  (spec: TweakSpec): Record<string, Loose>;
}

// ---- round 6 game kits
export interface BoardPiece { kind?: Loose; col?: number; row?: number; x?: number; y?: number; [k: string]: Loose }
export interface BoardGroup { cells: { col: number; row: number }[]; pieces: BoardPiece[]; size: number; shape: 'line' | 'cross' }
export interface Board {
  cols: number; rows: number; cells: (BoardPiece | null)[]; busy: boolean; gone: BoardPiece[];
  in(c: number, r: number): boolean; get(c: number, r: number): BoardPiece | null; put(c: number, r: number, p: BoardPiece | null): BoardPiece | null; take(c: number, r: number): BoardPiece | null;
  each(fn: (p: BoardPiece, c: number, r: number) => void): void; readonly pieces: BoardPiece[];
  cellAt(x: number, y: number, x0?: number, y0?: number, size?: number): { col: number; row: number } | null;
  adjacent(a: { col: number; row: number }, b: { col: number; row: number }): boolean;
  neighbours(c: number, r: number, diagonal?: boolean): { col: number; row: number; piece: BoardPiece | null }[];
  swap(a: { col: number; row: number }, b: { col: number; row: number }): Board;
  matches(o?: { min?: number }): BoardGroup[]; clear(groups: BoardGroup[]): number;
  fall(dir?: 'down' | 'up' | 'left' | 'right'): Loose; refill(fill?: (c: number, r: number) => BoardPiece | null): BoardPiece[];
  settle(o?: { min?: number; tries?: number }): Board; hint(o?: { min?: number }): { a: { col: number; row: number }; b: { col: number; row: number } } | null; shuffle(): Board;
  slide(dir: 'up' | 'down' | 'left' | 'right', o?: { merge?: ((a: BoardPiece, b: BoardPiece) => BoardPiece | null) | null }): { moved: boolean; merged: Loose[]; gone: BoardPiece[] };
  flood(col: number, row: number, same?: (a: BoardPiece, b: BoardPiece) => boolean): { col: number; row: number }[];
  update(dt: number): Board; [more: string]: Loose;
}
export interface BoardPart { Board: new (cols: number, rows: number, o?: { fill?: ((c: number, r: number) => BoardPiece | null) | null; same?: (a: BoardPiece, b: BoardPiece) => boolean; speed?: number; rng?: () => number }) => Board }

export interface Fighter {
  name: string; hp: number; maxHp: number; atk: number; def: number; spd: number; luck: number; type: string | null; level: number; xp: number;
  buffs: { stat: string; by: number; turns: number }[]; statuses: Map<string, number>; readonly alive: boolean;
  stat(k: string): number; buff(stat: string, by: number, turns?: number): Fighter; has(status: string): boolean; heal(n: number): number; [more: string]: Loose;
}
export interface BattleMove { name?: string; power?: number; type?: string; accuracy?: number; status?: string; chance?: number; turns?: number; heal?: number; all?: boolean; [k: string]: Loose }
export interface Battle {
  sides: Fighter[][]; log: Loose[]; readonly fighters: Fighter[]; readonly turn: Fighter | null; readonly over: number | null;
  on(ev: string, fn: (e: Loose) => void): Battle; sideOf(f: Fighter): number; foes(f: Fighter): Fighter[]; friends(f: Fighter): Fighter[];
  next(): Fighter | null; preview(by: Fighter, target: Fighter, move?: BattleMove): number;
  damage(by: Fighter, target: Fighter, move?: BattleMove, roll?: boolean): { amount: number; crit: boolean; miss: boolean; effect: number; [k: string]: Loose };
  act(by: Fighter, o?: { move?: BattleMove | null; item?: string | null; target?: Fighter | Fighter[] | null; wait?: boolean }): Loose;
  inflict(target: Fighter, status: string, turns?: number): Loose; useItem(by: Fighter, item: string, target?: Fighter): Loose; endTurn(f: Fighter): Loose;
}
export interface Bag {
  defs: Record<string, Loose>; items: Map<string, number>;
  add(id: string, n?: number): number; take(id: string, n?: number): boolean; count(id: string): number; has(id: string, n?: number): boolean;
  readonly list: { id: string; n: number; def: Loose; bag: Bag }[]; save(): Record<string, number>; load(data: Record<string, number> | null): Bag;
}
export interface BattlePart {
  Fighter: new (o?: { name?: string; hp?: number; atk?: number; def?: number; spd?: number; luck?: number; type?: string | null; level?: number; [k: string]: Loose }) => Fighter;
  Battle: new (sides: Fighter[][], o?: { types?: Record<string, Record<string, number>>; statuses?: Record<string, Loose>; rng?: () => number; crit?: number; spread?: boolean }) => Battle;
  Bag: new (defs?: Record<string, Loose>, o?: { slots?: number; stack?: number }) => Bag;
  xpFor(level: number, o?: { base?: number; power?: number }): number; levelFor(xp: number, o?: { base?: number; power?: number }): number;
  /** Adds XP and levels up (stats grow by growth per level). Returns the levels gained. */
  gainXp(f: Fighter, xp: number, o?: { growth?: Record<string, number>; curve?: { base?: number; power?: number } }): number;
  /** Picks an entry from a weighted table: [{ id: 'coin', w: 10 }, { id: 'gem', w: 1 }]. */
  loot<T extends { w?: number }>(table: T[], rng?: () => number): T;
}

export interface GenMap { grid: string[]; readonly text: string; w: number; h: number }
export interface GenPart {
  dungeon(w?: number, h?: number, o?: { seed?: number | string; kind?: 'digger' | 'uniform' | 'rogue'; doors?: boolean; dug?: number }): GenMap & { rooms: { x: number; y: number; w: number; h: number; cx: number; cy: number }[]; start: { col: number; row: number }; end: { col: number; row: number } };
  cave(w?: number, h?: number, o?: { seed?: number | string; fill?: number; steps?: number; connect?: boolean }): GenMap;
  maze(w?: number, h?: number, o?: { seed?: number | string; kind?: 'backtracker' | 'eller' | 'divided' }): GenMap;
  heightmap(w?: number, h?: number, o?: { seed?: number | string; scale?: number; octaves?: number }): { w: number; h: number; data: Float32Array; at(x: number, y: number): number };
  islands(w?: number, h?: number, o?: { seed?: number | string; sea?: number; scale?: number }): GenMap & { heights: Loose };
  pattern(sample: string, w?: number, h?: number, o?: { seed?: number | string; n?: number; symmetry?: number; periodic?: boolean; tries?: number }): GenMap | null;
  fov(map: string | ((col: number, row: number) => boolean), col: number, row: number, radius?: number): Set<string>;
  /** Proven levels: makes levels until one passes check (false/null = throw away; true or a number, higher is better). Seeded. */
  proven<L>(make: (seed: number) => L, check: (level: L) => boolean | number | null | undefined, o?: { seed?: number | string; tries?: number; good?: number }): { level: L | null; score: number; tried: number; seed: number };
  /** Steps from one mark to another through anything that isn't a wall, or -1. */
  reach(text: string, from?: string | { col: number; row: number }, to?: string | { col: number; row: number }, o?: { walls?: string }): number;
}

export interface DragThing { x: number; y: number; w?: number; h?: number; r?: number; [k: string]: Loose }
export interface Drag {
  pieces: DragThing[]; slots: DragThing[]; readonly busy: boolean; readonly order: DragThing[];
  on(ev: 'pick' | 'over' | 'drop' | 'reject' | 'home' | 'reorder', fn: (...a: Loose[]) => void): Drag;
  piece<T extends DragThing>(p: T): T; slot<T extends DragThing>(s: T): T; remove(p: DragThing): void; at(x: number, y: number): DragThing | null;
  down(x: number, y: number, id?: number): DragThing | null; move(x: number, y: number, id?: number): void; up(x: number, y: number, id?: number): void;
  place(p: DragThing, s: DragThing | null): Drag; update(dt: number): Drag;
}
export interface History<S = Loose> {
  max: number; at: number; undos: number; redos: number; readonly steps: { state: S; label: string }[];
  readonly canUndo: boolean; readonly canRedo: boolean; readonly undoLabel: string | null; readonly redoLabel: string | null; readonly back: number; readonly ahead: number;
  on(ev: 'change' | 'undo' | 'redo', fn: (h: History<S>) => void): History<S>;
  push(state: S, label?: string, o?: { merge?: string | number | null }): History<S>; group(state: S, label: string, fn: () => void): History<S>;
  undo(n?: number): S | null; redo(n?: number): S | null; now(i?: number): S; restart(): S; clear(state: S): History<S>;
  pack(keep?: number): Loose; unpack(d: Loose): History<S>;
}
export interface HistoryPart { History: new <S = Loose>(start: S, o?: { max?: number }) => History<S> }
export interface ItemDef { stack?: number; kind?: string; weight?: number; [k: string]: Loose }
export interface ItemStack { id: string; n: number }
export interface Inventory {
  defs: Record<string, ItemDef>; slots: (ItemStack | null)[]; equip: Record<string, ItemStack | null>; extra: Record<string, string>; readonly weight: number; readonly free: number;
  on(ev: 'add' | 'take' | 'full' | 'move' | 'sort', fn: (...a: Loose[]) => void): Inventory;
  count(id: string): number; has(id: string, n?: number): boolean; all(): ItemStack[]; add(id: string, n?: number): number; take(id: string, n?: number): boolean;
  at(where: number | string): ItemStack | null; fits(s: ItemStack | null, where: number | string): boolean; move(from: number | string, to: number | string, n?: number): boolean;
  split(from: number | string): number; sort(by?: ((a: string, b: string) => number) | null): Inventory; save(): Loose; load(d: Loose): Inventory;
}
export interface Recipe { id: string; needs: Record<string, number>; makes: number; keep: string[]; at: string | null; time: number; name: string }
export interface CraftJob { recipe: Recipe; left: number; inv: Loose }
export interface Recipes {
  list: Recipe[];
  add(id: string, needs: Record<string, number>, o?: { makes?: number; keep?: string[]; at?: string | null; time?: number; name?: string }): Recipes;
  recipe(id: string, inv?: Loose, at?: string | null): Recipe | null; missing(id: string, inv: Loose, at?: string | null): Record<string, number> | null;
  can(inv: Loose, at?: string | null): Recipe[]; times(id: string, inv: Loose, at?: string | null): number; uses(item: string): Recipe[]; make(id: string, inv: Loose, at?: string | null): Recipe | null;
  timer: { jobs: CraftJob[]; on(ev: 'done', fn: (r: Recipe, over: number) => void): Loose; progress(job: CraftJob): number; update(dt: number): void; clear(): void };
}
export interface ItemsPart {
  Inventory: new (defs?: Record<string, ItemDef>, o?: { slots?: number; extra?: Record<string, string>; stack?: number; weight?: number }) => Inventory;
  Recipes: new (defs?: Record<string, ItemDef>) => Recipes;
}
export interface AdvSpot { id: string; room: string; x?: number; y?: number; w?: number; h?: number; r?: number; poly?: [number, number][]; z?: number; look?: string | ((s: AdvSpot) => string); take?: boolean | string; took?: string; exit?: string; locked?: string | boolean; talk?: string | ((s: AdvSpot) => string); cant?: string | ((item: string) => string); when?: () => boolean; walk?: [number, number]; [k: string]: Loose }
export interface AdvRoom { id: string; name: string; spots: AdvSpot[]; map?: [number, number]; spot(id: string, s: Partial<AdvSpot>): AdvRoom; [k: string]: Loose }
export interface AdvResult { spot: AdvSpot | null; did: 'take' | 'exit' | 'use' | 'look' | 'talk' | 'locked' | 'cant' | 'nothing'; text: string | null }
export interface Adventure {
  rooms: Map<string, AdvRoom>; here: string; seen: Set<string>; flags: Record<string, Loose>; bag: Loose; lines: { nothing: string; cant: string };
  on(ev: 'say' | 'enter' | 'take' | 'exit' | 'use' | 'look' | 'talk' | 'locked' | 'cant' | 'nothing' | 'flag' | 'combine', fn: (...a: Loose[]) => void): Adventure;
  room(id: string, o?: { map?: [number, number]; name?: string; [k: string]: Loose }): AdvRoom; spot(id: string, room?: string): AdvSpot | null; spots(room?: string): AdvSpot[]; at(x: number, y: number, room?: string): AdvSpot | null;
  rule(item: string, target: string, fn: (spot: AdvSpot | null, item: string, other?: string) => string | void, o?: { keep?: boolean }): Adventure;
  flag(k: string): Loose; flag(k: string, v: Loose): Adventure; unlock(room: string, spot: string): Adventure; isLocked(s: AdvSpot): boolean; go(room: string): Adventure; say(text: string, spot?: AdvSpot): string;
  tap(x: number, y: number, item?: string | null): AdvResult; act(s: AdvSpot, item?: string | null, verb?: 'look' | null): AdvResult; combine(a: string, b: string): string | null;
  walkTo(s: AdvSpot, floorY?: number | null): { x: number; y: number };
  map(): { id: string; name: string; col: number; row: number; here: boolean; links: string[] }[];
  drawMap(c: CanvasRenderingContext2D, x: number, y: number, o?: { w?: number; h?: number; gap?: number; room?: string; here?: string; line?: string; text?: string; font?: string }): void;
  save(): Loose; load(d: Loose): Adventure;
}
export interface AdventurePart { Adventure: new (o?: { start?: string | null; bag?: Loose }) => Adventure }
export interface HexCell { q: number; r: number; x: number; y: number; corners: [number, number][]; data: Record<string, Loose> }
export interface HexMap {
  size: number; pointy: boolean; cells: Map<string, HexCell>; readonly list: HexCell[];
  add(q: number, r: number): HexCell; remove(c: HexCell): HexMap; cell(q: number, r: number): HexCell | null; at(x: number, y: number): HexCell | null; each(fn: (c: HexCell) => void): HexMap;
  neighbours(c: HexCell): HexCell[]; distance(a: HexCell, b: HexCell): number; line(a: HexCell, b: HexCell): HexCell[]; range(c: HexCell, n: number): HexCell[]; ring(c: HexCell, n: number): HexCell[];
  reach(from: HexCell, moves: number, cost?: (c: HexCell, from: HexCell) => number): Map<HexCell, number>; path(a: HexCell, b: HexCell, cost?: (c: HexCell, from: HexCell) => number): HexCell[] | null;
  sees(a: HexCell, b: HexCell, blocks?: (c: HexCell) => boolean): boolean; save(): Loose; load(d: Loose): HexMap;
  /** The box round every cell, in game units (x, y its top left). */
  readonly bounds: { x: number; y: number; w: number; h: number };
  shift(dx: number, dy: number): HexMap;
  /** Moves the map so its middle is at x, y. */
  centre(x: number, y: number): HexMap;
}
export interface Iso {
  tw: number; th: number; x: number; y: number; zh: number;
  toScreen(tx: number, ty: number, z?: number): { x: number; y: number }; toTile(x: number, y: number): { tx: number; ty: number }; corners(tx: number, ty: number, z?: number): [number, number][];
  sort<T extends { tx: number; ty: number; z?: number }>(list: T[]): T[];
}
export interface HexPart {
  /** x, y: the map's TOP LEFT corner. cx, cy: put the map's middle there instead. */
  HexMap: new (o?: { size?: number; pointy?: boolean; shape?: 'rect' | 'hex' | 'none'; w?: number; h?: number; radius?: number; x?: number; y?: number; cx?: number; cy?: number }) => HexMap;
  Iso: new (o?: { tw?: number; th?: number; x?: number; y?: number; zh?: number | null }) => Iso;
}
export interface XY { x: number; y: number; [k: string]: Loose }
export interface Select<T extends XY = XY> {
  chosen: Set<T>; readonly list: T[]; box: { x: number; y: number; w: number; h: number } | null;
  on(ev: 'change', fn: (list: T[]) => void): Select<T>; has(t: T): boolean; set(list: T[]): Select<T>; clear(): Select<T>; near(x: number, y: number): T | null;
  down(x: number, y: number): void; move(x: number, y: number): void; up(x: number, y: number): boolean;
}
export interface FlowField { w: number; h: number; size: number; dist: Float32Array; tile(x: number, y: number): { tx: number; ty: number }; to(tx: number, ty: number, force?: boolean): FlowField; at(tx: number, ty: number): number; dir(x: number, y: number): { x: number; y: number } }
export interface BuildGrid { w: number; h: number; size: number; things: Set<Loose>; at(tx: number, ty: number): Loose; free(tx: number, ty: number): boolean; fits(tx: number, ty: number, fw?: number, fh?: number): boolean; snap(x: number, y: number, fw?: number, fh?: number): { tx: number; ty: number; x: number; y: number; ok: boolean }; place(thing: Loose, tx: number, ty: number, fw?: number, fh?: number): boolean; remove(thing: Loose): BuildGrid }
export interface RtsPart {
  Select: new <T extends XY = XY>(things: () => T[], o?: { radius?: number; drag?: number; kind?: (t: T) => Loose; doubleTap?: number }) => Select<T>;
  formation<T extends XY>(units: T[], x: number, y: number, o?: { shape?: 'grid' | 'line' | 'wedge' | 'circle'; gap?: number; facing?: number | null }): [T, { x: number; y: number }][];
  FlowField: new (w: number, h: number, size: number, cost?: (tx: number, ty: number) => number) => FlowField;
  BuildGrid: new (w: number, h: number, size: number, o?: { blocked?: (tx: number, ty: number) => boolean }) => BuildGrid;
  target<T extends XY>(from: XY, things: Iterable<T>, o?: { range?: number; by?: 'first' | 'last' | 'near' | 'far' | 'strong' | 'weak'; progress?: (t: T) => number; hp?: (t: T) => number }): T | null;
}
export type FBox = [number, number, number, number];
export interface FightMove { start: number; active: number; recover: number; hit?: FBox[] | FBox[][]; hurt?: FBox[]; input?: string; damage?: number; stun?: number; blockStun?: number; stop?: number; low?: boolean; high?: boolean; cancel?: string[]; cancelAny?: boolean; [k: string]: Loose }
export interface FightReader { window: number; buffer: number; dead: number; readonly dir: number; feed(x: number, y: number, buttons?: Record<string, boolean>, dt?: number, facing?: number): FightReader; take(b: string): boolean; holding(b: string): boolean; did(cmd: string): boolean; special(moves: Record<string, FightMove>): string | null; clear(): void }
export interface Fighter {
  moves: Record<string, FightMove>; x: number; y: number; facing: number; hp: number; maxHp: number; move: string | null; frame: number; stun: number; stop: number; blocking: boolean; blockLow?: boolean;
  readonly phase: 'start' | 'active' | 'recover' | 'stun' | 'idle'; readonly busy: boolean;
  on(ev: 'start' | 'active' | 'end' | 'hit' | 'blocked' | 'hurt' | 'block', fn: (...a: Loose[]) => void): Fighter;
  canCancel(name: string): boolean; start(name: string): boolean; update(dt: number): Fighter; hitboxes(): { x: number; y: number; w: number; h: number }[]; hurtboxes(): { x: number; y: number; w: number; h: number }[];
}
export interface FightPart {
  Reader: new (o?: { window?: number; buffer?: number; dead?: number }) => FightReader;
  Fighter: new (moves: Record<string, FightMove>, o?: { x?: number; y?: number; facing?: number; hurt?: FBox[]; hp?: number }) => Fighter;
  clash(a: Fighter, b: Fighter): { move: FightMove; name: string; blocked: boolean; x: number; y: number } | null;
}
export interface BulletOpts { accel?: number; turn?: number; wave?: [number, number]; home?: number; kind?: number; life?: number }
export interface Bullets {
  max: number; w: number; h: number; margin: number; n: number; readonly count: number; target: { x: number; y: number } | null;
  x: Float32Array; y: Float32Array; sp: Float32Array; an: Float32Array; kind: Uint8Array;
  fire(x: number, y: number, speed: number, angle: number, o?: BulletOpts): number; kill(i: number): void; update(dt: number, target?: { x: number; y: number } | null): void;
  each(fn: (x: number, y: number, kind: number, angle: number, i: number) => void): void;
  hit(x: number, y: number, r?: number, graze?: number, size?: (kind: number) => number): { hit: number; grazed: number; x: number; y: number };
  clear(fn?: ((x: number, y: number, kind: number) => void) | null, x?: number, y?: number, r?: number): number;
}
type Aim = number | { x: number; y: number } | (() => { x: number; y: number } | null);
export interface Emitter {
  every: number; rotate: number; times: number; fired: number; on: boolean; readonly done: boolean;
  ring(n: number, speed: number, o?: BulletOpts): Emitter; spread(n: number, arc: number, speed: number, aim?: Aim, o?: BulletOpts): Emitter; spiral(arms: number, speed: number, step?: number, o?: BulletOpts): Emitter;
  burst(n: number, speed: number, aim: Aim, slow?: number, o?: BulletOpts): Emitter; custom(fn: (b: Bullets, x: number, y: number, angle: number, volley: number) => void): Emitter;
  update(dt: number, x: number, y: number): number; reset(): Emitter;
}
export interface BulletsPart {
  Bullets: new (o?: { max?: number; w?: number; h?: number; margin?: number }) => Bullets;
  Emitter: new (bullets: Bullets, o?: { every?: number; rotate?: number; times?: number; delay?: number; o?: BulletOpts }) => Emitter;
}
export interface SandMaterials { readonly EMPTY: 0; readonly WALL: 1; readonly DIRT: 2; readonly WOOD: 3; readonly SAND: 4; readonly WATER: 5; readonly OIL: 6; readonly FIRE: 7; readonly SMOKE: 8; readonly ACID: 9; readonly STEAM: 10; readonly LAVA: 11; readonly STONE: 12 }
export interface Sand {
  w: number; h: number; rate: number; bg: [number, number, number, number]; t: Uint8Array;
  get(x: number, y: number): number; set(x: number, y: number, m: number): void; solid(x: number, y: number): boolean; inside(x: number, y: number): boolean;
  fill(fn: (x: number, y: number) => number): Sand; paint(x: number, y: number, r: number, m: number, o?: { over?: boolean; chance?: number }): Sand;
  blast(x: number, y: number, r: number, o?: { fire?: boolean }): number; count(m: number, x?: number, y?: number, w?: number, h?: number): number;
  update(dt: number): Sand; step(): void; colour(m: number, rgbv: [number, number, number, number]): Sand; picture(bg?: [number, number, number, number]): HTMLCanvasElement | OffscreenCanvas;
}
export interface SandPart { M: SandMaterials; Sand: new (w?: number, h?: number, o?: { seed?: number }) => Sand }
export interface FlowHere { in: boolean; kind: string | null; depth: number; speed: number; current: { x: number; y: number; z: number }; edge: number; fall: boolean; foam?: number; hurt: number; level?: number; d?: number; side?: number; stream: Loose }
export interface FlowStream { path: Loose; width: number; speed: number; depth: number; kind: string; hurt: number; push: number; readonly length: number; rock(d: number, side: number, r?: number): FlowStream; surface(d: number, side?: number): { x: number; y: number; z: number }; isFall(d: number): boolean }
export interface FlowOptions { width?: number; speed?: number; depth?: number; kind?: 'water' | 'lava' | 'acid' | 'mud' | 'deep'; hurt?: number; push?: number; fall?: number }
export interface FloodPart {
  N: number; size: number; l: number; D: Float32Array; B: Float32Array; edges: 'wall' | 'drain'; rate: number;
  ground(fn: (x: number, z: number) => number): FloodPart; pour(x: number, z: number, rate?: number, r?: number): { x: number; z: number; rate: number; r: number }; drain(x: number, z: number, rate?: number, r?: number): Loose; remove(src: Loose): FloodPart;
  rain(rate: number): FloodPart; add(x: number, z: number, volume: number, r?: number): FloodPart; depth(x: number, z: number): number; wet(x: number, z: number, deep?: number): boolean; level(x: number, z: number): number;
  current(x: number, z: number): { x: number; z: number; speed: number }; volume(): number; update(dt: number): FloodPart; step(h: number): void;
}
export interface FlowPart {
  /** Rivers, pools, whirlpools: current that carries things, waterfalls, lava and acid that hurt. space '2d' (x, y) or '3d' (ground x, z). */
  Streams: new (o?: { space?: '2d' | '3d' }) => On<Loose> & {
    list: Loose[]; river(path: Loose, o?: FlowOptions): FlowStream; pool(at: { x: number; y?: number; z?: number }, r: number, o?: FlowOptions & { w?: number; h?: number; spin?: number; pull?: number }): Loose;
    whirl(at: { x: number; y?: number; z?: number }, r: number, spin?: number, pull?: number, o?: FlowOptions): Loose; remove(s: Loose): Loose;
    at(p: { x: number; y?: number; z?: number }): FlowHere; carry(obj: { x: number; y: number; z?: number }, dt: number, o?: { drag?: number }): FlowHere; hurt(obj: Loose, dt: number): number;
  };
  /** Shallow water that floods: spreads, runs downhill, fills hollows. */
  Flood: new (o?: { size?: number; cells?: number; x?: number; z?: number; y?: number | null; ground?: (x: number, z: number) => number; edges?: 'wall' | 'drain'; damp?: number; rate?: number }) => FloodPart;
}
export interface ArtLook { hue?: number; palette?: string[] }
export interface ArtColours { main: string; dark: string; light: string; accent: string; hue: number }
export interface ArtCreature { body: 'round' | 'tall' | 'wide' | 'drop' | 'bean'; legs: number; eyes: number; horns: boolean; spots: boolean; mouth: string; wings: boolean; colour: ArtColours; draw(c: CanvasRenderingContext2D, x: number, y: number, size?: number, time?: number): void }
export interface ArtFace { skin: string; hairCol: string; hair: string; eyes: string; mouth: string; glasses: boolean; beard: boolean; freckles: boolean; draw(c: CanvasRenderingContext2D, x: number, y: number, size?: number, mood?: number): void }
export interface ArtItem { kind: 'sword' | 'potion' | 'gem' | 'shield' | 'key' | 'ring'; rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'; rarityColour: string; power: number; colour: ArtColours; draw(c: CanvasRenderingContext2D, x: number, y: number, size?: number): void }
export interface ArtBuilding { floors: number; bays: number; roof: 'flat' | 'peak' | 'dome'; draw(c: CanvasRenderingContext2D, x: number, y: number, size?: number, night?: number): void }
export interface ArtSprite { canvas: HTMLCanvasElement | OffscreenCanvas | null; mask: Uint8Array; w: number; h: number; draw(c: CanvasRenderingContext2D, x: number, y: number, scale?: number): void }
export interface ArtPart {
  creature(seed: number, o?: ArtLook): ArtCreature; face(seed: number, o?: { skin?: string; hair?: string }): ArtFace;
  item(seed: number, kind?: ArtItem['kind'] | null, o?: ArtLook): ArtItem; building(seed: number, o?: ArtLook): ArtBuilding;
  sprite(seed: number, w?: number, h?: number, colours?: string[], o?: { fill?: number }): ArtSprite; name(seed: number, kind?: 'person' | 'place' | 'thing'): string;
}
export interface SportsPitch { w: number; h: number; goal: number; x: number; y: number; goalFor(side: 0 | 1): { x: number; y: number; half: number }; toPitch(side: 0 | 1, u: number, v: number): { x: number; y: number }; upfield(side: 0 | 1, p: { x: number; y: number }): number }
export interface SportsAct { do: 'chase' | 'shoot' | 'pass' | 'dribble' | 'support' | 'mark' | 'keep'; x: number; y: number; to?: Loose; kick?: { x: number; y: number; power: number } }
export interface SportsTeam {
  pitch: SportsPitch; side: 0 | 1; skill: number; keeper: boolean; shootRange: number; players: Loose[]; chaser: Loose; plan: Map<Loose, SportsAct>;
  home(p: Loose, ball: { x: number; y: number }): { x: number; y: number };
  think(world: { ball: { x: number; y: number; vx?: number; vy?: number; owner?: Loose }; mates?: Loose[]; foes?: Loose[] }, dt?: number): Map<Loose, SportsAct>;
  kick(p: { x: number; y: number }, at: { x: number; y: number }, power: number): { x: number; y: number; power: number };
}
export interface SportsPart {
  Pitch: new (o?: { w?: number; h?: number; goal?: number; x?: number; y?: number }) => SportsPitch;
  Team: new (pitch: SportsPitch, side: 0 | 1, o?: { formation?: string | [number, number][]; skill?: number; shootRange?: number | null; keeper?: boolean | null; players?: Loose[] | null; rnd?: () => number }) => SportsTeam;
}
export interface DragPart { Drag: new (o?: { snap?: number; accept?: (piece: DragThing, slot: DragThing) => boolean; lift?: number; speed?: number; list?: { x: number; y: number; gap?: number; axis?: 'x' | 'y' } | null; swap?: boolean }) => Drag }

export interface Earner {
  defs: Record<string, { base: number; growth?: number; rate?: number; [k: string]: Loose }>; owned: Record<string, number>; money: number; mult: number; readonly perSecond: number;
  add(id: string, def: { base: number; growth?: number; rate?: number; [k: string]: Loose }): Earner; price(id: string, n?: number): number; canBuy(id: string, n?: number): boolean; buy(id: string, n?: number): boolean;
  update(dt: number): Earner; catchUp(seconds: number, share?: number): number; save(): Loose; load(d: Loose): Earner;
}
export interface IdlePart {
  cost(base: number, growth: number, owned?: number, n?: number): number; afford(base: number, growth: number, owned: number, money: number, max?: number): number;
  short(n: number, digits?: number): string; curve(level: number, levels: number, from: number, to: number, power?: number): number;
  Earner: new (defs?: Record<string, Loose>, money?: number) => Earner;
}

export interface PartyPlayer { index: number; name: string; color: string; score: number; out: boolean }
export interface Turns {
  players: PartyPlayer[]; i: number; round: number; handover: boolean; waiting: boolean;
  readonly player: PartyPlayer; readonly leader: PartyPlayer; readonly left: PartyPlayer[]; readonly winners: PartyPlayer[];
  add(points: number, p?: PartyPlayer): Turns; out(p?: PartyPlayer): Turns; next(): Turns; ready(): Turns; over(rounds?: number): boolean;
  cover(c: Ctx, w: number, h: number, o?: { text?: string; sub?: string }): void; save(): Loose; load(d: Loose): Turns;
}
export interface Split {
  w: number; h: number; n: number; areas: { x: number; y: number; w: number; h: number; turn: number }[];
  resize(w: number, h: number): Split; who(x: number, y: number): number; local(p: number, x: number, y: number): { x: number; y: number; w: number; h: number };
  begin(c: Ctx, p: number): { x: number; y: number; w: number; h: number; turn: number }; end(c: Ctx): void;
}
export interface PartyPart {
  Turns: new (o?: { players?: number; names?: string[] | null; colors?: string[]; handover?: boolean; first?: number }) => Turns;
  Split: new (w: number, h: number, o?: { players?: number; facing?: boolean; across?: boolean }) => Split;
}

/** A beat clock in step with the music as the player hears it (it allows for the phone's sound delay by itself). */
export interface Beat { bpm: number; offset: number; steps: number; time: number; running: boolean; onBeat: boolean; onStep: boolean; readonly spb: number; readonly beat: number; readonly phase: number; /** The sound delay being allowed for, in seconds. */ readonly delay: number; start(): Beat; stop(): Beat; update(dt: number): Beat }
export interface ChartNote { time: number; beat: number; lane: number; hold: number; hit: boolean; result: 'perfect' | 'good' | 'miss' | null }
export interface Chart {
  notes: ChartNote[]; lanes: number; length: number; counts: { perfect: number; good: number; miss: number }; combo: number; best: number;
  w: { perfect: number; good: number; miss: number }; readonly done: boolean; readonly accuracy: number;
  hit(lane: number, time: number): { result: 'perfect' | 'good' | 'miss'; note: ChartNote; error: number } | null;
  missed(time: number): ChartNote[]; near(time: number, ahead?: number, behind?: number): ChartNote[];
}
export interface RhythmPart {
  lag(): number;
  Beat: new (o?: { bpm?: number; offset?: number; steps?: number; /** false: count from when sounds are played, with no allowance for the phone's sound delay. */ heard?: boolean }) => Beat;
  Chart: new (text: string, o?: { bpm?: number; per?: number; lead?: number; windows?: { perfect?: number; good?: number; miss?: number } }) => Chart;
  Calibrate: new (o?: { bpm?: number; beats?: number; skip?: number }) => { beat: Beat; taps: number[]; done: boolean; lag: number; update(dt: number): Loose; tap(): Loose };
}

export type Pt = [number, number];
export interface Stroke {
  points: Pt[]; length: number; readonly first: Pt; readonly last: Pt; readonly closed: boolean; readonly turns: number;
  readonly bounds: { x: number; y: number; w: number; h: number; cx: number; cy: number };
  add(x: number, y: number): Stroke; simplify(tolerance?: number): Pt[]; resample(n?: number): Pt[];
  draw(c: Ctx, o?: { width?: number; color?: string; cap?: CanvasLineCap }): void;
}
export interface StrokesPart {
  SHAPES: readonly string[];
  Stroke: new (o?: { smooth?: number; gap?: number }) => Stroke;
  Shapes: new (names?: readonly string[], o?: { n?: number; sure?: number }) => {
    add(name: string, points: Pt[]): Loose; match(points: Pt[], o?: { min?: number }): { name: string; score: number; sure: boolean } | null; rank(points: Pt[]): { name: string; score: number }[];
  };
  toPhysics(phys: Loose, points: Pt[], o?: { thick?: number; fixed?: boolean; [k: string]: Loose }): Loose;
  pathLength(p: Pt[]): number; bounds(p: Pt[]): { x: number; y: number; w: number; h: number; cx: number; cy: number }; resample(p: Pt[], n?: number): Pt[]; simplify(p: Pt[], tol?: number): Pt[];
}

export interface DriveInput { throttle?: number; steer?: number; brake?: boolean; drift?: boolean; surface?: number }
interface WheelsBase {
  top: number; reverse: number; accel: number; brakes: number; roll: number; turn: number; grip: number; driftGrip: number; boostAfter: number; boost: number; boostTime: number;
  speed: number; slide: number; drifting: boolean; driftDir: number; driftTime: number; boostLeft: number; boosted: boolean; charge: number; readonly pace: number;
  kick(seconds?: number): WheelsBase;
}
type WheelsOpts = { top?: number; reverse?: number; accel?: number; brakes?: number; roll?: number; turn?: number; grip?: number; driftGrip?: number; boostAfter?: number; boost?: number; boostTime?: number };
export interface Car extends WheelsBase { x: number; y: number; angle: number; vx: number; vy: number; update(dt: number, input?: DriveInput): Car; bump(nx?: number, ny?: number, o?: { keep?: number }): Car; point(forward: number, right?: number): XY }
export interface Kart extends WheelsBase {
  x: number; y: number; z: number; heading: number; vx: number; vy: number; vz: number; onGround: boolean; lean: number; pitch: number; airTime: number; landed: boolean; fell: boolean; impact?: number;
  hop(): Kart; update(dt: number, input?: DriveInput, ground?: ((x: number, z: number) => number | null) | null): Kart; bump(nx?: number, nz?: number, o?: { keep?: number }): Kart; place(obj: Loose): Kart;
}
export interface VehiclesPart {
  Car: new (o?: WheelsOpts & { x?: number; y?: number; angle?: number }) => Car;
  Kart: new (o?: WheelsOpts & { x?: number; y?: number; z?: number; heading?: number; gravity?: number; hop?: number }) => Kart;
  Laps: new (points: Pt[], o?: { radius?: number; laps?: number }) => {
    points: Pt[]; laps: number; racers: Loose[]; join<T>(r: T): T; update<T>(r: T): T; places<T = Loose>(): T[]; aim(r: Loose, ahead?: number): { x: number; y: number; angle: number };
  };
}

export interface Level3D {
  grid: string[]; rows: number; cols: number; size: number; group: Loose; marks: Record<string, Level3DCell[]>; blocks: Loose[];
  ch(col: number, row: number): string; cell(col: number, row: number): Level3DCell; at(x: number, z: number): { col: number; row: number; ch: string };
  height(x: number, z: number): number | null; walkable(col: number, row: number): boolean; find(ch: string): Level3DCell[];
  solid(world: Loose, o?: Loose): Loose[]; readonly blocked: (col: number, row: number) => boolean; dispose(): void;
}
export interface Level3DCell { col: number; row: number; x: number; y: number; z: number }
export interface Level3dPart { Level3D: new (text: string, o?: { size?: number; wall?: number; step?: number; floor?: number; water?: number; look?: Record<string, Loose> | ((ch: string) => Loose); shadows?: boolean }) => Level3D }

export interface SkyPart {
  DAY: [number, { top: string; horizon: string; sun: string; sunI: number; amb: number }][];
  Sky: new (view: Loose, o?: { time?: number; speed?: number; day?: SkyPart['DAY']; stars?: number; /** Colours from light scattering in air (Preetham). */ physical?: boolean | { haze?: number; blue?: number; mie?: number; glow?: number; bright?: number }; fog?: boolean; light?: boolean; sun?: Loose; hemi?: Loose; tilt?: number;
    /** Cloud cover 0..1 (clouds lit by the sun; on a view with air() their shadows cross the ground). */ clouds?: number; cloudLight?: string; cloudDark?: string;
    /** 0..1: keeps the low sky round the sun clear of cloud. */ gap?: number;
    /** Next Gen: reflections and sky light come from this sky (redone as it changes). */ env?: boolean; sunSize?: number }) => {
    time: number; speed: number; night: number; clouds: number; gap: number; /** 0..1 lights up the sky and clouds (lightning): set it while a flash shows. */ flash: number;
    readonly dayPart: number; update(dt: number): Loose; apply(): Loose; dispose(): void;
  };
  Weather: new (view: Loose, o?: { kind?: 'rain' | 'snow' | 'storm' | 'clear'; amount?: number; area?: number; /** [x, z] push, or a gs.outdoors.Wind to follow. */ wind?: number[] | { x?: number; z?: number; [k: string]: Loose }; max?: number; color?: string }) => {
    kind: string; amount: number; wind: [number, number]; onFlash: ((far: number) => void) | null; readonly flashing: boolean;
    set(kind: 'rain' | 'snow' | 'storm' | 'clear', amount?: number): Loose; flash(): Loose; update(dt: number): Loose; dispose(): void;
  };
}

// ---------- round 7: action, stealth, traversal, missions, sport, big levels ----------
export interface P3 { x: number; y: number; z?: number }
type On<T> = { on(ev: string, fn: (...a: Loose[]) => void): T };
export interface Shot { from: P3; dir: P3; range: number; speed: number; damageAt(distance: number, head?: boolean): number }
export interface Gun {
  damage: number; rate: number; mag: number; reserve: number; reload: number; ammo: number; kick: { pitch: number; yaw: number };
  justFired: boolean; empty: boolean; readonly reloading: number; readonly spreadNow: number;
  pull(from: P3, dir: P3, pressed?: boolean): Shot[]; update(dt: number): Gun; startReload(): boolean; damageAt(distance?: number, head?: boolean): number;
  save(): Loose; load(d: Loose): Gun; [k: string]: Loose;
}
export interface Health {
  hp: number; max: number; armour: number; down: boolean; dead: boolean; hits: { angle: number; amount: number; life: number }[]; readonly frac: number; readonly hurting: boolean;
  hurt(amount: number, o?: { from?: P3; at?: P3; facing?: number }): number; heal(n: number): number; addArmour(n: number): Health; revive(share?: number): Health; update(dt: number): Health; reset(): Health;
}
export interface CombatPart {
  Gun: new (o?: { damage?: number; rate?: number; mag?: number; reserve?: number; reload?: number; spread?: number; bloom?: number; maxSpread?: number; settle?: number; pellets?: number; auto?: boolean; recoil?: number; sideways?: number; recover?: number; range?: number; falloff?: [number, number, number]; head?: number; speed?: number; rng?: () => number }) => Gun;
  Shots: new (o?: { gravity?: number }) => { list: Loose[]; add(s: Shot, extra?: Loose): Loose; update(dt: number, hits: (shot: Loose, from: P3, to: P3) => Loose): Loose[] };
  arc(from: P3, vel: P3, gravity?: number, o?: { steps?: number; dt?: number; ground?: (p: P3) => boolean }): P3[];
  lob(from: P3, to: P3, time?: number, gravity?: number): P3;
  Health: new (o?: { max?: number; regen?: number; delay?: number; armour?: number; maxArmour?: number; absorb?: number; downed?: boolean; bleed?: number }) => Health;
  hitFrom(from: P3, at: P3, facing?: number): number;
  Markers: new () => { list: Loose[]; add(head?: boolean, kill?: boolean): Loose; update(dt: number): Loose; readonly showing: boolean };
  Explosives: new (o?: { fuse?: number; radius?: number; damage?: number }) => On<Loose> & { list: Loose[]; add(o: Loose): Loose; light(b: Loose, now?: boolean): Loose; boom(b: Loose): Loose; near(p: P3, r?: number): Loose; update(dt: number): Loose };
}
export interface CoverSpot { x: number; y: number; col: number; row: number; nx: number; ny: number; low: boolean; by: Loose }
export interface TacticsPart {
  CoverMap: new (cols: number, rows: number, blocked: (c: number, r: number) => boolean, o?: { size?: number; x0?: number; y0?: number; low?: (c: number, r: number) => boolean }) => {
    spots: CoverSpot[]; size: number; protects(spot: CoverSpot, threat: P3): boolean;
    find(from: P3, threat: P3, o?: { near?: number; band?: [number, number]; flank?: number; who?: Loose; sees?: (a: P3, b: P3) => boolean }): CoverSpot | null;
    take(spot: CoverSpot | null, who: Loose): CoverSpot | null; free(who: Loose): Loose; peek(spot: CoverSpot, threat: P3): P3; at(col: number, row: number): CoverSpot | null;
  };
  Squad: new (members: Loose[], o?: { cover?: Loose; sees?: (m: Loose, t: P3) => boolean; range?: number; grenades?: number; camp?: number; think?: number; aggression?: number; rng?: () => number }) => On<Loose> & {
    members: Loose[]; readonly left: Loose[]; update(dt: number, target: P3): Loose; hurt(m: Loose): Loose; reloading(m: Loose): Loose;
  };
  Route: new (points: P3[], o?: { leash?: number; reach?: number }) => On<Loose> & { points: P3[]; i: number; readonly point: P3; readonly done: boolean; update(dt: number, ally: P3, player: P3): Loose };
}
export interface ClimbPart {
  Ledges: { new (): { list: Loose[]; add(a: P3, b: P3, normal: { x: number; z: number }, o?: Loose): Loose; closest(p: P3, filter?: (l: Loose) => boolean): Loose }; fromLevel(level: Loose, o?: { min?: number }): Loose };
  Climber: new (ledges: Loose, o?: { height?: number; reach?: number; shimmy?: number; leap?: number; upTime?: number; leapTime?: number; out?: number }) => {
    state: 'free' | 'hang' | 'shimmy' | 'up' | 'leap' | 'swing'; pos: P3; facing: number; ledge: Loose; events: string[]; launch: P3 | null; fling: P3 | null;
    grab(feet: P3, vy?: number): boolean; update(dt: number, input?: { x?: number; y?: number; jump?: boolean }): Loose; leapOrKick(x: number, y: number): Loose; letGo(up?: number, kick?: boolean): Loose; swing(rope: Loose, vel?: P3): Loose;
  };
  Rope: new (anchor: P3, length?: number, o?: { gravity?: number; pump?: number; damping?: number }) => { anchor: P3; length: number; catch(feet: P3, vel: P3, height?: number): Loose; update(dt: number, push?: number): Loose; readonly hands: P3; feet(height?: number): P3; release(): P3 };
}
export interface Mission {
  objectives: { text: string; at: P3 | null; done: boolean }[]; lines: { text: string; who: string | null; life: number }[]; flags: Record<string, Loose>; time: number;
  done: boolean; failed: string | false; readonly current: { text: string; at: P3 | null } | null; readonly replaying: boolean;
  update(dt: number): Mission; restart(fresh?: boolean): Mission; wait(s: number): Loose; until(test: () => boolean): Loose; all(...w: Loose[]): Loose; any(...w: Loose[]): Loose;
  objective(text: string, o?: { at?: P3; keep?: boolean }): Loose; say(text: string, o?: { who?: string; time?: number }): void; checkpoint(name?: string): Loose; flag(name: string, v?: Loose): Mission;
  complete(): void; fail(reason?: string): void; save(): Loose; load(s: Loose): Mission; on(ev: 'objective' | 'say' | 'checkpoint' | 'complete' | 'fail' | 'restart', fn: (...a: Loose[]) => void): Mission;
}
export interface MissionsPart {
  zone(at: P3 | { x: number; y: number; w: number; h: number }, r?: number | null): { has(p: P3): boolean; any(list: P3[]): boolean; count(list: P3[]): number };
  Mission: new (script: (m: Mission) => Generator<Loose, void, Loose>, o?: { save?: (d: Loose) => void; load?: () => Loose }) => Mission;
}
export interface CutsceneStep { at?: number; cam?: P3[]; look?: P3 | ((t: number) => P3); time?: number; ease?: 'linear' | 'in' | 'out' | 'inOut'; say?: string; who?: string; do?: (c: Loose) => void; shake?: number; bars?: number }
export interface CutscenePart {
  along(points: P3[], u: number): P3;
  Cutscene: new (steps: CutsceneStep[], o?: { bars?: number; skippable?: boolean }) => On<Loose> & {
    playing: boolean; done: boolean; bars: number; line: { text: string; who: string | null } | null; shot: { x: number; y: number; z: number; look: P3 } | null; readonly progress: number;
    update(dt: number): Loose; skip(): Loose; reset(): Loose; drawBars(c: CanvasRenderingContext2D, w: number, h: number, colour?: string): void; drawLine(c: CanvasRenderingContext2D, w: number, h: number, o?: Loose): void;
  };
}
export interface Prompt { kind: 'tap' | 'hold' | 'swipe' | 'mash'; x?: number; y?: number; time?: number; dir?: 'up' | 'down' | 'left' | 'right'; hold?: number; count?: number; [k: string]: Loose }
export interface PromptsPart {
  Prompts: new (o?: { radius?: number; swipe?: number }) => On<Loose> & {
    active: boolean; timeScale: number; passed: number; readonly now: Prompt | null; readonly left: number;
    start(list: Prompt[], o?: { slow?: number; ease?: number }): Loose; update(dt: number): Loose; down(x: number, y: number): void; move(x: number, y: number): void; up(): void; cancel(): Loose;
    draw(c: CanvasRenderingContext2D, w: number, h: number, o?: { colour?: string; ink?: string }): void;
  };
}
export interface StealthPart {
  lightAt(p: Pt2, lights: { x: number; y: number; r?: number; i?: number; cone?: number; dir?: number }[], o?: { ambient?: number; sees?: (light: Pt2, p: Pt2) => boolean }): number;
  Takedown: { check<T>(player: Pt2, guards: T[], o?: { reach?: number; behind?: number; moods?: string[] }): T | null; front(player: Pt2, g: Loose, o?: { reach?: number }): boolean };
  Bodies: new (o?: { range?: number }) => On<Loose> & { list: Loose[]; add(x: number, y: number, who?: Loose): Loose; carry(b: Loose): Loose; drop(b: Loose, x: number, y: number): Loose; hide(b: Loose): Loose; near(p: Pt2, reach?: number): Loose[]; update(dt: number, guards: Loose[], sees?: (g: Loose, b: Loose) => boolean): Loose };
  Floors: new (kinds?: Record<string, number>, at?: (p: Pt2) => string | null, o?: { walk?: number; run?: number }) => { noise(p: Pt2, speed: number, o?: { sneak?: number; runSpeed?: number }): number };
  Disguise: new (o?: { fools?: Record<string, string[]>; close?: number }) => { wearing: string | null; wear(kind: string): Loose; off(): Loose; blow(seconds?: number): Loose; update(dt: number): Loose; fooling(g: Loose, player?: Pt2): boolean; light(g: Loose, lit: number, player?: Pt2): number };
}
type Pt2 = { x: number; y: number };
export interface GadgetsPart {
  Grapple: new (o?: { range?: number; reel?: number; swing?: boolean; flyTime?: number; min?: number }) => {
    attached: boolean; flying: number; point: P3 | null; length: number; arrived?: boolean; miss: { from: P3; to: P3 } | null;
    fire(from: P3, dir: P3, ray: (from: P3, dir: P3, max: number) => { point: P3 } | null): boolean; update(dt: number, pos: P3, vel: P3, o?: { reel?: boolean }): P3; release(): Loose;
  };
  Zipline: new (a: P3, b: P3, o?: { gravity?: number; drag?: number; grab?: number; hang?: number }) => { riding: boolean; done?: boolean; t: number; speed: number; near(p: P3, handsUp?: number): boolean; ride(p?: P3 | null, speed?: number): Loose; update(dt: number): Loose; closest(p: P3): { t: number; point: P3; d: number }; readonly hands: P3; readonly pos: P3; readonly vel: P3 };
  Wires: new (cols?: number, rows?: number, o?: { seed?: number }) => { cols: number; rows: number; cells: number[]; moves: number; readonly solved: boolean; get(c: number, r: number): number; turn(c: number, r: number): Loose; lit(c: number, r: number): boolean };
  Lock: new (o?: { pins?: number; speed?: number; gap?: number; shrink?: number; seed?: number }) => { pin: number; pins: number; a: number; at: number; gap: number; failed: boolean; readonly solved: boolean; update(dt: number): Loose; stop(): boolean; reset(): Loose };
  Code: new (o?: { keys?: number; start?: number; seed?: number }) => { seq: number[]; i: number; failed: boolean; readonly done: boolean; press(k: number): boolean; grow(): Loose; retry(): Loose };
}
export interface CampaignMission { id: string; name?: string; stars?: (number | string)[]; collect?: number; needs?: { stars?: number; done?: string }; state?: 'locked' | 'open' | 'done'; got?: number; best?: number | null; found?: number; [k: string]: Loose }
export interface CampaignPart {
  Campaign: new (chapters: { id: string; name?: string; needs?: { stars?: number; done?: string }; missions: CampaignMission[]; [k: string]: Loose }[], o?: { extras?: Record<string, number> }) => On<Loose> & {
    chapters: Loose[]; missions: CampaignMission[]; readonly stars: number; readonly maxStars: number; readonly progress: number; readonly unlocked: Record<string, boolean>;
    attach(api: Loose, key?: string): Loose; clear(save?: boolean): Loose; done(id: string): boolean; best(id: string): number | null; starsOf(id: string): number; starList(id: string): boolean[];
    state(id: string): 'locked' | 'open' | 'done'; open(id: string): boolean; next(): CampaignMission | null; has(extra: string): boolean;
    finish(id: string, o?: { score?: number; stars?: boolean[] }): { stars: number; newStars: number; best: number | null; unlocked: string[] } | null;
    collect(id: string, i: number): boolean; picked(id: string, i: number): boolean; collected(id: string): number; pack(): Loose; unpack(d: Loose): Loose;
  };
}
export interface BallCar {
  team: number; boost: number; maxBoost: number; readonly pos: P3; readonly vel: P3; readonly rot: Loose; readonly speed: number; readonly grounded: boolean; readonly boosting: boolean;
  readonly forward: P3; readonly up: P3; readonly right: P3; readonly upsideDown: boolean;
  control(i: { throttle?: number; steer?: number; brake?: boolean; boost?: boolean; jump?: boolean; pitch?: number; yaw?: number; roll?: number }): BallCar; update(dt: number): BallCar; spawn(s: P3 & { facing?: number }): BallCar; rightUp(): BallCar; remove(): void;
}
export interface ArenaPart {
  Arena: new (world: Loose, o?: { w?: number; l?: number; h?: number; curve?: number; segments?: number; goal?: { w?: number; h?: number; d?: number }; ball?: Loose; ballR?: number; bounce?: number; time?: number; punch?: number; replay?: number; pads?: boolean }) => On<Loose> & {
    ball: Loose; cars: Loose[]; score: [number, number]; clock: number; overtime: boolean; over: boolean; wait: number; pads: { x: number; z: number; big: boolean; wait: number }[]; spawns: (P3 & { facing: number })[][]; lastTouch: Loose; frames: Loose[];
    restart(): Loose; kickoff(countdown?: number): Loose; inGoal(p: P3): number; update(dt: number): Loose; predict(seconds?: number, step?: number): (P3 & { t: number; bounce: boolean })[]; danger(seconds?: number): number;
    playback(t: number): { p: P3; q: Loose }[] | null; readonly replayLength: number; readonly clockText: string;
  };
  BallCar: new (world: Loose, mesh: Loose, o?: { team?: number; at?: P3; wheels?: Loose[]; power?: number; steer?: number; top?: number; boostTop?: number; maxBoost?: number; boostUse?: number; boostPush?: number; jump?: number; dodge?: number; air?: number; start?: number; w?: number; h?: number; l?: number }) => BallCar;
  chaseBall(car: BallCar, arena: Loose, o?: { skill?: number }): { throttle: number; steer: number; boost: boolean; jump: boolean };
}
/** What gs.models.creature takes. Colours are '#rrggbb'. */
export interface CreatureOptions {
  kind?: 'quad' | 'bird' | 'fish' | 'insect' | 'monster';
  like?: 'dog' | 'cat' | 'horse' | 'deer' | 'cow' | 'pig' | 'bear' | 'rabbit' | 'mouse' | 'lizard' | 'songbird' | 'crow' | 'duck' | 'hawk' | 'owl' | 'chicken' | 'heron' | 'fish' | 'shark' | 'eel' | 'puffer' | 'angler' | 'beetle' | 'ladybird' | 'ant' | 'bee' | 'butterfly' | 'dragonfly' | 'spider' | 'dragon' | 'beast' | 'ogre' | 'imp' | 'blob' | 'serpent';
  /** Its own build, coat, pattern and size (none: the animal as the book shows it). */
  seed?: number;
  /** Metres from nose to rump (a bird: beak to tail; one that stands up: its height). An insect is tiny at its real size: give it one the camera can see. */
  size?: number;
  colour?: string; color?: string; belly?: string; accent?: string;
  pattern?: 'plain' | 'spots' | 'stripes' | 'patches' | 'bands' | 'socks' | 'back' | 'tips' | 'hood';
  /** Colours of its parts: eyes (the iris), horn, hoof, claw, beak, legs (a bird's, an insect's), comb, mane, wing, fin, nose, shell, lure. */
  eyes?: string; horn?: string; hoof?: string; claw?: string; beak?: string; legs?: string; comb?: string; mane?: string; wing?: string; fin?: string; nose?: string; shell?: string; lure?: string;
  /** Any of its measures by name, as creature.look.build lists them ({ neck: .5, horns: 'antlers', wings: 1 }). */
  build?: Record<string, number | string>;
  /** .5 coarser .. 2 finer (1). */
  detail?: number; shadows?: boolean;
  /** Sculpt on the spot (tools and tests: the page stops while it does). */
  now?: boolean;
}
export type CreatureT = Loose & {
  rig: RigT;
  /** Moves its legs, wings, fins or coils for a speed in metres a second (0: it stands, hovers or drifts). fly: in the air; swim: a serpent in water; turn: -1..1, it leans. */
  move(dt: number, speed?: number, o?: { fly?: boolean; swim?: boolean; turn?: number }): CreatureT;
  /** Metres a second where each of its gaits sits. */
  speeds: { walk?: number; trot?: number; run?: number; fly?: number; swim?: number };
  bones: Record<string, Loose>; mesh: Loose; lods: Loose[];
  /** 0 close .. 2 far. */
  lod: number;
  /** Picks the level of detail by its size on screen; returns it. */
  see(camera: Loose, screenHeightPx?: number): number;
  size: { length: number; height: number; width: number };
  /** What the seed chose: kind, like, seed, size, colour, belly, accent, pattern, eyes, build (its measures). */
  look: Record<string, Loose>;
  kind: string; like: string;
  /** Another of the very same creature, sharing everything but its skeleton. */
  twin(): CreatureT;
};
export interface RigT {
  state: string;
  play(name: string, o?: { fade?: number }): RigT; upper(name: string | null): RigT; add(name: string, fn: Loose, rate?: number): RigT;
  /** 1D blend space: { pose: value }, mixed at v with every cycle in step. */
  blend(space: Record<string, number>, v: number): RigT;
  /** 2D blend space: { pose: [x, y] }, mixed at (x, y). */
  blend2(space: Record<string, [number, number]>, x: number, y: number): RigT;
  /** Foot IK after update(): feet on the floor at ground(x, z); body is the character. */
  plant(ground: (x: number, z: number) => number, body: Loose, o?: { most?: number }): RigT;
  update(dt: number, o?: { speed?: number; aim?: number; turn?: number }): RigT;
}
export interface PosesPart {
  POSES: Record<string, Loose>;
  Rig: new (parts: Loose, o?: { fade?: number; height?: number; poses?: Record<string, Loose>; joints?: string[] }) => RigT;
  /** A skinned person: one smooth mesh over the figure's bones, with a Rig and a Face. */
  person(o?: { body?: string; skin?: string; legs?: string; shoes?: string; hair?: string | null; eyes?: string; lips?: string; sleeves?: 'long' | 'short'; girth?: number; mat?: (colour: string) => Loose; scale?: number; shadows?: boolean }): Loose & { rig: RigT; face: FaceT; mesh: Loose; bones: Record<string, Loose> };
  Face: CharactersPart['Face']; shapes: CharactersPart['shapes']; visemes: CharactersPart['visemes']; FACE_SHAPES: string[];
  figure(o?: { body?: string; skin?: string; legs?: string; shoes?: string; hair?: string; mat?: (colour: string) => Loose; scale?: number; shadows?: boolean }): Loose;
}
export interface DestructionPart {
  shatter(mesh: Loose, o?: { pieces?: number; at?: P3; flat?: boolean; inside?: Loose; world?: Loose; push?: number; seed?: number; density?: number; radius?: number }): Loose[];
  slice(mesh: Loose, point: P3, normal: P3, o?: { inside?: Loose }): Loose[];
  Rubble: new (scene?: Loose, o?: { max?: number; life?: number; shrink?: number }) => { add(pieces: Loose | Loose[]): Loose; update(dt: number): Loose; clear(): Loose; readonly count: number };
}
export interface PropsPart {
  simplify(geometry: Loose, keep?: number): Loose;
  /** A finished InstancedMesh of still things, swapped in place for one that skips the copies off screen (same look). Returns the new mesh. */
  perCopy(instancedMesh: Loose, o?: { renderer?: Loose }): Loose;
  /** Frees the perCopy() / Props meshes under root once it's thrown away (a rebuilt level). */
  freeCopies(root: Loose): void;
  Props: new (scene: Loose, o?: { renderer?: Loose; shadows?: boolean }) => {
    kind(name: string, geometry: Loose, material: Loose, o?: { lod?: (number | [number, Loose])[]; keep?: number[]; shadows?: boolean; shadowFar?: number; capacity?: number }): Loose;
    mesh(name: string): Loose; add(name: string, x: number, y: number, z: number, o?: { rot?: number | P3; scale?: number | P3; color?: string }): number;
    move(name: string, id: number, x: number, y: number, z: number): Loose; remove(name: string, id: number): Loose; hide(name: string, id: number, hidden?: boolean): Loose;
    scatter(name: string, count: number, area: { x0: number; z0: number; x1: number; z1: number } | ((rnd: () => number) => { x: number; z: number }), o?: { gap?: number; seed?: number; y?: (x: number, z: number) => number; keepOut?: (x: number, z: number) => boolean; scale?: [number, number]; spin?: boolean }): number[];
    done(o?: { margin?: number }): Loose; near(name: string, p: P3, r: number): { id: number; x: number; y: number; z: number; d: number }[]; count(name?: string): number; clear(): Loose;
  };
  Areas: new (o?: { depth?: number }) => { current: string | null; add(name: string, object: Loose, box?: Loose): Loose; link(a: string, b: string): Loose; at(p: P3): string | null; update(p: P3): Loose; readonly shown: string[] };
  Chunks: new (scene: Loose, o: { size?: number; radius?: number; make: (cx: number, cz: number) => Loose; drop?: (o: Loose, cx: number, cz: number) => void; perFrame?: number }) => { update(p: P3): Loose; ready(p: P3): boolean; clear(): Loose; readonly count: number };
}

export interface LandPart {
  object: Loose; mesh: Loose; /** A gs.outdoors Wind: the grass sways with it. */ wind?: WindPart | null; size: number; segments: number; low: number; high: number;
  height(x: number, z: number): number; normal(x: number, z: number): P3; slope(x: number, z: number): number; inside(x: number, z: number): boolean;
  flatten(x: number, z: number, r: number, h?: number, soft?: number): LandPart; paint(stops: [number, string][]): LandPart; masks(fn: (x: number, z: number, y: number, slope: number) => number[]): LandPart; solid(world: Loose, o?: Loose): Loose;
  grass(o?: { count?: number; colour?: string; /** [from, to]: tufts get a colour between the two. */ tint?: string[]; width?: number; height?: number; blades?: number; above?: number; below?: number; steep?: number; far?: number; seed?: number; wind?: number }): Loose;
  /**
   * Thick grass round the camera: a square of tufts that travels with it over the land (each tuft stays where it grows), bending with land.wind.
   * reach: metres to the square's edge; gap: metres between tufts; bends: 1..3 pieces a blade; stalks: seed stalks a tuft; where(x, z) => 0..1 how
   * thickly it grows; tall(x, z) => 0..1 how high. Call again for another ring (fine close by, coarse further out); false takes them all away.
   * Needs update(dt, camera) each frame: after a camera cut the square fills in over a few frames, nearest first (budget: milliseconds a frame); update(0, camera) plants it all at once.
   */
  meadow(o?: false | { reach?: number; gap?: number; height?: number; width?: number; blades?: number; bends?: number; stalks?: number; spread?: number; colours?: string[]; where?: ((x: number, z: number) => number) | null; tall?: ((x: number, z: number) => number) | null; steep?: number; seed?: number; budget?: number }): Loose;
  /** The meadow rings on this land (each an instanced mesh). */
  meadows: Loose[];
  scatter(props: Loose, name: string, count: number, o?: { above?: number; below?: number; steep?: number; keepOut?: (x: number, z: number) => boolean; inset?: number; [k: string]: Loose }): number[];
  update(dt: number, camera?: Loose): LandPart; dispose(): void;
}
export interface WaterPart {
  mesh: Loose; level: number; t: number;
  height(x: number, z: number, t?: number): number; normal(x: number, z: number, t?: number): P3; depth(p: P3): number; update(dt: number, centre?: P3 | null): WaterPart; dispose(): void;
}
export interface WindPart {
  x: number; z: number; gust: number; gustSize: number; sway: number; grass: number; readonly speed: number; readonly angle: number;
  uniforms: { lkWind: { value: number }; lkWindDir: { value: Loose } };
  update(dt: number, at?: P3 | null): WindPart; at(x: number, z: number, out?: Loose): { x: number; z: number; speed: number; gust: number };
}
export interface OutdoorsPart {
  /** Terrain (THREE.Terrain): kind 'hills' | 'mountains' | 'rolling' | 'islands' | 'bumps' | 'dunes' | 'cracked' | 'ridges' | 'smooth', or (x, z) => height. */
  Land: new (o?: { kind?: string | ((x: number, z: number) => number); size?: number; segments?: number; low?: number; high?: number; seed?: number; smooth?: number; steps?: number; colours?: [number, string][]; material?: Loose; edge?: number }) => LandPart;
  /** Waves (a sum of sines) you can read anywhere: height, normal, depth. */
  Water: new (o?: { level?: number; waves?: number | { height: number; length: number; dir?: number; speed?: number }[]; size?: number; segments?: number; colour?: string; opacity?: number; material?: Loose; seed?: number }) => WaterPart;
  tree(o?: { kind?: 'pine' | 'round' | 'palm' | 'bush'; trunk?: string; leaves?: string; height?: number; seed?: number }): Loose;
  rock(o?: { size?: number; colour?: string; seed?: number }): Loose;
  /** Outdoor looks for Next Gen worlds, as patches on standard materials. Colours: '#hex' or [r, g, b] linear. Numbers can be shared uniforms ({ value }). */
  looks: {
    /** Painted ground; needs land.masks(). */
    ground(material: Loose, o?: { detail?: Loose; colours?: Partial<Record<'grassA' | 'grassB' | 'dry' | 'dirt' | 'mud' | 'rock' | 'forest' | 'cropA' | 'cropB' | 'plough' | 'hedge', string | number[]>>; fields?: false | { angle?: number; size?: [number, number]; furrows?: number; hedge?: number }; roads?: [number, number, number, number][]; road?: { width?: number; edge?: number; ruts?: number }; bank?: { low?: number; high?: number; shiny?: number; shinier?: number }; wet?: number | { value: number }; scale?: [number, number, number] }): { uniforms: Record<string, { value: Loose }>; wet: number };
    hills(material: Loose, o?: { wood?: string | number[]; scale?: number; woods?: number }): { uniforms: Record<string, { value: Loose }> };
    rock(material: Loose, o?: { detail?: Loose; scale?: number; moss?: string | number[]; mossy?: number }): { uniforms: Record<string, { value: Loose }> };
    leaves(material: Loose, o?: { time?: number | { value: number }; wind?: number | { value: number } | WindPart; sun?: Loose; sway?: number; above?: number; glow?: number; atlas?: [number, number] }): { uniforms: Record<string, { value: Loose }> };
    /** Grass blades for an instanced meadow (land.meadow() uses it): tufts shrink to their roots towards reach[1] metres from the camera and bend with the wind. The mesh needs an instanced vec4 'lkRoot' (each tuft's root) and uv.y from root to tip. */
    meadow(material: Loose, o?: { reach?: [number, number]; time?: number; bend?: number; dir?: Loose }): { uniforms: Record<string, { value: Loose }> };
    /** Moving water for a River mesh (its lkFlow / lkDir attributes). */
    flow(material: Loose, o?: { deep?: string | number[]; shallow?: string | number[]; foam?: string | number[]; scale?: number; ripple?: number; froth?: number; time?: number | { value: number } }): { uniforms: Record<string, { value: Loose }> };
    /** Molten lava for a River mesh: glowing cracks, cooling crust. */
    lava(material: Loose, o?: { glow?: string | number[]; crust?: string | number[]; heat?: number; cool?: number; scale?: number; time?: number | { value: number }; length?: number }): { uniforms: Record<string, { value: Loose }> };
  };
  /** Draws a gs.flow river, waterfall or pool: moving water with foam, or lava (kind 'lava'), acid, mud. update(dt) each frame. */
  River: new (stream: Loose, o?: { step?: number; across?: number; lift?: number; look?: Loose; material?: Loose }) => { mesh: Loose; stream: Loose; look: { uniforms: Record<string, { value: Loose }> }; update(dt: number): Loose; dispose(): void };
  /** Draws a gs.flow Flood (and runs it on the graphics chip on WebGPU when given the view). update() each frame after flood.update(dt). */
  FloodWater: new (flood: FloodPart, o?: { view?: Loose; deep?: string; shallow?: string; opacity?: number; rough?: number; full?: number }) => { mesh: Loose; flood: FloodPart; update(): Loose; dispose(): void };
  /** One wind for a world: grass (land.wind), leaves, rain, particles, cloud shadows; at(x, z) for bullets and flags. */
  Wind: new (o?: { x?: number; z?: number; gust?: number; gustSize?: number; sway?: number; grass?: number }) => WindPart;
  /** Far stand-in for a tree: crossed cards with baked pictures of it (null without 3D). Use as a props lod level: [dist, imp.geometry, imp.material]. */
  impostor(geometry: Loose, material: Loose, o?: { cards?: number; size?: number; round?: number; material?: Loose }): { geometry: Loose; material: Loose; texture: Loose; dispose(): void } | null;
  /** Tiling detail, normal and ripple textures for ground and rock, made in code (shared: clone() before changing repeat). */
  groundDetail(o?: { seed?: number }): { detail: Loose; normal: Loose; ripple: Loose };
  /** A ring of far hills round a Land, with the hills look. */
  horizon(land: LandPart, o?: { inner?: number; outer?: number; height?: number; seed?: number; lower?: ((x: number, z: number) => number) | null; colours?: { meadow?: string; forest?: string; rock?: string }; segments?: number; rings?: number; look?: false | Loose }): Loose;
}
export interface CityPlan {
  seed: number; side: 'right' | 'left'; nx: number; nz: number; style: Record<string, Loose>;
  /** Road centre lines (x for the roads running north-south, z for east-west) and their widths. */
  xs: number[]; zs: number[]; wx: number[]; wz: number[];
  bounds: { x0: number; x1: number; z0: number; z1: number };
  blocks: { id: number; i: number; j: number; x0: number; x1: number; z0: number; z1: number; sw: number; kind: 'build' | 'park' | 'plaza' }[];
  buildings: CityBuilding[];
  nodes: { id: number; i: number; j: number; x: number; z: number; hx: number; hz: number; out: number[]; signal: boolean; phase: number }[];
  edges: { id: number; a: number; b: number; len: number; dx: number; dz: number; axis: 'x' | 'z'; lanes: number; width: number; speed: number }[];
  trees: { x: number; z: number; s: number; kind: string }[]; lamps: { x: number; z: number; face: number }[]; benches: { x: number; z: number; rot: number }[];
  spots: { door: CitySpot[]; rooftop: CitySpot[]; corner: CitySpot[]; park: CitySpot[] };
  water?: { z: number };
}
export interface CityBuilding {
  id: number; block: number; facade: string; floors: number; shops: boolean; face: 0 | 1 | 2 | 3; x0: number; x1: number; z0: number; z1: number; h: number;
  /** Its boxes, bottom up (towers step back as they rise). */
  parts: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }[];
  roof: 'flat' | 'gable'; colour: string | null; door: CitySpot; fire?: boolean; bits: { kind: string; x: number; y: number; z: number; s: number }[];
}
export interface CitySpot { x: number; y: number; z: number; nx?: number; nz?: number; building?: number; block?: number; heading?: number; lane?: number; edge?: Loose }
export interface CityCar { id: number; kind: 'car' | 'van'; taxi: boolean; colour: string; x: number; z: number; heading: number; v: number; vmax: number; braking: boolean; stun: number; edge: Loose; lane: number }
export interface CityPerson { id: number; x: number; z: number; heading: number; speed: number; panic: number; down: number; shirt: string; block: Loose }
/** gs.models: things made in code for Next Gen scenes (no image or model files). */
export interface SculptShape {
  ball?: number; box?: [number, number, number]; cylinder?: [number, number]; torus?: [number, number]; cone?: [number, number];
  capsule?: [[number, number, number], [number, number, number]]; r?: number; round?: number;
  at?: [number, number, number]; rot?: [number, number, number]; scale?: number | [number, number, number];
  blend?: number; cut?: boolean; colour?: string; color?: string;
}
export interface ModelsPart {
  /** A material from a recipe: 'wood' | 'planks' | 'bark' | 'brick' | 'stone' | 'cobbles' | 'tiles' | 'concrete' | 'metal' | 'rust' | 'paint' | 'fabric' | 'leather' | 'marble' | 'dirt' | 'sand' | 'snow'. Options: the recipe's colours (colour, dark, mortar, gap, rust, deep, under, vein, grout), seed, repeat [u, v], size (texture pixels, 256), depth (parallax, WebGPU); WebGPU: closeUp (sharp detail near the camera, default on), solid (laid on by world position, metres per tile), scatter (no visible repeat). Others go to gs.hd.pbr. */
  material(name: string, o?: { colour?: string; color?: string; seed?: number; repeat?: [number, number]; size?: number; depth?: number; closeUp?: boolean; solid?: boolean | number; scatter?: boolean; [k: string]: Loose }): Loose;
  /** The recipe names. */
  readonly materials: readonly string[];
  /** Ages a mesh in place (and returns it), from its own shape: outer edges rubbed lighter, creases and the part near the ground grimy, moss or snow on what faces up. Baked once into vertex colours (free to draw). edges, dirt, moss, snow 0..1; ground: metres up from its bottom that get dirty (.4); edgeColour, dirtColour, mossColour; seed; split (false: don't add corners first). */
  wear<M = Loose>(mesh: M, o?: { edges?: number; edgeColour?: string; dirt?: number; dirtColour?: string; ground?: number; moss?: number; mossColour?: string; snow?: number; seed?: number; split?: boolean }): M;
  /** An everyday thing built in code from the recipes and aged with wear(): a Group (one mesh per material), foot at y = 0, facing +z. seed (small differences), size (its main measure, metres), colour (main material), wear (wear() options, or false), tile (metres per texture repeat), lit (lamp brightness). The same options again give a copy sharing shapes and materials. */
  prop(name: 'crate' | 'barrel' | 'drum' | 'pallet' | 'table' | 'chair' | 'bench' | 'shelf' | 'lamp' | 'fence' | 'sign' | 'bucket' | 'sack' | 'chest' | 'cone' | 'bin' | 'door' | 'pipe', o?: { seed?: number; size?: number; colour?: string; color?: string; wear?: false | Record<string, Loose>; tile?: number; lit?: number }): Loose;
  /** The prop names. */
  readonly props: readonly string[];
  /** A mesh from soft shapes melted together or carved away, made with surface nets: each { ball: r } | { box: [w, h, d], round } | { cylinder: [r, h], round } | { torus: [R, r] } | { cone: [r, h] } | { capsule: [[x, y, z], [x, y, z]], r }, with at, rot, scale, blend (metres), cut, colour (vertex colours: use a material with vertexColors). Or a distance function (x, y, z) => d with o.bounds. Options: blend (.08), res (48, up to 128), colour. Returns a BufferGeometry (shared for the same shapes: clone before changing). */
  sculpt(shapes: SculptShape[] | ((x: number, y: number, z: number) => number), o?: { blend?: number; res?: number; bounds?: [[number, number, number], [number, number, number]]; colour?: string; color?: string }): Loose;
  /** A tree grown in code (EZ-Tree: branches that split, bend and taper) with the bark recipe and leaves drawn in code that sway and glow with the sun behind: 'oak' | 'ash' | 'aspen' | 'pine' | 'bush'. size 'small' | 'medium' | 'large' (its shape), height (metres), seed, leaves / bark (colours), wind (.6, or a gs.outdoors Wind). A Group, foot at y = 0; the same options again give a copy sharing shapes and materials. */
  tree(kind?: 'oak' | 'ash' | 'aspen' | 'pine' | 'bush', o?: { size?: 'small' | 'medium' | 'large'; height?: number; seed?: number; leaves?: string; bark?: string; wind?: number | Loose }): Loose;
  /** The tree kinds. */
  readonly trees: readonly string[];
  /** A close-up building from a shape grammar: floors split into bays, each a real window opening (frame, glass set back, sill) or the door; string course, cornice, flat roof with parapet or gable roof; recipe materials, aged. style 'brick' | 'plaster' | 'concrete' | 'stone' | 'timber' (or an object like gs.models.buildings' own), w, d (metres, 8 x 6), floors (2), roof 'flat' | 'gable', floor (storey height), bay (metres per window), win [w, h], lit (0..1 of windows glowing), colour (walls), door (false: none), seed, wear. A Group centred on x/z, foot at y = 0, door facing +z. */
  building(o?: { style?: 'brick' | 'plaster' | 'concrete' | 'stone' | 'timber' | Record<string, Loose>; w?: number; d?: number; floors?: number; roof?: 'flat' | 'gable'; floor?: number; bay?: number; win?: [number, number]; lit?: number; colour?: string; color?: string; door?: boolean; seed?: number; wear?: false | Record<string, Loose> }): Loose;
  /** The building styles (copy one and change it: { ...gs.models.buildings.brick, bay: 3 }). */
  readonly buildings: Record<string, Record<string, Loose>>;
  /**
   * Real surface detail for a mesh (or every mesh under a group): the bumps its material only paints (the height layer of pbr({ tex: surface() }) or gs.models.material(): roof tiles, mortar, bark) made into real triangles in a worker and drawn by the Next Gen view through cluster detail, so they cost triangles only where near enough to show. The mesh draws as before until its relief arrives and keeps its own geometry (raycasts and physics are unchanged; nothing is pushed out, only in). Returns what it was given.
   * Lengths in metres: depth (how far the lowest parts go in; default the material's parallax depth, or 3% of a tile), fine (the smallest detail made, half the depth), coarse (no edge longer than this), error (how far it may be from the picture, a tenth of the depth), maxTris (150,000 a mesh), height (a surface() set or its height texture, when the material has none), mid (0..1: the height that stays where the flat surface was; 1, nothing is pushed out).
   * relief(target, false) takes it off. mesh.userData.relief: 'building' | 'ready' | 'failed'. Not for materials laid on by position (solid, scatter), skinned, morphing, instanced, multi-material or see-through meshes.
   */
  relief: {
    <M = Loose>(target: M, o?: false | { depth?: number; fine?: number; coarse?: number; error?: number; maxTris?: number; height?: Loose; mid?: number }): M;
    /** Resolves once the relief of every mesh under target has arrived (or failed), with the number that arrived. */
    ready(target: Loose): Promise<number>;
  };
  /**
   * A person to see up close, sculpted in code (a face with eyes, hands with fingers, clothes cut and worn, hats, webbing, a pack; creases in soft shadow, no texture files), on gs.poses' skeleton in three levels of detail.
   * Returns a Group with rig, bones, mesh, lods, lod (0 close .. 2 far), see(camera, screenHeightPx), twin() (another of the same person, nearly free), hold(thing, rightPoint, leftPoint) (both hands onto a thing: after rig.update()), gear (gear.hat.visible = false; gear.hat.loose(): a loose copy, a plain mesh), face.
   * A cut of clothes this phone hasn't sculpted yet takes a second or two in the background: the app shows "Loading…" and makes the game again (make people in make() or reset()); it is then saved. Several kinds: human.all([...]) first thing.
   * Options: sex, build, girth, scale, skin, hair, hairStyle, iris, lips, moustache, stubble, face ({ jaw, chin, brow, nose, lips, cheeks, eyes }), hands ('open' | 'grip'), outfit ({ top, legs, feet, hat, belt, webbing, gloves, pack, extras }; camo: [colour, colour] on top, legs or hat brushes blotches over its colour), gear, slots, now (sculpt on the spot: tools). The plain options (body, legs, shoes: colours) still dress a simple person.
   */
  human: {
    (o?: { sex?: 'm' | 'f'; build?: Record<string, number>; girth?: number; scale?: number; shadows?: boolean; skin?: string; hair?: string | null; hairStyle?: 'short' | 'long' | 'bun' | 'bald'; eyes?: string; iris?: string; lips?: string; moustache?: boolean; stubble?: number; jaw?: number; nose?: number; face?: Record<string, number>; hands?: 'open' | 'grip'; body?: string; legs?: string; shoes?: string; sleeves?: 'long' | 'short'; outfit?: Record<string, Loose>; gear?: Loose[]; slots?: Record<string, Loose>; now?: boolean }): Loose;
    /** Several people at once, in the same order: everything that still needs sculpting is started together, so the app waits once. */
    all(list: Loose[]): Loose[];
    /** Starts sculpting whatever these people still need and makes the app wait if anything does; nothing otherwise. First thing in make(), before anything costly. */
    need(list: Loose[]): void;
    /** For tools and tests: resolves once human(options) for each of these would come straight back. */
    ready(list: Loose | Loose[]): Promise<boolean>;
    /** Forgets every saved sculpt. */
    clear(): Promise<void>;
  };
  /**
   * An animal or a monster made in code from a seed, sculpted the way gs.models.human is (no model or texture files): one skinned mesh in three levels of detail on a skeleton of its own, with gaits made for its own legs, wings, fins or coils.
   * like: 'dog' | 'cat' | 'horse' | 'deer' | 'cow' | 'pig' | 'bear' | 'rabbit' | 'mouse' | 'lizard' (kind 'quad'), 'songbird' | 'crow' | 'duck' | 'hawk' | 'owl' | 'chicken' | 'heron' ('bird'), 'fish' | 'shark' | 'eel' | 'puffer' | 'angler' ('fish'), 'beetle' | 'ladybird' | 'ant' | 'bee' | 'butterfly' | 'dragonfly' | 'spider' ('insect'), 'dragon' | 'beast' | 'ogre' | 'imp' | 'blob' | 'serpent' ('monster').
   * No seed: the animal as the book shows it. A seed: its own build, coat, pattern and size, the same on every phone. kind alone: the seed picks which animal of that kind; neither: any creature at all.
   * Returns a Group, feet at y = 0 (a fish: its middle), facing +z: move(dt, speed, { fly, swim, turn }) each frame (the easy way: it picks and blends walk, trot, run, fly or swim for a speed in metres a second), or rig.play('eat') and rig.update(dt, { speed }) yourself; speeds (where each gait sits), bones, lod / see(camera, screenHeightPx), size (metres), look (what the seed chose), twin() (another of the very same creature, nearly free: a herd).
   * Poses by kind: 'idle', 'walk', 'run', 'attack', 'hurt', 'dead' everywhere; four legs add 'trot', 'eat', 'sit', 'jump'; birds 'fly', 'glide', 'hover', 'eat', 'sit', 'jump'; fish 'swim'; flying insects 'fly', 'hover'; a dragon and an imp 'fly', 'glide', 'hover'; an ogre and an imp every pose a person has; a serpent 'rear', 'swim'.
   * A shape this phone hasn't sculpted yet takes a few tenths of a second in the background: the app shows "Loading…" and makes the game again (make creatures in make() or reset()); it is then saved. Several kinds: creature.all([...]) first thing. Creatures of one shape share it whatever their colours and size.
   */
  creature: {
    (o?: CreatureOptions): CreatureT;
    /** The kinds: 'quad', 'bird', 'fish', 'insect', 'monster'. */
    readonly kinds: readonly string[];
    /** Every animal a creature can be like, and its kind: { dog: 'quad', owl: 'bird', ... }. */
    readonly likes: Readonly<Record<string, string>>;
    /** Several creatures at once, in the same order: everything that still needs sculpting is started together, so the app waits once. */
    all(list: CreatureOptions[]): CreatureT[];
    /** Starts sculpting whatever these creatures still need and makes the app wait if anything does; nothing otherwise. First thing in make(), before anything costly. */
    need(list: CreatureOptions[]): void;
    /** For tools and tests: resolves once creature(options) for each of these would come straight back. */
    ready(list: CreatureOptions | CreatureOptions[]): Promise<boolean>;
    /** Forgets every saved sculpt. */
    clear(): Promise<void>;
  };
  /** Per-vertex curvature of a geometry (convex > 0, concave < 0) and how much each vertex faces up. */
  curvature(geometry: Loose): { curve: Float32Array; up: Float32Array };
}
export interface CityPart {
  /**
   * A made-up city from a seed, in a gs.hd HDView (or any view with .scene and .cam). Call reset() from
   * your reset() and update(dt, player) each frame. Cars brake for what you pass to avoid().
   */
  City: new (view: Loose, o?: { seed?: number; blocks?: number | [number, number]; style?: 'downtown' | 'oldtown' | 'harbour' | 'suburb' | Record<string, Loose>; side?: 'right' | 'left';
    traffic?: number; people?: number; night?: number; sky?: Loose; lamps?: boolean; sound?: boolean; at?: { x: number; z: number } | null; detail?: number; [style: string]: Loose }) => CityWorld;
  /** The plan alone, as plain numbers (no 3D): for a map, a route or your own drawing. */
  layout(o?: { seed?: number; blocks?: number | [number, number]; style?: string | Record<string, Loose>; side?: 'right' | 'left'; [style: string]: Loose }): CityPlan;
  /** City styles (copy one and change it: { ...STYLES.oldtown, floors: [2, 4] }). */
  STYLES: Record<'downtown' | 'oldtown' | 'harbour' | 'suburb', Record<string, Loose>>;
  /** Facade looks: kind, wall, trim, glass, win (window width m), floor (storey m), lit, warm. */
  FACADES: Record<string, Record<string, Loose>>;
}
export interface CityWorld {
  plan: CityPlan; group: Loose; seed: number; start: CitySpot; t: number;
  /** 0 day .. 1 night: windows, shop signs, street lamps and car lights. Follows sky.night when made with { sky }. */
  night: number;
  cars: { list: CityCar[]; near(p: { x: number; z?: number; y?: number }, r: number): CityCar[]; hit(p: { x: number; z?: number; y?: number }, r?: number): CityCar | null; bump(car: CityCar, seconds?: number): CityCar };
  people: { list: CityPerson[]; near(p: { x: number; z?: number; y?: number }, r: number): CityPerson[]; hit(p: { x: number; z?: number; y?: number }, r?: number): CityPerson | null;
    scare(p: { x: number; z?: number; y?: number }, r?: number, t?: number): unknown; knock(person: CityPerson, dx?: number, dz?: number, seconds?: number): CityPerson };
  props: PropsPart['Props'] extends new (...a: Loose[]) => infer P ? P : Loose;
  reset(focus?: { x: number; z: number }): CityWorld;
  update(dt: number, focus?: { x: number; z?: number; y?: number }): CityWorld;
  /** Cars brake for this point (radius r) this frame. */
  avoid(p: { x: number; z?: number; y?: number }, r?: number): CityWorld;
  /** Builds every chunk now (otherwise they're built a few a frame, nearest first). */
  warm(): CityWorld;
  /** Traffic light state for traffic along axis at a junction: 'g' | 'a' | 'r'. */
  signal(node: CityPlan['nodes'][number], axis: 'x' | 'z', t?: number): 'g' | 'a' | 'r';
  signalLeft(node: CityPlan['nodes'][number], axis: 'x' | 'z', t?: number): number;
  buildingAt(x: number, z: number): CityBuilding | null;
  ground(x: number, z: number): number;
  /** Pushes a circle out of the buildings (changes p); the building touched, or null. */
  collide(p: { x: number; z?: number; y?: number }, r?: number, y?: number): CityBuilding | null;
  ray(from: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, far?: number): { point: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; dist: number; building: CityBuilding } | null;
  /** The nearest point in a lane. */
  road(x: number, z: number): { x: number; z: number; heading: number; edge: Loose; lane: number; s: number; d: number };
  route(a: { x: number; z?: number; y?: number }, b: { x: number; z?: number; y?: number }): { points: [number, number][]; path: Loose; length: number; nodes: CityPlan['nodes'] };
  spot(kind?: 'door' | 'rooftop' | 'corner' | 'street' | 'pavement' | 'park', o?: { near?: { x: number; z?: number; y?: number } | null; min?: number; max?: number; rnd?: () => number }): CitySpot | null;
  /** Building boxes for occlusion culling (optionally only those within r of near). */
  occluders(near?: { x: number; z?: number; y?: number } | null, r?: number): { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }[];
  walls(): Loose[];
  /** Buildings and kerbs solid in a gs.physics3d World3D. */
  solid(world: Loose): CityWorld;
  drawMap(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o?: { at?: { x: number; z?: number; y?: number }; range?: number; turn?: number; colours?: Partial<Record<'road' | 'block' | 'park' | 'building' | 'water', string>> }): void;
  mapPoint(p: { x: number; z?: number; y?: number }): [number, number];
  dispose(): void;
}
export interface CraftPart {
  /** Arcade-true flight. Events this frame in events[]: 'stall', 'land', 'touch', 'crash', 'takeoff'. */
  Plane: new (o?: { at?: P3; heading?: number; speed?: number; power?: number; lift?: number; drag?: number; stall?: number; top?: number; turn?: [number, number, number]; assist?: number; grip?: number; gravity?: number; ground?: ((x: number, z: number) => number) | null; gear?: number; crashSpeed?: number }) => {
    pos: P3; vel: P3; quat: Loose; throttle: number; stalled: boolean; onGround: boolean; crashed: boolean; events: string[];
    readonly forward: P3; readonly up: P3; readonly right: P3; readonly speed: number; readonly altitude: number; readonly heading: number; readonly pitch: number; readonly bank: number;
    update(dt: number, i?: { throttle?: number; pitch?: number; roll?: number; yaw?: number; brake?: boolean }): Loose; reset(at: P3, heading?: number, speed?: number): Loose;
  };
  Boat: new (water: { height(x: number, z: number): number; normal(x: number, z: number): P3 }, o?: { at?: P3; heading?: number; power?: number; top?: number; turn?: number; drift?: number; drag?: number; length?: number; width?: number; draft?: number }) => {
    x: number; y: number; z: number; heading: number; vx: number; vz: number; quat: Loose; wake: Loose[]; air: number; readonly pos: P3; readonly speed: number; readonly forward: P3;
    update(dt: number, i?: { throttle?: number; steer?: number }): Loose;
  };
  Hover: new (o?: { at?: P3; heading?: number; climb?: number; speed?: number; accel?: number; turn?: number; tilt?: number; gravity?: number; ground?: ((x: number, z: number) => number) | null }) => {
    pos: P3; vel: P3; heading: number; quat: Loose; onGround: boolean; readonly speed: number; update(dt: number, i?: { x?: number; y?: number; up?: number; yaw?: number }): Loose;
  };
  /** Makes a physics3d body float on Water (or anything with height(x, z)). */
  Floater: new (body: Loose, water: Loose, o?: { size?: [number, number, number]; points?: P3[]; float?: number; drag?: number; spinDrag?: number; gravity?: number }) => { under: number; update(dt: number): Loose };
}
export interface SoftPoint { x: number; y: number; z: number; px: number; py: number; pz: number; pinned: boolean; mass: number; r: number }
export interface SoftBody { points: SoftPoint[]; sticks: Loose[]; [k: string]: Loose }
export interface SoftPart {
  Soft: new (o?: { gravity?: P3 | null; dims?: 2 | 3; iterations?: number; damping?: number; bounds?: [number, number, number, number] | null; floor?: number | null; bounce?: number; friction?: number; step?: number }) => On<Loose> & {
    points: SoftPoint[]; sticks: Loose[]; bodies: SoftBody[]; solids: Loose[];
    point(x: number, y: number, z?: number, o?: { pinned?: boolean; mass?: number; r?: number }): SoftPoint;
    stick(a: SoftPoint, b: SoftPoint, o?: { stiff?: number; len?: number | null; tear?: number; slack?: boolean }): Loose;
    cloth(x: number, y: number, w: number, h: number, cols?: number, rows?: number, o?: { pin?: 'top' | 'left' | 'corners' | 'none' | ((c: number, r: number) => boolean); tear?: number; stiff?: number; z?: number; plane?: 'xy' | 'xz'; mass?: number }): SoftBody & { cols: number; rows: number; at(c: number, r: number): SoftPoint };
    rope(a: P3 | SoftPoint, b: P3 | SoftPoint, n?: number, o?: { pinA?: boolean; pinB?: boolean; tear?: number; mass?: number; slack?: boolean }): SoftBody;
    jelly(x: number, y: number, r: number, n?: number, o?: { pressure?: number; stiff?: number; mass?: number }): SoftBody;
    circle(x: number, y: number, r: number): Loose; box(x: number, y: number, w: number, h: number): Loose; remove(thing: Loose): Loose;
    grab(x: number, y: number, reach?: number, z?: number): { point: SoftPoint; move(x: number, y: number, z?: number): Loose; drop(): void } | null;
    cut(x0: number, y0: number, x1: number, y1: number): number; push(p: P3, radius: number, strength: number): Loose; wind(w: P3): Loose; update(dt: number): Loose;
    centre(body: SoftBody): P3; toGeometry(body: SoftBody, geometry: Loose): Loose;
  };
  /** A simple 2D liquid (particles that pool and splash). */
  Liquid: new (o?: { r?: number; gravity?: number; stiff?: number; near?: number; rest?: number; viscosity?: number; bounds?: [number, number, number, number]; max?: number; bounce?: number }) => {
    list: { x: number; y: number; vx: number; vy: number }[]; solids: Loose[];
    add(x: number, y: number, vx?: number, vy?: number): Loose; pour(x: number, y: number, n?: number, spread?: number, vx?: number, vy?: number): Loose;
    circle(x: number, y: number, r: number): Loose; box(x: number, y: number, w: number, h: number): Loose; near(x: number, y: number, r: number): Loose[]; count(test?: (p: Loose) => boolean): number; update(dt: number): Loose;
  };
}
export interface Card { suit: 's' | 'h' | 'd' | 'c' | 'j'; rank: number; id: string; name: string; red: boolean; joker: boolean }
export interface CardsPart {
  SUITS: string[]; SUIT_SIGN: Record<string, string>;
  card(suit: string, rank: number): Card;
  Deck: new (o?: { suits?: string[]; ranks?: number[]; jokers?: number; decks?: number; seed?: number | null; cards?: Card[] | null }) => {
    cards: Card[]; discards: Card[]; all: Card[]; readonly size: number; readonly empty: boolean;
    shuffle(): Loose; draw(n?: number, o?: { reshuffle?: boolean }): Card[]; top(): Card | null; peek(n?: number): Card[]; deal(players: number, n: number): Card[][];
    discard(...cards: (Card | Card[])[]): Loose; put(cards: Card | Card[], o?: { bottom?: boolean; anywhere?: boolean }): Loose; refill(): Loose; reset(): Loose; save(): Loose; load(s: Loose): Loose;
  };
  sort(cards: Card[], o?: { by?: 'suit' | 'rank'; aceHigh?: boolean; suits?: string[] }): Card[];
  total(cards: Card[], o?: { face?: number; limit?: number; aceHigh?: number }): { total: number; soft: boolean; bust: boolean };
  groups(cards: Card[], o?: { min?: number; aceHigh?: boolean }): { sets: Card[][]; runs: Card[][] };
  poker(cards: Card[]): { name: string; describe: string; rank: number; cards: Card[]; solved: Loose };
  winners(hands: Card[][]): number[];
  stacks(a: Card, b: Card | null, o?: { down?: boolean; alternate?: boolean; sameSuit?: boolean }): boolean;
}
export interface DicePart {
  roll(text: string, random?: number | (() => number) | null): { total: number; rolls: number[][]; kept: number[][]; text: string };
  odds(count: number, sides: number): Record<number, number>;
  Dice: new (count?: number, o?: { sides?: number; time?: number; seed?: number | null }) => On<Loose> & {
    values: number[]; shown: number[]; held: boolean[]; readonly settled: boolean; readonly total: number; readonly tumble: number;
    throw(): number[]; hold(i: number, on?: boolean): Loose; update(dt: number): Loose;
  };
  FACES: Record<number, P3>; faceUp(q: { x: number; y: number; z: number; w: number }): number;
  Dice3D: new (world: Loose, meshes?: number | Loose[], o?: { size?: number; bounce?: number; friction?: number; density?: number; seed?: number | null }) => On<Loose> & {
    bodies: Loose[]; readonly settled: boolean; readonly values: number[]; readonly total: number; throw(at?: P3, push?: P3): Loose; update(dt: number): Loose; remove(): void;
  };
}
export interface WordsPart {
  /** The dictionary (loads on first use: make it in make() or reset()). */
  Words: new () => {
    readonly size: number; has(w: string): boolean; safe(w: string): boolean; of(len: number): string[];
    random(o?: { length?: number | null; min?: number; max?: number; seed?: number | string | (() => number) | null; starts?: string; has?: string }): string | null;
    from(letters: string, o?: { min?: number; max?: number; common?: boolean }): string[]; anagrams(w: string): string[];
    match(pattern: string, o?: { common?: boolean; limit?: number }): string[];
    find(grid: string[], o?: { min?: number; diagonal?: boolean; common?: boolean }): { word: string; path: [number, number][] }[];
  };
  compare(guess: string, answer: string): ('hit' | 'near' | 'miss')[];
  LETTERS: Record<string, number>; VALUES: Record<string, number>;
  score(word: string, o?: { values?: Record<string, number>; mult?: number }): number;
  Bag: new (o?: { size?: number; blanks?: number; seed?: number | string | null; letters?: Record<string, number> }) => { tiles: string[]; readonly left: number; shuffle(): Loose; draw(n?: number): string[]; put(...tiles: (string | string[])[]): Loose };
}
export interface TriviaQuestion { id: number; text: string; answers: string[]; kind: 'choice' | 'truefalse'; difficulty: 'easy' | 'medium' | 'hard'; category: string; categoryId: string; correct?: undefined }
export interface TriviaPart {
  /** A quiz from the question bank (loads on first use: make it in make() or reset()). Show CREDIT somewhere in the game. */
  Quiz: new (o?: { categories?: string | string[] | null; difficulty?: 'easy' | 'medium' | 'hard' | ('easy' | 'medium' | 'hard')[] | null; kind?: 'choice' | 'truefalse' | null; climb?: boolean | number; seed?: number | string | (() => number) | null; resume?: { s: number; u: number } | null }) => {
    score: number; asked: number; streak: number; best: number; readonly left: number; readonly difficulty: 'easy' | 'medium' | 'hard' | null;
    next(): TriviaQuestion | null; answer(i: number): { right: boolean; correct: number; streak: number; score: number }; timeout(): { right: boolean; correct: number; streak: number; score: number };
    fifty(): number[]; pack(): { s: number; u: number };
  };
  categories(): { id: string; name: string; count: number }[];
  CREDIT: string;
}
export interface UINode {
  id?: string; kids: UINode[]; parent: UINode | null; box: { x: number; y: number; w: number; h: number }; clip: { x: number; y: number; w: number; h: number }; shown: boolean;
  pressed: boolean; focused: boolean; press: number; depth: number; sx: number; sy: number; contentW: number; contentH: number; data?: Loose; [k: string]: Loose;
}
export interface UIPart {
  /** Flexbox layout (Yoga) and input with no look: your game draws every box. Loads on first use: make it in make() or reset(). */
  UI: new (w: number, h: number, tree?: Loose) => On<UINode> & {
    root: UINode | null; w: number; h: number; readonly focusable: UINode[]; readonly focused: UINode | null;
    set(tree: Loose): Loose; layout(): Loose; update(idOrDt: string | number, fields?: Loose): Loose; tick(dt: number): Loose; resize(w: number, h: number): Loose;
    node(id: string): UINode | null; each(fn: (n: UINode, box: UINode['box'], clip: UINode['clip']) => void): Loose; hit(x: number, y: number, o?: { any?: boolean }): UINode | null;
    down(x: number, y: number, id?: number): Loose; move(x: number, y: number, id?: number): Loose; up(x: number, y: number, id?: number): Loose;
    activate(n: UINode): void; show(id: string): Loose; focus(id: string | null): Loose; step(dir: 'up' | 'down' | 'left' | 'right'): Loose; key(k: string, isDown?: boolean): boolean; free(): void;
  };
  /** Splits text into lines that fit width (with c's current font). */
  wrap(c: CanvasRenderingContext2D, text: string, width: number): string[];
}

/** gs.hear: everyday sounds (YAMNet) and spoken words, recognised on the phone itself. Always give a touch way to play. */
export interface HearPart {
  /** Hears everyday sounds: 'Dog', 'Whistling', 'Clapping', 'Laughter', 'Knock', 'Bell'... Make it in make() or reset(); start() from a tap. */
  Sounds: new (o?: { want?: string[]; sure?: number; every?: number }) => {
    ready: boolean; running: boolean; failed: unknown; top: { name: string; sure: number } | null;
    start(): Promise<Loose>; stop(): void; update(dt?: number): Loose;
    /** True once for each time the sound started (since the last call). */
    heard(name: string): boolean;
    /** How sure it is that the sound is going on now, 0..1. */
    hearing(name: string): number;
  };
  /** Spoken commands. available is false on phones that can't listen on the phone itself: use touch then. */
  Voice: new (o?: { words?: string[]; also?: Record<string, string[]>; language?: string }) => {
    available: boolean | null; listening: boolean; heard: string[];
    /** Call from a tap. Resolves to true if it's listening. */
    start(): Promise<boolean>; stop(): void;
    /** True once for each time the word was said (since the last call). */
    said(word: string): boolean;
  };
}

/** gs.doodle: what the player drew, from 200 things (a small model on the phone; most accurate when `among` lists the few a game cares about). */
export interface DoodlePart {
  /** Make it in make() or reset() (the model loads first). */
  Doodle: {
    new (): {
      readonly things: string[];
      /** Most likely first, sures adding up to 1. strokes: arrays of { x, y } or gs.strokes Strokes. */
      guess(strokes: Loose[], o?: { among?: string[] }): { name: string; sure: number }[];
    };
    /** Every thing it can recognise. */
    readonly things: string[];
  };
  /** The strokes drawn into a 28 x 28 picture (0..1), the way the model sees them. */
  picture(strokes: Loose[], size?: number): Float32Array;
  scores(img: Float32Array, model: Loose): Float32Array;
}

/** gs.phoneai: the phone's own built-in AI, for flavour only. Every ask has a fallback; play must never depend on it. */
export interface PhoneaiPart {
  PhoneAI: new (o?: { persona?: string; words?: number; temperature?: number; timeout?: number }) => {
    available: boolean | null; last: string | null;
    ready(): Promise<boolean>;
    /** Resolves to a short checked answer, or fallback. */
    ask(prompt: string, o?: { fallback?: string; words?: number; fresh?: boolean }): Promise<string>;
    forget(): Loose;
  };
  /** Tidies a model's answer, or null if it shouldn't be shown. */
  tidy(text: string, words?: number): string | null;
}

export interface GS {
  sound: SoundPart; device: DevicePart; util: UtilPart; math: MathPart; palettes: PalettesPart;
  juice: JuicePart; effects: { Feel: typeof Feel }; controls: ControlsPart; pad: PadPart; moves: MovesPart;
  pixel: PixelPart; gfx: GfxPart; physics: PhysicsPart; vision: VisionPart; geo: GeoPart; real: RealPart; fonts: FontsPart;
  things: ThingsPart; rounds: RoundsPart; pacing: PacingPart; aim: AimPart; senses: SensesPart; prefs: PrefsPart; tick: TickPart; solve: SolvePart;
  camera2d: Camera2dPart; tiles: TilesPart; movers: MoversPart; anim: AnimPart; story: StoryPart; replay: ReplayPart; look2d: Look2dPart;
  tweak: TweakFn; brains: BrainsPart;
  board: BoardPart; battle: BattlePart; gen: GenPart; drag: DragPart; idle: IdlePart; history: HistoryPart; items: ItemsPart; adventure: AdventurePart; hex: HexPart; rts: RtsPart; fight: FightPart; bullets: BulletsPart; sand: SandPart; flow: FlowPart; art: ArtPart; sports: SportsPart; party: PartyPart; rhythm: RhythmPart; strokes: StrokesPart; vehicles: VehiclesPart; paths: PathsPart; bones: BonesPart;
  level3d: Level3dPart; sky: SkyPart;
  combat: CombatPart; tactics: TacticsPart; climb: ClimbPart; missions: MissionsPart; cutscene: CutscenePart; prompts: PromptsPart;
  stealth: StealthPart; gadgets: GadgetsPart; campaign: CampaignPart; arena: ArenaPart; poses: PosesPart; destruction: DestructionPart; props: PropsPart;
  outdoors: OutdoorsPart; city: CityPart; models: ModelsPart; voxels: VoxelsPart; fluid: FluidPart; craft: CraftPart; soft: SoftPart; cards: CardsPart; dice: DicePart; words: WordsPart; trivia: TriviaPart; ui: UIPart;
  hear: HearPart; doodle: DoodlePart; phoneai: PhoneaiPart;
  sketch: SketchPart; icons: IconsPart;
  toon: ToonPart; hd: HdPart; ar: ArPart; bricks: BricksPart; physics3d: Physics3dPart; fx3d: Fx3dPart;
  /** Board games: a table in a 3D room or in your real room (AR). */
  tabletop: TabletopPart;
  camera: CameraPart; nav3d: Nav3dPart; characters: CharactersPart; ai: AiPart;
  /** three.js itself. */
  THREE: Loose;
}

// App-only helpers (games don't use these).
export declare const HIDDEN: Record<string, string[]>;
export declare const LAZY_PARTS: string[];
export declare function loadParts(names?: string[]): Promise<void>;
export declare function partsReady(names?: string[]): boolean;
export declare function offers(names: string[]): boolean;

declare const gs: GS;
export default gs;
