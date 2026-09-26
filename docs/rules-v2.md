# Simulation rules v2

`fuzzy-city-rules/v2` is a correction release prepared after the three-evening rules-v1 pilot. It is not fitted to create more dramatic stories.

## Replacement-pilot freeze

Reviewed and frozen before inference on 26 September 2026:

- the constants below are accepted unchanged for one bounded replacement pilot;
- population is exactly 1,000 and the fixed seed is `fuzzy-city-rules-v2-pilot-001`;
- the target is three completed evenings under `fuzzy-city-rules/v2`;
- inference is local JevK5 only, at provider concurrency one, with no provider mixing or mock fallback;
- the elapsed-run hard limit is two hours;
- output is the fresh immutable directory `recordings/pilot-1000-3e-rules-v2-2026-09-26`; the rules-v1 pilot is not resumed or modified.

The deterministic-mock satisfaction saturation is accepted as a **known limitation of the mock soak for this diagnostic pilot only**. The mock fixture produces only positive centered relationship deltas, so its 653–702 citizens at maximum satisfaction after fourteen evenings does not establish that real JevK5 will saturate in the same way. It also does not establish that satisfaction is healthy: satisfaction was outside the correction set, remains unchanged, and its lower/upper boundary counts must be reported from the real three-evening pilot. Any material real saturation is a review finding, not a reason to tune this frozen run or proceed to fourteen evenings.

This freeze authorizes only the replacement pilot and its replay/measurement work. It does not authorize a fourteen-evening recording, deployment, publication, or outreach.

## Frozen constants

The relationship update retains the v1 weights but centers both model probabilities:

```text
affinity += 0.08 * (2 * connection - 1) - 0.06 * (2 * tension - 1)
```

At `connection=0.5` and `tension=0.5`, the update is exactly zero. The v1 formula subtracted uncentered tension, which made moderate encounters negative by construction. Social-need relief per encounter changes from `0.30 * connection` to `0.18 * connection` so a single encounter does not erase almost a third of the state range.

Per-minute state constants are centralized in `src/sim/rules.ts`:

| Constant | v1 | v2 | Reason |
|---|---:|---:|---|
| Rest energy | +0.00130 | +0.00075 | Balance a normal sleep/work/evening cycle instead of adding roughly 0.25 energy daily |
| Rest stress | -0.00080 | -0.00035 | Remove the strong mechanical fall toward zero |
| Work energy | -0.00065 | -0.00060 | Retain work cost while balancing rest |
| Work stress | +0.00040 | +0.00035 | Balance ordinary rest before activity-specific effects |
| Active energy | -0.00018 | -0.00018 | Unchanged |
| Park stress | -0.00050 | -0.00035 | Keep park recovery without overwhelming the daily balance |
| Social need, disconnected | +0.00018 | +0.000075 | Avoid mechanical saturation before an evening encounter |
| Social need, contacted today | +0.00004 | +0.000015 | Preserve slower post-contact growth |
| Wage base | +0.100/min | +0.018/min | Reduce an implausible roughly €72 typical daily gain |
| Wage ambition term | +0.100/min | +0.012/min | Retain ambition variation without runaway money |

The recorder defaults new runs to v2 while accepting v1 for provider-free inspect, seek and replay. The preserved v1 pilot still replays to world hash `d06444a8b95c1db1f6ab9e7fc1ce4576d4dfb3a4c7ad76feb6dafbd1b0371b17` with 4,768 consumed requests and zero outgoing inference calls.

## Mock soak and amendment

The fixed soak uses population 1,000 for fourteen evenings with three predeclared seeds: `fuzzy-city-v2-soak-a`, `-b`, and `-c`. The original report is retained at `.local/evidence/rules-v2-mock-soak.json`. It failed because its acceptance rule also treated satisfaction saturation as in scope and required negative relationship deltas from a deterministic mock fixture whose fixed probabilities only produce positive centered deltas.

That gate was not silently rewritten. A separate amended report at `.local/evidence/rules-v2-mock-soak-amended.json` narrows state acceptance to the four requested corrections and treats mock relationship direction as a reported diagnostic. Across the three seeds:

- energy boundary counts were 44–61 at zero and 0 at one;
- stress boundary counts were 0 at zero and 7–12 at one;
- social-need boundary counts were 0 at zero and 28–42 at one;
- mean money gain was €159.29–€159.83 over fourteen evenings;
- every evening retained interactions, and no activity exceeded 60%.

Satisfaction still saturates for 653–702 citizens under the all-positive deterministic mock. This remains visible as a limitation rather than being silently tuned outside the approved correction set.

As the relationship-direction check, the 2,066 preserved real Jev pilot outcomes were rescored without changing the recording: 1,053 (50.97%) would be positive, 1,011 (48.94%) negative, and 2 zero under v2. This is a counterfactual formula diagnostic, not a new simulation outcome.

Run the soak with:

```powershell
pnpm rules:v2:soak
```

The review above closes the pre-inference decision gate for the bounded replacement pilot. Its execution and evidence remain tracked in [GitHub issue #1](https://github.com/OkThought/fuzzy-city/issues/1).
