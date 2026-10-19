# Phase 3 — sécurité et publication

Périmètre : constante partagée des trois racines jsDelivr versionnées ; CSP restreinte dans le seul build de production ; archive HTML et songs.js exclus de dist/site mais conservés au dépôt ; deux confirmations cloud remplacées par un dialogue accessible traduit dans les cinq langues, avec garde contre les changements de compte/bibliothèque pendant l’attente. Aucun son, moteur audio ou grande feuille de thème modifié.

BACKUP.md a été lu avant exclusion. Il décrit une archive, tandis que la récupération de la source historique est effectuée par le code actuel. Recherche des consommateurs : songs.js n’est chargé que par index-legacy.html.

Contrôles : lint, format, types, empreintes, budget et registre des tests ; nouveau test de dialogue ; production CSP/guide vocal enregistré et mode hors ligne avec 404 de l’archive ; suite complète en CI et Firebase. Les résultats réels finaux sont consignés dans la PR afin de ne pas relancer les workflows pour une seule mise à jour de résultat. Les modèles neuronaux non installés ne sont pas déclarés testés ; les chemins restent ceux des versions explicitement demandées.
