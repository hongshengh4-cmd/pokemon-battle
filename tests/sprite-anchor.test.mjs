import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/ui/sprite-anchor.js';
const {project, iconSize} = globalThis.PKMSpriteAnchor;
const base = {rect:{left:100,top:200,width:320,height:320},width:320,height:320,naturalWidth:100,naturalHeight:100,anchor:[.7,.6]};
let passed=0;
function test(name,fn){fn();passed++;console.log(`✓ ${name}`);}
function near(a,b){assert.ok(Math.abs(a-b)<.00001,`${a} != ${b}`);}
test('Opaque body point, not GIF canvas midpoint',()=>{const p=project(base);near(p.x,324);near(p.y,392);});
test('Horizontal mirroring',()=>near(project({...base,flip:true}).x,196));
test('Wide sprite: vertical object-fit letterbox',()=>{const p=project({...base,naturalWidth:200});near(p.x,324);near(p.y,376);});
test('Tall sprite: horizontal object-fit letterbox',()=>{const p=project({...base,naturalHeight:200});near(p.x,292);near(p.y,392);});
test('CSS scale/translate uses transformed rect',()=>{const p=project({...base,rect:{left:70,top:120,width:640,height:640}});near(p.x,518);near(p.y,504);});
test('Mobile layout',()=>{const p=project({...base,width:138,height:138,rect:{left:0,top:0,width:138,height:138}});near(p.x,96.6);near(p.y,82.8);});
test('Unknown anchor has stable fallback',()=>near(project({...base,anchor:null}).x,260));
test('Out-of-range anchor clamps',()=>near(project({...base,anchor:[2,-1]}).x,420));
test('Unloaded image returns null, not NaN',()=>assert.equal(project({...base,naturalWidth:0}),null));
test('Non-finite rect returns null',()=>assert.equal(project({...base,rect:{...base.rect,width:NaN}}),null));
test('Zero-size container returns null',()=>assert.equal(project({...base,width:0}),null));
test('All shipped body anchors are valid normalized coordinates',()=>{
 const entries=JSON.parse(fs.readFileSync(new URL('../src/data/sprite-map.json',import.meta.url))).entries;
 let count=0;
 for(const e of Object.values(entries))for(const side of ['front','back'])if(e[side+'Body']){assert.ok(e[side+'Body'].length===2&&e[side+'Body'].every(x=>Number.isFinite(x)&&x>=0&&x<=1));count++;}
 assert.ok(count>=18);
});
// v0.9.5: mouth anchors (move-effect origins) ship for (almost) every sprite and sit on the facing side of the body core.
test('Shipped mouth anchors: valid, near-complete, on the facing side of the body, hand-checked overrides applied',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../src/data/sprite-map.json',import.meta.url)));
 const entries=data.entries,overrides=JSON.parse(fs.readFileSync(new URL('../tools/mouth-overrides.json',import.meta.url)));
 let total=0,withMouth=0,facing=0,compared=0;
 for(const e of Object.values(entries))for(const side of ['front','back']){if(!e[side])continue;total++;const m=e[side+'Mouth'];if(!m)continue;withMouth++;
  assert.ok(m.length===2&&m.every(x=>Number.isFinite(x)&&x>=0&&x<=1),`mouth anchor out of range: ${JSON.stringify(m)}`);
  const b=e[side+'Body'];if(b){compared++;if(side==='back'?m[0]>b[0]:m[0]<b[0])facing++;}}
 assert.ok(withMouth/total>=.99,`mouth anchors cover ${withMouth}/${total}`);
 assert.ok(facing/compared>=.97,`mouth on the facing side of the body for ${facing}/${compared}`);
 for(const [id,sides] of Object.entries(overrides)){if(id.startsWith('_'))continue;for(const [side,point] of Object.entries(sides))assert.deepEqual(entries[id][side+'Mouth'],point,`${id} ${side} override applied`);}
 assert.match(String(data.mouthAnchorMethod||''),/mouth/i);
});
test('Desktop Mega is 111px (previously 74px)',()=>near(iconSize(320,'mega'),111));
test('Mobile Mega is 1.5x previous responsive size',()=>near(iconSize(138,'mega'),138*.24*1.5));
test('Z icon cap is 159px',()=>near(iconSize(1000,'z'),159));
test('Small/invalid inputs safely use the 45px minimum',()=>{near(iconSize(0,'mega'),45);near(iconSize(NaN,'mega'),45);});
console.log(`Sprite anchor tests: ${passed}/${passed} passed.`);
