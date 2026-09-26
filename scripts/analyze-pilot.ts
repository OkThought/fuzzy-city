import { writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { isFriend } from "../src/sim/relationships";
import { loadCheckpoint, readJson } from "../src/recording/format";
import { ACTIVITIES, type Activity, type World } from "../src/sim/types";

interface PilotManifest {
  status: string;
  completedEvenings: number;
  population: number;
  startedAt: string;
  endedAt?: string;
  journalCount: number;
  uncertainAttempts: number;
  evenings: { evening: number; elapsedMs: number; diskBytes: number; maxContextBytes: number; peakGpuMiB: number | null }[];
}

const source = resolve(process.argv[2] ?? "recordings/pilot-1000-3e");
const outputArg = process.argv.indexOf("--output");
const output = outputArg < 0 ? join(source, "pilot-analysis.json") : resolve(process.argv[outputArg + 1]);
const manifest = readJson<PilotManifest>(join(source, "manifest.json"));
if (manifest.status !== "complete" || manifest.completedEvenings < 3)
  throw new Error("Pilot analysis requires a complete recording of at least three evenings");
const initial = readJson<World>(join(source, "initial.json"));
const final = loadCheckpoint(source).world;
const completedDays = new Set(manifest.evenings.map((evening) => evening.evening));
const traces = final.traces.filter((trace) => completedDays.has(trace.simulationDay));
const interactions = traces.filter((trace) => trace.kind === "social_interaction");
const intentions = traces.filter((trace) => trace.kind === "evening_intentions");
const locations = new Map(final.locations.map((location) => [location.id, location]));

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const activityByDay = manifest.evenings.map(({ evening }) => {
  const counts = Object.fromEntries(ACTIVITIES.map((activity) => [activity, 0])) as Record<Activity, number>;
  for (const trace of intentions.filter((trace) => trace.simulationDay === evening))
    counts[trace.outcome.sampledAction as Activity]++;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const shares = Object.fromEntries(ACTIVITIES.map((activity) => [activity, total ? counts[activity] / total : 0])) as Record<Activity, number>;
  const entropy = -Object.values(shares).filter(Boolean).reduce((sum, share) => sum + share * Math.log(share), 0) / Math.log(ACTIVITIES.length);
  return { day: evening, counts, shares, normalizedShannonDiversity: entropy, largestShare: Math.max(...Object.values(shares)) };
});

const pairMap = new Map<string, typeof interactions>();
for (const trace of interactions) {
  const key = [...trace.citizenIds].sort().join("|");
  const list = pairMap.get(key) ?? [];
  list.push(trace);
  pairMap.set(key, list);
}
const repeatedPairs = [...pairMap.entries()].filter(([, pairTraces]) => pairTraces.length > 1).sort((a, b) => b[1].length - a[1].length);
const contactsByDay = manifest.evenings.map(({ evening }) => {
  const dayInteractions = interactions.filter((trace) => trace.simulationDay === evening);
  const contacted = new Set(dayInteractions.flatMap((trace) => trace.citizenIds));
  return { day: evening, interactions: dayInteractions.length, uniqueCitizensWithContact: contacted.size, noRecordedInteraction: manifest.population - contacted.size };
});

const initialRelationships = initial.relationships;
const changedRelationships = Object.values(final.relationships).filter((relationship) => relationship.history.some((entry) => completedDays.has(entry.day)));
const relationshipDeltas = changedRelationships.flatMap((relationship) => relationship.history.filter((entry) => completedDays.has(entry.day)).map((entry) => entry.delta));
const newDirectedFriendships = changedRelationships.filter((relationship) => isFriend(relationship) && !isFriend(initialRelationships[`${relationship.fromCitizenId}>${relationship.toCitizenId}`] ?? { ...relationship, affinity: 0, familiarity: 0 }));

const priorEvidenceTraces = intentions.filter((trace) => trace.simulationDay > 1 && (trace.stateSnapshot.citizen.recent_memories.length > 0 || trace.stateSnapshot.citizen.known_people.some((relationship) => relationship.interactionCount > 0)));
const memoryExamples = priorEvidenceTraces.slice(0, 8).map((trace) => ({
  decisionTraceId: trace.id,
  day: trace.simulationDay,
  citizenId: trace.citizenIds[0],
  priorMemoryTraceIds: trace.stateSnapshot.citizen.recent_memories.map((memory) => memory.traceId),
  interactedRelationships: trace.stateSnapshot.citizen.known_people.filter((relationship) => relationship.interactionCount > 0).map((relationship) => relationship.toCitizenId),
  modelProbabilities: trace.answers,
  sampledAction: trace.outcome.sampledAction,
}));

const plansByCitizen = new Map<string, string[]>();
for (const trace of intentions) {
  const id = trace.citizenIds[0];
  const plans = plansByCitizen.get(id) ?? [];
  plans.push(String(trace.outcome.sampledAction));
  plansByCitizen.set(id, plans);
}
const repetitive = [...plansByCitizen.values()].filter((plans) => plans.length === manifest.completedEvenings && new Set(plans).size === 1).length;
const capacityFallbacks = intentions.filter((trace) => {
  const activity = trace.outcome.sampledAction;
  const destination = locations.get(String(trace.outcome.destinationId));
  return destination?.kind === "plaza" && (activity === "cafe" || activity === "park");
});

const stateSummary = (world: World) => Object.fromEntries(["energy", "stress", "socialNeed", "money", "satisfaction"].map((field) => {
  const values = world.citizens.map((citizen) => citizen.state[field as keyof typeof citizen.state]);
  return [field, { mean: mean(values), min: Math.min(...values), max: Math.max(...values), atLowerBound: values.filter((value) => value === 0).length, atUpperBound: field === "money" ? null : values.filter((value) => value === 1).length }];
}));

const biggestChanges = changedRelationships.map((relationship) => ({
  fromCitizenId: relationship.fromCitizenId,
  toCitizenId: relationship.toCitizenId,
  totalDelta: relationship.history.filter((entry) => completedDays.has(entry.day)).reduce((sum, entry) => sum + entry.delta, 0),
  interactionCount: relationship.history.filter((entry) => completedDays.has(entry.day)).length,
  traceIds: relationship.history.filter((entry) => completedDays.has(entry.day)).map((entry) => entry.traceId),
  finalAffinity: relationship.affinity,
  finalFamiliarity: relationship.familiarity,
})).sort((a, b) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta));

