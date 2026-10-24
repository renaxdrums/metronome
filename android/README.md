# Renax Drums - Métronome

Application Android contenant le métronome et ses sons. Identifiant :
`com.renaxdrums.metronome`, version 1.0.1, Android 8.0 minimum.

Le métronome, les sons embarqués, les partitions et les sauvegardes locales
fonctionnent sans connexion. Les voix/modèles téléchargés et les ressources
externes ont besoin d’Internet. Le compte et la synchronisation cloud s’ouvrent
sur le site officiel dans le navigateur ; les données de l’APK ne sont pas
automatiquement transférées au navigateur. L’import/export JSON permet leur
transfert volontaire. Les exports JSON/MP3/WAV utilisent le sélecteur Android.
La lecture s’arrête en arrière-plan ; aucun service audio permanent n’est installé.
Le pont d’export actuel est limité à 20 Mo. Ces différences avec le site restent
des limites de l’APK, pas des fonctions validées comme équivalentes au site.

Les travailleurs du guide vocal embarquent leurs dépendances locales et la
configuration Piper dans leur compilation Android. Les moteurs et modèles
distants restent identiques à ceux du site. Le changement de banque vocale pendant
la lecture attend le décodage des enregistrements avant d’activer la voix.
Le sélecteur Android conserve le nom `.mid` sans lui ajouter `.rtx`.

La QA native utilise Android 14 et 15 à 360 pixels CSS (1080 pixels physiques,
densité 480), vérifie toutes les banques et les 40 voix, génère les vrais guides
FR/EN et décode le MP3 effectivement enregistré. Les résultats détaillés font foi :
ces contrôles automatisés ne constituent pas une écoute sur téléphone physique.

## Compilation

`build-apk.ps1` utilise les outils Android officiels build-tools 35.0.0 et
platform 35, Java 21 et Eclipse ECJ 3.42.0. Il prépare une version CSP du site,
compile le lanceur, crée le DEX, aligne puis signe l’APK. Il vérifie les signatures
APK v2/v3 et l’alignement avant de livrer le fichier.

Les fichiers embarqués sont ajoutés avec des chemins ZIP utilisant `/`, y compris
sous Windows. La compilation refuse tout chemin contenant `\`, toute ressource
absente ou supplémentaire et toute différence SHA-256 avec les fichiers préparés.
Ces contrôles sont exécutés avant signature puis sur l’APK signé. Le test de
régression `pwsh -File android/test-apk-assets.ps1` s’exécute sous Windows et Linux
dans le workflow `android-packaging.yml`. Il ne remplace pas le test sur Android.

Fournir les paramètres `-AndroidToolsRoot`, `-JavaHome`, `-CompilerJar` et
`-OutputApk`. Les outils sont vérifiés contre leurs métadonnées de téléchargement.

La clé de signature privée est dans `android/signing/`, ignoré par Git. Son mot
de passe est chiffré avec Windows DPAPI pour le compte ayant compilé. Conserver
cette clé pour signer les futures mises à jour ; elle n’est jamais ajoutée à
l’APK ni au dépôt. Les fichiers de compilation et ressources générées sont ignorés.

## Vérification sur téléphone

Un APK signé n’équivaut pas à un essai sur appareil. Vérifier : installation,
démarrage, mode avion, son et tempo, rotation, import/export, mise en arrière-plan
et retour. Le rapport livré précise les essais réellement exécutés.
