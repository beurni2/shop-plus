import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { cleC, MOT_DE_PASSE, OPS_SECRET, seance } from './seance';

/**
 * HER PROFILE DOOR ASKS FOR HER PASSWORD WHERE IT MATTERS, AND COUNTS EVERY
 * GUESS — on the real bundle under Miniflare, every claim asked of the BOOK
 * (the founder's roster, a fresh profile read, the login door), never believed
 * from the profile answer alone.
 *
 * - Her current password, wherever the profile door checks it, is counted the
 *   way the login door counts: ten wrong guesses in the window, then the door
 *   answers 429 `too_many_attempts` — even to the right password — and nothing
 *   changes. A success restarts the count.
 * - A new phone number or a new email is a change of who can reach and recover
 *   her account, so it needs her current password; a save that leaves both as
 *   they are (her name, her rayons) needs nothing.
 *
 * NOT MEASURED HERE: the count's fifteen-minute window running out. The book
 * has no clock this suite can move, so the window's end is left to the code
 * (the login door's own count is tested the same way).
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'comptes-revendeuse-'));
const ORIGIN = 'https://beurni2.github.io';

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: {
    STOREFRONT: 'StorefrontDO',
    LISTING: 'ListingDO',
    CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO',
    ATTRIBUTION_LOCK: 'AttributionLockDO',
    LADDER: 'BuyerLadderDO',
    DISPATCH: 'DispatchIndexDO',
    RESELLER: 'ResellerFeedDO',
    COMPTES: 'ResellerAccountsDO',
  },
  durableObjectsPersist: persist,
  bindings: { CHECKOUT_OPS_SECRET: OPS_SECRET },
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function profil(session: string, patch: Record<string, unknown> = {}) {
  const res = await mf.dispatchFetch('http://c/reseller/profile', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify(patch),
  });
  const text = await res.text();
  return { status: res.status, json: safeJson(text), cors: res.headers.get('access-control-allow-origin') };
}

async function connexion(email: string, password: string) {
  const res = await mf.dispatchFetch('http://c/reseller/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.status;
}

/** The founder's read of the record — what /contact-of hands her boutique comes from the same row. */
async function ligneDuLivre(accountId: string) {
  const res = await mf.dispatchFetch('http://c/reseller/accounts', { headers: cleC });
  const json = safeJson(await res.text()) as { accounts?: Record<string, unknown>[] };
  return json.accounts?.find((a) => a['accountId'] === accountId);
}

let n = 0;
/** An admitted reseller with her session, her email and her phone as the book holds them. */
async function elle() {
  const s = await seance(mf, `profilmdp${(n += 1)}`);
  const lu = await profil(s.session);
  expect(lu.status).toBe(200);
  return { ...s, email: lu.json['email'] as string, phone: lu.json['phone'] as string };
}

const FAUX = 'pas-le-bon-8';
const NOUVEAU = 'toute-neuve-99';

describe('her current password is counted on the profile door, like the login door', () => {
  it('ten wrong guesses answer 401; the eleventh is 429 too_many_attempts — and so is the RIGHT one; nothing changed', async () => {
    const a = await elle();
    for (let i = 0; i < 10; i += 1) {
      const r = await profil(a.session, { currentPassword: FAUX, newPassword: NOUVEAU });
      expect(r.status, `guess ${i + 1}`).toBe(401);
      expect(r.json['reason']).toBe('bad_password');
    }
    const onzieme = await profil(a.session, { currentPassword: FAUX, newPassword: NOUVEAU });
    expect(onzieme.status).toBe(429);
    expect(onzieme.json).toEqual({ ok: false, reason: 'too_many_attempts' });
    // the refusal keeps the door's browser header, like every other answer it gives
    expect(onzieme.cors).toBe(ORIGIN);

    const juste = await profil(a.session, { currentPassword: MOT_DE_PASSE, newPassword: NOUVEAU });
    expect(juste.status, 'the right password inside the window is still refused').toBe(429);
    expect(juste.json).toEqual({ ok: false, reason: 'too_many_attempts' });
    // the same count guards a new number: the door is closed for every proof
    const numero = await profil(a.session, { phone: '76 11 22 33', currentPassword: MOT_DE_PASSE });
    expect(numero.status).toBe(429);

    // THE BOOK: her password and her number are exactly as they were
    expect(await connexion(a.email, MOT_DE_PASSE)).toBe(200);
    expect(await connexion(a.email, NOUVEAU)).toBe(401);
    expect((await ligneDuLivre(a.accountId))?.['phone']).toBe(a.phone);
  }, 60_000);

  it('two wrong guesses sent together count as two', async () => {
    const a = await elle();
    for (let i = 0; i < 8; i += 1) {
      expect((await profil(a.session, { currentPassword: FAUX, newPassword: NOUVEAU })).status).toBe(401);
    }
    const ensemble = await Promise.all([
      profil(a.session, { currentPassword: FAUX, newPassword: NOUVEAU }),
      profil(a.session, { currentPassword: FAUX, newPassword: NOUVEAU }),
    ]);
    expect(ensemble.map((r) => r.status)).toEqual([401, 401]);
    // 8 + 2 = 10 counted: the next guess finds the door closed
    expect((await profil(a.session, { currentPassword: FAUX, newPassword: NOUVEAU })).status).toBe(429);
  }, 60_000);

  it('a success restarts the count: nine wrong, one right, nine wrong — still open', async () => {
    const a = await elle();
    for (let i = 0; i < 9; i += 1) {
      expect((await profil(a.session, { currentPassword: FAUX, newPassword: NOUVEAU })).status).toBe(401);
    }
    expect((await profil(a.session, { currentPassword: MOT_DE_PASSE, newPassword: NOUVEAU })).status).toBe(200);
    for (let i = 0; i < 9; i += 1) {
      expect((await profil(a.session, { currentPassword: FAUX, newPassword: MOT_DE_PASSE })).status).toBe(401);
    }
    expect((await profil(a.session, { currentPassword: NOUVEAU, newPassword: MOT_DE_PASSE })).status, 'the success must have restarted the count').toBe(200);
    expect(await connexion(a.email, MOT_DE_PASSE)).toBe(200);
  }, 60_000);
});

