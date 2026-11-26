import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ORDER_STATUSES } from '@platform/contracts';
import {
  ATTEIGNABLES,
  ECHELLE_GAINS,
  ETATS_DU_FIL_POUR_TESTS,
  etatDeLaVente,
  etatPour,
  finSansGain,
  gainsSurface,
  vueDesGains,
  type EtatGain,
} from '../src/sales/gains-model';
import { ecranDesGains } from '../src/sales/gains-screen';
import type { FeedState, FeedVente } from '../src/sales/feed-service';

/**
 * SP6.1 — the earnings read model, EXECUTED. Every assertion runs the real
 * function; nothing is asserted about source text except where a checked-in
 * artefact (the gate fixture, the catalog) must be pinned to the module.
 *
 * THE CLAIM THIS FILE EXISTS TO PROTECT is not « the eight states are listed ».
 * It is: **a rung the platform cannot reach must never render a franc figure,
 * and a rung it CAN reach must never lose one.** Everything below serves that.
 */

const T = '2026-08-04T09:00:00.000Z';

function vente(over: Partial<FeedVente> = {}): FeedVente {
  return {
    orderId: 'ord-1',
    state: 'confirmed',
    createdAt: T,
    resellerNet: 2_000,
    productVersionId: 'pv-1',
    zoneTo: 'Ouagadougou',
    ...over,
  };
}

const echelle = (rows: readonly FeedVente[], incomplet = false) => {
  const v = vueDesGains(rows, incomplet);
  if (v.kind !== 'echelle') throw new Error(`expected the ladder, got ${v.kind}`);
  return v;
};
const palier = (rows: readonly FeedVente[], etat: EtatGain) => {
  const p = echelle(rows).paliers.find((x) => x.etat === etat);
  if (p === undefined) throw new Error(`no rung ${etat}`);
  return p;
};

/* ═══════════════════ the ladder itself ═══════════════════ */

describe('SP6.1 — the eight states of the plan, in order, always all present', () => {
  it('the ladder IS the plan’s eight, in the plan’s order', () => {
    // Building Plan line 75, verbatim: « Projected/Locked/Eligible/Payable/
    // Processing/Paid/Held/Adjusted ». Pinned as a sequence, not a set: the
    // order is what makes the screen read as a road.
    expect(ECHELLE_GAINS).toEqual([
      'Projected',
      'Locked',
      'Eligible',
      'Payable',
      'Processing',
      'Paid',
      'Held',
      'Adjusted',
    ]);
  });

  it('all eight rungs render even with NO sales at all — the road is never hidden', () => {
    const v = echelle([]);
    expect(v.paliers).toHaveLength(8);
    expect(v.paliers.map((p) => p.etat)).toEqual([...ECHELLE_GAINS]);
  });
});

/* ═══════════════════ what a fact can and cannot reach ═══════════════════ */

