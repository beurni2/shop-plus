import { PlatformEventSchema, QuoteSchema } from '@platform/contracts';
import { decideBuyerRung } from '@shop-plus/commerce-core';
import { orderIdForQuote, type BuyerOrderView } from '../src/order-core.js';
import { readSandboxBehavior, sandboxPaymentProvider } from '../src/payment-port.js';
import {
  colisIdFor,
  decideColis,
  decideGroupParts,
  groupIdFor,
  groupStateOf,
  isGroupId,
  toBuyerGroupView,
  GROUP_MAX,
  GROUP_MIN,
  type ColisEntry,
  type GroupEntry,
  type GroupPart,
} from '../src/payment-group-core.js';
import { lireEligibilite } from './buyer-ladder-do.js';
import {
  DOOR_MODE,
  ID_ALPHABET,
  bounded,
  decodeId,
  mintCodeRemise,
  mintPaymentAttemptId,
  mintProviderLegKey,
  readBuyerContactWire,
  statusForRefusal,
  televerserNoteVocale,
  type BuyerContact,
} from './order-do.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PaymentGroupDO — ONE PAYMENT FOR SEVERAL ARTICLES (PAYER-TOUT-1).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Founder ruling 2026-09-22 (« 1 then 2 », option 1): the buyer pays her
 * boutique panier in ONE mobile-money confirmation, and each article stays its
 * OWN ORDER — its own quote, delivery fee, package, rider, custody, refund.
 *
 * One object per GROUP (`idFromName(groupId)`), and the group id is derived
 * from its set of quotes (`groupIdFor`), so the same panier asked twice
 * reaches the same object, the same key, and never a second collection.
 *
 * WHAT IT OWNS: the one collection — its provider key (minted once, durable
 * before any charge), its attempts, its failure notice. WHAT IT NEVER OWNS: a
 * money rule. Every amount is each order's own immutable Quote's, read by the
 * order itself; this object only adds them up (`decideGroupParts`), asks the
 * provider once for that sum, and hands the provider's answer back to every
 * order, which judges it in the vault against its own records.
 *
 * ═══ THE ORDER OF A PAYMENT, AND WHY IT IS THAT ORDER ═══
 *
 *  1. CHECK every order (its hold, its quote, its reseller) with nothing
 *     written — if one article is gone, she is told BEFORE a franc is asked.
 *  2. The attempt is durable as `creating` BEFORE any order is touched.
 *  3. CREATE every order to `payment_pending` (never charged by the order).
 *     One refusal ends the attempt for every order already moved.
 *  4. The attempt is durable as `charging` BEFORE the provider is called — so
 *     a death after this line can never lead to a second charge: a later ask
 *     answers the payment as it stands and waits for the webhook.
 *  5. CHARGE ONCE, for the sum, under the group's key.
 *  6. A charge that did not go through is a NOTICE to every order, durable
 *     first and carried by the alarm until each order has heard it.
 */

const GROUP_KEY = 'groupe';
const KEY_KEY = 'provider-key';
const ATTEMPTS_KEY = 'attempts';
const RESULTS_KEY = 'command-results';
const NOTICE_KEY = 'failure-notice';
/** COLIS-FOURNISSEUR-1 — each package's one remise code, by packageId. */
const CODES_COLIS_KEY = 'codes-colis';
/** COLIS-FOURNISSEUR-1 — the packages' door collections, by collection id. */
const PORTES_KEY = 'portes';
const PORTE_RESULTS_KEY = 'porte-command-results';

/**
 * COLIS-FOURNISSEUR-1 — ONE door payment for the articles she keeps from one
 * package (decision d). Its SET IS FIXED at its birth: a charge can end only
 * as accepted or unknown (a timeout may have moved money), so an article
 * charged once inside a collection never joins another — a retry of the same
 * set reuses the same key and amount, which the provider absorbs. A
 * collection whose charge was never asked frees its articles.
 */
interface PorteCollecte {
  readonly collectId: string;
  readonly packageId: string;
  /** Sorted — the set is what names the collection. */
  readonly orderIds: readonly string[];
  readonly parts: readonly { readonly orderId: string; readonly amount: number }[];
  readonly total: number;
  readonly correlationId: string;
  readonly providerKey: string;
  /** True from the moment the provider may have been called — never false again. */
  charged: boolean;
  /** An uncharged collection that could not be completed: its articles are free. */
  abandonnee?: true;
  attempts: { attemptId: string; requestedAt: string; outcome: string; collectRef?: string }[];
}

interface PorteArgs {
  readonly packageId: string;
  readonly orderIds: readonly string[];
  readonly holderRef: string;
  readonly commandId: string;
}

interface StoredGroup {
  readonly groupId: string;
  readonly correlationId: string;
  /** The holder who first paid this panier — the only one it ever answers. */
  readonly holderRef: string;
  readonly paymentMode: string;
  /** Frozen at the group's birth; ordered by orderId. */
  readonly parts: readonly GroupPart[];
  readonly total: number;
  readonly dueTotal: number;
  readonly deliveryTotal: number;
  readonly createdAt: string;
  /**
   * COLIS-FOURNISSEUR-1 — the packages inside this payment, frozen at its
   * birth like its parts: each package's id and its orders, in its order.
   */
  readonly colis?: readonly ColisDuGroupe[];
}

/** COLIS-FOURNISSEUR-1 — one package of the payment, as its orders will carry it. */
interface ColisDuGroupe {
  readonly packageId: string;
  readonly orderIds: readonly string[];
}

type NoticeOutcome = 'timeout' | 'idempotency_key_amount_mismatch' | 'group_incomplete' | 'provider_amount_divergence';

interface GroupAttempt {
  readonly attemptId: string;
  readonly requestedAt: string;
  phase: 'creating' | 'charging' | 'accepted' | 'failed';
  /** True from the moment the provider may have been called — the sandbox's own count reads it. */
  charged: boolean;
  outcome?: NoticeOutcome;
  collectRef?: string;
}

interface Notice {
  readonly attemptId: string;
  readonly outcome: NoticeOutcome;
  remaining: string[];
  attempts: number;
}

/** A quote as the router read it server-side: bytes absent only when it expired. */
interface QuoteRead {
  readonly quoteId: string;
  readonly quoteBytes?: string;
  readonly fulfillment?: unknown;
}

interface PayArgs {
  readonly groupId: string;
  readonly quotes: readonly QuoteRead[];
  /** COLIS-FOURNISSEUR-1 — decided by the router off the quotes' own records. */
  readonly colis?: readonly ColisDuGroupe[];
  readonly holderRef: string;
  readonly commandId: string;
  readonly contact: BuyerContact | null;
  readonly audioB64?: string;
}

