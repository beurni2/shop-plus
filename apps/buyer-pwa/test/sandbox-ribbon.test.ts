import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ BANDEAUX-RETIRÉS — the sandbox ribbon is GONE, deliberately ═══
 *
 * FOUNDER ORDER (2026-08-14): « remove the demo banner at bottom and the one
 * on buyer's payment pwa ».
 *
 * This file used to pin the opposite: that the WO-4.2E ribbon was appended
 * unconditionally, before any URL param could gate it. That was an app
 * convention, never canon — verified across the Execution Contract and the
 * Shop+ spec, neither of which requires a marker on a deployed preview — so
 * removing it is the founder's product call and these pins invert rather than
 * being quietly deleted: an inverted pin keeps the record of what changed and
 * why, where a deleted one leaves the next reader guessing.
 *
 * WHAT THE REMOVAL COST, recorded here and in JOURNAL.md so it cannot be
 * forgotten: while the payment provider is still the certified sandbox mock,
 * NO band on the buyer's screen says the payment is a test.
 *
 * (This file once added « the per-event sentences survive » — « Rien n'a été
 * débité » under `order.payment_failed.body` / `order.cancelled.body`.
 * CATALOGUES-ORPHELINS-1 found that nothing had rendered those keys since the
 * prototype-era shell: dead strings, the exact class the pin below refuses to
 * leave behind, and they went with the rest of the `order.*` namespace. The
 * buyer's refusal sentences live under `cl.` today, pinned by the inline-refus
 * gate.)
 *
 * The build-base test at the bottom never had anything to do with the ribbon;
 * it lives here by history and is KEPT, not orphaned by the removal.
 */

const appDir = join(import.meta.dirname, '..');
const main = readFileSync(join(appDir, 'src/main.ts'), 'utf8');
const catalog = JSON.parse(readFileSync(join(appDir, 'i18n/catalog.json'), 'utf8')) as {
  key: string;
  fr: string;
}[];

describe('BANDEAUX-RETIRÉS — the sandbox ribbon no longer renders anywhere', () => {
  it('nothing creates or appends the ribbon element', () => {
    const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toContain('sandbox-ribbon');
    expect(code).not.toContain("t('apercu.ruban')");
    expect(code).not.toMatch(/\bconst ribbon\b/);
  });

  it('its copy is gone from the catalog too — no dead string left to re-render by accident', () => {
    expect(catalog.find((e) => e.key === 'apercu.ruban')).toBeUndefined();
  });

  it('the re-entry band no longer depends on the ribbon existing — it leads the shell itself', () => {
    /**
     * THE ONE REAL HAZARD OF THIS REMOVAL. « Ma commande » was inserted with
     * `ribbon.after(suiviBtn)` — positioned by the ribbon OBJECT. Deleting the
     * ribbon without rewiring would have thrown on a live, e2e-covered path.
     */
    const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/ribbon\.after\(/);
    expect(code).toContain('app.prepend(suiviBtn);');
    // …and the shell clear no longer spares an element that cannot exist.
    expect(code).not.toMatch(/child !== ribbon/);
  });

  it('the prototype-era `order.*` sentences are gone too — CATALOGUES-ORPHELINS-1 took the dead strings this file once kept alive', () => {
    for (const key of ['order.payment_failed.body', 'order.cancelled.body']) {
      expect(catalog.find((e) => e.key === key), `${key} must not linger`).toBeUndefined();
    }
  });

  it('the build base is relative — the same build serves local, the gate, and project Pages', () => {
    const config = readFileSync(join(appDir, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/base: '\.\/'/);
  });
});
