import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildSync } from 'esbuild';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, cleC } from './seance';
import { offerDouble, porteRegle, regleWorker, safeJson, sleep } from './regle-helpers';

/**
 * ═══ THE FOUNDER SEES WHAT NEEDS CHECKING ON HIS COMMANDES TAB ═══
 *
 * Execution Contract §6 names what must raise an alert; §8 item 7 says alerts
 * reach a named operator; Shop-Plus-Build-Spec §7 SP6 says a refund that cannot
 * finish by itself is told to the founder on his console. Every order object
 * already keeps the alerts it raised in one durable record. This seam proves
 * that record now reaches him: each order's key-C dispatch row carries what
 * there is to check — a class and a time per item, the count the record's cap
 * could not keep, and nothing else — and the dead-letter book answers a count.
 *
 * The real combined Worker on miniflare. The orders are walked through the
 * buyer's own doors; the certified sandbox provider times out every order's
 * FIRST charge (the same knob a deploy could set). The rows are read through
 * the Boutik+ console's OWN dispatch port and its fetch (imported from the
 * Boutik+ clone), never by a hand-built row. When the clone is absent — as in
 * this repository's CI, which checks out one repository — the console half
 * SKIPS with the reason in its title, and a green run never reads as proven.
 *
 * What the test controls is pinned: every provider webhook carries the test's
 * own fixed clock, so those times are asserted exactly. Order numbers (minted
 * by the Worker from the OS random source) and the Worker's own alarm times
 * cannot be pinned from outside it; the captured bytes the console walk reads
 * are therefore written ONLY by this seam (`ECRIRE_CAPTURE=1`), and every run
 * asserts the live bytes hold the captured shape order by order.
 */

const STUCK_TTL_MS = 1_500;
/** The test's own clock, carried by every provider webhook it sends. */
const T_WEBHOOK = '2026-11-26T09:30:00.000Z';
const SERA_SECRET = 'test-progress-sera-secret-o2-0001';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const base = offerDouble({ supplier: false, refusals: 0 });
const { mf, persist } = regleWorker({
  persistPrefix: 'a-verifier-',
  bindings: {
    PAYMENT_SANDBOX_BEHAVIOR: JSON.stringify({ timeoutFirstNInitiates: 1 }),
    STUCK_SAGA_TTL_MS: String(STUCK_TTL_MS),
    SERA_PROGRESS_SECRET: SERA_SECRET,
  },
  // Boutik+'s refused-delivery door, answered as its real door answers an
  // order it does not know (the regle double has no such road).
  offer: async (request) =>
    new URL(request.url).pathname === '/fulfillment/delivery-refused'
      ? Response.json({ ok: true, status: 'unknown_order' })
      : base(request),
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});
const { audit, jusqua, creerCommande, retenter, postWebhook } = porteRegle(mf);

/* ─────────────── the Boutik+ console, from its own clone ─────────────── */

const ICI = dirname(fileURLToPath(import.meta.url));
const BOUTIK = (() => {
  const brut = process.env['BOUTIK_PLUS_REPO'];
  return brut !== undefined && brut.trim() !== '' ? resolve(brut.trim()) : resolve(ICI, '../../../../boutik-plus');
})();
const PORT_CONSOLE = join(BOUTIK, 'apps/supplier-app/src/operations/dispatch-service.ts');
const CAPTURE = join(BOUTIK, 'apps/supplier-app/test/fixtures/a-verifier-lignes.json');
const raisonSaut = existsSync(PORT_CONSOLE)
  ? null
  : `pas de clone boutik-plus à ${BOUTIK} (clone boutik-plus à côté de ce dépôt ou BOUTIK_PLUS_REPO)`;
const titre = (t: string): string => (raisonSaut === null ? t : `${t} — SAUTÉ : ${raisonSaut}`);

interface ConsolePort {
  listLivraisons(cle: string): Promise<{ ok: boolean; rows?: { orderId: string; aVerifier?: unknown; remboursement?: unknown }[]; reason?: string }>;
  compterDlq(cle: string): Promise<{ ok: boolean; n?: number; reason?: string }>;
}
/** The console's own source, bundled as it stands in its clone (this runner
 *  will not load a file outside its own root), then imported unchanged. */
function consolePort(): ConsolePort {
  const out = join(mkdtempSync(join(tmpdir(), 'console-port-')), 'dispatch-service.cjs');
  buildSync({ entryPoints: [PORT_CONSOLE], bundle: true, format: 'cjs', platform: 'node', outfile: out, logLevel: 'silent' });
  const mod = createRequire(import.meta.url)(out) as { resolveDispatchService: () => ConsolePort | null };
  const port = mod.resolveDispatchService();
  if (port === null) throw new Error('the console resolved no dispatch port');
  return port;
}

