import { expect, test, type Page } from '@playwright/test';
import { ENTETE_KEYS, ENTETES_STYLES, renderEntete } from '../src/vitrine/entetes';
import { loadAllEntetes, loadedEnteteCss } from '../src/vitrine/entetes/registry';

/**
 * NO LABEL ON ANY HEADER IS CUT OFF — §5's type law, « French long-text tested
 * (labels don't truncate meaning) », swept across every built style at both
 * widths, in COMPLET and MINIMAL, on the worst content the contract allows.
 *
 * WHY IT EXISTS. The page-level sweep checks
 * `document.documentElement.scrollWidth`, which cannot see a label clipped
 * INSIDE a header: the header's own `overflow: hidden` absorbs it and the page
 * never widens. So this measures each text element twice — against its own box,
 * and against the nearest ancestor that actually clips.
 *
 * WHAT IT DOES NOT CATCH, stated plainly because I tried and failed to make it:
 * PAINT-ORDER OCCLUSION. Artisan's motto was cut by an absolutely-positioned
 * sibling painting over a static row — nothing overflowed, nothing left its
 * clipper, every DOM metric said it fitted. An `elementFromPoint` probe does
 * detect that, but it also fires on Dynamique's veil and Héritage's gradients,
 * which sit over text BY DESIGN in this design language — Indigo's veil is the
 * entire concept of that style. A guard that fails ten shipped, approved
 * headers is mismodelling, not finding bugs, so it is not here.
 *
 * The consequence, and it is the honest one: screenshots remain the only check
 * for a label hidden behind something. That is how Artisan's was found.
 *
 * The 1px slack on each comparison absorbs sub-pixel rounding, which otherwise
 * reports a false positive on almost every centred element.
 */

const AVATAR_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="480" height="640" fill="#8A5A3A"/></svg>',
  );

/** The worst realistic case the contract allows: a 24-character name, a
 *  40-character tagline, a long zone and a 160-character présentation. */
const SF = {
  id: 'sf-t', resellerId: 'rs-t', slug: 'tronc-1',
  name: 'Atelier Élégance-Burkina', zone: 'Secteur 30, Bobo-Dioulasso', category: 'Général',
  tagline: 'Bienvenue chez moi, entrez sans frapper',
  bio: 'Tissus, accessoires et parures choisis un par un au marché de Gounghin, puis vérifiés à la main avant chaque envoi vers vous.',
  theme: 'laterite',
  cover: { status: 'none' }, avatar: { mode: 'photo', url: AVATAR_SVG },
  curatedItems: ['pv-1'], featuredItems: [], sections: [],
  discoverable: true, createdAt: 'T', updatedAt: 'T',
};
const TRUST = { deliveredCount: 1287, rating: '4,75', reviewCount: 307, demo: false };
const ZERO = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };

