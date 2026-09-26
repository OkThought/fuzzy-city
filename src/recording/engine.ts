import { openSync, closeSync, writeSync, fsyncSync } from "node:fs";
import { join } from "node:path";
import type { DecisionEngine } from "../ai/decisionEngine";
import type { Evaluation, Job } from "../sim/types";
import { questionsFor } from "../ai/jevApiTypes";
import { canonical, FORMAT, requestHash, sha, type JournalEntry } from "./format";
import { CURRENT_RULES, type RulesId } from "../sim/rules";

function validateEvaluation(job: Job, result: Evaluation, provider: string, model: string) {
  if (result.source === "fallback" || result.error || result.provider !== provider || result.model !== model) throw new Error(`Invalid provider result for ${job.id}`);
  const questions = questionsFor(job);
  const expected = job.kind === "friend_selection" ? Object.keys(questions.friend.criteria ?? {}) : Object.keys(questions);
  if (Object.keys(result.answers).length !== expected.length || expected.some((key) => typeof result.answers[key] !== "number" || !Number.isFinite(result.answers[key]) || result.answers[key] < 0 || result.answers[key] > 1)) throw new Error(`Malformed probabilities for ${job.id}`);
  if (job.kind === "friend_selection" && Math.abs(Object.values(result.answers).reduce((a, b) => a + b, 0) - 1) > 0.001) throw new Error(`Invalid choice distribution for ${job.id}`);
  for (const value of [result.apiCalls, result.inputTokens, result.outputTokens, result.latencyMs]) if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid measurement for ${job.id}`);
}

export class JournalEngine implements DecisionEngine {
  cursor: number;
  constructor(
    private readonly dir: string,
    readonly entries: JournalEntry[],
    private readonly configuration: JournalEntry["configuration"],
    private readonly live: DecisionEngine | undefined,
    start = 0,
    private readonly shouldStop: () => boolean = () => false,
    private readonly rules: RulesId = CURRENT_RULES.id,
  ) { this.cursor = start; }
  async evaluate(jobs: Job[]): Promise<Evaluation[]> {
    const results: Evaluation[] = [];
    for (const job of jobs) {
      if (this.shouldStop()) throw new RecordingStopped();
      const questions = questionsFor(job);
      const key = requestHash(job, questions, this.configuration, this.rules);
      const old = this.entries[this.cursor];
      if (old) {
        if (old.requestHash !== key || canonical(old.job) !== canonical(job) || canonical(old.configuration) !== canonical(this.configuration)) throw new Error(`Recorded request mismatch at sequence ${this.cursor}: ${job.id}`);
        validateEvaluation(job, old.evaluation, this.configuration.provider, this.configuration.model);
        this.cursor++;
        results.push(old.evaluation);
        continue;
      }
      if (!this.live) throw new Error(`Missing recorded result at sequence ${this.cursor}: ${job.id}`);
      const [evaluation] = await this.live.evaluate([job]);
      if (!evaluation) throw new Error(`Missing provider result for ${job.id}`);
      validateEvaluation(job, evaluation, this.configuration.provider, this.configuration.model);
      const body = { version: FORMAT, sequence: this.entries.length, previousHash: this.entries.at(-1)?.hash ?? "genesis", requestHash: key, job, questions, configuration: this.configuration, evaluation };
      const entry: JournalEntry = { ...body, hash: sha(canonical(body)) };
      const fd = openSync(join(this.dir, "journal.jsonl"), "a");
      try { writeSync(fd, `${JSON.stringify(entry)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
      this.entries.push(entry);
      this.cursor++;
      results.push(evaluation);
    }
    return results;
  }
  assertConsumed() { if (this.cursor !== this.entries.length) throw new Error(`Unconsumed journal entries: ${this.entries.length - this.cursor}`); }
}
export class RecordingStopped extends Error { constructor() { super("Recording stopped at a recoverable boundary"); } }
