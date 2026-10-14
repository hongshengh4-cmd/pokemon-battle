/* Build Simplified-Chinese display names for the browser UI.
 * Sources: PokeAPI CSV name tables (language 12 = Simplified Chinese),
 * matched to the local Showdown-derived pokedex/moves JSON by National-Dex
 * number (species) and by normalized English name (moves/abilities/natures).
 * Run: node tools/build-zh-names.mjs
 */
import fs from 'node:fs/promises';

const CSV_BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

async function loadCsv(name) {
  const res = await fetch(CSV_BASE + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return parseCsv(await res.text());
}

function nameMap(rows, idKey) {
  const en = {}, zh = {};
  for (const r of rows) {
    const id = Number(r[idKey]);
    if (r.local_language_id === '9') en[id] = r.name;
    if (r.local_language_id === '12') zh[id] = r.name;
  }
  return { en, zh };
}

const TYPE_ZH = { Normal: '一般', Fire: '火', Water: '水', Electric: '电', Grass: '草', Ice: '冰', Fighting: '格斗', Poison: '毒', Ground: '地面', Flying: '飞行', Psychic: '超能力', Bug: '虫', Rock: '岩石', Ghost: '幽灵', Dragon: '龙', Dark: '恶', Steel: '钢', Fairy: '妖精' };

const FORM_ZH = {
  Mega: null, Gmax: null, Alola: '阿罗拉', Galar: '伽勒尔', Hisui: '洗翠', Paldea: '帕底亚', Totem: '霸主宝可梦',
  Attack: '攻击形态', Defense: '防御形态', Speed: '速度形态', Normal: '普通形态', Origin: '起源形态', Altered: '别种形态',
  Sky: '天空形态', Land: '陆地形态', Therian: '灵兽形态', Incarnate: '化身形态', Blade: '刀剑形态', Shield: '盾形态',
  Heat: '加热形态', Wash: '清洗形态', Frost: '结冰形态', Fan: '旋转形态', Mow: '切割形态', Sunny: '太阳形态', Rainy: '雨天形态', Snowy: '雪天形态',
  Sunshine: '晴天形态', Zen: '达摩模式', Resolute: '觉悟的样子', Pirouette: '舞步形态', Aria: '歌声形态',
  Small: '小尺寸', Large: '大尺寸', Super: '特大尺寸', Average: '普通尺寸',
  Midnight: '黑夜的样子', Midday: '白昼的样子', Dusk: '黄昏的样子', School: '鱼群的样子', Meteor: '流星的样子', Busted: '现形的样子',
  Complete: '完全体形态', Unbound: '解放形态', Hangry: '空腹花纹', Noice: '冻结头形态', IceFace: '冻头脸',
  RapidStrike: '连击流', SingleStrike: '一击流', Rapid: '连击流', Single: '一击流', Hero: '平凡的样子', Antique: '真品', Phony: '赝品',
  Family: '一大家子', Four: '四只家庭', Three: '三只家庭', Roaming: '徒步形态', Chest: '宝箱形态',
  Droopy: '低垂的样子', Stretchy: '平挺的样子', Curly: '卷缩的样子', Bloodmoon: '月月熊', Crowned: '剑之王', CrownedShield: '盾之王',
  Wellspring: '水井之面', Hearthflame: '火灶之面', Cornerstone: '础石之面', Teal: '碧绿之面', Terastal: '太晶形态', Stellar: '星晶形态',
  Artisan: '野生的样子', Masterpiece: '杰出的样子', Gulping: '一口吃下', Gorging: '满口吃下', LowKey: '低调的样子', Amped: '高调的样子',
  Hoenn: '丰缘帽', Sinnoh: '神奥帽', Unova: '合众帽', Kalos: '卡洛斯帽', AlolaCap: '阿罗拉帽', World: '世界帽', OriginalCap: '初始帽',
  Douse: '水流卡带', Shock: '闪电卡带', Burn: '火焰卡带', Chill: '冰冻卡带', IcySnow: '冰雪花纹', Polar: '雪国花纹', Tundra: '冻原花纹',
  Continental: '大陆花纹', Garden: '庭院花纹', Elegant: '高雅花纹', Modern: '摩登花纹', Marine: '海洋花纹', Archipelago: '群岛花纹',
  HighPlains: '荒野花纹', Sandstorm: '沙尘花纹', River: '大河花纹', Monsoon: '季风花纹', Savanna: '草原花纹', Sun: '太阳花纹', Ocean: '大洋花纹',
  Jungle: '丛林花纹', Fancy: '幻彩花纹', Pokeball: '精灵球花纹', Neutral: '平静模式', Active: '活跃模式', PomPom: '啪滋啪滋风格', Pau: '呼啦呼啦风格', Sensu: '轻柔轻柔风格', Baile: '热辣热辣风格',
  Orange: '橙色核心', Yellow: '黄色核心', Green: '绿色核心', Blue: '蓝色核心', Indigo: '靛蓝色核心', Violet: '紫色核心', Red: '红色核心',
  DuskMane: '黄昏之鬃', DawnWings: '拂晓之翼', Ultra: '究极形态',
  Summer: '夏天的样子', Autumn: '秋天的样子', Winter: '冬天的样子', Spring: '春天的样子', Sandy: '沙土蓑衣', Plant: '草木蓑衣', Trash: '垃圾蓑衣',
  East: '东海', West: '西海', BlueStriped: '蓝条纹的样子', RedStriped: '红条纹的样子', WhiteStriped: '白条纹的样子',
  F: '雌性', M: '雄性', Female: '雌性', Male: '雄性', Eternal: '永恒之花', Original: '原始的样子', Starter: '搭档', Partner: '搭档',
  Cosplay: '换装皮卡丘', Libre: '面罩摔角手', Belle: '贵妇人', PhD: '博士', RockStar: '摇滚巨星', PopStar: '流行偶像', Bond: '牵绊形态', Ash: '小智版',
};

const COMBAT_BREED = { Combat: '斗育种', Blaze: '火焰种', Aqua: '水澜种' };

function speciesZh(id, sp, dex, baseZhByNum) {
  const baseName = sp.baseSpecies || sp.name;
  const baseEntry = sp.baseSpecies ? dex[norm(sp.baseSpecies)] : sp;
  const num = sp.num && sp.num > 0 ? sp.num : baseEntry?.num;
  const base = baseZhByNum[num] || null;
  if (!base) return id === 'missingno' ? '未知宝可梦' : '未知宝可梦';
  if (!sp.baseSpecies || sp.name === baseName) return base;
  let suffix = sp.name.startsWith(baseName + '-') ? sp.name.slice(baseName.length + 1) : '';
  if (!suffix) return base;
  if (suffix === 'Mega') return `超级${base}`;
  if (suffix === 'Mega-X') return `超级${base}X`;
  if (suffix === 'Mega-Y') return `超级${base}Y`;
  if (suffix === 'Mega-Z') return `超级${base}Z`;
  if (suffix.endsWith('Mega')) {
    const pre = suffix.replace(/-?Mega$/, '');
    return pre ? `超级${base}（${formText(pre)}）` : `超级${base}`;
  }
  if (suffix === 'Gmax' || suffix.endsWith('-Gmax')) {
    const pre = suffix.replace(/-?Gmax$/, '');
    return pre ? `超极巨化${base}（${formText(pre)}）` : `超极巨化${base}`;
  }
  if (suffix.startsWith('Paldea-')) {
    const kind = COMBAT_BREED[suffix.slice(7)] || formText(suffix.slice(7));
    return `帕底亚${base}（${kind}）`;
  }
  for (const region of ['Alola', 'Galar', 'Hisui', 'Paldea']) {
    if (suffix === region) return `${FORM_ZH[region]}${base}`;
    if (suffix.startsWith(region + '-')) return `${FORM_ZH[region]}${base}（${formText(suffix.slice(region.length + 1))}）`;
  }
  const exactForm = {
    'Spiky-eared': '刺耳皮丘样式', 'Icy Snow': '冰雪花纹', 'High Plains': '荒野花纹', "Pa'u": '呼啦呼啦风格',
    'Ruby-Cream': '红宝石奶油', 'Matcha-Cream': '抹茶奶油', 'Mint-Cream': '薄荷奶油', 'Lemon-Cream': '柠檬奶油',
    'Ruby-Swirl': '红宝石漩纹', 'Caramel-Swirl': '焦糖漩纹', 'Rainbow-Swirl': '彩虹漩纹', Dada: '爸爸的样子',
    Shadow: '骑黑马的样子', Ice: '骑白马的样子', 'Three-Segment': '三节的样子', 'Two-Segment': '二节的样子',
  }[suffix];
  if (exactForm) return suffix === 'Spiky-eared' ? '刺耳皮丘' : `${base}（${exactForm}）`;
  if (suffix.endsWith('-Tera')) return `${base}（${formText(suffix.slice(0, -5))}·太晶化）`;
  if (suffix === 'White') return `焰白${base}`;
  if (suffix === 'Black') return `暗黑${base}`;
  if (suffix === 'Primal') return `原始回归${base}`;
  if (suffix === 'Eternamax') return `无极巨那${base.replace(/^无极汰那$/, '无极汰那')}`;
  if (Object.hasOwn(TYPE_ZH, suffix) && base === '阿尔宙斯') return `${base}（${TYPE_ZH[suffix]}）`;
  return `${base}（${formText(suffix)}）`;
}

function formText(suffix) {
  const parts = suffix.split('-').filter(Boolean);
  const joined = parts.join('');
  if (FORM_ZH[joined]) return FORM_ZH[joined];
  const words = parts.map(p => FORM_ZH[p] || TYPE_ZH[p] || p)
    .map(p => String(p).replace(/形态$/, ''));
  return words.join('·') + (words.some(w => String(w).endsWith('样子')) ? '' : '形态');
}

async function main() {
  const dex = JSON.parse(await fs.readFile(new URL('../src/data/pokedex.json', import.meta.url), 'utf8'));
  const moves = JSON.parse(await fs.readFile(new URL('../src/data/moves.json', import.meta.url), 'utf8'));
  const [spRows, mvRows, abRows, naRows] = await Promise.all([
    loadCsv('pokemon_species_names.csv'), loadCsv('move_names.csv'), loadCsv('ability_names.csv'), loadCsv('nature_names.csv'),
  ]);
  const spNames = nameMap(spRows, 'pokemon_species_id');
  const mvNames = nameMap(mvRows, 'move_id');
  const abNames = nameMap(abRows, 'ability_id');
  const naNames = nameMap(naRows, 'nature_id');
  const baseZhByNum = spNames.zh;
  const species = {};
  for (const [id, sp] of Object.entries(dex)) species[id] = speciesZh(id, sp, dex, baseZhByNum);
  const byEnglishMove = {};
  for (const [id, name] of Object.entries(mvNames.en)) if (mvNames.zh[id]) byEnglishMove[norm(name)] = mvNames.zh[id];
  const moveZh = {};
  for (const [id, mv] of Object.entries(moves)) {
    moveZh[id] = byEnglishMove[norm(mv.name)] || fallbackMove(id, mv);
  }
  const abilities = {};
  for (const [id, name] of Object.entries(abNames.en)) if (abNames.zh[id]) abilities[norm(name)] = abNames.zh[id];
  const natures = {};
  for (const [id, name] of Object.entries(naNames.en)) if (naNames.zh[id]) natures[norm(name)] = naNames.zh[id];
  const out = {
    source: 'PokeAPI 名称表（简体中文）+ 本地形态规则',
    species, speciesByNum: baseZhByNum, moves: moveZh, abilities, natures, types: TYPE_ZH,
    categories: { Physical: '物理', Special: '特殊', Status: '变化' },
  };
  await fs.writeFile(new URL('../src/data/zh-names.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
  console.log(`物种 ${Object.keys(species).length}，招式 ${Object.keys(moveZh).length}，特性 ${Object.keys(abilities).length}，性格 ${Object.keys(natures).length}`);
}

function fallbackMove(id, mv) {
  if (id.startsWith('hiddenpower')) return `觉醒力量（${TYPE_ZH[mv.type] || '一般'}）`;
  if (id.startsWith('gmax')) return `超极巨${TYPE_ZH[mv.type] || ''}招式`;
  if (id.startsWith('max')) return `极巨${TYPE_ZH[mv.type] || ''}招式`;
  const known = { nihillight: '虚无之光', paleowave: '远古波涛', shadowstrike: '暗影奇袭', polarflare: '极光烈焰' };
  return known[id] || `${TYPE_ZH[mv.type] || '一般'}招式`;
}

main().catch(err => { console.error(err); process.exit(1); });
