// Build local battle data from Pokemon Showdown's public JSON endpoints.
// Usage: node tools/build-data.mjs
// Outputs: src/data/pokedex.json, src/data/moves.json, src/data/learnsets.json
import { writeFile } from 'node:fs/promises';

const BASE = 'https://play.pokemonshowdown.com/data';
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj?.[k] !== undefined).map(k => [k, obj[k]]));
const normId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function get(name) {
  const res = await fetch(`${BASE}/${name}.json`);
  if (!res.ok) throw new Error(`${name}.json: HTTP ${res.status}`);
  return res.json();
}

const [pokedexRaw, movesRaw, learnsetsRaw] = await Promise.all([get('pokedex'), get('moves'), get('learnsets')]);

const pokedex = {};
for (const [id, s] of Object.entries(pokedexRaw)) {
  pokedex[id] = pick(s, ['num', 'name', 'types', 'baseStats', 'abilities', 'heightm', 'weightkg', 'baseSpecies', 'prevo', 'evos', 'evoLevel']);
  if (pokedex[id].abilities) pokedex[id].abilities = Object.values(pokedex[id].abilities);
}
const MOVE_KEYS = ['num','name','type','category','basePower','accuracy','pp','priority','flags','critRatio','target',
  'status','boosts','secondary','secondaries','drain','recoil','self','volatileStatus','heal','multihit','selfdestruct','breaksProtect','ohko','zMove','isZ','maxMove','weather','terrain','pseudoWeather','sideCondition','slotCondition'];
const moves = {};
for (const [id, m] of Object.entries(movesRaw)) moves[id] = pick(m, MOVE_KEYS);

// ---- Learnsets (current generation = 9) ----
// Compact encoding: learnsets[speciesId][moveId] = [levelUpLevel | 0, otherSourceFlags]
// e.g. [32, "M"] = learns at Lv32 and also by TM; [0, "E"] = egg move only.
function parseLearnset(raw) {
  const out = {};
  for (const [species, data] of Object.entries(raw)) {
    const entry = {};
    for (const [move, sources] of Object.entries(data?.learnset || {})) {
      let level = 0; const flags = new Set();
      for (const s of sources || []) {
        if (!s.startsWith('9')) continue;
        const m = /^9([A-Z])([0-9]*)$/.exec(s);
        if (!m) continue;
        if (m[1] === 'L') { const lv = parseInt(m[2] || '1', 10); if (!level || lv < level) level = lv; }
        else if (m[1] !== 'S' || level === 0) flags.add(m[1]); // event (S) alone doesn't grant normal access
        if (m[1] === 'S' && m[2]) { /* event distribution at a level: not a general learn method */ }
      }
      // A move only from a Gen9 event distribution still counts as obtainable historically.
      const hasGen9 = (sources || []).some(s => s.startsWith('9'));
      if (hasGen9 && (level || flags.size)) entry[move] = [level, [...flags].join('')];
      else if (hasGen9) entry[move] = [0, 'S'];
    }
    if (Object.keys(entry).length) out[species] = entry;
  }
  // Merge pre-evolution learnsets (evolved forms keep moves learned earlier).
  // Union the sources: e.g. Riolu's egg move must remain an egg move for Lucario
  // even if Lucario itself also has an unrelated event-distribution source.
  const mergeEntry = (target, move, value) => {
    if (!target[move]) { target[move] = value; return; }
    const [oldLevel, oldFlags] = target[move];
    const [newLevel, newFlags] = value;
    const levels = [oldLevel, newLevel].filter(Boolean);
    target[move] = [levels.length ? Math.min(...levels) : 0, [...new Set((oldFlags + newFlags).split(''))].join('')];
  };
  const mergeInto = (target, source) => { for (const [mv, v] of Object.entries(source || {})) mergeEntry(target, mv, v); };
  const resolve = (id, seen = new Set()) => {
    if (seen.has(id)) return out[id] || {};
    seen.add(id);
    const prevoName = pokedex[id]?.prevo;
    const prevoId = prevoName ? normId(prevoName) : '';
    // Formes (Mega/Gmax/etc.) fall back to their base species' learnset.
    const baseId = pokedex[id]?.baseSpecies ? normId(pokedex[id].baseSpecies) : '';
    const merged = {};
    if (baseId && baseId !== id) mergeInto(merged, resolve(baseId, seen));
    if (prevoId && prevoId !== id) mergeInto(merged, resolve(prevoId, seen));
    mergeInto(merged, out[id] || {});
    out[id] = merged;
    return merged;
  };
  for (const id of Object.keys(pokedex)) if (out[id] || pokedex[id]?.prevo || pokedex[id]?.baseSpecies) resolve(id);
  return Object.fromEntries(Object.entries(out).filter(([, v]) => Object.keys(v).length));
}
const learnsets = parseLearnset(learnsetsRaw);

await writeFile(new URL('../src/data/pokedex.json', import.meta.url), JSON.stringify(pokedex));
await writeFile(new URL('../src/data/moves.json', import.meta.url), JSON.stringify(moves));
await writeFile(new URL('../src/data/learnsets.json', import.meta.url), JSON.stringify(learnsets));
console.log(`pokedex: ${Object.keys(pokedex).length}, moves: ${Object.keys(moves).length}, learnsets: ${Object.keys(learnsets).length}`);
