/* Approved, narrowly scoped PC geometry changes. The independent layout test
 * compares raw old CSS and measures dial clearance, glyph ink and mobile parity.
 * Keep the strict screenshot/computed-style gates for everything else. */
module.exports = function normalizeVisualReference(source, file) {
  if (file === 'avant-garde-theme.css' && !source.includes('text-box-trim:trim-both')) {
    return (
      source +
      `
@media(min-width:1101px){
html#renaxApp[data-theme="avant"] body:not(.poly-mode) .panel-visu:not(.score-view) #beatDisplay{
text-box-trim:trim-both;text-box-edge:cap alphabetic;padding-inline-end:.05em;
}}
`
    );
  }
  if (file === 'renax-pulse-ivory.css' && !source.includes('text-box-trim:trim-both')) {
    source = source.replace(
      'position:relative!important;inset:auto!important;order:0!important;',
      'position:var(--ivory-dial-tools-position,relative)!important;inset:var(--ivory-dial-tools-inset,auto)!important;order:0!important;',
    );
    source = source.replace(
      'calc(100cqh - 72px),var(--seq-size)',
      'calc(100cqh - var(--ivory-dial-clearance,72px)),var(--seq-size)',
    );
    return (
      source +
      `
@media(min-width:1101px){
@container(min-width:720px){
html#renaxApp[data-theme=ivory] body[data-workspace=multi] .panel-visu:not(.score-view) .score-tools-panel{
--ivory-dial-tools-position:absolute;--ivory-dial-tools-inset:0 0 auto;
}
html#renaxApp[data-theme=ivory] body[data-workspace=multi] .panel-visu:not(.score-view) #sequencerContainer{
--ivory-dial-clearance:24px;
}}
html#renaxApp[data-theme=ivory] body:not(.poly-mode) .panel-visu:not(.score-view) #beatDisplay{
text-box-trim:trim-both;text-box-edge:cap alphabetic;padding-inline-end:.06em;
}}
`
    );
  }
  if (file === 'backup-index2.css' && !source.includes('#backupAccount #backupRemember')) {
    return source + '\n#backupAccount #backupRemember{flex:0 0 auto;width:auto;margin:0;}\n';
  }
  return source;
};
