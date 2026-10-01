import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import {
  InMemoryMediaStore,
  PETITE_MAX_BYTES,
  PETITE_MAX_DIM,
  StorefrontMediaService,
  petiteKeyFor,
  validerPetite,
} from '../src/index.js';

/**
 * PHOTOS-LEGERES-1 (AUDIT-4 B-02) — the small copy's own bounds, and where it is
 * stored. The route itself (her current photo only, the read with its stand-in)
 * is driven on workerd in `photos-legeres.e2e.test.ts`.
 */
function png(w: number, h: number, taille = 32): Uint8Array {
  const b = new Uint8Array(taille);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x00, 0x00, 0x00, 0x0d], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}
function jpeg(w: number, h: number): Uint8Array {
  const b = new Uint8Array(20);
  b.set([0xff, 0xd8], 0);
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08], 2);
  const dv = new DataView(b.buffer);
  dv.setUint16(7, h);
  dv.setUint16(9, w);
  return b;
}

describe('validerPetite — an image, small in pixels and in bytes', () => {
  it('accepts a JPEG or PNG within 640 px and 80 KB, naming its real type', () => {
    expect(validerPetite(jpeg(640, 480))).toMatchObject({ ok: true, contentType: 'image/jpeg' });
    expect(validerPetite(png(384, 384))).toMatchObject({ ok: true, contentType: 'image/png' });
    expect(validerPetite(png(PETITE_MAX_DIM, PETITE_MAX_DIM, PETITE_MAX_BYTES))).toMatchObject({ ok: true });
  });
  it('refuses by name: empty · too heavy · not an image · too wide or tall · too small · no size', () => {
    expect(validerPetite(new Uint8Array(0))).toEqual({ ok: false, reason: 'empty' });
    expect(validerPetite(png(640, 480, PETITE_MAX_BYTES + 1))).toEqual({ ok: false, reason: 'too_large' });
    expect(validerPetite(new Uint8Array(64).fill(7))).toEqual({ ok: false, reason: 'unsupported_type' });
    expect(validerPetite(png(PETITE_MAX_DIM + 1, 100))).toEqual({ ok: false, reason: 'bad_dimensions' });
    expect(validerPetite(jpeg(100, PETITE_MAX_DIM + 1))).toEqual({ ok: false, reason: 'bad_dimensions' });
    expect(validerPetite(png(31, 200))).toEqual({ ok: false, reason: 'bad_dimensions' });
    expect(validerPetite(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toEqual({ ok: false, reason: 'bad_dimensions' });
  });
});

describe('putPetite — beside its photo, under a derived key', () => {
  it('stores the bytes at {photoKey}~p and nowhere else', async () => {
    const store = new InMemoryMediaStore();
    const svc = new StorefrontMediaService(store);
    const cle = 'storefronts/sf-1/cover/abc.jpeg';
    const octets = jpeg(640, 480);
    await svc.putPetite(cle, octets, 'image/jpeg');
    expect(petiteKeyFor(cle)).toBe(`${cle}~p`);
    expect([...store.objects.keys()]).toEqual([`${cle}~p`]);
    expect(store.objects.get(`${cle}~p`)).toEqual({ bytes: octets, contentType: 'image/jpeg' });
  });
});

/**
 * Verifier MAJOR 1 — the stand-in's short cache cost buyers bytes on every shop
 * that existed before this change: no copy ever comes for an older photo (the
 * app sends one only right after a new pick), so `?v=petite` served the full
 * photo with a one-hour cache where the bare address had a one-year one. Only a
 * FRESH photo may still be waiting for its copy.
 */
describe('?v=petite without a copy — a short cache only while one may still come', () => {
  const objet = (uploaded: Date) => ({
    body: new Blob([new Uint8Array(100)]).stream(),
    httpMetadata: { contentType: 'image/jpeg' },
    size: 100,
    uploaded,
  });
  const lire = async (uploaded: Date): Promise<Response> => {
    const BUCKET = {
      put: async () => undefined,
      get: async (key: string) => (key.endsWith('~p') ? null : objet(uploaded)),
    };
    return worker.fetch(new Request('https://storefront-service.shop.internal/media/storefronts/sf-1/cover/a.jpeg?v=petite'), { BUCKET } as never);
  };
  it('a photo older than a day keeps the year-long cache the bare address has', async () => {
    const r = await lire(new Date(Date.now() - 2 * 24 * 3600_000));
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });
  it('a photo uploaded just now is cached one hour, so its copy is picked up when it lands', async () => {
    const r = await lire(new Date(Date.now() - 60_000));
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('public, max-age=3600');
  });
});
