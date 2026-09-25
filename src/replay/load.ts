import {
  REPLAY_FORMAT,
  type ReplayAsset,
  type ReplayHistoryChunk,
  type ReplayIndex,
  type ReplaySnapshot,
} from "./types";

const cache = new Map<string, Promise<unknown>>();

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

export function clearReplayCache() {
  cache.clear();
}
