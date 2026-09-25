import { describe, expect, it, vi } from "vitest";
import { generateCity } from "../src/sim/cityGenerator";
import { Simulation } from "../src/sim/simulation";
import { MockDecisionEngine } from "../src/ai/mockEngine";
import { decisionState } from "../src/sim/decisions";
import { questionsFor } from "../src/ai/jevApiTypes";
import { providerConfig } from "../src/ai/providerConfig";
import { HttpDecisionProvider } from "../src/ai/httpDecisionProvider";
import { ProviderDecisionEngine } from "../src/ai/providerEngine";
import { MockDecisionProvider } from "../src/ai/mockDecisionProvider";
import { ConcurrencyPool } from "../src/ai/concurrencyPool";
import { benchmarkConfig } from "../src/benchmark/runner";
import { percentile, summarize } from "../src/benchmark/metrics";
import type { DecisionMeasurement } from "../src/ai/providerEngine";
import type { Job } from "../src/sim/types";

const world = generateCity("provider-tests", "jevk5", 100);
const job: Job = {
  id: "probe",
  kind: "evening_intentions",
  state: decisionState(world, world.citizens[0]),
};
const envelope = {
  model: "alibiserikbay/JevK5",
  answers: Object.fromEntries(
    Object.keys(questionsFor(job)).map((key) => [
      key,
      { type: "noul", noul: 0.65 },
    ]),
  ),
  usage: { input_tokens: 4200, output_tokens: 0 },
  latency_ms: 345,
};
describe("local decision providers", () => {
  it("defaults to local JevK5 without needing or forwarding a paid key", async () => {
    const config = providerConfig({
      TYPESAFE_API_KEY: "must-not-leak",
      DECISION_API_KEY: "also-not-needed",
    });
    expect(config).toMatchObject({
      id: "jevk5",
      baseUrl: "http://127.0.0.1:8090",
      model: "alibiserikbay/JevK5",
      key: "",
      concurrency: 1,
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(envelope));
    const engine = new ProviderDecisionEngine(
      new HttpDecisionProvider(config, fetcher),
    );
    const [result] = await engine.evaluate([job]);
    expect(fetcher.mock.calls[0][0]).toBe("http://127.0.0.1:8090/v1/systemone");
    expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty(
      "Authorization",
    );
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      model: config.model,
      state: job.state,
      questions: questionsFor(job),
    });
    expect(result).toMatchObject({
      source: "jevk5",
      provider: "jevk5",
      model: config.model,
      apiCalls: 1,
      inputTokens: 4200,
      outputTokens: 0,
    });
  });
  it("uses the same wire boundary for a mock and rejects malformed live outputs", async () => {
    const provider = new MockDecisionProvider();
    const raw = await provider.infer({
      model: provider.model,
      state: job.state,
      questions: questionsFor(job),
    });
    expect(raw.response.answers).toHaveProperty("wants_rest");
    const bad = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ...envelope, answers: {} }));
    const measurements: DecisionMeasurement[] = [];
    const engine = new ProviderDecisionEngine(
      new HttpDecisionProvider(providerConfig({}), bad),
      new ConcurrencyPool(1),
      (m) => measurements.push(m),
    );
    await expect(engine.evaluate([job])).rejects.toThrow("Missing");
    expect(measurements[0]).toMatchObject({
      success: false,
      judgments: 0,
      apiCalls: 1,
    });
  });
  it("does not retry a local socket timeout into duplicate GPU work or substitute mock answers", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("timeout"));
    const engine = new ProviderDecisionEngine(
      new HttpDecisionProvider(providerConfig({}), fetcher),
    );
    await expect(engine.evaluate([job])).rejects.toThrow("timeout");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("drains a failed batch, preserves queue limits, and cancels waiting work", async () => {
    const controller = new AbortController();
    let calls = 0;
    const provider = {
      id: "jevk5" as const,
      model: "alibiserikbay/JevK5",
      infer: async () => {
        calls++;
        controller.abort();
        return { response: envelope, apiCalls: 1, serviceMs: 1 };
      },
    };
    const pool = new ConcurrencyPool(1);
    const engine = new ProviderDecisionEngine(
      provider,
      pool,
      undefined,
      controller.signal,
    );
    await expect(engine.evaluate([job, job, job])).rejects.toThrow();
    expect(calls).toBe(1);
    expect(pool.snapshot()).toEqual({ active: 0, waiting: 0, limit: 1 });
  });
  it("keeps configured providers explicit and validates concurrency", () => {
    expect(providerConfig({ DECISION_PROVIDER: "mock" }).id).toBe("mock");
    expect(providerConfig({ DECISION_PROVIDER: "typesafe" }).id).toBe(
      "typesafe",
    );
    expect(() => providerConfig({ DECISION_PROVIDER: "typo" })).toThrow();
    expect(() => providerConfig({ DECISION_CONCURRENCY: "1000" })).toThrow();
  });
});
describe("Vercel AI Gateway Jev provider", () => {
  it("uses the gateway key, compatible endpoint and Jev model without changing judgments", async () => {
    const config = providerConfig({
      JEV_PROVIDER: "vercel",
      AI_GATEWAY_API_KEY: "gateway-test-secret",
      TYPESAFE_API_KEY: "unused-typesafe-secret",
      DECISION_API_BASE_URL: "https://old.example.test",
      DECISION_MODEL: "old-model",
    });
    expect(config).toMatchObject({
      id: "vercel",
      baseUrl: "https://ai-gateway.vercel.sh/typesafe",
      model: "typesafe-ai/jev",
      key: "gateway-test-secret",
      concurrency: 8,
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ ...envelope, model: "typesafe-ai/jev" }),
    );
    const engine = new ProviderDecisionEngine(
      new HttpDecisionProvider(config, fetcher),
    );
    const [result] = await engine.evaluate([job]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://ai-gateway.vercel.sh/typesafe/v1/systemone");
    expect(init?.headers).toHaveProperty("Authorization", "Bearer gateway-test-secret");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "typesafe-ai/jev",
      state: job.state,
      questions: questionsFor(job),
    });
    expect(result).toMatchObject({
      source: "jev",
      provider: "vercel",
      model: "typesafe-ai/jev",
      answers: Object.fromEntries(Object.keys(questionsFor(job)).map((key) => [key, 0.65])),
      inputTokens: 4200,
      outputTokens: 0,
      apiCalls: 1,
    });
    expect(JSON.stringify(result)).not.toContain("gateway-test-secret");
  });

  it("fails before sending a request when the gateway key is absent", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const engine = new ProviderDecisionEngine(
      new HttpDecisionProvider(providerConfig({ JEV_PROVIDER: "vercel" }), fetcher),
    );
    await expect(engine.evaluate([job])).rejects.toThrow("AI_GATEWAY_API_KEY");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps direct TypeSafe available only when explicitly selected", () => {
    expect(providerConfig({
      JEV_PROVIDER: "typesafe",
      TYPESAFE_API_KEY: "direct-test-secret",
    })).toMatchObject({
      baseUrl: "https://api.typesafe.ai",
      model: "jev-latest",
      key: "direct-test-secret",
    });
  });
});
describe("stress workload and measurement integrity", () => {
  it.each([100, 250, 500, 1000])(
    "simulates a complete %i-citizen evening with valid contacts and real interactions",
    async (population) => {
      const w = generateCity("fuzzy-city-001", "mock", population);
      expect(w.citizens).toHaveLength(population);
      const ids = new Set(w.citizens.map((c) => c.id));
      expect(
        w.citizens.every((c) => c.knownPeople.every((id) => ids.has(id))),
      ).toBe(true);
      const sim = new Simulation(new MockDecisionEngine(), w);
      await sim.step(390);
      expect(
        w.traces.filter((t) => t.kind === "evening_intentions"),
      ).toHaveLength(population);
      expect(sim.today.interactions).toBeGreaterThan(0);
      expect(
        w.traces
          .filter((t) => t.kind === "friend_selection")
          .every((t) => Object.keys(t.stateSnapshot.candidates!).length > 0),
      ).toBe(true);
    },
  );
  it("reports successful decisions/s, nearest-rank percentiles and time-weighted waiting depth without inventing VRAM", () => {
    const values = [
      {
        latencyMs: 10,
        serviceMs: 8,
        queueMs: 2,
        success: true,
        judgments: 5,
        apiCalls: 1,
      },
      {
        latencyMs: 90,
        serviceMs: 20,
        queueMs: 70,
        success: true,
        judgments: 4,
        apiCalls: 1,
      },
      {
        latencyMs: 100,
        serviceMs: 100,
        queueMs: 0,
        success: false,
        judgments: 0,
        apiCalls: 3,
      },
    ] as DecisionMeasurement[];
    const result = summarize(
      values,
      2000,
      [
        { elapsedMs: 0, active: 1, waiting: 2, limit: 1 },
        { elapsedMs: 1000, active: 0, waiting: 0, limit: 1 },
      ],
      [],
    );
    expect(result).toMatchObject({
      completedDecisions: 2,
      failedDecisions: 1,
      decisionsPerSecond: 1,
      judgmentsPerSecond: 4.5,
      apiCalls: 5,
      latencyMs: { p50: 10, p95: 90 },
      queue: { peak: 2, mean: 1 },
      vram: { available: false, devices: [] },
    });
    expect(percentile([], 0.95)).toBeNull();
  });
  it("rejects arbitrary or unbounded benchmark workloads", () => {
    expect(
      benchmarkConfig({
        populations: [100, 250, 500, 1000],
        minutes: 390,
        concurrency: 1,
      }).seed,
    ).toBe("fuzzy-city-001");
    for (const config of [
      { populations: [1], minutes: 35, concurrency: 1 },
      { populations: [100, 100], minutes: 35, concurrency: 1 },
      { populations: [100], minutes: 99999, concurrency: 1 },
      { populations: [100], minutes: 35, concurrency: 99 },
    ])
      expect(() => benchmarkConfig(config)).toThrow();
  });
});
