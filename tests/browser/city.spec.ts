import { expect, test } from "@playwright/test";
test("a complete evening is visible, inspectable, editable and exportable", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-population",
    "1000",
  );
  await expect(page.getByTestId("simulation-time")).not.toHaveText("16:30");
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  const time = await page.getByTestId("simulation-time").textContent();
  await page.waitForTimeout(700);
  await expect(page.getByTestId("simulation-time")).toHaveText(time!);
  await page.screenshot({
    path: `test-results/${info.project.name}-initial.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Edit ↗", exact: true }).click();
  await page
    .getByLabel("City principle", { exact: true })
    .fill(
      "People in this city admire novelty, spontaneity and unfamiliar experiences.",
    );
  await page.getByRole("button", { name: "Apply to future decisions" }).click();
  await page.getByRole("button", { name: "Skip to evening" }).click();
  await expect(page.getByTestId("simulation-time")).toHaveText("19:00", {
    timeout: 60000,
  });
  const count = Number(
    (await page.getByTestId("judgment-count").textContent())!.replaceAll(
      ",",
      "",
    ),
  );
  expect(count).toBeGreaterThan(5000);
  // Keyboard activation selects an actual citizen represented by the Canvas.
  await page.locator("canvas").focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("WHY THIS EVENING?", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("02 / DERIVED ACTIVITY DISTRIBUTION"),
  ).toBeVisible();
  await expect(page.locator(".panel-inner")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: `test-results/${info.project.name}-inspector.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.locator(".relationship").first().click();
  await expect(page.getByText("Familiarity", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close citizen inspector" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export run" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("fuzzy-city");
  const stream = await download.createReadStream();
  let text = "";
  for await (const chunk of stream!) text += chunk.toString();
  const run = JSON.parse(text);
  expect(run.world.citizens).toHaveLength(1000);
  expect(
    run.decisionTraces.every((t: { source: string }) => t.source === "mock"),
  ).toBe(true);
  expect(run.decisionTraces[0].stateSnapshot.world.city_principle).toContain(
    "novelty",
  );
  expect(run.judgmentCount).toBe(count);
  // Click a rendered citizen at its exported world coordinate, then verify identity.
  const bounds = (await page.locator("canvas").boundingBox())!;
  const stretch = Math.max(
    1,
    Math.min(1.8, bounds.width / bounds.height / (1440 / 1080)),
  );
  const scale =
    Math.min(bounds.width / (1440 * stretch), bounds.height / 1080) * 0.94;
  const c = run.world.citizens.find(
    (
      c: { position: { x: number; y: number } },
      _: number,
      citizens: { position: { x: number; y: number } }[],
    ) =>
      citizens.every(
        (o) =>
          o === c ||
          Math.hypot(o.position.x - c.position.x, o.position.y - c.position.y) *
            scale >
            3,
      ),
  );
  expect(c).toBeTruthy();
  await page
    .locator("canvas")
    .click({
      position: {
        x:
          (bounds.width - 1440 * scale * stretch) / 2 +
          c.position.x * scale * stretch,
        y: (bounds.height - 1080 * scale) / 2 + c.position.y * scale,
      },
    });
  await expect(
    page.getByRole("heading", {
      name: `${c.firstName} ${c.lastName}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close citizen inspector" }).click();
  await page.getByRole("button", { name: "Observations", exact: true }).click();
  await expect(page.getByText("THE SOCIAL FABRIC")).toBeVisible();
  await page.getByRole("button", { name: "The city", exact: true }).click();
  await page
    .getByRole("button", { name: "Resume simulation", exact: true })
    .click();
  await expect(page.getByTestId("simulation-time")).not.toHaveText("19:00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
