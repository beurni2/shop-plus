import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ecranDesVentes, totalAffiche } from '../src/sales/feed-screen';
import { vueDesVentes } from '../src/sales/feed-model';
import type { FeedVente } from '../src/sales/feed-service';
import type { FeedVue } from '../src/sales/feed-model';

/**
 * RF-1c — the render spec for « Mes ventes » on REAL data.
 *
 * The property that matters most: her screen must never be able to show a
 * delivery state, and every non-list outcome must be a NAMED honest state
 * rather than an empty list that reads as « no sales ».
 */

const row = (over: Partial<FeedVente> = {}): FeedVente => ({
  orderId: 'ord-1',
  state: 'confirmed',
  createdAt: '2026-08-02T08:00:00.000Z',
  resellerNet: 2_000,
  productVersionId: 'pv-1',
  zoneTo: 'Ouagadougou',
  ...over,
});

const catalogKeys = new Set(
  (JSON.parse(readFileSync(new URL('../i18n/catalog.json', import.meta.url), 'utf8')) as {
    key: string;
  }[]).map((e) => e.key),
);

const ALL_STATES: FeedVue[] = [
  { kind: 'not_configured' },
  { kind: 'locked' },
  { kind: 'loading' },
  { kind: 'refused' },
  { kind: 'unreachable' },
  { kind: 'empty', incomplet: false, nonConfirmees: 0 },
  vueDesVentes([row()], false),
];

