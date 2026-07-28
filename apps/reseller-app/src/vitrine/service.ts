/**
 * RESELLER-STOREFRONT-WRITE-1 — the app's client to the LIVE storefront-service
 * write API. These are the reseller app's FIRST outbound calls: create + publish/
 * unpublish a storefront, upload its cover/avatar into R2, and list what exists.
 *
 * THE SEAM (founder ruling — a NEW port, not VitrineCollectionPort, which is
 * listings/discoverability and assumes a storefront already exists): the real HTTP
 * adapter sends the shared write key in `X-Write-Key`, base + key from
 * `EXPO_PUBLIC_*`. When either is unset the resolver returns **`null`** — see
 * RESELLER-SEAM-HONESTY-1 on `resolveStorefrontService` below. It used to return an
 * in-memory demo adapter that CANNOT FAIL, which turned an unset env into a SUCCESS
 * TOAST with nothing written; that adapter now lives in `service.demo.ts`, is
 * imported by tests only, and `scripts/gates/no-demo-adapter-in-bundle.mjs` proves it
 * is absent from the exported bundle by grepping the artifact.
 *
 * THE KEY LIMITATION (founder-accepted, journaled): the key ships inside the
 * published EAS-update bundle — easier to read than decompiling a binary. It stops
 * scanners, not a determined attacker; and being SHARED it cannot stop one reseller
 * writing to another's storefront. HARD GATE: no reseller but the founder onboards
 * until real per-reseller identity lands.
 *
 * RN-safe: no `@platform/*` runtime import (Metro law) — the command shape is
 * mirrored locally and the service validates it (an invalid `shortCode` is refused
 * server-side). The header name mirrors services/storefront-service/worker/auth.ts.
 */

// PERSONNALISER-REAL-1 — the storefront shape is the one the customize screens
// already mirror from canon (§3.1). TYPE-ONLY, so nothing new enters the RN
// bundle: one shape for the seam and the screens, never two that drift.
import type { Storefront } from './customize/storefront';

/** Must equal WRITE_KEY_HEADER in services/storefront-service/worker/auth.ts. */
export const WRITE_KEY_HEADER = 'X-Write-Key';

/** The service's `CreateStorefrontCommand` (storefront-core.ts), mirrored. `shortCode`
 * is validated to `[A-Z]{2,12}-[0-9]{4}` server-side; the canon slug DERIVES from it. */
export interface CreateStorefrontCommand {
  readonly commandId: string;
  readonly id: string;
  readonly resellerId: string;
  readonly shortCode: string;
  readonly name: string;
  readonly zone: string;
  readonly category: string;
  readonly correlationId: string;
  readonly at: string;
}

/** One row of the admin list (GET /storefronts). */
export interface StorefrontRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly discoverable: boolean;
}

/** Honest result — never claims success on a failed call (offline-first law). */
export type ServiceResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

export interface UploadOutcome {
  readonly status: string;
  readonly url: string;
}

/**
 * PUBLISH-PRICE-1 — what the app sends to list a product at HER markup.
 *
 * ═══ THERE IS NO PRICE FIELD HERE, AND THAT IS THE WHOLE POINT ═══
 *
 * The founder's ruling: **the app sends the MARKUP SHE CHOSE and nothing else about
 * money.** The service reads the live supply projection through its `OFFER` binding,
 * computes `customerPriceFcfa = basePrice + markup`, and freezes that. Two reasons,
 * and the second decides it:
 *   1. The app would otherwise be AUTHORING A SIGNED AMOUNT — the number a buyer is
 *      later charged — from a `basePrice` it happened to read earlier.
 *   2. **A service cannot validate a price it did not compute.** Given only
 *      `{markup, customerPriceFcfa}` there is no check that separates an honest
 *      client from a wrong one, because the base it would check against is exactly
 *      what it was not told.
 *
 * So `customerPriceFcfa` and `offerVersion` are ABSENT from this shape — not
 * optional, absent — and a price the app could send is therefore unrepresentable
 * rather than merely discouraged. `basePrice` and `resellerCommission` are absent
 * for the same reason: the service already knows them, live.
 *
 * IDS ARE DERIVED, NEVER RANDOM (the identity-mint lesson, RESELLER-IDENTITY-1):
 * `listingId` and `commandId` come from `{storefrontId, productVersionId}`, so a
 * re-tap resolves to `idempotent` instead of minting a second signed version. An
 * independently random command id would republish on every tap.
 */
