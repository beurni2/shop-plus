/**
 * LE CERCLE — the §8 QA/acceptance suite (HANDOFF, mechanically verifiable) +
 * the §3.3 guardrail matrix + the [MOCK-PARTENAIRE] certification + property
 * pins (Phase-0 table bytes) + the REACHABILITY gate (the C-ENT lesson: a
 * component nobody mounts must fail here).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeWaterfall } from '@platform/contracts';
import {
  CAMP_SEED, CERCLE_AVIS, CERCLE_DIVERS, CERCLE_MEMBRES, CERCLE_PRODUITS,
  MEMBER_CHIPS, attribue, createPartnerMock, createSeedPartnerMock, draftInit,
  ecoPreview, evalGuards, filterMembres, fundingModel, gaugePct, investi,
  launchCampaign, partagerBadge, pickProduct, places, produit, ratioOk, restant,
  setRecipe, setZone, stepK, stepMax, tilePill, toggleConsent, togglePause,
  type CampDraft,
} from '../src/cercle/model.js';
import { CERCLE_RAW_STYLES as S } from '../src/cercle/styles.js';
import { formatFcfa } from '../src/earnings.js';
import { JOURNEY, type Screen } from '../src/journey.js';

const appDir = join(import.meta.dirname, '..');
const read = (p: string): string => readFileSync(join(appDir, p), 'utf8');
const catalog = JSON.parse(read('i18n/catalog.json')) as Array<{ key: string; fr: string }>;
const keys = new Set(catalog.map((e) => e.key));
const NNBSP = ' ';

/* ------------------------------------------------------ §8.7 math seed ---- */

describe('§8.7 — the seed math holds to the franc (§3.2, §0.2 corrections in force)', () => {
  it('restant 1 800 · places 3 · attribué 9 800 · investi 4 200 · ratio → note verte · jauge 70', () => {
    expect(restant(CAMP_SEED)).toBe(1_800);
    expect(places(CAMP_SEED)).toBe(3);
    expect(attribue(CAMP_SEED)).toBe(9_800);
    expect(investi(CAMP_SEED)).toBe(4_200);
    expect(ratioOk(CAMP_SEED)).toBe(true); // 9 800 / 4 200 = 2,33 ≥ 2
    expect(gaugePct(CAMP_SEED)).toBe(70);
    // below the threshold the note flips warn (ratio < 2)
    expect(ratioOk({ ...CAMP_SEED, orders: 2 })).toBe(false); // 2 800 / 4 200
  });

  it('§8.3 — every netNormal IS the pinned waterfall at the vitrine marge (never hand-authored)', () => {
    for (const p of CERCLE_PRODUITS) {
      const w = computeWaterfall({
        sellerBasePrice: p.B, sellerFundedCommission: p.C, resellerMarkup: p.marge,
        deliveryFee: 1_000, paymentMode: 'FULL_PREPAY',
      });
      expect(p.netNormal, `${p.pid} netNormal drifted`).toBe(w.resellerNet);
    }
    expect(CERCLE_PRODUITS.map((p) => p.netNormal)).toEqual([2000, 3440, 1600, 1200, 1080, 2400, 2200, 2800]);
  });

  it('§8.4 — diaspora is gone: 8 products, no d1, p3 the only épuisé and LAST (W2 order)', () => {
    expect(CERCLE_PRODUITS).toHaveLength(8);
    expect(CERCLE_PRODUITS.some((p) => p.pid === 'd1')).toBe(false);
    expect(CERCLE_PRODUITS.filter((p) => p.stock === 0).map((p) => p.pid)).toEqual(['p3']);
    expect(CERCLE_PRODUITS[CERCLE_PRODUITS.length - 1]!.pid).toBe('p3');
    const src = read('src/cercle/model.ts') + read('src/cercle/screens.tsx');
    expect(src).not.toMatch(/Diaspora|Montréal/);
  });
});

/* ------------------------------------------------- §8.5 guardrail matrix -- */

