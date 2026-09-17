/**
 * RF-1b — HER CLIENT TO HER OWN FEED (`GET /reseller/ventes` on Shop+).
 *
 * THE CREDENTIAL IS NOT IN THE BUNDLE, and that is the whole point. The one
 * outbound key this app ever shipped (the shared storefront write key) rode
 * inside the published EAS update — shared, readable, and unable to tell one
 * reseller from another; the repo's standing note called it « a scanner-
 * stopper, not a lock ». This seam was the first piece of real identity: the
 * code is TYPED BY HER, held on her device, sent as a Bearer, and never
 * compiled into anything. ACCES-ARME-2 finished the road — the write key is
 * retired and her session is the only credential the app holds. Only the BASE
 * URL comes from the environment.
 *
 * WHAT COMES BACK is the server's allowlist projection and nothing more — her
 * net (copied off the frozen Quote, never recomputed here), the order's own
 * state, and the delivery zone. No base price, no commission, no gross, no
 * buyer contact. This module RE-VALIDATES every row at the boundary and drops
 * a malformed one WHOLE rather than rendering half a sale.
 *
 * RN-safe (Metro law): zero `@platform/*` runtime imports — the row shape is
 * mirrored locally and the service is the authority that produced it.
 */
import { baseSure } from '../vitrine/fetch-borne';

/** A read that hangs forever is a screen that lies « chargement » forever
 *  (the law learned the hard way on the founder's console). */
export const FEED_TIMEOUT_MS = 12_000;

/** The three PAYMENT states Shop+ proves on its own. Preparation news arrives
 *  separately, on the return wire built in READINESS-RETURN-1c — see
 *  `acceptedAt` / `readyAt` below, which is why this list does not name it.
 *  « en route » and « livrée » remain Séra's and remain absent. */
export type FeedState = 'payment_pending' | 'confirmed' | 'payment_failed';

/**
 * RELATED-PARTY-1 — §6.5 on one of her sales, exactly as `/entry/reseller/{id}`
 * builds it and ONLY when a non-clear decision stands: the outcome, the signals
 * it rests on (the basis she can contest), whether she contested, and the
 * founder's ruling once there is one. Absent on an ordinary sale.
 */
export interface LienProche {
  readonly outcome: 'auto_void' | 'held_for_review';
  readonly signals: readonly string[];
  readonly contestee: boolean;
  readonly resolution?: 'clear' | 'violation';
}

/** One row exactly as `/entry/reseller/{id}` builds it, field for field. */
export interface FeedVente {
  readonly orderId: string;
  readonly state: FeedState;
  readonly createdAt: string;
  /** HER NET — the only franc figure on this wire. */
  readonly resellerNet: number;
  readonly productVersionId: string;
  readonly zoneTo: string;
  /**
   * READINESS-RETURN-1c — Boutik+'s preparation news, present ONLY once the
   * supplier actually acted. OPTIONAL on purpose: absent means « not yet »,
   * never « no », and a default would turn a missing step into a claimed one.
   */
  readonly acceptedAt?: string;
  readonly readyAt?: string;
  readonly lienProche?: LienProche;
}

export type FeedResult =
  | {
      readonly ok: true;
      readonly ventes: readonly FeedVente[];
      /** TRUE when the server could not read every row it holds for her (a
       *  failed order read, or more sales than one answer fans out to). Her
       *  screen must SAY SO — a short list served as a complete one is the
       *  same lie as a fake count. */
      readonly incomplet: boolean;
    }
  | { readonly ok: false; readonly reason: 'unauthorized' | 'unreachable' | 'malformed' };

export interface ResellerFeedPort {
  /** `code` is her personal `SP-…` code. It is a PARAMETER, never a field of
   *  this object, so it cannot be captured at construction and logged. */
  mesVentes(code: string): Promise<FeedResult>;
  /** RELATED-PARTY-1 — her one sentence on one held sale, riding the same code. */
  contester(code: string, orderId: string, texte: string): Promise<ContestResult>;
}

const STATES: readonly string[] = ['payment_pending', 'confirmed', 'payment_failed'];

/** STRICT boundary reader: every field checked, a bad row dropped WHOLE.
 *  A row that is missing its net, or carries a net that is not a franc
 *  integer, is not rendered as a sale with a blank amount — it is not
 *  rendered at all. */
