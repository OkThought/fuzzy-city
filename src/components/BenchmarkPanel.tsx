"use client";
import { useEffect, useRef, useState } from "react";
import type { BenchmarkStatus } from "../benchmark/runner";

const fixed = (n: number | null | undefined, digits = 2) =>
  n == null ? "—" : n.toFixed(digits);
export default function BenchmarkPanel() {
  const mutation = useRef({ generation: 0, pending: false });
  const [run, setRun] = useState<BenchmarkStatus | null>(null);
  const [provider, setProvider] = useState("Connecting…"),
    [model, setModel] = useState("");
  const [population, setPopulation] = useState("all"),
    [minutes, setMinutes] = useState(35),
    [concurrency, setConcurrency] = useState(1);
  const [error, setError] = useState(""),
    [submitting, setSubmitting] = useState(false);
  const running =
    run && ["waiting", "running", "cancelling"].includes(run.status);
  const latest = run?.cases.at(-1);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const generation = mutation.current.generation;
      try {
        const response = await fetch("/api/benchmark", { cache: "no-store" });
        if (!response.ok) throw new Error("Benchmark status unavailable");
        const data = await response.json();
        if (
          !disposed &&
          !mutation.current.pending &&
          generation === mutation.current.generation
        ) {
          setRun(data.run);
          setProvider(data.provider);
          setModel(data.model);
        }
      } catch (e) {
        if (!disposed) setError(String(e));
      }
      if (!disposed) timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, []);
  const start = async () => {
    mutation.current.generation++;
    mutation.current.pending = true;
    setRun(null);
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          populations:
            population === "all" ? [100, 250, 500, 1000] : [Number(population)],
          minutes,
          concurrency,
          seed: "fuzzy-city-001",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRun(data.run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      mutation.current.pending = false;
      setSubmitting(false);
    }
  };
  const stop = async () => {
    mutation.current.generation++;
    mutation.current.pending = true;
    try {
      const response = await fetch("/api/benchmark", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRun(data.run);
    } catch (e) {
      setError(String(e));
    } finally {
      mutation.current.pending = false;
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `fuzzy-city-benchmark-${run!.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <main className="benchmark-page">
      <header className="site-header">
        <a href="/" className="brand">
          <span className="brand-mark">f.</span>
          <span>
            FUZZY CITY<small>THE LOCAL INFERENCE LAB</small>
          </span>
        </a>
        <a className="text-button" href="/">
          Back to the city ↗
        </a>
      </header>
      <div className="benchmark-content">
        <div className="eyebrow">BENCHMARK / STRESS TEST</div>
        <h1>The city, under load.</h1>
        <p className="benchmark-intro">
          Real citizens. Real decisions. Measured on your machine.
        </p>
        <div className="benchmark-provider">
          <i className="status-dot" />
          <strong>{provider.toUpperCase()}</strong>
          <span>{model}</span>
          <span>
            {provider === "jevk5"
              ? "LOCAL GPU · NO PAID KEY"
              : provider === "mock"
                ? "MOCK · NOT AN INFERENCE BENCHMARK"
                : provider === "typesafe"
                  ? "HOSTED API"
                  : "CHECKING BACKEND"}
          </span>
        </div>
        <section
          className="benchmark-controls"
          aria-label="Benchmark configuration"
        >
          <label>
            Population
            <select
              aria-label="Population"
              value={population}
              disabled={!!running}
              onChange={(e) => setPopulation(e.target.value)}
            >
              <option value="all">Sweep all four sizes</option>
              {[100, 250, 500, 1000].map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString()} citizens
                </option>
              ))}
            </select>
          </label>
          <label>
            Simulated workload
            <select
              aria-label="Simulated workload"
              value={minutes}
              disabled={!!running}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              <option value={35}>Opening window · 16:30–17:05</option>
              <option value={390}>Full evening · 16:30–23:00</option>
            </select>
          </label>
          <label>
            In-flight limit
            <select
              aria-label="In-flight limit"
              value={concurrency}
              disabled={!!running}
              onChange={(e) => setConcurrency(Number(e.target.value))}
            >
              {[1, 2, 4, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                  {n === 1 ? " · recommended" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            className="apply-button"
            disabled={!!running || submitting}
            onClick={() => void start()}
          >
            {submitting ? "Starting…" : "Run benchmark ↗"}
          </button>
          {running && (
            <button
              className="export-button"
              disabled={run.status === "cancelling"}
              onClick={() => void stop()}
            >
              Stop after in-flight work
            </button>
          )}
        </section>
        <p className="small muted">
          Opening windows evaluate 12 / 30 / 60 / 120 citizens at the four
          population sizes. Full evenings evaluate everyone, friend selections
          and encounters. Each case has one unmeasured warm-up. The city’s
          inference queue is reserved while a benchmark runs.
        </p>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <section
          className="benchmark-live"
          aria-label="Live benchmark measurements"
        >
          <div className="section-title">
            <span>{run?.phase || "READY TO MEASURE"}</span>
            <span>{run?.status || "idle"}</span>
          </div>
          <div className="benchmark-numbers">
            <div>
              <span>Decisions / sec</span>
              <strong>{fixed(latest?.summary.decisionsPerSecond)}</strong>
            </div>
            <div>
              <span>p50 / p95 latency · ms</span>
              <strong>
                {fixed(latest?.summary.latencyMs.p50, 0)}{" "}
                <small>/ {fixed(latest?.summary.latencyMs.p95, 0)}</small>
              </strong>
            </div>
            <div>
              <span>Waiting / active peak</span>
              <strong>
                {latest?.summary.queue.current ?? "—"}{" "}
                <small>/ {latest?.summary.queue.peakActive ?? "—"}</small>
              </strong>
            </div>
            <div>
              <span>GPU VRAM · MiB</span>
              <strong>
                {latest?.summary.vram.devices[0]?.lastUsedMiB.toLocaleString() ??
                  "Unknown"}
                <small>
                  {latest?.summary.vram.devices[0]
                    ? ` / ${latest.summary.vram.devices[0].totalMiB.toLocaleString()}`
                    : ""}
                </small>
              </strong>
            </div>
          </div>
          <p className="small muted">
            {latest
              ? `${latest.summary.completedDecisions} completed evaluations · ${latest.summary.judgments} typed judgments · ${latest.summary.failedDecisions} failures · ${latest.evaluatedCitizens}/${latest.population} citizens with stored intentions`
              : "No inferred or extrapolated performance values."}
          </p>
        </section>
        <div className="benchmark-table-wrap">
          <table className="benchmark-table">
            <caption>
              Measured runs · queue-inclusive latency · whole-device VRAM
            </caption>
            <thead>
              <tr>
                <th>Citizens / evaluated</th>
                <th>Decisions/s</th>
                <th>Judgments/s</th>
                <th>p50 / p95 ms</th>
                <th>Queue peak / mean</th>
                <th>VRAM peak MiB</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {run?.cases.length ? (
                run.cases.map((c) => (
                  <tr key={c.population}>
                    <td>
                      {c.population.toLocaleString()} / {c.evaluatedCitizens}
                    </td>
                    <td>{fixed(c.summary.decisionsPerSecond)}</td>
                    <td>{fixed(c.summary.judgmentsPerSecond)}</td>
                    <td>
                      {fixed(c.summary.latencyMs.p50, 0)} /{" "}
                      {fixed(c.summary.latencyMs.p95, 0)}
                    </td>
                    <td>
                      {c.summary.queue.peak} / {fixed(c.summary.queue.mean, 1)}
                    </td>
                    <td>
                      {c.summary.vram.devices[0]?.peakUsedMiB.toLocaleString() ??
                        "Unknown"}
                    </td>
                    <td>{c.status}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    Select a workload to begin. No measurements yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {run && (
          <div className="benchmark-report">
            <button className="export-button" onClick={download}>
              Download summary ↗
            </button>
            <span className="mono">{run.reportDirectory}/</span>
            {run.error && <p className="notice">{run.error}</p>}
          </div>
        )}
        <section className="benchmark-notes">
          <div>
            <h2>What counts as a decision?</h2>
            <p>
              One successful, validated System One evaluation. An evening
              intention contains five typed judgments; an encounter contains
              four. Failed requests are reported separately and never count as
              successful decisions.
            </p>
          </div>
          <div>
            <h2>What does latency include?</h2>
            <p>
              Waiting in the application queue, HTTP inference and response
              validation. Raw reports also contain service latency, queue wait,
              every queue transition and one-second GPU samples. Higher
              concurrency may increase latency on this serialized backend.
            </p>
          </div>
          <div>
            <h2>Where does memory come from?</h2>
            <p>
              Actual nvidia-smi readings, in MiB, for the entire GPU including
              the desktop and other processes. This is not model-only
              allocation. Missing telemetry is marked unknown. Complete reports
              and causal traces are saved locally.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