interface CheckAnswer {
  ok?: boolean;
  reason?: string;
  etat?: 'nouvelle' | 'echouee' | 'en_cours';
  orderId?: string;
  paymentMode?: string;
  attributionResellerId?: string;
  zoneTo?: string;
  amountPaidAtCheckout?: number;
  amountDueAtDelivery?: number;
  deliveryFee?: number;
  productSubtotal?: number;
}

export interface PaymentGroupDOEnv {
  readonly ORDER: DurableObjectNamespace;
  readonly PAYMENT_SANDBOX_BEHAVIOR?: string;
  readonly MEDIA?: { fetch(request: Request): Promise<Response> };
  readonly MEDIA_WRITE_KEY?: string;
}

const refusal = (reason: string, extra: Record<string, unknown> = {}): Response =>
  Response.json({ ok: false, reason, ...extra }, { status: statusForRefusal(reason) });

export class PaymentGroupDO {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: PaymentGroupDOEnv,
  ) {}

  private order(orderId: string): DurableObjectStub {
    return this.env.ORDER.get(this.env.ORDER.idFromName(orderId));
  }

  private async post(orderId: string, path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> | null }> {
    try {
      const res = await this.order(orderId).fetch(
        new Request(`https://do${path}`, { method: 'POST', body: JSON.stringify(body) }),
      );
      return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
    } catch {
      return { status: 503, json: null };
    }
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method === 'POST' && pathname === '/entry/pay') {
      const args = (await request.json().catch(() => null)) as PayArgs | null;
      if (args === null || typeof args.groupId !== 'string' || !Array.isArray(args.quotes)) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      return this.pay(args);
    }
    if (request.method === 'GET' && pathname === '/entry') {
      const view = await this.view();
      if (view === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
      return Response.json({ ok: true, view });
    }
    if (request.method === 'GET' && pathname === '/entry/parts') {
      const group = await this.state.storage.get<StoredGroup>(GROUP_KEY);
      if (group === undefined) return Response.json({ ok: false }, { status: 404 });
      return Response.json({ ok: true, orderIds: group.parts.map((p) => p.orderId) });
    }
    if (request.method === 'POST' && pathname === '/entry/webhook') {
      const body = (await request.json().catch(() => null)) as { event?: unknown } | null;
      if (body === null) return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      return this.onProviderEvent(body.event);
    }
    if (request.method === 'POST' && pathname === '/entry/porte') {
      const args = (await request.json().catch(() => null)) as PorteArgs | null;
      if (args === null || typeof args.packageId !== 'string' || !Array.isArray(args.orderIds)) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      return this.porte(args);
    }
    if (request.method === 'POST' && pathname === '/entry/porte-webhook') {
      const body = (await request.json().catch(() => null)) as { event?: unknown } | null;
      if (body === null) return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      return this.onPorteEvent(body.event);
    }
    /** COLIS-FOURNISSEUR-1 — the stand-in's key read for a door collection (webhook secret). */
    if (request.method === 'GET' && pathname === '/entry/porte-key') {
      const collectId = new URL(request.url).searchParams.get('collecte') ?? '';
      const portes = (await this.state.storage.get<Record<string, PorteCollecte>>(PORTES_KEY)) ?? {};
      const c = Object.prototype.hasOwnProperty.call(portes, collectId) ? portes[collectId] : undefined;
      if (c === undefined) return Response.json({ ok: false }, { status: 404 });
      return Response.json({ ok: true, legKey: c.providerKey, groupId: c.collectId });
    }
    /** The sandbox stand-in's key read — reached only behind the webhook secret. */
    if (request.method === 'GET' && pathname === '/entry/leg-key') {
      const group = await this.state.storage.get<StoredGroup>(GROUP_KEY);
      const legKey = await this.state.storage.get<string>(KEY_KEY);
      if (group === undefined || legKey === undefined) return Response.json({ ok: false }, { status: 404 });
      return Response.json({ ok: true, legKey, groupId: group.groupId });
    }
    return Response.json({ ok: false, reason: 'not_found' }, { status: 404 });
  }

  /* ─────────────────────────────── the pay ────────────────────────────────── */

  private async pay(args: PayArgs): Promise<Response> {
    let group = await this.state.storage.get<StoredGroup>(GROUP_KEY);
    const results = (await this.state.storage.get<Record<string, unknown>>(RESULTS_KEY)) ?? {};
    // THE REPLAY ROAD: a command that already moved something answers again,
    // to its own holder, whatever the clock says (COMMANDE-REJOUER-1's law).
    if (group !== undefined && group.holderRef === args.holderRef && Object.prototype.hasOwnProperty.call(results, args.commandId)) {
      return Response.json(results[args.commandId]);
    }
    if (group !== undefined && group.holderRef !== args.holderRef) return refusal('reservation_held_by_another');

    const attempts = (await this.state.storage.get<GroupAttempt[]>(ATTEMPTS_KEY)) ?? [];
    const last = attempts[attempts.length - 1];
    // A failure every order has not heard yet is finished first: a new
    // attempt must never start while one order still waits on the old one.
    if (last?.phase === 'failed' && !(await this.deliverNotice()).heard) return refusal('paiement_occupe');

    // 1. CHECK — every order, nothing written. The first refusal names its article.
    const entries: (GroupEntry & { etat: string })[] = [];
    for (const q of args.quotes) {
      const checked = await this.post(orderIdForQuote(q.quoteId), '/entry/group-check', {
        quoteId: q.quoteId,
        holderRef: args.holderRef,
        groupId: args.groupId,
        ...(q.quoteBytes !== undefined ? { quoteBytes: q.quoteBytes } : {}),
        fulfillment: q.fulfillment ?? null,
      });
      const c = checked.json as CheckAnswer | null;
      if (c === null || c.ok !== true) return refusal(c?.reason ?? 'paiement_occupe', { quoteId: q.quoteId });
      entries.push({
        quoteId: q.quoteId,
        orderId: String(c.orderId),
        paymentMode: String(c.paymentMode),
        attributionResellerId: String(c.attributionResellerId),
        zoneTo: typeof c.zoneTo === 'string' ? c.zoneTo : undefined,
        amountPaidAtCheckout: Number(c.amountPaidAtCheckout),
        amountDueAtDelivery: Number(c.amountDueAtDelivery),
        deliveryFee: Number(c.deliveryFee),
        productSubtotal: Number(c.productSubtotal),
        etat: String(c.etat),
      });
    }
    const decided = decideGroupParts(entries);
    if (!decided.ok) return refusal(decided.reason);
    if (group !== undefined && !memesParts(group.parts, decided.parts)) return refusal('group_share_mismatch');

    const etats = entries.map((e) => e.etat);
    const resume = last?.phase === 'creating';
    if (!resume && etats.some((e) => e === 'en_cours')) {
      // Every order is on its way: the charge went out (or may have), and the
      // provider's webhook is the only thing that moves them now.
      if (group !== undefined && last !== undefined && etats.every((e) => e === 'en_cours')) {
        return this.commeIlEst(group, args);
      }
      return refusal('paiement_occupe');
    }

    // 2. THE ATTEMPT IS DURABLE BEFORE ANY ORDER IS TOUCHED.
    const now = new Date().toISOString();
    if (group === undefined) {
      group = {
        groupId: args.groupId,
        // Derived, like an order's: one constant chain for every event of this collection.
        correlationId: `corr-${args.groupId}`,
        holderRef: args.holderRef,
        paymentMode: decided.paymentMode,
        parts: decided.parts,
        total: decided.total,
        dueTotal: decided.dueTotal,
        deliveryTotal: decided.deliveryTotal,
        createdAt: now,
        ...(args.colis !== undefined && args.colis.length > 0 ? { colis: args.colis } : {}),
      };
    }
    const attempt: GroupAttempt = resume && last !== undefined
      ? last
      : { attemptId: mintPaymentAttemptId(), requestedAt: now, phase: 'creating', charged: false };
    const nextAttempts = resume ? attempts : [...attempts, attempt];
    await this.state.storage.put(GROUP_KEY, group);
    if ((await this.state.storage.get<string>(KEY_KEY)) === undefined) {
      await this.state.storage.put(KEY_KEY, mintProviderLegKey());
    }
    await this.state.storage.put(ATTEMPTS_KEY, nextAttempts);
    // STRUCTURAL: the key handed to every order and to the provider is the one
    // STORAGE answers with — a charge cannot go out under an uncommitted key.
    const providerKey = await this.state.storage.get<string>(KEY_KEY);
    if (providerKey === undefined) return refusal('paiement_occupe');

    // Her note is kept ONCE for the whole panier; every order stores the ref.
    let contact = args.contact;
    let noteVocale: 'gardee' | 'perdue' | undefined;
    if (contact !== null && args.audioB64 !== undefined) {
      const ref = await televerserNoteVocale(this.env, args.audioB64);
      if (ref !== null) {
        contact = { ...contact, audioRef: ref };
        noteVocale = 'gardee';
      } else {
        noteVocale = 'perdue';
      }
    }

    // 3. CREATE every order to payment_pending — never charged by the order.
    const groupe = {
      groupId: group.groupId,
      correlationId: group.correlationId,
      providerKey,
      parts: group.parts.map((p) => ({ orderId: p.orderId, amount: p.amount })),
    };
    const commandes: { orderId: string; view: BuyerOrderView; buyerRef: string }[] = [];
    for (const part of group.parts) {
      const q = args.quotes.find((x) => x.quoteId === part.quoteId);
      const colis = colisDe(group, part.orderId);
      const created = await this.post(part.orderId, '/entry/group-create', {
        quoteId: part.quoteId,
        holderRef: args.holderRef,
        // Verifier BLOCKER 1 — the order's command is THIS ATTEMPT's: her
        // command sent again after a refusal is a new attempt, and each order
        // it had moved is RETRIED, never answered from the old attempt's reply.
        commandId: attempt.attemptId,
        ...(q?.quoteBytes !== undefined ? { quoteBytes: q.quoteBytes } : {}),
        fulfillment: q?.fulfillment ?? null,
        contact,
        groupe,
        groupAttemptId: attempt.attemptId,
        ...(colis !== undefined ? { colis } : {}),
      });
      const c = created.json as
        | { ok?: boolean; reason?: string; view?: BuyerOrderView; buyerRef?: string; groupAttemptId?: string }
        | null;
      if (c === null || c.ok !== true || c.view === undefined || typeof c.buyerRef !== 'string') {
        await this.endAttempt(nextAttempts, attempt, 'group_incomplete');
        return refusal(c?.reason ?? 'paiement_occupe', { quoteId: part.quoteId });
      }
      // THE CHARGE WAITS ON THE LIVE TRUTH: every order waiting for payment,
      // in THIS attempt — or nothing is asked of the provider.
      if (c.view.state !== 'payment_pending' || c.groupAttemptId !== attempt.attemptId) {
        await this.endAttempt(nextAttempts, attempt, 'group_incomplete');
        return refusal('paiement_occupe', { quoteId: part.quoteId });
      }
      commandes.push({ orderId: part.orderId, view: c.view, buyerRef: c.buyerRef });
    }

    // 4. DURABLE AS `charging` BEFORE THE PROVIDER IS CALLED.
    const alreadyInitiated = nextAttempts.filter((a) => a !== attempt && a.charged).length;
    attempt.phase = 'charging';
    attempt.charged = true;
    await this.state.storage.put(ATTEMPTS_KEY, nextAttempts);

    // 5. ONE CHARGE, FOR THE SUM, UNDER THE GROUP'S KEY. The merchant
    // reference the provider will echo is the GROUP's id.
    const provider = sandboxPaymentProvider(readSandboxBehavior(this.env.PAYMENT_SANDBOX_BEHAVIOR), alreadyInitiated);
    const charge = await provider.initiateCharge({
      orderId: group.groupId,
      paymentAttemptId: providerKey,
      amount: group.total,
      correlationId: group.correlationId,
      requestedAtIso: now,
      legType: 'checkout',
    });
    let views = commandes.map((c) => c.view);
    if (charge.chargedAmount !== group.total) {
      await this.endAttempt(nextAttempts, attempt, 'provider_amount_divergence', views);
      return refusal('provider_amount_divergence');
    }
    if (charge.accepted) {
      attempt.phase = 'accepted';
      attempt.collectRef = charge.collectRef;
      await this.state.storage.put(ATTEMPTS_KEY, nextAttempts);
    } else {
      views = await this.endAttempt(nextAttempts, attempt, charge.reason, views);
    }

    const answer = {
      ok: true,
      view: this.vueDe(group, views),
      commandes: commandes.map((c) => ({ orderId: c.orderId, buyerRef: c.buyerRef })),
    };
    await this.state.storage.put(RESULTS_KEY, { ...results, [args.commandId]: answer });
    return Response.json(noteVocale === undefined ? answer : { ...answer, noteVocale });
  }

  /** Every order is on its way: the payment as it stands, with her read tokens. */
  private async commeIlEst(group: StoredGroup, args: PayArgs): Promise<Response> {
    const commandes: { orderId: string; buyerRef: string }[] = [];
    const views: BuyerOrderView[] = [];
    for (const part of group.parts) {
      const q = args.quotes.find((x) => x.quoteId === part.quoteId);
      // group-create on an order already on its way answers it as it stands:
      // no write, no charge — the create road's own lost-answer recovery.
      const res = await this.post(part.orderId, '/entry/group-create', {
        quoteId: part.quoteId,
        holderRef: args.holderRef,
        commandId: args.commandId,
        ...(q?.quoteBytes !== undefined ? { quoteBytes: q.quoteBytes } : {}),
        fulfillment: q?.fulfillment ?? null,
        contact: null,
        groupe: {
          groupId: group.groupId,
          correlationId: group.correlationId,
          providerKey: (await this.state.storage.get<string>(KEY_KEY)) ?? '',
          parts: group.parts.map((p) => ({ orderId: p.orderId, amount: p.amount })),
        },
        groupAttemptId: 'lecture',
      });
      const c = res.json as { ok?: boolean; reason?: string; view?: BuyerOrderView; buyerRef?: string } | null;
      if (c === null || c.ok !== true || c.view === undefined || typeof c.buyerRef !== 'string') {
        return refusal(c?.reason ?? 'paiement_occupe', { quoteId: part.quoteId });
      }
      commandes.push({ orderId: part.orderId, buyerRef: c.buyerRef });
      views.push(c.view);
    }
    return Response.json({ ok: true, view: this.vueDe(group, views), commandes });
  }

  /**
   * 6. THE CHARGE DID NOT GO THROUGH (or the group could not be completed):
   * the attempt is durable as failed, the notice is durable, then delivered.
   * Returns the orders' views as the notice left them.
   */
  private async endAttempt(
    attempts: GroupAttempt[],
    attempt: GroupAttempt,
    outcome: NoticeOutcome,
    views: BuyerOrderView[] = [],
  ): Promise<BuyerOrderView[]> {
    const group = await this.state.storage.get<StoredGroup>(GROUP_KEY);
    attempt.phase = 'failed';
    attempt.outcome = outcome;
    const notice: Notice = {
      attemptId: attempt.attemptId,
      outcome,
      remaining: group?.parts.map((p) => p.orderId) ?? [],
      attempts: 0,
    };
    await this.state.storage.put({ [ATTEMPTS_KEY]: attempts, [NOTICE_KEY]: notice });
    // The alarm is the net: armed before the first delivery, so a death
    // mid-delivery still reaches every order.
    await this.state.storage.setAlarm(Date.now() + 60_000).catch(() => undefined);
    const delivered = await this.deliverNotice();
    // Each order answers the notice with its own view as it left it.
    return views.map((v) => delivered.views.get(v.orderId) ?? v);
  }

  /**
   * Carry the failure notice to every order that has not heard it. An order
   * never born in this attempt answers 404 — nothing to end, heard. True when
   * every order has heard it.
   */
  private async deliverNotice(): Promise<{ heard: boolean; views: Map<string, BuyerOrderView> }> {
    const views = new Map<string, BuyerOrderView>();
    const notice = await this.state.storage.get<Notice>(NOTICE_KEY);
    if (notice === undefined) return { heard: true, views };
    const group = await this.state.storage.get<StoredGroup>(GROUP_KEY);
    if (group === undefined) return { heard: true, views };
    const still: string[] = [];
    for (const orderId of notice.remaining) {
      const res = await this.post(orderId, '/entry/group-charged', {
        groupId: group.groupId,
        groupAttemptId: notice.attemptId,
        outcome: notice.outcome,
      });
      if (res.status !== 200 && res.status !== 404) still.push(orderId);
      const view = res.json?.['view'] as BuyerOrderView | undefined;
      if (res.status === 200 && view !== undefined) views.set(orderId, view);
    }
    if (still.length === 0) {
      await this.state.storage.delete(NOTICE_KEY);
      return { heard: true, views };
    }
    const attempts = notice.attempts + 1;
    await this.state.storage.put(NOTICE_KEY, { ...notice, remaining: still, attempts });
    await this.state.storage
      .setAlarm(Date.now() + Math.min(3_600_000, 60_000 * 2 ** Math.min(attempts, 6)))
      .catch(() => undefined);
    return { heard: false, views };
  }

  async alarm(): Promise<void> {
    await this.deliverNotice();
  }

  /* ─────────────────────────── the provider webhook ─────────────────────────── */

  /**
   * ONE WEBHOOK, EVERY ORDER. The event is handed VERBATIM to each order of
   * the group, and each judges it in the vault against its OWN records
   * (`onGroupProviderPaymentEvent`): the group's correlation and key, the sum
   * to the franc, its own share. Nothing here decides that money arrived.
   * EVERY order hears EVERY confirmation, even after one refuses: each order
   * keeps its own books and its own alerts (a rival confirmation is recorded
   * on each), and one order's transient refusal never keeps a genuine payment
   * from the others. The provider hears `applied` only when every order
   * applied (or had already); otherwise the first refusal, by its own name
   * and status, so it redelivers and the orders that applied absorb it.
   */
  private async onProviderEvent(event: unknown): Promise<Response> {
    const group = await this.state.storage.get<StoredGroup>(GROUP_KEY);
    if (group === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
    const probe = PlatformEventSchema.safeParse(event);
    if (!probe.success) return Response.json({ ok: false, reason: 'not_a_platform_event' }, { status: 422 });
    if (probe.data.envelope.command_id.length > 1024) {
      return Response.json({ ok: false, reason: 'envelope_field_too_long' }, { status: 422 });
    }
    /**
     * COLIS-FOURNISSEUR-1 — ONE code per package (founder ruling 2026-09-23):
     * minted here, at the payment's confirmation, once — durable BEFORE any
     * article hears it, so a redelivery hands every article the same six
     * digits. It lives only in these objects; each article keeps it as its
     * own remise code at its own confirmation, and custody is armed with it
     * for each of them. An article alone never receives one.
     */
    let codes = (await this.state.storage.get<Record<string, string>>(CODES_COLIS_KEY)) ?? {};
    if ((group.colis ?? []).some((c) => codes[c.packageId] === undefined)) {
      codes = { ...codes };
      for (const c of group.colis ?? []) codes[c.packageId] ??= mintCodeRemise();
      await this.state.storage.put(CODES_COLIS_KEY, codes);
      codes = (await this.state.storage.get<Record<string, string>>(CODES_COLIS_KEY)) ?? {};
    }
    const states: string[] = [];
    let allDuplicate = true;
    let firstRefusal: Response | undefined;
    for (const part of group.parts) {
      const colis = colisDe(group, part.orderId);
      const codeColis = colis === undefined ? undefined : codes[colis.packageId];
      const res = await this.post(part.orderId, '/entry/webhook', { event, ...(codeColis !== undefined ? { codeColis } : {}) });
      const body = res.json as { ok?: boolean; reason?: string; status?: string; state?: string } | null;
      if (body === null || body.ok !== true) {
        firstRefusal ??= Response.json(
          { ok: false, reason: body?.reason ?? 'unknown_order' },
          { status: body === null ? 503 : res.status },
        );
        continue;
      }
      if (body.status !== 'duplicate') allDuplicate = false;
      states.push(String(body.state));
    }
    if (firstRefusal !== undefined) return firstRefusal;
    return Response.json({ ok: true, status: allDuplicate ? 'duplicate' : 'applied', state: groupStateOf(states) });
  }

  /* ─────────────── COLIS-FOURNISSEUR-1 — the package's one door payment ─────────────── */

  private async porte(args: PorteArgs): Promise<Response> {
    const group = await this.state.storage.get<StoredGroup>(GROUP_KEY);
    if (group === undefined) return refusal('unknown_order');
    if (group.holderRef !== args.holderRef) return refusal('reservation_held_by_another');
    const colis = group.colis?.find((c) => c.packageId === args.packageId);
    if (colis === undefined) return refusal('unknown_order');
    const set = [...new Set(args.orderIds)].sort();
    if (set.length === 0 || set.length !== args.orderIds.length || !set.every((id) => colis.orderIds.includes(id))) {
      return refusal('malformed');
    }
    const results = (await this.state.storage.get<Record<string, unknown>>(PORTE_RESULTS_KEY)) ?? {};
    if (Object.prototype.hasOwnProperty.call(results, args.commandId)) return Response.json(results[args.commandId]);

    const portes = (await this.state.storage.get<Record<string, PorteCollecte>>(PORTES_KEY)) ?? {};
    const vivantes = Object.values(portes).filter((c) => c.packageId === colis.packageId && c.abandonnee !== true);
    let collecte = vivantes.find((c) => c.orderIds.length === set.length && c.orderIds.every((id, i) => id === set[i]));
    if (collecte === undefined) {
      // A NEW set: none of its articles may already be in a live collection.
      const prise = set.find((id) => vivantes.some((c) => c.orderIds.includes(id)));
      if (prise !== undefined) return refusal('porte_deja_choisie', { orderId: prise });
    } else {
      const last = collecte.attempts[collecte.attempts.length - 1];
      // Asked and not failed: the provider's webhook is what moves it now.
      if (last !== undefined && (last.outcome === 'accepted' || last.outcome === 'pending')) {
        return Response.json({ ok: true, view: await this.vueColis(colis), montant: collecte.total });
      }
    }

    // 1. CHECK every article, nothing written; the first refusal names it.
    const parts: { orderId: string; amount: number }[] = [];
    for (const orderId of set) {
      const checked = await this.post(orderId, '/entry/porte-check', { holderRef: args.holderRef });
      const c = checked.json as { ok?: boolean; reason?: string; amount?: number } | null;
      if (c === null || c.ok !== true || typeof c.amount !== 'number') return refusal(c?.reason ?? 'paiement_occupe', { orderId });
      parts.push({ orderId, amount: c.amount });
    }
    const total = parts.reduce((t, p) => t + p.amount, 0);
    if (!Number.isSafeInteger(total) || total <= 0) return refusal('montant_illisible');
    if (collecte !== undefined && !parts.every((p, i) => p.orderId === collecte!.parts[i]?.orderId && p.amount === collecte!.parts[i]?.amount)) {
      return refusal('group_share_mismatch');
    }

    // 2. THE COLLECTION AND ITS KEY ARE DURABLE BEFORE ANY ARTICLE ENTERS IT.
    if (collecte === undefined) {
      const collectId = `${group.groupId}-porte-${Object.keys(portes).length + 1}`;
      collecte = {
        collectId,
        packageId: colis.packageId,
        orderIds: set,
        parts,
        total,
        correlationId: `corr-${collectId}`,
        providerKey: mintProviderLegKey(),
        charged: false,
        attempts: [],
      };
      await this.state.storage.put(PORTES_KEY, { ...portes, [collectId]: collecte });
    }
    const stored = ((await this.state.storage.get<Record<string, PorteCollecte>>(PORTES_KEY)) ?? {})[collecte.collectId];
    if (stored === undefined) return refusal('paiement_occupe');
    collecte = stored;

    // 3. ENTER every article: its record first-wins, BEFORE any charge.
    for (const orderId of collecte.orderIds) {
      const entered = await this.post(orderId, '/entry/porte-enter', {
        holderRef: args.holderRef,
        collectId: collecte.collectId,
        collecte: { correlationId: collecte.correlationId, providerKey: collecte.providerKey, parts: collecte.parts },
      });
      if (entered.json?.['ok'] !== true) {
        // Never charged ⇒ nothing can have moved: its articles are free again.
        if (!collecte.charged) await this.majPorte({ ...collecte, abandonnee: true });
        return refusal(typeof entered.json?.['reason'] === 'string' ? entered.json['reason'] : 'paiement_occupe', { orderId });
      }
    }

    // 4. DURABLE AS CHARGED BEFORE THE PROVIDER IS CALLED.
    const now = new Date().toISOString();
    const deja = collecte.attempts.length;
    const attempt = { attemptId: mintPaymentAttemptId(), requestedAt: now, outcome: 'pending' };
    collecte = { ...collecte, charged: true, attempts: [...collecte.attempts, attempt] };
    await this.majPorte(collecte);

    // 5. ONE CHARGE, FOR THE SUM, UNDER THE COLLECTION'S KEY.
    const provider = sandboxPaymentProvider(readSandboxBehavior(this.env.PAYMENT_SANDBOX_BEHAVIOR), deja);
    const charge = await provider.initiateCharge({
      orderId: collecte.collectId,
      paymentAttemptId: collecte.providerKey,
      amount: collecte.total,
      correlationId: collecte.correlationId,
      requestedAtIso: now,
      legType: 'door',
    });
    const outcome = charge.chargedAmount !== collecte.total ? 'provider_amount_divergence' : charge.accepted ? 'accepted' : charge.reason;
    collecte = {
      ...collecte,
      attempts: collecte.attempts.map((a) =>
        a.attemptId === attempt.attemptId ? { ...a, outcome, ...(charge.accepted ? { collectRef: charge.collectRef } : {}) } : a,
      ),
    };
    await this.majPorte(collecte);
    // Not accepted: nothing moved on her side; the same set retries under the same key.
    if (outcome !== 'accepted') return refusal(outcome);
    // The ONE amount the provider was asked for — the server's sum, never her phone's.
    const answer = { ok: true, view: await this.vueColis(colis), montant: collecte.total };
    await this.state.storage.put(PORTE_RESULTS_KEY, { ...results, [args.commandId]: answer });
    return Response.json(answer);
  }

  private async majPorte(collecte: PorteCollecte): Promise<void> {
    const portes = (await this.state.storage.get<Record<string, PorteCollecte>>(PORTES_KEY)) ?? {};
    await this.state.storage.put(PORTES_KEY, { ...portes, [collecte.collectId]: collecte });
  }

  /** The package's articles as they stand — each order's own projection. */
  private async vueColis(colis: ColisDuGroupe): Promise<BuyerOrderView[]> {
    const vues: BuyerOrderView[] = [];
    for (const orderId of colis.orderIds) {
      const res = await this.order(orderId).fetch(new Request('https://do/entry')).catch(() => null);
      const body = res === null ? null : ((await res.json().catch(() => null)) as { ok?: boolean; view?: BuyerOrderView } | null);
      if (body?.ok === true && body.view !== undefined) vues.push(body.view);
    }
    return vues;
  }

  /**
   * ONE DOOR CONFIRMATION, EVERY ARTICLE OF ITS COLLECTION — handed verbatim;
   * each judges it in the vault against the record it stored when it entered
   * (`onGroupDoorPaymentEvent`). The provider hears `applied` only when every
   * article applied (or had already), else the first refusal by its own name.
   */
  private async onPorteEvent(event: unknown): Promise<Response> {
    const probe = PlatformEventSchema.safeParse(event);
    if (!probe.success) return Response.json({ ok: false, reason: 'not_a_platform_event' }, { status: 422 });
    const ref = (probe.data.payload as Record<string, unknown>)['order_id'];
    const portes = (await this.state.storage.get<Record<string, PorteCollecte>>(PORTES_KEY)) ?? {};
    const collecte = typeof ref === 'string' && Object.prototype.hasOwnProperty.call(portes, ref) ? portes[ref] : undefined;
    if (collecte === undefined || !collecte.charged) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
    let allDuplicate = true;
    let firstRefusal: Response | undefined;
    for (const orderId of collecte.orderIds) {
      const res = await this.post(orderId, '/entry/porte-webhook', { event, collectId: collecte.collectId });
      const body = res.json as { ok?: boolean; reason?: string; status?: string } | null;
      if (body === null || body.ok !== true) {
        firstRefusal ??= Response.json({ ok: false, reason: body?.reason ?? 'unknown_order' }, { status: body === null ? 503 : res.status });
        continue;
      }
      if (body.status !== 'duplicate') allDuplicate = false;
    }
    if (firstRefusal !== undefined) return firstRefusal;
    return Response.json({ ok: true, status: allDuplicate ? 'duplicate' : 'applied', doorLeg: 'paid' });
  }

  /* ──────────────────────────────── the read ────────────────────────────────── */

  private vueDe(group: StoredGroup, articles: readonly BuyerOrderView[]) {
    return toBuyerGroupView({
      groupId: group.groupId,
      paymentMode: group.paymentMode,
      total: group.total,
      dueTotal: group.dueTotal,
      deliveryTotal: group.deliveryTotal,
      articles,
      ...(group.colis !== undefined ? { colis: group.colis } : {}),
    });
  }

  private async view() {
    const group = await this.state.storage.get<StoredGroup>(GROUP_KEY);
    if (group === undefined) return undefined;
    const articles: BuyerOrderView[] = [];
    for (const part of group.parts) {
      const res = await this.order(part.orderId).fetch(new Request('https://do/entry')).catch(() => null);
      const body = res === null ? null : ((await res.json().catch(() => null)) as { ok?: boolean; view?: BuyerOrderView } | null);
      // An article not born yet (a refused first attempt) is honestly absent.
      if (body?.ok === true && body.view !== undefined) articles.push(body.view);
    }
    if (articles.length === 0) return undefined;
    return this.vueDe(group, articles);
  }
}

