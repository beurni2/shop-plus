import type { Catalog } from '@platform/i18n';
import rawCatalog from '../i18n/catalog.json';

/**
 * App strings live ONLY in the catalog (Contract §10.5) — never inline in
 * component code. The import is type-only: @platform/i18n's runtime entry
 * carries the node-side copy-lint loader, which Metro cannot bundle.
 * Schema enforcement is the copy-lint CI gate (which CatalogSchema-parses
 * this catalog on every PR); the vitest suite checks key coverage.
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

/**
 * Catalog string with `{...}` placeholders resolved — strings stay in the
 * catalog, values arrive at render time. LOUD-FAIL by design (stricter than the
 * buyer PWA's silent variant): a placeholder with no value, or a param that
 * matches no placeholder (a mistype), THROWS — a broken interpolation is a
 * money-screen trust failure, never a silent « {amount} » left on screen.
 */
export function tf(key: string, params: Record<string, string>): string {
  const template = t(key);
  const used = new Set<string>();
  const out = template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`i18n ${key}: no value for placeholder {${name}}`);
    }
    used.add(name);
    return value;
  });
  for (const provided of Object.keys(params)) {
    if (!used.has(provided)) {
      throw new Error(`i18n ${key}: param "${provided}" matches no placeholder (mistyped?)`);
    }
  }
  return out;
}
