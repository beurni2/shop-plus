import { DeadLetterQueue, type ParkedEntry } from '@shop-plus/commerce-core';
import type { PlatformEvent } from '@platform/contracts';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DeadLetterDO — THE PARKED-POISON BOOK (RESERVATION-REGLE-1, AUDIT-SHOP-2 F-08).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Contract E2 exit: « DLQ + stuck-saga detection live ». The vault's DLQ seed
 * (`DeadLetterQueue`, WO-2.3) parks a poison event with its ORIGINAL BYTES
 * preserved exactly and a `dlq.parked.v1`, so nothing the consumer refused
 * vanishes. Until this object, no deployed door called it: a webhook the
 * money route refused as poison was answered by name and its bytes were gone.
 *
 * ONE SINGLETON (`idFromName(DLQ_NAME)`) is the whole book: the webhook door
 * at the composition root hands it what it refused as POISON — a body that is
 * not JSON, not a canon PlatformEvent, names no routable order, or that the
 * order object refused as `malformed_payload` / `envelope_field_too_long` /
 * `not_a_platform_event`. VALID events the vault refuses by STATE
 * (`out_of_order`, `amount_mismatch`, `attempt_mismatch`…) are not poison and
 * are not parked; RAPPROCHEMENT-1's alerts own that class.
 *
 * WHAT IT HOLDS AND HOW MUCH: each parked entry under its own key (a Durable
 * Object value is capped at 128 KiB, so one body per key, never a list of
 * bodies), the index of ids beside them, the park events, and an honest
 * count of what the cap clipped — silence and saturation must stay
 * distinguishable (the recon sink's own law). A body past PARK_MAX_BYTES is
 * NOT kept byte-exact — the seed's law cannot be met inside one storage value
 * — so its digest, length and reason are recorded instead, under `oversize`,
 * and the answer says `kept: false`. The webhook door's own cap is 2 MiB (so
 * the vault's bounded-envelope refusal stays reachable); a real aggregator's
 * webhook is a few kilobytes, so an oversize body is an attack, not an event.
 *
 * INTERNAL WIRE ONLY: the ONE public reader is the founder's key-C road
 * `GET /checkout/dlq` at the composition root. Nothing here is money — bytes
 * the consumer REFUSED, by definition never applied to any order.
 */

export const DLQ_NAME = 'dlq';
/** One storage value holds one body; 96 KiB leaves headroom under the 128 KiB value cap. */
export const PARK_MAX_BYTES = 96 * 1024;
const INDEX_KEY = 'parked-index';
const EVENTS_KEY = 'park-events';
const ENTRY_PREFIX = 'park:';
const PARKED_CAP = 50;

interface ParkedIndex {
  readonly ids: string[];
  readonly dropped: number;
  readonly oversize: { sha256Hex: string; bytes: number; reason: string; at: string }[];
}

export interface ParkRequest {
  /** the body EXACTLY as the door received it (absent when oversize) */
  readonly raw?: string;
  /** the refusal's name when the door already classified it; absent ⇒ the vault classifies (not_json / not_a_canonical_platform_event) */
  readonly reason?: string;
  readonly correlationId: string;
  /** hex sha256 of the bytes, computed by the door on Web Crypto */
  readonly sha256Hex: string;
  readonly oversize?: { readonly bytes: number };
}

export class DeadLetterDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'POST' && pathname === '/entry/park') {
      let args: ParkRequest;
      try {
        args = (await request.json()) as ParkRequest;
      } catch {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      if (
        typeof args.correlationId !== 'string' || args.correlationId === '' ||
        typeof args.sha256Hex !== 'string' || !/^[0-9a-f]{64}$/.test(args.sha256Hex) ||
        (args.reason !== undefined && (typeof args.reason !== 'string' || args.reason === ''))
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const at = new Date().toISOString();
      const index = (await this.state.storage.get<ParkedIndex>(INDEX_KEY)) ?? { ids: [], dropped: 0, oversize: [] };

      if (args.oversize !== undefined) {
        if (!Number.isSafeInteger(args.oversize.bytes) || args.oversize.bytes <= PARK_MAX_BYTES) {
          return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
        }
        // Not kept byte-exact (one storage value cannot hold it): digest,
        // length and reason are the record, and the answer says so.
        const oversize = [...index.oversize, { sha256Hex: args.sha256Hex, bytes: args.oversize.bytes, reason: args.reason ?? 'unclassified', at }].slice(-PARKED_CAP);
        await this.state.storage.put(INDEX_KEY, { ...index, oversize });
        return Response.json({ ok: true, kept: false, bytes: args.oversize.bytes });
      }

      if (typeof args.raw !== 'string' || args.raw.length > PARK_MAX_BYTES) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      // Rehydrate the vault's queue from what is already parked, so park ids
      // and the event's aggregateVersion keep counting across requests.
      const seed: ParkedEntry[] = [];
      for (const id of index.ids) {
        const entry = await this.state.storage.get<ParkedEntry>(`${ENTRY_PREFIX}${id}`);
        if (entry !== undefined) seed.push(entry);
      }
      const queue = new DeadLetterQueue(seed);
      let parked: { entry: ParkedEntry; event: PlatformEvent };
      if (args.reason !== undefined) {
        parked = queue.park(args.raw, { reason: args.reason, correlationId: args.correlationId, at, sha256Hex: args.sha256Hex });
      } else {
        const verdict = queue.parkIfPoison(args.raw, { correlationId: args.correlationId, at, sha256Hex: args.sha256Hex });
        if (!verdict.poison || verdict.entry === undefined || verdict.event === undefined) {
          // The door called poison on a canon-valid event: nothing to park.
          return Response.json({ ok: true, poison: false });
        }
        parked = { entry: verdict.entry, event: verdict.event };
      }
      if (index.ids.length >= PARKED_CAP) {
        // The cap clips, and says so — never a silent drop.
        await this.state.storage.put(INDEX_KEY, { ...index, dropped: index.dropped + 1 });
        return Response.json({ ok: true, kept: false, dropped: index.dropped + 1 });
      }
      const events = ((await this.state.storage.get<PlatformEvent[]>(EVENTS_KEY)) ?? []).concat(parked.event).slice(-PARKED_CAP);
      await this.state.storage.put({
        [`${ENTRY_PREFIX}${parked.entry.parkId}`]: parked.entry,
        [INDEX_KEY]: { ...index, ids: [...index.ids, parked.entry.parkId] },
        [EVENTS_KEY]: events,
      });
      return Response.json({ ok: true, kept: true, parkId: parked.entry.parkId, event: parked.event });
    }

    /** The operator's read: every parked body, byte-exact, with its digest. INTERNAL WIRE ONLY. */
    if (request.method === 'GET' && pathname === '/entry/parked') {
      const index = (await this.state.storage.get<ParkedIndex>(INDEX_KEY)) ?? { ids: [], dropped: 0, oversize: [] };
      const entries: (ParkedEntry & { bytes: number })[] = [];
      for (const id of index.ids) {
        const entry = await this.state.storage.get<ParkedEntry>(`${ENTRY_PREFIX}${id}`);
        if (entry !== undefined) entries.push({ ...entry, bytes: entry.original.length });
      }
      const events = (await this.state.storage.get<PlatformEvent[]>(EVENTS_KEY)) ?? [];
      return Response.json({ ok: true, entries, events, dropped: index.dropped, oversize: index.oversize });
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}