function memesParts(a: readonly GroupPart[], b: readonly GroupPart[]): boolean {
  return a.length === b.length && a.every((p, i) => p.orderId === b[i]?.orderId && p.amount === b[i]?.amount && p.due === b[i]?.due);
}

/* ═══════════════════════════ the buyer's three doors ═══════════════════════════ */

/** The wire vocabulary of a grouped payment. No amount field, and no liste: a gift is paid on its own. */
const GROUP_FIELDS = ['quoteIds', 'holderRef', 'commandId', 'contact'];
const PRICE_FIELDS = ['quoteIds'];
/** COLIS-FOURNISSEUR-1 — the package door's vocabulary: which package, which articles she keeps. No amount. */
const PORTE_FIELDS = ['packageId', 'orderIds', 'holderRef', 'commandId'];

interface RouterEnv {
  readonly CHECKOUT: DurableObjectNamespace;
  readonly PAYMENT_GROUP: DurableObjectNamespace;
  readonly LADDER?: DurableObjectNamespace;
}

const badRequest = (error: string, field?: string): Response =>
  Response.json(field === undefined ? { error } : { error, field }, { status: 400 });
const refuse = (reason: string, quoteId?: string): Response =>
  Response.json(quoteId === undefined ? { error: reason } : { error: reason, quoteId }, { status: statusForRefusal(reason) });

