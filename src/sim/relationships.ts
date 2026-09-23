import { clamp } from "./rng";
import {
  MEMORY_LIMIT,
  type Citizen,
  type DecisionTrace,
  type Relationship,
  type World,
} from "./types";
export const isFriend = (r: Relationship) =>
  r.affinity > 0.35 && r.familiarity > 0.2;
export function applyInteraction(
  world: World,
  a: Citizen,
  b: Citizen,
  trace: DecisionTrace,
): { newFriends: number; deltaA: number; deltaB: number } {
  let newFriends = 0;
  const deltas: number[] = [];
  for (const [from, to, connection] of [
    [a, b, trace.answers.a_felt_connection],
    [b, a, trace.answers.b_felt_connection],
  ] as const) {
    const key = `${from.id}>${to.id}`;
    const r = (world.relationships[key] ??= {
      fromCitizenId: from.id,
      toCitizenId: to.id,
      affinity: 0,
      familiarity: 0,
      interactionCount: 0,
      lastInteractionDay: null,
      history: [],
    });
    const wasFriend = isFriend(r),
      old = r.affinity;
    r.affinity = clamp(
      r.affinity +
        0.08 * (2 * connection - 1) -
        0.06 * trace.answers.felt_tension,
      -1,
      1,
    );
    const delta = r.affinity - old;
    deltas.push(delta);
    r.familiarity = clamp(r.familiarity + 0.045);
    r.interactionCount++;
    r.lastInteractionDay = world.day;
    r.history.push({ day: world.day, delta, traceId: trace.id });
    if (!wasFriend && isFriend(r)) newFriends++;
    if (!from.knownPeople.includes(to.id)) from.knownPeople.push(to.id);
    from.lastContactDay = world.day;
    from.interactedDay = world.day;
    from.state.socialNeed = clamp(from.state.socialNeed - 0.3 * connection);
    from.state.satisfaction = clamp(from.state.satisfaction + delta);
    if (trace.answers.memorable > 0.65) {
      from.recentMemories.push({
        type: "social_interaction",
        otherCitizenId: to.id,
        locationId: from.currentLocationId,
        day: world.day,
        connectionProbability: connection,
        tensionProbability: trace.answers.felt_tension,
        affinityDelta: delta,
        traceId: trace.id,
      });
      from.recentMemories = from.recentMemories.slice(-MEMORY_LIMIT);
    }
  }
  return { newFriends, deltaA: deltas[0], deltaB: deltas[1] };
}
