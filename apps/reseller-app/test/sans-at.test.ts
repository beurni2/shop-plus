import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SANS-AT-1 — the app no longer sends its own clock on any write.
 *
 * DURCISSEMENT-SERVICE-1 (F-65) made the SERVER stamp every storefront and
 * listing write; the `at` the app kept sending became dead weight on the wire —
 * bytes that imply the phone's clock is honoured when it is not. Removed from
 * the port, its request shapes, the demo substrate and every caller: nothing
 * about time leaves the phone on a write any more.
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string): string => readFileSync(join(appDir, f), 'utf8');

describe('SANS-AT-1 — no write carries `at`', () => {
  it('the port declares no `at` parameter and no `at` request field', () => {
    const service = read('src/vitrine/service.ts');
    expect(service).not.toMatch(/\bat: string/);
    expect(service).not.toMatch(/[{,]\s*at\s*[},]/);
  });

  it('the demo substrate mirrors the port', () => {
    expect(read('src/vitrine/service.demo.ts')).not.toMatch(/\bat: string/);
  });

  it('App.tsx hands no clock to any service call', () => {
    const app = read('App.tsx');
    expect(app).not.toMatch(/service\.\w+\([^)]*toISOString/);
    expect(app).not.toMatch(/\bat: new Date\(\)\.toISOString\(\)/);
  });

  it('RUNTIME — every write body the http adapter builds is free of `at`', async () => {
    const { HttpStorefrontService } = await import('../src/vitrine/service');
    const bodies: Record<string, unknown>[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: { body?: string }) => {
      if (typeof init.body === 'string') bodies.push(JSON.parse(init.body) as Record<string, unknown>);
      return { ok: true, status: 200, json: async () => ({ status: 'saved', slug: 'x' }) } as unknown as Response;
    }) as unknown as typeof fetch;
    try {
      const svc = new HttpStorefrontService('https://svc.example');
      await svc.saveIdentity('sf-1', { name: 'Chez Awa' });
      await svc.publish('sf-1', 'corr-1');
      await svc.unpublish('sf-1', 'corr-1');
      await svc.removeItem('sf-1', 'pv-1');
      await svc.removeVoiceNote('sf-1', 'pv-1');
      await svc.create({
        commandId: 'cmd-1', id: 'sf-1', resellerId: 'rs-1', shortCode: 'BOUTIK-0001',
        name: 'Chez Awa', zone: 'Ouagadougou', category: 'Général', correlationId: 'corr-1',
      });
      await svc.publishListing({ storefrontId: 'sf-1', resellerId: 'rs-1', productVersionId: 'pv-1', markup: 500, correlationId: 'corr-1' });
    } finally {
      globalThis.fetch = original;
    }
    expect(bodies.length, 'seven writes, seven bodies').toBe(7);
    for (const b of bodies) expect(Object.keys(b), JSON.stringify(b)).not.toContain('at');
  });
});
