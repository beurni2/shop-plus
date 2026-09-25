import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * ═══ MON-COMPTE-PLUS — HER PANIER AND HER HEARTS KEPT WITH HER ACCOUNT, ON THE REAL BUNDLE ═══
 *
 * Founder, 2026-09-25: « in their mon compte … see the products they added to
 * their cart from different resellers, and … products they liked » — « by
 * boutique, no prices », « in her account » (canon 3.24.0, SP-I05 and SP6's
 * third account ruling). The book keeps, for her alone, each article as a
 * boutique and a product — never a price, never a name — at most fifty per
 * list, newest first, once each; and erases them with the account and when
 * her number is recovered.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const OPS = 'test-checkout-ops-secret-compte3';
const persist = mkdtempSync(join(tmpdir(), 'comptes-clientes-3-'));
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
  const d = String(76_000_000 + n);
  return `${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)}`;
};
async function inscrire(phone = numero(), password = 'grain-de-nere-77') {
  const r = await poste('/buyer/signup', { firstName: 'Awa', lastName: 'Ouédraogo', phone, password });
  expect(r.res.status).toBe(200);
  return { phone, password, session: r.body['session'] as string };
}
type Op = { liste: string; action: string; slug: string; pid: string };
const op = (liste: 'panier' | 'favoris', action: 'ajouter' | 'retirer', slug: string, pid: string): Op => ({ liste, action, slug, pid });
const articles = (session: string, operations?: unknown) =>
  poste('/buyer/articles', operations === undefined ? {} : { operations }, bearer(session));
const paires = (l: unknown) => (l as { slug: string; pid: string }[]).map((a) => `${a.slug}/${a.pid}`);

