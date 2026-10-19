# Sauvegarde du métronome principal

Le 7 octobre 2026, à la demande de l'utilisateur, la version validée d'Index 2 devient la page principale `index.html` (Index 1). L'ancienne page est conservée dans `index-legacy.html`. `index2.html` redirige vers la page principale pour préserver les liens existants. Les scripts, clés de stockage, comptes Firebase, règles et données restent identiques ; aucun déplacement ni nouvelle migration des sauvegardes.

## Périmètre et audit

L'ancienne page principale est désormais archivée dans `index-legacy.html`. Le moteur de la version validée, `songs.js`, `midi-export.js`, `song-export.js`, `mp3-export.js` et les styles existants sont conservés. L'export MIDI était déjà opérationnel et n'a pas été recréé. La page principale charge la copie isolée `songs-index2.js`, le stockage local et la synchronisation facultative. Le modèle musical reste version 1 : profils, morceaux, sections, signatures, tempo, subdivisions et états de clic. La playlist est la liste des morceaux du profil. Le séquenceur de travail n'était pas une bibliothèque persistante : cette intégration conserve ce périmètre et n'invente pas de conversion du séquenceur.

## Fonctionnement

Sans compte, les modifications des profils et morceaux restent dans ce navigateur ; aucun SDK Firebase n'est chargé. La source historique `renax-drums-songs-v1` est copiée et conservée intacte. Une sauvegarde locale complète et la file d'attente sont enregistrées ensemble dans `renax-index2-store-v1:guest` ou `renax-index2-store-v1:user:UID`. Une erreur de quota ou un JSON illisible est signalé et ne remplace pas la source. Un autre onglet ayant écrit la même bibliothèque empêche l'écrasement silencieux : exporter sa copie puis recharger.

La connexion est facultative, avec e-mail/mot de passe ou Google seulement. Facebook est exclu. Vérification d'adresse et réinitialisation utilisent Firebase Auth. Une adresse existante liée à un autre fournisseur impose une connexion par ce fournisseur puis une liaison explicite Google ; aucune fusion automatique. Auth utilise la persistance de session par onglet ; Firestore son cache mémoire. La bibliothèque du compte demeure locale, distincte de la bibliothèque sans compte et des autres comptes. À la première connexion, aucun catalogue vide ne remplace le serveur. L'import des morceaux sans compte exige une confirmation et conserve la source. Le JSON demeure un export indépendant ; son import affiche les quantités et ajoute sans remplacer les profils existants.

L'interface appelle maintenant les regroupements de morceaux « playlists ». Le choix, la création avec nom libre et le renommage sont dans la vue Playlist ; la structure interne `profiles` et ses identifiants sont conservés pour éviter une migration des données. Les anciens morceaux restent dans leur playlist d'origine. Le nom par défaut « Mon profil » est affiché comme « Mes morceaux », sans modifier sa valeur enregistrée. Quand un compte est connecté, la copie JSON est repliée dans Options du compte ; en mode sans compte elle reste directement visible. Les boutons Retour de Sauvegarde, Playlist et morceau partagent une icône orange et une taille de 96 × 36 px sur PC, 96 × 44 px sur mobile. Le panneau Réglages utilise une barre de défilement sombre. En 3/8, seul le premier carré est agrandi graphiquement ; les trois unités, états de clic et durées sont conservés.

Le statut « Synchronisé » exige une lecture serveur et la confirmation des écritures, sans conflit ni file restante. Une connexion annulée, une panne ou un quota ne signifie jamais une synchronisation réussie. Pendant la lecture audio, la synchronisation et l'application distante attendent l'arrêt ; aucune tâche n'est ajoutée au scheduler.

## Modèle distant et sécurité

Chemins : `users/UID/records/ID` et `users/UID/records/ID/history/REVISION`. Catalogue, profils et morceaux ont des enregistrements distincts. Chaque enregistrement contient schéma 1, révision, JSON musical, marqueur de suppression, identifiant d'opération, appareil et horodatage serveur. Chaque transaction compare la révision attendue et écrit atomiquement la nouvelle révision et son historique. Deux modifications concurrentes d'un morceau sont conservées dans un conflit local jusqu'au choix explicite appareil/en ligne ; aucune politique « dernier arrivé gagnant ». Les suppressions sont des tombstones, pas des effacements physiques ; une modification hors ligne face à une suppression demande un choix, sans résurrection silencieuse.

Les règles refusent les anonymes et tout accès à un autre UID ; elles imposent les champs, types, tailles, temps serveur, progression de révision, écriture atomique de l'historique et son immutabilité. Elles refusent les suppressions physiques. Le JSON musical imbriqué est validé par le client avant application : les règles valident l'enveloppe, mais ne parsèment pas le JSON. Un utilisateur authentifié peut donc écrire un JSON invalide dans son propre espace avec un client modifié ; l'application le refuse, et cela n'autorise aucun accès à un autre compte. Les transactions sont atomiques par élément, pas par bibliothèque entière. Les conflits sur catalogue/profil sont également explicites.

