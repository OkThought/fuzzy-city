import { normalize } from "./rng";
import type {
  Citizen,
  CitizenContext,
  DecisionState,
  Probabilities,
  World,
} from "./types";
export const timeLabel = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export function context(world: World, c: Citizen): CitizenContext {
  return structuredClone({
    id: c.id,
    age: c.age,
    occupation: c.occupation,
    traits: c.traits,
    current_state: {
      ...c.state,
      days_since_meaningful_social_contact: world.day - c.lastContactDay,
    },
    known_people: c.knownPeople
      .map((id) => world.relationships[`${c.id}>${id}`])
      .filter(Boolean),
    recent_memories: c.recentMemories,
  });
}
export function decisionState(world: World, c: Citizen): DecisionState {
  return {
    world: {
      day: world.day,
      time: timeLabel(world.minute),
      city_principle: world.principle,
      cultural_norm:
        "A soft cultural norm, not an absolute instruction. Consider individual context.",
    },
    citizen: context(world, c),
  };
}
export function activityDistribution(
  c: Citizen,
  p: Probabilities,
  friendOpportunity: number,
) {
  const R = p.wants_rest,
    C = p.seeks_company,
    N = p.seeks_novelty,
    S = p.willing_to_spend,
    W = p.wants_extra_work;
  const weights = {
    home_rest: 0.15 + 1.4 * R + 0.35 * (1 - c.state.energy),
    overtime: 0.05 + W + 0.4 * c.traits.ambition,
    visit_friend: 0.05 + 1.3 * C * friendOpportunity,
    cafe: 0.05 + 0.9 * C * S,
    park: 0.05 + 0.7 * N * (1 - S) + 0.2 * R,
    explore: 0.05 + 1.1 * N * c.traits.openness,
  };
  return { weights, probabilities: normalize(weights) };
}
