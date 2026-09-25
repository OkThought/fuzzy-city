import type { DecisionEngine } from "./decisionEngine";
import type { Evaluation, Job } from "../sim/types";
export class JevDecisionEngine implements DecisionEngine {
  async evaluate(jobs: Job[]): Promise<Evaluation[]> {
    const results: Evaluation[] = [];
    for (let i = 0; i < jobs.length; i += 16) {
      // One outstanding browser batch. The server bounds all upstream calls.
      const batch = jobs.slice(i, i + 16);
      const response = await fetch("/api/jev/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: batch }),
        signal: AbortSignal.timeout(100000),
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          `${error.error || `Decision proxy unavailable (${response.status})`}. Simulation paused; reload your last checkpoint.`,
        );
      }
      const data = (await response.json()) as { results: Evaluation[] };
      if (!Array.isArray(data.results) || data.results.length !== batch.length)
        throw new Error("Incomplete proxy response");
      results.push(...data.results);
    }
    return results;
  }
}
