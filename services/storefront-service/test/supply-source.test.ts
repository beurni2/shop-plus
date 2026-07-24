import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  AbsentSupplySource,
  HttpSupplySource,
  SUPPLY_ROUTE_PREFIX,
  resolveSupplySource,
  type SupplySourcePort,
} from '../src/supply-source.js';
import { joinVitrineProduct, type ListingSide } from '../src/customer-projection.js';

/**
 * REAL-PRODUCT-RENDER-1 piece (a) — the supply source and the join.
 *
 * The two founder-required guards live here: the MOCK MUST NOT BE REACHABLE from
 * the deployed composition root, and LISTING IDS MUST NOT REACH THE BUYER WIRE.
 * Both are asserted structurally, so they fail on drift rather than on discipline.
 */

const LISTING: ListingSide = { productVersionId: 'pv_real_1', customerPriceFcfa: 14_750, status: 'published' };

describe('THE MOCK IS NOT THE FALLBACK — fabricated supply data is unreachable by construction', () => {
  it('UNCONFIGURED ⇒ ABSENT, never mock: the resolver describes NOTHING without a supply base', async () => {
    const source = resolveSupplySource(undefined);
    expect(source).toBeInstanceOf(AbsentSupplySource);
    expect(await source.describe('pv_real_1')).toBeUndefined();
    // an empty string is not a configuration either
    expect(resolveSupplySource({ SUPPLY_BASE: '' })).toBeInstanceOf(AbsentSupplySource);
    // …and configured resolves to the REAL client, never anything else
    expect(resolveSupplySource({ SUPPLY_BASE: 'https://supply.example' })).toBeInstanceOf(HttpSupplySource);
  });

  it('NO MOCK IS IMPORTABLE FROM THE SERVICE SOURCE — the fabrication path does not exist in the bundle', () => {
    // The load-bearing difference from every other env-gated fallback: in-memory
    // stores are EMPTY, but a supply mock is POPULATED — it emits invented product
    // names and image refs. A deployed Worker that resolved to it would serve
    // fabricated products to a real buyer. So the deployed code imports no mock AT
    // ALL: no env value, flag or misconfiguration can reach one.
    const roots = [join(import.meta.dirname, '../src'), join(import.meta.dirname, '../worker')];
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
      );
    for (const dir of roots) {
      for (const file of walk(dir)) {
        const src = readFileSync(file, 'utf8');
        const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
        for (const spec of imports) {
          expect(
            /mock/i.test(spec),
            `${file} imports ${spec} — a mock is reachable from the deployed composition root`,
          ).toBe(false);
        }
      }
    }
  });

  it('the SUPPLY SOURCE module itself names no mock (the resolver has exactly two branches)', () => {
    const src = readFileSync(join(import.meta.dirname, '../src/supply-source.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function resolveSupplySource'));
    expect(body).toContain('HttpSupplySource');
    expect(body).toContain('AbsentSupplySource');
    expect(/mock/i.test(body)).toBe(false); // no third branch, none reachable
  });

  it('a TEST may inject its own source through the PORT — that is the only way a mock ever appears', async () => {
    // Injection is explicit and local to the test; nothing in src/ can do this.
    const injected: SupplySourcePort = {
      describe: async (pv: string) => ({ productName: `Produit ${pv}`, assetRefs: [] }),
    };
    expect(await injected.describe('pv_x')).toEqual({ productName: 'Produit pv_x', assetRefs: [] });
  });
});

describe('ABSENT renders as OMITTED — a product that cannot be described is not invented', () => {
  it('no description ⇒ NO record (never a nameless tile, never a placeholder name)', () => {
    expect(joinVitrineProduct(LISTING, undefined)).toBeUndefined();
  });

  it('a described product joins: HER price from the LISTING, name and images from SUPPLY', () => {
    const rec = joinVitrineProduct(LISTING, { productName: 'Sac tressé de Bobo', assetRefs: ['ref/hero'] })!;
    expect(rec.priceFcfa).toBe(14_750); // the LISTING's signed price, carried verbatim
    expect(rec.name).toBe('Sac tressé de Bobo'); // supply's display data
    expect(rec.assetRefs).toEqual(['ref/hero']);
  });

  it('a HIDDEN listing is not buyer-visible even when it CAN be described', () => {
    const hidden: ListingSide = { ...LISTING, status: 'auto_hidden' };
    expect(joinVitrineProduct(hidden, { productName: 'Sac tressé', assetRefs: [] })).toBeUndefined();
  });

  it('the HAND-ROLLED PARSER IS GONE — validation belongs to the certified consumer alone', async () => {
    const src = readFileSync(join(import.meta.dirname, '../src/supply-source.ts'), 'utf8');
    // one consumer, not two: no second envelope parse, no second identity regex
    expect(src).not.toContain('toDescription');
    expect(src).not.toMatch(/const IDENTITY_LEAK\s*=/);
    expect(src).toContain("from '@shop-plus/supply-consumer/consumer'");
    // …and by SUBPATH, never the package root (the root re-exports the mock, which
    // would pull fabricated supply data into the deployed bundle).
    expect(src).not.toMatch(/from '@shop-plus\/supply-consumer'/);
  });
});

