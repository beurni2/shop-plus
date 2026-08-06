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
  # An explicit NUMBER pins a specific non-zero code — used for the exit-2
  # "gate could not run" contract (empty scan, unclassified directory), which is
  # a different outcome from "gate ran and found a violation" and must not be
  # provable by the same expectation (AUDIT-B+1 F2).
  case "$expected" in
    ''|*[!0-9]*) ;;
    *) if [ $rc -ne "$expected" ]; then echo "GATE FAILED (expected exit $expected, got $rc): $name"; FAILED=1; fi ;;
  esac
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

log "gate: net-first-display — SP6.1 gains ladder (pinned to gains-model.ts by unit test; must pass)"
capture net-first-display-gains pass node scripts/gates/net-first-display.mjs gates/fixtures/surfaces/gains-echelle.json

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

# SP3.3a — THE SAME LAW, ON THE NEW PATH. The driver runs the REAL order core,
# the real provider seam and the real vault spine (both modes) and asserts that a
# confirm with no funded leg is REFUSED; it then proves the two committed
# journeys below ARE this run's own output, so the gate beneath can never read a
# fixture that has drifted from the code it claims to describe.
log "gate: SP3.3a order path — the LIVE new payment path, both modes, unfunded confirm refused (must pass)"
capture sp33a-order-path pass node scripts/sp33a-order-path.mjs

log "gate: no-confirmed-order-without-funded-legs — the SP3.3a order path's OWN journey (Option B, must pass)"
capture funded-legs-sp33a-live pass node scripts/gates/no-confirmed-order-without-funded-legs.mjs gates/fixtures/order-journey.sp33a-live.json

log "gate: no-confirmed-order-without-funded-legs — NEGATIVE FIXTURE (the SP3.3a path's own confirmed order with a leg one franc short, must fail)"
capture funded-legs-sp33a-negative fail node scripts/gates/no-confirmed-order-without-funded-legs.mjs gates/fixtures/negative/order-journey.sp33a-short-leg.json

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

log "gate: no-supplier-contact — VITRINE redesign profile surface (HANDOFF §3.1, pinned to the storefront port; must pass)"
capture no-supplier-contact-vitrine-profil pass node scripts/gates/no-supplier-contact.mjs gates/fixtures/customer-surfaces/vitrine-profil.json

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

# AUDIT-B+1 F2: the gate learned French, and the FIRST risk of teaching a gate
# French is that it starts failing an approved capability. Single-level
# parrainage is shipped and founder-designed; this asserts the gate still lets
# it through. A pattern that makes this fixture fail is a WRONG pattern.
log "gate: single-level — POSITIVE FIXTURE (single-level parrainage is legal, must pass)"
capture single-level-legal-parrainage pass node scripts/gates/single-level.mjs gates/fixtures/single-level-legal

# AUDIT-B+1 F2 (verifier MAJOR 1) — EVERY PATTERN INDIVIDUALLY LOAD-BEARING.
# The fixtures fail on the SET of patterns. Measured: deleting the `solde…`
# pattern — the exact identifier this whole slice exists for — left every
# fixture red anyway, because siblings still fired. CI would not have noticed
# the law being un-enforced. This gate fails if ANY pattern stops being
# exercised by a fixture line.
log "gate: fr-pattern-coverage — every banned pattern is exercised by a fixture (must pass)"
capture fr-pattern-coverage pass node scripts/gates/fr-pattern-coverage.mjs

# AUDIT-B+1 F2 — THE FRENCH FIXTURES, SCANNED ONE FILE AT A TIME.
# Scanning the whole negative DIRECTORY cannot prove the French half works: the
# English fixture beside it fails too, so the directory stays red even if every
# French pattern is deleted. Measured — that mutation passed the directory scan.
# Each French fixture is therefore scanned ALONE, and its prose is written in
# French precisely so no English pattern can be what makes it fail.
log "gate: no-wallet-no-funds — FRENCH FIXTURE ALONE (soldeVendeur/crediter, must fail)"
capture no-wallet-no-funds-negative-fr fail node scripts/gates/no-wallet-no-funds.mjs gates/fixtures/negative/no-wallet-no-funds/solde-vendeur.fr.ts

log "gate: single-level — FRENCH FIXTURE ALONE (second level in French, must fail)"
capture single-level-negative-fr fail node scripts/gates/single-level.mjs gates/fixtures/negative/single-level/reseau-multi-niveau.fr.ts

log "gate: no-wallet-no-funds — repo source (must pass)"
capture no-wallet-no-funds-positive pass node scripts/gates/no-wallet-no-funds.mjs

log "gate: no-wallet-no-funds — NEGATIVE FIXTURE (wallet/balance module, must fail)"
capture no-wallet-no-funds-negative fail node scripts/gates/no-wallet-no-funds.mjs gates/fixtures/negative/no-wallet-no-funds

