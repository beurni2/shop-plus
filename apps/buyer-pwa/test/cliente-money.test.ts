import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fmtFCFA, groupFr } from '../src/cliente/money';
import { composeQuote, ROBE, clienteProduitReel } from '../src/cliente/seed';
import {
  renderC1, renderC3, renderC4, renderC5, renderC6, renderC7, renderC8, renderC9,
  renderSheet, renderSkeleton, renderOffline,
  payezMaintenant, CODE_REMISE,
  type C3State,
} from '../src/cliente/screens';

/**
 * PWA CLIENTE — the money-bytes discipline (HANDOFF Indigo §0 décret) + the
 * buyer-economics wall.
 *
 * These lock the non-negotiable: every amount carries U+202F between thousands
 * AND before FCFA; the byte comes from the escaped constant (never a raw
 * U+202F laundered into a file — expected values here are built from the same
 * escape); no amount uses a bare « F » or a breakable space; the quote is
 * server-frozen (render-only — the §3.2 decree bytes reproduce exactly); no
 * purchase-side economics term ever reaches a buyer surface; and the drop
 * code never renders before its leg is confirmed.
 */

const N = '\u202f'; // the only NNBSP source in this test — no raw byte in the file

const Q = composeQuote(ROBE.priceFcfa);

const C3_BASE: C3State = { zone: 'Gounghin', repere: 'Face à la pharmacie du marché', indic: '', voice: 'idle', recTime: '0:00', canContinue: true };

describe('fmt — byte-exact NNBSP (U+202F, built from \\u202f)', () => {
  it('fmtFCFA groups thousands with U+202F and suffixes [NNBSP]FCFA', () => {
    expect(fmtFCFA(11_500)).toBe(`11${N}500${N}FCFA`);
    expect(fmtFCFA(1_000)).toBe(`1${N}000${N}FCFA`);
    expect(fmtFCFA(800)).toBe(`800${N}FCFA`);
    expect(fmtFCFA(12_500)).toBe(`12${N}500${N}FCFA`);
    expect(fmtFCFA(12_300)).toBe(`12${N}300${N}FCFA`);
  });
  it('groupFr groups without the FCFA suffix (band + reconciliation decomposition)', () => {
    expect(groupFr(11_500)).toBe(`11${N}500`);
    expect(groupFr(999_999)).toBe(`999${N}999`);
    expect(groupFr(800)).toBe('800');
  });
});

describe('source discipline — zero raw U+202F laundered into ANY app source (PWA-CLEANUP-1 §3)', () => {
  // Recursive: every .ts/.css under src/ + the i18n catalog. A raw byte gets
  // laundered by editors; only the \\u202f escape survives review.
  const srcRoot = join(import.meta.dirname, '..', 'src');
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|css)$/.test(e.name) ? [join(dir, e.name)] : [],
    );
  const files = [...walk(srcRoot), join(import.meta.dirname, '..', 'i18n', 'catalog.json')];
  for (const f of files) {
    it(`${f.slice(f.indexOf('src') >= 0 && f.includes('/src/') ? f.indexOf('/src/') + 1 : f.lastIndexOf('/') + 1)} carries no raw U+202F byte`, () => {
      const src = readFileSync(f, 'utf8');
      const raw = [...src].filter((c) => c.codePointAt(0) === 0x202f).length;
      expect(raw, `${f} has a raw U+202F — use the \\u202f escape / fmt helpers`).toBe(0);
    });
  }
  it('money.ts builds the NNBSP from the \\u202f escape', () => {
    const src = readFileSync(join(srcRoot, 'cliente', 'money.ts'), 'utf8');
    expect(src).toContain("'\\u202f'");
  });
  it('NO module anywhere in src/ uses Intl.NumberFormat (one formatter, ICU byte drift)', () => {
    for (const f of walk(srcRoot)) {
      const src = readFileSync(f, 'utf8');
      expect(src.includes('Intl.NumberFormat('), `${f} uses Intl.NumberFormat`).toBe(false);
    }
  });
});

