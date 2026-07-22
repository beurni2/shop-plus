import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fmtFCFA } from '../src/cliente/money';

/**
 * WO-FP · STEP 0 — the MONEY-RENDER / cmap guard for the PWA (buyer) surface,
 * rebuilt on the new Faso Premium woff2 bytes.
 *
 * It consumes the REAL money formatter (cliente/money, untouched) — the same one every buyer
 * view uses — to produce the franc figures the product renders, decomposes them
 * to codepoints, and asserts every one (most sharply U+202F, the narrow no-break
 * space fr-FR emits between thousands) is covered by every shipped face. A woff2
 * that could not draw « 11 500 F » fails here, LOUD.
 *
 * The coverage list is sha256-bound to the exact committed woff2 bytes; this test
 * re-hashes each file and refuses a manifest that does not describe the bytes on
 * disk, and checks the 'wOF2' magic so a wrong-flavour file can never slip in.
 */

const fontsDir = join(import.meta.dirname, '../public/fonts');
const manifest = JSON.parse(
  readFileSync(join(fontsDir, 'faso-premium.coverage.json'), 'utf8'),
) as {
  flavor: string;
  faces: { file: string; family: string; weight: number; bytes: number; sha256: string; codepoints: number[] }[];
};

// The buyer money idiom is the ONE formatter (cliente/money): U+202F
// thousands + U+202F before FCFA. The guard consumes the exact shape the
// screens render, so the subset must cover the NNBSP and the FCFA letters.
const money = (n: number): string => fmtFCFA(n);

const moneyCodepoints = (): Set<number> => {
  const cps = new Set<number>();
  for (const n of [500, 3000, 11500, 250000, 1500000]) {
    for (const ch of money(n)) cps.add(ch.codePointAt(0)!);
  }
  return cps;
};

// The French charset is derived from the buyer surface's OWN rendered copy
// (i18n/catalog.json), not hand-typed — every non-ASCII codepoint the buyer
// actually reads must be drawable, or the guard fails.
const catalogText = readFileSync(join(import.meta.dirname, '../i18n/catalog.json'), 'utf8');
const catalogCodepoints = new Set<number>();
for (const ch of catalogText) {
  const c = ch.codePointAt(0)!;
  if (c > 0x7f) catalogCodepoints.add(c);
}

describe('Faso Premium fonts — money-render / cmap guard (PWA surface)', () => {
  it('ships the six shared faces as woff2 (display 700/800 · text 400/500/600/700 — the range ruling)', () => {
    expect(manifest.flavor).toBe('woff2');
    expect(manifest.faces).toHaveLength(6);
    const key = (x: { family: string; weight: number }) => `${x.family} ${x.weight}`;
    expect(new Set(manifest.faces.map(key))).toEqual(
      new Set([
        'Bricolage Grotesque 700', 'Bricolage Grotesque 800',
        'Instrument Sans 400', 'Instrument Sans 500', 'Instrument Sans 600', 'Instrument Sans 700',
      ]),
    );
    // Instrument 500 + 600 ARE present (founder ruling: [400,700] is a range endpoint).
    expect(manifest.faces.some((f) => f.family === 'Instrument Sans' && f.weight === 500)).toBe(true);
    expect(manifest.faces.some((f) => f.family === 'Instrument Sans' && f.weight === 600)).toBe(true);
  });

  it('the manifest sha256 binds to the exact committed .woff2 bytes (no drift)', () => {
    for (const face of manifest.faces) {
      const bytes = readFileSync(join(fontsDir, face.file));
      // woff2 magic 'wOF2' (0x774F4632) — a real subset woff2, right flavour.
      expect(bytes.readUInt32BE(0)).toBe(0x774f4632);
      expect(bytes.length).toBe(face.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(face.sha256);
    }
  });

  it('the total woff2 payload is under the 300 KB gate', () => {
    const total = manifest.faces.reduce((s, f) => s + f.bytes, 0);
    expect(total).toBeLessThan(300 * 1024);
    // Sanity: the measured 121.0 KB (six faces — main's re-subset four + IS 500/600),
    // not an accidental empty set.
    expect(total).toBe(123_944);
  });

  it('the fr-FR formatter emits U+202F, and every face covers it (« 11 500 F » is drawable)', () => {
    const emitted = moneyCodepoints();
    expect(emitted.has(0x202f)).toBe(true);
    for (const face of manifest.faces) {
      expect(new Set(face.codepoints).has(0x202f), `${face.file} lacks U+202F`).toBe(true);
    }
  });

  it('every codepoint the money register emits is covered by every face', () => {
    const emitted = [...moneyCodepoints()];
    for (const face of manifest.faces) {
      const cover = new Set(face.codepoints);
      const missing = emitted.filter((cp) => !cover.has(cp));
      expect(missing, `${face.file} misses ${missing.map((c) => 'U+' + c.toString(16)).join(' ')}`).toEqual([]);
    }
  });

  it('every non-ASCII codepoint in the buyer catalog copy is covered by every face', () => {
    const needed = [...catalogCodepoints];
    expect(needed.length).toBeGreaterThan(0);
    for (const face of manifest.faces) {
      const cover = new Set(face.codepoints);
      const missing = needed.filter((cp) => !cover.has(cp));
      expect(missing, `${face.file} misses ${missing.map((c) => 'U+' + c.toString(16)).join(' ')}`).toEqual([]);
    }
  });
});
