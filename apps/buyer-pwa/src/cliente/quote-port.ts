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
 * ═══ FOUR ANSWERS, AND ONLY ONE OF THEM IS A PRICE ═══
 *
 *   · `quote`        — the eight wire fields, every amount shape-checked, and
 *                      the object BUILT FIELD BY FIELD from them (never the
 *                      parsed body, so no economics key can ride in).
 *   · `refused`      — the SERVER'S OWN NAME, verbatim. This port never
 *                      translates, never groups, never softens a refusal: the
 *                      buyer's screen needs a different true sentence for each
 *                      name, so the name must arrive intact.
 *   · `unreachable`  — NOTHING ANSWERED. A thrown fetch, and only that.
 *   · `unreadable`   — SOMETHING ANSWERED AND IT WAS NOT USABLE: a body that
 *                      will not parse, amounts that fail the shape-check, a
 *                      non-2xx with no refusal name.
 *
 * THE LAST TWO ARE KEPT APART ON PURPOSE (CTO finding, SP3.2b review). Both end
 * in « we cannot show you a price », but only `unreachable` may render « Pas de
 * connexion » — telling a buyer on full 4G that her network is down because a
 * proxy returned an HTML 500 is a lie on a money screen. Never a partial quote,
 * never an invented one, and never a false diagnosis of her phone.
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
  /** LISTE-ADRESSE — a GIFT'S quote names the liste, never a destination: the
   *  service prices for the creator's PRIVATE stored zone, and `zoneTo` stays
   *  OFF the wire (the router refuses the pair by name). Present only when
   *  the liste's public boolean said an address exists. */
  readonly listeRef?: string;
}

export type ReserveOutcome =
  | { readonly status: 'reserved'; readonly expiresAt?: string }
  | { readonly status: 'refused'; readonly reason: string }
  /** Nothing answered — the only « Pas de connexion » on this route either. */
  | { readonly status: 'unreachable' }
  /** Something answered and it was not usable. Same distinction as above. */
  | { readonly status: 'unreadable' };

/* ────────────────────────────── the order (SP3.3c) ───────────────────────── */

/**
 * The buyer-facing projection of a canon Order — `BuyerOrderView`, the FOUR
 * fields `toBuyerOrderView` builds by hand on the service side. No economics
 * field exists on it, for the same reason none exists on `ServerQuote`.
 *
 * `state` IS THE ONLY THING THAT SAYS WHETHER MONEY MOVED. The HTTP code says
 * whether the command was accepted; a 200 on `POST /checkout/order` means an
 * order exists and a charge was initiated — it does NOT mean anyone paid. That
 * distinction is the whole reason this port exists (Ten Laws #2: provider
 * webhooks are the only payment truth).
 */
export interface ServerOrder {
  readonly orderId: string;
  readonly state: string;
  readonly amountPaidAtCheckout: number;
  readonly amountDueAtDelivery: number;
  /**
   * WHERE THE DOOR LEG STANDS — `none` · `due` · `paid` (SP4.2b).
   *
   * ═══ WHY THE CLIENT NEEDS IT, AND WHY IT NEEDED IT URGENTLY ═══
   *
   * `state === 'confirmed'` means the CHECKOUT leg is funded. On Option B that
   * is the DELIVERY FEE — 1 000 FCFA — and the product's 11 500 is still owed.
   * The drop-code guard built in SP3.3c read only `state`, so on an Option-B
   * order it would have revealed « Le code de remise » with the product money
   * unpaid: §6.3 (« the buyer enters the drop code last, AFTER any door payment
   * is provider-confirmed ») and Ten Laws #3, both broken.
   *
   * IT WAS UNREACHABLE ONLY BECAUSE MODE B WAS UNREACHABLE. The founder opened
   * the zone rule on 2026-08-01, so it stopped being theoretical in the same
   * change — which is why this field crosses the wire now rather than in a
   * later slice.
   *
   * OPTIONAL ON THE TYPE, and read as « still owed » when absent — see
   * `looksLikeServerOrder`.
   */
  readonly doorLeg?: string | undefined;
  /**
   * REPERE-AUDIO-REEL — what became of her voice note, on the CREATE answer
   * only (the Worker's own word: `gardee` when the media door minted a ref,
   * `perdue` when it could not). Optional: polls and older Workers never
   * send it, and absence simply says nothing — only `perdue` is ever spoken
   * to her, because a lost note deserves a sentence and a kept one already
   * shows on the founder's Commandes.
   */
  readonly noteVocale?: 'gardee' | 'perdue' | undefined;
  /**
   * ═══ VRAI-SUIVI — THE DELIVERY'S OWN FACTS, AS THE SERVER RECORDED THEM ═══
   *
   * Four ISO instants and one boolean, ALL OPTIONAL, and absence means exactly
   * one thing: NOT YET (Ten Laws #7 — queued = pending, never done; the
   * reseller-feed doctrine, applied to the buyer's own tracking). Nothing on
   * this client may infer a later mark from an earlier one, and nothing may
   * treat a missing field as progress.
   *
   * EACH MARK IS VALIDATED INDIVIDUALLY IN `readOrder` AND DROPPED ALONE when
   * malformed — a garbage `acceptedAt` must not take the whole order read down,
   * because the read also carries the payment truth C6 depends on. A dropped
   * mark can only ever UNDERSTATE progress, never invent it.
   */
  readonly acceptedAt?: string | undefined;
  readonly readyAt?: string | undefined;
  readonly departedAt?: string | undefined;
  readonly arrivedAt?: string | undefined;
  /** The remise happened — the drop code was spoken and honoured. Carried only
   *  when the server says literally `true`; anything else reads as « not yet ». */
  readonly livree?: boolean | undefined;
  /**
   * VRAI-SUIVI — the buyer's own bearer token for `GET …/remise`. The service
   * returns it ONCE, on the CREATE answer (and on an idempotent replayed
   * create) — never on the poll — so this field is only ever filled from the
   * order that `POST /checkout/order` handed back.
   */
  readonly buyerRef?: string | undefined;
}

