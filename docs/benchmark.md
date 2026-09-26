# Local decision benchmark

**Hosted recording gate, 25 September:** Vercel AI Gateway completed the 12-evaluation probe at concurrency one and two, failed under bounded retry at concurrency four, and then failed the representative 1,000-citizen warm-up at concurrency one. The recording gate therefore selected local JevK5. See [the Milestone 3 report](pilot-report.md) for the raw report paths and comparison.

**GPU runtime update, 25 September:** accelerated FLA/Triton eager execution is now the local default. The unchanged 1,000-citizen opening workload measured **1.205 decisions/sec**, p50/p95 **8.953/16.742 s**, peak queue **19**, peak VRAM **10,110 MiB**, with zero failures. Earlier measurements below used reference kernels and are retained as historical evidence. See [the paired GPU comparison and numerical differences](gpu-optimization.md).

Open `/benchmark` with the app and JevK5 server running. Select one population or sweep **100 / 250 / 500 / 1000**, choose a workload and concurrency, then run. The UI polls measured progress and exports a JSON summary. Raw reports persist under `benchmarks/<run-id>/` in the server working directory.

CLI (the same coordinator and simulation, not a separate synthetic client):

```sh
pnpm benchmark
pnpm benchmark --populations 100 --minutes 390
pnpm benchmark --populations 100,250,500,1000 --minutes 35 --concurrency 2
```

Start `pnpm dev` first. The CLI defaults to `http://localhost:3000`; use `--url` for another local port. Ctrl+C requests cancellation. The coordinator finishes admitted GPU requests before releasing its exclusive lease. One benchmark runs at a time; ordinary app inference is rejected while that lease is held. Other processes talking directly to port 8090 are outside this isolation.

## Workloads

- **35 minutes: opening window, 16:30–17:05.** Creates the selected number of citizens and simulates the normal staggered schedule. Evaluates 12, 30, 60 or 120 citizens respectively. This is a bounded latency/queue probe, **not an entire-population evening benchmark**.
- **390 minutes: full evening, 16:30–23:00.** Evaluates every citizen, samples destinations, runs friend Choice evaluations and encounters, and updates relationships. The exact evaluation count depends on model probabilities and seeded outcomes.

The full simulation is tested at all four populations in mock mode. Real-inference samples are identified explicitly below. One real intention evaluation warms each case before timing begins; its calls and tokens are excluded from measured totals. Warm-up duration is saved. The model must already be loaded; startup latency is not measured.

## Measurement definitions

- **Decisions/sec:** successfully validated System One evaluations divided by case wall time. One evaluation is an HTTP request containing five intention questions, one friend Choice, or four interaction questions. Also report **judgments/sec** to avoid conflating questions with requests.
- **p50/p95 latency:** nearest-rank percentiles of successful evaluations, measured with a monotonic clock from application-queue submission through response validation. Service time and queue wait have separate percentiles and raw measurements. A larger queue raises this latency without implying slower individual GPU inference.
- **Queue depth:** actual waiting work in the bounded application pool, excluding active calls. Peak active calls, current/peak waiting depth and a time-weighted mean are retained. JevK5's internal lock queue is not directly observable; its wait is included in service time if concurrency exceeds one.
- **VRAM:** `nvidia-smi` samples approximately once per second plus beginning/end samples. Values are MiB for the whole GPU, including the desktop, other apps and allocator caches. They are not PyTorch model-only allocations. Missing readings are `unknown`, never zero.
- Failed, cancelled or malformed evaluations contribute no successful decisions or judgments. Their latencies, attempt counts and error labels remain in the raw report. No fallback answers are used by benchmark or application providers.
- Wall time includes deterministic simulation and telemetry overhead. Results are local observations, not a statistically controlled cross-device benchmark. Cases execute sequentially, so thermal and allocator-cache effects may carry forward.

Each population JSON stores per-evaluation measurements, queue transitions, GPU readings, configuration, warm-up metadata, complete decision traces, final citizen/relationship state, events and RNG state. Reports contain no credentials. A stopped/failed case is explicitly marked incomplete.

## Measured opening-window sweep — 24 September 2026

JevK5 0.2.0, `alibiserikbay/JevK5`, BF16, PyTorch 2.9.1+cu128, RTX 4070 Ti (12,282 MiB). CUDA graphs disabled by the installed startup script; concurrency **1**. Seed `fuzzy-city-001`.

| Population | Evaluated citizens | Decisions/s | Judgments/s | p50 / p95 latency (ms) | Queue peak / mean | Peak GPU MiB |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 12 | 0.624 | 3.118 | 1,872 / 3,737 | 1 / 0.52 | 10,609 |
| 250 | 30 | 0.646 | 3.229 | 4,384 / 8,250 | 4 / 1.98 | 10,604 |
| 500 | 60 | 0.684 | 3.420 | 8,348 / 14,340 | 9 / 4.55 | 10,819 |
| 1,000 | 120 | 0.685 | 3.425 | 14,957 / 28,086 | 19 / 9.52 | 10,864 |

All 222 measured evaluations succeeded (1,110 typed judgments), with no fallback and no API key. Service-time p95 stayed near 1.87 seconds across this sweep; the larger queue accounts for most of the rising end-to-end latency. This indicates that the serial local backend, not Canvas rendering, limits simulated clock speed at this workload.

[Raw summary](../benchmarks/2026-09-24T12-56-44-109Z-73c27490/summary.json). Each sibling population JSON contains the supporting observations and causal traces.

An initial full-evening attempt was interrupted at 18:00 when the previously running model process disappeared. Its [failed report](../benchmarks/2026-09-24T13-03-30-810Z-f5b4f8db/summary.json) is retained and excluded from successful-run claims. It reached 100 intention evaluations and four friend choices; peak total VRAM was 11,842 MiB. The cause of process termination is unconfirmed. Its failed-call attempt count was affected by development module reloads; structural error metadata handling now preserves that count across reloads.

## Verified full evening — 100 citizens

After restarting the local service with logs, a [complete 16:30–23:00 run](../benchmarks/2026-09-24T17-25-19-409Z-0c8db54b/summary.json) passed with all 100 citizens evaluated, 22 friend choices and 29 interactions. **151 evaluations / 638 typed judgments**, zero failures, no fallback. Measurement time was 192.60 seconds (excluding warm-up), or **0.784 decisions/sec** and **3.313 judgments/sec**.

- Queue-inclusive p50 / p95: **1,932 / 42,342 ms**.
- Service-only p50 / p95: **1,211 / 2,487 ms**.
- Waiting queue peak / time-weighted mean: **26 / 4.17**; one active call.
- Peak total GPU VRAM: **11,904 / 12,282 MiB**. This is close to the card's capacity, including all other processes and allocator caches; it is not the model weight size.

The interaction phase submits a larger cohort, which explains the longer queue tail despite similar service times. Full evenings at 250/500/1000 citizens are implemented and mock-tested, but have not been claimed as completed real-GPU runs here. The local source, version and cached model snapshot were verified against the installation recorded in [setup notes](jevk5-local.md).

## Operational limits

The backend is serialized even when app concurrency is raised. Increasing concurrency can merely move waiting work into the backend and increase tail latency. Start at one. Local socket timeouts do not resubmit duplicate GPU work; an upstream computation may still be finishing after a timeout, so inspect backend health before starting another run.

The coordinator and reports are process-local, intended for a long-lived local Node server, not horizontal/serverless deployment. JSON reports survive process exit; live status does not. Restarting a process during a run can leave an incomplete last report. VRAM samples require NVIDIA's CLI to be installed on the app server host.
