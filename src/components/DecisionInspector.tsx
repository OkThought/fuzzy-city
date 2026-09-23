"use client";
import { motion } from "motion/react";
import {
  COLORS,
  LABELS,
  type Activity,
  type DecisionTrace,
  type World,
} from "../sim/types";
export function ProbabilityBar({
  label,
  value,
  color = "#d6b985",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="probability">
      <div>
        <span>{label}</span>
        <span className="mono">{Math.round(value * 100)}%</span>
      </div>
      <div className="bar-track">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value * 100}%` }}
          transition={{ duration: 0.45 }}
          style={{ background: color }}
        />
      </div>
    </div>
  );
}
const QUESTION_LABELS: Record<string, string> = {
  wants_rest: "Rest",
  seeks_company: "Seek company",
  seeks_novelty: "Seek novelty",
  willing_to_spend: "Comfortable spending",
  wants_extra_work: "Keep working",
  a_felt_connection: "A felt connection",
  b_felt_connection: "B felt connection",
  felt_tension: "Tension",
  memorable: "Memorable",
};
export default function DecisionInspector({
  trace,
  world,
}: {
  trace: DecisionTrace;
  world: World;
}) {
  const name = (id: string) => {
    const c = world.citizens.find((c) => c.id === id);
    return c
      ? `${c.firstName} ${c.lastName}`
      : id === "none"
        ? "No one tonight"
        : id;
  };
  return (
    <div className="decision-inspector">
      <div className="section-title">
        <span>
          {trace.kind === "friend_selection"
            ? "WHO TO VISIT?"
            : trace.kind === "social_interaction"
              ? "THE ENCOUNTER"
              : "WHY THIS EVENING?"}
        </span>
        <span className={`source ${trace.source}`}>{trace.source}</span>
      </div>
      <p className="small muted">
        Day {trace.simulationDay} · {trace.model}
      </p>
      {trace.error && (
        <p className="notice">{trace.error}. Deterministic fallback used.</p>
      )}
      <div className="eyebrow sublabel">
        01 /{" "}
        {trace.kind === "friend_selection"
          ? "CHOICE DISTRIBUTION"
          : "TYPED JUDGMENTS"}
      </div>
      {Object.entries(trace.answers).map(([key, value]) => (
        <ProbabilityBar
          key={key}
          label={QUESTION_LABELS[key] ?? name(key)}
          value={value}
        />
      ))}
      {trace.kind === "evening_intentions" && (
        <>
          <div className="eyebrow sublabel">
            02 / DERIVED ACTIVITY DISTRIBUTION
          </div>
          {Object.entries(trace.derivedValues?.probabilities ?? {})
            .sort((a, b) => b[1] - a[1])
            .map(([key, value]) => (
              <ProbabilityBar
                key={key}
                label={LABELS[key as Activity]}
                value={value}
                color={COLORS[key]}
              />
            ))}
        </>
      )}
      {trace.derivedValues?.rngSample !== undefined && (
        <div className="sample-result">
          <span className="eyebrow">
            {trace.kind === "evening_intentions" ? "03 / " : ""}SEEDED SAMPLE ·{" "}
            {trace.derivedValues.rngSample.toFixed(4)}
          </span>
          <strong>
            ↳{" "}
            {trace.kind === "friend_selection"
              ? name(String(trace.outcome.selected))
              : LABELS[trace.outcome.sampledAction as Activity]}
          </strong>
        </div>
      )}
      <details>
        <summary>Inspect the stored trace ↗</summary>
        <pre>{JSON.stringify(trace, null, 2)}</pre>
      </details>
    </div>
  );
}
