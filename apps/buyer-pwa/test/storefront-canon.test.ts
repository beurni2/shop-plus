import { describe, expect, it } from 'vitest';
import { StorefrontSchema } from '@platform/contracts';
import { demoStorefrontPort } from '../src/vitrine/profile.js';

/** CANON CONFORMANCE (v1.1.0 / be2199c): every storefront this surface serves
 * parses with the REAL StorefrontSchema — a shape drift fails here, never on a
 * buyer's phone. Also pins the two §3.1 refusals the vitrine relies on. */
describe('storefront ⇄ canon v1.1.0 conformance', () => {
  it('all three demo variants parse with the canon schema', () => {
    for (const variant of ['default', 'customised', 'empty'] as const) {
      const resolved = demoStorefrontPort(variant).resolve('aicha-4821');
      expect(resolved, variant).toBeTruthy();
      const parsed = StorefrontSchema.parse(resolved!.storefront);
      expect(parsed.slug).toBe('aicha-4821');
    }
  });

  it('canon refuses a pid in two sections and a third featured item (§3.1 laws live in the schema now)', () => {
    const base = demoStorefrontPort('default').resolve('aicha-4821')!.storefront;
    expect(
      StorefrontSchema.safeParse({
        ...base,
        sections: [
          { id: 's1', name: 'A', pids: ['p1'] },
          { id: 's2', name: 'B', pids: ['p1'] },
        ],
      }).success,
    ).toBe(false);
    expect(StorefrontSchema.safeParse({ ...base, featuredItems: ['p1', 'p2', 'p5'] }).success).toBe(false);
  });
});