const elapsed = manifest.evenings.map((evening) => evening.elapsedMs);
const diskGrowth = manifest.evenings.map((evening, index) => evening.diskBytes - (manifest.evenings[index - 1]?.diskBytes ?? 0));
const report = {
  schemaVersion: "fuzzy-city-pilot-analysis/v1",
  sourceRecording: basename(source),
  definitions: {
    activityDiversity: "Normalized Shannon entropy over six sampled evening activities; 0 is one activity only and 1 is uniform.",
    repeatEncounter: "An unordered citizen pair with more than one recorded social_interaction trace during the pilot.",
    directedRelationshipChange: "A directed relationship with at least one history entry during a completed pilot evening.",
    isolation: "A citizen without a recorded social_interaction trace on that evening; co-location without a trace is not counted.",
    priorEncounterInLaterInput: "A day 2+ intention trace whose exact model input contains a recent memory or known relationship with interactionCount above zero.",
    capacityFallback: "A cafe or park sampled action whose recorded destination is the plaza fallback used when eligible locations are full.",
  },
  provenance: { status: manifest.status, completedEvenings: manifest.completedEvenings, population: manifest.population, journalCount: manifest.journalCount, uncertainAttempts: manifest.uncertainAttempts },
  runtime: {
    perEveningMs: elapsed,
    totalEveningMs: elapsed.reduce((sum, value) => sum + value, 0),
    variationRatio: Math.max(...elapsed) / Math.min(...elapsed),
    maxContextBytesByEvening: manifest.evenings.map((evening) => evening.maxContextBytes),
    peakGpuMiBByEvening: manifest.evenings.map((evening) => evening.peakGpuMiB),
    diskBytesByEvening: manifest.evenings.map((evening) => evening.diskBytes),
    diskGrowthBytesByEvening: diskGrowth,
    projectedFourteenEvenings: {
      elapsedMsAtObservedMean: mean(elapsed) * 14,
      elapsedMsRangeUsingObservedMinMax: [Math.min(...elapsed) * 14, Math.max(...elapsed) * 14],
      rawDiskBytesAtObservedMeanGrowth: manifest.evenings[0].diskBytes + mean(diskGrowth.slice(1)) * 13,
    },
  },
  behavior: {
    activityByDay,
    contactsByDay,
    repeatEncounterPairs: repeatedPairs.length,
    repeatedPairDetails: repeatedPairs.slice(0, 20).map(([pair, pairTraces]) => ({ pair: pair.split("|"), count: pairTraces.length, traceIds: pairTraces.map((trace) => trace.id), days: pairTraces.map((trace) => trace.simulationDay) })),
    directedRelationshipsChanged: changedRelationships.length,
    directedRelationshipUpdates: relationshipDeltas.length,
    positiveRelationshipUpdates: relationshipDeltas.filter((delta) => delta > 0).length,
    negativeRelationshipUpdates: relationshipDeltas.filter((delta) => delta < 0).length,
    newDirectedFriendships: newDirectedFriendships.length,
    priorEncounterInLaterInput: { count: priorEvidenceTraces.length, shareOfLaterIntentions: priorEvidenceTraces.length / intentions.filter((trace) => trace.simulationDay > 1).length, examples: memoryExamples },
  },
  degeneracyChecks: {
    citizensRepeatingOneActivityEveryEvening: repetitive,
    repeatingShare: repetitive / manifest.population,
    capacityFallbacks: capacityFallbacks.length,
    capacityFallbackTraceIds: capacityFallbacks.map((trace) => trace.id),
    initialState: stateSummary(initial),
    finalState: stateSummary(final),
  },
  candidateStories: {
    largestDirectedRelationshipChanges: biggestChanges.slice(0, 8),
    repeatedEncounters: repeatedPairs.slice(0, 8).map(([pair, pairTraces]) => ({ pair: pair.split("|"), traceIds: pairTraces.map((trace) => trace.id), days: pairTraces.map((trace) => trace.simulationDay) })),
    laterInputsWithRecordedPriorEncounters: memoryExamples,
  },
  caveat: "The later-input count proves that prior encounters entered later model context. It does not identify a causal effect on probabilities or sampled outcomes.",
};
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, ...report.provenance, candidateStories: Object.values(report.candidateStories).reduce((sum, stories) => sum + stories.length, 0) }));