describe('SP6.1 — reachability is DERIVED from the wire, never declared', () => {
  it('exactly three rungs are reachable today, and they are the three facts Shop+ holds', () => {
    // If this ever fails, something changed about what the platform can prove —
    // which is exactly the moment a human should look, not a moment to update
    // the expectation reflexively. The third is Séra's validated delivery: the
    // ledger writes the obligations and her row says `livree`.
    expect([...ATTEIGNABLES].sort()).toEqual(['Eligible', 'Locked', 'Projected']);
  });

  it('THE FIVE DORMANT RUNGS ARE UNREACHABLE BY ANY INPUT — proved by exhausting every state × delivered × refused', () => {
    // The vacuity-killer. It is not enough that a hand-picked fixture fails to
    // reach `Paid`; NO row the wire can carry may reach it. `FeedState` is a
    // closed union and the two facts are booleans, so this loop IS exhaustive.
    // Held is left out of the row: it is reached only through §6.5's
    // `lienProche`, pinned just below.
    const atteints = new Set<EtatGain | null>();
    for (const state of ETATS_DU_FIL_POUR_TESTS) {
      for (const livree of [false, true]) {
        for (const refusee of [false, true]) {
          const r = vente({ state, ...(livree ? { livree: true } : {}), ...(refusee ? { refusee: true } : {}) });
          const etat = etatDeLaVente(r);
          atteints.add(etat);
          if (!livree) expect(etat, `${state} without delivery reached Eligible`).not.toBe('Eligible');
          if (livree && !refusee && state !== 'refunded') expect(etat, `${state} delivered`).toBe('Eligible');
        }
      }
    }
    for (const dormant of ['Payable', 'Processing', 'Paid', 'Held', 'Adjusted'] as const) {
      expect(atteints.has(dormant), `${dormant} became reachable`).toBe(false);
      expect(ATTEIGNABLES.has(dormant), `${dormant} marked reachable`).toBe(false);
    }
    // …AND THE CONTROL, without which the loop above passes on an empty map:
    // the three live rungs really are produced by real rows.
    expect(atteints.has('Projected')).toBe(true);
    expect(atteints.has('Locked')).toBe(true);
    expect(atteints.has('Eligible')).toBe(true);
    // Held IS reachable — through a hold on the row, and only that way.
    expect(etatDeLaVente(vente({ lienProche: { outcome: 'auto_void', signals: ['phone'], contestee: false } }))).toBe('Held');
  });

  it('`ETATS_DU_FIL` still mirrors `FeedState` AND the canon order statuses — a state added without it goes silently stale', () => {
    // The exhaustion above is only as good as this list. A `satisfies`-style
    // check: every FeedState literal must appear, enumerated here INDEPENDENTLY
    // so the two cannot be edited by one careless sweep — and the service
    // forwards the order's own state verbatim, so canon's enum is the wire's.
    const attendus: readonly FeedState[] = [
      'quote_issued',
      'reserved',
      'payment_pending',
      'paid',
      'confirmed',
      'payment_failed',
      'cancelled',
      'refunded',
    ];
    expect([...ETATS_DU_FIL_POUR_TESTS].sort()).toEqual([...attendus].sort());
    expect([...ETATS_DU_FIL_POUR_TESTS].sort()).toEqual([...ORDER_STATUSES].sort());
  });

  it('a DORMANT rung carries no francs and no count, whatever the sales are', () => {
    const rows = [vente(), vente({ orderId: 'o2', state: 'payment_pending' }), vente({ orderId: 'o3' })];
    for (const p of echelle(rows).paliers.filter((x) => !x.atteignable)) {
      expect(p.netFcfa, p.etat).toBe(0);
      expect(p.ventes, p.etat).toBe(0);
    }
  });
});

/* ═══════════════════ the mapping, state by state ═══════════════════ */

