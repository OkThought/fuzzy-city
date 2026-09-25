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
    env.DECISION_PROVIDER ??
    (env.JEV_MODE === "mock"
      ? "mock"
      : env.JEV_MODE === "live"
        ? "typesafe"
        : "jevk5");
  if (!["jevk5", "typesafe", "mock"].includes(id))
    throw new Error("DECISION_PROVIDER must be jevk5, typesafe or mock");
  const baseUrl =
    env.DECISION_API_BASE_URL ||
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
      (id === "typesafe" ? env.JEV_MAX_CONCURRENCY || 8 : 1),
  );
  const timeoutMs = Number(env.DECISION_TIMEOUT_MS || 60000);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new Error("DECISION_CONCURRENCY must be 1–8");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180000)
    throw new Error("DECISION_TIMEOUT_MS must be 1000–180000");
  return {
    id: id as ProviderId,
    baseUrl: baseUrl.replace(/\/$/, ""),
    model:
      env.DECISION_MODEL ||
      (id === "typesafe"
        ? env.TYPESAFE_MODEL || "jev-latest"
        : id === "mock"
          ? "deterministic-mock-v1"
          : "alibiserikbay/JevK5"),
    key:
      id === "typesafe"
        ? env.DECISION_API_KEY || env.TYPESAFE_API_KEY || ""
        : "",
    concurrency,
    timeoutMs,
  };
}
