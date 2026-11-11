/** RENAX Audio Lab — independent typed contracts v1. */
export type Seconds = number;
export type MusicalTick = number; // exact integer anchors; 3840 ticks/quarter
export type PulseUnit = { count: number; denominator: number }; // 3/8 = dotted quarter
export type Meter = { numerator: number; denominator: number; groups: number[] };
export type Confidence = { score: number; evidence: string[]; ambiguous: boolean };
export type AudioIdentity = {
  name: string;
  sizeBytes: number;
  mimeType: string;
  sha256?: string;
  sampleRate: number;
  channels: number;
  durationSeconds: Seconds;
};
export type Onset = {
  seconds: Seconds;
  strength: number;
  band: 'low' | 'mid' | 'high' | 'percussive' | 'harmonic';
};
export type BeatCandidate = {
  sourceSeconds: Seconds;
  tick: MusicalTick;
  confidence: Confidence;
  isAudibleAttack: boolean;
};
export type MeterHypothesis = {
  id: string;
  cycle: Meter[];
  pulse: PulseUnit;
  bpm: number;
  confidence: Confidence;
  beats: BeatCandidate[];
  provenance: 'detector' | 'manual' | 'reference';
};
export type AnalysisResult = {
  schemaVersion: 1;
  sourceHash?: string;
  onsets: Onset[];
  hypotheses: MeterHypothesis[];
  validatedHypothesisId?: string;
  diagnostics: string[];
};
export type WarpAnchor = {
  tick: MusicalTick;
  sourceSeconds: Seconds;
  locked: boolean;
};
export type WarpMap = {
  anchors: readonly WarpAnchor[];
  lengthTicks: MusicalTick;
  durationSeconds: Seconds;
};
export type TempoPoint = {
  startTick: MusicalTick;
  bpm: number;
  pulse: PulseUnit;
  confidence: Confidence;
};
export type MusicSection = {
  id: string;
  name: string;
  startTick: MusicalTick;
  meter: Meter;
  chords: { tick: MusicalTick; symbol: string }[];
  comments: { tick: MusicalTick; text: string }[];
};
export type SavedLoop = {
  id: string;
  name: string;
  startTick: MusicalTick;
  endTick: MusicalTick;
  repeatsBeforeIncrease?: number;
  bpmStep?: number;
  targetBpm?: number;
  countInMeasures?: number;
};
export type AudioLabProject = {
  schema: 'renax.audio-lab';
  version: 1;
  source: AudioIdentity;
  analysis?: AnalysisResult;
  meterCycle: Meter[];
  tempoMap: TempoPoint[];
  warpAnchors: WarpAnchor[];
  sections: MusicSection[];
  loops: SavedLoop[];
  playback: {
    mode: 'original' | 'warp';
    bpm: number;
    pulse: PulseUnit;
    audioGain: number;
    clickGain: number;
    clickEnabled: boolean;
  };
};
export type AudioLabErrorCode =
  | 'UNSUPPORTED_FORMAT' | 'DECODE_FAILED' | 'MEMORY_PRESSURE'
  | 'LOW_CONFIDENCE' | 'INVALID_ANCHORS' | 'MISSING_SOURCE'
  | 'STORAGE_QUOTA' | 'DSP_UNAVAILABLE' | 'AUDIO_CONTEXT_SUSPENDED';
export type AudioLabError = { code: AudioLabErrorCode; message: string; recoverable: boolean };
export type PeakTile = {
  channel: number;
  samplesPerBucket: number;
  firstBucket: number;
  minimum: Float32Array;
  maximum: Float32Array;
};
export type AudioLabExportRequest = {
  kind: 'warp-audio' | 'warp-with-click' | 'click-only' | 'slowed-audio' | 'midi-map' | 'pdf-map' | 'musicxml';
  format: 'wav' | 'mp3' | 'mid' | 'pdf' | 'musicxml';
  sourceProjectVersion: 1;
};
