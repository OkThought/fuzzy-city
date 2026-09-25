import type { World } from "../sim/types";
import { ACTIVITIES, COLORS, LABELS } from "../sim/types";
import { ProbabilityBar } from "./DecisionInspector";
export default function StatsPanel({
  world,
  pricing,
}: {
  world: World;
  pricing: { input: number | null; output: number | null };
}) {
  const today = world.metrics.at(-1)!;
  const total = Object.values(today.activities).reduce((a, b) => a + b, 0);
  const locations = Object.entries(today.locations)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  return (
    <div className="panel-scroll">
      <div className="section-title">
        TONIGHT’S SAMPLED INTENTIONS <span>{total}/1,000</span>
      </div>
      {ACTIVITIES.map((a) => (
        <ProbabilityBar
          key={a}
          label={`${LABELS[a]} · ${today.activities[a]}`}
          value={total ? today.activities[a] / total : 0}
          color={COLORS[a]}
        />
      ))}
      <p className="small muted">
        Intentions before invitation and capacity resolutions.
      </p>
      <div className="section-title sublabel">THE SOCIAL FABRIC</div>
      {[
        ["Directed friendships", today.friendships],
        ["Negative relationships", today.negativeRelationships],
        ["Interactions today", today.interactions],
        ["No interaction yet tonight", today.alone],
        ["Mean uncertainty today", today.meanUncertainty.toFixed(3)],
        ["Total typed judgments", world.judgments.toLocaleString()],
        ["Decision API attempts", world.apiCalls],
        ["Input tokens", world.inputTokens],
        ["Output tokens", world.outputTokens],
        [
          "Fallback evaluations",
          world.traces.filter((t) => t.source === "fallback").length,
        ],
      ].map(([label, value]) => (
        <div className="data-row" key={label}>
          <span>{label}</span>
          <span className="mono">{value}</span>
        </div>
      ))}
      <div className="data-row">
        <span>Estimated API cost</span>
        <span>
          {world.mode === "jevk5"
            ? "Local · no API charge"
            : pricing.input !== null && pricing.output !== null
              ? `$${((world.inputTokens * pricing.input + world.outputTokens * pricing.output) / 1e6).toFixed(4)}`
              : "Not configured"}
        </span>
      </div>
      {world.mode !== "jevk5" && pricing.input !== null && (
        <p className="small muted">
          Configured USD / million tokens: input {pricing.input}, output{" "}
          {pricing.output ?? "unknown"}. Usage without a valid response is
          unavailable.
        </p>
      )}
      <div className="section-title sublabel">WHERE PEOPLE CONNECT</div>
      {locations.length ? (
        locations.map(([id, count]) => (
          <div className="data-row" key={id}>
            <span>{world.locations.find((l) => l.id === id)?.name}</span>
            <span>{count} encounters</span>
          </div>
        ))
      ) : (
        <p className="small muted">Encounters begin at 19:00.</p>
      )}
      <div className="section-title sublabel">PREVIOUS EVENINGS</div>
      {world.metrics
        .slice(0, -1)
        .slice(-14)
        .map((day) => (
          <div key={day.day} className="data-row">
            <span>Day {day.day}</span>
            <span>
              {day.interactions} encounters · {day.judgments} judgments
            </span>
          </div>
        ))}
      <p className="small muted">
        All totals come from stored evaluations. In mock mode, no Jev API calls
        are made.
      </p>
    </div>
  );
}
