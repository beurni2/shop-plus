import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockPaymentProvider } from '@shop-plus/commerce-core';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * RESELLER-ACCOUNTS-1b — the founder's flow, END TO END on real workerd:
 * she signs up herself → the account exists, CLOSED (`pending_access`) → the
 * founder mints her one-time code on his console (key C) → she enters it once
 * → the app is open and nothing asks again → the founder can PAUSE her, and a
 * pause refuses every read BY NAME — never a hidden button.
 *
 * THE PROPERTY ABOVE ALL OTHERS: no credential ever leaves the account book.
 * Password, salt, hash, code hash — asserted absent on RAW RESPONSE BYTES of
 * every surface that answers, including the founder's own roster.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'accounts-'));
const T0 = '2026-08-04T08:00:00.000Z';

const WRITE_SECRET = 'test-write-secret-a001';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-a001';
const OPS_SECRET = 'test-checkout-ops-secret-a001';
const authed = { 'X-Write-Key': WRITE_SECRET };
const signed = { 'X-Payment-Webhook-Key': WEBHOOK_SECRET, 'Content-Type': 'application/json' };
const cleC = { Authorization: `Bearer ${OPS_SECRET}` };

const MOT_DE_PASSE = 'grain-de-nere-77';

const SUPPLY = [
  {
    productVersionId: 'pv-acct-1',
    offerVersion: 'ov-acct-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 9,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: {
    STOREFRONT: 'StorefrontDO',
    LISTING: 'ListingDO',
    CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO',
    LADDER: 'BuyerLadderDO',
    DISPATCH: 'DispatchIndexDO',
    RESELLER: 'ResellerFeedDO',
    COMPTES: 'ResellerAccountsDO',
  },
  durableObjectsPersist: persist,
  bindings: {
    STOREFRONT_WRITE_SECRET: WRITE_SECRET,
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CHECKOUT_OPS_SECRET: OPS_SECRET,
  },
  serviceBindings: {
    OFFER: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (request.method === 'POST' && path === '/fulfillment/order-confirmed') {
        return Response.json({ ok: true, status: 'registered' });
      }
      const single = /^\/supply-projection\/([^/]+)$/.exec(path);
      if (single) {
        const pid = decodeURIComponent(single[1]!);
        const value = SUPPLY.find((v) => v.productVersionId === pid);
        if (value === undefined) return Response.json({ status: 'not_found' }, { status: 404 });
        return Response.json({ version: 1, asOf: new Date().toISOString(), value });
      }
      return Response.json({ status: 'not_found' }, { status: 404 });
    },
  },
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

let n = 0;
const suivant = (): string => String((n += 1)).padStart(3, '0');

async function inscrire(over: Record<string, unknown> = {}) {
  const i = suivant();
  const res = await mf.dispatchFetch('http://c/reseller/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Awa Traoré ${i}`,
      email: `awa${i}@example.bf`,
      phone: `+226 70 00 00 ${i}`,
      password: MOT_DE_PASSE,
      ...over,
    }),
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) as { accountId?: string; session?: string; state?: string; reason?: string } };
}