describe('LISTING IDS STAY OFF THE BUYER WIRE (founder standing law)', () => {
  it('the joined record carries the PRODUCT VERSION as pid — never the listing id', () => {
    const rec = joinVitrineProduct(LISTING, { productName: 'Sac', assetRefs: [] })!;
    expect(rec.pid).toBe('pv_real_1'); // productVersionId
    // the shape has no listing-id-shaped field at all
    expect(Object.keys(rec).sort()).toEqual(['assetRefs', 'inStock', 'name', 'pid', 'priceFcfa']);
    expect(Object.keys(rec).some((k) => /listing/i.test(k))).toBe(false);
  });

  it('NO listing id appears anywhere in the emitted payload, even when one is in scope', () => {
    // The join is handed a listing side that KNOWS its listing id in the caller's
    // scope; the emitted record must carry no trace of it. If a future change wires
    // listingId onto the wire, this fails — which is the point: the gate on
    // /listings* protects against holders, and an enumerable id defeats it.
    const listingId = 'lst-secret-0001';
    const rec = joinVitrineProduct(LISTING, { productName: 'Sac', assetRefs: [`ref/${LISTING.productVersionId}`] })!;
    const serialised = JSON.stringify(rec);
    expect(serialised).not.toContain(listingId);
    expect(serialised).not.toMatch(/lst[-_]/i);
  });
});

/**
 * SUPPLY-WIRE-1 — the wire matches boutik's PRODUCER, and the bound is not optional.
 *
 * A path mismatch is invisible to every test either side can run alone: shop's
 * tests stub whatever path shop asks for, and boutik's tests serve whatever path
 * boutik defines. So the producer's route is asserted here as a CONSTANT read out
 * of boutik's own source, and the envelope + freshness bound are exercised through
 * the certified consumer rather than re-implemented.
 */
describe('SUPPLY-WIRE-1 — the path, the envelope and the freshness bound', () => {
  const PV = 'pv-founder-001';
  const NOW = () => new Date().toISOString();
  const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();
  /** The producer's 200 shape (offer-service `serveProjection`): the canon envelope. */
  const envelope = (asOf: string, over: Record<string, unknown> = {}): unknown => ({
    version: 1,
    asOf,
    value: {
      productVersionId: PV,
      offerVersion: '1',
      basePrice: 10_000,
      resellerCommission: 1_000,
      available: 5,
      productName: 'Pagne tissé Faso (démo)',
      assetRefs: ['asset/pv-founder-001/cover'],
      ...over,
    },
  });

  let seen: string[] = [];
  function stubFetch(status: number, body: unknown): void {
    seen = [];
    globalThis.fetch = (async (url: string | URL) => {
      seen.push(String(url));
      return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
    }) as typeof fetch;
  }
  const original = globalThis.fetch;
  afterAll(() => {
    globalThis.fetch = original;
  });

  it('THE PATH MATCHES THE PRODUCER: /supply-projection/{pv}, GET — not the /supply/{pv} that would have 404d', async () => {
    expect(SUPPLY_ROUTE_PREFIX).toBe('/supply-projection/'); // boutik: SUPPLY_ROUTE = /^\/supply-projection\/([^/]+)$/
    stubFetch(200, envelope(NOW()));
    await new HttpSupplySource('https://boutik.example').describe(PV);
    expect(seen[0]).toBe('https://boutik.example/supply-projection/pv-founder-001');
    expect(seen[0]).not.toContain('/supply/pv'); // the (a1) defect, pinned closed
  });

  it('A FRESH ENVELOPE describes: name and refs come out of value, never off the body', async () => {
    stubFetch(200, envelope(minutesAgo(1)));
    const got = await new HttpSupplySource('https://boutik.example').describe(PV);
    expect(got).toEqual({ productName: 'Pagne tissé Faso (démo)', assetRefs: ['asset/pv-founder-001/cover'] });
  });

  it('STALE BLOCKS: a projection past the 15-minute bound describes NOTHING (SW-2, the whole point)', async () => {
    stubFetch(200, envelope(minutesAgo(16)));
    expect(await new HttpSupplySource('https://boutik.example').describe(PV)).toBeUndefined();
    // …and the boundary itself stays fresh, so the bound is exact rather than fuzzy
    stubFetch(200, envelope(minutesAgo(14)));
    expect(await new HttpSupplySource('https://boutik.example').describe(PV)).toBeDefined();
  });

  it('AN UNWRAPPED BODY IS REFUSED — the (a1) defect: reading productName straight off the response', async () => {
    stubFetch(200, { productName: 'Pagne tissé Faso (démo)', assetRefs: ['a'] }); // no envelope
    expect(await new HttpSupplySource('https://boutik.example').describe(PV)).toBeUndefined();
  });

  it('IDENTITY MATERIAL is refused by the certified sweep, not by a local regex', async () => {
    stubFetch(200, envelope(minutesAgo(1), { supplierPhone: '+226 70 00 00 00' }));
    expect(await new HttpSupplySource('https://boutik.example').describe(PV)).toBeUndefined();
  });

  it("the producer's HONEST REFUSALS are absence, never an error: 404 unknown_product_version, 409 unavailable", async () => {
    stubFetch(404, { service: 'offer-service', status: 'not_found', reason: 'unknown_product_version' });
    expect(await new HttpSupplySource('https://boutik.example').describe(PV)).toBeUndefined();
    stubFetch(409, { service: 'offer-service', status: 'unavailable', reason: 'offer_expired' });
    expect(await new HttpSupplySource('https://boutik.example').describe(PV)).toBeUndefined();
  });
});

