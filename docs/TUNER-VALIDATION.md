# Accordeur et accueil des outils

Périmètre : accueil après l’introduction existante, Métronome avec ses six espaces
inchangés, Accordeur autonome, liens directs `?tool=metronome`, `?tool=tuner` et
`?tool=home`. La bascule conserve les objets musicaux en mémoire et arrête l’audio
ou la capture. Les liens de playlist entrants conservent leur destination.

## Mesure

Implémentation indépendante de la méthode NSDF de McLeod et Wyvill, FFT de
l’autocorrélation, normalisation par l’énergie et interpolation à sept points.
Référence : https://www.cs.otago.ac.nz/graphics/Geoff/tartini/papers/A_Smarter_Way_to_Find_Pitch.pdf
Aucun code ni préréglage propriétaire de Peterson ou Sonic Research n’est repris.
La visualisation de dérive est calculée à partir de l’écart mesuré : elle ne
reproduit pas le stroboscope analogique d’un accordeur matériel.

Le calcul est effectué dans un Worker local, à partir d’une fenêtre de 8192
échantillons et au plus une analyse simultanée. La médiane et le lissage sont
réinitialisés lors d’un changement de note. Une absence de mesure fiable retire
l’indication de justesse. L’enregistrement et l’envoi de son sont absents.

1840 mesures synthétiques à 44,1 et 48 kHz couvrent sons purs, harmoniques,
fondamentales faibles, décroissance, composante continue et bruit. Un balayage par quarts de demi-ton, de 12,7 à 5390 Hz, complète les fréquences musicales. Les assertions
portent sur l’erreur en cents et l’absence de faux positifs pour silence, bruit
seul, signal trop faible et données invalides. Les résultats détaillés sont
produits dans `tuner-measurements.json` par le test.

La précision numérique testée ne constitue pas une garantie de précision du
microphone, de l’horloge audio ou d’un instrument acoustique. Les contraintes de
suppression du bruit, gain automatique et annulation d’écho sont demandées au
navigateur ; leur respect dépend du périphérique.

## Réglages

- La4 : 340–540 Hz par pas de 0,1 Hz, champ et curseur synchronisés, raccourcis
  440 et 442 Hz.
- Tempéraments égal, juste à 5 limites, pythagoricien, mésotonique au quart de
  comma et personnalisé. Les préréglages conservent La4 comme référence. Les
  écarts personnalisés s’appliquent explicitement à chacune des douze notes.
- Chromatique, note verrouillée, instruments à cordes, accordages alternatifs et
  notes personnalisées ; transposition écrite indépendante de la fréquence réelle.
- Référence sinusoïdale de niveau modéré, limitée à 15 secondes ; microphone
  arrêté pendant son émission. Seuil d’entrée et tolérance de justesse réglables.
- Réglages locaux persistants. Aucune capture ne redémarre sans action explicite.

## Vérifications automatiques

Le test d’interface injecte un WAV La440 par le périphérique factice du navigateur
et traverse le véritable chemin MediaStream → Analyser → Worker → interface.
Il vérifie le changement de diapason, les instruments et tempéraments, la
persistance, Retour/Suivant, les objets du Métronome, les refus d’accès et une
permission qui arrive après avoir quitté l’outil. Seize combinaisons de thèmes et
de dimensions contrôlent les débordements ; les vues PC et téléphone passent
également un audit Axe. Les résultats et captures sont générés sous `tests/results`.

Les suites existantes restent ciblées sur le Métronome via le banc de test partagé.
`start({tool:null})` teste l’entrée générale réelle et son accueil.

## Vérification manuelle restante — PC et Samsung S23

1. Ouvrir l’accueil, entrer dans chaque outil et tester Accueil, bascule, Retour
   et les deux liens directs. Vérifier les quatre thèmes en portrait et paysage.
2. Autoriser le microphone et jouer une note tenue, puis plusieurs cordes et une
   note grave. Comparer avec une source externe étalonnée, dans une pièce calme.
3. Choisir 442 Hz puis une valeur décimale au champ et au curseur. Changer de
   tempérament et de tonique ; vérifier que les cibles correspondent au réglage.
4. Arrêter, quitter l’Accordeur, changer d’application et débrancher le microphone
   éventuel : vérifier que l’indicateur de capture du navigateur disparaît.
5. Revenir au Métronome et vérifier le morceau, le tempo et la lecture déjà utilisés.
