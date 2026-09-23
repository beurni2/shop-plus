import { describe, expect, it } from 'vitest';
import { httpQuotePort } from '../src/cliente/quote-port';
import { renderC7 } from '../src/cliente/screens';
import { t } from '../src/i18n';

/**
 * REMBOURSEMENT-1 — her refund on the tracking (founder ruling 2026-09-23:
 * « the buyer gets every franc back and the platform pays any refund fee »).
 *
 * These EXECUTE the wire read and the renderer. That the real bundle polls a
 * real refund into the card, and that a confirmed refund ends the watch, is
 * walked in e2e/checkout-real.spec.ts.
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

const ORDRE = { orderId: 'ord-1', state: 'paid', amountPaidAtCheckout: 12_500, amountDueAtDelivery: 0, doorLeg: 'none' };
const NNBSP = '\u202f';

const lire = (body: unknown) =>
  withFetch(
    (async () => jsonRes(body)) as unknown as typeof fetch,
    () => httpQuotePort('https://svc.example').orderState('ord-1'),
  );

describe('readOrder — her refund crosses the wire as the server said it, or not at all', () => {
  it('en_cours and fait, with the kept fee when the server sends one', async () => {
    const enCours = await lire({ ...ORDRE, remboursement: { etat: 'en_cours', montant: 12_500 } });
    expect(enCours.status === 'order' && enCours.order.remboursement).toEqual({ etat: 'en_cours', montant: 12_500 });
    const fait = await lire({ ...ORDRE, state: 'refunded', remboursement: { etat: 'fait', montant: 11_500, fraisGardes: 1_000 } });
    expect(fait.status === 'order' && fait.order.remboursement).toEqual({ etat: 'fait', montant: 11_500, fraisGardes: 1_000 });
  });

  it('a malformed refund is dropped WHOLE — and only the refund: the order read survives', async () => {
    const mauvais: unknown[] = [
      { etat: 'rembourse', montant: 12_500 },
      { etat: 'fait', montant: 0 },
      { etat: 'fait', montant: -5 },
      { etat: 'fait', montant: 12.5 },
      { etat: 'fait', montant: '12500' },
      { etat: 'en_cours', montant: 11_500, fraisGardes: 0 },
      { etat: 'en_cours', montant: 11_500, fraisGardes: '1000' },
      'fait',
      null,
    ];
    for (const r of mauvais) {
      const got = await lire({ ...ORDRE, remboursement: r });
      expect(got.status, JSON.stringify(r)).toBe('order');
      if (got.status !== 'order') continue;
      expect(got.order.remboursement, JSON.stringify(r)).toBeUndefined();
      expect(got.order.amountPaidAtCheckout).toBe(12_500);
    }
  });

  it('no refund on the wire ⇒ none on the order (absence announces nothing)', async () => {
    const got = await lire(ORDRE);
    expect(got.status === 'order' && got.order.remboursement).toBeUndefined();
  });

  it('only the three fields cross — a key or collection reference smuggled in is not carried', async () => {
    const got = await lire({ ...ORDRE, remboursement: { etat: 'en_cours', montant: 12_500, refundKey: 'rf-x', collectRef: 'col-y' } });
    expect(got.status === 'order' && got.order.remboursement).toEqual({ etat: 'en_cours', montant: 12_500 });
  });
});

describe('renderC7 — the refund card', () => {
  const REEL = { step: 5, problem: false, demo: true, reel: true, commande: 'ord-1', voirCode: true, porte: true };

  it('en cours: the figure in the money bytes, where it goes, and no door or code left to open', () => {
    const html = renderC7({ ...REEL, remboursement: { etat: 'en_cours', montant: 12_500 } });
    expect(html).toContain('data-role="remboursement"');
    expect(html).toContain('data-etat="en-cours"');
    expect(html).toContain(`12${NNBSP}500${NNBSP}FCFA vous reviennent`);
    expect(html).toContain(t('cl.remboursement.en_cours_corps'));
    expect(html).not.toContain('data-action="voir-code"');
    expect(html).not.toContain('data-action="porte"');
    expect(html).not.toContain('data-role="frais-gardes"');
  });

  it('fait: « Remboursement fait », the done sentence, and the kept fee explained when there is one', () => {
    const html = renderC7({ ...REEL, remboursement: { etat: 'fait', montant: 11_500, fraisGardes: 1_000 } });
    expect(html).toContain('data-etat="fait"');
    expect(html).toContain(`Remboursement fait\u00a0:\u00a011${NNBSP}500${NNBSP}FCFA`);
    expect(html).not.toContain('vous reviennent');
    expect(html).toContain(t('cl.remboursement.fait_corps'));
    expect(html).toContain('data-role="frais-gardes"');
    expect(html).toContain(`1${NNBSP}000${NNBSP}FCFA`);
    expect(html).not.toContain(t('cl.remboursement.en_cours_corps'));
  });

  it('without a refund the screen is unchanged — the door and code roads stay where they were', () => {
    const html = renderC7(REEL);
    expect(html).not.toContain('data-role="remboursement"');
    expect(html).toContain('data-action="voir-code"');
    expect(html).toContain('data-action="porte"');
  });
});
