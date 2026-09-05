import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpOfferSource, OFFERS_ROUTE } from '../src/vitrine/offers';

/**
 * RESELLER-AUTH-1 (AUDIT-SHOP-1 slice a2a) — the supply read rides her session
 * exactly as the storefront adapter does: an `SPS-` bearer is presented as
 * `Authorization: Bearer`, a legacy `SP-` feed code is not. ACCES-ARME-2 — the
 * session is the ONLY credential: a device with no store sends none at all.
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
  it('an SPS session rides as Authorization: Bearer — and nothing else — on the plural route', async () => {
    const calls = stubFetch();
    await new HttpOfferSource('https://sf.example.dev/', async () => 'SPS-AAAA-BBBB-CCCC-DDDD').list();
    expect(calls[0]!.url).toBe(`https://sf.example.dev${OFFERS_ROUTE}`);
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h['Authorization']).toBe('Bearer SPS-AAAA-BBBB-CCCC-DDDD');
    expect(Object.keys(h).sort()).toEqual(['Accept', 'Authorization']);
  });

  it('a legacy SP- code, no store, or a store that throws: no Authorization header — and no credential of any other name', async () => {
    const calls = stubFetch();
    await new HttpOfferSource('https://sf.example.dev', async () => 'SP-AAAA-BBBB-CCCC-DDDD').list();
    await new HttpOfferSource('https://sf.example.dev').list();
    await new HttpOfferSource('https://sf.example.dev', async () => { throw new Error('store down'); }).list();
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(Object.keys(c.init.headers as Record<string, string>)).toEqual(['Accept']);
  });

  it('ACCES-ARME-2 — the offer source names no key: neither the retired env nor the retired header', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'vitrine', 'offers.ts'), 'utf8');
    expect(src).not.toMatch(/EXPO_PUBLIC_STOREFRONT_WRITE_KEY|X-Write-Key|WRITE_KEY_HEADER|writeKey/);
  });
});
