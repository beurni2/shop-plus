import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpOfferSource, OFFERS_ROUTE } from '../src/vitrine/offers';
import { WRITE_KEY_HEADER } from '../src/vitrine/service';

/**
 * RESELLER-AUTH-1 (AUDIT-SHOP-1 slice a2a) — the supply read rides her session
 * exactly as the storefront adapter does: an `SPS-` bearer is presented as
 * `Authorization: Bearer`, a legacy `SP-` feed code is not, and a device with
 * no store sends what it always sent (the key alone).
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ offers: [] }) } as unknown as Response;
    }),
  );
  return calls;
}

describe('HttpOfferSource — the session on the supply read', () => {
  it('an SPS session rides as Authorization: Bearer, alongside the key, on the plural route', async () => {
    const calls = stubFetch();
    await new HttpOfferSource('https://sf.example.dev/', 'K', async () => 'SPS-AAAA-BBBB-CCCC-DDDD').list();
    expect(calls[0]!.url).toBe(`https://sf.example.dev${OFFERS_ROUTE}`);
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h['Authorization']).toBe('Bearer SPS-AAAA-BBBB-CCCC-DDDD');
    expect(h[WRITE_KEY_HEADER]).toBe('K');
  });

  it('a legacy SP- code, no store, or a store that throws: no Authorization header at all', async () => {
    const calls = stubFetch();
    await new HttpOfferSource('https://sf.example.dev', 'K', async () => 'SP-AAAA-BBBB-CCCC-DDDD').list();
    await new HttpOfferSource('https://sf.example.dev', 'K').list();
    await new HttpOfferSource('https://sf.example.dev', 'K', async () => { throw new Error('store down'); }).list();
    expect(calls).toHaveLength(3);
    for (const c of calls) expect('Authorization' in (c.init.headers as Record<string, string>)).toBe(false);
  });
});