describe('RELATED-PARTY-1 — a sale the order HELD sits on the Held rung, never on the locked hero; a cleared one is ordinary money again', () => {
  const retenue = (over: Partial<FeedVente> = {}) =>
    vente({ orderId: 'ord-h', resellerNet: 2_500, lienProche: { outcome: 'auto_void', signals: ['phone'], contestee: false }, ...over });

  it('the rung ONE sale lands on: §6.5\'s hold first, then the wire state', () => {
    expect(etatDeLaVente(vente())).toBe('Locked');
    expect(etatDeLaVente(retenue())).toBe('Held');
    expect(etatDeLaVente(retenue({ lienProche: { outcome: 'held_for_review', signals: ['household'], contestee: true } }))).toBe('Held');
    expect(etatDeLaVente(retenue({ lienProche: { outcome: 'auto_void', signals: ['phone'], contestee: true, resolution: 'violation' } }))).toBe('Held');
    expect(etatDeLaVente(retenue({ lienProche: { outcome: 'auto_void', signals: ['phone'], contestee: true, resolution: 'clear' } })), 'cleared: ordinary money').toBe('Locked');
    expect(etatDeLaVente(retenue({ state: 'payment_failed' })), 'a hold on a failed payment still shows what the order holds').toBe('Held');
  });

  it('the Held rung wakes ONLY when a sale sits on it, carries that net and count, and the locked hero never adds it', () => {
    const sans = palier([vente()], 'Held');
    expect(sans.atteignable, 'dormant without a held sale, as before').toBe(false);
    expect(sans.netFcfa).toBe(0);
    const avec = echelle([vente({ resellerNet: 3_000 }), retenue()]);
    const held = avec.paliers.find((p) => p.etat === 'Held');
    const locked = avec.paliers.find((p) => p.etat === 'Locked');
    expect(held?.atteignable).toBe(true);
    expect(held?.ventes).toBe(1);
    expect(held?.netFcfa).toBe(2_500);
    expect(locked?.netFcfa, 'the held net is never locked money').toBe(3_000);
    expect(avec.retenues).toEqual([{ orderId: 'ord-h', netFcfa: 2_500, signals: ['phone'], contestee: false }]);
    expect(ATTEIGNABLES.has('Held'), 'reachability by STATE is unchanged: the wire has no held state, only a fact on a row').toBe(false);
  });

  it('the screen paints each held sale with its basis, its state and its one action', () => {
    const vue = echelle([
      retenue(),
      retenue({ orderId: 'ord-c', lienProche: { outcome: 'auto_void', signals: ['phone'], contestee: true } }),
      retenue({ orderId: 'ord-v', lienProche: { outcome: 'auto_void', signals: ['phone'], contestee: false, resolution: 'violation' } }),
      retenue({ orderId: 'ord-r', lienProche: { outcome: 'held_for_review', signals: ['household'], contestee: false } }),
    ]);
    const ecran = ecranDesGains(vue);
    if (ecran.kind !== 'echelle') throw new Error(ecran.kind);
    expect(ecran.retenues.map((r) => [r.orderId, r.etat, r.statutKey, r.baseKeys])).toEqual([
      ['ord-h', 'a_contester', undefined, ['gains.lien_proche_base_telephone', 'gains.lien_proche_texte']],
      ['ord-c', 'contestee', 'gains.lien_proche_notee', ['gains.lien_proche_base_telephone', 'gains.lien_proche_texte']],
      // The ruling is in: the « set aside for a check » sentence is gone from the card; the basis stays.
      ['ord-v', 'refusee', 'gains.lien_proche_refusee', ['gains.lien_proche_base_telephone']],
      // A signal this platform does not read yet has no sentence of its own: the hold sentence alone, never a made-up basis.
      ['ord-r', 'a_contester', undefined, ['gains.lien_proche_texte']],
    ]);
  });
});

