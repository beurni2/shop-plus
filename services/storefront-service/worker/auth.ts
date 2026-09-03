/**
 * SERVICE-WRITE-AUTH-1 — the shared-secret WRITE gate for the storefront service.
 *
 * THE FINDING it closes: every write endpoint on the live Worker
 * (POST /storefronts · /storefronts/:id/publish · /unpublish · /listings ·
 * /listings/:id/hide · /media/upload) was reachable with NO credential — anyone
 * with the URL could create storefronts or write objects into the founder's R2
 * bucket. This gate sits at the ONE deployed entry (worker/index.ts) BEFORE any
 * dispatch, so a rejected write never reaches a Durable Object or an existence
 * lookup — the 401 can never become an existence oracle.
 *
 * WHAT IT IS AND IS NOT: a shared secret, inlined in the reseller app bundle
 * (EXPO_PUBLIC_*). It stops scanners and casual abuse. It does NOT stop a
 * determined attacker who decompiles the app, and — because the secret is shared —
 * it does NOT stop one reseller writing to another's storefront. Real per-reseller
 * identity is a HARD GATE before any reseller other than the founder onboards
 * (journaled).
 *
 * Reads (GET/HEAD/OPTIONS) carry no credential and are never gated — buyers hold
 * no secret and must never need one.
 */

/** Methods that only ever read. Everything else is a write and needs the key. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The header the reseller app presents the shared write key in. */
export const WRITE_KEY_HEADER = 'X-Write-Key';

/**
 * SP3.3a — the header the PAYMENT PROVIDER presents its own shared secret in.
 * A DIFFERENT header and a DIFFERENT secret from the write key on purpose: the
 * write key ships inside the reseller app bundle and is readable by anyone who
 * downloads it, so reusing it here would mean every phone that has the app can
 * assert that money arrived.
 */
export const PAYMENT_WEBHOOK_KEY_HEADER = 'X-Payment-Webhook-Key';

/** The env the gate reads its configured secret from — a wrangler SECRET, NEVER a
 * `[vars]` entry (all five repos are public; a var there would be published). */
export interface WriteAuthEnv {
  readonly STOREFRONT_WRITE_SECRET?: string;
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
   * dispatch read, and NOTHING else opens that door — not the write key (it
   * ships in the reseller bundle), not the webhook secret (the provider
   * holds it), not Boutik+'s ops key (a different Worker's credential;
   * buyer contact never crosses to Boutik+). It exists in exactly two
   * places: this Worker's encrypted store (`wrangler secret put`, value
   * piped) and the founder's own browser. UNSET ⇒ the dispatch read is 401
   * for everyone.
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
 * The shared key check, FAIL CLOSED. True iff a non-empty secret is configured AND
 * the request's `X-Write-Key` matches it (constant-time). The compare runs
 * unconditionally (even with no secret configured) so timing does not reveal
 * whether a secret exists; the length guard keeps it fail-closed — an unset/empty
 * secret can never match a non-empty presented key.
 */
export async function keyAuthorized(request: Request, env: WriteAuthEnv): Promise<boolean> {
  const secret = env.STOREFRONT_WRITE_SECRET ?? '';
  const provided = request.headers.get(WRITE_KEY_HEADER) ?? '';
  const match = await timingSafeEqual(provided, secret);
  return secret.length > 0 && match;
}

/**
 * SP3.3a — THE PAYMENT WEBHOOK GATE, FAIL CLOSED. Character-for-character the
 * same shape as `keyAuthorized` above, on a DIFFERENT secret and a DIFFERENT
 * header: the compare runs unconditionally so timing never reveals whether a
 * secret is configured, and the length guard keeps an unset secret from ever
 * matching a presented key.
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
 * WRITE gate. Resolves to `null` iff authorised; else a 401, computed BEFORE any
 * target lookup so it can never be an existence oracle. A Worker with no secret
 * set refuses every write. Reads (safe methods) short-circuit to `null` — the
 * admin list (a key-gated GET) is gated separately at the composition root.
 */
export async function rejectUnauthorizedWrite(request: Request, env: WriteAuthEnv): Promise<Response | null> {
  if (!isWrite(request.method)) return null;
  return (await keyAuthorized(request, env)) ? null : unauthorized();
}

/**
 * BC-1a — the dispatch read's gate: `Authorization: Bearer` against
 * CHECKOUT_OPS_SECRET, FAIL CLOSED, constant-time, one identical 401 computed
 * before any dispatch — the same three properties every gate in this file
 * carries, on the founder's own credential.
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
 * bindings ever held the SAME value, the boutik class wins the tie: the
 * shared-value world is exactly the legacy world, never an escalation.
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
