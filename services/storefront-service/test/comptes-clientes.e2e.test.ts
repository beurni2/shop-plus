import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ COMPTE-CLIENTE — THE BUYER'S OWN ACCOUNT, END TO END ON THE REAL BUNDLE ═══
 *
 * Founder order 2026-09-24: « … ask name, family name, email as optional,
 * phone number, and password, and make sure for buyer who got an account has
 * a profile section where his infos are there and safe ».
 *
 * What must be true, asked of the real combined Worker on workerd:
 *   · she signs up with prénom, nom, téléphone, mot de passe and an OPTIONAL
 *     email; her number is her login, one number one account, however written;
 *   · she signs in with her number and password; every wrong way in is the
 *     same refusal, and ten wrong tries lock the number for a quarter hour;
 *   · her profile answers her session and nobody else; she edits her names
 *     and email, never her number; a new password needs the old one and cuts
 *     every OTHER phone off;
 *   · « safe », asked of the DISK: neither a password nor a live session token
 *     is anywhere in the stored bytes — only her names, number and hashes.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const ORIGINE = 'https://beurni2.github.io';
const DOS = {
  STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
  ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO',
  DISPATCH: 'DispatchIndexDO', RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO',
};

const persist = mkdtempSync(join(tmpdir(), 'comptes-clientes-'));
const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { ...DOS, COMPTES_CLIENTES: 'BuyerAccountsDO' },
  durableObjectsPersist: persist,
  bindings: {},
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

const json = { 'Content-Type': 'application/json' };
const poste = (m: Miniflare, path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  m.dispatchFetch(`https://svc${path}`, { method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify(body) });
const porteur = (session: string) => ({ Authorization: `Bearer ${session}` });

let n = 0;
/** A fresh Burkina number per call, in the spaced form the app sends. */
const numero = (): string => {
  n += 1;
  const d = String(70_000_000 + n);
  return `${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)}`;
};

/** Every plaintext this suite ever handed the book — none may reach the disk. */
const secretsDonnes = new Set<string>();

async function inscrire(over: Record<string, unknown> = {}) {
  const phone = numero();
  const password = `mot-de-passe-${n}-sûr`;
  const body = { firstName: 'Awa', lastName: 'Ouédraogo', email: `awa${n}@exemple.bf`, phone, password, ...over };
  if (typeof body.password === 'string') secretsDonnes.add(body.password);
  const res = await poste(mf, '/buyer/signup', body);
  const text = await res.text();
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (typeof parsed['session'] === 'string') secretsDonnes.add(parsed['session']);
  return { res, text, body: parsed, phone: body.phone as string, password: body.password as string };
}

async function connecter(phone: string, password: string) {
  secretsDonnes.add(password);
  const res = await poste(mf, '/buyer/login', { phone, password });
  const text = await res.text();
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (typeof parsed['session'] === 'string') secretsDonnes.add(parsed['session']);
  return { res, text, body: parsed };
}

async function profil(session: string, patch: Record<string, unknown> = {}) {
  const res = await poste(mf, '/buyer/profile', patch, porteur(session));
  return { res, body: (await res.json()) as Record<string, unknown> };
}

describe('COMPTE-CLIENTE — signup', () => {
  it('creates her account, answers her profile and a session, and nothing that could open it without her', async () => {
    const { res, text, body, phone } = await inscrire();
    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['createdAt', 'email', 'firstName', 'lastName', 'ok', 'phone', 'session']);
    expect(body).toMatchObject({ ok: true, firstName: 'Awa', lastName: 'Ouédraogo', phone, email: `awa${n}@exemple.bf` });
    expect(body['session']).toMatch(/^SPC-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    // The raw bytes: no salt, no hash, no internal id, no password.
    for (const interdit of ['Salt', 'Hash', 'accountId', 'password', 'mot-de-passe']) expect(text).not.toContain(interdit);
    // Private, and readable only by the buyer's own origin.
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGINE);
  });

  it('the email is optional — absent or blank, the account has none', async () => {
    const sans = await inscrire({ email: undefined });
    expect(sans.res.status).toBe(200);
    expect(sans.body).not.toHaveProperty('email');
    const vide = await inscrire({ email: '   ' });
    expect(vide.res.status).toBe(200);
    expect(vide.body).not.toHaveProperty('email');
  });

  it('one number, one account — however she writes it — and the first password stays hers', async () => {
    const premier = await inscrire();
    const chiffres = premier.phone.replace(/\s/g, '');
    for (const variante of [`+226 ${premier.phone}`, `00226${chiffres}`, chiffres]) {
      const second = await poste(mf, '/buyer/signup', {
        firstName: 'Intruse', lastName: 'X', phone: variante, password: 'un-autre-mot-de-passe',
      });
      expect(second.status, variante).toBe(409);
      expect(await second.json()).toEqual({ ok: false, reason: 'phone_taken' });
    }
    // The book still holds HER account: only her password opens it.
    expect((await connecter(premier.phone, 'un-autre-mot-de-passe')).res.status).toBe(401);
    const elle = await connecter(`+226${chiffres}`, premier.password);
    expect(elle.res.status).toBe(200);
    expect(elle.body['firstName']).toBe('Awa');
  });

  it('refuses each bad field by name, and a smuggled one', async () => {
    const cas: [Record<string, unknown>, string, string][] = [
      [{ firstName: '  ' }, 'bad_field', 'firstName'],
      [{ lastName: undefined }, 'bad_field', 'lastName'],
      [{ lastName: 'x'.repeat(61) }, 'bad_field', 'lastName'],
      [{ phone: '70 12 34' }, 'bad_field', 'phone'],
      [{ phone: undefined }, 'bad_field', 'phone'],
      [{ password: 'court' }, 'bad_field', 'password'],
      [{ email: 'pas-un-email' }, 'bad_field', 'email'],
      [{ role: 'admin' }, 'unknown_field', 'role'],
      [{ accountId: 'AC-XXXX' }, 'unknown_field', 'accountId'],
    ];
    for (const [over, reason, field] of cas) {
      const base = { firstName: 'Awa', lastName: 'Ouédraogo', phone: numero(), password: 'assez-long-1' };
      const res = await poste(mf, '/buyer/signup', { ...base, ...over });
      expect(res.status, JSON.stringify(over)).toBe(400);
      expect(await res.json()).toEqual({ ok: false, reason, field });
    }
  });
});

