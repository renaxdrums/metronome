# Exceptions CSS conservées — phase 5

Référence : phase 2 (`396287e3a921891b27e608f2e5f363091b5fe1c7`). Les quatre grandes feuilles de thème restent inchangées. Chaque exception possède un commentaire contigu et une entrée contrôlée par `tools/check-important-exceptions.cjs`.

| Feuille | Avant | Retirés | Conservés |
| --- | ---: | ---: | ---: |
| `accessibility.css` | 24 | 8 | 16 |
| `app-base.css` | 25 | 22 | 3 |
| `training-modes.css` | 24 | 10 | 14 |
| `navigation-index.css` | 9 | 6 | 3 |
| **Total** | **82** | **46** | **36** |

Les conflits internes résolus sans priorité sont le masquage des lignes d’entraînement (règle `[hidden]` ciblée après leurs règles de disposition) et l’ancienne largeur 96 px du retour, devenue redondante avec le bouton compact. Les dimensions injectées des sélecteurs d’entraînement utilisent des variables CSS de repli ; les règles de composant peuvent ainsi les ajuster sans priorité contre le style inline. Les variables de couleur par thème restent hors couche.

## Liste de migration des grandes feuilles

| Fichier | Sélecteur | Propriété | Règle concurrente | Condition |
| --- | --- | --- | --- | --- |
| `accessibility.css` | `html#renaxApp body :is(button,a,input,select,textarea,summary,[tabindex]):focus-visible` | `outline` | `console-theme.css:#playBtn:focus-visible,#trainBtn:focus-visible` (`outline`) | toutes |
| `accessibility.css` | `html#renaxApp body :is(button,a,input,select,textarea,summary,[tabindex]):focus-visible` | `outline-offset` | `renax-pulse-ivory.css:html#renaxApp[data-theme=ivory] body :is(button,summary,.numbox-trigger,.numbox-option):focus-visible` (`outline-offset`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=light] body :is(#sequenceAddMeasure,#trainBtn)` | `color` | `console-theme.css:#playBtn,#trainBtn` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=light] .seq-count-row>label` | `color` | `appearance-theme.css:html#renaxApp[data-theme=light] body .training-section :is(.row-label,.training-row>span,.training-curve-row), html#renaxApp[data-theme=light] body :is(.measure-tempo-label,.measure-tempo-unit,.silent-head-label,.seq-count-row>label)` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=ivory] body #workspaceNav button` | `color` | `ivory-theme.css:html#renaxApp[data-theme=ivory] #workspaceNav button` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=ivory] body #tapBtn` | `color` | `console-theme.css:.tap-tempo-btn` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=ivory] body :is(#bpmDisplay>span,.measure-sig,.measure-tempo-label,.measure-tempo-unit,.silent-head-label,.seq-count-row>label)` | `color` | `ivory-theme.css:html#renaxApp[data-theme=ivory] .silent-settings.disabled :is(label,.numbox-button)` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=ivory] body .silent-settings.disabled label` | `color` | `ivory-theme.css:html#renaxApp[data-theme=ivory] .silent-settings.disabled :is(label,.numbox-button)` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=light] body .silent-settings.disabled label` | `color` | `appearance-theme.css:html#renaxApp[data-theme=light] body .training-section :is(.row-label,.training-row>span,.training-curve-row), html#renaxApp[data-theme=light] body :is(.measure-tempo-label,.measure-tempo-unit,.silent-head-label,.seq-count-row>label)` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=ivory] body .song-tempo-value` | `color` | `console-theme.css:#songsRoot .song-tempo-value` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=ivory] body :is(.track-create,.track-add-section)` | `color` | `console-theme.css:#sequenceAddMeasure,#multiControls>.multi-add,#songsRoot .playlist-create,#songsRoot .track-create,#songsRoot .track-add-section` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=ivory] body #mp3ExportDialog :is(.mp3-credit,.mp3-credit a)` | `color` | `ivory-theme.css:html#renaxApp[data-theme=ivory] .mp3-credit` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=light] body :is(.track-create,.track-add-section,#mp3ExportSave)` | `color` | `console-theme.css:#sequenceAddMeasure,#multiControls>.multi-add,#songsRoot .playlist-create,#songsRoot .track-create,#songsRoot .track-add-section` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=light] body #trainTimer` | `color` | `console-theme.css:#trainTimer` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=light] body #index2SettingsPanel button[data-appearance][aria-pressed=true]` | `color` | `console-theme.css:#index2SettingsPanel button,#directAccountDialog .btn` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=light] body #mp3ExportDialog #mp3ExportSave` | `color` | `appearance-theme.css:html[data-theme=light] body #mp3ExportDialog .mp3-actions #mp3ExportSave,html[data-theme=light] body #mp3ExportDownload:not([hidden])` (`color`) | toutes |
| `app-base.css` | `.measure-tempo-input` | `color` | `appearance-theme.css:html[data-theme=light] :is(input:not([type=range]):not([type=checkbox]),select,textarea,.numbox-button)` (`color`) | toutes |
| `app-base.css` | `html#renaxApp .numbox-custom > .numbox-native` | `opacity` | `appearance-theme.css:html#renaxApp[data-theme=light] body .silent-settings.disabled :is(select,.numbox-button)` (`opacity`) | toutes |
| `app-base.css` | `body.training-tab-open #playBtn,body.training-tab-open #panicBtn` | `display` | `renax-pulse-ivory.css:html#renaxApp[data-theme=ivory] :is(.reset-undo-tools #panicBtn,.reset-undo-tools #undoBtn)` (`display`) | @media (max-width:1100px) |
| `training-modes.css` | `.training-section #trainBtn` | `min-height` | `appearance-theme.css:html#renaxApp[data-theme=light] body #playBtn,html#renaxApp[data-theme=light] body .training-section #trainBtn` (`min-height`) | toutes |
| `training-modes.css` | `.training-section #trainBtn` | `border-radius` | `console-theme.css:#playBtn,#trainBtn` (`border-radius`) | toutes |
| `training-modes.css` | `.training-section #trainBtn` | `border` | `console-theme.css:#playBtn,#trainBtn` (`border`) | toutes |
| `training-modes.css` | `.training-section #trainBtn` | `background` | `console-theme.css:#playBtn,#trainBtn` (`background`) | toutes |
| `training-modes.css` | `.training-section #trainBtn` | `box-shadow` | `console-theme.css:#playBtn,#trainBtn` (`box-shadow`) | toutes |
| `training-modes.css` | `.training-section #trainBtn` | `color` | `console-theme.css:#playBtn,#trainBtn` (`color`) | toutes |
| `training-modes.css` | `.training-section #trainBtn` | `font` | `ivory-theme.css:html#renaxApp[data-theme=ivory] :is(#trainBtn,#trainingVisualBtn)` (`font`) | toutes |
| `training-modes.css` | `.training-section #trainBtn` | `letter-spacing` | `appearance-theme.css:html#renaxApp[data-theme=light] body #playBtn,html#renaxApp[data-theme=light] body .training-section #trainBtn` (`letter-spacing`) | toutes |
| `training-modes.css` | `.training-section #trainBtn` | `text-transform` | `ivory-theme.css:html#renaxApp[data-theme=ivory] :is(#trainBtn,#trainingVisualBtn)` (`text-transform`) | toutes |
| `training-modes.css` | `.training-section #trainBtn:not(:disabled):hover` | `background` | `console-theme.css:#playBtn,#trainBtn` (`background`) | toutes |
| `training-modes.css` | `.training-section #trainBtn:not(:disabled):hover` | `border-color` | `console-theme.css:#playBtn:hover,#trainBtn:hover` (`border-color`) | toutes |
| `training-modes.css` | `.training-section #trainBtn.active` | `background` | `console-theme.css:#playBtn.btn-cyan,#trainBtn.active` (`background`) | toutes |
| `training-modes.css` | `.training-section #trainBtn.active` | `border-color` | `console-theme.css:#playBtn.btn-cyan,#trainBtn.active` (`border-color`) | toutes |
| `training-modes.css` | `.training-section #trainBtn:focus-visible` | `box-shadow` | `console-theme.css:#playBtn,#trainBtn` (`box-shadow`) | toutes |
| `navigation-index.css` | `:is(#songPane,#profilePane,.playlist-heading,#songPane .song-detail-toolbar) > button.song-back` | `width` | `console-theme.css:#songsRoot #profilePane .song-back` (`width`) | toutes |
| `navigation-index.css` | `#songsRoot .song-back` | `min-height` | `console-theme.css:#songsRoot #profilePane .btn` (`min-height`) | toutes |
| `navigation-index.css` | `#songsRoot .song-back` | `min-height` | `console-theme.css:#songsRoot #profilePane .btn` (`min-height`) | @media (max-width:1100px) |

## Comparaisons contrôlées

Les sondes repartent des quatre petites feuilles de la référence, indépendamment des priorités conservées dans la livraison. Les grandes feuilles restent inchangées ; les couches des sondes sont injectées uniquement par le test après navigation.

| Variante contrôlée | Captures | Écarts stricts (canal > 0) | Écarts de canal > 2 |
| --- | ---: | ---: | ---: |
| Retrait des 82 priorités, sans couche | 54 | 31 | 18 |
| Couches seules, 82 priorités conservées | 54 | 46 | 37 |

La première sonde reproduit les 16 cas historiques et deux cas supplémentaires (Multipiste et Track en clair/bureau). Les couches sont donc aussi une cause indépendante : elles sont retirées de cette phase, sans attribution exclusive des écarts au retrait des priorités. Les différences de faible amplitude restent des échecs dans le contrôle strict de la livraison ; la colonne > 2 sert seulement à distinguer les régressions nettes des petites variations de rasterisation.

Dernier passage livré après précision du critère utilisateur : 54/54 captures respectent un maximum absolu de 2/255 sur chaque canal de chaque pixel, sans quota de pixels différent. 50/54 sont strictement identiques ; les quatre autres restent à 1 ou 2/255. La référence contre elle-même présente sept captures non identiques sur 54, avec le même maximum de 2/255 : le bruit n’a donc pas disparu. Le seuil historique 2/255 est conservé, conformément au choix explicite de l’utilisateur.

Les styles calculés des éléments principaux rendus sont strictement identiques sur les 54 combinaisons : 7 551 éléments, zéro différence. Animations et transitions désactivées, canevas animés neutralisés par le masque commun, facteur d’échelle fixé à 1. Les champs natifs transparents et masqués sont exclus ; les déclencheurs visibles sont inclus. PCM : 25 banques strictement identiques aux deux fréquences. Voir `PHASE5-VALIDATION.md` pour la CI et les limites.

## Migration des grandes feuilles — lot 1 (20 octobre 2026)

Référence de ce lot : `361d5fd7450216831203e4651f14db75e3e91db9` (main après PR 14). Le gel des grandes feuilles concernait la phase 5 précédente ; leur migration est maintenant autorisée, par lots. Aucun `@layer` n’est introduit.

Ce premier lot retire uniquement des déclarations importantes antérieures, déjà remplacées par une déclaration importante du **même sélecteur, de la même propriété et dans les mêmes conditions**, plus loin dans le même fichier. Les valeurs gagnantes, les sélecteurs, leur spécificité et l’ordre de chargement sont conservés. Les valeurs gagnantes sont des couleurs, dimensions et propriétés déjà utilisées dans la version de référence ; aucun nouveau mécanisme CSS n’est requis.

| Feuille | Avant | Retirés | Après |
| --- | ---: | ---: | ---: |
| renax-pulse-ivory.css | 580 | 5 | 575 |
| appearance-theme.css | 356 | 1 | 355 |
| ivory-theme.css | 303 | 16 | 287 |
| console-theme.css | 265 | 1 | 264 |
| workspace-layout.css | 127 | 0 | 127 |
| mobile-landscape.css | 60 | 0 | 60 |
| **Six feuilles** | **1 691** | **23** | **1 668** |

Total du projet : 1 849 → 1 826 ; les 110 affectations directes de styles JS ne changent pas. `tools/theme-cascade-lot1.json` conserve les positions et valeurs de référence pour revue. Les numéros de ligne ci-dessous concernent la référence, avant retrait.

| Fichier | Ligne retirée | Sélecteur | Propriété | Valeur retirée | Règle gagnante (ligne de référence) |
| --- | ---: | --- | --- | --- | --- |
| renax-pulse-ivory.css | 201 | `html#renaxApp[data-theme=ivory] .panel-visu:not(.score-view) .score-tools-panel` | margin | `0 0 2px` | 509 : `0` |
| renax-pulse-ivory.css | 200 | `html#renaxApp[data-theme=ivory] .panel-visu:not(.score-view) .score-tools-panel` | flex | `0 0 44px` | 509 : `0 0 44px` |
| renax-pulse-ivory.css | 200 | `html#renaxApp[data-theme=ivory] .panel-visu:not(.score-view) .score-tools-panel` | max-height | `44px` | 508 : `44px` |
| renax-pulse-ivory.css | 200 | `html#renaxApp[data-theme=ivory] .panel-visu:not(.score-view) .score-tools-panel` | height | `44px` | 508 : `44px` |
| renax-pulse-ivory.css | 199 | `html#renaxApp[data-theme=ivory] .panel-visu:not(.score-view) .score-tools-panel` | min-height | `44px` | 508 : `44px` |
| appearance-theme.css | 191 | `html#renaxApp[data-theme=light] body #multiControls` | gap | `10px` | 208 : `10px` |
| ivory-theme.css | 263 | `html#renaxApp[data-theme=ivory] :is(#playBtn.btn-cyan,#trainBtn.active,#trainingVisualBtn.active)` | color | `#13363b` | 274 : `#13363b` |
| ivory-theme.css | 263 | `html#renaxApp[data-theme=ivory] :is(#playBtn.btn-cyan,#trainBtn.active,#trainingVisualBtn.active)` | border-color | `#d9ef62` | 274 : `#70d5df` |
| ivory-theme.css | 263 | `html#renaxApp[data-theme=ivory] :is(#playBtn.btn-cyan,#trainBtn.active,#trainingVisualBtn.active)` | background | `#d9ef62` | 274 : `#70d5df` |
| ivory-theme.css | 256 | `html#renaxApp[data-theme=ivory] #workspaceNav button[aria-selected=true] svg` | stroke | `#596a16` | 268 : `var(--ivory-lime)` |
| ivory-theme.css | 246 | `html#renaxApp[data-theme=ivory] :is(#playBtn.btn-cyan,#trainBtn.active,#trainingVisualBtn.active)` | color | `#13363b` | 274 : `#13363b` |
| ivory-theme.css | 246 | `html#renaxApp[data-theme=ivory] :is(#playBtn.btn-cyan,#trainBtn.active,#trainingVisualBtn.active)` | border-color | `var(--ivory-lime)` | 274 : `#70d5df` |
| ivory-theme.css | 246 | `html#renaxApp[data-theme=ivory] :is(#playBtn.btn-cyan,#trainBtn.active,#trainingVisualBtn.active)` | background | `var(--ivory-lime)` | 274 : `#70d5df` |
| ivory-theme.css | 203 | `html#renaxApp[data-theme=ivory] #workspaceNav button` | padding | `12px` | 249 : `12px 8px` |
| ivory-theme.css | 198 | `html#renaxApp[data-theme=ivory] .training-mode-tabs button[aria-selected=true]` | box-shadow | `inset 0 -3px #d9ef62` | 244 : `inset 0 -3px var(--ivory-lime)` |
| ivory-theme.css | 198 | `html#renaxApp[data-theme=ivory] .training-mode-tabs button[aria-selected=true]` | border-color | `#bfd77a` | 244 : `#b8d477` |
| ivory-theme.css | 130 | `html#renaxApp[data-theme=ivory] #workspaceNav button` | padding | `12px 14px 12px 22px` | 249 : `12px 8px` |
| ivory-theme.css | 76 | `html#renaxApp[data-theme=ivory] :is(#playBtn:hover,#trainBtn:hover,#trainingVisualBtn:hover)` | background | `#8ae1e7` | 262 : `#e5f587` |
| ivory-theme.css | 65 | `html#renaxApp[data-theme=ivory] .poly-ring.outer` | border-color | `#d9ef6280` | 218 : `#e6d8b780` |
| ivory-theme.css | 61 | `html#renaxApp[data-theme=ivory] .step[data-state="3"]` | background | `#d6d9a5` | 188 : `#e6d8b7` |
| ivory-theme.css | 24 | `html#renaxApp[data-theme=ivory] #workspaceNav button[aria-selected=true] svg` | stroke | `var(--ivory-green)` | 265 : `var(--ivory-lime)` |
| ivory-theme.css | 21 | `html#renaxApp[data-theme=ivory] #workspaceNav button svg` | stroke | `var(--ivory-green)` | 264 : `var(--ivory-lime)` |
| console-theme.css | 35 | `.measure-card,.song-section,.song-card,.playlist-choice,.song-block` | border-color | `#30343c` | 159 : `#48525e` |

Validation locale du lot : 54/54 captures à 0/255 contre main, aucun écart de styles calculés ; PCM identique pour les 25 banques à 44,1 et 48 kHz. Une nouvelle passe visuelle après suppression des règles devenues vides confirme 54/54 captures à 0/255. Le test d’extraction confirme ses 36 dispositions et le contrôle négatif du cliquet échoue bien sur une augmentation. Lint, types, formatage, inventaire des 97 tests et budget passent. La CI reste une validation distincte ; une réussite locale ne préjuge pas de son résultat.
