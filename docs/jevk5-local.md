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

This runs `jevk5-serve --model alibiserikbay/JevK5 --host 127.0.0.1 --port 8090`. The model is fetched on first start. The listener is local only; JevK5 does not require API-key authentication.

The startup script sets `JEVK5_GRAPHS=0`. Default CUDA-graph capture reached 11.8 GiB total GPU use (including the desktop) and did not reach its listen state during startup on this 12 GB card. Disabling graph capture preserves BF16 weights and the decision readout while avoiding that startup-memory spike; expect lower throughput than the upstream CUDA-graph timings.

Decision endpoint: `http://127.0.0.1:8090/v1/systemone`

Health endpoint: `http://127.0.0.1:8090/health`

## Smoke test

Start the backend in one PowerShell window, then run in another:

```powershell
& .\.venv\Scripts\python.exe .\scripts\smoke-jevk5.py
```

The smoke test sends two real typed-choice requests and checks the response envelope, option IDs, finite normalized probabilities, selected choice, server latency, and CUDA visibility.

## Astra configuration

Copy values from [`config/jevk5.env.example`](../config/jevk5.env.example) into the local application environment. `DECISION_API_KEY=local` is a compatibility placeholder only; this local backend does not authenticate requests.

## Compatibility notes

- Model loading uses BF16 and the 8.4 GB checkpoint. The RTX 4070 Ti has 12 GB; other GPU applications reduce headroom.
- JevK5's upstream server defaults to `127.0.0.1`; the startup script pins that host explicitly.
- This model supports English `noul`, `choice`, and `score` questions, up to 16 options, and refuses inputs over 16,384 tokens.
- The upstream server serializes decisions on one GPU. The `fast` extra installed successfully, but Transformers reported that `chunk_gated_delta_rule` and `causal_conv1d` use reference PyTorch kernels on this Windows setup. This affects speed, not the BF16 model or decision readout.
- Local HTTP has no authentication. Keep the listener bound to localhost.
