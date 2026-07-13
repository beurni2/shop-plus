import type { Catalog } from '@platform/i18n';
import rawCatalog from '../i18n/catalog.json';

/**
 * Kit strings live ONLY in the catalog (Contract §10.5) — never inline, not
 * even the copy painted onto the canvas. The import is type-only: @platform/i18n's
 * runtime entry carries the node-side copy-lint loader, which has no place in a
 * browser bundle. Validation runs in test/catalog.test.ts (CatalogSchema) and in
 * the copy-lint CI gate.
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

/** Catalog string with `{...}` placeholders resolved — strings stay in the
 * catalog, values arrive at render time. */
export function tf(key: string, params: Record<string, string>): string {
  return t(key).replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? `{${name}}`);
}
