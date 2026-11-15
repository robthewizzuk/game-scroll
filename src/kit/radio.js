// A car radio: stations of original music written by compose(), each with a made-up DJ who talks
// between songs through say(), station idents, silly made-up adverts and local news the game feeds in.
// Every station keeps playing while you listen to another one, so switching back finds it further on,
// half way through a song, as a real radio does. Inside the car it sounds like car speakers; with the
// door open or from the pavement it is muffled and quieter, and it fades as you walk away.
//
//   const { Radio } = gs.sound;
//   make() { radio = new Radio(); }                      // five stations of its own (or your own: below)
//   update(dt) { radio.update(dt); }                     // nothing plays until a station is on
//   get in the car: radio.on()   swipe the dial: radio.next() / radio.prev() / radio.tune('Owl Hours')
//   get out: radio.listen({ inside: false, distance: 3 })   back in: radio.listen({ inside: true })
//   a police chase: radio.news('a police chase is heading over the harbour bridge', { urgent: true })
//   draw: radio.now -> { station, freq, dj, kind: 'song' | 'talk', song: { title, artist }, line, left }
//
// The DJ's lines are written from templates (the song, the time of day from a gs.sky Sky and the weather
// from a Weather, found by themselves: see links.js). With the phone's own AI (gs.phoneai) they can be new
// each time: new Radio({ ai: new PhoneAI({ persona: 'a radio DJ', words: 24 }) }); every line still has a
// written one to fall back on, and play never waits for it. All of the music, names, DJs and adverts are
// made up. It plays on the music channel, so the player's Sound settings (sound, volume, music) rule it;
// with music off, the DJs are quiet too.
import { compose } from './compose.js';
import { music, say, talking, stopTalking, tone, noise, kitBus } from './sound.js';
import { audio, sound } from '../sfx.js';
import { rng } from './math.js';
import { linksFor } from './links.js';
import { own } from './cleanup.js';

// ---- the stations that come with it (all made up)
export const STATIONS = [
  { name: 'Kerbside 88', freq: '88.1', mood: 'happy', set: 'synth', tagline: 'Hits for the road.', talk: .8,
    dj: { name: 'Dee Luxe', voice: 'woman', take: 0, pitch: 1.06, rate: 1.06, persona: 'a bubbly, upbeat pop DJ', sign: ['Keep it sunny, drivers.', 'Windows down, volume up.'] } },
  { name: 'Owl Hours', freq: '92.4', mood: 'calm', set: 'band', voices: { lead: 'epiano' }, tagline: 'Slow songs for long roads.', talk: .6,
    dj: { name: 'Marlow Quill', voice: 'man', take: 0, pitch: .9, rate: .9, persona: 'a calm, velvet-voiced late-night DJ', sign: ['Easy does it.', 'Mind how you go.'] } },
  { name: 'Redline 104', freq: '104.7', mood: 'chase', set: 'synth', tagline: 'Fast music. Faster cars.', talk: .7,
    dj: { name: 'Volt', voice: 'man', take: 1, pitch: 1.1, rate: 1.12, persona: 'a hyped, fast-talking dance DJ', sign: ['Foot down!', 'No brakes on this one.'] } },
  { name: 'Gilded 97', freq: '97.3', mood: 'heroic', set: 'orchestra', tagline: 'The grand sound of the city.', talk: .5,
    dj: { name: 'Hesper Vane', voice: 'woman', take: 1, pitch: .96, rate: .94, persona: 'a grand, slightly posh classical presenter', sign: ['Simply splendid.', 'Do sit back.'] } },
  { name: 'Honk 101', freq: '101.1', mood: 'silly', set: 'chip', tagline: 'Beep beep, it\'s Honk!', talk: 1,
    dj: { name: 'Bonnie Klaxon', voice: 'woman', take: 2, pitch: 1.18, rate: 1.1, persona: 'a giggly, silly cartoon DJ who loves car horns', sign: ['Honk if you love it!', 'Toot toot!'] } },
];