/** The console's fetch, routed to the real Worker; every page's bytes kept as served. */
const pages: string[] = [];
beforeAll(() => {
  process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
  (globalThis as { fetch: unknown }).fetch = async (url: string, init?: RequestInit) => {
    const { signal: _signal, ...rest } = init ?? {};
    const res = await mf.dispatchFetch(url, rest as never);
    const text = await res.text();
    if (new URL(url).pathname === '/checkout/dispatch') pages.push(text);
    return new Response(text, { status: res.status, headers: res.headers as unknown as HeadersInit });
  };
});

/* ─────────────── the roads that raise each item ─────────────── */

/** A checkout webhook for an order's leg, on the test's own clock. */
const webhook = (orderId: string, legKey: string, amount: number | undefined, id: string) =>
  JSON.stringify({
    name: 'payment.checkout_leg_confirmed.v1',
    envelope: {
      command_id: id, correlation_id: `corr-${orderId}`, aggregateVersion: 1,
      actor: 'sandbox:founder', serverTime: T_WEBHOOK, version: '1',
    },
    payload: {
      provider: 'sandbox-provider', payment_attempt_id: legKey, collectRef: `collect-${orderId}`,
      amount, fee: 0, status: 'held', order_id: orderId, redelivery: false,
    },
  });

const leg = async (orderId: string): Promise<string> => {
  const key = (await audit(orderId)).legKeys?.['checkout'];
  if (typeof key !== 'string') throw new Error(`setup: no checkout leg for ${orderId}`);
  return key;
};

/** Created, its first charge timed out, the hold released. */
async function echouee(n: string) {
  const o = await creerCommande(n);
  if (o.state !== 'payment_failed') throw new Error(`setup: ${n} is ${o.state}`);
  await jusqua(o.orderId, (a) => a.release?.status === 'delivered');
  return o;
}
/** …then retried into payment_pending: the provider holds a live charge. */
async function enAttente(n: string) {
  const o = await echouee(n);
  const r = await retenter(o.quoteId, o.holderRef, `cmd-order-${n}-retry`);
  if (r.state !== 'payment_pending') throw new Error(`setup: retry ${n} is ${String(r.state)}`);
  return o;
}

const garbledRefusal = (orderId: string) => ({
  name: 'delivery.refused.v1',
  envelope: {
    command_id: `door-garbled-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 9,
    actor: 'custody-service:e1', serverTime: '2026-11-26T10:00:00.000Z', version: '1',
  },
  payload: { order_id: orderId, task_id: `task-${orderId}`, quoi: 'inconnu' },
});

/* ─────────────── the world, built once ─────────────── */

const roles: Record<string, string> = {};

beforeAll(async () => {
  // A doctored confirmation: the provider says she paid a sum that is not the price.
  const doctored = await enAttente('0101');
  const k1 = await leg(doctored.orderId);
  expect((await postWebhook(webhook(doctored.orderId, k1, (doctored.amount ?? 0) + 1, `whk-doctored-${doctored.orderId}`))).status).not.toBe(200);
  roles['montant_faux'] = doctored.orderId;

  // A timed-out charge, then its GENUINE webhook — twice (a redelivery).
  const tard = await echouee('0102');
  const k2 = await leg(tard.orderId);
  const genuine = webhook(tard.orderId, k2, tard.amount, `whk-late-${tard.orderId}`);
  await postWebhook(genuine);
  await postWebhook(genuine);
  roles['paye_apres_echec'] = tard.orderId;

  // A payment left pending past the limit.
  const pendante = await enAttente('0103');
  roles['paiement_en_attente'] = pendante.orderId;

  // A clean order: retried, then confirmed by its genuine webhook at once.
  const propre = await enAttente('0104');
  expect((await postWebhook(webhook(propre.orderId, await leg(propre.orderId), propre.amount, `whk-ok-${propre.orderId}`))).status).toBe(200);
  roles['propre'] = propre.orderId;

  // A paid order whose refund is blocked: Séra's refusal could not be read.
  const bloquee = await enAttente('0105');
  expect((await postWebhook(webhook(bloquee.orderId, await leg(bloquee.orderId), bloquee.amount, `whk-ok-${bloquee.orderId}`))).status).toBe(200);
  const refus = await mf.dispatchFetch('http://c/fulfillment/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERA_SECRET}` },
    body: JSON.stringify(garbledRefusal(bloquee.orderId)),
  });
  expect(refus.status, await refus.text()).toBe(200);
  roles['remboursement_bloque'] = bloquee.orderId;

  // The record's cap: 52 doctored confirmations on one pending order, then its stuck mark.
  const pleine = await enAttente('0106');
  const k6 = await leg(pleine.orderId);
  for (let i = 0; i < 52; i += 1) {
    await postWebhook(webhook(pleine.orderId, k6, (pleine.amount ?? 0) + 1 + i, `whk-cap-${i}-${pleine.orderId}`));
  }
  roles['fiche_pleine'] = pleine.orderId;

  // Past the stuck limit for the two pending orders.
  await jusqua(pendante.orderId, (a) => a.stuck != null, STUCK_TTL_MS + 12_000);
  await jusqua(pleine.orderId, (a) => a.stuck != null, STUCK_TTL_MS + 12_000);
  await jusqua(doctored.orderId, (a) => a.stuck != null, STUCK_TTL_MS + 12_000);

  // One poison body, parked by the webhook door.
  expect((await postWebhook('{"name":"payment.checkout_leg_conf')).status).toBe(400);
}, 180_000);

