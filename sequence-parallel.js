/* Tempo parallèle du Séquenceur : durée de référence fixe, sans lecture simultanée. */
(() => {
  'use strict';
  const notes = [
    ['dottedEighth', 'Croche pointée', 3, 16],
    ['quarterTriplet', 'Noire de triolet', 1, 6],
    ['dottedQuarter', 'Noire pointée', 3, 8],
    ['inverseFourThree', 'Rapport inverse 3:4', 0, 0],
    ['eighthTriplet', 'Croche de triolet', 1, 12],
    ['quarter', 'Noire', 1, 4],
    ['custom', 'Rapport libre (avancé)', 0, 0]
  ];
  const positive = x => /^[1-9][0-9]*$/.test(String(x)) && Number.isSafeInteger(Number(x));
  function gcd(a, b) { while (b) { const c = a % b; a = b; b = c; } return a; }
  function config(model) {
    const stored = model?.parallelTempo;
    const note = notes.find(item => item[0] === stored?.unit);
    if (!note) return null;
    let num, den;
    if (note[0] === 'inverseFourThree') {
      num = 3; den = 4;
    } else if (note[0] === 'custom') {
      if (!positive(stored.numerator) || !positive(stored.denominator)) return null;
      num = Number(stored.numerator); den = Number(stored.denominator);
    } else {
      num = note[3]; den = note[2] * Number(model.denominator);
    }
    if (!positive(num) || !positive(den)) return null;
    const common = gcd(num, den);
    num /= common; den /= common;
    if ((num === 2 && den === 1) || (num === 1 && den === 2)) return null;
    const bpm = Number(model.tempo) * num / den;
    if (!Number.isFinite(bpm) || bpm <= 0) return null;
    return { numerator: num, denominator: den, bpm, mode: stored.mode === 'cycle' ? 'cycle' : 'free' };
  }
  function repetitions(m) {
    const raw = String(m.repeatCount ?? '1');
    return /^[0-9]+$/.test(raw) && /[1-9]/.test(raw) ? BigInt(raw) : 1n;
  }
  const suggested = ratio => ratio.denominator;
  const isComplete = (ratio, count) =>
    (BigInt(count) * BigInt(ratio.numerator)) % BigInt(ratio.denominator) === 0n;
  function button(m, index, disabled, rerender) {
    const node = document.createElement('button');
    node.type = 'button'; node.className = 'sequence-parallel-button';
    node.innerHTML = '<svg viewBox="0 0 42 24" aria-hidden="true"><path d="M5 19h8V6h3v13h8m3-3h7m-3-3 3 3-3 3" stroke="#111" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><text x="20" y="10" font-size="10" font-weight="900" fill="#111">3</text></svg>';
    node.disabled = disabled;
    node.classList.toggle('active', !!config(m));
    node.setAttribute('aria-label', 'Tempo parallèle du bloc ' + (index + 1));
    node.setAttribute('aria-pressed', String(!!config(m)));
    node.title = config(m) ? 'Tempo parallèle actif' : 'Configurer Tempo parallèle';
    node.addEventListener('click', e => { e.stopPropagation(); if (!disabled) open(m, index, rerender); });
    return node;
  }
  function open(m, index, rerender) {
    document.querySelector('.sequence-parallel-dialog')?.close();
    const dialog = document.createElement('dialog');
    dialog.className = 'sequence-parallel-dialog';
    dialog.setAttribute('aria-label', 'Tempo parallèle du bloc ' + (index + 1));
    const heading = document.createElement('h2'); heading.textContent = 'Tempo parallèle';
    const description = document.createElement('p');
    description.textContent = 'Les blocs se succèdent, jamais en simultané. La durée est celle du tempo de référence ; la pulsation parallèle peut être coupée au terme du bloc.';
    const label = (text, child) => {
      const l = document.createElement('label'); l.textContent = text; l.append(child); return l;
    };
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Valeur rythmique de la pulsation parallèle');
    for (const item of notes) {
      const option = document.createElement('option');
      option.value = item[0]; option.textContent = item[1]; select.append(option);
    }
    select.value = notes.some(x => x[0] === m.parallelTempo?.unit) ? m.parallelTempo.unit : 'dottedEighth';
    const ratioRow = document.createElement('div'); ratioRow.className = 'sequence-parallel-ratio';
    const num = document.createElement('input'), den = document.createElement('input');
    for (const input of [num, den]) {
      input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'off'; input.spellcheck = false;
    }
    num.setAttribute('aria-label', 'Premier nombre du rapport libre');
    den.setAttribute('aria-label', 'Second nombre du rapport libre');
    num.value = String(m.parallelTempo?.numerator ?? 3);
    den.value = String(m.parallelTempo?.denominator ?? 2);
    ratioRow.append(label('Rapport, premier nombre', num), label('Second nombre', den));
    const mode = document.createElement('select');
    mode.setAttribute('aria-label', 'Mode de durée parallèle');
    for (const [value, title] of [['free','Durée libre'],['cycle','Cycle complet suggéré']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = title; mode.append(option);
    }
    mode.value = m.parallelTempo?.mode === 'cycle' ? 'cycle' : 'free';
    const count = document.createElement('input');
    count.type = 'text'; count.inputMode = 'numeric'; count.autocomplete = 'off'; count.spellcheck = false;
    count.setAttribute('aria-label', 'Nombre de mesures de référence');
    count.value = String(repetitions(m));
    const suggestion = document.createElement('p'), output = document.createElement('p');
    suggestion.className = 'sequence-parallel-suggestion';
    output.className = 'sequence-parallel-result'; output.setAttribute('role', 'status');
    const animation = document.createElement('div'); animation.className = 'sequence-parallel-animation';
    animation.setAttribute('aria-label', 'Aide animée comparant les espacements de pulsation, sans lecture simultanée');
    animation.innerHTML = '<div><span>Référence</span><i data-reference></i></div><div><span>Parallèle</span><i data-parallel></i></div><small>Animation comparative : les deux blocs ne jouent jamais ensemble.</small>';
    const actions = document.createElement('div'); actions.className = 'sequence-parallel-actions';
    const cancel = document.createElement('button'), disable = document.createElement('button'), apply = document.createElement('button');
    cancel.type = disable.type = apply.type = 'button';
    cancel.textContent = 'Annuler'; disable.textContent = 'Désactiver'; apply.textContent = 'Appliquer';
    apply.className = 'sequence-parallel-apply'; actions.append(cancel, disable, apply);
    dialog.append(heading, description, label('Valeur de pulsation', select), ratioRow,
      label('Mode', mode), label('Durée en mesures du tempo de référence', count),
      suggestion, output, animation, actions);
    document.body.append(dialog);
    let customDuration = mode.value === 'cycle' && !!m.parallelTempo;
    const draft = () => ({ ...m, parallelTempo: { unit: select.value, numerator: num.value, denominator: den.value, mode: mode.value } });
    function refresh(autoSuggest = false) {
      ratioRow.hidden = select.value !== 'custom';
      const ratio = config(draft());
      if (autoSuggest && mode.value === 'cycle') customDuration = false;
      if (ratio && mode.value === 'cycle' && !customDuration) count.value = String(suggested(ratio));
      const validCount = /^[0-9]+$/.test(count.value.trim()) && /[1-9]/.test(count.value.trim());
      const n = validCount ? BigInt(count.value.trim()) : 0n;
      const validBpm = ratio && ratio.bpm >= 2 && ratio.bpm <= 999;
      apply.disabled = !validCount || !validBpm;
      suggestion.textContent = ratio ? 'Cycle complet suggéré : ' + suggested(ratio) + ' mesure(s) de référence ; valeur modifiable.' : '';
      const format = n => n.toLocaleString('fr-BE', { maximumFractionDigits: 3 });
      if (!ratio) output.textContent = 'Valeur invalide ou rapport simple 2:1 / 1:2 exclu.';
      else if (!validBpm) output.textContent = 'Tempo calculé hors plage du métronome (2 à 999 BPM).';
      else if (!validCount) output.textContent = 'Indique un nombre entier de mesures strictement positif.';
      else {
        const scaled = n * BigInt(ratio.numerator), whole = scaled / BigInt(ratio.denominator);
        const remain = scaled % BigInt(ratio.denominator);
        const cycles = String(whole) + (remain ? ' + ' + String(remain) + '/' + ratio.denominator : '');
        output.textContent = format(Number(m.tempo)) + ' BPM → ' + format(ratio.bpm) + ' BPM (' +
          ratio.numerator + ':' + ratio.denominator + '). ' + String(n) +
          ' mesure(s) de référence = ' + cycles + ' mesure(s) parallèles. ' +
          (isComplete(ratio, n) ? 'Cycle complet.' : 'Coupure du cycle en fin de bloc.');
      }
      animation.querySelector('[data-reference]').style.setProperty('animation-duration', (60 / Number(m.tempo)) + 's');
      animation.querySelector('[data-parallel]').style.setProperty('animation-duration', ratio ? (60 / ratio.bpm) + 's' : '1s');
    }
    select.addEventListener('change', () => refresh(true));
    num.addEventListener('input', () => refresh(true)); den.addEventListener('input', () => refresh(true));
    mode.addEventListener('change', () => refresh(mode.value === 'cycle'));
    count.addEventListener('input', () => { customDuration = true; refresh(); });
    cancel.addEventListener('click', () => dialog.close());
    disable.addEventListener('click', () => { delete m.parallelTempo; dialog.close(); rerender(); });
    apply.addEventListener('click', () => {
      const ratio = config(draft()), raw = count.value.trim();
      if (!ratio || ratio.bpm < 2 || ratio.bpm > 999 || !/^[0-9]+$/.test(raw) || !/[1-9]/.test(raw)) return;
      m.parallelTempo = { unit: select.value, mode: mode.value };
      if (select.value === 'custom') {
        m.parallelTempo.numerator = String(ratio.numerator);
        m.parallelTempo.denominator = String(ratio.denominator);
      }
      m.repeatCount = String(BigInt(raw)); dialog.close(); rerender();
    });
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.showModal(); refresh(); select.focus();
  }
  window.RENAX_SEQUENCE_PARALLEL = Object.freeze({ config, repetitions, suggested, isComplete, button, open });
})();