// ---- made-up songs, artists and adverts
const ADJ = ['Neon', 'Paper', 'Velvet', 'Midnight', 'Sugar', 'Static', 'Golden', 'Rusty', 'Silver', 'Lazy', 'Lucky', 'Copper', 'Hollow', 'Glass', 'Sunday', 'Rainy', 'Faraway', 'Tiny', 'Restless', 'Crooked', 'Second-hand', 'Orange', 'Sleepy', 'Brave'];
const NOUN = ['Puddles', 'Streetlights', 'Postcards', 'Satellites', 'Engines', 'Harbours', 'Kites', 'Taxis', 'Pigeons', 'Rooftops', 'Lanterns', 'Echoes', 'Bridges', 'Pockets', 'Daydreams', 'Comets', 'Umbrellas', 'Jukeboxes', 'Raincoats', 'Seagulls', 'Mopeds', 'Fireflies', 'Toasters', 'Billboards'];
const PLACE = ['the Ring Road', 'Harbour Lane', 'the Night Bus', 'the Top Floor', 'Exit Nine', 'the Car Wash', 'the Overpass', 'Platform Two', 'the Laundrette'];
const FIRST = ['Juno', 'Rico', 'Tamsin', 'Otis', 'Vela', 'Bram', 'Nell', 'Cass', 'Idris', 'Mabel', 'Ziggy', 'Rosa', 'Teo', 'Wren', 'Lux', 'Fenna'];
const LAST = ['Pell', 'Fenwick', 'Starling', 'Moss', 'Quaye', 'Hollis', 'Crane', 'Odell', 'Brightwater', 'Kettle', 'Lowe', 'Marsh', 'Tully', 'Vance'];
const TITLES = [
  r => `${r.pick(ADJ)} ${r.pick(NOUN)}`, r => `${r.pick(NOUN)} in the Rain`, r => `Back Seat ${r.pick(NOUN)}`,
  r => `Down on ${r.pick(PLACE)}`, r => `Meet Me at ${r.pick(PLACE)}`, r => `${r.pick(ADJ)} Heart`, r => `All My ${r.pick(NOUN)}`,
  r => `Drive Me ${r.pick(['Home', 'Slowly', 'Anywhere', 'Round Again'])}`, r => `${r.pick(ADJ)} ${r.pick(['Avenue', 'Summer', 'Weekend', 'Morning', 'Signal'])}`,
];
const ARTISTS = [
  r => `${r.pick(FIRST)} ${r.pick(LAST)}`, r => `The ${r.pick(ADJ)} ${r.pick(NOUN)}`, r => `${r.pick(FIRST)} and the ${r.pick(NOUN)}`,
  r => `${r.pick(NOUN)} Club`, r => `DJ ${r.pick(FIRST)}`,
];
export const ADVERTS = [
  'Tired of soggy socks? Puddle-Proof Boots from Wellbeck\'s. Your toes will thank you.',
  'Grandma Pim\'s Pickle Pies. Weird? Yes. Wonderful? Also yes.',
  'Is your car feeling grumpy? Bring it to Sprocket and Daughters. We speak fluent engine.',
  'Kite Corner, down by the harbour. Fly high, land gently.',
  'Snooze Cloud pillows. So soft you will miss your stop. Please do not miss your stop.',
  'Bubbleworks Car Wash. We scrub, we rinse, we hum along.',
  'Hungry? Noodle Rocket brings hot noodles faster than you can say noodle rocket.',
  'Lost your keys again? Call Keyfinder Kev. He usually finds them in the fridge.',
  'Plinko\'s Pet Hats. Because your hamster deserves a tiny bowler.',
  'Tumbletop Trampolines. Bounce responsibly.',
];
const LOCAL = [   // news on a quiet day, when the game has none of its own
  'traffic is moving nicely over the harbour bridge',
  'a runaway shopping trolley was seen rolling down Market Hill',
  'the clock tower is five minutes fast again',
  'roadworks on the ring road, so leave a little early',
  'a very large goose is holding up traffic by the park',
  'the night market opens late tonight',
];
// what the DJs say: {slots} filled from the moment. Every one is written to work without the phone's AI.
const SAY = {
  intro: [
    'That was {prev} by {prevArtist}. Next up, {artist} with {song}.',
    'You\'re listening to {station}. Here\'s {song} by {artist}.',
    '{greeting}, it\'s {dj} on {station}. Turning it up for {song}.',
    'Here\'s one for everyone stuck at the lights. {artist}, {song}.',
    '{prev}, lovely. Now, {artist} with {song}.',
    'Coming up on {station}: {song}, by {artist}.',
  ],
  first: ['{greeting}, you\'re with {dj} on {station}. Here\'s {song} by {artist}.', '{station}, {tagline} Let\'s go with {artist}, {song}.'],
  ident: ['{station}. {tagline}', 'You\'re tuned to {station}.', '{freq}, {station}.'],
  news: ['Traffic and travel: {news}.', 'Reports coming in: {news}.', 'News on the hour: {news}.', 'A quick one from the travel desk: {news}.'],
  urgent: ['Breaking news: {news}! Stay safe out there.', 'Sorry to cut in, listeners: {news}!'],
  weather: { rain: ['Wipers on, it\'s wet out there.', 'Rain on the windscreen tonight.'], storm: ['Thunder about, so take it steady.'], snow: ['Snow on the roads, so nice and slow.'], clear: [] },
  ad: ['And now a word from our sponsors.', 'After this, more music.'],
};
const GREET = h => h >= 5 && h < 12 ? 'Good morning' : h < 17 && h >= 12 ? 'Good afternoon' : h < 22 && h >= 17 ? 'Good evening' : 'Hello, night owls';
const fill = (t, f) => t.replace(/\{(\w+)\}/g, (_, k) => f[k] ?? '').replace(/\s+([.,!?])/g, '$1').replace(/\s+/g, ' ').trim();
const talkTime = text => .6 + text.length * .065;   // about how long a line takes, said at an ordinary pace

