import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fmtFCFA, groupFr } from '../src/cliente/money';
import { composeQuote, ROBE, clienteProduitReel } from '../src/cliente/seed';
import {
  INSPECTION,
  INSPECTION_PRUDENTE,
  inspectionPour,
renderC1, renderC3, renderC4, renderC5, renderC6, renderC7, renderC8, renderC9,
  renderSheet, renderSkeleton, renderOffline,
  splitFor, CODE_REMISE,
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

const C3_BASE: C3State = { zone: 'Gounghin', repere: 'Face à la pharmacie du marché', indic: '', phone: '70 12 34 56', voice: 'idle', recTime: '0:00', canContinue: true };

/** Tags out, NOTHING inserted — the concatenated text a buyer reads. */
const stripTags = (html: string): string => html.replace(/<[^>]+>/g, '');

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
  it('NO module anywhere in src/ uses ICU number formatting (Intl.NumberFormat OR toLocaleString — verifier finding: the same machinery, the same byte drift)', () => {
    for (const f of walk(srcRoot)) {
      const src = readFileSync(f, 'utf8');
      expect(src.includes('Intl.NumberFormat('), `${f} uses Intl.NumberFormat`).toBe(false);
      expect(src.includes('.toLocaleString('), `${f} uses toLocaleString (ICU by another door)`).toBe(false);
    }
  });
});

