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
      const ab = PKMMechanics.abilityInfo(p.ability);
      const it = p.item ? PKMMechanics.itemInfo(p.item) : null;
      $(prefix + '-sub').textContent = `Lv.${p.level} · ${p.types.join('/')} · ${p.speciesName} · 特性 ${ab?.name || p.ability || '无'}${it ? ' · ' + it.name : ''}${p.choiceLockedMove ? ' · 讲究锁定中' : ''}`;
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
    const fieldParts = [];
    const weatherNames = { sun: '☀️ 大晴天', rain: '🌧️ 下雨', sand: '🌪️ 沙暴', snow: '❄️ 下雪' };
    const terrainNames = { electric: '⚡ 电气场地', grassy: '🌿 青草场地', misty: '🌫️ 薄雾场地', psychic: '🔮 精神场地' };
    if (battle.weather) fieldParts.push(weatherNames[battle.weather] + (battle.weatherTurns ? `（${battle.weatherTurns}）` : ''));
    if (battle.field.terrain) fieldParts.push(terrainNames[battle.field.terrain] + `（${battle.field.terrainTurns}）`);
    if (battle.field.trickRoom > 0) fieldParts.push(`🌀 戏法空间（${battle.field.trickRoom}）`);
    if (battle.field.gravity > 0) fieldParts.push(`重力（${battle.field.gravity}）`);
    const sideText = (sc, label) => {
      const a = [];
      if (sc.stealthrock) a.push('隐形岩'); if (sc.spikes) a.push(`撒菱×${sc.spikes}`); if (sc.toxicspikes) a.push(`毒菱×${sc.toxicspikes}`); if (sc.stickyweb) a.push('黏黏网');
      if (sc.reflect) a.push(`反射壁${sc.reflect}`); if (sc.lightscreen) a.push(`光墙${sc.lightscreen}`); if (sc.auroraveil) a.push(`极光幕${sc.auroraveil}`); if (sc.tailwind) a.push(`顺风${sc.tailwind}`);
      if (a.length) fieldParts.push(label + '：' + a.join('、'));
    };
    sideText(battle.field.sides[0], '我方'); sideText(battle.field.sides[1], '敌方');
    $('field-state').textContent = '场地：' + (fieldParts.length ? fieldParts.join(' · ') : '无特殊效果');

    const log = $('log');
    log.textContent = battle.log.join('\n');
    log.scrollTop = log.scrollHeight;

    const moves = $('moves');
    moves.innerHTML = '';
    const over = battle.winner !== null;
    me.moves.forEach((m, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.disabled = over || battle.pendingSwitch !== null || m.ppLeft <= 0 || (me.choiceLockedMove && me.choiceLockedMove !== m.id) || me.volatile.disableMove === m.id;
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
    return PKMTeam.chooseAutoMoves(speciesId, level || 50);
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
      playerTeam = $('chk-custom-player').checked ? buildValidated(readEditor('player'), '我方') : buildFromPreset(PKMPresets.TRAINERS.player);
      if (!playerTeam) return;
      enemyTeam = $('chk-custom-enemy').checked ? buildValidated(readEditor('enemy'), '敌方') : buildFromPreset(PKMPresets.TRAINERS[$('sel-enemy').value]);
      if (!enemyTeam) return;
      battle = new PKMBattle.Battle(playerTeam, enemyTeam, { difficulty });
    }
    after();
  }


  /* ---------- Team editor (Phase 2) ---------- */
  const NATURES = ['', 'adamant', 'modest', 'jolly', 'timid', 'bold', 'calm', 'impish', 'careful', 'brave', 'quiet', 'relaxed', 'sassy', 'lonely', 'mild', 'hasty', 'naive', 'naughty', 'rash', 'lax', 'gentle'];
  const LS_KEY = 'pkm-custom-teams-v2';
  function resolveSpeciesId(text) {
    const n = normId(text);
    if (PKMBattle._dex[n]) return n;
    for (const [id, sp] of Object.entries(PKMBattle._dex)) if (normId(sp.name) === n) return id;
    return n;
  }
  function editorRoot(side) { return side === 'player' ? $('editor-player') : $('editor-enemy'); }
  function specFromPreset(key) {
    return PKMPresets.TRAINERS[key].party.map(p => ({ species: p.species, level: p.level, nature: p.nature || '', ability: p.ability || '', item: p.item || '', moves: p.moves.slice() }));
  }
  function loadEditorSpecs() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (saved && Array.isArray(saved.player) && Array.isArray(saved.enemy)) return saved;
    } catch (_) {}
    return { player: specFromPreset('player'), enemy: specFromPreset('gym') };
  }
  function saveEditorSpecs(show) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ player: readEditor('player'), enemy: readEditor('enemy') })); if (show) showValidate('已保存到本机浏览器。'); } catch (e) { if (show) alert('保存失败：' + e.message); }
  }
  function refreshRowOptions(row) {
    const sid = resolveSpeciesId(row.querySelector('.f-species').value);
    const dex = PKMBattle._dex[sid];
    const level = parseInt(row.querySelector('.f-level').value || '50', 10) || 50;
    const abilitySel = row.querySelector('.f-ability');
    const prevAbility = abilitySel.value || abilitySel.dataset.want || '';
    abilitySel.innerHTML = '';
    (dex?.abilities || []).forEach(a => { const o = document.createElement('option'); o.value = a; o.textContent = a; abilitySel.appendChild(o); });
    if (prevAbility && dex?.abilities?.includes(prevAbility)) abilitySel.value = prevAbility;
    const legal = dex ? PKMTeam.legalMoves(sid, level) : [];
    row.querySelectorAll('.f-move').forEach(sel => {
      const prev = sel.value || sel.dataset.want || '';
      sel.innerHTML = '';
      const blank = document.createElement('option'); blank.value = ''; blank.textContent = '（自动配招）'; sel.appendChild(blank);
      for (const m of legal) {
        const o = document.createElement('option');
        o.value = m.id;
        o.textContent = `${m.name} · ${m.type}/${m.category}${m.basePower ? ' ' + m.basePower : ''}（${m.learn.viaLabel}）`;
        sel.appendChild(o);
      }
      if (prev) {
        if (![...sel.options].some(o => o.value === prev)) {
          const o = document.createElement('option'); o.value = prev; o.textContent = (PKMBattle._moves[prev]?.name || prev) + '（当前等级未学会/不合法）'; sel.appendChild(o);
        }
        sel.value = prev;
      }
    });
    const abInfo = PKMMechanics.abilityInfo(abilitySel.value);
    abilitySel.title = abInfo ? `${abInfo.name}：${abInfo.desc}` : '该特性效果将在后续阶段实现';
    const itemSel = row.querySelector('.f-item');
    if (itemSel) itemSel.title = PKMMechanics.itemInfo(itemSel.value).desc;
    row.querySelector('.f-note').textContent = dex
      ? (PKMTeam.hasLearnset(sid) ? `${dex.name} · ${dex.types.join('/')} · 合法招式 ${legal.length} 个 · ${abInfo ? '特性已生效' : '特性效果待实现'}` : `${dex.name} · 数据集暂无现行学习面（未校验）`)
      : '物种不存在';
  }
  function renderEditor(side, specs) {
    const rootEl = editorRoot(side);
    rootEl.innerHTML = '';
    specs.slice(0, 6).forEach((spec, i) => {
      const row = document.createElement('fieldset');
      row.className = 'team-row';
      row.style.cssText = 'border:2px solid #222;border-radius:10px;margin:0 0 8px;padding:8px;background:#fff';
      row.innerHTML = `<legend style="font-weight:700">#${i + 1}</legend>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <input class="f-species" list="species-list" placeholder="物种（如 pikachu）" style="width:150px">
          <input class="f-level" type="number" min="1" max="100" style="width:72px" title="等级">
          <select class="f-nature" title="性格">${NATURES.map(n => `<option value="${n}">${n || '性格：无修正'}</option>`).join('')}</select>
          <select class="f-ability" title="特性"></select>
          <select class="f-item" title="道具">${Object.values(PKMMechanics.ITEMS).map(i => `<option value="${i.id}">${i.name}</option>`).join('')}</select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px">
          ${[0, 1, 2, 3].map(() => `<select class="f-move"></select>`).join('')}
        </div>
        <div class="f-note note"></div>`;
      rootEl.appendChild(row);
      row.querySelector('.f-species').value = spec.species || '';
      row.querySelector('.f-level').value = spec.level || 50;
      row.querySelector('.f-nature').value = spec.nature || '';
      row.querySelector('.f-ability').dataset.want = spec.ability || '';
      row.querySelector('.f-item').value = spec.item || '';
      row.querySelectorAll('.f-move').forEach((sel, k) => { sel.dataset.want = (spec.moves || [])[k] || ''; });
      refreshRowOptions(row);
      row.querySelector('.f-species').addEventListener('change', () => {
        refreshRowOptions(row);
        const sid = resolveSpeciesId(row.querySelector('.f-species').value);
        const auto = PKMTeam.chooseAutoMoves(sid, parseInt(row.querySelector('.f-level').value || '50', 10) || 50);
        row.querySelectorAll('.f-move').forEach((sel, k) => { sel.dataset.want = auto[k] || ''; sel.value = auto[k] || ''; });
        saveEditorSpecs(false);
      });
      row.querySelector('.f-level').addEventListener('change', () => { refreshRowOptions(row); saveEditorSpecs(false); });
      row.addEventListener('change', () => saveEditorSpecs(false));
    });
  }
  function readEditor(side) {
    const specs = [];
    editorRoot(side).querySelectorAll('.team-row').forEach(row => {
      const speciesText = row.querySelector('.f-species').value.trim();
      if (!speciesText) return;
      const sid = resolveSpeciesId(speciesText);
      const level = parseInt(row.querySelector('.f-level').value || '50', 10) || 50;
      let moves = [...row.querySelectorAll('.f-move')].map(sel => sel.value).filter(Boolean);
      if (!moves.length) moves = PKMTeam.chooseAutoMoves(sid, level);
      specs.push({ species: sid, level, nature: row.querySelector('.f-nature').value, ability: row.querySelector('.f-ability').value, item: row.querySelector('.f-item').value, moves });
    });
    return specs;
  }
  function buildValidated(spec, label) {
    const v = PKMTeam.validateTeam(spec);
    showValidate((v.errors.length ? `${label}错误：\n` + v.errors.join('\n') : '') + (v.warnings.length ? `\n${label}提示：\n` + v.warnings.join('\n') : ''));
    if (!v.ok) { alert(label + '队伍有问题：\n' + v.errors.join('\n')); return null; }
    return spec.map(p => PKMBattle.createPokemon(p.species, p.level, p.moves, p));
  }
  function showValidate(extra) {
    const pv = PKMTeam.validateTeam(readEditor('player')), ev = PKMTeam.validateTeam(readEditor('enemy'));
    const lines = [];
    if (extra) lines.push(extra);
    lines.push(pv.ok ? '我方队伍：合法 ✓' : '我方队伍错误：\n' + pv.errors.join('\n'));
    lines.push(ev.ok ? '敌方队伍：合法 ✓' : '敌方队伍错误：\n' + ev.errors.join('\n'));
    for (const w of [...pv.warnings, ...ev.warnings]) lines.push('提示：' + w);
    $('validate-msg').textContent = lines.join('\n');
    $('validate-msg').style.whiteSpace = 'pre-wrap';
  }
  function randomSpec() {
    const pool = Object.entries(PKMBattle._dex)
      .filter(([id, sp]) => (sp.num >= 1 && sp.num <= 1025) && PKMTeam.hasLearnset(id) && (!sp.baseSpecies || normId(sp.baseSpecies) === id))
      .filter(([, sp]) => Object.values(sp.baseStats).reduce((a, b) => a + b, 0) >= 500)
      .map(([id]) => id);
    const team = [];
    const used = new Set();
    while (team.length < 6 && pool.length) {
      const id = pool[Math.floor(Math.random() * pool.length)];
      if (used.has(id)) continue;
      used.add(id);
      const level = 55 + Math.floor(Math.random() * 11);
      team.push({ species: id, level, nature: '', ability: PKMBattle._dex[id].abilities?.[0] || '', item: ['leftovers', 'lifeorb', 'focussash', 'heavydutyboots'][team.length % 4], moves: PKMTeam.chooseAutoMoves(id, level) });
    }
    return team;
  }

  async function init() {
    const [dex, moves, learnsets] = await Promise.all([
      fetch('./src/data/pokedex.json').then(r => r.json()),
      fetch('./src/data/moves.json').then(r => r.json()),
      fetch('./src/data/learnsets.json').then(r => r.json()),
    ]);
    PKMBattle.setData(dex, moves);
    PKMTeam.setData(dex, moves, learnsets);
    PKMBattle._dex = dex; PKMBattle._moves = moves;
    const dl = $('species-list');
    Object.values(dex).sort((a, b) => a.num - b.num).forEach(sp => { const o = document.createElement('option'); o.value = sp.name; dl.appendChild(o); });
    const specs = loadEditorSpecs();
    renderEditor('player', specs.player);
    renderEditor('enemy', specs.enemy);
    $('btn-save-teams').onclick = () => saveEditorSpecs(true);
    $('btn-validate').onclick = () => showValidate('');
    $('btn-random-player').onclick = () => { renderEditor('player', randomSpec()); saveEditorSpecs(false); showValidate('已随机生成我方队伍。'); };
    $('btn-reset-teams').onclick = () => { renderEditor('player', specFromPreset('player')); renderEditor('enemy', specFromPreset('gym')); saveEditorSpecs(false); showValidate('已恢复内置队伍。'); };
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
