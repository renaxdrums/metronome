# RENAX Audio Lab — local WMA decoder (vendored, licence LGPL)

**Module:** @audio/decode-wma v1.4.0, published 2026-09-28
**Upstream:** https://github.com/audiojs/decode/tree/99d2492371e0edacc25f42bb670c4d58b43d032b/packages/decode-wma
**License:** LGPL-2.1-or-later for the FFmpeg libavcodec WASM build, according to upstream; respect all bundled notices. See LICENSE and LICENSE.ffmpeg.

## Vendored files and provenance
- decode-wma.js — ASF demuxer + adapter; upstream unchanged.
- src/wma.wasm.js — generated self-contained Emscripten WASM module; upstream unchanged, **lazy imported only for .wma**.
- src/wma_glue.c, build.sh — reproducible build inputs from upstream, unchanged.
- LICENSE, LICENSE.ffmpeg — corresponding notices from upstream, unchanged.

Upstream build is designed for FFmpeg release/7.1 at commit 3978a28 with four WMA decoders and without GPL/non-free configure flags. The exact build and matching upstream FFmpeg sources must be available to any recipient of this library. Source archive:
https://github.com/FFmpeg/FFmpeg/tree/3978a28

The WASM is a **separate, replaceable ESM file**: RENAX does not combine or modify the FFmpeg implementation. No server uploads, no advertising, no DRM bypass and no cloud decoding. Files are decoded in a dedicated Worker and then imported as PCM.

## Release/licensing gate
This is a development candidate in draft PR #97. **Do not ship a commercial build until the complete corresponding FFmpeg/WASM source and build instructions have been packaged/hosted alongside the deployed binary and an LGPL compliance review is recorded.** Follow FFmpeg's official compliance checklist:
https://ffmpeg.org/legal.html

Include an About/Licenses entry and a corresponding source download link in the final distribution. DRM-encrypted or unsupported ASF streams must remain explicit import errors. No claim is made that all WMA profiles/containers decode successfully until validated on a test corpus.
