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

log "gate: money-reconciliation — Option-B quote from the pinned waterfall (§5.5 split, must pass)"
capture money-reconciliation-option-b-positive pass node scripts/gates/money-reconciliation.mjs gates/fixtures/quote.option-b.json

log "gate: money-reconciliation — NEGATIVE FIXTURE (Option-B split shift: reconciles to the pinned checker but paid != D, must fail)"
capture money-reconciliation-option-b-negative fail node scripts/gates/money-reconciliation.mjs gates/fixtures/negative/quote.option-b.split-shift.json

log "gate: money-reconciliation — NEGATIVE FIXTURE (paymentMode omitted: the split check may not be skipped, must fail)"
capture money-reconciliation-missing-mode-negative fail node scripts/gates/money-reconciliation.mjs gates/fixtures/negative/quote.missing-mode.json

log "gate: net-first-display — real opportunity-card surface (must pass)"
capture net-first-display-positive pass node scripts/gates/net-first-display.mjs gates/fixtures/surfaces/opportunity-card.json

log "gate: net-first-display — S7 ventes row surface (WO-7.2a, pinned to the presenter; must pass)"
capture net-first-display-ventes-row pass node scripts/gates/net-first-display.mjs gates/fixtures/surfaces/ventes-row.json

log "gate: net-first-display — S7 ventes detail surface (WO-7.2a, net before son prix; must pass)"
capture net-first-display-ventes-detail pass node scripts/gates/net-first-display.mjs gates/fixtures/surfaces/ventes-detail.json

log "gate: net-first-display — NEGATIVE FIXTURE (gross-first earnings surface, must fail)"
capture net-first-display-negative fail node scripts/gates/net-first-display.mjs gates/fixtures/negative/surfaces/gross-first-card.json

log "E1 happy path — full spine run through the SERVICE path, chain + reconciliation (must pass)"
capture e1-happy-path pass node scripts/e1-happy-path.mjs

log "gate: no-confirmed-order-without-funded-legs — happy journey (must pass)"
capture funded-legs-positive pass node scripts/gates/no-confirmed-order-without-funded-legs.mjs gates/fixtures/order-journey.happy.json

log "gate: no-confirmed-order-without-funded-legs — NEGATIVE FIXTURE (confirmed order, short+refunded leg, must fail)"
capture funded-legs-negative fail node scripts/gates/no-confirmed-order-without-funded-legs.mjs gates/fixtures/negative/order-journey.confirmed-unfunded.json

log "gate: no-confirmed-order-without-funded-legs — Option-B journey confirms on its D-funded leg (per mode, must pass)"
capture funded-legs-option-b-positive pass node scripts/gates/no-confirmed-order-without-funded-legs.mjs gates/fixtures/order-journey.option-b.happy.json

log "gate: no-confirmed-order-without-funded-legs — NEGATIVE FIXTURE (full-prepay funding LIE on a PAY_AT_DOOR order, must fail)"
capture funded-legs-option-b-negative fail node scripts/gates/no-confirmed-order-without-funded-legs.mjs gates/fixtures/negative/order-journey.option-b.prepay-lie.json

log "gate: no-confirmed-order-without-funded-legs — NEGATIVE FIXTURE (coherent lie: split-shifted PAY_AT_DOOR quote + matching oversized leg, must fail)"
capture funded-legs-split-lie-negative fail node scripts/gates/no-confirmed-order-without-funded-legs.mjs gates/fixtures/negative/order-journey.option-b.split-lie.json

log "gate: settlement-copies-never-recomputes — happy journey + ledger source scan (must pass)"
capture settlement-copies-positive pass node scripts/gates/settlement-copies-never-recomputes.mjs gates/fixtures/order-journey.happy.json

log "gate: settlement-copies-never-recomputes — NEGATIVE FIXTURE (recomputed-with-different-rounding amounts, must fail)"
capture settlement-copies-negative fail node scripts/gates/settlement-copies-never-recomputes.mjs gates/fixtures/negative/settlement.recomputed.json

log "gate: discovery-returns-stores — real discovery response (must pass)"
capture discovery-returns-stores-positive pass node scripts/gates/discovery-returns-stores.mjs gates/fixtures/discovery/stores-response.json

