import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * ═══ RESELLER-PILOTE-1 (AUDIT-SHOP-1 slice a1) — ONE reseller is seated while
 * storefront writes still ride the shared key; the next is refused BY NAME,
 * at the mint and at the door, and nothing of hers is spent ═══
 *
 * ITS OWN WORKER, deliberately. `accounts.e2e.test.ts` admits many accounts
 * to prove other laws and lifts the ceiling to do so; THIS instance binds NO
 * ceiling at all — the deployed shape (`wrangler.toml` states 1; absent means
 * 1 too) — so what is proven is the Worker as it ships, failing closed with
 * nothing to configure. The book is asked (the founder's roster) after every
 * refusal, never only the refusal's own sentence.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'plafond-pilote-'));
const OPS_SECRET = 'test-checkout-ops-secret-p001';
const cleC = { Authorization: `Bearer ${OPS_SECRET}`, 'Content-Type': 'application/json' };
const MOT_DE_PASSE = 'grain-de-nere-77';

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
  // NO RESELLER_ADMISSION_CEILING — exactly the deployed Worker's env.
  bindings: {
    STOREFRONT_WRITE_SECRET: 'test-write-secret-p001',
    PAYMENT_WEBHOOK_SECRET: 'test-payment-webhook-secret-p001',
    CHECKOUT_OPS_SECRET: OPS_SECRET,
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
async function inscrire() {
  const i = String((n += 1)).padStart(3, '0');
  const res = await mf.dispatchFetch('http://c/reseller/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Awa Traoré ${i}`, email: `awa${i}@example.bf`, phone: `+226 70 00 00 ${i}`, password: MOT_DE_PASSE }),
  });
  const text = await res.text();
  expect(res.status, text).toBe(200);
  const json = safeJson(text) as { accountId: string; session: string };
  return { accountId: json.accountId, session: json.session };
}

async function founder(path: string, accountId: string) {
  const res = await mf.dispatchFetch(`http://c/reseller/accounts${path}`, { method: 'POST', headers: cleC, body: JSON.stringify({ accountId }) });
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

async function ventes(session: string) {
  const res = await mf.dispatchFetch('http://c/reseller/ventes', { headers: { Authorization: `Bearer ${session}` } });
  return { status: res.status, json: safeJson(await res.text()) };
}

async function ligne(accountId: string) {
  const res = await mf.dispatchFetch('http://c/reseller/accounts', { headers: cleC });
  const json = safeJson(await res.text()) as { accounts?: Record<string, unknown>[] };
  const row = json.accounts?.find((a) => a['accountId'] === accountId);
  expect(row, `${accountId} is not on the roster`).toBeDefined();
  return row!;
}

describe('RESELLER-PILOTE-1 — the book seats one, and refuses the second by name at both doors', () => {
  it('two pending, two codes; the first to enter is seated — then the mint refuses, the door refuses, and pausing the seated one frees nothing', async () => {
    const a = await inscrire();
    const b = await inscrire();

    // Nobody seated yet: BOTH mints go through. The mint cannot know which of
    // two pending accounts will reach the door first, and refusing here would
    // block the founder from minting the one code the pilot needs.
    const codeA = await founder('/access-code', a.accountId);
    expect(codeA.status, codeA.text).toBe(200);
    const codeB = await founder('/access-code', b.accountId);
    expect(codeB.status, codeB.text).toBe(200);

    // A enters: seated.
    const entreeA = await admission(a.session, codeA.json.code!);
    expect(entreeA.status, entreeA.text).toBe(200);
    expect(entreeA.json['state']).toBe('active');

    // THE MINT — a third, pending account cannot be given a code any more,
    // and the refusal has a name the console can act on.
    const c = await inscrire();
    const codeC = await founder('/access-code', c.accountId);
    expect(codeC.status, codeC.text).toBe(409);
    expect(codeC.json.reason).toBe('plafond_pilote');
    // …and the book agrees: nothing was minted for her.
    expect((await ligne(c.accountId))['accessCodePending']).toBe(false);

    // THE DOOR — B holds a RIGHT code, minted while the seat was free. She is
    // refused by the pilot, not by her code, and NOTHING of hers is spent.
    const entreeB = await admission(b.session, codeB.json.code!);
    expect(entreeB.status, entreeB.text).toBe(403);
    expect(entreeB.json['reason']).toBe('plafond_pilote');
    const rangB = await ligne(b.accountId);
    expect(rangB['state']).toBe('pending_access');
    expect(rangB['accessCodePending'], 'her unspent code must survive the refusal').toBe(true);
    // Her money read still says PENDING — the refusal did not become a pause.
    const ventesB = await ventes(b.session);
    expect(ventesB.status).toBe(403);
    expect(ventesB.json['reason']).toBe('access_required');
    // A WRONG code on a full pilot hears the pilot too — the seat is checked
    // before the code, so she never retypes against a door that cannot open.
    const faux = await admission(b.session, 'SPA-AAAA-BBBB-CCCC-DDDD');
    expect(faux.status).toBe(403);
    expect(faux.json['reason']).toBe('plafond_pilote');
    // Re-minting for her is refused the same way.
    const reMintB = await founder('/access-code', b.accountId);
    expect(reMintB.status).toBe(409);
    expect(reMintB.json.reason).toBe('plafond_pilote');

    // THE SEATED ONE IS UNTOUCHED by the ceiling: her feed answers, and her
    // spent code re-presented is the idempotent « déjà », never a refusal.
    expect((await ventes(a.session)).status).toBe(200);
    const encore = await admission(a.session, codeA.json.code!);
    expect(encore.status).toBe(200);
    expect(encore.json['deja']).toBe(true);

    // PAUSED COUNTS AS SEATED: pausing A frees no seat — or pause A → admit B
    // → resume A would seat two behind one shared write key.
    const pause = await founder('/pause', a.accountId);
    expect(pause.status, pause.text).toBe(200);
    const pendantPause = await admission(b.session, codeB.json.code!);
    expect(pendantPause.status).toBe(403);
    expect(pendantPause.json['reason']).toBe('plafond_pilote');
    expect((await founder('/access-code', c.accountId)).status).toBe(409);
    const resume = await founder('/resume', a.accountId);
    expect(resume.status, resume.text).toBe(200);

    // THE BOOK, whole: exactly one account past the door.
    const res = await mf.dispatchFetch('http://c/reseller/accounts', { headers: cleC });
    const roster = safeJson(await res.text()) as { accounts: { state: string }[] };
    expect(roster.accounts.filter((r) => r.state !== 'pending_access').map((r) => r.state)).toEqual(['active']);
  }, 60_000);
});