const draft = (over: Partial<CampDraft>): CampDraft => ({ ...draftInit(), ...over });

describe('§8.5 — the five guardrails, exact (evaluated at W4, never elsewhere)', () => {
  it('(p1, K 600) → G5 alone; CTA off until the consent, on after; eco 2 000/−600/1 400', () => {
    const d = draft({ step: 3 });
    const g = evalGuards(d);
    expect([g.g1, g.g2, g.g3, g.g4, g.g5]).toEqual([false, false, false, false, true]);
    expect(g.ctaActive).toBe(false); // never pre-checked (§6)
    expect(evalGuards(toggleConsent(d)).ctaActive).toBe(true);
    const eco = ecoPreview(d);
    expect([eco.dNet, eco.K, eco.reste, eco.investMax, eco.part]).toEqual([2000, 600, 1400, 6000, 400]);
  });

  it('(p1, K 2 200) → G1 alone (blocking), no consent card, CTA off; reste clamps at 0', () => {
    const g = evalGuards(draft({ K: 2_200 }));
    expect([g.g1, g.g2, g.g3, g.g4, g.g5, g.ctaActive]).toEqual([true, false, false, false, false, false]);
    expect(ecoPreview(draft({ K: 2_200 })).reste).toBe(0); // W4·c clamp
  });

  it('(p2, K 1 100) → G2 alone (blocking), CTA off', () => {
    const g = evalGuards(draft({ pid: 'p2', K: 1_100 }));
    expect([g.g1, g.g2, g.g3, g.g4, g.g5, g.ctaActive]).toEqual([false, true, false, false, false, false]);
  });

  it('(p7, K 1 000) → G3 + G4 + G5 simultaneously; CTA follows the consent', () => {
    const d = draft({ pid: 'p7', K: 1_000 });
    const g = evalGuards(d);
    expect([g.g1, g.g2, g.g3, g.g4, g.g5]).toEqual([false, false, true, true, true]);
    expect(g.ctaActive).toBe(false);
    expect(evalGuards(toggleConsent(d)).ctaActive).toBe(true);
    expect(ecoPreview(d).part).toBe(0); // « Offerte »
  });

  it('(K 0) → no guardrail, no consent, CTA active (« Budget facultatif » held)', () => {
    const g = evalGuards(draft({ recipe: 'Nouveauté', K: 0 }));
    expect([g.g1, g.g2, g.g3, g.g4, g.g5]).toEqual([false, false, false, false, false]);
    expect(g.ctaActive).toBe(true);
    expect(ecoPreview(draft({ K: 0 })).part).toBeNull(); // cliente line absent
  });

  it('ANY K or max change resets the consent; recipe/product/zone changes do NOT', () => {
    const consented = toggleConsent(draft({}));
    expect(consented.ok).toBe(true);
    expect(stepK(consented, 1).ok).toBe(false);
    expect(stepMax(consented, 1).ok).toBe(false);
    expect(setRecipe(consented, 'Nouveauté').ok).toBe(true);
    expect(setZone(consented, 'Cissin').ok).toBe(true);
    const picked = pickProduct(consented, 'p2');
    expect(picked.ok && picked.next.ok).toBe(true);
  });

  it('steppers stay bounded: K ∈ [0, 2 500] step 100 · max ∈ [1, 20] step 1', () => {
    let d = draft({ K: 0 });
    expect(stepK(d, -1).K).toBe(0);
    d = draft({ K: 2_500 });
    expect(stepK(d, 1).K).toBe(2_500);
    expect(stepMax(draft({ maxOrders: 1 }), -1).maxOrders).toBe(1);
    expect(stepMax(draft({ maxOrders: 20 }), 1).maxOrders).toBe(20);
  });
});

/* ------------------------------------------------ §8.6 launch · §8.10/11 -- */

