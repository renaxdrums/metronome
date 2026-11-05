'use strict';
// Only the two approved block-action icons are normalized against historical
// screenshots. Other UI stays under strict pixel/computed-style comparison.
// The independent sequencer browser test checks geometry, states and themes.
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function applySequenceParallelReference(page) {
  const css = fs.readFileSync(path.join(__dirname, '..', 'sequence-parallel.css'), 'utf8');
  const controlsOnly = css.slice(0, css.indexOf('.sequence-parallel-dialog{'));
  if (!controlsOnly.includes('#measureList :is(.sequence-phase-button,.sequence-parallel-button)'))
    throw Error('Missing scoped icon reference rules');
  await page.addStyleTag({ content: controlsOnly });
  await page.evaluate(icon => {
    const cards = [...document.querySelectorAll('#measureList .measure-card')];
    if (!cards.length) throw Error('Missing reference sequencer cards');
    cards.forEach((card, index) => {
      const row = card.querySelector('.measure-tempo-row:not(.measure-repeat-row)');
      const phase = row?.querySelector(':scope > .sequence-phase-button');
      if (!phase || row.querySelector('.sequence-parallel-button'))
        throw Error('Unexpected historical Tempo parallèle reference markup');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sequence-parallel-button';
      button.innerHTML = icon;
      button.setAttribute('aria-label', '3 · Tempo parallèle du bloc ' + (index + 1));
      button.setAttribute('aria-pressed', 'false');
      button.title = 'Configurer Tempo parallèle';
      phase.after(button);
    });
  }, '<svg viewBox="0 0 38 20" aria-hidden="true" fill="none"><path d="M6 3v14M32 3v14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><text x="19" y="14.5" font-size="14" font-weight="700" text-anchor="middle" fill="currentColor">3</text></svg>');
};
