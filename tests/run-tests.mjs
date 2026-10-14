// Headless engine tests: node tests/run-tests.mjs
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const load = async p => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const dex = await load('src/data/pokedex.json');
const moves = await load('src/data/moves.json');
const learnsets = await load('src/data/learnsets.json');

const ctx = { console, Math, JSON, Object, Array, Number, String, Boolean, Promise, Error, TypeError, Set, Map };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(await readFile(new URL('src/engine/typechart.js', root), 'utf8'), ctx);
vm.runInContext(await readFile(new URL('src/engine/mechanics.js', root), 'utf8'), ctx);
vm.runInContext(await readFile(new URL('src/engine/battle.js', root), 'utf8'), ctx);
vm.runInContext(await readFile(new URL('src/engine/team.js', root), 'utf8'), ctx);
vm.runInContext(await readFile(new URL('src/data/presets.js', root), 'utf8'), ctx);
const E = ctx.PKMBattle, T = ctx.PKMTypeChart, TEAM = ctx.PKMTeam, PRESETS = ctx.PKMPresets, MECH = ctx.PKMMechanics;
E.setData(dex, moves);
TEAM.setData(dex, moves, learnsets);

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => { if (cond) { pass++; console.log('✓', label, extra); } else { fail++; console.log('✗ FAIL', label, extra); } };

// Type chart
check('电->水 x2', T.effectiveness('Electric', ['Water']) === 2);
check('电->地面 x0', T.effectiveness('Electric', ['Ground']) === 0);
check('格斗->幽灵 x0', T.effectiveness('Fighting', ['Ghost']) === 0);
check('火->草钢 x4', T.effectiveness('Fire', ['Grass', 'Steel']) === 4);
check('妖精->龙 x2', T.effectiveness('Fairy', ['Dragon']) === 2);

// Stat calc (Pikachu Lv50, 31IV, neutral): HP=floor((70+31)*.5)+60=110, Atk=floor((110+31)*.5)+5=75
const pika = E.createPokemon('pikachu', 50, ['thunderbolt', 'quickattack', 'irontail', 'surf']);
check('皮卡丘 Lv50 HP=110', pika.maxHp === 110, 'got ' + pika.maxHp);
check('皮卡丘 Lv50 攻击=75', pika.stats.atk === 75, 'got ' + pika.stats.atk);
const modest = E.calcStats(dex['pikachu'], 50, { nature: 'modest' });
check('内敛性格特攻+10%物攻-10%', modest.spa === 77 && modest.atk === 67, JSON.stringify(modest));

// Damage sanity: Thunderbolt vs squirtle in range
const squirtle = E.createPokemon('squirtle', 50, ['watergun', 'tackle']);
let min = 1e9, max = 0;
for (let i = 0; i < 200; i++) {
  const est = E.estimateDamage(pika, squirtle, pika.moves[0], 0.85 + (i % 16) / 100);
  min = Math.min(min, est.damage); max = Math.max(max, est.damage);
}
check('十万伏特伤害为正且有随机浮动', min > 10 && max > min, `range ${min}-${max}`);

// Status move applies + boosts
const machampTeam = [E.createPokemon('machamp', 50, ['swordsdance', 'closecombat'])];
const foeTeam = [E.createPokemon('rattata', 50, ['tackle'])];
const b1 = new E.Battle(machampTeam, foeTeam, { seed: 42, difficulty: 'easy' });
b1.turn({ kind: 'move', index: 0 });
check('剑舞后攻击等级+2', machampTeam[0].stages.atk === 2, 'got ' + machampTeam[0].stages.atk);

// Full AI-vs-AI battle terminates with a winner
function sim(seed) {
  const mk = ids => ids.map(([s, lv, mv]) => E.createPokemon(s, lv, mv));
  const A = mk([['venusaur', 60, ['seedbomb', 'sludgebomb', 'earthpower', 'sleeppowder']], ['charizard', 60, ['flamethrower', 'airslash', 'dragonpulse', 'roost']], ['blastoise', 60, ['hydropump', 'icebeam', 'aurasphere', 'rapidspin']]]);
  const B = mk([['garchomp', 60, ['earthquake', 'dragonclaw', 'stoneedge', 'swordsdance']], ['lucario', 60, ['closecombat', 'bulletpunch', 'extremespeed', 'swordsdance']], ['milotic', 60, ['scald', 'icebeam', 'dragonpulse', 'recover']]]);
  const b = new E.Battle(A, B, { seed, difficulty: 'expert' });
  let guard = 0;
  while (b.winner === null && guard++ < 300) {
    if (b.pendingSwitch !== null) { b.forceSwitch(b.bestSwitch(0)); continue; }
    b.turn(b.aiAction(0));
  }
  return b;
}
for (const seed of [1, 7, 99]) {
  const b = sim(seed);
  check(`AI自对战 seed=${seed} 正常结束`, b.winner !== null && b.turnCount > 0, `winner=${b.winner} turns=${b.turnCount}`);
  const r = b.result();
  check(`结果结构 seed=${seed}`, (r.winner === 'player' || r.winner === 'enemy') && r.log.length > 5 && r.turns === b.turnCount);
}

