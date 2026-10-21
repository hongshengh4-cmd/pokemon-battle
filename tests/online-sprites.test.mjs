import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const entries = JSON.parse(read('src/data/sprite-map.json')).entries;
for (const entry of Object.values(entries)) for (const key of ['front','back']) {
 if (!entry[key]) continue;
 const u = new URL(entry[key]);
 assert.equal(u.origin,'https://play.pokemonshowdown.com');
 assert.ok(u.pathname.startsWith('/sprites/'));
 assert.equal(entry[key+'Source'],undefined,'no supplemental alternate providers');
}
const app=read('src/ui/app.js');
assert.ok(!app.includes('assets/sprites/') && !app.includes('gmax-supplement'));
assert.ok(!app.includes('shopify') && !app.includes('mappedSource'));
assert.equal(fs.readdirSync(new URL('src/ui/assets/',root),{recursive:true}).filter(n=>n.endsWith('.gif')).length,0);
for (const side of ['front','back']) {
 assert.match(entries.cinderacegmax[side],/\/gen5ani(?:-back)?\/cinderace-gmax\.gif$/);
 assert.deepEqual(entries.urshifugmax[side+'Body'],entries.urshifu[side+'Body'],'reset anchors with ordinary-form fallback');
 assert.equal(entries.urshifurapidstrikegmax[side],entries.urshifurapidstrike[side]);
}
assert.equal(entries.toxtricitylowkeygmax.front,entries.toxtricitygmax.front);
assert.equal(entries.inteleongmax.backFallback,'front');
console.log('Showdown-only sprites: all mappings use one HTTPS source; zero local GIFs/alternate providers; real online Cinderace gmax and fallback anchors passed.');
