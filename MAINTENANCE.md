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


## Validation de la phase 2

Après modification des ressources : `pnpm build`, puis `pnpm check:assets`. Lancer `node tests/run.cjs --only=playback-support-test.cjs,quality-invariance-test.cjs,timing-test.cjs`, les contrôles lint/format/types, puis `pnpm build:production` et `pnpm test:production`. `quality-invariance-test.cjs` compare les rendus PCM SHA-256 de toutes les banques à 44,1/48 kHz au commit de phase 1 validé `274eac965132a8f3120c7e097b8a3cb9c90285e4`, puis capture les six modules, trois thèmes et trois tailles. `PCM_ONLY=1` permet de sélectionner uniquement la comparaison PCM.

`playback-support-test.cjs` simule les verrous et la latence, vérifie les trois transports, les erreurs audio, les acquisitions tardives, le retour visible pendant une acquisition, les bornes/persistance du réglage, le refus du stockage, la calibration et ses annulations. Il vérifie aussi les clés FR/EN, l’accessibilité Axe de la nouvelle section et conserve neuf captures de Préférences.

Essais physiques à exécuter sur Brave Android avec casque Bluetooth :
1. Pour métronome, multipiste et morceau, laisser jouer au-delà du délai de veille puis arrêter : vérifier écran maintenu pendant la lecture et comportement normal après arrêt.
2. Quitter l’onglet pendant la lecture, revenir, vérifier reprise de la protection écran sans lecture doublée. Tester aussi sans autorisation de verrou si le navigateur propose ce réglage.
3. Dans Préférences, calibrer par au moins cinq frappes avec le clic, appliquer, fermer et recharger : vérifier valeur conservée et synchronisation visuelle au casque. Comparer aussi la sortie sans Bluetooth.
4. Vérifier −100 et +400 ms, annuler une calibration, fermer pendant le chargement, et calibrer pendant une lecture déjà lancée : aucune lecture surprise ni arrêt de celle que l’utilisateur avait lancée.

La précision dépend de la latence annoncée par le navigateur, de l’affichage et des frappes humaines ; les tests simulés ne remplacent pas ces essais physiques. Les workflows de validation acceptent les bases `audit/phase-*` afin de vérifier les PR par phase sans fusionner la phase précédente ni déclencher de déploiement.


## Validation de la phase 5

Langues validées dans le périmètre : français, anglais, espagnol, allemand et italien, avec ressources intégrées au cache hors ligne. Tester les six modules, Préférences, le compte et les commandes dynamiques dans chaque langue. Les titres et libellés saisis par les utilisateurs doivent rester littéraux. `multilingual-interface-test.cjs` vérifie la présence des catalogues, les restes français, la persistance et les débordements des boutons sur les trois tailles et trois thèmes, et conserve 45 captures de Préférences. `check-production-offline.cjs` recharge les cinq langues sans réseau en conservant la bibliothèque.

Après modification : `pnpm build`, `pnpm check:assets`, `pnpm check:styles`, `pnpm check:tests`, lint, format et types. Lancer les tests multilingues et `style-budget-test.cjs`, `module-extraction-test.cjs`, puis `quality-invariance-test.cjs` : référence de phase 2 `396287e3a921891b27e608f2e5f363091b5fe1c7`, PCM à 44,1/48 kHz et 54 comparaisons de capture. Terminer par `pnpm build:production` et `pnpm test:production`. Les réglages du casque et les essais physiques de veille/calibration de phase 2 restent à exécuter à part. Les phases 3 et 4 de l’audit ne sont pas comprises dans cette branche.

Le cliquet mesure les feuilles externes, y compris les 98 !important extraits du HTML. Le total initial de 1 895 devient comparable à l’ancien total CSS de 1 797 seulement en ajoutant ces 98 déclarations. Une nouvelle feuille a un plafond nul si elle n’est pas recensée ; un changement de budget ne peut pas augmenter les plafonds de la PR précédente.

Les 36 exceptions conservées, leurs concurrents et les comptes par feuille figurent dans `CSS-MIGRATION.md`. Le cliquet passe de 1 895 à 1 849 priorités CSS et conserve 110 affectations directes JS. Les tests négatifs vérifient qu’une hausse CSS/JS ou un commentaire/concurrent manquant fait échouer le contrôle. Aucune couche `@layer` n’est livrée.

Le test d’invariance exige désormais une différence maximale de canal de 0/255 ; il normalise le thème, les polices, le pointeur et le focus, et masque les canevas animés comme dans la référence. Les sondes `CASCADE_PROBE=remove-important` et `CASCADE_PROBE=layers-only` séparent les deux facteurs à partir des petites feuilles de référence. Les matrices complètes multilingue et d’invariance ont un délai maximal de dix minutes par test ; les assertions restent actives.

Le contrôle multilingue parcourt 360 états dans les cinq langues, vérifie les clés visibles et les catalogues, détecte les restes français et les replis anglais hors anglais, et contrôle les rectangles des glyphes des boutons. Un bouton volontairement trop étroit vérifie la détection de débordement. Les chevrons décoratifs ne sont pas du texte tronqué.

Les résultats de validation de la livraison sont consignés dans `PHASE5-VALIDATION.md` et le compte rendu de la PR ; un résultat en échec ne vaut pas validation. Aucune fusion ni publication ne doit précéder la CI verte.
