import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, openSync, closeSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateCity } from "../src/sim/cityGenerator";
import { Simulation } from "../src/sim/simulation";
import { createDecisionProvider } from "../src/ai/providerFactory";
import { ProviderError } from "../src/ai/decisionProvider";
import { providerConfig } from "../src/ai/providerConfig";
import { ProviderDecisionEngine } from "../src/ai/providerEngine";
import { ConcurrencyPool } from "../src/ai/concurrencyPool";
import { recordingOwnsGpu } from "../src/ai/recordingLock";
import { sampleGpu } from "../src/benchmark/gpu";
import { JournalEngine, RecordingStopped } from "../src/recording/engine";
import { codeIdentity, durableWrite, FORMAT, loadCheckpoint, loadJournal, readJson, RULES, saveCheckpoint, sha, type JournalEntry } from "../src/recording/format";
import type { World } from "../src/sim/types";
import { rulesFor, type RulesId } from "../src/sim/rules";

interface Manifest {
  version: typeof FORMAT; rules: RulesId; code: ReturnType<typeof codeIdentity>;
  seed: string; population: number; initialHash: string; principleHistory: World["principleHistory"];
  configuration: JournalEntry["configuration"];
  startedAt: string; endedAt?: string; status: "running" | "incomplete" | "complete" | "failed";
  completedEvenings: number; targetEvenings: number; journalCount: number; judgments: number; apiCalls: number; inputTokens: number; outputTokens: number;
  uncertainAttempts: number; error?: string;
  evenings: { evening: number; elapsedMs: number; judgments: number; requests: number; apiCalls: number; inputTokens: number; outputTokens: number; maxContextBytes: number; peakGpuMiB: number | null; diskBytes: number; queueDepthPeak: number; queueMsP50: number | null; queueMsP95: number | null; serviceMsP50: number | null; serviceMsP95: number | null; latencyMsP50: number | null; latencyMsP95: number | null; retryBackoffMs: number; httpStatusCounts: Record<string, number>; routedProviders: Record<string, number>; ambiguousAttempts: number }[];
}
function percentile(values: number[], p: number) { if (!values.length) return null; const sorted = values.sort((a, b) => a - b); return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]; }
function option(name: string) { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
function positiveInt(value: string | undefined, label: string, fallback?: number) { const n = Number(value ?? fallback); if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid ${label}`); return n; }
function diskBytes(path: string): number { return readdirSync(path, { withFileTypes: true }).reduce((n, entry) => n + (entry.isDirectory() ? diskBytes(join(path, entry.name)) : statSync(join(path, entry.name)).size), 0); }
function saveManifest(dir: string, manifest: Manifest) { durableWrite(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2)); }
function lockGpu() {
  const path = join(process.cwd(), ".recording-gpu.lock");
  if (existsSync(path) && !recordingOwnsGpu()) unlinkSync(path);
  const fd = openSync(path, "wx");
  writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  closeSync(fd);
  return () => unlinkSync(path);
}
async function checkBrowser() {
  try {
    const response = await fetch("http://127.0.0.1:3000/api/benchmark", { signal: AbortSignal.timeout(1500) });
    if (response.ok) {
      const data = await response.json();
      if (data.queue?.active || data.queue?.waiting || ["waiting", "running", "cancelling"].includes(data.run?.status)) throw new Error("Browser or benchmark inference is active; stop it before recording");
    }
  } catch (error) { if (error instanceof Error && error.message.includes("inference is active")) throw error; }
}
async function main() {
  const command = process.argv[2];
  if (!["record", "replay", "inspect", "seek"].includes(command)) throw new Error("Usage: pnpm record record --population 1000 --seed NAME --evenings 3 --output DIR --max-hours N | record --resume DIR --evenings N --max-hours N | replay DIR | seek DIR --day N --minute N | inspect DIR");
  const dir = resolve(command === "record" ? option("--resume") ?? option("--output") ?? "" : process.argv[3] ?? "");
  if (dir === process.cwd()) throw new Error("Provide a recording directory");
  if (command === "inspect") { const manifest = readJson<Manifest>(join(dir, "manifest.json")); rulesFor(manifest.rules); loadCheckpoint(dir); loadJournal(dir, manifest.rules); console.log(JSON.stringify(manifest, null, 2)); return; }
  if (command === "seek") {
    const manifest = readJson<Manifest>(join(dir, "manifest.json"));
    if (manifest.version !== FORMAT) throw new Error("Unsupported recording format");
    const rules = rulesFor(manifest.rules);
    const day = positiveInt(option("--day"), "--day");
    const minute = Number(option("--minute"));
    if (!Number.isInteger(minute) || minute < 0 || minute >= 1440) throw new Error("Invalid --minute");
    const target = (day - 1) * 1440 + minute;
    const latest = loadCheckpoint(dir);
    if (target > (latest.world.day - 1) * 1440 + latest.world.minute) throw new Error("Target is beyond committed recording");
    const names = readdirSync(join(dir, "checkpoints")).filter((name) => /^checkpoint-day-\d+-minute-\d{4}\.json$/.test(name));
    const candidates = names.map((name) => { const match = name.match(/^checkpoint-day-(\d+)-minute-(\d+)\.json$/)!; return { name, time: (Number(match[1]) - 1) * 1440 + Number(match[2]) }; }).filter((item) => item.time <= target).sort((a, b) => b.time - a.time);
    if (!candidates.length) throw new Error("No checkpoint before target");
    const cp = loadCheckpoint(dir, candidates[0].name);
    const entries = loadJournal(dir, manifest.rules);
    const engine = new JournalEngine(dir, entries, manifest.configuration, undefined, cp.journalCount, () => false, manifest.rules);
    const sim = new Simulation(engine, cp.world, rules);
    while ((sim.world.day - 1) * 1440 + sim.world.minute < target) await sim.step();
    console.log(JSON.stringify({ status: "verified-seek", checkpoint: candidates[0].name, day, minute, requestsConsumed: engine.cursor - cp.journalCount, worldHash: sha(JSON.stringify(sim.world)), events: sim.world.events.length, traces: sim.world.traces.length, outgoingInferenceCalls: 0 }));
    return;
  }
  if (command === "replay") {
    const manifest = readJson<Manifest>(join(dir, "manifest.json"));
    if (manifest.version !== FORMAT) throw new Error("Unsupported recording format");
    const rules = rulesFor(manifest.rules);
    const initial = readJson<World>(join(dir, "initial.json"));
    if (sha(JSON.stringify(initial)) !== manifest.initialHash) throw new Error("Damaged initial world");
    const entries = loadJournal(dir, manifest.rules);
    const engine = new JournalEngine(dir, entries, manifest.configuration, undefined, 0, () => false, manifest.rules);
    const sim = new Simulation(engine, initial, rules);
    const cp = loadCheckpoint(dir);
    const target = (cp.world.day - 1) * 1440 + cp.world.minute;
    while ((sim.world.day - 1) * 1440 + sim.world.minute < target) await sim.step();
    if (engine.cursor !== cp.journalCount || sha(JSON.stringify(sim.world)) !== sha(JSON.stringify(cp.world))) throw new Error("Replay world differs from committed checkpoint");
    console.log(JSON.stringify({ status: "verified", evenings: cp.completedEvenings, requests: engine.cursor, worldHash: sha(JSON.stringify(sim.world)), outgoingInferenceCalls: 0 }));
    return;
  }
  const resume = !!option("--resume");
  if (resume && !existsSync(join(dir, "manifest.json"))) throw new Error("Recording not found");
  if (!resume && existsSync(dir)) throw new Error("Output directory already exists");
  const target = positiveInt(option("--evenings"), "--evenings");
  const maxHours = Number(option("--max-hours") ?? 3);
  if (!Number.isFinite(maxHours) || maxHours <= 0) throw new Error("Invalid --max-hours");
  const config = providerConfig();
  let configuration: JournalEntry["configuration"];
  if (config.id === "mock") configuration = { provider: "mock", model: config.model, snapshot: "deterministic-mock-v1", kernel: "none" };
  else if (config.id === "jevk5") {
    const response = await fetch(`${config.baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("JevK5 health check failed");
    const health = await response.json();
    if (health.model !== config.model || typeof health.revision !== "string" || !["fla", "reference"].includes(health.kernels) || typeof health.tritonConv !== "boolean" || !Array.isArray(health.graphLengths) || typeof health.torch !== "string" || typeof health.jevk5 !== "string") throw new Error("JevK5 server does not expose verifiable runtime identity; restart it with the current launcher");
    configuration = { provider: "jevk5", model: health.model, snapshot: health.revision, kernel: `${health.kernels};tritonConv=${health.tritonConv};graphs=${health.graphLengths.join(",")}`, runtime: `jevk5=${health.jevk5};torch=${health.torch};cuda=${health.cuda};python=${health.python}` };
  } else configuration = { provider: config.id, model: config.model, snapshot: "hosted-provider-managed", kernel: "hosted-provider-managed", runtime: config.id === "vercel" ? "vercel-ai-gateway" : "typesafe-hosted" };
  let manifest: Manifest;
  let world: World;
  let journalCount = 0;
  if (resume) {
    manifest = readJson<Manifest>(join(dir, "manifest.json"));
    const cp = loadCheckpoint(dir);
    if (manifest.version !== FORMAT || manifest.rules !== RULES || JSON.stringify(manifest.configuration) !== JSON.stringify(configuration) || manifest.code.sourceHash !== codeIdentity().sourceHash) throw new Error("Recording runtime or rules mismatch");
    if (cp.world.seed !== manifest.seed || cp.completedEvenings < manifest.completedEvenings) throw new Error("Manifest and checkpoint mismatch");
    manifest.completedEvenings = cp.completedEvenings;
    world = cp.world; journalCount = cp.journalCount;
    if (target < manifest.completedEvenings) throw new Error("Target precedes committed progress");
  } else {
    const population = positiveInt(option("--population"), "--population", 1000);
    const seed = option("--seed") ?? "fuzzy-city-001";
    world = generateCity(seed, config.id === "mock" ? "mock" : config.id === "jevk5" ? "jevk5" : "live", population);
    mkdirSync(dir, { recursive: true });
    durableWrite(join(dir, "initial.json"), JSON.stringify(world));
    saveCheckpoint(dir, world, 0, 0);
    manifest = { version: FORMAT, rules: RULES, code: codeIdentity(), seed, population, initialHash: sha(JSON.stringify(world)), principleHistory: world.principleHistory, configuration, startedAt: new Date().toISOString(), status: "incomplete", completedEvenings: 0, targetEvenings: target, journalCount: 0, judgments: 0, apiCalls: 0, inputTokens: 0, outputTokens: 0, uncertainAttempts: 0, evenings: [] };
    saveManifest(dir, manifest);
  }
  const entries = loadJournal(dir, manifest.rules);
  if (entries.length < journalCount) throw new Error("Journal is missing committed decisions");
  for (const entry of entries) if (JSON.stringify(entry.configuration) !== JSON.stringify(configuration)) throw new Error("Journal model configuration mismatch");
  if (config.id === "jevk5") await checkBrowser();
  const unlock = config.id === "jevk5" ? lockGpu() : () => {};
  let stop = false;
  const stopHandler = () => { stop = true; };
  process.on("SIGINT", stopHandler); process.on("SIGTERM", stopHandler);
  const start = Date.now();
  const deadline = start + maxHours * 3600_000;
  const gpuSamples: Awaited<ReturnType<typeof sampleGpu>>[] = [];
  const timer = config.id === "jevk5" ? setInterval(() => { void sampleGpu(Date.now() - start, { healthUrl: `${config.baseUrl}/health` }).then((sample) => gpuSamples.push(sample)); }, 30_000) : undefined;
  const provider = createDecisionProvider(config);
  const engine = new JournalEngine(dir, entries, configuration, new ProviderDecisionEngine(provider, new ConcurrencyPool(1)), journalCount, () => stop || Date.now() >= deadline, manifest.rules);
  const sim = new Simulation(engine, world, rulesFor(manifest.rules));
  let eveningStart = Date.now(), eveningJournal = engine.cursor, eveningJudgments = world.judgments, eveningCalls = world.apiCalls, eveningInput = world.inputTokens, eveningOutput = world.outputTokens;
  manifest.status = "running"; manifest.targetEvenings = target; delete manifest.error; saveManifest(dir, manifest);
  try {
    while (manifest.completedEvenings < target) {
      if (stop || Date.now() >= deadline) throw new RecordingStopped();
      await sim.step();
      const w = sim.world;
      const completed = w.minute === 1380 ? w.day : 0;
      if (w.minute % 15 === 0 || completed) {
        saveCheckpoint(dir, w, engine.cursor, completed || manifest.completedEvenings);
        if (completed) {
          manifest.completedEvenings = completed;
          const recent = entries.slice(eveningJournal, engine.cursor);
          const peakGpu = gpuSamples.flatMap((s) => s.devices.map((d) => d.usedMiB));
          const attempts = recent.flatMap((entry) => entry.evaluation.providerAttempts ?? []);
          const countBy = (values: (string | number | undefined)[]) => Object.fromEntries([...new Set(values.filter((value): value is string | number => value !== undefined))].map((value) => [String(value), values.filter((candidate) => candidate === value).length]));
          const summary = { evening: completed, elapsedMs: Date.now() - eveningStart, judgments: w.judgments - eveningJudgments, requests: engine.cursor - eveningJournal, apiCalls: w.apiCalls - eveningCalls, inputTokens: w.inputTokens - eveningInput, outputTokens: w.outputTokens - eveningOutput, maxContextBytes: Math.max(0, ...recent.map((e) => Buffer.byteLength(JSON.stringify({ state: e.job.state, questions: e.questions })))), peakGpuMiB: peakGpu.length ? Math.max(...peakGpu) : null, diskBytes: diskBytes(dir), queueDepthPeak: 0, queueMsP50: percentile(recent.map((e) => e.evaluation.queueMs ?? 0), 0.5), queueMsP95: percentile(recent.map((e) => e.evaluation.queueMs ?? 0), 0.95), serviceMsP50: percentile(recent.map((e) => e.evaluation.serviceMs ?? 0), 0.5), serviceMsP95: percentile(recent.map((e) => e.evaluation.serviceMs ?? 0), 0.95), latencyMsP50: percentile(recent.map((e) => e.evaluation.latencyMs), 0.5), latencyMsP95: percentile(recent.map((e) => e.evaluation.latencyMs), 0.95), retryBackoffMs: attempts.reduce((sum, attempt) => sum + (attempt.backoffMs ?? 0), 0), httpStatusCounts: countBy(attempts.map((attempt) => attempt.status)), routedProviders: countBy(attempts.map((attempt) => attempt.routedProvider)), ambiguousAttempts: attempts.filter((attempt) => attempt.outcome === "ambiguous_network_error").length };
          manifest.evenings.push(summary);
          durableWrite(join(dir, `evening-${completed}-gpu.json`), JSON.stringify(gpuSamples));
          console.log(JSON.stringify(summary));
          gpuSamples.length = 0; eveningStart = Date.now(); eveningJournal = engine.cursor; eveningJudgments = w.judgments; eveningCalls = w.apiCalls; eveningInput = w.inputTokens; eveningOutput = w.outputTokens;
        }
        manifest.principleHistory = w.principleHistory; manifest.journalCount = engine.cursor; manifest.judgments = w.judgments; manifest.apiCalls = w.apiCalls; manifest.inputTokens = w.inputTokens; manifest.outputTokens = w.outputTokens;
        saveManifest(dir, manifest);
      }
    }
    manifest.status = "complete"; delete manifest.error;
  } catch (error) {
    manifest.status = error instanceof RecordingStopped ? "incomplete" : "failed";
    manifest.error = error instanceof Error ? error.message : String(error);
    const providerError = error instanceof ProviderError ? error : undefined;
    if (providerError?.ambiguous) manifest.uncertainAttempts += providerError.attempts.filter((attempt) => attempt.outcome === "ambiguous_network_error").length || 1;
    durableWrite(join(dir, `partial-gpu-${Date.now()}.json`), JSON.stringify(gpuSamples));
    durableWrite(join(dir, `failure-${Date.now()}.json`), JSON.stringify({ at: new Date().toISOString(), error: manifest.error, journalCount: entries.length, lastCommitted: readJson(join(dir, "latest.json")), uncertainRemoteAttempt: providerError?.ambiguous ?? false, attempts: providerError?.attempts ?? [] }));
    console.error(manifest.error);
    process.exitCode = manifest.status === "failed" ? 1 : 2;
  } finally {
    if (timer) clearInterval(timer);
    manifest.endedAt = new Date().toISOString(); saveManifest(dir, manifest);
    unlock();
  }
  console.log(JSON.stringify({ status: manifest.status, completedEvenings: manifest.completedEvenings, targetEvenings: target, directory: dir }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
