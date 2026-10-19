import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../st-bridge/bridge.js',import.meta.url),'utf8');
const ctx={K:{STAT_KEYS:[],BALL_ZH:{},DIFFICULTY_BY_TYPE:{},WEATHER:{}},playerEntries:p=>p.mons,hash:()=>1,rng:()=>()=>0.5,isObj:x=>x&&typeof x==='object',rollIvs:()=>({}),natureZh:()=>true};
vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function engineConfig('),source.indexOf('function openBattle(')),ctx);
function check(type,size,pcount,ecount,wantP,wantE){const p={player:{bag:{}},mons:Array.from({length:pcount},(_,i)=>({hostSlot:i}))};const r=ctx.engineConfig({cfg:{type,teamSize:size,team:Array.from({length:ecount},()=>({species:'皮卡丘'}))}},p,'x').engine;assert.equal(r.p1.entrants[0].party.length,wantP);assert.equal(r.p2.entrants[0].party.length,wantE);}
check('wild',undefined,6,4,6,1);check('wild',3,2,1,2,1);
check('gym',3,6,6,3,3);check('gym',6,2,4,2,4);check('gym',undefined,6,2,2,2);check('trainer',1,6,3,1,1);
const mem=new Map();Object.assign(ctx,{lsGet:(k,d=null)=>mem.get(k)??d,CRY_MODES:['auto','custom','game'],cryMode:()=>mem.get('global')??'auto'});
vm.runInContext(source.slice(source.indexOf('const monCryKey ='),source.indexOf('const cryChoices ='))+'\nglobalThis.mode=monCryMode;',ctx);
const a={uid:'a'},b={uid:'b'};assert.equal(ctx.mode(a),'auto');mem.set('global','game');assert.equal(ctx.mode(a),'game');mem.set('pkmKantoCryMon:a','auto');assert.equal(ctx.mode(a),'auto');assert.equal(ctx.mode(b),'game');mem.delete('pkmKantoCryMon:a');assert.equal(ctx.mode(a),'game');
console.log('PASS: 6 roster scenarios + global/per-individual/inherit voice preferences');
