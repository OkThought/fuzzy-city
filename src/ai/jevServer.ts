// Legacy hosted-Jev helper retained for compatibility. All inference goes
// through the same TypeSafe-compatible DecisionProvider boundary.
import { HttpDecisionProvider } from "./httpDecisionProvider";
import { validateResponse, questionsFor } from "./jevApiTypes";
import { mockEvaluation } from "./mockProbabilities";
import { ProviderError } from "./decisionProvider";
import type { Evaluation, Job } from "../sim/types";
export { ConcurrencyPool } from "./concurrencyPool";
interface Options {
  key: string;
  model: string;
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}
export async function evaluateLive(
  job: Job,
  options: Options,
): Promise<Evaluation> {
  const start = performance.now();
  let calls = 0;
  try {
    const provider = new HttpDecisionProvider(
      {
        id: "typesafe",
        model: options.model,
        key: options.key,
        baseUrl: "https://api.typesafe.ai",
        concurrency: 8,
        timeoutMs: options.timeoutMs ?? 12000,
      },
      options.fetcher,
      options.sleep,
    );
    const raw = await provider.infer({
      model: options.model,
      state: job.state,
      questions: questionsFor(job),
    });
    calls = raw.apiCalls;
    return {
      ...validateResponse(raw.response, job),
      source: "jev",
      provider: "typesafe",
      apiCalls: calls,
      latencyMs: performance.now() - start,
    };
  } catch (error) {
    return {
      ...mockEvaluation(job, "fallback"),
      apiCalls: error instanceof ProviderError ? error.apiCalls : calls,
      latencyMs: performance.now() - start,
      error:
        error instanceof Error ? error.message : "Hosted evaluation failed",
    };
  }
}
