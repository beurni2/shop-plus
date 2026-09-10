import { describe, expect, it } from 'vitest';
import { clienteQuoteFromServer } from '../src/cliente/quote-model';
import type { ServerQuote } from '../src/cliente/quote-port';
import { OPERATEUR, renderC5, renderC8, type C5State, type ClienteQuote } from '../src/cliente/screens';
import { ROBE } from '../src/cliente/seed';

/**
 * OPERATEUR-VRAI-1 (AUDIT-SHOP-2 F-60) — THE OPERATOR WAIT SCREENS TELL THE
 * TRUTH THE APP KNOWS.
 *
 * The audit measured both screens that ask her for her code — C5's wait after
 * « Payer » and C8's door leg in front of the rider — naming ONE operator
 * (« Composez votre code secret Orange Money ») for every buyer, while the
 * same checkout lists « ORANGE MONEY · MOOV MONEY » as accepted and nothing in
 * the flow, the quote or the contracts carries which operator she uses. A Moov
 * buyer read a wrong instruction at the money moment (§5 trust test: every
 * money moment makes someone calmer; Contract §10.5: cause and effect stated
 * plainly). Written RED first, against the screens as they were.
 *
 * EVERY ASSERTION EXECUTES THE RENDERER — what Aïcha's screen says, not what a
 * file contains.
 */

const N = '\u202f'; // the one NNBSP source in this file — never a raw byte

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

function modelFrom(full: ServerQuote, door: ServerQuote | undefined): ClienteQuote {
  const got = clienteQuoteFromServer(full, door === undefined ? { status: 'unreachable' } : { status: 'quote', quote: door });
  if (!got.ok) throw new Error(`expected a quote, got ${got.reason}`);
  return got.quote;
}

const Q = modelFrom(FULL, DOOR);
const C5_WAIT: C5State = { delivery: 'today', pay: 'B', paying: 'provider', bInel: false };

/** The operator sentence block alone — the one element that names the credential. */
const provBody = (html: string): string => /<div class="cl-prov-body">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
const visible = (html: string): string => html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, '');

const ecrans = (): Array<[string, string]> => [
  ['C5 · opérateur', renderC5(ROBE, Q, C5_WAIT)],
  ['C8 · paiement à la porte', renderC8(ROBE, Q, { door: 'accepted', pay: 'B', reason: null, duAlaPorte: 11_500 })],
];

describe('OPERATEUR-VRAI-1 — no wait screen names an operator the app does not know', () => {
  for (const [name, html] of ecrans()) {
    it(`${name}: the credential sentence names no operator brand`, () => {
      const body = provBody(html);
      expect(body, `${name} renders no operator sentence`).not.toBe('');
      expect(/orange|moov/i.test(body), `${name}: « ${visible(body)} »`).toBe(false);
    });
  }

  it('the sentence still carries the server’s own amount for that leg — C5 the paid-now leg, C8 the door leg', () => {
    const [[, c5], [, c8]] = ecrans();
    expect(visible(provBody(c5))).toContain(`1${N}000${N}FCFA`);
    expect(visible(provBody(c8))).toContain(`11${N}500${N}FCFA`);
  });

  it('the checkout still tells her which operators are accepted, so « votre opérateur » has its referent', () => {
    const choix = renderC5(ROBE, Q, { ...C5_WAIT, paying: 'idle' });
    const providers = /<div class="cl-providers">([\s\S]*?)<\/div>/.exec(choix)?.[1] ?? '';
    expect(visible(providers)).toContain('ORANGE MONEY');
    expect(visible(providers)).toContain('MOOV MONEY');
  });
});

describe('OPERATEUR-VRAI-1 — the table is what both screens render, byte for byte', () => {
  it('the credential phrase is a SUBSTRING of the sentence — the glue’s .replace can never become a silent no-op', () => {
    expect(OPERATEUR.corps.includes(OPERATEUR.cle)).toBe(true);
    expect(OPERATEUR.corps.split('{X}')).toHaveLength(2); // exactly one server figure
    for (const [field, copy] of Object.entries(OPERATEUR)) {
      if (field === 'corps') continue;
      expect(copy.includes('{'), `OPERATEUR.${field} takes no placeholder`).toBe(false);
    }
  });

  for (const [name, html] of ecrans()) {
    it(`${name}: the rendered sentence IS the table's, with the figure in bold and the credential phrase glued once`, () => {
      const body = provBody(html);
      const figure = /<b>([^<]*)<\/b>/.exec(body)?.[1] ?? '';
      expect(figure).toMatch(/FCFA$/u);
      const attendu = OPERATEUR.corps.replace('{X}', figure);
      expect(visible(body)).toBe(attendu);
      expect(body.match(/<span class="cl-prov-cle">/g) ?? []).toHaveLength(1);
      expect(body).toContain(`<span class="cl-prov-cle">${OPERATEUR.cle}</span>`);
    });
  }

  it('C5 and C8 read the same table for their title, wait line and law line', () => {
    const [[, c5], [, c8]] = ecrans();
    expect(visible(c5)).toContain(OPERATEUR.titre);
    expect(visible(c8)).toContain(OPERATEUR.porteTitre);
    for (const html of [c5, c8]) expect(visible(html)).toContain(OPERATEUR.attente);
    expect(visible(c5)).toContain(OPERATEUR.loi);
    expect(visible(c8)).toContain(OPERATEUR.porteLoi);
  });
});
