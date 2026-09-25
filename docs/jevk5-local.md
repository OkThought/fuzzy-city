# Local JevK5 backend

## Installed setup

- JevK5 `0.2.0` from the official `allebee/jevk5` `v0.2.0` tag, including the `fast` extra.
- Model: `alibiserikbay/JevK5`, Hugging Face snapshot `27d2d6b8d4714807f6293b0623bd7370b27e42f8` (BF16 weights, downloaded to the Hugging Face cache).
- Runtime: project-local `.venv`, Python 3.12, PyTorch `2.9.1+cu128`.
- GPU: NVIDIA GeForce RTX 4070 Ti; CUDA is provided by the official PyTorch CUDA 12.8 wheel and installed NVIDIA driver.

## Start

From the repository root in PowerShell:

```powershell
& .\scripts\start-jevk5.ps1
```

This runs the repository's `scripts/serve-jevk5.py` launcher on localhost port 8090, retaining the upstream TypeSafe-compatible HTTP handler. It loads only the installed snapshot `27d2d6b8d4714807f6293b0623bd7370b27e42f8` from the local Hugging Face cache; missing weights fail explicitly rather than downloading an unpinned update. JevK5 does not require API-key authentication.

The default now uses FLA attention and Triton causal convolution with BF16 weights. The missing Windows Triton dependency was the reason the installed `fast` extra did not activate attention acceleration. Install the pinned acceleration packages into the existing environment with:

```powershell
& .\.venv\Scripts\python.exe -m pip install --no-deps -r .\config\jevk5-gpu-requirements.txt
```

CUDA graphs remain disabled. Two bounded capture sizes (1536/3072) started successfully in the optimization experiment, but were slower than accelerated eager execution and changed one tested probability across 0.5. The original thirteen-size startup also exceeded the earlier memory budget. See [GPU measurements](gpu-optimization.md).

To reproduce the slower reference kernels, start with `& .\scripts\start-jevk5.ps1 -Reference`. This is an explicit rollback option, not an automatic fallback. Optimized BF16 kernels have small numerical differences: identical probabilities or identical long stochastic trajectories are not guaranteed. Prompts, weights, calibration, questions and simulation scheduling are unchanged.

Decision endpoint: `http://127.0.0.1:8090/v1/systemone`

Health endpoint: `http://127.0.0.1:8090/health`

## Smoke test

Start the backend in one PowerShell window, then run in another:

```powershell
& .\.venv\Scripts\python.exe .\scripts\smoke-jevk5.py
```

The smoke test sends two real typed-choice requests and checks the response envelope, option IDs, finite normalized probabilities, selected choice, server latency, and CUDA visibility.

## Astra configuration

Fuzzy City now defaults to the local `DecisionProvider`. No API key or placeholder is needed. Copy values from [`config/jevk5.env.example`](../config/jevk5.env.example) to `.env.local` to override defaults. Inference remains on the server side of the app.

Open `/benchmark` to run 100/250/500/1000-citizen workloads, or use `pnpm benchmark`. See [benchmark methodology](benchmark.md) for measurement definitions and full-evening runs.

## Compatibility notes

- Model loading uses BF16 and the 8.4 GB checkpoint. The RTX 4070 Ti has 12 GB; other GPU applications reduce headroom.
- JevK5's upstream server defaults to `127.0.0.1`; the startup script pins that host explicitly.
- This model supports English `noul`, `choice`, and `score` questions, up to 16 options, and refuses inputs over 16,384 tokens.
- The upstream server serializes decisions on one GPU. Increasing HTTP concurrency does not create GPU batching. The optimized launcher selects the installed FLA kernels explicitly and fails if they cannot load.
- Local HTTP has no authentication. Keep the listener bound to localhost.
