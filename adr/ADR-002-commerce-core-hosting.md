# ADR-002 — commerce-core is HOSTED BY shop-plus (founder ruling E1-D1)

**Status:** Accepted · **Date:** 2026-07-09 · **Slice:** WO-1.1 · **Supersedes:** ADR-001's hosting deferral

## Context
Execution Contract §2.2: *"User / Order / immutable Quote / EscrowTxn /
SettlementObligation / order state machine — definition lives in `contracts`,
hosted by commerce-core"*, with *"no second definition may exist."* ADR-001
implemented `@shop-plus/commerce-core` as a fixtures-only scaffold and
deferred the hosting assignment to an E1 wiring decision.

## Decision
Founder ruling **E1-D1 (2026-07-09): shop-plus hosts Checkout&Order and
Ledger&Settlement.** `@shop-plus/commerce-core` inside this deployable is the
one authoritative commerce-core: immutable Quote issuance, the atomic
reservation Durable Object, the thin E1 order state machine, and
EscrowTxn / SettlementObligation ledger RECORDS.

- **Boutik+** reads settlement projections; it never writes order or
  settlement truth.
- **Séra** emits settlement-eligibility signals (`delivery.validated.v1`);
  it never computes proceeds (its ADR-001 read-side scope is unchanged).
- **One authority.** No second implementation of any of these domains may
  exist in any repo, ever. All shapes remain the pinned canon from
  `@platform/contracts`; this package implements behavior, it defines no
  shape.

## Consequences
- ADR-001's "no order state machine / no reservation / no settlement logic
  here" prohibition is lifted **for this package only**, by this work order.
  Its other prohibitions stand: no shape redefinition, no local waterfall
  math, no funds-holding.
- Séra/Boutik+ integration happens over versioned events and read
  projections at E1 assembly — never by importing this package.
