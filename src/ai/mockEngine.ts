import type { DecisionEngine } from "./decisionEngine";
import type { Job } from "../sim/types";
import { MockDecisionProvider } from "./mockDecisionProvider";
import { questionsFor, validateResponse } from "./jevApiTypes";
export { mockEvaluation } from "./mockProbabilities";
export class MockDecisionEngine implements DecisionEngine {
  private provider = new MockDecisionProvider();
  async evaluate(jobs: Job[]) {
    return Promise.all(
      jobs.map(async (job) => {
        const raw = await this.provider.infer({
          model: this.provider.model,
          state: job.state,
          questions: questionsFor(job),
        });
        return {
          ...validateResponse(raw.response, job),
          source: "mock" as const,
          provider: "mock" as const,
          latencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          apiCalls: 0,
        };
      }),
    );
  }
}
