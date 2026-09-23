import { splitPackageDeliveryFee } from '@platform/contracts';
import { describe, expect, it } from 'vitest';
import { decideIssueQuote } from '../src/checkout-core.js';
import { BoundColisGrouping, AbsentColisGrouping, GROUPING_ROUTE, MemorisedColisGrouping, fusionnerMemoire, grouperDeMemoire, type ColisGroupingPort, type ColisMemoire } from '../src/colis-source.js';
import { quoteDeliveryFee } from '../src/delivery-source.js';
import type { ListingEntry } from '../src/listing-core.js';
import { MockPaymentProvider } from '@shop-plus/commerce-core';
import {
  colisIdFor,
  decideColis,
  jugerPorteFermee,
  jugerRemboursementPorte,
  retourBloque,
  type ColisEntry,
  type RetourPorte,
} from '../src/payment-group-core.js';
import { composeSandboxRefund } from '../../../scripts/sandbox-payment-confirm.mjs';

/**
 * COLIS-FOURNISSEUR-1 (founder rulings 2026-09-23) — the pure halves of the
 * Shop+ package, by value: the quote carries its share of the one fee; a
 * payment carries a package whole or not at all; the grouping client believes
 * only a grouping of exactly what it asked.
 */

/* ─────────────────────────── the quote's share ─────────────────────────── */

const T = '2026-09-23T08:00:00.000Z';
const entry = {
  listing: {
    id: 'lst-1', storefrontId: 'sf-1', resellerId: 'rs-1', productVersionId: 'pv-1', offerVersion: 'ov-1',
    markup: 1_500, status: 'published', publishedAt: T, correlationId: 'corr-1',
  },
  customerPriceFcfa: 11_500,
  resellerCommission: 1_000,
} as unknown as ListingEntry;
const request = { slug: 'shop', pid: 'pv-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou', attributionResellerId: 'rs-1', requestKey: 'k'.repeat(16) };
const deps = { flags: { version: 't', flags: {}, kills: [], killedCategories: [] }, now: () => new Date(T), newId: () => 'quote-colis-1' };
const delivery = quoteDeliveryFee('Ouagadougou', 'Ouagadougou')!;

describe('the quote carries its share of the package\'s ONE fee', () => {
  it('D is the share when one is given, the whole fee otherwise — and the quote still reconciles', () => {
    const seul = decideIssueQuote(deps, { request, entry, delivery });
    const part = decideIssueQuote(deps, { request, entry, delivery, packageFeeShare: 334 });
    expect(seul.ok && seul.quote.deliveryFee).toBe(delivery.fee);
    expect(part.ok && part.quote.deliveryFee).toBe(334);
    expect(part.ok && part.quote.buyerTotal).toBe(11_500 + 334);
  });

  it('a share larger than the fee it splits, or not a whole franc, is refused — never issued', () => {
    for (const share of [delivery.fee + 1, 12.5, -1]) {
      expect(decideIssueQuote(deps, { request, entry, delivery, packageFeeShare: share })).toEqual({ ok: false, reason: 'stored_amounts_incoherent' });
    }
  });
});

/* ────────────────────────── whole or not at all ─────────────────────────── */

const D = 1_000;
const [s0, s1] = splitPackageDeliveryFee(D, 2) as [number, number];
const colis = { pids: ['pv-a', 'pv-b'], packageFee: D };
const art = (q: string, pid: string, fee: number, c?: typeof colis): ColisEntry => ({ quoteId: q, orderId: `ord-${q}`, pid, deliveryFee: fee, colis: c });