/** A made-up song: title, artist, the tune's seed and how long it plays. */
function songOf(st, r, n) {
  const seed = `${st.seed}|song${n}`, tune = compose({ mood: st.mood, seed, bars: 8 }), loop = tune.tempo ? 8 * 8 * 60 / tune.tempo / 2 : 16;
  return { title: r.pick(TITLES)(r), artist: r.pick(ARTISTS)(r), seed, tune, loops: r.int(4, 5), loop, get len() { return this.loops * this.loop; } };
}

export class Radio {
  /**
   * stations: your own list ({ name, freq, mood, set, voices, tagline, talk (0..1, how chatty), dj: { name,
   * voice: 'woman' | 'man', take, pitch, rate, persona, sign: [catch phrases] } }), or leave it for the five
   * that come with it. seed: a different seed, different songs. ai: a gs.phoneai PhoneAI (or anything with
   * ask(prompt, { fallback })) to write the DJs' lines. on: start with a station playing (false: off).
   * sky / weather: found by themselves (false: none). volume 0..1.
   */
  constructor({ stations = STATIONS, seed = 'radio', ai = null, on = false, station = 0, volume = 1, sky = null, weather = null, link = true } = {}) {
    this.ai = ai; this.volume = volume; this.power = !!on;
    this.inside = 1; this.distance = 0; this.held = false; this.heldAt = 0;
    this.links = linksFor(null, link); this.links?.join('radio', this);
    this.given = { sky, weather };
    this.track = null; this.bed = null; this.chain = null; this.switching = 0; this.saying = 0; this.gen = 0; this.line = null; this.readUntil = 0;
    this.stations = stations.map((s, i) => ({ talk: .7, ...s, seed: `${seed}|${s.name}|${i}`, dj: { voice: 'woman', take: 0, pitch: 1, rate: 1, persona: 'a friendly radio DJ', sign: [], ...(s.dj || {}) } }));
    this.index = Math.max(0, Math.min(this.stations.length - 1, station | 0));
    for (const st of this.stations) this.prime(st);
    own(this);
  }
  // ---- a station's own clock: a song, a break, a song... each made one step ahead
  prime(st) {
    st.r = rng(st.seed); st.n = 0; st.breaks = 0; st.prev = null; st.seg = null;
    st.after = this.makeSong(st);
    this.advance(st).t = st.r.range(0, st.seg.len * .8);   // each starts somewhere along its first song, so they aren't in step
  }
  makeSong(st) { const s = songOf(st, st.r, st.n++); return { kind: 'song', song: s, len: s.len, t: 0 }; }
  /** The break after `prev` that leads into `next`: an intro, sometimes the weather, an advert, the news or an ident first. */
  makeBreak(st, prev, next, first = null) {
    const r = st.r, parts = first ? [...first] : [], b = ++st.breaks, waiting = st.news?.splice(0) || [];
    parts.push(...waiting);
    if (!first && !waiting.length) {
      if (b % 3 === 0 && r() < .85) parts.push({ who: 'ad', text: r.pick(ADVERTS) });
      if (b % 4 === 2 && r() < st.talk) parts.push({ who: 'dj', kind: 'news', news: r.pick(LOCAL) });
      else if (r() < .2) parts.push({ who: 'dj', kind: 'ident' });
    }
    parts.push({ who: 'dj', kind: prev ? 'intro' : 'first', weather: r() < .35 * st.talk, sign: r() < .3 * st.talk });
    const seg = { kind: 'talk', parts, next, prev, len: 0, t: 0 };
    this.write(st, seg);
    return seg;
  }
  /** Moves a station on to its next segment; returns it. */
  advance(st) {
    if (st.seg?.kind === 'song') st.prev = st.seg.song;
    st.seg = st.after || this.makeSong(st); st.seg.t = 0;
    st.after = st.seg.kind === 'song' ? this.makeBreak(st, st.seg.song, this.makeSong(st)) : st.seg.next;
    if (st.after.kind === 'talk' && st === this.station && this.power) this.ask(st, st.after);
    return st.seg;
  }
  // ---- the DJ's lines
  facts(st, seg, part) {
    const sky = this.sky, w = this.weather, h = sky ? sky.time : 12, nx = seg.next?.song, pv = seg.prev;
    return { station: st.name, freq: st.freq ? `${st.freq} FM` : '', tagline: st.tagline || '', dj: st.dj.name, greeting: GREET(h),
      song: nx?.title, artist: nx?.artist, prev: pv?.title, prevArtist: pv?.artist, news: part.news, hour: h,
      weather: w && (w.amount ?? 1) > .15 && w.kind ? w.kind : 'clear' };
  }
  written(st, seg, part) {
    if (part.who === 'ad') return part.text;
    const r = st.r, f = this.facts(st, seg, part);
    if (part.kind === 'news') return fill(r.pick(part.urgent ? SAY.urgent : SAY.news), f);
    if (part.kind === 'ident') return fill(r.pick(SAY.ident), f);
    let t = fill(r.pick(SAY[part.kind] || SAY.intro), f);
    const wx = SAY.weather[f.weather] || [];
    if (part.weather && wx.length) t = r.pick(wx) + ' ' + t;
    if (part.sign && st.dj.sign?.length) t += ' ' + r.pick(st.dj.sign);
    return t;
  }
  /** Writes a break's lines from the templates. */
  write(st, seg) {
    for (const p of seg.parts) if (!p.said) p.line = this.written(st, seg, p);
    seg.len = seg.parts.reduce((a, p) => a + talkTime(p.line) + .4, .5);
  }
  /** Asks the phone's AI for fresher lines for a break on the station being listened to (each keeps its written line until an answer comes). */
  ask(st, seg) {
    if (!this.ai?.ask || seg.asked) return;
    seg.asked = true;
    for (const p of seg.parts) {
      if (p.who !== 'dj' || p.said) continue;
      const f = this.facts(st, seg, p), when = f.greeting === 'Hello, night owls' ? 'night' : f.greeting.slice(5).toLowerCase();
      const what = p.kind === 'news' ? `read this local news in your own words: ${f.news}` : p.kind === 'ident' ? 'say the station name and its slogan'
        : f.song ? `introduce the next song, "${f.song}" by ${f.artist}${f.prev ? `, after "${f.prev}"` : ''}` : 'say hello to the listeners';
      const prompt = `You are ${st.dj.name}, ${st.dj.persona}, on ${st.name}, a made-up radio station in a city driving game. It is ${when}${f.weather !== 'clear' ? ` and the weather is ${f.weather}` : ''}. In one or two short spoken sentences, ${what}. Keep the names exactly as written.`;
      try { Promise.resolve(this.ai.ask(prompt, { fallback: p.line })).then(t => { if (typeof t === 'string' && t.trim() && !p.said) p.line = t.trim(); }, () => {}); } catch { /* the written line stays */ }
    }
  }
  get sky() { const g = this.given.sky; return g === false ? null : g || this.links?.one('sky') || null; }
  get weather() { const g = this.given.weather; return g === false ? null : g || this.links?.one('weather') || null; }

