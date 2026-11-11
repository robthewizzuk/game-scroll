// Rain Herder: little clouds drift over a row of thirsty farm fields. Drag clouds together to make
// them bigger; a cloud of three or more rains, so steer it over a field that needs a drink. Six or
// more and it turns into a grumpy storm that zaps the field below, so tap it to split it in two.
// A field that dries right out is lost; lose three and the season is over.
import gs from '../gamescroll.js';
const { Feel } = gs.effects, { Ready } = gs.rounds, { sounds } = gs.sound, { haptic } = gs.device;
const { clamp, rnd } = gs.util, { mix } = gs.tick;

// fluid height: the fields sit on the bottom; the clouds' band moves down by half the extra height so the
// sky grows evenly above and below it (rain falls straight down, so height doesn't change the difficulty).
const W = 360, NF = 4, FW = W / NF, RAIN_AT = 3, STORM_AT = 6;
const rad = s => 16 + Math.min(s, 8) * 7;

function make(api) {
  const feel = new Feel(), ready = new Ready({ text: 'Tap to start the season' });
  let H = 640, SOIL = H - 80, OFF = 0;
  let clouds, fields, held, t, spawn, harvest, lost, bolts, nextId, tip;

  function addCloud(side, size) {
    const r = rad(size), x = side < 0 ? -r : W + r;
    clouds.push({ id: nextId++, x, y: OFF + rnd(110, 360), px: x, py: 0, size, vx: -side * rnd(14, 26), push: 0, rain: false, storm: 0, zap: 0, squash: 0, bob: Math.random() * 6 });
    clouds[clouds.length - 1].py = clouds[clouds.length - 1].y;
  }
  const fieldAt = x => fields[clamp(Math.floor(x / FW), 0, NF - 1)];
  function remove(cl) { clouds = clouds.filter(o => o !== cl); if (held && held.cl === cl) held = null; }
  function split(cl) {
    const half = cl.size / 2;
    remove(cl);
    for (const s of [-1, 1]) clouds.push({ ...cl, id: nextId++, size: half, x: cl.x + s * 20, px: cl.x, push: s * 140, storm: 0, zap: 0, squash: .6, rain: half >= RAIN_AT });
    feel.boom(cl.x, cl.y, { size: .6, color: ['#ffffff', '#cfe3ff', '#ffe066'] }); sounds.gust(1.1); haptic('medium');
    harvest += 3; api.score(Math.floor(harvest));
  }

  return {
    reset() {
      clouds = []; nextId = 0; held = null; t = 0; spawn = 1; harvest = 0; lost = 0; bolts = []; tip = 1;
      fields = Array.from({ length: NF }, (_, i) => ({ i, water: .62 + Math.random() * .2, lost: false, scorch: 0, got: 0, wet: 0 }));
      addCloud(-1, 1); addCloud(1, 2); clouds[0].x = 70; clouds[1].x = 290; clouds[0].px = 70; clouds[1].px = 290;
      feel.clear(); ready.reset();
    },
    resize(w, h) {
      const dy = (h - 640) / 2 - OFF;
      H = h; SOIL = H - 80; OFF = (H - 640) / 2;
      for (const cl of clouds || []) { cl.y += dy; cl.py += dy; }
      for (const b of bolts || []) for (const p of b.pts) p[1] += dy;
    },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      for (const cl of clouds) { cl.px = cl.x; cl.py = cl.y; }
      if (!ready.update(dt)) return;
      t += dt; spawn -= dt; tip = Math.max(0, tip - dt / 8);
      if (spawn <= 0) { spawn = Math.max(1.1, 2.6 - t * .012); addCloud(Math.random() < .5 ? -1 : 1, Math.random() < .22 ? 2 : 1); }
      const dry = .028 + t * .0007;
      for (const f of fields) { f.wet = 0; f.scorch = Math.max(0, f.scorch - dt); }
      for (const cl of [...clouds]) {
        cl.bob += dt; cl.squash = Math.max(0, cl.squash - dt * 2.5);
        if (!held || held.cl !== cl) { cl.x += (cl.vx * (cl.rain ? .35 : 1) + cl.push) * dt; cl.push *= Math.pow(.05, dt); }
        if (cl.size >= RAIN_AT && !cl.rain) { cl.rain = true; sounds.drip(1); }
        if (cl.size >= STORM_AT && !cl.storm) { cl.storm = 1; cl.zap = 1.5; sounds.thunder(.8); haptic('warning'); if (held && held.cl === cl) held = null; }
        if (cl.storm && cl.size < STORM_AT) cl.storm = 0;
        if (cl.rain) {
          cl.size -= (cl.storm ? .12 : .3) * dt;
          const f = fieldAt(cl.x);
          if (!f.lost) { f.water = Math.min(1, f.water + (.15 + .03 * cl.size) * dt); f.wet = 1; }
          if (cl.size < 1) { remove(cl); feel.coin(cl.x, cl.y, { color: '#cfe3ff', text: 'poof' }); continue; }
        }
        if (cl.storm) {
          cl.zap -= dt;
          if (cl.zap <= 0) {
            cl.zap = 2.2; const f = fieldAt(cl.x);
            const pts = [[cl.x, cl.y + rad(cl.size) * .5]]; for (let y = cl.y + 40; y < SOIL; y += 30) pts.push([cl.x + rnd(-18, 18), y]); pts.push([f.i * FW + FW / 2, SOIL - 6]);
            bolts.push({ pts, life: .3 });
            if (!f.lost) { f.water = Math.max(0, f.water - .3); f.scorch = 1.6; }
            feel.hit(f.i * FW + FW / 2, SOIL - 10, { color: '#ffe066', power: .8 }); sounds.thunder(1.2); haptic('heavy');
          }
        }
        if (cl.x < -rad(cl.size) - 40 || cl.x > W + rad(cl.size) + 40) remove(cl);
      }
      bolts = bolts.filter(b => (b.life -= dt) > 0);
      // fields drink, dry out and pay out
      let gain = 0;
      for (const f of fields) {
        if (f.lost) continue;
        if (!f.wet) f.water -= dry * dt;
        if (f.water <= 0) {
          f.water = 0; f.lost = true; lost++;
          feel.hurt(); sounds.crumble(.8); feel.coin(f.i * FW + FW / 2, SOIL - 40, { color: '#c0703a', text: 'dried up!' });
          if (lost >= 3) { feel.lose(); api.over(); return; }
          continue;
        }
        const rate = f.scorch > 0 ? 0 : f.water > .55 ? 1.5 : f.water > .3 ? .6 : 0;
        f.got += rate * dt; gain += rate * dt;
        if (f.got >= 5) { f.got -= 5; feel.score(f.i * FW + FW / 2, SOIL - 50, 5, { color: '#7bd64f' }); }
      }
      if (gain) { const before = Math.floor(harvest); harvest += gain; if (Math.floor(harvest) !== before) api.score(Math.floor(harvest)); }
    },
    draw(c) {
      const sky = c.createLinearGradient(0, 0, 0, SOIL);
      const gloom = clamp(clouds.filter(cl => cl.storm).length * .25, 0, .5);
      sky.addColorStop(0, gloom ? '#6f8fb8' : '#7cc8ff'); sky.addColorStop(1, '#dff4ff'); c.fillStyle = sky; c.fillRect(0, 0, W, H);
      c.fillStyle = '#fff3b0'; c.beginPath(); c.arc(318, 92, 30, 0, 7); c.fill(); c.fillStyle = '#ffe066'; c.beginPath(); c.arc(318, 92, 22, 0, 7); c.fill();
      c.fillStyle = '#9ad67a'; c.beginPath(); c.ellipse(80, SOIL, 150, 60, 0, Math.PI, 0); c.fill(); c.beginPath(); c.ellipse(290, SOIL, 170, 75, 0, Math.PI, 0); c.fill();
      feel.begin(c);
      // fields
      for (const f of fields) {
        const x = f.i * FW, w = f.water;
        c.fillStyle = f.lost ? '#b49072' : f.wet ? '#5a3a22' : '#7a5232'; c.fillRect(x + 2, SOIL, FW - 4, 46);
        c.fillStyle = '#00000022'; for (let k = 0; k < 3; k++) c.fillRect(x + 6, SOIL + 10 + k * 12, FW - 12, 3);
        for (let k = 0; k < 4; k++) {
          const px = x + 15 + k * 20, hgt = f.lost ? 8 : 12 + w * 26, droop = f.lost ? 1 : clamp((.35 - w) * 4, 0, 1);
          const leaf = f.lost || f.scorch > 0 ? '#5b4630' : w > .3 ? '#4cb04a' : w > .15 ? '#a8a845' : '#a87a3a';
          c.strokeStyle = leaf; c.lineWidth = 3; c.beginPath(); c.moveTo(px, SOIL); c.quadraticCurveTo(px, SOIL - hgt, px + droop * 12, SOIL - hgt + droop * 10); c.stroke();
          c.fillStyle = leaf;
          c.beginPath(); c.ellipse(px - 6, SOIL - hgt * .5, 6, 3, -.5 + droop, 0, 7); c.fill();
          c.beginPath(); c.ellipse(px + 6, SOIL - hgt * .6, 6, 3, .5 + droop, 0, 7); c.fill();
          if (!f.lost && w > .55 && f.scorch <= 0) { c.fillStyle = ['#ff8a3d', '#ffd23f', '#ff5d73', '#c58bff'][(f.i + k) % 4]; c.beginPath(); c.arc(px + droop * 12, SOIL - hgt, 5, 0, 7); c.fill(); }
        }
        // thirst meter
        const warn = !f.lost && w < .25 && (t * 4 | 0) % 2;
        c.fillStyle = '#00000055'; c.fillRect(x + 10, SOIL + 54, FW - 20, 12);
        c.fillStyle = f.lost ? '#6b5444' : warn ? '#ff5d5d' : w > .55 ? '#3aa0ff' : '#86c4ff'; c.fillRect(x + 12, SOIL + 56, Math.round((FW - 24) * w), 8);
        if (f.lost) { c.strokeStyle = '#ff5d5d'; c.lineWidth = 4; c.beginPath(); c.moveTo(x + 30, SOIL + 10); c.lineTo(x + 60, SOIL + 36); c.moveTo(x + 60, SOIL + 10); c.lineTo(x + 30, SOIL + 36); c.stroke(); }
      }
      // rain
      c.strokeStyle = '#4f8fe0aa'; c.lineWidth = 2;
      for (const cl of clouds) if (cl.rain) {
        const r = rad(cl.size), x0 = mix(cl.px, cl.x), y0 = mix(cl.py, cl.y) + r * .4, span = SOIL - y0;
        c.beginPath();
        for (let k = 0; k < 6 + cl.size * 2; k++) { const dx = ((k * 37) % (r * 1.4)) - r * .7, dy = (t * 420 + k * 53) % Math.max(1, span); c.moveTo(x0 + dx, y0 + dy); c.lineTo(x0 + dx - 2, y0 + dy + 10); }
        c.stroke();
      }
      for (const b of bolts) { c.strokeStyle = '#fff6a0'; c.lineWidth = 5; c.beginPath(); b.pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.stroke(); }
      // clouds
      for (const cl of clouds) {
        const r = rad(cl.size), x = mix(cl.px, cl.x), y = mix(cl.py, cl.y) + Math.sin(cl.bob * 2) * 2, s = 1 + cl.squash * .25 * Math.sin(cl.squash * 20);
        const body = cl.storm ? ((t * 10 | 0) % 7 === 0 ? '#9a9fc0' : '#5f6684') : cl.rain ? '#c8d6ea' : '#ffffff', under = cl.storm ? '#454b66' : cl.rain ? '#a3b6d2' : '#dce8f6';
        c.save(); c.translate(x, y); c.scale(s, 2 - s);
        if (held && held.cl === cl) { c.fillStyle = '#ffffff44'; c.beginPath(); c.arc(0, 0, r + 12, 0, 7); c.fill(); }
        const puffs = [[-.6, .15, .5], [.6, .15, .5], [-.25, -.25, .6], [.3, -.2, .55], [0, .15, .65]];
        c.fillStyle = under; for (const [px, py, pr] of puffs) { c.beginPath(); c.arc(px * r, py * r + 4, pr * r, 0, 7); c.fill(); }
        c.fillStyle = body; for (const [px, py, pr] of puffs) { c.beginPath(); c.arc(px * r, py * r, pr * r, 0, 7); c.fill(); }
        // face
        const e = Math.max(2.5, r * .07);
        c.fillStyle = '#2b2f45'; c.beginPath(); c.ellipse(-r * .2, 0, e, e * 1.3, 0, 0, 7); c.ellipse(r * .2, 0, e, e * 1.3, 0, 0, 7); c.fill();
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(-r * .2 + e * .4, -e * .5, e * .4, 0, 7); c.arc(r * .2 + e * .4, -e * .5, e * .4, 0, 7); c.fill();
        c.strokeStyle = '#2b2f45'; c.lineWidth = 2; c.beginPath();
        if (cl.storm) { c.moveTo(-r * .32, -e * 2.4); c.lineTo(-r * .1, -e * 1.4); c.moveTo(r * .32, -e * 2.4); c.lineTo(r * .1, -e * 1.4); c.moveTo(-r * .1, r * .25); c.lineTo(r * .1, r * .25); }
        else c.arc(0, r * .12, r * .1, .2, Math.PI - .2);
        c.stroke();
        if (!cl.storm) { c.fillStyle = '#ff9ab555'; c.beginPath(); c.arc(-r * .36, r * .14, e * 1.3, 0, 7); c.arc(r * .36, r * .14, e * 1.3, 0, 7); c.fill(); }
        c.restore();
        // size badge
        const n = Math.ceil(cl.size - .05), bx = x + r * .7, by = y - r * .55;
        c.fillStyle = cl.storm ? '#ffd23f' : n >= RAIN_AT ? '#3a8ee6' : '#8fa6c4'; c.beginPath(); c.arc(bx, by, 11, 0, 7); c.fill();
        c.fillStyle = cl.storm ? '#2b2f45' : '#ffffff'; c.font = '700 14px Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), bx, by + 1);
        if (cl.storm) { c.fillStyle = '#fff6a0'; c.font = '800 13px Rubik, sans-serif'; c.fillText('TAP!', x, y - r - 10); }
      }
      feel.end(c, W, H);
      // HUD: fields left, top-left, clear of the app's score badge
      c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.font = '700 15px Rubik, sans-serif';
      for (let i = 0; i < 3; i++) { c.fillStyle = i < lost ? '#c0703a' : '#4cb04a'; c.beginPath(); c.ellipse(22 + i * 22, 28, 7, 10, .4, 0, 7); c.fill(); }
      if (tip > 0 && ready.playing) {
        const y = Math.round(api.scoreArea().bottom + 70);
        c.globalAlpha = Math.min(1, tip * 3); c.textAlign = 'center'; c.font = '700 16px Rubik, sans-serif';
        c.fillStyle = '#ffffffcc'; c.fillRect(30, y - 20, W - 60, 46);
        c.fillStyle = '#2b4a6f'; c.fillText('Drag clouds together: 3+ rains.', W / 2, y); c.fillText('Tap a storm (6+) to split it!', W / 2, y + 20);
        c.globalAlpha = 1;
      }
      ready.draw(c, W, H, { color: '#2b4a6f', shadow: '#ffffffa0', y: SOIL - 90 });
    },
    down(x, y, id) {
      if (!clouds) return;
      if (ready.go()) return;
      let best = null, bd = 1e9;
      for (const cl of clouds) { const d = Math.hypot(cl.x - x, cl.y - y); if (d < rad(cl.size) + 14 && d < bd) { bd = d; best = cl; } }
      if (!best) return;
      if (best.storm) { split(best); return; }
      held = { cl: best, id, dx: best.x - x, dy: best.y - y }; best.squash = .5; sounds.pop(1.2); haptic('light');
    },
    move(x, y, pressed, id) {
      if (!held || held.id !== id) return;
      const cl = held.cl;
      cl.x = clamp(x + held.dx, 10, W - 10); cl.y = clamp(y + held.dy, 90, SOIL - 130);
      for (const o of clouds) {
        if (o === cl || o.storm) continue;
        if (Math.hypot(o.x - cl.x, o.y - cl.y) < (rad(o.size) + rad(cl.size)) * .62) {
          cl.size += o.size; cl.squash = 1; remove(o);
          feel.coin(cl.x, cl.y - rad(cl.size), { color: '#9fd0ff', text: String(Math.ceil(cl.size - .05)), pitch: .8 + cl.size * .08 });
          sounds.squish(1 + cl.size * .05);
        }
      }
    },
    up(x, y, id) { if (held && held.id === id) held = null; },
    key(k, d) { if (d && k === ' ' && clouds) ready.go(); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'rain-herder',
  title: 'Rain Herder',
  tag: 'Casual · Weather',
  retro: false,
  w: 360, h: 640, maxH: 800,
  tick: 60,
  music: 'calm',
  goal: 150,
  hint: 'Drag clouds together: three or more makes rain, so hold them over thirsty fields. Tap a storm to split it before it zaps your crops.',
  creator: 'Noctizzle',
  make,
};
