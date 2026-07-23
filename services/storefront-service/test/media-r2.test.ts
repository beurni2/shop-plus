import { describe, expect, it } from 'vitest';
import {
  GcsMediaStore,
  InMemoryMediaStore,
  R2MediaStore,
  resolveMediaStore,
  type R2BucketLike,
  type R2ObjectBodyLike,
} from '../src/media/media-store.js';

/**
 * STOREFRONT-DEPLOY-1 — the R2 store + the widened resolver (R2 → GCS → in-memory).
 * The mock-gate-by-construction is preserved: no binding ⇒ the in-memory fake,
 * so CI/tests can never reach real storage. The full R2 write→read round-trip is
 * proven on real workerd in combined-worker.e2e.test.ts; here the unit level pins
 * the precedence and the through-a-service read URL.
 */

/** A fake R2 binding recording puts (never a real bucket). */
function fakeBucket(): R2BucketLike & { puts: Array<{ key: string; contentType?: string }> } {
  const puts: Array<{ key: string; contentType?: string }> = [];
  return {
    puts,
    async put(key, _value, options) {
      puts.push({ key, ...(options?.httpMetadata?.contentType !== undefined ? { contentType: options.httpMetadata.contentType } : {}) });
      return {};
    },
    async get(): Promise<R2ObjectBodyLike | null> {
      return null;
    },
  };
}

describe('R2MediaStore — writes the native binding, returns the through-a-service read URL', () => {
  it('put calls env.BUCKET.put with the contentType and returns the /media/{key} route URL', async () => {
    const bucket = fakeBucket();
    const store = new R2MediaStore(bucket);
    const out = await store.put('storefronts/sf-1/cover/abc.png', new Uint8Array([1, 2, 3]), 'image/png');
    expect(bucket.puts).toEqual([{ key: 'storefronts/sf-1/cover/abc.png', contentType: 'image/png' }]);
    expect(out.url).toBe('/media/storefronts/sf-1/cover/abc.png'); // the Worker route, never the bucket
  });

  it('a configured public base makes the read URL absolute', async () => {
    const store = new R2MediaStore(fakeBucket(), 'https://storefront.example.workers.dev');
    const out = await store.put('storefronts/sf-1/voice/x.wav', new Uint8Array([1]), 'audio/wav');
    expect(out.url).toBe('https://storefront.example.workers.dev/media/storefronts/sf-1/voice/x.wav');
  });
});

describe('resolveMediaStore — R2 → GCS → in-memory, mock-gate by construction', () => {
  it('an R2 binding wins → R2MediaStore', () => {
    expect(resolveMediaStore({ BUCKET: fakeBucket() })).toBeInstanceOf(R2MediaStore);
  });

  it('R2 takes precedence over GCS when both are present', () => {
    const store = resolveMediaStore({ BUCKET: fakeBucket(), STOREFRONT_GCS_BUCKET: 'b', STOREFRONT_GCS_TOKEN: 't' });
    expect(store).toBeInstanceOf(R2MediaStore);
  });

  it('GCS creds without R2 → GcsMediaStore', () => {
    expect(resolveMediaStore({ STOREFRONT_GCS_BUCKET: 'b', STOREFRONT_GCS_TOKEN: 't' })).toBeInstanceOf(GcsMediaStore);
  });

  it('NO binding (CI/tests/local) → the in-memory fake, never real storage', () => {
    expect(resolveMediaStore({})).toBeInstanceOf(InMemoryMediaStore);
    expect(resolveMediaStore()).toBeInstanceOf(InMemoryMediaStore);
  });
});
