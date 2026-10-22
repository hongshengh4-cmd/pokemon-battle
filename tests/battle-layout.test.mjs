import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const css = await readFile(new URL('src/ui/styles.css', root), 'utf8');

assert.match(html, /name="viewport"[^>]*viewport-fit=cover/, 'mobile viewport should extend into safe-area-aware fullscreen');
assert.match(html, /embed\\b[\s\S]*classList\.add\('embed'\)/, 'embed mode should be enabled before CSS loads');
assert.match(css, /html\.embed main\.panel\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0/s, 'embedded battle panel should occupy the viewport');
assert.match(css, /html\.embed \.battle-screen\s*\{[^}]*inset:\s*0;[^}]*height:\s*100%/s, 'embedded battle screen should fill the panel');
assert.match(css, /html\.embed #field-state\s*\{\s*display:\s*none !important;\s*\}/, 'battle explanation label should be hidden in embed mode');
assert.match(css, /\.battle-screen #field-state\s*\{\s*display:\s*none !important;\s*\}/, 'live battle HUD should omit the explanation label in all modes');
assert.match(css, /html\.fx-preview-mode \.battle-screen #field-state\s*\{\s*display:\s*block !important;\s*\}/, 'effect preview should keep its readout');
assert.match(css, /html\.fx-preview-mode \.battle-screen\s*\{[^}]*display:\s*block;/s, 'effect preview should remain arena-only');
assert.match(css, /html\.fx-preview-mode \.battle-deck\s*\{\s*display:\s*none !important;\s*\}/, 'effect preview should keep its command deck hidden');
assert.match(css, /@media\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*560px\)/, 'short landscape phones need dedicated layout rules');
assert.match(css, /@media\s*\(orientation:\s*portrait\)\s*and\s*\(max-width:\s*680px\)/, 'portrait fallback should keep the log readable');

console.log('Battle fullscreen/layout checks: 11 passed.');