/**
 * FOUR ANSWERS, THE SAME FOUR AS THE QUOTE, AND FOR THE SAME REASONS. The
 * unreachable/unreadable split is not duplicated here out of symmetry: it is
 * duplicated because the confirmation screen has the same lie available to it
 * as the price screen did. « En attente du réseau » told a buyer on full 4G
 * that her phone was the problem when the service had answered and we could
 * not read the answer.
 */
export type OrderOutcome =
  | { readonly status: 'order'; readonly order: ServerOrder }
  /** The server's own refusal name, verbatim — `quote_not_reserved`,
   *  `reservation_expired`, `reservation_held_by_another`, `quote_expired`… */
  | { readonly status: 'refused'; readonly reason: string }
  | { readonly status: 'unreachable' }
  | { readonly status: 'unreadable' };

/**
 * ═══ VRAI-SUIVI — WHAT THE REMISE ROUTE CAN ANSWER ═══
 *
 * The SAME four-outcome discipline as every other route in this file, with one
 * deliberate difference: `refused` CARRIES NO NAME, because the service gives
 * none. `GET /checkout/order/{id}/remise` answers a uniform `{ok:false}` 404
 * for a wrong token, an unknown order AND a not-yet-arrived rider —
 * indistinguishable ON PURPOSE, so the route leaks nothing about which orders
 * exist or where a rider stands. This port carries that silence verbatim
 * instead of inventing a reason the server refused to state.
 */
export type RemiseOutcome =
  /** The code, and only when the ARRIVAL FACT exists on the service. */
  | { readonly status: 'code'; readonly code: string }
  /** The uniform `{ok:false}` — no name, by the service's own design. */
  | { readonly status: 'refused' }
  /** Nothing answered. The only outcome « Pas de connexion » could be true of. */
  | { readonly status: 'unreachable' }
  /** Something answered and it was not usable. */
  | { readonly status: 'unreadable' };

/**
 * BC-1b — the buyer's dispatch contact (founder-approved 2026-08-02): phone +
 * quartier + repère, entered once on C3, sent ONCE on order creation so the
 * founder can dispatch a rider. The service stores it on the order's own
 * object behind the founder-only dispatch read; it never returns on any
 * public view — which is what keeps every « Votre numéro reste privé » line
 * in this app a true sentence.
 */
export interface ContactLivraison {
  readonly phone: string;
  readonly quartier: string;
  readonly repere: string;
  /** REPERE-AUDIO-REEL — her voice note's bytes, base64'd, riding the create
   *  ONCE beside the text repère. The service turns it into an opaque media
   *  ref server-side; no ref ever travels FROM this app. */
  readonly audioB64?: string;
  /** GEO-ACHAT-1 — her GPS pin, one optional tap on C3 so the rider finds the
   *  door. Same privacy law as the phone: stored behind the founder-only
   *  dispatch read, never on any public view. Supporting evidence for the
   *  rider — it decides nothing (SE-I07). */
  readonly pin?: { readonly lat: number; readonly lng: number; readonly accuracy?: number };
}

