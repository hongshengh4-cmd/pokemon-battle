// v1.3.8：赛制（几 v 几）与配音偏好的单元测试——直接执行 st-bridge/bridge.js 里标记好的两段源码。
//   @format-begin … @format-end      ：parseFormat / tableFormat / battleFormat / pickPlayers / engineConfig
//   @voice-prefs-begin … @voice-prefs-end：全局 / 单只配音、录音缺失时的替代、语音合成台词与音高
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('st-bridge/bridge.js', root), 'utf8');
const K = await import(new URL('st-bridge/kanto-data.js', root));
const slice = (a, b) => { const i = source.indexOf(a), j = source.indexOf(b); assert.ok(i >= 0 && j > i, `markers ${a} … ${b}`); return source.slice(i, j); };
let passed = 0; const test = (name, fn) => { fn(); passed++; console.log('✓', name); };

/* ---------------- 赛制 ---------------- */
const ctx = {
  K: { STAT_KEYS: [], BALL_ZH: {}, DIFFICULTY_BY_TYPE: {}, WEATHER: {}, EVENT_FORMATS: K.EVENT_FORMATS, GYM_RULES: K.GYM_RULES },
  playerEntries: p => p.mons, hash: () => 1, rng: () => () => 0.5, isObj: x => !!x && typeof x === 'object',
  rollIvs: () => ({}), natureZh: () => true, ivOk: () => true, rollNature: () => '勤奋',
};
vm.createContext(ctx);
vm.runInContext(slice('/* @format-begin', '/* @format-end */') + '\nObject.assign(globalThis, { parseFormat, battleFormat, pickPlayers, engineConfig });', ctx);
const mons = n => ({ player: { bag: {} }, mons: Array.from({ length: n }, (_, i) => ({ hostSlot: i, species: 'mon' + i })) });
const team = n => Array.from({ length: n }, () => ({ species: '皮卡丘', level: 10 }));
const run = (cfg, own, pick) => ctx.engineConfig({ cfg, pick }, mons(own), 'tag');
const sizes = r => [r.engine.p1.entrants[0].party.length, r.engine.p2.entrants[0].party.length];

