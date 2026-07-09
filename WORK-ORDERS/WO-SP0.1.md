> Part of the E0 work-order set (master: E0-Work-Orders.md). Sequence: WO-0 first; the three app WOs pin its v0.1.0 tag. Canon: /docs in this repo (Annex A already applied). Nothing gated; sandbox only.

## WORK ORDER — WO-SP0.1 · Shop+ app workspace + pinned canon + CI harness

### SPEC AUTHORITY (quoted)
- **Shop+ Building Plan v3.0, slice SP0.1 (DoD, verbatim):** *"Per-app workspace in the `shop-plus` repo; consumes `platform-contracts` (contracts/kernel/i18n-catalog/ui tokens) as a pinned versioned package + local `commerce-core`; enforce money-reconciliation, net-first-display, discovery-returns-stores, attribution-tamper-fails-closed, no-supplier-contact, single-level, French Voice copy-lint, and the contracts drift-check from the first PR."*
- **Shop+ Building Plan standing guardrails (CI on every slice):** *"money model reconciles; reseller sees net (gross-first UI prohibited); commission never in buyer price; delivery outside fee bases · discovery returns STORES, not a product pool · no supplier identity/contact or commission on customer surfaces · no duplicate charge; no confirmed order without funded legs for its mode · buyerDropCode never exposed to seller · deterministic (no learned ranking/generative) · single-level · French default + French Voice Standard copy-lint · phone is an alias · canonical shapes from `contracts/`."*
- **Execution Contract E0 repo-topology block** + **founder slug ruling** (kebab-case `shop-plus`; align before first commit).
- **Shop+ Spec §11 CI gates** — the merge-blocking list this harness must register.

### READ FIRST
1. Current `shop-plus` repo state — report the exact slug; rename any "+" variant before committing.
2. `platform-contracts` `v0.1.0` exports + `/docs` manifest.
3. Shop+ Spec §1, §4 (SP-I01…SP-I13), §11; Building Plan Phase 0.
Agent states back: the gate list, the drift-check mechanics, the local-`commerce-core` scope — before writing code.

### BUILD
- Per-app workspace in `shop-plus`: Expo/RN reseller-app shell **+ buyer PWA shell** (Playwright harness stood up) + storefront/attribution/discovery service stubs.
- Pin `platform-contracts@v0.1.0` + local `commerce-core` scaffold, same ADR-001 rule as WO-B0.1: **the immutable Quote and atomic reservation are single-owner concerns (Contract §2.2); no authoritative implementation in this slice.**
- `/docs` drift-checked copy + drift-check in CI.
- CI harness: DoD-named gates as real positive + negative tests — money-reconciliation (pinned `assertQuoteReconciles` + baseline fixture) · **net-first-display** (a UI-contract test: any earnings surface renders `resellerNet` before/instead of gross; fixture rendering gross-first fails) · **discovery-returns-stores** (the discovery contract types return store collections; a fixture returning a flat product pool fails) · **attribution-tamper-fails-closed** (signed-token verify stub: altered payload → hard reject, never fallback) · **no-supplier-contact** (customer-surface projection types exclude supplier identity/contact/commission; fixture leaking them fails) · single-level · copy-lint. Remaining guardrails as executable architectural checks (no wallet/balance, no learned-ranking/generative libs, no drop-code on any seller/reseller surface type).
- Correlation-ID plumbing through one hello-world request; flag/kill-switch client stub.

### OUT OF SCOPE
SP0.2+ (auth, activation, modes) · any real attribution keys (test keys only) · any checkout/payment code · buyer-facing pages beyond the PWA shell.

### DoD (binary)
The SP0.1 DoD quoted above, plus: every named gate demonstrably fails on its negative fixture · both drift-check runs (pass + tampered fail) attached · slug verified kebab-case · reseller shell + PWA shell boot with `ui-tokens` theme `shop-plus`.

### CI GATES THAT MUST STAY GREEN
money-reconciliation · net-first-display · discovery-returns-stores · attribution-tamper-fails-closed · no-supplier-contact · single-level · French Voice copy-lint · contracts drift-check · no-wallet/no-ML architectural checks.

### EVIDENCE REQUIRED
PR #1 CI run with every gate executed · per-gate negative-fixture failure outputs · both drift-check runs · workspace `tree` · lockfile pin line · ADR-001 text.

### FORBIDDEN
- Starting SP0.2 features.
- A "temporary" local Quote type or any locally redefined canonical shape.
- An attribution stub that "falls back to supplier/platform" on tamper — fails-closed means fails.
- Gates without failing fixtures.
- A repo slug containing "+".
