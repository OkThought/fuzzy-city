import { mkdtempSync, rmSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateCity } from "../src/sim/cityGenerator";
import { Simulation } from "../src/sim/simulation";
import { MockDecisionEngine } from "../src/ai/mockEngine";
import { JournalEngine, RecordingStopped } from "../src/recording/engine";
import { loadCheckpoint, loadJournal, saveCheckpoint } from "../src/recording/format";

const configuration = { provider: "mock", model: "deterministic-mock-v1", snapshot: "deterministic-mock-v1", kernel: "none" };
const until = async (sim: Simulation, day: number, minute: number) => {
  while (sim.world.day < day || sim.world.day === day && sim.world.minute < minute) await sim.step();
};
describe("durable recording", () => {
  it("replays journaled work after an interrupted tick without duplicating outcomes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fuzzy-record-"));
    try {
      const initial = generateCity("recording-recovery", "mock", 100);
      saveCheckpoint(dir, initial, 0, 0);
      const interruptedEntries = loadJournal(dir);
      const engine = new JournalEngine(dir, interruptedEntries, configuration, new MockDecisionEngine(), 0, () => interruptedEntries.length >= 7);
      const partial = new Simulation(engine, structuredClone(initial));
      await expect(until(partial, 1, 1030)).rejects.toBeInstanceOf(RecordingStopped);
      expect(loadCheckpoint(dir).world).toEqual(initial);
      const journal = loadJournal(dir);
      expect(journal).toHaveLength(7);
      const resumedEngine = new JournalEngine(dir, journal, configuration, new MockDecisionEngine());
      const resumed = new Simulation(resumedEngine, loadCheckpoint(dir).world);
      await until(resumed, 1, 1380);
      saveCheckpoint(dir, resumed.world, resumedEngine.cursor, 1);
      const journalLength = journal.length;
      const replayEngine = new JournalEngine(dir, loadJournal(dir), configuration, undefined);
      const replay = new Simulation(replayEngine, structuredClone(initial));
      await until(replay, 1, 1380);
      replayEngine.assertConsumed();
      expect(replay.world).toEqual(resumed.world);
      expect(journal).toHaveLength(journalLength);
      const uninterrupted = new Simulation(new MockDecisionEngine(), structuredClone(initial));
      await until(uninterrupted, 1, 1380);
      const stripTiming = (world: typeof initial) => ({ ...world, traces: world.traces.map(({ latencyMs: _latencyMs, queueMs: _queueMs, serviceMs: _serviceMs, ...trace }) => trace) });
      expect(stripTiming(resumed.world)).toEqual(stripTiming(uninterrupted.world));
      const wrong = structuredClone(journal[0].job);
      wrong.state.world.city_principle += " changed";
      const mismatch = new JournalEngine(dir, journal, configuration, undefined);
      await expect(mismatch.evaluate([wrong])).rejects.toThrow("mismatch");
      const missing = new JournalEngine(dir, journal, configuration, undefined, journal.length);
      await expect(missing.evaluate([journal[0].job])).rejects.toThrow("Missing recorded result");
      const pointer = JSON.parse(readFileSync(join(dir, "latest.json"), "utf8"));
      writeFileSync(join(dir, "checkpoints", pointer.name), "{}");
      expect(() => loadCheckpoint(dir)).toThrow("Damaged checkpoint");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("continues across the night from a committed evening boundary", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fuzzy-evening-"));
    try {
      const initial = generateCity("recording-evening-resume", "mock", 100);
      saveCheckpoint(dir, initial, 0, 0);
      const firstEngine = new JournalEngine(dir, [], configuration, new MockDecisionEngine());
      const first = new Simulation(firstEngine, structuredClone(initial));
      await until(first, 1, 1380);
      saveCheckpoint(dir, first.world, firstEngine.cursor, 1);
      const cp = loadCheckpoint(dir);
      const secondEngine = new JournalEngine(dir, loadJournal(dir), configuration, new MockDecisionEngine(), cp.journalCount);
      const resumed = new Simulation(secondEngine, cp.world);
      await until(resumed, 2, 1380);
      saveCheckpoint(dir, resumed.world, secondEngine.cursor, 2);
      const replayEngine = new JournalEngine(dir, loadJournal(dir), configuration, undefined);
      const replay = new Simulation(replayEngine, structuredClone(initial));
      await until(replay, 2, 1380);
      replayEngine.assertConsumed();
      expect(replay.world).toEqual(resumed.world);
      expect(resumed.world.day).toBe(2);
      expect(resumed.world.events.some((event) => event.type === "day" && event.day === 2)).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("rejects missing history chunks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fuzzy-chunk-"));
    try {
      const world = generateCity("recording-chunk", "mock", 100);
      saveCheckpoint(dir, world, 0, 0);
      world.events.push({ id: "event_1", day: 1, minute: 991, type: "day", text: "Test", citizenIds: [], traceIds: [] });
      saveCheckpoint(dir, world, 0, 0);
      const chunk = loadCheckpoint(dir).chunks[1];
      unlinkSync(join(dir, "chunks", chunk.name));
      expect(() => loadCheckpoint(dir)).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