describe('MON-COMPTE-PLUS — her panier and her hearts, kept with her account', () => {
  it('keeps what she adds, newest first, once each, in its own list — and follows her to another phone', async () => {
    const elle = await inscrire();
    const a = await articles(elle.session, [
      op('panier', 'ajouter', 'aicha-4821', 'pv-bazin'),
      op('panier', 'ajouter', 'mariam-1203', 'pv-sac'),
      op('favoris', 'ajouter', 'aicha-4821', 'pv-pagne'),
      op('panier', 'ajouter', 'aicha-4821', 'pv-bazin'),
    ]);
    expect(a.res.status).toBe(200);
    expect(a.res.headers.get('cache-control')).toBe('private, no-store');
    expect(paires(a.body['panier'])).toEqual(['mariam-1203/pv-sac', 'aicha-4821/pv-bazin']);
    expect(paires(a.body['favoris'])).toEqual(['aicha-4821/pv-pagne']);
    // Each kept article is a boutique, a product and when — nothing else.
    for (const art of [...(a.body['panier'] as object[]), ...(a.body['favoris'] as object[])]) {
      expect(Object.keys(art).sort()).toEqual(['at', 'pid', 'slug']);
    }
    // The same product in two boutiques is two articles.
    const b = await articles(elle.session, [op('panier', 'ajouter', 'mariam-1203', 'pv-bazin')]);
    expect(paires(b.body['panier'])).toEqual(['mariam-1203/pv-bazin', 'mariam-1203/pv-sac', 'aicha-4821/pv-bazin']);
    // From another phone: the same lists.
    const ailleurs = (await poste('/buyer/login', { phone: elle.phone, password: elle.password })).body['session'] as string;
    const lu = await articles(ailleurs);
    expect(lu.body['panier']).toEqual(b.body['panier']);
    expect(lu.body['favoris']).toEqual(b.body['favoris']);
  });

  it('takes out what she removes, in the order she did it', async () => {
    const elle = await inscrire();
    const r = await articles(elle.session, [
      op('favoris', 'ajouter', 'aicha-4821', 'pv-1'),
      op('favoris', 'ajouter', 'aicha-4821', 'pv-2'),
      op('favoris', 'retirer', 'aicha-4821', 'pv-1'),
      op('panier', 'ajouter', 'aicha-4821', 'pv-3'),
      op('panier', 'retirer', 'aicha-4821', 'pv-3'),
      op('panier', 'ajouter', 'aicha-4821', 'pv-3'),
      op('panier', 'retirer', 'mariam-1203', 'pv-9'),
    ]);
    expect(paires(r.body['favoris'])).toEqual(['aicha-4821/pv-2']);
    expect(paires(r.body['panier'])).toEqual(['aicha-4821/pv-3']);
  });

  it('is hers alone: another account reads nothing of it, and no session reads nothing at all', async () => {
    const elle = await inscrire();
    const autre = await inscrire();
    await articles(elle.session, [op('panier', 'ajouter', 'aicha-4821', 'pv-bazin'), op('favoris', 'ajouter', 'aicha-4821', 'pv-pagne')]);
    const lu = await articles(autre.session);
    expect(lu.body).toEqual({ ok: true, panier: [], favoris: [] });
    expect((await articles('SPC-AAAA-BBBB-CCCC-DDDD')).res.status).toBe(401);
    expect((await poste('/buyer/articles', { operations: [op('panier', 'ajouter', 'aicha-4821', 'pv-x')] })).res.status).toBe(401);
  });

  it('refuses anything but a boutique and a product — never a price, a name, or an unknown list — and writes nothing of a refused call', async () => {
    const elle = await inscrire();
    const mauvais: unknown[] = [
      [{ ...op('panier', 'ajouter', 'aicha-4821', 'pv-1'), prix: 12_000 }],
      [{ ...op('panier', 'ajouter', 'aicha-4821', 'pv-1'), nom: 'Bazin' }],
      [op('commandes' as 'panier', 'ajouter', 'aicha-4821', 'pv-1')],
      [op('panier', 'vider' as 'ajouter', 'aicha-4821', 'pv-1')],
      [op('panier', 'ajouter', 'Aicha 4821', 'pv-1')],
      [op('panier', 'ajouter', 'aicha-4821', 'pv 1')],
      [op('panier', 'ajouter', 'aicha-4821', '')],
      'pv-1',
      [op('panier', 'ajouter', 'aicha-4821', 'pv-ok'), op('panier', 'ajouter', 'aicha-4821', 'pv!')],
      Array.from({ length: 51 }, (_, i) => op('panier', 'ajouter', 'aicha-4821', `pv-${i}`)),
    ];
    for (const m of mauvais) {
      const r = await articles(elle.session, m);
      expect(r.res.status, JSON.stringify(m).slice(0, 60)).toBe(400);
      expect(r.body).toEqual({ ok: false, reason: 'bad_field', field: 'operations' });
    }
    expect((await poste('/buyer/articles', { operations: [], prix: 1 }, bearer(elle.session))).body).toEqual({ ok: false, reason: 'unknown_field', field: 'prix' });
    // The half-good call above wrote nothing.
    expect((await articles(elle.session)).body).toEqual({ ok: true, panier: [], favoris: [] });
  });

  it('keeps her last fifty in each list', async () => {
    const elle = await inscrire();
    for (let lot = 0; lot < 3; lot += 1) {
      await articles(elle.session, Array.from({ length: 20 }, (_, i) => op('panier', 'ajouter', 'aicha-4821', `pv-${lot}-${i}`)));
    }
    const panier = (await articles(elle.session)).body['panier'] as { pid: string }[];
    expect(panier).toHaveLength(50);
    expect(panier[0]!.pid).toBe('pv-2-19');
    expect(panier.some((a) => a.pid === 'pv-0-0')).toBe(false);
  });

  it('goes with the account, and a recovered number starts clean', async () => {
    const elle = await inscrire();
    await articles(elle.session, [op('panier', 'ajouter', 'aicha-4821', 'pv-1'), op('favoris', 'ajouter', 'aicha-4821', 'pv-2')]);
    // Recovered: the new holder of the number finds nothing of the old lists.
    const code = (await poste('/buyer/accounts/recovery-code', { phone: elle.phone }, cleC)).body['code'] as string;
    const rec = await poste('/buyer/recover', { firstName: 'Awa', lastName: 'Kaboré', phone: elle.phone, code, newPassword: 'karite-du-soir-8' });
    expect(rec.res.status).toBe(200);
    const apres = rec.body['session'] as string;
    expect((await articles(apres)).body).toEqual({ ok: true, panier: [], favoris: [] });
    // Deleted: everything goes; the same number signs up to empty lists.
    await articles(apres, [op('panier', 'ajouter', 'aicha-4821', 'pv-3')]);
    expect((await poste('/buyer/delete', { currentPassword: 'karite-du-soir-8' }, bearer(apres))).res.status).toBe(200);
    const nouveau = await inscrire(elle.phone);
    expect((await articles(nouveau.session)).body).toEqual({ ok: true, panier: [], favoris: [] });
  });
});
