import { describe, expect, it } from 'vitest';
import { clienteQuoteFromServer } from '../src/cliente/quote-model';
import type { ServerQuote } from '../src/cliente/quote-port';
import {
  PAIEMENT, renderC5, splitFor,
  type C5State, type ClienteQuote,
} from '../src/cliente/screens';
import { composeQuote, ROBE } from '../src/cliente/seed';

/**
 * SP3.3b1 — THE §6.1 TWO-OPTION CHECKOUT SCREEN.
 *
 * Build-Spec §6.1: « Both options shown; Option A labeled « recommandé ».
 * Before choosing, buyer sees two bold lines: « À payer maintenant : X FCFA » /
 * « À payer à la livraison : Y FCFA » with total = X+Y once. » — plus the two
 * option bodies verbatim, the non-refundable-delivery warning, the one-line
 * replay before payment, and « séquestre »/"escrow" MUST NOT appear.
 *
 * Also governing: SP-I13 « Checkout MUST show exactly what is paid now vs due
 * at delivery » · Ten Laws #1 (money render-only — the client adds nothing).
 *
 * EVERY ASSERTION BELOW EXECUTES THE RENDERER. There is no source grep here:
 * the question is what the buyer's screen says, and only running it answers it.
 */

const N = '\u202f'; // the one NNBSP source in this file — never a raw byte

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

const C5: C5State = { delivery: 'today', pay: null, paying: 'idle', bInel: false };

/** The screen model the real path produces, or a thrown test failure. */
function modelFrom(full: ServerQuote, door: ServerQuote | undefined): ClienteQuote {
  const got = clienteQuoteFromServer(full, door === undefined ? { status: 'unreachable' } : { status: 'quote', quote: door });
  if (!got.ok) throw new Error(`expected a quote, got ${got.reason}`);
  return got.quote;
}

/** Visible text: tags out, SVG out — what Aïcha actually reads. */
const visible = (html: string): string => html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, '');

/* ═══ 1 · EVERY FIGURE ON C5 IS A SERVER BYTE — not one is derived here ═══ */

