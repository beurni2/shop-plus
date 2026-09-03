import { describe, expect, it } from 'vitest';
import orderRouter from '../worker/order-do';

/**
 * ═══ COMMANDE-REJOUER-1 — THE ROUTER CARRIES THE EXPIRED READ DOWN ═══
 *
 * The object's clock-free replay road is proven end to end across the real
 * 2-minute hold TTL (`rejouer-commande.e2e.test.ts`) — but the 15-MINUTE
 * quote expiry cannot be crossed against a real workerd clock, and the first
 * verifier pass proved the claim « barred by the same bypass » false at THIS
 * layer: the router refused `expired` before the object was ever reached.
 * This file drives the REAL router with the two namespaces doubled at their
 * own internal wire, and pins the three facts that make the claim true:
 *   · an `expired` vault read is FORWARDED to the object, with NO bytes;
 *   · every refusal on that road keeps today's public name, `expired`;
 *   · the fresh road is byte-identical to before (bytes forwarded).
 *
 * THE DOUBLES' BOUNDS, stated: the CHECKOUT double answers exactly the
 * vault's own expired shape (`checkout-do.ts` `/entry`: `{ok:false,
 * reason:'expired', intent}`, 422 — no `canonicalBytes`, which is the whole
 * point); the ORDER double answers the object's own create shapes
 * (`{ok:true, view, buyerRef}` / `{ok:false, reason}`) and records what it
 * was asked. Only the two DO namespaces are doubled — the router under test
 * is the shipped code.
 */

const CORPS = {
  quoteId: 'quote-rejoue-1',
  holderRef: 'holder-1',
  commandId: 'cmd-order-1',
};

const VUE = { orderId: 'ord-quote-rejoue-1', state: 'payment_pending', amountPaidAtCheckout: 12_500, amountDueAtDelivery: 0, doorLeg: 'none' };

function stubNamespace(reponse: (path: string, body: Record<string, unknown> | null) => Response) {
  const appels: { path: string; body: Record<string, unknown> | null }[] = [];
  return {
    appels,
    ns: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (req: Request): Promise<Response> => {
          const path = new URL(req.url).pathname;
          const body = req.method === 'POST' ? ((await req.json().catch(() => null)) as Record<string, unknown> | null) : null;
          appels.push({ path, body });
          return reponse(path, body);
        },
      }),
    },
  };
}

const EXPIRE = (): Response => Response.json({ ok: false, reason: 'expired', intent: '' }, { status: 422 });

async function poster(env: Record<string, unknown>) {
  const res = await orderRouter.fetch(
    new Request('http://c/checkout/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(CORPS) }),
    env as never,
  );
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text) as Record<string, unknown> };
}

describe('the expired road reaches the object', () => {
  it('an expired vault read is FORWARDED with no bytes, and the cached answer flows back 200 with her buyerRef', async () => {
    const checkout = stubNamespace(EXPIRE);
    const order = stubNamespace(() => Response.json({ ok: true, view: VUE, buyerRef: 'ref-de-suivi' }));
    const res = await poster({ CHECKOUT: checkout.ns, ORDER: order.ns });
    expect(res.status, res.text).toBe(200);
    expect(res.json['buyerRef']).toBe('ref-de-suivi');
    // the object WAS asked — the fact the first verifier proved false —
    const cree = order.appels.find((a) => a.path === '/entry/create');
    expect(cree, 'the object was never reached').toBeDefined();
    // — and asked WITHOUT bytes: the vault held none back to carry, and a
    // fabricated byte-string here would be a price nobody stored.
    expect('quoteBytes' in (cree!.body ?? {})).toBe(false);
    expect(cree!.body?.['commandId']).toBe(CORPS.commandId);
    expect(cree!.body?.['holderRef']).toBe(CORPS.holderRef);
  });

  it("every refusal on the expired road keeps today's public name: the object's quote_expired and quote_unknown both surface as « expired »", async () => {
    for (const reason of ['quote_expired', 'quote_unknown']) {
      const checkout = stubNamespace(EXPIRE);
      const order = stubNamespace(() => Response.json({ ok: false, reason }, { status: 422 }));
      const res = await poster({ CHECKOUT: checkout.ns, ORDER: order.ns });
      expect(res.status, res.text).toBe(422);
      expect(res.json['error'], reason).toBe('expired');
    }
  });

  it('the FRESH road is untouched: bytes forwarded verbatim, and a refusal keeps its own name', async () => {
    const BYTES = JSON.stringify({ id: CORPS.quoteId });
    const checkout = stubNamespace(() => Response.json({ ok: true, quote: { paymentMode: 'FULL_PREPAY' }, canonicalBytes: BYTES, intent: '' }));
    const order = stubNamespace(() => Response.json({ ok: false, reason: 'reservation_expired' }, { status: 422 }));
    const res = await poster({ CHECKOUT: checkout.ns, ORDER: order.ns });
    expect(res.status).toBe(422);
    expect(res.json['error']).toBe('reservation_expired');
    const cree = order.appels.find((a) => a.path === '/entry/create');
    expect(cree!.body?.['quoteBytes']).toBe(BYTES);
  });
});
