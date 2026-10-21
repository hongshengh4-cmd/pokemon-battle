import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8000/preview.html');
await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('实时'));
const f=page.frames().find(f=>f.url().includes('fxpreview'));
await f.waitForFunction(()=>['p','e'].every(s=>document.querySelector('#'+s+'-sprite > img')?.naturalWidth>0));
await page.waitForTimeout(200);
await page.screenshot({path:'/home/user/preview-v1311-desktop.png',fullPage:true});
const results=[];
for(const species of ['pikachu','charizard','venusaur'])for(const form of ['dynamax','gmax']){
 await f.evaluate(({species,form})=>PKMPreview.set({species,form,weather:'rain',terrain:'grassy'}),{species,form});
 await f.waitForFunction(()=>document.querySelector('#p-sprite > img')?.naturalWidth>0);
 for(const kind of ['physical','special','hit']){
  const samples=await f.evaluate(async kind=>{
    const result=[];let done=false;
    const sample=()=>{const i=document.querySelector('#p-sprite > img'),s=getComputedStyle(i),m=new DOMMatrixReadOnly(s.transform),rect=i.getBoundingClientRect();result.push({scale:parseFloat(s.scale),det:Math.abs(m.a*m.d-m.b*m.c),ratio:rect.width/i.clientWidth,flip:parseFloat(s.getPropertyValue('--flip'))});if(!done)requestAnimationFrame(sample);};sample();
    await PKMPreview.attack(kind);await new Promise(r=>setTimeout(r,120));done=true;return result;
  },kind);
  assert.ok(samples.length>20);
  assert.ok(samples.every(s=>s.scale>=1.179),'permanent scale persisted');
  assert.ok(samples.every(s=>s.det>.98),'no transform-size dip in actual computed matrix');
  assert.ok(samples.every(s=>s.ratio>=1.17),'bounding-box size never reverted to unit scale');
  results.push({species,form,kind,frames:samples.length,minScale:Math.min(...samples.map(s=>s.scale)),minVisibleRatio:Math.min(...samples.map(s=>s.ratio))});
 }
}
// Foreground animation is not restarted on selecting or redrawing settings.
assert.ok(await f.evaluate(()=>{const a=document.querySelector('.arena'),c=a.querySelector('canvas');PKMFieldFX.sync(a,{weather:'sun',field:{terrain:'electric'}});return c===a.querySelector('canvas');}));
for(const weather of ['','sun','rain','sand','snow'])for(const terrain of ['','electric','grassy','misty','psychic']){
 await f.evaluate(({weather,terrain})=>PKMPreview.set({weather,terrain,form:'normal',species:'pikachu'}),{weather,terrain});
 assert.equal(await f.locator('canvas').count(),2);
}
// UI buttons and paused environment have user-observable behavior.
await page.locator('#weather button[data-value="snow"]').click();
await page.locator('#terrain button[data-value="misty"]').click();
await page.locator('#pause').click();
assert.match(await page.locator('#pause').innerText(),/继续/);
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:'/home/user/preview-v1311-mobile.png',fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
await page.emulateMedia({reducedMotion:'reduce'});
await f.evaluate(()=>PKMPreview.set({weather:'snow',terrain:'misty'}));
assert.deepEqual(errors,[]);
fs.writeFileSync('/home/user/v1311-frame-metrics.json',JSON.stringify(results,null,2));
console.log('PASS 18 attack/hit cases (3 species × 2 giant forms × 3 animations), frame-level computed scale/matrix/visible geometry, all 25 environment combinations, controls, mobile overflow, reduced motion, no JS errors.');
console.log('frames sampled:',results.reduce((n,r)=>n+r.frames,0));
await browser.close();
