/* Screen ownership and visual-only output compensation. Never changes audio timestamps. */
(() => {
  'use strict';
  const key = 'renax.visualLatencyMs.v1';
  let active = false,
    generation = 0,
    lockEpoch = 0,
    sentinel = null,
    pending = null,
    manual = 0;
  try {
    const value = Number(localStorage.getItem(key));
    if (Number.isFinite(value)) manual = Math.max(-100, Math.min(400, value));
  } catch {}
  const wakeEvents = [];
  function traceWake(state, reason = null) {
    wakeEvents.push({ state, reason, at: performance.now(), visibility: document.visibilityState });
    if (wakeEvents.length > 32) wakeEvents.shift();
  }
  function diagnosticSnapshot(context) {
    const policy = document.permissionsPolicy || document.featurePolicy;
    let policyAllowed = null;
    try {
      if (policy?.allowsFeature) policyAllowed = policy.allowsFeature('screen-wake-lock');
    } catch {}
    return {
      active,
      secureContext: window.isSecureContext,
      topLevel: window.top === window,
      wakeLockSupported: typeof navigator.wakeLock?.request === 'function',
      policyAllowed,
      lockHeld: !!sentinel && !sentinel.released,
      requestPending: !!pending,
      wakeEvents: wakeEvents.map((event) => ({ ...event })),
      audio: {
        state: context?.state ?? null,
        sampleRate: context?.sampleRate ?? null,
        outputLatencyMs: Number.isFinite(context?.outputLatency)
          ? context.outputLatency * 1000
          : null,
        baseLatencyMs: Number.isFinite(context?.baseLatency) ? context.baseLatency * 1000 : null,
        automaticMs: automaticMs(context),
        manualMs: manual,
        visualDelayMs: delayMs(context),
      },
    };
  }
  async function release(lock) {
    if (lock && !lock.released)
      try {
        await lock.release();
      } catch {}
  }
  async function acquire() {
    if (
      !active ||
      document.visibilityState !== 'visible' ||
      typeof navigator.wakeLock?.request !== 'function' ||
      sentinel ||
      pending
    )
      return;
    const epoch = lockEpoch;
    try {
      traceWake('requested');
      pending = navigator.wakeLock.request('screen');
      const lock = await pending;
      if (!active || epoch !== lockEpoch || document.visibilityState !== 'visible') {
        await release(lock);
        return;
      }
      sentinel = lock;
      traceWake('acquired');
      lock.addEventListener(
        'release',
        () => {
          if (sentinel === lock) sentinel = null;
          traceWake('released');
        },
        { once: true },
      );
    } catch (error) {
      traceWake(
        'rejected',
        ['NotAllowedError', 'NotSupportedError', 'AbortError', 'SecurityError'].includes(
          error?.name,
        )
          ? error.name
          : 'OtherError',
      );
      /* Denial or missing platform permission must never prevent audio. */
    } finally {
      pending = null;
      if (active && epoch !== lockEpoch) void acquire();
    }
  }
  function start() {
    if (active) return;
    active = true;
    generation++;
    lockEpoch++;
    void acquire();
  }
  function stop() {
    active = false;
    generation++;
    lockEpoch++;
    const lock = sentinel;
    sentinel = null;
    void release(lock);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void acquire();
    else {
      lockEpoch++;
      const lock = sentinel;
      sentinel = null;
      void release(lock);
    }
  });
  window.addEventListener('pagehide', stop);
  function automaticMs(context) {
    const value =
      Number.isFinite(context?.outputLatency) && context.outputLatency >= 0
        ? context.outputLatency
        : context?.baseLatency;
    return Number.isFinite(value) && value >= 0 ? value * 1000 : 0;
  }
  function delayMs(context) {
    return automaticMs(context) + manual;
  }
  function setManual(value) {
    if (!Number.isFinite(value) || value < -100 || value > 400) return false;
    try {
      localStorage.setItem(key, String(value));
    } catch {
      return false;
    }
    manual = value;
    return true;
  }
  const beats = [];
  function recordBeat(context, time) {
    beats.push({ context, time });
    if (beats.length > 128) beats.shift();
  }
  window.RENAX_PLAYBACK = Object.freeze({
    start,
    stop,
    delayMs,
    automaticMs,
    setManual,
    recordBeat,
    diagnosticSnapshot,
    get generation() {
      return generation;
    },
    get manualMs() {
      return manual;
    },
    get beats() {
      return beats.slice();
    },
  });
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      const section = document.createElement('section');
      section.className = 'index2-settings-section';
      section.id = 'latencySettings';
      section.innerHTML =
        '<h3 data-i18n-key="latency.heading"></h3><label class="index2-setting-row"><span data-i18n-key="latency.manual"></span><input id="visualLatencyMs" type="number" min="-100" max="400" step="1" ></label><p data-i18n-key="latency.help"></p><div class="latency-actions"><button type="button" class="btn" id="latencyCalibrate" data-i18n-key="latency.calibrate"></button><button type="button" class="btn" id="latencyTap" data-i18n-key="latency.tap" disabled></button><button type="button" class="btn" id="latencyApply" data-i18n-key="latency.apply" disabled></button><button type="button" class="btn" id="latencyCancel" data-i18n-key="latency.cancel" hidden></button></div><output id="latencyStatus" role="status" aria-live="polite" data-no-translate></output>';
      const panel = document.getElementById('index2SettingsPanel');
      if (!panel) return;
      panel.append(section);
      const input = section.querySelector('input'),
        calibrate = section.querySelector('#latencyCalibrate'),
        tap = section.querySelector('#latencyTap'),
        apply = section.querySelector('#latencyApply'),
        cancel = section.querySelector('#latencyCancel'),
        status = section.querySelector('output');
      let collecting = false,
        preparing = false,
        calibrationEpoch = 0,
        ownsPlayback = false,
        ownedGeneration = null,
        samples = [];
      const fallback = {
        'latency.heading': 'Synchronisation visuelle',
        'latency.manual': 'Compensation manuelle (ms)',
        'latency.help': 'Le décalage automatique de la sortie audio est ajouté à cette valeur.',
        'latency.calibrate': 'Calibrer',
        'latency.tap': 'Taper en rythme',
        'latency.apply': 'Appliquer',
        'latency.cancel': 'Annuler',
        'latency.instructions': 'Tapez au moins 5 fois avec le clic, puis appliquez la médiane.',
        'latency.samples': '{count} frappes enregistrées',
        'latency.saved': 'Calibration enregistrée.',
        'latency.saveError': 'Valeur invalide ou enregistrement local impossible.',
        'latency.audioError': 'Son indisponible pour la calibration.',
      };
      const t = (k) => {
        const value = window.RENAX_I18N?.t(k);
        return value && value !== k ? value : fallback[k] || k;
      };
      for (const element of section.querySelectorAll('[data-i18n-key]'))
        element.textContent = t(element.dataset.i18nKey);
      let statusKey = '',
        statusParameters = {};
      function renderStatus() {
        let text = statusKey ? t(statusKey) : '';
        for (const [key, value] of Object.entries(statusParameters))
          text = text.replaceAll('{' + key + '}', String(value));
        status.textContent = text;
      }
      function setStatus(key, parameters = {}) {
        statusKey = key;
        statusParameters = parameters;
        renderStatus();
      }
      window.addEventListener('renax-language-changed', renderStatus);
      input.value = String(manual);
      input.addEventListener('change', () => {
        if (!setManual(input.valueAsNumber)) {
          input.value = String(manual);
          setStatus('latency.saveError');
        } else setStatus('');
      });
      function finish() {
        const wasPreparing = preparing;
        calibrationEpoch++;
        preparing = false;
        collecting = false;
        tap.disabled = true;
        apply.disabled = true;
        cancel.hidden = true;
        calibrate.disabled = false;
        const shouldStop = ownsPlayback && (wasPreparing || ownedGeneration === generation);
        ownsPlayback = false;
        if (shouldStop) stopMetronome();
      }
      calibrate.onclick = async () => {
        if (playbackStarting) return;
        const request = ++calibrationEpoch;
        preparing = true;
        calibrate.disabled = true;
        cancel.hidden = false;
        samples = [];
        beats.length = 0;
        ownsPlayback = !isPlaying;
        try {
          if (ownsPlayback) await startMetronome();
          if (request !== calibrationEpoch) return;
          preparing = false;
          if (!isPlaying) throw Error('Audio unavailable');
          ownedGeneration = generation;
          collecting = true;
          tap.disabled = false;
          cancel.hidden = false;
          setStatus('latency.instructions');
          tap.focus();
        } catch (error) {
          if (request !== calibrationEpoch) return;
          finish();
          window.RENAX_FEEDBACK?.error(t('latency.audioError'), error);
        }
      };
      tap.onclick = () => {
        if (!collecting || !isPlaying) return;
        const candidates = beats.filter((b) => b.context === audioCtx);
        if (!candidates.length) return;
        const now = audioCtx.currentTime,
          auto = automaticMs(audioCtx) / 1000;
        const nearest = candidates.reduce((best, b) =>
          Math.abs(now - b.time - auto) < Math.abs(now - best.time - auto) ? b : best,
        );
        const delta = (now - nearest.time - auto) * 1000;
        if (delta < -100 || delta > 400) return;
        samples.push(delta);
        if (samples.length > 31) samples.shift();
        apply.disabled = samples.length < 5;
        setStatus('latency.samples', { count: samples.length });
      };
      apply.onclick = () => {
        if (samples.length < 5) return;
        const sorted = samples.slice().sort((a, b) => a - b),
          mid = Math.floor(sorted.length / 2),
          median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        if (setManual(Math.round(median))) {
          input.value = String(manual);
          finish();
          setStatus('latency.saved');
        } else setStatus('latency.saveError');
      };
      cancel.onclick = () => {
        finish();
        setStatus('');
      };
      new MutationObserver(() => {
        const panel = document.getElementById('index2SettingsPanel');
        if (
          (collecting || preparing) &&
          !panel.classList.contains('open') &&
          !panel.classList.contains('mobile-active')
        )
          finish();
      }).observe(document.getElementById('index2SettingsPanel'), {
        attributes: true,
        attributeFilter: ['class'],
      });
    },
    { once: true },
  );
})();
