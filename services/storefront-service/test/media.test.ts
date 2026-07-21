import { describe, expect, it } from 'vitest';
import worker, {
  InMemoryMediaStore,
  GcsMediaStore,
  resolveMediaStore,
  StorefrontMediaService,
  IMAGE_MAX_BYTES,
} from '../src/index.js';

/**
 * STOREFRONT-MEDIA-BACKING — the through-a-service media backend, gated entirely
 * against the in-memory fake store (no GCS, no credentials). Proves the four
 * required behaviours: upload→validate→store→URL round-trips · oversized/wrong-type
 * rejected · pending/« vérification » hold the file unpublished · the buyer only
 * ever receives a live URL.
 */

const NOW = '2026-07-21T12:00:00.000Z';

/** A minimal but REAL png/jpeg/wav header the validator parses (magic bytes + dims). */
function pngBytes(w: number, h: number): Uint8Array {
  const b = new Uint8Array(32);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
  b.set([0x00, 0x00, 0x00, 0x0d], 8); // IHDR length (13)
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}
function jpegBytes(w: number, h: number): Uint8Array {
  const b = new Uint8Array(20);
  b.set([0xff, 0xd8], 0); // SOI
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08], 2); // SOF0 · length · precision
  const dv = new DataView(b.buffer);
  dv.setUint16(7, h); // height (i+5, i=2)
  dv.setUint16(9, w); // width  (i+7)
  return b;
}
function wavBytes(n = 64): Uint8Array {
  const b = new Uint8Array(Math.max(n, 12));
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  return b;
}
const svc = (): StorefrontMediaService => new StorefrontMediaService(new InMemoryMediaStore());

describe('the mock-gate — CI/tests never reach GCS', () => {
  it('resolves the in-memory store with no credentials, the real GCS store only when the env supplies them', () => {
    expect(resolveMediaStore({})).toBeInstanceOf(InMemoryMediaStore);
    expect(resolveMediaStore({ STOREFRONT_GCS_BUCKET: 'b' })).toBeInstanceOf(InMemoryMediaStore); // token missing → still mock
    expect(resolveMediaStore({ STOREFRONT_GCS_BUCKET: 'b', STOREFRONT_GCS_TOKEN: 't' })).toBeInstanceOf(GcsMediaStore);
  });
});

describe('upload → validate → store → URL round-trips', () => {
  it('a valid image is stored and the returned URL maps to the exact bytes', async () => {
    const store = new InMemoryMediaStore();
    const s = new StorefrontMediaService(store);
    const bytes = pngBytes(1200, 800);
    const out = await s.upload({ storefrontId: 'sf_aicha', kind: 'cover', bytes, at: NOW });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.record.url).toContain('storefronts/sf_aicha/cover/');
    expect(out.record.width).toBe(1200);
    expect(out.record.height).toBe(800);
    const key = out.record.url.replace('https://media.storefront.test/', '');
    expect(store.objects.get(key)?.bytes).toEqual(bytes); // exact bytes round-trip
    expect(store.objects.get(key)?.contentType).toBe('image/png');
  });

  it('jpeg is accepted (magic bytes, not the declared type); voice stores its duration', async () => {
    const s = svc();
    const img = await s.upload({ storefrontId: 'sf', kind: 'avatar', bytes: jpegBytes(600, 600), at: NOW });
    expect(img.ok && img.record.contentType).toBe('image/jpeg');
    const voice = await s.upload({ storefrontId: 'sf', kind: 'voice', pid: 'p1', bytes: wavBytes(), durationMs: 8_000, at: NOW });
    expect(voice.ok && voice.record.durationMs).toBe(8_000);
    expect(voice.ok && voice.record.contentType).toBe('audio/wav');
  });
});

