# Phase 5 — validation bloquée au seuil visuel strict

Référence : `396287e3a921891b27e608f2e5f363091b5fe1c7` (phase 2). Aucun changement dans les quatre grandes feuilles de thème, ni dans les trois scripts audio protégés. Aucun déploiement ni fusion.

## Changements

- Extraction des styles HTML et du style du sélecteur de langue, en conservant leur position dans la cascade.
- Petites feuilles : 82 priorités avant, 46 retirées, 36 conservées et commentées. Inventaire complet et concurrents : `CSS-MIGRATION.md` et `tools/important-exceptions.json`.
- Cliquet : 1 895 → 1 849 priorités CSS (les 98 déplacées du HTML sont comprises), 110 affectations directes JS. Le budget ne peut pas augmenter, même avec `--update`.
- Dimensions des sélecteurs d’entraînement exprimées par variables de repli ; séparation du dimensionnement et du rayon de bordure afin de préserver la cascade mobile.
- Cinq langues intégrées hors ligne, traduction des libellés dynamiques de navigation et noms accessibles des boutons de langue.
- Test multilingue sur cinq langues ; contrôles négatifs du cliquet et des commentaires/concurrents ; diagnostic séparé du retrait des priorités et des couches.

## Résultats réellement obtenus

| Contrôle | Résultat |
| --- | --- |
| Lint, format, types, empreintes | Réussis |
| Inventaire CI | 95 tests recensés explicitement ou exclus avec motif |
| Cliquet et ses tests négatifs | Réussis |
| Extraction des modules | 36 configurations identiques |
| Traduction | 360 états, cinq langues, persistance et débordements : réussis ; 45 captures de Préférences |
| Axe après correction des noms accessibles | 60 audits, aucune violation détectée ; contrôles incomplets à examiner manuellement |
| Contrôles numériques, navigation des morceaux, entraînement | Réussis |
| PCM | 25 banques strictement identiques à 44,1 et 48 kHz |
| Captures finales | 45/54 strictement identiques ; 9/54 avec un maximum de 1 ou 2/255 ; aucun écart > 2 ; échec au seuil 0/255 |
| Production | En cours ; premier passage interrompu au délai de 180 s du test de niveau MP3, relancé |
| CI de la branche | À lancer sur la PR en brouillon ; aucune validation CI verte annoncée |

## Cause des écarts

Les sondes contrôlées et leurs résultats sont détaillés dans `CSS-MIGRATION.md`. Les couches seules provoquent des différences ; `@layer` est donc reporté. La sonde de retrait seul reproduit les 16 cas historiques et deux autres. Les corrections internes n’exigent pas de modifier les grandes feuilles.

Le contrôle a été durci de 2/255 à 0/255. Une comparaison de la référence avec elle-même produit déjà 1/255, puis 2/255 même après trois captures préalables. Aucun style calculé ne diffère dans ces deux essais. Le bruit de rasterisation est donc observable indépendamment des modifications. Le seuil n’a pas été relâché : une capture non identique reste en échec et la phase ne peut pas être déclarée validée.

## Limites

Essais physiques Brave Android et casque Bluetooth non exécutables dans cet environnement : maintien de l’écran, retour d’onglet et calibration sur les trois transports restent à contrôler selon `MAINTENANCE.md`. Les tests simulés ne remplacent pas ces essais. Les phases 3 et 4 ne font pas partie de cette branche.

Les différences de contour du sélecteur de durée (23 à 27/255 au passage précédent) ont disparu après séparation des règles de hauteur et de rayon de bordure. La dernière matrice conserve une différence de police calculée sur un select natif masqué du séquenceur ivoire ; les deux contrôles visibles restent identiques hors bruit de faible amplitude. Aucun écart résiduel ne doit être présenté comme un succès au seuil zéro.
