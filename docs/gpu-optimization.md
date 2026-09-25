# GPU optimization — 24–25 September 2026

The selected runtime accelerates attention with FLA and causal convolution with FLA's Triton kernel. Windows Triton was missing despite the installed JevK5 `fast` extra. This is a GPU-runtime change: no shorter prompts, changed questions, quantization, cached answers, mock substitution, asynchronous scheduling or movement changes.

Start normally with `scripts/start-jevk5.ps1`. Use `-Reference` to reproduce the reference attention/convolution kernels. The launcher pins the original cached BF16 model snapshot, logs its configuration, and retains upstream `/v1/systemone` HTTP handling. Package versions are saved in [environment.json](../benchmarks/gpu-path/environment.json). Missing acceleration packages fail explicitly.

## Fixed-input comparison

[Fixture](../benchmarks/gpu-path/fixture.json): first, middle and last trace from each of the three decision types in the previously completed 100-citizen evening. Nine requests comprise 30 typed judgments; every request is repeated three times after warming all nine inputs. The 27 measured requests contain 90 judgments. Input lengths span 1,139–2,279 tokens per question. Same fixture hash, weights, temperature, prompts and HTTP concurrency one for every variant.

These are sequential HTTP microbenchmarks on isolated port 8091: application waiting queue depth is zero. They do not measure simulation queue delay. p50/p95 are nearest-rank request latencies, not per-question latencies. GPU readings sample whole-device memory, including warm-up, roughly every half-second. Startup/JIT compilation is excluded from throughput and warm-up latency is retained. These short repeated samples do not provide statistical confidence intervals.

| Trial | Requests/s | p50 ms | p95 ms | Peak VRAM MiB | Speedup vs paired reference |
|---|---:|---:|---:|---:|---:|
| Reference v1 | 0.673 | 1,609 | 2,682 | 10,973 | 1.00× |
| FLA attention only | 0.905 | 1,175 | 1,995 | 10,879 | 1.35× |
| FLA attention + convolution v1 | 0.949 | 1,121 | 1,903 | 10,846 | 1.41× |
| FLA + convolution + graphs 1536/3072 | 0.901 | 1,086 | 2,041 | 10,402 | 1.34× |
| Reference v2 | 0.703 | 1,542 | 2,545 | 11,275 | 1.00× |
| FLA attention + convolution v2 | 1.065 | 1,000 | 1,705 | 10,906 | 1.51× |

Graphs were measured after an overnight interruption. The eager reference and selected candidate were therefore repeated in the resumed session. Both comparisons support a modest **1.4–1.5×** gain, not an order-of-magnitude improvement. The two-size graph capture started successfully but was not selected: it did not beat the eager candidate and shifted one tested judgment across 0.5. Requests longer than the largest captured shape would use eager inference; graph timings do not establish performance for all possible contexts.

The first FLA warm-up incurred about 31 seconds of JIT compilation. A cached restart is quicker, but kernel warm-up remains separate from steady-state throughput. An initial shared-port probe was interrupted and is excluded; an early isolated attempt failed before the server was ready (`reference-isolated.json`). Neither is a successful comparison. An unpinned restart attempted to check/download an upstream model update; it was stopped before serving, and the launcher now loads the exact original cached snapshot only.

## Actual 1,000-citizen workload

The optimized normal startup on port 8090 completed the unchanged 35-minute opening window: **120 intention evaluations / 600 judgments**, zero failures, concurrency one, seed `fuzzy-city-001`. This is not a full 1,000-person evening. [Raw report](../benchmarks/2026-09-25T09-47-16-153Z-62f323a9/summary.json).

| Measurement | Earlier reference run | Optimized run |
|---|---:|---:|
| Decisions/sec | 0.685 | 1.205 |
| Judgments/sec | 3.425 | 6.027 |
| Queue-inclusive p50 | 14.957 s | 8.953 s |
| Queue-inclusive p95 | 28.086 s | 16.742 s |
| Peak waiting queue | 19 | 19 |
| Peak whole-device VRAM | 10,864 MiB | 10,110 MiB |

