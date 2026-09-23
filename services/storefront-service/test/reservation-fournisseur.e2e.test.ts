import { rmSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { seance } from './seance';
import { offerDouble, porteRegle, regleWorker, safeJson, type PorteBoutik } from './regle-helpers';

/**
 * ═══ B5.1 (RESERVATION-FOURNISSEUR-1) — THE CALLING SIDE, on the REAL Worker ═══
 *
 * Founder ruling 2026-09-17: « private door ». When a buyer reserves, this
 * Worker asks Boutik+ for ONE unit under the same reservation id, over the
 * confirmed-order wire's own binding and credential; a payment that fails
 * gives the unit back through a durable row on the order's alarm.
 *
 * THE DOUBLE IS CONTRACT-CERTIFIED to the real door
 * (`boutik-plus/services/offer-service/test/stock-hold.e2e.test.ts`): every
 * answer it emits is a shape that suite asserts on real workerd. And it
 * RECORDS: the proof here is the bytes that left this Worker — the road, the
 * credential, the ids — never the presence of a port.
 */

const INTAKE_SECRET = 'test-intake-secret-0001';
const PV = 'pv-rr-1';
const T0 = '2026-09-18T08:00:00.000Z';

const porte: PorteBoutik = {
  supplier: false,
  refusals: 0,
  stock: new Map([[PV, 5]]),
  holds: new Map(),
  holdCalls: [],
  intakeSecret: INTAKE_SECRET,
};
const { mf, persist } = regleWorker({
  persistPrefix: 'reservation-fournisseur-',
  bindings: {
    PAYMENT_SANDBOX_BEHAVIOR: JSON.stringify({ timeoutFirstNInitiates: 1 }),
    FULFILLMENT_WRITE_SECRET: INTAKE_SECRET,
  },
  offer: offerDouble(porte),
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});
const { audit, jusqua, creerCommande, reserver } = porteRegle(mf);

const calls = () => porte.holdCalls ?? [];
const holdsOf = () => calls().filter((c) => c.road === 'hold');
const releasesOf = () => calls().filter((c) => c.road === 'release');

/** A shop + listing + quote, WITHOUT reserving — for the refusal cases. */
async function quoteSeule(n: string): Promise<{ quoteId: string; holderRef: string }> {
  const S = await seance(mf, `rf${n}`);
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-create-rf-${n}`, id: `sf-rf-${n}`, resellerId: S.accountId,
      shortCode: `RFOUR-${n}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
      category: 'Général', correlationId: `corr-rf-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status} ${await created.text()}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-listing-rf-${n}`, listingId: `lst-rf-${n}`, storefrontId: `sf-rf-${n}`,
      resellerId: S.accountId, productVersionId: PV, offerVersion: 'ov-rr-1',
      markup: 1_500, correlationId: `corr-rf-${n}`, at: T0,
    }),
  });
  if ((safeJson(await pub.text()) as { status?: string }).status !== 'published') throw new Error('setup: listing');
  const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: `rfour-${n}`, pid: PV, paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
      attributionResellerId: S.accountId, requestKey: `rk-rf-${n}-${'x'.repeat(12)}`,
    }),
  });
  const quote = safeJson(await quoteRes.text()) as { quoteId?: string };
  if (typeof quote.quoteId !== 'string') throw new Error(`setup: quote ${quoteRes.status}`);
  return { quoteId: quote.quoteId, holderRef: `holder-rf-${n}` };
}