describe('COMPTE-CLIENTE — sign in', () => {
  it('an unknown number and a wrong password are the SAME refusal, byte for byte', async () => {
    const { phone } = await inscrire();
    const faux = await connecter(phone, 'pas-le-bon-mot');
    const inconnu = await connecter(numero(), 'pas-le-bon-mot');
    expect(faux.res.status).toBe(401);
    expect(inconnu.res.status).toBe(401);
    expect(faux.text).toBe(inconnu.text);
    expect(JSON.parse(faux.text)).toEqual({ ok: false, reason: 'bad_credentials' });
  });

  it('ten wrong tries lock the number — even the right password waits — and another number is untouched', async () => {
    const { phone, password } = await inscrire();
    for (let i = 0; i < 10; i += 1) expect((await connecter(phone, `faux-${i}-mot`)).res.status, `try ${i + 1}`).toBe(401);
    const bloque = await connecter(phone, password);
    expect(bloque.res.status).toBe(429);
    expect(bloque.body).toEqual({ ok: false, reason: 'too_many_attempts' });
    const autre = await inscrire();
    expect((await connecter(autre.phone, autre.password)).res.status).toBe(200);
  });
});

describe('COMPTE-CLIENTE — her profile', () => {
  it('answers her session only', async () => {
    const { body, phone } = await inscrire();
    const lu = await profil(body['session'] as string);
    expect(lu.res.status).toBe(200);
    expect(lu.body).toMatchObject({ ok: true, firstName: 'Awa', lastName: 'Ouédraogo', phone });
    expect(lu.res.headers.get('cache-control')).toBe('private, no-store');
    for (const session of ['', 'SPC-AAAA-BBBB-CCCC-DDDD', 'SPS-AAAA-BBBB-CCCC-DDDD']) {
      const refus = await profil(session);
      expect(refus.res.status, session).toBe(401);
      expect(refus.body).toEqual({ ok: false, reason: 'no_session' });
    }
    // A session in the BODY is not a session: only her Bearer counts.
    const smuggle = await mf.dispatchFetch('https://svc/buyer/profile', {
      method: 'POST', headers: json, body: JSON.stringify({ session: body['session'] }),
    });
    expect(smuggle.status).toBe(401);
  });

  it('edits her names and her email (and clears it), never her number; absent means untouched', async () => {
    const { body, phone } = await inscrire();
    const session = body['session'] as string;
    const change = await profil(session, { firstName: 'Aïcha', lastName: 'Kaboré' });
    expect(change.res.status).toBe(200);
    expect(change.body).toMatchObject({ firstName: 'Aïcha', lastName: 'Kaboré', phone, email: `awa${n}@exemple.bf` });
    // The LEDGER, not the answer: a fresh read says the same.
    expect((await profil(session)).body).toMatchObject({ firstName: 'Aïcha', lastName: 'Kaboré' });
    const efface = await profil(session, { email: '' });
    expect(efface.res.status).toBe(200);
    expect((await profil(session)).body).not.toHaveProperty('email');
    const remis = await profil(session, { email: 'Aicha@Exemple.BF' });
    expect(remis.body['email']).toBe('aicha@exemple.bf');
    const numeroChange = await profil(session, { phone: '76 00 00 00' });
    expect(numeroChange.res.status).toBe(400);
    expect(numeroChange.body).toEqual({ ok: false, reason: 'unknown_field', field: 'phone' });
    expect((await profil(session)).body['phone']).toBe(phone);
    const vide = await profil(session, { firstName: ' ' });
    expect(vide.body).toEqual({ ok: false, reason: 'bad_field', field: 'firstName' });
  });

  it('a new password needs the old one, and cuts every OTHER phone off; the one in her hand stays in', async () => {
    const { body, phone, password } = await inscrire();
    const ici = body['session'] as string;
    const ailleurs = (await connecter(phone, password)).body['session'] as string;
    expect((await profil(ailleurs)).res.status).toBe(200);

    const sansAncien = await profil(ici, { newPassword: 'nouveau-mot-long' });
    expect(sansAncien.body).toEqual({ ok: false, reason: 'bad_field', field: 'currentPassword' });
    const mauvaisAncien = await profil(ici, { currentPassword: 'pas-le-bon', newPassword: 'nouveau-mot-long' });
    expect(mauvaisAncien.res.status).toBe(401);
    expect(mauvaisAncien.body).toEqual({ ok: false, reason: 'bad_password' });
    // Nothing moved on a refusal: the old password still opens, the other phone is still in.
    expect((await profil(ailleurs)).res.status).toBe(200);

    secretsDonnes.add('nouveau-mot-long');
    const ok = await profil(ici, { currentPassword: password, newPassword: 'nouveau-mot-long' });
    expect(ok.res.status).toBe(200);
    expect((await profil(ici)).res.status).toBe(200);
    expect((await profil(ailleurs)).res.status).toBe(401);
    expect((await connecter(phone, password)).res.status).toBe(401);
    expect((await connecter(phone, 'nouveau-mot-long')).res.status).toBe(200);
  });

  it('sign out ends that session, and is idempotent', async () => {
    const { body } = await inscrire();
    const session = body['session'] as string;
    const sortie = await mf.dispatchFetch('https://svc/buyer/logout', { method: 'POST', headers: { ...json, ...porteur(session) }, body: '{}' });
    expect(sortie.status).toBe(200);
    expect(await sortie.json()).toEqual({ ok: true });
    expect((await profil(session)).res.status).toBe(401);
    const encore = await mf.dispatchFetch('https://svc/buyer/logout', { method: 'POST', headers: { ...json, ...porteur(session) }, body: '{}' });
    expect(encore.status).toBe(200);
  });
});

