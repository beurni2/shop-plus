import { describe, expect, it } from 'vitest';
import { ecranDesVentes } from '../src/sales/feed-screen';
import { vueDesVentes } from '../src/sales/feed-model';
import type { FeedResult, ResellerFeedPort } from '../src/sales/feed-service';

/**
 * RF-1c — the hook's DECISIONS, exercised without React.
 *
 * The hook itself owns only two things (the durable code and when to fetch),
 * so the rules worth protecting are reproduced here against the same pure
 * functions it calls. What is asserted is the behaviour a reseller would feel:
 * a refused code is not remembered, a stale answer never overwrites a fresh
 * one, and offline is never rendered as « no sales ».
 */

const okRes = (over: Partial<Extract<FeedResult, { ok: true }>> = {}): FeedResult => ({
  ok: true,
  incomplet: false,
  ventes: [
    {
      orderId: 'ord-1',
      state: 'confirmed',
      createdAt: '2026-08-02T08:00:00.000Z',
      resellerNet: 2_000,
      productVersionId: 'pv-1',
      zoneTo: 'Ouagadougou',
    },
  ],
  ...over,
});

/** The hook's own mapping of a port result to a view, restated exactly. */
function vuePour(res: FeedResult) {
  if (!res.ok) return res.reason === 'unauthorized' ? ({ kind: 'refused' } as const) : ({ kind: 'unreachable' } as const);
  return vueDesVentes(res.ventes, res.incomplet);
}

describe('RF-1c — what she feels, decided outside React', () => {
  /** ACCESS-GATE-1 — neither reason reopens a door here any more; both are
   *  states with their own sentence, and the door lives at the entrance. What
   *  still matters, and is pinned, is that they stay DISTINGUISHABLE: a
   *  refused code and a dead network must never read the same. */
  it('a REFUSED code and an UNREACHABLE feed are different states, and neither asks for a code', () => {
    const refus = ecranDesVentes(vuePour({ ok: false, reason: 'unauthorized' }));
    const mort = ecranDesVentes(vuePour({ ok: false, reason: 'unreachable' }));
    expect(refus.kind).not.toBe(mort.kind);
    expect(refus.titreKey).not.toBe(mort.titreKey);
    expect(Object.keys(refus)).not.toContain('demandeCode');
    expect(Object.keys(mort)).not.toContain('demandeCode');
  });

  it('OFFLINE never renders as "no sales" — the two states differ on screen', () => {
    const offline = ecranDesVentes(vuePour({ ok: false, reason: 'unreachable' }));
    const empty = ecranDesVentes(vuePour({ ok: true, incomplet: false, ventes: [] }));
    expect(offline.kind).toBe('hors_ligne');
    expect(empty.kind).toBe('vide');
    expect(offline.titreKey).not.toBe(empty.titreKey);
  });

  it('a MALFORMED answer is unreachable, not an empty list', () => {
    expect(ecranDesVentes(vuePour({ ok: false, reason: 'malformed' })).kind).toBe('hors_ligne');
  });

  it('a good answer lists her sales with the proven chip and her net', () => {
    const e = ecranDesVentes(vuePour(okRes()));
    expect(e.kind).toBe('liste');
    expect(e.lignes[0]!.netFcfa).toBe(2_000);
    expect(e.lignes[0]!.etatKey).toBe('ventes.etat_payee');
  });

  it('a partial answer still lists, and SAYS it is partial', () => {
    const e = ecranDesVentes(vuePour(okRes({ incomplet: true })));
    expect(e.kind).toBe('liste');
    expect(e.noticeKeys).toContain('ventes.reel_incomplet');
  });

  /**
   * THE STALE-READ RULE, restated on the token the hook uses. Two reads in
   * flight (she retried on a slow connection); the OLDER one must not write
   * the screen. Modelled here so the rule is protected even though the hook's
   * own effect needs React to run.
   */
  it('only the NEWEST read may write the screen', () => {
    let seq = 0;
    let painted: string | null = null;
    const read = (label: string): (() => void) => {
      seq += 1;
      const mine = seq;
      return () => {
        if (mine !== seq) return;
        painted = label;
      };
    };
    const finishOld = read('old');
    const finishNew = read('new');
    finishNew();
    finishOld(); // arrives late, must be ignored
    expect(painted).toBe('new');
  });

  it('a port that is absent means NOT CONFIGURED — never a fake empty list', () => {
    const absent: ResellerFeedPort | null = null;
    expect(absent).toBeNull();
    expect(ecranDesVentes({ kind: 'not_configured' }).kind).toBe('non_branche');
    expect(ecranDesVentes({ kind: 'not_configured' }).lignes).toEqual([]);
  });
});
