// 宝可梦·关都之旅 · 外置桥接 v1.3.2
// 由角色卡的酒馆助手脚本加载：
//   window.ST_BRIDGE_PACK='kanto-main';
//   window.PKM_APP_BASE_URL='https://<你的用户名>.github.io/pokemon-battle/';
//   await import(window.PKM_APP_BASE_URL+'st-bridge/bridge.js?v=1.3.2');
// 负责：开局登记界面、图鉴状态栏（PKMKanto.mountDex）、右下角精灵球（队伍/仓库/跟随）、
//       附近野生遭遇、对战窗口（pkm-modal-v1 通道 ↔ 自己的 pokemon-battle 网页）、
//       战斗结果写回 MVU 变量、生成前注入“剧情节点 + 变量摘要”、在场人物同步“已结识”。
import * as K from './kanto-data.js?v=1.3.2';

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
  ZH = { ...z, speciesRev: rev };
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
    stats_meta: { ivs: { hp: null, atk: null, def: null, spa: null, spd: null, spe: null }, ev_level: 0 }, hp: null, maxHp: null, status: null, exp: null, ball: null, met: null, notes: null };
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
  const run = async () => {
    const c = chat(); const id = Math.max(0, c.length - 1);
    const f = findStat();
    const vars = clone(f ? f.vars : (getMsgVars(id) || {})) || {};
    if (!isObj(vars.stat_data)) vars.stat_data = {};
    const pkm = normalize(vars.stat_data.pkm ? vars.stat_data.pkm : defaultPkm());
    for (const s of [...pkm.party.slots, ...pkm.party.box]) if (hasMon(s) && !s.uid) s.uid = uid();
    const result = await mutator(pkm);
    vars.stat_data.pkm = pkm;
    await setMsgVars(id, vars);
    return result;
  };
  const p = writeChain.then(run, run);
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
  const party = pkm.party.slots.map((s, i) => (hasMon(s) ? `${i + 1}. ${monName(s)}${s.nickname ? '（' + s.species + '）' : ''} Lv${s.lv ?? '?'}${genderMark(s.gender)}${s.hp != null && s.maxHp ? ` HP ${s.hp}/${s.maxHp}` : ' HP 满'}${s.status ? '·' + s.status : ''} 招式：${(s.moves || []).filter(Boolean).join('/') || '—'}${s.isLead ? ' [首发]' : ''}${s.uid && s.uid === pkm.party.follow ? ' [在身边跟随]' : ''}` : null)).filter(Boolean);
  lines.push('队伍：' + (party.length ? '\n  ' + party.join('\n  ') : '（还没有宝可梦，不能发起对战）'));
  if (pkm.party.box.length) lines.push(`电脑：${pkm.party.box.length} 只（${pkm.party.box.slice(-12).map(monName).join('、')}）`);
  const bag = Object.entries(pl.bag).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${k}×${n}`);
  lines.push('背包：' + (bag.join('、') || '空'));
  const seen = Object.keys(pkm.dex.seen);
  lines.push(`图鉴：遇见 ${seen.length} 种 / 收服 ${new Set(pkm.dex.caught).size} 种${seen.length ? '；图鉴已遇见：' + seen.join('、') : ''}`);
  const met = Object.values(pkm.npcs.records).filter(r => r && r.met).sort((a, b) => (b.lastInteraction ?? -1) - (a.lastInteraction ?? -1));
  if (met.length) lines.push('已结识人物（好感）：' + met.map(r => `${r.name}(${r.love ?? 0})`).join('、'));
  if (pkm.battle.lastResult) lines.push('最近一场对战：' + (typeof pkm.battle.lastResult === 'string' ? pkm.battle.lastResult : JSON.stringify(pkm.battle.lastResult)));
  return lines.join('\n');
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
  if (pos?.finished) parts.push('主线：动画关都篇的事件已全部结束，自由剧情。');
  else if (pos) {
    const e = pos.event;
    parts.push(`当前主线事件：${e.id}｜${e.title}（${e.stage}${e.date ? '｜参考日期 ' + e.date.text : ''}）\n进度：节点 ${pos.node} / ${pos.total}。本轮只演这个节点里的一幕，停在需要 {{user}} 回应处；状态栏写“剧情：${e.id}｜节点${pos.node}｜进行中”，确实演完再写“节点完成”${pos.node === pos.total ? '，最后一个节点收束时写“完成”' : ''}。`);
    if (pos.note) parts.push(pos.note);
    if (pos.gap) parts.push('[日期] ' + pos.gap);
    parts.push(`【当前节点】\n${pos.nodeText}`);
    if (e.hook) parts.push('介入点：' + e.hook);
    if (e.battle) parts.push('对战机会（参考阵容，按 {{user}} 实力调整）：' + e.battle);
    const stageNo = (e.stage.match(/S\d+/) || [])[0];
    for (const s of events().stages[stageNo] || []) parts.push(s.content);
  }
  const lastUser = [...c].reverse().find(m => m.is_user);
  if (lastUser && /<pkm_result>/i.test(lastUser.mes || '')) parts.push('【对战结果】玩家的上一条消息带有 <pkm_result>：按结果续写战斗经过，不改写胜负。HP/状态、精灵球消耗、收服入队、图鉴登记已由脚本写入变量，不要重复写。');
  parts.push('【变量摘要（脚本生成，以此为准）】\n' + summaryText(pkm));
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
function applySync(pkm, mesid) {
  const st = parseState(chat()[mesid]?.mes); if (!st) return false;
  let changed = false;
  const set = (obj, k, v) => { if (v != null && v !== '' && obj[k] !== v) { obj[k] = v; changed = true; } };
  set(pkm.world, 'location', st.地点); set(pkm.world, 'time', st.时间);
  if (/同行|小智|沙盒/.test(st.模式 || '')) set(pkm.world, 'mode', (st.模式.match(/(同行|小智|沙盒)模式/) || [])[0]);
  const names = String(st.在场 || '').split(/[、，,／/；;\s]+/).map(s => s.replace(/[（(].*?[)）]/g, '').trim()).filter(Boolean);
  if (names.length) for (const [key, r] of Object.entries(pkm.npcs.records)) {
    if (!isObj(r)) continue;
    const alias = new Set([r.name, String(r.name || '').replace(/小姐$|博士$/, ''), ...(K.NPC_ALIASES[key] || [])].filter(Boolean));
    if (key === 'meowth' && !names.some(n => /武藏|小次郎|火箭队/.test(n))) alias.delete('喵喵');
    if (names.some(n => alias.has(n))) {
      if (r.met !== true) { r.met = true; changed = true; }
      if (r.lastInteraction !== mesid) { r.lastInteraction = mesid; changed = true; }
    }
  }
  return changed;
}
function needsSync(mesid) { const pkm = readPkm(); return applySync(pkm, mesid); }

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
`;
function ensureHostStyle() {
  if (PD.getElementById('pkm-kanto-style')) return;
  const s = PD.createElement('style'); s.id = 'pkm-kanto-style'; s.textContent = HOST_CSS; PD.head.appendChild(s);
}

