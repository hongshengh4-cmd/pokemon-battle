import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8000/preview.html');
await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('实时'));
const f=page.frames().find(f=>f.url().includes('fxpreview'));
const results=[];
for(const terrain of ['grassy','misty','electric','psychic']){
 await page.locator(`#terrain button[data-value="${terrain}"]`).click();
 await page.locator('#weather button[data-value=""]').click();
 await page.locator('#spread').click();
 await page.waitForTimeout(80);
 const start=await f.locator('.field-fx-terrain').getAttribute('data-spread');
 await page.waitForTimeout(2000);
 const stats=await f.evaluate(()=>{
  const layer=document.querySelector('.field-fx-terrain'),c=layer.querySelector('canvas'),g=c.getContext('2d');
  const regions=[];for(const yy of [.52,.7,.9])for(const xx of [.1,.5,.9]){
   const x=Math.round(c.width*xx),y=Math.round(c.height*yy),a=g.getImageData(x,y,5,5).data;let n=0;for(let k=3;k<a.length;k+=4)n+=a[k];regions.push({xx,yy,meanAlpha:n/25});
  }return {regions,coverage:layer.dataset.coverage,spread:layer.dataset.spread};
 });
 assert.equal(stats.coverage,'continuous');assert.equal(stats.spread,'1.000');assert.ok(Number(start)<.3);
 assert.ok(stats.regions.every(r=>r.meanAlpha>3),'whole ground, including centre and both edges, covered');
 results.push({terrain,start,...stats});
 await page.screenshot({path:`/home/user/交付-v1.3.15/预览-${terrain}.png`,fullPage:true});
}
for(const weather of ['snow','rain','sand']){
 await page.locator(`#weather button[data-value="${weather}"]`).click();
 await page.waitForTimeout(200);
 const count=Number(await f.locator('.field-fx-weather').getAttribute('data-particles'));results.push({weather,particles:count});
 await page.screenshot({path:`/home/user/交付-v1.3.15/天气-${weather}.png`,fullPage:true});
}
const snow=results.find(r=>r.weather==='snow').particles;
assert.ok(results.find(r=>r.weather==='rain').particles<snow*.5);
assert.ok(results.find(r=>r.weather==='sand').particles<snow*.5);
await page.setViewportSize({width:390,height:844});
await page.locator('#terrain button[data-value="grassy"]').click();
await page.waitForTimeout(2000);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
await page.emulateMedia({reducedMotion:'reduce'});
await page.locator('#terrain button[data-value="electric"]').click();
assert.equal(await f.locator('.field-fx-terrain').getAttribute('data-spread'),'1.000');
assert.deepEqual(errors,[]);
fs.writeFileSync('/home/user/交付-v1.3.15/连续覆盖与蔓延检查.json',JSON.stringify(results,null,2));
console.log('PASS four continuous surfaces, nine ground zones each incl. middle and both edges; near-to-far spread/replay; rain/sand under half snow particle count; mobile; reduced motion; no page errors.');
await browser.close();
