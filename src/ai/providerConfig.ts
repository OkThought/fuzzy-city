import type { ProviderId } from "./decisionProvider";
export interface ProviderConfig {
  id: ProviderId;
  baseUrl: string;
  model: string;
  key: string;
  concurrency: number;
  timeoutMs: number;
}
export function providerConfig(
  env: Record<string, string | undefined> = process.env,
): ProviderConfig {
  const id =
    env.JEV_PROVIDER ??
    env.DECISION_PROVIDER ??
    (env.JEV_MODE === "mock"
      ? "mock"
      : env.JEV_MODE === "live"
        ? "typesafe"
        : "jevk5");
  if (!["jevk5", "vercel", "typesafe", "mock"].includes(id))
    throw new Error("JEV_PROVIDER must be vercel, typesafe, jevk5 or mock");
  const baseUrl =
    id === "vercel"
      ? "https://ai-gateway.vercel.sh/typesafe"
      : env.DECISION_API_BASE_URL ||
        (id === "typesafe" ? "https://api.typesafe.ai" : "http://127.0.0.1:8090");
  const parsed = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error("Invalid decision base URL");
  const concurrency = Number(
    env.DECISION_CONCURRENCY ||
      (id === "vercel" || id === "typesafe" ? env.JEV_MAX_CONCURRENCY || 8 : 1),
  );
  const timeoutMs = Number(env.DECISION_TIMEOUT_MS || 60000);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new Error("DECISION_CONCURRENCY must be 1–8");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000)
    throw new Error("DECISION_TIMEOUT_MS must be 1000–600000");
  return {
    id: id as ProviderId,
    baseUrl: baseUrl.replace(/\/$/, ""),
    model:
      id === "vercel"
        ? "typesafe-ai/jev"
        : env.DECISION_MODEL ||
          (id === "typesafe"
            ? env.TYPESAFE_MODEL || "jev-latest"
            : id === "mock"
              ? "deterministic-mock-v1"
              : "alibiserikbay/JevK5"),
    key:
      id === "vercel"
        ? env.AI_GATEWAY_API_KEY || ""
        : id === "typesafe"
          ? env.TYPESAFE_API_KEY || env.DECISION_API_KEY || ""
          : "",
    concurrency,
    timeoutMs,
  };
}
