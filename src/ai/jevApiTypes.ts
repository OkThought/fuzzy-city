import type { Job, Probabilities } from "../sim/types";
export type Question =
  | {
      type: "noul";
      instructions: string;
      criteria?: { true: string; false: string };
    }
  | { type: "choice"; instructions: string; criteria: Record<string, unknown> };
export const INTENTION_QUESTIONS = {
  wants_rest:
    "Given this person’s complete current context, would spending this evening resting at home feel especially attractive to them tonight?",
  seeks_company:
    "Given this person’s complete current context, would they actively prefer meaningful company over spending the evening alone?",
  seeks_novelty:
    "Given this person’s complete current context, would they be drawn to breaking routine and doing something unfamiliar tonight?",
  willing_to_spend:
    "Given this person’s financial and emotional context, would they feel comfortable spending discretionary money on leisure tonight?",
  wants_extra_work:
    "Given this person’s complete current context, would they voluntarily continue working tonight rather than stop for the day?",
};
export function questionsFor(job: Job): Record<string, Question> {
  if (job.kind === "friend_selection")
    return {
      friend: {
        type: "choice",
        instructions:
          "Given this citizen’s present mood, history and relationships, whom would they most naturally want to spend this evening with?",
        criteria: {
          ...Object.fromEntries(
            Object.keys(job.state.candidates ?? {}).map((id) => [
              id,
              { citizen_id: id, relationship: job.state.candidates![id] },
            ]),
          ),
          none: "No listed contact feels right tonight.",
        },
      },
    };
  const questions =
    job.kind === "evening_intentions"
      ? INTENTION_QUESTIONS
      : {
          a_felt_connection:
            "Is person A (citizen) likely to leave this interaction feeling more positively connected to person B (other)?",
          b_felt_connection:
            "Is person B (other) likely to leave this interaction feeling more positively connected to person A (citizen)?",
          felt_tension:
            "Is there a meaningful chance this interaction felt tense, awkward, irritating or unpleasant?",
          memorable:
            "Is this interaction likely to remain meaningfully memorable to either participant rather than feeling routine?",
        };
  return Object.fromEntries(
    Object.entries(questions).map(([key, instructions]) => [
      key,
      { type: "noul", instructions },
    ]),
  );
}
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const probability = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
export function validateResponse(
  data: unknown,
  job: Job,
): {
  answers: Probabilities;
  model: string;
  inputTokens: number;
  outputTokens: number;
} {
  if (
    !record(data) ||
    typeof data.model !== "string" ||
    !record(data.answers) ||
    !record(data.usage)
  )
    throw new Error("Invalid Jev response envelope");
  const usage = data.usage;
  if (
    ![usage.input_tokens, usage.output_tokens].every(
      (v) => typeof v === "number" && Number.isInteger(v) && v >= 0,
    )
  )
    throw new Error("Invalid Jev token usage");
  const answers: Probabilities = {};
  const questions = questionsFor(job);
  for (const [key, question] of Object.entries(questions)) {
    const answer = data.answers[key];
    if (!record(answer) || answer.type !== question.type)
      throw new Error("Missing or mismatched Jev answer");
    if (question.type === "noul") {
      if (!probability(answer.noul))
        throw new Error("Invalid Noul probability");
      answers[key] = answer.noul;
    } else {
      if (
        !record(answer.probabilities) ||
        typeof answer.choice !== "string" ||
        !probability(answer.confidence)
      )
        throw new Error("Invalid Choice answer");
      const options = Object.keys(question.criteria);
      if (
        !options.includes(answer.choice) ||
        Object.keys(answer.probabilities).length !== options.length
      )
        throw new Error("Choice options mismatch");
      for (const option of options) {
        const value = answer.probabilities[option];
        if (!probability(value)) throw new Error("Missing Choice probability");
        answers[option] = value;
      }
      if (
        Math.abs(Object.values(answers).reduce((s, v) => s + v, 0) - 1) > 0.001
      )
        throw new Error("Choice distribution does not sum to one");
    }
  }
  return {
    answers,
    model: data.model,
    inputTokens: usage.input_tokens as number,
    outputTokens: usage.output_tokens as number,
  };
}
export function validJob(value: unknown): value is Job {
  if (
    !record(value) ||
    typeof value.id !== "string" ||
    !["evening_intentions", "friend_selection", "social_interaction"].includes(
      String(value.kind),
    ) ||
    !record(value.state)
  )
    return false;
  const s = value.state;
  if (
    !record(s.world) ||
    typeof s.world.city_principle !== "string" ||
    s.world.city_principle.length > 400 ||
    !record(s.citizen)
  )
    return false;
  const validCitizen = (c: unknown) =>
    record(c) &&
    typeof c.id === "string" &&
    record(c.traits) &&
    [
      "sociability",
      "conscientiousness",
      "openness",
      "ambition",
      "riskTolerance",
    ].every((k) =>
      probability(c.traits && (c.traits as Record<string, unknown>)[k]),
    ) &&
    record(c.current_state) &&
    ["energy", "stress", "socialNeed", "satisfaction"].every((k) =>
      probability((c.current_state as Record<string, unknown>)[k]),
    ) &&
    typeof c.current_state.money === "number" &&
    Number.isFinite(c.current_state.money) &&
    Array.isArray(c.known_people) &&
    c.known_people.every(
      (r) =>
        record(r) &&
        typeof r.toCitizenId === "string" &&
        typeof r.affinity === "number" &&
        Number.isFinite(r.affinity),
    ) &&
    Array.isArray(c.recent_memories);
  if (
    !validCitizen(s.citizen) ||
    (value.kind === "social_interaction" && !validCitizen(s.other))
  )
    return false;
  if (
    value.kind === "friend_selection" &&
    (!record(s.candidates) ||
      Object.keys(s.candidates).length > 5 ||
      !Object.entries(s.candidates).every(
        ([id, r]) =>
          /^citizen_\d+$/.test(id) &&
          record(r) &&
          typeof r.affinity === "number" &&
          Number.isFinite(r.affinity) &&
          probability(r.familiarity),
      ))
  )
    return false;
  return true;
}
