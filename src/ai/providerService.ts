import { providerConfig } from "./providerConfig";
import { createDecisionProvider } from "./providerFactory";
import { ProviderDecisionEngine } from "./providerEngine";
import { ConcurrencyPool } from "./concurrencyPool";
// Shared across route bundles and development reloads within this Node process.
const globalState = globalThis as typeof globalThis & {
  fuzzyProviderService?: ReturnType<typeof makeService>;
};
function makeService() {
  const config = providerConfig();
  const provider = createDecisionProvider(config);
  const pool = new ConcurrencyPool(config.concurrency);
  return {
    provider,
    pool,
    engine: new ProviderDecisionEngine(provider, pool),
    benchmarkActive: false,
  };
}
export function providerService() {
  return (globalState.fuzzyProviderService ??= makeService());
}