describe('§8.6 — launch effects; §8.10 pause; §8.11 épuisé', () => {
  it('launch: budget = K×max, counters 0, ACTIVE; a blocked draft throws', () => {
    const c = launchCampaign(toggleConsent(draft({})), 1);
    expect([c.budget, c.spent, c.reserved, c.orders, c.state]).toEqual([6_000, 0, 0, 0, 'ACTIVE']);
    expect(c.id).toMatch(/^CAMP-0\d+$/);
    expect(() => launchCampaign(draft({ K: 2_200 }), 1)).toThrow();
    expect(() => launchCampaign(draft({}), 1)).toThrow(); // consent unchecked
  });

  it('§8.10 — pause flips the pill everywhere it derives; the Partager badge dies with it', () => {
    expect(tilePill(CAMP_SEED)).toBe('active');
    const paused = togglePause(CAMP_SEED);
    expect(paused.state).toBe('PAUSED');
    expect(tilePill(paused)).toBe('pause');
    expect(partagerBadge(CAMP_SEED)).toBe(true);
    expect(partagerBadge(paused)).toBe(false); // state ≠ ACTIVE ⇒ no badge (§6)
    expect(partagerBadge({ ...CAMP_SEED, K: 0 })).toBe(false); // campBadge = K>0
    expect(tilePill(togglePause(paused))).toBe('active'); // réactivation symétrique
  });

  it('§8.11 — the épuisé (p3) is refused with the exact toast key; « Budget épuisé » pill at places 0', () => {
    const r = pickProduct(draft({}), 'p3');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.toastKey).toBe('ce.w2.refus_epuise');
    expect(keys.has('ce.w2.refus_epuise')).toBe(true);
    expect(tilePill({ ...CAMP_SEED, orders: 10, spent: 6_000, reserved: 0 })).toBe('epuise');
  });
});

/* ---------------------------------------- §3.4 mock-partenaire certified -- */

describe('[MOCK-PARTENAIRE] — the certified mock enforces the §3.4 contract on every op', () => {
  it('F1 seed ledger: 18 000 réglés · 6 000 alloués · 600 réservés · 3 600 dépensés · 1 800 restant', () => {
    const l = createSeedPartnerMock().ledger();
    expect(l).toEqual({ settledAvailable: 18_000, allocated: 6_000, reserved: 600, spent: 3_600, remaining: 1_800 });
    // §3.4 invariant: allocated = spent + reserved + remaining, at all times
    expect(l.allocated).toBe(l.spent + l.reserved + l.remaining);
  });

  it('reserve → capture moves réservé → dépensé; reserve → release returns it (loi 6, never spent)', () => {
    const port = createSeedPartnerMock();
    port.reserve('oX', 600);
    expect(port.ledger().reserved).toBe(1_200);
    port.capture('oX');
    expect(port.ledger()).toMatchObject({ reserved: 600, spent: 4_200, remaining: 1_200 });
    port.reserve('oY', 600);
    port.release('oY');
    expect(port.ledger()).toMatchObject({ reserved: 600, spent: 4_200, remaining: 1_200 });
  });

  it('F3 — stop returns the restant to the settled gains (18 000 → 19 800) and zeroes the ledger (F2)', () => {
    const port = createSeedPartnerMock();
    port.stop('CAMP-014');
    const l = port.ledger();
    expect(l.settledAvailable).toBe(19_800);
    expect([l.allocated, l.reserved, l.spent, l.remaining]).toEqual([0, 0, 0, 0]);
  });

  it('the contract REFUSES: allocation beyond settled gains (loi 3) · a second offer per order (loi 7) · capture without a hold', () => {
    const port = createPartnerMock({ settledAvailable: 5_000 });
    expect(() => port.allocate('C', 6_000)).toThrow(/loi 3/);
    port.allocate('C', 4_000);
    port.reserve('o1', 500);
    expect(() => port.reserve('o1', 500)).toThrow(/loi 7/);
    expect(() => port.capture('zz')).toThrow();
  });

  it('recoverUnused returns exactly the remaining; fundingModel renders the ledger verbatim (UI adds nothing)', () => {
    const port = createSeedPartnerMock();
    port.recoverUnused();
    expect(port.ledger().settledAvailable).toBe(19_800);
    expect(port.ledger().remaining).toBe(0);
    const f = fundingModel(createSeedPartnerMock(), true);
    expect([f.dispo, f.alloue, f.reserve, f.depense, f.restant]).toEqual([18_000, 6_000, 600, 3_600, 1_800]);
  });
});

