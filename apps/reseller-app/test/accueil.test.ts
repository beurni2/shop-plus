import { describe, expect, it } from 'vitest';
import { APERCU_MAX, ecranAccueil } from '../src/sales/accueil-model';
import { ecranDesGains } from '../src/sales/gains-screen';
import { ecranDesVentes } from '../src/sales/feed-screen';
import { vueDesGains, ECHELLE_GAINS, type EtatGain } from '../src/sales/gains-model';
import { vueDesVentes } from '../src/sales/feed-model';
import type { FeedState, FeedVente } from '../src/sales/feed-service';
import rawCatalog from '../i18n/catalog.json';

/** The catalog is not exported from `src/i18n.ts` (the import there is
 *  type-only, for Metro). Tests read the same JSON the app bundles. */
const catalog = rawCatalog as readonly { key: string; fr: string; register: string }[];

/**
 * ACCUEIL-HONESTY-1 — the first screen may not invent money.
 *
 * What it replaced, so this file records it: two large FCFA figures side by
 * side, « Gains nets — juin » from the constant `MONTHLY_NET_DEMO = 34500`
 * with the sub-line « Versés sur Mobile Money », and « En attente (net) »
 * summed over `DEMO_SALES`. Nothing has ever been paid to anyone. Under them,
 * two « ventes en cours » rows naming customers who are not hers.
 *
 * The tests below are built END-TO-END from the wire's own vocabulary —
 * `FeedVente` rows in, home screen out, through the real `vueDesGains` →
 * `ecranDesGains` and `vueDesVentes` → `ecranDesVentes` the app uses. A
 * hand-built `GainsEcran` fixture would have proved the mapping and nothing
 * about whether the app's actual pipeline reaches it.
 */

function vente(orderId: string, state: FeedState, net: number): FeedVente {
  return {
    orderId,
    state,
    resellerNet: net,
    createdAt: '2026-08-04T10:00:00.000Z',
    productVersionId: 'pv-1',
    zoneTo: 'Gounghin, Ouagadougou',
  };
}

/** The home screen as the app builds it, from raw rows. */
function accueilDe(rows: readonly FeedVente[], incomplet = false) {
  return ecranAccueil(
    ecranDesGains(vueDesGains(rows, incomplet)),
    ecranDesVentes(vueDesVentes(rows, incomplet)),
  );
}

