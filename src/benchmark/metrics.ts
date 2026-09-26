import type { DecisionMeasurement } from "../ai/providerEngine";
export interface QueueSample {
  elapsedMs: number;
  active: number;
  waiting: number;
  limit: number;
}
export interface GpuSample {
  elapsedMs: number;
  devices: { index: number; name: string; usedMiB: number; totalMiB: number }[];
  error?: string;
}
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
export function summarize(
  measurements: DecisionMeasurement[],
  elapsedMs: number,
  queue: QueueSample[],
  gpu: GpuSample[],
) {
  const valid = measurements.filter((m) => m.success);
  const seconds = elapsedMs / 1000;
  let weightedQueue = 0;
  queue.forEach((s, i) => {
    weightedQueue +=
      s.waiting *
      Math.max(0, (queue[i + 1]?.elapsedMs ?? elapsedMs) - s.elapsedMs);
  });
  const devices = gpu.flatMap((s) => s.devices);
  return {
    elapsedMs,
    completedDecisions: valid.length,
    failedDecisions: measurements.filter((m) => !m.success).length,
    judgments: valid.reduce((n, m) => n + m.judgments, 0),
    decisionsPerSecond: seconds ? valid.length / seconds : 0,
    judgmentsPerSecond: seconds
      ? valid.reduce((n, m) => n + m.judgments, 0) / seconds
      : 0,
    latencyMs: {
      p50: percentile(
        valid.map((m) => m.latencyMs),
        0.5,
      ),
      p95: percentile(
        valid.map((m) => m.latencyMs),
        0.95,
      ),
    },
    serviceMs: {
      p50: percentile(
        valid.map((m) => m.serviceMs),
        0.5,
      ),
      p95: percentile(
        valid.map((m) => m.serviceMs),
        0.95,
      ),
    },
    queueWaitMs: {
      p50: percentile(
        valid.map((m) => m.queueMs),
        0.5,
      ),
      p95: percentile(
        valid.map((m) => m.queueMs),
        0.95,
      ),
    },
    queue: {
      current: queue.at(-1)?.waiting ?? 0,
      peak: Math.max(0, ...queue.map((s) => s.waiting)),
      mean: elapsedMs ? weightedQueue / elapsedMs : 0,
      peakActive: Math.max(0, ...queue.map((s) => s.active)),
    },
    vram: {
      scope: "whole GPU, all processes" as const,
      available: devices.length > 0,
      samples: gpu.filter((s) => s.devices.length).length,
      devices: [...new Set(devices.map((d) => d.index))].map((index) => {
        const d = devices.filter((d) => d.index === index);
        return {
          index,
          name: d[0].name,
          peakUsedMiB: Math.max(...d.map((s) => s.usedMiB)),
          lastUsedMiB: d.at(-1)!.usedMiB,
          totalMiB: d[0].totalMiB,
        };
      }),
      errors: [...new Set(gpu.flatMap((s) => (s.error ? [s.error] : [])))],
    },
    apiCalls: measurements.reduce((sum, m) => sum + m.apiCalls, 0),
    inputTokens: valid.reduce((sum, m) => sum + m.inputTokens, 0),
    outputTokens: valid.reduce((sum, m) => sum + m.outputTokens, 0),
    retryBackoffMs: measurements.flatMap((m) => m.attempts).reduce(
      (sum, attempt) => sum + (attempt.backoffMs ?? 0),
      0,
    ),
    httpStatuses: Object.fromEntries(
      [...new Set(measurements.flatMap((m) => m.attempts).flatMap((attempt) => attempt.status === undefined ? [] : [attempt.status]))]
        .sort((a, b) => a - b)
        .map((status) => [String(status), measurements.flatMap((m) => m.attempts).filter((attempt) => attempt.status === status).length]),
    ),
    routedProviders: Object.fromEntries(
      [...new Set(measurements.flatMap((m) => m.attempts).flatMap((attempt) => attempt.routedProvider ? [attempt.routedProvider] : []))]
        .sort()
        .map((provider) => [provider, measurements.flatMap((m) => m.attempts).filter((attempt) => attempt.routedProvider === provider).length]),
    ),
    ambiguousAttempts: measurements.filter((m) => m.ambiguous).length,
  };
}
