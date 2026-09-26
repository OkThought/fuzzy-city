# Milestone 3: three-evening pilot and review

Recorded 25–26 September 2026. The complete immutable source is `recordings/pilot-1000-3e-local-final`; the generated review bundle is `public/recordings/pilot-1000-3e-local-final`. Raw recordings are ignored by Git and must be backed up separately.

## Decision

The three-evening, 1,000-citizen pilot is complete and provider-free replay matches the committed final world. It is useful evidence, but it should **not yet be extended into the fourteen-evening main recording**. Three issues need an explicit decision first:

1. 1,839 of 2,066 directed relationship updates were negative. This is trace-backed behavior, but the programmed relationship formula appears to amplify moderate tension enough that even moderately positive encounters often reduce affinity.
2. Programmed state dynamics are already approaching boundaries: 140 citizens ended at maximum energy, 127 at minimum stress, 46 at maximum social need, and mean money rose from 114.42 to 286.56 in three days.
3. The uncompressed derived replay is 596,481,003 bytes for three evenings and would project to roughly 2.78 GB at fourteen. The replay format needs compaction before public release.

Do not tune these after viewing outcomes and silently continue the same dataset. If rules change, version them and start a new pilot. If the dynamics are accepted unchanged and only replay packaging changes, this recording can remain the prefix of the main run.

## Recording-backend gate

Hosted Jev through Vercel AI Gateway was tested with the same 100-citizen, 35-minute opening workload and fixed seed. Attempt metadata, HTTP status, backoff, tokens and ambiguity are retained in the raw benchmark reports.

| Backend / concurrency | Workload | Result | Completed rate | Retry evidence |
|---|---:|---|---:|---|
| Hosted / 1 | 12 evaluations | 12/12 complete in 5.384 s | 2.229/s | 12 HTTP 200; no retry |
| Hosted / 2 | 12 evaluations | 12/12 complete in 2.028 s | 5.918/s | 12 HTTP 200; no retry |
| Hosted / 4 | attempted 12 | failed after 5 successes | 0.342/s before failure | 5×200, 1×429, 4×503; 11.855 s backoff |
| Hosted / 8 | not run | concurrency 4 did not justify escalation | — | — |
| Hosted / 1 | representative 1,000-citizen opening | warm-up failed | no measured case | final HTTP 503 |
| Local JevK5 / 1 | 120 evaluations | 120/120 complete in 99.55 s | 1.205/s | zero failures |

Raw hosted reports:

- `benchmarks/2026-09-25T21-51-59-162Z-b0a7b7f6`
- `benchmarks/2026-09-25T21-52-12-506Z-81374904`
- `benchmarks/2026-09-25T21-52-19-674Z-2a36ad8a`
- `benchmarks/2026-09-25T21-52-44-996Z-e40dd896`

Hosted concurrency two showed a material short-burst speed advantage, but concurrency four failed under bounded retry and the representative run failed during its single warm-up. Hosted price variables were unset, so cost is unknown rather than zero. The gate therefore selected the slower verified local backend; a recording cannot depend on an availability pattern that failed before its representative case began.

The hosted adapter now retries only explicit 429/503 responses, respects `Retry-After`, applies bounded exponential jitter, records every attempt, and does not resubmit ambiguous timeouts or lost connections without provider-supported idempotency.

## Frozen successful configuration

- Population: 1,000
- Seed: `fuzzy-city-001`
- Principle: “A good life should leave room for recovery, meaningful relationships and curiosity.”
- Rules: `fuzzy-city-rules/v1`
- Provider/model: local JevK5 0.2.0 / `alibiserikbay/JevK5`
- Model snapshot: `27d2d6b8d4714807f6293b0623bd7370b27e42f8`
- Runtime: PyTorch 2.9.1+cu128, CUDA 12.8, Python 3.12.6
- Kernels: optimized FLA attention, Triton convolution, eager execution, CUDA graphs disabled
- Provider concurrency: one
- Per-request ceiling: 300 seconds; elapsed-run ceiling: four hours
- Source hash: `e4d8b06cc1edc7ee29f6abfb975024a5a84d8cf720258129b00a9e070ca3c66b`

