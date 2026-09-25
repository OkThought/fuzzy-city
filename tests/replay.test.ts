import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPLAY_FORMAT, type ReplayIndex } from "../src/replay/types";

describe("public replay bundle", () => {
  it("indexes integrity-bound incremental assets from the real JevK5 recording", () => {
    const root = join(process.cwd(), "public", "recordings", "milestone-one-jevk5");
    const index = JSON.parse(readFileSync(join(root, "index.json"), "utf8")) as ReplayIndex;
    expect(index.version).toBe(REPLAY_FORMAT);
    expect(index.recording.provider).toBe("jevk5");
    expect(index.recording.status).toBe("failed");
    expect(index.recording.population).toBe(100);
    expect(index.frames).toHaveLength(6);
    expect(index.frames[0].history.length).toBeLessThan(index.frames.at(-1)!.history.length);
    expect(index.initialBytes).toBeLessThan(index.totalBytes / 5);

    for (const frame of index.frames) {
      for (const asset of [frame.snapshot, ...frame.history]) {
        const path = join(root, asset.url.split("/").slice(3).join("/"));
        const contents = readFileSync(path);
        expect(statSync(path).size).toBe(asset.bytes);
        expect(createHash("sha256").update(contents).digest("hex")).toBe(asset.sha256);
      }
    }
  });
});