/** The founder mints her one-time code from his console (key C). */
async function minterCode(accountId: string) {
  const res = await mf.dispatchFetch('http://c/reseller/accounts/access-code', {
    method: 'POST',
    headers: { ...cleC, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) as { code?: string; reason?: string } };
}

async function admission(session: string, code: string) {
  const res = await mf.dispatchFetch('http://c/reseller/admission', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

async function ventes(bearer: string) {
  const res = await mf.dispatchFetch('http://c/reseller/ventes', { headers: { Authorization: `Bearer ${bearer}` } });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

async function roster() {
  const res = await mf.dispatchFetch('http://c/reseller/accounts', { headers: cleC });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) as { accounts?: Record<string, unknown>[] } };
}

describe('RESELLER-ACCOUNTS — signup mints the account server-side, closed', () => {
  it('the whole admission road: signup → pending & refused by name → founder mints → one code opens once → open forever', async () => {
    const s = await inscrire();
    expect(s.status, s.text).toBe(200);
    // THE ID IS MINTED HERE, in the shape the whole downstream world speaks —
    // never on a handset (the defect this slice exists to close).
    expect(s.json.accountId).toMatch(/^rs-\d{4}$/);
    expect(s.json.state).toBe('pending_access');
    const session = s.json.session!;
    expect(session.startsWith('SPS-')).toBe(true);

    // CLOSED means the money read says WHY: access_required, not a bare 401 —
    // the app must be able to route her to the admission screen, not a shrug.
    const avant = await ventes(session);
    expect(avant.status).toBe(403);
    expect(avant.json['reason']).toBe('access_required');

    // no code minted yet ⇒ admission refuses; nothing changed
    const trop_tot = await admission(session, 'SPA-AAAA-BBBB-CCCC-DDDD');
    expect(trop_tot.status).toBe(401);

    const mint = await minterCode(s.json.accountId!);
    expect(mint.status, mint.text).toBe(200);
    expect(mint.json.code).toMatch(/^SPA-/);

    const ok = await admission(session, mint.json.code!);
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json['state']).toBe('active');

    // OPEN: the feed answers (empty is honest — she has no sales yet)
    const apres = await ventes(session);
    expect(apres.status, apres.text).toBe(200);
    expect(apres.json['ventes']).toEqual([]);

    // ONE-TIME: the code died with its use — a second signup cannot ride it
    const s2 = await inscrire();
    const rejoue = await admission(s2.json.session!, mint.json.code!);
    expect(rejoue.status).toBe(401);
    // …and even the SAME account cannot be re-admitted with it (idempotent ok, no code check needed)
    const encore = await admission(session, mint.json.code!);
    expect(encore.json['deja']).toBe(true);

    // THE SPENT HASH IS GONE FROM THE BOOK, not merely unreachable: the roster
    // must NOT claim a handout is still in flight for an admitted account —
    // that flag is how the founder sees who he still owes a code to, and a
    // lingering hash makes it lie about exactly the accounts that are done.
    const r = await roster();
    const admise = r.json.accounts!.find((a) => a['accountId'] === s.json.accountId)!;
    expect(admise['state']).toBe('active');
    expect(admise['accessCodePending']).toBe(false);
  });

  it('an admission code can be minted ONLY for a pending account — an active one has no use for it, a missing one is a 404', async () => {
    const s = await inscrire();
    const m1 = await minterCode(s.json.accountId!);
    await admission(s.json.session!, m1.json.code!);
    const surActive = await minterCode(s.json.accountId!);
    expect(surActive.status).toBe(409);
    expect(surActive.json.reason).toBe('not_pending');
    const fantome = await minterCode('rs-inexistant');
    expect(fantome.status).toBe(404);
  });

  it('signup refuses by NAME what it cannot accept — and a taken email is 409, not a second account', async () => {
    const bon = await inscrire();
    const dup = await inscrire({ email: `awa${String(n).padStart(3, '0')}@example.bf` });
    expect(bon.status).toBe(200);
    expect(dup.status).toBe(409);
    expect(dup.json.reason).toBe('email_taken');

    for (const [over, field] of [
      [{ password: 'court' }, 'password'],
      [{ email: 'pas-un-email' }, 'email'],
      [{ phone: '12' }, 'phone'],
      [{ name: '   ' }, 'name'],
    ] as const) {
      const bad = await inscrire(over);
      expect(bad.status, field).toBe(400);
      expect((bad.json as { field?: string }).field, JSON.stringify(over)).toBe(field);
    }
    // the allowlist is the shape: a smuggled field is refused BY NAME
    const smuggle = await inscrire({ role: 'admin' });
    expect(smuggle.status).toBe(400);
    expect((smuggle.json as { field?: string }).field).toBe('role');
  });

  it('login: right password opens; wrong password and unknown email answer the SAME sentence — the door is not an email oracle', async () => {
    const s = await inscrire();
    const email = `awa${String(n).padStart(3, '0')}@example.bf`;

    const bon = await mf.dispatchFetch('http://c/reseller/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: MOT_DE_PASSE }),
    });
    const bonJson = safeJson(await bon.text()) as { session?: string; accountId?: string };
    expect(bon.status).toBe(200);
    expect(bonJson.accountId).toBe(s.json.accountId);
    expect(bonJson.session?.startsWith('SPS-')).toBe(true);

    const mauvais = await mf.dispatchFetch('http://c/reseller/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'pas-le-bon-mot' }),
    });
    const inconnu = await mf.dispatchFetch('http://c/reseller/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'personne@example.bf', password: MOT_DE_PASSE }),
    });
    const mauvaisText = await mauvais.text();
    const inconnuText = await inconnu.text();
    expect(mauvais.status).toBe(401);
    expect(inconnu.status).toBe(401);
    expect(mauvaisText).toBe(inconnuText); // byte-identical: no oracle
  });
});

