import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sharePidFor, SHARE_PID_BY_OPP } from '../src/demo/store.js';
import { signedProductShareUrl, QR_ORIGIN, QR_BASE } from '../src/qr/identity.js';

/**
 * BUG 3 — the reseller's CORE LOOP, gate-locked. Partager is opened FROM a
 * product; it must send the signed PRODUCT link `/s/{slug}?pid={productId}` so the
 * buyer opens THAT offer (it used to send `/v/` with no pid, so every share opened
 * the buyer's default product). These pin: the opportunity→product bridge, the URL
 * builder (base-aware, one canon `/s/{slug}?pid=` form), and the App wiring.
 */

describe('the shared product carries its pid (opportunity → buyer storefront bridge)', () => {
  it('every shareable opportunity maps to a buyer storefront pid', () => {
    // the seven demo opportunities each resolve to a p-form storefront pid
    for (const id of ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7']) {
      expect(sharePidFor(id)).toMatch(/^(p[0-9]+|k[0-9]+)$/);
    }
    // the exact semantic match is pinned (o5 « Chemise Faso Dan Fani » → p8), plus
    // the anchors the buyer e2e opens
    expect(sharePidFor('o5')).toBe('p8'); // exact-name twin
    expect(sharePidFor('o1')).toBe('p2'); // Pagne wax → Pagne wax 6 yards
    expect(sharePidFor('o7')).toBe('p4'); // Sandales → Sandales cuir homme
    expect(sharePidFor('o3')).toBe('p3'); // Sac → Sac cuir artisanal (out of stock)
    expect(SHARE_PID_BY_OPP).toEqual({ o1: 'p2', o2: 'p5', o3: 'p3', o4: 'p7', o5: 'p8', o6: 'k1', o7: 'p4' });
  });

  it('an unmapped id falls back to a real storefront pid (never empty)', () => {
    expect(sharePidFor('zzz')).toBe('p1');
    expect(sharePidFor('zzz')).not.toBe('');
  });
});

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
  it('App.tsx builds shareUrl from signedProductShareUrl(storeSlug, sharePidFor(shareOpp.id))', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'App.tsx'), 'utf8');
    // the storefront slug is derived from the seam's /v/ slug, then the signed
    // PRODUCT url is built with the shared product's pid
    expect(source).toMatch(/signedProductShareUrl\(storeSlug, sharePidFor\(shareOpp\.id\)\)/);
    expect(source).toMatch(/shareUrl = shareOpp/); // product link when a product is shared
  });
});