export interface QuotePort {
  request(intent: QuoteIntent, requestKey: string): Promise<QuoteOutcome>;
  reserve(quoteId: string, commandId: string, holderRef: string): Promise<ReserveOutcome>;
  /**
   * CREATE THE ORDER FOR A HELD QUOTE — the first call this app makes that can
   * cause a charge to be initiated.
   *
   * IT SENDS NO AMOUNT AND COULD NOT: the service's body allowlist is exactly
   * `{quoteId, holderRef, commandId}` (`order-do.ts` `ORDER_FIELDS`), and the
   * figure that decides what is charged is read server-side off the quote's own
   * frozen bytes. Same law as `request`: a price the buyer names is
   * unrepresentable on this wire, not merely rejected.
   *
   * `commandId` IS THE IDEMPOTENCY KEY FOR THIS ATTEMPT. Sending the same one
   * twice replays the first answer; sending a different one at an order that
   * already exists and has not failed returns that order AS IT STANDS, never a
   * second order and never a second charge (`order-do.ts` create, the « an
   * impatient double-tap is harmless » branch).
   *
   * LISTE-ENVIES-1 — `listeRef` is the allowlist's fifth (optional) key: the
   * opaque wishlist token the fiche arrived with, forwarded so the service
   * can mark « offert » at the provider-confirmed transition. It names no
   * amount and no product — the service refuses anything but its own token
   * shape, and an invented value marks nothing.
   */
  order(quoteId: string, commandId: string, holderRef: string, contact?: ContactLivraison, listeRef?: string): Promise<OrderOutcome>;
  /**
   * READ THE ORDER BACK. The ONLY thing in this app that may ever move the
   * confirmation screen to « confirmé par l'opérateur »: the state it returns
   * was written by a signed provider webhook and validated to the franc by the
   * vault, and nothing on this client can produce it.
   */
  orderState(orderId: string): Promise<OrderOutcome>;
  /**
   * SP4.2b — ASK FOR THE PRODUCT LEG TO BE COLLECTED, at her door, after she
   * has inspected. §5.5: « product paid by MoMo at the door BEFORE custody
   * transfer; not COD ».
   *
   * IT DOES NOT PAY, AND IT CANNOT. A 200 means a charge was initiated; the
   * order it hands back still says the door leg is `due`, and only a signed
   * provider webhook can move it to `paid`. Ten Laws #2, one screen later.
   *
   * No amount crosses this wire either — the service's body allowlist is
   * `{holderRef, commandId}` and the figure is read off the immutable Quote.
   */
  doorCharge(orderId: string, commandId: string, holderRef: string): Promise<OrderOutcome>;
  /**
   * VRAI-SUIVI — ASK FOR THE DROP CODE, with the buyer's own bearer token.
   *
   * `GET {base}/checkout/order/{id}/remise`, `Authorization: Bearer <buyerRef>`.
   * The service answers the code ONLY once the rider's arrival fact exists
   * (founder, 2026-08-10: « the code appears for the buyer only when the rider
   * taps Je suis arrivé »), and answers a uniform nameless 404 otherwise. This
   * call can never CAUSE anything — it is a read, it moves no money and no
   * custody, and a client that never calls it simply never shows a code.
   */
  remise(orderId: string, buyerRef: string): Promise<RemiseOutcome>;
  /**
   * LISTE-MERCI — ASK FOR THE CREATOR'S NOTIFY FACTS, with the buyer's own
   * bearer token: `GET {base}/checkout/order/{id}/liste-merci`,
   * `Authorization: Bearer <buyerRef>`. Answered ONLY when this order named
   * a liste at creation, its payment is provider-confirmed, and the creator
   * opted in — a uniform nameless 404 otherwise, and every 404 collapses to
   * `indisponible` here: the merci block simply does not render, which is
   * the honest screen for all five indistinguishable reasons. A read; it
   * can cause nothing.
   */
  listeMerci(orderId: string, buyerRef: string): Promise<MerciOutcome>;
}

/** LISTE-MERCI — the notify facts, or the one honest « rien à offrir ». */
export type MerciOutcome =
  | { readonly status: 'merci'; readonly nom: string; readonly telephone: string }
  | { readonly status: 'indisponible' };

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

/**
 * THE ORDER BOUNDARY — the same discipline as `looksLikeServerQuote`, applied
 * to the four fields `toBuyerOrderView` writes.
 *
 * `state` MUST BE A NON-EMPTY STRING and is otherwise NOT validated here. That
 * is deliberate: this port carries the server's word verbatim, exactly as it
 * carries a refusal name verbatim, and the decision about which states may show
 * a confirmation belongs to ONE place (`flow.ts`'s allowlist) rather than to
 * two that can drift. A state this client does not recognise must land on the
 * waiting screen, not be rejected as unreadable — the order exists either way.
 *
 * BOTH AMOUNTS ARE REQUIRED even though today's screens read neither: an order
 * view missing one of them is a projection that changed shape under us, and a
 * money surface that shrugs at that is how a screen ends up showing three of
 * four figures.
 */
export function looksLikeServerOrder(v: unknown): v is ServerOrder {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    nonEmpty(o['orderId']) &&
    nonEmpty(o['state']) &&
    isAmount(o['amountPaidAtCheckout']) &&
    isAmount(o['amountDueAtDelivery']) &&
    // `doorLeg` is NOT required — an older Worker does not send it — but if it
    // is present it must be a real string. What makes that safe is the READING:
    // absent is treated as « still owed » at the one place it decides anything
    // (`revelationPermise`), so a missing field can only ever WITHHOLD the drop
    // code, never reveal it.
    //
    // VRAI-SUIVI — the four delivery marks and `livree` are DELIBERATELY not
    // checked here. Rejecting the whole order for one malformed mark would take
    // the PAYMENT truth down with it; instead each mark is validated alone in
    // `readOrder` and dropped alone when bad, which can only ever UNDERSTATE
    // progress (absence = not yet), never invent it.
    (o['doorLeg'] === undefined || nonEmpty(o['doorLeg']))
  );
}

/**
 * ONE DELIVERY MARK, OR NOTHING — a non-empty string this JS engine can parse
 * as an instant. `Date.parse` on garbage answers `NaN`, and a mark that cannot
 * be read is a mark that does not exist: dropped INDIVIDUALLY, so a bad
 * `acceptedAt` never kills the read and never touches its neighbours. Dropping
 * fails toward « not yet », which is the only safe direction on a tracking
 * screen (Ten Laws #7).
 */