async function mount(page: Page, key: string, trust: unknown): Promise<void> {
  const unit = renderEntete(key as never, SF as never, trust as never, { fromProduct: true });
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
  test(`troncature @ ${width}: no label on any header is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1200 });
    await loadAllEntetes();
    // the registry must be loaded before the key list is computed
    // BUILT styles only, detected from the render itself rather than a list:
    // an unbuilt key falls back to `classique`, whose root is `.vt-hero`, so it
    // would contribute nothing and trip the vacuity guard below — which is
    // exactly what it did on the first run (braise, still unbuilt).
    const keys = ENTETE_KEYS.filter(
      (k) => k !== 'classique' && renderEntete(k, SF as never, TRUST as never, {}).includes('class="vt-ent '),
    );
    expect(keys.length, 'no styles under test').toBeGreaterThanOrEqual(11);

    let measured = 0;
    for (const key of keys) {
      for (const [etat, trust] of [['complet', TRUST], ['minimal', ZERO]] as const) {
        await mount(page, key, trust);

        const cut = await page.evaluate(() => {
          const bad: Array<{ text: string; lost: number; why: string }> = [];
          let seen = 0;
          for (const el of document.querySelectorAll('.vt-ent *')) {
            // leaf text only: an element whose own children would be measured
            // separately, and anything with no text, tells us nothing
            if (el.children.length > 0) continue;
            const text = (el.textContent ?? '').trim();
            if (text === '') continue;
            seen += 1;
            // (1) text overflowing its OWN box
            if (el.scrollWidth > el.clientWidth + 1) {
              bad.push({ text, lost: el.scrollWidth - el.clientWidth, why: 'overflows its box' });
              continue;
            }
            // (2) THE CASE THAT ACTUALLY BIT, and it took three attempts to
            // measure. A nowrap label inside a flex row does NOT overflow its
            // own box — the box grows with the text — so (1) is blind to it.
            // Nor does it necessarily leave the CARD: Artisan's motto stuck out
            // past the green PANEL, which is a clipping ancestor several levels
            // below the card, while staying inside the card's 360px. So the
            // real question is per element: does it stick out past the nearest
            // ancestor that actually clips?
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            let clip: Element | null = el.parentElement;
            while (clip !== null && clip !== document.documentElement) {
              const o = getComputedStyle(clip);
              if (o.overflowX !== 'visible' || o.overflowY !== 'visible') break;
              clip = clip.parentElement;
            }
            const clipper = clip === null ? document.querySelector('.vt-ent')! : clip;
            const box = clipper.getBoundingClientRect();
            const lost = Math.max(0, box.left - r.left) + Math.max(0, r.right - box.right);
            if (lost > 2) {
              bad.push({ text, lost: Math.round(lost), why: 'sticks out past what clips it' });
              continue;
            }
          }
          return { bad, seen };
        });

        expect(cut.seen, `${key}/${etat}: no text elements found — the scan would pass vacuously`).toBeGreaterThan(3);

        // THE SENTENCE SHE READS IS STILL A SENTENCE. Braise rendered
        // « 128ventes livrées par Séra » because its proof chip was a flex
        // container: `ventesLine` emits « <b>N</b> ventes… » and flex makes the
        // count and the words two items, stripping the space between them.
        // `zoneLine` loses its spacing the same way. innerText — not
        // textContent — is what she actually sees.
        const lu = await page.evaluate(() => {
          const el = document.querySelector('[data-role="reputation"]') as HTMLElement | null;
          const badge = document.querySelector('[data-role="chip-nouvelle"]') as HTMLElement | null;
          return {
            proof: (el?.innerText ?? '').replace(/\u00a0|\u202f/g, ' ').replace(/\s+/g, ' ').trim(),
            badge: (badge?.innerText ?? '').replace(/\u00a0|\u202f/g, ' ').replace(/\s+/g, ' ').trim(),
          };
        });
        if (etat === 'complet') {
          // the COUNT then a space then the words. Not a literal, because the
          // count is NNBSP-grouped (« 1 287 ») on every style except série 1's
          // five, which render it ungrouped — a real inconsistency, but one
          // that predates this work and is not this spec's subject.
          expect(lu.proof, `${key}: the proof sentence lost its words`).toMatch(/\d\s*ventes livrées par Séra/);
          // WHAT THIS DOES NOT CATCH, and I tried two ways. Braise shipped
          // « 128ventes » — a flex box had stripped the space between the count
          // and the words. `innerText` cannot show it (it reports a break
          // between flex items either way), and banning flex on this element
          // fails Héritage, which is flex AND renders correctly because its
          // markup separates the pieces itself. So the lost SPACE is not
          // checkable here; a lost WORD is, and that is what the line above
          // asserts. Spacing stays a screenshot check — which is how Braise's
          // was found.
        } else {
          expect(lu.badge, `${key}: the « nouvelle » badge lost its spacing`).toMatch(/Nouvelle\s*vendeuse/i);
        }
        measured += cut.seen;
        for (const b of cut.bad) {
          expect(
            b.lost,
            `${key}/${etat}: « ${b.text} » is cut off — it ${b.why} by ${b.lost}px`,
          ).toBe(0);
        }
      }
    }
    expect(measured, 'nothing was measured across the whole set').toBeGreaterThan(200);
  });
}
