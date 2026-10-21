/* Presentation only: never changes the battle engine's stats or species data. */
(function (root) {
  'use strict';
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function profile(dex, speciesId, { originalSpeciesId, dynamaxed = false, dynamaxForm = '' } = {}) {
    const species = dex?.[speciesId] || dex?.[originalSpeciesId] || {};
    // Giant forms encode their giant height in the dex. Use the base size before
    // applying the explicit Dynamax presentation, not sqrt(20m) as a normal form.
    const baseId = String(species.baseSpecies || originalSpeciesId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const physical = dynamaxed && dex?.[baseId] ? dex[baseId] : species;
    const h = Number(physical.heightm);
    const height = Number.isFinite(h) && h > 0 ? h : 1.7;
    // Compress real-world differences for readable battles: tiny species stay
    // visible; snakes/whales cannot fill the entire arena. Charizard is 1.0.
    const normalRatio = clamp(Math.sqrt(height / 1.7), .4, 1.06);
    return {
      ratio: dynamaxed ? (dynamaxForm === 'gmax' ? Math.max(1.2, normalRatio*1.25) : Math.max(1.05, normalRatio*1.1)) : normalRatio,
      height,
      category: height < .6 ? 'small' : height < 1.2 ? 'medium' : height < 2.5 ? 'large' : 'huge',
    };
  }
  function ground({ imageLeft, imageTop, width, height, naturalWidth, naturalHeight, boxWidth, boxHeight,
    feet = .94, feetX = .5, flip = false, permanentScale = 1, shadowMaxWidth, shadowMaxHeight, giantShadow = false }) {
    if (![imageLeft, imageTop, width, height, naturalWidth, naturalHeight, boxWidth, boxHeight].every(Number.isFinite)
      || Math.min(width, height, naturalWidth, naturalHeight, boxWidth, boxHeight) <= 0) return null;
    const fit = Math.min(width / naturalWidth, height / naturalHeight);
    const contentW = naturalWidth * fit, contentH = naturalHeight * fit;
    const footY = (height - contentH) / 2 + clamp(feet, 0, 1) * contentH;
    const footX = (width - contentW) / 2 + (flip ? 1 - clamp(feetX, 0, 1) : clamp(feetX, 0, 1)) * contentW;
    const projectedX = imageLeft + width / 2 + (footX - width / 2) * permanentScale;
    const blendedX = projectedX * .85 + boxWidth / 2 * .15;
    const shadowWidth = clamp(contentW * permanentScale * (giantShadow ? .82 : .76), 24, Number.isFinite(shadowMaxWidth)?shadowMaxWidth:boxWidth*.92);
    return {
      translateY: boxHeight - 27 - imageTop - footY,
      originY: footY / height * 100,
      shadowX: clamp(blendedX, boxWidth * .12, boxWidth * .88),
      shadowWidth,
      shadowHeight: clamp(shadowWidth * (giantShadow ? .17 : .11), 8, Number.isFinite(shadowMaxHeight)?shadowMaxHeight:30),
    };
  }
  root.PKMSpriteSizing = { profile, ground };
})(typeof globalThis !== 'undefined' ? globalThis : this);
