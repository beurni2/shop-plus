/**
 * ═══ SANDBOX-PAY-1 — the sandbox provider's MISSING HALF, in the founder's hand ═══
 *
 * WHY THIS EXISTS. The deployed Worker charges every order against the certified
 * in-process sandbox provider (`payment-port.ts`) — but nothing has ever played
 * the provider's OTHER half: delivering the confirmation webhook. So every real
 * order a buyer creates on the deployed PWA sits in `payment_pending` forever,
 * and no console ever lights up. This script is that other half: the founder
 * dispatches it (via `.github/workflows/sandbox-payment.yml`) with an order id,
 * and it does exactly what a real aggregator's callback would do — POST a
 * canon-shaped `payment.checkout_leg_confirmed.v1` to the ONE route that can
 * declare money received, holding the ONE secret that opens it.
 *
 * WHAT IT DOES NOT DO. It does not touch the Worker, the vault, the canon, or
 * the money waterfall — the webhook route, its secret, and every franc-exact
 * check it faces were built in SP3.3a and are exercised unchanged. Ten Laws #2
 * holds: the webhook remains the only payment truth; the buyer's screen moves
 * only because the vault accepted this event. The aggregator Decision (⏳,
 * Build Spec §12) stays open and untouched: no provider is named, no credential
 * exists, and this whole file RETIRES at the Real-Money Gate when a real
 * aggregator takes over the half it stands in for.
 *
 * WHAT THE VAULT VALIDATES — read from it, not assumed (`order-spine.ts`,
 * onProviderPaymentEvent): the canon envelope, the event name,
 * `correlation_id === corr-<orderId>` (minted deterministically at order
 * create, order-do.ts), state `payment_pending`, `amount ===
 * quote.amountPaidAtCheckout` TO THE FRANC, a funded status — and, since
 * NB-3 (E2), that `payment_attempt_id` NAMES THE LEG'S PROVIDER KEY, the id
 * the order actually charged with. A real aggregator knows that key because
 * we charged it with one; this stand-in reads it from the secret-gated
 * `GET /checkout/webhook/leg-key/{orderId}` before composing. The amount is
 * read off the order's own public view — the same figure the buyer saw.
 *
 * IDEMPOTENT BY CONSTRUCTION: the envelope `command_id` is derived from the
 * order id alone, so a double dispatch is the provider redelivering the same
 * webhook — which the vault ABSORBS (one leg, one payment, proven in
 * sp33a-order-path.mjs). A founder double-tap cannot double-confirm.
 */

export const SANDBOX_ACTOR = 'payment-provider:sandbox';

/**
 * The event a sandbox provider would deliver for this order's checkout leg.
 * Field-for-field the shape the certified mock emits (`payment-provider-mock.ts`,
 * webhookDeliveryPlan) — mirrored, not imported, so this file runs with zero
 * dependencies on a bare `node` in the workflow. The seam test in
 * `services/storefront-service/test/sandbox-payment-confirm.e2e.test.ts` holds
 * this composition to the REAL Worker's acceptance, so a drift between the two
 * fails CI rather than failing the founder.
 *
 * THE WIRE BODY IS THE BARE EVENT — the route parses the request body with
 * `PlatformEventSchema` directly and adds its own `{event}` wrap when handing
 * it to the object. My first cut wrapped it here too, and the real Worker
 * refused it `malformed_event` — caught by the seam test, exactly its job.
 */
export function composeSandboxConfirmation(orderId, amount, nowIso, legKey) {
  return {
    name: 'payment.checkout_leg_confirmed.v1',
    envelope: {
      // Deterministic from the order: a re-dispatch is a REDELIVERY, absorbed.
      command_id: `whk-sandbox-${orderId}`,
      correlation_id: `corr-${orderId}`,
      aggregateVersion: 1,
      actor: SANDBOX_ACTOR,
      serverTime: nowIso,
      version: '1',
    },
    payload: {
      provider: 'sandbox-provider',
      // NB-3: the charge the order ACTUALLY initiated — the vault refuses any other name.
      payment_attempt_id: legKey,
      collectRef: `collect-${legKey}`,
      // Echoed from the order's OWN view — the vault refuses a franc short.
      amount,
      fee: 0,
      status: 'held',
      order_id: orderId,
      redelivery: false,
    },
  };
}

/** The header the webhook gate reads (`auth.ts` PAYMENT_WEBHOOK_KEY_HEADER). */
export const WEBHOOK_KEY_HEADER = 'X-Payment-Webhook-Key';

