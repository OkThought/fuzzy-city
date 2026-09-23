import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3002');
  await page.locator('canvas').waitFor();
  await page.getByRole('button', { name: '4×', exact: true }).click();
  const timings = await page.evaluate(async () => {
    const intervals = [];
    let previous = await new Promise(requestAnimationFrame);
    for (let i = 0; i < 240; i++) {
      const time = await new Promise(requestAnimationFrame);
      intervals.push(time - previous);
      previous = time;
    }
    intervals.sort((a, b) => a - b);
    return { frames: intervals.length, meanFrameMs: intervals.reduce((a, b) => a + b) / intervals.length, p95FrameMs: intervals[Math.floor(intervals.length * 0.95)] };
  });
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await page.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Run saved' }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: /Resume saved day/ }).click();
  await page.getByRole('button', { name: 'Resume simulation', exact: true }).waitFor();
  const report = { browser: await browser.version(), viewport: '1440x900', speed: '4x', population: await page.locator('canvas').getAttribute('data-population'), timings, errors, checkpointRestore: true };
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/production-smoke.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || report.population !== '1000') process.exitCode = 1;
} finally { await browser.close(); }
