# Maintenance et contrats de non-régression

Le point d’entrée est `index.html`, qui assemble désormais le moteur `metronome-core.js` et les styles extraits. Le site fonctionne sans compilation de JavaScript ; les scripts classiques partagent encore des fonctions historiques. Ne pas convertir ou déplacer une fonction audio sans comparer les rendus.

## Responsabilités

| Fichier | Responsabilité | Contrat à préserver |
| --- | --- | --- |
| `numbox-controls.js` | Présentation et clavier des listes numériques | Aucun accès au moteur audio, à la bibliothèque ou à la navigation ; `RENAX_NUMBOX` constitue le seul export. |
| `songs-index2.js` | Bibliothèque Tracks, vues et chargement des morceaux | Le modèle est actualisé immédiatement ; les saisies sont enregistrées après 400 ms d’inactivité ou à la validation. Les mesures répétées restent virtuelles. |
| `local-backup.js` | Copie locale atomique et périmètre de compte | Comparer la chaîne brute avant toute écriture ; conserver une source illisible ; enregistrer les saisies en attente avant un changement de compte. |
| `cloud-backup.js` / `sync-core.js` | Synchronisation et fusion | Enregistrer les saisies locales avant de fusionner une réponse asynchrone ; isoler les comptes ; conserver les contrôles de révision. |
| `amorce-song.js` / `amorce-plan.mjs` | Préparation, planification et annulation du guide vocal | Un rechargement interne ne doit pas annuler sa propre préparation ; un arrêt utilisateur doit l’annuler. Les annonces tardives conservent leur ancre avec un décalage de lecture explicite. |
| `pro-sound-bank.js` | Échantillons supplémentaires | Préparer la banque sélectionnée avant la lecture ; utiliser le contexte de destination. Préserver PCM, niveaux, transpositions et durées validés. |
| `song-export.js` / `mp3-export-worker.js` | Export audio | Isoler l’export de la lecture ; conserver les deux modes de niveau et vérifier le MP3 décodé. |
| `interface-language.js` | Traduction | Traduire les libellés d’interface sans modifier les noms saisis, y compris dans les attributs accessibles. |

`flushPending()` doit continuer à signaler un échec après l’expiration du délai : une écriture refusée ne rend pas la saisie enregistrée. Les remplacements complets de bibliothèque annulent les tâches de saisie de l’ancien modèle.

Les contrôles numériques partagent `--numeric-font-size` et `--numeric-radius` entre le métronome et Tracks. Éviter les valeurs contradictoires recopiées dans plusieurs feuilles de style.

## Vérification et publication

Installer les dépendances verrouillées avec `pnpm install --frozen-lockfile`. Voir `tests/README.md` pour Chrome, FFmpeg, les modèles vocaux et les émulateurs.

1. Exécuter `pnpm build` après une modification des ressources de la page. Les paramètres de cache sont dérivés du contenu, normalisé LF pour les fichiers texte.
2. Exécuter `pnpm check:assets` ; cette commande vérifie sans réécrire.
3. Exécuter `pnpm check:tests`, puis `node tests/run.cjs` pour la suite automatisée et `node tests/run.cjs --firebase` avec les émulateurs du projet **demo-renax-backup** pour les comptes et les règles.
4. L’enregistrement natif Windows se vérifie avec une personne choisissant la destination. Une interception de téléchargement ne remplace pas cette validation.
5. Après publication, contrôler le déploiement et refaire les parcours essentiels sur l’URL publique.

La génération des versions couvre les ressources locales portant `?v=` directement référencées par `index.html`. Les imports internes conservent leurs versions explicites et doivent être révisés s’ils changent.

## Tests ciblés

- `resilience-test.cjs` : voix absente et nouvelle tentative, saisie différée, manque d’espace simulé, changement de compte, onglet périmé, préparation/annulation et regroupement du guide vocal.
- `numbox-accessibility-test.cjs` : zoom autorisé, listes différées du Séquenceur, navigation clavier, isolation des raccourcis et dialogues de renommage/copie/déplacement.
- `pro-sound-context-test.cjs` : comparaison exacte des 18 rendus avec `f38d9b3f76acd05a608151c663ba2706d6fb4431`, décodage hors du premier coup, contexte indépendant et absence des téléchargements Beep inutilisés. Ce test nécessite cet historique Git ; le workflow utilise un clone complet.
- `audio-headroom-test.cjs` : rendus à plein volume avant le plafond de protection, incluant les flux superposés. Un simple produit de gains maximaux ne remplace pas ce rendu.

Le manifeste `assets/metronome/pro-samples-manifest.json` conserve les métadonnées disponibles et les empreintes PCM ; il ne constitue pas une vérification juridique indépendante de leur provenance.

## Limites actuelles

L’extraction du contrôle numérique est une séparation ciblée. `metronome-core.js` et `songs-index2.js` restent volumineux et comportent des dépendances globales. Les échantillons supplémentaires restent embarqués en base64 : le décodage inutile au chargement est supprimé, mais le coût de transfert et d’analyse du fichier demeure.

