# Architecture

Le site reste une application statique. L’extraction conserve des scripts classiques et leur ordre : elle ne convertit pas le moteur audio en modules ES et n’altère pas les sons approuvés.

```mermaid
flowchart TD
  Page[index.html : assemblage et interface] --> Core[metronome-core.js : transport et planificateur]
  Page --> Styles[Styles de base, séquenceur et thèmes]
  Page --> Controls[numbox-controls.js : listes et clavier]
  Page --> Songs[songs-index2.js : bibliothèque et vues]
  Songs --> Local[local-backup.js : copie atomique et périmètre]
  Songs --> Emergency[emergency-backup.js : copie IndexedDB de secours]
  Local --> Sync[sync-core.js : file persistante et fusion]
  Sync --> Cloud[cloud-backup.js : compte et serveur]
  Core --> Banks[Banques et tampons audio préparés]
  Core --> Guide[amorce-song.js et amorce-plan.mjs]
  Page --> Export[song-export.js et worker MP3]
  Page --> Offline[offline-cache.js et service-worker.js]
```

## Moteur et interface

`metronome-core.js` contient les fonctions historiques de transport, le planificateur et les références musicales partagées. Les variables lexicales globales restent un contrat existant avec les modules. Ne pas déplacer une fonction de rendu sans comparer le PCM.

`numbox-controls.js` ne connaît ni le stockage ni l’audio. `compact-controls.js` dimensionne les listes ; `training-numbox.js` garde la liste virtuelle des grandes plages. Le nom accessible inclut le contexte et la valeur visible. Les cartes contenant des commandes sont des groupes et non des boutons imbriqués.

`settings-accessibility.js` fournit les rôles du panneau Préférences, la limitation du focus, Échap, le retour du focus et l’inertie du fond. `workspace-layout.js` conserve la navigation et le placement. Les raccourcis globaux sont suspendus dans les dialogues.

`app-base.css`, `sequencer-layout.css` et `appearance-theme.css` sont extraits à leur position initiale dans la cascade. `accessibility.css` regroupe le focus visible, les contrastes mesurés et le retour d’erreur. Les fichiers historiques de thèmes demeurent nécessaires ; les supprimer sans comparaison changerait le rendu.

## Données

La bibliothèque est le modèle en mémoire. Le stockage principal conserve ensemble la bibliothèque, les révisions et la file d’attente. L’écriture compare la chaîne brute précédente : un onglet périmé ne remplace pas une nouvelle copie. Une source illisible passe en lecture seule.

Le délai de 400 ms concerne les frappes, pas les autres mutations. `flushPending()` échoue tant qu’une écriture refusée n’a pas réussi. Un changement de compte et une fusion distante doivent d’abord l’appeler. La synchronisation exige que le périmètre local corresponde à l’utilisateur authentifié ; un changement de périmètre échoué ne doit pas transférer l’ancien catalogue.

IndexedDB contient seulement des copies de secours, séparées par périmètre et onglet. Elles mémorisent le jeton de la copie principale dont elles sont issues. La récupération automatique exige ce même jeton et un modèle encore intact. Les versions en concurrence restent exportables ; une confirmation principale ne supprime que les secours au contenu identique.

## Audio et erreurs

La voix est préchauffée après le rendu initial, avec chargement immédiat si elle est demandée avant. Une voix manquante ne bloque pas un clic instrumental. Une erreur du périphérique audio libère le transport, affiche une explication et autorise une nouvelle tentative.

Le contexte audio utilisé par les échantillons est celui de la destination. Les fichiers supplémentaires gardent leurs PCM, gains, transpositions et résonances. L’export MP3 reste un traitement distinct de la lecture.

`ui-feedback.js` capture les erreurs non traitées sans empêcher leur signalement natif. Les messages utilisent du texte ; le journal est borné en mémoire, sans télémétrie distante. Les cas d’échec prévus gardent leur traitement métier et leurs tests de récupération.

## Cache et déploiement