function marqueIso(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' && !Number.isNaN(Date.parse(v)) ? v : undefined;
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
      // Built OUTSIDE the fetch `try` (verifier NOTE 8): a body this browser
      // refused to serialise is not a missing network, and must not be reported
      // to an online buyer as one.
      let payload: string;
      try {
        // LISTE-ADRESSE — with a liste on the intent, the destination is the
        // SERVICE'S to resolve: `listeRef` rides, `zoneTo` stays home (the
        // router refuses both together by name — one source of truth).
        payload = JSON.stringify({
          slug: intent.slug,
          pid: intent.pid,
          paymentMode: intent.paymentMode,
          ...(intent.listeRef !== undefined ? { listeRef: intent.listeRef } : { zoneTo: intent.zoneTo }),
          attributionResellerId: intent.attributionResellerId,
          requestKey,
        });
      } catch {
        return { status: 'unreadable' };
      }
      let res: Response;
      try {
        res = await fetch(`${base}/checkout/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
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
      // THE URL AND THE BODY ARE BUILT OUTSIDE THE FETCH `try` (verifier NOTE 8).
      // `encodeURIComponent` THROWS a URIError on a lone surrogate, and a hostile
      // or corrupted `quoteId` carrying one used to land inside the catch below —
      // rendering « Pas de connexion » to a buyer whose network is perfectly
      // fine, the exact lie the unreachable/unreadable split exists to remove.
      // A request the BROWSER refused to construct is not a missing network.
      let url: string;
      let payload: string;
      try {
        url = `${base}/checkout/quote/${encodeURIComponent(quoteId)}/reserve`;
        payload = JSON.stringify({ commandId, holderRef });
      } catch {
        return { status: 'unreadable' };
      }
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
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

    async order(quoteId: string, commandId: string, holderRef: string, contact?: ContactLivraison, listeRef?: string): Promise<OrderOutcome> {
      // THE BODY IS THE SERVICE'S ALLOWLIST, BUILT AS ONE LITERAL — never a
      // spread of anything. `order-do.ts` refuses an unknown key with 400
      // `unknown_field`, and that refusal is a feature: it is how a caller that
      // grew an amount field finds out immediately instead of quietly.
      // BC-1b: `contact` is the allowlist's fourth (optional) key, built
      // field-by-field for the same reason — still no amount, still no spread.
      // LISTE-ENVIES-1: `listeRef` is the fifth — an opaque token, no amount.
      let payload: string;
      try {
        payload = JSON.stringify({
          quoteId,
          holderRef,
          commandId,
          ...(contact !== undefined
            ? {
                contact: {
                  phone: contact.phone,
                  quartier: contact.quartier,
                  repere: contact.repere,
                  // REPERE-AUDIO-REEL — the note's bytes, field-by-field like
                  // its neighbours; still no amount, still no spread.
                  ...(contact.audioB64 !== undefined ? { audioB64: contact.audioB64 } : {}),
                  // GEO-ACHAT-1 — the pin, field-by-field like everything on
                  // this wire: three named numbers, nothing spread.
                  ...(contact.pin !== undefined
                    ? {
                        pin: {
                          lat: contact.pin.lat,
                          lng: contact.pin.lng,
                          ...(contact.pin.accuracy !== undefined ? { accuracy: contact.pin.accuracy } : {}),
                        },
                      }
                    : {}),
                },
              }
            : {}),
          ...(listeRef !== undefined ? { listeRef } : {}),
        });
      } catch {
        return { status: 'unreadable' };
      }
      let res: Response;
      try {
        res = await fetch(`${base}/checkout/order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });
      } catch {
        return { status: 'unreachable' }; // nothing answered
      }
      return readOrder(res);
    },

    async doorCharge(orderId: string, commandId: string, holderRef: string): Promise<OrderOutcome> {
      let url: string;
      let payload: string;
      try {
        url = `${base}/checkout/order/${encodeURIComponent(orderId)}/door-charge`;
        payload = JSON.stringify({ holderRef, commandId });
      } catch {
        return { status: 'unreadable' };
      }
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });
      } catch {
        return { status: 'unreachable' };
      }
      return readOrder(res);
    },

    async orderState(orderId: string): Promise<OrderOutcome> {
      // Built OUTSIDE the fetch `try`, for the reason `reserve` documents:
      // `encodeURIComponent` throws on a lone surrogate, and a request the
      // BROWSER refused to construct is not a missing network.
      let url: string;
      try {
        url = `${base}/checkout/order/${encodeURIComponent(orderId)}`;
      } catch {
        return { status: 'unreadable' };
      }
      /**
       * ═══ THIS ONE READ IS BOUNDED IN TIME, AND ONLY THIS ONE ═══
       *
       * The delivery watch schedules its next read from the `.then` of this
       * promise. A `fetch` that never settles — a stalled 3G socket, the classic
       * on the phones this app is built for — therefore leaves NO pending timer
       * and NO failure: the tracking screen simply stops, for ever, with nothing
       * to press. Every other call here is driven by a tap, where a stall shows
       * as a control that stays busy and she can act on it; this one is driven
       * by itself, which is why it alone needs the bound.
       *
       * `AbortController` rather than `AbortSignal.timeout`, which the Android
       * WebViews this app targets do not all carry — and the whole thing is
       * guarded, because a missing `AbortController` must degrade to today's
       * behaviour rather than throw on the first read.
       */
      let res: Response;
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const stall = ctrl === null ? null : setTimeout(() => ctrl.abort(), LECTURE_COMMANDE_TIMEOUT_MS);
      try {
        res = await fetch(url, ctrl === null ? { method: 'GET' } : { method: 'GET', signal: ctrl.signal });
      } catch {
        // An abort arrives here too, and « unreachable » is the honest name for
        // it: the read did not land. A failed read is still not a failed
        // delivery — the timeline keeps every proven step.
        return { status: 'unreachable' };
      } finally {
        if (stall !== null) clearTimeout(stall);
      }
      return readOrder(res);
    },

    async remise(orderId: string, buyerRef: string): Promise<RemiseOutcome> {
      // URL built OUTSIDE the fetch `try` — the reserve/orderState law: a
      // request the BROWSER refused to construct is not a missing network.
      let url: string;
      try {
        url = `${base}/checkout/order/${encodeURIComponent(orderId)}/remise`;
      } catch {
        return { status: 'unreadable' };
      }
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${buyerRef}` },
        });
      } catch {
        return { status: 'unreachable' }; // nothing answered
      }
      const body: unknown = await res.json().catch(() => undefined);
      const o = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : undefined;
      if (!res.ok) {
        // The service's ONE refusal shape: `{ok:false}`, nameless on purpose
        // (wrong token, unknown order, not yet arrived — indistinguishable).
        // Anything else that answered — a proxy's HTML 500 — is `unreadable`,
        // never « no connection » and never a refusal we would be inventing.
        return o !== undefined && o['ok'] === false ? { status: 'refused' } : { status: 'unreadable' };
      }
      // A 200 is a code or it is nothing: `{ok:true, code}` with a real string.
      if (o !== undefined && o['ok'] === true && nonEmpty(o['code'])) {
        return { status: 'code', code: o['code'] };
      }
      return { status: 'unreadable' };
    },

    /**
     * LISTE-MERCI — the remise read's twin, and DELIBERATELY TOTAL over one
     * axis: every non-answer — refusal, unreachable, unreadable — collapses
     * to `indisponible`, because the merci block is a GIFT AFFORDANCE, never
     * a state the buyer must act on. A confirmation screen that grew an
     * error wall about a WhatsApp button would be anxiety about nothing.
     */
    async listeMerci(orderId: string, buyerRef: string): Promise<MerciOutcome> {
      let url: string;
      try {
        url = `${base}/checkout/order/${encodeURIComponent(orderId)}/liste-merci`;
      } catch {
        return { status: 'indisponible' };
      }
      let res: Response;
      try {
        res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${buyerRef}` } });
      } catch {
        return { status: 'indisponible' };
      }
      const body: unknown = await res.json().catch(() => undefined);
      const o = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : undefined;
      if (res.ok && o !== undefined && o['ok'] === true && nonEmpty(o['nom']) && nonEmpty(o['telephone'])) {
        return { status: 'merci', nom: o['nom'], telephone: o['telephone'] };
      }
      return { status: 'indisponible' };
    },
  };
}

