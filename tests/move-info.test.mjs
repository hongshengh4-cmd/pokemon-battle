// v1.3.5：招式详细说明（PKMMoveInfo）与新补上的特殊招式效果
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const load = async p => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const moves = await load('src/data/moves.json'), desc = await load('src/data/move-desc-zh.json'), levelup = await load('src/data/levelup.json');
const ctx = { console, Math, JSON, Object, Array, Number, String, Boolean, Promise, Error, TypeError, Set, Map }; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['src/engine/typechart.js', 'src/engine/mechanics.js', 'src/engine/battle.js', 'src/ui/move-info.js']) vm.runInContext(await readFile(new URL(f, root), 'utf8'), ctx);
const E = ctx.PKMBattle, MI = ctx.PKMMoveInfo;
E.setData(await load('src/data/pokedex.json'), moves); MI.setDesc(desc);
let passed = 0; const test = (name, fn) => { fn(); passed++; console.log('✓', name); };
const mv = id => ({ id, ...moves[id], ppLeft: moves[id].pp });
const duel = (a, b, seed = 7) => new E.Battle([a], [b], { seed });

test('Every Gen 1-2 level-up move has an official Chinese description', () => {
  const used = new Set(); for (const l of Object.values(levelup)) for (const [, m] of l) used.add(m);
  const missing = [...used].filter(id => !desc[id]);
  assert.deepEqual(missing, []);
  assert.match(desc.growl, /降低对手的攻击/); assert.ok(desc.visegrip && desc.hiddenpower);
});
test('describe(): rows, official text, effects and matchup', () => {
  const me = E.createPokemon('charmander', 12, ['ember']), foe = E.createPokemon('bulbasaur', 10, ['tackle']);
  const info = MI.describe(me.moves[0], { user: me, foe, name: '火花', foeName: '妙蛙种子' });
  assert.equal(info.name, '火花'); assert.equal(info.rows[0][1], '火'); assert.match(info.desc, /灼伤/);
  assert.ok(info.effects.some(x => x.includes('10% 几率')));
  assert.equal(info.matchup.effClass, 'super'); assert.match(info.matchup.damageText, /点/);
  const h = MI.html(info); assert.ok(h.includes('对 妙蛙种子') && h.includes('预计伤害'));
  assert.ok(!MI.html({ ...info, desc: '<img onerror=x>' }).includes('<img'), 'html is escaped');
});
test('Status / unimplemented moves are explained clearly', () => {
  const growl = MI.describe(mv('growl'), {}); assert.ok(growl.effects[0].includes('对手的攻击降低'));
  const sd = MI.describe(mv('swordsdance'), {}); assert.ok(sd.effects[0].includes('自己的攻击大幅提高'));
  assert.ok(MI.describe(mv('leechseed'), {}).warns.some(w => w.includes('寄生种子')));
  assert.equal(MI.describe(mv('mist'), {}).warns.length, 1);
  assert.ok(MI.describe(mv('hyperbeam'), {}).notes.length === 1);
  assert.ok(MI.describe(mv('solarbeam'), {}).notes[0].includes('蓄力'));
  for (const id of ['rest', 'haze', 'focusenergy', 'splash', 'seismictoss', 'nightshade', 'sonicboom', 'dragonrage', 'superfang', 'fissure', 'lowkick', 'explosion'])
    assert.equal(MI.describe(mv(id), {}).warns.length, 0, id + ' should be implemented');
  const tw = MI.describe(mv('thunderwave'), { user: E.createPokemon('pikachu', 10, ['thunderwave']), foe: E.createPokemon('geodude', 10, ['tackle']) });
  assert.ok(tw.matchup.warns.length === 1);
});
test('Fixed-damage moves now deal damage to the foe (not to the user)', () => {
  const me = E.createPokemon('mankey', 17, ['seismictoss']), foe = E.createPokemon('snorlax', 30, ['splash']);
  const bt = duel(me, foe); const hp0 = foe.hp, my0 = me.hp; bt.turn({ kind: 'move', index: 0 });
  assert.equal(hp0 - foe.hp, 17); assert.equal(me.hp, my0);
  const g = E.createPokemon('gastly', 20, ['nightshade']), n = E.createPokemon('rattata', 20, ['splash']);
  const bt2 = duel(g, n); const h2 = n.hp; bt2.turn({ kind: 'move', index: 0 });
  assert.equal(h2, n.hp, 'normal type is immune to night shade');
  const r = E.createPokemon('raticate', 30, ['superfang']), s = E.createPokemon('snorlax', 30, ['splash']);
  const bt3 = duel(r, s); const h3 = s.hp; bt3.turn({ kind: 'move', index: 0 });
  assert.equal(s.hp, h3 - Math.floor(h3 / 2));
});
test('Explosion makes the user faint; OHKO fails against higher level', () => {
  const me = E.createPokemon('geodude', 20, ['explosion']), foe = E.createPokemon('rattata', 10, ['splash']);
  const bt = duel(me, foe); bt.turn({ kind: 'move', index: 0 });
  assert.ok(me.hp === 0 && me.fainted);
  const d = E.createPokemon('diglett', 10, ['fissure']), big = E.createPokemon('snorlax', 40, ['splash']);
  const bt2 = duel(d, big); bt2.turn({ kind: 'move', index: 0 });
  assert.equal(big.hp, big.maxHp); assert.ok(bt2.log.some(l => l.includes('等级比对手低')));
});
test('Rest, Haze, Focus Energy and Splash work', () => {
  const me = E.createPokemon('snorlax', 30, ['rest', 'haze', 'focusenergy', 'splash']), foe = E.createPokemon('rattata', 5, ['growl']);
  const bt = duel(me, foe);
  me.hp = 10; me.status = 'psn'; bt.turn({ kind: 'move', index: 0 });
  assert.equal(me.status, 'slp'); assert.ok(me.hp > 10);
  me.status = null; me.stages.atk = -3; foe.stages.spe = 2; bt.turn({ kind: 'move', index: 1 });
  assert.equal(me.stages.atk, 0); assert.equal(foe.stages.spe, 0);
  bt.turn({ kind: 'move', index: 2 }); assert.equal(me.volatile.critBoost, 2);
  bt.turn({ kind: 'move', index: 3 }); assert.ok(bt.log.some(l => l.includes('什么也没有发生')));
});
const html = await readFile(new URL('index.html', root), 'utf8'), app = await readFile(new URL('src/ui/app.js', root), 'utf8');
test('The battle page loads the description data and the info UI', () => {
  assert.ok(html.includes('src/ui/move-info.js'));
  assert.ok(app.includes('move-desc-zh.json') && app.includes('openMoveInfo') && app.includes('move-info-btn'));
});
console.log(`move-info tests: ${passed} passed`);