describe('RESERVATION-FOURNISSEUR-1 — the reserve holds the unit on Boutik+', () => {
  it('a reserve knocks the hold door with the intake credential, the product, ITS OWN reservation id and the order id the quote will become', async () => {
    const { quoteId, holderRef } = await quoteSeule('0001');
    const r = await reserver(quoteId, holderRef, 'cmd-rf-01');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.status).toBe('reserved');
    const knocks = holdsOf();
    expect(knocks).toHaveLength(1);
    expect(knocks[0]!.auth).toBe(`Bearer ${INTAKE_SECRET}`);
    expect(knocks[0]!.body).toEqual({ productVersionId: PV, reservationId: r.body.reservationId, orderId: `ord-${quoteId}` });
    // the producer now holds it
    expect(porte.holds!.get(`${PV}|${r.body.reservationId}`)).toBe(`ord-${quoteId}`);
    // a replay of the SAME reserve command asks again and moves nothing (idempotent both sides)
    const again = await reserver(quoteId, holderRef, 'cmd-rf-01');
    expect(again.status).toBe(200);
    expect(again.body.reservationId).toBe(r.body.reservationId);
    expect(holdsOf()).toHaveLength(2);
    expect(porte.holds!.size).toBe(1);
  });

  it('the producer REFUSES (nobody’s unit left) ⇒ 422 out_of_stock, and the slot just taken is FREED — a later reserve on the same quote succeeds', async () => {
    const { quoteId, holderRef } = await quoteSeule('0002');
    porte.stock!.set(PV, 0);
    try {
      const r = await reserver(quoteId, holderRef, 'cmd-rf-02a');
      expect(r.status, JSON.stringify(r.body)).toBe(422);
      expect(r.body.error).toBe('out_of_stock');
      expect(porte.holds!.size, 'nothing held on the producer').toBe(1);
    } finally {
      porte.stock!.set(PV, 5);
    }
    // THE SLOT WAS RELEASED: a fresh command on the same quote reserves anew.
    // Had the slot stayed held, the vault would answer 409 already_reserved.
    const back = await reserver(quoteId, holderRef, 'cmd-rf-02b');
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect(back.body.status).toBe('reserved');
    expect(porte.holds!.size).toBe(2);
  });

  it('the producer’s SILENCE (an outage on the hold door) never blocks a reserve — it stands as before this slice', async () => {
    const { quoteId, holderRef } = await quoteSeule('0003');
    porte.holdOutage = true;
    try {
      const r = await reserver(quoteId, holderRef, 'cmd-rf-03');
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.status).toBe('reserved');
    } finally {
      porte.holdOutage = false;
    }
    expect(holdsOf().at(-1)!.body['reservationId'], 'the door was knocked').toBeDefined();
  });

  it('a PAYMENT FAILURE gives the unit back: the order’s ninth wire delivers the release, naming the hold, with the credential; the producer no longer holds it', async () => {
    const before = releasesOf().length;
    const c = await creerCommande('0004');
    expect(c.state, 'the first charge times out (PAYMENT_SANDBOX_BEHAVIOR)').toBe('payment_failed');
    // Held at reserve: the producer was ASKED to hold this reservation. Its
    // live map is not read here — the release wire may already have run on a
    // slow runner (ci 696 went red on exactly that race), and the release
    // itself is asserted below.
    expect(holdsOf().some((h) => h.body['reservationId'] === c.firstReservationId), 'held at reserve').toBe(true);
    const a = await jusqua(c.orderId, (x) => x.holdRelease?.status === 'delivered');
    expect(a.holdRelease).toMatchObject({
      status: 'delivered',
      commandId: expect.stringMatching(/^hrel-/),
      productVersionId: PV,
      reservationId: c.firstReservationId,
      answer: { status: 'released', httpStatus: 200 },
    });
    const rel = releasesOf().slice(before);
    expect(rel).toHaveLength(1);
    expect(rel[0]!.auth).toBe(`Bearer ${INTAKE_SECRET}`);
    expect(rel[0]!.body).toEqual({ productVersionId: PV, reservationId: c.firstReservationId, reason: 'payment_failed' });
    expect(porte.holds!.has(`${PV}|${c.firstReservationId}`), 'the unit is back').toBe(false);
    // …and the slot's own release (RESERVATION-REGLE) delivered beside it
    expect((await audit(c.orderId)).release?.status).toBe('delivered');
  });
});
