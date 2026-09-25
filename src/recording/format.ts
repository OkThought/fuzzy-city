import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, openSync, closeSync, fsyncSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { execFileSync } from "node:child_process";
import type { Evaluation, Job, World } from "../sim/types";
import { questionsFor } from "../ai/jevApiTypes";

export const FORMAT = "fuzzy-city-recording/v2" as const;
export const RULES = "fuzzy-city-rules/v1" as const;
export const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function durableWrite(path: string, data: string) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.partial`;
  const fd = openSync(tmp, "w");
  try { writeFileSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, path);
}
export function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }
export function codeIdentity() {
  const root = process.cwd();
  const files: string[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(path);
    }
  }
  for (const dir of ["src/sim", "src/ai", "src/recording", "scripts"]) walk(join(root, dir));
  for (const name of ["package.json", "pnpm-lock.yaml"]) if (existsSync(join(root, name))) files.push(join(root, name));
  let head = "unknown";
  try { head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* source hash still identifies code */ }
  return { head, sourceHash: sha(files.sort().map((path) => `${relative(root, path)}:${sha(readFileSync(path))}`).join("\n")), node: process.version };
}
export interface JournalEntry {
  version: typeof FORMAT;
  sequence: number;
  previousHash: string;
  requestHash: string;
  job: Job;
  questions: ReturnType<typeof questionsFor>;
  configuration: { provider: string; model: string; snapshot: string; kernel: string; runtime?: string };
  evaluation: Evaluation;
  hash: string;
}
export function requestHash(job: Job, questions: ReturnType<typeof questionsFor>, configuration: JournalEntry["configuration"]) {
  return sha(canonical({ job, questions, configuration, rules: RULES }));
}
export function loadJournal(dir: string): JournalEntry[] {
  const path = join(dir, "journal.jsonl");
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  if (raw && !raw.endsWith("\n")) throw new Error("Incomplete journal tail");
  let previousHash = "genesis";
  return raw.trim() ? raw.trimEnd().split("\n").map((line, i) => {
    const entry = JSON.parse(line) as JournalEntry;
    const { hash, ...body } = entry;
    if (entry.version !== FORMAT || entry.sequence !== i || entry.previousHash !== previousHash || sha(canonical(body)) !== hash || requestHash(entry.job, entry.questions, entry.configuration) !== entry.requestHash)
      throw new Error(`Damaged journal entry ${i}`);
    previousHash = hash;
    return entry;
  }) : [];
}
export interface Checkpoint {
  version: typeof FORMAT;
  world: World;
  journalCount: number;
  completedEvenings: number;
  chunks: { name: string; hash: string; traces: number; events: number }[];
  hash: string;
}
const checkpointCache = new Map<string, Checkpoint>();
export function saveCheckpoint(dir: string, world: World, journalCount: number, completedEvenings: number) {
  const previous = checkpointCache.get(dir) ?? (existsSync(join(dir, "latest.json")) ? loadCheckpoint(dir) : undefined);
  const chunks = previous?.chunks.slice() ?? [];
  const priorTraces = previous?.world.traces.length ?? 0;
  const priorEvents = previous?.world.events.length ?? 0;
  if (world.traces.length < priorTraces || world.events.length < priorEvents) throw new Error("History regressed before checkpoint");
  if (world.traces.length > priorTraces || world.events.length > priorEvents) {
    const name = `history-${String(chunks.length).padStart(5, "0")}.json`;
    const raw = JSON.stringify({ traces: world.traces.slice(priorTraces), events: world.events.slice(priorEvents) });
    durableWrite(join(dir, "chunks", name), raw);
    chunks.push({ name, hash: sha(raw), traces: world.traces.length - priorTraces, events: world.events.length - priorEvents });
  }
  const compactWorld = { ...world, traces: [], events: [] };
  const body = { version: FORMAT, world: compactWorld, journalCount, completedEvenings, chunks };
  const checkpoint: Checkpoint = { ...body, hash: sha(canonical(body)) };
  const name = `checkpoint-day-${world.day}-minute-${String(world.minute).padStart(4, "0")}.json`;
  durableWrite(join(dir, "checkpoints", name), JSON.stringify(checkpoint));
  durableWrite(join(dir, "latest.json"), JSON.stringify({ version: FORMAT, name, hash: checkpoint.hash }));
  const expanded = { ...checkpoint, world };
  checkpointCache.set(dir, { ...expanded, world: structuredClone(world) });
  return expanded;
}
export function loadCheckpoint(dir: string, name?: string): Checkpoint {
  const latest = readJson<{ version: string; name: string; hash: string }>(join(dir, "latest.json"));
  const selected = name ?? latest.name;
  if (latest.version !== FORMAT || !/^checkpoint-day-\d+-minute-\d{4}\.json$/.test(selected)) throw new Error("Invalid checkpoint pointer");
  const cp = readJson<Checkpoint>(join(dir, "checkpoints", selected));
  const { hash, ...body } = cp;
  if (cp.version !== FORMAT || sha(canonical(body)) !== hash || (!name && hash !== latest.hash) || cp.world.rngState < 0 || !Array.isArray(cp.world.citizens) || !Array.isArray(cp.chunks)) throw new Error("Damaged checkpoint");
  const traces: World["traces"] = [], events: World["events"] = [];
  for (const chunk of cp.chunks) {
    if (!/^history-\d{5}\.json$/.test(chunk.name)) throw new Error("Invalid history chunk name");
    const raw = readFileSync(join(dir, "chunks", chunk.name), "utf8");
    const parsed = JSON.parse(raw) as { traces: World["traces"]; events: World["events"] };
    if (sha(raw) !== chunk.hash || parsed.traces.length !== chunk.traces || parsed.events.length !== chunk.events) throw new Error(`Damaged history chunk ${chunk.name}`);
    traces.push(...parsed.traces); events.push(...parsed.events);
  }
  const expanded = { ...cp, world: { ...cp.world, traces, events } };
  checkpointCache.set(dir, expanded);
  return expanded;
}
