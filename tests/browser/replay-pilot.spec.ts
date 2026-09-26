import { expect, test } from "@playwright/test";

const percentile = (values: number[], p: number) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
};

test("full pilot keeps cold and warm replay-v2 seeks bounded", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("chromium"), "Pilot timing is sampled on Chromium desktop/mobile");
  const assetResponses: { url: string; encoding: string | null; bytes: number }[] = [];
  page.on("response", (response) => {
    if (!response.url().includes("pilot-1000-3e-local-final-v2")) return;
    void response.finished().then(async () => {
      const sizes = await response.request().sizes();
      assetResponses.push({
        url: response.url(),
        encoding: await response.headerValue("content-encoding"),
        bytes: sizes.responseBodySize,
      });
    });
  });
  await page.goto("/replay?recording=pilot-1000-3e-local-final-v2");
  await expect(page.locator("canvas")).toHaveAttribute("data-population", "1000");
  const startupMs = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "Pause replay" }).click();
  expect(startupMs).toBeLessThan(3000);
  await page.waitForTimeout(50);
  const firstUseBytes = assetResponses.reduce((sum, item) => sum + item.bytes, 0);
  expect(firstUseBytes).toBeLessThan(1024 * 1024);

  const scrubber = page.getByLabel("Replay timeline");
  const targets = [8, 40, 72, 104, 136, 168, 200, 218];
  const seek = async (target: number) => {
    const started = performance.now();
    await scrubber.fill(String(target));
    await expect(page.locator(".chunk-loading")).toBeHidden();
    return performance.now() - started;
  };
  const cold: number[] = [];
  for (const target of targets) cold.push(await seek(target));
  const warm: number[] = [];
  for (const target of targets.slice().reverse()) warm.push(await seek(target));
  const coldP50 = percentile(cold, 0.5);
  const coldP95 = percentile(cold, 0.95);
  const warmP50 = percentile(warm, 0.5);
  const warmP95 = percentile(warm, 0.95);
  expect(coldP95).toBeLessThan(3000);
  expect(warmP95).toBeLessThan(1000);
  const workingSetBytes = await page.evaluate(
    () => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
  );
  const fullTransferStart = assetResponses.length;
  let fullTransferBytes: number | null = null;
  if (testInfo.project.name === "chromium-desktop") {
    const assets = await page.evaluate(async () => {
      const index = await fetch("/recordings/pilot-1000-3e-local-final-v2/index.json").then((response) => response.json());
      return [
        "/recordings/pilot-1000-3e-local-final-v2/index.json",
        ...index.segments.map((asset: { url: string }) => asset.url),
        index.traceCatalog.url,
        ...index.traceShards.map((asset: { url: string }) => asset.url),
        ...index.eventShards.map((asset: { url: string }) => asset.url),
      ] as string[];
    });
    await page.evaluate(async (urls) => {
      for (const [index, url] of urls.entries()) {
        const response = await fetch(`${url}?transfer-measure=${index}`, { cache: "reload" });
        if (!response.ok) throw new Error(`Measurement fetch failed: ${response.status}`);
        await response.arrayBuffer();
      }
    }, assets);
    await page.waitForTimeout(100);
    fullTransferBytes = assetResponses
      .slice(fullTransferStart)
      .reduce((sum, item) => sum + item.bytes, 0);
    expect(fullTransferBytes).toBeLessThan(100 * 1024 * 1024);
    testInfo.annotations.push({ type: "full-transfer-bytes", description: String(fullTransferBytes) });
  }
  console.log(
    `[pilot-replay-metrics] profile=${testInfo.project.name} startup=${Math.round(startupMs)}ms first-use-bytes=${firstUseBytes} cold-p50=${Math.round(coldP50)}ms cold-p95=${Math.round(coldP95)}ms warm-p50=${Math.round(warmP50)}ms warm-p95=${Math.round(warmP95)}ms working-set-bytes=${workingSetBytes ?? "unknown"} full-transfer-bytes=${fullTransferBytes ?? "not-measured"} encodings=${JSON.stringify([...new Set(assetResponses.map((item) => item.encoding ?? "identity"))])}`,
  );
});
