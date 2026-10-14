/* Build verified front/back sprite URLs for every local Pokedex entry.
 * The map prefers animated sprites, then static sprites. A form without its
 * own sprite falls back to the corresponding base form in the same view.
 * Run: node tools/build-sprite-map.mjs
 */
import fs from 'node:fs/promises';

const BASE = 'https://play.pokemonshowdown.com/sprites/';
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const slug = name => String(name || '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  .replace('-mega-x', '-megax').replace('-mega-y', '-megay').replace('-mega-z', '-megaz');
const idFromSpeciesId = id => String(id || '')
  .replace(/(mega)([xyz])$/, '-$1$2')
  .replace(/mega$/, '-mega')
  .replace(/gmax$/, '-gmax');

function candidates(id, sp, dex) {
  const out = [];
  const add = value => { if (value && !out.includes(value)) out.push(value); };
  add(idFromSpeciesId(id)); add(slug(sp.name)); add(id);
  if (sp.baseSpecies) {
    const baseId = norm(sp.baseSpecies);
    const base = dex[baseId];
    if (base) add(slug(base.name));
    add(slug(sp.baseSpecies)); add(baseId);
  }
  add(idFromSpeciesId(id));
  const nameSlug = slug(sp.name);
  for (const suffix of ['-gmax', '-megax', '-megay', '-megaz', '-mega']) {
    if (nameSlug.endsWith(suffix)) add(nameSlug.slice(0, -suffix.length));
  }
  return out;
}

async function headOk(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
    return res.ok;
  } catch (_) { return false; }
}

async function mapPool(items, size, worker) {
  const results = new Map();
  let next = 0;
  async function run() {
    while (next < items.length) {
      const item = items[next++];
      results.set(item.key, await worker(item));
      if (results.size % 1000 === 0) console.log(`已检查 ${results.size}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: size }, run));
  return results;
}

async function main() {
  const dex = JSON.parse(await fs.readFile(new URL('../src/data/pokedex.json', import.meta.url), 'utf8'));
  const bySpecies = {};
  const allIds = new Set();
  for (const [id, sp] of Object.entries(dex)) {
    bySpecies[id] = candidates(id, sp, dex);
    for (const candidate of bySpecies[id]) allIds.add(candidate);
  }
  const dirs = [['ani', 'gif'], ['ani-back', 'gif'], ['gen5', 'png'], ['gen5-back', 'png']];
  const tasks = [];
  for (const [dir, ext] of dirs) for (const id of allIds) tasks.push({ key: `${dir}:${id}`, url: `${BASE}${dir}/${id}.${ext}` });
  console.log(`物种 ${Object.keys(dex).length}，候选图 ${allIds.size}，待检查 ${tasks.length}`);
  const checked = await mapPool(tasks, 36, async task => headOk(task.url));
  const first = (speciesId, dir) => bySpecies[speciesId].find(candidate => checked.get(`${dir}:${candidate}`)) || null;
  const entries = {};
  let animatedFront = 0, animatedBack = 0, anyFront = 0, anyBack = 0;
  for (const id of Object.keys(dex)) {
    const frontAnim = first(id, 'ani');
    const backAnim = first(id, 'ani-back');
    const frontStatic = first(id, 'gen5');
    const backStatic = first(id, 'gen5-back');
    const front = frontAnim ? `${BASE}ani/${frontAnim}.gif` : frontStatic ? `${BASE}gen5/${frontStatic}.png` : null;
    let back = backAnim ? `${BASE}ani-back/${backAnim}.gif` : backStatic ? `${BASE}gen5-back/${backStatic}.png` : null;
    let backFallback = null;
    if (!back && front) { back = front; backFallback = 'front'; }
    if (frontAnim) animatedFront++;
    if (backAnim) animatedBack++;
    if (front) anyFront++;
    if (back) anyBack++;
    entries[id] = { front, back, animatedFront: !!frontAnim, animatedBack: !!backAnim, backFallback };
  }
  const out = { source: 'Pokemon Showdown 公开精灵图库（逐只检查）', entries };
  await fs.writeFile(new URL('../src/data/sprite-map.json', import.meta.url), JSON.stringify(out) + '\n');
  console.log(`正面动图 ${animatedFront}，背面动图 ${animatedBack}，正面可用 ${anyFront}，背面可用 ${anyBack}`);
}

main().catch(err => { console.error(err); process.exit(1); });
