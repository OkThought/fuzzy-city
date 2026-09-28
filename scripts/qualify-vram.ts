import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sampleGpu } from "../src/benchmark/gpu";
import { percentile, type GpuSample } from "../src/benchmark/metrics";
import { durableWrite } from "../src/recording/format";

interface FixtureCase {
  id: string;
  kind: string;
  request: { questions: Record<string, unknown> };
}

const baseUrl = process.env.DECISION_API_BASE_URL ?? "http://127.0.0.1:8090";
const fixturePath = resolve("benchmarks/gpu-path/fixture.json");
const output = resolve(process.argv[2] ?? ".local/evidence/rules-v2-vram-qualification.json");
if (existsSync(output)) throw new Error(`Qualification report already exists: ${output}`);
const fixtureRaw = readFileSync(fixturePath);
const fixture = JSON.parse(fixtureRaw.toString("utf8")) as { source: string; cases: FixtureCase[] };
const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) }).then(async (response) => {
  if (!response.ok) throw new Error(`JevK5 health failed: HTTP ${response.status}`);
  return response.json();
});
const expected = {
  model: "alibiserikbay/JevK5",
  revision: "27d2d6b8d4714807f6293b0623bd7370b27e42f8",
  kernels: "fla",
  tritonConv: true,
  graphLengths: [],
};
for (const [key, value] of Object.entries(expected))
  if (JSON.stringify(health[key]) !== JSON.stringify(value)) throw new Error(`Unexpected JevK5 ${key}`);

const samples: GpuSample[] = [];
let measuring: Promise<void> | undefined;
const measure = () => measuring ??= sampleGpu(Date.now(), {
  healthUrl: `${baseUrl}/health`,
  exec: async () => { throw new Error("qualification-forced spawn EPERM"); },
}).then((sample) => { samples.push(sample); }).finally(() => { measuring = undefined; });
await measure();
const timer = setInterval(() => { void measure(); }, 100);
const records: { id: string; kind: string; latencyMs: number; judgments: number }[] = [];
try {
  for (const fixtureCase of fixture.cases) {
    const started = performance.now();
    const response = await fetch(`${baseUrl}/v1/systemone`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixtureCase.request),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`Frozen request ${fixtureCase.id} failed: HTTP ${response.status}`);
    const payload = await response.json() as { answers?: Record<string, unknown> };
    if (!payload.answers || Object.keys(payload.answers).length !== Object.keys(fixtureCase.request.questions).length)
      throw new Error(`Frozen request ${fixtureCase.id} returned malformed answers`);
    records.push({ id: fixtureCase.id, kind: fixtureCase.kind, latencyMs: performance.now() - started, judgments: Object.keys(payload.answers).length });
  }
} finally {
  clearInterval(timer);
  await measuring;
  await measure();
}
const deviceSamples = samples.flatMap((sample) => sample.devices);
const processSamples = samples.flatMap((sample) => sample.process ? [sample.process] : []);
if (!samples.length || samples.some((sample) => sample.source !== "jevk5-health") || !deviceSamples.length || !processSamples.length)
  throw new Error("Live JevK5 health fallback telemetry was not captured for every sample");
const latencies = records.map((record) => record.latencyMs);
const report = {
  schemaVersion: "fuzzy-city-vram-qualification/v1",
  startedAt: new Date().toISOString(),
  scope: "Frozen real request fixtures only; no simulation run and no pilot modification.",
  fixture: { path: "benchmarks/gpu-path/fixture.json", source: fixture.source, sha256: createHash("sha256").update(fixtureRaw).digest("hex"), cases: fixture.cases.length },
  provider: expected,
  requests: records.length,
  judgments: records.reduce((sum, record) => sum + record.judgments, 0),
  failures: 0,
  ambiguousAttempts: 0,
  latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), max: Math.max(...latencies) },
  vram: {
    wholeDevice: { scope: "whole GPU, all processes", peakUsedMiB: Math.max(...deviceSamples.map((sample) => sample.usedMiB)), totalMiB: deviceSamples[0].totalMiB },
    jevk5Process: { scope: "local JevK5 process, PyTorch allocator", peakAllocatedMiB: Math.max(...processSamples.map((sample) => sample.peakAllocatedMiB)), peakReservedMiB: Math.max(...processSamples.map((sample) => sample.peakReservedMiB)) },
    samples: samples.length,
    source: "jevk5-health",
    forcedPrimaryFailure: "qualification-forced spawn EPERM",
  },
  records,
};
durableWrite(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, requests: report.requests, judgments: report.judgments, latencyMs: report.latencyMs, vram: report.vram }));
