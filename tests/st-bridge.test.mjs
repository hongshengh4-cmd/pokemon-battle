// v1.3.2：角色卡外置桥接（st-bridge/）的静态校验——版本号一致、数据里的中文名都能在对战网页里找到、升级招式表合理。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url), read = p => fs.readFileSync(new URL(p, root), 'utf8');
const K = await import(new URL('st-bridge/kanto-data.js', root));
const zh = JSON.parse(read('src/data/zh-names.json'));
const moves = JSON.parse(read('src/data/moves.json'));
const levelup = JSON.parse(read('src/data/levelup.json'));
const zhSpecies = new Set(Object.values(zh.species)), zhMoves = new Set(Object.values(zh.moves)), zhAbil = new Set(Object.values(zh.abilities));
let passed = 0; const test = (name, fn) => { fn(); passed++; console.log('✓', name); };

test('Version is the same in package.json, index.html footer and the bridge', () => {
  const v = JSON.parse(read('package.json')).version;
  assert.equal(K.VERSION, v);
  assert.ok(read('index.html').includes('v' + v), 'index.html footer should show v' + v);
});
test('bridge.js parses as an ES module', () => {
  execFileSync(process.execPath, ['--check', new URL('st-bridge/bridge.js', root).pathname.replace(/\.js$/, '.js')], { stdio: 'pipe' });
  assert.ok(read('st-bridge/bridge.js').includes("import * as K from './kanto-data.js"));
});
test('Every encounter species has a Chinese name known to the battle site', () => {
  const all = [...Object.values(K.ENCOUNTERS).flat(), ...K.WATER_ENCOUNTERS];
  for (const [name, lo, hi] of all) { assert.ok(zhSpecies.has(name), name); assert.ok(lo >= 1 && hi >= lo && hi <= 100, name); }
});
test('Starters use known species, moves and abilities', () => {
  for (const [name, s] of Object.entries(K.STARTERS)) {
    assert.ok(zhSpecies.has(name), name); assert.ok(zhAbil.has(s.ability), s.ability);
    for (const m of s.moves.filter(Boolean)) assert.ok(zhMoves.has(m), m);
  }
  for (const list of Object.values(K.MODE_STARTERS)) for (const n of list) assert.ok(K.STARTERS[n], n);
});
test('Ball names map both ways', () => {
  for (const [id, name] of Object.entries(K.BALL_ZH)) assert.equal(K.ZH_BALL[name], id);
});
test('Map edges reference existing nodes', () => {
  const ids = new Set(K.MAP_NODES.map(n => n.id));
  for (const [a, b] of K.MAP_EDGES) { assert.ok(ids.has(a), a); assert.ok(ids.has(b), b); }
});
test('Level-up table gives early Kanto Pokemon low-level moves (no Explosion at Lv3)', () => {
  for (const sp of ['pidgey', 'rattata', 'spearow', 'caterpie', 'weedle', 'geodude', 'magikarp']) {
    const early = levelup[sp].filter(([l]) => l <= 5).map(([, id]) => id);
    assert.ok(early.length, sp);
    for (const id of early) { assert.ok(moves[id], id); assert.ok((moves[id].basePower || 0) <= 60, sp + ':' + id); }
  }
});
console.log(`ST bridge tests: ${passed}/${passed} passed.`);
