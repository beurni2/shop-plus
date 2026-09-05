/**
 * THE GATES of the storefront service — every credential this Worker reads, and
 * the three properties each gate carries: FAIL CLOSED (no secret ⇒ nobody
 * passes), constant-time (the compare always runs, so timing reveals neither
 * whether a secret exists nor which one missed), and ONE identical 401 computed
 * at the composition root BEFORE any dispatch, so a refusal can never become an
 * existence oracle.
 *
 * SERVICE-WRITE-AUTH-1 (history) put the first gate here: a shared write key,
 * inlined in the reseller app bundle, in front of every write. It stopped
 * scanners and nothing more — shared, it could not tell one reseller from
 * another. RESELLER-AUTH-1 (a2a) bound every write and every reseller read to
 * HER SESSION with ownership; ACCES-ARME-2 (a2b, founder « Seated » 2026-09-05)
 * RETIRED THE KEY: there is no `STOREFRONT_WRITE_SECRET`, no `X-Write-Key`, and
 * no key path at the root any more — a reseller write is her session or 401.
 *
 * Reads (GET/HEAD/OPTIONS) that are buyer-facing carry no credential and are
 * never gated — buyers hold no secret and must never need one. `isWrite` is the
 * root's classifier for what is not a read.
 */

/** Methods that only ever read. Everything else is a write and needs a session. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * SP3.3a — the header the PAYMENT PROVIDER presents its own shared secret in.
 * Its OWN header and its OWN secret: the only route that can declare money
 * received is authenticated by nothing a phone or a browser ever holds.
 */
export const PAYMENT_WEBHOOK_KEY_HEADER = 'X-Payment-Webhook-Key';

/** The env the gates read their configured secrets from — wrangler SECRETS, NEVER
 * `[vars]` entries (all five repos are public; a var there would be published). */
export interface WriteAuthEnv {
  /**
   * SP3.3a — the payment webhook's shared secret. A `wrangler secret`, never a
   * `[vars]` entry and never in the bundle. UNSET ⇒ EVERY webhook is refused,
   * exactly as an unset write secret refuses every write: a payment route that
   * fails OPEN is a route that lets anyone declare an order paid.
   */
  readonly PAYMENT_WEBHOOK_SECRET?: string;
  /**
   * BC-1a — THE FOUNDER'S OWN DISPATCH CREDENTIAL (« value C », approved
   * 2026-08-02): it unlocks buyer contact (phone, quartier, repère) on the
   * dispatch read, and NOTHING else opens that door — not the webhook secret
   * (the provider holds it), not Boutik+'s ops key (a different Worker's
   * credential; buyer contact never crosses to Boutik+). It exists in exactly
   * two places: this Worker's encrypted store (`wrangler secret put`, value
   * piped) and the founder's own browser. UNSET ⇒ the dispatch read is 401
   * for everyone. ACCES-ARME-2 gave it the OPERATOR roads the retired write
   * key used to open for him — the storefront directory read, and the
   * takedown (unpublish) and cleanup (DELETE) of a shop, meant for the
   * orphaned key-era one — and nothing else.
   */
  readonly CHECKOUT_OPS_SECRET?: string;
  /**
   * READINESS-RETURN-1c — the RETURN LEG's intake secret. Boutik+ presents it
   * as Bearer when delivering `fulfillment.accepted.v1` / `fulfillment.ready.v1`.
   * ITS OWN VALUE, deliberately: `FULFILLMENT_WRITE_SECRET` is THIS Worker's
   * key to write INTO Boutik+, and one key must never unlock the other
   * direction's capability. UNSET ⇒ the intake refuses everyone and Boutik+'s
   * outbox retries until the founder sets both sides.
   *
   * SECTEURS-PROGRES-1 sharpened its meaning: once `SERA_PROGRESS_SECRET`
   * exists, this value opens ONLY the preparation facts — it is Boutik+'s
   * credential, not the progress door's.
   */
  readonly PROGRESS_WRITE_SECRET?: string;
  /**
   * SECTEURS-PROGRES-1 (AUDIT-SHOP-1 slice e) — SÉRA'S OWN intake credential.
   * One shared progress secret meant a compromised Boutik+ credential could
   * mint Séra's delivery marks — up to `delivery.validated.v1`, which feeds
   * settlement eligibility — and vice versa. Séra presents THIS value (its
   * `SHOP_PROGRESS_SECRET` env holds it) for `delivery.validated.v1`,
   * `delivery.refused.v1` and the transit marks; Boutik+'s value no longer
   * opens those doors. UNSET ⇒ the split does not exist yet and the one
   * shared value opens every progress door, byte-identical to before this
   * slice — both sides' outboxes retry across the founder's swap window, so
   * nothing is lost while the two `wrangler secret put` commands land.
   */
  readonly SERA_PROGRESS_SECRET?: string;
}