describe('§6.1 — the two bold lines carry the SERVER’S OWN split, never a client-derived one', () => {
  /**
   * THE PROOF THAT THE RENDERER READS THE CARRIED FIELD.
   *
   * This model is DELIBERATELY IMPOSSIBLE on the wire: `clienteQuoteFromServer`
   * refuses a full quote whose `amountPaidAtCheckout` is not its `buyerTotal`,
   * and that guard stays exactly where it is (§3 below re-proves it). What the
   * model makes possible HERE is the only question a renderer test can settle:
   * given a split that disagrees with what the old rule would have computed
   * (mode A ⇒ the total; mode B ⇒ the delivery fee), WHICH NUMBER REACHES THE
   * SCREEN? If the answer is 12 500 and 1 000, the screen is still deriving.
   */
  const CONTRARIAN: ClienteQuote = {
    produitFcfa: 11_500,
    feeToday: 1_000,
    feeTomorrow: 1_000,
    totalToday: 12_500,
    totalTomorrow: 12_500,
    splitsToday: {
      A: { paidNow: 9_999, dueAtDelivery: 777 },
      B: { paidNow: 2_222, dueAtDelivery: 8_888 },
    },
    splitsTomorrow: {
      A: { paidNow: 9_999, dueAtDelivery: 777 },
      B: { paidNow: 2_222, dueAtDelivery: 8_888 },
    },
  };

  it('mode A’s lines show the server’s paid-now and due-at-delivery, NOT the total and NOT zero', () => {
    const html = renderC5(ROBE, CONTRARIAN, C5);
    const text = visible(html);
    expect(text).toContain(`À payer maintenant : 9${N}999${N}FCFA`);
    expect(text).toContain(`À payer à la livraison : 777${N}FCFA`);
    // the numbers the OLD rule would have produced for mode A are absent from
    // its lines: 12 500 still appears (it is the server's buyerTotal, on the
    // bill) but never as « à payer maintenant ».
    expect(text).not.toContain(`À payer maintenant : 12${N}500${N}FCFA`);
    expect(text).not.toContain(`À payer à la livraison : 0${N}FCFA`);
  });

  it('mode B’s lines show the DOOR quote’s own two bytes, NOT the fee and NOT the product', () => {
    const text = visible(renderC5(ROBE, CONTRARIAN, C5));
    expect(text).toContain(`À payer maintenant : 2${N}222${N}FCFA`);
    expect(text).toContain(`À payer à la livraison : 8${N}888${N}FCFA`);
    expect(text).not.toContain(`À payer maintenant : 1${N}000${N}FCFA`);
    expect(text).not.toContain(`À payer à la livraison : 11${N}500${N}FCFA`);
  });

  it('the replay line quotes the CHOSEN mode’s server bytes, both modes', () => {
    const a = visible(renderC5(ROBE, CONTRARIAN, { ...C5, pay: 'A' }));
    expect(a).toContain(`Vous payez 9${N}999${N}FCFA maintenant`);
    const b = visible(renderC5(ROBE, CONTRARIAN, { ...C5, pay: 'B' }));
    expect(b).toContain(`Vous payez 2${N}222${N}FCFA maintenant et 8${N}888${N}FCFA à la livraison — d’accord ?`);
  });

  it('THE CLIENT NEVER ADDS: « total = X+Y » is the server’s buyerTotal, never X plus Y', () => {
    // X + Y here is 9 999 + 777 = 10 776 for mode A, and 2 222 + 8 888 = 11 110
    // for mode B. NEITHER MAY APPEAR: §6.1's « total = X+Y » says what the
    // server's numbers mean, it is not an instruction to add them, and a screen
    // that added would print one of these two.
    const html = renderC5(ROBE, CONTRARIAN, { ...C5, pay: 'A' });
    const text = visible(html);
    expect(text).not.toContain(`10${N}776`);
    expect(text).not.toContain(`11${N}110`);
    // …and the total is shown ONCE, as one total row, carrying `buyerTotal`.
    expect(html.match(/class="cl-bill-total"/g) ?? []).toHaveLength(1);
    expect(text).toContain(`Total12${N}500${N}FCFA`);
  });

  it('no §6.1 line is a second TOTAL row — the total is stated once, by the bill', () => {
    const html = renderC5(ROBE, modelFrom(FULL, DOOR), C5);
    expect(html.match(/class="cl-bill-total"/g) ?? []).toHaveLength(1);
    // four §6.1 lines (two per option), and not one of them says « Total »
    const lignes = html.match(/<div class="cl-payline"[^>]*>([^<]*)<\/div>/g) ?? [];
    expect(lignes).toHaveLength(4);
    for (const l of lignes) expect(l).not.toContain('Total');
  });

  it('on the REAL model the same lines render the real server’s bytes', () => {
    const q = modelFrom(FULL, DOOR);
    const text = visible(renderC5(ROBE, q, C5));
    expect(text).toContain(`À payer maintenant : 12${N}500${N}FCFA`); // mode A
    expect(text).toContain(`À payer à la livraison : 0${N}FCFA`);
    expect(text).toContain(`À payer maintenant : 1${N}000${N}FCFA`); // mode B
    expect(text).toContain(`À payer à la livraison : 11${N}500${N}FCFA`);
  });
});

/* ═══ 2 · THE DOOR QUOTE'S OWN BYTES ARE CARRIED, and absence is honest ═══ */