/* -------------------------------------------------- §8.2 money bytes ------ */

describe('§8.2 — money bytes: U+202F grouping + U+202F FCFA; C-CE19 the only suffix-free run', () => {
  it('the formatter emits the decree bytes for the cluster figures', () => {
    expect(formatFcfa(4_840)).toBe(`4${NNBSP}840${NNBSP}FCFA`);
    expect(formatFcfa(1_400)).toBe(`1${NNBSP}400${NNBSP}FCFA`);
    expect(formatFcfa(0)).toBe(`0${NNBSP}FCFA`);
  });

  it('every fixed ce.* catalog string with a money figure carries U+202F (never a plain space before FCFA)', () => {
    for (const e of catalog) {
      if (!e.key.startsWith('ce.')) continue;
      expect(/\d FCFA/.test(e.fr), `${e.key} carries a plain space before FCFA`).toBe(false);
      expect(/\dF\b/.test(e.fr), `${e.key} carries a bare F`).toBe(false);
    }
  });

  it('the C-CE19 reconciliation template is the one suffix-free equation and says « chaque franc a sa place »', () => {
    const rec = catalog.find((e) => e.key === 'ce.f_reconciliation')!;
    expect(rec.fr).toContain('chaque franc a sa place');
    expect(rec.fr).not.toContain('FCFA');
  });
});

/* --------------------------------------- §8.13 vocabulary + single-level -- */

describe('§8.13 — « attribué », jamais « généré »; single-level forever (loi 1/9)', () => {
  it('« généré » appears exactly once — quoted inside the C-CE3 caps', () => {
    const hits = catalog.filter((e) => e.fr.includes('généré'));
    expect(hits.map((h) => h.key)).toEqual(['ce.resultat_caps']);
    expect(hits[0]!.fr).toContain('« généré »');
  });

  it('the parrainage is single-level: platform-funded, never a revenue on her sales, never a tree', () => {
    const pa = catalog.find((e) => e.key === 'ce.parrainage_apres')!;
    expect(pa.fr).toContain('jamais un revenu sur ses ventes');
    expect(pa.fr).toContain('jamais un niveau à recruter');
    expect(keys.has('ce.parrainage_pill')).toBe(true);
    // (the standing single-level CI gate scans the whole repo — no duplicate grep here)
  });
});

/* --------------------------------------------------- property pins -------- */

