import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  AbsentSupplySource,
  BoundSupplySource,
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
  it('UNCONFIGURED ⇒ ABSENT, never mock: the resolver describes NOTHING without the OFFER binding', async () => {
    // BROWSE-SUPPLY-BINDING-1 — the resolver now keys on the SERVICE BINDING's
    // presence, not a SUPPLY_BASE secret. Same two-branch honest-null discipline,
    // with presence now visible in wrangler.toml rather than hidden in a secret.
    const source = resolveSupplySource(undefined);
    expect(source).toBeInstanceOf(AbsentSupplySource);
    expect(await source.describe('pv_real_1')).toBeUndefined();
    // a binding-shaped object without a callable fetch is not a configuration either
    expect(resolveSupplySource({ OFFER: {} as never })).toBeInstanceOf(AbsentSupplySource);
    // …and a bound env resolves to the REAL client, never anything else
    expect(resolveSupplySource({ OFFER: { fetch: async () => new Response(null) } })).toBeInstanceOf(BoundSupplySource);
  });

  it('NO MOCK IS IMPORTABLE FROM THE SERVICE SOURCE — with ONE named exception, pinned to its file', () => {
    // The load-bearing difference from every other env-gated fallback: in-memory
    // stores are EMPTY, but a supply mock is POPULATED — it emits invented product
    // names and image refs. A deployed Worker that resolved to it would serve
    // fabricated products to a real buyer. So the deployed code imports no mock AT
    // ALL: no env value, flag or misconfiguration can reach one.
    //
    // ═══ THE ONE EXCEPTION, AND WHY IT IS NOT THE SAME THING (SP3.3a) ═══
    //
    // The vault's CERTIFIED SANDBOX PAYMENT PROVIDER is not a fallback and not a
    // fabricator: at E1/E2 it IS the payment implementation (a real aggregator is
    // the Real-Money Gate's open Decision), exactly as `delivery-source.ts` — the
    // « SANDBOX TARIFF, CONTRACT-CERTIFIED » stand-in for Séra — is the deployed
    // pricing of D. It invents NO buyer-visible data: it initiates a charge and
    // reports accepted/timeout, and it cannot invent a payment, because the only
    // thing that moves an order's money state is a signed webhook validated to
    // the franc against the immutable Quote by the frozen vault.
    //
    // THE GUARD KEEPS ITS TEETH BY BEING PINNED, not loosened: the set of
    // mock-looking imports in the deployed source must be EXACTLY this one, in
    // EXACTLY this file. A second one, a moved one, or a supply mock creeping
    // back fails this test by name.
    //
    // ═══ AND IT SCANS BINDINGS, NOT ONLY SPECIFIERS (verifier finding 6) ═══
    //
    // Scanning specifiers alone left a hole the code was ALREADY standing in:
    // `payment-port.ts` imports `MockPaymentProvider` from the
    // `@shop-plus/commerce-core` BARREL, whose specifier contains no « mock » —
    // and the verifier walked BOTH vault mocks into deployed source through that
    // barrel with the suite still green. A mock arriving by name must be caught
    // by name, so two sets are pinned: the mock-named SPECIFIERS (exactly one,
    // the worker bundle's alias re-export, which the bundle cannot be built
    // without) and the mock-named BINDINGS (exactly one, the certified payment
    // provider, in exactly one file).
    //
    // TYPE-ONLY IMPORTS ARE EXCLUDED, deliberately and not for convenience: a
    // `type` import is erased at compile time, reaches no runtime and can
    // fabricate nothing. `PaymentMockConfig` is a shape, not a fabricator.
    const ALLOWED_SPECIFIERS = [
      'worker/commerce-core-worker.ts::../../../packages/commerce-core/dist/mocks/payment-provider-mock.js',
    ];
    const ALLOWED_BINDINGS = ['src/payment-port.ts::MockPaymentProvider'];
    const roots = [join(import.meta.dirname, '../src'), join(import.meta.dirname, '../worker')];
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
      );
    /**
     * ═══ TWO SHAPES DEFEAT A BY-NAME SCAN, SO BOTH ARE BANNED OUTRIGHT ═══
     * (Verifier round 2 — both bypasses were live, and the second is the serious
     * one: it would have let a SUPPLY mock, the exact thing this test exists to
     * stop, into deployed source with the suite green.)
     *
     *  · A NAMESPACE IMPORT (`import * as x from '…'`) binds every export of a
     *    module under one name, so no binding this scan can read ever mentions a
     *    mock. Deployed source imports BY NAME; there are none today and the
     *    allowlist is empty.
     *  · A DYNAMIC IMPORT (`import('…')`) is invisible to the specifier scan
     *    (which requires `from`), and its argument may be computed at runtime, so
     *    there is no version of this scan that could police it. A specifier this
     *    test cannot read is a specifier it cannot allow. None today either.
     *
     * `export * from '<explicit vault module>'` stays legal: that is the worker
     * bundle's alias file, and each of its specifiers IS scanned individually
     * below. A star re-export of the BARREL is not legal — it would pull the
     * mocks in under a specifier with no « mock » in it.
     */
    const BARREL = '@shop-plus/commerce-core';
    const foundSpecifiers: string[] = [];
    const foundBindings: string[] = [];
    const namespaceImports: string[] = [];
    const dynamicImports: string[] = [];
    const barrelStarReexports: string[] = [];
    for (const dir of roots) {
      for (const file of walk(dir)) {
        const src = readFileSync(file, 'utf8');
        const relative = file.slice(file.indexOf('/storefront-service/') + '/storefront-service/'.length);
        for (const spec of [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!)) {
          if (/mock/i.test(spec)) foundSpecifiers.push(`${relative}::${spec}`);
        }
        for (const m of src.matchAll(/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*['"]([^'"]+)['"]/g)) {
          namespaceImports.push(`${relative}::* as ${m[1]!} from ${m[2]!}`);
        }
        // `import(` in any form — a bare call, awaited, or chained. The comment
        // and string forms are stripped of nothing: if it looks like a dynamic
        // import it is one, and it is refused.
        for (const m of src.matchAll(/(?<![.\w$])import\s*\(\s*([^)]*)\)/g)) {
          dynamicImports.push(`${relative}::import(${m[1]!.trim()})`);
        }
        for (const m of src.matchAll(/export\s*\*\s*(?:as\s+[\w$]+\s*)?from\s*['"]([^'"]+)['"]/g)) {
          if (m[1]! === BARREL) barrelStarReexports.push(`${relative}::export * from ${m[1]!}`);
        }
        // Every import/export STATEMENT, with its clause — `import … from`,
        // `import type … from`, and `export … from` (the barrel re-export shape).
        for (const stmt of src.matchAll(/(?:import|export)\s+([\s\S]*?)\s*from\s*['"][^'"]+['"]/g)) {
          const clause = stmt[1]!;
          if (/^type\s/.test(clause.trim())) continue; // erased at compile time
          const named = /\{([\s\S]*?)\}/.exec(clause);
          const bindings = named === null ? [clause] : named[1]!.split(',');
          for (const raw of bindings) {
            const binding = raw.trim();
            if (binding === '' || binding.startsWith('type ')) continue;
            const name = binding.split(/\s+as\s+/)[0]!.trim().replace(/^\*\s*/, '');
            if (name !== '' && /mock/i.test(name)) foundBindings.push(`${relative}::${name}`);
          }
        }
      }
    }
    expect(foundSpecifiers.sort()).toEqual(ALLOWED_SPECIFIERS);
    expect(foundBindings.sort()).toEqual(ALLOWED_BINDINGS);
    // The two shapes no by-name scan can police: none exist, and none may.
    expect(namespaceImports).toEqual([]);
    expect(dynamicImports).toEqual([]);
    expect(barrelStarReexports).toEqual([]);
    // …and NO supply mock, by the original rule: nothing on the supply path.
    for (const entry of [...foundSpecifiers, ...foundBindings]) expect(/supply/i.test(entry)).toBe(false);
    // The eligibility mock is the verifier's own smuggle: it rides the SAME
    // barrel and would reach deployed source with no « mock » in any specifier.
    for (const entry of foundBindings) expect(entry.includes('Sera')).toBe(false);
  });

  it('the SUPPLY SOURCE module itself names no mock (the resolver has exactly two branches)', () => {
    const src = readFileSync(join(import.meta.dirname, '../src/supply-source.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function resolveSupplySource'));
    expect(body).toContain('BoundSupplySource');
    expect(body).toContain('AbsentSupplySource');
    expect(/mock/i.test(body)).toBe(false); // no third branch, none reachable
  });

  it('a TEST may inject its own source through the PORT — that is the only way a mock ever appears', async () => {
    // Injection is explicit and local to the test; nothing in src/ can do this.
    const injected: SupplySourcePort = {
      describe: async (pv: string) => ({ productName: `Produit ${pv}`, assetRefs: [], available: 1, category: 'fashion_bags_fabrics' }),
      presence: async () => ({ kind: 'unknown' }),
      economics: async () => undefined,
    };
    expect(await injected.describe('pv_x')).toEqual({ productName: 'Produit pv_x', assetRefs: [], available: 1, category: 'fashion_bags_fabrics' });
  });
});