describe('the DOOR quote’s split is CARRIED, not re-derived — and absent when unpriced', () => {
  it('clienteQuoteFromServer carries each mode’s own two fields', () => {
    const q = modelFrom(FULL, DOOR);
    expect(splitFor(q, 'today', 'A')).toEqual({ paidNow: 12_500, dueAtDelivery: 0 });
    expect(splitFor(q, 'today', 'B')).toEqual({ paidNow: 1_000, dueAtDelivery: 11_500 });
    // one zone pair, one fee, one split — both leg slots carry the same answer
    expect(splitFor(q, 'tomorrow', 'B')).toEqual(splitFor(q, 'today', 'B'));
  });

  it('a door quote with DIFFERENT (still self-consistent) francs carries ITS figures', () => {
    // 12 000 + 900 = 12 900 — coherent, and none of these numbers is hardcoded
    // anywhere in this app.
    const full: ServerQuote = {
      ...FULL, productSubtotal: 12_000, deliveryFee: 900, buyerTotal: 12_900,
      amountPaidAtCheckout: 12_900, amountDueAtDelivery: 0,
    };
    const door: ServerQuote = {
      ...full, quoteId: 'quote-door-2', paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
      amountPaidAtCheckout: 900, amountDueAtDelivery: 12_000,
    };
    const text = visible(renderC5(ROBE, modelFrom(full, door), C5));
    expect(text).toContain(`À payer maintenant : 900${N}FCFA`);
    expect(text).toContain(`À payer à la livraison : 12${N}000${N}FCFA`);
    expect(text).not.toContain(`1${N}000${N}FCFA`);
    expect(text).not.toContain(`11${N}500${N}FCFA`);
  });

  it('NO DOOR QUOTE ⇒ no split, no card, NO FIGURE — the honest block speaks instead', () => {
    const q = modelFrom(FULL, undefined);
    expect(splitFor(q, 'today', 'B')).toBeUndefined();
    const html = renderC5(ROBE, q, { ...C5, bInel: true });
    const text = visible(html);
    expect(text).toContain('Pas disponible pour cette commande.');
    expect(html).toContain('data-role="pay-inel"');
    // ONE pair of §6.1 lines on the screen — mode A's. Mode B prints nothing:
    // not a zero, not a dash, not the fee « it would have been ».
    expect(html.match(/data-role="payline-maintenant"/g) ?? []).toHaveLength(1);
    expect(html.match(/data-role="payline-livraison"/g) ?? []).toHaveLength(1);
    expect(text).not.toContain('À payer à la livraison : 11');
    expect(text).not.toContain('À payer maintenant : 1' + N);
    // and no B card to tap
    expect(html).not.toContain('data-mode="B"');
  });

  it('an ABSENT split alone hides mode B, even if the flow forgot to set bInel', () => {
    // Fail-closed: two independent signals, either one decides. A model with no
    // door price can never render a mode-B figure, whatever the state says.
    const html = renderC5(ROBE, modelFrom(FULL, undefined), { ...C5, bInel: false });
    expect(html).toContain('data-role="pay-inel"');
    expect(html).not.toContain('data-mode="B"');
    expect(visible(html)).toContain('Pas disponible pour cette commande.');
  });

  it('the replay line is silent for a mode the server did not price', () => {
    // Unreachable through the UI (there is no B button to tap), and still safe.
    const html = renderC5(ROBE, modelFrom(FULL, undefined), { ...C5, pay: 'B' });
    expect(html).not.toContain('data-role="redite"');
    expect(visible(html)).not.toContain('Vous payez');
  });
});

/* ═══════ 3 · THE CROSS-CHECKS ARE UNCHANGED — carrying relaxed nothing ═══ */

describe('carrying the door split relaxed NOTHING — every contradiction still refuses', () => {
  it('a door quote that disagrees on ANY of the five checks is still refused', () => {
    for (const [what, door] of [
      ['a different product subtotal', { ...DOOR, productSubtotal: 11_600, amountDueAtDelivery: 11_600 }],
      ['a different delivery fee', { ...DOOR, deliveryFee: 900 }],
      ['a different buyer total', { ...DOOR, buyerTotal: 12_400 }],
      ['a checkout leg that is not the delivery fee', { ...DOOR, amountPaidAtCheckout: 1_100 }],
      ['a door leg that is not the product subtotal', { ...DOOR, amountDueAtDelivery: 11_400 }],
    ] as Array<[string, ServerQuote]>) {
      expect(clienteQuoteFromServer(FULL, { status: 'quote', quote: door }), what)
        .toEqual({ ok: false, reason: 'amounts_disagree' });
    }
  });

  it('a FULL quote whose own split disagrees is still refused — no split reaches a screen', () => {
    expect(clienteQuoteFromServer({ ...FULL, amountPaidAtCheckout: 12_400 }, { status: 'unreachable' }))
      .toEqual({ ok: false, reason: 'amounts_disagree' });
    expect(clienteQuoteFromServer({ ...FULL, amountDueAtDelivery: 100 }, { status: 'unreachable' }))
      .toEqual({ ok: false, reason: 'amounts_disagree' });
  });

  it('a bill that does not reconcile to the franc is still refused', () => {
    expect(clienteQuoteFromServer({ ...FULL, buyerTotal: 13_900, amountPaidAtCheckout: 13_900 }, { status: 'unreachable' }))
      .toEqual({ ok: false, reason: 'amounts_disagree' });
  });

  it('a door quote answering the WRONG MODE is still refused', () => {
    expect(clienteQuoteFromServer(FULL, { status: 'quote', quote: { ...DOOR, paymentMode: 'FULL_PREPAY' } }))
      .toEqual({ ok: false, reason: 'mode_mismatch' });
  });
});

