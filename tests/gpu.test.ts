import { describe, expect, it, vi } from "vitest";
import { gpuSampleFromHealth, sampleGpu } from "../src/benchmark/gpu";
import { summarize } from "../src/benchmark/metrics";

const health = {
  gpu: {
    index: 0,
    name: "Test GPU",
    usedMiB: 10366,
    totalMiB: 12282,
    processAllocatedMiB: 8021,
    processReservedMiB: 8032,
    processPeakAllocatedMiB: 9010,
    processPeakReservedMiB: 9216,
  },
};

describe("GPU telemetry", () => {
  it("labels whole-device and process-scoped JevK5 health telemetry", () => {
    const sample = gpuSampleFromHealth(123, health);
    expect(sample).toEqual({
      elapsedMs: 123,
      source: "jevk5-health",
      devices: [{ index: 0, name: "Test GPU", usedMiB: 10366, totalMiB: 12282 }],
      process: {
        allocatedMiB: 8021,
        reservedMiB: 8032,
        peakAllocatedMiB: 9010,
        peakReservedMiB: 9216,
      },
    });
    expect(summarize([], 1000, [], [sample]).vram).toMatchObject({
      scope: "whole GPU, all processes",
      available: true,
      sources: ["jevk5-health"],
      devices: [{ peakUsedMiB: 10366 }],
      process: {
        scope: "local JevK5 process, PyTorch allocator",
        peakAllocatedMiB: 9010,
        peakReservedMiB: 9216,
      },
    });
  });

  it("falls back to JevK5 health when nvidia-smi cannot spawn", async () => {
    const sample = await sampleGpu(50, {
      healthUrl: "http://127.0.0.1:8090/health",
      exec: vi.fn(async () => { throw new Error("spawn EPERM"); }),
      fetcher: vi.fn(async () => Response.json(health)),
    });
    expect(sample).toMatchObject({ source: "jevk5-health", devices: [{ usedMiB: 10366 }] });
  });

  it("reports unavailable telemetry without inventing memory", async () => {
    const sample = await sampleGpu(50, {
      healthUrl: "http://127.0.0.1:8090/health",
      exec: vi.fn(async () => { throw new Error("spawn EPERM"); }),
      fetcher: vi.fn(async () => { throw new Error("offline"); }),
    });
    expect(sample.devices).toEqual([]);
    expect(sample.error).toContain("spawn EPERM");
    expect(sample.error).toContain("offline");
  });
});
