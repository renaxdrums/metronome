'use strict';
// Model only the approved range control, voice count and empty-measure visibility
// on the historical page. Never restyle the candidate or relax either comparison.
// The six-point, fader and numbox suites exercise the real controls independently.
module.exports = async function workspaceControlsReference(page, module) {
  await page.evaluate(module => {
    if (!document.querySelector('#tempoRangeExtend')) {
      const button = document.createElement('button');
      button.type = 'button'; button.id = 'tempoRangeExtend';
      button.className = 'tempo-range-extend';
      button.textContent = 'Étendre à 999 BPM';
      button.setAttribute('aria-label', button.textContent);
      button.setAttribute('aria-pressed', 'false');
      document.querySelector('#tempoFader').closest('.tempo-slider-row').after(button);
    }
    // The user approved a linear 2–250 BPM default range, including its thumb.
    const fader = document.querySelector('#tempoFader');
    fader.value = String(Math.round((Number(bpmSlider.value) - 2) / 248 * 10000));
    if (!document.querySelector('#polyVoiceCount')) {
      const label = document.createElement('label');
      label.className = 'poly-voice-count'; label.textContent = 'Voies';
      const select = document.createElement('select'); select.id = 'polyVoiceCount';
      select.setAttribute('aria-label', 'Nombre de voies en polyrythmie');
      for (const value of ['2', '3', '4']) {
        const option = document.createElement('option');
        option.value = option.textContent = value; select.append(option);
      }
      label.append(select); document.querySelector('#polyControls').append(label);
      enhanceNumboxSelect(select);
    }
    const silent = document.querySelector('.silent-section');
    const comments = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    let home;
    while (comments.nextNode())
      if (comments.currentNode.nodeValue === 'silent-controls-home') home = comments.currentNode;
    if (!home || !silent) throw Error('Missing historical empty-measure controls');
    home.after(silent);
    silent.hidden = module !== 'Séquenceur';
  }, module);
  if (!await page.locator('#workspace-approved-reference').count())
    await page.addStyleTag({ content: `
/* Fixed expected rules for the approved additions, not a copy of current CSS. */
body .silent-section[hidden]{display:none}
.tempo-range-extend{align-self:flex-start;min-height:25px;padding:3px 8px;border:1px solid var(--border);border-radius:5px;background:transparent;color:var(--text-muted);font:600 10px/1.2 var(--font);cursor:pointer;white-space:nowrap}
.tempo-range-extend[aria-pressed=true]{border-color:var(--cyan);color:var(--cyan)}
.tempo-range-extend:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
.tempo-range-extend:disabled{opacity:.45;cursor:default}
.poly-voice-count{display:flex;align-items:center;gap:5px;color:var(--text-muted);font-size:10px}
.poly-voice-count .numbox-custom{width:52px}
@media(min-width:1101px){
 .visu-toolbar .workspace-tempo-group{position:relative}
 .visu-toolbar .tempo-range-extend{position:absolute;top:-2px;right:0;min-height:17px;padding:1px 5px;font-size:9px}
 body[data-workspace=polyrhythm] .visu-toolbar .visu-measure-info{position:relative}
 body[data-workspace=polyrhythm] .visu-toolbar .visu-measure-info .measure-label{width:max-content;max-width:calc(100% - 36px)}
 body[data-workspace=polyrhythm] .visu-toolbar .visu-measure-info .poly-controls{height:38px;min-height:38px;flex-wrap:nowrap;row-gap:0}
 body[data-workspace=polyrhythm] .visu-toolbar .visu-measure-info .poly-voice-count{position:absolute;top:-6px;right:0;height:24px;gap:1px;min-width:0;flex:0 0 auto;font-size:0;line-height:1}
 body[data-workspace=polyrhythm] .visu-toolbar .visu-measure-info .poly-voice-count::before{content:"V";font:600 9px/1 var(--font)}
 body[data-workspace=polyrhythm] .visu-toolbar .visu-measure-info .poly-voice-count :is(.numbox-custom,.numbox-button){min-width:26px!important;max-width:26px}
 body[data-workspace=polyrhythm] .visu-toolbar .visu-measure-info .poly-voice-count .numbox-button{height:24px!important;min-height:24px!important;padding:2px;font-size:12px;border-radius:6px}
}
` }).then(style => style.evaluate(e => e.id = 'workspace-approved-reference'));
};