describe('ABSENT renders as OMITTED — a product that cannot be described is not invented', () => {
  it('no description ⇒ NO record (never a nameless tile, never a placeholder name)', () => {
    expect(joinVitrineProduct(LISTING, undefined)).toBeUndefined();
  });

  it('a described product joins: HER price from the LISTING, name and images from SUPPLY', () => {
    const rec = joinVitrineProduct(LISTING, { productName: 'Sac tressé de Bobo', assetRefs: ['ref/hero'], category: 'fashion_bags_fabrics' })!;
    expect(rec.priceFcfa).toBe(14_750); // the LISTING's signed price, carried verbatim
    expect(rec.name).toBe('Sac tressé de Bobo'); // supply's display data
    expect(rec.assetRefs).toEqual(['ref/hero']);
  });

  it('a HIDDEN listing is not buyer-visible even when it CAN be described', () => {
    const hidden: ListingSide = { ...LISTING, status: 'auto_hidden' };
    expect(joinVitrineProduct(hidden, { productName: 'Sac tressé', assetRefs: [], category: 'fashion_bags_fabrics' })).toBeUndefined();
  });

  it('VIDEO-PRODUIT: a described video RIDES the record; absence stays ABSENT, never an undefined key', () => {
    const base = { productName: 'Sac tressé', assetRefs: ['ref/hero'], available: 2, category: 'fashion_bags_fabrics' };
    const avec = joinVitrineProduct(LISTING, { ...base, videoRef: 'https://media.example/media/v1' })!;
    expect(avec.videoRef).toBe('https://media.example/media/v1');
    const sans = joinVitrineProduct(LISTING, base)!;
    expect('videoRef' in sans).toBe(false); // absent key — canon optional, never explicit undefined
    const vide = joinVitrineProduct(LISTING, { ...base, videoRef: '' })!;
    expect('videoRef' in vide).toBe(false); // a blank ref is no ref
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
    const rec = joinVitrineProduct(LISTING, { productName: 'Sac', assetRefs: [], category: 'fashion_bags_fabrics' })!;
    expect(rec.pid).toBe('pv_real_1'); // productVersionId
    // the shape has no listing-id-shaped field at all
    expect(Object.keys(rec).sort()).toEqual(['assetRefs', 'category', 'inStock', 'name', 'pid', 'priceFcfa']);
    expect(Object.keys(rec).some((k) => /listing/i.test(k))).toBe(false);
  });

  it('NO listing id appears anywhere in the emitted payload, even when one is in scope', () => {
    // The join is handed a listing side that KNOWS its listing id in the caller's
    // scope; the emitted record must carry no trace of it. If a future change wires
    // listingId onto the wire, this fails — which is the point: the gate on
    // /listings* protects against holders, and an enumerable id defeats it.
    const listingId = 'lst-secret-0001';
    const rec = joinVitrineProduct(LISTING, { productName: 'Sac', assetRefs: [`ref/${LISTING.productVersionId}`], category: 'fashion_bags_fabrics' })!;
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
      category: 'fashion_bags_fabrics',
      ...over,
    },
  });

  let seen: string[] = [];
  // BROWSE-SUPPLY-BINDING-1 — the stub IS the binding: tests hand the source a
  // fetcher exactly the way wrangler hands the Worker `env.OFFER`. No global fetch
  // is patched, because the deployed code no longer calls one.
  function stubFetch(status: number, body: unknown): void {
    seen = [];
    fetcher = {
      fetch: async (req: Request) => {
        seen.push(req.url);
        return {
          ok: status >= 200 && status < 300,
          status,
          json: async () => body,
          text: async () => JSON.stringify(body),
        } as unknown as Response;
      },
    };
  }
  let fetcher: { fetch(request: Request): Promise<Response> };
  const source = () => new BoundSupplySource(fetcher);

  it('THE PATH MATCHES THE PRODUCER: /supply-projection/{pv}, GET — not the /supply/{pv} that would have 404d', async () => {
    expect(SUPPLY_ROUTE_PREFIX).toBe('/supply-projection/'); // boutik: SUPPLY_ROUTE = /^\/supply-projection\/([^/]+)$/
    stubFetch(200, envelope(NOW()));
    await source().describe(PV);
    // The binding routes by PATH; the origin is a placeholder, and the path is the
    // thing the (a1) defect got wrong.
    expect(new URL(seen[0]!).pathname).toBe('/supply-projection/pv-founder-001');
    expect(seen[0]).not.toContain('/supply/pv'); // the (a1) defect, pinned closed
  });

  it('A FRESH ENVELOPE describes: name, refs and STOCK come out of value, never off the body', async () => {
    stubFetch(200, envelope(minutesAgo(1)));
    const got = await source().describe(PV);
    // `available` joined this shape in PUBLISH-PRICE-1 so the buyer record can state
    // stock truthfully instead of hardcoding `inStock: true`. Deep-equal, so a field
    // appearing or vanishing still fails — stock is display truth, not economics.
    expect(got).toEqual({
      productName: 'Pagne tissé Faso (démo)',
      assetRefs: ['asset/pv-founder-001/cover'],
      category: 'fashion_bags_fabrics',
      available: 5,
    });
  });

  it('PUBLISH-PRICE-1 — `economics` reads the LIVE base and offer version off the SAME envelope', async () => {
    stubFetch(200, envelope(minutesAgo(1)));
    // MONEY-SHAPE-1 — C rides along so the listing can freeze HER side at the same
    // instant it freezes the buyer's, from ONE reading of the projection.
    expect(await source().economics(PV)).toEqual({ basePrice: 10_000, offerVersion: '1', resellerCommission: 1_000 });
  });

  it('PUBLISH-PRICE-1 — `economics` carries NO display data, and `describe` carries NO economics', async () => {
    stubFetch(200, envelope(minutesAgo(1)));
    const econ = (await source().economics(PV)) as Record<string, unknown>;
    const desc = (await source().describe(PV)) as Record<string, unknown>;
    // The two shapes are deliberately disjoint: only one of them may reach a buyer
    // record, and merging them would destroy exactly that guarantee (SP-I03).
    expect(Object.keys(econ).sort()).toEqual(['basePrice', 'offerVersion', 'resellerCommission']);
    for (const banned of ['basePrice', 'resellerCommission', 'offerVersion']) {
      expect(Object.keys(desc)).not.toContain(banned);
    }
  });

  it('PUBLISH-PRICE-1 — `economics` inherits the SAME refusal ladder, so a stale base can never sign', async () => {
    // The bound is the point: a price signed against a 20-minute-old base is exactly
    // the drift « le prix reste signé » exists to prevent. Publish refuses instead.
    stubFetch(200, envelope(minutesAgo(16)));
    expect(await source().economics(PV)).toBeUndefined();
    stubFetch(404, { service: 'offer-service' });
    expect(await source().economics(PV)).toBeUndefined();
    stubFetch(200, { productName: 'x', basePrice: 1 }); // unwrapped body
    expect(await source().economics(PV)).toBeUndefined();
  });

  it('AN ABSENT SOURCE CANNOT SIGN — the unconfigured Worker refuses publish by construction', async () => {
    const absent = resolveSupplySource({});
    expect(await absent.economics(PV)).toBeUndefined();
    expect(await absent.describe(PV)).toBeUndefined();
  });

  it('STALE BLOCKS: a projection past the 15-minute bound describes NOTHING (SW-2, the whole point)', async () => {
    stubFetch(200, envelope(minutesAgo(16)));
    expect(await source().describe(PV)).toBeUndefined();
    // …and the boundary itself stays fresh, so the bound is exact rather than fuzzy
    stubFetch(200, envelope(minutesAgo(14)));
    expect(await source().describe(PV)).toBeDefined();
  });

  it('AN UNWRAPPED BODY IS REFUSED — the (a1) defect: reading productName straight off the response', async () => {
    stubFetch(200, { productName: 'Pagne tissé Faso (démo)', assetRefs: ['a'] }); // no envelope
    expect(await source().describe(PV)).toBeUndefined();
  });

  it('IDENTITY MATERIAL is refused by the certified sweep, not by a local regex', async () => {
    stubFetch(200, envelope(minutesAgo(1), { supplierPhone: '+226 70 00 00 00' }));
    expect(await source().describe(PV)).toBeUndefined();
  });

  it("the producer's HONEST REFUSALS are absence, never an error: 404 unknown_product_version, 409 unavailable", async () => {
    stubFetch(404, { service: 'offer-service', status: 'not_found', reason: 'unknown_product_version' });
    expect(await source().describe(PV)).toBeUndefined();
    stubFetch(409, { service: 'offer-service', status: 'unavailable', reason: 'offer_expired' });
    expect(await source().describe(PV)).toBeUndefined();
  });
});

