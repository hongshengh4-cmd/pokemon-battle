// Regression tests for battle mechanics audited in v1.3.20.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const loadText = path => readFile(new URL(path, root), 'utf8');
const [dexText, movesText, typeChartText, mechanicsText, battleText] = await Promise.all([
  loadText('src/data/pokedex.json'), loadText('src/data/moves.json'),
  loadText('src/engine/typechart.js'), loadText('src/engine/mechanics.js'), loadText('src/engine/battle.js'),
]);
const ctx = { console, Math, JSON, Object, Array, Number, String, Boolean, Promise, Error, TypeError, Set, Map };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(typeChartText, ctx);
vm.runInContext(mechanicsText, ctx);
vm.runInContext(battleText, ctx);
const E = ctx.PKMBattle;
E.setData(JSON.parse(dexText), JSON.parse(movesText));

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}\n  ${error.stack || error}`); process.exitCode = 1; }
}
const mon = (species, moves = ['tackle'], opts = {}) => E.createPokemon(species, 50, moves, opts);

// Protect's first use is guaranteed; a consecutive successful use is 1/3,
// then 1/9. A failed attempt breaks the chain.
test('连续守住成功率按 1、1/3、1/9 递减', () => {
  const user = mon('snorlax', ['protect', 'tackle']);
  const foe = mon('rattata');
  const battle = new E.Battle([user], [foe], { seed: 1 });
  const protect = user.moves[0];

  battle.rng = () => 0.99;
  battle.useMove(0, user, foe, protect);
  assert.equal(user._protectStreak, 1);
  assert.equal(user.volatile.protect, true);

  delete user.volatile.protect; // next turn
  battle.rng = () => 0.2;
  battle.useMove(0, user, foe, protect);
  assert.equal(user._protectStreak, 2);
  assert.equal(user.volatile.protect, true);

  delete user.volatile.protect; // next turn
  battle.rng = () => 0.2; // 0.2 > 1/9
  battle.useMove(0, user, foe, protect);
  assert.equal(user._protectStreak, 0);
  assert.equal(user.volatile.protect, undefined);
  assert.ok(battle.log.includes('但是失败了！'));
});

test('非守住招式和换下场都会重置守住连用计数', () => {
  const user = mon('snorlax', ['protect', 'tackle']);
  const reserve = mon('rattata');
  const foe = mon('pidgey');
  const battle = new E.Battle([user, reserve], [foe], { seed: 2 });
  user._protectStreak = 2;
  battle.rng = () => 0.99;
  battle.useMove(0, user, foe, user.moves[1]);
  assert.equal(user._protectStreak, 0);

  user._protectStreak = 2;
  assert.equal(battle.doSwitch(0, 1), true);
  assert.equal(user._protectStreak, 0);
});

test('火系不能被灼伤，冰系不能被冻结', () => {
  const fire = mon('charizard');
  const ice = mon('articuno');
  const foe = mon('rattata');
  const battle = new E.Battle([fire, ice], [foe], { seed: 3 });
  assert.equal(battle.tryStatus(fire, 'brn'), false);
  assert.equal(battle.tryStatus(ice, 'frz'), false);
  assert.equal(fire.status, null);
  assert.equal(ice.status, null);
});

test('睡眠免疫特性也会阻止 Rest 绕过状态判定', () => {
  const user = mon('snorlax', ['rest'], { ability: 'Comatose' });
  const foe = mon('rattata');
  const battle = new E.Battle([user], [foe], { seed: 4 });
  assert.equal(battle.tryStatus(user, 'brn'), false);
  user.hp -= 20;
  const hp = user.hp;
  battle.useMove(0, user, foe, user.moves[0]);
  assert.equal(user.status, null);
  assert.equal(user.hp, hp);
  assert.ok(battle.log.some(line => line.includes('无法入睡')));
});

test('战斗初始化会校验外部直接写入的异常状态', () => {
  const fire = mon('charizard'); fire.status = 'brn';
  const ice = mon('articuno'); ice.status = 'frz';
  const foe = mon('rattata');
  const battle = new E.Battle([fire, ice], [foe], { seed: 4 });
  assert.equal(fire.status, null);
  assert.equal(ice.status, null);
  assert.ok(battle.log.some(line => line.includes('灼伤') && line.includes('已忽略')));
  assert.ok(battle.log.some(line => line.includes('冰冻') && line.includes('已忽略')));
});

test('绝对零度不能一击必杀冰系目标，但仍能命中非冰系目标', () => {
  const user = mon('lapras', ['sheercold']);
  const ice = mon('articuno');
  const battle = new E.Battle([user], [ice], { seed: 5 });
  const hp = ice.hp;
  battle.rng = () => 0;
  battle.useMove(0, user, ice, user.moves[0]);
  assert.equal(ice.hp, hp);
  assert.ok(battle.log.some(line => line.includes('对') && line.includes('没有效果')));

  const user2 = E.createPokemon('lapras', 100, ['sheercold']);
  const normal = mon('rattata');
  const battle2 = new E.Battle([user2], [normal], { seed: 6 });
  battle2.rng = () => 0;
  battle2.useMove(0, user2, normal, user2.moves[0]);
  assert.equal(normal.hp, 0);
});

function hazardBattle(reserve, hazards = {}) {
  const user = mon('pikachu');
  const active = mon('rattata');
  const battle = new E.Battle([user], [active, reserve], { seed: 7 });
  Object.assign(battle.field.sides[1], hazards);
  return { battle, reserve };
}

test('接地毒系入场吸收并清除毒菱', () => {
  const poison = mon('arbok');
  const { battle } = hazardBattle(poison, { toxicspikes: 2 });
  assert.equal(battle.doSwitch(1, 1), true);
  assert.equal(battle.field.sides[1].toxicspikes, 0);
  assert.equal(poison.status, null);
  assert.ok(battle.log.some(line => line.includes('吸收了毒菱')));
});

test('飞行毒系和漂浮毒系不吸收毒菱，但也不会中毒', () => {
  for (const poison of [mon('crobat'), mon('weezing', ['tackle'], { ability: 'Levitate' })]) {
    const { battle } = hazardBattle(poison, { toxicspikes: 2 });
    assert.equal(battle.doSwitch(1, 1), true);
    assert.equal(battle.field.sides[1].toxicspikes, 2);
    assert.equal(poison.status, null);
  }
});

test('重力使飞行毒系接地后可以吸收毒菱', () => {
  const poison = mon('crobat');
  const { battle } = hazardBattle(poison, { toxicspikes: 1 });
  battle.field.gravity = 5;
  assert.equal(E.isGrounded(poison), true);
  assert.equal(battle.doSwitch(1, 1), true);
  assert.equal(battle.field.sides[1].toxicspikes, 0);
});

test('飞行系免疫撒菱和黏黏网，但仍受到隐形岩伤害', () => {
  const flyer = mon('charizard');
  const { battle } = hazardBattle(flyer, { spikes: 2, stickyweb: true, stealthrock: true });
  const hp = flyer.hp;
  assert.equal(battle.doSwitch(1, 1), true);
  assert.equal(flyer.hp, hp - Math.floor(flyer.maxHp * 4 / 8));
  assert.equal(flyer.stages.spe, 0);
  assert.equal(battle.field.sides[1].spikes, 2);
  assert.equal(battle.field.sides[1].stickyweb, true);
});

test('非接地宝可梦不受青草场地回复，接地宝可梦正常回复', () => {
  const flyer = mon('charizard');
  const flyerBattle = new E.Battle([flyer], [mon('pikachu')], { seed: 8 });
  flyerBattle.field.terrain = 'grassy'; flyer.hp -= 20;
  const flyerHp = flyer.hp;
  flyerBattle.endOfTurn();
  assert.equal(flyer.hp, flyerHp);

  const grounded = mon('rattata');
  const groundedBattle = new E.Battle([grounded], [mon('pikachu')], { seed: 9 });
  groundedBattle.field.terrain = 'grassy'; grounded.hp -= 20;
  const groundedHp = grounded.hp;
  groundedBattle.endOfTurn();
  assert.ok(grounded.hp > groundedHp);
});

if (!process.exitCode) console.log(`\n${passed} battle regression tests passed.`);
