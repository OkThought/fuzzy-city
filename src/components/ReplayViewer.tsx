"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { timeLabel } from "../sim/decisions";
import { ACTIVITIES, COLORS, LABELS, type CityEvent, type World } from "../sim/types";
import { loadReplayFrame, loadReplayIndex } from "../replay/load";
import type { ReplayIndex } from "../replay/types";
import CityCanvas from "./CityCanvas";
import CitizenInspector from "./CitizenInspector";
import DecisionInspector from "./DecisionInspector";

const INDEX_URL = "/recordings/milestone-one-jevk5/index.json";
const speeds = [0.5, 1, 2, 4];

function duration(value: number | null) {
  if (value === null) return "runtime unknown";
  const seconds = Math.round(value / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s wall time`;
}

function bytes(value: number) {
  return value < 1024 * 1024
    ? `${Math.round(value / 1024)} KB`
    : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function ReplayInspector({
  world,
  event,
  onClose,
  onSelect,
}: {
  world: World;
  event: CityEvent;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const traces = event.traceIds
    .map((id) => world.traces.find((trace) => trace.id === id))
    .filter((trace) => trace !== undefined);
  return (
    <>
      <div className="panel-heading">
        <span className="eyebrow">TRACE-LINKED EVENT</span>
        <button className="icon-button" aria-label="Close event inspector" onClick={onClose}>×</button>
      </div>
      <div className="panel-scroll replay-inspector">
        <p className="replay-classification">EDITORIAL NARRATION</p>
        <h2>{event.text}</h2>
        <p className="small muted">Day {event.day} · {timeLabel(event.minute)} · event ID {event.id}</p>
        {!!event.citizenIds.length && (
          <div className="replay-people">
            {event.citizenIds.map((id) => {
              const citizen = world.citizens.find((item) => item.id === id);
              return citizen ? (
                <button key={id} className="text-button" onClick={() => onSelect(id)}>
                  Follow {citizen.firstName} {citizen.lastName} ↗
                </button>
              ) : null;
            })}
          </div>
        )}
        {traces.map((trace) => (
          <section key={trace.id} className="replay-trace">
            <p className="replay-classification">MODEL OUTPUT · STORED PROBABILITIES</p>
            <DecisionInspector trace={trace} world={world} />
            <p className="replay-classification">CODE-DERIVED RESOLUTION</p>
            <pre>{JSON.stringify({ derivedValues: trace.derivedValues, outcome: trace.outcome }, null, 2)}</pre>
          </section>
        ))}
        {!traces.length && <p className="notice">This event has no model trace. It was produced by the programmed simulation rules.</p>}
      </div>
    </>
  );
}

export default function ReplayViewer() {
  const [index, setIndex] = useState<ReplayIndex>();
  const [world, setWorld] = useState<World>();
  const [frameIndex, setFrameIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedEvent, setSelectedEvent] = useState<CityEvent>();
  const [layer, setLayer] = useState<"activity" | "uncertainty">("activity");
  const requestId = useRef(0);
  const indexRef = useRef<ReplayIndex | undefined>(undefined);

  const showFrame = useCallback(async (next: number, replayIndex = indexRef.current) => {
    if (!replayIndex) return;
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const nextWorld = await loadReplayFrame(replayIndex, next);
      if (id !== requestId.current) return;
      setWorld(nextWorld);
      setFrameIndex(next);
      setSelectedEvent(undefined);
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : "Replay loading failed");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadReplayIndex(INDEX_URL)
      .then(async (replayIndex) => {
        if (!active) return;
        indexRef.current = replayIndex;
        setIndex(replayIndex);
        await showFrame(0, replayIndex);
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "Replay loading failed"));
    return () => { active = false; requestId.current++; };
  }, [showFrame]);

  useEffect(() => {
    if (!index || paused || loading || error) return;
    if (frameIndex >= index.frames.length - 1) { setPaused(true); return; }
    const timer = setTimeout(() => void showFrame(frameIndex + 1), 1400 / speed);
    return () => clearTimeout(timer);
  }, [error, frameIndex, index, loading, paused, showFrame, speed]);

  const days = useMemo(() => [...new Set(index?.frames.map((frame) => frame.day) ?? [])], [index]);
  const currentDayIndex = world ? days.indexOf(world.day) : 0;
  const jumpDay = (offset: number) => {
    if (!index) return;
    const day = days[currentDayIndex + offset];
    const target = index.frames.findIndex((frame) => frame.day === day);
    if (target >= 0) void showFrame(target);
  };
  const selectCitizen = (id: string) => { setSelectedId(id); setSelectedEvent(undefined); };

  if (!index || !world) return (
    <main className="loading" aria-live="polite">
      <span className="brand-mark">f.</span>
      <h1>Loading recorded city</h1>
      <p>{error || "Fetching the first verified checkpoint…"}</p>
    </main>
  );

  const frame = index.frames[frameIndex];
  const citizen = world.citizens.find((item) => item.id === selectedId);
  const recentEvents = world.events.slice(-10).reverse();
  const simulatedMinutes =
    (index.frames.at(-1)!.day - index.frames[0].day) * 1440 +
    index.frames.at(-1)!.minute - index.frames[0].minute;

  return (
    <main className="app-shell replay-shell">
      <header className="site-header">
        <a href="/replay" className="brand" aria-label="Fuzzy City replay home">
          <span className="brand-mark">f.</span>
          <span>FUZZY CITY<small>DECISION TRAIL</small></span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a className="active" href="/replay">Replay</a>
          <a href="/">Development live mode ↗</a>
          <a href="/benchmark">Benchmark ↗</a>
        </nav>
        <div className="header-actions">
          <span className="mode-badge jevk5"><i /> RECORDED LOCAL JEVK5</span>
        </div>
      </header>

      <div className="replay-banner">
        <strong>Recorded Jev simulation · interactive replay</strong>
        <span>Provider {index.recording.provider} · {index.recording.model} · {duration(index.recording.wallTimeMs)}</span>
      </div>
      {index.recording.status !== "complete" && (
        <div className="replay-warning" role="status">
          <strong>Preserved incomplete recording.</strong> This validated {simulatedMinutes}-minute fragment stopped before completing an evening. {index.recording.uncertaintyNote}
        </div>
      )}

      <div className="workspace replay-workspace">
        <section className="city-section">
          <div className="intro replay-intro">
            <div>
              <div className="eyebrow">RECORDED {new Date(index.recording.startedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase()}</div>
              <h1>A city you can rewind.<br /><em>Every judgment stays inspectable.</em></h1>
              <p>{index.recording.population} citizens · {index.recording.journalCount} recorded evaluations · {index.recording.judgments.toLocaleString()} judgments</p>
            </div>
            <div className="clock">
              <span className="eyebrow">DAY {String(world.day).padStart(2, "0")}</span>
              <strong data-testid="replay-time">{timeLabel(world.minute)}</strong>
              <span className="clock-phase">checkpoint {frameIndex + 1} / {index.frames.length}</span>
            </div>
          </div>

          <div className={`canvas-frame ${loading ? "is-loading" : ""}`}>
            <CityCanvas world={world} selectedId={selectedId} onSelect={selectCitizen} layer={layer} paused={paused} />
            {loading && <div className="chunk-loading" role="status">Loading and verifying checkpoint…</div>}
            <div className="map-bottom">
              <div className="layer-switch" aria-label="Map layer">
                <button aria-pressed={layer === "activity"} onClick={() => setLayer("activity")}>Activity</button>
                <button aria-pressed={layer === "uncertainty"} onClick={() => setLayer("uncertainty")}>Uncertainty</button>
              </div>
              {citizen && <span className="following-label">FOLLOWING · {citizen.firstName} {citizen.lastName}</span>}
            </div>
          </div>

          <div className="legend">
            {ACTIVITIES.map((activity) => <span key={activity}><i style={{ background: COLORS[activity] }} />{LABELS[activity]}</span>)}
          </div>

          <section className="replay-transport" aria-label="Replay controls">
            <div className="play-controls">
              <button className="pause-button" aria-label={paused ? "Play replay" : "Pause replay"} onClick={() => setPaused((value) => !value)}>
                {paused ? "▶" : "Ⅱ"} <span>{paused ? "Play" : "Pause"}</span>
              </button>
              <div className="speed-controls" aria-label="Playback speed">
                {speeds.map((value) => <button key={value} aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}
              </div>
            </div>
            <label className="replay-scrubber">
              <span className="sr-only">Replay timeline</span>
              <input aria-label="Replay timeline" type="range" min={0} max={index.frames.length - 1} value={frameIndex} onChange={(event) => { setPaused(true); void showFrame(Number(event.target.value)); }} />
              <span>{timeLabel(index.frames[0].minute)}</span><span>{timeLabel(index.frames.at(-1)!.minute)}</span>
            </label>
            <div className="evening-nav" aria-label="Evening navigation">
              <button disabled={currentDayIndex <= 0} onClick={() => jumpDay(-1)}>← Previous evening</button>
              <button disabled={currentDayIndex >= days.length - 1} onClick={() => jumpDay(1)}>Next evening →</button>
            </div>
          </section>
          {error && <p className="toast error">{error}</p>}

          <footer className="city-footer replay-provenance">
            <span>Rules {index.recording.rules} · snapshot {index.recording.snapshot.slice(0, 12)}… · {index.recording.kernel}</span>
            <span>Initial transfer {bytes(index.initialBytes)} · full replay {bytes(index.totalBytes)}</span>
          </footer>
        </section>

        <aside className={`side-panel ${citizen || selectedEvent ? "has-citizen" : ""}`} aria-label="Replay evidence inspector">
          <div className="panel-inner">
            {selectedEvent ? (
              <ReplayInspector world={world} event={selectedEvent} onClose={() => setSelectedEvent(undefined)} onSelect={selectCitizen} />
            ) : citizen ? (
              <CitizenInspector citizen={citizen} world={world} onClose={() => setSelectedId(undefined)} onSelect={selectCitizen} />
            ) : (
              <>
                <div className="panel-heading"><span className="eyebrow">RECORDED EVIDENCE</span><span className="tiny-mark">↗</span></div>
                <div className="judgment-counter"><span className="eyebrow">VALIDATED JUDGMENTS BY THIS POINT</span><strong>{world.judgments.toLocaleString()}</strong><p>Not fresh inference. These outcomes are replayed from the recording.</p></div>
                <div className="event-section">
                  <div className="section-title"><span>EVENTS AT THIS CHECKPOINT</span><span>{world.events.length}</span></div>
                  <div className="event-stream">
                    {recentEvents.map((event) => <button key={event.id} onClick={() => setSelectedEvent(event)}><time>{timeLabel(event.minute)}</time><span>{event.text}</span></button>)}
                    {!recentEvents.length && <p className="small muted">The city is approaching its first recorded decisions.</p>}
                  </div>
                </div>
                <div className="replay-method">
                  <p className="replay-classification">WHAT YOU ARE SEEING</p>
                  <p>Model output is stored as probabilities. Seeded code sampled actions and applied the city rules. Event prose is editorial narration tied back to trace IDs.</p>
                  <p>Editing the principle is unavailable here because it would require a different recorded future.</p>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
