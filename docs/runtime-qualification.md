# Rules-v2 runtime qualification

Qualified 28 September 2026 under [GitHub issue #2](https://github.com/OkThought/fuzzy-city/issues/2). This work used the immutable rules-v2 pilot journal, nine already-frozen JevK5 request fixtures, and provider-free replay. It did not rerun, extend, or tune the pilot.

## Verdict

**Blocked pending review.** VRAM telemetry is repaired and the latency gap is characterized, but the predeclared replay-startup p95 gate failed. Do not start the fourteen-evening recording, weaken the gate, or replace these measurements with a passing rerun.

## VRAM telemetry

When `nvidia-smi` cannot spawn, recorder and benchmark sampling now fall back to dynamic telemetry from the localhost JevK5 health endpoint. The endpoint obtains whole-device used/total memory from `torch.cuda.mem_get_info()` and separately reports PyTorch allocator values for the JevK5 process. The scopes are not conflated.

The fresh frozen-input report `.local/evidence/rules-v2-vram-qualification.json` used nine preserved real request fixtures and made no simulation run:

- 9 requests / 30 judgments, zero failures or ambiguous attempts;
- 95 live health-fallback samples after a forced primary `spawn EPERM`;
- whole-device peak: 11,464 / 12,281 MiB;
- JevK5 allocator peak: 9,004 MiB allocated / 9,578 MiB reserved;
- request latency p50/p95/max: 916 / 2,710 / 2,710 ms.

This validates the repaired measurement route on the frozen fixture. It does not retroactively create a peak measurement for the completed pilot and is not a fourteen-evening memory forecast.

## Existing-journal latency analysis

The read-only report `.local/evidence/rules-v2-runtime-qualification.json` validated all 4,682 journal entries and preserved journal SHA-256 `f8456dd2a582e25ca9f5e6e1ad098e3b6834f3fb3c3e214d2333b627b2b4badf`. It made zero inference calls.

| Scope | Context p50 / p95 / max | Service p50 / p95 / max |
|---|---:|---:|
| Evening 1 | 2,930 / 4,480 / 4,832 B | 862 / 1,499 / 3,047 ms |
| Evening 2 | 3,110 / 4,834 / 5,386 B | 943 / 3,169 / 148,701 ms |
| Evening 3 | 3,231 / 5,059 / 6,099 B | 1,066 / 3,846 / 61,048 ms |

The slowest day-two intention requests were 148.7, 120.3, 86.9, 59.7, and 36.7 seconds at contexts between 2,197 and 3,028 bytes. Day three included a 61.0-second social interaction at 4,951 bytes. These isolated stalls materially affected evening wall time and are not explained by context size alone.

Across context quartiles, service p50/p95 rose from 668/965 ms in Q1 (at most 2,619 bytes) to 1,540/6,863 ms in Q4 (above 3,754 bytes). Within ordinary request kinds, larger contexts were generally associated with slower service. This is descriptive association: day, request kind, GPU state, and model/runtime behavior are co-varying, so it is not a causal estimate or a fourteen-evening forecast.

## Replay startup

The predeclared test used ten fresh Chromium contexts with isolated caches against one newly started local production server. Every sample is retained in `.local/evidence/replay-startup-qualification.json`:

```text
3250, 468, 436, 457, 433, 467, 548, 484, 463, 456 ms
```

The result was p50 463 ms, p95/max 3,250 ms. It **failed** the p95-under-3,000-ms gate because the first sample exceeded it. No replacement run was made. The result suggests a cold-server/first-use effect, but this qualification does not diagnose its cause.

## Verification

- `pnpm typecheck`
- `pnpm test` — 42 tests passed
- `pnpm build`
- `pnpm runtime:analyze recordings/pilot-1000-3e-rules-v2-2026-09-26 .local/evidence/rules-v2-runtime-qualification.json`
- `pnpm runtime:vram .local/evidence/rules-v2-vram-qualification.json`
- `npx playwright test tests/browser/replay-startup.spec.ts --project=chromium-desktop` — expected qualification failure, p95 3,250 ms

The proposed main-run protocol is recorded separately in [main-recording-protocol.md](main-recording-protocol.md). It remains a draft and cannot be executed without an explicit decision that addresses this failed startup gate.
