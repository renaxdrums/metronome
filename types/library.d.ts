/** Runtime validation remains required for bounds, unique identities and imported JSON. */
export type BeatState = 0 | 1 | 2 | 3;
export type VoiceLanguage = 'fr' | 'en';
export interface Measure {
  numerator: number;
  denominator: 2 | 4 | 8 | 16 | 32;
  tempo: number;
  beatSubdivisions: number[];
  beatStates: BeatState[][];
}
export interface Section {
  id: string;
  label: string;
  count: number;
  continuous?: boolean;
  measure: Measure;
  tempoRamp?: { enabled: boolean; endTempo: number };
  amorceLanguage?: VoiceLanguage;
}
export interface Song {
  id: string;
  name: string;
  sections: Section[];
  amorce?: boolean;
  amorceDefaultLanguage?: VoiceLanguage;
  countIn?: { count: number; numerator: number; denominator: Measure['denominator'] };
}
export interface Profile {
  id: string;
  name: string;
  songs: Song[];
}
export interface Library {
  version: 1;
  activeProfile?: string;
  profiles: Profile[];
}
export interface Payload {
  payload: string | null;
  deleted: boolean;
  operationId: string;
  modifiedAt?: number;
  updatedAt?: number | null;
  device?: string;
}
export interface RemoteRecord extends Payload {
  revision: number;
}
export interface PendingRecord extends Payload {
  expected: number;
}
export interface SyncState {
  version: 1;
  library: Library;
  base: Record<string, RemoteRecord>;
  pending: Record<string, PendingRecord>;
  conflicts: Record<
    string,
    { local: Pick<Payload, 'payload' | 'deleted'> & Partial<PendingRecord>; remote: RemoteRecord }
  >;
  importDecisions: Record<string, boolean>;
}

export type StoredEntity =
  | { type: 'catalog'; profileIds: string[] }
  | { type: 'profile'; id: string; name: string; songIds: string[] }
  | { type: 'song'; profileId: string; song: Song };
