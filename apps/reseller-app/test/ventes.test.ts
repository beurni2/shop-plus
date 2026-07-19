import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeWaterfall, assertQuoteReconciles } from '@platform/contracts';
import {
  allSales,
  orderedSales,
  ventesListModel,
  ventesDetailModel,
  demoDetail,
  statusIsServerFact,
  ventesRowSurface,
  ventesDetailSurface,
  type Sale,
  type SaleStatus,
  netPaye,
  enAttenteNet,
  payeSemaine,
} from '../src/sales/ventes.js';

/**
 * WO-7.2a — S7 MES VENTES. The money laws: the net is first (never a gross),
 * every franc reconciles through the pinned waterfall, the commission is
 * unrepresentable, no supplier, first name only (the client's number never
 * exists), problems first, LIVRÉE is a server fact. RN source-discipline: these
 * presenter tests are the evidence (no renderer, per the B1/B2 convention).
 */

const appDir = join(import.meta.dirname, '..');
const catalog = JSON.parse(readFileSync(join(appDir, 'i18n/catalog.json'), 'utf8')) as Array<{ key: string }>;
const keys = new Set(catalog.map((e) => e.key));

describe('the money reconciles to the franc — every sale IS the pinned waterfall', () => {
  it('net = resellerNet(input); son prix = productSubtotal(input); nothing hand-authored', () => {
    for (const s of allSales()) {
      const w = computeWaterfall(s.input);
      expect(() => assertQuoteReconciles(w)).not.toThrow();
      expect(s.netFcfa, `${s.clientFirstName} net drifted`).toBe(w.resellerNet);
      expect(s.sonPrixFcfa, `${s.clientFirstName} son prix drifted`).toBe(w.productSubtotal);
      // net is 0.8·(C+M) — the honest 20 % fee is never added to her price
      expect(s.netFcfa).toBe(w.resellerGrossEarnings - w.resellerPlatformFee);
    }
  });

  it('the CERCLE o-world figures hold (§3.1 + §0.2.a): o1 net 2 000 · camp 600 · net versé 1 400; totals 4 840 / 2 800', () => {
    const nets = allSales().map((s) => s.netFcfa);
    expect(nets).toEqual([2160, 1640, 3440, 2000, 2800]);
    const o1 = allSales().find((s) => s.code === 'CMD-2417')!;
    expect(o1.clientFirstName).toBe('Awa');
    expect(o1.netFcfa).toBe(2000);
    expect(o1.sonPrixFcfa).toBe(11500);
    expect(o1.campFcfa).toBe(600); // §0.2.a — camp FROZEN at attribution
    expect(netPaye(o1)).toBe(1400); // net versé = net − camp
    // every non-campaign order carries camp 0 (one offer per order, loi 7)
    for (const s2 of allSales()) if (s2.code !== 'CMD-2417') expect(s2.campFcfa).toBe(0);
    // D4a — the Gains aggregates (En attente excludes problems + settled)
    expect(enAttenteNet()).toBe(4840);
    expect(payeSemaine()).toBe(2800);
  });
});

describe('the order is deterministic — the problems first, then closest-to-door → settled', () => {
  it('orders by the status rank, stable, never a score', () => {
    const statuses = orderedSales().map((s) => s.status);
    expect(statuses).toEqual(['probleme', 'probleme', 'en_route', 'en_preparation', 'payee']);
    expect(orderedSales().map((s) => s.code)).toEqual(['CMD-2411', 'CMD-2398', 'CMD-2413', 'CMD-2417', 'CMD-2409']);
    expect(orderedSales().map((s) => s.id)).toEqual(orderedSales().map((s) => s.id)); // pure
  });
});

