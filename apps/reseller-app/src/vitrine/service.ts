/**
 * RESELLER-STOREFRONT-WRITE-1 — the app's client to the LIVE storefront-service
 * write API. These are the reseller app's FIRST outbound calls: create + publish/
 * unpublish a storefront, upload its cover/avatar into R2, and list what exists.
 *
 * THE SEAM (founder ruling — a NEW port, not VitrineCollectionPort, which is
 * listings/discoverability and assumes a storefront already exists): the real HTTP
 * adapter sends the shared write key in `X-Write-Key`, base + key from
 * `EXPO_PUBLIC_*`. When either is unset the resolver returns the in-memory DEMO
 * adapter, so tests and local runs make ZERO network calls — the `resolveMediaStore`
 * mock-gate-by-construction, never a discipline.
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
 * The write-side seam. Every method resolves to a `ServiceResult`: a network
 * failure or a non-2xx is `{ ok: false }` with a reason, NEVER a thrown error up
 * the UI (a queued/failed write is pending, never « en ligne »).
 */
export interface StorefrontServicePort {
  create(cmd: CreateStorefrontCommand): Promise<ServiceResult<{ status: string; slug: string | null }>>;
  publish(id: string, correlationId: string, at: string): Promise<ServiceResult<{ status: string }>>;
  unpublish(id: string, correlationId: string, at: string): Promise<ServiceResult<{ status: string }>>;
  uploadCover(storefrontId: string, bytes: Uint8Array, contentType: string): Promise<ServiceResult<UploadOutcome>>;
  uploadAvatar(storefrontId: string, bytes: Uint8Array, contentType: string): Promise<ServiceResult<UploadOutcome>>;
  list(): Promise<ServiceResult<readonly StorefrontRow[]>>;
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
    const data = (await res.json().catch(() => null)) as { status?: string; url?: string } | null;
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    return { ok: true, value: { status: data?.status ?? 'pending', url: data?.url ?? '' } };
  }

  uploadCover(storefrontId: string, bytes: Uint8Array, contentType: string): Promise<ServiceResult<UploadOutcome>> {
    return this.upload('cover', storefrontId, bytes, contentType);
  }

  uploadAvatar(storefrontId: string, bytes: Uint8Array, contentType: string): Promise<ServiceResult<UploadOutcome>> {
    return this.upload('avatar', storefrontId, bytes, contentType);
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

/* ---------------------------------------------------------------- DEMO -- */

/**
 * The in-memory DEMO adapter — CI/local/tests, ZERO network. It applies the same
 * rules the service does (create is idempotent on the storefront id; the list
 * returns live discoverable), so a test exercises the whole flow with no Worker.
 */
export class DemoStorefrontService implements StorefrontServicePort {
  private readonly stores = new Map<string, { slug: string; name: string; discoverable: boolean }>();
  readonly uploads: { kind: string; storefrontId: string; size: number }[] = [];

  async create(cmd: CreateStorefrontCommand): Promise<ServiceResult<{ status: string; slug: string | null }>> {
    const slug = cmd.shortCode.toLowerCase();
    if (this.stores.has(cmd.id)) return { ok: true, value: { status: 'idempotent', slug } };
    this.stores.set(cmd.id, { slug, name: cmd.name, discoverable: false });
    return { ok: true, value: { status: 'created', slug } };
  }

  async publish(id: string, _correlationId?: string, _at?: string): Promise<ServiceResult<{ status: string }>> {
    const s = this.stores.get(id);
    if (!s) return { ok: true, value: { status: 'absent' } };
    s.discoverable = true;
    return { ok: true, value: { status: 'changed' } };
  }

  async unpublish(id: string, _correlationId?: string, _at?: string): Promise<ServiceResult<{ status: string }>> {
    const s = this.stores.get(id);
    if (!s) return { ok: true, value: { status: 'absent' } };
    s.discoverable = false;
    return { ok: true, value: { status: 'changed' } };
  }

  async uploadCover(storefrontId: string, bytes: Uint8Array, _contentType?: string): Promise<ServiceResult<UploadOutcome>> {
    this.uploads.push({ kind: 'cover', storefrontId, size: bytes.length });
    return { ok: true, value: { status: 'pending', url: `demo://cover/${storefrontId}` } };
  }

  async uploadAvatar(storefrontId: string, bytes: Uint8Array, _contentType?: string): Promise<ServiceResult<UploadOutcome>> {
    this.uploads.push({ kind: 'avatar', storefrontId, size: bytes.length });
    return { ok: true, value: { status: 'pending', url: `demo://avatar/${storefrontId}` } };
  }

  async list(): Promise<ServiceResult<readonly StorefrontRow[]>> {
    return {
      ok: true,
      value: [...this.stores.entries()].map(([id, s]) => ({ id, slug: s.slug, name: s.name, discoverable: s.discoverable })),
    };
  }
}

/* ------------------------------------------------------------ resolver -- */

/**
 * Pick the adapter from the environment: the REAL HTTP client iff BOTH the base
 * and the write key are inlined at bundle time, else the in-memory demo. Dot
 * access on `process.env.EXPO_PUBLIC_*` (member-expression) so babel-preset-expo
 * inlines them — bracket access would survive to runtime unset. Unset ⇒ demo, so
 * a preview bundle with no secrets configured, and every test, makes no network call.
 */
export function resolveStorefrontService(): StorefrontServicePort {
  const base = process.env.EXPO_PUBLIC_STOREFRONT_BASE;
  const key = process.env.EXPO_PUBLIC_STOREFRONT_WRITE_KEY;
  if (base && key) return new HttpStorefrontService(base, key);
  return new DemoStorefrontService();
}