/* ════════════════ 4 · THE §6.1 COPY, ASSERTED VERBATIM ═══════════════════ */

describe('§6.1’s copy, on the screen, word for word', () => {
  const q = modelFrom(FULL, DOOR);
  const text = visible(renderC5(ROBE, q, C5));

  it('Option A is labelled « Tout payer maintenant — recommandé »', () => {
    expect(text).toContain('Tout payer maintenant — recommandé');
    expect(PAIEMENT.titreA).toBe('Tout payer maintenant — recommandé');
  });

  it('Option A’s body is §6.1’s sentence, verbatim', () => {
    expect(text).toContain(
      'Votre paiement est protégé auprès de notre partenaire de paiement jusqu’à la confirmation de votre livraison. Le vendeur n’est payé qu’après validation.',
    );
  });

  it('Option B is labelled « Payer le produit à la livraison »', () => {
    expect(text).toContain('Payer le produit à la livraison');
  });

  it('Option B’s body is §6.1’s sentence with {D} filled from the server’s deliveryFee', () => {
    expect(text).toContain(
      `Payez seulement les frais de livraison (1${N}000${N}FCFA) maintenant. À l’arrivée du livreur, vérifiez votre article, puis payez le montant du produit de manière sécurisée avant de le recevoir.`,
    );
    // {D} is the SERVER's fee, not a constant: a different fee renders itself.
    const autre = visible(renderC5(ROBE, modelFrom(
      { ...FULL, deliveryFee: 1_750, buyerTotal: 13_250, amountPaidAtCheckout: 13_250 },
      { ...DOOR, deliveryFee: 1_750, buyerTotal: 13_250, amountPaidAtCheckout: 1_750 },
    ), C5));
    expect(autre).toContain(`les frais de livraison (1${N}750${N}FCFA) maintenant`);
  });

  it('§6.1’s emphasis « avant de le recevoir » is rendered as emphasis, not lost', () => {
    expect(renderC5(ROBE, q, C5)).toContain('<b>avant de le recevoir</b>');
  });

  it('the non-refundable-delivery warning is present, verbatim', () => {
    expect(text).toContain('Frais de livraison non remboursables si vous annulez ou êtes absent(e).');
    expect(renderC5(ROBE, q, C5)).toContain('data-role="frais-non-remboursables"');
  });

  it('the warning belongs to Option B and disappears with it', () => {
    const sansB = visible(renderC5(ROBE, modelFrom(FULL, undefined), { ...C5, bInel: true }));
    expect(sansB).not.toContain('Frais de livraison non remboursables');
  });

  it('the replay line is §6.1’s, and appears only AFTER she has chosen', () => {
    expect(renderC5(ROBE, q, C5)).not.toContain('data-role="redite"');
    expect(visible(renderC5(ROBE, q, { ...C5, pay: 'B' })))
      .toContain(`Vous payez 1${N}000${N}FCFA maintenant et 11${N}500${N}FCFA à la livraison — d’accord ?`);
  });

  it('mode A’s replay says what is TRUE for mode A — « rien », never « 0 FCFA à la livraison »', () => {
    const a = visible(renderC5(ROBE, q, { ...C5, pay: 'A' }));
    expect(a).toContain(`Vous payez 12${N}500${N}FCFA maintenant, et rien à la livraison — d’accord ?`);
    expect(a).not.toContain(`et 0${N}FCFA à la livraison`);
  });

  it('the replay is gone once the payment has left — it is a question, not a caption', () => {
    for (const paying of ['submitting', 'provider'] as const) {
      expect(renderC5(ROBE, q, { ...C5, pay: 'A', paying })).not.toContain('data-role="redite"');
    }
  });

  it('BOTH options are shown, each with its own icon (§6.1: lock/scooter)', () => {
    const html = renderC5(ROBE, q, C5);
    expect(html).toContain('data-mode="A"');
    expect(html).toContain('data-mode="B"');
    expect(html.match(/class="cl-payopt-ic"/g) ?? []).toHaveLength(2);
  });
});

