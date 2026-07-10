import { describe, expect, it } from 'vitest';
import { renderCheckoutOptions } from '../src/checkout-view';
import { renderOrderView } from '../src/order-view';
import rawCatalog from '../i18n/catalog.json';

/**
 * WO-2.5 — §6.1 two-option checkout + Option-B tracking copy. What these
 * tests protect: both amounts EXPLICIT on the §5.4 baseline split, Option A
 * labeled « recommandé », the non-refundable-fee warning, the replay line
 * with BOTH figures, no « séquestre » anywhere, and a dignified unavailable
 * state (never an error wall).
 */

const AVAILABLE = renderCheckoutOptions({
  buyerTotalFcfa: 12_500,
  optionA: { payNowFcfa: 12_500, dueAtDoorFcfa: 0 },
  optionB: { available: true, payNowFcfa: 1_000, dueAtDoorFcfa: 11_500 },
});

// fr-FR grouping uses narrow no-break space (U+202F) between thousands.
const F = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

describe('§6.1 two-option checkout', () => {
  it('both options are shown and Option A is labeled « recommandé »', () => {
    expect(AVAILABLE).toContain('data-option="full-prepay"');
    expect(AVAILABLE).toContain('data-option="pay-at-door"');
    expect(AVAILABLE).toContain('recommandé');
  });

  it('both amounts are explicit per option: what is paid NOW and what is due AT THE DOOR', () => {
    expect(AVAILABLE).toContain('À payer maintenant :');
    expect(AVAILABLE).toContain('À payer à la livraison :');
    expect(AVAILABLE).toContain(`${F(12_500)} F`); // A pays everything now
    expect(AVAILABLE).toContain(`${F(1_000)} F`); // B pays D now
    expect(AVAILABLE).toContain(`${F(11_500)} F`); // B owes productSubtotal at the door
  });

  it('the replay line states BOTH figures before payment (§6.1)', () => {
    expect(AVAILABLE).toContain(`Vous payez ${F(1_000)} F maintenant et ${F(11_500)} F à la livraison — d'accord ?`);
  });

  it('the non-refundable delivery-fee warning is present (§6.1)', () => {
    expect(AVAILABLE).toContain('Frais de livraison non remboursables si vous annulez ou êtes absent(e).');
  });

  it('« séquestre »/"escrow" never appears in customer copy — the view or the catalog', () => {
    expect(AVAILABLE.toLowerCase()).not.toContain('séquestre');
    expect(AVAILABLE.toLowerCase()).not.toContain('escrow');
    const allCopy = JSON.stringify(rawCatalog).toLowerCase();
    expect(allCopy).not.toContain('séquestre');
    expect(allCopy).not.toContain('escrow');
  });

  it('an ineligible buyer gets a designed, honest unavailable state — Option A intact, no error wall', () => {
    const unavailable = renderCheckoutOptions({
      buyerTotalFcfa: 12_500,
      optionA: { payNowFcfa: 12_500, dueAtDoorFcfa: 0 },
      optionB: { available: false },
    });
    expect(unavailable).toContain('data-option="full-prepay"');
    expect(unavailable).toContain('data-option="pay-at-door-unavailable"');
    expect(unavailable).toContain("Le paiement à la livraison n'est pas disponible pour cette commande.");
    // no dead click: the unavailable card carries NO action button.
    const card = unavailable.split('data-option="pay-at-door-unavailable"')[1]!;
    expect(card).not.toContain('<button');
  });
});

describe('Option-B tracking states (order view)', () => {
  it('door_pending shows the product figure due at the door, in large FCFA, with what-happens-next', () => {
    const html = renderOrderView({ state: 'door_pending', buyerTotalFcfa: 12_500, amountDueAtDeliveryFcfa: 11_500 });
    expect(html).toContain('data-state="door_pending"');
    expect(html).toContain('Livraison déjà payée.');
    expect(html).toContain(`${F(11_500)} F CFA`);
    expect(html).toContain('class="fcfa-figure"');
    expect(html).toContain('Le livreur arrive.');
  });

  it('door_paid states the calm outcome — product paid, handover under way', () => {
    const html = renderOrderView({ state: 'door_paid', buyerTotalFcfa: 12_500 });
    expect(html).toContain('data-state="door_paid"');
    expect(html).toContain('Produit payé. Le livreur vous remet votre commande.');
  });
});