describe('SP-I04/SP-I12 — the NET is first; commission/supplier stay unrepresentable', () => {
  it('the list row carries the net (never a gross), and the surface descriptor is net-first', () => {
    for (const r of ventesListModel()) {
      expect(r.netFcfa).toBeGreaterThan(0);
      expect(Object.keys(r)).not.toContain('brutFcfa');
    }
    expect(ventesRowSurface().moneyFieldsInRenderOrder).toEqual(['resellerNet']);
  });

  it('the detail is NET-FIRST (D3-era law): net hero first, the brut/frais/−Cercle derivation UNDER it; commission/supplier unrepresentable', () => {
    const d = demoDetail();
    // the descriptor renders resellerNet FIRST — the gate's mechanical law
    expect(ventesDetailSurface().moneyFieldsInRenderOrder[0]).toBe('resellerNet');
    expect(ventesDetailSurface().moneyFieldsInRenderOrder).toEqual(['resellerNet', 'campContribution', 'customerPrice']);
    // the derivation is DERIVED from the pinned waterfall, never hand-authored
    expect(d.brutFcfa).toBe(d.netFcfa + d.fraisFcfa);
    // commission / supplier / marge vocabulary stays unrepresentable
    expect(JSON.stringify(d)).not.toMatch(/commission|fournisseur|supplier|sellerBase|markup|marge/i);
  });
});

describe('the client is a first name only — her number never exists (relais masqué)', () => {
  it('a sale carries a first name and no phone/number field anywhere', () => {
    for (const s of allSales()) {
      expect(s.clientFirstName).toBeTruthy();
      expect(Object.keys(s)).not.toContain('phone');
      expect(Object.keys(s)).not.toContain('clientPhone');
    }
    // the relay line is the only place a « numéro » is mentioned — as absent
    expect(keys.has('ventes.relais')).toBe(true);
  });
});

describe('LIVRÉE is a server fact — never a green lie before the operator', () => {
  it('only livree reads as a server fact; the row marks it', () => {
    const statuses: SaleStatus[] = ['probleme', 'a_la_porte', 'en_route', 'en_preparation', 'payee', 'livree'];
    for (const st of statuses) expect(statusIsServerFact(st)).toBe(st === 'livree');
    // the o-world seed carries no LIVRÉE row — no row may claim the server fact
    for (const r of ventesListModel()) expect(r.serverFact).toBe(false);
  });
});

describe('the detail timeline is coarse and honest (steps, never a GPS point)', () => {
  it('o1 CMD-2417 (À préparer) → step 1 is « now »; the demo detail IS the D3 porteur', () => {
    const d = demoDetail();
    expect(d.code).toBe('CMD-2417');
    expect(d.timeline.map((s) => s.phase)).toEqual(['done', 'now', 'later', 'later']);
    expect(d.isProblem).toBe(false);
    // D3 — the derivation the detail renders UNDER the net hero (net-first):
    expect(d.brutFcfa).toBe(2500);
    expect(d.fraisFcfa).toBe(500);
    expect(d.campFcfa).toBe(600);
    expect(d.netPayeFcfa).toBe(1400);
  });

  it('an en-route sale walks the steps; a problem sale flags isProblem', () => {
    const o7 = allSales().find((s) => s.code === 'CMD-2413')!;
    expect(ventesDetailModel(o7).timeline.map((s) => s.phase)).toEqual(['done', 'done', 'now', 'later']);
    const o3 = allSales().find((s) => s.code === 'CMD-2411')!;
    expect(ventesDetailModel(o3).isProblem).toBe(true);
    // a non-campaign detail renders NO contribution (camp 0 ⇒ line absent)
    expect(ventesDetailModel(o7).campFcfa).toBe(0);
  });
});

describe('every one of the seven states has its designed strings in the catalog', () => {
  it('list · empty · skeleton · problème · détail · offline · error strings all resolve', () => {
    const required = [
      'ventes.titre', // list
      'ventes.vide_titre', 'ventes.vide_hint', 'ventes.vide_action', // empty
      'ventes.probleme_encart', 'ventes.probleme_action', 'ventes.probleme_rien', // problème ouvert
      'vente.net_label', 'vente.net_regle', 'vente.son_prix', 'vente.timeline_titre', // détail
      'vente.etape_payee', 'vente.etape_scellee', 'vente.etape_en_route', 'vente.etape_livree', 'vente.maintenant',
      'ventes.hors_ligne', 'ventes.hors_ligne_pied', 'ventes.titre_hier', // offline
      'ventes.erreur_titre', 'ventes.erreur_hint', 'ventes.reessayer', // error
    ];
    for (const k of required) expect(keys.has(k), `catalog missing ${k}`).toBe(true);
  });

  it('the empty state model is honest (no sales → an empty list, never a fake row)', () => {
    expect(ventesListModel([] as Sale[])).toEqual([]);
  });
});
