import { expect, test } from "@playwright/test";

test("recorded Jev replay loads incrementally, seeks, and exposes trace evidence", async ({ page }) => {
  const replayAssets: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/recordings/milestone-one-jevk5/")) replayAssets.push(request.url());
  });
  await page.goto("/replay");
  await expect(page.getByText("Recorded Jev simulation · interactive replay", { exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveAttribute("data-population", "100");
  const startupMs = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "Pause replay" }).click();
  expect(replayAssets.some((url) => url.includes("minute-1065"))).toBe(false);
  expect(startupMs).toBeLessThan(3000);

  await page.getByRole("button", { name: "4×", exact: true }).click();
  await page.getByRole("button", { name: "Play replay" }).click();
  await expect(page.getByTestId("replay-time")).not.toHaveText("16:30");
  await page.getByRole("button", { name: "Pause replay" }).click();

  const seekStarted = Date.now();
  await page.getByLabel("Replay timeline").fill("5");
  await expect(page.getByTestId("replay-time")).toHaveText("17:45");
  const coldSeekMs = Date.now() - seekStarted;
  expect(coldSeekMs).toBeLessThan(2000);
  await page.locator(".event-stream button").first().click();
  await expect(page.getByText("MODEL OUTPUT · STORED PROBABILITIES", { exact: true })).toBeVisible();
  await expect(page.getByText("CODE-DERIVED RESOLUTION", { exact: true })).toBeVisible();
  await expect(page.getByText("EDITORIAL NARRATION", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close event inspector" }).click();
  await page.locator("canvas").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/FOLLOWING ·/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  console.log(`[replay-metrics] startup=${Math.round(startupMs)}ms cold-seek=${coldSeekMs}ms`);
  test.info().annotations.push({ type: "measurement", description: `startup=${startupMs}ms cold-seek=${coldSeekMs}ms` });
});