/** A write is any request whose method is not a safe read method. */
export function isWrite(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

/**
 * Constant-time equality that leaks neither length nor content through timing:
 * both inputs are HMAC-SHA-256'd under a fresh per-call random key, then the two
 * fixed 32-byte digests are compared with a branch-free XOR fold. WebCrypto is
 * present in both workerd (prod / Miniflare) and Node 20+.
 *
 * EXPORTED since VRAI-SUIVI: the OrderDO's remise door compares a buyer-held
 * token against its stored value and must do it with THIS house compare, not a
 * second hand-rolled one beside it.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const [da, db] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(a)),
    crypto.subtle.sign('HMAC', key, enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i += 1) diff |= (va[i] as number) ^ (vb[i] as number);
  return diff === 0;
}

/**
 * SP3.3a — THE PAYMENT WEBHOOK GATE, FAIL CLOSED. True iff a non-empty secret
 * is configured AND the request's header matches it: the compare runs
 * unconditionally (even with no secret configured) so timing never reveals
 * whether a secret exists, and the length guard keeps an unset or empty secret
 * from ever matching a presented key.
 *
 * IT IS THE WHOLE AUTHENTICATION OF THE ONLY ROUTE THAT CAN DECLARE MONEY
 * RECEIVED. It runs at the composition root BEFORE any dispatch, so a rejected
 * webhook never reaches a Durable Object and the 401 can never become an
 * existence oracle for order ids.
 */
export async function paymentWebhookAuthorized(request: Request, env: WriteAuthEnv): Promise<boolean> {
  const secret = env.PAYMENT_WEBHOOK_SECRET ?? '';
  const provided = request.headers.get(PAYMENT_WEBHOOK_KEY_HEADER) ?? '';
  const match = await timingSafeEqual(provided, secret);
  return secret.length > 0 && match;
}

/** The one 401 — IDENTICAL for every rejection, so it can never leak. */
export function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

/**
 * BC-1a — the dispatch read's gate: `Authorization: Bearer` against
 * CHECKOUT_OPS_SECRET, FAIL CLOSED, constant-time, one identical 401 computed
 * before any dispatch — the same three properties every gate in this file
 * carries, on the founder's own credential. ACCES-ARME-2: the composition root
 * also asks it for the operator roads on the storefront surface (the directory
 * read, a shop's takedown and cleanup) once no session answered.
 */
export async function rejectUnauthorizedOpsRead(request: Request, env: WriteAuthEnv): Promise<Response | null> {
  const secret = env.CHECKOUT_OPS_SECRET ?? '';
  const auth = request.headers.get('Authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  const match = await timingSafeEqual(provided, secret);
  return secret.length > 0 && match ? null : unauthorized();
}


/**
 * READINESS-RETURN-1c → SECTEURS-PROGRES-1 — the return leg's gate, now a
 * WRITER CLASSIFIER. The same three properties every gate in this file
 * carries: FAIL CLOSED (no secret ⇒ nobody passes, including a caller who
 * sends nothing — empty-vs-empty must never match), constant-time (BOTH
 * compares always run, so timing reveals neither which secret exists nor
 * which one missed), and ONE identical 401 computed before any dispatch, so
 * a refusal can never become an existence oracle for order ids.
 *
 * `'boutik'` = `PROGRESS_WRITE_SECRET` (preparation facts only) · `'sera'` =
 * `SERA_PROGRESS_SECRET` (delivery marks + transit only) · `'either'` = the
 * legacy mode while the Séra binding does not exist yet: the one shared value
 * opens every progress door, byte-identical to before the split — the split
 * cannot exist before the founder mints the second credential. If the two
 * bindings ever held the SAME value, the boutik class wins the tie — NOT the
 * legacy world (Séra's delivery marks would refuse 403 and retry on Séra's
 * alarm until the values diverge): fail-closed in the right direction, never
 * an escalation.
 */
export type ProgressWriter = 'boutik' | 'sera' | 'either';

export async function progressWriter(request: Request, env: WriteAuthEnv): Promise<ProgressWriter | null> {
  const boutik = env.PROGRESS_WRITE_SECRET ?? '';
  const sera = env.SERA_PROGRESS_SECRET ?? '';
  const auth = request.headers.get('Authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  const matchBoutik = await timingSafeEqual(provided, boutik);
  const matchSera = await timingSafeEqual(provided, sera);
  if (sera.length === 0) return boutik.length > 0 && matchBoutik ? 'either' : null;
  if (boutik.length > 0 && matchBoutik) return 'boutik';
  if (matchSera) return 'sera';
  return null;
}
