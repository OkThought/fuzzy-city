export type Vec2 = { x: number; y: number };
export type Activity =
  | "home_rest"
  | "overtime"
  | "visit_friend"
  | "cafe"
  | "park"
  | "explore";
export type Source = "jev" | "mock" | "fallback";
export type Kind =
  | "evening_intentions"
  | "friend_selection"
  | "social_interaction";
export type Probabilities = Record<string, number>;
export interface Location extends Vec2 {
  id: string;
  name: string;
  kind: "home" | "work" | "cafe" | "park" | "plaza" | "gallery" | "landmark";
  width: number;
  height: number;
  capacity: number;
  neighborhood: number;
}
export interface MemoryEvent {
  type: "social_interaction";
  otherCitizenId: string;
  locationId: string;
  day: number;
  connectionProbability: number;
  tensionProbability: number;
  affinityDelta: number;
  traceId: string;
}
export interface EveningPlan {
  day: number;
  activity: Activity;
  resolvedActivity?: Activity;
  destinationId: string;
  intentionTraceId: string;
  friendTraceId?: string;
  friendId?: string;
  resolution?: string;
}
export interface Citizen {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  homeId: string;
  workplaceId: string;
  occupation: string;
  position: Vec2;
  currentLocationId: string;
  destinationId: string;
  route: Vec2[];
  activity: Activity | "work" | "sleep" | "commute";
  traits: {
    sociability: number;
    conscientiousness: number;
    openness: number;
    ambition: number;
    riskTolerance: number;
  };
  state: {
    energy: number;
    stress: number;
    socialNeed: number;
    money: number;
    satisfaction: number;
  };
  knownPeople: string[];
  recentMemories: MemoryEvent[];
  currentPlan?: EveningPlan;
  lastContactDay: number;
  interactedDay: number;
  uncertainty: number;
  judgmentUncertainties: Probabilities;
}
export interface Relationship {
  fromCitizenId: string;
  toCitizenId: string;
  affinity: number;
  familiarity: number;
  interactionCount: number;
  lastInteractionDay: number | null;
  history: { day: number; delta: number; traceId: string }[];
}
export interface DecisionState {
  world: {
    day: number;
    time: string;
    city_principle: string;
    cultural_norm: string;
  };
  citizen: CitizenContext;
  other?: CitizenContext;
  candidates?: Record<string, Relationship>;
  locationId?: string;
}
export interface CitizenContext {
  id: string;
  age: number;
  occupation: string;
  traits: Citizen["traits"];
  current_state: Citizen["state"] & {
    days_since_meaningful_social_contact: number;
  };
  known_people: Relationship[];
  recent_memories: MemoryEvent[];
}
export interface Job {
  id: string;
  kind: Kind;
  state: DecisionState;
}
export interface Evaluation {
  source: Source;
  model: string;
  answers: Probabilities;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  apiCalls: number;
  error?: string;
}
export interface DecisionTrace extends Evaluation {
  id: string;
  simulationDay: number;
  simulationMinute: number;
  citizenIds: string[];
  kind: Kind;
  stateSnapshot: DecisionState;
  derivedValues?: {
    weights?: Probabilities;
    probabilities?: Probabilities;
    rngSample?: number;
    uncertainties?: Probabilities;
  };
  outcome: Record<string, string | number>;
  createdAt: number;
}
export interface CityEvent {
  id: string;
  day: number;
  minute: number;
  type:
    | "arrival"
    | "decision"
    | "interaction"
    | "friendship"
    | "CharterChangedEvent"
    | "day"
    | "resolution";
  text: string;
  citizenIds: string[];
  traceIds: string[];
}
export interface DayMetrics {
  day: number;
  judgments: number;
  apiCalls: number;
  interactions: number;
  friendships: number;
  negativeRelationships: number;
  uncertaintySum: number;
  noulCount: number;
  meanUncertainty: number;
  activities: Record<Activity, number>;
  alone: number;
  locations: Record<string, number>;
}
export interface World {
  seed: string;
  day: number;
  minute: number;
  locations: Location[];
  citizens: Citizen[];
  relationships: Record<string, Relationship>;
  traces: DecisionTrace[];
  events: CityEvent[];
  principle: string;
  principleHistory: { day: number; minute: number; principle: string }[];
  metrics: DayMetrics[];
  judgments: number;
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  friendsResolvedDay: number;
  rngState: number;
  mode: "mock" | "live";
}
export const ACTIVITIES: Activity[] = [
  "home_rest",
  "overtime",
  "visit_friend",
  "cafe",
  "park",
  "explore",
];
export const LABELS: Record<Activity | "work" | "sleep" | "commute", string> = {
  home_rest: "Rest at home",
  overtime: "Keep working",
  visit_friend: "Visit a friend",
  cafe: "Go to a café",
  park: "Walk in the park",
  explore: "Explore the city",
  work: "At work",
  sleep: "Sleeping",
  commute: "On the move",
};
export const COLORS: Record<string, string> = {
  home_rest: "#91a9b3",
  overtime: "#bcaaa0",
  visit_friend: "#d8a4b5",
  cafe: "#e7b879",
  park: "#98b996",
  explore: "#b1a4cd",
  work: "#a1acb0",
  sleep: "#718089",
  commute: "#d4c3a5",
};
export const DEFAULT_PRINCIPLE =
  "A good life should leave room for recovery, meaningful relationships and curiosity.";
export const MEMORY_LIMIT = 12;