  // ---- what the player does
  get station() { return this.stations[this.index]; }
  /** Turns the radio on (at the station it was on). */
  on() { if (!this.power) { this.power = true; this.switched(); } return this; }
  /** Turns it off: the stations carry on without you. */
  off() { if (this.power) { this.power = false; this.quiet(); } return this; }
  toggle() { return this.power ? this.off() : this.on(); }
  /** Goes to a station: its number, or its name or frequency. Turns the radio on. */
  tune(which) {
    const n = this.stations.length, i = typeof which === 'number' ? which : this.stations.findIndex(s => s.name === which || s.freq === which);
    if (i < 0 || !n) return this;
    const to = ((i % n) + n) % n, same = this.power && to === this.index;
    this.index = to; this.power = true;
    if (!same) this.switched();
    return this;
  }
  next() { return this.tune(this.index + 1); }
  prev() { return this.tune(this.index - 1); }
  /**
   * Where the player hears it from. inside: true in the car (car speakers), false outside it (muffled
   * through the body), or 0..1 between (a door open: .6). distance: metres from the car (it fades, the DJ
   * can't be made out past 8 m, and it's silent past 30 m).
   */
  listen({ inside = true, distance = 0 } = {}) { this.inside = inside === true ? 1 : inside === false ? 0 : Math.max(0, Math.min(1, +inside || 0)); this.distance = Math.max(0, +distance || 0); return this; }
  /** News from the game (a chase, a crash, a robbery): every station reads it at its next break, or now with urgent: true. */
  news(text, { urgent = false } = {}) {
    text = String(text || '').replace(/[.!?\s]+$/, '').slice(0, 160); if (!text) return this;
    const item = { who: 'dj', kind: 'news', news: text, urgent };
    for (const st of this.stations) {
      if (urgent) {   // breaks in now, over the song
        const cur = st.seg, next = cur.kind === 'song' ? this.makeSong(st) : cur.next;
        if (cur.kind === 'song') st.prev = cur.song;
        st.seg = this.makeBreak(st, st.prev, next, [{ ...item }]); st.after = next;
        if (st === this.station && this.power) this.ask(st, st.seg);
        continue;
      }
      const brk = st.seg.kind === 'talk' && !st.seg.parts.some(p => p.said) ? st.seg : st.after?.kind === 'talk' ? st.after : null;
      if (!brk) { (st.news ||= []).push({ ...item }); if (st.news.length > 3) st.news.shift(); continue; }   // (the break after next takes it)
      brk.parts = brk.parts.filter(p => p.kind !== 'news' || p.urgent || !LOCAL.includes(p.news));   // the game's news, not a quiet day's
      brk.parts.splice(brk.parts.findIndex(p => p.kind === 'intro' || p.kind === 'first'), 0, { ...item }); this.write(st, brk); brk.asked = false;
      if (st === this.station && this.power && brk === st.after) this.ask(st, brk);
    }
    if (urgent && this.power) this.switched(true);
    return this;
  }
  /** Holds the radio down (the phone ringing, a cutscene): true quietens it and the DJ waits, false lets it go. */
  hold(on = true) { this.held = !!on; return this; }

