import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { formatFcfa } from '../src/earnings';
import {
  DISPLAY_FAMILY,
  TEXT_FAMILY,
  TEXT_FAMILY_BOLD,
  DISPLAY_WEIGHTS,
  TEXT_WEIGHTS,
} from '../src/ui/faso-fonts';

/**
 * WO-FP · STEP 0 — the MONEY-RENDER / cmap guard for the RN (reseller) surface,
 * rebuilt on the new Faso Premium bytes.
 *
 * It consumes the REAL `formatFcfa` (untouched) to produce the franc figures the
 * product actually renders, decomposes them to codepoints, and asserts every one
 * — most sharply U+202F, the narrow no-break space fr-FR emits between thousands
 * — is covered by every shipped face. A font that could not draw « 11 500 F »
 * would fail here, LOUD (formatter-emits-what-font-lacks = STOP, enforced).
 *
 * The coverage list is not trusted blind: `faso-premium.coverage.json` is
 * sha256-bound to the exact committed .ttf bytes, and this test re-hashes each
 * file and refuses a manifest that does not describe the bytes on disk.
 */

const fontsDir = join(import.meta.dirname, '../assets/fonts');
const manifest = JSON.parse(
  readFileSync(join(fontsDir, 'faso-premium.coverage.json'), 'utf8'),
) as {
  flavor: string;
  faces: { file: string; family: string; weight: number; internalName: string; bytes: number; sha256: string; codepoints: number[] }[];
};

// The six shared faces this surface ships, from the DATA module (the range
// ruling: canon text.weights [400, 700] is an ENDPOINT ARRAY OF A RANGE, so
// Instrument 500/600 join the four canon faces — WO-FP STEP 0).
const declared = [
  ...Object.entries(DISPLAY_WEIGHTS).map(([w, f]) => ({ family: DISPLAY_FAMILY, weight: Number(w), file: f })),
  ...Object.entries(TEXT_WEIGHTS).map(([w, f]) => ({ family: TEXT_FAMILY, weight: Number(w), file: f })),
];

// Codepoints the money register emits — derived from the REAL formatter, not hardcoded.
const moneyCodepoints = (): Set<number> => {
  const cps = new Set<number>();
  for (const n of [500, 3000, 11500, 250000, 1500000]) {
    for (const ch of formatFcfa(n)) cps.add(ch.codePointAt(0)!);
  }
  return cps;
};

// The French charset is NOT hand-typed — it is derived from the app's OWN
// rendered copy (i18n/catalog.json). Every non-ASCII codepoint the reseller
// actually reads must be drawable, or the guard fails. This is what caught
// U+2212 (the minus in « Part Shop+ (20 %) : − {amount} »).
const catalogText = readFileSync(join(import.meta.dirname, '../i18n/catalog.json'), 'utf8');
const catalogCodepoints = new Set<number>();
for (const ch of catalogText) {
  const c = ch.codePointAt(0)!;
  if (c > 0x7f) catalogCodepoints.add(c);
}

// The reseller LOADS these three faces; the useFonts KEY (which fontFamily uses)
// MUST equal the font's internal name-table family, or RN silently paints system
// font — the device-review finding #1. This guard makes that regression LOUD.
const loaded: { file: string; key: string }[] = [
  { file: 'Bricolage-ExtraBold.ttf', key: DISPLAY_FAMILY },
  { file: 'Instrument-Regular.ttf', key: TEXT_FAMILY },
  { file: 'Instrument-Bold.ttf', key: TEXT_FAMILY_BOLD },
];
const fontsLoadSrc = readFileSync(join(import.meta.dirname, '../src/ui/fonts-load.ts'), 'utf8');