## Runtime and size

| Evening | Wall time | Requests / judgments | Input tokens | Max request context | Peak total VRAM | Cumulative raw disk |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 27m 10.5s | 1,572 / 6,589 | 7,972,271 | 4,831 B | 11,912 MiB | 79.3 MB |
| 2 | 28m 45.2s | 1,579 / 6,599 | 8,769,312 | 5,548 B | 11,950 MiB | 338.5 MB |
| 3 | 36m 26.6s | 1,617 / 6,679 | 9,764,554 | 6,010 B | 11,950 MiB | 619.2 MB |

Total recording wall time was 1h 32m 22.5s. All 4,768 logical requests succeeded with one API call each; there were no retries, fallbacks or ambiguous attempts in the successful recording. Queue depth is zero because the recorder intentionally admits one logical request at a time. The third evening was 34.1% slower than the first, while maximum serialized context grew 24.4%.

A naive fourteen-evening projection from observed per-evening time is 7.18 hours, with an observed-min/max range of 6.34–8.50 hours. The raw recording projects to about 3.59 GB. These are planning estimates, not guarantees: later context and checkpoint duplication may grow nonlinearly.

The actual generated three-evening playback bundle contains 219 frames and 30 history chunks:

- first usable payload: 2,900,054 bytes;
- complete bundle: 596,481,003 bytes;
- naive fourteen-evening transfer projection: approximately 2.78 GB.

No ordinary-network startup or browser seek timing was measured for this large bundle, so it does not inherit Milestone 2’s localhost latency claims. The public packaging must stop repeating large state across dense overnight/daytime checkpoints before release.

## Failure and recovery evidence

The successful run followed two retained diagnostic attempts:

- `recordings/pilot-1000-3e-local-2026-09-25` journaled 1,570 successful evaluations and committed day 1 at 19:00. The same next interaction request exceeded 180 seconds twice. Both unjournaled attempts were marked ambiguous; no result was substituted. Backend logs showed the response trying to write roughly one minute after the client cutoff.
- After raising the bounded ceiling to 300 seconds, `recordings/pilot-1000-3e-local-2026-09-26` failed on its first request because the reused backend process remained busy/degraded after the aborted calls. It contains no journaled result and one ambiguous attempt.

The backend process was then stopped, restarted, and required to pass four consecutive real smoke inferences (54–717 ms) before the final fresh run. The successful pilot needed no resume. The 300-second ceiling is a versioned operational change, not a hidden retry of the failed recording.

## Predefined behavioral metrics

Metric definitions live in `scripts/analyze-pilot.ts` and are emitted with the results in `recordings/pilot-1000-3e-local-final/pilot-analysis.json`.

### Activity and contact

| Day | Rest | Overtime | Visit friend | Café | Park | Explore | Normalized activity diversity |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 326 | 121 | 236 | 99 | 122 | 96 | 0.933 |
| 2 | 274 | 157 | 239 | 122 | 106 | 102 | 0.957 |
| 3 | 272 | 144 | 266 | 134 | 88 | 96 | 0.945 |

No activity exceeded 32.6% on any day, so there is no single-choice collapse. Only 47 citizens (4.7%) sampled the same activity on all three evenings. No café/park request used the plaza capacity fallback.

Recorded social interactions were 339, 340 and 354 by evening. They involved 678, 680 and 708 unique citizens respectively; 322, 320 and 292 citizens had no recorded interaction on those evenings. Co-location without an interaction trace is deliberately not counted as contact.

There were 48 repeat encounter pairs, including two pairs that met on all three evenings. The recording produced 36 new directed friendships under the existing threshold, but this does not guarantee future friendship growth.

### Relationship and state warnings

The 1,033 interaction traces produced 2,066 directed updates across 1,966 directed relationships. Only 227 updates were positive and 1,839 were negative (89.0%). The fixed rule is:

```text
affinity += 0.08 * (2 * connection - 1) - 0.06 * tension
```

For example, a connection probability of 0.62 with tension 0.48 still produces a negative delta. The observed skew may therefore be a property of the programmed formula interacting with JevK5’s probability range, not a general social finding.

