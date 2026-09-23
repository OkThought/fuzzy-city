import { describe, expect, it } from "vitest";
import { generateCity } from "../src/sim/cityGenerator";
import { clamp, entropy, normalize, Rng, sample } from "../src/sim/rng";
import { activityDistribution, decisionState } from "../src/sim/decisions";
import { MockDecisionEngine, mockEvaluation } from "../src/ai/mockEngine";
import { Simulation } from "../src/sim/simulation";
import { applyInteraction } from "../src/sim/relationships";
import { exportRun } from "../src/sim/export";
import { roadPoint } from "../src/sim/movement";
import { MEMORY_LIMIT, type DecisionTrace, type Job } from "../src/sim/types";

describe("seeded primitives", () => {
  it("keeps road intersections stable when a traveling citizen is rerouted", () => {
    expect(roadPoint({ x: 49, y: 169 })).toEqual({ x: 49, y: 169 });
    expect(roadPoint({ x: 60, y: 180 })).toEqual({ x: 49, y: 169 });
  });
  it("generates exactly 1,000 varied citizens and the same complete world for a seed", () => {
    const a = generateCity(),
      b = generateCity();
    expect(a).toEqual(b);
    expect(a.citizens).toHaveLength(1000);
    expect(
      a.locations.filter((l) => l.kind === "home").length,
    ).toBeGreaterThanOrEqual(250);
    expect(a.locations.filter((l) => l.kind === "work")).toHaveLength(40);
    expect(a.locations.filter((l) => l.kind === "cafe")).toHaveLength(8);
    expect(a.locations.filter((l) => l.kind === "park")).toHaveLength(3);
    expect(
      a.citizens.every(
        (c) => c.knownPeople.length >= 3 && c.knownPeople.length <= 8,
      ),
    ).toBe(true);
    expect(generateCity("different").citizens).not.toEqual(a.citizens);
  });
  it("normalizes and samples the supplied RNG, including boundary cases", () => {
    expect(normalize({ a: 1, b: 3 })).toEqual({ a: 0.25, b: 0.75 });
    expect(sample({ a: 0.25, b: 0.75 }, 0)).toBe("a");
    expect(sample({ a: 0.25, b: 0.75 }, 0.25)).toBe("b");
    expect(sample({ a: 0.25, b: 0.75 }, 0.9999)).toBe("b");
    const rng = new Rng("sample");
    const rng2 = new Rng("sample");
    expect(Array.from({ length: 100 }, () => rng.next())).toEqual(
      Array.from({ length: 100 }, () => rng2.next()),
    );
    expect(() => normalize({ a: -1 })).toThrow();
  });
  it("computes normalized binary entropy exactly at important points", () => {
    expect(entropy(0)).toBe(0);
    expect(entropy(1)).toBe(0);
    expect(entropy(0.5)).toBe(1);
    expect(entropy(0.1)).toBeCloseTo(entropy(0.9));
    expect(clamp(-2, -1, 1)).toBe(-1);
  });
  it("uses the specified transparent activity weights", () => {
    const c = generateCity().citizens[0];
    const p = {
      wants_rest: 0.8,
      seeks_company: 0.6,
      seeks_novelty: 0.5,
      willing_to_spend: 0.7,
      wants_extra_work: 0.1,
    };
    const d = activityDistribution(c, p, 0.5);
    expect(d.weights.home_rest).toBeCloseTo(
      0.15 + 1.4 * 0.8 + 0.35 * (1 - c.state.energy),
    );
    expect(d.weights.visit_friend).toBeCloseTo(0.05 + 1.3 * 0.6 * 0.5);
    expect(
      Object.values(d.probabilities).reduce((a, b) => a + b, 0),
    ).toBeCloseTo(1);
  });
  it("mock answers are deterministic, plausible and honor known cultural presets", () => {
    const w = generateCity();
    const job: Job = {
      id: "test",
      kind: "evening_intentions",
      state: decisionState(w, w.citizens[0]),
    };
    expect(mockEvaluation(job)).toEqual(mockEvaluation(job));
    const tired = structuredClone(job);
    tired.state.citizen.current_state.energy = 0;
    const rested = structuredClone(job);
    rested.state.citizen.current_state.energy = 1;
    expect(mockEvaluation(tired).answers.wants_rest).toBeGreaterThan(
      mockEvaluation(rested).answers.wants_rest,
    );
    const ambitious = structuredClone(job);
    ambitious.state.world.city_principle =
      "We admire achievement and discipline.";
    expect(mockEvaluation(ambitious).answers.wants_extra_work).toBeGreaterThan(
      mockEvaluation(job).answers.wants_extra_work - 0.01,
    );
  });
});

