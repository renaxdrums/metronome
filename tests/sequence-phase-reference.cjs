'use strict';
// Only the approved phase button is normalized on the old visual reference.
module.exports = async function applySequencePhaseReference(p) {
  await p.addStyleTag({
                  content:
                    '#measureList .sequence-phase-button{width:36px;height:32px;min-width:36px;flex:none;display:grid;place-items:center;padding:4px;border:1px solid var(--border);border-radius:7px;background:var(--panel);color:var(--orange);cursor:pointer;}' +
                    '#measureList .sequence-phase-button svg{display:block;width:28px;height:18px;}' +
                    '#measureList .sequence-phase-button.active{border-color:var(--orange);background:color-mix(in srgb,var(--orange) 16%,var(--panel));}' +
                    '#measureList .sequence-phase-button:focus-visible{outline:2px solid var(--cyan);outline-offset:2px;}' +
                    '#measureList .sequence-phase-button:disabled{opacity:.55;cursor:not-allowed;}' +
                    '@media(max-width:1100px){#measureList .sequence-phase-button{width:44px;height:44px;min-width:44px;}}',
                });
                await p.evaluate(() => {
                  const icon = '<svg aria-hidden="true" viewBox="0 0 38 20" fill="none"><path d="M4 3v14" stroke="currentColor" stroke-dasharray="2 2" stroke-width="2"/><path d="M11 10h11m-4-4 4 4-4 4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M30 3v14" stroke="currentColor" stroke-width="3"/></svg>';
                  const cards = [...document.querySelectorAll('#measureList .measure-card')];
                  if (!cards.length) throw Error('Missing reference sequencer cards');
                  cards.forEach((card,index) => {
                    const tempo = card.querySelector('.measure-tempo-row:not(.measure-repeat-row)');
                    if (!tempo) throw Error('Missing reference phase tempo row');
                    // The baseline may already contain the phase control; never duplicate it.
                    if (card.querySelector('.sequence-phase-button')) return;
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'sequence-phase-button';
                    button.innerHTML = icon;
                    button.setAttribute('aria-pressed','false');
                    button.setAttribute('aria-label','Déphasage du clic, mesure '+(index+1));
                    button.title = 'Configurer le déphasage vers la droite';
                    tempo.append(button);
                  });
                });
};
