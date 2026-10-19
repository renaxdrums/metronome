import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('.qa-cache'),
  revision = '7ab07eba2d966ce45040c88d9be953e1d68640e7',
  cdn = `https://cdn.jsdelivr.net/gh/echogarden-project/espeak-ng-emscripten@${revision}/`;
async function download(url, file) {
  try {
    if ((await fs.stat(file)).size > 0) return;
  } catch {}
  await fs.mkdir(path.dirname(file), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) throw Error(response.status + ' ' + url);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await fs.writeFile(file, bytes);
  console.log('Downloaded', path.basename(file), bytes.length);
}
for (const name of ['espeak-ng.js', 'espeak-ng.data'])
  await download(cdn + name, path.join(root, 'espeak', name));
// The upstream module is ESM, independently of the application's script format.
await fs.writeFile(path.join(root, 'espeak/package.json'), ' {"type":"module"}\n');
if (process.argv.includes('--espeak-only')) {
  console.log('Pinned eSpeak assets ready');
  process.exit(0);
}
const model =
  'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped/resolve/dd4401a9add81ac692d20e240d22ec9dda82cc29/';
for (const name of [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
  'voices/bm_george.bin',
  'voices/ff_siwis.bin',
])
  await download(model + name, path.join(root, 'neural-assets', name));
await download(
  'https://huggingface.co/rhasspy/piper-voices/resolve/c10ece1aade47bb51c153c893d14e5bf8e5b7117/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx',
  path.join(root, 'piper/fr_FR-siwis-medium.onnx'),
);
console.log('Pinned voice test assets ready');