describe('ACCUEIL-HONESTY-1 — a figure on the home screen means a real sale, or there is no figure', () => {
  it('with real sales, the cards carry HER net, summed per rung, and no total', () => {
    const vue = accueilDe([
      vente('ord-1', 'confirmed', 4_000),
      vente('ord-2', 'confirmed', 2_500),
      vente('ord-3', 'payment_pending', 1_200),
    ]);
    if (vue.gains.kind !== 'chiffres') throw new Error(vue.gains.kind);

    const parEtat = new Map(vue.gains.cartes.map((c) => [c.etat, c]));
    expect(parEtat.get('Locked')?.netFcfa).toBe(6_500); // 4 000 + 2 500, to the franc
    expect(parEtat.get('Projected')?.netFcfa).toBe(1_200);

    // NO TOTAL, ANYWHERE ON THE SHAPE. A sum across rungs is the running
    // figure of an account, and no app in this ecosystem keeps one (Ten Laws #2).
    expect(Object.keys(vue.gains)).toEqual(['kind', 'cartes']);
    for (const c of vue.gains.cartes) {
      expect(Object.keys(c).sort()).not.toContain('total');
      expect(Object.keys(c).sort()).not.toContain('solde');
    }
  });

  it('WHICH cards appear is DERIVED from the ladder — the six unreachable rungs never reach home', () => {
    const vue = accueilDe([vente('ord-1', 'confirmed', 1_000)]);
    if (vue.gains.kind !== 'chiffres') throw new Error(vue.gains.kind);

    // Today exactly the two the wire can produce, in ladder order.
    expect(vue.gains.cartes.map((c) => c.etat)).toEqual(['Projected', 'Locked']);

    // …and that is not a coincidence of how someone typed a list: every rung
    // the LADDER marks dormant is absent, and every rung it marks live is
    // present. When `Eligible` becomes reachable, home grows a card on its own.
    const echelle = ecranDesGains(vueDesGains([vente('ord-1', 'confirmed', 1_000)], false));
    const vivants = echelle.paliers.filter((p) => !p.enSommeil).map((p) => p.etat);
    const dormants = echelle.paliers.filter((p) => p.enSommeil).map((p) => p.etat);
    expect(vue.gains.cartes.map((c) => c.etat)).toEqual(vivants);
    for (const mort of dormants) {
      expect(vue.gains.cartes.map((c) => c.etat)).not.toContain(mort);
    }
    // CONTROL — the fixture is discriminating: there ARE dormant rungs to
    // exclude, so « excludes all dormant » is not vacuously true.
    expect(dormants.length).toBeGreaterThan(0);
    expect(dormants.length + vivants.length).toBe(ECHELLE_GAINS.length);
  });

  it('« Paid » NEVER reaches the home screen — nothing has ever been paid, and this is the screen that used to say it had', () => {
    // The exact regression: « Gains nets — juin / Versés sur Mobile Money ».
    // No arrangement of real rows may produce a Paid card, because no fact
    // this platform receives can put a sale on that rung.
    for (const state of ['confirmed', 'payment_pending', 'payment_failed'] as const) {
      const vue = accueilDe([vente('ord-x', state, 9_999)]);
      const etats: readonly string[] =
        vue.gains.kind === 'chiffres' ? vue.gains.cartes.map((c) => c.etat) : [];
      for (const jamais of ['Paid', 'Payable', 'Processing', 'Eligible', 'Held', 'Adjusted'] satisfies EtatGain[]) {
        expect(etats, `${state} must not reach ${jamais}`).not.toContain(jamais);
      }
    }
  });

  it('a payment that FAILED puts no money on the home screen — it never became an earning', () => {
    const vue = accueilDe([vente('ord-ko', 'payment_failed', 7_000)]);
    if (vue.gains.kind !== 'chiffres') throw new Error(vue.gains.kind);
    for (const c of vue.gains.cartes) expect(c.netFcfa).toBe(0);
    // and it is not silently dropped from her world — « Mes gains » discloses it
    expect(ecranDesGains(vueDesGains([vente('ord-ko', 'payment_failed', 7_000)], false)).noticeKeys)
      .toContain('gains.sans_obligation');
  });

  it('NO CODE, NO FEED, OFFLINE, REFUSED, LOADING — a sentence, never a zero', () => {
    // A zero is a claim (« you have earned nothing ») and we do not know it.
    const etats = [
      { vue: { kind: 'verrouille' } as const, demandeCode: true },
      { vue: { kind: 'non_branche' } as const, demandeCode: false },
      { vue: { kind: 'hors_ligne' } as const, demandeCode: false },
      { vue: { kind: 'refus' } as const, demandeCode: true },
      { vue: { kind: 'chargement' } as const, demandeCode: false },
    ];
    for (const { vue, demandeCode } of etats) {
      const ecran = ecranAccueil(ecranDesGains(vue), ecranDesVentes({ kind: 'locked' }));
      expect(ecran.gains.kind, vue.kind).toBe('silence');
      if (ecran.gains.kind !== 'silence') throw new Error('unreachable');
      expect(ecran.gains.demandeCode, vue.kind).toBe(demandeCode);
      // every sentence resolves to real copy
      const fr = new Map(catalog.map((e) => [e.key, e.fr]));
      expect(fr.get(ecran.gains.titreKey), ecran.gains.titreKey).toBeTruthy();
      expect(fr.get(ecran.gains.texteKey), ecran.gains.texteKey).toBeTruthy();
    }
  });

  it('A REFUSED CODE AND AN ABSENT CODE DO NOT SHARE A SENTENCE — founder-found, 2026-08-04', () => {
    // The first cut paired « Ce code n'ouvre pas. » with « Entrez votre code
    // dans « Mes gains » pour les voir » — telling her to do the thing she has
    // just done, and implying the app had not noticed her code at all.
    const refus = ecranAccueil(ecranDesGains({ kind: 'refus' }), ecranDesVentes({ kind: 'refused' }));
    const porte = ecranAccueil(ecranDesGains({ kind: 'verrouille' }), ecranDesVentes({ kind: 'locked' }));
    if (refus.gains.kind !== 'silence' || porte.gains.kind !== 'silence') throw new Error('expected silence');

    expect(refus.gains.titreKey).toBe('ventes.reel_refus_titre');
    expect(refus.gains.texteKey).toBe('ventes.reel_refus_hint');
    // the two states are DISTINGUISHABLE in both lines — a shared second line
    // is what made the refusal read as « we never saw your code »
    expect(refus.gains.texteKey).not.toBe(porte.gains.texteKey);
    expect(refus.gains.titreKey).not.toBe(porte.gains.titreKey);
    // …and both still point her at the door she can act on
    expect(refus.gains.demandeCode).toBe(true);
    expect(porte.gains.demandeCode).toBe(true);

    // the sentence must actually tell her what to DO about a bad code
    const fr = new Map(catalog.map((e) => [e.key, e.fr]));
    expect((fr.get(refus.gains.texteKey) ?? '').toLowerCase()).toContain('vérifiez');
  });

  it('the preview shows HER rows, capped, and never a name — a reseller surface has never seen a buyer (SP-I03)', () => {
    const rows = [
      vente('ord-1', 'confirmed', 1_000),
      vente('ord-2', 'confirmed', 2_000),
      vente('ord-3', 'confirmed', 3_000),
    ];
    const vue = accueilDe(rows);
    expect(vue.apercu).toHaveLength(APERCU_MAX);
    expect(APERCU_MAX).toBeLessThan(rows.length); // the cap is exercised, not incidental
    expect(vue.apercuEtatKey).toBeUndefined();
    for (const l of vue.apercu) {
      const champs = Object.keys(l);
      expect(champs).not.toContain('clientFirstName');
      expect(champs).not.toContain('buyerName');
      expect(champs).not.toContain('phone');
      expect(champs).not.toContain('productName');
    }
    // …and the rows are the SAME objects the ventes screen paints, so home can
    // never show a sale « Mes ventes » does not have.
    expect(vue.apercu).toEqual(ecranDesVentes(vueDesVentes(rows, false)).lignes.slice(0, APERCU_MAX));
  });

  it('no list ⇒ the FEED’s own sentence, so home and « Mes ventes » never describe one situation two ways', () => {
    for (const vue of [
      { kind: 'locked' } as const,
      { kind: 'not_configured' } as const,
      { kind: 'unreachable' } as const,
      { kind: 'refused' } as const,
    ]) {
      const feed = ecranDesVentes(vue);
      const ecran = ecranAccueil(ecranDesGains({ kind: 'verrouille' }), feed);
      expect(ecran.apercu, vue.kind).toEqual([]);
      expect(ecran.apercuEtatKey, vue.kind).toBe(feed.titreKey);
    }
  });

  it('an EMPTY feed still says the empty thing — « aucune vente », not a blank home', () => {
    const vue = accueilDe([]);
    const feed = ecranDesVentes(vueDesVentes([], false));
    expect(feed.kind).toBe('vide');
    expect(vue.apercuEtatKey).toBe('ventes.vide_titre');
    expect(vue.apercuHintKey).toBe('ventes.vide_hint');
  });

  it('every catalog key the model can emit exists, with its register tag', () => {
    const entries = new Map(catalog.map((e) => [e.key, e]));
    const vues = [
      accueilDe([vente('ord-1', 'confirmed', 500), vente('ord-2', 'payment_pending', 700)]),
      accueilDe([]),
      ecranAccueil(ecranDesGains({ kind: 'verrouille' }), ecranDesVentes({ kind: 'locked' })),
      ecranAccueil(ecranDesGains({ kind: 'hors_ligne' }), ecranDesVentes({ kind: 'unreachable' })),
      ecranAccueil(ecranDesGains({ kind: 'chargement' }), ecranDesVentes({ kind: 'loading' })),
      ecranAccueil(ecranDesGains({ kind: 'refus' }), ecranDesVentes({ kind: 'refused' })),
      ecranAccueil(ecranDesGains({ kind: 'non_branche' }), ecranDesVentes({ kind: 'not_configured' })),
    ];
    let vus = 0;
    for (const v of vues) {
      const cles = [
        ...(v.gains.kind === 'silence' ? [v.gains.titreKey, v.gains.texteKey] : v.gains.cartes.flatMap((c) => [c.libelleKey, c.compteKey])),
        ...(v.apercuEtatKey === undefined ? [] : [v.apercuEtatKey]),
        ...(v.apercuHintKey === undefined ? [] : [v.apercuHintKey]),
      ];
      for (const k of cles) {
        const e = entries.get(k);
        expect(e, `${k} missing from catalog`).toBeDefined();
        expect(e!.fr.length, k).toBeGreaterThan(0);
        vus += 1;
      }
    }
    expect(vus).toBeGreaterThan(15); // the sweep actually swept
  });

  it('the retired « Gains du mois » copy is gone from the catalog — including « Versés sur Mobile Money »', () => {
    const keys = new Set(catalog.map((e) => e.key));
    for (const mort of ['accueil.gains_mois_label', 'accueil.gains_mois_sub', 'accueil.attente_label', 'accueil.attente_sub']) {
      expect(keys.has(mort), `${mort} still in the catalog`).toBe(false);
    }
    // the sentence itself, wherever it might have been re-keyed: nothing on any
    // reseller surface may claim money was paid out, because none ever was.
    for (const e of catalog) {
      expect(e.fr.toLowerCase(), e.key).not.toContain('versés sur mobile money');
    }
  });
});
