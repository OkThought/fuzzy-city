"use client";
import { useState } from "react";
import type { Citizen, World } from "../sim/types";
import { LABELS } from "../sim/types";
import DecisionInspector, { ProbabilityBar } from "./DecisionInspector";
import { isFriend } from "../sim/relationships";
export default function CitizenInspector({
  citizen: c,
  world,
  onClose,
  onSelect,
}: {
  citizen: Citizen;
  world: World;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [tab, setTab] = useState<"evening" | "life" | "connections">("evening");
  const [relation, setRelation] = useState<string>();
  const [traceId, setTraceId] = useState<string>();
  const plan = c.currentPlan;
  const history = world.traces.filter((t) => t.citizenIds.includes(c.id));
  const trace = traceId
    ? world.traces.find((t) => t.id === traceId)
    : history.findLast((t) => t.kind === "evening_intentions");
  const relationships = c.knownPeople
    .map((id) => world.relationships[`${c.id}>${id}`])
    .filter(Boolean)
    .sort((a, b) => b.affinity - a.affinity);
  const r = relation ? world.relationships[`${c.id}>${relation}`] : undefined;
  const locationName = (id: string) =>
    world.locations.find((l) => l.id === id)?.name ?? "In transit";
  const name = (id: string) => {
    const person = world.citizens.find((c) => c.id === id);
    return person ? `${person.firstName} ${person.lastName}` : id;
  };
  return (
    <>
      <div className="panel-heading">
        <span className="eyebrow">ONE OF A THOUSAND</span>
        <button
          aria-label="Close citizen inspector"
          className="icon-button"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="citizen-title">
        <div className="avatar">
          {c.firstName[0]}
          {c.lastName[0]}
          <i />
        </div>
        <div>
          <h2>
            {c.firstName} {c.lastName}
          </h2>
          <p>
            {c.age} · {c.occupation}
          </p>
        </div>
      </div>
      <div className="citizen-status">
        <span className="status-dot" />
        {LABELS[c.activity]} <span>→ {locationName(c.destinationId)}</span>
      </div>
      <nav className="panel-tabs" aria-label="Citizen details">
        {(["evening", "life", "connections"] as const).map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setTraceId(undefined);
            }}
          >
            {t === "evening"
              ? "This evening"
              : t === "life"
                ? "Their life"
                : "Connections"}
          </button>
        ))}
      </nav>
      <div className="panel-scroll">
        {tab === "evening" &&
          (trace ? (
            <>
              <DecisionInspector trace={trace} world={world} />
              {plan?.resolution && (
                <p className="notice">Schedule resolution: {plan.resolution}</p>
              )}
              {plan?.friendTraceId && (
                <DecisionInspector
                  trace={world.traces.find((t) => t.id === plan.friendTraceId)!}
                  world={world}
                />
              )}
              <div className="eyebrow sublabel">DECISION HISTORY</div>
              {history
                .slice(-15)
                .reverse()
                .map((t) => (
                  <button
                    className="history-row"
                    key={t.id}
                    onClick={() => setTraceId(t.id)}
                  >
                    <span>
                      Day {t.simulationDay} · {t.kind.replaceAll("_", " ")}
                    </span>
                    <span className="source">{t.source} ↗</span>
                  </button>
                ))}
            </>
          ) : (
            <div className="empty-state">
              <span>↗</span>
              <h3>An evening still unwritten.</h3>
              <p>
                The first intentions are evaluated from 17:00. Come back soon,
                or skip to evening.
              </p>
            </div>
          ))}
        {tab === "life" && (
          <>
            <div className="section-title">RIGHT NOW</div>
            {(["energy", "stress", "socialNeed", "satisfaction"] as const).map(
              (key) => (
                <ProbabilityBar
                  key={key}
                  label={
                    key === "socialNeed"
                      ? "Social need"
                      : key[0].toUpperCase() + key.slice(1)
                  }
                  value={c.state[key]}
                  color="#a7b49b"
                />
              ),
            )}
            <div className="data-row">
              <span>Money</span>
              <strong>€{c.state.money.toFixed(2)}</strong>
            </div>
            <div className="section-title sublabel">DISPOSITION</div>
            {Object.entries(c.traits).map(([key, value]) => (
              <div className="data-row" key={key}>
                <span>{key.replace("riskTolerance", "Risk tolerance")}</span>
                <span className="mono">{value.toFixed(2)}</span>
              </div>
            ))}
            <div className="section-title sublabel">PLACES</div>
            <div className="data-row">
              <span>Home</span>
              <span>{locationName(c.homeId)}</span>
            </div>
            <div className="data-row">
              <span>Work</span>
              <span>{locationName(c.workplaceId)}</span>
            </div>
            <div className="section-title sublabel">RECENT MEMORIES</div>
            {c.recentMemories.length ? (
              c.recentMemories
                .slice()
                .reverse()
                .map((m) => (
                  <button
                    key={m.traceId}
                    className="memory"
                    onClick={() => {
                      setTraceId(m.traceId);
                      setTab("evening");
                    }}
                  >
                    <span>
                      Day {m.day} · {name(m.otherCitizenId)}
                    </span>
                    <span>
                      Connection {Math.round(m.connectionProbability * 100)}% ·
                      Δ {m.affinityDelta.toFixed(3)} ↗
                    </span>
                  </button>
                ))
            ) : (
              <p className="small muted">No memorable encounters yet.</p>
            )}
          </>
        )}
        {tab === "connections" && (
          <>
            <div className="section-title">
              DIRECTED RELATIONSHIPS <span>{relationships.length}</span>
            </div>
            <p className="small muted">
              How {c.firstName} feels about others. The feeling may not be
              mutual.
            </p>
            {relationships.map((item) => (
              <button
                key={item.toCitizenId}
                className={`relationship ${relation === item.toCitizenId ? "active" : ""}`}
                onClick={() => setRelation(item.toCitizenId)}
              >
                <span>
                  {name(item.toCitizenId)}
                  <small>
                    {isFriend(item) ? "Friendship" : "Acquaintance"}
                  </small>
                </span>
                <span className="mono">
                  {item.affinity >= 0 ? "+" : ""}
                  {item.affinity.toFixed(2)} ↗
                </span>
              </button>
            ))}
            {r && (
              <div className="relationship-detail">
                <h3>
                  {c.firstName} → {name(r.toCitizenId)}
                </h3>
                <div className="data-row">
                  <span>Affinity</span>
                  <span>{r.affinity.toFixed(3)}</span>
                </div>
                <div className="data-row">
                  <span>Familiarity</span>
                  <span>{r.familiarity.toFixed(3)}</span>
                </div>
                <div className="data-row">
                  <span>Interactions</span>
                  <span>{r.interactionCount}</span>
                </div>
                {r.history.length ? (
                  r.history.map((h, i) => (
                    <button
                      className="history-row"
                      key={i}
                      onClick={() => {
                        setTraceId(h.traceId);
                        setTab("evening");
                      }}
                    >
                      <span>Day {h.day}</span>
                      <span>
                        Δ {h.delta >= 0 ? "+" : ""}
                        {h.delta.toFixed(4)} ↗
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="small muted">
                    Seeded relationship. No modeled encounters yet.
                  </p>
                )}
                <button
                  className="text-button"
                  onClick={() => onSelect(r.toCitizenId)}
                >
                  Meet {name(r.toCitizenId)} ↗
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
