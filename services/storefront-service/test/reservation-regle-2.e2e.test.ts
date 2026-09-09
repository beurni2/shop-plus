import { rmSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { cleC } from './seance';
import { offerDouble, porteRegle, regleWorker, sha256Hex, type PorteBoutik } from './regle-helpers';

/**
 * ═══ RESERVATION-REGLE-2 — the net's live arm, the supplier-notification
 * watch (E2 « paid-order-no-supplier-decision », F-96) and the dead-letter
 * acknowledgement, on the REAL combined Worker, the LEDGER asked after every
 * act ═══
 *
 * REGLE-1's verifier named what the seam could not reach: the reconciliation
 * net was evaluated only on a release ANSWER, and the vault never answers a
 * release with `reserved` — so the one world the net exists for (a release
 * that did not deliver while the hold stays held) was never judged; a full
 * dead-letter book stayed full until a deploy; and `paid` had no watch. This
 * file reaches all three through the doors:
 *
 *  (1) THE NET'S LIVE ARM. CheckoutDO's certified fault (`CHECKOUT_SANDBOX_
 *      BEHAVIOR`, the same shape of knob as the provider's) refuses the FIRST
 *      release with a 503. The row stays pending with its attempt count, the
 *      order object reads the LIVE hold and the net fires — naming the hold
 *      the order was born with — and the alert told the truth: her fresh hold
 *      is refused. Her retry re-arms the alarm; the fault budget is spent; the
 *      release delivers, naming its own hold; the net says nothing more.
 *
 *  (2) THE SUPPLIER-NOTIFICATION WATCH. An order never RESTS in `paid` here —
 *      the confirm lands in the webhook's own batch — so what can stall is the
 *      supplier ever LEARNING. The Boutik+ door double answers 503 (an outage,
 *      counted): the order confirms, its order.confirmed.v1 stays pending, and
 *      past the TTL exactly one `saga.stuck.v1` names the wire.
 *
 *  (3) THE ACKNOWLEDGEMENT. The founder reads a parked body and acknowledges
 *      it on key C: the entry leaves the book, its digest and reason stay under
 *      `acknowledged`, the id is never reused, and every wrong door is closed.
 */

const STUCK_TTL_MS = 1_500;
const porte: PorteBoutik = { supplier: false, refusals: 0 };
const { mf, persist } = regleWorker({
  persistPrefix: 'reservation-regle-2-',
  bindings: {
    PAYMENT_SANDBOX_BEHAVIOR: JSON.stringify({ timeoutFirstNInitiates: 1 }),
    // The release wire's certified fault: the FIRST release each quote receives is a 503.
    CHECKOUT_SANDBOX_BEHAVIOR: JSON.stringify({ refuseFirstNReleases: 1 }),
    STUCK_SAGA_TTL_MS: String(STUCK_TTL_MS),
  },
  offer: offerDouble(porte),
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});
const { audit, jusqua, creerCommande, reserver, retenter, postWebhook, livreParque, webhookPour } = porteRegle(mf);

const HELD = 'reservation_held_after_payment_failure';
const heldAlerts = (a: Awaited<ReturnType<typeof audit>>) =>
  (a.reconAlerts ?? []).filter((x) => x.name === 'reconciliation.alert.v1' && x.payload['alert'] === HELD);

describe('RESERVATION-REGLE-2 — (1) the net judges the LIVE hold when the release does not deliver', () => {
  it('a refused release leaves the row pending, the net names the hold the order was born with, her fresh hold is refused — then the retry lets the release deliver and the net falls silent', async () => {
    const une = await creerCommande('0021');
    expect(une.state, 'the first charge times out (PAYMENT_SANDBOX_BEHAVIOR)').toBe('payment_failed');

    // The first release is answered 503 by the certified fault: NOT an answer.
    const jugee = await jusqua(une.orderId, (a) => heldAlerts(a).length > 0);
    expect(jugee.release?.status, JSON.stringify(jugee.release)).toBe('pending');
    expect(jugee.release?.attempts).toBeGreaterThanOrEqual(1);
    expect(jugee.release?.reservationId, 'the row names the hold it is for').toBe(une.firstReservationId);
    const alerte = heldAlerts(jugee);
    expect(alerte).toHaveLength(1);
    expect(alerte[0]!.payload['reservation_id_held'], 'the net judged THIS order\'s hold, read live').toBe(une.firstReservationId);
    expect(alerte[0]!.envelope.command_id).toBe(`recon-alert-${une.quoteId}`);

    // The alert told the truth: the hold is still held, so a fresh one is refused.
    const encore = await reserver(une.quoteId, une.holderRef, 'cmd-fresh-0021');
    expect(encore.status, JSON.stringify(encore.body)).toBe(409);

    // Her retry re-arms the alarm (the stuck watch's TTL); the fault budget is
    // spent; the release delivers, naming its own hold, and it is released.
    const retry = await retenter(une.quoteId, une.holderRef, 'cmd-order-0021-retry');
    expect(retry.status, String(retry.state)).toBe(200);
    expect(retry.state).toBe('payment_pending');
    const livre = await jusqua(une.orderId, (a) => a.release?.status === 'delivered');
    expect(livre.release?.status, JSON.stringify(livre.release)).toBe('delivered');
    expect(livre.release?.decision?.ok).toBe(true);
    expect(livre.release?.decision?.state).toBe('released');
    // ONE alert, never a second: the net is silent once the hold is free.
    expect(heldAlerts(livre)).toHaveLength(1);
    const libre = await reserver(une.quoteId, une.holderRef, 'cmd-fresh-0021-bis');
    expect(libre.status).toBe(200);
    expect(libre.body.status).toBe('reserved');
  }, 30_000);
});

describe('RESERVATION-REGLE-2 — (2) the supplier-notification watch, on the real Worker', () => {
  it('a confirmed order whose order.confirmed.v1 cannot reach Boutik+ raises saga.stuck.v1 EXACTLY ONCE past the TTL, naming the wire', async () => {
    porte.supplier = true;
    try {
      const deux = await creerCommande('0022');
      expect(deux.state).toBe('payment_failed');
      const retry = await retenter(deux.quoteId, deux.holderRef, 'cmd-order-0022-retry');
      expect(retry.state).toBe('payment_pending');
      const a = await audit(deux.orderId);
      const legKey = a.legKeys?.['checkout'];
      expect(typeof legKey, JSON.stringify(a.legKeys)).toBe('string');

      const bon = await postWebhook(webhookPour(deux, legKey as string, {}));
      expect(bon.status, await bon.clone().text()).toBe(200);
      const confirmee = await jusqua(deux.orderId, (x) => x.state === 'confirmed');
      expect(confirmee.state).toBe('confirmed');

      // The first wire knocks and is refused; past the TTL the watch fires, once.
      const stuck = await jusqua(deux.orderId, (x) => x.stuckSupplier !== null && x.stuckSupplier !== undefined);
      expect(stuck.stuckSupplier ?? null, 'the watch fired on the alarm (undefined is a missing field, not a mark)').not.toBeNull();
      expect(porte.refusals, 'the wire really knocked on the door').toBeGreaterThanOrEqual(1);
      const alerts = (stuck.reconAlerts ?? []).filter(
        (x) => x.name === 'saga.stuck.v1' && x.payload['blocked_on'] === 'supplier_notification',
      );
      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.envelope.command_id).toBe(`saga-stuck-supplier-${deux.quoteId}`);
      expect(alerts[0]!.envelope.command_id).toBe(stuck.stuckSupplier!.commandId);
      expect(alerts[0]!.payload['stuck_in']).toBe('confirmed');
      expect(alerts[0]!.payload['notification_status']).toBe('pending');
      expect(alerts[0]!.payload['ttl_policy_version']).toBe('stuck-ttl.v1');
      expect(alerts[0]!.payload['order_id']).toBe(deux.orderId);
      expect(stuck.stuckSupplier!.notificationStatus).toBe('pending');
      expect(stuck.state, 'detection only — the order is untouched').toBe('confirmed');
    } finally {
      porte.supplier = false;
    }
  }, 30_000);
});

