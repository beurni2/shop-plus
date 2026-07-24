import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DemoStorefrontService,
  HttpStorefrontService,
  WRITE_KEY_HEADER,
  deriveShortCode,
  resolveStorefrontService,
  type CreateStorefrontCommand,
} from '../src/vitrine/service';

/**
 * RESELLER-STOREFRONT-WRITE-1 — the write seam. The DEMO adapter is the CI/local
 * substrate (zero network); the HTTP adapter's REQUEST SHAPE (key header, method,
 * route, body) is asserted against a fetch stub, and its honesty (a non-2xx or a
 * network throw is `{ ok:false }`, never a thrown error) is proven here.
 *
 * BOUNDARY (stated, not hidden): a real device reaching the LIVE Worker is NOT
 * proven by these tests — only that the request the app WOULD send is correct.
 */

const CMD: CreateStorefrontCommand = {
  commandId: 'cmd-1',
  id: 'sf-test-1',
  resellerId: 'rs-1',
  shortCode: 'BOUTIK-0007',
  name: 'Boutique test',
  zone: 'Ouagadougou',
  category: 'Général',
  correlationId: 'corr-1',
  at: '2026-07-24T00:00:00.000Z',
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.EXPO_PUBLIC_STOREFRONT_BASE;
  delete process.env.EXPO_PUBLIC_STOREFRONT_WRITE_KEY;
});

describe('deriveShortCode — a valid [A-Z]{2,12}-[0-9]{4} always', () => {
  const RE = /^[A-Z]{2,12}-[0-9]{4}$/;
  it('strips accents and non-letters, upper-cases, caps at 12', () => {
    expect(deriveShortCode('Chez Aïcha Mode', '4821')).toMatch(RE);
    expect(deriveShortCode('Chez Aïcha Mode', '4821').startsWith('CHEZAICHAMOD')).toBe(true);
  });
  it('falls back to BOUTIK when < 2 ASCII letters, and pads short digit suffixes', () => {
    expect(deriveShortCode('妈妈', '7')).toBe('BOUTIK-7000');
    expect(deriveShortCode('都', '')).toBe('BOUTIK-0000');
  });
});

describe('DemoStorefrontService — the zero-network substrate', () => {
  it('create is idempotent on the id; list reflects live discoverable', async () => {
    const svc = new DemoStorefrontService();
    expect((await svc.create(CMD)).ok && (await svc.create(CMD)).ok).toBe(true);
    const first = await svc.create({ ...CMD, commandId: 'cmd-2' });
    expect(first).toEqual({ ok: true, value: { status: 'idempotent', slug: 'boutik-0007' } });

    await svc.publish(CMD.id, 'c', CMD.at);
    const listed = await svc.list();
    expect(listed.ok && listed.value).toEqual([{ id: 'sf-test-1', slug: 'boutik-0007', name: 'Boutique test', discoverable: true }]);

    await svc.uploadCover(CMD.id, new Uint8Array([1, 2, 3]), 'image/png');
    expect(svc.uploads).toEqual([{ kind: 'cover', storefrontId: 'sf-test-1', size: 3 }]);
  });
});

describe('HttpStorefrontService — the request the app WOULD send', () => {
  function stubFetch(status: number, body: unknown) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fn = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
    });
    vi.stubGlobal('fetch', fn);
    return calls;
  }

  it('create → POST /storefronts with the X-Write-Key header and the command body', async () => {
    const calls = stubFetch(200, { status: 'created', storefront: { slug: 'boutik-0007' } });
    const svc = new HttpStorefrontService('https://sf.example.dev/', 'SECRET-KEY');
    const r = await svc.create(CMD);
    expect(r).toEqual({ ok: true, value: { status: 'created', slug: 'boutik-0007' } });
    expect(calls[0]!.url).toBe('https://sf.example.dev/storefronts');
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>)[WRITE_KEY_HEADER]).toBe('SECRET-KEY');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual(CMD);
  });

  it('uploadCover → POST /media/upload?kind=cover&storefrontId=… with the key and raw bytes', async () => {
    const calls = stubFetch(201, { status: 'pending', url: '/media/storefronts/sf-test-1/cover/abc.png' });
    const svc = new HttpStorefrontService('https://sf.example.dev', 'SECRET-KEY');
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const r = await svc.uploadCover('sf-test-1', bytes, 'image/png');
    expect(r.ok && r.value.url).toBe('/media/storefronts/sf-test-1/cover/abc.png');
    expect(calls[0]!.url).toBe('https://sf.example.dev/media/upload?kind=cover&storefrontId=sf-test-1');
    expect((calls[0]!.init.headers as Record<string, string>)[WRITE_KEY_HEADER]).toBe('SECRET-KEY');
    expect(calls[0]!.init.body).toBe(bytes);
  });

  it('list → GET /storefronts with the key', async () => {
    const calls = stubFetch(200, [{ id: 'sf-test-1', slug: 'boutik-0007', name: 'B', discoverable: true }]);
    const svc = new HttpStorefrontService('https://sf.example.dev', 'SECRET-KEY');
    const r = await svc.list();
    expect(r.ok && r.value.length).toBe(1);
    expect(calls[0]!.init.method).toBe('GET');
    expect((calls[0]!.init.headers as Record<string, string>)[WRITE_KEY_HEADER]).toBe('SECRET-KEY');
  });

  it('a non-2xx is an honest { ok:false }, never a throw', async () => {
    stubFetch(401, { error: 'unauthorized' });
    const svc = new HttpStorefrontService('https://sf.example.dev', 'WRONG');
    expect(await svc.create(CMD)).toEqual({ ok: false, reason: 'http_401' });
  });

  it('a network throw is an honest { ok:false, reason:offline }, never a throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const svc = new HttpStorefrontService('https://sf.example.dev', 'K');
    expect(await svc.list()).toEqual({ ok: false, reason: 'offline' });
  });
});

describe('resolveStorefrontService — mock-gate by construction', () => {
  it('unset env → the demo adapter (no network)', () => {
    expect(resolveStorefrontService()).toBeInstanceOf(DemoStorefrontService);
  });
  it('base + key set → the real HTTP adapter', () => {
    process.env.EXPO_PUBLIC_STOREFRONT_BASE = 'https://sf.example.dev';
    process.env.EXPO_PUBLIC_STOREFRONT_WRITE_KEY = 'SECRET-KEY';
    expect(resolveStorefrontService()).toBeInstanceOf(HttpStorefrontService);
  });
  it('base without key → still demo (fail safe, never a keyless write)', () => {
    process.env.EXPO_PUBLIC_STOREFRONT_BASE = 'https://sf.example.dev';
    expect(resolveStorefrontService()).toBeInstanceOf(DemoStorefrontService);
  });
});
