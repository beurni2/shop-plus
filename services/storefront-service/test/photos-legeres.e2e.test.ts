import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance, type Seance } from './seance';

/**
 * ═══ PHOTOS-LEGERES-1 (AUDIT-4 B-02) — her photo's small copy, through the
 * app's OWN port, on the REAL Worker and a REAL bucket ═══
 *
 * Her cover and portrait reached every buyer at the size her phone uploaded
 * them (long edge up to 2048 px). Now her app sends a small copy right after
 * the photo is on her shop, and buyers ask `?v=petite`. The app's port
 * (`HttpStorefrontService`, imported from the app, never re-implemented)
 * uploads; the BUCKET, read back through the buyer's own route, decides:
 *   · `?v=petite` answers the small copy once it exists — and the photo itself
 *     before that, cached for an hour only, so the copy is picked up;
 *   · the photo's own address still answers the photo;
 *   · a copy made from a photo that is no longer on her shop is refused by
 *     name, and lands nowhere;
 *   · bounds: too wide, too heavy, not an image — refused by name;
 *   · another reseller cannot put a copy beside her photo.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'photos-legeres-'));
const MEDIA_PUBLIC_BASE = 'https://storefront-service.example.workers.dev';

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', COMPTES: 'ResellerAccountsDO' },
  r2Buckets: ['BUCKET'],
  durableObjectsPersist: persist,
  bindings: { CHECKOUT_OPS_SECRET: OPS_SECRET, MEDIA_PUBLIC_BASE },
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

let S: Seance;
let AUTRE: Seance;
beforeAll(async () => {
  S = await seance(mf, 'pl');
  AUTRE = await seance(mf, 'pl-autre');
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const { signal: _signal, ...reste } = init ?? {};
    return (await mf.dispatchFetch(url, reste as never)) as unknown as Response;
  }) as typeof fetch;
});

type App = typeof import('../../../apps/reseller-app/src/vitrine/service.js');
async function app(): Promise<App> {
  return import('../../../apps/reseller-app/src/vitrine/service.js');
}

/** A PNG the validator reads (signature + IHDR at w×h), padded to `taille` bytes
 *  with a marker so each upload's bytes can be told apart on the read-back. */
function png(w: number, h: number, taille: number, marque: number): Uint8Array {
  const b = new Uint8Array(taille);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x00, 0x00, 0x00, 0x0d], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  b.fill(marque, 32);
  return b;
}

