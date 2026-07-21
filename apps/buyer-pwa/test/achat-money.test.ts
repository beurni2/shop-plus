import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fmtFCFA, fmtHeure, groupFr } from '../src/achat/money';
import {
  renderS1, renderS2, renderS3, renderS4, renderS5, renderS6, renderS7,
  type AchatProduit,
} from '../src/achat/screens';

/**
 * PARCOURS D'ACHAT — the money-bytes discipline (§3, §0 loi 4) + loi 1.
 *
 * These lock the non-negotiable: every amount carries U+202F between thousands
 * AND before FCFA, the byte comes from the escaped constant (never a raw U+202F
 * laundered into a file — expected values here are built from the same escape),
 * no amount uses a bare « F » or a breakable space, and no purchase-side
 * economics term ever reaches a buyer surface.
 */

const N = '\u202f'; // the only NNBSP source in this test — no raw byte in the file

const ROBE: AchatProduit = {
  shopName: 'Chez Aïcha Mode', prenom: 'Aïcha', slug: 'aicha-4821',
  productName: 'Robe brodée bogolan', variant: 'TAILLE M', zone: 'Gounghin · Ouagadougou',
  priceFcfa: 11_500, glyph: 'tissu', photoGrad: '#B65C2E,#7A3014', voiceDuree: '0:12', inStock: true,
};
const { variant: _v, voiceDuree: _vd, ...ROBE_BASE } = ROBE;
const SAC: AchatProduit = { ...ROBE_BASE, productName: 'Sac cuir artisanal', priceFcfa: 17_000, glyph: 'sac', photoGrad: '#8A4F1D,#5C3210', inStock: false };

describe('fmt — byte-exact NNBSP (U+202F, built from \\u202f)', () => {
  it('fmtFCFA groups thousands with U+202F and suffixes [NNBSP]FCFA', () => {
    expect(fmtFCFA(11_500)).toBe(`11${N}500${N}FCFA`);
    expect(fmtFCFA(1_000)).toBe(`1${N}000${N}FCFA`);
    expect(fmtFCFA(1_800)).toBe(`1${N}800${N}FCFA`);
    expect(fmtFCFA(6_300)).toBe(`6${N}300${N}FCFA`);
    expect(fmtFCFA(12_500)).toBe(`12${N}500${N}FCFA`);
    expect(fmtFCFA(17_000)).toBe(`17${N}000${N}FCFA`);
  });
  it('groupFr groups without the FCFA suffix (band decomposition)', () => {
    expect(groupFr(11_500)).toBe(`11${N}500`);
    expect(groupFr(999_999)).toBe(`999${N}999`);
    expect(groupFr(500)).toBe('500');
  });
  it('fmtHeure uses the NNBSP hour grammar (§3)', () => {
    expect(fmtHeure(9)).toBe(`9${N}h`);
    expect(fmtHeure(18)).toBe(`18${N}h`);
    expect(fmtHeure(17, 40)).toBe(`17${N}h${N}40`);
    expect(fmtHeure(10, 5)).toBe(`10${N}h${N}05`);
  });
});

describe('source discipline — zero raw U+202F laundered into src/achat', () => {
  const dir = join(import.meta.dirname, '..', 'src', 'achat');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
    it(`${f} carries no raw U+202F byte`, () => {
      const src = readFileSync(join(dir, f), 'utf8');
      const raw = [...src].filter((c) => c.codePointAt(0) === 0x202f).length;
      expect(raw, `${f} has a raw U+202F — use the \\u202f escape / fmt helpers`).toBe(0);
    });
  }
  it('money.ts builds the NNBSP from the \\u202f escape', () => {
    const src = readFileSync(join(dir, 'money.ts'), 'utf8');
    expect(src).toContain("'\\u202f'");
  });
});

describe('every rendered amount carries the money bytes; no bare F, no breakable space', () => {
  const screens: Array<[string, string]> = [
    ['S1', renderS1(ROBE)],
    ['S1-épuisé', renderS1(SAC, { epuise: true })],
    ['S2', renderS2(ROBE)],
    ['S3', renderS3(ROBE)],
    ['S4-standard', renderS4(ROBE, { speed: 'standard' })],
    ['S4-express', renderS4(ROBE, { speed: 'express' })],
    ['S5-scellé', renderS5(ROBE)],
    ['S5-révélé', renderS5(ROBE, { revealed: true })],
    ['S6', renderS6(ROBE)],
    ['S7', renderS7(ROBE)],
  ];
  for (const [name, html] of screens) {
    it(`${name}: every « FCFA » is preceded by U+202F; thousands never use space/NBSP`, () => {
      // FCFA never appears without a leading NNBSP (no bare « F », no space suffix)
      expect(html, `${name} has a « FCFA » not preceded by U+202F`).not.toMatch(/(?<!\u202f)FCFA/);
      // thousands grouping never uses ASCII space or NBSP (only U+202F) — checked
      // on the rendered TEXT so SVG path coordinates never false-positive.
      const text = html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ');
      expect(text, `${name} groups an amount with a space/NBSP`).not.toMatch(/\d[\u0020\u00a0]\d{3}(?!\d)/);
    });
    it(`${name}: no purchase-side economics term reaches the buyer (loi 1)`, () => {
      const low = html.toLowerCase();
      for (const term of ['coût', 'marge', 'fournisseur', ' net ', '>net<']) {
        expect(low.includes(term), `${name} leaks « ${term.trim()} »`).toBe(false);
      }
    });
  }
  it('S1 shows the signed price 11 500 FCFA in the price band', () => {
    expect(renderS1(ROBE)).toContain(`11${N}500`);
    expect(renderS1(ROBE)).toContain(`${N}FCFA`);
  });
  it('S4 recomposes the total per speed (server-composed seed, rendered as-is)', () => {
    expect(renderS4(ROBE, { speed: 'standard' })).toContain(`12${N}500${N}FCFA`);
    expect(renderS4(ROBE, { speed: 'express' })).toContain(`13${N}300${N}FCFA`);
  });
  it('S5 révélé shows the frozen K7 · 42 drop-code format (NNBSP separators)', () => {
    expect(renderS5(ROBE, { revealed: true })).toContain(`K7${N}·${N}42`);
  });
});
