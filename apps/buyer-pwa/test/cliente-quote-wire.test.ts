import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  demoQuotePort, forgetRequestKey, httpQuotePort, looksLikeServerQuote, mintCommandId,
  requestKeyFor, villeDe,
  type QuoteIntent, type QuoteOutcome, type QuotePort, type ServerQuote,
} from '../src/cliente/quote-port';
import {
  clienteQuoteFromServer, fetchClienteQuote, prixExpire, MODES_WIRE,
} from '../src/cliente/quote-model';
import { renderC4, renderC5, renderRefus, refusVue } from '../src/cliente/screens';
import { ROBE } from '../src/cliente/seed';

/**
 * SP3.2b — THE BUYER PWA CONSUMES THE REAL QUOTE.
 *
 * Every assertion here protects one sentence of the DoD: every franc a buyer
 * sees on the real path came from the SERVER'S bytes, the client performs NO
 * money arithmetic, a refusal is named and rendered honestly, one intent means
 * one request key, and an expired price is never paid against.
 *
 * These EXECUTE the code. There is no source-grep « proof » anywhere below.
 */

const N = '\u202f'; // the one NNBSP source in this file — never a raw byte

/** The shared wire fixture, pinned in BOTH halves of this slice. The storefront
 *  service's miniflare e2e POSTs these same bytes at the real Worker. */
const FIXTURE = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', '..', '..', 'gates', 'fixtures', 'buyer-quote-request.json'), 'utf8'),
) as Record<string, string>;

const FIXTURE_INTENT: QuoteIntent = {
  slug: FIXTURE['slug']!,
  pid: FIXTURE['pid']!,
  zoneTo: FIXTURE['zoneTo']!,
  attributionResellerId: FIXTURE['attributionResellerId']!,
  paymentMode: 'FULL_PREPAY',
};

/** The §5.4 baseline as the service projects it for a buyer. */
const FULL: ServerQuote = {
  quoteId: 'quote-abc',
  paymentMode: 'FULL_PREPAY',
  productSubtotal: 11_500,
  deliveryFee: 1_000,
  buyerTotal: 12_500,
  amountPaidAtCheckout: 12_500,
  amountDueAtDelivery: 0,
  expiry: '2026-07-29T08:15:00.000Z',
};

const DOOR: ServerQuote = {
  ...FULL,
  quoteId: 'quote-door',
  paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
  amountPaidAtCheckout: 1_000,
  amountDueAtDelivery: 11_500,
};

/** Swap `globalThis.fetch` for one run — the `buyer-real-honesty` idiom. */
async function withFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const jsonRes = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

/** A `sessionStorage` that works, in a Node test. */
function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, v); },
  } as Storage;
}

/* ═══════════════ 1 · the wire — EXACTLY the fixture, no amount ════════════ */

describe('httpQuotePort — the body IS the shared fixture, key for key, value for value', () => {
  it('POSTs exactly the six allowlisted keys, in the service’s own order, and NOTHING else', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    await withFetch(
      (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return jsonRes(FULL);
      }) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example/').request(FIXTURE_INTENT, FIXTURE['requestKey']!),
    );
    expect(seen?.url).toBe('https://svc.example/checkout/quote');
    expect(seen?.init.method).toBe('POST');
    expect((seen?.init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    const sent = JSON.parse(seen!.init.body as string) as Record<string, unknown>;
    // THE FIXTURE, BYTE FOR BYTE — if either half drifts, this goes red.
    expect(sent).toEqual(FIXTURE);
    expect(Object.keys(sent)).toEqual(Object.keys(FIXTURE));
  });

  it('there is NO amount field to send — a price the buyer names is unrepresentable', async () => {
    let body = '';
    await withFetch(
      (async (_url: string, init: RequestInit) => { body = init.body as string; return jsonRes(FULL); }) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').request(FIXTURE_INTENT, FIXTURE['requestKey']!),
    );
    for (const banned of ['buyerTotal', 'productSubtotal', 'deliveryFee', 'amountPaid', 'amountDue', 'price', 'fcfa']) {
      expect(body.toLowerCase().includes(banned.toLowerCase()), `the request body names « ${banned} »`).toBe(false);
    }
  });

  it('a 2xx quote comes back as a quote; the trailing slash on the base never doubles', async () => {
    const got = await withFetch(
      (async () => jsonRes(FULL)) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example///').request(FIXTURE_INTENT, FIXTURE['requestKey']!),
    );
    expect(got).toEqual({ status: 'quote', quote: FULL });
  });
});

