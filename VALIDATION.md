# Validation — 23 September 2026

## Automated checks

- Strict TypeScript check passes.
- Vitest: 17 simulation/API tests, including eleven evenings, exact mock replay, restored RNG replay, directed relationship evolution, one significant interaction per citizen per evening, judgment accounting and bounded memory/state.
- Playwright: full interaction/export flows pass in Chromium and WebKit at 1440×900 and 390×844. Desktop and mobile screenshots were visually inspected, including the citizen probability inspector.
- Optimized Next.js production build passes. Standalone server starts through `pnpm start`; the launch script supplies its static assets.
- Production Chromium smoke: 1,000 Canvas citizens, no page errors, IndexedDB save/reload/restore succeeds.
- Client static bundles scanned for API-key references, bearer authorization and server adapter references: none found.

## Performance observation

Local headless Chromium 153.0.8010.12, 1440×900, simulation at 4×, 240 animation frames:

| Measurement | Result |
|---|---:|
| Mean frame interval | 16.67 ms |
| 95th percentile | 16.80 ms |
| Approximate observed frame rate | 60 fps |

This is a short local smoke measurement, not a cross-device benchmark. Raw output is generated at `test-results/production-smoke.json`. To repeat, run `pnpm build`, `pnpm start --port 3002`, then `node scripts/production-smoke.mjs` in another terminal.

## Not verified

- A paid live Jev request: no API key was available. Request/response shape, token accounting, full Choice distributions, timeouts, bounded retries, concurrency and fallback labeling are exercised with mocked network responses against the official API contract.
- Docker image execution or a public hosting deployment. The Node.js standalone output has been exercised locally.
- Long-duration browser sessions: full causal history intentionally grows. Export runs regularly for durable analysis.
