/**
 * PWA CLIENTE — THE BUYER'S QUOTE PORT (SP3.2b).
 *
 * ═══ WHAT THIS FILE IS ═══
 *
 * The one seam between the buyer's screens and the price. Everything above it
 * renders bytes; everything below it is the checkout service. It is the exact
 * analogue of `vitrine/profile.ts`'s storefront port — same shape, same env
 * gating, same « a network boundary is checked, never trusted » discipline —
 * applied to the surface where the money is.
 *
 * ═══ THERE IS NO AMOUNT TO SEND, AND THAT IS THE POINT ═══
 *
 * `QuoteIntent` names WHAT the buyer wants (shop, product, destination, payee,
 * mode). It carries no `buyerTotal`, no `deliveryFee`, not even a « for
 * display » copy of one, because `checkout-core.ts`'s `QuoteRequest` has no such
 * field either: a price the buyer names is UNREPRESENTABLE on this wire, not
 * merely rejected. The body this port POSTs is the service's allowlist exactly
 * — an unknown key is a 400 by the service's design, and that is a feature: a
 * caller with a wrong model of who owns what finds out immediately.
 *
 * ═══ THREE ANSWERS, AND ONLY ONE OF THEM IS A PRICE ═══
 *
 *   · `quote`        — the eight wire fields, every amount shape-checked.
 *   · `refused`      — the SERVER'S OWN NAME, verbatim. This port never
 *                      translates, never groups, never softens a refusal: the
 *                      buyer's screen needs a different true sentence for each
 *                      name, so the name must arrive intact.
 *   · `unreachable`  — offline, a thrown fetch, an unreadable body, or a body
 *                      whose amounts do not shape-check. NEVER a partial quote
 *                      on a screen, and never an invented one.
 *
 * TOTAL: nothing here throws. A money surface that can throw is a money surface
 * that can 500 at the buyer, and there is no honest French for that.
 */

import { composeQuote, ROBE } from './seed';

/** The buyer-facing projection of a canon Quote — `BuyerQuoteView`, the eight
 *  fields `toBuyerQuoteView` builds by hand. No economics field exists on it. */
export interface ServerQuote {
  readonly quoteId: string;
  readonly paymentMode: string;
  readonly productSubtotal: number;
  readonly deliveryFee: number;
  readonly buyerTotal: number;
  readonly amountPaidAtCheckout: number;
  readonly amountDueAtDelivery: number;
  readonly expiry: string;
}

export type QuoteOutcome =
  | { readonly status: 'quote'; readonly quote: ServerQuote }
  /** The server's own refusal name, carried verbatim — never re-worded here. */
  | { readonly status: 'refused'; readonly reason: string }
  /**
   * NOTHING ANSWERED. A thrown fetch, and only that: no DNS, no route, no
   * network. This is the ONLY outcome allowed to become « Pas de connexion »
   * on screen, because it is the only one where that sentence is true.
   */
  | { readonly status: 'unreachable' }
  /**
   * SOMETHING ANSWERED AND IT WAS NOT USABLE — a body that will not parse, a
   * body whose amounts fail the money shape-check, a non-2xx carrying no
   * refusal name (a proxy's HTML error page, a 500).
   *
   * WHY THIS IS NOT `unreachable` (CTO finding, SP3.2b review): folding these
   * into « offline » told a buyer standing on full 4G that she had no network.
   * That is a lie on a money screen, and the fact that both end in « we cannot
   * show you a price » does not make them the same true sentence. The reply
   * arrived; we simply could not read it, and the screen says exactly that.
   */
  | { readonly status: 'unreadable' };

/** The two canon payment modes. There is no third, and no free-text mode. */
export type PaymentModeWire = 'FULL_PREPAY' | 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';

/** WHAT the buyer wants — the five values that decide an amount. No amount. */
export interface QuoteIntent {
  readonly slug: string;
  readonly pid: string;
  readonly zoneTo: string;
  readonly attributionResellerId: string;
  readonly paymentMode: PaymentModeWire;
}

