# Voice timing validation

Run with Node.js, Playwright and Chrome installed:

```
node tests/timing-test.cjs
node tests/regression-test.cjs
node tests/live-test.cjs
```

`PLAYWRIGHT_MODULE` can name a bundled Playwright installation. `CHROME_PATH` can select a Chrome executable. `TEST_URL` selects the deployed site instead of the harness's local HTTP server. `TEST_OUTPUT_DIR` selects where reports are saved. The regression test compares against commit `aa737d673d5e38a2145609d19f7f678938165f2b` and requires that commit in the local Git history. Run it against the local server.

`python tests/analyze-voices.py` verifies all 40 shipped English mono PCM WAV files (requires NumPy). Each SHA-256 identity and reviewed vowel-region landmark is stored in `voice-anchors.json`. The analysis uses a 300–2500 Hz band envelope, a 10 ms RMS window, 8 ms Gaussian smoothing, and a 1 ms step. Within the reviewed region it checks the rising flank of the vowel nucleus. The region prevents consonant pre-voicing, noise bursts or a later syllable from being mistaken for the intended onset. Replacing any sample requires recalibration.

The timing test renders the actual voice playback function through Chrome's OfflineAudioContext at 48 kHz, isolates each word on its own channel, then locates its annotated vowel region by matching the rendered waveform to the source sample. The annotation is loaded separately from the application's scheduling table. It runs the actual scheduler with uneven simulated callbacks (17–40 ms), checking the count sequence and beat grid against separately calculated expectations. Cases cover all numbers 1–20; 60/120 BPM; 3/4, 4/4, 5/4; subdivisions 2–8; and sequenced measures at 60→120→90 BPM. Acceptable landmark and interval error: 1.1 ms, with no clipped pre-roll in these normal conditions. `BASELINE_INDEX` optionally substitutes an older HTML file for a local regression check.

The live test uses a running AudioContext and the real browser timers. It records source start times and offsets, reconstructs the calibrated attack times, and checks 1→2→3→4→1 at both 60 and 120 BPM. This checks scheduled audio timing; it does not record a microphone or the user's sound device.

The regression test compares non-vocal PCM renders for every bank, state and first-beat accent; allows at most 0.000001 amplitude floating-point rounding; exercises 10,000 reference beats at 60 BPM; and verifies cancellation of scheduled voice sources on Stop.

The first version's initial RMS-threshold test did not validate perceptual rhythm and was rejected by the user. Its historical reports in `validation-2026-10-05/` must not be treated as a successful perceptual validation. Current English-only reports are in `validation-2026-10-06-english-only/`. Previous reports describe historical versions.

These tests validate explicit reviewed vowel landmarks and actual waveform timing. Human perception of soft consonants and syllabic stress is not identical to an envelope maximum, and an offline render cannot certify every listener's subjective rhythm or device latency. The user validated male EN through twenty and requested stressed-syllable alignment for female eleven. Universal perceptual perfection is not claimed.

Subdivision checks: node tests/subdivision-test.cjs; node tests/subdivision-live-test.cjs; node tests/subdivision-mix-test.cjs. Optional SUBDIVISION_BASELINE points to an old local index.html for before/after levels and defect reproduction. Current subdivision reports: validation-2026-10-06-subdivisions/. Live edits adopt the changed audio subdivision layout on the next pass of the measure, while visuals preserve musical phase.

Pulse popup checks: node tests/pulse-popup-test.cjs and node tests/pulse-popup-live-test.cjs. Validate denominator-aware choices, constant pulse block count, editor state changes, desktop/mobile bounds and continuous playback through editor changes. Current reports: validation-2026-10-06-pulse-popup/.

## Local QA environment (Windows)

Install the pinned dependencies with pnpm install --frozen-lockfile, then run node tests/setup.mjs for the cached speech models. Set CHROME_PATH to an installed Chrome executable when using another location. ffmpeg and ffprobe are required for decoded audio measurements. The optional Firebase emulator tests require Java 21 and run against demo-renax-backup only.

Run node tests/run.cjs. Set QA_OUTPUT to a separate absolute results directory. Use --only=filename.cjs to run a single historical test. The native picker test requires a person to select the destination; it is not certified by a simulated picker contract. The independent current-ui-test.cjs and qa-regressions-test.cjs add coverage; historical tests remain separate.

The PCM non-regression test now compares the audited commit c7d2d3103ed6c530fb9edaadcabe4883da19f595, with all compared instrument banks loaded in both pages. Earlier October versions intentionally contain different sounds. The subdivision gain test uses a controlled reference with only the approved +4.5 dB multiplier removed unless SUBDIVISION_BASELINE is explicitly supplied. It retains exact gain, unchanged other signals and clipping assertions.

Consult the per-test results for the exact revision being reviewed; earlier logs describe historical versions. See `../MAINTENANCE.md` for module boundaries and release checks.
The default automated suite reports the native Windows picker as MANUAL REQUIRED rather than claiming success. Run pnpm test:native with a person choosing the displayed destination. Run pnpm test:rules for the emulator-only integration suite, including account-scope-test.cjs. intro-lifecycle-test.cjs explicitly enables the real startup animation; other UI cases disable it for stable interaction while its lifecycle is checked separately.


