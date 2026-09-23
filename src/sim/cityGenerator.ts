import { Rng } from "./rng";
import {
  ACTIVITIES,
  DEFAULT_PRINCIPLE,
  type Citizen,
  type DayMetrics,
  type Location,
  type World,
} from "./types";
export const MAP = { width: 1440, height: 1080, block: 120, inset: 60 };
export const NEIGHBORHOODS = [
  "NORTH COMMON",
  "THE FOUNDry".toUpperCase(),
  "WILLOW QUARTER",
  "EAST GARDENS",
  "OLD TOWN",
  "SOUTH BANK",
  "THE LANES",
  "RIVERSIDE",
];
export function dayMetrics(day: number): DayMetrics {
  return {
    day,
    judgments: 0,
    apiCalls: 0,
    interactions: 0,
    friendships: 0,
    negativeRelationships: 0,
    uncertaintySum: 0,
    noulCount: 0,
    meanUncertainty: 0,
    activities: Object.fromEntries(
      ACTIVITIES.map((a) => [a, 0]),
    ) as DayMetrics["activities"],
    alone: 0,
    locations: {},
  };
}
export function generateCity(
  seed = "fuzzy-city-001",
  mode: "mock" | "live" = "mock",
): World {
  const rng = new Rng(seed);
  const locations: Location[] = [];
  const specials: Record<string, [Location["kind"], string]> = {
    "4,3": ["plaza", "Common Ground"],
    "2,2": ["park", "Willow Park"],
    "8,1": ["park", "East Gardens"],
    "7,6": ["park", "Meadow Park"],
    "7,3": ["gallery", "The Assembly"],
    "1,5": ["landmark", "Public Library"],
    "9,5": ["landmark", "The Conservatory"],
    "5,0": ["landmark", "North Station"],
  };
  const cafes = new Set([
    "1,1",
    "6,1",
    "9,2",
    "3,4",
    "6,5",
    "0,6",
    "8,7",
    "4,7",
  ]);
  let homes = 0,
    works = 0,
    cafeCount = 0;
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 11; col++) {
      const neighborhood = Math.min(
        7,
        Math.floor(row / 2) * 2 + (col > 5 ? 1 : 0),
      );
      const base = { x: 60 + col * 120, y: 60 + row * 120, neighborhood };
      const special = specials[`${col},${row}`];
      if (special) {
        locations.push({
          ...base,
          id: `${special[0]}_${col}_${row}`,
          kind: special[0],
          name: special[1],
          width: 98,
          height: 98,
          capacity: 180,
        });
        continue;
      }
      for (let s = 0; s < 4; s++) {
        const isCafe = s === 0 && cafes.has(`${col},${row}`);
        const isWork =
          !isCafe && works < 40 && (col * 3 + row * 7 + s) % 7 === 0;
        const kind = isCafe ? "cafe" : isWork ? "work" : "home";
        const number = isCafe ? ++cafeCount : isWork ? ++works : ++homes;
        locations.push({
          x: base.x + (s % 2) * 50,
          y: base.y + Math.floor(s / 2) * 50,
          width: 34 + Math.floor(rng.next() * 8),
          height: 32 + Math.floor(rng.next() * 11),
          neighborhood,
          id: `${kind}_${number}`,
          kind,
          name: isCafe
            ? [
                "Daylight Café",
                "Soft Corner",
                "Little Hours",
                "Café Fern",
                "The Daily",
                "Almost Home",
                "Sunday Club",
                "Late Bloom",
              ][number - 1]
            : isWork
              ? `Studio ${number}`
              : `${number} ${["Alder", "Elm", "Willow", "Juniper", "Ash", "Cedar", "Oak", "Birch"][neighborhood]} Street`,
          capacity: isCafe ? 65 : isWork ? 80 : 12,
        });
      }
    }
  const homeLocations = locations.filter((l) => l.kind === "home");
  const workLocations = locations.filter((l) => l.kind === "work");
  const firstNames = [
    "Maya",
    "Leo",
    "Nina",
    "Theo",
    "Sara",
    "Erik",
    "Amara",
    "Noah",
    "Iris",
    "Luca",
    "Lena",
    "Marco",
    "Ada",
    "Eli",
    "Rosa",
    "Hugo",
    "Yuki",
    "Omar",
    "Ines",
    "Jules",
    "Zara",
    "Alex",
    "Sofia",
    "Felix",
    "Nora",
    "Kai",
    "Alma",
    "Remy",
    "Asha",
    "Sam",
  ];
  const lastNames = [
    "Lee",
    "Moreau",
    "Silva",
    "Park",
    "Rossi",
    "Chen",
    "Berg",
    "Ali",
    "Martin",
    "Reyes",
    "Sato",
    "Novak",
    "Costa",
    "Reed",
    "Singh",
    "Meyer",
    "Lind",
    "Khan",
    "Dubois",
    "Flores",
  ];
  const citizens: Citizen[] = Array.from({ length: 1000 }, (_, i) => {
    const home = rng.pick(homeLocations),
      work = rng.pick(workLocations);
    return {
      id: `citizen_${i}`,
      firstName: rng.pick(firstNames),
      lastName: rng.pick(lastNames),
      age: 22 + Math.floor(rng.next() * 46),
      homeId: home.id,
      workplaceId: work.id,
      occupation: rng.pick([
        "architect",
        "teacher",
        "designer",
        "engineer",
        "librarian",
        "baker",
        "researcher",
        "editor",
        "botanist",
        "ceramicist",
      ]),
      position: {
        x: work.x + 4 + rng.next() * (work.width - 8),
        y: work.y + 4 + rng.next() * (work.height - 8),
      },
      currentLocationId: work.id,
      destinationId: work.id,
      route: [],
      activity: "work",
      traits: {
        sociability: rng.normal(),
        conscientiousness: rng.normal(),
        openness: rng.normal(),
        ambition: rng.normal(),
        riskTolerance: rng.normal(),
      },
      state: {
        energy: 0.2 + rng.normal() * 0.6,
        stress: rng.normal(),
        socialNeed: rng.normal(),
        money: 30 + Math.round(rng.next() * 170),
        satisfaction: rng.normal(),
      },
      knownPeople: [],
      recentMemories: [],
      lastContactDay: 0,
      interactedDay: 0,
      uncertainty: 0,
      judgmentUncertainties: {},
    };
  });
  const relationships: World["relationships"] = {};
  for (const citizen of citizens) {
    const count = 3 + Math.floor(rng.next() * 6);
    while (citizen.knownPeople.length < count) {
      const other = rng.pick(citizens);
      if (other.id === citizen.id || citizen.knownPeople.includes(other.id))
        continue;
      citizen.knownPeople.push(other.id);
      relationships[`${citizen.id}>${other.id}`] = {
        fromCitizenId: citizen.id,
        toCitizenId: other.id,
        affinity: rng.normal() * 0.9 - 0.16,
        familiarity: 0.08 + rng.next() * 0.4,
        interactionCount: 0,
        lastInteractionDay: null,
        history: [],
      };
    }
  }
  return {
    seed,
    day: 1,
    minute: 990,
    locations,
    citizens,
    relationships,
    traces: [],
    events: [
      {
        id: "event_0",
        day: 1,
        minute: 990,
        type: "day",
        text: "A thousand lives. The first evening is about to begin.",
        citizenIds: [],
        traceIds: [],
      },
    ],
    principle: DEFAULT_PRINCIPLE,
    principleHistory: [{ day: 1, minute: 990, principle: DEFAULT_PRINCIPLE }],
    metrics: [dayMetrics(1)],
    judgments: 0,
    apiCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    friendsResolvedDay: 0,
    rngState: rng.state,
    mode,
  };
}
