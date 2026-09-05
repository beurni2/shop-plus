import { afterEach, describe, expect, it, vi } from 'vitest';
import { compteStoreSur, resolveCompteService } from '../src/access/compte-service';

/**
 * RESELLER-ACCOUNTS-1d — the app's account client. The Worker's e2e proves the
 * book; THIS file proves the client tells the truth about what the book said,
 * and that no credential lingers on the device.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const BASE = 'EXPO_PUBLIC_STOREFRONT_BASE';

function stubFetch(reply: (url: string, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(reply);
  vi.stubGlobal('fetch', spy);
  return spy;
}

const COMPTE = { accountId: 'rs-1234', name: 'Awa', state: 'pending_access' };

describe('RESELLER-ACCOUNTS-1d — the four calls, honestly mapped', () => {
  it('signup POSTs EXACTLY the four fields, and success carries the account + session', async () => {
    vi.stubEnv(BASE, 'https://shop.example/');
    const spy = stubFetch(async () => new Response(JSON.stringify({ ok: true, ...COMPTE, session: 'SPS-AAAA' })));
    const res = await resolveCompteService()!.inscrire({
      name: 'Awa', email: 'awa@example.bf', phone: '+226 70 00 00 01', password: 'grain-de-nere-77',
    });
    expect(res).toEqual({ ok: true, compte: COMPTE, session: 'SPS-AAAA' });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('https://shop.example/reseller/signup');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    // the Worker's allowlist refuses a fifth field by name; this client never
    // gives it one to refuse
    expect(Object.keys(body).sort()).toEqual(['email', 'name', 'password', 'phone']);
  });

  it('RAYONS-REVENDEUR-1 — her chosen rayons ride the signup ONLY when she chose some, and every answer\'s categories land on the compte', async () => {
    vi.stubEnv(BASE, 'https://shop.example');
    const port = resolveCompteService()!;
    const spy = stubFetch(async () =>
      new Response(JSON.stringify({ ok: true, ...COMPTE, categories: ['Mode femme', 'Sacs'], session: 'SPS-AAAA' })));
    const res = await port.inscrire({
      name: 'Awa', email: 'awa@example.bf', phone: '70 00 00 01', password: 'grain-de-nere-77',
      categories: ['Mode femme', 'Sacs'],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.compte.categories).toEqual(['Mode femme', 'Sacs']);
    const body = JSON.parse(String(spy.mock.calls[0]![1]?.body)) as Record<string, unknown>;
    expect(body['categories']).toEqual(['Mode femme', 'Sacs']);
    // a hostile/oversized answer never crashes the parse — it is « no choice »
    stubFetch(async () => new Response(JSON.stringify({ ok: true, ...COMPTE, categories: ['a','b','c','d','e','f'], session: 'SPS-AAAA' })));
    const trop = await port.connecter('a@b.bf', 'x'.repeat(8));
    expect(trop.ok).toBe(true);
    if (trop.ok) expect('categories' in trop.compte).toBe(false);
  });

  it('signup maps the named refusals — email_pris keeps her out of a duplicate, champ_invalide names the field', async () => {
    vi.stubEnv(BASE, 'https://shop.example');
    const port = resolveCompteService()!;
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'email_taken' }), { status: 409 }));
    expect(await port.inscrire({ name: 'A', email: 'a@b.bf', phone: '70000000', password: 'x'.repeat(8) }))
      .toEqual({ ok: false, reason: 'email_pris' });
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'bad_field', field: 'phone' }), { status: 400 }));
    expect(await port.inscrire({ name: 'A', email: 'a@b.bf', phone: '1', password: 'x'.repeat(8) }))
      .toEqual({ ok: false, reason: 'champ_invalide', field: 'phone' });
  });

  it('login: ONE refusal for every wrong way in — this client never reconstructs the email oracle the server refuses to be', async () => {
    vi.stubEnv(BASE, 'https://shop.example');
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'bad_credentials' }), { status: 401 }));
    expect(await resolveCompteService()!.connecter('a@b.bf', 'wrong')).toEqual({ ok: false, reason: 'refuse' });
  });

  it('admission separates the three answers a screen must treat differently: refused code, PAUSED account, dead network', async () => {
    vi.stubEnv(BASE, 'https://shop.example');
    const port = resolveCompteService()!;
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'code_refused' }), { status: 401 }));
    expect(await port.admission('SPS-1', 'SPA-X')).toEqual({ ok: false, reason: 'code_refuse' });
    // a paused account trying its old code must hear « paused », not « bad
    // code » — she would retype forever against a door the founder closed
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'access_paused' }), { status: 403 }));
    expect(await port.admission('SPS-1', 'SPA-X')).toEqual({ ok: false, reason: 'acces_coupe' });
    stubFetch(() => Promise.reject(new Error('down')));
    expect(await port.admission('SPS-1', 'SPA-X')).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('ACCES-ARME-2 — the pilot ceiling is gone: a 403 at the door is the founder\'s pause, whatever the body says', async () => {
    vi.stubEnv(BASE, 'https://shop.example');
    const port = resolveCompteService()!;
    // The deployed book can no longer answer `plafond_pilote`; a build that
    // still read it would carry a screen for a fact that cannot happen.
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'plafond_pilote' }), { status: 403 }));
    expect(await port.admission('SPS-1', 'SPA-X')).toEqual({ ok: false, reason: 'acces_coupe' });
    stubFetch(async () => new Response('{}', { status: 403 }));
    expect(await port.admission('SPS-1', 'SPA-X')).toEqual({ ok: false, reason: 'acces_coupe' });
  });

  it('the session refresh carries the Bearer and yields the fresh state — how a founder pause reaches a device already inside', async () => {
    vi.stubEnv(BASE, 'https://shop.example');
    const spy = stubFetch(async () => new Response(JSON.stringify({ ok: true, accountId: 'rs-1234', name: 'Awa', state: 'paused' })));
    const res = await resolveCompteService()!.session('SPS-AAAA');
    expect(res).toEqual({ ok: true, compte: { accountId: 'rs-1234', name: 'Awa', state: 'paused' } });
    expect((spy.mock.calls[0]![1]?.headers as Record<string, string>)['Authorization']).toBe('Bearer SPS-AAAA');
  });

  it('an answer with an UNKNOWN state is not a success — the gate must never decide on a word it does not know', async () => {
    vi.stubEnv(BASE, 'https://shop.example');
    stubFetch(async () => new Response(JSON.stringify({ ok: true, accountId: 'rs-1', name: 'A', state: 'banned' })));
    expect(await resolveCompteService()!.session('SPS-1')).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('unset base resolves to NOTHING — never a demo account', () => {
    vi.stubEnv(BASE, '');
    expect(resolveCompteService()).toBeNull();
  });

  it('PROFIL-REVENDEUR-1 — the read: an EMPTY body rides the Bearer, and the full profile (email + phone) lands', async () => {
    vi.stubEnv(BASE, 'https://shop.example');
    const spy = stubFetch(async () =>
      new Response(JSON.stringify({ ok: true, ...COMPTE, state: 'active', email: 'awa@example.bf', phone: '70 00 00 01', categories: ['Sacs'] })));
    const res = await resolveCompteService()!.profil('SPS-1');
    expect(res).toEqual({
      ok: true,
      profil: { accountId: 'rs-1234', name: 'Awa', state: 'active', categories: ['Sacs'], email: 'awa@example.bf', phone: '70 00 00 01' },
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('https://shop.example/reseller/profile');
    expect(String(init?.body)).toBe('{}'); // absent means untouched — a read sends NOTHING
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer SPS-1');
  });

  it('PROFIL-REVENDEUR-1 — a sectioned patch carries EXACTLY its fields, and the fresh profile comes back', async () => {
    vi.stubEnv(BASE, 'https://shop.example');
    const spy = stubFetch(async () =>
      new Response(JSON.stringify({ ok: true, ...COMPTE, state: 'active', name: 'Awa O.', email: 'awa@example.bf', phone: '76 55 44 33' })));
    const res = await resolveCompteService()!.profil('SPS-1', { name: 'Awa O.', phone: '76 55 44 33', email: 'awa@example.bf' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.profil.phone).toBe('76 55 44 33');
    const body = JSON.parse(String(spy.mock.calls[0]![1]?.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['email', 'name', 'phone']); // no password field rides an infos save
  });

  it('PROFIL-REVENDEUR-1 — the refusals keep their names: 401 splits on bad_password, 403 is the pause, 409 the taken email, 400 names the field', async () => {
    vi.stubEnv(BASE, 'https://shop.example');
    const port = resolveCompteService()!;
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'bad_password' }), { status: 401 }));
    expect(await port.profil('SPS-1', { currentPassword: 'x'.repeat(8), newPassword: 'y'.repeat(8) })).toEqual({ ok: false, reason: 'mdp_refuse' });
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'no_session' }), { status: 401 }));
    expect(await port.profil('SPS-1')).toEqual({ ok: false, reason: 'invalide' });
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'access_paused' }), { status: 403 }));
    expect(await port.profil('SPS-1')).toEqual({ ok: false, reason: 'coupe' });
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'email_taken' }), { status: 409 }));
    expect(await port.profil('SPS-1', { email: 'prise@example.bf' })).toEqual({ ok: false, reason: 'email_pris' });
    stubFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'bad_field', field: 'phone' }), { status: 400 }));
    expect(await port.profil('SPS-1', { phone: '12' })).toEqual({ ok: false, reason: 'champ_invalide', field: 'phone' });
    stubFetch(async () => { throw new Error('réseau mort'); });
    expect(await port.profil('SPS-1')).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('PROFIL-REVENDEUR-1 — an answer missing email or phone is NOT a profile, whatever its status says', async () => {
    vi.stubEnv(BASE, 'https://shop.example');
    stubFetch(async () => new Response(JSON.stringify({ ok: true, ...COMPTE, state: 'active', email: 'awa@example.bf' })));
    expect(await resolveCompteService()!.profil('SPS-1')).toEqual({ ok: false, reason: 'unreachable' });
  });
});

describe('RESELLER-ACCOUNTS-1d — what the device remembers', () => {
  function memoire(): { texte: { read(): Promise<string | null>; write(v: string): Promise<void> }; contenu: () => string | null } {
    let contenu: string | null = null;
    return {
      texte: {
        read: async () => contenu,
        write: async (v: string) => { contenu = v; },
      },
      contenu: () => contenu,
    };
  }

  it('round-trips the account — and NEVER a credential: the stored bytes carry no password and no session', async () => {
    const m = memoire();
    const store = compteStoreSur(m.texte);
    await store.write({ accountId: 'rs-1234', name: 'Awa', state: 'active' });
    expect(await store.read()).toEqual({ accountId: 'rs-1234', name: 'Awa', state: 'active' });
    // THE PROPERTY: CompteLocal has no credential field to serialize, so the
    // bytes cannot carry one — asserted on the bytes anyway, as the book does.
    expect(m.contenu()).not.toMatch(/password|session|mdp/i);
  });

  it('an unreadable or corrupt file is « no account », never a crash and never a guessed state', async () => {
    const store = compteStoreSur({ read: async () => '{corrompu', write: async () => undefined });
    expect(await store.read()).toBeNull();
    const vide = compteStoreSur({ read: async () => null, write: async () => undefined });
    expect(await vide.read()).toBeNull();
    // a stored record with an unknown state is DROPPED — the gate decides on
    // « no account » (the entrance) rather than on a word it cannot map
    const inconnu = compteStoreSur({
      read: async () => JSON.stringify({ accountId: 'rs-1', name: 'A', state: 'banned' }),
      write: async () => undefined,
    });
    expect(await inconnu.read()).toBeNull();
  });
});
