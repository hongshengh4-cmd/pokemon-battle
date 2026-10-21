/* Browser UI + SillyTavern host bridge (postMessage). Engine lives in PKMBattle. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const normId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let battle = null, moveCache = {}, selectedMechanic = null, animating = false;
  let menuView = 'home', commandMessage = '', encounterId = '', collectionLimit = 48, announcedBattle = null;
  let worldStorage = null; try { worldStorage = window.localStorage; } catch (_) {}
  let worldStore = new PKMWorldSave.Store(new URLSearchParams(location.search).has('fxpreview') ? memoryStorage() : worldStorage);
  // v1.3.2: 外置桥接（SillyTavern 角色卡）嵌入模式：?embed=1
  const EMBED = new URLSearchParams(location.search).has('embed');
  if (EMBED) document.documentElement.classList.add('embed');
  let dataReady = false, pendingHostConfig = null, hostTag = null, hostMode = false;
  const APP_VERSION = '1.3.20';
  let formatTag = '', formatRule = ''; // v1.3.8：角色卡发来的赛制（例：3v3、3只 vs 1只），显示在行动菜单的标签上
  let typeLabel = ''; // v1.3.9：角色卡发来的对战类型（道馆战 / 训练家对战 / 劲敌对战 / 火箭队……），标签第一段
  // 宿主模式：球袋来自角色卡变量（MVU），只存在本页内存里，不读写本机存档。
  function memoryStorage() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } }; }
  function useHostStore(balls) {
    const store = new PKMWorldSave.Store(memoryStorage());
    const clean = {};
    for (const id of Object.keys(PKMWorldSave.INITIAL_BALLS)) { const n = Number(balls?.[id]); clean[id] = Number.isInteger(n) && n >= 0 ? Math.min(n, 9999) : 0; }
    store.write({ version: 1, balls: clean, box: [] });
    worldStore = store; hostMode = true;
  }
  function postHost(type, payload) {
    const msg = { type, payload, hostTag };
    try { window.parent?.postMessage(msg, '*'); } catch (_) {}
    try { if (window.top && window.top !== window.parent) window.top.postMessage(msg, '*'); } catch (_) {}
  }
  let ZH = { species: {}, moves: {}, abilities: {}, natures: {}, types: {}, categories: {} };
  let SPRITES = {};
  let SPRITE_FEET = {};
  let SPRITE_FEETX = {};
  let SPRITE_BODY = {};
  let SPRITE_MOUTH = {}; // v0.9.5: 嘴部锚点（离线测量，tools/measure-mouth-anchors.py）
  let textPairs = [], speciesZhToId = {}, textMap = new Map(), textRegex = null;
  const zhType = t => ZH.types?.[t] || PKMMechanics.TYPE_ZH[t] || t || '无属性';
  const zhCat = c => ZH.categories?.[c] || ({ Physical: '物理', Special: '特殊', Status: '变化' }[c] || c || '变化');
  const zhSpecies = (id, fallback = '') => ZH.species?.[normId(id)] || fallback || '未知宝可梦';
  const zhMove = (id, fallback = '') => ZH.moves?.[normId(id)] || fallback || '未知招式';
  const zhAbility = (idOrName, fallback = '未知特性') => PKMMechanics.abilityInfo(idOrName)?.name || ZH.abilities?.[normId(idOrName)] || fallback;
  const zhNature = id => !id ? '无修正' : (ZH.natures?.[normId(id)] || '未知性格');
  const displayPokemonName = p => p.hasNickname ? p.name : zhSpecies(p.speciesId, p.speciesName || p.name);
  const displayItemName = item => !item ? '' : (PKMMechanics.ITEMS[item.id]?.name || '未知道具');
  function displayMoveName(shown, base) {
    if (!shown) return '未知招式';
    if (shown._isZ) return `Ｚ招式·${zhMove(shown._baseId || base?.id, base?.name || '')}`;
    if (shown._isMax) {
      if (String(shown.id || '').startsWith('gmax')) return `超极巨${zhType(shown.type)}招式`;
      return zhMove(shown.id, shown.name);
    }
    return zhMove(shown.id, shown.name);
  }
  function buildTextPairs() {
    const pairs = [];
    speciesZhToId = {};
    for (const [id, name] of Object.entries(ZH.species || {})) if (name && !speciesZhToId[name]) speciesZhToId[name] = id;
    if (PKMBattle._dex) for (const [id, sp] of Object.entries(PKMBattle._dex)) {
      const zh = zhSpecies(id, sp.name);
      pairs.push([sp.name, zh], [id, zh]);
    }
    if (PKMBattle._moves) for (const [id, mv] of Object.entries(PKMBattle._moves)) pairs.push([mv.name, zhMove(id, mv.name)], [id, zhMove(id, mv.name)]);
    const abilityNames = new Set();
    if (PKMBattle._dex) for (const sp of Object.values(PKMBattle._dex)) for (const a of sp.abilities || []) abilityNames.add(a);
    for (const a of abilityNames) pairs.push([a, zhAbility(a, a)]);
    for (const t of PKMMechanics.TYPES) pairs.push([t, zhType(t)]);
    pairs.push(['Z·', 'Ｚ招式·'], ['Gigantamax', '超极巨化'], ['Dynamax', '极巨化'], ['G-Max', '超极巨'], ['Mega', '超级'], ['Z-Move', 'Ｚ招式'], ['Z Move', 'Ｚ招式'], ['PP', '招式点数'], ['HP', '体力'], ['VS', '对'], ['Lv.', '等级 '], ['Mega Evolution', '超级进化']);
    textPairs = pairs.filter(([a, b]) => a && b && a !== b).sort((x, y) => y[0].length - x[0].length);
    textMap = new Map(textPairs);
    const esc = x => x.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    textRegex = new RegExp(textPairs.map(([from]) => esc(from)).join('|'), 'g');
  }
  function translateText(text) {
    const out = String(text ?? '');
    return textRegex ? out.replace(textRegex, match => textMap.get(match) || match) : out;
  }

  const spriteFailed = new Set();
  const spriteSlugFromName = name => String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace('-mega-x', '-megax').replace('-mega-y', '-megay').replace('-mega-z', '-megaz');
  const spriteIdFromSpeciesId = id => String(id || '')
    .replace(/(mega)([xyz])$/, '-$1$2')
    .replace(/mega$/, '-mega')
    .replace(/gmax$/, '-gmax');
  function spriteCandidates(p) {
    const form = [], base = [];
    const add = (list, value) => { const v = String(value || '').trim(); if (v && !list.includes(v)) list.push(v); };
    add(form, spriteIdFromSpeciesId(p.speciesId));
    add(form, spriteSlugFromName(p.speciesName));
    add(form, p.speciesId);
    add(base, spriteIdFromSpeciesId(p.originalSpeciesId));
    const baseDex = PKMBattle._dex?.[normId(p.originalSpeciesId)];
    if (baseDex) add(base, spriteSlugFromName(baseDex.name));
    add(base, p.originalSpeciesId);
    const currentDex = PKMBattle._dex?.[normId(p.speciesId)];
    if (currentDex?.baseSpecies) {
      const dexBaseId = normId(currentDex.baseSpecies);
      const dexBase = PKMBattle._dex?.[dexBaseId];
      if (dexBase) add(base, spriteSlugFromName(dexBase.name));
      add(base, spriteSlugFromName(currentDex.baseSpecies));
      add(base, dexBaseId);
    }
    const nameSlug = spriteSlugFromName(p.speciesName);
    for (const suffix of ['-gmax', '-megax', '-megay', '-megaz', '-mega']) {
      if (nameSlug.endsWith(suffix)) add(base, nameSlug.slice(0, -suffix.length));
    }
    // Some combined forms only have an animated sprite under their base form.
    for (const id of [...base]) if (!form.includes(id)) form.push(id);
    return { form: form.slice(0, 3), base };
  }
  function spriteAttempts(p, back) {
    const { form, base } = spriteCandidates(p);
    const attempts = [];
    const add = (dir, id, ext) => {
      const url = `https://play.pokemonshowdown.com/sprites/${dir}/${id}.${ext}`;
      if (!attempts.includes(url)) attempts.push(url);
    };
    if (back) {
      form.forEach(id => add('ani-back', id, 'gif'));
      base.forEach(id => add('ani-back', id, 'gif'));
      form.forEach(id => add('gen5-back', id, 'png'));
      base.forEach(id => add('gen5-back', id, 'png'));
      form.forEach(id => add('ani', id, 'gif'));
      base.forEach(id => add('ani', id, 'gif'));
      form.forEach(id => add('gen5', id, 'png'));
      base.forEach(id => add('gen5', id, 'png'));
    } else {
      form.forEach(id => add('ani', id, 'gif'));
      base.forEach(id => add('ani', id, 'gif'));
      form.forEach(id => add('gen5', id, 'png'));
      base.forEach(id => add('gen5', id, 'png'));
      form.forEach(id => add('ani-back', id, 'gif'));
      base.forEach(id => add('ani-back', id, 'gif'));
    }
    const fresh = attempts.filter(url => !spriteFailed.has(url));
    return fresh.length ? fresh : attempts;
  }
  // Size is semantic (dex height), not the GIF's canvas size. Layout dimensions
  // change independently from transform animations, so attacks/entry keep working.
  function applySpriteSize(img, p) {
    if (!img || !p) return;
    img._spriteState = { speciesId: normId(p.speciesId), originalSpeciesId: normId(p.originalSpeciesId || p.speciesId),
      dynamaxed: !!p.dynamaxed, dynamaxForm:p.dynamaxForm || '', isMega: !!p.isMega };
    const profile = PKMSpriteSizing.profile(PKMBattle._dex, img._spriteState.speciesId, img._spriteState);
    img.style.setProperty('--body-ratio', String(profile.ratio));
    img.dataset.species = img._spriteState.speciesId;
    img.dataset.sizeCategory = profile.category;
    img.parentElement?.classList.toggle('is-dynamax', !!p.dynamaxed);
    img.parentElement?.classList.toggle('is-mega', !!p.isMega);
  }
  // Keep the measured feet unchanged; project them through the new layout size.
  function groundAlign(img, url) {
    const box = img?.parentElement;
    if (!box || !img.naturalWidth || !img.naturalHeight || !img.clientHeight) return;
    const mapped = SPRITES[img.dataset.species];
    const back = box.id === 'p-sprite';
    const feet = SPRITE_FEET[url] ?? mapped?.[back ? 'backFeet' : 'frontFeet'] ?? .94;
    const feetX = SPRITE_FEETX[url] ?? mapped?.[back ? 'backFeetX' : 'frontFeetX'] ?? .5;
    const style = getComputedStyle(img);
    const inputs = {
      imageLeft: img.offsetLeft, imageTop: img.offsetTop,
      width: img.clientWidth, height: img.clientHeight,
      naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
      boxWidth: box.clientWidth, boxHeight: box.clientHeight,
      feet, feetX, flip: parseFloat(style.getPropertyValue('--flip')) < 0,
      permanentScale: 1,
    };
    let geometry = PKMSpriteSizing.ground(inputs);
    if (!geometry) return;
    const giant=!!img._spriteState?.dynamaxed;
    let permanentScale=giant?(img._spriteState.dynamaxForm==='gmax'?1.55:1.4):(img._spriteState?.isMega?1.07:1),shiftX=0,shiftY=0;
    const arena=box.closest('.arena');
    if(giant&&arena){
      const ar=arena.getBoundingClientRect(),br=box.getBoundingClientRect(),pivot=geometry.originY/100*img.clientHeight;
      const floor=br.top-ar.top+box.clientHeight-27,below=img.clientHeight-pivot;
      permanentScale=Math.min(permanentScale,(ar.height-36)/img.clientHeight,(ar.width-28)/img.clientWidth);
      const safeFloor=Math.max(pivot*permanentScale+18,Math.min(ar.height-below*permanentScale-18,floor));
      shiftY=safeFloor-floor;
      const half=img.clientWidth*permanentScale*.5,center=br.left-ar.left+img.offsetLeft+img.clientWidth*.5;
      shiftX=Math.max(half+14,Math.min(ar.width-half-14,center))-center;
    }
    img.style.setProperty('--sprite-scale',String(permanentScale));
    geometry=PKMSpriteSizing.ground({...inputs,permanentScale,giantShadow:giant,shadowMaxWidth:giant&&arena?arena.clientWidth*.88:undefined,shadowMaxHeight:giant?92:undefined});
    img.style.translate = `${shiftX.toFixed(2)}px ${(geometry.translateY+shiftY).toFixed(2)}px`;
    // Mega/Dynamax scale around the actual floor point rather than the GIF edge.
    img.style.transformOrigin = `50% ${geometry.originY}%`;
    box.style.setProperty('--ground-shift',`${shiftY.toFixed(2)}px`);
    box.style.setProperty('--shadow-x', `${(geometry.shadowX+shiftX).toFixed(2)}px`);
    box.style.setProperty('--shadow-width', `${geometry.shadowWidth.toFixed(2)}px`);
    box.style.setProperty('--shadow-height', `${geometry.shadowHeight.toFixed(2)}px`);
    box.style.setProperty('--aura-width', `${Math.min(box.clientWidth*1.3,img.clientWidth*1.15).toFixed(2)}px`);
    box.style.setProperty('--aura-height', `${(img.clientHeight*permanentScale*1.05).toFixed(2)}px`);
    box.style.setProperty('--giant-height',`${(img.clientHeight*permanentScale*.92).toFixed(2)}px`);
  }
  const spriteResizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
    for (const entry of entries) {
      const img = entry.target.tagName === 'IMG' ? entry.target : entry.target.querySelector(':scope > img');
      if (img?.isConnected) groundAlign(img, img.currentSrc || img.src);
    }
  });
  function setSprite(el, p, back) {
    // HP/menu redraws must not destroy and reload the animated GIF every time.
    const visualKey = JSON.stringify([p.speciesId, p.originalSpeciesId, !!back, !!p.dynamaxed,
      p.dynamaxForm, !!p.isMega, !!p.terastallized, p.teraType]);
    if (el.dataset.visualKey === visualKey && el.querySelector(':scope > img')) return;
    el.dataset.visualKey = visualKey;
    const previousImg = el.querySelector(':scope > img');
    if (previousImg) spriteResizeObserver?.unobserve(previousImg);
    el.innerHTML = '';
    el.classList.toggle('is-mega', !!p.isMega);
    el.classList.toggle('is-dynamax', !!p.dynamaxed);
    el.classList.toggle('is-gmax', !!p.dynamaxed && p.dynamaxForm === 'gmax');
    const mapped = SPRITES[normId(p.speciesId)] || null;
    const mappedUrl = mapped ? (back ? mapped.back : mapped.front) : null;
    let attempts = spriteAttempts(p, back);
    if (mappedUrl) attempts = [mappedUrl, ...attempts.filter(url => url !== mappedUrl)];
    let idx = 0;
    const img = new Image();
    img.alt = displayPokemonName(p);
    img.onload = () => {
      const url = img.currentSrc || img.src || attempts[idx] || '';
      const isMapped = !!mappedUrl && new URL(mappedUrl, document.baseURI).href === url;
      let flip = 1;
      if (back && ((isMapped && mapped?.backFallback === 'front') || /\/sprites\/(ani|gen5)\//.test(url))) flip = -1;
      if (!back && /\/sprites\/(ani-back|gen5-back)\//.test(url)) flip = -1;
      img.style.setProperty('--flip', String(flip));
      groundAlign(img, url);
    };
    img.onerror = () => {
      if (attempts[idx]) spriteFailed.add(attempts[idx]);
      idx += 1;
      if (idx < attempts.length) { img.src = attempts[idx]; return; }
      img.remove();
      const s = document.createElement('span');
      s.className = 'fallback'; s.textContent = '？'; el.appendChild(s);
    };
    applySpriteSize(img, p);
    img.src = attempts[idx];
    el.appendChild(img);
    spriteResizeObserver?.observe(img);
    if (p.dynamaxed) img.classList.add('state-dynamax');
    if (p.terastallized) { img.classList.add('state-tera'); img.style.setProperty('--mech', FX_TYPE_COLORS[p.teraType] || '#67e8f9'); }
    if (p.dynamaxed) {
      const aura=document.createElement('span');aura.className='dynamax-aura';aura.setAttribute('aria-hidden','true');el.prepend(aura);
      const clouds = document.createElement('span');
      clouds.className = 'dynamax-clouds' + (p.dynamaxForm === 'gmax' ? ' gmax' : '');
      clouds.setAttribute('aria-hidden', 'true');
      clouds.innerHTML = '<i></i><i></i><i></i>';
      el.appendChild(clouds);
    }
    if (p.terastallized) {
      const jewel = document.createElement('span');
      jewel.className = `tera-jewel type-${String(p.teraType || 'Normal').toLowerCase()}`;
      jewel.setAttribute('aria-hidden', 'true');
      el.appendChild(jewel);
    }
  }
  const hpClass = ratio => ratio <= 0.2 ? 'hpfill crit' : ratio <= 0.5 ? 'hpfill low' : 'hpfill';

  /* ---------- 战斗动画表现 ---------- */
  function snapPokemon(p) {
    return p ? {
      speciesId: p.speciesId, originalSpeciesId: p.originalSpeciesId, rawName: p.name, name: displayPokemonName(p), hp: p.hp, maxHp: p.maxHp,
      fainted: p.fainted, status: p.status, isMega: p.isMega, dynamaxed: p.dynamaxed,
      nameText: displayPokemonName(p) + (p.status ? `（${PKMBattle.STATUS_NAMES[p.status] || p.status}）` : ''),
      dynamaxForm: p.dynamaxForm, terastallized: p.terastallized, teraType: p.teraType, mechanic: p.mechanic, zType: p.zType,
    } : null;
  }
  function snapshotBattle() {
    if (!battle) return null;
    return { weather: battle.weather, field: { ...battle.field }, active: battle.active.slice(), winner: battle.winner, teams: battle.teams.map(team => team.map(snapPokemon)) };
  }
  const spriteEl = side => $(side === 0 ? 'p-sprite' : 'e-sprite');
  function addClassTemp(el, className, ttl = 900) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), ttl);
  }
  function animateImg(side, className, ttl = 900) {
    const box = spriteEl(side);
    const img = box?.querySelector('img');
    if (img) addClassTemp(img, className, ttl);
    if (box) addClassTemp(box, className, ttl);
  }
  function addFx(side, className, text = '', ttl = 1100) {
    const box = spriteEl(side);
    if (!box) return;
    const fx = document.createElement('div');
    fx.className = `fx ${className}`;
    if (text) fx.textContent = text;
    box.appendChild(fx);
    setTimeout(() => fx.remove(), ttl);
  }
  // v0.9.5: 命中闪光落在目标的身体锚点上（而不是精灵框的固定位置），与远程特效的终点一致
  function addImpact(side, ttl = 650) {
    const box = spriteEl(side);
    if (!box) return;
    const fx = document.createElement('div');
    fx.className = 'fx fx-impact';
    fx.setAttribute('aria-hidden', 'true');
    const point = spritePoint(side, 'body');
    if (point && point.kind === 'body') {
      const br = box.getBoundingClientRect(), stage = point.arena.getBoundingClientRect();
      const sx = br.width / (box.offsetWidth || 1) || 1, sy = br.height / (box.offsetHeight || 1) || 1;
      fx.style.left = `${(point.x + stage.left - br.left) / sx - box.clientLeft}px`;
      fx.style.top = `${(point.y + stage.top - br.top) / sy - box.clientTop}px`;
    }
    box.appendChild(fx);
    setTimeout(() => fx.remove(), ttl);
  }
  function showBanner(text, className = '') {
    const arena = document.querySelector('.arena');
    if (!arena || !text) return;
    arena.querySelector('.fx-banner')?.remove();
    const banner = document.createElement('div');
    banner.className = `fx-banner ${className}`;
    banner.textContent = text;
    arena.appendChild(banner);
    setTimeout(() => banner.remove(), 1550);
  }
  const FX_TYPE_COLORS = { Normal: '#a8a77a', Fire: '#f08030', Water: '#6390f0', Electric: '#f7d02c', Grass: '#7ac74c', Ice: '#96d9d6', Fighting: '#c22e28', Poison: '#a33ea1', Ground: '#e2bf65', Flying: '#a98ff3', Psychic: '#f95587', Bug: '#a6b91a', Rock: '#b6a136', Ghost: '#735797', Dragon: '#6f35fc', Dark: '#705746', Steel: '#b7b7ce', Fairy: '#d685ad', Stellar: '#7dd3fc' };
  const MECHANIC_ICON_SRC = {
    mega: './src/ui/icons/mega.svg?v=0.9.0',
    dynamax: './src/ui/icons/dynamax.svg?v=0.9.0',
    gmax: './src/ui/icons/gigantamax.svg?v=0.9.0',
    gigantamax: './src/ui/icons/gigantamax.svg?v=0.9.0',
    tera: './src/ui/icons/tera.svg?v=0.9.0',
    z: './src/ui/icons/z.svg?v=0.9.0',
  };
  function spriteUrlForSnapshot(snap, side) {
    if (!snap?.speciesId) return '';
    const back = side === 0;
    const mapped = SPRITES[normId(snap.speciesId)];
    if (mapped) return back ? mapped.back : mapped.front;
    const pseudo = { speciesId: snap.speciesId, originalSpeciesId: snap.originalSpeciesId || snap.speciesId, speciesName: snap.rawName || snap.speciesId };
    return spriteAttempts(pseudo, back)[0] || '';
  }
  const waitMs = ms => new Promise(resolve => setTimeout(resolve, ms));
  const TRANSFORM_BANNERS = {
    mega: ['超级进化！', 'fx-mega-banner'],
    dynamax: ['极巨化！', 'fx-dynamax-banner'],
    gmax: ['超极巨化！', 'fx-dynamax-banner'],
    tera: ['太晶化！', 'fx-tera-banner'],
  };
  function showMechanicIcon(side, kind, ttl = 900) {
    const box = spriteEl(side);
    const spriteImg = box?.querySelector(':scope > img');
    if (!box || !spriteImg) return;
    box.querySelectorAll('.transform-icon-pop').forEach(el => el.remove());
    const pop = document.createElement('span');
    pop.className = 'transform-icon-pop icon-' + kind;
    pop.setAttribute('aria-hidden', 'true');
    pop.style.setProperty('--icon-duration', `${ttl}ms`);
    const icon = new Image();
    icon.alt = '';
    icon.src = MECHANIC_ICON_SRC[kind];
    pop.appendChild(icon);
    box.appendChild(pop);
    let frame = 0, lastSize = '', lastUrl = '';
    const follow = () => {
      if (!pop.isConnected || !spriteImg.isConnected) return;
      const url = spriteImg.currentSrc || spriteImg.src;
      if (spriteImg.complete && spriteImg.naturalWidth) {
        // Resize and source swaps can change the foot translation. Never reuse the old shape's geometry.
        const size = `${spriteImg.clientWidth}/${spriteImg.clientHeight}`;
        if (size !== lastSize || url !== lastUrl) {
          groundAlign(spriteImg, url);
          lastSize = size; lastUrl = url;
        }
        const br = box.getBoundingClientRect();
        const ir = spriteImg.getBoundingClientRect();
        const flip = parseFloat(getComputedStyle(spriteImg).getPropertyValue('--flip')) < 0;
        // Body-core measurements exclude transparent margins and downweight thin tails/wing tips.
        // Unmeasured fallback URLs use the known standing point, not an unrelated species' anchor.
        const anchor = SPRITE_BODY[url] || [SPRITE_FEETX[url] ?? .5, .5];
        const point = PKMSpriteAnchor.project({ rect: ir, width: spriteImg.clientWidth,
          height: spriteImg.clientHeight, naturalWidth: spriteImg.naturalWidth,
          naturalHeight: spriteImg.naturalHeight, anchor, flip });
        const sx = br.width / box.offsetWidth, sy = br.height / box.offsetHeight;
        if (point && sx > 0 && sy > 0) {
          pop.style.left = `${(point.x - br.left) / sx - box.clientLeft}px`;
          pop.style.top = `${(point.y - br.top) / sy - box.clientTop}px`;
          const extent = Math.max(point.contentWidth / sx, point.contentHeight / sy);
          const sizePx = PKMSpriteAnchor.iconSize(extent, kind);
          pop.style.width = pop.style.height = `${sizePx}px`;
          pop.style.visibility = 'visible';
        }
      } else pop.style.visibility = 'hidden';
      frame = requestAnimationFrame(follow);
    };
    follow();
    setTimeout(() => { cancelAnimationFrame(frame); pop.remove(); }, ttl);
  }
  function swapSpriteSrc(img, url, state) {
    if (!img || !url) return;
    if (state) applySpriteSize(img, state);
    if (img.src === url) { groundAlign(img, url); return; }
    const originalOnError = img.onerror;
    img.onerror = () => { img.onerror = originalOnError; };
    img.src = url;
    img.addEventListener('load', () => groundAlign(img, url), { once: true });
    setTimeout(() => { img.onerror = originalOnError; }, 500);
  }
  // 与参考卡相同的思路（自研实现）：同一张精灵图上 剪影 → 白光爆发时换图 → 冷却发光
  async function runTransformPhases(side, kind, opts = {}) {
    const box = spriteEl(side);
    const img = box?.querySelector('img');
    if (!box || !img) return;
    if (kind === 'mega') {
      img.classList.add('evo-silhouette');
      showMechanicIcon(side, 'mega', 1500);
      await waitMs(880);
      img.classList.remove('evo-silhouette');
      img.classList.add('evo-burst');
      await waitMs(110);
      if (opts.newUrl) swapSpriteSrc(img, opts.newUrl, opts.nextSprite);
      if (opts.prefix && opts.readyName) $(opts.prefix + '-name').textContent = opts.readyName;
      showBanner(...TRANSFORM_BANNERS.mega);
      await waitMs(230);
      img.classList.remove('evo-burst');
      img.classList.add('evo-finish');
      await waitMs(760);
      img.classList.remove('evo-finish');
    } else if (kind === 'dynamax') {
      applySpriteSize(img, { ...img._spriteState, dynamaxed: true, dynamaxForm:opts.gmax?'gmax':'' });
      box.classList.toggle('is-gmax',!!opts.gmax);
      box.classList.add('is-dynamax');
      groundAlign(img, img.currentSrc || img.src);
      img.classList.add('dynamax-burst');
      if(opts.gmax){addClassTemp(box,'gmax-arrival',1400);addFx(side,'gmax-groundwave','',1200);}
      showMechanicIcon(side, opts.gmax ? 'gmax' : 'dynamax', 950);
      setTimeout(() => showBanner(...TRANSFORM_BANNERS[opts.gmax ? 'gmax' : 'dynamax']), 200);
      if (opts.newUrl) {
        await waitMs(500);
        swapSpriteSrc(img, opts.newUrl, opts.nextSprite);
        if (opts.prefix && opts.readyName) $(opts.prefix + '-name').textContent = opts.readyName;
        await waitMs(340);
      } else await waitMs(840);
      if(opts.gmax)await waitMs(300);
      img.classList.remove('dynamax-burst');
    } else if (kind === 'tera') {
      img.style.setProperty('--mech', FX_TYPE_COLORS[opts.teraType] || '#67e8f9');
      img.classList.add('tera-burst');
      showMechanicIcon(side, 'tera', 950);
      showBanner(...TRANSFORM_BANNERS.tera);
      await waitMs(840);
      img.classList.remove('tera-burst');
      img.classList.add('state-tera');
    }
  }
  // Ｚ招式蓄势（自研表现）：精灵金色辉光颤动蓄满 + 身后光柱升起 + 脚下光环扩散 + 金色火花上升
  function playMechanicCharge(side, type) {
    const box = spriteEl(side);
    if (!box) return;
    const img = box.querySelector('img');
    if (img) {
      img.classList.remove('z-charge');
      void img.offsetWidth;
      img.classList.add('z-charge');
      setTimeout(() => img.classList.remove('z-charge'), 1080);
    }
    const pillar = document.createElement('div');
    pillar.className = 'fx-z-pillar';
    pillar.setAttribute('aria-hidden', 'true');
    box.appendChild(pillar);
    setTimeout(() => pillar.remove(), 1120);
    const ring = document.createElement('div');
    ring.className = 'fx-z-ring';
    ring.setAttribute('aria-hidden', 'true');
    box.appendChild(ring);
    setTimeout(() => ring.remove(), 1060);
    for (let i = 0; i < 6; i++) {
      const spark = document.createElement('span');
      spark.className = 'fx-z-spark';
      spark.textContent = '✦';
      spark.setAttribute('aria-hidden', 'true');
      spark.style.left = `${32 + Math.random() * 36}%`;
      spark.style.top = `${54 + Math.random() * 20}%`;
      spark.style.fontSize = `${19 + Math.random() * 14}px`;
      spark.style.animationDelay = `${i * 105 + Math.random() * 70}ms`;
      box.appendChild(spark);
      setTimeout(() => spark.remove(), 1900);
    }
    showMechanicIcon(side, 'z', 1020);
    showBanner('Ｚ招式！', 'fx-z-banner');
  }
  function showBeam(fromSide, type = 'Normal', big = false, points = null) {
    // v0.9.5: 光束从攻击方的嘴部（或身体）射向对方身体，而不是精灵框中心连线
    const from = points?.from || spritePoint(fromSide, fxOriginKind({ type }));
    const to = points?.to || spritePoint(fromSide === 0 ? 1 : 0, 'body');
    if (!from || !to) return;
    const arena = from.arena;
    const x1 = from.x, y1 = from.y, x2 = to.x, y2 = to.y;
    const dx = x2 - x1, dy = y2 - y1;
    const beam = document.createElement('div');
    beam.className = `fx-beam type-${String(type || 'Normal').toLowerCase()}${big ? ' fx-beam-big' : ''}`;
    beam.style.left = `${x1}px`;
    beam.style.top = `${y1 - (big ? 9.5 : 5)}px`; // 光束厚度的一半，让光束中心线正好穿过嘴部
    beam.style.width = `${Math.hypot(dx, dy)}px`;
    beam.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
    arena.appendChild(beam);
    setTimeout(() => beam.remove(), big ? 900 : 680);
  }
  /* ---------- 招式特效：按属性生成不同的弹道/命中表现（自研粒子） ---------- */
  const TYPE_FX = {
    Fire: { travel: 'flame', shape: '', colors: ['#fff3a6', '#fb923c', '#dc2626'] },
    Water: { travel: 'stream', shape: 'bubble', colors: ['#e0f2fe', '#0ea5e9', '#1d4ed8'] },
    Electric: { travel: 'bolt', shape: 'star', colors: ['#fef9c3', '#facc15', '#f59e0b'] },
    Grass: { travel: 'proj', shape: 'leaf', colors: ['#dcfce7', '#4ade80', '#15803d'] },
    Ice: { travel: 'proj', shape: 'shard', colors: ['#ffffff', '#22d3ee', '#0369a1'] },
    Fighting: { travel: 'burst', shape: 'star', colors: ['#ffedd5', '#fb923c', '#c2410c'] },
    Poison: { travel: 'proj', shape: 'bubble', colors: ['#f3e8ff', '#c084fc', '#7e22ce'] },
    Ground: { travel: 'rain', shape: 'rock', colors: ['#fef3c7', '#d97706', '#92400e'] },
    Flying: { travel: 'slash', shape: 'feather', colors: ['#ffffff', '#c7d2fe', '#6366f1'] },
    Psychic: { travel: 'wave', shape: '', colors: ['#fce7f3', '#f472b6', '#a21caf'] },
    Bug: { travel: 'proj', shape: '', colors: ['#fef9c3', '#a3e635', '#4d7c0f'] },
    Rock: { travel: 'rain', shape: 'rock', colors: ['#f5f5f4', '#a8a29e', '#44403c'] },
    Ghost: { travel: 'proj', shape: 'wisp', colors: ['#ede9fe', '#8b5cf6', '#4c1d95'] },
    Dragon: { travel: 'beam', shape: '', colors: ['#ede9fe', '#818cf8', '#6d28d9'] },
    Dark: { travel: 'slash', shape: 'shard', colors: ['#c4b5fd', '#6d28d9', '#171321'] },
    Steel: { travel: 'proj', shape: 'shard', colors: ['#ffffff', '#cbd5e1', '#475569'] },
    Fairy: { travel: 'proj', shape: 'star', colors: ['#fdf2f8', '#f9a8d4', '#db2777'] },
    Normal: { travel: 'proj', shape: '', colors: ['#ffffff', '#e5e7eb', '#6b7280'] },
    Stellar: { travel: 'proj', shape: 'star', colors: ['#fef08a', '#f472b6', '#0284c7'] },
  };
  const fxRand = (a, b) => a + Math.random() * (b - a);
  /* v0.9.5: 技能特效的起点/终点取自精灵本体上的锚点，而不是精灵框（345×320 网格格子）的中心。
     - 'mouth'：嘴部锚点（离线用 tools/measure-mouth-anchors.py 测量，写入 sprite-map.json 的 frontMouth/backMouth）
     - 'body' ：身体核心锚点（与捕捉/机制图标共用的 frontBody/backBody）
     锚点是 GIF 画布的比例坐标，PKMSpriteAnchor.project 会把 object-fit 留白、缩放、位移和 --flip 一并算进去。 */
  const MOUTH_TYPES = new Set(['Fire', 'Water', 'Ice', 'Dragon', 'Normal', 'Poison', 'Steel']);
  const fxOriginKind = move => (MOUTH_TYPES.has(move?.type) ? 'mouth' : 'body');
  const isBackSpriteUrl = url => /-back\//.test(String(url || ''));
  function spriteAnchor(url, kind) {
    const body = SPRITE_BODY[url] || [.5, .5];
    if (kind !== 'mouth') return body;
    if (Array.isArray(SPRITE_MOUTH[url])) return SPRITE_MOUTH[url];
    // 未测量的图：头部通常在身体核心的斜上方、朝向对手的一侧
    const back = isBackSpriteUrl(url);
    return [Math.max(0, Math.min(1, body[0] + (back ? .2 : -.15))), Math.max(0, body[1] - .25)];
  }
  function spritePoint(side, kind = 'body') {
    const arena = document.querySelector('.arena');
    const el = spriteEl(side);
    if (!arena || !el) return null;
    const stage = arena.getBoundingClientRect(), r = el.getBoundingClientRect();
    const base = { arena, w: arena.clientWidth, h: arena.clientHeight };
    const boxCenter = { ...base, kind: 'box', x: r.left + r.width / 2 - stage.left, y: r.top + r.height / 2 - stage.top };
    const img = el.querySelector('img');
    if (!img || !img.naturalWidth || !img.clientWidth) return boxCenter;
    const url = img.currentSrc || img.src;
    const point = PKMSpriteAnchor.project({ rect: img.getBoundingClientRect(), width: img.clientWidth, height: img.clientHeight,
      naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, anchor: spriteAnchor(url, kind),
      flip: parseFloat(getComputedStyle(img).getPropertyValue('--flip')) < 0 });
    if (!point) return boxCenter;
    return { ...base, kind, x: point.x - stage.left, y: point.y - stage.top };
  }
  function spawnP(arena, x, y, o) {
    const p = document.createElement('span');
    p.className = 'fx-p' + (o.shape ? ' ' + o.shape : '');
    p.setAttribute('aria-hidden', 'true');
    const size = o.size || 12;
    p.style.left = `${x}px`; p.style.top = `${y}px`;
    p.style.width = `${size}px`; p.style.height = `${size}px`;
    p.style.background = `radial-gradient(circle at 38% 32%, ${o.colors[0]}, ${o.colors[1]} 55%, ${o.colors[2]})`;
    p.style.setProperty('--dx', `${o.dx || 0}px`);
    p.style.setProperty('--dy', `${o.dy || 0}px`);
    p.style.setProperty('--s', String(o.s || 1));
    p.style.setProperty('--rot', `${o.rot ?? fxRand(-70, 70)}deg`);
    p.style.setProperty('--dur', `${o.dur || 0.55}s`);
    if (o.delay) p.style.animationDelay = `${o.delay}ms`;
    arena.appendChild(p);
    setTimeout(() => p.remove(), (o.dur || 0.55) * 1000 + (o.delay || 0) + 120);
  }
  function burstAt(arena, x, y, cfg, big = false, n = 10) {
    const count = Math.round(n * (big ? 1.6 : 1));
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + fxRand(-0.3, 0.3);
      const dist = fxRand(38, 92) * (big ? 1.35 : 1);
      spawnP(arena, x, y, { shape: cfg.shape, colors: cfg.colors, size: fxRand(8, 17) * (big ? 1.3 : 1), dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist - 8, dur: fxRand(0.42, 0.62), s: fxRand(0.7, 1.15) });
    }
  }
  function playMoveFx(fromSide, move, opts = {}) {
    if (!move) return;
    const big = !!opts.big;
    const cfg = TYPE_FX[move.type] || TYPE_FX.Normal;
    const targetSelf = /self|ally|field/.test(move.target || '') || move.target === 'all';
    const foeSide = fromSide === 0 ? 1 : 0;
    // 远程特效从嘴部（火/水/冰/龙/一般/毒/钢）或身体（其余属性）发出，终点是目标的身体核心
    const from = spritePoint(fromSide, fxOriginKind(move)), to = spritePoint(targetSelf ? fromSide : foeSide, 'body');
    if (!from || !to) return;
    const arena = from.arena;
    const dx = to.x - from.x, dy = to.y - from.y;
    const burstLater = ms => setTimeout(() => burstAt(arena, to.x, to.y, cfg, big), ms);
    if (move.category === 'Status') {
      const host = spriteEl(targetSelf ? fromSide : foeSide);
      if (host) {
        const ring = document.createElement('div');
        ring.className = 'fx fx-status-aura';
        ring.style.setProperty('--sc', cfg.colors[1]);
        ring.setAttribute('aria-hidden', 'true');
        host.appendChild(ring);
        setTimeout(() => ring.remove(), 950);
      }
      for (let i = 0; i < 6; i++) spawnP(arena, to.x + fxRand(-46, 46), to.y + fxRand(6, 42), { shape: cfg.shape, colors: cfg.colors, size: fxRand(7, 12), dx: fxRand(-8, 8), dy: fxRand(-72, -40), dur: fxRand(0.6, 0.85), delay: i * 60 });
      return;
    }
    if (move.category === 'Physical') { burstAt(arena, to.x, to.y, cfg, big, 12); return; }
    switch (cfg.travel) {
      case 'flame': {
        const n = big ? 22 : 15;
        for (let i = 0; i < n; i++) {
          const t = 0.25 + 0.75 * (i / n) + fxRand(-0.05, 0.05);
          spawnP(arena, from.x, from.y, { shape: 'flame', colors: cfg.colors, size: fxRand(19, 36) * (big ? 1.35 : 1), dx: dx * t + fxRand(-14, 14), dy: dy * t + fxRand(-20, 4), dur: fxRand(0.34, 0.5), delay: i * 21, s: fxRand(0.8, 1.25) });
        }
        burstLater(big ? 420 : 330);
        break;
      }
      case 'bolt': {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'fx-bolt');
        svg.setAttribute('viewBox', `0 0 ${from.w} ${from.h}`);
        const jag = jit => { const pts = []; const seg = 7; for (let i = 0; i <= seg; i++) { const t = i / seg; pts.push(`${(from.x + dx * t + (i && i < seg ? fxRand(-jit, jit) : 0)).toFixed(1)},${(from.y + dy * t + (i && i < seg ? fxRand(-jit, jit) : 0)).toFixed(1)}`); } return pts.join(' '); };
        svg.innerHTML = `<polyline points="${jag(15)}" fill="none" stroke="#facc15" stroke-width="${big ? 7 : 5}" stroke-linejoin="round" opacity="0.85"/><polyline points="${jag(15)}" fill="none" stroke="#fffbe6" stroke-width="2.2" stroke-linejoin="round"/>`;
        arena.appendChild(svg);
        setTimeout(() => svg.remove(), 560);
        burstLater(210);
        break;
      }
      case 'rain': {
        const n = big ? 13 : 9;
        for (let i = 0; i < n; i++) spawnP(arena, to.x + fxRand(-58, 58), to.y - fxRand(105, 150), { shape: 'rock', colors: cfg.colors, size: fxRand(11, 20) * (big ? 1.3 : 1), dx: fxRand(-8, 8), dy: fxRand(130, 165), dur: fxRand(0.4, 0.55), delay: i * 36, rot: fxRand(90, 260) });
        burstLater(430);
        break;
      }
      case 'slash': {
        for (let i = 0; i < (big ? 4 : 3); i++) {
          const sEl = document.createElement('div');
          sEl.className = 'fx-slash';
          sEl.setAttribute('aria-hidden', 'true');
          sEl.style.left = `${to.x - 58}px`; sEl.style.top = `${to.y + (i - 1) * 22}px`;
          sEl.style.setProperty('--sc', cfg.colors[1]);
          sEl.style.setProperty('--r', `${[-26, 10, -42, 20][i]}deg`);
          sEl.style.animationDelay = `${i * 95}ms`;
          arena.appendChild(sEl);
          setTimeout(() => sEl.remove(), 800);
        }
        burstLater(300);
        break;
      }
      case 'wave': {
        for (let i = 0; i < 3; i++) {
          const ringEl = document.createElement('div');
          ringEl.className = 'fx-wave-ring';
          ringEl.setAttribute('aria-hidden', 'true');
          ringEl.style.left = `${to.x}px`; ringEl.style.top = `${to.y}px`;
          ringEl.style.setProperty('--sc', cfg.colors[1]);
          ringEl.style.animationDelay = `${i * 100}ms`;
          arena.appendChild(ringEl);
          setTimeout(() => ringEl.remove(), 950);
        }
        for (let i = 0; i < 5; i++) { const ox = fxRand(-85, 85), oy = fxRand(-60, 60); spawnP(arena, to.x + ox, to.y + oy, { colors: cfg.colors, size: fxRand(9, 14), dx: -ox * 0.85, dy: -oy * 0.85, dur: 0.5, delay: i * 45 }); }
        burstLater(380);
        break;
      }
      case 'beam': {
        showBeam(fromSide, move.type, big, { from, to });
        const n = big ? 10 : 7;
        for (let i = 0; i < n; i++) spawnP(arena, from.x, from.y, { colors: cfg.colors, size: fxRand(9, 15) * (big ? 1.3 : 1), dx: dx * fxRand(0.55, 1), dy: dy * fxRand(0.55, 1) + fxRand(-12, 12), dur: fxRand(0.4, 0.55), delay: i * 30 });
        burstLater(330);
        break;
      }
      default: {
        const n = big ? 14 : 11;
        for (let i = 0; i < n; i++) spawnP(arena, from.x, from.y, { shape: cfg.shape, colors: cfg.colors, size: (cfg.shape === 'shard' ? fxRand(16, 27) : cfg.shape === 'bubble' ? fxRand(12, 20) : fxRand(10, 18)) * (big ? 1.35 : 1), dx: dx + fxRand(-16, 16), dy: dy + fxRand(-34, 6), dur: fxRand(0.48, 0.66), delay: i * 22 });
        burstLater(360);
      }
    }
    if (big) setTimeout(() => burstAt(arena, to.x, to.y, TYPE_FX.Stellar, true, 8), 430);
  }
  function castImg(side, type) {
    const img = spriteEl(side)?.querySelector('img');
    if (!img) return;
    img.style.setProperty('--mech', FX_TYPE_COLORS[type] || '#facc15');
    addClassTemp(img, 'fx-cast', 540);
  }
  // 退场：精灵闪烁着沉降消失（参考角色卡的节奏，自研实现），随后保持隐藏直到被换下
  function playRecall(side) {
    const img = spriteEl(side)?.querySelector('img');
    if (!img) return;
    img.classList.remove('fx-gone', 'fx-blip');
    void img.offsetWidth;
    img.classList.add('fx-blip');
    setTimeout(() => { img.classList.remove('fx-blip'); img.classList.add('fx-gone'); }, 730);
  }
  // 登场：我方自下而上弹簧升起、敌方自上而下坠落站稳（参考角色卡的节奏，自研实现）
  function playSendOut(side) {
    const img = spriteEl(side)?.querySelector('img');
    if (!img) return;
    const cls = side === 0 ? 'fx-enter-rise' : 'fx-enter-drop';
    img.classList.remove('fx-gone', 'fx-enter-rise', 'fx-enter-drop');
    void img.offsetWidth;
    img.classList.add(cls);
    setTimeout(() => img.classList.remove(cls), side === 0 ? 600 : 700);
  }
  function playTurnAnimations(before, chosen, logStart) {
    if (!before || !battle) return;
    const afterSnap = snapshotBattle();
    if (!afterSnap) return;
    const logs = battle.log.slice(logStart || 0);
    const beforeActive = side => before.teams[side]?.[before.active[side]];
    const afterActive = side => afterSnap.teams[side]?.[afterSnap.active[side]];
    let delay = 40;
    // 变身處理：先在第一幀繪製前把精靈切回舊形態剪影，避免新形態先閃現出來
    // The engine resolves end-of-turn expiry before animation playback. Keep the
    // previous giant form through its final attack; restore only after all FX.
    const expiringGiants = [];
    for (const side of [0, 1]) {
      const b = beforeActive(side), a = afterActive(side);
      if (b?.dynamaxed && a && !a.dynamaxed && before.active[side] === afterSnap.active[side]) {
        setSprite(spriteEl(side), b, side === 0);
        expiringGiants.push({side, a, b});
      }
    }
    const transforms = {};
    for (const side of [0, 1]) {
      const afterIdx = afterSnap.active[side];
      const b = before.teams[side]?.[afterIdx], a = afterSnap.teams[side]?.[afterIdx];
      if (!b || !a) continue;
      let kind = null;
      if (a.isMega && !b.isMega) kind = 'mega';
      else if (a.dynamaxed && !b.dynamaxed) kind = 'dynamax';
      else if (a.terastallized && !b.terastallized) kind = 'tera';
      if (!kind) {
        // Expiry is deferred until the attack and hit animations have finished.
        continue;
      }
      if (side === 0 && chosen?.preAnimated) continue;
      transforms[side] = { kind, b, a };
      const box = spriteEl(side), img = box?.querySelector('img');
      if (!img) continue;
      if (kind === 'mega' || (kind === 'dynamax' && normId(b.speciesId) !== normId(a.speciesId))) {
        transforms[side].newUrl = img.currentSrc || img.src;
        const oldUrl = spriteUrlForSnapshot(b, side);
        if (oldUrl && oldUrl !== transforms[side].newUrl) swapSpriteSrc(img, oldUrl, b);
        $(side === 0 ? 'p-name' : 'e-name').textContent = b.nameText || b.name;
      }
      if (kind === 'mega') img.classList.add('evo-silhouette');
      if (kind === 'tera') img.style.setProperty('--mech', FX_TYPE_COLORS[a.teraType] || '#67e8f9');
    }
    for (const side of [0, 1]) {
      const t = transforms[side];
      if (t) {
        const at = delay, prefix = side === 0 ? 'p' : 'e';
        if (t.kind === 'mega') { setTimeout(() => runTransformPhases(side, 'mega', { newUrl: t.newUrl, nextSprite: t.a, prefix, readyName: t.a.nameText || t.a.name }), at); delay += 1500; }
        else if (t.kind === 'dynamax') { setTimeout(() => runTransformPhases(side, 'dynamax', { gmax: t.a.dynamaxForm === 'gmax', newUrl: t.newUrl, nextSprite: t.a, prefix, readyName: t.a.nameText || t.a.name }), at); delay += t.a.dynamaxForm==='gmax'?1280:980; }
        else if (t.kind === 'tera') { setTimeout(() => runTransformPhases(side, 'tera', { teraType: t.a.teraType }), at); delay += 980; }
      }
      if (before.active[side] !== afterSnap.active[side]) {
        const at = delay + 60;
        // 被击败后自动换上的：先把倒下的旧精灵切回来播回收，再送出新精灵
        const oldMon = afterSnap.teams[side]?.[before.active[side]]; // 回合后同一只的状态（是否刚被击败）
        const img0 = spriteEl(side)?.querySelector('img');
        if (oldMon?.fainted && chosen?.kind !== 'switch' && img0) {
          const newUrl = img0.currentSrc || img0.src;
          const oldUrl = spriteUrlForSnapshot(oldMon, side);
          if (oldUrl && oldUrl !== newUrl) {
            swapSpriteSrc(img0, oldUrl, oldMon);
            setTimeout(() => playRecall(side), at + 240);
            setTimeout(() => { swapSpriteSrc(img0, newUrl, afterSnap.teams[side]?.[afterSnap.active[side]]); playSendOut(side); }, at + 1000);
          } else setTimeout(() => playSendOut(side), at);
        } else setTimeout(() => playSendOut(side), at);
      }
    }

    const foeBefore = beforeActive(1), foeAfter = afterActive(1);
    const meBefore = beforeActive(0), meAfter = afterActive(0);
    const foeDamaged = !!(foeBefore && foeAfter && before.active[1] === afterSnap.active[1] && foeAfter.hp < foeBefore.hp);
    const meDamaged = !!(meBefore && meAfter && before.active[0] === afterSnap.active[0] && meAfter.hp < meBefore.hp);
    if (chosen?.kind === 'move') {
      const at = delay + 70;
      const isZ = chosen.mechanic === 'z';
      setTimeout(() => {
        if (isZ) {
          playMechanicCharge(0, chosen.type);
          setTimeout(() => {
            playMoveFx(0, chosen, { big: true });
            if (foeDamaged) setTimeout(() => { animateImg(1, 'fx-hit', 720); addImpact(1); }, 340);
          }, 980);
        } else {
          if (chosen.category === 'Physical') animateImg(0, 'fx-attack', 680);
          else castImg(0, chosen.type);
          playMoveFx(0, chosen);
          if (foeDamaged) setTimeout(() => { animateImg(1, 'fx-hit', 720); addImpact(1); }, 330);
        }
      }, at);
      delay = at + (isZ ? 1500 : 470);
    } else if (chosen?.kind === 'switch') {
      delay += 180;
    }

    const foeRaw = foeBefore?.rawName || '';
    const enemyUsedMove = foeRaw && logs.some(line => line.includes(`${foeRaw} 使用了`));
    if (enemyUsedMove && afterSnap.winner === null) {
      const enemyLine = logs.find(line => line.includes(`${foeRaw} 使用了`)) || '';
      const enemyMoveName = /使用了\s+([^!！。]+)/.exec(enemyLine)?.[1]?.trim();
      const enemyMove = enemyMoveName ? Object.values(PKMBattle._moves || {}).find(move => move.name === enemyMoveName) : null;
      const at = delay + 120;
      setTimeout(() => {
        const mv = enemyMove || { type: 'Normal', category: 'Physical', target: 'normal' };
        if (mv.category === 'Physical') animateImg(1, 'fx-attack', 680);
        else castImg(1, mv.type);
        playMoveFx(1, mv);
        if (meDamaged) setTimeout(() => { animateImg(0, 'fx-hit', 720); addImpact(0); }, 330);
      }, at);
      delay = at + 360;
    }

    setTimeout(() => {
      for (const side of [0, 1]) {
        const b = beforeActive(side), a = afterActive(side);
        if (!b || !a || before.active[side] !== afterSnap.active[side]) continue;
        if (a.fainted && !b.fainted) playRecall(side);
        else if (a.hp > b.hp) { animateImg(side, 'fx-heal', 900); addFx(side, 'fx-heal-plus', '＋', 900); }
        else if (a.hp < b.hp && !((side === 1 && foeDamaged) || (side === 0 && meDamaged))) animateImg(side, 'fx-hit', 650);
        if (a.status && a.status !== b.status) addFx(side, 'fx-status', PKMBattle.STATUS_NAMES[a.status] || '异常', 1200);
      }
    }, delay + 260);
    if (expiringGiants.length) {
      setTimeout(() => {
        for (const {side, a, b} of expiringGiants) {
          const oldImg=spriteEl(side).querySelector('img');
          const oldSize = oldImg ? oldImg.clientWidth*(parseFloat(getComputedStyle(oldImg).scale)||1) : 1;
          const nextProfile = PKMSpriteSizing.profile(PKMBattle._dex, a.speciesId, a);
          const nextSize = (oldImg?.clientWidth||1)/PKMSpriteSizing.profile(PKMBattle._dex,b.speciesId,b).ratio*nextProfile.ratio*(a.isMega?1.07:1);
          setSprite(spriteEl(side), a, side === 0);
          spriteEl(side).querySelector('img')?.style.setProperty('--shrink-from', String(oldSize / nextSize));
          animateImg(side, 'fx-shrink', 700);
        }
      }, delay + 1300);
    }
    return delay + (expiringGiants.length ? 2160 : 1560);
  }

  /* ---------- Action hierarchy / prototype world save ---------- */
  function openCollection() {
    renderCollection();
    $('collection-section').open = true;
    $('collection-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function showCommand(view) {
    if (!battle || animating || (battle.pendingSwitch !== null && view !== 'switch')) return;
    menuView = view;
    if (view !== 'fight') selectedMechanic = null;
    render();
  }
  // v0.9.1: a resolved action keeps the player on the panel they acted from. Moves and every
  // kind of switch land on the move list (the next thing to pick is almost always a move);
  // a failed throw keeps the ball bag open. Faint / battle end still override in renderCommands.
  function panelForAction(action) { return action?.kind === 'capture' ? 'balls' : 'fight'; }
  function viewAfterAction(action) { return battle && battle.pendingSwitch !== null ? 'switch' : panelForAction(action); }
  function renderCommands() {
    if (!battle) return;
    const ended = battle.winner !== null && !animating;
    if (battle.pendingSwitch !== null && !animating) menuView = 'switch';
    if (ended) menuView = 'end';
    const view = menuView;
    for (const [id, value] of [['command-home','home'],['command-fight-panel','fight'],['command-switch-panel','switch'],['command-balls-panel','balls'],['command-end','end']]) $(id).hidden = view !== value;
    $('command-title').textContent = animating ? '行动进行中…' : ended ? (battle.outcome === 'captured' ? '收服成功！' : '本场战斗已结束')
      : battle.pendingSwitch !== null ? '请选择下一只出战宝可梦' : ({home: `${displayPokemonName(battle.cur(0))}，要做什么？`, fight: `${displayPokemonName(battle.cur(0))} · 选择招式`, switch: '选择出战宝可梦', balls: '选择精灵球'}[view]);
    const isWild = battle.encounterType === 'wild';
    $('encounter-tag').textContent = `${typeLabel || (isWild ? '野生遭遇' : '训练家对战')}${formatTag ? ' · ' + formatTag : ''} · 第 ${battle.turnCount + (ended ? 0 : 1)} 回合`;
    $('encounter-tag').title = formatRule || '';
    $('encounter-tag').classList.toggle('wild', isWild);
    $('command-back').hidden = view === 'home' || view === 'end' || battle.pendingSwitch !== null;
    $('command-back').disabled = animating;
    for (const id of ['command-fight','command-switch','command-balls']) $(id).disabled = animating || ended;
    $('capture-availability').textContent = isWild ? '投出精灵球 / 捕获伙伴' : '训练家的宝可梦不可捕获';
    $('command-balls').classList.toggle('capture-unavailable', !isWild);
    const mst = animating || ended ? null : mechanicState(battle.cur(0));
    const fightHint = mst?.state === 'armed' ? `已装备${mst.name}：选择招式后发动${mst.short}；再点道具可取消。` : mst?.state === 'ready' ? `点击血条框左侧的${mst.name}可${mst.short}；选中招式后才开始行动。` : '返回不消耗回合；选中招式后才开始行动。';
    $('command-status').textContent = commandMessage || (animating ? '请等待当前演出结束。' : view === 'home' ? '先选择行动，再决定招式、队友或精灵球。' : view === 'fight' ? fightHint : '');
    if (ended && hostMode) $('command-end-text').textContent = battle.outcome === 'captured'
      ? `收服了${displayPokemonName(battle.cur(1))}！结果已回传角色卡，点右上角「返回剧情」继续。`
      : '对战结束，结果已回传角色卡。点右上角「返回剧情」继续。';
    else if (ended) $('command-end-text').textContent = battle.outcome === 'captured'
      ? `${displayPokemonName(battle.cur(1))} 已收入仓库${worldStore.error ? '（当前仅临时保存，请导出）' : '并保存到本机'}。可在仓库选择位置加入下场编队。`
      : isWild ? '这次遭遇结束了。可以继续寻找新的野生宝可梦。' : '对战结束。也可以进入野生遭遇，收服新的伙伴。';
    for (const id of ['btn-start','btn-wild','btn-next-wild','btn-config','sel-enemy','sel-diff','btn-supply','btn-import-save','btn-box','btn-end-box']) $(id).disabled = animating;
    if (animating) document.querySelectorAll('#mechanics button, #moves button, #switches button, #ball-list button').forEach(b => { b.disabled = true; });
    $('action-card').setAttribute('aria-busy', String(animating));
  }
  function renderBalls() {
    const root = $('ball-list'); root.replaceChildren();
    const reason = worldStore.blocked ? worldStore.error : worldStore.state.box.length >= 1000 ? '仓库已满，暂不能继续捕获。' : battle.captureReason();
    $('capture-hint').textContent = reason || '原型规则：体力越低越容易捕获，异常状态也有加成。投球失败会消耗本回合。';
    for (const ball of Object.values(PKMCapture.BALLS)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'ball-choice'; button.dataset.ball = ball.id;
      const mark = document.createElement('span'); mark.className = 'mini-ball ball-' + ball.id; mark.setAttribute('aria-hidden','true');
      const body = document.createElement('span');
      const title = document.createElement('strong'); title.textContent = ball.name;
      const desc = document.createElement('small'); desc.textContent = ball.description;
      const stock = document.createElement('b'); stock.textContent = `×${battle.ballStock[ball.id] || 0}`;
      const odds = document.createElement('em'); odds.textContent = reason ? '不可捕获' : `约 ${Math.round(PKMCapture.chance(battle.cur(1), ball.id)*100)}% · 投出`;
      body.append(title,desc); button.append(mark,body,stock,odds);
      button.disabled = animating || !!reason || !!battle.captureReason(ball.id);
      button.title = reason || battle.captureReason(ball.id) || '确认使用一枚' + ball.name;
      button.onclick = () => captureAction(ball.id);
      root.appendChild(button);
    }
  }
  function unlockAfterAnimations(before, action, logStart) {
    const ref = battle;
    const duration = playTurnAnimations(before, action, logStart) || 1400;
    setTimeout(() => {
      if (battle !== ref) return;
      animating = false; commandMessage = ''; menuView = viewAfterAction(action); after();
    }, duration);
  }
  async function captureAction(ball) {
    if (!battle || animating || worldStore.blocked || worldStore.state.box.length >= 1000) return;
    battle.ballStock = { ...worldStore.state.balls };
    const reason = battle.captureReason(ball);
    if (reason) { commandMessage = reason; render(); return; }
    const ref = battle, before = snapshotBattle(), logStart = battle.log.length;
    const img = $('e-sprite').querySelector(':scope > img'), player = $('p-sprite').querySelector(':scope > img');
    animating = true; commandMessage = '正在投出精灵球…'; renderCommands();
    battle.turn({ kind: 'capture', ball });
    const attempt = battle.lastCapture;
    if (!attempt?.allowed) { animating = false; commandMessage = attempt?.reason || '暂时无法投球。'; render(); return; }
    const record = attempt.success ? { id: `${encounterId}:${battle.turnCount}`, caughtAt: new Date().toISOString(), ball,
      spec: battle.capture.spec, hpAtCapture: battle.capture.hpAtCapture, statusAtCapture: battle.capture.statusAtCapture } : null;
    // Commit before the async animation: reload/double-click cannot repeat the reward.
    worldStore.recordAttempt(battle.ballStock, record);
    for (const id of Object.keys(PKMCapture.BALLS)) {
      const count = document.querySelector(`[data-ball="${id}"] > b`);
      if (count) count.textContent = `×${battle.ballStock[id]}`;
    }
    try {
      if (img?.naturalWidth && player?.naturalWidth) {
        const r = img.getBoundingClientRect();
        const point = PKMSpriteAnchor.project({ rect:r, width:img.clientWidth, height:img.clientHeight,
          naturalWidth:img.naturalWidth, naturalHeight:img.naturalHeight,
          anchor:SPRITE_BODY[img.currentSrc || img.src], flip:parseFloat(getComputedStyle(img).getPropertyValue('--flip'))<0 });
        await PKMCaptureFX.play({ arena:document.querySelector('.arena'), player, target:img, point:point || {x:r.left+r.width/2,y:r.top+r.height/2}, attempt,
          name:displayPokemonName(ref.cur(1)), onPhase:text=>{ commandMessage=text; $('command-status').textContent=text; } });
      } else await waitMs(600);
    } catch (error) { console.warn('[PKM] capture animation fallback', error); }
    if (battle !== ref) return;
    selectedMechanic = null;
    renderCollection();
    if (attempt.success) {
      animating = false; commandMessage = worldStore.error || ''; menuView = 'end'; after();
    } else {
      commandMessage = '没有抓住，野生宝可梦开始行动。'; menuView = 'balls'; after();
      unlockAfterAnimations(before, { kind:'capture' }, logStart);
    }
  }
  function renderCollection() {
    if (!$('collection-list')) return;
    $('box-count').textContent = $('collection-count').textContent = String(worldStore.state.box.length);
    $('bag-summary').textContent = Object.values(PKMCapture.BALLS).map(b=>`${b.name} ×${worldStore.state.balls[b.id]}`).join(' · ');
    $('save-warning').hidden = !worldStore.error; $('save-warning').textContent = worldStore.error;
    const root = $('collection-list'); root.replaceChildren();
    if (!worldStore.state.box.length) {
      const empty = document.createElement('div'); empty.className = 'collection-empty';
      empty.innerHTML = '<span class="mini-ball" aria-hidden="true"></span><h4>第一位新伙伴，等你相遇</h4><p>点击上方“野生遭遇”，在战斗中选择“精灵球”。捕获成功后会出现在这里。</p>';
      root.appendChild(empty); return;
    }
    const team = $('editor-player')?.children.length ? readEditor('player') : [];
    const newest = worldStore.state.box.slice().reverse();
    for (const record of newest.slice(0, collectionLimit)) {
      const card = document.createElement('article'); card.className = 'box-card'; card.dataset.captureId = record.id;
      const art = document.createElement('div'); art.className = 'box-art';
      const image = new Image(); image.alt = zhSpecies(record.spec.species, record.spec.species); image.loading = 'lazy';
      image.src = SPRITES[record.spec.species]?.front || ''; image.onerror = () => { image.remove(); art.textContent = '？'; }; art.appendChild(image);
      const content = document.createElement('div'); content.className='box-info';
      const title = document.createElement('h4'); title.textContent = record.spec.nickname || zhSpecies(record.spec.species,record.spec.species);
      const sub = document.createElement('p'); sub.textContent = `等级 ${record.spec.level} · ${PKMCapture.BALLS[record.ball]?.name || '捕获记录'}`;
      const moves = document.createElement('small'); moves.textContent = record.spec.moves.map(id=>zhMove(id,id)).join(' / ');
      const actions = document.createElement('div'); actions.className='box-actions';
      const select = document.createElement('select'); select.setAttribute('aria-label','选择加入的队伍位置');
      const placeholder = document.createElement('option'); placeholder.value=''; placeholder.textContent='选择队伍位置'; select.appendChild(placeholder);
      for (let i=0;i<Math.min(6,team.length+1);i++) { const o=document.createElement('option'); o.value=String(i); o.textContent=`#${i+1} ${team[i] ? zhSpecies(team[i].species,team[i].species) : '空位'}`; select.appendChild(o); }
      const add = document.createElement('button'); add.type='button'; add.textContent='加入编队'; add.disabled=true;
      select.onchange=()=>{add.disabled=select.value==='';};
      add.onclick=()=>{
        if (animating) { $('collection-message').textContent='请等待当前行动结束再调整编队。'; return; }
        const index=Number(select.value), specs=readEditor('player');
        if (select.value==='' || index<0 || index>5 || index>specs.length) return;
        if (specs[index] && !confirm(`替换编队第${index+1}位的${zhSpecies(specs[index].species,specs[index].species)}？仅下场对战生效，捕获记录仍保留在仓库。`)) return;
        const spec=JSON.parse(JSON.stringify(record.spec)); spec.captureId = record.id;
        spec.ability=PKMBattle._dex[spec.species]?.abilities?.find(a=>normId(a)===normId(spec.ability)) || spec.ability;
        specs[index]=spec; renderEditor('player',specs); $('chk-custom-player').checked=true;
        const saved=saveEditorSpecs(false); showValidate('捕获伙伴已加入编队，下场对战生效。');
        $('collection-message').textContent=saved ? `已把${title.textContent}加入第${index+1}位，下一场开始时使用；仓库保留捕获记录。` : '已修改本页编队，但写入本机失败；请勿关闭页面。';
        renderCollection();
      };
      actions.append(select,add); content.append(title,sub,moves,actions); card.append(art,content); root.appendChild(card);
    }
    if (newest.length>collectionLimit) {const more=document.createElement('button');more.type='button';more.textContent=`加载更多（共${newest.length}只）`;more.onclick=()=>{collectionLimit+=48;renderCollection();};root.appendChild(more);}
  }
  function beginWild() {
    if (animating) return;
    $('sel-enemy').value='wild'; $('chk-custom-enemy').checked=false;
    startBattle(null);
    document.querySelector('.battle-screen').scrollIntoView({ behavior:'smooth',block:'start' });
  }
  function initWorldControls() {
    $('command-fight').onclick=()=>showCommand('fight'); $('command-switch').onclick=()=>showCommand('switch');
    $('command-balls').onclick=()=>showCommand('balls'); $('command-back').onclick=()=>showCommand('home');
    for(const id of ['btn-box','btn-end-box']) $(id).onclick=openCollection;
    for(const id of ['btn-wild','btn-next-wild']) $(id).onclick=beginWild;
    $('btn-supply').onclick=()=>{
      if(animating || worldStore.blocked) return;
      if(!confirm('领取原型测试补给？球袋补至精灵球20、超级球10、高级球5，仓库不会清空。'))return;
      worldStore.supply(); if(battle)battle.ballStock={...worldStore.state.balls}; renderCollection(); if(battle)render();
    };
    $('btn-export-save').onclick=()=>{
      let text=JSON.stringify(worldStore.state,null,2);
      if(worldStore.blocked){try{text=worldStore.storage.getItem(PKMWorldSave.KEY)||text;}catch(_) {}}
      const blob=new Blob([text],{type:'application/json;charset=utf-8'}), url=URL.createObjectURL(blob), link=document.createElement('a');
      link.href=url;link.download=worldStore.blocked?'pokemon-world-原始存档备份.json':'pokemon-world-save.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    $('btn-import-save').onclick=()=>{if(!animating)$('file-import-save').click();};
    $('file-import-save').onchange=async()=>{
      const file=$('file-import-save').files[0];$('file-import-save').value='';if(!file)return;
      try {
        if(file.size>3*1024*1024)throw new Error('存档文件过大。');
        const imported=PKMWorldSave.validate(JSON.parse(await file.text()));
        for(const record of imported.box)if(!PKMBattle._dex[record.spec.species] || record.spec.moves.some(id=>!PKMBattle._moves[id]))throw new Error('存档包含当前版本不认识的物种或招式。');
        if(animating)throw new Error('请等当前行动结束后再导入。');
        if(!confirm(`导入将替换当前球袋和仓库（${imported.box.length}只）。不会替换编辑队伍。确定继续？`))return;
        worldStore.import(imported);if(battle)battle.ballStock={...worldStore.state.balls};renderCollection();if(battle)render();
        $('collection-message').textContent=worldStore.error || '存档已导入。';
      }catch(e){$('collection-message').textContent='导入失败：'+e.message;}
    };
    renderCollection();
  }

  // v0.9.2: 战斗机制不再是招式栏里的按钮，而是挂在我方血条框左侧的"道具"——
  // 超级进化石 / Ｚ晶石 / 极巨腕带 / 太晶珠。点一下装备（本回合出招时发动），再点一次取消。
  // v0.9.3: 道具图标优先用 Pokémon Showdown 的 itemicons-sheet（与精灵图同一 CDN）；预加载失败则退回矢量图。
  let psItemSheet = 'pending';
  function preloadItemSheet() {
    if (!globalThis.PKMMechanicItems || psItemSheet !== 'pending' || typeof Image === 'undefined') return;
    const img = new Image();
    img.onload = () => { psItemSheet = 'ok'; };
    img.onerror = () => { psItemSheet = 'error'; if (battle) render(); };
    img.src = PKMMechanicItems.PS_SHEET.url;
  }
  function mechanicArt(st) {
    const icon = st.icon;
    if (icon && icon.kind === 'sheet' && psItemSheet !== 'error') {
      return `<span class="ps-item-icon" style="--ix:${icon.x};--iy:${icon.y}" data-item="${PKMMechanicItems.esc(icon.item || '')}"></span>`;
    }
    if (icon && icon.kind === 'pixel') return icon.svg;
    return st.svg;
  }
  function mechanicState(me) {
    if (!battle || !me || !me.mechanic || !globalThis.PKMMechanicItems) return null;
    const info = PKMMechanicItems.describe(me, PKMBattle._dex);
    if (!info) return null;
    const kind = me.mechanic;
    const spentFlag = !!battle.mechanicUsed[0][kind] || (kind === 'mega' && me.isMega) || (kind === 'tera' && me.terastallized);
    let state, label = info.name, title;
    if (kind === 'dynamax' && me.dynamaxed) {
      state = 'in-effect'; label = `${info.short}中`; title = `${info.short}进行中。`;
    } else if (spentFlag) {
      state = 'spent'; label = '已发动'; title = `${info.name}本场战斗已经使用过了。`;
    } else if (kind === 'z' && !me.moves.some(m => m.type === me.zType)) {
      state = 'waiting'; title = `需要有「${zhType(me.zType)}」属性的招式才能使用${info.name}。`;
    } else if (selectedMechanic === kind) {
      state = 'armed'; label = `✓ ${info.short}`; title = `已装备${info.name}：选择招式后发动${info.short}；再点一次取消。`;
    } else {
      state = 'ready'; title = `${info.name}：点击装备，本回合出招时${info.short}；再点一次取消。`;
    }
    return { ...info, state, label, title };
  }
  function renderMechanicItem(me, over) {
    const root = $('mechanics');
    root.replaceChildren();
    const st = mechanicState(me);
    if (!st) { if (selectedMechanic) selectedMechanic = null; return; }
    if (st.state !== 'armed' && st.state !== 'ready' && selectedMechanic) selectedMechanic = null;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `mechanic-item kind-${st.kind}`;
    b.dataset.kind = st.kind; b.dataset.state = st.state;
    b.disabled = over || animating || battle.pendingSwitch !== null || !(st.state === 'ready' || st.state === 'armed');
    b.title = st.title; b.setAttribute('aria-label', `${st.name}（${st.label}）`); b.setAttribute('aria-pressed', String(st.state === 'armed'));
    b.innerHTML = `<span class="mechanic-art">${mechanicArt(st)}</span><span class="mechanic-label">${PKMMechanicItems.esc(st.label)}</span>`;
    b.onclick = () => {
      if (!battle || animating || battle.winner !== null || battle.pendingSwitch !== null) return;
      selectedMechanic = selectedMechanic === st.kind ? null : st.kind;
      if (selectedMechanic && menuView !== 'fight') menuView = 'fight'; // 装备道具后直接进入招式页
      render();
    };
    root.appendChild(b);
  }
  function render() {
    if (!battle) return;
    const me = battle.cur(0), foe = battle.cur(1);
    const fill = (p, prefix) => {
      $(prefix + '-name').textContent = displayPokemonName(p) + (p.status ? `（${PKMBattle.STATUS_NAMES[p.status] || p.status}）` : '');
      const ab = PKMMechanics.abilityInfo(p.ability);
      const it = p.item ? PKMMechanics.itemInfo(p.item) : null;
      const badges = [];
      if (p.captured) badges.push('已收服');
      if (p.isMega) badges.push('超级进化');
      if (p.terastallized) badges.push(`太晶·${zhType(p.teraType)}`);
      if (p.dynamaxed) badges.push(`${p.dynamaxForm === 'gmax' ? '超极巨' : '极巨'}·${p.dynamaxTurns}回合`);
      const speciesText = p.hasNickname ? ` · ${zhSpecies(p.speciesId, p.speciesName)}` : '';
      $(prefix + '-sub').textContent = `等级 ${p.level} · ${p.types.map(zhType).join('/')} · 特性 ${ab?.name || zhAbility(p.ability)}${speciesText}${badges.length ? ' · ' + badges.join(' · ') : ''}${p.choiceLockedMove ? ' · 锁定中' : ''}`;
      $(prefix + '-sub').title = `等级 ${p.level} · ${p.types.map(zhType).join('/')} · ${zhSpecies(p.speciesId, p.speciesName)} · 特性 ${ab?.name || zhAbility(p.ability)}${it ? ' · 道具 ' + displayItemName(it) : ''}`;
      const ratio = p.hp / p.maxHp;
      const bar = $(prefix + '-hp');
      bar.style.width = (ratio * 100).toFixed(1) + '%';
      bar.className = hpClass(ratio);
      $(prefix + '-hptext').textContent = `体力 ${p.hp} / ${p.maxHp}`;
    };
    fill(me, 'p'); fill(foe, 'e');
    setSprite($('p-sprite'), me, true);
    setSprite($('e-sprite'), foe, false);
    $('e-sprite').classList.toggle('is-captured', battle.outcome === 'captured');
    const teamRow = (side, el) => {
      el.innerHTML = '';
      battle.teams[side].forEach((p, i) => {
        const s = document.createElement('span');
        s.className = 'pip' + (i === battle.active[side] ? ' active' : '') + (p.fainted ? ' fainted' : '');
        s.textContent = '';
        s.title = `${displayPokemonName(p)}，体力 ${p.hp}/${p.maxHp}`;
        s.setAttribute('aria-label', s.title);
        el.appendChild(s);
      });
    };
    teamRow(0, $('p-team')); teamRow(1, $('e-team'));
    PKMFieldFX.sync(document.querySelector('.arena'), battle);
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
    $('field-state').textContent = '战场：' + (fieldParts.length ? fieldParts.join(' · ') : '无特殊效果');

    const log = $('log');
    log.textContent = battle.log.map(translateText).join('\n');
    log.scrollTop = log.scrollHeight;

    const over = battle.winner !== null;
    if (battle.pendingSwitch !== null) selectedMechanic = null;
    renderMechanicItem(me, over);

    const moves = $('moves');
    moves.innerHTML = '';
    const foeNow = battle.cur(1);
    me.moves.forEach((m, i) => {
      const shown = PKMBattle.transformMove(me, m, selectedMechanic);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `move-btn type-${String(shown.type || '').toLowerCase()}`;
      b.disabled = over || animating || battle.pendingSwitch !== null || m.ppLeft <= 0 || (me.choiceLockedMove && me.choiceLockedMove !== m.id) || me.volatile.disableMove === m.id || (selectedMechanic === 'z' && m.type !== me.zType);
      b.innerHTML = `${displayMoveName(shown, m)}<small>${zhType(shown.type)} · ${zhCat(shown.category)}${shown.basePower ? ' · 威力 ' + shown.basePower : ''} · 招式点数 ${m.ppLeft}/${m.pp}</small>`;
      const mech = selectedMechanic;
      const useIt = () => act({ kind: 'move', index: i, mechanic: mech });
      b.onclick = () => { if (Date.now() < suppressMoveClickUntil) return; useIt(); };
      // v1.3.5：长按招式 / 点 ⓘ 查看详细说明
      const ctxFn = () => ({ move: shown, base: m, user: me, foe: foeNow, name: displayMoveName(shown, m), foeName: foeNow ? displayPokemonName(foeNow) : '', usable: !b.disabled, onUse: useIt });
      moves.appendChild(moveCell(b, ctxFn));
    });
    // v1.3.4：招式点数会跨战斗继承；全部用完时只能“挣扎”
    if (!over && battle.pendingSwitch === null && !me.moves.some(m => m.ppLeft > 0 && me.volatile.disableMove !== m.id)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'move-btn type-normal';
      b.disabled = animating;
      b.innerHTML = `挣扎<small>招式点数已经用完 · 威力 50 · 会受到反作用力伤害</small>`;
      const useIt = () => act({ kind: 'move', index: 0, struggle: true });
      b.onclick = () => { if (Date.now() < suppressMoveClickUntil) return; useIt(); };
      const sm = { id: 'struggle', ...(PKMBattle._moves?.struggle || { name: 'Struggle', type: 'Normal', category: 'Physical', basePower: 50, accuracy: true, pp: 1, priority: 0, target: 'normal' }), ppLeft: 1, pp: 1 };
      moves.appendChild(moveCell(b, () => ({ move: sm, base: sm, user: me, foe: foeNow, name: '挣扎', foeName: foeNow ? displayPokemonName(foeNow) : '', usable: !b.disabled, onUse: useIt })));
    }
    const sw = $('switches');
    sw.innerHTML = '';
    battle.teams[0].forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'switch-btn';
      const title = document.createElement('strong'); title.textContent = displayPokemonName(p);
      const detail = document.createElement('small'); detail.textContent = i === battle.active[0] ? `出战中 · ${p.hp}/${p.maxHp}` : p.fainted ? '失去战斗能力' : `等级 ${p.level} · 体力 ${p.hp}/${p.maxHp}`;
      const dot = document.createElement('span'); dot.className = 'party-dot' + (p.fainted ? ' down' : i === battle.active[0] ? ' active' : '');
      const label = document.createElement('span'); label.append(title,detail); b.append(dot,label);
      b.title = `换上${displayPokemonName(p)}，体力 ${p.hp}/${p.maxHp}`;
      b.disabled = over || animating || i === battle.active[0] || p.fainted;
      b.onclick = () => {
        if (animating) return;
        if (battle.pendingSwitch !== null) {
          const before = snapshotBattle(), logStart = battle.log.length;
          if (battle.forceSwitch(i)) { animating = true; commandMessage = ''; menuView = 'fight'; after(); requestAnimationFrame(() => unlockAfterAnimations(before, { kind: 'switch' }, logStart)); }
        }
        else act({ kind: 'switch', index: i });
      };
      sw.appendChild(b);
    });
    const res = $('result');
    if (over) {
      res.classList.remove('hidden');
      res.textContent = battle.outcome === 'captured' ? '收服成功！' : battle.winner === 0 ? '🏆 胜利！' : '💀 败北……';
    } else if (battle.pendingSwitch !== null) {
      res.classList.remove('hidden');
      res.textContent = '请选择下一只宝可梦出战';
    } else res.classList.add('hidden');
    renderBalls(); renderCommands();
  }

  // ---------- v1.3.5：招式详细说明（长按招式 / 点 ⓘ / 右键） ----------
  let suppressMoveClickUntil = 0;
  function moveInfoOf(c) {
    return PKMMoveInfo.describe(c.move, { user: c.user, foe: c.foe, baseMove: c.base, name: c.name, foeName: c.foeName, zhType, zhCat });
  }
  function moveCell(btn, ctxFn) {
    const cell = document.createElement('div');
    cell.className = 'move-cell';
    cell.appendChild(btn);
    if (!window.PKMMoveInfo) return cell;
    try { btn.title = PKMMoveInfo.tooltip(moveInfoOf(ctxFn())); } catch (_) {}
    const badge = document.createElement('span');
    badge.className = 'move-info-btn'; badge.textContent = 'i';
    badge.setAttribute('role', 'button'); badge.tabIndex = 0;
    badge.setAttribute('aria-label', '查看招式说明'); badge.title = '查看招式说明';
    const openNow = e => { if (e) { e.preventDefault(); e.stopPropagation(); } openMoveInfo(ctxFn()); };
    badge.addEventListener('pointerdown', e => e.stopPropagation());
    badge.addEventListener('click', openNow);
    badge.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openNow(e); });
    let timer = null, sx = 0, sy = 0;
    const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
    cell.addEventListener('pointerdown', e => {
      if (e.button > 0 || e.target.closest('.move-info-btn')) return;
      sx = e.clientX; sy = e.clientY; cancel();
      timer = setTimeout(() => {
        timer = null;
        // 手指 / 鼠标还按着：松开之前产生的点击（包括落在弹出卡片上的那一下）都忽略，松开后再保护 400ms
        suppressMoveClickUntil = Date.now() + 60000;
        const release = () => { suppressMoveClickUntil = Date.now() + 400; document.removeEventListener('pointerup', release, true); document.removeEventListener('pointercancel', release, true); };
        document.addEventListener('pointerup', release, true); document.addEventListener('pointercancel', release, true);
        openMoveInfo(ctxFn());
        try { navigator.vibrate && navigator.vibrate(12); } catch (_) {}
      }, 450);
    });
    cell.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 12) cancel(); });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) cell.addEventListener(t, cancel);
    cell.addEventListener('contextmenu', e => { e.preventDefault(); cancel(); suppressMoveClickUntil = Date.now() + 400; openMoveInfo(ctxFn()); });
    cell.appendChild(badge);
    return cell;
  }
  function closeMoveInfo() {
    const old = document.getElementById('move-info-sheet');
    if (old) old.remove();
    document.removeEventListener('keydown', moveInfoKey, true);
  }
  function moveInfoKey(e) { if (e.key === 'Escape') { e.preventDefault(); closeMoveInfo(); } }
  function openMoveInfo(c) {
    if (!window.PKMMoveInfo || !c || !c.move) return;
    closeMoveInfo();
    let info;
    try { info = moveInfoOf(c); } catch (err) { console.warn('[move-info]', err); return; }
    const wrap = document.createElement('div');
    wrap.id = 'move-info-sheet'; wrap.className = 'move-sheet';
    const card = document.createElement('div');
    card.className = `move-sheet-card type-${String(c.move.type || '').toLowerCase()}`;
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', '招式说明：' + info.name);
    card.innerHTML = `<div class="mi-body">${PKMMoveInfo.html(info)}</div><div class="mi-actions">${c.usable && !animating ? '<button type="button" class="mi-use">使用这个招式</button>' : ''}<button type="button" class="mi-close">关闭</button></div>`;
    wrap.appendChild(card);
    wrap.addEventListener('click', e => {
      if (Date.now() < suppressMoveClickUntil) return; // 长按松手时那一下点击不算
      if (e.target === wrap || e.target.closest('.mi-close')) { closeMoveInfo(); return; }
      if (e.target.closest('.mi-use')) { closeMoveInfo(); if (c.onUse) c.onUse(); }
    });
    wrap.addEventListener('contextmenu', e => e.preventDefault());
    document.body.appendChild(wrap);
    document.addEventListener('keydown', moveInfoKey, true);
    const btn = card.querySelector('.mi-use') || card.querySelector('.mi-close');
    try { btn.focus({ preventScroll: true }); } catch (_) {}
  }

  function announceResult() {
    if (!battle || battle.winner === null || animating || announcedBattle === battle) return;
    announcedBattle = battle;
    const payload = battle.result();
    payload.hostTag = hostTag;
    const indiv = src => ({ nature: src.nature || '', ivs: { ...src.ivs }, stats: { ...src.stats } });
    payload.playerTeam.forEach((p, i) => { const src = battle.teams[0][i]; if (src) { Object.assign(p, indiv(src)); p.level = src.level; p.hostSlot = src.hostSlot ?? null; p.name = src.name; p.moves = src.moves.map(m => ({ id: m.id, ppLeft: m.ppLeft, pp: m.pp })); p.participated = !!src._participated || i === 0; } });
    payload.enemyTeam.forEach((p, i) => { const src = battle.teams[1][i]; if (src) { Object.assign(p, indiv(src)); p.level = src.level; p.name = src.name; p.shiny = !!src.shiny; p.gender = src.gender || null; } });
    postHost('PKM_BATTLE_RESULT', payload);
  }
  function after() { render(); announceResult(); }
  function act(a) {
    if (!battle || animating || battle.winner !== null || battle.pendingSwitch !== null) return;
    animating = true; commandMessage = ''; renderCommands();
    const battleRef = battle;
    const before = snapshotBattle();
    const logStart = battle.log.length;
    let chosen = { kind: a.kind };
    let mech = null;
    if (a.kind === 'move') {
      const me = battle.cur(0), base = me?.moves[a.index];
      mech = a.mechanic || selectedMechanic;
      if (a.struggle) chosen = { kind: 'move', mechanic: null, type: 'Normal', category: 'Physical', target: 'normal', name: '挣扎' };
      else if (base) {
        const shown = PKMBattle.transformMove(me, base, mech);
        chosen = { kind: 'move', mechanic: mech, type: shown.type, category: shown.category, target: shown.target || base.target || 'normal', name: displayMoveName(shown, base) };
      }
    }
    const finishTurn = () => {
      if (battle !== battleRef) return;
      battle.turn(a);
      selectedMechanic = null; menuView = panelForAction(a); // stay on the move list while the turn plays out
      after();
      for (const side of [0, 1]) {
        const old = before.teams[side]?.[before.active[side]], current = battle.cur(side);
        if (old?.dynamaxed && current && !current.dynamaxed && before.active[side] === battle.active[side]) {
          setSprite(spriteEl(side), old, side === 0);
        }
      }
      requestAnimationFrame(() => unlockAfterAnimations(before, chosen, logStart));
    };
    // 玩家变身：先在当前精灵上播完变身动画，再结算回合（顺序与参考卡一致）
    const meP = battle.cur(0);
    const willTransform = a.kind === 'move' && mech && mech !== 'z' && meP && meP.mechanic === mech
      && !battle.mechanicUsed[0][mech]
      && !(mech === 'mega' && meP.isMega) && !(mech === 'dynamax' && meP.dynamaxed) && !(mech === 'tera' && meP.terastallized);
    if (willTransform) {
      chosen.preAnimated = true;
      animating = true;
      const newSpeciesId = mech === 'mega' ? meP.megaForm
        : (mech === 'dynamax' && meP.dynamaxForm === 'gmax' ? `${meP.originalSpeciesId}gmax` : null);
      const newUrl = newSpeciesId
        ? spriteUrlForSnapshot({ speciesId: newSpeciesId, originalSpeciesId: meP.originalSpeciesId, rawName: PKMBattle._dex?.[normId(newSpeciesId)]?.name || newSpeciesId }, 0)
        : '';
      runTransformPhases(0, mech, { newUrl, nextSprite: { ...meP, speciesId: newSpeciesId || meP.speciesId, isMega: mech === 'mega' || meP.isMega, dynamaxed: mech === 'dynamax' || meP.dynamaxed }, gmax: meP.dynamaxForm === 'gmax', teraType: meP.teraType })
        .catch(() => {})
        .finally(() => { finishTurn(); });
    } else if (a.kind === 'switch' && meP && !meP.fainted && battle.pendingSwitch === null) {
      // 主动换人：先把当前宝可梦收回精灵球，再执行换人
      animating = true;
      playRecall(0);
      setTimeout(() => { finishTurn(); }, 700);
    } else finishTurn();
  }

  function buildFromPreset(trainer) {
    return trainer.party.map(p => PKMBattle.createPokemon(p.species, p.level, p.moves, p));
  }
  // v1.3.2: 角色卡写的是官方中文名（“大岩蛇”“岩石封锁”），这里统一换算成引擎 id。
  const MOVE_ALIASES = { '紧束': 'bind', '綁緊': 'bind', '十万伏特': 'thunderbolt', '十萬伏特': 'thunderbolt', '电光一闪': 'quickattack', '泡沫': 'bubble', '超音波': 'supersonic', '吸血': 'leechlife', '飞叶快刀': 'razorleaf', '火焰放射': 'flamethrower', '喷射火焰': 'flamethrower', '水炮': 'hydropump', '冲浪': 'surf', '催眠术': 'hypnosis', '念力': 'confusion', '高速移动': 'agility', '影子球': 'shadowball', '舌舔': 'lick', '黑夜魔影': 'nightshade', '奇异之光': 'confuseray', '电磁波': 'thunderwave', '打雷': 'thunder', '藤鞭': 'vinewhip', '寄生种子': 'leechseed', '日光束': 'solarbeam', '阳光烈焰': 'solarbeam' };
  let moveZhToId = null;
  function resolveMoveId(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const n = normId(raw);
    if (n && PKMBattle._moves?.[n]) return n;
    if (!moveZhToId) {
      moveZhToId = {};
      for (const [id, name] of Object.entries(ZH.moves || {})) if (name && !moveZhToId[name]) moveZhToId[name] = id;
    }
    const plain = raw.replace(/[\s·・]/g, '');
    for (const key of [raw, plain]) {
      if (moveZhToId[key] && PKMBattle._moves?.[moveZhToId[key]]) return moveZhToId[key];
      if (MOVE_ALIASES[key] && PKMBattle._moves?.[MOVE_ALIASES[key]]) return MOVE_ALIASES[key];
    }
    return '';
  }
  const STATUS_ALIASES = { par: 'par', brn: 'brn', psn: 'psn', tox: 'tox', slp: 'slp', frz: 'frz', '麻痹': 'par', '灼伤': 'brn', '烧伤': 'brn', '中毒': 'psn', '剧毒': 'tox', '睡眠': 'slp', '睡着': 'slp', '冰冻': 'frz' };
  const GENDER_ALIASES = { M: 'M', F: 'F', m: 'M', f: 'F', '公': 'M', '雄': 'M', '♂': 'M', '男': 'M', '母': 'F', '雌': 'F', '♀': 'F', '女': 'F' };
  function buildFromConfigParty(party) {
    // Party entries: "Species" | {name|species:Species, lv|level, moves:[...], hp, maxHp, status}
    const out = [];
    for (const entry of party) {
      const spec = typeof entry === 'string' ? { name: entry } : (entry || {});
      const rawSpecies = spec.species || spec.name;
      const species = resolveSpeciesId(rawSpecies);
      if (!PKMBattle._dex[species]) throw new Error(`对战系统里找不到宝可梦“${rawSpecies}”。请检查对战块里的 species 是否写成官方中文名。`);
      const level = Math.max(1, Math.min(100, parseInt(spec.lv || spec.level || 50, 10) || 50));
      // v1.3.4：宿主传来的剩余 PP。pp 可以是 {招式名: 剩余} 或与 moves 对齐的数组；缺省 = 满
      const ppById = {};
      const rawMoves = Array.isArray(spec.moves) ? spec.moves : [];
      if (Array.isArray(spec.pp)) rawMoves.forEach((mv, i) => { const id = mv ? resolveMoveId(mv) : null; const v = spec.pp[i]; if (id && v !== null && v !== undefined && Number.isFinite(Number(v)) && !(id in ppById)) ppById[id] = Number(v); });
      else if (spec.pp && typeof spec.pp === 'object') for (const [mv, v] of Object.entries(spec.pp)) { const id = resolveMoveId(mv); if (id && v !== null && Number.isFinite(Number(v))) ppById[id] = Number(v); }
      let moves = rawMoves.filter(Boolean).map(resolveMoveId).filter(Boolean);
      moves = [...new Set(moves)].slice(0, 4);
      if (!moves.length) moves = hostMode ? levelUpMoves(species, level) : autoMoves(species, level);
      const opts = { ...spec };
      delete opts.species; delete opts.moves; delete opts.hp; delete opts.maxHp; delete opts.status; delete opts.pp; delete opts.hostSlot;
      if (opts.ivs && typeof opts.ivs === 'object') { const iv = {}; for (const k of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) { const v = Number(opts.ivs[k]); if (Number.isInteger(v) && v >= 0 && v <= 31) iv[k] = v; } opts.ivs = iv; }
      else delete opts.ivs;
      // 宿主模式下没给个体值的（旧版桥接 / AI 自写的阵容）随机生成，避免同种同级数值完全相同
      if (hostMode && !opts.ivs) opts.ivs = Object.fromEntries(['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(k => [k, Math.floor(Math.random() * 32)]));
      if (opts.ability) { const dexAbilities = PKMBattle._dex[species].abilities || []; const want = String(opts.ability); const hit = dexAbilities.find(a => normId(a) === normId(want) || zhAbility(a, '') === want); opts.ability = hit || undefined; }
      if (opts.nature) { const want = String(opts.nature); const hit = Object.entries(ZH.natures || {}).find(([id, zh]) => zh === want || id === normId(want)); opts.nature = hit ? hit[0] : ''; }
      if (opts.gender) opts.gender = GENDER_ALIASES[opts.gender] || null;
      if (opts.nickname === rawSpecies) delete opts.nickname;
      const p = PKMBattle.createPokemon(species, level, moves, opts);
      for (const mv of p.moves) if (mv.id in ppById) mv.ppLeft = Math.max(0, Math.min(mv.pp ?? 10, Math.round(ppById[mv.id])));
      const maxHp = Number(spec.maxHp), hp = Number(spec.hp);
      if (spec.hp !== null && spec.hp !== undefined && Number.isFinite(hp)) {
        const ratio = Number.isFinite(maxHp) && maxHp > 0 ? hp / maxHp : hp / p.maxHp;
        p.hp = Math.max(0, Math.min(p.maxHp, Math.round(ratio * p.maxHp)));
        if (hp > 0 && p.hp === 0) p.hp = 1;
        if (p.hp === 0) p.fainted = true;
      }
      const st = STATUS_ALIASES[String(spec.status || '').trim()];
      if (st && !p.fainted) { p.status = st; if (st === 'slp') p.sleepTurns = 1 + Math.floor(Math.random() * 3); }
      if (spec.hostSlot !== undefined) p.hostSlot = spec.hostSlot;
      out.push(p);
    }
    return out;
  }
  // v1.3.2：宿主（角色卡）模式下没写招式的宝可梦，按“升级招式表”取等级以内最近学会的 4 招，
  // 而不是对战向的最强配招（否则 Lv3 的野生波波会用出大爆炸）。
  let LEVELUP = {};
  function levelUpMoves(speciesId, level) {
    const sid = normId(speciesId);
    const lv = Math.max(1, level || 1);
    let list = (LEVELUP[sid] || []).filter(([l, id]) => l <= lv && PKMBattle._moves?.[id]).map(([, id]) => id);
    if (!list.length) {
      list = PKMTeam.legalMoves(sid, lv).filter(m => m.learn?.level && m.learn.level <= lv)
        .sort((a, b) => a.learn.level - b.learn.level).map(m => m.id);
    }
    const uniq = [...new Set(list)];
    const picked = uniq.slice(-4);
    if (!picked.some(id => PKMBattle._moves[id]?.basePower > 0)) {
      const dmg = uniq.filter(id => PKMBattle._moves[id]?.basePower > 0).pop() || (PKMBattle._moves.tackle ? 'tackle' : null);
      if (dmg) { if (picked.length >= 4) picked.shift(); picked.push(dmg); }
    }
    return picked.length ? picked : autoMoves(sid, lv);
  }
  function autoMoves(speciesId, level) {
    return PKMTeam.chooseAutoMoves(speciesId, level || 50);
  }

  function startBattle(cfg) {
    if (animating) return;
    if (cfg && cfg.host) { hostTag = cfg.host.tag || null; useHostStore(cfg.host.balls); }
    menuView = 'home'; commandMessage = ''; announcedBattle = null;
    encounterId = globalThis.crypto?.randomUUID?.() || `encounter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    selectedMechanic = null;
    animating = false;
    let playerTeam, enemyTeam, difficulty = $('sel-diff').value, weather = null;
    formatTag = cfg ? String(cfg.rules?.tag || '').slice(0, 28) : ''; formatRule = cfg ? String(cfg.rules?.rule || '').slice(0, 160) : '';
    typeLabel = cfg ? String(cfg.rules?.typeLabel || '').slice(0, 8) : '';
    if (cfg) {
      difficulty = cfg.difficulty || difficulty;
      if (cfg.encounter?.type === 'wild') $('sel-enemy').value = 'wild';
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
      const limit = (v, fallback) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 6 ? Number(v) : fallback;
      const wild = cfg.encounter?.type === 'wild';
      const size = limit(cfg.rules?.teamSize, 6);
      playerTeam = playerTeam.slice(0, wild ? 6 : limit(cfg.rules?.playerLimit, size));
      enemyTeam = enemyTeam.slice(0, wild ? 1 : limit(cfg.rules?.enemyLimit, size));
      if (!playerTeam.length || playerTeam.every(p => p.fainted)) throw new Error('我方没有能战斗的宝可梦。');
      if (!enemyTeam.length) throw new Error('对手没有宝可梦。');
      const environment = PKMFieldFX.environment(cfg.environment);
      weather = environment.weather || null;
      const wt = environment.weatherTurns;
      if (cfg.encounter?.type === 'wild' && enemyTeam.length !== 1) throw new Error('当前野生遭遇仅支持一只野生宝可梦。');
      battle = new PKMBattle.Battle(playerTeam, enemyTeam, { difficulty, weather, weatherTurns: typeof wt !== 'undefined' ? wt : 0,
        encounterType: cfg.encounter?.type, balls: worldStore.state.balls, seed: cfg.seed });
      if (environment.terrain) battle.setTerrain(environment.terrain, environment.terrainTurns);
      if (cfg.ui?.openBalls && battle.encounterType === 'wild') menuView = 'balls';
      // v1.3.9：战斗记录第一行写明这场的类型和赛制（角色卡发来的）
      if (cfg.host?.intro) battle.log.unshift(String(cfg.host.intro).slice(0, 200));
    } else {
      playerTeam = $('chk-custom-player').checked ? buildValidated(readEditor('player'), '我方') : buildFromPreset(PKMPresets.TRAINERS.player);
      if (!playerTeam) return;
      enemyTeam = $('chk-custom-enemy').checked ? buildValidated(readEditor('enemy'), '敌方') : buildFromPreset(PKMPresets.TRAINERS[$('sel-enemy').value]);
      if (!enemyTeam) return;
      const isWild = $('sel-enemy').value === 'wild' && !$('chk-custom-enemy').checked;
      if (isWild) {
        const pool = ['pikachu','eevee','growlithe','psyduck','vulpix','oddish','zubat','geodude','riolu'];
        const id = pool[Math.floor(Math.random()*pool.length)], level = 30 + Math.floor(Math.random()*16);
        enemyTeam = [PKMBattle.createPokemon(id, level, autoMoves(id, level))];
      }
      battle = new PKMBattle.Battle(playerTeam, enemyTeam, { difficulty, encounterType: isWild ? 'wild' : 'trainer', balls: worldStore.state.balls });
    }
    // v1.3.9：敌方信息框的小标签：野生 / 对手名字（角色卡发来的），单机模式按野生 / 敌方
    const sideEl = $('e-side-label');
    if (sideEl) sideEl.textContent = String((cfg && cfg.rules?.sideLabel) || (battle.encounterType === 'wild' ? '野生' : '敌方')).slice(0, 6);
    after();
    if (!window.PKMPreview) requestAnimationFrame(() => { playSendOut(1); setTimeout(() => playSendOut(0), 150); });
  }


  /* ---------- Team editor (Phase 2) ---------- */
  const NATURES = ['', 'adamant', 'modest', 'jolly', 'timid', 'bold', 'calm', 'impish', 'careful', 'brave', 'quiet', 'relaxed', 'sassy', 'lonely', 'mild', 'hasty', 'naive', 'naughty', 'rash', 'lax', 'gentle'];
  const LS_KEY = 'pkm-custom-teams-v2';
  function resolveSpeciesId(text) {
    const raw = String(text || '').trim();
    const n = normId(raw);
    if (PKMBattle._dex[n]) return n;
    for (const [id, sp] of Object.entries(PKMBattle._dex)) if (normId(sp.name) === n) return id;
    if (speciesZhToId[raw]) return speciesZhToId[raw];
    return n;
  }
  function editorRoot(side) { return side === 'player' ? $('editor-player') : $('editor-enemy'); }
  function specFromPreset(key) {
    return PKMPresets.TRAINERS[key].party.map(p => ({ species: p.species, level: p.level, nature: p.nature || '', ability: p.ability || '', item: p.item || '', mechanic: p.mechanic || '', megaForm: p.megaForm || '', zType: p.zType || '', teraType: p.teraType || '', dynamaxForm: p.dynamaxForm || '', moves: p.moves.slice() }));
  }
  function loadEditorSpecs() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (saved && Array.isArray(saved.player) && Array.isArray(saved.enemy)) return saved;
    } catch (_) {}
    return { player: specFromPreset('player'), enemy: specFromPreset('gym') };
  }
  function saveEditorSpecs(show) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ player: readEditor('player'), enemy: readEditor('enemy') })); if (show) showValidate('已保存到本机浏览器。'); return true; } catch (e) { if (show) alert('保存失败：' + e.message); return false; }
  }
  function refreshMechanicOptions(row) {
    const sid = resolveSpeciesId(row.querySelector('.f-species').value);
    const kind = row.querySelector('.f-mechanic').value;
    const detail = row.querySelector('.f-mechanic-detail');
    const prev = detail.value || detail.dataset.want || '';
    detail.innerHTML = '';
    const add = (value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label; detail.appendChild(o); };
    if (kind === 'mega') {
      const forms = PKMTeam.megaForms(sid);
      if (!forms.length) add('', '（该宝可梦无超级形态）'); else forms.forEach(f => add(f.id, zhSpecies(f.id, f.name)));
    } else if (kind === 'z') PKMMechanics.TYPES.forEach(t => add(t, `${PKMMechanics.TYPE_ZH[t]}Ｚ纯晶`));
    else if (kind === 'tera') PKMMechanics.TYPES.forEach(t => add(t, `太晶·${PKMMechanics.TYPE_ZH[t]}`));
    else if (kind === 'dynamax') { add('', '普通极巨化'); if (PKMTeam.gmaxForm(sid)) add('gmax', '超极巨化'); }
    else add('', '无机制');
    detail.disabled = !kind;
    if ([...detail.options].some(o => o.value === prev)) detail.value = prev;
    detail.dataset.want = detail.value;
    return detail.value;
  }
  function refreshRowOptions(row) {
    const sid = resolveSpeciesId(row.querySelector('.f-species').value);
    const dex = PKMBattle._dex[sid];
    const level = parseInt(row.querySelector('.f-level').value || '50', 10) || 50;
    const abilitySel = row.querySelector('.f-ability');
    const prevAbility = abilitySel.value || abilitySel.dataset.want || '';
    abilitySel.innerHTML = '';
    (dex?.abilities || []).forEach(a => { const o = document.createElement('option'); o.value = a; o.textContent = zhAbility(a); abilitySel.appendChild(o); });
    if (prevAbility && dex?.abilities?.includes(prevAbility)) abilitySel.value = prevAbility;
    const legal = dex ? PKMTeam.legalMoves(sid, level) : [];
    row.querySelectorAll('.f-move').forEach(sel => {
      const prev = sel.value || sel.dataset.want || '';
      sel.innerHTML = '';
      const blank = document.createElement('option'); blank.value = ''; blank.textContent = '（自动配招）'; sel.appendChild(blank);
      for (const m of legal) {
        const o = document.createElement('option');
        o.value = m.id;
        o.textContent = `${zhMove(m.id, m.name)} · ${zhType(m.type)}/${zhCat(m.category)}${m.basePower ? ' 威力' + m.basePower : ''}（${m.learn.viaLabel.replaceAll('+', '、')}）`;
        sel.appendChild(o);
      }
      if (prev) {
        if (![...sel.options].some(o => o.value === prev)) {
          const o = document.createElement('option'); o.value = prev; o.textContent = zhMove(prev, '未知招式') + '（当前等级未学会或不合法）'; sel.appendChild(o);
        }
        sel.value = prev;
      }
    });
    const mechanicDetail = refreshMechanicOptions(row);
    const abInfo = PKMMechanics.abilityInfo(abilitySel.value);
    abilitySel.title = abInfo ? translateText(`${abInfo.name}：${abInfo.desc}`) : '该特性效果尚未实现';
    const itemSel = row.querySelector('.f-item');
    if (itemSel) itemSel.title = translateText(PKMMechanics.itemInfo(itemSel.value).desc);
    row.querySelector('.f-note').textContent = dex
      ? (PKMTeam.hasLearnset(sid) ? `${zhSpecies(sid, dex.name)} · ${dex.types.map(zhType).join('/')} · 合法招式 ${legal.length} 个 · ${abInfo ? '特性已生效' : '特性效果尚未实现'}` : `${zhSpecies(sid, dex.name)} · 暂无第九代学习面（未校验）`)
      : '宝可梦不存在';
  }
  function renderEditor(side, specs) {
    const rootEl = editorRoot(side);
    rootEl.innerHTML = '';
    specs.slice(0, 6).forEach((spec, i) => {
      const row = document.createElement('fieldset');
      row.className = 'team-row';
      row._ownedMetadata = { sourceSpecies: resolveSpeciesId(spec.species), ivs: spec.ivs, nickname: spec.nickname, shiny: spec.shiny, gender: spec.gender, captureId: spec.captureId };
      row.innerHTML = `<legend>#${i + 1}</legend>
        <div class="row-main">
          <input class="f-species" list="species-list" placeholder="输入名称，如：皮卡丘">
          <input class="f-level" type="number" min="1" max="100" title="等级">
          <select class="f-nature" title="性格">${NATURES.map(n => `<option value="${n}">${n ? '性格：' + zhNature(n) : '性格：无修正'}</option>`).join('')}</select>
          <select class="f-ability" title="特性"></select>
          <select class="f-item" title="道具">${Object.values(PKMMechanics.ITEMS).map(i => `<option value="${i.id}">${i.name}</option>`).join('')}</select>
        </div>
        <div class="move-grid">
          ${[0, 1, 2, 3].map(() => `<select class="f-move"></select>`).join('')}
        </div>
        <div class="mechanic-row">
          <select class="f-mechanic" title="战斗机制"><option value="">机制：无</option><option value="mega">超级进化</option><option value="z">Ｚ招式</option><option value="dynamax">极巨化</option><option value="tera">太晶化</option></select>
          <select class="f-mechanic-detail" title="机制细节"></select>
        </div>
        <div class="f-note note"></div>`;
      rootEl.appendChild(row);
      row.querySelector('.f-species').value = spec.species ? zhSpecies(resolveSpeciesId(spec.species), spec.species) : '';
      row.querySelector('.f-level').value = spec.level || 50;
      row.querySelector('.f-nature').value = spec.nature || '';
      row.querySelector('.f-ability').dataset.want = spec.ability || '';
      row.querySelector('.f-item').value = spec.item || '';
      row.querySelector('.f-mechanic').value = spec.mechanic || '';
      row.querySelector('.f-mechanic-detail').dataset.want = spec.mechanic === 'mega' ? (spec.megaForm || '') : spec.mechanic === 'z' ? (spec.zType || '') : spec.mechanic === 'tera' ? (spec.teraType || '') : spec.mechanic === 'dynamax' ? (spec.dynamaxForm || '') : '';
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
      row.querySelector('.f-mechanic').addEventListener('change', () => { refreshMechanicOptions(row); saveEditorSpecs(false); });
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
      const mechanic = row.querySelector('.f-mechanic').value;
      const detail = row.querySelector('.f-mechanic-detail').value;
      specs.push({ ...(row._ownedMetadata?.sourceSpecies === sid ? { ivs: row._ownedMetadata.ivs, nickname: row._ownedMetadata.nickname, shiny: row._ownedMetadata.shiny, gender: row._ownedMetadata.gender, captureId: row._ownedMetadata.captureId } : {}), species: sid, level, nature: row.querySelector('.f-nature').value, ability: row.querySelector('.f-ability').value, item: row.querySelector('.f-item').value, mechanic, megaForm: mechanic === 'mega' ? detail : '', zType: mechanic === 'z' ? detail : '', teraType: mechanic === 'tera' ? detail : '', dynamaxForm: mechanic === 'dynamax' ? detail : '', moves });
    });
    return specs;
  }
  function buildValidated(spec, label) {
    const v = PKMTeam.validateTeam(spec);
    showValidate((v.errors.length ? `${label}错误：\n` + v.errors.join('\n') : '') + (v.warnings.length ? `\n${label}提示：\n` + v.warnings.join('\n') : ''));
    if (!v.ok) { alert(label + '队伍有问题：\n' + v.errors.map(translateText).join('\n')); return null; }
    return spec.map(p => PKMBattle.createPokemon(p.species, p.level, p.moves, p));
  }
  function showValidate(extra) {
    const pv = PKMTeam.validateTeam(readEditor('player')), ev = PKMTeam.validateTeam(readEditor('enemy'));
    const lines = [];
    if (extra) lines.push(extra);
    lines.push(pv.ok ? '我方队伍：合法 ✓' : '我方队伍错误：\n' + pv.errors.join('\n'));
    lines.push(ev.ok ? '敌方队伍：合法 ✓' : '敌方队伍错误：\n' + ev.errors.join('\n'));
    for (const w of [...pv.warnings, ...ev.warnings]) lines.push('提示：' + w);
    $('validate-msg').textContent = lines.map(translateText).join('\n');
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
    team.forEach((spec, i) => {
      const forms = PKMTeam.megaForms(spec.species);
      if (i === 0 && forms.length) { spec.mechanic = 'mega'; spec.megaForm = forms[0].id; }
      else if (i === 1) { spec.mechanic = 'dynamax'; spec.dynamaxForm = PKMTeam.gmaxForm(spec.species) ? 'gmax' : ''; }
      else if (i === 2) { spec.mechanic = 'tera'; spec.teraType = PKMBattle._dex[spec.species].types[0]; }
    });
    return team;
  }

  async function init() {
    const [dex, moves, learnsets, zh, spriteMap] = await Promise.all([
      fetch('./src/data/pokedex.json?v=0.9.0').then(r => r.json()),
      fetch('./src/data/moves.json?v=0.9.0').then(r => r.json()),
      fetch('./src/data/learnsets.json?v=0.9.0').then(r => r.json()),
      fetch('./src/data/zh-names.json?v=0.9.0').then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch('./src/data/sprite-map.json?v=1.3.20').then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch('./src/data/levelup.json?v=1.3.2').then(r => r.ok ? r.json() : {}).then(x => { LEVELUP = x || {}; }).catch(() => {}),
      fetch('./src/data/move-desc-zh.json?v=1.3.7').then(r => r.ok ? r.json() : {}).then(x => { if (window.PKMMoveInfo) PKMMoveInfo.setDesc(x); }).catch(() => {}),
    ]);
    ZH = zh || {};
    SPRITES = spriteMap?.entries || {};
    SPRITE_FEET = {};
    SPRITE_FEETX = {};
    SPRITE_BODY = {};
    SPRITE_MOUTH = {};
    for (const e of Object.values(SPRITES)) {
      if (e.front) { SPRITE_FEET[e.front] = e.frontFeet; SPRITE_FEETX[e.front] = e.frontFeetX; SPRITE_BODY[e.front] = e.frontBody; SPRITE_MOUTH[e.front] = e.frontMouth; }
      if (e.back) { SPRITE_FEET[e.back] = e.backFeet; SPRITE_FEETX[e.back] = e.backFeetX; SPRITE_BODY[e.back] = e.backBody; SPRITE_MOUTH[e.back] = e.backMouth; }
      for (const side of ['front', 'back']) {
        const href = e[side];
        if (!href) continue;
        const u = new URL(href, document.baseURI).href;
        SPRITE_FEET[u] = e[side + 'Feet']; SPRITE_FEETX[u] = e[side + 'FeetX'];
        SPRITE_BODY[u] = e[side + 'Body']; SPRITE_MOUTH[u] = e[side + 'Mouth'];
      }
    }
    PKMBattle.setData(dex, moves);
    PKMTeam.setData(dex, moves, learnsets);
    PKMBattle._dex = dex; PKMBattle._moves = moves;
    preloadItemSheet();
    buildTextPairs();
    const dl = $('species-list');
    Object.entries(dex)
      .filter(([id, sp]) => sp.num >= 1 && sp.num <= 1025 && (!sp.baseSpecies || normId(sp.baseSpecies) === id))
      .sort((a, b) => a[1].num - b[1].num)
      .forEach(([id, sp]) => { const o = document.createElement('option'); o.value = zhSpecies(id, sp.name); dl.appendChild(o); });
    const specs = loadEditorSpecs();
    renderEditor('player', specs.player);
    renderEditor('enemy', specs.enemy);
    $('btn-save-teams').onclick = () => saveEditorSpecs(true);
    $('btn-validate').onclick = () => showValidate('');
    $('btn-random-player').onclick = () => { renderEditor('player', randomSpec()); saveEditorSpecs(false); showValidate('已随机生成我方队伍。'); };
    $('btn-reset-teams').onclick = () => { renderEditor('player', specFromPreset('player')); renderEditor('enemy', specFromPreset('gym')); saveEditorSpecs(false); showValidate('已恢复内置队伍。'); };
    initWorldControls();
    $('btn-start').onclick = () => startBattle(null);
    $('btn-config').onclick = () => {
      try {
        const raw = $('txt-config').value.replace(/<\/?PKM_BATTLE>/gi, '').trim();
        startBattle(JSON.parse(raw));
      } catch (e) { alert('配置解析失败：' + e.message); }
    };
    // URL config: ?config=<encodeURIComponent(JSON)>
    for (const id of ['p-sprite', 'e-sprite']) spriteResizeObserver?.observe($(id));
    const q = new URLSearchParams(location.search).get('config');
    if (window.PKMPreview) worldStore = new PKMWorldSave.Store(memoryStorage());
    dataReady = true;
    if (pendingHostConfig) { const cfg = pendingHostConfig; pendingHostConfig = null; startHostBattle(cfg); return; }
    if (q) { try { startBattle(JSON.parse(q)); return; } catch (_) {} }
    if (EMBED) { $('log').textContent = '对战系统已就绪，正在等待角色卡发送对战配置……'; postHost('PKM_BATTLE_READY', { version: APP_VERSION }); return; }
    startBattle(null);
  }

  function startHostBattle(cfg) {
    try { startBattle(cfg); postHost('PKM_BATTLE_STARTED', { ok: true }); }
    catch (e) {
      console.warn('[PKM] bad config', e);
      if (cfg?.host?.tag) hostTag = cfg.host.tag;
      $('log').textContent = '对战配置有误：' + e.message;
      postHost('PKM_BATTLE_ERROR', { message: String(e.message || e) });
    }
  }
  // SillyTavern host -> simulator（数据未加载完时先排队，加载完再开战）
  window.addEventListener('message', ev => {
    const d = ev.data || {};
    if (d.type === 'PKM_BATTLE_CONFIG' && d.payload) {
      if (!dataReady) { pendingHostConfig = d.payload; return; }
      startHostBattle(d.payload);
    } else if (d.type === 'PKM_BATTLE_PING') postHost(dataReady ? 'PKM_BATTLE_READY' : 'PKM_BATTLE_LOADING', { version: APP_VERSION });
  });

  // Preview is opt-in and visual-only: no battle.turn(), results, or save writes.
  if (new URLSearchParams(location.search).has('fxpreview')) {
    document.documentElement.classList.add('fx-preview-mode');
    let previewMon = null, previewBusy = false;
    window.PKMPreview = {
      ready: () => !!battle,
      set(options = {}) {
        if (!battle || previewBusy) return false;
        const arena = document.querySelector('.arena'); arena.classList.add('fx-preview-arena');
        PKMFieldFX.sync(arena, {weather:options.weather, field:{terrain:options.terrain}});
        PKMFieldFX.configure(arena, {intensity:Number(options.intensity || 1),paused:!!options.paused});
        const id = ['pikachu','charizard','venusaur','cinderace','urshifu','urshifurapidstrike'].includes(options.species) ? options.species : 'pikachu';
        const form = ['normal','dynamax','gmax'].includes(options.form) ? options.form : 'dynamax';
        previewMon = PKMBattle.createPokemon(id, 50, ['tackle']);
        previewMon.dynamaxed = form !== 'normal'; previewMon.dynamaxForm = form === 'gmax' ? 'gmax' : '';
        if (form === 'gmax' && PKMBattle._dex[id+'gmax']) previewMon.speciesId = id+'gmax';
        setSprite($('p-sprite'), previewMon, true);
        $('field-state').textContent = '效果预览 · 不消耗回合 / 不写入存档';
        return true;
      },
      arcs() { PKMFieldFX.configure(document.querySelector('.arena'),{arcs:true}); },
      async transform() {
        if(!previewMon||previewBusy||!previewMon.dynamaxed)return false;
        previewBusy=true;
        const final={...previewMon},normal={...previewMon,speciesId:previewMon.originalSpeciesId||previewMon.speciesId,dynamaxed:false,dynamaxForm:''};
        try{setSprite($('p-sprite'),normal,true);await waitMs(120);const url=spriteUrlForSnapshot(final,0);await runTransformPhases(0,'dynamax',{gmax:final.dynamaxForm==='gmax',newUrl:url,nextSprite:final});setSprite($('p-sprite'),final,true);return true;}finally{previewBusy=false;}
      },
      thunder() { PKMFieldFX.configure(document.querySelector('.arena'),{thunder:true}); },
      replayTerrain() { PKMFieldFX.configure(document.querySelector('.arena'),{replayTerrain:true}); },
      async attack(kind='physical') {
        if (!previewMon || previewBusy) return false;
        previewBusy=true;
        try {
          if(kind==='hit') animateImg(0,'fx-hit',720);
          else if(kind==='special') { castImg(0,'Fire'); playMoveFx(0,{type:'Fire',category:'Special',target:'normal'}); }
          else { animateImg(0,'fx-attack',680); playMoveFx(0,{type:'Normal',category:'Physical',target:'normal'}); }
          await waitMs(1100); return true;
        } finally { previewBusy=false; }
      }
    };
  }

  init().catch(e => { $('log').textContent = '数据加载失败：' + e.message + '\n（请通过网页服务打开本页，不要直接双击文件）'; });
})();