/**
 * AUTO-HIDE-WATCH-1 — `presence()`: the SAME wire read, surfaced as EVIDENCE.
 *
 * The founder's law binds the shape: AN ABSENCE IS ONLY EVIDENCE IF THE
 * INSTRUMENT COULD HAVE SEEN THE PRESENCE. `gone` is reserved for the ONE
 * outcome where the producer itself answered and denied the offer (404
 * `unknown_product_version`). Every failure of the instrument — unreachable,
 * 5xx, unparseable, stale — and every refusal of an EXTANT offer (409
 * `unavailable`, possibly transient moderation against a ONE-WAY hide) is
 * `unknown`: renderable as omission, never actionable as a hide.
 */
describe('AUTO-HIDE-WATCH-1 — presence verdicts separate evidence from ignorance', () => {
  const PV = 'pv-founder-001';
  const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();
  const envelope = (asOf: string): unknown => ({
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
      category: 'fashion_bags_fabrics',
    },
  });
  const sourceAnswering = (status: number, body: unknown): BoundSupplySource =>
    new BoundSupplySource({
      fetch: async () =>
        ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => '' }) as unknown as Response,
    });

  it('a FRESH projection is PRESENT, and the description rides along (one fetch, not two)', async () => {
    const seen = await sourceAnswering(200, envelope(minutesAgo(1))).presence(PV);
    expect(seen).toEqual({
      kind: 'present',
      description: { productName: 'Pagne tissé Faso (démo)', assetRefs: ['asset/pv-founder-001/cover'], available: 5, category: 'fashion_bags_fabrics' },
    });
  });

  it('the producer answering 404 unknown_product_version is GONE — the one positive absence', async () => {
    const seen = await sourceAnswering(404, { service: 'offer-service', status: 'not_found', reason: 'unknown_product_version' }).presence(PV);
    expect(seen).toEqual({ kind: 'gone' });
  });

  it("a 404 WITHOUT the producer's reason is UNKNOWN — route drift must not become a mass hide", async () => {
    // Boutik's health fallback answers ANY unmatched path 404 with
    // `{service, status:'not_found'}` and NO reason. If the supply path ever
    // drifts (it has once — SUPPLY-WIRE-1), every read 404s through that
    // fallback; ruling those `gone` would one-way hide every listing on the
    // platform. The body's `reason` is the denial; the code alone is not.
    expect(await sourceAnswering(404, { service: 'offer-service', status: 'not_found' }).presence(PV)).toEqual({
      kind: 'unknown',
    });
    expect(await sourceAnswering(404, null).presence(PV)).toEqual({ kind: 'unknown' });
    expect(await sourceAnswering(404, 'not json').presence(PV)).toEqual({ kind: 'unknown' });
  });

  it('a NETWORK FAILURE is UNKNOWN, never gone — a supply outage must not read as a lapse', async () => {
    const source = new BoundSupplySource({
      fetch: async () => {
        throw new Error('connection refused');
      },
    });
    expect(await source.presence(PV)).toEqual({ kind: 'unknown' });
  });

  it('5xx · 409 unavailable · STALE · unparseable are all UNKNOWN — refusals and failures are not lapses', async () => {
    expect(await sourceAnswering(500, {}).presence(PV)).toEqual({ kind: 'unknown' });
    // 409: an EXTANT offer refusing service — hiding on it would strand a listing
    // behind a possibly-transient state, because decideAutoHide is one-way.
    expect(
      await sourceAnswering(409, { service: 'offer-service', status: 'unavailable', reason: 'product_not_approved' }).presence(PV),
    ).toEqual({ kind: 'unknown' });
    expect(await sourceAnswering(200, envelope(minutesAgo(16))).presence(PV)).toEqual({ kind: 'unknown' });
    expect(await sourceAnswering(200, { not: 'an envelope' }).presence(PV)).toEqual({ kind: 'unknown' });
  });

  it('AN ABSENT SOURCE never reports GONE — an instrument that cannot see presence has no absences', async () => {
    // The unconfigured Worker must be incapable of hiding a listing, the same way
    // it is incapable of signing a price. `unknown`, by construction.
    expect(await new AbsentSupplySource().presence()).toEqual({ kind: 'unknown' });
    expect(await resolveSupplySource({}).presence(PV)).toEqual({ kind: 'unknown' });
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
  // BROWSE-SUPPLY-BINDING-1 — the stub IS the binding; headers are read off the
  // REAL Request the source builds, which is exactly what the bound Worker receives.
  let sentAuth: string | null = null;
  let fetcher: { fetch(request: Request): Promise<Response> };
  function stubFetch(): void {
    sentAuth = null;
    fetcher = {
      fetch: async (req: Request) => {
        sentAuth = req.headers.get('Authorization');
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
              category: 'fashion_bags_fabrics',
            },
          }),
          text: async () => '',
        } as unknown as Response;
      },
    };
  }

  it('CONFIGURED ⇒ the request carries Authorization: Bearer — THROUGH THE BINDING', async () => {
    stubFetch();
    await new BoundSupplySource(fetcher, SECRET).describe(PV);
    expect(sentAuth).toBe(`Bearer ${SECRET}`);
  });

  it('ABSENT ⇒ NO Authorization header, and the request still WORKS (shop sends first, boutik gates second)', async () => {
    stubFetch();
    const got = await new BoundSupplySource(fetcher).describe(PV);
    expect(sentAuth).toBeNull();
    expect(got).toBeDefined(); // an absent secret is not a broken request
    // an empty string is not a configuration either
    stubFetch();
    await new BoundSupplySource(fetcher, '').describe(PV);
    expect(sentAuth).toBeNull();
  });

  it('the resolver threads the secret from env — and a base with no secret still resolves to the real client', () => {
    const bound = { fetch: async () => new Response(null) };
    expect(resolveSupplySource({ OFFER: bound, SUPPLY_READ_SECRET: SECRET })).toBeInstanceOf(BoundSupplySource);
    expect(resolveSupplySource({ OFFER: bound })).toBeInstanceOf(BoundSupplySource);
    // …and a secret WITHOUT a base is still absent: a credential is not a source
    expect(resolveSupplySource({ SUPPLY_READ_SECRET: SECRET })).toBeInstanceOf(AbsentSupplySource);
  });

  it('THE CREDENTIAL IS NOT THE APP WRITE KEY — the two are different kinds of thing and are never reused', () => {
    const src = readFileSync(join(import.meta.dirname, '../src/supply-source.ts'), 'utf8');
    // The app write key used to ship INSIDE a bundle (readable by anyone who
    // downloaded it, so it stopped scanners not attackers); this credential
    // never leaves two Workers. ACCES-ARME-2 (2026-09-05) retired that key
    // outright — the service-wide pin is the next test — and this module
    // still names neither the binding nor the header, which is what « never
    // reused » has always meant here.
    expect(src).not.toContain('STOREFRONT_WRITE_SECRET');
    expect(src).not.toContain('X-Write-Key');
    expect(src).toContain('SUPPLY_READ_SECRET');
    // and no secret VALUE is ever hardcoded here
    expect(src).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{16,}/);
  });

  /**
   * ACCES-ARME-2 (2026-09-05) — THE APP WRITE KEY IS RETIRED FROM THE WHOLE
   * SERVICE, pinned structurally so a key path cannot creep back in code while
   * the prose still says it is gone. Every `.ts` under `src/` and `worker/` is
   * scanned line by line; a mention is allowed ONLY on a comment line (the
   * retirement note in `worker/auth.ts`, the ceiling's history in the accounts
   * book). The one CODE line that still spells `X-Write-Key` is the media
   * door's OWN credential (`MEDIA_WRITE_KEY`), presented by `order-do.ts` to
   * ANOTHER Worker — never read by this one — and it is pinned by file so a
   * second appearance, or a read of that header at this root, fails by name.
   * The pilot ceiling (`RESELLER_ADMISSION_CEILING`, `plafond_pilote`) left
   * with the same slice: prose only, no code.
   */
  it('ACCES-ARME-2 — no binding reads STOREFRONT_WRITE_SECRET, no gate reads X-Write-Key, and the pilot ceiling is gone from code', () => {
    const roots = [join(import.meta.dirname, '../src'), join(import.meta.dirname, '../worker')];
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
      );
    const isComment = (line: string): boolean => /^\s*(\*|\/\/|\/\*)/.test(line);
    const codeMentions: Record<string, string[]> = {
      STOREFRONT_WRITE_SECRET: [],
      'X-Write-Key': [],
      RESELLER_ADMISSION_CEILING: [],
      plafond_pilote: [],
    };
    let seen = 0;
    for (const dir of roots) {
      for (const file of walk(dir)) {
        const relative = file.slice(file.indexOf('/storefront-service/') + '/storefront-service/'.length);
        for (const line of readFileSync(file, 'utf8').split('\n')) {
          for (const needle of Object.keys(codeMentions)) {
            if (!line.includes(needle)) continue;
            seen += 1;
            if (!isComment(line)) codeMentions[needle]!.push(relative);
          }
        }
      }
    }
    // The scan is not vacuous: the retirement prose itself is found.
    expect(seen).toBeGreaterThan(0);
    expect(codeMentions['STOREFRONT_WRITE_SECRET']).toEqual([]);
    expect(codeMentions['RESELLER_ADMISSION_CEILING']).toEqual([]);
    expect(codeMentions['plafond_pilote']).toEqual([]);
    // The media door's own header, sent by exactly one file, to another Worker.
    expect([...new Set(codeMentions['X-Write-Key'])]).toEqual(['worker/order-do.ts']);
    // …and the composition root and the gates read no such header at all.
    for (const gate of ['worker/index.ts', 'worker/auth.ts']) {
      const lines = readFileSync(join(import.meta.dirname, '..', gate), 'utf8').split('\n');
      expect(lines.filter((l) => l.includes('X-Write-Key') && !isComment(l)), gate).toEqual([]);
    }
  });
});

