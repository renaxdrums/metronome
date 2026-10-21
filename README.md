# Renax Métronome

Métronome pour batteurs : séquenceur, polyrythmie, entraînement progressif/par paliers, multipiste, bibliothèque Tracks et exports MP3/MIDI/JSON. Le thème sombre est le défaut ; les préférences existantes sont conservées.

Le site public est https://renaxdrums.github.io/metronome/ . Les sources restent à la racine ; le workflow prépare et vérifie la sortie `dist/site` pour sa publication. `index2.html` conserve l’ancien lien et redirige vers la page principale. `index-legacy.html` reste une archive séparée.

## Développement

Prévoir Node.js 22 ou ultérieur, pnpm 11.25.0 et Chrome. Installer avec `pnpm install --frozen-lockfile`.

Le site utilise des fichiers statiques. Pour un aperçu local, servir la racine avec un serveur HTTP, par exemple `python -m http.server 8081`, puis ouvrir `http://localhost:8081/`. Le cache hors ligne demande HTTPS ou localhost ; ouvrir directement le fichier HTML ne suffit pas.

Après un changement des ressources, exécuter `pnpm build`, puis `pnpm check:assets`. Le premier calcule les versions des ressources et le manifeste hors ligne ; le second contrôle sans réécrire. Il ne minifie pas le code et ne produit pas un bundle.

## Vérifications

- `pnpm test` : suite complète, avec journaux distincts par scénario. FFmpeg/ffprobe sont requis pour les mesures MP3.
- `pnpm check:tests` : chaque test doit figurer dans le registre CI ou dans les exclusions motivées de `tests/ci-policy.json`. Voir `tests/CI.md`.
- `pnpm test:setup` : préparer les dépendances de synthèse vocale utilisées par les tests approfondis. Voir `tests/README.md` pour les modèles et variables de chemins.
- `pnpm test:accessibility` : axe et parcours clavier. Un résultat automatique ne certifie pas tout WCAG ni les lecteurs d’écran.
- `pnpm test:resilience` : pannes audio/réseau, quota, secours IndexedDB et vraie réouverture hors ligne.
- `pnpm test:rules` : émulateurs Auth/Firestore du projet **demo-renax-backup**, avec Java 21. Aucun compte réel n’est requis.
- `pnpm test:native` : une personne choisit la destination dans la fenêtre Windows. Cette validation reste séparée de l’automatisation.
- `pnpm lint`, `pnpm format:check`, `pnpm type-check` : erreurs de code, formatage progressif et contrats des modules purs.
- `pnpm build:production`, puis `pnpm test:production` : construire la sortie minifiée avec CSP et contrôler le rendu, les signaux, les exports et le véritable rechargement hors connexion.
- `pnpm test:compat` : Chrome/Chromium, Firefox et WebKit installés par Playwright, formats PC et mobile. Ce n'est pas une certification Safari/iPhone physique.
- `pnpm test:long-session` : dix minutes de lecture et navigation répétées dans Chrome, observations mémoire après collecte.
- `pnpm test:coverage:core` : couverture de `sync-core.js` uniquement ; elle ne représente pas celle de toute l'application.

La suite nocturne tourne chaque jour à 01:23 UTC et sur les PR qui modifient son contrat. Elle utilise `RENAX_NIGHTLY=1 pnpm test`, installe les ressources eSpeak et publie les journaux, résultats et exclusions. Les tests avec modèles neuronaux volumineux restent explicitement exclus ; les comptes sont vérifiés par le job Firebase séparé.

Le test `timing-test.cjs` vérifie les 20 scénarios à 44,1 et 48 kHz ; un décalage volontaire de 25 ms doit échouer au même critère de synchronisation.

Le moteur et les banques ont des tests de rendu audio. Les références Git doivent être disponibles ; un clone superficiel peut empêcher les comparaisons. Le workflow utilise l’historique complet et les dépendances verrouillées.

Une activation Web Audio qui ne répond pas est interrompue après huit secondes avec un message et une possibilité de réessai. Cette limite concerne l'autorisation de démarrage ; elle ne modifie ni l'horloge musicale ni le signal rendu.

## Données et récupération

La copie principale et sa file d’attente restent locales, isolées par compte. La connexion Firebase est facultative. Une panne réseau ne signifie pas « synchronisé » et ne supprime pas les copies locales.

Les saisies de titres/libellés sont enregistrées après 400 ms d’inactivité et aux points de validation. En cas de refus d’écriture, une copie de secours est tentée dans IndexedDB. Au rechargement, elle n’est récupérée automatiquement que si le compte et la sauvegarde principale n’ont pas changé et qu’aucune nouvelle saisie n’a commencé. Une copie ancienne reste exportable dans Sauvegarde. Si les deux stockages sont indisponibles, la bibliothèque reste en mémoire pour export ; une fermeture avant une sauvegarde réussie ne peut pas être garantie sans perte.

## Hors connexion et mises à jour

La première installation du cache nécessite le réseau. Le panneau Préférences indique sa disponibilité. L’application, les banques instrumentales et les outils d’export sont vérifiés avant de rendre le cache utilisable. Les voix se chargent à la première action vocale et sont ajoutées au cache après leur téléchargement. Le bouton « Préparer les voix hors connexion » dans les paramètres permet de les charger explicitement avant une séance sans réseau. Le statut hors connexion confirme ensuite si leur conservation a réussi. Les modèles de synthèse naturelle distants ne sont pas préchargés dans ce cache ; le repli sans guide vocal reste disponible.

