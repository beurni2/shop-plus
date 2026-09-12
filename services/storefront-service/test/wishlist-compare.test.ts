import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DURCISSEMENT-SERVICE-2 (AUDIT-SHOP-2 F-67) — the liste's edit key is compared
 * with the HOUSE constant-time compare at every door that reads it.
 *
 * The three doors (update, read-back, delete) compared `sha256Hex(key)` against
 * the stored hash with `!==` — hash vs hash, so the early exit leaked a
 * hash-prefix fact, never the key; not exploitable, and reclassified NOTE by
 * the audit. The remise door and the webhook gate already used
 * `timingSafeEqual`; one hand-rolled `!==` beside them is the exception that
 * spreads. This pins the CALL SITES (the standing law: a guard that exists is
 * not a guard that is called): three doors, three house compares, zero `!==`
 * against the hash. The functional truth — a wrong key is `not_found`, the
 * right key opens — stays with wishlist.e2e.test.ts.
 */
describe('F-67 — wishlist-do compares the edit-key hash with timingSafeEqual, at every door', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'worker', 'wishlist-do.ts'), 'utf8');

  it('imports the house compare from worker/auth', () => {
    expect(src).toMatch(/import \{ timingSafeEqual \} from '\.\/auth\.js';/);
  });

  it('three doors, three constant-time compares, no `!==` against the stored hash', () => {
    const maison = src.match(/!\(await timingSafeEqual\(await sha256Hex\([^)]*\), record\.editCleHash\)\)/g) ?? [];
    expect(maison, 'update · read-back · delete').toHaveLength(3);
    expect(src).not.toMatch(/!==\s*record\.editCleHash/);
    expect(src).not.toMatch(/record\.editCleHash\s*!==/);
  });
});
