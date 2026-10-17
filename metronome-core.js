
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
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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

    function getStepDurationMs(bpm, denominator, subdiv) {
      return (60000 / bpm) * (4 / denominator) / subdiv;
    }

    const NOTE_NAMES = {
      1: 'Ronde', 2: 'Blanche', 4: 'Noire', 8: 'Croche',
      16: 'Double', 32: 'Triple', 64: 'Quadruple', 128: 'Quintuple', 256: 'Sextuple'
    };

    function getSubdivLabel(denominator, subdiv) {
      return String(subdiv);
    }

    function getPulseDescription(m) {
      return `Pulsation de base : ${NOTE_NAMES[m.denominator] || m.denominator + 'e'}`;
    }

    let isPlaying = false;
    let playbackStarting = false;
    let tempo = 120;
    let measures = [];
    const collapsedSequenceMeasures = new WeakSet();
    let metronomeMeasures = [];
    let polyrhythmMeasures = [];
    let appMode = 'metronome';
    let polyEventIndex = 0;
    let activeMeasureIndex = 0;
    let playingMeasureIndex = 0;
    let currentStepInMeasure = 0;
    let scheduledMeasureLayouts = new WeakMap();
    let totalSteps = 0;
    let stepsData = [];
    let nextNoteTime = 0.0;
    const scheduleAheadTime = 0.1;
    const lookahead = 25;
    let timerID = null;
    let silentModeEnabled = false;
    let clickMeasures = 3;
    let silentMeasures = 1;
    let silentCycleMeasure = 0;
    const playhead = { stepIndex: 0, startTime: 0, durationMs: 500 };
    let workElapsed = 0;
    let workStartTime = 0;
    let training = {
      engaged: false, active: false, direction: 'up', startTime: 0, duration: 0,
      startBpm: 80, endBpm: 140, intervalId: null
    };

    function allowedSubdivisions(denominator) {
      return [1,2,3,4,5,6,7,8].filter(n => denominator * (n === 3 ? 2 : n >= 5 && n <= 7 ? 4 : n) <= 32);
    }
    function normalizeMeasureSubdivisions(m) {
      const allowed = allowedSubdivisions(m.denominator);
      for (let b = 0; b < m.numerator; b++) {
        if (!allowed.includes(m.beatSubdivisions[b])) {
          const old = m.beatSubdivisions[b];
          const sameFamily = allowed.filter(n => [1,2,4,8].includes(n) === [1,2,4,8].includes(old));
          const n = (sameFamily.length ? sameFamily : allowed).filter(n => n <= old).at(-1) || 1;
          m.beatSubdivisions[b] = n;
          m.beatStates[b] = Array.from({length:n}, (_,i) => m.beatStates[b]?.[i] ?? 0);
        }
      }
    }

    function createMeasure(numerator = 4, denominator = 4, measureTempo = tempo) {
      const defaultSubdivision = allowedSubdivisions(denominator).includes(2) ? 2 : 1;
      const beatSubdivisions = Array(numerator).fill(defaultSubdivision);
      const beatStates = [];
      for (let b = 0; b < numerator; b++) beatStates.push(defaultSubdivision === 2 ? [1, 0] : [1]);
      return { numerator, denominator, tempo: Math.max(2, Math.min(999, Math.round(measureTempo || 120))), beatSubdivisions, beatStates };
    }

    function measureTotalSteps(m) { return m.beatSubdivisions.reduce((a, b) => a + b, 0); }

    function getBeatAndSub(m, stepIdx) {
      let idx = stepIdx;
      for (let b = 0; b < m.numerator; b++) {
        if (idx < m.beatSubdivisions[b]) return { beat: b, subIndex: idx };
        idx -= m.beatSubdivisions[b];
      }
      return { beat: 0, subIndex: 0 };
    }

    // Keep the current audio cycle stable when its visual subdivision layout changes.
    // The edited layout is adopted when this measure is scheduled again.
    function getVoiceGroupSize(m) {
      return appMode === 'metronome' && SOUND_BANKS[currentBank]?.isVoice && m.denominator >= 16 ? m.denominator / 4 : 1;
    }
    function updateVoiceGroupLabel(m = measures[activeMeasureIndex]) {
      const label = document.getElementById('voiceGroupLabel');
      if (!label || !m) return;
      const size = getVoiceGroupSize(m);
      label.hidden = size === 1;
      label.textContent = size > 1 ? 'Voix à la noire · groupes de ' + size : '';
    }

    function getSchedulingMeasure(model) {
      let layout = scheduledMeasureLayouts.get(model);
      if (!layout) {
        layout = { denominator: model.denominator, subdivisions: [...model.beatSubdivisions], states: model.beatStates.map(s => [...s]) };
        scheduledMeasureLayouts.set(model, layout);
      }
      return { ...model, denominator: layout.denominator, beatSubdivisions: layout.subdivisions,
        beatStates: layout.states.map((states, b) => states.map((state, sub) => model.beatStates[b]?.[sub] ?? state)) };
    }

    function validatePlayingState() {
      if (!isPlaying) return;
      if (playingMeasureIndex >= measures.length) playingMeasureIndex = 0;
      if (activeMeasureIndex >= measures.length) activeMeasureIndex = measures.length - 1;
      const model = measures[playingMeasureIndex];
      const m = model ? getSchedulingMeasure(model) : null;
      if (m && currentStepInMeasure >= measureTotalSteps(m)) currentStepInMeasure = 0;
    }

    const bpmDisplay = document.getElementById('bpmDisplay');
    const bpmSlider = document.getElementById('bpmSlider');
    const mobileTrainingBpm = document.getElementById('mobileTrainingBpm');
    if (mobileTrainingBpm) mobileTrainingBpm.addEventListener('click', openMobileTempoSettings);
    function updateMobileTrainingBpm(value){ if(mobileTrainingBpm) mobileTrainingBpm.textContent = value+' BPM'; }
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    const soundBankSel = document.getElementById('soundBank');
    const playBtn = document.getElementById('playBtn');
    const tapBtn = document.getElementById('tapBtn');
    const panicBtn = document.getElementById('panicBtn');
    const measureCountSel = document.getElementById('measureCount');
    const silentToggle = document.getElementById('silentToggle');
    const silentSettings = document.getElementById('silentSettings');
    const clickMeasureCountSel = document.getElementById('clickMeasureCount');
    const silentMeasureCountSel = document.getElementById('silentMeasureCount');
    const measureListEl = document.getElementById('measureList');
    const activeMeasureLabel = document.getElementById('activeMeasureLabel');
    const activeNumeratorSel = document.getElementById('activeNumerator');
    const activeDenominatorSel = document.getElementById('activeDenominator');
    const sequencerContainer = document.getElementById('sequencerContainer');
    const beatDisplay = document.getElementById('beatDisplay');
    const trainTimerEl = document.getElementById('trainTimer');
    const trainDurationInput = document.getElementById('trainDuration');
    const trainStartInput = document.getElementById('trainStart');
    const trainEndInput = document.getElementById('trainEnd');
    const trainBtn = document.getElementById('trainBtn');
    const modeSwitch = document.getElementById('modeSwitch');
    const metroSigGroup = document.getElementById('metroSigGroup');
    const polyControls = document.getElementById('polyControls');
    const polyNumeratorInput = document.getElementById('polyNumerator');
    const polyDenominatorInput = document.getElementById('polyDenominator');
    const dirToggle = document.getElementById('dirToggle');

    for (let n = 1; n <= 20; n++) {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      activeNumeratorSel.appendChild(o);
    }

    for (let n = 1; n <= 32; n++) {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      clickMeasureCountSel.appendChild(o);
    }
    for (let n = 0; n <= 32; n++) {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      silentMeasureCountSel.appendChild(o);
    }
    clickMeasureCountSel.value = String(clickMeasures);
    silentMeasureCountSel.value = String(silentMeasures);



    // Compatibility names for existing feature modules; the widget owns its state.
    const numboxWidgets = RENAX_NUMBOX.widgets;
    const closeAllNumboxes = RENAX_NUMBOX.closeAll;
    const enhanceNumboxSelect = RENAX_NUMBOX.enhance;
    function syncNumbox(select) { numboxWidgets.get(select)?.sync(); }

    [activeNumeratorSel, activeDenominatorSel, polyNumeratorInput, polyDenominatorInput].forEach(enhanceNumboxSelect);

    function getEffectiveTempo(m) {
      if (training.engaged) return tempo;
      return m && Number.isFinite(m.tempo) ? m.tempo : tempo;
    }

    function syncTempoUI(m) {
      if (!m || training.engaged) return;
      tempo = getEffectiveTempo(m);
      bpmSlider.value = tempo;
      bpmDisplay.innerHTML = `${tempo} <span>BPM</span>`; updateMobileTrainingBpm(tempo);
    }

    function refreshTempoFields() {
      measureListEl.querySelectorAll('.measure-card').forEach((card, i) => {
        const input = card.querySelector('.measure-tempo-input');
        if (input && measures[i]) {const value=String(measures[i].tempo);if(![...input.options].some(option=>option.value===value)){const option=document.createElement('option');option.value=value;option.textContent=value;input.append(option);}input.value=value;syncNumbox(input);}
      });
    }

    function resetSilentCycle() { silentCycleMeasure = 0; }
    function isSilentCycleAudible() {
      if (!silentModeEnabled || silentMeasures <= 0) return true;
      const cycleLength = clickMeasures + silentMeasures;
      if (cycleLength <= 0) return true;
      return (silentCycleMeasure % cycleLength) < clickMeasures;
    }
    function advanceSilentCycle() {
      if (!silentModeEnabled) return;
      const cycleLength = clickMeasures + silentMeasures;
      if (cycleLength > 0) silentCycleMeasure = (silentCycleMeasure + 1) % cycleLength;
    }
    function setSilentMode(enabled) {
      silentModeEnabled = !!enabled;
      silentToggle.classList.toggle('active', silentModeEnabled);
      silentToggle.textContent = silentModeEnabled ? 'ON' : 'OFF';
      silentToggle.setAttribute('aria-pressed', silentModeEnabled ? 'true' : 'false');
      silentSettings.classList.toggle('disabled', !silentModeEnabled);
      for(const select of silentSettings.querySelectorAll('select')){select.disabled=!silentModeEnabled;const trigger=select.parentElement.querySelector('.numbox-button');if(trigger)trigger.disabled=!silentModeEnabled;}
      resetSilentCycle();
    }

    let RING_RADIUS = 138;
    let STEP_SIZE = 26;

    function updateRingRadius() {
      const size = sequencerContainer.clientWidth;
      if (size === 0) return;
      RING_RADIUS = size * 0.406;
      STEP_SIZE = Math.max(10, size * 0.076);
      sequencerContainer.style.setProperty('--ring-radius', `${RING_RADIUS}px`);
      sequencerContainer.style.setProperty('--step-size', `${STEP_SIZE}px`);
      sequencerContainer.querySelectorAll('.beat-divider').forEach(el => {
        el.style.height = `${RING_RADIUS}px`;
      });
    }

    const TRAIL_SEGMENTS = 16;
    const TRAIL_ANGLE = 80;
    const PROGRESS_RADIUS = 46;
    const PROGRESS_CIRC = 2 * Math.PI * PROGRESS_RADIUS;
    const OUTER_PROGRESS_RADIUS = 52.5;
    const OUTER_PROGRESS_CIRC = 2 * Math.PI * OUTER_PROGRESS_RADIUS;
    const trailGroup = document.getElementById('trailGroup');
    const trailGroupOuter = document.getElementById('trailGroupOuter');

    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', '50'); c.setAttribute('cy', '50');
      c.setAttribute('r', String(PROGRESS_RADIUS));
      c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'none');
      c.setAttribute('stroke-width', '6'); c.setAttribute('stroke-linecap', 'butt');
      trailGroup.appendChild(c);
    }

    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', '50'); c.setAttribute('cy', '50');
      c.setAttribute('r', String(OUTER_PROGRESS_RADIUS));
      c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'none');
      c.setAttribute('stroke-linecap', 'butt');
      c.style.strokeWidth = '5';
      trailGroupOuter.appendChild(c);
    }

    function markPlayheadStep(stepIdx, durationMs = null, span = 1) {
      const m = measures[activeMeasureIndex];
      // Cette fonction appartient au moteur du métronome classique.
      // Une mesure polyrythmique n'a pas de beatSubdivisions.
      if (!m || appMode === 'polyrhythm' || !Array.isArray(m.beatSubdivisions)) return;
      const beat = Math.floor(stepIdx);
      const subdiv = m.beatSubdivisions[beat] || 1;
      playhead.stepIndex = stepIdx;
      playhead.startTime = performance.now();
      playhead.durationMs = durationMs ?? getStepDurationMs(getEffectiveTempo(m), m.denominator, subdiv);
      playhead.span = span;
    }

    function getCurrentHeadAngle() {
      if (totalSteps === 0) return 0;
      const elapsed = performance.now() - playhead.startTime;
      const t = Math.min(1, elapsed / playhead.durationMs);
      const stepAngle = 360 / totalSteps;
      return (playhead.stepIndex + t * (playhead.span ?? 1)) * stepAngle;
    }

    function updateProgressTrail(headAngle) {
      for (let i = 0; i < TRAIL_SEGMENTS; i++) {
        const seg = trailGroup.children[i];
        const idealStart = headAngle - TRAIL_ANGLE * (i + 1) / TRAIL_SEGMENTS;
        const idealEnd = headAngle - TRAIL_ANGLE * i / TRAIL_SEGMENTS;
        if (idealEnd <= 0) { seg.setAttribute('stroke', 'none'); continue; }
        const cs = Math.max(0, idealStart);
        const ce = Math.min(360, idealEnd);
        if (ce <= cs) { seg.setAttribute('stroke', 'none'); continue; }
        const length = PROGRESS_CIRC * (ce - cs) / 360;
        const offset = PROGRESS_CIRC * cs / 360;
        const fadeT = i / (TRAIL_SEGMENTS - 1);
        const opacity = Math.pow(1 - fadeT, 1.6) * 0.9;
        seg.setAttribute('stroke-dasharray', `${length.toFixed(3)} ${(PROGRESS_CIRC * 2).toFixed(3)}`);
        seg.setAttribute('stroke-dashoffset', `${(-offset).toFixed(3)}`);
        seg.setAttribute('stroke', `rgba(0, 229, 255, ${opacity.toFixed(3)})`);
      }
      for (let i = 0; i < TRAIL_SEGMENTS; i++) {
        const seg = trailGroupOuter.children[i];
        const idealStart = headAngle - TRAIL_ANGLE * (i + 1) / TRAIL_SEGMENTS;
        const idealEnd = headAngle - TRAIL_ANGLE * i / TRAIL_SEGMENTS;
        if (idealEnd <= 0) { seg.setAttribute('stroke', 'none'); continue; }
        const cs = Math.max(0, idealStart);
        const ce = Math.min(360, idealEnd);
        if (ce <= cs) { seg.setAttribute('stroke', 'none'); continue; }
        const length = OUTER_PROGRESS_CIRC * (ce - cs) / 360;
        const offset = OUTER_PROGRESS_CIRC * cs / 360;
        const fadeT = i / (TRAIL_SEGMENTS - 1);
        const opacity = Math.pow(1 - fadeT, 1.6) * 0.45;
        seg.setAttribute('stroke-dasharray', `${length.toFixed(3)} ${(OUTER_PROGRESS_CIRC * 2).toFixed(3)}`);
        seg.setAttribute('stroke-dashoffset', `${(-offset).toFixed(3)}`);
        seg.setAttribute('stroke', `rgba(255, 107, 0, ${opacity.toFixed(3)})`);
      }
    }

    const orbitTrail = { angle:null, time:0, carry:0, distance:0, sparks:[] };
    function clearProgressTrail() {
      orbitTrail.angle=null; orbitTrail.time=0; orbitTrail.carry=0; orbitTrail.distance=0; orbitTrail.sparks.length=0;
      for (let i = 0; i < TRAIL_SEGMENTS; i++) {
        trailGroup.children[i].setAttribute('stroke', 'none');
        trailGroupOuter.children[i].setAttribute('stroke', 'none');
      }
    }

    const canvas = document.getElementById('particleCanvas');
    const pctx = canvas.getContext('2d');
    let particles = [];
    let pulses = [];
    const STEP_RGB = { 1: [0, 229, 255], 2: [22, 138, 69], 3: [255, 107, 0], 0: [140, 150, 170] };

    function clearParticleCanvas() {
      pctx.save();
      pctx.setTransform(1,0,0,1,0,0);
      pctx.clearRect(0,0,canvas.width,canvas.height);
      pctx.restore();
    }
    function resizeCanvas() {
      const size = sequencerContainer.clientWidth;
      if (size === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
      particles.length = 0; pulses.length = 0;
      canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    new ResizeObserver(() => {
      resizeCanvas(); updateRingRadius();
      if(appMode!=='polyrhythm' && measures[activeMeasureIndex])renderSubdivisionDots(measures[activeMeasureIndex]);
    }).observe(sequencerContainer);

    function getStepXY(stepIndex) {
      const size = sequencerContainer.clientWidth;
      const cx = size / 2, cy = size / 2;
      const angle = (stepIndex / totalSteps) * Math.PI * 2;
      return { x: cx + RING_RADIUS * Math.sin(angle), y: cy - RING_RADIUS * Math.cos(angle) };
    }

    function emitBurst(stepIndex, state) {
      const { x, y } = getStepXY(stepIndex);
      const rgb = STEP_RGB[state] || STEP_RGB[0];
      const isSilent = (state === 0);
      const count = isSilent ? 5 : 14;
      for (let i = 0; i < count; i++) {
        const baseAngle = Math.atan2(y - sequencerContainer.clientHeight / 2, x - sequencerContainer.clientWidth / 2);
        const spread = (Math.random() - 0.5) * 1.8;
        const angle = baseAngle + spread;
        const speed = (isSilent ? 0.2 : 0.4) + Math.random() * (isSilent ? 0.4 : 1.1);
        particles.push({
          x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 4,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 1, decay: 0.012 + Math.random() * 0.018,
          size: (isSilent ? 0.8 : 1.2) + Math.random() * 1.8,
          rgb, gravity: 0.012
        });
      }
      pulses.push({
        x, y, radius: 8, maxRadius: isSilent ? 24 : 42,
        life: 1, decay: 0.045, rgb, width: isSilent ? 1 : 1.8
      });
    }


    function drawOrbitPlayhead(headAngle, now=performance.now()) {
      const size=sequencerContainer.clientWidth,cx=size/2,cy=sequencerContainer.clientHeight/2;
      const radius=RING_RADIUS+STEP_SIZE*.62;
      const headSize=Math.max(2.1,Math.min(4,size*.009));
      const delta=orbitTrail.angle===null?0:((headAngle-orbitTrail.angle+540)%360)-180;
      const dt=orbitTrail.time?Math.min(.05,Math.max(0,(now-orbitTrail.time)/1000)):0;
      orbitTrail.distance+=Math.max(0,delta);
      orbitTrail.carry+=dt*150;
      const count=Math.min(10,Math.floor(orbitTrail.carry));orbitTrail.carry-=count;
      for(let j=0;j<count;j++){
        const fraction=(j+1)/Math.max(1,count);
        const a=((orbitTrail.angle??headAngle)+delta*fraction)*Math.PI/180;
        const jitter=(Math.random()-.5)*3;
        orbitTrail.sparks.push({x:cx+(radius+jitter)*Math.sin(a),y:cy-(radius+jitter)*Math.cos(a),vx:(Math.random()-.5)*14,vy:(Math.random()-.5)*14,born:now,life:300+Math.random()*330,size:.25+Math.random()*.5});
      }
      orbitTrail.angle=headAngle;orbitTrail.time=now;
      pctx.save();
      const tailAngle=Math.min(42,orbitTrail.distance);
      for(let i=23;i>=0;i--){
        const fade=1-i/24;
        const a0=(headAngle-tailAngle*(i+1)/24-90)*Math.PI/180;
        const a1=(headAngle-tailAngle*i/24-90)*Math.PI/180;
        if(tailAngle<=0)break;
        pctx.beginPath();pctx.arc(cx,cy,radius,a0,a1);
        pctx.strokeStyle='rgba(0,229,255,'+(Math.pow(fade,2)*.65)+')';
        pctx.lineWidth=.35+fade*1.3;pctx.lineCap='round';pctx.stroke();
      }
      for(let i=orbitTrail.sparks.length-1;i>=0;i--){
        const p=orbitTrail.sparks[i],age=now-p.born;
        if(age>=p.life){orbitTrail.sparks.splice(i,1);continue;}
        p.x+=p.vx*dt;p.y+=p.vy*dt;
        const fade=1-age/p.life;
        pctx.beginPath();pctx.arc(p.x,p.y,p.size,0,Math.PI*2);pctx.fillStyle='rgba(0,229,255,'+(fade*fade*.6)+')';pctx.fill();
      }
      const rad=headAngle*Math.PI/180,x=cx+radius*Math.sin(rad),y=cy-radius*Math.cos(rad);
      pctx.shadowColor='rgba(0,229,255,.6)';pctx.shadowBlur=8;
      pctx.beginPath();pctx.arc(x,y,headSize,0,Math.PI*2);pctx.fillStyle='#00e5ff';pctx.fill();
      pctx.shadowBlur=0;pctx.beginPath();pctx.arc(x-headSize*.2,y-headSize*.2,headSize*.42,0,Math.PI*2);pctx.fillStyle='#dcfbff';pctx.fill();
      pctx.restore();
    }

    function animate() {
      updateTimerDisplay();
      const w = sequencerContainer.clientWidth;
      const h = sequencerContainer.clientHeight;
      if (w === 0 || h === 0) { requestAnimationFrame(animate); return; }
      clearParticleCanvas();

      if (appMode === 'polyrhythm') {
        particles.length = 0;
        pulses.length = 0;
        clearProgressTrail();
        requestAnimationFrame(animate);
        return;
      }

      if (isPlaying && totalSteps > 0) drawOrbitPlayhead(getCurrentHeadAngle());
      else clearProgressTrail();

      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.radius += 0.9; p.life -= p.decay;
        if (p.life <= 0 || p.radius >= p.maxRadius) { pulses.splice(i, 1); continue; }
        const alpha = p.life * 0.75;
        pctx.beginPath(); pctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        pctx.strokeStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${alpha})`;
        pctx.lineWidth = p.width * p.life; pctx.stroke();
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += p.gravity;
        p.vx *= 0.965; p.vy *= 0.965; p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        const alpha = p.life * 0.9;
        const r = Math.max(0.2, p.size * p.life);
        pctx.beginPath(); pctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        pctx.fillStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${alpha})`; pctx.fill();
        if (p.size > 2 && p.life > 0.4) {
          pctx.beginPath(); pctx.arc(p.x, p.y, r * 2.5, 0, Math.PI * 2);
          pctx.fillStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${alpha * 0.15})`; pctx.fill();
        }
      }

      requestAnimationFrame(animate);
    }

    function resetCustomizationTimer() {
      resetWorkTimer();
      if(isPlaying)startWorkTimer();
      updateTimerDisplay();
    }
    const customizationFields='#bpmSlider,#volumeSlider,#soundBank,#measureCount,#clickMeasureCount,#silentMeasureCount,#activeNumerator,#activeDenominator,#polyNumerator,#polyDenominator,#beatEditorDivision,.measure-tempo-input,.measure-card input[type=number]';
    document.addEventListener('change',e=>{if(e.target.matches(customizationFields))resetCustomizationTimer();},true);
    document.addEventListener('input',e=>{if(e.target.matches('#bpmSlider,#volumeSlider,.measure-tempo-input'))resetCustomizationTimer();},true);
    document.addEventListener('click',e=>{if(e.target.closest('#beatEditorPads button,.poly-dot,#silentToggle,#modeSwitch button'))resetCustomizationTimer();},true);
    function formatTime(s) {
      s = Math.max(0, s);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    function getWorkElapsed() { return workElapsed + (workStartTime > 0 ? performance.now() - workStartTime : 0); }
    function startWorkTimer() { if (workStartTime === 0) workStartTime = performance.now(); }
    function pauseWorkTimer() { if (workStartTime > 0) { workElapsed += performance.now() - workStartTime; workStartTime = 0; } }
    function resetWorkTimer() { workElapsed = 0; workStartTime = 0; }

    function updateTimerDisplay() {
      if (training.engaged) {
        const remaining = training.active ? Math.max(0, training.duration - (performance.now() - training.startTime)) : training.duration;
        trainTimerEl.textContent = training.run?.mode === 'steps'
          ? formatTime(Math.floor((training.active ? performance.now() - training.startTime : 0) / 1000))
          : formatTime(Math.ceil(remaining / 1000));
        trainTimerEl.classList.add('active', 'training');
      } else if (isPlaying || workElapsed > 0 || workStartTime > 0) {
        trainTimerEl.textContent = formatTime(Math.floor(getWorkElapsed() / 1000));
        trainTimerEl.classList.toggle('active', isPlaying);
        trainTimerEl.classList.remove('training');
      } else {
        trainTimerEl.textContent = '0:00';
        trainTimerEl.classList.remove('active', 'training');
      }
    }


    let loopedMeasure = null;
    let draggedSequenceMeasure = null;
    function sequenceTransportIcon(playing) {
      return playing ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l12-7Z"/></svg>';
    }
    function finishSequenceEdit(selected) {
      activeMeasureIndex = Math.max(0, measures.indexOf(selected));
      playingMeasureIndex = activeMeasureIndex;
      currentStepInMeasure = 0; polyEventIndex = 0;
      measureCountSel.value = String(measures.length);
      syncNumbox(measureCountSel);
      renderSequencerList(); renderActiveMeasure();
      measureCountSel.dispatchEvent(new Event('change', {bubbles:true}));
    }
    function duplicateSequenceMeasure(m) {
      if(playbackStarting || measures.length>=8)return;
      const index=measures.indexOf(m);if(index<0)return;
      stopMetronome();
      const copy=JSON.parse(JSON.stringify(m));
      if(copy.name)copy.name=(copy.name+' · copie').slice(0,100);
      measures.splice(index+1,0,copy);
      finishSequenceEdit(copy);
    }
    async function renameSequenceMeasure(m) {
      if(playbackStarting || !measures.includes(m))return;
      const collection=measures;
      const value=await window.RENAX_MULTI.requestName('Libellé',m.name||'');
      if(!value?.trim() || measures!==collection || !measures.includes(m))return;
      m.name=value.trim().slice(0,100);
      finishSequenceEdit(measures[activeMeasureIndex]);
    }
    function removeSequenceMeasure(m) {
      if (playbackStarting || measures.length <= 1) return;
      const index=measures.indexOf(m); if(index<0)return;
      const selected=measures[activeMeasureIndex];
      stopMetronome();
      measures.splice(index,1);
      finishSequenceEdit(selected===m ? measures[Math.min(index,measures.length-1)] : selected);
    }
    function moveSequenceMeasure(m, target) {
      if(playbackStarting)return;
      const from=measures.indexOf(m),to=measures.indexOf(target);
      if(from<0||to<0||from===to)return;
      const selected=measures[activeMeasureIndex];
      stopMetronome();
      measures.splice(from,1); measures.splice(to,0,m);
      finishSequenceEdit(selected);
    }
    async function previewSequenceMeasure(m) {
      if(playbackStarting || training.engaged || window.RENAX_SONGS?.preparing)return;
      if(isPlaying&&loopedMeasure===m){stopMetronome();return;}
      stopMetronome();
      loopedMeasure=m;
      try { await startMetronome(); }
      catch(error){loopedMeasure=null; renderSequencerList(); console.warn('Lecture de la mesure indisponible',error);}
    }

    let suppressSequenceClickUntil=0;
    function enableSequenceDrag(card,m) {
      let gesture=null,hold=null,placeholder=null,oldStyle=null;
      const panel=card.closest('.panel');
      const clear=()=>measureListEl.querySelectorAll('.drop-target').forEach(c=>c.classList.remove('drop-target'));
      function mark(){
        if(!gesture?.active)return;
        card.style.top=(gesture.y-gesture.offsetY)+'px';card.style.left=(gesture.x-gesture.offsetX)+'px';
        const others=Array.from(measureListEl.querySelectorAll('.measure-card')).filter(c=>c!==card);
        const before=others.find(c=>gesture.y<c.getBoundingClientRect().top+c.getBoundingClientRect().height/2);
        gesture.target=before?measures[Array.from(measureListEl.querySelectorAll('.measure-card')).indexOf(before)]:null;
        gesture.after=!before;
        clear();(before||others.at(-1))?.classList.add('drop-target');
      }
      function activate(){
        if(!gesture||gesture.scrolling||playbackStarting)return;
        gesture.active=true;
        const rect=card.getBoundingClientRect();gesture.offsetX=gesture.startX-rect.left;gesture.offsetY=gesture.startY-rect.top;
        placeholder=document.createElement('div');placeholder.className='sequence-drag-placeholder';placeholder.style.height=rect.height+'px';card.before(placeholder);
        oldStyle=card.getAttribute('style');
        Object.assign(card.style,{position:'fixed',width:rect.width+'px',height:rect.height+'px',zIndex:'1200',pointerEvents:'none',opacity:'.9',boxShadow:'0 12px 35px #0008'});
        card.classList.add('dragging');mark();
      }
      card.addEventListener('click',e=>{if(performance.now()<suppressSequenceClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
      card.addEventListener('pointerdown',e=>{
        if(e.button!==0||!e.isPrimary||gesture||e.target.closest('button,input,select,summary,details,label,a'))return;
        gesture={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,active:false,scrolling:false,scrollTop:panel.scrollTop};
        card.setPointerCapture(e.pointerId);if(e.pointerType==='mouse')e.preventDefault();hold=setTimeout(activate,250);
      });
      card.addEventListener('pointermove',e=>{
        if(!gesture||gesture.id!==e.pointerId)return;gesture.x=e.clientX;gesture.y=e.clientY;
        if(!gesture.active&&Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)>8){if(e.pointerType==='touch'){gesture.scrolling=true;clearTimeout(hold);}else activate();}
        if(gesture.scrolling){panel.scrollTop=gesture.scrollTop+gesture.startY-e.clientY;e.preventDefault();return;}
        if(gesture.active){e.preventDefault();mark();}
      });
      function finish(e,cancelled=false){
        if(!gesture||gesture.id!==e.pointerId)return;
        clearTimeout(hold);const done=gesture;gesture=null;clear();
        if(done.active){placeholder?.remove();placeholder=null;if(oldStyle===null)card.removeAttribute('style');else card.setAttribute('style',oldStyle);card.classList.remove('dragging');}
        if(done.active||done.scrolling)suppressSequenceClickUntil=performance.now()+200;
        if(card.hasPointerCapture(e.pointerId))card.releasePointerCapture(e.pointerId);
        if(done.active&&!cancelled){
          const rect=panel.getBoundingClientRect();if(done.x<rect.left||done.x>rect.right||done.y<rect.top||done.y>rect.bottom)return;
          const target=done.target||measures.at(-1);
          if(target===m)return;
          // Insert before the target, or after the last card.
          const from=measures.indexOf(m),to=measures.indexOf(target);
          const selected=measures[activeMeasureIndex];stopMetronome();
          measures.splice(from,1);const index=done.after?measures.length:measures.indexOf(target);measures.splice(index,0,m);finishSequenceEdit(selected);
        }
      }
      card.addEventListener('pointerup',e=>finish(e));card.addEventListener('pointercancel',e=>finish(e,true));
      card.addEventListener('keydown',e=>{if(e.target!==card||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const target=measures[measures.indexOf(m)+(e.key==='ArrowUp'?-1:1)];if(target){moveSequenceMeasure(m,target);measureListEl.children[measures.indexOf(m)]?.focus();}});
      card.title='Appuyer et glisser pour déplacer · Alt + flèche pour réordonner';
    }

    function decorateSequenceCards() {
      measureListEl.querySelectorAll('.measure-card').forEach((card,i)=>{
        const m=measures[i]; if(!m)return;
        if(m.name){const title=card.querySelector('.measure-num');title.dataset.noTranslate='';title.textContent=m.name;}
        const tools=document.createElement('div');tools.className='sequence-card-tools';
        enableSequenceDrag(card,m);
        const play=document.createElement('button');play.type='button';play.className='sequence-preview-play';
        const playing=isPlaying&&loopedMeasure===m;
        play.innerHTML=sequenceTransportIcon(playing);play.setAttribute('aria-label',playing?'Arrêter la mesure '+(i+1):'Écouter la mesure '+(i+1)+' en boucle');play.title=play.getAttribute('aria-label');play.setAttribute('aria-pressed',String(playing));play.disabled=playbackStarting||training.engaged;
        play.onclick=e=>{e.stopPropagation();previewSequenceMeasure(m);};
        const menu=document.createElement('details');menu.className='sequence-more';
        const summary=document.createElement('summary');summary.textContent='⋯';summary.setAttribute('aria-label','Options de la mesure '+(i+1));
        menu.addEventListener('click',e=>e.stopPropagation());menu.addEventListener('keydown',e=>e.stopPropagation());
        const actions=document.createElement('div');actions.className='sequence-more-actions';
        const del=document.createElement('button');del.type='button';del.textContent='Supprimer';del.disabled=measures.length<=1||playbackStarting;del.onclick=e=>{e.stopPropagation();removeSequenceMeasure(m);};
        const duplicate=document.createElement('button');duplicate.type='button';duplicate.textContent='Dupliquer';duplicate.disabled=measures.length>=8||playbackStarting;
        duplicate.onclick=e=>{e.stopPropagation();menu.open=false;duplicateSequenceMeasure(m);};
        const rename=document.createElement('button');rename.type='button';rename.textContent='Renommer';rename.disabled=playbackStarting;
        rename.onclick=e=>{e.stopPropagation();menu.open=false;renameSequenceMeasure(m);};
        actions.append(duplicate,rename,del);menu.append(summary,actions);tools.append(play,menu);card.append(tools);
      });
    }

    function blockNumberMenu(values,value,label){
      const select=document.createElement('select');select.setAttribute('aria-label',label);
      const fill=list=>{const fragment=document.createDocumentFragment();for(const v of list){const option=document.createElement('option');option.value=String(v);option.textContent=String(v);fragment.append(option);}select.replaceChildren(fragment);select.value=String(value);};
      fill(values.length>100?[value]:values);
      if(values.length>100)select.addEventListener('renax-options-request',()=>{const current=select.value;fill(values);select.value=current;numboxWidgets.get(select)?.rebuild();},{once:true});
      return select;
    }

    function renderSequencerList() {
      measureListEl.innerHTML = '';
      measures.forEach((m, i) => {
        const card = document.createElement('div');
        card.className = 'measure-card';
        card.setAttribute('role', 'group');
        card.setAttribute('aria-label','Mesure '+(i+1));
        card.tabIndex = 0;
        card.classList.toggle('sequence-collapsed', collapsedSequenceMeasures.has(m));
        card.setAttribute('aria-description',collapsedSequenceMeasures.has(m)?'Repliée, Entrée pour ouvrir':'Ouverte, Entrée pour replier');
        if (i === activeMeasureIndex) card.classList.add('active');
        if (isPlaying && i === playingMeasureIndex) card.classList.add('playing');

        const head = document.createElement('div');
        head.className = 'measure-head';
        head.innerHTML = `<span class="measure-num">MESURE ${i + 1} / ${measures.length}</span><span class="measure-sig">${m.numerator}/${m.denominator}</span>`;

        const ratio=document.createElement('div');ratio.className='poly-ratio-row sequence-signature-row';
        const numerator=blockNumberMenu(Array.from({length:20},(_,v)=>v+1),m.numerator,`Numérateur mesure ${i+1}`);
        const denominator=blockNumberMenu([2,4,8,16,32],m.denominator,`Dénominateur mesure ${i+1}`);
        const slash=document.createElement('span');slash.className='poly-slash';slash.textContent='/';
        for(const field of [numerator,denominator]){field.addEventListener('click',e=>e.stopPropagation());field.addEventListener('keydown',e=>e.stopPropagation());}
        const changeSignature=(target,value)=>{activeMeasureIndex=i;target.value=String(value);target.dispatchEvent(new Event('change',{bubbles:true}));renderSequencerList();};
        numerator.addEventListener('change',e=>{e.stopPropagation();changeSignature(activeNumeratorSel,numerator.value);});
        denominator.addEventListener('change',e=>{e.stopPropagation();changeSignature(activeDenominatorSel,denominator.value);});
        ratio.append(numerator,slash,denominator);

        const tempoRow = document.createElement('div');
        tempoRow.className = 'measure-tempo-row';
        const tempoLabel = document.createElement('span');
        tempoLabel.className = 'measure-tempo-label';
        tempoLabel.textContent = 'TEMPO';
        const tempoInput = blockNumberMenu(Array.from({length:998},(_,v)=>v+2),m.tempo,`Tempo mesure ${i+1}`);
        tempoInput.className = 'measure-tempo-input';
        tempoInput.setAttribute('aria-label', `Tempo mesure ${i + 1}`);
        const tempoUnit = document.createElement('span');
        tempoUnit.className = 'measure-tempo-unit';
        tempoUnit.textContent = 'BPM';
        tempoInput.addEventListener('click', e => e.stopPropagation());
        tempoInput.addEventListener('keydown', e => e.stopPropagation());
        const commitMeasureTempo = (rawValue, normalizeField = false) => {
          const parsed = parseInt(rawValue, 10);
          if (!Number.isFinite(parsed)) return;
          const v = Math.max(2, Math.min(999, parsed));
          m.tempo = v;
          if (normalizeField) tempoInput.value = String(v);
          if (i === activeMeasureIndex && !training.engaged) syncTempoUI(m);
        };
        tempoInput.addEventListener('input', e => {
          e.stopPropagation();
          commitMeasureTempo(e.target.value, false);
        });
        tempoInput.addEventListener('change', e => {
          e.stopPropagation();
          const fallback = Number.isFinite(m.tempo) ? m.tempo : 120;
          if (e.target.value === '') e.target.value = String(fallback);
          commitMeasureTempo(e.target.value, true);
        });
        tempoRow.appendChild(tempoLabel);
        tempoRow.appendChild(tempoInput);
        tempoRow.appendChild(tempoUnit);

        const preview = document.createElement('div');
        preview.className = 'measure-preview';
        for (let b = 0; b < m.numerator; b++) {
          const group = document.createElement('div');
          group.className = 'preview-beat';
          for (let s = 0; s < m.beatSubdivisions[b]; s++) {
            const dot = document.createElement('span');
            dot.className = 'preview-dot';
            dot.dataset.state = m.beatStates[b][s];
            group.appendChild(dot);
          }
          preview.appendChild(group);
        }

        card.appendChild(head);
        card.appendChild(ratio);
        card.appendChild(tempoRow);
        card.appendChild(preview);
        const selectMeasure = () => {
          if(collapsedSequenceMeasures.has(m))collapsedSequenceMeasures.delete(m);else collapsedSequenceMeasures.add(m);
          activeMeasureIndex = i;
          syncTempoUI(m);
          renderSequencerList();
          renderActiveMeasure();
        };
        card.addEventListener('click', e => {if(!e.target.closest('button,input,select,details,label'))selectMeasure();});
        card.addEventListener('keydown', e => {
          if (e.target !== card) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMeasure(); }
        });
        measureListEl.appendChild(card);
      });
    }

    function refreshMeasurePreviews() {
      measureListEl.querySelectorAll('.measure-card').forEach((card, i) => {
        const m = measures[i];
        if (!m) return;
        const sig = card.querySelector('.measure-sig');
        if (sig) sig.textContent = `${m.numerator}/${m.denominator}`;
        const preview = card.querySelector('.measure-preview');
        if (!preview) return;
        preview.innerHTML = '';
        for (let b = 0; b < m.numerator; b++) {
          const group = document.createElement('div');
          group.className = 'preview-beat';
          for (let s = 0; s < m.beatSubdivisions[b]; s++) {
            const dot = document.createElement('span');
            dot.className = 'preview-dot';
            dot.dataset.state = m.beatStates[b][s];
            group.appendChild(dot);
          }
          preview.appendChild(group);
        }
      });
    }

    function renderActiveMeasure() {
      const m = measures[activeMeasureIndex];
      if (!m) return;
      activeMeasureLabel.toggleAttribute('data-no-translate',!!m.name);
      activeMeasureLabel.textContent = m.name || `MESURE ${activeMeasureIndex + 1} / ${measures.length}`;
      updateVoiceGroupLabel(m);
      activeNumeratorSel.value = String(m.numerator);
      activeDenominatorSel.value = String(m.denominator);
      syncNumbox(activeNumeratorSel);
      syncNumbox(activeDenominatorSel);
      syncTempoUI(m);
      normalizeMeasureSubdivisions(m);
      buildCircularSequencer(m);
      if (!isPlaying) { playhead.stepIndex = 0; playhead.startTime = performance.now(); }
      refreshBeatEditor();
    }

    let beatEditorSelection = null;
    const beatEditor = document.createElement('div');
    beatEditor.id = 'beatEditor';
    beatEditor.hidden = true;
    beatEditor.setAttribute('role','dialog');
    beatEditor.setAttribute('aria-labelledby','beatEditorTitle');
    beatEditor.style.cssText = 'position:fixed;right:16px;top:130px;width:min(340px,calc(100vw - 32px));max-height:calc(100dvh - 160px);overflow:auto;z-index:1000;background:#20212a;border:1px solid var(--cyan);border-radius:10px;padding:16px;box-shadow:0 12px 50px #0009;box-sizing:border-box';
    document.body.appendChild(beatEditor);
    let beatEditorDrag = null;
    function positionBeatEditor(x,y) {
      const rect=beatEditor.getBoundingClientRect();
      beatEditor.style.right='auto';
      beatEditor.style.left=Math.max(8,Math.min(x,window.innerWidth-rect.width-8))+'px';
      beatEditor.style.top=Math.max(8,Math.min(y,window.innerHeight-rect.height-8))+'px';
    }
    beatEditor.addEventListener('pointerdown',e=>{
      if(e.button!==0 || !e.target.closest('.beat-editor-handle') || e.target.closest('button'))return;
      const rect=beatEditor.getBoundingClientRect();
      beatEditorDrag={pointerId:e.pointerId,x:e.clientX,y:e.clientY,left:rect.left,top:rect.top};
      beatEditor.setPointerCapture(e.pointerId);e.preventDefault();
    });
    beatEditor.addEventListener('pointermove',e=>{
      if(!beatEditorDrag || beatEditorDrag.pointerId!==e.pointerId)return;
      positionBeatEditor(beatEditorDrag.left+e.clientX-beatEditorDrag.x,beatEditorDrag.top+e.clientY-beatEditorDrag.y);
    });
    function finishBeatEditorDrag(e) {
      if(beatEditorDrag?.pointerId===e.pointerId)beatEditorDrag=null;
    }
    beatEditor.addEventListener('pointerup',finishBeatEditorDrag);
    beatEditor.addEventListener('pointercancel',finishBeatEditorDrag);
    beatEditor.addEventListener('lostpointercapture',finishBeatEditorDrag);
    function keepBeatEditorInView() {
      if(beatEditor.hidden)return;
      const rect=beatEditor.getBoundingClientRect();positionBeatEditor(rect.left,rect.top);
    }
    window.addEventListener('resize',keepBeatEditorInView);
    new ResizeObserver(keepBeatEditorInView).observe(beatEditor);
    function closeBeatEditor() { beatEditor.hidden = true; beatEditorSelection = null; sequencerContainer.querySelectorAll('.step.editing').forEach(el=>el.classList.remove('editing')); }
    function openBeatEditor(m, beat) {
      beatEditorSelection = { m, beat };
      beatEditor.hidden = false;
      refreshBeatEditor();
    }
    function refreshBeatEditor() {
      if (!beatEditorSelection) return;
      const { m, beat } = beatEditorSelection;
      const measureIndex = measures.indexOf(m);
      if (appMode !== 'metronome' || measureIndex < 0 || beat >= m.numerator) { closeBeatEditor(); return; }
      sequencerContainer.querySelectorAll('.step').forEach(el=>el.classList.toggle('editing',measures[activeMeasureIndex]===m&&Number(el.dataset.beat)===beat));
      beatEditor.replaceChildren();
      const header = document.createElement('div');
      header.className='beat-editor-handle';
      header.title='Glisser pour déplacer';
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;cursor:move;touch-action:none;user-select:none';
      const title = document.createElement('strong');
      title.id = 'beatEditorTitle';
      title.textContent = 'Temps ' + (beat+1) + ' · mesure ' + (measureIndex+1);
      const close = document.createElement('button');
      close.textContent = '×'; close.setAttribute('aria-label','Fermer');
      close.style.cssText='width:32px;height:32px;padding:0;background:transparent;border:1px solid var(--orange);border-radius:4px;color:var(--orange);font-size:22px;cursor:pointer';
      close.addEventListener('click',closeBeatEditor);
      header.append(title,close); beatEditor.appendChild(header);
      const label = document.createElement('label');
      label.className='beat-editor-division-label';
      label.textContent = 'Divisé en';
      const select = document.createElement('select');
      select.id = 'beatEditorDivision';
      for (const n of allowedSubdivisions(m.denominator)) {
        const option = document.createElement('option');option.value=n;option.textContent=n;select.appendChild(option);
      }
      select.value = m.beatSubdivisions[beat];
      select.addEventListener('change',() => {
        resizeBeat(m,beat,Number(select.value));validatePlayingState();
        if (measures[activeMeasureIndex] === m) renderActiveMeasure();
        refreshMeasurePreviews();refreshBeatEditor();
      });
      label.appendChild(select);beatEditor.appendChild(label);
      const pads = document.createElement('div');
      pads.id = 'beatEditorPads';
      pads.style.cssText = 'display:flex;flex-wrap:nowrap;gap:6px;margin:16px 0;overflow-x:auto';
      for (let i=0;i<m.beatSubdivisions[beat];i++) {
        const button = document.createElement('button');
        button.dataset.subIndex=i;button.dataset.state=m.beatStates[beat][i];
        button.textContent=i+1;
        const state=m.beatStates[beat][i];
        button.style.cssText='flex:1 0 28px;min-width:28px;height:48px;padding:0;border:2px solid transparent;border-radius:7px;font-weight:700;background:'+['var(--grey)','var(--cyan)','var(--yellow)','var(--orange)'][state]+';color:'+(state?'#111':'#ddd');
        button.setAttribute('aria-label','Subdivision '+(i+1)+', '+['éteint','clic 1','clic 2','clic 3'][state]);
        button.addEventListener('click',()=>{
          m.beatStates[beat][i]=(m.beatStates[beat][i]+1)%4;
          if(measures[activeMeasureIndex]===m){
            const block=sequencerContainer.querySelector('.step[data-beat="'+beat+'"]');
            if(block){block.dataset.state=m.beatStates[beat][0];block.firstChild.style.color=m.beatStates[beat][0]?'#111':'#ddd';}
          }
          renderSubdivisionDots(m);refreshMeasurePreviews();refreshBeatEditor();
        });pads.appendChild(button);
      }
      beatEditor.appendChild(pads);
      const legend=document.createElement('p');legend.className='beat-editor-legend';legend.style.cssText='display:flex;justify-content:center;flex-wrap:wrap;gap:8px 12px;margin:0;font-size:11px;color:var(--text-muted)';
      ['Éteint','Clic 1','Clic 2','Clic 3'].forEach((text,state)=>{const item=document.createElement('span'),dot=document.createElement('span');item.style.cssText='display:inline-flex;align-items:center;gap:5px';dot.setAttribute('aria-hidden','true');dot.style.cssText='width:9px;height:9px;border-radius:2px;background:'+['var(--grey)','var(--cyan)','var(--yellow)','var(--orange)'][state];item.append(dot,document.createTextNode(text));legend.append(item);});beatEditor.appendChild(legend);
      if(isPlaying){const note=document.createElement('p');note.textContent='Les divisions prennent effet au prochain passage de la mesure.';note.style.cssText='font-size:11px;color:var(--text-muted)';beatEditor.appendChild(note);}
    }
    function highlightBeatEditor(m,beat,subIndex,scheduledSubdivisions) {
      if(!beatEditorSelection || beatEditorSelection.m!==m || beatEditorSelection.beat!==beat)return;
      const current=Math.min(m.beatSubdivisions[beat]-1,Math.floor(subIndex*m.beatSubdivisions[beat]/scheduledSubdivisions));
      beatEditor.querySelectorAll('#beatEditorPads button').forEach((button,i)=>{button.style.borderColor=i===current?'#fff':'transparent';});
    }
    document.addEventListener('pointerdown',e=>{if(!beatEditor.hidden&&!beatEditor.contains(e.target)&&!e.target.closest('.step'))closeBeatEditor();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!beatEditor.hidden){closeBeatEditor();e.preventDefault();e.stopPropagation();}},true);
    beatEditor.addEventListener('keydown',e=>e.stopPropagation());

    function resizeBeat(m, beatIdx, newSubdiv) {
      if (!allowedSubdivisions(m.denominator).includes(newSubdiv)) return;
      const oldSubdiv = m.beatSubdivisions[beatIdx];
      m.beatSubdivisions[beatIdx] = newSubdiv;
      const states = m.beatStates[beatIdx];
      while (states.length > newSubdiv) states.pop();
      while (states.length < newSubdiv) states.push(0);
      if (states.length > 0 && oldSubdiv === 0) states[0] = 1;

    }

    function renderSubdivisionDots(m) {
      sequencerContainer.querySelectorAll('.subdivision-dot').forEach(el=>el.remove());
      const maxDivision=Math.max(...m.beatSubdivisions);
      sequencerContainer.style.setProperty('--dot-size',Math.max(2,Math.min(6,2*Math.PI*(RING_RADIUS-STEP_SIZE)/m.numerator/maxDivision*.45))+'px');
      for(let beat=0;beat<m.numerator;beat++) {
        const count=m.beatSubdivisions[beat];if(count===1)continue;
        for(let sub=0;sub<count;sub++) {
          const dot=document.createElement('span');dot.className='subdivision-dot';dot.dataset.beat=beat;dot.dataset.subIndex=sub;dot.dataset.state=m.beatStates[beat][sub];
          dot.style.setProperty('--angle',((beat+sub/count)/m.numerator*360)+'deg');sequencerContainer.appendChild(dot);
        }
      }
    }
    function buildCircularSequencer(m) {
      sequencerContainer.querySelectorAll('.step, .subdivision-dot, .beat-divider, .poly-dot, .poly-ring').forEach(el => el.remove());
      totalSteps = m.numerator;
      stepsData = [];
      for (let b = 0; b < m.numerator; b++) {
        stepsData.push({ beat: b, subIndex: 0, globalIndex: b });
        const step = document.createElement('div');
        step.className = 'step';
        // Regroupement graphique uniquement des signatures composées validées en /8.
        if (m.denominator === 8 && [6, 9, 12, 15, 18].includes(m.numerator)) {
          step.classList.add(b % 3 === 0 ? 'compound-strong' : 'compound-weak');
        }
        if (m.numerator === 3 && m.denominator === 8 && b === 0) step.classList.add('measure-start');
        step.dataset.state = m.beatStates[b][0];
        step.dataset.index = b;
        step.dataset.beat = b;
        step.setAttribute('role','button');
        step.tabIndex = 0;
        step.setAttribute('aria-label','Régler le temps ' + (b+1));
        step.title='Subdiviser ce temps';
        const angle = b / m.numerator * 360;
        step.style.setProperty('--angle', angle + 'deg');
        const number = document.createElement('span');
        number.textContent = b + 1;
        number.style.cssText = 'font-size:11px;font-weight:700;color:#111;transform:rotate(' + (-angle) + 'deg)';
        if (!m.beatStates[b][0]) number.style.color = '#ddd';
        step.appendChild(number);
        step.addEventListener('click', () => openBeatEditor(m,b));
        step.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();openBeatEditor(m,b);} });
        sequencerContainer.appendChild(step);
        const divider = document.createElement('div');
        divider.className = 'beat-divider';
        divider.style.setProperty('--divider-angle',angle+'deg');
        sequencerContainer.appendChild(divider);
      }
      updateRingRadius();
      renderSubdivisionDots(m);
    }

    function scheduler() {
      if (appMode === 'polyrhythm') { schedulerPolyrhythm(); return; }
      const voiceLead = SOUND_BANKS[currentBank]?.isVoice || window.RENAX_AMORCE?.active ? Math.max(VOICE_MAX_ATTACK_SECONDS,window.RENAX_AMORCE?.maxAttackSeconds || 0) : 0;
      while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime + voiceLead) {
        if (playingMeasureIndex >= measures.length) { playingMeasureIndex = 0; currentStepInMeasure = 0; }
        const mIdx = playingMeasureIndex;
        const sIdx = currentStepInMeasure;
        const model = measures[mIdx];
        if (!model) { timerID = setTimeout(scheduler, lookahead); return; }
        const m = getSchedulingMeasure(model);

        if (sIdx >= measureTotalSteps(m)) {
          scheduledMeasureLayouts.delete(model);
          currentStepInMeasure = 0;
          playingMeasureIndex = loopedMeasure && measures.includes(loopedMeasure) ? measures.indexOf(loopedMeasure) : (playingMeasureIndex + 1) % measures.length;
          advanceSilentCycle();
          if(!loopedMeasure && typeof songAtEnd==='function' && songAtEnd())return;
          continue;
        }

        const { beat, subIndex } = getBeatAndSub(m, sIdx);
        const state = m.beatStates[beat] ? m.beatStates[beat][subIndex] : 0;
        const isFirst = (sIdx === 0);
        const rampStep = !training.engaged ? window.RENAX_SONG_TEMPO?.liveStep?.(mIdx,beat,subIndex,m.beatSubdivisions[beat]||1) : null;
        const effectiveTempo = rampStep?.tempo ?? getEffectiveTempo(m);
        const beatDurationSec = rampStep?.beatSeconds ?? getStepDurationMs(effectiveTempo, m.denominator, 1) / 1000;
        const voiceGroupSize = getVoiceGroupSize(m);
        if (!window.RENAX_AMORCE?.step(nextNoteTime,state,isFirst,subIndex,beat) && state > 0 && isSilentCycleAudible()) {
          if(model.countIn)playCountIn(nextNoteTime,isFirst);else playClick(state, nextNoteTime, isFirst, {
            mode: 'metronome',
            isMainBeat: subIndex === 0,
            isOtherStrongBeat: isOtherStrongBeat(m, beat, subIndex),
            beatNumber: beat % voiceGroupSize === 0 ? Math.floor(beat / voiceGroupSize) + 1 : 0,
            subIndex,
            beatDurationSec: beatDurationSec * voiceGroupSize
          });
        }
        const subdiv = m.beatSubdivisions[beat] || 1;
        const stepSeconds = rampStep?.seconds ?? getStepDurationMs(effectiveTempo, m.denominator, subdiv) / 1000;
        scheduleVisualUpdate(mIdx, sIdx, nextNoteTime, { beat, subIndex, voiceGroupSize, subdivisions: m.beatSubdivisions[beat], durationMs: stepSeconds * 1000 });

        nextNoteTime += stepSeconds;

        currentStepInMeasure++;
        if (currentStepInMeasure >= measureTotalSteps(m)) {
          scheduledMeasureLayouts.delete(model);
          currentStepInMeasure = 0;
          playingMeasureIndex = loopedMeasure && measures.includes(loopedMeasure) ? measures.indexOf(loopedMeasure) : (playingMeasureIndex + 1) % measures.length;
          advanceSilentCycle();
          if(!loopedMeasure && typeof songAtEnd==='function' && songAtEnd())return;
        }
      }
      timerID = setTimeout(scheduler, lookahead);
    }

    function scheduleVisualUpdate(mIdx, sIdx, time, musicalPosition = null) {
      const visualModel=measures[mIdx],multiGeneration=window.RENAX_MULTI?.active?window.RENAX_MULTI.generation:null;
      const drawTime = (time - audioCtx.currentTime) * 1000;
      setTimeout(() => {
        if (!isPlaying) return;
        if(multiGeneration!==null&&(!window.RENAX_MULTI?.active||window.RENAX_MULTI.generation!==multiGeneration||measures[activeMeasureIndex]!==visualModel))return;
        if (activeMeasureIndex !== mIdx) {
          activeMeasureIndex = mIdx;
          renderActiveMeasure();
          measureListEl.querySelectorAll('.measure-card').forEach((c, i) => {
            c.classList.toggle('playing', i === playingMeasureIndex);
            c.classList.toggle('active', i === activeMeasureIndex);
          });
        }
        const m = measures[mIdx];
        const position = musicalPosition ?? { ...getBeatAndSub(m, sIdx), subdivisions: 1 };
        const beat = position.beat;
        const visibleSubdivisions = m.beatSubdivisions[beat] || 1;
        const visibleIndex = beat + position.subIndex / position.subdivisions;
        const stepEls = sequencerContainer.querySelectorAll('.step');
        stepEls.forEach(el => el.classList.remove('active'));
        const stepEl = stepEls[Math.floor(visibleIndex)];
        if (stepEl) {
          stepEl.classList.add('active');
          emitBurst(Math.floor(visibleIndex), parseInt(stepEl.dataset.state));
        }
        beatDisplay.textContent = Math.floor(beat / (position.voiceGroupSize || 1)) + 1;
        beatDisplay.classList.add('pulse');
        setTimeout(() => beatDisplay.classList.remove('pulse'), 130);
        markPlayheadStep(visibleIndex, position.durationMs, 1 / position.subdivisions);
        highlightBeatEditor(m, beat, position.subIndex, position.subdivisions);
      }, Math.max(0, drawTime));
    }


    function createPolyMeasure(numerator = 5, denominator = 4, measureTempo = tempo) {
      const n = Math.max(2, Math.min(20, Math.round(numerator || 5)));
      const d = Math.max(2, Math.min(20, Math.round(denominator || 4)));
      return {
        numerator: n,
        denominator: d,
        tempo: Math.max(2, Math.min(999, Math.round(measureTempo || 120))),
        isPolyrhythm: true,
        outerStates: Array(n).fill(3),
        innerStates: Array(d).fill(1)
      };
    }

    function ensurePolyStates(m) {
      if (!Array.isArray(m.outerStates)) m.outerStates = Array(m.numerator).fill(3);
      if (!Array.isArray(m.innerStates)) m.innerStates = Array(m.denominator).fill(1);
      if (m.outerStates.length !== m.numerator) {
        const old = m.outerStates.slice();
        m.outerStates = Array.from({length:m.numerator}, (_,i) => old[i] ?? 3);
      }
      if (m.innerStates.length !== m.denominator) {
        const old = m.innerStates.slice();
        m.innerStates = Array.from({length:m.denominator}, (_,i) => old[i] ?? 1);
      }
    }

    function clampPolyValue(value, fallback) {
      const n = parseInt(value, 10);
      return Math.max(2, Math.min(20, Number.isFinite(n) ? n : fallback));
    }

    function getPolyEvents(m) {
      const map = new Map();
      const add = (u, key) => {
        const k = Math.round(u * 1000000) / 1000000;
        if (!map.has(k)) map.set(k, { u:k, outer:false, inner:false, outerIndex:-1, innerIndex:-1 });
        return map.get(k);
      };
      for (let i=0;i<m.numerator;i++) { const e=add(i/m.numerator); e.outer=true; e.outerIndex=i; }
      for (let i=0;i<m.denominator;i++) { const e=add(i/m.denominator); e.inner=true; e.innerIndex=i; }
      return [...map.values()].sort((a,b)=>a.u-b.u);
    }

    function buildPolyVisualizer(m) {
      ensurePolyStates(m);
      sequencerContainer.querySelectorAll('.step, .subdivision-dot, .beat-divider, .poly-dot, .poly-ring').forEach(el => el.remove());
      totalSteps = 0;
      stepsData = [];
      clearProgressTrail();
      const outerRing=document.createElement('div'); outerRing.className='poly-ring outer'; sequencerContainer.appendChild(outerRing);
      const innerRing=document.createElement('div'); innerRing.className='poly-ring inner'; sequencerContainer.appendChild(innerRing);

      const bindPolyState = (el, states, index) => {
        el.setAttribute('role','button');el.tabIndex=0;el.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();el.click();}});
        const apply = () => {
          const s = states[index] ?? 0;
          el.dataset.state = String(s);
          el.title = s === 0 ? 'Éteint' : `Clic ${s}`;
          el.setAttribute('aria-label', el.title);
        };
        apply();
        el.addEventListener('click', ev => {
          ev.stopPropagation();
          states[index] = ((states[index] ?? 0) + 1) % 4;
          apply();
          renderSequencerList();
        });
      };

      for (let i=0;i<m.numerator;i++) {
        const d=document.createElement('div'); d.className='poly-dot outer'; d.dataset.polyOuter=i;
        d.style.setProperty('--angle', `${(i/m.numerator)*360}deg`);
        bindPolyState(d, m.outerStates, i);
        sequencerContainer.appendChild(d);
      }
      for (let i=0;i<m.denominator;i++) {
        const d=document.createElement('div'); d.className='poly-dot inner'; d.dataset.polyInner=i;
        d.style.setProperty('--angle', `${(i/m.denominator)*360}deg`);
        bindPolyState(d, m.innerStates, i);
        sequencerContainer.appendChild(d);
      }
      beatDisplay.textContent=`${m.numerator}:${m.denominator}`;
    }

    function renderPolyrhythmList() {
      measureListEl.innerHTML='';
      const numberMenu=(min,max,value,label)=>{const select=document.createElement('select');select.setAttribute('aria-label',label);for(let v=min;v<=max;v++){const option=document.createElement('option');option.value=String(v);option.textContent=String(v);select.append(option);}select.value=String(value);return select;};
      measures.forEach((m,i)=>{
        const card=document.createElement('div');
        card.className='measure-card'; card.setAttribute('role','group');card.setAttribute('aria-label','Mesure '+(i+1)); card.tabIndex=0;
        if(i===activeMeasureIndex) card.classList.add('active');
        if(isPlaying && i===playingMeasureIndex) card.classList.add('playing');
        const head=document.createElement('div'); head.className='measure-head';
        head.innerHTML=`<span class="measure-num">MESURE ${i+1} / ${measures.length}</span><span class="measure-sig">${m.numerator}:${m.denominator}</span>`;
        const ratio=document.createElement('div'); ratio.className='poly-ratio-row';
        const n=numberMenu(2,20,m.numerator,`Numérateur mesure ${i+1}`);
        const slash=document.createElement('span'); slash.textContent=':'; slash.className='poly-slash';
        const d=numberMenu(2,20,m.denominator,`Dénominateur mesure ${i+1}`);
        const stop=e=>e.stopPropagation(); n.addEventListener('click',stop); d.addEventListener('click',stop); n.addEventListener('keydown',stop); d.addEventListener('keydown',stop);
        const updateRatio=()=>{ m.numerator=clampPolyValue(n.value,m.numerator); m.denominator=clampPolyValue(d.value,m.denominator); ensurePolyStates(m); n.value=m.numerator; d.value=m.denominator; head.querySelector('.measure-sig').textContent=`${m.numerator}:${m.denominator}`; if(i===activeMeasureIndex) renderActiveMeasure(); };
        n.addEventListener('change',updateRatio); d.addEventListener('change',updateRatio);
        ratio.append(n,slash,d);
        const tempoRow=document.createElement('div'); tempoRow.className='measure-tempo-row';
        const tempoLabel=document.createElement('span'); tempoLabel.className='measure-tempo-label'; tempoLabel.textContent='TEMPO';
        const tempoInput=numberMenu(2,999,m.tempo,`Tempo mesure ${i+1} (BPM)`);tempoInput.className='measure-tempo-input';
        const unit=document.createElement('span'); unit.className='measure-tempo-unit'; unit.textContent='BPM';
        tempoInput.addEventListener('click',stop); tempoInput.addEventListener('keydown',stop);
        tempoInput.addEventListener('change',()=>{ const v=Math.max(2, Math.min(999,parseInt(tempoInput.value)||m.tempo)); m.tempo=v; tempoInput.value=v; if(i===activeMeasureIndex&&!training.engaged) syncTempoUI(m); });
        tempoRow.append(tempoLabel,tempoInput,unit);
        const preview=document.createElement('div'); preview.className='poly-card-preview';
        const ob=document.createElement('div'); ob.className='outer-mini'; ob.style.width=`${Math.min(100,m.numerator*8)}px`;
        const ib=document.createElement('div'); ib.className='inner-mini'; ib.style.width=`${Math.min(100,m.denominator*8)}px`;
        preview.append(ob,ib);
        card.append(head,ratio,tempoRow,preview);
        const select=()=>{ activeMeasureIndex=i; syncTempoUI(m); renderSequencerList(); renderActiveMeasure(); };
        card.addEventListener('click',select); card.addEventListener('keydown',e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();select();}});
        measureListEl.appendChild(card);
      });
    }

    const renderSequencerListMetronome = renderSequencerList;
    renderSequencerList = function() {
      if (appMode === 'polyrhythm') renderPolyrhythmList();
      else renderSequencerListMetronome();
      decorateSequenceCards();
    };

    const renderActiveMeasureMetronome = renderActiveMeasure;
    renderActiveMeasure = function() {
      if (appMode !== 'polyrhythm') return renderActiveMeasureMetronome();
      const m=measures[activeMeasureIndex]; if(!m) return;
      activeMeasureLabel.toggleAttribute('data-no-translate',!!m.name);
      activeMeasureLabel.textContent=m.name||`MESURE ${activeMeasureIndex+1} / ${measures.length}`;
      updateVoiceGroupLabel();
      refreshBeatEditor();
      polyNumeratorInput.value=String(m.numerator); polyDenominatorInput.value=String(m.denominator); syncNumbox(polyNumeratorInput); syncNumbox(polyDenominatorInput);
      syncTempoUI(m); buildPolyVisualizer(m);
      playhead.stepIndex=0; playhead.startTime=performance.now();
    };

    function schedulePolyVisualUpdate(mIdx, event, time) {
      const drawTime=(time-audioCtx.currentTime)*1000;
      setTimeout(()=>{
        if(!isPlaying || appMode!=='polyrhythm') return;
        if(activeMeasureIndex!==mIdx){ activeMeasureIndex=mIdx; renderActiveMeasure(); renderSequencerList(); }
        sequencerContainer.querySelectorAll('.poly-dot').forEach(el=>el.classList.remove('active'));
        if(event.outer){ const el=sequencerContainer.querySelector(`[data-poly-outer="${event.outerIndex}"]`); if(el) el.classList.add('active'); }
        if(event.inner){ const el=sequencerContainer.querySelector(`[data-poly-inner="${event.innerIndex}"]`); if(el) el.classList.add('active'); }
        const m=measures[mIdx]; if(m){ beatDisplay.textContent=`${m.numerator}:${m.denominator}`; beatDisplay.classList.add('pulse'); setTimeout(()=>beatDisplay.classList.remove('pulse'),130); }
      },Math.max(0,drawTime));
    }

    function schedulerPolyrhythm() {
      while(nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
        if(playingMeasureIndex>=measures.length){playingMeasureIndex=0; polyEventIndex=0;}
        const mIdx=playingMeasureIndex, m=measures[mIdx];
        if(!m){timerID=setTimeout(scheduler,lookahead);return;}
        const events=getPolyEvents(m);
        if(polyEventIndex>=events.length) polyEventIndex=0;
        const e=events[polyEventIndex];
        ensurePolyStates(m);
        if(e.outer) {
          const s = m.outerStates[e.outerIndex] ?? 3;
          if (s > 0) playClick(s,nextNoteTime,e.u===0);
        }
        if(e.inner) {
          const s = m.innerStates[e.innerIndex] ?? 1;
          if (s > 0) playClick(s,nextNoteTime,e.u===0);
        }
        schedulePolyVisualUpdate(mIdx,e,nextNoteTime);
        // Le numérateur est la pulsation de référence : sa vitesse reste fixée par le BPM.
        // Le dénominateur se répartit dans la même durée sans accélérer/ralentir le numérateur.
        const cycleSec=(m.numerator*60)/getEffectiveTempo(m);
        const nextU=(polyEventIndex+1<events.length)?events[polyEventIndex+1].u:1;
        nextNoteTime += Math.max(.001,(nextU-e.u)*cycleSec);
        polyEventIndex++;
        if(polyEventIndex>=events.length){ polyEventIndex=0; playingMeasureIndex=loopedMeasure&&measures.includes(loopedMeasure)?measures.indexOf(loopedMeasure):(playingMeasureIndex+1)%measures.length; }
      }
      timerID=setTimeout(scheduler,lookahead);
    }

    function setAppMode(mode) {
      if(mode!== 'metronome' && mode!=='polyrhythm') return;
      if(isPlaying) stopMetronome();
      if(appMode==='metronome') metronomeMeasures=measures; else polyrhythmMeasures=measures;
      appMode=mode;
      particles.length = 0;
      pulses.length = 0;
      clearProgressTrail();
      if (pctx && canvas) {
        clearParticleCanvas();
      }
      if(mode==='metronome') {
        beatDisplay.textContent='1';
        beatDisplay.classList.remove('pulse');
      }
      measures=(mode==='metronome')?metronomeMeasures:polyrhythmMeasures;
      if(!measures.length) measures=[mode==='metronome'?createMeasure(4,4):createPolyMeasure(5,4,tempo)];
      if(mode==='metronome') metronomeMeasures=measures; else polyrhythmMeasures=measures;
      activeMeasureIndex=0; playingMeasureIndex=0; currentStepInMeasure=0; polyEventIndex=0;
      measureCountSel.value=String(measures.length);
      document.body.classList.toggle('poly-mode',mode==='polyrhythm');
      metroSigGroup.style.display=mode==='metronome'?'flex':'none';
      polyControls.classList.toggle('active',mode==='polyrhythm');
      modeSwitch.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
      syncTempoUI(measures[0]); renderSequencerList(); renderActiveMeasure();
    }

    modeSwitch.addEventListener('click',e=>{ const b=e.target.closest('button[data-mode]'); if(b) setAppMode(b.dataset.mode); });
    function updateActivePolyRatio(){ if(appMode!=='polyrhythm') return; const m=measures[activeMeasureIndex]; if(!m)return; m.numerator=clampPolyValue(polyNumeratorInput.value,m.numerator); m.denominator=clampPolyValue(polyDenominatorInput.value,m.denominator); ensurePolyStates(m); renderSequencerList(); renderActiveMeasure(); }
    polyNumeratorInput.addEventListener('change',updateActivePolyRatio);
    polyDenominatorInput.addEventListener('change',updateActivePolyRatio);

    async function startMetronome() {
      if(window.RENAX_MULTI?.active)return window.RENAX_MULTI.start();
      if (isPlaying || playbackStarting) return;
      playbackStarting = true;
      updateTrainButton();
      try {
      await initAudio();
      try {
        await ensureInstrumentBankReady(currentBank);
      } catch (err) {
        console.warn('Instrument samples unavailable; using original fallback:', err);
      }
      try {
        await ensureVoiceMetronomeReady(currentBank);
      } catch (err) {
        console.warn('Voice metronome preload unavailable:', err);
        return;
      }
      if (isPlaying) return;
      isPlaying = true;
      playingMeasureIndex = loopedMeasure && measures.includes(loopedMeasure) ? measures.indexOf(loopedMeasure) : 0;
      currentStepInMeasure = 0;
      polyEventIndex = 0;
      activeMeasureIndex = playingMeasureIndex;
      resetSilentCycle();
      scheduledMeasureLayouts = new WeakMap();
      renderSequencerList();
      renderActiveMeasure();
      const voiceLead = appMode === 'metronome' && (SOUND_BANKS[currentBank]?.isVoice || window.RENAX_AMORCE?.active) ? Math.max(VOICE_MAX_ATTACK_SECONDS,window.RENAX_AMORCE?.maxAttackSeconds || 0) : 0;
      nextNoteTime = audioCtx.currentTime + 0.05 + voiceLead;
      window.RENAX_AMORCE?.begin(audioCtx,nextNoteTime);
      playBtn.textContent = 'STOP';
      playBtn.classList.remove('btn-primary');
      playBtn.classList.add('btn-cyan');
      resetWorkTimer();
      if (!training.active) startWorkTimer();
      updateTimerDisplay();
      // Le playhead visuel démarre sur le premier événement planifié, pas avant.
      // Cela garde le tout premier passage 1 → 2 parfaitement synchronisé avec l'audio.
      playhead.stepIndex = 0;
      playhead.span = 0;
      playhead.startTime = performance.now();
      clearProgressTrail();
      scheduler();
      } finally { playbackStarting = false; updateTrainButton(); renderSequencerList(); }
    }

    function stopMetronome({ keepTrainingMode = false } = {}) {
      if(window.RENAX_MULTI?.active)return window.RENAX_MULTI.stop();
      loopedMeasure = null;
      if (!isPlaying) return;
      isPlaying = false;
      updateTrainButton();
      clearTimeout(timerID);
      timerID = null;
      for (const src of scheduledVoiceSources) src.stop();
      scheduledVoiceSources.clear();
      scheduledMeasureLayouts = new WeakMap();
      playBtn.textContent = 'Start';
      playBtn.classList.remove('btn-cyan');
      playBtn.classList.add('btn-primary');
      sequencerContainer.querySelectorAll('.step, .poly-dot').forEach(s => s.classList.remove('active'));
      beatDisplay.textContent = '1';
      beatDisplay.classList.remove('pulse');
      particles.length = 0;
      pulses.length = 0;
      clearProgressTrail();
      if (pctx && canvas) {
        clearParticleCanvas();
      }
      resetWorkTimer();
      if (training.active) {
        if (keepTrainingMode) resetTrainingToStart();
        else endTraining();
      }
      updateTimerDisplay();
      renderSequencerList();
      renderActiveMeasure();
    }

    function setDirection(dir) {
      training.direction = dir;
      dirToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.dir === dir));
      if (window.RENAX_TRAINING?.mode === 'steps') return;
      const a = parseInt(trainStartInput.value) || 80;
      const b = parseInt(trainEndInput.value) || 140;
      if (dir === 'up' && a > b) { trainStartInput.value = b; trainEndInput.value = a; }
      else if (dir === 'down' && a < b) { trainStartInput.value = b; trainEndInput.value = a; }
    }
    dirToggle.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => setDirection(btn.dataset.dir));
    });

    function startTraining() {
      if (!training.engaged && (isPlaying || playbackStarting || window.RENAX_SONGS?.preparing)) return;
      let dur = parseFloat(trainDurationInput.value);
      if (!Number.isFinite(dur) || dur <= 0) dur = 3;
      dur = Math.max(1, Math.min(Number(trainDurationInput.max) || 60, dur));
      trainDurationInput.value = dur;

      let a = Math.max(2, Math.min(999, parseInt(trainStartInput.value) || 80));
      let b = Math.max(2, Math.min(999, parseInt(trainEndInput.value) || 140));
      trainStartInput.value = a; trainEndInput.value = b;

      let sBpm, eBpm;
      if (training.direction === 'up') { sBpm = Math.min(a, b); eBpm = Math.max(a, b); }
      else { sBpm = Math.max(a, b); eBpm = Math.min(a, b); }

      training.run = window.RENAX_TRAINING?.prepare(a, b, dur, training.direction);
      training.engaged = true;
      training.duration = training.run?.duration ?? dur * 60 * 1000;
      training.startBpm = training.run?.startBpm ?? sBpm;
      training.endBpm = training.run?.endBpm ?? eBpm;
      restartTraining();
    }

    function resetTrainingToStart() {
      training.active = false;
      training.startTime = 0;
      if (training.intervalId) { clearInterval(training.intervalId); training.intervalId = null; }
      tempo = training.startBpm;
      bpmSlider.value = tempo;
      bpmDisplay.innerHTML = `${tempo} <span>BPM</span>`; updateMobileTrainingBpm(tempo);
      bpmSlider.disabled = training.engaged;
      updateTrainButton();
    }

    function restartTraining() {
      if (!training.engaged) return;
      training.active = true;
      window.RENAX_TRAINING?.begin();
      training.startTime = performance.now();
      tempo = training.startBpm;
      bpmSlider.value = tempo;
      bpmDisplay.innerHTML = `${tempo} <span>BPM</span>`; updateMobileTrainingBpm(tempo);
      bpmSlider.disabled = true;
      pauseWorkTimer();
      updateTrainButton();
      clearInterval(training.intervalId);
      training.intervalId = setInterval(trainingTick, 100);
      if (!isPlaying) startMetronome().catch(reportAudioFailure);
    }

    function trainingTick() {
      if (!training.active) return;
      const elapsed = performance.now() - training.startTime;
      const progress = Math.min(elapsed / training.duration, 1);
      const result = training.run && window.RENAX_TRAINING
        ? RENAX_TRAINING.at(training.run, elapsed)
        : { bpm: Math.round(training.startBpm + (training.endBpm - training.startBpm) * progress), done: progress >= 1 };
      const bpm = result.bpm;
      if (bpm !== tempo) {
        tempo = bpm;
        bpmSlider.value = bpm;
        bpmDisplay.innerHTML = `${bpm} <span>BPM</span>`; updateMobileTrainingBpm(bpm);
      }
      if (result.done) {
        if (isPlaying) stopMetronome({ keepTrainingMode: true });
        else resetTrainingToStart();
        endTraining();
        updateTimerDisplay();
        if (training.run?.mode === 'steps') {
          tempo = bpm; bpmSlider.value = bpm;
          bpmDisplay.innerHTML = `${bpm} <span>BPM</span>`; updateMobileTrainingBpm(bpm);
        }
        window.RENAX_TRAINING?.finish(bpm);
      }
    }

    function endTraining() {
      const wasEngaged = training.engaged;
      training.active = false;
      training.engaged = false;
      training.startTime = 0;
      if (training.intervalId) { clearInterval(training.intervalId); training.intervalId = null; }
      bpmSlider.disabled = false;
      if (wasEngaged) syncTempoUI(measures[activeMeasureIndex]);
      updateTrainButton();
      if (isPlaying) startWorkTimer();
    }

    function updateTrainButton() {
      trainBtn.setAttribute('aria-pressed',String(training.engaged));
      const blocked = !training.engaged && (isPlaying || playbackStarting || window.RENAX_SONGS?.preparing);
      trainBtn.disabled = !!blocked;
      trainBtn.title = blocked ? 'Arrête la lecture avant de démarrer l’entraînement' : '';
      window.RENAX_TRAINING?.update();
      if (training.engaged) {
        trainBtn.textContent = "Arrêter l'entraînement";
        trainBtn.classList.add('active');
        panicBtn.textContent = "Arrêter";
        panicBtn.setAttribute("aria-label", "Arrêter l'entraînement");
        panicBtn.title = "Arrêter l'entraînement";
      } else {
        trainBtn.textContent = "Démarrer l'entraînement";
        trainBtn.classList.remove('active');
        panicBtn.textContent = "Reset";
        panicBtn.setAttribute("aria-label", "Reset");
        panicBtn.title = "Reset";
      }
    }

    trainBtn.addEventListener('click', () => {
      if (trainBtn.disabled) return;
      if (training.engaged) {
        if (isPlaying) stopMetronome({ keepTrainingMode: true });
        endTraining();
        updateTimerDisplay();
      } else {
        startTraining();
        if(window.innerWidth<=1100) switchTab('visu');
      }
    });

    let tapTimes = [];
    let tapFlashTimeout = null;

    function doTapTempo() {
      const now = performance.now();
      tapTimes.push(now);
      if (tapTimes.length > 5) tapTimes.shift();
      tapBtn.classList.add('hit');
      clearTimeout(tapFlashTimeout);
      tapFlashTimeout = setTimeout(() => tapBtn.classList.remove('hit'), 90);
      if (tapTimes.length >= 2) {
        const intervals = [];
        for (let i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i - 1]);
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const newBpm = Math.round(60000 / avg);
        if (newBpm >= 2 && newBpm <= 999) {
          if(tempo!==newBpm)resetCustomizationTimer();
          tempo = newBpm;
          const m = measures[activeMeasureIndex];
          if (m && !training.engaged) m.tempo = newBpm;
          bpmSlider.value = tempo;
          bpmDisplay.innerHTML = `${tempo} <span>BPM</span>`; updateMobileTrainingBpm(tempo);
          refreshTempoFields();
        }
      }
      clearTimeout(doTapTempo._reset);
      doTapTempo._reset = setTimeout(() => { tapTimes = []; }, 2000);
    }
    tapBtn.addEventListener('click', doTapTempo);

    function isEditingField() {
      const el = document.activeElement;
      if (!el) return false;
      if(el.closest('dialog,[role=dialog][aria-modal=true]'))return true;
      const tag = el.tagName;
      if (tag === 'INPUT') {
        const t = (el.type || '').toLowerCase();
        return ['text','number','tel','email','password','search','url','date','time','datetime-local','month','week'].includes(t);
      }
      return tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    bpmSlider.addEventListener('input', (e) => {
      if (training.engaged) return;
      tempo = parseInt(e.target.value);
      const m = measures[activeMeasureIndex];
      if (m) m.tempo = tempo;
      bpmDisplay.innerHTML = `${tempo} <span>BPM</span>`; updateMobileTrainingBpm(tempo);
      refreshTempoFields();
    });

    volumeSlider.addEventListener('input', (e) => {
      const v = parseInt(e.target.value);
      masterVolume = Math.max(0, Math.min(1, v / 100));
      volumeValue.textContent = `${v}%`;
    });

    soundBankSel.addEventListener('change', async (e) => {
      currentBank = e.target.value;
      updateVoiceGroupLabel();

      // En lecture : changer la banque uniquement, sans jouer l'aperçu.
      if (isPlaying) {
        ensureInstrumentBankReady(currentBank).catch(err => console.warn('Instrument bank fallback:', err));
        return;
      }

      // À l'arrêt : le geste utilisateur autorise l'initialisation Web Audio,
      // donc l'aperçu fonctionne même si Play n'a encore jamais été lancé.
      try {
        await initAudio();
      } catch (err) {
        console.warn('Audio preview unavailable:', err);
        return;
      }
      if (isPlaying || !audioCtx || audioCtx.state !== 'running') return;

      try {
        await ensureInstrumentBankReady(currentBank);
      } catch (err) {
        console.warn('Instrument preview fallback:', err);
      }
      try {
        await ensureVoiceMetronomeReady(currentBank);
      } catch (err) {
        console.warn('Voice metronome preview preload unavailable:', err);
      }

      const out = audioCtx.createGain();
      out.gain.value = masterVolume * (BANK_GAINS[currentBank] ?? 1);
      const bank = SOUND_BANKS[currentBank];
      out.connect(bank?.isVoice ? getVoiceMixDestination(audioCtx) : getAudioMixDestination(audioCtx));
      const t = audioCtx.currentTime + 0.02 + (bank?.isVoice ? VOICE_MAX_ATTACK_SECONDS : 0);

      if (bank && bank.isVoice) {
        bank.play(out, t, 1, false, { mode: 'metronome', beatNumber: 1, subIndex: 0, beatDurationSec: 0.42 });
        bank.play(out, t + 0.42, 2, false, { mode: 'metronome', beatNumber: 2, subIndex: 0, beatDurationSec: 0.42 });
        bank.play(out, t + 0.84, 3, false, { mode: 'metronome', beatNumber: 3, subIndex: 0, beatDurationSec: 0.42 });
      } else {
        bank.play(out, t, 1, false);
        bank.play(out, t + 0.18, 2, false);
        bank.play(out, t + 0.36, 3, false);
      }
    });

    silentToggle.addEventListener('click', () => setSilentMode(!silentModeEnabled));
    clickMeasureCountSel.addEventListener('change', () => {
      clickMeasures = Math.max(1, Math.min(32, parseInt(clickMeasureCountSel.value) || 1));
      clickMeasureCountSel.value = String(clickMeasures);
      resetSilentCycle();
    });
    silentMeasureCountSel.addEventListener('change', () => {
      silentMeasures = Math.max(0, Math.min(32, parseInt(silentMeasureCountSel.value) || 0));
      silentMeasureCountSel.value = String(silentMeasures);
      resetSilentCycle();
    });

    measureCountSel.addEventListener('change', () => {
      if (loopedMeasure) stopMetronome();
      const n = Math.max(1, Math.min(8, parseInt(measureCountSel.value)));
      if (appMode === 'polyrhythm') {
        while (measures.length < n) measures.push(createPolyMeasure(5, 4, tempo));
      } else {
        while (measures.length < n) measures.push(createMeasure(4, 4));
      }
      if (measures.length > n) measures.length = n;
      activeMeasureIndex = Math.min(activeMeasureIndex, measures.length - 1);
      validatePlayingState();
      renderSequencerList();
      renderActiveMeasure();
    });

    activeNumeratorSel.addEventListener('change', () => {
      const m = measures[activeMeasureIndex];
      if (!m) return;
      const newNum = parseInt(activeNumeratorSel.value);
      const oldNum = m.numerator;
      m.numerator = newNum;
      if (newNum > oldNum) {
        while (m.beatSubdivisions.length < newNum) m.beatSubdivisions.push(1);
        while (m.beatStates.length < newNum) m.beatStates.push([1]);
      } else if (newNum < oldNum) {
        m.beatSubdivisions.length = newNum;
        m.beatStates.length = newNum;
      }
      validatePlayingState();
      renderActiveMeasure();
      refreshMeasurePreviews();
    });

    activeDenominatorSel.addEventListener('change', () => {
      const m = measures[activeMeasureIndex];
      if (!m) return;
      m.denominator = parseInt(activeDenominatorSel.value);
      normalizeMeasureSubdivisions(m);
      // Appliquer la nouvelle unité aux événements encore à programmer.
      scheduledMeasureLayouts.delete(m);
      validatePlayingState();
      refreshBeatEditor();
      renderActiveMeasure();
      refreshMeasurePreviews();
    });

    playBtn.addEventListener('click', () => {
      if (playBtn.disabled) return;
      if (isPlaying) {
        if (training.active) stopMetronome({ keepTrainingMode: true });
        else stopMetronome();
      } else if (training.engaged) {
        restartTraining();
      } else {
        startMetronome().catch(reportAudioFailure);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (isEditingField()) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (playBtn.disabled) return;
        if (isPlaying) {
          if (training.active) stopMetronome({ keepTrainingMode: true });
          else stopMetronome();
        } else if (training.engaged) {
          restartTraining();
        } else {
          startMetronome().catch(reportAudioFailure);
        }
      }
      if (e.code === 'Numpad0' || e.code === 'KeyT'&&!e.ctrlKey&&!e.altKey&&!e.metaKey) {
        e.preventDefault();
        doTapTempo();
      }
    });

    panicBtn.addEventListener('click', () => {
      if (training.engaged) {
        if (isPlaying) stopMetronome({ keepTrainingMode: true });
        endTraining();
        updateTimerDisplay();
        return;
      }
      stopMetronome();
      endTraining();
      resetWorkTimer();
      if (appMode === 'polyrhythm') {
        polyrhythmMeasures = [createPolyMeasure(5, 4, tempo)];
        measures = polyrhythmMeasures;
      } else {
        // RESET ne relance pas le chargement audio : conserver son état réel.
        metronomeMeasures = [createMeasure(4, 4)];
        measures = metronomeMeasures;
      }
      activeMeasureIndex = 0;
      playingMeasureIndex = 0;
      currentStepInMeasure = 0;
      resetSilentCycle();
      measureCountSel.value = '1';
      particles.length = 0;
      pulses.length = 0;
      clearProgressTrail();
      renderSequencerList();
      renderActiveMeasure();
      updateTimerDisplay();
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => { resizeCanvas(); updateRingRadius(); }, 200);
    });

    metronomeMeasures = [createMeasure(4, 4)];
    metronomeMeasures[0].beatSubdivisions = [1, 1, 1, 1];
    metronomeMeasures[0].beatStates = [[1], [1], [1], [1]];
    polyrhythmMeasures = [createPolyMeasure(5, 4, 120)];
    measures = metronomeMeasures;
    renderSequencerList();
    renderActiveMeasure();
    bpmDisplay.innerHTML = `${tempo} <span>BPM</span>`; updateMobileTrainingBpm(tempo);
    volumeValue.textContent = '80%';
    soundBankSel.value = currentBank;
    setSilentMode(false);
    syncTempoUI(measures[0]);

    requestAnimationFrame(() => {
      resizeCanvas();
      updateRingRadius();
      animate();
    });
    // Warm voices only after the initial interface; explicit voice selection still loads immediately.
    setTimeout(()=>{const warm=()=>prepareAllVoiceAudio().catch(()=>{});if(window.requestIdleCallback)requestIdleCallback(warm,{timeout:1000});else warm();},2000);
