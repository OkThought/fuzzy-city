import {
  ProviderError,
  type DecisionProvider,
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
    const start = performance.now();
    for (let attempt = 0; attempt < 3; attempt++) {
      signal?.throwIfAborted();
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
        if (response.ok)
          return {
            response: await response.json(),
            apiCalls: calls,
            serviceMs: performance.now() - start,
          };
        reason = `${this.id} HTTP ${response.status}`;
        if (
          !(response.status === 429 || response.status >= 500) ||
          attempt === 2
        )
          break;
        const retry = response.headers.get("retry-after");
        const retryMs = retry
          ? Number.isFinite(Number(retry))
            ? Number(retry) * 1000
            : Date.parse(retry) - Date.now()
          : 0;
        await this.sleep(
          Math.min(10000, Math.max(500 * 2 ** attempt, retryMs || 0)),
        );
      } catch {
        if (signal?.aborted)
          throw new ProviderError(
            "Decision cancelled; an in-flight GPU request may still finish.",
            calls,
          );
        reason = `${this.id} timeout or network failure`;
        // The local GPU may still be computing after a socket timeout. Never
        // amplify that load by submitting a duplicate expensive request.
        if (this.id === "jevk5" || attempt === 2) break;
        await this.sleep(500 * 2 ** attempt);
      }
    }
    throw new ProviderError(reason, calls);
  }
}
