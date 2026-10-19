/* Screen ownership and visual-only output compensation. Never changes audio timestamps. */
(() => {
  'use strict';
  const key = 'renax.visualLatencyMs.v1';
  const bluetoothKey = 'renax.bluetoothHeadphones.v1';
  let bluetoothEnabled = false;
  let active = false,
    generation = 0,
    lockEpoch = 0,
    sentinel = null,
    pending = null;
  const manual = 200;
  try {
    const saved = localStorage.getItem(bluetoothKey);
    const legacy = Number(localStorage.getItem(key));
    bluetoothEnabled = saved === null ? Number.isFinite(legacy) && legacy !== 0 : saved === 'true';
  } catch {}
  function setBluetoothEnabled(value) {
    if (typeof value !== 'boolean') return false;
    try {
      localStorage.setItem(bluetoothKey, String(value));
    } catch {
      return false;
    }
    bluetoothEnabled = value;
    return true;
  }
  const wakeEvents = [];
  function traceWake(state, reason = null) {
    wakeEvents.push({ state, reason, at: performance.now(), visibility: document.visibilityState });
    if (wakeEvents.length > 32) wakeEvents.shift();
  }
  let outputProbe = { status: 'notRequested', outputs: [], sinkHash: null, error: null };
  let probePending = false;
  async function identifierHash(value) {
    if (!value) return null;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }
  async function readOutputs() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = await Promise.all(
      devices
        .filter((device) => device.kind === 'audiooutput')
        .slice(0, 16)
        .map(async (device) => ({
          default: device.deviceId === 'default',
          idHash: await identifierHash(device.deviceId),
          groupHash: await identifierHash(device.groupId),
          labelExposed: !!device.label,
        })),
    );
    const context = typeof audioCtx === 'undefined' ? null : audioCtx;
    const sink = context?.sinkId;
    outputProbe = {
      status: 'ready',
      outputs,
      sinkHash: typeof sink === 'string' && sink ? await identifierHash(sink) : null,
      sinkExposed: typeof sink === 'string',
      usesSystemDefault: typeof sink === 'string' ? sink === '' || sink === 'default' : null,
      error: null,
    };
  }
  async function identifyOutputs() {
    if (active || (typeof playbackStarting !== 'undefined' && playbackStarting))
      return 'stopRequired';
    if (probePending) return 'pending';
    if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
      outputProbe = { status: 'unsupported', outputs: [], sinkHash: null, error: null };
      return 'unsupported';
    }
    probePending = true;
    outputProbe = { status: 'pending', outputs: [], sinkHash: null, error: null };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      // Permission is used only to expose device metadata. No recorder or audio graph is created.
      for (const track of stream.getTracks()) track.stop();
      await readOutputs();
      return 'ready';
    } catch (error) {
      const name = [
        'NotAllowedError',
        'NotFoundError',
        'NotReadableError',
        'SecurityError',
      ].includes(error?.name)
        ? error.name
        : 'OtherError';
      outputProbe = { status: 'failed', outputs: [], sinkHash: null, error: name };
      return 'failed';
    } finally {
      probePending = false;
    }
  }
  function diagnosticSnapshot(context) {
    const policy = document.permissionsPolicy || document.featurePolicy;
    let policyAllowed = null;
    try {
      if (policy?.allowsFeature) policyAllowed = policy.allowsFeature('screen-wake-lock');
    } catch {}
    return {
      active,
      outputIdentification: {
        ...outputProbe,
        outputs: outputProbe.outputs.map((output) => ({ ...output })),
      },
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
        bluetoothEnabled,
        appliedManualMs: bluetoothEnabled ? manual : 0,
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
    return automaticMs(context) + (bluetoothEnabled ? manual : 0);
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
    setBluetoothEnabled,
    get bluetoothEnabled() {
      return bluetoothEnabled;
    },
    recordBeat,
    diagnosticSnapshot,
    identifyOutputs,
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
      const panel = document.getElementById('index2SettingsPanel');
      if (!panel) return;
      const section = document.createElement('section');
      section.id = 'latencySettings';
      section.className = 'index2-settings-section';
      section.innerHTML =
        '<h3 data-i18n-key="latency.heading"></h3><label class="index2-setting-row"><span data-i18n-key="latency.bluetooth"></span><input id="bluetoothHeadphones" type="checkbox"></label><p data-i18n-key="latency.bluetoothHelp"></p><p data-i18n-key="latency.identifyHelp"></p><button type="button" class="btn" id="latencyIdentifyOutputs" data-i18n-key="latency.identify"></button><output id="latencyStatus" role="status" aria-live="polite" data-no-translate></output>';
      panel.append(section);
      const bluetooth = section.querySelector('#bluetoothHeadphones');
      const identify = section.querySelector('#latencyIdentifyOutputs');
      const status = section.querySelector('#latencyStatus');
      let statusKey = '';
      const fallback = {
        'latency.heading': 'Synchronisation visuelle',
        'latency.bluetooth': 'Casque Bluetooth',
        'latency.bluetoothHelp':
          'Ajoute 200 ms au visuel. Désactivez cette option sur haut-parleur ou casque filaire.',
        'latency.identify': 'Identifier les sorties audio',
        'latency.identifyHelp':
          'Autorisation micro ponctuelle pour identifier les sorties. Aucun enregistrement. Arrêtez la lecture avant de continuer.',
        'latency.identify.ready': 'Identification terminée. Exportez le diagnostic.',
        'latency.identify.failed':
          'Identification impossible ou autorisation refusée. Exportez le diagnostic.',
        'latency.identify.unsupported':
          'Identification des sorties indisponible dans ce navigateur.',
        'latency.identify.stopRequired': 'Arrêtez la lecture avant de demander cette autorisation.',
        'latency.identify.pending': 'Identification en cours…',
        'latency.saveError': 'Valeur invalide ou enregistrement local impossible.',
      };
      const t = (key) => {
        const value = window.RENAX_I18N?.t(key);
        return value && value !== key ? value : fallback[key] || key;
      };
      for (const element of section.querySelectorAll('[data-i18n-key]'))
        element.textContent = t(element.dataset.i18nKey);
      const renderStatus = () => {
        status.textContent = statusKey ? t(statusKey) : '';
      };
      window.addEventListener('renax-language-changed', renderStatus);
      bluetooth.checked = bluetoothEnabled;
      bluetooth.onchange = () => {
        statusKey = setBluetoothEnabled(bluetooth.checked) ? '' : 'latency.saveError';
        bluetooth.checked = bluetoothEnabled;
        renderStatus();
      };
      identify.onclick = async () => {
        identify.disabled = true;
        try {
          statusKey = 'latency.identify.' + (await identifyOutputs());
          renderStatus();
        } finally {
          identify.disabled = false;
        }
      };
    },
    { once: true },
  );
})();
