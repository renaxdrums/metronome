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
| `accessibility.css` | `html#renaxApp[data-theme=light] .seq-count-row>label` | `color` | `appearance-theme.css:html#renaxApp[data-theme=light] body .training-section :is(.row-label,.training-row>span,.training-curve-row),
html#renaxApp[data-theme=light] body :is(.measure-tempo-label,.measure-tempo-unit,.silent-head-label,.seq-count-row>label)` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=ivory] body #workspaceNav button` | `color` | `ivory-theme.css:html#renaxApp[data-theme=ivory] #workspaceNav button` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=ivory] body #tapBtn` | `color` | `console-theme.css:.tap-tempo-btn` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=ivory] body :is(#bpmDisplay>span,.measure-sig,.measure-tempo-label,.measure-tempo-unit,.silent-head-label,.seq-count-row>label)` | `color` | `ivory-theme.css:html#renaxApp[data-theme=ivory] .silent-settings.disabled :is(label,.numbox-button)` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=ivory] body .silent-settings.disabled label` | `color` | `ivory-theme.css:html#renaxApp[data-theme=ivory] .silent-settings.disabled :is(label,.numbox-button)` (`color`) | toutes |
| `accessibility.css` | `html#renaxApp[data-theme=light] body .silent-settings.disabled label` | `color` | `appearance-theme.css:html#renaxApp[data-theme=light] body .training-section :is(.row-label,.training-row>span,.training-curve-row),
html#renaxApp[data-theme=light] body :is(.measure-tempo-label,.measure-tempo-unit,.silent-head-label,.seq-count-row>label)` (`color`) | toutes |
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
| `navigation-index.css` | `#songsRoot .song-back` | `min-height` | `console-theme.css:#songsRoot #profilePane .btn` (`min-height`) | @media(max-width:1100px) |

## Comparaisons contrôlées

Les sondes repartent des quatre petites feuilles de la référence, indépendamment des priorités conservées dans la livraison. Les grandes feuilles restent inchangées ; les couches des sondes sont injectées uniquement par le test après navigation.

| Variante contrôlée | Captures | Écarts stricts (canal > 0) | Écarts de canal > 2 |
| --- | ---: | ---: | ---: |
| Retrait des 82 priorités, sans couche | 54 | 31 | 18 |
| Couches seules, 82 priorités conservées | 54 | 46 | 37 |

La première sonde reproduit les 16 cas historiques et deux cas supplémentaires (Multipiste et Track en clair/bureau). Les couches sont donc aussi une cause indépendante : elles sont retirées de cette phase, sans attribution exclusive des écarts au retrait des priorités. Les différences de faible amplitude restent des échecs dans le contrôle strict de la livraison ; la colonne > 2 sert seulement à distinguer les régressions nettes des petites variations de rasterisation.

Dernier passage livré : 45/54 captures strictement identiques ; 9/54 diffèrent de 1 à 2/255 maximum, aucun écart supérieur à 2. La comparaison de la référence à elle-même reproduit un écart de 1/255, puis 2/255 après trois captures préalables. Le seuil strict reste à zéro et la matrice est donc en échec. PCM : 25 banques strictement identiques aux deux fréquences. Voir `PHASE5-VALIDATION.md` ; la phase reste non validée.