// Determinism with same seed
check('同种子结果可复现', sim(7).result().winner === sim(7).result().winner && sim(7).turnCount === sim(7).turnCount);

// Unknown ids throw clearly
let threw = false;
try { E.createPokemon('definitelynotapokemon', 5, ['tackle']); } catch (e) { threw = /Unknown species/.test(e.message); }
check('未知物种报错', threw);
threw = false;
try { E.createPokemon('pikachu', 5, ['notarealmove']); } catch (e) { threw = /Unknown move/.test(e.message); }
check('未知招式报错', threw);


// Phase 2: learnset legality + preset validation
check('第九代学习面覆盖超过1000物种', Object.keys(learnsets).length > 1000, 'got ' + Object.keys(learnsets).length);
check('皮卡丘十万伏特合法', TEAM.isLegalMove('pikachu', 'thunderbolt', 50) === true);
check('皮卡丘飞叶风暴非法', TEAM.isLegalMove('pikachu', 'leafstorm', 100) === false);
check('皮卡丘低等级未学升级招式非法', TEAM.isLegalMove('pikachu', 'discharge', 20) === false);
const autoPika = TEAM.chooseAutoMoves('pikachu', 50);
check('自动配招均合法', autoPika.length === 4 && autoPika.every(m => TEAM.isLegalMove('pikachu', m, 50)), autoPika.join(','));
const presetIssues = [];
for (const [key, trainer] of Object.entries(PRESETS.TRAINERS)) {
  const v = TEAM.validateTeam(trainer.party);
  if (!v.ok) presetIssues.push(key + ': ' + v.errors.join('；'));
}
check('全部预设队伍招式合法（无学习面物种仅警示）', presetIssues.length === 0, presetIssues.join(' | '));
const badTeam = TEAM.validateTeam([{ species: 'pikachu', level: 50, moves: ['leafstorm'] }]);
check('非法招式整队校验报错', badTeam.ok === false && badTeam.errors.length > 0, badTeam.errors.join('；'));


