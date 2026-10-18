// v1.3.5：招式详细说明（对战中长按招式 / 点 ⓘ 查看）
// - 官方中文说明：src/data/move-desc-zh.json（tools/build-move-desc.mjs 生成）
// - 本系统中的实际效果：根据招式数据自动生成，并标出本对战系统简化或暂未实现的部分
// - 对当前对手：属性相性、预计伤害
(function (global) {
  'use strict';
  let DESC = {};

  const TYPE_ZH = { Normal: '一般', Fire: '火', Water: '水', Electric: '电', Grass: '草', Ice: '冰', Fighting: '格斗', Poison: '毒', Ground: '地面', Flying: '飞行', Psychic: '超能力', Bug: '虫', Rock: '岩石', Ghost: '幽灵', Dragon: '龙', Dark: '恶', Steel: '钢', Fairy: '妖精', Stellar: '星晶', '???': '？？？' };
  const CAT_ZH = { Physical: '物理', Special: '特殊', Status: '变化' };
  const STAT_ZH = { atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度', accuracy: '命中率', evasion: '闪避率' };
  const STATUS_ZH = { par: '麻痹', brn: '灼伤', psn: '中毒', tox: '剧毒', slp: '睡眠', frz: '冰冻' };
  const TARGET_ZH = {
    normal: '对手', any: '对手', randomNormal: '对手', adjacentFoe: '对手', allAdjacentFoes: '对手', allAdjacent: '对手（双打时也会打到同伴）',
    self: '自己', adjacentAllyOrSelf: '自己', allies: '我方全体', allySide: '我方场地', foeSide: '对方场地', all: '整个场地', scripted: '对手', adjacentAlly: '同伴',
  };
  const WEATHER_ZH = { sunnyday: '大晴天', raindance: '下雨', sandstorm: '沙暴', snow: '下雪', snowscape: '下雪', hail: '冰雹', desolateland: '大日照', primordialsea: '大雨' };
  const TERRAIN_ZH = { electricterrain: '电气场地', grassyterrain: '青草场地', psychicterrain: '精神场地', mistyterrain: '薄雾场地' };
  const SIDE_ZH = {
    reflect: '5 回合内，我方受到的物理招式伤害减弱',
    lightscreen: '5 回合内，我方受到的特殊招式伤害减弱',
    auroraveil: '5 回合内，我方受到的物理、特殊伤害都减弱（只能在下雪时使用）',
    tailwind: '4 回合内，我方宝可梦的速度翻倍',
    spikes: '在对方场地撒下撒菱，对手换上场时受到伤害（最多 3 层）',
    toxicspikes: '在对方场地撒下毒菱，对手换上场时会中毒（最多 2 层）',
    stealthrock: '在对方场地布下隐形岩，对手换上场时受到岩石属性伤害',
    stickyweb: '在对方场地布下黏黏网，对手换上场时速度降低',
  };
  // 本系统已实现的特殊招式（不在通用数据字段里）
  const SPECIAL_ZH = {
    rest: '体力回复全满并治愈异常状态，然后睡着 2 回合',
    haze: '双方宝可梦的能力变化全部复原',
    focusenergy: '鼓足干劲，之后的招式更容易击中要害（换下场后消失）',
    splash: '什么也不会发生',
    defog: '降低对手的闪避率，并清除双方场地上的钉子、壁和场地效果',
    tidyup: '清除双方场地上的钉子，并提高自己的攻击和速度',
    courtchange: '交换双方场地上的效果',
    brickbreak: '能打破对方的反射壁、光墙和极光幕',
    psychicfangs: '能打破对方的反射壁、光墙和极光幕',
    rapidspin: '清除自己一方场地上的钉子',
    mortalspin: '清除自己一方场地上的钉子',
    struggle: '没有招式点数时才会使用；使用后自己受到最大体力 1/4 的伤害',
  };
  const FIXED_ZH = {
    seismictoss: lv => `造成与自己等级相同的伤害（现在 ${lv} 点）`,
    nightshade: lv => `造成与自己等级相同的伤害（现在 ${lv} 点）`,
    sonicboom: () => '固定造成 20 点伤害',
    dragonrage: () => '固定造成 40 点伤害',
    superfang: () => '让对手的剩余体力减半',
    naturesmadness: () => '让对手的剩余体力减半',
    ruination: () => '让对手的剩余体力减半',
    psywave: lv => `造成自己等级 0.5～1.5 倍的随机伤害（约 ${Math.floor(lv / 2)}～${Math.floor(lv * 1.5)} 点）`,
    endeavor: () => '把对手的体力削减到和自己相同',
    finalgambit: () => '造成与自己剩余体力相同的伤害，然后自己倒下',
  };
  const VARIABLE_ZH = {
    lowkick: '对手越重，威力越大（20～120）', grassknot: '对手越重，威力越大（20～120）',
    heavyslam: '自己比对手越重，威力越大（40～120）', heatcrash: '自己比对手越重，威力越大（40～120）',
    gyroball: '自己比对手越慢，威力越大（最高 150）', electroball: '自己比对手越快，威力越大（40～150）',
    flail: '自己剩余体力越少，威力越大（20～200）', reversal: '自己剩余体力越少，威力越大（20～200）',
    present: '随机威力 40 / 80 / 120', return: '本系统按亲密度最高计算，威力 102', frustration: '本系统按威力 102 计算',
  };
  const VOLATILE_DONE = ['protect', 'maxguard', 'confusion', 'flinch', 'focusenergy'];
  const VOLATILE_SIMPLIFIED = {
    partiallytrapped: '原作中会把对手束缚 4～5 回合并持续造成伤害；本系统只造成这一次伤害',
    mustrecharge: '原作中使用后下一回合需要休息；本系统不需要休息',
    lockedmove: '原作中会连续乱打 2～3 回合然后混乱；本系统只攻击一次，不会混乱',
    minimize: '', defensecurl: '',
  };
  const VOLATILE_ZH = { leechseed: '寄生种子', substitute: '替身', attract: '着迷', taunt: '挑衅', encore: '再来一次', disable: '定身法', yawn: '哈欠', curse: '诅咒', nightmare: '恶梦', torment: '无理取闹', ingrain: '扎根', aquaring: '水流环', magnetrise: '电磁飘浮', bide: '忍耐', rage: '愤怒', mist: '白雾', safeguard: '神秘守护', stockpile: '蓄力', charge: '充电', foresight: '识破', miracleeye: '奇迹之眼', destinybond: '同命', grudge: '怨念', endure: '挺住', helpinghand: '帮助', imprison: '封印', smackdown: '击落', roost: '羽栖', uproar: '吵闹', healblock: '回复封锁', embargo: '查封', telekinesis: '意念移物', powertrick: '力量戏法', electrify: '输电', octolock: '蛸固', tarshot: '沥青射击', saltcure: '盐腌', syrupbomb: '糖浆炸弹', glaiveRush: '巨剑突击', laserfocus: '磨砺', gastroacid: '胃液', powder: '粉尘', spotlight: '聚光灯', followme: '看我嘛', ragepowder: '愤怒粉', snatch: '抢夺', magiccoat: '魔法反射', banefulbunker: '碉堡', spikyshield: '尖刺防守', kingsshield: '王者盾牌' };
  const DONE_IDS = new Set(Object.keys(SPECIAL_ZH));
  const PSEUDO_DONE = { trickroom: '5 回合内速度慢的宝可梦先行动（再次使用则解除）', gravity: '5 回合内重力增强，招式更容易命中，飞行的宝可梦会落地' };

  function setDesc(d) { DESC = d && typeof d === 'object' ? d : {}; }
  function descOf(move, baseId) {
    const ids = [move?.id, baseId, String(move?.id || '').startsWith('hiddenpower') ? 'hiddenpower' : ''].filter(Boolean);
    for (const id of ids) if (DESC[id]) return DESC[id];
    return '';
  }
  const frac = ([a, b]) => {
    const r = a / b;
    for (const [t, s] of [[1 / 2, '1/2'], [1 / 3, '1/3'], [1 / 4, '1/4'], [3 / 4, '3/4'], [2 / 3, '2/3'], [1, '全部']]) if (Math.abs(r - t) < 0.02) return (Math.abs(r - t) < 1e-9 ? '' : '约 ') + s;
    return Math.round(r * 100) + '%';
  };
  function boostText(boosts, who) {
    const groups = {};
    for (const [k, v] of Object.entries(boosts || {})) if (v) (groups[v] = groups[v] || []).push(STAT_ZH[k] || k);
    return Object.entries(groups).map(([v, names]) => {
      v = +v;
      const verb = v > 0 ? (v >= 3 ? '巨幅提高' : v === 2 ? '大幅提高' : '提高') : (v <= -3 ? '巨幅降低' : v === -2 ? '大幅降低' : '降低');
      return `${who}的${names.join('、')}${verb}（${v > 0 ? '+' : ''}${v} 级）`;
    }).join('，');
  }
  function statusText(st) { return st === 'tox' ? '陷入剧毒' : st === 'slp' ? '睡着' : '陷入' + (STATUS_ZH[st] || st); }

  // 根据数据生成“本系统中的效果”说明
  function effectLines(move, user) {
    const lines = [], notes = [], warns = [];
    const B = global.PKMBattle || {};
    const id = move.id || '';
    const isStatus = move.category === 'Status';
    const tgtFoe = !isStatus || !['self', 'allySide', 'allies', 'adjacentAllyOrSelf'].includes(move.target);
    let implemented = false;

    if (move.priority > 0) lines.push(`先制度 +${move.priority}：通常比对手先出手`);
    if (move.priority < 0) lines.push(`先制度 ${move.priority}：通常比对手后出手`);
    if (move.basePower) implemented = true;
    if (move.accuracy === true && !isStatus) lines.push('不会落空（无视命中率和闪避率）');
    if (move.critRatio >= 2) lines.push(move.critRatio >= 4 ? '必定击中要害' : '容易击中要害');
    if (move.multihit) lines.push(Array.isArray(move.multihit) ? `1 回合内连续攻击 ${move.multihit[0]}～${move.multihit[1]} 次` : `1 回合内连续攻击 ${move.multihit} 次`);
    if (move.drain) lines.push(`回复造成伤害的 ${frac(move.drain)}`);
    if (move.recoil) lines.push(`自己会受到造成伤害 ${frac(move.recoil)} 的反作用力伤害`);
    if (move.heal) { lines.push(`回复自己最大体力的 ${frac(move.heal)}`); implemented = true; }
    if (move.ohko) { lines.push('一击必杀：命中就让对手直接倒下。命中率 = 30% + 等级差；对等级比自己高的对手无效'); implemented = true; }
    if (B.FIXED_DAMAGE_IDS?.includes(id)) { lines.push(FIXED_ZH[id] ? FIXED_ZH[id](user?.level || 50) : '造成固定伤害'); implemented = true; }
    if (B.VARIABLE_POWER_IDS?.includes(id)) { lines.push(VARIABLE_ZH[id] || '威力会随情况变化'); implemented = true; }
    if (move.selfdestruct === 'always') lines.push('使用后自己会倒下');
    if (move.status) { lines.push((move.target === 'self' ? '让自己' : '让对手') + statusText(move.status)); implemented = true; }
    if (move.boosts) { lines.push(boostText(move.boosts, move.target === 'self' || (isStatus && !tgtFoe) ? '自己' : '对手')); implemented = true; }
    if (move.self?.boosts) { lines.push((move.basePower ? '攻击后，' : '') + boostText(move.self.boosts, '自己')); implemented = true; }
    const secs = move.secondaries || (move.secondary ? [move.secondary] : []);
    for (const s of secs) {
      if (!s) continue;
      const ch = s.chance ?? 100, pre = ch >= 100 ? '必定' : `${ch}% 几率`;
      if (s.status) lines.push(`${pre}让对手${statusText(s.status)}`);
      if (s.volatileStatus === 'flinch') lines.push(`${pre}让对手畏缩（比对手先出手时，对手这回合无法行动）`);
      if (s.volatileStatus === 'confusion') lines.push(`${pre}让对手混乱`);
      if (s.boosts) lines.push(`${pre}${boostText(s.boosts, '对手')}`);
      if (s.self?.boosts) lines.push(`${pre}${boostText(s.self.boosts, '自己')}`);
    }
    const vol = move.volatileStatus;
    if (vol === 'protect' || vol === 'maxguard') { lines.push('这一回合完全挡住对手的攻击（连续使用容易失败）'); implemented = true; }
    if (vol === 'confusion') { lines.push('让对手混乱（混乱时有几率攻击自己）'); implemented = true; }
    if (move.weather) { const w = String(move.weather).toLowerCase(); lines.push(`天气变为${WEATHER_ZH[w] || w}（5 回合）`); implemented = true; }
    if (move.terrain) { const t = String(move.terrain).toLowerCase(); lines.push(`场地变为${TERRAIN_ZH[t] || t}（5 回合）`); implemented = true; }
    if (move.pseudoWeather) {
      if (PSEUDO_DONE[move.pseudoWeather]) { lines.push(PSEUDO_DONE[move.pseudoWeather]); implemented = true; }
      else { warns.push('这个招式的场地效果本系统暂未实现，使用后不会起作用'); implemented = 'warned'; }
    }
    if (move.sideCondition) {
      if (SIDE_ZH[move.sideCondition]) { lines.push(SIDE_ZH[move.sideCondition]); implemented = true; }
      else { warns.push(`「${VOLATILE_ZH[move.sideCondition] || move.sideCondition}」的效果本系统暂未实现，使用后不会起作用`); implemented = 'warned'; }
    }
    if (SPECIAL_ZH[id]) { lines.push(SPECIAL_ZH[id]); implemented = true; }
    if (move._isZ) lines.push('Ｚ招式：每场战斗只能使用一次');
    if (move._isMax) lines.push('极巨招式：附带额外的场地或能力变化效果');
    // 简化 / 未实现
    if (move.flags?.charge) notes.push('原作中需要先蓄力 1 回合；本系统在当回合直接攻击');
    for (const v of [vol, move.self?.volatileStatus].filter(Boolean)) {
      if (VOLATILE_DONE.includes(v)) continue;
      if (v in VOLATILE_SIMPLIFIED) { if (VOLATILE_SIMPLIFIED[v]) notes.push(VOLATILE_SIMPLIFIED[v]); continue; }
      warns.push(`「${VOLATILE_ZH[v] || v}」效果本系统暂未实现${isStatus && !implemented ? '，使用后不会起作用' : ''}`);
      if (isStatus && !implemented) implemented = 'warned';
    }
    if (!move.basePower && !isStatus && !implemented) warns.push('这个招式的伤害计算方式比较特殊，本系统暂未实现，使用后不会造成伤害');
    else if (isStatus && !implemented) warns.push('这个招式的效果本系统暂未实现，使用后不会起作用');
    return { lines: lines.filter(Boolean), notes, warns };
  }

  // 对当前对手的相性与预计伤害
  function matchup(move, user, foe, ctxFoeName = '') {
    const B = global.PKMBattle, T = global.PKMTypeChart;
    if (!user || !foe || !B || !T || foe.fainted) return null;
    const out = { lines: [], warns: [] };
    const isStatus = move.category === 'Status';
    const foeName = ctxFoeName || foe.name || '对手';
    if (!isStatus) {
      let eff = T.effectiveness(move.type, foe.types);
      const sp = B.specialDamageInfo ? B.specialDamageInfo(user, foe, move) : null;
      let lo = 0, hi = 0, exact = false;
      if (move.basePower) {
        const a = B.estimateDamage(user, foe, move, 0.85), b = B.estimateDamage(user, foe, move, 1);
        eff = b.eff; lo = a.damage; hi = b.damage;
      } else if (sp && eff !== 0) {
        if (sp.kind === 'ohko') { lo = hi = foe.hp; exact = true; if (user.level < foe.level) { out.warns.push(`对手等级比自己高，一击必杀不会生效`); lo = hi = 0; } }
        else if (sp.kind === 'fixed') { const a = B.specialDamageInfo(user, foe, move, 0), b = B.specialDamageInfo(user, foe, move, 0.999); lo = a.damage; hi = b.damage; exact = true; }
        else { const m2 = { ...move, basePower: sp.basePower }; const a = B.estimateDamage(user, foe, m2, 0.85), b = B.estimateDamage(user, foe, m2, 1); lo = a.damage; hi = b.damage; eff = b.eff; out.lines.push(`对 ${foeName} 的威力约为 ${sp.basePower}`); }
      }
      let effText = eff === 0 ? '没有效果（×0）' : eff >= 4 ? '效果超绝佳（×4）' : eff >= 2 ? '效果绝佳（×2）' : eff <= 0.25 ? '效果很不理想（×0.25）' : eff < 1 ? '效果不理想（×0.5）' : '效果一般（×1）';
      if (exact && eff !== 0) { effText = '伤害不受属性相性影响'; eff = 1; }
      out.eff = eff; out.effText = effText; out.effClass = eff === 0 ? 'immune' : eff > 1 ? 'super' : eff < 1 ? 'weak' : 'neutral';
      if (!exact && move.basePower && B.stabMultiplier && B.stabMultiplier(user, move) > 1) out.lines.push(`属性与自己一致，威力 ×${B.stabMultiplier(user, move)}`);
      if (eff !== 0 && hi > 0) {
        const pct = d => Math.min(100, Math.round(d / foe.maxHp * 1000) / 10);
        const hitsNote = move.multihit ? '（每击）' : '';
        const pts = lo === hi ? `${lo} 点` : `${lo}～${hi} 点${hitsNote}`;
        out.damageText = lo >= foe.hp && !move.multihit ? `${pts}（超过对手剩余体力 ${foe.hp}）` : lo === hi ? `${pts}（约为对手最大体力的 ${pct(lo)}%）` : `${pts}（约为对手最大体力的 ${pct(lo)}%～${pct(hi)}%）`;
        if (!move.multihit) out.koText = lo >= foe.hp ? '这一击就能打倒对手' : hi >= foe.hp ? '有机会这一击打倒对手' : '';
      }
    } else if (move.status && move.target !== 'self') {
      const st = move.status, ty = foe.types || [];
      if (foe.status) out.warns.push(`${foeName} 已经处于${STATUS_ZH[foe.status] || foe.status}状态，不会再陷入其他异常状态`);
      else if ((st === 'par' && ty.includes('Electric')) || (st === 'brn' && ty.includes('Fire')) || (['psn', 'tox'].includes(st) && (ty.includes('Poison') || ty.includes('Steel'))) || (st === 'frz' && ty.includes('Ice')))
        out.warns.push(`${foeName} 的属性不会${statusText(st).replace('陷入', '陷入')}`);
      else if (st === 'par' && move.type === 'Electric' && T.effectiveness('Electric', ty) === 0) out.warns.push(`${foeName} 是地面属性，电磁波对它无效`);
    }
    if (move.boosts && isStatus && move.target !== 'self') {
      const maxed = Object.entries(move.boosts).every(([k, v]) => (v < 0 && (foe.stages?.[k] || 0) <= -6) || (v > 0 && (foe.stages?.[k] || 0) >= 6));
      if (maxed) out.warns.push(`${foeName} 的能力已经变化到极限，不会再变化`);
    }
    return out;
  }

  function describe(move, ctx = {}) {
    const { user = null, foe = null, baseMove = null } = ctx;
    const zhType = ctx.zhType || (t => TYPE_ZH[t] || t);
    const zhCat = ctx.zhCat || (c => CAT_ZH[c] || c);
    const name = ctx.name || move.name;
    const ppm = baseMove || move;
    const rows = [
      ['属性', zhType(move.type)],
      ['分类', zhCat(move.category)],
      ['威力', move.basePower ? String(move.basePower) : (move.category === 'Status' ? '—' : '特殊')],
      ['命中', move.accuracy === true || move.accuracy == null ? '必定命中' : move.accuracy + '%'],
      ['招式点数', ppm.id === 'struggle' ? '—' : `${ppm.ppLeft ?? ppm.pp}/${ppm.pp}`],
      ['先制度', move.priority ? (move.priority > 0 ? '+' : '') + move.priority : '0'],
      ['对象', TARGET_ZH[move.target] || '对手'],
    ];
    const fx = effectLines(move, user);
    const desc = descOf(move, baseMove?.id);
    return { name, type: move.type, category: move.category, rows, desc, effects: fx.lines, notes: fx.notes, warns: fx.warns, matchup: matchup(move, user, foe, ctx.foeName), foeName: ctx.foeName || foe?.name || '' };
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function html(info) {
    const li = arr => arr.map(x => `<li>${esc(x)}</li>`).join('');
    const m = info.matchup;
    let mu = '';
    if (m && (m.effText || m.damageText || m.lines.length || m.warns.length)) {
      mu = `<section class="mi-sec mi-matchup"><h4>对 ${esc(info.foeName)}</h4><ul>`
        + (m.effText ? `<li class="mi-eff ${m.effClass}">${esc(m.effText)}</li>` : '')
        + (m.damageText ? `<li>预计伤害：<b>${esc(m.damageText)}</b></li>` : '')
        + (m.koText ? `<li class="mi-ko">${esc(m.koText)}</li>` : '')
        + li(m.lines) + m.warns.map(w => `<li class="mi-warn">⚠ ${esc(w)}</li>`).join('') + '</ul></section>';
    }
    return `<header class="mi-head"><span class="mi-name">${esc(info.name)}</span><span class="mi-type">${esc(info.rows[0][1])}</span><span class="mi-cat cat-${esc(String(info.category).toLowerCase())}">${esc(info.rows[1][1])}</span></header>`
      + `<dl class="mi-rows">${info.rows.slice(2).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
      + (info.desc ? `<p class="mi-desc">${esc(info.desc)}</p>` : '')
      + (info.effects.length ? `<section class="mi-sec"><h4>效果</h4><ul>${li(info.effects)}</ul></section>` : (info.desc ? '' : '<p class="mi-desc">没有特别的附加效果。</p>'))
      + (info.notes.length ? `<section class="mi-sec mi-notes"><h4>本对战系统的简化</h4><ul>${li(info.notes)}</ul></section>` : '')
      + (info.warns.length ? `<section class="mi-sec mi-warns"><ul>${info.warns.map(w => `<li class="mi-warn">⚠ ${esc(w)}</li>`).join('')}</ul></section>` : '')
      + mu;
  }
  // 桌面端悬停提示（纯文本）
  function tooltip(info) {
    const parts = [`${info.name}（${info.rows[0][1]}·${info.rows[1][1]}）`];
    if (info.desc) parts.push(info.desc);
    else if (info.effects.length) parts.push(info.effects.join('；'));
    parts.push('长按或点 ⓘ 查看详细说明');
    return parts.join('\n');
  }

  global.PKMMoveInfo = { setDesc, describe, html, tooltip, effectLines, matchup, _desc: () => DESC };
})(typeof window !== 'undefined' ? window : globalThis);
