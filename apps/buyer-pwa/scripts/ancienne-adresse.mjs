/**
 * ADRESSE-PROPRE — builds what the OLD project address publishes once the buyer
 * site lives at its own: ancienne-adresse/dist/{index.html, 404.html, sw.js}.
 * index.html answers the old project root, 404.html every old deep link (the
 * host's fallback), sw.js replaces the old site's worker at its own address.
 *
 *   node apps/buyer-pwa/scripts/ancienne-adresse.mjs
 *
 * The sentence is the catalog's (`adresse.nouvelle`), never inline. The page's
 * policy allows its one script by the hash of its exact bytes. The address is
 * written into the page's link, outside the script, so the script never names it.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLES, PREFIXES } from '../ancienne-adresse/cles.mjs';

/** The buyer site's own address — the one place this package names it. */
export const NOUVELLE_ADRESSE = 'https://shop-plus.pages.dev';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(app, 'ancienne-adresse');
const sortie = join(source, 'dist');

/** Escaped for an HTML text node and an attribute alike. */
const echapper = (texte) =>
  texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function construire() {
  const catalogue = JSON.parse(readFileSync(join(app, 'i18n/catalog.json'), 'utf8'));
  const entree = catalogue.find((e) => e.key === 'adresse.nouvelle');
  if (entree === undefined) throw new Error('ancienne-adresse: the catalog has no adresse.nouvelle');

  const script = readFileSync(join(source, 'transfert.js'), 'utf8')
    .replace('__CLES__', JSON.stringify(CLES))
    .replace('__PREFIXES__', JSON.stringify(PREFIXES));
  const hachage = createHash('sha256').update(script, 'utf8').digest('base64');
  const politique = [
    "default-src 'none'",
    `script-src 'sha256-${hachage}'`,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "frame-src 'none'",
  ].join('; ');

  const page = readFileSync(join(source, 'page.html'), 'utf8')
    .replace('__POLITIQUE__', politique)
    .replace('__ADRESSE__', NOUVELLE_ADRESSE)
    .replace('__PHRASE__', echapper(entree.fr))
    .replace('__SCRIPT__', () => script);

  rmSync(sortie, { recursive: true, force: true });
  mkdirSync(sortie, { recursive: true });
  writeFileSync(join(sortie, 'index.html'), page);
  writeFileSync(join(sortie, '404.html'), page);
  copyFileSync(join(source, 'sw.js'), join(sortie, 'sw.js'));
  return sortie;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`ancienne-adresse: ${construire()}\n`);
}
