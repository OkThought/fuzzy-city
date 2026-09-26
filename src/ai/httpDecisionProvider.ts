import {
  ProviderError,
  type DecisionProvider,
  type ProviderAttempt,
  type ProviderResult,
  type SystemOneRequest,
} from "./decisionProvider";
import type { ProviderConfig } from "./providerConfig";
export class HttpDecisionProvider implements DecisionProvider {
  readonly id;
  readonly model;
  constructor(
    private config: ProviderConfig,
    private fetcher: typeof fetch = fetch,
    private sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {
    this.id = config.id;
    this.model = config.model;
  }
  async infer(
    request: SystemOneRequest,
    signal?: AbortSignal,
  ): Promise<ProviderResult> {
    if (this.id === "vercel" && !this.config.key)
      throw new ProviderError("Vercel AI Gateway requires AI_GATEWAY_API_KEY.");
    if (this.id === "typesafe" && !this.config.key)
      throw new ProviderError(
        "TypeSafe requires a server key. Choose jevk5 for local inference.",
      );
    let calls = 0;
    let reason = "Decision backend unavailable";
    const attempts: ProviderAttempt[] = [];
    const start = performance.now();
    for (let attempt = 0; attempt < 3; attempt++) {
      signal?.throwIfAborted();
      const attemptStart = performance.now();
      const startedAt = new Date().toISOString();
      try {
        calls++;
        const response = await this.fetcher(
          `${this.config.baseUrl}/v1/systemone`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(this.config.key
                ? { Authorization: `Bearer ${this.config.key}` }
                : {}),
            },
            body: JSON.stringify(request),
            signal: signal
              ? AbortSignal.any([
                  signal,
                  AbortSignal.timeout(this.config.timeoutMs),
                ])
              : AbortSignal.timeout(this.config.timeoutMs),
          },
        );
        const routedProvider =
          response.headers.get("x-vercel-ai-gateway-provider") ??
          response.headers.get("x-ai-gateway-provider") ??
          response.headers.get("x-vercel-ai-provider") ??
          undefined;
        if (response.ok) {
          const responseBody = await response.json();
          attempts.push({
            attempt: attempt + 1,
            startedAt,
            elapsedMs: performance.now() - attemptStart,
            outcome: "success",
            status: response.status,
            routedProvider,
          });
          return {
            response: responseBody,
            apiCalls: calls,
            serviceMs: performance.now() - start,
            attempts,
          };
        }
        reason = `${this.id} HTTP ${response.status}`;
        const retryable = response.status === 429 || response.status === 503;
        const retry = response.headers.get("retry-after");
        const retryMs = retry
          ? Number.isFinite(Number(retry))
            ? Number(retry) * 1000
            : Date.parse(retry) - Date.now()
          : 0;
        const baseBackoff = Math.min(
          10000,
          Math.max(500 * 2 ** attempt, retryMs || 0),
        );
        const backoffMs =
          retryable && attempt < 2
            ? Math.round(baseBackoff * (0.8 + Math.random() * 0.4))
            : undefined;
        attempts.push({
          attempt: attempt + 1,
          startedAt,
          elapsedMs: performance.now() - attemptStart,
          outcome: "http_error",
          status: response.status,
          retryAfterMs: retryMs > 0 ? retryMs : undefined,
          backoffMs,
          routedProvider,
        });
        if (!retryable || attempt === 2)
          break;
        await this.sleep(backoffMs!);
      } catch {
        if (signal?.aborted)
          throw new ProviderError(
            "Decision cancelled; an in-flight GPU request may still finish.",
            calls,
            attempts,
            true,
          );
        reason = `${this.id} timeout or network failure`;
        attempts.push({
          attempt: attempt + 1,
          startedAt,
          elapsedMs: performance.now() - attemptStart,
          outcome: "ambiguous_network_error",
        });
        // A timeout or lost connection may have reached any remote provider.
        // Never resubmit an ambiguous logical request without idempotency.
        throw new ProviderError(reason, calls, attempts, true);
      }
    }
    throw new ProviderError(reason, calls, attempts, false);
  }
}