function readQuoteIds(value: unknown): string[] | Response {
  if (!Array.isArray(value) || value.length < GROUP_MIN || value.length > GROUP_MAX) return badRequest('bad_field', 'quoteIds');
  const ids: string[] = [];
  for (const id of value as unknown[]) {
    if (!bounded(id, 191) || !ID_ALPHABET.test(id)) return badRequest('bad_field', 'quoteIds');
    ids.push(id);
  }
  if (new Set(ids).size !== ids.length) return badRequest('bad_field', 'quoteIds');
  return ids;
}

interface QuoteBody {
  ok?: boolean;
  reason?: string;
  canonicalBytes?: string;
  fulfillment?: { zoneTo?: unknown; productVersionId?: unknown } | null;
  quote?: { paymentMode?: unknown; deliveryFee?: unknown };
  /** COLIS-FOURNISSEUR-1 — the package the quote was priced in, when it was. */
  colis?: { pids?: unknown; packageFee?: unknown };
}

/** COLIS-FOURNISSEUR-1 — what one article's record says about its package, read strictly. */
function colisEntryDe(quoteId: string, lu: QuoteBody, deliveryFee: number): ColisEntry {
  const pid = lu.fulfillment?.productVersionId;
  const c = lu.colis;
  const lisible =
    c !== undefined &&
    Array.isArray(c.pids) &&
    c.pids.every((x) => typeof x === 'string' && x !== '') &&
    typeof c.packageFee === 'number';
  return {
    quoteId,
    orderId: orderIdForQuote(quoteId),
    pid: typeof pid === 'string' && pid !== '' ? pid : undefined,
    deliveryFee,
    // A record that is there but unreadable is a package nobody can check:
    // it is kept as one (so it can only refuse), never read as « alone ».
    colis: c === undefined ? undefined : lisible ? { pids: c.pids as string[], packageFee: c.packageFee as number } : { pids: [], packageFee: -1 },
  };
}

