# RENAX Audio Lab — architecture et traçabilité, phase A

**Statut : noyau musical non destructif en développement. Pas de produit utilisateur achevé.**
**Base auditée : main, SHA fe253b17770ed050f281a090b4eaf684b044999a (11 novembre 2026).**
**Périmètre : nouveaux fichiers dans audio-lab/, tests dédiés et registre de CI.**

## Frontières existantes auditées

| Fichiers | Contrat observé | Stratégie Audio Lab |
| --- | --- | --- |
| AGENTS.md | Les numbox sont au-dessus des panneaux et les thèmes validés sont intangibles | Aucune modification des thèmes ou numbox |
| ARCHITECTURE.md | Application statique, scripts classiques dans un ordre précis et références PCM | Les transports existants restent intacts |
| index.html, workspace-layout.js | Navigation et état du métronome | Entrée Audio Lab distincte après audit visuel |
| metronome-audio.js, metronome-core.js, metronome-transport.js | Banques, sons, gains et planification audio historique | Futur Click Sync Adapter en lecture seule |
| songs-index2.js, song-export.js | Track et exports MP3 existants | Pipeline Audio Lab distinct |
| local-backup.js, emergency-backup.js | Copies de secours et stockage de la bibliothèque | Stockage Audio Lab versionné, espace IndexedDB séparé |
| service-worker.js, tools/stamp-assets.cjs | Publication atomique et manifeste vérifié par empreinte | Référencer les ressources uniquement lors de l'intégration |
| tests/run.cjs, tests/ci-policy.json | Tests découverts avec classification obligatoire | Classer chaque test Audio Lab |

Audit des pull requests au lancement : aucune ouverte. Revérifier la situation avant fusion.

## Domaines responsables (séparation fonctionnelle, aucun agent Codex autonome invoqué)

| # | Domaine | Frontière proposée | Revue |
| --- | --- | --- | --- |
| 1 | Architecte orchestrateur | docs/audio-lab/ et contrats | Tous |
| 2 | DSP et stretch | audio-lab/dsp/ (à créer) | 5, 9, 10 |
| 3 | Analyse musicale | audio-lab/analysis/ (à créer) | 4, 10 |
| 4 | Mapping Warp | audio-lab/tempo-warp-core.mjs | 2, 3, 5 |
| 5 | Horloge et clic | audio-lab/transport/ (à créer) | 2, 4, 10 |
| 6 | Direction artistique | audio-lab/ui/ (à créer) | 7, 10 |
| 7 | Waveform et tactile | audio-lab/waveform/ (à créer) | 6, 10 |
| 8 | Import, sauvegarde, exports | audio-lab/io/ (à créer) | 9, 10 |
| 9 | Audit licences | Documentation de distribution (à compléter) | 1, 2, 8 |
| 10 | QA et performances | tests/audio-lab-* | Tous |

Les rôles sont les responsabilités attendues. L'environnement connecté ne donne pas accès à des sous-agents Codex actifs ; aucune exécution parallèle n'est revendiquée.

## Contrats techniques

Les types métier sont définis dans audio-lab/contracts.d.ts. L'architecture cible forme la chaîne :

Fichier local → décodeur Worker → extraction multibande + tuiles waveform → hypothèses métriques → confirmation musicale → grille et carte tempo → marqueurs Warp monotones → moteur DSP WASM/AudioWorklet → horloge audio commune → lecture et clic / export hors ligne.

- **Import/Analyse** : PCM segmenté et identité locale, backpressure et limite mémoire diagnostiquée ; aucun téléversement implicite.
- **Analyse/Grille** : événements d'attaque séparés des pulsations ; hypothèses de métriques multiples, confiance et provenance, sans 4/4 forcé.
- **Grille/Warp** : 3840 ticks par noire ; groupements d'accents distincts des subdivisions régulières ; unité BPM explicite, dont noire pointée (3/8).
- **Warp/DSP** : ancrages (position musicale, secondes source) strictement croissants ; pas de réordonnancement ni de perte de contenu ; fichiers source immuables.
- **DSP/Lecture** : futurs blocs WASM et AudioWorklet hors fil graphique ; gestion explicite de la latence et de l'état.
- **Lecture/Clic** : unique référence AudioContext.currentTime. Aucun timer DOM utilisé comme horloge musicale.
- **Stockage** : projet versionné avec référence de source, hypothèses validées, mètres, boucles, marqueurs, commentaires, préférences, et reprise atomique.
- **Export** : rendu déterministe aligné avec la carte musicale ; pipeline distinct de song-export.js.

## Noyau réalisé

audio-lab/tempo-warp-core.mjs contient :
1. Conversion musicale exacte en ticks avec unité de pulsation explicite.
2. Cycles asymétriques alternés (7/8 + 5/8) et 17/16 avec groupements configurables.
3. Carte Warp strictement monotone, continue, inversible par interpolation affine segmentaire.
4. Tempo cible régulier sans confondre la pulsation avec la noire.
5. Insertion, déplacement, suppression de marqueurs intérieurs ; verrouillage et protection des extrémités.
6. Valeurs immuables ; ni écriture ni modification des données audio sources.

