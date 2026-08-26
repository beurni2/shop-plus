import { describe, expect, it } from 'vitest';
import { renderC6, MERCI, type ClienteProduit } from '../src/cliente/screens';
import { fetchClienteQuote, type QuoteBase } from '../src/cliente/quote-model';
import type { QuotePort, MerciOutcome, OrderOutcome, QuoteIntent, QuoteOutcome, RemiseOutcome, ReserveOutcome } from '../src/cliente/quote-port';

/**
 * LISTE-MERCI — the purchaser-side laws, by execution:
 *  · the gift block renders ONLY on a CONFIRMED body and only when the merci
 *    facts arrived — an unpaid gift announced would be the screen inventing
 *    a payment outcome;
 *  · the creator's NUMBER never enters the DOM — the renderer receives the
 *    nom alone, structurally;
 *  · with a liste on the fiche the DOOR ASK IS NEVER ISSUED — the full-prepay
 *    lock's client half, asserted on the wire (calls counted, not guards).
 */

const PRODUIT: ClienteProduit = {
  shopName: 'Chez Awa', prenom: 'Awa', slug: 'chez-awa-1',
  productName: 'Robe brodée bogolan', zone: 'Dassasgho, Ouagadougou',
  priceFcfa: 11_500, assetRefs: [], inStock: true,
};

describe('renderC6 — the gift block', () => {
  it('renders on the confirmed body: titre with the nom, prénom input, one action, inline alerte slot', () => {
    const page = renderC6(PRODUIT, { confirmState: 'confirmed', paid: undefined, merci: { nom: 'Awa' } });
    expect(page).toContain('data-role="liste-merci"');
    expect(page).toContain(`${MERCI.titreAvant} <v>Awa</v>`);
    expect(page).toContain('data-role="merci-prenom"');
    expect(page).toContain('data-action="merci-whatsapp"');
    expect(page).toContain('data-role="merci-alerte"');
  });

  it('NEVER renders while the operator has not confirmed — whatever the caller passes', () => {
    for (const confirmState of ['attente', 'echec', 'pending', 'offline'] as const) {
      const page = renderC6(PRODUIT, { confirmState, paid: undefined, merci: { nom: 'Awa' } });
      expect(page, confirmState).not.toContain('data-role="liste-merci"');
    }
  });

  it('absent facts render no block — the honest screen for every shut merci road', () => {
    expect(renderC6(PRODUIT, { confirmState: 'confirmed', paid: undefined })).not.toContain('data-role="liste-merci"');
  });

  it('the message template names the prénom, the article and the lien — and the renderer never receives a number', () => {
    expect(MERCI.message).toContain('{prenom}');
    expect(MERCI.message).toContain('{article}');
    expect(MERCI.message).toContain('{lien}');
    // structural: the renderer's merci shape carries the nom alone; a number
    // cannot enter the DOM through it because there is no field to carry one
    const page = renderC6(PRODUIT, { confirmState: 'confirmed', paid: undefined, merci: { nom: 'Awa' } });
    expect(page).not.toMatch(/\b226\d{8}\b|wa\.me/);
  });
});

describe('fetchClienteQuote — the door ask is never issued under a liste (the client half of the lock)', () => {
  const FULL = {
    quoteId: 'quote-abc', paymentMode: 'FULL_PREPAY', productSubtotal: 11_500,
    deliveryFee: 1_000, buyerTotal: 12_500, amountPaidAtCheckout: 12_500,
    amountDueAtDelivery: 0, expiry: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  const DOOR = {
    ...FULL, quoteId: 'quote-door', paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
    amountPaidAtCheckout: 1_000, amountDueAtDelivery: 11_500,
  };
  const base: QuoteBase = { slug: 'chez-awa-1', pid: 'p1', zoneTo: 'Gounghin, Ouagadougou', attributionResellerId: 'rs-1' };
  const keys = (i: QuoteIntent): string => `key-${i.paymentMode}`;

  function portComptant(): { port: QuotePort; asked: string[] } {
    const asked: string[] = [];
    const port: QuotePort = {
      async request(intent): Promise<QuoteOutcome> {
        asked.push(intent.paymentMode);
        return { status: 'quote', quote: intent.paymentMode === 'FULL_PREPAY' ? FULL : DOOR };
      },
      async reserve(): Promise<ReserveOutcome> { return { status: 'reserved' }; },
      async order(): Promise<OrderOutcome> { return { status: 'refused', reason: 'stub' }; },
      async orderState(): Promise<OrderOutcome> { return { status: 'refused', reason: 'stub' }; },
      async doorCharge(): Promise<OrderOutcome> { return { status: 'refused', reason: 'stub' }; },
      async remise(): Promise<RemiseOutcome> { return { status: 'refused' }; },
      async listeMerci(): Promise<MerciOutcome> { return { status: 'indisponible' }; },
    };
    return { port, asked };
  }

  it('with a listeRef, ONE ask leaves the app and mode B is « pas disponible »', async () => {
    const { port, asked } = portComptant();
    const got = await fetchClienteQuote(port, base, keys, undefined, 5, undefined, 'T'.repeat(32));
    expect(asked).toEqual(['FULL_PREPAY']); // the door ask never left the phone
    expect(got.status).toBe('ready');
    if (got.status !== 'ready') return;
    expect(got.bIndisponible, 'the door option must be the approved « pas disponible » state').toBe(true);
  });

  it('without a liste, both asks still go out — the lock narrows nothing else', async () => {
    const { port, asked } = portComptant();
    const got = await fetchClienteQuote(port, base, keys, undefined, 5);
    expect(asked.sort()).toEqual(['DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR', 'FULL_PREPAY']);
    expect(got.status).toBe('ready');
  });
});
