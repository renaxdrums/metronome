# RENAX Métronome — audit des thèmes

Référence : **Citron**, nouveau nom de Meixs. Base examinée : `5f38edf6fec6399f8d8b89f20428290f568e1d32`.

## Défauts et écarts confirmés dans les sources

| Point | Sombre | Clair | Ivoire | Citron | Traitement demandé |
| --- | --- | --- | --- | --- | --- |
| Fermer les paramètres et ouvrir un onglet en un clic | Bloqué par `inert` et le filtre de thème | Même défaut | Même défaut | Déjà autorisé | Étendre le comportement Citron aux quatre thèmes, y compris le passage du clic à travers le fond de la fenêtre |
| Espace entre onglets sur smartphone | 5 px | 5 px | 7 px ; 4 px sur écran peu haut | 3 px ; fond anthracite continu | 5 px dans les quatre thèmes ; fond beige visible entre les boutons Citron |
| Nom du thème dans les préférences | — | — | — | Meixs | Afficher Citron sans changer l'identifiant sauvegardé |
| En-tête sur smartphone | Renax Drums | Renax Drums | Renax Drums | Renax Drums | Afficher Métronome à côté du logo ; conserver le texte PC |
| Clic 1 du séquenceur circulaire | Palette propre au thème | Palette propre au thème | Palette propre au thème | Turquoise | Anthracite avec chiffre jaune citron ; Clic 2 citron et Clic 3 orange |
| Particules et traînée circulaire | Couleurs existantes | Couleurs existantes | Couleurs existantes | Cyan | Citron pour le Clic 1 et la traînée ; préserver les autres thèmes et la polyrythmie |

Le défaut des paramètres vient de trois restrictions concordantes : `isMeixs()` pour le mode non modal, le même filtre pour la fermeture extérieure, et `pointer-events:none` réservé au fond Meixs. Enlever seulement le filtre de fermeture ne suffit pas : les onglets des autres thèmes restent inaccessibles.

L'essai sur la version construite a aussi confirmé un chevauchement PC : le titre de la fenêtre des paramètres recouvrait l'onglet Multipiste dans la navigation horizontale. La fenêtre est maintenant placée sous la barre uniquement lorsqu'elle la recouvrirait ; la navigation latérale Ivoire conserve sa disposition. Le positionnement est recalculé à l'ouverture, au changement de thème et au redimensionnement.

## Règles de tempo validées

Dans un bloc à 120 BPM avec une courbe linéaire, choisir 84 BPM en arrivée doit conserver 84 et sélectionner la descente linéaire. Choisir ensuite 150 sélectionne la montée linéaire. Une inversion automatique déclenche trois brèves surbrillances du sélecteur ; avec la préférence de mouvements réduits, un contour fixe temporaire remplace l'animation.

Les dix autres courbes restent choisies manuellement. Les limites 2–999 BPM et la protection existante contre des tempos égaux restent en place. Le nombre de mesures et le calcul des durées ne changent pas.

## Étude complémentaire, sans correction automatique

- Dans les captures à 390 px, Ivoire présente des icônes Sauvegarde/Playlist et des points extérieurs de polyrythmie nettement plus pâles que Citron. C'est un point de lisibilité à revoir ; aucune nouvelle palette n'est appliquée dans cette étude.
- Dans Citron, les miniatures des mesures du Séquenceur utilisent encore la couleur historique du Clic 1, alors que le séquenceur circulaire adopte l'anthracite demandé. L'alignement éventuel des miniatures reste une décision distincte.
- Ivoire conserve un sélecteur secondaire Visualisation/Mesures visible dans la vue Métronome, contrairement aux trois autres captures. C'est un écart de présentation, pas un blocage fonctionnel démontré.
- Les couleurs des particules sont codées dans le canvas séparément des couleurs CSS des clics. Hors de Citron, une palette CSS et une particule peuvent donc différer ; vérifier visuellement avant de décider d'un changement.
- La wave de l'en-tête Citron utilisait une opacité de 0,52, du gris et le mode de fusion `screen`. Son opacité passe à 0,85 à la demande de l'utilisateur ; la forme, la vitesse, le dégradé et les autres thèmes restent inchangés.
- Les différences de palette, de bordures et de style propres à chaque thème ne sont pas assimilées à des bugs. La comparaison porte sur l'accès aux mêmes commandes, la navigation, les états sélectionnés, les débordements et la lisibilité.

## Vérification

Le scénario `tests/theme-navigation-test.cjs` couvre les quatre thèmes, les six espaces de travail et les vues 320, 390, 834 et 1440 px, dont une vue de 600 px de haut. Il produit les captures de l'étude et un rapport JSON. Les confirmations natives doivent rester modales ; les paramètres deviennent non modaux dans tous les thèmes.

Les contrôles de production, compatibilité des navigateurs, audio et Firebase doivent tous réussir avant fusion. Les comparaisons visuelles conservent leur seuil strict ; seules les modifications d'en-tête et d'espacement explicitement demandées sont normalisées dans la référence.

Vérifications déjà obtenues : syntaxe JavaScript, absence d'erreurs de diff, versions des ressources et cache ; calculs des douze courbes ; parcours des six espaces dans les quatre thèmes sur PC et mobile ; bascule linéaire dans les deux sens, maintien des courbes manuelles et sauvegarde. Les captures à 390 px ont été examinées pour les six espaces. Firebase et la compatibilité des navigateurs sont réussis sur la version fonctionnelle ; les contrôles exhaustifs de la dernière révision restent à suivre dans la [PR #56](https://github.com/renaxdrums/metronome/pull/56). Aucun essai sur téléphone physique.

## Mini-plan de test manuel

1. Dans chacun des quatre thèmes, ouvrir les paramètres puis toucher directement Track et Métronome : la fenêtre doit se fermer et l'onglet choisi s'ouvrir au premier appui.
2. Sur smartphone, comparer les espaces entre les six onglets ; vérifier les cinq pixels et le fond beige dans Citron, puis passer en paysage.
3. Dans Track, essayer 120 → 84 puis 120 → 150 avec une courbe linéaire ; vérifier le sens, les trois surbrillances, la sauvegarde après rechargement et les exports MP3/MIDI.
4. Dans Citron, vérifier les trois clics, les chiffres, le contour du temps joué et les particules ; comparer ensuite les trois autres thèmes et la polyrythmie pour confirmer leur conservation.
