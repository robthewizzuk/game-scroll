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
  /**
   * 3D sound: the listener follows the camera; sounds play at points in the world (HRTF in headphones).
   * Sound that knows the level: with `level` (a gs.physics3d World3D, a TileMap, a City, Voxels, a function
   * (from, dir, max) => metres to the first solid thing, or a list of them) every sound is muffled by the walls
   * between it and the ears by itself (less through a doorway or round a corner, more behind something thick),
   * and the place the ears stand in gets its own echo (a small room, a hall, a cave, a street, open country),
   * felt out with `rays` rays a frame. hard: 0 soft (carpet, snow, a forest) .. 1 bare stone; unit: level units
   * to a metre (16 for a map of 16-pixel tiles a metre across); auto: false to read `room` and set the echo yourself.
   */
  Ears: new (o?: { ref?: number; max?: number; rolloff?: number; hrtf?: boolean; flat?: boolean; space?: { tail: AudioNode } | null; send?: number; level?: SoundLevel | null; hard?: number; unit?: number; auto?: boolean; rays?: number }) => {
    place(pos: { x: number; y: number; z?: number }, forward?: { x: number; y: number; z: number }, up?: { x: number; y: number; z: number }): Loose; place2d(x: number, y: number, facing?: number): Loose;
    /** What stands in the way of sound (null: nothing). Set it again when the level is another one. */
    level: SoundLevel | null;
    /** The place round the ears as the level says it is so far (null without a level). */
    readonly room: SoundPlace | null;
    /** How much the level keeps a sound at p from the ears: 0 nothing in the way .. 1 behind a thick wall (0 without a level). */
    blocked(p: { x: number; y: number; z?: number }): number;
    /** muffled: true (behind a wall, as you say), or 0..1, says so yourself; false leaves it clear; left out, the level decides. */
    tone(f: number | string, p: { x: number; y: number; z?: number }, o?: Loose): Loose; noise(len: number, p: { x: number; y: number; z?: number }, o?: Loose): Loose; zzfx(p: { x: number; y: number; z?: number }, ...params: (number | undefined)[]): Loose;
    play(name: string, p: { x: number; y: number; z?: number }, pitch?: number, o?: { muffled?: boolean | number }): Loose;
    /** A steady sound that follows something; with a level it is checked again for walls as it and the ears move (h.muffled: 0..1 now). */
    loop(p: { x: number; y: number; z?: number }, wave?: OscillatorType, hz?: number, o?: { vol?: number; muffled?: boolean | number }): { move(p: { x: number; y: number; z?: number }): Loose; pitch(hz: number): Loose; volume(v: number): Loose; stop(): void; readonly muffled?: number };
    /** How loud a sound at p would be here, 0..1: quieter with distance, and behind walls where there is a level. */
    heard(p: { x: number; y: number; z?: number }): number;
  };
  /**
   * The sounds a world makes by itself, with nothing more to call than update() each frame: things that knock into each
   * other in a gs.physics3d World3D sound of what they are made of (a body's `sound` option, else read from its mesh),
   * watched people step on what is under each foot as it comes down, and watched vehicles' engines rev through the gears
   * with their speed (tyres on the ground, skids, a steam engine's chuffs, a jet's spool). ears: an Ears for sounds at their
   * points (without one they play as they are); marks, weather, land: what is underfoot; ground: (x, z, y) => a material
   * or nothing, the game's own say.
   */
  Foley: FoleyClass;
  /**
   * The sums behind sound that knows the level, for your own sounds and subtitles (no audio): caster(level) makes
   * one question of any level (cast(from, dir, max) => metres to the first solid thing, or Infinity), blocked(cast, ear, source)
   * is 0 clear .. 1 behind a thick wall, muffleOf(amount) what such a sound keeps, Room feels out a place a few rays at a time.
   */
  acoustics: {
    caster(level: SoundLevel | null, o?: { flat?: boolean }): SoundCast | null;
    blocked(cast: SoundCast | null, ear: { x: number; y: number; z?: number }, source: { x: number; y: number; z?: number }, o?: { spread?: number; thick?: number; flat?: boolean }): number;
    muffleOf(amount: number): { gain: number; hz: number };
    Room: new (o?: { far?: number; hard?: number; flat?: boolean; roof?: number; unit?: number }) => { probe(cast: SoundCast | null, ear: { x: number; y: number; z?: number }, n?: number): Loose; read(): SoundPlace; clear(): Loose; readonly known: boolean };
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
    /** How many sounds play at once (32; the music is never counted): past that a quieter new sound is left out and a louder one takes the quietest one's place. Back to 32 when the round ends. */
    voices(n?: number): Loose;
    /** The echo of the place the listener is in, for effects and voices (not the music); null for none. new Ears({ level }) sets it by itself. */
    place(o?: { tail?: number; wet?: number; echo?: number; delay?: number } | null, fade?: number): Loose;
    channel(name: string): { volume(v: number, fade?: number): Loose; duck(to?: number, hold?: number, back?: number): Loose };
    reset(): Loose;
  };
  /**
   * Speaks a line with the phone's own voices (text to speech). Resolves when it's said (false if it couldn't). Show the words too.
   * voice casts a character from the voices this phone has: 'woman' | 'man' | 'any', or { kind, lang (accents to try, in order),
   * take (the second, third... such voice, so a cast differs), like (voice names to prefer) }. An array of parts is said in
   * order with pauses (numbers, in seconds) between; a part can be { text, pitch, rate, volume, voice, lang, size, fx } for its own delivery.
   * A shaped voice: size (1.15 a bigger person, deeper in every way at the same pace; .85 a smaller one; .6 to 1.6) and fx ('radio',
   * 'tannoy', 'phone', 'megaphone', 'box', 'bright', 'warm', 'robot', 'tiny', 'clean', or a recipe: { like: 'radio', drive: .2, mix: .6 }).
   * With either, the phone writes the line to sound and the kit plays it through the mixer's 'voice' channel, as loud on every phone,
   * with the room's echo, and onWord for every word (the Android and iPhone apps; elsewhere the line is spoken as before, size as a
   * lean of its pitch). It starts a moment later than a plain line: open with a short pause, say([.2, 'Ah. A door.'], { fx: 'tannoy' }).
   */
  say(text: string | SayPart[], o?: { pitch?: number; rate?: number; volume?: number; lang?: string | string[]; voice?: SayVoice | null; onWord?: (at: number) => void; size?: number | null; fx?: SayFx | null }): Promise<boolean>;
  /** The voices this phone has to cast from (joke voices left out). kind is null when the phone doesn't say. */
  voices(): Promise<{ name: string; lang: string; kind: 'woman' | 'man' | null }[]>;
  stopTalking(): void;
  talking(): boolean;
  /** Whether lines with a size or fx are being shaped: true once one has played that way, false where the phone can't (and in a browser), null before the first try. */
  shaped(): boolean | null;
}

/** What a thing is made of, for gs.sound.Foley's knocks and steps. */
export type FoleyMaterial = 'wood' | 'metal' | 'stone' | 'glass' | 'plastic' | 'rubber' | 'cloth' | 'body' | 'dirt' | 'grass' | 'gravel' | 'sand' | 'snow' | 'mud' | 'water' | 'ice' | 'leaves' | 'carpet';
/** An engine for gs.sound.Foley.watch(vehicle, { engine }) (read from a gs.models.vehicle's kind and style by itself). */
export type FoleyEngine = 'petrol' | 'sports' | 'van' | 'jeep' | 'kart' | 'diesel' | 'tank' | 'rail diesel' | 'steam' | 'rail' | 'outboard' | 'boat diesel' | 'rowboat' | 'prop' | 'jet' | 'electric';
export interface Foley {
  /** The World3D whose knocks sound by themselves (set it again for a new world). */
  world: Loose;
  ears: Loose; marks: Loose; weather: Loose; land: Loose;
  ground: ((x: number, z: number, y: number) => FoleyMaterial | string | null | undefined | void) | null;
  /** 0..1 for every sound it makes. */
  volume: number;
  /** false: the world's knocks are left alone. */
  knocks: boolean;
  /**
   * From now on this thing makes its own sounds. A gs.models.human: a footstep wherever a foot comes down. A gs.models.vehicle,
   * a World3D.vehicle() or a gs.vehicles Car or Kart: its engine. Anything else that moves: steps paced out along its way.
   * shoe: 'boot' | 'bare' | 'paw' | 'hoof'; weight: kg (75); feet: 2 or 4; pace: metres a step; for an engine: engine, top (metres a second at its top speed), throttle: () => 0..1, vol.
   */
  watch<T>(thing: T, o?: { shoe?: 'boot' | 'bare' | 'paw' | 'hoof'; weight?: number; feet?: 2 | 4; pace?: number; grounded?: () => boolean; engine?: FoleyEngine; top?: number; throttle?: () => number; vol?: number }): T;
  unwatch(thing: Loose): void;
  /** Stops every engine and forgets everything watched. */
  clear(): void;
  /** Each frame: footsteps and engines (the world's knocks come as it steps). */
  update(dt: number): void;
  /** A footstep at p on what is there (or on `on`). Returns the material it stepped on. */
  step(p: { x: number; y: number; z?: number }, on?: FoleyMaterial | null, o?: { weight?: number; run?: number; shoe?: 'boot' | 'bare' | 'paw' | 'hoof' }): string;
  /** A knock at p: something made of `of` hit at speed (metres a second). The harder and heavier, the louder; the bigger, the lower. */
  hit(p: { x: number; y: number; z?: number }, of?: FoleyMaterial, o?: { speed?: number; size?: number; mass?: number; soft?: boolean }): boolean;
  /** What is underfoot at p. by: what stands there (left out of the world's ray). */
  surface(p: { x: number; y: number; z?: number }, by?: Loose): FoleyMaterial;
}
export interface FoleyClass {
  new (o?: { ears?: Loose; world?: Loose; marks?: Loose; weather?: Loose; land?: Loose; ground?: ((x: number, z: number, y: number) => FoleyMaterial | string | null | undefined | void) | null; volume?: number; knocks?: boolean; under?: FoleyMaterial | null }): Foley;
  readonly materials: FoleyMaterial[];
  readonly engines: FoleyEngine[];
  /** What a mesh or group is made of, as Foley hears it (userData.sound, its material's recipe or name); null if nothing says. */
  materialOf(obj: Loose): FoleyMaterial | null;
}