/**
 * ONE READER FOR BOTH ORDER ROUTES — they answer the SAME projection, so they
 * get the same reading, and a divergence between « what create returns » and
 * « what the poll returns » is unrepresentable rather than merely unlikely.
 *
 * Nothing here throws: a money surface that can throw is a money surface that
 * can 500 at the buyer, and there is no honest French for that.
 */
async function readOrder(res: Response): Promise<OrderOutcome> {
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const name = refusalName(body);
    // A refusal WITHOUT a name is not a refusal we can speak. The reply still
    // ARRIVED, so it is `unreadable`, not « no connection ».
    return name === undefined ? { status: 'unreadable' } : { status: 'refused', reason: name };
  }
  if (!looksLikeServerOrder(body)) return { status: 'unreadable' };
  // BUILT FIELD BY FIELD, never the checked body itself — `toBuyerOrderView`'s
  // mirror on this side, for the reason the quote's own build documents: an
  // allowlist that must be edited to grow is the only shape where forgetting
  // fails toward silence.
  //
  // VRAI-SUIVI — the marks are read off the RAW body (the type guard
  // deliberately did not vouch for them) and validated ONE BY ONE: a malformed
  // mark is dropped alone, the read survives, and progress can only ever be
  // understated. `livree` is carried only on the literal `true` — anything
  // else, including a string "true", reads as « not yet ».
  const brut = body as unknown as Record<string, unknown>;
  const acceptedAt = marqueIso(brut['acceptedAt']);
  const readyAt = marqueIso(brut['readyAt']);
  const departedAt = marqueIso(brut['departedAt']);
  const arrivedAt = marqueIso(brut['arrivedAt']);
  return {
    status: 'order',
    order: {
      orderId: body.orderId,
      state: body.state,
      amountPaidAtCheckout: body.amountPaidAtCheckout,
      amountDueAtDelivery: body.amountDueAtDelivery,
      doorLeg: body.doorLeg,
      // REPERE-AUDIO-REEL — carried only when the Worker said one of its two
      // words; anything else stays silent rather than inventing a state.
      ...(body.noteVocale === 'gardee' || body.noteVocale === 'perdue'
        ? { noteVocale: body.noteVocale }
        : {}),
      ...(acceptedAt !== undefined ? { acceptedAt } : {}),
      ...(readyAt !== undefined ? { readyAt } : {}),
      ...(departedAt !== undefined ? { departedAt } : {}),
      ...(arrivedAt !== undefined ? { arrivedAt } : {}),
      ...(brut['livree'] === true ? { livree: true } : {}),
      // VRAI-SUIVI — the buyer's bearer token, present only on the CREATE
      // answer by the service's design; carried verbatim when it is a real
      // string, silent otherwise.
      ...(nonEmpty(brut['buyerRef']) ? { buyerRef: brut['buyerRef'] } : {}),
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
 *   · THE §6.1 DOOR CONDITIONS. This entry said, until 2026-08-04, that « the
 *     live service refuses EVERY pay-at-door request today » because of an empty
 *     zone allowlist. Both halves of that are now out of date — the founder
 *     opened the zones on 2026-08-01, and OPTION-B-REACHABLE-1 closed the two
 *     real blockers behind it (§6.4's record had no server-side producer, and
 *     §6.2's rows were compared against the supplier's French chip). The live
 *     service ISSUES an Option-B quote now.
 *
 *     WHAT STAYS TRUE ABOUT THIS MOCK, which is the point of the entry: it
 *     answers a door quote UNCONDITIONALLY. It has no seller tier, no category,
 *     no price cap — so it says yes for products the real gate refuses (an
 *     unattested supplier, « Maison », anything over 25 000 F). It is still more
 *     capable than production and still must not be read as evidence that a
 *     GIVEN product is door-eligible.
 *   · EXPIRY AS A SERVER BEHAVIOUR. It stamps a shape-true expiry 15 minutes out
 *     (`QUOTE_TTL_MS`, the vault's own figure) so the flow's expiry gate has a
 *     real instant to compare against — but it will happily re-issue a fresh one
 *     forever. It never REFUSES an expired quote the way the real store does.
 *   · REFUSALS AT ALL. It has no unknown listing, no unserviceable zone, no
 *     killed checkout, no reused key. Every refusal surface in this app is
 *     reachable only against the real service (or a stub in tests).
 *   · A PROVIDER THAT NEVER ANSWERS (SP3.3c, and this is the big one). Its
 *     `orderState` reports `payment_pending` for `DEMO_ATTENTES` reads and then
 *     `confirmed`, which is the SHAPE of a webhook arriving — but on the
 *     deployed service NOTHING POSTS THE PAYMENT WEBHOOK, so a real order stays
 *     `payment_pending` indefinitely. This harness therefore reaches a happy
 *     ending that production cannot reach today. It is the second deliberate
 *     optimism in this file and it must never be read as evidence that the
 *     payment loop closes.
 *   · `payment_failed`. It has no failing charge, so C6's refusal state is
 *     reachable only against the real service or a scripted stub.
 */
/**
 * HOW MANY READS THE HARNESS'S « OPERATOR » TAKES before it answers. Two, so
 * the pending state is genuinely on screen and genuinely observable — a demo
 * that confirms on the first read would hide the very state SP3.3c built, and
 * a mock that skips a state is a mock that makes the integration look healthier
 * than it is (Execution Contract §3).
 */
/**
 * How long a single delivery-tracking read may hang before it is abandoned.
 *
 * Generous on purpose — this is a 1 GB Android on a congested cell, and a read
 * that takes twelve seconds is slow, not broken. What it forbids is the read
 * that takes for ever, because the watch schedules its next rung from this
 * promise and a socket that never settles freezes the screen with nothing on it
 * to press. It is a floor under the tracking screen, not a latency budget.
 */
export const LECTURE_COMMANDE_TIMEOUT_MS = 12_000;

export const DEMO_ATTENTES = 2;

export function demoQuotePort(produitFcfa: number = ROBE.priceFcfa): QuotePort {
  /** The vault's `QUOTE_TTL_MS` (15 min), restated because the buyer app does
   *  not depend on `commerce-core` — it consumes the service, not the vault. */
  const TTL_MS = 15 * 60 * 1000;
  let seq = 0;
  /** Which mode each demo quote was issued under, so the demo ORDER reports the
   *  split of the quote it was actually created from. */
  const doorMode = new Map<string, boolean>();
  /** How many times each demo order has been read back — see `orderState`. */
  const lus = new Map<string, number>();
  /** Demo orders whose door leg the harness has « collected ». */
  const portePayee = new Set<string>();
  return {
    async request(intent: QuoteIntent): Promise<QuoteOutcome> {
      // The composed mock's frozen bytes — read, never re-added here.
      const c = composeQuote(produitFcfa);
      const door = intent.paymentMode === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
      seq += 1;
      doorMode.set(`quote-demo-${seq}`, door);
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

    /**
     * THE ORDER, PLAYED THE WAY THE SERVICE PLAYS IT: a 200 means an order
     * exists and a charge was initiated — `payment_pending`, never `confirmed`.
     * The harness gets this right because getting it wrong here is exactly the
     * defect SP3.3c removes from the flow: a client that reads « the order was
     * created » as « the operator paid ».
     */
    async order(quoteId: string): Promise<OrderOutcome> {
      const c = composeQuote(produitFcfa);
      const door = doorMode.get(quoteId) === true;
      lus.set(quoteId, 0);
      return {
        status: 'order',
        order: {
          orderId: `ord-demo-${quoteId}`,
          state: 'payment_pending',
          amountPaidAtCheckout: door ? c.feeToday : c.totalToday,
          amountDueAtDelivery: door ? c.produitFcfa : 0,
          doorLeg: door ? 'due' : 'none',
          // VRAI-SUIVI — the create carries a bearer ref exactly as the real
          // service does; the demo `remise` below refuses it anyway, because
          // no rider exists here to make the arrival fact true.
          buyerRef: `ref-demo-${quoteId}`,
        },
      };
    },

    /**
     * …and then the webhook « arrives ». See the certification note above: this
     * is a SHAPE, not a capability. The count is per order so a demo walked
     * twice waits twice, instead of the second walk confirming instantly and
     * hiding the pending state from whoever is watching.
     */
    /**
     * THE HARNESS ASKS TO PAY AT THE DOOR — and, unlike the real service, its
     * own next read then reports `paid`, because no webhook exists here to do
     * it. Named in the certification list above: the third deliberate optimism.
     */
    async doorCharge(orderId: string): Promise<OrderOutcome> {
      const quoteId = orderId.replace(/^ord-demo-/, '');
      const c = composeQuote(produitFcfa);
      portePayee.add(quoteId);
      return {
        status: 'order',
        order: {
          orderId,
          state: 'confirmed',
          amountPaidAtCheckout: c.feeToday,
          amountDueAtDelivery: c.produitFcfa,
          // STILL `due` on the way back — the charge was initiated, not paid.
          doorLeg: 'due',
        },
      };
    },

    async orderState(orderId: string): Promise<OrderOutcome> {
      const quoteId = orderId.replace(/^ord-demo-/, '');
      const c = composeQuote(produitFcfa);
      const door = doorMode.get(quoteId) === true;
      const seen = (lus.get(quoteId) ?? 0) + 1;
      lus.set(quoteId, seen);
      return {
        status: 'order',
        order: {
          orderId,
          state: seen > DEMO_ATTENTES ? 'confirmed' : 'payment_pending',
          amountPaidAtCheckout: door ? c.feeToday : c.totalToday,
          amountDueAtDelivery: door ? c.produitFcfa : 0,
          // The door leg is owed until the harness's own `doorCharge` has been
          // called AND read back once — the shape a real webhook makes, minus
          // the wait. Never `paid` before she has asked to pay.
          doorLeg: !door ? 'none' : portePayee.has(quoteId) ? 'paid' : 'due',
        },
      };
    },

    /**
     * VRAI-SUIVI — THE DEMO HAS NO RIDER, so it has no arrival fact and no
     * code to hand out: the honest answer is the service's own uniform
     * refusal, every time. Named in the certification list above by the same
     * rule as the rest: this mock reports NO delivery marks either, so a
     * preview with no service shows a tracking that honestly never advances —
     * it must never be read as evidence that the suivi loop closes.
     */
    async remise(): Promise<RemiseOutcome> {
      return { status: 'refused' };
    },

    /** LISTE-MERCI — the harness holds no liste and no creator: honestly
     *  `indisponible`, so the demo confirmation never grows a gift block
     *  about a person who does not exist. */
    async listeMerci(): Promise<MerciOutcome> {
      return { status: 'indisponible' };
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
  // LISTE-ADRESSE — the liste joins the print ONLY when present, so every
  // existing intent's key stays byte-identical across this deploy.
  const socle = [intent.slug, intent.pid, intent.zoneTo, intent.attributionResellerId, intent.paymentMode];
  return (intent.listeRef !== undefined ? [...socle, intent.listeRef] : socle).join('|');
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
export function requestKeyFor(intent: QuoteIntent, storage?: Storage): string | undefined {
  const slot = KEY_PREFIX + intentFingerprint(intent);
  if (storage === undefined) return mintUuid();
  try {
    const existing = storage.getItem(slot);
    if (existing !== null && existing !== '') return existing;
    const minted = mintUuid();
    if (minted !== undefined) storage.setItem(slot, minted);
    return minted;
  } catch {
    return mintUuid();
  }
}

/**
 * ═══ A UUID, OR HONESTLY NOTHING — NEVER A THROW AND NEVER `Math.random` ═══
 *
 * THE DEFECT THIS CLOSES (verifier BLOCKER, SP3.2b round 3): this drew straight
 * from `crypto.randomUUID()`, which DOES NOT EXIST on a non-secure origin
 * (plain http, exactly how a shared link opens on a cheap phone behind a captive
 * portal) nor on older Android WebViews. The call threw, the throw escaped
 * `demanderLePrix`, and the buyer sat on a skeleton forever: zero HTTP asks, no
 * message, no back button. A permanent dead end on the money path.
 *
 * THE LADDER, in order:
 *   1. `crypto.randomUUID()` — the OS CSPRNG, formatted for us.
 *   2. `crypto.getRandomValues()` — the SAME entropy source, one API older;
 *      we lay out the RFC 4122 v4 bytes ourselves.
 *   3. NOTHING. `undefined`, and the caller refuses BY NAME.
 *
 * `Math.random` IS BANNED HERE and always will be: it carries only its seed's
 * entropy on a cold-booted Android-Go device, two mints can collide into one
 * idempotency key, and one collision on this path is one lost hold
 * (RESELLER-IDENTITY-1; the `mint-path-entropy` gate names this file).
 * A missing id must degrade into a NAMED REFUSAL WITH AN ACTION, never into a
 * weaker random and never into a frozen screen.
 */
export function mintUuid(): string | undefined {
  const c: Crypto | undefined = typeof globalThis.crypto === 'object' ? globalThis.crypto : undefined;
  if (c === undefined) return undefined;
  if (typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      /* fall through to getRandomValues */
    }
  }
  if (typeof c.getRandomValues === 'function') {
    try {
      const b = c.getRandomValues(new Uint8Array(16));
      b[6] = (b[6]! & 0x0f) | 0x40; // version 4
      b[8] = (b[8]! & 0x3f) | 0x80; // variant 10xx
      const hex = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * THE RESERVATION'S COMMAND ID — the buyer's second idempotency token, minted
 * client-side so a retried tap holds the SAME reservation instead of racing
 * itself. `undefined` when this device has no CSPRNG at all; the caller then
 * refuses by name rather than proceeding without one.
 */
export function mintCommandId(): string | undefined {
  const u = mintUuid();
  return u === undefined ? undefined : `cmd-${u}`;
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
export function commandIdFor(quoteId: string, storage?: Storage): string | undefined {
  if (storage === undefined) return mintCommandId();
  const slot = CMD_PREFIX + quoteId;
  try {
    const existing = storage.getItem(slot);
    if (existing !== null && existing !== '') return existing;
    const minted = mintCommandId();
    if (minted !== undefined) storage.setItem(slot, minted);
    return minted;
  } catch {
    return mintCommandId();
  }
}

/**
 * THE ORDER'S COMMAND ID — the buyer's THIRD idempotency token, and the one
 * that stands in front of a charge (SP3.3c).
 *
 * ═══ WHY IT IS KEYED ON (QUOTE, ATTEMPT) AND NOT ON THE QUOTE ALONE ═══
 *
 * Stable per attempt: a double-tap, a reload mid-wait, a « Payer » pressed
 * again because nothing seemed to happen — all send the SAME command id, and
 * `order-do.ts` replays its stored answer instead of walking the create path a
 * second time. That is the client half of « no duplicate charge on retry »
 * (SP-I13); the server holds the other half and holds it durably.
 *
 * FRESH PER DELIBERATE RETRY: after `payment_failed`, the order needs a NEW
 * command to move back to `payment_pending` (the vault requires a new payment
 * attempt id on that edge). Reusing the old command id there would replay the
 * FIRST answer — the retry button would look like it worked and nothing would
 * have been retried.
 *
 * ═══ AND WHY A RETRY MINTS FRESH RATHER THAN TAKING A NUMBERED SLOT ═══
 *
 * THE DEFECT THIS CLOSES (fresh-context verifier, SP3.3c round 2): the attempt
 * number lived in memory while its slot lived in `sessionStorage`. After a
 * reload mid-checkout the counter reset to 0 while the stored answers did not,
 * so « Payer » replayed attempt 0's cached refusal and « Réessayer » replayed
 * attempt 1's — two taps that looked like they worked and retried nothing.
 * Verbatim the failure this function exists to prevent.
 *
 * SO ONLY ATTEMPT 0 IS SLOTTED. That is the one that must survive a reload: it
 * is the tap that first put a charge in motion, and replaying its answer is
 * exactly right. Every RETRY mints a fresh id instead — a retry is a deliberate
 * new attempt, it is never the thing a reload should reproduce, and a fresh id
 * is the only value that reaches the vault's `payment_failed → payment_pending`
 * edge at all.
 *
 * THAT CANNOT DOUBLE-CHARGE, and it is the server that guarantees it, not this
 * counter: the provider key belongs to the LEG, is minted once and is reused by
 * every retry, and a second command against an order whose payment has not
 * failed is answered with the order as it stands.
 */
export function orderCommandIdFor(quoteId: string, essai: number, storage?: Storage): string | undefined {
  return essai === 0 ? commandIdFor(`${quoteId}#order#0`, storage) : mintCommandId();
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

/* ──────────────────── VRAI-SUIVI — her order, kept on the phone ──────────── */

/**
 * ═══ THE ONE ORDER THIS PHONE REMEMBERS ═══
 *
 * `localStorage` (not session — she closes the browser and comes back
 * tomorrow), ONE slot, newest wins: at pilot scale a buyer has one live order,
 * and a second `garderCommande` simply replaces the first. What is kept is the
 * MINIMUM that re-opens her tracking: the order's id, her bearer ref for the
 * remise route, and when it was stored. No amount, no product, no address —
 * nothing here is worth stealing and nothing here can price anything.
 *
 * EVERY function tolerates a dead or lying storage (private mode, quota, a
 * webview that throws on touch): keeping the record is best-effort, and losing
 * it costs her the shortcut, never the order — the order lives on the service.
 */
export const COMMANDE_CLE = 'sp-commande:v1';

export interface CommandeGardee {
  readonly orderId: string;
  readonly buyerRef: string;
  readonly at: string;
}

export function garderCommande(c: CommandeGardee, storage?: Storage): void {
  if (storage === undefined) return;
  try {
    // Field by field, never a spread — the same allowlist law as every wire
    // body in this file: what is stored is exactly what is named.
    storage.setItem(COMMANDE_CLE, JSON.stringify({ orderId: c.orderId, buyerRef: c.buyerRef, at: c.at }));
  } catch {
    /* best-effort — the order still lives on the service */
  }
}

/** The stored order, or nothing — a record missing ANY field is nothing, so a
 *  half-written or hand-edited slot can never mount a tracking it cannot poll. */
export function commandeGardee(storage?: Storage): CommandeGardee | undefined {
  if (storage === undefined) return undefined;
  try {
    const raw = storage.getItem(COMMANDE_CLE);
    if (raw === null || raw === '') return undefined;
    const v: unknown = JSON.parse(raw);
    if (v === null || typeof v !== 'object') return undefined;
    const o = v as Record<string, unknown>;
    if (!nonEmpty(o['orderId']) || !nonEmpty(o['buyerRef']) || !nonEmpty(o['at'])) return undefined;
    return { orderId: o['orderId'], buyerRef: o['buyerRef'], at: o['at'] };
  } catch {
    return undefined;
  }
}

/** She said « C'est terminé » — the slot clears and the shortcut goes away. */
export function oublierCommande(storage?: Storage): void {
  if (storage === undefined) return;
  try {
    storage.removeItem(COMMANDE_CLE);
  } catch {
    /* best-effort */
  }
}

/** `localStorage`, or nothing — merely READING the property throws in a
 *  locked-down webview (the `sessionStorageOrUndefined` precedent, main.ts). */
export function localStorageOrUndefined(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}