describe('RESERVATION-REGLE-2 — (4) a release names its hold, on the real CheckoutDO', () => {
  it('a release carrying ANOTHER reservation id frees nothing — reservation_mismatch by name, the hold still held', async () => {
    const quatre = await creerCommande('0024');
    expect(quatre.state).toBe('payment_failed');
    // Let the order's own release meet the certified fault first (the knob
    // refuses the FIRST release per quote), so this call is the second.
    const refusee = await jusqua(quatre.orderId, (a) => (a.release?.attempts ?? 0) >= 1);
    expect(refusee.release?.status).toBe('pending');
    const ns = await mf.getDurableObjectNamespace('CHECKOUT');
    const stub = ns.get(ns.idFromName(quatre.quoteId));
    const autre = await stub.fetch('https://do/entry/release', {
      method: 'POST',
      body: JSON.stringify({ commandId: 'rel-autre-0024', reason: 'payment_failed', reservationId: 'res-not-this-order' }),
    });
    expect(autre.status).toBe(200);
    expect(await autre.json()).toEqual({ ok: false, reason: 'reservation_mismatch' });
    const lu = (await (await stub.fetch('https://do/entry/reservation')).json()) as { ok?: boolean; state?: { status?: string; reservationId?: string } };
    expect(lu.ok).toBe(true);
    expect(lu.state?.status, 'still held — another order\'s release is not this hold\'s').toBe('reserved');
    expect(lu.state?.reservationId).toBe(quatre.firstReservationId);
    // The RIGHT id frees it, through the same road.
    const sienne = await stub.fetch('https://do/entry/release', {
      method: 'POST',
      body: JSON.stringify({ commandId: 'rel-sienne-0024', reason: 'payment_failed', reservationId: quatre.firstReservationId }),
    });
    expect(((await sienne.json()) as { state?: { status?: string } }).state?.status).toBe('released');
  }, 30_000);
});