describe('COMPTE-CLIENTE — the doors', () => {
  it('the preflight grants exactly the buyer origin, POST, and her Bearer; a GET is refused with CORS', async () => {
    for (const path of ['/buyer/signup', '/buyer/login', '/buyer/profile', '/buyer/logout']) {
      const pre = await mf.dispatchFetch(`https://svc${path}`, { method: 'OPTIONS' });
      expect(pre.status, path).toBe(204);
      expect(pre.headers.get('access-control-allow-origin')).toBe(ORIGINE);
      expect(pre.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type');
      const get = await mf.dispatchFetch(`https://svc${path}`);
      expect(get.status, path).toBe(405);
      expect(get.headers.get('access-control-allow-origin')).toBe(ORIGINE);
    }
  });

  it('a body over the bound is refused before the book, readable by her app', async () => {
    const res = await mf.dispatchFetch('https://svc/buyer/signup', { method: 'POST', headers: json, body: 'x'.repeat(65 * 1024) });
    expect(res.status).toBe(413);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGINE);
  });
});

describe('COMPTE-CLIENTE — « safe », asked of the disk', () => {
  it('no password and no session token she was ever given is anywhere in the stored bytes', async () => {
    // Force the storage to settle: one more read through the book.
    const { body } = await inscrire();
    await profil(body['session'] as string);
    const fichiers: string[] = [];
    const parcourir = (d: string): void => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) parcourir(p);
        else fichiers.push(p);
      }
    };
    parcourir(persist);
    expect(fichiers.length).toBeGreaterThan(0);
    const octets = Buffer.concat(fichiers.map((f) => readFileSync(f)));
    // The control: the book really is on this disk — her number is there.
    expect(octets.includes(Buffer.from(body['phone'] as string))).toBe(true);
    expect(secretsDonnes.size).toBeGreaterThan(10);
    // Every way a string can sit in a stored value: UTF-8, one-byte Latin-1
    // (how V8 serialises « sûr »), and two-byte UTF-16.
    for (const secret of secretsDonnes) {
      for (const enc of ['utf8', 'latin1', 'utf16le'] as const) {
        expect(octets.includes(Buffer.from(secret, enc)), `${secret.slice(0, 6)} ${enc}`).toBe(false);
      }
    }
  });
});

