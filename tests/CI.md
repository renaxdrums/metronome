# Couverture de la CI

`pnpm check:tests` exige que chaque fichier `*-test.cjs` et `*-test.mjs` sous `tests/` figure exactement une fois dans `ci-policy.json`. Un fichier oublié, une entrée périmée ou un doublon fait échouer la CI. Les sous-répertoires `results` et `node_modules` sont exclus de la découverte des sources.

Le workflow `nightly-tests.yml` lance `RENAX_NIGHTLY=1 pnpm test` à **01:23 UTC** chaque jour, sur demande et sur les PR qui modifient les tests, les workflows, le registre ou les dépendances. Il installe Chromium, FFmpeg, un périphérique audio virtuel et les ressources eSpeak épinglées (`node tests/setup.mjs --espeak-only`). Sur les PR, les deux courts scénarios interactifs du guide vocal et de l’éditeur rythmique passent d’abord en précontrôle pour fournir un diagnostic rapide, puis restent dans la suite complète. Les gros modèles neuronaux ne sont pas téléchargés. Le runner conserve les journaux, résultats JSON et artefacts par scénario ; tout échec reste bloquant. Les exclusions et leurs raisons sont affichées avant exécution.

La clé `nightly` donne la sélection exécutée ; `dedicated` indique le job complémentaire ; `excluded` donne les opérations ou ressources qui manquent sur le runner. Pour ajouter un test, choisir une de ces classifications et justifier toute exclusion. Le contrôle négatif `tooling-guards-test.cjs` ajoute un faux test dans une copie isolée et vérifie son rejet.

| Test hors sélection nocturne | Raison et validation de remplacement |
| --- | --- |
| `mp3-native-picker-test.cjs` | Une personne doit sélectionner la destination dans la boîte native Windows. Exécuter `pnpm test:native` sur Windows. |
| `amorce-neural-test.mjs` | Nécessite les modèles Kokoro épinglés absents du runner. Exécuter `pnpm test:setup`, puis `node tests/run.cjs --only=amorce-neural-test.mjs` sur une machine disposant des modèles. |
| `voice-levels-test.mjs` | Mesure les voix neuronales et nécessite leurs modèles épinglés. Exécuter `pnpm test:setup`, puis sélectionner ce test avec `--only=voice-levels-test.mjs`. |
| `amorce-page-test.cjs` | Charge le guide neuronal dans le navigateur et nécessite les modèles Kokoro. Exécuter `pnpm test:setup`, puis sélectionner ce test avec `--only=amorce-page-test.cjs`. |
| `piper-speed-test.cjs` | Nécessite le modèle Piper épinglé absent du runner. Exécuter `pnpm test:setup`, puis sélectionner ce test avec `--only=piper-speed-test.cjs`. |
| `account-scope-test.cjs` | Exécuté par le job `firebase` sur push/PR avec les émulateurs Auth/Firestore isolés. Reproduire avec Java 21 et `pnpm test:rules`. |

Les tests Firebase `*.test.mjs` (noms sans `-test`) sont sélectionnés explicitement par le runner : `core`, `local` et `navigation` dans la suite nocturne ; `core`, `rules`, `browser`, `local` et `navigation` avec `--firebase`. Le contrat anti-oubli porte aussi sur tout futur fichier `*-test` ajouté en sous-répertoire, qui devra disposer d’un chemin d’exécution explicite.

Le test de timing conserve les limites temporelles de 1,1 ms et le seuil de forme d’onde de 0,001. Il doit réussir 20 scénarios par fréquence (44,1 et 48 kHz) et rejeter une injection de 25 ms sur les deux voix à chaque fréquence. Lancer `node tests/run.cjs --only=timing-test.cjs` pour reproduire ces contrôles.


Les PR dont la base est `audit/phase-*` exécutent aussi les validations, sans déploiement. La phase 2 ajoute `playback-support-test.cjs` (veille, latence, calibration et Préférences) et `quality-invariance-test.cjs` (PCM SHA-256 aux deux fréquences et captures face à la phase 1 validée). Ces deux tests sont inscrits dans le registre nocturne ; leurs contrôles fonctionnels et PCM passent également dans le job audio. Les différences visuelles sont calculées dans le navigateur, sans dépendance Python supplémentaire.
