// 宝可梦·关都之旅 · 外置桥接 v1.3.23（战斗全屏与手机横屏适配）
// 由角色卡的酒馆助手脚本加载：
//   window.ST_BRIDGE_PACK='kanto-main';
//   window.PKM_APP_BASE_URL='https://<你的用户名>.github.io/pokemon-battle/';
//   await import(window.PKM_APP_BASE_URL+'st-bridge/bridge.js?v=1.3.23-battle-fullscreen-1');
// 面板布局依 v1.3.0 机制修复卡恢复：蓝色队伍卡、绿色六列仓库；队伍／仓库操作仍读写实时 MVU 变量。
// 负责：开局登记界面、图鉴状态栏（PKMKanto.mountDex）、右下角精灵球（队伍/仓库/跟随）、
//       附近野生遭遇、对战窗口（pkm-modal-v1 通道 ↔ 自己的 pokemon-battle 网页）、
//       战斗结果写回 MVU 变量、生成前注入“剧情节点 + 变量摘要”、在场人物同步“已结识”。
// v1.3.8 新增：① 配音二选一：精灵球面板里每只宝可梦都能选 🎬 动漫配音 / 🎮 游戏配音（全局默认 + 单只覆盖）；
//       动漫配音有录音播录音，没有录音时用语音合成喊名字（按体型调音高），也可改成播游戏叫声或不出声。
//       ② 赛制：野外 / 捕捉 = 对方 1 只 vs 我方能战斗的全部（最多 6 只，不足不补）；道馆按该馆规矩 NvN（缺 teamSize 时按道馆规矩表兜底），
//       能战斗的多于 N 只时开战前点选参赛名单；不足 N 只照常开战，参赛的全倒立即判负；结果文本写明赛制、判定和未参赛名单。
// v1.3.9：① 和 NPC 对战（训练家 / 劲敌 / 火箭队 / 强敌）没约定几对几时两边全队：对方派出带着的全部，我方能战斗的都能轮换，只数可以不一样；
//       剧情里约定了 NvN 也能在选人界面一键改成两边全队。道馆照旧按规矩（华蓝道馆改为 3v3：小霞的初始三只）。
//       ② 和小智 / 小霞 / 小刚对战时，对战块漏写的伙伴宝可梦按原作进度补上（例：小智收服绿毛虫后 = 皮卡丘 + 绿毛虫）。
//       ③ 对战画面的信息改准：顶部标签写对战类型和双方实际只数，敌方信息框写对手名字，战斗记录第一行写明赛制。
// v1.3.7：精灵球可拖到屏幕任意位置；叫声可换成自己的动画配音（st-bridge/audio/cries/<id>.mp3）。
import * as K from './kanto-data.js?v=1.3.23';

const VERSION = K.VERSION;
const W = window;
const P = (() => { try { return window.parent && window.parent.document ? window.parent : window; } catch (_) { return window; } })();
const PD = P.document;
const BASE = String(W.PKM_APP_BASE_URL || P.PKM_APP_BASE_URL || new URL('../', import.meta.url).href).replace(/\/?$/, '/');
const CH = 'pkm-modal-v1';
const PROMPT_KEY = 'PKM_KANTO_BRIDGE';
const LOG = (...a) => console.info('[关都之旅·桥接]', ...a);

/* ======================================================================
 * 0. 单例：重复加载（切换聊天、脚本重载）时先拆掉旧实例
 * ==================================================================== */
try { P.__PKM_KANTO__?.destroy?.(); } catch (_) {}
const cleanups = [];
let destroyed = false;
function listen(target, type, fn, opts) { target.addEventListener(type, fn, opts); cleanups.push(() => target.removeEventListener(type, fn, opts)); }
function destroy() {
  if (destroyed) return; destroyed = true;
  for (const fn of cleanups.splice(0)) { try { fn(); } catch (_) {} }
  try { ctx()?.setExtensionPrompt?.(PROMPT_KEY, '', 1, 1); } catch (_) {}
  try { stopCry(); } catch (_) {}
  for (const id of ['pkm-kanto-style', 'pkm-kanto-ball', 'pkm-kanto-panel', 'pkm-kanto-modal', 'pkm-kanto-toast']) PD.getElementById(id)?.remove();
  if (P.PKMKanto && P.PKMKanto.__owner === instance) delete P.PKMKanto;
}
const instance = { destroy, version: VERSION };
P.__PKM_KANTO__ = instance;
listen(W, 'pagehide', destroy);

/* ======================================================================
 * 1. 工具
 * ==================================================================== */
const ctx = () => { try { return P.SillyTavern?.getContext?.() || W.SillyTavern?.getContext?.() || null; } catch (_) { return null; } };
const chat = () => ctx()?.chat || [];
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const uid = () => 'pk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const userName = () => ctx()?.name1 || '训练家';
const subUser = s => String(s ?? '').replace(/\{\{user\}\}/gi, userName()).replace(/\{\{char\}\}/gi, ctx()?.name2 || '宝可梦·关都之旅');

// 对战入口卡片会校验 e.source===parent：消息必须“从 ST 主窗口发出”，
// 所以用在主窗口 realm 里创建的函数来调用 postMessage（直接调用的话 source 会变成脚本 iframe）。
let hostPoster = null;
function postFromHost(target, msg) {
  if (!hostPoster) {
    try { hostPoster = new P.Function('w', 'm', 'w.postMessage(m, "*");'); }
    catch (_) {
      try { const sc = PD.createElement('script'); sc.textContent = 'window.__pkmKantoPost=function(w,m){w.postMessage(m,"*");};'; PD.head.appendChild(sc); sc.remove(); hostPoster = P.__pkmKantoPost; } catch (__) {}
    }
    if (!hostPoster) hostPoster = (w, m) => w.postMessage(m, '*');
  }
  hostPoster(target, msg);
}
function toast(text, kind = 'info') {
  try { if (P.toastr?.[kind]) { P.toastr[kind](text, '关都之旅'); return; } } catch (_) {}
  let el = PD.getElementById('pkm-kanto-toast');
  if (!el) { el = PD.createElement('div'); el.id = 'pkm-kanto-toast'; PD.body.appendChild(el); }
  el.textContent = text; el.className = 'show ' + kind;
  clearTimeout(el._t); el._t = setTimeout(() => { el.className = ''; }, 3600);
}

/* ---------- 中文名 ↔ 引擎 id（精灵图、捕获结果换算） ---------- */
let ZH = null;
const zhReady = fetch(BASE + 'src/data/zh-names.json?v=' + VERSION).then(r => (r.ok ? r.json() : null)).then(z => {
  if (!z) return;
  const rev = {};
  for (const [id, name] of Object.entries(z.species || {})) if (name && !rev[name]) rev[name] = id;
  const mrev = {};
  for (const [id, name] of Object.entries(z.moves || {})) if (name && !mrev[name]) mrev[name] = id;
  ZH = { ...z, speciesRev: rev, movesRev: mrev };
  refreshAll();
}).catch(e => LOG('中文名表加载失败（不影响主要功能）', e));
const speciesId = name => { const n = String(name || '').trim(); if (!n) return ''; if (ZH?.speciesRev?.[n]) return ZH.speciesRev[n]; const id = n.toLowerCase().replace(/[^a-z0-9]/g, ''); return ZH?.species?.[id] ? id : (ZH ? '' : id); };
const zhSpecies = id => ZH?.species?.[id] || id;
const zhMove = id => ZH?.moves?.[id] || id;
const zhAbility = id => ZH?.abilities?.[id] || id || null;
const zhNature = id => ZH?.natures?.[id] || (id ? id : null);
function spriteUrl(name, { anim = false, shiny = false } = {}) {
  const id = speciesId(name); if (!id) return '';
  const dir = anim ? (shiny ? 'ani-shiny' : 'ani') : (shiny ? 'gen5-shiny' : 'gen5');
  return `https://play.pokemonshowdown.com/sprites/${dir}/${id}.${anim ? 'gif' : 'png'}`;
}
const spriteImg = (name, opts = {}, cls = 'pk-spr') => { const u = spriteUrl(name, opts); return u ? `<img class="${cls}" src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : `<span class="${cls} pk-spr-ph">?</span>`; };
function itemIcon(name) {
  const slug = K.ITEM_ICONS[name];
  const emoji = (K.ITEM_EMOJI.find(([re]) => re.test(name)) || [null, '🎒'])[1];
  return slug ? `<img class="pk-item" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${slug}.png" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${emoji}'))">` : `<span class="pk-item-e">${emoji}</span>`;
}

/* ---------- v1.3.4：个体值 / 性格 / 能力值 / 招式 PP / 叫声 ---------- */
let STATS = null;
fetch(BASE + 'st-bridge/kanto-stats.json?v=' + VERSION).then(r => (r.ok ? r.json() : null)).then(j => { if (j?.s) { STATS = j; refreshAll(); } }).catch(e => LOG('能力值表加载失败（不影响主要功能）', e));
const AVS_KEYS = Object.keys(K.AVS_ZH);
const AVS_MAX = 100;
const ivOk = v => Number.isInteger(v) && v >= 0 && v <= 31;
// 性格统一成中文名；英文 id（adamant）在中文名表加载后换算，加载前原样保留
function natureZh(n) {
  const s = String(n ?? '').trim(); if (!s) return null;
  if (K.NATURES.includes(s)) return s;
  const z = ZH?.natures?.[s.toLowerCase().replace(/[^a-z]/g, '')];
  return z && K.NATURES.includes(z) ? z : null;
}
function qualityOf(iv) {
  const vals = K.STAT_KEYS.map(k => Number(iv?.[k]) || 0);
  const sum = vals.reduce((a, b) => a + b, 0), top = vals.filter(v => v === 31).length;
  return sum >= 160 || top >= 4 ? 'perfect' : sum >= 115 ? 'high' : sum >= 65 ? 'medium' : 'low';
}
function rollIvs(quality, rand = Math.random) {
  const [lo, hi] = K.IV_BAND[quality] || [0, 31];
  const iv = {}; for (const k of K.STAT_KEYS) iv[k] = lo + Math.floor(rand() * (hi - lo + 1));
  if (quality === 'perfect') K.STAT_KEYS.slice().sort(() => rand() - 0.5).slice(0, 3).forEach(k => { iv[k] = 31; });
  return iv;
}
const rollNature = (rand = Math.random) => K.NATURES[Math.floor(rand() * K.NATURES.length)];
// 每只宝可梦第一次进入变量时定下个体值与性格（之后固定不变）；AI 写进来的缺项也会补齐
function ensureIndividual(mon, rand = Math.random) {
  if (!hasMon(mon)) return false;
  let ch = false;
  if (!isObj(mon.stats_meta)) { mon.stats_meta = { ivs: {}, ev_level: 0 }; ch = true; }
  if (!isObj(mon.stats_meta.ivs)) { mon.stats_meta.ivs = {}; ch = true; }
  const iv = mon.stats_meta.ivs;
  for (const k of K.STAT_KEYS) if (iv[k] != null && iv[k] !== '' && !ivOk(iv[k]) && ivOk(Number(iv[k]))) { iv[k] = Number(iv[k]); ch = true; }
  if (!K.STAT_KEYS.every(k => ivOk(iv[k]))) {
    const q = K.IV_BAND[mon.quality] ? mon.quality : null;
    const fresh = rollIvs(q, rand);
    for (const k of K.STAT_KEYS) if (!ivOk(iv[k])) iv[k] = fresh[k];
    if (!q) mon.quality = qualityOf(iv);
    ch = true;
  }
  if (!K.IV_BAND[mon.quality]) { mon.quality = qualityOf(iv); ch = true; }
  const nz = natureZh(mon.nature);
  if (nz && nz !== mon.nature) { mon.nature = nz; ch = true; }
  else if (!nz && (!mon.nature || ZH)) { mon.nature = rollNature(rand); ch = true; }
  if (!isObj(mon.friendship)) { mon.friendship = { avs: {} }; ch = true; }
  if (!isObj(mon.friendship.avs)) { mon.friendship.avs = {}; ch = true; }
  for (const k of AVS_KEYS) {
    const v = Number(mon.friendship.avs[k]);
    const c = Number.isFinite(v) ? Math.max(0, Math.min(AVS_MAX, Math.round(v))) : 0;
    if (mon.friendship.avs[k] !== c) { mon.friendship.avs[k] = c; ch = true; }
  }
  if (mon.pp !== undefined && mon.pp !== null && !isObj(mon.pp)) { mon.pp = null; ch = true; }
  if (mon.hp == null && mon.pp) { mon.pp = null; ch = true; } // hp=null 表示刚治疗过（满体力），招式点数也一起回满
  return ch;
}
function ensureAllIndividuals(pkm) {
  let ch = false;
  for (const s of [...(pkm?.party?.slots || []), ...(pkm?.party?.box || [])]) if (ensureIndividual(s)) ch = true;
  return ch;
}
const baseStatsOf = name => STATS?.s?.[speciesId(name)] || null;
// 与对战网页 calcStats 相同的公式（不含努力值）：同种同级也会因个体值和性格而不同
function monStats(s) {
  const b = baseStatsOf(s?.species || s?.name); if (!b) return null;
  const lv = Math.max(1, Math.min(100, Math.floor(Number(s.lv) || 5)));
  const iv = s.stats_meta?.ivs || {};
  const [up, down] = K.NATURE_EFFECT[natureZh(s.nature)] || [];
  const out = {};
  K.STAT_KEYS.forEach((k, i) => {
    const v0 = ivOk(iv[k]) ? iv[k] : 31;
    if (k === 'hp') { out.hp = Math.floor(((2 * b[i] + v0) * lv) / 100) + lv + 10; return; }
    let v = Math.floor(((2 * b[i] + v0) * lv) / 100) + 5;
    if (up === k) v = Math.floor(v * 1.1); if (down === k) v = Math.floor(v * 0.9);
    out[k] = v;
  });
  return out;
}
// 当前体力按“剩余比例 × 新的最大体力”换算（升级、补个体值后最大体力会变）
function curHp(s) {
  const st = monStats(s); const max = st?.hp || Number(s.maxHp) || null;
  if (s.hp == null || !s.maxHp) return { hp: max, max, full: true };
  const hp = Math.max(0, Math.min(max, Math.round((Number(s.hp) / Number(s.maxHp)) * max)));
  return { hp: Number(s.hp) > 0 && hp === 0 ? 1 : hp, max, full: false };
}
const moveIdOf = name => { const n = String(name || '').trim(); if (!n) return ''; if (ZH?.movesRev?.[n]) return ZH.movesRev[n]; const id = n.toLowerCase().replace(/[^a-z0-9]/g, ''); return STATS?.m?.[id] != null ? id : ''; };
const maxPP = name => STATS?.m?.[moveIdOf(name)] ?? null;
function ppText(s, name) {
  const max = maxPP(name); if (!max) return '';
  const left = s.hp != null && isObj(s.pp) && Number.isFinite(Number(s.pp[name])) ? Math.max(0, Math.min(max, Number(s.pp[name]))) : max;
  return `${left}/${max}`;
}
const natureNote = n => { const e = K.NATURE_EFFECT[natureZh(n)]; return e ? `${K.STAT_ZH[e[0]]}↑ ${K.STAT_ZH[e[1]]}↓` : '无修正'; };
// 叫声：宝可梦只喊自己的名字或名字的音节（会说话的喵喵除外）
function cryLines(name) {
  const n = String(name || '').trim(); if (!n) return [];
  if (K.CRIES[n]) return K.CRIES[n];
  if (n.length <= 2) return [`${n}～！`, `${n}${n}！`];
  if (n.length === 3) return [`${n}～！`, `${n[0]}～${n.slice(1)}！`];
  if (n.length === 4) return [`${n.slice(0, 2)}～${n.slice(2)}！`, `${n}～！`];
  return [`${n}！`, `${n}～`];
}
const cryText = s => cryLines(s?.species || s?.name).slice(0, 2).map(x => `「${x}」`).join('');
function cryId(name) { const id = speciesId(name); return id ? id.replace(/-/g, '') : ''; }
// v1.3.8：配音二选一（精灵球面板里选）——🎬 动漫配音 / 🎮 游戏配音。全局一个默认，每只宝可梦还可以单独选（“默认”= 跟随全局）。
//   🎮 游戏配音：原作游戏叫声（Pokémon Showdown 的音频）。
//   🎬 动漫配音：① 有录音就播录音：<CRY_BASE><id>.mp3（id 与原作叫声同名：pikachu、mrmime、nidoranf……；备选版本 <id>_2.mp3… 需 manifest.json）；
//               ② 这只还没有录音时按“没有动漫录音时”的设置：🎮 原作游戏叫声（默认）／🗣️ 语音合成喊名字（按体型调音高）／🔇 不出声。
//   设置都存在当前浏览器（localStorage）：pkmKantoCrySrc = anime|game，pkmKantoCryFallback = tts|game|mute，pkmKantoCryMon:<uid> = anime|game，
//   pkmKantoCryBase = 动漫录音地址（默认本站 st-bridge/audio/cries/）。v1.3.7 的旧值 auto / custom 自动当作 anime。
//   想把录音只放在本机、不进公开仓库：文件放进酒馆的 public/pkm-cries/，面板“动漫录音地址”填 /pkm-cries/。
const lsGet = (k, d = null) => { try { const v = P.localStorage?.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
const lsSet = (k, v) => { try { if (v == null) P.localStorage?.removeItem(k); else P.localStorage?.setItem(k, String(v)); } catch (_) {} };
/* @voice-prefs-begin（tests/roster-voice.test.mjs 直接执行这一段） */
const VOICES = ['anime', 'game'];
const VOICE_ZH = { anime: '🎬 动漫配音', game: '🎮 游戏配音' };
const FALLBACKS = ['tts', 'game', 'mute'];
const FALLBACK_ZH = { tts: '🗣️ 语音合成', game: '🎮 游戏叫声', mute: '🔇 不出声' };
const normVoice = v => (v === 'auto' || v === 'custom' ? 'anime' : VOICES.includes(v) ? v : null);
const globalVoice = () => normVoice(lsGet('pkmKantoCrySrc')) || 'anime';
const cryFallback = () => { const v = lsGet('pkmKantoCryFallback'); return FALLBACKS.includes(v) ? v : 'game'; };
const monCryKey = s => (s?.uid ? 'pkmKantoCryMon:' + s.uid : null);
const monVoicePref = s => { const k = monCryKey(s); return k ? normVoice(lsGet(k)) : null; }; // null = 跟随全局
const voiceOf = s => monVoicePref(s) || globalVoice();
// 语音合成念的台词：去掉括号里的动作描写，拖长音（～、——）换成停顿；纯动作（鲤鱼王“扑腾扑腾”）没法念，返回空串
function ttsText(line) {
  return String(line || '').replace(/[（(][^）)]*[）)]/g, '').replace(/[～~〜—–]+/g, '，').replace(/[♪♫]/g, '')
    .replace(/，+(?=[！？!?。…]|$)/g, '').replace(/^[，、\s]+/, '').trim();
}
// 体型越小音调越高、语速越快：皮卡丘（0.4m）≈1.8，妙蛙种子（0.7m）≈1.45，喷火龙（1.7m）≈0.9，大岩蛇（8.8m）最低 0.45
function ttsTone(heightDm) {
  const hm = Number(heightDm) > 0 ? Number(heightDm) / 10 : 0.7;
  const k = Math.log2(hm / 0.7);
  return { pitch: Math.max(0.45, Math.min(2, 1.45 - 0.42 * k)), rate: Math.max(0.75, Math.min(1.3, 1.1 - 0.1 * k)) };
}
/* @voice-prefs-end */
const cryBaseFrom = u => String(String(u || '').trim() || (BASE + 'st-bridge/audio/cries/')).replace(/\/?$/, '/');
let CRY_BASE = cryBaseFrom(lsGet('pkmKantoCryBase') || W.PKM_CRY_BASE || P.PKM_CRY_BASE);
const cryVol = () => { const v = Number(lsGet('pkmKantoCryVol', 70)); return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 70; };
const cryMiss = new Set();  // 已确认“没有动漫录音”的物种，不再重复探测
const cryHave = new Set();  // 已确认有录音的物种
const cryEls = new Map();   // url -> Audio（重复点击不用重新下载）
const cryProbe = new Map(); // id -> 正在探测的 Promise
const cryLast = {};         // id -> 上一次播的是第几个版本（避免连续两次同一个）
let cryTakes = {};          // manifest.json 里的 takes：{ pikachu: 3 } 表示有 pikachu.mp3、pikachu_2.mp3、pikachu_3.mp3
let cryManifestKnown = false, cryManifestCount = null;
function loadCryManifest() {
  cryTakes = {}; cryManifestKnown = false; cryManifestCount = null;
  const base = CRY_BASE;
  fetch(base + 'manifest.json?v=' + VERSION).then(r => (r.ok ? r.json() : null)).then(j => {
    if (base !== CRY_BASE || !j || typeof j !== 'object') return;
    if (j.takes && typeof j.takes === 'object') cryTakes = j.takes;
    const count = j.count == null ? NaN : Number(j.count);
    if (Number.isFinite(count) && count >= 0) { cryManifestKnown = true; cryManifestCount = count; }
  }).catch(() => {});
}
loadCryManifest();
function setCryBase(url) {
  const v = String(url || '').trim();
  lsSet('pkmKantoCryBase', v || null);
  CRY_BASE = cryBaseFrom(v || W.PKM_CRY_BASE || P.PKM_CRY_BASE);
  cryMiss.clear(); cryHave.clear(); cryEls.clear(); cryProbe.clear();
  loadCryManifest();
}
// 预先探测有没有录音（只取文件头）：面板能标出“有录音 / 没录音”，点击时也能立刻决定播什么（语音合成要在点击的瞬间开始才稳）
function probeCry(id) {
  if (!id) return Promise.resolve(false);
  if (cryManifestKnown && cryManifestCount === 0) { cryMiss.add(id); return Promise.resolve(false); }
  if (cryHave.has(id)) return Promise.resolve(true);
  if (cryMiss.has(id)) return Promise.resolve(false);
  if (cryProbe.has(id)) return cryProbe.get(id);
  const base = CRY_BASE, url = `${base}${id}.mp3`;
  const pr = new Promise(resolve => {
    let a; try { a = new P.Audio(); } catch (_) { cryProbe.delete(id); resolve(false); return; }
    const finish = ok => {
      clearTimeout(t); a.onloadedmetadata = a.onerror = null; cryProbe.delete(id);
      if (base !== CRY_BASE) { resolve(false); return; }
      if (ok === true) { cryHave.add(id); if (!cryEls.has(url)) cryEls.set(url, a); }
      else if (ok === false) cryMiss.add(id);
      resolve(ok === true);
    };
    const t = setTimeout(() => finish(null), 8000); // 超时 = 不确定（例如 iOS 不预加载），点击时再按老办法边播边判断
    a.preload = 'metadata'; a.onloadedmetadata = () => finish(true); a.onerror = () => finish(false); a.src = url;
  });
  cryProbe.set(id, pr);
  return pr;
}
function cryUrl(id) {
  const n = Math.max(1, Math.min(9, Math.floor(Number(cryTakes[id])) || 1));
  let k = 1 + Math.floor(Math.random() * n);
  if (n > 1 && k === cryLast[id]) k = k % n + 1;
  cryLast[id] = k;
  return `${CRY_BASE}${id}${k > 1 ? '_' + k : ''}.mp3`;
}
/* ---------- 语音合成（动漫配音没有录音时的替代：用浏览器的中文语音喊名字） ---------- */
const synth = () => { try { return P.speechSynthesis || null; } catch (_) { return null; } };
let ttsVoice = null;
function pickZhVoice() {
  const sy = synth(); if (!sy) return null;
  let all = []; try { all = sy.getVoices() || []; } catch (_) {}
  const zh = all.filter(v => /^(zh|cmn)/i.test(String(v.lang || '')));
  if (!zh.length) return null;
  const cn = zh.filter(v => /CN|Hans|cmn/i.test(String(v.lang || '').replace(/_/g, '-')));
  const pool = cn.length ? cn : zh;
  const prefs = [/Xiaoxiao|晓晓/i, /Xiaoyi|晓伊/i, /Huihui|慧慧/i, /Yaoyao|瑶瑶/i, /Tingting|婷婷/i, /Google/i, /female|女/i];
  // 本机语音一般都支持调音高；部分在线“自然”语音会忽略音高，同档里排后一点
  const rank = v => { const i = prefs.findIndex(re => re.test(v.name || '')); return (i < 0 ? prefs.length : i) + (/Natural|Online|自然/i.test(v.name || '') ? 0.5 : 0); };
  return pool.slice().sort((a, b) => rank(a) - rank(b))[0] || null;
}
try { const sy = synth(); if (sy) { ttsVoice = pickZhVoice(); const onV = () => { ttsVoice = pickZhVoice(); }; sy.addEventListener?.('voiceschanged', onV); cleanups.push(() => sy.removeEventListener?.('voiceschanged', onV)); } } catch (_) {}
const ttsReady = () => !!(synth() && typeof P.SpeechSynthesisUtterance === 'function' && (ttsVoice || (ttsVoice = pickZhVoice())));
const heightOf = name => STATS?.h?.[speciesId(name)] || null;
let lastUtter = null; // 留住引用：有的浏览器会把还没念完的语音回收掉
function speakCry(s, line, vol) {
  if (!ttsReady()) return false;
  const name = s?.species || s?.name;
  const text = ttsText(line ?? cryLines(name)[0]); if (!text) return false;
  try {
    const sy = synth(); sy.cancel();
    const u = new P.SpeechSynthesisUtterance(text), tone = ttsTone(heightOf(name));
    u.voice = ttsVoice; u.lang = ttsVoice.lang || 'zh-CN'; u.pitch = tone.pitch; u.rate = tone.rate; u.volume = Math.max(0, Math.min(1, vol / 100));
    lastUtter = u; sy.speak(u); try { sy.resume?.(); } catch (_) {}
    return true;
  } catch (_) { return false; }
}
/* ---------- 播放 ---------- */
let lastCry = null;
function stopCry() { try { lastCry?.pause?.(); } catch (_) {} lastCry = null; try { const sy = synth(); if (sy?.speaking || sy?.pending) sy.cancel(); } catch (_) {} }
function playGameCry(id, vol) {
  try { const a = new P.Audio(`https://play.pokemonshowdown.com/audio/cries/${id}.mp3`); a.volume = Math.min(1, vol / 100 * 0.78); lastCry = a; a.play().catch(() => {}); } catch (_) {}
}
function playCustomCry(id, vol, onMiss) {
  const url = cryUrl(id);
  let a = cryEls.get(url);
  if (!a) { a = new P.Audio(); a.preload = 'auto'; a.src = url; cryEls.set(url, a); }
  if (!a._pkHooked) { a._pkHooked = true; a.addEventListener('error', () => a._pkFail?.()); }
  a.volume = Math.max(0, Math.min(1, vol / 100));
  try { a.currentTime = 0; } catch (_) {}
  let failed = false;
  a._pkFail = () => {
    if (failed) return; failed = true; cryEls.delete(url);
    const primary = url === `${CRY_BASE}${id}.mp3`;
    if (primary) { cryMiss.add(id); cryHave.delete(id); } else cryTakes[id] = 1; // 文件不存在：记住，下次直接走替代方案
    if (lastCry !== a) return;                                        // 已经被新的叫声顶替了
    if (primary) onMiss?.(); else playCustomCry(id, vol, onMiss);    // 备选版本缺失 → 退回第一个版本
  };
  lastCry = a;
  a.play().catch(err => { if (err && err.name === 'NotSupportedError') a._pkFail?.(); });
}
// 动漫配音缺录音时的替代：语音合成 → 失败（没有中文语音 / 台词念不出来）就改播游戏叫声；或者按设置播游戏叫声 / 不出声
function animeFallback(s, id, vol, line) {
  const fb = cryFallback();
  if (fb === 'mute') return 'mute';
  if (fb === 'tts' && speakCry(s, line, vol)) return 'tts';
  playGameCry(id, vol); return 'game';
}
// 返回这一声实际怎么播的：game / anime（录音）/ tts / mute / probe（录音情况还不确定，边播边判断）
function playCry(s, line, voice) {
  const id = cryId(s?.species || s?.name); if (!id) return '';
  if (lsGet('pkmKantoMute') === '1') return 'mute';
  const vol = cryVol(); if (!vol) return 'mute';
  stopCry();
  if ((VOICES.includes(voice) ? voice : voiceOf(s)) === 'game') { playGameCry(id, vol); return 'game'; }
  if (cryMiss.has(id)) return animeFallback(s, id, vol, line);
  // 本次发布的录音清单明确为 0：同步改播原作游戏叫声，不能等 MP3 404 后再尝试播放，
  // 否则浏览器会把异步回退判定为自动播放，用户第一次点击就听不到声音。
  if (cryManifestKnown && cryManifestCount === 0) { cryMiss.add(id); return animeFallback(s, id, vol, line); }
  // 首次载入清单前也确保点击立即有声；同时后台探测自备动漫录音，后续点击可切回录音。
  if (!cryManifestKnown && !cryHave.has(id) && CRY_BASE === (BASE + 'st-bridge/audio/cries/')) {
    probeCry(id);
    if (cryFallback() === 'game') { playGameCry(id, vol); return 'game'; }
  }
  playCustomCry(id, vol, () => animeFallback(s, id, vol, line));
  return cryHave.has(id) ? 'anime' : 'probe';
}
const pickCryLine = s => { const lines = cryLines(s?.species || s?.name); return lines[Math.floor(Math.random() * lines.length)] || '……'; };
function cryBubble(s, line) {
  const host = PD.getElementById('pkm-kanto-ball'); if (!host) return;
  host.querySelector('.cry')?.remove();
  const b = PD.createElement('div'); b.className = 'cry'; b.textContent = line || pickCryLine(s);
  host.appendChild(b); setTimeout(() => b.remove(), 2600);
}
// 叫一声：声音和气泡用同一句台词（语音合成念的就是气泡里那句）
function cry(s, voice) { const line = pickCryLine(s); const how = playCry(s, line, voice); cryBubble(s, line); return how; }
// 动漫配音这一只实际会怎么出声（面板上的小字）
function cryStatus(s) {
  const id = cryId(s?.species || s?.name);
  if (voiceOf(s) === 'game') return { cls: 'game', text: '原作叫声' };
  if (cryHave.has(id)) return { cls: 'rec', text: '有录音' };
  const fb = cryFallback();
  const canSpeak = fb === 'tts' && ttsReady() && !!ttsText(cryLines(s?.species || s?.name)[0]);
  const alt = fb === 'mute' ? '不出声' : canSpeak ? '语音合成' : '改播游戏叫声';
  if (cryMiss.has(id) || (cryManifestKnown && cryManifestCount === 0)) return { cls: 'alt', text: `没有录音·${alt}` };
  return { cls: 'wait', text: `检测录音中…（没有就${alt}）` };
}
// 控制台试听：__PKM_KANTO__.testCry('皮卡丘')、__PKM_KANTO__.testCry('皮卡丘', 'game')
instance.testCry = (name = '皮卡丘', voice) => {
  const s = { species: name, name };
  cry(s, voice);
  const id = cryId(name);
  return id ? { file: `${CRY_BASE}${id}.mp3`, voice: VOICES.includes(voice) ? voice : globalVoice(), fallback: cryFallback(), tts: ttsReady() ? (ttsVoice?.name || true) : false } : '中文名表还没加载完，稍后再试';
};

