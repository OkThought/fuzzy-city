import type { CityEvent, DecisionTrace, World } from "../sim/types";

export const REPLAY_FORMAT = "fuzzy-city-replay/v1" as const;
export const REPLAY_FORMAT_V2 = "fuzzy-city-replay/v2" as const;

export interface ReplayAsset {
  url: string;
  sha256: string;
  bytes: number;
}

export interface ReplayFrame {
  id: string;
  day: number;
  minute: number;
  journalCount: number;
  snapshot: ReplayAsset;
  history: ReplayAsset[];
}

export interface ReplayIndex {
  version: typeof REPLAY_FORMAT;
  recording: {
    id: string;
    sourceFormat: string;
    rules: string;
    seed: string;
    population: number;
    provider: string;
    model: string;
    snapshot: string;
    kernel: string;
    runtime?: string;
    startedAt: string;
    endedAt?: string;
    wallTimeMs: number | null;
    status: "complete" | "incomplete" | "failed";
    completedEvenings: number;
    journalCount: number;
    judgments: number;
    apiCalls: number;
    uncertaintyNote?: string;
  };
  frames: ReplayFrame[];
  initialBytes: number;
  totalBytes: number;
}

export interface ReplaySnapshot {
  version: typeof REPLAY_FORMAT;
  frameId: string;
  world: World;
}

export interface ReplayHistoryChunk {
  traces: DecisionTrace[];
  events: CityEvent[];
}

export type ReplayPath = (string | number)[];
export interface ReplayPatchOperation {
  path: ReplayPath;
  value?: unknown;
  delete?: true;
}

export interface ReplayV2Frame {
  id: string;
  day: number;
  minute: number;
  journalCount: number;
  traceCount: number;
  eventCount: number;
  segment: number;
  offset: number;
  semanticHash: string;
}

export interface ReplayV2Segment {
  version: typeof REPLAY_FORMAT_V2;
  segment: number;
  keyframe: Omit<World, "traces" | "events">;
  frames: {
    frameId: string;
    patch: ReplayPatchOperation[];
    recentEvents: CityEvent[];
  }[];
}

export interface ReplayTraceCatalogEntry {
  id: string;
  citizenIds: string[];
  kind: DecisionTrace["kind"];
  simulationDay: number;
  simulationMinute: number;
  source: DecisionTrace["source"];
  shard: number;
}

export interface ReplayV2Index {
  version: typeof REPLAY_FORMAT_V2;
  recording: ReplayIndex["recording"];
  frames: ReplayV2Frame[];
  segments: ReplayAsset[];
  traceCatalog: ReplayAsset;
  traceShards: ReplayAsset[];
  eventShards: ReplayAsset[];
  keyframeIntervalMinutes: number;
  initialBytes: number;
  totalBytes: number;
  generatedBytes: number;
  brotliBytes: number;
}

export interface ReplayTraceCatalog {
  version: typeof REPLAY_FORMAT_V2;
  traces: ReplayTraceCatalogEntry[];
}
