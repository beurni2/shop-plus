/**
 * ═══ REPRISE-PWA — THE SNAPSHOT CODEC (founder, 2026-08-13) ═══
 *
 * The journey snapshot is the ONLY thing standing between a refresh and a
 * restarted purchase, and it is parsed from a storage anyone can hand-edit.
 * These pin the codec's three laws:
 *
 *  1 · what goes in comes back — byte-faithful roundtrip, keyed to the link;
 *  2 · anything the codec cannot vouch for is NOTHING (fresh C1) — never a
 *      crash, never a guess, never an order screen without its order;
 *  3 · what is stored is EXACTLY what is named — no code, no server truth, no
 *      amount can ride along (the allowlist pin, the wire-body idiom).
 */
import { describe, expect, it } from 'vitest';
import {
  REPRISE_CLE,
  garderReprise,
  lireReprise,
  oublierReprise,
  type Reprise,
} from '../src/cliente/reprise';

/** A `sessionStorage` that works, in a Node test (the vrai-suivi idiom). */
function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: () => null,
    removeItem: (k: string) => map.delete(k),
    setItem: (k: string, v: string) => map.set(k, v),
  } as Storage;
}

const LIEN = 'aicha-4821#p1';

const PLEINE: Reprise = {
  lien: LIEN,
  ecran: 'C7',
  zone: 'Gounghin',
  repere: 'Face à la pharmacie du marché',
  phone: '70 12 34 56',
  delivery: 'today',
  pay: 'A',
  orderId: 'ord-quote-full-1',
  buyerRef: 'ref-buyer-1',
  essai: 1,
};

const MI_PARCOURS: Reprise = {
  lien: LIEN,
  ecran: 'C5',
  zone: 'Pissy',
  repere: '',
  phone: '70 00 00 00',
  delivery: 'today',
  pay: 'B',
  orderId: null,
  buyerRef: null,
  essai: 0,
};

describe('reprise — roundtrip', () => {
  it('what was kept is what comes back, field for field', () => {
    const s = memStorage();
    garderReprise(PLEINE, s);
    expect(lireReprise(s, LIEN)).toEqual(PLEINE);
  });

  it('a mid-journey snapshot (no order yet, empty repère) roundtrips too', () => {
    const s = memStorage();
    garderReprise(MI_PARCOURS, s);
    expect(lireReprise(s, LIEN)).toEqual(MI_PARCOURS);
  });

  it('a SECOND garder replaces the first — one journey per tab', () => {
    const s = memStorage();
    garderReprise(MI_PARCOURS, s);
    garderReprise(PLEINE, s);
    expect(lireReprise(s, LIEN)).toEqual(PLEINE);
  });

  it('oublier clears the slot — a finished journey does not resurrect', () => {
    const s = memStorage();
    garderReprise(PLEINE, s);
    oublierReprise(s);
    expect(lireReprise(s, LIEN)).toBeUndefined();
    expect(s.getItem(REPRISE_CLE)).toBeNull();
  });
});

describe('reprise — a DIFFERENT link never resumes this journey', () => {
  it('the lien is the key: another slug#pid reads as nothing', () => {
    const s = memStorage();
    garderReprise(PLEINE, s);
    expect(lireReprise(s, 'autre-boutique#p1')).toBeUndefined();
    expect(lireReprise(s, 'aicha-4821#p2')).toBeUndefined();
    // …while the right link still resumes.
    expect(lireReprise(s, LIEN)).toEqual(PLEINE);
  });
});

