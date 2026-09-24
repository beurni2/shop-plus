import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * ═══ COMPTE-CLIENTE-2 — THE WAY BACK, HER ORDERS, AND LEAVING, ON THE REAL BUNDLE ═══
 *
 * Founder order 2026-09-24 (« fix the ones still open »):
 *   · a forgotten password, or a number someone else signed up with, is no
 *     longer for ever: the founder mints a one-time code for a NUMBER (key C)
 *     and gives it by calling that number; she enters it with her names and a
 *     new password, every other session ends, the old password dies, the code
 *     is spent — and the number starts clean: nothing the previous holder left
 *     (names, email, order list and its read tokens) passes to her;
 *   · « Mes commandes » — the orders she made while signed in follow her
 *     account, from any phone;
 *   · « Supprimer mon compte » — everything the book holds of her goes, and
 *     her number is free again.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const OPS = 'test-checkout-ops-secret-compte2';
const persist = mkdtempSync(join(tmpdir(), 'comptes-clientes-2-'));
const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: {
    STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO', ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO',
    LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO', RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO', COMPTES_CLIENTES: 'BuyerAccountsDO',
  },
  durableObjectsPersist: persist,
  bindings: { CHECKOUT_OPS_SECRET: OPS },
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

const json = { 'Content-Type': 'application/json' };
const poste = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
  const res = await mf.dispatchFetch(`https://svc${path}`, { method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  return { res, text, body: JSON.parse(text) as Record<string, unknown> };
};
const bearer = (s: string) => ({ Authorization: `Bearer ${s}` });
const cleC = { Authorization: `Bearer ${OPS}` };

let n = 0;
const numero = (): string => {
  n += 1;
  const d = String(75_000_000 + n);
  return `${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)}`;
};
async function inscrire(phone = numero(), password = 'grain-de-nere-77', prenom = 'Awa') {
  const r = await poste('/buyer/signup', { firstName: prenom, lastName: 'Ouédraogo', phone, password });
  expect(r.res.status).toBe(200);
  return { phone, password, session: r.body['session'] as string };
}
const lire = (s: string) => poste('/buyer/profile', {}, bearer(s));
const code = (phone: string, headers: Record<string, string> = cleC) => poste('/buyer/accounts/recovery-code', { phone }, headers);
const NOMS = { firstName: 'Awa', lastName: 'Ouédraogo' };
const recuperer = (corps: Record<string, unknown>) => poste('/buyer/recover', { ...NOMS, ...corps });

describe('COMPTE-CLIENTE-2 — the founder\'s recovery code', () => {
  it('is minted only with key C, for a number that has an account, and answers the code — nothing about her', async () => {
    const { phone } = await inscrire();
    expect((await code(phone, {})).res.status).toBe(401);
    expect((await code(phone, { Authorization: 'Bearer pas-la-cle' })).res.status).toBe(401);
    const r = await code(phone);
    expect(r.res.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['code', 'expiresAt', 'ok']);
    expect(r.body['code']).toMatch(/^SPR-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    for (const interdit of ['Awa', 'Ouédraogo', phone, 'session', 'Hash']) expect(r.text).not.toContain(interdit);
    expect(r.res.headers.get('cache-control')).toBe('private, no-store');
    const aucun = await code(numero());
    expect(aucun.res.status).toBe(404);
    expect(aucun.body).toEqual({ ok: false, reason: 'no_account' });
  });

  it('takes her back in: new password, every other phone out, the old password dead, the code spent', async () => {
    const { phone, password, session: ancienne } = await inscrire();
    const ailleurs = (await poste('/buyer/login', { phone, password })).body['session'] as string;
    const { body } = await code(phone);
    const recup = await recuperer({ phone: `+226 ${phone}`, code: String(body['code']).toLowerCase(), newPassword: 'karite-du-soir-8' });
    expect(recup.res.status).toBe(200);
    expect(recup.body).toMatchObject({ ok: true, firstName: 'Awa', lastName: 'Ouédraogo', phone: `+226 ${phone}` });
    const neuve = recup.body['session'] as string;
    expect(neuve).toMatch(/^SPC-/);
    expect((await lire(neuve)).res.status).toBe(200);
    for (const s of [ancienne, ailleurs]) expect((await lire(s)).res.status).toBe(401);
    expect((await poste('/buyer/login', { phone, password })).res.status).toBe(401);
    expect((await poste('/buyer/login', { phone, password: 'karite-du-soir-8' })).res.status).toBe(200);
    const encore = await recuperer({ phone, code: body['code'], newPassword: 'autre-mot-long' });
    expect(encore.res.status).toBe(401);
    expect(encore.body).toEqual({ ok: false, reason: 'bad_code' });
  });

  it('a number someone else took goes back to its owner CLEAN — nothing the intruder left passes to her, least of all an order\'s read token', async () => {
    const phone = numero();
    const r = await poste('/buyer/signup', { firstName: 'Intrus', lastName: 'Inconnu', email: 'intrus@exemple.bf', phone, password: 'mot-de-l-intrus' });
    const intrus = r.body['session'] as string;
    await poste('/buyer/orders', { ajouter: [{ orderId: 'ord-intrus-1', buyerRef: 'REF-INTRUS-SECRET' }] }, bearer(intrus));
    const { body } = await code(phone);
    const retour = await poste('/buyer/recover', { firstName: 'Aïcha', lastName: 'Kaboré', phone, code: body['code'], newPassword: 'le-mien-enfin-9' });
    expect(retour.res.status).toBe(200);
    for (const interdit of ['Intrus', 'Inconnu', 'intrus@', 'ord-intrus', 'REF-INTRUS']) expect(retour.text).not.toContain(interdit);
    expect(retour.body).toMatchObject({ firstName: 'Aïcha', lastName: 'Kaboré', phone });
    expect(retour.body['email']).toBeUndefined();
    const session = retour.body['session'] as string;
    const profilLu = await lire(session);
    expect(profilLu.body['email']).toBeUndefined();
    const liste = await poste('/buyer/orders', {}, bearer(session));
    expect(liste.body['commandes']).toEqual([]);
    expect(liste.text).not.toContain('REF-INTRUS');
    expect((await lire(intrus)).res.status).toBe(401);
    expect((await poste('/buyer/login', { phone, password: 'mot-de-l-intrus' })).res.status).toBe(401);
  });

  it('the code is taken however it was heard: no dashes, spaces, lower case, with or without « SPR »', async () => {
    const forme = (c: string, i: number): string => {
      const corps = c.slice(4).replace(/-/g, '');
      return [corps, `spr ${corps.match(/.{4}/g)!.join(' ')}`, c.slice(4), ` ${c.toLowerCase()} `][i]!;
    };
    for (let i = 0; i < 4; i += 1) {
      const { phone } = await inscrire();
      const { body } = await code(phone);
      const r = await recuperer({ phone, code: forme(String(body['code']), i), newPassword: 'karite-du-soir-8' });
      expect(r.res.status, `form ${i}: ${forme(String(body['code']), i)}`).toBe(200);
    }
    // Too short or too long is still the one refusal, never a hint.
    const { phone } = await inscrire();
    const { body } = await code(phone);
    for (const faux of [String(body['code']).slice(0, -1), `${String(body['code'])}A`]) {
      expect((await recuperer({ phone, code: faux, newPassword: 'karite-du-soir-8' })).body).toEqual({ ok: false, reason: 'bad_code' });
    }
  });

  it('every wrong way in is one refusal, and ten lock the number — even the right code waits', async () => {
    const { phone } = await inscrire();
    const faux = await recuperer({ phone, code: 'SPR-AAAA-AAAA-AAAA-AAAA', newPassword: 'nouveau-mot-long' });
    const inconnu = await recuperer({ phone: numero(), code: 'SPR-AAAA-AAAA-AAAA-AAAA', newPassword: 'nouveau-mot-long' });
    expect(faux.text).toBe(inconnu.text);
    expect(faux.body).toEqual({ ok: false, reason: 'bad_code' });
    const { body } = await code(phone);
    for (let i = 1; i < 10; i += 1) {
      expect((await recuperer({ phone, code: `SPR-AAAA-AAAA-AAAA-AAA${'ABCDEFGHIJ'[i]}`, newPassword: 'nouveau-mot-long' })).res.status).toBe(401);
    }
    const bloque = await recuperer({ phone, code: body['code'], newPassword: 'nouveau-mot-long' });
    expect(bloque.res.status).toBe(429);
    expect(bloque.body).toEqual({ ok: false, reason: 'too_many_attempts' });
  });

  it('refuses a short new password, a missing name and a smuggled field by name', async () => {
    const { phone } = await inscrire();
    expect((await recuperer({ phone, code: 'x', newPassword: 'court' })).body).toEqual({ ok: false, reason: 'bad_field', field: 'newPassword' });
    expect((await recuperer({ phone, code: 'x', newPassword: 'assez-long', session: 's' })).body).toEqual({ ok: false, reason: 'unknown_field', field: 'session' });
    expect((await poste('/buyer/recover', { lastName: 'K', phone, code: 'x', newPassword: 'assez-long' })).body).toEqual({ ok: false, reason: 'bad_field', field: 'firstName' });
    expect((await poste('/buyer/recover', { firstName: 'A', phone, code: 'x', newPassword: 'assez-long' })).body).toEqual({ ok: false, reason: 'bad_field', field: 'lastName' });
  });
});

describe('COMPTE-CLIENTE-2 — « Mes commandes »', () => {
  it('keeps the orders she adds, newest first, once each, for her alone', async () => {
    const elle = await inscrire();
    const autre = await inscrire();
    const a1 = await poste('/buyer/orders', { ajouter: [{ orderId: 'ord-q-1', buyerRef: 'ref-1' }] }, bearer(elle.session));
    expect(a1.res.status).toBe(200);
    const a2 = await poste('/buyer/orders', { ajouter: [{ orderId: 'ord-q-2', buyerRef: 'ref-2' }, { orderId: 'ord-q-1', buyerRef: 'ref-1' }] }, bearer(elle.session));
    expect((a2.body['commandes'] as { orderId: string }[]).map((c) => c.orderId)).toEqual(['ord-q-2', 'ord-q-1']);
    // Once each inside ONE call too (verifier minor 5).
    const a3 = await poste('/buyer/orders', { ajouter: [{ orderId: 'ord-q-3', buyerRef: 'ref-3' }, { orderId: 'ord-q-3', buyerRef: 'ref-3' }] }, bearer(elle.session));
    expect((a3.body['commandes'] as { orderId: string }[]).map((c) => c.orderId)).toEqual(['ord-q-3', 'ord-q-2', 'ord-q-1']);
    // Read from ANOTHER phone: the list follows the account.
    const ailleurs = (await poste('/buyer/login', { phone: elle.phone, password: elle.password })).body['session'] as string;
    const lu = await poste('/buyer/orders', {}, bearer(ailleurs));
    expect(lu.body['commandes']).toEqual(a3.body['commandes']);
    expect(lu.res.headers.get('cache-control')).toBe('private, no-store');
    expect((await poste('/buyer/orders', {}, bearer(autre.session))).body['commandes']).toEqual([]);
    expect((await poste('/buyer/orders', {})).res.status).toBe(401);
  });

  it('refuses a malformed order and keeps only the last fifty', async () => {
    const elle = await inscrire();
    for (const mauvais of [[{ orderId: 'ord 1', buyerRef: 'r' }], [{ orderId: 'ord-1' }], 'ord-1', Array.from({ length: 11 }, (_, i) => ({ orderId: `o-${i}`, buyerRef: 'r' }))]) {
      const r = await poste('/buyer/orders', { ajouter: mauvais }, bearer(elle.session));
      expect(r.body, JSON.stringify(mauvais).slice(0, 40)).toEqual({ ok: false, reason: 'bad_field', field: 'ajouter' });
    }
    for (let lot = 0; lot < 6; lot += 1) {
      await poste('/buyer/orders', { ajouter: Array.from({ length: 10 }, (_, i) => ({ orderId: `o-${lot}-${i}`, buyerRef: `r-${lot}-${i}` })) }, bearer(elle.session));
    }
    const liste = (await poste('/buyer/orders', {}, bearer(elle.session))).body['commandes'] as { orderId: string }[];
    expect(liste).toHaveLength(50);
    expect(liste[0]!.orderId).toBe('o-5-9');
  });
});

describe('COMPTE-CLIENTE-2 — « Supprimer mon compte »', () => {
  it('needs her password; then everything goes and her number is free', async () => {
    const elle = await inscrire();
    await poste('/buyer/orders', { ajouter: [{ orderId: 'ord-x', buyerRef: 'ref-x' }] }, bearer(elle.session));
    const ailleurs = (await poste('/buyer/login', { phone: elle.phone, password: elle.password })).body['session'] as string;
    const faux = await poste('/buyer/delete', { currentPassword: 'pas-le-bon' }, bearer(elle.session));
    expect(faux.res.status).toBe(401);
    expect(faux.body).toEqual({ ok: false, reason: 'bad_password' });
    expect((await lire(elle.session)).res.status).toBe(200);
    const ok = await poste('/buyer/delete', { currentPassword: elle.password }, bearer(elle.session));
    expect(ok.res.status).toBe(200);
    for (const s of [elle.session, ailleurs]) expect((await lire(s)).res.status).toBe(401);
    expect((await poste('/buyer/login', { phone: elle.phone, password: elle.password })).res.status).toBe(401);
    expect((await code(elle.phone)).res.status).toBe(404);
    // Her number is free: a new account starts with nothing of the old one.
    const neuve = await inscrire(elle.phone, 'tout-neuf-mot-1');
    expect((await poste('/buyer/orders', {}, bearer(neuve.session))).body['commandes']).toEqual([]);
  });
});
