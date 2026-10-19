# Phase 4 — outillage et invariance stricte

La phase précédente est validée par la CI : 93/93 scripts nocturnes, production, audio, Firebase et compatibilité Chromium/Firefox/WebKit. La première exécution WebKit a subi un plantage du processus ; sa relance a réussi. Aucun test ni assertion n’a été exclu pour le contourner.

## Changements

- `tools/classic-script-globals.json`, son contrôle et ESLint : noms partagés explicites, ordre des 31 scripts applicatifs à la racine de la page contrôlé, `no-undef`, `no-unused-vars`, `no-empty` avec catch vides autorisés. Les déclarations lexicales publiques sont marquées `exported` ; les signatures conservées indiquent leurs paramètres inutilisés. Les appels de création DOM restent exécutés lorsque seule leur liaison était inutilisée.
- Sept fichiers stricts dans tsconfig.json ; cinq nouveaux fichiers annotés : local-backup.js, emergency-backup.js, midi-export.js, ui-feedback.js et numbox-controls.js. `types/globals.d.ts` décrit les frontières consommées ; les autres API restent inconnues. La déclaration web-vitals évite de contrôler la distribution tierce. Aucune émission de JavaScript et aucune conversion des scripts classiques.
- Tests : les références implicites aux identifiants HTML deviennent des sélecteurs explicites ; les fixtures ont leurs globales séparées. Le test d’outillage vérifie réellement les refus du lint et d’un payload de stockage mal typé. L’inventaire CI passe à 97 fichiers classifiés.
- Le seuil des 54 captures revient à zéro : le rendu complet élimine le bruit constaté précédemment. Aucun masque ni scénario n’est ajouté ou retiré.
- Build : les déclarations .d.ts ne sont pas copiées dans le site publié. Les sources lisibles restent à la racine. Les quatre grandes feuilles de thème sont inchangées.

## Résultats locaux avant CI

| Contrôle | Résultat réel |
| --- | --- |
| Lint renforcé, format, types stricts | Réussis, zéro erreur |
| Build, empreintes, budget, inventaire, build de production | Réussis ; 1 849 priorités CSS, 110 affectations directes de style, 97 tests classifiés |
| Captures et styles | 54/54 strictement identiques ; maximum 0/255 ; zéro différence de style |
| PCM | 25 banques identiques bit à bit à 44 100 et 48 000 Hz |
| Export MIDI | Quatre fichiers identiques à la référence ; limites des entrées validées |
| Secours IndexedDB | Récupération, CAS, portée, export de secours et API absente réussis |
| Contrôles et éditeur | Clavier/zoom/dialogues et édition rythmique réussis |
| Contrôles négatifs lint/types et inventaire | Réussis |
| Revue du moteur | AST des trois scripts audio identique, à l’exception des noms de liaisons inutilisées ; calculs et appels inchangés |
| Revue des thèmes | Quatre fichiers protégés identiques octet par octet |

La sélection initiale de huit scripts a passé sept contrôles ; le huitième, Firebase local, n’a pas pu lancer Chrome dans cet environnement (socket Unix interdit). La relance avec le même Chromium headless utilisé par les autres tests a réussi : corruption, quota, récupération, matrice de métriques, Start/Stop, accents et sauvegarde mobile/bureau validés, sans modifier le test. Le test complet de production et la CI de cette phase restent à confirmer dans la pull request ; les résultats d’une révision précédente ne valent pas validation de cette révision.

## Essais physiques

Les validations S23/Brave/Buds du maintien de l’écran pendant les trois transports, de la libération après Stop et du décalage Bluetooth fixe de 200 ms restent celles réalisées avec l’utilisateur. Aucun nouvel essai physique n’a été exécuté pour cette phase statique. L’impulsion signalée lors du verrouillage par bouton latéral n’est pas déclarée corrigée. Aucune détection automatique Bluetooth n’est revendiquée.

## Mini-plan de vérification après publication

1. Ouvrir les six modules dans les trois thèmes ; vérifier les réglages au clavier et la fermeture des Préférences par la roue dentée.
2. Activer « Casque Bluetooth » : vérifier les 200 ms supplémentaires, puis actualiser pour confirmer la mémorisation ; désactiver sur haut-parleur ou casque filaire.
3. Créer, exporter puis réimporter une copie locale d’un morceau et tester la lecture.
