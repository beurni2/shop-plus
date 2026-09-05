import type { Miniflare } from 'miniflare';

/**
 * ═══ ACCES-ARME-2 (a2b phase 2, founder « Seated » 2026-09-05) — THE SESSION
 * ROAD EVERY E2E SUITE WALKS TO WRITE ═══
 *
 * The shared write key is retired: a storefront write, a listings read, a
 * storefront read or the supply read is an ACTIVE reseller session or 401.
 * So a suite that needs a shop as a fixture no longer presents a key — it
 * seats a reseller the way the founder seats one, on the REAL doors of the
 * REAL bundle: `POST /reseller/signup` (her account, pending) → `POST
 * /reseller/accounts/access-code` on KEY C (the founder mints her code) →
 * `POST /reseller/admission` with her session bearer and the code (active).
 * The `accountId` the BOOK minted is the `resellerId` every shop she creates
 * must carry (ownership, RESELLER-AUTH-1) — a suite never chooses it.
 *
 * WHAT A SUITE MUST BIND for this road to exist on its own Miniflare:
 * `COMPTES: 'ResellerAccountsDO'` among its durable objects and
 * `CHECKOUT_OPS_SECRET: OPS_SECRET` among its bindings. Nothing here is a
 * double: every request crosses the composition root of the built Worker.
 */

export const OPS_SECRET = 'test-checkout-ops-secret-0001';
export const cleC = { Authorization: `Bearer ${OPS_SECRET}`, 'Content-Type': 'application/json' } as const;
export const MOT_DE_PASSE = 'grain-de-nere-77';

export interface Seance {
  /** The account id the book minted — the only `resellerId` her shops may carry. */
  readonly accountId: string;
  /** The `SPS-…` session bearer her device would hold. */
  readonly session: string;
  /** Headers for a JSON call as her: the bearer and the content type. */
  readonly bearer: { readonly Authorization: string; readonly 'Content-Type': 'application/json' };
  /** Headers for a raw-bytes call as her (media uploads): the bearer and the given type. */
  octets(contentType: string): { readonly Authorization: string; readonly 'Content-Type': string };
}

let compteur = 0;

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function poste(mf: Miniflare, path: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await mf.dispatchFetch(`http://c${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, json: safeJson(text), text };
}

/** Signup → the founder mints → admission: an ACTIVE reseller, her session and her id. */
export async function seance(mf: Miniflare, etiquette = 'awa'): Promise<Seance> {
  const i = String((compteur += 1)).padStart(4, '0');
  const s = await poste(mf, '/reseller/signup', { 'Content-Type': 'application/json' }, {
    name: `Awa Traoré ${etiquette} ${i}`,
    email: `${etiquette}${i}@example.bf`,
    phone: `+226 70 ${i.slice(0, 2)} ${i.slice(2)} 00`,
    password: MOT_DE_PASSE,
  });
  if (s.status !== 200 || typeof s.json['accountId'] !== 'string' || typeof s.json['session'] !== 'string') {
    throw new Error(`seance: signup answered ${s.status} ${s.text}`);
  }
  const accountId = s.json['accountId'];
  const session = s.json['session'];
  const m = await poste(mf, '/reseller/accounts/access-code', { ...cleC }, { accountId });
  if (m.status !== 200 || typeof m.json['code'] !== 'string') {
    throw new Error(`seance: the founder could not mint (${m.status} ${m.text}) — is COMPTES bound and CHECKOUT_OPS_SECRET = OPS_SECRET?`);
  }
  const bearer = { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' } as const;
  const a = await poste(mf, '/reseller/admission', { ...bearer }, { code: m.json['code'] });
  if (a.status !== 200) throw new Error(`seance: admission answered ${a.status} ${a.text}`);
  return {
    accountId,
    session,
    bearer,
    octets: (contentType: string) => ({ Authorization: `Bearer ${session}`, 'Content-Type': contentType }),
  };
}
