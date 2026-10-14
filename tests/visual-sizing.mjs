// Real-browser size, floor, shadow, form lifecycle and switch regression checks.
// Start the static server, then node tests/visual-sizing.mjs http://127.0.0.1:8007/ /path/to/output
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const base=process.argv[2]||'http://127.0.0.1:8007/';
const output=process.argv[3]||path.join(root,'.cache/size-results');
fs.mkdirSync(output,{recursive:true});
const spriteMap=JSON.parse(fs.readFileSync(path.join(root,'src/data/sprite-map.json'))).entries;
const feet={};for(const e of Object.values(spriteMap))for(const side of ['front','back'])feet[e[side]]=e[side+'Feet'];
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1365,height:960}});
const waitIdle=()=>page.waitForFunction(()=>document.querySelector('#action-card')?.getAttribute('aria-busy')==='false',{},{timeout:18000});
// v0.9.1: a resolved action stays on the panel it came from, so navigate like a player would: back first, then the wanted command.
const goHome=async()=>{if(await page.locator('#command-back').isVisible())await page.locator('#command-back').click();};
const openFight=async()=>{if(!(await page.locator('#moves').isVisible())){await goHome();await page.locator('#command-fight').click();}};
const openSwitch=async()=>{if(!(await page.locator('#switches').isVisible())){await goHome();await page.locator('#command-switch').click();}};
const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://play.pokemonshowdown.com/sprites/**',async route=>{
 const url=route.request().url(),cached=path.join(root,'.cache/body-sprites',crypto.createHash('sha256').update(url).digest('hex')+path.extname(new URL(url).pathname));
 if(fs.existsSync(cached))await route.fulfill({path:cached,contentType:url.endsWith('.gif')?'image/gif':'image/png'});else await route.continue();
});
const mon=(name,extra={})=>({name,lv:62,moves:['tackle'],...extra});
const cfg=(party,foe=[mon('blissey',{lv:100,moves:['splash']})])=>({difficulty:'expert',p1:{entrants:[{name:'player',party}]},p2:{entrants:[{name:'enemy',party:foe}]}});
async function start(config,width=1365){
 await page.setViewportSize({width,height:960});
 await page.goto(base+'?config='+encodeURIComponent(JSON.stringify(config)));
 await page.waitForFunction(()=>['p','e'].every(s=>document.querySelector(`#${s}-sprite > img`)?.naturalWidth>0));
 await page.waitForTimeout(1100);
}
async function measure(side='p'){
 return page.evaluate(({side,feet})=>{
  const box=document.querySelector(`#${side}-sprite`),img=box.querySelector(':scope > img'),r=img.getBoundingClientRect(),b=box.getBoundingClientRect();
  const fit=Math.min(img.clientWidth/img.naturalWidth,img.clientHeight/img.naturalHeight),contentH=img.naturalHeight*fit;
  const fraction=feet[img.currentSrc||img.src];
  const foot=r.top+((img.clientHeight-contentH)/2+fraction*contentH)*r.height/img.clientHeight;
  const sh=Number.parseFloat(getComputedStyle(box).getPropertyValue('--shadow-width'));
  return {species:img.dataset.species,width:img.clientWidth,paintWidth:r.width,height:img.clientHeight,shadow:sh,groundError:Math.abs(foot-(b.bottom-27)),ratio:Number.parseFloat(img.style.getPropertyValue('--body-ratio')),viewport:innerWidth,front:side==='e'};
 },{side,feet});
}
async function shot(name){await page.screenshot({path:path.join(output,name+'.png')});}
function check(name,m){assert.ok(m.groundError<5.5,`${name}: foot/floor error ${m.groundError}`);assert.ok(m.shadow>0&&m.shadow<400,`${name}: invalid shadow`);results.push({name,...m});console.log('PASS',name,JSON.stringify(m));}
try{
for(const width of [1365,800,390]){
 const collected={};
 for(const species of ['pikachu','charizard','joltik','wailord','onix']){
  await start(cfg([mon(species)]),width);
  const m=await measure();check(`${species}-${width}`,m);collected[species]=m;
  if(['pikachu','charizard'].includes(species))await shot(`${species}-${width}`);
 }
 assert.ok(collected.pikachu.width<collected.charizard.width*.6,'Pikachu must be clearly smaller');
 assert.ok(collected.pikachu.shadow<collected.charizard.shadow*.7,'Small Pokemon need small shadows');
 assert.ok(collected.joltik.width>=50,'Tiny Pokemon must still be readable on mobile');
}
// Enemy uses the same biological size logic, but the far-side perspective token.
await start(cfg([mon('pikachu')],[mon('pikachu',{moves:['splash']})]));
const near=await measure(),far=await measure('e');check('same-species-enemy-perspective',far);assert.ok(near.width>far.width*1.4);
// Idle resize must update floor/shadow even when no evolution icon is tracking it.
await page.setViewportSize({width:390,height:960});await page.waitForTimeout(250);check('idle-resize-mobile',await measure());
// Switch through the actual command buttons, not a direct call to UI internals.
await start(cfg([mon('pikachu'),mon('charizard')]));
await openSwitch();await page.locator('#switches button:enabled').first().click();await waitIdle();
const switched=await measure();check('switch-small-to-large',switched);assert.equal(switched.species,'charizard');assert.equal(switched.width,320);await shot('switch-to-charizard');
await openSwitch();await page.locator('#switches button:enabled').first().click();await waitIdle();
const back=await measure();check('switch-large-to-small',back);assert.equal(back.species,'pikachu');assert.ok(back.width<170);
// Dynamax is an explicit exception: tiny creatures grow, then return to normal.
await start(cfg([mon('pikachu',{mechanic:'dynamax'})]));
const regular=await measure();await openFight();await page.locator('#mechanics button').click();await page.locator('#moves button').first().click();await waitIdle();
const giant=await measure();check('dynamax-pikachu-grown',giant);assert.ok(giant.paintWidth>regular.paintWidth*1.8);await shot('dynamax-pikachu');
for(let i=0;i<2;i++){await openFight();await page.locator('#moves button').first().click();await waitIdle();}
const ended=await measure();check('dynamax-pikachu-restored',ended);assert.ok(ended.width<170);await shot('dynamax-ended-pikachu');
// Faint/successor replay temporarily restores the old sprite: size state must follow both swaps.
await start(cfg([mon('pikachu',{lv:1}),mon('charizard')],[mon('charizard',{lv:100,moves:['flamethrower']})]));
await openFight();await page.locator('#moves button').first().click();await waitIdle();
// Some engine states require the player's forced switch selection.
if(await page.locator('#switches button').count()){const s=await measure();if(s.species==='pikachu'){await page.locator('#switches button:enabled').first().click();await waitIdle();}}
const successor=await measure();check('faint-successor-size',successor);assert.equal(successor.species,'charizard');assert.equal(successor.width,320);
assert.equal(errors.length,0,errors.join('\n'));
fs.writeFileSync(path.join(output,'size-results.json'),JSON.stringify({results,errors},null,2));
console.log(`Size browser checks: ${results.length} passed; no page errors.`);
}finally{await browser.close();}
