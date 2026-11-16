import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { clamp, rnd } = gs.util;
const { haptic } = gs.device;
const { Feel } = gs.effects;
const { approach } = gs.juice;

function Stack(api){
  const feel=new Feel({sound:false,buzz:false});   // the game has its own sounds and buzzes
  const W=360,BH=30,D=12;let H=640,VW=360,BASE=H-150,tower,cur,debris,pops,cam,camT,combo,hue0,t;
  const col=(L,l)=>gold?`hsl(${44+(L%3)*4} 88% ${l}%)`:`hsl(${(hue0+L*9)%360} 72% ${l}%)`;let gold=false;
  function spawn(){const top=tower[tower.length-1],L=tower.length,left=L%2===0;cur={w:top.w,x:left?-top.w*.5:W-top.w*.5,dir:left?1:-1,sp:Math.min(440,170+L*7)}}
  function block(c,x,yTop,w,h,L,alpha=1){
    c.globalAlpha=alpha;
    c.fillStyle=col(L,58);c.fillRect(x,yTop,w,h);
    c.fillStyle=col(L,74);c.beginPath();c.moveTo(x,yTop);c.lineTo(x+w,yTop);c.lineTo(x+w+D,yTop-D);c.lineTo(x+D,yTop-D);c.fill();
    c.fillStyle=col(L,44);c.beginPath();c.moveTo(x+w,yTop);c.lineTo(x+w+D,yTop-D);c.lineTo(x+w+D,yTop-D+h);c.lineTo(x+w,yTop+h);c.fill();
    c.globalAlpha=1;
  }
  const sy=wy=>BASE-wy+cam;
  function drop(){
    const top=tower[tower.length-1],L=tower.length,l=Math.max(cur.x,top.x),r=Math.min(cur.x+cur.w,top.x+top.w),ov=r-l;
    if(ov<=0){debris.push({x:cur.x,w:cur.w,wy:L*BH,vy:0,rot:0,vr:cur.dir*1.5,L});cur=null;sfx(140,.4,'sawtooth',.05,-80);haptic('error');feel.juice.shake(8);return api.over()}
    let nb;
    if(Math.abs(cur.x-top.x)<5){combo++;nb={x:top.x,w:top.w};
      if(combo>=3){nb.w=Math.min(240,nb.w+10);nb.x=clamp(nb.x-5,0,W-nb.w)}
      pops.push({txt:combo>1?`PERFECT ×${combo}`:'PERFECT',wy:L*BH+40,life:1});sfx(520+combo*80,.12,'triangle',.06);haptic('success');
      feel.juice.burst(nb.x+nb.w/2,sy(L*BH)+BH/2,{n:10+Math.min(14,combo*3),speed:190,life:.45,size:4,color:[col(L,74),'#ffffff']})}
    else{combo=0;nb={x:l,w:ov};
      debris.push(cur.x<top.x?{x:cur.x,w:top.x-cur.x,wy:L*BH,vy:0,rot:0,vr:-1.6,L}:{x:r,w:cur.x+cur.w-r,wy:L*BH,vy:0,rot:0,vr:1.6,L});sfx(330,.08,'triangle',.05);haptic('light')}
    tower.push(nb);api.score(tower.length-1);camT=Math.max(0,tower.length*BH-260);spawn();
  }
  function phys(dt){
    cam = approach(cam, camT, 6, dt);
    for(const d of debris){d.vy-=1100*dt;d.wy+=d.vy*dt;d.rot+=d.vr*dt}debris=debris.filter(d=>sy(d.wy)<H+200);
    for(const p of pops){p.life-=dt;p.wy+=30*dt}pops=pops.filter(p=>p.life>0);
  }
  return{
    reset(){hue0=rnd(0,360);gold=api.has('gold');tower=[api.has('wide')?{x:30,w:300}:{x:70,w:220}];debris=[];pops=[];cam=camT=0;combo=0;t=0;feel.clear();spawn()},
    update(dt){feel.update(dt);t+=dt;if(cur){const top=tower[tower.length-1];cur.x+=cur.dir*cur.sp*dt;
      const lo=-top.w*.5,hi=W-top.w*.5;if(cur.x<lo){cur.x=lo;cur.dir=1}if(cur.x>hi){cur.x=hi;cur.dir=-1}}phys(dt)},
    fx(dt){feel.update(dt);phys(dt)},
    draw(c){
      const L=tower.length,g=c.createLinearGradient(0,0,0,H);
      g.addColorStop(0,`hsl(${(hue0+L*9+200)%360} 55% 28%)`);g.addColorStop(1,`hsl(${(hue0+L*9+240)%360} 50% 8%)`);
      c.fillStyle=g;c.fillRect(0,0,VW,H);
      c.fillStyle='#ffffff10';for(let i=0;i<14+VW/40;i++){const yy=((i*97+cam*.3)%(H+40))-20;c.fillRect((i*53)%VW,yy,2,2)}
      c.save();c.translate((VW-W)/2,0);feel.begin(c);
      // pedestal
      const b0=tower[0];block(c,b0.x,sy(0),b0.w,H,0);
      for(let i=1;i<tower.length;i++){const k=tower[i];block(c,k.x,sy(i*BH),k.w,BH,i)}
      if(cur)block(c,cur.x,sy(L*BH),cur.w,BH,L);
      for(const d of debris){c.save();c.translate(d.x+d.w/2,sy(d.wy)+BH/2);c.rotate(d.rot);block(c,-d.w/2,-BH/2,d.w,BH,d.L,.9);c.restore()}
      c.textAlign='center';c.font='400 14px "Press Start 2P", monospace';
      for(const p of pops){c.globalAlpha=clamp(p.life*1.5,0,1);c.fillStyle='#fff';c.fillText(p.txt,W/2,sy(p.wy));c.globalAlpha=1}
      feel.end(c,W,H);c.restore();
    },
    resize(w,h){VW=w;H=h;BASE=H-150},
    down(){if(cur)drop()},
    key(k,d){if(d&&(k===' '||k==='Enter'))this.down()}
  };
}

export default {
  id: 'stack', title: 'Stack Up', tag: 'Casual · Timing', retro: false, w: 360, h: 640, maxW: 600, maxH: 860,
  hint: 'Tap to drop each block. Three perfect drops grow it back.',
  goal: 20,
  board: true,
  shop: [
    { id: 'wide', name: 'Wide Base', price: 20, kind: 'boost', desc: 'Start with a wider first block.' },
    { id: 'gold', name: 'Gold Blocks', price: 150, kind: 'unlock', desc: 'Every block is gold. Forever.' },
  ],
  make: Stack,
};
