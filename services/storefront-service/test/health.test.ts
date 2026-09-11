import { describe, expect, it } from 'vitest';
import worker, { SERVICE_NAME, type StorefrontServiceEnv } from '../src/index.js';

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

  it('PBKDF2-HAUSSE-1 — /health?pbkdf2=1 runs the injected probe ONCE and carries its answer; without the flag, or without a probe, the body is untouched', async () => {
    let appels = 0;
    const env: StorefrontServiceEnv = { PBKDF2_SONDE: async () => { appels += 1; return { iterations: 7, ok: true, digest: 'abcd' }; } };
    // No probe injected (a Node/unit context): the flag is ignored, the body is the pinned one.
    const sans = await worker.fetch(new Request('https://storefront-service.shop.internal/health?pbkdf2=1'));
    expect(await sans.json()).toEqual({ service: SERVICE_NAME, status: 'ok', release: 'dev', canon: 'dev' });
    // The probe injected but not asked for: not called, not carried.
    const nonDemande = await worker.fetch(new Request('https://storefront-service.shop.internal/health'), env);
    expect(await nonDemande.json()).toEqual({ service: SERVICE_NAME, status: 'ok', release: 'dev', canon: 'dev' });
    expect(appels).toBe(0);
    // Asked for: one call, its answer on the 200, still no-store.
    const demande = await worker.fetch(new Request('https://storefront-service.shop.internal/health?pbkdf2=1'), env);
    expect(demande.status).toBe(200);
    expect(await demande.json()).toEqual({ service: SERVICE_NAME, status: 'ok', release: 'dev', canon: 'dev', pbkdf2: { iterations: 7, ok: true, digest: 'abcd' } });
    expect(demande.headers.get('Cache-Control')).toBe('no-store');
    expect(appels).toBe(1);
    // A HEAD with the flag derives NOTHING: the ceiling is asked on GET, so a
    // HEAD that derived would be a free derivation from any address (verifier, MAJOR 1).
    const tete = await worker.fetch(new Request('https://storefront-service.shop.internal/health?pbkdf2=1', { method: 'HEAD' }), env);
    expect(tete.status).toBe(200);
    expect(appels).toBe(1);
  });

  it('unknown routes are 404', async () => {
    const res = await worker.fetch(new Request('https://storefront-service.shop.internal/anything'));
    expect(res.status).toBe(404);
  });
});
