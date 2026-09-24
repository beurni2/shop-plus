import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
// The buyer app's OWN account port — the code her phone runs — driven here
// against the REAL combined Worker. Nothing of the app is stubbed; only the
// network under it is pointed at workerd.
import { httpComptePort } from '../../../apps/buyer-pwa/src/compte/port';

/**
 * ═══ COMPTE-CLIENTE — THE SEAM, COMMITTED (verifier MAJOR 3) ═══
 *
 * The walks drive the screens against a stand-in and the e2e suite drives the
 * doors with hand-built requests; neither proves the two agree. This does: the
 * app's port speaks to the real book, and the book is asked for the outcome.
 * A renamed refusal (`no_session`, `phone_taken`, `bad_credentials`), a moved
 * door or a changed answer shape turns this red.
 */

const BASE = 'https://svc/api';
const persist = mkdtempSync(join(tmpdir(), 'comptes-clientes-seam-'));
const mf = new Miniflare({
  modules: true,
  scriptPath: 'dist/worker/worker.mjs',
  durableObjects: {
    STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO', ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO',
    LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO', RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO', COMPTES_CLIENTES: 'BuyerAccountsDO',
  },
  durableObjectsPersist: persist,
  bindings: { CHECKOUT_OPS_SECRET: 'cle-c-seam' },
});
beforeAll(async () => {
  await mf.ready;
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});
afterEach(() => vi.unstubAllGlobals());

/** Her phone's network, pointed at the real Worker: `${BASE}/buyer/…` → `/buyer/…`. */
const reseau = () =>
  vi.stubGlobal('fetch', (url: string, init: RequestInit) =>
    mf.dispatchFetch(url.replace(BASE, 'https://svc'), init as never) as unknown as Promise<Response>,
  );
/** The book itself, asked directly — the ledger, not the port's word. */
const livre = async (session: string) =>
  (await mf.dispatchFetch('https://svc/buyer/profile', { method: 'POST', headers: { Authorization: `Bearer ${session}` }, body: '{}' })).json() as Promise<Record<string, unknown>>;

describe('COMPTE-CLIENTE — the app\'s port against the real book', () => {
  it('sign up, read, edit, change password, sign out, sign back in — each outcome read back from the book', async () => {
    reseau();
    const port = httpComptePort(BASE);
    const cree = await port.inscrire({ firstName: 'Awa', lastName: 'Ouédraogo', phone: '70 12 34 56', password: 'grain-de-nere-77', email: 'awa@exemple.bf' });
    expect(cree.kind).toBe('ok');
    if (cree.kind !== 'ok') return;
    const session = cree.value.session;
    expect(cree.value.profil).toEqual({ firstName: 'Awa', lastName: 'Ouédraogo', phone: '70 12 34 56', email: 'awa@exemple.bf' });
    expect(await livre(session)).toMatchObject({ ok: true, firstName: 'Awa', email: 'awa@exemple.bf' });

    // The same number, however written, is taken — by the name the app reads.
    expect(await port.inscrire({ firstName: 'X', lastName: 'Y', phone: '+226 70123456', password: 'autre-mot-long' }))
      .toEqual({ kind: 'refus', reason: 'phone_taken' });
    expect(await port.lireProfil(session)).toEqual({ kind: 'ok', value: cree.value.profil });

    const modifie = await port.modifierProfil(session, { firstName: 'Aïcha', lastName: 'Ouédraogo', email: '' });
    expect(modifie).toEqual({ kind: 'ok', value: { firstName: 'Aïcha', lastName: 'Ouédraogo', phone: '70 12 34 56' } });
    const lu = await livre(session);
    expect(lu['firstName']).toBe('Aïcha');
    expect(lu).not.toHaveProperty('email');

    const ailleurs = await port.connecter('0022670123456', 'grain-de-nere-77');
    expect(ailleurs.kind).toBe('ok');
    if (ailleurs.kind !== 'ok') return;
    expect(await port.modifierProfil(session, { currentPassword: 'pas-le-bon', newPassword: 'karite-du-soir-8' }))
      .toEqual({ kind: 'refus', reason: 'bad_password' });
    expect((await port.modifierProfil(session, { currentPassword: 'grain-de-nere-77', newPassword: 'karite-du-soir-8' })).kind).toBe('ok');
    // The other phone is out — the app reads it as a lost session, not as a network fault.
    expect(await port.lireProfil(ailleurs.value.session)).toEqual({ kind: 'session_perdue' });

    await port.deconnecter(session);
    expect(await livre(session)).toEqual({ ok: false, reason: 'no_session' });
    expect(await port.lireProfil(session)).toEqual({ kind: 'session_perdue' });

    expect(await port.connecter('70 12 34 56', 'grain-de-nere-77')).toEqual({ kind: 'refus', reason: 'bad_credentials' });
    expect(await port.connecter('71 99 99 99', 'grain-de-nere-77')).toEqual({ kind: 'refus', reason: 'bad_credentials' });
    const retour = await port.connecter('70 12 34 56', 'karite-du-soir-8');
    expect(retour.kind === 'ok' && retour.value.profil.firstName).toBe('Aïcha');
  });

  it('a field the book refuses reaches the app by its name', async () => {
    reseau();
    const port = httpComptePort(BASE);
    expect(await port.inscrire({ firstName: 'Awa', lastName: 'O', phone: '70 12', password: 'assez-long-1' }))
      .toEqual({ kind: 'refus', reason: 'bad_field', field: 'phone' });
    expect(await port.inscrire({ firstName: 'Awa', lastName: 'O', phone: '72 00 00 01', password: 'court' }))
      .toEqual({ kind: 'refus', reason: 'bad_field', field: 'password' });
  });
});