/* ─────────────── the row, on the Worker's own door ─────────────── */

async function lignes(): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  let cursor: string | undefined;
  for (;;) {
    const res = await mf.dispatchFetch(`http://c/checkout/dispatch?limit=40${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`, { headers: cleC });
    const body = safeJson(await res.text());
    for (const r of (body['orders'] as Record<string, unknown>[]) ?? []) out.set(r['orderId'] as string, r);
    if (typeof body['next'] !== 'string') return out;
    cursor = body['next'];
  }
}
const classes = (row: Record<string, unknown> | undefined): string[] =>
  ((row?.['aVerifier'] as { elements?: { classe: string }[] } | null)?.elements ?? []).map((e) => e.classe);

describe('each order row says what there is to check, and nothing else', () => {
  it('precondition: each order object already holds its alerts in its own record (only the row is missing them)', async () => {
    const tenu = async (role: string) =>
      ((await audit(roles[role]!)).reconAlerts ?? []).map((a) => (a.name === 'saga.stuck.v1' ? `stuck:${String(a.payload['stuck_in'])}` : String(a.payload['alert'])));
    expect(await tenu('montant_faux')).toContain('provider_amount_contradicts_quote');
    expect(await tenu('paye_apres_echec')).toEqual(['genuine_webhook_after_local_failure']);
    expect(await tenu('paiement_en_attente')).toEqual(['stuck:payment_pending']);
    expect(await tenu('propre')).toEqual([]);
    expect(await tenu('remboursement_bloque')).toEqual(['refusal_fact_unreadable']);
    expect(await tenu('fiche_pleine')).toHaveLength(50);
  });

  it('a doctored-amount confirmation, a late genuine payment and a payment pending past its limit each show their class; a clean order shows nothing', async () => {
    const rows = await lignes();
    expect(classes(rows.get(roles['montant_faux']!))).toContain('provider_amount_contradicts_quote');
    expect(classes(rows.get(roles['paye_apres_echec']!))).toEqual(['genuine_webhook_after_local_failure']);
    expect(classes(rows.get(roles['paiement_en_attente']!))).toEqual(['stuck_paiement']);
    expect(rows.get(roles['propre']!)?.['aVerifier']).toBeNull();
  });

  it('a redelivered alert shows once, at the time the provider sent it', async () => {
    const row = (await lignes()).get(roles['paye_apres_echec']!);
    expect(row?.['aVerifier']).toEqual({ elements: [{ classe: 'genuine_webhook_after_local_failure', le: T_WEBHOOK }], coupees: 0 });
  });

  it('a blocked refund keeps its refund status exactly, and its alert is on the row beside it', async () => {
    const row = (await lignes()).get(roles['remboursement_bloque']!);
    expect(row?.['remboursement']).toEqual({ etat: 'bloque', raison: 'refus_illisible' });
    expect(classes(row)).toEqual(['refusal_fact_unreadable']);
  });

  it('a full record carries what its cap clipped, and a stuck mark the cap clipped still shows', async () => {
    const row = (await lignes()).get(roles['fiche_pleine']!);
    const a = row?.['aVerifier'] as { elements: { classe: string; le: string }[]; coupees: number };
    // 52 confirmations + 1 stuck mark = 53 alerts; the record keeps 50.
    expect(a.coupees).toBe(3);
    expect(a.elements.filter((e) => e.classe === 'stuck_paiement')).toHaveLength(1);
    expect(a.elements.filter((e) => e.classe === 'provider_amount_contradicts_quote').length).toBeGreaterThanOrEqual(49);
  });

  it('every item is a class and one ISO time — no amount, phone, name, provider key or event body', async () => {
    const rows = await lignes();
    for (const [, row] of rows) {
      const a = row['aVerifier'];
      if (a === null) continue;
      expect(Object.keys(a as object).sort()).toEqual(['coupees', 'elements']);
      const v = a as { elements: Record<string, unknown>[]; coupees: unknown };
      expect(Number.isSafeInteger(v.coupees)).toBe(true);
      expect(v.elements.length).toBeGreaterThan(0);
      for (const e of v.elements) {
        expect(Object.keys(e).sort()).toEqual(['classe', 'le']);
        expect(typeof e['classe']).toBe('string');
        expect(e['le']).toMatch(ISO);
      }
      const bytes = JSON.stringify(a);
      for (const interdit of ['"amount"', '"phone"', '"payload"', '"envelope"', 'payment_attempt_id', 'att-', 'collect-', 'whk-', 'corr-', '70 ']) {
        expect(bytes.includes(interdit), `${interdit} in ${bytes}`).toBe(false);
      }
    }
  });
});