Les réponses des comptes Firebase ne sont jamais mises en cache par le Service Worker. Les bibliothèques locales sont séparées du cache statique. Une nouvelle version attend la fermeture des anciens onglets ; aucune lecture n’est interrompue par un rechargement forcé. Un déploiement incomplet est rejeté par empreinte.

## Documents

- `ARCHITECTURE.md` : modules, flux et frontières de responsabilité.
- `MAINTENANCE.md` : contrats de non-régression et publication.
- `BACKUP.md` : modèle de sauvegarde, synchronisation et règles.
- `tests/README.md` : environnement et portée des tests.
- `assets/metronome/pro-samples-manifest.json` : métadonnées et empreintes des échantillons supplémentaires.

Les mesures locales LCP/CLS et les 30 dernières erreurs sont consultables via `RENAX_FEEDBACK` dans le navigateur. Elles restent en mémoire et ne sont envoyées à aucun service. L’INP local est également observé avec web-vitals ; il peut rester absent si le navigateur ne fournit pas les événements nécessaires ou si aucune interaction mesurable n’a eu lieu. Un diagnostic sans morceaux ni informations de connexion peut être téléchargé dans les paramètres. Ces observations ne constituent pas une distribution de visites réelles ni une certification sur appareil physique.


Pendant la lecture, un navigateur compatible peut maintenir l’écran allumé ; la demande est libérée à l’arrêt et rétablie au retour sur l’onglet. L’option « Casque Bluetooth » de Préférences ajoute exactement 200 ms au visuel lorsqu’elle est activée, et 0 ms lorsqu’elle est désactivée. Ce choix est mémorisé ; désactivez-le sur haut-parleur ou casque filaire. La roue dentée ouvre et ferme les Préférences. Seul l’affichage est décalé : les sons, le tempo et l’export audio conservent leur planification. Voir MAINTENANCE.md pour les validations et essais Brave Android/Bluetooth.


La langue de l’interface se choisit dans Préférences : français, anglais, espagnol, allemand ou italien. Ces traductions sont incluses dans l’installation hors connexion. Ce choix ne modifie pas les sons, les voix de comptage ni les noms de morceaux et de presets saisis par l’utilisateur.

Maintenance CSS : `pnpm check:styles` contrôle le budget par feuille et les affectations directes de style JavaScript ; les plafonds ne peuvent qu’être réduits.

Les exceptions CSS nécessaires sont documentées dans `CSS-MIGRATION.md` ; `pnpm check:styles` vérifie aussi leurs commentaires et les règles concurrentes. Les grandes feuilles de thème et la migration vers `@layer` restent hors de cette phase.

En cas de veille pendant la lecture ou de décalage Bluetooth, Préférences permet d’exporter un diagnostic local incluant le Wake Lock et les latences audio annoncées. Aucun diagnostic n’est envoyé automatiquement.

Pour examiner un changement de sortie Bluetooth, arrêter la lecture puis utiliser « Identifier les sorties audio » dans Préférences. Cette action demande un accès ponctuel au microphone pour exposer les informations des périphériques ; le micro est immédiatement libéré, sans enregistrement ni envoi de son. Exporter ensuite le diagnostic. Cette identification ne constitue pas encore un basculement automatique de compensation.

La version publiée n’inclut plus l’ancienne interface ni son script dédié ; leurs sources restent au dépôt. Les anciennes données locales sont récupérées par l’application actuelle. Les confirmations d’import cloud utilisent des dialogues accessibles traduits. Les dépendances vocales externes sont autorisées uniquement depuis les trois chemins jsDelivr versionnés partagés avec le build.


### Vérifications statiques et captures

`pnpm lint` contrôle le registre des globales et l’ordre des scripts classiques, puis ESLint avec `no-undef`, `no-unused-vars` et `no-empty` (catch vides autorisés). `pnpm type-check` vérifie sept fichiers JavaScript en mode strict et sans génération. Les contrats se trouvent dans `tools/classic-script-globals.json` et `types/globals.d.ts`. `node tests/run.cjs --only=tooling-contracts-test.cjs` vérifie aussi les refus attendus du lint et des types.

Les 54 captures d’invariance utilisent le rendu complet de Chromium, avec une tolérance **zéro** sur chaque canal de chaque pixel et sur les styles calculés. La comparaison PCM demeure bit à bit à 44,1 et 48 kHz. Les quatre grandes feuilles de thème restent inchangées.

La migration ultérieure des six grandes feuilles est suivie par lots dans `CSS-MIGRATION.md` : captures exactes à 0/255, styles calculés et comparaison PCM aux deux fréquences. Aucun `@layer` ne sera introduit avant cette migration.

L’accueil utilise la présentation KERN : logo approuvé, ondes, titre MÉTRO blanc / NOME orange et RENAX DRUMS blanc, puis fondu au noir et apparition progressive de l’interface. L’animation se désactive dans les Préférences, avec Échap ou via le réglage système de mouvement réduit. Elle ne démarre aucun son et ne modifie pas la lecture.