describe('SP6.1 — every wire state lands where the settlement law says, and nowhere else', () => {
  it('an unconfirmed order is Projected — money the provider has not confirmed is not hers yet', () => {
    expect(etatPour('payment_pending')).toBe('Projected');
    const p = palier([vente({ state: 'payment_pending', resellerNet: 3_400 })], 'Projected');
    expect(p.netFcfa).toBe(3_400);
    expect(p.ventes).toBe(1);
  });

  it('a confirmed order is Locked — canon’s first obligation state, and it stops there', () => {
    expect(etatPour('confirmed')).toBe('Locked');
    const v = echelle([vente({ resellerNet: 5_000 })]);
    expect(v.paliers.find((p) => p.etat === 'Locked')!.netFcfa).toBe(5_000);
    // AND NOT ONE RUNG FURTHER. A confirmed payment is not a delivery and not
    // a payout; if this ever leaks upward she is told her money has moved when
    // it has not.
    expect(v.paliers.find((p) => p.etat === 'Eligible')!.netFcfa).toBe(0);
    expect(v.paliers.find((p) => p.etat === 'Paid')!.netFcfa).toBe(0);
  });

  it('a FAILED payment is on NO rung, and is counted out loud instead of dropped', () => {
    expect(etatPour('payment_failed')).toBeNull();
    const v = echelle([vente({ state: 'payment_failed', resellerNet: 9_999 })]);
    expect(v.sansObligation).toBe(1);
    for (const p of v.paliers) expect(p.netFcfa, p.etat).toBe(0);
  });

  it('Séra VALIDATED THE DELIVERY → Eligible, with her net, and the locked hero no longer holds it', () => {
    expect(etatPour('confirmed', true)).toBe('Eligible');
    const v = echelle([vente({ orderId: 'a', resellerNet: 3_000 }), vente({ orderId: 'b', resellerNet: 4_000, livree: true })]);
    const eligible = v.paliers.find((p) => p.etat === 'Eligible')!;
    expect(eligible.atteignable).toBe(true);
    expect(eligible.ventes).toBe(1);
    expect(eligible.netFcfa).toBe(4_000);
    expect(v.paliers.find((p) => p.etat === 'Locked')!.netFcfa, 'only the undelivered sale is locked').toBe(3_000);
  });

  it('REFUSED before delivery → on NO rung, counted on its own line; the locked hero does not keep it', () => {
    const v = echelle([vente({ orderId: 'a', resellerNet: 3_000 }), vente({ orderId: 'b', resellerNet: 2_500, refusee: true })]);
    expect(finSansGain(vente({ refusee: true }))).toBe('refusee');
    expect(etatDeLaVente(vente({ refusee: true }))).toBeNull();
    expect(v.refusees).toBe(1);
    expect(v.remboursees).toBe(0);
    expect(v.sansObligation, 'not a failed payment: its own line').toBe(0);
    expect(v.paliers.find((p) => p.etat === 'Locked')!.netFcfa).toBe(3_000);
    expect(v.paliers.reduce((n, p) => n + p.ventes, 0), 'only the live sale sits on a rung').toBe(1);
  });

  it('REFUNDED → read, on NO rung, counted once as refunded (even with its refusal fact still on the row)', () => {
    const v = echelle([vente({ state: 'refunded', resellerNet: 1_500, refusee: true })]);
    expect(finSansGain(vente({ state: 'refunded' }))).toBe('remboursee');
    expect(v.remboursees).toBe(1);
    expect(v.refusees).toBe(0);
    expect(v.sansObligation).toBe(0);
    for (const p of v.paliers) expect(p.netFcfa, p.etat).toBe(0);
  });

  it('an ended sale outranks a hold: a refused or refunded sale is not on the Held rung (no commission is left to hold)', () => {
    const lien = { outcome: 'auto_void', signals: ['phone'], contestee: false } as const;
    const v = echelle([vente({ orderId: 'a', refusee: true, lienProche: lien }), vente({ orderId: 'b', state: 'refunded', lienProche: lien })]);
    expect(v.paliers.find((p) => p.etat === 'Held')!.ventes).toBe(0);
    expect(v.retenues).toEqual([]);
    expect([v.refusees, v.remboursees]).toEqual([1, 1]);
  });

  it('the other canon states: before payment and `paid` are Projected; `cancelled` is on no rung, counted with the failed payments', () => {
    for (const state of ['quote_issued', 'reserved', 'paid'] as const) expect(etatPour(state), state).toBe('Projected');
    expect(etatPour('cancelled')).toBeNull();
    expect(echelle([vente({ state: 'cancelled' })]).sansObligation).toBe(1);
  });

  it('FULFILMENT NEWS DOES NOT MOVE MONEY — accepted and ready leave the rung exactly where it was', () => {
    // The money decision this model most needed to get right. « En préparation »
    // and « prête » are Boutik+ facts; B+I-06 makes readiness the PRECONDITION
    // for a pickup being requested, not a delivery. A settlement obligation
    // advances on Séra's validated delivery — which does not flow yet.
    const nu = echelle([vente({ resellerNet: 4_000 })]);
    const prete = echelle([vente({ resellerNet: 4_000, acceptedAt: T, readyAt: T })]);
    expect(prete.paliers).toEqual(nu.paliers);
    expect(prete.paliers.find((p) => p.etat === 'Eligible')!.netFcfa).toBe(0);
  });
});

/* ═══════════════════ the money ═══════════════════ */