export type ReserveOutcome =
  | { readonly status: 'reserved'; readonly expiresAt?: string }
  | { readonly status: 'refused'; readonly reason: string }
  /** Nothing answered — the only « Pas de connexion » on this route either. */
  | { readonly status: 'unreachable' }
  /** Something answered and it was not usable. Same distinction as above. */
  | { readonly status: 'unreadable' };

export interface QuotePort {
  request(intent: QuoteIntent, requestKey: string): Promise<QuoteOutcome>;
  reserve(quoteId: string, commandId: string, holderRef: string): Promise<ReserveOutcome>;
}

/* ───────────────────────────── the shape check ───────────────────────────── */

/** An amount is a whole, non-negative number of francs or it is not an amount.
 *  `NaN`, `Infinity`, `12.5`, `-1`, `'12500'` and `undefined` all fail here. */
function isAmount(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * THE MONEY BOUNDARY — the `looksLikeStorefront` discipline applied to francs.
 *
 * All five amounts present, finite, integer, ≥ 0; `expiry` a non-empty string;
 * `quoteId` and `paymentMode` non-empty strings. Anything else is NOT a quote
 * and must not become one: a screen showing four of five amounts is a screen
 * lying about the fifth. The caller turns a `false` here into `unreadable` —
 * the reply arrived, we could not read it — never into « no connection ».
 */
export function looksLikeServerQuote(v: unknown): v is ServerQuote {
  if (v === null || typeof v !== 'object') return false;
  const q = v as Record<string, unknown>;
  return (
    nonEmpty(q['quoteId']) &&
    nonEmpty(q['paymentMode']) &&
    nonEmpty(q['expiry']) &&
    isAmount(q['productSubtotal']) &&
    isAmount(q['deliveryFee']) &&
    isAmount(q['buyerTotal']) &&
    isAmount(q['amountPaidAtCheckout']) &&
    isAmount(q['amountDueAtDelivery'])
  );
}

/** The refusal NAME a non-2xx body carries (`{error}` — or `{reason}`, which is
 *  what the durable layer names it). No name ⇒ nothing true to say ⇒ absent. */
function refusalName(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  if (nonEmpty(b['error'])) return b['error'];
  if (nonEmpty(b['reason'])) return b['reason'];
  return undefined;
}

/* ──────────────────────────────── the wire ───────────────────────────────── */

/**
 * THE REAL ADAPTER. `POST {base}/checkout/quote` with the service's allowlist
 * and NOTHING else, then `POST {base}/checkout/quote/{id}/reserve`.
 *
 * The body is built as ONE object literal, never spread from the intent, for
 * the same reason `toBuyerQuoteView` is built field by field on the other side:
 * a spread carries whatever the caller's shape grows next, straight into a 400
 * — or worse, into a field the service later decides to honour.
 */
export function httpQuotePort(baseUrl: string): QuotePort {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    async request(intent: QuoteIntent, requestKey: string): Promise<QuoteOutcome> {
      let res: Response;
      try {
        res = await fetch(`${base}/checkout/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: intent.slug,
            pid: intent.pid,
            paymentMode: intent.paymentMode,
            zoneTo: intent.zoneTo,
            attributionResellerId: intent.attributionResellerId,
            requestKey,
          }),
        });
      } catch {
        // NOTHING ANSWERED — the one place « Pas de connexion » is true.
        return { status: 'unreachable' };
      }
      const body: unknown = await res.json().catch(() => undefined);
      if (!res.ok) {
        const name = refusalName(body);
        // A refusal WITHOUT a name is not a refusal we can speak. The reply
        // still ARRIVED, so it is `unreadable`, not « no connection ».
        return name === undefined ? { status: 'unreadable' } : { status: 'refused', reason: name };
      }
      if (!looksLikeServerQuote(body)) return { status: 'unreadable' };
      // BUILT FIELD BY FIELD, NEVER THE CHECKED BODY ITSELF — the mirror of
      // `toBuyerQuoteView` on the service's side, for the same reason (CTO
      // finding, SP3.2b review). Returning the parsed body would carry every
      // extra key the server ever grows into a client object TYPED as eight
      // fields: `sellerBasePrice`, `resellerNet` or `sellerFundedCommission`
      // would then sit in memory, in a state object, and in anything that ever
      // serialises one — invisible to the type checker and to review. An
      // allowlist that must be edited to grow is the only shape where
      // forgetting fails toward silence.
      return {
        status: 'quote',
        quote: {
          quoteId: body.quoteId,
          paymentMode: body.paymentMode,
          productSubtotal: body.productSubtotal,
          deliveryFee: body.deliveryFee,
          buyerTotal: body.buyerTotal,
          amountPaidAtCheckout: body.amountPaidAtCheckout,
          amountDueAtDelivery: body.amountDueAtDelivery,
          expiry: body.expiry,
        },
      };
    },

    async reserve(quoteId: string, commandId: string, holderRef: string): Promise<ReserveOutcome> {
      let res: Response;
      try {
        res = await fetch(`${base}/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commandId, holderRef }),
        });
      } catch {
        return { status: 'unreachable' }; // nothing answered
      }
      const body: unknown = await res.json().catch(() => undefined);
      if (!res.ok) {
        const name = refusalName(body);
        return name === undefined ? { status: 'unreadable' } : { status: 'refused', reason: name };
      }
      const ok = body as Record<string, unknown> | undefined;
      const status = ok === undefined ? undefined : ok['status'];
      // ONLY « reserved » is a hold. Any other state the object reports (already
      // confirmed, released, expired) is spoken by its own name, never treated
      // as a hold we do not have. A 200 with no state at all ARRIVED — it is
      // unreadable, not a missing network.
      if (status !== 'reserved') {
        return nonEmpty(status) ? { status: 'refused', reason: status } : { status: 'unreadable' };
      }
      const expiresAt = ok?.['expiresAt'];
      return nonEmpty(expiresAt) ? { status: 'reserved', expiresAt } : { status: 'reserved' };
    },
  };
}

