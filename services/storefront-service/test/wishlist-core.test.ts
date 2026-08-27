import { describe, expect, it } from 'vitest';
import {
  applyListeUpdate,
  applyOffert,
  projectListe,
  validateListeCreate,
  validateListeUpdate,
  LISTE_REF,
  LISTE_TOKEN,
  type ListeRecord,
} from '../src/wishlist-core';

/**
 * LISTE-ENVIES-1 — the pure law, asserted by execution. The three properties
 * that carry the feature's honesty: unknown fields are refused BY NAME (the
 * order road's law), the public projection leaks neither the edit hash nor
 * any orderId, and « offert » is first-wins forever.
 */

const record = (articles: ListeRecord['articles']): ListeRecord => ({
  nom: 'Awa',
  slug: 'aicha-4821',
  articles,
  editCleHash: 'a'.repeat(64),
  createdAt: '2026-08-25T08:00:00.000Z',
});

describe('validateListeCreate', () => {
  const bon = { slug: 'aicha-4821', nom: 'Awa', pids: ['pv-1', 'pv-2'] };

  it('accepts the exact shape and dedupes pids preserving order', () => {
    const v = validateListeCreate({ ...bon, pids: ['pv-2', 'pv-1', 'pv-2'] });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.pids).toEqual(['pv-2', 'pv-1']);
  });

  it('refuses an unknown field by name — the order-road law', () => {
    const v = validateListeCreate({ ...bon, amount: 5000 });
    expect(v).toEqual({ ok: false, error: 'unknown_field', field: 'amount' });
  });

  it('accepts accented French names with either apostrophe', () => {
    for (const nom of ['Awa', 'Aïcha', "N'Goran", 'Mariage de Rasmata', 'Fêta’s']) {
      expect(validateListeCreate({ ...bon, nom }).ok, nom).toBe(true);
    }
  });

  it('refuses a nom that is empty, too long, or carries markup bytes', () => {
    for (const nom of ['', 'x'.repeat(25), '<b>Awa</b>', 'Awa\n']) {
      const v = validateListeCreate({ ...bon, nom });
      expect(v.ok, JSON.stringify(nom)).toBe(false);
      if (!v.ok) expect(v.field).toBe('nom');
    }
  });

  it('refuses an empty selection and one over twenty', () => {
    expect(validateListeCreate({ ...bon, pids: [] }).ok).toBe(false);
    const trop = validateListeCreate({ ...bon, pids: Array.from({ length: 21 }, (_, i) => `pv-${i}`) });
    expect(trop).toEqual({ ok: false, error: 'trop_d_articles', field: 'pids' });
    // exactly twenty AFTER dedupe is allowed
    expect(validateListeCreate({ ...bon, pids: Array.from({ length: 20 }, (_, i) => `pv-${i}`) }).ok).toBe(true);
  });

  it('refuses a malformed slug or pid', () => {
    expect(validateListeCreate({ ...bon, slug: 'Aicha-4821' }).ok).toBe(false);
    expect(validateListeCreate({ ...bon, pids: ['-starts-wrong'] }).ok).toBe(false);
    expect(validateListeCreate({ ...bon, pids: [42] }).ok).toBe(false);
  });
});

describe('validateListeUpdate', () => {
  const cle = 'A'.repeat(32);

  it('requires the 32-char edit key shape and refuses unknown fields', () => {
    expect(validateListeUpdate({ editCle: cle, pids: ['pv-1'] }).ok).toBe(true);
    expect(validateListeUpdate({ editCle: 'short', pids: ['pv-1'] }).ok).toBe(false);
    const v = validateListeUpdate({ editCle: cle, pids: ['pv-1'], token: 'x' });
    expect(v).toEqual({ ok: false, error: 'unknown_field', field: 'token' });
  });

  it('nom is optional — absent keeps the stored one downstream', () => {
    const v = validateListeUpdate({ editCle: cle, pids: ['pv-1'] });
    expect(v.ok && v.value.nom === undefined).toBe(true);
  });
});

describe('projectListe — the ONLY public shape', () => {
  it('reduces offert to a boolean and leaks neither hash nor orderId', () => {
    const r = record([{ pid: 'pv-1', offert: { orderId: 'ord-secret', at: '2026-08-25T09:00:00.000Z' } }, { pid: 'pv-2' }]);
    const projected = projectListe(r);
    expect(projected).toEqual({
      nom: 'Awa',
      slug: 'aicha-4821',
      articles: [
        { pid: 'pv-1', offert: true },
        { pid: 'pv-2', offert: false },
      ],
      livraison: false,
    });
    const bytes = JSON.stringify(projected);
    expect(bytes).not.toMatch(/editCle|Hash|ord-secret|createdAt/);
  });
});

describe('applyOffert — first-wins forever', () => {
  it('marks an ungiven pid once and never moves the mark', () => {
    const first = applyOffert(record([{ pid: 'pv-1' }]), 'pv-1', 'ord-a', '2026-08-25T09:00:00.000Z');
    expect(first.status).toBe('marked');
    expect(first.record.articles[0]!.offert?.orderId).toBe('ord-a');
    const second = applyOffert(first.record, 'pv-1', 'ord-b', '2026-08-25T10:00:00.000Z');
    expect(second.status).toBe('already');
    expect(second.record.articles[0]!.offert?.orderId).toBe('ord-a');
  });

  it('a pid not on the liste is a COMPLETE outcome, not an error', () => {
    const out = applyOffert(record([{ pid: 'pv-1' }]), 'pv-autre', 'ord-a', '2026-08-25T09:00:00.000Z');
    expect(out.status).toBe('absent');
    expect(out.record.articles).toEqual([{ pid: 'pv-1' }]);
  });
});

describe('applyListeUpdate — an edit never un-gives a gift', () => {
  it('keeps offert marks on surviving pids, drops removed ones, applies the new order', () => {
    const r = record([
      { pid: 'pv-1', offert: { orderId: 'ord-a', at: '2026-08-25T09:00:00.000Z' } },
      { pid: 'pv-2' },
    ]);
    const next = applyListeUpdate(r, { nom: 'Rasmata', pids: ['pv-3', 'pv-1'] });
    expect(next.nom).toBe('Rasmata');
    expect(next.articles).toEqual([
      { pid: 'pv-3' },
      { pid: 'pv-1', offert: { orderId: 'ord-a', at: '2026-08-25T09:00:00.000Z' } },
    ]);
    // absent nom keeps the stored one
    expect(applyListeUpdate(r, { pids: ['pv-2'] }).nom).toBe('Awa');
  });
});

describe('the two token pins', () => {
  it('LISTE_TOKEN is exactly the minted shape; LISTE_REF admits leading _ and - unlike ID_ALPHABET', () => {
    expect(LISTE_TOKEN.test('A'.repeat(32))).toBe(true);
    expect(LISTE_TOKEN.test('A'.repeat(31))).toBe(false);
    expect(LISTE_TOKEN.test('_'.repeat(32))).toBe(true);
    expect(LISTE_REF.test('_leading-underscore')).toBe(true);
    expect(LISTE_REF.test('x'.repeat(65))).toBe(false);
    expect(LISTE_REF.test('espace interdit')).toBe(false);
  });
});