describe('the quote is server-frozen — §3.2 decree bytes, render-only', () => {
  it('composeQuote(11 500) reproduces the decree to the franc', () => {
    expect(Q).toEqual({
      produitFcfa: 11_500, feeToday: 1_000, feeTomorrow: 800, totalToday: 12_500, totalTomorrow: 12_300,
      // SP3.3b1 — the §6.1 splits the mock service composes for each leg. Still
      // an EXACT match: a field added to the frozen quote fails right here.
      splitsToday: { A: { paidNow: 12_500, dueAtDelivery: 0 }, B: { paidNow: 1_000, dueAtDelivery: 11_500 } },
      splitsTomorrow: { A: { paidNow: 12_300, dueAtDelivery: 0 }, B: { paidNow: 800, dueAtDelivery: 11_500 } },
    });
  });
  it('SP3.3b2 — the paid-now figure is the SERVER\'s carried split, per mode and per leg', () => {
    // This replaces the `payezMaintenant` pin. That function encoded the
    // CLIENT'S rule (« A pays the total, B pays the fee ») and is gone; what
    // must hold now is that the figure comes from the quote's own split
    // fields. On THIS quote the two happen to agree to the franc — which is
    // exactly why the old test could never have caught the rule diverging.
    expect(splitFor(Q, 'today', 'A').paidNow).toBe(12_500);
    expect(splitFor(Q, 'tomorrow', 'A').paidNow).toBe(12_300);
    expect(splitFor(Q, 'today', 'B')?.paidNow).toBe(1_000);
    expect(splitFor(Q, 'tomorrow', 'B')?.paidNow).toBe(800);
  });
  it('the C5 reconciliation line is byte-exact for BOTH fees (§3.2)', () => {
    // READ AS THE BUYER READS IT — tags removed, nothing else. The promise
    // clause is its own no-wrap element since SP3.3b1 (it was being stranded on
    // a line of its own at 360px), so the markup no longer carries the sentence
    // as one contiguous run; the TEXT is byte-identical and that is the claim.
    const today = renderC5(ROBE, Q, { delivery: 'today', pay: null, paying: 'idle', bInel: false });
    expect(stripTags(today)).toContain(`12${N}500 = 11${N}500 + 1${N}000 — chaque franc a sa place.`);
    const tomorrow = renderC5(ROBE, Q, { delivery: 'tomorrow', pay: null, paying: 'idle', bInel: false });
    expect(stripTags(tomorrow)).toContain(`12${N}300 = 11${N}500 + 800 — chaque franc a sa place.`);
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
    ['C6-confirmée', renderC6(ROBE, { confirmState: 'confirmed', paid: splitFor(Q, 'today', 'B') })],
    ['C6-attente', renderC6(ROBE, { confirmState: 'pending', paid: splitFor(Q, 'today', 'B') })],
    ['C6-hors-ligne', renderC6(ROBE, { confirmState: 'offline', paid: splitFor(Q, 'today', 'B') })],
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
  it('C8 mode B owes exactly the SERVER\u2019S due-at-door byte', () => {
    // SP4.2b — the figure now comes from the server's split for her mode, not
    // from `produitFcfa` re-read as if the two were the same thing. They are
    // equal by §5.5 today; the screen must follow the SPLIT if that changes.
    const c8 = renderC8(ROBE, Q, { door: 'inspecting', pay: 'B', reason: null, duAlaPorte: 11_500 });
    expect(c8).toContain(`11${N}500${N}FCFA`);
    // mode A owes nothing — the band must not render.
    expect(renderC8(ROBE, Q, { door: 'inspecting', pay: 'A', reason: null, duAlaPorte: 0 })).not.toContain('Reste à payer');
  });

  it('NO SPLIT ⇒ NO FIGURE — the door band vanishes rather than guess', () => {
    // The same rule C5 and C6 obey: `undefined` is a state with no amount,
    // never a state with a fallback one.
    const c8 = renderC8(ROBE, Q, { door: 'inspecting', pay: 'B', reason: null, duAlaPorte: undefined });
    expect(c8).not.toContain('Reste à payer');
    expect(c8).not.toContain('FCFA');
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
      { pid: 'p2', name: 'Pagne wax 6 yards', priceFcfa: 20_500, inStock: true, assetRefs: [] },
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
    expect(stripTags(c5)).toContain(`21${N}500 = 20${N}500 + 1${N}000 — chaque franc a sa place.`);
  });
  it('a ready voice note carries its real duration into the C1 player', () => {
    const { produit } = clienteProduitReel(
      SF,
      { pid: 'p1', name: 'Robe brodée bogolan', priceFcfa: 11_500, inStock: true, assetRefs: [] },
      { status: 'ready', url: 'blob:demo', durationMs: 12_000 },
    );
    expect(produit.voiceDuree).toBe('0:12');
  });
});

/* ═══════════ §6.2 — THE CATEGORY INSPECTION MATRIX, ROW BY ROW ═══════════ */

describe('§6.2 — each category allows its OWN checks, and refuses its OWN reasons', () => {
  const ROWS = ['fashion_bags_fabrics', 'shoes', 'sealed_beauty_cosmetics'] as const;

  it('the three MVP rows are EXACTLY §6.2’s — no fourth, and electronics is absent', () => {
    // §6.2: « Electronics/complex — EXCLUDED from MVP ». Absent by decision,
    // not by oversight, and a fourth row would be a taxonomy this repo does not
    // get to invent (the category floor is an open founder decision).
    expect(Object.keys(INSPECTION).sort()).toEqual([...ROWS].sort());
    expect(INSPECTION['electronics']).toBeUndefined();
  });

  it('an UNKNOWN or ABSENT category falls to the conservative row — never a guess', () => {
    expect(inspectionPour(undefined)).toBe(INSPECTION_PRUDENTE);
    for (const unknown of ['', 'mode', 'electronics', 'Shoes', 'FASHION_BAGS_FABRICS']) {
      expect(inspectionPour(unknown), unknown).toBe(INSPECTION_PRUDENTE);
    }
  });

  it('shoes ask for the PAIR and the box; cosmetics ask for the SEAL and the date', () => {
    // The rows genuinely differ — the defect this closes was all three showing
    // the same three lines whatever she had bought.
    const shoes = INSPECTION['shoes']!.verifier.join(' · ');
    expect(shoes).toContain('boîte');
    expect(shoes).toContain('pieds');
    const seal = INSPECTION['sealed_beauty_cosmetics']!.verifier.join(' · ');
    expect(seal).toContain('scellé');
    expect(seal).toContain('date');
    // …and cosmetics must NOT invite her to open it — §6.2 is « outer only ».
    expect(seal).toContain('sans l’ouvrir');
  });

  it('EVERY ROW STATES WHAT IS AT HER OWN RISK — §6.2’s third column, before she chooses', () => {
    for (const row of [...ROWS.map((r) => INSPECTION[r]!), INSPECTION_PRUDENTE]) {
      expect(row.risque.length).toBeGreaterThan(0);
    }
    // The three §6.2 names it: no try-on · wearing = buyer risk · opening the seal.
    expect(INSPECTION['fashion_bags_fabrics']!.risque).toContain('essayer');
    expect(INSPECTION['shoes']!.risque).toContain('portez');
    expect(INSPECTION['sealed_beauty_cosmetics']!.risque).toContain('scellé');
  });

  it('NO BUYER-RISK ITEM IS EVER OFFERED AS A VALID REFUSAL — the invariant of the third column', () => {
    // §6.2 separates « valid rejection » from « Buyer-risk (not valid) ». A
    // refusal button for something that will be judged buyer-fault is a trap:
    // she taps it, the package goes back, and the fault is hers.
    const interdits = [/essay/i, /coupe/i, /taille qui/i, /pointure qui/i, /port[eé]/i, /ouvert par vous/i];
    for (const key of ROWS) {
      for (const motif of INSPECTION[key]!.motifs) {
        for (const piege of interdits) {
          expect(piege.test(motif), `${key} offers « ${motif} » as a valid refusal`).toBe(false);
        }
      }
    }
  });

  it('C8 RENDERS THE ROW — the shoe buyer is asked about her pair, not about a colour', () => {
    const shoe = renderC8({ ...ROBE, category: 'shoes' }, Q, {
      door: 'inspecting', pay: 'B', reason: null, duAlaPorte: 11_500,
    });
    expect(shoe).toContain('Ouvrez la boîte');
    expect(shoe).not.toContain('La bonne couleur');

    const cosm = renderC8({ ...ROBE, category: 'sealed_beauty_cosmetics' }, Q, {
      door: 'inspecting', pay: 'B', reason: null, duAlaPorte: 11_500,
    });
    expect(cosm).toContain('scellé du fabricant');
    expect(cosm).not.toContain('Ouvrez la boîte');
  });

  it('…and the REFUSAL screen offers that row’s reasons, not the generic three', () => {
    const shoe = renderC8({ ...ROBE, category: 'shoes' }, Q, {
      door: 'report', pay: 'B', reason: null, duAlaPorte: 11_500,
    });
    expect(shoe).toContain('Ce n’est pas la bonne pointure');
    expect(shoe).toContain('Il manque une chaussure');
    expect(shoe).not.toContain('Il manque quelque chose');
  });

  it('a product with NO category still gets a usable screen — three checks and three reasons', () => {
    const plain = renderC8(ROBE, Q, { door: 'inspecting', pay: 'B', reason: null, duAlaPorte: 11_500 });
    expect(plain).toContain('C’est le bon article');
    expect(plain).toContain('En bon état');
    // and it claims nothing category-specific
    expect(plain).not.toContain('scellé');
    expect(plain).not.toContain('boîte');
  });
});

/* ═════════════ BC-1b — the dispatch contact, captured once on C3 ═════════════ */

describe('BC-1b — her number for the delivery: asked once, gated, sent at order time', () => {
  it('renderC3 asks for the number with its cause stated, beside the privacy line it must keep true', () => {
    const html = renderC3({ ...C3_BASE, phone: '' });
    expect(html).toContain('data-role="phone"');
    expect(html).toContain('type="tel"');
    expect(html).toContain('Votre numéro, pour la livraison');
    // the standing promise stays on the same screen as the field it covers
    expect(stripTags(html)).toContain('Votre numéro reste privé.');
  });

  it('[source-text checks] the flow gates C3 on a dialable number, assembles the contact from what she ALREADY gave, and sends it exactly once — at order creation', () => {
    const flow = readFileSync(join(import.meta.dirname, '..', 'src/cliente/flow.ts'), 'utf8');
    // ≥ 8 digits judged on digits alone — spaces and prefixes welcome
    expect(flow).toContain("(state.phone.match(/[0-9]/g) ?? []).length >= 8");
    expect(flow).toMatch(/const canC3 = \(\): boolean =>\n\s*!!state\.zone && telValide\(\)/);
    // asked ONCE: the contact is assembled from C3's own answers, never a second form
    expect(flow).toContain('const quartier = state.zone ?? ');
    expect(flow).toContain("[state.repere.trim(), state.indic.trim()].filter((v) => v !== '').join(' · ')");
    // and it rides the CREATE — the one call the service stores it from
    expect(flow).toContain('live.commander(mode, state.essai, contactLivraison())');
    // typing updates the gate live, like the repère
    expect(flow).toContain("if (role === 'phone') { state.phone = el.value; patchC3Cta(); }");
  });
});
