import { providerConfig, type ProviderConfig } from "./providerConfig";
import { HttpDecisionProvider } from "./httpDecisionProvider";
import { MockDecisionProvider } from "./mockDecisionProvider";
export function createDecisionProvider(
  config: ProviderConfig = providerConfig(),
) {
  return config.id === "mock"
    ? new MockDecisionProvider()
    : new HttpDecisionProvider(config);
}