describe('a package is paid whole or not at all', () => {
  it('a whole package and an article alone: one package, in its own order, and two deliveries', () => {
    const d = decideColis([art('q3', 'pv-c', D), art('q2', 'pv-b', s1, colis), art('q1', 'pv-a', s0, colis)]);
    expect(d).toEqual({ ok: true, colis: [{ pids: ['pv-a', 'pv-b'], quoteIds: ['q1', 'q2'], orderIds: ['ord-q1', 'ord-q2'] }], livraisons: 2 });
  });

  it('refuses half a package, a share that is not its own, the same product priced alone, and two packages sharing a product', () => {
    expect(decideColis([art('q1', 'pv-a', s0, colis), art('q3', 'pv-c', D)])).toEqual({ ok: false, reason: 'colis_incomplet' });
    // The leftover franc on the wrong article.
    const [u0, u1] = splitPackageDeliveryFee(1_001, 2) as [number, number];
    const impair = { pids: ['pv-a', 'pv-b'], packageFee: 1_001 };
    expect(decideColis([art('q1', 'pv-a', u1, impair), art('q2', 'pv-b', u0, impair)])).toEqual({ ok: false, reason: 'colis_incomplet' });
    expect(decideColis([art('q1', 'pv-a', u0, impair), art('q2', 'pv-b', u1, impair)]).ok).toBe(true);
    // A package's product priced alone beside it.
    expect(decideColis([art('q1', 'pv-a', s0, colis), art('q2', 'pv-b', s1, colis), art('q9', 'pv-a', D)])).toEqual({ ok: false, reason: 'colis_incomplet' });
    // Two articles of the same package claiming the same product.
    expect(decideColis([art('q1', 'pv-a', s0, colis), art('q2', 'pv-a', s1, colis)])).toEqual({ ok: false, reason: 'colis_incomplet' });
    // A whole package plus a third quote for one of its products: more
    // articles than the package holds would ride it without being counted.
    expect(decideColis([art('q1', 'pv-a', s0, colis), art('q2', 'pv-b', s1, colis), art('q3', 'pv-a', s0, colis)])).toEqual({ ok: false, reason: 'colis_incomplet' });
    // A package that disagrees with its twin about its own products.
    expect(decideColis([art('q1', 'pv-a', s0, colis), art('q2', 'pv-b', s1, { pids: ['pv-a', 'pv-b', 'pv-c'], packageFee: D })])).toEqual({ ok: false, reason: 'colis_incomplet' });
  });

  it('with no package at all, every article is its own delivery', () => {
    expect(decideColis([art('q1', 'pv-a', D), art('q2', 'pv-b', D)])).toEqual({ ok: true, colis: [], livraisons: 2 });
  });

  it('the same articles are the same package, whatever order they come in', async () => {
    expect(await colisIdFor(['q2', 'q1'])).toBe(await colisIdFor(['q1', 'q2']));
    expect(await colisIdFor(['q1', 'q2'])).toMatch(/^colis-[0-9a-f]{40}$/);
    expect(await colisIdFor(['q1', 'q3'])).not.toBe(await colisIdFor(['q1', 'q2']));
  });
});

/* ───────────────────────── the grouping client ──────────────────────────── */

function producer(answer: (req: Request) => Response | Promise<Response>) {
  const asks: Request[] = [];
  return {
    asks,
    fetcher: { fetch: async (req: Request) => { asks.push(req.clone()); return answer(req); } },
  };
}

describe('Boutik+\'s grouping, asked and believed only when it is a grouping of what was asked', () => {
  it('asks the grouping door with the credential and the asked ids, and returns the groups', async () => {
    const p = producer(() => Response.json({ groups: [['pv-a', 'pv-b'], ['pv-c']] }));
    const groups = await new BoundColisGrouping(p.fetcher, 'secret-s').grouper(['pv-a', 'pv-b', 'pv-c']);
    expect(groups).toEqual([['pv-a', 'pv-b'], ['pv-c']]);
    const ask = p.asks[0]!;
    expect(new URL(ask.url).pathname).toBe(GROUPING_ROUTE);
    expect(ask.method).toBe('POST');
    expect(ask.headers.get('Authorization')).toBe('Bearer secret-s');
    expect(await ask.json()).toEqual({ productVersionIds: ['pv-a', 'pv-b', 'pv-c'] });
  });

  it('believes nothing else: a refusal, a malformed body, a grouping of other ids, a missing id, a thrown fetch', async () => {
    const cas: (() => Response)[] = [
      () => Response.json({ error: 'unauthorized' }, { status: 401 }),
      () => Response.json({ groups: 'no' }),
      () => Response.json({ groups: [['pv-a', 'pv-x'], ['pv-c']] }),
      () => Response.json({ groups: [['pv-a', 'pv-b']] }),
      () => Response.json({ groups: [['pv-a', 'pv-b'], ['pv-c']], supplierId: 'sup-1' }),
      () => { throw new Error('down'); },
    ];
    for (const c of cas) {
      expect(await new BoundColisGrouping(producer(c).fetcher, 's').grouper(['pv-a', 'pv-b', 'pv-c'])).toBeUndefined();
    }
    expect(await new AbsentColisGrouping().grouper()).toBeUndefined();
  });
});

