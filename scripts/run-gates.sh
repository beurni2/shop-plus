#!/usr/bin/env bash
# WO-SP0.1 CI gates, run end-to-end with evidence. Every gate has a negative
# fixture and this script SHOWS each one failing once per run — if a negative
# fixture stops failing (exit != 1 exactly), the run itself fails. Output is
# captured under EVIDENCE_DIR when set.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_DIR="${EVIDENCE_DIR:-}"
FAILED=0

log() { printf '\n=== %s ===\n' "$1"; }
capture() {
  # capture <name> <expected: pass|fail> <command...>
  # expected=fail requires exit code EXACTLY 1: a crashed or misinvoked gate
  # (exit 2+) must never pass for a working negative fixture.
  local name="$1" expected="$2"; shift 2
  local out rc
  out="$("$@" 2>&1)"; rc=$?
  if [ -n "$EVIDENCE_DIR" ]; then
    mkdir -p "$EVIDENCE_DIR"
    printf '$ %s\n%s\n(exit code: %d)\n' "$*" "$out" "$rc" > "$EVIDENCE_DIR/$name.txt"
  fi
  printf '%s\n(exit code: %d)\n' "$out" "$rc"
  if [ "$expected" = pass ] && [ $rc -ne 0 ]; then echo "GATE FAILED (expected pass): $name"; FAILED=1; fi
  if [ "$expected" = fail ] && [ $rc -ne 1 ]; then echo "GATE FAILED (expected the negative fixture to fail with exit 1, got $rc): $name"; FAILED=1; fi
}

cd "$ROOT"

# Preinstalled-browser fallback for the Playwright harness (this sandbox
# ships chromium at /opt/pw-browsers; GitHub CI installs its own instead).
if [ -z "${PW_EXECUTABLE:-}" ] && [ -e /opt/pw-browsers/chromium ] && [ -z "${CI:-}" ]; then
  export PW_EXECUTABLE=/opt/pw-browsers/chromium
fi

log "typecheck (all workspace packages, incl. both app shells)"
capture typecheck pass pnpm typecheck

log "tests (money gate, net-first surface, discovery contract, attribution fails-closed, no-supplier-contact projection, correlation hello-world, flags, health, catalogs)"
capture tests pass pnpm test

log "consumption baseline — pinned computeWaterfall reproduces the §5.4 worked baseline"
capture baseline-check pass node scripts/baseline-check.mjs

log "gate: money-reconciliation — §5.4 baseline fixture quote (must pass)"
capture money-reconciliation-positive pass node scripts/gates/money-reconciliation.mjs gates/fixtures/quote.baseline.json

log "gate: money-reconciliation — NEGATIVE FIXTURE (independent-multiplication sellerNet, must fail)"
capture money-reconciliation-negative fail node scripts/gates/money-reconciliation.mjs gates/fixtures/negative/quote.independent-multiplication.json

log "gate: net-first-display — real opportunity-card surface (must pass)"
capture net-first-display-positive pass node scripts/gates/net-first-display.mjs gates/fixtures/surfaces/opportunity-card.json

log "gate: net-first-display — NEGATIVE FIXTURE (gross-first earnings surface, must fail)"
capture net-first-display-negative fail node scripts/gates/net-first-display.mjs gates/fixtures/negative/surfaces/gross-first-card.json

log "gate: discovery-returns-stores — real discovery response (must pass)"
capture discovery-returns-stores-positive pass node scripts/gates/discovery-returns-stores.mjs gates/fixtures/discovery/stores-response.json

log "gate: discovery-returns-stores — NEGATIVE FIXTURE (flat product pool, must fail)"
capture discovery-returns-stores-negative fail node scripts/gates/discovery-returns-stores.mjs gates/fixtures/negative/discovery/flat-product-pool.json

log "gate: attribution-tamper-fails-closed — valid signed token (must pass)"
capture attribution-tamper-positive pass node scripts/gates/attribution-tamper.mjs gates/fixtures/attribution/valid-token.json

