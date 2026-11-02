# Partage des playlists RENAX — périmètre et validation

## Contrat d'utilisation

- Dans la vue **Playlists**, l'icône de partage crée ou retrouve un lien de playlist.
- Le créateur doit être connecté au compte RENAX (Firebase Auth) pour publier et maintenir un lien ; il n'est **jamais** obligé de se connecter pour utiliser le métronome.
- Le destinataire peut choisir **local**, sans compte, ou sa session RENAX connectée. La playlist reçue est ajoutée à côté des playlists existantes, en lecture seule.
- Réouvrir le même lien ne crée pas de doublon : identifiant stable `shared_<token>`.
- Les modifications du créateur sont publiées sur la même ressource. Les copies abonnées sont actualisées en ligne ; la dernière copie locale reste utilisable hors connexion.
- Toute application d'une mise à jour est différée si le métronome joue ou si un champ est en cours d'édition.
- Le créateur peut désactiver un lien ; cela coupe son accès et ses mises à jour, sans supprimer les copies déjà reçues.
- Pas de messagerie, pas d'Ableton Link, pas de modification du moteur audio.

## Sécurité et confidentialité

Les documents `playlistShares/<32 hex>` contiennent uniquement une playlist choisie, **jamais** une sauvegarde complète du compte. Le jeton dans le fragment de l'URL est un secret de possession : **toute personne à qui le lien est transmis peut lire cette playlist**, et le retransmettre. Une règle Firestore autorise `get` sur un jeton exact et interdit de parcourir toutes les playlists ; les propriétaires authentifiés peuvent lister uniquement leurs partages via une requête filtrée `ownerUid` et limitée à 200 éléments. Les documents privés `users/*` et leurs règles demeurent inchangés.

Les données distantes passent par la validation `RENAX_SONGS.validateLibrary` avant insertion. La sauvegarde locale est écrite et contrôlée avant toute modification du modèle affiché. Les imports reçus n'écrasent aucune playlist indépendante.

**Attention :** ce mécanisme n'est pas un accès réservé aux seuls membres d'un groupe. Révocation nécessaire si le lien circule au-delà des destinataires souhaités.

## Dépendance de déploiement

Le **nouveau fichier `firestore.rules` doit être vérifié et déployé sur le projet Firebase** avant d'activer le partage dans la version publique. Un déploiement GitHub Pages seul ne suffit pas. Ne pas déployer les règles sans les essais émulateurs et un contrôle des coûts/quotas sur l'offre Spark. Aucune modification de facturation n'est nécessaire ou autorisée par ce travail.

## Plan de test de recette

1. Tests du modèle `tests/playlist-sharing-test.mjs` : structure exacte (sections, accents, tempos, guide vocal), ajout, relecture du lien sans doublon, mise à jour isolée et refus de contenus invalides.
2. Émulateurs Firebase : création et modification seulement par le propriétaire, lecture du document par un invité, interdiction des listes anonymes et de la lecture d'autres comptes, désactivation du lien.
3. Deux navigateurs distincts : créateur connecté, destinataire local puis destinataire connecté. Ajouter plusieurs playlists personnelles et vérifier qu'aucune n'est modifiée.
4. Modifier un tempo, une section et le nom d'un morceau côté créateur ; vérifier la réception sur un autre téléphone sans nouvel import.
5. Pendant la lecture d'un morceau et pendant une saisie, publier une mise à jour : aucune interruption, aucune perte de saisie ; application à l'arrêt.
6. Couper Internet et rouvrir RENAX : dernière playlist reçue conservée ; rétablir le réseau et vérifier la reprise.
7. Ouvrir deux fois le lien puis se connecter après une réception locale : aucun doublon. Tester le lien révoqué.
8. Vérifier les quatre thèmes, les cinq langues, formats ordinateur et mobile, clavier et lecteur d'écran.
9. Exécuter `pnpm build`, `pnpm check:assets`, `pnpm check:tests`, `pnpm lint`, `pnpm test`, `pnpm test:rules`, `pnpm build:production`, `pnpm test:production` et les comparaisons audio PCM 44,1/48 kHz.

## État

Implémentation proposée en PR isolée. Les contrôles physiques, la validation complète des tests et le déploiement effectif des règles Firebase ne sont **pas certifiés** par cette PR. Ne pas fusionner en production avant leur validation.
