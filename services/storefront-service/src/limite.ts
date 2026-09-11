/**
 * ═══ LIMITE-ANONYME-1 — A CEILING ON THE ANONYMOUS DOORS, AT THE EDGE ═══
 *
 * WHY: three doors on this Worker answer with no credential at all — the
 * buyer's map tiles (`GET /tiles/…`, TUILES-PROXY), a new quote (`POST
 * /checkout/quote`) and a new order (`POST /checkout/order`). A buyer holds no
 * key and must never need one, so nothing can be asked of her; but nothing
 * bounded the caller either, and on the Free plan every one of those requests
 * spends the same daily budget the paying road spends (the verifier's finding
 * on TUILES-PROXY: an unlimited proxy coupled to checkout's availability, and
 * lending abusers our identity at the tile host).
 *
 * WHAT: Cloudflare's Rate Limiting binding (`[[ratelimits]]` in wrangler.toml)
 * — a per-colo sliding count, no storage of ours, keyed here by the caller's
 * address. Two limiters, two budgets: the tile road, and the two create doors
 * together. Over the ceiling the door answers `429 too_many_requests` with a
 * `Retry-After`; the map drops that tile to its calm ground, the checkout
 * shows its honest generic refusal (« Rien n'a été payé » stays true).
 *
 * THE NUMBERS ARE FOR OUAGADOUGOU, NOT FOR A DATACENTRE. Many phones here sit
 * behind ONE carrier address (carrier-grade NAT), so a ceiling per address is
 * a ceiling per NEIGHBOURHOOD: it must let thirty buyers open the map at the
 * same minute and refuse a scraper. A map open asks ~20 tiles and a drag ~20
 * more; a quote is asked once per screen, an order once per purchase. Hence
 * (wrangler.toml): tiles 600 / minute, creates 60 / minute, per address.
 *
 * WHAT THIS DOES NOT CLOSE, said plainly: a single determined address can
 * still spend 600 × 1 440 tile asks a day, far over a Free plan's daily
 * budget. This ceiling stops floods by accident (a looping client, a naive
 * scraper) and slows the deliberate ones; the budget itself is closed only by
 * a paid plan or by a zone-level rule (which needs a custom domain). Named
 * here so nobody reads « rate-limited » as « safe ».
 *
 * FAIL OPEN, BY LAW: no binding (a deploy before its config, a test suite that
 * binds none) or a binding that throws leaves the door OPEN. A limiter that
 * failed closed would turn a platform hiccup into every buyer refused — and
 * the doors were open for months before it existed.
 */

/** The binding's shape (workers-types `RateLimit`), as this module uses it. */
export interface Limiteur {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** The caller as Cloudflare names it — set by the edge, never by the client. */
export const CLE_SANS_ADRESSE = 'sans-adresse';
export function cleAppelant(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? CLE_SANS_ADRESSE;
}

/** Is this request within the ceiling? Open when no ceiling exists or it cannot be asked. */
export async function admis(limiteur: Limiteur | undefined, request: Request): Promise<boolean> {
  if (limiteur === undefined) return true;
  try {
    return (await limiteur.limit({ key: cleAppelant(request) })).success;
  } catch {
    return true;
  }
}

export const RETRY_AFTER_S = 60;

/** The refusal, by name: the caller knows what happened and when to come back. */
export function refusLimite(): Response {
  return Response.json({ error: 'too_many_requests' }, { status: 429, headers: { 'Retry-After': String(RETRY_AFTER_S) } });
}