/* ---------- 状态栏 <pkm_state> 与时间 ---------- */
function parseState(text) {
  const m = String(text || '').match(/<pkm_state>([\s\S]*?)(?:<\/pkm_state>|$)/i);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\n/)) { const kv = line.match(/^\s*([^：:\n]{1,6})[：:]\s*(.*?)\s*$/); if (kv) out[kv[1].trim()] = kv[2]; }
  return out;
}
function parseDate(s) {
  const m = String(s || '').match(/第\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日(?:\s*(\d{1,2})[:：](\d{2}))?/);
  if (!m) return null;
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0];
  return { y, mo, d, h, mi, day: (y - 1) * 372 + (mo - 1) * 31 + d, text: `第${y}年 ${mo}月${d}日` };
}
function latestState(beforeId = Infinity) {
  const c = chat();
  for (let i = Math.min(c.length - 1, beforeId); i >= 0; i--) { if (c[i]?.is_user) continue; const st = parseState(c[i]?.mes); if (st) return { id: i, state: st }; }
  return null;
}
function lastAiId() { const c = chat(); for (let i = c.length - 1; i >= 0; i--) if (!c[i]?.is_user && !c[i]?.is_system) return i; return -1; }

/* ======================================================================
 * 2. MVU 变量读写（stat_data.pkm）
 * ==================================================================== */
function getMsgVars(id) {
  try {
    if (typeof W.getVariables === 'function') return W.getVariables({ type: 'message', message_id: id });
    const m = chat()[id]; return m?.variables?.[m.swipe_id ?? 0] || null;
  } catch (_) { return null; }
}
async function setMsgVars(id, vars) {
  if (typeof W.replaceVariables === 'function') { await W.replaceVariables(vars, { type: 'message', message_id: id }); return; }
  const m = chat()[id]; if (!m) throw new Error('找不到要写入变量的楼层');
  if (!Array.isArray(m.variables)) m.variables = [];
  m.variables[m.swipe_id ?? 0] = vars;
  await ctx()?.saveChat?.();
}
function findStat() {
  const c = chat();
  for (let i = c.length - 1; i >= 0; i--) { const v = getMsgVars(i); if (v?.stat_data?.pkm) return { id: i, vars: v }; }
  return null;
}
let initvarCache = null;
function cardEntries() { const c = ctx(); const ch = c?.characters?.[c?.characterId]; return ch?.data?.character_book?.entries || []; }
function defaultPkm() {
  if (!initvarCache) {
    const e = cardEntries().find(x => /\[initvar\]/i.test(x.comment || ''));
    try { initvarCache = JSON.parse(e.content).pkm; } catch (_) { initvarCache = { player: { name: '{{user}}', money: 3000, badges: [], bag: { 精灵球: 5, 伤药: 2 }, reputation: 0 }, party: { slots: [], box: [], follow: null }, dex: { seen: {}, caught: [], shiny: {} }, world: { location: '真新镇·大木研究所', time: '第1年 5月22日 07:00', mode: '同行模式' }, npcs: { records: {} }, battle: { count: 0, wins: 0, lastResult: null, done: [] } }; }
  }
  const pkm = clone(initvarCache);
  if (pkm.player && /\{\{user\}\}/.test(pkm.player.name || '')) pkm.player.name = userName();
  return pkm;
}
function emptySlot(n) {
  return { slot: n, name: null, nickname: null, species: null, gender: null, lv: null, quality: null, nature: null, ability: null, shiny: false, item: null, isAce: false, isLead: false,
    friendship: { avs: { trust: 0, passion: 0, insight: 0, devotion: 0 } }, moves: [null, null, null, null],
    stats_meta: { ivs: { hp: null, atk: null, def: null, spa: null, spd: null, spe: null }, ev_level: 0 }, hp: null, maxHp: null, status: null, pp: null, exp: null, ball: null, met: null, notes: null };
}
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function normalize(pkm) {
  pkm = isObj(pkm) ? pkm : defaultPkm();
  pkm.player = isObj(pkm.player) ? pkm.player : {};
  const pl = pkm.player;
  if (!isObj(pl.bag)) pl.bag = {};
  if (!Array.isArray(pl.badges)) pl.badges = [];
  if (typeof pl.money !== 'number') pl.money = Number(pl.money) || 0;
  if (typeof pl.reputation !== 'number') pl.reputation = Number(pl.reputation) || 0;
  pkm.party = isObj(pkm.party) ? pkm.party : {};
  if (!Array.isArray(pkm.party.slots)) pkm.party.slots = [];
  for (let i = 0; i < 6; i++) if (!isObj(pkm.party.slots[i])) pkm.party.slots[i] = emptySlot(i + 1);
  if (!Array.isArray(pkm.party.box)) pkm.party.box = [];
  if (pkm.party.follow === undefined) pkm.party.follow = null;
  pkm.dex = isObj(pkm.dex) ? pkm.dex : {};
  if (!isObj(pkm.dex.seen)) pkm.dex.seen = {};
  if (!Array.isArray(pkm.dex.caught)) pkm.dex.caught = [];
  if (!isObj(pkm.dex.shiny)) pkm.dex.shiny = {};
  pkm.world = isObj(pkm.world) ? pkm.world : {};
  pkm.npcs = isObj(pkm.npcs) ? pkm.npcs : {};
  if (!isObj(pkm.npcs.records)) pkm.npcs.records = {};
  pkm.battle = isObj(pkm.battle) ? pkm.battle : {};
  for (const k of ['count', 'wins']) if (typeof pkm.battle[k] !== 'number') pkm.battle[k] = Number(pkm.battle[k]) || 0;
  if (!Array.isArray(pkm.battle.done)) pkm.battle.done = [];
  pkm.integration = isObj(pkm.integration) ? pkm.integration : {};
  if (!isObj(pkm.integration.battles)) pkm.integration.battles = {};
  pkm.wild = isObj(pkm.wild) ? pkm.wild : {};
  if (!isObj(pkm.wild.used)) pkm.wild.used = {};
  return pkm;
}
const hasMon = s => !!(s && (s.species || s.name));
function readPkm() { const f = findStat(); return normalize(f ? clone(f.vars.stat_data.pkm) : defaultPkm()); }
let writeChain = Promise.resolve();
function writePkm(mutator) {
  const run = async (attempt = 0) => {
    const c = chat(); const id = Math.max(0, c.length - 1);
    const f = findStat();
    const vars = clone(f ? f.vars : (getMsgVars(id) || {})) || {};
    if (!isObj(vars.stat_data)) vars.stat_data = {};
    const pkm = normalize(vars.stat_data.pkm ? vars.stat_data.pkm : defaultPkm());
    for (const s of [...pkm.party.slots, ...pkm.party.box]) if (hasMon(s) && !s.uid) s.uid = uid();
    const result = await mutator(pkm);
    ensureAllIndividuals(pkm);
    // v1.3.4：写入前确认 MVU 没有在这期间更新变量（否则会把 AI 刚写的好感等覆盖掉），有变化就基于新变量重算一次
    const f2 = findStat();
    if (attempt < 2 && f2 && (f2.id !== f?.id || JSON.stringify(f2.vars?.stat_data?.pkm) !== JSON.stringify(f?.vars?.stat_data?.pkm))) return run(attempt + 1);
    vars.stat_data.pkm = pkm;
    await setMsgVars(id, vars);
    return result;
  };
  const p = writeChain.then(() => run(0), () => run(0));
  writeChain = p.catch(() => {});
  return p.finally(() => { refreshAll(); refreshInjection(); });
}

/* ---------- 宝可梦对象 ---------- */
const monName = s => s?.nickname || s?.name || s?.species || '？';
const genderMark = g => ({ M: '♂', F: '♀', 公: '♂', 母: '♀' }[g] || '');
function dateText(pkm) { const st = latestState()?.state; return parseDate(st?.时间 || pkm.world.time)?.text || String(pkm.world.time || '').split(' ').slice(0, 2).join(' '); }
function placeText(pkm) { return latestState()?.state?.地点 || pkm.world.location || '关都'; }
function addSeen(pkm, name, eventId) {
  if (!name || pkm.dex.seen[name]) return false;
  pkm.dex.seen[name] = [eventId || '自由', placeText(pkm), dateText(pkm)];
  return true;
}
function placeMon(pkm, mon) {
  const idx = pkm.party.slots.findIndex(s => !hasMon(s));
  if (idx >= 0) {
    mon.slot = idx + 1;
    if (!pkm.party.slots.some(hasMon)) mon.isLead = true;
    pkm.party.slots[idx] = mon; return `队伍第${idx + 1}格`;
  }
  delete mon.slot; mon.isLead = false; pkm.party.box.push(mon); return '电脑（大木研究所）';
}
function makeStarter(species, nickname, mode) {
  const s = K.STARTERS[species];
  const mon = emptySlot(1);
  Object.assign(mon, {
    name: species, species, nickname: nickname || null, gender: s.gender, lv: 5, quality: 'medium',
    nature: K.NATURES[Math.floor(Math.random() * K.NATURES.length)], ability: s.ability, isLead: true, isAce: false,
    moves: s.moves.slice(), ball: '精灵球', uid: uid(),
    met: mode === '沙盒模式' ? '第1年 5月22日 · 真新镇·大木研究所后院，大木博士托付' : '第1年 5月22日 · 真新镇·大木研究所，大木博士赠送',
    notes: mode === '小智模式' ? '大木博士给的最后一只宝可梦，不肯进精灵球' : '大木博士给的第一只宝可梦',
  });
  mon.quality = null; ensureIndividual(mon); // 随机个体值（按总和推算资质）
  return mon;
}

/* ======================================================================
 * 3. 剧情节点（读取卡内世界书的事件详情 / 阶段条目）
 * ==================================================================== */
