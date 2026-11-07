import './style.css';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-700.css';
import '@fontsource/rubik/latin-800.css';
import { store, hash, fmt } from './util.js';
import { sfx, sound } from './sfx.js';
import { PAL, SHELL } from './palettes.js';
import { isHidden, setRating, rating, logRound, toast as qaToast, openPanel } from './qa.js';
import { rankQueue as rank, explain } from './recommend.js';
import { live } from './feedsignals.js';
const rankQueue=(pool,all)=>rank(pool,all,live);
import { openMyGames } from './mygames.js';
import { post as consolePost } from './kit/gfx.js';
import { progress } from './kit/progress.js';
import { checkTrophies } from './kit/trophies.js';
import { services } from './kit/services.js';
import { initWallet, toast, shopHTML, bindShop } from './kit/wallet-ui.js';

import { haptic } from './kit/device.js';
import { remote } from './remote.js';
import { openSettings } from './settings.js';
import { nativeARProbe, nativeARSupported } from './kit/native-ar.js';
import { hearts } from './hearts.js';
import { playstats } from './playstats.js';
import { perf } from './perf.js';
import { speed, fpsFor, tick as tickHz } from './kit/speed.js';
import { history } from './history.js';
import { savesFor } from './saves.js';
import { geoFor, roundStarted, roundEnded } from './geo.js';
import { stopMusic } from './kit/sound.js';
import { makeDebug } from './debug.js';
import { shareGame, onSharedGame } from './share.js';
import BUNDLED from 'virtual:bundled-games';

/* ---------- catalogue ---------- */
// The app streams every game from the game host (src/remote.js): GAMES holds each game's metadata from
// the online catalogue, and a game's code downloads just before it comes up in the feed.
// Dev and test builds (--mode bundled) have every file in src/games/ built in instead.
const GAMES = BUNDLED.filter(g => g && g.id && g.make).map(g => ({ likes: 300 + hash(g.id) % 6000, ...g }));
const STREAM = remote.enabled;
const playable = g => STREAM ? remote.def(g) : g;   // null while a streamed game is still downloading
let booted = false;
if (STREAM) remote.init(meta => { const g = { likes: 300 + hash(meta.id) % 6000, ...meta }; GAMES.push(g); return g; },
  (added, updated) => { if (booted) catalogueChanged(added, updated); });

/* ---------- feed engine ---------- */
const feed=document.getElementById('feed');
let slides=[],active=null,filter='all',lastId=null,io;

