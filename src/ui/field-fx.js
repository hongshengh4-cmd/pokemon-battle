/* Persistent, bounded environment effects. No network assets or animation timers. */
(function(root) {
  'use strict';
  const aliases = {
    weather: {sun:'sun',sunnyday:'sun',晴:'sun',晴天:'sun',大晴天:'sun',rain:'rain',raindance:'rain',雨:'rain',下雨:'rain',sand:'sand',sandstorm:'sand',沙暴:'sand',snow:'snow',snowscape:'snow',hail:'snow',雪:'snow',下雪:'snow',冰雹:'snow'},
    terrain: {electric:'electric',electricterrain:'electric',电气场地:'electric',grassy:'grassy',grassyterrain:'grassy',青草场地:'grassy',misty:'misty',mistyterrain:'misty',薄雾场地:'misty',psychic:'psychic',psychicterrain:'psychic',精神场地:'psychic'}
  };
  const normalize = (kind, value) => aliases[kind]?.[String(value || '').trim().toLowerCase()] || '';
  function environment(value = {}) {
    const src = typeof value === 'string' ? {weather:value} : value || {};
    const turns = v => Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0;
    return {weather:normalize('weather',src.weather),weatherTurns:turns(src.weatherTurns),terrain:normalize('terrain',src.terrain),terrainTurns:turns(src.terrainTurns)};
  }
  const scenes = new WeakMap();
  const motion = root.matchMedia?.('(prefers-reduced-motion: reduce)');
  const palettes = {sun:['#ffc35c','#ef9d32'],rain:['#38576d','#9ebec9'],sand:['#b57839','#efc879'],snow:['#c1dae8','#eef8ff']};
  const rnd = n => {const x=Math.sin(n*127.1+37.2)*43758.5453;return x-Math.floor(x);};
  class Scene {
    constructor(arena) {
      this.arena=arena;this.env={};this.intensity=1;this.paused=false;this.time=0;this.last=0;this.frame=0;
      this.layers={}; this.canvases={};
      for(const kind of ['terrain','weather']){
        const layer=arena.ownerDocument.createElement('div');layer.className=`field-fx field-fx-${kind}`;layer.setAttribute('aria-hidden','true');
        const canvas=arena.ownerDocument.createElement('canvas');layer.append(canvas);arena.prepend(layer);
        this.layers[kind]=layer;this.canvases[kind]=canvas;
      }
      this.resize=new ResizeObserver(()=>{this.size();this.draw();});this.resize.observe(arena);
      this.visible=true;
      this.intersection=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;this.schedule();});this.intersection?.observe(arena);
      this.visibility=()=>this.schedule();arena.ownerDocument.addEventListener('visibilitychange',this.visibility);
      this.motionChange=()=>{this.draw();this.schedule();};motion?.addEventListener('change',this.motionChange);
      this.size();this.schedule();
    }
    size(){
      this.surface=null;
      this.w=this.arena.clientWidth;this.h=this.arena.clientHeight;
      const dpr=Math.min(root.devicePixelRatio||1,1.5);
      for(const c of Object.values(this.canvases)){c.width=Math.round(this.w*dpr);c.height=Math.round(this.h*dpr);c.getContext('2d').setTransform(dpr,0,0,dpr,0,0);}
    }
    update(env){
      if(this.env.terrain!==env.terrain){this.surface=null;this.terrainStart=this.time;}
      if(this.env.weather!==env.weather){this.thunderStart=-100;this.nextThunder=this.time+5.5;this.thunderIndex=0;}
      this.env=env;
      this.arena.dataset.weather=env.weather;this.arena.dataset.terrain=env.terrain;
      for(const k of ['weather','terrain'])this.layers[k].dataset.effect=env[k];
      this.draw();this.schedule();
    }
    schedule(){if(!this.frame&&!this.paused&&!motion?.matches&&this.visible&&!this.arena.ownerDocument.hidden&&this.arena.isConnected){this.frame=requestAnimationFrame(t=>{this.frame=0;if(!this.last)this.last=t;this.time+=Math.min((t-this.last)/1000,.06);this.last=t;this.draw();this.schedule();});}else if(this.paused||motion?.matches||!this.visible||this.arena.ownerDocument.hidden)this.last=0;}
    draw(){
      const {w,h}=this;if(!w||!h)return;
      const ground=this.canvases.terrain.getContext('2d'),weather=this.canvases.weather.getContext('2d');
      ground.clearRect(0,0,w,h);weather.clearRect(0,0,w,h);
      const t=motion?.matches?2.7:this.time;this.terrain(ground,t);this.weather(weather,t);
    }
    groundTop(){
      const rect=this.arena.getBoundingClientRect(),enemy=this.arena.querySelector('#e-sprite');
      return enemy?Math.max(this.h*.12,Math.min(this.h*.30,enemy.getBoundingClientRect().bottom-rect.top-27-this.h*.16)):this.h*.23;
    }
    makeSurface(kind,top){
      const c=this.arena.ownerDocument.createElement('canvas');c.width=Math.ceil(this.w);c.height=Math.ceil(this.h);
      const g=c.getContext('2d'),w=this.w,h=this.h;
      const rgb={grassy:[78,133,88],electric:[177,151,74],misty:[189,167,191],psychic:[139,112,164]}[kind];
      // Continuous low-frequency ground material, not sprite-centred stamps.
      const small=this.arena.ownerDocument.createElement('canvas');small.width=240;small.height=140;
      const s=small.getContext('2d'),image=s.createImageData(240,140);
      for(let y=0;y<140;y++)for(let x=0;x<240;x++){
        const depth=y/140,cloud=(Math.sin(x*.046+y*.027)+Math.sin(x*.11-y*.063)*.45+Math.cos(y*.083+x*.018)*.65)/2.1;
        const n=rnd(x+y*240),k=(y*240+x)*4;
        image.data[k]=rgb[0]+cloud*12+(n-.5)*8;image.data[k+1]=rgb[1]+cloud*16+(n-.5)*8;image.data[k+2]=rgb[2]+cloud*10;
        image.data[k+3]=(kind==='misty'?35:kind==='grassy'?70:48)+depth*30+cloud*12;
      }
      s.putImageData(image,0,0);g.imageSmoothingEnabled=true;g.drawImage(small,0,top,w,h-top);
      this.surface=c;this.surfaceTop=top;
    }
    terrain(g,t){
      const kind=this.env.terrain;if(!kind)return;
      const {w,h}=this,top=this.groundTop(),depth=h-top;
      if(!this.surface||Math.abs(this.surfaceTop-top)>2)this.makeSurface(kind,top);
      g.drawImage(this.surface,0,0);
      if(kind==='grassy'){
        // Wind-borne blades/leaves over a continuous soft green field; no rooted grass.
        const count=w<600?19:32;
        for(let i=0;i<count;i++){
          const d=.15+rnd(i+34)*.85,speed=11+d*23,gust=Math.sin(t*.22+i*.3)*8;
          const x=(rnd(i+72)*w+t*speed+gust)%(w+60)-30;
          const y=top+depth*(.06+rnd(i+40)*.86)+Math.sin(t*.65+i)*7*d;
          const len=3+d*7,angle=-.35+Math.sin(t*.8+i)*.55,flutter=.24+Math.abs(Math.sin(t*1.2+i))*.76;
          g.save();g.translate(x,y);g.rotate(angle);g.scale(1,flutter);
          g.fillStyle=`rgba(${80+d*29},${136+d*26},${79+d*24},${.2+d*.28})`;
          g.beginPath();g.moveTo(-len,0);g.bezierCurveTo(-len*.25,-len*.55,len*.65,-len*.32,len,0);g.bezierCurveTo(len*.25,len*.4,-len*.5,len*.35,-len,0);g.fill();
          g.strokeStyle='rgba(210,225,170,.3)';g.lineWidth=.55;g.beginPath();g.moveTo(-len*.7,0);g.lineTo(len*.75,0);g.stroke();g.restore();
        }
      }else if(kind==='misty'){
        for(let i=0;i<10;i++){
          const y=top+depth*(.08+rnd(i+23)*.92),x=((rnd(i+9)*w+t*(2+i*.3))%(w*1.8))-w*.4,rx=w*(.3+rnd(i+6)*.3),ry=depth*(.06+rnd(i+11)*.06);
          g.save();g.translate(x,y);g.scale(rx,ry);const fog=g.createRadialGradient(0,0,.05,0,0,1);
          fog.addColorStop(0,`rgba(249,234,246,${.17+Math.sin(t*.16+i)*.025})`);fog.addColorStop(1,'rgba(245,229,243,0)');g.fillStyle=fog;g.fillRect(-1,-1,2,2);g.restore();
        }
      }else if(kind==='electric'){
        // Fine branching veins flow with the ground; no lightning glyphs/flashes.
        for(let i=0;i<24;i++){
          const base=top+depth*rnd(i+30);g.beginPath();
          for(let j=0;j<=18;j++){
            const x=j*w/18,y=base+Math.sin(j*.43+i*2+t*.1)*(3+Math.max(0,base-top)/depth*10)+Math.sin(j*1.17+i)*2;
            if(j===0)g.moveTo(x,y);else g.lineTo(x,y);
          }
          g.strokeStyle=`rgba(210,183,110,${.08+Math.sin(t*.25+i)*.025})`;g.lineWidth=.6+rnd(i)*.5;g.stroke();
        }
        // Three spatially separated arc events, each with a long quiet interval.
        let activeArcs=0;
        if(!motion?.matches)for(let i=0;i<3;i++){
          const period=5.8+i*1.3,phase=this.manualArcStart!==undefined&&t-this.manualArcStart<1.05?t-this.manualArcStart:(t+period-rnd(i+52)*period)%period;
          if(phase>1.05)continue;
          activeArcs++;
          const event=Math.floor((t+period-rnd(i+52)*period)/period),x=w*(.12+rnd(i+event*7+101)*.72),y=top+depth*(.25+rnd(i+event*9+83)*.62);
          const length=105+rnd(i+event*11+47)*85,alpha=Math.sin(phase/1.05*Math.PI)*.9;
          this.drawDischarge(g,x,y,length,alpha,phase,i+event*19);

        }
        this.layers.terrain.dataset.arcs=String(activeArcs);
      }else if(kind==='psychic'){
        // Quiet, broad refractive currents, no rings, crystals or symbols.
        for(let i=0;i<8;i++){
          const y=top+depth*(i/8),sway=Math.sin(t*.17+i)*10;
          g.beginPath();g.moveTo(-20,y);g.bezierCurveTo(w*.3,y-15+sway,w*.65,y+12-sway,w+20,y-4);
          g.strokeStyle=`rgba(190,169,210,${.08+i*.008})`;g.lineWidth=9+i*2;g.stroke();
        }
      }
      // A soft front advances continuously from near ground towards the far side.
      const age=motion?.matches?1:Math.min(1,Math.max(0,(t-this.terrainStart)/1.8));
      const front=h-(h-top+h*.1)*(age*age*(3-2*age));
      g.save();g.globalCompositeOperation='destination-in';
      const reveal=g.createLinearGradient(0,front-h*.07,0,front+h*.15);reveal.addColorStop(0,'rgba(0,0,0,0)');reveal.addColorStop(1,'rgba(0,0,0,1)');g.fillStyle=reveal;g.fillRect(0,0,w,h);
      const horizon=g.createLinearGradient(0,top,0,top+depth*.18);horizon.addColorStop(0,'rgba(0,0,0,0)');horizon.addColorStop(1,'rgba(0,0,0,1)');g.fillStyle=horizon;g.fillRect(0,0,w,h);g.restore();
      this.layers.terrain.dataset.coverage='continuous';this.layers.terrain.dataset.spread=age.toFixed(3);
    }
    drawDischarge(g,x,y,length,alpha,phase,seed){
      // Hierarchical bridge noise, branching channels, white plasma core and diffuse bloom.
      // Geometry crawls gently while the envelope stays smooth: no whole-field flash.
      const points=[];
      for(let j=0;j<=32;j++){
        const u=j/32,envelope=Math.sin(u*Math.PI);
        const coarse=Math.sin(u*11+seed)*8+Math.sin(u*27+seed*2)*5;
        const fine=(rnd(j+seed*37)-.5)*7+Math.sin(phase*19+j*2.4)*1.5;
        points.push([x+u*length,y+envelope*(coarse+fine)-Math.sin(u*Math.PI)*8]);
      }
      const trace=(pts,a,width=1)=>{
        const path=()=>{g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));};
        for(const [size,color] of [[15*width,`rgba(231,156,25,${a*.045})`],[7*width,`rgba(242,181,47,${a*.14})`],[3*width,`rgba(223,154,30,${a*.62})`],[1.4*width,`rgba(255,219,112,${a})`],[.55*width,`rgba(249,253,255,${a})`]]){path();g.strokeStyle=color;g.lineWidth=size;g.stroke();}
      };
      g.save();g.lineCap='round';g.lineJoin='round';
      // Ground spill is elliptical, not a sticker or a stroked circle.
      for(const p of [points[0],points[32]]){
        g.save();g.translate(p[0],p[1]);g.scale(1,.32);const spill=g.createRadialGradient(0,0,0,0,0,24);spill.addColorStop(0,`rgba(249,204,82,${alpha*.22})`);spill.addColorStop(1,'rgba(249,204,82,0)');g.fillStyle=spill;g.fillRect(-24,-24,48,48);g.restore();
      }
      const advancing=points.slice(0,Math.max(2,Math.ceil(Math.min(1,phase/.18)*points.length)));
      trace(advancing,alpha);
      for(let k=0;k<3;k++){
        const rootIndex=7+k*9;if(rootIndex>=advancing.length)continue;
        const origin=points[rootIndex],direction=k%2?-1:1,branch=[];
        for(let j=0;j<=8;j++){
          const u=j/8;branch.push([origin[0]+u*length*(.14+rnd(k+seed)*.1),origin[1]+direction*u*(11+rnd(k+seed+4)*21)+Math.sin(u*14+k+phase*5)*u*3]);
        }
        trace(branch,alpha*.55,.55);
      }
      g.restore();
    }
    weather(g,t){
      const {w,h}=this,kind=this.env.weather;if(!kind)return;
      const strength=this.intensity;
      if(kind==='sun'){
        const sun=g.createRadialGradient(w*.78,-h*.05,5,w*.78,-h*.05,w*.8);sun.addColorStop(0,'rgba(255,244,198,.85)');sun.addColorStop(.18,'rgba(255,220,130,.27)');sun.addColorStop(1,'rgba(255,190,80,0)');g.fillStyle=sun;g.fillRect(0,0,w,h);
        g.save();g.globalCompositeOperation='screen';
        for(let i=0;i<5;i++){const x=w*(.47+i*.12+Math.sin(t*.1)*.015);const beam=g.createLinearGradient(x,0,x-w*.3,h);beam.addColorStop(0,'rgba(255,239,179,.01)');beam.addColorStop(.45,`rgba(255,239,179,${.06+Math.sin(t*.4+i)*.025})`);beam.addColorStop(1,'rgba(255,239,179,0)');g.fillStyle=beam;g.beginPath();g.moveTo(w*.78,-20);g.lineTo(x-w*.32,h);g.lineTo(x-w*.18,h);g.closePath();g.fill();}g.restore();
        for(let i=0;i<20;i++){g.fillStyle=`rgba(255,246,192,${.15+Math.sin(t+i)*.13})`;g.beginPath();g.arc((rnd(i+6)*w+t*3)%w,h*(.3+rnd(i+1)*.7),1+rnd(i),0,Math.PI*2);g.fill();}
        return;
      }
      const count=Math.round((w<600?110:200)*strength*(kind==='rain'?.36:kind==='sand'?.42:1));
      this.layers.weather.dataset.particles=String(count);
      if(kind==='rain'){
        // Broad, slow cloud shadows, not an opaque storm curtain.
        for(let i=0;i<4;i++){
          const x=w*(.08+i*.3)+Math.sin(t*.035+i)*w*.045,y=-h*.12+i*h*.025;
          g.save();g.translate(x,y);g.scale(w*.43,h*.45);
          const cloud=g.createRadialGradient(0,0,.1,0,0,1);cloud.addColorStop(0,'rgba(58,77,96,.15)');cloud.addColorStop(1,'rgba(58,77,96,0)');g.fillStyle=cloud;g.fillRect(-1,-1,2,2);g.restore();
        }
        if(!motion?.matches && t>=this.nextThunder){this.thunderStart=t;this.thunderIndex++;this.nextThunder=t+9+rnd(this.thunderIndex+61)*7;}
        const thunderAge=t-this.thunderStart;
        const thunder=!motion?.matches && thunderAge>=0 && thunderAge<1.1;
        this.layers.weather.dataset.thunder=thunder?'active':'quiet';
        if(thunder){
          const pulse=Math.sin(thunderAge/1.1*Math.PI),x=w*(.25+rnd(this.thunderIndex+17)*.5);
          const light=g.createRadialGradient(x,0,0,x,0,w*.7);light.addColorStop(0,`rgba(221,231,249,${pulse*.22})`);light.addColorStop(1,'rgba(221,231,249,0)');g.fillStyle=light;g.fillRect(0,0,w,h);
          g.save();g.strokeStyle=`rgba(214,228,250,${pulse*.44})`;g.lineWidth=1.25;g.shadowColor='rgba(221,234,255,.4)';g.shadowBlur=5;
          g.beginPath();g.moveTo(x,-4);g.lineTo(x-8,h*.055);g.lineTo(x+5,h*.075);g.lineTo(x-14,h*.13);g.stroke();g.restore();
        }
        for(let i=0;i<count;i++){
          const d=.25+rnd(i+9)*.75,speed=150+d*170,y=(rnd(i+2)*h+t*speed)%(h+30)-15,x=(rnd(i+4)*w-t*speed*.075%(w+30)+w+30)%(w+30)-15;
          g.strokeStyle=`rgba(107,143,167,${.12+d*.16})`;g.lineWidth=.55+d*.45;
          g.beginPath();g.moveTo(x,y);g.lineTo(x-1.4*d,y+7+d*8);g.stroke();
        }
        for(let i=0;i<7;i++){
          const p=(t*.6+rnd(i+16))%1,x=rnd(i+30)*w,y=h*(.4+rnd(i+41)*.58);
          g.strokeStyle=`rgba(126,155,175,${(1-p)*.14})`;g.lineWidth=.6;g.beginPath();g.ellipse(x,y,1+p*7,.5+p*1.5,0,0,Math.PI*2);g.stroke();
        }
      }else if(kind==='snow'){
        for(let i=0;i<count;i++){
          const d=.2+rnd(i+6)*.8,x=(rnd(i+9)*w+t*(8+d*12)+Math.sin(t*.7+i)*20)%w,y=(rnd(i+1)*h+t*(12+d*32))%(h+20)-10;
          g.fillStyle=`rgba(245,252,255,${.3+d*.6})`;g.beginPath();g.arc(x,y,.7+d*2.3,0,Math.PI*2);g.fill();
        }
      }else if(kind==='sand'){
        for(let i=0;i<count;i++){
          const d=.2+rnd(i)*.8,x=(rnd(i+5)*w-t*(18+d*42)%(w+20)+w+20)%(w+20)-10,y=rnd(i+12)*h+Math.sin(t*.35+i)*(3+d*4);
          g.fillStyle=`rgba(177,153,110,${.13+d*.2})`;g.beginPath();g.ellipse(x,y,.45+d*.75,.35+d*.4,-.15,0,Math.PI*2);g.fill();
        }

      }
    }
    dispose(){cancelAnimationFrame(this.frame);this.resize.disconnect();this.intersection?.disconnect();this.arena.ownerDocument.removeEventListener('visibilitychange',this.visibility);motion?.removeEventListener('change',this.motionChange);Object.values(this.layers).forEach(l=>l.remove());}
  }
  function sync(arena,state){
    if(!arena)return;
    const env=environment({weather:state?.weather,terrain:state?.field?.terrain});
    let scene=scenes.get(arena);
    if(!env.weather&&!env.terrain&&!arena.classList.contains('fx-preview-arena')){
      scene?.dispose();scenes.delete(arena);delete arena.dataset.weather;delete arena.dataset.terrain;return;
    }
    if(!scene){scene=new Scene(arena);scenes.set(arena,scene);}
    scene.update(env);
  }
  function configure(arena,options={}){
    const scene=scenes.get(arena);if(!scene)return;
    if(options.arcs&&scene.env.terrain==='electric'&&!motion?.matches){scene.manualArcStart=scene.time;}
    if(options.thunder && scene.env.weather==='rain' && !motion?.matches){scene.thunderStart=scene.time;scene.nextThunder=scene.time+12;}
    if(options.replayTerrain){scene.terrainStart=scene.time;}
    if(options.paused!==undefined)scene.paused=!!options.paused;
    if(Number.isFinite(options.intensity))scene.intensity=Math.max(.25,Math.min(1.5,options.intensity));
    scene.draw();scene.schedule();
  }
  root.PKMFieldFX={normalize,environment,sync,configure};
})(typeof window!=='undefined'?window:globalThis);