export function readFeedVente(raw: unknown): FeedVente | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const { orderId, state, createdAt, resellerNet, productVersionId, zoneTo } = r;
  if (typeof orderId !== 'string' || orderId === '') return null;
  if (typeof state !== 'string' || !STATES.includes(state)) return null;
  if (typeof createdAt !== 'string' || createdAt === '') return null;
  if (typeof resellerNet !== 'number' || !Number.isInteger(resellerNet) || resellerNet < 0) return null;
  if (typeof productVersionId !== 'string') return null;
  if (typeof zoneTo !== 'string') return null;
  const { acceptedAt, readyAt } = r;
  // Each instant is carried only when it is a non-empty string. A malformed
  // one is DROPPED rather than failing the whole row: a real confirmed sale
  // must not vanish from her feed because a preparation clock was garbled.
  return {
    orderId,
    state: state as FeedState,
    createdAt,
    resellerNet,
    productVersionId,
    zoneTo,
    ...(typeof acceptedAt === 'string' && acceptedAt !== '' ? { acceptedAt } : {}),
    ...(typeof readyAt === 'string' && readyAt !== '' ? { readyAt } : {}),
    ...(() => {
      const lien = readLienProche(r['lienProche']);
      return lien !== undefined ? { lienProche: lien } : {};
    })(),
  };
}

/** RELATED-PARTY-1 — the field in the shape the order builds, or nothing (a malformed one is not a row we drop, only a field we ignore). */
function readLienProche(raw: unknown): LienProche | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const { outcome, signals, contestee, resolution } = r;
  if (outcome !== 'auto_void' && outcome !== 'held_for_review') return undefined;
  if (!Array.isArray(signals) || !signals.every((s) => typeof s === 'string')) return undefined;
  if (typeof contestee !== 'boolean') return undefined;
  if (resolution !== undefined && resolution !== 'clear' && resolution !== 'violation') return undefined;
  return { outcome, signals: signals as string[], contestee, ...(resolution !== undefined ? { resolution } : {}) };
}

export type ContestResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'unauthorized' | 'refused' | 'unreachable' };

export class HttpResellerFeed implements ResellerFeedPort {
  constructor(private readonly base: string) {}

  async mesVentes(code: string): Promise<FeedResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.base.replace(/\/$/, '')}/reseller/ventes`, {
        headers: { Authorization: `Bearer ${code}` },
        signal: controller.signal,
      });
      // ONE refusal, whatever the server's reason — the door never tells a
      // guesser whether a code exists.
      if (res.status === 401) return { ok: false, reason: 'unauthorized' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      const body = (await res.json()) as unknown;
      if (typeof body !== 'object' || body === null) return { ok: false, reason: 'malformed' };
      const rows = (body as Record<string, unknown>)['ventes'];
      if (!Array.isArray(rows)) return { ok: false, reason: 'malformed' };
      const ventes: FeedVente[] = [];
      let dropped = 0;
      for (const row of rows) {
        const parsed = readFeedVente(row);
        if (parsed === null) dropped += 1;
        else ventes.push(parsed);
      }
      // Incomplete if the SERVER said so, or if this reader itself had to drop
      // a row — either way she is not looking at all of her sales.
      const declared = (body as Record<string, unknown>)['incomplet'] === true;
      return { ok: true, ventes, incomplet: declared || dropped > 0 };
    } catch {
      // an abort and a dead network are the same thing to her: not reached
      return { ok: false, reason: 'unreachable' };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * RELATED-PARTY-1 — `POST /reseller/ventes/{orderId}/contester { texte }`,
   * riding her session. 401 → unauthorized; a named refusal (the order's own:
   * nothing to contest, already contested, already resolved, not hers, a bad
   * sentence) → refused; anything else → unreachable. The text is the
   * screen's to bound; the service bounds it again.
   */
  async contester(code: string, orderId: string, texte: string): Promise<ContestResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.base.replace(/\/$/, '')}/reseller/ventes/${encodeURIComponent(orderId)}/contester`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${code}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ texte }),
        signal: controller.signal,
      });
      if (res.status === 401) return { ok: false, reason: 'unauthorized' };
      if (res.status === 400 || res.status === 404 || res.status === 409) return { ok: false, reason: 'refused' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      return { ok: true };
    } catch {
      return { ok: false, reason: 'unreachable' };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** NULL when the base is unset — never a demo adapter that cannot fail
 *  (RESELLER-SEAM-HONESTY-1: an unset env must not look like a working feed).
 *  Note there is NO key here: her code is typed, never bundled. */
export function resolveResellerFeed(): ResellerFeedPort | null {
  const base = baseSure(process.env.EXPO_PUBLIC_STOREFRONT_BASE);
  if (base !== null) return new HttpResellerFeed(base);
  return null;
}
