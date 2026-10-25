# Connexion et synchronisation : écart restant dans l’APK

Le site utilise le projet Firebase `renax-metronome`, la connexion Google ou
email et App Check reCAPTCHA Enterprise. La compilation de l’APK remplace
actuellement cette configuration par `null` et masque les commandes du compte.
L’ouverture du site externe ne synchronise pas les données locales de l’APK.
Ce comportement n’est pas une équivalence fonctionnelle avec le site.

Pour préparer une intégration Android native avec Google et App Check, il faut
la configuration publique Android du même projet (`google-services.json`).
Aucun fichier correspondant n’a été trouvé parmi les fichiers disponibles.
Ne fournir aucune clé privée de compte de service ou clé administrative.

Identité de l’application à enregistrer dans le projet existant :

- Package : `com.renaxdrums.metronome`.
- Certificat de signature RENAX conservé, SHA-256 :
  `59:5E:5C:26:0D:9E:1F:E7:AE:B2:08:B5:9C:FF:87:3C:28:EB:93:3F:56:F1:26:90:67:C1:98:78:C7:1E:AA:2A`.
- Les comptes et les données doivent rester dans le projet existant ; ne pas
  créer une seconde base ou modifier les règles de synchronisation au hasard.

Architecture à vérifier avant intégration : connexion via le fournisseur Google
natif, transmission des seuls justificatifs nécessaires au document HTTPS local
par le port d’origine vérifiée, session Firebase et règles de conservation
identiques au site. L’attestation App Check Android doit être configurée pour le
mode de distribution réel de l’APK ; le contrôle web reCAPTCHA ne doit pas être
simplement désactivé ou contourné.

Validation attendue : création/connexion email, Google, déconnexion, choix
« rester connecté », séparation des données entre comptes, premier import sans
écraser les données distantes, modification hors connexion puis synchronisation,
conflits et gestion des erreurs. La connexion Google réelle exige aussi un essai
avec consentement du titulaire du compte.

Tant que cette intégration et ces contrôles ne sont pas faits, la matrice native
conserve `cloud_account: not_implemented_in_current_apk` et ne revendique pas que
toutes les fonctions attendues sont validées.