The optimized run took 99.55 seconds excluding warm-up. Service-only p50/p95 was 859/1,005 ms. The historical application comparison is **1.76×**, but desktop load, allocator state and measurement session differ; the controlled fixed-input comparisons support the more conservative **1.4–1.5×** kernel improvement. The queue remains the same size because scheduling was deliberately unchanged. At the measured opening-window rate, a 20-person cohort still takes roughly 16.6 seconds, and 1,000 intentions alone would take about 13.8 minutes if that rate held. Those last two numbers are estimates, not full-evening measurements.

The post-run real Choice smoke test also passed (235 ms first request, 59 ms second). Strict TypeScript and all 28 application tests pass; the direct GPU convolution check passes. No UI or simulation timing changes were made in this optimization pass.

## Numerical validation

All successful fixture responses have finite valid probabilities, matching answer keys and unchanged token usage. Across 90 tested judgments per trial:

- Selected kernels: maximum absolute probability difference **0.021471**, mean **0.005898** versus reference; no Noul 0.5 crossings or Choice winner changes on this fixture.
- Graph candidate: maximum difference **0.040706**; one unique Noul crosses 0.5 (repeated in each of the three repetitions).
- The convolution layout adapter passes a direct BF16 comparison against grouped PyTorch convolution plus SiLU at three sequence lengths, with and without bias.

Optimized floating-point kernels are not bit-identical. Small probability changes can change seeded sampling and downstream relationships even without a 0.5 crossing. This fixture verifies numerical behavior on sampled real inputs; it is not a quality benchmark or proof of identical long-run city histories. Frozen input comparisons are the primary speed evidence; future full simulations may perform different amounts of work.

Raw reports and comparisons are in [benchmarks/gpu-path](../benchmarks/gpu-path). Reproduce while the app is not using the GPU:

```powershell
# Start one server variant at a time. Stop it before loading the next model.
& .\.venv\Scripts\python.exe scripts/serve-jevk5.py --port 8091 --kernels reference
# In another terminal, after the server says it is serving:
& .\.venv\Scripts\python.exe scripts/benchmark-gpu.py --url http://127.0.0.1:8091 --label new-reference
# Candidate server arguments: --port 8091 --kernels fla --triton-conv
# Then measure with a new label and compare:
& .\.venv\Scripts\python.exe scripts/compare-gpu.py new-reference new-candidate
```

## What advertised latency would mean

For 1,000 evening intentions, the current contract asks five questions per person. Thus JevK5 performs 5,000 individual forward passes. At the publisher's H100 easy/standard p50 of **13.5 ms per judgment**, arithmetic gives **67.5 seconds** for intentions alone and **1.35 seconds** per 20-person cohort. At its hard-item p50 of 30 ms, those become 150 seconds and 3 seconds. These are hypothetical extrapolations of published per-item latency, not city throughput predictions or RTX 4070 Ti guarantees. [JevK5 source](https://github.com/allebee/jevk5)

TypeSafe advertises **70–500 ms end-to-end per request**, with parallel outputs. If this held for our five-question request, intentions would take 70–500 seconds serially; eight genuinely concurrent requests with sufficient service capacity would give an idealized 8.75–62.5 seconds. A 20-person cohort needs three waves at concurrency eight: roughly 0.21–1.5 seconds. Account rate limits, token throughput, network location and correlated tail latency may prevent that scaling. No hosted Jev request was made. [TypeSafe launch measurements](https://typesafe.ai/blog/introducing-system-one-models-and-jev)

At the current 1× simulation clock, 20 citizens per 220 ms would require about **91 intention requests/sec / 455 judgments/sec** to eliminate inference stalls. Even the published single-request JevK5 H100 median is insufficient for that synchronized schedule. Smooth movement can use existing plans independently, but allowing simulated time to advance while new semantic decisions are pending changes event timing. This GPU experiment leaves those semantics unchanged.
