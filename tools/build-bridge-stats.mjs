// 为酒馆桥接生成精简数据：种族值（按引擎 id）+ 招式 PP（按引擎 id）+ 身高（分米，v1.3.8 动漫配音的语音合成按体型调音高）。
// 用法：node tools/build-bridge-stats.mjs  → st-bridge/kanto-stats.json
import fs from 'node:fs';
const dex = JSON.parse(fs.readFileSync('src/data/pokedex.json', 'utf8'));
const moves = JSON.parse(fs.readFileSync('src/data/moves.json', 'utf8'));
const s = {}, m = {}, h = {};
for (const [id, d] of Object.entries(dex)) {
  const b = d.baseStats; if (b) s[id] = [b.hp, b.atk, b.def, b.spa, b.spd, b.spe];
  if (d.heightm > 0) h[id] = Math.max(1, Math.round(d.heightm * 10));
}
for (const [id, d] of Object.entries(moves)) m[id] = d.pp ?? 10;
fs.writeFileSync('st-bridge/kanto-stats.json', JSON.stringify({ v: 1, s, m, h }));
console.log('species', Object.keys(s).length, 'moves', Object.keys(m).length, 'heights', Object.keys(h).length, fs.statSync('st-bridge/kanto-stats.json').size, 'bytes');
