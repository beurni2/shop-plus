import { expect, test, type Page } from '@playwright/test';
import { ENTETE_KEYS, ENTETES_STYLES, renderEntete } from '../src/vitrine/entetes';
import { isLazyEntete, loadAllEntetes, loadedEnteteCss } from '../src/vitrine/entetes/registry';

/**
 * « ANTI-ORPHELIN DU SCEAU », executed — HANDOFF, Règles communes:
 *
 *   « le sceau vit dans un span white-space:nowrap avec nameLast. Le sceau ne
 *     reste jamais seul sur une ligne … S'applique aux cinq styles. »
 *
 * THE CASE THAT BROKE IT: Grenat at 320 with « Atelier Élégance-Burkina ». The
 * name filled the line exactly, and the seal — an atomic inline box appended
 * after `.vt-ent-acc` — wrapped alone onto the next line, centred under the
 * name. A U+2060 WORD JOINER between the two did not help; Chromium does not
 * carry a joiner across two atomic inline boxes. `weldSeal` puts the seal
 * INSIDE `.vt-ent-acc` instead, so it belongs to the unbreakable box.
 *
 * The assertion is geometric, not structural: the seal and the accent word must
 * share a line box. That stays true however the markup is later rearranged, and
 * it is the thing a cliente actually sees.
 */

const SF = {
  id: 'sf-s', resellerId: 'rs-s', slug: 'sceau-1',
  // 24 characters — the contract's own upper bound — with a hyphen, so the
  // accent segment (« Burkina ») is the shortest piece that can strand a seal
  name: 'Atelier Élégance-Burkina', zone: 'Secteur 30, Bobo-Dioulasso', category: 'Général',
  tagline: '', bio: '', theme: 'laterite',
  cover: { status: 'none' }, avatar: { mode: 'monogram' },
  curatedItems: [], featuredItems: [], sections: [],
  discoverable: true, createdAt: 'T', updatedAt: 'T',
};
const TRUST = { deliveredCount: 1287, rating: '4,75', reviewCount: 307, demo: false };

async function mount(page: Page, key: string): Promise<void> {
  const unit = renderEntete(key as never, SF as never, TRUST as never, {});
  await page.setContent(
    [
      '<!doctype html><html><head><meta charset="utf-8">',
      `<style>${ENTETES_STYLES}${loadedEnteteCss()}</style>`,
      "<style>html,body{margin:0;padding:0}body{background:#F4EFE6;font-family:system-ui,sans-serif}.page{padding:76px 20px 0}</style>",
      `</head><body><div class="page">${unit}</div></body></html>`,
    ].join(''),
    { waitUntil: 'load' },
  );
}

for (const width of [360, 320] as const) {
  test(`sceau @ ${width}: never stranded on a line of its own, at the 24-char bound`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await loadAllEntetes();
    const keys = ENTETE_KEYS.filter((k) => isLazyEntete(k));
    expect(keys.length, 'no lazy styles under test').toBeGreaterThanOrEqual(4);

    let welded = 0;
    for (const key of keys) {
      await mount(page, key);

      const seen = await page.evaluate(() => {
        const acc = document.querySelector('.vt-ent-acc');
        if (acc === null) return { hasAcc: false, hasSeal: false, overlap: 0 };
        // a WELDED style is one whose seal lives inside the accent box; a style
        // that carries a dedicated « Vendeuse vérifiée » line has none, and is
        // not what this rule governs
        const seal = acc.querySelector('[class$="-seal"]');
        if (seal === null) return { hasAcc: true, hasSeal: false, overlap: 0 };
        const a = acc.getBoundingClientRect();
        const s = seal.getBoundingClientRect();
        return { hasAcc: true, hasSeal: true, overlap: Math.min(a.bottom, s.bottom) - Math.max(a.top, s.top) };
      });

      expect(seen.hasAcc, `${key}: no .vt-ent-acc — the name did not go through nameTail`).toBe(true);
      if (!seen.hasSeal) continue;
      welded += 1;
      // their line boxes must overlap: same line, not merely close
      expect(seen.overlap, `${key}: the seal was stranded on its own line`).toBeGreaterThan(4);
    }

    // the guard that keeps this honest: if the seal ever stops being welded
    // into the accent box, `welded` drops and the sweep silently checks nothing
    expect(welded, 'no welded seals found — this test would pass vacuously').toBeGreaterThanOrEqual(4);
  });
}
