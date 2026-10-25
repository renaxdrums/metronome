# Recalage de « two » — 25 octobre 2026

Les vidéos utilisateur montrent une irrégularité vocale répétée. Le code calait « two » sur le T, contrairement aux 38 autres nombres calés sur leur montée vocalique. Repères corrigés : homme 50→175 ms (lecture avancée de 125 ms), femme 1→95 ms (avancée de 94 ms). Les WAV complets, hauteurs, gains, autres nombres, clics et grille temporelle restent identiques. Les consonnes restent en pré-roll ; aucune compression du mot ni égalisation artificielle des durées.

Contrôle local : 40 montées vocaliques remesurées dans les WAV, erreur 0 ms au pas de 1 ms et empreintes SHA-256 identiques. Le test de calage couvre maintenant aussi 80 BPM, ainsi que 44,1/48 kHz et un décalage volontaire de 25 ms. La régression « two » vérifie les 40 rendus, les deux seules avances attendues et la conservation des autres formes d’onde et niveaux. Ces vérifications navigateur sont obligatoires avant le déploiement Pages ; leur résultat est consultable dans le workflow du commit.

Contrôle à l’écoute à effectuer sur l’appareil : 4/4, sans subdivision, voix homme puis femme à 80 et 120 BPM, huit mesures ; vérifier un espacement régulier 1→2→3→4→1, puis Stop/Play et un changement de tempo. La perception sur la sortie audio de l’utilisateur reste à confirmer.

# Cercle par temps et réglage sur clic — 6 octobre 2026

Le cercle conserve un bloc numéroté par temps. Le clic ou Entrée/Espace ouvre la fenêtre de réglage de ce temps : nombre de subdivisions, puis boutons d’états/accents. La lecture continue pendant l’édition ; Échap, × ou clic extérieur ferme la fenêtre. Le temps édité est repéré par un contour orange, le temps joué conserve sa surbrillance.

Les numbox et la fenêtre utilisent la même liste, selon la limite de figures notées 32 et 32T : /4 → 1–8 ; /8 → 1–7 ; /16 → 1,2,3 ; /32 → 1 seul. Aucun nom de note n’est affiché. Le changement de dénominateur normalise les divisions devenues invalides en conservant si possible leur famille binaire/irrégulière et leurs premiers états. Le nouveau dénominateur et les subdivisions prennent effet au prochain passage de la mesure déjà programmée pendant la lecture. Le curseur du cercle est maintenant exprimé en phase de temps, pas en indice de subdivision.

Tests réels à 923×668 et 390×740 : 20 blocs pour 20 temps quelle que soit la division, listes identiques en haut et dans la fenêtre, accent modifiable, fermeture Échap, fenêtre contenue dans l’écran mobile. Tests via la fenêtre pendant lecture avec les deux voix à 120 BPM : suite 1–2–3–4 et compteur sans recul, erreur d’intervalle au niveau de l’arrondi flottant. 400 repères vocaux rendus, erreur mesurée 0 ms au pas de 1 ms ; clics/groupes conformes aux limites /16 et /32 ; sons non vocaux conservés et dérive de grille sur 10 000 pulsations simulées : 0 s.

Résultats actuels : tests/validation-2026-10-06-pulse-popup/. Cette version implémente le cercle avec fenêtre, contrairement aux maquettes précédentes. Les notes ci-dessous décrivent l’historique des corrections.

Réglages de subdivision simplifiés selon le dernier choix : affichage des nombres seuls, sans noms de notes. Les valeurs, états, samples et calculs temporels sont inchangés. Les limites de subdivision restent à préciser entre limite de figures notées et limite de durée ; aucune limitation nouvelle n’est appliquée dans cette version.

# Voix par groupes en /16 et /32 — 6 octobre 2026

Choix de l’utilisateur : compter les groupes à la noire et conserver tous les clics rapides. En /16, un groupe comporte quatre pulsations ; en /32, huit pulsations. Le compteur central suit les groupes et une indication sous le compteur précise ce mode. Les pulsations et subdivisions non vocales dans ces banques gardent leurs clics. Les banques non vocales et le comptage vocal en /4 et /8 restent identiques. La grille temporelle reste inchangée.

20/16 : 1–2–3–4–5, une noire par groupe. 20/32 : 1–2–3, avec un dernier groupe de quatre pulsations ; cette fin de mesure partielle conserve sa durée réelle et le retour au début de la mesure arrive donc plus tôt qu’après un groupe complet. Aucun allongement de mesure, accélération du sample ou suppression de clic pour faire tenir le mot.

Tests : 9 combinaisons homme/femme/clic en /4, /16, /32 ; grille exacte et tous les événements de subdivision conservés. Rendus Web Audio des groupes 20/16 et 20/32 : 400 repères vocaux au total avec les scénarios existants, erreur mesurée 0 ms au pas de 1 ms, aucune attaque tardive. Tests des vrais menus pendant lecture à 120 BPM : comptage et affichage continus. Résultats : tests/validation-2026-10-06-grouped-voice/.

