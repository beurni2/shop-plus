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
 *     and gives it by calling that number; she enters it with a new password,
 *     every other session ends, the old password dies, the code is spent;
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
    const recup = await poste('/buyer/recover', { phone: `+226 ${phone}`, code: String(body['code']).toLowerCase(), newPassword: 'karite-du-soir-8' });
    expect(recup.res.status).toBe(200);
    expect(recup.body).toMatchObject({ ok: true, firstName: 'Awa', phone });
    const neuve = recup.body['session'] as string;
    expect(neuve).toMatch(/^SPC-/);
    expect((await lire(neuve)).res.status).toBe(200);
    for (const s of [ancienne, ailleurs]) expect((await lire(s)).res.status).toBe(401);
    expect((await poste('/buyer/login', { phone, password })).res.status).toBe(401);
    expect((await poste('/buyer/login', { phone, password: 'karite-du-soir-8' })).res.status).toBe(200);
    const encore = await poste('/buyer/recover', { phone, code: body['code'], newPassword: 'autre-mot-long' });
    expect(encore.res.status).toBe(401);
    expect(encore.body).toEqual({ ok: false, reason: 'bad_code' });
  });

  it('a number someone else took goes back to its owner — the one the founder reaches by calling it', async () => {
    const phone = numero();
    const intrus = await inscrire(phone, 'mot-de-l-intrus', 'Intrus');
    const { body } = await code(phone);
    const elle = await poste('/buyer/recover', { phone, code: body['code'], newPassword: 'le-mien-enfin-9' });
    expect(elle.res.status).toBe(200);
    const session = elle.body['session'] as string;
    expect((await lire(intrus.session)).res.status).toBe(401);
    const corrige = await poste('/buyer/profile', { firstName: 'Aïcha', lastName: 'Kaboré', email: '' }, bearer(session));
    expect(corrige.body).toMatchObject({ firstName: 'Aïcha', lastName: 'Kaboré', phone });
    expect((await poste('/buyer/login', { phone, password: 'mot-de-l-intrus' })).res.status).toBe(401);
  });

  it('every wrong way in is one refusal, and ten lock the number — even the right code waits', async () => {
    const { phone } = await inscrire();
    const faux = await poste('/buyer/recover', { phone, code: 'SPR-AAAA-AAAA-AAAA-AAAA', newPassword: 'nouveau-mot-long' });
    const inconnu = await poste('/buyer/recover', { phone: numero(), code: 'SPR-AAAA-AAAA-AAAA-AAAA', newPassword: 'nouveau-mot-long' });
    expect(faux.text).toBe(inconnu.text);
    expect(faux.body).toEqual({ ok: false, reason: 'bad_code' });
    const { body } = await code(phone);
    for (let i = 1; i < 10; i += 1) {
      expect((await poste('/buyer/recover', { phone, code: `SPR-AAAA-AAAA-AAAA-AAA${'BCDEFGHIJ'[i]}`, newPassword: 'nouveau-mot-long' })).res.status).toBe(401);
    }
    const bloque = await poste('/buyer/recover', { phone, code: body['code'], newPassword: 'nouveau-mot-long' });
    expect(bloque.res.status).toBe(429);
    expect(bloque.body).toEqual({ ok: false, reason: 'too_many_attempts' });
  });

  it('refuses a short new password and a smuggled field by name', async () => {
    const { phone } = await inscrire();
    expect((await poste('/buyer/recover', { phone, code: 'x', newPassword: 'court' })).body).toEqual({ ok: false, reason: 'bad_field', field: 'newPassword' });
    expect((await poste('/buyer/recover', { phone, code: 'x', newPassword: 'assez-long', session: 's' })).body).toEqual({ ok: false, reason: 'unknown_field', field: 'session' });
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
    // Read from ANOTHER phone: the list follows the account.
    const ailleurs = (await poste('/buyer/login', { phone: elle.phone, password: elle.password })).body['session'] as string;
    const lu = await poste('/buyer/orders', {}, bearer(ailleurs));
    expect(lu.body['commandes']).toEqual(a2.body['commandes']);
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
