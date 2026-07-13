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

  it('the mockup figures hold (Mariam = §5.4 baseline: net 2 000, son prix 11 500)', () => {
    const nets = allSales().map((s) => s.netFcfa);
    expect(nets).toEqual([1400, 900, 2000, 2400, 1100, 1600]);
    const mariam = allSales().find((s) => s.clientFirstName === 'Mariam O.')!;
    expect(mariam.netFcfa).toBe(2000);
    expect(mariam.sonPrixFcfa).toBe(11500);
  });
});

describe('the order is deterministic — the problems first, then closest-to-door → settled', () => {
  it('orders by the status rank, stable, never a score', () => {
    const statuses = orderedSales().map((s) => s.status);
    expect(statuses).toEqual(['probleme', 'a_la_porte', 'en_route', 'en_preparation', 'payee', 'livree']);
    expect(orderedSales().map((s) => s.id)).toEqual(orderedSales().map((s) => s.id)); // pure
  });
});

describe('SP-I04/SP-I12 — the NET is first; a gross is never rendered', () => {
  it('the list row carries the net (never a gross), and the surface descriptor is net-first', () => {
    const rows = ventesListModel();
    for (const r of rows) expect(typeof r.netFcfa).toBe('number');
    expect(ventesRowSurface().moneyFieldsInRenderOrder[0]).toBe('resellerNet');
    // no gross/commission field on a row, structurally and in the bytes
    for (const r of rows) {
      expect(Object.keys(r)).not.toContain('grossFcfa');
      expect(JSON.stringify(r)).not.toMatch(/gross|commission|marge|fournisseur|supplier|phone|numero|tel_/i);
    }
  });

  it('the detail renders the net BEFORE son prix (net-first), and carries no gross/commission', () => {
    const d = demoDetail();
    expect(ventesDetailSurface().moneyFieldsInRenderOrder).toEqual(['resellerNet', 'customerPrice']);
    // structural: the detail has netFcfa and sonPrixFcfa, no gross/commission field
    expect(Object.keys(d)).toContain('netFcfa');
    expect(Object.keys(d)).toContain('sonPrixFcfa');
    expect(JSON.stringify(d)).not.toMatch(/gross|commission|marge|markup|sellerBase|fournisseur|supplier/i);
  });

  it('the two checked-in net-first surface fixtures are pinned to the presenter', () => {
    const row = JSON.parse(readFileSync(join(appDir, '../../gates/fixtures/surfaces/ventes-row.json'), 'utf8'));
    const detail = JSON.parse(readFileSync(join(appDir, '../../gates/fixtures/surfaces/ventes-detail.json'), 'utf8'));
    expect(ventesRowSurface()).toEqual(row);
    expect(ventesDetailSurface()).toEqual(detail);
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
    const livreeRow = ventesListModel().find((r) => r.status === 'livree')!;
    expect(livreeRow.serverFact).toBe(true);
  });
});

describe('the detail timeline is coarse and honest (steps, never a GPS point)', () => {
  it('Mariam (EN ROUTE) → step 2 is « now », 0–1 done, 3 later', () => {
    const d = demoDetail();
    expect(d.timeline.map((s) => s.phase)).toEqual(['done', 'done', 'now', 'later']);
    expect(d.isProblem).toBe(false);
  });

  it('a settled sale (LIVRÉE) shows every step done; a problem sale flags isProblem', () => {
    const fanta = allSales().find((s) => s.status === 'livree')!;
    expect(ventesDetailModel(fanta).timeline.map((s) => s.phase)).toEqual(['done', 'done', 'done', 'now']);
    const fatou = allSales().find((s) => s.status === 'probleme')!;
    expect(ventesDetailModel(fatou).isProblem).toBe(true);
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