# AUDIT-B+1 F2 / M-GATE-03 — THE SCAN-COVERAGE PROOF.
# Every law gate scans an ALLOWLIST of roots, so a top-level directory nobody
# added was scanned by nothing and reported by nothing. This plants a directory
# with a live violation in it and requires exit 2 ("gate could not run") — not
# exit 0. Without this, the coverage fix would be a claim, not a fact.
log "gate: scan coverage — an UNCLASSIFIED top-level directory must break the build (exit 2)"
UNCLASSIFIED_DIR="$ROOT/zz-unclassified-coverage-probe"
cleanup_probe() { rm -rf "$UNCLASSIFIED_DIR"; }
trap cleanup_probe EXIT
rm -rf "$UNCLASSIFIED_DIR"; mkdir -p "$UNCLASSIFIED_DIR"
printf 'export const soldeVendeur = 0;\n' > "$UNCLASSIFIED_DIR/probe.ts"
capture scan-coverage-unclassified-dir 2 node scripts/gates/no-wallet-no-funds.mjs
cleanup_probe
trap - EXIT

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

log "gate: French Voice copy-lint — the PWA CLIENTE refusal strings that live INLINE in screens.ts (SP3.2b, must pass)"
capture copy-lint-inline-refus-positive pass node scripts/gates/copy-lint-inline-refus.mjs

log "gate: French Voice copy-lint — NEGATIVE FIXTURE (an inline REFUS table with veuillez/séquestre/profitez + an over-budget sentence, must fail)"
capture copy-lint-inline-refus-negative fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/screens.ts

# The extractor, not the lint, was the hole the verifier walked through: the
# first version read single-quoted strings only, so administrative French in a
# double-quoted or template-literal refusal passed with « 0 violations ». One
# negative per quoting style, plus one for a DELETED string, so no style can go
# unread again and an omission fails as loudly as a violation.
log "gate: French Voice copy-lint — NEGATIVE (a DOUBLE-QUOTED refusal carrying administrative French, must fail)"
capture copy-lint-inline-refus-negative-double fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/double-quoted.ts

log "gate: French Voice copy-lint — NEGATIVE (a TEMPLATE-LITERAL refusal carrying administrative French, must fail)"
capture copy-lint-inline-refus-negative-template fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/template-literal.ts

log "gate: French Voice copy-lint — NEGATIVE (an INTERPOLATED money sentence, refused outright, must fail)"
capture copy-lint-inline-refus-negative-interp fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/interpolated.ts

log "gate: French Voice copy-lint — NEGATIVE (a DELETED refusal string: the structural floor must bite, must fail)"
capture copy-lint-inline-refus-negative-missing fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/missing-field.ts

# The gate's own blind spots, one level up from the ones above: a field it did
# not recognise and a view key it could not parse were both DROPPED IN SILENCE
# while it printed unchanged counts and « 0 violations ». Adding a subtitle line
# to a refusal is an ordinary next edit; it must not be able to ship unread.
log "gate: French Voice copy-lint — NEGATIVE (an UNKNOWN copy field carrying administrative French, must fail)"
capture copy-lint-inline-refus-negative-unknown fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/unknown-field.ts

log "gate: French Voice copy-lint — NEGATIVE (a QUOTED view key hiding a whole refusal, must fail)"
capture copy-lint-inline-refus-negative-quoted-key fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/quoted-key.ts

log "gate: French Voice copy-lint — NEGATIVE (a QUOTED field key, same family one level down, must fail)"
capture copy-lint-inline-refus-negative-quoted-field fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/quoted-field.ts

# SP3.3b1 — the §6.1 TWO-OPTION CHECKOUT COPY is now extracted and linted by the
# same gate, and each negative below bites through a DIFFERENT door: the lint
# itself, the raw §6.1 word scan (which sees what no string extractor can), the
# structural floor (a DELETED §6.1 sentence), and the placeholder allowlist (a
# money sentence assembled at runtime from a part nothing read).
log "gate: French Voice copy-lint — NEGATIVE (administrative French in the §6.1 PAYMENT copy, must fail)"
capture copy-lint-inline-refus-negative-paiement fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/paiement-administratif.ts

log "gate: French Voice copy-lint — NEGATIVE (§6.1's forbidden word in a CLASS NAME + data attribute, clean copy, must fail)"
capture copy-lint-inline-refus-negative-escrow fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/paiement-escrow-classname.ts

log "gate: French Voice copy-lint — NEGATIVE (a DELETED §6.1 payment sentence: the structural floor must bite, must fail)"
capture copy-lint-inline-refus-negative-paiement-missing fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/paiement-missing-field.ts

log "gate: French Voice copy-lint — NEGATIVE (an unknown runtime placeholder in a §6.1 money sentence, must fail)"
capture copy-lint-inline-refus-negative-paiement-placeholder fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/paiement-placeholder.ts

# « Écouter la note de la vendeuse » was removed from this screen once already,
# by a founder override that has since been revoked (2026-07-30). The label is
# now a linted §6.1 string, and this fixture is the proof that DELETING IT
# specifically fails the structural floor — every other string in it is present
# and lints green, so nothing else can be what fails.
log "gate: French Voice copy-lint — NEGATIVE (the DELETED « Écouter la note » label, must fail)"
capture copy-lint-inline-refus-negative-paiement-ecouter fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/paiement-ecouter-missing.ts