describe('RESELLER-ACCOUNTS — the pause is a server fact, and it reads as a pause', () => {
  it('pause refuses her money read BY NAME; resume restores it; pending cannot be paused', async () => {
    const s = await inscrire();
    const mint = await minterCode(s.json.accountId!);
    await admission(s.json.session!, mint.json.code!);

    const pause = await mf.dispatchFetch('http://c/reseller/accounts/pause', {
      method: 'POST', headers: { ...cleC, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: s.json.accountId }),
    });
    expect(pause.status, await pause.clone().text()).toBe(200);

    const coupee = await ventes(s.json.session!);
    expect(coupee.status).toBe(403);
    expect(coupee.json['reason']).toBe('access_paused'); // by NAME — never a network fault, never a bad credential

    const resume = await mf.dispatchFetch('http://c/reseller/accounts/resume', {
      method: 'POST', headers: { ...cleC, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: s.json.accountId }),
    });
    expect(resume.status).toBe(200);
    expect((await ventes(s.json.session!)).status).toBe(200);

    // a PENDING account cannot be paused — admission is the only road out of
    // pending, or the state machine grows a founder-shaped bypass
    const p = await inscrire();
    const surPending = await mf.dispatchFetch('http://c/reseller/accounts/pause', {
      method: 'POST', headers: { ...cleC, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: p.json.accountId }),
    });
    expect(surPending.status).toBe(409);
  });

  it('every founder door refuses without key C — roster, mint, pause, resume, suivi — one uniform 401', async () => {
    for (const [path, method] of [
      ['/reseller/accounts', 'GET'],
      ['/reseller/accounts/access-code', 'POST'],
      ['/reseller/accounts/pause', 'POST'],
      ['/reseller/accounts/resume', 'POST'],
      ['/reseller/suivi', 'GET'],
    ] as const) {
      const res = await mf.dispatchFetch(`http://c${path}`, {
        method,
        ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: '{"accountId":"rs-0001"}' } : {}),
      });
      expect(res.status, path).toBe(401);
    }
  });
});

describe('RESELLER-ACCOUNTS — no credential ever leaves the book', () => {
  it('signup, login, roster and audit answers NEVER carry the password, a salt, a hash, or a code hash — raw bytes', async () => {
    const s = await inscrire();
    expect(s.text.includes(MOT_DE_PASSE)).toBe(false);
    expect(s.text).not.toMatch(/passwordHash|SaltHex|accessCodeHash/);

    const r = await roster();
    expect(r.status).toBe(200);
    expect(r.text.includes(MOT_DE_PASSE)).toBe(false);
    expect(r.text).not.toMatch(/passwordHash|SaltHex|accessCodeHash|password/);
    // …while the roster DOES tell him what he needs: who, reachable how, state
    const row = r.json.accounts!.find((a) => a['accountId'] === s.json.accountId)!;
    expect(row['name']).toContain('Awa');
    expect(row['state']).toBe('pending_access');
    expect(row['accessCodePending']).toBe(false);
    // the mint flips the roster signal so he can SEE a handout is in flight
    await minterCode(s.json.accountId!);
    const r2 = await roster();
    const row2 = r2.json.accounts!.find((a) => a['accountId'] === s.json.accountId)!;
    expect(row2['accessCodePending']).toBe(true);
  });
});

