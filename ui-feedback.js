/* Local error feedback and diagnostics. Nothing is sent to a server. */
(() => {
  'use strict';
  const entries = [];
  const measurements = { lcpMs: null, cls: 0 };
  let notice, clsWindowValue=0, clsWindowStart=0, clsLast=0;
  /** Show a recoverable failure without replacing the application or its data. */
  function error(message, cause) {
    entries.push({ at: new Date().toISOString(), message, detail: String(cause?.message || cause || '') });
    if (entries.length > 30) entries.shift();
    if (!notice) {
      notice = document.createElement('aside');
      notice.className = 'app-error-notice';
      notice.setAttribute('aria-label', 'Erreur');
      const text = document.createElement('p');
      text.setAttribute('role', 'alert');
      text.setAttribute('aria-live', 'assertive');
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Fermer';
      close.onclick = () => { notice.remove(); notice = null; };
      notice.append(text, close);
      document.body.append(notice);
    }
    notice.querySelector('p').textContent = message;
  }
  // Keep native console reporting intact: these listeners do not preventDefault().
  window.addEventListener('error', event => {
    if (event.error) error('Une erreur est survenue. Vos données locales sont conservées. Réessayez cette action.', event.error);
  });
  window.addEventListener('unhandledrejection', event => {
    error('Une opération a échoué. Vos données locales sont conservées. Réessayez cette action.', event.reason);
  });
  if (window.PerformanceObserver) {
    for (const type of ['largest-contentful-paint', 'layout-shift']) {
      if (!PerformanceObserver.supportedEntryTypes?.includes(type)) continue;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (type === 'largest-contentful-paint') measurements.lcpMs = entry.startTime;
          else if (!entry.hadRecentInput) {
            if(!clsWindowStart||entry.startTime-clsLast>1000||entry.startTime-clsWindowStart>5000){clsWindowStart=entry.startTime;clsWindowValue=entry.value;}else clsWindowValue+=entry.value;
            clsLast=entry.startTime;measurements.cls=Math.max(measurements.cls,clsWindowValue);
          }
        }
      }).observe({ type, buffered: true });
    }
  }
  window.RENAX_FEEDBACK = Object.freeze({
    error,
    get diagnostics() { return entries.map(entry => ({ ...entry })); },
    get measurements() { return { ...measurements }; }
  });
})();