describe('RESERVATION-REGLE-2 — (5) a failed RETRY releases the hold it was authorized on, not the one the order was born with', () => {
  // Its own Worker: TWO timeouts (the create AND the retry fail), no release
  // fault — the verifier's MAJOR on the first cut, which named the BIRTH hold
  // and would have left the retry's fresh hold to die by the TTL.
  const porteBis: PorteBoutik = { supplier: false, refusals: 0 };
  const bis = regleWorker({
    persistPrefix: 'reservation-regle-2-bis-',
    bindings: {
      PAYMENT_SANDBOX_BEHAVIOR: JSON.stringify({ timeoutFirstNInitiates: 2 }),
      STUCK_SAGA_TTL_MS: String(STUCK_TTL_MS),
    },
    offer: offerDouble(porteBis),
  });
  afterAll(async () => {
    await bis.mf.dispose();
    rmSync(bis.persist, { recursive: true, force: true });
  });
  const P = porteRegle(bis.mf);

  it('hold A released on the first failure; her fresh hold B; the retry fails on B; the row names B and B is released; a fresh hold C succeeds', async () => {
    const cinq = await P.creerCommande('0025');
    expect(cinq.state).toBe('payment_failed');
    const a = await P.jusqua(cinq.orderId, (x) => x.release?.status === 'delivered');
    expect(a.release?.reservationId, 'the first row names the birth hold — the create was authorized on it').toBe(cinq.firstReservationId);
    expect(a.release?.decision?.state).toBe('released');

    // Her fresh hold B refreshes her receipt (the owner's own hold, strictly later).
    const b = await P.reserver(cinq.quoteId, cinq.holderRef, 'cmd-fresh-0025-b');
    expect(b.status, JSON.stringify(b.body)).toBe(200);
    const holdB = b.body.reservationId as string;
    expect(holdB).not.toBe(cinq.firstReservationId);

    // The retry is authorized on B and its charge times out too.
    const retry = await P.retenter(cinq.quoteId, cinq.holderRef, 'cmd-order-0025-retry');
    expect(retry.status, JSON.stringify(retry.body)).toBe(200);
    expect(retry.state, 'the second initiate times out (budget 2)').toBe('payment_failed');
    const bRel = await P.jusqua(cinq.orderId, (x) => x.release?.status === 'delivered' && x.release?.reservationId === holdB);
    expect(bRel.release?.reservationId, 'the row names the hold the RETRY was authorized on').toBe(holdB);
    expect(bRel.release?.decision?.ok).toBe(true);
    expect(bRel.release?.decision?.state, 'B is released — not left to die by the TTL').toBe('released');

    // The proof the hold is free: her next hold succeeds at once.
    const c = await P.reserver(cinq.quoteId, cinq.holderRef, 'cmd-fresh-0025-c');
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    expect(c.body.status).toBe('reserved');
    expect(c.body.reservationId).not.toBe(holdB);
  }, 30_000);
});

