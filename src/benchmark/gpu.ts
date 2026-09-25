import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GpuSample } from "./metrics";
const execFileAsync = promisify(execFile);
export async function sampleGpu(elapsedMs: number): Promise<GpuSample> {
  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      [
        "--query-gpu=index,name,memory.used,memory.total",
        "--format=csv,noheader,nounits",
      ],
      { windowsHide: true, timeout: 4000 },
    );
    const devices = stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const [index, name, used, total] = line.split(",").map((s) => s.trim());
        const values = [index, used, total].map(Number);
        if (values.some((v) => !Number.isFinite(v)))
          throw new Error("Invalid nvidia-smi reading");
        return {
          index: values[0],
          name,
          usedMiB: values[1],
          totalMiB: values[2],
        };
      });
    return { elapsedMs, devices };
  } catch {
    return {
      elapsedMs,
      devices: [],
      error:
        "nvidia-smi unavailable or VRAM measurement failed; memory usage is unknown.",
    };
  }
}
