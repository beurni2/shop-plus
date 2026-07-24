/**
 * THE SUPPLY SOURCE (REAL-PRODUCT-RENDER-1 piece (a)) — where a listing's
 * DISPLAY data comes from. A listing carries `productVersionId`; the product's
 * NAME and IMAGES live on the supply projection (canon v2.0.0
 * `SupplyProjection.productName` / `.assetRefs`). This port is the join's supply
 * side, resolved SERVER-SIDE so supplier economics never leave the Worker.
 *
 * ═══ THE MOCK IS NOT THE FALLBACK (founder ruling — the load-bearing rule) ═══
 *
 * Every other env-gated fallback in this system falls back to something EMPTY:
 * `resolveMediaStore` → in-memory, `resolveStorefrontStore` → in-memory. Empty is
 * safe. A supply port is DIFFERENT: the certified mock is POPULATED — it emits
 * `productName` and `assetRefs` for invented products. A deployed Worker that
 * quietly resolved to the mock would serve FABRICATED product names and
 * FABRICATED image refs to a real buyer on a real shop: the exact
 * mock-wearing-real-infrastructure failure refused for listings, arriving through
 * a door we opened ourselves.
 *
 * So the fallback is ABSENT, never mock:
 *   · configured (`SUPPLY_BASE`) → the real HTTP client;
 *   · NOT configured             → `AbsentSupplySource`, which describes NOTHING.
 *
 * UNREACHABLE BY CONSTRUCTION, NOT BY DISCIPLINE: this module — and the whole
 * deployed composition root — imports NO mock. There is no env value, no flag and
 * no misconfiguration that can reach fabricated supply data, because the code path
 * does not exist in the bundle. Tests inject their own mock through the PORT.
 * `test/supply-source.test.ts` fails if a mock ever becomes reachable from here.
 *
 * ABSENT IS THE DEFAULT TODAY, and that is honest: no supply wire exists between
 * the repos yet, so an unconfigured Worker describes no product — and the buyer
 * surface renders its designed empty/partial state rather than inventing one.
 */

/** What supply contributes to a buyer-visible product: its name and its images. */
export interface ProductDescription {
  readonly productName: string;
  /** Bare display refs (canon `assetRefs`); `[0]` is the hero. May be empty. */
  readonly assetRefs: readonly string[];
}

/** The join's supply side. `undefined` = this product cannot be described. */
export interface SupplySourcePort {
  describe(productVersionId: string): Promise<ProductDescription | undefined>;
}

/** Configured out-of-band; absent in CI and absent today (no supply wire exists). */
export interface SupplySourceEnv {
  readonly SUPPLY_BASE?: string;
}

/**
 * ABSENT — describes nothing, ever. The honest state when no supply source is
 * configured: the service knows a listing exists and knows HER price, but cannot
 * say what the product IS, so it says nothing rather than something invented.
 */
export class AbsentSupplySource implements SupplySourcePort {
  async describe(): Promise<undefined> {
    return undefined;
  }
}

/**
 * The REAL client. A non-2xx, a network failure, or a payload that is not
 * description-shaped all resolve to `undefined` — the SAME honest absence, never
 * a throw up the read path and never a partially-invented product.
 */
export class HttpSupplySource implements SupplySourcePort {
  private readonly base: string;
  constructor(base: string) {
    this.base = base.replace(/\/+$/, '');
  }

  async describe(productVersionId: string): Promise<ProductDescription | undefined> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/supply/${encodeURIComponent(productVersionId)}`, {
        headers: { Accept: 'application/json' },
      });
    } catch {
      return undefined; // unreachable → absent, never fabricated
    }
    if (!res.ok) return undefined;
    const body: unknown = await res.json().catch(() => null);
    return toDescription(body);
  }
}

/**
 * Accept ONLY a description-shaped payload. A supplier-identity key anywhere on
 * the payload is refused outright (SP-I03): display data may cross this boundary,
 * identity may not. Mirrors the supply-consumer's leak sweep.
 */
const IDENTITY_LEAK = /supplier[_-]?(id|name|phone|contact)|phone|whatsapp|pickup|adresse|address/i;
export function toDescription(body: unknown): ProductDescription | undefined {
  if (body === null || typeof body !== 'object') return undefined;
  const raw = body as Record<string, unknown>;
  if (Object.keys(raw).some((k) => IDENTITY_LEAK.test(k))) return undefined;
  const name = raw['productName'];
  const refs = raw['assetRefs'];
  if (typeof name !== 'string' || name.trim() === '') return undefined;
  if (!Array.isArray(refs) || refs.some((r) => typeof r !== 'string')) return undefined;
  return { productName: name, assetRefs: [...(refs as string[])] };
}

/**
 * Pick the supply source from the environment. Configured ⇒ the real client;
 * otherwise ABSENT. There is deliberately NO third branch: the mock is not
 * reachable from here, by construction.
 */
export function resolveSupplySource(env?: SupplySourceEnv): SupplySourcePort {
  const base = env?.SUPPLY_BASE;
  return base !== undefined && base !== '' ? new HttpSupplySource(base) : new AbsentSupplySource();
}
