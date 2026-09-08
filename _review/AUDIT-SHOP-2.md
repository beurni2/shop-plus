# AUDIT-SHOP-2 — Shop+ whole-application audit

**Repository:** `beurni2/shop-plus` at `f5d4cc0` (main, 2026-09-08) · **Canon:** `@platform/contracts` 3.13.1 (`b384da9`), `/docs` byte-identical to `platform-contracts` · **Live surfaces:** the storefront Worker (`storefront-service`, deploy 85), the buyer PWA on Pages (pwa-preview 415), the reseller app on the Expo preview channel (expo-preview 448) · **Posture at audit time:** one seated reseller (`rs-7389`) owning one discoverable shop (`sf-7389`); sandbox money only.
**Kind:** read-only. No repository file was changed by the audit; every probe, walk and stub build lives in the session scratchpad. **Author:** the CTO-Supervisor (charter `CLAUDE.md`), with four fresh-context area auditors whose ledgers were re-verified line by line in the source before entering this document.
**Founder's order (2026-09-08):** « an extensive and a very professional audit on the entire whole shop+ app … like a multi-billion-dollar company app … well structured and very deep ».

---

## 0. Executive verdict

**2 BLOCKER · 23 MAJOR · 38 MINOR · 33 NOTE (96 findings).** The core holds: the money model reconciles to the franc at its only source of truth, provider webhooks are the only payment truth, custody's four secrets have one door each, every reseller act is her session, every server string a buyer sees is escaped. **The exposure is at the edges — and two of those edges are outages a real person meets today.**

1. **[BLOCKER] Any admitted reseller can steal another reseller's public slug.** The slug is derived from a client-chosen `shortCode`; nothing enforces uniqueness; the pointer write is unconditional. Measured on the real bundle: reseller B re-points `/s/aicha-4821` from A's shop to hers with one `POST /storefronts`. Bounded today only because one reseller is seated. **This is a hard gate before a second admission code is minted.**
2. **[BLOCKER] The link the reseller actually sends (`/s/{slug}?pid=`) is a blank white page on any network failure.** The `/v/` road and the gift road draw the designed « Pas de connexion » card; the `/s/` road has no `try/catch`, the port's offline marker escapes, nothing is appended. On a 2G Ouaga phone this is the first screen many buyers will meet.
3. **The reseller app tells her things the service never heard.** The Privée/Publique switch toasts success and writes nothing; after a relaunch her card and her share preview print a price the service never signed; a stalled request leaves « Ajouter à ma vitrine » dead for the session; a revoked session has no way back.
4. **Two E2 promises exist only as library code.** Reservation release, the reconciliation alert, stuck-saga detection and the dead-letter queue have no production call site; the CI gate that claims to cover release replays a hand-written fixture.
5. **The supply chain executes a floating `wrangler@4` beside the Cloudflare token** on every deploy; three customer-surface gates are blind to French key names; the reseller's own money package rounds where the law floors (masked while fees are zero).

**Money at risk today: none.** Every finding above is a trust, availability, tenancy or abuse exposure; no path lets a franc move without a provider webhook, and no path recomputes a settlement. **Recommended order of work is in §9**; the first two slices (slug uniqueness, the `/s/` offline card) are small and should land before anything else.

---

## 1. Scope, method and severity scale

### 1.1 What was audited
| Surface | Lines (src / test, `wc -l` at `f5d4cc0`) | Deployable |
|---|---|---|
| `services/storefront-service` (Worker + 8 Durable Objects) | 14 732 / 19 636 (40 test files) | yes — the one Shop+ Worker |
| `apps/buyer-pwa` (Vite PWA on Pages) | 30 526 / 12 302 (48 files) — 24.3 k hand-written `.ts` by the area auditor's cut | yes |
| `apps/reseller-app` (Expo / React Native) | 16 142 / 12 885 (58 files) | yes — preview channel |
| `apps/reseller-kit` | 587 / 348 | yes (Pages) |
| `packages/commerce-core` · `reseller-money` · `supply-consumer` · `store-projection` · `observability` · `flags-client` | 3 143 / 2 990 (commerce-core) + small packages | consumed by the above |
| `services/attribution-service` · `discovery-service` | small | attribution DO bound into the Worker; discovery is a health stub |
| `.github/workflows` (7) · `scripts/gates` (25) · `pnpm-workspace.yaml` · lockfile · `JOURNAL.md` · `docs/` | — | — |

