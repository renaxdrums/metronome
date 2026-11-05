/* Reproduce only the user-approved tool navigation in a historical reference.
 * The current interface is never masked or restyled; all pixels, old musical
 * controls and PCM retain their exact comparison. Tuner-interface-test exercises
 * the real links, all four themes, history and retained models independently.
 */
module.exports = async function toolNavigationReference(page) {
  if (await page.locator('#toolHomeLink').count()) return;
  await page.evaluate(() => {
    const settings = document.getElementById('index2SettingsBtn');
    if (!settings) throw Error('Historical header is missing');
    settings.insertAdjacentHTML(
      'beforebegin',
      '<a class="tool-nav-link" id="toolHomeLink" href="?tool=home" data-tool-link="home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/></svg><span>Accueil</span></a><a class="tool-nav-link" id="toolSwitchLink" href="?tool=tuner" data-tool-link="tuner"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v7a4 4 0 0 0 8 0V3M12 14v7M5 5h3m8 0h3"/></svg><span>Accordeur</span></a>',
    );
  });
  await page.addStyleTag({
    content: `
.tool-nav-link{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;color:var(--text);background:var(--panel);text-decoration:none;font:600 12px var(--font);white-space:nowrap}
.tool-nav-link svg{width:16px;height:16px;fill:none;stroke:var(--orange);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
html#renaxApp[data-theme=avant] .tool-nav-link{background:var(--ag-header);border-color:var(--ag-header-border);color:var(--ag-lime)}
html#renaxApp[data-theme=avant] .tool-nav-link svg{stroke:var(--ag-lime)}
@media(max-width:1100px){.tool-nav-link{min-height:36px;padding:6px;font-size:11px;gap:4px}}
@media(max-width:700px){
 html#renaxApp body>header{flex-wrap:wrap;gap:8px;min-height:88px}
 html#renaxApp body>header .index2-header-actions{min-width:0;flex-wrap:wrap;justify-content:flex-end;gap:5px;flex:0 0 100%;min-height:36px}
 html#renaxApp body>header .tool-nav-link{padding:6px;min-width:0;font-size:11px}
 html#renaxApp body>header .tool-nav-link svg{display:none}
}
`,
  });
};