describe('RESELLER-ACCOUNTS — the session opens HER feed, and the suivi shows the founder her real numbers', () => {
  it('a confirmed sale attributed to her account reaches her session feed AND the suivi row, to the franc', async () => {
    const s = await inscrire();
    const mint = await minterCode(s.json.accountId!);
    await admission(s.json.session!, mint.json.code!);
    const rid = s.json.accountId!;

    // her storefront + listing ride HER server-minted id
    const i = `0${suivant()}`; // shortCode wants [A-Z]{2,12}-[0-9]{4}
    const sf = await mf.dispatchFetch('http://c/storefronts', {
      method: 'POST', headers: authed,
      body: JSON.stringify({
        commandId: `cmd-sf-${i}`, id: `sf-acct-${i}`, resellerId: rid, shortCode: `ACCT-${i}`,
        name: 'Chez Awa', zone: 'Gounghin, Ouagadougou', category: 'Général', correlationId: `corr-${i}`, at: T0,
      }),
    });
    expect(sf.status, await sf.clone().text()).toBe(200);
    const lst = await mf.dispatchFetch('http://c/listings', {
      method: 'POST', headers: authed,
      body: JSON.stringify({
        commandId: `cmd-lst-${i}`, listingId: `lst-acct-${i}`, storefrontId: `sf-acct-${i}`,
        resellerId: rid, productVersionId: 'pv-acct-1', offerVersion: 'ov-acct-1',
        markup: 1_500, correlationId: `corr-${i}`, at: T0,
      }),
    });
    expect(((await lst.json()) as { status?: string }).status).toBe('published');

    // one buyer pays (sandbox webhook is the only word for « paid »)
    const q = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: `acct-${i}`, pid: 'pv-acct-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
        attributionResellerId: rid, requestKey: `rk-acct-${i}-${'x'.repeat(8)}`,
      }),
    });
    const qText = await q.text();
    const quote = safeJson(qText) as { quoteId?: string };
    if (q.status !== 200 || quote.quoteId === undefined) throw new Error(`quote ${q.status} ${qText}`);
    await mf.dispatchFetch(`http://c/checkout/quote/${quote.quoteId}/reserve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: `cmd-res-${i}`, holderRef: `h-${i}` }),
    });
    const o = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: quote.quoteId, holderRef: `h-${i}`, commandId: `cmd-ord-${i}` }),
    });
    const oText = await o.text();
    if (o.status !== 200) throw new Error(`order ${o.status} ${oText}`);
    const order = safeJson(oText) as { amountPaidAtCheckout: number; paymentAttemptId?: string };
    const orderId = `ord-${quote.quoteId}`;
    // NB-3 — the webhook must name the LEG KEY the provider was charged with
    // (the vault refuses any other id): read off the order's own record.
    const ns = await mf.getDurableObjectNamespace('ORDER');
    const audit = (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as {
      legKeys?: Record<string, string>;
    };
    const attemptId = audit.legKeys?.['checkout'];
    if (attemptId === undefined) throw new Error('no checkout leg key');
    const provider = new MockPaymentProvider({});
    provider.initiateCharge({
      orderId, paymentAttemptId: attemptId,
      amount: order.amountPaidAtCheckout, correlationId: `corr-${orderId}`, requestedAtIso: T0,
    });
    const hook = await mf.dispatchFetch('http://c/checkout/webhook/payment', {
      method: 'POST', headers: signed, body: JSON.stringify(provider.webhookDeliveryPlan()[0]!.event),
    });
    expect(hook.status, await hook.clone().text()).toBe(200);

    // HER feed, on the SESSION — no feed code exists anywhere in this test
    const mesVentes = await ventes(s.json.session!);
    expect(mesVentes.status, mesVentes.text).toBe(200);
    const rows = mesVentes.json['ventes'] as { state: string; resellerNet: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe('confirmed');
    // her net to the franc: 20% fee on (C+M) = 0.2×2500 = 500 ⇒ net 2 000
    expect(rows[0]!.resellerNet).toBe(2_000);

    // and the founder's suivi shows the same woman, the same count, the same franc
    const suivi = await mf.dispatchFetch('http://c/reseller/suivi', { headers: cleC });
    const suiviJson = safeJson(await suivi.text()) as { lignes?: { accountId: string; ventes: number; netFcfa: number; name: string }[] };
    expect(suivi.status).toBe(200);
    const ligne = suiviJson.lignes!.find((l) => l.accountId === rid)!;
    expect(ligne.ventes).toBe(1);
    expect(ligne.netFcfa).toBe(2_000);
    expect(ligne.name).toContain('Awa');
  });
});

describe('CODE-REVU (founder ruling 2026-08-09) — the founder rereads an UNCONSUMED admission code; a spent one is gone', () => {
  const relire = async (accountId: string) => {
    const res = await mf.dispatchFetch('http://c/reseller/accounts/access-code/reveal', {
      method: 'POST',
      headers: { ...cleC, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    });
    return { status: res.status, json: safeJson(await res.text()) as { code?: string; reason?: string } };
  };

  it('mint → reveal answers the SAME code; the roster says revelable; admission SPENDS the plaintext with the hash', async () => {
    const elle = await inscrire();
    const accountId = elle.json.accountId!;
    const session = elle.json.session!;
    const minted = await minterCode(accountId);
    expect(minted.status).toBe(200);

    // The reveal answers the very bytes he gave her.
    const revu = await relire(accountId);
    expect(revu.status).toBe(200);
    expect(revu.json.code).toBe(minted.json.code);

    // The roster carries the FLAG, never the code (the allowlist holds).
    const roster = await mf.dispatchFetch('http://c/reseller/accounts', { headers: cleC });
    const rosterText = await roster.text();
    const rows = (safeJson(rosterText) as { accounts: Record<string, unknown>[] }).accounts;
    const ligne = rows.find((r) => r['accountId'] === accountId)!;
    expect(ligne).toMatchObject({ accessCodePending: true, accessCodeRevelable: true });
    expect(rosterText.includes(minted.json.code!)).toBe(false);

    // She uses it — the plaintext dies IN THE SAME WRITE as the hash: a spent
    // admission code must never linger anywhere, even founder-side.
    expect((await admission(session, minted.json.code!)).status).toBe(200);
    const apres = await relire(accountId);
    expect(apres.status).toBe(404);
    expect(apres.json.reason).toBe('no_code');
    // ⚠ The reveal's no_code alone only proves the HASH died (it is checked
    // first). `accessCodeRevelable` is computed from the PLAINTEXT field
    // (`a.accessCode !== undefined`), so the roster going false is the strip
    // itself, pinned (CODE-REVU verifier MINOR-4).
    const rosterApres = await mf.dispatchFetch('http://c/reseller/accounts', { headers: cleC });
    const rowsApres = (safeJson(await rosterApres.text()) as { accounts: Record<string, unknown>[] }).accounts;
    expect(rowsApres.find((r) => r['accountId'] === accountId)).toMatchObject({
      accessCodePending: false,
      accessCodeRevelable: false,
    });
  });

  it('reveal refuses without key C, and an unknown account by name', async () => {
    const naked = await mf.dispatchFetch('http://c/reseller/accounts/access-code/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'acc-nowhere' }),
    });
    expect(naked.status).toBe(401);
    const inconnu = await relire('acc-nowhere');
    expect(inconnu.status).toBe(404);
    expect(inconnu.json.reason).toBe('not_found');
  });
});

describe('CODE-REVU — the reseller FEED code rereads too, same law', () => {
  it('mint → /reseller/codes says revelable (never the code) → reveal answers the same bytes → revoke kills the reread', async () => {
    const minted = await mf.dispatchFetch('http://c/reseller/code', {
      method: 'POST',
      headers: { ...cleC, 'Content-Type': 'application/json' },
      body: JSON.stringify({ resellerId: 'rev-revu-1' }),
    });
    expect(minted.status).toBe(200);
    const code = (safeJson(await minted.text()) as { code: string }).code;

    const liste = await mf.dispatchFetch('http://c/reseller/codes', { headers: cleC });
    const listeText = await liste.text();
    const rows = (safeJson(listeText) as { codes: Record<string, unknown>[] }).codes;
    expect(rows.find((r) => r['resellerId'] === 'rev-revu-1')).toMatchObject({ revelable: true });
    expect(listeText.includes(code)).toBe(false);

    const revu = await mf.dispatchFetch('http://c/reseller/code/reveal', {
      method: 'POST',
      headers: { ...cleC, 'Content-Type': 'application/json' },
      body: JSON.stringify({ resellerId: 'rev-revu-1' }),
    });
    expect(revu.status).toBe(200);
    expect((safeJson(await revu.text()) as { code: string }).code).toBe(code);

    const coupe = await mf.dispatchFetch('http://c/reseller/code/revoke', {
      method: 'POST',
      headers: { ...cleC, 'Content-Type': 'application/json' },
      body: JSON.stringify({ resellerId: 'rev-revu-1' }),
    });
    expect(coupe.status).toBe(200);
    const mort = await mf.dispatchFetch('http://c/reseller/code/reveal', {
      method: 'POST',
      headers: { ...cleC, 'Content-Type': 'application/json' },
      body: JSON.stringify({ resellerId: 'rev-revu-1' }),
    });
    expect(mort.status).toBe(404);
  });
});

/**
 * ═══ CONTACT-WHATSAPP-1 (founder order 2026-08-23) — THE NUMBER REACHES HER
 * BOUTIQUE, and leaves it with her ═══
 *
 * « The reseller WhatsApp number will be the one he will put during the
 * registration » — the signup phone above IS that number. This walk drives
 * the whole road on the deployed bundle: signup → admission → her shop under
 * her OWN accountId → `GET /s/{slug}` carries `whatsapp` as wa.me-ready
 * digits — and a founder PAUSE takes it off the page with her. A shop whose
 * owner has no compte renders exactly as before this slice: no key, page
 * whole (the fail-open law).
 */
describe('CONTACT-WHATSAPP-1 — the registration number joins the boutique read, active accounts only', () => {
  async function creerBoutique(resellerId: string, i: string): Promise<string> {
    const res = await mf.dispatchFetch('http://c/storefronts', {
      method: 'POST',
      headers: { 'X-Write-Key': WRITE_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commandId: `cmd-wa-${i}`, id: `sf-wa-${i}`, resellerId,
        shortCode: `WACT-${i}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
        category: 'Général', correlationId: `corr-wa-${i}`, at: '2026-08-23T08:00:00.000Z',
      }),
    });
    expect(res.status, 'setup: storefront create').toBe(200);
    // The slug is DERIVED from the short code (slugFromShortCode), the same
    // convention every sibling harness uses.
    return `wact-${i}`;
  }
  const lireBoutique = async (slug: string) => {
    const res = await mf.dispatchFetch(`http://c/s/${encodeURIComponent(slug)}`);
    return { status: res.status, json: safeJson(await res.text()) as { whatsapp?: unknown } };
  };

  it('ACTIVE: the signup phone rides /s/{slug} normalized to wa.me digits — then a PAUSE removes it, a RESUME restores it', async () => {
    const s = await inscrire({ phone: '+226 70 11 22 33' });
    expect(s.status).toBe(200);
    const accountId = s.json.accountId!;
    const mint = await minterCode(accountId);
    await admission(s.json.session!, mint.json.code!);
    const slug = await creerBoutique(accountId, '0901');

    const avec = await lireBoutique(slug);
    expect(avec.status).toBe(200);
    // NORMALIZED, not echoed: `+` and spaces die server-side; wa.me digits ride.
    expect(avec.json.whatsapp).toBe('22670112233');

    // The founder pauses her → her number leaves her public page with her.
    const pause = await mf.dispatchFetch('http://c/reseller/accounts/pause', {
      method: 'POST', headers: { ...cleC, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    });
    expect(pause.status).toBe(200);
    const pausee = await lireBoutique(slug);
    expect(pausee.status).toBe(200);
    expect('whatsapp' in pausee.json, 'a paused reseller must not be writable-to').toBe(false);

    const resume = await mf.dispatchFetch('http://c/reseller/accounts/resume', {
      method: 'POST', headers: { ...cleC, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    });
    expect(resume.status).toBe(200);
    expect((await lireBoutique(slug)).json.whatsapp).toBe('22670112233');
  }, 60_000);

  it('NO COMPTE: a shop whose owner never signed up reads exactly as before — no key, page whole', async () => {
    // An id the minter can never produce (it mints rs-{4 digits} only), so a
    // same-run signup can never collide with this « no compte » owner.
    const slug = await creerBoutique('rs-sans-compte', '0902');
    const sans = await lireBoutique(slug);
    expect(sans.status).toBe(200);
    expect('whatsapp' in sans.json).toBe(false);
    // and the page is intact — the fields the vitrine renders are all present
    for (const champ of ['name', 'zone', 'slug', 'products']) {
      expect(champ in (sans.json as Record<string, unknown>), champ).toBe(true);
    }
  }, 60_000);

  it('PENDING: an account that signed up but was never admitted exposes nothing', async () => {
    const s = await inscrire({ phone: '+226 70 44 55 66' });
    const slug = await creerBoutique(s.json.accountId!, '0903');
    const lue = await lireBoutique(slug);
    expect(lue.status).toBe(200);
    expect('whatsapp' in lue.json).toBe(false);
  }, 60_000);

  it('⚠ the boutique read leaks NOTHING else from the account book — no email, no state, no credential material', async () => {
    const s = await inscrire({ phone: '+226 70 77 88 99' });
    await admission(s.json.session!, (await minterCode(s.json.accountId!)).json.code!);
    const slug = await creerBoutique(s.json.accountId!, '0904');
    const bytes = JSON.stringify((await lireBoutique(slug)).json);
    for (const banned of ['example.bf', 'passwordHash', 'passwordSalt', 'accessCode', 'pending_access', '"state"', 'email']) {
      expect(bytes.includes(banned), `the boutique read must not carry ${banned}`).toBe(false);
    }
    // and the scan is not vacuous — the number itself IS there
    expect(bytes.includes('22670778899')).toBe(true);
  }, 60_000);
});