describe('COMPTE-CLIENTE — budgets and life', () => {
  const persist2 = mkdtempSync(join(tmpdir(), 'comptes-clientes-limites-'));
  const mf2 = new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { ...DOS, COMPTES_CLIENTES: 'BuyerAccountsDO' },
    durableObjectsPersist: persist2,
    bindings: { SESSION_IDLE_MS: '1500' },
    ratelimits: {
      LIMITE_INSCRIPTIONS: { namespace_id: '1003', simple: { limit: 2, period: 60 } },
      LIMITE_CONNEXIONS: { namespace_id: '1004', simple: { limit: 2, period: 60 } },
      LIMITE_INSCRIPTIONS_CLIENTES: { namespace_id: '1005', simple: { limit: 2, period: 60 } },
      LIMITE_CONNEXIONS_CLIENTES: { namespace_id: '1006', simple: { limit: 3, period: 60 } },
    },
  });
  beforeAll(async () => {
    await mf2.ready;
    // Miniflare's limiter is a fixed window on the wall clock: never straddle it.
    const reste = 60_000 - (Date.now() % 60_000);
    if (reste < 8_000) await new Promise((r) => setTimeout(r, reste + 50));
  }, 15_000);
  afterAll(async () => {
    await mf2.dispose();
    rmSync(persist2, { recursive: true, force: true });
  });
  const de = (ip: string, path: string, body: unknown): Promise<Response> =>
    mf2.dispatchFetch(`https://svc${path}`, { method: 'POST', headers: { ...json, 'CF-Connecting-IP': ip }, body: JSON.stringify(body) });

  it('signup and login each have their OWN per-address budget, never a reseller\'s', async () => {
    const A = '203.0.113.21';
    for (let i = 0; i < 2; i += 1) expect((await de(A, '/buyer/signup', {})).status, `signup ${i + 1}`).toBe(400);
    const trop = await de(A, '/buyer/signup', {});
    expect(trop.status).toBe(429);
    expect(await trop.json()).toEqual({ ok: false, reason: 'too_many_requests' });
    expect(trop.headers.get('retry-after')).toBe('60');
    expect(trop.headers.get('access-control-allow-origin')).toBe(ORIGINE);
    // Her login budget stands, and so do the reseller's doors from the same address.
    for (let i = 0; i < 3; i += 1) expect((await de(A, '/buyer/login', {})).status, `login ${i + 1}`).toBe(401);
    expect((await de(A, '/buyer/login', {})).status).toBe(429);
    expect((await de(A, '/reseller/signup', {})).status).toBe(400);
    expect((await de(A, '/reseller/login', {})).status).toBe(401);
  });

  it('a session unused past its life is refused and swept', async () => {
    const res = await de('203.0.113.22', '/buyer/signup', { firstName: 'Awa', lastName: 'Sawadogo', phone: '71 00 00 01', password: 'assez-long-2' });
    expect(res.status).toBe(200);
    const session = ((await res.json()) as { session: string }).session;
    const lire = () => mf2.dispatchFetch('https://svc/buyer/profile', { method: 'POST', headers: { ...json, Authorization: `Bearer ${session}` }, body: '{}' });
    expect((await lire()).status).toBe(200);
    await new Promise((r) => setTimeout(r, 1_700));
    expect((await lire()).status).toBe(401);
  });
});

describe('COMPTE-CLIENTE — a Worker without the book', () => {
  it('answers a named 503 her app can read — the rest of the Worker is unchanged', async () => {
    const persist3 = mkdtempSync(join(tmpdir(), 'comptes-clientes-sans-'));
    const mf3 = new Miniflare({ modules: true, scriptPath: SCRIPT, durableObjects: DOS, durableObjectsPersist: persist3, bindings: {} });
    try {
      const res = await mf3.dispatchFetch('https://svc/buyer/signup', { method: 'POST', headers: json, body: '{}' });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ ok: false, reason: 'accounts_unavailable' });
      expect(res.headers.get('access-control-allow-origin')).toBe(ORIGINE);
    } finally {
      await mf3.dispose();
      rmSync(persist3, { recursive: true, force: true });
    }
  });
});
