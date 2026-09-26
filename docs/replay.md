# Lossless replay viewer

The replay-only route at `/replay` does not call an inference provider, expose credentials, or change the live development simulation at `/`. Replay v2 replaces repeated full-world public frames with exact keyframes and forward patches while retaining every 15-minute observation.

## Included recording

The checked-in demonstration bundle is derived from `recordings/milestone-one-jevk5`, the preserved local JevK5 attempt from 25 September 2026. It is real inference evidence, but it is deliberately labeled **incomplete**: 100 citizens, 92 validated requests, 460 judgments, six checkpoints from 16:30 through 17:45, and no completed evening. The source recorder reported a timeout and two ambiguous attempts. This fragment is suitable for verifying the viewer and its evidence trail; it is not the three-evening, 1,000-citizen pilot.

The UI keeps “Recorded Jev simulation · interactive replay” visible, identifies the provider, model, snapshot, kernel, recording date and runtime, and separates:

- stored model probabilities;
- code-derived sampling and resolution;
- trace-linked editorial event narration.

Arbitrary principle editing is unavailable because it cannot create a recorded future. The live development mode remains linked separately.

## Replay v2 bundle and integrity

Run from the repository root:

```powershell
pnpm replay:bundle recordings/pilot-1000-3e-local-final public/recordings/pilot-1000-3e-local-final-v2
```

The generator validates recorder checkpoints and history hashes, creates exact keyframes no more than 120 simulated minutes apart, and stores lossless field-level patches within each segment. It reconstructs and compares canonical semantic hashes for all source frames before succeeding. Traces are split into independently verified shards and demand-loaded only after a citizen or event is selected. Event shards preserve complete history while each playback frame carries only its ten recent event summaries.

The complete three-evening pilot contains 219 verified frames, 28 independently fetchable segments, 75 trace shards and 19 event shards. Measurements from the local Next.js production server:

- generated disk size: 144,007,969 bytes, down from 596,481,003 bytes in v1;
- actual gzip response bytes to first usable city: 892,583 bytes;
- actual gzip response bytes for one complete integrity-bound fetch: 23,183,140 bytes;
- independently compressed Brotli-quality-5 total: 19,592,070 bytes (not the encoding served in the test);
- post-seek Chromium JS-heap indicator: 64.0 MB desktop and 97.4 MB mobile. This is a browser heap measurement, not an exact decoded-payload accounting.

The server responses used `Content-Encoding: gzip`. The first-use and complete-transfer figures are observed response-body bytes, not estimates. The source recorder output remains immutable and the generated pilot v2 bundle stays ignored by Git.

Immutable recorder output remains the source data. Files under `public/recordings/` are derived playback artifacts and can be regenerated.

## Verification and measured UX

Commands:

```powershell
pnpm typecheck
pnpm test
pnpm build
npx playwright test tests/browser/replay.spec.ts
```

On the local production server at `127.0.0.1`, Playwright measured startup plus eight distinct-segment cold seeks and the same eight seeks warm:

| Profile | First usable city | Cold seek p50 / p95 | Warm seek p50 / p95 |
|---|---:|---:|---:|
| Chromium desktop, 1440×900 | 402 ms | 175 / 313 ms | 29 / 43 ms |
| Chromium mobile, 390×844 | 404 ms | 172 / 308 ms | 29 / 43 ms |

These are localhost measurements on the development machine. They verify the provisional three-second cold and one-second warm gates on that stated setup only; they are not a claim about arbitrary networks or devices. `tests/browser/replay-pilot.spec.ts` also verifies actual gzip transfer sizes and the bounded asset cache. The checked-in six-frame real-Jev fragment exercises the same v2 viewer and lazy evidence path without requiring the ignored pilot bundle.

## Remaining limits

- The included recording has one partial evening, so previous/next-evening controls are correctly disabled. They become active when a multi-evening bundle is generated.
- Playback advances through actual 15-minute checkpoints. It does not invent intermediate state, remove daytime observations or quantize numeric values.
- The large pilot v2 bundle is reproducible and locally reviewable but intentionally not committed.
- Public deployment has not been performed.
