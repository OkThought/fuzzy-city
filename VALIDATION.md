# Validation — 25 September 2026

## GPU optimization

- Installed PyTorch-2.9-compatible Windows Triton 3.5.1.post24; activated FLA attention and Triton causal convolution. Startup pins the originally installed model snapshot and supports `-Reference` rollback.
- Two paired fixed-input comparisons: **1.41× and 1.51× throughput**. Selected kernels differ by at most 0.021471 probability on the fixture, with no tested Noul threshold or Choice winner changes. This does not imply identical sampled city histories.
- Bounded graph capture at 1536/3072 tokens succeeded but was not promoted: slower than optimized eager, one unique judgment crossed 0.5.
- Unchanged 1,000-citizen opening workload: **120 decisions / 600 judgments, zero failures, 1.205 decisions/sec**, p50/p95 queue-inclusive latency 8.953/16.742 seconds, peak waiting queue 19, peak VRAM 10,110 MiB. Full-evening optimized performance is not claimed.
- GPU convolution comparison, real Choice HTTP smoke, Python compilation, strict TypeScript and all 28 application tests pass. Previous eight-browser-test validation below applies to the unchanged web UI.
- Raw observations, environment versions, caveats and reproduction commands: [GPU optimization](docs/gpu-optimization.md).

## Local JevK5 integration

- Strict TypeScript check and optimized production build pass.
- Vitest: **28 tests pass**, including provider configuration, TypeSafe-compatible payloads, local requests without authorization headers, invalid-response failures without fallback, bounded queues, cancellation, metric calculations and complete mock evenings at 100/250/500/1000 citizens.
- Playwright: **8 tests pass** in Chromium and WebKit, desktop and mobile. Covers city interaction/export and benchmark execution/download. Benchmark screenshots were visually inspected at both sizes. A repeated-run state race discovered in WebKit was fixed before the passing run.
- A real HTTP request through `/api/jev/batch` returned status 200, source `jevk5`, model `alibiserikbay/JevK5` and five validated intention judgments, with 1,876 ms measured latency.
- Real GPU opening-window sweep: all four populations, 222 evaluations / 1,110 judgments, zero failures. Full 100-citizen evening: 151 evaluations / 638 judgments, 29 encounters, zero failures, 0.784 decisions/sec. Raw observations and definitions are linked in [the benchmark report](docs/benchmark.md).
- Full real-GPU evenings at 250/500/1000 citizens have not been run. Their complete simulation flows are mock-tested. The retained failed first full-evening attempt is explicitly documented and excluded from successful claims.
- Client static bundles contain no `TYPESAFE_API_KEY`, `DECISION_API_KEY` or `httpDecisionProvider` references. Local inference requires no paid key.
- GPU peak in the completed full evening was 11,904 / 12,282 MiB, measured for the entire device. Concurrency one remains the default for the serialized backend.

## Historical application validation — 23 September 2026

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

This is a historical short local rendering smoke measurement, not a GPU-inference or cross-device benchmark. Raw output is generated at `test-results/production-smoke.json`. To repeat, explicitly set `DECISION_PROVIDER=mock`, run `pnpm build`, `pnpm start --port 3002`, then `node scripts/production-smoke.mjs` in another terminal.

## Not verified

- A paid TypeSafe request: no API key was used. The local JevK5 path is verified above. The current local/hosted providers fail explicitly and do not substitute mock decisions.
- Docker image execution or a public hosting deployment. The Node.js standalone output has been exercised locally.
- Long-duration browser sessions: full causal history intentionally grows. Export runs regularly for durable analysis.