audio-lab/waveform/peaks.mjs ajoute un accumulateur multi-canal de crêtes min/max à plusieurs résolutions, alimentable par blocs, sans modification des échantillons originaux. Il doit être exécuté dans un Worker au stade de l'intégration navigateur.\n\n**Limite essentielle :** il s'agit d'une carte mathématique, pas d'un algorithme de stretch. Le moteur PCM, les transitoires, le transport, l'analyse automatique, la waveform et l'interface ne sont pas encore implémentés. Il faut benchmarker et tester la qualité avant toute promesse d'écoute.

## Banc DSP et licences : présélection, aucune intégration

| Moteur | Licence constatée | Statut |
| --- | --- | --- |
| Signalsmith Stretch | MIT ; C++ et diffusion Web Audio WASM/AudioWorklet officielle | Candidat privilégié **pour mesure**, non intégré |
| Rubber Band | GPL-2.0-or-later ou licence commerciale | Distribution propriétaire bloquée sans licence adaptée |
| SoundTouch | LGPL-2.1 ; exigences de notice et de redistribution à auditer | Candidat secondaire, non intégré |

Sources primaires :
- https://github.com/Signalsmith-Audio/signalsmith-stretch
- https://github.com/Signalsmith-Audio/signalsmith-stretch/blob/main/LICENSE.txt
- https://breakfastquay.com/rubberband/license.html
- https://surina.net/soundtouch/license.html

À vérifier avant intégration : version épinglée, licences transitives, poids, distribution WASM, CPU/mémoire sur Android, conformité hors ligne, transitoires cymbales/piano/percussions, voix, boucles, 44,1/48 kHz, écoute ABX et ralentissements 120→110/80/60/40 BPM. REA et skills UI/UX demandés non disponibles dans cet environnement et non utilisés. PolyNome : comparaison comportementale à conduire sur installation licite, sans supposer des limitations.

## Matrice de traçabilité

| Exigence | Contrat et responsable | Test demandé | État |
| --- | --- | --- | --- |
| A-01 Indépendance du module | Nouveaux fichiers isolés, 1 | Diff et non-régression | Noyau présent |
| B-01 Import MP3 local | io, 8 | Import PC + Android réel | Non réalisé |
| B-02 Waveform / zoom / loupe | waveform, 7 | audio-lab-peaks-test.mjs + rendu tactile futur | Pyramide de crêtes seule, sans éditeur |
| B-03 Horloge commune | transport, 5 | Seek/loop/dérive | Non réalisé |
| C-01 Attaques multibandes et BPM implicite | analysis, 3 | Corpus annoté | Non réalisé |
| C-02 Hypothèses concurrentes | AnalysisResult, 3 | Cas de faible confiance | Contrat défini |
| C-03 7/8 + 5/8 et 17/16 | buildMeterGrid, 4 | audio-lab-core-test.mjs | Code et test local présents |
| D-01 Warp monotone et édition | createWarpMap, 4 | audio-lab-core-test.mjs | Code et test local présents |
| D-02 Corrections PCM et transitoires | dsp+warp, 2+4 | Audio et écoute | Non réalisé |
| E-01 Stretch à hauteur constante | dsp, 2 | Mesures et écoute comparée | Non réalisé |
| F-01 Clic RENAX synchronisé | transport, 5 | Mesure dérive | Non réalisé |
| G-01 Boucles et récupération | AudioLabProject, 8 | Crash/stockage | Contrat défini |
| G-02 Exports WAV/MP3/MIDI/PDF/XML | io, 8 | Roundtrip | Non réalisé |
| H-01 UI RENAX PC et Android | ui+waveform, 6+7 | Captures et appareils | Non réalisé |
| I-01 Compatibilité légale et offline | 8+9 | SBOM et réseau coupé | Non vérifié |
| I-02 Non-régression RENAX | QA, 10 | CI obligatoire | En attente de CI |

## Séquencement et critères de passage

- **A** Audit, contrats et banc de tests : revue de branche, CI et frontière non destructive.
- **B** Import local, décodage progressif, peaks pyramid, transport Web Audio et stockage de base. Validation PC et Android.
- **C** Onsets, métriques alternatives, modes asymétriques et confiance : annotations indépendantes avant automatisation.
- **D** Warp calé sur la carte validée, zones protégées, annulation/rétablissement et traitement sans perte de source.
- **E** DSP légal, testable et performant, avec mécanismes de dégradation explicites.
- **F** Adaptateur sons RENAX, horloge partagée et tests de dérive.
- **G** Boucles, annotations, mixage isolé, projets et exports.
- **H** UI premium démarrée conceptuellement en A ; aucun changement visuel sans revue dédiée, skills réellement présents et contrôle des quatre thèmes.
- **I** Mesures audio, licences, disponibilité hors connexion, tests visuels et matériels, CI obligatoire ; puis PR, fusion autorisée, déploiement et vérification du site.

Les tests musicaux et de crêtes ne prouvent ni la qualité DSP ni le fonctionnement sur smartphone. Ne pas fusionner ou annoncer un déploiement sur la base du seul noyau.
