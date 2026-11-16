// Card Lanes: real-time tactical poker-lane crafting duel against Pip.
// Draft one of two face-up cards from the middle tray and place it into one of your 3 five-card
// poker lanes before the fuse runs out; Pip takes the other card and contests your lanes using
// Tiny Brains Predict + Dial. Win at least 2 of 3 lanes in each Showdown!
import gs from '../gamescroll.js';

const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { Deck, poker, winners, SUIT_SIGN } = gs.cards;
const { Predict, Dial } = gs.brains;
const { icon } = gs.icons;
const { sounds } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;
const { tweak } = gs;

const W = 360, H = 640;

const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_IDX = { s: 0, h: 1, d: 2, c: 3 };
const SHORT_HAND = {
  'High Card': 'High',
  'Pair': 'Pair',
  'Two Pair': '2 Pair',
  'Three of a Kind': 'Trips',
  'Straight': 'Straight',
  'Flush': 'Flush',
  'Full House': 'Full Hse',
  'Four of a Kind': 'Quads',
  'Straight Flush': 'Str Flsh',
  'Royal Flush': 'Royal!',
};

// Precomputed layout constants (zero per-frame allocations)
const LANE_W = 104;
const LANE_X = [14, 128, 242];
const LANE_CX = [66, 180, 294];

const PIP_Y = 82, PIP_H = 156;
const PIP_CARD_Y0 = 88, PIP_STEP = 20, PIP_CARD_W = 80, PIP_CARD_H = 44, PIP_CARD_DX = 12;

const FUSE_X = 18, FUSE_Y = 245, FUSE_W = 324, FUSE_H = 7;

const TRAY_Y = 264, TRAY_W = 78, TRAY_H = 98;
const TRAY_X = [88, 194];
const TRAY_CX = [127, 233];
const TRAY_CY = 313;

const YOU_Y = 390, YOU_H = 188;
const YOU_CARD_Y0 = 416, YOU_STEP = 24, YOU_CARD_W = 80, YOU_CARD_H = 48, YOU_CARD_DX = 12;

const HUD_Y = 610;