test('v1.3.7 roster scenarios still hold (wild 6v1, short party, gym 3v3/6v6, inferred, 1v1)', () => {
  const check = (type, teamSize, own, enemy, want) => assert.deepEqual(sizes(run({ type, teamSize, team: team(enemy) }, own)), want, `${type}/${teamSize}/${own},${enemy}`);
  check('wild', undefined, 6, 4, [6, 1]); check('wild', 3, 2, 1, [2, 1]);
  check('gym', 3, 6, 6, [3, 3]); check('gym', 6, 2, 4, [2, 4]); check('gym', undefined, 6, 2, [2, 2]); check('trainer', 1, 6, 3, [1, 1]);
});
test('wild / capture: one wild Pokémon vs the whole healthy party (max 6, never padded)', () => {
  for (const own of [1, 2, 4, 6]) {
    const r = run({ type: 'wild', team: team(1) }, own);
    assert.deepEqual(sizes(r), [own, 1]);
    assert.equal(r.fmt.label, `野外 · 我方${own}只 vs 野生1只`);
    assert.equal(r.engine.encounter.type, 'wild');
    assert.equal(r.engine.rules.enemyLimit, 1);
  }
  assert.deepEqual(sizes(run({ type: 'wild', teamSize: 6, team: team(3) }, 3)), [3, 1], 'wild ignores teamSize and extra enemies');
});
test('format strings: numbers, "3v3", "三对三", "各2只", asymmetric "2v1"', () => {
  const f = v => { const r = ctx.parseFormat(v); return r ? { ...r } : r; }; // 跨 vm 上下文的对象原型不同，复制一份再比
  assert.deepEqual(f(3), { p: 3, e: 3 }); assert.deepEqual(f('6'), { p: 6, e: 6 }); assert.deepEqual(f('2只'), { p: 2, e: 2 });
  assert.deepEqual(f('3v3'), { p: 3, e: 3 }); assert.deepEqual(f('3 VS 3'), { p: 3, e: 3 }); assert.deepEqual(f('三对三'), { p: 3, e: 3 });
  assert.deepEqual(f('两对两'), { p: 2, e: 2 }); assert.deepEqual(f('各2只'), { p: 2, e: 2 }); assert.deepEqual(f('2v1'), { p: 2, e: 1 });
  for (const bad of [0, 7, '0', '7v7', '', null, undefined, true, {}, 'abc']) assert.equal(f(bad), null, String(bad));
  assert.deepEqual(sizes(run({ type: 'gym', format: '3v3', team: team(6) }, 6)), [3, 3]);
  assert.deepEqual(sizes(run({ type: 'trainer', rules: { teamSize: '2' }, team: team(4) }, 5)), [2, 2]);
});
test('gym rules table fills in a missing teamSize (event first, then the leader)', () => {
  const g = (cfg, own = 6) => run({ type: 'gym', ...cfg }, own);
  let r = g({ event: 'EP026', opponent: '玉虹道馆馆主 莉佳', team: team(3) });
  assert.deepEqual(sizes(r), [3, 3]); assert.equal(r.fmt.source, 'table'); assert.match(r.fmt.rule, /莉佳/);
  assert.deepEqual(sizes(g({ event: 'EP014', opponent: '马志士', team: team(1) })), [1, 1]);
  assert.deepEqual(sizes(g({ event: 'EP005', team: team(2) })), [2, 2]);
  assert.deepEqual(sizes(g({ event: 'EP058', opponent: '夏伯', team: team(1) })), [1, 1], 'Blaine rematch is 1v1');
  assert.deepEqual(sizes(g({ event: '自由', opponent: '红莲道馆馆主 夏伯', team: team(3) })), [3, 3], 'leader name when the event is unknown');
  assert.deepEqual(sizes(g({ id: 'EP032-阿桔', team: team(3) })), [2, 2], 'event id inside cfg.id');
  assert.deepEqual(sizes(g({ event: 'EP014', teamSize: 2, team: team(2) })), [2, 2], 'explicit teamSize beats the table');
  const t = run({ type: 'trainer', event: 'EP005', team: team(3) }, 6);
  assert.deepEqual(sizes(t), [3, 3], 'gym table does not apply to other battles in the same episode');
  assert.equal(t.fmt.source, 'team');
  assert.deepEqual(sizes(run({ type: 'league', event: 'EP077', team: team(3) }, 6)), [3, 3]);
});
test('short-handed sides still battle; labels say so', () => {
  const r = run({ type: 'gym', teamSize: 3, team: team(3) }, 2);
  assert.deepEqual(sizes(r), [2, 3]);
  assert.equal(r.fmt.label, '3v3 · 我方只有2只，照常开战');
  assert.equal(r.engine.rules.playerLimit, 3); assert.equal(r.engine.rules.enemyLimit, 3); assert.equal(r.engine.rules.tag, '3v3');
  const e = run({ type: 'gym', teamSize: 6, team: team(2) }, 6);
  assert.deepEqual(sizes(e), [6, 2]); assert.match(e.fmt.label, /对方只有2只/);
  assert.equal(run({ type: 'gym', teamSize: 2, team: team(2) }, 6).fmt.label, '2v2');
});
test('participant pick: chosen order is the send-out order; bad picks fall back to lead + party order', () => {
  const r = run({ type: 'gym', teamSize: 3, team: team(3) }, 6, [4, 1, 5]);
  assert.deepEqual([...r.engine.p1.entrants[0].party].map(e => e.hostSlot), [4, 1, 5]);
  assert.deepEqual([...ctx.pickPlayers([{ hostSlot: 0 }, { hostSlot: 2 }, { hostSlot: 3 }], 2, [9, 3, 3, 0, 2])].map(e => e.hostSlot), [3, 0]);
  assert.deepEqual([...ctx.pickPlayers([{ hostSlot: 0 }, { hostSlot: 2 }], 2, [7, 8])].map(e => e.hostSlot), [0, 2]);
  assert.deepEqual([...ctx.pickPlayers([{ hostSlot: 0 }, { hostSlot: 2 }, { hostSlot: 3 }], 2, null)].map(e => e.hostSlot), [0, 2]);
});

