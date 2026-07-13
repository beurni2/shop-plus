# WO-7.1 — VERIFIER VERDICT (VERBATIM TESTIMONY)

The text below is the fresh-context verifier subagent's final message, copied
verbatim (only transport HTML-escapes `&gt;`/`&amp;` restored to `>`/`&`). No
session edits. Session commentary about the packet refresh lives in README.md,
never here.

---

I have everything I need. All suites ran green, all typechecks rc=0, gates pass, and I've traced every invariant to canon. Here is my verdict.

---

## FRESH-CONTEXT VERIFIER — WO-7.1 (S5 share hub + vitrine) — RED slice

**Ground truth I ran this session** (not claimed — executed): resolution.test.ts **9/9**, vitrine.test.ts **10/10**, share-hub.test.ts **8/8**, demo-store.test.ts **8/8** (incl. the Metro scan now covering `src/share/hub.ts`); `tsc --noEmit` **rc=0** on reseller-app, buyer-pwa, attribution-service; copy-lint **0 violations** on both catalogs; `no-supplier-contact.mjs` **OK** on both new fixtures.

### CONFIRMED-OK

1. **SP-I09b / no-platform-fallback (money core).** `resolution.ts:1037` consumes canon `resolveAttribution` (pinned dist `04af4b5` — I read it: no platform branch, returns `{attributed:false, reason:'none'}`). `explicitResellerId` is set only after `ResellerShortCodeSchema.safeParse` **and** a server-side `resolveShortCode` hit (`resolution.ts:1045-1048`) — never fabricated. The attributed:false path adds only an alert, no resellerId. `resolution.test.ts` SP-I09b.4 asserts concrete `{attributed:false, reason:'none'}` + `alert defined` + `JSON.stringify(out)).not.toMatch(/platform|supplier/i)` + `not.toMatch(/res_/)` — real assertions, not empty.
2. **SP-I09b precedence/immutability (invariant 6).** Locked passed alongside a second reference → canon returns `source:'locked'`, no alert (`resolution.test.ts:1123`). Tolerant typed code `'aicha 4821'` beats a fresh arrival → `source:'explicit_code'` (`:1137`). `>30d` arrival expired out, recent wins → `source:'arrival'` (`:1150`). All-expired → nobody + alert (`:1188`). Nothing-presented (organic) → nobody, **no** alert (`:1210`). Assertions are concrete.
3. **SP-I03 no supplier/commission (structural).** `VitrineViewModel` and `ShareCard` types carry no supplier/commission field; the `@ts-expect-error` leak tests are load-bearing — they only compile because the field is genuinely rejected, and `tsc rc=0` proves the directives are "used." Byte-level assertions (`vitrine.test.ts:492`, `share-hub.test.ts:891`) confirm rendered/composed output carries none. Both gate fixtures are pinned to the **real** models by test (`view === resolveVitrineSlug(...).view` at `vitrine.test.ts:504`; `card === composeShareCard(...)` at `share-hub.test.ts:899`), and the `no-supplier-contact` gate (key-family scan) passes on both.
4. **SP-I19 price pin.** `DEMO_SHARE_IDENTITY.priceFcfa === computeWaterfall(WORKED_BASELINE_INPUT).productSubtotal` (`share-hub.test.ts:866`). I verified the arithmetic: `WORKED_BASELINE_INPUT` = B 10 000 · M 1 500 → productSubtotal = B+M = **11 500**. Not hand-typed truth. `assertCardAuthoritative` refuses a signed-link-less card (`share-hub.test.ts:914`) — the card's authority is the link, not the print.
5. **Metro-safety.** `hub.ts` sole runtime import is `../demo/store` (zero contracts value; identity suffix is a frozen literal pinned to canon `shortCodeToSlug` node-side in the test). `App.tsx` runtime-imports `@platform/ui-tokens` only (allowed), plus local modules. The Metro scan array now includes `src/share/hub.ts` (`demo-store.test.ts:139`) and forbids `@platform/(contracts|i18n)|@shop-plus/commerce-core` — green.
6. **Canon link form.** `identityLinkSuffix` = `shortCodeToSlug` (`/v/aicha-4821`); `identityLink` builds `origin+base+suffix`; routing is `vitrineSlugFromPath(location.pathname)` (`main.ts:176`), `?demo-vitrine` is an explicit local/gate harness like `?demo-journey`. Test asserts the card link `not.toMatch(/[?&]/)` (`vitrine.test.ts:456`).
7. **French Voice / provenance.** All new `share.*`/`vitrine.*` keys exist with `register` tags; copy-lint clean. Rendered strings go through `t()/tf()`; referenced pre-existing keys (`produit.livre_par_sera`, `produit.paiement_protege`) and CSS classes (`verified-badge`, `trust-row`, `trust-chip`) all exist. App.tsx accented French is confined to comments; the accented literals in `hub.ts`/`vitrine-link.ts` are demo proper nouns (« Aïcha », product names), consistent with the existing frozen `demo/store.ts` — not UI copy.

### OBSERVATIONS (not invariant violations — no blocker, but flag for the CTO)

- **`resolution.ts` emits `reconciliation.alert.v1` on ANY presented-but-unresolved reference, including a merely *expired* arrival** (`resolution.ts:1063-1087`). SP-I09b.4 mandates "attribute nobody, never the platform" but is **silent** on raising an alert — this is an additive operational signal the seam introduces. It does not change the money outcome (nobody stays nobody; no resellerId fabricated) and uses a canon-registered event with a valid strict envelope, so it is safe. But it is the one place the seam goes beyond literal spec text (spec silence filled by an engineering choice). Worth a conscious sign-off rather than silent acceptance.
- **Inaccurate rationale comment, `vitrine-link.ts` (`recordVitrineArrival` docblock, diff ~line 279):** it states "offerId is FORBIDDEN on this scope (AttributionArrivalSchema.strict)." Canon `AttributionArrivalSchema` is a flat `.strict()` object with `offerId: IdSchema.optional()` — offerId is *optional on every scope*; `.strict()` only bars unknown keys. It is `AttributionRefSchema` (the discriminated union) that forbids offerId on `identity`. The **code is correct** (it never sets offerId; test asserts `not.toHaveProperty('offerId')`) — only the stated reason is wrong. Documentation nit.

No tests-that-assert-nothing found; no supplier/commission leak path found; no fabricated-reseller or platform-fallback path found. The slice holds against canon.
