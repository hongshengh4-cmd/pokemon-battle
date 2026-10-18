// v1.3.2：生成 src/data/levelup.json —— 第1~2世代宝可梦的“升级招式表”（取该物种最新有升级记录的世代）。
// 用途：角色卡外置桥接的野生 / 对手宝可梦没写招式时，按等级给出符合原作节奏的招式（避免低等级野生宝可梦用出大爆炸）。
// 用法：node tools/build-levelup.mjs [learnsets.js 本地路径]（默认从 Pokémon Showdown 下载）
import fs from 'node:fs';
import vm from 'node:vm';
const src = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : await (await fetch('https://play.pokemonshowdown.com/data/learnsets.js')).text();
const box = { exports: {} }; vm.runInNewContext(src, box);
const L = box.exports.BattleLearnsets;
const dex = JSON.parse(fs.readFileSync(new URL('../src/data/pokedex.json', import.meta.url)));
const moves = JSON.parse(fs.readFileSync(new URL('../src/data/moves.json', import.meta.url)));
const out = {};
for (const [id, sp] of Object.entries(dex)) {
  if (!(sp.num >= 1 && sp.num <= 251) || (sp.baseSpecies && sp.baseSpecies.toLowerCase().replace(/[^a-z0-9]/g, '') !== id)) continue;
  const ls = L[id]?.learnset; if (!ls) continue;
  const byGen = {};
  for (const [mv, codes] of Object.entries(ls)) {
    if (!moves[mv]) continue;
    for (const c of codes) { const m = c.match(/^(\d)L(\d+)$/); if (m) (byGen[m[1]] = byGen[m[1]] || []).push([+m[2], mv]); }
  }
  const gens = Object.keys(byGen).map(Number).sort((a, b) => b - a);
  if (!gens.length) continue;
  const list = byGen[gens[0]].sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  out[id] = list;
}
fs.writeFileSync(new URL('../src/data/levelup.json', import.meta.url), JSON.stringify(out));
console.log('levelup.json:', Object.keys(out).length, 'species');