/* ────────────── COLIS-2 — when Boutik+ cannot be reached, the shop remembers ────────────── */

describe('COLIS-2 — the shop remembers which of its products leave together, and uses it only when Boutik+ is silent', () => {
  function memoire(): ColisMemoire & { parBoutique: Map<string, string[][]> } {
    const parBoutique = new Map<string, string[][]>();
    return {
      parBoutique,
      lire: async (b) => parBoutique.get(b) ?? [],
      retenir: async (b, g) => void parBoutique.set(b, fusionnerMemoire(parBoutique.get(b) ?? [], g)),
    };
  }
  const repond = (answer: readonly (readonly string[])[] | undefined): ColisGroupingPort & { asks: number } => {
    const port = { asks: 0, grouper: async () => { port.asks += 1; return answer; } };
    return port;
  };

  it('an answer is believed and remembered for THIS shop — only its real groups, never an article alone', async () => {
    const m = memoire();
    const g = new MemorisedColisGrouping(repond([['pv-a', 'pv-b'], ['pv-c']]), m);
    expect(await g.grouper(['pv-a', 'pv-b', 'pv-c'], 'sf-1')).toEqual([['pv-a', 'pv-b'], ['pv-c']]);
    expect(m.parBoutique.get('sf-1')).toEqual([['pv-a', 'pv-b']]);
    expect(m.parBoutique.get('sf-2')).toBeUndefined();
  });

  it('Boutik+ silent: what it once joined stays joined; what it never joined travels alone — in the order asked', async () => {
    const m = memoire();
    await new MemorisedColisGrouping(repond([['pv-a', 'pv-b'], ['pv-c']]), m).grouper(['pv-a', 'pv-b', 'pv-c'], 'sf-1');
    const panne = new MemorisedColisGrouping(repond(undefined), m);
    expect(await panne.grouper(['pv-b', 'pv-c', 'pv-a', 'pv-neuf'], 'sf-1')).toEqual([['pv-b', 'pv-a'], ['pv-c'], ['pv-neuf']]);
    // Another shop's memory is its own: nothing learned elsewhere is used.
    expect(await panne.grouper(['pv-a', 'pv-b'], 'sf-2')).toEqual([['pv-a'], ['pv-b']]);
    // With no shop named, nothing is remembered or read.
    expect(await panne.grouper(['pv-a', 'pv-b'])).toBeUndefined();
  });

  it('an answer always wins over the memory, and a memory that cannot be read changes nothing', async () => {
    const m = memoire();
    await new MemorisedColisGrouping(repond([['pv-a', 'pv-b']]), m).grouper(['pv-a', 'pv-b'], 'sf-1');
    expect(await new MemorisedColisGrouping(repond([['pv-a'], ['pv-b']]), m).grouper(['pv-a', 'pv-b'], 'sf-1')).toEqual([['pv-a'], ['pv-b']]);
    const cassee: ColisMemoire = { lire: async () => { throw new Error('down'); }, retenir: async () => { throw new Error('down'); } };
    expect(await new MemorisedColisGrouping(repond(undefined), cassee).grouper(['pv-a', 'pv-b'], 'sf-1')).toBeUndefined();
    expect(await new MemorisedColisGrouping(repond([['pv-a', 'pv-b']]), cassee).grouper(['pv-a', 'pv-b'], 'sf-1')).toEqual([['pv-a', 'pv-b']]);
  });

  it('groups that share a product are one supplier\'s, so they merge; disjoint ones stay apart', () => {
    expect(fusionnerMemoire([['pv-a', 'pv-b'], ['pv-x', 'pv-y']], [['pv-c', 'pv-b']])).toEqual([['pv-a', 'pv-b', 'pv-c'], ['pv-x', 'pv-y']]);
    expect(fusionnerMemoire([['pv-a', 'pv-b'], ['pv-x', 'pv-y']], [['pv-b', 'pv-x']])).toEqual([['pv-a', 'pv-b', 'pv-x', 'pv-y']]);
    expect(fusionnerMemoire([], [['pv-b', 'pv-a']])).toEqual([['pv-a', 'pv-b']]);
    expect(grouperDeMemoire(['pv-c', 'pv-a'], [['pv-a', 'pv-b', 'pv-c']])).toEqual([['pv-c', 'pv-a']]);
  });
});