describe('a new number or a new email needs her current password; nothing else does', () => {
  it('a new number with no password is refused 400 by name, and her boutique still has the old number', async () => {
    const a = await elle();
    const r = await profil(a.session, { phone: '76 55 44 33' });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ ok: false, reason: 'bad_field', field: 'currentPassword' });
    expect((await profil(a.session)).json['phone']).toBe(a.phone);
    expect((await ligneDuLivre(a.accountId))?.['phone']).toBe(a.phone);
  }, 60_000);

  it('a new email with no password is refused 400 by name, and only the old email opens the door', async () => {
    const a = await elle();
    const neuf = `neuve-${a.accountId}@example.bf`;
    const r = await profil(a.session, { email: neuf });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ ok: false, reason: 'bad_field', field: 'currentPassword' });
    expect(await connexion(a.email, MOT_DE_PASSE)).toBe(200);
    expect(await connexion(neuf, MOT_DE_PASSE)).toBe(401);
  }, 60_000);

  it('a wrong password refuses 401 bad_password and changes nothing', async () => {
    const a = await elle();
    const neuf = `neuve-${a.accountId}@example.bf`;
    const r = await profil(a.session, { phone: '76 55 44 33', email: neuf, currentPassword: FAUX });
    expect(r.status).toBe(401);
    expect(r.json['reason']).toBe('bad_password');
    expect((await ligneDuLivre(a.accountId))?.['phone']).toBe(a.phone);
    expect(await connexion(a.email, MOT_DE_PASSE)).toBe(200);
    expect(await connexion(neuf, MOT_DE_PASSE)).toBe(401);
  }, 60_000);

  it('with her password the new number and the new email are saved; the book holds both', async () => {
    const a = await elle();
    const neuf = `neuve-${a.accountId}@example.bf`;
    const r = await profil(a.session, { phone: '76 55 44 33', email: neuf, currentPassword: MOT_DE_PASSE });
    expect(r.status).toBe(200);
    const ligne = await ligneDuLivre(a.accountId);
    expect(ligne?.['phone']).toBe('76 55 44 33');
    expect(ligne?.['email']).toBe(neuf);
    expect(await connexion(neuf, MOT_DE_PASSE)).toBe(200);
    expect(await connexion(a.email, MOT_DE_PASSE)).toBe(401);
  }, 60_000);

  it('a save that leaves the number and the email as they are needs no password — her app sends both on every save', async () => {
    const a = await elle();
    // the email as she might retype it: spaces around, capitals — the same address
    const r = await profil(a.session, { name: 'Awa Ouédraogo', phone: a.phone, email: `  ${a.email.toUpperCase()} ` });
    expect(r.status).toBe(200);
    const ligne = await ligneDuLivre(a.accountId);
    expect(ligne?.['name']).toBe('Awa Ouédraogo');
    expect(ligne?.['phone']).toBe(a.phone);
    expect(ligne?.['email']).toBe(a.email);
  }, 60_000);

  it('an email someone else holds, with no password, is refused 400 — the door says nothing about the other account first', async () => {
    const a = await elle();
    const b = await elle();
    const r = await profil(b.session, { email: a.email });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ ok: false, reason: 'bad_field', field: 'currentPassword' });
    // with her password, the taken address is the honest 409 it always was
    const prouve = await profil(b.session, { email: a.email, currentPassword: MOT_DE_PASSE });
    expect(prouve.status).toBe(409);
    expect(prouve.json['reason']).toBe('email_taken');
    expect((await profil(b.session)).json['email']).toBe(b.email);
  }, 60_000);
});
