// Build local battle data from Pokemon Showdown's public JSON endpoints.
// Usage: node tools/build-data.mjs
// Outputs: src/data/pokedex.json, src/data/moves.json
import { writeFile } from 'node:fs/promises';

const BASE = 'https://play.pokemonshowdown.com/data';
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj?.[k] !== undefined).map(k => [k, obj[k]]));

async function get(name) {
  const res = await fetch(`${BASE}/${name}.json`);
  if (!res.ok) throw new Error(`${name}.json: HTTP ${res.status}`);
  return res.json();
}

const [pokedexRaw, movesRaw] = await Promise.all([get('pokedex'), get('moves')]);

const pokedex = {};
for (const [id, s] of Object.entries(pokedexRaw)) {
  pokedex[id] = pick(s, ['num', 'name', 'types', 'baseStats', 'abilities', 'heightm', 'weightkg']);
  if (pokedex[id].abilities) pokedex[id].abilities = Object.values(pokedex[id].abilities);
}
const MOVE_KEYS = ['num','name','type','category','basePower','accuracy','pp','priority','flags','critRatio','target',
  'status','boosts','secondary','secondaries','drain','recoil','self','volatileStatus','heal','multihit','selfdestruct','breaksProtect','ohko','zMove','isZ','maxMove','weather','terrain','pseudoWeather','sideCondition','slotCondition'];
const moves = {};
for (const [id, m] of Object.entries(movesRaw)) moves[id] = pick(m, MOVE_KEYS);

await writeFile(new URL('../src/data/pokedex.json', import.meta.url), JSON.stringify(pokedex));
await writeFile(new URL('../src/data/moves.json', import.meta.url), JSON.stringify(moves));
console.log(`pokedex: ${Object.keys(pokedex).length} entries, moves: ${Object.keys(moves).length} entries`);