describe('COMPTE-CLIENTE-2 — the app\'s port against the real book: the way back, « Mes commandes », leaving', () => {
  it('orders follow her account; the founder\'s code takes her back in; deleting frees her number', async () => {
    reseau();
    const port = httpComptePort(BASE);
    const cree = await port.inscrire({ firstName: 'Awa', lastName: 'Sawadogo', phone: '73 00 00 01', password: 'grain-de-nere-77' });
    if (cree.kind !== 'ok') throw new Error(JSON.stringify(cree));
    const ici = cree.value.session;
    expect(await port.commandes(ici, [{ orderId: 'ord-quote-seam-1', buyerRef: 'ref-seam-1' }])).toMatchObject({ kind: 'ok' });
    // Another phone reads the same list — from the book.
    const ailleurs = await port.connecter('73000001', 'grain-de-nere-77');
    if (ailleurs.kind !== 'ok') throw new Error('login');
    const lu = await port.commandes(ailleurs.value.session);
    expect(lu.kind === 'ok' && lu.value.map((c) => [c.orderId, c.buyerRef])).toEqual([['ord-quote-seam-1', 'ref-seam-1']]);

    // The founder mints on key C; the app redeems it.
    const mint = await mf.dispatchFetch('https://svc/buyer/accounts/recovery-code', {
      method: 'POST', headers: { Authorization: 'Bearer cle-c-seam', 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '73 00 00 01' }),
    });
    const { code } = (await mint.json()) as { code: string };
    const noms = { firstName: 'Awa', lastName: 'Sawadogo' };
    expect(await port.recuperer('73 00 00 01', 'SPR-AAAA-AAAA-AAAA-AAAA', 'karite-du-soir-8', noms)).toEqual({ kind: 'refus', reason: 'bad_code' });
    // Written the way it was heard: lower case, spaces for dashes.
    const repris = await port.recuperer('+226 73000001', code.toLowerCase().replace(/-/g, ' '), 'karite-du-soir-8', noms);
    if (repris.kind !== 'ok') throw new Error(JSON.stringify(repris));
    expect(await port.lireProfil(ici)).toEqual({ kind: 'session_perdue' });
    expect(await port.lireProfil(ailleurs.value.session)).toEqual({ kind: 'session_perdue' });
    const neuve = repris.value.session;
    // The number starts clean: the list the old sessions built is gone, from the book.
    expect(await port.commandes(neuve)).toEqual({ kind: 'ok', value: [] });

    expect(await port.supprimer(neuve, 'pas-le-bon')).toEqual({ kind: 'refus', reason: 'bad_password' });
    expect(await port.supprimer(neuve, 'karite-du-soir-8')).toEqual({ kind: 'ok', value: true });
    expect(await port.lireProfil(neuve)).toEqual({ kind: 'session_perdue' });
    expect(await port.connecter('73000001', 'karite-du-soir-8')).toEqual({ kind: 'refus', reason: 'bad_credentials' });
    expect((await port.inscrire({ firstName: 'Awa', lastName: 'Sawadogo', phone: '73 00 00 01', password: 'tout-neuf-mot-1' })).kind).toBe('ok');
  });
});

