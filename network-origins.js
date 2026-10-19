/* Version-pinned runtime roots shared by browser workers, setup and production CSP. */
(function (root) {
  'use strict';
  const origins = Object.freeze({
    transformers: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/',
    onnx: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/',
    espeak: 'https://cdn.jsdelivr.net/gh/echogarden-project/espeak-ng-emscripten@7ab07eba2d966ce45040c88d9be953e1d68640e7/',
  });
  root.RENAX_NETWORK = origins;
  if (typeof module === 'object' && module.exports) module.exports = origins;
})(globalThis);
