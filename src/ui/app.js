/* Browser UI + SillyTavern host bridge (postMessage). Engine lives in PKMBattle. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const normId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let battle = null, moveCache = {};

  const spriteUrl = (id, back) => `https://play.pokemonshowdown.com/sprites/${back ? 'gen5-back' : 'ani'}/${id}.${back ? 'png' : 'gif'}`;
  function setSprite(el, p, back) {
    el.innerHTML = '';
    const img = new Image();
    img.alt = p.name;
    img.src = spriteUrl(p.speciesId, back);
    img.onerror = () => { img.remove(); const s = document.createElement('span'); s.className = 'fallback'; s.textContent = '🎈'; el.appendChild(s); };
    el.appendChild(img);
  }
  const hpClass = ratio => ratio <= 0.2 ? 'hpfill crit' : ratio <= 0.5 ? 'hpfill low' : 'hpfill';

  function render() {
    if (!battle) return;
    const me = battle.cur(0), foe = battle.cur(1);
    const fill = (p, prefix) => {
      $(prefix + '-name').textContent = p.name + (p.status ? `（${PKMBattle.STATUS_NAMES[p.status] || p.status}）` : '');
      $(prefix + '-sub').textContent = `Lv.${p.level} · ${p.types.join('/')} · ${p.speciesName}`;
      const ratio = p.hp / p.maxHp;
      const bar = $(prefix + '-hp');
      bar.style.width = (ratio * 100).toFixed(1) + '%';
      bar.className = hpClass(ratio);
      $(prefix + '-hptext').textContent = `HP ${p.hp} / ${p.maxHp}`;
    };
    fill(me, 'p'); fill(foe, 'e');
    setSprite($('p-sprite'), me, true);
    setSprite($('e-sprite'), foe, false);
    const teamRow = (side, el) => {
      el.innerHTML = '';
      battle.teams[side].forEach((p, i) => {
        const s = document.createElement('span');
        s.className = 'pip' + (i === battle.active[side] ? ' active' : '') + (p.fainted ? ' fainted' : '');
        s.textContent = `${p.name} ${p.hp}/${p.maxHp}`;
        el.appendChild(s);
      });
    };
    teamRow(0, $('p-team')); teamRow(1, $('e-team'));

    const log = $('log');
    log.textContent = battle.log.join('\n');
    log.scrollTop = log.scrollHeight;

    const moves = $('moves');
    moves.innerHTML = '';
    const over = battle.winner !== null;
    me.moves.forEach((m, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.disabled = over || battle.pendingSwitch !== null || m.ppLeft <= 0;
      b.innerHTML = `${m.name}<small>${m.type} · ${m.category}${m.basePower ? ' · 威力 ' + m.basePower : ''} · PP ${m.ppLeft}/${m.pp}</small>`;
      b.onclick = () => act({ kind: 'move', index: i });
      moves.appendChild(b);
    });
    const sw = $('switches');
    sw.innerHTML = '';
    battle.teams[0].forEach((p, i) => {
      if (i === battle.active[0] || p.fainted) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `换 ${p.name}（HP ${p.hp}/${p.maxHp}）`;
      b.disabled = over;
      b.onclick = () => {
        if (battle.pendingSwitch !== null) { if (battle.forceSwitch(i)) after(); }
        else act({ kind: 'switch', index: i });
      };
      sw.appendChild(b);
    });
    const res = $('result');
    if (over) {
      res.classList.remove('hidden');
      res.textContent = battle.winner === 0 ? '🏆 胜利！' : '💀 败北……';
    } else if (battle.pendingSwitch !== null) {
      res.classList.remove('hidden');
      res.textContent = '请选择下一只宝可梦出战';
    } else res.classList.add('hidden');
  }

  function announceResult() {
    if (!battle || battle.winner === null) return;
    const payload = battle.result();
    try { window.parent?.postMessage({ type: 'PKM_BATTLE_RESULT', payload }, '*'); } catch (_) {}
    try { window.top?.postMessage({ type: 'PKM_BATTLE_RESULT', payload }, '*'); } catch (_) {}
  }
  function after() { render(); announceResult(); }
  function act(a) { if (!battle) return; battle.turn(a); after(); }

  function buildFromPreset(trainer) {
    return trainer.party.map(p => PKMBattle.createPokemon(p.species, p.level, p.moves, p));
  }
  function buildFromConfigParty(party) {
    // Party entries: "Species" | {name:Species, lv, moves:[...]} (Pink protocol mode B)
    return party.map(entry => {
      if (typeof entry === 'string') return PKMBattle.createPokemon(entry, 50, autoMoves(entry, 50));
      const species = entry.name;
      const level = entry.lv || entry.level || 50;
      const moves = (entry.moves && entry.moves.length) ? entry.moves : autoMoves(species, level);
      return PKMBattle.createPokemon(species, level, moves, entry);
    });
  }
  function autoMoves(speciesId, level) {
    // Phase 1 heuristic: STAB + strong coverage picks from full move DB.
    // Legal learnset filtering arrives with the Phase 2 data pipeline.
    const dex = PKMBattle._dex, moves = PKMBattle._moves;
    const sp = dex[normId(speciesId)];
    if (!sp) return [];
    const phys = sp.baseStats.atk >= sp.baseStats.spa;
    const candidates = Object.entries(moves)
      .filter(([, m]) => m.basePower >= 60 && m.category !== 'Status' && (m.accuracy === true || (m.accuracy ?? 100) >= 80))
      .map(([id, m]) => {
        let score = m.basePower * ((m.accuracy === true ? 100 : m.accuracy) / 100);
        if (sp.types.includes(m.type)) score *= 1.6;
        if ((m.category === 'Physical') === phys) score *= 1.25;
        return { id, score };
      })
      .sort((a, b) => b.score - a.score);
    const picked = [], usedTypes = new Set();
    for (const c of candidates) {
      const t = moves[c.id].type;
      if (usedTypes.has(t) && picked.length < 3) continue;
      usedTypes.add(t); picked.push(c.id);
      if (picked.length >= 4) break;
    }
    return picked;
  }

  function startBattle(cfg) {
    let playerTeam, enemyTeam, difficulty = $('sel-diff').value, weather = null;
    if (cfg) {
      difficulty = cfg.difficulty || difficulty;
      const resolveSide = (side, fallbackKey) => {
        const entrants = side?.entrants?.length ? side.entrants : [{ name: fallbackKey }];
        const team = [];
        for (const e of entrants) {
          const key = String(e.name || '').toLowerCase();
          const preset = PKMPresets.TRAINERS[key] || Object.values(PKMPresets.TRAINERS).find(t => t.name === e.name);
          if (Array.isArray(e.party) && e.party.length && typeof e.party[0] === 'object') team.push(...buildFromConfigParty(e.party));
          else if (preset) {
            const party = Array.isArray(e.party) && e.party.length
              ? preset.party.filter(p => e.party.map(normId).includes(normId(p.species)))
              : preset.party;
            team.push(...party.map(p => PKMBattle.createPokemon(p.species, p.level, p.moves, p)));
          } else if (e.party?.length) team.push(...buildFromConfigParty(e.party));
          else if (PKMBattle._dex[normId(e.name)]) team.push(PKMBattle.createPokemon(e.name, e.lv || e.level || 50, autoMoves(e.name, e.lv || e.level || 50), e));
        }
        return team;
      };
      playerTeam = resolveSide(cfg.p1, 'player');
      enemyTeam = resolveSide(cfg.p2, $('sel-enemy').value);
      if (cfg.environment?.weather) weather = cfg.environment.weather === 'clear' ? null : cfg.environment.weather;
      if (cfg.environment?.weatherTurns) var wt = cfg.environment.weatherTurns;
      battle = new PKMBattle.Battle(playerTeam, enemyTeam, { difficulty, weather, weatherTurns: typeof wt !== 'undefined' ? wt : 0 });
    } else {
      playerTeam = buildFromPreset(PKMPresets.TRAINERS.player);
      enemyTeam = buildFromPreset(PKMPresets.TRAINERS[$('sel-enemy').value]);
      battle = new PKMBattle.Battle(playerTeam, enemyTeam, { difficulty });
    }
    after();
  }

  async function init() {
    const [dex, moves] = await Promise.all([
      fetch('./src/data/pokedex.json').then(r => r.json()),
      fetch('./src/data/moves.json').then(r => r.json()),
    ]);
    PKMBattle.setData(dex, moves);
    PKMBattle._dex = dex; PKMBattle._moves = moves;
    $('btn-start').onclick = () => startBattle(null);
    $('btn-config').onclick = () => {
      try {
        const raw = $('txt-config').value.replace(/<\/?PKM_BATTLE>/gi, '').trim();
        startBattle(JSON.parse(raw));
      } catch (e) { alert('配置解析失败：' + e.message); }
    };
    // URL config: ?config=<encodeURIComponent(JSON)>
    const q = new URLSearchParams(location.search).get('config');
    if (q) { try { startBattle(JSON.parse(q)); return; } catch (_) {} }
    startBattle(null);
  }

  // SillyTavern host -> simulator
  window.addEventListener('message', ev => {
    const d = ev.data || {};
    if (d.type === 'PKM_BATTLE_CONFIG' && d.payload) { try { startBattle(d.payload); } catch (e) { console.warn('[PKM] bad config', e); } }
  });

  init().catch(e => { $('log').textContent = '数据加载失败：' + e.message + '\n（请通过 http 访问本页，不要直接双击文件）'; });
})();