describe('reprise — malformed is NOTHING, never a crash and never a guess', () => {
  const cases: Array<[string, string]> = [
    ['unparsable JSON', '{oops'],
    ['a non-object', '"C5"'],
    ['null', 'null'],
    ['a missing field', JSON.stringify({ ...PLEINE, phone: undefined })],
    ['a screen the codec does not know (C2)', JSON.stringify({ ...PLEINE, ecran: 'C2' })],
    ['a screen the codec does not know (C10)', JSON.stringify({ ...PLEINE, ecran: 'C10' })],
    ['a screen the codec does not know (garbage)', JSON.stringify({ ...PLEINE, ecran: 'X9' })],
    ['a delivery that is not a Livraison', JSON.stringify({ ...PLEINE, delivery: 'demain' })],
    ['a pay mode that is not A or B', JSON.stringify({ ...PLEINE, pay: 'C' })],
    ['a numeric zone', JSON.stringify({ ...PLEINE, zone: 12 })],
    ['a negative essai', JSON.stringify({ ...PLEINE, essai: -1 })],
    ['a fractional essai', JSON.stringify({ ...PLEINE, essai: 1.5 })],
    ['a string essai', JSON.stringify({ ...PLEINE, essai: '1' })],
    ['an order screen without its orderId', JSON.stringify({ ...PLEINE, orderId: null })],
    ['an order screen with an EMPTY orderId', JSON.stringify({ ...PLEINE, orderId: '' })],
    ['an order screen without its buyerRef', JSON.stringify({ ...PLEINE, buyerRef: null })],
    ['a C6 without its order', JSON.stringify({ ...PLEINE, ecran: 'C6', orderId: null, buyerRef: null })],
  ];
  for (const [nom, raw] of cases) {
    it(`${nom} → undefined`, () => {
      const s = memStorage();
      s.setItem(REPRISE_CLE, raw);
      expect(lireReprise(s, LIEN)).toBeUndefined();
    });
  }

  it('an empty or absent slot → undefined', () => {
    const s = memStorage();
    expect(lireReprise(s, LIEN)).toBeUndefined();
    s.setItem(REPRISE_CLE, '');
    expect(lireReprise(s, LIEN)).toBeUndefined();
  });
});

describe('reprise — a dead or absent storage costs the resumption, never a throw', () => {
  it('no storage: garder/lire/oublier are calm no-ops', () => {
    expect(() => garderReprise(PLEINE, undefined)).not.toThrow();
    expect(lireReprise(undefined, LIEN)).toBeUndefined();
    expect(() => oublierReprise(undefined)).not.toThrow();
  });

  it('a storage that throws on every touch: same', () => {
    const mort = {
      getItem: () => {
        throw new Error('quota');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('quota');
      },
    } as unknown as Storage;
    expect(() => garderReprise(PLEINE, mort)).not.toThrow();
    expect(lireReprise(mort, LIEN)).toBeUndefined();
    expect(() => oublierReprise(mort)).not.toThrow();
  });
});

describe('reprise — the allowlist: what is stored is exactly what is named', () => {
  // GEO-ACHAT-2 — the phone-only road: a priced screen (C4/C5) resumed with
  // no zone is a PIN journey, and the pin never persists (no coordinate in
  // any storage) — so it clamps back to C3 with what she typed kept, while an
  // order screen (C6+) resumes as itself: its truth is the order's.
  it('a priced screen with no zone clamps to C3 — her phone kept, no fabricated quartier', () => {
    const s = memStorage();
    s.setItem(REPRISE_CLE, JSON.stringify({ ...MI_PARCOURS, zone: null }));
    const r = lireReprise(s, LIEN);
    expect(r).toBeDefined();
    expect(r!.ecran).toBe('C3');
    expect(r!.zone).toBeNull();
    expect(r!.phone).toBe(MI_PARCOURS.phone);
  });

  it('an OLD snapshot still carrying `indic` parses — the retired key is ignored, never a refusal (deploy-boundary compat)', () => {
    const s = memStorage();
    s.setItem(REPRISE_CLE, JSON.stringify({ ...MI_PARCOURS, indic: 'Portail vert' }));
    const r = lireReprise(s, LIEN);
    expect(r).toBeDefined();
    expect(r!.ecran).toBe('C5');
    expect(r!.repere).toBe(MI_PARCOURS.repere);
    expect('indic' in (r as unknown as Record<string, unknown>)).toBe(false);
  });

  it('an order screen with no zone resumes as itself — the tracking needs no quartier', () => {
    const s = memStorage();
    s.setItem(REPRISE_CLE, JSON.stringify({ ...PLEINE, zone: null }));
    const r = lireReprise(s, LIEN);
    expect(r).toBeDefined();
    expect(r!.ecran).toBe('C7');
  });

  it('the serialized record carries the ten named keys and NOTHING else — no code, no marks, no amounts can ride', () => {
    const s = memStorage();
    // Even a caller handing extra fields cannot smuggle them in: the writer
    // copies field by field, never spreads.
    garderReprise({ ...PLEINE, codeRemise: '654321', livree: true, montant: 12_500 } as unknown as Reprise, s);
    const brut = s.getItem(REPRISE_CLE);
    expect(brut).not.toBeNull();
    const o = JSON.parse(brut ?? '{}') as Record<string, unknown>;
    expect(Object.keys(o).sort()).toEqual(
      ['buyerRef', 'delivery', 'ecran', 'essai', 'lien', 'orderId', 'pay', 'phone', 'repere', 'zone'].sort(),
    );
    expect(brut).not.toContain('654321');
    expect(brut).not.toContain('livree');
    expect(brut).not.toContain('12500');
  });
});