describe('Faso Premium fonts — RENDER-NAME guard (finding #1: no silent system fallback)', () => {
  it('every LOADED face internal name === its useFonts key (fontFamily resolves on device)', () => {
    for (const { file, key } of loaded) {
      const face = manifest.faces.find((f) => f.file === file)!;
      expect(face, `${file} missing from manifest`).toBeTruthy();
      expect(face.internalName, `${file}: internal '${face.internalName}' ≠ key '${key}' → RN falls back to system font`).toBe(key);
    }
  });

  it('fonts-load.ts actually loads those files under those keys (the guard matches reality)', () => {
    // DISPLAY key ← ExtraBold, TEXT key ← Regular, BOLD key ← Bold
    expect(fontsLoadSrc).toMatch(/\[DISPLAY_FAMILY\]: require\('\.\.\/\.\.\/assets\/fonts\/Bricolage-ExtraBold\.ttf'\)/);
    expect(fontsLoadSrc).toMatch(/\[TEXT_FAMILY\]: require\('\.\.\/\.\.\/assets\/fonts\/Instrument-Regular\.ttf'\)/);
    expect(fontsLoadSrc).toMatch(/\[TEXT_FAMILY_BOLD\]: require\('\.\.\/\.\.\/assets\/fonts\/Instrument-Bold\.ttf'\)/);
  });
});

describe('Faso Premium fonts — money-render / cmap guard (RN surface)', () => {
  it('ships exactly the six shared faces (display 700/800 · text 400/500/600/700 — the range ruling)', () => {
    expect(manifest.flavor).toBe('ttf');
    expect(manifest.faces).toHaveLength(6);
    const key = (x: { family: string; weight: number }) => `${x.family} ${x.weight}`;
    expect(new Set(manifest.faces.map(key))).toEqual(
      new Set([
        `${DISPLAY_FAMILY} 700`,
        `${DISPLAY_FAMILY} 800`,
        `${TEXT_FAMILY} 400`,
        `${TEXT_FAMILY} 500`,
        `${TEXT_FAMILY} 600`,
        `${TEXT_FAMILY} 700`,
      ]),
    );
  });

  it('the DATA module and the manifest describe the same six asset files', () => {
    expect(new Set(declared.map((d) => d.file))).toEqual(new Set(manifest.faces.map((f) => f.file)));
    for (const d of declared) {
      const face = manifest.faces.find((f) => f.file === d.file)!;
      expect(face.family).toBe(d.family);
      expect(face.weight).toBe(d.weight);
    }
  });

  it('the manifest sha256 binds to the exact committed .ttf bytes (no drift)', () => {
    for (const face of manifest.faces) {
      const bytes = readFileSync(join(fontsDir, face.file));
      // Real sfnt magic: 0x00010000 (TrueType) — not a stub or a wrong flavour.
      const magic = bytes.readUInt32BE(0);
      expect(magic).toBe(0x00010000);
      expect(bytes.length).toBe(face.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(face.sha256);
    }
  });

  it('the fr-FR formatter emits U+202F, and every face covers it (« 11 500 F » is drawable)', () => {
    const emitted = moneyCodepoints();
    // The formatter really does emit the narrow no-break space — the guard's premise.
    expect(emitted.has(0x202f)).toBe(true);
    expect(formatFcfa(11500)).toContain(' ');
    for (const face of manifest.faces) {
      const cover = new Set(face.codepoints);
      expect(cover.has(0x202f), `${face.file} lacks U+202F`).toBe(true);
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

  it('every non-ASCII codepoint in the reseller catalog copy is covered by every face', () => {
    const needed = [...catalogCodepoints];
    expect(needed.length).toBeGreaterThan(0);
    // The typographic minus U+2212 really is in the copy — the guard's live premise.
    expect(catalogCodepoints.has(0x2212)).toBe(true);
    for (const face of manifest.faces) {
      const cover = new Set(face.codepoints);
      const missing = needed.filter((cp) => !cover.has(cp));
      expect(missing, `${face.file} misses ${missing.map((c) => 'U+' + c.toString(16)).join(' ')}`).toEqual([]);
    }
  });
});
