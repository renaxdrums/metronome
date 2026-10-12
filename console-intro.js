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
    overlay.hidden = true; overlay.style.clipPath = ''; overlay.style.opacity = ''; overlay.style.maskImage = ''; overlay.style.webkitMaskImage = ''; overlay.style.pointerEvents = ''; overlay.classList.remove('is-skipping');
    if (overlay.contains(document.activeElement)) previous?.focus();
  }
  function dissolve() {
    if (overlay.hidden) return;
    canvas = document.createElement('canvas'); canvas.className = 'console-arrival-dust';
    canvas.setAttribute('aria-hidden', 'true'); overlay.after(canvas);
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) { finish(); return; }
    let width, height, started, last, emitted = 0;
    const sparks = [], duration = 1350, tail = 850;
    const logo = overlay.querySelector('.console-arrival-logo');
    const bounds = word.getBoundingClientRect(), logoBounds = logo?.getBoundingClientRect();
    // Sample the actual letter shapes and the approved transparent logo once.
    const stencil = document.createElement('canvas');
    stencil.width = innerWidth; stencil.height = innerHeight;
    const ink = stencil.getContext('2d', { willReadFrequently: true }), origins = [];
    if (ink) {
      for (const letter of word.children) {
        const rect = letter.getBoundingClientRect(), style = getComputedStyle(letter);
        ink.font = style.font; ink.fillStyle = style.color; ink.textBaseline = 'middle';
        ink.fillText(letter.textContent, rect.left, rect.top + rect.height * .48);
      }
      if (logo?.complete && logo.naturalWidth && logoBounds) {
        try { ink.drawImage(logo, logoBounds.x, logoBounds.y, logoBounds.width, logoBounds.height); } catch {}
      }
      try {
        const pixels = ink.getImageData(0, 0, stencil.width, stencil.height).data;
        for (let y = 0; y < stencil.height; y += 3) for (let x = 0; x < stencil.width; x += 3) {
          const i = (y * stencil.width + x) * 4;
          if (pixels[i + 3] > 80) origins.push({ x, y, warm: pixels[i] > pixels[i + 2] + 35 });
        }
      } catch {}
    }
    origins.sort((a, b) => b.y - a.y);
    function resize() {
      width = innerWidth; height = innerHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    function tick(now) {
      if (overlay.hidden) { finish(); return; }
      if (width !== innerWidth || height !== innerHeight) resize();
      if (started === undefined) { started = now; last = now; }
      const elapsed = now - started, dt = Math.min(.035, (now - last) / 1000); last = now;
      const progress = Math.min(1, elapsed / duration);
      // A broad, continuous fade travels from bottom to top; no boundary, wave or translation.
      const stops = Array.from({ length: 13 }, (_, i) => {
        const y = i / 12, local = Math.max(0, Math.min(1, (progress - (1 - y) * .48) / .52));
        const alpha = 1 - local * local * (3 - 2 * local);
        return 'rgba(0,0,0,' + alpha.toFixed(4) + ') ' + (y * 100).toFixed(2) + '%';
      });
      const mask = 'linear-gradient(to bottom,' + stops.join(',') + ')';
      overlay.style.maskImage = mask; overlay.style.webkitMaskImage = mask;
      if (progress > .85) overlay.style.pointerEvents = 'none';
      const target = Math.round(Math.min(1, progress / .72) * Math.min(650, width * .65));
      while (emitted < target) {
        const origin = origins.length ? origins[Math.min(origins.length - 1, Math.floor((.15 + Math.min(1, progress / .72) * .75) * Math.random() * origins.length))] : { x: bounds.left + Math.random() * bounds.width, y: bounds.top + Math.random() * bounds.height, warm: true };
        const depth = .3 + Math.random() * .7;
        const angle = Math.random() * Math.PI * 2, speed = .35 + Math.random() * .85;
        // A radial burst fills the whole viewport instead of following the lettering baseline.
        const ambient = Math.random() < .22;
        const x = ambient ? Math.random() * width : origin.x;
        const y = ambient ? Math.random() * height : origin.y;
        sparks.push({ x, y, vx: Math.cos(angle) * width * .42 * speed * depth,
          vy: Math.sin(angle) * height * .65 * speed * depth, radius: .5 + Math.random() * 1.7,
          life: .65 + Math.random() * 1.15, age: 0, depth, phase: Math.random() * Math.PI * 2,
          flare: emitted % 37 === 0, warm: origin.warm, power: .3 + Math.random() * .7 });
        emitted++;
      }
      ctx.clearRect(0, 0, width, height); ctx.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]; p.age += dt;
        if (p.age >= p.life) { sparks.splice(i, 1); continue; }
        p.x += (p.vx + Math.sin(now * .002 + p.phase) * 10) * dt;
        p.y += (p.vy + Math.cos(p.age * 4 + p.phase) * 6) * dt;
        const life = p.age / p.life;
        const alpha = Math.sin(Math.PI * life) * p.power * (1 - progress * .45);
        const color = p.warm ? '255,155,75' : '255,234,205';
        const halo = p.radius * (p.flare ? 13 : 4);
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, halo);
        glow.addColorStop(0, 'rgba(255,245,222,' + alpha.toFixed(3) + ')');
        glow.addColorStop(.15, 'rgba(' + color + ',' + (alpha * .55).toFixed(3) + ')');
        glow.addColorStop(.45, 'rgba(' + color + ',' + (alpha * .10).toFixed(3) + ')');
        glow.addColorStop(1, 'rgba(' + color + ',0)');
        ctx.fillStyle = glow; ctx.fillRect(p.x - halo, p.y - halo, halo * 2, halo * 2);
        if (p.flare) {
          const length = 12 + Math.sin(Math.PI * life) * 22;
          const streak = ctx.createLinearGradient(p.x - length, 0, p.x + length, 0);
          streak.addColorStop(0, 'rgba(' + color + ',0)'); streak.addColorStop(.5, 'rgba(255,235,205,' + (alpha * .7).toFixed(3) + ')'); streak.addColorStop(1, 'rgba(' + color + ',0)');
          ctx.fillStyle = streak; ctx.fillRect(p.x - length, p.y - .5, length * 2, 1);
        }
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
    // Keep the approved logo and lettering arrival, then fade the whole surface with warm flare particles.
    timer = setTimeout(dissolve, 1700);
  } else finish();
})();

