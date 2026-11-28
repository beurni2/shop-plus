import { describe, expect, it } from 'vitest';
import orderRouter from '../worker/order-do';

/**
 * ═══ SP6 — ON THE EXPIRED-QUOTE ROAD, A REFUND IN PROGRESS KEEPS ITS NAME ═══
 *
 * The router folds every refusal the object gives on the expired road back to
 * `expired`, whose screen tells her « Rien n'a été payé ». For an order whose
 * failed charge the provider collected, that sentence is false: her money is
 * on its way back. The 15-minute quote expiry cannot be crossed against a
 * real workerd clock, so this drives the SHIPPED router with its two
 * namespaces doubled at their own internal wire (the replay router test's
 * method); the object's own answer on this road is proven through the real
 * Worker in `paye-apres-echec.e2e.test.ts`.
 *
 * THE DOUBLES' BOUNDS: the CHECKOUT double answers exactly the vault's expired
 * shape (`{ok:false, reason:'expired', intent}`, 422, no bytes); the ORDER
 * double answers the object's own refusal shape (`{ok:false, reason}`) with
 * the status the object gives it. Nothing else is doubled.
 */

const CORPS = { quoteId: 'quote-pae-routeur-1', holderRef: 'holder-1', commandId: 'cmd-order-1' };

function stub(reponse: () => Response) {
  return { idFromName: (name: string) => name, get: () => ({ fetch: async (): Promise<Response> => reponse() }) };
}
const EXPIRE = (): Response => Response.json({ ok: false, reason: 'expired', intent: '' }, { status: 422 });

async function poster(objet: () => Response) {
  const res = await orderRouter.fetch(
    new Request('http://c/checkout/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(CORPS) }),
    { CHECKOUT: stub(EXPIRE), ORDER: stub(objet) } as never,
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe('the expired-quote road', () => {
  it('the object\'s « her money is being given back » crosses as itself: 409 paiement_rembourse, never expired', async () => {
    const r = await poster(() => Response.json({ ok: false, reason: 'paiement_rembourse' }, { status: 409 }));
    expect(`${r.status} ${String(r.json['error'])}`).toBe('409 paiement_rembourse');
  }, 10_000);

  it('every other refusal on that road still reads expired', async () => {
    for (const reason of ['quote_expired', 'quote_unknown', 'reservation_expired']) {
      const r = await poster(() => Response.json({ ok: false, reason }, { status: 422 }));
      expect(`${r.status} ${String(r.json['error'])}`, reason).toBe('422 expired');
    }
  }, 10_000);
});
