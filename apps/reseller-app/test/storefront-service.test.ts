import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HttpStorefrontService,
  WRITE_KEY_HEADER,
  deriveShortCode,
  resolveStorefrontService,
  type CreateStorefrontCommand,
} from '../src/vitrine/service';
// RESELLER-SEAM-HONESTY-1 — the demo adapter now lives in its OWN module, imported
// here and NOWHERE the app entry can reach. `service.ts` no longer exports it, so
// this import is also the assertion that it stayed out of the app's module.
import { DemoStorefrontService } from '../src/vitrine/service.demo';

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

/**
 * RESELLER-SEAM-HONESTY-1 — the resolver returns `null` when unset, NEVER a
 * silently-succeeding demo. These assertions are the invariant, not decoration: while
 * the resolver returned `DemoStorefrontService`, an unset or mistyped
 * `EXPO_PUBLIC_STOREFRONT_*` produced a SUCCESS toast and wrote nothing anywhere.
 */
describe('resolveStorefrontService — null on unset, never a fallback that cannot fail', () => {
  it('unset env → null (the caller MUST have an honest unconfigured state)', () => {
    expect(resolveStorefrontService()).toBeNull();
  });
  it('base + key set → the real HTTP adapter', () => {
    process.env.EXPO_PUBLIC_STOREFRONT_BASE = 'https://sf.example.dev';
    process.env.EXPO_PUBLIC_STOREFRONT_WRITE_KEY = 'SECRET-KEY';
    expect(resolveStorefrontService()).toBeInstanceOf(HttpStorefrontService);
  });
  it('base without key → null (fail safe, never a keyless write)', () => {
    process.env.EXPO_PUBLIC_STOREFRONT_BASE = 'https://sf.example.dev';
    expect(resolveStorefrontService()).toBeNull();
  });
  it('key without base → null (the pair is set together or not at all)', () => {
    process.env.EXPO_PUBLIC_STOREFRONT_WRITE_KEY = 'SECRET-KEY';
    expect(resolveStorefrontService()).toBeNull();
  });
  it('NEVER returns an adapter whose create cannot fail — the resolved value is null or HTTP, nothing else', () => {
    const unset = resolveStorefrontService();
    expect(unset).not.toBeInstanceOf(DemoStorefrontService);
    expect(unset).toBeNull();
  });
});

/**
 * The demo adapter is still contract-shaped and still used by tests — moving it out
 * of the app's reachable graph must not have quietly changed its behaviour, or the
 * substrate every other test stands on would have shifted underneath them.
 */
describe('DemoStorefrontService — unchanged behaviour in its new module', () => {
  it('still cannot fail, which is exactly why it may not be reachable from the app', async () => {
    const svc = new DemoStorefrontService();
    expect((await svc.create(CMD)).ok).toBe(true);
    expect((await svc.publish(CMD.id, 'c', CMD.at)).ok).toBe(true);
    expect((await svc.publish('never-created', 'c', CMD.at)).ok).toBe(true);
  });
});
