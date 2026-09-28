import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GpuSample } from "./metrics";
const execFileAsync = promisify(execFile);

type GpuExec = (file: string, args: string[], options: { windowsHide: boolean; timeout: number }) => Promise<{ stdout: string }>;
interface SampleGpuOptions {
  healthUrl?: string;
  exec?: GpuExec;
  fetcher?: typeof fetch;
}

function finite(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(`Invalid ${label}`);
  return value;
}

export function gpuSampleFromHealth(elapsedMs: number, payload: unknown): GpuSample {
  const health = payload as { gpu?: Record<string, unknown> };
  if (!health?.gpu) throw new Error("JevK5 health response has no GPU telemetry");
  const gpu = health.gpu;
  return {
    elapsedMs,
    source: "jevk5-health",
    devices: [{
      index: finite(gpu.index, "GPU index"),
      name: typeof gpu.name === "string" && gpu.name ? gpu.name : "unknown",
      usedMiB: finite(gpu.usedMiB, "GPU used memory"),
      totalMiB: finite(gpu.totalMiB, "GPU total memory"),
    }],
    process: {
      allocatedMiB: finite(gpu.processAllocatedMiB, "process allocated memory"),
      reservedMiB: finite(gpu.processReservedMiB, "process reserved memory"),
      peakAllocatedMiB: finite(gpu.processPeakAllocatedMiB, "process peak allocated memory"),
      peakReservedMiB: finite(gpu.processPeakReservedMiB, "process peak reserved memory"),
    },
  };
}

export async function sampleGpu(elapsedMs: number, options: SampleGpuOptions = {}): Promise<GpuSample> {
  let primaryError = "nvidia-smi unavailable or VRAM measurement failed";
  try {
    const { stdout } = await (options.exec ?? execFileAsync as GpuExec)(
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
    return { elapsedMs, source: "nvidia-smi", devices };
  } catch (error) {
    if (error instanceof Error) primaryError = `${primaryError}: ${error.message}`;
  }
  if (options.healthUrl) {
    try {
      const response = await (options.fetcher ?? fetch)(options.healthUrl, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return gpuSampleFromHealth(elapsedMs, await response.json());
    } catch (error) {
      const fallback = error instanceof Error ? error.message : String(error);
      primaryError = `${primaryError}; JevK5 health fallback failed: ${fallback}`;
    }
  }
  return {
    elapsedMs,
    devices: [],
    error: `${primaryError}; memory usage is unknown.`,
  };
}
