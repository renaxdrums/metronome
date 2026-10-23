# Protection du métronome

La lecture, le tempo et les clics musicaux restent locaux et sans limitation de
fréquence. Les limites concernent les données importées et la sauvegarde cloud.

## Sauvegarde distante

Les règles Firestore séparent les comptes, vérifient les champs, les révisions,
les horodatages serveur et l’historique atomique. Chaque charge utile est limitée
à 800 000 caractères. Le nouveau budget impose au serveur un maximum de **120
opérations de sauvegarde par compte et par fenêtre de 60 secondes**. Une opération
écrit un élément et son historique, avec une autorisation liée à cet élément et
à son identifiant d’opération. Une seule autorisation ne permet pas de modifier
plusieurs éléments. Les modifications refusées restent dans la file locale.

Le client compatible est publié avant les règles renforcées. Les anciennes règles
refusent la lecture du nouveau document d’autorisation ; dans ce seul cas, le
client conserve le protocole précédent. Les règles restent toujours l’autorité
qui décide si une écriture est autorisée. Dès que les nouvelles règles sont en
place, l’autorisation est obligatoire et aucun interrupteur de désactivation
n’est proposé au client.

App Check/reCAPTCHA Enterprise est configuré pour le domaine officiel. Le code
seul ne l’impose pas : l’activation `ENFORCED` du service Firestore doit être
vérifiée dans Firebase après publication du client et contrôle de l’attestation.
Une page ancienne doit être rechargée après activation des nouvelles règles.

## Imports et affichage

Le fichier JSON est limité à 5 Mo. Sa structure est bornée avant copie et rendu :
200 000 valeurs, 32 niveaux, clés dangereuses refusées, au plus 128 playlists,
2 048 morceaux par playlist et 1 024 sections par morceau. Noms, identifiants et
libellés ont des longueurs maximales. Les noms sont rendus comme texte.
La CSP de production limite les origines ; les dépendances sont versionnées.
Dependabot prépare des mises à jour hebdomadaires npm et GitHub Actions.

## Android

L’APK contient le site sur une origine HTTPS virtuelle locale. Les accès
`file://`, les accès universels aux fichiers, le trafic HTTP clair, le débogage
WebView et les sauvegardes automatiques Android sont désactivés. Aucun
`JavascriptInterface` global n’est exposé. Un port de messages est transmis à
la page principale de confiance pour les exports, limités à 20 Mo et soumis au
sélecteur de fichiers Android. L’application n’effectue pas de synchronisation
cloud embarquée ; la gestion du compte ouvre le site officiel dans le navigateur.

## Limites

Ce durcissement n’est pas une certification d’invulnérabilité. App Check et le
budget d’écriture ne constituent ni un quota de lectures ni un plafond de
facturation. Les comptes ou jetons compromis restent un risque ; l’hébergement
statique dépend de GitHub. Protéger le compte propriétaire par MFA et conserver
la clé de signature Android dans un emplacement privé. Aucun secret administratif,
jeton, mot de passe ou clé de signature ne doit entrer dans le dépôt.

Les essais d’abus sont effectués dans un émulateur isolé ; aucun test de saturation
n’est exécuté sur le site public. Le rapport de livraison distingue les protections
effectivement déployées des configurations préparées.