describe('SP6.1 — the francs are COPIED and SUMMED, never recomputed (SP-I04)', () => {
  it('several sales on one rung sum to the franc', () => {
    const rows = [
      vente({ orderId: 'a', resellerNet: 1_200 }),
      vente({ orderId: 'b', resellerNet: 3_450 }),
      vente({ orderId: 'c', resellerNet: 7 }),
    ];
    const p = palier(rows, 'Locked');
    expect(p.netFcfa).toBe(4_657);
    expect(p.ventes).toBe(3);
  });

  it('two rungs hold their own sales — one basket never borrows from the other', () => {
    const rows = [
      vente({ orderId: 'a', state: 'confirmed', resellerNet: 5_000 }),
      vente({ orderId: 'b', state: 'payment_pending', resellerNet: 800 }),
    ];
    expect(palier(rows, 'Locked').netFcfa).toBe(5_000);
    expect(palier(rows, 'Projected').netFcfa).toBe(800);
  });

  it('NO GROSS, NO COMMISSION, NO RATE is reachable — `0.80 × (C+M)` is unrepresentable here', () => {
    // SP-I04 forbids a live recomputation, and the guarantee is structural: the
    // only money that enters is `resellerNet`. Asserted on the SHAPE the screen
    // receives, because a field that does not exist cannot be rendered by
    // mistake in some future edit.
    const keys = Object.keys(echelle([vente()]).paliers[0]!);
    for (const banned of ['gross', 'brut', 'commission', 'markup', 'basePrice', 'fee', 'rate']) {
      expect(keys.some((k) => k.toLowerCase().includes(banned)), banned).toBe(false);
    }
    expect(keys).toContain('netFcfa');
  });

  it('the net-first descriptor renders resellerNet FIRST, and the checked-in gate fixture matches it', () => {
    // The `net-first-display` gate reads a checked-in JSON; this is the « no
    // drift » pin the gate's own header asks for — a fixture that stops
    // describing the module is a gate measuring nothing.
    const fixture = JSON.parse(readFileSync('../../gates/fixtures/surfaces/gains-echelle.json', 'utf8'));
    expect(fixture).toEqual(gainsSurface());
    expect(gainsSurface().moneyFieldsInRenderOrder[0]).toBe('resellerNet');
  });
});

/* ═══════════════════ the screen ═══════════════════ */

describe('SP6.1 — the screen says the honest thing in every state', () => {
  it('the five non-ladder states carry no rungs and never a franc', () => {
    for (const kind of ['non_branche', 'verrouille', 'chargement', 'refus', 'hors_ligne'] as const) {
      const e = ecranDesGains({ kind });
      expect(e.paliers, kind).toHaveLength(0);
      expect(e.noticeKeys, kind).toHaveLength(0);
    }
  });

  /** ACCESS-GATE-1 — « Mes gains » was the second code wall. Founder order,
   *  2026-08-04: one door, at the app's entrance. The pin asserts the absence
   *  so the wall cannot come back one `demandeCode` at a time. */
  it('« Mes gains » NEVER asks for a code — no state on this screen carries a door', () => {
    for (const kind of ['verrouille', 'refus', 'chargement', 'hors_ligne', 'non_branche'] as const) {
      expect(Object.keys(ecranDesGains({ kind })), kind).not.toContain('demandeCode');
    }
  });

  it('a DORMANT rung reads « pas encore » — never « aucune vente », which answers a question she did not ask', () => {
    const e = ecranDesGains(vueDesGains([vente()], false));
    const dormantes = e.paliers.filter((p) => p.enSommeil);
    expect(dormantes).toHaveLength(5);
    for (const p of dormantes) expect(p.compteKey, p.etat).toBe('gains.pas_encore');
    // …and a REACHABLE rung with nothing on it says so plainly, which is a
    // different and true sentence.
    expect(e.paliers.find((p) => p.etat === 'Projected')!.compteKey).toBe('gains.aucune_vente');
  });

  it('the count line is singular at one and plural above, with the number carried as a param', () => {
    const un = ecranDesGains(vueDesGains([vente()], false));
    expect(un.paliers.find((p) => p.etat === 'Locked')!.compteKey).toBe('gains.vente_une');
    const trois = ecranDesGains(
      vueDesGains([vente({ orderId: 'a' }), vente({ orderId: 'b' }), vente({ orderId: 'c' })], false),
    );
    const l = trois.paliers.find((p) => p.etat === 'Locked')!;
    expect(l.compteKey).toBe('gains.ventes_n');
    expect(l.compteN).toBe('3');
  });

  it('THE « THIS IS NOT AN ACCOUNT » SENTENCE IS ALWAYS THERE (Ten Laws #2) — full ladder and empty', () => {
    for (const rows of [[], [vente()], [vente({ state: 'payment_failed' })]]) {
      const e = ecranDesGains(vueDesGains(rows, false));
      expect(e.noticeKeys).toContain('gains.pas_de_retrait');
      expect(e.noticeKeys[e.noticeKeys.length - 1]).toBe('gains.pas_de_retrait');
    }
  });

  it('a PARTIAL read and orders without a confirmed payment are both stated, with their number', () => {
    const e = ecranDesGains(vueDesGains([vente({ state: 'payment_failed' }), vente({ orderId: 'b', state: 'payment_failed' })], true));
    expect(e.noticeKeys).toContain('gains.incomplet');
    expect(e.noticeKeys).toContain('gains.sans_obligation');
    expect(e.noticeParams['gains.sans_obligation']).toEqual({ n: '2' });
  });

  it('a COMPLETE read with nothing failed says neither — no notice is invented', () => {
    const e = ecranDesGains(vueDesGains([vente()], false));
    expect(e.noticeKeys).not.toContain('gains.incomplet');
    expect(e.noticeKeys).not.toContain('gains.sans_obligation');
    expect(e.noticeKeys).not.toContain('gains.refusees');
    expect(e.noticeKeys).not.toContain('gains.remboursees');
  });

  it('refused and refunded sales are each SAID, with their number, before the standing sentence', () => {
    const e = ecranDesGains(
      vueDesGains(
        [vente({ orderId: 'a', refusee: true }), vente({ orderId: 'b', refusee: true }), vente({ orderId: 'c', state: 'refunded' })],
        false,
      ),
    );
    expect(e.noticeKeys).toEqual(['gains.refusees', 'gains.remboursees', 'gains.pas_de_retrait']);
    expect(e.noticeParams['gains.refusees']).toEqual({ n: '2' });
    expect(e.noticeParams['gains.remboursees']).toEqual({ n: '1' });
  });
});

