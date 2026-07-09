# JOURNAL — shop-plus
Continuity ledger per CTO charter §6/§6bis. Every entry is evidence-grounded.

Format per entry:
## <date> · <slice/WO id> · <status: in-progress | in-review | done | blocked-on-founder>
- What was done (with the tool result / test output that proves it)
- Decisions made · safest-defaults applied on open ⏳ (flagged) · founder overrides
- Pending / next

---

## 2026-07-09 · E0 bootstrap (pre-WO-SP0.1) · done
- Pre-flight: repo slug verified `shop-plus` (origin remote `beurni2/shop-plus` — kebab-case, no "+"). `platform-contracts` pinned clone verified at `b10f4822b173c9cd4b162f416ad213bf580ab652`; `/CONSUMING.md` read.
- **Pin decision:** `git ls-remote --tags` on platform-contracts origin shows **no `v0.1.0`** — pin ref is the commit sha `b10f4822…`, same as boutik-plus; move to `#v0.1.0` in the first version-bump PR. **Observation flagged to founder:** origin carries an unexpected tag **`boss`** → `558e007` (the WO-0B review commit). Not v0.1.0, not acted on.
- Bootstrapped from the pinned clone: `/docs` (all seven canon documents), `/CLAUDE.md` + `/AGENTS.md` (byte-identical), `/WORK-ORDERS/WO-SP0.1.md`, this fresh `/JOURNAL.md`.
- Known-from-sibling (boutik-plus, same day): GitHub Actions in this org needs the `PLATFORM_CONTRACTS_READ_TOKEN` Actions repository secret in THIS repo + the CI-only insteadOf auth step before install — founder's standing ruling (read-only fine-grained PAT). Applied to the CI workflow from birth; the secret itself is the founder's to add in shop-plus repo settings.
- Pending / next: WO-SP0.1 on branch `e0/wo-sp0.1` — consumption pre-flight per `/CONSUMING.md`, then workspace + CI harness to DoD.

## 2026-07-09 · WO-SP0.1 · in-progress
- **Step-3 consumption pre-flight (CONSUMING.md, exact): PASSED.** Both `pnpm-workspace.yaml` blocks; all four `@platform/*@0.1.0` installed from the GitHub URL at sha `b10f4822` (dist/ present, prepare builds ran). Baseline printed: productSubtotal 11500 · buyerTotal 12500 · sellerNet 8500 · resellerNet 2000 · platformProductFeeRevenue 1000 · `assertQuoteReconciles: no throw` (`_evidence/step3-baseline-check.txt`).
- **State-back before code (WO-SP0.1 READ FIRST):**
  - *Repo state as it exists:* slug `shop-plus` verified on origin; before this WO the repo held only the bootstrap commit (docs ×7, charter, WO, journal, LICENSE). No code existed.
  - *Gates SP0.1 stands up (each with a negative fixture shown failing once):* ① money-reconciliation — pinned `assertQuoteReconciles`/`computeWaterfall`, §5.4 baseline fixture; ② net-first-display (SP-I04/SP-I12, §5.4 "gross-first UI is a CI-tested prohibition") — earnings-surface descriptor rule: `resellerNet` renders first, gross never precedes it; negative = gross-first surface; ③ discovery-returns-stores (SP-I05) — discovery responses are STORE collections; negative = flat product pool; ④ attribution-tamper-fails-closed (SP-I09, SP2.1) — signed-token verify stub (TEST keys only); altered payload/signature → hard reject carrying NO reseller id; negative = tampered token; fallback-to-supplier/platform is a gate CRASH (exit 2), never a pass; ⑤ no-supplier-contact (SP-I03) — customer-surface payloads exclude supplier identity/contact/commission/seller economics; negative = leaking surface; ⑥ single-level (SP-I06) — recruitment/downline scanner; ⑦ French Voice copy-lint (§10.5) — pinned CLI over both app catalogs; negative catalog; ⑧ contracts drift-check — pinned CLI over `/docs`; tampered-doc negative; ⑨ architectural checks — no wallet/balance, no learned-ranking/generative/ML deps or imports, no `buyerDropCode` on any seller/reseller surface (allowed only in the buyer PWA).
  - *What the drift-check compares:* this repo's seven `/docs` `.md` files byte-for-byte (sha256) against `docs.manifest.json` shipped inside the pinned `@platform/contracts`, plus `--pinned-version 0.1.0` vs the manifest's `packageVersion`; fails on changed bytes, missing docs, extra top-level `.md`, or version mismatch.
  - *Local `commerce-core` scope at this slice:* fixture builders over the pinned waterfall ONLY — **the immutable Quote and the atomic reservation are single-owner concerns per Contract §2.2 ("User / Order / immutable Quote / EscrowTxn / SettlementObligation / order state machine — hosted by commerce-core; no second definition may exist"); NO authoritative implementation in this repo at this slice** (ADR-001).
