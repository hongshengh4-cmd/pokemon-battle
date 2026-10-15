// Layout acceptance for v0.9.1–v0.9.5: compact command deck, taller arena, sprite never covers the enemy card, move effects leave from the mouth anchor,
// the move panel stays open after a move, and the battle mechanic is an item next to the player's HP card. Usage: node tests/visual-layout.mjs [baseUrl] [outputDir]
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(new URL('..',import.meta.url).pathname),base=process.argv[2]||'http://127.0.0.1:8009/';
const output=process.argv[3]||path.join(root,'.cache/layout-results');fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1366,height:720}}),page=await context.newPage();
const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.route('https://play.pokemonshowdown.com/sprites/**',async route=>{const url=route.request().url(),cached=path.join(root,'.cache/body-sprites',crypto.createHash('sha256').update(url).digest('hex')+path.extname(new URL(url).pathname));if(fs.existsSync(cached))await route.fulfill({path:cached,contentType:url.endsWith('.gif')?'image/gif':'image/png',headers:{'access-control-allow-origin':'*'}});else{const response=await route.fetch();const body=await response.body();if(response.ok()){fs.mkdirSync(path.dirname(cached),{recursive:true});fs.writeFileSync(cached,body);}await route.fulfill({response,body,headers:{...response.headers(),'access-control-allow-origin':'*'}});}});
// Same matchup as the user's report: Venusaur (big back sprite) against Gyarados, trainer battle.
const cfg=(seed,extra={})=>({seed,difficulty:'normal',p1:{entrants:[{name:'player',party:[{name:'venusaur',lv:62,moves:['gigadrain','sludgebomb','sleeppowder','synthesis'],ability:'Overgrow',item:'Life Orb'},{name:'charizard',lv:62,moves:['flamethrower','airslash'],mechanic:'mega',megaForm:'charizardmegay'},{name:'blastoise',lv:60,moves:['surf']}]}]},p2:{entrants:[{name:'enemy',party:[{name:'gyarados',lv:47,moves:['waterfall','crunch']},{name:'corviknight',lv:47,moves:['bravebird']}]}]},...extra});
const url=config=>base+(config?'?config='+encodeURIComponent(JSON.stringify(config)):'');
const waitReady=()=>page.waitForFunction(()=>document.querySelector('#command-title')?.textContent!=='请选择行动' && document.querySelector('#p-sprite>img')?.naturalWidth>0 && document.querySelector('#e-sprite>img')?.naturalWidth>0);
const waitIdle=()=>page.waitForFunction(()=>document.querySelector('#action-card')?.getAttribute('aria-busy')==='false',{},{timeout:20000});
const settle=()=>page.waitForTimeout(1000);
const pass=name=>{results.push(name);console.log('PASS',name);};
async function shot(name){await page.locator('.battle-screen').screenshot({path:path.join(output,name+'.png')});}
const rect=sel=>page.evaluate(s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}:null;},sel);
// Opaque bounds of the sprite as drawn (the GIF frame has transparent padding, so the box is not enough).
const drawn=sel=>page.evaluate(async s=>{const img=document.querySelector(s+'>img');if(!img)return null;const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');let d;try{const bitmap=await createImageBitmap(await (await fetch(img.currentSrc||img.src)).blob());ctx.drawImage(bitmap,0,0,c.width,c.height);d=ctx.getImageData(0,0,c.width,c.height).data;}catch(e){console.log('pixel read failed',e.message);return null;}let top=c.height,bottom=0,left=c.width,right=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){if(d[(y*c.width+x)*4+3]>40){if(y<top)top=y;if(y>bottom)bottom=y;if(x<left)left=x;if(x>right)right=x;}}const r=img.getBoundingClientRect(),fit=Math.min(r.width/img.naturalWidth,r.height/img.naturalHeight),ox=r.left+(r.width-img.naturalWidth*fit)/2,oy=r.top+(r.height-img.naturalHeight*fit)/2;return{top:oy+top*fit,bottom:oy+(bottom+1)*fit,left:ox+left*fit,right:ox+(right+1)*fit};},sel);
const overlap=(a,b)=>a&&b&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
try{
await page.goto(url(cfg(3)));await waitReady();await settle();await shot('01-home-desktop');
const screen=await rect('.battle-screen'),arena=await rect('.arena'),deck=await rect('.battle-deck');
console.log('screen',Math.round(screen.height),'arena',Math.round(arena.height),'deck',Math.round(deck.height));
assert.ok(deck.height<=190,`deck too tall: ${deck.height}`);assert.ok(arena.height/deck.height>=2.45,`arena:deck ratio ${arena.height/deck.height}`);pass('Command deck is compact; arena takes most of the screen');
assert.ok(screen.bottom<=720+1,`battle screen taller than the viewport fold: ${screen.bottom}`);pass('Whole battle screen fits a 720px-tall viewport when scrolled to it');
const body=await drawn('#p-sprite'),enemyCard=await rect('.fighter.enemy .fighter-info'),field=await rect('#field-state'),playerCard=await rect('.fighter.player .fighter-info');
console.log('player sprite drawn',body&&Object.fromEntries(Object.entries(body).map(([k,v])=>[k,Math.round(v)])),'enemy card',Math.round(enemyCard.bottom));
assert.ok(body,'player sprite pixels readable');assert.ok(!overlap(body,enemyCard),'player sprite covers the enemy info card');assert.ok(!overlap(body,field),'player sprite covers the field badge');pass('Big player sprite no longer covers the enemy card');
assert.ok(body.bottom<=arena.bottom+1&&body.bottom>=arena.bottom-60,`player feet should sit near the deck edge: ${body.bottom} vs ${arena.bottom}`);pass('Player sprite and its platform moved down to the arena floor');
assert.ok(playerCard.bottom<=deck.top+1,'player card overlaps the deck');
const enemyBody=await drawn('#e-sprite');assert.ok(enemyBody&&enemyBody.top>=arena.top&&enemyBody.bottom<=arena.bottom,'enemy sprite inside arena');
// Home: all three choices visible without scrolling inside the card.
const scrollable=await page.evaluate(()=>{const el=document.querySelector('#action-card');return {sh:el.scrollHeight,ch:el.clientHeight};});assert.ok(scrollable.sh<=scrollable.ch+1,`action card overflows: ${JSON.stringify(scrollable)}`);
const choices=await page.locator('.command-choice').boundingBox?await Promise.all([0,1,2].map(i=>page.locator('.command-choice').nth(i).boundingBox())):[];for(const c of choices)assert.ok(c&&c.y+c.height<=deck.bottom+1&&c.height>=44,`choice card clipped or too small: ${JSON.stringify(c)}`);pass('Three primary choices fit the compact deck');
// Fight panel: four moves fully visible, no inner scrolling.
await page.locator('#command-fight').click();await page.waitForTimeout(150);await shot('02-fight-desktop');
const panel=await page.evaluate(()=>{const el=document.querySelector('#command-fight-panel');return {sh:el.scrollHeight,ch:el.clientHeight,moves:[...document.querySelectorAll('#moves button')].map(b=>{const r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom,h:r.height};})};});
assert.equal(panel.moves.length,4);assert.ok(panel.sh<=panel.ch+1,`fight panel scrolls: ${JSON.stringify(panel)}`);for(const m of panel.moves)assert.ok(m.bottom<=deck.bottom+1&&m.h>=34,`move button clipped: ${JSON.stringify(m)}`);pass('Four moves visible without inner scrolling');
// Use a move: the move panel must stay open afterwards.
const logLen=await page.evaluate(()=>document.querySelector('#log').textContent.length);
await page.locator('#moves button').first().click();assert.equal(await page.locator('#btn-start').isDisabled(),true);await waitIdle();await page.waitForTimeout(200);
assert.equal(await page.locator('#moves').isVisible(),true);assert.equal(await page.locator('#command-home').isVisible(),false);assert.ok((await page.evaluate(()=>document.querySelector('#log').textContent.length))>logLen);await shot('03-after-move-desktop');
assert.equal(await page.locator('#command-back').isVisible(),true);pass('After a move the fight panel stays open (no fall-back to the primary menu)');
await page.locator('#command-back').click();assert.equal(await page.locator('#command-home').isVisible(),true);pass('Back still returns to the primary menu without using a turn');
// v0.9.2: the mechanic is an item (Mega Stone / Z-Crystal / Dynamax Band / Tera Orb) parked left of the player's HP card, not a button in the deck.
await page.locator('#command-switch').click();await page.locator('#switches button:enabled').first().click();await waitIdle();await page.waitForTimeout(200);
assert.ok((await page.locator('#p-name').textContent()).includes('喷火龙'));assert.equal(await page.locator('#moves').isVisible(),true);pass('After a voluntary switch the new Pokemon opens straight on its moves');
const mech=await rect('#mechanics button');assert.ok(mech,'mechanic item rendered');const pCard=await rect('.fighter.player .fighter-info'),pSprite=await rect('#p-sprite'),arenaBox=await rect('.arena'),headingBox=await rect('.command-heading');
console.log('mechanic item',mech,'player card',pCard);
assert.ok(mech.right<=pCard.left+1,`item must sit left of the player card: ${JSON.stringify({mech,pCard})}`);assert.ok(mech.left>=pSprite.right-1,'item overlaps the sprite box');assert.ok(mech.top<pCard.bottom&&mech.bottom>pCard.top,'item is not vertically beside the card');assert.ok(mech.bottom<=arenaBox.bottom+1&&mech.bottom<=headingBox.top,'item spills out of the arena into the deck');
assert.equal(await page.getAttribute('#mechanics button','data-state'),'ready');assert.equal(await page.getAttribute('#mechanics button','data-kind'),'mega');assert.ok((await page.locator('#mechanics .mechanic-art :is(svg, .ps-item-icon)').count())>=1,'item has artwork');const artBox=await rect('#mechanics .mechanic-art :is(svg, .ps-item-icon)');assert.ok(artBox&&artBox.width>=56&&artBox.width<=76,`item art size ${artBox&&artBox.width}`);assert.ok((await page.locator('#mechanics .mechanic-label').textContent()).includes('超级进化石'));assert.equal(await page.locator('.command-heading button.mechanic-btn, .command-heading #mechanics').count(),0,'old heading toggle must be gone');
const panel2=await page.evaluate(()=>{const el=document.querySelector('#command-fight-panel');return {sh:el.scrollHeight,ch:el.clientHeight};});assert.ok(panel2.sh<=panel2.ch+1,`fight panel scrolls with mechanic: ${JSON.stringify(panel2)}`);await shot('04-fight-mechanic-desktop');pass('Mega Stone item sits left of the player HP card (inside the arena) and moves still fit');
// The item is part of the arena HUD: visible from the home menu too; clicking it arms the mechanic and jumps to the move list.
await page.locator('#command-back').click();assert.equal(await page.locator('#command-home').isVisible(),true);assert.equal(await page.locator('#mechanics button').isVisible(),true);assert.equal(await page.getAttribute('#mechanics button','data-state'),'ready');
await page.locator('#mechanics button').click();await page.waitForTimeout(120);assert.equal(await page.locator('#moves').isVisible(),true);assert.equal(await page.getAttribute('#mechanics button','data-state'),'armed');assert.equal(await page.getAttribute('#mechanics button','aria-pressed'),'true');assert.ok((await page.locator('#mechanics .mechanic-label').textContent()).includes('超级进化'));assert.ok((await page.locator('#command-status').textContent()).includes('超级进化石'));await shot('04b-armed-desktop');
await page.locator('#mechanics button').click();await page.waitForTimeout(60);assert.equal(await page.getAttribute('#mechanics button','data-state'),'ready');await page.locator('#mechanics button').click();await page.waitForTimeout(60);assert.equal(await page.getAttribute('#mechanics button','data-state'),'armed');pass('Item stays visible on the home menu; clicking it arms (toggle) and opens the moves');
await page.locator('#moves button').first().click();await waitIdle();await page.waitForTimeout(200);
assert.ok((await page.locator('#p-sub').textContent()).includes('超级进化'));assert.equal(await page.locator('#moves').isVisible(),true);assert.equal(await page.locator('#mechanics button').count(),1);assert.equal(await page.getAttribute('#mechanics button','data-state'),'spent');assert.equal(await page.locator('#mechanics button').isDisabled(),true);assert.ok((await page.locator('#mechanics .mechanic-label').textContent()).includes('已发动'));await shot('05-after-mega-desktop');pass('Mega turn resolves and stays on moves; the spent stone stays visible but greyed out');
// Switch and ball panels fit too.
await page.locator('#command-back').click();await page.locator('#command-switch').click();await page.waitForTimeout(100);const sw=await page.evaluate(()=>{const el=document.querySelector('#command-switch-panel');return {sh:el.scrollHeight,ch:el.clientHeight};});assert.ok(sw.sh<=sw.ch+1,`switch panel scrolls: ${JSON.stringify(sw)}`);await shot('06-switch-desktop');pass('Party list fits the compact deck');
await page.locator('#command-back').click();await page.locator('#command-balls').click();await page.waitForTimeout(100);const bl=await page.evaluate(()=>{const el=document.querySelector('#command-balls-panel');return {sh:el.scrollHeight,ch:el.clientHeight};});assert.ok(bl.sh<=bl.ch+1,`ball panel scrolls: ${JSON.stringify(bl)}`);await shot('07-balls-desktop');pass('Ball bag fits the compact deck');
// Wild: failed throw keeps the bag open so the next ball is one click away.
await page.goto(url({seed:1,encounter:{type:'wild'},difficulty:'expert',p1:{entrants:[{name:'player',party:[{name:'blissey',lv:62,moves:['tackle','softboiled']},{name:'charizard',lv:62,moves:['flamethrower']}]}]},p2:{entrants:[{name:'enemy',party:[{name:'eevee',lv:40,moves:['tackle']}]}]}}));await waitReady();await settle();
await page.locator('#command-balls').click();await page.locator('[data-ball="pokeball"]').click();await waitIdle();await page.waitForTimeout(200);
assert.ok((await page.locator('#log').textContent()).includes('挣脱'));assert.equal(await page.locator('#command-balls-panel').isVisible(),true);await shot('08-after-failed-throw');pass('Failed throw keeps the ball bag open');
// Forced replacement after a faint opens the new Pokemon's moves.
await page.goto(url({seed:1,encounter:{type:'wild'},difficulty:'expert',p1:{entrants:[{name:'player',party:[{name:'blissey',lv:5,moves:['tackle']},{name:'charizard',lv:62,moves:['flamethrower']}]}]},p2:{entrants:[{name:'enemy',party:[{name:'eevee',lv:60,moves:['tackle']}]}]}}));await waitReady();await settle();
await page.locator('#command-fight').click();await page.locator('#moves button').first().click();await waitIdle();await page.waitForTimeout(200);
assert.equal(await page.locator('#command-switch-panel').isVisible(),true);assert.equal(await page.locator('#command-back').isVisible(),false);await shot('09-forced-switch');
await page.locator('#switches button:enabled').first().click();await waitIdle();await page.waitForTimeout(200);assert.ok((await page.locator('#p-name').textContent()).includes('喷火龙'));assert.equal(await page.locator('#moves').isVisible(),true);pass('Forced replacement opens the replacement\'s moves');
// Larger desktop and mobile sanity.
await page.setViewportSize({width:1440,height:900});await page.goto(url(cfg(3)));await waitReady();await settle();await shot('10-home-desktop-900');
const arena2=await rect('.arena'),deck2=await rect('.battle-deck'),body2=await drawn('#p-sprite'),card2=await rect('.fighter.enemy .fighter-info');assert.ok(arena2.height>=arena.height,'taller viewport should not shrink the arena');assert.ok(!overlap(body2,card2),'sprite covers enemy card at 900px');assert.ok(deck2.height<=190);pass('900px viewport: arena grows, deck stays compact');
await page.setViewportSize({width:390,height:844});await page.goto(url(cfg(3)));await waitReady();await settle();await shot('11-home-mobile');
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
const mBody=await drawn('#p-sprite'),mCard=await rect('.fighter.enemy .fighter-info');assert.ok(!overlap(mBody,mCard),'mobile sprite covers enemy card');
await page.locator('#command-fight').click();await page.waitForTimeout(150);await shot('12-fight-mobile');const mp=await page.evaluate(()=>{const el=document.querySelector('#command-fight-panel');return {sh:el.scrollHeight,ch:el.clientHeight};});assert.ok(mp.sh<=mp.ch+1,`mobile fight panel scrolls: ${JSON.stringify(mp)}`);
await page.locator('#moves button').first().click();await waitIdle();await page.waitForTimeout(200);assert.equal(await page.locator('#moves').isVisible(),true);pass('Mobile: no horizontal overflow, moves fit, fight panel persists');
// Mobile: the item shrinks but still sits between the sprite box and the HP card, inside the arena.
await page.goto(url(cfg(3,{p1:{entrants:[{name:'player',party:[{name:'charizard',lv:62,moves:['flamethrower','airslash'],mechanic:'mega',megaForm:'charizardmegay'},{name:'venusaur',lv:62,moves:['gigadrain']}]}]}})));await waitReady();await settle();
const mItem=await rect('#mechanics button'),mPCard=await rect('.fighter.player .fighter-info'),mSprite=await rect('#p-sprite'),mArena=await rect('.arena');assert.ok(mItem,'mobile item rendered');
assert.ok(mItem.right<=mPCard.left+1&&mItem.left>=mSprite.right-1,`mobile item not between sprite and card: ${JSON.stringify({mItem,mPCard,mSprite})}`);assert.ok(mItem.bottom<=mArena.bottom+1&&mItem.width>=40&&mItem.width<=56,'mobile item size/placement');await shot('13-item-mobile');
await page.locator('#mechanics button').click();await page.waitForTimeout(120);assert.equal(await page.getAttribute('#mechanics button','data-state'),'armed');assert.equal(await page.locator('#moves').isVisible(),true);pass('Mobile: item fits between sprite and card and still arms the mechanic');
// v0.9.5: ranged move effects leave from the attacker's mouth (measured anchor), not the sprite box centre, and end on the target's body.
await page.setViewportSize({width:1366,height:720});
const spriteMap=JSON.parse(fs.readFileSync(path.join(root,'src/data/sprite-map.json'),'utf8')).entries;
assert.ok(spriteMap.charizard.backMouth&&spriteMap.gyarados.frontMouth,'mouth anchors present in sprite-map.json');
await page.goto(url({seed:5,difficulty:'normal',p1:{entrants:[{name:'player',party:[{name:'charizard',lv:75,moves:['flamethrower','dragonpulse']}]}]},p2:{entrants:[{name:'enemy',party:[{name:'gyarados',lv:55,moves:['hydropump']}]}]}}));await waitReady();await settle();
const anchorPoint=(sel,anchor)=>page.evaluate(([s,a])=>{const img=document.querySelector(s+'>img');const r=img.getBoundingClientRect(),st=document.querySelector('.arena').getBoundingClientRect();const p=PKMSpriteAnchor.project({rect:r,width:img.clientWidth,height:img.clientHeight,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,anchor:a,flip:parseFloat(getComputedStyle(img).getPropertyValue('--flip'))<0});return {x:p.x,y:p.y,arenaLeft:st.left,arenaTop:st.top};},[sel,anchor]);
await page.evaluate(()=>{window.__fx=[];new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){if(n.nodeType===1&&(n.classList.contains('fx-p')||n.classList.contains('fx-beam')))window.__fx.push({cls:n.className,left:parseFloat(n.style.left),top:parseFloat(n.style.top),at:performance.now()});}}).observe(document.querySelector('.arena'),{childList:true});});
const pMouth=await anchorPoint('#p-sprite',spriteMap.charizard.backMouth),eMouth=await anchorPoint('#e-sprite',spriteMap.gyarados.frontMouth),pDrawn=await drawn('#p-sprite'),eDrawn=await drawn('#e-sprite'),pBox=await rect('#p-sprite'),eBox=await rect('#e-sprite');
await page.locator('#command-fight').click();await page.locator('#moves button').first().click();await waitIdle();await page.waitForTimeout(300);
const fx=await page.evaluate(()=>window.__fx);const flames=fx.filter(f=>/\bflame\b/.test(f.cls)),bubbles=fx.filter(f=>/\bbubble\b/.test(f.cls));
assert.ok(flames.length>=10,`flamethrower particles recorded: ${flames.length}`);assert.ok(bubbles.length>=8,`hydro pump particles recorded: ${bubbles.length}`);
const near=(f,m)=>Math.hypot(f.left+m.arenaLeft-m.x,f.top+m.arenaTop-m.y);
const inside=(f,m,d,pad=8)=>f.left+m.arenaLeft>=d.left-pad&&f.left+m.arenaLeft<=d.right+pad&&f.top+m.arenaTop>=d.top-pad&&f.top+m.arenaTop<=d.bottom+pad;
console.log('flame spawn',flames[0],'expected mouth',{x:Math.round(pMouth.x-pMouth.arenaLeft),y:Math.round(pMouth.y-pMouth.arenaTop)},'box centre',{x:Math.round(pBox.left+pBox.width/2-pMouth.arenaLeft),y:Math.round(pBox.top+pBox.height/2-pMouth.arenaTop)});
for(const f of flames.slice(0,5))assert.ok(near(f,pMouth)<=4,`flame spawns at Charizard's mouth anchor (off by ${near(f,pMouth).toFixed(1)}px)`);
assert.ok(inside(flames[0],pMouth,pDrawn)&&flames[0].left+pMouth.arenaLeft>=(pDrawn.left+pDrawn.right)/2&&flames[0].top+pMouth.arenaTop<=(pDrawn.top+pDrawn.bottom)/2,`flame origin is in the head half of the drawn back sprite: ${JSON.stringify({flame:flames[0],pDrawn})}`);
assert.ok(Math.hypot(flames[0].left+pMouth.arenaLeft-(pBox.left+pBox.width/2),flames[0].top+pMouth.arenaTop-(pBox.top+pBox.height/2))>30,'flame origin is not the sprite box centre');
console.log('bubble spawn',bubbles[0],'expected mouth',{x:Math.round(eMouth.x-eMouth.arenaLeft),y:Math.round(eMouth.y-eMouth.arenaTop)});
// The enemy casts while its own hit-shake is still running, so its anchor follows the displaced sprite (a few px).
for(const f of bubbles.slice(0,5))assert.ok(near(f,eMouth)<=12,`hydro pump spawns at Gyarados's mouth anchor (off by ${near(f,eMouth).toFixed(1)}px)`);
assert.ok(inside(bubbles[0],eMouth,eDrawn)&&bubbles[0].left+eMouth.arenaLeft<=(eDrawn.left+eDrawn.right)/2,`hydro pump origin is on the facing (left) half of the drawn front sprite: ${JSON.stringify({bubble:bubbles[0],eDrawn})}`);
assert.ok(Math.hypot(bubbles[0].left+eMouth.arenaLeft-(eBox.left+eBox.width/2),bubbles[0].top+eMouth.arenaTop-(eBox.top+eBox.height/2))>30,'hydro pump origin is not the sprite box centre');
await shot('14-fx-origin');pass('Ranged move effects start at the attacker\'s mouth anchor (Charizard back / Gyarados front), not the box centre');
// Dragon Pulse: the beam starts at the mouth too and points at the target's body anchor.
await page.evaluate(()=>{window.__fx=[];});await page.locator('#moves button').nth(1).click();await waitIdle();await page.waitForTimeout(300);
const beams=(await page.evaluate(()=>window.__fx)).filter(f=>/fx-beam/.test(f.cls)&&/dragon/.test(f.cls));assert.ok(beams.length>=1,'dragon pulse beam recorded');
const eBody=await anchorPoint('#e-sprite',spriteMap.gyarados.frontBody);
const beamTopOffset=5;const beamStart={left:beams[0].left,top:beams[0].top+beamTopOffset};console.log('beam start',beamStart);
assert.ok(near(beamStart,pMouth)<=4,`dragon pulse beam starts at the mouth (off by ${near(beamStart,pMouth).toFixed(1)}px)`);
assert.ok(Math.hypot(eBody.x-pMouth.x,eBody.y-pMouth.y)>100,'beam has a target far from the mouth');
pass('Dragon Pulse beam is anchored at the mouth');
assert.deepEqual(errors,[]);
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:results,errors},null,2));
console.log(`Layout checks: ${results.length} passed.`);
}catch(e){console.error('FAIL',e);await shot('failure');process.exitCode=1;}
await browser.close();