/* ─────────────────────────────── the harness ─────────────────────────────── */

/**
 * ═══ MOCK CERTIFICATION (Execution Contract §3) ═══
 *
 * The harness port. It exists so `?demo-cliente=` and any preview deployed with
 * NO service reachable keep working — the same reason `demoStorefrontPort`
 * exists. It plays the quote service by wrapping `composeQuote`, the seed's
 * already-approved contract-certified mock; it performs NO arithmetic of its
 * own (every figure below is read off the composed quote's frozen fields).
 *
 * WHAT IT DOES NOT REPRODUCE, named here rather than left to be discovered:
 *   · SERVER LATENCY. It resolves in the same microtask, so nothing that only
 *     appears while a real request is in flight — the waiting skeleton, a slow
 *     3G stall, a request that arrives after the buyer has walked back — is
 *     exercised by it. The real port is the only place those are real.
 *   · THE §6.1 DOOR REFUSAL. The live service refuses EVERY pay-at-door request
 *     today (`PAY_AT_DOOR_POLICY_DEFAULTS` ships an empty `networkReliableZones`
 *     allowlist), so on the real path « Payer à la livraison » is unavailable.
 *     This mock answers a door quote instead, which makes the demo look MORE
 *     capable than production. It is the harness's one deliberate optimism and
 *     it must never be read as evidence that mode B works.
 *   · EXPIRY AS A SERVER BEHAVIOUR. It stamps a shape-true expiry 15 minutes out
 *     (`QUOTE_TTL_MS`, the vault's own figure) so the flow's expiry gate has a
 *     real instant to compare against — but it will happily re-issue a fresh one
 *     forever. It never REFUSES an expired quote the way the real store does.
 *   · REFUSALS AT ALL. It has no unknown listing, no unserviceable zone, no
 *     killed checkout, no reused key. Every refusal surface in this app is
 *     reachable only against the real service (or a stub in tests).
 */
