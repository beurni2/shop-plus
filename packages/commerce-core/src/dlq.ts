import { PlatformEventSchema, type PlatformEvent } from '@platform/contracts';

/**
 * DLQ SEED (Contract E2 exit: "DLQ + stuck-saga detection live"). A poison
 * event — schema-invalid, or a replay-storm survivor the consumer refuses —
 * PARKS: the ORIGINAL BYTES are preserved EXACTLY as received (the string
 * is stored untouched; its sha256 rides on the park event so an operator
 * can prove integrity later), a dlq.parked.v1 is emitted, and NOTHING is
 * dropped silently. Detection/preservation only — replay tooling is E3+.
 *
 * RESERVATION-REGLE-1 (AUDIT-SHOP-2 F-08) — RUNTIME-NEUTRAL, SO THE WORKER
 * CAN CARRY IT. This module used to import `node:crypto` for the digest,
 * which is why the Worker bundle excluded it and the deployed consumer
 * parked nothing (the audit's measurement). The digest is now the CALLER'S:
 * Node tests hand in `createHash`'s hex, the Worker hands in Web Crypto's —
 * the vault classifies and composes, and never touches a runtime API. The
 * constructor takes the entries already parked, so a durable object can
 * rehydrate the queue from its storage and the park ids keep counting.
 */

export interface ParkedEntry {
  parkId: string;
  /** the poison payload EXACTLY as received — byte-exact, never normalized. */
  original: string;
  originalSha256: string;
  reason: string;
  parkedAt: string;
}

export interface ParkArgs {
  reason: string;
  correlationId: string;
  at: string;
  /** sha256 of `raw`, hex, computed by the caller on its own runtime. */
  sha256Hex: string;
}

export class DeadLetterQueue {
  private readonly entries: ParkedEntry[];

  constructor(seed: readonly ParkedEntry[] = []) {
    this.entries = [...seed];
  }

  /**
   * Park raw bytes. `raw` is the string exactly as it arrived — callers must
   * NOT parse-and-restringify before parking (that would launder the bytes).
   */
  park(raw: string, args: ParkArgs): {
    entry: ParkedEntry;
    event: PlatformEvent;
  } {
    const entry: ParkedEntry = {
      parkId: `dlq-${this.entries.length + 1}`,
      original: raw,
      originalSha256: args.sha256Hex,
      reason: args.reason,
      parkedAt: args.at,
    };
    this.entries.push(entry);
    const event = PlatformEventSchema.parse({
      name: 'dlq.parked.v1',
      envelope: {
        command_id: `park-${entry.parkId}`,
        correlation_id: args.correlationId,
        aggregateVersion: this.entries.length,
        actor: 'commerce-core:ops',
        serverTime: args.at,
        version: '1',
      },
      payload: {
        park_id: entry.parkId,
        reason: entry.reason,
        original_sha256: entry.originalSha256,
        original_bytes: raw.length,
      },
    });
    return { entry, event };
  }

  /** Try to consume as a canon event; poison parks instead of vanishing. */
  parkIfPoison(raw: string, args: Omit<ParkArgs, 'reason'>): {
    poison: boolean;
    entry?: ParkedEntry;
    event?: PlatformEvent;
  } {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      const parked = this.park(raw, { reason: 'not_json', ...args });
      return { poison: true, ...parked };
    }
    if (!PlatformEventSchema.safeParse(parsedJson).success) {
      const parked = this.park(raw, { reason: 'not_a_canonical_platform_event', ...args });
      return { poison: true, ...parked };
    }
    return { poison: false };
  }

  parked(): readonly ParkedEntry[] {
    return this.entries;
  }
}
