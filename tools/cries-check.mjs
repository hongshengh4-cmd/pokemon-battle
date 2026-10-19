#!/usr/bin/env node
/* 叫声文件工具（零依赖；只有 --pack 需要电脑里装了 ffmpeg）
 *
 *   node tools/cries-check.mjs                    检查 st-bridge/audio/cries/ 里的文件名，统计关都 151 只录了多少
 *   node tools/cries-check.mjs --fix              把认得出来的文件改成标准名（025.mp3 / 025-皮卡丘.mp3 / 皮卡丘.mp3 → pikachu.mp3），并更新 manifest.json
 *   node tools/cries-check.mjs --manifest         只重新生成 manifest.json（备选版本 _2、_3 要靠它才会被随机播放）
 *   node tools/cries-check.mjs --pack <原始录音目录>   把原始录音（wav/m4a/ogg/flac/mp4…）转成标准 mp3 放进 cries 目录：
 *                                                 自动认名、去首尾静音、统一响度、单声道、96kbps。可加 --max 6（最长秒数）、--overwrite
 *   node tools/cries-check.mjs --list md|csv      打印命名对照表（关都 151 只）
 *   --dir <目录>                                  指定 cries 目录（默认 st-bridge/audio/cries）
 *
 * 命名规则只有一条：<英文名小写，只留字母数字>.mp3，例如 pikachu.mp3、mrmime.mp3、nidoranf.mp3。
 * 同一只的备选版本：pikachu_2.mp3、pikachu_3.mp3（最多到 _9，编号要连续）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const zh = readJson('src/data/zh-names.json');
const dex = readJson('src/data/pokedex.json');
const K = await import(new URL('../st-bridge/kanto-data.js', import.meta.url));

/* ---------- 名字 ↔ id ---------- */
const nfkc = s => String(s ?? '').normalize('NFKC');
// 比较用的“键”：全角转半角、♀♂ 转 f/m、去掉重音、只留字母数字（中文名里的标点、空格也一并去掉）
export const key = s => nfkc(s).replace(/♀/g, 'f').replace(/♂/g, 'm').normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
export const idByKey = new Map();
const addKey = (k, id) => { if (k && !idByKey.has(k)) idByKey.set(k, id); };
for (const [id, name] of Object.entries(zh.species)) { addKey(key(name), id); addKey(id, id); addKey(key(dex[id]?.name), id); }
const idByZh = new Map();
for (const [id, name] of Object.entries(zh.species)) if (!idByZh.has(name)) idByZh.set(name, id);
export const idByNum = {};
for (const [n, name] of Object.entries(zh.speciesByNum)) idByNum[Number(n)] = idByZh.get(name);

export const KANTO = Array.from({ length: 151 }, (_, i) => { const id = idByNum[i + 1]; return { n: i + 1, id, zh: zh.species[id], en: dex[id]?.name || id, file: id + '.mp3' }; });
// 卡里自带的遭遇表 / 初始伙伴会出现的物种（优先录这些）
export const FREQUENT = new Set([...Object.values(K.ENCOUNTERS).flat(), ...K.WATER_ENCOUNTERS].map(e => idByZh.get(e[0])).concat(Object.keys(K.STARTERS).map(n => idByZh.get(n))).filter(Boolean));