/* ═════════ 5 · « séquestre » / « escrow » — nowhere, in any state ════════ */

describe('§6.1: the custody-of-funds words appear on NO buyer surface, in NO state', () => {
  const banned = /s[eé]questres?|escrows?/i;
  const q = modelFrom(FULL, DOOR);
  const states: Array<[string, C5State]> = [
    ['choix, both options', C5],
    ['choix, mode A', { ...C5, pay: 'A' }],
    ['choix, mode B', { ...C5, pay: 'B' }],
    ['choix, B unavailable', { ...C5, bInel: true }],
    ['envoi', { ...C5, pay: 'A', paying: 'submitting' }],
    ['opérateur', { ...C5, pay: 'B', paying: 'provider' }],
  ];
  for (const [name, s] of states) {
    it(`${name}: neither word, in markup or in text`, () => {
      const html = renderC5(ROBE, s.bInel ? modelFrom(FULL, undefined) : q, s);
      // the MARKUP, not just the text: a class name or a data attribute ships.
      expect(banned.test(html), `${name} carries a forbidden word`).toBe(false);
    });
  }

  it('every §6.1 string in the catalog is clean too', () => {
    for (const [field, copy] of Object.entries(PAIEMENT)) {
      expect(banned.test(copy), `PAIEMENT.${field}`).toBe(false);
    }
  });
});

/* ═══════════════ 6 · the harness path renders §6.1 too ═══════════════════ */

describe('the ?demo-cliente= harness renders the same §6.1 screen, per delivery leg', () => {
  it('the mock service composes a split per leg, and C5 renders the leg she chose', () => {
    const q = composeQuote(ROBE.priceFcfa);
    const today = visible(renderC5(ROBE, q, C5));
    expect(today).toContain(`À payer maintenant : 12${N}500${N}FCFA`);
    expect(today).toContain(`À payer maintenant : 1${N}000${N}FCFA`);
    const tomorrow = visible(renderC5(ROBE, q, { ...C5, delivery: 'tomorrow' }));
    // the 800-franc leg: mode A pays 12 300 now, mode B pays 800 now.
    expect(tomorrow).toContain(`À payer maintenant : 12${N}300${N}FCFA`);
    expect(tomorrow).toContain(`À payer maintenant : 800${N}FCFA`);
    expect(tomorrow).toContain(`les frais de livraison (800${N}FCFA) maintenant`);
  });

  it('the §6.1 lines and the CTA never disagree about what is paid now', () => {
    const q = composeQuote(ROBE.priceFcfa);
    for (const delivery of ['today', 'tomorrow'] as const) {
      for (const pay of ['A', 'B'] as const) {
        const text = visible(renderC5(ROBE, q, { ...C5, delivery, pay }));
        const split = splitFor(q, delivery, pay);
        expect(split, `${delivery}/${pay}`).toBeDefined();
        const now = split!.paidNow;
        const grouped = now >= 1000 ? `${Math.floor(now / 1000)}${N}${String(now % 1000).padStart(3, '0')}` : String(now);
        expect(text, `${delivery}/${pay} lines`).toContain(`À payer maintenant : ${grouped}${N}FCFA`);
        expect(text, `${delivery}/${pay} CTA`).toContain(`Payer ${grouped}${N}FCFA`);
      }
    }
  });
});