function makeSlide(def){
  const el=document.createElement('section');el.className='slide '+(def.retro?'retro':'modern')+(def.era==='console'?' console':def.era==='nextgen'?' console nextgen':def.era==='ar'?' console nextgen ar':'');
  if(def.retro){const p=PAL[def.pal||'moss'];p.forEach((c,i)=>el.style.setProperty('--lcd'+i,c));el.style.setProperty('--shell',SHELL[def.pal||'moss']);}el.setAttribute('aria-label',def.title);
  el.innerHTML=`
    <div class="stage"><div class="device">
      ${def.retro?`<div class="bezel-top${def.era?' dark':''}"><span class="led"></span>${def.era==='console'?'<b class="era">CLASSIC</b> · CONSOLE':def.era==='nextgen'?'<b class="era">NEXT GEN</b> · CONSOLE':def.era==='ar'?'<b class="era">AR</b> · 3D':def.era==='advance'?'<b class="era">ADVANCE</b> · POCKET':def.era==='color'?'<b class="era rainbow">COLOR</b> · POCKET':'DOT MATRIX · POCKET'}</div>`:''}
      <div class="screen"><canvas></canvas><div class="hud"><span class="score">0</span></div><div class="overlay"></div></div>
      ${def.era==='console'||def.era==='nextgen'||def.era==='ar'?'<div class="bezel-bottom"><span class="slot"></span><span class="pads"><i></i><i></i><i></i></span></div>':def.retro?'<div class="bezel-bottom"><span class="dpad"></span><span class="ab"><i></i><i></i></span></div>':''}
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
  s.game=def.make(s.api={
    score:n=>{s.score=n;s.scoreEl.textContent=n;if(def.goal&&n>=def.goal)win(s)},
    over:()=>gameOver(s),
    win:()=>win(s),                                     // for games with a natural win (cleared the board, etc.)
    has:id=>!!(s.run&&s.run.items.has(id)),             // is this shop item active for the current run?
    ...savesFor(def.id),                                // save(data) / load(fallback) / clearSave(): this game's own save slot
    ...geoFor(def),                                     // location() / watchLocation(cb): rounded, only during a round (src/geo.js)
  });
  s.game.reset();
  // like
  const likeBtn=el.querySelector('.like'),liked=rating(def.id)>0||(rating(def.id)===0&&store.get('gs_like_'+def.id,false));
  // Shared counts come from the hearts backend; dev/test builds without it keep the old local number.
  const setLike=v=>{likeBtn.setAttribute('aria-pressed',v);likeBtn.querySelector('.n').textContent=fmt(hearts.enabled?hearts.count(def.id,v):def.likes+(v?1:0))};setLike(liked);
  likeBtn.onclick=()=>{const v=likeBtn.getAttribute('aria-pressed')!=='true';store.set('gs_like_'+def.id,v);setRating(def.id,v?1:0);hearts.set(def.id,v);rerank();document.querySelectorAll('.slide').forEach(x=>{if(x._s&&x._s.def.id===def.id)x._s.setLike(v)})};
  s.setLike=setLike;
  el.querySelector('.meh').onclick=()=>{const was=rating(def.id);setRating(def.id,-1);if(likeBtn.getAttribute('aria-pressed')==='true'){store.set('gs_like_'+def.id,false);setLike(false);hearts.set(def.id,false)}
    rerank();qaToast(`Hidden: ${def.title}`,()=>{setRating(def.id,was);rerank()});goNext(s)};
  el.querySelector('.nextbtn').onclick=()=>goNext(s);
  el.querySelector('.sharebtn').onclick=async()=>{haptic('light');const r=await shareGame(def,best(def.id));if(r==='copied')toast(el,'Link copied','info')};
  s.overlay.onclick=e=>{if(Date.now()-s.overAt<550)return;startGame(s)};
  // pointer input
  const pt=e=>{const r=s.canvas.getBoundingClientRect();return[(e.clientX-r.left)/r.width*s.w,(e.clientY-r.top)/r.height*s.h]};
  // Multi-touch: each finger is tracked by its pointer id, passed to the game as the last argument
  // (down(x, y, id), move(x, y, pressed, id), up(x, y, id)). One-finger games can ignore it.
  const held=new Set();
  s.canvas.addEventListener('pointerdown',e=>{if(s.state!=='playing')return;held.add(e.pointerId);lastGameInput=performance.now();try{s.canvas.setPointerCapture(e.pointerId)}catch(_){}e.preventDefault();s.game.down&&s.game.down(...pt(e),e.pointerId)});
  s.canvas.addEventListener('pointermove',e=>{if(s.state!=='playing')return;const pressed=held.has(e.pointerId);if(pressed)lastGameInput=performance.now();s.game.move&&s.game.move(...pt(e),pressed,e.pointerId)});
  const up=e=>{if(!held.delete(e.pointerId))return;if(s.state==='playing'&&s.game.up)s.game.up(...pt(e),e.pointerId)};
  s.canvas.addEventListener('pointerup',up);s.canvas.addEventListener('pointercancel',up);
  s.canvas.addEventListener('contextmenu',e=>e.preventDefault());
  el._s=s;
  el.querySelector('.caption').onclick=()=>openInfo(s);
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
    infoDlg.addEventListener('close',()=>{const t=infoDlg._s;if(t){t.paused=false;lastT=performance.now();perf.gap()}})}
  infoDlg._s=s;if(s.state==='playing')s.paused=true;
  const kind=d.era==='console'?'Classic · Console game':d.era==='nextgen'?'Next Gen · Console game':d.era==='ar'?'AR 3D game: uses your camera and motion sensor':d.era==='advance'?'Advance-style pocket game':d.era==='color'?'Colour pocket game':d.retro?'Dot-matrix pocket game':'Phone game';
  infoDlg.innerHTML=`<div class="info-card"><button class="info-x" aria-label="Close">✕</button>
    <span class="tag">${d.tag}</span><h2>${d.title}</h2><div class="info-by">Created by <b>${creatorOf(d)}</b></div><div class="info-k">${kind}</div>
    <h3>How to play</h3><p>${d.hint}</p>${locNote(d)}
    <div class="info-stats"><div><b>${fmt(best(d.id))}</b>Your best</div>${d.goal?`<div><b>${d.goal}</b>Score to win</div>`:''}</div>
    <button class="play info-play">${s.state==='playing'?'Keep playing':'Play'}</button></div>`;
  infoDlg.querySelector('.info-x').onclick=()=>infoDlg.close();
  infoDlg.querySelector('.info-play').onclick=()=>{const was=s.state;infoDlg.close();if(was!=='playing'&&active===s&&Date.now()-s.overAt>550)startGame(s)};
  infoDlg.showModal();
}
function best(id){return progress.best(id)}
function updateBest(s){s.el.querySelector('.best').textContent=fmt(best(s.def.id))}

// Games that use location say so before Play, so the phone's question doesn't come out of nowhere.
const locNote=d=>d.location?`<div class="ov-loc">📍 Uses your ${d.location==='precise'?'location to walk around':'rough area (about 1 km)'}. It stays on your phone, and you can say no.</div>`:'';
function renderOverlay(s){
  const d=s.def,cue='<div class="swipe-cue">Swipe up for the next game</div>';
  if(s.state==='ready'){
    s.overlay.innerHTML=`<div class="ov-k">${d.era==='nextgen'||d.era==='ar'?'Ready':d.retro?'Insert coin':'Tap to start'}</div><div class="ov-title">${d.title}</div><div class="ov-hint">${d.hint}</div>${goalHTML(d)}${locNote(d)}<button class="play">${d.retro?'PRESS START':'Play'}</button>${shopHTML(d)}${cue}`;
    bindShop(s.overlay,d,()=>renderOverlay(s));
  }else if(s.state==='over'){
    const b=best(d.id),isNew=s.score>0&&s.score>=b&&s.newBest;
    const res=s.paid?`<div class="ov-win">${s.won==='first'?'FIRST WIN ':'WIN '}+${s.paid} CREDITS</div>`:d.goal?`<div class="ov-goal">Score ${d.goal} to win credits</div>`:'';
    s.el.querySelectorAll('.toast').forEach(t=>t.remove());   // the game-over screen repeats what they said
    const tro=(s.trophies||[]).map(t=>`<div class="ov-trophy">🏆 ${t.name}</div>`).join('');
    s.overlay.innerHTML=`<div class="ov-k">${s.paid?'You won':'Game over'}</div><div class="ov-score">${s.score}</div>${isNew?'<div class="ov-new">NEW BEST</div>':`<div class="ov-best">Best ${b}</div>`}${res}${tro}<button class="play">${d.retro?'RETRY':'Play again'}</button>${shopHTML(d)}${cue}`;
    bindShop(s.overlay,d,()=>renderOverlay(s));
  }
  s.overlay.hidden=s.state==='playing';
}

function goalHTML(d){
  if(!d.goal)return'';
  const w=progress.wins(d.id),r=d.reward||10;
  return d.retro?`<div class="ov-goal">Win at ${d.goal} · <b>+${w?r:r*2}</b> credits</div>`
    :`<div class="ov-goal">Score ${d.goal} to win <b>◆${w?r:r*2}</b>${w?'':' (first win pays double)'}</div>`;
}

function startGame(s){
  if(active!==s)return;
  // Boosts the player owns for this game are used up on this run; unlocks stay on.
  s.run={items:new Set()};
  for(const it of s.def.shop||[])if(it.kind==='unlock'?progress.owned(s.def.id,it)>0:progress.use(s.def.id,it))s.run.items.add(it.id);
  s.won=false;s.paid=0;s.trophies=[];progress.played(s.def.id);playstats.started(s.def.id);perf.started(s.def.id);
  roundStarted(s.def.id);s.game.reset();s.score=0;s.scoreEl.textContent='0';s.state='playing';s.newBest=false;s.startAt=Date.now();
  s.el.classList.add('playing');s.el.classList.remove('over');feed.classList.add('locked');s.startPerf=performance.now();renderOverlay(s);
  sfx(660,.08,'square',.04,300);
}
// A run counts as a win the first time its score reaches the game's goal (or the game calls
// api.win()). It pays credits once per run and the game carries on.
function win(s){
  if(s.won||s.state!=='playing')return;
  const r=progress.win(s.def.id,s.def.reward||10);
  s.won=r.first?'first':'yes';s.paid=r.paid;
  toast(s.el,`WIN +${r.paid} CREDITS`,'win');haptic('success');sfx(880,.12,'triangle',.06,440);
  awardTrophies(s);
}
function awardTrophies(s){
  for(const t of checkTrophies()){toast(s.el,`🏆 ${t.name}`,'trophy');services.unlock(t.id);(s.trophies||=[]).push(t)}
}
function gameOver(s){
  if(s.state!=='playing')return;
  s.state='over';s.overAt=Date.now();stopMusic();roundEnded(s.def.id);logRound(s.def.id,s.overAt-s.startAt);playstats.round(s.def.id,s.overAt-s.startAt);perf.ended();s.el.classList.remove('playing');s.el.classList.add('over');feed.classList.remove('locked');
  if(progress.score(s.def.id,s.score))s.newBest=true;
  awardTrophies(s);services.reportRun(s.def);
  updateBest(s);if(!s.won)haptic('error');sfx(220,.35,'square',.05,-150);
  s.overlay.hidden=true;setTimeout(()=>{if(s.state==='over')renderOverlay(s)},450);
}
function resetSlide(s){stopMusic();roundEnded(s.def.id);if(s.state==='playing'){logRound(s.def.id,Date.now()-s.startAt);playstats.round(s.def.id,Date.now()-s.startAt);perf.ended()}s.state='ready';s.run=null;s.el.classList.remove('playing','over');s.game.reset();s.score=0;s.scoreEl.textContent='0';renderOverlay(s);s.dirty=true}
function goPrev(s){
  const i=slides.indexOf(s);if(i<=0)return;
  if(s.state==='playing')resetSlide(s);feed.classList.remove('locked');
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
    if(!feed.classList.contains('locked')||!active||e.target.closest('.screen,dialog'))return;
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
  if(s.state==='playing')resetSlide(s);feed.classList.remove('locked');
  const i=slides.indexOf(s);topUp();
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
  const aw=st.clientWidth-cw,ah=st.clientHeight-ch;
  if(aw<=0||ah<=0)return;
  let sc=Math.min(aw/d.w,ah/d.h);
  if(d.retro){if(sc>=2)sc=Math.floor(sc*4)/4;sc=Math.max(1,sc)}else sc=Math.max(.3,sc);
  const st2=d.step||1,grow=(b,m,a)=>b+Math.floor(Math.max(0,Math.min(m||b,Math.floor(a/sc))-b)/st2)*st2;
  const w=grow(d.w,d.maxW,aw),h=grow(d.h,d.maxH,ah);
  if(w!==s.w||h!==s.h){s.w=w;s.h=h;s.game.resize&&s.game.resize(w,h)}
  s.screen.style.width=Math.round(w*sc)+'px';s.screen.style.height=Math.round(h*sc)+'px';
  // Pocket games draw chunky pixels; Console games render at full device resolution, smoothed and lit.
  const pixel=d.retro&&d.era!=='console'&&d.era!=='nextgen'&&d.era!=='ar';
  if(pixel){s.canvas.width=w;s.canvas.height=h;s.ctx.setTransform(1,0,0,1,0,0)}
  else{const k=sc*Math.min(2.5,window.devicePixelRatio||1);s.canvas.width=Math.round(w*k);s.canvas.height=Math.round(h*k);s.ctx.setTransform(k,0,0,k,0,0)}
  s.ctx.imageSmoothingEnabled=!pixel;s.canvas.classList.toggle('hires',!pixel);s.dirty=true;
  // first fit of a new slide guessed the frame size; now it's laid out, refit once with the real one
  if(!again&&dev&&dev.offsetHeight-s.screen.offsetHeight!==ch)fit(s,true);
}

// Shuffled queue over the whole catalogue; the feed pulls a few at a time so 1000 games never means 1000 slides in the DOM.
let queue=[];
// ar:'world' games need native AR (walking around), so the feed leaves them out on phones without it.
function inPool(g){return (filter.startsWith('id:')||!isHidden(g.id)&&!(g.ar==='world'&&nativeARSupported()!==true))&&(filter==='all'||(filter.startsWith('id:')?g.id===filter.slice(3):filter==='pocket'?g.retro&&g.era!=='console'&&g.era!=='nextgen'&&g.era!=='ar':filter==='console'?g.era==='console':filter==='nextgen'?g.era==='nextgen':filter==='ar'?g.era==='ar':!g.retro))}
function pickDefs(n=6){
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
history.onChange((id,w)=>{if(w)rerank(3)});
function paint(s){s.game.draw(s.ctx);if(s.def.era==='console'){s.ctx.save();consolePost(s.ctx,s.w||s.def.w,s.h||s.def.h);s.ctx.restore()}}
// Always keep AHEAD games downloaded and ready below the one you're on, so swiping never waits.
const AHEAD=5;
// The fresh catalogue arrived after the feed started from the saved one. New games join this cycle.
// Games whose category changed leave the queue, and the slides waiting below you, of a tab they no longer
// belong to, and slides waiting below you are rebuilt with any changed details.
function catalogueChanged(added,updated){
  for(const g of added)if(inPool(g))queue.splice(Math.random()*(queue.length+1)|0,0,g);
  if(!updated.length)return;
  const ids=new Set(updated.map(g=>g.id));
  queue=queue.filter(g=>!ids.has(g.id)||inPool(g));
  const i=active?slides.indexOf(active):-1;
  for(const s of slides.slice(i+1))if(ids.has(s.def.id)){const g=GAMES.find(x=>x.id===s.def.id);io.unobserve(s.el);s.el.remove();slides.splice(slides.indexOf(s),1);if(g&&inPool(g))queue.unshift(g)}
  topUp();
}
function topUp(){const ahead=slides.length-1-(active?slides.indexOf(active):0);if(ahead<AHEAD)addBatch(AHEAD-ahead+1)}
let waiting=false;
function addBatch(n=AHEAD+1){
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

// Play a chosen game now: slot it in right after the current game and scroll to it.
function playNow(id){
  const g=GAMES.find(x=>x.id===id);if(!g)return;
  const def=playable(g);if(!def){remote.load(id).then(d=>{if(d)playNow(id)});return}
  const i=active?slides.indexOf(active):-1;if(active&&active.state==='playing')resetSlide(active);feed.classList.remove('locked');
  const s=makeSlide(def),next=slides[i+1];feed.insertBefore(s.el,next?next.el:null);slides.splice(i+1,0,s);fit(s);paint(s);io.observe(s.el);
  requestAnimationFrame(()=>s.el.scrollIntoView({behavior:'auto'}));
}
// A shared link: at launch the game goes first in the feed; while the app is open it plays next.
function openShared(id){
  const g=GAMES.find(x=>x.id===id);if(!g)return;
  if(active&&slides.indexOf(active)===0&&active.state==='ready'&&feed.scrollTop<4){
    const def=playable(g);if(!def){remote.load(id).then(d=>{if(d)openShared(id)});return}
    if(active.def.id===id)return;
    const s=makeSlide(def);feed.insertBefore(s.el,slides[0].el);slides.unshift(s);fit(s);paint(s);io.observe(s.el);feed.scrollTop=0;setActive(s);return}
  playNow(id);
}
function setActive(s){
  if(active===s)return;
  stopMusic();if(active&&active.state!=='ready')resetSlide(active);
  feed.classList.remove('locked');active=s;speed.game=s.def;s.dirty=true;if(STREAM)remote.touch(s.def.id);playstats.shown(s.def.id);perf.shown(s.def.id);
  topUp();schedulePrune();
}

// Cards you've scrolled past stay in the page so you can swipe back, but only the last BEHIND of
// them: every card holds a canvas and a whole game, so a long session would keep using more memory
// until the phone closes the app. Older cards are dropped a few at a time, once the feed has
// settled, and the scroll position is corrected in the same frame so nothing on screen moves.
const BEHIND=8,PRUNE_BATCH=4;
let pruneT=0,touches=0;
addEventListener('pointerdown',()=>touches++,true);
for(const ev of ['pointerup','pointercancel'])addEventListener(ev,()=>{touches=Math.max(0,touches-1)},true);
function schedulePrune(wait=800){clearTimeout(pruneT);pruneT=setTimeout(pruneBehind,wait)}
function pruneBehind(){
  const i=active?slides.indexOf(active):-1,n=i-BEHIND;
  if(n<PRUNE_BATCH)return;
  const top=()=>active.el.getBoundingClientRect().top-feed.getBoundingClientRect().top;
  if(touches||Math.abs(top())>1)return schedulePrune();   // still moving or under a finger: try again soon
  const before=top();
  for(const s of slides.splice(0,n)){io.unobserve(s.el);try{s.game.dispose?.()}catch(_){}s.el.remove()}
  feed.scrollTop+=top()-before;   // undo the jump (some browsers already did, then this adds 0)
}

let built=0;
function rebuild(){
  built++;slides.forEach(s=>io.unobserve(s.el));feed.innerHTML='';slides=[];active=null;lastId=null;queue=[];feed.scrollTop=0;addBatch();if(slides[0])setActive(slides[0]);
}

let resizeAt=0;
io=new IntersectionObserver(es=>{if(performance.now()-resizeAt<500)return;for(const e of es)if(e.isIntersecting&&e.intersectionRatio>=.6)setActive(e.target._s)},{root:feed,threshold:[.6]});

// Debug overlay for makers (src/debug.js): dev and test builds only, never in the store apps.
const DBG=import.meta.env.MODE==='bundled'?makeDebug():null;
let lastT=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  tickHz(now);
  const s=active;
  // Frame rate per game and phone (src/kit/speed.js): on a 120 Hz screen a 60 fps game skips every
  // other refresh, which saves battery and heat. A little slack so a slightly early refresh still counts.
  const fps=s?fpsFor(s.def):60;
  if(s&&now-lastT<1000/fps-2.5)return;
  let dt=Math.min(Math.max(.033,1.25/fps),(now-lastT)/1000);lastT=now;
  if(s){
    // one broken game must never stop the loop (that froze every game): end its round instead
    try{
      let run=true;if(DBG&&DBG.on)({dt,run}=DBG.time(dt));
      const timed=s.state==='playing'&&!s.paused,t0=timed?performance.now():0;
      if(timed){if(run)s.game.update(dt)}else if(s.state==='over'&&s.game.fx)s.game.fx(dt);
      const t1=performance.now();
      if(s.state!=='ready'||s.dirty||(DBG&&DBG.on)){paint(s);s.dirty=false}
      if(DBG&&DBG.on)DBG.after(s,timed?t1-t0:0,performance.now()-t1,now);
      // frame timing for the anonymous stutter reports (src/perf.js)
      if(timed&&s.state==='playing')perf.frame(s.def.id,now,performance.now()-t0,1000/fps);else perf.gap();
    }catch(e){console.error(s.def.id,e);perf.error(e,s.def.id);s.dirty=false;if(s.state==='playing')try{gameOver(s)}catch(_){}}
  }
}

/* keyboard (desktop preview) */
addEventListener('keydown',e=>{
  const s=active;if(!s)return;
  if(s.state==='playing'){if(s.game.key){s.game.key(e.key,true)}if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();return}
  if(e.key===' '||e.key==='Enter'){e.preventDefault();if(Date.now()-s.overAt>550)startGame(s)}
  else if(e.key==='ArrowDown'||e.key==='PageDown'){e.preventDefault();goNext(s)}
});
addEventListener('keyup',e=>{const s=active;if(s&&s.state==='playing'&&s.game.key)s.game.key(e.key,false)});

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
const paintMute=()=>{muteBtn.textContent=sound.muted?'🔇':'🔊';muteBtn.setAttribute('aria-pressed',String(sound.muted))};paintMute();
muteBtn.onclick=()=>{sound.muted=!sound.muted;store.set('gs_muted',sound.muted);paintMute()};
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

function boot(){initWallet(GAMES);services.init(GAMES);booted=true;playstats.load(true).then(()=>rerank(3));perf.load(true);
  hearts.reconcile(GAMES.map(g=>g.id),id=>rating(id)>0||(rating(id)===0&&store.get('gs_like_'+id,false)));hearts.load(true);rebuild();onSharedGame(openShared);requestAnimationFrame(frame);if(document.fonts)document.fonts.ready.then(()=>slides.forEach(s=>s.dirty=true))}
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
nativeARProbe();   // ask early whether walk-around AR games can go in the feed
start();
// Coming back to the app: look for game updates (cheap: one small catalogue file).
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(remote.enabled)remote.refresh();if(active)playstats.shown(active.def.id)}});
// And every 5 minutes while the app is open, so newly published games join the feed without a restart.
if(STREAM)setInterval(()=>{if(document.visibilityState==='visible')remote.refresh()},5*60*1000);

// Test hook used by scripts/smoke.cjs
window.__gs={GAMES,remote,progress,playstats,perf,why:id=>{const g=GAMES.find(x=>x.id===id);return g&&explain(g,GAMES,live)},api:s=>s.api,get size(){return active&&[active.w,active.h]},get active(){return active},start:()=>startGame(active),debug:v=>DBG?DBG.toggle(v):'debug overlay is only in dev builds',only(id){filter='id:'+id;rebuild()}};
