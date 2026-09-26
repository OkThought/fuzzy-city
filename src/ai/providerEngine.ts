import type { DecisionEngine } from "./decisionEngine";
import type { DecisionProvider, ProviderAttempt } from "./decisionProvider";
import { errorApiCalls, ProviderError } from "./decisionProvider";
import { ConcurrencyPool } from "./concurrencyPool";
import { questionsFor, validateResponse } from "./jevApiTypes";
import type { Evaluation, Job } from "../sim/types";
export interface DecisionMeasurement {
  jobId: string;
  kind: Job["kind"];
  success: boolean;
  provider: string;
  model: string;
  queueMs: number;
  serviceMs: number;
  latencyMs: number;
  apiCalls: number;
  judgments: number;
  inputTokens: number;
  outputTokens: number;
  attempts: ProviderAttempt[];
  ambiguous: boolean;
  error?: string;
}
export class ProviderDecisionEngine implements DecisionEngine {
  constructor(
    public provider: DecisionProvider,
    public pool = new ConcurrencyPool(1),
    private observe?: (measurement: DecisionMeasurement) => void,
    private signal?: AbortSignal,
  ) {}
  async evaluate(jobs: Job[]): Promise<Evaluation[]> {
    // Cap resident work, preserving order. A failing batch drains its admitted
    // calls before rejecting, so no orphan work contaminates the next benchmark.
    const results: Evaluation[] = [];
    for (let offset = 0; offset < jobs.length; offset += 32) {
      const settled = await Promise.allSettled(
        jobs.slice(offset, offset + 32).map((job) => this.evaluateOne(job)),
      );
      const error = settled.find(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      if (error) throw error.reason;
      for (const r of settled)
        if (r.status === "fulfilled") results.push(r.value);
    }
    return results;
  }
  private async evaluateOne(job: Job): Promise<Evaluation> {
    const submitted = performance.now();
    return this.pool.run(async () => {
      const started = performance.now();
      let calls = 0;
      try {
        this.signal?.throwIfAborted();
        // Cancellation stops waiting work; let already-admitted GPU work finish
        // so the next run cannot unknowingly overlap a cancelled HTTP request.
        const raw = await this.provider.infer({
          model: this.provider.model,
          state: job.state,
          questions: questionsFor(job),
        });
        calls = raw.apiCalls;
        const data = validateResponse(raw.response, job);
        const completed = performance.now();
        const measurement: DecisionMeasurement = {
          jobId: job.id,
          kind: job.kind,
          success: true,
          provider: this.provider.id,
          model: data.model,
          queueMs: started - submitted,
          serviceMs: raw.serviceMs,
          latencyMs: completed - submitted,
          apiCalls: calls,
          judgments: Object.keys(questionsFor(job)).length,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          attempts: raw.attempts,
          ambiguous: false,
        };
        this.observe?.(measurement);
        return {
          ...data,
          source: this.provider.id === "typesafe" || this.provider.id === "vercel" ? "jev" : this.provider.id,
          provider: this.provider.id,
          latencyMs: measurement.latencyMs,
          queueMs: measurement.queueMs,
          serviceMs: measurement.serviceMs,
          apiCalls: calls,
          providerAttempts: raw.attempts,
        };
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "Decision evaluation failed";
        this.observe?.({
          jobId: job.id,
          kind: job.kind,
          success: false,
          provider: this.provider.id,
          model: this.provider.model,
          queueMs: started - submitted,
          serviceMs: performance.now() - started,
          latencyMs: performance.now() - submitted,
          apiCalls: errorApiCalls(error, calls),
          judgments: 0,
          inputTokens: 0,
          outputTokens: 0,
          attempts: error instanceof ProviderError ? error.attempts : [],
          ambiguous: error instanceof ProviderError && error.ambiguous,
          error: reason,
        });
        throw error instanceof Error ? error : new Error(reason);
      }
    });
  }
}
