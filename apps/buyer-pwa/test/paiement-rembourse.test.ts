import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { httpQuotePort, verdictBande } from '../src/cliente/quote-port';
import { renderC7, renderRefus } from '../src/cliente/screens';
import { t } from '../src/i18n';

/**
 * Shop-Plus-Build-Spec §7 SP6 — money the provider confirms for an order whose
 * payment had already failed comes back to her in full, by itself. Her side:
 * the order's refund crosses the wire with its own reason, her phone keeps the
 * order so she can see it, the tracking card says it in plain words, and a
 * second « Payer » on that order is answered calmly instead of charging again.
 *
 * These EXECUTE the wire read, the band's verdict and the renderers; the real
 * bundle walking from the failed payment to the card is in
 * e2e/checkout-real.spec.ts.
 */

async function withFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const jsonRes = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const ECHOUEE = { orderId: 'ord-1', state: 'payment_failed', amountPaidAtCheckout: 3_333, amountDueAtDelivery: 0, doorLeg: 'none' };
const NNBSP = ' ';

const lire = (body: unknown) =>
  withFetch(
    (async () => jsonRes(body)) as unknown as typeof fetch,
    () => httpQuotePort('https://svc.example').orderState('ord-1', 'ref-1'),
  );

describe('her refund after a failed payment crosses the wire with its reason', () => {
  it('« paiement » crosses, in progress and done', async () => {
    const enCours = await lire({ ...ECHOUEE, remboursement: { etat: 'en_cours', montant: 3_333, motif: 'paiement' } });
    expect(enCours.status === 'order' && enCours.order.remboursement).toEqual({ etat: 'en_cours', montant: 3_333, motif: 'paiement' });
    const fait = await lire({ ...ECHOUEE, state: 'refunded', remboursement: { etat: 'fait', montant: 3_333, motif: 'paiement' } });
    expect(fait.status === 'order' && fait.order.remboursement).toEqual({ etat: 'fait', montant: 3_333, motif: 'paiement' });
  }, 10_000);
});

describe('her phone keeps a failed order only when it carries a refund', () => {
  it('payment_failed or cancelled WITH a refund ⇒ the band; without one ⇒ forgotten, as before', async () => {
    for (const state of ['payment_failed', 'cancelled']) {
      const avec = await lire({ ...ECHOUEE, state, remboursement: { etat: 'en_cours', montant: 3_333, motif: 'paiement' } });
      expect(verdictBande(avec), `${state} + refund`).toBe('payee');
      const sans = await lire({ ...ECHOUEE, state });
      expect(verdictBande(sans), state).toBe('oublier');
    }
  }, 10_000);

  it('a refund the wire read dropped (an unknown reason) keeps the old verdict', async () => {
    const inconnu = await lire({ ...ECHOUEE, remboursement: { etat: 'en_cours', montant: 3_333, motif: 'autre' } });
    expect(inconnu.status === 'order' && inconnu.order.remboursement).toBeUndefined();
    expect(verdictBande(inconnu)).toBe('oublier');
  }, 10_000);
});

describe('the tracking card says the payment did not go through, and the money comes back', () => {
  const REEL = { step: 1, problem: false, demo: true, reel: true, commande: 'ord-1', voirCode: true, porte: true };

  it('in progress: the figure, the plain sentence, no parcel road, no code, no door, no step « now »', () => {
    const html = renderC7({ ...REEL, remboursement: { etat: 'en_cours', montant: 3_333, motif: 'paiement' } });
    expect(html).toContain('data-etat="en-cours"');
    expect(html).toContain(`3${NNBSP}333${NNBSP}FCFA vous reviennent`);
    expect(html).toContain(
      '<div class="cl-rembourse-corps">Le paiement n’a pas abouti. Votre argent revient sur le numéro qui a payé.</div>',
    );
    expect(html).not.toContain('Le colis retourne');
    expect(html).not.toContain('data-action="voir-code"');
    expect(html).not.toContain('data-action="porte"');
    expect(html).not.toContain('cl-now-badge');
  }, 10_000);

  it('done: « Remboursement fait », and the done sentence in the past', () => {
    const html = renderC7({ ...REEL, remboursement: { etat: 'fait', montant: 3_333, motif: 'paiement' } });
    expect(html).toContain('data-etat="fait"');
    expect(html).toContain(`Remboursement fait : 3${NNBSP}333${NNBSP}FCFA`);
    expect(html).toContain(
      '<div class="cl-rembourse-corps">Le paiement n’avait pas abouti. L’argent est revenu sur le numéro qui a payé.</div>',
    );
    expect(html).not.toContain('vous reviennent');
    expect(html).not.toContain('Le colis retourne');
  }, 10_000);
});

describe('a second « Payer » on an order already being refunded is answered calmly', () => {
  it('« paiement_rembourse » has its own screen: the money comes back, nothing more is taken, one way on', () => {
    const html = renderRefus('paiement_rembourse');
    expect(html).toContain('data-motif="paiement_rembourse"');
    expect(html).toContain('<div class="cl-sub-overline">LE PAIEMENT</div>');
    expect(html).toContain('<div class="cl-sub-title">Votre argent vous revient.</div>');
    expect(html).toContain(
      '<div class="cl-sub-body">Le paiement n’a pas abouti, et votre argent revient sur le numéro qui a payé. Rien de plus ne sera pris pour cette commande.</div>',
    );
    expect(html).toContain('<button class="cl-cta cl-cta-step" data-action="voir-boutique">Voir la boutique</button>');
    for (const action of ['reessayer-prix', 'prix-a-jour', 'payer-tout', 'reessayer-paiement', 'payer']) {
      expect(html, action).not.toContain(`data-action="${action}"`);
    }
    expect(html).not.toContain(t('cl.refus.generique.titre'));
    expect(html, 'money did move: never the no-money sentence').not.toContain('Rien n’a été payé');
  }, 10_000);
});

describe('the new words live in the catalog, in the money register', () => {
  it('each key is there once, register money, with its screen class', () => {
    const catalog = JSON.parse(readFileSync(new URL('../i18n/catalog.json', import.meta.url), 'utf8')) as {
      key: string; fr: string; register: string; screenClass: string;
    }[];
    const attendu: Record<string, string> = {
      'cl.remboursement.paiement_corps': 'status',
      'cl.remboursement.paiement_fait_corps': 'status',
      'cl.refus.paiement_rembourse.overline': 'label',
      'cl.refus.paiement_rembourse.titre': 'status',
      'cl.refus.paiement_rembourse.phrase': 'status',
      'cl.refus.paiement_rembourse.libelle': 'label',
    };
    for (const [key, screenClass] of Object.entries(attendu)) {
      const entries = catalog.filter((e) => e.key === key);
      expect(entries, key).toHaveLength(1);
      expect(entries[0]!.register, key).toBe('money');
      expect(entries[0]!.screenClass, key).toBe(screenClass);
    }
  }, 10_000);
});
