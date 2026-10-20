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

Le lint contrôle les constructions dangereuses dans le code maintenu, les outils et les tests. Les règles `no-undef` et `no-unused-vars` couvrent les scripts classiques ; leurs globales partagées sont contrôlées par `tools/classic-script-globals.json`. Le formatage porte progressivement sur les nouveaux fichiers entretenus, sans réécriture générale des sources historiques.

## Production distincte

`pnpm build:production` génère `dist/site`, les cartes de sources et un rapport de tailles. Les identifiants et expressions JavaScript restent préservés. Le regroupement CSS conserve l'ordre de la cascade et la feuille paysage indépendante. Les versions des dépendances locales puis les empreintes finales du cache sont recalculées. Deux constructions identiques doivent produire les mêmes fichiers.

Avant publication : comparer les dispositions, le PCM, les niveaux des exports, la récupération et le véritable mode hors connexion. Ne pas reconstruire une sortie pendant qu'un navigateur en teste l'installation du cache. Le déploiement GitHub Pages publie l'artefact contrôlé, après réussite des quatre jobs. Le site utilise une CSP meta ; GitHub Pages ne transforme pas un fichier arbitraire en en-tête HTTP.

`pnpm measure:assets` fournit les tailles brutes/gzip, pas le trafic initial exact ou un LCP sur appareil réel. Les voix restent en WAV : aucune conversion avec pertes n'est autorisée par une seule estimation de taille. Les tests qui demandent les voix les préparent explicitement ; les assertions historiques de PCM, dimensions et gains restent applicables.
## Contrat de la suite nocturne

Le workflow `nightly-tests.yml` lance `RENAX_NIGHTLY=1 pnpm test` à 01:23 UTC, à la demande et sur les PR qui changent les tests ou leur outillage. Avant la suite, `node tests/setup.mjs --espeak-only` prépare les ressources eSpeak épinglées sans télécharger les gros modèles neuronaux. La liste exacte des tests nocturnes, exclusions motivées et tests couverts par un job dédié vit dans `tests/ci-policy.json` ; voir `tests/CI.md` pour les commandes de remplacement.

Tout ajout, déplacement ou retrait d’un fichier `*-test.cjs` ou `*-test.mjs` doit actualiser ce registre. `pnpm check:tests` refuse les oublis, doublons et entrées périmées ; il tourne sur chaque PR et avant la sélection nocturne. Une erreur d’un test classé nocturne fait échouer la suite. Le contrôle négatif de `tooling-guards-test.cjs` vérifie un oubli volontaire dans une copie temporaire isolée.

`timing-test.cjs` force séparément les contextes audio à 44 100 et 48 000 Hz. Les repères annotés sont convertis en secondes puis en trames avec la fréquence du buffer décodé. La corrélation interpole les positions fractionnaires à la fréquence du rendu ; le seuil de forme reste 0,001 et les limites temporelles restent 1,1 ms. Une injection de +25 ms, sur les deux voix et aux deux fréquences, doit être rejetée par le même validateur temporel. Aucun fichier audio ni planificateur n’est modifié.

La première exécution complète en CI a exposé des attentes murales fragiles : l’éditeur rythmique attend désormais quatre événements avant de comparer leur ordre et leur position ; le guide vocal attend la fin musicale sur `audioCtx.currentTime`, avec 200 ms de marge audio et une limite murale de secours. Un test dont l’arrêt est désactivé doit encore échouer. Les rapports du guide sont écrits avant les assertions pour conserver les diagnostics d’échec. Le test de refus du stockage vise le transport accessible plutôt que les IDs dupliqués dans la réplique d’accueil inerte. Ces ajustements ne changent aucun script de l’application.


## Validation de la phase 2

Après modification des ressources : `pnpm build`, puis `pnpm check:assets`. Lancer `node tests/run.cjs --only=playback-support-test.cjs,quality-invariance-test.cjs,timing-test.cjs`, les contrôles lint/format/types, puis `pnpm build:production` et `pnpm test:production`. `quality-invariance-test.cjs` compare les rendus PCM SHA-256 de toutes les banques à 44,1/48 kHz au commit de phase 1 validé `274eac965132a8f3120c7e097b8a3cb9c90285e4`, puis capture les six modules, trois thèmes et trois tailles. `PCM_ONLY=1` permet de sélectionner uniquement la comparaison PCM.

`playback-support-test.cjs` simule les verrous et la latence, vérifie les trois transports, les erreurs audio, les acquisitions tardives, le retour visible pendant une acquisition, l’option Bluetooth fixe +200 ms/0 ms, sa persistance, le refus du stockage et la conservation des temps audio. Il vérifie aussi les clés FR/EN, l’accessibilité Axe de la nouvelle section et conserve neuf captures de Préférences.

