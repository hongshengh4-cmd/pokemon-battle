/*
 * PKM Battle Engine - singles (1v1 active, up to 6v6 teams).
 * Pure logic, no DOM. Depends on global PKMTypeChart.
 * Phase 1 scope: stats/IV/nature, damage formula, priority/speed order,
 * accuracy, crit, STAB, burn, weather basics (sun/rain/sand), major status
 * (par/brn/psn/tox/slp/frz), confusion, stat stages, secondary effects,
 * boosts/drain/recoil/heal/multihit from Showdown-style move data,
 * switching, simple AI. Phase 3 adds a curated ability/item set, weather
 * abilities/moves, terrains, entry hazards, screens, Tailwind and Trick Room.
 * Phase 4A adds Mega Evolution, Z-Moves, Dynamax/Gigantamax and Terastallization
 * in singles (doubles remains a separate later refactor).
 */
(function (root) {
  'use strict';
  const { effectiveness } = root.PKMTypeChart || (typeof require !== 'undefined' ? require('./typechart.js') : {});

  const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const BATTLE_STATS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'];
  const NATURES = {
    adamant: ['atk', 'spa'], modest: ['spa', 'atk'], jolly: ['spe', 'spa'], timid: ['spe', 'atk'],
    bold: ['def', 'atk'], calm: ['spd', 'atk'], impish: ['def', 'spa'], careful: ['spd', 'spa'],
    brave: ['atk', 'spe'], quiet: ['spa', 'spe'], relaxed: ['def', 'spe'], sassy: ['spd', 'spe'],
    lonely: ['atk', 'def'], mild: ['spa', 'def'], hasty: ['spe', 'def'], naive: ['spe', 'spd'],
    naughty: ['atk', 'spd'], rash: ['spa', 'spd'], lax: ['def', 'spd'], gentle: ['spd', 'def'],
  };
  const STATUS_NAMES = { par: '麻痹', brn: '灼伤', psn: '中毒', tox: '剧毒', slp: '睡眠', frz: '冰冻' };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clampStage = v => Math.max(-6, Math.min(6, v));
  function stageMult(stage, kind) {
    stage = clampStage(stage);
    if (kind === 'acc') return stage >= 0 ? (3 + stage) / 3 : 3 / (3 - stage);
    if (kind === 'eva') return stage >= 0 ? 3 / (3 + stage) : (3 - stage) / 3;
    return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
  }

  function calcStats(species, level, opts = {}) {
    const ivs = Object.assign({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, opts.ivs || {});
    const nature = (opts.nature || '').toLowerCase();
    const [up, down] = NATURES[nature] || [null, null];
    const out = {};
    for (const k of STAT_KEYS) {
      const base = species.baseStats[k];
      if (k === 'hp') { out.hp = Math.floor(((2 * base + ivs[k]) * level) / 100) + level + 10; continue; }
      let v = Math.floor(((2 * base + ivs[k]) * level) / 100) + 5;
      if (up === k) v = Math.floor(v * 1.1);
      if (down === k) v = Math.floor(v * 0.9);
      out[k] = v;
    }
    return out;
  }

  let DEX = {}, MOVES = {};
  function setData(dex, moves) { DEX = dex || {}; MOVES = moves || {}; }
  const normId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const MECH = root.PKMMechanics || null;
  const TYPE_ITEMS = MECH?.TYPE_ITEMS || {};
  const abilityId = p => normId(p?.ability || '');
  const itemId = p => normId(p?.item || '');
  const hasAbility = (p, ...ids) => ids.includes(abilityId(p));
  const STAT_LABELS = { atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度', accuracy: '命中率', evasion: '闪避率' };
  const PINCH_ABILITIES = { Fire: 'blaze', Water: 'torrent', Grass: 'overgrow', Bug: 'swarm' };
  const STATUS_BY_ABILITY = { static: 'par', flamebody: 'brn', poisonpoint: 'psn' };
  const newSideField = () => ({ stealthrock: false, spikes: 0, toxicspikes: 0, stickyweb: false, reflect: 0, lightscreen: 0, auroraveil: 0, tailwind: 0 });

  function isGrounded(p) {
    if (!p) return false;
    if (p._battle?.field?.gravity > 0) return true;
    return !p.types?.includes('Flying') && abilityId(p) !== 'levitate';
  }

  function battleStat(p, key, opts = {}) {
    let stage = opts.ignoreStages ? 0 : (p.stages[key] || 0);
    if (opts.crit) stage = opts.isAttackStat ? Math.max(stage, 0) : Math.min(stage, 0);
    let v = p.stats[key] * stageMult(stage, key === 'accuracy' ? 'acc' : key === 'evasion' ? 'eva' : undefined);
    const battle = p._battle;
    if (key === 'atk') {
      if (hasAbility(p, 'hugepower', 'purepower')) v *= 2;
      if (hasAbility(p, 'hustle')) v *= 1.5;
      if (hasAbility(p, 'guts') && p.status) v *= 1.5;
      if (hasAbility(p, 'defeatist') && p.hp <= p.maxHp / 2) v *= 0.5;
      if (itemId(p) === 'choiceband') v *= 1.5;
      if (itemId(p) === 'lightball' && p.speciesId === 'pikachu') v *= 2;
    }
    if (key === 'def') {
      if (hasAbility(p, 'furcoat')) v *= 2;
      if (hasAbility(p, 'marvelscale') && p.status) v *= 1.5;
      if (hasAbility(p, 'grassypelt') && battle?.field?.terrain === 'grassy' && isGrounded(p)) v *= 1.5;
      if (battle?.weather === 'snow' && p.types.includes('Ice')) v *= 1.5;
    }
    if (key === 'spa') {
      if (hasAbility(p, 'defeatist') && p.hp <= p.maxHp / 2) v *= 0.5;
      if (hasAbility(p, 'solarpower') && battle?.weather === 'sun') v *= 1.5;
      if (itemId(p) === 'choicespecs') v *= 1.5;
      if (itemId(p) === 'lightball' && p.speciesId === 'pikachu') v *= 2;
    }
    if (key === 'spd') {
      if (battle?.weather === 'sand' && p.types.includes('Rock')) v *= 1.5;
    }
    if (key === 'spe') {
      if (p.status === 'par' && !hasAbility(p, 'quickfeet')) v *= 0.5;
      if (hasAbility(p, 'quickfeet') && p.status) v *= 1.5;
      if (battle?.weather === 'rain' && hasAbility(p, 'swiftswim')) v *= 2;
      if (battle?.weather === 'sun' && hasAbility(p, 'chlorophyll')) v *= 2;
      if (battle?.weather === 'sand' && hasAbility(p, 'sandrush')) v *= 2;
      if (battle?.weather === 'snow' && hasAbility(p, 'slushrush')) v *= 2;
      if (itemId(p) === 'choicescarf') v *= 1.5;
      if (battle?.field?.sides?.[p._side]?.tailwind > 0) v *= 2;
    }
    return Math.max(1, Math.floor(v));
  }

  function abilityMoveInteraction(attacker, defender, move) {
    if (!move || !defender || defender === attacker) return null;
    if (['self', 'allySide', 'foeSide', 'all'].includes(move.target)) return null;
    if (move.flags?.sound && hasAbility(defender, 'soundproof')) return { kind: 'immune', label: '隔音' };
    if (move.flags?.bullet && hasAbility(defender, 'bulletproof')) return { kind: 'immune', label: '防弹' };
    const t = move.type;
    if (t === 'Ground' && hasAbility(defender, 'levitate') && !(defender._battle?.field?.gravity > 0)) return { kind: 'immune', label: '漂浮' };
    if (t === 'Fire' && hasAbility(defender, 'flashfire')) return { kind: 'flashfire', label: '引火' };
    if (t === 'Electric' && hasAbility(defender, 'voltabsorb')) return { kind: 'heal', label: '蓄电' };
    if (t === 'Electric' && hasAbility(defender, 'lightningrod')) return { kind: 'boost', boosts: { spa: 1 }, label: '避雷针' };
    if (t === 'Electric' && hasAbility(defender, 'motordrive')) return { kind: 'boost', boosts: { spe: 1 }, label: '电气引擎' };
    if (t === 'Water' && hasAbility(defender, 'waterabsorb', 'dryskin')) return { kind: 'heal', label: '储水' };
    if (t === 'Water' && hasAbility(defender, 'stormdrain')) return { kind: 'boost', boosts: { spa: 1 }, label: '引水' };
    if (t === 'Grass' && hasAbility(defender, 'sapsipper')) return { kind: 'boost', boosts: { atk: 1 }, label: '食草' };
    if (t === 'Ground' && hasAbility(defender, 'eartheater')) return { kind: 'heal', label: '食土' };
    if (move.basePower && hasAbility(defender, 'wonderguard') && effectiveness(t, defender.types) <= 1) return { kind: 'immune', label: '神奇守护' };
    return null;
  }

  function modifiedPower(attacker, defender, move) {
    let power = move.basePower || 0;
    const battle = attacker._battle;
    if (battle?.weather === 'sun') { if (move.type === 'Fire') power *= 1.5; if (move.type === 'Water') power *= 0.5; }
    if (battle?.weather === 'rain') { if (move.type === 'Water') power *= 1.5; if (move.type === 'Fire') power *= 0.5; }
    const terrain = battle?.field?.terrain;
    if (terrain === 'electric' && move.type === 'Electric' && isGrounded(attacker)) power *= 1.3;
    if (terrain === 'grassy') {
      if (move.type === 'Grass' && isGrounded(attacker)) power *= 1.3;
      if (['earthquake', 'bulldoze', 'magnitude'].includes(move.id) && isGrounded(defender)) power *= 0.5;
    }
    if (terrain === 'psychic' && move.type === 'Psychic' && isGrounded(attacker)) power *= 1.3;
    if (terrain === 'misty' && move.type === 'Dragon' && isGrounded(defender)) power *= 0.5;
    const pinch = PINCH_ABILITIES[move.type];
    if (pinch && hasAbility(attacker, pinch) && attacker.hp <= attacker.maxHp / 3) power *= 1.5;
    if ((move.basePower || 0) <= 60 && hasAbility(attacker, 'technician')) power *= 1.5;
    if (move.flags?.punch && hasAbility(attacker, 'ironfist')) power *= 1.2;
    if (move.flags?.contact && hasAbility(attacker, 'toughclaws')) power *= 1.3;
    if (move.flags?.bite && hasAbility(attacker, 'strongjaw')) power *= 1.5;
    if (move.flags?.pulse && hasAbility(attacker, 'megalauncher')) power *= 1.5;
    if (move.recoil && hasAbility(attacker, 'reckless')) power *= 1.2;
    if (move.secondary && hasAbility(attacker, 'sheerforce')) power *= 1.3;
    if (move.type === 'Fire' && attacker.volatile?.flashfire && hasAbility(attacker, 'flashfire')) power *= 1.5;
    if (battle?.weather === 'sand' && ['Rock', 'Ground', 'Steel'].includes(move.type) && hasAbility(attacker, 'sandforce')) power *= 1.3;
    if (TYPE_ITEMS[itemId(attacker)] === move.type) power *= 1.2;
    if (itemId(attacker) === 'muscleband' && move.category === 'Physical') power *= 1.1;
    if (itemId(attacker) === 'wiseglasses' && move.category === 'Special') power *= 1.1;
    return power;
  }

  function defenderDamageMultiplier(attacker, defender, move, eff) {
    let mult = 1;
    if (hasAbility(defender, 'thickfat') && ['Fire', 'Ice'].includes(move.type)) mult *= 0.5;
    if (hasAbility(defender, 'heatproof') && move.type === 'Fire') mult *= 0.5;
    if (hasAbility(defender, 'purifyingsalt') && move.type === 'Ghost') mult *= 0.5;
    if (eff > 1 && hasAbility(defender, 'filter', 'solidrock', 'prismarmor')) mult *= 0.75;
    if ((hasAbility(defender, 'multiscale', 'shadowshield')) && defender.hp === defender.maxHp) mult *= 0.5;
    if (hasAbility(defender, 'icescales') && move.category === 'Special') mult *= 0.5;
    if (hasAbility(defender, 'punkrock') && move.flags?.sound) mult *= 0.5;
    if (hasAbility(defender, 'fluffy')) { if (move.flags?.contact) mult *= 0.5; if (move.type === 'Fire') mult *= 2; }
    if (hasAbility(attacker, 'tintedlens') && eff > 0 && eff < 1) mult *= 2;
    if (itemId(attacker) === 'lifeorb') mult *= 1.3;
    if (itemId(attacker) === 'expertbelt' && eff > 1) mult *= 1.2;
    const battle = defender._battle;
    if (battle && !hasAbility(attacker, 'infiltrator')) {
      const sc = battle.field?.sides?.[defender._side];
      if (sc) {
        if ((move.category === 'Physical' && sc.reflect > 0) || (move.category === 'Special' && sc.lightscreen > 0) || sc.auroraveil > 0) mult *= 0.5;
      }
    }
    return mult;
  }

  function createPokemon(speciesId, level, moveIds, opts = {}) {
    const id = normId(speciesId);
    const species = DEX[id];
    if (!species) throw new Error('Unknown species: ' + speciesId);
    const stats = calcStats(species, level, opts);
    const moves = (moveIds || []).slice(0, 4).map(mid => {
      const m = MOVES[normId(mid)];
      if (!m) throw new Error('Unknown move: ' + mid);
      return { id: normId(mid), ...m, ppLeft: m.pp ?? 10 };
    });
    if (!moves.length) throw new Error('Pokemon needs at least one move: ' + speciesId);
    const item = opts.item ? normId(opts.item) : null;
    const zType = MECH?.canonType(opts.zType || opts.zMoveType) || MECH?.typeForZCrystal(item) || null;
    let mechanic = normId(typeof opts.mechanic === 'string' ? opts.mechanic : (opts.mechanic?.kind || opts.mechanic?.type || ''));
    if (mechanic.includes('mega')) mechanic = 'mega';
    else if (mechanic.includes('tera')) mechanic = 'tera';
    else if (mechanic.includes('dynamax') || mechanic.includes('gigantamax') || mechanic.includes('gmax')) mechanic = 'dynamax';
    else if (mechanic === 'z' || mechanic.includes('zmove')) mechanic = 'z';
    if (!mechanic && (opts.megaForm || opts.mega)) mechanic = 'mega';
    if (!mechanic && opts.teraType) mechanic = 'tera';
    if (!mechanic && zType && item) mechanic = 'z';
    if (!['mega', 'z', 'dynamax', 'tera'].includes(mechanic)) mechanic = null;
    return {
      speciesId: id, originalSpeciesId: id, name: opts.nickname || species.name, speciesName: species.name, hasNickname: !!opts.nickname,
      types: species.types.slice(), originalTypes: species.types.slice(), level, stats, maxHp: stats.hp, hp: stats.hp,
      ivs: Object.assign({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, opts.ivs || {}), nature: opts.nature || '',
      moves, status: null, statusTurns: 0, toxicCounter: 1, sleepTurns: 0,
      stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
      volatile: {}, ability: opts.ability ? normId(opts.ability) : (normId(species.abilities?.[0] ?? '') || null), item,
      gender: opts.gender || null, shiny: !!opts.shiny, fainted: false,
      mechanic, megaForm: opts.megaForm || opts.mega ? normId(opts.megaForm || opts.mega) : null,
      teraType: MECH?.canonType(opts.teraType) || null, terastallized: false,
      zType, dynamaxForm: opts.dynamaxForm === 'gmax' || opts.gmax ? 'gmax' : null,
      isMega: id.includes('mega'), dynamaxed: false, dynamaxTurns: 0, normalMaxHp: null, _preDynamax: null,
      choiceLockedMove: null, enteredTurn: 0, _enteredThisTurn: false, _side: null,
    };
  }

  function effStat(p, key) { return battleStat(p, key); }
  function struggleMove() {
    const m = MOVES.struggle || { name: 'Struggle', type: 'Normal', category: 'Physical', basePower: 50, accuracy: true, pp: 1, priority: 0, flags: { contact: 1 }, target: 'normal' };
    return { id: 'struggle', ...m, target: 'normal', ppLeft: 1, pp: 1 };
  }

  function stabMultiplier(attacker, move) {
    if (!move?.type) return 1;
    const adaptable = hasAbility(attacker, 'adaptability');
    if (attacker.terastallized && attacker.teraType) {
      const tera = move.type === attacker.teraType;
      const original = (attacker.originalTypes || []).includes(move.type);
      if (tera && original) return adaptable ? 2.25 : 2;
      if (tera || original) return adaptable ? 2 : 1.5;
      return 1;
    }
    if ((attacker.types || []).includes(move.type)) return adaptable ? 2 : 1.5;
    return 1;
  }
  function zMovePower(move) {
    const bp = move.basePower || 0;
    if (bp <= 55) return 100; if (bp <= 65) return 120; if (bp <= 75) return 140; if (bp <= 85) return 160;
    if (bp <= 95) return 175; if (bp <= 100) return 180; if (bp <= 110) return 185; if (bp <= 120) return 190;
    if (bp <= 130) return 195; return 200;
  }
  function maxMovePower(move) {
    const bp = move.basePower || 0;
    let power = bp <= 40 ? 90 : bp <= 50 ? 100 : bp <= 60 ? 110 : bp <= 70 ? 120 : bp <= 80 ? 130 : bp <= 90 ? 130 : bp <= 100 ? 135 : bp <= 110 ? 140 : bp <= 120 ? 145 : 150;
    if (['Fighting', 'Poison'].includes(move.type)) power = Math.max(70, power - 20);
    return power;
  }
  function makeZMove(user, baseMove) {
    if (!baseMove) return baseMove;
    if (baseMove.category === 'Status') return { ...baseMove, _isZ: true, _zStatus: true, _baseId: baseMove.id, name: `Z·${baseMove.name}`, accuracy: true };
    const crystal = MECH?.zCrystalForType(user.zType || baseMove.type);
    const generic = Object.values(MOVES).find(m => m.isZ && normId(m.isZ) === crystal);
    return {
      ...baseMove, id: generic?.id || `z${baseMove.id}`, name: generic?.name || `Z·${baseMove.name}`, basePower: zMovePower(baseMove), accuracy: true,
      secondary: undefined, secondaries: undefined, self: undefined, drain: undefined, recoil: undefined, multihit: undefined,
      status: undefined, volatileStatus: undefined, boosts: undefined, _isZ: true, _baseId: baseMove.id,
    };
  }
  function makeMaxMove(user, baseMove) {
    if (!baseMove) return baseMove;
    if (baseMove.category === 'Status' || !baseMove.basePower) {
      const guard = MOVES.maxguard || { id: 'maxguard', name: '极巨防壁', type: 'Normal', category: 'Status', basePower: 0, accuracy: true, pp: 10, priority: 4, target: 'self', volatileStatus: 'maxguard', flags: {} };
      return { ...guard, _isMax: true, _baseId: baseMove.id, ppLeft: baseMove.ppLeft };
    }
    let info = MECH?.maxMoveForType(baseMove.type) || { id: 'maxstrike', name: '极巨攻击' };
    let name = info.name, id = info.id;
    if (user.dynamaxForm === 'gmax' && baseMove.type === (user.types || [])[0]) {
      const g = Object.values(MOVES).find(m => String(m.name || '').startsWith('G-Max') && m.type === baseMove.type);
      if (g) { id = Object.keys(MOVES).find(k => MOVES[k] === g) || id; name = g.name; }
    }
    return {
      ...baseMove, id, name, basePower: maxMovePower(baseMove) + (name.startsWith('G-Max') ? 10 : 0), accuracy: true,
      secondary: undefined, secondaries: undefined, self: undefined, drain: undefined, recoil: undefined, multihit: undefined,
      status: undefined, volatileStatus: undefined, boosts: undefined, _isMax: true, _maxType: baseMove.type, _baseId: baseMove.id,
    };
  }
  function transformMove(user, baseMove, mechanic = null) {
    if (mechanic === 'z' && user.mechanic === 'z' && user.zType === baseMove.type) return makeZMove(user, baseMove);
    if (user.dynamaxed) return makeMaxMove(user, baseMove);
    return baseMove;
  }

  // v1.3.5：威力为 0 的特殊伤害招式（固定伤害 / 按体重、速度、体力计算威力 / 一击必杀）
  const FIXED_DAMAGE_IDS = ['seismictoss', 'nightshade', 'sonicboom', 'dragonrage', 'superfang', 'naturesmadness', 'ruination', 'psywave', 'endeavor', 'finalgambit'];
  const VARIABLE_POWER_IDS = ['lowkick', 'grassknot', 'heavyslam', 'heatcrash', 'gyroball', 'electroball', 'flail', 'reversal', 'present', 'return', 'frustration'];
  const weightOf = p => DEX[p.speciesId]?.weightkg || 50;
  function specialDamageInfo(user, target, move, rnd = 0.5) {
    if (!move || move.basePower || move.category === 'Status') return null;
    const id = move.id;
    if (move.ohko) return { kind: 'ohko' };
    if (FIXED_DAMAGE_IDS.includes(id)) {
      let fixed = 0;
      if (id === 'seismictoss' || id === 'nightshade') fixed = user.level;
      else if (id === 'sonicboom') fixed = 20;
      else if (id === 'dragonrage') fixed = 40;
      else if (id === 'superfang' || id === 'naturesmadness' || id === 'ruination') fixed = Math.max(1, Math.floor(target.hp / 2));
      else if (id === 'psywave') fixed = Math.max(1, Math.floor(user.level * (0.5 + rnd)));
      else if (id === 'endeavor') fixed = Math.max(0, target.hp - user.hp);
      else if (id === 'finalgambit') fixed = user.hp;
      return { kind: 'fixed', damage: fixed };
    }
    if (VARIABLE_POWER_IDS.includes(id)) {
      let bp = 0;
      if (id === 'lowkick' || id === 'grassknot') { const w = weightOf(target); bp = w < 10 ? 20 : w < 25 ? 40 : w < 50 ? 60 : w < 100 ? 80 : w < 200 ? 100 : 120; }
      else if (id === 'heavyslam' || id === 'heatcrash') { const r = weightOf(user) / Math.max(0.1, weightOf(target)); bp = r >= 5 ? 120 : r >= 4 ? 100 : r >= 3 ? 80 : r >= 2 ? 60 : 40; }
      else if (id === 'gyroball') bp = Math.min(150, Math.floor(25 * effStat(target, 'spe') / Math.max(1, effStat(user, 'spe'))) + 1);
      else if (id === 'electroball') { const r = effStat(user, 'spe') / Math.max(1, effStat(target, 'spe')); bp = r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40; }
      else if (id === 'flail' || id === 'reversal') { const x = Math.floor(48 * user.hp / user.maxHp); bp = x <= 1 ? 200 : x <= 4 ? 150 : x <= 9 ? 100 : x <= 16 ? 80 : x <= 32 ? 40 : 20; }
      else if (id === 'present') bp = rnd < 0.4 ? 40 : rnd < 0.7 ? 80 : 120;
      else if (id === 'return' || id === 'frustration') bp = 102;
      return { kind: 'power', basePower: bp };
    }
    return null;
  }

  function estimateDamage(attacker, defender, move, rngVal = 0.925, opts = {}) {
    if (!move.basePower) return { damage: 0, eff: 1, crit: false };
    if (abilityMoveInteraction(attacker, defender, move)) return { damage: 0, eff: 0, crit: false };
    const isPhys = move.category === 'Physical';
    const atk = battleStat(attacker, isPhys ? 'atk' : 'spa', { ignoreStages: hasAbility(defender, 'unaware'), crit: !!opts.crit, isAttackStat: true });
    const def = battleStat(defender, isPhys ? 'def' : 'spd', { ignoreStages: hasAbility(attacker, 'unaware'), crit: !!opts.crit, isAttackStat: false });
    const power = modifiedPower(attacker, defender, move);
    const level = attacker.level;
    let dmg = Math.floor(((Math.floor((2 * level / 5 + 2) * power * atk / def)) / 50)) + 2;
    const eff = effectiveness(move.type, defender.types);
    let mult = eff * rngVal;
    mult *= stabMultiplier(attacker, move); // STAB (incl. Terastal rules)
    if (isPhys && attacker.status === 'brn' && !hasAbility(attacker, 'guts')) mult *= 0.5;
    mult *= defenderDamageMultiplier(attacker, defender, move, eff);
    if ((move._isZ || move._isMax) && defender.volatile?.protect) mult *= 0.25;
    dmg = Math.floor(dmg * mult);
    return { damage: eff === 0 ? 0 : Math.max(1, dmg), eff, crit: !!opts.crit };
  }

  class Battle {
    constructor(teamA, teamB, opts = {}) {
      if (!teamA?.length || !teamB?.length) throw new Error('Both sides need a team');
      this.teams = [teamA, teamB];
      this.active = [0, 0];
      this.rng = opts.seed != null ? mulberry32(opts.seed) : Math.random;
      this.difficulty = opts.difficulty || 'normal';
      this.weather = opts.weather || null;
      this.weatherTurns = opts.weatherTurns || 0;
      this.field = { terrain: null, terrainTurns: 0, trickRoom: 0, gravity: 0, sides: [newSideField(), newSideField()] };
      this.turnCount = 0;
      this.log = [];
      this.winner = null; // 0 | 1 | null
      this.encounterType = opts.encounterType === 'wild' && teamB.length === 1 ? 'wild' : 'trainer';
      this.ballStock = Object.fromEntries(['pokeball', 'greatball', 'ultraball'].map(id => [id,
        Number.isInteger(opts.balls?.[id]) && opts.balls[id] >= 0 ? opts.balls[id] : 0]));
      this.outcome = null; this.capture = null; this.lastCapture = null;
      this.pendingSwitch = null; // side index that must switch (player-facing)
      this.mechanicUsed = [{ mega: false, z: false, dynamax: false, tera: false }, { mega: false, z: false, dynamax: false, tera: false }];
      this.teams.forEach((team, side) => team.forEach(p => { p._battle = this; p._side = side; p._enteredThisTurn = false; }));
      this.say(`战斗开始！${this.cur(1).name} 对 ${this.cur(0).name}`);
      [0, 1].sort((a, b) => effStat(this.cur(b), 'spe') - effStat(this.cur(a), 'spe')).forEach(side => this.onEnter(side, true));
    }
    say(msg) { this.log.push(msg); }
    cur(side) { return this.teams[side][this.active[side]]; }
    alive(side) { return this.teams[side].filter(p => !p.fainted); }
    other(side) { return 1 - side; }
    sideOf(p) { return p?._side ?? this.teams.findIndex(team => team.includes(p)); }

    setWeather(id, turns = 5) {
      const map = { sunnyday: 'sun', raindance: 'rain', sandstorm: 'sand', snowscape: 'snow', hail: 'snow', sun: 'sun', rain: 'rain', sand: 'sand', snow: 'snow' };
      const w = map[normId(id)] || null;
      if (!w) return;
      this.weather = w; this.weatherTurns = turns;
      this.say({ sun: '阳光变得强烈起来！', rain: '开始下雨了！', sand: '沙暴刮起来了！', snow: '开始下雪了！' }[w]);
    }
    setTerrain(id, turns = 5) {
      const t = normId(id).replace(/terrain$/, '');
      if (!['electric', 'grassy', 'misty', 'psychic'].includes(t)) return;
      this.field.terrain = t; this.field.terrainTurns = turns;
      this.say({ electric: '脚下泛起了电光（电气场地）！', grassy: '脚下长出了青草（青草场地）！', misty: '薄雾笼罩了场地（薄雾场地）！', psychic: '脚下变得不可思议（精神场地）！' }[t]);
    }
    clearHazards(side) {
      const sc = this.field.sides[side];
      const had = sc.stealthrock || sc.spikes || sc.toxicspikes || sc.stickyweb;
      sc.stealthrock = false; sc.spikes = 0; sc.toxicspikes = 0; sc.stickyweb = false;
      return had;
    }
    applyEntryHazards(side, p) {
      if (!p || p.fainted || itemId(p) === 'heavydutyboots') return;
      const sc = this.field.sides[side], foe = this.cur(this.other(side));
      if (sc.stealthrock) {
        const dmg = Math.max(1, Math.floor(p.maxHp * effectiveness('Rock', p.types) / 8));
        this.applyDamage(p, dmg, `${p.name} 受到了隐形岩的伤害！`);
        if (p.hp <= 0) return;
      }
      if (!isGrounded(p)) return;
      if (sc.spikes) {
        const frac = [0, 1 / 8, 1 / 6, 1 / 4][Math.min(3, sc.spikes)];
        this.applyDamage(p, Math.max(1, Math.floor(p.maxHp * frac)), `${p.name} 受到了撒菱的伤害！`);
        if (p.hp <= 0) return;
      }
      if (sc.toxicspikes) {
        if (p.types.includes('Poison')) { sc.toxicspikes = 0; this.say(`${p.name} 吸收了毒菱！`); }
        else this.tryStatus(p, sc.toxicspikes >= 2 ? 'tox' : 'psn', foe, { fromStatusMove: false });
        if (p.hp <= 0) return;
      }
      if (sc.stickyweb) this.changeStages(p, { spe: -1 }, foe);
    }
    onEnter(side, initial = false) {
      const p = this.cur(side);
      if (!p || p.fainted) return;
      p.enteredTurn = this.turnCount;
      p._participated = true;
      p._enteredThisTurn = !initial;
      p.choiceLockedMove = null;
      this.applyEntryHazards(side, p);
      if (p.hp <= 0 || p.fainted) return;
      this.applyEntryAbility(side);
    }
    applyEntryAbility(side) {
      const p = this.cur(side);
      if (!p || p.fainted || p.hp <= 0) return;
      const foe = this.cur(this.other(side)); let ab = abilityId(p);
      if (ab === 'trace' && foe?.ability) { p.ability = abilityId(foe); ab = p.ability; this.say(`${p.name} 的追踪复制了对手的特性！`); }
      const weatherAbility = { drought: 'sun', drizzle: 'rain', sandstream: 'sand', snowwarning: 'snow' }[ab];
      if (weatherAbility) this.setWeather(weatherAbility, 5);
      const terrainAbility = { electricsurge: 'electric', grassysurge: 'grassy', psychicsurge: 'psychic', mistysurge: 'misty' }[ab];
      if (terrainAbility) this.setTerrain(terrainAbility, 5);
      if (ab === 'intimidate' && foe && !foe.fainted) {
        this.say(`${p.name} 的威吓降低了对手的气势！`);
        this.changeStages(foe, { atk: -1 }, p);
      }
      if (ab === 'download' && foe && !foe.fainted) {
        const key = effStat(foe, 'def') < effStat(foe, 'spd') ? 'atk' : 'spa';
        this.say(`${p.name} 的下载分析了对手！`);
        this.changeStages(p, { [key]: 1 }, p);
      }
      if (ab === 'frisk' && foe?.item) this.say(`${p.name} 察觉到了对手携带的道具！`);
      if (ab === 'anticipation' && foe && foe.moves.some(m => m.basePower && effectiveness(m.type, p.types) > 1)) this.say(`${p.name} 因危险而颤抖了（危险预知）！`);
    }
    megaEvolve(side) {
      const p = this.cur(side);
      if (!p || p.fainted || this.mechanicUsed[side].mega || p.mechanic !== 'mega' || !p.megaForm || !DEX[p.megaForm] || p.isMega) return false;
      const form = DEX[p.megaForm], hpRatio = p.hp / p.maxHp;
      p.speciesId = p.megaForm; p.speciesName = form.name; if (!p.hasNickname) p.name = form.name;
      p.types = form.types.slice(); p.originalTypes = form.types.slice();
      p.stats = calcStats(form, p.level, { ivs: p.ivs, nature: p.nature });
      p.maxHp = p.stats.hp; p.hp = Math.max(1, Math.round(p.maxHp * hpRatio));
      p.ability = normId(form.abilities?.[0] || p.ability);
      p.isMega = true; this.mechanicUsed[side].mega = true;
      this.say(`✨ ${p.name} 超级进化了！`);
      this.applyEntryAbility(side);
      return true;
    }
    dynamax(side) {
      const p = this.cur(side);
      if (!p || p.fainted || this.mechanicUsed[side].dynamax || p.mechanic !== 'dynamax' || p.dynamaxed) return false;
      p.normalMaxHp = p.maxHp;
      p._preDynamax = { speciesId: p.speciesId, speciesName: p.speciesName, name: p.name, types: p.types.slice(), stats: p.stats };
      if (p.dynamaxForm === 'gmax' && DEX[`${p.originalSpeciesId}gmax`]) {
        const form = DEX[`${p.originalSpeciesId}gmax`];
        p.speciesId = `${p.originalSpeciesId}gmax`; p.speciesName = form.name; if (!p.hasNickname) p.name = form.name;
        p.types = form.types.slice(); p.stats = calcStats(form, p.level, { ivs: p.ivs, nature: p.nature });
      }
      p.maxHp = (p.normalMaxHp || p.maxHp) * 2;
      p.hp += p.normalMaxHp;
      p.dynamaxed = true; p.dynamaxTurns = 3; this.mechanicUsed[side].dynamax = true;
      this.say(`🔴 ${p.name} ${p.dynamaxForm === 'gmax' ? '超极巨化' : '极巨化'}了！（3 回合）`);
      return true;
    }
    endDynamax(p, silent = false) {
      if (!p?.dynamaxed) return;
      const normal = p.normalMaxHp || Math.floor(p.maxHp / 2);
      if (p._preDynamax) { const pre = p._preDynamax; p.speciesId = pre.speciesId; p.speciesName = pre.speciesName; if (!p.hasNickname) p.name = pre.name; p.types = pre.types.slice(); p.stats = pre.stats; }
      p.maxHp = normal; p.hp = p.fainted ? 0 : Math.max(1, Math.floor(p.hp / 2));
      p.dynamaxed = false; p.dynamaxTurns = 0; p.normalMaxHp = null; p._preDynamax = null;
      if (!silent) this.say(`${p.name} 的极巨化结束了。`);
    }
    terastallize(side) {
      const p = this.cur(side);
      if (!p || p.fainted || this.mechanicUsed[side].tera || p.mechanic !== 'tera' || !p.teraType || p.terastallized) return false;
      p.originalTypes = p.types.slice();
      p.types = [p.teraType]; p.terastallized = true; this.mechanicUsed[side].tera = true;
      this.say(`💎 ${p.name} 太晶化了！属性变为 ${root.PKMMechanics?.TYPE_ZH?.[p.teraType] || p.teraType}！`);
      return true;
    }
    activateMechanic(side, kind) {
      if (kind === 'mega') return this.megaEvolve(side);
      if (kind === 'dynamax') return this.dynamax(side);
      if (kind === 'tera') return this.terastallize(side);
      return false;
    }
    changeStages(p, boosts, source = p, opts = {}) {
      if (!p || p.fainted || !boosts) return false;
      let changed = false, lowered = false;
      for (const [k, raw] of Object.entries(boosts)) {
        if (!(k in p.stages) || !raw) continue;
        let amt = raw;
        if (hasAbility(p, 'contrary')) amt = -amt;
        if (hasAbility(p, 'simple')) amt *= 2;
        if (amt < 0 && source && source !== p && !opts.abilityBoost) {
          const blocked = hasAbility(p, 'clearbody', 'whitesmoke', 'fullmetalbody')
            || (k === 'atk' && hasAbility(p, 'hypercutter'))
            || (k === 'def' && hasAbility(p, 'bigpecks'))
            || (k === 'accuracy' && hasAbility(p, 'keeneye'));
          if (blocked) { this.say(`${p.name} 的特性阻止了${STAT_LABELS[k]}降低！`); continue; }
          if (hasAbility(p, 'mirrorarmor') && !opts.noMirror) {
            this.say(`${p.name} 的镜甲反弹了能力降低！`);
            this.changeStages(source, { [k]: amt }, p, { noMirror: true });
            continue;
          }
        }
        const before = p.stages[k];
        p.stages[k] = clampStage(before + amt);
        if (p.stages[k] !== before) {
          changed = true; if (p.stages[k] < before) lowered = true;
          this.say(`${p.name} 的${STAT_LABELS[k] || k}${p.stages[k] > before ? '提高了' : '降低了'}！`);
        }
      }
      if (lowered && source && source !== p && !opts.abilityBoost) {
        if (hasAbility(p, 'defiant')) this.changeStages(p, { atk: 2 }, p, { abilityBoost: true });
        if (hasAbility(p, 'competitive')) this.changeStages(p, { spa: 2 }, p, { abilityBoost: true });
        if (hasAbility(p, 'rattled')) this.changeStages(p, { spe: 1 }, p, { abilityBoost: true });
      }
      if (itemId(p) === 'whiteherb' && Object.values(p.stages).some(v => v < 0)) {
        for (const k of Object.keys(p.stages)) if (p.stages[k] < 0) p.stages[k] = 0;
        p.item = null; this.say(`${p.name} 的白色香草恢复了降低的能力！`);
      }
      return changed;
    }
    tryStatus(p, status, source = null, opts = {}) {
      if (!p || p.fainted || p.status || !status) return false;
      const st = status === 'tox' ? 'tox' : status;
      const ab = abilityId(p);
      const abilityBlock = (st === 'brn' && ab === 'waterveil') || (st === 'par' && ab === 'limber')
        || (st === 'slp' && ['insomnia', 'vitalspirit'].includes(ab)) || (['psn', 'tox'].includes(st) && ab === 'immunity')
        || (st === 'frz' && ab === 'magmaarmor') || ab === 'purifyingsalt'
        || (st === 'slp' && ab === 'leafguard' && this.weather === 'sun');
      if (abilityBlock) { this.say(`${p.name} 的特性使其不会陷入该异常状态！`); return false; }
      if (opts.fromStatusMove && source && source !== p && ab === 'goodasgold') { this.say(`${p.name} 的黄金之躯挡下了变化招式！`); return false; }
      if ((st === 'brn' && p.types.includes('Fire')) || (st === 'frz' && p.types.includes('Ice'))
        || (st === 'par' && p.types.includes('Electric')) || (['psn', 'tox'].includes(st) && (p.types.includes('Poison') || p.types.includes('Steel')))) return false;
      if (isGrounded(p)) {
        if (this.field.terrain === 'misty') { this.say('薄雾场地保护着宝可梦！'); return false; }
        if (this.field.terrain === 'electric' && st === 'slp') { this.say('电气场地让宝可梦无法入睡！'); return false; }
      }
      p.status = st;
      if (st === 'tox') p.toxicCounter = 1;
      if (st === 'slp') p.sleepTurns = 1 + Math.floor(this.rng() * 3);
      this.say(`${p.name} 陷入了${STATUS_NAMES[st] || st}状态！`);
      if (source && source !== p && !opts.noSync && hasAbility(p, 'synchronize') && ['brn', 'psn', 'tox', 'par'].includes(st)) {
        this.say(`${p.name} 的同步把状态传给了对手！`);
        this.tryStatus(source, st, p, { noSync: true, fromStatusMove: false });
      }
      this.checkItemTrigger(p, 'status');
      return true;
    }
    consumeItem(p) { const old = p.item; p.item = null; return old; }
    checkItemTrigger(p, event, ctx = {}) {
      if (!p || p.fainted || !p.item) return;
      const item = itemId(p), healFrac = f => this.heal(p, Math.max(1, Math.floor(p.maxHp * f)), '道具生效');
      if (item === 'mentalherb' && p.volatile.confusion) { delete p.volatile.confusion; this.consumeItem(p); this.say(`${p.name} 的心灵香草治愈了混乱！`); return; }
      if (item === 'lumberry' && (p.status || p.volatile.confusion)) { p.status = null; delete p.volatile.confusion; this.consumeItem(p); this.say(`${p.name} 吃下木子果，状态痊愈了！`); return; }
      const berryStatus = { cheriberry: 'par', chestoberry: 'slp', pechaberry: 'psn', rawstberry: 'brn', aspearberry: 'frz' }[item];
      if (berryStatus && (p.status === berryStatus || (item === 'pechaberry' && p.status === 'tox'))) { p.status = null; this.consumeItem(p); this.say(`${p.name} 吃下树果，异常状态痊愈了！`); return; }
      if (item === 'persimberry' && p.volatile.confusion) { delete p.volatile.confusion; this.consumeItem(p); this.say(`${p.name} 吃下柿仔果，混乱解除了！`); return; }
      if (item === 'leppaberry' && p.moves.some(m => m.ppLeft <= 0)) { const m = p.moves.find(x => x.ppLeft <= 0); m.ppLeft = Math.min(m.pp, m.ppLeft + 10); this.consumeItem(p); this.say(`${p.name} 吃下苹野果，回复了 ${m.name} 的招式点数！`); return; }
      if (event === 'hit') {
        if (item === 'keeberry' && ctx.move?.category === 'Physical') { this.consumeItem(p); this.changeStages(p, { def: 1 }, p); return; }
        if (item === 'marangaberry' && ctx.move?.category === 'Special') { this.consumeItem(p); this.changeStages(p, { spd: 1 }, p); return; }
        if (item === 'enigmaberry' && ctx.eff > 1) { this.consumeItem(p); healFrac(1 / 4); return; }
        if (item === 'weaknesspolicy' && ctx.eff > 1) { this.consumeItem(p); this.say(`${p.name} 的弱点保险发动了！`); this.changeStages(p, { atk: 2, spa: 2 }, p); return; }
        if (item === 'jabocaberry' && ctx.move?.category === 'Physical' && ctx.attacker && !ctx.attacker.fainted) { this.consumeItem(p); this.applyDamage(ctx.attacker, Math.max(1, Math.floor(ctx.attacker.maxHp / 8)), `${ctx.attacker.name} 受到了嘉珍果的伤害！`); return; }
        if (item === 'rowapberry' && ctx.move?.category === 'Special' && ctx.attacker && !ctx.attacker.fainted) { this.consumeItem(p); this.applyDamage(ctx.attacker, Math.max(1, Math.floor(ctx.attacker.maxHp / 8)), `${ctx.attacker.name} 受到了雾莲果的伤害！`); return; }
      }
      if (p.hp <= p.maxHp / 2) {
        if (item === 'sitrusberry') { this.consumeItem(p); healFrac(1 / 4); return; }
        if (item === 'oranberry') { this.consumeItem(p); this.heal(p, 10, '道具生效'); return; }
      }
      if (p.hp <= p.maxHp / 4) {
        const stat = { liechiberry: 'atk', ganlonberry: 'def', salacberry: 'spe', petayaberry: 'spa', apicotberry: 'spd' }[item];
        if (stat) { this.consumeItem(p); this.changeStages(p, { [stat]: 1 }, p); }
      }
    }
    applyMoveDamage(p, amount, attacker, move) {
      let dmg = Math.max(0, amount);
      if (dmg >= p.hp && p.hp > 1) {
        if (hasAbility(p, 'sturdy') && p.hp === p.maxHp) { dmg = p.hp - 1; this.say(`${p.name} 用结实撑住了攻击！`); }
        else if (itemId(p) === 'focussash' && p.hp === p.maxHp) { dmg = p.hp - 1; this.consumeItem(p); this.say(`${p.name} 用气势披带撑住了攻击！`); }
        else if (itemId(p) === 'focusband' && this.rng() < 0.1) { dmg = p.hp - 1; this.say(`${p.name} 用气势头带撑住了攻击！`); }
      }
      const before = p.hp;
      p.hp = Math.max(0, p.hp - dmg);
      return before - p.hp;
    }
    onDamagingHit(attacker, target, move, damage, crit, eff, beforeHp) {
      if (!target || target.fainted || damage <= 0) return;
      if (move.category === 'Physical') {
        if (hasAbility(target, 'stamina')) this.changeStages(target, { def: 1 }, target);
        if (hasAbility(target, 'weakarmor')) this.changeStages(target, { def: -1, spe: 2 }, target);
      }
      if (move.type === 'Dark' && hasAbility(target, 'justified')) this.changeStages(target, { atk: 1 }, target);
      if (['Dark', 'Ghost', 'Bug'].includes(move.type) && hasAbility(target, 'rattled')) this.changeStages(target, { spe: 1 }, target);
      if (move.type === 'Water' && hasAbility(target, 'watercompaction')) this.changeStages(target, { def: 2 }, target);
      if (hasAbility(target, 'berserk') && beforeHp > target.maxHp / 2 && target.hp <= target.maxHp / 2) this.changeStages(target, { spa: 1 }, target);
      if (crit && hasAbility(target, 'angerpoint')) { target.stages.atk = 6; this.say(`${target.name} 的愤怒穴位被击中，攻击升到了最高！`); }
      if (hasAbility(target, 'cursedbody') && attacker && !attacker.fainted && this.rng() < 0.3) { attacker.volatile.disableMove = move.id; attacker.volatile.disableTurns = 4; this.say(`${attacker.name} 受到诅咒之躯影响，${move.name} 被定身了！`); }
      this.checkItemTrigger(target, 'hit', { move, eff, attacker });
      if (move.flags?.contact && attacker && !attacker.fainted) {
        if (hasAbility(target, 'roughskin', 'ironbarbs')) this.applyDamage(attacker, Math.max(1, Math.floor(attacker.maxHp / 8)), `${attacker.name} 受到了粗糙皮肤的伤害！`);
        if (itemId(target) === 'rockyhelmet') this.applyDamage(attacker, Math.max(1, Math.floor(attacker.maxHp / 6)), `${attacker.name} 受到了凸凸头盔的伤害！`);
        const contactAbility = abilityId(target);
        if (STATUS_BY_ABILITY[contactAbility] && this.rng() < 0.3) this.tryStatus(attacker, STATUS_BY_ABILITY[contactAbility], target, { fromStatusMove: false });
        else if (contactAbility === 'effectspore' && this.rng() < 0.3) this.tryStatus(attacker, ['par', 'psn', 'slp'][Math.floor(this.rng() * 3)], target, { fromStatusMove: false });
      }
      if (attacker && !attacker.fainted && itemId(attacker) === 'lifeorb' && !(hasAbility(attacker, 'sheerforce') && move.secondary)) {
        this.applyDamage(attacker, Math.max(1, Math.floor(attacker.maxHp / 10)), `${attacker.name} 被生命宝珠夺走了体力！`);
      }
      if (attacker && !attacker.fainted && itemId(attacker) === 'shellbell') this.heal(attacker, Math.max(1, Math.floor(damage / 8)), '贝壳之铃回复了体力');
    }
    movePriority(user, move, target) {
      let prio = move.priority || 0;
      if (user.dynamaxed && move.category === 'Status') prio = 4; // becomes Max Guard
      if (hasAbility(user, 'prankster') && move.category === 'Status') prio += 1;
      if (hasAbility(user, 'galewings') && move.type === 'Flying' && user.hp === user.maxHp) prio += 1;
      if (hasAbility(user, 'triage') && (move.heal || move.flags?.heal)) prio += 3;
      return prio;
    }
    applyMaxMoveEffect(user, target, move) {
      const type = move._maxType || move.type, side = this.sideOf(user);
      const userBoost = { Fighting: { atk: 1 }, Poison: { spa: 1 }, Flying: { spe: 1 }, Ground: { spd: 1 }, Steel: { def: 1 } }[type];
      if (userBoost) this.changeStages(user, userBoost, user);
      const foeDrop = { Normal: { spe: -1 }, Bug: { spa: -1 }, Ghost: { def: -1 }, Dragon: { atk: -1 }, Dark: { spd: -1 } }[type];
      if (foeDrop && target && !target.fainted) this.changeStages(target, foeDrop, user);
      if (type === 'Fire') this.setWeather('sun', 5);
      if (type === 'Water') this.setWeather('rain', 5);
      if (type === 'Rock') this.setWeather('sand', 5);
      if (type === 'Grass') this.setTerrain('grassy', 5);
      if (type === 'Electric') this.setTerrain('electric', 5);
      if (type === 'Psychic') this.setTerrain('psychic', 5);
      if (type === 'Fairy') this.setTerrain('misty', 5);
      if (type === 'Ice') this.setWeather('snow', 5);
    }

    /* ---------- AI ---------- */
    aiAction(side) {
      const me = this.cur(side), foe = this.cur(this.other(side));
      if (me.choiceLockedMove) {
        const locked = me.moves.findIndex(m => m.id === me.choiceLockedMove && m.ppLeft > 0);
        if (locked >= 0) return { kind: 'move', index: locked };
      }
      const diff = this.difficulty;
      const mistakes = diff === 'easy' ? 0.35 : diff === 'normal' ? 0.12 : 0;
      // Consider switching when badly matched and a healthy counter exists (hard+).
      if (diff !== 'easy') {
        const incoming = Math.max(...foe.moves.map(m => m.basePower ? effectiveness(m.type, me.types) : 0));
        const bench = this.teams[side].map((p, i) => ({ p, i })).filter(x => !x.p.fainted && x.i !== this.active[side]);
        if (incoming >= 2 && bench.length && this.rng() < (diff === 'expert' ? 0.55 : 0.3)) {
          bench.sort((a, b) => {
            const score = p => Math.max(...p.moves.map(m => m.basePower ? effectiveness(m.type, foe.types) : 0)) * (p.hp / p.maxHp);
            return score(b.p) - score(a.p);
          });
          if (bench[0]) return { kind: 'switch', index: bench[0].i };
        }
      }
      let best = null;
      for (let i = 0; i < me.moves.length; i++) {
        const m = me.moves[i];
        if (m.ppLeft <= 0) continue;
        if (me.volatile.disableMove === m.id) continue;
        let score;
        if (!m.basePower) {
          score = 18;
          if (m.status && !foe.status) score = 42;
          if (m.boosts && Object.values(m.boosts).some(v => v > 0)) score = me.stages.atk >= 2 ? 8 : 38;
          if (m.heal) score = me.hp < me.maxHp * 0.45 ? 55 : 4;
          if (m.weather && !this.weather) score = 36;
          if (m.terrain && !this.field.terrain) score = 32;
          if (m.pseudoWeather === 'trickroom') score = effStat(me, 'spe') < effStat(foe, 'spe') ? 44 : 8;
          if (m.sideCondition) {
            const foeSide = this.field.sides[this.other(side)], mySide = this.field.sides[side];
            if (['stealthrock', 'spikes', 'toxicspikes', 'stickyweb'].includes(m.sideCondition)) score = (foeSide.spikes || foeSide.stealthrock || foeSide.toxicspikes || foeSide.stickyweb) ? 10 : 38;
            else if (m.sideCondition === 'tailwind') score = mySide.tailwind ? 8 : 30;
            else score = me.hp > me.maxHp * 0.6 ? 32 : 12;
          }
          if (m.id === 'defog') score = (this.field.sides[side].spikes || this.field.sides[side].stealthrock || this.field.terrain) ? 40 : 10;
          if (m.id === 'tidyup') score = 34;
        } else {
          const est = estimateDamage(me, foe, m);
          score = est.damage * ((m.accuracy === true ? 100 : m.accuracy || 100) / 100);
          if (m.id === 'rapidspin' && (this.field.sides[side].spikes || this.field.sides[side].stealthrock || this.field.sides[side].toxicspikes)) score += 45;
          if (est.damage >= foe.hp) score += 120;
          score *= 0.85 + this.rng() * 0.3;
        }
        if (mistakes && this.rng() < mistakes) score = this.rng() * 50;
        if (!best || score > best.score) best = { kind: 'move', index: i, score };
      }
      if (!best) return { kind: 'move', index: 0, struggle: true };
      const chosenMove = me.moves[best.index];
      const used = this.mechanicUsed?.[side];
      if (used && chosenMove) {
        if (me.mechanic === 'mega' && !used.mega && !me.isMega) best.mechanic = 'mega';
        else if (me.mechanic === 'dynamax' && !used.dynamax && !me.dynamaxed && chosenMove.basePower && me.hp > me.maxHp * 0.4) best.mechanic = 'dynamax';
        else if (me.mechanic === 'tera' && !used.tera && !me.terastallized && (chosenMove.type === me.teraType || effectiveness(chosenMove.type, foe.types) > 1)) best.mechanic = 'tera';
        else if (me.mechanic === 'z' && !used.z && me.zType === chosenMove.type && chosenMove.basePower) best.mechanic = 'z';
      }
      return best;
    }

    bestSwitch(side) {
      const foe = this.cur(this.other(side));
      let best = null;
      this.teams[side].forEach((p, i) => {
        if (p.fainted || i === this.active[side]) return;
        const off = Math.max(...p.moves.map(m => m.basePower ? effectiveness(m.type, foe.types) : 0));
        const score = off * 2 + p.hp / p.maxHp;
        if (!best || score > best.score) best = { index: i, score };
      });
      return best?.index ?? -1;
    }

    doSwitch(side, index, opts = {}) {
      const p = this.teams[side][index];
      if (!p || p.fainted || index === this.active[side]) return false;
      const old = this.cur(side);
      const foe = this.cur(this.other(side));
      if (!opts.forced && foe && !foe.fainted && hasAbility(foe, 'shadowtag') && !old.types.includes('Ghost')) { this.say(`${old.name} 被踩影困住，无法交换！`); return false; }
      if (old.dynamaxed && !old.fainted) this.endDynamax(old);
      if (!old.fainted && hasAbility(old, 'regenerator')) this.heal(old, Math.floor(old.maxHp / 3), '再生力回复了体力');
      if (!old.fainted && hasAbility(old, 'naturalcure') && old.status) { old.status = null; this.say(`${old.name} 的自然回复治愈了异常状态。`); }
      old.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
      old.volatile = {};
      old.choiceLockedMove = null;
      this.active[side] = index;
      this.say(`${side === 0 ? '我方' : '敌方'}收回了 ${old.name}，换上 ${p.name}！`);
      this.onEnter(side);
      return true;
    }

    /** Execute one full turn. playerAction = {kind:'move'|'switch', index}. Returns log lines added. */
    turn(playerAction) {
      if (playerAction?.kind === 'capture') return this.captureTurn ? this.captureTurn(playerAction) : [];
      if (this.winner !== null || this.pendingSwitch !== null) return [];
      const start = this.log.length;
      for (const side of [0, 1]) if (this.cur(side)) this.cur(side)._enteredThisTurn = false;
      let chosen = playerAction;
      const activePlayer = this.cur(0);
      if (chosen?.kind === 'move' && activePlayer?.choiceLockedMove) {
        const locked = activePlayer.moves.findIndex(m => m.id === activePlayer.choiceLockedMove);
        if (locked >= 0) chosen = { kind: 'move', index: locked };
      }
      const foeAction = this.aiAction(1);
      const actions = [
        { side: 0, action: chosen },
        { side: 1, action: foeAction },
      ];
      // Switches first.
      for (const a of actions) if (a.action.kind === 'switch') this.doSwitch(a.side, a.action.index);
      for (const side of [0, 1]) if (this.cur(side)) delete this.cur(side).volatile.protect;
      // Mega/Dynamax/Tera activate before speed order is calculated.
      [...actions].filter(a => a.action.kind === 'move' && ['mega', 'dynamax', 'tera'].includes(a.action.mechanic))
        .sort((a, b) => effStat(this.cur(b.side), 'spe') - effStat(this.cur(a.side), 'spe'))
        .forEach(a => this.activateMechanic(a.side, a.action.mechanic));
      const movers = actions.filter(a => a.action.kind === 'move').map(a => {
        const p = this.cur(a.side);
        // v1.3.4：PP 会跨战斗继承，招式点数全部用完时改用“挣扎”（反伤 1/4 最大体力）
        const usable = p.moves.filter(m => m.ppLeft > 0 && p.volatile.disableMove !== m.id);
        const picked = p.moves[a.action.index];
        const move = (a.action.struggle || !usable.length) ? struggleMove() : (picked || p.moves[0]);
        const prio = this.movePriority(p, move, this.cur(this.other(a.side)));
        const speed = effStat(p, 'spe');
        return { ...a, move, prio, speed, tie: this.rng(), mechanic: a.action.mechanic || null };
      });
      const trick = this.field.trickRoom > 0;
      movers.sort((x, y) => (y.prio - x.prio) || (trick ? (x.speed - y.speed) || (x.tie - y.tie) : (y.speed - x.speed) || (x.tie - y.tie)));
      this.turnCount++;
      for (const m of movers) {
        if (this.winner !== null) break;
        const user = this.cur(m.side);
        if (user.fainted) continue;
        this.useMove(m.side, user, this.cur(this.other(m.side)), m.move, { mechanic: m.mechanic });
        if (m.move.id === 'struggle' && !user.fainted && this._struggled) this.applyDamage(user, Math.max(1, Math.floor(user.maxHp / 4)), `${user.name} 受到了反作用力伤害！`);
        this._struggled = false;
        if (this._boom === user && !user.fainted && user.hp > 0) { user.hp = 0; this.say(`${user.name} 倒下了！`); }
        this._boom = null;
        this.checkFaints();
      }
      this.endOfTurn();
      this.checkFaints();
      this.updateWinner();
      return this.log.slice(start);
    }

    canMove(p, move = null) {
      if (move && p.volatile.disableMove === move.id) { this.say(`${p.name} 的 ${move.name} 被定身法封住了！`); return false; }
      if (p.status === 'slp') {
        p.sleepTurns--;
        if (p.sleepTurns > 0) { this.say(`${p.name} 正在睡觉。`); return false; }
        p.status = null; this.say(`${p.name} 醒了过来！`);
      }
      if (p.status === 'frz') {
        if (this.rng() < 0.2) { p.status = null; this.say(`${p.name} 的冰冻解除了！`); }
        else { this.say(`${p.name} 被冻住了，无法行动！`); return false; }
      }
      if (p.status === 'par' && this.rng() < 0.25) { this.say(`${p.name} 麻痹了，无法行动！`); return false; }
      if (p.volatile.confusion) {
        p.volatile.confusion--;
        this.say(`${p.name} 混乱了！`);
        if (p.volatile.confusion <= 0) { delete p.volatile.confusion; this.say(`${p.name} 的混乱解除了。`); }
        else if (this.rng() < 0.33) {
          const dmg = Math.max(1, Math.floor((((2 * p.level / 5 + 2) * 40 * effStat(p, 'atk') / effStat(p, 'def')) / 50) + 2));
          this.applyDamage(p, dmg, `${p.name} 攻击了自己！`);
          return false;
        }
      }
      if (p.volatile.flinch) { delete p.volatile.flinch; if (p.dynamaxed) { /* Dynamax cannot flinch */ } else { this.say(`${p.name} 退缩了，无法行动！`); if (hasAbility(p, 'steadfast')) this.changeStages(p, { spe: 1 }, p); return false; } }
      return true;
    }

    useMove(side, user, target, baseMove, opts = {}) {
      let move = baseMove;
      const wantsZ = opts.mechanic === 'z' && !this.mechanicUsed[side].z && user.mechanic === 'z' && user.zType === baseMove.type;
      if (wantsZ) move = makeZMove(user, baseMove);
      if (user.dynamaxed) move = makeMaxMove(user, baseMove);
      if (!this.canMove(user, baseMove)) return;
      if (baseMove.id === 'struggle') { this._struggled = true; this.say(`${user.name} 已经没有可以使用的招式了！`); }
      if (baseMove.ppLeft > 0 && baseMove.id !== 'struggle') baseMove.ppLeft--;
      if (wantsZ) { this.mechanicUsed[side].z = true; this.say(`💥 ${user.name} 发动了Ｚ招式！`); }
      if (['choiceband', 'choicespecs', 'choicescarf'].includes(itemId(user)) && !user.choiceLockedMove) user.choiceLockedMove = baseMove.id;
      this.say(`${user.name} 使用了 ${move.name}！`);
      if (move.selfdestruct === 'always' || baseMove.id === 'finalgambit') this._boom = user; // v1.3.5：大爆炸 / 自爆 / 搏命，使用后自己倒下
      const selfTarget = move.category === 'Status' && !move.basePower && (move.heal || (move.boosts && move.target === 'self') || move.status === undefined && move.volatileStatus === undefined);
      const realTarget = (move.target === 'self' || selfTarget) ? user : target;
      if (realTarget !== user && hasAbility(realTarget, 'pressure') && baseMove.ppLeft > 0) baseMove.ppLeft--;
      const priority = this.movePriority(user, move, realTarget);
      if (realTarget !== user && priority > 0 && hasAbility(realTarget, 'dazzling', 'queenlymajesty', 'armortail')) { this.say(`${realTarget.name} 的特性阻止了先制招式！`); return; }
      if (realTarget !== user && priority > 0 && this.field.terrain === 'psychic' && isGrounded(realTarget)) { this.say('精神场地保护着宝可梦，先制招式失败了！'); return; }
      if (realTarget !== user && hasAbility(user, 'prankster') && move.category === 'Status' && realTarget.types.includes('Dark')) { this.say(`对 ${realTarget.name} 没有效果……`); return; }
      if (realTarget !== user && realTarget.volatile.protect && move.flags?.protect && !(move.basePower && (move._isZ || move._isMax))) { this.say(`${realTarget.name} 守住了攻击！`); return; }
      const interaction = realTarget !== user ? abilityMoveInteraction(user, realTarget, move) : null;
      if (interaction) {
        this.say(`${realTarget.name} 的${interaction.label}使招式没有效果！`);
        if (interaction.kind === 'heal') this.heal(realTarget, Math.floor(realTarget.maxHp / 4), '特性回复了体力');
        if (interaction.kind === 'boost') this.changeStages(realTarget, interaction.boosts, realTarget);
        if (interaction.kind === 'flashfire') { realTarget.volatile.flashfire = true; this.say(`${realTarget.name} 的引火被激发了！`); }
        return;
      }
      // Accuracy
      let acc = move.accuracy === true || move.accuracy == null ? 100 : move.accuracy;
      if (move.ohko && realTarget !== user) {
        if (user.level < realTarget.level) { this.say(`对 ${realTarget.name} 没有效果……（等级比对手低）`); return; }
        acc = 30 + (user.level - realTarget.level);
      }
      const targetEvasion = hasAbility(user, 'keeneye') ? Math.min(0, realTarget.stages.evasion || 0) : (realTarget.stages.evasion || 0);
      if (!move.ohko) acc *= stageMult((user.stages.accuracy || 0), 'acc') * stageMult(targetEvasion, 'eva');
      if (move.category === 'Physical' && hasAbility(user, 'hustle')) acc *= 0.8;
      if (this.field.gravity > 0) acc *= 5 / 3;
      if (this.rng() * 100 > acc) { this.say(`但是没有命中 ${realTarget.name}！`); return; }
      if (['brickbreak', 'psychicfangs'].includes(move.id) && realTarget !== user) {
        const sc = this.field.sides[this.sideOf(realTarget)];
        if (sc.reflect || sc.lightscreen || sc.auroraveil) { sc.reflect = 0; sc.lightscreen = 0; sc.auroraveil = 0; this.say(`${realTarget.name} 一方的壁被打破了！`); }
      }

      const hits = Array.isArray(move.multihit) ? move.multihit[0] + Math.floor(this.rng() * (move.multihit[1] - move.multihit[0] + 1)) : (move.multihit || 1);
      let anyHit = false;
      for (let h = 0; h < hits; h++) {
        if (realTarget.fainted) break;
        let connected = true;
        if (move.basePower) {
          let critStage = move.critRatio || 0;
          critStage += user.volatile.critBoost || 0;
          if (hasAbility(user, 'superluck')) critStage += 1;
          if (['scopelens', 'razorclaw'].includes(itemId(user))) critStage += 1;
          const crit = !hasAbility(realTarget, 'battlearmor', 'shellarmor') && this.rng() < [1 / 24, 1 / 8, 1 / 2, 1][Math.min(3, critStage)];
          const est = estimateDamage(user, realTarget, move, 0.85 + this.rng() * 0.15, { crit });
          if (est.eff === 0) { this.say(`对 ${realTarget.name} 没有效果……`); connected = false; }
          else {
            anyHit = true;
            const beforeHp = realTarget.hp;
            let dmg = est.damage;
            if (crit) dmg = Math.floor(dmg * (hasAbility(user, 'sniper') ? 2.25 : 1.5));
            const dealt = this.applyMoveDamage(realTarget, dmg, user, move);
            if (crit) this.say('击中了要害！');
            if (est.eff > 1) this.say('效果绝佳！'); else if (est.eff < 1 && est.eff > 0) this.say('效果不理想……');
            if (dealt > 0) this.onDamagingHit(user, realTarget, move, dealt, crit, est.eff, beforeHp);
            if (move.drain && !user.fainted) this.heal(user, Math.max(1, Math.floor(dealt * move.drain[0] / move.drain[1])), '吸取了体力');
            if (move.recoil && !user.fainted && !hasAbility(user, 'rockhead')) this.applyDamage(user, Math.max(1, Math.floor(dealt * move.recoil[0] / move.recoil[1])), `${user.name} 受到了反作用力伤害！`);
          }
        } else if (realTarget !== user && specialDamageInfo(user, realTarget, move)) {
          // v1.3.5：固定伤害 / 特殊威力 / 一击必杀
          const sp = specialDamageInfo(user, realTarget, move, this.rng());
          const probe = estimateDamage(user, realTarget, { ...move, basePower: sp.basePower || 1 }, 1);
          if (probe.eff === 0) { this.say(`对 ${realTarget.name} 没有效果……`); connected = false; }
          else if (sp.kind === 'fixed' && sp.damage <= 0) { this.say('但是失败了！'); connected = false; }
          else {
            anyHit = true;
            const beforeHp = realTarget.hp;
            let dmg, eff = 1;
            if (sp.kind === 'ohko') dmg = realTarget.hp;
            else if (sp.kind === 'fixed') dmg = sp.damage;
            else { const est = estimateDamage(user, realTarget, { ...move, basePower: sp.basePower }, 0.85 + this.rng() * 0.15); dmg = est.damage; eff = est.eff; }
            const dealt = this.applyMoveDamage(realTarget, dmg, user, move);
            if (sp.kind === 'ohko' && realTarget.hp <= 0) this.say('一击必杀！');
            if (eff > 1) this.say('效果绝佳！'); else if (eff < 1 && eff > 0) this.say('效果不理想……');
            if (dealt > 0) this.onDamagingHit(user, realTarget, move, dealt, false, eff, beforeHp);
          }
        } else anyHit = true;
        if (hits > 1 && h === hits - 1 && anyHit) this.say(`击中了 ${hits} 次！`);
        // Guaranteed move effects (on target / self)
        if (connected && !realTarget.fainted) this.applyEffects(user, realTarget, move, move);
        const sec = move.secondary || (move.secondaries ? move.secondaries[0] : null);
        const sheer = hasAbility(user, 'sheerforce') && !!move.secondary;
        if (connected && sec && !sheer && !hasAbility(realTarget, 'shielddust') && !realTarget.fainted) {
          let chance = sec.chance ?? 100;
          if (hasAbility(user, 'serenegrace')) chance *= 2;
          if (this.rng() * 100 < chance) this.applyEffects(user, realTarget, move, sec);
        }
        if (move.self && !user.fainted) this.applyEffects(user, user, move, move.self);
        if (user.fainted) break;
      }
      if (anyHit && move._isMax && !user.fainted) this.applyMaxMoveEffect(user, realTarget, move);
      if (anyHit && ['rapidspin', 'mortalspin'].includes(move.id) && !user.fainted) {
        if (this.clearHazards(this.sideOf(user))) this.say(`${user.name} 清除了自己一方的钉子！`);
      }
      if (move.heal && !user.fainted) this.heal(user, Math.floor(user.maxHp * move.heal[0] / move.heal[1]), '回复了体力');
      this.checkItemTrigger(user, 'pp');
    }

    applyEffects(user, target, move, eff) {
      if (!eff) return;
      if (eff.self && eff !== move) this.applyEffects(user, user, move, eff.self);
      if (eff === move) {
        if (move._zStatus && move.zMove && !move._zApplied) {
          move._zApplied = true;
          const z = move.zMove;
          if (z.boost) this.changeStages(user, z.boost, user);
          if (z.effect === 'clearnegativeboost') { for (const k of Object.keys(user.stages)) if (user.stages[k] < 0) user.stages[k] = 0; this.say(`${user.name} 的降低能力被Ｚ招式力量清除了！`); }
          if (z.effect === 'crit2') { user.volatile.critBoost = 2; this.say(`${user.name} 的Ｚ招式力量让它更容易击中要害！`); }
          if (z.effect === 'heal') this.heal(user, user.maxHp, 'Ｚ招式力量完全回复了体力');
        }
        if (move.weather) this.setWeather(move.weather, 5);
        if (move.terrain) this.setTerrain(move.terrain, 5);
        if (move.pseudoWeather === 'trickroom') {
          if (this.field.trickRoom > 0) { this.field.trickRoom = 0; this.say('扭曲的空间恢复了正常！'); }
          else { this.field.trickRoom = 5; this.say('空间被扭曲了（戏法空间，速度顺序反转）！'); }
        }
        if (move.pseudoWeather === 'gravity') { this.field.gravity = 5; this.say('重力变得更强了！'); }
        if (move.sideCondition) {
          const userSide = this.sideOf(user), foeSide = this.other(userSide);
          const scSide = move.target === 'foeSide' ? foeSide : userSide;
          const sc = this.field.sides[scSide];
          if (move.sideCondition === 'stealthrock' && !sc.stealthrock) { sc.stealthrock = true; this.say(`${scSide === 0 ? '我方' : '敌方'}脚下散布了隐形岩！`); }
          if (move.sideCondition === 'spikes' && sc.spikes < 3) { sc.spikes++; this.say(`${scSide === 0 ? '我方' : '敌方'}脚下散布了撒菱（${sc.spikes}层）！`); }
          if (move.sideCondition === 'toxicspikes' && sc.toxicspikes < 2) { sc.toxicspikes++; this.say(`${scSide === 0 ? '我方' : '敌方'}脚下散布了毒菱（${sc.toxicspikes}层）！`); }
          if (move.sideCondition === 'stickyweb' && !sc.stickyweb) { sc.stickyweb = true; this.say(`${scSide === 0 ? '我方' : '敌方'}脚下被黏黏网覆盖！`); }
          if (move.sideCondition === 'reflect') { sc.reflect = 5; this.say(`${scSide === 0 ? '我方' : '敌方'}被反射壁保护着！`); }
          if (move.sideCondition === 'lightscreen') { sc.lightscreen = 5; this.say(`${scSide === 0 ? '我方' : '敌方'}被光墙保护着！`); }
          if (move.sideCondition === 'auroraveil') {
            if (this.weather === 'snow') { sc.auroraveil = 5; this.say(`${scSide === 0 ? '我方' : '敌方'}被极光幕保护着！`); }
            else this.say('但是失败了（极光幕需要雪天）！');
          }
          if (move.sideCondition === 'tailwind') { sc.tailwind = 4; this.say(`${scSide === 0 ? '我方' : '敌方'}刮起了顺风！`); }
        }
        if (move.id === 'defog') {
          this.changeStages(target, { evasion: -1 }, user);
          let removed = false;
          for (const sd of [0, 1]) { removed = this.clearHazards(sd) || removed; const sc = this.field.sides[sd]; if (sc.reflect || sc.lightscreen || sc.auroraveil) { sc.reflect = 0; sc.lightscreen = 0; sc.auroraveil = 0; removed = true; } }
          if (this.field.terrain) { this.field.terrain = null; this.field.terrainTurns = 0; removed = true; }
          if (removed) this.say('场上的钉子、壁与场地被清除了！');
        }
        if (move.id === 'tidyup') {
          for (const sd of [0, 1]) this.clearHazards(sd);
          this.say('场上的钉子被打扫干净了！');
          this.changeStages(user, { atk: 1, spe: 1 }, user);
        }
        // v1.3.5：几个常见的变化招式
        if (move.id === 'rest') {
          if (user.hp >= user.maxHp) this.say('但是失败了！（体力已经是满的）');
          else if (hasAbility(user, 'insomnia', 'vitalspirit', 'comatose')) this.say(`${user.name} 无法入睡，但是失败了！`);
          else { user.status = 'slp'; user.sleepTurns = 3; delete user.toxicCounter; const real = user.maxHp - user.hp; user.hp = user.maxHp; this.say(`${user.name} 睡着了，并且回复了全部体力（+${real}）！`); }
        }
        if (move.id === 'haze') {
          for (const sd of [0, 1]) { const p = this.cur(sd); if (p) for (const k of Object.keys(p.stages)) p.stages[k] = 0; }
          this.say('所有宝可梦的能力变化都复原了！');
        }
        if (move.id === 'focusenergy') {
          if ((user.volatile.critBoost || 0) >= 2) this.say('但是失败了！');
          else { user.volatile.critBoost = 2; this.say(`${user.name} 鼓足了干劲（更容易击中要害）！`); }
        }
        if (move.id === 'splash') this.say('但是什么也没有发生！');
        if (move.id === 'courtchange') { const tmp = this.field.sides[0]; this.field.sides[0] = this.field.sides[1]; this.field.sides[1] = tmp; this.say('双方交换了场地效果！'); }
      }
      if ((eff.volatileStatus === 'protect' || eff.volatileStatus === 'maxguard') && target === user) {
        user.volatile.protect = true; this.say(`${user.name} 摆出了守护的姿势！`);
      }
      if (eff.status) {
        const who = eff.target === 'self' ? user : target;
        this.tryStatus(who, eff.status, user, { fromStatusMove: move.category === 'Status' && eff === move });
      }
      if (eff.volatileStatus === 'confusion' && !target.fainted && target !== user) {
        if (hasAbility(target, 'owntempo')) this.say(`${target.name} 的我行我素使其不会混乱！`);
        else { target.volatile.confusion = 2 + Math.floor(this.rng() * 4); this.say(`${target.name} 混乱了！`); this.checkItemTrigger(target, 'confusion'); }
      }
      if (eff.volatileStatus === 'flinch' && !target.fainted && target !== user) {
        if (hasAbility(target, 'innerfocus')) this.say(`${target.name} 的精神力使其不会退缩！`);
        else target.volatile.flinch = true;
      }
      if (eff.boosts) {
        const who = eff === move.self || eff.target === 'self' ? user : target;
        this.changeStages(who, eff.boosts, who === user ? user : user);
      }
    }

    heal(p, amount, why = '') {
      if (amount <= 0 || p.fainted) return;
      const real = Math.min(amount, p.maxHp - p.hp);
      p.hp += real;
      if (real > 0) this.say(`${p.name} ${why || '回复了体力'}（+${real}）。`);
    }
    applyDamage(p, amount, why = '') {
      p.hp = Math.max(0, p.hp - amount);
      if (why) this.say(why);
    }
    checkFaints() {
      for (const side of [0, 1]) {
        const p = this.cur(side);
        if (p && !p.fainted && p.hp <= 0) {
          p.fainted = true;
          this.say(`${p.name} 失去了战斗能力！`);
          if (side === 1 && this.alive(1).length) {
            const idx = this.bestSwitch(1);
            if (idx >= 0) { this.active[1] = idx; this.say(`敌方换上了 ${this.cur(1).name}！`); this.onEnter(1); if (this.cur(1).hp <= 0 && !this.cur(1).fainted) this.checkFaints(); }
          } else if (side === 0 && this.alive(0).length) {
            this.pendingSwitch = 0;
          }
        }
      }
    }
    /** Player forced switch after a faint. */
    forceSwitch(index) {
      if (this.pendingSwitch !== 0) return false;
      if (!this.doSwitch(0, index, { forced: true })) return false;
      this.pendingSwitch = null;
      this.checkFaints();
      this.updateWinner();
      return true;
    }
    endOfTurn() {
      for (const side of [0, 1]) {
        const p = this.cur(side);
        if (!p || p.fainted) continue;
        const ab = abilityId(p);
        if (this.field.terrain === 'grassy' && isGrounded(p)) this.heal(p, Math.floor(p.maxHp / 16), '青草场地回复了体力');
        if (this.weather === 'rain' && ab === 'raindish') this.heal(p, Math.floor(p.maxHp / 16), '雨盘回复了体力');
        if (this.weather === 'snow' && ab === 'icebody') this.heal(p, Math.floor(p.maxHp / 16), '冰冻之躯回复了体力');
        if (ab === 'dryskin') {
          if (this.weather === 'rain') this.heal(p, Math.floor(p.maxHp / 8), '干燥皮肤回复了体力');
          if (this.weather === 'sun') this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 8)), `${p.name} 受到了干燥皮肤的伤害！`);
        }
        if (this.weather === 'sand' && !['Rock', 'Ground', 'Steel'].some(t => p.types.includes(t)) && !hasAbility(p, 'sandveil', 'sandrush', 'sandforce', 'overcoat')) {
          this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 16)), `${p.name} 受到了沙暴的伤害！`);
        }
        if (this.weather === 'sun' && ab === 'solarpower') this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 8)), `${p.name} 受到了太阳之力的反作用！`);
        if (p.status === 'brn') this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / (hasAbility(p, 'heatproof') ? 32 : 16))), `${p.name} 受到了灼伤的伤害！`);
        if (p.status === 'psn' || p.status === 'tox') {
          if (ab === 'poisonheal') this.heal(p, Math.floor(p.maxHp / 8), '毒疗回复了体力');
          else if (p.status === 'psn') this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 8)), `${p.name} 受到了毒的伤害！`);
          else { this.applyDamage(p, Math.max(1, Math.floor(p.maxHp * p.toxicCounter / 16)), `${p.name} 受到了剧毒的伤害！`); p.toxicCounter++; }
        }
        if (p.status && ab === 'shedskin' && this.rng() < 0.3) { p.status = null; this.say(`${p.name} 蜕皮治愈了异常状态！`); }
        if (p.status && ab === 'hydration' && this.weather === 'rain') { p.status = null; this.say(`${p.name} 的湿润之躯治愈了异常状态！`); }
        if (!p.fainted && ab === 'speedboost' && !p._enteredThisTurn) this.changeStages(p, { spe: 1 }, p);
        if (!p.fainted && itemId(p) === 'leftovers') this.heal(p, Math.floor(p.maxHp / 16), '剩饭回复了体力');
        if (!p.fainted && itemId(p) === 'blacksludge') {
          if (p.types.includes('Poison')) this.heal(p, Math.floor(p.maxHp / 16), '黑色污泥回复了体力');
          else this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 8)), `${p.name} 受到了黑色污泥的伤害！`);
        }
        if (!p.fainted && !p.status && itemId(p) === 'flameorb') this.tryStatus(p, 'brn', p, { fromStatusMove: false });
        if (!p.fainted && !p.status && itemId(p) === 'toxicorb') this.tryStatus(p, 'tox', p, { fromStatusMove: false });
        this.checkItemTrigger(p, 'end');
      }
      for (const side of [0, 1]) { const p = this.cur(side); if (p?.volatile.disableTurns > 0 && --p.volatile.disableTurns === 0) delete p.volatile.disableMove; }
      // Field duration ticks.
      if (this.field.terrain && --this.field.terrainTurns <= 0) { this.field.terrain = null; this.field.terrainTurns = 0; this.say('场地恢复了正常。'); }
      if (this.field.trickRoom > 0 && --this.field.trickRoom === 0) this.say('扭曲的空间恢复了正常。');
      if (this.field.gravity > 0) this.field.gravity--;
      for (const sc of this.field.sides) {
        if (sc.reflect > 0 && --sc.reflect === 0) this.say('反射壁消失了。');
        if (sc.lightscreen > 0 && --sc.lightscreen === 0) this.say('光墙消失了。');
        if (sc.auroraveil > 0 && --sc.auroraveil === 0) this.say('极光幕消失了。');
        if (sc.tailwind > 0 && --sc.tailwind === 0) this.say('顺风停了。');
      }
      if (this.weatherTurns > 0 && --this.weatherTurns === 0) { this.say('天气恢复了正常。'); this.weather = null; }
      for (const side of [0, 1]) { const p = this.cur(side); if (p?.dynamaxed && --p.dynamaxTurns <= 0) this.endDynamax(p); }
    }

    updateWinner() {
      if (this.outcome === 'captured') return;
      if (this.alive(1).length === 0) { this.winner = 0; this.pendingSwitch = null; this.say('战斗胜利！'); }
      else if (this.alive(0).length === 0) { this.winner = 1; this.say('眼前一片漆黑……'); }
    }
    result() {
      return {
        winner: this.winner === null ? null : (this.winner === 0 ? 'player' : 'enemy'),
        outcome: this.outcome || (this.winner === null ? null : this.winner === 0 ? 'victory' : 'defeat'),
        encounterType: this.encounterType,
        ballStock: { ...this.ballStock },
        capture: this.capture ? JSON.parse(JSON.stringify(this.capture)) : null,
        turns: this.turnCount,
        weather: this.weather,
        field: JSON.parse(JSON.stringify(this.field)),
        mechanicUsed: JSON.parse(JSON.stringify(this.mechanicUsed)),
        playerTeam: this.teams[0].map(p => ({ species: p.speciesId, baseSpecies: p.originalSpeciesId, hp: p.hp, maxHp: p.maxHp, fainted: p.fainted, status: p.status, ability: p.ability, item: p.item, mechanic: p.mechanic, isMega: p.isMega, terastallized: p.terastallized, teraType: p.teraType, dynamaxed: p.dynamaxed })),
        enemyTeam: this.teams[1].map(p => ({ species: p.speciesId, baseSpecies: p.originalSpeciesId, hp: p.hp, maxHp: p.maxHp, fainted: p.fainted, status: p.status, ability: p.ability, item: p.item, mechanic: p.mechanic, isMega: p.isMega, terastallized: p.terastallized, teraType: p.teraType, dynamaxed: p.dynamaxed })),
        log: this.log.slice(),
      };
    }
  }

  const api = { setData, specialDamageInfo, FIXED_DAMAGE_IDS, VARIABLE_POWER_IDS, createPokemon, calcStats, effStat, estimateDamage, Battle, normId, STATUS_NAMES, abilityId, itemId, isGrounded, transformMove, makeZMove, makeMaxMove, stabMultiplier };
  root.PKMBattle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
