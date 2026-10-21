import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8000/preview.html');
await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('实时'));
const f=page.frames().find(f=>f.url().includes('fxpreview'));
await f.waitForFunction(()=>document.querySelector('#p-sprite > img')?.naturalWidth>0);
const results=[];
for(const width of [1440,390]){
 await page.setViewportSize({width,height:1050});
 for(const terrain of ['electric','grassy','misty','psychic']){
  await f.evaluate(terrain=>PKMPreview.set({weather:'rain',terrain,species:'charizard',form:'dynamax'}),terrain);
  await f.waitForFunction(()=>document.querySelector('#p-sprite > img')?.naturalWidth>0);
  await page.waitForTimeout(2000);
  const stats=await f.evaluate(()=>{
   const l=document.querySelector('.field-fx-terrain'),c=l.querySelector('canvas'),g=c.getContext('2d'),r=c.getBoundingClientRect();
   const ar=document.querySelector('.arena').getBoundingClientRect();
   const anchors=['p-sprite','e-sprite'].map((id,index)=>{const b=document.getElementById(id),r=b.getBoundingClientRect(),x=parseFloat(getComputedStyle(b).getPropertyValue('--shadow-x'));return {side:index?'enemy':'player',x:r.left-ar.left+(x||r.width*.5),y:r.bottom-ar.top-27};});
   return anchors.map(a=>{let count=0,alpha=0;const x=Math.max(0,Math.min(c.width-1,Math.round((a.x-40)*c.width/r.width))),y=Math.max(0,Math.min(c.height-1,Math.round((a.y-30)*c.height/r.height)));const data=g.getImageData(x,y,Math.min(80,c.width-x),Math.min(50,c.height-y)).data;for(let k=3;k<data.length;k+=4){if(data[k])count++;alpha+=data[k];}return {...a,visiblePixels:count,meanAlpha:alpha/(data.length/4)};});
  });
  assert.equal(stats.length,2);
  assert.ok(stats.every(s=>s.visiblePixels>20),'both feet have visible ground FX');
  assert.ok(stats.find(s=>s.side==='enemy').y<stats.find(s=>s.side==='player').y,'perspective separated');
  results.push({width,terrain,stats});
 }
}
await page.setViewportSize({width:1440,height:1050});
await page.locator('#species').selectOption('charizard');
await page.locator('#weather button[data-value="sand"]').click();
await page.locator('#terrain button[data-value="electric"]').click();
await page.waitForTimeout(150);
await page.screenshot({path:'/home/user/交付-v1.3.14/预览-沙暴与双方场地.png',fullPage:true});
// Stable independent aura: no animated alpha or GIF silhouette filter.
const aura=[];
for(let k=0;k<35;k++){
 aura.push(await f.evaluate(()=>{const a=document.querySelector('#p-sprite .dynamax-aura'),s=getComputedStyle(a),i=getComputedStyle(document.querySelector('#p-sprite > img'));return {opacity:s.opacity,bg:s.backgroundImage,filter:s.filter,animation:s.animationName,imageFilter:i.filter};}));await page.waitForTimeout(20);
}
assert.ok(aura.every(s=>s.opacity===aura[0].opacity&&s.bg===aura[0].bg&&s.filter==='none'&&s.animation==='none'));
assert.ok(aura.every(s=>!s.imageFilter.includes('255, 0, 85')));
await page.locator('#weather button[data-value="rain"]').click();
await page.locator('#terrain button[data-value="psychic"]').click();
await page.waitForTimeout(150);
await page.screenshot({path:'/home/user/交付-v1.3.14/预览-下雨与双方场地.png',fullPage:true});
assert.deepEqual(errors,[]);
fs.writeFileSync('/home/user/交付-v1.3.14/双方场地锚点与像素检查.json',JSON.stringify({results,auraSamples:aura.length},null,2));
console.log('PASS: all four terrains have nonempty visible pixels at BOTH measured feet, desktop/mobile; Charizard aura independent of animated GIF, constant opacity/no animation/filter across 35 samples; no JS errors.');
await browser.close();