log "gate: discovery-returns-stores — S3 découverte directory (WO-7.2a, pinned to the directory; must pass)"
capture discovery-returns-stores-s3 pass node scripts/gates/discovery-returns-stores.mjs gates/fixtures/customer-surfaces/boutiques-discovery.json

log "gate: discovery-returns-stores — NEGATIVE FIXTURE (flat product pool, must fail)"
capture discovery-returns-stores-negative fail node scripts/gates/discovery-returns-stores.mjs gates/fixtures/negative/discovery/flat-product-pool.json

log "gate: discovery-returns-stores — S3 NEGATIVE (a directory that leaked a product feed, must fail)"
capture discovery-returns-stores-s3-negative fail node scripts/gates/discovery-returns-stores.mjs gates/fixtures/negative/discovery/boutiques-as-product-feed.json

log "gate: attribution-tamper-fails-closed — valid signed token (must pass)"
capture attribution-tamper-positive pass node scripts/gates/attribution-tamper.mjs gates/fixtures/attribution/valid-token.json

log "gate: attribution-tamper-fails-closed — NEGATIVE FIXTURE (tampered payload, must REJECT CLOSED)"
capture attribution-tamper-negative fail node scripts/gates/attribution-tamper.mjs gates/fixtures/negative/attribution/tampered-token.json

log "gate: no-supplier-contact — real customer-surface projection (must pass)"
capture no-supplier-contact-positive pass node scripts/gates/no-supplier-contact.mjs gates/fixtures/customer-surfaces/product-view.json

log "gate: no-supplier-contact — S5 vitrine surface (WO-7.1, pinned to the view model; must pass)"
capture no-supplier-contact-vitrine pass node scripts/gates/no-supplier-contact.mjs gates/fixtures/customer-surfaces/vitrine-view.json

log "gate: no-supplier-contact — S5 share card surface (WO-7.1, pinned to composeShareCard; must pass)"
capture no-supplier-contact-share-card pass node scripts/gates/no-supplier-contact.mjs gates/fixtures/customer-surfaces/share-card.json

log "gate: no-supplier-contact — S3 découverte directory (WO-7.2a, pinned to the directory; must pass)"
capture no-supplier-contact-boutiques pass node scripts/gates/no-supplier-contact.mjs gates/fixtures/customer-surfaces/boutiques-discovery.json

log "gate: no-supplier-contact — SW-2 LIVE supply path (customer surface derived from a supply projection through the consumer; must pass)"
capture no-supplier-contact-supply-live pass node scripts/gates/no-supplier-contact.mjs gates/fixtures/supply/live-customer-surface.json

log "gate: no-supplier-contact — NEGATIVE FIXTURE (supplier identity/contact/commission leak, must fail)"
capture no-supplier-contact-negative fail node scripts/gates/no-supplier-contact.mjs gates/fixtures/negative/customer-surfaces/leaking-product-view.json

log "gate: no-expo-token-leak — repo source + workflows + lockfile (must pass)"
capture no-expo-token-leak-positive pass node scripts/gates/no-expo-token-leak.mjs

log "gate: no-expo-token-leak — NEGATIVE FIXTURE (committed token literal, must fail)"
capture no-expo-token-leak-negative fail node scripts/gates/no-expo-token-leak.mjs gates/fixtures/negative/no-expo-token-leak

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

log "gate: no-emoji-in-chrome — app surfaces carry only canon SVG glyphs, never emoji (Grand Teint §8, must pass)"
capture no-emoji-in-chrome-positive pass node scripts/gates/no-emoji-in-chrome.mjs
log "gate: no-emoji-in-chrome — NEGATIVE FIXTURE (emoji tab bar, must fail)"
capture no-emoji-in-chrome-negative fail node scripts/gates/no-emoji-in-chrome.mjs gates/fixtures/negative/no-emoji-in-chrome

log "gate: lockfile-url-form — committed pnpm-lock.yaml pins deps by portable https-form URL (cold-install law, must pass)"
capture lockfile-url-form-positive pass node scripts/gates/lockfile-url-form.mjs
log "gate: lockfile-url-form — NEGATIVE FIXTURE (SSH-form git@ URL, must fail)"
capture lockfile-url-form-negative fail node scripts/gates/lockfile-url-form.mjs gates/fixtures/negative/lockfile-url-form

