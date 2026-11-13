import './polyfill.js';   // first: old WebViews get what the rest of the app expects
import './style.css';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-700.css';
import '@fontsource/rubik/latin-800.css';
import { store, hash, fmt } from './util.js';
import { sfx } from './sfx.js';
import { openFeel, feelIcon } from './feel.js';
import { PAL, SHELL } from './palettes.js';
import { isHidden, setRating, rating, logRound, toast as qaToast, openPanel } from './qa.js';
import { rankQueue as rank, explain } from './recommend.js';
import { live, feedBrain } from './feedsignals.js';
const rankQueue=(pool,all)=>rank(pool,all,live);
import { openMyGames } from './mygames.js';
import { post as consolePost } from './kit/gfx.js';
import { progress, rewardOf } from './kit/progress.js';
import { checkTrophies } from './kit/trophies.js';
import { services } from './kit/services.js';
import { initWallet, toast, shopHTML, bindShop } from './kit/wallet-ui.js';

import { haptic, want } from './kit/device.js';
import { pollPads } from './kit/gamepad.js';
import { stopAll, pauseAll, resumeAll, ownedBy, release } from './kit/cleanup.js';
import * as slices from './kit/slices.js';
import { stats as jobStats } from './kit/jobs.js';
import { tickRate, runTicks, beforeDraw, resetTicks } from './kit/tick.js';
import { getready, waiting as kitsWaiting, Steady } from './kit/getready.js';
// Things a game may leave running (music, the camera for face tracking, motion moves): stopped when a round ends or the player leaves.
const stopKits=stopAll;   // every kit registers its own stop (src/kit/cleanup.js)
import { remote } from './remote.js';
import { openSettings } from './settings.js';
import { nativeARProbe, nativeARSupported } from './kit/native-ar.js';
import { hearts } from './hearts.js';
import { playstats } from './playstats.js';
import { boards, rankHTML, openBoard } from './boards.js';
import { perf } from './perf.js';
import { onMemory, forceMemory, memory } from './kit/memory.js';
import { speed, fpsFor, tick as tickHz, screenHz, frameLate, screenWish, phoneClass, autoFps } from './kit/speed.js';
import { keepAwake, awake } from './kit/awake.js';
import * as fontlib from './kit/fontlib.js';
import * as pixelKit from './kit/pixel.js';
import { history } from './history.js';
import { savesFor, localSavesFor } from './saves.js';
import { soundtrack } from './soundtrack.js';
import { brainsFor, sendFun } from './brainstore.js';
import { liveBrains, brainStats } from './kit/brains.js';
import { ran as gameRan, awayFor } from './away.js';
import { initBar, onBarMove, placeBar } from './topbar.js';
import { geoFor, roundStarted, roundEnded } from './geo.js';
import { makeDebug } from './debug.js';
import { show as showTweaks } from './kit/tweak.js';
import { shareGame, onSharedGame } from './share.js';
import { canFull, isFull, anyFull, enterFull, leaveFull, toggleFull, onFullChange } from './fullscreen.js';
import { desktop } from './desktop.js';
// (the Mac and Windows app has a mouse wheel and arrow keys, not a thumb)
const NEXT_CUE=desktop?'Scroll or press ↓ for the next game':'Swipe up for the next game';
import BUNDLED,{fresh as FRESH} from 'virtual:bundled-games';

/* ---------- catalogue ---------- */
// The app streams every game from the game host (src/remote.js): GAMES holds each game's metadata from
// the online catalogue, and a game's code downloads just before it comes up in the feed.
// Dev and test builds (--mode bundled) have every file in src/games/ built in instead.
const GAMES = BUNDLED.filter(g => g && g.id && g.make).map(g => ({ likes: 300 + hash(g.id) % 6000, ...g }));
const STREAM = remote.enabled;
perf.versionOf = id => STREAM ? remote.version(id) : '';   // reports say which version of a game's file they are about
const playable = g => STREAM ? remote.def(g) : g;   // null while a streamed game is still downloading
let booted = false;
if (STREAM) remote.init(meta => { const g = { likes: 300 + hash(meta.id) % 6000, ...meta }; GAMES.push(g); return g; },
  (added, updated) => { if (booted) catalogueChanged(added, updated); });

/* ---------- feed engine ---------- */
const feed=document.getElementById('feed');
let slides=[],active=null,filter='all',lastId=null,io,solo=false;   // (solo, tests: the game picked with __gs.only(id, true) goes on one card, not six)
// Guest: while the phone test tour's bot plays (src/tour.js; the driver is further down), nothing it does
// is kept. Cards made meanwhile get saves and brains that go nowhere (guest is the function that makes
// them), and a round pays no credits, sets no best, sends no score or play stats and teaches no brain.
// Frame timings and errors still count: those are real ones from this phone.
let guest=null;

