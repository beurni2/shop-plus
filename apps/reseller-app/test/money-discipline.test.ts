import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fmtFCFA, groupFr } from '../src/money';

/**
 * RESELLER-APP — the money discipline, locked in the app's own CI
 * (RESELLER-APP-MONEY): the reseller-app carries its own formatter (its own
 * Expo deployable, it cannot import buyer-pwa / reseller-kit code), so it must
 * carry its own enforcement — the raw-byte scan, the ICU ban (Intl.NumberFormat
 * AND toLocaleString), a catalog bare-« F » guard, and a PARITY PIN against the
 * buyer's cliente/money.ts so the two implementations can never drift byte-wise.
 */

const N = '\u202f'; // the only NNBSP source in this test — no raw byte in the file

const appDir = join(import.meta.dirname, '..');
const srcDir = join(appDir, 'src');
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx|css)$/.test(e.name) ? [join(dir, e.name)] : [],
  );

describe('fmt — byte-exact NNBSP, the FCFA suffix, never a bare F', () => {
  it('fmtFCFA groups thousands with U+202F and suffixes [NNBSP]FCFA', () => {
    expect(fmtFCFA(11_500)).toBe(`11${N}500${N}FCFA`);
    expect(fmtFCFA(500)).toBe(`500${N}FCFA`);
    expect(fmtFCFA(2_000)).toBe(`2${N}000${N}FCFA`); // the earnings.test pin, via the shared engine
    expect(fmtFCFA(1_500_000)).toBe(`1${N}500${N}000${N}FCFA`);
    expect(groupFr(11_500)).toBe(`11${N}500`);
  });
});

describe('source discipline — zero raw U+202F, zero ICU, in the reseller-app tree', () => {
  const files = [...walk(srcDir), join(appDir, 'i18n', 'catalog.json')];
  for (const f of files) {
    it(`${f.slice(f.lastIndexOf('/') + 1)} carries no raw U+202F byte`, () => {
      const src = readFileSync(f, 'utf8');
      const raw = [...src].filter((c) => c.codePointAt(0) === 0x202f).length;
      expect(raw, `${f} has a raw U+202F — use the \\u202f escape / fmtFCFA`).toBe(0);
    });
  }
  it('no reseller-app module uses ICU number formatting (Intl.NumberFormat OR toLocaleString)', () => {
    for (const f of walk(srcDir)) {
      const src = readFileSync(f, 'utf8');
      expect(src.includes('Intl.NumberFormat('), `${f} uses Intl.NumberFormat`).toBe(false);
      expect(src.includes('.toLocaleString('), `${f} uses toLocaleString (same ICU machinery)`).toBe(false);
    }
  });
});

describe('the catalog carries no bare « F » money string — every franc is [NNBSP]FCFA', () => {
  it('no catalog value ends a number with a bare F (must be FCFA)', () => {
    const catalog = JSON.parse(readFileSync(join(appDir, 'i18n', 'catalog.json'), 'utf8')) as Array<{
      key: string;
      fr: string;
    }>;
    const bareF = /\d[\u202f\u0020\u00a0]?F(?![A-Za-z])/;
    const offenders = catalog.filter((e) => bareF.test(e.fr)).map((e) => e.key);
    expect(offenders, `bare « F » — use « FCFA »: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('PARITY PIN — the reseller-app formatter is byte-identical to the buyer canon', () => {
  it('NNBSP + groupFr + fmtFCFA match cliente/money.ts source, block for block', () => {
    const app = readFileSync(join(srcDir, 'money.ts'), 'utf8');
    const buyer = readFileSync(
      join(appDir, '..', 'buyer-pwa', 'src', 'cliente', 'money.ts'),
      'utf8',
    );
    const block = (src: string, start: string, end: string): string => {
      const i = src.indexOf(start);
      const j = src.indexOf(end, i);
      expect(i, `missing block start: ${start}`).toBeGreaterThanOrEqual(0);
      expect(j, `missing block end: ${end}`).toBeGreaterThan(i);
      return src.slice(i, j + end.length);
    };
    expect(block(app, "export const NNBSP = '\\u202f';", ';')).toBe(
      block(buyer, "export const NNBSP = '\\u202f';", ';'),
    );
    expect(block(app, 'export function groupFr', 'return sign + out;\n}')).toBe(
      block(buyer, 'export function groupFr', 'return sign + out;\n}'),
    );
    expect(block(app, 'export function fmtFCFA', '`;\n}')).toBe(block(buyer, 'export function fmtFCFA', '`;\n}'));
  });
});
