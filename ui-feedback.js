/* Local error feedback and diagnostics. Nothing is sent to a server. */
(() => {
  'use strict';
  /** @type {RenaxFeedbackEntry[]} */
  const entries = [];
  /** @type {RenaxMeasurements} */
  const measurements = { lcpMs: null, cls: 0, inpMs: null, inpSupported: false };
  /** @type {HTMLElement | null} */
  let notice = null;
  let clsWindowValue = 0,
    clsWindowStart = 0,
    clsLast = 0;
  /** Show a recoverable failure without replacing the application or its data. */
  /** @param {string} message @param {unknown} [cause] */
  function error(message, cause) {
    entries.push({
      at: new Date().toISOString(),
      message,
      detail: String(
        /** @type {{message?: unknown} | null | undefined} */ (cause)?.message || cause || '',
      ),
    });
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
      close.onclick = () => {
        /** @type {HTMLElement} */ (notice).remove();
        notice = null;
      };
      notice.append(text, close);
      document.body.append(notice);
    }
    /** @type {HTMLParagraphElement} */ (notice.querySelector('p')).textContent = message;
  }
  // Keep native console reporting intact: these listeners do not preventDefault().
  window.addEventListener('error', (event) => {
    if (event.error)
      error(
        'Une erreur est survenue. Vos données locales sont conservées. Réessayez cette action.',
        event.error,
      );
  });
  window.addEventListener('unhandledrejection', (event) => {
    error(
      'Une opération a échoué. Vos données locales sont conservées. Réessayez cette action.',
      event.reason,
    );
  });
  if (window.PerformanceObserver) {
    for (const type of ['largest-contentful-paint', 'layout-shift']) {
      if (!PerformanceObserver.supportedEntryTypes?.includes(type)) continue;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (type === 'largest-contentful-paint') measurements.lcpMs = entry.startTime;
          else if (
            !(/** @type {PerformanceEntry & {hadRecentInput: boolean}} */ (entry).hadRecentInput)
          ) {
            if (
              !clsWindowStart ||
              entry.startTime - clsLast > 1000 ||
              entry.startTime - clsWindowStart > 5000
            ) {
              clsWindowStart = entry.startTime;
              clsWindowValue = /** @type {PerformanceEntry & {value: number}} */ (entry).value;
            } else
              clsWindowValue += /** @type {PerformanceEntry & {value: number}} */ (entry).value;
            clsLast = entry.startTime;
            measurements.cls = Math.max(measurements.cls, clsWindowValue);
          }
        }
      }).observe({ type, buffered: true });
    }
  }
  // Only the numeric measurement is retained. No DOM targets or telemetry are exported.
  if (window.PerformanceObserver?.supportedEntryTypes?.includes('event')) {
    import('./vendor/web-vitals-6.2.3.js')
      .then(({ onINP }) => {
        measurements.inpSupported = true;
        onINP(
          (metric) => {
            measurements.inpMs = metric.value;
          },
          { reportAllChanges: true },
        );
      })
      .catch((error) => console.warn('Mesure INP indisponible', error));
  }
  function diagnosticReport() {
    return {
      format: 1,
      createdAt: new Date().toISOString(),
      browser: navigator.userAgent,
      measurements: { ...measurements },
      playback:
        window.RENAX_PLAYBACK?.diagnosticSnapshot(
          typeof audioCtx === 'undefined' ? null : audioCtx,
        ) ?? null,
      networkReportedOnline: navigator.onLine,
      primaryStorageHealthy: window.RENAX_STORAGE?.healthy ?? null,
      errors: entries.map((entry) => ({
        at: entry.at,
        category: entry.message.includes('son') ? 'audio' : 'application',
      })),
    };
  }
  function exportDiagnostic() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(diagnosticReport(), null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'renax-diagnostic.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const panel = document.getElementById('index2SettingsPanel');
  if (panel) {
    const section = document.createElement('section');
    section.className = 'index2-settings-section';
    const heading = document.createElement('h3');
    heading.textContent = 'Aide en cas de problème';
    heading.dataset.i18nKey = 'diagnostics.heading';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = 'Exporter le diagnostic';
    button.dataset.i18nKey = 'diagnostics.export';
    button.addEventListener('click', exportDiagnostic);
    section.append(heading, button);
    panel.append(section);
  }
  window.RENAX_FEEDBACK = Object.freeze({
    error,
    diagnosticReport,
    exportDiagnostic,
    get diagnostics() {
      return entries.map((entry) => ({ ...entry }));
    },
    get measurements() {
      return { ...measurements };
    },
  });
})();
