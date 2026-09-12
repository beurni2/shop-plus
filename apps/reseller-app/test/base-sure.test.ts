import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseSure } from '../src/vitrine/fetch-borne';

/**
 * BASE-SURE-1 (AUDIT-SHOP-2 F-76) — the service base is https or it is nothing.
 *
 * Every adapter reached `EXPO_PUBLIC_STOREFRONT_BASE` and used whatever it held.
 * A plain-http base — a typo in the workflow secret, a dev value that leaked —
 * would have sent her password (signup, login) and her session bearer (every
 * write) in clear over the air. One guard, in the one place every adapter
 * already crosses: a base that is not `https://` resolves to NULL, which is the
 * honest « non branché » state the app already designs for an unset base.
 */

const appDir = join(import.meta.dirname, '..');
const BASE = 'EXPO_PUBLIC_STOREFRONT_BASE';

afterEach(() => vi.unstubAllEnvs());

describe('baseSure — the rule', () => {
  it('keeps an https base verbatim (each adapter trims what it needs to)', () => {
    expect(baseSure('https://storefront.example.dev')).toBe('https://storefront.example.dev');
    expect(baseSure('https://storefront.example.dev/')).toBe('https://storefront.example.dev/');
  });

  it('refuses plain http, an empty value and an unset one — all the same nothing', () => {
    for (const raw of ['http://storefront.example.dev', 'http://10.0.2.2:8787', '', undefined, 'storefront.example.dev', 'HTTPS://x']) {
      expect(baseSure(raw), String(raw)).toBeNull();
    }
  });
});

describe('every adapter resolves through it — a plain-http base opens NO door', () => {
  it('storefront · offers · feed · compte all answer null on http and a port on https', async () => {
    const { resolveStorefrontService } = await import('../src/vitrine/service');
    const { resolveOfferSource } = await import('../src/vitrine/offers');
    const { resolveResellerFeed } = await import('../src/sales/feed-service');
    const { resolveCompteService } = await import('../src/access/compte-service');
    vi.stubEnv(BASE, 'http://storefront.example.dev');
    expect(resolveStorefrontService()).toBeNull();
    expect(resolveOfferSource()).toBeNull();
    expect(resolveResellerFeed()).toBeNull();
    expect(resolveCompteService()).toBeNull();
    vi.stubEnv(BASE, 'https://storefront.example.dev');
    expect(resolveStorefrontService()).not.toBeNull();
    expect(resolveOfferSource()).not.toBeNull();
    expect(resolveResellerFeed()).not.toBeNull();
    expect(resolveCompteService()).not.toBeNull();
  });

  it('SOURCE PIN — the four resolvers read the env through baseSure and nowhere else', () => {
    const files = ['src/vitrine/service.ts', 'src/vitrine/offers.ts', 'src/sales/feed-service.ts', 'src/access/compte-service.ts'];
    for (const f of files) {
      const src = readFileSync(join(appDir, f), 'utf8');
      expect(src, `${f} must resolve its base through baseSure`).toMatch(/baseSure\(process\.env\.EXPO_PUBLIC_STOREFRONT_BASE\)/);
      expect((src.match(/process\.env\.EXPO_PUBLIC_STOREFRONT_BASE/g) ?? []).length, `${f}: one read, through the guard`).toBe(1);
    }
  });
});
