import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AbsentSupplySource,
  HttpSupplySource,
  resolveSupplySource,
  toDescription,
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

  it('a supply payload carrying SUPPLIER IDENTITY is refused at the boundary (SP-I03)', () => {
    expect(toDescription({ productName: 'Sac', assetRefs: [], supplierPhone: '+226 70 00 00 00' })).toBeUndefined();
    expect(toDescription({ productName: 'Sac', assetRefs: [], pickup: 'Rood Woko' })).toBeUndefined();
    // …and a well-formed one is accepted
    expect(toDescription({ productName: 'Sac', assetRefs: ['a'] })).toEqual({ productName: 'Sac', assetRefs: ['a'] });
    // a malformed one is absent, never partially invented
    expect(toDescription({ productName: '', assetRefs: [] })).toBeUndefined();
    expect(toDescription({ productName: 'Sac', assetRefs: [1, 2] })).toBeUndefined();
    expect(toDescription(null)).toBeUndefined();
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
