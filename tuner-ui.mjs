import {
  INSTRUMENTS,
  TEMPERAMENTS,
  PitchTracker,
  noteName,
  targetFrequency,
  selectTarget,
  parseNote,
} from './tuner-core.mjs';

export function createTuner(root) {
  const el = (id) => root.querySelector('#tuner' + id);
  const text = (node, value) => {
    if (node.textContent !== value) node.textContent = value;
  };
  const t = (value) => window.RENAX_I18N?.t(value) || value;
  const defaults = {
    a4: 440,
    instrument: 'chromatic',
    temperament: 'equal',
    tonic: 0,
    transpose: 0,
    notation: 'solfege',
    accidentals: 'sharps',
    tolerance: 2,
    noise: 0.0015,
    calibration: 0,
    locked: null,
    customNotes: [40, 45, 50, 55, 59, 64],
    offsets: Array(12).fill(0),
  };
  let settings = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem('renax.tuner.v1') || 'null');
    if (saved && typeof saved === 'object') {
      for (const key of ['instrument', 'temperament', 'notation', 'accidentals'])
        if (typeof saved[key] === 'string') settings[key] = saved[key];
      for (const key of ['a4', 'tonic', 'transpose', 'tolerance', 'noise', 'calibration'])
        if (Number.isFinite(saved[key])) settings[key] = saved[key];
      if (Number.isInteger(saved.locked) && saved.locked >= 12 && saved.locked <= 108)
        settings.locked = saved.locked;
      if (
        Array.isArray(saved.offsets) &&
        saved.offsets.length === 12 &&
        saved.offsets.every((v) => Number.isFinite(v) && Math.abs(v) <= 50)
      )
        settings.offsets = saved.offsets;
      if (
        Array.isArray(saved.customNotes) &&
        saved.customNotes.length > 0 &&
        saved.customNotes.length <= 12 &&
        saved.customNotes.every((v) => Number.isInteger(v) && v >= 12 && v <= 108)
      )
        settings.customNotes = saved.customNotes;
    }
  } catch {}
  if (!INSTRUMENTS[settings.instrument]) settings.instrument = 'chromatic';
  if (!TEMPERAMENTS[settings.temperament]) settings.temperament = 'equal';
  for (const [key, min, max] of [
    ['a4', 340, 540],
    ['tonic', 0, 11],
    ['transpose', -12, 12],
    ['calibration', -50, 50],
  ])
    settings[key] = Math.max(min, Math.min(max, settings[key]));
  settings.tonic = Math.round(settings.tonic);
  settings.transpose = Math.round(settings.transpose);
  if (![1, 2, 5].includes(settings.tolerance)) settings.tolerance = 2;
  if (![0.0015, 0.005, 0.015].includes(settings.noise)) settings.noise = 0.0015;
  if (!['solfege', 'letters'].includes(settings.notation)) settings.notation = 'solfege';
  if (!['sharps', 'flats'].includes(settings.accidentals)) settings.accidentals = 'sharps';
  let generation = 0,
    context = null,
    stream = null,
    analyser = null,
    source = null,
    mute = null,
    worker = null;
  let timer = 0,
    watchdog = 0,
    requesting = false,
    active = false,
    pending = false,
    buffer = null;
  let referenceContext = null,
    referenceOscillator = null,
    toneTimer = 0,
    frame = 0,
    strobeOffset = 0,
    lastFrame = 0;
  let current = null,
    locked = settings.locked;
  const tracker = new PitchTracker(),
    reduce = matchMedia('(prefers-reduced-motion:reduce)');
  const name = (midi) =>
    noteName(
      midi + settings.transpose,
      settings.notation === 'solfege',
      settings.accidentals === 'flats',
    );
  const format = (value, digits = 1) =>
    value.toLocaleString(window.RENAX_I18N?.language || 'fr', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  const status = (value) => text(el('Status'), t(value));
  const save = () => {
    settings.locked = locked;
    try {
      localStorage.setItem('renax.tuner.v1', JSON.stringify(settings));
    } catch {}
  };
  function option(select, value, label) {
    const o = document.createElement('option');
    o.value = String(value);
    o.textContent = label;
    select.append(o);
  }
  for (const [id, item] of Object.entries(INSTRUMENTS)) option(el('Instrument'), id, t(item.name));
  for (const [id, item] of Object.entries(TEMPERAMENTS))
    option(el('Temperament'), id, t(item.name));
  for (let i = 0; i < 12; i++)
    option(
      el('Tonic'),
      i,
      noteName(i + 60, settings.notation === 'solfege', settings.accidentals === 'flats').replace(
        /4$/,
        '',
      ),
    );
  for (let i = 0; i < 12; i++) {
    const label = document.createElement('label'),
      input = document.createElement('input');
    label.append(
      document.createTextNode(
        noteName(i + 60, settings.notation === 'solfege', settings.accidentals === 'flats').replace(
          /4$/,
          '',
        ),
      ),
    );
    input.type = 'number';
    input.min = '-50';
    input.max = '50';
    input.step = '0.1';
    input.value = String(settings.offsets[i]);
    input.dataset.pitchClass = String(i);
    input.setAttribute('aria-label', label.textContent + ' · cents');
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (!input.value || !Number.isFinite(v) || Math.abs(v) > 50) {
        input.value = String(settings.offsets[i]);
        return;
      }
      settings.offsets[i] = v;
      save();
      render();
    });
    label.append(input);
    el('Offsets').querySelector('div').append(label);
  }
  el('Transpose').replaceChildren();
  for (let offset = -12; offset <= 12; offset++)
    option(
      el('Transpose'),
      offset,
      offset === 0
        ? t('Ut · son réel')
        : (offset > 0 ? '+' : '') +
            offset +
            ' · ' +
            ({ 2: 'Si♭', 9: 'Mi♭', 7: 'Fa', 12: '8va', [-12]: '8vb' }[offset] || t('demi-tons')),
    );
  for (let i = 0; i < 45; i++)
    el('Strobe').firstElementChild.append(document.createElement('span'));
  for (const [id, key] of [
    ['Instrument', 'instrument'],
    ['Temperament', 'temperament'],
    ['Tonic', 'tonic'],
    ['Transpose', 'transpose'],
    ['Notation', 'notation'],
    ['Accidentals', 'accidentals'],
    ['Tolerance', 'tolerance'],
    ['Noise', 'noise'],
    ['Calibration', 'calibration'],
  ]) {
    el(id).value = String(settings[key]);
    el(id).addEventListener('change', () => {
      const control = el(id),
        value = typeof defaults[key] === 'number' ? Number(control.value) : control.value;
      if (
        key === 'calibration' &&
        (!control.value || !Number.isFinite(value) || Math.abs(value) > 50)
      ) {
        control.value = String(settings.calibration);
        return;
      }
      settings[key] = value;
      tracker.reset();
      current = null;
      if (key === 'instrument') {
        locked = null;
        updateTargets();
      }
      if (['notation', 'accidentals', 'transpose'].includes(key)) updateTargets();
      if (key === 'temperament' && value === 'custom') el('Advanced').open = true;
      if (key === 'instrument' && value === 'custom') el('Advanced').open = true;
      updateSummary();
      save();
      render();
      updateTone();
    });
  }
  function setA4(value, { syncInput = true } = {}) {
    if (!Number.isFinite(value) || value < 340 || value > 540) return false;
    settings.a4 = Math.round(value * 10) / 10;
    if (syncInput) el('A4').value = String(settings.a4);
    el('A4Slider').value = String(settings.a4);
    el('A4Slider').setAttribute('aria-valuetext', format(settings.a4) + ' Hz');
    updateSummary();
    save();
    render();
    updateTone();
    return true;
  }
  el('A4').addEventListener('input', () => {
    if (el('A4').value) setA4(Number(el('A4').value), { syncInput: false });
  });
  el('A4').addEventListener('change', () => {
    if (!el('A4').value || !setA4(Number(el('A4').value))) el('A4').value = String(settings.a4);
  });
  el('A4Slider').addEventListener('input', () => setA4(Number(el('A4Slider').value)));
  for (const b of root.querySelectorAll('[data-tuner-a4]'))
    b.addEventListener('click', () => setA4(Number(b.dataset.tunerA4)));
  el('CustomNotes').value = settings.customNotes.map((v) => noteName(v)).join(' ');
  el('CustomNotes').addEventListener('change', () => {
    const raw = el('CustomNotes').value.trim().split(/\s+/),
      notes = raw.map(parseNote);
    if (
      !raw[0] ||
      notes.length > 12 ||
      !notes.every((v) => Number.isInteger(v) && v >= 12 && v <= 108)
    ) {
      el('CustomNotes').value = settings.customNotes.map((v) => noteName(v)).join(' ');
      status('Accordage invalide : indiquez de 1 à 12 notes, par exemple E2 A2 D3 G3 B3 E4.');
      return;
    }
    settings.customNotes = notes;
    locked = null;
    updateTargets();
    save();
    render();
  });
  function updateSummary() {
    text(
      el('Summary'),
      t(INSTRUMENTS[settings.instrument].name) +
        ' · ' +
        (window.RENAX_I18N?.language === 'fr' ? 'La4' : 'A4') +
        ' = ' +
        format(settings.a4) +
        ' Hz · ' +
        t(TEMPERAMENTS[settings.temperament].name),
    );
    el('Tonic').disabled = ['equal', 'custom'].includes(settings.temperament);
    el('Offsets').disabled = settings.temperament !== 'custom';
  }
  function updateTargets() {
    for (const option of el('Tonic').options)
      option.textContent = noteName(
        Number(option.value) + 60,
        settings.notation === 'solfege',
        settings.accidentals === 'flats',
      ).replace(/4$/, '');
    for (const label of el('Offsets').querySelectorAll('label'))
      label.firstChild.textContent = noteName(
        Number(label.querySelector('input').dataset.pitchClass) + 60,
        settings.notation === 'solfege',
        settings.accidentals === 'flats',
      ).replace(/4$/, '');
    const select = el('Target'),
      old = locked;
    select.replaceChildren();
    option(select, 'auto', t('Détection automatique'));
    for (let midi = 12; midi <= 108; midi++) option(select, midi, name(midi));
    locked = old;
    select.value = locked === null ? 'auto' : String(locked);
    el('Strings').replaceChildren();
    const notes =
      settings.instrument === 'custom'
        ? settings.customNotes
        : INSTRUMENTS[settings.instrument].notes;
    notes.forEach((midi, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = name(midi);
      b.setAttribute('aria-label', t('Corde') + ' ' + (i + 1) + ' · ' + name(midi));
      b.setAttribute('aria-pressed', String(midi === locked));
      b.addEventListener('click', () => {
        locked = locked === midi ? null : midi;
        select.value = locked === null ? 'auto' : String(locked);
        updateStringButtons();
        save();
        render();
        updateTone();
      });
      b.dataset.midi = String(midi);
      el('Strings').append(b);
    });
  }
  function updateStringButtons() {
    for (const b of el('Strings').children)
      b.setAttribute('aria-pressed', String(Number(b.dataset.midi) === locked));
  }
  el('Target').addEventListener('change', () => {
    locked = el('Target').value === 'auto' ? null : Number(el('Target').value);
    updateStringButtons();
    save();
    render();
    updateTone();
  });
  function render() {
    if (!current) {
      text(el('Note'), '—');
      text(el('Frequency'), '— Hz');
      text(el('Cents'), '— cents');
      el('Needle').setAttribute('visibility', 'hidden');
      el('Strobe').dataset.active = 'false';
      root.querySelector('.tuner-measurement').dataset.tuned = 'false';
      return;
    }
    const frequency = current.frequency * 2 ** (settings.calibration / 1200),
      target = selectTarget(frequency, settings, locked);
    text(el('Note'), name(target.midi));
    text(el('Frequency'), format(frequency, 2) + ' Hz');
    text(el('Cents'), (target.cents >= 0 ? '+' : '−') + format(Math.abs(target.cents)) + ' cents');
    const cents = Math.max(-50, Math.min(50, target.cents));
    el('Needle').setAttribute('transform', 'rotate(' + cents.toFixed(2) + ' 210 202)');
    el('Needle').setAttribute('visibility', 'visible');
    const stable = current.spread <= Math.max(settings.tolerance * 2, 4),
      tuned = stable && Math.abs(target.cents) <= settings.tolerance;
    root.querySelector('.tuner-measurement').dataset.tuned = String(tuned);
    el('Strobe').dataset.active = 'true';
    status(
      !stable
        ? 'Note en cours de stabilisation…'
        : tuned
          ? 'Juste'
          : target.cents < 0
            ? 'Trop grave — montez la note'
            : 'Trop aigu — baissez la note',
    );
    text(el('Signal'), t('Signal détecté') + ' · ' + Math.round(current.clarity * 100) + ' %');
    current.cents = target.cents;
  }
  function animate(now) {
    if (!active) return;
    const dt = Math.min(100, now - lastFrame);
    lastFrame = now;
    if (current && !reduce.matches) {
      strobeOffset =
        (strobeOffset + Math.max(-50, Math.min(50, current.cents || 0)) * dt * 0.008) % 20;
      el('Strobe').firstElementChild.setAttribute(
        'style',
        'transform:translateX(' + strobeOffset.toFixed(2) + 'px)',
      );
    }
    frame = requestAnimationFrame(animate);
  }
  function stopTone() {
    clearTimeout(toneTimer);
    toneTimer = 0;
    if (referenceOscillator) {
      try {
        referenceOscillator.stop();
      } catch {}
      referenceOscillator.disconnect();
      referenceOscillator = null;
    }
    if (referenceContext) {
      referenceContext.close().catch(() => {});
      referenceContext = null;
    }
    el('Tone').setAttribute('aria-pressed', 'false');
    text(el('Tone'), t('Écouter la référence'));
  }
  function updateTone() {
    if (referenceOscillator)
      referenceOscillator.frequency.setTargetAtTime(
        targetFrequency(locked ?? 69, settings),
        referenceContext.currentTime,
        0.015,
      );
  }
  function stop(message = 'Microphone arrêté', { tone = true } = {}) {
    generation++;
    clearTimeout(timer);
    clearTimeout(watchdog);
    cancelAnimationFrame(frame);
    timer = watchdog = frame = 0;
    active = requesting = pending = false;
    worker?.terminate();
    worker = null;
    const tracks = stream?.getTracks() || [];
    stream = null;
    for (const track of tracks) {
      track.onended = null;
      track.stop();
    }
    for (const node of [source, analyser, mute])
      try {
        node?.disconnect();
      } catch {}
    source = analyser = mute = null;
    const old = context;
    context = null;
    if (old) {
      old.onstatechange = null;
      old.close().catch(() => {});
    }
    tracker.reset();
    current = null;
    buffer = null;
    render();
    el('Listen').setAttribute('aria-pressed', 'false');
    text(el('Listen'), t('Activer le microphone'));
    text(el('Signal'), t('Microphone arrêté'));
    status(message === 'Microphone arrêté' ? 'Jouez une note claire et tenue.' : message);
    if (tone) stopTone();
  }
  async function listInputs() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices(),
        selected = el('Input').value;
      el('Input').replaceChildren();
      option(el('Input'), '', 'Microphone par défaut');
      let count = 0;
      for (const device of devices.filter((d) => d.kind === 'audioinput'))
        option(el('Input'), device.deviceId, device.label || t('Microphone') + ' ' + ++count);
      if ([...el('Input').options].some((o) => o.value === selected)) el('Input').value = selected;
    } catch {}
  }
  async function start() {
    stopTone();
    if (document.documentElement.dataset.tool !== 'tuner') return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio || !navigator.mediaDevices?.getUserMedia || !window.Worker || !isSecureContext) {
      status('Microphone indisponible : ouvrez le site en HTTPS dans un navigateur compatible.');
      return;
    }
    const token = ++generation;
    requesting = true;
    el('Listen').setAttribute('aria-pressed', 'true');
    text(el('Listen'), t('Annuler'));
    status('Autorisez le microphone dans le navigateur.');
    let acquired = null,
      localContext = null;
    try {
      localContext = new Audio({ latencyHint: 'interactive', sampleRate: 48000 });
      context = localContext;
      // Resume from the user gesture; handle rejection immediately, even if the permission stays pending.
      const resumed = localContext.resume().then(
        () => null,
        (error) => error,
      );
      const input = el('Input').value;
      acquired = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          ...(input ? { deviceId: { exact: input } } : {}),
        },
        video: false,
      });
      if (
        token !== generation ||
        document.hidden ||
        document.documentElement.dataset.tool !== 'tuner'
      ) {
        acquired.getTracks().forEach((track) => track.stop());
        localContext.close().catch(() => {});
        return;
      }
      stream = acquired;
      const resumeError = await resumed;
      if (resumeError) throw resumeError;
      if (token !== generation) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      source = localContext.createMediaStreamSource(acquired);
      analyser = localContext.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0;
      mute = localContext.createGain();
      mute.gain.value = 0;
      source.connect(analyser);
      analyser.connect(mute);
      mute.connect(localContext.destination);
      worker = new Worker(new URL('./tuner-worker.mjs', import.meta.url), { type: 'module' });
      buffer = new Float32Array(8192);
      worker.onmessage = ({ data }) => {
        if (token !== generation) return;
        clearTimeout(watchdog);
        pending = false;
        buffer = new Float32Array(data.buffer);
        current = tracker.update(data.result, performance.now());
        render();
        if (!current) {
          status(
            data.result ? 'Note en cours de stabilisation…' : 'Jouez une note claire et tenue.',
          );
          text(el('Signal'), t('En écoute'));
        }
      };
      worker.onerror = () => {
        if (token === generation) stop('Analyse indisponible. Réessayez.');
      };
      for (const track of stream.getAudioTracks())
        track.onended = () => {
          if (token === generation) stop('Microphone déconnecté. Réactivez l’écoute.');
        };
      localContext.onstatechange = () => {
        if (token === generation && localContext.state === 'suspended')
          stop('Écoute interrompue. Réactivez le microphone.');
      };
      requesting = false;
      active = true;
      text(el('Listen'), t('Arrêter le microphone'));
      status('Jouez une note claire et tenue.');
      text(el('Signal'), t('En écoute'));
      function capture() {
        if (token !== generation || !active) return;
        if (!pending && buffer) {
          analyser.getFloatTimeDomainData(buffer);
          pending = true;
          worker.postMessage(
            {
              buffer: buffer.buffer,
              sampleRate: localContext.sampleRate,
              noiseFloor: settings.noise,
            },
            [buffer.buffer],
          );
          buffer = null;
          watchdog = setTimeout(() => {
            if (token === generation) stop('Analyse trop lente. Réessayez.');
          }, 2500);
        }
        timer = setTimeout(capture, 60);
      }
      capture();
      lastFrame = performance.now();
      frame = requestAnimationFrame(animate);
      listInputs();
    } catch (error) {
      acquired?.getTracks().forEach((track) => track.stop());
      if (token !== generation) return;
      const messages = {
        NotAllowedError:
          'Accès au microphone refusé. Autorisez-le dans les paramètres du navigateur.',
        NotFoundError: 'Aucun microphone détecté.',
        NotReadableError: 'Microphone occupé ou indisponible.',
        OverconstrainedError: 'Cette entrée audio n’est plus disponible.',
      };
      stop(messages[error.name] || 'Impossible de démarrer le microphone. Réessayez.');
    }
  }
  el('Listen').addEventListener('click', () => {
    if (active || requesting) stop();
    else start();
  });
  el('Input').addEventListener('change', () => {
    if (active || requesting) {
      stop();
      start();
    }
  });
  el('Tone').addEventListener('click', async () => {
    if (referenceOscillator) {
      stopTone();
      status('Note de référence arrêtée.');
      return;
    }
    stop('Microphone arrêté');
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) {
      status('Sortie audio indisponible.');
      return;
    }
    const token = generation;
    try {
      const audio = new Audio();
      referenceContext = audio;
      await audio.resume();
      if (
        token !== generation ||
        document.hidden ||
        document.documentElement.dataset.tool !== 'tuner'
      ) {
        audio.close().catch(() => {});
        return;
      }
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0, audio.currentTime);
      gain.gain.linearRampToValueAtTime(0.06, audio.currentTime + 0.025);
      gain.connect(audio.destination);
      referenceOscillator = audio.createOscillator();
      referenceOscillator.type = 'sine';
      referenceOscillator.frequency.value = targetFrequency(locked ?? 69, settings);
      referenceOscillator.connect(gain);
      referenceOscillator.start();
      el('Tone').setAttribute('aria-pressed', 'true');
      text(el('Tone'), t('Arrêter la référence'));
      status('Note de référence · écoute du microphone arrêtée.');
      toneTimer = setTimeout(() => {
        stopTone();
        status('Note de référence arrêtée.');
      }, 15000);
    } catch {
      stopTone();
      status('Sortie audio indisponible.');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
  });
  window.addEventListener('pagehide', () => stop());
  navigator.mediaDevices?.addEventListener?.('devicechange', () => {
    if (active) listInputs();
  });
  window.addEventListener('renax-language-changed', () => {
    updateSummary();
    updateTargets();
    render();
  });
  setA4(settings.a4);
  updateTargets();
  updateSummary();
  render();
  return { stop };
}
