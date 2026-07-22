import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fmtFCFA, groupFr } from '../src/money';

/**
 * RESELLER KIT — the money discipline, locked in the kit's own CI (verifier
 * finding, PWA-CLEANUP-1): the kit carries its own formatter (it cannot import
 * buyer-pwa code), so the kit must carry its own enforcement — the byte scan,
 * the ICU ban, and a PARITY PIN against the buyer's cliente/money.ts so the
 * two implementations can never drift apart byte-wise.
 */

const N = '\u202f'; // the only NNBSP source in this test — no raw byte in the file

const kitSrc = join(import.meta.dirname, '..', 'src');
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|css)$/.test(e.name) ? [join(dir, e.name)] : [],
  );

describe('fmt — byte-exact NNBSP, the FCFA suffix, never a bare F', () => {
  it('fmtFCFA groups thousands with U+202F and suffixes [NNBSP]FCFA', () => {
    expect(fmtFCFA(11_500)).toBe(`11${N}500${N}FCFA`);
    expect(fmtFCFA(500)).toBe(`500${N}FCFA`);
    expect(fmtFCFA(1_500_000)).toBe(`1${N}500${N}000${N}FCFA`);
    expect(groupFr(11_500)).toBe(`11${N}500`);
  });
});

describe('source discipline — zero raw U+202F, zero ICU, in the kit tree', () => {
  const files = [...walk(kitSrc), join(import.meta.dirname, '..', 'i18n', 'catalog.json')];
  for (const f of files) {
    it(`${f.slice(f.lastIndexOf('/') + 1)} carries no raw U+202F byte`, () => {
      const src = readFileSync(f, 'utf8');
      const raw = [...src].filter((c) => c.codePointAt(0) === 0x202f).length;
      expect(raw, `${f} has a raw U+202F — use the \\u202f escape / fmtFCFA`).toBe(0);
    });
  }
  it('no kit module uses ICU number formatting (Intl.NumberFormat OR toLocaleString)', () => {
    for (const f of walk(kitSrc)) {
      const src = readFileSync(f, 'utf8');
      expect(src.includes('Intl.NumberFormat('), `${f} uses Intl.NumberFormat`).toBe(false);
      expect(src.includes('.toLocaleString('), `${f} uses toLocaleString (same ICU machinery)`).toBe(false);
    }
  });
});

describe('PARITY PIN — the kit formatter is byte-identical to the buyer canon', () => {
  it('NNBSP + groupFr + fmtFCFA match cliente/money.ts source, block for block', () => {
    const kit = readFileSync(join(kitSrc, 'money.ts'), 'utf8');
    const buyer = readFileSync(
      join(import.meta.dirname, '..', '..', 'buyer-pwa', 'src', 'cliente', 'money.ts'),
      'utf8',
    );
    const block = (src: string, start: string, end: string): string => {
      const i = src.indexOf(start);
      const j = src.indexOf(end, i);
      expect(i, `missing block start: ${start}`).toBeGreaterThanOrEqual(0);
      expect(j, `missing block end: ${end}`).toBeGreaterThan(i);
      return src.slice(i, j + end.length);
    };
    expect(block(kit, "export const NNBSP = '\\u202f';", ';')).toBe(
      block(buyer, "export const NNBSP = '\\u202f';", ';'),
    );
    expect(block(kit, 'export function groupFr', 'return sign + out;\n}')).toBe(
      block(buyer, 'export function groupFr', 'return sign + out;\n}'),
    );
    expect(block(kit, 'export function fmtFCFA', '`;\n}')).toBe(block(buyer, 'export function fmtFCFA', '`;\n}'));
  });
});
