// 为酒馆桥接生成精简数据：种族值（按引擎 id）+ 招式 PP（按引擎 id）。
// 用法：node tools/build-bridge-stats.mjs  → st-bridge/kanto-stats.json
import fs from 'node:fs';
const dex = JSON.parse(fs.readFileSync('src/data/pokedex.json', 'utf8'));
const moves = JSON.parse(fs.readFileSync('src/data/moves.json', 'utf8'));
const s = {}, m = {};
for (const [id, d] of Object.entries(dex)) { const b = d.baseStats; if (b) s[id] = [b.hp, b.atk, b.def, b.spa, b.spd, b.spe]; }
for (const [id, d] of Object.entries(moves)) m[id] = d.pp ?? 10;
fs.writeFileSync('st-bridge/kanto-stats.json', JSON.stringify({ v: 1, s, m }));
console.log('species', Object.keys(s).length, 'moves', Object.keys(m).length, fs.statSync('st-bridge/kanto-stats.json').size, 'bytes');