// How far along a loading card is: the passes it has taken (each wait for a library, a background worker
// or the next frame is one, src/kit/slices.js) out of how many this game took the last time it loaded
// on this phone. The first time there is nothing to go by, so the bar eases along and never quite fills.
const LOADS=store.get('gs_loads',{});
const loadFrac=s=>{const n=s.passes||0,of=LOADS[s.def.id];return Math.min(.96,of>1?n/of:1-Math.exp(-n/6))};
const loadDone=s=>{const n=s.passes||0;s.passes=0;if(n<2||LOADS[s.def.id]===n)return;LOADS[s.def.id]=n;const k=Object.keys(LOADS);if(k.length>400)delete LOADS[k[0]];store.set('gs_loads',LOADS)};
// Makes the game. A game whose kit is still loading (the physics engine is a few MB, so it loads the
// first time it's needed) throws an error carrying e.kitLoading: show a "loading" screen until it's in,
// then make the game again. A kit that fails to load, or a game that throws while it's being made or
// reset, must not take the feed with it: its card says so and a tap tries again.
const stubGame=(s,msg,what='')=>({reset(){},update(){},draw(c){const w=s.w||s.def.w,h=s.h||s.def.h,f=Math.round(Math.min(w,h)/14);c.fillStyle='#111';c.fillRect(0,0,w,h);c.fillStyle='#bbb';c.font=`${f}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(msg,w/2,h/2);
  if(!s.loading||s.failed)return;   // (a card that is loading: its bar, and what it is waiting for)
  const bw=Math.round(w*.5),bh=Math.max(2,Math.round(f/5)),bx=Math.round((w-bw)/2),by=Math.round(h/2+f);c.fillStyle='#333';c.fillRect(bx,by,bw,bh);c.fillStyle='#bbb';c.fillRect(bx,by,Math.round(bw*loadFrac(s)),bh);
  if(what){c.fillStyle='#777';c.font=`${Math.max(6,Math.round(f*.55))}px sans-serif`;c.fillText(what,w/2,by+bh+f*.7)}}});
// A big 3D game is made a little each frame while its card says "Loading…" (src/kit/slices.js): a kit
// builder that has used the frame's share stops the pass, like a library that isn't in yet, and the next
// pass gets what is already built straight back. A pass that is stopped must leave nothing of the game
// behind (a game that keeps its world between makes, `if (!view) setup()`, would find it half built), so
// each pass runs on a fresh copy of the game's file, and the copy that reaches the end is the game from
// then on: KEPT has its make(), and cards of the game made later share what it built, as they always did.
const SLICED=new Set(['nextgen','ar','board']);
const KEPT=new WeakMap();   // definition -> make() of the copy that finished loading
const BUSY=new WeakMap();   // definition -> the promise of work a card of it left with the workers, while it is out
let copies=0;
// a fresh copy of the game's file: its definition, a promise of it (the test build fetches the file again), or null
const freshCopy=def=>{try{return(STREAM?remote.fresh(def.id):FRESH[def.id]?.(++copies))||null}catch(e){return null}};
// slice false: a game swapped in mid-round by hot reload is made in one go, so the round it was in can be put back
function bootGame(s,slice=true){
  s.failed=null;resetTicks(s);
  s.passes=(s.passes||0)+1;
  const turn=s.turn=(s.turn||0)+1,kept=KEPT.get(s.def);   // (turn: a pass that was asked for before this one is out of date)
  if(slice&&!kept&&SLICED.has(s.def.era)){
    const f=freshCopy(s.def);
    if(f&&f.then){
      s.loading=true;s.game=stubGame(s,'Loading…',s.what||'');
      f.then(d=>d,()=>null).then(d=>{if(s.dropped||s.turn!==turn)return;const ok=!!(d&&typeof d.make==='function');makeGame(s,ok?d.make:s.def.make,ok,slice);s.dirty=true;renderOverlay(s)});
      return;
    }
    if(f&&typeof f.make==='function'){makeGame(s,f.make,true,slice);return}
  }
  makeGame(s,kept||s.def.make,false,slice);
}
// One pass of make() + reset(). fresh: on a copy of the game's file that nothing else has seen, so the
// kit's builders may stop it; otherwise it runs to the end (work can still be left with the workers).
function makeGame(s,make,fresh,slice){
  // (a game being played leaves a loading neighbour a smaller share of each frame)
  if(slice)slices.begin(s,active&&active!==s&&(active.state==='playing'||active.starting)?3:6,!fresh);else slices.forget(s);
  try{
    // (a game made again after "Loading…" is a new game: tell it the size its card already has, as fit() told the first)
    ownedBy(s,()=>{s.game=make(s.api);s.game.reset();if(s.w&&(s.w!==s.def.w||s.h!==s.def.h)&&s.game.resize)s.game.resize(s.w,s.h)});
    let more=slices.end(s,true);
    if(fresh)KEPT.set(s.def,make);
    // (another card of this game may have left work with the workers that this one shares: wait for that too)
    const also=BUSY.get(s.def);
    if(more||also){const all=more&&also?Promise.all([more,also]):more||also;BUSY.set(s.def,all);all.then(()=>{if(BUSY.get(s.def)===all)BUSY.delete(s.def)});more=all}
    if(more)holdGame(s,more);else{s.loading=false;loadDone(s)}
  }catch(e){
    slices.end(s,false);
    if(e&&e.kitLoading){
      release(s);   // what the unfinished pass started (a physics world, a sensor) is let go now, not when the card leaves
      s.loading=true;s.what=e.what||'';s.game=stubGame(s,'Loading…',s.what);
      const turn=s.turn;
      e.kitLoading.then(()=>{if(s.dropped||s.turn!==turn)return;bootGame(s,slice);s.dirty=true;renderOverlay(s)},err=>{if(s.dropped||s.turn!==turn)return;console.warn('kit failed to load',err);broken(s,'Couldn’t load this game. Check the connection and try again.')});
      return;
    }
    s.passes=0;slices.forget(s);gameFault(s,e);
  }
}
// The game is made, but number work its builders left with background workers (a texture's bumps) is still
// out: the card says "Loading…" a moment longer, then shows the game it already has. Folding the phone
// or dropping the card meanwhile reaches the real game through the stand-in.
function holdGame(s,more){
  const g=s.game,stub=stubGame(s,'Loading…','Textures');
  stub.dispose=()=>g.dispose?.();if(g.resize)stub.resize=(w,h)=>ownedBy(s,()=>g.resize(w,h));
  s.loading=true;s.game=stub;
  more.then(()=>{if(s.dropped||s.game!==stub)return;s.game=g;s.loading=false;loadDone(s);s.dirty=true;renderOverlay(s)});
}
function gameFault(s,e){console.error(s.def.id,e);perf.error(e,s.def.id);broken(s,'This game hit a problem.')}
function broken(s,why){dropReady(s);if(isFull(s))leaveFull();if(s.state==='playing')try{gameOver(s)}catch(_){}try{s.game?.dispose?.()}catch(_){}release(s);s.loading=true;s.failed=why;s.game=stubGame(s,'Tap to try again');s.dirty=true;if(s.state!=='ready'){s.state='ready';s.el.classList.remove('playing','over');feed.classList.remove('locked')}renderOverlay(s)}
// A new round: false (and the card shows the problem) if the game threw.
function resetGame(s){resetTicks(s);try{ownedBy(s,()=>s.game.reset());return true}catch(e){if(e&&e.kitLoading){resetLater(s,e);return false}gameFault(s,e);return false}}
// reset() asked for a lazy part or a sculpt that isn't in yet (a mission's people, when the next round is another
// mission's: Play again after mission 1): the card says "Loading…" until it is in, and the game is reset again, as
// a card being made waits (makeGame). The game itself is kept: a stand-in draws the wait. Play's loading screen
// (getReady) waits on the same, then starts the round; a card waiting in the feed is reset once it is in.
function resetLater(s,e){
  const g=s.game,stub=stubGame(s,'Loading…',e.what||'');
  stub.dispose=()=>g.dispose?.();if(g.resize)stub.resize=(w,h)=>ownedBy(s,()=>g.resize(w,h));
  s.loading=true;s.what=e.what||'';s.game=stub;
  Promise.resolve(e.kitLoading).then(()=>{if(s.dropped||s.game!==stub)return;s.game=g;s.loading=false;s.dirty=true;if(!s.starting&&resetGame(s))renderOverlay(s)},
    err=>{if(s.dropped||s.game!==stub)return;s.game=g;console.warn('kit failed to load',err);broken(s,'Couldn’t load this game. Check the connection and try again.')});
}
function makeSlide(def){
  const el=document.createElement('section');el.className='slide '+(def.retro?'retro':'modern')+(def.era==='console'?' console':def.era==='nextgen'?' console nextgen':def.era==='ar'?' console nextgen ar':def.era==='board'?' console nextgen board':'');
  if(def.retro){const p=PAL[def.pal||'moss'];p.forEach((c,i)=>el.style.setProperty('--lcd'+i,c));el.style.setProperty('--shell',SHELL[def.pal||'moss']);}el.setAttribute('aria-label',def.title);
  el.innerHTML=`
    <div class="stage"><div class="device">
      ${def.retro?`<div class="bezel-top${def.era?' dark':''}"><span class="led"></span>${def.era==='console'?'<b class="era">CLASSIC</b> · CONSOLE':def.era==='nextgen'?'<b class="era">NEXT GEN</b> · CONSOLE<button class="fsbtn" aria-label="Full screen" title="Full screen"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 5.5v-4h4M10.5 1.5h4v4M14.5 10.5v4h-4M5.5 14.5h-4v-4"/></svg></button>':def.era==='ar'?'<b class="era">AR</b> · 3D':def.era==='board'?'<b class="era">BOARD</b> · GAME':def.era==='advance'?'<b class="era">ADVANCE</b> · POCKET':def.era==='color'?'<b class="era rainbow">COLOR</b> · POCKET':'DOT MATRIX · POCKET'}</div>`:''}
      <div class="screen"><canvas></canvas><div class="hud"><span class="score">0</span></div><div class="overlay"></div></div>
      ${def.era==='console'||def.era==='nextgen'||def.era==='ar'||def.era==='board'?'<div class="bezel-bottom"><span class="slot"></span><span class="pads"><i></i><i></i><i></i></span></div>':def.retro?'<div class="bezel-bottom"><span class="dpad"></span><span class="ab"><i></i><i></i></span></div>':''}
    </div></div>
    <div class="meta">
      <button class="caption" aria-label="How to play ${def.title}"><span class="tag">${def.tag}</span><h2>${def.title}</h2><p>${def.hint}</p><span class="more"><b>ⓘ How to play</b> · Best <span class="best">0</span></span></button>
      <div class="rail">
        <button class="rbtn like" aria-pressed="false"><span class="ic">♥</span><span class="n"></span></button>
        <button class="rbtn meh" aria-label="Meh: hide this game"><span class="ic">👎</span><span>Meh</span></button>
        <button class="rbtn walletbtn" aria-label="Credits and trophies"><span class="ic">◆</span><span class="n">${fmt(progress.credits)}</span></button>
        <button class="rbtn sharebtn" aria-label="Share this game"><span class="ic">↗</span><span>Share</span></button>
        <button class="rbtn nextbtn" aria-label="Next game"><span class="ic">↓</span><span>Next</span></button>
      </div>
    </div>`;
  const s={def,el,canvas:el.querySelector('canvas'),screen:el.querySelector('.screen'),overlay:el.querySelector('.overlay'),scoreEl:el.querySelector('.score'),
    state:'ready',score:0,overAt:0,dirty:true,w:def.w,h:def.h};
  s.ctx=s.canvas.getContext('2d');
  // a pocket game draws on its own small canvas, one canvas pixel per game pixel; present() copies that up to the card
  if(isPixel(def)){s.out=s.ctx;s.lcd=lcdOf(def);s.off=document.createElement('canvas');s.off.width=def.w;s.off.height=def.h;s.ctx=s.off.getContext('2d',s.lcd&&s.lcd.ghost?{willReadFrequently:true}:undefined)}
  s.api={
    score:n=>{s.score=n;badge(s,n);if(def.goal&&n>=def.goal)win(s)},
    over:()=>gameOver(s),
    win:()=>win(s),                                     // for games with a natural win (cleared the board, etc.)
    has:id=>!!(s.run&&s.run.items.has(id)),             // is this shop item active for the current run?
    ...savesFor(def),                                     // save(data) / load(fallback) / clearSave(): this game's own save slot
    ...localSavesFor(def),                                // saveLocal / loadLocal / clearLocal: a bigger slot that stays on this phone
    ...awayFor(def.id),                                 // away(): seconds since this game last ran (idle games)
    brains:brainsFor(def.id),                            // where this game's Tiny Brains keep what they learned (src/brainstore.js)
    ...geoFor(def),                                     // location() / watchLocation(cb): rounded, only during a round (src/geo.js)
    scoreArea:()=>scoreArea(s),                         // where the app's score badge sits, in game units, so HUDs can keep clear of it
    ahead:id=>aheadOf(s,id),                            // where a finger that's down is heading by the next refresh ([x, y] in game units), or null
  };
  if(guest)Object.assign(s.api,guest(s.api));
  bootGame(s);
  // like
  const likeBtn=el.querySelector('.like'),liked=rating(def.id)>0||(rating(def.id)===0&&store.get('gs_like_'+def.id,false));
  // Shared counts come from the hearts backend; dev/test builds without it keep the old local number.
  const setLike=v=>{likeBtn.setAttribute('aria-pressed',v);likeBtn.querySelector('.n').textContent=fmt(hearts.enabled?hearts.count(def.id,v):def.likes+(v?1:0))};setLike(liked);
  likeBtn.onclick=()=>{const v=likeBtn.getAttribute('aria-pressed')!=='true';if(v)funNote(s,'heart');store.set('gs_like_'+def.id,v);setRating(def.id,v?1:0);hearts.set(def.id,v);rerank();document.querySelectorAll('.slide').forEach(x=>{if(x._s&&x._s.def.id===def.id)x._s.setLike(v)})};
  s.setLike=setLike;
  el.querySelector('.meh').onclick=()=>{funNote(s,'meh');const was=rating(def.id);setRating(def.id,-1);if(likeBtn.getAttribute('aria-pressed')==='true'){store.set('gs_like_'+def.id,false);setLike(false);hearts.set(def.id,false)}
    rerank();qaToast(`Hidden: ${def.title}`,()=>{setRating(def.id,was);rerank()});goNext(s)};
  el.querySelector('.nextbtn').onclick=()=>goNext(s);
  el.querySelector('.sharebtn').onclick=async()=>{haptic('light');const r=await shareGame(def,best(def.id));if(r==='copied')toast(el,'Link copied','info')};
  s.overlay.onclick=e=>{if(Date.now()-s.overAt<550)return;startGame(s)};
  // pointer input
  const at=(e,r)=>[(e.clientX-r.left)/r.width*s.w,(e.clientY-r.top)/r.height*s.h],pt=e=>at(e,s.canvas.getBoundingClientRect());
  // Multi-touch: each finger is tracked by its pointer id, passed to the game as the last argument
  // (down(x, y, id), move(x, y, pressed, id), up(x, y, id)). One-finger games can ignore it.
  const held=new Set();s.ahead=new Map();
  s.canvas.addEventListener('pointerdown',e=>{if(s.state!=='playing')return;held.add(e.pointerId);lastGameInput=performance.now();soundtrack.tap();try{s.canvas.setPointerCapture(e.pointerId)}catch(_){}e.preventDefault();s.game.down&&s.game.down(...pt(e),e.pointerId)});
  // Finer touch (touch: 'fine' in the definition): a screen reads a finger more often than it draws (often
  // 240 times a second), and the browser hands over one move per refresh with the readings in between tucked
  // inside it. A game that asks gets every one of them while a finger is down, oldest first, so drawn lines
  // and flicks follow the real path instead of cutting corners (at most FINE per move, the newest ones). It's
  // a choice because move() then runs several times a frame: right for drawing, wrong for a game that reads
  // the last move's distance as a speed. Where the browser also guesses where the finger is heading, the
  // guess for the next refresh is kept for api.ahead(id), to draw the tip of a line under the finger.
  s.canvas.addEventListener('pointermove',e=>{
    if(s.state!=='playing')return;const pressed=held.has(e.pointerId);if(pressed)lastGameInput=performance.now();
    const r=s.canvas.getBoundingClientRect();
    if(pressed){
      let pr=null;try{pr=e.getPredictedEvents?.()}catch(_){}
      if(pr&&pr.length){const lim=e.timeStamp+1000/screenHz()+2;let k=0;while(k+1<pr.length&&pr[k+1].timeStamp<=lim)k++;s.ahead.set(e.pointerId,{at:performance.now(),p:at(pr[k],r)})}else s.ahead.delete(e.pointerId);
    }
    if(!s.game.move)return;
    let all=null;if(pressed&&s.def.touch==='fine')try{all=e.getCoalescedEvents?.()}catch(_){}
    if(all&&all.length>1){for(let i=Math.max(0,all.length-FINE);i<all.length;i++){if(s.state!=='playing')break;s.game.move(...at(all[i],r),true,e.pointerId)}}
    else s.game.move(...at(e,r),pressed,e.pointerId);
  });
  const up=e=>{s.ahead.delete(e.pointerId);if(!held.delete(e.pointerId))return;if(s.state==='playing'&&s.game.up)s.game.up(...pt(e),e.pointerId)};
  s.canvas.addEventListener('pointerup',up);s.canvas.addEventListener('pointercancel',up);
  s.canvas.addEventListener('contextmenu',e=>e.preventDefault());
  el._s=s;
  el.querySelector('.caption').onclick=()=>openInfo(s);
  if(canFull(def))el.querySelector('.fsbtn').onclick=e=>{e.stopPropagation();haptic('light');toggleFull(s)};
  renderOverlay(s);updateBest(s);
  return s;
}

/* ---------- how-to-play sheet: tapping the caption opens the full description ---------- */
let infoDlg=null;
// who made the game: def.creator (plain text, set by contributors), otherwise Rob
const creatorOf=d=>String(d.creator||'Rob').slice(0,40).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
function openInfo(s){
  const d=s.def;
  if(!infoDlg){infoDlg=document.createElement('dialog');infoDlg.className='info';document.body.appendChild(infoDlg);
    infoDlg.addEventListener('click',e=>{if(e.target===infoDlg)infoDlg.close()});
    infoDlg.addEventListener('close',()=>{const t=infoDlg._s;if(t&&t.pauseWhy==='info')resumeGame(t)})}
  infoDlg._s=s;pauseGame(s,'info');
  const kind=d.era==='console'?'Classic · Console game':d.era==='nextgen'?'Next Gen · Console game':d.era==='ar'?'AR 3D game: uses your camera and motion sensor':d.era==='board'?'Board game: on a table in 3D, or in your own room with AR':d.era==='advance'?'Advance-style pocket game':d.era==='color'?'Colour pocket game':d.retro?'Dot-matrix pocket game':'Phone game';
  infoDlg.innerHTML=`<div class="info-card"><button class="info-x" aria-label="Close">✕</button>
    <span class="tag">${d.tag}</span><h2>${d.title}</h2><div class="info-by">Created by <b>${creatorOf(d)}</b></div><div class="info-k">${kind}</div>
    <h3>How to play</h3><p>${d.hint}</p>${locNote(d)}${sensorNote(d)}
    <div class="info-stats"><div><b>${fmt(best(d.id))}</b>Your best</div>${d.goal?`<div><b>${d.goal}</b>Score to win</div>`:''}</div>
    <button class="play info-play">${s.state==='playing'?'Keep playing':'Play'}</button></div>`;
  infoDlg.querySelector('.info-x').onclick=()=>infoDlg.close();
  infoDlg.querySelector('.info-play').onclick=()=>{const was=s.state;infoDlg.close();if(was!=='playing'&&active===s&&Date.now()-s.overAt>550)startGame(s)};
  infoDlg.showModal();
}
// Finer touch (see makeSlide): the most readings handed to a game per move, and api.ahead(id): the browser's
// guess for where that finger (or, with no id, the finger that moved last) will be at the next refresh.
// Null when the browser doesn't guess, the finger is up, or it has stopped moving (a stale guess).
const FINE=8;
function aheadOf(s,id){
  let a=null;if(id!=null)a=s.ahead.get(id);else for(const v of s.ahead.values())if(!a||v.at>a.at)a=v;
  return a&&performance.now()-a.at<50?[a.p[0],a.p[1]]:null;
}
function best(id){return progress.best(id)}
function updateBest(s){s.el.querySelector('.best').textContent=fmt(best(s.def.id))}

// Games that use location say so before Play, so the phone's question doesn't come out of nowhere.
// ...and so do games that use the camera, mic or motion sensor (worked out from their code), and
// iPhones get asked for motion access on the Play tap instead of in the middle of a round.
const SENSOR_WORDS={camera:'camera',mic:'microphone',steps:'step counter',pressure:'air pressure sensor',light:'light sensor',near:'proximity sensor',motion:'motion sensor'};
const sensorNote=d=>{if(d.era==='board'&&d.ar!==false)return'<div class="ov-loc">📷 Tap AR in the game to put the board in your own room. The camera is only used then, and nothing is recorded or leaves your phone.</div>';const u=(d.uses||[]).filter(k=>SENSOR_WORDS[k]);if(!u.length||d.era==='ar')return'';const w=u.map(k=>SENSOR_WORDS[k]);
  return`<div class="ov-loc">${u.includes('camera')?'📷':u.includes('mic')?'🎤':u.includes('steps')?'👟':'📱'} Uses your ${w.length>1?w.slice(0,-1).join(', ')+' and '+w[w.length-1]:w[0]}${u.includes('camera')||u.includes('mic')?'. Nothing is recorded or leaves your phone':''}.</div>`};
const locNote=d=>d.location?`<div class="ov-loc">📍 Uses your ${d.location==='precise'?'location to walk around':'rough area (about 1 km)'}. It stays on your phone, and you can say no.</div>`:'';
function renderOverlay(s){
  const d=s.def,cue=`<div class="swipe-cue">${NEXT_CUE}</div>`;
  if(s.failed){s.overlay.innerHTML=`<div class="ov-k">Oops</div><div class="ov-title">${d.title}</div><div class="ov-hint">${s.failed}</div><button class="play">Try again</button>${cue}`;s.overlay.hidden=false;return}
  if(s.state==='ready'){
    if(d.uses?.includes('motion'))want('motion');
    s.overlay.innerHTML=`<div class="ov-k">${d.era==='nextgen'||d.era==='ar'?'Ready':d.era==='board'?'Take a seat':d.retro?'Insert coin':'Tap to start'}</div><div class="ov-title">${d.title}</div><div class="ov-hint">${d.hint}</div>${goalHTML(d)}${locNote(d)}${sensorNote(d)}<button class="play">${d.retro?'PRESS START':'Play'}</button>${shopHTML(d)}${cue}`;
    bindShop(s.overlay,d,()=>renderOverlay(s));
  }else if(s.state==='over'){
    const b=best(d.id),isNew=s.score>0&&s.score>=b&&s.newBest;
    const res=s.paid?`<div class="ov-win">${s.won==='first'?'FIRST WIN ':'WIN '}+${s.paid} CREDITS</div>`:d.goal?`<div class="ov-goal">Score ${d.goal} to win credits</div>`:'';
    s.el.querySelectorAll('.toast').forEach(t=>t.remove());   // the game-over screen repeats what they said
    const tro=(s.trophies||[]).map(t=>`<div class="ov-trophy">🏆 ${t.name}</div>`).join('');
    s.overlay.innerHTML=`<div class="ov-k">${s.paid?'You won':'Game over'}</div><div class="ov-score">${s.score}</div>${isNew?'<div class="ov-new">NEW BEST</div>':`<div class="ov-best">Best ${b}</div>`}${res}${tro}${rankHTML(s.rank)}<button class="play">${d.retro?'RETRY':'Play again'}</button>${shopHTML(d)}${cue}`;
    bindShop(s.overlay,d,()=>renderOverlay(s));
    s.overlay.querySelector('.ov-rank')?.addEventListener('click',e=>{e.stopPropagation();openBoard(d)});
  }
  s.overlay.hidden=s.state==='playing';
}

function goalHTML(d){
  if(!d.goal)return'';
  const w=progress.wins(d.id),r=rewardOf(d.reward);
  return d.retro?`<div class="ov-goal">Win at ${d.goal} · <b>+${w?r:r*2}</b> credits</div>`
    :`<div class="ov-goal">Score ${d.goal} to win <b>◆${w?r:r*2}</b>${w?'':' (first win pays double)'}</div>`;
}

// Pause and resume. A round pauses when the app goes to the background (a call, the home button,
// another app), while the How to play card is open, or on Escape / a controller's Start button. The
// game hears about it through its optional pause() / resume() hooks (stop timers, the mic...), music
// holds where it is, and the player taps "Carry on" to continue (the card resumes by itself on close).
function pauseGame(s,why='away'){
  if(!s||s.state!=='playing'||s.paused)return;
  s.paused=true;s.pauseWhy=why;pauseAll();
  try{s.game.pause?.()}catch(e){console.error(s.def.id,e)}
  if(why!=='info')pauseOv(s);
}
function pauseOv(s){
  {
    let el=s.screen.querySelector('.pause-ov');
    if(!el){el=document.createElement('div');el.className='overlay pause-ov';s.screen.appendChild(el)}
    el.onclick=e=>{e.stopPropagation();resumeGame(s)};
    el.innerHTML=`<div class="ov-k">Paused</div><div class="ov-title">${s.def.title}</div><button class="play">${s.def.retro?'CONTINUE':'Carry on'}</button>${isFull(s)?'<button class="fs-exit">Exit full screen</button>':''}`;
    const fx=el.querySelector('.fs-exit');if(fx)fx.onclick=e=>{e.stopPropagation();leaveFull()};
    el.hidden=false;
  }
}
function resumeGame(s){
  if(!s||!s.paused)return;
  s.paused=false;s.pauseWhy=null;const el=s.screen.querySelector('.pause-ov');if(el)el.hidden=true;
  lastT=performance.now();perf.gap();
  if(s.state!=='playing')return;
  try{s.game.resume?.()}catch(e){console.error(s.def.id,e)}
  resumeAll();
}
function clearPause(s){s.paused=false;s.pauseWhy=null;const el=s.screen.querySelector('.pause-ov');if(el)el.hidden=true}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)pauseGame(active,'away')});

// Fun signals for the game's Tiny Brains (src/brainstore.js): what the player did around a round
// says how fun it was. Played again within 30 s +1, hearted +1 (during or within a minute of the
// round), Meh -1, left the game-over screen within 4 s -0.5. One "again or left" signal per round.
function funNote(s,what){
  if(guest)return;
  const id=s.api.brains,since=s.funAt?Date.now()-s.funAt:Infinity;
  if(what==='heart'){if((s.state==='playing'||since<60000)&&!s.funHeart){s.funHeart=true;sendFun(id,1)}return}
  if(what==='meh'){sendFun(id,-1);return}
  if(s.funSent||!s.funAt)return;
  if(what==='again'&&since<30000){s.funSent=true;sendFun(id,1)}
  else if(what==='left'&&since<4000){s.funSent=true;sendFun(id,-.5)}
}
// Play. A 2D game that is made starts at once. A Next Gen, AR or Board game, and any game still being made,
// goes through the gate below first (getReady). now: start this instant, as tests always have (__gs.start()).
function startGame(s,now=false){
  if(active!==s)return;
  if(s.failed){bootGame(s);s.dirty=true;renderOverlay(s);return}   // the card's "Try again"
  if(s.starting)return;   // (pressed again while it gets ready)
  if(now&&s.loading)return;
  if(!now&&(s.loading||usesHD(s.def))){getReady(s);return}
  const items=prepRound(s);if(!items)return;
  beginRound(s,items);
  sfx(660,.08,'square',.04,300);
}
// A new round, up to and including the game's reset(): gives the boosts used on this run, or null if the game threw.
function prepRound(s){
  if(s.state==='over')funNote(s,'again');s.funHeart=false;
  clearPause(s);
  // Boosts the player owns for this game are used up on this run; unlocks stay on.
  // (taken only once the round has started cleanly, so a game that fails to reset costs nothing)
  const ready=guest?[]:(Array.isArray(s.def.shop)?s.def.shop:[]).filter(it=>it&&progress.owned(s.def.id,it)>0);
  s.run={items:new Set(ready.map(it=>it.id))};
  s.won=false;s.paid=0;s.trophies=[];
  if(!guest)roundStarted(s.def.id);   // before reset(): a location game may ask where the player is there (a guest gets the stand-in place)
  const t0=performance.now();
  s.stale=false;if(!resetGame(s)){roundEnded(s.def.id);return null}
  s.resetMs=performance.now()-t0;   // (a long one: the loading screen goes up before it the next time)
  s.score=0;badge(s,0);
  return ready;
}
// ...and the round itself: from here the game is updated and takes touches.
function beginRound(s,ready){
  for(const it of ready)if(it.kind!=='unlock')progress.use(s.def.id,it);
  if(!guest){progress.played(s.def.id);playstats.started(s.def.id)}perf.started(s.def.id);s.state='playing';s.newBest=false;s.startAt=Date.now();
  s.el.classList.add('playing');s.el.classList.remove('over');feed.classList.add('locked');s.startPerf=performance.now();renderOverlay(s);
  soundtrack.start(s.def);   // music: '<mood>' in the definition (src/soundtrack.js)
}

/* ---------- getting a round ready: the loading screen after Play ---------- */
// A 3D round used to start the instant Play was pressed, and its first frames were the ones that built what
// the round needs (shaders for what reset() had just made, their pictures sent to the graphics chip, shadow
// maps): a frame ten times as long as the rest, or, where shaders build in the background, a level that
// started half missing and filled in over the next second. Now Play on a Next Gen, AR or Board game:
//   1. puts a loading screen over the card (and waits for the game itself, if it is still being made:
//      pressing Play on a loading card used to do nothing);
//   2. runs the game's reset(), a frame or two later so the cover is on the screen first;
//   3. draws the round's own first frames under the cover: draw() without update(), on the canvas and in
//      the pictures the round will use, so everything they need is built where nobody sees it. The kits say
//      what is still on its way (src/kit/getready.js), and the gaps between the frames say when they have
//      stopped being held up;
//   4. runs the round's first update() there too, once, and draws until what that made is in as well
//      (firstStep below);
//   5. starts the round: it is one frame old, and the first touch is the first thing it hears.
// A card that has been through this once is quick the next time ("Play again"), so its cover only goes up
// if getting ready takes longer than a blink (GATE.show), unless its reset() is a long one. A cover that has
// gone up stays a moment (GATE.hold), so it never flashes. Nothing waits for ever: GATE.most ends it, and
// what only makes frames faster (cluster detail, textures packed for the chip) is waited for GATE.soft at most. Swiping to another game,
// or the card failing, gives the start up (dropReady): nothing was spent and the card is ready again.
// A game on any other style that is still being made when Play is pressed waits for it the same way, and
// starts as soon as it is made.
const GATE={show:150,hold:320,most:15000,soft:4000,slowReset:60};
// how long a game took to get ready the last time on this phone: what its loading bar goes by
const WARMS=store.get('gs_warms',{});
const noteWarm=(id,ms)=>{WARMS[id]=Math.round(ms);const k=Object.keys(WARMS);if(k.length>400)delete WARMS[k[0]];store.set('gs_warms',WARMS)};
function getReady(s){
  const st=s.starting={at:performance.now(),phase:'load',was:!!s.loading,first:!s.warmed,shown:0,cover:null,coverAt:0,items:null,t:0,last:0,frames:0,steady:new Steady(),what:'',f:0};
  // where the wait will be seen, the cover goes up now: a game not made yet, a card's first round, a long reset()
  if(st.was||(usesHD(s.def)&&(st.first||s.resetMs>GATE.slowReset)))coverUp(s);
  sfx(660,.08,'square',.04,300);
}
// each frame while a card gets ready (frame() below); step: the milliseconds a frame takes at the game's rate
function readyStep(s,now,step){
  const st=s.starting,hd=usesHD(s.def);
  if(!st.cover&&now-st.at>GATE.show)coverUp(s);
  if(st.phase==='load'){
    if(s.loading){coverBar(s);return}
    // (reset() a frame or two after the cover is on the screen: a long one would hold the very frame it was to show in)
    if(st.cover&&++st.shown<3)return;
    const items=prepRound(s);if(!items)return;   // (the game threw: its card says so, and broken() gave the start up)
    st.items=items;if(s.state==='over'){s.state='ready';s.el.classList.remove('over')}
    st.phase=hd?'warm':'hold';
  }
  if(st.phase==='warm'){
    if(now-scrollAt<150){st.last=0;return}   // the feed is being swiped: these frames wait, like any 3D frame
    const gap=st.last?now-st.last:0;st.last=now;
    if(gap){st.t+=Math.min(gap,250);st.steady.add(gap,step)}   // (a longer gap: the app was away)
    const w=kitsWaiting();st.what=w.what;
    // a card's first round: five frames drawn and three gaps in a row on time; after that, two and one
    // (and after the round's first step, below: one and one more)
    const quick=st.stepped||!st.first;
    let ok=st.t>GATE.most||st.frames>=(st.stepped?1:quick?2:5)&&st.steady.calm>=(quick?1:3)&&!w.hard&&(!w.soft||st.t>GATE.soft);
    // what reset() made is in: now the round's first step, and the same again for what that made
    if(ok&&!st.stepped){firstStep(s,step/1000);st.frames=0;st.steady.calm=0;ok=false}
    if(ok)st.phase='hold';
    else{st.frames++;s.dirty=true;coverBar(s);return}
  }
  // ready. A cover that is up stays its moment (the round's picture goes on being drawn under it)
  if(st.cover&&now-st.coverAt<GATE.hold){if(hd)s.dirty=true;coverBar(s,1);return}
  s.starting=null;s.readyMs=now-st.at;
  if(hd&&st.first){s.warmed=true;noteWarm(s.def.id,st.t)}
  coverDown(st,true);
  beginRound(s,st.items);
  if(st.won)win(s);if(st.ended)gameOver(s);   // (what the round's first step asked for, before there was a round to ask it of)
}
// The round's first update, under the cover. A round's first frame was always update() and then draw(), and
// plenty of games make or show things in that first update (the pieces of the level, the city round the
// van, a board's first move): frames drawn without it never meet them, and they were built in the round's
// first frame after all. So the gate runs it once, for one frame of game time (one tick, for a game on a
// fixed tick), and then draws on until that is in too. The round is one frame old when the cover lifts,
// which is where it always was when its first picture reached the screen. What it started that can be
// heard (a sound, a line of speech, its own music) is heard from here: a frame or two early as a rule.
function firstStep(s,dt){
  const st=s.starting,rate=tickRate(s.def);st.stepped=st.stepping=true;
  try{runTicks(s,rate,rate?1/rate:dt,h=>s.game.update(h))}
  catch(e){console.error(s.def.id,e);perf.error(e,s.def.id)}   // (the round starts, and ends on it, as it always did)
  st.stepping=false;
  soundtrack.prepare(s.def);   // its tune is written and its instruments built here too, not in the round's first frame
}
// the start is given up: the card is swiped away, dropped or broken while it was getting ready
function dropReady(s){
  const st=s.starting;if(!st)return;s.starting=null;
  coverDown(st,false);
  if(!st.items)return;
  roundEnded(s.def.id);s.run=null;   // (reset() has run: the game sits at the start of a round, as a waiting card does)
  // ...unless its first step has run too: what that started is stopped, and the game is reset once the feed is still
  if(st.stepped){if(s===active)soundtrack.stop();stopKits();if(!s.dropped){s.stale=true;whenCalm(()=>{if(s.stale&&s.state==='ready'&&!s.dropped&&!s.failed&&!s.starting){s.stale=false;if(resetGame(s))renderOverlay(s);s.dirty=true}})}}
  if(!s.failed&&!s.dropped)renderOverlay(s);
}
// The loading screen: its own layer over the card's screen (like the pause screen), solid, so nothing of the
// frames drawn under it shows. Its bar's sheen is a CSS animation, which the browser keeps moving while the
// page's own code is busy building.
function coverUp(s){
  const st=s.starting;if(!st||st.cover)return;
  let el=s.screen.querySelector('.load-ov');
  if(!el){el=document.createElement('div');el.className='overlay load-ov';el.onclick=e=>e.stopPropagation();s.screen.appendChild(el)}
  clearTimeout(el._t);el.classList.remove('gone');
  el.innerHTML=`<div class="ov-k">Loading</div><div class="ov-title">${s.def.title}</div><div class="ov-bar" role="progressbar" aria-label="Loading ${s.def.title}"><i></i></div><div class="ov-what"></div><div class="swipe-cue">${NEXT_CUE}</div>`;
  el.hidden=false;st.cover=el;st.coverAt=performance.now();st.bar=el.querySelector('.ov-bar i');st.note=el.querySelector('.ov-what');st.said='';coverBar(s);
}
function coverDown(st,fade){
  const el=st.cover;if(!el)return;st.cover=null;
  if(!fade){el.hidden=true;return}
  el.classList.add('gone');el._t=setTimeout(()=>{el.hidden=true;el.classList.remove('gone')},280);   // (fades out over the round's first frames; touches already go through it)
}
// How far along: the making of the game (as the card's own bar counts it), then the round getting ready, by
// how long that took this game the last time on this phone (the first time it eases along and never quite fills).
function coverBar(s,full=0){
  const st=s.starting;if(!st||!st.cover)return;
  const of=WARMS[s.def.id],warm=st.phase==='load'?0:Math.min(.97,of>80?.9*st.t/of:1-Math.exp(-st.t/1200));
  const f=full||(!usesHD(s.def)?loadFrac(s):st.was?(st.phase==='load'?.6*loadFrac(s):.6+.4*warm):warm);
  if(f>st.f){st.f=f;st.bar.style.transform=`scaleX(${f.toFixed(3)})`}
  const what=st.phase==='load'?(s.loading&&s.what)||'':st.what||'';
  if(what!==st.said){st.said=what;st.note.textContent=what}
}
// A run counts as a win the first time its score reaches the game's goal (or the game calls
// api.win()). It pays credits once per run and the game carries on.
function win(s){
  if(s.state!=='playing'){if(s.starting&&s.starting.stepping)s.starting.won=true;return}   // (asked for under the loading screen: once the round is on)
  if(s.won)return;
  if(guest){s.won='yes';s.paid=0;return}
  const r=progress.win(s.def.id,s.def.reward);
  s.won=r.first?'first':'yes';s.paid=r.paid;
  toast(s.el,`WIN +${r.paid} CREDITS`,'win');haptic('success');sfx(880,.12,'triangle',.06,440);
  awardTrophies(s);
}
function awardTrophies(s){
  for(const t of checkTrophies()){toast(s.el,`🏆 ${t.name}`,'trophy');services.unlock(t.id);(s.trophies||=[]).push(t)}
}
function gameOver(s){
  if(s.state!=='playing'){if(s.starting&&s.starting.stepping)s.starting.ended=true;return}
  clearPause(s);if(isFull(s))leaveFull();
  s.state='over';s.overAt=Date.now();s.funAt=s.overAt;s.funSent=false;soundtrack.stop();stopKits();roundEnded(s.def.id);if(!guest){logRound(s.def.id,s.overAt-s.startAt);playstats.round(s.def.id,s.overAt-s.startAt)}perf.ended();s.el.classList.remove('playing');s.el.classList.add('over');feed.classList.remove('locked');
  if(!guest&&progress.score(s.def.id,s.score))s.newBest=true;
  if(!guest){awardTrophies(s);services.reportRun(s.def)}
  s.rank=null;const round=s.overAt;if(!guest)boards.submit(s.def.id,s.score,(s.overAt-s.startAt)/1000).then(r=>{if(r&&s.state==='over'&&s.overAt===round){s.rank=r;if(!s.overlay.hidden)renderOverlay(s)}});
  updateBest(s);if(!s.won)haptic('error');sfx(220,.35,'square',.05,-150);
  s.overlay.hidden=true;setTimeout(()=>{if(s.state==='over')renderOverlay(s)},450);
}
// later: the card is being swiped away, so its game resets (which can rebuild a whole 3D level) once
// the swipe has settled, not in the frame the swipe starts (Play resets it anyway if it comes first)
function resetSlide(s,later=false){dropReady(s);if(isFull(s))leaveFull();if(s===active)soundtrack.stop();stopKits();clearPause(s);roundEnded(s.def.id);if(s.state==='playing'){if(!guest){logRound(s.def.id,Date.now()-s.startAt);playstats.round(s.def.id,Date.now()-s.startAt)}perf.ended()}s.state='ready';s.run=null;s.el.classList.remove('playing','over');s.score=0;badge(s,0);
  if(later){s.stale=true;renderOverlay(s);whenCalm(()=>{if(s.stale&&s.state==='ready'&&!s.dropped){s.stale=false;if(resetGame(s))renderOverlay(s);s.dirty=true}});return}
  s.stale=false;if(resetGame(s))renderOverlay(s);s.dirty=true}
function goPrev(s){
  const i=slides.indexOf(s);if(i<=0)return;
  if(s.state==='playing')resetSlide(s,true);feed.classList.remove('locked');
  slides[i-1].el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
// While a game is running the feed is locked so in-game drags never scroll it. A swipe that starts
// outside the game screen (caption, buttons, shell, top bar) still changes game, but only when it
// looks deliberate and not like part of play:
//  - it must start outside the screen; drags that start on the game always belong to the game
//  - no game input in the last 0.8s (a thumb sliding off the screen mid-play is ignored)
//  - a clear vertical flick: at least 70px, mostly vertical, finished within 0.7s
//  - not during the first second of a run, when people are still settling their grip
let lastGameInput=0;
{
  let sw=null;
  addEventListener('pointerdown',e=>{
    if(!feed.classList.contains('locked')||!active||anyFull()||e.target.closest('.screen,dialog'))return;
    sw={x:e.clientX,y:e.clientY,t:performance.now(),id:e.pointerId};
  },{passive:true});
  addEventListener('pointerup',e=>{
    if(!sw||e.pointerId!==sw.id)return;const dx=e.clientX-sw.x,dy=e.clientY-sw.y,now=performance.now(),dt=now-sw.t;sw=null;
    const s=active;if(!s||s.state!=='playing')return;
    if(Math.abs(dy)<70||Math.abs(dy)<Math.abs(dx)*1.5||dt>700)return;
    if(now-lastGameInput<800||now-(s.startPerf||0)<1000)return;
    if(dy<0)goNext(s);else goPrev(s);
  });
  addEventListener('pointercancel',()=>{sw=null});
}
function goNext(s){
  if(s.state==='playing')resetSlide(s,true);feed.classList.remove('locked');
  const i=slides.indexOf(s);if(!slides[i+2])topUp();
  if(!slides[i+1])return;
  slides[i+1].el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}

// Each game has a base size (def.w x def.h). Games that set maxW / maxH are "fluid": after the base
// size is scaled to fit, the leftover space is handed to the game as extra width or height (up to
// the max, in multiples of def.step if set) through game.resize(w, h), so tall phones and unfolded foldables are filled, not letterboxed.
const CHROME={retro:[28,88],modern:[0,0]};
function fit(s,again){
  const st=s.el.querySelector('.stage'),d=s.def,dev=s.el.querySelector('.device');let [cw,ch]=CHROME[d.retro?'retro':'modern'];
  // use the frame's real border/bezel size once it's laid out, so no space is reserved that the frame doesn't use
  if(dev&&s.screen.offsetWidth>40){const mw=dev.offsetWidth-s.screen.offsetWidth,mh=dev.offsetHeight-s.screen.offsetHeight;if(mw>=0&&mw<=80&&mh>=0&&mh<=160){cw=mw;ch=mh}}
  // a pocket screen's bezel is a border inside its box: leave it out, so the picture's own box is exactly
  // w x h game pixels at one scale (it was squeezed a little, and more one way than the other)
  let bw=0,bh=0;if(s.off){const laid=s.screen.offsetWidth>0;bw=laid?s.screen.offsetWidth-s.screen.clientWidth:12;bh=laid?s.screen.offsetHeight-s.screen.clientHeight:12}
  const aw=st.clientWidth-cw-bw,ah=st.clientHeight-ch-bh;
  if(aw<=0||ah<=0)return;
  let sc=Math.min(aw/d.w,ah/d.h);
  // (3D styles keep their quarter steps: a bigger picture there is more pixels to render)
  const dpr=window.devicePixelRatio||1;
  if(s.off){sc=Math.max(1,sc);if(s.lcd&&s.lcd.grid&&sc*dpr>=3)sc=Math.floor(sc*dpr+.02)/dpr}   // the LCD grid wants whole screen pixels
  else if(d.retro){if(sc>=2)sc=Math.floor(sc*4)/4;sc=Math.max(1,sc)}else sc=Math.max(.3,sc);
  const st2=d.step||1,grow=(b,m,a)=>b+Math.floor(Math.max(0,Math.min(m||b,Math.floor(a/sc))-b)/st2)*st2;
  // full screen (Next Gen): no maxW / maxH cap, so the whole display is filled; still no wider or taller than 2.4 : 1
  const full=isFull(s);let w=grow(d.w,full?9999:d.maxW,aw),h=grow(d.h,full?9999:d.maxH,ah);
  if(full){w=Math.min(w,Math.max(d.w,Math.round(h*2.4)));h=Math.min(h,Math.max(d.h,Math.round(w*2.4)))}
  if(w!==s.w||h!==s.h){s.w=w;s.h=h;s.game.resize&&s.game.resize(w,h)}
  const px=v=>s.lcd&&s.lcd.grid?Math.round(v*sc*dpr)/dpr:Math.round(v*sc);
  s.screen.style.width=px(w)+bw+'px';s.screen.style.height=px(h)+bh+'px';
  // Pocket games draw chunky pixels; Console games render at full device resolution, smoothed and lit.
  const pixel=!!s.off;
  if(pixel){
    // Even pixels: the card's canvas is the game's picture copied up a whole number of times (n: as many as the
    // screen has room for, up to LITE_PX in all), and the page smooths the small step that's left. Every game
    // pixel comes out the same size; stretching the small canvas straight to the screen made some of them wider.
    s.off.width=w;s.off.height=h;s.ctx.setTransform(1,0,0,1,0,0);
    s.n=Math.max(1,Math.min(Math.ceil(sc*dpr-.02),Math.floor(Math.sqrt(LITE_PX/(w*h)))));
    s.canvas.width=w*s.n;s.canvas.height=h*s.n;s.ghostAt=0;
  }
  else{let k=sc*Math.min(2.5,dpr);if(s.lite&&w*h*k*k>LITE_PX)k=Math.sqrt(LITE_PX/(w*h));s.canvas.width=Math.round(w*k);s.canvas.height=Math.round(h*k);s.ctx.setTransform(k,0,0,k,0,0)}
  s.ctx.imageSmoothingEnabled=!pixel;s.canvas.classList.add('hires');s.dirty=true;
  // first fit of a new slide guessed the frame size; now it's laid out, refit once with the real one
  if(!again&&dev&&dev.offsetHeight-s.screen.offsetHeight!==ch)fit(s,true);
}

// Shuffled queue over the whole catalogue; the feed pulls a few at a time so 1000 games never means 1000 slides in the DOM.
let queue=[];
// ar:'world' games need native AR (walking around), so the feed leaves them out on phones without it.
function inPool(g){return (filter.startsWith('id:')||!isHidden(g.id)&&!(g.ar==='world'&&nativeARSupported()!==true))&&(filter==='all'||(filter.startsWith('id:')?g.id===filter.slice(3):filter==='pocket'?g.retro&&g.era!=='console'&&g.era!=='nextgen'&&g.era!=='ar'&&g.era!=='board':filter==='console'?g.era==='console':filter==='nextgen'?g.era==='nextgen':filter==='ar'?g.era==='ar':filter==='board'?g.era==='board':!g.retro))}
function pickDefs(n=6){
  if(solo&&slides.length&&filter.startsWith('id:'))return[];
  let pool=GAMES.filter(inPool);
  if(!pool.length)pool=GAMES;
  const out=[],later=[];let tries=pool.length*2+n;
  while(out.length<n&&pool.length&&tries-->0){
    if(!queue.length){queue=rankQueue(pool,GAMES);if(queue.length>1&&queue[0].id===lastId)queue.push(queue.shift())}
    const q=queue.shift(),d=playable(q);
    if(!d){if(remote.has(q.id))later.push(q);if(later.length>=n)break;continue}   // still downloading: it goes in the next batch
    out.push(d);lastId=d.id;
    if(pool.length<n&&out.length>=pool.length)break;
  }
  queue.unshift(...later);
  remote.prefetch(queue.slice(0,AHEAD+3));   // start downloading the games after those too
  return out;
}
// After a heart or Meh, a skip or a real play, or fresh stats from everyone, re-rank the games still
// waiting in this cycle. The next few stay put: they're already downloading.
function rerank(keep=0){if(queue.length<=keep+1)return;const head=queue.slice(0,keep);queue=head.concat(rankQueue(queue.slice(keep).filter(g=>!isHidden(g.id)),GAMES))}
// (a view ends as the next card scrolls in: the re-rank waits until the feed is still)
let rerankDue=false;
history.onChange((id,w)=>{if(w&&!rerankDue){rerankDue=true;whenCalm(()=>{rerankDue=false;rerank(3)})}});
// speed.offscreen tells the 3D kits this card isn't the one being played: draw it without taking the shared
// 3D canvas or the frame-rate tuning away from the card on screen (src/kit/hd3d.js).
const usesHD=d=>d.era==='nextgen'||d.era==='ar'||d.era==='board';
// The score badge's text, changed only when the score shown changes: some games tell the app their score
// every frame, and new text in the page makes the phone lay the page out again (a layout each frame for nothing)
function badge(s,n){const t=''+n;if(s.badgeText!==t){s.badgeText=t;s.scoreEl.textContent=t}}
// The score badge's box in the game's own units, roomy enough for a 4-digit score, so a game can keep
// its HUD out from under it: { x, y, w, h, bottom }. Measured from the page (it moves with the style,
// the screen size and folding), kept for a quarter second, with a guess when the card isn't laid out.
function scoreArea(s){
  const W=s.w||s.def.w,H=s.h||s.def.h,now=performance.now(),c=s._scoreArea;
  if(c&&now-c.at<250&&c.W===W&&c.H===H)return{...c.box};
  const cr=s.canvas.getBoundingClientRect(),el=s.scoreEl,br=el.getBoundingClientRect();
  let box;
  if(cr.width>0&&cr.height>0&&br.width>0&&br.height>0){
    const cs=getComputedStyle(el),pad=(parseFloat(cs.paddingLeft)||0)+(parseFloat(cs.paddingRight)||0),digits=Math.max(1,String(el.textContent||'0').length);
    const wpx=Math.max(br.width,pad+(br.width-pad)/digits*4),kx=W/cr.width,ky=H/cr.height,mid=(br.left+br.right)/2-cr.left;
    box={x:(mid-wpx/2)*kx-2,y:Math.max(0,(br.top-cr.top)*ky-2),w:wpx*kx+4,h:br.height*ky+4};
  }else{
    // not on screen yet: what the badge usually covers on a 390-point-wide phone
    const k=W/390,hpx=s.def.retro?30:34,wpx=s.def.retro?78:70,top=s.def.retro?8:10;
    box={x:W/2-wpx*k/2-2,y:Math.max(0,top*k-2),w:wpx*k+4,h:hpx*k+4};
  }
  if(s.def.retro){const x0=Math.floor(box.x),y0=Math.floor(box.y);box={x:x0,y:y0,w:Math.ceil(box.x+box.w)-x0,h:Math.ceil(box.y+box.h)-y0}}
  box.x=Math.max(0,box.x);box.y=Math.max(0,box.y);box.bottom=box.y+box.h;
  s._scoreArea={at:now,W,H,box};return{...box};
}
// Pocket styles (dot matrix, Color, Advance) are the pixel games. Their picture goes up to the card in present():
// each game pixel becomes n x n canvas pixels, exactly. A game that asks for the LCD look (lcd in its definition)
// also gets the slow screen's ghosting (a little of the last frame lingers) and the fine grid between pixels.
const isPixel=d=>!!d.retro&&d.era!=='console'&&d.era!=='nextgen'&&d.era!=='ar'&&d.era!=='board';
function lcdOf(d){
  if(!d.lcd)return null;
  const o=d.lcd===true?{}:d.lcd,dm=!d.era,amt=(v,def,max)=>v===false?0:v===true||v==null?def:Math.max(0,Math.min(max,+v||0));
  // a dot matrix screen's gaps show the unlit (lightest) shade; a backlit colour screen's are dark
  return{grid:amt(o.grid,dm?.3:.16,.6),ghost:amt(o.ghost,dm?.45:.25,.85),color:dm?PAL[d.pal||'moss'][3]:'#000'};
}
const GRIDS=new Map();
function gridOf(o,n,lcd){
  const key=n+lcd.color+lcd.grid;let p=GRIDS.get(key);
  if(!p){const t=document.createElement('canvas'),g=Math.max(1,Math.round(n*.12));t.width=t.height=n;const x=t.getContext('2d');x.globalAlpha=lcd.grid;x.fillStyle=lcd.color;x.fillRect(n-g,0,g,n);x.fillRect(0,n-g,n-g,g);GRIDS.set(key,p=o.createPattern(t,'repeat'))}
  return p;
}
// plain: straight from the game's canvas (the debug hitboxes, drawn after the frame, are on it)
function present(s,plain){
  const o=s.out,n=s.n||1,w=s.off.width,h=s.off.height,lcd=s.lcd;let src=s.off;
  if(lcd&&lcd.ghost&&!plain){
    if(!s.ghost){s.ghost=document.createElement('canvas');s.gctx=s.ghost.getContext('2d')}
    if(s.ghost.width!==w||s.ghost.height!==h){s.ghost.width=w;s.ghost.height=h;s.ghostAt=0}
    // Each pixel drifts towards its new colour, as a slow screen's did: lcd.ghost of the difference is still there
    // a 60th of a second later, whatever the phone's refresh rate. Kept in fractions (a canvas's whole numbers never
    // quite arrive, which leaves faint marks). Only a round in play ghosts: a new or resized card shows at once.
    const now=performance.now(),gap=now-s.ghostAt;s.ghostAt=now;
    const img=s.ctx.getImageData(0,0,w,h),d=img.data,len=d.length,keep=s.state==='playing'&&!s.paused&&gap<200&&s.gbuf&&s.gbuf.length===len?Math.pow(lcd.ghost,gap/16.67):0;
    let f=s.gbuf;if(!f||f.length!==len)f=s.gbuf=new Float32Array(len);
    if(keep>0)for(let i=0;i<len;i++){const v=d[i]+(f[i]-d[i])*keep;f[i]=v;d[i]=v}else f.set(d);
    s.gctx.putImageData(img,0,0);src=s.ghost;
  }
  o.setTransform(1,0,0,1,0,0);o.imageSmoothingEnabled=false;o.globalCompositeOperation='copy';o.drawImage(src,0,0,w*n,h*n);o.globalCompositeOperation='source-over';
  if(lcd&&lcd.grid&&n>=3){o.fillStyle=gridOf(o,n,lcd);o.fillRect(0,0,w*n,h*n)}
}
function paint(s){
  // a game that throws while drawing shows its problem card instead (painting new cards for the feed
  // must never stop at one broken game)
  const off=s!==active;speed.offscreen=off;try{s.game.draw(s.ctx,beforeDraw(s,tickRate(s.def)))}catch(e){speed.offscreen=false;gameFault(s,e);try{s.game.draw(s.ctx,1)}catch(_){}if(s.off)present(s);return}finally{speed.offscreen=false}
  if(s.def.era==='console'){s.ctx.save();consolePost(s.ctx,s.w||s.def.w,s.h||s.def.h);s.ctx.restore()}
  if(s.off)present(s);
  // (Next Gen and AR cards painted off screen draw no 3D then: hd3d.js paints their picture in once the feed is still)
}
// Always keep AHEAD games downloaded and ready below the one you're on, so swiping never waits.
// When the phone runs short of memory (src/kit/memory.js) the feed keeps fewer cards ready below and
// behind (feedWindow), as each holds a canvas and a whole game.
let AHEAD=5;
// The fresh catalogue arrived after the feed started from the saved one. New games join this cycle.
// Games whose category changed leave the queue, and the slides waiting below you, of a tab they no longer
// belong to, and slides waiting below you are rebuilt with any changed details.
function catalogueChanged(added,updated){
  for(const g of added)if(inPool(g))queue.splice(Math.random()*(queue.length+1)|0,0,g);
  if(!updated.length)return;
  const ids=new Set(updated.map(g=>g.id));
  queue=queue.filter(g=>!ids.has(g.id)||inPool(g));
  const i=active?slides.indexOf(active):-1;
  for(const s of slides.slice(i+1))if(ids.has(s.def.id)){const g=GAMES.find(x=>x.id===s.def.id);dropSlide(s);slides.splice(slides.indexOf(s),1);if(g&&inPool(g))queue.unshift(g)}
  topUp();
}
function topUp(){if(guest&&slides.length)return;   // the tour shows one card at a time
  const ahead=slides.length-1-(active?slides.indexOf(active):0);if(ahead<AHEAD)addBatch(AHEAD-ahead+1)}
// Adding a card means making its game and drawing it the first time, which can take a while (a 3D
// level, its textures). Done in the middle of a swipe, that froze the scroll. So after a swipe the
// feed tops up once it has come to rest and the finger is off, one card at a time, and never while a
// round is being played. There are always AHEAD cards ready below, so nothing is ever missing.
let topT=0,scrollAt=0;
feed.addEventListener('scroll',()=>{scrollAt=performance.now()},{passive:true});
const settling=()=>touches>0||performance.now()-scrollAt<150;
// Calm: the feed has been still, with no finger on it, for a moment (QUIET ms). People swipe on
// quickly after a card lands, so work that can wait (building the next cards, resetting the card
// just left, re-ranking) waits for a calm moment, and then runs one piece per idle slot, so a long
// piece of it doesn't land just as the next swipe starts.
const QUIET=350;let touchAt=0;
const calm=()=>!touches&&performance.now()-Math.max(scrollAt,touchAt)>=QUIET;
const idleSlot=fn=>typeof requestIdleCallback==='function'?requestIdleCallback(fn,{timeout:300}):setTimeout(fn,16);
const calmJobs=[];let calmT=0;
function whenCalm(fn){calmJobs.push(fn);if(!calmT)calmT=setTimeout(calmTick,QUIET)}
function calmTick(){
  calmT=0;if(!calmJobs.length)return;
  if(!calm()){calmT=setTimeout(calmTick,100);return}
  // calmT stays set (-1) while the idle slot is on its way and while its job runs, so a job added in
  // that time joins this chain instead of starting a second one (two slots for one job: "f is not a function")
  calmT=-1;
  idleSlot(()=>{if(!calm()){calmT=setTimeout(calmTick,100);return}const f=calmJobs.shift();try{f()}catch(e){console.error(e)}calmT=calmJobs.length?setTimeout(calmTick,60):0});
}
speed.busy=()=>!calm();speed.playing=()=>!!active&&active.state==='playing';
function topUpLater(wait=QUIET){
  clearTimeout(topT);if(guest)return;
  const ahead=()=>slides.length-1-(active?slides.indexOf(active):0);
  // with only one card left below (a very quick scroller), don't wait for a calm moment: build as
  // soon as the swipe has come to rest
  const ok=()=>ahead()<=1?!settling():calm();
  topT=setTimeout(()=>{
    if(active&&(active.state==='playing'||active.starting))return topUpLater(1000);   // mid-round, or a round getting ready: after it
    if(!ok())return topUpLater(100);                                        // still moving: wait for it to settle
    idleSlot(()=>{
      if(!ok()||active&&(active.state==='playing'||active.starting))return topUpLater(100);
      const n=ahead();
      if(n<AHEAD)addStaged(ok,()=>{if(n+1<AHEAD)topUpLater(120)});
    });
  },wait);
}
// One card, in three pieces with an idle moment between each (making its game, sizing it, drawing
// it the first time), so no single piece is long enough to be felt if a swipe starts meanwhile. A
// card that comes on screen before it's finished is finished at once (setActive).
function addStaged(ok,done){
  if(stay){done();return}   // (a top-up asked for before the tour's test scenes took the screen)
  const defs=pickDefs(1);if(!defs.length){addBatch(1);done();return}
  const s=makeSlide(defs[0]);s.unready=true;feed.appendChild(s.el);slides.push(s);io.observe(s.el);feedMsg(null);
  const step=(f,next)=>idleSlot(()=>{if(s.dropped||!s.unready)return done();if(!ok()){setTimeout(()=>step(f,next),100);return}f();next?next():done()});
  step(()=>fit(s),()=>step(()=>{s.unready=false;paint(s)}));
}
function finishCard(s){if(!s.unready)return;s.unready=false;fit(s);paint(s)}
let waiting=false;
function addBatch(n=AHEAD+1){
  if(stay)return;   // the tour's test scenes have the screen: the feed stays empty until they end
  // a shared game goes first (openShared): the empty feed waits for it, while the games after it download
  if(lead&&!slides.length){if(!feed.querySelector('.feed-msg'))feedMsg('loading');return}
  const defs=pickDefs(n);
  for(const d of defs){const s=makeSlide(d);feed.appendChild(s.el);slides.push(s);fit(s);paint(s);io.observe(s.el)}
  if(defs.length)feedMsg(null);
  if(defs.length>=n||waiting)return;
  // Some of the next games are still downloading: add them as soon as they arrive.
  if(STREAM&&queue.some(g=>remote.has(g.id))){
    if(!slides.length)feedMsg('loading');
    waiting=true;
    Promise.all(queue.slice(0,n-defs.length).map(g=>remote.load(g.id))).then(()=>{waiting=false;if(!slides.length)addBatch();else topUp();if(!active&&slides[0])setActive(slides[0])});
  }else if(!slides.length)feedMsg('offline');
}

// A card in the empty feed: downloading the first games, or offline with none saved yet.
function feedMsg(kind){
  feed.querySelector('.feed-msg')?.remove();
  if(!kind)return;
  const el=document.createElement('div');el.className='feed-msg '+kind;
  el.innerHTML=kind==='loading'?'<div class="fm-spin"></div><p>Loading games…</p>'
    :'<b>No connection</b><p>Games stream in over the internet. Connect and try again. Games you\'ve played recently also work offline.</p><button class="play">Try again</button>';
  const b=el.querySelector('button');if(b)b.onclick=()=>{feedMsg('loading');remote.refresh().then(()=>start())};
  feed.appendChild(el);
}

// Play a chosen game now: slot it in right after the current game and go to it. The card is made the
// current one here, not left to the scroll to report: the feed ignores scroll news for half a second
// after a resize (and a page that has just loaded has just been resized), which left the chosen game
// on screen with a Play button that did nothing. go=false only slots it in as the next card.
function playNow(id,go=true){
  const g=GAMES.find(x=>x.id===id);if(!g)return;
  const def=playable(g);if(!def){remote.load(id).then(d=>{if(d)playNow(id,go)});return}
  const i=active?slides.indexOf(active):-1;
  if(go){if(active&&(active.state==='playing'||active.starting))resetSlide(active);feed.classList.remove('locked')}
  const s=makeSlide(def),next=slides[i+1];feedMsg(null);feed.insertBefore(s.el,next?next.el:null);slides.splice(i+1,0,s);fit(s);paint(s);io.observe(s.el);
  if(go)requestAnimationFrame(()=>{if(s.dropped)return;s.el.scrollIntoView({behavior:'auto'});setActive(s)});
}
// A shared link (src/share.js): at launch the shared game is the first card; once the feed is in use
// it plays next. A feed that is still empty waits for the shared game (lead) rather than showing
// another game and then jumping, for up to LEAD_WAIT (it still opens when it arrives later). A game
// the saved catalogue doesn't list may be new, so the fresh catalogue is read before saying it has
// gone: games are taken down too, and their links must still land in the feed.
let lead=null,leadT=0;
const LEAD_WAIT=10000;
const atStart=()=>!slides.length||!!active&&slides.indexOf(active)===0&&active.state==='ready'&&feed.scrollTop<4;
const unlead=id=>{if(lead===id){clearTimeout(leadT);lead=null}};
function holdFor(id){
  if(slides.length)return;
  lead=id;clearTimeout(leadT);leadT=setTimeout(()=>letGo(id),LEAD_WAIT);
  if(!feed.querySelector('.feed-msg'))feedMsg('loading');
}
// stop waiting for the shared game: the feed starts with the usual games
function letGo(id){if(lead!==id)return;unlead(id);if(!slides.length){addBatch();if(!active&&slides[0])setActive(slides[0])}}
// a game about to be slotted in: the queue and the cards waiting below the current one give up their copy of it
function dropCopies(id){
  queue=queue.filter(q=>q.id!==id);
  for(const s of slides.slice(active?slides.indexOf(active)+1:0))if(s.def.id===id){dropSlide(s);slides.splice(slides.indexOf(s),1)}
}
function openShared(id,checked=''){
  const g=GAMES.find(x=>x.id===id);
  if(!g){
    if(STREAM&&!checked){holdFor(id);remote.refresh().then(ok=>openShared(id,ok?'fresh':'failed'));return}
    letGo(id);
    qaToast(checked==='failed'?'Couldn’t find that shared game just now. Here are some others.':'That shared game isn’t in Game Scroll any more. Here are some others.');return}
  if(!atStart()){unlead(id);if(!active||active.def.id!==id){dropCopies(id);playNow(id)}return}   // (already on it: nothing to do)
  const def=playable(g);
  if(!def){
    holdFor(id);
    remote.load(id).then(d=>{
      if(!d){letGo(id);qaToast(`Couldn’t load ${g.title} just now. Here are some others.`);return}
      if(atStart()){openShared(id,checked);return}
      // it took so long that they've moved on: don't pull them out of what they're doing
      unlead(id);if(active&&active.def.id===id)return;
      dropCopies(id);playNow(id,false);qaToast(`${g.title} is ready: it’s the next game.`);
    });return}
  unlead(id);
  if(slides[0]&&slides[0].def.id===id){feed.scrollTop=0;setActive(slides[0]);return}
  dropCopies(id);   // it's on screen now: not again further down
  const s=makeSlide(def);feedMsg(null);feed.insertBefore(s.el,slides[0]?slides[0].el:null);slides.unshift(s);fit(s);paint(s);io.observe(s.el);feed.scrollTop=0;setActive(s);
}
function setActive(s){
  if(active===s)return;
  soundtrack.stop();stopKits();
  // the card being left: a round in play ends now; a finished one (the game-over screen) is reset
  // once the swipe has settled, as resetting can rebuild a whole 3D level, which mid-swipe is a stutter
  const prev=active;
  if(prev)dropReady(prev);   // (it was getting ready for a round: not now)
  if(prev&&prev.state==='over')funNote(prev,'left');
  if(prev&&prev.state==='playing')resetSlide(prev,true);
  else if(prev&&prev.state!=='ready')whenCalm(()=>{if(prev!==active&&prev.state!=='ready'&&!prev.dropped)resetSlide(prev)});
  finishCard(s);feed.classList.remove('locked');active=s;speed.game=s.def;s.dirty=true;if(STREAM)remote.touch(s.def.id);if(!guest)playstats.shown(s.def.id);perf.shown(s.def.id);showTweaks(s);
  whenCalm(()=>{if(s===active)soundtrack.ready(s.def)});   // a soundtrack with instruments: have them in before Play
  // the last card (playNow, a short feed): top up now, else when the swipe has settled
  // (only a feed with nothing below at all builds now, in the middle of the swipe)
  if(!slides[slides.indexOf(s)+1])topUp();else topUpLater(slides.indexOf(s)>=slides.length-2?0:QUIET);schedulePrune();
}

// Cards you've scrolled past stay in the page so you can swipe back, but only the last BEHIND of
// them: every card holds a canvas and a whole game, so a long session would keep using more memory
// until the phone closes the app. Older cards are dropped a few at a time, once the feed has
// settled, and the scroll position is corrected in the same frame so nothing on screen moves.
let BEHIND=8,PRUNE_BATCH=4;
// memory level (0 fine .. 3 critical) -> [cards ready below, cards kept behind, drop behind in batches of]
const WINDOW=[[5,8,4],[4,4,2],[2,2,1],[1,1,1]];
function feedWindow(level,was){
  [AHEAD,BEHIND,PRUNE_BATCH]=WINDOW[level]||WINDOW[0];
  if(level<=was)return topUpLater();   // easing off: build back up when calm
  // short of memory: let go of the cards furthest below now (their games go back to the front of the
  // queue, to come again), and of the ones behind once the feed is still
  const i=active?slides.indexOf(active):0,extra=slides.slice(i+1+Math.max(1,AHEAD));
  for(const s of extra.reverse()){slides.splice(slides.indexOf(s),1);dropSlide(s);queue.unshift(GAMES.find(g=>g.id===s.def.id)||s.def)}
  schedulePrune(0);
}
onMemory(feedWindow);
let pruneT=0,touches=0;
addEventListener('pointerdown',()=>{touches++;touchAt=performance.now()},true);
for(const ev of ['pointerup','pointercancel'])addEventListener(ev,()=>{touches=Math.max(0,touches-1);touchAt=performance.now()},true);
function schedulePrune(wait=800){clearTimeout(pruneT);pruneT=setTimeout(pruneBehind,wait)}
function pruneBehind(){
  const i=active?slides.indexOf(active):-1,n=i-BEHIND;
  if(n<PRUNE_BATCH)return;
  const top=()=>active.el.getBoundingClientRect().top-feed.getBoundingClientRect().top;
  if(!calm()||Math.abs(top())>1)return schedulePrune(300);   // still moving or under a finger: try again soon
  const before=top();
  for(const s of slides.splice(0,n))dropSlide(s);
  feed.scrollTop+=top()-before;   // undo the jump (some browsers already did, then this adds 0)
}

// A card leaves the feed for good: let the game tidy up, then free what its kits hold (physics worlds).
function dropSlide(s){s.dropped=true;dropReady(s);io.unobserve(s.el);try{s.game.dispose?.()}catch(_){}release(s);s.el.remove()}
let built=0;
function rebuild(){
  built++;slides.forEach(dropSlide);feed.innerHTML='';slides=[];active=null;lastId=null;queue=[];feed.scrollTop=0;addBatch();if(slides[0])setActive(slides[0]);
}

let resizeAt=0,lookT=0;
// For half a second after a resize (a fold, a rotation, the top bar moving as the fonts come in) cards
// crossing into view are ignored, as the refit itself moves them. The observer reports a crossing only
// once, so a swipe that landed in that half second was never seen and the card on screen stayed dead
// until the next swipe. So look again once the half second is up and the feed is at rest: the card
// filling the feed is the active one. (Not mid-round or in full screen: the feed can't be swiped then.)
function lookAgain(){
  clearTimeout(lookT);
  lookT=setTimeout(()=>{
    if(performance.now()-resizeAt<500||settling())return lookAgain();
    if(feed.classList.contains('locked'))return;
    const f=feed.getBoundingClientRect(),s=slides.find(s=>Math.abs(s.el.getBoundingClientRect().top-f.top)<f.height*.4);
    if(s&&s!==active)setActive(s);
  },520);
}
io=new IntersectionObserver(es=>{if(performance.now()-resizeAt<500)return lookAgain();for(const e of es)if(e.isIntersecting&&e.intersectionRatio>=.6)setActive(e.target._s)},{root:feed,threshold:[.6]});

// Hot reload (npm run dev, vite.config.js hotGames): a saved game file arrives here and replaces the
// game on its card. The feed, the debug overlay and gs.tweak values stay; a round in progress goes on
// from where it was if the game has snapshot() / restore(data), otherwise it starts again at once.
if(import.meta.hot)import.meta.hot.on('gs:game',async({id,url})=>{
  try{const m=await import(/* @vite-ignore */url+'?t='+Date.now());hotSwap(m.default)}
  catch(e){console.error(`[hot] ${id}:`,e)}
});
function hotSwap(d){
  if(!d||!d.id||!d.make)return;
  let g=GAMES.find(x=>x.id===d.id);
  if(g){try{Object.assign(g,d)}catch(_){const i=GAMES.indexOf(g);GAMES[i]=g={likes:g.likes,...d}}}else GAMES.push(g={likes:300,...d});
  for(const s of slides){
    if(s.def.id!==d.id)continue;
    const playing=s.state==='playing';let snap;
    if(playing&&s.game.snapshot)try{snap=s.game.snapshot()}catch(e){console.warn('[hot] snapshot',e)}
    if(s===active)stopKits();
    dropReady(s);
    try{s.game.dispose?.()}catch(_){}release(s);
    KEPT.delete(g);s.def=g;s.w=g.w;s.h=g.h;bootGame(s,false);fit(s);
    if(playing&&snap!==undefined&&s.game.restore)try{ownedBy(s,()=>s.game.restore(snap))}catch(e){console.warn('[hot] restore',e)}
    else if(playing){s.score=0;badge(s,0)}
    else if(s.state==='over'){s.state='ready';s.el.classList.remove('over');renderOverlay(s)}
    s.dirty=true;toast(s.el,'♻ '+g.title,'');
  }
  console.info(`[hot] ${d.id} reloaded`);
}

// Debug overlay for makers (src/debug.js): dev and test builds only, never in the store apps.
const DBG=import.meta.env.MODE==='bundled'?makeDebug():null;
// Frame lab (src/framelab.js): Digital Foundry-style frame timing, hitch causes and picture checks, loaded
// only when turned on (QA panel, F3, ?lab, __gs.lab()). It sees each refresh through LAB.tick below.
let LAB=null,labLoad=null;
function frameLab(on){
  if(on==null)on=!LAB;
  if(!on){LAB?.close();return Promise.resolve(null)}
  return LAB?Promise.resolve(LAB):labLoad||=import('./framelab.js').then(m=>{LAB=m.openLab({onClose:()=>{LAB=null;labLoad=null}});return LAB}).catch(e=>{labLoad=null;console.warn('frame lab',e);return null});
}
addEventListener('gs-framelab',()=>frameLab());
// The phone test tour (src/tour.js; a button in the QA panel): a bot plays each 3D game on this phone
// through this feed, one card at a time, as a guest (above). This is what it drives the feed with.
const tourDriver={games:()=>GAMES,active:()=>active,was:null,
  begin(api){if(guest)return;this.was=filter;playstats.left();guest=api},   // (the card on screen is left now, not when the tour ends)
  show(id){filter='id:'+id;rebuild()},
  clear(){stay=true;slides.forEach(dropSlide);feed.innerHTML='';slides=[];active=null;lastId=null;queue=[];speed.game=null},   // an empty feed that stays empty, the screen kept on: the engine test scenes draw over it (src/detail-tour.js)
  play(){if(active)startGame(active)},
  resume(){if(active)resumeGame(active)},
  full(on){const s=active;if(!s||!canFull(s.def))return false;if(on)enterFull(s);else if(isFull(s))leaveFull();return isFull(s)},   // Next Gen: the way it's played
  end(){if(!guest)return;guest=null;stay=false;filter=this.was;rebuild()}};
addEventListener('gs-tour',()=>import('./tour.js').then(m=>m.openTour(tourDriver)));
addEventListener('keydown',e=>{if(e.key==='F3'){frameLab();e.preventDefault()}});
let lastT=performance.now(),nextAt=0,realAt=0,stay=false;   // stay: the tour's test scenes are flying, with no card and no round
// A 2D game on a big screen (a foldable opened up) draws twice a phone's pixels each frame. If it can't keep
// up (two windows of 45 frames a quarter over the frame budget), its canvas drops to at most LITE_PX and the
// screen stretches it; after ~6 s of easy frames it goes back to full sharpness (once per visit to the card, so it
// can't flip back and forth). A game keeping up is never touched. (Next Gen and AR do the same in hd3d.js.)
const LITE_PX=2.4e6,L2={id:null,t:0,sum:0,cnt:0,slow:0,fast:0,back:0};
function lite2d(s,now,step){
  if(L2.id!==s){L2.id=s;L2.t=0;L2.sum=L2.cnt=L2.slow=L2.fast=L2.back=0}
  const gap=now-(L2.t||now);L2.t=now;if(!(gap>0&&gap<100))return;
  if(!s.lite&&s.canvas.width*s.canvas.height<=LITE_PX)return;
  L2.sum+=gap;if(++L2.cnt<45)return;const a=L2.sum/L2.cnt;L2.sum=L2.cnt=0;
  if(a>step*1.26){L2.fast=0;if(!s.lite&&++L2.slow>=2){L2.slow=0;s.lite=true;fit(s)}}
  else if(a<step*1.044){L2.slow=0;if(s.lite&&!L2.back&&++L2.fast>=8){L2.fast=0;L2.back=1;s.lite=false;fit(s)}}
  else L2.slow=L2.fast=0;
}
function frame(now){
  requestAnimationFrame(frame);
  pollPads(padInput);
  tickHz(now);
  const s=active;
  // the screen's rate for the game being played (src/kit/screenrate.js; the phone decides between rounds)
  screenWish(s&&s.state==='playing'&&!s.paused?s.def:null);
  // the screen stays on while a round is in play, so tilt, voice and camera games don't dim and lock (src/kit/awake.js)
  keepAwake(stay||!!s&&s.state==='playing'&&!s.paused,stay?now:s?Math.max(lastGameInput,s.startPerf||0):0,now);
  // Frame rate per game and phone (src/kit/speed.js): on a 120 Hz screen a 60 fps game skips every
  // other refresh, which saves battery and heat. Frames are due on a steady beat (nextAt), not a gap
  // since the last one, so a 60 fps game on a 90 Hz screen alternates 1 and 2 refreshes and still
  // averages 60 (a gap check would wait 2 every time: 45 fps). Slack: a slightly early refresh counts.
  const fps=s?fpsFor(s.def):60,step=1000/fps,rf=1000/screenHz();
  if(s){
    // a refresh between two real frames: a Next Gen or AR game making frames in between (frame generation,
    // src/kit/framegen.js) shows the moment due then (last: the next refresh draws a real frame)
    if(now<nextAt-.4*rf){const b=speed.between;if(b)try{b(now+1.4*rf>=nextAt,now)}catch(e){speed.between=null;console.warn('frame generation',e)}if(LAB)LAB.tick(now,s,b?'between':'idle');return}
    nextAt=now-nextAt>step?now+step:nextAt+step;   // fell behind (hidden, a long frame): restart the beat
    speed.between=null;   // (the 3D kit sets it again while this frame draws)
    // stutter shield (src/kit/speed.js): a 3D game drawing every refresh whose frame came a refresh or more late
    const gap=now-realAt;realAt=now;
    if(s.state==='playing'&&!s.paused&&usesHD(s.def)&&fps>=screenHz()*.9&&gap>1.5*rf&&gap<100)frameLate(now);
    speed.inputAt=lastGameInput;
  }
  let dt=Math.min(Math.max(.033,1.25/fps),(now-lastT)/1000);lastT=now;
  if(s){
    // one broken game must never stop the loop (that froze every game): end its round instead
    try{
      let run=true;if(DBG&&DBG.on)({dt,run}=DBG.time(dt));if(LAB&&LAB.frozen)run=false;
      // a card getting ready for its round (getReady above): its frames are drawn under the loading screen, and the kits are told so
      if(s.starting)readyStep(s,now,step);
      const warm=getready.warming=!!s.starting&&s.starting.phase!=='load'&&usesHD(s.def);
      const timed=s.state==='playing'&&!s.paused,t0=timed?performance.now():0;
      if(timed){if(run)runTicks(s,tickRate(s.def),dt,h=>{if(s.state==='playing'&&!s.paused)s.game.update(h)},DBG&&DBG.on?0:1/fps);if(!guest)gameRan(s.def.id);if(run)soundtrack.update(dt,s.score,s.def.goal)}else if(s.state==='over'&&s.game.fx)s.game.fx(dt);
      const t1=performance.now();
      // a Next Gen / AR card scrolling into place already shows its picture: its first live frame (which
      // moves the shared 3D canvas onto it) waits until the swipe has settled
      // (nor does a finished one keep drawing its game-over scene while it's being swiped away: a whole
      // 3D frame each refresh, on the same graphics chip that's moving the feed)
      // (a round getting ready is drawn with a thumb resting on the screen too, just not while the feed moves)
      const hold=usesHD(s.def)&&(warm?performance.now()-scrollAt<150:s.state==='ready'&&s.dirty&&settling()||s.state==='over'&&performance.now()-scrollAt<150);
      const painted=!hold&&(s.state!=='ready'||s.dirty||(DBG&&DBG.on));if(painted){paint(s);s.dirty=false}
      if(DBG&&DBG.on){DBG.after(s,timed?t1-t0:0,performance.now()-t1,now);if(s.off&&DBG.boxes&&s.game.debug)present(s,true)}
      if(LAB)LAB.tick(now,s,painted?'frame':'idle',timed?t1-t0:0,performance.now()-t1);
      // frame timing for the anonymous stutter reports (src/perf.js)
      if(timed&&s.state==='playing'&&!usesHD(s.def))lite2d(s,now,step);
      if(timed&&s.state==='playing')perf.frame(s.def.id,now,performance.now()-t0,1000/fps);else perf.gap();
    }catch(e){console.error(s.def.id,e);perf.error(e,s.def.id);s.dirty=false;if(s.state==='playing')try{gameOver(s)}catch(_){}}
  }else{getready.warming=false;if(LAB)LAB.tick(now,null,'idle')}
}

/* keyboard (desktop preview) and game controllers (src/kit/gamepad.js turns pads into these keys) */
function keyInput(k,down){
  const s=active;if(!s)return false;
  if(down&&k==='Escape'&&s.state==='playing'){s.paused?resumeGame(s):pauseGame(s,'key');return true}
  if(s.state==='playing'){if(s.paused){if(down&&(k===' '||k==='Enter'))resumeGame(s);return true}lastGameInput=performance.now();if(s.game.key)s.game.key(k,down);return[' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(k)}
  if(!down)return false;
  if(k===' '||k==='Enter'){if(Date.now()-s.overAt>550)startGame(s);return true}
  if(k==='ArrowDown'||k==='PageDown'){goNext(s);return true}
  if(k==='ArrowUp'||k==='PageUp'){goPrev(s);return true}
  return false;
}
function padInput(kind,k,down){
  const s=active;if(!s)return;lastGameInput=performance.now();
  if(kind==='start'){if(s.state==='playing'){s.paused?resumeGame(s):pauseGame(s,'pad')}else if(Date.now()-s.overAt>550)startGame(s);return}
  keyInput(k,down);
}
addEventListener('keydown',e=>{if(e.repeat&&active&&active.state!=='playing')return;if(keyInput(e.key,true))e.preventDefault()});
addEventListener('keyup',e=>{keyInput(e.key,false)});



// Folding/unfolding a phone, rotating, or split-screen all arrive as a resize. Refit every
// canvas and keep the current game snapped in place so a running game is not lost.
let rt;
function onResize(){
  slides.forEach(fit);
  if(active){const i=slides.indexOf(active);feed.style.scrollSnapType='none';feed.scrollTop=i*feed.clientHeight;resizeAt=performance.now();requestAnimationFrame(()=>{feed.style.scrollSnapType='';})}
}
addEventListener('resize',()=>{resizeAt=performance.now();clearTimeout(rt);rt=setTimeout(onResize,80)});
if(window.visualViewport)visualViewport.addEventListener('resize',()=>{resizeAt=performance.now();clearTimeout(rt);rt=setTimeout(onResize,80)});
screen.orientation?.addEventListener?.('change',()=>setTimeout(onResize,150));
// The top bar moves up into the camera strip where it can (src/topbar.js); when it moves, the cards refit to the room it leaves.
onBarMove(()=>requestAnimationFrame(onResize));initBar();
// Full screen on / off changes the layout without a window resize (and the system bars may resize it again later).
// While it's on the feed stays locked, so a mouse wheel can't scroll the game away underneath.
onFullChange((s,on)=>{if(!on)requestAnimationFrame(placeBar);if(on)feed.classList.add('locked');else if(s.state!=='playing')feed.classList.remove('locked');if(s.paused&&s.pauseWhy!=='info')pauseOv(s);requestAnimationFrame(onResize)});

// Fresh heart counts from other players: repaint the ♥ number on every slide (keeping your own state).
hearts.onChange(ids=>slides.forEach(x=>{if(!ids||ids.includes(x.def.id))x.setLike(x.el.querySelector('.like').getAttribute('aria-pressed')==='true')}));

/* top bar */
const logo=document.querySelector('.logo');logo.setAttribute('role','button');logo.tabIndex=0;logo.title='QA panel';
logo.onclick=()=>openPanel(GAMES,best);
const mineBtn=document.createElement('button');mineBtn.className='iconbtn';mineBtn.id='mine';mineBtn.setAttribute('aria-label','My games: hearted and Meh');mineBtn.textContent='♥';
const muteBtn=document.getElementById('mute');muteBtn.before(mineBtn);
const setBtn=document.createElement('button');setBtn.className='iconbtn';setBtn.id='settings';setBtn.setAttribute('aria-label','Settings');setBtn.textContent='⚙';
muteBtn.after(setBtn);setBtn.onclick=()=>openSettings({stream:STREAM,cached:()=>remote.cacheInfo(),clear:()=>remote.clearCache(),arTest:()=>playNow('ar-lab')});
mineBtn.onclick=()=>openMyGames({games:GAMES,best,play:playNow,changed:(id,r)=>{hearts.set(id,r>0);slides.forEach(x=>{if(x.def.id===id)x.setLike(r>0)});rerank()},qa:()=>openPanel(GAMES,best)});
// 🔊 opens the Sound & haptics sheet (sound on/off, volume, music, vibration on/off and strength)
muteBtn.setAttribute('aria-label','Sound and haptics');
const paintMute=()=>{muteBtn.textContent=feelIcon()};paintMute();
muteBtn.onclick=()=>openFeel({changed:paintMute});
// feed picker: a styled menu (not the system picker) under the pill in the top bar
const feedBtn=document.getElementById('feed-btn'),feedMenu=document.getElementById('feed-menu'),feedOpts=[...feedMenu.querySelectorAll('[role=option]')];
function feedOpen(on){feedMenu.hidden=!on;feedBtn.setAttribute('aria-expanded',String(on));
  if(on){const b=feedBtn.getBoundingClientRect(),w=Math.min(240,innerWidth-32);feedMenu.style.width=w+'px';feedMenu.style.left=Math.max(16,Math.min(b.left,innerWidth-16-w))-b.left+'px';(feedOpts.find(o=>o.getAttribute('aria-selected')==='true')||feedOpts[0]).focus()}}
function feedPick(o){feedOpen(false);feedBtn.focus();if(filter===o.dataset.f)return;filter=o.dataset.f;
  feedOpts.forEach(x=>x.setAttribute('aria-selected',String(x===o)));const name=o.querySelector('b').textContent;
  document.getElementById('feed-label').textContent=name;feedBtn.setAttribute('aria-label','Show games: '+name);haptic('light');rebuild()}
feedBtn.onclick=e=>{e.stopPropagation();feedOpen(feedMenu.hidden)};
feedOpts.forEach(o=>{o.onclick=e=>{e.stopPropagation();feedPick(o)}});
feedMenu.addEventListener('keydown',e=>{const i=feedOpts.indexOf(document.activeElement);
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();feedOpts[(i+(e.key==='ArrowDown'?1:feedOpts.length-1))%feedOpts.length].focus()}
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(i>=0)feedPick(feedOpts[i])}
  else if(e.key==='Escape'||e.key==='Tab'){feedOpen(false);feedBtn.focus()}});
document.addEventListener('pointerdown',e=>{if(!feedMenu.hidden&&!e.target.closest('.feedpick'))feedOpen(false)},true);

function boot(){initWallet(GAMES);services.init(GAMES);booted=true;if(store.get('gs_lab',false)||/[?&]lab\b/.test(location.search))frameLab(true);playstats.load(true).then(()=>rerank(3));
  hearts.reconcile(GAMES.map(g=>g.id),id=>rating(id)>0||(rating(id)===0&&store.get('gs_like_'+id,false)));hearts.load(true);rebuild();onSharedGame(openShared);requestAnimationFrame(frame);if(document.fonts)document.fonts.ready.then(()=>slides.forEach(s=>s.dirty=true));
  // a font from the library (gs.fonts) that arrives after a waiting card was drawn: draw the cards again with it
  fontlib.whenFontArrives(()=>slides.forEach(s=>s.dirty=true))}
// Streaming: with a saved catalogue, start at once and check for updates in the background.
// First launch has to fetch the catalogue before there is anything to show.
function start(){
  if(booted){rebuild();return}
  if(!STREAM){boot();return}
  if(GAMES.length){
    // Give the fresh catalogue a moment so the first games already use its categories; don't wait long.
    let go=()=>{go=()=>{};boot()};remote.refresh().then(()=>go());setTimeout(()=>go(),800);return}
  feedMsg('loading');
  remote.refresh().then(()=>GAMES.length?boot():feedMsg('offline'));
}
// Test hook used by scripts/smoke.cjs and the other browser tests: dev and test builds, and any build
// driven by a test browser. Never in the store apps, where a game could use it to reach the wallet.
// Tests: each pass of a card's making is kept for them to read (__gs.passes), and the feed can start on
// one game alone on one card (?only=<id>), so nothing else is made beside it (scripts/load-time.cjs).
const TEST=import.meta.env.MODE!=='production'||navigator.webdriver,PASSES=[];
if(TEST){
  slices.onPass(x=>{PASSES.push({id:x.card.def&&x.card.def.id,at:performance.now(),ms:x.ms,own:x.own,built:x.built,off:x.off,whole:x.whole,made:x.made,waits:x.waits});if(PASSES.length>600)PASSES.shift()});
  const one=/[?&]only=([a-z0-9-]+)/.exec(location.search);if(one){filter='id:'+one[1];solo=true}
}
nativeARProbe();   // ask early whether walk-around AR games can go in the feed
start();
// Coming back to the app: look for game updates (cheap: one small catalogue file).
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(remote.enabled)remote.refresh();if(active&&!guest)playstats.shown(active.def.id)}});
// And every 5 minutes while the app is open, so newly published games join the feed without a restart.
if(STREAM)setInterval(()=>{if(document.visibilityState==='visible')remote.refresh()},5*60*1000);

if(TEST)window.__gs={GAMES,remote,progress,playstats,perf,awake,soundtrack,slices,jobs:jobStats,fresh:FRESH,passes:PASSES,kits:{fonts:fontlib,pixel:pixelKit},gs:()=>import('./gamescroll.js'),why:id=>{const g=GAMES.find(x=>x.id===id);return g&&explain(g,GAMES,live)},api:s=>s.api,get size(){return active&&[active.w,active.h]},get active(){return active},start:()=>startGame(active,true),play:()=>startGame(active),left:s=>dropReady(s),gate:GATE,waits:kitsWaiting,brains:()=>liveBrains(active).map(brainStats),feed:()=>feedBrain.stats(),debug:v=>DBG?DBG.toggle(v):'debug overlay is only in dev builds',lab:v=>frameLab(v),memory:l=>{if(l!==undefined)forceMemory(l);return{...memory}},tour:o=>import('./tour.js').then(m=>m.runTour(tourDriver,o)),tourKit:()=>import('./tour.js'),desk:()=>({desktop,gpu:speed.gpu,klass:phoneClass(),hz:screenHz(),auto2d:autoFps({}),auto3d:autoFps({era:'nextgen'})}),only(id,one){filter='id:'+id;solo=!!one;rebuild()},shared:id=>openShared(id),playtest:(id,o)=>import('./playtest.js').then(m=>m.playtest(GAMES.find(g=>g.id===id),active.api,o))};