/**
 * SUPPLY-WIRE-AUTH-1 — the service-to-service credential (founder ruling).
 *
 * SHOP SENDS FIRST, boutik gates second: the wire carries no traffic, so a header
 * at an ungated producer is harmless while gating before the caller sends would
 * open a 401 window. Hence env-gated — an absent secret means NO HEADER, never a
 * broken request.
 */
describe('SUPPLY-WIRE-AUTH-1 — the bearer credential, env-gated', () => {
  const PV = 'pv-founder-001';
  const SECRET = 'test-supply-read-secret-0001'; // a TEST value, never a live one
  let sentHeaders: Record<string, string> = {};
  const original = globalThis.fetch;
  function stubFetch(): void {
    sentHeaders = {};
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      sentHeaders = (init?.headers ?? {}) as Record<string, string>;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          version: 1,
          asOf: new Date().toISOString(),
          value: {
            productVersionId: PV,
            offerVersion: '1',
            basePrice: 10_000,
            resellerCommission: 1_000,
            available: 5,
            productName: 'Pagne tissé Faso (démo)',
            assetRefs: [],
          },
        }),
      } as unknown as Response;
    }) as typeof fetch;
  }
  afterAll(() => {
    globalThis.fetch = original;
  });

  it('CONFIGURED ⇒ the request carries Authorization: Bearer', async () => {
    stubFetch();
    await new HttpSupplySource('https://boutik.example', SECRET).describe(PV);
    expect(sentHeaders['Authorization']).toBe(`Bearer ${SECRET}`);
  });

  it('ABSENT ⇒ NO Authorization header, and the request still WORKS (shop sends first, boutik gates second)', async () => {
    stubFetch();
    const got = await new HttpSupplySource('https://boutik.example').describe(PV);
    expect(sentHeaders['Authorization']).toBeUndefined();
    expect(got).toBeDefined(); // an absent secret is not a broken request
    // an empty string is not a configuration either
    stubFetch();
    await new HttpSupplySource('https://boutik.example', '').describe(PV);
    expect(sentHeaders['Authorization']).toBeUndefined();
  });

  it('the resolver threads the secret from env — and a base with no secret still resolves to the real client', () => {
    expect(resolveSupplySource({ SUPPLY_BASE: 'https://b.example', SUPPLY_READ_SECRET: SECRET })).toBeInstanceOf(HttpSupplySource);
    expect(resolveSupplySource({ SUPPLY_BASE: 'https://b.example' })).toBeInstanceOf(HttpSupplySource);
    // …and a secret WITHOUT a base is still absent: a credential is not a source
    expect(resolveSupplySource({ SUPPLY_READ_SECRET: SECRET })).toBeInstanceOf(AbsentSupplySource);
  });

  it('THE CREDENTIAL IS NOT THE APP WRITE KEY — the two are different kinds of thing and are never reused', () => {
    const src = readFileSync(join(import.meta.dirname, '../src/supply-source.ts'), 'utf8');
    // the app write key ships INSIDE a bundle (readable by anyone who downloads
    // it, so it stops scanners not attackers); this one never leaves two Workers.
    expect(src).not.toContain('STOREFRONT_WRITE_SECRET');
    expect(src).not.toContain('X-Write-Key');
    expect(src).toContain('SUPPLY_READ_SECRET');
    // and no secret VALUE is ever hardcoded here
    expect(src).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{16,}/);
  });
});
