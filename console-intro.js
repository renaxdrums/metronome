/* Presentation only: no audio, musical state or saved data is changed. */
(() => {
  const overlay = document.getElementById('renaxArrival');
  if (!overlay) return;
  const preference = 'renax.arrival.enabled.v1';
  const reduce = matchMedia('(prefers-reduced-motion:reduce)');
  let enabled = true, timer, frame, canvas, previous;
  try { enabled = localStorage.getItem(preference) !== 'false'; } catch {}
  const word = overlay.querySelector('.console-arrival-word');
  function label() {
    const en = window.RENAX_I18N?.language === 'en';
    overlay.setAttribute('aria-label', en ? 'Metronome introduction' : 'Animation d’arrivée Métronome');
    word.replaceChildren(...[...(en ? 'Metronome' : 'Métronome')].map((letter, i) => {
      const span = document.createElement('span'); span.textContent = letter;
      span.style.setProperty('--n', i); return span;
    }));
  }
  function finish() {
    clearTimeout(timer); cancelAnimationFrame(frame); canvas?.remove(); canvas = null;
    overlay.hidden = true; overlay.style.clipPath = ''; overlay.classList.remove('is-skipping');
    if (overlay.contains(document.activeElement)) previous?.focus();
  }
  function dissolve() {
    if (overlay.hidden) return;
    canvas = document.createElement('canvas'); canvas.className = 'console-arrival-dust';
    canvas.setAttribute('aria-hidden', 'true'); overlay.after(canvas);
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) { finish(); return; }
    let width, height, started, last, previousFront;
    const dust = [], duration = 1400, tail = 850;
    function resize() {
      width = innerWidth; height = innerHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    function edge(x, progress, now) {
      const front = height + 24 - progress * (height + 70);
      const roughness = Math.sin(Math.PI * Math.min(1, progress)) * 18;
      return front + roughness * (Math.sin(x * .022 + now * .0011) * .5 + Math.sin(x * .057 - now * .0018) * .3 + Math.sin(x * .109 + now * .0007) * .2);
    }
    function tick(now) {
      if (overlay.hidden) { finish(); return; }
      if (width !== innerWidth || height !== innerHeight) resize();
      if (started === undefined) { started = now; last = now; previousFront = height; }
      const elapsed = now - started, dt = Math.min(.035, (now - last) / 1000); last = now;
      const progress = Math.min(1, elapsed / duration);
      const front = height + 24 - progress * (height + 70);
      const points = ['0px 0px', width + 'px 0px'];
      for (let x = width; x >= 0; x -= width / 48) points.push(x.toFixed(1) + 'px ' + edge(x, progress, now).toFixed(1) + 'px');
      points.push('0px ' + edge(0, progress, now).toFixed(1) + 'px');
      overlay.style.clipPath = 'polygon(' + points.join(',') + ')';
      // Emit only material removed since the preceding frame, keeping density independent of refresh rate.
      const removed = Math.max(0, previousFront - front); previousFront = front;
      const count = progress < 1 ? Math.min(110, Math.round(width * removed / 155)) : 0;
      for (let i = 0; i < count && dust.length < 2400; i++) {
        const x = Math.random() * width, y = edge(x, progress, now) + Math.random() * Math.max(2, removed);
        if (y < 0 || y > height) continue;
        const nearTitle = Math.abs(x - width / 2) < Math.min(280, width * .36) && Math.abs(y - height / 2) < 110;
        const accent = nearTitle && Math.random() < .16;
        dust.push({ x, y, vx: (Math.random() - .5) * 55 + 12, vy: 18 + Math.random() * 70,
          size: .45 + Math.pow(Math.random(), 2) * 1.4, age: 0, life: .28 + Math.random() * .7,
          phase: Math.random() * Math.PI * 2, opacity: .18 + Math.random() * .55,
          color: accent ? (Math.random() < .6 ? '255,121,0' : '237,240,242') : '115,126,136' });
      }
      ctx.clearRect(0, 0, width, height);
      for (let i = dust.length - 1; i >= 0; i--) {
        const p = dust[i]; p.age += dt;
        if (p.age >= p.life) { dust.splice(i, 1); continue; }
        const wind = Math.sin(now * .0015 + p.y * .012 + p.phase);
        p.vx += wind * 28 * dt; p.vy += 26 * dt;
        p.x += (p.vx + Math.sin(p.age * 8 + p.phase) * 9) * dt; p.y += p.vy * dt;
        const alpha = p.opacity * Math.pow(1 - p.age / p.life, 1.6);
        ctx.fillStyle = 'rgba(' + p.color + ',' + alpha.toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * .65, p.phase + p.age, 0, Math.PI * 2); ctx.fill();
      }
      if (elapsed >= duration + tail) finish(); else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    timer = setTimeout(finish, duration + tail + 500);
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !overlay.hidden) { event.preventDefault(); finish(); }
  }, true);
  window.addEventListener('pagehide', finish, { once: true });
  reduce.addEventListener('change', () => { if (reduce.matches) finish(); });
  const settings = document.querySelector('#index2SettingsPanel .index2-settings-section');
  if (settings) {
    const row = document.createElement('label'); row.className = 'console-arrival-setting';
    const caption = document.createElement('span'), toggle = document.createElement('input');
    toggle.type = 'checkbox'; toggle.checked = enabled; row.append(caption, toggle); settings.append(row);
    function translate() { caption.textContent = window.RENAX_I18N?.language === 'en' ? 'Intro animation' : 'Animation d’arrivée'; }
    translate(); window.addEventListener('renax-language-changed', translate);
    toggle.onchange = () => { enabled = toggle.checked; try { localStorage.setItem(preference, String(enabled)); } catch {} };
  }
  window.addEventListener('renax-language-changed', () => { if (!overlay.hidden) label(); });
  if (enabled && !reduce.matches) {
    label(); previous = document.activeElement;
    // Keep the approved logo and lettering arrival, then erode the stationary surface from its bottom.
    timer = setTimeout(dissolve, 1700);
  } else finish();
})();

