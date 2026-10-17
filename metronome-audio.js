
    const mobileTabs = document.getElementById('mobileTabs');
    const panels = document.querySelectorAll('.panel');
    const paramsPanel = document.querySelector('.panel-params');
    const trainingSection = paramsPanel?.querySelector('.training-section');
    const mobileTrainingHost = document.getElementById('mobileTrainingHost');
    const trainingPlaceholder = document.createComment('training-section-home');
    if(trainingSection) trainingSection.before(trainingPlaceholder);

    function placeTrainingSection(){
      if(trainingSection && mobileTrainingHost && trainingSection.parentNode!==mobileTrainingHost) mobileTrainingHost.append(trainingSection);
    }
    placeTrainingSection();
    window.addEventListener('resize',placeTrainingSection);

    function switchTab(name) {
      document.body.classList.toggle('training-tab-open',name==='training');
      mobileTabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
      panels.forEach(p => p.classList.toggle('mobile-active', p.dataset.panel === name));
      if (name === 'visu') setTimeout(() => { resizeCanvas(); updateRingRadius(); if(appMode!=='polyrhythm' && measures[activeMeasureIndex])renderSubdivisionDots(measures[activeMeasureIndex]); }, 30);
    }
    mobileTabs.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (btn) switchTab(btn.dataset.tab);
    });

    // Smartphone : le BPM de Visualisation est un vrai bouton.
    // Il ouvre Réglages et place directement la zone Tempo en haut du panneau.
    function openMobileTempoSettings() {
      if (window.innerWidth > 1100) return;
      switchTab('params');
      const paramsPanel = document.querySelector('.panel-params');
      if (paramsPanel) paramsPanel.scrollTop = 0;
      requestAnimationFrame(() => {
        const tempoGroup = bpmSlider?.closest('.control-group') || bpmDisplay?.closest('.control-group');
        if (tempoGroup) tempoGroup.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
    }

    let audioCtx = null;
    let masterVolume = 0.8;
    let currentBank = 'userMetroclic';

    function reportAudioFailure(error){
      console.error('Lecture audio indisponible',error);
      if(isPlaying)stopMetronome();
      if(training.engaged)endTraining();
      window.RENAX_FEEDBACK?.error('Impossible de démarrer le son. Vérifiez la sortie audio et réessayez.',error);
    }

    async function initAudio() {
      const Context=window.AudioContext||window.webkitAudioContext;
      if(!Context)throw Error('Web Audio n’est pas disponible dans ce navigateur.');
      if (!audioCtx||audioCtx.state==='closed') audioCtx = new Context();
      if (audioCtx.state === 'suspended'||audioCtx.state==='interrupted') await audioCtx.resume();
      if(audioCtx.state!=='running')throw Error('La sortie audio est suspendue. Réessayez après avoir autorisé le son.');
      return audioCtx;
    }

    function oscTone(dest, time, opts) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(opts.freqStart, time);
      if (opts.freqEnd !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), time + (opts.pitchTime || 0.03));
      }
      osc.connect(gain); gain.connect(dest);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(opts.vol, time + (opts.attack || 0.002));
      gain.gain.exponentialRampToValueAtTime(0.0001, time + (opts.duration || 0.08));
      osc.start(time); osc.stop(time + (opts.duration || 0.08) + 0.02);
    }

    function noiseBurst(dest, time, vol, duration, hpFreq) {
      const bufSize = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
      const buffer = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2);
      }
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = hpFreq || 2000;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      src.connect(hp); hp.connect(gain); gain.connect(dest);
      src.start(time); src.stop(time + duration + 0.01);
    }

    const FIRST_BEAT_RATIO = 1.35;
    const FIRST_BEAT_VOL = 1.25;
    const OTHER_STRONG_BEAT_RATIO = FIRST_BEAT_RATIO * Math.pow(2, -2 / 12);
    function isOtherStrongBeat(m, beat, subIndex) {
      if (beat === 0 || subIndex !== 0) return false;
      let groups;
      const custom = m.rhythmEditor;
      if (custom?.custom && Array.isArray(custom.groups) && custom.groups.every(n => n === 2 || n === 3) && custom.groups.reduce((a,b)=>a+b,0) === m.numerator) groups = custom.groups;
      else if (m.denominator >= 8 && m.numerator % 3 === 0) groups = Array(m.numerator / 3).fill(3);
      else if (m.denominator >= 8 && m.numerator >= 5 && m.numerator % 2) groups = [...Array((m.numerator - 3) / 2).fill(2), 3];
      else if (m.denominator >= 8 && m.numerator % 2 === 0) groups = Array(m.numerator / 2).fill(2);
      else if (m.numerator === 4) groups = [2, 2];
      else return false;
      let start = 0;
      for (const length of groups) { if (start === beat) return true; start += length; }
      return false;
    }


    const VOICE_METRONOME_FILES = {
      male:     'assets/voices/voice-men-en',
      female:   'assets/voices/voice-female-en',
    };

    // Reviewed vowel-nucleus anchors in the complete original human recordings.
    // See tests/voice-anchors.json; consonant pre-roll and internal pauses are retained.
    // Natural pitch is preserved and the Web Audio beat grid never moves.
    const VOICE_ATTACK_SECONDS = {
      male: [0, 0.116, 0.175, 0.262, 0.143, 0.195, 0.256, 0.216, 0.097, 0.12, 0.176, 0.211, 0.15, 0.128, 0.125, 0.105, 0.189, 0.187, 0.091, 0.129, 0.14],
      female: [0,0.107,0.095,0.076,0.118,0.105,0.175,0.17,0.093,0.078,0.071,0.163,0.098,0.022,0.116,0.112,0.131,0.138,0.019,0.06,0.074],
    };
    const VOICE_MAX_ATTACK_SECONDS = Math.max(...Object.values(VOICE_ATTACK_SECONDS).flat());
    const VOICE_AUDIO_REVISION = '20261005-complete-v2';
    const scheduledVoiceSources = new Set();

    const VOICE_METRONOME_BUFFERS = {
      male: Object.create(null),
      female: Object.create(null),
    };
    const VOICE_METRONOME_PROMISES = { male: null, female: null };

    const audioReadyWrap = document.getElementById('audioReadyWrap');
    const audioReadyLabel = document.getElementById('audioReadyLabel');
    const audioReadyBar = document.getElementById('audioReadyBar');
    let allVoiceAudioReady = false;
    let allVoiceAudioPromise = null;

    function ensureAudioContextForDecode() {
      const Context=window.AudioContext||window.webkitAudioContext;
      if(!Context)throw Error('Web Audio n’est pas disponible dans ce navigateur.');
      if (!audioCtx||audioCtx.state==='closed') audioCtx = new Context();
      return audioCtx;
    }

    function setAudioLoadProgress(done, total) {
      const pct = total ? Math.round((done / total) * 100) : 0;
      if (audioReadyBar) audioReadyBar.style.width = pct + '%';
      if (audioReadyLabel && !allVoiceAudioReady) audioReadyLabel.textContent = `PRÉPARATION AUDIO... ${pct}%`;
    }

    async function prepareAllVoiceAudio() {
      if (allVoiceAudioReady) return;
      if (allVoiceAudioPromise) return allVoiceAudioPromise;

      const decodingContext=ensureAudioContextForDecode();

      const entries = [];
      for (const [gender, folder] of Object.entries(VOICE_METRONOME_FILES)) {
        for (let n = 1; n <= 20; n++) {
          entries.push([gender, String(n), `${folder}/${String(n).padStart(2, '0')}.wav?v=${VOICE_AUDIO_REVISION}`]);
        }
      }

      if(audioReadyWrap){audioReadyWrap.hidden=false;audioReadyWrap.classList.remove('ready','fade-out');}
      let done = 0;
      setAudioLoadProgress(0, entries.length);

      allVoiceAudioPromise = Promise.allSettled(entries.map(async ([gender, num, url]) => {
        if(VOICE_METRONOME_BUFFERS[gender][num]){done++;setAudioLoadProgress(done,entries.length);return;}
        const response = await fetch(url, { cache: 'force-cache', signal:globalThis.AbortSignal?.timeout?.(15000) });
        if (!response.ok) throw new Error(`HTTP ${response.status} — ${url}`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await decodingContext.decodeAudioData(arrayBuffer);
        VOICE_METRONOME_BUFFERS[gender][num] = buffer;
        done += 1;
        setAudioLoadProgress(done, entries.length);
      })).then(results => {
        const failed=results.find(result=>result.status==='rejected');
        if(failed)throw failed.reason;
        allVoiceAudioReady = true;
        window.dispatchEvent(new Event('renax-voices-ready'));
        Object.keys(VOICE_METRONOME_PROMISES).forEach(k => VOICE_METRONOME_PROMISES[k] = Promise.resolve());
        playBtn.disabled = false;
        playBtn.classList.remove('audio-loading');
        if (audioReadyWrap) audioReadyWrap.classList.add('ready');
        if (audioReadyLabel) audioReadyLabel.textContent = 'READY';
        setTimeout(() => audioReadyWrap?.classList.add('fade-out'), 5000);
      }).catch(err => {
        allVoiceAudioPromise = null;
        if (audioReadyLabel) audioReadyLabel.textContent = 'Voix indisponibles. Les clics restent disponibles.';
        if (audioReadyWrap) audioReadyWrap.hidden = false;
        console.warn('Audio preparation failed:', err);
        throw err;
      });

      return allVoiceAudioPromise;
    }

    async function ensureVoiceMetronomeReady(bankKey = currentBank) {
      const gender =
        bankKey === 'voiceMale' ? 'male' :
        bankKey === 'voiceFemale' ? 'female' :
        null;
      if (!gender) return;
      await prepareAllVoiceAudio();
    }

    function playVoiceSubdivisionTick(dest, time, state, isFirst) {
      let freq = state === 3 ? 1450 : state === 2 ? 1100 : 820;
      let vol = state === 3 ? 0.64 : state === 2 ? 0.48 : 0.36;
      if (isFirst) vol *= 1.08;

      // Keep subdivision ticks on their own path so a simultaneous voice sample
      // cannot mask them inside the shared voice guard/mixer.
      const tickOut = audioCtx.createGain();
      tickOut.gain.setValueAtTime(masterVolume * 0.38 * Math.pow(10, 4.5 / 20), time);
      tickOut.connect(getAudioMixDestination(audioCtx));
      oscTone(tickOut, time, {
        type: 'triangle',
        freqStart: freq,
        freqEnd: freq * 0.78,
        pitchTime: 0.018,
        vol,
        attack: 0.001,
        duration: 0.032
      });
    }

    function playVoiceMetronome(gender, dest, time, state, isFirst, context = {}) {
      return renderVoiceCount(gender, dest, time, state, isFirst, context, {
        anchors: VOICE_ATTACK_SECONDS[gender], volumes: [0,.72,.82,.92], firstGain:1.08, playbackRate:1, normalizeVolume:true
      });
    }

    // The renderer shares recordings only. Each caller owns its timing and mix parameters.
    function renderVoiceCount(gender, dest, time, state, isFirst, context, settings) {
      const beatNumber = Number(context.beatNumber) || 0;
      const subIndex = Number(context.subIndex) || 0;
      const beatDurationSec = Math.max(0.08, Number(context.beatDurationSec) || 0.5);
      const buffer = beatNumber > 0 ? VOICE_METRONOME_BUFFERS[gender][String(beatNumber)] : null;

      // En mode métronome, la voix compte uniquement le début de chaque temps.
      // Les subdivisions gardent un petit repère sonore pour rester exploitables.
      if (buffer && subIndex === 0) {
        const src = audioCtx.createBufferSource();
        const gain = audioCtx.createGain();
        src.buffer = buffer;

        // La voix reste à sa hauteur naturelle : aucune accélération/pitch liée au tempo.
        // Le timing du métronome reste piloté par Web Audio, indépendamment de la durée du sample.
        const attack = settings.anchors[beatNumber] || 0;
        const sourceTime = time - attack / settings.playbackRate;
        // If a callback was delayed, skip only the elapsed pre-roll rather than
        // shifting this beat or every following beat. Normal scheduling is ahead.
        const startTime = Math.max(audioCtx.currentTime, sourceTime);
        const offset = Math.max(0, startTime - sourceTime) * settings.playbackRate;
        if (offset >= buffer.duration) return; // A fully missed word cannot be replayed on time.
        src.playbackRate.setValueAtTime(settings.playbackRate, startTime);

        let vol = settings.volumes[state] || settings.volumes[1];
        if (isFirst) vol *= settings.firstGain;
        if(settings.normalizeVolume)vol*=voiceLoudnessGain(buffer,attack);
        gain.gain.setValueAtTime(vol, startTime);

        src.connect(gain);
        gain.connect(dest);
        scheduledVoiceSources.add(src);
        src.onended = () => scheduledVoiceSources.delete(src);
        src.start(startTime, offset);

        // Les accents vocaux utilisent uniquement le volume, sans clic superposé.
        return;
      }

      playVoiceSubdivisionTick(dest, time, state, isFirst);
    }

    function voiceLoudnessGain(buffer,anchor){
      const cache=voiceLoudnessGain.cache||(voiceLoudnessGain.cache=new WeakMap());
      if(cache.has(buffer))return cache.get(buffer);
      const start=Math.floor(anchor*buffer.sampleRate),end=Math.min(buffer.length,start+Math.round(buffer.sampleRate*.04));
      let energy=0,peak=0;for(let channel=0;channel<buffer.numberOfChannels;channel++){const pcm=buffer.getChannelData(channel);for(let n=0;n<pcm.length;n++){peak=Math.max(peak,Math.abs(pcm[n]));if(n>=start&&n<end)energy+=pcm[n]*pcm[n];}}
      const rms=Math.sqrt(energy/Math.max(1,(end-start)*buffer.numberOfChannels));
      const gain=Math.min(.045/Math.max(rms,1e-6),.85/Math.max(peak*.92*1.08,1e-6));cache.set(buffer,gain);return gain;
    }

    const SOUND_BANKS = {
      clic: {
        name: 'Clic',
        play(dest, time, state, isFirst, context = {}) {
          let freq = state === 3 ? 900 : state === 2 ? 1300 : 1800;
          let vol  = 0.55;
          if (isFirst) { freq *= FIRST_BEAT_RATIO; vol *= FIRST_BEAT_VOL; }
          else if (context.isMainBeat) { freq *= OTHER_STRONG_BEAT_RATIO; if (context.isOtherStrongBeat) vol *= FIRST_BEAT_VOL; }
          oscTone(dest, time, {
            type: 'sine', freqStart: freq, freqEnd: freq * 0.7,
            pitchTime: 0.02, vol, attack: 0.001, duration: 0.035
          });
        }
      },
      cloche: {
        name: 'Cloche',
        play(dest, time, state, isFirst, context = {}) {
          let base = state === 3 ? 650 : state === 2 ? 900 : 1200;
          let vol  = 0.42;
          if (isFirst) { base *= FIRST_BEAT_RATIO; vol *= FIRST_BEAT_VOL; }
          else if (context.isMainBeat) { base *= OTHER_STRONG_BEAT_RATIO; if (context.isOtherStrongBeat) vol *= FIRST_BEAT_VOL; }
          oscTone(dest, time, { type: 'sine', freqStart: base, vol, attack: 0.003, duration: 0.42 });
          oscTone(dest, time, { type: 'sine', freqStart: base * 2.76, vol: vol * 0.4, attack: 0.002, duration: 0.26 });
          oscTone(dest, time, { type: 'sine', freqStart: base * 5.4, vol: vol * 0.18, attack: 0.001, duration: 0.12 });
        }
      },
      claves: {
        name: 'Claves',
        play(dest, time, state, isFirst, context = {}) {
          let freq = state === 3 ? 1400 : state === 2 ? 1900 : 2500;
          let vol  = 0.5;
          if (isFirst) { freq *= FIRST_BEAT_RATIO; vol *= FIRST_BEAT_VOL; }
          else if (context.isMainBeat) { freq *= OTHER_STRONG_BEAT_RATIO; if (context.isOtherStrongBeat) vol *= FIRST_BEAT_VOL; }
          oscTone(dest, time, {
            type: 'triangle', freqStart: freq, freqEnd: freq * 0.62,
            pitchTime: 0.03, vol, attack: 0.001, duration: 0.055
          });
        }
      },
      clic808: {
        name: 'Clic 808',
        play(dest, time, state, isFirst, context = {}) {
          const ratio = isFirst ? FIRST_BEAT_RATIO : context.isMainBeat ? OTHER_STRONG_BEAT_RATIO : 1;
          const volMul = isFirst || context.isOtherStrongBeat ? FIRST_BEAT_VOL : 1;
          if (state === 1) {
            oscTone(dest, time, {
              type: 'square', freqStart: 1200 * ratio, freqEnd: 520 * ratio,
              pitchTime: 0.03, vol: 0.42 * volMul, attack: 0.001, duration: 0.045
            });
          } else if (state === 2) {
            oscTone(dest, time, { type: 'square', freqStart: 540 * ratio, vol: 0.24 * volMul, attack: 0.002, duration: 0.11 });
            oscTone(dest, time, { type: 'square', freqStart: 800 * ratio, vol: 0.24 * volMul, attack: 0.002, duration: 0.11 });
          } else if (state === 3) {
            oscTone(dest, time, {
              type: 'sine', freqStart: 130 * ratio, freqEnd: 42 * ratio,
              pitchTime: 0.1, vol: 0.82 * volMul, attack: 0.003, duration: 0.2
            });
          }
        }
      },
      beep: {
        name: 'Beep',
        play(dest, time, state, isFirst, context = {}) {
          let freq = state === 3 ? 650 : state === 2 ? 1000 : 1500;
          let vol  = 0.24;
          if (isFirst) { freq *= FIRST_BEAT_RATIO; vol *= FIRST_BEAT_VOL; }
          else if (context.isMainBeat) { freq *= OTHER_STRONG_BEAT_RATIO; if (context.isOtherStrongBeat) vol *= FIRST_BEAT_VOL; }
          oscTone(dest, time, { type: 'square', freqStart: freq, vol, attack: 0.002, duration: 0.055 });
        }
      },
      voiceMale: {
        name: 'Voice men EN',
        isVoice: true,
        play(dest, time, state, isFirst, context) {
          playVoiceMetronome('male', dest, time, state, isFirst, context);
        }
      },
      voiceFemale: {
        name: 'Voice female EN',
        isVoice: true,
        play(dest, time, state, isFirst, context) {
          playVoiceMetronome('female', dest, time, state, isFirst, context);
        }
      }
    };

    // CC0 recorded one-shots. The five original synth renderers remain as
    // fail-safe fallbacks if a sample cannot be loaded.
    const INSTRUMENT_SAMPLE_BANKS = Object.freeze({
      clic: [0, 1, 2], cloche: [0, 1, 2], claves: [0, 1, 2],
      clic808: [0, 1, 2], beep: [0, 1, 2]
    });
    const INSTRUMENT_SAMPLE_MAX_DURATION = Object.freeze({
      clic: [0.065, 0.065, 0.065],
      cloche: [0.25, 0.25, 0.25],
      claves: [0.09, 0.09, 0.09],
      clic808: [0.085, 0.085, 0.20],
      beep: [0.09, 0.09, 0.09]
    });
    const INSTRUMENT_SAMPLE_REVISION = '20261011-cc0-pro1';
    const instrumentSamples = Object.create(null);
    const instrumentSampleLoads = Object.create(null);

    // Linear-only loudness matching: no compressor, waveshaping, limiting or
    // peak flattening on the samples. The existing safety limiter is untouched.
    function prepareInstrumentSample(buffer, maximumDuration) {
      const channels = Array.from({length: buffer.numberOfChannels},
        (_, channel) => buffer.getChannelData(channel));
      const rate = buffer.sampleRate;
      const frames = buffer.length;
      let maxPeak = 0;
      for (let i = 0; i < frames; i++) {
        let x = 0;
        for (const channel of channels) x += channel[i];
        maxPeak = Math.max(maxPeak, Math.abs(x / channels.length));
      }
      if (maxPeak < 0.00001) throw new Error('Empty recorded one-shot');
      // Find acoustic attack rather than leading noise; retain 0.5 ms pre-roll.
      const threshold = maxPeak * 0.018;
      const windowLength = Math.max(8, Math.round(rate * 0.0005));
      let onset = 0;
      let energy = 0;
      for (let i = 0; i < frames; i++) {
        let x = 0;
        for (const channel of channels) x += channel[i];
        x /= channels.length;
        energy += x * x;
        if (i >= windowLength) {
          let y = 0;
          for (const channel of channels) y += channel[i - windowLength];
          y /= channels.length;
          energy -= y * y;
        }
        if (i >= windowLength && Math.sqrt(Math.max(0, energy) / windowLength) >= threshold) {
          onset = Math.max(0, i - windowLength - Math.round(rate * 0.0005));
          break;
        }
      }
      const offset = onset / rate;
      const duration = Math.min(maximumDuration, buffer.duration - offset);
      if (duration < 0.015) throw new Error('Recorded one-shot is too short');
      const last = Math.min(frames, onset + Math.floor(duration * rate));
      const loudnessFrames = Math.min(last - onset, Math.floor(rate * 0.045));
      let sum = 0, peak = 0;
      for (let i = onset; i < last; i++) {
        let x = 0;
        for (const channel of channels) x += channel[i];
        x /= channels.length;
        // Use the greatest individual channel peak, not mono average:
        // anti-phase / asymmetric stereo must also retain headroom.
        for (const channel of channels) peak = Math.max(peak, Math.abs(channel[i]));
        if (i < onset + loudnessFrames) sum += x * x;
      }
      const rms = Math.sqrt(sum / Math.max(1, loudnessFrames));
      if (rms < 0.00001 || peak < 0.00001) throw new Error('Recorded one-shot has no usable attack');
      // Fixed scalar gain; peak headroom is accounted for BEFORE playing.
      const gain = Math.min(0.115 / rms, 0.78 / peak);
      return {buffer, offset, duration, gain, rms: rms * gain, peak: peak * gain};
    }

    async function ensureInstrumentBankReady(bank = currentBank) {
      if(SOUND_BANKS[bank]?.prepare)return SOUND_BANKS[bank].prepare(audioCtx||await initAudio());
      if (!Object.hasOwn(INSTRUMENT_SAMPLE_BANKS, bank)) return;
      if (instrumentSamples[bank]) return;
      if (instrumentSampleLoads[bank]) return instrumentSampleLoads[bank];
      if (!audioCtx) await initAudio();
      instrumentSampleLoads[bank] = Promise.all([1, 2, 3].map(async state => {
        const path = 'assets/metronome/' + bank + '-' + state + '.wav?v=' + INSTRUMENT_SAMPLE_REVISION;
        const response = await fetch(path, {cache: 'force-cache'});
        if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + path);
        const buffer = await audioCtx.decodeAudioData(await response.arrayBuffer());
        return prepareInstrumentSample(buffer, INSTRUMENT_SAMPLE_MAX_DURATION[bank][state - 1]);
      })).then(samples => {
        instrumentSamples[bank] = samples;
      }).catch(error => {
        delete instrumentSampleLoads[bank];
        throw error;
      });
      return instrumentSampleLoads[bank];
    }

    for (const bank of Object.keys(INSTRUMENT_SAMPLE_BANKS)) {
      const fallback = SOUND_BANKS[bank].play;
      SOUND_BANKS[bank].play = function playRecordedOneShot(dest, time, state, isFirst, context = {}) {
        const sample = instrumentSamples[bank]?.[state - 1];
        if (!sample) {
          fallback(dest, time, state, isFirst, context);
          return;
        }
        const src = audioCtx.createBufferSource();
        const gain = audioCtx.createGain();
        src.buffer = sample.buffer;
        const pitch = isFirst ? Math.pow(2,1/12) : 1;
        src.playbackRate.setValueAtTime(pitch,time);
        const playbackDuration=sample.duration/pitch;
        const stateGain = state === 1 ? 0.78 : state === 2 ? 0.91 : 1;
        const accentGain = isFirst ? 1.12 : context.isOtherStrongBeat ? 1.08 : 1;
        gain.gain.setValueAtTime(sample.gain * stateGain * accentGain, time);
        // Short click-free release; the entire transient remains untouched.
        const fadeTime = Math.min(0.006, playbackDuration / 5);
        gain.gain.setValueAtTime(sample.gain * stateGain * accentGain, time + playbackDuration - fadeTime);
        gain.gain.linearRampToValueAtTime(0, time + playbackDuration);
        src.connect(gain);
        gain.connect(dest);
        scheduledVoiceSources.add(src);
        src.onended = () => {
          scheduledVoiceSources.delete(src);
          src.disconnect();
          gain.disconnect();
        };
        src.start(time, sample.offset, sample.duration);
      };
    }

    // The limiter is a safety net. Bank gains keep the incoming mix below -0.5 dBFS.
    const audioMixers = new WeakMap();
    const BANK_GAINS = { clic: 0.36, cloche: 0.36, claves: 0.36, clic808: 0.36, beep: 0.36, voiceMale: 1, voiceFemale: 1 };
    function getAudioMixDestination(context) {
      let mixer = audioMixers.get(context);
      if (!mixer) {
        const input = context.createGain();
        const limiter = context.createWaveShaper();
        const ceiling = Math.pow(10, -0.1 / 20);
        const curve = new Float32Array(65537);
        for (let i = 0; i < curve.length; i++) {
          const x = i / (curve.length - 1) * 2 - 1;
          curve[i] = Math.max(-ceiling, Math.min(ceiling, x));
        }
        // Exact unity below the safety ceiling: no makeup gain, knee or added delay.
        limiter.curve = curve;
        limiter.oversample = 'none';
        input.connect(limiter);
        limiter.connect(context.destination);
        mixer = { input, limiter };
        audioMixers.set(context, mixer);
      }
      return mixer.input;
    }
    const voiceMixers = new WeakMap();
    function getVoiceMixDestination(context) {
      let mixer = voiceMixers.get(context);
      if (!mixer) {
        mixer = context.createGain();
        mixer.gain.value = 0.25;
        mixer.connect(getAudioMixDestination(context));
        voiceMixers.set(context, mixer);
      }
      return mixer;
    }

    // Dedicated short, pitched percussion; independent of the selected bank.
    function playCountIn(time,accent) {
      const oscillator=audioCtx.createOscillator(),gain=audioCtx.createGain();
      oscillator.type='sine';oscillator.frequency.setValueAtTime(accent?2400:1800,time);
      gain.gain.setValueAtTime(.0001,time);
      gain.gain.linearRampToValueAtTime(Math.max(.0001,masterVolume*(accent?.42:.34)),time+.001);
      gain.gain.exponentialRampToValueAtTime(.0001,time+.035);
      oscillator.connect(gain);gain.connect(getAudioMixDestination(audioCtx));
      scheduledVoiceSources.add(oscillator);oscillator.onended=()=>{scheduledVoiceSources.delete(oscillator);oscillator.disconnect();gain.disconnect();};
      oscillator.start(time);oscillator.stop(time+.045);
    }

    function playClick(type, time, isFirstOfMeasure, context = {}) {
      if (!audioCtx) return;
      const out = audioCtx.createGain();
      out.gain.value = masterVolume * (BANK_GAINS[currentBank] ?? 1);
      const bank = SOUND_BANKS[currentBank] || SOUND_BANKS.clic;
      out.connect(bank.isVoice ? getVoiceMixDestination(audioCtx) : getAudioMixDestination(audioCtx));
      bank.play(out, time, type, isFirstOfMeasure, context);
    }

