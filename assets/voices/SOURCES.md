# RENAX DRUMS — human metronome voice sources

These are real human recordings, not text-to-speech.

## Voice men EN
- Speaker: EnjoyPA (human counting pack)
- Project: Freesound / PEBL mirror
- License: CC0 1.0

## Voice female EN
- Voice: Callie
- Project: FreeSWITCH Sounds
- License: MPL

RENAX processing (revised 2026-10-05): complete original utterances, mono PCM WAV 48 kHz / 16-bit, only outside-silence trimming with protected consonant pre-roll, gentle low-frequency filtering and linear gain normalization. Internal pauses and word endings are preserved. No pitch shifting, no time stretching and no synthetic speech.

The source speakers and licenses above are unchanged. The previous silence-removal treatment could cut weak consonants or stop at an internal pause. All 40 English samples were restored from these same original sources:

- Male EN: https://github.com/stmueller/pebl/tree/eb22a0725d765a0597a4905920ad3c603b1c9ae8/battery/PASAT/audio
- Female EN: https://github.com/freeswitch/freeswitch-sounds/releases/tag/en-us-callie-1.0.53

Per-word timing landmarks and SHA-256 sample identities are in tests/voice-anchors.json. Replacing or regenerating any sample requires recalibration.
