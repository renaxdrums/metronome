/* Accessible select presentation. No audio, storage or navigation dependencies. */
(() => {
  'use strict';
  const widgets = new WeakMap();
  let sequence = 0;

  function close(wrap, restoreFocus = false) {
    wrap.classList.remove('open');
    const trigger = wrap.querySelector('.numbox-button');
    trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger?.focus();
  }

  function closeAll(except = null) {
    document.querySelectorAll('.numbox-custom.open').forEach(wrap => {
      if (wrap !== except) close(wrap);
    });
  }

  function enhance(select) {
    if (!select || widgets.has(select)) return;
    const wrap = document.createElement('div');
    wrap.className = 'numbox-custom';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'numbox-button';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const value = document.createElement('span');
    const userValue = !!select.closest('[data-no-translate]');
    if(userValue)value.dataset.noTranslate='';
    const menu = document.createElement('div');
    menu.className = 'numbox-menu';
    menu.id = 'numbox-options-' + ++sequence;
    menu.setAttribute('role', 'listbox');
    trigger.id = menu.id + '-trigger';
    menu.setAttribute('aria-labelledby', trigger.id);
    trigger.setAttribute('aria-controls', menu.id);
    trigger.append(value);
    select.before(wrap);
    wrap.append(select, trigger, menu);
    select.classList.add('numbox-native');
    select.tabIndex = -1;

    const items = () => [...menu.querySelectorAll('.numbox-option:not(:disabled)')];
    function sync() {
      value.textContent = select.options[select.selectedIndex]?.textContent || select.value;
      const label=select.getAttribute('aria-label')||select.labels?.[0]?.firstChild?.textContent?.trim();
      if(label)trigger.setAttribute('aria-label',label+' : '+value.textContent);
      menu.querySelectorAll('.numbox-option').forEach(item => {
        const selected = item.dataset.value === select.value;
        item.classList.toggle('active', selected);
        item.setAttribute('aria-selected', String(selected));
      });
    }
    let optionSignature = null;
    function rebuild() {
      const signature=JSON.stringify([...select.options].map(option=>[option.value,option.textContent,option.disabled]));
      if(signature===optionSignature){sync();return;}
      optionSignature=signature;
      const focused = menu.contains(document.activeElement) ? document.activeElement.dataset.value : null;
      const fragment = document.createDocumentFragment();
      for (const option of select.options) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'numbox-option';
        item.dataset.value = option.value;
        item.textContent = option.textContent;
        if(userValue)item.dataset.noTranslate='';
        item.disabled = option.disabled;
        item.tabIndex = -1;
        item.setAttribute('role', 'option');
        item.addEventListener('click', event => {
          event.stopPropagation();
          const previousValue=select.value;
          select.value = option.value;
          select.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { previousValue } }));
          sync();
          close(wrap, true);
        });
        fragment.append(item);
      }
      menu.replaceChildren(fragment);
      sync();
      if(focused!==null)[...menu.children].find(item=>item.dataset.value===focused)?.focus({preventScroll:true});
    }
    function open() {
      select.dispatchEvent(new Event('renax-options-request'));
      closeAll(wrap);
      wrap.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => menu.querySelector('.active')?.scrollIntoView({ block: 'nearest' }));
    }
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      if (wrap.classList.contains('open')) close(wrap);
      else open();
    });
    trigger.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      // A click also invokes the existing floating-menu placement listener.
      if (!wrap.classList.contains('open')) trigger.click();
      const options = items();
      const current = options.find(item => item.dataset.value === select.value);
      (event.key === 'Home' ? options[0] : event.key === 'End' ? options.at(-1) : current || options[0])?.focus();
    });
    let search = '', searchTimer;
    menu.addEventListener('keydown', event => {
      event.stopPropagation();
      const options = items(), index = options.indexOf(document.activeElement);
      if (event.key === 'Tab') { close(wrap); return; }
      if (event.key === 'Escape') { event.preventDefault(); close(wrap, true); return; }
      if (['Enter', ' '].includes(event.key)) { event.preventDefault(); document.activeElement?.click(); return; }
      let next;
      if (event.key === 'Home') next = options[0];
      if (event.key === 'End') next = options.at(-1);
      if (event.key === 'ArrowDown') next = options[(index + 1) % options.length];
      if (event.key === 'ArrowUp') next = options[(index - 1 + options.length) % options.length];
      if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        clearTimeout(searchTimer);
        search += event.key.toLocaleLowerCase();
        searchTimer = setTimeout(() => { search = ''; }, 600);
        next = options.find(item => item.textContent.trim().toLocaleLowerCase().startsWith(search));
      }
      if (next) { event.preventDefault(); next.focus(); next.scrollIntoView({ block: 'nearest' }); }
    });
    select.addEventListener('change', sync);
    widgets.set(select, { sync, rebuild });
    rebuild();
  }
  document.addEventListener('click', () => closeAll());
  window.RENAX_NUMBOX = Object.freeze({ widgets, enhance, closeAll });
})();
