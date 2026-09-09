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
 *
 * PORTES-FRANCAISES-1 (AUDIT-SHOP-2 F-11) — THE FRENCH FAMILY. The secret is
 * named « code de remise » in this codebase (VRAI-SUIVI), and
 * `codeDeRemise` / `codeLivraison` / `buyerHandoffPin` all passed the two
 * English patterns (measured). The family now covers the remise / livraison /
 * réception / client spellings and the « handoff PIN » euphemism. Its three
 * legitimate homes are named below as founder-auditable carve-outs, each
 * printed with its ruling on every run: the minting site and the buyer's one
 * door, and the two e2e files that spell the identifier ONLY to assert its
 * absence on every reseller and ops read. Any other file fails.
 */
const CODE_REMISE = 'codeRemise (French drop-code family)';
runScanGate({
  gateName: 'no-drop-code-exposure',
  invariant: 'buyerDropCode is private to the buyer — never on seller/reseller surfaces',
  defaultRoots: ['services', 'apps/reseller-app', 'apps/reseller-kit', 'packages'],
  patterns: [
    { name: 'buyerDropCode', regex: /buyer[_-]?drop[_-]?code/i },
    { name: 'dropCode', regex: /\bdrop[_-]?code\b/i },
    { name: CODE_REMISE, regex: /code[_-]?(de[_-]?)?(remise|livraison|r[ée]ception|client)|handoff[_-]?pin/i },
  ],
  allow: [
    {
      file: 'services/storefront-service/worker/order-do.ts',
      pattern: CODE_REMISE,
      ruling:
        'VRAI-SUIVI — the minting site and the buyer\'s ONE door (/entry/remise, buyer-token-gated, arrival-gated): the code is born here and read back only to her; every reseller and ops read is pinned code-free by vrai-suivi.e2e and livraison-boutik.e2e',
    },
    {
      file: 'services/storefront-service/test/vrai-suivi.e2e.test.ts',
      pattern: CODE_REMISE,
      ruling: 'the e2e that pins the code to the buyer\'s door — it spells the identifier only to assert its ABSENCE on every reseller and ops read',
    },
    {
      file: 'services/storefront-service/test/livraison-boutik.e2e.test.ts',
      pattern: CODE_REMISE,
      ruling:
        'the e2e that pins the Boutik+ readiness/seller evidence code-free — its `codeRemise` is a local VARIABLE holding the English name, built so the English patterns never see it, and the file asserts that name ABSENT; no French spelling is asserted or emitted there (Tier 4 verifier)',
    },
  ],
});
