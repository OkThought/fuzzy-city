import type { CityEvent, DecisionTrace, World } from "../sim/types";

export const REPLAY_FORMAT = "fuzzy-city-replay/v1" as const;

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
