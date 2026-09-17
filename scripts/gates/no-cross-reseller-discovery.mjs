#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { runScanGate } from './scan.mjs';

/**
 * CI gate: no-cross-reseller-discovery — SP-I05 as amended 2026-09-17 (founder):
 * « There is no cross-reseller discovery. A buyer reaches a store only through
 * that reseller's signed link or QR; Shop+ never lists, searches, or ranks
 * stores or products across resellers on any buyer surface. »
 *
 * His reason, verbatim in spirit: a buyer one reseller brought must never be
 * able to shop around for a cheaper markup. So the thing this gate refuses is
 * not a product pool (the old discovery-returns-stores gate's worry) but the
 * DIRECTORY ITSELF and any SEARCH ACROSS STORES — the identifiers such a
 * surface cannot be built without: a store index or discovery response, the
 * whole-directory projection, a search or filter over stores, a directory
 * noun, the retired demo lever. Inside ONE store, « Découvrir le reste de la
 * boutique » is hers and stays legal: nothing here matches a single-store word.
 *
 * Runs on import-safe PATTERNS (the fr-pattern-coverage convention) and only
 * executes when run directly.
 */
export const PATTERNS = [
  {
    name: 'store directory / discovery identifier',
    regex: /\b(store_index|storeIndex|StoreDiscovery\w*|projectStoreDiscovery|projectStores|renderBoutiques|allBoutiques|boutiques-(?:view|data))\b/,
  },
  { name: 'discovery service', regex: /discovery-service/ },
  { name: 'the retired demo directory lever', regex: /demo-boutiques/ },
  {
    name: 'a search or filter across stores',
    regex: /\b(search|rechercher|chercher|filtrer|trier)(Stores|Boutiques|Vendeuses|Resellers|Revendeuses)\b/i,
  },
  {
    name: 'a directory noun over stores',
    regex: /\b(stores?|boutiques?|vendeuses?|resellers?)(Directory|Index|Annuaire|Repertoire)\b/i,
  },
  {
    name: 'a directory sentence (fr)',
    regex: /\b(annuaire des (boutiques|vendeuses)|toutes les boutiques|(les )?autres boutiques|rechercher une (boutique|vendeuse)|trouver une (boutique|vendeuse))\b/i,
  },
];

const isMainModule = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMainModule) {
  runScanGate({
    gateName: 'no-cross-reseller-discovery',
    invariant: 'SP-I05 (amended 2026-09-17) — no cross-reseller discovery: no store directory, no search across stores, on any buyer surface',
    patterns: PATTERNS,
    allow: [
      {
        file: 'apps/buyer-pwa/e2e/racine.spec.ts',
        pattern: 'the retired demo directory lever',
        ruling: 'the browser walk proves the retired lever lands on the honest card (DECOUVERTE-RETIREE-1)',
      },
      {
        file: 'apps/buyer-pwa/e2e/shell.spec.ts',
        pattern: 'the retired demo directory lever',
        ruling: 'the browser walk proves the retired lever lands on the honest card (DECOUVERTE-RETIREE-1)',
      },
    ],
  });
}
