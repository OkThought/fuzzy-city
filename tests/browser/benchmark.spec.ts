import { test, expect } from "@playwright/test";
test("benchmark runs a measured opening window and exports a truthful mock report", async ({
  page,
}, info) => {
  await page.goto("/benchmark");
  await expect(
    page.getByText("MOCK · NOT AN INFERENCE BENCHMARK"),
  ).toBeVisible();
  await page.getByLabel("Population", { exact: true }).selectOption("100");
  await page.getByRole("button", { name: "Run benchmark" }).click();
  await expect(page.locator(".benchmark-live .section-title")).toContainText(
    "complete",
    { timeout: 30000 },
  );
  await expect(
    page.getByText("12 completed evaluations", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".benchmark-table tbody")).toContainText(
    "100 / 12",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download summary" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let text = "";
  for await (const chunk of stream!) text += chunk.toString();
  const report = JSON.parse(text);
  expect(report.provider).toBe("mock");
  expect(report.config.populations).toEqual([100]);
  expect(report.cases[0].summary.completedDecisions).toBe(12);
  expect(report.cases[0].summary.judgments).toBe(60);
  expect(report.cases[0].summary.apiCalls).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-benchmark.png`,
    fullPage: true,
  });
});
