import { createHash } from 'node:crypto';
import { PlatformEventSchema, type PlatformEvent } from '@platform/contracts';

/**
 * DLQ SEED (Contract E2 exit: "DLQ + stuck-saga detection live"). A poison
 * event — schema-invalid, or a replay-storm survivor the consumer refuses —
 * PARKS: the ORIGINAL BYTES are preserved EXACTLY as received (the string
 * is stored untouched; its sha256 rides on the park event so an operator
 * can prove integrity later), a dlq.parked.v1 is emitted, and NOTHING is
 * dropped silently. Detection/preservation only — replay tooling is E3+.
 */

export interface ParkedEntry {
  parkId: string;
  /** the poison payload EXACTLY as received — byte-exact, never normalized. */
  original: string;
  originalSha256: string;
  reason: string;
  parkedAt: string;
}

export class DeadLetterQueue {
  private readonly entries: ParkedEntry[] = [];

  /**
   * Park raw bytes. `raw` is the string exactly as it arrived — callers must
   * NOT parse-and-restringify before parking (that would launder the bytes).
   */
  park(raw: string, args: { reason: string; correlationId: string; at: string }): {
    entry: ParkedEntry;
    event: PlatformEvent;
  } {
    const originalSha256 = createHash('sha256').update(raw, 'utf8').digest('hex');
    const entry: ParkedEntry = {
      parkId: `dlq-${this.entries.length + 1}`,
      original: raw,
      originalSha256,
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
  parkIfPoison(raw: string, args: { correlationId: string; at: string }): {
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
