/**
 * STOREFRONT-MEDIA-BACKING — the MediaStore adapter (the GCS boundary).
 *
 * THROUGH-A-SERVICE (never direct-to-bucket): the phone uploads to this service;
 * the service validates the bytes and writes them to storage via a SERVER-SIDE
 * client. The app never holds a bucket credential and never touches GCS. This
 * module is that server-side client, behind ONE swappable interface so every test
 * and CI run exercises the in-memory fake — never real GCS, never a credential.
 *
 * The real adapter reads its config from the ENVIRONMENT. When the bucket + token
 * are present (production) it writes the real bucket over the GCS JSON upload REST
 * API with `fetch` — no `@google-cloud/storage` dependency, so nothing enters the
 * lockfile or CI. When they are absent (CI/tests/local) `resolveMediaStore`
 * returns the in-memory fake. Credentials live only in the deploy environment.
 */

/** A stored object — the URL the buyer will eventually be served (once live). */
export interface StoredObject {
  readonly url: string;
}

/**
 * The one media-persistence port. `put` writes bytes at a key and returns the
 * object URL. Both the fake (tests/CI) and the real GCS client implement it; the
 * upload pipeline never knows which — the whole point of through-a-service.
 */
export interface MediaStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject>;
}

export class MediaStoreError extends Error {
  override readonly name = 'MediaStoreError';
}

/**
 * The FAKE store — CI, tests, and any environment without GCS credentials. Keeps
 * bytes in memory keyed by object key and returns a deterministic mock URL. It is
 * contract-certified: it stores the exact bytes it was given and hands back a URL
 * that round-trips to them, so a test can assert the full upload→store→URL path
 * without a real bucket. It never reaches the network.
 */
export class InMemoryMediaStore implements MediaStore {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  constructor(private readonly base = 'https://media.storefront.test') {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
    this.objects.set(key, { bytes, contentType });
    return { url: `${this.base}/${key}` };
  }
}

/**
 * The R2 binding, as the MINIMAL structural shape this module uses — so `src/`
 * stays free of `@cloudflare/workers-types` (the `StorefrontFetcher` precedent).
 * `env.BUCKET` in workerd is a native binding: no credential, no token minting.
 */
export interface R2ObjectBodyLike {
  /** The object bytes as a stream — handed straight to a `Response` on read. */
  readonly body: ReadableStream | null;
  readonly httpMetadata?: { readonly contentType?: string };
}
export interface R2BucketLike {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
}

/**
 * The REAL store on Cloudflare R2 (STOREFRONT-DEPLOY-1, founder ruling). Writes
 * the native binding — `env.BUCKET.put(key, bytes, { httpMetadata })` — no
 * credential, no token, no network client. The returned URL is the SERVICE's own
 * read route `GET /media/{key}` (the bucket is PRIVATE — never a public custom
 * domain, which would let anyone enumerate `media-${seq}` keys incl. held covers);
 * `publicBase` prefixes it with the deployed service origin when set. Exercised
 * only when `env.BUCKET` is bound; the mock store stands in everywhere else.
 */
export class R2MediaStore implements MediaStore {
  constructor(private readonly bucket: R2BucketLike, private readonly publicBase = '') {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
    await this.bucket.put(key, bytes, { httpMetadata: { contentType } });
    // THROUGH-A-SERVICE for reads too: the URL points at the Worker route, never
    // at the bucket directly. Relative when no base is configured (same origin).
    return { url: `${this.publicBase}/media/${encodeURI(key)}` };
  }
}

/** Real-adapter config, read from the environment (never committed). */
export interface GcsConfig {
  readonly bucket: string;
  /** A short-lived OAuth access token supplied by the deploy (metadata server / workload identity). */
  readonly token: string;
  /** Public read base for the served URL; defaults to the GCS public host. */
  readonly publicBase?: string;
}

/**
 * The REAL store — writes the GCS bucket over the JSON upload REST API with a
 * server-side bearer token. No SDK dependency (fetch only), so it adds nothing to
 * the lockfile or CI. Exercised ONLY when the environment supplies the bucket +
 * token; the mock store stands in everywhere else.
 */
export class GcsMediaStore implements MediaStore {
  constructor(private readonly cfg: GcsConfig) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
    const endpoint =
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.cfg.bucket)}/o` +
      `?uploadType=media&name=${encodeURIComponent(key)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': contentType, Authorization: `Bearer ${this.cfg.token}` },
      // Uint8Array is a valid BodyInit at runtime; the cast bridges the TS 5.7
      // `Uint8Array<ArrayBufferLike>` vs `BufferSource` narrowing at this boundary.
      body: bytes as BodyInit,
    });
    if (!res.ok) {
      throw new MediaStoreError(`GCS put failed for ${key}: HTTP ${res.status}`);
    }
    const base = this.cfg.publicBase ?? `https://storage.googleapis.com/${this.cfg.bucket}`;
    return { url: `${base}/${key}` };
  }
}

/** The environment the store resolves its config from (injected in workerd, else process.env). */
export interface MediaEnv {
  /** The R2 binding (native, no credential) — preferred when present. */
  readonly BUCKET?: R2BucketLike;
  /** The service's own origin, so R2 read URLs are absolute (`{base}/media/{key}`). */
  readonly MEDIA_PUBLIC_BASE?: string;
  readonly STOREFRONT_GCS_BUCKET?: string;
  readonly STOREFRONT_GCS_TOKEN?: string;
  readonly STOREFRONT_GCS_PUBLIC_BASE?: string;
}

/**
 * Pick the store from the environment: R2 iff the native `BUCKET` binding is
 * present (founder ruling — R2, not GCS), else GCS iff BOTH bucket and token are
 * present, else the in-memory fake. CI and tests bind none of the three, so they
 * can never reach real storage — the mock-gate is enforced by construction, not
 * by discipline. The order is R2 → GCS → in-memory.
 */
export function resolveMediaStore(env?: MediaEnv): MediaStore {
  // `globalThis.process` (not a bare `process` identifier) so this typechecks
  // under both the Node src config and the workerd worker config (no @types/node).
  const proc = (globalThis as { process?: { env?: unknown } }).process;
  const e: MediaEnv = env ?? ((proc?.env as MediaEnv | undefined) ?? {});
  if (e.BUCKET && typeof e.BUCKET.put === 'function') {
    return new R2MediaStore(e.BUCKET, e.MEDIA_PUBLIC_BASE ?? '');
  }
  if (e.STOREFRONT_GCS_BUCKET && e.STOREFRONT_GCS_TOKEN) {
    return new GcsMediaStore({
      bucket: e.STOREFRONT_GCS_BUCKET,
      token: e.STOREFRONT_GCS_TOKEN,
      ...(e.STOREFRONT_GCS_PUBLIC_BASE !== undefined ? { publicBase: e.STOREFRONT_GCS_PUBLIC_BASE } : {}),
    });
  }
  return new InMemoryMediaStore();
}
