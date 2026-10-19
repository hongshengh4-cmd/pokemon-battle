// v1.3.8：引擎层的即时判负——只把参赛名单交给引擎，参赛的全部倒下就判负（不足额也一样），野外 N 只 vs 1 只。
// v1.3.9：和 NPC 两边全队、只数不一样（例：我方 4 只 vs 小智 2 只）。
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const load = async p => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const ctx = { console, Math, JSON, Object, Array, Number, String, Boolean, Promise, Error, TypeError, Set, Map };
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['src/engine/typechart.js', 'src/engine/mechanics.js', 'src/engine/battle.js']) vm.runInContext(await readFile(new URL(f, root), 'utf8'), ctx);
const E = ctx.PKMBattle; E.setData(await load('src/data/pokedex.json'), await load('src/data/moves.json'));
let passed = 0; const test = (name, fn) => { fn(); passed++; console.log('✓', name); };
const mk = (ids, lv = 20) => ids.map(id => E.createPokemon(id, lv, ['tackle']));
const faint = p => { p.hp = 0; p.fainted = true; };

test('3v3: all three participants down → defeat (the rest of the party never entered the engine)', () => {
  const b = new E.Battle(mk(['pikachu', 'bulbasaur', 'pidgeotto']), mk(['staryu', 'starmie', 'goldeen']), { difficulty: 'normal' });
  faint(b.teams[0][0]); faint(b.teams[0][1]); b.updateWinner(); assert.equal(b.winner, null, 'still one left');
  faint(b.teams[0][2]); b.updateWinner();
  assert.equal(b.result().outcome, 'defeat'); assert.equal(b.result().playerTeam.length, 3);
});
test('short-handed 3v3 (only 2 healthy): both down → immediate defeat, no waiting for a third', () => {
  const b = new E.Battle(mk(['pikachu', 'charmander']), mk(['onix', 'geodude', 'graveler']), { difficulty: 'normal' });
  faint(b.teams[0][0]); faint(b.teams[0][1]); b.updateWinner();
  assert.equal(b.result().outcome, 'defeat');
});
test('opponent short-handed: their only Pokémon down → victory', () => {
  const b = new E.Battle(mk(['pikachu', 'charmander', 'squirtle']), mk(['onix']), { difficulty: 'normal' });
  faint(b.teams[1][0]); b.updateWinner();
  assert.equal(b.result().outcome, 'victory');
});
test('wild: whole party (here 4) vs one wild Pokémon', () => {
  const b = new E.Battle(mk(['pikachu', 'charmander', 'squirtle', 'bulbasaur']), mk(['rattata'], 4), { difficulty: 'normal', encounterType: 'wild' });
  assert.equal(b.teams[0].length, 4); assert.equal(b.teams[1].length, 1);
  for (const p of b.teams[0]) faint(p); b.updateWinner();
  assert.equal(b.result().outcome, 'defeat', 'all four fainted → defeat');
});
test('NPC full teams with uneven counts: my 4 vs Ash\'s 2 — whichever side runs out first loses', () => {
  const b = new E.Battle(mk(['bulbasaur', 'charmander', 'squirtle', 'pidgeotto']), mk(['pikachu', 'caterpie']), { difficulty: 'normal', encounterType: 'trainer' });
  assert.equal(b.teams[0].length, 4); assert.equal(b.teams[1].length, 2);
  faint(b.teams[1][0]); b.updateWinner(); assert.equal(b.winner, null, 'Caterpie is still standing');
  faint(b.teams[1][1]); b.updateWinner(); assert.equal(b.result().outcome, 'victory');
  const c = new E.Battle(mk(['pikachu']), mk(['staryu', 'starmie', 'goldeen']), { difficulty: 'normal', encounterType: 'trainer' });
  faint(c.teams[0][0]); c.updateWinner(); assert.equal(c.result().outcome, 'defeat', 'my only one down vs Misty\'s three → defeat');
});
console.log(`Format / engine tests: ${passed}/5 passed.`);
