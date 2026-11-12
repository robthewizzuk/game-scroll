// A pretend phone for the sound test's speech part (scripts/sound-test.cjs speech): it stands in for the
// SpeechAudio plugin (plugins/speech-audio), which has the phone's speech engine write a line to sound,
// and for the Text to Speech plugin, which speaks a line itself. Injected before the page loads.
// What it "writes" is a made-up voice: a buzz with the ring of a chest and a mouth (four formants), a syllable a
// word, silence before and after as engines leave, and where each word starts. Change window.__speech
// from the test to stand for other phones: a quiet or a loud engine, one that gives no word marks, one
// that fails, one that never answers.
(() => {
  window.CapacitorCustomPlatform = { name: 'fake-speech' };   // a native platform as far as Capacitor can tell
  const S = window.__speech = {
    renders: [], spoken: [], cancels: 0, stops: 0,
    rate: 24000,       // samples a second, as Google's engine writes
    level: .3,         // how loud this engine writes
    marks: true,       // it says where the words start
    fail: null,        // 'no': answers that it can't; 'throw': the call fails; 'hang': never answers
    takes: 20,         // milliseconds it takes to write a line
    speakMs: 60,       // how long the phone takes to speak a line itself
  };
  const voices = [
    { name: 'English', lang: 'en-GB', voiceURI: 'en-gb-x-fis-local', localService: true },
    { name: 'English', lang: 'en-GB', voiceURI: 'en-gb-x-gbd-local', localService: true },
    { name: 'English', lang: 'en-GB', voiceURI: 'en-gb-x-rjs-local', localService: true },
    { name: 'English', lang: 'en-US', voiceURI: 'en-us-x-sfg-local', localService: true },
  ];
  // the made-up voice: `hz` is how high it speaks, `pace` how fast
  function write(text, hz, pace) {
    const R = S.rate, words = [...String(text).matchAll(/\S+/g)], gap = .06 / pace, lead = .1, tail = .15;
    const lens = words.map(w => Math.max(.12, w[0].length * .07) / pace);
    const total = lead + lens.reduce((a, b) => a + b + gap, 0) + tail, x = new Float32Array(Math.ceil(total * R)), marks = [];
    const formant = f => .6 * Math.exp(-(((f - 160) / 110) ** 2)) + Math.exp(-(((f - 700) / 260) ** 2)) + .7 * Math.exp(-(((f - 1300) / 320) ** 2)) + .35 * Math.exp(-(((f - 2700) / 500) ** 2)) + .04;
    let t = lead;
    words.forEach((w, k) => {
      marks.push(w.index, t);
      const n = Math.floor(lens[k] * R), from = Math.floor(t * R);
      for (let h = 1; h * hz < Math.min(6000, R / 2 - 200); h++) {
        const a = formant(h * hz) / h ** .3, ph = h * 1.7;
        for (let i = 0; i < n; i++) x[from + i] += a * Math.sin(2 * Math.PI * h * hz * i / R + ph) * Math.sin(Math.PI * i / n) ** .7;
      }
      t += lens[k] + gap;
    });
    let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
    const out = new Uint8Array(x.length * 2);
    for (let i = 0; i < x.length; i++) { const s = Math.round(x[i] / (peak || 1) * S.level * 32767); out[i * 2] = s & 255; out[i * 2 + 1] = (s >> 8) & 255; }
    let bin = ''; for (let i = 0; i < out.length; i += 8192) bin += String.fromCharCode(...out.subarray(i, i + 8192));
    return { ok: true, rate: R, pcm: btoa(bin), marks: S.marks ? marks : [] };
  }
  const later = (ms, v) => new Promise(res => setTimeout(res, ms, v));
  const plugins = {
    SpeechAudio: {
      render(o) {
        S.renders.push({ text: o.text, lang: o.lang, voiceURI: o.voiceURI, rate: +(+o.rate).toFixed(3), pitch: +(+o.pitch).toFixed(3) });
        if (S.fail === 'hang') return new Promise(() => {});
        if (S.fail === 'throw') return later(S.takes).then(() => { throw new Error('no plugin'); });
        if (S.fail === 'no') return later(S.takes, { ok: false, reason: 'the engine could not say it' });
        return later(S.takes).then(() => write(o.text, (/gbd|rjs/.test(o.voiceURI) ? 115 : 205) * o.pitch, o.rate));
      },
      cancel() { S.cancels++; return Promise.resolve(); },
    },
    TextToSpeech: {
      getSupportedVoices: () => Promise.resolve({ voices }),
      speak(o) { S.spoken.push({ text: o.text, voice: o.voice, pitch: +(+o.pitch).toFixed(3), rate: +(+o.rate).toFixed(3) }); return later(S.speakMs); },
      stop() { S.stops++; return Promise.resolve(); },
    },
  };
  window.Capacitor = {
    PluginHeaders: Object.entries(plugins).map(([name, m]) => ({ name, methods: Object.keys(m).map(k => ({ name: k, rtype: 'promise' })) })),
    nativePromise: (plugin, method, opts) => Promise.resolve().then(() => plugins[plugin][method](opts || {})),   // (a plugin this phone hasn't got: the call fails, as in an app without it)
    nativeCallback: () => Promise.resolve('fake'),   // (listeners: nothing here sends any)
  };
})();