/* ---------- 文件名解析 ---------- */
// 返回 { id, take, via, conflict? } 或 null。认得：图鉴号（25 / 025 / #025 / No.025）、025-皮卡丘、中文名、英文名，末尾的 _2 / -2 / (2) / 空格2 = 第几个版本
export function parseStem(stem) {
  const s = nfkc(stem).trim();
  const byName = t => {
    let id = idByKey.get(key(t)); if (id) return { id, take: 1 };
    const m = t.match(/^(.*?\S)[\s_\-–—]*[(（]?([2-9])[)）]?$/);
    if (m && (id = idByKey.get(key(m[1])))) return { id, take: Number(m[2]) };
    return null;
  };
  let m = s.match(/^(?:no\.?|#)?\s*(\d{1,4})$/i);
  if (m) { const id = idByNum[Number(m[1])]; return id ? { id, take: 1, via: '图鉴号' } : null; }
  m = s.match(/^(?:no\.?|#)?\s*(\d{1,4})[\s_\-–—.]*(.+)$/i);
  if (m && idByNum[Number(m[1])]) {
    const numId = idByNum[Number(m[1])], rest = m[2].trim();
    if (/^[2-9]$/.test(rest)) return { id: numId, take: Number(rest), via: '图鉴号' };
    const r = byName(rest);
    if (r && r.id !== numId) return { id: numId, take: r.take, via: '图鉴号', conflict: `${m[1]} 号是「${zh.species[numId]}」，文件名里的名字却是「${zh.species[r.id]}」` };
    return { id: numId, take: r ? r.take : 1, via: '图鉴号+名字' };
  }
  const r = byName(s);
  return r ? { ...r, via: '名字' } : null;
}
const STD = /^([a-z0-9]+)(?:_([2-9]))?$/;
export const fileFor = (id, take = 1) => `${id}${take > 1 ? '_' + take : ''}.mp3`;
// kind: ok 标准名 / rename 是 mp3 但名字不标准 / convert 不是 mp3 / unknown 认不出来
export function classify(name) {
  const ext = path.extname(name), stem = path.basename(name, ext);
  const std = STD.exec(stem);
  if (ext === '.mp3' && std && zh.species[std[1]]) return { kind: 'ok', id: std[1], take: Number(std[2] || 1) };
  const r = parseStem(stem);
  if (!r) return { kind: 'unknown' };
  return { kind: ext.toLowerCase() === '.mp3' ? 'rename' : 'convert', ...r, target: fileFor(r.id, r.take) };
}

/* ---------- 目录扫描 / manifest ---------- */
const IGNORE = new Set(['README.md', 'CHECKLIST.md', 'cries-checklist.csv', 'manifest.json', '.gitkeep', '.DS_Store', 'Thumbs.db']);
const scan = dir => fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && !IGNORE.has(e.name) && !e.name.startsWith('.')).map(e => ({ name: e.name, ...classify(e.name) }));
export function buildManifest(dir) {
  const files = new Set(fs.readdirSync(dir)), ids = new Set(), warns = [], takes = {};
  for (const f of files) { const m = /^([a-z0-9]+)(?:_([2-9]))?\.mp3$/.exec(f); if (m && zh.species[m[1]]) ids.add(m[1]); }
  for (const id of [...ids].sort()) {
    let n = 1; while (n < 9 && files.has(fileFor(id, n + 1))) n++;
    if (n > 1) takes[id] = n;
    for (let k = n + 2; k <= 9; k++) if (files.has(fileFor(id, k))) warns.push(`${fileFor(id, k)}：编号不连续（缺 ${fileFor(id, n + 1)}），这个版本不会被播放`);
    if (!files.has(fileFor(id, 1))) warns.push(`${fileFor(id, 1)} 不存在：只有备选版本时，游戏会当作没有这只的叫声`);
  }
  return { manifest: { version: 1, count: ids.size, takes }, warns };
}
function writeManifest(dir) {
  const { manifest, warns } = buildManifest(dir), p = path.join(dir, 'manifest.json'), text = JSON.stringify(manifest, null, 2) + '\n';
  const old = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (old !== text) { fs.writeFileSync(p, text); console.log(`✓ 已更新 manifest.json（${manifest.count} 只有叫声，${Object.keys(manifest.takes).length} 只有备选版本）`); }
  else console.log(`manifest.json 已是最新（${manifest.count} 只有叫声，${Object.keys(manifest.takes).length} 只有备选版本）`);
  for (const w of warns) console.log('  ⚠ ' + w);
}

/* ---------- 对照表 ---------- */
export function listTable(fmt) {
  const rows = KANTO.map(k => [String(k.n).padStart(3, '0'), k.zh, k.en, k.file, FREQUENT.has(k.id) ? '★' : '']);
  if (fmt === 'csv') return '\ufeff编号,中文名,英文名,文件名,常出现,已录（自己填）\n' + rows.map(r => r.join(',') + ',').join('\n') + '\n';
  return '| 编号 | 中文名 | 英文名 | 文件名 | 常出现 |\n| --- | --- | --- | --- | --- |\n' + rows.map(r => `| ${r.join(' | ')} |`).join('\n') + '\n';
}

/* ---------- 报告 ---------- */
function report(dir) {
  const items = scan(dir), ok = items.filter(i => i.kind === 'ok'), todo = items.filter(i => i.kind !== 'ok');
  const have = new Set(ok.map(i => i.id));
  console.log(`\n目录：${path.relative(process.cwd(), dir) || dir}\n标准命名的叫声文件：${ok.length} 个（${have.size} 只）`);
  for (const i of todo) {
    if (i.kind === 'rename') console.log(`  ✎ ${i.name}  →  ${i.target}${i.conflict ? '   ⚠ ' + i.conflict : ''}`);
    else if (i.kind === 'convert') console.log(`  ♪ ${i.name}  不是 mp3（认出是 ${zh.species[i.id]}），请转成 ${i.target}（--pack 可以批量转，或让助手来转）`);
    else console.log(`  ✗ ${i.name}  认不出是哪只宝可梦：请改成「英文名小写.mp3」，对照表见 CHECKLIST.md`);
  }
  const kantoHave = KANTO.filter(k => have.has(k.id)), kantoMissing = KANTO.filter(k => !have.has(k.id));
  const freqMissing = kantoMissing.filter(k => FREQUENT.has(k.id));
  console.log(`\n关都 151 只：已有 ${kantoHave.length} 只，还差 ${kantoMissing.length} 只`);
  if (freqMissing.length) console.log(`其中卡里遭遇表 / 初始伙伴会出现、建议优先补的（★）还差 ${freqMissing.length} 只：\n  ` + freqMissing.slice(0, 24).map(k => `${String(k.n).padStart(3, '0')}${k.zh}`).join('、') + (freqMissing.length > 24 ? `……（其余见 CHECKLIST.md 里带 ★ 的行）` : ''));
  else if (kantoMissing.length) console.log('★ 常出现的都已经有了。');
  const extra = [...have].filter(id => !KANTO.some(k => k.id === id));
  if (extra.length) console.log(`关都以外还有 ${extra.length} 只：${extra.map(id => nfkc(zh.species[id])).join('、')}`);
  if (todo.length) console.log(`\n有 ${todo.length} 个文件需要处理${todo.some(i => i.kind === 'rename') ? '（带 ✎ 的可以用 --fix 自动改名）' : ''}。`);
  return todo.length;
}

/* ---------- --fix：改成标准名 ---------- */
function fix(dir) {
  const items = scan(dir), taken = new Set(fs.readdirSync(dir));
  let n = 0;
  for (const i of items.filter(x => x.kind === 'rename')) {
    if (i.conflict) { console.log(`  ⚠ 跳过 ${i.name}：${i.conflict}`); continue; }
    let take = i.take, target = fileFor(i.id, take);
    while (taken.has(target) && take < 9) { take++; target = fileFor(i.id, take); }
    if (taken.has(target)) { console.log(`  ⚠ 跳过 ${i.name}：${zh.species[i.id]} 的 9 个版本位置都被占了`); continue; }
    fs.renameSync(path.join(dir, i.name), path.join(dir, target)); taken.delete(i.name); taken.add(target); n++;
    console.log(`  ✓ ${i.name}  →  ${target}${take !== i.take ? '（原位置已有文件，顺延为备选版本）' : ''}`);
  }
  console.log(n ? `已改名 ${n} 个文件。` : '没有需要改名的文件。');
}

/* ---------- --pack：原始录音 → 标准 mp3（需要 ffmpeg） ---------- */
const AUDIO_EXT = new Set(['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.webm', '.mp4', '.mov', '.mkv', '.wma', '.aiff', '.aif']);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
function findFfmpeg() {
  for (const c of [process.env.FFMPEG, 'ffmpeg'].filter(Boolean)) { const r = spawnSync(c, ['-version'], { encoding: 'utf8' }); if (!r.error && r.status === 0) return c; }
  return null;
}
// 去掉开头静音 → 截到最长 max 秒 → 去掉结尾静音 → 结尾淡出 40ms、开头淡入 4ms（用倒放技巧，不需要知道时长）
const trimChain = (max, modern = true) => {
  const sr = (extra) => `silenceremove=start_periods=1:start_threshold=-48dB${modern ? ':detection=peak:start_silence=' + extra : ''}`;
  return [sr(0.015), `atrim=end=${max}`, 'asetpts=PTS-STARTPTS', 'areverse', sr(0.04), 'afade=t=in:d=0.04', 'areverse', 'afade=t=in:d=0.004'].join(',');
};
function ff(bin, args) { const r = spawnSync(bin, ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 }); return { ok: !r.error && r.status === 0, err: r.stderr || String(r.error || '') }; }
function packOne(bin, src, dest, max) {
  // 先量整段的最大音量，把峰值拉到 -3 dB 再去静音：这样录得很小声的文件不会被误当成静音，去静音的阈值也与录音音量无关
  const p0 = ff(bin, ['-i', src, '-vn', '-t', '600', '-af', 'volumedetect', '-f', 'null', '-']);
  const pk = p0.err.match(/max_volume:\s*(-?[\d.]+|-inf)/);
  if (!p0.ok) return { error: 'ffmpeg 读不了这个文件（是否损坏、或不是音频？）' };
  if (!pk || pk[1] === '-inf' || Number(pk[1]) < -65) return { error: '里面几乎是静音' };
  const pre = Math.min(50, -3 - Number(pk[1]));
  for (const modern of [true, false]) {
    const chain = `volume=${pre.toFixed(2)}dB,` + trimChain(max, modern);
    const a = ff(bin, ['-i', src, '-vn', '-af', chain + ',volumedetect', '-f', 'null', '-']);
    if (!a.ok) continue;
    const mean = a.err.match(/mean_volume:\s*(-?[\d.]+|-inf)/), peak = a.err.match(/max_volume:\s*(-?[\d.]+|-inf)/);
    if (!mean || mean[1] === '-inf' || !peak) return { error: '去掉静音后什么都没剩下' };
    // 目标：平均响度约 -20 dB，峰值不超过 -1.5 dB（短音效用平均响度比 LUFS 更稳）
    const gain = Math.max(-20, Math.min(30, Math.min(-20 - Number(mean[1]), -1.5 - Number(peak[1]))));
    const e = ff(bin, ['-y', '-loglevel', 'error', '-i', src, '-vn', '-af', `${chain},volume=${gain.toFixed(2)}dB`, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1', dest]);
    if (!e.ok) continue;
    const d = ff(bin, ['-i', dest]).err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    return { gain, mean: Number(mean[1]), sec: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null };
  }
  return { error: 'ffmpeg 处理失败（文件是否损坏？）' };
}
function pack(srcDir, dir, { max = 6, overwrite = false } = {}) {
  const bin = findFfmpeg();
  if (!bin) { console.error('没找到 ffmpeg。装好后重试（https://ffmpeg.org/download.html；Windows 可用 winget install ffmpeg，macOS 用 brew install ffmpeg），\n或者直接把原始录音发给助手，由助手来转。'); process.exit(2); }
  const groups = new Map(), skipped = [], conflicts = [];
  for (const f of walk(srcDir).sort()) {
    const ext = path.extname(f).toLowerCase(); if (!AUDIO_EXT.has(ext)) continue;
    const stem = path.basename(f, path.extname(f)), sub = path.resolve(path.dirname(f)) !== path.resolve(srcDir);
    const folderR = sub ? parseStem(path.basename(path.dirname(f))) : null, stemR = parseStem(stem);
    // 放在“皮卡丘/”这样的文件夹里时，文件夹名优先；文件名只是 1、2、3 的话就当作第几个版本
    const r = folderR && (!stemR || stemR.via === '图鉴号') ? { ...folderR, take: /^\d$/.test(stem) ? Number(stem) : 0 } : stemR;
    if (!r) { skipped.push(path.relative(srcDir, f)); continue; }
    if (r.conflict) { conflicts.push(`${path.relative(srcDir, f)}：${r.conflict}，请改名后重试`); continue; }
    if (!groups.has(r.id)) groups.set(r.id, []);
    groups.get(r.id).push({ f, take: r.take || 0 });
  }
  const used = new Set(overwrite ? [] : fs.readdirSync(dir)); let done = 0, failed = 0;
  for (const [id, list] of [...groups].sort()) {
    list.sort((a, b) => (a.take || 99) - (b.take || 99) || a.f.localeCompare(b.f));
    for (const it of list) {
      let take = 1; while (used.has(fileFor(id, take)) && take < 9) take++;     // 按顺序填最小的空位，编号永远连续
      if (used.has(fileFor(id, take))) { console.log(`  ⚠ ${path.relative(srcDir, it.f)}：${nfkc(zh.species[id])} 已有 9 个版本，跳过`); continue; }
      const target = fileFor(id, take), res = packOne(bin, it.f, path.join(dir, target), max);
      if (res.error) { failed++; console.log(`  ✗ ${path.relative(srcDir, it.f)}：${res.error}`); continue; }
      used.add(target); done++;
      console.log(`  ✓ ${path.relative(srcDir, it.f)}  →  ${target}   ${res.sec ? res.sec.toFixed(2) + ' 秒' : ''}  音量${res.gain >= 0 ? '+' : ''}${res.gain.toFixed(1)} dB`);
    }
  }
  for (const c of conflicts) console.log('  ✗ ' + c);
  for (const s of skipped) console.log(`  ✗ ${s}：认不出是哪只宝可梦（文件名或所在文件夹请用 图鉴号 / 中文名 / 英文名）`);
  console.log(`\n转换完成：成功 ${done} 个${failed ? `，失败 ${failed} 个` : ''}${skipped.length + conflicts.length ? `，没处理 ${skipped.length + conflicts.length} 个（名字认不出或对不上）` : ''}。`);
}

/* ---------- 入口 ---------- */
async function main() {
  const args = process.argv.slice(2), flag = n => args.includes(n);
  const opt = (n, d = null) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
  if (flag('--list')) { process.stdout.write(listTable(opt('--list', 'md'))); return; }
  const dir = path.resolve(opt('--dir', path.join(ROOT, 'st-bridge/audio/cries')));
  fs.mkdirSync(dir, { recursive: true });
  const packDir = opt('--pack');
  if (flag('--pack') && !packDir) { console.error('用法：--pack <原始录音目录>'); process.exit(2); }
  if (packDir) {
    if (!fs.existsSync(packDir)) { console.error('找不到目录：' + packDir); process.exit(2); }
    pack(path.resolve(packDir), dir, { max: Number(opt('--max', 6)) || 6, overwrite: flag('--overwrite') });
    writeManifest(dir);
  } else if (flag('--fix')) { fix(dir); writeManifest(dir); }
  else if (flag('--manifest')) { writeManifest(dir); return; }
  const left = report(dir);
  if (left && !packDir) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
