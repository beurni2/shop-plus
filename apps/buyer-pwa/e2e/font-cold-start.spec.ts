import { expect, test } from '@playwright/test';

/**
 * WO-5.1 — THE COLD-START PROOF (the reason the slice exists), on the web,
 * where the sandbox CAN measure honestly. Under Go-class throttling we prove:
 *   (1) first paint is NEVER blocked by the font (font-display: optional →
 *       the fallback paints immediately; FCP does not wait for Archivo);
 *   (2) CLS = 0 across the load (optional never swaps mid-page; and the
 *       fallback is metrics-matched, so a swap would reflow nothing anyway).
 *
 * METHOD LIMITS, stated plainly: this measures a headless Chromium with CDP
 * CPU + network throttling as a STAND-IN for an Android Go phone — it is a
 * faithful proxy for the font's blocking/shift behaviour (that behaviour is
 * device-independent: it is a property of font-display + metrics), but the
 * absolute millisecond number is not a real-device figure. The real device
 * cold-start is the founder's phone. What is device-INDEPENDENT and proven
 * here: the font cannot block first paint, and cannot shift layout.
 */

test('font-display:optional never blocks first paint, and CLS = 0 across the swap (Go-class throttling)', async ({
  page,
}) => {
  const client = await page.context().newCDPSession(page);
  // Go-class: ~4x CPU slowdown + 3G-class network (1.5 Mbps / 300 ms RTT).
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.5 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 300,
  });

  await page.goto('/font-check.html', { waitUntil: 'load' });
  // let document.fonts.ready settle (or the optional window lapse)
  await page.waitForFunction(() => (window as any).__fontProbe?.done === true, null, { timeout: 15_000 });
  const probe = await page.evaluate(() => (window as any).__fontProbe);

  // (1) FCP happened and is a small number — the fallback painted; the font
  //     did not gate it. (font-display:optional guarantees this by spec; we
  //     assert FCP exists and the price text was measurable at first frame.)
  expect(probe.fcp, 'first-contentful-paint recorded').toBeGreaterThan(0);
  expect(probe.priceBox0, 'price text had a box at first paint (painted in fallback)').not.toBeNull();
  expect(probe.priceBox0.w, 'price rendered with width at first paint').toBeGreaterThan(0);

  // (2) Zero cumulative layout shift across the whole load.
  expect(probe.cls, 'cumulative layout shift is exactly 0').toBe(0);
  expect(probe.shifts, 'no layout-shift entries at all').toBe(0);

  // If Archivo did become active, the swap must not have moved the price box
  // vertically (metrics-matched fallback → same top + height).
  if (probe.archivoActive && probe.priceBox1) {
    expect(Math.abs(probe.priceBox1.top - probe.priceBox0.top), 'no vertical shift on swap').toBeLessThanOrEqual(0.5);
    expect(Math.abs(probe.priceBox1.h - probe.priceBox0.h), 'same line box height on swap').toBeLessThanOrEqual(0.5);
  }
});

test('the app renders WITHOUT the font (fallback always paints — a blank-screen font path is impossible)', async ({
  page,
}) => {
  // Block the font entirely — the harshest case (font never arrives).
  await page.route('**/archivo-latin-var.woff2', (r) => r.abort());
  await page.goto('/font-check.html', { waitUntil: 'load' });
  const priceText = await page.locator('#price').innerText();
  const box = await page.locator('#price').boundingBox();
  // Information is intact and the box is real — the fallback carried the text.
  expect(priceText).toContain('12');
  expect(priceText).toContain('500 F');
  expect(box?.width ?? 0).toBeGreaterThan(0);
  const probe = await page.evaluate(() => (window as any).__fontProbe);
  expect(probe.cls, 'no shift even when the font never loads').toBe(0);
  expect(probe.archivoActive, 'archivo genuinely absent in this run').toBe(false);
});
