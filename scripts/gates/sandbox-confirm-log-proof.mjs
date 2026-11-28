#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

/**
 * PROOF that the founder's sandbox confirm tool keeps its public log clean.
 *
 * The tool runs in a GitHub Actions job of this PUBLIC repository, so what it
 * prints, anyone can read. This runs the REAL scripts/sandbox-payment-confirm.mjs
 * against a local HTTP server standing in for the storefront Worker, through
 * every road it has (an order, an order paid in a group, a refund, an unknown
 * order, a refused webhook), and asserts the output never carries an order id,
 * a group id, a provider key, a refund key or an amount — while still saying
 * what happened (CONFIRMED, REFUNDED, the named refusals).
 *
 * Bounds of the stand-in, stated so nothing more is claimed: it answers the
 * routes the tool calls with fixed bodies shaped like the Worker's; it holds
 * no vault and checks no money. Whether the real Worker accepts what the tool
 * sends is the seam test's job (services/storefront-service/test/
 * sandbox-payment-confirm.e2e.test.ts), not this proof's.
 * Exit 0 when every road is clean, 1 otherwise.
 */
const script = resolve('scripts/sandbox-payment-confirm.mjs');
const ORDER = 'ord-q-PROOFORDER7731';
const GROUP = 'grp-PROOFGROUP5519';
const IN_GROUP = 'ord-q-PROOFMEMBER4402';
const UNKNOWN = 'ord-q-PROOFUNKNOWN8866';
const REFUSED = 'ord-q-PROOFREFUSED2290';
const LEG = 'legkey-PROOF-6612';
const REFUND_KEY = 'refundkey-PROOF-3307';
const AMOUNTS = ['13579', '2468', '9753'];
const NEVER = [ORDER, GROUP, IN_GROUP, UNKNOWN, REFUSED, LEG, REFUND_KEY, 'PROOFORDER', 'PROOFGROUP', 'PROOFMEMBER', 'PROOFUNKNOWN', 'PROOFREFUSED', ...AMOUNTS];

const state = new Map([[ORDER, 'payment_pending'], [GROUP, 'payment_pending'], [REFUSED, 'payment_pending']]);
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const id = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    const view = (k) => ({ orderId: k, state: state.get(k), amountPaidAtCheckout: 13579, amountDueAtDelivery: 2468 });
    if (url.pathname.startsWith('/checkout/webhook/leg-key/')) {
      if (id === IN_GROUP) return json(res, 200, { groupId: GROUP, legKey: LEG });
      if (!state.has(id)) return json(res, 404, { error: 'unknown_order', orderId: id });
      return json(res, 200, { legKey: LEG, orderId: id, amount: 13579 });
    }
    if (url.pathname.startsWith('/checkout/webhook/order/') || url.pathname.startsWith('/checkout/group/')) {
      if (!state.has(id)) return json(res, 404, { error: 'unknown_order', orderId: id });
      return json(res, 200, view(id));
    }
    if (url.pathname === '/checkout/webhook/payment') {
      const ev = JSON.parse(raw);
      const k = ev.payload.order_id;
      if (k === REFUSED) return json(res, 409, { error: 'amount_mismatch', orderId: k, expected: 13579, got: 9753 });
      state.set(k, 'confirmed');
      return json(res, 200, { ok: true, orderId: k, amount: 13579, legKey: LEG });
    }
    if (url.pathname.startsWith('/checkout/webhook/refund-key/')) {
      return json(res, 200, { remboursements: [{ refundKey: REFUND_KEY, collectRef: `collect-${LEG}`, amount: 9753, legType: 'checkout' }] });
    }
    if (url.pathname === '/checkout/webhook/refund') {
      state.set(ORDER, 'refunded');
      return json(res, 200, { ok: true, refundKey: REFUND_KEY, amount: 9753, orderId: ORDER });
    }
    json(res, 404, { error: 'no_route' });
  });
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const run = (orderId, remboursement = 'false') => new Promise((done) => {
  const child = spawn(process.execPath, [script], {
    env: { PATH: process.env.PATH, STOREFRONT_BASE: base, ORDER_ID: orderId, REMBOURSEMENT: remboursement, SANDBOX_CONFIRM_SECRET: 'proof-secret-not-real' },
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', (exit) => done({ exit, out }));
});

const failures = [];
const expect = async (name, p, exit, needle) => {
  const r = await p;
  const leaked = NEVER.filter((n) => r.out.includes(n));
  if (r.exit !== exit || !r.out.includes(needle)) {
    failures.push(`${name}: wanted exit ${exit} with « ${needle} », got exit ${r.exit}: ${r.out.trim()}`);
  } else if (leaked.length > 0) {
    failures.push(`${name}: the public log carries ${leaked.join(', ')}:\n      ${r.out.trim().replace(/\n/g, '\n      ')}`);
  } else {
    console.log(`  ok — ${name} (exit ${exit}, no id, key or amount printed)`);
  }
};

await expect('an order confirmed', run(ORDER), 0, 'CONFIRMED');
await expect('the same order again', run(ORDER), 0, 'ALREADY CONFIRMED');
await expect('an order paid in a group, confirmed as its group', run(IN_GROUP), 0, 'CONFIRMED');
await expect('an unknown order', run(UNKNOWN), 1, 'NO SUCH ORDER');
await expect('a webhook the Worker refuses', run(REFUSED), 1, 'WEBHOOK REFUSED');
state.set(ORDER, 'refused');
await expect('a refund confirmed', run(ORDER, 'true'), 0, 'REFUNDED');

server.close();
if (failures.length > 0) {
  console.error(`sandbox-confirm-log-proof FAILED — ${failures.length} road(s) print what a public log must not:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('sandbox-confirm-log-proof OK — every road says what happened and prints no order id, key or amount');