Les gestes tactiles conservent le comportement existant de défilement et de maintien pour déplacer. Passer à une poignée et au défilement natif modifierait l’interaction et nécessite une validation dédiée sur appareils physiques.

Les tests navigateur mobiles utilisent l’émulation Chrome. Ils ne certifient ni le Bluetooth, ni tous les navigateurs mobiles, ni la lecture écran verrouillé sur un téléphone physique. Un test réussi n’établit pas une absence universelle de bugs.

## Secours et hors connexion

Consulter `ARCHITECTURE.md` avant de modifier la récupération IndexedDB, les changements de périmètre ou le Service Worker. Une mise à jour ne doit jamais recharger automatiquement une lecture. Un cache incomplet ne doit pas remplacer le cache actif. Le build recalcule également `offline-manifest.json` et la révision du worker ; `--check` vérifie ces deux fichiers.

Le script principal extrait conserve les mêmes fonctions audio. Les deux tests qui lisaient directement ses constantes lisent désormais `metronome-core.js` ; le contrôle de gain compare toujours la même expression +4,5 dB, et échoue si cette expression n’est plus trouvée. Les comparaisons de dimensions, de signal et d’accents ne sont pas assouplies.

## Protection et contrôles avant fusion

La branche main exige une pull request, les contrôles sampled-audio et firebase réussis et une branche à jour. Suppression, envois forcés et contournement administrateur sont interdits. Le workflow couvre toutes les PR vers main ; les jobs de production et de compatibilité complètent les contrôles existants. La publication dépend de leur réussite à tous.

Le lint contrôle les constructions dangereuses dans le code maintenu, les outils et les tests. Le contrôle des variables non définies et inutilisées n'est pas généralisé aux contrats historiques entre scripts classiques. Le formatage porte progressivement sur les nouveaux fichiers entretenus, sans réécriture générale des sources historiques.

## Production distincte

`pnpm build:production` génère `dist/site`, les cartes de sources et un rapport de tailles. Les identifiants et expressions JavaScript restent préservés. Le regroupement CSS conserve l'ordre de la cascade et la feuille paysage indépendante. Les versions des dépendances locales puis les empreintes finales du cache sont recalculées. Deux constructions identiques doivent produire les mêmes fichiers.

Avant publication : comparer les dispositions, le PCM, les niveaux des exports, la récupération et le véritable mode hors connexion. Ne pas reconstruire une sortie pendant qu'un navigateur en teste l'installation du cache. Le déploiement GitHub Pages publie l'artefact contrôlé, après réussite des quatre jobs. Le site utilise une CSP meta ; GitHub Pages ne transforme pas un fichier arbitraire en en-tête HTTP.

`pnpm measure:assets` fournit les tailles brutes/gzip, pas le trafic initial exact ou un LCP sur appareil réel. Les voix restent en WAV : aucune conversion avec pertes n'est autorisée par une seule estimation de taille. Les tests qui demandent les voix les préparent explicitement ; les assertions historiques de PCM, dimensions et gains restent applicables.
## Contrat de la suite nocturne

Le workflow `nightly-tests.yml` lance `RENAX_NIGHTLY=1 pnpm test` à 01:23 UTC, à la demande et sur les PR qui changent les tests ou leur outillage. Avant la suite, `node tests/setup.mjs --espeak-only` prépare les ressources eSpeak épinglées sans télécharger les gros modèles neuronaux. La liste exacte des tests nocturnes, exclusions motivées et tests couverts par un job dédié vit dans `tests/ci-policy.json` ; voir `tests/CI.md` pour les commandes de remplacement.

Tout ajout, déplacement ou retrait d’un fichier `*-test.cjs` ou `*-test.mjs` doit actualiser ce registre. `pnpm check:tests` refuse les oublis, doublons et entrées périmées ; il tourne sur chaque PR et avant la sélection nocturne. Une erreur d’un test classé nocturne fait échouer la suite. Le contrôle négatif de `tooling-guards-test.cjs` vérifie un oubli volontaire dans une copie temporaire isolée.

`timing-test.cjs` force séparément les contextes audio à 44 100 et 48 000 Hz. Les repères annotés sont convertis en secondes puis en trames avec la fréquence du buffer décodé. La corrélation interpole les positions fractionnaires à la fréquence du rendu ; le seuil de forme reste 0,001 et les limites temporelles restent 1,1 ms. Une injection de +25 ms, sur les deux voix et aux deux fréquences, doit être rejetée par le même validateur temporel. Aucun fichier audio ni planificateur n’est modifié.

La première exécution complète en CI a exposé des attentes murales fragiles : l’éditeur rythmique attend désormais quatre événements avant de comparer leur ordre et leur position ; le guide vocal attend la fin musicale sur `audioCtx.currentTime`, avec 200 ms de marge audio et une limite murale de secours. Un test dont l’arrêt est désactivé doit encore échouer. Les rapports du guide sont écrits avant les assertions pour conserver les diagnostics d’échec. Le test de refus du stockage vise le transport accessible plutôt que les IDs dupliqués dans la réplique d’accueil inerte. Ces ajustements ne changent aucun script de l’application.