### 1.2 Method
- **Four fresh-context area auditors** (A service · B reseller app · C buyer PWA · D platform/gates/CI/books), each given the charter, the spec sections, the previous audit's ledger and a read-only mandate; each returned a ranked ledger with `file:line`, an evidence tag and a fix. **Every BLOCKER and MAJOR was then re-verified by the supervisor in the source** (and, where cheap, re-measured) before entering this document; the ledgers are not summarised, they are checked.
- **Evidence tags:** `MEASURED` = executed this session (Miniflare probe on the real `dist/worker/worker.mjs`, a driven React Native walk on the real `App.tsx`, a Playwright run on the real http-port build, a gate invoked with a planted fixture) · `READ` = established by reading the source, with the exact lines · `RE-VERIFIED` = the supervisor opened the cited lines (or re-ran the probe) and confirms.
- **Boards (from the repository root, exit codes captured):** `pnpm turbo run typecheck --force` → **exit 0, 19/19** · `bash scripts/run-gates.sh` → **exit 0, ALL GATES GREEN** (Playwright harness included) · `pnpm turbo run test --force` → **exit 1 under full parallel load** (commerce-core `reservation-do.e2e` « TWO CONCURRENT CONFIRMS » timeout 160/161, and `ELIFECYCLE` bundle-rebuild collisions in attribution-service, buyer-pwa, reseller-app, storefront-service while the auditors' own vitest runs shared the machine). **Isolated re-runs, one package at a time:** commerce-core **161/161 exit 0** · attribution-service **43/43 exit 0** · reseller-app **716/716 exit 0** · buyer-pwa **1136/1136 exit 0** · storefront-service **40 files, 689/689 exit 0**. The parallel-load flake is itself a standing finding (F-35 note; AUDIT-SHOP-1 MINOR, still open).
- **Not done, and why:** no live probe of the deployed Worker (this sandbox's egress policy refuses `workers.dev`; the deploy workflows' provenance assertions are the live witness) · no real-device measurement (cold start, touch latency, memory — PERF-BUDGETS binds review until a device drawer exists) · no penetration of the Cloudflare account itself.

### 1.3 Severity scale
| Level | Meaning |
|---|---|
| **BLOCKER** | A law of the canon is broken, or a real person meets an outage on a road that exists today. Lands before the next seat, the next share or the next deploy. |
| **MAJOR** | A law is at risk, a signed budget or a journalled promise is missed, or an abuse road is open at pilot scale. Scheduled as a slice. |
| **MINOR** | A defect with bounded impact, or a proof gap in a gate. Batched into the nearest slice that touches the file. |
| **NOTE** | An observation for the risk register, a documented acceptance, or a fact the next reader should not rediscover from a 500. No action required. |

---

## 2. Findings — ranked ledger

Identifiers `F-01…F-96` are stable for this audit; the domain tag says where the fix lives. Paths are relative to the repository root unless stated.

### 2.1 BLOCKER

**F-01 · TENANCY · service — any admitted reseller can hijack another reseller's public slug; `/s/{slug}` re-pointed to the attacker's shop**
- `services/storefront-service/worker/storefront-do.ts:225-234` (`PUT /pointer` is an unconditional `storage.put`) · `:318-341` (the router writes the pointer on every `created`) · `src/storefront-core.ts:120-145` (`decideCreate` keys collisions on the storefront **id**, never on the slug) · `worker/index.ts:1703-1719` (ownership on `POST /storefronts` checks `resellerId` and `id` only).
- The slug is `slugFromShortCode(cmd.shortCode)` — a **client-supplied** value shaped `[A-Z]{2,12}-[0-9]{4}`. A second reseller creating a NEW id with the victim's `shortCode` answers `created` and overwrites the pointer the comment calls write-once. The directory keeps both rows under one slug, so the founder's console shows nothing wrong. The app's own header admits it: « real per-reseller identity is a HARD GATE before anyone else onboards » (`apps/reseller-app/src/identity/mint.ts:29-33`).
- **Why:** Build Spec §4.1 (the slug is the buyer's only handle), SP-I09 (attribution identity), SP-I03 (the reseller as the commercial relationship). Every printed card, QR and shared link of the victim opens the attacker's boutique, priced and attributed to the attacker.
- **Evidence — MEASURED (probe B, real bundle on Miniflare), RE-VERIFIED in source:** A creates `sf-victime-1` with `AICHA-4821` → `GET /s/aicha-4821` → `id=sf-victime-1 resellerId=rs-…`; B creates `sf-attaquante-1` with the SAME shortCode → `200 created`; `GET /s/aicha-4821` → `id=sf-attaquante-1 … name=Fausse Aïcha`. Key-C directory lists both ids under the slug.
- **Fix:** make the slug pointer **claim-or-tell** exactly like the checkout key pointer (`worker/checkout-do.ts:287-309`): `PUT /pointer` refuses when a pointer already names a different id and the router refuses the create `slug_taken` (claim the pointer before `/entry/create`, or claim the entry first and delete it on a pointer refusal). Better: derive the digits from the account book's own `rs-NNNN` so `shortCode` is not caller-chosen at all. Add the two-reseller probe as an e2e. **Effort S–M.**

**F-02 · RESILIENCE · buyer PWA — the shared product link `/s/{slug}?pid=` is a blank page whenever the storefront service cannot be reached**
- `apps/buyer-pwa/src/main.ts:686-691` (`void (async () => { const resolved = await port.resolve(signedSlug); …` — no `try/catch`) · `src/vitrine/profile.ts:433-445` (`httpStorefrontPort.resolve` deliberately **throws** `VitrineOffline` on a failed `fetch` so the mount can draw the designed state) · `src/vitrine/flows.ts:606-616` (`mountVitrine` catches it; the `/s/` branch does not).
- The rejection escapes the IIFE as an unhandled `pageerror`; nothing is appended to `#app`. The `/v/` road and the `?cadeau=` road both render their offline cards; **the one link the reseller actually sends renders nothing** — no sentence, no « Réessayer », no back. This is not only cold-offline: any transient failure (DNS, captive portal, TLS reset, airplane mode) on the network the product is designed for.
- **Why:** Law 7 (offline-first); the COQUILLE-HORS-LIGNE-1 promise (JOURNAL 2026-09-03: « any buyer who has opened her boutique link … can now re-open it »); charter §5 (the 5-second test cannot start on a white screen). No money at risk — nothing is asked before the resolve.
- **Evidence — MEASURED (area C: Playwright on the real http-port build with every `**/api/**` request aborted: `/v/` → `[data-etat="horsligne"]` visible · `/s/…?pid=` → `PAGEERRORS: ["vitrine-offline"]`, `APP_INNER_HTML_LENGTH: 0` · `?cadeau=` → the hors-ligne card), RE-VERIFIED in source; the supervisor's own re-run of the same probe against the pre-installed chromium reproduced it exactly — `/v/` ✓ designed offline state · `/s/…?pid=` ✘ `PAGEERRORS: ["vitrine-offline"]`, `APP_INNER_HTML_LENGTH: 0` · `?cadeau=` ✓ (2 passed, 1 failed).** No existing e2e covers `/s/` with the network down (`e2e/hors-ligne.spec.ts` drives the root and `/v/` on the demo-port build only).
- **Fix:** wrap the resolve in the `/s/` branch as `mountVitrine` does — `VitrineOffline` → `mountVitrine(app, signedSlug, { etat: 'offline' })` (the surface and its « Réessayer » already exist). Add the `/s/` road to `hors-ligne.spec.ts`, written red first, on the http-port build. **Effort S.**

### 2.2 MAJOR — service (`services/storefront-service`)

**F-03 · AVAILABILITY — public 500 on `GET /s/{slug}` and `GET /media/{key}` for any malformed percent-escape**
- `src/index.ts:596` (`decodeURIComponent(slugMatch[1]!)`), `:597` (`decodeURI(mediaReadMatch[1]!)`); no try/catch at the root. MEASURED: `GET /s/%FF` → `500 URIError: URI malformed`; `GET /media/%FF` → 500; `GET /media/a%C0` → 500. RE-VERIFIED. The session by-id roads were fixed by `decodeSur` in RESELLER-AUTH-1; these two public roads were not. **Why:** the repo's own DoD « every failure is a named refusal »; every 500 is a « Worker threw exception » in the founder's dashboard, cheap to trigger anonymously. **Fix:** the same `decodeSur` guard on both matches → honest 404. **Effort S.**

**F-04 · ABUSE — the anonymous voice-note relay into Boutik+'s media bucket fires BEFORE the hold check: ~1 MB per request, no rate limit, no order needed**
- `worker/order-do.ts:3392-3400` (`televerserNoteVocale` runs before `/entry/create` at `:3402`, where `decideCreateOrder` refuses) · `:461` (≈1 MB accepted) · `worker/index.ts:473-481` (the same relay on every anonymous `POST /listes`). RE-VERIFIED. **Why:** Law 2 — Shop+ makes Boutik+ *store* on an anonymous caller's word; every refusal orphans the object (no sweeper — `src/index.ts:143-146` names the residue); cost and abuse fall on Boutik+. **MEASURED (probe C, counting MEDIA binding):** one anonymous quote; 5 × `POST /checkout/order` with `audioB64` and invented `holderRef` → each `422 quote_not_reserved`, **5 media POSTs, 5 000 000 bytes relayed**, no order ever existed; 3 anonymous liste creates → 3 more relays. **Fix:** upload after a passing `decideCreateOrder` (inside `create()` once holder/receipt matched, before the charge) — on the liste road, create first, then upload and patch the ref; Cloudflare rate-limiting rules on `POST /checkout/order` and `POST /listes`. **Effort M.**

**F-05 · CORRECTNESS — `GET /s/{slug}` fans out 3 + 3·N subrequests; a boutique with more than ~15 products silently loses the rest**
- `src/index.ts:223-250` (pointer + entry + WhatsApp = 3 hops) · `:266-342` (per curated pid: listing pointer + entry + supply presence, +1 on a hide) · `worker/index.ts:36-42` (the code's own statement: the platform budget is 50 subrequests per request on the plan this deploys to; measured ≈ 49 at `:1115`). 3 + 3N > 50 at N = 16; past the ceiling `fetch` throws and every catch on that path (`:278`, `supply-source.ts:307`) maps the throw to « omitted » — **fewer products, no `incomplet` marker** — and the loop is fully sequential (≈ N supply round-trips on 3G). READ (arithmetic; Miniflare does not enforce the ceiling). **Fix:** one collection read (the OFFER binding already serves `/supply-projections`) indexed by pid; one internal DO read returning `{pid → listing}` for the shop; declare `incomplet: true` when any hop fails. **Effort M.**

**F-06 · ABUSE — anonymous POST bodies are unbounded and, on the quote road, buffered twice**
- `worker/index.ts:274` (`request.clone().json()` peek) then `checkout-do.ts:566` (`request.json()` again); `order-do.ts:3174`, `index.ts:421` (listes), `reseller-accounts-do.ts:201/273` (signup/login) — no `Content-Length` check anywhere; `src/index.ts:103` buffers the whole upload BEFORE `IMAGE_MAX_BYTES`/`AUDIO_MAX_BYTES` are consulted (`media/service.ts:185/197`). READ. **Why:** a 100 MB anonymous body becomes 200 MB of strings on the quote road, over the 128 MiB isolate limit; a memory-killed isolate cancels *other* buyers' in-flight requests. **Fix:** one composition-root guard refusing `413` when `Content-Length` is absent or above a per-route cap (quote/reserve/login/signup ≤ 8 KB; order/listes ≤ 2 MB; media ≤ 5 MB); parse once at the root. **Effort S.**

**F-07 · SESSION LIFECYCLE — reseller sessions are immortal on the Worker, and a revoked or reset session is unrecoverable in the app** *(one finding, two halves — A + B merged)*
- **Worker:** `worker/reseller-accounts-do.ts:47` (`session:{sha256} → accountId`, no timestamp) · `:260-265`/`:286-288` (minted on every signup/login, never deleted) · `:415-430` (password change rewrites the hash only — RE-VERIFIED) · `:563-568` (`resoudreSession` checks existence only — RE-VERIFIED); no `/reseller/logout` in the door list `worker/index.ts:907-913`; no login attempt counter. **MEASURED (probe B):** two live sessions for one account; password change with session 1 → 200; afterwards BOTH sessions answer `active` and session 2 still opens `GET /storefronts` → 200. (Old password refused at login — that part holds.)
- **App:** `apps/reseller-app/App.tsx:1280-1285` (the refresh ignores `invalide`) · `:3937-3954, 3999-4003` (a dead session deliberately folds into « Pas de réseau ») · `src/access/feed-service.ts:115` (401 → « Ce code n'ouvre pas. ») · `src/vitrine/offers.ts:101` (401 → « Aucun produit à afficher »). `compteStore.clear()` has **no caller**; no « se déconnecter » string exists; the bearer is plaintext under `Paths.document` (`code-store.ts:44-66`). **MEASURED (walk D1):** every route 401 → no door, three unrelated sentences, no « Me connecter », disk still `active`; only clearing Expo Go's data recovers.
- **Why:** the session is the ONLY credential for every storefront write, listing read and the money feed (ACCES-ARME-2). A phone lost in the market keeps its access forever; the recovery the app offers (« change my password ») does not cut it off; only the founder's per-account pause does. AUDIT-SHOP-1 MINOR, promoted now that the gate is armed.
- **Fix:** store `{accountId, issuedAt, lastSeenAt}` per session, refuse past a lifetime (e.g. 90 days idle), add `POST /reseller/logout`, and on password change delete every `session:*` row of that account except the caller's; a per-email/IP login failure counter. App: `session() → invalide` becomes a designed state (clear bearer + compte, entrance in login mode with one sentence), a « Me déconnecter » row on Profil, a 401 on `/reseller/ventes` mapped to the same state. **Effort M.**

### 2.3 MAJOR — money core, gates and supply chain (platform)

**F-08 · E2 TRUTH — « the release is the rule; the alert is the net; stuck-saga + DLQ live » — none has a production call site**
- `packages/commerce-core/src/reservation.ts:73-79,152-176` (release command) · `src/order-spine.ts:21-44` (`reservationReconciliationAlert`) · `:258-282` (`checkStuckSaga`) · `src/dlq.ts` · `services/storefront-service/worker/checkout-do.ts:265-269` (only `kind: 'reserve'`) · `src/order-core.ts:610,619` (`failPayment`/`retryPayment` called; no release). **MEASURED, RE-VERIFIED:** `grep -rn "kind: '(release|expire)'|reservationReconciliationAlert\(|checkStuckSaga\(|DeadLetterQueue|parkIfPoison"` over `services/storefront-service/{src,worker}` (tests excluded) → **no matches**. In the deployed Worker the reservation is never released on failure and only dies by the 2-minute TTL; `payment_pending` orders older than a TTL raise no `saga.stuck.v1`; poison webhooks are not parked.
- **Why:** Execution Contract E2 exit — « each adversarial scenario in §6 (reservation-held-after-payment-fail …) produces the defined recovery state + a reconciliation alert … DLQ + stuck-saga detection live ». JOURNAL (WO-2.3) books all four as built. The CI gate `reservation-release-on-failure` (`scripts/gates/reservation-release-on-failure.mjs:17-35`) replays a hand-authored JSON fixture and never touches code — green while the Worker holds no release path (charter §6bis: « a port that exists is not a port that is called »). AUDIT-SHOP-1 noted « release is TTL, not the rule » as a NOTE; it is MAJOR because the E2 exit is claimed on it. Money impact today: none (the hold is per-quote, 2 minutes).
- **Fix (his call — §7 stop on the journal/contract claim):** wire them (release on `failPayment`/`cancelOrder`, `checkStuckSaga` from the OrderDO alarm, schema-invalid webhooks through `parkIfPoison`) and replace the fixture gate with a seam test that fails a payment on the REAL bundle and asks CheckoutDO for `released` — or downgrade the journal's E2 claim and the gate's name to what is true. **Effort M.**

**F-09 · SUPPLY CHAIN — the deploy path runs a floating `wrangler@4` beside `CLOUDFLARE_API_TOKEN`; actions tag-pinned; two workflows without `permissions:`; secrets in job env during install**
- `.github/workflows/storefront-deploy.yml:70,73,87,105,119` (`npx --yes wrangler@4` ×4 — RE-VERIFIED) · `payment-webhook-secret.yml:89` · `:26-28` (`actions/*@v4`) · `ci.yml:3-15` and `expo-preview.yml` (no `permissions:` → default `GITHUB_TOKEN`) · `expo-preview.yml:17-18,53-54` (`EXPO_TOKEN`, `EXPO_PUBLIC_STOREFRONT_BASE` as JOB-level env, present during `pnpm install` and its allow-listed postinstalls). The whole workspace builds before `wrangler deploy` with no bundle attestation (the deploy secret itself is step-scoped — correct). **Why:** Contract §11 / E0 security baseline; the Worker is the only surface that can declare money received. **Fix:** `wrangler` as a `devDependency` of the service called through `pnpm exec` (lockfile + integrity), SHA-pinned actions, `permissions: contents: read` on every workflow, `EXPO_TOKEN` scoped to the publish step. **Effort S.**

**F-10 · MONEY — `@shop-plus/reseller-money` rounds where RoundingLaw v1 floors, and is a second money implementation (masked by FRAIS-ZERO)**
- `packages/reseller-money/src/index.ts:113` (`Math.round(gross * 0)`), `:148` — RE-VERIFIED; header `:22-24` (« imports NOTHING — no @platform/* »); pinned law `@platform/contracts/dist/money/waterfall.js` (`floorFraction = Math.floor(base*num/den)`). **MEASURED (26 928 cases):** today 0 mismatches (rate 0); at the law's own 20 % rate `Math.round((C+M)*0.2) !== Math.floor((C+M)*20/100)` in **9 306 / 26 928** cases — a 1 F divergence between what she is shown and the settlement copied from the Quote. **Why:** Law 1 and SP-I04. The day a rate is restored by editing this literal (the comment invites it), screen and payout disagree on ~35 % of baskets, and the `settlement-copies` gate cannot see it (it scans `ledger.ts` only). **Fix:** `Math.floor((gross * NUM) / DEN)` with the canon pair, a test pinning the pair to the installed contracts, and a property test `marginBreakdown(...).net === computeWaterfall(...).resellerNet`. **Effort S.**

**F-11 · GATE BLINDNESS — three customer-surface gates are fooled by French key names (SP-I03 / SP-I05 / drop code)**
- `scripts/gates/no-supplier-contact.mjs:23-29` (five English regexes on KEYS only) · `discovery-returns-stores.mjs:23-35` (`POOL_KEYS = products|items|productPool|results`) · `no-drop-code-exposure.mjs:20-24` (`/drop[_-]?code/`). **MEASURED by area D and RE-MEASURED by the supervisor:** `{fournisseur, telFournisseur, whatsapp, adresseEntrepot, prixBase, marge, sellerPhone}` → `no-supplier-contact OK`, exit 0; a well-formed `stores[]` beside a top-level `catalogue:[{productVersionId, resellers:[…]}]` cross-reseller pool → `discovery-returns-stores OK`, exit 0; `codeDeRemise`/`codeLivraison`/`buyerHandoffPin` pass the drop-code gate. This codebase names things in French; the next leak key will be French. Today's shapes are covered because the fixtures are pinned to real projections by unit tests — the gates cannot catch a new key. **Fix:** French key families + phone-shape VALUE scan (reuse `supply-consumer`'s `CONTACT_NUMBER`); refuse ANY top-level key other than `stores` (parse with the service's own `StoreDiscoveryResponseSchema.strict()`); `code[_-]?(de[_-]?)?(remise|livraison|reception|client)|handoff[_-]?pin`. **Effort S.**

**F-12 · REAL-MONEY GATE (standing, journalled) — the payment webhook is a shared bearer, not a signed webhook**
- `worker/auth.ts:126-131`, `worker/index.ts:1305-1328`: `X-Payment-Webhook-Key` compared constant-time to `PAYMENT_WEBHOOK_SECRET`; no HMAC over the body, no timestamp, no replay window (replays are absorbed by `command_id`). A holder of the string plus any order id (order ids ride the buyer link and the key-C index) confirms payment with zero money. Sandbox-only today; Contract E3 exit (« webhook signatures validated ») and §8 bind before any real franc. AUDIT-SHOP-1 MAJOR 6 — **OPEN, blocked on the aggregator ⏳ Decision**; rotate the secret with the existing workflow until then. **Effort M (at the RMG).**

### 2.4 MAJOR — reseller app (`apps/reseller-app`)

Every finding below was **driven on the real `App.tsx`** through the app's own harness (`test/rendu.tsx`; only native boundaries doubled, only `globalThis.fetch` faked) in a scratch suite of nine walks, 9/9 green as written.

**F-13 · HONESTY — the Privée/Publique toggle on Ma Vitrine toasts a success and writes nothing**
- `App.tsx:2164-2176` (`vitrineCol.setDiscoverable(nv); setToast(…)` — RE-VERIFIED) · `:386-398` (`vitrineCol` is a session-local event log) · `src/vitrine/collection.ts:77-92`. No `publish`/`unpublish` (both exist on the port, `service.ts:400-406`) is called; on mount the fold defaults to `false`, so a shop the wire says `discoverable: true` shows « Privée ». **MEASURED (walk A):** seeded shop `discoverable: true`; press « Privée » → toast « Votre boutique apparaît dans Découvrir », label « Publique », **zero POST**. **Why:** charter §5 « honest states »; the repo's own rule (`App.tsx:890-893`: a silent no-op under a success message is the fabricated-success shape this project refuses). **Fix:** read the toggle from `liveStorefront.discoverable`; press → `service.publish/unpublish`, adopt the read-back, disable in flight, toast only on `ok`; retire the `vitrineLog` fold. **Effort S.**

**F-14 · RACE — the launch-time session refresh can close the door AFTER a successful admission**
- `App.tsx:1270-1289` (mount-time `compteService.session(bearer)` writes whatever comes back, no ordering guard — RE-VERIFIED) vs `:1384-1406` (admission → `adopterCompte({…, state:'active'})`). On a slow link the 12-second refresh answers `pending_access` after she has typed her code and been admitted; the stale answer overwrites disk and state; the admission screen returns; the only recovery is killing the app. **MEASURED (walk B):** `/reseller/session` held on a barrier; code typed, « Ouvrir » → admitted, « Opportunités » pressable, disk `active`; barrier released → « Encore un pas » back, disk `pending_access`. **Why:** the 2026-08-10 walk law's third question; this is the onboarding road of every new reseller on a 2G phone. **Fix:** a monotonic token on the refresh (the `seq` idiom of `use-ventes-reelles.ts:79-93`) or never let a refresh downgrade `active` → `pending_access`. **Effort S.**

**F-15 · RESILIENCE — no timeout on the storefront and offer ports: a stalled request leaves the primary action dead for the session**
- `src/vitrine/service.ts:324, 365, 386, 422, 467, 503, 546, 579` and `src/vitrine/offers.ts:91` — nine `fetch` calls with no `AbortController` (RE-VERIFIED: grep for `AbortController|AbortSignal|signal:` under `src/vitrine` → no matches); contrast `feed-service.ts` and `compte-service.ts` (12 s abort). `App.tsx:961-971` (`publishing` true until the await resolves), `:1061-1095` (`retiring` disables « Retirer » on EVERY card). RN Android's OkHttp client has infinite timeouts unless JS aborts. **MEASURED (walk C):** `/listings` held forever; press → « Envoi en cours… », no sentence, `canPress === false`; back, reopen → still disabled. **Why:** PERF-BUDGETS « Touch → result < 250 ms »; Law 7. **Fix:** one wrapper with `AbortController` + 12–20 s ceiling (uploads ~60 s) mapping abort → `offline`; reset `publishing`/`retiring` in `finally`. **Effort S.**

**F-16 · MONEY DISPLAY — after a relaunch Ma Vitrine and Partager print a cliente price the service never signed**
- `App.tsx:934-938` (`markups[id] ?? defaultMarkup(cap)` — React state, not the signed listing) · `:2276-2294` (card rows) · `:1114-1127, 2433` (Partager « Prix : {client} ») · `:905-913, 1981-2003` (the author's own note: the signed marge is never read back); the fiche was fixed (`:2030-2037`), the card and the share preview were not. **MEASURED (walk E):** `GET /listings/by-pid/*` answering `markup: 2000, customerPriceFcfa: 12000`; « Ma Vitrine » → « 10 000 » twice, no « 12 000 », **`/listings/by-pid/` never called**; « Partager » → « Prix : 10 000 FCFA » while the signed link charges 12 000. **Why:** Law 1 « every quote reconciling to the franc », SP-I19 price snapshot, the trust test. **Fix:** read the signed listing per curated pid (the route exists behind the session), seed `markups` from it, show the signed price on the card and in the preview. **Effort M.**

**F-17 · OFFLINE — no offline queue for any write; offline is an error toast carrying an English wire token**
- `App.tsx:794, 796, 1000, 1259, 1261, 823` (`tf('k.publier.erreur', { raison })` → « L'envoi n'a pas marché — {raison} — réessayez ») · `service.ts:329-331` (`'offline'`), `:333, :438, :525, :566` (`http_NNN` or the Worker's `error` string); `voice.ts:100-112` states « this app has no retry queue »; nothing persists an intent. **MEASURED (walks D2/D3):** `/listings` throws → « … — offline — réessayez », no second POST; 401 → « — http_401 — » / « — unauthorized — ». **Why:** PERF-BUDGETS « every queued action survives app-kill AND device reboot » is vacuous — nothing is queued; Law 6 (a wire token is not French Voice); Law 7. **Fix:** (a) S — never print `raison`; transient → a retry sentence, the rest → named refusals (`saveRefusalToastKey` idiom); (b) L — a durable intent queue replayed on reconnect with the idempotent command ids the wire already has. **Effort S + L.**

**F-18 · DATA COST — `GET /storefronts` is re-asked on every navigation while the service is unreachable**
- `App.tsx:496-514` — effect deps `[service, identity, liveShop, screen]` re-fire while `liveShop === undefined`; on a dead or 401 wire every tab press costs a request (plus `getById`, plus the offer list on two screens). **MEASURED (walk D1):** 5 screens, every route 401 → `GET /storefronts` asked **5 times**. **Why:** the reference network is metered 3G; the app's own rule at `:435-440`. **Fix:** mark a failed read as answered-with-fault; retry on entering vitrine/personnaliser/accueil or explicit pull, with back-off. **Effort S.**

### 2.5 MAJOR — buyer PWA (`apps/buyer-pwa`)

**F-19 · HONESTY — the deployed root is a fictional store directory whose every link is dead**
- `src/main.ts:1020-1040` (root and every unmatched path render `renderBoutiques` over `DEMO_STORES`) · `src/boutiques-view.ts:85` (`href="/v/${esc(s.slug)}"` — origin-absolute, so on project-pages hosting it leaves `/shop-plus/` and 404s — RE-VERIFIED), `:144,154` · `src/vitrine/flows.ts:724` (`decouvrir` → `'/boutiques'`) · `src/demo-stores.ts:60-111` (five invented resellers with invented delivered-sales counts). Even base-aware, none of the five slugs exists on the live Worker (one shop is seated). JOURNAL 2026-09-03 already names the href as « pre-existing … flagged for its own slice »; still open. **Why:** charter §5 « never fake counts »; a buyer who types the app's address meets five sellers who do not exist and taps into a 404; `hors-ligne.spec.ts:44-45` pins « CHEZ AÏCHA » as the offline home, certifying the fiction. **Fix:** until a real discovery producer exists (F-95), the root lands on an honest « entrez le lien de votre vendeuse » card (or the seated shop), never the demo log; every `/v/`·`/boutiques` href goes through `vitrineHref`/`deployBaseFromPath` as the C-ENT entries already do; keep `?demo-boutiques=` as the harness lever. **Effort S.**

**F-20 · INSTALLABILITY — the PWA is not installable: the manifest declares no icons; no `theme-color` meta, no `apple-touch-icon`**
- `public/manifest.webmanifest:11` (`"icons": []` — RE-VERIFIED) · `index.html` (no `theme-color`, no `apple-touch-icon`); `public/` holds no PNG. Chrome's install criteria need a 192 px and a 512 px icon; with none, no `beforeinstallprompt` fires and « Ajouter à l'écran d'accueil » makes a plain bookmark with a letter tile. **Why:** Law 7 and the previous audit's own framing (« installed and cold-opened without network ») — that scenario cannot occur on Android today. **Fix:** a 192/512 maskable PNG pair (the Shop+ wordmark on `#C2571B`), `purpose: "any maskable"`, `theme-color` + `apple-touch-icon`, both files in the precache list; a manifest test. **Effort S.**

**F-21 · PAYLOAD — `zod` and the whole `@platform/contracts` barrel ride in the buyer bundle: 24.8 KB gzip (19 % of first-load JS) for one one-line function**
- `src/vitrine-link.ts:1` (`import { shortCodeToSlug, type AttributionArrival } from '@platform/contracts'` — RE-VERIFIED) · the barrel `dist/index.js:9-25` re-exports every schema. `shortCodeToSlug` returns `/v/${code.toLowerCase()}`; its only callers `identityLink*` are used by no app code, only by `test/vitrine.test.ts:48-53`. **MEASURED:** sourcemap attribution zod 20.9 % + contracts 8.0 %; stub build aliasing the package → entry `129 440 → 104 632 B` gzip, `ZodError` references 348 → 0. **Why:** PERF-BUDGETS « Buyer-page JS ≤ 150 KB · initial payload < 320 KB »; the gate stands at 95.4 % of the founder-signed line, and the line was raised from 300 KB on 2026-08-31 for a 2.6 KB map face while ~25 KB of unused schema code sat in the entry; every canon schema name ships as plaintext to every buyer. **Fix:** type-only import + inline the slug rule (or a side-effect-free deep import); delete or move `identityLink*`; a bundle assertion (`ZodError` count 0) in `pwa-payload-budget.mjs`. **Effort S.**

**F-22 · PAYLOAD — product photos: the 170 px tile and the C1 hero both load the full 1280 px derivative; the server-side thumbnail variant is never requested**
- `src/vitrine/render.ts:246-254` (`<img src="${esc(hero)}" loading="lazy">` with `hero = assetRefs[0]`) · `src/cliente/screens.ts:596-600` · Boutik+ `services/media-service/src/media.ts:68,106` (`GET /media/{token}?v=thumb`, 320 px, ≤ 96 KB exists) · Boutik+ normalisation `maxEdgePx: 1280, compress: 0.8`. **RE-VERIFIED:** grep `v=thumb` under `apps/buyer-pwa/src` → 0 hits. A shop of 8 articles pulls 1–3 MB of imagery over a 1.5 Mbps link for two columns of 170 px tiles. READ (sizes are the producer's spec; no real product bytes in this checkout). **Why:** PERF-BUDGETS « thumbnail ≤ 15 KB · hero ≤ 80 KB · card ≤ 25 KB compressed incl. thumbnail » — missed by an order of magnitude on tiles; charter §5 « images sized for the network ». **Fix:** `${hero}?v=thumb` in `tileArt`/`produitArt` and the liste/panier rows; full derivative only on the C1 frame and gallery; `width`/`height` attributes; assert the suffix in `vitrine-grille.test.ts`. **Effort S** (PWA) / **M** if the thumb ceiling is tightened service-side.

**F-23 · DATA COST — the service worker precaches all 29 header chunks and re-downloads all nine fonts on every deploy**
- `vite.config.ts:26-33` (precache = every `assets/*` + every `fonts/*.woff2`) · `sw.template.js:59-84` (`cache: 'reload'` on fonts). On install the worker fetches ≈ 105 KB gzip of lazy header chunks the buyer will never draw — the exact bytes `pwa-payload-budget.mjs:14-33` argues do NOT count — and refetches 177 KB of fonts on every version, in the background, on metered data. **MEASURED:** `dist/sw.js` precache list holds 30 `assets/*` and 9 `fonts/*` entries. **Fix:** precache the entry graph plus the faces `classique` needs; let header chunks and the other faces cache on first use (add `cache.put` on the network path of `depuisCacheDabord`); content-address the fonts so they copy forward like chunks. **Effort S/M.**

**F-24 · PRIVACY — her GPS position is sent to a third party (OpenStreetMap tile servers) before she confirms anything, under a sentence that says « partagée seulement avec votre livreur »**
- `src/geo-carte.ts:57` (`https://tile.openstreetmap.org/${zoom}/${x}/${yt}.png` — RE-VERIFIED) · `src/cliente/flow.ts:1912-1938` · consent copy `src/cliente/screens.ts:781,795`; the liste sheet likewise (`vitrine/flows.ts:405-427`). After « Ajouter ma position » ~20 z17 tile URLs around the fix (her position to ~300 m, with her IP) go to OSM while the face says the pin is shared only with her rider. Separately, OSM's tile usage policy forbids apps loading `tile.openstreetmap.org` directly without permission, and the requests carry no identifying User-Agent. The e2e aborts the tile route, so the suite never sees the disclosure. **Why:** the GPS pin is the same privacy class as her phone number (standing constraint); a consent line that is false is worse than none. **Fix (his call on the approach):** (a) proxy tiles through the Worker (`GET /tiles/{z}/{x}/{y}`, real UA, edge-cached — also solves the ToS point), or (b) say the truth in the consent line and keep the pin private. (a) is the honest one. **Effort M.**

**F-25 · LEGIBILITY — trust-row and proof text at 8–9.5 px, several below 4.5:1 contrast, across ~20 of the 29 header styles**
- `src/vitrine/entetes/{bazin,billet,braise,calebasse,couverture,douceur,dynamique,enseigne,fleurie,hologramme,karite,pagne}.ts` (`font-size: 8px`) · `audace, chaleureux, grenat, indigo, kraft` (8.5 px) · `etendard, terracotta, tissage` (9.5 px); e.g. `pagne.ts:277-281`. **MEASURED (static):** pagne `.pg-cell-s--o` #C46A18/#FFF **3.87:1**, `.pg-stars` **3.20:1**, `.pg-zone` 4.49:1 — the three trust cells (« Livraison Séra vérifiée & scellée » · « Paiement protégé » · « Les meilleurs prix garantis ») are the smallest, faintest text on the page. **Why:** charter §5 « large readable type … verified proof gets visual treatment » — and Aïcha in sunlight. **Fix:** floor the label at 11 px and the subline at 10 px, sublines from each palette's deep tone (≥ 4.5:1), a token-fidelity test failing any `font-size` below 10 px in `entetes/*.ts`. **Effort M** (29 files, mechanical).

### 2.6 MINOR

**Service (A)**
- **F-26** Credentialed decode roads still 500: key C `POST /storefronts/%FF/unpublish` and `DELETE /storefronts/%FF`; session `GET /listings/by-pid/{sf}/%FF`; webhook `GET /checkout/webhook/leg-key/%FF` (`storefront-do.ts:368,465`, `listing-do.ts:181,200`, `order-do.ts:3663`). MEASURED. Unauthenticated callers get 401 first — correct. Fix: `decodeSur` at the three router entry points. S.
- **F-27** Liste share tokens (192-bit secrets) logged in clear on the shared 404 handler (`worker/index.ts:400-409` → `src/index.ts:599` → `observability/health.ts:23-27` logs `path` verbatim); the attacker-controlled `x-correlation-id` header is logged unbounded (`logger.ts:56-58`). MEASURED (`GET /listes/<token>/cadeaux`, `HEAD /listes/<token>`). AUDIT-SHOP-1 item, open. Fix: local 404 for token-bearing namespaces; cap the header at 64 chars. S.
- **F-28** `/reseller/suivi` ignores its own per-account feed reads in the subrequest budget (`worker/index.ts:1000-1036`: 1 + up to 50 + 40 → 91); past ~9 accounts with sales the board degrades to `incomplet: true` rows (honest, not a 500). Fix: one `/rows-for-many` DO read counted in the budget. S.
- **F-29** No timeout on any outbound call (`checkout-do.ts:673`, `supply-source.ts:301`, `src/index.ts:301`, the alarm flushers `order-do.ts:2037-2302`) — the checkout budget (≤ 800 ms server p95) is unbounded by construction; a slow `offer-service` stalls every quote and boutique read. Fix: `AbortSignal.timeout(2_000)` on buyer-path reads (timeout = the existing « undescribable » branch), `10_000` on flushers. S.
- **F-30** Door-charge attempt/result records grow without bound while the door leg is `due` (`order-do.ts:2741-2761, 2812`; `order-core.ts:234-256`): ~200 B per fresh `commandId` until the 128 KiB value limit wedges the order's door road. No money risk (one stable provider key). Fix: refuse a new door charge while an accepted attempt is younger than N minutes, or cap attempts by name. S.
- **F-31** `toStorefrontView` spreads `featuredItems` unguarded (`src/customer-projection.ts:272`) — a raw pre-canon entry answers 500 on the public read; the JOURNAL records such entries existed (the key-era orphan, since deleted). Fix: `[...(sf.featuredItems ?? [])]`, `sf.sections ?? []`. S.
- **F-32** Password hashing at 60 000 PBKDF2-SHA-256 iterations (10× under the OWASP 2023 figure) on an unthrottled singleton: every session-gated request resolves through the same object, so an anonymous login flood serialises KDF work in front of every reseller write (`reseller-accounts-do.ts:112, 272-289`). Fix: raise iterations at next rotation (store the count per record); rate-limit login at the edge (with F-07). S.

**Platform, gates, CI/CD, books (D)**
- **F-33** The money gate accepts a coherent lie between the two nets: `sellerNet −100`, `resellerNet +100`, `resellerGrossEarnings: 999` exits 0 « reconciles to the franc » (`scripts/gates/money-reconciliation.mjs:30-66`; the pinned `assertQuoteReconciles` checks only the three sums). MEASURED. Production is correct by construction (`issueQuote` spreads `computeWaterfall`); the exposure is fixtures and any hand-built quote. The pinned checker is canon (§7 — flag to platform-contracts); the local gate can add the per-field arm as WO-2.5 added the split. S.
- **F-34** A string `fee` on an authenticated webhook is recorded as 0 (`order-spine.ts:411,560`: `typeof fee === 'number' ? fee : 0`) against `ledger.ts:27` « provider truth, copied as-is ». MEASURED (`fee: '250'` → applied, `paymentLegs[0].fee === 0`). Journalled as a standing NOTE; it should refuse `malformed_payload` rather than write a wrong franc into a money record. S.
- **F-35** No dependency scan in CI; `pnpm audit` 8 high / 8 moderate, all build/test tooling (sharp, undici via miniflare; brace-expansion, js-yaml, uuid via expo tooling; postcss/nanoid via vite) — none a runtime dependency of a deployed artifact (traced). Contract E0 exit requires « dependency + secret scanning in CI »; only the secret half exists (`no-expo-token-leak`). Fix: `pnpm audit --prod --audit-level=high` gate with an allow-list, or dependabot. S. *Also standing:* the full parallel test board flakes under load (5 packages red today, every isolated re-run green) — AUDIT-SHOP-1 MINOR, open.
- **F-36** `PLATFORM_CONTRACTS_READ_TOKEN` is written in plaintext to `~/.gitconfig` in five workflows (`ci.yml:20-28`, `pwa-preview.yml:55-62`, `service-canon-drift.yml:55-61`, `storefront-deploy.yml:33-38`, `expo-preview.yml:66-68`) for a repository that is public (MEASURED: `GET api.github.com/repos/beurni2/platform-contracts` → 200 unauthenticated); the lockfile resolves every `@platform/*` to a codeload tarball, so the rewrite is likely never exercised; never scrubbed. Comments disagree (« private » vs « the repos are public »). Fix: drop the token or scope it; say once whether the repo is meant to be private. S.
- **F-37** The override block that calls itself « THE REAL PIN » is stale, and `@platform/ui-tokens` disagrees three ways: `pnpm-workspace.yaml:49-56` says « 3.13.0 (35a21ea) » while the override and manifests hold `b384da9` (3.13.1); `:57-66` says « v0.9.9 (1c98ad1) » while the override is `be2199c` and the INSTALLED version is 1.1.0; every `package.json` pins ui-tokens to `a418ca4`; `@platform/i18n` 3.12.0 beside contracts 3.13.1. Content identical (drift-check OK), but the file's own warning is the hazard its comments now model. AUDIT-SHOP-1 MINOR, open. S.
- **F-38** `lockfile-url-form` misses the `ssh://`/`git+ssh://` forms its own CI comments name (`scripts/gates/lockfile-url-form.mjs:22` scp form only; `ci.yml:21-28` rewrites `ssh://git@github.com/`). A regenerated lockfile in that form passes the gate and breaks a cold clone. S.
- **F-39** Books: Building-Plan slice ids are not tracked (only `SP0.1` and `SP6.1` appear in journal headers; `SP1.2, SP1.3, SP2.2, SP2.3, SP3.1, SP4.3, SP5.2, SP6.2` never named); every plan DoD requires « offline verified · low-end Android / interrupted-network » and no entry carries a device-matrix line; Spec §12 still lists « ✅ reseller 20% real from launch » and §5.4 a 5 %/20 % baseline while canon computes 0 (FRAIS-ZERO), and SP3/SP1.3 « ≤ ~15–20 % » vs the shipped 25 % cap — §6.1 was amended for its override, §5.4/§12 were not. Canon amendments are §7 stops — flagged, not edited. S (a slice ledger + two canon notes).
- **F-40** Unresolved-attribution alerts share one `command_id` when no correlation id is given (`services/attribution-service/src/resolution.ts:88-90`: `attr-unresolved-${correlationId ?? 'checkout'}`); a sink deduping on `command_id` keeps the first and drops the rest. Fix: make `correlationId` required. S.

**Reseller app (B)**
- **F-41** Profil's two password fields render unmasked (`App.tsx:4176, 4178`, no `secureTextEntry`) while the entrance masks by founder order. MEASURED (walk F). Fix: the same « Voir / Cacher » control. S.
- **F-42** `vente_detail` renders DEMO data (« Awa », CMD-2417, 2 500 net; `App.tsx:1290` `demoDetail()` every render, `:2640-2699`, `ventes.ts:80-86, 208-211`) and is unreachable (no control walks the `journey.ts:56` edge); `world`, `ficheOpp`, `viewOf` are dead (`noUnusedLocals` unset). MEASURED (walk G): one pressable on « Mes ventes » — the back chip. Fix: delete or wire. S.
- **F-43** The live preview channel wears the sandbox banner (« Aperçu — bac à sable » on every screen: `preview.ts:9-17`, `expo-preview.yml` sets no `EXPO_PUBLIC_PROFILE`) and ships diagnostic strings (`voice-sheet.tsx:146-149, 246` inline « Diag micro (…) »). Law 6, §5. S.
- **F-44** Two surfaces bypass the tokens with raw hex and sizes: `k-styles.ts` (141 hex), `cercle/styles.ts` (141), inline in `customize/screens.tsx`, `voice-sheet.tsx`, `cercle/screens.tsx`; `App.tsx`/`kit.tsx`/gallery/clip/icons: 0. The v2 migration never reached Personnaliser or Cercle. L.
- **F-45** Touch targets below the 48 px token: « Tout voir » 32 (`App.tsx:3015-3016`), « Personnaliser ma boutique » 46, « Retirer » 46 (comment says « 44px+ »), toggle 46; `k-styles` `backBtn` 40, `segBtn` 38, `vStopBtn` 40; `cercle/styles` `backBtn` 40, `chipRose` 38, `zoneChip` 40, `segChip` 36. S.
- **F-46** Coupe's « Vérifier à nouveau » is silent on failure (`App.tsx:1365-1376`; no toast tree on gate screens). S.
- **F-47** A swallowed identity write at admission can split shop from account (`App.tsx:1198` `.catch(() => undefined)` vs `:749-758` launch reads the file, never the compte → publishes under the old id → mute 404s). Fix: derive identity from `compte.accountId` at launch. S.
- **F-48** Voice notes: no client duration cap (`voice-capture.ts:46` ≈ 16 KB/s → the ~1 MiB bound at ≈ 65 s); `voice-sheet.tsx:195-203` drops `res.reason` → « Réessayez » for a `too_large` that can never succeed. S.
- **F-49** Opportunités: one video player per tile (`App.tsx:1804-1816` + `product-clip.tsx:136-149`), App-level re-render per image load and per keystroke (`setCadres`, `setMarkups` at App level; inline `renderItem`). READ. M.
- **F-50** `ventes.titre` = « MES VENTES — LES PROBLÈMES D'ABORD » on the real list (`App.tsx:171`, `feed-screen.ts:112-114`); the feed cannot carry a problem. S.
- **F-51** Stale « code » and « vérification Séra » sentences: `accueil.gains_verrouille_sub`, `ventes.reel_refus_hint` (shown on a 401 — walk D1), `k.cover.pilule_verif`/`note_verif` (covers go live on upload). S.

**Buyer PWA (C)**
- **F-52** A 5xx or proxy page on `GET /s/{slug}` renders « Ce lien ne mène à aucune boutique » (`profile.ts:446` `if (!res.ok) return undefined` → `invalid`) — a lie about a good link that tells her to ask the seller for a new one; the quote port already separates `unreachable`/`unreadable`. Fix: a third outcome for 5xx/non-JSON → the offline card's « Réessayer ». S.
- **F-53** Six refusal names the service actually emits land on the generic sentence « Nous ne pouvons pas afficher le prix » (`cliente/screens.ts:1061-1202` REFUS table vs `reservation_expired`, `quote_not_reserved`, `reservation_held_by_another`, `quote_unknown`, `stored_quote_unreadable`, `charge_rejected`, `liste_prepaiement_requis`/`liste_contact_conflit`). « Rien n'a été payé » stays true; the diagnosis does not. S.
- **F-54** C6 « Paiement de X confirmé » prints the QUOTE's split, never the ORDER's own `amountPaidAtCheckout` (`cliente/flow.ts:871`; `quote-port.ts:125-126` validates the field then never uses it). Today they cannot differ; the doctrine is « ask the ledger, not the response ». S.
- **F-55** A malformed wire field blanks the shop: `looksLikeProduct` checks `Array.isArray(assetRefs)` not its items; `looksLikeStorefront` = id + slug only; `render.ts:86,246` then throws before `innerHTML`. MEASURED (`assetRefs: [123]`, a storefront without `cover`). Fix: validate items, default the optional collections at the boundary. S.
- **F-56** Touch targets under 44 px on the buyer flow: `.cl-voir` (12 px text, no min-height), `.cl-round-btn` 40×40, `.cl-chip` 40, `.cl-rec-stop` 40, `.cl-refaire`, `.vt-topbtn` 40×40 (`cliente/styles.ts:121-136, 326-331, 367, 373`; `vitrine/styles.ts:58-64`). The hearts/panier/WhatsApp discs and the CHANGER/MODIFIER pills are 44 — the law is known here. S.
- **F-57** C3's three inputs have no accessible name (`screens.ts:878, 885, 909`); `merci-alerte` and `liste-alerte` carry no `role="alert"`; every state change replaces `innerHTML`, so focus returns to `<body>`. The liste sheet uses `<label>` wrappers — apply the same. S.
- **F-58** Phone + repère persist in `sessionStorage` for the whole delivery (`cliente/reprise.ts:60-84`; cleared only on C1/C10) and the checkout voice note's blob URL is never revoked (`flow.ts:1889`; the liste side revokes). GPS pin and audio bytes are correctly memory-only (verified). Fix: clear on `confirmed`; revoke on leaving C3. S.
- **F-59** French Voice: the bulk of the buyer flow's copy is inline and unlinted (the gate lints six named tables, « every OTHER inline string » is not); `MERCI` (incl. the WhatsApp message) and the §6.2 `INSPECTION` tables are not among the six. Law 6. S (gate) / M (migration, already journalled as its own slice).
- **F-60** The operator screens name « Orange Money » for every payment (`screens.ts:1767`, `:2174` « Composez votre code secret Orange Money ») while the same screen lists « ORANGE MONEY · MOOV MONEY » and the live provider is the sandbox mock. A Moov buyer gets the wrong instruction on the money screen. S.
- **F-61** No CSP, no referrer policy; `window.open(…, 'noopener')` without `noreferrer` (`vitrine/flows.ts:1204`, `cliente/flow.ts:1782`). Escaping is total (§7), so this is defence in depth; an old WebView can leak `?liste=<token>` or `/s/{slug}?pid=` to `wa.me`. S/M (CSP needs the inline restore script hashed).
- **F-62** The real checkout has no offline state of its own: « Hors ligne : vos actions sont en attente » and the C6 `pending`/`offline` bodies are reachable only through the demo harness (`flow.ts:458`); on the real road a payment tap with no network reaches `unreachable` → « Pas de connexion. Rien n'a été payé. » — honest and correct under Law 7 (never a final act offline), but no queue exists and the budget row « offline queue durable » has nothing to measure. Say so in the docs, or build the queue. S (docs) / L (queue).
- **F-63** Root/shell has no offline detection of its own (`main.ts:1020-1040` renders the directory in `state: 'default'` regardless of `navigator.onLine`); with the service worker a cold-offline root shows the demo directory as if online. Fold into F-19. S.

### 2.7 NOTE

**Service (A)**
- **F-64** `create()` has a check-then-write window across the attribution-lock await (`order-do.ts:1516-1531` read, `:1583` await, `:1757-1768` write): two concurrent creates for one quote with different `commandId`s both pass; both charge under the SAME leg key (no double collection); the audit record can end with an `ATTEMPTS` id absent from the log. Unpinned. `blockConcurrencyWhile` or a re-read after the lock await closes it.
- **F-65** Client clocks are trusted as `at`/`serverTime` on storefront and listing writes (`storefront-do.ts:369-372, 418-421`; `storefront-core.ts:163/201`; `listing-core.ts:161`) — a reseller can set `updatedAt` to 2099 (the directory's ordering truth). Not a money field. Stamp `at` at the router.
- **F-66** Plaintext remise code lives in the OrderDO and in the custody-arm outbox row (`order-do.ts:2600-2635`); `/entry/outbox` strips it; no public or reseller wire carries it (gate `no-drop-code-exposure`). Accepted and journalled; the alternative (custody minting it) is a §7 contracts change.
- **F-67** Wishlist edit key compared with `!==` (`wishlist-do.ts:138, 167, 195`) — hash vs hash; the early exit leaks a hash-prefix fact, not the key; not exploitable. Reclassified NOTE (AUDIT-SHOP-1 MINOR). A one-line `timingSafeEqual` closes it.
- **F-68** `/health` custody presence booleans (`src/index.ts:61-77`, `worker/index.ts:1609-1613`) — presence only, read by the deploy workflow; acceptable. Gap: it does not say whether `SERA_PROGRESS_SECRET` exists — the one presence fact that decides whether Boutik+'s credential can still mint `delivery.validated.v1`. Add it.
- **F-69** What one leaked secret buys (risk register): `CHECKOUT_OPS_SECRET` (lives in the founder's browser) → every buyer's phone/quartier/repère/GPS pin/audio ref, the roster's names/emails/phones, minting admission codes, pause/resume, ladder writes, unpublish/delete any shop — the largest blast radius; consider a short-lived console token minted from it · `PAYMENT_WEBHOOK_SECRET` → free goods (F-12) · `PROGRESS_WRITE_SECRET` while the Séra split is unset → settlement eligibility for any order (confirm the split is armed live) · `SERA_PROGRESS_SECRET` → arrival marks and obligations to an arbitrary `supplier_ref` · outbound-only secrets open nothing here.
- **F-70** Login timing distinguishes a known email (unknown email returns before the KDF; MEASURED 3.0 ms vs 12.0 ms). Moot while signup answers `409 email_taken` by design.
- **F-71** `durationMs=abc` passes the service's duration cap as `NaN` (`src/index.ts:112`, `media/service.ts:200-201`); the DO refuses and the route answers 502 — but the bytes are already in R2; orphaned media has no sweeper. `Number.isInteger` at the route.
- **F-72** Unbounded singleton lists: `dispatch-index-do.ts:129` loads and sorts every lifetime order per page; `storefront-do.ts:346-364` (`GET /storefronts` on key C) fans out one hop per shop — > 49 shops = 500 for the founder; `reseller-accounts-do.ts:484` lists every account. Fine at pilot scale; named so they are not discovered from a 500.
- **F-73** CORS verified by reading: buyer/checkout/liste doors pinned to `https://beurni2.github.io`; ops doors to the console origin; reseller doors `*` — safe while no cookie exists (the file's own tripwire); preflights advertise only the methods each door uses.

**Reseller app (B)**
- **F-74** Secrets: the bundle carries only the base URL, the gate literal and an unset profile — no key (pinned by `rendu-session-ecrit` and the `src/` sweep). The device holds bearer, compte and digits in plaintext under `Paths.document` (app-private on a non-rooted phone); a lost phone is a live session with full shop/profile authority (email/phone change needs only the bearer) until the founder pauses the account — mitigated by F-07.
- **F-75** `gateArme()` fails open on a mistyped flag (`gate.ts:78-80`) — documented; the session-only Worker 401s everything, so a disarmed live build shows empty screens and leaks nothing.
- **F-76** No https enforcement on `EXPO_PUBLIC_STOREFRONT_BASE` (`service.ts:610`, `compte-service.ts:114`) — a plain-http base would send the password in clear. One guard.
- **F-77** `app.json`: `backgroundColor #FFFDF7` ≠ `sharedColour.paper #F4EFE6` (cold-start flash); no `expo-image-picker` plugin (permission text only bites a standalone build); no `updates` block (CI writes it ephemerally). Permissions: microphone declared + used, photos used undeclared, camera/location neither.
- **F-78** The vérifié mark is an icon with no paired word or label (`App.tsx:1561-1563, 2101-2103, 2430`) — charter §5 « icons always paired with text ».
- **F-79** `ce.f_sous_titre` « …jamais un portefeuille » (a banned word in negation) and `ce.hub_sous_titre` « Le Cercle d'Aïcha » (a demo identity) on the SP9-gated surface reachable from Profil.
- **F-80** `App.tsx:2657` « Frais Ma Boutique » — the retired-name comment (AUDIT-SHOP-1 NOTE), unchanged.
- **F-81** 11 TTFs committed, 4 loaded (≈ 188 KB) behind a 1.5 s ceiling; cold start (< 5 s) is measured nowhere — binds review only, as PERF-BUDGETS §Enforcement allows.

**Buyer PWA (C)**
- **F-82** Attribution: there is no signed token and no typed-code surface in the PWA (`vitrine-link.ts:85-88`: `/s/{slug}` = slug only; `main.ts:803` `attributionResellerId` is server-resolved from the slug; the service refuses a forged id with `attribution_mismatch`); the `attribution-tamper` gate tests the attribution service's HMAC, not a PWA path; `recordVitrineArrival` writes `shop-plus.arrivals.v1` that nothing reads. A tampered URL lands on another real shop or not-found — it cannot misattribute. SP-I09/SP-I09b are not met by construction *yet*; no Building-Plan slice names « code saisi ». Name it in the plan; delete the dead arrival write.
- **F-83** `highlight()` can split an escaped entity (`boutiques-view.ts:31-39`) — cosmetic, not XSS; moot once the demo directory goes.
- **F-84** `public/font-check.html` (a font diagnostic page) ships in every deploy.
- **F-85** `role="button"` spans (hearts, panier, WhatsApp chips, C1 photo) react to click only — `tabindex="0"` without a keydown handler; touch-first market, low impact.
- **F-86** Service-worker update = `skipWaiting` + `clients.claim`; an already-open page can 404 its old lazy chunk after a deploy — `entetes/registry.ts:129-139` catches and draws classique; a reload heals it. No stale money is possible: the worker never touches the service origin, and every service read is `Cache-Control: no-store` (`storefront-service/src/index.ts:75`).
- **F-87** Design-system-as-code vs 29 bespoke header sheets (~150 lines of hardcoded hex/px each, founder-ordered pixel fidelity, journalled); `test/ui-scan.test.ts` enforces tokens only on top-level `src/*.ts`. Recorded, not re-litigated.
- **F-88** The 101-quartier list (2.3 KB gz) and the demo voice tone (`voice-asset.ts`, 3.7 KB gz base64 WAV, harness-only) ride the entry bundle.
- **F-89** `sp-commande:v1` (orderId + buyerRef bearer) lives in `localStorage` until « Terminer » (`quote-port.ts:1227-1271`); reasonable at pilot scale; consider an `at`-based expiry.
- **F-90** Counts vs the brief: `src/` is 24.3 k hand-written lines by the area auditor's cut (30.5 k by `wc -l` incl. generated sheets); Playwright runs 134 cases across 19 specs from 122 `test()` sites (some loop over states) — the journal's 134 is right.

**Platform (D)**
- **F-91** The « atomic reservation » reserves the quote for one holder, not stock (`reservation.ts:3-6`): two buyers with two quotes on one listing never contend; oversell protection rests on Boutik+'s inventory truth and Shop+'s auto-hide. Consistent with §5.2; SP3.2's wording reads as stock to a newcomer.
- **F-92** `verifyAttributionToken` accepts an empty key (`attribution.ts:78-85`; `createHmac('sha256', '')` is valid); the header's « UNSET ⇒ every token refuses » depends on the future SP5 caller. Add an explicit `key === ''` refusal when that wiring lands.
- **F-93** `supply-consumer`'s phone-shape sweep (`consumer.ts:47` `/(?:\d[\s.\-]?){8,}/`) refuses digit-heavy product names (« Réf 2024-0001-77 ») as identity leaks — honest but silent loss. Bound it to Burkina shapes.
- **F-94** `expired()` compares ISO strings lexicographically (`reservation.ts:97-99`; MEASURED: an offset-bearing timestamp inside the TTL → `reservation_expired`). Unreachable in production (`checkout-do.ts:269` passes `toISOString()`).
- **F-95** `discovery-service` is a health stub; `projectStoreDiscovery` has no Worker call site; the buyer directory consumes `store-projection` client-side over demo data. SP-I05 holds by shape; the « discovery-service envelope » the SP#001-B journal describes is served by no deployable.
- **F-96** `paid` has no stuck watch (`order-spine.ts:260` watches `payment_pending` only); `refunded` is unreachable by design (E3). No generic « failed » terminal exists (`order-machine.test.ts:86-88`) — Law 3 holds.

---

## 3. AUDIT-SHOP-1 (2026-09-02) — closure status

| # | AUDIT-SHOP-1 item | Status at `f5d4cc0` | Evidence |
|---|---|---|---|
| M1 | Every write on the shared bundled write key; cross-tenant writes | **CLOSED** | RESELLER-PILOTE-1 · RESELLER-AUTH-1 · ACCES-ARME-2; MEASURED: bogus and absent bearers answer one identical 401; the retired key opens nothing; the founder seated on the live Worker (JOURNAL 2026-09-08) |
| M2 | `/checkout/dispatch` and `/gains` fan out per lifetime order (console 500 at ≈49 orders) | **CLOSED** | DISPATCH-PAGES-1 (`PAGE_DISPATCH = 40`, refused by name above); residue F-28 (`/reseller/suivi` feed reads) |
| M3 | Buyer PWA ships no service worker; cold-open offline = browser error | **PARTLY CLOSED** | COQUILLE-HORS-LIGNE-1: root and `/v/` cold-open offline (pinned); **`/s/` is blank (F-02)**; not installable (F-20); worker over-fetches (F-23) |
| M4 | `PROGRESS_WRITE_SECRET` unlocks both Boutik+ and Séra facts | **CLOSED** | SECTEURS-PROGRES-1 (writer-classified gates, `auth.ts:176-187`); F-68 asks for the presence flag |
| M5 | `buyerRef` unrecoverable once the create answer is lost and the quote expires | **CLOSED** | COMMANDE-REJOUER-1 (replay road on the receipt's own bytes; pinned) |
| M6 | Webhook auth is a shared bearer, no HMAC/timestamp | **OPEN** | F-12 — Real-Money-Gate item, aggregator ⏳ |
| m | Parallel-load test board flake | **OPEN** | Reproduced today (5 packages red under load, all green isolated) |
| m | Malformed-but-authenticated webhook → unnamed 500 | **CLOSED** | GARDE-PAIEMENT-1 (named 422 `malformed_payload`); residue F-34 (string `fee` → 0) |
| m | Bare `decodeURIComponent` → 500 on public reads and `POST /storefronts` | **PARTLY CLOSED** | Session by-id roads guarded (`decodeSur`); **public `/s/` and `/media/` still 500 (F-03)**; credentialed roads (F-26) |
| m | Liste share tokens logged on 404 | **OPEN** | F-27, re-measured |
| m | Wishlist edit key compared with `!==` | **OPEN → NOTE** | F-67 (hash vs hash) |
| m | Reseller sessions never expire, no logout, no login rate limit | **OPEN → MAJOR** | F-07, measured across a password change |
| m | Anonymous ~1 MiB audio into Boutik+'s bucket, no rate limit | **OPEN → MAJOR, worse than stated** | F-04 — fires BEFORE the hold check; 5 MB relayed for zero orders |
| m | No mock-absence gate on the service bundle | **OPEN** | None of the 25 gates scans the Worker bundle for mock adapters (`no-demo-adapter-in-bundle` covers the Expo export only) |
| m | ui-tokens pin disagrees three ways | **OPEN** | F-37 |
| m | `pnpm audit` 16 high / 8 moderate (build-time) | **IMPROVED, OPEN** | 8 high / 8 moderate today, all build/test tooling; still no CI scan (F-35) |
| m | `ci.yml` + `expo-preview.yml` without `permissions:`; actions by tag | **OPEN** | F-09 |
| n | Reservation release is TTL, not « the rule » | **PROMOTED → MAJOR** | F-08 — no call site for release, alert, stuck-saga or DLQ |
| n | Attribution lock cannot collide by construction | holds | A sound §7.5 |
| n | Plaintext remise code in DO + outbox row | **OPEN — accepted** | F-66 |
| n | `/health` secret-presence oracle | acceptable | F-68 |
| n | `SERA_INTAKE_BASE` as a deploy `--var` | unchanged | `storefront-deploy.yml` |
| n | Reseller « bloqué chez le partenaire » copy | unchanged | — |
| n | One comment quotes the retired name | **OPEN** | F-80 |
| n | Identity is a device file | **CHANGED** | digits rewritten from the account id at signup/login/admission; residue F-47, F-74 |
| n | 2026-07-24 key incident | closed by rotation, then retirement | ACCES-ARME-2 |

Of the previous audit's 26 items: **9 closed, 3 partly closed, 11 open (3 of them promoted), 3 recorded as accepted or unchanged.**

---

## 4. Compliance matrices

### 4.1 The Ten Laws (charter §3)
| Law | Verdict | Where it holds · where it bends |
|---|---|---|
| 1 · Money reconciles, reseller sees net | **HOLDS at the source** | Quotes exist only through `issueQuote` (`checkout-core.ts:339-360`), B/C/M verbatim off the frozen listing, markup cap at signing, gains rows re-run `assertQuoteReconciles`; 26 928-case property probe 0 drift; net-first pinned on every reseller surface. **Bends:** F-10 (second money implementation, rounds), F-16 (unsigned price after relaunch), F-33 (gate's coherent lie), F-54 (C6 prints the quote, not the order). |
| 2 · No app holds funds; webhooks the only truth | **HOLDS** | `create()` never passes `payment_pending`; webhooks franc-exact against the frozen quote; no wallet vocabulary (gate). **Bends:** F-12 (bearer, not signature — RMG); F-04 (Shop+ makes Boutik+ *store* on an anonymous word — abuse, not funds). |
| 3 · Custody is sacred | **HOLDS** | Drop code has one door (buyer token ∧ arrival ∧ door leg settled); never on the poll view, reseller wire or outbox read; evidence never auto-releases; no generic « failed ». **Bends:** F-11(c) (gate blind to French synonyms); F-66 (plaintext remise, accepted). |
| 4 · Zero seller deposit | **HOLDS** | `no-seller-deposit` / `no-seller-debit` gates green; no reserve field anywhere. |
| 5 · Deterministic only | **HOLDS** | `no-ml-libs` green; discovery order ICU-free; voice = recorded audio (`voice-capture.ts`). |
| 6 · French Voice on every string | **MOSTLY** | Catalogs 0 violations (buyer 314 · reseller 609 · kit 22); no retired name in `src/` (one comment, F-80). **Bends:** F-17 (raw wire token in a toast), F-59 (buyer inline copy unlinted; two tables outside the gate), F-43 (diag strings, sandbox banner), F-50/F-51/F-60 (stale or wrong sentences). |
| 7 · Offline-first, low-end Android first | **WEAK** | Never a final act offline (both apps, verified). **Bends:** F-02 (blank `/s/`), F-15 (no timeout), F-17/F-62 (nothing queues in either app), F-18 (re-asks on every tab), F-20 (not installable), F-22/F-23 (bytes), F-25 (legibility). |
| 8 · Build gates gate | **HOLDS** | Cercle UI-only override journalled with the real-money leg still gated; no PackLab/Diaspora code; F-79 is copy on the gated surface. |
| 9 · Single-level everything | **HOLDS** | `single-level` gate green; Cercle strings single-level. |
| 10 · Naming locked | **HOLDS** | `shop-plus` identifiers throughout; one retired-name comment (F-80). |

### 4.2 Shop+ invariants (Build Spec §3)
| Invariant | Verdict | Evidence |
|---|---|---|
| SP-I01 exactly one locked `reseller_id` | HOLDS | first-lock-wins durable across a restart (`order-do.ts:1577-1603`; `attribution-lock.e2e`, gate) |
| SP-I02 listing references active versions; markup versioned, future-only | HOLDS (read) | publish = version N+1 signed from the live base (`publish-price.ts`); ownership on rewrite (RESELLER-AUTH-1) |
| SP-I03 reseller as the relationship; no supplier identity/contact/commission | HOLDS by allowlist | `checkout-core.ts:489-500`, `order-core.ts:753-787`, `customer-projection.ts:173-211`; **gate blind to French keys (F-11)** |
| SP-I04 earnings = projections only | HOLDS | copies at `order-do.ts:979-994, 1405`; `settlement-copies` gate; **F-10 risk at any non-zero rate; F-16 app-side** |
| SP-I05 discovery returns stores, not a pool | HOLDS by shape | strict zod envelope; **no real producer (F-95); root is demo (F-19); gate blind to a `catalogue` pool (F-11)** |
| SP-I06 single-level | HOLDS | gate + strings |
| SP-I07 contact tools consent-scoped; other resellers' orders invisible | HOLDS (in scope) | buyer contact exits only via key C; the WhatsApp chip opens `https://wa.me/` only; feeds scoped per account |
| SP-I08 canonical assets not replaceable | HOLDS (read) | reseller uploads cover/avatar/voice only; product `assetRefs` come from supply |
| SP-I09 / SP-I09b signed link + typed-code precedence | **NOT BUILT (by posture)** | slug-only link, server-resolved owner, cannot misattribute; no typed-code surface; F-82 |
| SP-I10 problem path as prominent as confirmation | HOLDS | « Un problème » beside « Tout est bon » at equal weight (`screens.ts:2230-2233`); `problem-path-never-releases` gate |
| SP-I11 deterministic | HOLDS | as Law 5 |
| SP-I12 canonical waterfall; commission never in buyer price; net before promoting | HOLDS | `net-first-display` + unit pins; `checkout-core` |
| SP-I13 paid-now vs due; funded legs; no duplicate charge | HOLDS | §6.1 lines byte-pinned; `funded-legs` gate + runtime; one provider key per (order, leg) |
| SP-I14–18 Cercle | gated | not built; economics strings single-level |
| SP-I19 Media Kit | HOLDS for the kit's shape | price is HER signed figure passed in; `CardCopy` carries no gross/commission/supplier; validity windows / expiry-on-markup-change not assessed (SP4 depth) |

### 4.3 §11 CI gates — is each one real?
| §11 gate | Enforced by | Verdict |
|---|---|---|
| money model reconciles | `money-reconciliation` (fixtures) + runtime `assertQuoteReconciles` on every gains read | real at runtime; **gate accepts a coherent lie (F-33)** |
| reseller sees net, gross-first prohibited | `net-first-display` + unit pins on every surface | real |
| commission never in buyer price | `checkout-core` + split arm of the money gate | real |
| no wallet/balance module | `no-wallet-no-funds` (roster-pinned vocabulary) | real (vocabulary) |
| no learned ranking / generative | `no-ml-libs` | real (names + imports) |
| discovery returns stores | `discovery-returns-stores` | **fooled by a `catalogue` pool (F-11)** |
| every order has a locked `reseller_id` | `attribution-lock-first-wins` + Miniflare e2e | real |
| no supplier identity/contact/commission on customer surfaces | `no-supplier-contact` | **fooled by French keys (F-11)**; the projections themselves are allowlists |
| attribution tamper fails closed | `attribution-tamper` (service HMAC) | real for the service; **no PWA token exists (F-82)** |
| `reseller_id` immutable after confirmation | e2e (lock first-wins; payee bound to the listing) | real |
| no duplicate charge | e2e (`order-do.e2e:689`; `order-core.test:701`) | real |
| no confirmed order without funded legs | `funded-legs` gate ×7 fixtures + runtime `order-spine.ts:442-464` | real |
| reseller cannot enter drop code | no reseller surface exists; one door (A §7.7) | real by construction |
| `buyerDropCode` never exposed to seller | `no-drop-code-exposure` | **fooled by French synonyms (F-11)**; wires verified clean |
| problem path equally prominent | `problem-path-never-releases` + screen pins | real |
| single-level | `single-level` | real (vocabulary) |
| voice = audio | code review (`voice-capture.ts`) | real |
| French Voice copy-lint | `copy-lint` on catalogs + `copy-lint-inline-refus` | real for catalogs; **inline buyer copy outside six tables unlinted (F-59)** |
| offline = pending | — | **not enforced anywhere; nothing queues (F-17, F-62)** — only « never final offline » holds |
| *(WO-2.3)* reservation released on payment failure | `reservation-release-on-failure` | **fixture-only; no call site (F-08)** |

### 4.4 PERF-BUDGETS v1.1 (founder-signed)
| Budget | Value | Measured / assessed | Status |
|---|---|---|---|
| Cold start → first useful screen | < 5 s | est. 2.5–3.5 s on 3G (131 KB html+js, 2 RTT, 750 ms skeleton floor); not device-measured; reseller app unmeasured | not measured |
| Touch → feedback / result | < 100 / < 250 ms | PWA re-renders ≤ 3 KB screens; **reseller app: unbounded (F-15)** | not measured / FAIL |
| Initial PWA payload | < 320 KB | **308 279 B first load · 312 526 B worst case** (gate) — 95.4 % consumed; 24.8 KB avoidable (F-21) | PASS (thin) |
| Buyer-page JS | ≤ 150 KB | **130 149 B** gzip | PASS |
| Product card incl. thumbnail | ≤ 25 KB | tile ≈ 1 KB + a 1280 px derivative (150–350 KB typ.) | **FAIL (est., F-22)** |
| Images thumb / hero / full | ≤ 15 / 80 / 150 KB | same derivative everywhere; `?v=thumb` unused | **FAIL (est., F-22)** |
| Offline queue durability | survives kill + reboot | **no queue exists in either app** (F-17, F-62) | N/A |
| Checkout server p95 | ≤ 800 ms | unbounded by construction (F-29); unmeasured | not measured |
| Attribution validation | ≤ 150 ms | unmeasured | not measured |
| Memory on reference device | ≤ 250 MB | unmeasured | not measured |

### 4.5 Execution Contract milestones
| Milestone | Exit criteria (binary) | Standing |
|---|---|---|
| **E0** | CI gates on every PR · contracts pinned · flags/kill-switch · correlation ids · migration + mock-certification standards · **dependency + secret scanning** · device budgets named | Met except **dependency scanning (F-35)**; secret scanning exists; flags-client + `CHECKOUT_KILL` present |
| **E1** | the 15-step chain on sandbox with one correlation chain · mocks certified | Met per journal (`e1-happy-path.mjs`); payment mock certified 8/8, supply mock certified |
| **E2** | each §6 scenario → recovery state + reconciliation alert · runbooks · **DLQ + stuck-saga live** | **Claimed in the journal (WO-2.3); two binaries have no call site (F-08)** |
| **E3** | webhook signatures validated · duplicates idempotent · payout reconciled | Not started: signatures = bearer (F-12); duplicates idempotent (holds); payout not built |
| **E4–E6** | pilot ops, RMG, city readiness | not in scope |

---

## 5. Supply chain and CI/CD

| Workflow | Trigger | `permissions:` | Pinning | Secrets reachable | Notes |
|---|---|---|---|---|---|
| `ci.yml` | push main · pull_request · dispatch | **none** | `@v4` tags | read token → `~/.gitconfig` (unscrubbed) | secrets empty on forks; full gate board runs on fork code with no deploy secret; `--frozen-lockfile` ✓ |
| `expo-preview.yml` | push main · dispatch | **none** | `@v4`; `eas-cli@20.5.1` exact | `EXPO_TOKEN`, base, read token — **job-level env during install** | no key ships in the bundle (ACCES-ARME-2) ✓ |
| `payment-webhook-secret.yml` | dispatch | contents: read | `wrangler@4` floating | `CLOUDFLARE_API_TOKEN`, `PAYMENT_WEBHOOK_SECRET` (step, piped) | no install ✓ |
| `pwa-preview.yml` | push main · dispatch | read · pages · id-token | tags | read token | build = the payload gate ✓ |
| `sandbox-payment.yml` | dispatch | contents: read | `@v4` | `PAYMENT_WEBHOOK_SECRET` (step) | dependency-free ✓ |
| `service-canon-drift.yml` | push main · cron · dispatch | contents: read | `@v4` | read token | compares installed canon to live `/health` (contracts version only) |
| `storefront-deploy.yml` | dispatch | contents: read | **`wrangler@4` floating ×4** | `CLOUDFLARE_API_TOKEN` (step), `SERA_INTAKE_SECRET`, `SHOP_ARM_SECRET` (piped) | build + esbuild before deploy, no attestation; secrets piped never argued ✓; retired secret deleted idempotently ✓ |

Facts: Node `22` (major-floating), pnpm `10.33.0` via `packageManager` ✓ · lockfile v9, every `@platform/*` → codeload tarball by sha (22 refs, 3 shas), 651 integrity entries, no git/ssh/file forms ✓ · `onlyBuiltDependencies` limits lifecycle scripts to `@platform/*` + `workerd` ✓ · no `pull_request_target` ✓ · no `pnpm audit`, no dependabot, no SAST (F-35) · `pnpm audit`: 8 high / 8 moderate, none a runtime dependency of any deployable · canon pins: apps at `a418ca4` for ui-tokens/i18n (3.12.0-era) while contracts sit at 3.13.1 (F-37) · `wrangler.toml` bindings match every `env.*` the code reads.

---

## 6. Proof quality — tests, walks, gates

- **Gate matrix (24 gates + the shared scanner, every row MEASURED: positives exit 0, negatives exit 1).** Real-code gates: `attribution-lock-first-wins`, `door-signal-requires-provider`, `no-demo-adapter-in-bundle`, `pwa-payload-budget`, `no-confirmed-order-without-funded-legs` (sp33a driver), the vocabulary tripwires over the tree. Fixture-only gates: `money-reconciliation`, `settlement-copies-never-recomputes` (plus its source arm), `reservation-release-on-failure` (F-08), `discovery-returns-stores`, `no-supplier-contact`, `no-drop-code-exposure` (F-11). Documented blind spots per gate are recorded in area D's ledger; the ones that matter are F-08, F-11, F-33, F-38.
- **Reseller app walks.** Every screen has a driven walk **except**: the Privée/Publique toggle (F-13), `PhotoGallery` (source scans only), `gains` (mounted only; the ladder/retry/refusal never driven), `ventes`, `vente_detail` (unreachable), Coupe's retry failure road, K5's arrows/star, and the SP9-gated Cercle screens. Harness discipline verified: only native boundaries aliased; no walk asserts appearance (its stated bound); every double states its bound.
- **Buyer PWA.** 1136 unit tests; **134/134 Playwright cases (0 flaky)** across 19 specs (122 `test()` sites, some looping over states) in a real chromium against the real http-port build and the Pages emulator; `checkout-real.spec` (48 cases) drives the real `httpQuotePort` (payment_pending never confirms; `paid` without `confirmed` is not a confirmation; retry mints a new command id; door leg `due` withholds the code). **Gap:** no e2e drives `/s/` with the network down (F-02). Escaping proven by execution across all 29 headers and every C-screen (scratch suite 9/9, hostile payloads in every field).
- **Service.** 40 suites; the money/webhook/custody laws are pinned by e2e on the real bundle (cited per law in §7). **Unpinned:** slug uniqueness (F-01), public decode 500s (F-03), the `/s/` subrequest ceiling (F-05), « no upload before the hold » (F-04), session lifetime/revocation (F-07), the `create()` concurrency window (F-64).
- **Money property probe (D):** 26 928 waterfall cases (markups 0..25 % B, B 100..1 000 000, D 0..10 000, C 0..B, both modes): 0 identity drift, 0 unsafe integers, 0 checker throws.

---

## 7. Sound, verified — the load-bearing things that hold

1. **Money reconciles at the source (Law 1, §5.4).** `src/checkout-core.ts:339-360, 325-337, 213-215`; `publish-price.ts:85-101`; `order-do.ts:1002-1015`. Pins: `checkout-core.test.ts:312` (byte-stable), `publish-price.test.ts:200-297`, `combined-worker.e2e:1076,1091`, gate.
2. **Provider webhooks are the only payment truth (Law 2, SP-I13).** `order-do.ts:1638-1703`; `order-spine.ts:382-395, 532`; fail-closed constant-time gate. Pins: `order-do.e2e:921, 941, 973, 1039, 1453, 1476`.
3. **No duplicate charge on retry.** One provider key per (order, leg) read back before the charge; the webhook must name it. Pins: `order-do.e2e:689, 2259, 2290`; `order-core.test:701`.
4. **The reservation receipt is bound to its holder once an order exists** (`order-do.ts:645-674, 1524-1531`). Pins: `garde-paiement.e2e`, `rejouer-commande.e2e`.
5. **Attribution (SP-I01/09b):** payee bound to the listing never the caller; durable lock first-wins before any charge; `/locks/*` has no public route. Pins: `checkout-do.e2e:512, 997, 1308`; `attribution-lock.e2e`; gate.
6. **Buyer surfaces are allowlists (SP-I03);** the reseller projection carries only her net. Pins: `checkout-do.e2e:729`, `order-do.e2e:1102`, `order-core.test:294`, `dispatch.e2e:469`.
7. **The drop code has one door (Law 3):** buyer token (constant-time, decoy compare) ∧ Séra's arrival fact ∧ door leg settled; never on the poll view, the reseller wire or the outbox read. Pins: `vrai-suivi.e2e:471`, `porte-custody.e2e:773`, gate.
8. **Session gate + ownership, one identical 401 before any dispatch (ACCES-ARME-2);** key C limited to the directory read, unpublish, delete; a wrong key C is nobody. Pins: `combined-worker.e2e`, `proprietaire.e2e`; MEASURED here.
9. **Key-C and progress gates fail closed, constant-time, writer-classified** (`auth.ts:146-152, 176-187`). Pins: `dispatch.e2e`, `accounts.e2e`, `secteurs-progres.e2e`.
10. **Ops and reseller fan-outs paged and honest** (`PAGE_DISPATCH = 40`, feed cap with `incomplet`). Pins: `dispatch-pages.e2e`.
11. **Earnings are copies (SP-I04)** (`order-do.ts:979-994, 1405`). Pins: `accounts.e2e:339` (« to the franc »), gate.
12. **Outboxes atomic with the confirm, alarm re-armed, backoff capped at 1 h, non-terminal 409 by contract.** Pins: `order-do.e2e:1780, 1793, 2172`; `porte-custody.e2e:573`.
13. **Buyer contact exits only through key C;** malformed contact refused before any object is touched. Pins: `dispatch.e2e:206, 315`.
14. **Progress/transit facts first-wins; an unknown order is never a write.** Pins: `dispatch.e2e:1173, 1205`; `vrai-suivi.e2e:437`.
15. **§6.4 ladder order-keyed, idempotent; the caller can never name the buyer.** Pins: `dispatch.e2e:1321-1383`.
16. **Wishlist:** 192-bit tokens, hashed edit key, `offert` only from the OrderDO wire, gift orders full-prepay, zone coherence. Pins: `wishlist.e2e:649, 782`.
17. **The buyer PWA:** escaping total (execution-proven); money render-only and reconciling (`quote-model.ts:90-183` refuses any disagreement; 15 `amounts_disagree` pins; cross-repo byte pin of the quote body); « Payé » only from the literal `confirmed`; polling bounded and pocket-aware; idempotency keys CSPRNG-only and reload-stable; GPS pin and audio bytes never touch storage; no `console.*` in `src/`; the service worker never touches money (service reads `no-store`); §6.2 inspection matrix with the buyer-risk column before the choice; SP-I10 honoured.
18. **The reseller app:** net-first in render order on tile, fiche, card, ventes row, gains hero (pinned); SP-I04 feed refuses non-integer nets and can represent no gross/commission; the 25 % cap is ONE rule shared with the service (`@shop-plus/reseller-money`), the app sends `markup` only; money render with U+202F, no ICU; bearer-only wire, password never stored; idempotent ids by construction; read-back before success on media; hook order survives the door opening mid-session; stale-answer guards on the feed and the storefront adoption; « Shop+ ne garde pas votre argent » ends every ladder.
19. **Platform:** waterfall integer-only, floors with an overflow guard, delivery outside fee bases (26 928 cases); issue-time enforcement + canonical bytes + immutable store; ledger copies only, append-only, one leg per type; spine dedupes on `command_id`, refuses out-of-order, franc-exact per mode, malformed → 422; state machine canon, `refund_required_e3`, no generic « failed »; reservation idempotent per `command_id`, two concurrent confirms → one wins on real workerd; refusal ladder never counts `conformity_mismatch`/`honest_absence`; supply consumer exact 15-minute freshness and identity sweep; payment mock certified 8/8 incl. the door leg; reseller-kit price is her figure, `CardCopy` has no supplier field; drift-check OK; `--frozen-lockfile` on every installing workflow; secrets piped never argued.

---

## 8. Books integrity

- **Open ⏳ Decisions applied with a flag (correct):** `PREPAY_ONLY_WINDOW_DAYS = 30` and the rung-1 no-op; `paymentProcessingFeeEstimate: 0`, `taxFields: {}`, `policyVersions: 'e1-sandbox'`; quote TTL 15 min; reservation TTL 2 min; supply freshness 15 min; Option-B sentinels (§6.1 amended); FRAIS-ZERO rates 0; markup cap 25 %.
- **Claims contradicted by code or canon:** JOURNAL WO-2.3's « release is the rule / alert is the net / stuck-saga / DLQ » (F-08) · `pnpm-workspace.yaml` override comments vs installed pins (F-37) · Spec §12 « ✅ 20 % real from launch », §5.4 baseline nets and SP3's « ≤ ~15–20 % » vs the shipped 0 % / 25 % (F-39 — §7 stop for the canon edits) · `service-canon-drift.yml` « private » vs the public repo (F-36).
- **Not touched, verified:** no `contracts/` shape redefined in this repo; Cercle/PackLab/Diaspora gated; ADR-002 supersedes ADR-001 explicitly; no founder PII anywhere in the tree (ids only); no secret value in any tracked file (gate + sweep).

---

## 9. Recommended order of work (for the founder's word — nothing here is started)

**Tier 0 — before a second reseller is seated or the next link is shared**
1. **SLUG-UNIQUE-1** (F-01): claim-or-tell slug pointer + `slug_taken` refusal + the two-reseller e2e; derive the digits from the account book. **S–M.**
2. **LIEN-HORS-LIGNE-1** (F-02, F-52): the `/s/` road catches `VitrineOffline` → the offline card; 5xx → « Réessayer »; the walk written red first on the http-port build. **S.**

**Tier 1 — abuse and availability edges on the Worker (one slice each, small)**
3. **PUBLIC-DECODE-1** (F-03, F-26): `decodeSur` on the two public and three credentialed roads. **S.**
4. **NOTE-VOCALE-APRES-GARDE-1** (F-04, F-06): upload after the hold check on both roads; `413` body caps at the root; edge rate-limit rules on the two anonymous POST doors. **M.**
5. **VITRINE-LECTURE-1** (F-05, F-29): one collection read + one batched listing read, `incomplet` declared, `AbortSignal.timeout` on buyer-path reads. **M.**
6. **SESSION-VIE-1** (F-07, F-32): session lifetime + logout + revoke-others on password change + login counter on the Worker; the designed « session finie » state and « Me déconnecter » in the app. **M.**

**Tier 2 — the reseller app tells the truth (the screens he holds every day)**
7. **VITRINE-VISIBLE-1** (F-13): the toggle reads and writes `discoverable`. **S.**
8. **ADMISSION-ORDRE-1** (F-14): monotonic refresh guard. **S.**
9. **PORTS-DELAI-1** (F-15, F-18): `AbortController` on the nine fetches; `finally` resets; no re-ask per tab. **S.**
10. **PRIX-SIGNE-1** (F-16): the signed listing seeds the card and the share preview. **M.**
11. **RAISON-NOMMEE-1** (F-17a, F-41, F-46, F-50, F-51): never print `raison`; named refusals; masked Profil passwords; the stale sentences. **S.** (The durable intent queue, F-17b, is its own **L** slice, after the buyer queue decision.)

**Tier 3 — buyer PWA honesty and budgets**
12. **RACINE-HONNETE-1** (F-19, F-63): honest root card; base-aware hrefs. **S.**
13. **INSTALLABLE-1** (F-20): icons, `theme-color`, `apple-touch-icon`, manifest test. **S.**
14. **BUNDLE-SANS-ZOD-1** (F-21, F-88): type-only import, inline slug rule, `ZodError` bundle assertion. **S.**
15. **VIGNETTES-1** (F-22): `?v=thumb` on tiles and rows, `width`/`height`. **S.**
16. **SW-PRECACHE-1** (F-23): entry graph only; hashed fonts. **S/M.**
17. **TUILES-PRIVEES-1** (F-24): a Worker tile proxy, or the truthful consent line — **his choice of approach**. **M.**
18. **CONFIANCE-LISIBLE-1** (F-25, F-56, F-57): trust row ≥ 11/10 px at ≥ 4.5:1 with a token-fidelity test; the sub-44 px targets; labels on C3. **M.**

**Tier 4 — platform truth and supply chain**
19. **RESERVATION-REGLE-1** (F-08, F-96): wire release/alert/stuck-saga/DLQ and replace the fixture gate with a seam test — or downgrade the E2 claim; **§7: his call which.** **M.**
20. **CHAINE-DEPLOI-1** (F-09, F-35, F-36, F-38): `wrangler` as a pinned devDependency via `pnpm exec`; SHA-pinned actions; `permissions:` everywhere; step-scoped `EXPO_TOKEN`; a `pnpm audit --prod` gate; the ssh forms in `lockfile-url-form`. **S.**
21. **ARRONDI-REVENDEUSE-1** (F-10): floor with the canon pair + the property test against `computeWaterfall`. **S.**
22. **PORTES-FRANCAISES-1** (F-11, F-33, F-34): French key families and value scans in the three gates; strict discovery parse; the per-field arm in the money gate; string `fee` → `malformed_payload`. **S.**
23. **LIVRES-1** (F-37, F-39): a slice ledger (plan id → status → evidence); the override comments; two canon notes handed to platform-contracts as §7 flags (§5.4/§12 vs FRAIS-ZERO; SP3 vs 25 %). **S.**

**Standing (Real-Money Gate):** F-12 signed webhooks with the aggregator ⏳; F-66 remise custody minting (a contracts change) if ever wanted.

---

## 10. Coverage statement

**Read in full (by the four auditors, cited lines re-opened by the supervisor):** every file under `services/storefront-service/{worker,src}`; `apps/reseller-app/App.tsx` (4 193 lines) and `src/{access,sales,identity,vitrine,customize,ui}` core modules, both catalogs, the harness and every double; `apps/buyer-pwa/src/{main,vitrine-link,format,i18n,vitrine-view,boutiques-view,boutiques-data,demo-stores,cadeau,geo-carte}.ts`, `cliente/*`, `vitrine/{render,flows,profile,liste,catalog,panier,favorites,voice-*,video-scroll,entries,themes,entetes/registry,entetes/pagne}.ts`, `sw.template.js`, `vite.config.ts`, `index.html`, `public/*`; `packages/commerce-core` src + 12 tests; `reseller-money`, `supply-consumer`, `store-projection`, `observability`, `flags-client` src + tests; `services/attribution-service` src + worker + tests; `discovery-service`; `apps/reseller-kit` money/format/composeur + tests; all 25 gates + `run-gates.sh` + `baseline-check.mjs`; all 7 workflows; `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `wrangler.toml`; Build Spec, Building Plan, Execution Contract (§1, §3, §8, §10.5), PERF-BUDGETS; `JOURNAL.md` (head, 305 headers, targeted greps); `WORK-ORDERS/`, `adr/`.
**Skimmed or grepped:** the 28 remaining header sheets (font-size/colour scan; their renderers executed by the XSS suite), `k-styles.ts`, `cercle/*`, `photo-gallery.tsx`, the non-walk unit-test bodies, `pnpm-lock.yaml` (overrides, resolutions, advisory parents), the remaining gate fixtures, `scripts/e1-*.mjs`/`e2-*.mjs`/`sp33a-*.mjs`, `scripts/compat/*`.
**Not read:** `apps/buyer-pwa/src/qr/encoder.ts`; `apps/reseller-app/src/ui/{icons,signature,motion,faso-fonts,cadre}`, `customize/{framing,framing-math,screens-apercu,catalog}`, `qr/*`, `service.demo.ts`; `reseller-kit/src/{paint,rendu}`; the contracts package beyond the cited schema and money lines.
**Run this session:** typecheck 19/19 · gates ALL GREEN · turbo test (parallel) exit 1 → isolated re-runs green (§1.2) · commerce-core 161/161 · buyer-pwa 1136/1136 + Playwright 134/134 · reseller-app 716/716 + 9 scratch walks · storefront-service 689/689 (+ 104 targeted e2e by the area auditor) · 60 individual gate invocations (positives + negatives) + 5 fooling probes (two re-measured by the supervisor) · `pnpm audit` · drift-check · three Miniflare probes on the real bundle (24 + 12 + 8 requests) · the stub build + sourcemap attribution · the offline Playwright probe on the real http-port build (run twice: by the area auditor and by the supervisor; 2 passed, 1 failed — the failure is F-02) · the 26 928-case money property probe. **No repository file was modified by the audit;** `git status --porcelain` was empty before this document was written.

*Related:* AUDIT-SHOP-1 (JOURNAL 2026-09-02) · the a-series that closed it (RESELLER-PILOTE-1, RESELLER-AUTH-1, ACCES-ARME-2) · this audit's journal entry (JOURNAL 2026-09-08 · AUDIT-SHOP-2) · the readable copy of this ledger: https://claude.ai/code/artifact/0bb8017c-520f-4b11-a840-cef3c3d571e7
