/* Numbox Entraînement : composants numériques existants conservés (IDs, valeurs et événements). */
(() => {
  'use strict';
  const section = document.querySelector('.training-section');
  if (!section) return;
  const ITEM_HEIGHT = 30;
  const styles = document.createElement('style');
  styles.id = 'training-numbox-style';
  styles.textContent = [
    '.training-row .training-numbox{flex:1 1 0;width:auto;min-width:0;}',
    '.training-row .training-numbox>.numbox-button{width:100%;min-height:30px;color:var(--orange);}',
    '.training-row .training-numbox>.numbox-button:disabled{opacity:.45;cursor:not-allowed;}',
    '.training-numbox>.numbox-button:focus-visible{outline:2px solid var(--cyan);outline-offset:2px;}',
    '.training-numbox>.numbox-menu{position:fixed;z-index:10000;width:auto;max-height:245px;padding:0;overflow-x:hidden;}',
    '.training-numbox .training-numbox-spacer{position:relative;width:100%;}',
    '.training-numbox .numbox-option{position:absolute;left:0;width:100%;height:30px;min-height:30px;padding:0 4px;display:flex;align-items:center;justify-content:center;}',
    '@media(max-width:1100px){.training-row .training-numbox>.numbox-button{min-height:44px;height:44px;font-size:14px;border-radius:7px;}}'
  ].join('\n');
  document.head.appendChild(styles);

  const widgets = [];
  function refreshAll() { for (const widget of widgets) widget.sync(); }
  function closeOthers(except) {
    document.querySelectorAll('.numbox-custom.open').forEach(wrap => {
      if (wrap !== except) wrap.classList.remove('open');
    });
  }

  function enhance(input) {
    if (input.closest('.training-numbox')) return;
    const wrap = document.createElement('div');
    wrap.className = 'numbox-custom training-numbox';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'numbox-button';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    const text = document.createElement('span');
    button.appendChild(text);
    const menu = document.createElement('div');
    menu.className = 'numbox-menu';
    menu.setAttribute('role', 'listbox');
    menu.id = input.id + '-numbox-menu';
    button.setAttribute('aria-controls', menu.id);
    const spacer = document.createElement('div');
    spacer.className = 'training-numbox-spacer';
    menu.appendChild(spacer);
    input.parentNode.insertBefore(wrap, input);
    wrap.append(input, button, menu);
    input.classList.add('numbox-native');

    function limits() {
      const min = Number(input.min || 0);
      const max = Math.max(min, Number(input.max || 999));
      const step = Math.max(1, Number(input.step) || 1);
      return { min, max, step, count: Math.floor((max - min) / step) + 1 };
    }
    function sync() {
      text.textContent = input.value;
      button.setAttribute('aria-label', input.getAttribute('aria-label') ||
        (wrap.closest('.training-row')?.querySelector('.row-label')?.textContent || 'Valeur numérique'));
      button.disabled = input.disabled;
      button.setAttribute('aria-expanded', String(wrap.classList.contains('open')));
      if (input.disabled && wrap.classList.contains('open')) wrap.classList.remove('open');
    }
    function position() {
      if (!wrap.classList.contains('open')) return;
      const r = button.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 8;
      const above = r.top - 8;
      const down = below >= Math.min(190, above);
      const height = Math.max(40, Math.min(245, down ? below : above));
      const width = Math.min(window.innerWidth - 16, Math.max(90, r.width));
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      menu.style.width = width + 'px';
      menu.style.height = height + 'px';
      menu.style.maxHeight = height + 'px';
      menu.style.left = left + 'px';
      menu.style.top = (down ? r.bottom + 4 : Math.max(4, r.top - height - 4)) + 'px';
    }
    let paintedStart = -1, paintedCount = -1, paintedSelected = '';
    function paint(force = false) {
      if (!wrap.classList.contains('open')) return;
      const {min, max, step, count} = limits();
      const start = Math.max(0, Math.floor(menu.scrollTop / ITEM_HEIGHT) - 3);
      const visible = Math.min(count - start, Math.ceil(menu.clientHeight / ITEM_HEIGHT) + 7);
      if (!force && start === paintedStart && visible === paintedCount &&
          paintedSelected === input.value) return;
      paintedStart = start;
      paintedCount = visible;
      paintedSelected = input.value;
      const fragment = document.createDocumentFragment();
      for (let i = start; i < start + visible; i++) {
        const number = Math.min(max, min + i * step);
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'numbox-option';
        item.setAttribute('role', 'option');
        item.dataset.value = String(number);
        item.textContent = String(number);
        if (String(number) === input.value) {
          item.classList.add('active');
          item.setAttribute('aria-selected', 'true');
        }
        item.style.top = i * ITEM_HEIGHT + 'px';
        fragment.appendChild(item);
      }
      spacer.replaceChildren(fragment);
    }
    function open() {
      if (button.disabled) return;
      closeOthers(wrap);
      wrap.classList.add('open');
      const {min, max, step, count} = limits();
      spacer.style.height = count * ITEM_HEIGHT + 'px';
      position();
      const current = Number(input.value);
      const index = Math.max(0, Math.min(count - 1,
        Math.round((Math.max(min, Math.min(max, Number.isFinite(current) ? current : min)) - min) / step)));
      menu.scrollTop = Math.max(0, index * ITEM_HEIGHT - (menu.clientHeight - ITEM_HEIGHT) / 2);
      paintedStart = -1;
      paint(true);
      sync();
    }
    function close() {
      wrap.classList.remove('open');
      sync();
    }
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (wrap.classList.contains('open')) close(); else open();
    });
    button.addEventListener('keydown', event => {
      if (event.key === 'Escape') { close(); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!wrap.classList.contains('open')) open();
        const bounds = limits();
        const number = Number(input.value);
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const next = Math.min(bounds.max, Math.max(bounds.min, number + delta * bounds.step));
        menu.scrollTop = Math.max(0, (next - bounds.min) / bounds.step * ITEM_HEIGHT -
          (menu.clientHeight - ITEM_HEIGHT) / 2);
        paint(true);
      }
    });
    menu.addEventListener('scroll', () => paint(), {passive: true});
    menu.addEventListener('click', event => {
      const item = event.target.closest('button[data-value]');
      if (!item) return;
      event.stopPropagation();
      input.value = item.dataset.value;
      input.dispatchEvent(new Event('input', {bubbles: true}));
      input.dispatchEvent(new Event('change', {bubbles: true}));
      close();
      button.focus({preventScroll: true});
      requestAnimationFrame(refreshAll);
    });
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    new MutationObserver(sync).observe(input, {
      attributes: true, attributeFilter: ['disabled', 'min', 'max', 'aria-label']
    });
    new MutationObserver(sync).observe(wrap, {attributes:true,attributeFilter:['class']});
    widgets.push({sync, position});
    sync();
  }

  for (const input of section.querySelectorAll('input[type="number"]')) enhance(input);
  // Les modes progressif et par paliers modifient parfois les valeurs directement.
  // Garder l'affichage en phase sans changer les calculs d'entraînement.
  document.addEventListener('click', () => requestAnimationFrame(refreshAll));
  document.addEventListener('change', () => requestAnimationFrame(refreshAll));
  window.addEventListener('resize', () => widgets.forEach(widget => widget.position()));
  document.addEventListener('scroll', event => {
    if (event.target.closest?.('.training-numbox>.numbox-menu')) return;
    for (const widget of widgets) widget.position();
  }, true);
})();
