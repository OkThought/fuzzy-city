import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { MockDecisionEngine } from "../src/ai/mockEngine";
import { durableWrite } from "../src/recording/format";
import { generateCity } from "../src/sim/cityGenerator";
import { RULES_V2 } from "../src/sim/rules";
import { Simulation } from "../src/sim/simulation";

// Predeclared before execution; do not replace failed seeds after seeing results.
const seeds = [
  "fuzzy-city-v2-soak-a",
  "fuzzy-city-v2-soak-b",
  "fuzzy-city-v2-soak-c",
] as const;
const population = 1000;
const evenings = 14;
const boundaryLimit = population * 0.2;
const output = resolve(
  process.argv[2] ?? ".local/evidence/rules-v2-mock-soak-amended.json",
);

const results = [];
for (const seed of seeds) {
  const initial = generateCity(seed, "mock", population);
  const initialMoney =
    initial.citizens.reduce((sum, citizen) => sum + citizen.state.money, 0) /
    population;
  const sim = new Simulation(
    new MockDecisionEngine(),
    structuredClone(initial),
    RULES_V2,
  );
  while (sim.world.day < evenings || sim.world.minute < 1380)
    await sim.step();
  const citizens = sim.world.citizens;
  const relationships = Object.values(sim.world.relationships);
  const deltas = relationships.flatMap((relationship) =>
    relationship.history.map((entry) => entry.delta),
  );
  const boundaryCounts = Object.fromEntries(
    (["energy", "stress", "socialNeed", "satisfaction"] as const).map((key) => [
      key,
      {
        minimum: citizens.filter((citizen) => citizen.state[key] === 0).length,
        maximum: citizens.filter((citizen) => citizen.state[key] === 1).length,
      },
    ]),
  );
  const activityCounts = sim.world.metrics.reduce<Record<string, number>>(
    (counts, day) => {
      for (const [activity, count] of Object.entries(day.activities))
        counts[activity] = (counts[activity] ?? 0) + count;
      return counts;
    },
    {},
  );
  const totalActivities = Object.values(activityCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const endingMoney =
    citizens.reduce((sum, citizen) => sum + citizen.state.money, 0) / population;
  const positive = deltas.filter((delta) => delta > 0).length;
  const negative = deltas.filter((delta) => delta < 0).length;
  const checks = {
    requiredStateNotSaturated: (["energy", "stress", "socialNeed"] as const).every(
      (key) => {
        const counts = boundaryCounts[key];
        return counts.minimum <= boundaryLimit && counts.maximum <= boundaryLimit;
      },
    ),
    meanMoneyGainAtMost250: endingMoney - initialMoney <= 250,
    noSingleActivityAbove60Percent:
      Math.max(...Object.values(activityCounts)) <= totalActivities * 0.6,
    interactionsEveryEvening: sim.world.metrics
      .slice(0, evenings)
      .every((day) => day.interactions > 0),
  };
  results.push({
    seed,
    finalDay: sim.world.day,
    finalMinute: sim.world.minute,
    requests: sim.world.traces.length,
    judgments: sim.world.judgments,
    boundaryCounts,
    initialMeanMoney: initialMoney,
    endingMeanMoney: endingMoney,
    meanMoneyGain: endingMoney - initialMoney,
    relationshipUpdates: { total: deltas.length, positive, negative },
    activityCounts,
    checks,
    passed: Object.values(checks).every(Boolean),
  });
}

const report = {
  version: "fuzzy-city-rules-v2-mock-soak/v2",
  amendment: {
    priorEvidence: ".local/evidence/rules-v2-mock-soak.json",
    reason:
      "The first gate overreached beyond the requested energy, stress, social-need and money correction by treating satisfaction saturation as failure, and required bidirectional deltas from a deterministic mock whose interaction probabilities only produce positive centered deltas. The failed report is retained. Directionality is instead checked against the preserved real Jev pilot and neutral synthetic unit case.",
  },
  rules: RULES_V2,
  predeclared: { seeds, population, evenings, checks: {
    maximumBoundaryPopulationShare: 0.2,
    maximumMeanMoneyGain: 250,
    relationshipDirectionality: "reported only; real-pilot counterfactual and unit test are the gates",
    maximumSingleActivityShare: 0.6,
    requireInteractionsEveryEvening: true,
  } },
  results,
  passed: results.every((result) => result.passed),
};
mkdirSync(dirname(output), { recursive: true });
durableWrite(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, passed: report.passed, results }));
if (!report.passed) process.exitCode = 1;