describe('property pins — the Phase-0 table bytes in the runtime styles', () => {
  it('C-CE17 CTA: h54 r16 accent #A31D4E/#FCF4EE, disabled #DDD5C3/#8A7D6B', () => {
    expect(S.cta).toMatchObject({ height: 54, borderRadius: 16, backgroundColor: '#A31D4E' });
    expect(S.ctaText.color).toBe('#FCF4EE');
    expect(S.ctaDisabled.backgroundColor).toBe('#DDD5C3');
    expect(S.ctaTextDisabled.color).toBe('#8A7D6B');
  });

  it('C-CE2 gauge: piste h9 r99 #EFE4D2, fill #A31D4E; tile r20 border #EDE4D3', () => {
    expect(S.gaugeTrack).toMatchObject({ height: 9, borderRadius: 99, backgroundColor: '#EFE4D2' });
    expect(S.gaugeFill.backgroundColor).toBe('#A31D4E');
    expect(S.campTile).toMatchObject({ borderRadius: 20, borderColor: '#EDE4D3' });
  });

  it('C-CE12 stepper: btn 52 r99 border #E5DCC9; value BG800/19 tnum r16', () => {
    expect(S.stepBtn).toMatchObject({ width: 52, height: 52, borderRadius: 99, borderColor: '#E5DCC9' });
    expect(S.stepValue).toMatchObject({ fontSize: 19, fontWeight: '800', borderRadius: 16 });
  });

  it('C-CE14 eco card: border 2 #A31D4E r20; dashed total BG800/20 deep', () => {
    expect(S.ecoCard).toMatchObject({ borderWidth: 2, borderColor: '#A31D4E', borderRadius: 20 });
    expect(S.ecoDashedVal).toMatchObject({ fontSize: 20, fontWeight: '800', color: '#701134' });
  });

  it('C-CE15/16: danger #F8E1DE/#7E1A15 · warn #F6E9C8/#5F4403 · rose #F8E4EC/#701134; consent box 26 r9, checked #A31D4E', () => {
    expect(S.guardDanger.backgroundColor).toBe('#F8E1DE');
    expect(S.guardDangerText.color).toBe('#7E1A15');
    expect(S.guardWarn.backgroundColor).toBe('#F6E9C8');
    expect(S.guardWarnText.color).toBe('#5F4403');
    expect(S.guardRose.backgroundColor).toBe('#F8E4EC');
    expect(S.guardRoseText.color).toBe('#701134');
    expect(S.consentBox).toMatchObject({ width: 26, height: 26, borderRadius: 9 });
    expect(S.consentBoxOn.backgroundColor).toBe('#A31D4E');
  });

  it('C-CE20 hero réputation: bg #701134 r22, « 4,8 » BG800/38, stars #E0A11B; C-CE22 dock labels 10/700; C-CE19 11/600 #6F6355', () => {
    expect(S.reputHero).toMatchObject({ backgroundColor: '#701134', borderRadius: 22 });
    expect(S.reputNote).toMatchObject({ fontSize: 38, fontWeight: '800', color: '#FCF4EE' });
    expect(S.reputStars.color).toBe('#E0A11B');
    expect(S.reconcile).toMatchObject({ fontSize: 11, color: '#6F6355' });
  });

  it('wizard chrome: dots h4 r99 on #A31D4E; back 40 r99; W4 CTA bar bottom pad 40', () => {
    expect(S.wizDot).toMatchObject({ height: 4, borderRadius: 99, backgroundColor: '#E5DCC9' });
    expect(S.wizDotOn.backgroundColor).toBe('#A31D4E');
    expect(S.backBtn).toMatchObject({ width: 40, height: 40, borderRadius: 99 });
    expect(S.ctaBar).toMatchObject({ paddingBottom: 40 });
  });
});

/* ------------------------------------------------------ reachability ------ */