describe('the quote is server-frozen — §3.2 decree bytes, render-only', () => {
  it('composeQuote(11 500) reproduces the decree to the franc', () => {
    expect(Q).toEqual({ produitFcfa: 11_500, feeToday: 1_000, feeTomorrow: 800, totalToday: 12_500, totalTomorrow: 12_300 });
  });
  it('payezMaintenant reads the frozen fields per mode (A = total, B = frais)', () => {
    expect(payezMaintenant(Q, 'today', 'A')).toBe(12_500);
    expect(payezMaintenant(Q, 'tomorrow', 'A')).toBe(12_300);
    expect(payezMaintenant(Q, 'today', 'B')).toBe(1_000);
    expect(payezMaintenant(Q, 'tomorrow', 'B')).toBe(800);
  });
  it('the C5 reconciliation line is byte-exact for BOTH fees (§3.2)', () => {
    const today = renderC5(ROBE, Q, { delivery: 'today', pay: null, paying: 'idle', bInel: false });
    expect(today).toContain(`12${N}500 = 11${N}500 + 1${N}000 — chaque franc a sa place.`);
    const tomorrow = renderC5(ROBE, Q, { delivery: 'tomorrow', pay: null, paying: 'idle', bInel: false });
    expect(tomorrow).toContain(`12${N}300 = 11${N}500 + 800 — chaque franc a sa place.`);
  });
});

/** Strip SVG bodies + tags; drop the C9 drop-code figure (« 734 921 » is a
 * code with a plain space per the pixel source — not an amount). */
