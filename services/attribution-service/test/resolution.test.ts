import { describe, expect, it } from 'vitest';
import type { AttributionArrival } from '@platform/contracts';
import { resolveCheckoutAttribution } from '../src/resolution.js';

/**
 * WO-7.1 — SP-I09b précédence, wired end-to-end (ADVERSARIAL, tests-first).
 * The seam CONSUMES canon `resolveAttribution` (the resolver is not re-implemented
 * here); these tests pin the WIRING: explicit-code beats arrival, most-recent
 * unexpired arrival, locked immutability, and — the money-critical one — a
 * PRESENTED reference that resolves to nobody attributes NOBODY, NEVER the
 * platform, and raises the reconciliation alert. Fails closed, every branch.
 */

const NOW = '2026-07-13T00:00:00.000Z';
// server-side shortCode → resellerId registry (identity scope). Unknown codes resolve to nothing.
const REGISTRY: Record<string, string> = { 'AICHA-4821': 'res_aicha' };
const resolveShortCode = (code: string): string | undefined => REGISTRY[code];

const identityArrival = (resellerId: string, arrivedAt: string): AttributionArrival => ({
  resellerId,
  scope: 'identity',
  arrivedAt,
  correlationId: `corr-${resellerId}`,
});

describe('SP-I09b.1 — a locked order is IMMUTABLE (first-lock-wins)', () => {
  it('the locked reseller stands; a second reference (typed code + arrival) does NOT re-attribute', () => {
    const out = resolveCheckoutAttribution({
      lockedResellerId: 'res_locked',
      typedShortCode: 'AICHA-4821',
      arrivals: [identityArrival('res_awa', '2026-07-12T00:00:00.000Z')],
      nowIso: NOW,
      resolveShortCode,
    });
    expect(out.resolution).toEqual({ attributed: true, resellerId: 'res_locked', source: 'locked' });
    expect(out.alert).toBeUndefined();
  });
});

describe('SP-I09b.2 — an explicit code at payment BEATS any arrival', () => {
  it('the tolerant-typed code wins over a fresh arrival (l’acte délibéré de l’acheteuse)', () => {
    const out = resolveCheckoutAttribution({
      typedShortCode: 'aicha 4821', // tolerant input → AICHA-4821 → res_aicha
      arrivals: [identityArrival('res_awa', '2026-07-12T00:00:00.000Z')],
      nowIso: NOW,
      resolveShortCode,
    });
    expect(out.resolution).toEqual({ attributed: true, resellerId: 'res_aicha', source: 'explicit_code' });
    expect(out.alert).toBeUndefined();
  });
});

describe('SP-I09b.3 — else the most recent UNEXPIRED arrival wins (last-touch, 30d TTL)', () => {
  it('the recent arrival wins; the >30d one is expired out', () => {
    const out = resolveCheckoutAttribution({
      arrivals: [
        identityArrival('res_expired', '2026-05-01T00:00:00.000Z'), // > 30d before NOW
        identityArrival('res_recent', '2026-07-10T00:00:00.000Z'), // within 30d
      ],
      nowIso: NOW,
      resolveShortCode,
    });
    expect(out.resolution).toEqual({ attributed: true, resellerId: 'res_recent', source: 'arrival' });
    expect(out.alert).toBeUndefined();
  });
});

