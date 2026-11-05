'use strict';
// Visual baseline: restore ONLY the approved Tempo parallèle toolbar button.
// Everything else retains pixel-perfect and computed-style comparison to main.
// The independent sequence-parallel browser test checks the real control's geometry.
module.exports = async function applySequenceParallelReference(page) {
  await page.addStyleTag({
    content:
      '#measureList .sequence-parallel-button{width:36px;height:32px;min-width:36px;flex:none;display:grid;place-items:center;padding:3px;border:1px solid var(--border);border-radius:7px;background:var(--orange);cursor:pointer;}' +
      '#measureList .sequence-parallel-button svg{width:30px;height:22px;display:block;}' +
      '#measureList .sequence-parallel-button.active{outline:2px solid var(--cyan);outline-offset:1px;}' +
      '#measureList .sequence-parallel-button:focus-visible{outline:2px solid var(--cyan);outline-offset:3px;}' +
      '#measureList .sequence-parallel-button:disabled{opacity:.55;cursor:not-allowed;}' +
      '@media(max-width:1100px){#measureList .sequence-parallel-button{width:44px;height:44px;min-width:44px;}}',
  });
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#measureList .measure-card')];
    if (!cards.length) throw Error('Missing reference sequencer cards');
    const icon = '<svg viewBox="0 0 42 24" aria-hidden="true"><path d="M5 19h8V6h3v13h8m3-3h7m-3-3 3 3-3 3" stroke="#111" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><text x="20" y="10" font-size="10" font-weight="900" fill="#111">3</text></svg>';
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
  });
};
