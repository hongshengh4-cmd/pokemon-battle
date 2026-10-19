// v1.3.9：同行伙伴阵容兜底的单元测试——直接执行 st-bridge/bridge.js 里 @roster-begin … @roster-end 这一段。
//   和小智 / 小霞 / 小刚对战时，对战块里漏写的成员按原作进度（kanto-data.js 的 NPC_ROSTERS）补上。
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('st-bridge/bridge.js', root), 'utf8');
const K = await import(new URL('st-bridge/kanto-data.js', root));
const slice = (a, b) => { const i = source.indexOf(a), j = source.indexOf(b); assert.ok(i >= 0 && j > i, `markers ${a} … ${b}`); return source.slice(i, j); };
let passed = 0; const test = (name, fn) => { fn(); passed++; console.log('✓', name); };

const ctx = {
  K: { STAT_KEYS: [], BALL_ZH: {}, DIFFICULTY_BY_TYPE: {}, WEATHER: {}, EVENT_FORMATS: K.EVENT_FORMATS, GYM_RULES: K.GYM_RULES, BATTLE_LABEL: K.BATTLE_LABEL },
  playerEntries: p => p.mons, hash: () => 1, rng: () => () => 0.5, isObj: x => !!x && typeof x === 'object',
  rollIvs: () => ({}), natureZh: () => true, ivOk: () => true, rollNature: () => '勤奋',
};
vm.createContext(ctx);
vm.runInContext(slice('/* @format-begin', '/* @format-end */') + slice('/* @roster-begin', '/* @roster-end */')
  + '\nObject.assign(globalThis, { battleFormat, engineConfig, pointPassed, joiningNow, rosterNow, companionOf, completeTeam });', ctx);

// 事件顺序：EP001…EP082（测试用；实际顺序来自卡内《事件详情》）
const IDS = Array.from({ length: 82 }, (_, i) => 'EP' + String(i + 1).padStart(3, '0'));
const at = (ev, node = 1, { total = 5, skipped = [], mode = '同行模式' } = {}) =>
  ({ index: id => IDS.indexOf(id), cur: IDS.indexOf(ev), node, total, finished: false, skipped: new Set(skipped), mode });
const done = (opts = {}) => ({ index: id => IDS.indexOf(id), cur: IDS.length, node: 1, total: 1, finished: true, skipped: new Set(opts.skipped || []), mode: opts.mode || '同行模式' });
const R = K.NPC_ROSTERS;
const now = (key, pos) => [...ctx.rosterNow(R[key], pos)].map(m => m.species);
const env = (pos, extra = {}) => ({ rosters: R, pos, mode: pos?.mode, zh: n => ({ Pikachu: '皮卡丘', pikachu: '皮卡丘', Staryu: '海星星' }[n] || n), ...extra });
const complete = (cfg, pos, extra) => { const r = ctx.completeTeam(cfg, env(pos, extra)); return { team: [...r.team].map(t => (typeof t === 'string' ? t : { ...t })), added: [...r.added], who: r.who }; };
const names = team => team.map(t => (typeof t === 'string' ? t : t.species));

