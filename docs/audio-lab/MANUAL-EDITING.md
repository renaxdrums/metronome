# Audio Lab — analyse exploratoire et correction manuelle (11 novembre 2026)

## Décisions validées par l'utilisateur
- Septième onglet « Audio Lab », **après Track**. Panneau central dédié à la waveform et aux outils de temps ; séquenceur circulaire *masqué dans Audio Lab uniquement*, intact dans les autres onglets.
- Éditeur non destructif, priorité à la précision : métrique libre, aucune signature imposée, groupes personnalisés, mesures alternées, anacrouses, mesures interrompues, tempo fluctuant.
- Quatre familles de drapeaux distinctes : premier temps (barline), changement de métrique, tempo, Warp. Ajout, déplacement, suppression (sauf origine obligatoire), verrouillage, correction fine et undo/redo. Le recalage de la grille ne doit **pas** automatiquement transformer le PCM.
- Trois modes de travail utilisant le même état : automatique (hypothèses), assisté (acceptation/correction), manuel sans détection. Les données manuelles ont toujours priorité sur les propositions automatiques.
- Édition tactile mobile et desktop ; conserver identité et thèmes RENAX, sans maquette générique ni slogans. Onglet optionnel de visualisation du métronome à examiner ultérieurement, pas implémenté implicitement.

## Architecture cible
- Domaine 1 « observation audio » : attaques temps source, bande, force, provenance et confiance. Le nouveau fichier analysis/onsets.mjs **propose seulement des attaques** via flux spectral multi-bandes. Pas de détection métrique fiable et pas de BPM certifié.
- Domaine 2 « grille musicale » : des événements métriques à des ticks explicites ; meter-timeline.mjs coupe la mesure précédente au point d'insertion, gère le premier temps décalé et conserve l'original. Un drapeau de métrique au milieu d'une mesure ne doit pas se déplacer silencieusement sur une autre position.
- Domaine 3 « ancrages temporels » : map source seconds <-> musical ticks via tempo-warp-core.mjs, indépendamment des décisions de métrique. Les ancres restent monotones et verrouillables.
- Domaine 4 « moteur audio » : une future chaîne DSP séparée ; aucun time-stretch à hauteur préservée n'est prétendu prêt aujourd'hui.
- Domaine 5 « vue » : timeline en 4 couches (règle musicale / drapeaux métriques et tempo / waveform et Warp / transport et boucles), propriétés repliables, raccourcis clavier et gestes tactiles. Le rendu est différé à l'étape de revue design.

## Exigences à vérifier avant intégration
- Confirmer musicalement les hypothèses métriques sur corpus de percussions, piano, musique rubato, rythmes asymétriques et mélange binaire/ternaire ; ne pas confondre détection d'onsets et détection de signature.
- Dans de longs fichiers, calculer les attaques en Worker avec progression/annulation et budgets CPU/mémoire mesurés. En l'état, detectOnsets est un noyau synchrone pur destiné à un Worker.
- Proposer plusieurs hypothèses et rendre leur incertitude explicite ; ne jamais appliquer d'analyse automatiquement à un projet validé.
- Contrôler les ambiguïtés d'anacrouse, premier temps après silence, silence instrumental, changements non quantifiés, métriques fractionnées, marqueurs aux mêmes ticks, tempo variable et interpolation.
- Préserver les protections AGENTS.md, la CI des tests nouveaux et les fichiers audio historiques. Ajouter l'onglet uniquement lors d'une intégration visuelle testée PC/Android.
- Skills design/REA et véritables sous-agents Codex : uniquement lorsqu'ils sont disponibles et nécessaires ; ne jamais revendiquer leur exécution dans cette étape.

## Spécification d'import WAV confirmée (11 novembre 2026)

- WAV PCM source en 16 ou 24 bits, à 44 100, 48 000 ou **96 000 Hz** (six combinaisons). La valeur 92 000 Hz évoquée précédemment était une erreur et ne figure plus dans les tests de conformité.
- Conserver séparément la fréquence et la profondeur d'origine, car `decodeAudioData` peut rééchantillonner vers la fréquence de l'`AudioContext`.
- Reconnaissance d'en-tête et tests synthétiques ne valent pas validation de décodage réel sur Chromium/Android. Ne pas annoncer l'import complet sans cette vérification.
