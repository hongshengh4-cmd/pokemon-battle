import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const cfg={seed:37,difficulty:'easy',environment:{weather:'raindance',terrain:'grassyterrain',terrainTurns:5},p1:{entrants:[{party:[{name:'pikachu',lv:30,moves:['tackle'],mechanic:'dynamax',dynamaxForm:process.argv.includes('--gmax')?'gmax':''}]}]},p2:{entrants:[{party:[{name:'blissey',lv:100,moves:['splash']}]}]}};
await page.goto('http://127.0.0.1:8000/?config='+encodeURIComponent(JSON.stringify(cfg)));
await page.waitForSelector('.field-fx-weather[data-effect="rain"]');
await page.waitForSelector('.field-fx-terrain[data-effect="grassy"]');
assert.match(await page.locator('#field-state').innerText(),/下雨/);
await page.waitForTimeout(1200);
// Menu redraw retains both particles and the sprite node (even if external assets fail).
assert.equal(await page.evaluate(()=>{
 const n=document.querySelector('.field-fx-weather'); const img=document.querySelector('#p-sprite > img');
 document.querySelector('#command-fight').click();
 return n===document.querySelector('.field-fx-weather') && img===document.querySelector('#p-sprite > img');
}),true);
await page.locator('.mechanic-item').click();
await page.locator('#moves button').first().click();
await page.waitForFunction(()=>document.querySelector('#action-card').getAttribute('aria-busy')==='false',null,{timeout:20000});
for(let turn=2;turn<=3;turn++){
 await page.evaluate(()=>{window.samples=[];let stop=performance.now()+6000;function sample(){let el=document.querySelector('#p-sprite');window.samples.push({time:performance.now(),giant:el.classList.contains('is-dynamax'),attack:!!el.querySelector('.fx-attack'),species:el.querySelector('img')?.dataset.species,scale:parseFloat(getComputedStyle(el.querySelector('img')).scale),visibleRatio:el.querySelector('img').getBoundingClientRect().width/el.querySelector('img').clientWidth});if(performance.now()<stop)requestAnimationFrame(sample);}sample();});
 await page.locator('#moves button').first().click();
 await page.waitForFunction(()=>document.querySelector('#action-card').getAttribute('aria-busy')==='false',null,{timeout:20000});
 const attackSamples=await page.evaluate(()=>window.samples.filter(s=>s.attack));
 assert.ok(attackSamples.length>0,'attack captured');
 assert.ok(attackSamples.every(s=>s.giant),'Dynamax stays giant through final attack');
 assert.ok(attackSamples.every(s=>s.scale>=1.179 && s.visibleRatio>=1.17),'actual geometry remains giant through attack');
}
assert.equal(await page.locator('#p-sprite').evaluate(e=>e.classList.contains('is-dynamax')),false);
for(const weather of ['sun','rain','sand','snow'])for(const terrain of ['electric','grassy','misty','psychic']){
 await page.evaluate(({weather,terrain})=>PKMFieldFX.sync(document.querySelector('.arena'),{weather,field:{terrain}}),{weather,terrain});
 assert.equal(await page.locator('.field-fx').count(),2);
}
await page.evaluate(()=>PKMFieldFX.sync(document.querySelector('.arena'),{field:{}}));
assert.equal(await page.locator('.field-fx').count(),0);
await page.setViewportSize({width:390,height:844});
await page.emulateMedia({reducedMotion:'reduce'});
await page.evaluate(()=>PKMFieldFX.sync(document.querySelector('.arena'),{weather:'snow',field:{terrain:'misty'}}));
const image1=await page.locator('.field-fx-weather canvas').evaluate(c=>c.toDataURL());
await page.waitForTimeout(120);
assert.equal(await page.locator('.field-fx-weather canvas').evaluate(c=>c.toDataURL()),image1);
assert.deepEqual(errors,[]);
await page.screenshot({path:'/home/user/mobile-field-preview.png'});
console.log('Browser PASS: legacy weather, combined layers, redraw identity, 3-turn Dynamax expiry, 16 combinations, cleanup, reduced motion, no JS errors.');
await browser.close();
