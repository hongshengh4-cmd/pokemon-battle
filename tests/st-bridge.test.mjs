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
test('Ball panel restores the v1.3.0 blue team / green 6-column storage layout', () => {
  const br = read('st-bridge/bridge.js');
  assert.ok(br.includes('#pkm-kanto-panel .party{display:grid;grid-template-columns:1fr 1fr;'));
  assert.ok(br.includes('#pkm-kanto-panel .boxgrid{flex:1;background:linear-gradient(180deg,#a9dcc4,#7fc2a6)'));
  assert.ok(br.includes('grid-template-columns:repeat(6,1fr)'));
  assert.ok(br.includes('function panelPartyMarkup(pkm)'));
  assert.ok(br.includes('function panelStorageMarkup(pkm)'));
  assert.ok(br.includes('function panelDetailMarkup(pkm)'));
  assert.ok(br.includes('没有记录时显示“当前/—”'));
  assert.ok(br.includes("data-op=\"follow\""));
  assert.ok(br.includes("data-op=\"toparty\""));
  assert.ok(br.includes("data-op=\"tobox\""));
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
test('Opening screen images exist for every mode and starter', () => {
  const src = read('st-bridge/bridge.js');
  for (const f of ['hero.webp', 'logo-pokemon.webp', 'oak-lab.webp']) assert.ok(fs.existsSync(new URL('st-bridge/img/' + f, root)), f);
  for (const m of Object.keys(K.MODE_INFO)) { const mm = src.match(new RegExp(m + ": \\{ img: '([^']+)'")); assert.ok(mm, m); assert.ok(fs.existsSync(new URL('st-bridge/img/' + mm[1], root)), mm[1]); }
  for (const n of Object.keys(K.STARTERS)) { const mm = src.match(new RegExp(n + ": \\{ img: '([^']+)'")); assert.ok(mm, n); assert.ok(fs.existsSync(new URL('st-bridge/img/starter-' + mm[1] + '.webp', root)), n); }
});

// ---------- v1.3.4 ----------
import vm from 'node:vm';
const ectx = { console, Math, JSON, Object, Array, Number, String, Boolean, Promise, Error, TypeError, Set, Map }; ectx.globalThis = ectx; vm.createContext(ectx);
for (const p of ['src/engine/typechart.js', 'src/engine/mechanics.js', 'src/engine/battle.js', 'src/engine/capture.js']) vm.runInContext(read(p), ectx);
const E = ectx.PKMBattle; E.setData(JSON.parse(read('src/data/pokedex.json')), moves);
const zhNat = Object.fromEntries(Object.entries(zh.natures).map(([id, n]) => [n, id]));
test('Bridge nature table matches the battle engine (Chinese → effect)', () => {
  for (const n of K.NATURES) assert.ok(zhNat[n], n);
  const src = read('src/engine/battle.js');
  for (const [n, [up, down]] of Object.entries(K.NATURE_EFFECT)) {
    const p = E.createPokemon('mew', 50, ['tackle'], { nature: zhNat[n], ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } });
    const q = E.createPokemon('mew', 50, ['tackle'], { nature: 'serious', ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } });
    assert.ok(p.stats[up] > q.stats[up], n + ' raises ' + up); assert.ok(p.stats[down] < q.stats[down], n + ' lowers ' + down);
  }
  assert.equal(Object.keys(K.NATURE_EFFECT).length, 20); assert.ok(src.includes('NATURES'));
});
test('Same species and level differ by IVs; stats table for the bridge matches pokedex', () => {
  const a = E.createPokemon('charmander', 5, ['scratch'], { ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } });
  const b = E.createPokemon('charmander', 5, ['scratch'], { ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } });
  assert.ok(b.stats.hp > a.stats.hp && b.stats.spe > a.stats.spe);
  const st = JSON.parse(read('st-bridge/kanto-stats.json')), dex = JSON.parse(read('src/data/pokedex.json'));
  assert.deepEqual(st.s.charmander, Object.values(dex.charmander.baseStats)); assert.equal(st.m.scratch, 35); assert.equal(st.m.ember, moves.ember.pp);
});
test('Struggle when every move is out of PP (PP now carries between battles)', () => {
  const me = E.createPokemon('pikachu', 20, ['thundershock']); me.moves[0].ppLeft = 0;
  const foe = E.createPokemon('snorlax', 20, ['tackle']);
  const bt = new E.Battle([me], [foe], { seed: 3 });
  const hp0 = me.hp, foeHp0 = foe.hp;
  bt.turn({ kind: 'move', index: 0, struggle: true });
  assert.ok(foe.hp < foeHp0, 'struggle deals damage'); assert.ok(me.hp < hp0, 'struggle recoil'); assert.equal(me.moves[0].ppLeft, 0);
  // AI with no PP also struggles instead of using a 0-PP move forever
  const f2 = E.createPokemon('rattata', 10, ['tackle']); f2.moves[0].ppLeft = 0;
  const bt2 = new E.Battle([E.createPokemon('onix', 30, ['harden'])], [f2], { seed: 1 });
  assert.equal(bt2.aiAction(1).struggle, true);
});
test('Cry table uses known species; result payload carries PP and individual values', () => {
  for (const n of Object.keys(K.CRIES)) assert.ok(zhSpecies.has(n), n);
  assert.ok(!K.CRIES['小火龙'].some(x => x.includes('小火小火')));
  const app = read('src/ui/app.js');
  assert.ok(app.includes('ppLeft: m.ppLeft') && app.includes('ppById') && app.includes('participated'));
  const br = read('st-bridge/bridge.js');
  for (const fn of ['function ensureIndividual', 'function reconcileBonds', 'function parsePatchOps', 'function playCry', 'function statBlock', 'function scheduleSync']) assert.ok(br.includes(fn), fn);
});
console.log(`ST bridge tests: ${passed}/${passed} passed.`);
