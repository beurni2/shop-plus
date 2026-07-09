# ADR-001 — Local `commerce-core` is a scaffold; the immutable Quote and atomic reservation are NOT implemented here

**Status:** Accepted · **Date:** 2026-07-09 · **Slice:** WO-SP0.1

## Context
The Shop+ Building Plan (SP0.1) calls for a local `commerce-core` package
alongside the pinned `platform-contracts` consumption. The Execution Contract
§2.2 fixes single-owner hosting for the money/order domains: *"User / Order /
immutable Quote / EscrowTxn / SettlementObligation / order state machine —
definition lives in `contracts`, hosted by commerce-core"* — one accountable
definition, hosted by one app, and *"no second definition may exist."* The
same table assigns the atomic reservation to the same single-owner core.
Which deployable hosts the authoritative Checkout&Order / Ledger&Settlement
services — and therefore the immutable Quote issuance and the reservation
Durable Object — is an E1-wiring decision, not an SP0.1 decision.

## Decision
At this slice, `@shop-plus/commerce-core` is a **scaffold that implements
against the pinned canonical shapes** from `@platform/contracts`:

- typed fixture builders that call the pinned `computeWaterfall` /
  `assertQuoteReconciles` (they feed the money-reconciliation CI gate);
- nothing else.

It contains **no authoritative immutable-Quote implementation, no atomic
reservation, no order state machine, no Ledger/Settlement logic, and no
redefinition of any canonical shape** — not in this slice, and never
unilaterally in this repo. A "temporary" local Quote type is FORBIDDEN by
the work order and rejected in review.

## Consequences
- Shop+ money surfaces (net-first previews, checkout views) are fed by the
  pinned waterfall, so they can never drift from the canonical money model.
- When E1 wiring assigns authoritative hosting, that assignment arrives as
  its own work order with its own spec authority; until then any PR adding
  Quote issuance, reservation logic, or settlement math to this package must
  be rejected in review.
