# Revue de sécurité avant publication commerciale — 24 novembre 2026

Base vérifiée : `main` à `481078407c48e5e8af65c2e154512172b69ae916`.
Cette PR prépare des protections ; elle ne constitue pas une autorisation de publier.

## Modifications proposées

- Le pont d'export Android vérifie l'espace disponible dans le cache privé avant
  le transfert et pendant chaque bloc. Il conserve une réserve pour le système,
  abandonne un transfert inactif après 60 secondes et un transfert après 24 heures.
  Il nettoie les fichiers temporaires à l'annulation, à l'erreur et après copie,
  ainsi que les fichiers abandonnés de plus de 24 heures au démarrage. Le délai
  ne s'applique pas pendant le choix de la destination Android.
- La WebView n'autorise plus les domaines de polices inutilisés et limite les
  chemins jsDelivr aux trois dépendances figées utilisées par les voix. Les
  modèles Hugging Face restent distants ; leurs redirections et le chargement
  dynamique doivent être contrôlés sur appareil réel avant publication.
  Le build Android applique une CSP dédiée qui retire les origines Firebase et
  Google et interdit les cadres et images distantes.
- La signature Android échoue si un seul des deux fichiers de signature est
  présent. La création d'une nouvelle identité exige `-CreateSigningKey`.
  La clé et son mot de passe protégé restent exclus de Git.
- Les actions GitHub des workflows existants sont figées sur des SHA vérifiés.
  Un workflow distinct analyse le code avec CodeQL, l'historique avec Gitleaks
  et les dépendances verrouillées avec `pnpm audit`, y compris ONNX Runtime Web.

## Constatations conservées et limites

- L'import JSON actif refuse les fichiers de plus de 5 Mo avant lecture et
  valide la structure avant insertion. Les samples audio sont limités à 30 Mo
  avant décodage. Une taille compressée ne borne pas la mémoire après décodage :
  un essai isolé avec fichier audio malformé reste nécessaire.
- Le partage public est accessible par un UUID v4 de 128 bits, dont 122 aléatoires,
  généré par `crypto.randomUUID`. Les règles refusent la liste anonyme et les écritures
  d'autres comptes. Un lien connu donne accès à son contenu jusqu'à révocation.
- Les règles Firestore refusent la suppression physique des sauvegardes, de leur
  historique et des partages. Un mécanisme d'effacement complet côté serveur,
  avec vérification d'identité et nettoyage des sous-collections, est nécessaire
  avant de promettre la suppression définitive des données ou du compte.
- La configuration App Check côté client ne prouve pas l'application serveur.
  Vérifier `Enforced` pour Firestore dans la console et constater le rejet d'une
  requête non attestée sur un projet de test. Ne pas provoquer de charge sur le
  site public.
- Les dépendances exécutables du moteur neuronal et les modules Firebase web
  restent chargés à distance. Les révisions sont figées, mais l'intégrité des
  imports dynamiques n'est pas cryptographiquement vérifiée. L'embarquement local
  requiert la validation des workers WebView et du mode hors ligne musical.
- Aucun secret administratif ni clé de signature n'apparaît dans les noms de
  fichiers suivis ou ajoutés dans l'historique inspecté. Cela ne remplace pas une
  analyse de contenu Gitleaks complète, qui est ajoutée en CI.

## Publication Google Play : contrôle séparé

- Le build actuel cible l'API 35 et ne produit qu'un APK. Google Play exige
  l'API 36 pour une nouvelle application et les mises à jour depuis le
  31 août 2026, ainsi qu'un AAB pour une nouvelle application. La migration
  API 36/AAB doit être testée sur Android et avec Play App Signing avant envoi.
- Confirmer dans Play Console l'identité de signature et la clé d'envoi, la
  déclaration Data safety, la politique de confidentialité, la fiche de
  suppression de données et les exigences de test du compte développeur.
- Le coffre de signature local doit être sauvegardé séparément, chiffré et avec
  contrôle d'accès. Ne jamais copier les fichiers de signature dans une PR ni
  dans un paquet de récupération de code.

Sources officielles :

- https://support.google.com/googleplay/android-developer/answer/11926878
- https://developer.android.com/guide/app-bundle
- https://support.google.com/googleplay/android-developer/answer/9842756
- https://support.google.com/googleplay/android-developer/answer/10144311
- https://firebase.google.com/docs/app-check/enable-enforcement

## Vérifications réalisées

- Compilation de `MainActivity.java` contre `android-35/android.jar` : réussite.
- `android/test-apk-assets.ps1` : réussite.
- Vérification de syntaxe des scripts du pont Android et du build de production :
  réussite.
- L'installation verrouillée a réussi avec le magasin de certificats Windows.
  Les vérifications locales de robustesse et de rendu du texte importé ont réussi.
  Le test manuel du sélecteur MP3 Windows n'a pas trouvé le fichier attendu.
- Sur le premier commit de la PR, les suites production, compatibilité des
  navigateurs, Firebase isolé, compatibilité neuronale et suite complète ont
  réussi. CodeQL, Gitleaks et l'empaquetage Android ont réussi. Android 15 et 16
  ont échoué sur le même test de navigation portrait, avec un onglet Multipiste
  inaccessible au toucher du banc de test. Le job Android 14 a été annulé.
- L'audit npm du premier commit a signalé deux alertes élevées. Les versions
  verrouillées de `@grpc/grpc-js` et `body-parser` ont été corrigées. Le nouvel
  audit au seuil élevé passe et compte quatre alertes modérées restantes.
- MobSF et le comportement Android sur téléphone physique restent à vérifier.

Avant fusion, examiner les résultats de la CI de cette PR, le statut CodeQL
par défaut du dépôt pour éviter une analyse doublonnée, et exécuter les essais
Android d'export long, manque d'espace, interruption et voix neuronales.
