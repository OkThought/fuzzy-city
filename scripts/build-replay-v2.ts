import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  canonical,
  durableWrite,
  loadCheckpoint,
  readJson,
  sha,
  type Checkpoint,
} from "../src/recording/format";
import { applyReplayPatch, diffReplayValues } from "../src/replay/patch";
import {
  REPLAY_FORMAT_V2,
  type ReplayAsset,
  type ReplayIndex,
  type ReplayTraceCatalog,
  type ReplayV2Frame,
  type ReplayV2Index,
  type ReplayV2Segment,
} from "../src/replay/types";
import type { CityEvent, DecisionTrace, World } from "../src/sim/types";

interface RecordingManifest {
  version: string;
  rules: string;
  seed: string;
  population: number;
  configuration: ReplayIndex["recording"] extends infer R
    ? R extends { provider: infer P; model: infer M; snapshot: infer S; kernel: infer K }
      ? { provider: P; model: M; snapshot: S; kernel: K; runtime?: string }
      : never
    : never;
  startedAt: string;
  endedAt?: string;
  status: "running" | "complete" | "incomplete" | "failed";
  completedEvenings: number;
  journalCount: number;
  judgments: number;
  apiCalls: number;
  uncertainAttempts: number;
  error?: string;
}

const source = resolve(process.argv[2] ?? "recordings/pilot-1000-3e-local-final");
const destination = resolve(
  process.argv[3] ?? "public/recordings/pilot-1000-3e-local-final-v2",
);
const publicRoot = resolve("public/recordings");
if (!destination.startsWith(`${publicRoot}\\`) && destination !== publicRoot)
  throw new Error("Replay output must stay under public/recordings");
if (!existsSync(join(source, "manifest.json")))
  throw new Error(`Recording not found: ${source}`);

const manifest = readJson<RecordingManifest>(join(source, "manifest.json"));
const names = readdirSync(join(source, "checkpoints"))
  .filter((name) => /^checkpoint-day-\d+-minute-\d{4}\.json$/.test(name))
  .sort((a, b) => {
    const values = (name: string) =>
      name.match(/day-(\d+)-minute-(\d+)/)!.slice(1).map(Number);
    const [dayA, minuteA] = values(a);
    const [dayB, minuteB] = values(b);
    return dayA - dayB || minuteA - minuteB;
  });
if (names.length < 2) throw new Error("A replay needs at least two checkpoints");

const bundleName = basename(destination);
const rawAssets = new Map<string, string>();
function writeAsset(relativePath: string, value: unknown): ReplayAsset {
  const raw = JSON.stringify(value);
  durableWrite(join(destination, relativePath), raw);
  rawAssets.set(relativePath, raw);
  return {
    url: `/recordings/${bundleName}/${relativePath.replaceAll("\\", "/")}`,
    sha256: sha(raw),
    bytes: Buffer.byteLength(raw),
  };
}
function compact(world: World): Omit<World, "traces" | "events"> {
  const { traces: _traces, events: _events, ...state } = world;
  return state;
}
function absoluteTime(world: Pick<World, "day" | "minute">) {
  return (world.day - 1) * 1440 + world.minute;
}

mkdirSync(destination, { recursive: true });
const frames: ReplayV2Frame[] = [];
const segments: ReplayAsset[] = [];
let segment: ReplayV2Segment | undefined;
let segmentStart = -Infinity;
let previous: Omit<World, "traces" | "events"> | undefined;
let finalTraces: DecisionTrace[] = [];
let finalEvents: CityEvent[] = [];

function flushSegment() {
  if (!segment) return;
  segments.push(
    writeAsset(`segments/segment-${String(segment.segment).padStart(3, "0")}.json`, segment),
  );
}

for (const name of names) {
  const checkpoint = loadCheckpoint(source, name);
  const world = checkpoint.world;
  const state = compact(world);
  const time = absoluteTime(world);
  const begin = !segment || time - segmentStart >= 120;
  if (begin) {
    flushSegment();
    segmentStart = time;
    previous = structuredClone(state);
    segment = {
      version: REPLAY_FORMAT_V2,
      segment: segments.length,
      keyframe: structuredClone(state),
      frames: [],
    };
  }
  const patch = segment!.frames.length
    ? diffReplayValues(previous, state)
    : [];
  const reconstructed = applyReplayPatch(structuredClone(previous!), patch);
  if (canonical(reconstructed) !== canonical(state))
    throw new Error(`Lossless patch verification failed for ${name}`);
  previous = reconstructed;
  const id = name.replace(/^checkpoint-/, "").replace(/\.json$/, "");
  const offset = segment!.frames.length;
  segment!.frames.push({
    frameId: id,
    patch,
    recentEvents: world.events.slice(-10),
  });
  frames.push({
    id,
    day: world.day,
    minute: world.minute,
    journalCount: checkpoint.journalCount,
    traceCount: world.traces.length,
    eventCount: world.events.length,
    segment: segment!.segment,
    offset,
    semanticHash: sha(canonical(world)),
  });
  finalTraces = world.traces;
  finalEvents = world.events;
}
flushSegment();

