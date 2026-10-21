import assert from 'node:assert/strict';
import '../src/ui/field-fx.js';
const {normalize,environment}=globalThis.PKMFieldFX;
for (const [a,b] of Object.entries({sunnyday:'sun',raindance:'rain',sandstorm:'sand',hail:'snow',大晴天:'sun',下雨:'rain'})) assert.equal(normalize('weather',a),b);
for (const a of ['electric','grassy','misty','psychic']) assert.equal(normalize('terrain',a+'terrain'),a);
assert.deepEqual(environment({weather:'raindance',terrain:'青草场地',weatherTurns:-1,terrainTurns:5}),{weather:'rain',terrain:'grassy',weatherTurns:0,terrainTurns:5});
assert.equal(environment('下雨').weather,'rain');
assert.equal(environment(null).weather,'');
assert.equal(normalize('weather','<script>'),'');
console.log('Field FX normalization tests passed.');
// Terrain duration zero mirrors persistent configured weather; timed moves still expire.
await import('../src/engine/typechart.js');
await import('../src/engine/mechanics.js');
await import('../src/engine/battle.js');
const fs = await import('node:fs');
const E=globalThis.PKMBattle;
E.setData(JSON.parse(fs.readFileSync(new URL('../src/data/pokedex.json',import.meta.url))),JSON.parse(fs.readFileSync(new URL('../src/data/moves.json',import.meta.url))));
for(const turns of [0,1,5]){
 const b=new E.Battle([E.createPokemon('blissey',100,['splash'])],[E.createPokemon('blissey',100,['splash'])],{seed:7});
 b.setTerrain('misty',turns);
 b.turn({kind:'move',index:0});
 assert.equal(b.field.terrain,turns===1?null:'misty');
 assert.equal(b.field.terrainTurns,turns>0?turns-1:0);
}
console.log('Terrain duration 0 / 1 / 5 regression passed.');