export interface PublishListingRequest {
  readonly storefrontId: string;
  readonly resellerId: string;
  readonly productVersionId: string;
  /** M — the ONLY money value the app is trusted with, because she chose it. */
  readonly markup: number;
  readonly correlationId: string;
  readonly at: string;
}

/** Derived, never random — see `PublishListingRequest`. Stable per shop+product. */
export function listingIdFor(storefrontId: string, productVersionId: string): string {
  return `lst-${storefrontId}-${productVersionId}`;
}

/**
 * The write-side seam. Every method resolves to a `ServiceResult`: a network
 * failure or a non-2xx is `{ ok: false }` with a reason, NEVER a thrown error up
 * the UI (a queued/failed write is pending, never « en ligne »).
 */
/**
 * PERSONNALISER-REAL-1 — the presentation patch, the WIRE shape.
 *
 * Every field optional, absent = untouched: the K screens save one thing at a
 * time, and a patch that blanked what it did not mention would lose her work on
 * every save. No money field exists in this shape — presentation only (loi 5),
 * unrepresentable rather than merely unsent.
 */
export interface StorefrontIdentityPatch {
  readonly name?: string;
  readonly tagline?: string;
  readonly bio?: string;
  readonly theme?: string;
  readonly featuredItems?: readonly string[];
  readonly sections?: readonly { readonly id: string; readonly name: string; readonly pids: readonly string[] }[];
  /** HER ARRANGEMENT — the K5 ▲▼ order. The service accepts a PERMUTATION of what
   *  she already has and refuses anything that would add or drop a product:
   *  membership is earned by publishing, never changed by a reorder. */
  readonly curatedItems?: readonly string[];
}

export interface StorefrontServicePort {
  create(cmd: CreateStorefrontCommand): Promise<ServiceResult<{ status: string; slug: string | null }>>;
  /** PERSONNALISER-REAL-1 — HER shop as the service holds it. `undefined` value =
   *  the honest not-found (no shop under that id yet), never a fabricated seed. */
  getById(id: string): Promise<ServiceResult<Storefront | undefined>>;
  /** PERSONNALISER-REAL-1 — persist the presentation. The named refusal reasons
   *  (`name_too_short`, `featured_over_cap`, …) survive to her screen. */
  saveIdentity(id: string, patch: StorefrontIdentityPatch, at: string): Promise<ServiceResult<{ status: string }>>;
  publish(id: string, correlationId: string, at: string): Promise<ServiceResult<{ status: string }>>;
  unpublish(id: string, correlationId: string, at: string): Promise<ServiceResult<{ status: string }>>;
  uploadCover(storefrontId: string, bytes: Uint8Array, contentType: string): Promise<ServiceResult<UploadOutcome>>;
  uploadAvatar(storefrontId: string, bytes: Uint8Array, contentType: string): Promise<ServiceResult<UploadOutcome>>;
  list(): Promise<ServiceResult<readonly StorefrontRow[]>>;
  /**
   * PUBLISH-PRICE-1 — list a product at HER markup. The service signs the price.
   *
   * The reasons this can fail are DISTINCT and stay distinct all the way to her
   * screen: `supply_unavailable` means the offer could not be read right now and
   * she should try again; anything else is a fault. A refusal she can retry is the
   * correct failure — a price signed against a base nobody could read is not.
   */
  publishListing(req: PublishListingRequest): Promise<ServiceResult<{ status: string }>>;
}

/**
 * Derive a VALID `[A-Z]{2,12}-[0-9]{4}` short code from the shop name + a 4-digit
 * suffix the caller generates ONCE and persists (so a re-tap is idempotent, not a
 * second storefront). Accents are stripped (é→E); a name with < 2 ASCII letters
 * falls back to `BOUTIK`. Deterministic — no ML, no generation (loi 5).
 */
export function deriveShortCode(name: string, digitsSuffix: string): string {
  const letters = name.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 12);
  const stem = letters.length >= 2 ? letters : 'BOUTIK';
  const digits = (digitsSuffix.replace(/\D/g, '') + '0000').slice(0, 4);
  return `${stem}-${digits}`;
}

