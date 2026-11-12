# RENAX Audio Lab — moteur audio et Warp (12 novembre 2026)

## Décision verrouillée
L'interface sombre actuelle est validée uniquement comme interface de test. Ne pas la redessiner pendant la phase moteur. Les autres modules, les banques de sons et le mastering RENAX restent intacts.

## Chaîne réalisée — prototype technique
1. Source décodée localement et conservée : WAV/MP3 selon décodeur navigateur, AIFF/AIFC PCM signé 16/24 bits en big/little endian avec 44,1/48/96 kHz testés. Le conteneur ASF/WMA est reconnu, mais le décodage WMA reste conditionné à un codec réellement disponible.
2. Attaques multibandes exploratoires ; elles ne constituent PAS une métrique ou un BPM automatiquement certifiés.
3. Carte d'ancres musicales ↔ source, métriques/groupements libres et timeline Warp à tempo variable.
4. Worker : rendu PCM WSOLA hors ligne, stéréo liée, validation stricte, annulation, garde-fous mémoire et restauration facultative d'attaques validées.
5. Rendu converti vers AudioBuffer, puis lecture avec WarpPlaybackSession.
6. Clics de métrique sur la même horloge AudioContext, programmés en avance, indépendants du rafraîchissement graphique, avec pauses/seek/boucles A/B.
7. Chargement des véritables fichiers CC0 de RENAX pour les clics ; reproduction des paramètres d'attaque, de gain, de hauteur du premier temps. Aucun changement des banques historiques.
8. Module d'orchestration autonome : transport/warp-session.mjs. Le lecteur Warp n'est pas encore lié à l'interface publique.

## Limites
- Le ralentissement fonctionne sur audio pré-rendu, pas encore en streaming DSP temps réel.
- Qualité sonore sur vrai corpus batterie/cymbales/piano/voix NON validée, spécialement 120→40 BPM et plus bas.
- Les fichiers longs exigent des blocs DSP et un tampon roulant, au lieu d'un AudioBuffer complet.
- La mise en veille et le throttling des timers exigent un ordonnanceur robuste (AudioWorklet ou équivalent) avant toute garantie mobile.
- Adaptateur clics : les échantillons historiques sont réutilisés ; le bus de mixage audio doit être branché sur la sortie sécurisée validée RENAX lors de l'intégration.
- Analyse automatique métrique, décodage WMA universel, édition et historique complets, projets, exports et validation smartphone restent à réaliser.

## Matrice des tests
- Mathématiques : source↔ticks↔sortie inversibles, changements de tempo, pas de trou ni inversion.
- DSP : 440 Hz stable au ralentissement ×3, stéréo, transitoires synthétiques, pics, mémoire, annulation.
- Transport : AudioContext commun, zéro dédoublement de clic sur fenêtre, seek, boucle, arrêt, fins naturelles, départs async obsolètes.
- Test de dérive mathématique : simulation de 30 minutes / 3 000 clics sur l'horloge AudioContext sans erreur cumulative ; ce n'est PAS une mesure sur appareil réel.
- Clics RENAX : fichiers originaux locaux, offset, état, accent, premier temps, métadonnées, abandon.
- Intégration : PCM source immuable, rendu Worker, AudioBuffer, transport et clic.
- Non-régression : ancienne UI, sept onglets, dimensions du cercle, WCAG, production et cache hors ligne.

## Avant fusion/publication
Tests auditifs sur de vraies percussions, mesures de dérive après 30 minutes, boucles complexes, temps partagés, Android et desktop, interruptions et reprise. Aucune licence tierce DSP incompatible. La PR #97 reste brouillon.

## Nouvelle étape — rendu par blocs et WMA (12/11/2026)

### Traitement Warp sans tampon de sortie complet
- dsp/warp-stream.mjs : WSOLA stéréo/multicanal, anneau de recouvrement (windowSize ×2), générateur de blocs PCM numérotés ; continuité d'OLA entre blocs et recalage des transitoires sur la carte source ↔ sortie
- dsp/warp-chunk-worker.mjs et dsp/warp-chunk-client.mjs : chaque bloc est transféré au consommateur **après validation**, le Worker attend un accusé de réception (backpressure). Annulation = arrêt/termination du Worker ; aucune accumulation illimitée de blocs calculés
- io/wav-stream.mjs et io/warp-wav-export.mjs : export PCM WAV 16/24 bits vers un sink local (OPFS ou File System Access) au fur et à mesure des blocs, sans réassembler toute la sortie en RAM
- Ceci réduit **la mémoire de travail du DSP de sortie**, pas celle de l'audio source encore décodé intégralement par Web Audio. Une architecture source streaming et une lecture fluide pendant un recalcul sont toujours nécessaires
- La logique d'horloge/clic existante est inchangée ; pour l'instant, la lecture pré-rendue reste distincte du moteur de rendu par blocs jusqu'à intégration de son tampon roulant

### WMA
- Décodage réel en Worker à partir du module local `vendor/wma` du paquet `@audio/decode-wma` 1.4.0 (ASF + FFmpeg WASM LGPL-2.1-or-later), chargé **seulement pour le format WMA**
- Profils annoncés par le décodeur amont : WMA v1/v2/Pro/Lossless ; test navigateur indépendant sur un vrai WMA v2 généré par FFmpeg. Les profils Pro/Lossless et les fichiers DRM ne sont pas encore qualifiés
- Ce décodeur n'est **pas** une fonctionnalité publique certifiée tant que les tests navigateur et le dossier légal LGPL ne sont pas finalisés ; `vendor/wma/NOTICE.md` définit le blocage de livraison commerciale
- Import WMA local/Worker, source originale intacte, maximum d'allocation PCM surveillé, erreurs explicites, annulation ; aucune transmission à un serveur

### Tests supplémentaires
- 440 Hz original à ralentissement ×3, sortie fragmentée et continuité (93 blocs pour 72 000 trames)
- État stéréo, tempo variable, restauration de transitoires, copie identité, pic, budgets mémoire et annulation
- Protocole Worker réel avec ACK et refus des chunks désordonnés ; export WAV RIFF de longueur exacte avec callback de sortie asynchrone
- WMA : test Worker d'annulation et mémoire + fichier WMA v2 réel synthétique en Chromium
- La qualité subjective en production et le temps réel sur smartphone restent **non validés**

