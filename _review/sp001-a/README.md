# SP#001-A — THE STOREFRONT AGGREGATE · review packet

**Slice:** SP#001-A (spine slice A of *SP#001 — The Seller #001 Spine*).
**Branch:** `e7/wo-sp001-a` · **code head:** `0dad8bf` · **base (main):** `cc848be`.
**Priority:** 🟠 aggregate on a 🔴 spine — canon/contracts path → **mandatory fresh-context verifier** (§6bis).
**Status:** DO NOT MERGE — founder review gate.

---

## 1. CANON-CHECK — PASS (the gate that was a STOP, now open)

SP#001-A was **STOP-AND-FLAGGED** on first canon-check: `StorefrontSchema` at the prior pin (v0.9.7) lacked the aggregate fields (`name`, `zone`, `category`, `createdAt`, `updatedAt`). Per §7 the app may never define a contract shape — the STOP held until canon shipped them.

Canon **WO-5.13** shipped those fields. Workspace re-pinned to **canon v0.9.9** (release merge `1c98ad1`), content-verified cold. `StorefrontSchema` at v0.9.9, read verbatim from the installed pin (`dist/shapes/commerce.js`):

```
z.object({
  id: IdSchema,
  resellerId: IdSchema,
  slug: z.string().min(1),
  discoverable: z.boolean(),
  curatedItems: z.array(IdSchema),
  name: z.string().min(1).max(120),   // WO-5.13 additive; .max(120) a boundary guard, not a canon value
  zone: z.string().min(1),            // display string — no zone enum (open founder decision)
  category: z.string().min(1),        // display string — no category floor (open founder decision)
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
}).strict()
```

All ten fields present. The aggregate **consumes this shape verbatim** (`StorefrontSchema.parse(...)`); it redefines nothing. → canon-check **PASS**, DERIVE.

## 2. THE LAWS THIS SLICE ANSWERS TO

- **§7 / Law 2 — contracts are canon, never app-side.** The aggregate imports `StorefrontSchema`, `ResellerShortCodeSchema`, `shortCodeToSlug`, `PlatformEventSchema` from `@platform/contracts` and parses through them. No hand-rolled storefront shape. No invented event.
- **Canon event names.** Canon carries only `storefront.created.v1` and `storefront.published.v1` (read verbatim from the installed dist — there is **no** `storefront.unpublished.v1`). The discoverability toggle in **both directions** rides `storefront.published.v1` carrying `discoverable: boolean`. This is **consuming an existing canon name**, not inventing a schema. Canon defines no per-event payload (envelope + name only, `PlatformEventSchema`); the payload is built at this service boundary — permitted, exactly as the attribution lock does. **Surfaced, not silently interpreted.**
- **`updatedAt` is the directory's ordering truth (SP#001-B).** It moves ONLY on a real transition: `create` sets it; a no-op publish/unpublish must not move it. Enforced and asserted.
- **Single writer per storefront.** One `Entry` per id; all transitions go through the registry; idempotent on the create `command_id`; a different `command_id` on an existing id is a surfaced collision with **no mutation**. Ready to host inside a per-storefront Durable Object (the same separable substrate the lock got in LOCK-DURABILITY) — named, not built here (proportionality).

## 3. WHAT WAS BUILT (scope)

- `services/storefront-service/src/storefront-aggregate.ts` (new) — `StorefrontRegistry` (create / publish / unpublish / get), canon events, shortcode→slug derivation, decision unions.
- `services/storefront-service/test/storefront-aggregate.test.ts` (new) — 7 tests, the four RED-first fixtures + SELLER #001 through the real command path.
- `services/storefront-service/src/index.ts` — one line: `export * from './storefront-aggregate.js';`
- re-pin: package.jsons + `pnpm-workspace.yaml` overrides + lockfile + `run-gates.sh` drift-check `--pinned-version 0.9.9`.

**OUT of scope (built in later spine slices):** the live projection / directory wiring (B), the durable `StorefrontDO` host (separable substrate), the real order (D).

## 4. THE FOUR RED-FIRST FIXTURES (each asserts its invariant)

| Fixture | Asserts |
|---|---|
| CREATE-IDEMPOTENT-ON-COMMAND_ID | replay of the same create → `idempotent`, same identity, `updatedAt` frozen at T0 |
| COLLISION-REFUSED-SURFACED | different `command_id` on an existing id → `collision`, existing returned, `name` never overwritten |
| SHORTCODE-SHAPE-ENFORCED | invalid short code (`seller-1`, `X`) throws `StorefrontShortCodeError`; no malformed storefront written |
| PUBLISH-TOGGLE-EMITS-ONCE | publish fires `storefront.published.v1` once; repeat publish → `unchanged`, **no second event**, `updatedAt` frozen; unpublish is the reverse; absent → `absent` |

## 5. FORBIDDEN — held

- checkout / Quote / journey / earnings: **byte-frozen** (`git diff --name-only cc848be..0dad8bf` touches nothing matching them — verified).
- No ranking, no ML, no server inference, no generative anything.
- No celebration wired here — `première_vente` belongs to the first REAL franc (spine slice D), NOT the first mock create.
- No invented contract shape or event name/schema.

## 6. EVIDENCE (grounded in this session's tool results)

- **Warm — aggregate:** `storefront-aggregate.test.ts` **7/7**, storefront-service **12/12** (`warm-gates.log` upstream + targeted run).
- **Warm — full gate suite:** `run-gates.sh` → **ALL GATES GREEN, rc=0**; drift-check green at **0.9.9**; Playwright **43 passed**. → `warm-gates.log`.
- **Cold proof — committed bytes at `0dad8bf`** (isolation-evidence law; `cold-proof.log`, script `cold-proof.sh`):
  - fresh clone `cold HEAD: 0dad8bf` (== code head) · fresh HOME (credential-only baseline, proxy prefix) · isolated store + cache (0 entries)
  - `ssh-form git@: 0` · `proxy-leak: 0`
  - `pnpm install --frozen-lockfile` → **rc=0**
  - content pin cold: `ui-tokens: 0.9.9` (canon re-pin verified cold)
  - `run-gates.sh` → **ALL GATES GREEN, RUN-GATES rc=0**
- **Diff:** `aggregate.diff` (the code surface, 335 lines) · `full-delta.stat` (re-pin + aggregate).

## 7. FRESH-CONTEXT VERIFIER VERDICT

See `VERIFIER-VERDICT-verbatim.md` — copied verbatim, never rewritten.
