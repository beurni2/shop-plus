import { describe, expect, it } from 'vitest';
import { renderProductPage, type ProductViewModel } from '../src/product-view';

/**
 * WO-4.4 — SP-I03 (quoted): "Customer-facing pages MUST show the reseller as
 * the commercial relationship and MUST NOT expose supplier identity/contact
 * or commission." The DoD demands the NEGATIVE: a commission-bearing fixture
 * must FAIL to surface — poison in, nothing out.
 */

const MODEL: ProductViewModel = {
  productName: 'Pagne tissé Faso Dan Fani',
  resellerName: 'Chez Awa — Dassasgho',
  priceFcfa: 11_500,
  inStock: true,
};

const F = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

describe('§6.2 arrival — the product page', () => {
  const html = renderProductPage(MODEL);

  it('SP-I03 NEGATIVE: a commission-poisoned fixture never surfaces — no amount, no word, no supplier', () => {
    const poisoned = {
      ...MODEL,
      commissionFcfa: 2_000,
      commissionRate: 0.2,
      supplierName: 'Fournisseur Sankara',
      supplierPhone: '+226 70 00 00 00',
    } as unknown as ProductViewModel;
    const out = renderProductPage(poisoned);
    expect(out).not.toContain(F(2_000)); // the poisoned commission amount
    expect(out).not.toContain('2000');
    expect(out.toLowerCase()).not.toContain('commission');
    expect(out.toLowerCase()).not.toContain('fournisseur');
    expect(out).not.toContain('Sankara');
    expect(out).not.toContain('70 00 00 00');
  });

  it('model strings are HTML-escaped — markup in a product/reseller name never executes (verifier NB①)', () => {
    const html = renderProductPage({
      ...MODEL,
      productName: '<img src=x onerror=alert(1)>Pagne',
      resellerName: '"><script>bad()</script>',
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img src=x');
  });

  it('the reseller IS the commercial relationship — her name, her badge', () => {
    expect(html).toContain('Chez Awa — Dassasgho');
    expect(html).toContain('Vendeuse de confiance');
  });

  it('HER price (productSubtotal) is the hero figure — money.amountScale.hero class', () => {
    expect(html).toContain(`<p class="fcfa-hero">${F(11_500)} FCFA</p>`);
  });

  it('the two trust lines are present: « Livré par Séra » and « Paiement protégé »', () => {
    expect(html).toContain('Livré par Séra');
    expect(html).toContain('Paiement protégé');
  });

  it('ONE primary action (« Acheter »), with the amount stated', () => {
    expect(html.match(/class="primary-action"/g)).toHaveLength(1);
    expect(html).toContain(`Acheter — ${F(11_500)} FCFA`);
  });

  it('« Vos protections » (§6.3) is reachable from the product page', () => {
    expect(html).toContain('data-action="protections"');
    expect(html).toContain('Vos protections');
  });
});