## MP3 file level

The export dialog defaults to Boosted (Renforcé). This adds a bounded 2 dB drive into an export-only limiter (1 ms lookahead, 5 ms release), followed by reconstructed-peak analysis and verification of the decoded MP3. Original dynamics keeps the prior audio path. The programmatic exportSong API retains Original dynamics by default for compatibility; the dialog passes the selected mode explicitly. MIDI has no audio-level option.

Run node tests/mp3-output-level-test.cjs for before/after FFmpeg loudness and 8x true-peak measurements, bounded gain reduction, distinct click-level ordering, unchanged duration, silence, responsive dialog and byte comparisons between selected UI modes and direct renders. The historical mp3-export-test.cjs still checks exact original accent ratios, original limiter inactivity, timing, cancellation and playback isolation. The boosted mode intentionally moderates transient peaks; it is not represented as preserving every amplitude ratio or reaching a fixed LUFS target for every tempo and silence pattern.

## Maintenance regressions

Run `node tests/run.cjs --only=resilience-test.cjs,numbox-accessibility-test.cjs,pro-sound-context-test.cjs` for storage failure/retry, missing voice, start cancellation, keyboard and exact pro-bank waveform comparisons. The pro-bank characterization test requires commit `f38d9b3f76acd05a608151c663ba2706d6fb4431` in Git history. It compares all 18 banks and verifies preparation outside playback, destination-context independence and zero obsolete Beep requests. Run `pnpm build` after changing an entry-page asset and `pnpm check:assets` before committing.

## Offline, failure recovery and accessibility

The normal shared browser harness blocks Service Workers so a cache cannot mask source changes or a deliberate request interception. `offline-cache-test.cjs` explicitly enables a real worker, installs the verified snapshot, checks waiting updates and failed deployment integrity, cuts the network, reloads, plays audio and downloads a decodable MP3. The native Windows picker remains a separate human validation.

`emergency-backup-test.cjs` waits for committed IndexedDB transactions using awaited browser evaluations, then reloads and checks the recovered primary copy. It also verifies a newer primary wins, account isolation, rescue JSON download and failure of both storage paths. Do not treat a Promise returned to Playwright 1.56 `waitForFunction` as a polling condition for IndexedDB.

`accessibility-test.cjs` scans 60 module/dialog/theme/viewport states with axe-core; finite visual transitions settle before contrast measurements. It preserves `incomplete` findings for manual review. No rules are disabled or offending elements excluded. It does not claim full WCAG certification or screen-reader coverage. `module-extraction-test.cjs` compares 36 real computed layouts against the same sources inlined at their original positions.

## Production and progressive contracts

Recorded voices load on demand. Fixtures that require them call `prepareAllVoiceAudio()` explicitly before checking readiness. Audio and layout assertions remain unchanged. Exact layout comparisons wait for the five-second ready notification to reach the same settled state. Back/forward checks wait for the target element to become visible before asserting it; the timer check waits for its next display refresh after crossing one second.

`audio-activation-test.cjs` leaves the real context's resume promise pending, verifies a visible error after the eight-second activation bound, restores the native method, then plays and stops real audio. This tests recovery, not a replacement audio implementation. `midi-resource-test.cjs` compares four encoded files with SHA-256 references from commit `5291936`, then bounds oversized audible, silent and ramped inputs without mutating them; library validation is separately tested in the browser.

`pnpm test:production` serves the generated release and checks its CSP, exact appearance in 36 states, PCM banks, mobile layout, decoded MP3, diagnostic privacy, bounded activation, translation recovery and actual offline reload. Its normal cases require Chrome and ffprobe. The optional real neural integration case also needs the assets described above; its intercepted models are local test fixtures, not proof of remote model-host uptime.

`pnpm test:compat` uses real Chromium, Firefox and WebKit engines at desktop and mobile viewport sizes. Linux CI starts PulseAudio with a null output sink so audio clocks can advance on a machine without speakers; autoplay is explicitly allowed for the Firefox test browser. This does not certify permission prompts, physical Safari or sound hardware. A platform without Web Audio is reported as a tested degraded mode, never as successful audio playback.

The JSDoc type check is strict and currently limited to sync-core and song-tempo-ramp. Coverage percentages from `test:coverage:core` apply to sync-core alone. Whole-app, screen-reader, physical-device and field-performance coverage must not be inferred from those numbers.

`startup-layout-test.cjs` checks three themes at desktop and simulated mobile CPU x4, records visual shift totals, total time to reveal and the separately bounded 3-second grid loading duration, navigates through all workspaces, and blocks the presentation script to verify fail-open behavior. This is a lab startup measurement, not field Web Vitals. `rapid-interactions-test.cjs` preserves its original seed, 1,080 attempts, timeouts and assertions; on failure it retains browser focus/visibility/fullscreen state, tab geometry, audio state and a screenshot. Set `QA_TRACE=1` to also retain a failure trace. A passing rerun alone does not explain a previous intermittent failure.