Essais physiques à exécuter sur Brave Android avec casque Bluetooth :
1. Pour métronome, multipiste et morceau, laisser jouer au-delà du délai de veille puis arrêter : vérifier écran maintenu pendant la lecture et comportement normal après arrêt.
2. Quitter l’onglet pendant la lecture, revenir, vérifier reprise de la protection écran sans lecture doublée. Tester aussi sans autorisation de verrou si le navigateur propose ce réglage.
3. Dans Préférences, activer « Casque Bluetooth » (+200 ms), fermer et recharger : vérifier que le choix est conservé et que le visuel reste synchronisé au casque. Désactiver l’option pour comparer la sortie sans Bluetooth. La calibration par frappes a été retirée.
4. Activer « Casque Bluetooth » : +200 ms de correction supplémentaire. Désactiver : +0 ms. Recharger pour vérifier la persistance. Ouvrir et fermer les Préférences par la roue dentée, au clavier et au toucher.

La précision dépend de la latence annoncée par le navigateur, de l’affichage ; les tests simulés ne remplacent pas ces essais physiques. Les workflows de validation acceptent les bases `audit/phase-*` afin de vérifier les PR par phase sans fusionner la phase précédente ni déclencher de déploiement.


## Validation de la phase 5

Langues validées dans le périmètre : français, anglais, espagnol, allemand et italien, avec ressources intégrées au cache hors ligne. Tester les six modules, Préférences, le compte et les commandes dynamiques dans chaque langue. Les titres et libellés saisis par les utilisateurs doivent rester littéraux. `multilingual-interface-test.cjs` vérifie la présence des catalogues, les restes français, la persistance et les débordements des boutons sur les trois tailles et trois thèmes, et conserve 45 captures de Préférences. `check-production-offline.cjs` recharge les cinq langues sans réseau en conservant la bibliothèque.

Après modification : `pnpm build`, `pnpm check:assets`, `pnpm check:styles`, `pnpm check:tests`, lint, format et types. Lancer les tests multilingues et `style-budget-test.cjs`, `module-extraction-test.cjs`, puis `quality-invariance-test.cjs` : référence de phase 2 `396287e3a921891b27e608f2e5f363091b5fe1c7`, PCM à 44,1/48 kHz et 54 comparaisons de capture. Terminer par `pnpm build:production` et `pnpm test:production`. Les cinq phases sont intégrées dans la livraison finale. Les essais physiques S23 du maintien de l’écran et des 200 ms Bluetooth sont distincts des tests automatisés et ont été confirmés avec l’utilisateur ; l’impulsion lors du verrouillage par bouton latéral n’est pas déclarée corrigée.

Le cliquet mesure les feuilles externes, y compris les 98 !important extraits du HTML. Le total initial de 1 895 devient comparable à l’ancien total CSS de 1 797 seulement en ajoutant ces 98 déclarations. Une nouvelle feuille a un plafond nul si elle n’est pas recensée ; un changement de budget ne peut pas augmenter les plafonds de la PR précédente.

Les 36 exceptions conservées, leurs concurrents et les comptes par feuille figurent dans `CSS-MIGRATION.md`. Le cliquet passe de 1 895 à 1 849 priorités CSS et conserve 110 affectations directes JS. Les tests négatifs vérifient qu’une hausse CSS/JS ou un commentaire/concurrent manquant fait échouer le contrôle. Aucune couche `@layer` n’est livrée.

Le navigateur du test utilise `--disable-partial-raster` : les tuiles sont entièrement repeintes pour éviter les variations du contour natif des curseurs après un changement d’espace de travail ou de thème. Ce réglage appartient au test ; aucun style de l’application, masque ou budget de pixels n’est modifié.

Le test d’invariance impose désormais **0/255 sur chaque canal de chaque pixel**, sans franchise. Le rendu complet a éliminé le bruit historique de 2/255 sur les 54 cas de référence comparée à elle-même ; le seuil est donc revenu à zéro. Il normalise le thème, les polices, le pointeur et le focus, impose `deviceScaleFactor: 1`, désactive animations et transitions, et neutralise les canevas animés par le même masque que la référence. Les styles calculés des éléments principaux rendus sont comparés dans les 54 cas avec une tolérance nulle : couleurs, arrière-plan, bordures, polices, marges, espacements, dimensions, affichage, visibilité et opacité. Les contrôles natifs transparents et masqués sont exclus ; leurs déclencheurs visibles sont inclus. Un élément principal qui apparaît ou disparaît fait échouer la comparaison. Les sondes `CASCADE_PROBE=remove-important` et `CASCADE_PROBE=layers-only` séparent les deux facteurs à partir des petites feuilles de référence. Les matrices complètes multilingue et d’invariance ont un délai maximal de dix minutes par test ; les assertions restent actives.

Le contrôle multilingue parcourt 360 états dans les cinq langues, vérifie les clés visibles et les catalogues, détecte les restes français et les replis anglais hors anglais, et contrôle les rectangles des glyphes des boutons. Un bouton volontairement trop étroit vérifie la détection de débordement. Les chevrons décoratifs ne sont pas du texte tronqué.

Les résultats de validation de la livraison sont consignés dans `PHASE5-VALIDATION.md` et le compte rendu de la PR ; un résultat en échec ne vaut pas validation. Aucune fusion ni publication ne doit précéder la CI verte.

