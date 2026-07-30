import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fmtFCFA } from '../src/cliente/money';

/**
 * ENTETES-E — the cmap guard for the two Beurni Boss display faces (Barlow
 * Condensed 800 · Sora 800), the exact shape of the faso-fonts guard: the
 * manifest sha256-binds the committed woff2 bytes, and every face must cover
 * the same charset law as the six shared faces — every codepoint the money
 * register emits AND every non-ASCII codepoint of the buyer catalog. These
 * faces draw names, never money, but one uniform charset law means no face
 * can ever be the reason a franc figure or a French accent fails to draw.
 */

const fontsDir = join(import.meta.dirname, '../public/fonts');
const manifest = JSON.parse(
  readFileSync(join(fontsDir, 'entetes.coverage.json'), 'utf8'),
) as {
  flavor: string;
  faces: { file: string; family: string; weight: number; bytes: number; sha256: string; codepoints: number[] }[];
};

const moneyCodepoints = (): Set<number> => {
  const cps = new Set<number>();
  for (const n of [500, 3000, 11500, 250000, 1500000]) {
    for (const ch of fmtFCFA(n)) cps.add(ch.codePointAt(0)!);
  }
  return cps;
};

const catalogText = readFileSync(join(import.meta.dirname, '../i18n/catalog.json'), 'utf8');
const catalogCodepoints = new Set<number>();
for (const ch of catalogText) {
  const c = ch.codePointAt(0)!;
  if (c > 0x7f) catalogCodepoints.add(c);
}

describe('ENTETES-E fonts — the two display faces, sha-bound and charset-complete', () => {
  it('ships exactly Barlow Condensed 800 and Sora 800 as woff2', () => {
    expect(manifest.flavor).toBe('woff2');
    const key = (x: { family: string; weight: number }) => `${x.family} ${x.weight}`;
    expect(new Set(manifest.faces.map(key))).toEqual(new Set(['Barlow Condensed 800', 'Sora 800']));
  });

  it('the manifest sha256 binds to the exact committed .woff2 bytes (no drift)', () => {
    for (const face of manifest.faces) {
      const bytes = readFileSync(join(fontsDir, face.file));
      expect(bytes.readUInt32BE(0)).toBe(0x774f4632); // 'wOF2'
      expect(bytes.length).toBe(face.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(face.sha256);
    }
  });

  it('the pair stays a small payload rider (the 300 KB gate measures the real dist)', () => {
    const total = manifest.faces.reduce((s, f) => s + f.bytes, 0);
    expect(total).toBeLessThan(30 * 1024);
    expect(total).toBeGreaterThan(10 * 1024); // not an accidental empty subset
  });

  it('every codepoint the money register emits is covered by both faces (U+202F included)', () => {
    const emitted = [...moneyCodepoints()];
    expect(emitted).toContain(0x202f);
    for (const face of manifest.faces) {
      const cover = new Set(face.codepoints);
      const missing = emitted.filter((cp) => !cover.has(cp));
      expect(missing, `${face.file} misses ${missing.map((c) => 'U+' + c.toString(16)).join(' ')}`).toEqual([]);
    }
  });

  it('every non-ASCII codepoint of the buyer catalog is covered by both faces', () => {
    const needed = [...catalogCodepoints];
    expect(needed.length).toBeGreaterThan(0);
    for (const face of manifest.faces) {
      const cover = new Set(face.codepoints);
      const missing = needed.filter((cp) => !cover.has(cp));
      expect(missing, `${face.file} misses ${missing.map((c) => 'U+' + c.toString(16)).join(' ')}`).toEqual([]);
    }
  });
});
