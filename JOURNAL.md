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
