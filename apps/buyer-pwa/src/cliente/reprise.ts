/**
 * ═══ REPRISE-PWA — THE TAB'S JOURNEY SNAPSHOT (founder, 2026-08-13) ═══
 *
 * « when i refresh at any step it always takes me back to the initial payment
 * screen commander like a new produt order to buy again. »
 *
 * WHAT THIS IS: the SMALLEST record that lets a refresh continue the journey —
 * the screen she stood on and what she had entered there. It lives in
 * `sessionStorage`, so a refresh CONTINUES the journey and a CLOSED TAB ENDS
 * it; the cross-visit road stays the « Ma commande » band (localStorage,
 * quote-port.ts), unchanged.
 *
 * WHAT IT NEVER CARRIES, by construction:
 *  · NO drop code — `garderCommande` does not store it either; a resumed C9
 *    re-asks the remise route, which answers by its own rules.
 *  · NO payment or custody state (`confirmState`, `doorLeg`, `livree`, the
 *    marks) — server truth is RE-ASKED on resume through the flow's own reads,
 *    so a refresh can never promote « in flight » to « paid ».
 *  · NO amount — there is nothing here that can price anything.
 *
 * KEYED TO THE SIGNED LINK (`lien`, slug#pid): a DIFFERENT product or shop
 * link never resumes another journey's state — a mismatched snapshot reads as
 * nothing.
 *
 * A snapshot the codec cannot vouch for — malformed JSON, a missing field, a
 * screen it does not know, an order screen without its order — is DISCARDED
 * (fresh C1), never a crash and never a guess. Every function tolerates a dead
 * or lying storage: losing the snapshot costs the resumption, never the order.
 */
import type { Livraison, ModePaiement } from './screens';

export const REPRISE_CLE = 'sp-reprise:v1';

/** The screens a snapshot may name. C1 needs no snapshot (it IS the fresh
 *  start) and C10 is terminal — both CLEAR the slot instead of writing it, so
 *  a finished journey does not resurrect. */
export type EcranReprise = 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9';
const ECRANS_REPRISE: readonly string[] = ['C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'];

export interface Reprise {
  /** The signed link identity this journey belongs to — slug#pid. */
  readonly lien: string;
  readonly ecran: EcranReprise;
  /* — what she entered on C3 — */
  readonly zone: string | null;
  readonly repere: string;
  readonly phone: string;
  /* — her choices — */
  readonly delivery: Livraison | null;
  readonly pay: ModePaiement | null;
  /* — the order linkage, once one exists: the SAME two values `garderCommande`
   *   already keeps in localStorage, and nothing more — */
  readonly orderId: string | null;
  readonly buyerRef: string | null;
  /** Which order attempt this journey is on (`state.essai`) — so a retry after
   *  a reload mints a genuinely new command instead of replaying the old. */
  readonly essai: number;
}

export function garderReprise(r: Reprise, storage?: Storage): void {
  if (storage === undefined) return;
  try {
    // Field by field, never a spread — the `garderCommande` allowlist law:
    // what is stored is exactly what is named here, and nothing (a code, a
    // mark, an amount) can ever ride along unnoticed.
    storage.setItem(
      REPRISE_CLE,
      JSON.stringify({
        lien: r.lien,
        ecran: r.ecran,
        zone: r.zone,
        repere: r.repere,
        phone: r.phone,
        delivery: r.delivery,
        pay: r.pay,
        orderId: r.orderId,
        buyerRef: r.buyerRef,
        essai: r.essai,
      }),
    );
  } catch {
    /* best-effort — losing the snapshot costs the resumption, never the order */
  }
}

const chaineOuNull = (v: unknown): boolean => v === null || typeof v === 'string';
const nonVide = (v: unknown): v is string => typeof v === 'string' && v !== '';

/**
 * The stored journey for THIS link, or nothing. Nothing is a real answer: the
 * caller mounts fresh at C1, exactly as if no snapshot existed.
 */
export function lireReprise(storage: Storage | undefined, lien: string): Reprise | undefined {
  if (storage === undefined) return undefined;
  try {
    const raw = storage.getItem(REPRISE_CLE);
    if (raw === null || raw === '') return undefined;
    const v: unknown = JSON.parse(raw);
    if (v === null || typeof v !== 'object') return undefined;
    const o = v as Record<string, unknown>;
    // A DIFFERENT link never resumes this journey's state.
    if (o['lien'] !== lien) return undefined;
    const ecran = o['ecran'];
    if (typeof ecran !== 'string' || !ECRANS_REPRISE.includes(ecran)) return undefined;
    const zone = o['zone'];
    const repere = o['repere'];
    const phone = o['phone'];
    if (!chaineOuNull(zone)) return undefined;
    if (typeof repere !== 'string' || typeof phone !== 'string') return undefined;
    const delivery = o['delivery'];
    if (delivery !== null && delivery !== 'today' && delivery !== 'tomorrow') return undefined;
    const pay = o['pay'];
    if (pay !== null && pay !== 'A' && pay !== 'B') return undefined;
    const orderId = o['orderId'];
    const buyerRef = o['buyerRef'];
    if (!chaineOuNull(orderId) || !chaineOuNull(buyerRef)) return undefined;
    const essai = o['essai'];
    if (typeof essai !== 'number' || !Number.isInteger(essai) || essai < 0) return undefined;
    // GEO-ACHAT-2 — a zone may legitimately be absent past C3 now: the
    // phone-only road crosses on a confirmed pin, and the PIN NEVER PERSISTS
    // (no coordinate in any storage — the consent law). So a priced screen
    // resumed without a zone clamps back to C3, where she re-confirms her
    // position or names a quartier; the order screens (C6+) resume as they
    // are — their truth is the order's, and the zone plays no role there.
    // An order screen without its order cannot be resumed honestly — the
    // tracking would have nothing to poll and the code nothing to ask for.
    if ((ecran === 'C6' || ecran === 'C7' || ecran === 'C8' || ecran === 'C9') && (!nonVide(orderId) || !nonVide(buyerRef))) {
      return undefined;
    }
    const ecranSur = (ecran === 'C4' || ecran === 'C5') && zone === null ? 'C3' : ecran;
    return {
      lien,
      ecran: ecranSur as EcranReprise,
      zone: zone as string | null,
      repere,
      phone,
      delivery: delivery as Livraison | null,
      pay: pay as ModePaiement | null,
      orderId: orderId as string | null,
      buyerRef: buyerRef as string | null,
      essai,
    };
  } catch {
    return undefined;
  }
}

/** The journey ended (C1 fresh start, C10 terminal, « C'est terminé ») — the
 *  slot clears and a refresh opens a fresh page. */
export function oublierReprise(storage?: Storage): void {
  if (storage === undefined) return;
  try {
    storage.removeItem(REPRISE_CLE);
  } catch {
    /* best-effort */
  }
}
