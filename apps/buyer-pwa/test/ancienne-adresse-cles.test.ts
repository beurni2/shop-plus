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

/**
 * Every storage name the source reads, writes or removes, WHATEVER ITS SHAPE:
 * the first argument of each getItem / setItem / removeItem call, resolved —
 * a string literal is a name; `ID` is the constant it names (the file's own
 * first, else any file's exported one); `ID + …` and `${ID}…` make ID's
 * value a prefix; a local `const x = ID + …` (the nearest one before the call)
 * is followed once. An argument
 * this cannot resolve fails the test by name, so a new way of naming a key
 * is read by a person before it ships.
 */
type Nom = { nom: string; prefixe: boolean };
const fichiersSrc = sources(src).map((f) => ({ f, texte: readFileSync(f, 'utf8') }));
const CONSTANTE = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])([^'"`$]*)\2\s*;/g;
const exportees = new Map<string, string>();
for (const { texte } of fichiersSrc) for (const m of texte.matchAll(CONSTANTE)) if (/export\s+const/.test(m[0])) exportees.set(m[1]!, m[3]!);

const inconnus: string[] = [];
const lus: Nom[] = [];
for (const { f, texte } of fichiersSrc) {
  const locales = new Map<string, string>();
  for (const m of texte.matchAll(CONSTANTE)) locales.set(m[1]!, m[3]!);
  const valeur = (id: string): string | undefined => locales.get(id) ?? exportees.get(id);
  const resoudre = (arg: string, avant: string, profondeur = 0): Nom | undefined => {
    const a = arg.trim();
    let m = /^(['"])([^'"]*)\1$/.exec(a);
    if (m) return { nom: m[2]!, prefixe: false };
    m = /^`([^`$]*)\$\{/.exec(a);
    if (m) return { nom: m[1]!, prefixe: true };
    m = /^([A-Za-z_$][\w$]*)\s*\+/.exec(a);
    if (m) return valeur(m[1]!) !== undefined ? { nom: valeur(m[1]!)!, prefixe: true } : undefined;
    m = /^([A-Za-z_$][\w$]*)$/.exec(a);
    if (!m) return undefined;
    if (valeur(m[1]!) !== undefined) return { nom: valeur(m[1]!)!, prefixe: false };
    const derive = [...avant.matchAll(new RegExp(`const\\s+${m[1]}\\s*=\\s*([^;]+);`, 'g'))].at(-1);
    return derive && profondeur === 0 ? resoudre(derive[1]!, avant, 1) : undefined;
  };
  for (const m of texte.matchAll(/\.(?:getItem|setItem|removeItem)\(\s*([^,)]+)/g)) {
    const n = resoudre(m[1]!, texte.slice(0, m.index));
    if (n === undefined) inconnus.push(`${f.slice(src.length + 1)}: ${m[1]!.trim()}`);
    else lus.push(n);
  }
}
const exacts = new Set(lus.filter((n) => !n.prefixe).map((n) => n.nom));
const prefixes = new Set(lus.filter((n) => n.prefixe).map((n) => n.nom));

describe('the forwarder knows every name the buyer site writes', () => {
  it('the scan itself finds the names it must (a scan that finds nothing proves nothing)', () => {
    for (const connu of ['sp-compte:v1', 'sp-liens-dus:v1', 'sp-portes:v1', 'shopplus.listes.v1', 'shop-plus.arrivals.v1']) expect(exacts.has(connu), connu).toBe(true);
    for (const connu of ['sp-quote-key:', 'sp-quote-cmd:', 'sp-panier-titulaire:']) expect(prefixes.has(connu), connu).toBe(true);
  });

  it('every storage argument resolves to a name or a prefix', () => {
    expect(inconnus).toEqual([]);
  });

  it('the forwarder removes exactly those names and prefixes — nothing missing, nothing that is not Shop+’s', () => {
    expect([...CLES].sort()).toEqual([...exacts].sort());
    expect([...PREFIXES].sort()).toEqual([...prefixes].sort());
  });

  it('no prefix is looser than one Shop+ family (never a bare « sp- » sweep)', () => {
    for (const p of PREFIXES) expect(p, p).toMatch(/^sp-[a-z0-9-]+:$/);
  });
});