test('Ash\'s roster follows the anime: Pikachu → + Caterpie after EP003 node 1 → evolutions, joins and departures', () => {
  assert.deepEqual(now('ash', at('EP001')), ['皮卡丘']);
  assert.deepEqual(now('ash', at('EP003', 1)), ['皮卡丘'], 'Caterpie is caught during node 1');
  assert.deepEqual(now('ash', at('EP003', 2)), ['皮卡丘', '绿毛虫']);
  assert.deepEqual(now('ash', at('EP003', 4)), ['皮卡丘', '绿毛虫', '比比鸟']);
  assert.deepEqual(now('ash', at('EP004', 1)), ['皮卡丘', '铁甲蛹', '比比鸟'], 'Metapod after EP003');
  assert.deepEqual(now('ash', at('EP005', 1)), ['皮卡丘', '巴大蝶', '比比鸟'], 'Butterfree after EP004');
  assert.deepEqual(now('ash', at('EP013')), ['皮卡丘', '巴大蝶', '比比鸟', '妙蛙种子', '小火龙', '杰尼龟']);
  assert.deepEqual(now('ash', at('EP022')), ['皮卡丘', '比比鸟', '妙蛙种子', '小火龙', '杰尼龟'], 'Butterfree left in EP021');
  assert.deepEqual(now('ash', at('EP024')), ['皮卡丘', '比比鸟', '妙蛙种子', '小火龙', '杰尼龟', '鬼斯通']);
  assert.deepEqual(now('ash', at('EP046')), ['皮卡丘', '比比鸟', '妙蛙种子', '喷火龙', '杰尼龟']);
  assert.deepEqual(now('ash', done()), ['皮卡丘', '比比鸟', '妙蛙种子', '喷火龙', '杰尼龟']);
  assert.deepEqual(now('ash', at('EP013', 1, { skipped: ['EP010'] })), ['皮卡丘', '巴大蝶', '比比鸟', '小火龙', '杰尼龟'], 'skipped events do not apply');
});
test('Misty starts with three (Staryu, Starmie, Goldeen); Brock with Geodude and Onix', () => {
  assert.deepEqual(now('misty', at('EP002')), ['海星星', '宝石海星', '角金鱼']);
  assert.deepEqual(now('misty', at('EP030')), ['海星星', '宝石海星', '角金鱼', '墨海马', '可达鸭']);
  assert.deepEqual(now('misty', done()), ['海星星', '角金鱼', '可达鸭']);
  assert.deepEqual(now('brock', at('EP006', 1)), ['小拳石', '大岩蛇']);
  assert.deepEqual(now('brock', at('EP006', 2)), ['小拳石', '大岩蛇', '超音蝠']);
});
test('who is the opponent: one companion only, names inside titles, not in 小智模式', () => {
  const who = (opponent, type = 'trainer', mode = '同行模式') => ctx.companionOf({ type, opponent }, R, mode);
  assert.equal(who('小智'), 'ash'); assert.equal(who('阿智'), 'ash'); assert.equal(who('华蓝道馆馆主 小霞', 'gym'), 'misty');
  assert.equal(who('小霞（华蓝道馆）'), 'misty'); assert.equal(who('深灰道馆·小刚', 'gym'), 'brock');
  assert.equal(who('小霞和小刚'), null, 'two companions → unclear whose team');
  assert.equal(who('小智的妈妈'), null); assert.equal(who('火箭队 武藏'), null); assert.equal(who(''), null);
  assert.equal(who('小智', 'wild'), null);
  assert.equal(who('小智', 'trainer', '小智模式'), null, 'in 小智模式 {{user}} is Ash');
  assert.equal(who('小霞', 'trainer', '小智模式'), 'misty');
});
test('the reported bug: Ash after catching Caterpie fields both; Misty fields all three', () => {
  let r = complete({ type: 'trainer', opponent: '小智', team: [{ species: '绿毛虫', level: 3 }] }, at('EP003', 1));
  assert.deepEqual(names(r.team), ['绿毛虫', '皮卡丘'], 'AI wrote only Caterpie → Pikachu added, Caterpie stays the lead');
  assert.deepEqual(r.added, ['皮卡丘']); assert.equal(r.who, '小智'); assert.equal(r.team[1].level, 5, 'ace = highest listed level + 2');
  r = complete({ type: 'trainer', opponent: '小智', team: [{ species: '皮卡丘', level: 8 }] }, at('EP003', 2));
  assert.deepEqual(names(r.team), ['皮卡丘', '绿毛虫']); assert.equal(r.team[1].level, 8);
  r = complete({ type: 'trainer', opponent: '小智', team: [{ species: '皮卡丘', level: 6 }] }, at('EP002', 1));
  assert.deepEqual(r.added, [], 'before Caterpie: Pikachu only');
  r = complete({ type: 'trainer', opponent: '小霞', team: [{ species: '海星星', level: 8 }] }, at('EP003', 2));
  assert.deepEqual(names(r.team), ['海星星', '宝石海星', '角金鱼']); assert.deepEqual(r.team.map(t => t.level), [8, 10, 8]);
  r = complete({ type: 'gym', opponent: '华蓝道馆馆主 小霞', team: [{ species: '海星星', level: 12 }, { species: '宝石海星', level: 14 }] }, at('EP007', 3));
  assert.deepEqual(r.added, ['角金鱼']); assert.equal(r.team[2].level, 14);
  const fmt = ctx.battleFormat({ type: 'gym', event: 'EP007', opponent: '小霞', team: r.team }, 6);
  assert.equal(fmt.name, '3v3'); assert.equal(fmt.enemy, 3);
});
test('evolved or outdated forms count as the same member; no duplicates; English names map', () => {
  let r = complete({ type: 'trainer', opponent: '小智', team: [{ species: '巴大蝶', level: 15 }, { species: '皮卡丘', level: 16 }, { species: '比比鸟', level: 12 }] }, at('EP005'));
  assert.deepEqual(r.added, []);
  r = complete({ type: 'trainer', opponent: '小智', team: [{ species: '绿毛虫', level: 7 }] }, at('EP005'));
  assert.deepEqual(r.added, ['皮卡丘', '比比鸟'], 'outdated Caterpie is still Ash\'s bug Pokémon');
  r = complete({ type: 'trainer', opponent: '小霞', team: [{ species: '海星星' }, { species: '海星星' }] }, at('EP003', 2));
  assert.deepEqual(r.added, ['宝石海星', '角金鱼'], 'Misty\'s Staryu and Starmie are two different members (matched by each member\'s own forms, not by family)');
  r = complete({ type: 'trainer', opponent: '小智', team: ['Pikachu'] }, at('EP003', 2));
  assert.deepEqual(names(r.team), ['Pikachu', '绿毛虫'], 'string entries + English names');
  assert.equal(r.team[1].level, 5, 'no listed level → Lv5 reference');
});
test('exact flag, unknown NPCs, wild battles and the 6 cap leave the team alone', () => {
  const base = { type: 'trainer', opponent: '小智', team: [{ species: '皮卡丘', level: 8 }] };
  assert.deepEqual(complete({ ...base, exact: true }, at('EP013')).added, []);
  assert.deepEqual(complete({ ...base, roster: 'exact' }, at('EP013')).added, []);
  assert.deepEqual(complete({ ...base, opponent: '捕虫少年' }, at('EP013')).added, []);
  assert.deepEqual(complete({ ...base, type: 'wild' }, at('EP013')).added, []);
  assert.deepEqual(complete(base, null).added, [], 'no story position → nothing to go on');
  assert.deepEqual(complete({ ...base, team: [] }, at('EP013')).added, []);
  const five = ['皮卡丘', '小拉达', '波波', '阿柏蛇', '穿山鼠'].map(s => ({ species: s, level: 10 }));
  const r = complete({ ...base, team: five }, at('EP013'));
  assert.equal(r.team.length, 6); assert.deepEqual(r.added, ['巴大蝶']);
  assert.deepEqual(complete(base, at('EP013', 1, { mode: '小智模式' })).added, [], '小智模式');
});
test('joining during the current node is flagged for the prompt, future catches are not leaked', () => {
  const cat = R.ash.members[1], bird = R.ash.members[2], bulba = R.ash.members[3];
  assert.equal(ctx.joiningNow(cat.join, at('EP003', 1)), true);
  assert.equal(ctx.joiningNow(cat.join, at('EP003', 2)), false, 'already joined');
  assert.equal(ctx.joiningNow(bird.join, at('EP003', 1)), false, 'node 3 is still ahead');
  assert.equal(ctx.joiningNow(bulba.join, at('EP010', 2, { total: 4 })), false);
  assert.equal(ctx.joiningNow(bulba.join, at('EP010', 4, { total: 4 })), true, 'whole-event joins show on the last node');
  assert.equal(ctx.joiningNow(cat.join, at('EP003', 1, { skipped: ['EP003'] })), false);
  assert.equal(ctx.pointPassed('EP003#1', at('EP003', 1)), false); assert.equal(ctx.pointPassed('EP003#1', at('EP003', 2)), true);
  assert.equal(ctx.pointPassed('EP010', at('EP010', 4, { total: 4 })), false); assert.equal(ctx.pointPassed('EP010', at('EP011')), true);
  assert.equal(ctx.pointPassed('SP999', at('EP011')), false, 'unknown event never passes');
});
console.log(`NPC roster tests: ${passed}/7 passed.`);