function make(api) {
  const feel = new Feel();
  const ready = new Ready({ text: 'TAP TO DEAL' });
  const habits = new Predict(api, { name: 'card-lanes-you', moves: 3 });
  const dial = new Dial(api, { name: 'card-lanes-pip', start: 0.55, target: 0.6 });

  const K = tweak('Feel', {
    fuse: [6.5, 3, 12, 'seconds per pick before fuse expires'],
    winPts: [25, 10, 50, 5, 'points for winning a showdown'],
    lanePts: [8, 2, 20, 1, 'bonus points per lane won'],
    lives: [3, 1, 5, 1, 'hearts before game over'],
  });

  // Reusable buffers for AI evaluation and showdown
  const rankCnt = new Int8Array(15);
  const suitCnt = new Int8Array(4);
  const tmpFive = [null, null, null, null, null];
  const openBuf = [];
  const laneScores = [0, 0, 0];

  // Pre-allocated lane slot animations & hand arrays
  const youSlots = [[], [], []];
  const pipSlots = [[], [], []];
  const youHands = [[], [], []];
  const pipHands = [[], [], []];
  for (let l = 0; l < 3; l++) {
    for (let s = 0; s < 5; s++) {
      youSlots[l].push({ card: null, pop: 0 });
      pipSlots[l].push({ card: null, pop: 0 });
    }
  }

  let deck;
  const roundSeen = new Set();
  const tray = [null, null];
  const trayPop = [0, 0];
  const youLabel = ['Empty', 'Empty', 'Empty'];
  const pipLabel = ['Empty', 'Empty', 'Empty'];
  const youFullName = ['', '', ''];
  const pipFullName = ['', '', ''];
  const laneResult = [0, 0, 0]; // 0 = pending, 1 = you win, -1 = pip win, 2 = tie
  const foulFlash = [0, 0, 0];
  const pipFlash = [0, 0, 0];

  let selectedTray = -1;
  let trayNudge = 0;
  let fuse = 6.5;
  let tickBeat = 0;
  let lives = 3;
  let score = 0;
  let streak = 0;
  let showdownsWon = 0;
  let roundNum = 0;
  let phase = 'pick'; // 'pick' | 'showdown'
  let showT = 0;
  let revealed = 0;
  let settled = false;
  let ended = false;
  let t = 0;
  let statusMsg = '';
  let statusCol = '#d8f3dc';
  let statusT = 0;

  function setStatus(msg, col, dur) {
    statusMsg = msg;
    statusCol = col;
    statusT = dur;
  }

  function drawUnique() {
    for (let guard = 0; guard < 140; guard++) {
      if (deck.empty) deck.refill();
      const c = deck.top();
      if (!c) break;
      if (!roundSeen.has(c.id)) {
        roundSeen.add(c.id);
        return c;
      }
      deck.discard(c);
    }
    deck.reset();
    const c = deck.top();
    if (c) roundSeen.add(c.id);
    return c;
  }

  function evalPartial(hand, extra) {
    const n = hand.length + (extra ? 1 : 0);
    if (n === 0) return 0;

    if (n === 5 && extra) {
      for (let i = 0; i < 4; i++) tmpFive[i] = hand[i];
      tmpFive[4] = extra;
      const res = poker(tmpFive);
      let hi = 0;
      for (let i = 0; i < 5; i++) {
        const rv = tmpFive[i].rank === 1 ? 14 : tmpFive[i].rank;
        if (rv > hi) hi = rv;
      }
      return res.rank * 120 + hi * 1.2;
    }
    if (n === 5 && !extra) {
      const res = poker(hand);
      let hi = 0;
      for (let i = 0; i < 5; i++) {
        const rv = hand[i].rank === 1 ? 14 : hand[i].rank;
        if (rv > hi) hi = rv;
      }
      return res.rank * 120 + hi * 1.2;
    }

    rankCnt.fill(0);
    suitCnt.fill(0);
    let minR = 99, maxR = 0, minAceHi = 99, maxAceHi = 0, distinct = 0;
    for (let i = 0; i < hand.length; i++) {
      const c = hand[i];
      if (rankCnt[c.rank] === 0) distinct++;
      rankCnt[c.rank]++;
      suitCnt[SUIT_IDX[c.suit]]++;
      if (c.rank < minR) minR = c.rank;
      if (c.rank > maxR) maxR = c.rank;
      const ah = c.rank === 1 ? 14 : c.rank;
      if (ah < minAceHi) minAceHi = ah;
      if (ah > maxAceHi) maxAceHi = ah;
    }
    if (extra) {
      if (rankCnt[extra.rank] === 0) distinct++;
      rankCnt[extra.rank]++;
      suitCnt[SUIT_IDX[extra.suit]]++;
      if (extra.rank < minR) minR = extra.rank;
      if (extra.rank > maxR) maxR = extra.rank;
      const ah = extra.rank === 1 ? 14 : extra.rank;
      if (ah < minAceHi) minAceHi = ah;
      if (ah > maxAceHi) maxAceHi = ah;
    }

    let val = 0;
    let pairs = 0;
    for (let r = 1; r <= 13; r++) {
      const cnt = rankCnt[r];
      if (cnt === 0) continue;
      const rv = r === 1 ? 14 : r;
      if (cnt === 2) { pairs++; val += 65 + rv * 2; }
      else if (cnt === 3) val += 190 + rv * 2.5;
      else if (cnt === 4) val += 420 + rv * 3;
      else val += rv * 0.7;
    }
    if (pairs >= 2) val += 65;

    let activeSuits = 0, maxSuit = 0;
    for (let s = 0; s < 4; s++) {
      if (suitCnt[s] > 0) activeSuits++;
      if (suitCnt[s] > maxSuit) maxSuit = suitCnt[s];
    }
    if (activeSuits === 1 && n >= 2) {
      val += n * 22;
    } else if (extra && n >= 3 && maxSuit === n - 1 && suitCnt[SUIT_IDX[extra.suit]] === 1) {
      // Adding an off-suit card broke a pure flush draw
      val -= 24;
    }

    if (distinct >= 2 && distinct === n && (maxR - minR <= 4 || maxAceHi - minAceHi <= 4)) {
      val += distinct * 13;
    }
    return val;
  }

  function updateLaneLabel(handsArr, labelsArr, laneIdx) {
    const h = handsArr[laneIdx];
    if (h.length === 0) {
      labelsArr[laneIdx] = 'Empty';
      return;
    }
    if (h.length === 5) {
      const p = poker(h);
      labelsArr[laneIdx] = SHORT_HAND[p.name] || p.name;
      return;
    }
    const p = poker(h);
    if (p.rank >= 2) {
      labelsArr[laneIdx] = SHORT_HAND[p.name] || p.name;
      return;
    }
    // Check flush draw
    let sameSuit = h.length >= 3;
    const s0 = h[0].suit;
    let hi = 0;
    for (let i = 0; i < h.length; i++) {
      if (h[i].suit !== s0) sameSuit = false;
      const rv = h[i].rank === 1 ? 14 : h[i].rank;
      if (rv > hi) hi = rv;
    }
    if (sameSuit) {
      labelsArr[laneIdx] = h.length + '/5 Flsh';
    } else {
      const rDisp = hi === 14 ? 'A' : RANKS[hi];
      labelsArr[laneIdx] = 'Hi ' + rDisp;
    }
  }

  function choosePipLane(card) {
    openBuf.length = 0;
    for (let i = 0; i < 3; i++) {
      if (pipHands[i].length < 5) openBuf.push(i);
    }
    if (openBuf.length === 1) return openBuf[0];

    const pred = habits.guess();
    const conf = habits.sure;
    const skill = dial.skill;

    for (let k = 0; k < openBuf.length; k++) {
      const i = openBuf[k];
      const before = evalPartial(pipHands[i], null);
      const after = evalPartial(pipHands[i], card);
      const gain = after - before;
      const youStr = evalPartial(youHands[i], null);
      const diff = after - youStr;

      let v = gain * 1.15 + after * 0.28;

      if (youHands[i].length === 5) {
        if (after > youStr && before <= youStr) v += 60 * skill;
        else if (youStr - after > 75 && pipHands[i].length <= 3) v -= 38 * skill;
      } else if (pred === i && conf > 0.25) {
        if (diff > -40) v += 24 * skill * conf;
      }

      if (diff > 95 && pipHands[i].length >= 3) v -= 14 * skill;
      else if (Math.abs(diff) < 35) v += 14 * skill;

      laneScores[k] = v;
    }

    // Sort openBuf indices by descending laneScores[k]
    let bestK = 0;
    let secK = openBuf.length > 1 ? 1 : 0;
    for (let k = 0; k < openBuf.length; k++) {
      if (laneScores[k] > laneScores[bestK]) {
        secK = bestK;
        bestK = k;
      } else if (k !== bestK && laneScores[k] > laneScores[secK]) {
        secK = k;
      }
    }

    const smartChance = 0.35 + 0.65 * skill;
    return Math.random() < smartChance ? openBuf[bestK] : openBuf[secK];
  }

  function dealTray() {
    tray[0] = drawUnique();
    tray[1] = drawUnique();
    trayPop[0] = 1;
    trayPop[1] = 1;
    selectedTray = -1;
    fuse = K.fuse;
    tickBeat = 0;
  }

  function startRound() {
    for (let l = 0; l < 3; l++) {
      if (youHands[l].length) deck.discard(youHands[l]);
      if (pipHands[l].length) deck.discard(pipHands[l]);
      youHands[l].length = 0;
      pipHands[l].length = 0;
      for (let s = 0; s < 5; s++) {
        youSlots[l][s].card = null;
        youSlots[l][s].pop = 0;
        pipSlots[l][s].card = null;
        pipSlots[l][s].pop = 0;
      }
      youLabel[l] = 'Empty';
      pipLabel[l] = 'Empty';
      youFullName[l] = '';
      pipFullName[l] = '';
      laneResult[l] = 0;
      foulFlash[l] = 0;
      pipFlash[l] = 0;
    }
    if (tray[0]) deck.discard(tray[0]);
    if (tray[1]) deck.discard(tray[1]);
    tray[0] = null;
    tray[1] = null;
    roundSeen.clear();
    if (deck.size < 36) deck.refill();

    roundNum++;
    phase = 'pick';
    showT = 0;
    revealed = 0;
    settled = false;
    dealTray();
    setStatus('Showdown ' + roundNum + ' · Pick a card', '#d8f3dc', 2.0);
  }

  function totalYouCards() {
    return youHands[0].length + youHands[1].length + youHands[2].length;
  }

  function enterShowdown() {
    phase = 'showdown';
    showT = 0;
    revealed = 0;
    settled = false;
    selectedTray = -1;
    tray[0] = null;
    tray[1] = null;
    for (let l = 0; l < 3; l++) {
      const yp = poker(youHands[l]);
      const pp = poker(pipHands[l]);
      youFullName[l] = yp.name;
      pipFullName[l] = pp.name;
      youLabel[l] = SHORT_HAND[yp.name] || yp.name;
      pipLabel[l] = SHORT_HAND[pp.name] || pp.name;
    }
    setStatus('SHOWDOWN!', '#ffd166', 2.5);
  }

  function placeBoth(youLane, youCard, pipCard) {
    const yIdx = youHands[youLane].length;
    youHands[youLane].push(youCard);
    youSlots[youLane][yIdx].card = youCard;
    youSlots[youLane][yIdx].pop = 1;
    updateLaneLabel(youHands, youLabel, youLane);

    const pipLane = choosePipLane(pipCard);
    const pIdx = pipHands[pipLane].length;
    pipHands[pipLane].push(pipCard);
    pipSlots[pipLane][pIdx].card = pipCard;
    pipSlots[pipLane][pIdx].pop = 1;
    pipFlash[pipLane] = 1;
    updateLaneLabel(pipHands, pipLabel, pipLane);

    if (totalYouCards() >= 15) {
      enterShowdown();
    } else {
      dealTray();
    }
  }

  function placePlayerCard(laneIdx) {
    if (phase !== 'pick' || ended) return;
    if (youHands[laneIdx].length >= 5) {
      foulFlash[laneIdx] = 1;
      fuse = Math.min(fuse, Math.max(0.15, fuse - 0.6));
      sounds.deny();
      haptic('error');
      feel.juice.shake(3);
      setStatus('LANE FULL! -0.6s', '#ff6b81', 1.1);
      return;
    }
    if (selectedTray < 0) {
      trayNudge = 0.55;
      sounds.blip();
      setStatus('Tap a tray card first!', '#ffd166', 1.1);
      return;
    }

    const youCard = tray[selectedTray];
    const pipCard = tray[1 - selectedTray];
    habits.see(laneIdx);
    sounds.plop();
    haptic('light');
    feel.juice.burst(LANE_CX[laneIdx], YOU_CARD_Y0 + youHands[laneIdx].length * YOU_STEP + 20, {
      n: 7, speed: 55, life: 0.35, size: 3, color: ['#ffd166', '#ffffff'],
    });
    placeBoth(laneIdx, youCard, pipCard);
  }

  function handleFuseExpired() {
    lives--;
    streak = 0;
    feel.hurt(W / 2, TRAY_CY);
    if (lives <= 0) {
      dial.result(false);
      ended = true;
      feel.lose();
      setStatus('TIME OUT! GAME OVER', '#ff4d6d', 3);
      api.over();
      return;
    }
    setStatus('TIME UP! -1 HEART', '#ff6b81', 1.6);

    // Punish idle play: Pip claims the better card, you get the worse card in a suboptimal open lane
    const c0 = tray[0], c1 = tray[1];
    let best0 = -999, best1 = -999;
    for (let i = 0; i < 3; i++) {
      if (pipHands[i].length < 5) {
        const s0 = evalPartial(pipHands[i], c0) - evalPartial(pipHands[i], null);
        const s1 = evalPartial(pipHands[i], c1) - evalPartial(pipHands[i], null);
        if (s0 > best0) best0 = s0;
        if (s1 > best1) best1 = s1;
      }
    }
    const pipCard = best0 >= best1 ? c0 : c1;
    const youCard = best0 >= best1 ? c1 : c0;

    // Pick your open lane with least gain for youCard
    let worstLane = -1, worstGain = 1e9;
    for (let i = 0; i < 3; i++) {
      if (youHands[i].length < 5) {
        const g = evalPartial(youHands[i], youCard) - evalPartial(youHands[i], null);
        if (g < worstGain) { worstGain = g; worstLane = i; }
      }
    }
    if (worstLane >= 0) {
      placeBoth(worstLane, youCard, pipCard);
    }
  }

  function revealLane(l) {
    const winList = winners([youHands[l], pipHands[l]]);
    const yWins = winList.includes(0);
    const pWins = winList.includes(1);
    const cx = LANE_CX[l];
    if (yWins && !pWins) {
      laneResult[l] = 1;
      feel.coin(cx, 325, { color: '#38d399', text: youLabel[l], pitch: 1 + l * 0.08 });
    } else if (pWins && !yWins) {
      laneResult[l] = -1;
      feel.hit(cx, 200, { color: '#ff4d6d', power: 0.55 });
    } else {
      laneResult[l] = 2;
      sounds.blip(1.1);
      feel.juice.burst(cx, 260, { n: 8, speed: 50, life: 0.4, size: 3, color: ['#ffd166', '#ffffff'] });
    }
  }

  function settleShowdown() {
    settled = true;
    let yw = 0, pw = 0;
    for (let l = 0; l < 3; l++) {
      if (laneResult[l] === 1) yw++;
      else if (laneResult[l] === -1) pw++;
    }

    if (yw >= 2) {
      showdownsWon++;
      streak++;
      const pts = K.winPts + yw * K.lanePts + Math.min(streak - 1, 4) * 5;
      score += pts;
      api.score(score);
      dial.result(true);
      feel.win(W / 2, H * 0.46);
      if (streak >= 2) feel.combo(streak, W / 2, H * 0.4);
      setStatus('WIN ' + yw + '-' + pw + '! +' + pts, '#38d399', 2.4);
    } else if (pw >= 2) {
      streak = 0;
      lives--;
      dial.result(false);
      feel.hurt(W / 2, H * 0.54);
      if (lives <= 0) {
        ended = true;
        feel.lose();
        setStatus('LOST ' + pw + '-' + yw + '! GAME OVER', '#ff4d6d', 3);
        api.over();
      } else {
        setStatus('PIP WINS ' + pw + '-' + yw + ' · -1 ♥', '#ff6b81', 2.2);
      }
    } else {
      const pts = yw * K.lanePts;
      if (pts > 0) {
        score += pts;
        api.score(score);
      }
      dial.result('draw');
      feel.score(W / 2, H * 0.48, pts, { color: '#ffd166' });
      setStatus('SPLIT DRAW! +' + pts, '#ffd166', 2.2);
    }
  }

  function drawCard(c, x, y, w, h, card, selected, compact) {
    // Card shadow
    c.fillStyle = '#00000044';
    c.beginPath();
    c.roundRect(x + 1, y + 3, w, h, compact ? 6 : 9);
    c.fill();

    // Card body
    c.fillStyle = selected ? '#fffdf0' : '#f8f5ec';
    c.beginPath();
    c.roundRect(x, y, w, h, compact ? 6 : 9);
    c.fill();

    c.strokeStyle = selected ? '#ffd166' : '#c8bea8';
    c.lineWidth = selected ? 3 : 1.2;
    c.stroke();

    const col = card.red ? '#d62828' : '#1b1f29';
    const rTxt = RANKS[card.rank] || '?';
    const sTxt = SUIT_SIGN[card.suit] || '';

    c.fillStyle = col;
    if (compact) {
      // Top strip stays readable even when stacked 20-24px apart
      c.textAlign = 'left';
      c.font = '800 13px Rubik, sans-serif';
      c.fillText(rTxt, x + 6, y + 15);
      c.font = '13px sans-serif';
      c.fillText(sTxt, x + (rTxt.length > 1 ? 23 : 17), y + 15);

      c.textAlign = 'right';
      c.font = '11px sans-serif';
      c.fillText(sTxt, x + w - 6, y + 14);

      // Center pip for top-most visible card
      c.textAlign = 'center';
      c.font = '18px sans-serif';
      c.fillText(sTxt, x + w * 0.5, y + h - 10);
    } else {
      // Large Tray card
      c.textAlign = 'left';
      c.font = '800 17px Rubik, sans-serif';
      c.fillText(rTxt, x + 8, y + 21);
      c.font = '15px sans-serif';
      c.fillText(sTxt, x + 8, y + 37);

      c.textAlign = 'center';
      c.font = '34px sans-serif';
      c.fillText(sTxt, x + w * 0.5, y + h * 0.62);

      c.textAlign = 'right';
      c.font = '800 14px Rubik, sans-serif';
      c.fillText(rTxt + sTxt, x + w - 7, y + h - 9);
    }
  }

  return {
    reset() {
      deck = new Deck({ decks: 2 });
      deck.shuffle();
      lives = K.lives;
      score = 0;
      streak = 0;
      showdownsWon = 0;
      roundNum = 0;
      ended = false;
      t = 0;
      trayNudge = 0;
      feel.clear();
      ready.reset();
      startRound();
    },

    update(dt) {
      feel.update(dt);
      if (feel.frozen) return;
      t += dt;
      if (statusT > 0) statusT = Math.max(0, statusT - dt);
      if (trayNudge > 0) trayNudge = Math.max(0, trayNudge - dt);
      for (let i = 0; i < 2; i++) {
        if (trayPop[i] > 0) trayPop[i] = Math.max(0, trayPop[i] - dt * 5);
      }
      for (let l = 0; l < 3; l++) {
        if (foulFlash[l] > 0) foulFlash[l] = Math.max(0, foulFlash[l] - dt * 3);
        if (pipFlash[l] > 0) pipFlash[l] = Math.max(0, pipFlash[l] - dt * 2.5);
        for (let s = 0; s < 5; s++) {
          if (youSlots[l][s].pop > 0) youSlots[l][s].pop = Math.max(0, youSlots[l][s].pop - dt * 5);
          if (pipSlots[l][s].pop > 0) pipSlots[l][s].pop = Math.max(0, pipSlots[l][s].pop - dt * 5);
        }
      }

      if (!ready.update(dt) || ended) return;

      if (phase === 'pick') {
        fuse -= dt;
        if (fuse > 0 && fuse < 2.0) {
          tickBeat -= dt;
          if (tickBeat <= 0) {
            tickBeat = 0.5;
            sounds.tick(1.1);
          }
        }
        if (fuse <= 0) {
          handleFuseExpired();
        }
      } else if (phase === 'showdown') {
        showT += dt;
        if (revealed < 1 && showT >= 0.2) { revealed = 1; revealLane(0); }
        if (revealed < 2 && showT >= 0.65) { revealed = 2; revealLane(1); }
        if (revealed < 3 && showT >= 1.1) { revealed = 3; revealLane(2); }
        if (!settled && showT >= 1.55) {
          settleShowdown();
        }
        if (settled && !ended && showT >= 2.85) {
          startRound();
        }
      }
    },

    fx(dt) {
      feel.update(dt);
    },

    draw(c) {
      // Casino felt backdrop
      c.fillStyle = '#0d3b2e';
      c.fillRect(0, 0, W, H);

      // Subtle inner felt mat
      c.fillStyle = '#092b21';
      c.beginPath();
      c.roundRect(8, 56, W - 16, H - 114, 16);
      c.fill();
      c.strokeStyle = '#d4a35933';
      c.lineWidth = 1.5;
      c.stroke();

      // Top rail header (strictly outside api.scoreArea())
      const sa = api.scoreArea();
      const hdrY = Math.max(66, sa.bottom + 18);
      icon(c, 'skull', 24, hdrY - 4, 16, { color: '#ff8fa3' });
      c.textAlign = 'left';
      c.fillStyle = '#ffffffdd';
      c.font = '700 12px Rubik, sans-serif';
      c.fillText('PIP · LVL ' + dial.level(5), 36, hdrY);

      c.textAlign = 'right';
      c.fillStyle = '#ffd166';
      c.font = '700 12px Rubik, sans-serif';
      c.fillText('SHOWDOWN ' + roundNum, W - 18, hdrY);

      feel.begin(c);

      // Pip's 3 lanes (top half)
      for (let l = 0; l < 3; l++) {
        const lx = LANE_X[l];
        const res = laneResult[l];
        c.fillStyle = res === -1 ? '#3b1522' : res === 1 ? '#0e3f2d' : '#07221b';
        c.beginPath();
        c.roundRect(lx, PIP_Y, LANE_W, PIP_H, 10);
        c.fill();

        if (res === -1) { c.strokeStyle = '#ff4d6d'; c.lineWidth = 2.2; c.stroke(); }
        else if (res === 1) { c.strokeStyle = '#38d399'; c.lineWidth = 2.2; c.stroke(); }
        else if (res === 2) { c.strokeStyle = '#ffd166'; c.lineWidth = 2; c.stroke(); }
        else if (pipFlash[l] > 0) { c.strokeStyle = '#ff8fa3'; c.lineWidth = 2; c.stroke(); }
        else { c.strokeStyle = '#ffffff18'; c.lineWidth = 1; c.stroke(); }

        // Empty slot markers
        for (let s = pipHands[l].length; s < 5; s++) {
          const sy = PIP_CARD_Y0 + s * PIP_STEP;
          c.strokeStyle = '#ffffff12';
          c.lineWidth = 1;
          c.beginPath();
          c.roundRect(lx + PIP_CARD_DX, sy, PIP_CARD_W, 18, 4);
          c.stroke();
        }

        // Pip's cards
        for (let s = 0; s < pipHands[l].length; s++) {
          const slot = pipSlots[l][s];
          const sy = PIP_CARD_Y0 + s * PIP_STEP - slot.pop * 8;
          drawCard(c, lx + PIP_CARD_DX, sy, PIP_CARD_W, PIP_CARD_H, slot.card, false, true);
        }

        // Pip's lane badge
        c.textAlign = 'center';
        c.fillStyle = res === -1 ? '#ff8fa3' : res === 1 ? '#7bf1a8' : '#a7d7c5';
        c.font = '700 11px Rubik, sans-serif';
        const pBadge = res !== 0 ? (res === -1 ? 'WIN · ' : res === 1 ? 'LOSE · ' : 'TIE · ') + pipLabel[l] : pipLabel[l];
        c.fillText(pBadge, LANE_CX[l], PIP_Y + PIP_H - 7);
      }

      // Fuse timer bar
      const fuseRatio = phase === 'pick' ? clamp(fuse / K.fuse, 0, 1) : 1;
      c.fillStyle = '#051a14';
      c.beginPath();
      c.roundRect(FUSE_X, FUSE_Y, FUSE_W, FUSE_H, 4);
      c.fill();
      if (phase === 'pick') {
        const fw = Math.max(4, FUSE_W * fuseRatio);
        c.fillStyle = fuseRatio > 0.5 ? '#38d399' : fuseRatio > 0.25 ? '#ffd166' : '#ff4d6d';
        c.beginPath();
        c.roundRect(FUSE_X, FUSE_Y, fw, FUSE_H, 4);
        c.fill();
        if (fuseRatio < 0.35) {
          c.fillStyle = '#fff5a0';
          c.beginPath();
          c.arc(FUSE_X + fw, FUSE_Y + FUSE_H * 0.5, 4.5 + Math.sin(t * 20) * 1.2, 0, 7);
          c.fill();
        }
      }

      // Middle Draft Tray
      // Left: Deck indicator
      c.fillStyle = '#184e3d';
      c.beginPath();
      c.roundRect(22, TRAY_CY - 30, 44, 60, 7);
      c.fill();
      c.strokeStyle = '#d4a35988';
      c.lineWidth = 1.5;
      c.stroke();
      c.textAlign = 'center';
      c.fillStyle = '#ffd166';
      c.font = '700 10px Rubik, sans-serif';
      c.fillText('DECK', 44, TRAY_CY - 6);
      c.fillStyle = '#ffffff';
      c.font = '800 15px Rubik, sans-serif';
      c.fillText(String(deck.size), 44, TRAY_CY + 14);

      // Right: Fuse countdown badge
      c.textAlign = 'center';
      c.fillStyle = fuse < 2.0 && phase === 'pick' ? '#ff6b81' : '#b7e4c7';
      c.font = '700 11px Rubik, sans-serif';
      c.fillText('FUSE', 316, TRAY_CY - 8);
      c.font = '800 16px Rubik, sans-serif';
      c.fillText(phase === 'pick' ? fuse.toFixed(1) + 's' : '--', 316, TRAY_CY + 13);

      // 2 Face-Up Drafted Cards
      if (phase === 'pick' && tray[0] && tray[1]) {
        const nudgePulse = trayNudge > 0 ? Math.sin(t * 28) * 3 : 0;
        for (let i = 0; i < 2; i++) {
          const isSel = selectedTray === i;
          const lift = isSel ? -7 : 0;
          const pop = trayPop[i] * 8;
          const tx = TRAY_X[i] + nudgePulse;
          const ty = TRAY_Y + lift - pop;
          drawCard(c, tx, ty, TRAY_W, TRAY_H, tray[i], isSel, false);
          if (isSel) {
            c.fillStyle = '#ffd166';
            c.font = '800 10px Rubik, sans-serif';
            c.textAlign = 'center';
            c.fillText('SELECTED', TRAY_CX[i], TRAY_Y - 11);
          }
        }
      } else if (phase === 'showdown') {
        c.textAlign = 'center';
        c.fillStyle = '#ffd166';
        c.font = '800 18px Rubik, sans-serif';
        c.fillText(settled ? 'TAP FOR NEXT ROUND' : 'EVALUATING LANES...', W * 0.5, TRAY_CY + 6);
      }

      // Tray action prompt
      c.textAlign = 'center';
      c.font = '700 11px Rubik, sans-serif';
      c.fillStyle = selectedTray >= 0 ? '#ffd166' : '#a7d7c5';
      if (phase === 'pick') {
        c.fillText(selectedTray >= 0 ? 'TAP AN OPEN LANE BELOW' : 'TAP A TRAY CARD TO DRAFT', W * 0.5, 379);
      }

      // Your 3 lanes (bottom half)
      for (let l = 0; l < 3; l++) {
        const lx = LANE_X[l];
        const full = youHands[l].length >= 5;
        const canPlace = phase === 'pick' && selectedTray >= 0 && !full;
        const res = laneResult[l];
        const jolt = foulFlash[l] > 0 ? Math.sin(t * 48) * 3 : 0;

        c.fillStyle = foulFlash[l] > 0 ? '#4a1525' : res === 1 ? '#124e38' : res === -1 ? '#381522' : '#08271e';
        c.beginPath();
        c.roundRect(lx + jolt, YOU_Y, LANE_W, YOU_H, 10);
        c.fill();

        if (foulFlash[l] > 0) { c.strokeStyle = '#ff4d6d'; c.lineWidth = 2.5; c.stroke(); }
        else if (res === 1) { c.strokeStyle = '#38d399'; c.lineWidth = 2.4; c.stroke(); }
        else if (res === -1) { c.strokeStyle = '#ff4d6d'; c.lineWidth = 2.2; c.stroke(); }
        else if (res === 2) { c.strokeStyle = '#ffd166'; c.lineWidth = 2; c.stroke(); }
        else if (canPlace) {
          c.strokeStyle = '#ffd166';
          c.lineWidth = 2;
          c.stroke();
        } else {
          c.strokeStyle = full ? '#ffffff28' : '#ffffff18';
          c.lineWidth = 1;
          c.stroke();
        }

        // Your lane top label
        c.textAlign = 'center';
        c.font = '700 11px Rubik, sans-serif';
        c.fillStyle = res === 1 ? '#7bf1a8' : res === -1 ? '#ff8fa3' : canPlace ? '#ffd166' : '#a7d7c5';
        const yBadge = res !== 0 ? (res === 1 ? 'WIN · ' : res === -1 ? 'LOSE · ' : 'TIE · ') + youLabel[l] : youLabel[l];
        c.fillText(yBadge, LANE_CX[l] + jolt, YOU_Y + 17);

        // Empty slots + next-card ghost highlight
        for (let s = youHands[l].length; s < 5; s++) {
          const sy = YOU_CARD_Y0 + s * YOU_STEP;
          const isNext = s === youHands[l].length && canPlace;
          c.strokeStyle = isNext ? '#ffd166aa' : '#ffffff14';
          c.lineWidth = isNext ? 1.5 : 1;
          c.beginPath();
          c.roundRect(lx + YOU_CARD_DX + jolt, sy, YOU_CARD_W, 20, 4);
          c.stroke();
        }

        // Your cards
        for (let s = 0; s < youHands[l].length; s++) {
          const slot = youSlots[l][s];
          const sy = YOU_CARD_Y0 + s * YOU_STEP - slot.pop * 8;
          drawCard(c, lx + YOU_CARD_DX + jolt, sy, YOU_CARD_W, YOU_CARD_H, slot.card, false, true);
        }

        // Slot counter
        c.textAlign = 'center';
        c.font = '600 10px Rubik, sans-serif';
        c.fillStyle = full ? '#ffd166aa' : '#ffffff55';
        c.fillText(youHands[l].length + '/5', LANE_CX[l] + jolt, YOU_Y + YOU_H - 6);
      }

      feel.end(c, W, H);

      // Ready prompt overlay
      if (ready.waiting) {
        c.fillStyle = '#071d16cc';
        c.beginPath();
        c.roundRect(60, 290, W - 120, 46, 12);
        c.fill();
        c.strokeStyle = '#ffd16688';
        c.lineWidth = 1.5;
        c.stroke();
      }
      ready.draw(c, W, H, { y: 318, color: '#ffd166', size: 17 });

      // Bottom HUD bar (well clear of api.scoreArea())
      for (let i = 0; i < K.lives; i++) {
        icon(c, 'heart', 24 + i * 22, HUD_Y, 19, {
          color: i < lives ? '#ff4d6d' : '#ffffff26',
        });
      }

      // Status toast
      c.textAlign = 'center';
      c.font = '700 12px Rubik, sans-serif';
      c.fillStyle = statusT > 0 ? statusCol : '#b7e4c7';
      c.fillText(statusT > 0 ? statusMsg : 'Picks ' + totalYouCards() + '/15', W * 0.54, HUD_Y + 4);

      // Right HUD: Showdowns won + streak
      icon(c, 'trophy', W - 56, HUD_Y, 17, { color: '#ffd166' });
      c.textAlign = 'left';
      c.fillStyle = '#ffffff';
      c.font = '700 13px Rubik, sans-serif';
      c.fillText(String(showdownsWon), W - 44, HUD_Y + 5);

      if (streak > 0) {
        icon(c, 'flame', W - 26, HUD_Y, 16, { color: '#ff8833' });
        c.fillStyle = '#ffd166';
        c.fillText(String(streak), W - 16, HUD_Y + 5);
      }
    },

    down(x, y) {
      if (ready.go()) return;
      if (ended) return;

      if (phase === 'showdown') {
        if (settled && showT >= 1.85) startRound();
        return;
      }

      // Check Tray cards (generous touch padding)
      if (y >= TRAY_Y - 16 && y <= TRAY_Y + TRAY_H + 12) {
        for (let i = 0; i < 2; i++) {
          if (x >= TRAY_X[i] - 10 && x <= TRAY_X[i] + TRAY_W + 10) {
            selectedTray = i;
            trayPop[i] = 1;
            sounds.select();
            haptic('light');
            return;
          }
        }
      }

      // Check Your 3 lanes
      if (y >= YOU_Y - 12 && y <= YOU_Y + YOU_H + 8) {
        const lane = x < 123 ? 0 : x < 237 ? 1 : 2;
        placePlayerCard(lane);
      }
    },

    key(k, isDown) {
      if (!isDown || ended) return;
      if (ready.go()) return;

      if (phase === 'showdown') {
        if (settled && (k === ' ' || k === 'Enter')) startRound();
        return;
      }

      if (k === '1') {
        selectedTray = 0; trayPop[0] = 1; sounds.select(); return;
      }
      if (k === '2') {
        selectedTray = 1; trayPop[1] = 1; sounds.select(); return;
      }
      if (k === 'a' || k === 'A' || k === 'ArrowLeft') {
        placePlayerCard(0); return;
      }
      if (k === 's' || k === 'S' || k === 'ArrowDown') {
        placePlayerCard(1); return;
      }
      if (k === 'd' || k === 'D' || k === 'ArrowRight') {
        placePlayerCard(2); return;
      }
      if (k === ' ' && selectedTray < 0) {
        selectedTray = 0; trayPop[0] = 1; sounds.select();
      }
    },

    debug(c) {
      c.strokeStyle = '#0f8';
      c.lineWidth = 1;
      for (let i = 0; i < 2; i++) {
        c.strokeRect(TRAY_X[i] - 10, TRAY_Y - 16, TRAY_W + 20, TRAY_H + 28);
      }
      for (let l = 0; l < 3; l++) {
        c.strokeRect(LANE_X[l], YOU_Y - 12, LANE_W, YOU_H + 20);
      }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'card-lanes',
  title: 'Card Lanes',
  tag: 'Casual · Cards',
  retro: false,
  w: W,
  h: H,
  tick: 60,
  music: 'puzzle',
  goal: 60,
  hint: 'Draft one of the two tray cards and place it into your 3 poker lanes before the fuse expires. Beat Pip in at least 2 lanes per showdown!',
  creator: 'Antigravity',
  make,
};
