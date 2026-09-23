// This module is imported only by the server route. Never import into a client component.
import { mockEvaluation } from "./mockEngine";
import { questionsFor, validateResponse } from "./jevApiTypes";
import type { Evaluation, Job } from "../sim/types";
export class ConcurrencyPool {
  active = 0;
  private waiting: (() => void)[] = [];
  constructor(
    public limit: number,
    public maxQueue = 256,
  ) {}
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      if (this.waiting.length >= this.maxQueue)
        throw new Error("Server queue is full");
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else this.active++;
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
export const serverPool = new ConcurrencyPool(
  Math.max(1, Math.min(16, Number(process.env.JEV_MAX_CONCURRENCY) || 8)),
);
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
  const start = Date.now();
  let calls = 0;
  let reason = "Live evaluation unavailable";
  const fetcher = options.fetcher ?? fetch;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  if (options.key)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        calls++;
        const response = await fetcher("https://api.typesafe.ai/v1/systemone", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: options.model,
            state: job.state,
            questions: questionsFor(job),
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 12000),
        });
        if (!response.ok) {
          reason = `Jev HTTP ${response.status}`;
          if (
            (response.status === 429 || response.status >= 500) &&
            attempt < 2
          ) {
            const retry = response.headers.get("retry-after");
            const delay = retry
              ? Number.isFinite(Number(retry))
                ? Number(retry) * 1000
                : Date.parse(retry) - Date.now()
              : 0;
            await sleep(
              Math.min(10000, Math.max(500 * 2 ** attempt, delay || 0)),
            );
            continue;
          }
          break;
        }
        try {
          const data = validateResponse(await response.json(), job);
          return {
            ...data,
            source: "jev",
            latencyMs: Date.now() - start,
            apiCalls: calls,
          };
        } catch {
          reason = "Jev returned an invalid response";
          break;
        }
      } catch {
        reason = "Jev timeout or network failure";
        if (attempt < 2) await sleep(500 * 2 ** attempt);
      }
    }
  else reason = "Live mode has no server API key";
  return {
    ...mockEvaluation(job, "fallback"),
    apiCalls: calls,
    latencyMs: Date.now() - start,
    error: reason,
  };
}