# SP3.3c — C6's POST-PAYMENT copy. These are the sentences a buyer reads while
# her money is in the air and when it did not go through, and they are the
# newest money strings in the app: before this slice the screen said « confirmé
# par l'opérateur » on a 2 400 ms timer and there was nothing else to lint.
# Both fixtures are CLEAN everywhere except the CONFIRMATION table, so if the
# gate ever stops reading that table they both go green in silence.
log "gate: French Voice copy-lint — NEGATIVE (administrative French in C6's post-payment copy, must fail)"
capture copy-lint-inline-refus-negative-confirmation fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/confirmation-administratif.ts

log "gate: French Voice copy-lint — NEGATIVE (C6's waiting sentence DELETED: the structural floor must bite, must fail)"
capture copy-lint-inline-refus-negative-confirmation-missing fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/confirmation-missing-field.ts

# The scan used to walk src/**/*.ts ONLY, so the forbidden word planted in the
# entry HTML shipped while this gate printed « appear nowhere in the buyer
# source ». It now walks every text file a buyer receives — index.html, public/,
# i18n/, css — and this fixture's source half lints green, so the ONLY thing
# that can fail it is the scan reaching outside src/.
log "gate: French Voice copy-lint — NEGATIVE (§6.1's forbidden word in index.html, outside src/, must fail)"
capture copy-lint-inline-refus-negative-scan-outside-src fail node scripts/gates/copy-lint-inline-refus.mjs gates/fixtures/negative/copy-lint-inline-refus/scan-outside-src/clean-screens.ts --scan-root gates/fixtures/negative/copy-lint-inline-refus/scan-outside-src

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

# THE PINNED VERSION IS READ FROM THE RESOLVED PACKAGE, NOT TYPED. It sat here
# as a hardcoded 2.4.0 and went on passing through the whole v2.5.0 bump — for
# the worst possible reason: canon's OWN docs.manifest.json was also stale at
# 2.4.0, so two wrong numbers agreed. Fixing the manifest in canon (v2.6.0) is
# what finally made this one fail. Reading the version the workspace actually
# resolved means the gate compares the shipped pin against the shipped
# manifest, which is the comparison it was always supposed to make.
PINNED_CANON="$(node -p "require('@platform/contracts/package.json').version")"
log "canon pinned in this workspace: $PINNED_CANON"

log "gate: contracts drift-check — honest /docs copy vs pinned canon manifest (must pass)"
capture drift-check-positive pass pnpm exec drift-check docs --pinned-version "$PINNED_CANON"

log "gate: contracts drift-check — TAMPERED doc (must fail)"
DRIFT_TMP="$(mktemp -d)"
cp -r docs "$DRIFT_TMP/docs"
printf '\nrogue edit — this consumer copy drifted from canon\n' >> "$DRIFT_TMP/docs/Shop-Plus-Build-Spec.md"
capture drift-check-negative fail pnpm exec drift-check "$DRIFT_TMP/docs" --pinned-version "$PINNED_CANON"
rm -rf "$DRIFT_TMP"

log "gate: PWA payload budget — fresh build, initial payload < 300 KB compressed (PERF-BUDGETS, WO-4.4 hard gate)"
capture pwa-payload-budget pass node scripts/gates/pwa-payload-budget.mjs

log "buyer PWA — Playwright harness (shell boots on the shop-plus theme; §6.2 journey end-to-end incl. offline)"
capture playwright-e2e pass pnpm --filter @shop-plus/buyer-pwa test:e2e

# RESELLER-SEAM-HONESTY-1 — measures the REAL exported Metro/Hermes bundle, the way
# the storefront-service e2e measures the real bundled Worker. Its negative is not a
# fixture but the DEFECT ITSELF, planted and confirmed red before this gate landed:
# restoring the demo fallback puts « demo://cover/ » back in the artifact and the gate
# exits 1. A populated fallback is dangerous because it can be PRESENT, not selected.
log "gate: no-demo-adapter-in-bundle — the fallback that cannot fail is absent from the exported bundle (must pass)"
capture no-demo-adapter-in-bundle pass node scripts/gates/no-demo-adapter-in-bundle.mjs

# RESELLER-IDENTITY-1 — a SOURCE scan, deliberately, not a second fingerprint on the
# bundle: Hermes compiles `Math.random()` into a global lookup plus a property access,
# so a planted defect leaves the artifact byte-indistinguishable from a clean one
# (measured — see the gate's header). Its negative is the original defect, planted back
# into App.tsx and confirmed red before this landed.
log "gate: mint-path-entropy — no identity/command mint draws from Math.random (must pass)"
capture mint-path-entropy pass node scripts/gates/mint-path-entropy.mjs

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "ONE OR MORE GATES FAILED"
  exit 1
fi
echo ""
echo "ALL GATES GREEN (positives passed; every negative fixture failed as required)"