describe('SP-I09b.4 — a PRESENTED reference that resolves to nobody attributes NOBODY, never the platform, and raises the alert', () => {
  it('an unresolvable typed code (garbage) → nobody + alert; never platform/supplier', () => {
    const out = resolveCheckoutAttribution({
      typedShortCode: 'not a code',
      arrivals: [],
      nowIso: NOW,
      correlationId: 'corr-garbage',
      resolveShortCode,
    });
    expect(out.resolution).toEqual({ attributed: false, reason: 'none' });
    expect(out.alert).toBeDefined();
    expect(JSON.stringify(out)).not.toMatch(/platform|supplier/i);
  });

  it('a well-formed but UNKNOWN code (not in the registry) → nobody + alert; never fabricated', () => {
    const out = resolveCheckoutAttribution({
      typedShortCode: 'BOGUS-9999',
      arrivals: [],
      nowIso: NOW,
      correlationId: 'corr-unknown-code',
      resolveShortCode,
    });
    expect(out.resolution.attributed).toBe(false);
    expect(out.alert).toBeDefined();
  });

  it('all arrivals expired → nobody + alert (a reference was presented, it just aged out)', () => {
    const out = resolveCheckoutAttribution({
      arrivals: [identityArrival('res_expired', '2026-05-01T00:00:00.000Z')],
      nowIso: NOW,
      correlationId: 'corr-expired',
      resolveShortCode,
    });
    expect(out.resolution).toEqual({ attributed: false, reason: 'none' });
    expect(out.alert).toBeDefined();
  });

  it('a signed token that was presented and REFUSED (tamper fails closed) → nobody + alert; never platform', () => {
    const out = resolveCheckoutAttribution({
      presentedTokenFailed: true,
      arrivals: [],
      nowIso: NOW,
      correlationId: 'corr-token-refused',
      resolveShortCode,
    });
    expect(out.resolution).toEqual({ attributed: false, reason: 'none' });
    expect(out.alert).toBeDefined();
    expect(JSON.stringify(out)).not.toMatch(/platform/i);
  });

  it('NOTHING presented (organic arrival, no code, no arrivals, no token) → nobody, NO alert', () => {
    const out = resolveCheckoutAttribution({ arrivals: [], nowIso: NOW, correlationId: 'corr-organic', resolveShortCode });
    expect(out.resolution).toEqual({ attributed: false, reason: 'none' });
    expect(out.alert).toBeUndefined();
  });

  it('DURCISSEMENT-SERVICE-2 (F-40) — two contested checkouts raise two alerts under two command ids, keyed by THEIR correlation ids', () => {
    // Before: `correlationId` was optional and fell back to the literal
    // `checkout`, so two unresolved checkouts without one shared
    // `attr-unresolved-checkout` — a sink deduping on the command id kept the
    // first and dropped the second. The id is required now, and the alert's
    // command id is the checkout's own.
    const a = resolveCheckoutAttribution({ typedShortCode: 'BOGUS-9999', arrivals: [], nowIso: NOW, correlationId: 'corr-a', resolveShortCode });
    const b = resolveCheckoutAttribution({ typedShortCode: 'BOGUS-9999', arrivals: [], nowIso: NOW, correlationId: 'corr-b', resolveShortCode });
    expect(a.alert?.envelope.command_id).toBe('attr-unresolved-corr-a');
    expect(b.alert?.envelope.command_id).toBe('attr-unresolved-corr-b');
    expect(a.alert?.envelope.correlation_id).toBe('corr-a');
    expect(b.alert?.envelope.correlation_id).toBe('corr-b');
    expect(a.alert?.envelope.command_id).not.toBe(b.alert?.envelope.command_id);
    // …and the same checkout, re-resolved, raises the SAME command id: the
    // alert is idempotent per checkout, never per call.
    const a2 = resolveCheckoutAttribution({ typedShortCode: 'BOGUS-9999', arrivals: [], nowIso: NOW, correlationId: 'corr-a', resolveShortCode });
    expect(a2.alert?.envelope.command_id).toBe('attr-unresolved-corr-a');
  });

  it('the alert is the canonical reconciliation.alert.v1 (ops sees an unresolved presented reference)', () => {
    const out = resolveCheckoutAttribution({
      typedShortCode: 'BOGUS-9999',
      arrivals: [],
      nowIso: NOW,
      correlationId: 'corr-xyz',
      resolveShortCode,
    });
    expect(out.alert?.name).toBe('reconciliation.alert.v1');
    expect(out.alert?.envelope.correlation_id).toBe('corr-xyz');
    // no reseller id is ever fabricated onto the nobody outcome
    expect(JSON.stringify(out.resolution)).not.toMatch(/res_/);
  });
});