/** THE BUYER'S LEDGER — what her phone downloads for an address. */
async function lire(adresse: string): Promise<{ status: number; taille: number; marque: number | undefined; cache: string | null }> {
  const path = adresse.slice(MEDIA_PUBLIC_BASE.length);
  const res = await mf.dispatchFetch(`http://c${path}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, taille: bytes.length, marque: bytes[40], cache: res.headers.get('cache-control') };
}

let seq = 0;
async function boutique(port: InstanceType<App['HttpStorefrontService']>, qui: Seance): Promise<string> {
  seq += 1;
  const id = `sf-pl-${String(seq).padStart(4, '0')}`;
  const created = await port.create({
    commandId: `c-pl-${seq}`, id, resellerId: qui.accountId, shortCode: `PL-${String(seq).padStart(4, '0')}`,
    name: 'Boutique légère', zone: 'Ouagadougou', category: 'Général', correlationId: `corr-pl-${seq}`,
  });
  expect(created.ok, JSON.stringify(created)).toBe(true);
  return id;
}

describe('PHOTOS-LEGERES-1 — her photo, and the small copy buyers download', () => {
  it('the cover: before the copy, its own photo for an hour; after, the copy; the photo address unchanged', async () => {
    const port = new (await app()).HttpStorefrontService('https://sf', async () => S.session);
    const id = await boutique(port, S);

    const grande = png(2048, 1536, 300_000, 7);
    const up = await port.uploadCover(id, grande, 'image/png');
    expect(up.ok, JSON.stringify(up)).toBe(true);
    const url = up.ok ? up.value.url : '';
    const lu = await port.getById(id);
    expect(lu.ok && lu.value?.cover.url, 'her shop points at the photo').toBe(url);

    const avant = await lire(`${url}?v=petite`);
    expect(avant).toMatchObject({ status: 200, taille: 300_000, marque: 7 });
    expect(avant.cache, 'the stand-in must not be kept for a year').toBe('public, max-age=3600');

    const envoi = await port.uploadPetite('cover', id, url, png(640, 480, 40_000, 9));
    expect(envoi).toEqual({ ok: true, value: { petite: true } });

    const apres = await lire(`${url}?v=petite`);
    expect(apres).toMatchObject({ status: 200, taille: 40_000, marque: 9 });
    expect(apres.cache).toBe('public, max-age=31536000, immutable');
    expect(await lire(url), 'the photo address still answers the photo').toMatchObject({ status: 200, taille: 300_000, marque: 7 });
  }, 120_000);

  it('the portrait, the same way', async () => {
    const port = new (await app()).HttpStorefrontService('https://sf', async () => S.session);
    const id = await boutique(port, S);
    const up = await port.uploadAvatar(id, png(1600, 1600, 200_000, 3), 'image/png');
    const url = up.ok ? up.value.url : '';
    expect((await port.uploadPetite('avatar', id, url, png(384, 384, 20_000, 4))).ok).toBe(true);
    expect(await lire(`${url}?v=petite`)).toMatchObject({ status: 200, taille: 20_000, marque: 4 });
  }, 120_000);

  it('a copy made from a photo she has since replaced is refused by name, and lands nowhere', async () => {
    const port = new (await app()).HttpStorefrontService('https://sf', async () => S.session);
    const id = await boutique(port, S);
    const un = await port.uploadCover(id, png(1200, 900, 100_000, 1), 'image/png');
    const deux = await port.uploadCover(id, png(1200, 900, 110_000, 2), 'image/png');
    const url1 = un.ok ? un.value.url : '';
    const url2 = deux.ok ? deux.value.url : '';
    expect(url1).not.toBe(url2);

    const tard = await port.uploadPetite('cover', id, url1, png(640, 480, 30_000, 5));
    expect(tard).toEqual({ ok: false, reason: 'photo_changed' });
    // Neither photo carries it: the old one's ask and the new one's ask both answer the photo itself.
    expect(await lire(`${url1}?v=petite`)).toMatchObject({ taille: 100_000, marque: 1 });
    expect(await lire(`${url2}?v=petite`)).toMatchObject({ taille: 110_000, marque: 2 });
    // A cover's copy named as a portrait's is refused the same way.
    expect(await port.uploadPetite('avatar', id, url2, png(384, 384, 20_000, 6))).toEqual({ ok: false, reason: 'photo_changed' });
  }, 120_000);

  it('the bounds: too wide, too heavy, not an image — refused by name, nothing stored', async () => {
    const port = new (await app()).HttpStorefrontService('https://sf', async () => S.session);
    const id = await boutique(port, S);
    const up = await port.uploadCover(id, png(1200, 900, 100_000, 1), 'image/png');
    const url = up.ok ? up.value.url : '';
    expect(await port.uploadPetite('cover', id, url, png(641, 480, 30_000, 5))).toEqual({ ok: false, reason: 'bad_dimensions' });
    expect(await port.uploadPetite('cover', id, url, png(640, 480, 160 * 1024 + 1, 5))).toEqual({ ok: false, reason: 'too_large' });
    expect(await port.uploadPetite('cover', id, url, new Uint8Array(2_000).fill(5))).toEqual({ ok: false, reason: 'unsupported_type' });
    expect(await lire(`${url}?v=petite`)).toMatchObject({ taille: 100_000, marque: 1 });
  }, 120_000);

  it('another reseller cannot put a copy beside her photo', async () => {
    const sienne = new (await app()).HttpStorefrontService('https://sf', async () => S.session);
    const id = await boutique(sienne, S);
    const up = await sienne.uploadCover(id, png(1200, 900, 100_000, 1), 'image/png');
    const url = up.ok ? up.value.url : '';
    const autre = new (await app()).HttpStorefrontService('https://sf', async () => AUTRE.session);
    const essai = await autre.uploadPetite('cover', id, url, png(640, 480, 30_000, 8));
    expect(essai.ok).toBe(false);
    expect(await lire(`${url}?v=petite`)).toMatchObject({ taille: 100_000, marque: 1 });
  }, 120_000);
});
