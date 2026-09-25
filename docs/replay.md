# Minimal replay viewer

Milestone 2 adds a replay-only route at `/replay`. It does not call an inference provider, expose credentials, or change the live development simulation at `/`.

## Included recording

The checked-in demonstration bundle is derived from `recordings/milestone-one-jevk5`, the preserved local JevK5 attempt from 25 September 2026. It is real inference evidence, but it is deliberately labeled **incomplete**: 100 citizens, 92 validated requests, 460 judgments, six checkpoints from 16:30 through 17:45, and no completed evening. The source recorder reported a timeout and two ambiguous attempts. This fragment is suitable for verifying the viewer and its evidence trail; it is not the three-evening, 1,000-citizen pilot.

The UI keeps “Recorded Jev simulation · interactive replay” visible, identifies the provider, model, snapshot, kernel, recording date and runtime, and separates:

- stored model probabilities;
- code-derived sampling and resolution;
- trace-linked editorial event narration.

Arbitrary principle editing is unavailable because it cannot create a recorded future. The live development mode remains linked separately.

## Bundle and integrity

Run from the repository root:

```powershell
pnpm replay:bundle
```

The generator validates the recorder checkpoints and history hashes, then creates `public/recordings/milestone-one-jevk5/`. Every browser-loaded snapshot and history chunk carries a byte length and SHA-256 digest that the viewer verifies before use. The index is loaded first, followed by only the initial snapshot and its history. Later frames and cumulative history are loaded on playback or seek.

Current generated sizes:

- first usable city: 244,933 bytes (index, first snapshot and first history chunk);
- complete six-frame fragment: 1,798,384 bytes;
- full recording data is not downloaded before interaction.

Immutable recorder output remains the source data. Files under `public/recordings/` are derived playback artifacts and can be regenerated.

## Verification and measured UX

Commands:

```powershell
pnpm typecheck
pnpm test
pnpm build
npx playwright test tests/browser/replay.spec.ts
```

On the local production server at `127.0.0.1`, Playwright measured the time from navigation start to a usable Canvas and a cold seek from the first to final checkpoint:

| Profile | First usable city | Cold seek |
|---|---:|---:|
| Chromium desktop, 1440×900 | 296 ms | 39 ms |
| WebKit desktop, 1440×900 | 399 ms | 60 ms |
| Chromium mobile, 390×844 | 285 ms | 30 ms |
| WebKit mobile, 390×844 | 405 ms | 124 ms |

These are localhost measurements on the development machine with browser caches in their normal test context. They verify the provisional three-second target on that stated setup only; they are not a claim about arbitrary networks or devices. The browser test also checks incremental loading, integrity-checked seeking, trace inspection, and absence of horizontal overflow.

## Remaining limits

- The included recording has one partial evening, so previous/next-evening controls are correctly disabled. They become active when a multi-evening bundle is generated.
- Playback advances through actual 15-minute checkpoints. It does not invent intermediate state or interpolate unrelated snapshots.
- The viewer format is ready for a later pilot bundle, but the three-evening recording and backend-selection gate remain separate work.
- Public deployment has not been performed.
