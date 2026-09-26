import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { generateCity } from "../src/sim/cityGenerator";
import { decisionState } from "../src/sim/decisions";
import type { Job } from "../src/sim/types";
import {
  questionsFor,
  validJob,
  validateResponse,
} from "../src/ai/jevApiTypes";
import { ConcurrencyPool, evaluateLive } from "../src/ai/jevServer";
import { POST } from "../src/app/api/jev/batch/route";
const world = generateCity();
const job: Job = {
  id: "test",
  kind: "evening_intentions",
  state: decisionState(world, world.citizens[0]),
};
const envelope = () => ({
  model: "jev-test",
  answers: Object.fromEntries(
    Object.keys(questionsFor(job)).map((k) => [k, { type: "noul", noul: 0.6 }]),
  ),
  usage: { input_tokens: 321, output_tokens: 23 },
});
describe("Jev contract and graceful failures", () => {
  it("sends all five typed Noul questions against one shared state and records tokens", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(envelope()));
    const result = await evaluateLive(job, {
      key: "test-secret",
      model: "jev-latest",
      fetcher,
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init?.headers).toHaveProperty("Authorization", "Bearer test-secret");
    const body = JSON.parse(String(init?.body));
    expect(body.state).toEqual(job.state);
    expect(Object.values(body.questions)).toHaveLength(5);
    expect(result).toMatchObject({
      source: "jev",
      inputTokens: 321,
      outputTokens: 23,
      apiCalls: 1,
    });
    expect(JSON.stringify(result)).not.toContain("test-secret");
  });
  it("generates candidate-ID criteria plus none, uses the full distribution, rejects missing keys", () => {
    const choice = structuredClone(job);
    choice.kind = "friend_selection";
    const r =
      world.relationships[
        `${world.citizens[0].id}>${world.citizens[0].knownPeople[0]}`
      ];
    choice.state.candidates = { [r.toCitizenId]: r };
    const q = questionsFor(choice).friend;
    expect(q.type).toBe("choice");
    if (q.type !== "choice") throw new Error();
    expect(Object.keys(q.criteria)).toEqual([r.toCitizenId, "none"]);
    const response = {
      model: "jev-test",
      answers: {
        friend: {
          type: "choice",
          choice: "none",
          confidence: 0.8,
          probabilities: { [r.toCitizenId]: 0.2, none: 0.8 },
        },
      },
      usage: { input_tokens: 44, output_tokens: 5 },
    };
    expect(validateResponse(response, choice).answers).toEqual(
      response.answers.friend.probabilities,
    );
    delete (response.answers.friend.probabilities as Record<string, number>)[
      r.toCitizenId
    ];
    expect(() => validateResponse(response, choice)).toThrow();
  });
  it("retries transient failures with bounded exponential backoff and Retry-After", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "Retry-After": "2" } }),
      )
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(Response.json(envelope()));
    const sleep = vi.fn(async (_ms: number) => {});
    const result = await evaluateLive(job, {
      key: "key",
      model: "jev",
      fetcher,
      sleep,
    });
    expect(result.source).toBe("jev");
    expect(result.apiCalls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(1600);
    expect(sleep.mock.calls[0][0]).toBeLessThanOrEqual(2400);
    expect(sleep.mock.calls[1][0]).toBeGreaterThanOrEqual(800);
    expect(sleep.mock.calls[1][0]).toBeLessThanOrEqual(1200);
  });
  it("never labels errors as Jev and does not endlessly retry", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 500 }));
    const result = await evaluateLive(job, {
      key: "secret",
      model: "jev",
      fetcher,
      sleep: async () => {},
    });
    expect(result.source).toBe("fallback");
    expect(result.model).toBe("deterministic-mock-v1");
    expect(result.apiCalls).toBe(1);
    const bad = await evaluateLive(job, {
      key: "secret",
      model: "jev",
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ model: "jev", answers: {} })),
    });
    expect(bad.source).toBe("fallback");
    const absent = await evaluateLive(job, { key: "", model: "jev" });
    expect(absent.apiCalls).toBe(0);
    expect(absent.source).toBe("fallback");
  });
  it("rejects nonfinite and out-of-range probabilities and invalid token usage", () => {
    const data = envelope();
    data.answers.wants_rest.noul = 1.2;
    expect(() => validateResponse(data, job)).toThrow();
    data.answers.wants_rest.noul = 0.5;
    data.usage.input_tokens = -1;
    expect(() => validateResponse(data, job)).toThrow();
  });
  it("bounds concurrent work across batches and preserves input result order", async () => {
    const pool = new ConcurrencyPool(3);
    let active = 0,
      peak = 0;
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        pool.run(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, (i % 3) + 1));
          active--;
          return i;
        }),
      ),
    );
    expect(peak).toBe(3);
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(pool.active).toBe(0);
  });
  it("validates jobs and rejects cross-origin or malformed proxy requests", async () => {
    expect(validJob(job)).toBe(true);
    expect(validJob({ ...job, state: {} })).toBe(false);
    const response = await POST(
      new Request("http://localhost/api/jev/batch", {
        method: "POST",
        headers: { origin: "http://untrusted.test" },
        body: JSON.stringify({ jobs: [job] }),
      }),
    );
    expect(response.status).toBe(403);
    const malformed = await POST(
      new Request("http://localhost/api/jev/batch", {
        method: "POST",
        body: "{",
      }),
    );
    expect(malformed.status).toBe(400);
  });
  it("keeps API credentials out of the client graph", () => {
    for (const file of [
      "src/ai/jevEngine.ts",
      "src/ai/mockEngine.ts",
      "src/components/FuzzyCity.tsx",
      "src/ai/jevApiTypes.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("TYPESAFE_API_KEY");
      expect(source).not.toContain("AI_GATEWAY_API_KEY");
      expect(source).not.toContain("httpDecisionProvider");
      expect(source).not.toContain("jevServer");
    }
  });
});