/* ═══════════════════ the strings ═══════════════════ */

describe('SP6.1 — every key the screen can emit exists in the catalog (Ten Laws #6)', () => {
  const catalog = JSON.parse(readFileSync('i18n/catalog.json', 'utf8')) as { key: string; register: string }[];
  const known = new Map(catalog.map((e) => [e.key, e]));

  it('every rung key, count key and notice key resolves — and carries the MONEY register', () => {
    const e = ecranDesGains(
      vueDesGains(
        [
          vente(),
          vente({ orderId: 'b', state: 'payment_pending' }),
          vente({ orderId: 'c', state: 'payment_failed' }),
          vente({ orderId: 'd', refusee: true }),
          vente({ orderId: 'e', state: 'refunded' }),
        ],
        true,
      ),
    );
    expect(e.noticeKeys, 'control: the two new lines are in the set checked').toEqual(
      expect.arrayContaining(['gains.refusees', 'gains.remboursees']),
    );
    const keys = new Set<string>([
      e.titreKey,
      ...(e.sousTitreKey === undefined ? [] : [e.sousTitreKey]),
      ...e.noticeKeys,
      ...e.paliers.flatMap((p) => [p.titreKey, p.texteKey, p.compteKey]),
      'gains.etape_absente',
      'gains.pas_encore',
    ]);
    expect(keys.size).toBeGreaterThan(20); // control: the set is not empty
    for (const k of keys) {
      const entry = known.get(k);
      expect(entry, `missing catalog string: ${k}`).toBeDefined();
      // §10.5 — an earnings surface is money-register throughout: calm and
      // precise, never the selling voice.
      expect(entry!.register, k).toBe('money');
    }
  });

  it('the five non-ladder titles resolve too — an honest state with a missing string is a crash', () => {
    // `t()` THROWS on an unknown key in this app, so an unlinted title on the
    // offline path is a white screen exactly when she has no connection.
    for (const kind of ['non_branche', 'verrouille', 'chargement', 'refus', 'hors_ligne'] as const) {
      expect(known.has(ecranDesGains({ kind }).titreKey), kind).toBe(true);
    }
  });
});