let eventCache = null;
function events() {
  if (eventCache) return eventCache;
  const list = [], stages = {};
  for (const e of cardEntries()) {
    const keys = e.keys || e.key || [];
    const evt = keys.find(k => /^EVT_/.test(k));
    const stg = keys.find(k => /^STAGE_\d+/.test(k));
    if (evt) {
      const content = String(e.content || '');
      const nodeText = (content.split(/\n- 节点:\s*\n/)[1] || '').split(/\n\s*介入点[：:]|\n- 对战机会/)[0];
      const nodes = nodeText ? nodeText.split(/\n(?=\s{2}\d+\.\s)/).map(t => t.trim()).filter(Boolean) : [];
      list.push({ id: evt.slice(4), title: String(e.comment || '').split('｜').slice(1).join('｜') || evt, content,
        stage: (content.match(/阶段[:：]\s*(S\d+[^\n]*)/) || [])[1] || '', date: parseDate((content.match(/时间[:：]\s*([^\n（(]+)/) || [])[1]),
        nodes: nodes.length ? nodes : ['（全事件）'],
        hook: (content.match(/介入点[：:]\s*([^\n]+)/) || [])[1] || '', battle: (content.match(/对战机会[:：]\s*([^\n]+)/) || [])[1] || '' });
    } else if (stg) {
      const n = 'S' + Number(stg.slice(6));
      (stages[n] = stages[n] || []).push({ comment: e.comment, content: String(e.content || '') });
    }
  }
  return (eventCache = { list, stages });
}
function plotPosition() {
  const { list } = events(); if (!list.length) return null;
  const index = Object.fromEntries(list.map((e, i) => [e.id, i]));
  const done = new Set(); let last = null, maxIdx = -1;
  const c = chat();
  for (let i = 0; i < c.length; i++) {
    if (c[i]?.is_user) continue;
    const st = parseState(c[i]?.mes); if (!st?.剧情) continue;
    const m = st.剧情.match(/([A-Z]{2,3}\d{2,3})\s*[｜|]\s*节点\s*(\d+)\s*[｜|]\s*(进行中|节点完成|完成|跳过)/);
    if (!m || index[m[1]] === undefined) continue;
    last = { id: m[1], node: +m[2], status: m[3] };
    if (m[3] === '完成' || m[3] === '跳过') done.add(m[1]);
    maxIdx = Math.max(maxIdx, index[m[1]]);
  }
  const mode = latestState()?.state?.模式 || readPkm().world.mode || '同行模式';
  const now = parseDate(latestState()?.state?.时间 || readPkm().world.time);
  let cur, node = 1, note = '';
  if (last && !done.has(last.id)) {
    cur = list[index[last.id]];
    node = last.status === '节点完成' ? last.node + 1 : last.node;
    if (node > cur.nodes.length) { node = cur.nodes.length; note = '上一节点已演完：本轮收束这个事件，状态栏写“完成”。'; }
  } else {
    let i = maxIdx + 1;
    while (i < list.length && done.has(list[i].id)) i++;
    // 沙盒模式：事件按日期在各地发生，过期 3 天以上视作背景中已经发生
    const skipped = [];
    if (mode.includes('沙盒') && now) while (i < list.length - 1 && list[i].date && now.day - list[i].date.day > 3) { skipped.push(list[i].id); i++; }
    if (i >= list.length) return { finished: true, mode };
    cur = list[i];
    if (skipped.length) note = `沙盒模式：${skipped.join('、')} 已按日期在背景中发生，{{user}} 只能听到公开的消息。`;
  }
  let gap = '';
  if (now && cur.date) {
    const d = cur.date.day - now.day;
    if (d > 0) gap = mode.includes('沙盒') ? `事件参考日期还有 ${d} 天，可以先写自由旅行与日常。` : `正文时间比事件参考日期早 ${d} 天：先写赶路、训练和日常，必要时一两句带过几天，再自然进入事件。`;
  }
  return { event: cur, node, total: cur.nodes.length, nodeText: cur.nodes[node - 1] || '', note, gap, mode };
}

/* ======================================================================
 * 4. 生成前注入：剧情节点 + 变量摘要
 * ==================================================================== */
function summaryText(pkm) {
  const pl = pkm.player, lines = [];
  const title = pl.title || K.TITLES.find(([n]) => (pl.reputation || 0) >= n)[1];
  lines.push(`训练家：${pl.name || userName()}${pl.gender ? '（' + pl.gender + '）' : ''}｜模式：${pkm.world.mode || '—'}｜金钱 ${pl.money} 元｜声望 ${pl.reputation}（${title}）｜徽章 ${pl.badges.length}/8${pl.badges.length ? '：' + pl.badges.join('、') : ''}`);
  const party = pkm.party.slots.map((s, i) => {
    if (!hasMon(s)) return null;
    const h = curHp(s);
    const moves = (s.moves || []).filter(Boolean).map(m => { const t = ppText(s, m); return t && t !== `${maxPP(m)}/${maxPP(m)}` ? `${m}(PP ${t})` : m; });
    const av = s.friendship?.avs || {};
    return `${i + 1}. ${monName(s)}${s.nickname ? '（' + s.species + '）' : ''} Lv${s.lv ?? '?'}${genderMark(s.gender)}${!h.full && h.max ? ` HP ${h.hp}/${h.max}` : ' HP 满'}${s.status ? '·' + s.status : ''} 招式：${moves.join('/') || '—'}${s.isLead ? ' [首发]' : ''}${s.uid && s.uid === pkm.party.follow ? ' [在身边跟随]' : ''}`
      + `｜${s.nature ? '性格' + (natureZh(s.nature) || s.nature) : ''}｜羁绊 ${AVS_KEYS.map(k => K.AVS_ZH[k] + (av[k] || 0)).join('/')}｜叫声${cryText(s)}`;
  }).filter(Boolean);
  lines.push('队伍：' + (party.length ? '\n  ' + party.join('\n  ') : '（还没有宝可梦，不能发起对战）'));
  // v1.3.8：能战斗的只数（对战名额按这个算，不要默认写成 6 只）
  if (party.length) {
    const ready = pkm.party.slots.filter(s => hasMon(s) && s.status !== '濒死' && s.hp !== 0);
    lines.push(`能战斗：${ready.length} 只${ready.length ? '（' + ready.map(monName).join('、') + '）' : '，全部失去战斗能力，先去宝可梦中心'}。野外遭遇时这 ${ready.length} 只都能轮换上场（对方只有 1 只）；和 NPC 对战没约定几对几时两边全队（对方带着的全部 vs 这 ${ready.length} 只，只数可以不一样）；道馆或约定 NvN 时最多上 N 只，不足 N 只也照常开战，参赛的全倒就判负。`);
  }
  if (pkm.party.box.length) lines.push(`电脑：${pkm.party.box.length} 只（${pkm.party.box.slice(-12).map(monName).join('、')}）`);
  const bag = Object.entries(pl.bag).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${k}×${n}`);
  lines.push('背包：' + (bag.join('、') || '空'));
  const seen = Object.keys(pkm.dex.seen);
  lines.push(`图鉴：遇见 ${seen.length} 种 / 收服 ${new Set(pkm.dex.caught).size} 种${seen.length ? '；图鉴已遇见：' + seen.join('、') : ''}`);
  const met = Object.values(pkm.npcs.records).filter(r => r && r.met).sort((a, b) => (b.lastInteraction ?? -1) - (a.lastInteraction ?? -1));
  if (met.length) lines.push('已结识人物（好感 -100~100，key 写在方括号里）：' + met.map(r => `${r.name}[${npcKeyOfRecord(pkm, r)}](${r.love ?? 0}${r.last ? '，上次' + (r.last > 0 ? '+' : '') + r.last + (r.why ? ' ' + r.why : '') : ''})`).join('、'));
  if (pkm.battle.lastResult) lines.push('最近一场对战：' + (typeof pkm.battle.lastResult === 'string' ? pkm.battle.lastResult : JSON.stringify(pkm.battle.lastResult)));
  return lines.join('\n');
}
const npcKeyOfRecord = (pkm, r) => Object.keys(pkm.npcs.records).find(k => pkm.npcs.records[k] === r) || '?';
// 人物名 / 别名 → records 的 key（AI 写成中文名或新造 key 时用来对上已有人物）
function npcKeyFor(records, raw) {
  const n = String(raw ?? '').trim(); if (!n) return null;
  if (isObj(records[n])) return n;
  const low = n.toLowerCase(); if (isObj(records[low])) return low;
  const plain = n.replace(/[（(].*?[)）]/g, '').trim();
  for (const [k, r] of Object.entries(records)) {
    if (!isObj(r)) continue;
    const names = [r.name, String(r.name || '').replace(/小姐$|博士$|先生$/, ''), ...(K.NPC_ALIASES[k] || [])].filter(Boolean);
    if (names.includes(n) || names.includes(plain)) return k;
  }
  return null;
}
function bondRules(pkm, st) {
  const names = String(st?.在场 || '').split(/[、，,／/；;\s]+/).map(x => x.replace(/[（(].*?[)）]/g, '').trim()).filter(Boolean);
  const keys = [...new Set(names.map(n => { const k = npcKeyFor(pkm.npcs.records, n); return k ? `${n}=${k}` : null; }).filter(Boolean))];
  const slots = pkm.party.slots.map((s, i) => (hasMon(s) ? `${monName(s)}=slots/${i}` : null)).filter(Boolean);
  return ['【好感与羁绊（每轮都要检查）】',
    `- 本轮 {{user}} 和在场人物有实际互动（交谈、帮忙、请客、并肩作战、吵架又和好……）时，在 <UpdateVariable> 里给他/她好感：{"op":"delta","path":"/pkm/npcs/records/<key>/love","value":2}（日常 +1~3，救命或重大事件 +5~10，冒犯、背叛为负），同时 replace 这个人的 last（本次变化值）和 why（原因，15 字内）。`,
    `- key 必须用英文 key，不能用中文名${keys.length ? '。上一幕在场人物：' + keys.join('、') : ''}。`,
    `- {{user}} 照顾、训练、夸奖、喂食、并肩作战的宝可梦要加羁绊：{"op":"delta","path":"/pkm/party/slots/<i>/friendship/avs/<trust|passion|insight|devotion>","value":1~3}（信任/热情/默契/亲密，0~100）${slots.length ? '。槽位：' + slots.join('、') : ''}。`,
    '- 脚本兜底：在场却没写好感变化的人物自动 +1（上限 30）；对战后出场的宝可梦自动加信任、获胜再加热情。所以你写的变化要体现剧情里真正的影响。',
    '【宝可梦叫声】宝可梦（会说话的喵喵除外）只会喊自己的名字或名字的音节，队伍里的叫法见上面的“叫声”。不要把名字截成不存在的叫法（例如小火龙不叫“小火小火”，应是“小火龙～！”“小～火龙！”）。',
    '【能力与 PP】宝可梦的个体值、性格、能力值和招式剩余 PP 由脚本维护；在宝可梦中心治疗后，把队伍每只的 hp、status、pp 都 replace 为 null（全部回满）。'].join('\n');
}
// v1.3.9：小智一行现在带着的宝可梦（按原作进度）。和他们对战时 team 要写全；没约定几对几就是两边全队
function companionLine() {
  const pos = storyPos(); if (!pos) return '';
  const out = [];
  for (const r of Object.values(K.NPC_ROSTERS || {})) {
    if (r.skipMode && String(pos.mode || '').includes(r.skipMode)) continue; // 小智模式：{{user}} 就是小智
    if (r.since && !pos.finished) { const i = pos.index(r.since); if (i < 0 || i > pos.cur) continue; }
    const now = rosterNow(r, pos), soon = (r.members || []).filter(m => joiningNow(m.join, pos)).map(m => m.forms[0]);
    if (now.length) out.push(`${r.name} ${now.length} 只（${now.map(m => m.species).join('、')}${soon.length ? `；这一段剧情里会加入${soon.join('、')}，加入后也算进去` : ''}）`);
  }
  return out.length ? `【伙伴阵容】小智一行现在随身带着（按原作进度，剧情里有变化以正文为准）：${out.join('；')}。和他们对战时 pkm_battle 的 team 写对方现在带着的全部；没约定几对几就是两边全队，只数可以和 {{user}} 不一样。` : '';
}
function buildInjection() {
  const c = chat(); if (!c.length) return '';
  const pkm = readPkm();
  if (c.length <= 1) return ''; // 还停在开局登记界面
  const parts = ['【关都主线·自动剧情注入】（外置桥接脚本在生成前计算，供你定位剧情；不要向玩家复述本段，也不要提前泄露后面的节点。）'];
  const st = latestState()?.state;
  parts.push(`当前：模式 ${st?.模式 || pkm.world.mode || '—'}｜时间 ${st?.时间 || pkm.world.time || '—'}｜地点 ${st?.地点 || pkm.world.location || '—'}`);
  const aiCount = c.filter((m, i) => i > 0 && !m.is_user).length;
  if (!aiCount) {
    const mode = pkm.world.mode || '同行模式';
    const g = ctx()?.characters?.[ctx()?.characterId]?.data?.alternate_greetings?.[K.MODE_INFO[mode]?.greeting ?? 0];
    parts.push(`【开局】玩家刚在开局界面提交了训练家档案（见上一条 <pkm_profile>），初始伙伴已由脚本写入队伍，不要重复添加。请写第一幕：从“${mode}”的开场开始，下面的备选开场白只作场景与语气参考，要按档案（名字、性别、初始伙伴）改写，不要照抄：\n${subUser(String(g || '').replace(/<pkm_state>[\s\S]*?<\/pkm_state>/i, '').replace(/<\/?content>/g, '').trim()).slice(0, 1800)}`);
  }
  const pos = plotPosition();
  if (pos?.finished) { parts.push('主线：动画关都篇的事件已全部结束，自由剧情。'); const cl = companionLine(); if (cl) parts.push(cl); }
  else if (pos) {
    const e = pos.event;
    parts.push(`当前主线事件：${e.id}｜${e.title}（${e.stage}${e.date ? '｜参考日期 ' + e.date.text : ''}）\n进度：节点 ${pos.node} / ${pos.total}。本轮只演这个节点里的一幕，停在需要 {{user}} 回应处；状态栏写“剧情：${e.id}｜节点${pos.node}｜进行中”，确实演完再写“节点完成”${pos.node === pos.total ? '，最后一个节点收束时写“完成”' : ''}。`);
    if (pos.note) parts.push(pos.note);
    if (pos.gap) parts.push('[日期] ' + pos.gap);
    parts.push(`【当前节点】\n${pos.nodeText}`);
    if (e.hook) parts.push('介入点：' + e.hook);
    if (e.battle) parts.push('对战机会（参考阵容，按 {{user}} 实力调整）：' + e.battle);
    const ef = K.EVENT_FORMATS?.[e.id];
    if (ef) parts.push(`本事件赛制：${ef.rule}（${ef.n}v${ef.n}）。发起这场${ef.type === 'gym' ? '道馆战' : '比赛'}时 pkm_battle 顶层写 "teamSize":${ef.n}，对手 team 不超过 ${ef.n} 只；开战前由裁判或对手在正文里说明规矩。`);
    const cl = companionLine(); if (cl) parts.push(cl);
    const stageNo = (e.stage.match(/S\d+/) || [])[0];
    for (const s of events().stages[stageNo] || []) parts.push(s.content);
  }
  const lastUser = [...c].reverse().find(m => m.is_user);
  if (lastUser && /<pkm_result>/i.test(lastUser.mes || '')) parts.push('【对战结果】玩家的上一条消息带有 <pkm_result>：按结果续写战斗经过，不改写胜负。HP/状态、精灵球消耗、收服入队、图鉴登记已由脚本写入变量，不要重复写。');
  parts.push('【变量摘要（脚本生成，以此为准）】\n' + summaryText(pkm));
  parts.push(bondRules(pkm, st));
  return subUser(parts.join('\n\n'));
}
let lastInjection = '';
function refreshInjection() {
  try {
    const c = ctx(); if (!c?.setExtensionPrompt) return;
    const text = buildInjection();
    if (text === lastInjection) return;
    lastInjection = text;
    c.setExtensionPrompt(PROMPT_KEY, text, 1, 1, false, 0); // IN_CHAT, depth 1, system
  } catch (e) { LOG('注入失败', e); }
}

/* ======================================================================
 * 5. 在场人物 → 已结识 / 最近互动；状态栏 → 世界时间地点
 * ==================================================================== */
/* ---------- v1.3.4：AI 的 <UpdateVariable> 对账 + 好感 / 羁绊兜底 ---------- */
function pathSegs(path) {
  let p = String(path ?? '').trim(); if (!p) return [];
  let segs = p.startsWith('/') ? p.slice(1).split('/').map(x => x.replace(/~1/g, '/').replace(/~0/g, '~'))
    : p.replace(/\[(\d+)\]/g, '.$1').split('.').map(x => x.replace(/^['"]|['"]$/g, ''));
  segs = segs.filter(x => x !== '');
  if (segs[0] === 'stat_data') segs.shift();
  return segs;
}
function parsePatchOps(text) {
  const ops = [];
  const t = String(text || '');
  for (const m of t.matchAll(/<UpdateVariable>([\s\S]*?)(?:<\/UpdateVariable>|$)/gi)) {
    const b = m[1];
    const jp = b.match(/<JSONPatch>([\s\S]*?)(?:<\/JSONPatch>|$)/i);
    const raw = (jp ? jp[1] : (b.match(/\[[\s\S]*\]/) || [''])[0]).replace(/```(?:json)?/gi, '').trim();
    if (raw) {
      let arr = null;
      for (const cand of [raw, raw.replace(/^\s*\/\/[^\n]*$/gm, '').replace(/,\s*([\]}])/g, '$1')]) { try { arr = JSON.parse(cand); break; } catch (_) {} }
      if (Array.isArray(arr)) ops.push(...arr.filter(isObj));
      else for (const o of raw.matchAll(/\{[^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*\}/g)) { try { const x = JSON.parse(o[0]); if (x?.op && x?.path) ops.push(x); } catch (_) {} }
    }
    // 旧式写法：_.set('pkm.npcs.records.misty.love', 0, 5); / _.add('路径', 2);
    for (const c of b.matchAll(/_\.(set|add|delta|remove)\(\s*(['"`])(.+?)\2\s*(?:,([^;]*?))?\)\s*;/g)) {
      let args = []; try { args = JSON.parse('[' + String(c[4] || '').replace(/'/g, '"') + ']'); } catch (_) { continue; }
      if (c[1] === 'set') ops.push({ op: 'replace', path: c[3], value: args[args.length - 1] });
      else if (c[1] === 'remove') ops.push({ op: 'remove', path: c[3] });
      else if (typeof args[0] === 'number') ops.push({ op: 'delta', path: c[3], value: args[0] });
    }
  }
  return ops.map(o => ({ op: String(o.op || '').toLowerCase(), segs: pathSegs(o.path), value: o.value })).filter(o => o.segs.length && o.op);
}
const hasOwnStat = id => !!getMsgVars(id)?.stat_data?.pkm;
function prevPkm(mesid) {
  for (let i = mesid - 1; i >= 0; i--) { const v = getMsgVars(i); if (v?.stat_data?.pkm) return normalize(clone(v.stat_data.pkm)); }
  return null;
}
// MVU 完全没有处理这一楼时（没装 / 报错），按 AI 的 JSONPatch 自己写入（与 MVU 的 replace/add/delta/remove/insert 语义一致）
function applyOpsGeneric(pkm, ops) {
  const root = { pkm };
  for (const o of ops) {
    const segs = o.segs.slice();
    if (segs[0] !== 'pkm' || ['integration', 'wild'].includes(segs[1])) continue;
    if (segs[1] === 'npcs' && segs[2] === 'records' && segs[3]) { const k = npcKeyFor(pkm.npcs.records, segs[3]) || (segs.length === 4 && isObj(o.value) ? npcKeyFor(pkm.npcs.records, o.value.name) : null); if (k) segs[3] = k; }
    let parent = root;
    for (let i = 0; i < segs.length - 1 && parent; i++) {
      if (typeof parent !== 'object') { parent = null; break; }
      if (parent[segs[i]] === undefined && (o.op === 'add' || o.op === 'insert')) parent[segs[i]] = {};
      parent = parent[segs[i]];
    }
    if (!parent || typeof parent !== 'object') continue;
    const last = segs[segs.length - 1];
    try {
      if (o.op === 'replace') { if (Array.isArray(parent) ? Number(last) < parent.length : last in parent) parent[last] = clone(o.value); }
      else if (o.op === 'add' || o.op === 'insert') { if (Array.isArray(parent)) { if (last === '-') parent.push(clone(o.value)); else parent.splice(Number(last), 0, clone(o.value)); } else parent[last] = clone(o.value); }
      else if (o.op === 'remove') { if (Array.isArray(parent)) parent.splice(Number(last), 1); else delete parent[last]; }
      else if (o.op === 'delta') { const n = Number(o.value); if (Number.isFinite(n)) parent[last] = (Number(parent[last]) || 0) + n; }
    } catch (_) {}
  }
}
const AUTO_LOVE_CAP = 30, AUTO_AVS_CAP = 50;
const clampLove = v => Math.max(-100, Math.min(100, Math.round(v)));
const clampAv = v => Math.max(0, Math.min(AVS_MAX, Math.round(v)));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
// 以“上一楼的变量 + 本楼 AI 写的变化（+ 兜底加成）”为期望值：MVU 已经写对的不动，没写进去的补上。重复执行结果不变。
function reconcileBonds(pkm, mesid, presentKeys) {
  const msg = chat()[mesid]; if (!msg || msg.is_user) return false;
  const base = prevPkm(mesid); if (!base) return false;
  const ops = parsePatchOps(msg.mes);
  const recs = pkm.npcs.records, baseRecs = base.npcs.records;
  let changed = false;
  const exp = {}, touched = new Set(), dup = new Set();
  for (const o of ops) {
    const g = o.segs;
    if (g[0] !== 'pkm' || g[1] !== 'npcs' || g[2] !== 'records' || !g[3]) continue;
    const raw = g[3];
    let key = npcKeyFor(baseRecs, raw);
    if (!key && g.length === 4 && isObj(o.value) && o.value.name) key = npcKeyFor(baseRecs, o.value.name);
    if (!key) { // 真正的新人物：MVU 没建出来就补建
      if (g.length === 4 && isObj(o.value) && (o.op === 'add' || o.op === 'replace')) exp[raw] = { __new: clone(o.value) };
      else if (g.length === 5 && exp[raw]?.__new && ['add', 'replace', 'delta'].includes(o.op)) { const nv = exp[raw].__new; nv[g[4]] = o.op === 'delta' ? (Number(nv[g[4]]) || 0) + (Number(o.value) || 0) : o.value; }
      continue;
    }
    if (key !== raw && !isObj(baseRecs[raw])) dup.add(raw);
    const e = exp[key] || (exp[key] = {});
    const b = baseRecs[key];
    const curLove = () => (e.love ?? (Number(b.love) || 0));
    if (g.length === 4) {
      if (!isObj(o.value)) continue;
      e.met = true;
      const d = Number(o.value.last);
      if (Number.isFinite(d) && d) { e.love = curLove() + d; e.last = d; touched.add(key); }
      if (o.value.why) e.why = String(o.value.why);
      continue;
    }
    const f = g[4];
    if (f === 'love') {
      const n = Number(o.value); if (!Number.isFinite(n)) continue;
      if (o.op === 'delta') { e.love = curLove() + n; e._d = (e._d || 0) + n; } else if (o.op === 'replace' || o.op === 'add') e.love = n; else continue;
      touched.add(key);
    } else if (['last', 'why', 'met'].includes(f) && (o.op === 'replace' || o.op === 'add')) e[f] = f === 'last' ? (Number(o.value) || 0) : o.value;
  }
  // 兜底：在场、本楼没写好感变化、好感在 0~30 之间的人物 +1
  for (const key of presentKeys) {
    const b = baseRecs[key]; if (!isObj(b) || touched.has(key)) continue;
    const bl = Number(b.love) || 0; if (bl < 0 || bl >= AUTO_LOVE_CAP) continue;
    const e = exp[key] || (exp[key] = {});
    e.love = bl + 1; e.last = 1; e.why = e.why || '一起相处';
  }
  for (const e of Object.values(exp)) if (e.last === undefined && e._d) e.last = e._d; // AI 只写了 delta 没写 last 时补上
  for (const [key, e] of Object.entries(exp)) {
    if (e.__new) {
      if (!isObj(recs[key])) { recs[key] = { name: key, gender: '无', role: null, love: 0, met: true, last: 0, why: null, ...e.__new, lastInteraction: mesid }; recs[key].love = clampLove(Number(recs[key].love) || 0); changed = true; }
      continue;
    }
    const b = baseRecs[key];
    let r = recs[key]; if (!isObj(r)) { r = recs[key] = clone(b); changed = true; }
    if (e.love != null) {
      const target = clampLove(e.love), cur = Number(r.love), bl = Number(b.love) || 0;
      if (cur !== target && (!Number.isFinite(cur) || cur === bl)) { r.love = target; changed = true; }
    }
    for (const f of ['last', 'why', 'met']) if (e[f] !== undefined && !same(r[f], e[f]) && same(r[f], b[f])) { r[f] = e[f]; changed = true; }
  }
  for (const r of Object.values(recs)) if (isObj(r) && r.love != null) { const n = Number(r.love); const c = Number.isFinite(n) ? clampLove(n) : 0; if (r.love !== c) { r.love = c; changed = true; } }
  for (const k of dup) if (isObj(recs[k]) && !isObj(baseRecs[k])) { delete recs[k]; changed = true; }

  // 宝可梦羁绊
  const expAv = {}, touchedAv = new Set();
  const avBase = m => (isObj(m?.friendship?.avs) ? m.friendship.avs : {});
  for (const o of ops) {
    const g = o.segs;
    if (g[0] !== 'pkm' || g[1] !== 'party' || !['slots', 'box'].includes(g[2]) || g[4] !== 'friendship') continue;
    const i = Number(g[3]); const bm = base.party[g[2]]?.[i]; if (!Number.isInteger(i) || !hasMon(bm)) continue;
    const id = g[2] + ':' + i, e = expAv[id] || (expAv[id] = {});
    const cur = k => (e[k] ?? (Number(avBase(bm)[k]) || 0));
    if (g[5] === 'avs' && AVS_KEYS.includes(g[6])) {
      const n = Number(o.value); if (!Number.isFinite(n)) continue;
      if (o.op === 'delta') e[g[6]] = cur(g[6]) + n; else if (o.op === 'replace' || o.op === 'add') e[g[6]] = n; else continue;
    } else if (g[5] === 'avs' && g.length === 6 && isObj(o.value)) { for (const k of AVS_KEYS) if (Number.isFinite(Number(o.value[k]))) e[k] = Number(o.value[k]); }
    else continue;
    touchedAv.add(id);
  }
  // 兜底：正文里出现了跟随在身边的宝可梦 → 亲密 +1（上限 50）
  const content = String(msg.mes || '').replace(/<UpdateVariable>[\s\S]*?(<\/UpdateVariable>|$)/gi, '').replace(/<pkm_state>[\s\S]*?<\/pkm_state>/gi, '');
  for (const where of ['slots', 'box']) (base.party[where] || []).forEach((bm, i) => {
    if (!hasMon(bm) || !bm.uid || bm.uid !== base.party.follow || touchedAv.has(where + ':' + i)) return;
    const names = [bm.nickname, bm.species, bm.name].filter(Boolean);
    if (!names.some(n => content.includes(n))) return;
    const bv = Number(avBase(bm).devotion) || 0; if (bv >= AUTO_AVS_CAP) return;
    (expAv[where + ':' + i] || (expAv[where + ':' + i] = {})).devotion = bv + 1;
  });
  for (const [id, e] of Object.entries(expAv)) {
    const [where, si] = id.split(':'); const i = Number(si);
    const bm = base.party[where][i], cm = pkm.party[where]?.[i];
    if (!hasMon(cm)) continue;
    if (bm.uid && cm.uid ? bm.uid !== cm.uid : (cm.species || cm.name) !== (bm.species || bm.name)) continue;
    if (!isObj(cm.friendship)) cm.friendship = { avs: {} };
    if (!isObj(cm.friendship.avs)) cm.friendship.avs = {};
    for (const [k, v] of Object.entries(e)) {
      const target = clampAv(v), cur = Number(cm.friendship.avs[k]), bv = Number(avBase(bm)[k]) || 0;
      if (cur !== target && (!Number.isFinite(cur) || cur === bv)) { cm.friendship.avs[k] = target; changed = true; }
    }
  }
  return changed;
}

function applySync(pkm, mesid, opts = {}) {
  if (opts.full) { const ops = parsePatchOps(chat()[mesid]?.mes); if (ops.length) applyOpsGeneric(pkm, ops); }
  const st = parseState(chat()[mesid]?.mes);
  let changed = !!opts.full;
  const present = [];
  if (!st) return reconcileBonds(pkm, mesid, present) || changed;
  const set = (obj, k, v) => { if (v != null && v !== '' && obj[k] !== v) { obj[k] = v; changed = true; } };
  set(pkm.world, 'location', st.地点); set(pkm.world, 'time', st.时间);
  if (/同行|小智|沙盒/.test(st.模式 || '')) set(pkm.world, 'mode', (st.模式.match(/(同行|小智|沙盒)模式/) || [])[0]);
  const names = String(st.在场 || '').split(/[、，,／/；;\s]+/).map(s => s.replace(/[（(].*?[)）]/g, '').trim()).filter(Boolean);
  if (names.length) for (const [key, r] of Object.entries(pkm.npcs.records)) {
    if (!isObj(r)) continue;
    const alias = new Set([r.name, String(r.name || '').replace(/小姐$|博士$/, ''), ...(K.NPC_ALIASES[key] || [])].filter(Boolean));
    if (key === 'meowth' && !names.some(n => /武藏|小次郎|火箭队/.test(n))) alias.delete('喵喵');
    if (names.some(n => alias.has(n))) {
      present.push(key);
      if (r.met !== true) { r.met = true; changed = true; }
      if (r.lastInteraction !== mesid) { r.lastInteraction = mesid; changed = true; }
    }
  }
  if (reconcileBonds(pkm, mesid, present)) changed = true;
  return changed;
}
function needsSync(mesid, opts) { const pkm = readPkm(); const a = applySync(pkm, mesid, opts); return ensureAllIndividuals(pkm) || a; }

/* ======================================================================
 * 6. 样式（ST 主页面 + 图鉴 iframe）
 * ==================================================================== */
const BASE_CSS = `
.pkb,.pkb *{box-sizing:border-box}
.pkb{font:13px/1.55 system-ui,"PingFang SC","Microsoft YaHei",sans-serif;color:#1d2433}
.pkb button{font:inherit;cursor:pointer;border:0;border-radius:999px;padding:6px 12px;background:#eef2ff;color:#1d2a5a;font-weight:650}
.pkb button:hover{filter:brightness(.96)}.pkb button:disabled{opacity:.45;cursor:default}
.pkb button.red{background:linear-gradient(180deg,#ff6b5a,#dc0a2d);color:#fff;box-shadow:0 2px 0 #7a0016}
.pkb button.blue{background:linear-gradient(180deg,#5aa0ff,#2f6fe0);color:#fff;box-shadow:0 2px 0 #183e8a}
.pkb button.ghost{background:transparent;color:inherit;border:1px solid currentColor;opacity:.85}
.pkb .pk-spr{width:48px;height:48px;object-fit:contain;image-rendering:pixelated;flex:none}
.pkb .pk-spr-ph{display:inline-grid;place-items:center;background:#e9edf5;border-radius:10px;color:#8a93a6}
.pkb .pk-item{width:28px;height:28px;image-rendering:pixelated;flex:none}.pkb .pk-item-e{width:28px;text-align:center;font-size:18px;flex:none}
.pkb .hp{height:6px;border-radius:9px;background:#d9dee8;overflow:hidden;margin-top:3px}.pkb .hp i{display:block;height:100%;background:#3fcf6b}
.pkb .hp i.mid{background:#f3c22b}.pkb .hp i.low{background:#ef4b4b}
.pkb .tag{display:inline-block;padding:0 7px;border-radius:9px;background:#eef2ff;color:#3a4a8a;font-size:11px;margin-left:4px;vertical-align:1px}
.pkb .tag.gold{background:#fff1c2;color:#8a5a00}.pkb .tag.pink{background:#ffe1ef;color:#a3175a}.pkb .tag.gray{background:#eceef3;color:#69707f}
.pkb .muted{color:#6b7385}.pkb .empty{padding:14px;text-align:center;color:#7d8597}
`;
const DEX_CSS = BASE_CSS + `
html,body{background:transparent!important}
.pkdex{margin:8px 0 4px;border-radius:18px;background:linear-gradient(160deg,#e3350d,#b3001b);padding:10px;box-shadow:0 3px 0 #6d0010,0 6px 18px rgba(0,0,0,.18)}
.pkdex-top{display:flex;align-items:center;gap:8px;color:#fff;margin:0 4px 8px}
.pkdex-lens{width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#bfe9ff,#2ca8ff 55%,#0b5fa8);border:3px solid #fff;flex:none}
.pkdex-dots i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;background:#ffd23f}.pkdex-dots i:nth-child(1){background:#ff5c5c}.pkdex-dots i:nth-child(3){background:#56d36b}
.pkdex-title{font-weight:800;letter-spacing:.08em}.pkdex-state{margin-left:auto;font-size:12px;opacity:.92;text-align:right}
.pkdex-screen{background:#f7f9fc;border-radius:12px;border:3px solid #2b2f38;padding:10px;min-height:120px}
.pkdex-tabs{display:flex;gap:4px;flex-wrap:wrap;margin:8px 2px 0}
.pkdex-tabs button{background:#7a0016;color:#ffd9de;padding:5px 11px;font-size:12px}.pkdex-tabs button.on{background:#fff;color:#b3001b}
.st-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:4px 12px;margin-bottom:8px;font-size:12.5px}
.st-grid b{color:#9a1028;font-weight:700;margin-right:4px}
.mon-row{display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px dashed #dde2ec}.mon-row:last-child{border:0}
.mon-row .grow{flex:1;min-width:0}.mon-row small{display:block;color:#6b7385;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.badges{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.badge{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:11px;color:#fff;font-weight:800;border:2px solid #2b2f38;opacity:.25;background:#aab}
.badge.on{opacity:1;box-shadow:0 0 0 2px #fff inset}
.dex-head{display:flex;gap:10px;align-items:center;margin-bottom:6px}.dex-num{font-size:22px;font-weight:800;color:#b3001b}
.dex-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:6px}
.dex-cell{background:#fff;border:1px solid #e1e5ee;border-radius:10px;text-align:center;padding:4px 2px;font-size:11.5px;position:relative}
.dex-cell .pk-spr{width:56px;height:56px}.dex-cell .ball{position:absolute;right:4px;top:4px;font-size:10px}
.bag-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px}
.bag-item{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #e1e5ee;border-radius:10px;padding:5px 8px}
.bag-item b{margin-left:auto;color:#b3001b}
.love-row{display:flex;align-items:center;gap:8px;padding:6px 2px;border-bottom:1px dashed #dde2ec}
.love-bar{flex:1;height:8px;border-radius:9px;background:#e6e9f0;position:relative;overflow:hidden}
.love-bar i{position:absolute;top:0;bottom:0;left:50%;background:#ff5f9e}.love-bar i.neg{background:#7b8ab8}
.map-wrap{position:relative}.map-wrap svg{width:100%;height:auto;display:block;background:#bfe6ff;border-radius:10px;border:2px solid #2b2f38}
.near-row{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e1e5ee;border-radius:12px;padding:6px 8px;margin-bottom:6px}
.near-row .grow{flex:1}.near-row .acts{display:flex;gap:6px}
.pk-note{font-size:11.5px;color:#6b7385;margin-top:6px}
.tog{font-size:11.5px;margin-left:auto}
`;
const HOST_CSS = BASE_CSS + `
#pkm-kanto-ball{position:fixed;right:14px;bottom:96px;z-index:3000;display:flex;align-items:flex-end;gap:2px;pointer-events:none}
#pkm-kanto-ball .orb{pointer-events:auto;width:50px;height:50px;border-radius:50%;border:3px solid #22201c;background:linear-gradient(#e3350d 0 45%,#22201c 45% 55%,#fff 55%);box-shadow:0 4px 12px rgba(0,0,0,.3);cursor:pointer;position:relative;padding:0;transition:transform .15s}
#pkm-kanto-ball .orb:hover{transform:rotate(-12deg) scale(1.05)}
#pkm-kanto-ball .orb:after{content:"";position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#fff;border:3px solid #22201c;box-sizing:border-box}
#pkm-kanto-ball .count{position:absolute;right:-4px;top:-4px;background:#2f6fe0;color:#fff;font:700 11px/18px system-ui;min-width:18px;height:18px;border-radius:9px;text-align:center;padding:0 4px}
#pkm-kanto-ball .follower{pointer-events:auto;max-width:72px;max-height:72px;image-rendering:pixelated;filter:drop-shadow(0 3px 2px rgba(0,0,0,.25));cursor:pointer;animation:pkb-bob 2.4s ease-in-out infinite}
@keyframes pkb-bob{50%{transform:translateY(-4px)}}
#pkm-kanto-ball .follower.hop{animation:pkb-hop .5s ease}
@keyframes pkb-hop{0%,100%{transform:none}30%{transform:translateY(-14px) scale(1.06)}60%{transform:translateY(0) scale(.97,1.03)}}
#pkm-kanto-ball .cry{position:absolute;right:58px;bottom:70px;pointer-events:none;background:#fff;color:#1d2433;border:2.5px solid #22201c;border-radius:14px;padding:5px 11px;font:700 13px/1.4 system-ui,"PingFang SC","Microsoft YaHei",sans-serif;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,.25);animation:pkb-cry 2.6s ease forwards}
#pkm-kanto-ball .cry:after{content:"";position:absolute;right:18px;bottom:-9px;border:8px solid transparent;border-top-color:#22201c;border-bottom:0}
@keyframes pkb-cry{0%{opacity:0;transform:translateY(6px) scale(.9)}10%{opacity:1;transform:none}85%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}
#pkm-kanto-ball .orb,#pkm-kanto-ball .follower{cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-user-drag:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
#pkm-kanto-ball.dragging .orb,#pkm-kanto-ball.dragging .follower{cursor:grabbing}
#pkm-kanto-ball.dragging .orb{transform:scale(1.1);transition:none;box-shadow:0 8px 20px rgba(0,0,0,.4)}
#pkm-kanto-ball.dragging .follower{animation:none;transform:translateY(-4px) scale(1.04)}
#pkm-kanto-ball .cry{width:max-content;max-width:min(240px,calc(100vw - 96px));white-space:normal}
#pkm-kanto-ball.pos-l .cry{right:auto;left:58px}
#pkm-kanto-ball.pos-l .cry:after{right:auto;left:18px}
#pkm-kanto-ball.pos-t .cry{bottom:auto;top:70px}
#pkm-kanto-ball.pos-t .cry:after{bottom:auto;top:-9px;border-top:0;border-bottom:8px solid #22201c}
#pkm-kanto-panel .hd button.pos{margin-left:auto;padding:3px 8px}
#pkm-kanto-panel .hd button.pos+button.mute{margin-left:4px}
#pkm-kanto-panel .vc{display:flex;align-items:center;flex-wrap:wrap;gap:4px 6px;margin:5px 0 3px;font-size:11.5px}
#pkm-kanto-panel .vc .vl{color:#6b7385;font-weight:650}
#pkm-kanto-panel .seg{display:inline-flex;flex-wrap:wrap;gap:2px;padding:2px;border-radius:999px;background:#eef1f7}
#pkm-kanto-panel .seg button{padding:2px 9px;font-size:11.5px;line-height:1.6;background:transparent;color:#4a5370;border-radius:999px;font-weight:650;box-shadow:none}
#pkm-kanto-panel .seg button.on{background:#dc0a2d;color:#fff;box-shadow:0 1px 0 #7a0016}
#pkm-kanto-panel .seg button.eff{background:#fff;color:#dc0a2d;box-shadow:inset 0 0 0 1.5px #ffb3bd}
#pkm-kanto-panel .vc .hear{padding:2px 9px;font-size:11px;line-height:1.6;background:#fff1c2;color:#8a5a00}
#pkm-kanto-panel .vc .vs{font-style:normal;font-size:10.5px;color:#8a93a6}
#pkm-kanto-panel .vc .vs.rec{color:#1d8a4a;font-weight:700}#pkm-kanto-panel .vc .vs.alt{color:#b26a00}
#pkm-kanto-panel .pk-snd{display:flex;flex-direction:column;gap:7px;margin-top:10px;padding:9px 10px;border-radius:12px;background:#f6f7fb;font-size:11.5px;color:#4a5370}
#pkm-kanto-panel .pk-snd .r{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px}
#pkm-kanto-panel .pk-snd .l{min-width:7.5em;color:#6b7385;font-weight:700}
#pkm-kanto-panel .pk-snd input[type=range]{flex:1;min-width:90px;accent-color:#dc0a2d}
#pkm-kanto-panel .pk-snd .vv{min-width:2em;text-align:right;color:#1d2433}
#pkm-kanto-panel .pk-snd .warn{color:#b26a00;font-size:11px;line-height:1.5}
#pkm-kanto-panel .pk-snd details.adv summary{cursor:pointer;color:#2f6fe0;font-weight:650}
#pkm-kanto-panel .pk-snd details.adv .r{margin-top:5px}
#pkm-kanto-panel .pk-snd details.adv input[type=text]{flex:1;min-width:140px;margin:0;font:inherit;font-size:11.5px;padding:4px 8px;border-radius:8px;border:1px solid #cfd6e4;background:#fff;color:#1d2433;height:auto}
#pkm-kanto-panel .pk-snd details.adv button{padding:3px 10px;font-size:11.5px}
#pkm-kanto-panel .pk-snd details.adv small{display:block;color:#8a93a6;margin-top:4px;line-height:1.5;word-break:break-all}
#pkm-kanto-panel .pk-note{font-size:11.5px;color:#6b7385;margin-top:6px}
#pkm-kanto-panel .mon small.mv{display:flex;flex-wrap:wrap;gap:3px 8px;color:#2a3350}#pkm-kanto-panel .mon small.mv i{font-style:normal;color:#8a93a6;font-size:10.5px}#pkm-kanto-panel .mon small.mv .low i{color:#dc0a2d;font-weight:700}
#pkm-kanto-panel .stx{margin-top:4px;font-size:11.5px}#pkm-kanto-panel .stx summary{cursor:pointer;color:#2f6fe0;font-weight:650}
#pkm-kanto-panel .stx .sg{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin:5px 0}
#pkm-kanto-panel .stx .sg span{background:#f3f5fa;border-radius:8px;padding:3px 6px;font-weight:700;color:#1d2433}#pkm-kanto-panel .stx .sg b{font-weight:600;color:#6b7385;margin-right:4px}
#pkm-kanto-panel .stx .sg em{display:block;font-style:normal;font-weight:500;font-size:10px;color:#8a93a6}
#pkm-kanto-panel .stx .sg .up{background:#fff0ee;color:#c62828}#pkm-kanto-panel .stx .sg .down{background:#eef4ff;color:#1e5bc6}
#pkm-kanto-panel .stx .bd2{display:grid;grid-template-columns:1fr 1fr;gap:3px 10px}#pkm-kanto-panel .stx .bd2 span{display:flex;align-items:center;gap:5px}
#pkm-kanto-panel .stx .bd2 b{font-weight:600;color:#6b7385;min-width:2em}#pkm-kanto-panel .stx .bd2 i{flex:1;height:6px;border-radius:4px;background:#e6e9f2;overflow:hidden}#pkm-kanto-panel .stx .bd2 u{display:block;height:100%;background:linear-gradient(90deg,#ff8fb1,#ff4d6d)}
#pkm-kanto-panel .hd button.mute{margin-left:auto;padding:3px 8px}#pkm-kanto-panel .hd button.mute+button{margin-left:4px}
#pkm-kanto-panel{position:fixed;right:14px;bottom:156px;z-index:3001;width:min(380px,calc(100vw - 28px));max-height:min(70vh,620px);overflow:auto;background:#fff;border-radius:16px;border:3px solid #22201c;box-shadow:0 10px 30px rgba(0,0,0,.35)}
#pkm-kanto-panel .hd{position:sticky;top:0;background:linear-gradient(135deg,#dc0a2d,#ff5a3c);color:#fff;padding:9px 12px;display:flex;align-items:center;gap:8px;font-weight:800;z-index:1}
#pkm-kanto-panel .hd button{margin-left:auto;background:rgba(255,255,255,.2);color:#fff;padding:3px 10px}
#pkm-kanto-panel .tabs{display:flex;gap:4px;padding:8px 10px 0}#pkm-kanto-panel .tabs button.on{background:#dc0a2d;color:#fff}
#pkm-kanto-panel .bd{padding:8px 10px 12px}
#pkm-kanto-panel .mon{display:flex;gap:8px;align-items:center;padding:7px 4px;border-bottom:1px dashed #e1e5ee}
#pkm-kanto-panel .mon .grow{flex:1;min-width:0}#pkm-kanto-panel .mon small{display:block;color:#6b7385;font-size:11.5px}
#pkm-kanto-panel .mon .acts{display:flex;flex-direction:column;gap:4px}#pkm-kanto-panel .mon .acts button{padding:3px 9px;font-size:11.5px}
#pkm-kanto-modal{position:fixed;inset:0;z-index:4000;background:rgba(12,14,24,.72);display:flex;flex-direction:column;backdrop-filter:blur(2px)}
#pkm-kanto-modal .bar{display:flex;align-items:center;gap:10px;padding:8px 12px;background:linear-gradient(135deg,#1a2350,#2c3c8c);color:#fff;flex:none}
#pkm-kanto-modal .bar .t{font-weight:800}#pkm-kanto-modal .bar .s{font-size:12px;opacity:.85;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#pkm-kanto-modal iframe{flex:1;width:100%;border:0;background:#141a33}
#pkm-kanto-modal .bar .fmt{flex:none;font-size:12px;font-weight:800;padding:2px 10px;border-radius:999px;background:#ffcb05;color:#1b2a5c;white-space:nowrap}
#pkm-kanto-modal .stage{flex:1;min-height:0}
#pkm-kanto-modal .stage.pick{overflow:auto;padding:18px 12px;display:flex;justify-content:center;align-items:flex-start}
#pkm-kanto-modal .pk-pickbox{width:min(660px,100%);background:#fff;border-radius:16px;border:3px solid #22201c;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
#pkm-kanto-modal .pk-pickbox h3{margin:0 0 4px;font-size:17px;color:#1b2a5c}
#pkm-kanto-modal .pk-pickbox p{margin:0 0 10px;color:#4a5370;font-size:12.5px;line-height:1.65}
#pkm-kanto-modal .pk-pickgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
#pkm-kanto-modal .pk-pick{position:relative;display:flex;flex-direction:column;align-items:center;gap:1px;padding:8px 6px 10px;border-radius:14px;background:#f6f7fb;color:#1d2433;border:2px solid #e1e5ee;font-weight:650;text-align:center;box-shadow:none}
#pkm-kanto-modal .pk-pick.on{border-color:#dc0a2d;background:#fff4f2;box-shadow:0 0 0 3px rgba(220,10,45,.15)}
#pkm-kanto-modal .pk-pick em{position:absolute;left:6px;top:6px;width:22px;height:22px;border-radius:50%;background:#dc0a2d;color:#fff;font:800 12px/22px system-ui;font-style:normal}
#pkm-kanto-modal .pk-pick small{color:#6b7385;font-size:11px;font-weight:500}
#pkm-kanto-modal .pk-pick .hp{width:80%}
#pkm-kanto-modal .pk-pick:disabled{opacity:.45}
#pkm-kanto-modal .pk-pickfoot{display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap}
#pkm-kanto-modal .pk-pickfoot span{margin-right:auto;color:#4a5370;font-weight:700}
#pkm-kanto-modal .pk-pickalt{margin-top:10px;padding:8px 10px;border-radius:10px;background:#fff6e0;color:#6b4b00;font-size:12.5px;line-height:1.8}
#pkm-kanto-modal .pk-pickalt button{margin:0 4px;padding:3px 10px;font-size:12px}
#pkm-kanto-modal .res{max-width:560px;margin:40px auto;background:#fff;border-radius:16px;padding:18px;white-space:pre-wrap}
#pkm-kanto-toast{position:fixed;left:50%;bottom:120px;transform:translateX(-50%) translateY(20px);opacity:0;z-index:5000;background:#1d2433;color:#fff;padding:9px 16px;border-radius:12px;font:13px system-ui;transition:.25s;pointer-events:none}
#pkm-kanto-toast.show{opacity:1;transform:translateX(-50%)}
.pkm-setup{border-radius:16px;overflow:hidden;border:2px solid #22201c;background:#f7f9fc;max-width:680px}
.pkm-setup .hd{background:linear-gradient(130deg,#102a5c,#1b3a7a);color:#eaf1ff;padding:16px 18px}
.pkm-setup .hd h3{margin:0;font-size:19px;letter-spacing:.12em;color:#fff}.pkm-setup .hd p{margin:6px 0 0;font-size:12.5px;color:#b9c9ef}
.pkm-setup .steps{display:flex;gap:4px;margin-top:10px}.pkm-setup .steps i{flex:1;height:4px;border-radius:4px;background:rgba(255,255,255,.2)}.pkm-setup .steps i.on{background:#ffcb05}
.pkm-setup .bd{padding:14px 18px}
.pkm-setup .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.pkm-setup .card{border:2px solid #dfe4ee;border-radius:14px;padding:10px;background:#fff;cursor:pointer;text-align:left;font:inherit;color:inherit}
.pkm-setup .card.on{border-color:#dc0a2d;box-shadow:0 0 0 3px #ffd5dc}
.pkm-setup .card b{display:block;font-size:14px;margin:2px 0}.pkm-setup .card small{color:#6b7385;font-size:12px;line-height:1.5;display:block}
.pkm-setup .card .pk-spr{width:72px;height:72px;display:block;margin:0 auto}
.pkm-setup label.f{display:block;margin:8px 0 2px;font-weight:650;font-size:12.5px}
.pkm-setup input[type=text],.pkm-setup select,.pkm-setup textarea{width:100%;padding:7px 10px;border-radius:10px;border:1.5px solid #cfd6e4;font:inherit;background:#fff;color:#1d2433}
.pkm-setup .seg{display:flex;gap:6px}.pkm-setup .seg button.on{background:#dc0a2d;color:#fff}
.pkm-setup .ft{display:flex;gap:8px;justify-content:flex-end;padding:0 18px 16px}
.pkm-setup .sum{background:#fff;border:1px solid #e1e5ee;border-radius:12px;padding:10px 12px}
.pkm-setup .err{color:#c0182f;font-size:12.5px;margin-top:6px}
/* ---------- v1.3.3 开局美化界面 ---------- */
.pko{all:initial;display:block;box-sizing:border-box;width:100%;max-width:880px;margin:4px 0;border-radius:18px;overflow:hidden;position:relative;isolation:isolate;container-type:inline-size;font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif;font-size:14px;line-height:1.6;color:#1f2740;text-align:left;box-shadow:0 18px 50px rgba(10,16,40,.28);border:0}
.pko *,.pko *:before,.pko *:after{box-sizing:border-box}
.pko img{max-width:none;margin:0;border:0}
.pko p,.pko h1,.pko h2,.pko h3,.pko ul{margin:0;padding:0}
.pko button{font-family:inherit;cursor:pointer;border:0;margin:0;line-height:1.35;text-align:left;color:inherit;box-shadow:none;filter:none}
.pko button:disabled{opacity:.42;cursor:not-allowed}
.pko .pko-ball-ico{display:inline-block;width:16px;height:16px;border-radius:50%;background:linear-gradient(#e3350d 0 46%,#222 46% 54%,#fff 54%);box-shadow:inset 0 0 0 2px #222;position:relative;flex:none;vertical-align:-3px}
.pko .pko-ball-ico:after{content:"";position:absolute;inset:5px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px #222}
.pko .pko-eyebrow{font-size:10.5px;letter-spacing:3px;font-weight:700;color:#d1324a}
.pko .pko-eyebrow.light{color:#ffd84d}
/* 标题封面 */
.pko-title{min-height:560px;background:#1a1426;color:#fff}
.pko-title .pko-hero-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:28% 50%;z-index:-3;transform:scale(1.04);animation:pkoZoom 18s ease-in-out infinite alternate}
@keyframes pkoZoom{to{transform:scale(1.1) translateX(-1.5%)}}
.pko-title .pko-hero-wash{position:absolute;inset:0;z-index:-2;background:linear-gradient(270deg,rgba(18,12,34,.94) 0%,rgba(18,12,34,.82) 34%,rgba(18,12,34,.25) 62%,rgba(18,12,34,0) 80%),linear-gradient(0deg,rgba(14,10,28,.85) 0%,rgba(14,10,28,0) 30%)}
.pko-title:after{content:"";position:absolute;inset:12px;border:1px solid rgba(255,216,77,.35);border-radius:12px;pointer-events:none;z-index:4}
.pko .pko-balls{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:-1}
.pko .pko-balls i{position:absolute;left:var(--x);bottom:-30px;width:var(--s);height:var(--s);border-radius:50%;background:linear-gradient(rgba(255,90,70,.75) 0 45%,rgba(30,30,30,.7) 45% 55%,rgba(255,255,255,.75) 55%);opacity:.55;animation:pkoRise var(--d) linear infinite;animation-delay:var(--dl)}
@keyframes pkoRise{to{transform:translate(40px,-640px) rotate(540deg);opacity:0}}
.pko .pko-topline{display:flex;justify-content:space-between;align-items:center;padding:22px 34px;position:relative;z-index:5}
.pko .pko-brand{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:800;letter-spacing:4px;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.5)}
.pko .pko-quiet{background:rgba(255,255,255,.12);color:#fff;padding:7px 14px;border-radius:999px;font-size:12px;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,.25)}
.pko .pko-quiet:hover{background:rgba(255,255,255,.22)}
.pko .pko-vert{position:absolute;left:30px;top:120px;writing-mode:vertical-rl;font-size:15px;letter-spacing:7px;line-height:1.9;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.6);z-index:2;opacity:.92}
.pko .pko-hero-content{margin-left:auto;width:50%;padding:18px 44px 30px 0;position:relative;z-index:3}
.pko .pko-ribbon{display:flex;align-items:center;gap:10px;font-size:11px;letter-spacing:3px;color:#ffd84d}
.pko .pko-ribbon:before{content:"";width:28px;height:1px;background:#ffd84d}
.pko .pko-logo{display:block;width:min(300px,100%);height:auto;margin:16px 0 0;filter:drop-shadow(0 4px 10px rgba(0,0,0,.45))}
.pko .pko-cn-title{font-size:40px;font-weight:900;letter-spacing:12px;margin:2px 0 12px;color:#fff;text-shadow:0 3px 0 #2a5bd7,0 6px 18px rgba(0,0,0,.5);line-height:1.2}
.pko .pko-quote{font-size:15px;line-height:1.9;letter-spacing:1px;color:rgba(255,255,255,.88);margin-bottom:22px}
.pko .pko-menu{display:grid;gap:10px;max-width:300px}
.pko .pko-menu button{display:flex;align-items:center;gap:15px;width:100%;padding:14px 18px;border-radius:12px;transition:transform .2s,box-shadow .2s}
.pko .pko-menu button:hover{transform:translateX(5px)}
.pko .pko-menu .n{font-size:11px;letter-spacing:2px;opacity:.7}
.pko .pko-menu b{display:block;font-size:17px;letter-spacing:4px}
.pko .pko-menu small{display:block;font-size:9.5px;letter-spacing:2.5px;opacity:.75;margin-top:2px}
.pko .pko-menu i{margin-left:auto;font-style:normal;font-size:18px}
.pko .pko-primary{background:linear-gradient(135deg,#ff5a4a,#dc0a2d);color:#fff;box-shadow:0 8px 22px rgba(220,10,45,.45)}
.pko .pko-second{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.3)!important;backdrop-filter:blur(4px)}
.pko .pko-meta{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:20px;font-size:11px;letter-spacing:1px;color:rgba(255,255,255,.75)}
.pko .pko-meta span{display:inline-flex;align-items:center;gap:6px}
.pko .pko-meta span:before{content:"";width:5px;height:5px;border-radius:50%;background:#ffd84d}
.pko .pko-about{position:relative;z-index:5;margin:0 34px 6px auto;width:min(560px,calc(100% - 68px));background:rgba(14,12,30,.82);border:1px solid rgba(255,216,77,.35);border-radius:14px;padding:14px 18px;backdrop-filter:blur(6px);font-size:13px;color:#f2eefc}
.pko .pko-about ul{list-style:none;margin-top:6px;display:grid;gap:5px}
.pko .pko-hero-footer{display:flex;justify-content:space-between;gap:10px;padding:14px 34px 20px;font-size:10.5px;letter-spacing:2px;color:rgba(255,255,255,.7);position:relative;z-index:5}
.pko .pko-credit{position:absolute;left:34px;bottom:4px;font-size:8.5px;letter-spacing:.5px;color:rgba(255,255,255,.4);z-index:5}
/* 向导 */
.pko-wiz{background:#f6f7fb;color:#1f2740}
.pko .pko-wtop{display:flex;align-items:center;gap:14px;padding:14px 22px;background:linear-gradient(120deg,#1b2a5c,#24398a);color:#fff;flex-wrap:wrap}
.pko .pko-home{display:flex;align-items:center;gap:8px;background:transparent;color:#fff;font-weight:800;letter-spacing:3px;font-size:13px;padding:4px 2px}
.pko .pko-steps{display:flex;gap:6px;margin-left:auto;flex-wrap:wrap}
.pko .pko-step{display:flex;align-items:center;gap:7px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.7);padding:6px 12px 6px 6px;border-radius:999px;font-size:12px}
.pko .pko-step span{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.18);font-size:11px;font-weight:800}
.pko .pko-step.on{background:#ffcb05;color:#1b2a5c;font-weight:800}.pko .pko-step.on span{background:#1b2a5c;color:#ffcb05}
.pko .pko-step.done{color:#fff}.pko .pko-step.done span{background:#3fbf6b;color:#fff}
.pko .pko-step:disabled{opacity:.8;cursor:default}
.pko .pko-main{padding:22px 26px 8px}
.pko .pko-h2{font-size:23px;font-weight:900;letter-spacing:2px;color:#1b2a5c;margin:6px 0 4px;line-height:1.35}
.pko .pko-sub{font-size:13px;color:#5d6680;margin-bottom:16px}.pko .pko-sub b{color:#d1324a}
.pko .pko-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 26px 22px}
.pko .pko-outline{background:#fff;color:#3a4566;border:1.5px solid #cfd5e4!important;padding:11px 18px;border-radius:10px;font-size:13.5px}
.pko .pko-go{background:linear-gradient(135deg,#ff5a4a,#dc0a2d);color:#fff;padding:11px 22px;border-radius:10px;font-weight:800;letter-spacing:1px;font-size:13.5px;box-shadow:0 6px 16px rgba(220,10,45,.3)}
.pko .pko-go.big{padding:13px 34px;font-size:16px;letter-spacing:4px}
.pko .pko-go:hover,.pko .pko-outline:hover{filter:brightness(1.05)}
.pko .pko-check{position:absolute;top:10px;right:10px;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:#dc0a2d;color:#fff;font-weight:900;font-size:14px;opacity:0;transform:scale(.6);transition:.2s;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.pko .on>.pko-check{opacity:1;transform:none}
/* 模式卡 */
.pko .pko-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.pko .pko-mode{position:relative;display:flex;flex-direction:column;background:#fff;border-radius:14px;overflow:hidden;border:2px solid #e2e6f0!important;transition:transform .2s,box-shadow .2s,border-color .2s;padding:0}
.pko .pko-mode:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(27,42,92,.14)}
.pko .pko-mode.on{border-color:#dc0a2d!important;box-shadow:0 0 0 4px rgba(220,10,45,.14),0 12px 26px rgba(27,42,92,.16)}
.pko .pko-mode-art{position:relative;display:block;aspect-ratio:16/9;background:#c9d3ea;overflow:hidden}
.pko .pko-mode-art img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s}
.pko .pko-mode:hover .pko-mode-art img{transform:scale(1.06)}
.pko .pko-mode-art em{position:absolute;left:10px;top:10px;font-style:normal;font-size:11px;font-weight:800;padding:2px 9px;border-radius:999px;background:#ffcb05;color:#1b2a5c}
.pko .pko-mode-head{display:flex;flex-direction:column;padding:10px 14px 0}
.pko .pko-mode-head b{font-size:16px;color:#1b2a5c;letter-spacing:1px}
.pko .pko-mode-head i{font-style:normal;font-size:9.5px;letter-spacing:2.5px;color:#8a93ad;font-weight:700}
.pko .pko-mode-time{display:block;margin:6px 14px 0;font-size:11px;color:#d1324a;font-weight:700}
.pko .pko-mode-desc{display:block;padding:4px 14px 8px;font-size:12px;line-height:1.65;color:#4d5672;flex:1}
.pko .pko-mode-pk{display:flex;align-items:center;gap:2px;padding:6px 12px 10px;border-top:1px dashed #e2e6f0;margin:0 12px;align-self:stretch;padding-left:0;padding-right:0}
.pko .pko-mode-pk img{width:34px;height:34px;object-fit:contain}
.pko .pko-mode-pk small{margin-left:auto;font-size:10.5px;color:#8a93ad}
/* 档案 + 执照 */
.pko .pko-profile{display:grid;grid-template-columns:1fr 1.1fr;gap:18px;align-items:start}
.pko .pko-f{display:block;margin:10px 0 4px;font-weight:800;font-size:12.5px;color:#1b2a5c}.pko .pko-f small{font-weight:400;color:#8a93ad}
.pko .pko-in{display:block;width:100%;padding:9px 12px;border-radius:10px;border:1.5px solid #cfd6e4;font:inherit;font-size:14px;background:#fff!important;color:#1d2433!important;margin:0;outline:none;box-shadow:none;height:auto}
.pko .pko-in:focus{border-color:#2a5bd7;box-shadow:0 0 0 3px rgba(42,91,215,.15)}
.pko .pko-in:disabled{background:#eef1f7!important;color:#7a839b!important}
.pko .pko-seg{display:flex;gap:8px}
.pko .pko-seg button{flex:1;text-align:center;padding:9px 0;border-radius:10px;background:#fff;border:1.5px solid #cfd6e4!important;font-weight:700;color:#3a4566}
.pko .pko-seg button.on{background:#1b2a5c;color:#fff;border-color:#1b2a5c!important}
.pko .pko-note{margin-top:10px;font-size:12px;color:#6b7390;background:#eef2fb;border-radius:10px;padding:8px 12px}
.pko .pko-license{position:relative;border-radius:16px;overflow:hidden;background-size:cover;background-position:center;border:2px solid #1b2a5c;box-shadow:0 10px 24px rgba(27,42,92,.18)}
.pko .pko-lic-top{display:flex;align-items:center;gap:8px;padding:9px 14px;background:linear-gradient(90deg,#dc0a2d,#ff5a4a);color:#fff;font-size:11.5px;font-weight:800;letter-spacing:2px}
.pko .pko-lic-top em{margin-left:auto;font-style:normal;font-family:ui-monospace,monospace;letter-spacing:1px;opacity:.9}
.pko .pko-lic-body{display:flex;gap:12px;padding:12px 14px}
.pko .pko-lic-photo{flex:none;width:96px;height:112px;border-radius:12px;background:radial-gradient(circle at 50% 60%,#fff 0,#e6ecf8 70%);border:1.5px solid #c7d0e4;display:grid;place-items:center;overflow:hidden}
.pko .pko-lic-photo img{width:92px;height:92px;object-fit:contain}
.pko .pko-lic-f{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;min-width:0}
.pko .pko-lic-f div{min-width:0}.pko .pko-lic-f .w{grid-column:1/-1}
.pko .pko-lic-f small{display:block;font-size:10px;color:#7a839b;letter-spacing:1px}
.pko .pko-lic-f b{display:block;font-size:13.5px;color:#1b2a5c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pko .pko-lic-foot{padding:6px 14px;font-size:10px;letter-spacing:2px;color:#fff;background:#1b2a5c}
/* 初始伙伴 */
.pko .pko-starters{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.pko .pko-starters.c1{grid-template-columns:minmax(0,320px);justify-content:center}
.pko .pko-starters.c4{grid-template-columns:repeat(4,1fr)}
.pko .pko-starter{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;padding:12px 12px 14px;border-radius:16px;background:linear-gradient(180deg,color-mix(in srgb,var(--c) 22%,#fff) 0%,#fff 62%);border:2px solid #e2e6f0!important;transition:transform .2s,box-shadow .2s}
.pko .pko-starter:hover{transform:translateY(-4px);box-shadow:0 12px 24px rgba(27,42,92,.15)}
.pko .pko-starter.on{border-color:var(--c)!important;box-shadow:0 0 0 4px color-mix(in srgb,var(--c) 30%,transparent),0 12px 26px rgba(27,42,92,.16)}
.pko .pko-st-no{align-self:flex-start;font-size:10.5px;font-weight:800;letter-spacing:1px;color:#8a93ad;font-family:ui-monospace,monospace}
.pko .pko-st-art{display:grid;place-items:center;width:100%;aspect-ratio:1/1;max-height:150px}
.pko .pko-st-art img{width:min(140px,100%);height:auto;max-height:140px;object-fit:contain;filter:drop-shadow(0 8px 10px rgba(0,0,0,.18));transition:transform .3s}
.pko .pko-starter.on .pko-st-art img{animation:pkoHop 1.6s ease-in-out infinite}
@keyframes pkoHop{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
.pko .pko-starter b{font-size:16px;color:#1b2a5c;margin-top:2px}.pko .pko-starter b small{font-size:11px;color:#8a93ad;font-weight:600}
.pko .pko-st-types{display:flex;gap:4px;justify-content:center;margin:5px 0}
.pko .pko-type{display:inline-block;padding:1px 9px;border-radius:999px;color:#fff;font-size:11px;font-weight:800;letter-spacing:1px;text-shadow:0 1px 1px rgba(0,0,0,.2)}
.pko .pko-st-desc{font-size:11.5px;line-height:1.6;color:#59627d}
.pko .pko-nick{max-width:340px;margin-top:6px}
/* 确认 */
.pko .pko-confirm{display:grid;grid-template-columns:200px 1fr;gap:16px;align-items:center}
.pko .pko-cf-partner{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border-radius:16px;padding:12px;background:radial-gradient(circle at 50% 40%,color-mix(in srgb,var(--c) 35%,#fff) 0%,#fff 72%);border:2px solid color-mix(in srgb,var(--c) 55%,#fff)}
.pko .pko-cf-partner img{width:150px;height:150px;object-fit:contain;filter:drop-shadow(0 10px 12px rgba(0,0,0,.2));animation:pkoHop 1.8s ease-in-out infinite}
.pko .pko-cf-partner b{font-size:16px;color:#1b2a5c}.pko .pko-cf-partner span{display:flex;gap:4px;align-items:center;font-size:12px;color:#6b7390}
.pko .pko-cf-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.pko .pko-cf-list span{background:#fff;border:1px solid #e1e5ee;border-radius:999px;padding:5px 12px;font-size:12px;color:#3a4566}
.pko .pko-err{margin-top:10px;color:#c0182f;font-size:12.5px;font-weight:700}
/* 已登记 */
.pko-done{min-height:150px;background:#1b2a5c;color:#fff}
.pko .pko-done-art{position:absolute;inset:0;background-size:cover;background-position:30% 50%;z-index:-2}
.pko .pko-done-wash{position:absolute;inset:0;z-index:-1;background:linear-gradient(270deg,rgba(18,22,52,.95) 0%,rgba(18,22,52,.85) 50%,rgba(18,22,52,.35) 100%)}
.pko .pko-done-body{display:flex;align-items:center;gap:16px;padding:18px 24px;margin-left:auto;max-width:620px}
.pko .pko-done-body h3{font-size:22px;font-weight:900;letter-spacing:3px;color:#fff;margin:2px 0}
.pko .pko-done-body p{font-size:13px;color:rgba(255,255,255,.88)}
.pko .pko-done-body small{display:block;margin-top:6px;font-size:11.5px;line-height:1.7;color:rgba(255,255,255,.65)}
.pko .pko-done-mon{width:104px;height:104px;object-fit:contain;flex:none;padding:6px;border-radius:50%;background:radial-gradient(circle,rgba(255,216,77,.28) 0,rgba(255,216,77,.08) 55%,transparent 72%);filter:drop-shadow(0 6px 10px rgba(0,0,0,.45))}
/* 窄屏（按聊天气泡宽度） */
@container (max-width:640px){
  .pko-title{min-height:0}
  .pko .pko-hero-art{object-position:22% 50%}
  .pko-title .pko-hero-wash{background:linear-gradient(0deg,rgba(14,10,28,.96) 0%,rgba(14,10,28,.88) 46%,rgba(14,10,28,.2) 72%,rgba(14,10,28,.05) 100%)}
  .pko .pko-topline{padding:16px 20px}
  .pko .pko-vert{display:none}
  .pko .pko-hero-content{width:auto;margin:0;padding:150px 22px 18px}
  .pko .pko-cn-title{font-size:32px;letter-spacing:8px}
  .pko .pko-menu{max-width:none}
  .pko .pko-about{margin:0 16px 8px;width:auto}
  .pko .pko-hero-footer{padding:12px 20px 20px;font-size:9.5px}.pko .pko-credit{left:20px}
  .pko .pko-steps{margin-left:0}.pko .pko-step{font-size:0;padding:4px}.pko .pko-step span{font-size:11px}.pko .pko-step.on{font-size:12px;padding-right:10px}
  .pko .pko-main{padding:18px 16px 6px}.pko .pko-foot{padding:12px 16px 18px}
  .pko .pko-modes,.pko .pko-profile,.pko .pko-confirm{grid-template-columns:1fr}
  .pko .pko-mode{flex-direction:column}
  .pko .pko-starters.c4{grid-template-columns:repeat(2,1fr)}
  .pko .pko-starters.c3{gap:8px}.pko .pko-starters.c3 .pko-st-desc{display:none}.pko .pko-starters.c3 .pko-starter{padding:8px 6px 10px}.pko .pko-starters.c3 .pko-starter b{font-size:14px}
  .pko .pko-starters .pko-check{width:22px;height:22px;font-size:12px;top:6px;right:6px}
  .pko .pko-mode-art{aspect-ratio:21/9}
  .pko .pko-credit{position:static;display:block;padding:0 20px 14px}.pko .pko-hero-footer{padding-bottom:6px}.pko .pko-hero-footer span+span{display:none}
  .pko .pko-lic-top{letter-spacing:1px}.pko .pko-lic-cn{display:none}
  .pko .pko-cf-partner{flex-direction:row;gap:12px;flex-wrap:wrap}.pko .pko-cf-partner img{width:100px;height:100px}
  .pko .pko-starters.c1{grid-template-columns:minmax(0,260px)}
  .pko .pko-h2{font-size:19px}
  .pko .pko-done-body{padding:16px}.pko .pko-done-mon{width:72px;height:72px}
}
/* v1.3.0 机制修复卡：队伍蓝卡 / 仓库绿格 / 详情布局，按已确认预览恢复 */
#pkm-kanto-panel{position:fixed;z-index:99991;width:min(760px,94vw);height:min(560px,82vh);right:90px;bottom:60px;display:none;flex-direction:column;
 font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;color:#1d2433;border-radius:18px;overflow:hidden;
 background:linear-gradient(180deg,#2f80d1 0%,#1d5fa8 100%);box-shadow:0 18px 50px rgba(0,0,0,.55),inset 0 0 0 3px #11406f}
#pkm-kanto-panel.show{display:flex;animation:pkPop .18s ease-out}
@keyframes pkPop{from{opacity:0;transform:scale(.94) translateY(10px)}}
#pkm-kanto-panel *{box-sizing:border-box}
#pkm-kanto-panel .pb-head{display:flex;align-items:center;gap:12px;padding:10px 12px;color:#fff;background:repeating-linear-gradient(135deg,rgba(255,255,255,.06) 0 10px,transparent 10px 20px)}
#pkm-kanto-panel .pb-head h3{margin:0;font-size:16px;letter-spacing:1px;flex:1;min-width:0;display:flex;align-items:center;gap:8px}
#pkm-kanto-panel .pb-head h3 i{width:18px;height:18px;border-radius:50%;border:2px solid #1c1c1c;background:linear-gradient(#ee1515 0 45%,#1c1c1c 45% 55%,#fff 55%);display:inline-block;flex:none}
#pkm-kanto-panel .pb-tools{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex:none;min-width:0}
#pkm-kanto-panel .pb-tabs{display:flex;align-items:center;background:rgba(0,0,0,.2);border-radius:10px;padding:3px;flex:none}
#pkm-kanto-panel .pb-tabs button{border:0;background:none;color:#cfe3ff;font-weight:800;font-size:13px;padding:6px 14px;border-radius:8px;cursor:pointer;font-family:inherit;white-space:nowrap}
#pkm-kanto-panel .pb-tabs button.on{background:#fff;color:#1d5fa8}
#pkm-kanto-panel .pb-icons{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:none}
#pkm-kanto-panel .pb-x{border:0;background:rgba(0,0,0,.25);color:#fff;width:34px;height:34px;flex:0 0 34px;border-radius:50%;cursor:pointer;font-size:16px;padding:0;line-height:1;display:inline-flex;align-items:center;justify-content:center}
#pkm-kanto-panel .pb-x svg{display:block;width:18px;height:18px;flex:none}
#pkm-kanto-panel .pb-body{flex:1;display:flex;gap:10px;padding:0 10px 10px;min-height:0}
#pkm-kanto-panel .pb-left{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0}
#pkm-kanto-panel .pb-right{width:300px;flex:none;background:#f5f8fc;border-radius:14px;overflow:auto;position:relative}
/* 队伍 */
#pkm-kanto-panel .party{display:grid;grid-template-columns:1fr 1fr;gap:8px;overflow:auto;padding:2px}
#pkm-kanto-panel .slot{background:linear-gradient(180deg,#5cc6ff,#2d95e0);border-radius:14px 30px 14px 14px;padding:8px 10px;color:#fff;cursor:pointer;display:grid;grid-template-columns:62px 1fr;gap:6px;align-items:center;border:3px solid transparent;position:relative;box-shadow:0 3px 0 rgba(0,0,0,.25);min-height:84px}
#pkm-kanto-panel .slot.lead{background:linear-gradient(180deg,#ffd75a,#f3a712);color:#3b2600}
#pkm-kanto-panel .slot.sel{border-color:#fff;box-shadow:0 0 0 3px #ffcb05,0 3px 0 rgba(0,0,0,.25)}
#pkm-kanto-panel .slot.faint{background:linear-gradient(180deg,#d26a6a,#9d3535)}
#pkm-kanto-panel .slot.empty{background:rgba(255,255,255,.12);border:2px dashed rgba(255,255,255,.35);box-shadow:none;cursor:default;display:grid;place-items:center;grid-template-columns:1fr;color:#cfe3ff;font-size:13px}
#pkm-kanto-panel .slot img{width:66px;height:66px;object-fit:scale-down;margin:-6px -4px}
#pkm-kanto-panel .slot .n{font-weight:900;font-size:14px;display:flex;justify-content:space-between;gap:4px}
#pkm-kanto-panel .slot .n span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#pkm-kanto-panel .slot .g{font-size:13px;font-weight:900}
#pkm-kanto-panel .slot .g.f{color:#ff5fa2}#pkm-kanto-panel .slot .g.m{color:#1d4fd8}
#pkm-kanto-panel .slot .lvl{font-size:12px;font-weight:800;opacity:.9}
#pkm-kanto-panel .hp{display:flex;align-items:center;gap:4px;margin-top:3px;font-size:10px;font-weight:900}
#pkm-kanto-panel .hp i{flex:1;height:7px;background:#2b2b2b;border-radius:4px;padding:1px;display:block}
#pkm-kanto-panel .hp i b{display:block;height:100%;border-radius:3px;background:#4be07a}
#pkm-kanto-panel .hp i b.mid{background:#ffd93b}#pkm-kanto-panel .hp i b.low{background:#ff4b4b}
#pkm-kanto-panel .hpn{font-size:11px;text-align:right;font-weight:800;margin-top:1px}
#pkm-kanto-panel .stt{position:absolute;left:8px;bottom:6px;font-size:10px;font-weight:900;border-radius:4px;padding:0 4px;background:#a040a0;color:#fff}
#pkm-kanto-panel .lead-tag{position:absolute;right:12px;top:-8px;background:#dc0a2d;color:#fff;font-size:10px;font-weight:900;border-radius:6px;padding:1px 6px;border:2px solid #fff}
/* 仓库 */
#pkm-kanto-panel .box-top{display:flex;align-items:center;gap:6px;color:#fff;margin-bottom:6px}
#pkm-kanto-panel .box-top button{border:0;background:rgba(0,0,0,.25);color:#fff;width:30px;height:30px;border-radius:8px;cursor:pointer;font-weight:900}
#pkm-kanto-panel .box-top .bn{flex:1;text-align:center;background:#7cc2a8;color:#123a2c;border-radius:10px;padding:5px;font-weight:900;font-size:14px;box-shadow:inset 0 -3px 0 rgba(0,0,0,.15)}
#pkm-kanto-panel .box-top small{opacity:.8;font-size:12px}
#pkm-kanto-panel .boxgrid{flex:1;background:linear-gradient(180deg,#a9dcc4,#7fc2a6);border-radius:14px;padding:8px;display:grid;grid-template-columns:repeat(6,1fr);grid-auto-rows:minmax(58px,1fr);gap:4px;overflow:auto;box-shadow:inset 0 0 0 3px rgba(0,0,0,.08)}
#pkm-kanto-panel .bx{border-radius:10px;background:rgba(255,255,255,.35);display:grid;place-items:center;cursor:pointer;position:relative}
#pkm-kanto-panel .bx:hover{background:rgba(255,255,255,.65)}
#pkm-kanto-panel .bx.sel{background:#fff;box-shadow:0 0 0 3px #ffcb05}
#pkm-kanto-panel .bx.e{background:rgba(255,255,255,.15);cursor:default}
#pkm-kanto-panel .bx img{width:56px;height:56px;object-fit:scale-down}
#pkm-kanto-panel .bx small{position:absolute;bottom:1px;right:4px;font-size:10px;font-weight:900;color:#1d4a3a}
/* 详情 */
#pkm-kanto-panel .dt-empty{height:100%;display:grid;place-items:center;text-align:center;color:#8a96a8;font-size:13px;padding:20px;line-height:1.8}
#pkm-kanto-panel .dt-top{background:linear-gradient(180deg,#e8f2ff,#f5f8fc);padding:10px 12px 4px;text-align:center;position:relative}
#pkm-kanto-panel .dt-top img{width:110px;height:110px;object-fit:contain;margin:-8px 0 -10px}
#pkm-kanto-panel .dt-name{font-size:18px;font-weight:900}
#pkm-kanto-panel .dt-name small{font-size:12px;color:#7a869a;font-weight:700;margin-left:4px}
#pkm-kanto-panel .dt-ball{position:absolute;left:10px;top:10px;font-size:11px;color:#7a869a;font-weight:800}
#pkm-kanto-panel .dt-back{display:none;position:absolute;right:10px;top:10px;border:0;background:#dfe7f2;border-radius:8px;padding:3px 8px;font-weight:800;cursor:pointer}
#pkm-kanto-panel .ty{display:inline-block;color:#fff;border-radius:6px;padding:1px 8px;font-size:11.5px;font-weight:800;margin:2px}
#pkm-kanto-panel .dt-sec{padding:6px 12px}
#pkm-kanto-panel .dt-sec h5{margin:4px 0 6px;font-size:12px;color:#5b6b85;display:flex;align-items:center;gap:6px}
#pkm-kanto-panel .dt-sec h5::after{content:"";flex:1;height:1px;background:#dbe3ee}
#pkm-kanto-panel .kv{display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px}
#pkm-kanto-panel .kv div{background:#fff;border-radius:8px;padding:4px 7px;border:1px solid #e3e9f2}
#pkm-kanto-panel .kv span{color:#8a96a8;display:block;font-size:10.5px}
#pkm-kanto-panel .mv{display:grid;grid-template-columns:1fr 1fr;gap:5px}
#pkm-kanto-panel .mv div{border-radius:9px;padding:5px 8px;color:#fff;font-size:12.5px;font-weight:800;display:flex;justify-content:space-between;text-shadow:0 1px 0 rgba(0,0,0,.2)}
#pkm-kanto-panel .mv small{font-weight:700;opacity:.9}
#pkm-kanto-panel .st6{display:grid;grid-template-columns:40px 30px 1fr;gap:5px;align-items:center;font-size:11.5px;margin:2px 0}
#pkm-kanto-panel .st6 i{height:7px;background:#e3e9f2;border-radius:4px;display:block;overflow:hidden}
#pkm-kanto-panel .st6 i b{display:block;height:100%;border-radius:4px}
#pkm-kanto-panel .st6 .up{color:#e2483d;font-weight:900}#pkm-kanto-panel .st6 .dn{color:#3b7be0;font-weight:900}
#pkm-kanto-panel .exp{height:6px;background:#e3e9f2;border-radius:4px;overflow:hidden;margin-top:4px}
#pkm-kanto-panel .exp b{display:block;height:100%;background:#3bb4ff}
#pkm-kanto-panel .acts{display:flex;gap:6px;padding:9px 12px 12px;flex-wrap:wrap;position:sticky;bottom:0;background:#f5f8fc;border-top:1px solid #dbe3ee;margin-top:6px}
#pkm-kanto-panel .acts button{flex:1;border:0;border-radius:9px;padding:8px 6px;font-weight:800;font-size:12.5px;cursor:pointer;background:#1d5fa8;color:#fff;font-family:inherit;white-space:nowrap}
#pkm-kanto-panel .acts button.ghost{background:#e3e9f2;color:#33445e}
#pkm-kanto-panel .acts button:disabled{opacity:.45;cursor:not-allowed}
#pkm-kanto-panel .pb-foot{color:#cfe3ff;font-size:11.5px;padding:0 14px 8px;display:flex;justify-content:space-between}
#pkm-kanto-panel .toast{position:absolute;left:50%;bottom:48px;transform:translateX(-50%);background:rgba(20,30,50,.92);color:#fff;padding:7px 14px;border-radius:20px;font-size:12.5px;pointer-events:none;opacity:0;transition:.2s;z-index:9}
#pkm-kanto-panel .toast.on{opacity:1}
@media(max-width:680px){
 #pkm-kanto-panel{right:3vw!important;left:3vw!important;width:auto;bottom:12px!important;top:auto!important;height:84vh}
 #pkm-kanto-panel .pb-head{gap:8px;padding:8px 10px;min-height:50px}
 #pkm-kanto-panel .pb-head h3{display:none}
 #pkm-kanto-panel .pb-tools{flex:1;width:100%;justify-content:space-between;gap:8px}
 #pkm-kanto-panel .pb-tabs{min-width:0}
 #pkm-kanto-panel .pb-tabs button{padding:6px 10px}
 #pkm-kanto-panel .pb-icons{gap:6px}
 #pkm-kanto-panel .pb-x{width:34px;height:34px;flex-basis:34px}
 #pkm-kanto-panel .pb-right{display:none}
 #pkm-kanto-panel .pb-right.show{display:block;position:absolute;inset:56px 10px 10px;width:auto;z-index:5;box-shadow:0 10px 30px rgba(0,0,0,.35)}
 #pkm-kanto-panel .dt-back{display:block}
 #pkm-kanto-panel .party{grid-template-columns:1fr}
}
/* —— 卡内追加 —— */
#pkm-kanto-panel img.mini{width:22px!important;height:22px!important;image-rendering:pixelated!important;object-fit:contain!important;vertical-align:-6px;margin:-5px -2px!important;display:inline-block!important}
#pkm-kanto-panel img.big{width:60px!important;height:60px!important;image-rendering:pixelated!important;margin:0 auto!important}
#pkm-kanto-panel .bond{grid-column:1/-1}
#pkm-kanto-panel .bond em{display:grid;grid-template-columns:30px 1fr 22px;align-items:center;gap:5px;font-style:normal;font-size:11px;margin:2px 0}
#pkm-kanto-panel .bond em i{height:6px;background:#e3e9f2;border-radius:4px;overflow:hidden;display:block}
#pkm-kanto-panel .bond em i b{display:block;height:100%;border-radius:4px}
#pkm-kanto-panel .pb-warn{margin:0 10px 8px;background:#fff4d6;color:#7a5b00;border-radius:10px;padding:6px 10px;font-size:12px}

#pkm-kanto-panel .pb-head h3{min-width:0}
#pkm-kanto-panel .slot .fo{position:absolute;left:8px;top:-8px;background:#39a8db;color:#fff;font-size:10px;font-weight:900;border-radius:6px;padding:1px 6px;border:2px solid #fff;z-index:1}
#pkm-kanto-panel .bx .fo{position:absolute;left:2px;top:2px;background:#39a8db;color:#fff;font-size:9px;font-weight:900;border-radius:5px;padding:0 4px;z-index:1}
#pkm-kanto-panel .held-img{width:22px!important;height:22px!important;image-rendering:pixelated!important;object-fit:contain!important;vertical-align:-6px;margin:-5px -2px!important;display:inline-block!important}
#pkm-kanto-panel .dt-top .dt-sprite{width:110px;height:110px;object-fit:contain;margin:-8px 0 -10px}
#pkm-kanto-panel .dt-top .dt-flags{display:flex;justify-content:center;gap:5px;flex-wrap:wrap;margin:2px 0 4px}
#pkm-kanto-panel .dt-top .dt-flags span{font-size:10.5px;font-weight:800;border-radius:999px;background:#e3e9f2;color:#43516a;padding:2px 8px}
#pkm-kanto-panel .dt-top .dt-flags .gold{background:#fff1c2;color:#8a5a00}
#pkm-kanto-panel .dt-sec .kv .wide{grid-column:1/-1}
#pkm-kanto-panel .dt-sec p{font-size:12px;color:#6c7688;line-height:1.7;margin:0}
#pkm-kanto-panel .mv .mv-empty{background:#e9edf5!important;color:#6b7385!important;text-shadow:none!important;justify-content:center}
#pkm-kanto-panel .hp i b.unknown{background:#b3bfd0}
#pkm-kanto-panel .pk-snd .r .seg{max-width:100%}
#pkm-kanto-panel .pk-snd .r .seg button{white-space:nowrap}
#pkm-kanto-panel .pb-foot{gap:8px;align-items:center}
#pkm-kanto-panel .pb-foot .pf-r{text-align:right;white-space:nowrap}
@media(max-width:680px){
 #pkm-kanto-panel .pb-body{position:relative}
 #pkm-kanto-panel .pb-right.show{display:block;position:absolute;inset:56px 10px 10px;width:auto;z-index:5;box-shadow:0 10px 30px rgba(0,0,0,.35)}
 #pkm-kanto-panel .dt-back{display:block}
}

`;
function ensureHostStyle() {
  if (PD.getElementById('pkm-kanto-style')) return;
  const s = PD.createElement('style'); s.id = 'pkm-kanto-style'; s.textContent = HOST_CSS; PD.head.appendChild(s);
}

/* ======================================================================
 * 7. 开局登记界面（[[PKM_SETUP]] → 挂载到第 0 楼）
 * ==================================================================== */
const setupState = { step: 0, mode: '同行模式', name: '', gender: '男', hometown: '真新镇', intro: '', starter: '', nickname: '', busy: false, error: '', about: false, lic: String(10000 + Math.floor(Math.random() * 89999)) };
function setupDone(pkm) { return !!pkm.integration.profile || chat().length > 1; }
/* v1.3.3 · 开局美化界面：标题封面 → 模式 → 档案 → 伙伴 → 确认（图片放在网站 st-bridge/img/） */
const IMG = n => BASE + 'st-bridge/img/' + n + '?v=' + VERSION;
const OPEN_MODES = {
  同行模式: { img: 'mode-companion.webp', en: 'TRAVEL TOGETHER', tag: '推荐', pos: 'center 40%' },
  小智模式: { img: 'mode-ash.webp', en: 'BE ASH KETCHUM', tag: '原作', pos: 'center 30%' },
  沙盒模式: { img: 'mode-sandbox.webp', en: 'FREE SANDBOX', tag: '自由', pos: 'center 60%' },
};
const OPEN_STARTERS = {
  妙蛙种子: { img: 'bulbasaur', types: ['草', '毒'], color: '#5fbf7f', no: '001' },
  小火龙: { img: 'charmander', types: ['火'], color: '#ff8a4c', no: '004' },
  杰尼龟: { img: 'squirtle', types: ['水'], color: '#4aa8ff', no: '007' },
  皮卡丘: { img: 'pikachu', types: ['电'], color: '#ffcc33', no: '025' },
  小拉达: { img: 'rattata', types: ['一般'], color: '#b48ad6', no: '019' },
  波波: { img: 'pidgey', types: ['一般', '飞行'], color: '#c9a36b', no: '016' },
  尼多兰: { img: 'nidoranf', types: ['毒'], color: '#8fa7ff', no: '029' },
  伊布: { img: 'eevee', types: ['一般'], color: '#d29b62', no: '133' },
};
const TYPE_COLOR = { 草: '#3fa65a', 毒: '#9b4fc0', 火: '#ef6a2a', 水: '#3a86e8', 电: '#e6b400', 一般: '#9a9a7c', 飞行: '#7f8ff0' };
const typeChips = n => (OPEN_STARTERS[n]?.types || []).map(t => `<span class="pko-type" style="background:${TYPE_COLOR[t] || '#888'}">${t}</span>`).join('');
const starterArt = (n, cls = '') => OPEN_STARTERS[n] ? `<img class="${cls}" src="${IMG('starter-' + OPEN_STARTERS[n].img + '.webp')}" alt="${esc(n)}" loading="lazy" onerror="this.style.visibility='hidden'">` : spriteImg(n, { anim: true });
const OPEN_STEPS = ['旅程模式', '训练家档案', '初始伙伴', '确认出发'];
function renderSetup(el) {
  const pkm = readPkm();
  if (setupDone(pkm)) {
    const pr = pkm.integration.profile || {};
    const lead = pkm.party.slots.find(hasMon);
    const leadName = lead ? (lead.species || '') : (pr.starter || '');
    el.innerHTML = `<div class="pkb pkm-setup pko pko-done"><div class="pko-done-art" style="background-image:url('${IMG('hero.webp')}')"></div><div class="pko-done-wash"></div>
      <div class="pko-done-body">${leadName && OPEN_STARTERS[leadName] ? starterArt(leadName, 'pko-done-mon') : ''}<div><div class="pko-eyebrow light">TRAINER REGISTERED · 训练家档案已登记</div>
      <h3>${esc(pr.name || pkm.player.name || userName())}</h3><p>${esc(pr.mode || pkm.world.mode || '')}${lead ? ' · 初始伙伴：' + esc(monName(lead)) : ''}${pr.hometown ? ' · 来自' + esc(pr.hometown) : ''}</p>
      <small>旅程已经开始。队伍与仓库在右下角的精灵球里，图鉴状态栏显示在最新一条回复的末尾。<br>外置桥接 v${VERSION} · 对战网页：${esc(BASE)}</small></div></div></div>`;
    return;
  }
  const S = setupState;
  if (!S.name) S.name = userName();
  const ash = S.mode === '小智模式';
  const list = K.MODE_STARTERS[S.mode];
  if (!list.includes(S.starter)) S.starter = list[0];
  const info = K.MODE_INFO[S.mode];
  const name = ash ? '小智' : (String(S.name).trim() || userName());
  const gender = ash ? '男' : S.gender;
  const home = S.mode === '沙盒模式' ? S.hometown : '真新镇';
  if (S.step === 0) {
    const balls = Array.from({ length: 10 }, (_, i) => `<i style="--x:${(i * 37 + 9) % 100}%;--d:${7 + (i % 5) * 1.6}s;--dl:-${(i * 1.3).toFixed(1)}s;--s:${10 + (i % 4) * 4}px"></i>`).join('');
    el.innerHTML = `<div class="pkb pkm-setup pko pko-title">
      <img class="pko-hero-art" src="${IMG('hero.webp')}" alt="" onerror="this.remove()"><div class="pko-hero-wash"></div><div class="pko-balls" aria-hidden="true">${balls}</div>
      <div class="pko-topline"><div class="pko-brand"><span class="pko-ball-ico"></span>KANTO · JOURNEY</div><div><button class="pko-quiet" data-act="about">${S.about ? '收起说明' : '旅程说明'}</button></div></div>
      <div class="pko-vert">去吧，<br>向着还没见过的草丛。</div>
      <div class="pko-hero-content">
        <div class="pko-ribbon">动画关都篇 · 你的旅程由此开始</div>
        <img class="pko-logo" src="${IMG('logo-pokemon.webp')}" alt="Pokémon" onerror="this.remove()">
        <h1 class="pko-cn-title">关都之旅</h1>
        <p class="pko-quote">第1年 5月22日，真新镇。<br>今天，是新人训练家出发的日子。</p>
        <div class="pko-menu">
          <button class="pko-primary" data-act="next"><span class="n">01</span><span><b>开始旅程</b><small>NEW JOURNEY</small></span><i>→</i></button>
          <button class="pko-second" data-act="about"><span class="n">02</span><span><b>旅程说明</b><small>HOW TO PLAY</small></span><i>${S.about ? '↑' : '↗'}</i></button>
        </div>
        <div class="pko-meta"><span>三种旅程模式</span><span>网页实战对战</span><span>图鉴 · 队伍 · 仓库</span></div>
      </div>
      ${S.about ? `<div class="pko-about"><b>📖 旅程说明</b><ul>
        <li>🗓️ 故事从第1年 5月22日的真新镇开始，沿着动画关都篇的时间线推进；你可以同行、扮演小智，或者自由旅行。</li>
        <li>⚔️ 你亲自参与的对战会打开全屏战斗界面，在你自己的对战网页里实际演算，胜负和体力会自动写回队伍。</li>
        <li>📕 每条回复末尾是图鉴状态栏（训练家 / 图鉴 / 背包 / 好感 / 地图 / 附近）。</li>
        <li>🔴 右下角的精灵球是队伍与电脑，可以换首发，也可以让宝可梦出球跟着你。</li></ul></div>` : ''}
      <div class="pko-hero-footer"><span>真新镇 · 大木研究所</span><span>POKÉMON · INDIGO LEAGUE</span></div>
      <span class="pko-credit">画面 © Nintendo · Creatures · GAME FREAK · TV Tokyo · ShoPro · JR Kikaku · Pokémon（同人非商用）</span>
    </div>`;
    return;
  }
  const stepsBar = `<div class="pko-steps">${OPEN_STEPS.map((t, i) => `<button class="pko-step ${i + 1 === S.step ? 'on' : ''} ${i + 1 < S.step ? 'done' : ''}" data-act="goto" data-v="${i + 1}" ${i + 1 > S.step || S.busy ? 'disabled' : ''}><span>${i + 1 < S.step ? '✓' : i + 1}</span>${t}</button>`).join('')}</div>`;
  const top = `<div class="pko-wtop"><button class="pko-home" data-act="home" ${S.busy ? 'disabled' : ''}><span class="pko-ball-ico"></span>关都之旅</button>${stepsBar}</div>`;
  const head = (no, en, title, sub) => `<div class="pko-eyebrow">${no} / ${en}</div><h2 class="pko-h2">${title}</h2><p class="pko-sub">${sub}</p>`;
  const license = `<div class="pko-license" style="background-image:linear-gradient(100deg,rgba(255,255,255,.96) 0%,rgba(255,255,255,.9) 52%,rgba(255,255,255,.35) 100%),url('${IMG('oak-lab.webp')}')">
      <div class="pko-lic-top"><span class="pko-ball-ico"></span>TRAINER CARD<span class="pko-lic-cn"> · 训练家执照</span><em>ID No.${esc(S.lic)}</em></div>
      <div class="pko-lic-body"><div class="pko-lic-photo">${starterArt(S.starter)}</div><div class="pko-lic-f">
        <div><small>名字</small><b data-live="name">${esc(name)}</b></div>
        <div><small>性别 / 年龄</small><b>${gender} · 10 岁</b></div>
        <div><small>家乡</small><b>${esc(home)}</b></div>
        <div><small>旅程模式</small><b>${esc(S.mode)}</b></div>
        <div class="w"><small>一句话介绍</small><b data-live="intro">${esc(S.intro || '—')}</b></div>
      </div></div><div class="pko-lic-foot">关都地区 · 宝可梦联盟认证 · 大木研究所 发行</div></div>`;
  let body = '', foot = '';
  if (S.step === 1) {
    body = head('01', 'CHOOSE YOUR JOURNEY', '你想以什么身份走进关都？', '模式决定你在动画关都篇里的位置。<b>选定后不能更改。</b>') +
      `<div class="pko-modes">${Object.entries(K.MODE_INFO).map(([m, mi]) => { const o = OPEN_MODES[m] || {}; return `<button class="pko-mode ${S.mode === m ? 'on' : ''}" data-act="mode" data-v="${m}">
        <span class="pko-mode-art"><img src="${IMG(o.img)}" alt="" loading="lazy" style="object-position:${o.pos || 'center'}" onerror="this.remove()"><em>${o.tag || ''}</em></span>
        <span class="pko-mode-head"><b>${mi.icon} ${m}</b><i>${o.en || ''}</i></span>
        <span class="pko-mode-time">${esc(mi.start.time)} · ${esc(mi.start.location)}</span>
        <span class="pko-mode-desc">${esc(mi.desc)}</span>
        <span class="pko-mode-pk">${K.MODE_STARTERS[m].map(n => OPEN_STARTERS[n] ? `<img src="${IMG('starter-' + OPEN_STARTERS[n].img + '.webp')}" alt="${esc(n)}" title="${esc(n)}" loading="lazy">` : '').join('')}<small>可选伙伴</small></span>
        <span class="pko-check">✓</span></button>`; }).join('')}</div>`;
    foot = `<button class="pko-outline" data-act="home">返回标题</button><button class="pko-go" data-act="next">下一步 · 训练家档案 →</button>`;
  } else if (S.step === 2) {
    body = head('02', 'TRAINER PROFILE', ash ? '你就是真新镇的小智。' : '大木博士要给你办理训练家执照。', ash ? '小智模式下名字、性别、家乡固定。' : '填好下面几项，右边的执照会同步更新。') +
      `<div class="pko-profile"><div class="pko-form">
        <label class="pko-f">名字</label><input class="pko-in" type="text" data-f="name" maxlength="16" value="${esc(ash ? '小智' : S.name)}" ${ash ? 'disabled' : ''}>
        <label class="pko-f">性别</label><div class="pko-seg">${['男', '女'].map(g => `<button class="${gender === g ? 'on' : ''}" data-act="gender" data-v="${g}" ${ash ? 'disabled' : ''}>${g === '男' ? '♂ 男孩' : '♀ 女孩'}</button>`).join('')}</div>
        <label class="pko-f">家乡</label><select class="pko-in" data-f="hometown" ${S.mode !== '沙盒模式' ? 'disabled' : ''}>${['真新镇', '常青市', '深灰市', '华蓝市', '枯叶市', '玉虹市', '金黄市', '紫苑镇', '浅红市', '红莲镇'].map(t => `<option ${home === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <label class="pko-f">一句话介绍 <small>可选</small></label><input class="pko-in" type="text" data-f="intro" maxlength="60" placeholder="例如：想成为宝可梦饲育家" value="${esc(S.intro)}">
        <div class="pko-note">年龄 10 岁，刚好可以领取训练家执照。${S.mode !== '沙盒模式' ? '同行 / 小智模式的家乡固定为真新镇。' : ''}</div>
      </div>${license}</div>`;
    foot = `<button class="pko-outline" data-act="back">← 上一步</button><button class="pko-go" data-act="next">下一步 · 初始伙伴 →</button>`;
  } else if (S.step === 3) {
    const note = { 同行模式: '小茂一大早就来了——他会领走哪一只？你先选的那只就是你的。', 小智模式: '三只初始宝可梦都被领走了，只剩下这只脾气很倔的皮卡丘。', 沙盒模式: '初始宝可梦今年已经送完，后院里还有几只在等训练家。' }[S.mode];
    body = head('03', 'CHOOSE YOUR PARTNER', '选择你的第一位伙伴', esc(note)) +
      `<div class="pko-starters c${list.length}">${list.map(n => { const o = OPEN_STARTERS[n] || {}; return `<button class="pko-starter ${S.starter === n ? 'on' : ''}" data-act="starter" data-v="${n}" style="--c:${o.color || '#dc0a2d'}">
        <span class="pko-st-no">No.${o.no || '???'}</span><span class="pko-st-art">${starterArt(n)}</span>
        <b>${n} <small>Lv5</small></b><span class="pko-st-types">${typeChips(n)}</span><span class="pko-st-desc">${esc(K.STARTERS[n].desc)}</span><span class="pko-check">✓</span></button>`; }).join('')}</div>
      <div class="pko-nick"><label class="pko-f">昵称 <small>可选</small></label><input class="pko-in" type="text" data-f="nickname" maxlength="12" placeholder="不填就叫${esc(S.starter)}" value="${esc(S.nickname)}"></div>`;
    foot = `<button class="pko-outline" data-act="back">← 上一步</button><button class="pko-go" data-act="next">下一步 · 确认出发 →</button>`;
  } else {
    const o = OPEN_STARTERS[S.starter] || {};
    body = head('04', 'READY TO GO', '一切就绪，出发吧！', '确认后：档案写入变量、初始伙伴放进队伍，并自动发送第一条消息开始旅程。') +
      `<div class="pko-confirm"><div class="pko-cf-partner" style="--c:${o.color || '#dc0a2d'}">${starterArt(S.starter)}<b>${esc(S.nickname ? S.nickname + '（' + S.starter + '）' : S.starter)}</b><span>${typeChips(S.starter)} Lv5</span></div>${license}</div>
      <div class="pko-cf-list"><span>🎒 精灵球 ×5 · 伤药 ×2</span><span>💴 3000 元</span><span>🕖 ${esc(info.start.time)}</span><span>📍 ${esc(info.start.location)}</span></div>
      ${S.error ? `<div class="pko-err">${esc(S.error)}</div>` : ''}`;
    foot = `<button class="pko-outline" data-act="back" ${S.busy ? 'disabled' : ''}>← 上一步</button><button class="pko-go big" data-act="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '正在登记……' : '确认出发！'}</button>`;
  }
  el.innerHTML = `<div class="pkb pkm-setup pko pko-wiz">${top}<div class="pko-main">${body}</div><div class="pko-foot">${foot}</div></div>`;
}
function bindSetup(el) {
  const live = (f, v) => el.querySelectorAll(`[data-live="${f}"]`).forEach(n => { n.textContent = String(v || '').trim() || (f === 'name' ? userName() : '—'); });
  el.addEventListener('input', e => { const f = e.target?.dataset?.f; if (f) { setupState[f] = e.target.value; live(f, e.target.value); } });
  el.addEventListener('change', e => { const f = e.target?.dataset?.f; if (f) { setupState[f] = e.target.value; if (f === 'hometown') rerenderSetups(); } });
  el.addEventListener('keydown', e => { if (e.target?.dataset?.f) e.stopPropagation(); });
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    e.preventDefault(); e.stopPropagation();
    const S = setupState, act = b.dataset.act;
    if (act === 'next') { if (S.step === 2 && S.mode !== '小智模式' && !String(S.name).trim()) { toast('请填写名字'); return; } S.step = Math.min(4, S.step + 1); S.about = false; }
    else if (act === 'back') S.step = Math.max(0, S.step - 1);
    else if (act === 'home') S.step = 0;
    else if (act === 'goto') S.step = Math.max(1, Math.min(S.step, +b.dataset.v || 1));
    else if (act === 'about') S.about = !S.about;
    else if (act === 'mode') { S.mode = b.dataset.v; S.starter = ''; }
    else if (act === 'gender') S.gender = b.dataset.v;
    else if (act === 'starter') S.starter = b.dataset.v;
    else if (act === 'submit') { submitSetup().catch(err => { S.busy = false; S.error = '登记失败：' + (err?.message || err); rerenderSetups(); }); }
    rerenderSetups();
    if (['next', 'back', 'home', 'goto'].includes(act)) { const box = PD.querySelector('[data-pkm-setup-mounted] .pko'); try { box?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {} }
  });
}
function rerenderSetups() { PD.querySelectorAll('[data-pkm-setup-mounted]').forEach(el => renderSetup(el)); }
async function submitSetup() {
  const S = setupState; if (S.busy) return;
  S.busy = true; S.error = ''; rerenderSetups();
  const ash = S.mode === '小智模式';
  const name = ash ? '小智' : String(S.name).trim().slice(0, 16) || userName();
  const gender = ash ? '男' : S.gender;
  const hometown = S.mode === '沙盒模式' ? S.hometown : '真新镇';
  const info = K.MODE_INFO[S.mode];
  const starter = makeStarter(S.starter, String(S.nickname || '').trim().slice(0, 12), S.mode);
  const profile = { v: VERSION, mode: S.mode, name, gender, age: 10, hometown, starter: S.starter, nickname: starter.nickname, intro: String(S.intro || '').trim().slice(0, 60) };
  await writePkm(pkm => {
    Object.assign(pkm.player, { name, gender, hometown, id: S.lic });
    pkm.world.mode = S.mode; pkm.world.time = info.start.time; pkm.world.location = info.start.location;
    pkm.party.slots[0] = starter;
    pkm.party.follow = ash ? starter.uid : null;
    addSeen(pkm, S.starter, 'EP001');
    pkm.dex.seen[S.starter] = ['EP001', '真新镇·大木研究所', '第1年 5月22日'];
    if (!pkm.dex.caught.includes(S.starter)) pkm.dex.caught.push(S.starter);
    const rec = pkm.npcs.records;
    if (rec.oak) { rec.oak.met = true; rec.oak.lastInteraction = 0; }
    if (ash && rec.delia) { rec.delia.met = true; rec.delia.lastInteraction = 0; }
    pkm.integration.profile = profile; pkm.integration.version = VERSION;
  });
  const text = `<pkm_profile>${JSON.stringify(profile)}</pkm_profile>\n（训练家档案已登记，初始伙伴${starter.nickname ? '「' + starter.nickname + '」' : ''}${S.starter}已由脚本放进队伍。请从${S.mode}的开场开始第一幕。）`;
  await sendUserMessage(text);
  S.busy = false; rerenderSetups();
}
async function sendUserMessage(text) {
  const ta = PD.getElementById('send_textarea'), btn = PD.getElementById('send_but');
  if (ta && btn) {
    ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(60); btn.click(); return;
  }
  if (typeof W.triggerSlash === 'function') { await W.triggerSlash('/send ' + text.replace(/\|/g, '\\|')); await W.triggerSlash('/trigger'); return; }
  throw new Error('找不到聊天输入框');
}
function scanSetup() {
  PD.querySelectorAll('#chat .mes').forEach(mes => {
    const box = mes.querySelector('[data-pkm-welcome]') || [...mes.querySelectorAll('.mes_text > div')].find(d => /开局界面载入中/.test(d.textContent || ''));
    if (!box || box.hasAttribute('data-pkm-setup-mounted')) return;
    box.setAttribute('data-pkm-setup-mounted', '1');
    box.removeAttribute('style');
    bindSetup(box); renderSetup(box);
  });
}

/* ======================================================================
 * 8. 图鉴状态栏（regex 渲染的 iframe 调用 parent.PKMKanto.mountDex）
 * ==================================================================== */
const dexMounts = new Set();
function mountDex(win, root) {
  if (!win || !root) return;
  const doc = win.document;
  if (!doc.getElementById('pkm-dex-style')) { const s = doc.createElement('style'); s.id = 'pkm-dex-style'; s.textContent = DEX_CSS; doc.head.appendChild(s); }
  for (const m of dexMounts) if (m.root === root) return renderDex(m);
  const m = { win, root, tab: 'trainer', loveAll: false };
  dexMounts.add(m);
  root.addEventListener('click', e => onDexClick(m, e));
  renderDex(m);
  try { new win.ResizeObserver(() => fitFrame(m)).observe(doc.body); } catch (_) {}
}
function fitFrame(m) {
  try { const f = m.win.frameElement; if (!f) return; const h = Math.ceil(m.win.document.documentElement.scrollHeight); if (h > 30 && Math.abs((parseFloat(f.style.height) || 0) - h) > 2) f.style.height = h + 'px'; } catch (_) {}
}
function mesOfFrame(win) { try { const mes = win.frameElement?.closest('.mes'); const id = Number(mes?.getAttribute('mesid')); return Number.isInteger(id) ? id : -1; } catch (_) { return -1; } }
const TABS = [['trainer', '训练家'], ['dex', '图鉴'], ['bag', '背包'], ['love', '好感'], ['map', '地图'], ['near', '附近']];
function renderDex(m) {
  let alive = false; try { alive = !!(m.root.isConnected && m.win.frameElement && m.win.frameElement.isConnected); } catch (_) {}
  if (!alive) { dexMounts.delete(m); return; }
  const pkm = readPkm();
  const mesid = mesOfFrame(m.win);
  const st = parseState(chat()[mesid]?.mes) || latestState()?.state || {};
  let inner = '';
  try { inner = ({ trainer: dexTrainer, dex: dexDex, bag: dexBag, love: dexLove, map: dexMap, near: dexNear })[m.tab](pkm, st, m); }
  catch (e) { inner = `<div class="empty">这一页渲染失败：${esc(e.message)}</div>`; }
  m.root.innerHTML = `<div class="pkb pkdex"><div class="pkdex-top"><span class="pkdex-lens"></span><span class="pkdex-dots"><i></i><i></i><i></i></span><span class="pkdex-title">宝可梦图鉴</span>
    <span class="pkdex-state">${esc(st.时间 || pkm.world.time || '')}<br>${esc(st.地点 || pkm.world.location || '')}</span></div>
    <div class="pkdex-screen">${inner}</div>
    <div class="pkdex-tabs">${TABS.map(([k, n]) => `<button class="${m.tab === k ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div></div>`;
  m.win.requestAnimationFrame?.(() => fitFrame(m));
}
function hpBar(s) {
  if (!s.maxHp || s.hp == null) return `<div class="hp"><i style="width:100%"></i></div>`;
  const r = Math.max(0, Math.min(1, s.hp / s.maxHp));
  return `<div class="hp"><i class="${r < .2 ? 'low' : r < .5 ? 'mid' : ''}" style="width:${(r * 100).toFixed(0)}%"></i></div>`;
}
function monLine(s, pkm) {
  const tags = [s.isLead ? '<span class="tag gold">首发</span>' : '', s.uid && s.uid === pkm.party.follow ? '<span class="tag pink">跟随</span>' : '', s.status ? `<span class="tag gray">${esc(s.status)}</span>` : '', s.shiny ? '<span class="tag gold">✨异色</span>' : ''].join('');
  return `${esc(monName(s))}${s.nickname ? `<span class="muted">（${esc(s.species)}）</span>` : ''} <span class="muted">Lv${esc(s.lv ?? '?')}</span>${genderMark(s.gender)}${tags}`;
}
function dexTrainer(pkm, st) {
  const pl = pkm.player;
  const title = pl.title || K.TITLES.find(([n]) => (pl.reputation || 0) >= n)[1];
  const party = pkm.party.slots.filter(hasMon);
  return `<div class="st-grid"><div><b>训练家</b>${esc(pl.name || userName())}${pl.gender ? '（' + esc(pl.gender) + '）' : ''}</div><div><b>模式</b>${esc(st.模式 || pkm.world.mode || '—')}</div>
    <div><b>称号</b>${esc(title)}</div><div><b>声望</b>${esc(pl.reputation)}</div><div><b>金钱</b>${esc(pl.money)} 元</div><div><b>阶段</b>${esc(st.阶段 || '—')}</div>
    <div style="grid-column:1/-1"><b>剧情</b>${esc(st.剧情 || '—')}</div>${st.在场 ? `<div style="grid-column:1/-1"><b>在场</b>${esc(st.在场)}</div>` : ''}</div>
    <div class="badges">${K.BADGES.map(b => `<span class="badge ${pl.badges.includes(b) ? 'on' : ''}" title="${esc(b)} · ${esc(K.BADGE_GYM[b])}" style="background:${K.BADGE_COLORS[b]}">${esc(b[0])}</span>`).join('')}<span class="muted" style="align-self:center;font-size:12px">徽章 ${pl.badges.length}/8</span></div>
    ${party.length ? party.map(s => `<div class="mon-row">${spriteImg(s.species || s.name, { shiny: s.shiny })}<div class="grow">${monLine(s, pkm)}<small>${esc((s.moves || []).filter(Boolean).join(' / ') || '—')}${s.hp != null && s.maxHp ? ` · HP ${s.hp}/${s.maxHp}` : ''}</small>${hpBar(s)}</div></div>`).join('') : '<div class="empty">还没有宝可梦。</div>'}
    <div class="pk-note">队伍管理、换首发、跟随：点右下角的精灵球。</div>`;
}
function dexDex(pkm) {
  const seen = Object.entries(pkm.dex.seen), caught = new Set(pkm.dex.caught);
  const kanto = seen.filter(([n]) => { const id = speciesId(n); const num = ZH?.speciesByNum ? Object.entries(ZH.speciesByNum).find(([, z]) => z === n)?.[0] : null; return id && num && +num <= 151; }).length;
  return `<div class="dex-head"><span class="dex-num">${seen.length}</span><div>遇见 · 收服 <b>${caught.size}</b><br><span class="muted" style="font-size:12px">关都图鉴 ${kanto}/151${Object.keys(pkm.dex.shiny).length ? ' · 异色 ' + Object.keys(pkm.dex.shiny).length : ''}</span></div></div>
    ${seen.length ? `<div class="dex-grid">${seen.map(([n, info]) => `<div class="dex-cell" title="${esc((info || []).join(' · '))}">${caught.has(n) ? '<span class="ball">🔴</span>' : ''}${spriteImg(n, { shiny: !!pkm.dex.shiny[n] })}<div>${esc(n)}</div><div class="muted" style="font-size:10.5px">${esc((info || [])[1] || '')}</div></div>`).join('')}</div>` : '<div class="empty">图鉴还是空的。亲眼见到的宝可梦会登记在这里。</div>'}`;
}
function dexBag(pkm) {
  const items = Object.entries(pkm.player.bag).filter(([, n]) => Number(n) > 0);
  return `<div class="st-grid"><div><b>金钱</b>${esc(pkm.player.money)} 元</div><div><b>道具</b>${items.length} 种</div></div>
    ${items.length ? `<div class="bag-list">${items.map(([k, n]) => `<div class="bag-item">${itemIcon(k)}<span>${esc(k)}</span><b>×${esc(n)}</b></div>`).join('')}</div>` : '<div class="empty">背包空空的。</div>'}`;
}
function dexLove(pkm, st, m) {
  let list = Object.entries(pkm.npcs.records).filter(([, r]) => isObj(r) && r.met === true);
  const total = list.length;
  if (!m.loveAll) list = list.filter(([, r]) => r.gender === '女');
  list.sort((a, b) => (b[1].lastInteraction ?? -1) - (a[1].lastInteraction ?? -1) || (b[1].love ?? 0) - (a[1].love ?? 0));
  return `<div style="display:flex;align-items:center;margin-bottom:4px"><b>已结识的人物</b><span class="muted" style="margin-left:6px;font-size:12px">${list.length}/${total}</span><button class="tog ghost" data-love-all="1">${m.loveAll ? '只看女性角色' : '显示全部'}</button></div>
    ${list.length ? list.map(([, r]) => { const v = Math.max(-100, Math.min(100, Number(r.love) || 0)); return `<div class="love-row"><div style="width:84px"><b>${esc(r.name)}</b><br><span class="muted" style="font-size:11px">${esc(r.role || '')}</span></div><div class="love-bar"><i class="${v < 0 ? 'neg' : ''}" style="${v >= 0 ? `left:50%;width:${v / 2}%` : `left:${50 + v / 2}%;width:${-v / 2}%`}"></i></div><div style="width:70px;text-align:right"><b>${v}</b>${r.last ? `<span class="muted" style="font-size:11px"> ${r.last > 0 ? '+' : ''}${esc(r.last)}</span>` : ''}<br><span class="muted" style="font-size:11px">${esc(r.why || '')}</span></div></div>`; }).join('') : `<div class="empty">${total ? '还没有结识女性角色，可点“显示全部”。' : '还没有结识任何人。'}</div>`}`;
}
function locateNode(loc) {
  const s = String(loc || '');
  for (const [place, id] of Object.entries(K.ANIME_PLACES)) if (s.includes(place)) return { id, approx: true };
  for (const n of K.MAP_NODES) if (s.includes(n.name) || n.alias.some(a => s.includes(a))) return { id: n.id, approx: false };
  return null;
}
function dexMap(pkm, st) {
  const loc = st.地点 || pkm.world.location || '';
  const here = locateNode(loc);
  const N = Object.fromEntries(K.MAP_NODES.map(n => [n.id, n]));
  const sx = x => x * 3.2, sy = y => y * 2.2;
  const edges = K.MAP_EDGES.map(([a, b]) => `<line x1="${sx(N[a].x)}" y1="${sy(N[a].y)}" x2="${sx(N[b].x)}" y2="${sy(N[b].y)}" stroke="#e8d9a8" stroke-width="7" stroke-linecap="round"/><line x1="${sx(N[a].x)}" y1="${sy(N[a].y)}" x2="${sx(N[b].x)}" y2="${sy(N[b].y)}" stroke="#c9b276" stroke-width="1.5" stroke-dasharray="4 4"/>`).join('');
  const nodes = K.MAP_NODES.map(n => { const on = here?.id === n.id; const col = { city: '#ff6b5a', town: '#ffb84d', wild: '#56c26b', league: '#8c6bff' }[n.kind];
    return `<g>${on ? `<circle cx="${sx(n.x)}" cy="${sy(n.y)}" r="14" fill="none" stroke="#dc0a2d" stroke-width="3"><animate attributeName="r" values="9;16;9" dur="1.6s" repeatCount="indefinite"/></circle>` : ''}<rect x="${sx(n.x) - 7}" y="${sy(n.y) - 7}" width="14" height="14" rx="${n.kind === 'wild' ? 7 : 3}" fill="${col}" stroke="#2b2f38" stroke-width="2"/><text x="${sx(n.x)}" y="${sy(n.y) + 20}" font-size="10.5" text-anchor="middle" font-weight="${on ? 800 : 600}" fill="#1d2433" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(n.name)}</text></g>`; }).join('');
  const land = `<path d="M20 30 Q60 10 150 20 Q250 10 300 40 Q318 90 290 140 Q250 190 170 200 Q120 214 80 190 Q30 175 20 120 Q8 70 20 30Z" fill="#cdeaa0" stroke="#8fbf62" stroke-width="2"/><path d="M40 196 l40 6 l30 -2" stroke="#8fbf62" fill="none"/>`;
  return `<div class="map-wrap"><svg viewBox="0 0 320 232" role="img" aria-label="关都地图">${land}${edges}${nodes}</svg></div>
    <div class="pk-note">📍 当前位置：<b>${esc(loc || '未知')}</b>${here ? (here.approx ? `（动画原创地点，地图上标在${esc(N[here.id].name)}附近）` : '') : '（不在地图收录的主要城镇里）'}</div>`;
}
function nearbyList(pkm, st) {
  const loc = st.地点 || pkm.world.location || '';
  if (!loc) return { list: [], reason: '还不知道当前位置。' };
  if (K.INDOOR_WORDS.some(w => loc.includes(w)) && !/道路|森林|山|野|草/.test(loc)) return { list: [], reason: '这里是室内或城镇设施，没有野生宝可梦。去道路、森林或水边看看吧。' };
  const node = locateNode(loc);
  let table = (node && K.ENCOUNTERS[node.id]) || null;
  if (!table) { const lv = Math.max(3, (pkm.party.slots.filter(hasMon).reduce((a, s) => Math.max(a, Number(s.lv) || 5), 5)) - 2); table = [['波波', lv - 2, lv + 2, 3], ['小拉达', lv - 2, lv + 2, 3], ['烈雀', lv - 1, lv + 2, 2], ['绿毛虫', lv - 2, lv, 2], ['独角虫', lv - 2, lv, 2]]; }
  if (K.WATER_WORDS.some(w => loc.includes(w))) table = table.concat(K.WATER_ENCOUNTERS);
  const d = parseDate(st.时间 || pkm.world.time);
  const seedKey = `${loc}|${d ? d.day : 0}|${d ? Math.floor(d.h / 4) : 0}`;
  const r = rng(hash(seedKey));
  const total = table.reduce((a, t) => a + t[3], 0);
  const list = [];
  for (let i = 0; i < 3; i++) {
    let x = r() * total, pick = table[0];
    for (const t of table) { x -= t[3]; if (x <= 0) { pick = t; break; } }
    const lv = Math.max(2, Math.round(pick[1] + r() * (pick[2] - pick[1])));
    const gender = pick[0] === '尼多兰' || pick[0] === '尼多娜' || pick[0] === '吉利蛋' ? 'F' : pick[0] === '尼多朗' || pick[0] === '尼多力诺' || pick[0] === '肯泰罗' ? 'M' : (r() < .5 ? 'M' : 'F');
    const key = 'w' + hash(seedKey + '#' + i).toString(36);
    list.push({ key, species: pick[0], level: lv, gender, shiny: r() < 1 / 400 });
  }
  return { list: list.filter(w => !pkm.wild.used[w.key]), reason: '', loc };
}
function dexNear(pkm, st) {
  const { list, reason } = nearbyList(pkm, st);
  const canFight = pkm.party.slots.some(s => hasMon(s) && s.status !== '濒死' && s.hp !== 0);
  const balls = Object.entries(K.ZH_BALL).map(([zh]) => Number(pkm.player.bag[zh]) || 0).reduce((a, b) => a + b, 0);
  if (reason) return `<div class="empty">${esc(reason)}</div>`;
  return `${list.length ? list.map(w => `<div class="near-row">${spriteImg(w.species, { anim: true, shiny: w.shiny })}<div class="grow"><b>${esc(w.species)}</b>${w.shiny ? '<span class="tag gold">✨</span>' : ''} <span class="muted">Lv${w.level} ${genderMark(w.gender)}</span><br><span class="muted" style="font-size:11.5px">在草丛里窸窸窣窣……</span></div><div class="acts"><button class="red" data-wild="${w.key}" data-mode="fight" ${canFight ? '' : 'disabled'}>对战</button><button class="blue" data-wild="${w.key}" data-mode="catch" ${canFight ? '' : 'disabled'}>捕捉</button></div></div>`).join('') : '<div class="empty">附近的宝可梦都跑开了。换个地方或过一会儿再来。</div>'}
    <div class="pk-note">${canFight ? `背包里的精灵球：${balls} 个。` : '队伍里没有能战斗的宝可梦，先去宝可梦中心吧。'}“捕捉”会直接打开对战里的精灵球菜单，投球后才判定；结果会填进输入框，发送后剧情继续。附近名单每 4 小时（游戏时间）或换地点刷新。</div>`;
}
function onDexClick(m, e) {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.tab) { m.tab = t.dataset.tab; renderDex(m); return; }
  if (t.dataset.loveAll) { m.loveAll = !m.loveAll; renderDex(m); return; }
  if (t.dataset.wild) {
    const pkm = readPkm(); const st = parseState(chat()[mesOfFrame(m.win)]?.mes) || latestState()?.state || {};
    const w = nearbyList(pkm, st).list.find(x => x.key === t.dataset.wild);
    if (!w) { toast('这只宝可梦已经不在附近了'); renderDex(m); return; }
    openBattle({ source: 'wild', key: 'wild|' + w.key, wildKey: w.key, cfg: { id: '野生-' + w.species, event: '自由', type: 'wild', opponent: '野生' + w.species, title: `野生的${w.species}出现了！`, team: [{ species: w.species, level: w.level, gender: w.gender, shiny: w.shiny }] }, ui: t.dataset.mode === 'catch' ? { openBalls: true } : null });
  }
}

/* ======================================================================
 * 9. 右下角精灵球：队伍 / 电脑 / 跟随
 * ==================================================================== */
/* ---------- 精灵球自由拖拽（v1.3.7） ----------
 * 按住精灵球（或跟随的宝可梦）拖到屏幕任意位置；位置按“离最近两条边的距离”记在本机 localStorage，
 * 窗口缩放 / 旋转后自动收回屏内；面板和叫声气泡会跟着球所在的象限换边。点一下（没拖动）仍然是打开 / 关闭面板。 */
const BALL_POS_KEY = 'pkmKantoBallPos', BALL_MARGIN = 6;
let ballDrag = null;
const vp = () => { const d = PD.documentElement; return { w: d.clientWidth || P.innerWidth, h: d.clientHeight || P.innerHeight }; };
function readBallPos() {
  try {
    const j = JSON.parse(lsGet(BALL_POS_KEY) || 'null');
    if (j && (j.ax === 'l' || j.ax === 'r') && (j.ay === 't' || j.ay === 'b') && Number.isFinite(j.dx) && Number.isFinite(j.dy)) return j;
  } catch (_) {}
  return null;
}
const saveBallPos = pos => lsSet(BALL_POS_KEY, pos ? JSON.stringify(pos) : null);
function setBallAnchor(el, p) {
  if (!p) { for (const k of ['left', 'right', 'top', 'bottom']) el.style[k] = ''; el.classList.remove('pos-l', 'pos-t'); return; }
  el.style.left = p.ax === 'l' ? p.dx + 'px' : 'auto'; el.style.right = p.ax === 'r' ? p.dx + 'px' : 'auto';
  el.style.top = p.ay === 't' ? p.dy + 'px' : 'auto'; el.style.bottom = p.ay === 'b' ? p.dy + 'px' : 'auto';
  el.classList.toggle('pos-l', p.ax === 'l'); el.classList.toggle('pos-t', p.ay === 't');
}
function ballPosFromRect(r) {
  const { w, h } = vp(), m = BALL_MARGIN, clamp = (v, lo, hi) => Math.max(lo, Math.min(Math.max(lo, hi), v));
  const ax = r.left + r.width / 2 < w / 2 ? 'l' : 'r', ay = r.top + r.height / 2 < h / 2 ? 't' : 'b';
  return {
    ax, ay,
    dx: Math.round(clamp(ax === 'l' ? r.left : w - r.right, m, w - r.width - m)),
    dy: Math.round(clamp(ay === 't' ? r.top : h - r.bottom, m, h - r.height - m)),
  };
}
// 套用保存的位置，并保证整个球（含跟随的宝可梦）都在屏幕内；收回屏内只是临时的，不会覆盖保存的位置
function placeBall(el) {
  if (!el?.isConnected) return;
  setBallAnchor(el, readBallPos());
  const r = el.getBoundingClientRect(); if (!r.width) return;
  const { w, h } = vp(), m = BALL_MARGIN;
  if (r.left < m - 0.5 || r.top < m - 0.5 || r.right > w - m + 0.5 || r.bottom > h - m + 0.5) setBallAnchor(el, ballPosFromRect(r));
  placePanel();
}
// 面板贴着球展开：球在左半边就左对齐、右半边就右对齐；上下选空间大的一侧
function placePanel() {
  const panel = PD.getElementById('pkm-kanto-panel'); if (!panel) return;
  const { w, h } = vp();
  if (w <= 680) {
    panel.style.left = '3vw'; panel.style.right = '3vw'; panel.style.width = 'auto';
    panel.style.top = 'auto'; panel.style.bottom = '12px'; panel.style.height = '84vh'; panel.style.maxHeight = '84vh';
    return;
  }
  const ball = PD.getElementById('pkm-kanto-ball'); if (!ball) return;
  const r = ball.getBoundingClientRect(); if (!r.width) return;
  const gap = 8, edge = 12, pw = Math.min(760, w - 28);
  let left = r.left + r.width / 2 < w / 2 ? r.left : r.right - pw;
  left = Math.max(14, Math.min(w - pw - 14, left));
  const above = r.top - gap - edge, below = h - r.bottom - gap - edge, down = below > above;
  const available = Math.max(160, down ? below : above);
  panel.style.left = left + 'px'; panel.style.right = 'auto'; panel.style.width = pw + 'px';
  panel.style.height = Math.min(560, h * 0.82) + 'px';
  panel.style.maxHeight = Math.min(560, h * 0.82, available) + 'px';
  if (down) { panel.style.top = Math.round(r.bottom + gap) + 'px'; panel.style.bottom = 'auto'; }
  else { panel.style.bottom = Math.round(h - r.top + gap) + 'px'; panel.style.top = 'auto'; }
}
function installBallDrag(el) {
  let suppressUntil = 0;
  el.addEventListener('click', e => { if (performance.now() < suppressUntil) { e.stopImmediatePropagation(); e.preventDefault(); } }, true); // 拖完松手不算“点击”
  el.addEventListener('dragstart', e => e.preventDefault());
  el.addEventListener('load', () => placeBall(el), true);   // 跟随的宝可梦图片加载完、尺寸变了以后再收回屏内
  el.addEventListener('pointerdown', e => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || !e.target.closest?.('.orb, .follower')) return;
    const r = el.getBoundingClientRect();
    ballDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: r.left, y0: r.top, w: r.width, h: r.height, moved: false };
  });
  const move = e => {
    const d = ballDrag; if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < (e.pointerType === 'touch' ? 14 : 8)) return;   // 手指 / 鼠标抖一下不算拖动
      d.moved = true; el.classList.add('dragging');
      try { el.setPointerCapture(e.pointerId); } catch (_) {}                  // 拖到聊天里的 iframe 上方也不会丢
    }
    e.preventDefault();
    const { w, h } = vp(), m = BALL_MARGIN;
    el.style.left = Math.max(m, Math.min(w - d.w - m, d.x0 + dx)) + 'px'; el.style.top = Math.max(m, Math.min(h - d.h - m, d.y0 + dy)) + 'px';
    el.style.right = 'auto'; el.style.bottom = 'auto';
    placePanel();
  };
  const end = e => {
    const d = ballDrag; if (!d || (e && e.pointerId !== d.id)) return;
    ballDrag = null;
    try { el.releasePointerCapture(d.id); } catch (_) {}
    el.classList.remove('dragging');
    if (!d.moved) return;
    suppressUntil = performance.now() + 150;
    const pos = ballPosFromRect(el.getBoundingClientRect());
    saveBallPos(pos); setBallAnchor(el, pos); placePanel();
    if (d.rerender) renderBall();
  };
  listen(PD, 'pointermove', move, { passive: false });
  listen(PD, 'pointerup', end);
  listen(PD, 'pointercancel', end);
  listen(el, 'lostpointercapture', e => { if (e.target === el && ballDrag?.moved) end(); });   // 触屏会先把隐式捕获从球转给 el（球上也会冒泡出 lostpointercapture），只有 el 自己丢了捕获才算结束
  listen(P, 'resize', () => placeBall(PD.getElementById('pkm-kanto-ball')));
}
let panelTab = 'party';
let panelBoxPage = 0;
let panelSelection = null;
function renderBall() {
  if (ballDrag?.moved) { ballDrag.rerender = true; return; }   // 正在拖动时先不重画，松手后补画
  ensureHostStyle();
  let el = PD.getElementById('pkm-kanto-ball');
  if (!el) {
    el = PD.createElement('div'); el.id = 'pkm-kanto-ball'; el.className = 'pkb'; PD.body.appendChild(el);
    installBallDrag(el);
    el.addEventListener('click', e => {
      if (e.target.closest('.orb')) { togglePanel(); return; }
      if (e.target.closest('.follower')) { // v1.3.4：点跟随的宝可梦 → 叫一声（真实叫声 + 气泡）
        const p = readPkm(); const f = [...p.party.slots, ...p.party.box].find(s => hasMon(s) && s.uid && s.uid === p.party.follow);
        if (f) { cry(f); const img = e.target.closest('.follower'); img.classList.remove('hop'); void img.offsetWidth; img.classList.add('hop'); }
      }
    });
  }
  const pkm = readPkm();
  const n = pkm.party.slots.filter(hasMon).length;
  const f = [...pkm.party.slots, ...pkm.party.box].find(s => hasMon(s) && s.uid && s.uid === pkm.party.follow);
  const fUrl = f ? spriteUrl(f.species || f.name, { anim: true, shiny: f.shiny }) : '';
  if (f && voiceOf(f) === 'anime') { const id = cryId(f.species || f.name); if (id && !cryHave.has(id) && !cryMiss.has(id)) probeCry(id); }
  el.innerHTML = `${fUrl ? `<img class="follower" draggable="false" src="${esc(fUrl)}" title="${esc(monName(f))}正跟在你身边（点一下听它叫）" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<button class="orb" title="队伍与仓库（关都之旅）"><span class="count">${n}</span></button>`;
  placeBall(el);
  if (PD.getElementById('pkm-kanto-panel')) renderPanel();
}
// v1.3.4：能力值（含性格修正）、个体值、羁绊
function statBlock(s) {
  const st = monStats(s), iv = s.stats_meta?.ivs || {}, av = s.friendship?.avs || {};
  const [up, down] = K.NATURE_EFFECT[natureZh(s.nature)] || [];
  const cells = K.STAT_KEYS.map(k => `<span class="${k === up ? 'up' : k === down ? 'down' : ''}"><b>${K.STAT_ZH[k]}</b>${st ? st[k] : '—'}${k === up ? '↑' : k === down ? '↓' : ''}<em>个体 ${ivOk(iv[k]) ? iv[k] : '?'}</em></span>`).join('');
  const bars = AVS_KEYS.map(k => `<span><b>${K.AVS_ZH[k]}</b><i><u style="width:${Math.max(0, Math.min(100, Number(av[k]) || 0))}%"></u></i>${Number(av[k]) || 0}</span>`).join('');
  return `<details class="stx" open><summary>能力 · 个体 · 羁绊 <span class="muted">${esc(K.QUALITY_ZH[s.quality] || '')}${cryLines(s.species || s.name)[0] ? ' · 叫声「' + esc(cryLines(s.species || s.name)[0]) + '」' : ''}</span></summary><div class="sg">${cells}</div><div class="bd2">${bars}</div></details>`;
}
function togglePanel() { const p = PD.getElementById('pkm-kanto-panel'); if (p) p.remove(); else renderPanel(); }
function openPanel() { renderPanel(); return PD.getElementById('pkm-kanto-panel'); }
// v1.3.8：每只宝可梦一行“配音”：默认（跟随全局）/ 🎬 动漫 / 🎮 游戏 + ▶ 试听 + 实际会怎么出声
function voiceRow(s, where, i) {
  const pref = monVoicePref(s), eff = pref || globalVoice(), st = cryStatus(s);
  const chip = (v, label, title) => `<button type="button" data-op="voice" data-v="${v}" data-i="${i}" data-w="${where}" class="${(pref || '') === v ? 'on' : !pref && v === eff ? 'eff' : ''}" title="${esc(title)}">${label}</button>`;
  return `<div class="vc"><span class="vl">配音</span><span class="seg">${chip('', '默认', `跟随下方的默认配音（现在是${VOICE_ZH[globalVoice()]}）`)}${chip('anime', '🎬 动漫', '这只用动漫配音')}${chip('game', '🎮 游戏', '这只用游戏配音（原作叫声）')}</span><button type="button" class="hear" data-op="hear" data-i="${i}" data-w="${where}" title="试听一声">▶</button><i class="vs ${st.cls}">${esc(st.text)}</i></div>`;
}
// 打开面板时探测这一页宝可梦有没有动漫录音，探测完刷新一次小字
const cryUnsure = new Set();
let cryRefreshT = null;
function probePanel(mons) {
  for (const s of mons) {
    const id = cryId(s.species || s.name);
    if (!id || voiceOf(s) !== 'anime' || cryHave.has(id) || cryMiss.has(id) || cryUnsure.has(id)) continue;
    probeCry(id).then(ok => {
      if (!ok && !cryMiss.has(id)) cryUnsure.add(id); // 超时：不再自动探测，点击时边播边判断
      clearTimeout(cryRefreshT);
      cryRefreshT = setTimeout(() => {
        const el = PD.getElementById('pkm-kanto-panel'); if (!el) return;
        const a = PD.activeElement; if (a && el.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return; // 正在拖音量 / 输入时先不重画
        renderPanel();
      }, 150);
    });
  }
}
function panelHpInfo(s) {
  // 先尊重存档中的 maxHp；若缺失，则用本站种族值、等级、个体值与性格计算展示上限。
  // hp=null 是本项目的“满血／刚治疗”标记，新伙伴因此显示计算后的满血值；明确 hp=0 仍显示濒死。
  const storedMax = Number(s.maxHp) > 0 ? Number(s.maxHp) : 0;
  const computedMaxValue = Number(monStats(s)?.hp);
  const computedMax = computedMaxValue > 0 ? computedMaxValue : 0;
  const max = storedMax || computedMax;
  const hasCurrent = s.hp !== null && s.hp !== undefined && s.hp !== '';
  const raw = hasCurrent ? Number(s.hp) : (max ? max : null);
  const parsed = Number.isFinite(raw) ? Math.max(0, raw) : null;
  const hp = parsed !== null && max ? Math.min(parsed, max) : parsed;
  const ratio = max ? Math.max(0, Math.min(1, (hp ?? max) / max)) : (hp === 0 ? 0 : 1);
  const label = max ? `${Math.round(hp ?? max)}/${max}` : (hp === null ? '—/—' : `${Math.round(hp)}/—`);
  const color = hp === 0 ? 'low' : (max ? (ratio < .2 ? 'low' : ratio < .5 ? 'mid' : '') : 'unknown');
  const faint = (hp === 0) || String(s.status || '') === '濒死';
  return { hp, max, ratio, label, color, faint };
}
function panelHpMarkup(s) {
  const h = panelHpInfo(s);
  return `<div class="hp"><span>HP</span><i><b class="${h.color}" style="width:${Math.round(h.ratio * 100)}%"></b></i></div><div class="hpn">${esc(h.label)}</div>`;
}
function panelGenderClass(g) {
  const v = String(g || '').toLowerCase();
  return ['f', '♀', 'female', '母'].includes(v) ? 'f' : ['m', '♂', 'male', '公'].includes(v) ? 'm' : '';
}
function panelStatusText(s, hpInfo = panelHpInfo(s)) {
  if (s.status) return K.STATUS_TO_ZH[s.status] || s.status;
  return hpInfo.faint ? '濒死' : '—';
}
function panelPartyMarkup(pkm) {
  const party = pkm.party.slots.map((s, i) => ({ s, i })).filter(x => hasMon(x.s));
  const count = party.length;
  const cards = party.map(({ s, i }) => {
    const hp = panelHpInfo(s), gender = panelGenderClass(s.gender), follows = !!(s.uid && s.uid === pkm.party.follow);
    const item = s.item ? `<span class="held" title="${esc(s.item)}">${itemIcon(s.item).replace('class="pk-item"', 'class="pk-item held-img"')}</span>` : '';
    const state = panelStatusText(s, hp);
    return `<div class="slot ${s.isLead ? 'lead' : ''} ${hp.faint ? 'faint' : ''} ${panelSelection?.scope === 'party' && panelSelection.index === i ? 'sel' : ''}" role="button" tabindex="0" data-select="party" data-i="${i}" title="${esc(monName(s))} Lv.${esc(s.lv ?? '?')}">
      ${s.isLead ? '<span class="lead-tag">首发</span>' : ''}${follows ? '<span class="fo">跟随中</span>' : ''}
      ${spriteImg(s.species || s.name, { shiny: s.shiny })}
      <div><div class="n"><span>${esc(monName(s))}</span><span class="g ${gender}">${genderMark(s.gender)}</span></div>
      <div class="lvl">Lv.${esc(s.lv ?? '?')}${item ? ' ' + item : ''}</div>${panelHpMarkup(s)}</div>
      ${state !== '—' ? `<span class="stt"${hp.faint ? ' style="background:#555"' : ''}>${esc(state)}</span>` : ''}
    </div>`;
  }).join('');
  return `<div class="party">${cards}${count < 6 ? '<div class="slot empty">空位</div>' : ''}</div>`;
}
function panelStorageMarkup(pkm) {
  const box = pkm.party.box || [];
  const pages = Math.max(1, Math.ceil((box.length + 1) / 30));
  panelBoxPage = Math.min(Math.max(0, panelBoxPage), pages - 1);
  const start = panelBoxPage * 30;
  const cells = Array.from({ length: 30 }, (_, k) => {
    const i = start + k, s = box[i];
    if (!hasMon(s)) return '<div class="bx e"></div>';
    const selected = panelSelection?.scope === 'box' && panelSelection.index === i;
    const follows = !!(s.uid && s.uid === pkm.party.follow);
    return `<div class="bx ${selected ? 'sel' : ''}" data-select="box" data-i="${i}" role="button" tabindex="0" title="${esc(monName(s))} Lv.${esc(s.lv ?? '?')}">${follows ? '<span class="fo">跟随</span>' : ''}${spriteImg(s.species || s.name, { shiny: s.shiny })}<small>${esc(s.lv ?? '?')}</small></div>`;
  }).join('');
  return `<div class="box-top"><button type="button" data-page="-1" aria-label="上一页">◀</button><div class="bn">仓库 ${panelBoxPage + 1} <small>（${box.length} 只）</small></div><button type="button" data-page="1" aria-label="下一页">▶</button></div><div class="boxgrid">${cells}</div>`;
}
function panelAudioSettings() {
  let muted = false; try { muted = P.localStorage?.getItem('pkmKantoMute') === '1'; } catch (_) {}
  const gv = globalVoice(), fb = cryFallback(), cvol = cryVol(), tts = ttsReady(), baseVal = lsGet('pkmKantoCryBase') || '';
  const seg = (op, v, label, on, title = '') => `<button type="button" data-op="${op}" data-v="${v}" class="${on ? 'on' : ''}"${title ? ` title="${esc(title)}"` : ''}>${label}</button>`;
  return `<div class="pk-snd">
    <div class="r"><span class="l">叫声音量</span><input type="range" min="0" max="100" step="5" value="${cvol}" data-op="vol" title="叫声音量"><b class="vv">${cvol}</b></div>
    <div class="r"><span class="l">默认配音</span><span class="seg">${seg('gvoice', 'anime', '🎬 动漫配音', gv === 'anime', '没单独选过的宝可梦都用动漫配音')}${seg('gvoice', 'game', '🎮 游戏配音', gv === 'game', '没单独选过的宝可梦都用原作游戏叫声')}</span></div>
    <div class="r"><span class="l">没有动漫录音时</span><span class="seg">${seg('fallback', 'tts', '🗣️ 语音合成', fb === 'tts', tts ? '用浏览器的中文语音喊它的名字（按体型调音高）' : '这台设备暂时没有中文语音，会自动改播游戏叫声')}${seg('fallback', 'game', '🎮 游戏叫声', fb === 'game', '无动漫录音时播放原作游戏叫声；当前为默认')}${seg('fallback', 'mute', '🔇 不出声', fb === 'mute')}</span></div>
    ${fb === 'tts' && !tts ? '<div class="warn">这台设备的浏览器暂时没有中文语音：语音合成会自动改播游戏叫声（在系统设置里装上中文语音包后刷新即可）。</div>' : ''}
    <details class="adv"${baseVal ? ' open' : ''}><summary>动漫录音地址（高级）</summary><div class="r"><input type="text" data-op="cbase" value="${esc(baseVal)}" placeholder="留空 = 网站的 st-bridge/audio/cries/" spellcheck="false"><button type="button" data-op="cbase-save">保存</button></div><small>录音按「英文名小写.mp3」命名（pikachu.mp3、mrmime.mp3……对照表见网站 st-bridge/audio/cries/CHECKLIST.md）。只放在自己电脑上：放进酒馆的 public/pkm-cries/，这里填 /pkm-cries/。现在读取：${esc(CRY_BASE)}</small></details>
    <div class="pk-note">🎬 动漫配音有录音就播你的录音；尚无录音时按上方设置回退。🎮 游戏配音为原作游戏叫声。配音设置保存在当前浏览器。</div>
  </div>`;
}
function panelDetailMarkup(pkm) {
  const selection = panelSelection;
  const empty = `<div class="dt-empty">🔴<br>选择一只宝可梦<br>查看它的详细资料</div>`;
  if (!selection) return empty + panelAudioSettings();
  const list = selection.scope === 'party' ? pkm.party.slots : pkm.party.box;
  const s = list?.[selection.index];
  if (!hasMon(s)) { panelSelection = null; return empty + panelAudioSettings(); }
  const where = selection.scope === 'party' ? 'party' : 'box';
  const hp = panelHpInfo(s), status = panelStatusText(s, hp);
  const species = zhSpecies(speciesId(s.species || s.name)) || s.species || s.name || '—';
  const gender = genderMark(s.gender) || '—';
  const itemHtml = s.item ? `<span title="${esc(s.item)}">${itemIcon(s.item).replace('class="pk-item"', 'class="pk-item held-img"')} ${esc(s.item)}</span>` : '无';
  const hpLabel = hp.max ? `${Math.round(hp.hp ?? hp.max)}/${hp.max}` : (s.hp == null ? '—/—' : `${esc(s.hp)}/—`);
  const moves = (s.moves || []).filter(Boolean);
  const moveMarkup = moves.length ? moves.map(m => {
    const id = moveIdOf(m), label = id ? zhMove(id) : m, pp = ppText(s, m);
    return `<div style="background:linear-gradient(135deg,#7188a8,#4c6486)"><span>${esc(label)}</span><small>${pp ? `PP ${esc(pp)}` : 'PP —'}</small></div>`;
  }).join('') : '<div class="mv-empty">未记录招式</div>';
  const pCount = pkm.party.slots.filter(hasMon).length;
  const voice = voiceRow(s, where, selection.index);
  const acts = where === 'party'
    ? `${s.isLead ? '' : `<button type="button" data-op="lead" data-i="${selection.index}">设为首发</button>`}<button type="button" data-op="follow" data-i="${selection.index}" data-w="party">${s.uid && s.uid === pkm.party.follow ? '收回球里' : '出球跟随'}</button>${pCount > 1 ? `<button type="button" class="ghost" data-op="tobox" data-i="${selection.index}">存进电脑</button>` : ''}`
    : `<button type="button" data-op="toparty" data-i="${selection.index}" ${pCount >= 6 ? 'disabled title="队伍已满 6 只"' : ''}>加入队伍</button><button type="button" data-op="follow" data-i="${selection.index}" data-w="box">${s.uid && s.uid === pkm.party.follow ? '收回' : '跟随'}</button>`;
  const nature = s.nature ? (natureZh(s.nature) || zhNature(s.nature) || s.nature) : '未记录';
  const ability = s.ability ? (zhAbility(s.ability) || s.ability) : '未记录';
  const location = s.met ? s.met : '未记录';
  const speciesSub = String(monName(s)) === String(species) ? '' : species;
  const subtitle = [speciesSub, `Lv.${s.lv ?? '?'}`].filter(Boolean).join(' · ');
  return `<div class="dt-top"><button type="button" class="dt-back" data-op="back">返回</button><div class="dt-ball">${esc(s.ball || '球种未记录')}</div>
    ${spriteImg(s.species || s.name, { shiny: s.shiny }, 'pk-spr dt-sprite')}<div class="dt-name">${esc(monName(s))}<small>${esc(subtitle)}</small></div>
    <div class="dt-flags"><span>${esc(hpLabel)} HP</span><span>${esc(gender)}</span>${s.shiny ? '<span class="gold">✨ 异色</span>' : ''}${s.isLead ? '<span class="gold">首发</span>' : ''}</div>
    <div style="padding:0 12px 8px">${panelHpMarkup(s)}</div></div>
    <div class="dt-sec"><h5>资料</h5><div class="kv"><div><span>宝可梦</span>${esc(species)}</div><div><span>等级</span>Lv.${esc(s.lv ?? '?')}</div><div><span>HP</span>${esc(hpLabel)}</div><div><span>状态</span>${esc(status)}</div><div><span>性别</span>${esc(gender)}</div><div><span>位置</span>${where === 'party' ? `队伍第${selection.index + 1}格` : `仓库第${selection.index + 1}格`}</div><div><span>携带物品</span>${itemHtml}</div><div><span>精灵球</span>${esc(s.ball || '未记录')}</div><div class="wide"><span>相遇记录</span>${esc(location)}</div></div></div>
    <div class="dt-sec"><h5>招式</h5><div class="mv">${moveMarkup}</div></div>
    <div class="dt-sec"><h5>能力与个体资料</h5><div class="kv"><div><span>特性</span>${esc(ability)}</div><div><span>性格</span>${esc(nature)}</div><div class="wide"><span>能力值说明</span>按等级、种族值、个体值和性格计算；新伙伴或治疗后的空 HP 按满血显示</div></div>${statBlock(s)}</div>
    <div class="dt-sec"><h5>配音</h5>${voice}</div>
    ${panelAudioSettings()}
    <div class="acts">${acts}</div>`;
}
function panelSelect(scope, index) {
  panelSelection = { scope, index };
  renderPanel();
}
function renderPanel() {
  let el = PD.getElementById('pkm-kanto-panel');
  if (!el) {
    el = PD.createElement('div'); el.id = 'pkm-kanto-panel'; el.className = 'pkb show'; PD.body.appendChild(el);
    el.addEventListener('click', onPanelClick);
    el.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const pick = e.target.closest?.('[data-select]'); if (!pick) return;
      e.preventDefault(); panelSelect(pick.dataset.select, Number(pick.dataset.i));
    });
    el.addEventListener('input', onPanelInput); el.addEventListener('change', onPanelChange);
  }
  el.classList.add('show');
  const pkm = readPkm();
  const count = pkm.party.slots.filter(hasMon).length;
  if (panelSelection) {
    const source = panelSelection.scope === 'party' ? pkm.party.slots : pkm.party.box;
    if (!hasMon(source?.[panelSelection.index])) panelSelection = null;
  }
  let muted = false; try { muted = P.localStorage?.getItem('pkmKantoMute') === '1'; } catch (_) {}
  const resetIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-6.6 8-13A8 8 0 1 0 4 9c0 6.4 8 13 8 13Z" fill="#ff557c"/><circle cx="12" cy="9" r="2.5" fill="#fff"/></svg>';
  const soundIcon = muted
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3Z" fill="currentColor"/><path d="m16 9 5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3Z" fill="currentColor"/><path d="M16 8a6 6 0 0 1 0 8M18.5 5.5a9.5 9.5 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
  el.innerHTML = `<div class="pb-head"><h3><i></i>宝可梦</h3><div class="pb-tools"><div class="pb-tabs"><button type="button" data-tab="party" class="${panelTab === 'party' ? 'on' : ''}">队伍 ${count}/6</button><button type="button" data-tab="box" class="${panelTab === 'box' ? 'on' : ''}">仓库</button></div>
    <div class="pb-icons"><button type="button" class="pb-x" data-op="resetpos" title="把精灵球放回右下角" aria-label="复位精灵球">${resetIcon}</button><button type="button" class="pb-x" data-op="mute" title="跟随宝可梦的叫声" aria-label="切换叫声">${soundIcon}</button><button type="button" class="pb-x" data-op="close" aria-label="关闭">${closeIcon}</button></div></div></div>
    <div class="pb-body"><div class="pb-left">${panelTab === 'party' ? panelPartyMarkup(pkm) : panelStorageMarkup(pkm)}</div><div class="pb-right ${panelSelection ? 'show' : ''}">${panelDetailMarkup(pkm)}</div></div>
    <div class="pb-foot"><span>点击宝可梦查看详情</span><span class="pf-r">队伍 ${count}/6 · 仓库 ${pkm.party.box.length}</span></div><div class="toast"></div>`;
  placePanel();
  const mons = panelTab === 'party' ? pkm.party.slots.filter(hasMon) : pkm.party.box.filter(hasMon);
  probePanel(mons);
}
// 叫声音量：拖动滑块实时记下，松手后用跟随（或首发）的宝可梦试听一声
function onPanelInput(e) {
  const t = e.target; if (t?.dataset?.op !== 'vol') return;
  lsSet('pkmKantoCryVol', t.value); const v = t.parentElement?.querySelector('.vv'); if (v) v.textContent = t.value;
}
function onPanelChange(e) { const t = e.target; if (t?.dataset?.op === 'vol') { lsSet('pkmKantoCryVol', t.value); previewCry(); } }
function previewMon() { const p = readPkm(), mons = [...p.party.slots, ...p.party.box].filter(hasMon); return mons.find(x => x.uid && x.uid === p.party.follow) || mons.find(x => x.isLead) || mons[0] || null; }
function previewCry(s = previewMon(), voice) { if (s) cry(s, voice); }
// 配音相关按钮（不写变量，只改本机设置；单只设置需要宝可梦的 uid，没有就先写一次变量补上）
async function onVoiceOp(b) {
  const op = b.dataset.op;
  if (op === 'gvoice') { lsSet('pkmKantoCrySrc', VOICES.includes(b.dataset.v) ? b.dataset.v : 'anime'); renderPanel(); previewCry(); return; }
  if (op === 'fallback') { lsSet('pkmKantoCryFallback', FALLBACKS.includes(b.dataset.v) ? b.dataset.v : 'game'); renderPanel(); previewCry(undefined, 'anime'); return; }
  if (op === 'cbase-save') {
    const v = String(b.parentElement?.querySelector('[data-op=cbase]')?.value || '').trim();
    if (v && !/^(https?:\/\/|\/)/i.test(v)) { toast('录音地址要以 http(s):// 或 / 开头，例如 /pkm-cries/', 'warning'); return; }
    setCryBase(v); cryUnsure.clear(); toast(v ? '动漫录音地址已保存：' + CRY_BASE : '已恢复默认录音地址'); renderPanel(); return;
  }
  const where = b.dataset.w, i = Number(b.dataset.i);
  const pick = p => (where === 'box' ? p.party.box : p.party.slots)[i];
  let s = pick(readPkm()); if (!hasMon(s)) return;
  if (op === 'voice') {
    if (!s.uid) { await writePkm(() => {}); s = pick(readPkm()); } // 写一次变量会给每只都补上 uid
    const key = monCryKey(s); if (!key) { toast('这只宝可梦还没有身份标识，稍后再试', 'warning'); return; }
    lsSet(key, VOICES.includes(b.dataset.v) ? b.dataset.v : null);
    renderPanel();
  }
  cry(s);
}
async function onPanelClick(e) {
  const b = e.target.closest('button');
  if (b) {
    if (b.dataset.tab) { panelTab = b.dataset.tab; panelSelection = null; renderPanel(); return; }
    if (b.dataset.page) {
      const pkm = readPkm(), pages = Math.max(1, Math.ceil((pkm.party.box.length + 1) / 30));
      panelBoxPage = (panelBoxPage + Number(b.dataset.page) + pages) % pages;
      panelSelection = null; renderPanel();
      if (pages === 1) toast(`当前仓库共 ${pkm.party.box.length} 只，只有第 1 页。`);
      return;
    }
    const op = b.dataset.op, i = Number(b.dataset.i);
    if (['voice', 'hear', 'gvoice', 'fallback', 'cbase-save'].includes(op)) { try { await onVoiceOp(b); } catch (err) { toast(err?.message || String(err), 'warning'); } return; }
    if (op === 'close') { PD.getElementById('pkm-kanto-panel')?.remove(); return; }
    if (op === 'back') { panelSelection = null; renderPanel(); return; }
    if (op === 'resetpos') { saveBallPos(null); placeBall(PD.getElementById('pkm-kanto-ball')); return; }
    if (op === 'mute') { try { const m = P.localStorage.getItem('pkmKantoMute') === '1'; P.localStorage.setItem('pkmKantoMute', m ? '0' : '1'); } catch (_) {} renderPanel(); return; }
    if (op === 'vol' || op === 'cbase') return;
    if (!['lead', 'follow', 'tobox', 'toparty'].includes(op)) return;
    const before = readPkm();
    const oldTab = panelTab, oldSelection = panelSelection ? { ...panelSelection } : null;
    let nextSelection = null;
    if (op === 'tobox') nextSelection = { scope: 'box', index: before.party.box.length };
    if (op === 'toparty') {
      const targetIndex = before.party.slots.findIndex(x => !hasMon(x));
      if (targetIndex >= 0) nextSelection = { scope: 'party', index: targetIndex };
    }
    try {
      await writePkm(pkm => {
        const slots = pkm.party.slots;
        if (op === 'lead') slots.forEach((s, k) => { if (hasMon(s)) s.isLead = k === i; });
        else if (op === 'follow') { const s = b.dataset.w === 'box' ? pkm.party.box[i] : slots[i]; if (!s.uid) s.uid = uid(); pkm.party.follow = pkm.party.follow === s.uid ? null : s.uid; if (pkm.party.follow) { const snap = clone(s); setTimeout(() => { cry(snap); }, 650); } }
        else if (op === 'tobox') {
          if (slots.filter(hasMon).length <= 1) throw new Error('队伍里至少要留一只宝可梦');
          const s = slots[i]; const wasLead = s.isLead; s.isLead = false; delete s.slot; pkm.party.box.push(s);
          slots.splice(i, 1); slots.push(emptySlot(6));
          const packed = slots.filter(hasMon).concat(slots.filter(x => !hasMon(x)));
          packed.forEach((x, k) => { x.slot = k + 1; }); pkm.party.slots = packed;
          if (wasLead) { const first = packed.find(hasMon); if (first) first.isLead = true; }
        } else if (op === 'toparty') {
          const idx = slots.findIndex(x => !hasMon(x)); if (idx < 0) throw new Error('队伍已满 6 只');
          const [s] = pkm.party.box.splice(i, 1); s.slot = idx + 1; s.isLead = !slots.some(hasMon); slots[idx] = s;
        }
      });
      if (nextSelection) { panelTab = nextSelection.scope === 'party' ? 'party' : 'box'; panelSelection = nextSelection; }
      renderPanel();
    } catch (err) {
      panelTab = oldTab; panelSelection = oldSelection;
      toast(err.message || String(err), 'warning'); renderPanel();
    }
    return;
  }
  const pick = e.target.closest('[data-select]');
  if (pick) { panelSelect(pick.dataset.select, Number(pick.dataset.i)); return; }
}

/* ======================================================================
 * 10. 对战：入口卡片（pkm-modal-v1）↔ 对战窗口 ↔ 自己的网页
 * ==================================================================== */
const sessions = new Map(); // key -> { key, token, source, cfg, status, summary, resultText }
let modal = null;          // 当前打开的对战窗口
const battleHash = key => 'b' + hash(String(key)).toString(36);
function storedBattle(key) { return readPkm().integration.battles[battleHash(key)] || null; }
function entryStatus(sess, extra = {}) {
  if (!sess?.source) return;
  const rec = storedBattle(sess.key);
  const ended = !!rec || sess.status === 'ended';
  const open = !!modal && modal.key === sess.key;
  const summary = extra.summary || (ended ? `已结束：${rec?.summary || sess.summary || ''}` : open ? '对战进行中……' : sess.error ? '上次打开失败：' + sess.error : '对战系统已就绪，点击开始。');
  // v1.3.8：按当前队伍算好的赛制，入口卡片上显示（例：3v3 · 我方只有2只，照常开战）
  // v1.3.9：和 NPC 对战默认两边全队；伙伴漏写的宝可梦按原作进度补上后，入口卡片的对手阵容也跟着更新
  let format = '', rule = '', team = '', added = [];
  try {
    if (sess.cfg) {
      const { comp, fmt: f } = battleCfg(sess.cfg, playerEntries(readPkm()).length); format = f.label; rule = f.rule || '';
      if (comp.added.length) { added = comp.added; team = `${teamText(sess.cfg.team)} ＋ ${comp.added.join('、')}（${comp.who}现在带着的，按原作进度补上）`; }
    }
  } catch (e) { LOG('入口卡片赛制计算失败', e); }
  try { postFromHost(sess.source, { channel: CH, type: 'status', key: sess.key, token: sess.token, summary, ended, open, error: sess.error || null, format, rule, team, added }); } catch (_) {}
}
function onHostMessage(e) {
  const d = e.data; if (!d || typeof d !== 'object') return;
  if (d.channel === CH) {
    if (!d.key || !d.token) return;
    let sess = sessions.get(d.key);
    if (!sess || sess.token !== d.token) { sess = { ...(sess || {}), key: d.key, token: d.token, status: sess?.status || 'idle' }; sessions.set(d.key, sess); }
    sess.source = e.source;
    if (d.type === 'hello') { if (d.cfg && typeof d.cfg === 'object') sess.cfg = d.cfg; entryStatus(sess); }
    else if (d.type === 'open') {
      if (d.cfg) sess.cfg = d.cfg;
      const rec = storedBattle(d.key);
      if (rec) { showStoredResult(rec); entryStatus(sess); return; }
      openBattle({ source: 'story', key: d.key, cfg: sess.cfg, sess });
    }
    return;
  }
  if (modal && e.source === modal.frame?.contentWindow) onEngineMessage(d);
}
function playerEntries(pkm) {
  const slots = pkm.party.slots.map((s, i) => ({ s, i })).filter(x => hasMon(x.s) && x.s.status !== '濒死' && x.s.hp !== 0);
  slots.sort((a, b) => (b.s.isLead ? 1 : 0) - (a.s.isLead ? 1 : 0));
  return slots.map(({ s, i }) => {
    const e = { species: s.species || s.name, level: Number(s.lv) || 5, moves: (s.moves || []).filter(Boolean), hostSlot: i };
    if (s.nickname) e.nickname = s.nickname;
    if (s.nature) e.nature = s.nature; if (s.ability) e.ability = s.ability;
    if (s.gender) e.gender = s.gender; if (s.shiny) e.shiny = true;
    if (s.hp != null && s.maxHp) { e.hp = Number(s.hp); e.maxHp = Number(s.maxHp); }
    if (s.status && s.status !== '濒死') e.status = s.status;
    const iv = s.stats_meta?.ivs; if (iv && K.STAT_KEYS.every(k => ivOk(iv[k]))) e.ivs = { ...iv };
    // v1.3.4：招式剩余 PP 跨战斗继承（hp 为 null = 刚治疗过，全满）
    if (s.hp != null && isObj(s.pp)) { const pp = {}; for (const m of e.moves) if (Number.isFinite(Number(s.pp[m]))) pp[m] = Number(s.pp[m]); if (Object.keys(pp).length) e.pp = pp; }
    return e;
  });
}
/* @format-begin（tests/roster-voice.test.mjs 直接执行这一段）
 * 赛制（几 v 几）：
 *   野外 / 捕捉：对方只出 1 只；我方队伍里能战斗的都可以轮换上场——最多 6 只，没有 6 只就按实际只数（不补、不虚构）。
 *   和 NPC 对战（trainer / rival / rocket / boss，v1.3.9）：没约定几对几 = 两边全队——对方带着的全部 vs 我方能战斗的全部（各最多 6 只），
 *     只数可以不一样，哪边能战斗的全部倒下哪边输。剧情里明确约定了（对战块写 teamSize 或 format）才按 NvN。
 *   道馆 / 大会：NvN。N 的来源依次是：对战块的 teamSize（或 format:"3v3"）> 道馆规矩表（按事件、再按馆主）> 对方阵容只数。
 *   NvN 时双方都按“实际能上场的只数”开战（不足 N 只也照常开打）；参赛的全部失去战斗能力就立刻判负。
 *   NvN 且我方能战斗的多于 N 只时，开战前在对战窗口里点选参赛的 N 只（点选顺序 = 出场顺序）。 */
const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const fmtN = x => { const n = CN_NUM[x] || Number(x); return Number.isInteger(n) && n >= 1 && n <= 6 ? n : null; };
const RULE_TYPES = ['gym', 'league']; // 按规矩 NvN 的对战；其余（trainer / rival / rocket / boss / 没写）都算和 NPC 对战
// 3 / "3" / "3只" / "3v3" / "3对3" / "三对三" / "各3只" / "2v1" → { p: 我方上限, e: 对方上限 }
function parseFormat(v) {
  if (v == null || v === '' || typeof v === 'boolean' || typeof v === 'object') return null;
  const t = String(v).trim();
  let m = t.match(/^([1-6一二两三四五六])\s*只?$/);
  if (m) { const n = fmtN(m[1]); return n ? { p: n, e: n } : null; }
  m = t.match(/([1-6一二两三四五六])\s*(?:v|vs|对|比|:|：|x|×)\s*([1-6一二两三四五六])/i);
  if (m) { const a = fmtN(m[1]), b = fmtN(m[2]); return a && b ? { p: a, e: b } : null; }
  m = t.match(/各\s*([1-6一二两三四五六])\s*只/);
  if (m) { const n = fmtN(m[1]); return n ? { p: n, e: n } : null; }
  return null;
}
function tableFormat(cfg, type) {
  const ev = (String(cfg?.event || '').toUpperCase().match(/(?:EP|SP|MOV)\d{2,3}/) || String(cfg?.id || '').toUpperCase().match(/(?:EP|SP|MOV)\d{2,3}/) || [])[0];
  const byEvent = ev && K.EVENT_FORMATS?.[ev];
  if (byEvent && byEvent.type === type) return byEvent;
  if (type === 'gym') { const who = `${cfg?.opponent || ''} ${cfg?.title || ''} ${cfg?.id || ''}`; return (K.GYM_RULES || []).find(r => r.re.test(who)) || null; }
  return null;
}
// opts.full：玩家在选人界面点了“改成两边全队”（只对和 NPC 的对战有效）
function battleFormat(cfg, healthy, opts = {}) {
  const type = String(cfg?.type || 'trainer').toLowerCase();
  const listed = Array.isArray(cfg?.team) ? cfg.team.length : 0;
  const have = Math.max(0, Math.floor(Number(healthy) || 0));
  if (type === 'wild') {
    const player = Math.min(6, have);
    return { type, wild: true, npc: false, full: false, name: '野外', playerMax: 6, enemyMax: 1, player, enemy: Math.min(1, listed), source: 'wild',
      rule: '野外遭遇：对方只有 1 只，我方队伍里能战斗的都可以轮换上场（最多 6 只）',
      tag: `我方${player}只 vs 野生1只`, label: `野外 · 我方${player}只 vs 野生1只` };
  }
  const npc = !RULE_TYPES.includes(type);
  let f = null, source = 'cfg', rule = String(cfg?.rule || cfg?.rules?.text || '').trim();
  if (!(npc && opts.full)) for (const v of [cfg?.teamSize, cfg?.rules?.teamSize, cfg?.format, cfg?.rules?.format]) { f = parseFormat(v); if (f) break; }
  if (!f && npc) {
    // v1.3.9：和 NPC 对战，没约定几对几 → 两边全队（只数可以不一样）
    const player = Math.min(6, have), enemy = Math.min(6, listed);
    return { type, wild: false, npc: true, full: true, name: '两边全队', playerMax: 6, enemyMax: 6, player, enemy, source: opts.full ? 'override' : 'npc',
      rule: '两边全队：对方派出现在带着的全部宝可梦，我方能战斗的都可以轮换上场（各最多 6 只）；只数可以不一样，哪边能战斗的全部倒下哪边输',
      tag: `我方${player}只 vs 对方${enemy}只`, label: `两边全队 · 我方${player}只 vs 对方${enemy}只` };
  }
  if (!f) { const t = tableFormat(cfg, type); if (t) { f = { p: t.n, e: t.n }; source = 'table'; if (!rule) rule = t.rule; } }
  if (!f) { const n = Math.max(1, Math.min(6, listed || 1)); f = { p: n, e: n }; source = 'team'; }
  const player = Math.min(f.p, have), enemy = Math.min(f.e, listed), name = `${f.p}v${f.e}`;
  const short = [player < f.p ? `我方只有${player}只` : '', enemy < f.e ? `对方只有${enemy}只` : ''].filter(Boolean).join('、');
  if (!rule) rule = f.p === 1 && f.e === 1 ? '1v1：双方各出 1 只单挑' : f.p === f.e ? `${name}：双方各最多 ${f.p} 只，单打轮换` : `${name}：我方最多 ${f.p} 只，对方最多 ${f.e} 只`;
  if (npc && source === 'cfg') rule += '（剧情里约定的）';
  return { type, wild: false, npc, full: false, name, playerMax: f.p, enemyMax: f.e, player, enemy, source, rule,
    tag: name + (short ? `（${short}）` : ''), label: name + (short ? ` · ${short}，照常开战` : '') };
}
// 参赛名单：开战前点选过就按点选顺序；否则首发优先、按队伍顺序取到上限
function pickPlayers(entries, max, pick) {
  if (Array.isArray(pick) && pick.length) {
    const by = new Map(entries.map(e => [e.hostSlot, e])), out = [];
    for (const i of pick) { const e = by.get(i); if (e && !out.includes(e)) out.push(e); if (out.length >= max) break; }
    if (out.length) return out;
  }
  return entries.slice(0, max);
}
// 对手的简称（对战画面的标签 / 信息框用）：“华蓝道馆馆主 小霞” → “小霞”；太长就不写名字
function shortOpponent(cfg) {
  const raw = String(cfg?.opponent || '').replace(/[（(][^）)]*[）)]/g, ' ').trim();
  if (!raw) return '';
  const last = raw.split(/[\s·・]+/).filter(Boolean).pop() || '';
  return last.length <= 6 ? last : '';
}
// 对战画面里显示的文字：标签第一段 / 赛制段 / 敌方信息框的小标签 / 战斗记录第一行
function battleTexts(cfg, fmt, pN, eN) {
  const opp = shortOpponent(cfg), who = opp || '对方';
  const typeLabel = K.BATTLE_LABEL?.[fmt.type] || (fmt.wild ? '野生遭遇' : '训练家对战');
  const first = cfg?.team?.[0], firstName = typeof first === 'string' ? first : (first?.species || first?.name || '宝可梦');
  if (fmt.wild) return { typeLabel, opp, sideLabel: '野生', tag: `我方${pN}只 vs 野生1只`, intro: `【${typeLabel}】野生的${firstName}出现了！我方能战斗的 ${pN} 只都可以轮换上场。` };
  if (fmt.full) return { typeLabel, opp, sideLabel: opp || '对手', tag: `我方${pN}只 vs ${who}${eN}只`,
    intro: `【${typeLabel} · 两边全队】${who}带着 ${eN} 只宝可梦，我方能战斗的 ${pN} 只都可以轮换上场；哪边全部倒下哪边输。` };
  const short = [pN < fmt.playerMax ? `我方${pN}只` : '', eN < fmt.enemyMax ? `${who}${eN}只` : ''].filter(Boolean).join('、');
  return { typeLabel, opp, sideLabel: opp || '对手', tag: `${opp ? opp + ' · ' : ''}${fmt.name}${short ? `（${short}）` : ''}`,
    intro: `【${typeLabel} · ${fmt.name}】${who}派出 ${eN} 只，我方参赛 ${pN} 只；参赛的全部倒下就判负。` };
}
function engineConfig(spec, pkm, tag) {
  const cfg = spec.cfg || {};
  const entries = playerEntries(pkm);
  const fmt = battleFormat(cfg, entries.length, { full: !!spec.full }), type = fmt.type;
  const team = (Array.isArray(cfg.team) ? cfg.team : []).slice(0, fmt.enemyMax);
  // v1.3.4：对手 / 野生宝可梦也有个体值和性格（按这场对战的 key 固定，重开同一场不会变；收服后沿用）
  const band = ['gym', 'rival', 'boss', 'league'].includes(type) ? 'high' : null;
  const enemy = team.map((t, i) => {
    const e = typeof t === 'string' ? { species: t, level: 5 } : { species: t.species || t.name, level: Number(t.level || t.lv) || 5, moves: Array.isArray(t.moves) ? t.moves : [], ability: t.ability, nature: t.nature, gender: t.gender, shiny: !!t.shiny };
    const r = rng(hash(String(spec.key || cfg.id || '') + '#' + i + '#' + e.species));
    const giv = isObj(t?.ivs) && K.STAT_KEYS.every(k => ivOk(Number(t.ivs[k]))) ? Object.fromEntries(K.STAT_KEYS.map(k => [k, Number(t.ivs[k])])) : null;
    e.ivs = giv || rollIvs(band, r);
    if (!natureZh(e.nature)) e.nature = rollNature(r);
    return e;
  });
  const party = pickPlayers(entries, fmt.playerMax, spec.pick);
  const tx = battleTexts(cfg, fmt, party.length, enemy.length);
  const balls = Object.fromEntries(Object.entries(K.BALL_ZH).map(([id, zh]) => [id, Math.max(0, Math.floor(Number(pkm.player.bag[zh]) || 0))]));
  const out = { rules: { teamSize: Math.max(fmt.playerMax, fmt.enemyMax), playerLimit: fmt.playerMax, enemyLimit: fmt.enemyMax, tag: tx.tag, label: fmt.label, rule: fmt.rule,
      typeLabel: tx.typeLabel, opponent: tx.opp, sideLabel: tx.sideLabel },
    encounter: { type: fmt.wild ? 'wild' : 'trainer' }, difficulty: cfg.difficulty || K.DIFFICULTY_BY_TYPE[type] || 'normal',
    p1: { entrants: [{ name: 'host-player', party }] }, p2: { entrants: [{ name: 'host-enemy', party: enemy }] },
    host: { tag, balls, intro: tx.intro }, ui: spec.ui || null };
  // Normalize legacy Chinese/string environments and structured weather+terrain.
  const rawEnv = typeof cfg.environment === 'object' && cfg.environment ? cfg.environment : {weather: cfg.environment};
  const w = K.WEATHER[String(rawEnv.weather || '').trim()] || rawEnv.weather;
  if (w || rawEnv.terrain) out.environment = { weather: w || null, weatherTurns: rawEnv.weatherTurns ?? 0,
    terrain: rawEnv.terrain || null, terrainTurns: rawEnv.terrainTurns ?? 0 };
  return { engine: out, balls, type, fmt };
}
/* @format-end */
/* @roster-begin（tests/npc-roster.test.mjs 直接执行这一段）
 * v1.3.9 伙伴阵容兜底：和小智 / 小霞 / 小刚对战时，对战块里漏写的成员按原作进度（K.NPC_ROSTERS）补上。
 *   AI 写了的照写的来（顺序不变，第一只仍是首发），只把漏掉的接在后面；进化过的认作同一只，不会重复。
 *   对战块写 "exact":true（剧情改变了伙伴阵容）时不补。 */
// pos：{ index: 事件ID → 序号（没有返回 -1）, cur: 当前事件序号, node: 当前节点, finished, skipped: Set(被跳过的事件ID) }
function pointPassed(point, pos) {
  if (!point) return true;
  const [ev, nd] = String(point).split('#');
  if (pos.skipped?.has(ev)) return false;
  if (pos.finished) return true;
  const i = pos.index(ev); if (i < 0) return false;
  return pos.cur > i || (nd != null && pos.cur === i && pos.node > Number(nd));
}
// 这一段剧情（当前节点；整集结束才生效的看最后一个节点）里会加入的成员：生成前注入提醒 AI，免得收服后还按旧名单写
function joiningNow(point, pos) {
  if (!point || pos.finished || pointPassed(point, pos)) return false;
  const [ev, nd] = String(point).split('#'); const i = pos.index(ev);
  if (i < 0 || i !== pos.cur || pos.skipped?.has(ev)) return false;
  return nd != null ? pos.node === Number(nd) : pos.node === pos.total;
}
function rosterNow(r, pos) {
  const out = [];
  for (const m of r?.members || []) {
    if (m.join && !pointPassed(m.join, pos)) continue;
    if (m.leave && pointPassed(m.leave, pos)) continue;
    let k = 0; for (const p of m.evolve || []) { if (m.forms[k + 1] && pointPassed(p, pos)) k++; else break; }
    out.push({ species: m.forms[k], forms: m.forms, ace: !!m.ace });
  }
  return out;
}
const OPP_SPLIT = /[\s·・,，、\/&＆+＋]+|以及|与|和|跟|及/;
function companionOf(cfg, rosters, mode) {
  if (!cfg || String(cfg.type || '').toLowerCase() === 'wild') return null;
  const raw = String(cfg.opponent || '').replace(/[（(][^）)]*[）)]/g, ' ').trim(); if (!raw) return null;
  const tokens = raw.split(OPP_SPLIT).map(t => t.trim()).filter(Boolean);
  const hits = Object.entries(rosters || {}).filter(([, r]) => {
    const names = [r.name, ...(r.alias || [])].filter(Boolean);
    return tokens.some(t => names.some(n => t === n || (t.endsWith(n) && t.length - n.length <= 8)));
  }).map(([k]) => k);
  if (hits.length !== 1) return null; // 没对上，或者一场里有两个伙伴（说不清是谁的队伍）
  const r = rosters[hits[0]];
  if (r.skipMode && String(mode || '').includes(r.skipMode)) return null; // 小智模式：{{user}} 就是小智
  return hits[0];
}
// env：{ rosters, pos, mode, zh: 名字 → 官方中文名 }；返回 { team: 补全后的阵容, added: 补上的种类, who: 伙伴名 }
function completeTeam(cfg, env) {
  const team = Array.isArray(cfg?.team) ? cfg.team.slice() : [];
  const res = { team, added: [], who: null };
  if (!team.length || !env?.pos || !env.rosters) return res;
  if (cfg.exact === true || /^(true|exact|实际|准确)$/i.test(String(cfg.exact ?? cfg.roster ?? ''))) return res;
  const key = companionOf(cfg, env.rosters, env.mode); if (!key) return res;
  res.who = env.rosters[key].name;
  const zh = env.zh || (x => x);
  const nameOf = t => zh(String(typeof t === 'string' ? t : (t?.species || t?.name || '')).trim());
  const listed = team.map(nameOf), used = new Set(), missing = [];
  for (const m of rosterNow(env.rosters[key], env.pos)) {
    const k = listed.findIndex((sp, i) => !used.has(i) && m.forms.includes(sp));
    if (k >= 0) used.add(k); else missing.push(m);
  }
  const lv = team.map(t => Number(t && typeof t === 'object' ? (t.level ?? t.lv) : NaN)).filter(n => Number.isFinite(n) && n > 0);
  const ref = lv.length ? Math.max(...lv) : 5;
  for (const m of missing) {
    if (team.length >= 6) break;
    team.push({ species: m.species, level: Math.max(2, Math.min(100, Math.round(ref) + (m.ace ? 2 : 0))), auto: true });
    res.added.push(m.species);
  }
  return res;
}
/* @roster-end */
// 当前剧情进度（伙伴阵容兜底用）：和生成前注入用的是同一套定位
function storyPos() {
  try {
    const { list } = events(); if (!list.length) return null;
    const pos = plotPosition(); if (!pos) return null;
    const index = Object.fromEntries(list.map((e, i) => [e.id, i]));
    const skipped = new Set();
    for (const m of chat()) {
      if (m?.is_user) continue;
      const x = parseState(m?.mes)?.剧情?.match(/([A-Z]{2,3}\d{2,3})\s*[｜|]\s*节点\s*\d+\s*[｜|]\s*跳过/); if (x) skipped.add(x[1]);
    }
    const idx = id => (index[id] ?? -1);
    return pos.finished ? { index: idx, cur: list.length, node: 1, total: 1, finished: true, skipped, mode: pos.mode }
      : { index: idx, cur: index[pos.event.id], node: pos.node, total: pos.total, finished: false, skipped, mode: pos.mode };
  } catch (e) { LOG('剧情进度读取失败', e); return null; }
}
const zhName = n => zhSpecies(speciesId(n)) || n;
function npcCompletion(cfg) {
  if (!cfg || String(cfg.type || '').toLowerCase() === 'wild') return { team: Array.isArray(cfg?.team) ? cfg.team : [], added: [], who: null };
  const pos = storyPos();
  return completeTeam(cfg, { rosters: K.NPC_ROSTERS, pos, mode: pos?.mode || latestState()?.state?.模式 || readPkm().world.mode, zh: zhName });
}
// 对战块 + 伙伴阵容兜底 → 实际开战用的配置和赛制。
// comp.added 只算真正会上场的（约定 1v1 时补进来的排在后面，不上场就不提）；comp.all = 补上的全部（改成两边全队时用）
function battleCfg(cfg, healthy, opts = {}) {
  const c = npcCompletion(cfg);
  const eff = c.added.length ? { ...cfg, team: c.team } : cfg;
  const fmt = battleFormat(eff, healthy, opts);
  const base = Array.isArray(cfg?.team) ? cfg.team.length : 0;
  return { cfg: eff, fmt, comp: { who: c.who, all: c.added, added: c.added.slice(0, Math.max(0, fmt.enemyMax - base)) } };
}
const teamText = team => (team || []).map(p => (typeof p === 'string' ? p : `${p.species || p.name || '?'}${p.level || p.lv ? ' Lv' + (p.level || p.lv) : ''}`)).join(' / ');
function openBattle(spec) {
  if (modal) { toast('已经有一场对战在进行中'); return; }
  const pkm = readPkm();
  const sess = spec.sess || null;
  if (!spec.cfg || !Array.isArray(spec.cfg.team) || !spec.cfg.team.length) { toast('对战块里没有对手宝可梦（team）', 'warning'); if (sess) { sess.error = '对战块缺少 team'; entryStatus(sess); } return; }
  const entries = playerEntries(pkm);
  if (!entries.length) {
    const msg = pkm.party.slots.some(hasMon) ? '队伍里的宝可梦都失去了战斗能力，先去宝可梦中心治疗吧。' : '你还没有宝可梦，不能对战。';
    toast(msg, 'warning'); if (sess) { sess.error = msg; entryStatus(sess); } return;
  }
  // v1.3.9：和小智 / 小霞 / 小刚对战时，对战块漏写的伙伴宝可梦按原作进度补上
  const { cfg, comp, fmt } = battleCfg(spec.cfg, entries.length, { full: !!spec.full });
  ensureHostStyle();
  const el = PD.createElement('div'); el.id = 'pkm-kanto-modal'; el.className = 'pkb';
  const title = cfg.title || `${K.TYPE_LABEL[fmt.type] || '对战'}${cfg.opponent ? ' · ' + cfg.opponent : ''}`;
  el.innerHTML = `<div class="bar"><span class="t">⚔️ ${esc(title)}</span><span class="fmt" title="${esc(fmt.rule)}">${esc(fmt.label)}</span><span class="s"></span><a href="${esc(BASE)}preview.html?v=${VERSION}" target="_blank" rel="noopener noreferrer" style="color:inherit;font-size:12px;white-space:nowrap">效果预览 ↗</a><button class="red" data-op="close">返回剧情</button></div><div class="stage"></div>`;
  PD.body.appendChild(el);
  modal = { el, frame: null, tag: null, key: spec.key, spec, cfg, comp, fmt, engine: null, balls: null, type: fmt.type, sent: false, done: false, sess, timer: null };
  if (sess) { sess.status = 'open'; sess.error = null; entryStatus(sess); }
  el.querySelector('[data-op=close]').onclick = closeBattle;
  if (comp.added.length) toast(`${comp.who}现在带着 ${cfg.team.length} 只：对战块漏写的${comp.added.join('、')}已按原作进度补上`, 'info');
  if (!fmt.wild && !fmt.full && entries.length > fmt.playerMax && !Array.isArray(spec.pick)) showPicker(modal, pkm, entries);
  else launchBattle(modal, spec.pick || null);
}
// 真正开战：建对战网页的 iframe 并发配置（选人之后才走到这里）
function launchBattle(m, pick) {
  if (modal !== m) return;
  const pkm = readPkm(); // 选人期间变量可能变了，按最新的算
  const tag = uid();
  const { engine, balls, type, fmt } = engineConfig({ ...m.spec, cfg: m.cfg, pick }, pkm, tag);
  if (!engine.p1.entrants[0].party.length) { toast('队伍里的宝可梦都失去了战斗能力，先去宝可梦中心治疗吧。', 'warning'); closeBattle(true); return; }
  Object.assign(m, { tag, engine, balls, type, fmt });
  const f = m.el.querySelector('.bar .fmt'); if (f) { const pN = engine.p1.entrants[0].party.length, eN = engine.p2.entrants[0].party.length; f.textContent = fmt.wild ? fmt.label : `${fmt.name} · 我方${pN}只 vs ${engine.rules.opponent || '对方'}${eN}只`; f.title = fmt.rule; }
  const stage = m.el.querySelector('.stage');
  const frame = PD.createElement('iframe');
  frame.setAttribute('allow', 'autoplay'); frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
  frame.src = `${BASE}index.html?embed=1&v=${VERSION}&t=${Date.now().toString(36)}`;
  stage.replaceWith(frame);
  m.frame = frame;
  setBar(m.cfg.lines?.start ? '「' + m.cfg.lines.start + '」' : '正在连接对战系统……');
  const send = () => { if (modal !== m || m.sent) return; m.sent = true; try { m.frame.contentWindow.postMessage({ type: 'PKM_BATTLE_CONFIG', payload: engine }, '*'); } catch (err) { LOG(err); } };
  frame.addEventListener('load', () => setTimeout(send, 30));
  m.timer = setTimeout(() => { if (modal === m && !m.started && !m.done) setBar('对战网页加载较慢或失败：请确认网站已部署 v' + VERSION + '（页脚版本号），再点“返回剧情”后重试。'); }, 15000);
}
// v1.3.8：我方能战斗的多于 N 只时，开战前点选参赛的 N 只（默认勾好首发 + 队伍顺序；点选顺序 = 出场顺序）
function showPicker(m, pkm, entries) {
  const n = m.fmt.playerMax, ok = new Set(entries.map(e => e.hostSlot));
  let sel = entries.slice(0, n).map(e => e.hostSlot);
  const stage = m.el.querySelector('.stage'); stage.className = 'stage pick';
  const draw = () => {
    const cards = pkm.party.slots.map((s, i) => {
      if (!hasMon(s)) return '';
      const can = ok.has(i), k = sel.indexOf(i), h = curHp(s);
      return `<button type="button" class="pk-pick${k >= 0 ? ' on' : ''}" data-op="pick" data-i="${i}"${can ? '' : ' disabled'}>${k >= 0 ? `<em>${k + 1}</em>` : ''}${spriteImg(s.species || s.name, { shiny: s.shiny })}<b>${esc(monName(s))}</b><small>Lv${esc(s.lv ?? '?')} · ${can ? (h.max && !h.full ? `HP ${h.hp}/${h.max}` : 'HP 满') + (s.status ? '·' + esc(s.status) : '') : '濒死，不能参赛'}</small>${can ? hpBar(s) : ''}</button>`;
    }).join('');
    const npcOpt = m.fmt.npc ? `<div class="pk-pickalt">这是剧情里约定的 ${esc(m.fmt.name)}。不想按约定打？<button type="button" class="ghost" data-op="pick-full">改成两边全队</button>（对方派出全部 ${m.cfg.team.length} 只，我方能战斗的都上）</div>` : '';
    stage.innerHTML = `<div class="pk-pickbox"><h3>选出参赛的 ${n} 只宝可梦</h3><p>${esc(m.fmt.rule)}。<br>${n === 1 ? '参赛的这 1 只失去战斗能力就判负' : `参赛的 ${n} 只全部失去战斗能力就判负`}；没选上的这场不上场，体力也不变。点选顺序就是出场顺序（①号首发）。</p><div class="pk-pickgrid">${cards}</div>${npcOpt}<div class="pk-pickfoot"><span>已选 ${sel.length} / ${n}</span><button type="button" class="ghost" data-op="pick-auto">按队伍顺序</button><button type="button" class="red" data-op="pick-go"${sel.length === n ? '' : ' disabled'}>开始对战（${esc(m.fmt.name)}）</button></div></div>`;
  };
  stage.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled || modal !== m) return;
    const op = b.dataset.op;
    if (op === 'pick') {
      const i = Number(b.dataset.i), k = sel.indexOf(i);
      if (k >= 0) sel.splice(k, 1); else if (sel.length < n) sel.push(i); else if (n === 1) sel = [i]; else { toast(`最多选 ${n} 只：先点掉一只再换`); return; }
      draw(); return;
    }
    if (op === 'pick-auto') { sel = entries.slice(0, n).map(e => e.hostSlot); draw(); return; }
    if (op === 'pick-full' && m.fmt.npc) { // v1.3.9：和 NPC 的约定赛改成两边全队
      m.spec.full = true; m.fmt = battleFormat(m.cfg, playerEntries(readPkm()).length, { full: true });
      if (m.comp?.all?.length) { m.comp = { ...m.comp, added: m.comp.all }; toast(`${m.comp.who}派出现在带着的全部 ${m.cfg.team.length} 只（${m.comp.all.join('、')}按原作进度补上）`, 'info'); }
      const f = m.el.querySelector('.bar .fmt'); if (f) { f.textContent = m.fmt.label; f.title = m.fmt.rule; }
      stage.className = 'stage'; launchBattle(m, null); return;
    }
    if (op === 'pick-go' && sel.length === n) {
      // 记 uid 再换回槽位：选人期间如果队伍顺序变了也不会选错
      const uids = sel.map(i => pkm.party.slots[i]?.uid || null), fresh = readPkm();
      const pick = sel.map((i, k) => { const u = uids[k]; const j = u ? fresh.party.slots.findIndex(x => x?.uid === u) : -1; return j >= 0 ? j : i; });
      launchBattle(m, pick);
    }
  });
  draw();
  setBar(`${m.fmt.name}：先选出参赛的 ${n} 只`);
}
function setBar(text) { const s = modal?.el.querySelector('.bar .s'); if (s) s.textContent = text; }
function closeBattle(silent) {
  if (!modal) return;
  const m = modal; modal = null; clearTimeout(m.timer); m.el.remove();
  if (m.sess) { if (!m.done) m.sess.status = 'idle'; entryStatus(m.sess); }
  if (!m.done && silent !== true) toast(m.frame ? '对战没有结束，已放弃。可以重新点“开始对战”。' : '还没开战，已取消。可以重新点“开始对战”。');
}
function onEngineMessage(d) {
  const m = modal; if (!m) return;
  if (d.type === 'PKM_BATTLE_READY' && !m.sent) { m.sent = true; m.frame.contentWindow.postMessage({ type: 'PKM_BATTLE_CONFIG', payload: m.engine }, '*'); }
  else if (d.type === 'PKM_BATTLE_STARTED') { m.started = true; setBar(m.cfg.lines?.start ? '「' + m.cfg.lines.start + '」' : '对战开始！'); }
  else if (d.type === 'PKM_BATTLE_ERROR') { m.started = true; setBar('对战配置有误：' + (d.payload?.message || '')); if (m.sess) { m.sess.error = d.payload?.message || '配置有误'; entryStatus(m.sess); } }
  else if (d.type === 'PKM_BATTLE_RESULT' && d.payload && (!d.hostTag || d.hostTag === m.tag) && (!d.payload.hostTag || d.payload.hostTag === m.tag)) {
    if (m.done) return; m.done = true;
    applyResult(m, d.payload).then(r => {
      setBar(`${r.outcomeZh}！结果已写入变量并填进输入框——点“返回剧情”后发送即可继续。`);
      const b = m.el.querySelector('[data-op=close]'); if (b) b.textContent = '返回剧情 ›';
      if (m.sess) { m.sess.status = 'ended'; m.sess.summary = r.summary; entryStatus(m.sess); }
    }).catch(err => { LOG('写回失败', err); setBar('结果写回失败：' + (err?.message || err)); toast('对战结果写回变量失败：' + (err?.message || err), 'error'); });
  }
}
const OUTCOME_ZH = { victory: '胜利', defeat: '败北', captured: '收服成功', draw: '平局/中止' };
function monFromCapture(cap, enemy, cfgEnemy, pkm) {
  const spec = cap.spec || {};
  const zhName = zhSpecies(spec.species || cap.species);
  const mon = emptySlot(1);
  Object.assign(mon, {
    name: zhName, species: zhName, nickname: null, gender: spec.gender || cfgEnemy?.gender || null, lv: spec.level || enemy?.level || 5,
    quality: null, nature: zhNature(spec.nature) || K.NATURES[Math.floor(Math.random() * K.NATURES.length)], ability: zhAbility(spec.ability),
    shiny: !!spec.shiny, moves: [0, 1, 2, 3].map(i => (spec.moves?.[i] ? zhMove(spec.moves[i]) : null)),
    hp: cap.hpAtCapture ?? enemy?.hp ?? null, maxHp: enemy?.maxHp ?? null, status: K.STATUS_TO_ZH[cap.statusAtCapture] || null,
    ball: K.BALL_ZH[cap.ball] || '精灵球', uid: uid(), met: `${dateText(pkm)} · ${placeText(pkm)}，用${K.BALL_ZH[cap.ball] || '精灵球'}收服`, notes: null,
  });
  if (spec.ivs && K.STAT_KEYS.every(k => ivOk(spec.ivs[k]))) mon.stats_meta.ivs = { ...spec.ivs };
  ensureIndividual(mon); // 资质按个体值推算；缺项补齐
  return mon;
}
// v1.3.8：胜负判定说明（参赛的全部失去战斗能力 = 判负）；v1.3.9：两边全队
function verdictText(outcome, fmt, pTeam, eTeam) {
  const pn = pTeam.length, en = eTeam.length;
  if (outcome === 'defeat') return fmt?.wild || fmt?.full ? `我方能战斗的${pn}只全部失去战斗能力，判负`
    : `我方参赛的${pn}只全部失去战斗能力，判负${fmt?.playerMax > pn ? `（不足 ${fmt.playerMax} 只照常开战，${pn} 只全倒即输）` : ''}`;
  if (outcome === 'victory') return fmt?.wild ? `野生的${zhSpecies(eTeam[0]?.baseSpecies || eTeam[0]?.species) || '宝可梦'}失去战斗能力，获胜`
    : fmt?.full ? `对方的${en}只全部失去战斗能力，获胜` : `对方参赛的${en}只全部失去战斗能力，获胜`;
  if (outcome === 'captured') return '收服成功，对战结束';
  return '对战中止，不计胜负';
}
async function applyResult(m, payload) {
  const outcome = payload.outcome || (payload.winner === 'player' ? 'victory' : payload.winner === 'enemy' ? 'defeat' : 'draw');
  const cfg = m.cfg, cfgTeam = Array.isArray(cfg.team) ? cfg.team : [];
  const fmt = m.fmt || battleFormat(cfg, (payload.playerTeam || []).length);
  const pN = (payload.playerTeam || []).length, eN = (payload.enemyTeam || []).length;
  const fmtText = fmt.wild ? `野外 · ${fmt.tag}` : fmt.full ? `两边全队（我方${pN}只 vs 对方${eN}只）` : fmt.name;
  let placed = null, capturedName = null;
  let summaryParts = [];
  const bondNotes = [];
  const result = await writePkm(pkm => {
    summaryParts = []; bondNotes.length = 0; placed = null; capturedName = null; // writePkm 可能重算
    const won = outcome === 'victory' || outcome === 'captured';
    // 1) 我方体力 / 异常状态
    for (const p of payload.playerTeam || []) {
      const s = pkm.party.slots[p.hostSlot]; if (!hasMon(s)) continue;
      s.hp = p.fainted ? 0 : p.hp; s.maxHp = p.maxHp; s.status = p.fainted ? '濒死' : (K.STATUS_TO_ZH[p.status] || null);
      // v1.3.4：剩余 PP 写回（按招式中文名记录；满的不记）
      if (Array.isArray(p.moves)) {
        const pp = {};
        for (const name of (s.moves || []).filter(Boolean)) { const id = moveIdOf(name); const mv = p.moves.find(x => x.id === id); if (mv && Number.isFinite(mv.ppLeft) && mv.ppLeft < mv.pp) pp[name] = mv.ppLeft; }
        s.pp = Object.keys(pp).length ? pp : null;
      }
      // v1.3.4：并肩作战加羁绊——出场 → 信任 +1；赢了 → 热情 +1
      if (p.participated !== false) {
        ensureIndividual(s);
        const av = s.friendship.avs;
        av.trust = clampAv((av.trust || 0) + 1); if (won) av.passion = clampAv((av.passion || 0) + 1);
        bondNotes.push(`${monName(s)}信任+1${won ? '、热情+1' : ''}`);
      }
    }
    // 2) 精灵球消耗（按差值扣，避免覆盖期间的其他变化）
    for (const [id, zh] of Object.entries(K.BALL_ZH)) {
      const used = (m.balls[id] || 0) - (Number(payload.ballStock?.[id]) || 0);
      if (used > 0) { const left = Math.max(0, (Number(pkm.player.bag[zh]) || 0) - used); if (left > 0) pkm.player.bag[zh] = left; else delete pkm.player.bag[zh]; }
    }
    // 3) 图鉴：对手登记为已遇见
    const eventId = cfg.event && cfg.event !== '自由' ? cfg.event : '自由';
    for (const e of payload.enemyTeam || []) addSeen(pkm, zhSpecies(e.baseSpecies || e.species), eventId);
    // 4) 收服
    if (outcome === 'captured' && payload.capture) {
      const mon = monFromCapture(payload.capture, payload.enemyTeam?.[0], cfgTeam[0], pkm);
      capturedName = mon.species;
      placed = placeMon(pkm, mon);
      if (!pkm.dex.caught.includes(mon.species)) pkm.dex.caught.push(mon.species);
      if (mon.shiny) pkm.dex.shiny[mon.species] = [eventId, placeText(pkm), dateText(pkm), true];
    } else if (cfgTeam[0]?.shiny && m.type === 'wild') { const n = zhSpecies(payload.enemyTeam?.[0]?.baseSpecies) || cfgTeam[0].species; if (!pkm.dex.shiny[n]) pkm.dex.shiny[n] = [eventId, placeText(pkm), dateText(pkm), false]; }
    // 5) 战绩
    pkm.battle.count += 1; if (outcome === 'victory') pkm.battle.wins += 1;
    summaryParts.push(`${OUTCOME_ZH[outcome] || '结束'} · ${fmtText}${cfg.opponent ? ' · 对手：' + cfg.opponent : ''} · ${payload.turns || 0} 回合`);
    if (capturedName) summaryParts.push(`收服了${capturedName}（${placed}）`);
    if (bondNotes.length) summaryParts.push('羁绊：' + bondNotes.join('，'));
    const summary = summaryParts.join('；');
    pkm.battle.lastResult = summary;
    if (cfg.id && !pkm.battle.done.includes(cfg.id)) { pkm.battle.done.push(cfg.id); if (pkm.battle.done.length > 200) pkm.battle.done.splice(0, pkm.battle.done.length - 200); }
    const bs = pkm.integration.battles; bs[battleHash(m.key)] = { outcome, summary, at: Date.now() };
    const ks = Object.keys(bs); if (ks.length > 80) ks.sort((a, b) => (bs[a].at || 0) - (bs[b].at || 0)).slice(0, ks.length - 80).forEach(k => delete bs[k]);
    if (m.spec.wildKey) pkm.wild.used[m.spec.wildKey] = outcome;
    const uk = Object.keys(pkm.wild.used); if (uk.length > 120) uk.slice(0, uk.length - 120).forEach(k => delete pkm.wild.used[k]);
    return { summary };
  });
  // 6) 结果文本 → 输入框
  const pkm = readPkm();
  const pTeam = payload.playerTeam || [], eTeam = payload.enemyTeam || [];
  const joined = new Set(pTeam.map(p => p.hostSlot));
  const bench = pkm.party.slots.map((s, i) => (hasMon(s) && !joined.has(i) ? monName(s) + (s.status === '濒死' || s.hp === 0 ? '（濒死）' : '') : null)).filter(Boolean);
  const verdict = verdictText(outcome, fmt, pTeam, eTeam);
  const res = {
    id: cfg.id || null, event: cfg.event || '自由', type: m.type, opponent: cfg.opponent || null, outcome, turns: payload.turns || 0,
    format: fmt.wild ? '野外1只' : fmt.name, rule: fmt.rule, lineup: { player: pTeam.length, enemy: eTeam.length }, verdict, bench, autoTeam: m.comp?.added?.length ? m.comp.added : undefined,
    player: (payload.playerTeam || []).map(p => { const s = pkm.party.slots[p.hostSlot]; return { name: s ? monName(s) : zhSpecies(p.baseSpecies), lv: p.level, hp: p.fainted ? 0 : p.hp, maxHp: p.maxHp, fainted: !!p.fainted, status: K.STATUS_TO_ZH[p.status] || null, entered: p.participated !== false }; }),
    enemy: (payload.enemyTeam || []).map(p => ({ species: zhSpecies(p.baseSpecies || p.species), lv: p.level, hp: p.hp, maxHp: p.maxHp, fainted: !!p.fainted, status: K.STATUS_TO_ZH[p.status] || null })),
    capture: outcome === 'captured' && payload.capture ? { ball: K.BALL_ZH[payload.capture.ball] || '精灵球', species: capturedName, level: payload.capture.spec?.level, placed } : null,
    stakes: cfg.stakes || null,
  };
  const used = Object.entries(K.BALL_ZH).map(([id, zh]) => { const n = (m.balls[id] || 0) - (Number(payload.ballStock?.[id]) || 0); return n > 0 ? `${zh}×${n}` : null; }).filter(Boolean);
  const line = cfg.lines?.[outcome === 'defeat' ? 'player_lose' : 'player_win'];
  const human = [`【战斗结果】${OUTCOME_ZH[outcome] || '结束'}｜${fmt.wild ? `野外遭遇（${fmt.tag}）` : fmt.full ? `${K.BATTLE_LABEL?.[m.type] || '对战'}·两边全队（我方${res.player.length}只 vs 对方${res.enemy.length}只）` : `${K.TYPE_LABEL[m.type] || '对战'} ${fmt.name}`}｜${res.opponent || (m.type === 'wild' ? '野生宝可梦' : '对手')}｜${res.turns} 回合`,
    `判定：${verdict}。`,
    `${fmt.wild ? `我方（可轮换${res.player.length}只）` : fmt.full ? `我方（能战斗的${res.player.length}只都可轮换）` : `我方参赛（${res.player.length}只）`}：${res.player.map(p => `${p.name} Lv${p.lv} ${p.fainted ? '濒死' : `HP ${p.hp}/${p.maxHp}${p.status ? '·' + p.status : ''}`}${p.entered ? '' : '（没轮到出场）'}`).join('；')}`,
    bench.length ? (fmt.wild || fmt.full ? `没能参战（开战前已失去战斗能力）：${bench.join('、')}` : `未参赛（这场没上场，体力不变）：${bench.join('、')}`) : '',
    `对手${fmt.wild ? '' : fmt.full ? `（${res.enemy.length}只）` : `参赛（${res.enemy.length}只）`}：${res.enemy.map(p => `${p.species} Lv${p.lv} ${outcome === 'captured' && !p.fainted ? '被收服' : p.fainted ? '濒死' : `HP ${p.hp}/${p.maxHp}`}`).join('；')}`,
    m.comp?.added?.length ? `（${m.comp.who}的${m.comp.added.join('、')}是按原作进度补进对手阵容的，续写时当作${m.comp.who}本来就带着。）` : '',
    res.capture ? `收服：用${res.capture.ball}收服了 ${res.capture.species} Lv${res.capture.level}，已放进${placed}。` : '',
    used.length ? `消耗：${used.join('、')}` : '',
    bondNotes.length ? `羁绊（脚本已加）：${bondNotes.join('，')}` : '',
    line ? `对手的台词（供续写）：「${line}」` : '',
    '（变量已写入：体力/状态、剩余PP、精灵球、收服入队、图鉴、战斗羁绊。请按此结果续写战斗经过，不改写胜负，也不要重复写入这些变量。）'].filter(Boolean).join('\n');
  const text = `<pkm_result>${JSON.stringify(res)}</pkm_result>\n${human}`;
  fillInput(text);
  return { summary: result.summary, outcomeZh: OUTCOME_ZH[outcome] || '结束', text };
}
function fillInput(text) {
  const ta = PD.getElementById('send_textarea'); if (!ta) return;
  const cur = String(ta.value || '').replace(/<pkm_result>[\s\S]*?<\/pkm_result>\n?【战斗结果】[\s\S]*?不要重复写入这些变量。）\n?/g, '').trim();
  ta.value = text + (cur ? '\n' + cur : '');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}
function showStoredResult(rec) {
  ensureHostStyle();
  const el = PD.createElement('div'); el.id = 'pkm-kanto-modal'; el.className = 'pkb';
  el.innerHTML = `<div class="bar"><span class="t">⚔️ 这场对战已经结束</span><span class="s"></span><button class="red" data-op="close">关闭</button></div><div class="res"><b>${esc(OUTCOME_ZH[rec.outcome] || '结束')}</b>\n${esc(rec.summary || '')}\n\n<span class="muted">结果已经写入变量。若还没发送结果消息，可以在输入框里补一句“继续”。一场对战只结算一次，避免重复扣球或重复入队。</span></div>`;
  el.addEventListener('click', e => { if (e.target.closest('[data-op=close]') || e.target === el) el.remove(); });
  PD.body.appendChild(el);
}

/* ======================================================================
 * 11. 刷新、事件、启动
 * ==================================================================== */
let refreshTimer = null;
function refreshAll() {
  if (destroyed) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    try { renderBall(); } catch (e) { LOG('精灵球渲染失败', e); }
    for (const m of [...dexMounts]) { try { renderDex(m); } catch (e) { LOG('图鉴渲染失败', e); } }
    try { rerenderSetups(); scanSetup(); } catch (e) { LOG(e); }
  }, 30);
}
function rekickFrames() {
  // 桥接晚于消息渲染加载时：把已经放弃等待的图鉴 / 对战入口重新连上
  PD.querySelectorAll('#chat iframe').forEach(f => {
    let doc; try { doc = f.contentDocument; } catch (_) { return; }
    if (!doc) return;
    const root = doc.getElementById('pkdex-root');
    if (root && !root.querySelector('.pkdex')) { try { mountDex(f.contentWindow, root); } catch (e) { LOG(e); } return; }
    const st = doc.getElementById('status');
    if (st && /没有连上对战系统|正在读取对战块/.test(st.textContent || '') && (f.getAttribute('srcdoc') || '').includes(CH)) { try { f.srcdoc = f.getAttribute('srcdoc'); } catch (_) {} }
  });
}
function onChatEvent() { eventCache = null; initvarCache = null; lastInjection = ''; refreshAll(); refreshInjection(); setTimeout(rekickFrames, 400); }
function onMessageReceived(id) {
  const mesid = Number.isInteger(id) ? id : lastAiId();
  refreshInjection(); refreshAll();
  scheduleSync(mesid);
}
// v1.3.4：等 MVU 先处理完这一楼再同步；MVU 一直没有写入（没装、报错）时，按 AI 的 JSONPatch 自己写入
const SYNC_DELAYS = [2500, 6000, 12000];
function scheduleSync(mesid, n = 0) {
  setTimeout(() => {
    if (destroyed) return;
    try {
      const own = hasOwnStat(mesid), mvu = !!(W.Mvu || P.Mvu);
      if (!own && mvu && n < SYNC_DELAYS.length - 1 && parsePatchOps(chat()[mesid]?.mes).length) { scheduleSync(mesid, n + 1); return; }
      if (needsSync(mesid, { full: !own })) writePkm(pkm => { applySync(pkm, mesid, { full: !hasOwnStat(mesid) && findStat()?.id !== mesid }); }).catch(e => LOG('同步失败', e));
    } catch (e) { LOG(e); }
  }, n === 0 ? SYNC_DELAYS[0] : SYNC_DELAYS[n] - SYNC_DELAYS[n - 1]);
}

function on(evName, fn) {
  const c = ctx();
  if (typeof W.eventOn === 'function' && W.tavern_events?.[evName]) { W.eventOn(W.tavern_events[evName], fn); return; }
  const type = c?.eventTypes?.[evName] || c?.event_types?.[evName];
  if (type && c?.eventSource) { c.eventSource.on(type, fn); cleanups.push(() => c.eventSource.removeListener(type, fn)); }
}

async function start() {
  ensureHostStyle();
  P.PKMKanto = { __owner: instance, version: VERSION, base: BASE, mountDex, openBattle: spec => openBattle(spec), openPanel, togglePanel, closePanel: () => PD.getElementById('pkm-kanto-panel')?.remove(), read: readPkm, refresh: refreshAll };
  listen(P, 'message', onHostMessage);
  const chatEl = PD.getElementById('chat');
  if (chatEl) { const mo = new P.MutationObserver(() => { clearTimeout(mo._t); mo._t = setTimeout(scanSetup, 60); }); mo.observe(chatEl, { childList: true, subtree: true }); cleanups.push(() => mo.disconnect()); }
  on('MESSAGE_RECEIVED', onMessageReceived);
  for (const ev of ['CHAT_CHANGED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED']) on(ev, onChatEvent);
  for (const ev of ['MESSAGE_SENT', 'GENERATION_AFTER_COMMANDS', 'GENERATION_STARTED']) on(ev, () => refreshInjection());
  // MVU：每次变量更新结束时把在场人物同步进去（与 MVU 写入同一份变量，避免互相覆盖）
  try {
    if (typeof W.waitGlobalInitialized === 'function') await Promise.race([W.waitGlobalInitialized('Mvu'), sleep(6000)]);
    const mvu = W.Mvu || P.Mvu;
    if (mvu?.events?.VARIABLE_UPDATE_ENDED && typeof W.eventOn === 'function') {
      W.eventOn(mvu.events.VARIABLE_UPDATE_ENDED, variables => { try { const pkm = variables?.stat_data?.pkm; if (pkm) { normalize(pkm); applySync(pkm, lastAiId()); ensureAllIndividuals(pkm); } } catch (e) { LOG(e); } setTimeout(() => { refreshAll(); refreshInjection(); }, 50); });
    }
  } catch (e) { LOG('MVU 钩子未安装（不影响主要功能）', e); }
  onChatEvent();
  zhReady.then(() => refreshAll());
  LOG(`v${VERSION} 已启动 · 对战网页 ${BASE}`);
}
start().catch(e => { console.error('[关都之旅·桥接] 启动失败', e); toast('关都之旅外置桥接启动失败：' + (e?.message || e), 'error'); });
