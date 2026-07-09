import type { Catalog } from '@platform/i18n';
import rawCatalog from '../i18n/catalog.json';

/**
 * App strings live ONLY in the catalog (Contract §10.5) — never inline in
 * component code. The import is type-only: @platform/i18n's runtime entry
 * carries the node-side copy-lint loader, which Metro cannot bundle.
 * Validation runs in the app's vitest suite (CatalogSchema) and in the
 * copy-lint CI gate.
 */
const catalog = rawCatalog as Catalog;

const byKey = new Map(catalog.map((entry) => [entry.key, entry]));

export function t(key: string): string {
  const entry = byKey.get(key);
  if (entry === undefined) {
    throw new Error(`missing catalog string: ${key}`);
  }
  return entry.fr;
}
