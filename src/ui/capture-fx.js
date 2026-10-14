/* Self-authored capture choreography. No ball animation is used for ordinary switching. */
(function (root) {
  'use strict';
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function play({ arena, player, target, point, attempt, name, onPhase = () => {} }) {
    const ar = arena.getBoundingClientRect(), pr = player.getBoundingClientRect(), tr = target.getBoundingClientRect();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const unit = reduced ? .28 : 1, diameter = innerWidth <= 680 ? 25 : 34;
    const x = point.x - ar.left - diameter / 2, y = point.y - ar.top - diameter / 2;
    const box = target.parentElement.getBoundingClientRect();
    const floor = Math.min(ar.height - diameter - 12, box.bottom - ar.top - 27 - diameter);
    const startX = pr.left - ar.left + pr.width * .7, startY = pr.top - ar.top + pr.height * .4;
    const ball = document.createElement('span'); ball.className = 'capture-ball ball-' + attempt.ball; ball.setAttribute('aria-hidden', 'true');
    ball.style.width = ball.style.height = `${diameter}px`;
    const caption = document.createElement('div'); caption.className = 'capture-caption'; caption.setAttribute('role', 'status');
    arena.append(ball, caption);
    let absorb;
    const phase = text => { caption.textContent = text; onPhase(text); };
    async function animate(el, frames, duration) {
      const a = el.animate(frames, { duration: duration * unit, easing: 'ease-in-out', fill: 'forwards' });
      try { await a.finished; } catch (_) {}
      return a;
    }
    try {
      phase('投出精灵球！');
      await animate(ball, [
        { transform: `translate(${startX}px, ${startY}px) rotate(-35deg) scale(.55)` },
        { transform: `translate(${(startX+x)/2}px, ${Math.max(8,Math.min(startY,y)-90)}px) rotate(100deg) scale(1)` },
        { transform: `translate(${x}px, ${y}px) rotate(360deg) scale(1)` },
      ], 520);
      absorb = target.animate([{ opacity: 1, filter: 'brightness(1)' }, { opacity: 0, filter: 'brightness(5) blur(4px)' }], { duration: 240 * unit, fill: 'forwards' });
      await wait(240 * unit);
      await animate(ball, [{ transform: `translate(${x}px, ${y}px)` }, { transform: `translate(${x}px, ${floor}px)` }], 220);
      for (let i = 0; i < attempt.shakes; i++) {
        phase(`正在捕获 ${name}… ${'●'.repeat(i+1)}${'○'.repeat(2-i)}`);
        await animate(ball, [0,-20,17,-9,0].map(angle => ({ transform: `translate(${x}px, ${floor}px) rotate(${angle}deg)` })), 300);
        await wait(130 * unit);
      }
      if (attempt.success) {
        phase(`收服成功！${name} 成为了新伙伴。`);
        ball.classList.add('capture-success');
        await wait(650 * unit);
      } else {
        phase(`${name} 挣脱了精灵球！`);
        ball.classList.add('capture-break');
        absorb.cancel();
        await wait(420 * unit);
      }
    } finally {
      absorb?.cancel(); ball.remove(); caption.remove();
    }
  }
  root.PKMCaptureFX = { play };
})(typeof globalThis !== 'undefined' ? globalThis : this);
