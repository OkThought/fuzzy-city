import type { Question } from "./jevApiTypes";
import type { DecisionState } from "../sim/types";

export type ProviderId = "jevk5" | "vercel" | "typesafe" | "mock";
/** The provider boundary is the TypeSafe /v1/systemone wire contract. */
export interface SystemOneRequest {
  model: string;
  state: DecisionState;
  questions: Record<string, Question>;
}
export interface ProviderResult {
  response: unknown;
  apiCalls: number;
  serviceMs: number;
}
export interface DecisionProvider {
  readonly id: ProviderId;
  readonly model: string;
  infer(
    request: SystemOneRequest,
    signal?: AbortSignal,
  ): Promise<ProviderResult>;
}
export class ProviderError extends Error {
  constructor(
    message: string,
    public apiCalls = 0,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
// Structural check survives a development reload while an old provider instance
// is finishing a request in the process-wide service.
export function errorApiCalls(error: unknown, fallback = 0): number {
  if (
    error &&
    typeof error === "object" &&
    "apiCalls" in error &&
    typeof error.apiCalls === "number" &&
    Number.isInteger(error.apiCalls) &&
    error.apiCalls >= 0
  )
    return error.apiCalls;
  return fallback;
}
