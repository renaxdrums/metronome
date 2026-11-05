import { PitchDetector } from './tuner-core.mjs';
const detector = new PitchDetector();
self.onmessage = ({ data }) => {
  const { buffer, sampleRate, noiseFloor } = data;
  const result = detector.detect(new Float32Array(buffer), sampleRate, { noiseFloor });
  self.postMessage({ result, buffer }, [buffer]);
};
