import { providerService } from "../ai/providerService";
import {
  newBenchmarkStatus,
  runBenchmark,
  type BenchmarkConfig,
  type BenchmarkStatus,
} from "./runner";
const globals = globalThis as typeof globalThis & {
  fuzzyBenchmark?: { status: BenchmarkStatus; abort: AbortController };
};
export function getBenchmark() {
  return globals.fuzzyBenchmark?.status;
}
export function stopBenchmark() {
  const run = globals.fuzzyBenchmark;
  if (run && ["waiting", "running"].includes(run.status.status)) {
    run.status.status = "cancelling";
    run.status.phase = "Draining admitted inference; no new GPU work";
    run.abort.abort();
  }
  return run?.status;
}
export function startBenchmark(config: BenchmarkConfig) {
  const service = providerService();
  if (service.benchmarkActive) throw new Error("A benchmark is already active");
  service.benchmarkActive = true;
  const status = newBenchmarkStatus(service.provider, config),
    abort = new AbortController();
  globals.fuzzyBenchmark = { status, abort };
  void (async () => {
    try {
      while (service.pool.active || service.pool.snapshot().waiting)
        await new Promise((resolve) => setTimeout(resolve, 100));
      await runBenchmark(service.provider, status, abort.signal);
    } catch (error) {
      status.status = "failed";
      status.error = error instanceof Error ? error.message : String(error);
    } finally {
      service.benchmarkActive = false;
    }
  })();
  return status;
}
