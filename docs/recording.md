# Durable recorder (milestone 1)

The recorder runs the existing one-minute simulation without browser pacing. A completed evening is the state **after the day’s 23:00 tick** (`minute=1380`); the next evening is reached by simulating every intervening night and daytime tick. A checkpoint is committed every 15 simulated minutes and at 23:00. The world includes RNG, citizens, relationships, counters, and scheduling fields. Traces and events live in append-only, hashed history chunks referenced by checkpoints.

## Commands

Run the local JevK5 server first using `& .\scripts\start-jevk5.ps1`, then in another terminal:

```powershell
$env:DECISION_PROVIDER='jevk5'
pnpm record record --population 1000 --seed fuzzy-city-001 --evenings 3 --output recordings/pilot --max-hours 3
pnpm record record --resume recordings/pilot --evenings 3 --max-hours 3
pnpm record replay recordings/pilot
pnpm record seek recordings/pilot --day 2 --minute 1027
pnpm record inspect recordings/pilot
```

Use `DECISION_PROVIDER=mock` for local validation. The CLI allows the simulation’s existing populations of 100, 250, 500, or 1,000. `--evenings` on resume is the target total. `--max-hours` bounds each invocation. Ctrl+C or an elapsed budget stops admission after the current request, leaves the last complete tick checkpoint, and returns status `incomplete`. A provider failure returns `failed`. Both can be resumed with the same code, model configuration, seed and rules. A timed-out HTTP response may still complete on the server; `uncertainAttempts` and failure files report this uncertainty.

The recorder rejects fallback answers and missing or malformed probabilities. Every successful request is fsynced in `journal.jsonl` with sequence, full state, question schema, model configuration, probabilities, token/call counts, and queue/service/total latency. The request hash binds all of these inputs, including the rules version. On resume, the simulation starts at the last committed checkpoint, strictly consumes any later journaled decisions, and only then calls the provider. A mismatch fails rather than using an answer for another context.

`manifest.json` records the initial world hash, principle history, code/source hash, Git HEAD, Node version, provider/model/snapshot/kernel identity, progress, and per-evening measurements. The manifest never contains the provider key. `initial.json`, `journal.jsonl`, `checkpoints/`, `chunks/`, `evening-*-gpu.json`, and `failure-*.json` are raw source data; keep them together. Checkpoint and chunk hashes are checked when loaded. `replay` runs the recorded simulation to the latest committed checkpoint with **no provider** and compares the complete world. `seek` starts at the nearest earlier checkpoint and reconstructs forward from journaled results. Neither command manufactures unrecorded future state.

The app’s live inference and benchmark routes reject work while the recorder owns `.recording-gpu.lock`. Start the recorder only when existing browser/benchmark inference is idle; it checks the local benchmark service before taking the lock. Each recording directory must be new. Recordings are ignored by Git and should be backed up separately.

## Current validation and limits

- Two-evening, 100-citizen mock fixture at `recordings/milestone-one-final`: 297 decisions; full replay matched the committed world, and a seek across 14 decisions required zero outgoing calls. This is deterministic validation, not JevK5 evidence.
- A 100-citizen JevK5 attempt journaled 111 validated real requests. The committed 17:45 checkpoint replayed 92 requests with zero outgoing calls. A later friend-selection request timed out at both 60 and 180 seconds while the GPU remained busy, so the evening is **incomplete**. Its two unjournaled attempts are uncertain; the raw recording remains in `recordings/milestone-one-jevk5` locally. Diagnose the backend before the 1,000-citizen pilot.
- The raw format is version `fuzzy-city-recording/v2`, with rules `fuzzy-city-rules/v1`. The public replay viewer and three-evening pilot are subsequent milestones. A public playback bundle should be derived from these chunks and must not ship the complete raw journal in the initial page payload.
- New live runs require the updated local server launcher. Its health response identifies the actual model revision, kernels, graph capture, JevK5, Torch, CUDA, and Python versions. Restart any server launched before this recorder change before starting a new live recording.