export function demoQuotePort(produitFcfa: number = ROBE.priceFcfa): QuotePort {
  /** The vault's `QUOTE_TTL_MS` (15 min), restated because the buyer app does
   *  not depend on `commerce-core` — it consumes the service, not the vault. */
  const TTL_MS = 15 * 60 * 1000;
  let seq = 0;
  return {
    async request(intent: QuoteIntent): Promise<QuoteOutcome> {
      // The composed mock's frozen bytes — read, never re-added here.
      const c = composeQuote(produitFcfa);
      const door = intent.paymentMode === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
      seq += 1;
      return {
        status: 'quote',
        quote: {
          quoteId: `quote-demo-${seq}`,
          paymentMode: intent.paymentMode,
          productSubtotal: c.produitFcfa,
          deliveryFee: c.feeToday,
          buyerTotal: c.totalToday,
          amountPaidAtCheckout: door ? c.feeToday : c.totalToday,
          amountDueAtDelivery: door ? c.produitFcfa : 0,
          expiry: new Date(Date.now() + TTL_MS).toISOString(),
        },
      };
    },
    async reserve(): Promise<ReserveOutcome> {
      return { status: 'reserved' };
    },
  };
}

/**
 * Choose the port by the environment — the `resolveStorefrontPort` twin: the
 * REAL adapter iff a service base is configured at build time, the harness
 * otherwise. `import.meta.env` is read defensively so vitest (no Vite env) and
 * any non-Vite context resolve to the harness.
 *
 * `produitFcfa` is the harness's article price and is IGNORED by the real
 * adapter (which is told nothing about amounts, ever). It exists because the
 * harness must quote the product actually on screen: quoting the demo robe's
 * 11 500 for a 20 500 article would be inventing a price, which is the one
 * thing no branch of this file may do.
 */
export function resolveQuotePort(produitFcfa?: number): QuotePort {
  const env = (import.meta as { env?: { VITE_STOREFRONT_BASE?: string } }).env;
  const base = env?.VITE_STOREFRONT_BASE;
  return base ? httpQuotePort(base) : demoQuotePort(produitFcfa);
}

/* ─────────────────────────────── the zone wire ───────────────────────────── */

/**
 * A shop's zone string → the CITY it ends in. « Rood Woko · Ouagadougou » and
 * « Gounghin, Ouagadougou » both give « Ouagadougou »; a bare « Ouagadougou »
 * gives itself. The LAST segment is the city — that is how these strings are
 * written, here and in Ouaga.
 *
 * It exists so the buyer's destination can be sent as « {quartier}, {ville} »:
 * her quartier is the only geography she names, and the delivery source prices
 * a CITY pair. Deliberately the same reduction the service applies on its side
 * (`delivery-source.ts` `cityOf`) — if the two ever drift, the answer is
 * `delivery_not_serviceable`, which is a named refusal and not a wrong price.
 */
export function villeDe(zone: string): string {
  const segments = zone.split(/[,·]/u);
  const last = (segments[segments.length - 1] ?? '').trim();
  return last === '' ? zone.trim() : last;
}

/* ────────────────────────────── the request key ──────────────────────────── */

/** The storage prefix — one namespace, so a key is never mistaken for anything
 *  else in `sessionStorage`. */
const KEY_PREFIX = 'sp-quote-key:';

/** The five values that decide an amount, in the service's own fingerprint
 *  order. Identical to `checkout-do.ts`'s `fingerprint` set on purpose: if the
 *  two ever disagree the server answers `request_key_reused` 409, so this list
 *  is the client half of that contract. */