Diagnostic S23 : après une extinction automatique pendant la lecture, exporter le diagnostic depuis Préférences avant de recharger la page. La section `playback` distingue absence API, refus, politique `screen-wake-lock`, acquisition et libération ; elle indique les latences annoncées et le réglage manuel. Ne pas identifier une sortie Bluetooth à partir de la seule valeur de latence. Les tests simulés ne remplacent pas une validation sur appareil.

Identification des sorties : arrêter la lecture, puis Préférences → Identifier les sorties audio. L’autorisation ponctuelle de microphone est demandée au clic ; toutes les pistes sont arrêtées avant l’énumération. Exporter un diagnostic avec les Buds puis un second après déconnexion et nouvelle identification. Comparer `playback.outputIdentification`, en particulier la sortie par défaut, les groupes et le sink. L’absence de différence fiable interdit d’activer une compensation Bluetooth automatiquement. Le test de diagnostic simule accord, refus, échec d’énumération, libération du micro, absence de noms/identifiants bruts et interdiction pendant la lecture.

Décision utilisateur du 19 octobre : la compensation Bluetooth devient une option manuelle à valeur fixe +200 ms ; la calibration variable est retirée. Les essais S23 de maintien pendant lecture et verrouillage après Stop ont été confirmés en métronome, Multipiste et Track. La synchronisation Bluetooth à +200 ms a été confirmée avec/sans guide vocal. L’impulsion au verrouillage manuel n’est pas déclarée corrigée.

## Phase 3

Modifier les racines CDN uniquement dans `network-origins.js`, puis lancer build/empreintes et production. `check-production-csp.cjs` vérifie les trois chemins, rejette un autre paquet jsDelivr dans script/connect et contrôle le guide vocal enregistré. Les modèles neuronaux absents restent une exclusion explicitement documentée. `check-production-offline.cjs` exige 404 pour l’archive et `songs.js`, puis vérifie toujours les cinq langues et le fonctionnement hors ligne.

`tests/cloud-confirmation-test.cjs` vérifie clavier, Échap, retour de focus, texte non exécutable, cinq langues et Axe aux deux largeurs. Le scénario Firebase d’import utilise désormais ces dialogues ; il conserve les assertions de récupération et déduplication. Le registre nocturne inclut le nouveau test. Les confirmations asynchrones annulent l’import si la portée ou la bibliothèque change pendant leur affichage.


## Phase 4 : contrats et vérification statique

`pnpm lint` vérifie d’abord `tools/classic-script-globals.json` contre les déclarations réelles et l’ordre des scripts classiques de index.html, puis exécute ESLint. Les règles `no-undef`, `no-unused-vars` et `no-empty` sont actives ; seuls les catch vides sont autorisés. Les déclarations globales intentionnelles portent `/* exported ... */`. Les paramètres non utilisés conservés dans une signature et les évaluations historiques conservées dans le moteur portent un préfixe `_` ; les écritures mortes de sauvegarde et les liaisons inutilisées de création DOM sont retirées, tout en conservant les appels. Les fixtures de navigateur ont une liste distincte réservée aux tests.

`pnpm type-check` vérifie exactement sept fichiers JavaScript en mode strict, sans émission : sync-core.js, song-tempo-ramp.js, local-backup.js, emergency-backup.js, midi-export.js, ui-feedback.js et numbox-controls.js. `types/globals.d.ts` décrit leurs frontières `window.RENAX_*` et l’import historique versionné ; les autres API restent `unknown` jusqu’à leur couverture. `vendor/web-vitals-6.2.3.d.ts` décrit uniquement l’API consommée, sans analyser ni modifier la distribution tierce. Les déclarations ne sont pas publiées dans dist/site. La validation des JSON importés reste obligatoire.

`tests/tooling-contracts-test.cjs` doit rejeter un nom inconnu, une variable inutilisée, un bloc vide et un objet de bibliothèque invalide transmis au stockage ; il accepte un catch vide et une globale exposée volontairement. Le registre CI inclut ce test. Après une modification : lint, format, types, build/empreintes, budget CSS/JS, inventaire, tests concernés, PCM et 54 captures strictes, build et tests de production.

## Migration des grandes feuilles de thème

Les six grandes feuilles sont migrées par lots sur une branche dédiée. La référence du lot 1 est main `361d5fd7450216831203e4651f14db75e3e91db9`. Consulter `CSS-MIGRATION.md` et l’inventaire `tools/theme-cascade-lot1.json`. Le budget ne peut que baisser. Les captures doivent rester à 0/255, avec styles calculés strictement identiques ; un écart bloque le lot. `@layer` est reporté après la migration. Le PCM reste comparé aux deux fréquences par le test d’invariance.

Sur chaque PR, le job `sampled-audio` conserve sa comparaison PCM à la référence audio historique et ajoute la comparaison visuelle contre le SHA de base de la PR (`INVARIANCE_REF`, `VISUAL_ONLY=1`). Le seuil reste 0/255, sans tolérance par nombre de pixels. Les résultats du test détaillent aussi les styles calculés. Cette base n’est jamais régénérée à partir du résultat modifié.