/* ---------------------------------------------------------------- HTTP -- */

/** The REAL adapter — the live Worker over `fetch`, keyed with `X-Write-Key`. */
export class HttpStorefrontService implements StorefrontServicePort {
  private readonly base: string;
  constructor(base: string, private readonly writeKey: string) {
    this.base = base.replace(/\/+$/, '');
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return { [WRITE_KEY_HEADER]: this.writeKey, ...extra };
  }

  private async postJson(path: string, body: unknown): Promise<ServiceResult<{ status: string; slug: string | null }>> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, reason: 'offline' };
    }
    const data = (await res.json().catch(() => null)) as { status?: string; storefront?: { slug?: string } } | null;
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    return { ok: true, value: { status: data?.status ?? 'ok', slug: data?.storefront?.slug ?? null } };
  }

  create(cmd: CreateStorefrontCommand): Promise<ServiceResult<{ status: string; slug: string | null }>> {
    return this.postJson('/storefronts', cmd);
  }

  /** PERSONNALISER-REAL-1 — the read. It SENDS the key (this app holds one and a
   *  keyed read costs nothing), but note honestly: only `GET /storefronts` (the
   *  list) is key-gated on the Worker today — `GET /storefronts/{id}` is not, so
   *  a guessed id can read a shop's curation uncredentialled. NO money is on that
   *  shape (no price, markup or commission), so nothing of loi 1/2 leaks; the gap
   *  is NAMED for the founder rather than closed inside a UI slice.
   *  A 404 is `{ok:true, value:undefined}` — an honest absence, not a retry. */
  async getById(id: string): Promise<ServiceResult<Storefront | undefined>> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/storefronts/${encodeURIComponent(id)}`, { headers: this.headers() });
    } catch {
      return { ok: false, reason: 'offline' };
    }
    if (res.status === 404) return { ok: true, value: undefined };
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const data = (await res.json().catch(() => null)) as Storefront | null;
    // A body that will not parse is a FAULT, never an empty shop: rendering
    // « pas encore de boutique » over a broken read is the disappearance family.
    if (data === null || typeof data.slug !== 'string') return { ok: false, reason: 'unreadable' };
    return { ok: true, value: data };
  }

  /**
   * PERSONNALISER-REAL-1 — save the presentation. The service's NAMED refusals
   * (422 `{status:'refused', reason}`) survive as that reason, because « votre nom
   * est trop court » and « c'est un défaut » are different things to tell her.
   */
  async saveIdentity(id: string, patch: StorefrontIdentityPatch, at: string): Promise<ServiceResult<{ status: string }>> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/storefronts/${encodeURIComponent(id)}/identity`, {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ patch, at }),
      });
    } catch {
      return { ok: false, reason: 'offline' };
    }
    const data = (await res.json().catch(() => null)) as { status?: string; reason?: string } | null;
    if (res.status === 422 && data?.reason) return { ok: false, reason: data.reason };
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    return { ok: true, value: { status: data?.status ?? 'saved' } };
  }

  publish(id: string, correlationId: string, at: string): Promise<ServiceResult<{ status: string }>> {
    return this.postJson(`/storefronts/${encodeURIComponent(id)}/publish`, { id, correlationId, at });
  }

  unpublish(id: string, correlationId: string, at: string): Promise<ServiceResult<{ status: string }>> {
    return this.postJson(`/storefronts/${encodeURIComponent(id)}/unpublish`, { id, correlationId, at });
  }

  private async upload(kind: 'cover' | 'avatar', storefrontId: string, bytes: Uint8Array, contentType: string): Promise<ServiceResult<UploadOutcome>> {
    const q = `?kind=${kind}&storefrontId=${encodeURIComponent(storefrontId)}`;
    let res: Response;
    try {
      res = await fetch(`${this.base}/media/upload${q}`, {
        method: 'POST',
        headers: this.headers({ 'Content-Type': contentType }),
        // RN fetch accepts a typed array as the raw body at runtime; the cast bridges
        // the RN `BodyInit_` typing at this one network boundary.
        body: bytes as unknown as BodyInit_,
      });
    } catch {
      return { ok: false, reason: 'offline' };
    }
    const data = (await res.json().catch(() => null)) as { status?: string; url?: string; error?: string } | null;
    // MEDIA-2 — KEEP THE SERVICE'S NAMED REASON, exactly as publishListing does.
    // Collapsing everything to `http_${status}` threw away `too_large`,
    // `bad_dimensions`, `storefront_absent` and `not_pointed` at this one line, so
    // every one of them reached her as the same « essayez une image plus légère » —
    // advice that fixes exactly one of them.
    if (!res.ok) return { ok: false, reason: data?.error ?? `http_${res.status}` };
    return { ok: true, value: { status: data?.status ?? 'pending', url: data?.url ?? '' } };
  }

  uploadCover(storefrontId: string, bytes: Uint8Array, contentType: string): Promise<ServiceResult<UploadOutcome>> {
    return this.upload('cover', storefrontId, bytes, contentType);
  }

  uploadAvatar(storefrontId: string, bytes: Uint8Array, contentType: string): Promise<ServiceResult<UploadOutcome>> {
    return this.upload('avatar', storefrontId, bytes, contentType);
  }

  /**
   * PUBLISH-PRICE-1 — POST /listings carrying the markup and no price at all.
   *
   * The service answers 409 `supply_unavailable` when it could not read the live
   * base, and 400 `markup_invalid` for a markup that is not a usable amount. Both
   * are surfaced with their NAMED reason rather than collapsed into `http_409`,
   * because « réessayez » and « c'est un défaut » are different things to tell her.
   */
  async publishListing(req: PublishListingRequest): Promise<ServiceResult<{ status: string }>> {
    const listingId = listingIdFor(req.storefrontId, req.productVersionId);
    let res: Response;
    try {
      res = await fetch(`${this.base}/listings`, {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          commandId: `publish-${listingId}`, // DERIVED — a re-tap is idempotent, not a second version
          listingId,
          storefrontId: req.storefrontId,
          resellerId: req.resellerId,
          productVersionId: req.productVersionId,
          markup: req.markup, // the ONLY money value the app sends
          correlationId: req.correlationId,
          at: req.at,
        }),
      });
    } catch {
      return { ok: false, reason: 'offline' };
    }
    const data = (await res.json().catch(() => null)) as { status?: string; error?: string } | null;
    // The service's own named refusal survives to the caller — collapsing it to the
    // HTTP code here would throw away the one word that decides what she is told.
    if (!res.ok) return { ok: false, reason: data?.error ?? `http_${res.status}` };
    return { ok: true, value: { status: data?.status ?? 'published' } };
  }

  async list(): Promise<ServiceResult<readonly StorefrontRow[]>> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/storefronts`, { method: 'GET', headers: this.headers() });
    } catch {
      return { ok: false, reason: 'offline' };
    }
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const rows = (await res.json().catch(() => null)) as StorefrontRow[] | null;
    return { ok: true, value: Array.isArray(rows) ? rows : [] };
  }
}

/* ------------------------------------------------------------ resolver -- */

/**
 * RESELLER-SEAM-HONESTY-1 — resolve the REAL HTTP client iff BOTH the base and the
 * write key are inlined at bundle time, else **`null`**. Dot access on
 * `process.env.EXPO_PUBLIC_*` (member-expression) so babel-preset-expo inlines them
 * — bracket access would survive to runtime unset.
 *
 * WHY `null` AND NOT A DEMO ADAPTER (the defect this replaces): returning
 * `DemoStorefrontService` meant an unset or mistyped env produced a SUCCESS TOAST
 * with nothing written anywhere — its `create`/`publish` cannot fail. `null` forces
 * the caller to have an honest UNCONFIGURED state instead of a false confirmation,
 * and the demo adapter now lives in `service.demo.ts`, imported by tests only, so it
 * is ABSENT from the published bundle rather than merely unselected.
 *
 * Both variables are set together or not at all: a base without a key would be a
 * keyless write the service refuses, so that combination resolves to `null` too.
 */
export function resolveStorefrontService(): StorefrontServicePort | null {
  const base = process.env.EXPO_PUBLIC_STOREFRONT_BASE;
  const key = process.env.EXPO_PUBLIC_STOREFRONT_WRITE_KEY;
  if (base && key) return new HttpStorefrontService(base, key);
  return null;
}