/**
 * ═══ RAYONS-REVENDEUR-1 (founder, 2026-08-23) — « choose up to 5 categories
 * products he wants to resell » AT SIGNUP, on the deployed bundle ═══
 */
describe('RAYONS-REVENDEUR-1 — the signup carries her rayons; every account answer gives them back', () => {
  it('signup stores up to five (deduped after trim); signup, session, login and the roster all answer them', async () => {
    const s = await inscrire({ categories: ['Mode femme', ' Sacs ', 'Sacs', 'Poussette'] });
    expect(s.status, s.text).toBe(200);
    const surSignup = (s.json as { categories?: unknown }).categories;
    expect(surSignup).toEqual(['Mode femme', 'Sacs', 'Poussette']);

    const viaSession = await mf.dispatchFetch('http://c/reseller/session', {
      method: 'POST', headers: { Authorization: `Bearer ${s.json.session!}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    expect((safeJson(await viaSession.text()) as { categories?: unknown }).categories).toEqual(['Mode femme', 'Sacs', 'Poussette']);

    const rows = (await roster()).json.accounts ?? [];
    const mienne = rows.find((r) => r['accountId'] === s.json.accountId) as { categories?: unknown } | undefined;
    expect(mienne?.categories).toEqual(['Mode femme', 'Sacs', 'Poussette']);

    // …and LOGIN gives them back too (verifier: this spread was unpinned).
    const viaLogin = await mf.dispatchFetch('http://c/reseller/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `awa${String(n).padStart(3, '0')}@example.bf`, password: MOT_DE_PASSE }),
    });
    expect((safeJson(await viaLogin.text()) as { categories?: unknown }).categories).toEqual(['Mode femme', 'Sacs', 'Poussette']);
  }, 60_000);

  it('SIX categories refuse BY NAME; a non-string entry refuses; nothing is stored on a refusal', async () => {
    const six = await inscrire({ categories: ['a', 'b', 'c', 'd', 'e', 'f'] });
    expect(six.status).toBe(400);
    expect(six.json.reason).toBe('bad_field');
    expect((six.json as { field?: string }).field).toBe('categories');
    const mauvais = await inscrire({ categories: ['a', 7] });
    expect(mauvais.status).toBe(400);
    expect((mauvais.json as { field?: string }).field).toBe('categories');
  }, 60_000);

  it('no categories = the pre-slice signup, byte-compatible: no field anywhere', async () => {
    const s = await inscrire();
    expect(s.status).toBe(200);
    expect('categories' in (s.json as Record<string, unknown>)).toBe(false);
    const viaSession = await mf.dispatchFetch('http://c/reseller/session', {
      method: 'POST', headers: { Authorization: `Bearer ${s.json.session!}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    expect('categories' in (safeJson(await viaSession.text()) as Record<string, unknown>)).toBe(false);
  }, 60_000);
});
