import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { signedProductShareUrl, QR_ORIGIN, QR_BASE } from '../src/qr/identity.js';

/**
 * BUG 3 — the reseller's CORE LOOP, gate-locked. Partager is opened FROM a
 * product; it must send the signed PRODUCT link `/s/{slug}?pid={productId}` so the
 * buyer opens THAT offer (it used to send `/v/` with no pid, so every share opened
 * the buyer's default product). These pin the URL builder (base-aware, one canon
 * `/s/{slug}?pid=` form) and the App wiring. The o→p demo bridge (`sharePidFor`)
 * that once stood between them is retired with the mocks (PARTAGER-PRO): the
 * live screen's pid IS the productVersionId, no mapping in between.
 */

describe('the product-share URL is the canon /s/{slug}?pid= buyer route, base-aware', () => {
  it('builds the real origin + base + /s/{slug}?pid={pid}', () => {
    const url = signedProductShareUrl('aicha-4821', 'p2');
    expect(url).toBe('https://beurni2.github.io/shop-plus/s/aicha-4821?pid=p2');
    // base-aware (BUG-2 class): never off the origin root — carries the deploy base
    expect(url.startsWith(`${QR_ORIGIN}${QR_BASE}/`)).toBe(true);
    // the ONE signed-product route form: /s/{slug}?pid= (never /v/, never no-pid)
    expect(url).toMatch(/\/s\/aicha-4821\?pid=p2$/);
    expect(url).not.toContain('/v/');
  });
});

describe('the Partager screen sends the product link (App wiring)', () => {
  it('App.tsx builds the product link from HER live shop only — the demo bridge is retired (PARTAGER-PRO)', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'App.tsx'), 'utf8');
    // PARTAGER-PRO (founder, 2026-08-15: « remove all the mocks ») — the demo
    // fallback branch (`storeSlug` + `sharePidFor(shareOpp.id)`) is GONE from
    // the screen: the ONE product link is the signed live one, and the demo
    // lookup may not come back. The /s/{slug}?pid= route form itself stays
    // pinned by the builder tests above.
    expect(source).toMatch(/signedProductShareUrl\(liveShop\.slug, shareOffer\.productVersionId\)/);
    expect(source).not.toMatch(/sharePidFor|storeSlug/);
    expect(source).toMatch(/const shareOffer = offers\.find\(\(o\) => o\.productVersionId === shareId\);/);
  });
});
