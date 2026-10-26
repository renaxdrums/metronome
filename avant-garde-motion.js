/* RENAX Avant-garde: optional ambient light only; no musical or UI state mutation. */
(() => {
  'use strict';
  if (!window.matchMedia || !window.requestAnimationFrame) return;
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (reduce.matches || !fine.matches) return;
  const halo = document.createElement('div');
  halo.className = 'renax-avant-halo';
  halo.setAttribute('aria-hidden','true');
  document.body.appendChild(halo);
  let x = -500, y = -500, targetX = -500, targetY = -500, raf = 0;
  const active = () => root.dataset.theme === 'avant' && !reduce.matches && fine.matches;
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const frame = () => {
    raf = 0;
    if (!active()) return;
    x += (targetX-x)*.16; y += (targetY-y)*.16;
    halo.style.transform = 'translate3d('+x.toFixed(1)+'px,'+y.toFixed(1)+'px,0)';
    if (Math.abs(x-targetX)+Math.abs(y-targetY) > .5) raf = requestAnimationFrame(frame);
  };
  const hide = () => { halo.style.opacity = '0'; stop(); };
  window.addEventListener('pointermove', event => {
    if (!active() || event.pointerType === 'touch') { hide(); return; }
    targetX = event.clientX; targetY = event.clientY;
    halo.style.opacity = '1';
    if (!raf) raf = requestAnimationFrame(frame);
  }, {passive:true});
  document.addEventListener('pointerleave',hide);
  window.addEventListener('blur',hide);
  reduce.addEventListener?.('change',hide);
  fine.addEventListener?.('change',hide);
  new MutationObserver(() => { if (!active()) hide(); })
    .observe(root, {attributes:true, attributeFilter:['data-theme']});
})();