La nouvelle proposition graphique est un cercle avec un bloc par pulsation et une fenêtre de réglage sur clic ; elle est montrée en maquette mais n’est pas encore implémentée.

Libellés de subdivision approuvés : nombre en premier, noms de notes complets calculés selon le dénominateur ; subdivisions 3/5/6/7 nommées triolet/quintolet/sextolet/septolet. Les menus sont élargis pour afficher ces noms. Exemple /8 : 4 — Triple croche, 8 — Quadruple croche ; /16 : 8 — Quintuple croche ; /32 : 8 — Sextuple croche. La grille d’édition pour les cas denses et le regroupement vocal restent des propositions, pas des fonctions livrées dans cette version.

# Subdivisions audibles et modifications pendant la lecture — 6 octobre 2026

Les subdivisions des deux banques anglaises ont un gain interne multiplié par quatre. Mesure Web Audio sur fenêtres RMS de 20 ms : le clic ordinaire passe de −18,72 à −7,41 dB par rapport au niveau médian de crête vocal masculin et de −20,80 à −9,49 dB pour la voix féminine. Hausse rendue : environ 11,3 dB, identique dans les deux banques. Les niveaux des WAV, le gain des voix, les repères vocaux et les banques non vocales sont conservés. Une protection des crêtes du mélange vocal, sans anticipation ni suréchantillonnage, est transparente jusqu’à 0,9 d’amplitude ; le niveau maximal mesuré dans 18 configurations à 60/120/240 BPM, 2/4/8 subdivisions et trois accents est 0,99752, sous pleine échelle.

Lors d’une modification de subdivision, la structure audio de la mesure déjà programmée reste fixe. Les subdivisions éditées prennent effet au prochain passage de cette mesure. Le compteur suit le temps musical capturé lors de la planification, et le curseur est remappé sur le nouveau cercle avec la même phase musicale. La grille Web Audio et les nombres ne sont jamais décalés pour suivre les indices des points visuels. Les accents modifiés sur les points existants continuent de suivre leurs états.

Le défaut de l’ancienne version est reproduit avec six changements pendant la lecture. Après correction : neuf cas homme/femme/clic à 60/120/180 BPM gardent la séquence et la grille. Deux tests avec vraie horloge, vraie lecture audio et changements via les menus de l’UI à 120 BPM gardent 1→2→3→4, intervalles de 0,500 s et compteur visuel sans recul. Les 320 repères vocaux restent conformes au pas de recherche de 1 ms ; dérive simulée sur 10 000 pulsations : 0 s. Rendus non vocaux inchangés, hors arrondi flottant habituel de la cloche (5,96×10⁻⁸).

Résultats actuels : tests/validation-2026-10-06-subdivisions/. Les tests subdivision-test.cjs (mesures de niveau et changements simulés), subdivision-live-test.cjs (vrais menus pendant lecture) et subdivision-mix-test.cjs (niveau du mélange) complètent les contrôles existants. SUBDIVISION_BASELINE peut désigner un ancien index.html local pour reproduire et comparer le défaut.

# Deux voix anglaises — 6 octobre 2026

L’utilisateur valide la voix homme EN jusqu’à vingt. Ses vingt WAV et ses vingt repères restent identiques. La voix femme EN reste identique sauf le repère d’eleven : 25→163 ms, sur la montée vocalique de la syllabe accentuée LE de e-LE-ven. Le sample commence donc 138 ms plus tôt ; le mot complet et sa vitesse restent identiques. Les deux voix françaises, leurs options, leurs données de chargement et leurs 40 WAV sont supprimés.

Le clic, les autres banques non vocales, les incréments de la grille et l’UI hors des options françaises supprimées restent inchangés.

Tests mesurables : 40 WAV anglais vérifiés par SHA-256 ; 16 scénarios de 20 nombres, soit 320 repères rendus dans Web Audio à 48 kHz, erreur mesurée 0 ms avec un pas de recherche de 1 ms. Tous les nombres 1–20 sont rendus à 60 et 120 BPM, notamment eleven ; mesures 3/4, 4/4, 5/4, subdivisions 2–8 et séquences 60→120→90 BPM. Aucun pré-roll coupé dans les scénarios normaux.

Les sons non vocaux sont conformes au rendu original : clic, claves, clic808 et beep identiques ; cloche avec seulement l’arrondi flottant maximal 5,96×10⁻⁸, code inchangé. Dérive de grille sur 10 000 pulsations à 60 BPM simulées : 0 s. Stop annule les voix planifiées.

Résultats actuels : tests/validation-2026-10-06-english-only/. Les autres dossiers de validation sont historiques et peuvent décrire les voix françaises retirées. Le workflow ancien de préparation des samples reste un outil historique ; ne pas régénérer les WAV validés sans recalibrer leurs repères.

Le repère est une annotation explicite de la syllabe perçue, pas une certification universelle de perception ni une mesure de la latence du périphérique audio. Un workflow Pages réussi confirme la publication ; les rendus audio mesurés servent au contrôle fonctionnel.