log "gate: attribution-tamper-fails-closed — NEGATIVE FIXTURE (tampered payload, must REJECT CLOSED)"
capture attribution-tamper-negative fail node scripts/gates/attribution-tamper.mjs gates/fixtures/negative/attribution/tampered-token.json

log "gate: no-supplier-contact — real customer-surface projection (must pass)"
capture no-supplier-contact-positive pass node scripts/gates/no-supplier-contact.mjs gates/fixtures/customer-surfaces/product-view.json

log "gate: no-supplier-contact — NEGATIVE FIXTURE (supplier identity/contact/commission leak, must fail)"
capture no-supplier-contact-negative fail node scripts/gates/no-supplier-contact.mjs gates/fixtures/negative/customer-surfaces/leaking-product-view.json

log "gate: single-level — repo source (must pass)"
capture single-level-positive pass node scripts/gates/single-level.mjs

log "gate: single-level — NEGATIVE FIXTURE (downline/recruit, must fail)"
capture single-level-negative fail node scripts/gates/single-level.mjs gates/fixtures/negative/single-level

log "gate: no-wallet-no-funds — repo source (must pass)"
capture no-wallet-no-funds-positive pass node scripts/gates/no-wallet-no-funds.mjs

log "gate: no-wallet-no-funds — NEGATIVE FIXTURE (wallet/balance module, must fail)"
capture no-wallet-no-funds-negative fail node scripts/gates/no-wallet-no-funds.mjs gates/fixtures/negative/no-wallet-no-funds

log "gate: no-ml-libs — repo deps + imports (must pass)"
capture no-ml-libs-positive pass node scripts/gates/no-ml-libs.mjs

log "gate: no-ml-libs — NEGATIVE FIXTURE (tensorflow dep + onnx import, must fail)"
capture no-ml-libs-negative fail node scripts/gates/no-ml-libs.mjs gates/fixtures/negative/no-ml-libs

log "gate: no-drop-code-exposure — services + reseller app + packages (must pass)"
capture no-drop-code-exposure-positive pass node scripts/gates/no-drop-code-exposure.mjs

log "gate: no-drop-code-exposure — NEGATIVE FIXTURE (buyerDropCode on a reseller surface, must fail)"
capture no-drop-code-exposure-negative fail node scripts/gates/no-drop-code-exposure.mjs gates/fixtures/negative/drop-code

log "gate: French Voice copy-lint — reseller-app catalog (must pass)"
capture copy-lint-reseller-positive pass pnpm exec copy-lint apps/reseller-app/i18n/catalog.json

log "gate: French Voice copy-lint — buyer-pwa catalog (must pass)"
capture copy-lint-pwa-positive pass pnpm exec copy-lint apps/buyer-pwa/i18n/catalog.json

log "gate: French Voice copy-lint — NEGATIVE FIXTURE (veuillez/séquestre + marketing-in-money + Mooré-in-instruction, must fail)"
capture copy-lint-negative fail pnpm exec copy-lint gates/fixtures/negative/catalog.negative.json

log "gate: contracts drift-check — honest /docs copy vs pinned canon manifest (must pass)"
capture drift-check-positive pass pnpm exec drift-check docs --pinned-version 0.1.0

log "gate: contracts drift-check — TAMPERED doc (must fail)"
DRIFT_TMP="$(mktemp -d)"
cp -r docs "$DRIFT_TMP/docs"
printf '\nrogue edit — this consumer copy drifted from canon\n' >> "$DRIFT_TMP/docs/Shop-Plus-Build-Spec.md"
capture drift-check-negative fail pnpm exec drift-check "$DRIFT_TMP/docs" --pinned-version 0.1.0
rm -rf "$DRIFT_TMP"

log "buyer PWA — Playwright harness (shell boots on the shop-plus theme)"
capture playwright-e2e pass pnpm --filter @shop-plus/buyer-pwa test:e2e

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "ONE OR MORE GATES FAILED"
  exit 1
fi
echo ""
echo "ALL GATES GREEN (positives passed; every negative fixture failed as required)"