async function main() {
  const base = (process.env.STOREFRONT_BASE ?? '').trim().replace(/\/+$/, '');
  const orderId = (process.env.ORDER_ID ?? '').trim();
  const secret = process.env.PAYMENT_WEBHOOK_SECRET ?? '';
  if (base === '' || orderId === '' || secret === '') {
    console.error('missing STOREFRONT_BASE, ORDER_ID or PAYMENT_WEBHOOK_SECRET');
    process.exit(2);
  }

  const view = async () => {
    const res = await fetch(`${base}/checkout/order/${encodeURIComponent(orderId)}`);
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };

  // ── the order, before ────────────────────────────────────────────────────
  const before = await view();
  if (before.status === 404) {
    console.error(`NO SUCH ORDER: ${orderId} — check the id (it starts with ord-).`);
    process.exit(1);
  }
  if (before.status !== 200) {
    console.error(`order read failed: HTTP ${before.status} ${JSON.stringify(before.body)}`);
    process.exit(1);
  }
  const state = String(before.body.state ?? '');
  const amount = Number(before.body.amountPaidAtCheckout);
  console.log(`order ${orderId}: state=${state} · amountPaidAtCheckout=${amount} FCFA · amountDueAtDelivery=${Number(before.body.amountDueAtDelivery)} FCFA`);

  if (state === 'confirmed') {
    console.log('ALREADY CONFIRMED — nothing to do. (A redelivery would be absorbed; not sending one.)');
    return;
  }
  if (state !== 'payment_pending') {
    console.error(`REFUSING: the order is '${state}', not 'payment_pending' — a sandbox confirmation here would be refused by the vault (out_of_order). Nothing was sent.`);
    process.exit(1);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error(`REFUSING: the order view names no positive amountPaidAtCheckout (${String(before.body.amountPaidAtCheckout)}). Nothing was sent.`);
    process.exit(1);
  }

  // ── the key the provider must echo (NB-3) ────────────────────────────────
  const keyRes = await fetch(`${base}/checkout/webhook/leg-key/${encodeURIComponent(orderId)}?leg=checkout`, {
    headers: { [WEBHOOK_KEY_HEADER]: secret },
  });
  const keyBody = await keyRes.json().catch(() => ({}));
  if (keyRes.status === 401) {
    console.error('KEY READ REFUSED 401 — PAYMENT_WEBHOOK_SECRET here does not match the deployed Worker. Re-run the payment-webhook-secret workflow, then this one.');
    process.exit(1);
  }
  if (keyRes.status !== 200 || typeof keyBody.legKey !== 'string') {
    console.error(`KEY READ FAILED: HTTP ${keyRes.status} ${JSON.stringify(keyBody)} — a payment_pending order always holds its checkout leg key; investigate before retrying. Nothing was sent.`);
    process.exit(1);
  }

  // ── the provider's half ──────────────────────────────────────────────────
  const res = await fetch(`${base}/checkout/webhook/payment`, {
    method: 'POST',
    headers: { [WEBHOOK_KEY_HEADER]: secret, 'Content-Type': 'application/json' },
    body: JSON.stringify(composeSandboxConfirmation(orderId, amount, new Date().toISOString(), keyBody.legKey)),
  });
  const answer = await res.json().catch(() => ({}));
  if (res.status === 401) {
    console.error('WEBHOOK REFUSED 401 — PAYMENT_WEBHOOK_SECRET here does not match the deployed Worker. Re-run the payment-webhook-secret workflow, then this one.');
    process.exit(1);
  }
  if (res.status !== 200) {
    console.error(`WEBHOOK REFUSED: HTTP ${res.status} ${JSON.stringify(answer)} — nothing moved.`);
    process.exit(1);
  }
  console.log(`webhook accepted: ${JSON.stringify(answer)}`);

  // ── the order, after — the vault's word, not the response's ─────────────
  const after = await view();
  const afterState = String(after.body.state ?? '');
  console.log(`order ${orderId}: state=${afterState}`);
  if (afterState !== 'confirmed') {
    console.error('the webhook answered 200 but the order did not reach confirmed — investigate before retrying.');
    process.exit(1);
  }
  console.log('CONFIRMED. The buyer sees it paid; the Boutik+ board and the Séra funding fact follow by outbox (at-least-once, within about a minute).');
}

// Import-safe: the seam test imports the composition without running this.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
