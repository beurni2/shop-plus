#!/usr/bin/env node
import { runScanGate } from './scan.mjs';

/**
 * CI gate: buyerDropCode never exposed to seller/reseller surfaces (standing
 * guardrail; §5.6: "buyerDropCode — private, never shown to the seller";
 * §11: "reseller cannot enter drop code"). Scans EVERY reseller/seller surface
 * (the reseller app AND the reseller-kit) plus the services; the buyer PWA
 * (apps/buyer-pwa) is deliberately OUTSIDE the scan roots — the buyer entering
 * their own drop code is the one legitimate home for that secret.
 *
 * Audit E4 — the roots named apps/reseller-app explicitly, so apps/reseller-kit
 * (a reseller-facing surface) was never scanned: a drop-code leak added there
 * would pass this gate silently. Every reseller/seller app is now a root; only
 * the buyer PWA stays out, for the reason above.
 */
runScanGate({
  gateName: 'no-drop-code-exposure',
  invariant: 'buyerDropCode is private to the buyer — never on seller/reseller surfaces',
  defaultRoots: ['services', 'apps/reseller-app', 'apps/reseller-kit', 'packages'],
  patterns: [
    { name: 'buyerDropCode', regex: /buyer[_-]?drop[_-]?code/i },
    { name: 'dropCode', regex: /\bdrop[_-]?code\b/i },
  ],
});