log "gate: French Voice copy-lint — reseller-app catalog (must pass)"
capture copy-lint-reseller-positive pass pnpm exec copy-lint apps/reseller-app/i18n/catalog.json

log "gate: French Voice copy-lint — buyer-pwa catalog (must pass)"
capture copy-lint-pwa-positive pass pnpm exec copy-lint apps/buyer-pwa/i18n/catalog.json

log "gate: French Voice copy-lint — reseller-kit catalog (WO-7.2b composeur, must pass)"
capture copy-lint-kit-positive pass pnpm exec copy-lint apps/reseller-kit/i18n/catalog.json

log "gate: French Voice copy-lint — NEGATIVE FIXTURE (veuillez/séquestre + marketing-in-money + Mooré-in-instruction, must fail)"
capture copy-lint-negative fail pnpm exec copy-lint gates/fixtures/negative/catalog.negative.json

log "gate: E2 failure path — the real service path end-to-end (must pass)"
capture e2-failure-path pass node scripts/e2-failure-path.mjs

log "gate: reservation-release-on-failure — real released world (must pass)"
capture release-on-failure-positive pass node scripts/gates/reservation-release-on-failure.mjs gates/fixtures/payment-fail-released.json

log "gate: reservation-release-on-failure — NEGATIVE (held after payment fail, no alert, must fail)"
capture release-on-failure-negative fail node scripts/gates/reservation-release-on-failure.mjs gates/fixtures/negative/payment-fail-held.json

log "gate: attribution-lock-first-wins — collision refused, lock never moves (must pass)"
capture attribution-lock-positive pass node scripts/gates/attribution-lock-first-wins.mjs gates/fixtures/attribution-first-lock.json

log "gate: attribution-lock-first-wins — NEGATIVE (re-attribution claim, must fail)"
capture attribution-lock-negative fail node scripts/gates/attribution-lock-first-wins.mjs gates/fixtures/negative/attribution-re-lock.json

log "gate: problem-path-never-releases — real source scan (must pass)"
capture problem-path-positive pass node scripts/gates/problem-path-never-releases.mjs

log "gate: problem-path-never-releases — NEGATIVE (planted money machinery, must fail)"
capture problem-path-negative fail node scripts/gates/problem-path-never-releases.mjs gates/fixtures/negative/problem-path-releases

log "gate: E2 door path — Option-B through the real service path end-to-end (must pass)"
capture e2-door-path pass node scripts/e2-door-path.mjs

log "gate: door-signal-requires-provider — real provider confirmation reaches the signal (must pass)"
capture door-signal-positive pass node scripts/gates/door-signal-requires-provider.mjs gates/fixtures/door-signal.happy.json

log "gate: door-signal-requires-provider — NEGATIVE (locally-asserted door payment claims the signal, must fail)"
capture door-signal-negative fail node scripts/gates/door-signal-requires-provider.mjs gates/fixtures/negative/door-signal.local-assert.json

log "gate: contracts drift-check — honest /docs copy vs pinned canon manifest (must pass)"
capture drift-check-positive pass pnpm exec drift-check docs --pinned-version 1.0.0

log "gate: contracts drift-check — TAMPERED doc (must fail)"
DRIFT_TMP="$(mktemp -d)"
cp -r docs "$DRIFT_TMP/docs"
printf '\nrogue edit — this consumer copy drifted from canon\n' >> "$DRIFT_TMP/docs/Shop-Plus-Build-Spec.md"
capture drift-check-negative fail pnpm exec drift-check "$DRIFT_TMP/docs" --pinned-version 1.0.0
rm -rf "$DRIFT_TMP"

log "gate: PWA payload budget — fresh build, initial payload < 300 KB compressed (PERF-BUDGETS, WO-4.4 hard gate)"
capture pwa-payload-budget pass node scripts/gates/pwa-payload-budget.mjs

log "buyer PWA — Playwright harness (shell boots on the shop-plus theme; §6.2 journey end-to-end incl. offline)"
capture playwright-e2e pass pnpm --filter @shop-plus/buyer-pwa test:e2e

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "ONE OR MORE GATES FAILED"
  exit 1
fi
echo ""
echo "ALL GATES GREEN (positives passed; every negative fixture failed as required)"