/** The packages of a payment, with their derived ids — or the one refusal. */
async function colisDuPanier(entries: readonly ColisEntry[]): Promise<{ colis: ColisDuGroupe[]; livraisons: number } | null> {
  const decided = decideColis(entries);
  if (!decided.ok) return null;
  const colis: ColisDuGroupe[] = [];
  for (const c of decided.colis) colis.push({ packageId: await colisIdFor(c.quoteIds), orderIds: [...c.orderIds] });
  return { colis, livraisons: decided.livraisons };
}

function colisDe(group: StoredGroup, orderId: string): ColisDuGroupe | undefined {
  return group.colis?.find((c) => c.orderIds.includes(orderId));
}

async function lireQuote(env: RouterEnv, quoteId: string): Promise<QuoteBody | null> {
  const res = await env.CHECKOUT.get(env.CHECKOUT.idFromName(quoteId)).fetch(new Request('https://do/entry'));
  return (await res.json().catch(() => null)) as QuoteBody | null;
}

/**
 * Router — the grouped payment's public surface (PAYER-TOUT-1):
 *   POST /checkout/group/price   the panier's one total, stated by the server
 *   POST /checkout/group         pay the panier in one collection
 *   GET  /checkout/group/:id     the payment and each of its orders, as they stand
 * PUBLIC on the order doors' exact terms: no key for her to hold, no amount can
 * arrive (allowlists with no money field), none can leave beyond what each
 * article's own quote view already shows her.
 */
