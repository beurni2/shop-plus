# RESELLER-I18N — Fresh-context verifier verdict (VERBATIM)

> Standing rule: the verifier's verdict is COPIED here, never rewritten. The first pass returned FAIL (a 12th, line-wrapped site was missed); this is the re-issued verdict on the corrected bytes, code HEAD `6ee5cd9`.

---

Re-verification complete against HEAD `6ee5cd9`. The FAIL is corrected: the 12th site is ported, the guard is multiline-aware and proven to catch the line-wrapped shape, and everything else holds unchanged. Final verdict below.

---

VERDICT: PASS

Anchored to `6ee5cd9` (branch `e7/wo-reseller-i18n`; journal `e030024`).

A. **PASS** — `apps/reseller-app/src/i18n.ts` is byte-unchanged since the prior review (delta `c693c45..6ee5cd9` touched only App.tsx, test/i18n.test.ts, JOURNAL.md). `tf()` remains loud-fail on both branches: `:35-37` throws on a placeholder with no value (`no value for placeholder {${name}}`), `:41-44` throws on a param matching no placeholder (`param "${provided}" matches no placeholder (mistyped?)`) — distinct from buyer-pwa's silent `?? \`{${name}}\``. The three planted negatives in `test/i18n.test.ts:26/31/34` assert real throws (`.toThrow(/\{code\}/)`, `/no value for placeholder \{amount\}/`, `/matches no placeholder/`).

B. **PASS — the 12th site is ported and a false-green cannot recur.** `App.tsx:398` now reads `tf('gains.baseline_titre', { amount: formatFcfa(baselineProductPriceFcfa()) })` (was the line-wrapped `t(...).replace('{amount}', …)`). `grep -cE "\btf\(" App.tsx` == **12**; `grep -nE "\.replace\(" App.tsx` == **NONE**; a multiline node scan `/\bt\('([^']+)'\)\s*\.replace\(/g` returns **[]**. All 12 tf sites map to their catalog key's single placeholder with the same value expression (verified key-by-key: gains.brut/part/net/baseline_titre · vente.titre/son_prix · selection.compte · share.prix/validite/code/qr_repli · ventes.net_ligne — all OK). The new guard test (`test/i18n.test.ts:38-44`) asserts `expect(offenders).toEqual([])` with the newline-spanning `\s*\.replace\(` regex; I proved it FAILS on a simulated line-wrapped regression of this exact site (`offenders: ["gains.baseline_titre"]`) — not a vacuous assertion.

C. **PASS** — `catalog.json` is not in the origin/main..6ee5cd9 diff (byte-unchanged); the round-trip test (`test/i18n.test.ts:12`) still pins tf output identical to the old `.replace`; copy-lint `copy-lint OK: 90 entries, 0 violations`.

D. **PASS** — origin/main..6ee5cd9 touches only the four named files (`App.tsx`, `src/i18n.ts`, `test/i18n.test.ts`, `test/qr-hub.test.ts`) plus `JOURNAL.md` (bookkeeping, mandated by CLAUDE.md §6). `qr-hub.test.ts:81` still pins the tf form (`/tf\('share\.qr_repli', \{ code:/`). CountUpAmount's `kit.tsx:287 template.replace('{amount}', …)` and `App.tsx:389 template={t('money.amount_f')}` correctly remain out of scope — the template is substituted per animation frame from a prop, so it cannot be pre-interpolated by tf(). Nothing else changed.

E. **PASS** — `pnpm exec vitest run` = **89/89** pass (11 files; the +1 over 88 is the new guard test). `pnpm exec tsc --noEmit` exits **0**. Metro-safety scan (`test/demo-store.test.ts:142-150`, 8 tests pass) still holds: App.tsx runtime imports `tf` `from './src/i18n'` (local relative), and i18n.ts's only `@platform/i18n` reference is `import type` (excluded by the scan's `(?!type )` guard).

BLOCKING FINDINGS: none.

NON-BLOCKING NOTES:
- The guard test now lives in the source-scan family alongside `qr-hub.test.ts` and `demo-store.test.ts`. If more `t(key)`-interpolation-style helpers are ever added, consider centralizing the "no manual `.replace` on a `t(...)` result" scan so each surface file is covered by one canonical assertion rather than per-file duplicates. Not required for this WO.
