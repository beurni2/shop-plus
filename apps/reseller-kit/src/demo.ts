import { DEMO_QR_URL } from '@qr/identity';

/**
 * WO-7.2b — the demo identity (Aïcha), a FROZEN SNAPSHOT. Product name + price
 * are plain reseller data (never catalog copy); the QR URL is the canon slug at
 * the real origin, shared from `@qr/identity` (one source, pinned to
 * `isCanonIdentityUrl` in test/composeur.test.ts). The validity date is the
 * snapshot render date — a LITERAL, never `Date.now`, so a card is byte-stable
 * (the composeur is deterministic; a card ages, the link never does).
 *
 * The short code is the ASCII form the RN share hub already ships
 * (`AICHA-4821`), so the poster never carries a divergent form (Q2 ruling).
 */
export const DEMO_KIT = {
  shortCode: 'AICHA-4821',
  productName: 'Robe brodée bogolan · M',
  priceFcfa: 11_500,
  priceValidityDate: '13 juillet',
  qrUrl: DEMO_QR_URL,
} as const;
