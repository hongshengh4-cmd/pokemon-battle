/* Team building, learnset legality and automatic move selection. */
(function (root) {
  'use strict';
  let DEX = {}, MOVES = {}, LEARNSETS = {};
  const normId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function setData(dex, moves, learnsets) { DEX = dex || {}; MOVES = moves || {}; LEARNSETS = learnsets || {}; }

  function legalInfo(speciesId, moveId) {
    const sid = normId(speciesId), mid = normId(moveId);
    const raw = LEARNSETS[sid]?.[mid];
    if (!raw) return null;
    const [level, viaRaw] = raw;
    const via = viaRaw || '';
    const labels = [];
    if (level) labels.push(`Lv.${level}`);
    if (via.includes('M')) labels.push('招式学习器');
    if (via.includes('T')) labels.push('教授招式');
    if (via.includes('E')) labels.push('蛋招式');
    if (via.includes('R')) labels.push('招式回忆');
    if (via.includes('S')) labels.push('活动配信');
    return { species: sid, move: mid, level: level || 0, via, viaLabel: labels.join('+') || '特殊获得', flexibleSource: /[METR]/.test(via) };
  }
  function hasLearnset(speciesId) { return !!LEARNSETS[normId(speciesId)]; }
  function isLegalMove(speciesId, moveId, level = 100) {
    const info = legalInfo(speciesId, moveId);
    if (!info) return false;
    // Event-only moves are recorded for completeness, but are not treated as
    // normally learnable when building or validating an ordinary team.
    if (!info.level && !info.flexibleSource) return false;
    if (info.level && info.level > level && !info.flexibleSource) return false;
    return true;
  }
  function legalMoves(speciesId, level = 100) {
    const table = LEARNSETS[normId(speciesId)] || {};
    return Object.keys(table)
      .filter(mid => MOVES[mid] && isLegalMove(speciesId, mid, level))
      .map(mid => ({ id: mid, ...MOVES[mid], learn: legalInfo(speciesId, mid) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function megaForms(speciesId) {
    const sid = normId(speciesId);
    return Object.entries(DEX)
      .filter(([id, sp]) => id.includes('mega') && normId(sp.baseSpecies || '') === sid)
      .map(([id, sp]) => ({ id, ...sp }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  function gmaxForm(speciesId) {
    const id = normId(speciesId) + 'gmax';
    return DEX[id] ? { id, ...DEX[id] } : null;
  }
  function mechanicOf(entry) {
    const mech = root.PKMMechanics;
    let kind = normId(entry?.mechanic || '');
    if (!kind && entry?.megaForm) kind = 'mega';
    if (!kind && entry?.teraType) kind = 'tera';
    if (!kind && mech?.typeForZCrystal(entry?.item)) kind = 'z';
    return ['mega', 'z', 'dynamax', 'tera'].includes(kind) ? kind : '';
  }

  function damageScore(species, move) {
    if (!move.basePower) return 0;
    const phys = species.baseStats.atk >= species.baseStats.spa;
    let s = move.basePower * ((move.accuracy === true || move.accuracy == null ? 100 : move.accuracy) / 100);
    if (species.types.includes(move.type)) s *= 1.5;
    if ((move.category === 'Physical') === phys) s *= 1.2;
    if ((move.priority || 0) > 0) s *= 1.08;
    return s;
  }
  function utilityScore(species, move) {
    let s = 0;
    if (move.heal) s = Math.max(s, 46);
    if (move.status) s = Math.max(s, 44);
    if (move.volatileStatus === 'confusion') s = Math.max(s, 36);
    if (move.boosts) {
      const atk = Math.max(move.boosts.atk || 0, move.boosts.spa || 0);
      if (atk > 0) s = Math.max(s, 34 + atk * 8);
      if ((move.boosts.spe || 0) > 0) s = Math.max(s, 34);
    }
    if (move.self?.boosts) s = Math.max(s, 36);
    return s;
  }

  function chooseAutoMoves(speciesId, level = 50) {
    const sid = normId(speciesId), species = DEX[sid];
    if (!species) return [];
    let pool = legalMoves(sid, level).map(m => m.id);
    if (!pool.length) {
      // Species has no current-generation learnset data in the dataset; use the
      // old heuristic so the Pokemon remains playable, and let validation warn.
      pool = Object.keys(MOVES);
    }
    const scored = pool.map(id => ({ id, move: MOVES[id] })).filter(x => x.move);
    const damage = scored.filter(x => x.move.basePower > 0)
      .map(x => ({ ...x, score: damageScore(species, x.move) * (0.92 + ((sid.length + x.id.length) % 7) / 100) }))
      .sort((a, b) => b.score - a.score);
    const picked = [], usedTypes = new Set();
    for (const c of damage) {
      if (picked.length >= 3) break;
      if (usedTypes.has(c.move.type) && picked.length < 2) continue;
      usedTypes.add(c.move.type); picked.push(c.id);
    }
    const utility = scored.map(x => ({ ...x, score: utilityScore(species, x.move) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score)[0];
    if (utility && !picked.includes(utility.id)) picked.push(utility.id);
    for (const c of damage) { if (picked.length >= 4) break; if (!picked.includes(c.id)) picked.push(c.id); }
    return picked.slice(0, 4);
  }

  function validateTeam(team) {
    const errors = [], warnings = [];
    if (!Array.isArray(team) || !team.length) errors.push('队伍为空');
    if (Array.isArray(team) && team.length > 6) errors.push('队伍最多 6 只');
    (team || []).forEach((entry, idx) => {
      const at = `第 ${idx + 1} 只`;
      const sid = normId(entry?.species || entry?.name);
      if (!DEX[sid]) { errors.push(`${at}：物种不存在（${entry?.species || entry?.name || '未填'}）`); return; }
      const level = entry.level ?? entry.lv ?? 50;
      if (!(level >= 1 && level <= 100)) errors.push(`${at} ${sid}：等级应在 1~100`);
      const mv = entry.moves || [];
      if (!mv.length || mv.length > 4) errors.push(`${at} ${sid}：招式数量应为 1~4`);
      if (new Set(mv.map(normId)).size !== mv.length) errors.push(`${at} ${sid}：招式重复`);
      const knownLearnset = hasLearnset(sid);
      if (!knownLearnset && mv.length) warnings.push(`${at} ${sid}：数据集暂无该物种现行学习面，招式未校验`);
      for (const midRaw of mv) {
        const mid = normId(midRaw);
        if (!MOVES[mid]) { errors.push(`${at} ${sid}：招式不存在（${midRaw}）`); continue; }
        if (knownLearnset && !isLegalMove(sid, mid, level)) errors.push(`${at} ${sid}：${MOVES[mid].name} 不在合法学习面内（Lv.${level}）`);
      }
      const mechKind = mechanicOf(entry);
      if (entry.mechanic && !mechKind) errors.push(`${at} ${sid}：未知战斗机制（${entry.mechanic}）`);
      if (mechKind === 'mega') {
        const forms = megaForms(sid);
        if (!forms.length) errors.push(`${at} ${sid}：该物种没有 Mega 形态`);
        else if (!entry.megaForm || !forms.some(f => f.id === normId(entry.megaForm))) errors.push(`${at} ${sid}：请选择有效的 Mega 形态`);
      }
      if (mechKind === 'z') {
        const zType = root.PKMMechanics?.canonType(entry.zType) || root.PKMMechanics?.typeForZCrystal(entry.item);
        if (!zType) errors.push(`${at} ${sid}：Z 招式需要选择 Z 属性或携带对应 Z 水晶`);
        else if (!mv.some(mid => MOVES[normId(mid)]?.type === zType)) errors.push(`${at} ${sid}：没有 ${zType} 属性招式，无法使用该 Z 水晶`);
      }
      if (mechKind === 'tera' && !root.PKMMechanics?.canonType(entry.teraType)) errors.push(`${at} ${sid}：太晶化需要选择有效的太晶属性`);
      if (mechKind === 'dynamax' && entry.dynamaxForm === 'gmax' && !gmaxForm(sid)) warnings.push(`${at} ${sid}：没有超极巨化形态，将按普通极巨化处理`);
      if (entry.ability && DEX[sid].abilities?.length && !DEX[sid].abilities.some(a => normId(a) === normId(entry.ability))) {
        errors.push(`${at} ${sid}：特性 ${entry.ability} 不在该物种特性列表中`);
      } else if (entry.ability && root.PKMMechanics && !root.PKMMechanics.isSupportedAbility(entry.ability)) {
        warnings.push(`${at} ${sid}：特性 ${entry.ability} 的效果将在后续阶段实现（当前不触发）`);
      }
      if (entry.item && root.PKMMechanics && !root.PKMMechanics.isSupportedItem(entry.item)) {
        warnings.push(`${at} ${sid}：道具 ${entry.item} 的效果将在后续阶段实现（当前不触发）`);
      }
    });
    return { ok: errors.length === 0, errors, warnings };
  }

  const api = { setData, legalInfo, legalMoves, hasLearnset, isLegalMove, chooseAutoMoves, validateTeam, normId, megaForms, gmaxForm, mechanicOf };
  root.PKMTeam = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
