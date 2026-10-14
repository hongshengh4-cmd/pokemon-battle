// Functional browser acceptance: navigation, capture, storage and manual team placement.
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(new URL('..',import.meta.url).pathname),base=process.argv[2]||'http://127.0.0.1:8009/';
const output=process.argv[3]||path.join(root,'.cache/capture-results');fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1365,height:980}}),page=await context.newPage();
const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.route('https://play.pokemonshowdown.com/sprites/**',async route=>{const url=route.request().url(),cached=path.join(root,'.cache/body-sprites',crypto.createHash('sha256').update(url).digest('hex')+path.extname(new URL(url).pathname));if(fs.existsSync(cached))await route.fulfill({path:cached,contentType:url.endsWith('.gif')?'image/gif':'image/png'});else await route.continue();});
const cfg=(seed,extra={})=>({seed,encounter:{type:'wild'},difficulty:'expert',p1:{entrants:[{name:'player',party:[{name:'blissey',lv:62,moves:['tackle','softboiled']},{name:'charizard',lv:62,moves:['flamethrower']}]}]},p2:{entrants:[{name:'enemy',party:[{name:'eevee',lv:40,moves:['tackle']}]}]},...extra});
const url=config=>base+(config?'?config='+encodeURIComponent(JSON.stringify(config)):'');
const waitReady=()=>page.waitForFunction(()=>document.querySelector('#command-title')?.textContent!=='请选择行动' && document.querySelector('#p-sprite>img')?.naturalWidth>0);
const waitIdle=()=>page.waitForFunction(()=>document.querySelector('#action-card')?.getAttribute('aria-busy')==='false',{},{timeout:15000});
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pkm-world-save-v1')));
const pass=name=>{results.push(name);console.log('PASS',name);};
async function shot(name){await page.screenshot({path:path.join(output,name+'.png')});}
try{
await page.goto(url());await waitReady();await page.waitForTimeout(900);await shot('01-main-desktop');
assert.equal(await page.locator('#command-home').isVisible(),true);assert.equal(await page.locator('#moves').isVisible(),false);pass('Primary three-action menu precedes moves');
const log=await page.locator('#log').textContent();
await page.locator('#command-fight').click();assert.equal(await page.locator('#moves').isVisible(),true);await shot('02-fight-desktop');
await page.locator('#command-back').click();assert.equal(await page.locator('#log').textContent(),log);pass('Fight and back do not consume a turn');
await page.locator('#command-balls').click();assert.ok((await page.locator('#capture-hint').textContent()).includes('训练家'));assert.equal(await page.locator('#ball-list button:enabled').count(),0);pass('Trainer capture blocked visibly');
await page.locator('#command-back').click();await page.locator('#command-switch').click();assert.equal(await page.locator('#switches button').count(),6);await shot('03-switch-desktop');
await page.locator('#switches button:enabled').first().click();assert.equal(await page.locator('#btn-start').isDisabled(),true);await waitIdle();assert.ok((await page.locator('#p-name').textContent()).includes('喷火龙'));assert.equal(await page.locator('#command-home').isVisible(),true);pass('Switch occupies turn, locks input, returns to primary menu');
// Fixed seed 7 gives a success on the first ordinary ball with this Eevee.
await page.goto(url(cfg(7)));await waitReady();await page.waitForTimeout(900);await page.locator('#command-balls').click();await shot('04-ball-bag');
assert.equal(await page.locator('#ball-list button:enabled').count(),3);pass('Wild encounter offers three ball types and stock');
const beforeTeam=await page.evaluate(()=>localStorage.getItem('pkm-custom-teams-v2'));
await page.locator('[data-ball="pokeball"]').click({clickCount:2});
await page.waitForSelector('.capture-ball',{timeout:5000});assert.equal(await page.locator('#btn-start').isDisabled(),true);await page.waitForTimeout(850);await shot('05-capture-animation');
await waitIdle();assert.equal(await page.locator('#command-end').isVisible(),true);assert.ok((await page.locator('#command-end-text').textContent()).includes('伊布'));await shot('06-capture-success');
let state=await saved();assert.equal(state.box.length,1);assert.equal(state.balls.pokeball,19);assert.equal(await page.evaluate(()=>localStorage.getItem('pkm-custom-teams-v2')),beforeTeam);pass('Successful capture saves once, consumes one ball, leaves editor unchanged');
assert.ok((await page.locator('#log').textContent()).includes('被收服'));assert.ok(!(await page.locator('#log').textContent()).includes('使用了'));pass('Successful catch ends without an enemy attack');
await page.reload();await waitReady();assert.equal((await saved()).box.length,1);assert.equal(await page.locator('#box-count').textContent(),'1');pass('Warehouse and ball stock survive reload');
await page.locator('#btn-box').click();await page.waitForTimeout(450);await shot('07-warehouse-desktop');
await page.locator('.box-card select').first().selectOption('1');await page.locator('.box-card button').first().click();
assert.ok((await page.locator('#collection-message').textContent()).includes('第2位'));
const edited=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkm-custom-teams-v2')));assert.equal(edited.player[1].species,'eevee');assert.equal(edited.player[0].species,'venusaur');assert.equal((await saved()).box.length,1);pass('Captured Pokemon can manually replace selected editor slot without erasing record');
// Ordinary failed throw: the Eevee acts, the bag is reduced and primary menu is restored.
await page.goto(url(cfg(1)));await waitReady();await page.waitForTimeout(750);const hpBefore=await page.locator('#p-hptext').textContent();
await page.locator('#command-balls').click();await page.locator('[data-ball="pokeball"]').click();await waitIdle();
state=await saved();assert.equal(state.box.length,1);assert.equal(state.balls.pokeball,18);assert.ok((await page.locator('#log').textContent()).includes('挣脱'));assert.ok((await page.locator('#log').textContent()).includes('使用了'));assert.notEqual(await page.locator('#p-hptext').textContent(),hpBefore);assert.equal(await page.locator('#command-home').isVisible(),true);await shot('08-capture-failure');pass('Failed throw consumes stock and a turn, enemy attacks, primary menu returns');
// Stock and input error cases via the public save import format.
await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('pkm-world-save-v1'));s.balls.pokeball=0;localStorage.setItem('pkm-world-save-v1',JSON.stringify(s));});
await page.reload();await waitReady();await page.locator('#command-balls').click();assert.equal(await page.locator('[data-ball="pokeball"]').isDisabled(),true);pass('An empty ball stack cannot be selected');
// Mobile real screens, both ordinary menus and wild bag.
await page.setViewportSize({width:390,height:940});await page.locator('#command-back').click();await shot('09-main-mobile');
await page.locator('#command-fight').click();await shot('10-fight-mobile');await page.locator('#command-back').click();
await page.locator('#command-switch').click();await shot('11-switch-mobile');await page.locator('#command-back').click();
await page.locator('#command-balls').click();await shot('12-balls-mobile');
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);pass('Mobile menus fit without page horizontal overflow');
await page.locator('#btn-box').click();await page.waitForTimeout(350);await shot('13-warehouse-mobile');
// Export and restore through actual file UI, not internal functions.
const downloadWait=page.waitForEvent('download');await page.locator('#btn-export-save').click();const download=await downloadWait;const exportFile=path.join(output,'export-test.json');await download.saveAs(exportFile);
const exported=JSON.parse(fs.readFileSync(exportFile));assert.equal(exported.box.length,1);pass('Browser save export includes captured Pokemon');
const imported=JSON.parse(JSON.stringify(exported));imported.balls.pokeball=6;await page.locator('#file-import-save').setInputFiles({name:'save.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
await page.waitForFunction(()=>document.querySelector('#collection-message').textContent==='存档已导入。');assert.equal((await saved()).balls.pokeball,6);pass('Validated import restores inventory and collection');
await page.locator('#file-import-save').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});await page.waitForFunction(()=>document.querySelector('#collection-message').textContent.startsWith('导入失败'));assert.equal((await saved()).box.length,1);pass('Invalid imports do not overwrite existing collection');
await page.locator('#btn-supply').click();assert.equal((await saved()).balls.pokeball,20);assert.equal((await saved()).box.length,1);pass('Explicit prototype resupply preserves warehouse');
// New encounter button enters a single wild target, not the trainer roster.
await page.locator('#btn-wild').click();await page.waitForTimeout(500);assert.ok((await page.locator('#encounter-tag').textContent()).includes('野生遭遇'));assert.equal(await page.locator('#e-team .pip').count(),1);pass('Wild shortcut creates a fresh single-Pokemon encounter');
// Forced switch after failed catch must not allow bypass via back/balls.
const faint=cfg(1);faint.p1.entrants[0].party[0]={name:'pikachu',lv:1,moves:['tackle']};faint.p2.entrants[0].party[0]={name:'eevee',lv:80,moves:['tackle']};
await page.goto(url(faint));await waitReady();await page.locator('#command-balls').click();await page.locator('[data-ball="pokeball"]').click();await waitIdle();assert.equal(await page.locator('#command-switch-panel').isVisible(),true);assert.equal(await page.locator('#command-back').isVisible(),false);pass('Failed catch causing faint forces party selection');
await page.locator('#switches button:enabled').first().click();await waitIdle();assert.ok((await page.locator('#p-name').textContent()).includes('喷火龙'));assert.equal(await page.locator('#command-home').isVisible(),true);pass('Forced replacement restores action menu without extra enemy turn');
assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:results.length,checks:results,errors},null,2));console.log(`Capture UI: ${results.length} checks passed.`);
}finally{await browser.close();}
