// Real UI integration test. Run the static server first, then:
// npm install --no-save playwright && npx playwright install chromium
// node tests/visual-alignment.mjs http://127.0.0.1:8007/ /path/to/screenshots
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const base=process.argv[2] || 'http://127.0.0.1:8007/';
const output=process.argv[3] || path.join(root,'.cache/visual-results');
fs.mkdirSync(output,{recursive:true});
const entries=JSON.parse(fs.readFileSync(path.join(root,'src/data/sprite-map.json'))).entries;
const points={};for(const e of Object.values(entries))for(const side of ['front','back'])points[e[side]]=e[side+'Body'];
const cases=[
 {species:'charizard',form:'charizardmegay',width:1365},
 {species:'charizard',form:'charizardmegax',width:390},
 {species:'venusaur',form:'venusaurmega',width:1365},
 {species:'blastoise',form:'blastoisemega',width:800},
 {species:'gardevoir',form:'gardevoirmega',width:1365},
 {species:'lucario',form:'lucariomega',width:390},
 {species:'gyarados',form:'gyaradosmega',width:1365},
 {species:'charizard',form:'charizardmegay',width:1365,enemy:true},
 {species:'charizard',form:'charizardmegay',width:1365,resize:true},
 {species:'venusaur',form:'venusaurgmax',width:1365,kind:'dynamax'},
 {species:'pikachu',width:390,kind:'z'},
 {species:'dragonite',width:800,kind:'tera'},
];
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];
try{
for(const c of cases){
 const page=await browser.newPage({viewport:{width:c.width,height:960}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Use exact downloaded public GIF bytes when present; fresh users simply use the CDN.
 await page.route('https://play.pokemonshowdown.com/sprites/**',async route=>{
  const url=route.request().url(),cached=path.join(root,'.cache/body-sprites',crypto.createHash('sha256').update(url).digest('hex')+path.extname(new URL(url).pathname));
  if(fs.existsSync(cached))await route.fulfill({path:cached,contentType:url.endsWith('.gif')?'image/gif':'image/png'});else await route.continue();
 });
 const kind=c.kind||'mega',side=c.enemy?'e':'p';
 const mon={name:c.species,lv:62,moves:[kind==='z'?'thunderbolt':'tackle'],mechanic:kind,megaForm:c.form,teraType:'Dragon',zType:'Electric',item:kind==='z'?'electriumz':'',dynamaxForm:kind==='dynamax'?'gmax':''};
 const dummy={name:'blissey',lv:100,moves:['splash']};
 const cfg={difficulty:'expert',p1:{entrants:[{name:'player',party:[c.enemy?dummy:mon]}]},p2:{entrants:[{name:'enemy',party:[c.enemy?mon:dummy]}]}};
 await page.goto(base+'?config='+encodeURIComponent(JSON.stringify(cfg)));
 await page.waitForFunction(()=>['p','e'].every(s=>document.querySelector(`#${s}-sprite > img`)?.naturalWidth>0));
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(1000);
 await page.locator('#command-fight').click();
 if(!c.enemy){await page.locator('#mechanics button').click();await page.waitForFunction(()=>document.querySelector('#p-sprite > img')?.naturalWidth>0);}
 // Record actual on-screen centres, independently from production helper.
 await page.evaluate(({points,side})=>{
  window.alignmentSamples=[];
  const sample=()=>{
   const box=document.querySelector(`#${side}-sprite`),img=box?.querySelector(':scope > img'),pop=box?.querySelector('.transform-icon-pop');
   if(img?.complete&&img.naturalWidth&&pop&&getComputedStyle(pop).visibility==='visible'){
    const r=img.getBoundingClientRect(),pr=pop.getBoundingClientRect(),anchor=points[img.currentSrc||img.src];
    if(anchor){const flip=parseFloat(getComputedStyle(img).getPropertyValue('--flip'))<0;const fit=Math.min(img.clientWidth/img.naturalWidth,img.clientHeight/img.naturalHeight),w=img.naturalWidth*fit,h=img.naturalHeight*fit;
     const x=r.left+((img.clientWidth-w)/2+w*(flip?1-anchor[0]:anchor[0]))*r.width/img.clientWidth;
     const y=r.top+((img.clientHeight-h)/2+h*anchor[1])*r.height/img.clientHeight;
     const inner=pop.querySelector('img').getBoundingClientRect();
     window.alignmentSamples.push({error:Math.hypot(pr.x+pr.width/2-x,pr.y+pr.height/2-y),innerError:Math.hypot(inner.x+inner.width/2-x,inner.y+inner.height/2-y),src:img.currentSrc||img.src,size:pr.width});
    }
   }
   window.alignmentFrame=requestAnimationFrame(()=>setTimeout(sample,0));
  };sample();
 },{points,side});
 await page.locator('#moves button').first().click();
 await page.waitForSelector(`#${side}-sprite .transform-icon-pop`,{state:'attached',timeout:10000});
 await page.waitForTimeout(350);
 if(c.resize){await page.setViewportSize({width:390,height:960});await page.waitForTimeout(100);}
 const name=`${c.species}-${c.kind||c.form}-${c.enemy?'enemy':'player'}-${c.width}${c.resize?'-resize':''}`;
 const session=await page.context().newCDPSession(page);
 const shot=await session.send('Page.captureScreenshot',{format:'png'});
 fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));
 await page.waitForTimeout(2400);
 const samples=await page.evaluate(()=>{cancelAnimationFrame(window.alignmentFrame);return window.alignmentSamples});
 assert.ok(samples.length>=8,`${name}: too few visible samples ${samples.length}`);
 // Sample after all tracking rAF callbacks, allowing subpixel/frame scheduling noise.
 const sorted=samples.map(s=>s.innerError).sort((a,b)=>a-b);
 const p95=sorted[Math.floor(sorted.length*.95)];
 assert.ok(p95<5,`${name}: p95 alignment error ${p95}`);
 assert.ok(samples.every(s=>s.size>=44.9),`${name}: enlarged icon minimum not applied`);
 assert.equal(errors.length,0,`${name}: ${errors.join('; ')}`);
 assert.equal(await page.locator('.transform-icon-pop').count(),0,'Icon should be cleaned up');
 const result={name,samples:samples.length,p95Error:+p95.toFixed(2),maxError:+Math.max(...samples.map(s=>s.innerError)).toFixed(2),sourceCount:new Set(samples.map(s=>s.src)).size,minIconSize:Math.min(...samples.map(s=>s.size)),consoleErrors:errors};
 results.push(result);console.log('PASS',JSON.stringify(result));
 await page.close();
}
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
console.log(`Browser visual tests: ${results.length}/${cases.length} passed.`);
}finally{await browser.close();}
