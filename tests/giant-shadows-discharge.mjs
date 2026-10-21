import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8000/preview.html');
await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('实时'));
const f=page.frames().find(f=>f.url().includes('fxpreview'));
const results=[];
for(const width of [1440,390]){
 await page.setViewportSize({width,height:1100});
 for(const species of ['pikachu','charizard','venusaur']){
  await page.locator('#species').selectOption(species);const sizes={width,species};
  for(const form of ['normal','dynamax','gmax']){
   await page.locator(`#forms [data-form="${form}"]`).click();
   await f.waitForFunction(()=>document.querySelector('#p-sprite > img')?.naturalWidth>0);await page.waitForTimeout(140);
   sizes[form]=await f.evaluate(()=>{const box=document.querySelector('#p-sprite'),img=box.querySelector('img'),shadow=getComputedStyle(box,'::before'),core=getComputedStyle(box,'::after'),rect=img.getBoundingClientRect(),br=box.getBoundingClientRect();return {imageWidth:rect.width,shadowWidth:parseFloat(shadow.width),shadowHeight:parseFloat(shadow.height),coreWidth:parseFloat(core.width),boxWidth:br.width,centerY:br.top+parseFloat(shadow.top)+parseFloat(shadow.height)/2,floor:br.bottom-27+parseFloat(getComputedStyle(box).getPropertyValue('--ground-shift'))};});
  }
  for(const form of ['dynamax','gmax']){
   assert.ok(sizes[form].shadowWidth>sizes.normal.shadowWidth*1.3,'giant shadow grows visibly');
   assert.ok(sizes[form].shadowHeight>sizes.normal.shadowHeight*1.3,'giant shadow gains depth');
   assert.ok(sizes[form].coreWidth<sizes[form].shadowWidth,'contact core distinct from cast shadow');
   assert.ok(Math.abs(sizes[form].centerY-sizes[form].floor)<2,'shadow stays on ground');
  }results.push(sizes);
 }
}
await page.setViewportSize({width:1440,height:1100});
await page.locator('#species').selectOption('charizard');
await page.locator('#forms [data-form="gmax"]').click();
await page.locator('#weather button[data-value=""]').click();
await page.locator('#terrain button[data-value="electric"]').click();
await page.waitForTimeout(2000);await page.locator('#arcs').click();await page.waitForTimeout(430);
assert.ok(Number(await f.locator('.field-fx-terrain').getAttribute('data-arcs'))>0);
await page.screenshot({path:'/home/user/交付-v1.3.17/分叉放电与巨大阴影.png',fullPage:true});
assert.deepEqual(errors,[]);
fs.writeFileSync('/home/user/交付-v1.3.17/实际身体与阴影测量.json',JSON.stringify(results,null,2));
console.log('PASS: 3 species × 2 viewports; cast shadow width/depth grow in both giant forms; contact core remains smaller; shadow aligned with measured floor; branched discharge preview; no JS errors.');
await browser.close();