/* ---------------------------------------------- CATEGORY-WIRE-1 (canon v3.0.0) -- */

/**
 * The category the SUPPLIER declared is the category the BUYER's record carries.
 *
 * This is the hop where a category could quietly acquire a default, a mapping or
 * a listing-side override — all three would be wrong, and none of them would be
 * visible in a test that only checks the field EXISTS. So the assertions use a
 * value nothing in this repo hardcodes.
 */
describe('CATEGORY-WIRE-1 — supply owns the category; the join resolves it to its §6.2 row', () => {
  const LISTING_SIDE: ListingSide = { productVersionId: 'pv_cat_1', customerPriceFcfa: 14_750, status: 'published' };
  const supply = (category: string) => ({ productName: 'Sac tressé', assetRefs: [], available: 3, category });

  /**
   * ═══ THE CLAIM THIS BLOCK MAKES WAS REVERSED ON PURPOSE (OPTION-B-REACHABLE-1) ═══
   *
   * It used to assert « no mapping, no allowlist, no default — policy lives on
   * the READING side ». That was a coherent design and it shipped a real defect:
   * the only reader of this field is the buyer's `inspectionPour()`, whose table
   * is keyed by §6.2's ROW NAMES, while Boutik+ writes the French chip the
   * supplier tapped. Carrying it verbatim meant every real product missed the
   * table and every at-door screen showed the cautious checklist.
   *
   * So the mapping moved to THIS side — the same `rangeeInspection` the §6.1
   * gate consults, which is what makes « may I pay at the door » and « what may
   * I inspect there » two answers to one question. What is asserted below is
   * therefore the opposite of what was asserted before, and deliberately so.
   */
  it('a chip a SUPPLIER actually taps resolves to its §6.2 row — this is the wire the buyer reads', () => {
    expect(joinVitrineProduct(LISTING_SIDE, supply('Mode femme'))!.category).toBe('fashion_bags_fabrics');
    expect(joinVitrineProduct(LISTING_SIDE, supply('Chaussures'))!.category).toBe('shoes');
    expect(joinVitrineProduct(LISTING_SIDE, supply('Beauté scellée'))!.category).toBe('sealed_beauty_cosmetics');
  });

  it('a category §6.2 NAMES NO ROW FOR travels as \'\' — never as a row it is not', () => {
    // « Maison » is a real chip; the arbitrary string is a supplier's free text.
    // Both have no at-door inspection rights, and the honest wire value for that
    // is the empty string: the buyer's lookup misses and she is shown the
    // cautious checklist. Inventing a row here would promise her rights §6.2
    // does not grant — the one failure this field can cause at a doorstep.
    expect(joinVitrineProduct(LISTING_SIDE, supply('Maison'))!.category).toBe('');
    expect(joinVitrineProduct(LISTING_SIDE, supply('un-truc-que-personne-ne-connait'))!.category).toBe('');
  });

  it('two products differing ONLY in category produce two different records', () => {
    const a = joinVitrineProduct(LISTING_SIDE, supply('shoes'))!;
    const b = joinVitrineProduct(LISTING_SIDE, supply('sealed_beauty_cosmetics'))!;
    expect(a.category).toBe('shoes');
    expect(b.category).toBe('sealed_beauty_cosmetics');
    // …and nothing ELSE moved: the category rides alone, it does not disturb
    // the price, the stock or the identity fields.
    expect({ ...a, category: '' }).toEqual({ ...b, category: '' });
  });

  it('the category comes from SUPPLY, never from the listing — the reseller sets a markup, not what a product IS', () => {
    // A listing-side object carrying a category must not be able to speak for the
    // product. `ListingSide` has no such field, so the only way this record gets
    // one is from the supply argument — asserted by giving the listing a
    // conflicting value through a cast and showing supply still wins.
    const listingPretending = { ...LISTING_SIDE, category: 'shoes' } as unknown as ListingSide;
    const rec = joinVitrineProduct(listingPretending, supply('sealed_beauty_cosmetics'))!;
    expect(rec.category).toBe('sealed_beauty_cosmetics');
  });
});

