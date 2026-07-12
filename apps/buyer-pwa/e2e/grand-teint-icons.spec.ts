import { expect, test } from '@playwright/test';
import { grandTeintIcon, GRAND_TEINT_ICON_NAMES } from '../src/grand-teint-icons';

/**
 * WO-5.1 — the RENDERING proof for the inline PWA icons (verifier blocker ②:
 * the string-grep test was vacuous — it stayed green while every icon rendered
 * nothing because the generator emitted <ns0:path>). This drives the icons
 * through the repo's OWN consumption pattern (element.innerHTML = icon string,
 * exactly as checkout-view/main.ts do for the WO-4.4 lock/scooter icons) in a
 * real browser and asserts the SVG actually paints: real <path>/<circle>/<rect>
 * in the SVG namespace, with a non-zero bounding box.
 */

test('every inline icon PAINTS when injected via innerHTML (non-zero getBBox, real SVG geometry)', async ({
  page,
}) => {
  await page.goto('/'); // any built page — we inject into its DOM
  const icons = GRAND_TEINT_ICON_NAMES.map((name) => ({ name, svg: grandTeintIcon[name](20) }));
  const results = await page.evaluate((icons) => {
    const SVG = 'http://www.w3.org/2000/svg';
    return icons.map(({ name, svg }) => {
      const host = document.createElement('div');
      host.style.position = 'absolute';
      document.body.appendChild(host);
      host.innerHTML = svg; // the exact WO-4.4 consumption pattern
      const el = host.querySelector('svg');
      const drawn = el ? el.querySelectorAll('path, circle, rect').length : 0;
      // getElementsByTagNameNS only counts elements ACTUALLY in the SVG namespace
      const nsDrawn = el
        ? el.getElementsByTagNameNS(SVG, 'path').length +
          el.getElementsByTagNameNS(SVG, 'circle').length +
          el.getElementsByTagNameNS(SVG, 'rect').length
        : 0;
      let bbox = { width: 0, height: 0 };
      try {
        const g = el?.querySelector('path, circle, rect') as SVGGraphicsElement | null;
        if (g) bbox = g.getBBox();
      } catch { /* getBBox throws only if not laid out — leaves 0 */ }
      host.remove();
      return { name, drawn, nsDrawn, w: bbox.width, h: bbox.height };
    });
  }, icons);

  for (const r of results) {
    expect(r.drawn, `${r.name}: has drawing children`).toBeGreaterThan(0);
    expect(r.nsDrawn, `${r.name}: children are in the SVG namespace (not <ns0:…>)`).toBe(r.drawn);
    expect(r.w + r.h, `${r.name}: paints a non-zero box`).toBeGreaterThan(0);
  }
});
