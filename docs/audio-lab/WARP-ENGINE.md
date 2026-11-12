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
- Clics RENAX : fichiers originaux locaux, offset, état, accent, premier temps, métadonnées, abandon.
- Intégration : PCM source immuable, rendu Worker, AudioBuffer, transport et clic.
- Non-régression : ancienne UI, sept onglets, dimensions du cercle, WCAG, production et cache hors ligne.

## Avant fusion/publication
Tests auditifs sur de vraies percussions, mesures de dérive après 30 minutes, boucles complexes, temps partagés, Android et desktop, interruptions et reprise. Aucune licence tierce DSP incompatible. La PR #97 reste brouillon.