const traceShards: ReplayAsset[] = [];
const traceCatalog: ReplayTraceCatalog = { version: REPLAY_FORMAT_V2, traces: [] };
for (let start = 0; start < finalTraces.length; start += 64) {
  const shard = finalTraces.slice(start, start + 64);
  const shardIndex = traceShards.length;
  traceShards.push(
    writeAsset(`traces/traces-${String(shardIndex).padStart(3, "0")}.json`, {
      version: REPLAY_FORMAT_V2,
      traces: shard,
    }),
  );
  for (const trace of shard)
    traceCatalog.traces.push({
      id: trace.id,
      citizenIds: trace.citizenIds,
      kind: trace.kind,
      simulationDay: trace.simulationDay,
      simulationMinute: trace.simulationMinute,
      source: trace.source,
      shard: shardIndex,
    });
}
const traceCatalogAsset = writeAsset("traces/catalog.json", traceCatalog);

const eventShards: ReplayAsset[] = [];
for (let start = 0; start < finalEvents.length; start += 256)
  eventShards.push(
    writeAsset(`events/events-${String(eventShards.length).padStart(3, "0")}.json`, {
      version: REPLAY_FORMAT_V2,
      events: finalEvents.slice(start, start + 256),
    }),
  );

const start = Date.parse(manifest.startedAt);
const end = manifest.endedAt ? Date.parse(manifest.endedAt) : Number.NaN;
const recording: ReplayIndex["recording"] = {
  id: basename(source),
  sourceFormat: manifest.version,
  rules: manifest.rules,
  seed: manifest.seed,
  population: manifest.population,
  ...manifest.configuration,
  startedAt: manifest.startedAt,
  endedAt: manifest.endedAt,
  wallTimeMs: Number.isFinite(start) && Number.isFinite(end) ? end - start : null,
  status: manifest.status === "running" ? "incomplete" : manifest.status,
  completedEvenings: manifest.completedEvenings,
  journalCount: manifest.journalCount,
  judgments: manifest.judgments,
  apiCalls: manifest.apiCalls,
  uncertaintyNote:
    manifest.status === "complete"
      ? undefined
      : `${manifest.error ?? "Recording stopped"}; ${manifest.uncertainAttempts} ambiguous remote attempts.`,
};
const index: ReplayV2Index = {
  version: REPLAY_FORMAT_V2,
  recording,
  frames,
  segments,
  traceCatalog: traceCatalogAsset,
  traceShards,
  eventShards,
  keyframeIntervalMinutes: 120,
  initialBytes: 0,
  totalBytes: 0,
  generatedBytes: 0,
  brotliBytes: 0,
};
for (let attempt = 0; attempt < 4; attempt++) {
  const indexRaw = JSON.stringify(index, null, 2);
  const assetBytes = [...rawAssets.values()].reduce(
    (sum, raw) => sum + Buffer.byteLength(raw),
    0,
  );
  const brotli = [...rawAssets.values(), indexRaw].reduce(
    (sum, raw) =>
      sum +
      brotliCompressSync(raw, {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
      }).byteLength,
    0,
  );
  index.initialBytes = Buffer.byteLength(indexRaw) + segments[0].bytes;
  index.totalBytes = assetBytes + Buffer.byteLength(indexRaw);
  index.generatedBytes = index.totalBytes;
  index.brotliBytes = brotli;
}
durableWrite(join(destination, "index.json"), JSON.stringify(index, null, 2));

const firstIndexRaw = readFileSync(join(destination, "index.json"), "utf8");
const firstBrotli =
  brotliCompressSync(firstIndexRaw, {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
  }).byteLength +
  brotliCompressSync(rawAssets.get("segments/segment-000.json")!, {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
  }).byteLength;
console.log(
  JSON.stringify({
    output: destination,
    frames: frames.length,
    segments: segments.length,
    traceShards: traceShards.length,
    eventShards: eventShards.length,
    semanticHashesVerified: frames.length,
    initialBytes: index.initialBytes,
    initialBrotliBytes: firstBrotli,
    totalBytes: index.totalBytes,
    totalBrotliBytes: index.brotliBytes,
  }),
);
