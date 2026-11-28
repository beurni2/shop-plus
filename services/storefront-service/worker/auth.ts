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

import { PAYMENT_PROVIDER_KIND } from '../src/payment-port.js';

/** Methods that only ever read. Everything else is a write and needs a session. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * SP3.3a — the header the PAYMENT PROVIDER presents its own shared secret in.
 * Its OWN header and its OWN secret: the only route that can declare money
 * received is authenticated by nothing a phone or a browser ever holds.
 */
export const PAYMENT_WEBHOOK_KEY_HEADER = 'X-Payment-Webhook-Key';

/** The env the gates read their configured secrets from — wrangler SECRETS, NEVER
 * `[vars]` entries (all five repos are public; a var there would be published).
 *
 * Every key checked here has a `_NEXT` twin, so a key changes with no gap
 * (Execution Contract §11, « overlapping windows »): while `X_NEXT` is set, its
 * value opens exactly what `X` opens — the same doors, the same class, the same
 * answer — and nothing more. The change is: put the new value in `X_NEXT`, move
 * the sender to it, put it in `X`, delete `X_NEXT`; the old value is then
 * refused. */
export interface WriteAuthEnv {
  /**
   * SP3.3a — the payment webhook's shared secret. A `wrangler secret`, never a
   * `[vars]` entry and never in the bundle. UNSET ⇒ EVERY webhook is refused,
   * exactly as an unset write secret refuses every write: a payment route that
   * fails OPEN is a route that lets anyone declare an order paid.
   */
  readonly PAYMENT_WEBHOOK_SECRET?: string;
  readonly PAYMENT_WEBHOOK_SECRET_NEXT?: string;
  /**
   * The founder's sandbox tool's OWN key (scripts/sandbox-payment-confirm.mjs),
   * presented on the same header at the same doors, so the provider's key never
   * has to sit in the tool's workflow. It opens those doors only while
   * `PAYMENT_PROVIDER_KIND` (src/payment-port.ts) reads 'sandbox': once the
   * Worker charges through anything else, it opens nothing.
   */
  readonly SANDBOX_CONFIRM_SECRET?: string;
  readonly SANDBOX_CONFIRM_SECRET_NEXT?: string;
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
  readonly CHECKOUT_OPS_SECRET_NEXT?: string;
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
  readonly PROGRESS_WRITE_SECRET_NEXT?: string;
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
  /** Opens nothing while `SERA_PROGRESS_SECRET` is unset: the key alone arms the split. */
  readonly SERA_PROGRESS_SECRET_NEXT?: string;
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
 * A key and its `_NEXT`: true iff the presented value equals a NON-EMPTY one
 * of the two. Both compares always run and are awaited before anything is
 * combined, so timing tells neither which value is set nor which one missed;
 * the length guards keep an unset or empty value from ever matching. The
 * answer is a boolean: which of the two matched is never returned, logged or
 * answered.
 */
async function cleOuSuivante(provided: string, cle: string | undefined, suivante: string | undefined): Promise<boolean> {
  const actuelle = cle ?? '';
  const prochaine = suivante ?? '';
  const [egaleActuelle, egaleProchaine] = await Promise.all([
    timingSafeEqual(provided, actuelle),
    timingSafeEqual(provided, prochaine),
  ]);
  return (actuelle.length > 0 && egaleActuelle) || (prochaine.length > 0 && egaleProchaine);
}

/**
 * SP3.3a — THE PAYMENT WEBHOOK GATE, FAIL CLOSED. True iff the request's
 * header matches a non-empty configured key: the provider's
 * (`PAYMENT_WEBHOOK_SECRET` or its next) — or, only while this Worker charges
 * through the sandbox, the founder's sandbox tool key (or its next). All four
 * compares run unconditionally and are awaited before any is combined, so
 * timing never reveals which keys exist.
 *
 * IT IS THE WHOLE AUTHENTICATION OF THE ONLY ROUTE THAT CAN DECLARE MONEY
 * RECEIVED. It runs at the composition root BEFORE any dispatch, so a rejected
 * webhook never reaches a Durable Object and the 401 can never become an
 * existence oracle for order ids.
 */
export async function paymentWebhookAuthorized(request: Request, env: WriteAuthEnv): Promise<boolean> {
  const provided = request.headers.get(PAYMENT_WEBHOOK_KEY_HEADER) ?? '';
  const [fournisseur, outilBacASable] = await Promise.all([
    cleOuSuivante(provided, env.PAYMENT_WEBHOOK_SECRET, env.PAYMENT_WEBHOOK_SECRET_NEXT),
    cleOuSuivante(provided, env.SANDBOX_CONFIRM_SECRET, env.SANDBOX_CONFIRM_SECRET_NEXT),
  ]);
  return fournisseur || (PAYMENT_PROVIDER_KIND === 'sandbox' && outilBacASable);
}

/** The one 401 — IDENTICAL for every rejection, so it can never leak. */
export function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

/**
 * BC-1a — the dispatch read's gate: `Authorization: Bearer` against
 * CHECKOUT_OPS_SECRET (or its next), FAIL CLOSED, constant-time, one
 * identical 401 computed before any dispatch — the same three properties
 * every gate in this file carries, on the founder's own credential.
 * ACCES-ARME-2: the composition root
 * also asks it for the operator roads on the storefront surface (the directory
 * read, a shop's takedown and cleanup) once no session answered.
 */
export async function rejectUnauthorizedOpsRead(request: Request, env: WriteAuthEnv): Promise<Response | null> {
  const auth = request.headers.get('Authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  const match = await cleOuSuivante(provided, env.CHECKOUT_OPS_SECRET, env.CHECKOUT_OPS_SECRET_NEXT);
  return match ? null : unauthorized();
}


/**
 * READINESS-RETURN-1c → SECTEURS-PROGRES-1 — the return leg's gate, now a
 * WRITER CLASSIFIER. The same three properties every gate in this file
 * carries: FAIL CLOSED (no secret ⇒ nobody passes, including a caller who
 * sends nothing — empty-vs-empty must never match), constant-time (ALL FOUR
 * compares always run, so timing reveals neither which secret exists nor
 * which one missed), and ONE identical 401 computed before any dispatch, so
 * a refusal can never become an existence oracle for order ids.
 *
 * `'boutik'` = `PROGRESS_WRITE_SECRET` or its next (preparation facts only) ·
 * `'sera'` = `SERA_PROGRESS_SECRET` or its next (delivery marks, transit and
 * a parcel lost on the road only) · `'either'` = the legacy mode while the
 * Séra binding does not exist yet: the one shared value
 * opens every progress door, byte-identical to before the split — the split
 * cannot exist before the founder mints the second credential. If a Boutik+
 * value and a Séra value (either key or its next) are ever the SAME, the
 * boutik class wins the tie — NOT the legacy world (Séra's delivery marks
 * would refuse 403 and retry on Séra's alarm until the values diverge):
 * fail-closed in the right direction, never an escalation.
 */
export type ProgressWriter = 'boutik' | 'sera' | 'either';

export async function progressWriter(request: Request, env: WriteAuthEnv): Promise<ProgressWriter | null> {
  const auth = request.headers.get('Authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  const [matchBoutik, matchSera] = await Promise.all([
    cleOuSuivante(provided, env.PROGRESS_WRITE_SECRET, env.PROGRESS_WRITE_SECRET_NEXT),
    cleOuSuivante(provided, env.SERA_PROGRESS_SECRET, env.SERA_PROGRESS_SECRET_NEXT),
  ]);
  // The split exists once SERA_PROGRESS_SECRET does — its next value alone
  // never arms it, so in the legacy world Séra's next opens nothing.
  if ((env.SERA_PROGRESS_SECRET ?? '').length === 0) return matchBoutik ? 'either' : null;
  if (matchBoutik) return 'boutik';
  if (matchSera) return 'sera';
  return null;
}