/* ------------------------------- CATEGORY-WIRE-1 r2 — the deploy-order lock -- */

/**
 * THE WORST OPERATIONAL OUTCOME OF THIS SLICE, TURNED INTO A RED TEST.
 *
 * A pre-v3 offer-service emits the SEVEN-field projection. The strict canon
 * parse refuses it, `describe()` returns `undefined`, and `joinVitrineProduct`
 * omits the record — so deploying THIS service before boutik's producer makes
 * **every product vanish from every buyer page**, silently, with no error a
 * shopper or a reseller could interpret. Until now that hazard was defended
 * only by prose in JOURNAL.md and a canon derivation doc.
 *
 * The test is here for a second reason the verifier named, which is the better
 * one: it LOCKS THE BEHAVIOUR. The tempting "fix" when someone meets this in
 * production is to make the parse tolerant of the old shape — and that repair
 * is the genuinely dangerous one, because a projection missing `category`
 * silently disables Option B and shows the cautious §6.2 row on products that
 * qualify for neither. Refusing outright is correct; this test makes anyone
 * loosening it do so deliberately.
 */
describe('CATEGORY-WIRE-1 — a PRE-v3 producer is undescribable, and that is the designed answer', () => {
  const PV = 'pv-founder-001';
  const sevenFieldValue = {
    productVersionId: PV,
    offerVersion: '1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 5,
    productName: 'Pagne tissé Faso (démo)',
    assetRefs: ['asset/pv-founder-001/cover'],
    // NO `category` — this is exactly what a canon-v2 offer-service serves.
  };
  const source = (value: unknown): BoundSupplySource =>
    new BoundSupplySource({
      fetch: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ version: 1, asOf: new Date().toISOString(), value }),
          text: async () => '',
        }) as unknown as Response,
    });

  it('the OLD seven-field wire describes NOTHING — it is refused, never partially accepted', async () => {
    expect(await source(sevenFieldValue).describe(PV)).toBeUndefined();
    // …and it is not mistaken for a missing offer: the producer ANSWERED, so the
    // watcher must read `unknown` (no evidence) rather than `gone` (evidence a
    // listing may act on). A bad deploy must never auto-hide a reseller's shop.
    expect((await source(sevenFieldValue).presence(PV)).kind).toBe('unknown');
  });

  it('…and the SAME wire with `category` describes normally — the refusal is about the field, not the fixture', async () => {
    const description = await source({ ...sevenFieldValue, category: 'fashion_bags_fabrics' }).describe(PV);
    expect(description).toBeDefined();
    expect(description?.category).toBe('fashion_bags_fabrics');
  });

  it('the omission reaches the buyer surface as an OMITTED product, never an invented one', () => {
    const listing: ListingSide = { productVersionId: PV, customerPriceFcfa: 14_750, status: 'published' };
    // `describe()` returned undefined above; this is what the join does with it.
    expect(joinVitrineProduct(listing, undefined)).toBeUndefined();
  });
});

