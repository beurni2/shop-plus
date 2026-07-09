#!/usr/bin/env node
import { runScanGate } from './scan.mjs';

/**
 * CI gate: buyerDropCode never exposed to seller/reseller surfaces (standing
 * guardrail; §5.6: "buyerDropCode — private, never shown to the seller";
 * §11: "reseller cannot enter drop code"). Scans the reseller app and the
 * services; the buyer PWA (apps/buyer-pwa) is deliberately OUTSIDE the scan
 * roots — the buyer entering their own drop code is the one legitimate home
 * for that secret.
 */
runScanGate({
  gateName: 'no-drop-code-exposure',
  invariant: 'buyerDropCode is private to the buyer — never on seller/reseller surfaces',
  defaultRoots: ['services', 'apps/reseller-app', 'packages'],
  patterns: [
    { name: 'buyerDropCode', regex: /buyer[_-]?drop[_-]?code/i },
    { name: 'dropCode', regex: /\bdrop[_-]?code\b/i },
  ],
});
