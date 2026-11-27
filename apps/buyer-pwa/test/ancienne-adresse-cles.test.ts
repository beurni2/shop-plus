import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLES, PREFIXES } from '../ancienne-adresse/cles.mjs';

/**
 * ═══ ANCIENNE-ADRESSE — THE OLD ADDRESS FORGETS SHOP+, AND ONLY SHOP+ ═══
 *
 * The old address is shared with every other page of the account, so the
 * forwarder may remove only the names Shop+ itself writes. This test reads
 * every storage name the buyer site's source writes and refuses the day one of
 * them is missing from the forwarder's list — a key added later would
 * otherwise stay behind on the shared origin. And it refuses a list loose
 * enough to touch someone else's names.
 */

const src = join(import.meta.dirname, '../src');
function sources(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dossier, e.name)) : /\.tsx?$/.test(e.name) ? [join(dossier, e.name)] : [],
  );
}

/** Every storage name the source writes: `sp-…:v1`, `sp-…:` prefixes, `shopplus.….v1`, `shop-plus.….v1`. */
const NOM = /['"`]((?:sp-[a-z0-9-]+:(?:v\d+)?)|(?:shopplus\.[a-z.-]+\.v\d+)|(?:shop-plus\.[a-z.-]+\.v\d+))['"`]/g;
const ecrits = new Set(sources(src).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(NOM)].map((m) => m[1]!)));

describe('the forwarder knows every name the buyer site writes', () => {
  it('the scan itself finds the names it must (a scan that finds nothing proves nothing)', () => {
    for (const connu of ['sp-compte:v1', 'sp-liens-dus:v1', 'sp-portes:v1', 'sp-quote-key:', 'shopplus.listes.v1']) {
      expect(ecrits.has(connu), connu).toBe(true);
    }
  });

  it('each written name is removed by name, each written prefix by that prefix', () => {
    const manquants = [...ecrits].filter((nom) => (nom.endsWith(':') ? !PREFIXES.includes(nom) : !CLES.includes(nom)));
    expect(manquants).toEqual([]);
  });

  it('no list entry is looser than a Shop+ name (never a bare « sp- » sweep)', () => {
    for (const p of PREFIXES) expect(p, p).toMatch(/^sp-[a-z0-9-]+:$/);
    for (const c of CLES) expect(c, c).toMatch(/^(sp-[a-z0-9-]+:v\d+|shopplus\.[a-z.-]+\.v\d+|shop-plus\.[a-z.-]+\.v\d+)$/);
  });
});