/* ======================================================================
 * 7. 开局登记界面（[[PKM_SETUP]] → 挂载到第 0 楼）
 * ==================================================================== */
const setupState = { step: 0, mode: '同行模式', name: '', gender: '男', hometown: '真新镇', intro: '', starter: '', nickname: '', busy: false, error: '' };
function setupDone(pkm) { return !!pkm.integration.profile || chat().length > 1; }
function renderSetup(el) {
  const pkm = readPkm();
  if (setupDone(pkm)) {
    const pr = pkm.integration.profile || {};
    const lead = pkm.party.slots.find(hasMon);
    el.innerHTML = `<div class="pkb pkm-setup"><div class="hd"><h3>📇 训练家档案已登记</h3><p>${esc(pr.name || pkm.player.name || userName())} · ${esc(pr.mode || pkm.world.mode || '')}${lead ? ' · 初始伙伴：' + esc(monName(lead)) : ''}</p></div><div class="bd muted" style="font-size:12.5px">旅程已经开始。队伍与仓库在右下角的精灵球里，图鉴状态栏显示在最新一条回复的末尾。<br>外置桥接 v${VERSION} · 对战网页：${esc(BASE)}</div></div>`;
    return;
  }
  const S = setupState;
  if (!S.name) S.name = userName();
  const steps = `<div class="steps">${[0, 1, 2, 3, 4].map(i => `<i class="${i <= S.step ? 'on' : ''}"></i>`).join('')}</div>`;
  const head = (t, p) => `<div class="hd"><h3>${t}</h3><p>${p}</p>${steps}</div>`;
  let body = '', foot = '';
  if (S.step === 0) {
    body = head('🔴 宝可梦·关都之旅', `欢迎来到大木研究所！登记训练家档案、选择旅程模式、领取初始伙伴，然后出发。<br>外置桥接 v${VERSION} · 对战系统来自你自己的网页`) +
      `<div class="bd"><div class="sum" style="font-size:12.5px;line-height:1.8">🗓️ 第1年 5月22日，真新镇。今天是新人训练家领取宝可梦的日子。<br>⚔️ 你亲自参与的对战在网页对战系统里实际演算，结果会自动写回队伍。<br>📕 回复末尾是图鉴状态栏；右下角精灵球是队伍与仓库，可以让宝可梦出球跟着你。</div></div>`;
    foot = `<button class="red" data-act="next">开始登记 ›</button>`;
  } else if (S.step === 1) {
    body = head('选择旅程模式', '模式决定你在动画关都篇里的位置，之后不能更改。') + `<div class="bd"><div class="cards">${Object.entries(K.MODE_INFO).map(([m, info]) => `<button class="card ${S.mode === m ? 'on' : ''}" data-act="mode" data-v="${m}"><span style="font-size:22px">${info.icon}</span><b>${m}</b><small>${esc(info.desc)}</small></button>`).join('')}</div></div>`;
    foot = `<button class="ghost" data-act="back">‹ 上一步</button><button class="red" data-act="next">下一步 ›</button>`;
  } else if (S.step === 2) {
    const ash = S.mode === '小智模式';
    body = head('训练家档案', ash ? '小智模式：你就是真新镇的小智。' : '大木博士会用这些信息给你办理训练家执照。') + `<div class="bd">
      <label class="f">名字</label><input type="text" data-f="name" maxlength="16" value="${esc(ash ? '小智' : S.name)}" ${ash ? 'disabled' : ''}>
      <label class="f">性别</label><div class="seg">${['男', '女'].map(g => `<button class="${(ash ? '男' : S.gender) === g ? 'on' : ''}" data-act="gender" data-v="${g}" ${ash ? 'disabled' : ''}>${g}</button>`).join('')}</div>
      <label class="f">家乡</label><select data-f="hometown" ${S.mode !== '沙盒模式' ? 'disabled' : ''}>${['真新镇', '常青市', '深灰市', '华蓝市', '枯叶市', '玉虹市', '金黄市', '紫苑镇', '浅红市', '红莲镇'].map(t => `<option ${S.hometown === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <label class="f">一句话介绍（可选）</label><input type="text" data-f="intro" maxlength="60" placeholder="例如：想成为宝可梦饲育家" value="${esc(S.intro)}">
      <div class="pk-note">年龄：10 岁（刚好可以领取训练家执照）。${S.mode !== '沙盒模式' ? '同行 / 小智模式的家乡固定为真新镇。' : ''}</div></div>`;
    foot = `<button class="ghost" data-act="back">‹ 上一步</button><button class="red" data-act="next">下一步 ›</button>`;
  } else if (S.step === 3) {
    const list = K.MODE_STARTERS[S.mode];
    if (!list.includes(S.starter)) S.starter = list[0];
    const note = { 同行模式: '小茂一大早就来了——他会领走哪一只？你先选的那只就是你的。', 小智模式: '三只初始宝可梦都被领走了，只剩下这只脾气很倔的皮卡丘。', 沙盒模式: '初始宝可梦今年已经送完，后院里还有几只在等训练家。' }[S.mode];
    body = head('领取初始伙伴', note) + `<div class="bd"><div class="cards">${list.map(n => `<button class="card ${S.starter === n ? 'on' : ''}" data-act="starter" data-v="${n}">${spriteImg(n, { anim: true })}<b>${n}<span class="muted" style="font-weight:400"> Lv5</span></b><small>${esc(K.STARTERS[n].desc)}</small></button>`).join('')}</div>
      <label class="f">昵称（可选）</label><input type="text" data-f="nickname" maxlength="12" placeholder="不填就叫${esc(S.starter)}" value="${esc(S.nickname)}"></div>`;
    foot = `<button class="ghost" data-act="back">‹ 上一步</button><button class="red" data-act="next">下一步 ›</button>`;
  } else {
    const info = K.MODE_INFO[S.mode], ash = S.mode === '小智模式';
    body = head('确认出发', '确认后：档案写入变量、初始伙伴入队，并自动发送第一条消息开始旅程。') + `<div class="bd"><div class="sum" style="display:flex;gap:12px;align-items:center">${spriteImg(S.starter, { anim: true })}<div style="font-size:13px;line-height:1.8">
      <b>${esc(ash ? '小智' : S.name)}</b>（${ash ? '男' : S.gender}，10 岁，${esc(S.mode === '沙盒模式' ? S.hometown : '真新镇')}）· ${S.mode}<br>
      初始伙伴：${esc(S.nickname ? S.nickname + '（' + S.starter + '）' : S.starter)} Lv5 · 背包：精灵球×5、伤药×2 · 3000 元<br>
      <span class="muted">出发时间：${info.start.time} · ${info.start.location}</span></div></div>${S.error ? `<div class="err">${esc(S.error)}</div>` : ''}</div>`;
    foot = `<button class="ghost" data-act="back" ${S.busy ? 'disabled' : ''}>‹ 上一步</button><button class="red" data-act="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '正在登记……' : '确认出发！'}</button>`;
  }
  el.innerHTML = `<div class="pkb pkm-setup">${body}<div class="ft">${foot}</div></div>`;
}
function bindSetup(el) {
  el.addEventListener('input', e => { const f = e.target?.dataset?.f; if (f) setupState[f] = e.target.value; });
  el.addEventListener('change', e => { const f = e.target?.dataset?.f; if (f) setupState[f] = e.target.value; });
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    e.preventDefault(); e.stopPropagation();
    const S = setupState, act = b.dataset.act;
    if (act === 'next') { if (S.step === 2 && S.mode !== '小智模式' && !String(S.name).trim()) { toast('请填写名字'); return; } S.step = Math.min(4, S.step + 1); }
    else if (act === 'back') S.step = Math.max(0, S.step - 1);
    else if (act === 'mode') { S.mode = b.dataset.v; S.starter = ''; }
    else if (act === 'gender') S.gender = b.dataset.v;
    else if (act === 'starter') S.starter = b.dataset.v;
    else if (act === 'submit') { submitSetup().catch(err => { S.busy = false; S.error = '登记失败：' + (err?.message || err); rerenderSetups(); }); }
    rerenderSetups();
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
    Object.assign(pkm.player, { name, gender, hometown, id: String(10000 + Math.floor(Math.random() * 89999)) });
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
let panelTab = 'party';
function renderBall() {
  ensureHostStyle();
  let el = PD.getElementById('pkm-kanto-ball');
  if (!el) {
    el = PD.createElement('div'); el.id = 'pkm-kanto-ball'; el.className = 'pkb'; PD.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target.closest('.orb,.follower')) togglePanel(); });
  }
  const pkm = readPkm();
  const n = pkm.party.slots.filter(hasMon).length;
  const f = [...pkm.party.slots, ...pkm.party.box].find(s => hasMon(s) && s.uid && s.uid === pkm.party.follow);
  const fUrl = f ? spriteUrl(f.species || f.name, { anim: true, shiny: f.shiny }) : '';
  el.innerHTML = `${fUrl ? `<img class="follower" src="${esc(fUrl)}" title="${esc(monName(f))}正跟在你身边" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<button class="orb" title="队伍与仓库（关都之旅）"><span class="count">${n}</span></button>`;
  if (PD.getElementById('pkm-kanto-panel')) renderPanel();
}
function togglePanel() { const p = PD.getElementById('pkm-kanto-panel'); if (p) p.remove(); else renderPanel(); }
function renderPanel() {
  let el = PD.getElementById('pkm-kanto-panel');
  if (!el) {
    el = PD.createElement('div'); el.id = 'pkm-kanto-panel'; el.className = 'pkb'; PD.body.appendChild(el);
    el.addEventListener('click', onPanelClick);
  }
  const pkm = readPkm();
  const party = pkm.party.slots.map((s, i) => ({ s, i })).filter(x => hasMon(x.s));
  const count = party.length;
  const row = (s, where, i) => `<div class="mon">${spriteImg(s.species || s.name, { shiny: s.shiny })}<div class="grow">${monLine(s, pkm)}<small>${esc((s.moves || []).filter(Boolean).join(' / ') || '—')}</small><small>${s.hp != null && s.maxHp ? `HP ${s.hp}/${s.maxHp}` : 'HP 满'} · ${esc(s.ability || '')}${s.nature ? ' · ' + esc(s.nature) : ''}${s.ball ? ' · ' + esc(s.ball) : ''}</small>${hpBar(s)}${s.met ? `<small>${esc(s.met)}</small>` : ''}</div><div class="acts">
    ${where === 'party' ? `${s.isLead ? '' : `<button data-op="lead" data-i="${i}">设为首发</button>`}<button data-op="follow" data-i="${i}" data-w="party">${s.uid && s.uid === pkm.party.follow ? '收回球里' : '出球跟随'}</button>${count > 1 ? `<button data-op="tobox" data-i="${i}">存进电脑</button>` : ''}`
    : `<button data-op="toparty" data-i="${i}" ${count >= 6 ? 'disabled title="队伍已满 6 只"' : ''}>加入队伍</button><button data-op="follow" data-i="${i}" data-w="box">${s.uid && s.uid === pkm.party.follow ? '收回' : '跟随'}</button>`}</div></div>`;
  el.innerHTML = `<div class="hd">🔴 我的宝可梦<button data-op="close">✕</button></div>
    <div class="tabs"><button class="${panelTab === 'party' ? 'on' : ''}" data-tab="party">队伍 ${count}/6</button><button class="${panelTab === 'box' ? 'on' : ''}" data-tab="box">电脑 ${pkm.party.box.length}</button></div>
    <div class="bd">${panelTab === 'party' ? (party.length ? party.map(x => row(x.s, 'party', x.i)).join('') : '<div class="empty">还没有宝可梦。先在开局界面领取初始伙伴。</div>')
      : (pkm.party.box.length ? pkm.party.box.map((s, i) => row(s, 'box', i)).join('') : '<div class="empty">电脑里没有寄存的宝可梦。队伍满 6 只后收服的会传送到这里。</div>')}
    <div class="pk-note">换首发、跟随、存取电脑会直接写入变量（下一条回复生效）。剧情里的治疗、升级、进化由 AI 按规则写入。</div></div>`;
}
async function onPanelClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tab) { panelTab = b.dataset.tab; renderPanel(); return; }
  const op = b.dataset.op, i = Number(b.dataset.i);
  if (op === 'close') { PD.getElementById('pkm-kanto-panel')?.remove(); return; }
  try {
    await writePkm(pkm => {
      const slots = pkm.party.slots;
      if (op === 'lead') slots.forEach((s, k) => { if (hasMon(s)) s.isLead = k === i; });
      else if (op === 'follow') { const s = b.dataset.w === 'box' ? pkm.party.box[i] : slots[i]; if (!s.uid) s.uid = uid(); pkm.party.follow = pkm.party.follow === s.uid ? null : s.uid; }
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
  } catch (err) { toast(err.message || String(err), 'warning'); }
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
  try { postFromHost(sess.source, { channel: CH, type: 'status', key: sess.key, token: sess.token, summary, ended, open, error: sess.error || null }); } catch (_) {}
}
function onHostMessage(e) {
  const d = e.data; if (!d || typeof d !== 'object') return;
  if (d.channel === CH) {
    if (!d.key || !d.token) return;
    let sess = sessions.get(d.key);
    if (!sess || sess.token !== d.token) { sess = { ...(sess || {}), key: d.key, token: d.token, status: sess?.status || 'idle' }; sessions.set(d.key, sess); }
    sess.source = e.source;
    if (d.type === 'hello') entryStatus(sess);
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
    const iv = s.stats_meta?.ivs; if (iv && Object.values(iv).every(v => Number.isInteger(v))) e.ivs = iv;
    return e;
  });
}
function engineConfig(spec, pkm, tag) {
  const cfg = spec.cfg || {};
  const type = String(cfg.type || 'trainer').toLowerCase();
  let team = Array.isArray(cfg.team) ? cfg.team : [];
  if (type === 'wild') team = team.slice(0, 1);
  const enemy = team.map(t => (typeof t === 'string' ? { species: t, level: 5 } : { species: t.species || t.name, level: Number(t.level || t.lv) || 5, moves: Array.isArray(t.moves) ? t.moves : [], ability: t.ability, nature: t.nature, gender: t.gender, shiny: !!t.shiny }));
  const balls = Object.fromEntries(Object.entries(K.BALL_ZH).map(([id, zh]) => [id, Math.max(0, Math.floor(Number(pkm.player.bag[zh]) || 0))]));
  const out = { encounter: { type: type === 'wild' ? 'wild' : 'trainer' }, difficulty: cfg.difficulty || K.DIFFICULTY_BY_TYPE[type] || 'normal',
    p1: { entrants: [{ name: 'host-player', party: playerEntries(pkm) }] }, p2: { entrants: [{ name: 'host-enemy', party: enemy }] },
    host: { tag, balls }, ui: spec.ui || null };
  const w = K.WEATHER[String(cfg.environment || '').trim()];
  if (w) out.environment = { weather: w, weatherTurns: 0 };
  return { engine: out, balls, type };
}
function openBattle(spec) {
  if (modal) { toast('已经有一场对战在进行中'); return; }
  const pkm = readPkm();
  const sess = spec.sess || null;
  const cfg = spec.cfg;
  if (!cfg || !Array.isArray(cfg.team) || !cfg.team.length) { toast('对战块里没有对手宝可梦（team）', 'warning'); if (sess) { sess.error = '对战块缺少 team'; entryStatus(sess); } return; }
  const tag = uid();
  const { engine, balls, type } = engineConfig(spec, pkm, tag);
  if (!engine.p1.entrants[0].party.length) {
    const msg = pkm.party.slots.some(hasMon) ? '队伍里的宝可梦都失去了战斗能力，先去宝可梦中心治疗吧。' : '你还没有宝可梦，不能对战。';
    toast(msg, 'warning'); if (sess) { sess.error = msg; entryStatus(sess); } return;
  }
  ensureHostStyle();
  const el = PD.createElement('div'); el.id = 'pkm-kanto-modal'; el.className = 'pkb';
  const title = cfg.title || `${K.TYPE_LABEL[type] || '对战'}${cfg.opponent ? ' · ' + cfg.opponent : ''}`;
  el.innerHTML = `<div class="bar"><span class="t">⚔️ ${esc(title)}</span><span class="s">${esc(cfg.lines?.start ? '「' + cfg.lines.start + '」' : '正在连接对战系统……')}</span><button class="red" data-op="close">返回剧情</button></div>
    <iframe allow="autoplay" referrerpolicy="no-referrer-when-downgrade" src="${esc(BASE)}index.html?embed=1&v=${VERSION}&t=${Date.now().toString(36)}"></iframe>`;
  PD.body.appendChild(el);
  modal = { el, frame: el.querySelector('iframe'), tag, key: spec.key, spec, cfg, engine, balls, type, sent: false, done: false, sess, timer: null };
  if (sess) { sess.status = 'open'; sess.error = null; entryStatus(sess); }
  el.querySelector('[data-op=close]').onclick = closeBattle;
  const send = () => { if (!modal || modal.sent || modal.tag !== tag) return; modal.sent = true; try { modal.frame.contentWindow.postMessage({ type: 'PKM_BATTLE_CONFIG', payload: engine }, '*'); } catch (err) { LOG(err); } };
  modal.frame.addEventListener('load', () => setTimeout(send, 30));
  modal.timer = setTimeout(() => { if (modal && modal.tag === tag && !modal.started && !modal.done) setBar('对战网页加载较慢或失败：请确认网站已部署 v' + VERSION + '（页脚版本号），再点“返回剧情”后重试。'); }, 15000);
}
function setBar(text) { const s = modal?.el.querySelector('.bar .s'); if (s) s.textContent = text; }
function closeBattle() {
  if (!modal) return;
  const m = modal; modal = null; clearTimeout(m.timer); m.el.remove();
  if (m.sess) { if (!m.done) m.sess.status = 'idle'; entryStatus(m.sess); }
  if (!m.done) toast('对战没有结束，已放弃。可以重新点“开始对战”。');
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
    quality: 'medium', nature: zhNature(spec.nature) || K.NATURES[Math.floor(Math.random() * K.NATURES.length)], ability: zhAbility(spec.ability),
    shiny: !!spec.shiny, moves: [0, 1, 2, 3].map(i => (spec.moves?.[i] ? zhMove(spec.moves[i]) : null)),
    hp: cap.hpAtCapture ?? enemy?.hp ?? null, maxHp: enemy?.maxHp ?? null, status: K.STATUS_TO_ZH[cap.statusAtCapture] || null,
    ball: K.BALL_ZH[cap.ball] || '精灵球', uid: uid(), met: `${dateText(pkm)} · ${placeText(pkm)}，用${K.BALL_ZH[cap.ball] || '精灵球'}收服`, notes: null,
  });
  if (spec.ivs && Object.values(spec.ivs).every(v => Number.isInteger(v))) mon.stats_meta.ivs = { ...spec.ivs };
  return mon;
}
async function applyResult(m, payload) {
  const outcome = payload.outcome || (payload.winner === 'player' ? 'victory' : payload.winner === 'enemy' ? 'defeat' : 'draw');
  const cfg = m.cfg, cfgTeam = Array.isArray(cfg.team) ? cfg.team : [];
  let placed = null, capturedName = null;
  const summaryParts = [];
  const result = await writePkm(pkm => {
    // 1) 我方体力 / 异常状态
    for (const p of payload.playerTeam || []) {
      const s = pkm.party.slots[p.hostSlot]; if (!hasMon(s)) continue;
      s.hp = p.fainted ? 0 : p.hp; s.maxHp = p.maxHp; s.status = p.fainted ? '濒死' : (K.STATUS_TO_ZH[p.status] || null);
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
    summaryParts.push(`${OUTCOME_ZH[outcome] || '结束'}${cfg.opponent ? ' · 对手：' + cfg.opponent : ''} · ${payload.turns || 0} 回合`);
    if (capturedName) summaryParts.push(`收服了${capturedName}（${placed}）`);
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
  const res = {
    id: cfg.id || null, event: cfg.event || '自由', type: m.type, opponent: cfg.opponent || null, outcome, turns: payload.turns || 0,
    player: (payload.playerTeam || []).map(p => { const s = pkm.party.slots[p.hostSlot]; return { name: s ? monName(s) : zhSpecies(p.baseSpecies), lv: p.level, hp: p.fainted ? 0 : p.hp, maxHp: p.maxHp, fainted: !!p.fainted, status: K.STATUS_TO_ZH[p.status] || null }; }),
    enemy: (payload.enemyTeam || []).map(p => ({ species: zhSpecies(p.baseSpecies || p.species), lv: p.level, hp: p.hp, maxHp: p.maxHp, fainted: !!p.fainted, status: K.STATUS_TO_ZH[p.status] || null })),
    capture: outcome === 'captured' && payload.capture ? { ball: K.BALL_ZH[payload.capture.ball] || '精灵球', species: capturedName, level: payload.capture.spec?.level, placed } : null,
    stakes: cfg.stakes || null,
  };
  const used = Object.entries(K.BALL_ZH).map(([id, zh]) => { const n = (m.balls[id] || 0) - (Number(payload.ballStock?.[id]) || 0); return n > 0 ? `${zh}×${n}` : null; }).filter(Boolean);
  const line = cfg.lines?.[outcome === 'defeat' ? 'player_lose' : 'player_win'];
  const human = [`【战斗结果】${OUTCOME_ZH[outcome] || '结束'}｜${res.opponent || (m.type === 'wild' ? '野生宝可梦' : '对手')}｜${res.turns} 回合`,
    `我方：${res.player.map(p => `${p.name} Lv${p.lv} ${p.fainted ? '濒死' : `HP ${p.hp}/${p.maxHp}${p.status ? '·' + p.status : ''}`}`).join('；')}`,
    `对手：${res.enemy.map(p => `${p.species} Lv${p.lv} ${outcome === 'captured' && !p.fainted ? '被收服' : p.fainted ? '濒死' : `HP ${p.hp}/${p.maxHp}`}`).join('；')}`,
    res.capture ? `收服：用${res.capture.ball}收服了 ${res.capture.species} Lv${res.capture.level}，已放进${placed}。` : '',
    used.length ? `消耗：${used.join('、')}` : '',
    line ? `对手的台词（供续写）：「${line}」` : '',
    '（变量已写入：体力/状态、精灵球、收服入队、图鉴。请按此结果续写战斗经过，不改写胜负，也不要重复写入这些变量。）'].filter(Boolean).join('\n');
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
  setTimeout(() => { try { if (!destroyed && needsSync(mesid)) writePkm(pkm => { applySync(pkm, mesid); }).catch(e => LOG('同步失败', e)); } catch (e) { LOG(e); } }, 2500);
}

function on(evName, fn) {
  const c = ctx();
  if (typeof W.eventOn === 'function' && W.tavern_events?.[evName]) { W.eventOn(W.tavern_events[evName], fn); return; }
  const type = c?.eventTypes?.[evName] || c?.event_types?.[evName];
  if (type && c?.eventSource) { c.eventSource.on(type, fn); cleanups.push(() => c.eventSource.removeListener(type, fn)); }
}

async function start() {
  ensureHostStyle();
  P.PKMKanto = { __owner: instance, version: VERSION, base: BASE, mountDex, openBattle: spec => openBattle(spec), read: readPkm, refresh: refreshAll };
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
      W.eventOn(mvu.events.VARIABLE_UPDATE_ENDED, variables => { try { const pkm = variables?.stat_data?.pkm; if (pkm) { normalize(pkm); applySync(pkm, lastAiId()); } } catch (e) { LOG(e); } setTimeout(() => { refreshAll(); refreshInjection(); }, 50); });
    }
  } catch (e) { LOG('MVU 钩子未安装（不影响主要功能）', e); }
  onChatEvent();
  zhReady.then(() => refreshAll());
  LOG(`v${VERSION} 已启动 · 对战网页 ${BASE}`);
}
start().catch(e => { console.error('[关都之旅·桥接] 启动失败', e); toast('关都之旅外置桥接启动失败：' + (e?.message || e), 'error'); });
