import type { DecisionProvider, SystemOneRequest } from "./decisionProvider";
import { mockEvaluation } from "./mockProbabilities";
import type { Kind } from "../sim/types";
export class MockDecisionProvider implements DecisionProvider {
  readonly id = "mock" as const;
  readonly model = "deterministic-mock-v1";
  async infer(request: SystemOneRequest) {
    const started = performance.now();
    const kind: Kind = request.questions.friend
      ? "friend_selection"
      : request.questions.wants_rest
        ? "evening_intentions"
        : "social_interaction";
    const state = request.state;
    const result = mockEvaluation({
      id: `${state.world.day}:${kind}:${state.citizen.id}${kind === "social_interaction" ? `:${state.other!.id}` : ""}`,
      kind,
      state,
    });
    const answers =
      kind === "friend_selection"
        ? {
            friend: {
              type: "choice",
              choice: Object.entries(result.answers).sort(
                (a, b) => b[1] - a[1],
              )[0][0],
              confidence: Math.max(...Object.values(result.answers)),
              probabilities: result.answers,
            },
          }
        : Object.fromEntries(
            Object.entries(result.answers).map(([key, noul]) => [
              key,
              { type: "noul", noul },
            ]),
          );
    return {
      response: {
        model: this.model,
        answers,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      apiCalls: 0,
      serviceMs: performance.now() - started,
    };
  }
}
