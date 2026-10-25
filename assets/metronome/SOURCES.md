# RENAX DRUMS — instrumental CC0 sample banks (2026-10-11)

Scope: replace the live sound of the five instrumental banks **Clic, Cloche, Claves, Clic 808, Beep** with real recorded CC0 one-shots. Bank identifiers, UI, metronome scheduler, polyrythm scheduler, voice samples, vocal attack offsets, click-count-in and safety limiter stay unchanged.

## Original files and licences

These are deliberately bundled with the site, not streamed at playback. All three upstream sets are covered by CC0 1.0. Files are published unaltered; the app applies only linear gain and a short end release in memory.

| Bank | Source repository | Source files (in order: state 1 / state 2 / state 3) |
| --- | --- | --- |
| Clic | [Versilian VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE), CC0 | `VSCO 1 Percussion/varWood/wood_click_pp_1.wav`, `wood_click_mp.wav`, `wood_click_ff_2.wav` |
| Cloche | [Versilian VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE), CC0 | `Percussion/Cowbell1_Hit_v1_rr1_Sum.wav`, `Cowbell1_Hit_v2_rr1_Sum.wav`, `Cowbell1_Hit_v3_rr1_Sum.wav` |
| Claves | [Versilian VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE), CC0 | `Percussion/Claves1_Hit_v1_rr1_Sum.wav`, `Claves1_Hit_v2_rr1_Sum.wav`, `Claves1_Hit_v3_rr1_Sum.wav` |
| Clic 808 | [Michael Fischer TR-808](https://github.com/tidalcycles/sounds-tr808-fischer), CC0 | `rs8/RS.WAV`, `ch8/CH.WAV`, `bd8/BD2500.WAV` |
| Beep | [The Motion Monkey Free Retro Arcade Sounds Pack v1.0.5](https://www.themotionmonkey.co.uk/free-resources/retro-arcade-sounds/), CC0, [mirror](https://github.com/lavenderdotpet/CC0-Public-Domain-Sounds) | `MMRetroArcadeSoundsPack1_0_5/Misc/wav/Beep1.wav`, `Beep4.wav`, `Beep11.wav` |

Licence sources:
- VSCO: https://github.com/sgossner/VSCO-2-CE/blob/master/LICENSE
- TR-808: https://github.com/tidalcycles/sounds-tr808-fischer/blob/master/LICENSE
- Motion Monkey: https://www.themotionmonkey.co.uk/free-resources/retro-arcade-sounds/

## Audio decisions and invariants

### Full bell resonance (2026-10-25)

`Cloche` now plays each original WAV through its complete decay, without the
previous 250 ms cap or an artificial release. Each hit has its own source and
gain node, so subsequent strikes overlap naturally.

`Cowbell acoustique` (`proCowbell`) restores the full mono decay of the already
bundled `cloche-2.wav` (`Cowbell1_Hit_v2_rr1_Sum.wav`, VSCO 2 CE, CC0), resampled
to 24 kHz. The existing first 100 ms remain byte-identical. A linear 100–110 ms
join reconnects that attack to the original decay at a fixed matching gain;
the previous 110–120 ms fade and crop are removed. No loop, time stretching or
synthetic reverb is added. The manifest records source and resulting PCM hashes.
The MP3 renderer prepares the selected bank before rendering and reserves the
entire tail, including the slowest cowbell pitch. Voices and all other samples
are unchanged.

`tests/bell-resonance-test.cjs` checks full decays, exact overlap sums at both
device sample rates, absence of inter-hit stops during live 3:4 polyrhythm and
tails from a cold MP3-render page. The earlier duration limits described below
remain historical for bells; other banks retain their existing releases.

- Each WAV is decoded and attack-aligned by an RMS window. No preroll is added to the beat grid. Peak alignment tolerance is checked separately from audio-interface latency.
- Every instrumental one-shot uses a **single constant gain** based on 45 ms attack RMS, target 0.115, with a **constant-gain** peak-headroom constraint of 0.78. This is not a compressor, peak limiter, clipper, maximizer or waveshaper. No transient is digitally flattened.
- The five instrumental bank busses have the **same** linear gain, 0.28, at 100% main volume. State-1/2/3 intentional accents are retained by factors 0.78/0.91/1.00, and the first pulse by 1.12.
- The selected sound's release is reduced with a linear 6 ms fade at its tail to avoid overlapping excess resonance. The attack is not faded.
- The original safety limiter remains byte-for-byte unchanged at -0.1 dBFS. Normal mixes are prepared with headroom to avoid touching it; abnormal or unforeseen overlaps can still trigger it.
- The same sample data are loaded ahead of playback and ahead of MP3 offline rendering. Selection during playback triggers loading without changing the rhythm scheduler; until ready, the original oscillator is the safety fallback.
- VoiceMale/VoiceFemale and their speech samples/attack annotations are untouched, including the male English **two**. Voice-to-subdivision mixing is not modified.

## Tests

Automated (Chromium + Playwright):

```bash
node tests/instrument-samples-test.cjs
```

The test loads all 15 samples, checks normalisation/valid attack offsets and renders the actual instrument playback function into **stereo OfflineAudioContext** with the safety limiter intentionally bypassed **in the test only**. It checks measured peaks below the limiter threshold across all five banks, three BPMs (60/120/240), four subdivisions (1/2/4/8) and polyrythms (3:4, 7:8 and 20:20).

Manual acceptance: select and preview each of the five banks, press Start/Stop, compare perceived levels and attack clarity on headphones and smartphone, then play polyrythms and export a song to MP3. Listen for absent clicks, incomplete attacks, excessive tails, nonlinear distortion and unexpected sudden changes in level when switching bank. Recheck both existing human voices and the male second beat. Capture a digital loopback if available to confirm the limiter input stays below -0.1 dBFS on the target hardware.

Important: automated tests and simulations cannot replace an objective recording from the final audio device or an expert listening pass.