describe('REACHABILITY — a screen nobody mounts fails here (the C-ENT lesson)', () => {
  const CERCLE_SCREENS: readonly Screen[] = ['cercle', 'campnew', 'campaign', 'funding', 'reput', 'membres'];

  it('the journey graph reaches every Cercle screen from accueil', () => {
    const seen = new Set<Screen>(['accueil']);
    const queue: Screen[] = ['accueil'];
    while (queue.length) {
      for (const next of JOURNEY[queue.shift()!]) {
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    for (const s of CERCLE_SCREENS) expect(seen.has(s), `unreachable: ${s}`).toBe(true);
  });

  it('App.tsx MOUNTS each Cercle screen on its route, and the hub wires every sub-screen', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/screen === 'cercle' && \(\s*<CercleHub/);
    expect(app).toMatch(/screen === 'campnew' && \(\s*<CampWizard/);
    expect(app).toMatch(/screen === 'campaign' && \(\s*<CampaignActive/);
    expect(app).toMatch(/screen === 'funding' && <CampaignFunding/);
    expect(app).toMatch(/screen === 'reput' && <CercleReputation/);
    expect(app).toMatch(/screen === 'membres' && <CercleMembres/);
    // D2 — the Accueil card is mounted and routes to the hub
    expect(app).toMatch(/<CercleAccueilCard[^/]*onPress=\{\(\) => go\('cercle'\)\}/);
    // D3/D4/D5 — the deltas are mounted in their carrier screens
    expect(app).toMatch(/saleDetail\.campFcfa > 0 &&/);
    expect(app).toMatch(/<PendingHero label=\{t\('ce\.gains_attente_label'\)\}/);
    expect(app).toMatch(/<GainsSaleCard key=\{c\.code\}/);
    expect(app).toMatch(/campShare !== null &&/);
  });

  it('§8.1 — the dock has FIVE tabs, exact order and labels; Cercle between Ma Vitrine and Gains; two-heads icon verbatim', () => {
    const app = read('App.tsx');
    const dock = app.slice(app.indexOf('<TabBar'), app.indexOf('</SafeAreaView>'));
    const order = [...dock.matchAll(/key: '(\w+)'/g)].map((m) => m[1]);
    expect(order).toEqual(['accueil', 'opportunites', 'vitrine', 'cercle', 'gains']);
    expect(dock).toContain("label: t('nav.tab_cercle')");
    expect(catalog.find((e) => e.key === 'nav.tab_vitrine')!.fr).toBe('Ma Vitrine');
    expect(catalog.find((e) => e.key === 'nav.tab_cercle')!.fr).toBe('Cercle');
    // the C-CE22 two-heads geometry, spec paths verbatim
    const screens = read('src/cercle/screens.tsx');
    expect(screens).toContain('M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6');
    expect(screens).toContain('M16.2 14.6c2.2.3 3.8 1.6 4.3 4');
  });

  it('every ce.* key the screens reference exists in the catalog (no dead t() at runtime)', () => {
    const src = read('src/cercle/screens.tsx') + read('App.tsx');
    const used = new Set<string>();
    for (const m of src.matchAll(/t[f]?\('((?:ce|vente)\.[^']+)'/g)) used.add(m[1]!);
    for (const k of used) expect(keys.has(k), `catalog missing ${k}`).toBe(true);
    expect(used.size).toBeGreaterThan(80);
  });

  it('§8.12 — the reputation numbers are ONE seed (hub, R1): 4,8 · 16 · 12 · 0 litige · 214 membres', () => {
    expect(CERCLE_DIVERS).toMatchObject({ note: '4,8', livraisons: 16, avis: 12, litiges: 0, membres: 214 });
    expect(CERCLE_AVIS).toHaveLength(3);
    expect(CERCLE_AVIS[2]!.stars).toBe(4);
  });

  it('M1 — the segment filter is seg ∨ zone: « Tampouy » → 4 rows · « Fidèle » → 3; the 1ʳᵉ-commande pill is not a chip', () => {
    expect(filterMembres('Tampouy').map((m) => m.name)).toEqual(['Fatou Ilboudo', 'Mariam Ouédraogo', 'Salif Nikiéma', 'Adja Compaoré']);
    expect(filterMembres('Fidèle').map((m) => m.name)).toEqual(['Awa Kaboré', 'Fatou Ilboudo', 'Habibou Zongo']);
    expect(filterMembres('Toutes')).toHaveLength(8);
    expect(MEMBER_CHIPS).not.toContain('Première commande');
    expect(CERCLE_MEMBRES.filter((m) => m.seg === 'Première commande')).toHaveLength(1);
  });

  it('the W2 list is the vitrine catalog in boutique order with the exact sub-line nets; the wizard opens on the suggestion', () => {
    expect(CERCLE_PRODUITS.map((p) => p.pid)).toEqual(['p1', 'p2', 'p4', 'p5', 'p7', 'p8', 'k1', 'p3']);
    const d = draftInit();
    expect(d).toMatchObject({ step: 0, recipe: 'Quartier', pid: 'p1', K: 600, maxOrders: 10, zone: 'Tampouy', ok: false });
    expect(produit('p1').netNormal).toBe(2_000);
  });
});