/* ─────────────── the dead-letter count ─────────────── */

describe('the dead-letter book answers a count on the same door', () => {
  it('?compte=1 answers numbers only; without key C it is refused exactly like the full read; any other query is the full read', async () => {
    const sans = await mf.dispatchFetch('http://c/checkout/dlq?compte=1');
    const sansPlein = await mf.dispatchFetch('http://c/checkout/dlq');
    expect(sans.status).toBe(sansPlein.status);
    expect(await sans.text()).toBe(await sansPlein.text());

    const compte = await mf.dispatchFetch('http://c/checkout/dlq?compte=1', { headers: cleC });
    const text = await compte.text();
    expect(compte.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ ok: true, held: 1, dropped: 0, oversize: 0 });
    expect(text.includes('payment.checkout_leg_conf')).toBe(false);

    const plein = await (await mf.dispatchFetch('http://c/checkout/dlq', { headers: cleC })).text();
    for (const q of ['?compte=2', '?compte=', '?compte=1&x=1', '?Compte=1']) {
      expect(await (await mf.dispatchFetch(`http://c/checkout/dlq${q}`, { headers: cleC })).text(), q).toBe(plein);
    }
    expect(Object.keys(JSON.parse(plein)).sort()).toEqual(['acknowledged', 'acknowledgedClipped', 'dropped', 'entries', 'events', 'held', 'ok', 'oversize']);
  });
});

/* ─────────────── through the Boutik+ console's own port ─────────────── */

describe('the Boutik+ console reads it through its own port', () => {
  it.skipIf(raisonSaut !== null)(titre('its dispatch read carries each class; its dead-letter read answers 1; the captured bytes keep their shape'), async () => {
    const port = consolePort();
    pages.length = 0;
    const lu = await port.listLivraisons(OPS_SECRET);
    expect(lu.ok, JSON.stringify(lu)).toBe(true);
    const par = new Map((lu.rows ?? []).map((r) => [r.orderId, r] as const));
    const cls = (role: string) =>
      ((par.get(roles[role]!)?.aVerifier as { elements?: { classe: string }[] } | undefined)?.elements ?? []).map((e) => e.classe);
    expect(cls('montant_faux')).toContain('provider_amount_contradicts_quote');
    expect(cls('paye_apres_echec')).toEqual(['genuine_webhook_after_local_failure']);
    expect(cls('paiement_en_attente')).toEqual(['stuck_paiement']);
    expect(par.get(roles['propre']!)?.aVerifier).toBeUndefined();
    expect(par.get(roles['remboursement_bloque']!)?.remboursement).toEqual({ etat: 'bloque', raison: 'refus_illisible' });
    expect(cls('remboursement_bloque')).toEqual(['refusal_fact_unreadable']);

    expect(await port.compterDlq(OPS_SECRET)).toEqual({ ok: true, n: 1 });

    const capture = { roles, pages: [...pages] };
    if (process.env['ECRIRE_CAPTURE'] === '1') {
      mkdirSync(dirname(CAPTURE), { recursive: true });
      writeFileSync(CAPTURE, `${JSON.stringify(capture, null, 2)}\n`);
    }
    // The captured bytes the walk reads hold today's shape, order by order.
    const forme = (c: { roles: Record<string, string>; pages: string[] }) => {
      const rows = new Map(
        c.pages.flatMap((p) => (JSON.parse(p)['orders'] as Record<string, unknown>[]).map((r) => [r['orderId'] as string, r] as const)),
      );
      return Object.fromEntries(
        Object.entries(c.roles).map(([role, id]) => {
          const r = rows.get(id)!;
          return [role, { keys: Object.keys(r).sort(), remboursement: r['remboursement'], classes: classes(r), coupees: (r['aVerifier'] as { coupees?: number } | null)?.coupees ?? null }];
        }),
      );
    };
    expect(existsSync(CAPTURE), `no captured bytes at ${CAPTURE}: run once with ECRIRE_CAPTURE=1`).toBe(true);
    const enregistree = JSON.parse(readFileSync(CAPTURE, 'utf8')) as { roles: Record<string, string>; pages: string[] };
    expect(forme(enregistree)).toEqual(forme(capture));
    // Settle: the cap order's stuck mark has fired, nothing else is still moving.
    await sleep(0);
  }, 60_000);
});