export const groupRouter = {
  async fetch(request: Request, env: RouterEnv): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'POST' && pathname === '/checkout/group/price') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return badRequest('malformed');
      for (const key of Object.keys(body)) if (!PRICE_FIELDS.includes(key)) return badRequest('unknown_field', key);
      const ids = readQuoteIds(body['quoteIds']);
      if (ids instanceof Response) return ids;
      const entries: GroupEntry[] = [];
      const colisEntries: ColisEntry[] = [];
      for (const quoteId of ids) {
        const lu = await lireQuote(env, quoteId);
        if (lu === null || lu.ok !== true || typeof lu.canonicalBytes !== 'string') {
          return refuse(lu?.reason === 'not_found' || lu === null ? 'quote_unknown' : (lu.reason ?? 'quote_unknown'), quoteId);
        }
        const parsed = QuoteSchema.safeParse(JSON.parse(lu.canonicalBytes));
        if (!parsed.success) return refuse('quote_unknown', quoteId);
        const q = parsed.data;
        const zone = lu.fulfillment?.zoneTo;
        entries.push({
          quoteId,
          orderId: orderIdForQuote(quoteId),
          paymentMode: q.paymentMode,
          attributionResellerId: q.attributionResellerId,
          zoneTo: typeof zone === 'string' && zone !== '' ? zone : undefined,
          amountPaidAtCheckout: q.amountPaidAtCheckout,
          amountDueAtDelivery: q.amountDueAtDelivery,
          deliveryFee: q.deliveryFee,
          productSubtotal: q.productSubtotal,
        });
        colisEntries.push(colisEntryDe(quoteId, lu, q.deliveryFee));
      }
      const decided = decideGroupParts(entries);
      if (!decided.ok) return refuse(decided.reason);
      const colis = await colisDuPanier(colisEntries);
      if (colis === null) return refuse('colis_incomplet');
      return Response.json(
        {
          paymentMode: decided.paymentMode,
          articles: decided.parts.length,
          // COLIS-FOURNISSEUR-1 — how many deliveries she pays for: one per
          // package, one per article travelling alone.
          livraisons: colis.livraisons,
          amountPaidAtCheckout: decided.total,
          amountDueAtDelivery: decided.dueTotal,
          deliveryTotal: decided.deliveryTotal,
          productTotal: decided.productTotal,
        },
        { status: 200 },
      );
    }

    if (request.method === 'POST' && pathname === '/checkout/group') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return badRequest('malformed');
      for (const key of Object.keys(body)) if (!GROUP_FIELDS.includes(key)) return badRequest('unknown_field', key);
      const ids = readQuoteIds(body['quoteIds']);
      if (ids instanceof Response) return ids;
      if (!bounded(body['holderRef'], 128)) return badRequest('bad_field', 'holderRef');
      if (!bounded(body['commandId'], 128) || !ID_ALPHABET.test(body['commandId'])) return badRequest('bad_field', 'commandId');
      let contact: BuyerContact | null = null;
      let audioB64: string | undefined;
      if (body['contact'] !== undefined && body['contact'] !== null) {
        const wire = readBuyerContactWire(body['contact']);
        if (wire === null) return badRequest('bad_field', 'contact');
        contact = wire.contact;
        audioB64 = wire.audioB64;
      }

      // Each quote's OWN bytes, server-side. An expired quote travels without
      // bytes: only the replay road can succeed on it (COMMANDE-REJOUER-1).
      const quotes: QuoteRead[] = [];
      const colisEntries: ColisEntry[] = [];
      let doorMode = false;
      let uneExpiree = false;
      for (const quoteId of ids) {
        const lu = await lireQuote(env, quoteId);
        if (lu === null) return refuse('quote_unknown', quoteId);
        const expiree = lu.ok !== true && lu.reason === 'expired';
        if (!expiree && (lu.ok !== true || typeof lu.canonicalBytes !== 'string')) {
          return refuse(lu.reason === 'not_found' ? 'quote_unknown' : (lu.reason ?? 'quote_unknown'), quoteId);
        }
        if (lu.quote?.paymentMode === DOOR_MODE) doorMode = true;
        if (expiree) uneExpiree = true;
        colisEntries.push(colisEntryDe(quoteId, lu, typeof lu.quote?.deliveryFee === 'number' ? lu.quote.deliveryFee : -1));
        quotes.push({
          quoteId,
          ...(expiree ? {} : { quoteBytes: lu.canonicalBytes as string }),
          fulfillment: lu.fulfillment ?? null,
        });
      }
      // THE §6.4 BUYER RUNG, once for the whole panier: every article is
      // delivered to the same person, so her rung is one fact (SP6.3's door).
      if (doorMode) {
        if (contact === null) return refuse('contact_required_for_door');
        const eligibility = await lireEligibilite(env, contact.phone);
        if (eligibility === undefined) return refuse('pay_at_door_not_eligible');
        if (!decideBuyerRung(eligibility, new Date().toISOString()).allowed) return refuse('pay_at_door_not_eligible');
      }

      // COLIS-FOURNISSEUR-1 — a package is paid whole or not at all. Judged
      // on live quotes only: an expired one carries no record to judge, and
      // only the replay road can succeed on it — over a group whose packages
      // were frozen at its birth (a new group on an expired quote is refused
      // by the order's own check).
      const colis = uneExpiree ? { colis: [] as ColisDuGroupe[], livraisons: 0 } : await colisDuPanier(colisEntries);
      if (colis === null) return refuse('colis_incomplet');

      const groupId = await groupIdFor(ids);
      const res = await env.PAYMENT_GROUP.get(env.PAYMENT_GROUP.idFromName(groupId)).fetch(
        new Request('https://do/entry/pay', {
          method: 'POST',
          body: JSON.stringify({
            groupId,
            quotes,
            holderRef: body['holderRef'],
            commandId: body['commandId'],
            contact,
            ...(contact !== null && audioB64 !== undefined ? { audioB64 } : {}),
            ...(colis.colis.length > 0 ? { colis: colis.colis } : {}),
          }),
        }),
      );
      const decided = (await res.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; quoteId?: string; view?: Record<string, unknown>; commandes?: unknown; noteVocale?: unknown }
        | null;
      if (decided === null) return refuse('paiement_occupe');
      if (decided.ok !== true || decided.view === undefined) {
        return refuse(decided.reason ?? 'refused', typeof decided.quoteId === 'string' ? decided.quoteId : undefined);
      }
      // THE BOUNDARY: the group's view (each order's own projection inside),
      // plus the create-only facts — her read token per order, her note's fate.
      return Response.json(
        {
          ...decided.view,
          commandes: decided.commandes,
          ...(decided.noteVocale === 'gardee' || decided.noteVocale === 'perdue' ? { noteVocale: decided.noteVocale } : {}),
        },
        { status: 200 },
      );
    }

    /**
     * COLIS-FOURNISSEUR-1 — ONE payment at the door for the articles she
     * keeps from one package (decision d). Public on the single door's exact
     * terms: no amount can arrive (an allowlist of ids), none can leave but
     * each article's own projection, and it cannot declare money received —
     * it asks the provider once; only the secret-gated door webhook confirms.
     */
    const porte = /^\/checkout\/group\/([^/]+)\/porte$/.exec(pathname);
    if (porte && request.method === 'POST') {
      const groupId = decodeId(porte[1]!);
      if (groupId === undefined || !ID_ALPHABET.test(groupId) || !isGroupId(groupId)) return badRequest('bad_field', 'groupId');
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return badRequest('malformed');
      for (const key of Object.keys(body)) if (!PORTE_FIELDS.includes(key)) return badRequest('unknown_field', key);
      if (!bounded(body['packageId'], 191) || !ID_ALPHABET.test(body['packageId'])) return badRequest('bad_field', 'packageId');
      const ids = body['orderIds'];
      if (
        !Array.isArray(ids) || ids.length === 0 || ids.length > GROUP_MAX ||
        !ids.every((id) => bounded(id, 191) && ID_ALPHABET.test(id)) || new Set(ids).size !== ids.length
      ) {
        return badRequest('bad_field', 'orderIds');
      }
      if (!bounded(body['holderRef'], 128)) return badRequest('bad_field', 'holderRef');
      if (!bounded(body['commandId'], 128) || !ID_ALPHABET.test(body['commandId'])) return badRequest('bad_field', 'commandId');
      const res = await env.PAYMENT_GROUP.get(env.PAYMENT_GROUP.idFromName(groupId)).fetch(
        new Request('https://do/entry/porte', {
          method: 'POST',
          body: JSON.stringify({ packageId: body['packageId'], orderIds: ids, holderRef: body['holderRef'], commandId: body['commandId'] }),
        }),
      );
      const decided = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string; orderId?: unknown; view?: unknown; montant?: unknown } | null;
      if (decided === null) return refuse('paiement_occupe');
      if (decided.ok !== true || !Array.isArray(decided.view)) {
        const reason = decided.reason ?? 'refused';
        return Response.json(
          typeof decided.orderId === 'string' ? { error: reason, orderId: decided.orderId } : { error: reason },
          { status: statusForRefusal(reason) },
        );
      }
      // Each kept article's own projection, as it stands (« accepted is not
      // paid »), and the one amount the operator will ask her for.
      return Response.json({ articles: decided.view, montant: decided.montant }, { status: 200 });
    }

    const byId = /^\/checkout\/group\/([^/]+)$/.exec(pathname);
    if (byId && request.method === 'GET') {
      const groupId = decodeId(byId[1]!);
      if (groupId === undefined || !ID_ALPHABET.test(groupId) || !isGroupId(groupId)) return badRequest('bad_field', 'groupId');
      const res = await env.PAYMENT_GROUP.get(env.PAYMENT_GROUP.idFromName(groupId)).fetch(new Request('https://do/entry'));
      const body = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string; view?: unknown } | null;
      if (body === null || body.ok !== true || body.view === undefined) return refuse(body?.reason ?? 'unknown_order');
      return Response.json(body.view, { status: 200 });
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  },
};

