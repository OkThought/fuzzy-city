# Draft fourteen-evening recording protocol

**Status: unapproved and blocked. Do not execute.**

This draft exists so review can evaluate a concrete bounded protocol. It does not authorize inference, recording, deployment, publication, or outreach. The failed replay-startup gate in [runtime-qualification.md](runtime-qualification.md) must be resolved by an explicit decision before this protocol can be frozen.

## Proposed immutable identity

- Rules: `fuzzy-city-rules/v2`, unchanged.
- Population: 1,000.
- Seed: `fuzzy-city-rules-v2-main-001`.
- Target: fourteen completed evenings.
- Provider: localhost JevK5 only; model `alibiserikbay/JevK5` at snapshot `27d2d6b8d4714807f6293b0623bd7370b27e42f8`.
- Runtime: optimized FLA attention, Triton convolution, eager execution, CUDA graphs disabled, concurrency one.
- Per-request ceiling: 300 seconds, with no retry after an ambiguous timeout and no mock/provider fallback.
- Proposed fresh directory: `recordings/main-1000-14e-rules-v2-<freeze-date>`.
- Proposed elapsed hard limit: ten hours across one invocation. This is a ceiling, not an expected duration or permission to weaken other stops.

The exact source commit/hash, clean-worktree state, runtime identity, directory date, and initial-world hash must be frozen in a separate approval commit before inference.

## Preflight gates

All must pass before execution:

1. explicit written approval of this protocol and disposition of the failed 3,250-ms replay-startup result;
2. clean repository except explicitly inventoried exclusions;
3. four consecutive real smoke inferences with exact provider/model/runtime identity;
4. working VRAM fallback telemetry showing both whole-device and process scopes;
5. absent output directory and recorder lock;
6. rules-v2 three-evening source replay still consumes all 4,682 entries to world hash `99b6aae0e1f9fe97c7b1ec562c86a543b2b86ef0dce317fbf13f6033fd1e000c` with zero inference calls.

## Stop and recovery rules

- Stop admission at the ten-hour deadline or on operator interrupt; preserve the last complete tick checkpoint and journal.
- Fail closed on provider/schema error, journal/checkpoint/hash mismatch, model/runtime/source mismatch, or missing telemetry.
- Treat a timed-out or disconnected request as ambiguous; do not resubmit it without idempotency and do not substitute a result.
- Never restart as a new seed/directory to replace an unfavorable or failed outcome.
- Resume only the same directory, seed, source hash, rules, model snapshot, kernel configuration, and target after written review of the failure/stop artifact.
- Do not tune constants, prompts, sampling, thresholds, or replay packaging from partial outcomes.

## Predeclared review evidence

On completion or stop, report every evening and the aggregate:

- wall time, requests/judgments, API calls, tokens, latency/service p50/p95/max, and context p50/p95/max;
- whole-device and JevK5-process VRAM samples/peaks with scope labels;
- failures, ambiguous attempts, retries, checkpoint/journal counts, and source/runtime identity;
- state-boundary counts including satisfaction, relationship-update signs, activity diversity, contact/isolation, repeated encounters, and money growth;
- provider-free full replay consumption/world hash/zero calls;
- replay-v2 semantic hashes, generated/served bytes, and cold/warm browser measurements.

The result remains a recorded artificial-life simulation with stored model probabilities and code-derived outcomes. It must not be framed as fresh inference during replay, evidence about real people, or proof of causal social mechanisms.

## Post-run boundary

Completion would stop for review. It would not itself authorize deployment, public release, an article, outreach, or another recording.
