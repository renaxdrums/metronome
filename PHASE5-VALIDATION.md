# Phase 5 — résultats de validation

Référence : `396287e3a921891b27e608f2e5f363091b5fe1c7` (phase 2). PR : https://github.com/renaxdrums/metronome/pull/11. Les quatre grandes feuilles de thème et les trois scripts audio protégés restent inchangés. Aucun déploiement ni fusion.

## Fichiers modifiés et raisons

- `index.html`, `entry-*.css`, `interface-language.css` : extraire les styles en conservant leur position dans la cascade ; zéro bloc style et zéro priorité dans le HTML.
- `accessibility.css`, `app-base.css`, `training-modes.css`, `navigation-index.css` : 82 priorités avant, 46 retirées, 36 conservées et commentées. Concurrents et tableau complet dans `CSS-MIGRATION.md` et `tools/important-exceptions.json`.
- `compact-controls.js` : dimensions intrinsèques des sélecteurs d’entraînement en variables de repli pour éviter les conflits inline ; dimensionnement et rayon séparés afin de conserver la cascade mobile.
- `interface-language.js`, `interface-translations.js`, `interface-locales.js`, `vendor/i18next-*`, `workspace-layout.js` : cinq langues intégrées hors ligne, libellés dynamiques traduits et boutons de langue accessibles.
- `tools/check-style-budget.cjs`, `tools/check-important-exceptions.cjs`, leurs références et tests : plafond par fichier, commentaires et concurrents vérifiés ; hausse CSS/JS refusée, même avec `--update`.
- Tests d’invariance et multilingues, registre CI, workflow, commandes et documentation : couvrir les nouveaux contrats ; empreintes et cache hors ligne actualisés.

## Critère visuel explicitement retenu

Maximum de 2/255 sur **chaque canal de chaque pixel**, sans pourcentage ni nombre de pixels supplémentaire toléré. Les styles calculés des éléments principaux rendus doivent être **strictement identiques**, sur les 54 combinaisons : couleurs, arrière-plan, bordures, polices, marges, espacements, dimensions, affichage, visibilité et opacité. Un élément qui apparaît ou disparaît fait échouer le contrôle. Les contrôles natifs transparents/masqués sont exclus, leurs déclencheurs visibles sont inclus.

Animations et transitions désactivées, polices chargées, focus et pointeur normalisés, facteur d’échelle fixé à 1. Les canevas animés (dont l’onde et les particules) sont neutralisés par le masque commun déjà utilisé dans la référence ; leur animation n’est pas certifiée par ces captures. Les sons sont contrôlés séparément par PCM. Si le bruit de rasterisation disparaît, le seuil d’image doit revenir à zéro.

## Résultats réels

| Contrôle | Résultat |
| --- | --- |
| Lint, format, types, empreintes | Réussis |
| Inventaire CI | 95 tests explicitement recensés ou exclus avec motif |
| Cliquet et contrôles négatifs | Réussis ; 1 895 → 1 849 priorités CSS, 110 affectations directes JS |
| Extraction des modules | 36 configurations identiques |
| Traduction | 360 états FR/EN/ES/DE/IT, persistance et débordements : réussis ; 45 captures de Préférences |
| Axe après correction des noms accessibles | 60 audits sans violation détectée ; contrôles incomplets à examiner manuellement |
| Contrôles numériques, navigation des morceaux, entraînement | Réussis |
| PCM | 25 banques strictement identiques à 44,1 et 48 kHz |
| Captures référence/candidat | 54/54 au seuil ; maximum 2/255 ; 50 strictement identiques, quatre avec bruit de faible amplitude |
| Styles calculés référence/candidat | 54/54 identiques, 7 551 éléments, zéro différence |
| Bruit référence/référence | 54 captures ; maximum 2/255 ; sept non strictement identiques ; styles strictement identiques sur 7 551 éléments |
| Production CI sur fa5323c | 14 contrôles réussis : MP3, Préférences, démarrage, CSP, 36 équivalences source/production et cinq langues hors ligne compris |
| CI de la dernière révision | En cours ; ne pas annoncer la phase validée avant tous les jobs verts |

Les valeurs de rendu ci-dessus proviennent des matrices locales `phase5-computed-final` et `phase5-noise-final`. La comparaison prend le maximum des différences RGBA sur toute l’image ; aucune moyenne ou franchise de pixels n’intervient. Les styles sont comparés indépendamment du résultat d’image.

## Décisions et limites

Les sondes isolées reproduisent les 16 écarts historiques lors du retrait seul des priorités (18 écarts > 2/255 au total). Les couches seules provoquent 37 écarts > 2/255. `@layer` est donc reporté ; les variables de thème restent hors couche. Aucune modification des grandes feuilles.

Le premier seuil strict 0/255 échouait aussi sur la référence elle-même ; l’utilisateur a explicitement retenu le seuil historique 2/255 avec le contrôle complémentaire strict des styles. Ce choix ne tolère aucun changement de style calculé d’un élément principal.

Les contrôles locaux de production ont rencontré des délais MP3 (180 s), Préférences (2 s) et démarrage (3 s), non reproduits dans le job CI de production réussi : https://github.com/renaxdrums/metronome/actions/runs/39247766980. Un premier build local précédait le dernier correctif de rayon ; la production a ensuite été reconstruite depuis les sources stabilisées. Les succès de production annoncés ici sont ceux réellement obtenus en CI.

Essais physiques Brave Android et casque Bluetooth non exécutables ici : maintien de l’écran, retour d’onglet et calibration sur les trois transports restent à contrôler selon `MAINTENANCE.md`. Les tests simulés ne remplacent pas ces essais. Les phases 3 et 4 ne font pas partie de cette branche. Ne pas fusionner ni passer à une autre phase avant CI entièrement verte.

## Essais S23 — 19 octobre 2026

Observations rapportées par l’utilisateur dans Brave sur la copie privée, Buds Bluetooth, économie d’énergie inactive : extinction automatique avec délai 15 s malgré la lecture, son continu ; impulsion répétée au verrouillage par bouton latéral ; quatre temps et particules visibles au réveil. Le réglage manuel +200 ms donne une synchronisation satisfaisante en métronome, Multipiste et Track avec/sans guide vocal, et reste après actualisation. La calibration de 31 frappes a proposé −58 ms sans amélioration : cause non déterminée. Wake Lock et calibration ne sont pas validés physiquement. Les drapeaux ES/DE/IT sont ajoutés à la demande.

La dernière CI sur `94e4333` compte 91/92 scripts réussis ; `direct-auth-ui-test.cjs` lit la position immédiatement après redimensionnement. L’attente de la position attendue est ajoutée, sans modification de l’interface. Les diagnostics Wake Lock/latence sont complétés pour isoler les anomalies physiques, sans changer la planification audio. Les résultats de cette nouvelle révision restent à vérifier.
