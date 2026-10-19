// 自定义叫声 / 精灵球拖拽的静态校验：命名规则、对照表、文件名解析、bridge.js 里的关键函数
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url), read = p => fs.readFileSync(new URL(p, root), 'utf8');
const T = await import(new URL('tools/cries-check.mjs', root));
const zh = JSON.parse(read('src/data/zh-names.json'));
let passed = 0; const test = (name, fn) => { fn(); passed++; console.log('✓', name); };

test('Kanto checklist: 151 unique, known species with valid cry file names', () => {
  assert.equal(T.KANTO.length, 151);
  const seen = new Set();
  for (const k of T.KANTO) {
    assert.ok(zh.species[k.id], 'known species #' + k.n);
    assert.match(k.file, /^[a-z0-9]+\.mp3$/, k.file);
    assert.ok(!seen.has(k.file), 'duplicate ' + k.file); seen.add(k.file);
  }
  assert.ok(T.FREQUENT.size > 30 && [...T.FREQUENT].every(id => zh.species[id]));
});
test('Dex numbers map to the base species (spot checks)', () => {
  const want = { 1: 'bulbasaur', 25: 'pikachu', 29: 'nidoranf', 32: 'nidoranm', 83: 'farfetchd', 122: 'mrmime', 150: 'mewtwo', 151: 'mew' };
  for (const [n, id] of Object.entries(want)) assert.equal(T.idByNum[n], id, 'dex ' + n);
});
test('File-name parser understands dex numbers, Chinese / English names and take suffixes', () => {
  const ok = (stem, id, take = 1) => { const r = T.parseStem(stem); assert.ok(r, stem); assert.equal(r.id, id, stem); assert.equal(r.take, take, stem); assert.ok(!r.conflict, stem); };
  for (const s of ['25', '025', '#025', 'No.025', '025-皮卡丘', '025_Pikachu', '025皮卡丘', '皮卡丘', 'Pikachu', 'pikachu']) ok(s, 'pikachu');
  ok('pikachu_2', 'pikachu', 2); ok('皮卡丘 2', 'pikachu', 2); ok('皮卡丘(3)', 'pikachu', 3); ok('025-皮卡丘_2', 'pikachu', 2); ok('25_2', 'pikachu', 2);
  ok('Mr. Mime', 'mrmime'); ok("Farfetch'd", 'farfetchd'); ok('Nidoran♀', 'nidoranf'); ok('Nidoran♂', 'nidoranm'); ok('尼多兰', 'nidoranf');
  ok('Porygon2', 'porygon2'); ok('多边兽2型', 'porygon2'); ok('Ho-Oh', 'hooh');
  assert.ok(T.parseStem('025-妙蛙种子').conflict, 'dex number and name disagree');
  assert.equal(T.parseStem('not-a-pokemon'), null);
});
test('classify(): standard / rename / convert / unknown', () => {
  assert.equal(T.classify('pikachu.mp3').kind, 'ok');
  assert.equal(T.classify('pikachu_2.mp3').kind, 'ok');
  for (const n of ['Pikachu.mp3', 'pikachu.MP3', '025.mp3', '皮卡丘.mp3']) { const c = T.classify(n); assert.equal(c.kind, 'rename', n); assert.equal(c.target, 'pikachu.mp3', n); }
  assert.deepEqual([T.classify('pikachu.wav').kind, T.classify('皮卡丘.m4a').target], ['convert', 'pikachu.mp3']);
  assert.equal(T.classify('pikachuu.mp3').kind, 'unknown');
  assert.equal(T.classify('025.mp3').kind, 'rename', 'a bare dex number is not a species id');
});
test('bridge.js has the free-drag ball and the custom-cry player', () => {
  const br = read('st-bridge/bridge.js');
  for (const s of ['function installBallDrag', 'function placeBall', 'function placePanel', 'function playCustomCry', 'function playGameCry', 'pkmKantoBallPos', 'pkmKantoCrySrc', 'pkmKantoCryVol', 'audio/cries/', 'pointerdown', 'setPointerCapture']) assert.ok(br.includes(s), s);
  assert.ok(br.includes('https://play.pokemonshowdown.com/audio/cries/'), 'the original cries stay as the fallback');
});
test('Cry folder ships README, checklist (in sync with the data) and an empty manifest', () => {
  for (const f of ['README.md', 'CHECKLIST.md', 'cries-checklist.csv', 'manifest.json']) assert.ok(fs.existsSync(new URL('st-bridge/audio/cries/' + f, root)), f);
  assert.ok(read('st-bridge/audio/cries/CHECKLIST.md').includes(T.listTable('md')), 'CHECKLIST.md is out of date: run node tools/cries-check.mjs --list md');
  assert.equal(read('st-bridge/audio/cries/cries-checklist.csv'), T.listTable('csv'));
  const m = JSON.parse(read('st-bridge/audio/cries/manifest.json')); assert.equal(m.version, 1); assert.equal(typeof m.takes, 'object');
});
console.log(`Cry / ball tests: ${passed}/6 passed.`);
