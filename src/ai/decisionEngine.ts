import type { Evaluation, Job } from "../sim/types";
export interface DecisionEngine {
  evaluate(jobs: Job[]): Promise<Evaluation[]>;
}
