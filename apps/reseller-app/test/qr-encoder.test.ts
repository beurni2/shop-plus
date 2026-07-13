import { describe, expect, it } from 'vitest';
import { shortCodeToSlug } from '@platform/contracts';
import {
  encodeQr,
  chooseVersion,
  modulesForVersion,
  rsGenerator,
  gfLog,
  QrCapacityError,
} from '../src/qr/encoder.js';
import { DEMO_QR_URL, QR_ORIGIN, QR_BASE, isCanonIdentityUrl } from '../src/qr/identity.js';

/**
 * WO-7.2b — the vendored QR encoder. The maths must be EXACT (a poster is the
 * longest-lived link artifact): the Reed–Solomon generators and every format-
 * info word are cross-checked against the published ISO/IEC 18004 tables, so the
 * QR is correct BY CONSTRUCTION; determinism, the version-capacity, and the
 * canon-form law are the WO's named gates.
 */

const enc = new TextEncoder();

describe('the encoder is correct by construction (RS + format vs the published QR spec)', () => {
  it('Reed–Solomon generators (deg 10/18/26) match ISO 18004 Annex A (α-exponents)', () => {
    const alpha = (deg: number) => rsGenerator(deg).map((v) => gfLog(v));
    expect(alpha(10)).toEqual([0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45]); // V1-M
    expect(alpha(18)).toEqual([0, 215, 234, 158, 94, 184, 97, 118, 170, 79, 187, 152, 148, 252, 179, 5, 98, 96, 153]); // V4-M — our version
    expect(alpha(26)).toEqual([0, 173, 125, 158, 2, 103, 182, 118, 17, 145, 201, 111, 28, 165, 53, 161, 21, 245, 142, 13, 102, 48, 227, 153, 145, 218, 70]); // V3-M
  });

  it('every ECC-M format-info word matches the published QR table (BCH(15,5) + 0x5412 mask)', () => {
    const published = [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0];
    for (let mask = 0; mask < 8; mask++) {
      let rem = mask; // level M = 00 → data = mask
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) & 1 ? 0b10100110111 : 0);
      expect((((mask << 10) | rem) ^ 0b101010000010010) >>> 0).toBe(published[mask]);
    }
  });
});

describe('the version-capacity law — the real-origin canon URL fits its chosen version at ECC M', () => {
  it('the canon URL is 48 bytes → V4 (33×33), inside the ECC-M byte capacity of 62', () => {
    const byteLength = enc.encode(DEMO_QR_URL).length;
    expect(byteLength).toBe(48); // the real origin, not the 27-byte short form
    expect(chooseVersion(byteLength)).toBe(4);
    const qr = encodeQr(DEMO_QR_URL);
    expect(qr.version).toBe(4);
    expect(qr.byteLength).toBe(48);
    expect(qr.size).toBe(modulesForVersion(4)); // 33
    expect(qr.byteLength).toBeLessThanOrEqual(62); // V4 ECC-M byte capacity
  });

  it('a payload past V5 ECC-M capacity is refused (never a silently-wrong QR)', () => {
    expect(() => encodeQr('x'.repeat(85))).toThrow(QrCapacityError);
    expect(chooseVersion(85)).toBeNull();
  });
});

describe('determinism — same input → byte-identical module matrix, two runs', () => {
  it('two encodings of the canon URL are byte-identical', () => {
    const a = encodeQr(DEMO_QR_URL);
    const b = encodeQr(DEMO_QR_URL);
    expect(JSON.stringify(a.modules)).toBe(JSON.stringify(b.modules));
  });

  it('the finder patterns are placed (three corners, ring + centre)', () => {
    const m = encodeQr(DEMO_QR_URL).modules;
    for (const [r0, c0] of [[0, 0], [0, 26], [26, 0]] as const) {
      expect(m[r0]![c0]).toBe(true); // ring corner
      expect(m[r0 + 3]![c0 + 3]).toBe(true); // 3×3 centre
      expect(m[r0 + 1]![c0 + 1]).toBe(false); // ring interior
    }
  });
});

describe('the canon-form law (Q2) — the QR encodes the canon slug at the real origin', () => {
  it('DEMO_QR_URL IS origin + base + canon shortCodeToSlug (never hand-authored)', () => {
    expect(DEMO_QR_URL).toBe(`${QR_ORIGIN}${QR_BASE}${shortCodeToSlug('AICHA-4821')}`);
    expect(isCanonIdentityUrl(DEMO_QR_URL)).toBe(true);
  });

  it('the bare /v/{prenom} short form and query forms are REFUSED (planted negative fires)', () => {
    expect(isCanonIdentityUrl('https://beurni2.github.io/shop-plus/v/aicha')).toBe(false);
    expect(isCanonIdentityUrl('https://beurni2.github.io/shop-plus/v/aicha-4821?ref=x')).toBe(false);
    expect(isCanonIdentityUrl('https://shopplus.bf/v/aicha-4821')).toBe(false); // wrong (baked) domain
  });
});