Aucune purge automatique : décision utilisateur validée le 7 octobre 2026. Le bouton Historique/restaurer a été retiré de l'interface à sa demande ; les révisions distantes demeurent conservées et les règles de sécurité inchangées. Des exports JSON restent nécessaires pour une copie indépendante du service et du navigateur. La gestion des playlists est dans Playlist ; la copie JSON est dans Options du compte lorsque connecté, et Retour reste au-dessus. Cette correction concerne uniquement la présentation et conserve les callbacks de synchronisation et d'enregistrement.

## Configuration externe

Projet `renax-metronome`, base `(default)` en Belgique `europe-west1`. La région est définitive. E-mail/mot de passe et Google activés dans Authentication. **Spark uniquement, sans facturation** : ne pas activer Blaze, sauvegardes gérées, PITR, TTL, Cloud Functions, Storage ou service payant. Aucune clé administrative ni secret OAuth dans le dépôt ; la configuration Web Firebase est publique.

Règles `firestore.rules` publiées le 7 octobre 2026 après validation utilisateur. Le domaine `renaxdrums.github.io` est autorisé dans Auth ; la politique un compte par adresse est vérifiée. Tester Google avec un compte réel dans le navigateur utilisateur. App Check reste désactivé faute de configuration validée : sa clé est `null`, aucune facturation reCAPTCHA Enterprise activée. Les tests émulateurs ne prouvent pas une connexion Google réelle ni la délivrabilité d'e-mails de production. Ne pas annoncer une synchronisation de production avant une confirmation serveur réelle.

## Quotas et coût : aucun service payant

Au 7 octobre 2026, les quotas Firestore gratuits publiés sont : une base gratuite, 1 Gio stocké, 50 000 lectures/jour, 20 000 écritures/jour, 20 000 suppressions/jour et 10 Gio sortants/mois. Voir [quotas Firestore](https://firebase.google.com/docs/firestore/quotas). Sur Spark, le dépassement bloque le service plutôt que d'activer une facturation ; le travail local et la file persistent.

Chaque révision modifiée produit 2 écritures (élément et historique), plus les métadonnées effectivement modifiées. Exemple indicatif : 100 personnes, 20 changements de morceaux chacune par jour = au moins 4 000 écritures/jour. Chaque synchronisation relit tous les éléments, plus les lectures de transaction, des abonnements et les lectures nécessaires aux règles ; avec 100 éléments par compte, cet exemple peut dépasser 200 000 lectures/jour et donc le quota gratuit. Il ne faut pas promettre que l'usage restera toujours sous quota. Le debounce de 900 ms regroupe les changements rapprochés ; aucun autosave n'est branché sur les événements de clic audio.

Le petit morceau du test représente 245 octets de payload, la bibliothèque 290 octets ; ce n'est pas un morceau réaliste volumineux ni une mesure de coût de stockage Firestore. 100 utilisateurs × 100 morceaux × 100 historiques × 10 Ko donnent environ 10 Go de payload, au-delà du quota ; l'absence de purge fera croître le stockage. Les limites individuelles de payload sont 800 000 caractères et l'import JSON 5 Mo ; le navigateur a aussi son propre quota. Consulter [limites Auth](https://firebase.google.com/docs/auth/limits) pour les créations de comptes et e-mails. Les quotas peuvent évoluer : vérifier la console avant une montée d'usage, sans activer de paiement.

## Validation reproductible

Node, Java 21 et Chrome ; installer les dépendances de `tests/firebase/package.json` à partir du lockfile. Les tests utilisent uniquement `demo-renax-backup` et des adresses `example.test`, jamais le projet réel.

```text
node tests/firebase/core.test.mjs
node tests/firebase/local.test.mjs
firebase emulators:exec --only firestore,auth --project demo-renax-backup "node tests/firebase/rules.test.mjs && node tests/firebase/browser.test.mjs"
```

Tests exécutés : migration et source conservée, absence de transmission anonyme, quota local et corruption, reprise hors ligne après rechargement, deux appareils, conflit concurrent, suppression contre édition hors ligne, choix des versions, restauration, séparation invités/comptes, règles anonymes/A/B, immutabilité et atomicité. La matrice 4/4, 3/4, 5/4, 6/4, 3/8, 6/8, 9/8, 12/8, 15/8, 18/8, 6/16, 12/16 et Start/Stop/accents est vérifiée en navigateur. Les exports et le moteur sont contrôlés par absence de modification ; aucune mesure de latence matérielle n'est revendiquée. Tests Google réels, annulation de sa fenêtre et quotas Firebase réels restent à vérifier sur le projet configuré, sans générer volontairement des dépenses ni dépasser ses quotas.

## Archive et production

`index-legacy.html` et `songs.js` sont conservés uniquement comme sources historiques dans le dépôt ; le build de production les exclut. La restauration des anciennes données ne dépend pas de cette page : `local-backup.js` conserve et lit la clé `renax-drums-songs-v1`, puis le validateur actuel contrôle son contenu. La copie historique demeure intacte ; aucune donnée de navigateur ni de compte n’est retirée. `index2.html` conserve sa redirection vers l’interface actuelle.