describe('RESERVATION-REGLE-2 — (3) the acknowledgement, on key C', () => {
  it('an acknowledged entry leaves the book with its digest kept, its id is never reused, and every wrong door is closed', async () => {
    const torn = '{"name":"payment.checkout_leg_conf';
    expect((await postWebhook(torn)).status).toBe(400);
    const avant = await livreParque();
    const entry = (avant.book.entries ?? []).find((e) => e.original === torn);
    expect(entry, JSON.stringify(avant.book)).toBeDefined();
    const dejaReconnus = avant.book.acknowledged?.length ?? 0;

    const reconnaitre = (body: string, headers: Record<string, string> = cleC) =>
      mf.dispatchFetch('http://c/checkout/dlq/acknowledge', { method: 'POST', headers, body });

    // Wrong doors first: no key, a bad id — the book is untouched.
    expect((await reconnaitre(JSON.stringify({ parkId: entry!.parkId }), { 'Content-Type': 'application/json' })).status).toBe(401);
    expect((await reconnaitre(JSON.stringify({ parkId: 'park:dlq-1' }))).status).toBe(400);
    expect((await reconnaitre('{')).status).toBe(400);
    expect((await livreParque()).book.entries?.some((e) => e.parkId === entry!.parkId)).toBe(true);

    const ack = await reconnaitre(JSON.stringify({ parkId: entry!.parkId }));
    const ackBody = (await ack.json()) as { ok?: boolean; acknowledged?: string; sha256Hex?: string };
    expect(ack.status, JSON.stringify(ackBody)).toBe(200);
    expect(ackBody.acknowledged).toBe(entry!.parkId);
    expect(ackBody.sha256Hex).toBe(sha256Hex(torn));

    const apres = await livreParque();
    expect(apres.book.entries?.some((e) => e.parkId === entry!.parkId), 'the entry left the book').toBe(false);
    // The SLOT freed too, not only the key: the index's count follows the entries.
    expect(avant.book.held, 'a healthy book before').toBe(avant.book.entries?.length);
    expect(apres.book.held, 'the index let go of the id').toBe((avant.book.held ?? 0) - 1);
    expect(apres.book.held).toBe(apres.book.entries?.length);
    const reconnu = (apres.book.acknowledged ?? []).slice(dejaReconnus);
    expect(reconnu.map((r) => [r.parkId, r.sha256Hex, r.reason])).toEqual([[entry!.parkId, sha256Hex(torn), 'not_json']]);
    // A second acknowledgement of the same id has nothing to act on.
    expect((await reconnaitre(JSON.stringify({ parkId: entry!.parkId }))).status).toBe(404);

    // The next park counts PAST the acknowledged id — a storage key is never reused.
    const encore = '{"name":"payment.checkout_leg_conf","again":';
    expect((await postWebhook(encore)).status).toBe(400);
    const suite = (await livreParque()).book.entries?.find((e) => e.original === encore);
    expect(suite).toBeDefined();
    expect(Number(suite!.parkId.slice('dlq-'.length))).toBeGreaterThan(Number(entry!.parkId.slice('dlq-'.length)));
  }, 30_000);
});
