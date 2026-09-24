"""Call the local JevK5 TypeSafe-compatible endpoint and validate real decisions."""

from __future__ import annotations

import json
import math
import subprocess
import time
import urllib.error
import urllib.request


BASE_URL = "http://127.0.0.1:8090"
MODEL = "alibiserikbay/JevK5"
REQUEST = {
    "model": MODEL,
    "state": "Order #7120 was delivered to No. 17; the customer lives at No. 71.",
    "questions": {
        "delivery": {
            "type": "choice",
            "instructions": "What most likely happened to the parcel?",
            "criteria": {
                "delivered": "Delivered to the customer's address",
                "misdelivered": "Delivered to a different address",
                "unknown": "The evidence does not establish what happened",
            },
        }
    },
}


def get_health() -> dict:
    with urllib.request.urlopen(f"{BASE_URL}/health", timeout=5) as response:
        if response.status != 200:
            raise RuntimeError(f"Health endpoint returned HTTP {response.status}")
        payload = json.loads(response.read())
    if payload.get("ok") is not True or payload.get("model") != MODEL:
        raise RuntimeError(f"Unexpected health response: {payload!r}")
    return payload


def decide() -> tuple[dict, float]:
    body = json.dumps(REQUEST).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/v1/systemone",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started = time.perf_counter()
    with urllib.request.urlopen(req, timeout=180) as response:
        elapsed_ms = (time.perf_counter() - started) * 1000
        if response.status != 200:
            raise RuntimeError(f"Decision endpoint returned HTTP {response.status}")
        payload = json.loads(response.read())
    validate(payload)
    return payload, elapsed_ms


def validate(payload: dict) -> None:
    if not isinstance(payload, dict):
        raise RuntimeError(f"Expected a JSON object, received {type(payload).__name__}")
    answer = payload.get("answers", {}).get("delivery")
    if payload.get("model") != MODEL or not isinstance(answer, dict):
        raise RuntimeError(f"Malformed top-level response: {payload!r}")
    if answer.get("type") != "choice" or answer.get("choice") not in REQUEST["questions"]["delivery"]["criteria"]:
        raise RuntimeError(f"Malformed choice answer: {answer!r}")
    if not isinstance(answer.get("confidence"), (int, float)) or not 0 <= answer["confidence"] <= 1:
        raise RuntimeError(f"Invalid confidence: {answer!r}")
    probabilities = answer.get("probabilities")
    expected = set(REQUEST["questions"]["delivery"]["criteria"])
    if not isinstance(probabilities, dict) or set(probabilities) != expected:
        raise RuntimeError(f"Invalid probability keys: {answer!r}")
    values = list(probabilities.values())
    if any(not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1 for value in values):
        raise RuntimeError(f"Invalid probability values: {answer!r}")
    if not math.isclose(sum(values), 1.0, rel_tol=1e-5, abs_tol=1e-5):
        raise RuntimeError(f"Probabilities do not sum to 1: {answer!r}")
    if answer["choice"] != max(probabilities, key=probabilities.get) or not math.isclose(
        answer["confidence"], max(values), rel_tol=1e-5, abs_tol=1e-5
    ):
        raise RuntimeError(f"Choice/confidence do not match probabilities: {answer!r}")
    if not isinstance(payload.get("latency_ms"), (int, float)) or not math.isfinite(payload["latency_ms"]):
        raise RuntimeError(f"Invalid server latency: {payload!r}")


def main() -> int:
    try:
        health = get_health()
        results = [decide() for _ in range(2)]
        import torch

        if not torch.cuda.is_available():
            raise RuntimeError("PyTorch cannot see CUDA in the project environment")
        print(f"backend reachable: {BASE_URL} ({health['model']})")
        for index, (payload, elapsed_ms) in enumerate(results, start=1):
            answer = payload["answers"]["delivery"]
            probs = ", ".join(f"{key}={value:.3f}" for key, value in answer["probabilities"].items())
            print(f"model response {index}: valid; choice={answer['choice']}; probabilities {probs}")
            print(f"request {index} latency: {elapsed_ms:.1f} ms (server {payload['latency_ms']:.1f} ms)")
        props = torch.cuda.get_device_properties(0)
        print(f"GPU: {props.name}; CUDA {torch.version.cuda}; VRAM {props.total_memory // (1024**2)} MiB")
        try:
            usage = subprocess.run(
                ["nvidia-smi", "--query-gpu=memory.used,memory.total", "--format=csv,noheader,nounits"],
                capture_output=True,
                check=True,
                text=True,
                timeout=5,
            ).stdout.strip().splitlines()[0]
            used_mib, total_mib = (int(value.strip()) for value in usage.split(","))
            print(f"GPU memory in use: {used_mib}/{total_mib} MiB (all processes)")
        except (OSError, subprocess.SubprocessError, ValueError, IndexError):
            pass
        return 0
    except (OSError, urllib.error.URLError, json.JSONDecodeError, RuntimeError, KeyError) as error:
        print(f"JevK5 smoke test failed: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
