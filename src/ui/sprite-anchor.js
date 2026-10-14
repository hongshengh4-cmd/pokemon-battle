/* Shared sprite anchor geometry. No DOM dependency; testable in Node. */
(function (root) {
  'use strict';
  function project({ rect, width, height, naturalWidth, naturalHeight, anchor, flip = false }) {
    if (![rect.left, rect.top, rect.width, rect.height, width, height, naturalWidth, naturalHeight].every(Number.isFinite)
      || Math.min(width, height, naturalWidth, naturalHeight, rect.width, rect.height) <= 0) return null;
    const fit = Math.min(width / naturalWidth, height / naturalHeight);
    const contentW = naturalWidth * fit, contentH = naturalHeight * fit;
    const point = Array.isArray(anchor) && anchor.length === 2 && anchor.every(Number.isFinite) ? anchor : [.5, .5];
    let x = Math.max(0, Math.min(1, point[0]));
    const y = Math.max(0, Math.min(1, point[1]));
    if (flip) x = 1 - x;
    // rect includes CSS translate, scale, and transform-origin; object-fit uses layout dimensions.
    return {
      x: rect.left + ((width - contentW) / 2 + contentW * x) * rect.width / width,
      y: rect.top + ((height - contentH) / 2 + contentH * y) * rect.height / height,
      contentWidth: contentW * rect.width / width,
      contentHeight: contentH * rect.height / height,
    };
  }
  // v0.8.6: 1.5x the previous responsive icon size; keep body tracking unchanged.
  function iconSize(extent, kind) {
    const safeExtent = Number.isFinite(extent) ? Math.max(0, extent) : 0;
    return 1.5 * Math.max(30, Math.min(kind === 'z' ? 106 : 74, safeExtent * (kind === 'z' ? .33 : .24)));
  }
  root.PKMSpriteAnchor = { project, iconSize };
})(typeof globalThis !== 'undefined' ? globalThis : this);