/**
 * REMBOURSEMENT-PORTE-FERMEE (founder, 2026-09-23: « A ») — a door payment
 * closed on the provider's « took nothing » and confirmed after all pays for
 * no article: its confirmation is judged against the closed collection's own
 * record, and its refund confirmation against the refund it was asked for.
 */
describe('REMBOURSEMENT-PORTE-FERMEE — a closed door payment confirmed after all, judged to the franc', () => {
  const collectId = `grp-${'a'.repeat(40)}-porte-1`;
  const c = { collectId, correlationId: `corr-${collectId}`, providerKey: 'pk-ferme', total: 32_000 };
  const confirmation = (edit: (e: { envelope: Record<string, unknown>; payload: Record<string, unknown> }) => void = () => undefined) => {
    const mock = new MockPaymentProvider({});
    mock.initiateCharge({ orderId: collectId, paymentAttemptId: c.providerKey, amount: c.total, correlationId: c.correlationId, requestedAtIso: T, legType: 'door' });
    const event = structuredClone(mock.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1')!.event) as unknown as {
      envelope: Record<string, unknown>;
      payload: Record<string, unknown>;
    };
    edit(event);
    return event;
  };

  it('the certified provider\'s own confirmation of it is taken — its reference, its fee, the confirmation that opened it', () => {
    const e = confirmation((x) => { x.payload['fee'] = 250; });
    expect(jugerPorteFermee(e, c)).toEqual({ ok: true, commandId: e.envelope['command_id'], collectRef: e.payload['collectRef'], fee: 250 });
  });

  it('anything that is not exactly that payment is refused by name', () => {
    expect(jugerPorteFermee({ name: 'x' }, c)).toEqual({ ok: false, reason: 'not_a_platform_event' });
    expect(jugerPorteFermee(confirmation((x) => { x.envelope['correlation_id'] = 'corr-autre'; }), c)).toEqual({ ok: false, reason: 'wrong_correlation' });
    expect(jugerPorteFermee(confirmation((x) => { x.payload['payment_attempt_id'] = 'pk-autre'; }), c)).toEqual({ ok: false, reason: 'attempt_mismatch' });
    expect(jugerPorteFermee(confirmation((x) => { x.payload['order_id'] = `grp-${'a'.repeat(40)}-porte-2`; }), c)).toEqual({ ok: false, reason: 'order_mismatch' });
    expect(jugerPorteFermee(confirmation((x) => { x.payload['amount'] = c.total - 1; }), c)).toEqual({ ok: false, reason: 'amount_mismatch' });
    expect(jugerPorteFermee(confirmation((x) => { x.payload['amount'] = String(c.total); }), c)).toEqual({ ok: false, reason: 'amount_mismatch' });
    expect(jugerPorteFermee(confirmation((x) => { x.payload['status'] = 'failed'; }), c)).toEqual({ ok: false, reason: 'unfunded_leg_status' });
    expect(jugerPorteFermee(confirmation((x) => { x.payload['fee'] = '250'; }), c)).toEqual({ ok: false, reason: 'malformed_payload' });
    expect(jugerPorteFermee(confirmation((x) => { x.payload['collectRef'] = ''; }), c)).toEqual({ ok: false, reason: 'malformed_payload' });
    expect(jugerPorteFermee(confirmation((x) => { x.envelope['command_id'] = 'w'.repeat(1025); }), c)).toEqual({ ok: false, reason: 'envelope_field_too_long' });
  });

  const retour: RetourPorte = {
    collectId, orderIds: ['ord-a', 'ord-b'], correlationId: c.correlationId, total: c.total, collectRef: 'collect-pk-ferme', fee: 0,
    confirmation: 'whk-1', recueLe: T, refundKey: 'rf-ferme', etat: 'demande', essais: 1, demandeLe: T,
  };
  const remboursement = (edit: (e: { envelope: Record<string, unknown>; payload: Record<string, unknown> }) => void = () => undefined) => {
    const e = composeSandboxRefund(collectId, { refundKey: retour.refundKey, collectRef: retour.collectRef, amount: retour.total }, T) as {
      envelope: Record<string, unknown>;
      payload: Record<string, unknown>;
    };
    edit(e);
    return e;
  };

  it('its refund is confirmed only for the key asked, the whole sum, from the collection it was taken from', () => {
    expect(jugerRemboursementPorte(remboursement(), retour)).toEqual({ ok: true, commandId: `whk-sandbox-refund-${retour.refundKey}`, fee: 0 });
    expect(jugerRemboursementPorte(remboursement((x) => { x.payload['refund_key'] = 'rf-autre'; }), retour)).toEqual({ ok: false, reason: 'refund_key_unknown' });
    expect(jugerRemboursementPorte(remboursement((x) => { x.payload['amount'] = retour.total - 1; }), retour)).toEqual({ ok: false, reason: 'amount_mismatch' });
    expect(jugerRemboursementPorte(remboursement((x) => { x.payload['collectRef'] = 'collect-autre'; }), retour)).toEqual({ ok: false, reason: 'refund_leg_unknown' });
    expect(jugerRemboursementPorte(remboursement((x) => { x.payload['status'] = 'pending'; }), retour)).toEqual({ ok: false, reason: 'unconfirmed_refund_status' });
    expect(jugerRemboursementPorte(remboursement((x) => { x.envelope['correlation_id'] = 'corr-ord-a'; }), retour)).toEqual({ ok: false, reason: 'wrong_correlation' });
    expect(jugerRemboursementPorte(remboursement((x) => { x.payload['order_id'] = 'ord-a'; }), retour)).toEqual({ ok: false, reason: 'order_mismatch' });
    expect(jugerRemboursementPorte(remboursement((x) => { x.payload['fee'] = -1; }), retour)).toEqual({ ok: false, reason: 'malformed_payload' });
  });

  it('the founder hears of it only when it cannot finish by itself, on ONE row: the collection\'s first article', () => {
    expect(retourBloque([retour], 'ord-a')).toBeNull();
    expect(retourBloque([{ ...retour, etat: 'refuse' }], 'ord-a')).toEqual({ etat: 'bloque', raison: 'refus_du_prestataire' });
    expect(retourBloque([{ ...retour, alerteLe: T }], 'ord-a')).toEqual({ etat: 'bloque', raison: 'sans_confirmation' });
    expect(retourBloque([{ ...retour, etat: 'refuse' }], 'ord-b')).toBeNull();
    // Once the provider confirmed it, nothing is left to tell him.
    expect(retourBloque([{ ...retour, alerteLe: T, rembourse: { confirmation: 'whk-r', fee: 0, recuLe: T } }], 'ord-a')).toBeNull();
  });
});
