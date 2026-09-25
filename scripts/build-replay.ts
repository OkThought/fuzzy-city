import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  durableWrite,
  loadCheckpoint,
  readJson,
  sha,
  type Checkpoint,
} from "../src/recording/format";
import {
  REPLAY_FORMAT,
  type ReplayIndex,
  type ReplaySnapshot,
} from "../src/replay/types";

interface RecordingManifest {
  version: string;
  rules: string;
  seed: string;
  population: number;
  configuration: {
    provider: string;
    model: string;
    snapshot: string;
    kernel: string;
    runtime?: string;
  };
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

const source = resolve(
  process.argv[2] ?? "recordings/milestone-one-jevk5",
);
const destination = resolve(
  process.argv[3] ?? "public/recordings/milestone-one-jevk5",
);
const publicRoot = resolve("public/recordings");
if (!destination.startsWith(`${publicRoot}\\`) && destination !== publicRoot) {
  throw new Error("Replay output must stay under public/recordings");
}
if (!existsSync(join(source, "manifest.json"))) {
  throw new Error(`Recording not found: ${source}`);
}

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

mkdirSync(join(destination, "frames"), { recursive: true });
mkdirSync(join(destination, "history"), { recursive: true });
const historyAssets = new Map<string, { url: string; sha256: string; bytes: number }>();

const frames = names.map((name) => {
  const checkpoint = loadCheckpoint(source, name);
  const id = name.replace(/^checkpoint-/, "").replace(/\.json$/, "");
  for (const chunk of checkpoint.chunks) {
    if (historyAssets.has(chunk.name)) continue;
    const raw = readFileSync(join(source, "chunks", chunk.name), "utf8");
    if (sha(raw) !== chunk.hash) throw new Error(`Damaged source chunk ${chunk.name}`);
    durableWrite(join(destination, "history", chunk.name), raw);
    historyAssets.set(chunk.name, {
      url: `/recordings/${basename(destination)}/history/${chunk.name}`,
      sha256: chunk.hash,
      bytes: Buffer.byteLength(raw),
    });
  }
  const rawCheckpoint = readJson<Checkpoint>(join(source, "checkpoints", name));
  const snapshot: ReplaySnapshot = {
    version: REPLAY_FORMAT,
    frameId: id,
    world: { ...rawCheckpoint.world, traces: [], events: [] },
  };
  const raw = JSON.stringify(snapshot);
  const filename = `${id}.json`;
  durableWrite(join(destination, "frames", filename), raw);
  return {
    id,
    day: rawCheckpoint.world.day,
    minute: rawCheckpoint.world.minute,
    journalCount: rawCheckpoint.journalCount,
    snapshot: {
      url: `/recordings/${basename(destination)}/frames/${filename}`,
      sha256: sha(raw),
      bytes: Buffer.byteLength(raw),
    },
    history: rawCheckpoint.chunks.map((chunk) => historyAssets.get(chunk.name)!),
  };
});

const start = Date.parse(manifest.startedAt);
const end = manifest.endedAt ? Date.parse(manifest.endedAt) : Number.NaN;
const assetBytes =
  frames.reduce((sum, frame) => sum + frame.snapshot.bytes, 0) +
  [...historyAssets.values()].reduce((sum, asset) => sum + asset.bytes, 0);
const index: ReplayIndex = {
  version: REPLAY_FORMAT,
  recording: {
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
  },
  frames,
  initialBytes: 0,
  totalBytes: assetBytes,
};
for (let attempt = 0; attempt < 3; attempt++) {
  const indexBytes = Buffer.byteLength(JSON.stringify(index, null, 2));
  index.initialBytes =
    frames[0].snapshot.bytes +
    frames[0].history.reduce((sum, asset) => sum + asset.bytes, 0) +
    indexBytes;
  index.totalBytes = assetBytes + indexBytes;
}
durableWrite(join(destination, "index.json"), JSON.stringify(index, null, 2));

console.log(
  JSON.stringify({
    output: destination,
    frames: frames.length,
    historyChunks: historyAssets.size,
    initialBytes: index.initialBytes,
    totalBytes: index.totalBytes,
  }),
);
