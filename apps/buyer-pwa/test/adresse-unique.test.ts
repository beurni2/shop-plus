import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ ADRESSE-UNIQUE — ONE ADDRESS FOR THE BUYER SITE, NAMED ONCE PER PACKAGE ═══
 *
 * The buyer site has an origin of its own, so what her phone keeps is shared
 * with no other page. Three packages must agree on that address: the service
 * that trusts it, the reseller app that prints and shares it, and the old
 * address's forwarder that sends every old link to it. Each names it ONCE; this
 * test reads the three pins and refuses the day they differ, and refuses any
 * shipping string that still names a github.io address — except the service's
 * one named old origin, trusted only while old links forward.
 */

const racine = join(import.meta.dirname, '../../..');
const lire = (chemin: string): string => readFileSync(join(racine, chemin), 'utf8');

function pin(chemin: string, nom: string): string {
  const m = new RegExp(`export const ${nom} = '([^']*)';`).exec(lire(chemin));
  expect(m, `${chemin} pins ${nom} exactly once, as a plain string`).not.toBeNull();
  return m![1]!;
}

const PINS = [
  ['services/storefront-service/src/index.ts', 'CORS_READ_ORIGIN'],
  ['apps/reseller-app/src/qr/identity.ts', 'QR_ORIGIN'],
  ['apps/buyer-pwa/scripts/ancienne-adresse.mjs', 'NOUVELLE_ADRESSE'],
] as const;

describe('every package names the same buyer address', () => {
  it('the three pins are one https origin of its own, never github.io', () => {
    const valeurs = PINS.map(([f, n]) => pin(f, n));
    expect(new Set(valeurs).size, `pins differ: ${JSON.stringify(valeurs)}`).toBe(1);
    const adresse = new URL(valeurs[0]!);
    expect(adresse.protocol).toBe('https:');
    expect(adresse.origin).toBe(valeurs[0]);
    expect(adresse.hostname.endsWith('.github.io')).toBe(false);
    expect(adresse.hostname).toBe('shop-plus.pages.dev');
  });

  it('the reseller links sit at the root of that address (no project sub-path)', () => {
    expect(pin('apps/reseller-app/src/qr/identity.ts', 'QR_BASE')).toBe('');
  });

  it('the tile user-agent names the same address, from the same pin', () => {
    const tuiles = lire('services/storefront-service/src/tuiles.ts');
    expect(tuiles).toMatch(/import \{[^}]*\bCORS_READ_ORIGIN\b[^}]*\} from '\.\/index\.js';/);
    expect(tuiles).toMatch(/TUILES_USER_AGENT = `Shop\+ buyer map \(\$\{CORS_READ_ORIGIN\}\/\)`;/);
  });
});

/** Shipping source only: what runs, is served, or is published. */
const SOURCES = [
  'apps/buyer-pwa/src',
  'apps/buyer-pwa/public',
  'apps/buyer-pwa/ancienne-adresse',
  'apps/buyer-pwa/sw.template.js',
  'apps/buyer-pwa/scripts',
  'apps/reseller-app/src',
  'services/storefront-service/src',
  'services/storefront-service/worker',
];
const EXTENSIONS = /\.(ts|tsx|js|mjs|html|json|webmanifest)$/;

function fichiers(chemin: string): string[] {
  const absolu = join(racine, chemin);
  if (statSync(absolu).isFile()) return [absolu];
  return readdirSync(absolu, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name === 'dist') return [];
    const enfant = join(chemin, e.name);
    return e.isDirectory() ? fichiers(enfant) : EXTENSIONS.test(e.name) ? [join(racine, enfant)] : [];
  });
}

/** The one shipping line allowed to name the old address. */
const ANCIENNE_PERMISE = "export const CORS_ANCIENNE_ORIGINE = 'https://beurni2.github.io';";

describe('no shipping string names a github.io address', () => {
  it('only the service’s one named old origin, while old links forward', () => {
    const trouves: string[] = [];
    let permise = 0;
    for (const f of SOURCES.flatMap(fichiers)) {
      readFileSync(f, 'utf8').split('\n').forEach((ligne, i) => {
        // A string literal, not prose in a comment: links are built from strings.
        if (!/(['"`])[^'"`\n]*github\.io[^'"`\n]*\1/.test(ligne)) return;
        if (ligne.trim() === ANCIENNE_PERMISE) {
          permise += 1;
          return;
        }
        trouves.push(`${relative(racine, f)}:${i + 1}: ${ligne.trim()}`);
      });
    }
    expect(trouves).toEqual([]);
    expect(permise, 'the old origin is named once, by name').toBe(1);
  });
});
