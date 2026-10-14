/*
 * PKM Battle Engine - singles (1v1 active, up to 6v6 teams).
 * Pure logic, no DOM. Depends on global PKMTypeChart.
 * Phase 1 scope: stats/IV/nature, damage formula, priority/speed order,
 * accuracy, crit, STAB, burn, weather basics (sun/rain/sand), major status
 * (par/brn/psn/tox/slp/frz), confusion, stat stages, secondary effects,
 * boosts/drain/recoil/heal/multihit from Showdown-style move data,
 * switching, simple AI. Items/abilities are data-only for now (Phase 3).
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
    return {
      speciesId: id, name: opts.nickname || species.name, speciesName: species.name,
      types: species.types.slice(), level, stats, maxHp: stats.hp, hp: stats.hp,
      moves, status: null, statusTurns: 0, toxicCounter: 1, sleepTurns: 0,
      stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
      volatile: {}, ability: opts.ability || (species.abilities?.[0] ?? null), item: opts.item || null,
      gender: opts.gender || null, shiny: !!opts.shiny, fainted: false,
    };
  }

  function effStat(p, key) {
    let v = p.stats[key] * stageMult(p.stages[key] || 0);
    if (key === 'spe' && p.status === 'par') v *= 0.5;
    return Math.max(1, Math.floor(v));
  }

  function estimateDamage(attacker, defender, move, rngVal = 0.925) {
    if (!move.basePower) return { damage: 0, eff: 1, crit: false };
    const isPhys = move.category === 'Physical';
    const atk = effStat(attacker, isPhys ? 'atk' : 'spa');
    const def = effStat(defender, isPhys ? 'def' : 'spd');
    let power = move.basePower;
    const wb = attacker._battle?.weather;
    if (wb === 'sun') { if (move.type === 'Fire') power *= 1.5; if (move.type === 'Water') power *= 0.5; }
    if (wb === 'rain') { if (move.type === 'Water') power *= 1.5; if (move.type === 'Fire') power *= 0.5; }
    const level = attacker.level;
    let dmg = Math.floor(((Math.floor((2 * level / 5 + 2) * power * atk / def)) / 50)) + 2;
    const eff = effectiveness(move.type, defender.types);
    let mult = eff * rngVal;
    if (attacker.types.includes(move.type)) mult *= 1.5; // STAB
    if (isPhys && attacker.status === 'brn') mult *= 0.5;
    dmg = Math.floor(dmg * mult);
    return { damage: eff === 0 ? 0 : Math.max(1, dmg), eff, crit: false };
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
      this.turnCount = 0;
      this.log = [];
      this.winner = null; // 0 | 1 | null
      this.pendingSwitch = null; // side index that must switch (player-facing)
      for (const t of this.teams) for (const p of t) p._battle = this;
      this.say(`战斗开始！${this.cur(1).name} VS ${this.cur(0).name}`);
    }
    say(msg) { this.log.push(msg); }
    cur(side) { return this.teams[side][this.active[side]]; }
    alive(side) { return this.teams[side].filter(p => !p.fainted); }
    other(side) { return 1 - side; }

    /* ---------- AI ---------- */
    aiAction(side) {
      const me = this.cur(side), foe = this.cur(this.other(side));
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
        let score;
        if (!m.basePower) {
          score = 18;
          if (m.status && !foe.status) score = 42;
          if (m.boosts && Object.values(m.boosts).some(v => v > 0)) score = me.stages.atk >= 2 ? 8 : 38;
          if (m.heal) score = me.hp < me.maxHp * 0.45 ? 55 : 4;
        } else {
          const est = estimateDamage(me, foe, m);
          score = est.damage * ((m.accuracy === true ? 100 : m.accuracy || 100) / 100);
          if (est.damage >= foe.hp) score += 120;
          score *= 0.85 + this.rng() * 0.3;
        }
        if (mistakes && this.rng() < mistakes) score = this.rng() * 50;
        if (!best || score > best.score) best = { kind: 'move', index: i, score };
      }
      return best || { kind: 'move', index: 0 };
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

    doSwitch(side, index) {
      const p = this.teams[side][index];
      if (!p || p.fainted || index === this.active[side]) return false;
      const old = this.cur(side);
      old.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
      old.volatile = {};
      this.active[side] = index;
      this.say(`${side === 0 ? '我方' : '敌方'}收回了 ${old.name}，换上 ${p.name}！`);
      return true;
    }

    /** Execute one full turn. playerAction = {kind:'move'|'switch', index}. Returns log lines added. */
    turn(playerAction) {
      if (this.winner !== null || this.pendingSwitch !== null) return [];
      const start = this.log.length;
      const foeAction = this.aiAction(1);
      const actions = [
        { side: 0, action: playerAction },
        { side: 1, action: foeAction },
      ];
      // Switches first.
      for (const a of actions) if (a.action.kind === 'switch') this.doSwitch(a.side, a.action.index);
      const movers = actions.filter(a => a.action.kind === 'move').map(a => {
        const p = this.cur(a.side);
        const move = p.moves[a.action.index] || p.moves[0];
        const prio = move.priority || 0;
        let speed = effStat(p, 'spe');
        if (this.weather === 'sand' && p.types.includes('Rock')) speed = speed; // spd handled in calc via stats only (phase note)
        return { ...a, move, prio, speed, tie: this.rng() };
      });
      movers.sort((x, y) => (y.prio - x.prio) || (y.speed - x.speed) || (x.tie - y.tie));
      this.turnCount++;
      for (const m of movers) {
        if (this.winner !== null) break;
        const user = this.cur(m.side);
        if (user.fainted) continue;
        this.useMove(m.side, user, this.cur(this.other(m.side)), m.move);
        this.checkFaints();
      }
      this.endOfTurn();
      this.checkFaints();
      this.updateWinner();
      return this.log.slice(start);
    }

    canMove(p) {
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
      if (p.volatile.flinch) { delete p.volatile.flinch; this.say(`${p.name} 退缩了，无法行动！`); return false; }
      return true;
    }

    useMove(side, user, target, move) {
      if (!this.canMove(user)) return;
      if (move.ppLeft > 0) move.ppLeft--;
      this.say(`${user.name} 使用了 ${move.name}！`);
      const selfTarget = !move.basePower && (move.heal || (move.boosts && move.target === 'self') || move.status === undefined && move.volatileStatus === undefined);
      const realTarget = (move.target === 'self' || selfTarget) ? user : target;
      // Accuracy
      let acc = move.accuracy === true || move.accuracy == null ? 100 : move.accuracy;
      acc *= stageMult((user.stages.accuracy || 0), 'acc') * stageMult((realTarget.stages.evasion || 0), 'eva');
      if (this.rng() * 100 > acc) { this.say(`但是没有命中 ${realTarget.name}！`); return; }

      const hits = Array.isArray(move.multihit) ? move.multihit[0] + Math.floor(this.rng() * (move.multihit[1] - move.multihit[0] + 1)) : (move.multihit || 1);
      for (let h = 0; h < hits; h++) {
        if (realTarget.fainted) break;
        if (move.basePower) {
          const critStage = [1 / 24, 1 / 8, 1 / 2, 1][Math.min(3, move.critRatio || 0)];
          const crit = this.rng() < critStage;
          const est = estimateDamage(user, realTarget, move, 0.85 + this.rng() * 0.15);
          let dmg = est.damage;
          if (crit) dmg = Math.floor(dmg * 1.5);
          if (est.eff === 0) { this.say(`对 ${realTarget.name} 没有效果……`); }
          else {
            this.applyDamage(realTarget, dmg);
            if (crit && est.eff > 0) this.say('击中了要害！');
            if (est.eff > 1) this.say('效果绝佳！'); else if (est.eff < 1 && est.eff > 0) this.say('效果不理想……');
          }
          if (move.drain && !realTarget.fainted) this.heal(user, Math.max(1, Math.floor(dmg * move.drain[0] / move.drain[1])), '吸取了体力');
          if (move.recoil && !user.fainted) this.applyDamage(user, Math.max(1, Math.floor(dmg * move.recoil[0] / move.recoil[1])), '受到了反作用力伤害');
        }
        if (hits > 1 && h === hits - 1) this.say(`击中了 ${hits} 次！`);
        // Guaranteed move effects (on target / self)
        if (!realTarget.fainted) this.applyEffects(user, realTarget, move, move);
        const sec = move.secondary || (move.secondaries ? move.secondaries[0] : null);
        if (sec && !realTarget.fainted && this.rng() * 100 < (sec.chance ?? 100)) this.applyEffects(user, realTarget, move, sec);
        if (move.self && !user.fainted) this.applyEffects(user, user, move, move.self);
      }
      if (move.heal && !user.fainted) this.heal(user, Math.floor(user.maxHp * move.heal[0] / move.heal[1]), '回复了体力');
    }

    applyEffects(user, target, move, eff) {
      if (!eff) return;
      if (eff.status) {
        const who = eff.target === 'self' ? user : target;
        if (!who.status && !who.fainted) {
          if (eff.status === 'tox') { who.status = 'tox'; who.toxicCounter = 1; }
          else who.status = eff.status;
          if (eff.status === 'slp') who.sleepTurns = 1 + Math.floor(this.rng() * 3);
          this.say(`${who.name} ${STATUS_NAMES[who.status] ? '陷入了' + STATUS_NAMES[who.status] + '状态！' : '状态变化了！'}`);
        }
      }
      if (eff.volatileStatus === 'confusion' && !target.fainted && target !== user) {
        target.volatile.confusion = 2 + Math.floor(this.rng() * 4);
        this.say(`${target.name} 混乱了！`);
      }
      if (eff.volatileStatus === 'flinch' && !target.fainted && target !== user) target.volatile.flinch = true;
      if (eff.boosts) {
        const who = eff === move.self || eff.target === 'self' ? user : target;
        for (const [k, v] of Object.entries(eff.boosts)) {
          if (!(k in who.stages)) continue;
          who.stages[k] = clampStage((who.stages[k] || 0) + v);
          this.say(`${who.name} 的 ${k} ${v > 0 ? '提升了' : '降低了'}！`);
        }
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
            if (idx >= 0) { this.active[1] = idx; this.say(`敌方换上了 ${this.cur(1).name}！`); }
          } else if (side === 0 && this.alive(0).length) {
            this.pendingSwitch = 0;
          }
        }
      }
    }
    /** Player forced switch after a faint. */
    forceSwitch(index) {
      if (this.pendingSwitch !== 0) return false;
      if (!this.doSwitch(0, index)) return false;
      this.pendingSwitch = null;
      this.updateWinner();
      return true;
    }
    endOfTurn() {
      for (const side of [0, 1]) {
        const p = this.cur(side);
        if (!p || p.fainted) continue;
        if (p.status === 'brn') this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 16)), `${p.name} 受到了灼伤的伤害！`);
        if (p.status === 'psn') this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 8)), `${p.name} 受到了毒的伤害！`);
        if (p.status === 'tox') { this.applyDamage(p, Math.max(1, Math.floor(p.maxHp * p.toxicCounter / 16)), `${p.name} 受到了剧毒的伤害！`); p.toxicCounter++; }
        if (this.weather === 'sand' && !['Rock', 'Ground', 'Steel'].some(t => p.types.includes(t))) this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 16)), `${p.name} 受到了沙暴的伤害！`);
      }
      if (this.weatherTurns > 0 && --this.weatherTurns === 0) { this.say('天气恢复了正常。'); this.weather = null; }
    }
    updateWinner() {
      if (this.alive(1).length === 0) { this.winner = 0; this.pendingSwitch = null; this.say('战斗胜利！'); }
      else if (this.alive(0).length === 0) { this.winner = 1; this.say('眼前一片漆黑……'); }
    }
    result() {
      return {
        winner: this.winner === null ? null : (this.winner === 0 ? 'player' : 'enemy'),
        turns: this.turnCount,
        playerTeam: this.teams[0].map(p => ({ species: p.speciesId, hp: p.hp, maxHp: p.maxHp, fainted: p.fainted })),
        enemyTeam: this.teams[1].map(p => ({ species: p.speciesId, hp: p.hp, maxHp: p.maxHp, fainted: p.fainted })),
        log: this.log.slice(),
      };
    }
  }

  const api = { setData, createPokemon, calcStats, effStat, estimateDamage, Battle, normId, STATUS_NAMES };
  root.PKMBattle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