describe("causal simulation", () => {
  it("preserves historical context, moves citizens, counts returned judgments and replays", async () => {
    const a = new Simulation(new MockDecisionEngine()),
      b = new Simulation(new MockDecisionEngine());
    const start = structuredClone(a.world.citizens.map((c) => c.position));
    await a.step(60);
    const oldTrace = structuredClone(a.world.traces[0]);
    a.changePrinciple("People admire novelty and unfamiliar experiences.");
    await a.step(220);
    await b.step(60);
    b.changePrinciple("People admire novelty and unfamiliar experiences.");
    await b.step(220);
    expect(a.world).toEqual(b.world);
    expect(a.world.traces[0]).toEqual(oldTrace);
    expect(a.world.traces.at(-1)!.stateSnapshot.world.city_principle).toBe(
      a.world.principle,
    );
    expect(a.world.citizens.map((c) => c.position)).not.toEqual(start);
    expect(a.world.citizens.every((c) => c.currentPlan?.day === 1)).toBe(true);
    expect(
      new Set(a.world.citizens.map((c) => c.currentPlan!.activity)).size,
    ).toBe(6);
    expect(a.today.interactions).toBeGreaterThan(100);
    expect(
      a.world.traces.filter((t) => t.kind === "friend_selection"),
    ).toHaveLength(a.today.activities.visit_friend);
    expect(a.world.judgments).toBe(
      a.world.traces.reduce(
        (n, t) =>
          n +
          (t.kind === "evening_intentions"
            ? 5
            : t.kind === "social_interaction"
              ? 4
              : 1),
        0,
      ),
    );
    expect(a.world.apiCalls).toBe(0);
    const pairCounts: Record<string, number> = {};
    for (const t of a.world.traces.filter(
      (t) => t.kind === "social_interaction",
    ))
      for (const id of t.citizenIds) pairCounts[id] = (pairCounts[id] ?? 0) + 1;
    expect(Math.max(...Object.values(pairCounts))).toBe(1);
    for (const c of a.world.citizens.filter((c) => c.currentPlan?.friendId))
      expect(c.interactedDay).toBe(1);
    const snapshot = structuredClone(a.world);
    const restored = new Simulation(new MockDecisionEngine(), snapshot);
    await restored.step(15);
    await a.step(15);
    expect(restored.world).toEqual(a.world);
    const exported = exportRun(a.world);
    expect(exported.judgmentCount).toBe(a.world.judgments);
    expect(JSON.parse(JSON.stringify(exported)).world.rngState).toBe(
      a.rng.state,
    );
  });
  it("keeps states bounded across 10+ evenings, retains memories and feeds changed relationships forward", async () => {
    const sim = new Simulation(new MockDecisionEngine());
    await sim.step(10 * 1440 + 330);
    expect(sim.world.day).toBe(11);
    expect(
      sim.world.traces.filter((t) => t.kind === "evening_intentions"),
    ).toHaveLength(11000);
    expect(sim.world.metrics.every((day) => day.interactions > 0)).toBe(true);
    for (const c of sim.world.citizens) {
      for (const [key, value] of Object.entries(c.state))
        if (key !== "money") expect(value >= 0 && value <= 1).toBe(true);
      expect(c.state.money).toBeGreaterThanOrEqual(0);
      expect(c.recentMemories.length).toBeLessThanOrEqual(MEMORY_LIMIT);
    }
    for (const r of Object.values(sim.world.relationships)) {
      expect(r.affinity >= -1 && r.affinity <= 1).toBe(true);
      expect(r.familiarity >= 0 && r.familiarity <= 1).toBe(true);
    }
    const later = sim.world.traces.filter(
      (t) => t.simulationDay > 1 && t.kind === "evening_intentions",
    );
    expect(
      later.some((t) =>
        t.stateSnapshot.citizen.known_people.some(
          (r) => r.interactionCount > 0,
        ),
      ),
    ).toBe(true);
    for (let day = 1; day <= 11; day++) {
      const interactions = sim.world.traces.filter(
        (t) => t.kind === "social_interaction" && t.simulationDay === day,
      );
      const ids = interactions.flatMap((t) => t.citizenIds);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it("clamps extreme relationship updates and bounds structured memories", () => {
    const w = generateCity();
    const [a, b] = w.citizens;
    const trace = {
      id: "test",
      answers: {
        a_felt_connection: 1,
        b_felt_connection: 0,
        felt_tension: 1,
        memorable: 1,
      },
    } as unknown as DecisionTrace;
    for (let i = 0; i < 100; i++) applyInteraction(w, a, b, trace);
    expect(w.relationships[`${a.id}>${b.id}`].affinity).toBeLessThanOrEqual(1);
    expect(w.relationships[`${b.id}>${a.id}`].affinity).toBe(-1);
    expect(a.recentMemories).toHaveLength(MEMORY_LIMIT);
    expect(b.recentMemories).toHaveLength(MEMORY_LIMIT);
  });
});