/**
 * ═══ THE PREMISE THE ROUTER'S `.catch()` RESTS ON, MADE AN ASSERTION ═══
 *
 * `worker/checkout-do.ts` wraps its supply read in `.catch(() => undefined)`.
 * A verifier mutated that catch to fail OPEN — fabricating a `verified`
 * supplier — and the whole suite stayed green, including the three
 * broken-producer e2e cases. That is not those tests failing to bite: it is
 * that the catch is UNREACHABLE through either shipped port, so no behavioural
 * test can distinguish its bodies.
 *
 * The honest response is not to fake coverage of a dead branch. It is to assert
 * the PREMISE that makes it dead — every shipped port RESOLVES, for every
 * hostile input — so that if a future port ever starts rejecting, this test is
 * where that fact surfaces, and the catch stops being decoration.
 *
 * The router's comment states plainly that the catch is defence-in-depth and
 * not mutation-covered. Both halves of that claim are pinned here.
 */
describe('THE SUPPLY PORT NEVER REJECTS — the router catch is defence, not the mechanism', () => {
  const HOSTILE: { label: string; fetch: (req: Request) => Promise<Response> }[] = [
    { label: 'the binding throws', fetch: () => { throw new Error('unreachable'); } },
    { label: 'the binding rejects', fetch: () => Promise.reject(new Error('rejected')) },
    { label: 'a 500 with an unreadable body', fetch: async () => new Response('boom', { status: 500 }) },
    { label: 'a 200 whose body is not JSON', fetch: async () => new Response('<html>nope</html>', { status: 200 }) },
    { label: 'a 200 whose body is null', fetch: async () => Response.json(null, { status: 200 }) },
    { label: 'a 200 whose value is a hostile shape', fetch: async () => Response.json({ version: 1, asOf: 1, value: [] }, { status: 200 }) },
    { label: 'a 404 with no reason', fetch: async () => Response.json({ status: 'not_found' }, { status: 404 }) },
  ];

  it.each(HOSTILE)('BoundSupplySource RESOLVES on $label — undefined, never a rejected promise', async ({ fetch }) => {
    const source = new BoundSupplySource({ fetch });
    // `.resolves` is the whole assertion: a REJECTION here would mean the
    // router's catch is load-bearing and its body is a real money decision.
    await expect(source.describe('pv-x')).resolves.toBeUndefined();
    await expect(source.economics('pv-x')).resolves.toBeUndefined();
    await expect(source.presence('pv-x')).resolves.toEqual(expect.objectContaining({ kind: expect.any(String) }));
  });

  it('AbsentSupplySource resolves too — an unconfigured Worker cannot throw its way to a 500', async () => {
    const absent = new AbsentSupplySource();
    await expect(absent.describe()).resolves.toBeUndefined();
    await expect(absent.economics()).resolves.toBeUndefined();
    await expect(absent.presence()).resolves.toEqual({ kind: 'unknown' });
  });
});
