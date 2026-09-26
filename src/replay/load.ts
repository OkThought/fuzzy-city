import {
  REPLAY_FORMAT,
  REPLAY_FORMAT_V2,
  type ReplayAsset,
  type ReplayHistoryChunk,
  type ReplayIndex,
  type ReplaySnapshot,
  type ReplayTraceCatalog,
  type ReplayV2Index,
  type ReplayV2Segment,
} from "./types";
import { applyReplayPatch } from "./patch";
import type { DecisionTrace } from "../sim/types";

const cache = new Map<string, Promise<unknown>>();
const MAX_CACHED_ASSETS = 8;

async function digestHex(data: ArrayBuffer) {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function verifiedJson<T>(asset: ReplayAsset): Promise<T> {
  const existing = cache.get(asset.url);
  if (existing) return existing as Promise<T>;
  const request = (async () => {
    const response = await fetch(asset.url);
    if (!response.ok) throw new Error(`Replay asset unavailable (${response.status})`);
    const data = await response.arrayBuffer();
    if (data.byteLength !== asset.bytes || (await digestHex(data)) !== asset.sha256) {
      throw new Error("Replay asset failed its integrity check");
    }
    return JSON.parse(new TextDecoder().decode(data)) as T;
  })();
  cache.set(asset.url, request);
  if (cache.size > MAX_CACHED_ASSETS) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest && oldest !== asset.url) cache.delete(oldest);
  }
  return request;
}

export async function loadReplayIndex(url: string): Promise<ReplayIndex> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Replay index unavailable (${response.status})`);
  const index = (await response.json()) as ReplayIndex;
  if (index.version !== REPLAY_FORMAT || index.frames.length < 2) {
    throw new Error("Unsupported replay index");
  }
  return index;
}

export async function loadReplayFrame(index: ReplayIndex, frameIndex: number) {
  const frame = index.frames[frameIndex];
  if (!frame) throw new Error("Replay frame is outside the recording");
  const [snapshot, ...history] = await Promise.all([
    verifiedJson<ReplaySnapshot>(frame.snapshot),
    ...frame.history.map((asset) => verifiedJson<ReplayHistoryChunk>(asset)),
  ]);
  if (snapshot.version !== REPLAY_FORMAT || snapshot.frameId !== frame.id) {
    throw new Error("Replay snapshot identity mismatch");
  }
  const traces = history.flatMap((chunk) => chunk.traces);
  const events = history.flatMap((chunk) => chunk.events);
  return { ...snapshot.world, traces, events };
}

export async function loadReplayV2Index(url: string): Promise<ReplayV2Index> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Replay index unavailable (${response.status})`);
  const index = (await response.json()) as ReplayV2Index;
  if (
    index.version !== REPLAY_FORMAT_V2 ||
    index.frames.length < 2 ||
    !index.segments.length
  )
    throw new Error("Unsupported replay index");
  return index;
}

export async function loadReplayV2Frame(index: ReplayV2Index, frameIndex: number) {
  const frame = index.frames[frameIndex];
  if (!frame) throw new Error("Replay frame is outside the recording");
  const asset = index.segments[frame.segment];
  if (!asset) throw new Error("Replay segment is missing from the index");
  const segment = await verifiedJson<ReplayV2Segment>(asset);
  if (
    segment.version !== REPLAY_FORMAT_V2 ||
    segment.segment !== frame.segment ||
    segment.frames[frame.offset]?.frameId !== frame.id
  )
    throw new Error("Replay segment identity mismatch");
  let world = structuredClone(segment.keyframe);
  for (let offset = 1; offset <= frame.offset; offset++)
    world = applyReplayPatch(world, segment.frames[offset].patch);
  return {
    ...world,
    traces: [] as DecisionTrace[],
    events: segment.frames[frame.offset].recentEvents,
  };
}

export async function loadReplayTraceCatalog(index: ReplayV2Index) {
  const catalog = await verifiedJson<ReplayTraceCatalog>(index.traceCatalog);
  if (catalog.version !== REPLAY_FORMAT_V2)
    throw new Error("Replay trace catalog identity mismatch");
  return catalog.traces;
}

export async function loadReplayTraces(index: ReplayV2Index, ids: string[]) {
  if (!ids.length) return [];
  const wanted = new Set(ids);
  const catalog = await loadReplayTraceCatalog(index);
  const shardIds = [
    ...new Set(catalog.filter((entry) => wanted.has(entry.id)).map((entry) => entry.shard)),
  ];
  const shards = await Promise.all(
    shardIds.map(async (shard) => {
      const asset = index.traceShards[shard];
      if (!asset) throw new Error(`Replay trace shard ${shard} is missing`);
      return verifiedJson<{ version: string; traces: DecisionTrace[] }>(asset);
    }),
  );
  const traces = shards.flatMap((shard) => {
    if (shard.version !== REPLAY_FORMAT_V2)
      throw new Error("Replay trace shard identity mismatch");
    return shard.traces;
  });
  const selected = traces.filter((trace) => wanted.has(trace.id));
  if (selected.length !== wanted.size) throw new Error("Replay trace is missing");
  return selected;
}

export function clearReplayCache() {
  cache.clear();
}
