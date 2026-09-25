import { clamp, normalize, Rng } from "../sim/rng";
import type { Evaluation, Job, Probabilities } from "../sim/types";
export function mockEvaluation(
  job: Job,
  source: "mock" | "fallback" = "mock",
): Evaluation {
  const rng = new Rng(JSON.stringify(job));
  const { citizen: c, world, other, candidates } = job.state;
  const s = c.current_state,
    t = c.traits;
  const norm = world.city_principle.toLowerCase();
  const communal = /relationships|others|communal/.test(norm) ? 0.08 : 0;
  const ambitious = /achievement|discipline|opportunities/.test(norm)
    ? 0.13
    : 0;
  const restless = /novelty|spontaneity|unfamiliar/.test(norm) ? 0.14 : 0;
  const p = (value: number) =>
    clamp(value + (rng.next() - 0.5) * 0.14, 0.02, 0.98);
  let answers: Probabilities;
  if (job.kind === "evening_intentions")
    answers = {
      wants_rest: p(0.1 + (1 - s.energy) * 0.7 + s.stress * 0.18),
      seeks_company: p(
        0.08 + t.sociability * 0.4 + s.socialNeed * 0.4 + communal,
      ),
      seeks_novelty: p(0.1 + t.openness * 0.7 + restless),
      willing_to_spend: p(
        0.1 + Math.min(1, s.money / 180) * 0.7 + t.riskTolerance * 0.12,
      ),
      wants_extra_work: p(
        0.03 +
          t.ambition * 0.65 +
          t.conscientiousness * 0.1 -
          s.stress * 0.28 +
          ambitious,
      ),
    };
  else if (job.kind === "friend_selection")
    answers = normalize({
      none: 0.15 + (1 - s.energy) * 0.25,
      ...Object.fromEntries(
        Object.entries(candidates ?? {}).map(([id, r]) => [
          id,
          0.1 +
            Math.max(0, r.affinity) * 1.5 +
            r.familiarity * 0.3 +
            rng.next() * 0.2,
        ]),
      ),
    });
  else {
    const b = other!;
    const similarity = 1 - Math.abs(t.openness - b.traits.openness);
    const aRel =
      c.known_people.find((r) => r.toCitizenId === b.id)?.affinity ?? 0;
    const bRel =
      b.known_people.find((r) => r.toCitizenId === c.id)?.affinity ?? 0;
    answers = {
      a_felt_connection: p(
        0.3 + similarity * 0.25 + t.sociability * 0.2 + aRel * 0.16 + communal,
      ),
      b_felt_connection: p(
        0.3 +
          similarity * 0.25 +
          b.traits.sociability * 0.2 +
          bRel * 0.16 +
          communal,
      ),
      felt_tension: p(
        0.04 +
          (s.stress + b.current_state.stress) * 0.14 +
          (1 - similarity) * 0.25,
      ),
      memorable: p(0.25 + t.openness * 0.3 + rng.next() * 0.35),
    };
  }
  return {
    source,
    model: "deterministic-mock-v1",
    answers,
    latencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    apiCalls: 0,
  };
}
