# Rules-v2 replacement pilot and review

Recorded 26 September 2026. The immutable source is `recordings/pilot-1000-3e-rules-v2-2026-09-26`; the derived replay is `public/recordings/pilot-1000-3e-rules-v2-2026-09-26-v2`. Both large directories remain local and ignored by Git.

## Decision

The bounded replacement pilot is complete and its acceptance evidence passes, with the VRAM limitation below. Stop here for review. This result does not authorize the fourteen-evening main recording, deployment, publication, or outreach.

The constants and seed were frozen in commit `a02da98` before inference. The run used 1,000 citizens, seed `fuzzy-city-rules-v2-pilot-001`, rules `fuzzy-city-rules/v2`, local JevK5 only, concurrency one, a 300-second request ceiling, and a two-hour elapsed hard limit. The source recorder's Git subprocess could not resolve `HEAD` and stored `head: "unknown"`; its independent source hash is `0a917d0121abba6964051679560d7b28e31ab2af25f2820b25c6c6b18a2d1f9f`. The clean pre-run repository and freeze commit were verified outside that subprocess.

The deterministic-mock satisfaction saturation was accepted only as a known limitation of the mock soak. It did not appear in this three-evening real pilot: final satisfaction had zero citizens at either boundary. This short result does not validate satisfaction over fourteen evenings and does not erase the retained failed mock gate.

## Runtime and provider evidence

| Evening | Wall time | Requests / judgments | Input tokens | Max context | Service p50 / p95 | Raw disk |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 21m 47.0s | 1,519 / 6,461 | 7,761,559 | 4,832 B | 862 / 1,499 ms | 78,444,014 B |
| 2 | 41m 59.6s | 1,559 / 6,546 | 8,593,766 | 5,386 B | 943 / 3,169 ms | 335,036,189 B |
| 3 | 37m 47.8s | 1,604 / 6,636 | 9,497,160 | 6,099 B | 1,066 / 3,846 ms | 611,417,760 B |

Total evening wall time was 1h 41m 34.5s, inside the two-hour limit. All 4,682 logical requests succeeded with one local HTTP 200 call each. There were zero retries, fallback results, provider changes, failures, or ambiguous attempts. Queue depth was zero by design. Maximum serialized context grew 26.2% from evening one to three; input tokens per evening grew 22.4%.

The provider identity was JevK5 0.2.0, `alibiserikbay/JevK5`, snapshot `27d2d6b8d4714807f6293b0623bd7370b27e42f8`, PyTorch 2.9.1+cu128, CUDA 12.8, Python 3.12.6, optimized FLA attention and Triton convolution, eager mode, graphs disabled. Four consecutive real smoke inferences passed before recording.

The automated 30-second VRAM sampler failed under its child-process permissions and recorded `peakGpuMiB: null` for all evenings. An independent in-run `nvidia-smi` observation showed 10,366 MiB used of 12,282 MiB while the GPU was at 94% utilization. That is an observed point, not a measured peak; true peak VRAM is unknown. The failed samples are retained in the three `evening-*-gpu.json` files.

## Behavioral evidence

| Final boundary | Rules v1 | Rules v2 |
|---|---:|---:|
| Energy at 0 / 1 | 0 / 140 | 9 / 0 |
| Stress at 0 / 1 | 127 / 0 | 0 / 1 |
| Social need at 0 / 1 | 0 / 46 | 0 / 0 |
| Satisfaction at 0 / 1 | 0 / 0 | 0 / 0 |

Mean money moved from €115.80 to €141.79, a €25.99 gain. Rules v1 moved from €114.42 to €286.56, a €172.14 gain. The correction removed the earlier three-day money runaway without making the real pilot a long-run calibration result.

The 987 social interactions produced 1,974 directed relationship updates: 1,214 positive (61.5%), 756 negative (38.3%), and 4 zero (0.2%). Rules v1 produced 227 positive and 1,839 negative updates out of 2,066. The centered v2 rule therefore removed the earlier 89% negative skew, while retaining both signs in real JevK5 outcomes.

