import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DecisionProvider } from "../ai/decisionProvider";
import {
  ProviderDecisionEngine,
  type DecisionMeasurement,
} from "../ai/providerEngine";
import { ConcurrencyPool } from "../ai/concurrencyPool";
import { generateCity } from "../sim/cityGenerator";
import { decisionState } from "../sim/decisions";
import { Simulation } from "../sim/simulation";
import { sampleGpu } from "./gpu";
import { summarize, type GpuSample, type QueueSample } from "./metrics";

export const POPULATIONS = [100, 250, 500, 1000] as const;
export interface BenchmarkConfig {
  populations: number[];
  minutes: 35 | 390;
  concurrency: number;
  seed: string;
}
export interface CaseResult {
  population: number;
  status: "running" | "complete" | "cancelled" | "failed";
  simulatedMinute: number;
  evaluatedCitizens: number;
  interactions: number;
  summary: ReturnType<typeof summarize>;
  error?: string;
}
export interface BenchmarkStatus {
  id: string;
  status:
    | "waiting"
    | "running"
    | "cancelling"
    | "complete"
    | "cancelled"
    | "failed";
  provider: string;
  model: string;
  config: BenchmarkConfig;
  startedAt: string;
  finishedAt?: string;
  cases: CaseResult[];
  phase: string;
  reportDirectory: string;
  error?: string;
}
export function benchmarkConfig(value: unknown): BenchmarkConfig {
  const v = value as Partial<BenchmarkConfig> | null;
  if (
    !v ||
    !Array.isArray(v.populations) ||
    !v.populations.length ||
    v.populations.length > 4 ||
    new Set(v.populations).size !== v.populations.length ||
    !v.populations.every((n) =>
      POPULATIONS.includes(n as (typeof POPULATIONS)[number]),
    ) ||
    ![35, 390].includes(v.minutes!) ||
    !Number.isInteger(v.concurrency) ||
    v.concurrency! < 1 ||
    v.concurrency! > 8 ||
    (v.seed !== undefined &&
      (typeof v.seed !== "string" || v.seed.length > 100))
  )
    throw new Error(
      "Choose populations 100/250/500/1000, 35 or 390 minutes, and concurrency 1–8.",
    );
  return {
    populations: v.populations,
    minutes: v.minutes!,
    concurrency: v.concurrency!,
    seed: v.seed || "fuzzy-city-001",
  };
}
export function newBenchmarkStatus(
  provider: DecisionProvider,
  config: BenchmarkConfig,
): BenchmarkStatus {
  const id = `${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-${randomUUID().slice(0, 8)}`;
  return {
    id,
    status: "waiting",
    provider: provider.id,
    model: provider.model,
    config,
    startedAt: new Date().toISOString(),
    cases: [],
    phase: "Waiting for the simulation queue to drain",
    reportDirectory: `benchmarks/${id}`,
  };
}
export async function runBenchmark(
  provider: DecisionProvider,
  status: BenchmarkStatus,
  signal: AbortSignal,
) {
  const directory = path.resolve(status.reportDirectory);
  await mkdir(directory, { recursive: true });
  status.status = "running";
  try {
    for (const population of status.config.populations) {
      if (signal.aborted) break;
      status.phase = `${population} citizens · unmeasured warm-up`;
      const world = generateCity(
        status.config.seed,
        provider.id === "typesafe" ? "live" : provider.id,
        population,
      );
      const warmupEngine = new ProviderDecisionEngine(provider);
      const warmupStart = performance.now();
      await warmupEngine.evaluate([
        {
          id: "warmup",
          kind: "evening_intentions",
          state: decisionState(world, world.citizens[0]),
        },
      ]);
      const warmupMs = performance.now() - warmupStart;
      if (signal.aborted) break;
      const decisions: DecisionMeasurement[] = [],
        queue: QueueSample[] = [],
        gpu: GpuSample[] = [];
      const start = performance.now();
      const elapsed = () => performance.now() - start;
      let measuringGpu: Promise<void> | undefined;
      const measureGpu = () => {
        if (!measuringGpu)
          measuringGpu = sampleGpu(elapsed())
            .then((sample) => {
              gpu.push(sample);
            })
            .finally(() => {
              measuringGpu = undefined;
            });
        return measuringGpu;
      };
      await measureGpu();
      const gpuTimer = setInterval(() => void measureGpu(), 1000);
      const pool = new ConcurrencyPool(status.config.concurrency, 64, (state) =>
        queue.push({ elapsedMs: elapsed(), ...state }),
      );
      queue.push({ elapsedMs: 0, ...pool.snapshot() });
      const engine = new ProviderDecisionEngine(
        provider,
        pool,
        (measurement) => decisions.push(measurement),
        signal,
      );
      const sim = new Simulation(engine, world);
      const result: CaseResult = {
        population,
        status: "running",
        simulatedMinute: world.minute,
        evaluatedCitizens: 0,
        interactions: 0,
        summary: summarize([], 0, queue, gpu),
      };
      status.cases.push(result);
      const refresh = () => {
        result.summary = summarize(decisions, elapsed(), queue, gpu);
        result.simulatedMinute = world.minute;
        result.evaluatedCitizens = world.traces.filter(
          (t) => t.kind === "evening_intentions",
        ).length;
        result.interactions = sim.today.interactions;
      };
      const progressTimer = setInterval(refresh, 500);
      try {
        status.phase = `${population} citizens · ${status.config.minutes === 35 ? "opening decision window (16:30–17:05)" : "full evening (16:30–23:00)"}`;
        for (
          let minute = 0;
          minute < status.config.minutes && !signal.aborted;
          minute++
        )
          await sim.step();
        result.status = signal.aborted ? "cancelled" : "complete";
      } catch (error) {
        result.status = signal.aborted ? "cancelled" : "failed";
        result.error = error instanceof Error ? error.message : String(error);
      } finally {
        clearInterval(progressTimer);
        clearInterval(gpuTimer);
        await measuringGpu;
        await measureGpu();
        refresh();
        await writeFile(
          path.join(directory, `${population}.json`),
          JSON.stringify(
            {
              schemaVersion: "fuzzy-city-benchmark/v1",
              provider: provider.id,
              model: provider.model,
              config: status.config,
              warmup: {
                evaluations: 1,
                elapsedMs: warmupMs,
                excludedFromMetrics: true,
              },
              ...result,
              decisions,
              queueSamples: queue,
              gpuSamples: gpu,
              traces: world.traces,
              finalState: {
                day: world.day,
                minute: world.minute,
                citizens: world.citizens,
                relationships: world.relationships,
                events: world.events,
                rngState: world.rngState,
              },
            },
            null,
            2,
          ),
        );
      }
      if (result.status === "failed") throw new Error(result.error);
      await writeFile(
        path.join(directory, "summary.json"),
        JSON.stringify(status, null, 2),
      );
    }
    status.status = signal.aborted ? "cancelled" : "complete";
  } catch (error) {
    status.status = signal.aborted ? "cancelled" : "failed";
    status.error = error instanceof Error ? error.message : String(error);
  } finally {
    status.finishedAt = new Date().toISOString();
    status.phase = status.status;
    await writeFile(
      path.join(directory, "summary.json"),
      JSON.stringify(status, null, 2),
    );
  }
}
