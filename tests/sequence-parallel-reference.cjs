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
  await page.evaluate(({ phaseIcon, parallelIcon }) => {
    const cards = [...document.querySelectorAll('#measureList .measure-card')];
    if (!cards.length) throw Error('Missing reference sequencer cards');
    cards.forEach((card, index) => {
      const row = card.querySelector('.measure-tempo-row:not(.measure-repeat-row)');
      const phase = row?.querySelector(':scope > .sequence-phase-button');
      if (!phase) throw Error('Missing historical Déphasage button');
      phase.innerHTML = phaseIcon;
      // PR #74 already introduced the parallel action on main. Normalize only
      // its approved pictogram and styling; do not duplicate or hide controls.
      const existing = row.querySelector('.sequence-parallel-button');
      if (existing) {
        existing.innerHTML = parallelIcon;
        existing.setAttribute('aria-label', '3 · Tempo parallèle du bloc ' + (index + 1));
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sequence-parallel-button';
      button.innerHTML = parallelIcon;
      button.setAttribute('aria-label', '3 · Tempo parallèle du bloc ' + (index + 1));
      button.setAttribute('aria-pressed', 'false');
      button.title = 'Configurer Tempo parallèle';
      phase.after(button);
    });
  }, { phaseIcon: '<svg aria-hidden="true" viewBox="0 0 38 20" fill="none"><path d="M8 3v10M17 7v10M23 10h10m-4-4 4 4-4 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>', parallelIcon: '<svg viewBox="0 0 38 20" aria-hidden="true" fill="none"><path d="M7 3v14M31 3v14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><text x="19" y="14" font-size="13" font-weight="800" text-anchor="middle" fill="currentColor">3</text></svg>' });
};
