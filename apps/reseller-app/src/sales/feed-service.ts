/**
 * RF-1b — HER CLIENT TO HER OWN FEED (`GET /reseller/ventes` on Shop+).
 *
 * THE CREDENTIAL IS NOT IN THE BUNDLE, and that is the whole point. Every
 * outbound key this app has shipped so far (`EXPO_PUBLIC_STOREFRONT_WRITE_KEY`)
 * rides inside the published EAS update — shared, readable, and unable to tell
 * one reseller from another; the repo's standing note calls it « a scanner-
 * stopper, not a lock », with a HARD GATE on onboarding any reseller but the
 * founder until real per-reseller identity lands. This seam is the first piece
 * of that identity: the code is TYPED BY HER, held on her device, sent as a
 * Bearer, and never compiled into anything. Only the BASE URL comes from the
 * environment.
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

/** A read that hangs forever is a screen that lies « chargement » forever
 *  (the law learned the hard way on the founder's console). */
export const FEED_TIMEOUT_MS = 12_000;

/** The three states Shop+ can actually PROVE about an order. There is no
 *  « en préparation », « en route » or « livrée » here because no wire carries
 *  those facts back to Shop+ yet — see `feed-model.ts`. */
export type FeedState = 'payment_pending' | 'confirmed' | 'payment_failed';

/** One row exactly as `/entry/reseller/{id}` builds it, field for field. */
export interface FeedVente {
  readonly orderId: string;
  readonly state: FeedState;
  readonly createdAt: string;
  /** HER NET — the only franc figure on this wire. */
  readonly resellerNet: number;
  readonly productVersionId: string;
  readonly zoneTo: string;
}

export type FeedResult =
  | { readonly ok: true; readonly ventes: readonly FeedVente[] }
  | { readonly ok: false; readonly reason: 'unauthorized' | 'unreachable' | 'malformed' };

export interface ResellerFeedPort {
  /** `code` is her personal `SP-…` code. It is a PARAMETER, never a field of
   *  this object, so it cannot be captured at construction and logged. */
  mesVentes(code: string): Promise<FeedResult>;
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
  return {
    orderId,
    state: state as FeedState,
    createdAt,
    resellerNet,
    productVersionId,
    zoneTo,
  };
}

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
      for (const row of rows) {
        const parsed = readFeedVente(row);
        if (parsed !== null) ventes.push(parsed);
      }
      return { ok: true, ventes };
    } catch {
      // an abort and a dead network are the same thing to her: not reached
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
  const base = process.env.EXPO_PUBLIC_STOREFRONT_BASE;
  if (base) return new HttpResellerFeed(base);
  return null;
}