`tools/stamp-assets.cjs` calcule les paramètres de cache de la page, les empreintes des ressources publiques et la révision du Service Worker. Les sources texte sont normalisées LF pour la comparaison entre Windows et Linux.

Le Service Worker prépare un nouveau cache séparé et vérifie chaque fichier. Il conserve le cache actif si l’installation échoue, n’emploie pas `skipWaiting` et ne recharge pas une page en lecture. Le HTML de secours et ses ressources appartiennent à une même révision ; une demande portant une nouvelle empreinte ne reçoit pas un ancien script. Les importations historiques datées préfèrent le réseau et disposent d’un secours vérifié.

Les caches sont limités au chemin de cette application. Les comptes et leurs réponses restent hors cache ; les données métiers restent dans leur stockage. Le cache vocal borne le nombre d’entrées et ne déclare disponibles que les réponses effectivement conservées. La synthèse naturelle distante n’est pas promise hors ligne.

## Preuves

## Contrats et frontières du deuxième lot

Les trois scripts classiques `metronome-audio.js`, `metronome-core.js` et `metronome-transport.js` restent chargés dans cet ordre. Ils regroupent respectivement les sons et le décodage, le modèle et les contrôles, puis la planification et l'initialisation. Leurs variables historiques restent partagées : ce découpage facilite la lecture, sans prétendre supprimer toutes les dépendances globales. Les gains et les algorithmes de synthèse sont préservés.

L'aperçu du guide utilise le contrat explicite et figé `RENAX_AUDIO_ADAPTER` (`prepare`, `ready`, `configure`, `destination`, `click`, `count`), sans évaluation de chaînes dans la fenêtre enfant. `prepare` est asynchrone et prépare les enregistrements nécessaires avant le rendu. Les 40 voix enregistrées se chargent à la première demande vocale ou à l'action explicite de préparation hors connexion. Les modèles de synthèse naturelle restent distincts.

`types/library.d.ts` décrit bibliothèque, morceaux, sections et opérations de synchronisation. Le contrôle JSDoc de `sync-core.js` et `song-tempo-ramp.js` fonctionne sans émettre de JavaScript. Il est strict sur ces deux modules et progressif pour le reste du projet ; il ne couvre pas encore tout le DOM ni le moteur audio. La validation des imports à l'exécution reste obligatoire.

`interface-translations.js` contient le dictionnaire FR/EN, indépendant du parcours DOM. Le contrôleur crée sa propre copie pour ses compléments historiques ; les nouveaux messages utilisent des clés. En l'absence du fichier de données, l'interface reste française et conserve la préférence anglaise pour la prochaine ouverture réussie. Les noms des utilisateurs ne sont pas des clés de traduction.

`pnpm build:production` prépare `dist/site` : HTML sans commentaires, JavaScript compacté sans renommer les identifiants ni transformer les expressions, CSS regroupé dans l'ordre de la cascade. La feuille paysage reste séparée pour préserver son activation indépendante. Les sources et cartes de débogage restent disponibles. Les imports locaux identifiables sont versionnés après transformation ; les ressources finales alimentent ensuite les empreintes du cache. Les URL historiques, dont `index2.html`, restent présentes.

La CSP est appliquée par balise meta dans cette sortie. Les scripts inline maîtrisés sont autorisés par empreinte ; les dépendances vocales et Firebase ont des origines explicites. Cette balise ne fournit ni `frame-ancestors`, ni observation Report-Only, ni en-tête HTTP. Le diagnostic JSON est local, borné et exclut morceaux, comptes et messages d'erreur bruts. L'INP local dépend du support navigateur et ne constitue pas une mesure de terrain.

## Preuves

Les tests de caractérisation comparent 36 dispositions avec les mêmes sources réintégrées à leurs positions d’origine. Les tests audio comparent les rendus approuvés. Les tests de panne vérifient quota, secours, conflit d’onglets, changement de compte, Web Audio indisponible et cache incohérent. Le test hors ligne utilise réellement un Service Worker, coupe le réseau puis recharge et produit un MP3 décodable.

