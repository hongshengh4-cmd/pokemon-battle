/* v0.9.3 · 战斗机制道具
 * 超级进化 → 超级进化石：Pokémon Showdown 道具图标（itemicons-sheet.png，与精灵图同源 CDN），按 Mega 形态选对应的石头
 * Ｚ招式   → Ｚ晶石：Showdown 图标，按 Z 属性选对应晶石
 * 极巨化   → 极巨腕带：Showdown 没有（非携带道具），按同一 24×24 像素风自绘
 * 太晶化   → 太晶珠：同上自绘，核心按太晶属性着色
 * 图标表加载失败（离线 / CDN 不可达）时退回 v0.9.2 的矢量图。仅负责图形与文案；可用/已用/已选等状态由 app.js 决定。 */
(function (root) {
  'use strict';
  const normId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const TYPE_COLORS = {
    Normal: '#a8a77a', Fire: '#f08030', Water: '#6890f0', Electric: '#f8d030', Grass: '#78c850', Ice: '#98d8d8',
    Fighting: '#c03028', Poison: '#a040a0', Ground: '#e2bf65', Flying: '#a890f0', Psychic: '#f85888', Bug: '#a8b820',
    Rock: '#b6a136', Ghost: '#705898', Dragon: '#7038f8', Dark: '#705848', Steel: '#b7b7ce', Fairy: '#ee99ac', Stellar: '#7dd3fc',
  };
  const TYPE_ZH = {
    Normal: '一般', Fire: '火', Water: '水', Electric: '电', Grass: '草', Ice: '冰', Fighting: '格斗', Poison: '毒', Ground: '地面',
    Flying: '飞行', Psychic: '超能', Bug: '虫', Rock: '岩石', Ghost: '幽灵', Dragon: '龙', Dark: '恶', Steel: '钢', Fairy: '妖精', Stellar: '星晶',
  };
  // 常见超级石的双色；没列出的按（原种属性一 / 属性二或 Mega 形态属性）取色。
  const MEGA_STONES = {
    venusaurmega: ['#58c25a', '#f06292'], charizardmegax: ['#2f6fd6', '#1f2430'], charizardmegay: ['#ff9f2e', '#e53935'],
    blastoisemega: ['#4f8ff0', '#b0bec5'], alakazammega: ['#e9b949', '#8d6e63'], gengarmega: ['#7e57c2', '#e53935'],
    kangaskhanmega: ['#b58d60', '#5d4037'], pinsirmega: ['#8d6e63', '#9ccc65'], gyaradosmega: ['#3f78e0', '#e53935'],
    aerodactylmega: ['#9e9e9e', '#7e57c2'], mewtwomegax: ['#7e57c2', '#90a4ae'], mewtwomegay: ['#7e57c2', '#f48fb1'],
    ampharosmega: ['#f9d342', '#ef5350'], scizormega: ['#e53935', '#90a4ae'], heracrossmega: ['#1e63c7', '#f9d342'],
    houndoommega: ['#2b2b2b', '#ff7043'], tyranitarmega: ['#7cb342', '#5d4037'], blazikenmega: ['#ff7043', '#f9d342'],
    gardevoirmega: ['#8bd1b5', '#f48fb1'], mawilemega: ['#8d6e63', '#ffb74d'], aggronmega: ['#90a4ae', '#455a64'],
    medichammega: ['#f48fb1', '#ffe082'], manectricmega: ['#2979ff', '#fdd835'], banettemega: ['#546e7a', '#e53935'],
    absolmega: ['#eceff1', '#546e7a'], garchompmega: ['#3949ab', '#ef5350'], lucariomega: ['#2962ff', '#1f2430'],
    abomasnowmega: ['#b2dfdb', '#5d4037'], beedrillmega: ['#fdd835', '#1f2430'], pidgeotmega: ['#ffcc80', '#ef5350'],
    slowbromega: ['#f48fb1', '#78909c'], steelixmega: ['#90a4ae', '#4fc3f7'], sceptilemega: ['#66bb6a', '#ef5350'],
    swampertmega: ['#42a5f5', '#ff7043'], sableyemega: ['#7e57c2', '#ef5350'], sharpedomega: ['#1e63c7', '#fdd835'],
    cameruptmega: ['#ef5350', '#8d6e63'], altariamega: ['#4fc3f7', '#fff8e1'], glaliemega: ['#b3e5fc', '#1f2430'],
    salamencemega: ['#1e63c7', '#ef5350'], metagrossmega: ['#42a5f5', '#90a4ae'], latiasmega: ['#f06292', '#eceff1'],
    latiosmega: ['#1e63c7', '#eceff1'], rayquazamega: ['#2e7d32', '#fdd835'], lopunnymega: ['#8d6e63', '#f9e4c8'],
    galladcmega: ['#43a047', '#f48fb1'], gallademega: ['#43a047', '#f48fb1'], audinomega: ['#f8bbd0', '#ffe082'], dianciemega: ['#f48fb1', '#fff59d'],
  };
  const uid = () => 'mi' + Math.random().toString(36).slice(2, 8);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lighten = (hex, amount = .45) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return '#ffffff';
    const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const mix = v => Math.round(v + (255 - v) * amount);
    return '#' + [mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  };
  const darken = (hex, amount = .35) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return '#333333';
    const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const mix = v => Math.round(v * (1 - amount));
    return '#' + [mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  };
  const typeColor = t => TYPE_COLORS[t] || '#9e9e9e';

  function megaStoneColors(pokemon, dex) {
    const form = normId(pokemon?.megaForm);
    if (MEGA_STONES[form]) return MEGA_STONES[form];
    const species = dex?.[form] || dex?.[normId(pokemon?.originalSpeciesId || pokemon?.speciesId)];
    const types = (species?.types?.length ? species.types : pokemon?.originalTypes || pokemon?.types || ['Normal']).slice(0, 2);
    const a = typeColor(types[0]);
    const b = types[1] ? typeColor(types[1]) : darken(a, .45);
    return [a, b];
  }

  /* 超级进化石：弹珠 + 两条交缠的火焰形漩涡 */
  function megaStone([a, b]) {
    const id = uid();
    return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
<defs>
 <radialGradient id="${id}g" cx="38%" cy="32%" r="72%"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="${lighten(a, .62)}"/><stop offset="1" stop-color="${lighten(a, .18)}"/></radialGradient>
 <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lighten(a, .3)}"/><stop offset="1" stop-color="${darken(a, .18)}"/></linearGradient>
 <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lighten(b, .25)}"/><stop offset="1" stop-color="${darken(b, .25)}"/></linearGradient>
 <clipPath id="${id}c"><circle cx="50" cy="50" r="43"/></clipPath>
</defs>
<circle cx="50" cy="50" r="45" fill="url(#${id}g)" stroke="#2b2238" stroke-width="4"/>
<g clip-path="url(#${id}c)" fill="none" stroke-linecap="round">
 <path d="M30 86C58 72 54 54 44 46 34 38 30 22 68 8" stroke="${darken(a, .35)}" stroke-width="20" opacity=".35"/>
 <path d="M30 86C58 72 54 54 44 46 34 38 30 22 68 8" stroke="url(#${id}a)" stroke-width="16"/>
 <path d="M70 14C42 28 46 46 56 54 66 62 70 78 32 92" stroke="${darken(b, .35)}" stroke-width="20" opacity=".35"/>
 <path d="M70 14C42 28 46 46 56 54 66 62 70 78 32 92" stroke="url(#${id}b)" stroke-width="16"/>
 <path d="M30 86C58 72 54 54 44 46" stroke="url(#${id}a)" stroke-width="16"/>
 <path d="M36 78C52 70 52 60 48 54" stroke="rgba(255,255,255,.5)" stroke-width="3"/>
 <path d="M64 22C50 30 50 40 54 46" stroke="rgba(255,255,255,.5)" stroke-width="3"/>
</g>
<ellipse cx="34" cy="30" rx="9" ry="7" fill="#fff" opacity=".95"/>
<ellipse cx="62" cy="76" rx="6" ry="3.5" fill="#fff" opacity=".45"/>
</svg>`;
  }

  /* Ｚ晶石：竖菱形、两层斜面、中央白色 Z 字 */
  function zCrystal(type) {
    const c = typeColor(type), id = uid();
    return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
<defs>
 <linearGradient id="${id}o" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lighten(c, .55)}"/><stop offset=".5" stop-color="${c}"/><stop offset="1" stop-color="${darken(c, .4)}"/></linearGradient>
 <linearGradient id="${id}i" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(c, .7)}"/><stop offset=".55" stop-color="${lighten(c, .15)}"/><stop offset="1" stop-color="${darken(c, .2)}"/></linearGradient>
</defs>
<path d="M50 3 86 50 50 97 14 50Z" fill="url(#${id}o)" stroke="${darken(c, .55)}" stroke-width="3.5" stroke-linejoin="round"/>
<path d="M50 18 73 50 50 82 27 50Z" fill="url(#${id}i)" stroke="rgba(255,255,255,.75)" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M50 3 50 18M86 50 73 50M50 97 50 82M14 50 27 50" stroke="rgba(255,255,255,.55)" stroke-width="1.6"/>
<path d="M38 38h24L38 62h25" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="10" stroke-linejoin="round" stroke-linecap="round" transform="translate(1.5 2)"/>
<path d="M38 38h24L38 62h25" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M50 8 30 36" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>
</svg>`;
  }

  /* 极巨腕带：3/4 视角腕带 + 顶部许愿星 */
  function dynamaxBand(gmax) {
    const id = uid(), gem = gmax ? '#e53975' : '#ef3b5d';
    return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
<defs>
 <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#e7e9f2"/><stop offset="1" stop-color="#b9bdd0"/></linearGradient>
 <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8ad0ff"/><stop offset="1" stop-color="#2d6cdf"/></linearGradient>
 <radialGradient id="${id}g" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#ffc6d6"/><stop offset=".4" stop-color="${gem}"/><stop offset="1" stop-color="#8f0f3a"/></radialGradient>
</defs>
<g transform="rotate(-18 50 58)">
 <path d="M50 22a42 32 0 1 0 0 64 42 32 0 1 0 0-64Zm0 17a24 15 0 1 1 0 30 24 15 0 1 1 0-30Z" fill="url(#${id}b)" fill-rule="evenodd" stroke="#2b2238" stroke-width="3.5" stroke-linejoin="round"/>
 <path d="M14 62a39 29 0 0 0 24 22" fill="none" stroke="url(#${id}s)" stroke-width="10" stroke-linecap="round"/>
 <path d="M50 22a42 32 0 0 1 38 19" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".9"/>
 <path d="M50 39a24 15 0 1 0 0 30 24 15 0 1 0 0-30Z" fill="#1f2430" opacity=".16"/>
 <ellipse cx="50" cy="54" rx="24" ry="15" fill="none" stroke="rgba(43,34,56,.55)" stroke-width="2"/>
</g>
<path d="M50 4 68 24 50 44 32 24Z" fill="url(#${id}g)" stroke="#5a0a26" stroke-width="3" stroke-linejoin="round"/>
<path d="M50 10 62 24 50 38 38 24Z" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.5"/>
<path d="M43 18l6-6" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
${gmax ? '<circle cx="78" cy="78" r="9" fill="#f43f5e" stroke="#7f1d1d" stroke-width="2.4"/><path d="M74 78a4 4 0 1 1 8 0 4 4 0 0 1-4 4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>' : ''}
</svg>`;
  }

  /* 太晶珠：多面体水晶球，核心按太晶属性发光 */
  function teraOrb(type) {
    const core = typeColor(type), id = uid();
    return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
<defs>
 <radialGradient id="${id}s" cx="42%" cy="36%" r="70%"><stop offset="0" stop-color="#d9f6ff"/><stop offset=".45" stop-color="#4fb3f6"/><stop offset="1" stop-color="#1d3fa0"/></radialGradient>
 <radialGradient id="${id}c" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="${lighten(core, .35)}"/><stop offset=".75" stop-color="${core}" stop-opacity=".85"/><stop offset="1" stop-color="${core}" stop-opacity="0"/></radialGradient>
 <clipPath id="${id}k"><circle cx="50" cy="52" r="42"/></clipPath>
</defs>
<circle cx="50" cy="52" r="44" fill="url(#${id}s)" stroke="#132a6b" stroke-width="4"/>
<g clip-path="url(#${id}k)" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.6" stroke-linejoin="round">
 <path d="M50 10 76 26 76 60 50 94 24 60 24 26Z"/>
 <path d="M50 10 38 34 50 52 62 34ZM24 26 38 34 24 60 38 70 50 52 62 70 76 60 62 34 76 26M38 70 50 94 62 70M50 52 50 94"/>
</g>
<circle cx="50" cy="52" r="26" fill="url(#${id}c)"/>
<path d="M50 38 58 52 50 66 42 52Z" fill="#fff" opacity=".92"/>
<ellipse cx="34" cy="30" rx="9" ry="6" fill="#fff" opacity=".85"/>
</svg>`;
  }

  // Pokémon Showdown 道具图标表（itemicons-sheet.png，16 列 × 24px）。键为 Mega 形态 id → 对应超级石的 spritenum；
  // 由 https://play.pokemonshowdown.com/data/items.js 生成（97 个 Mega 形态，含 Legends Z-A 预留项）。
  const PS_MEGA_STONES = {
    abomasnowmega:575, absolmega:576, absolmegaz:499, aerodactylmega:577, aggronmega:578, alakazammega:579, altariamega:615, ampharosmega:580,
    audinomega:617, banettemega:582, barbaraclemega:564, baxcaliburmega:514, beedrillmega:628, blastoisemega:583, blazikenmega:584, cameruptmega:625,
    chandeluremega:557, charizardmegax:585, charizardmegay:586, chesnaughtmega:558, chimechomega:498, clefablemega:544, crabominablemega:507, crucibellemega:577,
    darkraimega:504, delphoxmega:559, dianciemega:624, dragalgemega:565, dragonitemega:547, drampamega:569, eelektrossmega:556, emboarmega:552,
    excadrillmega:553, falinksmega:570, feraligatrmega:549, floettemega:562, froslassmega:551, gallademega:616, garchompmega:573, garchompmegaz:501,
    gardevoirmega:587, gengarmega:588, glaliemega:623, glimmoramega:512, golisopodmega:508, golurkmega:505, greninjamega:560, gyaradosmega:589,
    hawluchamega:566, heatranmega:503, heracrossmega:590, houndoommega:591, kangaskhanmega:592, latiasmega:629, latiosmega:630, lopunnymega:626,
    lucariomega:594, lucariomegaz:502, magearnamega:509, magearnaoriginalmega:509, malamarmega:563, manectricmega:596, mawilemega:598, medichammega:599,
    meganiummega:548, meowsticfmega:506, meowsticmmega:506, metagrossmega:618, mewtwomegax:600, mewtwomegay:601, pidgeotmega:622, pinsirmega:602,
    pyroarmega:561, raichumegax:496, raichumegay:497, sableyemega:614, salamencemega:627, sceptilemega:613, scizormega:605, scolipedemega:554,
    scovillainmega:511, scraftymega:555, sharpedomega:619, skarmorymega:550, slowbromega:620, staraptormega:500, starmiemega:546, steelixmega:621,
    swampertmega:612, tatsugiricurlymega:513, tatsugiridroopymega:513, tatsugiristretchymega:513, tyranitarmega:607, venusaurmega:608, victreebelmega:545, zeraoramega:510,
    zygardemega:568
  };
  const PS_MEGA_STONE_NAMES = {
    abomasnowmega:"Abomasite", absolmega:"Absolite", absolmegaz:"Absolite Z", aerodactylmega:"Aerodactylite",
    aggronmega:"Aggronite", alakazammega:"Alakazite", altariamega:"Altarianite", ampharosmega:"Ampharosite",
    audinomega:"Audinite", banettemega:"Banettite", barbaraclemega:"Barbaracite", baxcaliburmega:"Baxcalibrite",
    beedrillmega:"Beedrillite", blastoisemega:"Blastoisinite", blazikenmega:"Blazikenite", cameruptmega:"Cameruptite",
    chandeluremega:"Chandelurite", charizardmegax:"Charizardite X", charizardmegay:"Charizardite Y", chesnaughtmega:"Chesnaughtite",
    chimechomega:"Chimechite", clefablemega:"Clefablite", crabominablemega:"Crabominite", crucibellemega:"Crucibellite",
    darkraimega:"Darkranite", delphoxmega:"Delphoxite", dianciemega:"Diancite", dragalgemega:"Dragalgite",
    dragonitemega:"Dragoninite", drampamega:"Drampanite", eelektrossmega:"Eelektrossite", emboarmega:"Emboarite",
    excadrillmega:"Excadrite", falinksmega:"Falinksite", feraligatrmega:"Feraligite", floettemega:"Floettite",
    froslassmega:"Froslassite", gallademega:"Galladite", garchompmega:"Garchompite", garchompmegaz:"Garchompite Z",
    gardevoirmega:"Gardevoirite", gengarmega:"Gengarite", glaliemega:"Glalitite", glimmoramega:"Glimmoranite",
    golisopodmega:"Golisopite", golurkmega:"Golurkite", greninjamega:"Greninjite", gyaradosmega:"Gyaradosite",
    hawluchamega:"Hawluchanite", heatranmega:"Heatranite", heracrossmega:"Heracronite", houndoommega:"Houndoominite",
    kangaskhanmega:"Kangaskhanite", latiasmega:"Latiasite", latiosmega:"Latiosite", lopunnymega:"Lopunnite",
    lucariomega:"Lucarionite", lucariomegaz:"Lucarionite Z", magearnamega:"Magearnite", magearnaoriginalmega:"Magearnite",
    malamarmega:"Malamarite", manectricmega:"Manectite", mawilemega:"Mawilite", medichammega:"Medichamite",
    meganiummega:"Meganiumite", meowsticfmega:"Meowsticite", meowsticmmega:"Meowsticite", metagrossmega:"Metagrossite",
    mewtwomegax:"Mewtwonite X", mewtwomegay:"Mewtwonite Y", pidgeotmega:"Pidgeotite", pinsirmega:"Pinsirite",
    pyroarmega:"Pyroarite", raichumegax:"Raichunite X", raichumegay:"Raichunite Y", sableyemega:"Sablenite",
    salamencemega:"Salamencite", sceptilemega:"Sceptilite", scizormega:"Scizorite", scolipedemega:"Scolipite",
    scovillainmega:"Scovillainite", scraftymega:"Scraftinite", sharpedomega:"Sharpedonite", skarmorymega:"Skarmorite",
    slowbromega:"Slowbronite", staraptormega:"Staraptite", starmiemega:"Starminite", steelixmega:"Steelixite",
    swampertmega:"Swampertite", tatsugiricurlymega:"Tatsugirinite", tatsugiridroopymega:"Tatsugirinite", tatsugiristretchymega:"Tatsugirinite",
    tyranitarmega:"Tyranitarite", venusaurmega:"Venusaurite", victreebelmega:"Victreebelite", zeraoramega:"Zeraorite",
    zygardemega:"Zygardite"
  };
  const PS_Z_CRYSTALS = {
    Bug:642, Dark:646, Dragon:645, Electric:634, Fairy:648, Fighting:637,
    Fire:632, Flying:640, Ghost:644, Grass:635, Ground:639, Ice:636,
    Normal:631, Poison:638, Psychic:641, Rock:643, Steel:647, Water:633
  };
  // 极巨腕带与太晶珠不是携带道具，Showdown 没有图标；按同一 24×24 像素风自绘（字符画 + 调色板）。
  const PIXEL_BAND = [
    "........................",
    "........................",
    "........................",
    "........................",
    ".........KKKKK..........",
    ".....KKKWwwwwwWKKK......",
    "...KKwwKKKKKKKKKwwKK....",
    "...KwKhhhhhhhhhhhKwK....",
    "..KKwKhhhhhhhhhhhKwKK...",
    "..KKKwwKKKKKqKKKwwKKK...",
    "..KwnKKKWwwqpqWKKKssK...",
    "..KwnbbblKqpWrqsssssK...",
    "..KwnbbblqpPrrrqssssK...",
    "..KwnbbblwqrrrqsssssK...",
    "..KsnbbblwwqrqwsssssK...",
    "...snnbblwwwqwwsssss....",
    "...KKnnnnsssssssssKK....",
    ".....KKKKsssssKKKK......",
    ".........KKKKK..........",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................"
  ];
  const PIXEL_BAND_PAL = {"K": "#2b2238", "W": "#ffffff", "w": "#eef0f7", "s": "#c3c6d6", "h": "#3a3550", "b": "#3b82f6", "l": "#93c5fd", "n": "#1d4ed8", "p": "#fda4af", "P": "#fecdd3", "r": "#f43f5e", "q": "#9f1239"};
  const PIXEL_TERA = [
    "........................",
    "........................",
    "........................",
    "........KKKKKKK.........",
    "......KKLLLWLLLKK.......",
    ".....KLLWLLWLBBBBK......",
    "....KLWWWLLWBBBBBFK.....",
    "...KLLWWLLLFBBBBFDDK....",
    "...KWLLLWBBkBBBFBBDK....",
    "..KLLWWLBFkckBFBBFBDK...",
    "..KWWWWFFkcWckFFFBBBK...",
    "..KLLBBBkcWcCCkDDDDDK...",
    "..KLBBBkcccCCCCkDDDDK...",
    "..KBBBBBkcCCCCkDDDDDK...",
    "..KBBBBFFkCCCkDBBDDDK...",
    "..KBBFFBBFkCkDBDDBBDK...",
    "...KFBBBFDDkDDDBDDDK....",
    "...KDDBBDDDBDDDDBDDK....",
    "....KDBDDDDBDDDDDBK.....",
    ".....KDDDDDBDDDDDK......",
    "......KKDDDBDDDKK.......",
    "........KKKKKKK.........",
    "........................",
    "........................"
  ];
  const PIXEL_TERA_PAL = {"K": "#172a5c", "D": "#2447b5", "B": "#3f80e8", "L": "#8fd1ff", "F": "#bfe6ff", "W": "#ffffff", "C": "{C}", "c": "{c}", "k": "{k}"};

  const PS_SHEET_URL = 'https://play.pokemonshowdown.com/sprites/itemicons-sheet.png';
  const PS_SHEET = { url: PS_SHEET_URL, cols: 16, rows: 48, size: 24 };
  const sheetIcon = (index, item) => ({ kind: 'sheet', index, x: index % PS_SHEET.cols, y: Math.floor(index / PS_SHEET.cols), item });
  // 字符画 → 像素 SVG（每行按同色连续段输出 rect，shape-rendering=crispEdges 保持硬边）
  function pixelSvg(rows, palette, fill = {}) {
    const rects = [];
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x]; let run = 1;
        while (x + run < row.length && row[x + run] === ch) run++;
        if (ch !== '.') {
          let color = palette[ch] || '#000';
          if (fill[color]) color = fill[color];
          rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${color}"/>`);
        }
        x += run;
      }
    });
    return `<svg class="pixel-art" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects.join('')}</svg>`;
  }
  const pixelBand = () => pixelSvg(PIXEL_BAND, PIXEL_BAND_PAL);
  const pixelTeraOrb = type => {
    const c = typeColor(type);
    return pixelSvg(PIXEL_TERA, PIXEL_TERA_PAL, { '{C}': c, '{c}': lighten(c, .5), '{k}': darken(c, .4) });
  };

  function describe(pokemon, dex) {
    const kind = pokemon?.mechanic;
    if (!kind) return null;
    if (kind === 'mega') {
      const colors = megaStoneColors(pokemon, dex);
      const form = normId(pokemon.megaForm);
      const idx = PS_MEGA_STONES[form];
      const icon = idx !== undefined ? sheetIcon(idx, PS_MEGA_STONE_NAMES[form] || 'Mega Stone') : null;
      return { kind, name: '超级进化石', short: '超级进化', svg: megaStone(colors), colors, icon };
    }
    if (kind === 'z') {
      const t = pokemon.zType;
      const idx = PS_Z_CRYSTALS[t];
      return { kind, name: `${TYPE_ZH[t] || t || ''}Ｚ晶石`, short: 'Ｚ招式', svg: zCrystal(t), colors: [typeColor(t)], icon: idx !== undefined ? sheetIcon(idx, `${t} Z`) : null };
    }
    if (kind === 'dynamax') {
      const gmax = pokemon.dynamaxForm === 'gmax';
      return { kind, name: '极巨腕带', short: gmax ? '超极巨化' : '极巨化', svg: dynamaxBand(gmax), colors: ['#ef3b5d'], icon: { kind: 'pixel', svg: pixelBand() } };
    }
    if (kind === 'tera') {
      const t = pokemon.teraType;
      return { kind, name: `太晶珠·${TYPE_ZH[t] || t || ''}`, short: '太晶化', svg: teraOrb(t), colors: [typeColor(t)], icon: { kind: 'pixel', svg: pixelTeraOrb(t) } };
    }
    return null;
  }

  root.PKMMechanicItems = { describe, megaStone, zCrystal, dynamaxBand, teraOrb, pixelBand, pixelTeraOrb, pixelSvg, megaStoneColors, PS_SHEET, PS_MEGA_STONES, PS_Z_CRYSTALS, TYPE_COLORS, TYPE_ZH, esc };
})(typeof globalThis !== 'undefined' ? globalThis : this);