function visibleText(html: string): string {
  return html
    .replace(/<div class="cl-code-figure">[^<]*<\/div>/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

describe('every rendered amount carries the money bytes; no bare F, no breakable space', () => {
  const screens: Array<[string, string]> = [
    ['C1', renderC1(ROBE, { epuise: false, sansVoix: false })],
    ['C1-épuisé', renderC1({ ...ROBE, inStock: false }, { epuise: true, sansVoix: false })],
    ['C1-sans-voix', renderC1(ROBE, { epuise: false, sansVoix: true })],
    ['C3-idle', renderC3(C3_BASE)],
    ['C3-recording', renderC3({ ...C3_BASE, voice: 'recording', recTime: '0:07' })],
    ['C3-recorded', renderC3({ ...C3_BASE, voice: 'recorded', recTime: '0:07' })],
    ['C3-queued', renderC3({ ...C3_BASE, voice: 'queued' })],
    ['C3-refused', renderC3({ ...C3_BASE, voice: 'refused' })],
    ['C4', renderC4(Q, { zone: 'Gounghin', repereRecap: 'Face à la pharmacie du marché', delivery: 'today' })],
    ['C5-choix-today', renderC5(ROBE, Q, { delivery: 'today', pay: 'B', paying: 'idle', bInel: false })],
    ['C5-choix-tomorrow', renderC5(ROBE, Q, { delivery: 'tomorrow', pay: 'A', paying: 'idle', bInel: false })],
    ['C5-inel', renderC5(ROBE, Q, { delivery: 'today', pay: 'A', paying: 'idle', bInel: true })],
    ['C5-envoi', renderC5(ROBE, Q, { delivery: 'today', pay: 'B', paying: 'submitting', bInel: false })],
    ['C5-opérateur', renderC5(ROBE, Q, { delivery: 'today', pay: 'B', paying: 'provider', bInel: false })],
    ['C6-confirmée', renderC6(ROBE, { confirmState: 'confirmed', payNowStr: fmtFCFA(1_000) })],
    ['C6-attente', renderC6(ROBE, { confirmState: 'pending', payNowStr: fmtFCFA(1_000) })],
    ['C6-hors-ligne', renderC6(ROBE, { confirmState: 'offline', payNowStr: fmtFCFA(1_000) })],
    ['C7', renderC7({ step: 2, problem: false, demo: true })],
    ['C7-problème', renderC7({ step: 5, problem: true, demo: true })],
    ['C8-inspection', renderC8(ROBE, Q, { door: 'inspecting', pay: 'B', reason: null })],
    ['C8-paiement', renderC8(ROBE, Q, { door: 'accepted', pay: 'B', reason: null })],
    ['C8-signalement', renderC8(ROBE, Q, { door: 'report', pay: 'B', reason: 'Il est abîmé' })],
    ['C9-caché', renderC9({ revealed: false })],
    ['C9-révélé', renderC9({ revealed: true })],
    ['C2-sheet', renderSheet()],
    ['squelette', renderSkeleton()],
    ['hors-ligne-bandeau', renderOffline()],
  ];
  for (const [name, html] of screens) {
    it(`${name}: every « FCFA » is preceded by U+202F; thousands never use space/NBSP`, () => {
      expect(html, `${name} has a « FCFA » not preceded by U+202F`).not.toMatch(/(?<!\u202f)FCFA/);
      const text = visibleText(html);
      expect(text, `${name} groups an amount with a space/NBSP`).not.toMatch(/\d[\u0020\u00a0]\d{3}(?!\d)/);
      // the bare-« F » assertion itself (verifier finding — a claim without a
      // bite is failure mode 7): a digit followed by any spacing then a lone F
      // (not FCFA) must never render.
      expect(text, `${name} renders a bare « F » suffix`).not.toMatch(/\d[\u202f\u0020\u00a0]?F(?![A-Za-z])/);
    });
    it(`${name}: no purchase-side economics term reaches the buyer (§0)`, () => {
      const low = html.toLowerCase();
      for (const term of ['coût', 'marge', 'fournisseur', ' net ', '>net<']) {
        expect(low.includes(term), `${name} leaks « ${term.trim()} »`).toBe(false);
      }
    });
  }
  it('C1 shows the signed price 11 500 in the band with the [NNBSP]FCFA suffix', () => {
    const c1 = renderC1(ROBE, { epuise: false, sansVoix: false });
    expect(c1).toContain(`>11${N}500</span>`);
    expect(c1).toContain(`>${N}FCFA</span>`);
  });
  it('C8 mode B owes exactly the frozen product amount at the door', () => {
    const c8 = renderC8(ROBE, Q, { door: 'inspecting', pay: 'B', reason: null });
    expect(c8).toContain(`11${N}500${N}FCFA`);
    // mode A owes nothing — the band must not render.
    expect(renderC8(ROBE, Q, { door: 'inspecting', pay: 'A', reason: null })).not.toContain('Reste à payer');
  });
});

describe('« Le code de remise fait foi » — never rendered before confirmation', () => {
  it('C9 caché carries no drop code anywhere in its markup', () => {
    const hidden = renderC9({ revealed: false });
    expect(hidden).not.toContain(CODE_REMISE);
    expect(hidden).toContain('••• •••');
    expect(hidden).toContain('Jamais avant.');
  });
  it('C9 révélé shows the pixel code (espace simple — a code, not an amount)', () => {
    const revealed = renderC9({ revealed: true });
    expect(revealed).toContain(`>${CODE_REMISE}</div>`);
    expect(CODE_REMISE).toBe('734 921');
  });
});

describe('the real signed link maps HER real product — never the demo robe (BUG 3 law)', () => {
  const SF = { name: 'Chez Aïcha Mode', slug: 'aicha-4821', theme: 'laterite' as const, zone: 'Rood Woko · Ouagadougou' };
  it('a real product renders as itself, price render-only', () => {
    const { produit, theme } = clienteProduitReel(
      SF,
      { pid: 'p2', name: 'Pagne wax 6 yards', priceFcfa: 20_500, inStock: true, art: ['#146152', '#0A3A31'], glyph: 'tissu' },
      undefined,
    );
    expect(theme).toBe('laterite');
    expect(produit.productName).toBe('Pagne wax 6 yards');
    expect(produit.priceFcfa).toBe(20_500);
    expect(produit.voiceDuree).toBeUndefined();
    const c1 = renderC1(produit, { epuise: !produit.inStock, sansVoix: produit.voiceDuree === undefined });
    expect(c1).toContain('Pagne wax 6 yards');
    expect(c1).toContain(`>20${N}500</span>`);
    expect(c1).not.toContain('Robe brodée bogolan');
    // and its quote reconciles to the franc off the frozen composition.
    const q = composeQuote(20_500);
    const c5 = renderC5(produit, q, { delivery: 'today', pay: null, paying: 'idle', bInel: false });
    expect(c5).toContain(`21${N}500 = 20${N}500 + 1${N}000 — chaque franc a sa place.`);
  });
  it('a ready voice note carries its real duration into the C1 player', () => {
    const { produit } = clienteProduitReel(
      SF,
      { pid: 'p1', name: 'Robe brodée bogolan', priceFcfa: 11_500, inStock: true, art: ['#B65C2E', '#7A3014'], glyph: 'robe' },
      { status: 'ready', url: 'blob:demo', durationMs: 12_000 },
    );
    expect(produit.voiceDuree).toBe('0:12');
  });
});
