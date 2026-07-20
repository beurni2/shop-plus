/**
 * WO-7.2b — THE CANON-FORM LAW for the QR's contents (Q2 ruling, ledger). The QR
 * encodes the CANON identity slug at the REAL deployed origin — never `/v/aicha`,
 * never a query form. A poster is the longest-lived link artifact in the product;
 * it never carries a divergent form (domain DEFERRED — the origin stays the
 * GitHub Pages host; nothing printed bakes a *different* domain, and the no-scan
 * fallback is the domain-independent code).
 *
 * METRO-SAFE: this module imports zero `@platform/contracts` values. The URL is a
 * FROZEN SNAPSHOT pinned in `test/qr-encoder.test.ts` to
 * `origin + base + shortCodeToSlug(shortCode)` (canon) — same derive-through-
 * snapshot law as the share hub's identity link.
 */

/** The real deployed origin + project base (Pages host; domain deferred). */
export const QR_ORIGIN = 'https://beurni2.github.io';
export const QR_BASE = '/shop-plus';

/** The canon identity URL the QR encodes — pinned to canon shortCodeToSlug in test. */
export const DEMO_QR_URL = 'https://beurni2.github.io/shop-plus/v/aicha-4821';

/**
 * The signed PRODUCT share URL — the real origin + base + the canon `/s/{slug}`
 * buyer route + `?pid={productId}` (BUG 3 fix: « the one she sends », opens THAT
 * offer on the buyer PWA). The slug is the STOREFRONT; the pid names the product.
 * Reuses the buyer's ONE `/s/{slug}?pid=` route form — no second scheme — and is
 * base-aware by construction (QR_BASE), so it lands on the Pages sub-path deploy.
 */
export function signedProductShareUrl(storeSlug: string, pid: string): string {
  return `${QR_ORIGIN}${QR_BASE}/s/${storeSlug}?pid=${pid}`;
}

/**
 * The canon-form law: an identity URL the QR may encode is the real origin + base
 * + a canon `/v/{slug}` path — never the bare `/v/{prenom}` short form, never a
 * query string. This is the gate's discriminator (a planted `/v/aicha` fails).
 */
export function isCanonIdentityUrl(url: string): boolean {
  const prefix = `${QR_ORIGIN}${QR_BASE}/v/`;
  if (!url.startsWith(prefix)) return false;
  const slug = url.slice(prefix.length);
  // canon slug: PRENOM-NNNN → prenom-nnnn (lowercase letters + a 4-digit tail),
  // never a query, never a fragment, never a bare first-name form.
  return /^[a-z]{2,12}-[0-9]{4}$/.test(slug);
}
