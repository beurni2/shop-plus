import { describe, expect, it } from 'vitest';
import worker, { SERVICE_NAME } from '../src/index.js';

describe(SERVICE_NAME, () => {
  it('serves /health and names itself', async () => {
    const res = await worker.fetch(new Request('https://storefront-service.shop.internal/health'));
    expect(res.status).toBe(200);
    // SERVICE-PROVENANCE-1 — the 200 now also answers WHICH BUILD is live
    // (`release`) and WHICH WIRE SHAPE it speaks (`canon`). Unbundled here, so both
    // are the honest `dev`; a deployed build carries the sha and the pinned
    // contracts version. Asserted exactly, so a field appearing or vanishing fails.
    expect(await res.json()).toEqual({ service: SERVICE_NAME, status: 'ok', release: 'dev', canon: 'dev' });
    // THE FRESHNESS INSTRUMENT MUST NOT BE CACHEABLE (founder finding on a real
    // deploy): with no Cache-Control, an edge served a cached 200 carrying an OLD
    // release — indistinguishable from a stale deploy, the exact state /health
    // exists to expose. `no-store` makes every answer a fresh answer.
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('unknown routes are 404', async () => {
    const res = await worker.fetch(new Request('https://storefront-service.shop.internal/anything'));
    expect(res.status).toBe(404);
  });
});
