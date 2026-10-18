// v1.3.5：生成 src/data/move-desc-zh.json —— 招式的官方中文说明（简体），供对战界面长按 / ⓘ 查看。
// 数据来自 PokeAPI 的 CSV（move_flavor_text.csv，language_id=12 为简体中文），取最新版本组的文本；
// 新版本里“无法使用这个招式”的占位文本会被跳过，退回到更早版本的说明。
// 用法：node tools/build-move-desc.mjs [本地 CSV 目录]（默认从 GitHub 下载）
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
const dir = process.argv[2];
async function load(name) {
  if (dir && fs.existsSync(path.join(dir, name))) return fs.readFileSync(path.join(dir, name), 'utf8');
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error(name + ' HTTP ' + r.status);
  return r.text();
}
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length >= head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const moves = parseCsv(await load('moves.csv'));
const flavor = parseCsv(await load('move_flavor_text.csv'));
const showdown = JSON.parse(fs.readFileSync(new URL('../src/data/moves.json', import.meta.url)));
const FIX = { 'vice-grip': 'visegrip' };
const idOf = {};
for (const m of moves) idOf[m.id] = FIX[m.identifier] || m.identifier.replace(/[^a-z0-9]/g, '');

const best = {};
for (const f of flavor) {
  if (f.language_id !== '12') continue;
  const text = String(f.flavor_text || '').replace(/[\s\u00ad]+/g, '').trim();
  if (!text || /无法使用这个招式/.test(text)) continue;
  const id = idOf[f.move_id]; if (!id) continue;
  const vg = +f.version_group_id;
  if (!best[id] || vg > best[id].vg) best[id] = { vg, text };
}
const out = {};
// 第九世代的新招式 PokeAPI 还没有中文文本，这里手动补上（关都宝可梦升级会学到的）
const extra = JSON.parse(fs.readFileSync(new URL('./move-desc-extra.json', import.meta.url)));
for (const [id, text] of Object.entries(extra)) if (!best[id]) best[id] = { vg: 0, text };
for (const id of Object.keys(best).sort()) if (showdown[id] || id === 'hiddenpower') out[id] = best[id].text;
fs.writeFileSync(new URL('../src/data/move-desc-zh.json', import.meta.url), JSON.stringify(out));
const missing = Object.keys(showdown).filter(id => !out[id] && !/^hiddenpower./.test(id));
console.log('move-desc-zh.json:', Object.keys(out).length, 'moves; 无中文说明（将使用自动生成效果）:', missing.length);
