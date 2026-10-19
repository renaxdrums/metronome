/** Shared classic-script APIs. This declaration file emits no runtime code. */
type RenaxLibrary = import('./library').Library;
type RenaxSong = import('./library').Song;
type RenaxSection = import('./library').Section;
type RenaxSyncState = import('./library').SyncState;
interface RenaxEmergencyCopy {
  id: string;
  scope: string;
  baseRaw: string | null;
  capturedAt: number;
  library: RenaxLibrary;
}
interface RenaxSongs {
  library: RenaxLibrary;
  validateLibrary(value: unknown): asserts value is RenaxLibrary;
  playbackSections(song: RenaxSong): RenaxSection[];
  replaceLibrary(library: RenaxLibrary, preserveNavigation?: boolean): void;
  flushPending(): boolean;
}
interface RenaxStorage {
  readonly ready: Promise<void>;
  readonly scope: string;
  readonly state: RenaxSyncState | null;
  readonly healthy: boolean;
  readonly readOnly: boolean;
  readonly rawToken: string | null;
  read(): string | null;
  write(library: RenaxLibrary): boolean;
  matches(library: RenaxLibrary): boolean;
  update(next: RenaxSyncState): void;
  switchScope(scope: string, empty: RenaxLibrary): Promise<void>;
  guestState(): RenaxSyncState | null;
  guestLibrary(): RenaxLibrary | null;
  reconcile(): void;
  markCorrupt(): void;
  recoverSource(): string | null;
}
interface RenaxSongTempo {
  active(section: RenaxSection): boolean;
  stepDuration(
    section: RenaxSection,
    bar: number,
    beat: number,
    sub: number,
    subdivisions: number,
  ): number;
}
interface RenaxNumboxWidget {
  sync(): void;
  rebuild(): void;
}
interface RenaxNumbox {
  widgets: WeakMap<HTMLSelectElement, RenaxNumboxWidget>;
  enhance(select: HTMLSelectElement | null): void;
  closeAll(except?: Element | null): void;
}
interface RenaxMeasurements {
  lcpMs: number | null;
  cls: number;
  inpMs: number | null;
  inpSupported: boolean;
}
interface RenaxFeedbackEntry {
  at: string;
  message: string;
  detail: string;
}
interface RenaxFeedback {
  error(message: string, cause?: unknown): void;
  diagnosticReport(): object;
  exportDiagnostic(): void;
  readonly diagnostics: RenaxFeedbackEntry[];
  readonly measurements: RenaxMeasurements;
}
interface Window {
  // Unchecked APIs stay unknown until their consuming modules enter strict coverage.
  RENAX_AMORCE: unknown;
  RENAX_AUDIO_ADAPTER: unknown;
  RENAX_BACKUP: unknown;
  RENAX_DIALOGS: unknown;
  RENAX_DIALOG_FOCUS: unknown;
  RENAX_EDIT_HISTORY: unknown;
  RENAX_I18N: unknown;
  RENAX_LOCALES: unknown;
  RENAX_MP3_EXPORT: unknown;
  RENAX_MP3_RENDER: unknown;
  RENAX_MULTI: unknown;
  RENAX_NETWORK: unknown;
  RENAX_OFFLINE: unknown;
  RENAX_PRO_SOUNDS: unknown;
  RENAX_SCORE: unknown;
  RENAX_TRAINING: unknown;
  RENAX_TRANSLATIONS: unknown;
  RENAX_WORKSPACE: unknown;
  RENAX_SONGS: RenaxSongs;
  RENAX_STORAGE: RenaxStorage;
  RENAX_EMERGENCY: {
    save(scope: string, library: RenaxLibrary, baseRaw: string | null): Promise<boolean | null>;
    list(scope: string): Promise<RenaxEmergencyCopy[]>;
    confirm(scope: string, library: RenaxLibrary): Promise<number | null>;
  };
  RENAX_MIDI_EXPORT: {
    exportSong(song: RenaxSong): {
      blob: Blob;
      report: { ticks: number; ppq: number; notes: number };
    };
  };
  RENAX_NUMBOX: RenaxNumbox;
  RENAX_FEEDBACK: RenaxFeedback;
  RENAX_PLAYBACK?: { diagnosticSnapshot(context?: BaseAudioContext | null): unknown };
  RENAX_SONG_TEMPO: RenaxSongTempo;
}
declare const RENAX_SONGS: RenaxSongs;
declare const RENAX_SONG_TEMPO: RenaxSongTempo;
declare let audioCtx: BaseAudioContext | null;

/** Historical versioned import stays unchanged in the classic-script source. */
declare module '*sync-core.js?v=20261008-auto-sync' {
  export const stage: typeof import('../sync-core.js').stage;
  export const blankState: typeof import('../sync-core.js').blankState;
}
