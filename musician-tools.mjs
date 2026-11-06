import { createTuner } from './tuner-ui.mjs';
const root = document.documentElement;
const home = document.getElementById('toolHome'),
  tuner = document.getElementById('tunerRoot');
const homeLink = document.getElementById('toolHomeLink'),
  switchLink = document.getElementById('toolSwitchLink');
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
let current = root.dataset.tool || 'home';
function url(tool) {
  const result = new URL(location.href);
  result.searchParams.set('tool', tool);
  return result.pathname + result.search + result.hash;
}
function show(tool, { notify = true } = {}) {
  if (!['home', 'metronome', 'tuner'].includes(tool)) tool = 'home';
  const changed = tool !== current;
  if (changed) {
    window.RENAX_NUMBOX?.closeAll();
    if (current === 'metronome') {
      stopMetronome();
      endTraining();
    }
    controller.stop();
  }
  current = tool;
  root.dataset.tool = tool;
  document.title =
    tool === 'metronome'
      ? originalTitle
      : tool === 'tuner'
        ? 'RENAX DRUMS — Accordeur'
        : 'RENAX DRUMS — Outils pour musiciens';
  home.hidden = tool !== 'home';
  tuner.hidden = tool !== 'tuner';
  for (const node of metronomeNodes) node.inert = tool !== 'metronome';
  homeLink.hidden = tool === 'home';
  switchLink.hidden = tool === 'home';
  const switchDestination = tool === 'tuner' ? 'metronome' : 'tuner';
  switchLink.dataset.toolLink = switchDestination;
  switchLink.querySelector('span').textContent =
    switchDestination === 'metronome' ? 'Métronome' : 'Accordeur';
  switchIcon.setAttribute('d', switchIcons[switchDestination]);
  for (const link of document.querySelectorAll('[data-tool-link]'))
    link.href = url(link.dataset.toolLink);
  heading.innerHTML =
    tool === 'metronome' ? originalHeading : tool === 'tuner' ? 'ACCORDEUR' : 'RENAX';
  mobileBrand.innerHTML =
    tool === 'metronome' ? originalBrand : tool === 'tuner' ? 'Accordeur' : 'RENAX';
  if (tool === 'metronome') window.dispatchEvent(new Event('resize'));
  if (changed && notify) {
    window.dispatchEvent(new Event('renax-tool-changed'));
    (tool === 'home'
      ? home
      : tool === 'tuner'
        ? document.getElementById('tunerTitle')
        : document.getElementById('workspaceNav').querySelector('[aria-selected=true]')
    )?.focus({ preventScroll: true });
  }
}
for (const title of [
  home,
  document.getElementById('tunerTitle'),
])
  title.tabIndex = -1;
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