Mean energy rose from 0.499 to 0.643, mean stress fell from 0.505 to 0.210, mean social need rose from 0.504 to 0.705, and mean money rose from 114.42 to 286.56. The boundary counts and rapid money increase are suspicious programmed dynamics that should be inspected before a longer run.

### Earlier encounters in later decisions

Of 2,000 day-two/day-three intention inputs, 1,572 (78.6%) contained either a recorded recent memory or a known relationship whose interaction count was above zero. This proves that earlier encounters were supplied to later model decisions. It does **not** establish that those encounters caused a particular probability or sampled action; the city state changes in many other ways between evenings.

## Trace-backed candidate stories

There is enough material for later editorial work, subject to the warnings above:

1. Lena Moreau (`citizen_38`) and Rosa Reed (`citizen_46`) met on all three evenings (`trace_1249`, `trace_2824`, `trace_4436`). Their later interaction inputs included prior memories. Their two directed affinity deltas moved from roughly −0.008/+0.002 on day one to −0.047/−0.031 on day two and −0.124/−0.116 on day three as recorded tension rose. This is an inspectable deterioration, not proof of a real-world social mechanism.
2. Sofia Lind (`citizen_181`) and Zara Dubois (`citizen_489`) also met three times (`trace_1296`, `trace_2871`, `trace_4492`). Both directions declined strongly; one direction remained positive only because it began with positive affinity. This illustrates why final relationship state and model-produced probabilities must be shown separately.
3. Ada Novak’s day-one encounter with Sara Flores (`trace_1234`) was present as a memory in Ada’s day-two intention input (`trace_1574`), after which the model probabilities and ordinary RNG sampling produced a café visit. The trace establishes the information path, not causality.
4. Ada Khan’s encounter with Rosa Dubois (`trace_1238`) entered the next evening’s intention input (`trace_1584`), which sampled exploration. This is a second concrete decision trail with a different outcome.

## Verification and reproduction

The complete provider-free replay consumed every journal entry, matched world hash `d06444a8b95c1db1f6ab9e7fc1ce4576d4dfb3a4c7ad76feb6dafbd1b0371b17`, and made zero outgoing inference calls. A seek to day 2 at 20:00 also made zero outgoing calls.

```powershell
pnpm record inspect recordings/pilot-1000-3e-local-final
pnpm record replay recordings/pilot-1000-3e-local-final
pnpm record seek recordings/pilot-1000-3e-local-final --day 2 --minute 1200
pnpm pilot:analyze recordings/pilot-1000-3e-local-final
pnpm replay:bundle recordings/pilot-1000-3e-local-final public/recordings/pilot-1000-3e-local-final
```

The original recording command was:

```powershell
$env:DECISION_PROVIDER='jevk5'
$env:DECISION_TIMEOUT_MS='300000'
pnpm record record --population 1000 --seed fuzzy-city-001 --evenings 3 --output recordings/pilot-1000-3e-local-final --max-hours 4
```

Do not rerun that command against the existing directory. Preserve the immutable recording and use `--resume` only if deliberately extending the unchanged run.

## Recommended next bounded step

Implementation update, 26 September 2026: the rules-v2 correction and lossless replay-v2 package has been implemented and validated without running new inference. See `docs/rules-v2.md` and `docs/replay.md`. [GitHub issue #1](https://github.com/OkThought/fuzzy-city/issues/1) tracks the explicit review/freeze gate and bounded replacement pilot; this note does not authorize GPU execution.

Before any additional GPU recording:

1. diagnose the negative-affinity skew and state saturation without changing this evidence;
2. compact the replay bundle and remeasure first-use bytes, total transfer, cold/warm seek and mobile behavior;
3. present an explicit choice: accept rules v1 unchanged and continue this exact recording, or version the rules and start a new three-evening pilot.

If rules v1 is accepted unchanged, budget up to seven additional GPU hours for the remaining eleven evenings, with the existing recoverable checkpoints and a hard elapsed limit. If rules change, budget two hours for a replacement three-evening pilot before reconsidering the main run.