Les autres scénarios du banc de tests désactivent les Service Workers pour éviter qu’un cache ne masque une modification ou une interception de panne ; le test dédié les active explicitement.

La navigation principale est présente dès le HTML. Seule la grille musicale en cours d’assemblage reste invisible jusqu’à la première mise en page complète des contrôles et du canevas, sans attendre les ressources sans rapport avec cette grille. Les polices et les contrôles conservent leurs observateurs de redimensionnement. Un secours de 3 secondes rétablit la visibilité même si un script échoue. Le temps de révélation est mesuré séparément du CLS pour éviter de masquer une attente excessive. L’ajustement des libellés réutilise les mesures identiques et invalide son cache lors d’un changement de dimensions, langue, thème ou police.

Ne pas fixer `data-mobile-pane` dans le HTML initial : avant l’installation du gestionnaire de disposition, la restauration de l’historique lit l’onglet natif actif. Un état mobile prématuré peut créer une entrée de détail supplémentaire après rechargement. Le test Retour/Avancer couvre cette régression.

Les marques User Timing `renax-workspace-loading` et `renax-workspace-visible` séparent l’attente réelle de la grille du temps total de navigation ; elles sont optionnelles sur un navigateur sans `performance.mark`. Les mesures de libellés restaurent toutes les tailles, lisent les dimensions, puis appliquent les ajustements en trois passes pour éviter un recalcul de page par libellé. Une première vue native déjà rendue est réutilisée uniquement lorsque l’écran d’historique est absent ou correspond lui aussi au métronome par défaut, et lorsque l’état natif par défaut est intact ; les autres ouvertures passent par la restauration habituelle.

## Contrat des tests et de la CI nocturne

`tests/run.cjs` découvre les tests de premier niveau, plus les scénarios Firebase locaux historiques. Sur Linux il utilise le Chromium installé par Playwright ; `CHROME_PATH` et `RENAX_CHROME` peuvent toujours remplacer ce chemin. Une sélection `--only=` inconnue échoue au lieu de réussir sans exécuter de test.

Avec `RENAX_NIGHTLY=1`, le runner vérifie d’abord le registre `tests/ci-policy.json`, affiche les exclusions motivées et n’exécute que la sélection nocturne explicite. Les scénarios nécessitant les émulateurs restent dans le job Firebase ; les sélecteurs natifs et modèles neuronaux absents ont des exclusions écrites. `tools/check-test-coverage.cjs` vérifie récursivement que chaque fichier `*-test.cjs` ou `*-test.mjs` possède exactement une classification et que les commandes dédiées existent. Le workflow planifié est également exécuté sur les PR qui changent ce contrat, afin de le valider avant fusion. Les artefacts conservent les résultats et journaux par test.

Les références de `tests/timing-test.cjs` sont des temps physiques, convertis avec `AudioBuffer.sampleRate` après décodage. Les 20 scénarios sont rendus à 44,1 et 48 kHz. L’interpolation des échantillons fractionnaires conserve le critère de forme d’onde et le validateur temporel rejette aussi une injection volontaire de 25 ms. Le contrat des scripts classiques et le moteur audio restent inchangés.


## Contrat de lecture : veille et synchronisation visuelle

`playback-support.js` reste un script classique, chargé avant `metronome-transport.js`, sans déplacer les scripts existants. `window.RENAX_PLAYBACK` possède le verrou écran des transports métronome/morceau et multipiste : acquisition seulement pendant la lecture visible, libération à l’arrêt, après erreur, au masquage et à `pagehide`, réacquisition au retour. Une demande encore en attente à l’arrêt est libérée dès sa résolution. API absente ou refusée : la lecture reste disponible. Les générations distinctes du transport et du verrou empêchent une ancienne demande ou un ancien rappel visuel de survivre à un arrêt.

