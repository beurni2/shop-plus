import { describe, expect, it } from 'vitest';
import { clienteQuoteFromServer } from '../src/cliente/quote-model';
import type { ServerQuote } from '../src/cliente/quote-port';
import {
  CONFIRMATION, MESSAGES, PAIEMENT, renderC5, renderC6, splitFor,
  type C5State, type ClienteProduit, type ClienteQuote,
} from '../src/cliente/screens';
import { etatDeC6, SUIVI_PAIEMENT_MS } from '../src/cliente/flow';
import { ORDER_STATUSES } from '@platform/contracts';
import { composeQuote, harnessFrancs, ROBE } from '../src/cliente/seed';

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

/** The CTA's own label. Asked of the button, not of the page: « Payer le
 *  produit à la livraison » is §6.1's OPTION NAME and appears on the card and
 *  on the unavailable block, so a page-wide search for « Payer » proves
 *  nothing about what the button offers to do. */
const ctaText = (html: string): string =>
  /<button class="cl-cta cl-cta-c5[^>]*>([\s\S]*?)<\/button>/.exec(html)?.[1] ?? '';

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

  /**
   * BOTH MODES, WHOLE SENTENCE (round 4, founder review). Mode A used to assert
   * the PREFIX only — « Vous payez 9 999 FCFA maintenant » — while its mode-B
   * twin asserted the whole line. That left mode A's Y leg unprotected: writing
   * `Y: s.pay === 'A' ? 0 : chosen.dueAtDelivery` passed the entire suite,
   * because the only full-sentence mode-A assertion runs where Y is genuinely
   * 0. No live consequence (the model refuses a FULL_PREPAY quote whose
   * `amountDueAtDelivery` is not 0), and it was still the one asymmetric
   * assertion in an exact-byte file.
   */
  it('the replay line quotes the CHOSEN mode’s server bytes, both modes, whole sentence', () => {
    const a = visible(renderC5(ROBE, CONTRARIAN, { ...C5, pay: 'A' }));
    expect(a).toContain(`Vous payez 9${N}999${N}FCFA maintenant et 777${N}FCFA à la livraison — d’accord ?`);
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

  /**
   * NAMED FOR WHAT IT CAN ACTUALLY SEE (corrected after a fresh verifier).
   *
   * It moves the WHOLE basket, so the door quote's fields and a re-derivation
   * from the full quote produce the same francs — `agrees` forces that, and no
   * input exists on which they differ. This test therefore proves the screen
   * follows the SERVER'S numbers rather than any constant of its own; it CANNOT
   * prove provenance, and the header of `quote-model.ts` now says so in terms
   * rather than implying a difference nothing can observe.
   */
  it('a basket with different francs renders THE SERVER’S, never a figure of this app’s', () => {
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

/* ══ 2b · ONE AVAILABILITY DECISION — the card, the replay and the CTA agree ══ */

/**
 * THE DEFECT THIS LOCKS (fresh verifier, round 2). The card consulted two
 * signals, the replay consulted one, and the CTA consulted neither. The
 * combination the old tests never covered — `bInel: true` with a door split
 * STILL PRESENT — put « Pas disponible pour cette commande » on the same screen
 * as « Vous payez … à la livraison — d'accord ? », under a live Payer button.
 *
 * Every case below asks all three parts of the screen the same question and
 * requires the same answer. Reachable or not, a screen may not contradict
 * itself about whether an option can be paid.
 */
describe('mode B is off ⇒ NO card, NO replay, NO payable CTA — whichever signal says so', () => {
  /** The door quote is present and priced; only the flow's flag says no. */
  const bothPriced = modelFrom(FULL, DOOR);
  /** The server never priced mode B; the flag says nothing. */
  const onlyFull = modelFrom(FULL, undefined);

  const cases: Array<[string, ClienteQuote, C5State]> = [
    ['the FLAG alone, mode B chosen', bothPriced, { ...C5, bInel: true, pay: 'B' }],
    ['the FLAG alone, nothing chosen', bothPriced, { ...C5, bInel: true }],
    ['the ABSENT SPLIT alone, mode B chosen', onlyFull, { ...C5, bInel: false, pay: 'B' }],
    ['BOTH signals, mode B chosen', onlyFull, { ...C5, bInel: true, pay: 'B' }],
  ];

  for (const [name, q, s] of cases) {
    it(`${name}: the screen says the same thing three times`, () => {
      const html = renderC5(ROBE, q, s);
      const text = visible(html);
      // 1 · THE CARD — the honest block, never a tappable B option.
      expect(html, 'a mode-B card was offered').not.toContain('data-mode="B"');
      expect(html).toContain('data-role="pay-inel"');
      expect(text).toContain('Pas disponible pour cette commande.');
      // 2 · THE REPLAY — no sentence promising a door payment.
      expect(html, 'the replay line promised a mode nobody can pay').not.toContain('data-role="redite"');
      expect(text).not.toContain('à la livraison — d’accord');
      // 3 · THE CTA — disabled, and carrying NO figure.
      expect(html).toContain('cl-cta-off');
      expect(html).toContain('disabled');
      expect(ctaText(html), 'the CTA offered to pay an unavailable mode').toBe('Choisissez pour continuer');
      expect(ctaText(html)).not.toContain('FCFA');
      // …and mode B's figures are nowhere on the screen at all
      expect(text).not.toContain('À payer maintenant : 1' + N + '000');
      expect(text).not.toContain('À payer à la livraison : 11' + N + '500');
    });
  }

  it('mode A is untouched by mode B being off — she can still pay the whole thing', () => {
    const html = renderC5(ROBE, onlyFull, { ...C5, bInel: true, pay: 'A' });
    const text = visible(html);
    expect(html).toContain('data-mode="A"');
    expect(html).not.toContain('cl-cta-off');
    expect(html).not.toContain('disabled');
    expect(text).toContain(`Payer 12${N}500${N}FCFA`);
    expect(html).toContain('data-role="redite"');
  });
});

/* ═════ 2c · THE CTA AND THE OPERATOR SCREENS READ THE CARRIED SPLIT ═══════ */

/**
 * The §6.1 lines were re-pointed at the server's split in round 1; the CTA and
 * the two `paying` screens were left on `payezMaintenant` — « A pays the total,
 * B pays the fee » — so on divergent bytes the same screen quoted two different
 * amounts for one tap. Driven here with a split that disagrees with that rule,
 * every figure must be the split's.
 */
describe('the CTA and the operator screens quote the SAME server byte as the lines', () => {
  const DIVERGENT: ClienteQuote = {
    produitFcfa: 11_500,
    feeToday: 1_000,
    feeTomorrow: 1_000,
    totalToday: 12_500,
    totalTomorrow: 12_500,
    splitsToday: { A: { paidNow: 9_999, dueAtDelivery: 777 }, B: { paidNow: 2_222, dueAtDelivery: 8_888 } },
    splitsTomorrow: { A: { paidNow: 9_999, dueAtDelivery: 777 }, B: { paidNow: 2_222, dueAtDelivery: 8_888 } },
  };

  for (const [mode, paidNow, suffix] of [['A', `9${N}999`, ''], ['B', `2${N}222`, ' maintenant']] as const) {
    it(`mode ${mode}: the CTA reads the split (${paidNow}), never the total or the fee`, () => {
      const html = renderC5(ROBE, DIVERGENT, { ...C5, pay: mode });
      expect(ctaText(html)).toBe(`Payer ${paidNow}${N}FCFA${suffix}`);
      // the two figures the old rule would have produced, asked of the button
      expect(ctaText(html), 'the CTA still applied « A pays the total »').not.toContain(`12${N}500`);
      expect(ctaText(html), 'the CTA still applied « B pays the fee »').not.toContain(`1${N}000`);
      // and it agrees with the §6.1 line right above it
      expect(visible(html)).toContain(`À payer maintenant : ${paidNow}${N}FCFA`);
    });

    it(`mode ${mode}: « ENVOI SÉCURISÉ » and the operator screen quote the same byte`, () => {
      for (const paying of ['submitting', 'provider'] as const) {
        const text = visible(renderC5(ROBE, DIVERGENT, { ...C5, pay: mode, paying }));
        expect(text, `${paying} quoted a figure the CTA never showed`).toContain(`${paidNow}${N}FCFA`);
        expect(text).not.toContain(`12${N}500${N}FCFA`);
        expect(text).not.toContain(`1${N}000${N}FCFA`);
      }
    });
  }

  it('with nothing payable the CTA carries no amount at all — not a fallback figure', () => {
    for (const s of [
      { ...C5, pay: null },
      { ...C5, pay: 'B' as const, bInel: true },
    ]) {
      const html = renderC5(ROBE, DIVERGENT, s);
      expect(ctaText(html)).toBe('Choisissez pour continuer');
      expect(ctaText(html)).not.toContain('FCFA');
    }
  });
});

/* ═════ 2d · SP3.3b2 — C6 QUOTES THE SAME BYTE, AND NEVER INVENTS ONE ═════ */

/**
 * SP3.3b1 re-pointed C5 and left C6 on `payezMaintenant` — the client's own
 * rule that « A pays the total, B pays the fee ». On the harness quote the two
 * agreed to the franc, so nothing looked wrong; that agreement is precisely
 * why a same-quote test could never have caught the divergence. Driven here
 * with a split that DISAGREES with the old rule, so only the server's byte can
 * pass.
 *
 * And the second half, which is the one that was actually broken in the flow:
 * `flow.ts` passed `state.pay ?? 'B'`, so a C6 mount with no chosen mode
 * INVENTED mode B and stated its fee as a confirmed payment. No amount is the
 * only honest answer there.
 */
describe('SP3.3b2 — the confirmation quotes the server\'s split, or no figure at all', () => {
  const DIVERGENT_Q: ClienteQuote = {
    produitFcfa: 11_500,
    feeToday: 1_000, feeTomorrow: 1_000,
    totalToday: 12_500, totalTomorrow: 12_500,
    splitsToday: { A: { paidNow: 9_999, dueAtDelivery: 777 }, B: { paidNow: 2_222, dueAtDelivery: 8_888 } },
    splitsTomorrow: { A: { paidNow: 9_999, dueAtDelivery: 777 }, B: { paidNow: 2_222, dueAtDelivery: 8_888 } },
  };

  for (const [mode, paidNow] of [['A', `9${N}999`], ['B', `2${N}222`]] as const) {
    it(`mode ${mode}: the confirmed payment is the split (${paidNow}), never the total or the fee`, () => {
      const text = visible(renderC6(ROBE, {
        confirmState: 'confirmed',
        paid: splitFor(DIVERGENT_Q, 'today', mode),
      }));
      expect(text).toContain(`Paiement de ${paidNow}${N}FCFA confirmé par l’opérateur.`);
      // the two figures the OLD client rule would have produced
      expect(text, 'C6 still applied « A pays the total »').not.toContain(`12${N}500`);
      expect(text, 'C6 still applied « B pays the fee »').not.toContain(`1${N}000`);
    });
  }

  it('NO SPLIT ⇒ the sentence keeps its meaning and loses its amount — never a fallback figure', () => {
    const text = visible(renderC6(ROBE, { confirmState: 'confirmed', paid: undefined }));
    expect(text).toContain('Paiement confirmé par l’opérateur.');
    // nothing that could be read as an amount the operator confirmed
    expect(text, 'a figure appeared with no server byte behind it').not.toContain('FCFA');
    // and the screen is still the confirmation, not a refusal or a blank
    expect(text).toContain('Commande enregistrée.');
  });

  it('the pending and offline states never carry an amount, split or not', () => {
    // Neither state asserts a confirmed payment, so neither may show a figure —
    // this is what stops a future edit from « helpfully » filling them in.
    for (const confirmState of ['pending', 'offline'] as const) {
      for (const paid of [splitFor(DIVERGENT_Q, 'today', 'A'), undefined]) {
        expect(visible(renderC6(ROBE, { confirmState, paid }))).not.toContain('FCFA');
      }
    }
  });
});

/* ═══ 2bis · SP3.3c — C6 STOPS BEING A CLOCK AND STARTS BEING THE ORDER ═══ */

describe('SP3.3c — etatDeC6: only the server can say « confirmé »', () => {
  /**
   * THE CANON ORDER STATUSES — IMPORTED, not re-typed (verifier NOTE 9).
   *
   * The first version of this test declared them as a local literal while its
   * own comment claimed it « fails LOUDLY the day the canon grows a state ». It
   * could not: a canon that grew a ninth status would have left this list at
   * eight and the suite green. Reading `ORDER_STATUSES` from the pinned package
   * is what makes the claim true.
   */
  const CANON: readonly string[] = ORDER_STATUSES;

  it('« confirmed » is the ONLY status that prints a confirmation', () => {
    const confirming = CANON.filter((s) => etatDeC6(s) === 'confirmed');
    expect(confirming).toEqual(['confirmed']);
  });

  it('« paid » does NOT confirm — an order observed at `paid` is one confirmation REFUSED', () => {
    // The webhook path advances to `paid` and confirms in the same request, so a
    // `paid` an HTTP read can actually SEE is an order whose `confirmOrder`
    // answered `no_funded_checkout_leg`. Reading it as « confirmé » would print
    // the confirmation for exactly the orders the vault refused to fund.
    expect(etatDeC6('paid')).toBe('attente');
  });

  it('`payment_failed` is the ONLY failure — there is no generic failed terminal', () => {
    expect(CANON.filter((s) => etatDeC6(s) === 'echec')).toEqual(['payment_failed']);
  });

  it('an UNKNOWN status fails closed onto the waiting screen, never onto a confirmation', () => {
    for (const unknown of ['', 'settled', 'complete', 'PAID', 'confirmed_at_door', 'ok', 'succeeded']) {
      expect(etatDeC6(unknown), `« ${unknown} » was allowed to mean something`).toBe('attente');
    }
  });
});

describe('SP3.3c — the two new C6 states say what is true and no more', () => {
  const Q: ClienteQuote = {
    produitFcfa: 11_500,
    feeToday: 1_000, feeTomorrow: 1_000,
    totalToday: 12_500, totalTomorrow: 12_500,
    splitsToday: { A: { paidNow: 12_500, dueAtDelivery: 0 }, B: { paidNow: 1_000, dueAtDelivery: 11_500 } },
    splitsTomorrow: { A: { paidNow: 12_500, dueAtDelivery: 0 }, B: { paidNow: 1_000, dueAtDelivery: 11_500 } },
  };

  it('NEITHER new state ever carries an amount — no payment, therefore no figure', () => {
    // The split is HANDED to the renderer in every combination, exactly as the
    // confirmed state gets it. Only `confirmed` may spend it.
    for (const confirmState of ['attente', 'echec'] as const) {
      for (const paid of [splitFor(Q, 'today', 'A'), splitFor(Q, 'today', 'B'), undefined]) {
        const text = visible(renderC6(ROBE, { confirmState, paid }));
        expect(text, `${confirmState} printed FCFA`).not.toContain('FCFA');
        expect(text, `${confirmState} printed a bare figure`).not.toMatch(/\d/);
      }
    }
  });

  it('« attente » never says the sentence that belongs to a queued request', () => {
    const text = visible(renderC6(ROBE, { confirmState: 'attente', paid: undefined }));
    expect(text).toContain(CONFIRMATION.attenteTitre);
    expect(text).toContain(CONFIRMATION.attenteCorps);
    // THE LIE THIS STATE EXISTS TO REMOVE: her request LANDED — the service holds
    // her order — so nothing here may blame her network or her phone.
    expect(text, 'the waiting screen blamed her network').not.toContain('réseau');
    expect(text, 'the waiting screen said the order sat on her phone').not.toContain('téléphone');
    // …and it must not claim a confirmation either.
    expect(text).not.toContain('confirmé par l’opérateur');
  });

  it('« pending » still DOES say it — the queued state kept its own true sentence', () => {
    const text = visible(renderC6(ROBE, { confirmState: 'pending', paid: undefined }));
    expect(text).toContain('réseau');
    expect(text).toContain('téléphone');
  });

  it('« echec » offers the retry and NOT the tracking CTA — one primary action', () => {
    const html = renderC6(ROBE, { confirmState: 'echec', paid: undefined });
    expect(html).toContain('data-action="reessayer-paiement"');
    expect(visible(html)).toContain(CONFIRMATION.echecAction);
    expect(html, 'a failed payment offered a delivery timeline').not.toContain('data-action="suivre"');
  });

  it('« echec » does NOT promise that nothing was debited', () => {
    // `payment_failed` is reached by the ordinary provider refusal AND by the
    // amount-divergence fault, where the provider may already have collected.
    // « Rien n’a été confirmé » is true on both; « rien n’a été prélevé » is not.
    const text = visible(renderC6(ROBE, { confirmState: 'echec', paid: undefined }));
    expect(text).toContain('Rien n’a été confirmé.');
    expect(text).not.toContain('prélev');
    expect(text).not.toContain('débit');
    expect(text).not.toContain('remboursé');
  });

  it('« Vérifier à nouveau » appears ONLY once the automatic checks have stopped', () => {
    const running = renderC6(ROBE, { confirmState: 'attente', paid: undefined, relance: false });
    expect(running, 'a manual check was offered while one was already running').not.toContain('data-action="verifier-paiement"');
    const stopped = renderC6(ROBE, { confirmState: 'attente', paid: undefined, relance: true });
    expect(stopped).toContain('data-action="verifier-paiement"');
    expect(visible(stopped)).toContain(CONFIRMATION.attenteAction);
    // …and it is never offered on a state where there is nothing left to learn.
    for (const confirmState of ['confirmed', 'echec'] as const) {
      expect(renderC6(ROBE, { confirmState, paid: undefined, relance: true })).not.toContain('data-action="verifier-paiement"');
    }
  });

  it('the schedule stops — it is bounded, and it is not a deadline on the payment', () => {
    expect(SUIVI_PAIEMENT_MS.length).toBeGreaterThan(0);
    expect(SUIVI_PAIEMENT_MS.length).toBeLessThanOrEqual(8);
    // strictly increasing: quick while an answer may still be seconds away,
    // slower once it plainly is not — her data and her battery are the budget.
    for (let i = 1; i < SUIVI_PAIEMENT_MS.length; i += 1) {
      expect(SUIVI_PAIEMENT_MS[i]!).toBeGreaterThan(SUIVI_PAIEMENT_MS[i - 1]!);
    }
    const total = SUIVI_PAIEMENT_MS.reduce((a, b) => a + b, 0);
    expect(total, 'the client polls for over a minute on a metered connection').toBeLessThanOrEqual(60_000);
    /**
     * AND THE FLOOR (verifier ITEM 6). Every assertion above survived mutating
     * the schedule to [1,2,3,4,5,6] — 21 milliseconds, seven requests fired at
     * a Ouaga 2G link inside a single blink. « Bounded » was pinned; « not a
     * burst » was not, and the burst is the half that costs her data.
     */
    expect(SUIVI_PAIEMENT_MS[0], 'the first read fires before the request could land').toBeGreaterThanOrEqual(1_000);
    expect(total, 'the whole schedule is over before a slow webhook could arrive').toBeGreaterThanOrEqual(20_000);
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

  /**
   * CHANGED UNDER A FOUNDER RULING (2026-07-30), and the change is the point.
   *
   * This assertion used to require « … maintenant, et rien à la livraison » and
   * to forbid « et 0 FCFA à la livraison » — while the test at « Option A shows
   * both §6.1 lines » required the CARD to print « À payer à la livraison :
   * 0 FCFA ». Two exact-byte assertions, on one screen, locking OPPOSITE
   * conventions. The founder ruled for §6.1's single normative sentence in both
   * modes; the two assertions now agree, and both stay exact-byte — nothing was
   * softened into a loose match to make them meet.
   */
  it('mode A’s replay is §6.1’s sentence too — the server’s 0 is shown, not paraphrased', () => {
    const a = visible(renderC5(ROBE, q, { ...C5, pay: 'A' }));
    expect(a).toContain(`Vous payez 12${N}500${N}FCFA maintenant et 0${N}FCFA à la livraison — d’accord ?`);
    // the interpretation this replaces may not creep back
    expect(a).not.toContain('rien à la livraison');
  });

  it('ONE normative sentence: the two replay fields are byte-identical', () => {
    // The founder ruling's structural half. They are separate fields so both
    // are extracted and linted by name; an edit to one and not the other is
    // exactly the drift this pins shut.
    expect(PAIEMENT.rediteA).toBe(PAIEMENT.redite);
    expect(PAIEMENT.rediteA).toBe(`Vous payez {X}${N}FCFA maintenant et {Y}${N}FCFA à la livraison — d’accord ?`);
  });

  /**
   * EVERY GLUED TAIL IS A SUBSTRING — because a `.replace` THAT STOPS MATCHING
   * IS A SILENT NO-OP (round 5, fresh verifier).
   *
   * `renderC5` holds two clauses together with `.replace(PAIEMENT.rediteFin, …)`
   * and `.replace(PAIEMENT.titreBFin, …)`. Change the em dash in `rediteFin`
   * alone to a hyphen and the clause no longer occurs in `redite`: nothing
   * throws, no assertion moves, the whole unit suite stays green — and the
   * orphan this project fixed twice is back on the buyer's screen. The DOM sweep
   * does catch it, so it is covered where it manifests; but it surfaces forty
   * seconds away in Playwright and names the SYMPTOM. These three lines name the
   * cause, instantly, in the file that owns the copy.
   */
  it('every glued tail is a SUBSTRING of the sentence it glues — the .replace cannot become a no-op', () => {
    expect(PAIEMENT.redite).toContain(PAIEMENT.rediteFin);
    expect(PAIEMENT.rediteA).toContain(PAIEMENT.rediteFin);
    expect(PAIEMENT.titreB).toContain(PAIEMENT.titreBFin);
    // …and the glue REACHES THE MARKUP, on the replay and on both sites that
    // name option B (the payable card, and the « Pas disponible » head).
    const chosenB = renderC5(ROBE, q, { ...C5, pay: 'B' });
    expect(chosenB).toContain(`<span class="cl-redite-fin">${PAIEMENT.rediteFin}</span>`);
    expect(chosenB).toContain(`<span class="cl-titre-fin">${PAIEMENT.titreBFin}</span>`);
    const sansB = renderC5(ROBE, modelFrom(FULL, undefined), { ...C5, bInel: true });
    expect(sansB).toContain(`<span class="cl-titre-fin">${PAIEMENT.titreBFin}</span>`);
    // THE GLUE IS MARKUP, NOT COPY: what she reads is byte-identical to §6.1.
    expect(visible(chosenB)).toContain('Payer le produit à la livraison');
    expect(visible(sansB)).toContain('Payer le produit à la livraison');
  });

  it('the card and the replay agree about mode A’s door leg — both say 0', () => {
    // The contradiction the ruling removed, asserted as one screen now.
    const a = visible(renderC5(ROBE, q, { ...C5, pay: 'A' }));
    expect(a).toContain(`À payer à la livraison : 0${N}FCFA`);
    expect(a).toContain(`et 0${N}FCFA à la livraison`);
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

  /**
   * THE BASKET LEVER THE ORPHAN SWEEP DRIVES (`?prix=`, round 5).
   *
   * It exists so the e2e can sweep a basket whose money sentences WRAP — the
   * sweep had enumerated every state against one 12 500 basket where they all
   * fit on one line. Tested here because it feeds a MONEY figure into the
   * composed quote: junk must be ignored in favour of her real price, never
   * turned into `NaN` francs on a payment screen.
   */
  it('the harness franc levers take whole positive francs and NOTHING else', () => {
    expect(harnessFrancs('9876543')).toBe(9_876_543);
    expect(harnessFrancs('1')).toBe(1);
    for (const junk of [null, '', 'abc', '12.5', '-1', '0', '1e9', ' 12', '12 ', '1234567890', '11500abc', '٣']) {
      expect(harnessFrancs(junk), `« ${junk} » was accepted as a price`).toBeUndefined();
    }
  });

  it('a large basket renders the SERVER-SHAPED bytes for it, with no client arithmetic', () => {
    // The composed mock prices what it is asked to price; the screen renders it.
    const q = composeQuote(9_876_543);
    const text = visible(renderC5(ROBE, q, { ...C5, pay: 'B' }));
    expect(text).toContain(`À payer maintenant : 1${N}000${N}FCFA`);
    expect(text).toContain(`À payer à la livraison : 9${N}876${N}543${N}FCFA`);
    expect(text).toContain(`9${N}877${N}543 = 9${N}876${N}543 + 1${N}000 — chaque franc a sa place.`);
  });
});

/* ═══ 7 · « Écouter la note » — FOUNDER RULING 2026-07-30 (an override reversed) ═══ */

/**
 * « I did not mean to remove the Écouter la note, reimplement it correctly so
 * if a reseller adds a note the buyer will be able to listen it. » — the
 * founder, 2026-07-30, revoking his own 2026-07-22 override.
 *
 * THE RULE, AND THE WHOLE RULE: the control exists exactly when a real note
 * exists, and NOT AT ALL when one does not. Not disabled, not greyed, not a
 * toast. A control that plays nothing is a promise this screen cannot keep, and
 * this is the screen where she is deciding to part with money.
 *
 * WHAT IT IS NOT, asserted rather than assumed: §6.1's PER-OPTION AUDIO NOTE —
 * a recorded explanation of options A and B — which does not exist and is not
 * built. Nothing here may imply the buyer is about to hear one.
 *
 * These EXECUTE the renderer. The question is what the buyer's screen offers,
 * and only running it answers that.
 */
describe('the reseller’s note is listenable from the payment screen — and only when it exists', () => {
  const q = modelFrom(FULL, DOOR);
  /**
   * The demo article carries a note (`ROBE.voiceUrl`); this is the same buyer,
   * same basket, with NO note — which is what the REAL path produces today,
   * because `profile.ts`'s real adapter returns no notes at all.
   *
   * BUILT BY OMISSION, not by assigning `undefined`: under
   * `exactOptionalPropertyTypes` an absent field and a field set to `undefined`
   * are different types, and only ABSENT is what `clienteProduitReel` actually
   * produces for a reseller who has recorded nothing.
   */
  const SANS_NOTE: ClienteProduit = (() => {
    const { voiceDuree, voiceUrl, ...reste } = ROBE;
    expect(voiceDuree, 'the demo article lost its note — this fixture proves nothing').toBeDefined();
    expect(voiceUrl).toBeDefined();
    return reste;
  })();

  /** Every state that shows the payment cards — she can be on any of them. */
  const CHOIX: Array<[string, C5State]> = [
    ['nothing chosen', C5],
    ['mode A chosen', { ...C5, pay: 'A' }],
    ['mode B chosen', { ...C5, pay: 'B' }],
    ['mode B unavailable', { ...C5, bInel: true }],
  ];

  for (const [name, s] of CHOIX) {
    it(`${name}: WITH a note, the control is there, carries HER url, and names whose voice it is`, () => {
      const html = renderC5(ROBE, s.bInel ? modelFrom(FULL, undefined) : q, s);
      expect(html).toContain('data-role="ecouter-note"');
      expect(html).toContain(`data-voix-url="${ROBE.voiceUrl}"`);
      expect(visible(html)).toContain(PAIEMENT.ecouterNote);
      // IT SAYS WHOSE VOICE IT IS. Without that word the label sits two
      // elements above « Comment payer ? » and reads as §6.1's per-option
      // explanation — the one recording this app does not have.
      expect(PAIEMENT.ecouterNote).toContain('de la vendeuse');
    });

    it(`${name}: WITHOUT a note there is NO control — not disabled, not greyed, not a word`, () => {
      const html = renderC5(SANS_NOTE, s.bInel ? modelFrom(FULL, undefined) : q, s);
      expect(html).not.toContain('data-role="ecouter-note"');
      expect(html).not.toContain('cl-ecouter');
      // …and the screen does not MENTION the note it does not have.
      expect(visible(html)).not.toContain('Écouter');
      expect(visible(html)).not.toContain(PAIEMENT.ecouterNote);
      // no disabled twin sneaking in under another name
      expect(html).not.toContain('voix-lire');
    });
  }

  it('an EMPTY url is no url — a control with nothing to play never renders', () => {
    const vide = { ...ROBE, voiceUrl: '' };
    expect(renderC5(vide, q, C5)).not.toContain('data-role="ecouter-note"');
  });

  /**
   * THE TEMPTING SHORTCUT, LOCKED OUT (work order FORBIDDEN, round 7).
   *
   * C1's `voix-lire` handler answers a MISSING URL — and a refused `play()` —
   * with « La voix d'Aïcha — 0:12 (démo) ». Reusing that action here would have
   * inherited the demo claim on the money screen, which is Ten Laws #5 and
   * Execution Contract §3 at once. The payment control has its OWN action name,
   * so the fallback is unreachable structurally rather than by care; `flow.ts`'s
   * `voix-lire-paiement` case has no missing-url branch, because there is no
   * button without a url.
   */
  it('it does NOT reuse C1’s action — the « (démo) » fallback is unreachable from this screen', () => {
    const html = renderC5(ROBE, q, C5);
    expect(html).toContain('data-action="voix-lire-paiement"');
    expect(html).not.toContain('data-action="voix-lire"');
    expect(visible(html)).not.toContain('démo');
  });

  /**
   * WHAT THE REFUSAL SAYS. The note is on the page — C5 renders no control
   * otherwise — so the only thing left to be true is that this browser would
   * not start it. It must not claim a demo, must not blame her network, and
   * must not read as an error wall.
   */
  it('the refusal sentence is true, calm, and never claims a demo', () => {
    expect(MESSAGES.noteInjouable).toBe('La note ne se lance pas sur ce téléphone.');
    for (const banned of ['démo', 'erreur', 'Erreur', 'veuillez', 'Veuillez', 'réseau', 'échec']) {
      expect(MESSAGES.noteInjouable.includes(banned), `« ${banned} »`).toBe(false);
    }
  });

  it('the control belongs to the CHOICE screen — it is gone once the payment has left', () => {
    for (const paying of ['submitting', 'provider'] as const) {
      const html = renderC5(ROBE, q, { ...C5, pay: 'A', paying });
      expect(html, paying).not.toContain('data-role="ecouter-note"');
    }
  });

  /**
   * WHERE IT SITS. Below the bill and its honesty line — where the ARTICLE is
   * named and priced — and ABOVE « Comment payer ? », outside the payment
   * options entirely. Read top to bottom: what you are buying · her words about
   * it · how to pay. Inside or beside an option card it would read as the
   * per-option explanation §6.1 asks for and this app does not have, which is
   * the one thing the founder's ruling said it must not do.
   */
  it('it sits between the bill and « Comment payer ? » — never inside an option card', () => {
    const html = renderC5(ROBE, q, C5);
    const control = html.indexOf('data-role="ecouter-note"');
    const reconcile = html.indexOf('data-role="reconcile"');
    const commentPayer = html.indexOf('Comment payer ?');
    const optionA = html.indexOf('data-mode="A"');
    expect(control).toBeGreaterThan(reconcile);
    expect(control).toBeLessThan(commentPayer);
    expect(control).toBeLessThan(optionA);
  });

  it('the label is a LINTED §6.1 string, not an inline one', () => {
    // It lives in the same table the copy gate extracts, so it is French-Voice
    // linted and its DELETION fails the gate's structural floor — the way this
    // control left the screen once before.
    expect(PAIEMENT.ecouterNote).toBe('Écouter la note de la vendeuse');
    expect(renderC5(ROBE, q, C5)).toContain(PAIEMENT.ecouterNote);
  });
});