| Day | Rest | Overtime | Visit friend | Cafe | Park | Explore | Diversity |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 330 | 142 | 208 | 105 | 108 | 107 | 0.941 |
| 2 | 336 | 128 | 231 | 83 | 118 | 104 | 0.928 |
| 3 | 322 | 111 | 261 | 89 | 120 | 97 | 0.924 |

No activity exceeded 33.6% on a day. Forty-six citizens repeated one activity on all three evenings and there were zero plaza capacity fallbacks. Recorded interactions were 314, 329, and 344; they involved 628, 658, and 688 unique citizens, leaving 372, 342, and 312 without a recorded interaction. There were 71 repeat encounter pairs. These are trace-backed simulation outputs, not claims about human behavior or causal effects of prior encounters.

## Replay and browser evidence

Provider-free replay consumed all 4,682 journal entries, matched committed world hash `99b6aae0e1f9fe97c7b1ec562c86a543b2b86ef0dce317fbf13f6033fd1e000c`, and reported zero outgoing inference calls. JevK5 was then stopped before production-browser replay testing.

Replay-v2 generation reconstructed and verified the canonical semantic hash of all 219 frames. The result contains 28 segments, 74 trace shards, and 19 event shards:

- generated size: 144,498,317 bytes;
- independently compressed Brotli-quality-5 total: 20,714,374 bytes;
- actual gzip response bytes to first usable city: 887,005 bytes;
- actual served bytes for one complete integrity-bound fetch: 24,425,581 bytes.

Production Chromium measurements on the local machine:

| Profile | Startup | Cold seek p50 / p95 | Warm seek p50 / p95 | Heap indicator |
|---|---:|---:|---:|---:|
| Desktop, accepted measurement | 457 ms | 179 / 332 ms | 32 / 45 ms | 64.0 MB |
| Mobile | 446 ms | 169 / 322 ms | 30 / 43 ms | 97.4 MB |

The first desktop attempt stopped before seek measurement because startup was 3,197 ms, above the provisional 3,000 ms gate. That failure is preserved; the unchanged one-time rerun produced the desktop measurements above. Both measured seek sets passed the three-second cold and one-second warm gates. These localhost results are not arbitrary-network claims.

## Comparison and limitations

Compared with the rules-v1 report, v2 took 9.96% longer overall and made 86 fewer requests. Activity diversity stayed high but was slightly lower on days two and three, and recorded contact was lower on every day. These differences combine a new seed, changed programmed state/relationship rules, and model inference; they are descriptive and do not isolate a causal contribution.

Compared with the pre-run rules-v2 mock soak, the real pilot showed both relationship-update signs and no satisfaction boundary saturation. The original mock gate remains a failed result because it included satisfaction and bidirectional mock deltas; the amended gate and this real pilot do not rewrite it.

Compared with the earlier replay-v2 package, generated size rose from 144,007,969 to 144,498,317 bytes and served complete-transfer bytes rose from 23,183,140 to 24,425,581. First-use served bytes fell from 892,583 to 887,005. The format remains lossless and within the provisional local gates, but the source recording is still 611 MB and the replay is still a large local artifact.

The observed three-evening result is not a fourteen-evening stability result. Context and latency grew, one evening took nearly twice as long as the first, VRAM peak is unknown, the first desktop startup attempt missed its gate, and satisfaction remains uncorrected. Review these limitations before proposing any further recording.

## Reproduction

```powershell
pnpm record replay recordings/pilot-1000-3e-rules-v2-2026-09-26
pnpm pilot:analyze recordings/pilot-1000-3e-rules-v2-2026-09-26
pnpm replay:bundle recordings/pilot-1000-3e-rules-v2-2026-09-26 public/recordings/pilot-1000-3e-rules-v2-2026-09-26-v2
$env:REPLAY_PILOT_RECORDING='pilot-1000-3e-rules-v2-2026-09-26-v2'
npx playwright test tests/browser/replay-pilot.spec.ts --project=chromium-desktop --project=chromium-mobile
```
