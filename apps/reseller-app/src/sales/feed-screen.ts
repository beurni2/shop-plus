/**
 * RF-1c — « MES VENTES » ON REAL DATA: the render spec for her sales screen.
 *
 * FOUNDER ORDER (2026-08-02): « I want the reseller screen wired to the real
 * feed ». Until now the screen read `sales/ventes.ts` — a DEMO model whose
 * hardcoded rows carry `en_route`, `livrée` and `problème`, states no part of
 * this platform can prove. She was looking at a delivery story nobody had
 * verified. This module is what the screen reads instead.
 *
 * PURE ON PURPOSE. Every state her screen can show is decided here, where it
 * can be tested exhaustively, and `App.tsx` only paints the result. The
 * previous screen mixed data and rendering in one 1800-line file, which is
 * exactly how a demo row survives into production unnoticed.
 *
 * ═══ WHAT IT REFUSES TO SAY ═══
 * The three delivery keys are not reachable from this module — not by any
 * input, not by any branch. Her follow-up ends at « prête », because that is
 * the last fact Boutik+ can prove and Séra does not exist yet (B+I-06 makes
 * readiness the PRECONDITION for a pickup being requested — it is not a
 * delivery). Every other state is an honest one: locked, offline, refused,
 * empty, or partial, each named rather than hidden behind a spinner.
 */

import type { FeedVue } from './feed-model';

/** One row as the screen paints it. No client name (a reseller surface has
 *  never seen a buyer's identity and does not start now), no gross, no
 *  commission — only what the wire proved. */
export interface VenteLigne {
  readonly orderId: string;
  /** Catalog key for the chip — never an inline string (Ten Laws #6). */
  readonly etatKey: string;
  readonly netFcfa: number;
  readonly createdAt: string;
}

/**
 * Everything the screen needs, and nothing it must decide for itself.
 * `noticeKeys` are honest disclosures shown ABOVE the list — a partial read
 * and a non-sale row are both stated, never swallowed.
 */
export interface VentesEcran {
  readonly kind: 'porte' | 'chargement' | 'refus' | 'hors_ligne' | 'non_branche' | 'vide' | 'liste';
  readonly titreKey: string;
  readonly hintKey?: string;
  readonly lignes: readonly VenteLigne[];
  readonly noticeKeys: readonly string[];
  /** TRUE only while a real credential is required and absent — the screen
   *  shows the code field, never a fake list behind it. */
  readonly demandeCode: boolean;
}

const VIDE: readonly VenteLigne[] = [];

/**
 * The whole mapping, one place. `vue` is the feed's honest state; the screen
 * never inspects raw rows.
 */
export function ecranDesVentes(vue: FeedVue): VentesEcran {
  switch (vue.kind) {
    case 'not_configured':
      // The app cannot reach any feed at all. Say so plainly rather than
      // showing an empty list that looks like « no sales yet ».
      return {
        kind: 'non_branche',
        titreKey: 'ventes.reel_non_branche_titre',
        hintKey: 'ventes.reel_non_branche_hint',
        lignes: VIDE,
        noticeKeys: [],
        demandeCode: false,
      };
    case 'locked':
      return {
        kind: 'porte',
        titreKey: 'ventes.reel_porte_titre',
        hintKey: 'ventes.reel_porte_hint',
        lignes: VIDE,
        noticeKeys: [],
        demandeCode: true,
      };
    case 'loading':
      return {
        kind: 'chargement',
        titreKey: 'ventes.reel_chargement',
        lignes: VIDE,
        noticeKeys: [],
        demandeCode: false,
      };
    case 'refused':
      // ONE message. The door is not an oracle, and neither is this screen.
      return {
        kind: 'refus',
        titreKey: 'ventes.reel_refus_titre',
        hintKey: 'ventes.reel_refus_hint',
        lignes: VIDE,
        noticeKeys: [],
        demandeCode: true,
      };
    case 'unreachable':
      // OFFLINE IS A DESIGNED STATE, never an empty list: « we could not
      // reach your sales » and « you have no sales » are different sentences
      // and she must be able to tell them apart.
      return {
        kind: 'hors_ligne',
        titreKey: 'ventes.reel_hors_ligne_titre',
        hintKey: 'ventes.reel_hors_ligne_hint',
        lignes: VIDE,
        noticeKeys: [],
        demandeCode: false,
      };
    case 'empty':
      return {
        kind: 'vide',
        titreKey: 'ventes.vide_titre',
        hintKey: 'ventes.vide_hint',
        lignes: VIDE,
        noticeKeys: noticesPour(vue.incomplet, vue.nonConfirmees),
        demandeCode: false,
      };
    case 'ready':
      return {
        kind: 'liste',
        titreKey: 'ventes.titre',
        lignes: vue.ventes.map((v) => ({
          orderId: v.orderId,
          etatKey: v.etatKey,
          netFcfa: v.netFcfa,
          createdAt: v.createdAt,
        })),
        noticeKeys: noticesPour(vue.incomplet, vue.nonConfirmees),
        demandeCode: false,
      };
  }
}

/** The two disclosures, in a fixed order so the screen is deterministic. */
function noticesPour(incomplet: boolean, nonConfirmees: number): readonly string[] {
  const out: string[] = [];
  // A short list served as the whole truth is the lie B3 was fixed to prevent;
  // it must reach her eyes, not just the wire.
  if (incomplet) out.push('ventes.reel_incomplet');
  // Rows that are not sales should be impossible; if any arrive, that is a
  // wire fault and she is told rather than left with a silently short list.
  if (nonConfirmees > 0) out.push('ventes.reel_non_confirmees');
  return out;
}

/** Her total, summed from rows already on screen — never recomputed. */
export function totalAffiche(lignes: readonly VenteLigne[]): number {
  return lignes.reduce((sum, l) => sum + l.netFcfa, 0);
}
