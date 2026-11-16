import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;

function Slice(api){
  const W=360,H=640,G=900;
  const C=[['#ff5d73','#ffd1d8'],['#ffb020','#ffe9b8'],['#3ddc97','#cdf7e4'],['#9a8cff','#e1ddff'],['#29c5f6','#cbf2ff']];
  const feel=new Feel({sound:false,buzz:false});   // shake, bits, pop-ups and the flash: the game plays its own sounds
  const ready=new Ready({eat:false,text:'Swipe to start'});   // nothing is thrown until the first touch
  let items,halves,trail,score,lives,spawnT,t,isDown,last,stroke;
  function wave(){const n=1+(Math.random()*Math.min(4,1+t/10)|0);
    for(let i=0;i<n;i++){const bomb=t>4&&Math.random()<Math.min(.3,.12+t/200),x=rnd(60,W-60);
      items.push({x,y:H+34,vx:(W/2-x)*rnd(.3,.9)+rnd(-30,30),vy:-rnd(770,930),r:bomb?24:rnd(25,32),bomb,c:C[Math.random()*C.length|0],rot:0,vr:rnd(-3,3),delay:i*.18})}}
  function phys(dt,live){
    for(const it of items){if(it.delay>0){it.delay-=dt;continue}it.vy+=G*dt;it.x+=it.vx*dt;it.y+=it.vy*dt;it.rot+=it.vr*dt}
    const gone=items.filter(it=>it.vy>0&&it.y>H+50);items=items.filter(it=>!(it.vy>0&&it.y>H+50));
    if(live)for(const it of gone)if(!it.bomb){lives--;sfx(110,.25,'triangle',.06);haptic(lives>0?'warning':'error');feel.juice.shake(5);if(lives<=0){api.over();break}}
    for(const h of halves){h.vy+=G*dt;h.x+=h.vx*dt;h.y+=h.vy*dt;h.rot+=h.vr*dt}halves=halves.filter(h=>h.y<H+60);
    for(const p of trail)p.age+=dt;trail=trail.filter(p=>p.age<.14);
  }
  function segDist(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy||1,u=clamp(((px-ax)*dx+(py-ay)*dy)/l,0,1);return Math.hypot(px-(ax+u*dx),py-(ay+u*dy))}
  function cut(ax,ay,bx,by){
    for(const it of [...items]){if(it.delay>0)continue;
      if(segDist(it.x,it.y,ax,ay,bx,by)<=it.r){
        items.splice(items.indexOf(it),1);
        if(it.bomb){feel.juice.flash('#fff0dc',1,.55).burst(it.x,it.y,{n:30,speed:300,spread:.67,life:.65,size:5,shape:'square',gravity:G*.6,drag:0,color:['#ffcf4a','#ff4b3a']});
          sfx(90,.6,'sawtooth',.08,-60);haptic('heavy');feel.juice.shake(14);return api.over()}
        const a=Math.atan2(by-ay,bx-ax);stroke++;score+=stroke>=3?2:1;api.score(score);sfx(700+stroke*90,.07,'triangle',.05);haptic(stroke>=3?'medium':'light');
        for(const s of[1,-1])halves.push({x:it.x,y:it.y,vx:it.vx*.5+Math.cos(a+s*Math.PI/2)*110,vy:Math.min(it.vy,0)*.3+Math.sin(a+s*Math.PI/2)*110,r:it.r,c:it.c,ang:a,side:s,rot:0,vr:s*rnd(2,4)});
        feel.juice.burst(it.x,it.y,{n:12,speed:160,spread:.62,life:.45,size:3.5,shape:'square',gravity:G*.6,drag:0,color:it.c[0]});
        if(stroke===3)feel.juice.pop(it.x,it.y-30,'COMBO +',{color:'#ffd34a',size:12,font:'"Press Start 2P", monospace'});
      }}
  }
  return{
    reset(){items=[];halves=[];trail=[];score=0;lives=3;spawnT=.5;t=0;isDown=false;last=null;stroke=0;feel.clear();ready.reset()},
    update(dt){feel.update(dt);if(!ready.update(dt)){phys(dt,false);return}
      t+=dt;spawnT-=dt;if(spawnT<=0){wave();spawnT=rnd(1.1,1.6)*Math.max(.6,1-t/90)}phys(dt,true)},
    fx(dt){feel.update(dt);phys(dt,false)},
    draw(c){
      const g=c.createRadialGradient(W/2,H*.4,40,W/2,H*.4,H*.8);g.addColorStop(0,'#21204a');g.addColorStop(1,'#08081a');c.fillStyle=g;c.fillRect(0,0,W,H);
      c.strokeStyle='#ffffff08';c.lineWidth=1;for(let i=-H;i<W;i+=28){c.beginPath();c.moveTo(i,H);c.lineTo(i+H,0);c.stroke()}
      feel.begin(c);
      for(const h of halves){c.save();c.translate(h.x,h.y);c.rotate(h.ang+h.rot);c.beginPath();
        if(h.side>0)c.arc(0,0,h.r,0,Math.PI);else c.arc(0,0,h.r,Math.PI,Math.PI*2);c.closePath();c.fillStyle=h.c[0];c.fill();
        c.beginPath();if(h.side>0)c.arc(0,0,h.r*.8,0,Math.PI);else c.arc(0,0,h.r*.8,Math.PI,Math.PI*2);c.closePath();c.fillStyle=h.c[1];c.fill();c.restore()}
      for(const it of items){if(it.delay>0)continue;c.save();c.translate(it.x,it.y);c.rotate(it.rot);
        if(it.bomb){const pulse=.5+.5*Math.sin(t*14);c.strokeStyle=`rgba(255,70,70,${.35+pulse*.5})`;c.lineWidth=4;c.beginPath();c.arc(0,0,it.r+5,0,7);c.stroke();
          c.fillStyle='#1b1d2a';c.beginPath();c.arc(0,0,it.r,0,7);c.fill();c.strokeStyle='#c9a26b';c.lineWidth=3;c.beginPath();c.moveTo(0,-it.r);c.quadraticCurveTo(8,-it.r-10,4,-it.r-16);c.stroke();
          c.fillStyle='#ffd34a';c.beginPath();c.arc(4,-it.r-17,3+pulse*2,0,7);c.fill();c.fillStyle='#ff4b4b';c.font='700 22px Rubik, sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('!',0,1)}
        else{c.fillStyle=it.c[0];c.beginPath();c.arc(0,0,it.r,0,7);c.fill();c.strokeStyle=it.c[1];c.globalAlpha=.55;c.lineWidth=3;c.beginPath();c.arc(0,0,it.r*.62,0,7);c.stroke();c.globalAlpha=1;
          c.fillStyle='#ffffff55';c.beginPath();c.ellipse(-it.r*.35,-it.r*.4,it.r*.22,it.r*.13,-.6,0,7);c.fill()}
        c.restore()}
      if(trail.length>1){c.lineCap='round';c.lineJoin='round';for(let i=1;i<trail.length;i++){const a=trail[i-1],b=trail[i];c.strokeStyle=`rgba(255,255,255,${1-b.age/.14})`;c.lineWidth=2+i/trail.length*7;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke()}}
      feel.end(c,W,H);ready.draw(c,W,H);
      for(let i=0;i<3;i++){const x=W-24-i*26,y=26;c.lineWidth=3;if(i<lives){c.fillStyle='#ff5d73';c.beginPath();c.arc(x,y,8,0,7);c.fill()}else{c.strokeStyle='#ff5d7388';c.beginPath();c.moveTo(x-6,y-6);c.lineTo(x+6,y+6);c.moveTo(x+6,y-6);c.lineTo(x-6,y+6);c.stroke()}}
    },
    down(x,y){ready.go();isDown=true;last={x,y};stroke=0;trail=[{x,y,age:0}]},
    move(x,y){if(!isDown)return;trail.push({x,y,age:0});cut(last.x,last.y,x,y);last={x,y}},
    up(){isDown=false;last=null}
  };
}

export default {
  id: 'slice', title: 'Slice Rush', tag: 'Casual · Swipe', retro: false, w: 360, h: 640,
  hint: 'Swipe through fruit. Miss three or hit a bomb and it ends.',
  goal: 40,
  make: Slice,
};
