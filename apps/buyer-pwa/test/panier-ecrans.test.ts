import { describe, expect, it } from 'vitest';
import { renderC1Panier, renderC4, renderC6, renderMesArticles, renderRefus, type ClienteQuote } from '../src/cliente/screens';

/**
 * PAYER-TOUT-1 — the panier's own faces on the checkout: its first screen,
 * its récap lines, its confirmation list, and the refusal that names the
 * article. What the page may NEVER carry: her read token.
 */

const PROD = { shopName: 'Chez Aïcha', prenom: 'Aïcha', slug: 'aicha-4821', productName: 'Votre panier · 2 articles', zone: 'Ouagadougou', priceFcfa: 0, assetRefs: [], inStock: true };
const Q: ClienteQuote = {
  produitFcfa: 36_500,
  feeToday: 2_500,
  feeTomorrow: 2_500,
  totalToday: 39_000,
  totalTomorrow: 39_000,
  splitsToday: { A: { paidNow: 39_000, dueAtDelivery: 0 } },
  splitsTomorrow: { A: { paidNow: 39_000, dueAtDelivery: 0 } },
};
const texte = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('PAYER-TOUT-1 — the panier on the checkout', () => {
  it('C1 lists each article with its own price, and ONE primary action', () => {
    const html = renderC1Panier({
      shopName: 'Chez Aïcha',
      articles: [
        { nom: 'Robe bogolan', prixFcfa: 11_500, photo: 'https://m.example/p1.jpg' },
        { nom: 'Sac en cuir', prixFcfa: 25_000 },
      ],
    });
    expect(html.match(/data-role="panier-article"/g)).toHaveLength(2);
    expect(texte(html)).toContain('Robe bogolan');
    expect(texte(html)).toContain('Votre panier · 2 articles');
    expect(html.match(/class="cl-cta[^"]*"/g)).toHaveLength(1);
    expect(html).toContain('data-action="commander"');
    // No total on this screen: the service states it once her destination is known.
    expect(texte(html)).not.toContain('36');
  });

  it('C4 lists each article\'s line and counts the parcels at the service\'s summed fee', () => {
    const html = renderC4(Q, {
      zone: 'Gounghin',
      repereRecap: 'près du marché',
      delivery: 'today',
      ligneUnique: true,
      panier: { lignes: [{ nom: 'Robe bogolan', produitFcfa: 11_500 }, { nom: 'Sac en cuir', produitFcfa: 25_000 }] },
    });
    expect(html).toContain('data-role="panier-recap"');
    expect(texte(html)).toContain('2 livraisons par Séra');
    expect(texte(html)).toMatch(/2[\s  ]500/);
  });

  it('C6 confirmed lists each article\'s own order with its own « Suivre » (only the order id rides the button)', () => {
    const html = renderC6(PROD, {
      confirmState: 'confirmed',
      paid: { paidNow: 39_000, dueAtDelivery: 0 },
      commande: 'grp-abc',
      panier: { articles: [{ orderId: 'ord-1', nom: 'Robe bogolan' }, { orderId: 'ord-2', nom: 'Sac en cuir' }] },
    });
    expect(html.match(/data-action="suivre-article"/g)).toHaveLength(2);
    expect(html).toContain('data-order="ord-1"');
    expect(html).not.toContain('data-action="suivre"');
    expect(html.match(/<button[^>]*data-action="suivre-article"[^>]*>/g)!.every((b) => /^<button class="cl-panier-suivre" data-action="suivre-article" data-order="ord-\d">$/.test(b))).toBe(true);
    expect(texte(html)).toContain('2 commandes, une par article');
  });

  it('C6 NOT confirmed shows no « Suivre » at all — tracking waits for the operator', () => {
    const html = renderC6(PROD, {
      confirmState: 'attente',
      paid: undefined,
      commande: 'grp-abc',
      panier: { articles: [{ orderId: 'ord-1', nom: 'Robe bogolan' }] },
    });
    expect(html).not.toContain('suivre-article');
  });

  it('a refusal about an ARTICLE names it and sends her back to the panier; any other keeps its own sentence', () => {
    const nomme = renderRefus('out_of_stock', 'Sac en cuir');
    expect(texte(nomme)).toContain('Sac en cuir n’est plus disponible.');
    expect(texte(nomme)).toContain('Rien n’a été payé.');
    expect(nomme).toContain('data-action="voir-boutique"');
    const autre = renderRefus('delivery_not_serviceable', 'Sac en cuir');
    expect(texte(autre)).not.toContain('Sac en cuir');
    expect(renderRefus('out_of_stock')).toBe(renderRefus('out_of_stock', undefined));
  });

  it('« Mes articles payés ensemble » is the same list', () => {
    const html = renderMesArticles([{ orderId: 'ord-1', nom: 'Robe bogolan' }]);
    expect(html).toContain('data-order="ord-1"');
    expect(texte(html)).toContain('Mes articles payés ensemble');
  });
});