/** What stands in the way of sound for gs.sound.Ears: anything with ray() or sees() (World3D, TileMap, City, Voxels, 2D Physics, NavGrid), a function, or a list. */
export type SoundLevel = { ray(...a: Loose[]): Loose } | { sees(...a: Loose[]): Loose } | ((from: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, max: number) => number | boolean | null | undefined | { distance?: number; dist?: number }) | SoundLevel[];
/** One question for any level: metres to the first solid thing from `from` along the unit direction `dir`, or Infinity when clear for `max`. */
export type SoundCast = (from: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, max: number) => number;
/** A place as it sounds: size (metres to the walls on average), walls and roof (0..1 closed), enclosed (0 open country .. 1 shut in), tail (seconds the echo rings), wet (0..1 how much), echo and delay (a slap back off far walls outdoors). */
export interface SoundPlace { size: number; walls: number; roof: number; enclosed: number; tail: number; wet: number; echo: number; delay: number }
/** A character's voice for gs.sound.say: a kind, or which accents to try, which take of that kind, and voices to prefer by name. */
export type SayVoice = 'woman' | 'man' | 'any' | { kind?: 'woman' | 'man' | 'any'; lang?: string | string[]; take?: number; like?: string | string[] };
/** One part of a spoken line: words, a pause in seconds, or words with their own delivery. */
export type SayPart = string | number | { text: string; pitch?: number; rate?: number; volume?: number; voice?: SayVoice | null; lang?: string | string[]; size?: number | null; fx?: SayFx | null };
/** A treatment for a shaped voice (gs.sound.say's fx), by name or as a recipe that can start from a named one. */
export type SayFxName = 'clean' | 'radio' | 'tannoy' | 'phone' | 'megaphone' | 'box' | 'bright' | 'warm' | 'robot' | 'tiny';
export type SayFx = SayFxName | {
  like?: SayFxName;
  /** Hz: nothing below / above passes (a small speaker has no bass and no top). */
  low?: number; high?: number;
  /** [[Hz, dB, sharpness]...]: the ring of a horn, a box, a handset. */
  peaks?: [number, number, number?][];
  /** dB: more or less of the low and the top end. */
  bass?: number; treble?: number;
  /** 0..1: overdriven, like a cheap amplifier turned up. */
  drive?: number;
  /** [Hz, 0..1]: a robot's buzz. */
  ring?: [number, number];
  /** [seconds, 0..0.9 how long it rings, 0..1 how much]: a metal tube, a hollow thing. */
  comb?: [number, number, number?];
  /** 0..1: evened out hard, the way radios and adverts are. */
  squeeze?: number;
  /** [[seconds, 0..1]...]: single slaps off far walls. */
  echo?: [number, number][];
  /** 0..1: a burst of static as the line starts and ends (a radio keying up); hiss: static under the words. */
  squelch?: number; hiss?: number;
  /** 0..1: how much of the treatment (the rest is the plain voice). */
  mix?: number;
};

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
/** A solid thing in the gas (gas.ball, gas.box, gas.tube). */
export interface GasSolid {
  x: number; y: number; z: number;
  /** Puts it somewhere (and turns it: a three.js Quaternion). Call it each frame for a thing that moves: the gas feels how fast it goes. */
  set(x: number, y: number, z: number, turn?: Loose): this;
  remove(): void;
}
export interface GasSolidOpts { x?: number; y?: number; z?: number; turn?: Loose; follow?: Loose }
/** A fire that keeps burning (gas.fire): change any of these while it burns. dir and speed: a blown fire (a torch, a jet). */
export interface GasFire { x: number; y: number; z: number; size: number; power: number; dir: [number, number, number]; speed: number | null; tint: number; on: boolean; remove(): void }
/** Smoke that keeps coming (gas.smoke): change any of these any time. heat 0..1: 0 hangs where it is, 1 climbs fast. */
export interface GasSmoke { x: number; y: number; z: number; size: number; rate: number; heat: number; dir: [number, number, number]; speed: number; tint: number; on: boolean; remove(): void }
/** A fan (gas.fan): the gas in a ball `size` wide is pushed along dir at speed. */
export interface GasFan { x: number; y: number; z: number; size: number; dir: [number, number, number]; speed: number; on: boolean; remove(): void }
export type GasKind = 'smoke' | 'fire' | 'steam' | 'dust' | 'toxic' | 'magic';
/** A kind of gas's numbers and colours (gs.gas.KINDS); any of them can be given to new Gas() as your own. */
export interface GasLook {
  /** The smoke's colour, and a second one a source's `tint` (0..1) blends towards. */
  colour?: string; colour2?: string;
  /** Three colours, from a flame's cool edge to its core. */
  flame?: [string, string, string];
  /** How hard heat rises, and how hard the smoke itself sinks (units a second squared). */
  lift?: number; weight?: number;
  /** The share of smoke lost a second, and of heat. */
  fade?: number; cool?: number;
  /** How much a unit of smoke hides in a unit of length. */
  thick?: number;
  /** Smoke made by burnt fuel; the share of fuel burnt a second (less: taller flames); how lively the swirls are (0..1); how bright flame is. */
  soot?: number; burn?: number; curl?: number; glow?: number;
}
export interface GasT {
  /** 'gpu' when the gas runs on the graphics chip (WebGPU) and is drawn as a lit volume, else 'cpu' (far fewer cells, drawn as soft puffs). */
  readonly backend: 'gpu' | 'cpu';
  /** How many cells the gas has, and how wide one is (world units). */
  readonly cells: number; readonly cell: number;
  /** The wind, in units a second. Change it any time. */
  wind: { x: number; y: number; z: number };
  /** The kind's numbers (see GasLook). Change them any time. */
  lift: number; weight: number; fade: number; cool: number; soot: number; burn: number; curl: number;
  /** false: nothing is drawn (ask it questions and draw your own). */
  draws: boolean;
  /** The light that follows the fire (with lamp: true): a three.js PointLight. */
  readonly lamp?: Loose;
  /** A fire that keeps burning at x, y, z: size (how wide its base is), power (how fierce). Returns it: change it any time. */
  fire(o?: Partial<Omit<GasFire, 'remove'>>): GasFire;
  /** Smoke that keeps coming from x, y, z. Returns it: change it any time. */
  smoke(o?: Partial<Omit<GasSmoke, 'remove'>>): GasSmoke;
  /** A fan (or someone blowing). Returns it: change it any time. */
  fan(o?: Partial<Omit<GasFan, 'remove'>>): GasFan;
  /** An explosion `size` units wide: fire (how much of it burns; 0: none), smoke, force (how hard it blasts the gas outwards), tint. */
  burst(x: number, y: number, z: number, o?: { size?: number; fire?: number; smoke?: number; force?: number; tint?: number }): this;
  /** A cloud of smoke all at once (dust kicked up, a smoke bomb): heat 0..1 (0: it hangs). */
  puff(x: number, y: number, z: number, o?: { size?: number; amount?: number; heat?: number; tint?: number }): this;
  /** Takes all the smoke, heat and movement away (fires, smoke makers and solids stay). */
  clear(): this;
  /** A solid ball the gas goes round. follow: a three.js object it keeps to. */
  ball(o?: GasSolidOpts & { r?: number }): GasSolid;
  /** A solid box. */
  box(o?: GasSolidOpts & { w?: number; h?: number; d?: number }): GasSolid;
  /** A solid post standing on its end. */
  tube(o?: GasSolidOpts & { r?: number; h?: number }): GasSolid;
  /** The ground under the gas: (x, z) => y. Call it again when the ground changes; null takes it away. */
  ground(fn: ((x: number, z: number) => number) | null): this;
  /** The still parts of your world: (x, y, z) => true where it is solid (walls, a doorway's frame, a chimney). Call it again when the world changes. */
  solid(fn: ((x: number, y: number, z: number) => boolean) | null): this;
  update(dt: number): this;
  /** How thick the smoke is at a place: 0 clear air, about 1 thick smoke. */
  smokeAt(x: number, y: number, z: number): number;
  /** How hot the gas is at a place: 0 cool, up to .4 warm smoke, over .45 flame, 1 and more the heart of a fire. */
  heatAt(x: number, y: number, z: number): number;
  /** Which way and how fast the gas moves at a place (units a second). */
  flowAt(x: number, y: number, z: number, out?: { x: number; y: number; z: number }): { x: number; y: number; z: number };
  /** How much can be seen through the smoke from one point to another: 1 clear, 0 nothing. */
  sees(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number;
  /** How smoky a box of the world is, [x0, y0, z0, x1, y1, z1] (the whole gas if you don't say). */
  smokeIn(box?: readonly number[]): number;
  /** Where the gas's fire is and how much of it there is (power 0: nothing burning). For a light of your own. */
  readonly glow: { x: number; y: number; z: number; power: number };
  dispose(): void;
}
/** What a part's make(r) is handed (gs.regions). */
export interface RegionBuilder {
  /** The part's name (a named part). */
  readonly name?: string;
  /** A square's number, its corner in metres, its size, how many squares out it is, its detail level, and a seed for the same look every time. */
  readonly cx: number; readonly cz: number; readonly x0: number; readonly z0: number; readonly size: number; readonly ring: number; readonly level: number; readonly seed: number;
  /** Adds obj to parent (the scene by default), at { x, y, z } if given: it is this part's own. (What make() adds straight to the scene is its own too.) */
  add<T = Loose>(obj: T, at?: { x?: number; y?: number; z?: number } | null, parent?: Loose): T;
  /** Something to free with this part: anything with dispose(), stop() or remove() (a sound loop, a crowd), or a function. */
  keep<T = Loose>(thing: T): T;
  /** fn() runs when this part is let go of. */
  on(fn: () => void): this;
  /** yield r.wait(promise): the part goes on once it settles (human.ready(looks), say), with its answer. */
  wait(promise: Loose): Loose;
  [k: string]: Loose;
}
export type RegionMake = (r: RegionBuilder) => void | Iterator<Loose, void, Loose>;
export interface RegionLayer {
  /** How many squares are made now. */
  readonly count: number;
  /** For land(): the ground's height at x, z, and the material every tile shares. */
  height?: (x: number, z: number) => number;
  material?: Loose;
  clear(): void;
}
export interface RegionsT {
  /** A named part (a level, a district, the inside of a house): make(r) builds it, all at once or as a generator function that yields between pieces. */
  part(name: string, make: RegionMake): this;
  /** These parts are wanted, and no others. Inside make() or reset() they are made at once (under the loading screen); later, a little each frame. */
  want(...names: (string | string[])[]): this;
  /** Is this part made? has(x, z): is the square under x, z made in every layer? */
  has(name: string): boolean;
  has(x: number, z: number): boolean;
  /** Every wanted part made, and the squares round the player. */
  readonly ready: boolean;
  /** 0..1: how much of what is wanted is made. */
  readonly progress: number;
  /** Squares round the player: make(r) builds one (r.cx, r.cz, r.x0, r.z0, r.size, r.seed). level(ring) gives a detail level by distance: a square whose level changes is made again. */
  cells(o: { size?: number; reach?: number; make: RegionMake; level?: (ring: number) => number; seed?: number }): RegionLayer;
  /** Ground in tiles from height(x, z): finer close by, solid in the regions' world within `solid` squares, skirts so tiles meet. colour(x, y, z, slope) paints it. */
  land(o: { height: (x: number, z: number) => number; size?: number; reach?: number; segments?: number; solid?: number; material?: Loose;
    colour?: (x: number, y: number, z: number, slope: number) => string | Loose; skirt?: number; shadows?: boolean; seed?: number }): RegionLayer & { height: (x: number, z: number) => number };
  /** Each frame: builds a little of what is wanted (budget ms) and lets go of what is behind. at: where the player is (the camera if left out). */
  update(dt?: number, at?: { x: number; y?: number; z?: number } | null): this;
  /** Lets go of every part and square (they're made again as they're wanted). */
  clear(): this;
  dispose(): void;
  /** What is in now: parts made, squares made, how many are being made, and this frame's building time in ms. */
  readonly info: { parts: string[]; cells: number; making: number; ms: number; made: number; dropped: number };
  budget: number;
}
export interface RegionsPart {
  /**
   * A big world in parts that are made as they're wanted and let go of behind: named parts (levels made only when
   * picked), squares round the player, land in tiles. world: a gs.physics3d.World3D the parts make bodies in.
   * budget: ms of a frame to build in. keep: named parts no longer wanted to keep for later while memory is fine.
   */
  Regions: new (view: Loose, o?: { world?: Loose; budget?: number; keep?: number }) => RegionsT;
}
export interface GasPart {
  /** Smoke and fire in a box of your world: make it once with the scene, and clear() it each round. */
  Gas: (new (view: Loose, o?: GasLook & {
    box?: [number, number, number, number, number, number]; open?: boolean; kind?: GasKind; wind?: { x?: number; y?: number; z?: number };
    cells?: number; size?: number; lamp?: boolean | { strength?: number; distance?: number }; draw?: boolean; seed?: number; gpu?: boolean;
  }) => GasT) & {
    /** The most cells this phone runs well (on the graphics chip where it can). */
    max(): number;
  };
  KINDS: Readonly<Record<GasKind, GasLook>>;
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
/** An HDView's extras for the ray-traced look: v.reflect(...meshes) (reflections on shiny things; on the best phones they are ray traced on WebGPU, so a floor shows what is above the screen or behind the camera; mesh.userData.moves = true for a thing that will move, mesh.userData.noTrace = true keeps one out of reflections), v.contact({ y, size }) (soft contact shadows) (mesh.userData.noAO = true keeps a mesh out of ambient occlusion), v.faceLight(person | null, { strength, colour, side, up }) (a soft fill light on a person's face from beside the camera for close-ups: call it once in make(); another person moves it, null dims it; returns the light). */
/** HDView extras: v.decal(mesh, point, normal, { size, colour, paint, life }), v.clearDecals(), v.bakeLight(at, { radius, strength }) (light probes, blended by v.probeAt or the camera), v.clearProbes(), v.bounce(box, { spacing, bounces, size }) (bounce light from a probe grid; returns { bake(), remove() }), v.clearBounce(), v.room(box, { size, strength, meshes }) (box-projected room reflections; returns { bake(), remove() }), v.detail(meshes, { px } | false) (cluster detail, a Nanite-style level of detail: big still meshes of 20,000 triangles or more are drawn in clusters by themselves, each part only as finely as shows; this asks for it on smaller meshes from 2,000 triangles, sets how many pixels the simpler parts may be out by, or with false draws them whole; also mesh.userData.detail = true | px | false), occlusion culling by itself (what is fully hidden behind other things is left out of the frame, found from the last frame's own depth with nothing to list; mesh.userData.noOcclude = true always draws a mesh, v.autoOcclude = false stops it for the view; v.occluders(boxes | null, { max, w }) adds big solid boxes of your own { x0, x1, y0, y1, z0, z1 }, Box3s or box meshes; v.occlusion.stats), v.shafts = 0..2 (sun shafts), v.upscaler = 'sgsr1' (one-frame upscaling instead of Snapdragon GSR 2), v.focus = { at, range, depth, blur } | null (depth of field, high and ultra), v.beams = { light, density, far, glow, strength, steps } | null (volumetric light: sun or spot beams through shadows, high and ultra), v.motionBlur = { amount, max, sharp, objects } | null (motion blur, high and ultra: the camera's move, and on WebGPU each thing's own; objects: false for the camera only), v.cut() (the camera jumped somewhere new: the upscaler and frame generation start fresh; big jumps are found by themselves), v.aimNow(cam => { cam.rotation.y = lookAngle; }) (frame generation's fresh aim: point the camera where the newest touch already says, without moving the game on; each made frame turns to it, so aiming answers at the screen's rate; gs.camera rigs and AR views do it themselves), v.precompile() (a promise: compiles the shaders of things added since, like a new floor, in the background; fade back in when it resolves), v.shadersLeft (how many things' shaders are still being built in the background: hidden things and what is behind the camera are built over a view's first frames), things needing a new shader mid-round wait hidden a frame or two while it builds in the background (mesh.userData.noHold = true draws at once), sun().fit(view, { far, near }) (near: a sharp shadow cascade over the first metres), sun().softShadows(deg = 2) (soft shadows that stay sharp where things touch: PCSS on WebGPU; deg is the sun's width in the sky), v.tone = 'aces' | 'neutral' | 'agx' (three.js's tone mappers: ACES the default film look, Neutral true colours, AgX soft bright hues), v.flare = true | { strength, threshold, spacing, fade, tint, dirt } (lens flare ghosts and lens dirt), v.oit = true (WebGPU: order-independent transparency, see-through things blend right in any order), v.liveBounce = 'screen' | 'voxel' | { kind, strength, res, box } | null (WebGPU, high and ultra: bounce light worked out every frame, following a moving sun or lamps; 'screen' is three's SSGI, 'voxel' three's VXGI, which also counts walls off screen), v.levelChanged() (the level's big still pieces changed: voxel bounce light rebuilds its picture of them), v.fog3d = { density, height, falloff, far, colour, glow, ambient, strength, noise, wind, lamps } | null (WebGPU, high and ultra: froxel fog lit by the sun through its shadows and by nearby lamps; WebGL keeps the view's plain fog), v.lut = 'film' | 'bleach' | 'noir' | 'sepia' | 'warm' | 'cold' | 'faded' | 'vivid' | 'night' | ((r, g, b) => [r, g, b]) | cubeFileText | null and v.lutAmount 0..1 (a colour look on the finished picture), v.autoExposure = true | { amount, min, max, speed, darken, key } (the eye adapts to dark and bright places, from how the scene looked when turned on; v.eye = null re-measures), v.shadowsDirty() (redraw every shadow map next frame; still and moving shadows are kept apart by themselves: __hd.shadowCache = false turns it off), far from the world's centre the view draws about a centre that moves along with its camera by itself, so places 20 km out don't shake (a floating origin: v.origin is where it is; __hd.origin is how far, 1024 m, the camera goes before it moves, 0 never; a gs.physics3d World3D follows it: world.at, world.centre(x, z) for a world with no view). */
export interface HdPart { ContactShadows: new (o?: { y?: number; size?: number; blur?: number; darkness?: number; opacity?: number; height?: number }) => Loose; HDView: new (...a: Loose[]) => Loose; HD: Loose; TIERS: Loose; hasHD(): boolean; pbr: Loose; rbox: Loose; surface: Loose; speckle: Loose; /** pbr(col, { rough, metal, glow, clear, sheen, tex, depth (parallax occlusion on WebGPU, in texture widths, e.g. .05), sss: true | { colour, power, scale, distortion, ambient, attenuation, thin (light only where the mesh's gsThin attribute says it is thin and open behind), back }, aniso (brushed metal streaks 0..1), anisoDir (radians), film (soap bubble / oil rainbow 0..1), glass: true | { thickness, ior, tint, distance }, wet (rain-soaked 0..1, porosity) }) (sss: subsurface scattering, light glowing through skin, wax, leaves). */ /** detail(big, fine, { times, strength }): mix a fine surface() normal (repeated `times` over) into a big one, so close-ups keep grain. Give it sets without repeat. */ detail(big: Loose, fine: Loose, o?: { times?: number; strength?: number }): Loose; /** panel(colour, intensity, w, h, { glow }): an area light, a glowing w x h rectangle shining out of its front (-z; aim with lookAt). */ panel(col?: string | number, i?: number, w?: number, h?: number, o?: { glow?: boolean }): Loose; /** lut(look, { size }): a colour look table for v.lut, from a name, (r, g, b) => [r, g, b] (screen colours 0..1) or .cube file text. */ lut(look: string | ((r: number, g: number, b: number) => number[]), o?: { size?: number }): Loose; /** pulse(material, { at, radius, strength, color, width, fill }): a glowing ring sweeping out from a point (sonar, shockwave). */ pulse(m: Loose, o?: { at?: { value: Loose }; radius?: { value: number }; strength?: { value: number }; color?: number[] | Loose; width?: number; fill?: number }): Loose; Particles: Loose;
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
  /** Set by a gs.sky.Weather that was given the level: what it has made wet and white, drawn only where the sky can see. */
  world: { wet: number; snow: number; pools: number; cover: SkyCover | null } | null;
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
  /**
   * People who react physically: one for each character on a gs.poses rig (figure(), person(), gs.models.human()).
   * It flinches where it is hit, steps to keep its balance when shoved, puts its hands out against a wall it
   * runs into, goes down as a jointed ragdoll (with `world`, a gs.physics3d World3D; acted without) and gets up.
   * Call update(dt) each frame after rig.update(dt), and steer the character only while `busy` is false.
   */
  Reactions: new (body: Loose, o?: ReactionsOptions) => ReactionsT;
}
export interface ReactionsOptions {
  /** A gs.physics3d World3D: falls are a jointed ragdoll in it. Without one they are acted. */
  world?: Loose | null;
  /** The World3D mover that walks the character: staggering respects walls, and it is put back where the body gets up. */
  mover?: Loose | null;
  /** Floor height at (x, z), for uneven ground and edges to fall off (-Infinity: a pit). */
  ground?: ((x: number, z: number) => number) | null;
  /** What it can run into (as gs.sound.Ears takes: a World3D, a City, a function...). Default: the world. */
  level?: SoundLevel | null;
  /** How hard it is to knock over: 1 a person, 2 a brute, .5 someone already hurt. */
  steady?: number;
  /** Seconds it lies before getting up by itself (Infinity: only when told). Default 1.4. */
  rest?: number;
  /** false: no bracing against walls. */
  walls?: boolean;
  rig?: Loose;
}
export interface ReactionsT {
  /** true while the character is not the game's to steer (staggering, falling, down or getting up). */
  readonly busy: boolean;
  /** true while it lies on the ground. */
  readonly down: boolean;
  state: 'steady' | 'stagger' | 'falling' | 'down' | 'rising';
  /** true for one frame: a recovery step landed; it hit the ground (impact: metres a second); it is back on its feet. */
  stepped: boolean; landed: boolean; rose: boolean; impact: number;
  limp: boolean; steady: number; rest: number;
  /** The ragdoll while there is one (parts, part(name), push, hit, drive, relax). */
  doll: Loose | null;
  /** A blow: push is the change of speed it would give the body (metres a second, world), at a world point (default the chest). Light: a flinch; harder: a stagger; harder still, or at the legs: a fall. */
  hit(push: number[] | XYZ, at?: number[] | XYZ | null): ReactionsT;
  /** Thrown by an explosion at point: strength is metres a second at the centre, nothing at radius. */
  blast(point: number[] | XYZ, strength?: number, radius?: number): ReactionsT;
  /** The legs caught on something: a stumble, or a fall at a run. dir: a world direction (default: the way it is going). */
  trip(dir?: number[] | XYZ | null): ReactionsT;
  /** Goes down now. limp: nobody in it (knocked out, shot): it stays down until getUp({ revive: true }). */
  fall(push?: number[] | XYZ | null, o?: { limp?: boolean }): ReactionsT;
  /** Arms up against something coming from a world point, for some seconds. */
  brace(from?: number[] | XYZ | null, seconds?: number): ReactionsT;
  getUp(o?: { revive?: boolean }): ReactionsT;
  /** Stands it up at once, steady (a new round). */
  reset(): ReactionsT;
  /** Each frame, after rig.update(dt). */
  update(dt: number): ReactionsT;
}
export interface FaceT {
  blinkEvery: number; readonly talking: boolean;
  set(name: string, amount?: number): FaceT;
  say(text: string, o?: { pitch?: number; rate?: number; volume?: number; lang?: string }): Promise<boolean>;
  hush(): FaceT; mouth(level: number | null): FaceT; blink(): FaceT; update(dt: number): FaceT;
}
/** What a gs.models.human() person's face can be set to. */
export type LiveShape = 'open' | 'wide' | 'round' | 'smile' | 'frown' | 'surprise' | 'blink' | 'squint' | 'sad' | 'angry' | 'wince' | 'winkL' | 'winkR' | 'disgust' | 'fear' | 'contempt' | FaceMove;
/** The 51 single movements of a face that face capture records (ARKit's names, all but the tongue's; Left and Right are the person's own): face.set(move, 0..1) on a gs.models.human() person. */
export type FaceMove = 'browDownLeft' | 'browDownRight' | 'browInnerUp' | 'browOuterUpLeft' | 'browOuterUpRight' | 'cheekPuff' | 'cheekSquintLeft' | 'cheekSquintRight'
  | 'eyeBlinkLeft' | 'eyeBlinkRight' | 'eyeLookDownLeft' | 'eyeLookDownRight' | 'eyeLookInLeft' | 'eyeLookInRight' | 'eyeLookOutLeft' | 'eyeLookOutRight' | 'eyeLookUpLeft' | 'eyeLookUpRight'
  | 'eyeSquintLeft' | 'eyeSquintRight' | 'eyeWideLeft' | 'eyeWideRight' | 'jawForward' | 'jawLeft' | 'jawOpen' | 'jawRight' | 'mouthClose' | 'mouthDimpleLeft' | 'mouthDimpleRight'
  | 'mouthFrownLeft' | 'mouthFrownRight' | 'mouthFunnel' | 'mouthLeft' | 'mouthLowerDownLeft' | 'mouthLowerDownRight' | 'mouthPressLeft' | 'mouthPressRight' | 'mouthPucker' | 'mouthRight'
  | 'mouthRollLower' | 'mouthRollUpper' | 'mouthShrugLower' | 'mouthShrugUpper' | 'mouthSmileLeft' | 'mouthSmileRight' | 'mouthStretchLeft' | 'mouthStretchRight'
  | 'mouthUpperUpLeft' | 'mouthUpperUpRight' | 'noseSneerLeft' | 'noseSneerRight';
/**
 * The face of a gs.models.human() person (person.face): what gs.characters.Face takes (set, say, mouth, blink, blinkEvery), on a sculpted head with bones for
 * the eyes, the upper lids, the brows, the jaw and the corners of the mouth. It blinks by itself, and its eyes keep to a spot in the world while the head
 * moves and jump to a new one now and then. The rig steps it with the body, close up only, so there is no update() to call.
 */
/**
 * A gs.models.human person breathing (person.breath): the front of the rib cage and the belly rise and fall about fifteen times a minute at rest,
 * the belly more in a man and the chest a little more in a woman; faster and deeper after running, back to rest over half a minute or so; a heavy
 * belly lags a moment behind the hips in a stride or a landing and settles. It runs by itself (the rig steps it); close up only.
 */
export interface BreathT {
  /** false holds the breath (a held breath before a shot, a body on the ground); true breathes. */
  on: boolean;
  /** How out of breath, 0 at rest .. 1 after a sprint: it rises while running and falls back by itself; set it for a scene that wants a winded person. */
  puff: number;
  /** Back to rest, as made. */
  still(): BreathT;
}
export interface LiveFaceT extends FaceT {
  set(name: LiveShape, amount?: number): LiveFaceT;
  /** The eyes onto a point in the world, or an Object3D (followed as it moves); null lets them wander again. Each eye turns by itself, as far as eyes do (about 30 degrees to either side): turn the head yourself for more. */
  look(target: [number, number, number] | { x: number; y: number; z: number } | Loose | null): LiveFaceT;
  /** Eyes screwed shut and the mouth pulled back for a moment, as at a blow (gs.characters.Reactions does it by itself). amount 0..1 (1), seconds (.3). */
  wince(amount?: number, seconds?: number): LiveFaceT;
  /** true: awake whatever; false: eyes closed and still; null (as made): awake unless the head lies over, low down (a body on the ground). */
  awake: boolean | null;
  /** Where the eyes are turned, in the head's own terms (radians): yaw to the person's left, pitch down. */
  readonly yaw: number; readonly pitch: number;
  /** The nostrils widen a little on each breath (true); false stills them. */
  breathe: boolean;
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

/** A buff or perk spec (gs.stats). for: seconds (none: a perk, on until removed). */
export interface StatBuff {
  for?: number; add?: Record<string, number>; mul?: Record<string, number>; tags?: string[]; blocks?: string[];
  /** Pools drained per second (negative heals); with every, counted each tick instead. */
  drain?: Record<string, number>; every?: number; tick?: (stats: Stats, effect: StatEffect) => void;
  /** Most doses (1) and what putting it on again does: refresh the time (default), extend it, stack a dose, keep the first, strongest (the longer). */
  stacks?: number; stack?: 'refresh' | 'extend' | 'stack' | 'keep' | 'strongest' | (string & {}); bad?: boolean; [k: string]: Loose;
}
export interface StatEffect { readonly id: string; spec: StatBuff; stacks: number; left: number; since: number; readonly perk: boolean; readonly bad: boolean; readonly part: number; readonly tags: string[] }
export interface Stats {
  on(ev: 'buff' | 'end' | 'tick' | 'change' | 'empty' | 'full' | 'ready' | 'blocked', fn: (...a: Loose[]) => void): this;
  /** A stat with everything on it now ((base + adds) x muls, held to its min and max); a pool's amount. */
  get(name: string): number; baseOf(name: string): number; setBase(name: string, v: number): this;
  /** A pool's most ('name.max'). */
  max(name: string): number;
  /** 0..1: a pool's fill; part(name, 'cool') a cooldown's refill (1 ready); a buff's time left by id. */
  part(name: string, kind?: 'cool'): number;
  /** Moves a pool (negative takes away; a loss holds off regen for its delay). Returns how much it moved. */
  change(name: string, n: number, why?: string | null): number;
  spend(name: string, n: number): boolean; fill(name: string, share?: number): number; empty(name: string): boolean; full(name: string): boolean;
  /** Puts a buff on by its table name or a spec; null if something on blocks it. */
  buff(id: string, spec?: StatBuff | null, o?: { for?: number; stacks?: number }): StatEffect | null;
  perk(id: string, spec?: StatBuff | null, o?: { stacks?: number }): StatEffect | null;
  remove(id: string, why?: string, o?: { dose?: boolean }): boolean;
  /** Doses on (0: not on). */
  has(id: string): number; is(tag: string): boolean; readonly buffs: StatEffect[]; cleanse(fn?: (e: StatEffect) => boolean): number;
  /** A cooldown: seconds per use, charges stored, by (a stat that speeds it: 1.25 a quarter quicker). */
  cool(name: string, seconds: number, o?: { charges?: number; by?: string | null; start?: number }): this;
  ready(name: string): boolean; use(name: string): boolean; left(name: string): number; charges(name: string): number;
  hurry(name: string, seconds: number, o?: { all?: boolean }): void;
  update(dt: number): void; clear(o?: { perks?: boolean }): this;
  pack(): Loose; unpack(d: Loose): this;
}
export interface StatsPart {
  /** stats: { name: number | { base, min, max } | a pool { max, regen, delay, start, min } }; buffs: the table buff(id) and perk(id) read. */
  Stats: new (stats?: Record<string, number | { base: number; min?: number; max?: number } | { max: number; regen?: number; delay?: number; start?: number; min?: number }>, o?: { buffs?: Record<string, StatBuff> }) => Stats;
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
  /**
   * Rain, snow or a storm round the camera. Given the level (Next Gen views with air()), it also changes the world: rain and
   * snow stop at roofs, what the sky can see gets wet, puddles spread on flat ground and dry up again, snow settles and
   * melts, and floors indoors, porches and the ground under a bridge stay dry. docs/nextgen-3d.md "Weather that changes the world".
   */
  Weather: new (view: Loose, o?: WeatherOptions) => WeatherPart;
}
export interface WeatherOptions {
  kind?: 'rain' | 'snow' | 'storm' | 'clear'; amount?: number; area?: number; /** [x, z] push, or a gs.outdoors.Wind to follow. */ wind?: number[] | { x?: number; z?: number; [k: string]: Loose }; max?: number; color?: string;
  /** How big a snowflake is drawn, in metres (with a level: .07 at most). */ flake?: number;
  /**
   * What stands in the weather, so it can change the world: a gs.physics3d World3D, a City, Voxels, a function
   * (from, dir, max) => metres to the first solid thing, three.js meshes or groups (keep those to a few simple shapes),
   * or a list of these. true: no roofs anywhere, everything is out in it.
   */
  level?: Loose;
  /** (x, z) => the height of the land, for land that is not in the level (land.height). */ ground?: (x: number, z: number) => number;
  /** The map of what the sky can see: cells (128) of cell metres (.5) round the camera, rise and drop (80 m: how far above and below the camera it looks), rays (400 spots asked a frame at most), ms (1.5 at most). */
  cover?: { cells?: number; cell?: number; rise?: number; drop?: number; rays?: number; ms?: number; again?: number };
  /** gs.outdoors.Water (one or a list): the rain falls on it too (it sets water.rain). */ water?: WaterPart | WaterPart[];
  /** Seconds of full rain until everything is wet (20), and of no rain until it is dry again (90). Puddles take twice as long to fill and go last. */ soak?: number; dry?: number;
  /** Seconds of full snow until it has all settled (40), and until it has melted once the snow stops (150; rain washes it away six times as fast). */ settle?: number; melt?: number;
  /** How deep settled snow lies, in metres (.25): what snowAt() answers with. */ deep?: number;
  /** How many drops hop off the ground near the camera at once in the rain (96; 0: none). */ hops?: number;
}
export interface WeatherPart {
  kind: string; amount: number; wind: [number, number]; onFlash: ((far: number) => void) | null; readonly flashing: boolean;
  /** How wet the open world is, how far the puddles have spread and how much snow has settled, each 0..1 (with a level). Set them to start a round after rain or in deep snow. */
  wet: number; pools: number; snow: number;
  /** How hard it is raining and snowing now, 0..1. */ readonly rain: number; readonly snowing: number;
  /** The map of what the sky can see (with a level): cover.at(x, z) is the height of the highest solid thing over a spot. */ readonly cover: SkyCover | null;
  set(kind: 'rain' | 'snow' | 'storm' | 'clear', amount?: number): WeatherPart; flash(): WeatherPart; update(dt: number): WeatherPart; dispose(): void;
  /** Can the sky see this point (is nothing over it)? Always true with no level. */ open(p: Fx3dPos): boolean;
  /** How wet a spot is now, 0..1: 0 under a roof (slippery floors, footsteps that splash, a dog that shakes itself indoors). */ wetAt(p: Fx3dPos): number;
  /** How deep the snow lies at a spot, in metres: 0 under a roof (footprints, slower walking). */ snowAt(p: Fx3dPos): number;
}
/** What the sky can see, as numbers on a grid round the camera (weather.cover). */
export interface SkyCover {
  /** Cells a side and metres a cell; the middle of the square it knows, and how far from it the answers reach. */
  readonly N: number; readonly cell: number; readonly cx: number; readonly cz: number; readonly reach: number;
  /** True once every spot in its square has been asked about (a few frames after a jump). */ readonly ready: boolean;
  /** The height of the highest solid thing over x, z (a roof, a bridge, the ground): -Infinity where it does not know. */ at(x: number, z: number): number;
  /** Is nothing over this point? slack: how far under the highest thing still counts (.3 m). */ open(x: number, y: number, z: number, slack?: number): boolean;
  /** You changed the level here (a roof came off, a door opened): it asks again within r metres (4) first. It looks everything over again every few seconds anyway. */ touch(x: number, z: number, r?: number): SkyCover;
  /** Every spot now, not a few a frame (while loading). */ update(all?: boolean): SkyCover;
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
/** What gs.models.vehicle takes. Colours are '#rrggbb'. */
export interface VehicleOptions {
  /**
   * Which one of its kind (the first is what you get with none; vehicle.kinds lists them): a car 'saloon' | 'hatch' | 'estate' | 'sports' | 'van' | 'pickup' | 'jeep'; a truck 'flat' | 'canvas' | 'box' | 'tanker';
   * a tank 'medium' | 'light' | 'heavy'; a train's engine 'steam' (it brings its tender) | 'diesel', or one wagon 'tender' | 'van' | 'open' | 'flat' | 'tanker' | 'guard' (a guard's van) | 'coach'; a boat 'rowboat' | 'motor' | 'fishing' | 'patrol'; a plane 'prop' | 'biplane' | 'twin' | 'jet'.
   */
  style?: string;
  /** Which of its kind's colours it gets, and where its wear falls: the same on every phone. */
  seed?: number;
  /** Its paint, and its second colour (a coach's band, a boat's deck house, a plane's stripe). */
  colour?: string; color?: string; trim?: string;
  /** 'gloss' a new car, 'satin', 'matt' army paint, 'worn' paint rubbed through to the metal, 'rusty'. Each kind has its own to start with. */
  finish?: 'gloss' | 'satin' | 'matt' | 'worn' | 'rusty';
  /** How aged, 0..1 (worn edges, dirt low down), or false: straight from the factory. */
  wear?: number | false;
  /** Its lamps glow (lights(on) changes it later). */
  lit?: boolean;
  /** A car's or a truck's shell and wheels: 1, or .5 a little coarser (about a fifth fewer triangles). */
  detail?: number;
  /** A truck: the colour of a 'canvas' tilt (a train: of the canvas over a wagon's load); 3 axles (2); tyres with lugs for mud. */
  canvas?: string; axles?: 2 | 3; offroad?: boolean;
  /**
   * A train: what its engine pulls, in order (['van', 'open', 'tanker', 'flat', 'guard', 'coach'...]), and the gauge between its rails in metres (1.435).
   * A wagon can also be { style, load, colour, canvas }: its boards (or its tank) in a colour of its own, and what it carries.
   */
  cars?: (string | WagonOptions)[]; gauge?: number;
  /** A train: smoke deflectors on a steam engine (a plate each side of its smokebox); and what a wagon made by itself carries (see WagonOptions). */
  deflectors?: boolean; load?: 'tarp' | 'coal' | 'crates';
  /** A train: false is a working engine with nothing kept bright: a steam engine's dome and boiler bands painted over, and every wheel's rim as dark as the wheel (only its tread shows steel). */
  polished?: boolean;
  /**
   * A train that keeps to a straight line, drawn in as few draws as it can be: every car's shell joined into one mesh for each kind of surface (colours in its corners) and every wheelset of one shape in one draw.
   * A seven-car goods train is 16 draws where it was 58, the same triangles and the same picture. It rolls, moves, lights and twins as before and its cars keep their `points`; along() throws, as its cars are one shape.
   */
  fuse?: boolean;
}
/** One wagon of a train, when a name is not enough: `cars: ['van', { style: 'open', load: 'coal', colour: '#565c50' }, 'guard']`. */
export interface WagonOptions {
  /** 'van' | 'open' | 'flat' | 'tanker' | 'guard' | 'coach' | 'tender'. */
  style: string;
  /** What it carries: an 'open' wagon's 'tarp' (a load under canvas) or 'coal'; a 'flat' wagon's 'crates' (crates, oil drums and something under canvas). */
  load?: 'tarp' | 'coal' | 'crates';
  /** Its own colour: a wagon's boards, a tank wagon's tank (with none, bare wood and the train's second colour). */
  colour?: string; color?: string;
  /** The colour of the canvas over its load. */
  canvas?: string;
}
/** What gs.models.vehicle gives back: a Group, its nose along -z and +x its right side, in metres. A road vehicle and a train stand on y = 0, a boat floats with its waterline there, a plane's origin is on its centre line. */
export type VehicleT = Loose & {
  kind: 'car' | 'truck' | 'tank' | 'train' | 'boat' | 'plane'; style: string;
  /** Its body (a Group): everything but the wheels. */
  shell: Loose;
  /** Its wheels' pivots: front left, front right, back left, back right (then a third axle's); each has `radius`, `width` and `steers`. A tank's and a train's are drawn as copies and are not here. */
  wheels: Loose[];
  /** A tank: where its two caterpillar tracks run (x: metres either side of its middle) and how wide each is. gs.outdoors.Marks lays their marks. */
  belts?: { x: number; width: number };
  /** The parts that turn, by name, each a Group to turn yourself: a tank's `turret` and `gun`; a rowboat's `oarL`, `oarR`; a motor boat's `motor` and its `prop`; a patrol boat's `radar`, `turret`, `gun`; a plane's `prop` (a twin's `propL`, `propR`); a steam engine's `rods`, `mainRods`. */
  parts: Record<string, Loose>;
  /** Places on it (Object3Ds that move with it and are turned as it is: getWorldPosition(v), or add a thing to one; a seat is the top of its cushion): `driver`, `passenger`, `exhaust`, `lampL`, `lampR`, `hitch`; a truck's `load`; a tank's `muzzle`, `commander`; a train's `front`, `back`, `smoke`, `steam`, `whistle`, `fire`, a tender's `coal`, a van's and a guard's van's `roof`, a guard's van's `veranda` and `tail`, a tank wagon's `filler`; a boat's `helm`, `bow`, `wake`; a plane's `pilot`, `guns`, `smoke`... as its kind has them. */
  points: Record<string, Loose>;
  /** Metres over everything that does not turn. */
  size: { length: number; width: number; height: number };
  /** Between its axles, between its wheels across, and a wheel's radius, in metres (0 where it has none). */
  wheelbase: number; track: number; radius: number;
  /** A plane: how high its origin stands above the ground on its wheels, and how far its nose points up there (radians). A boat: how deep it floats. */
  gear?: number; sit?: number; draft?: number;
  /** How many triangles it draws. */
  tris: number;
  /** What it was made with: kind, style, seed, colour, trim, finish. */
  look: Record<string, Loose>;
  /** Turns its wheels for a distance travelled so far, in metres (a tank: its left and right tracks). */
  roll(d: number, right?: number): VehicleT;
  /** Turns its front wheels: radians, + to the right. */
  steer(a: number): VehicleT;
  /**
   * The easy way to keep it alive each frame: rolls its wheels (or tracks) for its speed in metres a second, eases its front wheels to `steer` (-1..1, + right; lock: radians at 1), rolls its body outwards in a turn and rocks it with its speeding up and
   * slowing down (sway: how much, 1), spins its propellers up to a blur (power 0..1), turns a boat's motor and radar. A tank: `turn` -1..1 runs one track ahead of the other, `aim` [turn, lift] eases its turret and gun there. ground: false keeps a plane's wheels still in the air.
   */
  move(dt: number, speed?: number, o?: { steer?: number; lock?: number; sway?: number; turn?: number; aim?: [number, number] | null; power?: number; ground?: boolean }): VehicleT;
  /**
   * Cars and trucks, for gs.physics3d: `world.vehicle(car, car.chassis({ power: 14 }))` gives it springs and grip. It returns what World3D.vehicle wants (w, h, l, radius, rest, travel and its four wheels, plus anything you pass) and moves the body so its
   * origin is the middle of the chassis and not on the road. Call it once; a third axle's wheels follow the second's.
   */
  chassis?(o?: Record<string, Loose>): Record<string, Loose>;
  /** A turret turned (radians from straight ahead, + to its left) and its gun lifted (radians up, held within its stops). */
  aim(turn?: number, lift?: number): VehicleT;
  /** Its lamps on or off. */
  lights(on?: boolean): VehicleT;
  /** Another just like it, sharing its shapes and materials. */
  twin(): VehicleT;
};
/** A train from gs.models.vehicle('train', ...): its cars coupled nose to tail, the engine first, the middle of the train at its origin. */
export type TrainT = Loose & {
  kind: 'train'; style: string;
  /** Each car, a vehicle of its own (its `length` over its buffers; `parts`, `points`, `lights`...), the engine first. Made with fuse: true they have no meshes of their own, but stay where they are for their points and for what you add to them. */
  cars: (VehicleT & { length: number; reach: number; back: number })[];
  /** true on a train made with fuse: true: its meshes are in `shell`, one a kind of surface, and along() throws. */
  fused?: boolean; shell?: Loose;
  /** The engine's. */
  parts: Record<string, Loose>; points: Record<string, Loose>;
  size: { length: number; width: number; height: number };
  /** Metres over its buffers, end to end; and the radius of its engine's driving wheels. */
  length: number; radius: number; tris: number; look: Record<string, Loose>;
  /** Turns every wheel (and a steam engine's rods) for a distance travelled so far, in metres. */
  roll(d: number): TrainT;
  /** Each frame: rolls its wheels for its speed in metres a second. */
  move(dt: number, speed?: number): TrainT;
  /**
   * Lays it along a track with its front `d` metres along it, each car between its own wheels, so it bends round curves and tips on slopes. track: (metres along) => { x, y, z } on top of the rails, or a gs.paths.Path;
   * the points are in the train's own space, so leave the train itself where the track's points are measured from.
   * A train made with fuse: true keeps to a straight line: this throws.
   */
  along(track: ((d: number) => { x: number; y?: number; z?: number }) | Loose, d: number): TrainT;
  lights(on?: boolean): TrainT;
  twin(): TrainT;
};
/** What gs.models.fur takes (a creature's `fur` and a person's `strands` take the same, less what they work out themselves). Lengths are in the mesh's own units. */
export interface FurOptions {
  /** How long the strands are (.03). A creature and a person take theirs in metres. */
  length?: number;
  /** How many layers: by the phone's quality unless given (none on the slowest phones, then 5, 7 and 10). */
  layers?: number;
  /** 'fur': strands on end; 'hair': long strands lying side by side. */
  kind?: 'fur' | 'hair';
  /** How much of `length` grows at each point: a Float32Array of 0..1 a point, or (i, x, y, z) => 0..1. 0: none there. */
  where?: Float32Array | ((i: number, x: number, y: number, z: number) => number);
  /** The triangles to cover, as indices into the mesh's points (the mesh's own index otherwise). */
  index?: ArrayLike<number>;
  /** How wide the picture of strands is on the surface (.1; fur has 32 strands across it, hair 36). */
  tile?: number;
  /** 'box' (strands on end from every side), or for hair the crown they stream from on a head whose middle is `centre`: around (whole pictures round the head), droop (how much they hang: .35). */
  uv?: 'box' | { centre?: number[]; crown?: number[]; around?: number; droop?: number };
  /** 0..1.5 how far the strands lie over (.5). */
  lean?: number;
  /** The way they lie: [x, y, z] or a function of each point and its normal. Down and back (-z) otherwise. */
  flow?: number[] | ((x: number, y: number, z: number, nx: number, ny: number, nz: number) => number[]);
  /** No strand longer than this much of how thick the mesh is where it grows, so ears, thin tails and legs keep their shape (.45; 0: any length). */
  thin?: number;
  /** How quickly strands lengthen away from where none grow, as a part of `length` an edge (.5). */
  ease?: number;
  rough?: number;
  /** How dark the roots are and how light the tips (.65, 1.5). */
  root?: number; tip?: number;
  /** A tint over the mesh's vertex colours. */
  colour?: string; color?: string;
  /** The strands' colours where they differ from the mesh's: three numbers a point. */
  colors?: Float32Array;
  /** How thick the coat is at each point besides its length, 0..1 a point: a beard thinning out strand by strand toward its edges. */
  cover?: Float32Array;
  /** 0..1: a shine stretched across the strands, as off hair (three's anisotropy). */
  aniso?: number;
  /** Which picture of strands (1). */
  seed?: number;
  /** false: don't thin out with distance. */
  auto?: boolean;
  /** How big the furry thing is (mesh units), for thinning with distance. */
  size?: number;
  /** Another coat's `shell`, to share its geometry (twins). */
  shell?: Loose;
}
/** A coat of fur or hair: layers of strands over a mesh. */
export interface FurCoat {
  /** Its meshes, the outermost first, children of the mesh it grows on. */
  shells: Loose[];
  layers: number;
  /** The geometry every layer shares (null on a phone that draws no layers). */
  shell: Loose | null;
  /** Triangles drawn when every layer shows. */
  tris: number;
  /** Set any time: 1 as made, 1.5 fur standing on end, .5 flattened by water. */
  length: number;
  /** Set any time: how far the strands lie over (wind, speed). */
  lean: number;
  /** How much of it shows: 1 every layer, .5 every other, 0 none. Set by itself from how big the mesh is on screen (unless auto: false). */
  level: number;
  /** Sets level for a camera; returns it. */
  see(camera: Loose, screenHeightPx?: number): number;
  dispose(): void;
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
  /**
   * Fur in layers (gs.models.fur) over a coat of fur, and over a mane and a tail of hair on any coat: on by itself, close up, on all but the slowest phones. false: none.
   * Or { length (metres), layers, lean, tile (metres), rough, root, tip, auto, from (0: grown on the finest level's triangles everywhere) }.
   */
  fur?: boolean | (Pick<FurOptions, 'length' | 'layers' | 'lean' | 'tile' | 'flow' | 'ease' | 'rough' | 'root' | 'tip' | 'seed' | 'auto'> & { from?: number });
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
  /** Its coat of fur (null: it has none, or this phone draws none): fur.length = 1.5 stands it on end, fur.lean lays it flat. move() lays it back a little as it runs. */
  fur: FurCoat | null;
  /** Another of the very same creature, sharing everything but its skeleton. */
  twin(): CreatureT;
};
export interface RigT {
  state: string;
  /** True once a pose added with { once: true } has played through (it then holds its last frame). */
  readonly done: boolean;
  /** How far through its cycle the pose is, 0..1 (blendPhase: the same for a blend space: footsteps fall at 0 and .5). */
  phase: number; blendPhase: number;
  /** Lean and bank (0: none; 1: a person): the body tips into a change of speed and into a turn (update's speed and turn). */
  weight: number;
  /** Blends to a pose. at: where in the pose it stands (0..1), for a pose the game drives itself (call each frame); from: where it starts; again: start a playing pose over. */
  play(name: string, o?: { fade?: number; at?: number | null; from?: number | null; again?: boolean }): RigT; upper(name: string | null): RigT;
  /** How a pose moves on: rate: cycles a metre (walks and runs; 0 for the rest), per: cycles a second (0: it stands still), once: it plays through and holds. null: no such pose. */
  pace(name: string): { rate: number; per: number; once: boolean } | null;
  /** Your own pose: fn(phase 0..1) => { j: { joint: [x, y, z] }, drop, shift: [x, y, z] metres }. rate: cycles a metre moved; or { time: seconds a cycle, once: play through and hold the end }. keys() makes fn from key poses. ground: true says the feet stand on the ground in it, so a gs.models.human keeps them where they are put down (see steps); a walk of your own also gives stance, the share of a stride a foot is down (.6). */
  add(name: string, fn: Loose, rate?: number | { time?: number; once?: boolean; rate?: number; ground?: boolean; stance?: number }): RigT;
  /** 1D blend space: { pose: value }, mixed at v with every cycle in step. */
  blend(space: Record<string, number>, v: number): RigT;
  /** 2D blend space: { pose: [x, y] }, mixed at (x, y). */
  blend2(space: Record<string, [number, number]>, x: number, y: number): RigT;
  /** Foot IK after update(): feet on the floor at ground(x, z); body is the character. */
  plant(ground: (x: number, z: number) => number, body: Loose, o?: { most?: number }): RigT;
  /** speed: metres a second (strides follow it); aim: up/down aim for the upper layer (radians); turn: radians a second (with weight: banks into it). */
  update(dt: number, o?: { speed?: number; aim?: number; turn?: number }): RigT;
  /** A full skeleton (gs.models.human's): brings the joints in between into line (the waist with the rib cage, the neck with the head, a collar bone with each arm, the forearm's skin with the hand). update() does it; call it after turning joints yourself. Nothing on a plain figure. */
  fill(pose?: Record<string, number[]> | null): RigT;
  /** A full skeleton: false leaves the forearm's turn and the toes alone (a person seen from further off sets it by itself: person.lod, see()). */
  fine?: boolean;
  /** A gs.models.human person's breathing and soft flesh (the same as person.breath); update() steps it. */
  breath?: BreathT;
  /**
   * Steps that are really taken (gs.models.human people; on by itself): in the poses that stand on the ground (the lifelike walks and runs, standing easy,
   * and your own added with { ground: true }) a foot stays where it was put down while the body goes on over it, footfalls follow the way the body really
   * goes (a bend, a body faster or slower than its walk), and a person turned or shifted while standing steps round, a foot at a time (a kneel turns on its knee, and a change from one way of standing to another
   * moves the feet as drawn). Move the person,
   * then call update(dt, { speed }). false leaves every pose as drawn (a person riding on something slow). It stands down by itself for a walk on the
   * spot, a person carried along, a far-off person and one that gs.characters.Reactions has off its balance.
   */
  steps?: boolean;
  /** The feet as they stand (people with steps): feet[0] the left, feet[1] the right; landed is true on the update a foot touches the ground (a footstep sound), down while it stands. */
  readonly stride?: { readonly feet: { readonly down: boolean; readonly landed: boolean }[] } | null;
  /**
   * Momentum between moves (gs.models.human people; on by itself): a new move begins at once and takes up what the body was doing. How far each joint was
   * from where the new move has it, and how fast it was turning, die away smoothly in about the fade asked for, so a limb in mid swing swings on a
   * little, the hips come down with weight, and nobody is half in one pose and half in another. play(name, { fade: 0 }) is still a cut. false: moves
   * cross-fade, as on other rigs.
   */
  momentum?: boolean;
  /**
   * Follow-through (gs.models.human people; on by itself): what the body carries goes on a moment and settles when the game starts it, stops it, turns
   * it or drops it. The arms swing on, the head nods, the rib cage and the head come round after the hips, the shoulders give on a landing, and a pack
   * or what hangs from the belt swings and bounces. Nothing is added to a steady walk or to a body moved at a stroke. amount: 0 turns it off, 2 doubles
   * it; reset() stills everything (a new round).
   */
  readonly follow?: { amount: number; reset(): void } | null;
  /**
   * Something that hangs from the body and swings as it moves (a slung rifle, a lantern, a satchel): thing is an Object3D on one of the joints, as it
   * hangs at rest. pivot: the point it hangs from, in its parent's space (default: its own place); swing: radians for each metre a second a second its
   * pivot is pushed (.03 a bag on a strap, .008 a pack); bounce: metres up and down (.0016 a pack); stiff, damp: its spring (120, 10); most: the
   * furthest it swings (radians); away: the way out from the body where it hangs, in its parent's space (on the back: [0, 0, -1]), so it never swings
   * into the body. apply: false leaves the thing alone, for one you place yourself each frame: add the returned x and z (radians about the pivot,
   * forward-and-back and side to side) and y (metres) to it. Close up only. A person's own pack, bag, canteen and holster are hung already.
   */
  hang(thing: Loose, o?: { pivot?: [number, number, number]; swing?: number; bounce?: number; stiff?: number; damp?: number; most?: number; away?: [number, number, number]; apply?: boolean }): { readonly x: number; readonly z: number; readonly y: number };
}
export interface PosesPart {
  POSES: Record<string, Loose>;
  /** A joint in between (a person's shoulders, elbows, hips and knees: bones.elbowL...): a bone that takes half of another joint's turn by itself whenever the skeleton is worked out, for the skin round the joint to go with, so a bent limb keeps its girth. Kit use: gs.models.human() makes them; nothing poses them. of: the joint it follows; home: its place; out: where the outside of the bend is (metres), or null. */
  Between: new () => Loose & { of: Loose | null; home: Loose | null; out: [number, number, number] | null };
  /** A muscle that bulges (a person's biceps: bones.bicepL...): a bone that moves out from its place as another joint bends (of), by out (metres) at a right angle's bend times size, for the skin over it to swell. Kit use: gs.models.human() makes them; nothing poses them. */
  Bulge: new () => Loose & { of: Loose | null; home: Loose | null; out: [number, number, number] | null; size: number };
  /** Lifelike idle, walk, jog, run, sprint and sneak for a figure with feet and hands (heel strike, push off the toes, planted feet that don't slide): new Rig(parts, { poses: LIFELIKE, weight: 1 }). gs.models.human people move with it. */
  LIFELIKE: Record<string, Loose>;
  /** A pose that moves through key poses on curves that never overshoot, for rig.add(): keys([[0, { spine: [.2, 0, 0] }], [.4, { armL: [-1, 0, 0], drop: .1, shift: [0, 0, .2] }], [1, {}]]). A key names only what changes. loop: the end joins the start. */
  keys(list: [number, Record<string, number[] | number>][], o?: { loop?: boolean }): (phase: number) => { j: Record<string, number[]>; drop: number; shift?: number[] };
  /** parts: the joints (hips, spine, head, arms, legs; hands and feet too if the figure has them). weight: lean and bank (0 none, 1 a person); size: the figure's scale (for moves in metres); joints: the names of the joints, for a body that isn't a person's. body: the object the game moves (steps that are really taken, follow-through); momentum, follow: see RigT (gs.models.human asks for all three). */
  Rig: new (parts: Loose, o?: { fade?: number; height?: number; poses?: Record<string, Loose>; weight?: number; size?: number; full?: boolean; joints?: string[]; body?: Loose; momentum?: boolean; follow?: boolean }) => RigT;
  /** A skinned person: one smooth mesh over the figure's bones, with a Rig and a Face. */
  person(o?: { body?: string; skin?: string; legs?: string; shoes?: string; hair?: string | null; eyes?: string; lips?: string; sleeves?: 'long' | 'short'; girth?: number; mat?: (colour: string) => Loose; scale?: number; shadows?: boolean }): Loose & { rig: RigT; face: FaceT; mesh: Loose; bones: Record<string, Loose> };
  Face: CharactersPart['Face']; shapes: CharactersPart['shapes']; visemes: CharactersPart['visemes']; FACE_SHAPES: string[];
  figure(o?: { body?: string; skin?: string; legs?: string; shoes?: string; hair?: string; mat?: (colour: string) => Loose; scale?: number; shadows?: boolean }): Loose;
}
export interface DestructionPart {
  shatter(mesh: Loose, o?: { pieces?: number; at?: P3; flat?: boolean; inside?: Loose; world?: Loose; push?: number; seed?: number; density?: number; radius?: number }): Loose[];
  slice(mesh: Loose, point: P3, normal: P3, o?: { inside?: Loose }): Loose[];
  Rubble: new (scene?: Loose, o?: { max?: number; life?: number; shrink?: number }) => { add(pieces: Loose | Loose[]): Loose; update(dt: number): Loose; clear(): Loose; readonly count: number };
  /**
   * A building that comes apart (Next Gen). It is made of pieces, and each knows what holds it up: shoot one away or set off a
   * blast and whatever no longer reaches the ground through the pieces left comes down a moment later. Make it once in make()
   * (scene: a view's scene or any group; null: not drawn), `reset()` it each round, `update(dt)` after the physics step, and
   * read `broke` for your dust, sound and shake.
   */
  Structure: new (scene?: Loose | null, o?: StructureOptions) => StructureT;
}
export interface BuildingOptions {
  style?: 'brick' | 'plaster' | 'concrete' | 'stone' | 'timber' | Record<string, Loose>; w?: number; d?: number; floors?: number; roof?: 'flat' | 'gable'; floor?: number; bay?: number; win?: [number, number]; lit?: number; colour?: string; color?: string; door?: boolean; seed?: number; wear?: false | Record<string, Loose>;
  /** three.js materials of your own in place of the style's recipes: any of wall, trim, frame, roof, door, glass, lit, floor. */
  materials?: { wall?: Loose; trim?: Loose; frame?: Loose; roof?: Loose; door?: Loose; glass?: Loose; lit?: Loose; floor?: Loose };
}
export interface StructureOptions {
  /** What gs.models.building() takes (style, w, d, floors, roof, seed, materials...): the building, cut into pieces. */
  building?: BuildingOptions;
  /** Or your own boxes (a bridge, a tower, a wall): size [w, h, d] and at [x, y, z] (the box's centre, from the structure's foot). */
  pieces?: StructurePiece[];
  /** With pieces: a three.js material, or a gs.models.material recipe as [name, options], for each material name used. */
  materials?: Record<string, Loose>;
  /** With pieces: how many pieces can hang out sideways from what holds them (1: masonry; 2: timber, steel, concrete). */
  span?: number;
  /** Where its foot is ([x, y, z] or { x, y, z }) and its turn about y (radians). A building's door faces +z before the turn. */
  at?: number[] | XYZ; turn?: number;
  /** A gs.physics3d World3D: the walls are solid in it (movers, rays, sound that knows the level), and what falls tumbles and piles up as real bodies. Without one, pieces fall and break up where they land. */
  world?: Loose | null;
  /** The height rubble lands at, (x, z) => y. Default: flat at its foot. */
  ground?: ((x: number, z: number) => number) | null;
  /** How much small rubble is kept for each material (240; the oldest goes first). */
  bits?: number;
  /** How many fallen pieces stay as bodies (40); the oldest break up. */
  keep?: number;
  /** How hard falling pieces hit what they land on (1; 0: they break nothing). */
  crush?: number;
  gravity?: number; seed?: number;
  /** With pieces: wear options for gs.models.wear, or false for none. */
  wear?: false | Record<string, Loose>;
}
export interface StructurePiece {
  size: [number, number, number]; at: [number, number, number];
  /** A material name ('brick' by default: a gs.models.material recipe, or a name in `materials`) or a three.js material. */
  material?: string | Loose;
  /** What it is made of, for its weight, strength and rubble, when the material's name does not say: 'brick', 'stone', 'concrete', 'planks', 'wood', 'metal', 'glass'... */
  stuff?: string;
  /** How hard it is to break (1.5 brick, 2 stone, 2.5 concrete, .8 wood, .1 glass). */
  strength?: number;
  /** true: it never moves or breaks, and holds the rest up as the ground does (a cliff the bridge is built into). */
  fixed?: boolean;
  kind?: string;
}
/** Something that happened to a piece this frame, in world units: it broke up where it stood, it began to fall, or a fallen one landed (crumbled: it broke up there). size: metres across; mass: tonnes; speed: metres a second. */
export interface StructureEvent { how: 'broke' | 'fell' | 'landed'; kind: 'wall' | 'window' | 'door' | 'roof' | 'floor' | string; x: number; y: number; z: number; size: number; mass: number; speed: number; crumbled?: boolean }
export interface StructureT {
  /** What happened this frame (after update): feed your dust, sound and shake from it. */
  broke: StructureEvent[];
  /** How much of it still stands, by weight: 1 whole, 0 flat. */
  readonly standing: number;
  /** Pieces about to fall or in the air; busy: true while anything is still coming down (pieces or rubble). */
  readonly falling: number; readonly busy: boolean;
  /** How many pieces it is made of, and how many still stand. */
  readonly pieces: number; readonly left: number;
  /** The standing building (a Group in the scene) and what has come off it. */
  group: Loose; debris: Loose;
  /** A hit at a world point (a bullet, a wrecking ball): pieces within radius (.4) are hurt by power (1 breaks a timber wall, 1.5 brick, 2 stone, 2.5 concrete; .1 a window; hurt adds up), and one that breaks goes to rubble along dir at push metres a second. Returns how many broke. */
  hit(point: number[] | XYZ, o?: { radius?: number; power?: number; dir?: number[] | XYZ | null; push?: number }): number;
  /** An explosion at a world point: every piece within radius (3) is hurt (power at the centre, 4, none at the edge), the nearest go to rubble, the rest of the broken ones are thrown whole at up to push metres a second (8); what they held up follows. Returns how many broke. */
  blast(point: number[] | XYZ, radius?: number, o?: { power?: number; push?: number }): number;
  /** The first standing piece along a ray (for shots without a physics world), or null. */
  ray(from: number[] | XYZ, dir: number[] | XYZ, max?: number): { point: Loose; normal: Loose; distance: number; kind: string; piece: number } | null;
  /** Each frame, after the physics step. */
  update(dt: number): StructureT;
  /** Whole again, for a new round. { world }: the round's new physics world (or call it after `world.clear()`). */
  reset(o?: { world?: Loose | null }): StructureT;
  /** Out of the scene and the physics world. */
  remove(): void;
}
/** One of a gs.props.Crowd: change these as your game likes, then call crowd.update(dt). */
export interface CrowdMember {
  x: number; y: number; z: number;
  /** Which way it faces, radians, as rotation.y (0 faces +z). */
  turn: number;
  /** Which of the crowd's figures it is a copy of (0, 1...). */
  readonly kind: number;
  /** The pose it plays, one of the crowd's `moves`. A new one blends in over a quarter of a second; a walk or run steps on by the ground the member covers, the rest by the clock. */
  move: string;
  size: number;
  /** A colour its own colours are multiplied by (a THREE.Color: member.tint.set('#c9d8ff')). */
  tint: Loose;
  /** true: not drawn (and not hit by ray()). */
  hide: boolean;
  /** Where in its move it is, 0..1. */
  phase: number;
  /** true once a move that plays once has ended. */
  readonly done: boolean;
  /** Yours: whatever you gave add(). */
  data?: Loose;
}
/**
 * Hundreds of animated people or animals in a few draws (Next Gen). Each kind's moves are written into a texture once and
 * the graphics chip bends every member into its pose, so nobody has a skeleton to work out in JavaScript.
 */
export interface CrowdT {
  /** The members, in the order they were added. */
  readonly list: CrowdMember[];
  /** false: nobody is drawn (their moves still step on). */
  visible: boolean;
  /** 0, 1 or 2: every member at that one of its figure's own levels of detail. null (the default): by its size on screen. */
  lod: number | null;
  /** Metres past which nobody is drawn. */
  far: number;
  /** What the last update() drew: members, how many were sent to be drawn, how many at each level of detail (finest first), draws and triangles a frame. */
  readonly info: { members: number; drawn: number; levels: number[]; draws: number; triangles: number };
  /** Adds a member. move: one of the crowd's moves (the first by default); phase: where in it to start (by default each starts somewhere else, so the crowd is out of step); tint: a colour its own are multiplied by; data: yours. */
  add(o?: { x?: number; y?: number; z?: number; turn?: number; kind?: number; move?: string; size?: number; tint?: string | number; phase?: number; data?: Loose }): CrowdMember;
  remove(member: CrowdMember): CrowdT;
  /** Takes everyone out (call in reset()). */
  clear(): CrowdT;
  /** The members within r metres of (x, z). */
  near(x: number, z: number, r: number, out?: CrowdMember[]): CrowdMember[];
  /** The first member a ray meets (a shot, a tap through the camera). dir has length 1. Each member counts as an upright rounded post as tall as it stands. height: 0 at its feet .. 1 at the top of its head. */
  ray(origin: XYZ, dir: XYZ, far?: number): { member: CrowdMember; distance: number; height: number } | null;
  /** Each frame, after the members and the camera have moved. */
  update(dt?: number): CrowdT;
  /** Out of the scene, and what it made freed. */
  dispose(): void;
}
export interface PropsPart {
  /**
   * A crowd in a Next Gen view. of: the figures its members are copies of, one a kind (each a gs.models.human(), gs.poses.person() or
   * gs.models.creature() made for the crowd: don't put it in the scene); moves: the poses of their rigs the members will use
   * (['idle', 'walk', 'run'] by default; add your own to a figure's rig with rig.add() first); far: metres past which nobody is drawn (160);
   * shadows: whether they cast them (true); reach: how many metres out of view a member is still drawn, for its shadow (5).
   * Make it in make(), clear() and add() in reset(), update(dt) each frame. Not in a crowd: faces, hair in strands and fur, hands onto things.
   */
  Crowd: new (view: Loose, o: { of: Loose[]; moves?: string[]; far?: number; shadows?: boolean; reach?: number }) => CrowdT;
  simplify(geometry: Loose, keep?: number): Loose;
  /** A finished InstancedMesh of still things, swapped in place for one that skips the copies off screen (same look). Returns the new mesh. */
  perCopy(instancedMesh: Loose, o?: { renderer?: Loose }): Loose;
  /** Frees the perCopy() / Props meshes under root once it's thrown away (a rebuilt level). */
  freeCopies(root: Loose): void;
  Props: new (scene: Loose, o?: { renderer?: Loose; shadows?: boolean }) => {
    /** A kind of prop. lod: distances where simpler shapes made for you take over, [[distance, geometry, material?], ...] for your own, 'auto' (levels made in the background, each copy drawn at the simplest one whose change can't be seen: the Next Gen, AR and Board views do this by themselves for a big enough kind with no lod) or false (every copy whole). */
    kind(name: string, geometry: Loose, material: Loose, o?: { lod?: (number | [number, Loose] | [number, Loose, Loose])[] | 'auto' | false; keep?: number[]; shadows?: boolean; shadowFar?: number; capacity?: number }): Loose;
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
  /**
   * Rock on the land: cliffs with ledges and overhangs where it is steep, caves cut through it, and rock of your own shape (arches, blocks) melted into it.
   * A height map has one height for each spot; this is real rock that folds over itself. Call it once the land has its shape and colours (after flatten()
   * and paint()), before meadow(), scatter() and solid(), in make(). Afterwards height() is the top of whatever is highest and floor() what a thing stands on.
   * Returns the group of rock meshes (on the land already); rocks(false) takes it away. docs/maker-kit.md "Cliffs, caves and overhangs".
   */
  rocks(o?: false | LandRocks): Loose;
  /** What land.rocks() made: its group and material (one stock material for all the rock: give it a look with gs.outdoors.looks.rock), how many triangles in how many pieces, and how long the number work took. null with no rock. */
  rock: { group: Loose; material: Loose; tris: number; pieces: number; ms: number; holes: Uint32Array; [k: string]: Loose } | null;
  /** What a thing at height y stands on at x, z: the highest ground or rock at or under y + reach (.6): a cave's floor, a ledge, the ground under an overhang. Feed it the thing's own last height each frame. Without rocks: height(x, z). */
  floor(x: number, y: number, z: number, reach?: number): number;
  /** The underside of what is over a point (Infinity: open sky). */
  roof(x: number, y: number, z: number): number;
  /** Does rock show at x, z, or has a cave taken the ground away there? (Grass and scattered things keep off it; marks are not taken there.) */
  rocky(x: number, z: number): boolean;
  /** How much daylight reaches a point: 1 in the open, .7 under an overhang, down to .1 deep in a cave (dim your fill light by it). */
  sky(x: number, y: number, z: number): number;
  /** Metres from `from` along the unit direction `dir` to the ground or the rock: { distance }, or null within max (100). So a Land can be the `level` of a gs.sound Ears or a gs.sky Weather. */
  ray(from: P3, dir: P3, max?: number): { distance: number } | null;
  /** The height map's own height at x, z, whatever rock stands there. */
  height0(x: number, z: number): number;
  update(dt: number, camera?: Loose): LandPart; dispose(): void;
}
/** What land.rocks() is asked for. */
export interface LandRocks {
  /**
   * Cliffs where the land is steep (true by default; false: none). steep: how steep the land must be, as land.slope() (.42); depth: how far the rock stands
   * out, x (1); beds: metres thick the layers of stone (1.8); ledge: metres a hard bed stands out past a soft one (1.1); lip: metres a bed leans out towards
   * its top, which is what overhangs (.7); rough (.45); cracks: the joints that run down the face (.5); area: [x0, z0, x1, z1] only here.
   */
  cliffs?: boolean | { steep?: number; depth?: number; beds?: number; ledge?: number; lip?: number; rough?: number; cracks?: number; area?: [number, number, number, number] };
  /** Tunnels: each along a path of [x, y, z, radius?] points (radius 2.5 m, rough .35). Open wherever the path comes out of the ground: the land's own squares are left out there. */
  caves?: { path: number[][]; radius?: number; rough?: number }[];
  /**
   * Rock of your own shape melted into the land: a box [wide, high, deep], a ball (radius), an arch [span, rise, thick, deep] or a tube along a path, at
   * [x, y, z] (its middle; an arch's feet), turned by `turn` radians. blend: metres over which it melts into what it touches (.6); rough (.3).
   * cut: true takes the shape out instead: a hollow, a notch, a pit.
   */
  shapes?: { box?: [number, number, number]; ball?: number; arch?: [number, number, number, number]; path?: number[][]; radius?: number; at?: [number, number, number]; turn?: number; round?: number; rough?: number; blend?: number; cut?: boolean }[];
  /** Metres a cell of the rock (.4: halve it and there are four times the triangles and the work; .6 to .8 for slower phones or far rock). */ cell?: number;
  seed?: number;
  /** rock and dark: the stone's two tints (beds differ between them); top: flat tops and where rock meets the ground (default: the land's own colour there); floor: a cave's. */
  colours?: { rock?: string; dark?: string; top?: string; floor?: string };
  /** Your own material for the rock instead of the plain one (the rock has positions, normals and vertex colours: no uvs). */
  material?: Loose;
}
export interface MarksOptions {
  /** The gs.outdoors Land it lies on (its sheets follow the land's own triangles, and its meadows part); or ground: (x, z) => height for ground of your own; neither: flat at y = 0. */
  land?: LandPart | null; ground?: ((x: number, z: number) => number) | null;
  /** A gs.sky.Weather made with the level: snow takes prints where it has settled, earth is soft where the rain has wet it, and fresh snow and rain take marks away. */
  weather?: WeatherPart | null;
  /** Where the ground is bare earth, and where it is sand: (x, z) => 0..1 (the same functions that paint your ground). */
  mud?: ((x: number, z: number) => number) | null; sand?: ((x: number, z: number) => number) | null;
  /** Where grass grows: (x, z) => 0..1; true (the default): wherever the land's meadows grow; false: nowhere, and no grass field is kept. */
  grass?: boolean | ((x: number, z: number) => number);
  /** Metres from the centre that prints are drawn (10). */ reach?: number;
  /** Metres a texel of the print picture (.025: a boot is eleven long; .04 is a third of the work). */ cell?: number;
  /** How many marks are remembered (4000: the oldest are forgotten). */ keep?: number;
  /** The bottom of a print and the rim round it, to match your ground: { snow: { floor, top }, mud: {...}, sand: {...} } (also edge, rim, rough). */
  colours?: Partial<Record<'snow' | 'mud' | 'sand', { floor?: string; top?: string; edge?: number; rim?: number; rough?: number; [k: string]: Loose }>>;
  /** How much fresh snow fills a print in (of a full cover: .3); seconds of rain that wash one out of mud (90); metres of wind that blow one out of sand (400). */
  fill?: number; wash?: number; blow?: number;
  /** Seconds a mark lasts whatever the weather (0: until it is filled in). */ last?: { snow?: number; mud?: number; sand?: number };
  /** Seconds trodden grass takes to stand again (40). */ mend?: number;
  /** A gs.outdoors Wind (the land's, if it has one), or { speed }. */ wind?: WindPart | { speed: number } | null;
  /** Metres the sheets lie above the ground (.02). */ above?: number;
  /** false draws nothing (the numbers and the grass only). */ sheet?: boolean;
  /** How many texels of prints are made again a frame as marks fill in or come into reach (20000). */ budget?: number;
  /** The grass field: { cells (128 a side), reach (12 metres from the centre), spring (how fast blades stand up again: 7) }. */ parting?: { cells?: number; reach?: number; spring?: number };
}
/** A mark as marks.made reports it this frame (for a sound, a puff of snow): where, in what, how deep (metres), who made it, and whether it is a wheel rolling. */
export interface MarkMade { x: number; z: number; kind: 'snow' | 'mud' | 'sand' | 'grass'; depth: number; by: Loose; rolling?: boolean }
/** What a watched thing leaves: see marks.watch(). */
export interface MarksWatch {
  /** 2, or 4 for an animal. */ feet?: number; /** A print's length and width, metres. */ size?: number; width?: number;
  shape?: 'boot' | 'bare' | 'paw' | 'hoof' | 'shoe' | 'round';
  /** Metres between its left and right prints, from one print to the next, and from front feet to back (four feet). */ gap?: number; pace?: number; long?: number;
  /** How hard it presses (1: a person). */ press?: number; tread?: 'tyre' | 'cleat' | 'rim' | 'smooth';
  /** How far round it the grass parts, metres (0: not at all), and how flat it leaves the grass it wades through (0..1: .6). */ radius?: number; trample?: number;
  /** What marks.trail() and marks.made call it (the thing itself). */ by?: Loose;
  /** Is it on the ground now? (default: within .3 m of it). */ grounded?: () => boolean; height?: number;
}
export interface MarksPart {
  /** What the ground at x, z is like now. kind null: firm ground that takes no mark. depth: metres a foot sinks in. */
  kindAt(x: number, z: number, out?: Loose): { kind: 'snow' | 'mud' | 'sand' | 'grass' | null; soft: number; depth: number; y: number };
  /** One print. turn: which way the foot points (radians round y, 0 towards +z; or dir: [x, z]); side: 1 a left foot, -1 a right one. Null on firm ground and on grass (which is trodden down instead). */
  step(x: number, z: number, o?: { turn?: number; dir?: [number, number]; size?: number; width?: number; shape?: 'boot' | 'bare' | 'paw' | 'hoof' | 'shoe' | 'round'; side?: number; press?: number; by?: Loose }): Loose | null;
  /** A round dent r metres from its middle to its edge: something fell here, or knelt. */
  press(x: number, z: number, r?: number, o?: { press?: number; by?: Loose }): Loose | null;
  /** A track that joins up: call it each frame with where the wheel (or sled, or dragged thing) is now, under a name of its own. lift(id) when it leaves the ground. */
  roll(id: Loose, x: number, z: number, o?: { width?: number; tread?: 'tyre' | 'cleat' | 'rim' | 'smooth'; press?: number; by?: Loose }): Loose | null;
  lift(id: Loose): void;
  /** Parts the grass within r metres of a point this frame, away from it (vx, vz: the way the thing there is moving). */
  push(x: number, z: number, r?: number, o?: { vx?: number; vz?: number; amount?: number }): void;
  /**
   * From now on this thing leaves marks by itself: a gs.models.human a boot print where each foot really comes down, a gs.models.vehicle a track behind each
   * wheel (a tank its two belts), anything else that moves (an Object3D, or { position }) prints paced out along its way; and the grass parts round it.
   */
  watch<T>(thing: T, o?: MarksWatch): T;
  unwatch(thing: Loose): void;
  /** Each frame, after the things that leave marks have moved. centre: where prints are drawn round (the camera). update(0, centre) makes everything in reach at once, before a cut. */
  update(dt: number, centre?: P3): MarksPart;
  /** The marks made this frame. */
  made: MarkMade[];
  /** How deep the ground is pressed at x, z, in metres (0: not at all, or out of reach of the centre). */
  at(x: number, z: number): number;
  /** The marks within r metres of a point, the newest first (a trail to follow, or to read). by: only this one's; newer: only those made in the last so many seconds; max: how many (24). */
  trail(x: number, z: number, r?: number, o?: { by?: Loose; newer?: number; max?: number }): { x: number; z: number; turn: number; kind: 'snow' | 'mud' | 'sand'; age: number; by: Loose; depth: number }[];
  /** How many marks are remembered, and how many tiles of them are being drawn. */
  readonly count: number; readonly drawn: number;
  /** The grass field (null with grass: false): at(x, z) => { x, z (which way it leans, 0..1 long), flat (0..1 trodden) }, busy. */
  grass: { at(x: number, z: number, out?: Loose): { x: number; z: number; flat: number }; readonly busy: boolean; texture: Loose; where: Loose; [k: string]: Loose } | null;
  /** Metres a tile of prints is across, and a texel of it. */
  size: number; cell: number;
  /** Takes every mark away and stands the grass up (in reset()); what is watched stays watched. */
  clear(): MarksPart;
  dispose(): void;
}
/** Something that landed in gs.outdoors.Water since the last update (water.splashes): where, how big across (metres) and how fast it hit (metres a second). */
export interface WaterSplash { x: number; y: number; z: number; size: number; speed: number }
/** What water.watch() returns: remove() stops the watching. wet: it is in the surface now. */
export interface WaterWatch { thing: Loose; radius: number; readonly wet: boolean; remove(): void }
export interface WaterOptions {
  level?: number; waves?: number | { height: number; length: number; dir?: number; speed?: number }[]; size?: number; segments?: number; colour?: string; opacity?: number; material?: Loose; seed?: number;
  /** Water you can disturb: true (or how many cells across: 128) makes the water within `reach` metres of the centre a ripple field for ring(), splash() and watch(). It is made by itself the first time something disturbs the water; ask for it here so nothing new is built in the middle of a round. */
  ripples?: boolean | number;
  /** Metres from the centre to the edge of the ripple field (24). */
  reach?: number;
  /** The ground under the water, (x, z) => its height (land.height): the shallows are paler and clearer, and foam laps the shore. */
  bed?: ((x: number, z: number) => number) | null;
  /** The shallows' colour (default: a paler, greener `colour`). */
  shallow?: string | null;
  /** Metres of water that hide the bed (2.5). */
  clear?: number;
  /** The foam's colour ('#f2f8fa'); false: no foam. */
  foam?: string | false;
  /** How many drops splashes and rain can throw at once (80). 0: no spray, and no rings from rain. */
  spray?: number;
}
export interface WaterPart {
  mesh: Loose; level: number; t: number;
  /** Rain falling on it, 0..1 (set it each frame from your weather): the water is duller, rings open where the drops land round the centre, and little drops hop back up. Works on any water, ripples or not. */
  rain: number;
  /** 1 while the camera of the view given to underwater() is below the surface (for your sound: gs.sound.mixer.muffle). */
  readonly under: number;
  /** What landed in the water since the last update: your splash() calls and watched things going in or leaping out. For your sound and score. */
  readonly splashes: WaterSplash[];
  /** True while ripples are moving. Calm water costs nothing more than its waves. */
  readonly busy: boolean;
  /** Water height at x, z now: the waves, and the ripples where there are any. */
  height(x: number, z: number, t?: number): number;
  /** The waves' height over the calm level at x, z (no ripples). */
  swellAt(x: number, z: number, t?: number): number;
  normal(x: number, z: number, t?: number): P3; depth(p: P3): number;
  /** Makes the ripple field now (see the `ripples` option). cells: how fine (128 a side); reach: metres from the centre to its edge; speed: how fast ripples travel (2.6 m/s). */
  ripples(o?: { cells?: number; reach?: number; speed?: number }): WaterPart;
  /** Something small dropped in at x, z: rings spread out. size: metres across it (.4); strength: 1. */
  ring(x: number, z: number, o?: { size?: number; strength?: number }): WaterPart;
  /** Something landed in the water at x, z: spray goes up, rings go out, a patch of foam is left, and it is listed in `splashes` for a frame. size: metres across it (1); speed: how fast it hit, metres a second (4). */
  splash(x: number, z: number, o?: { size?: number; speed?: number }): WaterPart;
  /**
   * Watches something that can be in the water (a mesh, a body, a boat: anything with a position, or x, y, z) and does the rest by itself: a splash when it lands or leaps out,
   * the water it pushes aside, rings and a wake behind it, a trail of foam when it is fast, spray off its bow. radius: half its width in the water (.5); bottom, top: how far
   * below and above its position it reaches (default: the radius each way; a person standing: bottom 0, top 1.8); foam, splash: 0 turns that off, or scales it.
   */
  watch(thing: Loose, o?: { radius?: number; bottom?: number; top?: number; foam?: number; splash?: number }): WaterWatch;
  unwatch(thing: Loose): WaterPart;
  /**
   * The look for a camera that goes under the surface: the view's air becomes murky, tinted water (darker the deeper it is), the surface can be seen from below, and it all
   * goes back to the game's own air on the way up. view: your HDView. colour: the water's colour down there; murk: how thick (.14: about 15 metres of view); dark: how fast it
   * darkens with depth (.06 a metre). Call water.update() after sky.update() and your own view.air().
   */
  underwater(view: Loose, o?: { colour?: string | null; murk?: number; dark?: number }): WaterPart;
  /** Calm again, for a new round: no ripples, foam, spray or rain rings. */
  calm(): WaterPart;
  update(dt: number, centre?: P3 | null): WaterPart; dispose(): void;
}
export interface WindPart {
  x: number; z: number; gust: number; gustSize: number; sway: number; grass: number; readonly speed: number; readonly angle: number;
  uniforms: { lkWind: { value: number }; lkWindDir: { value: Loose } };
  update(dt: number, at?: P3 | null): WindPart; at(x: number, z: number, out?: Loose): { x: number; z: number; speed: number; gust: number };
}
export interface OutdoorsPart {
  /** Terrain (THREE.Terrain): kind 'hills' | 'mountains' | 'rolling' | 'islands' | 'bumps' | 'dunes' | 'cracked' | 'ridges' | 'smooth', or (x, z) => height. */
  Land: new (o?: { kind?: string | ((x: number, z: number) => number); size?: number; segments?: number; low?: number; high?: number; seed?: number; smooth?: number; steps?: number; colours?: [number, string][]; material?: Loose; edge?: number }) => LandPart;
  /** Waves (a sum of sines) you can read anywhere: height, normal, depth. And water you can disturb: rings, splashes with spray and foam, wakes behind watched things, rain, shallows and shore foam over a `bed`, and the look from under the surface. */
  Water: new (o?: WaterOptions) => WaterPart;
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
    meadow(material: Loose, o?: { reach?: [number, number]; time?: number; bend?: number; dir?: Loose; /** A gs.outdoors.Marks' grass field (marks.grass): the blades lean away from what passes and lie flat where trodden. */ part?: Loose | null }): { uniforms: Record<string, { value: Loose }>; /** Gives the blades a Marks' grass field to read (null: none). On WebGPU before they are first drawn. */ part(field: Loose | null): void };
    /** Moving water for a River mesh (its lkFlow / lkDir attributes). */
    flow(material: Loose, o?: { deep?: string | number[]; shallow?: string | number[]; foam?: string | number[]; scale?: number; ripple?: number; froth?: number; time?: number | { value: number } }): { uniforms: Record<string, { value: Loose }> };
    /** Molten lava for a River mesh: glowing cracks, cooling crust. */
    lava(material: Loose, o?: { glow?: string | number[]; crust?: string | number[]; heat?: number; cool?: number; scale?: number; time?: number | { value: number }; length?: number }): { uniforms: Record<string, { value: Loose }> };
  };
  /** Draws a gs.flow river, waterfall or pool: moving water with foam, or lava (kind 'lava'), acid, mud. update(dt) each frame. */
  River: new (stream: Loose, o?: { step?: number; across?: number; lift?: number; look?: Loose; material?: Loose }) => { mesh: Loose; stream: Loose; look: { uniforms: Record<string, { value: Loose }> }; update(dt: number): Loose; dispose(): void };
  /** Draws a gs.flow Flood (and runs it on the graphics chip on WebGPU when given the view). update() each frame after flood.update(dt). */
  FloodWater: new (flood: FloodPart, o?: { view?: Loose; deep?: string; shallow?: string; opacity?: number; rough?: number; full?: number }) => { mesh: Loose; flood: FloodPart; update(): Loose; dispose(): void };
  /**
   * Ground that takes marks: feet leave prints and wheels leave tracks in snow (where a gs.sky.Weather with a level has let it settle), mud (bare earth the
   * rain has wet) and sand, and the land's meadow parts round whatever moves through it and stays trodden where it was walked on. Fresh snow fills prints in,
   * rain washes them out of mud, wind blows them out of sand. Make it in make() (before the meadow is first drawn), marks.watch(thing) what should leave marks,
   * marks.update(dt) each frame after they have moved, marks.clear() in reset(). view: the 3D view (null: the numbers alone). docs/nextgen-3d.md "Ground that takes marks".
   */
  Marks: new (view: Loose | null, o?: MarksOptions) => MarksPart;
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
  /** A material from a recipe: 'wood' | 'planks' | 'bark' | 'brick' | 'stone' | 'cobbles' | 'tiles' | 'concrete' | 'metal' | 'rust' | 'paint' | 'fabric' | 'leather' | 'marble' | 'dirt' | 'sand' | 'snow' | 'skin' (pores and fine lines). Options: the recipe's colours (colour, dark, mortar, gap, rust, deep, under, vein, grout), seed, repeat [u, v], size (texture pixels, 256), depth (parallax, WebGPU); WebGPU: closeUp (sharp detail near the camera, default on), solid (laid on by world position, metres per tile), scatter (no visible repeat). Others go to gs.hd.pbr. */
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
  /** A close-up building from a shape grammar: floors split into bays, each a real window opening (frame, glass set back, sill) or the door; string course, cornice, flat roof with parapet or gable roof; recipe materials, aged. style 'brick' | 'plaster' | 'concrete' | 'stone' | 'timber' (or an object like gs.models.buildings' own), w, d (metres, 8 x 6), floors (2), roof 'flat' | 'gable', floor (storey height), bay (metres per window), win [w, h], lit (0..1 of windows glowing), colour (walls), door (false: none), seed, wear, materials (your own three.js materials in place of the style's). A Group centred on x/z, foot at y = 0, door facing +z. One that comes apart: gs.destruction.Structure. */
  building(o?: BuildingOptions): Loose;
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
   * Returns a Group with rig, bones, mesh, lods, lod (0 close .. 2 far), see(camera, screenHeightPx), twin() (another of the same person, nearly free), hold(thing, rightPoint, leftPoint) (both hands onto a thing: after rig.update()), touch({ handL, handR, footL, footR }, { blend, elbows, knees, palms, level, round }) (hands and feet onto points in the world, after rig.update(): a rung, a bar, a ledge; a hand's grip or palm and the ball of a foot land on the point; palms: { L: [x, y, z] } the way a palm faces; level: 0..1 the sole held flat; elbows and knees: the way they point; blend: 0..1 or one for each; round: the radius of the bar a hand closes its fingers round, metres, or { L, R }), gear (gear.hat.visible = false; gear.hat.loose(): a loose copy, a plain mesh), fingers({ L: 0..1, R: [thumb, index, middle, ring, little] }) (how far each hand is closed: 0 flat, 1 a fist, null as sculpted; they stay as set until 'auto' gives a hand back: left to themselves hands lie relaxed, and close round what hold() or touch() puts them on, each finger until it meets it), face.
   * The skeleton: the joints poses turn (hips, spine (the rib cage), head, armL/R, foreL/R, handL/R, legL/R, shinL/R, footL/R) and, between them, a waist, a neck, a collar bone to each arm, the turn along each forearm, toes and three joints a finger, which the rig sets by itself (rig.fill() after turning joints yourself). Further off the small ones stand still and cost nothing.
   * A cut of clothes this phone hasn't sculpted yet takes a second or two in the background: the app shows "Loading…" and makes the game again (make people in make() or reset()); it is then saved. Several kinds: human.all([...]) first thing.
   * A painted face and combed hair, with no texture files: brows, lashes, the line of the lids and the lips are painted in a small picture the engine makes itself for each look, and the hair is a clean sculpted shape with a crisp hairline and combed strands in a second picture, laid round the head from the crown. Nothing to set, and the same on WebGL and WebGPU.
   * Strands that stand up: close up, layers of strands (gs.models.fur) lie over a moustache and a beard (beard: 0..1.5 how long, true = .6; painted stubble stays as it is; with look 'real' they are single hairs in the head's mesh instead, and wear no coat), and over the hair of the head when asked for (strands: true, streaming from the crown, or from the bun for hair tied back). person.hair is that coat (null: no beard or moustache and no strands asked for, under a hat (the hair there stays as sculpted), strands: false, or the slowest phones); strands: { length (metres), layers, lean, tile } asks for them on the head too and tunes them.
   * A live face: person.face (a LiveFaceT) blinks and moves its eyes by itself close up, with nothing to call; face.look(point) puts the eyes on something, face.say(text) speaks a line and moves the mouth to it, face.set('smile' | 'frown' | 'surprise' | 'sad' | 'angry' | 'squint' | ..., 0..1) eases an expression in, face.wince() is a flinch, and the eyes of someone lying on the ground close (face.awake = true keeps them open).
   * Two looks (look): 'clean' (the default: a simpler, friendlier face, the way a good character model is) and 'real' (a head the shape of a real one, fitted to a real head scan by measurement; skin
   * a real skin's colour, redder on the lids, nose, cheeks and ears; life-size eyes, a jaw as broad as a real one, the folds and
   * hollows of a real face pressed into its skin, its two sides not quite alike, quieter brows, lashes and lips, and skin that works out the light under it on WebGPU: a soft warm edge where it turns from the light, a two-lobe shine; skin with fine lines that come with age, freckles, moles and an oily T-zone; wet, deep eyes close up: an iris set back under a clear cornea, a film of tears, real lashes that blink with the lids; brows of single hairs, hair with a shine across its strands, a beard down to a real neckline that thins out at its edges, a moustache grown from the lip). A real person's face comes from seed (the same seed, the same face on every phone; with no skin, hair or iris
   * given, those come from the seed too), age (years, 16..95: older, the folds deepen, the lips thin, the lids hood and the hair greys) and weight (0 thin .. 1 heavy).
   * A real person's body comes from the same seed, age and weight, and muscle (0 slight .. 1 built): broader shoulders and thicker arms with muscle, a thicker waist and
   * belly with weight and age, a woman's hips and bust from her weight, and a height a few centimetres either way (build and scale, when given, win).
   * The body lives: biceps swell as an elbow bends (more on a muscled arm), elbows, shoulders, hips and knees keep their girth in a deep bend, and person.breath (a BreathT)
   * breathes the chest and belly and lets a heavy belly settle behind a stride, by itself.
   * Options: look, seed, age, weight, muscle, sex, build, girth, scale, skin, hair, hairStyle, iris, lips, moustache, stubble, beard, strands, face ({ jaw, chin, brow, nose, lips, cheeks, eyes }), hands ('open' | 'grip'), outfit ({ top, legs, feet, hat, belt, webbing, gloves, pack, extras }; camo: [colour, colour] on top, legs or hat brushes blotches over its colour), gear, slots, now (sculpt on the spot: tools). The plain options (body, legs, shoes: colours) still dress a simple person.
   */
  human: {
    (o?: { look?: 'clean' | 'real'; seed?: number | string; age?: number; weight?: number; muscle?: number; sex?: 'm' | 'f'; build?: Record<string, number>; girth?: number; scale?: number; shadows?: boolean; skin?: string; hair?: string | null; hairStyle?: 'short' | 'long' | 'bun' | 'bald'; eyes?: string; iris?: string; lips?: string; moustache?: boolean; stubble?: number; beard?: number | boolean; strands?: boolean | Pick<FurOptions, 'length' | 'layers' | 'lean' | 'tile' | 'rough' | 'root' | 'tip' | 'seed' | 'auto'>; jaw?: number; nose?: number; face?: Record<string, number>; hands?: 'open' | 'grip'; body?: string; legs?: string; shoes?: string; sleeves?: 'long' | 'short'; outfit?: Record<string, Loose>; gear?: Loose[]; slots?: Record<string, Loose>; now?: boolean }): Loose;
    /** Several people at once, in the same order: everything that still needs sculpting is started together, so the app waits once. */
    all(list: Loose[]): Loose[];
    /** Starts sculpting whatever these people still need and makes the app wait if anything does; nothing otherwise. First thing in make(), before anything costly. */
    need(list: Loose[]): void;
    /** The 51 single movements a person's face can be set to, face.set(move, 0..1): face capture's own, by ARKit's names. */
    readonly moves: readonly FaceMove[];
    /** For tools and tests: resolves once human(options) for each of these would come straight back. */
    ready(list: Loose | Loose[]): Promise<boolean>;
    /** Forgets every saved sculpt. */
    clear(): Promise<void>;
  };
  /**
   * Fur or hair on any mesh, in layers: copies of the surface pushed out along its normals, each cut by one picture of strands made in code, so strands seem to stand in the coat. three.js's own materials (a map with an alpha cut, vertex colours, two morph targets the layers share), so WebGL and WebGPU draw it alike, skinned or not.
   * The mesh's vertex colours colour the coat. It thins out with distance by itself (every layer, every other one, none). Creatures and people use it by themselves: creature({ fur }) and human({ strands, beard }).
   * Each layer is one more draw of the furry triangles, lit like everything else: keep a coat to what is seen close, and `layers` low (5 to 10).
   */
  fur: {
    (mesh: Loose, o?: FurOptions): FurCoat;
    /** The geometry a coat's layers share, by itself (hand it to several coats as `shell`). */
    shell(geometry: Loose, o?: FurOptions): Loose;
    /** The picture of strands for a kind and seed: a texture whose alpha is each strand's height and whose colour is its shade. */
    strands(kind?: 'fur' | 'hair', seed?: number): Loose;
    /** How many layers a coat gets on this phone unless it is told (0 on the slowest). */
    layers(): number;
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
  /**
   * A vehicle made in code (no model or texture files): a shell skinned over cross-sections from a few measures, in paint, glass, chrome and rubber, aged, with the parts that turn on their own pivots.
   * kind: 'car' (saloon, hatch, estate, sports, van, pickup, jeep), 'truck' (flat, canvas, box, tanker), 'tank' (medium, light, heavy), 'train' (steam, diesel; wagons van, open, flat, tanker, guard, coach), 'boat' (rowboat, motor, fishing, patrol), 'plane' (prop, biplane, twin, jet).
   * Its nose points along -z, as gs.vehicles, gs.craft and World3D.vehicle push things. Each frame: move(dt, speed, { steer }) (wheels roll and steer, the body rocks on its springs, tracks run, propellers spin); or roll(d), steer(a), aim(turn, lift) yourself.
   * Physics: world.vehicle(car, car.chassis({ power: 14 })) for a car or a truck; a boat rides a gs.craft.Boat or Floater, a plane a gs.craft.Plane (the vehicle is only the look).
   * A train: vehicle('train', { style: 'steam', cars: ['van', { style: 'open', load: 'coal' }, 'guard'] }) is the whole train; along(track, d) lays it on your rails, or fuse: true makes one that keeps to a straight line in a third of the draws.
   * 3,000 to 21,000 triangles and 4 to 24 draws each; made in about a tenth of a second or less on a desktop, and the same vehicle asked for again is a copy that shares its shapes and materials. Make them in make().
   */
  vehicle: {
    (kind: 'train', o?: VehicleOptions): TrainT;
    (kind?: 'car' | 'truck' | 'tank' | 'boat' | 'plane', o?: VehicleOptions): VehicleT;
    /** Every kind and its styles: { car: ['saloon', ...], truck: [...], tank, train, boat, plane }. */
    readonly kinds: Readonly<Record<string, readonly string[]>>;
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
  board: BoardPart; battle: BattlePart; stats: StatsPart; gen: GenPart; drag: DragPart; idle: IdlePart; history: HistoryPart; items: ItemsPart; adventure: AdventurePart; hex: HexPart; rts: RtsPart; fight: FightPart; bullets: BulletsPart; sand: SandPart; flow: FlowPart; art: ArtPart; sports: SportsPart; party: PartyPart; rhythm: RhythmPart; strokes: StrokesPart; vehicles: VehiclesPart; paths: PathsPart; bones: BonesPart;
  level3d: Level3dPart; sky: SkyPart;
  combat: CombatPart; tactics: TacticsPart; climb: ClimbPart; missions: MissionsPart; cutscene: CutscenePart; prompts: PromptsPart;
  stealth: StealthPart; gadgets: GadgetsPart; campaign: CampaignPart; arena: ArenaPart; poses: PosesPart; destruction: DestructionPart; props: PropsPart;
  outdoors: OutdoorsPart; city: CityPart; models: ModelsPart; voxels: VoxelsPart; fluid: FluidPart; gas: GasPart; regions: RegionsPart; craft: CraftPart; soft: SoftPart; cards: CardsPart; dice: DicePart; words: WordsPart; trivia: TriviaPart; ui: UIPart;
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