`delayMs(context)` retourne `outputLatency` (ou `baseLatency` si la première valeur est absente/invalide) en millisecondes, plus la compensation manuelle persistée avec garde de stockage. La valeur manuelle est limitée à −100…+400 ms et à 0 par défaut. Le décalage ne concerne que les rappels d’affichage, les cues de partition et `RenaxMultiClock.Clock.visualWhen`. `Clock.when`, les horizons audio, `nextNoteTime`, les sons et les gains restent inchangés. Un événement visuel déjà passé s’affiche au plus tôt dès que le navigateur le permet ; aucun mécanisme ne peut remonter le temps ni dépasser les limites de cadence d’affichage.

La calibration réutilise la lecture existante et les temps musicaux enregistrés via `recordBeat`. Elle soustrait la latence automatique aux écarts des frappes et applique la médiane après au moins cinq frappes, seulement sur action explicite. Fermer ou annuler interrompt uniquement la lecture démarrée par la calibration. Les textes passent par les clés `latency.*` FR/EN. `playback-support.css` est limité à cette nouvelle section de Préférences.


## Phase 5 : présentation et cinq langues hors ligne

Les anciens blocs CSS de `index.html` sont chargés depuis les fichiers `entry-*.css`, au même emplacement relatif parmi les feuilles existantes. Plusieurs fichiers sont nécessaires car les blocs étaient intercalés entre les feuilles ; les réunir en un seul lien déplacerait la cascade. Le style du sélecteur est chargé à sa position tardive par `interface-language.css`. Aucun bloc style ni !important ne demeure dans index.html. Les quatre grandes feuilles de thème restent inchangées.

Les couches `@layer` sont reportées : leur introduction isolée modifie le rendu avec les grandes feuilles hors couche, dont la modification est exclue du périmètre. Les variables de couleur par thème restent hors couche. Les quatre petites feuilles passent de 82 à 36 priorités : chaque priorité conservée nomme sa règle concurrente, avec inventaire dans `CSS-MIGRATION.md` et `tools/important-exceptions.json`. Le contrôle du budget vérifie cet inventaire et les commentaires associés.

Les dimensions intrinsèques des sélecteurs d’entraînement passent par `--training-native-width` et `--training-native-height`, afin que les règles du composant puissent les ajuster sans priorité contre un style inline. Les contrôles natifs masqués utilisent un sélecteur ciblé dans `app-base.css`. Les libellés dynamiques de navigation passent par `RENAX_I18N.t`.

`vendor/i18next-25.6.0.js` est la distribution UMD officielle lisible, accompagnée de sa licence MIT ; elle est servie localement. L’ordre relatif des scripts existants reste inchangé. `RENAX_TRANSLATIONS` fournit les sources français/anglais et clés historiques, `RENAX_LOCALES` les catalogues espagnol, allemand et italien. `interface-language.js` adapte le DOM et utilise une instance i18next avec ressources embarquées ; aucun service de traduction n’est appelé. `RENAX_I18N` conserve `language`, `t`, `setLanguage` et expose `supportedLanguages`. `renax.interfaceLanguage.v1` accepte fr/en/es/de/it ; le refus du stockage ne bloque pas l’interface. Les noms saisis, données musicales et langues audio ne dépendent pas de la langue d’interface.

`tools/style-budget.json` fixe par fichier le plafond de !important CSS et des affectations directes de style JS, comptées par analyse syntaxique. `pnpm check:styles` refuse toute hausse, tout !important ou bloc style dans index.html ; la CI compare aussi le budget au commit de base de la PR. `--update` peut seulement abaisser un budget existant.

`quality-invariance-test.cjs` sépare la comparaison d’image (plafond absolu 2/255 par canal/pixel, sans pourcentage toléré) et l’égalité stricte des styles calculés sur les 54 combinaisons. `INVARIANCE_SELF=1 VISUAL_ONLY=1` mesure le bruit de la référence comparée à elle-même. Les styles des éléments principaux rendus doivent rester identiques même si le plafond d’image est respecté.
