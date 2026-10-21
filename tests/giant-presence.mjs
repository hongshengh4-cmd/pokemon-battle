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
async function size(){await f.waitForFunction(()=>document.querySelector('#p-sprite > img')?.naturalWidth>0);await page.waitForTimeout(140);return f.evaluate(()=>{const img=document.querySelector('#p-sprite > img'),r=img.getBoundingClientRect(),a=document.querySelector('.arena').getBoundingClientRect();return{w:r.width,h:r.height,left:r.left-a.left,right:a.right-r.right,top:r.top-a.top,bottom:a.bottom-r.bottom,scale:getComputedStyle(img).scale};});}
for(const width of [1440,390]){
 await page.setViewportSize({width,height:1100});
 for(const species of ['pikachu','charizard','venusaur']){
  await page.locator('#species').selectOption(species);
  const record={width,species};
  for(const form of ['normal','dynamax','gmax']){
   await page.locator(`#forms [data-form="${form}"]`).click();record[form]=await size();
  }
  console.log(JSON.stringify(record));
  assert.ok(record.dynamax.w>record.normal.w*1.35,`${species}: dynamax distinctly larger`);
  assert.ok(record.gmax.w>record.normal.w*1.4,`${species}: gmax distinctly larger`);
  for(const form of ['dynamax','gmax'])assert.ok(record[form].left>=-2&&record[form].right>=-2&&record[form].top>=-2&&record[form].bottom>=-2,`${species} ${form} fits`);
  results.push(record);
 }
}
await page.setViewportSize({width:1440,height:1100});
await page.locator('#species').selectOption('charizard');
await page.locator('#forms [data-form="gmax"]').click();
await page.locator('#transform').click();
await page.waitForTimeout(500);
assert.equal(await f.locator('.gmax-arrival').count(),1);
await page.waitForFunction(()=>!document.querySelector('#transform').disabled);
await page.screenshot({path:'/home/user/交付-v1.3.16/超极巨化-完整显示.png',fullPage:true});
await page.locator('#terrain button[data-value="electric"]').click();
await page.waitForTimeout(2000);
await page.locator('#arcs').click();await page.waitForTimeout(400);
assert.ok(Number(await f.locator('.field-fx-terrain').getAttribute('data-arcs'))>0);
await page.screenshot({path:'/home/user/交付-v1.3.16/增强电弧.png',fullPage:true});
assert.deepEqual(errors,[]);
fs.writeFileSync('/home/user/交付-v1.3.16/普通与巨大形态尺寸.json',JSON.stringify(results,null,2));
console.log('PASS desktop/mobile: all 3 species visibly larger in giant forms; idle full image bounds inside arena; Gmax replay/arrival; manual enhanced arcs; no page errors.');
await browser.close();
