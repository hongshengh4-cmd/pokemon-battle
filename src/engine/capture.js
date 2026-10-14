/* Prototype wild capture rules. Intentionally not a claim of cartridge-accurate catch rates. */
(function (root) {
  'use strict';
  const BALLS = Object.freeze({
    pokeball: { id: 'pokeball', name: '精灵球', multiplier: 1, description: '基础捕获能力', color: '#fb5f87' },
    greatball: { id: 'greatball', name: '超级球', multiplier: 1.5, description: '捕获能力 ×1.5', color: '#579bff' },
    ultraball: { id: 'ultraball', name: '高级球', multiplier: 2, description: '捕获能力 ×2', color: '#f4c946' },
  });
  function chance(p, ball) {
    if (!Object.hasOwn(BALLS, ball) || !p || p.fainted || p.hp <= 0 || p.maxHp <= 0) return 0;
    const health = Math.max(0, Math.min(1, p.hp / p.maxHp));
    const status = ['slp', 'frz'].includes(p.status) ? 1.8 : p.status ? 1.35 : 1;
    return Math.min(.95, Math.max(.05, (.2 + .55 * (1 - health)) * BALLS[ball].multiplier * status));
  }
  function toSpec(p) {
    return { species: p.speciesId, level: Number(p.level), nature: p.nature || '', ability: p.ability || '',
      item: p.item || '', moves: p.moves.map(m => m.id), ivs: { ...p.ivs },
      nickname: p.hasNickname ? p.name : '', shiny: !!p.shiny, gender: p.gender || null,
      mechanic: '', megaForm: '', dynamaxForm: '', zType: '', teraType: '' };
  }
  function install(E) {
    E.Battle.prototype.captureReason = function (ball) {
      if (this.winner !== null) return '本场战斗已经结束。';
      if (this.encounterType !== 'wild' || this.teams[1].length !== 1) return '训练家的宝可梦不能捕获，请进入野生遭遇。';
      if (this.pendingSwitch !== null || this.cur(0).fainted) return '请先派出能够战斗的宝可梦。';
      const target = this.cur(1);
      if (!target || target.fainted || target.hp <= 0) return '已经失去战斗能力的宝可梦不能捕获。';
      if (!Number.isInteger(Number(target.level)) || Number(target.level) < 1 || Number(target.level) > 100) return '暂不支持捕获该等级的宝可梦。';
      if (target.isMega || target.dynamaxed || target.terastallized) return '暂不能捕获变身中的宝可梦，请等它恢复普通形态。';
      if (ball && !Object.hasOwn(BALLS, ball)) return '没有这种精灵球。';
      if (ball && !(Number.isInteger(this.ballStock?.[ball]) && this.ballStock[ball] > 0)) return '这种精灵球已经用完了。';
      return '';
    };
    E.Battle.prototype.captureTurn = function (action) {
      const start = this.log.length, ball = action.ball;
      const reason = this.captureReason(ball);
      if (!Object.hasOwn(BALLS, ball) || reason) {
        this.lastCapture = { allowed: false, reason: reason || '请选择精灵球。' };
        return [];
      }
      const target = this.cur(1), probability = chance(target, ball);
      this.ballStock[ball]--;
      const success = this.rng() < probability;
      const attempt = { allowed: true, ball, success, chance: probability, shakes: success ? 3 : Math.floor(this.rng() * 3),
        species: target.speciesId, name: target.name };
      this.say(`向 ${target.name} 投出了${BALLS[ball].name}！`);
      if (success) {
        this.turnCount++;
        this.capture = { ...attempt, spec: toSpec(target), hpAtCapture: target.hp, statusAtCapture: target.status };
        this.outcome = 'captured'; this.winner = 0; this.pendingSwitch = null;
        target.captured = true;
        this.say(`${target.name} 被收服了！`);
      } else {
        this.say(`${target.name} 挣脱了精灵球！`);
        // A failed throw replaces the player's move. Enemy action, weather/status,
        // fainting, PP and field/Dynamax durations use the ordinary engine turn.
        this.turn({ kind: 'wait' });
      }
      this.lastCapture = attempt;
      return this.log.slice(start);
    };
  }
  root.PKMCapture = { BALLS, chance, toSpec, install };
  if (root.PKMBattle) install(root.PKMBattle);
})(typeof globalThis !== 'undefined' ? globalThis : this);
