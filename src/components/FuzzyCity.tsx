"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MockDecisionEngine } from "../ai/mockEngine";
import { JevDecisionEngine } from "../ai/jevEngine";
import { generateCity } from "../sim/cityGenerator";
import { timeLabel } from "../sim/decisions";
import { downloadRun, loadRun, saveRun } from "../sim/export";
import { Simulation } from "../sim/simulation";
import { ACTIVITIES, COLORS, LABELS, type World } from "../sim/types";
import CityCanvas from "./CityCanvas";
import CitizenInspector from "./CitizenInspector";
import CharterEditor from "./CharterEditor";
import StatsPanel from "./StatsPanel";

export default function FuzzyCity({
  mode,
  hostedProvider,
  pricing,
}: {
  mode: World["mode"];
  hostedProvider: "vercel" | "typesafe";
  pricing: { input: number | null; output: number | null };
}) {
  const [simulation, setSimulation] = useState<Simulation>();
  const [, render] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedId, setSelectedId] = useState<string>();
  const [panel, setPanel] = useState<"city" | "stats" | "about">("city");
  const [layer, setLayer] = useState<"activity" | "uncertainty">("activity");
  const [skipping, setSkipping] = useState(false);
  const [message, setMessage] = useState("");
  const [fatal, setFatal] = useState(false);
  const [saved, setSaved] = useState<World>();
  const [debug, setDebug] = useState(false);
  const state = useRef({ paused, speed, skipping, fatal });
  state.current = { paused, speed, skipping, fatal };
  const tickInFlight = useRef<Promise<void> | null>(null);
  useEffect(() => {
    const engine =
      mode !== "mock" ? new JevDecisionEngine() : new MockDecisionEngine();
    const sim = new Simulation(engine, generateCity("fuzzy-city-001", mode));
    sim.updateMetrics();
    setSimulation(sim);
    loadRun()
      .then((run) => {
        if (run && run.mode === mode) setSaved(run);
      })
      .catch(() =>
        setMessage(
          "Local persistence is unavailable in this browser. Export still works.",
        ),
      );
  }, [mode]);
  useEffect(() => {
    if (!simulation) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastSavedDay = simulation.world.day;
    const tick = async () => {
      if (cancelled) return;
      if (
        !state.current.paused &&
        !state.current.skipping &&
        !state.current.fatal &&
        !simulation.busy
      ) {
        const promise = simulation.step(state.current.speed);
        tickInFlight.current = promise;
        try {
          await promise;
          if (simulation.world.day > lastSavedDay) {
            lastSavedDay = simulation.world.day;
            void saveRun(simulation.world).catch(() =>
              setMessage("Auto-save failed. Export this run to keep it."),
            );
          }
        } catch (error) {
          setFatal(true);
          setPaused(true);
          setMessage(
            error instanceof Error
              ? error.message
              : "Simulation stopped unexpectedly.",
          );
        } finally {
          tickInFlight.current = null;
        }
      }
      if (!cancelled) {
        render((n) => n + 1);
        timer = setTimeout(tick, 220);
      }
    };
    const uiTimer = setInterval(() => render((n) => n + 1), 500);
    timer = setTimeout(tick, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(uiTimer);
    };
  }, [simulation]);
  const select = useCallback((id: string) => {
    setSelectedId(id);
    setPanel("city");
  }, []);
  if (!simulation)
    return (
      <main className="loading">
        <span className="brand-mark">f.</span>
        <h1>Fuzzy City</h1>
        <p>Making room for a thousand lives…</p>
      </main>
    );
  const w = simulation.world,
    today = simulation.today,
    citizen = w.citizens.find((c) => c.id === selectedId);
  const phase =
    w.minute < 420
      ? "The city is sleeping"
      : w.minute < 540
        ? "The morning commute"
        : w.minute < 1020
          ? "The working day"
          : w.minute < 1140
            ? "A thousand possibilities"
            : w.minute < 1380
              ? "The evening unfolds"
              : "Finding the way home";
  const skip = async () => {
    setSkipping(true);
    state.current.skipping = true;
    try {
      await tickInFlight.current;
      await simulation.skipToEvening();
      render((n) => n + 1);
    } catch (error) {
      setFatal(true);
      setPaused(true);
      setMessage(String(error));
    } finally {
      setSkipping(false);
    }
  };
  const events = w.events
    .filter((e) => e.type !== "decision" || e.citizenIds[0] === selectedId)
    .slice(-6)
    .reverse();
  const save = async () => {
    await tickInFlight.current;
    try {
      await saveRun(w);
      setMessage(
        "Run saved on this device, including its full causal history.",
      );
    } catch {
      setMessage("Could not save locally. Use Export run instead.");
    }
  };
  return (
    <main className="app-shell">
      <header className="site-header">
        <a href="/" className="brand" aria-label="Fuzzy City home">
          <span className="brand-mark">f.</span>
          <span>
            FUZZY CITY<small>ONE THOUSAND EVENINGS</small>
          </span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="/replay">Recorded replay ↗</a>
          <a href="/benchmark">Benchmark ↗</a>
          <button
            className={panel === "city" ? "active" : ""}
            onClick={() => setPanel("city")}
          >
            The city
          </button>
          <button
            className={panel === "stats" ? "active" : ""}
            onClick={() => {
              setSelectedId(undefined);
              setPanel("stats");
            }}
          >
            Observations
          </button>
          <button
            className={panel === "about" ? "active" : ""}
            onClick={() => {
              setSelectedId(undefined);
              setPanel("about");
            }}
          >
            The experiment <span>↗</span>
          </button>
        </nav>
        <div className="header-actions">
          <span className={`mode-badge ${mode}`}>
            <i />
            {mode === "mock"
              ? "MOCK MODEL"
              : mode === "jevk5"
                ? "LOCAL JEVK5"
                : hostedProvider === "vercel" ? "VERCEL JEV" : "TYPESAFE JEV"}
          </span>
          <button className="export-button" onClick={() => downloadRun(w)}>
            Export run <span>↗</span>
          </button>
        </div>
      </header>
      <div className="workspace">
        <section className="city-section">
          <div className="intro">
            <div>
              <div className="eyebrow">
                AN EXPERIMENT IN ORDINARY LIFE <span> / v0.1</span>
              </div>
              <h1>
                A thousand lives.
                <br />
                <em>No scripted evenings.</em>
              </h1>
              <p>
                Ordinary code runs the world. Fuzzy judgments shape what happens
                next.
              </p>
            </div>
            <div className="clock">
              <span className="eyebrow">
                DAY {String(w.day).padStart(2, "0")}{" "}
                <span>
                  ·{" "}
                  {new Date(Date.UTC(2026, 8, 22 + w.day))
                    .toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      timeZone: "UTC",
                    })
                    .toUpperCase()}
                </span>
              </span>
              <strong data-testid="simulation-time">
                {timeLabel(w.minute)}
              </strong>
              <span className="clock-phase">{phase}</span>
            </div>
          </div>
          <div className="canvas-frame">
            <CityCanvas
              world={w}
              selectedId={selectedId}
              onSelect={select}
              layer={layer}
              paused={paused}
            />
            <div className="map-bottom">
              <div className="layer-switch" aria-label="Map layer">
                <button
                  aria-pressed={layer === "activity"}
                  onClick={() => setLayer("activity")}
                >
                  Activity
                </button>
                <button
                  aria-pressed={layer === "uncertainty"}
                  onClick={() => setLayer("uncertainty")}
                >
                  Uncertainty
                </button>
              </div>
              <button
                className="meet-button"
                onClick={() =>
                  select(w.citizens[Math.floor(w.minute / 5) % 1000].id)
                }
              >
                Meet a citizen <span>↗</span>
              </button>
            </div>
          </div>
          <div className="legend">
            {layer === "activity" ? (
              ACTIVITIES.map((a) => (
                <span key={a}>
                  <i style={{ background: COLORS[a] }} />
                  {LABELS[a]}
                </span>
              ))
            ) : (
              <>
                <span>
                  <i style={{ background: "#7cab57" }} />
                  More certain
                </span>
                <span>
                  <i style={{ background: "#dbc899" }} />
                  More uncertain
                </span>
                <span>Normalized binary entropy · 0 to 1</span>
              </>
            )}
          </div>
          <div className="transport">
            <div className="play-controls">
              <button
                className="pause-button"
                disabled={fatal}
                aria-label={paused ? "Resume simulation" : "Pause simulation"}
                onClick={() => setPaused(!paused)}
              >
                {paused ? "▶" : "Ⅱ"}
                <span>{paused ? "Resume" : "Pause"}</span>
              </button>
              <div className="speed-controls">
                {[1, 2, 4].map((s) => (
                  <button
                    key={s}
                    aria-pressed={speed === s}
                    onClick={() => setSpeed(s)}
                  >
                    {s}×
                  </button>
                ))}
              </div>
              <button
                className="skip-button"
                disabled={skipping || fatal}
                onClick={() => void skip()}
              >
                {skipping ? "Following every decision…" : "Skip to evening"}{" "}
                <span>⇥</span>
              </button>
            </div>
            <span className="transport-note">
              {simulation.queueSize
                ? `${simulation.queueSize} evaluations queued`
                : mode === "mock"
                  ? "DETERMINISTIC · SEEDED · REPLAYABLE"
                  : "BOUNDED QUEUE · LIVE JUDGMENTS"}
            </span>
          </div>
          <div className="city-footer">
            <span>1,000 people. A city becoming itself.</span>
            <button onClick={() => setDebug(!debug)}>
              {debug
                ? `Queue ${simulation.queueSize} · RNG ${w.rngState} · ${speed}×`
                : "View engine status ↗"}
            </button>
          </div>
        </section>
        <aside
          className={`side-panel ${citizen ? "has-citizen" : ""}`}
          aria-label={citizen ? "Citizen inspector" : "City observations"}
        >
          <AnimatePresence mode="wait">
            <motion.div
              className="panel-inner"
              key={citizen?.id ?? panel}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              {citizen && panel === "city" ? (
                <CitizenInspector
                  key={citizen.id}
                  citizen={citizen}
                  world={w}
                  onSelect={select}
                  onClose={() => setSelectedId(undefined)}
                />
              ) : panel === "stats" ? (
                <>
                  <div className="panel-heading">
                    <span className="eyebrow">THE CITY, IN NUMBERS</span>
                    <span className="tiny-mark">↗</span>
                  </div>
                  <h2 className="panel-title">Observations</h2>
                  <StatsPanel world={w} pricing={pricing} />
                </>
              ) : panel === "about" ? (
                <>
                  <div className="panel-heading">
                    <span className="eyebrow">ABOUT THE EXPERIMENT</span>
                    <span>↗</span>
                  </div>
                  <div className="panel-scroll about">
                    <h2>
                      A little uncertainty.
                      <br />A whole city.
                    </h2>
                    <p>
                      A thousand simulated citizens go about their lives. Each
                      evening, five probabilistic judgments meet ordinary,
                      deterministic code.
                    </p>
                    <p>
                      The model supplies probabilities. Code turns them into
                      activity weights, then samples an action using a seeded
                      random number. Encounters change relationships. Those
                      relationships shape tomorrow’s inputs.
                    </p>
                    <div className="architecture">
                      <span>PERSON + CONTEXT</span>
                      <b>↓</b>
                      <span>FIVE FUZZY JUDGMENTS</span>
                      <b>↓</b>
                      <span>WEIGHTS → SEEDED SAMPLE</span>
                      <b>↓</b>
                      <span>MOVEMENT → ENCOUNTERS</span>
                      <b>↓</b>
                      <span>TOMORROW’S RELATIONSHIPS</span>
                    </div>
                    <h3>No conversations. No scripted explanations.</h3>
                    <p>
                      Inspect a person to see the actual causal data. Change the
                      city principle to introduce a soft cultural norm into
                      future evaluations.
                    </p>
                    <p className="notice">
                      {mode === "mock"
                        ? "This run uses a deterministic mock model. It makes no AI API calls. Cultural effects in mock mode use a small, documented keyword heuristic."
                        : mode === "jevk5"
                          ? "This run uses local JevK5 inference on your GPU. No paid API key is required. Backend failures pause the simulation; no mock answers are substituted."
                          : `This run uses Jev through ${hostedProvider === "vercel" ? "Vercel AI Gateway" : "TypeSafe"}. Backend failures pause the simulation.`}
                    </p>
                    <p>
                      Version 0.1 · One Thousand Evenings
                      <br />A computational experiment, not a model of real
                      human behavior.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => setPanel("city")}
                    >
                      Back to the city ↗
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="panel-heading">
                    <span className="eyebrow">A CITY, THINKING</span>
                    <span className="tiny-mark">✳</span>
                  </div>
                  <div className="judgment-counter">
                    <span className="eyebrow">JUDGMENTS MADE</span>
                    <strong data-testid="judgment-count">
                      {w.judgments.toLocaleString()}
                    </strong>
                    <p>Small judgments. Compounding lives.</p>
                    <div className="counter-baseline">
                      <span>
                        {mode === "mock"
                          ? "MOCK"
                          : mode === "jevk5"
                            ? "JEVK5 · LOCAL"
                            : hostedProvider === "vercel" ? "VERCEL JEV" : "TYPESAFE JEV"}{" "}
                        / TYPED PROBABILITIES
                      </span>
                      <span>↗</span>
                    </div>
                  </div>
                  <div className="city-metrics">
                    <div>
                      <span>Population</span>
                      <strong>1,000</strong>
                    </div>
                    <div>
                      <span>
                        Active friendships{" "}
                        <small title="Directed bonds above the affinity and familiarity thresholds">
                          ↗
                        </small>
                      </span>
                      <strong>{today.friendships.toLocaleString()}</strong>
                    </div>
                    <div>
                      <span>Interactions today</span>
                      <strong>{today.interactions}</strong>
                    </div>
                    <div>
                      <span>City uncertainty</span>
                      <strong>
                        {today.noulCount
                          ? today.meanUncertainty.toFixed(2)
                          : "—"}
                        <small> / 1</small>
                      </strong>
                    </div>
                    <div>
                      <span>Decision API calls</span>
                      <strong>{w.apiCalls}</strong>
                    </div>
                  </div>
                  <CharterEditor
                    principle={w.principle}
                    onApply={(value) => {
                      simulation.changePrinciple(value);
                      render((n) => n + 1);
                    }}
                  />
                  <div className="event-section">
                    <div className="section-title">
                      <span>THE EVENING, UNFOLDING</span>
                      <i className="status-dot" />
                    </div>
                    <div className="event-stream" aria-live="off">
                      {events.map((event) => (
                        <button
                          key={event.id}
                          disabled={!event.citizenIds.length}
                          onClick={() =>
                            event.citizenIds[0] && select(event.citizenIds[0])
                          }
                        >
                          <time>{timeLabel(event.minute)}</time>
                          <span>{event.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </aside>
      </div>
      <footer className="site-footer">
        <span>
          FUZZY CITY <i>↗</i> ORDINARY CODE. EXTRAORDINARY CONSEQUENCES.
        </span>
        <div>
          {saved && (
            <button
              disabled={simulation.busy || skipping}
              onClick={() => {
                setSimulation(
                  new Simulation(
                    mode !== "mock"
                      ? new JevDecisionEngine()
                      : new MockDecisionEngine(),
                    saved,
                  ),
                );
                setSaved(undefined);
                setPaused(true);
                setSelectedId(undefined);
                setMessage("Saved run restored. Press Resume to continue.");
              }}
            >
              Resume saved day {saved.day} ↗
            </button>
          )}
          <button
            disabled={simulation.busy || skipping || fatal}
            onClick={() => void save()}
          >
            Save on this device
          </button>
          <span>
            {mode === "live" ? "SERVER-SIDE API KEY" : "NO API KEY NEEDED"}
          </span>
        </div>
      </footer>
      {message && (
        <div className={`toast ${fatal ? "error" : ""}`} role="status">
          <span>{message}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}