function intentFingerprint(intent: QuoteIntent): string {
  return [intent.slug, intent.pid, intent.zoneTo, intent.attributionResellerId, intent.paymentMode].join('|');
}

/**
 * A STABLE request key per intent — the buyer's idempotency token.
 *
 * SAME INTENT RETRIED ⇒ SAME KEY ⇒ the server hands back the SAME quote, byte
 * for byte, instead of minting a second price for the same question. A CHANGED
 * intent (she corrected her zone) ⇒ a DIFFERENT key, because a reused key with a
 * changed intent is answered `request_key_reused` 409 — a wall the buyer did
 * nothing to deserve, and one we must never build by our own construction.
 *
 * Storage unavailable (private mode, a locked-down webview, a quota error) ⇒ a
 * fresh uuid. That costs idempotency on retry, never correctness: the server
 * still issues at most one quote per key.
 */
export function requestKeyFor(intent: QuoteIntent, storage?: Storage): string {
  const slot = KEY_PREFIX + intentFingerprint(intent);
  const fresh = (): string => crypto.randomUUID();
  if (storage === undefined) return fresh();
  try {
    const existing = storage.getItem(slot);
    if (existing !== null && existing !== '') return existing;
    const minted = fresh();
    storage.setItem(slot, minted);
    return minted;
  } catch {
    return fresh();
  }
}

/**
 * THE RESERVATION'S COMMAND ID — the buyer's second idempotency token, minted
 * client-side so a retried tap holds the SAME reservation instead of racing
 * itself. Drawn from the OS CSPRNG, never `Math.random`: a command id that
 * carries only a seed's entropy can collide on a cold-booted Android-Go phone,
 * and two colliding ids on a money path are one lost hold (RESELLER-IDENTITY-1,
 * the `mint-path-entropy` gate).
 */
export function mintCommandId(): string {
  return `cmd-${crypto.randomUUID()}`;
}

/** The storage namespace for a quote's reservation command. */
const CMD_PREFIX = 'sp-quote-cmd:';

/**
 * THE COMMAND ID FOR ONE QUOTE — stable for that quote's whole life, INCLUDING
 * ACROSS A PAGE RELOAD.
 *
 * Minting it once per `fetchClienteQuote` call fixes the tap-back-and-retry
 * lockout, but not the reload: `requestKeyFor` is deliberately stable, so a
 * buyer who reloads mid-checkout is issued THE SAME quote id — and a freshly
 * minted command against her still-live two-minute hold is exactly the
 * `already_reserved` wall again (measured in a real browser, SP3.2b review: two
 * page loads, one quote id, two command ids). Keyed on the quote id, it is one
 * command per quote by construction, whichever way she comes back to it.
 *
 * Storage unavailable ⇒ a fresh id, same as `requestKeyFor`: that costs the
 * replay, never correctness — the vault still allows exactly one hold.
 */
export function commandIdFor(quoteId: string, storage?: Storage): string {
  if (storage === undefined) return mintCommandId();
  const slot = CMD_PREFIX + quoteId;
  try {
    const existing = storage.getItem(slot);
    if (existing !== null && existing !== '') return existing;
    const minted = mintCommandId();
    storage.setItem(slot, minted);
    return minted;
  } catch {
    return mintCommandId();
  }
}

/**
 * FORGET the key for one intent, so the next ask mints a new one.
 *
 * The ONE legitimate caller is « Voir le prix à jour » on the expired-price
 * surface: the old quote is dead, a new price needs a new key, and reusing the
 * dead one would answer with the dead quote's own expiry forever.
 */
export function forgetRequestKey(intent: QuoteIntent, storage?: Storage): void {
  if (storage === undefined) return;
  try {
    storage.removeItem(KEY_PREFIX + intentFingerprint(intent));
  } catch {
    /* storage unavailable — the next ask mints a fresh key anyway */
  }
}
