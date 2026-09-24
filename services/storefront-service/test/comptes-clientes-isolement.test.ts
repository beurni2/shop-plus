import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * COMPTE-CLIENTE — « his infos are there and safe ». The buyer's account book
 * is reachable from ONE place: her own account doors in index.ts. No order,
 * quote, liste, seller, supplier, rider or founder road may name the binding
 * or the class; a future road that wants her data must come through here and
 * be seen doing it.
 */

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const sources = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') ? [p] : [];
  });

describe('COMPTE-CLIENTE — the book is read in one place', () => {
  it('only index.ts and the book itself name it', () => {
    const qui = [...sources(join(racine, 'worker')), ...sources(join(racine, 'src'))]
      .filter((f) => /COMPTES_CLIENTES|BuyerAccountsDO|buyer-accounts-do|BUYER_ACCOUNTS_NAME/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(racine, f))
      .sort();
    expect(qui).toEqual(['worker/buyer-accounts-do.ts', 'worker/index.ts']);
  });

  it('inside index.ts, every use of the binding sits inside the buyer account doors', () => {
    const s = readFileSync(join(racine, 'worker/index.ts'), 'utf8');
    const debut = s.indexOf("if (pathname === '/buyer/signup' || pathname === '/buyer/login' || pathname === '/buyer/profile' || pathname === '/buyer/logout') {");
    const fin = s.indexOf('═══ RESELLER-ACCOUNTS-1b — THE ACCOUNT DOORS');
    expect(debut).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(debut);
    const usages = [...s.matchAll(/env\.COMPTES_CLIENTES/g)].map((m) => m.index ?? -1);
    expect(usages.length).toBe(3);
    for (const i of usages) {
      expect(i).toBeGreaterThan(debut);
      expect(i).toBeLessThan(fin);
    }
    // The class is exported for the runtime and imported once — nothing else.
    expect([...s.matchAll(/BuyerAccountsDO/g)].length).toBe(2);
  });
});