describe('httpQuotePort — a refusal keeps the SERVER’S name; nothing else becomes a price', () => {
  const named: Array<[string, number]> = [
    ['listing_unknown', 404],
    ['listing_not_live', 422],
    ['delivery_not_serviceable', 422],
    ['attribution_missing', 422],
    ['attribution_mismatch', 422],
    ['checkout_killed', 503],
    ['request_key_reused', 409],
    ['already_reserved', 409],
    ['quote_not_issuable', 422],
  ];
  for (const [reason, status] of named) {
    it(`${status} { error: "${reason}" } → refused « ${reason} », verbatim`, async () => {
      const got = await withFetch(
        (async () => jsonRes({ error: reason }, status)) as unknown as typeof fetch,
        () => httpQuotePort('https://svc.example').request(FIXTURE_INTENT, FIXTURE['requestKey']!),
      );
      expect(got).toEqual({ status: 'refused', reason });
    });
  }

  it('the durable layer’s `reason` key is read too', async () => {
    const got = await withFetch(
      (async () => jsonRes({ reason: 'stored_quote_unreadable' }, 422)) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').request(FIXTURE_INTENT, FIXTURE['requestKey']!),
    );
    expect(got).toEqual({ status: 'refused', reason: 'stored_quote_unreadable' });
  });

  /**
   * « NOTHING ANSWERED » AND « THE ANSWER WAS UNREADABLE » ARE NOT THE SAME
   * SENTENCE (CTO finding, SP3.2b review). Both end in « we cannot show you a
   * price », but only ONE of them may say « Pas de connexion » — telling a buyer
   * on full 4G that she is offline because a proxy returned an HTML 500 is a lie
   * on a money screen. One test per source situation, and §7b below asserts
   * WHICH SURFACE each one renders.
   */
  it('a THROWN fetch is `unreachable` — nothing answered, and only this may say « Pas de connexion »', async () => {
    const thrown = await withFetch(
      (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').request(FIXTURE_INTENT, FIXTURE['requestKey']!),
    );
    expect(thrown).toEqual({ status: 'unreachable' });
  });

  it('an UNPARSABLE body is `unreadable` — the reply ARRIVED, the network is fine', async () => {
    const unparsable = await withFetch(
      (async () => ({ ok: false, status: 500, json: async () => { throw new SyntaxError('not json'); } }) as unknown as Response) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').request(FIXTURE_INTENT, FIXTURE['requestKey']!),
    );
    expect(unparsable).toEqual({ status: 'unreadable' });
  });

  it('a NAMELESS non-2xx (a proxy error page, a bare 500) is `unreadable`, never `unreachable`', async () => {
    for (const [body, status] of [[{ oops: true }, 500], [{}, 502], [{ error: '' }, 503]] as Array<[unknown, number]>) {
      const got = await withFetch(
        (async () => jsonRes(body, status)) as unknown as typeof fetch,
        () => httpQuotePort('https://svc.example').request(FIXTURE_INTENT, FIXTURE['requestKey']!),
      );
      expect(got, `${status} ${JSON.stringify(body)}`).toEqual({ status: 'unreadable' });
    }
  });
});

/* ══════ 1b · the eight fields, built by hand — economics cannot ride ══════ */

describe('httpQuotePort — the quote is BUILT FIELD BY FIELD, never the parsed body', () => {
  it('a body carrying supplier economics yields a quote with EXACTLY the eight canon keys', async () => {
    const leaky = {
      ...FULL,
      // the exact names the `/listings*` key gate and SP-I03 exist to keep off
      // a buyer's browser — planted here as if the service one day leaked them
      sellerBasePrice: 10_000,
      sellerFundedCommission: 1_000,
      sellerNet: 9_500,
      sellerPlatformFee: 500,
      resellerGrossEarnings: 2_500,
      resellerNet: 2_000,
      platformProductFeeRevenue: 500,
      attributionResellerId: 'rs-checkout-fixture',
      policyVersions: { tariff: 'v1' },
    };
    const got = await withFetch(
      (async () => jsonRes(leaky)) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').request(FIXTURE_INTENT, FIXTURE['requestKey']!),
    );
    expect(got.status).toBe('quote');
    if (got.status !== 'quote') return;
    expect(Object.keys(got.quote).sort()).toEqual([
      'amountDueAtDelivery', 'amountPaidAtCheckout', 'buyerTotal', 'deliveryFee',
      'expiry', 'paymentMode', 'productSubtotal', 'quoteId',
    ]);
    for (const banned of [
      'sellerBasePrice', 'sellerFundedCommission', 'sellerNet', 'sellerPlatformFee',
      'resellerGrossEarnings', 'resellerNet', 'platformProductFeeRevenue',
      'attributionResellerId', 'policyVersions',
    ]) {
      expect(Object.keys(got.quote), `« ${banned} » rode into the client quote`).not.toContain(banned);
    }
    // …and the serialized object carries none of those names either
    expect(JSON.stringify(got.quote)).not.toMatch(/seller|reseller|commission|platform|policy/i);
    // the eight it DOES carry are the server's own values, unchanged
    expect(got.quote).toEqual(FULL);
  });
});

/* ═════════════ 2 · the money shape-check at the boundary ══════════════════ */

describe('httpQuotePort — the MONEY SHAPE-CHECK: a partial quote never reaches a screen', () => {
  const broken: Array<[string, Record<string, unknown>]> = [
    ['a MISSING amount', { ...FULL, buyerTotal: undefined }],
    ['a NON-INTEGER franc', { ...FULL, deliveryFee: 999.5 }],
    ['a NEGATIVE amount', { ...FULL, amountDueAtDelivery: -1 }],
    ['NaN', { ...FULL, productSubtotal: Number.NaN }],
    ['Infinity', { ...FULL, buyerTotal: Number.POSITIVE_INFINITY }],
    ['a STRINGIFIED amount', { ...FULL, buyerTotal: '12500' }],
    ['an EMPTY expiry', { ...FULL, expiry: '' }],
    ['a MISSING expiry', { ...FULL, expiry: undefined }],
    ['an EMPTY quoteId', { ...FULL, quoteId: '' }],
    ['an EMPTY paymentMode', { ...FULL, paymentMode: '' }],
    ['not an object at all', { }],
  ];
  for (const [what, body] of broken) {
    it(`${what} ⇒ unreadable (the reply arrived), never a partial price`, async () => {
      expect(looksLikeServerQuote(body)).toBe(false);
      const got = await withFetch(
        (async () => jsonRes(body)) as unknown as typeof fetch,
        () => httpQuotePort('https://svc.example').request(FIXTURE_INTENT, FIXTURE['requestKey']!),
      );
      // NOT `unreachable`: a 200 whose amounts do not shape-check came over a
      // WORKING network, and the screen must not blame her connection for it.
      expect(got).toEqual({ status: 'unreadable' });
    });
  }

  it('a WHOLE quote passes — the check is not vacuously false', () => {
    expect(looksLikeServerQuote(FULL)).toBe(true);
    expect(looksLikeServerQuote({ ...FULL, amountDueAtDelivery: 0 })).toBe(true);
  });
});

/* ═══════════════════════ 3 · the reservation wire ═════════════════════════ */

describe('httpQuotePort.reserve — a hold is only a hold when the server says « reserved »', () => {
  it('POSTs { commandId, holderRef } to the quote’s own reserve route', async () => {
    let seen: { url: string; body: string } | undefined;
    const got = await withFetch(
      (async (url: string, init: RequestInit) => {
        seen = { url, body: init.body as string };
        return jsonRes({ status: 'reserved', reservationId: 'res-1', expiresAt: '2026-07-29T08:02:00.000Z', holdMs: 120_000 });
      }) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').reserve('quote-abc', 'cmd-1', 'rk-1'),
    );
    expect(seen?.url).toBe('https://svc.example/checkout/quote/quote-abc/reserve');
    expect(JSON.parse(seen!.body)).toEqual({ commandId: 'cmd-1', holderRef: 'rk-1' });
    expect(got).toEqual({ status: 'reserved', expiresAt: '2026-07-29T08:02:00.000Z' });
  });

  it('a 409 already_reserved is a NAMED refusal; a thrown fetch is unreachable', async () => {
    const held = await withFetch(
      (async () => jsonRes({ error: 'already_reserved' }, 409)) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').reserve('quote-abc', 'cmd-1', 'rk-1'),
    );
    expect(held).toEqual({ status: 'refused', reason: 'already_reserved' });

    const offline = await withFetch(
      (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').reserve('quote-abc', 'cmd-1', 'rk-1'),
    );
    expect(offline).toEqual({ status: 'unreachable' });
  });

  it('RESERVE gets the SAME distinction: an unnamed non-2xx and a stateless 200 are `unreadable`', async () => {
    const nameless = await withFetch(
      (async () => jsonRes({ oops: true }, 500)) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').reserve('quote-abc', 'cmd-1', 'rk-1'),
    );
    expect(nameless).toEqual({ status: 'unreadable' });

    const stateless = await withFetch(
      (async () => jsonRes({ reservationId: 'res-1' })) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').reserve('quote-abc', 'cmd-1', 'rk-1'),
    );
    expect(stateless).toEqual({ status: 'unreadable' });
  });

  it('a 200 that reports ANY OTHER state is NOT a hold — it is refused by that state’s name', async () => {
    const other = await withFetch(
      (async () => jsonRes({ status: 'released', reservationId: 'res-1' })) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').reserve('quote-abc', 'cmd-1', 'rk-1'),
    );
    expect(other).toEqual({ status: 'refused', reason: 'released' });
  });

  it('the commandId is drawn from the OS CSPRNG and is unique per mint', () => {
    const ids = new Set(Array.from({ length: 200 }, () => mintCommandId()));
    expect(ids.size).toBe(200);
    expect([...ids][0]).toMatch(/^cmd-[0-9a-f-]{36}$/);
  });
});

/* ══════════ 4 · the cross-check — the security spine of the slice ═════════ */

describe('clienteQuoteFromServer — CROSS-CHECK, NEVER DERIVE', () => {
  it('fills every screen figure from the SERVER’S bytes and nothing else', () => {
    const got = clienteQuoteFromServer(FULL, { status: 'quote', quote: DOOR });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.quote).toEqual({
      produitFcfa: 11_500,
      feeToday: 1_000,
      feeTomorrow: 1_000, // the SAME server fee twice — canon prices one pair, one fee
      totalToday: 12_500,
      totalTomorrow: 12_500,
    });
    expect(got.bIndisponible).toBe(false);
  });

  it('a FULL quote whose own split disagrees is REFUSED, never rendered', () => {
    expect(clienteQuoteFromServer({ ...FULL, amountPaidAtCheckout: 12_400 }, { status: 'unreachable' }))
      .toEqual({ ok: false, reason: 'amounts_disagree' });
    expect(clienteQuoteFromServer({ ...FULL, amountDueAtDelivery: 100 }, { status: 'unreachable' }))
      .toEqual({ ok: false, reason: 'amounts_disagree' });
  });

  it('a DOOR quote that contradicts the FULL one on ANY of the five checks is REFUSED', () => {
    const contradictions: Array<[string, ServerQuote]> = [
      ['a different product subtotal', { ...DOOR, productSubtotal: 11_600, amountDueAtDelivery: 11_600 }],
      ['a different delivery fee', { ...DOOR, deliveryFee: 900 }],
      ['a different buyer total', { ...DOOR, buyerTotal: 12_400 }],
      ['a checkout leg that is not the delivery fee', { ...DOOR, amountPaidAtCheckout: 1_100 }],
      ['a door leg that is not the product subtotal', { ...DOOR, amountDueAtDelivery: 11_400 }],
    ];
    for (const [what, door] of contradictions) {
      expect(clienteQuoteFromServer(FULL, { status: 'quote', quote: door }), what)
        .toEqual({ ok: false, reason: 'amounts_disagree' });
    }
  });

  it('a REFUSED or UNREACHABLE door quote is « mode B unavailable » — the bill still shows', () => {
    for (const door of [
      { status: 'refused', reason: 'pay_at_door_not_eligible' } as const,
      { status: 'unreachable' } as const,
    ]) {
      const got = clienteQuoteFromServer(FULL, door);
      expect(got.ok).toBe(true);
      if (!got.ok) return;
      expect(got.bIndisponible).toBe(true);
      expect(got.quote.totalToday).toBe(12_500);
    }
  });
});

/* ═════ 5 · THE CLIENT NEVER ADDS — it renders the server's own total ══════ */

describe('THE CLIENT PERFORMS NO MONEY ARITHMETIC — proven by a server total that is NOT the sum', () => {
  /** DELIBERATELY INCOHERENT: 11 500 + 1 000 is 12 500, and this server says
   *  13 900. A client that computed its own total would render 12 500 here.
   *  It must render 13 900 — the server's byte — because the client has no
   *  opinion about what a total is. (The service's OWN reconciliation is the
   *  money gate's job, and it is asserted against the real Worker in the
   *  storefront-service e2e, on the same shared fixture.) */
  const MENTEUR: ServerQuote = {
    ...FULL,
    buyerTotal: 13_900,
    amountPaidAtCheckout: 13_900,
  };

  it('C5 renders the SERVER’S total, not the client’s sum', () => {
    const got = clienteQuoteFromServer(MENTEUR, { status: 'unreachable' });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.quote.totalToday).toBe(13_900);

    const c5 = renderC5(ROBE, got.quote, { delivery: 'today', pay: 'A', paying: 'idle', bInel: true });
    expect(c5).toContain(`13${N}900${N}FCFA`); // the server's total, on screen
    expect(c5).not.toContain(`12${N}500${N}FCFA`); // the client's sum, nowhere
    // the bill's three lines are three server bytes
    expect(c5).toContain(`11${N}500${N}FCFA`);
    expect(c5).toContain(`1${N}000${N}FCFA`);
    // and the reconcile sentence RENDERS the same three bytes — it does not
    // re-derive the left-hand side from the right-hand one.
    expect(c5).toContain(`13${N}900 = 11${N}500 + 1${N}000 — chaque franc a sa place.`);
  });

  it('C4 renders the SERVER’S fee, not a hardcoded card', () => {
    const got = clienteQuoteFromServer({ ...FULL, deliveryFee: 1_750, buyerTotal: 13_250, amountPaidAtCheckout: 13_250 }, { status: 'unreachable' });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    const c4 = renderC4(got.quote, { zone: 'Gounghin', repereRecap: 'Face à la pharmacie', delivery: 'today', ligneUnique: true });
    expect(c4).toContain(`1${N}750${N}FCFA`);
    expect(c4).not.toContain('800'); // the retired hardcoded « demain » tariff
  });
});

