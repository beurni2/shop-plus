import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatalogSchema } from '@platform/i18n';
import { t } from '../src/i18n';
import { PAIEMENT, renderC5 } from '../src/cliente/screens';
import { composeQuote, ROBE } from '../src/cliente/seed';

/**
 * CATALOGUE-CLIENTE-1 (AUDIT-SHOP-2 F-59 « M ») — the buyer module's copy
 * lives in the catalog under `cl.`, and the module only NAMES keys.
 *
 * The CI gate (`copy-lint-inline-refus.mjs`) pins the tables' tags and
 * placeholders and trips on inline French; this test keeps the two facts a
 * unit run should also catch at once, before any gate board:
 *   · every key the module names exists (a missing one throws at module
 *     load — a blank screen — and this names it instead), and no `cl.` key
 *     is an orphan nobody renders;
 *   · the glued tails are SUBSTRINGS of the sentences they are cut from —
 *     a `.replace` that stops matching is a silent no-op (the `titreBFin`
 *     precedent, now for the envoi tail and the option-A pill).
 */

const appDir = join(import.meta.dirname, '..');
const catalog = CatalogSchema.parse(JSON.parse(readFileSync(join(appDir, 'i18n/catalog.json'), 'utf8')));
const keys = new Set(catalog.map((e) => e.key));
const MODULES = ['src/cliente/screens.ts', 'src/cliente/flow.ts'];
const KEY_CALL = /(?<![\w.])tf?\('([^']+)'/g;

describe('CATALOGUE-CLIENTE-1 — the module names keys the catalog has, and the catalog holds no orphan', () => {
  it('the key-extraction regex still extracts keys (the guard on the guard)', () => {
    expect([..."x = t('a.b') + tf('c.d', {})".matchAll(KEY_CALL)].map((m) => m[1])).toEqual(['a.b', 'c.d']);
  });

  it('every t()/tf() key in screens.ts and flow.ts exists', () => {
    const named = new Set<string>();
    for (const f of MODULES) for (const m of readFileSync(join(appDir, f), 'utf8').matchAll(KEY_CALL)) named.add(m[1]!);
    expect(named.size).toBeGreaterThan(300);
    const manquent = [...named].filter((k) => !keys.has(k));
    expect(manquent, 'keys named by the module and absent from the catalog').toEqual([]);
  });

  it('every cl.* key is named by the module — no copy nobody renders', () => {
    const named = new Set<string>();
    for (const f of MODULES) for (const m of readFileSync(join(appDir, f), 'utf8').matchAll(KEY_CALL)) named.add(m[1]!);
    const orphelines = catalog.map((e) => e.key).filter((k) => k.startsWith('cl.') && !named.has(k));
    expect(orphelines).toEqual([]);
  });
});

describe('CATALOGUE-CLIENTE-1 — the glued tails are substrings of their sentences', () => {
  it('the envoi tail « à l’opérateur. » is cut from the envoi sentence, and the render glues it', () => {
    expect(t('cl.c5.envoi_corps')).toContain(t('cl.c5.envoi_fin'));
    const html = renderC5(ROBE, composeQuote(ROBE.priceFcfa), { delivery: 'today', pay: 'A', paying: 'submitting', bInel: false });
    expect(html).toContain(`<span class="cl-envoi-fin">${t('cl.c5.envoi_fin')}</span>`);
  });

  it('option A’s pill word is cut from option A’s label', () => {
    expect(PAIEMENT.titreA).toContain(` — ${PAIEMENT.reco}`);
  });
});
