import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { durableWrite, loadJournal, readJson, sha } from "../src/recording/format";

interface Manifest {
  status: string;
  rules: string;
  seed: string;
  population: number;
  journalCount: number;
}

const source = resolve(process.argv[2] ?? "recordings/pilot-1000-3e-rules-v2-2026-09-26");
const output = resolve(process.argv[3] ?? ".local/evidence/rules-v2-runtime-qualification.json");
if (existsSync(output)) throw new Error(`Qualification report already exists: ${output}`);
const manifest = readJson<Manifest>(join(source, "manifest.json"));
if (manifest.status !== "complete" || manifest.rules !== "fuzzy-city-rules/v2")
  throw new Error("Runtime qualification requires the complete immutable rules-v2 pilot");
const journalPath = join(source, "journal.jsonl");
const journalRaw = readFileSync(journalPath);
const entries = loadJournal(source, manifest.rules);
if (entries.length !== manifest.journalCount) throw new Error("Manifest and journal count differ");

const percentile = (values: number[], p: number) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null;
};
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const correlation = (xs: number[], ys: number[]) => {
  const mx = mean(xs), my = mean(ys);
  const numerator = xs.reduce((sum, value, index) => sum + (value - mx) * (ys[index] - my), 0);
  const denominator = Math.sqrt(xs.reduce((sum, value) => sum + (value - mx) ** 2, 0) * ys.reduce((sum, value) => sum + (value - my) ** 2, 0));
  return denominator ? numerator / denominator : null;
};

const rows = entries.map((entry) => ({
  sequence: entry.sequence,
  jobId: entry.job.id,
  day: Number((entry.job.state as { world?: { day?: number } }).world?.day),
  kind: entry.job.kind,
  contextBytes: Buffer.byteLength(JSON.stringify({ state: entry.job.state, questions: entry.questions })),
  serviceMs: entry.evaluation.serviceMs ?? entry.evaluation.latencyMs,
}));
if (rows.some((row) => !Number.isInteger(row.day))) throw new Error("Journal entry lacks a simulation day");

const summarize = (selected: typeof rows) => ({
  requests: selected.length,
  contextBytes: {
    p50: percentile(selected.map((row) => row.contextBytes), 0.5),
    p95: percentile(selected.map((row) => row.contextBytes), 0.95),
    max: Math.max(...selected.map((row) => row.contextBytes)),
  },
  serviceMs: {
    p50: percentile(selected.map((row) => row.serviceMs), 0.5),
    p95: percentile(selected.map((row) => row.serviceMs), 0.95),
    max: Math.max(...selected.map((row) => row.serviceMs)),
  },
  pearsonContextService: correlation(selected.map((row) => row.contextBytes), selected.map((row) => row.serviceMs)),
});

const days = [...new Set(rows.map((row) => row.day))].sort((a, b) => a - b);
const kinds = [...new Set(rows.map((row) => row.kind))].sort();
const contextThresholds = [0.25, 0.5, 0.75].map((p) => percentile(rows.map((row) => row.contextBytes), p)!);
const buckets = [
  { label: "q1", min: -Infinity, max: contextThresholds[0] },
  { label: "q2", min: contextThresholds[0], max: contextThresholds[1] },
  { label: "q3", min: contextThresholds[1], max: contextThresholds[2] },
  { label: "q4", min: contextThresholds[2], max: Infinity },
];
const report = {
  schemaVersion: "fuzzy-city-runtime-qualification/v1",
  source: {
    recording: basename(source),
    rules: manifest.rules,
    seed: manifest.seed,
    population: manifest.population,
    journalCount: entries.length,
    journalSha256: sha(journalRaw),
  },
  method: {
    inferenceCalls: 0,
    contextBytes: "UTF-8 byte length of the exact serialized state and questions stored in each journal entry.",
    latency: "Recorded provider serviceMs; latency association is descriptive and does not establish context-size causation.",
    buckets: "Quartiles of context byte length across the complete three-evening journal.",
  },
  overall: summarize(rows),
  byEvening: days.map((day) => ({
    day,
    ...summarize(rows.filter((row) => row.day === day)),
    byKind: kinds.map((kind) => ({ kind, ...summarize(rows.filter((row) => row.day === day && row.kind === kind)) })),
  })),
  contextBuckets: buckets.map((bucket, index) => ({
    label: bucket.label,
    lowerExclusive: Number.isFinite(bucket.min) ? bucket.min : null,
    upperInclusive: Number.isFinite(bucket.max) ? bucket.max : null,
    ...summarize(rows.filter((row) => row.contextBytes > bucket.min && (index === 0 ? row.contextBytes <= bucket.max : row.contextBytes <= bucket.max))),
  })),
  slowestRequests: rows.slice().sort((a, b) => b.serviceMs - a.serviceMs).slice(0, 20),
  caveat: "Observed context and service latency share time, request-kind, GPU, and model-state factors. Correlation is not a causal estimate or a forecast of fourteen-evening runtime.",
};
durableWrite(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, journalSha256: report.source.journalSha256, overall: report.overall, byEvening: report.byEvening }));