describe('oversized / wrong-type / bad input rejected (never stored)', () => {
  it('a non-image is refused by magic-byte sniff, not the declared type', async () => {
    const store = new InMemoryMediaStore();
    const s = new StorefrontMediaService(store);
    const out = await s.upload({ storefrontId: 'sf', kind: 'cover', bytes: new Uint8Array([1, 2, 3, 4, 5]), at: NOW });
    expect(out).toEqual({ ok: false, reason: 'unsupported_type' });
    expect(store.objects.size).toBe(0); // nothing stored on a refusal
  });
  it('over the byte cap is refused; over the dimension standard is refused', async () => {
    const s = svc();
    const huge = pngBytes(1000, 1000);
    const padded = new Uint8Array(IMAGE_MAX_BYTES + 1);
    padded.set(huge, 0);
    expect(await s.upload({ storefrontId: 'sf', kind: 'cover', bytes: padded, at: NOW })).toEqual({ ok: false, reason: 'too_large' });
    expect(await s.upload({ storefrontId: 'sf', kind: 'cover', bytes: pngBytes(4000, 3000), at: NOW })).toEqual({ ok: false, reason: 'bad_dimensions' });
    expect(await s.upload({ storefrontId: 'sf', kind: 'cover', bytes: pngBytes(50, 50), at: NOW })).toEqual({ ok: false, reason: 'bad_dimensions' });
  });
  it('voice needs a pid and a sane duration', async () => {
    const s = svc();
    expect(await s.upload({ storefrontId: 'sf', kind: 'voice', bytes: wavBytes(), durationMs: 8_000, at: NOW })).toEqual({ ok: false, reason: 'missing_pid' });
    expect(await s.upload({ storefrontId: 'sf', kind: 'voice', pid: 'p1', bytes: wavBytes(), durationMs: 90_000, at: NOW })).toEqual({ ok: false, reason: 'bad_duration' });
    expect(await s.upload({ storefrontId: 'sf', kind: 'voice', pid: 'p1', bytes: new Uint8Array([1, 2, 3]), durationMs: 5_000, at: NOW })).toEqual({ ok: false, reason: 'unsupported_type' });
  });
});

describe('moderation — cover/avatar are held STORED-BUT-NOT-LIVE; the buyer only ever sees live', () => {
  it('a held cover/avatar is stored but the buyer sees neither until review passes', async () => {
    const s = svc();
    const cover = await s.upload({ storefrontId: 'sf', kind: 'cover', bytes: pngBytes(1200, 800), at: NOW });
    const avatar = await s.upload({ storefrontId: 'sf', kind: 'avatar', bytes: pngBytes(600, 600), at: NOW });
    expect(cover.ok && cover.record.status).toBe('pending_review'); // « pending »
    expect(avatar.ok && avatar.record.status).toBe('pending_review'); // « vérification Séra »

    // held → the buyer projection emits NEITHER
    expect(s.buyerMedia('sf').cover).toEqual({ status: 'none' });
    expect(s.buyerMedia('sf').avatar).toEqual({ mode: 'monogram' });

    // Séra review passes on the cover → it goes live → buyer now sees it
    if (cover.ok) s.approve(cover.record.id);
    expect(s.buyerMedia('sf').cover).toEqual({ status: 'live', url: cover.ok ? cover.record.url : '' });
    // avatar still held → buyer still monogram
    expect(s.buyerMedia('sf').avatar).toEqual({ mode: 'monogram' });

    // review refuses the avatar → it never goes live
    if (avatar.ok) s.reject(avatar.record.id);
    expect(s.buyerMedia('sf').avatar).toEqual({ mode: 'monogram' });
  });

  it('a voice note carries no review — it is live on store and buyer-visible as ready', async () => {
    const s = svc();
    const voice = await s.upload({ storefrontId: 'sf', kind: 'voice', pid: 'p1', bytes: wavBytes(), durationMs: 8_000, at: NOW });
    expect(voice.ok && voice.record.status).toBe('live');
    expect(s.buyerMedia('sf').notes['p1']).toEqual({ status: 'ready', url: voice.ok ? voice.record.url : '', durationMs: 8_000 });
    // a product with no note is absent (no gap)
    expect(s.buyerMedia('sf').notes['p2']).toBeUndefined();
  });
});

describe('the upload endpoint (through-a-service HTTP path)', () => {
  it('POST /media/upload stores and returns the reseller view', async () => {
    const res = await worker.fetch(
      new Request('https://storefront-service.shop.internal/media/upload?storefrontId=sf&kind=voice&pid=p1&durationMs=8000', {
        method: 'POST',
        body: wavBytes().buffer,
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { kind: string; status: string; url: string };
    expect(body.kind).toBe('voice');
    expect(body.status).toBe('live');
    expect(body.url).toContain('storefronts/sf/voice/');
  });

  it('a refused upload is a 400 with the reason; a bad route stays 404', async () => {
    const bad = await worker.fetch(
      new Request('https://storefront-service.shop.internal/media/upload?storefrontId=sf&kind=cover', {
        method: 'POST',
        body: new Uint8Array([1, 2, 3]).buffer,
      }),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('unsupported_type');

    const notFound = await worker.fetch(new Request('https://storefront-service.shop.internal/nope'));
    expect(notFound.status).toBe(404);
  });
});