describe('RF-1c — every state her screen can reach is honest and nameable', () => {
  it('EVERY state maps to a distinct kind, and none is a blank list pretending to be "no sales"', () => {
    const kinds = ALL_STATES.map((v) => ecranDesVentes(v).kind);
    expect(new Set(kinds).size, 'each state must be distinguishable on screen').toBe(ALL_STATES.length);
    expect(kinds).toEqual(['non_branche', 'porte', 'chargement', 'refus', 'hors_ligne', 'vide', 'liste']);
  });

  it('EVERY key it can emit EXISTS in the catalog — no screen may render a missing string', () => {
    for (const vue of ALL_STATES) {
      const e = ecranDesVentes(vue);
      for (const k of [e.titreKey, ...(e.hintKey !== undefined ? [e.hintKey] : []), ...e.noticeKeys]) {
        expect(catalogKeys.has(k), `missing catalog key: ${k}`).toBe(true);
      }
      for (const l of e.lignes) expect(catalogKeys.has(l.etatKey), `missing chip key: ${l.etatKey}`).toBe(true);
    }
    // and the notice keys too, which only appear on some states
    const withNotices = ecranDesVentes({ kind: 'empty', incomplet: true, nonConfirmees: 2 });
    for (const k of withNotices.noticeKeys) expect(catalogKeys.has(k), k).toBe(true);
  });

  it('NO DELIVERY STATE is reachable from ANY input — the screen cannot express Séra', () => {
    const bytes = ALL_STATES.map((v) => JSON.stringify(ecranDesVentes(v))).join('\n')
      + JSON.stringify(ecranDesVentes({ kind: 'empty', incomplet: true, nonConfirmees: 3 }))
      + JSON.stringify(
          ecranDesVentes(
            vueDesVentes([row({ acceptedAt: '2026-08-02T09:00:00.000Z', readyAt: '2026-08-02T10:00:00.000Z' })], true),
          ),
        );
    // NOTE the deliberate absence of a bare « porte » term: the code-door
    // strings are `ventes.reel_porte_*` (the door SHE opens), which is not the
    // buyer's doorstep. The delivery key is `ventes.etat_porte`, banned below
    // by its exact name — a looser term would fail on a legitimate string and
    // teach the next reader to weaken the scan.
    for (const invented of ['en_route', 'etat_porte', 'livree', 'probleme', 'courier', 'custody']) {
      expect(bytes.includes(invented), `the screen can express a state nobody proved: ${invented}`).toBe(false);
    }
  });

  it('OFFLINE is its own state, never an empty list — "not read" and "no sales" are different sentences', () => {
    const offline = ecranDesVentes({ kind: 'unreachable' });
    const empty = ecranDesVentes({ kind: 'empty', incomplet: false, nonConfirmees: 0 });
    expect(offline.kind).not.toBe(empty.kind);
    expect(offline.titreKey).not.toBe(empty.titreKey);
    expect(offline.lignes).toEqual([]);
  });

  /**
   * ACCESS-GATE-1 — THE CLAIM CHANGED BECAUSE THE PRODUCT DID.
   *
   * This screen used to carry `demandeCode` and render a code field on
   * `locked`/`refused`. Founder order, 2026-08-04: « i do not want resellers
   * feed to have any code gated. the only gate i want is the access gate ».
   * There is now ONE door and it is the app's entrance; no screen inside the
   * app asks for a credential. The pin therefore asserts the ABSENCE — a field
   * quietly reintroduced here would rebuild the wall he had removed.
   */
  it('NO SCREEN STATE ASKS FOR A CODE — the only door is the app entrance', () => {
    for (const vue of [
      { kind: 'locked' } as const,
      { kind: 'refused' } as const,
      { kind: 'loading' } as const,
      { kind: 'unreachable' } as const,
      { kind: 'not_configured' } as const,
      { kind: 'empty', incomplet: false, nonConfirmees: 0 } as const,
    ]) {
      expect(Object.keys(ecranDesVentes(vue)), vue.kind).not.toContain('demandeCode');
    }
    // …and the locked state still says something TRUE rather than nothing: it
    // is « not connected yet », which is the honest reading of a device that
    // has never been given a code.
    const locked = ecranDesVentes({ kind: 'locked' });
    expect(locked.titreKey).toBe('ventes.reel_porte_titre');
    expect(locked.lignes).toEqual([]);
  });

  it('A PARTIAL READ AND A NON-SALE ROW BOTH REACH HER EYES, in a fixed order', () => {
    expect(ecranDesVentes({ kind: 'empty', incomplet: false, nonConfirmees: 0 }).noticeKeys).toEqual([]);
    expect(ecranDesVentes({ kind: 'empty', incomplet: true, nonConfirmees: 0 }).noticeKeys)
      .toEqual(['ventes.reel_incomplet']);
    expect(ecranDesVentes({ kind: 'empty', incomplet: false, nonConfirmees: 2 }).noticeKeys)
      .toEqual(['ventes.reel_non_confirmees']);
    expect(ecranDesVentes({ kind: 'empty', incomplet: true, nonConfirmees: 2 }).noticeKeys)
      .toEqual(['ventes.reel_incomplet', 'ventes.reel_non_confirmees']);
    // …and on a NON-EMPTY list too, which is where a short list would lie
    const partial = ecranDesVentes(vueDesVentes([row()], true));
    expect(partial.kind).toBe('liste');
    expect(partial.noticeKeys).toContain('ventes.reel_incomplet');
  });

  it('the list carries her NET and the proven chip — and no buyer identity at all', () => {
    const e = ecranDesVentes(vueDesVentes([row({ acceptedAt: '2026-08-02T09:00:00.000Z' })], false));
    if (e.kind !== 'liste') throw new Error('expected liste');
    expect(e.lignes[0]!.netFcfa).toBe(2_000);
    expect(e.lignes[0]!.etatKey).toBe('ventes.etat_preparation');
    // the row shape itself cannot hold a buyer
    expect(Object.keys(e.lignes[0]!).sort()).toEqual(['createdAt', 'etatKey', 'netFcfa', 'orderId']);
    const bytes = JSON.stringify(e);
    for (const banned of ['client', 'phone', 'quartier', 'repere', 'contact', 'supplier']) {
      expect(bytes.toLowerCase().includes(banned), `leaked ${banned}`).toBe(false);
    }
  });

  it('her total sums the rows on screen, never a recomputation', () => {
    const e = ecranDesVentes(vueDesVentes([row({ resellerNet: 2_000 }), row({ orderId: 'b', resellerNet: 1_500 })], false));
    if (e.kind !== 'liste') throw new Error('expected liste');
    expect(totalAffiche(e.lignes)).toBe(3_500);
  });
});
