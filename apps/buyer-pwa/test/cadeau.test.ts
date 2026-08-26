import { describe, expect, it } from 'vitest';
import { etatDeLecture, ligneCadeau, renderCadeau } from '../src/cadeau';
import type { ServerOrder } from '../src/cliente/quote-port';

/**
 * LISTE-MERCI — the gift-tracking page (?cadeau={orderId}): the creator's
 * read-only view over the public order projection. The laws asserted here:
 * the sentence follows the RECORDED facts (marks outrank the state string,
 * absence = « pas encore »), no amount and no code can appear (the renderer
 * simply never reads those fields), and every non-answer is a designed state
 * with its way out.
 */

const commande = (over: Partial<ServerOrder> = {}): ServerOrder => ({
  orderId: 'ord-1',
  state: 'confirmed',
  amountPaidAtCheckout: 12_500,
  amountDueAtDelivery: 0,
  ...over,
});

describe('ligneCadeau — the sentence follows the recorded facts', () => {
  it('walks the ladder: confirmed → préparation → prêt → en route → arrivé → livré', () => {
    expect(ligneCadeau(commande())).toBe('En préparation');
    expect(ligneCadeau(commande({ acceptedAt: 'T' }))).toBe('En préparation');
    expect(ligneCadeau(commande({ acceptedAt: 'T', readyAt: 'T' }))).toBe('Prêt — Séra passe le chercher');
    expect(ligneCadeau(commande({ readyAt: 'T', departedAt: 'T' }))).toBe('En route');
    expect(ligneCadeau(commande({ departedAt: 'T', arrivedAt: 'T' }))).toBe('Arrivé — remise en cours');
    expect(ligneCadeau(commande({ arrivedAt: 'T', livree: true }))).toBe('Livré');
  });

  it('an order the provider has not confirmed says so — never a préparation that has not begun', () => {
    expect(ligneCadeau(commande({ state: 'payment_pending' }))).toBe("La commande n'est pas encore confirmée.");
  });
});

describe('renderCadeau — the four screens', () => {
  it('the tracking card carries the state line, the four marks, and the refresh — and NO amount', () => {
    const page = renderCadeau({ etape: 'suivi', commande: commande({ acceptedAt: 'T', readyAt: 'T' }) });
    expect(page).toContain('data-role="cadeau-suivi"');
    expect(page).toContain('Prêt — Séra passe le chercher');
    expect(page).toContain('data-action="cadeau-actualiser"');
    // a gift's price on the recipient's screen would be poor craft — the
    // renderer never reads the wire's figures
    expect(page).not.toMatch(/12[  ]?500|FCFA/);
    // two marks done, two pending
    expect((page.match(/cd-marque-faite/g) ?? []).length).toBe(2);
  });

  it('introuvable is terminal (no retry for a link that names nothing); hors-ligne keeps its way out', () => {
    const perdu = renderCadeau({ etape: 'introuvable' });
    expect(perdu).toContain('Nous ne trouvons pas cette commande.');
    expect(perdu).not.toContain('data-action="cadeau-actualiser"');
    const hl = renderCadeau({ etape: 'hors-ligne' });
    expect(hl).toContain('Pas de connexion');
    expect(hl).toContain('data-action="cadeau-actualiser"');
  });
});

describe('etatDeLecture — the port answer becomes a screen honestly', () => {
  it('order → suivi; unreachable → hors-ligne; refused and unreadable → introuvable', () => {
    expect(etatDeLecture({ status: 'order', order: commande() }).etape).toBe('suivi');
    expect(etatDeLecture({ status: 'unreachable' }).etape).toBe('hors-ligne');
    expect(etatDeLecture({ status: 'refused', reason: 'unknown_order' }).etape).toBe('introuvable');
    expect(etatDeLecture({ status: 'unreadable' }).etape).toBe('introuvable');
  });
});
