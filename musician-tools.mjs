import { createTuner } from './tuner-ui.mjs';
const root = document.documentElement;
const tuner = document.getElementById('tunerRoot');
const switchLink = document.getElementById('toolSwitchLink');
const switchIcon = switchLink.querySelector('svg path');
const switchIcons = {
  tuner: switchIcon.getAttribute('d'),
  metronome: document
    .querySelector('#workspaceNav [data-workspace="metronome"] svg path')
    .getAttribute('d'),
};
const metronomeNodes = [
  ...document.querySelectorAll(
    'body > #workspaceNav,body > #workspaceMobileViews,body > #mobileTabs,body > .main-grid,body > footer',
  ),
];
const heading = document.querySelector('.header-center h2'),
  mobileBrand = document.querySelector('.brand-mobile');
const originalHeading = heading.innerHTML,
  originalBrand = mobileBrand.innerHTML;
const originalTitle = document.title;
const controller = createTuner(tuner);
let current = root.dataset.tool || 'metronome';
function url(tool) {
  const result = new URL(location.href);
  result.searchParams.set('tool', tool);
  return result.pathname + result.search + result.hash;
}
function show(tool, { notify = true } = {}) {
  if (!['metronome', 'tuner'].includes(tool)) tool = 'metronome';
  const changed = tool !== current;
  if (changed) {
    window.RENAX_NUMBOX?.closeAll();
    controller.closeSettings();
    if (current === 'metronome') {
      stopMetronome();
      endTraining();
    }
    controller.stop();
  }
  current = tool;
  root.dataset.tool = tool;
  // History restoration may revisit the same tool; do not reset its active palette.
  if (changed) window.RENAX_APPEARANCE_SYNC?.();
  document.title = tool === 'metronome' ? originalTitle : 'RENAX DRUMS — Accordeur';
  tuner.hidden = tool !== 'tuner';
  for (const node of metronomeNodes) node.inert = tool !== 'metronome';
  const switchDestination = tool === 'tuner' ? 'metronome' : 'tuner';
  switchLink.dataset.toolLink = switchDestination;
  switchLink.querySelector('span').textContent =
    switchDestination === 'metronome' ? 'Métronome' : 'Accordeur';
  switchIcon.setAttribute('d', switchIcons[switchDestination]);
  for (const link of document.querySelectorAll('[data-tool-link]'))
    link.href = url(link.dataset.toolLink);
  heading.innerHTML =
    tool === 'metronome' ? originalHeading : 'ACCOR<span class="title-orange">DEUR</span>';
  mobileBrand.innerHTML =
    tool === 'metronome' ? originalBrand : 'Accor<span class="title-orange">deur</span>';
  window.dispatchEvent(new Event('resize'));
  if (changed && notify) {
    window.dispatchEvent(new Event('renax-tool-changed'));
    (tool === 'tuner'
      ? document.getElementById('tunerTitle')
      : document.getElementById('workspaceNav').querySelector('[aria-selected=true]')
    )?.focus({ preventScroll: true });
  }
}
document.getElementById('tunerTitle').tabIndex = -1;
document.addEventListener('click', (event) => {
  const link = event.target.closest('[data-tool-link]');
  if (
    !link ||
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  show(link.dataset.toolLink);
});
// Keep metronome shortcuts inactive while another tool is visible. Native buttons
// retain their keyboard activation; editable fields retain normal typing.
window.addEventListener(
  'keydown',
  (event) => {
    if (
      current !== 'metronome' &&
      ['Space', 'KeyT', 'Numpad0'].includes(event.code) &&
      !event.target.closest('input,select,textarea,[contenteditable=true]')
    )
      event.stopImmediatePropagation();
  },
  true,
);
window.RENAX_TOOLS = {
  show,
  url,
  get current() {
    return current;
  },
};
show(current, { notify: false });