// Phase 3: abilities, items, weather/terrain/screens/hazards
check('机制目录包含特性与道具', Object.keys(MECH.ABILITIES).length >= 80 && MECH.isSupportedItem('leftovers'));
{
  const gyara = [E.createPokemon('gyarados', 50, ['waterfall'], { ability: 'Intimidate' })];
  const mach = [E.createPokemon('machamp', 50, ['tackle'], { ability: 'Guts' })];
  new E.Battle(gyara, mach, { seed: 3 });
  check('威吓入场降低对手攻击', mach[0].stages.atk === -1, 'got ' + mach[0].stages.atk);
}
{
  const torkoal = [E.createPokemon('torkoal', 50, ['tackle'], { ability: 'Drought' })];
  const foe = [E.createPokemon('rattata', 50, ['tackle'])];
  const b = new E.Battle(torkoal, foe, { seed: 3 });
  check('日照入场开启晴天', b.weather === 'sun', 'got ' + b.weather);
}
{
  const pikaAtk = [E.createPokemon('pikachu', 50, ['thunderbolt'], { ability: 'Lightning Rod' })];
  const pikaUser = [E.createPokemon('pikachu', 50, ['thunderbolt'], { ability: 'Static' })];
  const b = new E.Battle(pikaUser, pikaAtk, { seed: 3 });
  const before = pikaAtk[0].hp;
  b.useMove(0, pikaUser[0], pikaAtk[0], pikaUser[0].moves[0]);
  check('避雷针免疫电招并提升特攻', pikaAtk[0].hp === before && pikaAtk[0].stages.spa === 1);
}
{
  const bronzong = [E.createPokemon('bronzong', 50, ['tackle'], { ability: 'Levitate' })];
  const rat = [E.createPokemon('rattata', 50, ['earthquake'])];
  const b = new E.Battle(rat, bronzong, { seed: 3 });
  b.useMove(0, rat[0], bronzong[0], rat[0].moves[0]);
  check('漂浮免疫地震', bronzong[0].hp === bronzong[0].maxHp);
}
{
  const aggron = [E.createPokemon('aggron', 50, ['tackle'], { ability: 'Sturdy' })];
  const mach = [E.createPokemon('machamp', 100, ['closecombat'])];
  const b = new E.Battle(mach, aggron, { seed: 3 });
  b.useMove(0, mach[0], aggron[0], mach[0].moves[0]);
  check('结实满HP致命攻击留1HP', aggron[0].hp === 1, 'got ' + aggron[0].hp);
}
{
  const pika = [E.createPokemon('pikachu', 50, ['tackle'], { item: 'Focus Sash' })];
  const mach = [E.createPokemon('machamp', 100, ['closecombat'])];
  const b = new E.Battle(mach, pika, { seed: 3 });
  b.useMove(0, mach[0], pika[0], mach[0].moves[0]);
  check('气势披带满HP留1HP并消耗', pika[0].hp === 1 && !pika[0].item);
}
{
  const pika = E.createPokemon('pikachu', 50, ['irontail']);
  const pikaBand = E.createPokemon('pikachu', 50, ['irontail'], { item: 'Choice Band' });
  const target = E.createPokemon('squirtle', 50, ['tackle']);
  check('讲究头巾提高物理伤害', E.estimateDamage(pikaBand, target, pikaBand.moves[0], 1).damage > E.estimateDamage(pika, target, pika.moves[0], 1).damage);
}
{
  const pika = [E.createPokemon('pikachu', 50, ['tackle'], { item: 'Leftovers' })];
  const foe = [E.createPokemon('rattata', 50, ['tackle'])];
  const b = new E.Battle(pika, foe, { seed: 3 });
  pika[0].hp = Math.floor(pika[0].maxHp / 2);
  b.endOfTurn();
  check('剩饭回合末回复1/16', pika[0].hp === Math.floor(pika[0].maxHp / 2) + Math.floor(pika[0].maxHp / 16), 'got ' + pika[0].hp);
}
{
  const user = [E.createPokemon('tapukoko', 50, ['thunderbolt'], { ability: 'Electric Surge' })];
  const foe = [E.createPokemon('rattata', 50, ['tackle'])];
  const b = new E.Battle(user, foe, { seed: 3 });
  check('电气制造者开启电气场地', b.field.terrain === 'electric', 'got ' + b.field.terrain);
}
{
  const user = [E.createPokemon('venusaur', 50, ['spikes'])];
  const foe = [E.createPokemon('rattata', 50, ['tackle']), E.createPokemon('diglett', 50, ['tackle'])];
  const b = new E.Battle(user, foe, { seed: 3 });
  b.useMove(0, user[0], foe[0], user[0].moves[0]);
  const before = foe[1].hp;
  b.doSwitch(1, 1);
  check('撒菱入场伤害1/8', b.field.sides[1].spikes === 1 && foe[1].hp === before - Math.floor(foe[1].maxHp / 8), `hp ${before}->${foe[1].hp}`);
}
{
  const user = [E.createPokemon('blastoise', 50, ['reflect'])];
  const foe = [E.createPokemon('machamp', 50, ['tackle'])];
  const b = new E.Battle(user, foe, { seed: 3 });
  const beforeDmg = E.estimateDamage(foe[0], user[0], foe[0].moves[0], 1).damage;
  b.useMove(0, user[0], foe[0], user[0].moves[0]);
  const afterDmg = E.estimateDamage(foe[0], user[0], foe[0].moves[0], 1).damage;
  check('反射壁降低物理伤害', b.field.sides[0].reflect > 0 && afterDmg < beforeDmg, `${beforeDmg}->${afterDmg}`);
}
{
  const user = [E.createPokemon('alakazam', 50, ['trickroom'])];
  const foe = [E.createPokemon('rattata', 50, ['tackle'])];
  const b = new E.Battle(foe, user, { seed: 3 });
  b.useMove(1, user[0], foe[0], user[0].moves[0]);
  check('戏法空间开启', b.field.trickRoom === 5, 'got ' + b.field.trickRoom);
}
{
  const pika = [E.createPokemon('pikachu', 50, ['thunderbolt'], { item: 'Choice Band' })];
  const foe = [E.createPokemon('rattata', 50, ['tackle'])];
  const b = new E.Battle(pika, foe, { seed: 3 });
  b.useMove(0, pika[0], foe[0], pika[0].moves[0]);
  check('讲究道具锁定招式', pika[0].choiceLockedMove === 'thunderbolt', 'got ' + pika[0].choiceLockedMove);
}
{
  const char = [E.createPokemon('charizard', 50, ['willowisp'], { item: 'Weakness Policy', ability: 'Blaze' })];
  const turtle = [E.createPokemon('squirtle', 50, ['watergun'])];
  const b = new E.Battle(turtle, char, { seed: 3 });
  b.useMove(0, turtle[0], char[0], turtle[0].moves[0]);
  check('弱点保险受克制攻击后双攻+2', char[0].stages.atk === 2 && char[0].stages.spa === 2 && !char[0].item);
}

console.log(`\nTOTAL pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