/* ═══════════════ 6 · C4 — ONE fee per zone pair, one line ═════════════════ */

describe('C4 — the real path shows ONE delivery line, the harness keeps its two cards', () => {
  const SERVER_Q = { produitFcfa: 11_500, feeToday: 1_000, feeTomorrow: 1_000, totalToday: 12_500, totalTomorrow: 12_500 };
  const base = { zone: 'Gounghin', repereRecap: 'Face à la pharmacie du marché', delivery: 'today' as const };

  it('with a server quote: one « Livraison par Séra » line, no time window, CTA LIVE', () => {
    const c4 = renderC4(SERVER_Q, { ...base, ligneUnique: true });
    expect(c4).toContain('Livraison par Séra');
    expect(c4).toContain('Un livreur Séra vérifie et scelle le colis avant de partir.');
    // NO promise nobody made: no hour, no « demain », no second (identical) fee.
    expect(c4).not.toContain('Aujourd’hui, avant 19 h');
    expect(c4).not.toContain('Demain, 9 h – 12 h');
    expect(c4).not.toContain('un peu moins chère');
    expect(c4).not.toContain('data-action="choix-livraison"');
    // exactly ONE amount on the screen
    expect(c4.match(/FCFA/g) ?? []).toHaveLength(1);
    // and nothing to choose ⇒ Continuer is live on arrival
    expect(c4).toContain('data-action="continuer-c4"');
    expect(c4).not.toContain('cl-cta-off');
  });

  it('the CTA is live even with NO delivery selected — there is nothing to select', () => {
    const c4 = renderC4(SERVER_Q, { ...base, delivery: null, ligneUnique: true });
    expect(c4).not.toContain('cl-cta-off');
    expect(c4).not.toContain('disabled');
  });

  it('WITHOUT a server quote the two-card render is untouched, and its CTA still gates', () => {
    const harness = { produitFcfa: 11_500, feeToday: 1_000, feeTomorrow: 800, totalToday: 12_500, totalTomorrow: 12_300 };
    const chosen = renderC4(harness, base);
    expect(chosen).toContain('Aujourd’hui, avant 19 h');
    expect(chosen).toContain('Demain, 9 h – 12 h');
    expect(chosen).toContain(`800${N}FCFA`);
    expect(chosen).not.toContain('Livraison par Séra');
    const unchosen = renderC4(harness, { ...base, delivery: null });
    expect(unchosen).toContain('cl-cta-off');
  });
});

