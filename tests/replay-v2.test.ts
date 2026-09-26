import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyReplayPatch, diffReplayValues } from "../src/replay/patch";
import {
  REPLAY_FORMAT_V2,
  type ReplayV2Index,
  type ReplayV2Segment,
} from "../src/replay/types";

describe("lossless replay v2", () => {
  it("round-trips nested values, array changes and deleted fields", () => {
    const before = { a: [{ x: 1, stale: true }, { x: 2 }], keep: "yes" };
    const after = { a: [{ x: 1 }, { x: 3 }, { x: 4 }], keep: "yes" };
    expect(applyReplayPatch(structuredClone(before), diffReplayValues(before, after))).toEqual(after);
  });

  it("indexes integrity-bound segments and demand-loaded traces", () => {
    const root = join(process.cwd(), "public", "recordings", "milestone-one-jevk5-v2");
    const index = JSON.parse(readFileSync(join(root, "index.json"), "utf8")) as ReplayV2Index;
    expect(index.version).toBe(REPLAY_FORMAT_V2);
    expect(index.frames).toHaveLength(6);
    expect(index.initialBytes).toBeLessThan(1024 * 1024);
    expect(index.brotliBytes).toBeLessThan(index.generatedBytes);

    const assets = [
      ...index.segments,
      index.traceCatalog,
      ...index.traceShards,
      ...index.eventShards,
    ];
    for (const asset of assets) {
      const path = join(root, asset.url.split("/").slice(3).join("/"));
      const contents = readFileSync(path);
      expect(statSync(path).size).toBe(asset.bytes);
      expect(createHash("sha256").update(contents).digest("hex")).toBe(asset.sha256);
    }

    const segment = JSON.parse(
      readFileSync(join(root, "segments", "segment-000.json"), "utf8"),
    ) as ReplayV2Segment;
    let world = structuredClone(segment.keyframe);
    for (let offset = 1; offset < segment.frames.length; offset++)
      world = applyReplayPatch(world, segment.frames[offset].patch);
    expect(world.day).toBe(index.frames.at(-1)!.day);
    expect(world.minute).toBe(index.frames.at(-1)!.minute);
    expect(world.citizens).toHaveLength(100);
  });
});