/* ---------------- 配音偏好 ---------------- */
const mem = new Map();
const vctx = { lsGet: (k, d = null) => (mem.has(k) ? mem.get(k) : d) };
vm.createContext(vctx);
vm.runInContext(slice('/* @voice-prefs-begin', '/* @voice-prefs-end */') + '\nObject.assign(globalThis, { globalVoice, cryFallback, monVoicePref, voiceOf, ttsText, ttsTone, VOICES, FALLBACKS });', vctx);
test('global voice: anime by default; v1.3.7 values auto/custom migrate to anime', () => {
  assert.equal(vctx.globalVoice(), 'anime');
  for (const [v, want] of [['auto', 'anime'], ['custom', 'anime'], ['anime', 'anime'], ['game', 'game'], ['junk', 'anime']]) { mem.set('pkmKantoCrySrc', v); assert.equal(vctx.globalVoice(), want, v); }
  mem.delete('pkmKantoCrySrc');
});
test('per-Pokémon override (by uid) beats the global default; "默认" inherits', () => {
  const a = { uid: 'a' }, b = { uid: 'b' }, none = { species: '皮卡丘' };
  assert.equal(vctx.voiceOf(a), 'anime');
  mem.set('pkmKantoCrySrc', 'game'); assert.equal(vctx.voiceOf(a), 'game'); assert.equal(vctx.voiceOf(none), 'game');
  mem.set('pkmKantoCryMon:a', 'anime'); assert.equal(vctx.voiceOf(a), 'anime'); assert.equal(vctx.voiceOf(b), 'game');
  assert.equal(vctx.monVoicePref(a), 'anime'); assert.equal(vctx.monVoicePref(b), null);
  mem.set('pkmKantoCryMon:a', 'custom'); assert.equal(vctx.voiceOf(a), 'anime', 'legacy per-mon value');
  mem.delete('pkmKantoCryMon:a'); assert.equal(vctx.voiceOf(a), 'game');
  mem.delete('pkmKantoCrySrc');
});
test('missing anime recording: speech synthesis by default; game / mute selectable', () => {
  assert.equal(vctx.cryFallback(), 'tts');
  for (const v of ['tts', 'game', 'mute']) { mem.set('pkmKantoCryFallback', v); assert.equal(vctx.cryFallback(), v); }
  mem.set('pkmKantoCryFallback', 'loud'); assert.equal(vctx.cryFallback(), 'tts'); mem.delete('pkmKantoCryFallback');
});
test('speech text strips stage directions and turns drawn-out sounds into pauses', () => {
  const t = vctx.ttsText;
  assert.equal(t('皮卡～皮卡丘！'), '皮卡，皮卡丘！');
  assert.equal(t('（喷出一团火焰）喷火——龙！'), '喷火，龙！');
  assert.equal(t('胖～丁～胖～丁～'), '胖，丁，胖，丁');
  assert.equal(t('卡比～……'), '卡比……');
  assert.equal(t('（扑腾，扑腾）'), '', 'pure stage direction cannot be spoken');
  assert.equal(t('（震耳的咆哮）'), '');
  for (const lines of Object.values(K.CRIES)) for (const l of lines) assert.equal(typeof t(l), 'string');
});
test('speech pitch follows body size (small = high), clamped', () => {
  const p = dm => vctx.ttsTone(dm).pitch;
  assert.ok(p(4) > p(7) && p(7) > p(17) && p(17) > p(88), 'Pikachu > Bulbasaur > Charizard > Onix');
  assert.ok(Math.abs(p(7) - 1.45) < 1e-9); assert.equal(p(1000), 0.45); assert.equal(p(1), 2);
  const r = vctx.ttsTone(null); assert.ok(r.pitch > 0 && r.rate >= 0.75 && r.rate <= 1.3);
});
console.log(`Roster / voice tests: ${passed}/11 passed.`);