/* ═════════════════ 7 · the honest refusal surface (§10.5) ═════════════════ */

describe('the refusal surface — one cause, one consequence, one action, for every name', () => {
  const cases: Array<[string, string]> = [
    ['listing_unknown', 'Cet article n’est plus dans cette boutique.'],
    ['not_found', 'Cet article n’est plus dans cette boutique.'],
    ['listing_not_live', 'Cet article n’est plus en vente.'],
    ['delivery_not_serviceable', 'Séra ne livre pas encore ici.'],
    ['attribution_missing', 'Ce lien ne permet pas de commander.'],
    ['attribution_mismatch', 'Ce lien ne permet pas de commander.'],
    ['checkout_killed', 'Les commandes sont suspendues un moment.'],
    ['expired', 'Ce prix a expiré.'],
    ['already_reserved', 'Cette commande est déjà en cours.'],
    ['unreachable', 'Pas de connexion.'],
  ];
  for (const [reason, titre] of cases) {
    it(`« ${reason} » renders « ${titre} » with exactly one primary action`, () => {
      const html = renderRefus(reason);
      expect(html).toContain(titre);
      expect(html).toContain(`data-motif="${reason}"`);
      // ONE primary action: exactly one cl-cta on the screen.
      expect(html.match(/class="cl-cta /g) ?? []).toHaveLength(1);
      // the server's raw name is NEVER shown to the buyer as text
      const visible = html.replace(/<[^>]+>/g, ' ');
      expect(visible).not.toContain(reason);
      // no error wall, no blame, no administrative French
      for (const banned of ['erreur', 'Erreur', 'veuillez', 'Veuillez', 'séquestre', 'invalide', 'échec']) {
        expect(visible.includes(banned), `« ${reason} » says « ${banned} »`).toBe(false);
      }
      // NEVER a queued « done » — nothing is pending on this screen
      expect(visible).not.toContain('en attente');
      expect(visible).not.toContain('C’est noté');
    });
  }

  it('EVERY unknown name — including amounts_disagree and the stored_* family — gets the generic sentence, never the raw word', () => {
    for (const reason of ['amounts_disagree', 'quote_not_issuable', 'stored_quote_unreadable', 'stored_amounts_incoherent', 'request_key_reused', 'commission_not_frozen', '', 'wat']) {
      const html = renderRefus(reason);
      expect(html, reason).toContain('Nous ne pouvons pas afficher le prix.');
      expect(html, reason).toContain('Réessayer');
      expect(html.replace(/<[^>]+>/g, ' '), reason).not.toContain(reason === '' ? ' ' : reason);
    }
  });

  it('every refusal that follows a money moment says « Rien n’a été payé. »', () => {
    for (const reason of ['listing_unknown', 'delivery_not_serviceable', 'checkout_killed', 'expired', 'unreachable', 'amounts_disagree']) {
      expect(renderRefus(reason), reason).toContain('Rien n’a été payé.');
    }
  });

  it('the actions are the ones the buyer can actually take', () => {
    expect(refusVue('expired').action).toBe('prix-a-jour');
    expect(refusVue('expired').libelle).toBe('Voir le prix à jour');
    expect(refusVue('delivery_not_serviceable').action).toBe('retour-c3');
    expect(refusVue('listing_not_live').action).toBe('voir-boutique');
    expect(refusVue('unreachable').action).toBe('reessayer-prix');
    expect(refusVue('amounts_disagree').action).toBe('reessayer-prix');
  });

  it('no amount is ever rendered on a refusal surface — there is no price to show', () => {
    for (const [reason] of cases) {
      expect(renderRefus(reason), reason).not.toContain('FCFA');
    }
  });
});

/* ══ 7b · « Pas de connexion » is shown ONLY when there is no connection ═══ */

/**
 * THE LIE THIS REMOVES (CTO finding, SP3.2b review): four different situations
 * used to land on `unreachable`, whose card reads « HORS LIGNE · Pas de
 * connexion. » Three of them happen over a WORKING network. A buyer on full 4G
 * being told her network is down — because a proxy returned an HTML 500 — is
 * exactly the kind of untrue sentence this project does not ship.
 *
 * The mapping below is EXECUTED end to end: a stubbed fetch per situation, the
 * real port, the real `fetchClienteQuote`, the real French card.
 */
describe('the two « no price » surfaces are told apart, from the wire to the screen', () => {
  const base = { slug: 'aicha-4821', pid: 'p1', zoneTo: 'Gounghin, Ouagadougou', attributionResellerId: 'rs-1' };
  const keys = (i: QuoteIntent): string => `key-${i.paymentMode}`;

  /** The flow's own mapping, restated here so this test drives the real chain:
   *  port outcome → refusal name → rendered card. */
  const nomDuRefus = (r: { status: string; reason?: string }): string =>
    r.status === 'refused' ? r.reason! : r.status === 'unreadable' ? 'answer_unreadable' : 'unreachable';

  const situations: Array<[string, typeof fetch, 'offline' | 'generic']> = [
    ['a THROWN fetch — genuinely no network',
      (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch, 'offline'],
    ['a proxy HTML 500 (unparsable body) over a working network',
      (async () => ({ ok: false, status: 500, json: async () => { throw new SyntaxError('<html>'); } }) as unknown as Response) as unknown as typeof fetch, 'generic'],
    ['a 502 with no refusal name over a working network',
      (async () => jsonRes({ oops: true }, 502)) as unknown as typeof fetch, 'generic'],
    ['a 200 whose amounts fail the money shape-check',
      (async () => jsonRes({ ...FULL, buyerTotal: 12_500.5 })) as unknown as typeof fetch, 'generic'],
  ];

  for (const [what, impl, expected] of situations) {
    it(`${what} → the ${expected === 'offline' ? '« Pas de connexion »' : 'generic « Nous ne pouvons pas afficher le prix »'} card`, async () => {
      const outcome = await withFetch(impl, () => fetchClienteQuote(httpQuotePort('https://svc.example'), base, keys));
      expect(outcome.status).not.toBe('ready');
      const html = renderRefus(nomDuRefus(outcome as { status: string; reason?: string }));
      if (expected === 'offline') {
        expect(outcome.status).toBe('unreachable');
        expect(html).toContain('Pas de connexion.');
        expect(html).toContain('HORS LIGNE');
      } else {
        expect(outcome.status).toBe('unreadable');
        expect(html).toContain('Nous ne pouvons pas afficher le prix.');
        // THE LIE, ASSERTED ABSENT: her network is fine and the screen says so
        // by not mentioning it at all.
        expect(html, 'blamed the network for a reply that arrived').not.toContain('Pas de connexion');
        expect(html).not.toContain('HORS LIGNE');
        expect(html).not.toContain('réseau');
      }
    });
  }

  it('a NAMED server refusal is unaffected — it still speaks its own name', async () => {
    const outcome = await withFetch(
      (async () => jsonRes({ error: 'delivery_not_serviceable' }, 422)) as unknown as typeof fetch,
      () => fetchClienteQuote(httpQuotePort('https://svc.example'), base, keys),
    );
    expect(outcome).toEqual({ status: 'refused', reason: 'delivery_not_serviceable' });
    expect(renderRefus(nomDuRefus(outcome as { status: string; reason?: string }))).toContain('Séra ne livre pas encore ici.');
  });

  it('« answer_unreadable » renders the generic card and never leaks its own name', () => {
    const html = renderRefus('answer_unreadable');
    expect(html).toContain('Nous ne pouvons pas afficher le prix.');
    expect(html).toContain('Rien n’a été payé.');
    expect(html.replace(/<[^>]+>/g, ' ')).not.toContain('answer_unreadable');
    expect(refusVue('answer_unreadable').action).toBe('reessayer-prix');
  });
});

/* ═══════════════════════ 8 · the expiry gate ══════════════════════════════ */

describe('prixExpire — an expired price is never paid against, and garbage FAILS CLOSED', () => {
  const T = Date.parse('2026-07-29T08:15:00.000Z');
  it('alive one millisecond before, expired ON the instant and after', () => {
    expect(prixExpire('2026-07-29T08:15:00.000Z', T - 1)).toBe(false);
    expect(prixExpire('2026-07-29T08:15:00.000Z', T)).toBe(true);
    expect(prixExpire('2026-07-29T08:15:00.000Z', T + 1)).toBe(true);
  });
  it('an UNPARSABLE or EMPTY expiry is treated as EXPIRED — never as « go ahead »', () => {
    for (const bad of ['', 'bientôt', 'not-a-date', '2026-13-45T99:99:99Z']) {
      expect(prixExpire(bad, T), bad).toBe(true);
    }
  });
});

/* ═════════════════ 9 · one intent, one request key ════════════════════════ */

describe('requestKeyFor — same intent ⇒ same key; changed intent ⇒ a NEW key', () => {
  it('the SAME intent retried reuses the SAME key (the server then returns the same quote)', () => {
    const s = memStorage();
    const first = requestKeyFor(FIXTURE_INTENT, s);
    expect(requestKeyFor(FIXTURE_INTENT, s)).toBe(first);
    expect(requestKeyFor({ ...FIXTURE_INTENT }, s)).toBe(first);
  });

  it('a CHANGED intent NEVER reuses the key — each of the five values mints a new one', () => {
    const s = memStorage();
    const base = requestKeyFor(FIXTURE_INTENT, s);
    const changes: QuoteIntent[] = [
      { ...FIXTURE_INTENT, slug: 'binta-7412' },
      { ...FIXTURE_INTENT, pid: 'pv-other' },
      { ...FIXTURE_INTENT, zoneTo: 'Pissy, Ouagadougou' },
      { ...FIXTURE_INTENT, attributionResellerId: 'rs-someone-else' },
      { ...FIXTURE_INTENT, paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' },
    ];
    const keys = changes.map((i) => requestKeyFor(i, s));
    for (const k of keys) expect(k).not.toBe(base);
    expect(new Set([...keys, base]).size).toBe(6); // all six distinct
  });

  it('every key satisfies the service’s own requestKey shape (/^[A-Za-z0-9_-]{16,128}$/)', () => {
    const s = memStorage();
    for (const mode of MODES_WIRE) {
      expect(requestKeyFor({ ...FIXTURE_INTENT, paymentMode: mode }, s)).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    }
  });

  it('NO storage, or a storage that THROWS, degrades to a fresh uuid — never a crash', () => {
    expect(requestKeyFor(FIXTURE_INTENT)).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    const hostile = {
      getItem: () => { throw new DOMException('blocked'); },
      setItem: () => { throw new DOMException('blocked'); },
      removeItem: () => { throw new DOMException('blocked'); },
    } as unknown as Storage;
    expect(() => requestKeyFor(FIXTURE_INTENT, hostile)).not.toThrow();
    expect(requestKeyFor(FIXTURE_INTENT, hostile)).not.toBe(requestKeyFor(FIXTURE_INTENT, hostile));
    expect(() => forgetRequestKey(FIXTURE_INTENT, hostile)).not.toThrow();
  });

  it('forgetRequestKey mints a NEW key next time — « Voir le prix à jour » after an expiry', () => {
    const s = memStorage();
    const stale = requestKeyFor(FIXTURE_INTENT, s);
    forgetRequestKey(FIXTURE_INTENT, s);
    const fresh = requestKeyFor(FIXTURE_INTENT, s);
    expect(fresh).not.toBe(stale);
    expect(requestKeyFor(FIXTURE_INTENT, s)).toBe(fresh); // and it is stable again
  });
});

/* ═══════════════ 10 · the zone the buyer's browser composes ═══════════════ */

describe('villeDe — her quartier + HER SHOP’S city is what reaches the wire', () => {
  it('reduces a real shop zone to its city, both separators', () => {
    expect(villeDe('Rood Woko · Ouagadougou')).toBe('Ouagadougou');
    expect(villeDe('Gounghin, Ouagadougou')).toBe('Ouagadougou');
    expect(villeDe('Ouagadougou')).toBe('Ouagadougou');
    expect(villeDe('  Ouagadougou  ')).toBe('Ouagadougou');
  });
  it('the composed destination is exactly the shared fixture’s zoneTo', () => {
    expect(`Gounghin, ${villeDe('Rood Woko · Ouagadougou')}`).toBe(FIXTURE['zoneTo']);
  });
});

/* ═════════ 11 · fetchClienteQuote — two asks, and NO fallback ever ════════ */

/** A port whose two answers are scripted. It records what it was asked. */
function scriptedPort(answers: Record<string, QuoteOutcome>): {
  port: QuotePort; asked: Array<{ intent: QuoteIntent; key: string }>; reserved: string[];
} {
  const asked: Array<{ intent: QuoteIntent; key: string }> = [];
  const reserved: string[] = [];
  return {
    asked,
    reserved,
    port: {
      async request(intent, key) {
        asked.push({ intent, key });
        return answers[intent.paymentMode] ?? { status: 'unreachable' };
      },
      async reserve(quoteId, commandId, holderRef) {
        reserved.push(`${quoteId}|${commandId}|${holderRef}`);
        return { status: 'reserved' };
      },
    },
  };
}

describe('fetchClienteQuote — the whole real-path ask', () => {
  const base = { slug: 'aicha-4821', pid: 'p1', zoneTo: 'Gounghin, Ouagadougou', attributionResellerId: 'rs-1' };
  const keys = (i: QuoteIntent): string => `key-${i.paymentMode}`;

  it('asks BOTH modes, each under its OWN key, and answers ready with the server’s bytes', async () => {
    const { port, asked } = scriptedPort({
      FULL_PREPAY: { status: 'quote', quote: FULL },
      DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR: { status: 'quote', quote: DOOR },
    });
    const got = await fetchClienteQuote(port, base, keys);
    expect(asked.map((a) => a.intent.paymentMode)).toEqual(['FULL_PREPAY', 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR']);
    expect(asked[0]!.key).not.toBe(asked[1]!.key);
    expect(got.status).toBe('ready');
    if (got.status !== 'ready') return;
    expect(got.quote.totalToday).toBe(12_500);
    expect(got.bIndisponible).toBe(false);
    expect(got.ids.fullQuoteId).toBe('quote-abc');
    expect(got.expiry).toBe(FULL.expiry);
  });

  it('the FULL refusal passes through by NAME, and the door is never even asked', async () => {
    const { port, asked } = scriptedPort({ FULL_PREPAY: { status: 'refused', reason: 'delivery_not_serviceable' } });
    const got = await fetchClienteQuote(port, base, keys);
    expect(got).toEqual({ status: 'refused', reason: 'delivery_not_serviceable' });
    expect(asked).toHaveLength(1); // no second ask on a dead price
  });

  it('an UNREACHABLE full ask is unreachable — NEVER a composed local price', async () => {
    const { port } = scriptedPort({ FULL_PREPAY: { status: 'unreachable' } });
    const got = await fetchClienteQuote(port, base, keys);
    expect(got).toEqual({ status: 'unreachable' });
  });

  it('a REFUSED door ask still shows the bill, with mode B unavailable', async () => {
    const { port } = scriptedPort({
      FULL_PREPAY: { status: 'quote', quote: FULL },
      DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR: { status: 'refused', reason: 'pay_at_door_not_eligible' },
    });
    const got = await fetchClienteQuote(port, base, keys);
    expect(got.status).toBe('ready');
    if (got.status !== 'ready') return;
    expect(got.bIndisponible).toBe(true);
    expect(got.quote.totalToday).toBe(12_500);
  });

  it('DISAGREEING amounts refuse — we never pick one of two prices', async () => {
    const { port } = scriptedPort({
      FULL_PREPAY: { status: 'quote', quote: FULL },
      DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR: { status: 'quote', quote: { ...DOOR, deliveryFee: 900 } },
    });
    expect(await fetchClienteQuote(port, base, keys)).toEqual({ status: 'refused', reason: 'amounts_disagree' });
  });

  it('the reservation is bound to the FULL quote’s id and holds under the FULL request key', async () => {
    const { port, reserved } = scriptedPort({
      FULL_PREPAY: { status: 'quote', quote: FULL },
      DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR: { status: 'quote', quote: DOOR },
    });
    const got = await fetchClienteQuote(port, base, keys);
    if (got.status !== 'ready') throw new Error('expected ready');
    expect(await got.reserve()).toEqual({ status: 'reserved' });
    expect(reserved).toEqual([`quote-abc|${got.ids.commandId}|key-FULL_PREPAY`]);
  });

  it('an UNREADABLE full ask stays UNREADABLE — it does not become « no connection »', async () => {
    const { port } = scriptedPort({ FULL_PREPAY: { status: 'unreadable' } });
    expect(await fetchClienteQuote(port, base, keys)).toEqual({ status: 'unreadable' });
  });
});

/* ═════ 11b · ONE command id per issued quote, NOT one per tap ═════════════ */

/**
 * THE BLOCKER THIS LOCKS (CTO, SP3.2b review). The vault replays a reservation
 * idempotently ONLY when `state.reserveCommandId === cmd.command_id`
 * (`packages/commerce-core/src/reservation.ts`); a DIFFERENT id against a live
 * `reserved` state answers `already_reserved`. `renderC5`'s submitting branch
 * renders a back button, so tapping back and paying again is REACHABLE — and
 * with a per-tap mint the buyer collided with her own two-minute hold and was
 * told « Cette commande est déjà en cours. » for a hold she was the holder of.
 */
describe('the reservation command id — minted once per QUOTE, reused by every tap of Payer', () => {
  const base = { slug: 'aicha-4821', pid: 'p1', zoneTo: 'Gounghin, Ouagadougou', attributionResellerId: 'rs-1' };
  const keys = (i: QuoteIntent): string => `key-${i.paymentMode}`;
  const both = {
    FULL_PREPAY: { status: 'quote' as const, quote: FULL },
    DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR: { status: 'quote' as const, quote: DOOR },
  };

  it('RESERVING TWICE for ONE quote sends the SAME commandId on the wire both times', async () => {
    const { port, reserved } = scriptedPort(both);
    const got = await fetchClienteQuote(port, base, keys);
    if (got.status !== 'ready') throw new Error('expected ready');
    await got.reserve();
    await got.reserve(); // she tapped back out of « ENVOI SÉCURISÉ » and paid again
    await got.reserve();
    const ids = reserved.map((r) => r.split('|')[1]);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size, `three taps sent ${new Set(ids).size} different command ids`).toBe(1);
    expect(ids[0]).toBe(got.ids.commandId);
    // …and it is a real CSPRNG-minted id, not a constant
    expect(got.ids.commandId).toMatch(/^cmd-[0-9a-f-]{36}$/);
  });

  it('a NEW quote (« Voir le prix à jour », a corrected zone) mints a DIFFERENT commandId', async () => {
    const first = await fetchClienteQuote(scriptedPort(both).port, base, keys);
    const second = await fetchClienteQuote(scriptedPort(both).port, base, keys);
    const third = await fetchClienteQuote(scriptedPort(both).port, { ...base, zoneTo: 'Pissy, Ouagadougou' }, keys);
    if (first.status !== 'ready' || second.status !== 'ready' || third.status !== 'ready') throw new Error('expected ready');
    expect(new Set([first.ids.commandId, second.ids.commandId, third.ids.commandId]).size).toBe(3);
  });

  it('`reserve` takes NO argument — a per-tap mint is unrepresentable, not merely avoided', async () => {
    const got = await fetchClienteQuote(scriptedPort(both).port, base, keys);
    if (got.status !== 'ready') throw new Error('expected ready');
    expect(got.reserve).toHaveLength(0); // arity 0: nothing to pass, nothing to vary
  });
});

/* ═════════════ 12 · the harness port, and what it cannot do ═══════════════ */

describe('demoQuotePort — the certified harness port (no service reachable)', () => {
  it('quotes the article ACTUALLY ON SCREEN, and its bytes reconcile with composeQuote’s', async () => {
    const got = await demoQuotePort(20_500).request({ ...FIXTURE_INTENT }, 'k');
    expect(got.status).toBe('quote');
    if (got.status !== 'quote') return;
    expect(got.quote.productSubtotal).toBe(20_500);
    expect(got.quote.deliveryFee).toBe(1_000);
    expect(got.quote.buyerTotal).toBe(21_500);
    expect(got.quote.amountPaidAtCheckout).toBe(21_500);
    expect(got.quote.amountDueAtDelivery).toBe(0);
    expect(looksLikeServerQuote(got.quote)).toBe(true);
  });

  it('defaults to the demo article when told no price', async () => {
    const got = await demoQuotePort().request(FIXTURE_INTENT, 'k');
    if (got.status !== 'quote') throw new Error('expected a quote');
    expect(got.quote.productSubtotal).toBe(ROBE.priceFcfa);
  });

  it('its door split passes the SAME cross-check the real server’s must', async () => {
    const port = demoQuotePort(20_500);
    const full = await port.request({ ...FIXTURE_INTENT, paymentMode: 'FULL_PREPAY' }, 'k1');
    const door = await port.request({ ...FIXTURE_INTENT, paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' }, 'k2');
    if (full.status !== 'quote') throw new Error('expected a quote');
    const model = clienteQuoteFromServer(full.quote, door);
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    // CERTIFICATION GAP, ASSERTED SO IT CANNOT BE FORGOTTEN: the live service
    // refuses EVERY pay-at-door request today, so the harness is more capable
    // than production here on purpose. Mode B being offered in the demo is
    // never evidence that mode B works.
    expect(model.bIndisponible).toBe(false);
  });

  it('its expiry is shape-true and in the future, so the flow’s gate has a real instant', async () => {
    const got = await demoQuotePort().request(FIXTURE_INTENT, 'k');
    if (got.status !== 'quote') throw new Error('expected a quote');
    expect(prixExpire(got.quote.expiry, Date.now())).toBe(false);
    expect(prixExpire(got.quote.expiry, Date.now() + 16 * 60 * 1000)).toBe(true);
  });
});