  /** What's on, for the dial on screen. */
  get now() {
    const st = this.station, seg = st.seg, nx = seg.kind === 'talk' ? seg.next?.song : null;
    return { on: this.power, index: this.index, station: st.name, freq: st.freq || '', dj: st.dj.name, kind: seg.kind,
      song: seg.kind === 'song' ? { title: seg.song.title, artist: seg.song.artist } : nx ? { title: nx.title, artist: nx.artist, next: true } : null,
      line: this.power && this.line ? this.line : null, left: Math.max(0, seg.len - seg.t), switching: this.switching > 0 };
  }

  // ---- each frame
  update(dt) {
    dt = Math.min(Math.max(0, dt || 0), 1);
    for (const st of this.stations) {
      const live = this.power && st === this.station;
      st.seg.t += dt;
      // a break on air lasts as long as the DJ takes: it ends when they're done (talk() marks it)
      if (live && st.seg.kind === 'talk' && !st.seg.over && this.switching <= 0) continue;
      for (let k = 0; (st.seg.over || st.seg.t >= st.seg.len) && k < 50; k++) {
        const over = st.seg.over ? 0 : st.seg.t - st.seg.len; this.advance(st).t = over;
        if (live) this.changed = true;
      }
    }
    this.heldAt += ((this.held ? 1 : 0) - this.heldAt) * Math.min(1, dt * 6);
    this.switching = Math.max(0, this.switching - dt);
    if (this.power) this.play();
    return this;
  }
  /** How loud it is where the player is (0..1), before the player's own volume. */
  get level() {
    const d = this.distance, fall = d <= 1 ? 1 : d >= 30 ? 0 : 1 / (1 + (d - 1) * .35);
    return this.volume * fall * (.35 + .65 * this.inside) * (1 - .8 * this.heldAt);
  }
  // the speakers: a little thin (car speakers), muffled by the body from outside, then the level
  speakers() {
    const a = audio(); if (!a) return null;
    if (this.chain && this.chain.ctx === a.ctx) return this.chain;
    const ctx = a.ctx, input = ctx.createGain(), low = ctx.createBiquadFilter(), body = ctx.createBiquadFilter(), gain = ctx.createGain();
    low.type = 'highpass'; low.frequency.value = 90; body.type = 'lowpass'; body.frequency.value = 9000; body.Q.value = .5; gain.gain.value = 0;
    input.connect(low); low.connect(body); body.connect(gain); gain.connect(kitBus('music'));
    return this.chain = { ctx, input, low, body, gain };
  }
  /** The cut-off of the car body (Hz): wide open inside, about 650 Hz from the pavement. */
  get muffle() { return 650 * Math.pow(9000 / 650, this.inside) / (1 + this.distance * .04); }
  play() {
    const ch = this.speakers(), st = this.station, seg = st.seg;
    if (ch) { const t = ch.ctx.currentTime; ch.gain.gain.setTargetAtTime(this.level, t, .08); ch.body.frequency.setTargetAtTime(this.muffle, t, .08); }
    if (this.switching > 0) return;
    if (this.changed) { this.changed = false; this.quiet(true); }
    if (seg.kind === 'song') {
      const s = seg.song;
      if (this.bed) { this.bed.stop(); this.bed = null; }
      if (!this.track || this.track.song !== s || !this.track.m.playing) {
        if (this.track && this.track.song !== s) this.stopTune();
        const m = this.track ? this.track.m : music({ ...s.tune, set: st.set || 'chip', voices: st.voices || null, out: ch?.input || null, vol: .9 });
        this.track = { song: s, m }; m.start(Math.floor(seg.t / m.stepTime) % m.length);
      }
      // a song's shape: half a loop of intro without the tune, then the layers come and go, and the tune drops out at the end
      const loop = Math.floor(seg.t / s.loop), plan = [.15, .5, .95, .35, 1];
      const lead = (loop === 0 && seg.t < s.loop * .5) || seg.len - seg.t < 2 ? 0 : 1;
      this.track.m.layer('lead', lead, 1.5); this.track.m.intensity(plan[Math.min(plan.length - 1, loop)], 2);
      return;
    }
    if (this.track) this.stopTune();
    const nx = seg.next?.song?.tune;
    if (ch && nx && (!this.bed || !this.bed.playing)) {   // a soft bed of the next song's chords under the DJ
      this.bed?.stop(); this.bed = music({ tempo: nx.tempo, pad: nx.pad, pad2: nx.pad2, set: st.set || 'chip', out: ch.input, vol: .3 }).start();
    }
    this.talk(st, seg);
  }
  talk(st, seg) {
    if (this.saying && seg.t > this.sayEnd) { this.saying = 0; this.gen++; stopTalking(); }   // a line that never reports its end doesn't hold the station up
    if (this.saying || this.held || seg.t < this.readUntil) return;
    if (sound.muted || sound.music === false) { seg.over = true; return; }   // music off: the stations are quiet, DJs too
    const part = seg.parts.find(p => !p.said);
    if (!part) { seg.over = true; return; }   // all said: on to the song
    if (talking()) { if ((seg.wait = (seg.wait || 0) + 1) > 240) { part.said = true; seg.wait = 0; } return; }   // someone else is speaking (a phone call): wait for them, and after a few seconds let this part go
    part.said = true; this.line = part.line;
    const read = seg.t + talkTime(part.line);
    if (this.distance >= 8 || this.level < .05) { this.readUntil = read; return; }   // too far to make out: the break goes by
    const dj = st.dj, other = this.stations[(this.stations.indexOf(st) + 1) % this.stations.length].dj;
    const v = part.who === 'ad' ? { voice: { kind: dj.voice === 'woman' ? 'man' : 'woman', take: other.take || 0 }, pitch: 1, rate: 1.08 } : { voice: { kind: dj.voice, take: dj.take || 0 }, pitch: dj.pitch, rate: dj.rate };
    const gen = this.saying = ++this.gen; this.sayEnd = seg.t + talkTime(part.line) * 1.8 + 3;
    let said;
    try { said = say(part.line, { ...v, volume: Math.min(1, this.level * 1.2), fx: { like: 'bright', low: 140, squeeze: .85 } }); } catch { said = false; }
    Promise.resolve(said).then(ok => {
      if (this.saying !== gen) return;
      this.saying = 0;
      this.readUntil = ok ? seg.t + .3 : read;   // no speech here (a browser without voices): the line stays on screen for its reading time
    }, () => { if (this.saying === gen) { this.saying = 0; this.readUntil = read; } });
  }
  stopTune() { if (this.track) { this.track.m.stop(); this.track = null; } }
  quiet(keepPower = false) {
    this.stopTune(); if (this.bed) { this.bed.stop(); this.bed = null; }
    if (this.saying) { this.saying = 0; this.gen++; stopTalking(); }
    this.line = null; this.readUntil = 0;
    if (!keepPower && this.chain) this.chain.gain.gain.setTargetAtTime(0, this.chain.ctx.currentTime, .05);
  }
  // the hiss between stations as the dial turns (two pips for breaking news)
  switched(urgent = false) {
    this.quiet(true); this.switching = urgent ? .5 : .35;
    const st = this.station; if (st.after?.kind === 'talk') this.ask(st, st.after); if (st.seg.kind === 'talk') this.ask(st, st.seg);
    const ch = this.speakers(); if (!ch || sound.muted || sound.music === false) return;
    if (urgent) { tone(880, { len: .12, wave: 'sine', vol: .05, out: ch.input }); tone(660, { len: .18, wave: 'sine', vol: .05, at: .16, out: ch.input }); return; }
    noise(.32, { vol: .05, from: 5000, to: 1200, filter: 'bandpass', q: .8, out: ch.input });
  }
  /** For a save (gs.missions WorldSave keeps it by itself): on or off, and the station. */
  pack() { return { o: this.power ? 1 : 0, s: this.index }; }
  unpack(d) { if (d && typeof d === 'object') { this.index = Math.max(0, Math.min(this.stations.length - 1, d.s | 0)); this.power = !!d.o; } return this; }
  free() { this.quiet(); this.links?.leave(this); try { this.chain?.gain.disconnect(); } catch { /* gone */ } this.chain = null; }
}
