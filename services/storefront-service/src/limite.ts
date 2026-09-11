/**
 * ═══ LIMITE-ANONYME-1 — A CEILING ON THE ANONYMOUS DOORS, AT THE EDGE ═══
 *
 * WHY: the doors on this Worker that answer with no credential at all — the
 * buyer's map tiles (`GET /tiles/…`, TUILES-PROXY), a new quote, a new order,
 * a new liste; and, since LIMITE-REVENDEUSE-1, the reseller's signup and
 * login. A buyer holds no key and must never need one, and a stranger must be
 * able to create an account and log in; but nothing bounded the caller, and on
 * the Free plan every one of those requests spends the same daily budget the
 * paying road spends (the verifier's finding on TUILES-PROXY: an unlimited
 * proxy coupled to checkout's availability, and lending abusers our identity
 * at the tile host).
 *
 * WHAT: Cloudflare's Rate Limiting binding (`[[ratelimits]]` in wrangler.toml)
 * — a per-colo sliding count, no storage of ours, keyed here by the caller's
 * address. Four limiters, four budgets: the tile road; the buyer's three
 * create doors together; the reseller's signup; the reseller's login (which
 * the PBKDF2 probe on /health shares, costing what a login costs). Budgets are
 * never shared across those lines: a neighbourhood ordering must never lock a
 * reseller out, and a signup flood (an account and one of 10 000 ids each)
 * is not a login flood (one derivation and one guess each). Over the ceiling
 * the door answers `429 too_many_requests` with a `Retry-After`; the map drops
 * that tile to its calm ground, the checkout shows its honest generic refusal
 * (« Rien n'a été payé » stays true), the reseller app says « attendez ».
 *
 * THE NUMBERS ARE FOR OUAGADOUGOU, NOT FOR A DATACENTRE. Many phones here sit
 * behind ONE carrier address (carrier-grade NAT), so a ceiling per address is
 * a ceiling per NEIGHBOURHOOD: it must let thirty buyers open the map at the
 * same minute and refuse a scraper. What one buyer costs, counted from the
 * buyer app: a map open asks ~20 tiles (a 360×480 view at zoom 17 plus one
 * ring) and a drag re-mount up to ~20 more; a PRICE SCREEN asks TWO quotes
 * (the full ask and the door ask, concurrently — quote-model.ts) and asks
 * them again on every « Réessayer », « Voir le prix à jour » and expiry
 * refresh; an order is one ask per purchase and one more per payment retry;
 * a liste is one ask. Thirty buyers in one minute ≈ 90 creates and 600–1 200
 * tiles. Hence (wrangler.toml): tiles 1 200 / minute, creates 180 / minute,
 * per address — twice the neighbourhood, a fraction of any flood.
 *
 * WHAT THIS DOES NOT CLOSE, said plainly. A REFUSED ASK IS STILL A COUNTED
 * ASK: the Free plan meters every invocation, and a 429 we answer is one. So
 * this ceiling bounds the WORK one address can make us do — the misses that
 * reach the tile host under our name, the objects created, the bodies read —
 * and bounds NOTHING of the request count: 100 000 tile asks from one address
 * still spend the day's budget, refused or not, and checkout's availability
 * is coupled to that exactly as before. Only a paid plan or a zone-level rule
 * (which needs a custom domain) bounds the count. Named here so nobody reads
 * « rate-limited » as « safe ».
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
  const adresse = request.headers.get('CF-Connecting-IP');
  return adresse === null ? CLE_SANS_ADRESSE : cleAdresse(adresse);
}

/**
 * An IPv6 client owns a whole /64 (2^64 addresses), so keyed on the full
 * address a deliberate caller would never meet the ceiling; keyed on the /64
 * it is one caller. IPv4 — every Burkina mobile network today, behind carrier
 * NAT — is the address itself.
 */
export function cleAdresse(adresse: string): string {
  if (!adresse.includes(':') || adresse.includes('.')) return adresse;
  const [tete = '', queue = ''] = adresse.split('::');
  const gauche = tete === '' ? [] : tete.split(':');
  const droite = queue === '' ? [] : queue.split(':');
  const zeros = Array.from({ length: Math.max(8 - gauche.length - droite.length, 0) }, () => '0');
  return [...gauche, ...zeros, ...droite]
    .slice(0, 4)
    .map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':') + '::/64';
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

/** The same refusal in the account doors' own shape — `{ ok, reason }` is what
 *  every one of those doors answers and what the reseller app reads; a 429
 *  there already means « wait » on her screen. */
export function refusLimiteCompte(): Response {
  return Response.json({ ok: false, reason: 'too_many_requests' }, { status: 429, headers: { 'Retry-After': String(RETRY_AFTER_S) } });
}
