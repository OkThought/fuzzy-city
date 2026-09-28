import { expect, test } from "@playwright/test";

const recording = process.env.REPLAY_PILOT_RECORDING ?? "pilot-1000-3e-local-final-v2";
const samples = 10;
const percentile = (values: number[], p: number) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
};

test("replay startup across ten cache-isolated Chromium contexts", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Startup qualification uses production desktop Chromium");
  const startupMs: number[] = [];
  for (let index = 0; index < samples; index++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`/replay?recording=${encodeURIComponent(recording)}&startup-sample=${index}`);
    await expect(page.locator("canvas")).toHaveAttribute("data-population", "1000");
    startupMs.push(await page.evaluate(() => performance.now()));
    await context.close();
  }
  const result = {
    definition: "Ten fresh browser contexts with isolated HTTP caches against one newly started local production server.",
    samples: startupMs.map((value) => Math.round(value)),
    p50: Math.round(percentile(startupMs, 0.5)),
    p95: Math.round(percentile(startupMs, 0.95)),
    max: Math.round(Math.max(...startupMs)),
  };
  console.log(`[replay-startup-qualification] ${JSON.stringify(result)}`);
  expect(result.p95).toBeLessThan(3000);
});
