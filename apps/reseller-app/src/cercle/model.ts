/**
 * LE CERCLE — the pure model (HANDOFF §3 · §4). NO react-native import: every
 * formula, guard, action and the [MOCK-PARTENAIRE] port are Node-tested.
 *
 * FOUNDER OVERRIDE (journaled 2026-07-19): SP9 build-gate override, SCOPED —
 * UI + certified mock behind the §3.4 port ONLY. The real-money leg stays
 * fully gated (CERCLE-REAL-FUNDING, E3-shaped follow-on, fresh override
 * required). No real allocation, no Mobile Money, no recharge UI.
 *
 * MONEY LAW (§0): the UI recomputes NOTHING it renders as server truth — the
 * frozen seed nets are validated against the pinned `computeWaterfall` in
 * vitest (never on device). The §3.2 formulas below are the demo's « server »
 * (and QA): screens render what the model returns, never inline arithmetic.
 * `frais = round(brut × 0.20)` untouched. Lois gelées §0: single-level
 * parrainage (never a tree) · « attribué », jamais « généré » · only SETTLED
 * gains fund campaigns · no negative gain (G1) · Séra paid whole (G2) ·
 * arrêter = récupérer · one offer per order · signed page is the only truth ·
 * la cliente ne voit jamais net/marge/K/vendeurs.
 */

/* ------------------------------------------------------------- §3.1 seed -- */

export type RecipeId = 'Nouveauté' | 'Quartier' | 'Dernières Pièces';
export type CampState = 'ACTIVE' | 'PAUSED';

export interface CercleProduit {
  readonly pid: string;
  readonly name: string;
  /** §3.1: B (prix de base), C (commission vendeur), stock, marge vitrine. */
  readonly B: number;
  readonly C: number;
  readonly stock: number;
  readonly marge: number;
  /** FROZEN net normal (§3.2 netNormal) — pinned to computeWaterfall in vitest. */
  readonly netNormal: number;
}

/** §3.1 catalog (8 — diaspora excluded by decree §0.1.4), curatedItems order
 * with the épuisé LAST (§5-W2). p3 stock 0 = seed correction §0.2.b. */
export const CERCLE_PRODUITS: readonly CercleProduit[] = [
  { pid: 'p1', name: 'Robe brodée bogolan', B: 10_000, C: 1_000, stock: 7, marge: 1_500, netNormal: 2_000 },
  { pid: 'p2', name: 'Pagne wax 6 yards', B: 18_000, C: 1_800, stock: 11, marge: 2_500, netNormal: 3_440 },
  { pid: 'p4', name: 'Sandales cuir homme', B: 8_000, C: 800, stock: 6, marge: 1_200, netNormal: 1_600 },
  { pid: 'p5', name: 'Coffret karité pur', B: 6_000, C: 600, stock: 9, marge: 900, netNormal: 1_200 },
  { pid: 'p7', name: 'Foulard Faso Dan Fani', B: 5_500, C: 550, stock: 14, marge: 800, netNormal: 1_080 },
  { pid: 'p8', name: 'Chemise Faso Dan Fani', B: 12_000, C: 1_200, stock: 5, marge: 1_800, netNormal: 2_400 },
  { pid: 'k1', name: 'Pack Cuisine Départ', B: 12_500, C: 1_250, stock: 28, marge: 1_500, netNormal: 2_200 },
  { pid: 'p3', name: 'Sac cuir artisanal', B: 15_000, C: 1_500, stock: 0, marge: 2_000, netNormal: 2_800 },
];

export function produit(pid: string): CercleProduit {
  const p = CERCLE_PRODUITS.find((x) => x.pid === pid);
  if (!p) throw new Error(`cercle: produit inconnu ${pid}`);
  return p;
}

export interface Campagne {
  readonly id: string;
  readonly recipe: RecipeId;
  readonly pid: string;
  readonly zone: string;
  readonly K: number;
  readonly maxOrders: number;
  readonly budget: number;
  readonly spent: number;
  readonly reserved: number;
  readonly orders: number;
  readonly state: CampState;
}

/** Seed campaign — §0.2.a applied: spent 3 600, reserved 600 (o1 camp 600). */
export const CAMP_SEED: Campagne = {
  id: 'CAMP-014', recipe: 'Quartier', pid: 'p1', zone: 'Tampouy',
  K: 600, maxOrders: 10, budget: 6_000, spent: 3_600, reserved: 600, orders: 7, state: 'ACTIVE',
};

/** Divers (§3.1): members/deliveries/reviews/rating/disputes + settled gains. */
export const CERCLE_DIVERS = {
  membres: 214, membresMois: 24, livraisons: 16, avis: 12, note: '4,8', litiges: 0,
  gainsDisponibles: 18_000,
} as const;

export const RECIPES: readonly RecipeId[] = ['Nouveauté', 'Quartier', 'Dernières Pièces'];
export const ZONES: readonly string[] = ['Ouaga 2000', 'Gounghin', 'Cissin', 'Dassasgho', 'Tampouy'];
export const FENETRE = 'Samedi 10 h – 12 h'; // §9.1 frozen: ONE v1 window, a constant

export const K_MIN = 0;
export const K_MAX = 2_500;
export const K_STEP = 100;
export const MAX_ORDERS_MIN = 1;
export const MAX_ORDERS_MAX = 20;
export const TARIF_SERA = 1_000;

/* --------------------------------------------------------- §3.2 formulas -- */
/* The demo's « server » + QA. Screens render these outputs; tests recompute. */

export const gaugePct = (c: Pick<Campagne, 'orders' | 'maxOrders'>): number =>
  Math.min(100, Math.round((c.orders / c.maxOrders) * 100));

export const restant = (c: Pick<Campagne, 'budget' | 'spent' | 'reserved'>): number =>
  c.budget - c.spent - c.reserved;

export const places = (c: Campagne): number =>
  Math.max(0, Math.min(c.maxOrders - c.orders, c.K > 0 ? Math.floor(restant(c) / c.K) : c.maxOrders - c.orders));

export const investi = (c: Pick<Campagne, 'spent' | 'reserved'>): number => c.spent + c.reserved;

export const attribue = (c: Campagne): number =>
  c.orders * Math.max(0, produit(c.pid).netNormal - c.K);

/** ratio is REAL and never displayed (§9.6) — only the ≥2 threshold note is. */
export const ratioOk = (c: Campagne): boolean => {
  const inv = investi(c);
  return inv > 0 ? attribue(c) / inv >= 2 : false;
};

/** Part cliente : 1 000 − K (G2 guarantees K ≤ 1 000 at launch). */
export const partCliente = (K: number): number => Math.max(0, TARIF_SERA - K);

/* -------------------------------------------------- §3.3 the 5 guardrails -- */

export interface CampDraft {
  readonly step: 0 | 1 | 2 | 3;
  readonly recipe: RecipeId;
  readonly pid: string;
  readonly K: number;
  readonly maxOrders: number;
  readonly zone: string;
  readonly ok: boolean; // G5 consent — never pre-checked (§6)
}

/** §4: the wizard always opens pre-filled on the suggestion. */
export const draftInit = (): CampDraft =>
  ({ step: 0, recipe: 'Quartier', pid: 'p1', K: 600, maxOrders: 10, zone: 'Tampouy', ok: false });

export interface Guards {
  readonly dNet: number;
  readonly g1: boolean; // blocking: K > dNet
  readonly g2: boolean; // blocking: !G1 ∧ K > 1 000
  readonly g3: boolean; // warn: K > dNet/2 (strict), K > 0, not blocked
  readonly g4: boolean; // note: K = 1 000 (part = 0 ⇒ full prepay)
  readonly g5: boolean; // consent required: step 4 ∧ K > 0 ∧ not blocked
  readonly ctaActive: boolean; // !G1 ∧ !G2 ∧ (K = 0 ∨ consent checked)
}

export function evalGuards(d: CampDraft): Guards {
  const dNet = produit(d.pid).netNormal;
  const g1 = d.K > dNet;
  const g2 = !g1 && d.K > TARIF_SERA;
  const blocked = g1 || g2;
  const g3 = !blocked && d.K > 0 && d.K > dNet / 2;
  const g4 = d.K === TARIF_SERA;
  const g5 = !blocked && d.K > 0;
  const ctaActive = !blocked && (d.K === 0 || d.ok);
  return { dNet, g1, g2, g3, g4, g5, ctaActive };
}

/** W4 economic preview — computed by the model (« server »), rendered as-is. */
export interface EcoPreview {
  readonly dNet: number;
  readonly K: number;
  readonly reste: number; // max(0, dNet − K) — W4·c clamps at 0
  readonly investMax: number; // K × max
  readonly maxOrders: number;
  /** null when K = 0 (line not rendered); 0 ⇒ « Offerte ». */
  readonly part: number | null;
}

export const ecoPreview = (d: CampDraft): EcoPreview => ({
  dNet: produit(d.pid).netNormal,
  K: d.K,
  reste: Math.max(0, produit(d.pid).netNormal - d.K),
  investMax: d.K * d.maxOrders,
  maxOrders: d.maxOrders,
  part: d.K > 0 ? partCliente(d.K) : null,
});

/* ------------------------------------------------------------ §4 actions -- */
/* Pure: state in, state out. Toast keys are i18n catalog keys. */

export const setRecipe = (d: CampDraft, recipe: RecipeId): CampDraft => ({ ...d, recipe });

export type PickResult = { ok: true; next: CampDraft } | { ok: false; toastKey: 'ce.w2.refus_epuise' };

/** W2 — an épuisé product cannot carry a campaign (§0.2.h, toast §4). */
export function pickProduct(d: CampDraft, pid: string): PickResult {
  if (produit(pid).stock === 0) return { ok: false, toastKey: 'ce.w2.refus_epuise' };
  return { ok: true, next: { ...d, pid } };
}

/** W3 steppers — any K/max change RESETS consent (§3.3: `ok:false`). */
export const stepK = (d: CampDraft, dir: -1 | 1): CampDraft =>
  ({ ...d, K: Math.min(K_MAX, Math.max(K_MIN, d.K + dir * K_STEP)), ok: false });

export const stepMax = (d: CampDraft, dir: -1 | 1): CampDraft =>
  ({ ...d, maxOrders: Math.min(MAX_ORDERS_MAX, Math.max(MAX_ORDERS_MIN, d.maxOrders + dir)), ok: false });

export const setZone = (d: CampDraft, zone: string): CampDraft => ({ ...d, zone });

/** W4 consent — recipe/product/zone changes do NOT reset it (§3.3). */
export const toggleConsent = (d: CampDraft): CampDraft => ({ ...d, ok: !d.ok });

export const stepTo = (d: CampDraft, step: 0 | 1 | 2 | 3): CampDraft => ({ ...d, step });

/** W4 « Lancer » — §4: counters reset, budget = K×max, replaces the active
 * campaign (one at a time, v1). The demo id is deterministic (never Math.random
 * in product logic — deterministic law): CAMP-0 + a seed-stepped 15–94. */
export function launchCampaign(d: CampDraft, seq: number): Campagne {
  const g = evalGuards(d);
  if (!g.ctaActive) throw new Error('cercle: lancement bloqué (garde-fous)');
  const n = 15 + (seq % 80);
  return {
    id: `CAMP-0${n}`, recipe: d.recipe, pid: d.pid, zone: d.zone, K: d.K,
    maxOrders: d.maxOrders, budget: d.K * d.maxOrders, spent: 0, reserved: 0, orders: 0, state: 'ACTIVE',
  };
}

export const togglePause = (c: Campagne): Campagne =>
  ({ ...c, state: c.state === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' });

/** Hub tile pill state (§5-C1 ⑤): Active · En pause · Budget épuisé. */
export type TilePill = 'active' | 'pause' | 'epuise';
export const tilePill = (c: Campagne): TilePill =>
  c.state === 'PAUSED' ? 'pause' : places(c) === 0 ? 'epuise' : 'active';

/** Partager badge — rendered iff opened with campBadge ∧ campaign ACTIVE (§5-D5). */
export const partagerBadge = (c: Campagne | null): boolean =>
  c !== null && c.K > 0 && c.state === 'ACTIVE';

/* --------------------------- §3.4 [MOCK-PARTENAIRE] the blocked-money port -- */

export interface PartnerLedger {
  readonly settledAvailable: number;
  readonly allocated: number;
  readonly reserved: number;
  readonly spent: number;
  readonly remaining: number;
}

/** The port a REAL payment partner will implement (CERCLE-REAL-FUNDING —
 * E3-shaped follow-on, fresh SP9 override required). The UI renders `ledger()`
 * and never distinguishes mock from real. */
export interface PartnerPort {
  allocate(campaignId: string, amount: number): void;
  reserve(orderId: string, K: number): void;
  capture(orderId: string): void;
  release(orderId: string): void;
  stop(campaignId: string): void;
  recoverUnused(): void;
  ledger(): PartnerLedger;
}

/**
 * The CERTIFIED mock — no real money, honest failure/timing shape. It enforces
 * the §3.4 invariant on EVERY operation and throws on violation, so a mock
 * that drifts from the contract fails tests loudly instead of flattering the
 * integration (mock-certification law, Execution Contract §3).
 */
export function createPartnerMock(seed?: Partial<PartnerLedger>): PartnerPort {
  let settled = seed?.settledAvailable ?? CERCLE_DIVERS.gainsDisponibles;
  let allocated = seed?.allocated ?? 0;
  let reserved = seed?.reserved ?? 0;
  let spent = seed?.spent ?? 0;
  const holds = new Map<string, number>();
  const assertInvariant = (): void => {
    // §3.4: allocated = spent + reserved + remaining, remaining derived; and
    // settledAvailable EXCLUDES allocated. Negative legs are contract breaches.
    if (reserved < 0 || spent < 0 || allocated < 0 || settled < 0) {
      throw new Error('mock-partenaire: negative leg (contract breach)');
    }
    if (spent + reserved > allocated) {
      throw new Error('mock-partenaire: spent + reserved > allocated (contract breach)');
    }
  };
  return {
    allocate(_campaignId, amount) {
      // One campaign at a time (v1): a new allocation first closes the prior
      // one — its remaining returns to the settled gains (loi 6).
      settled += allocated - spent - reserved;
      allocated = 0; reserved = 0; spent = 0; holds.clear();
      if (amount > settled) throw new Error('mock-partenaire: allocation > gains réglés (loi 3)');
      settled -= amount;
      allocated = amount;
      assertInvariant();
    },
    reserve(orderId, K) {
      if (holds.has(orderId)) throw new Error('mock-partenaire: une seule offre par commande (loi 7)');
      reserved += K;
      holds.set(orderId, K);
      assertInvariant();
    },
    capture(orderId) {
      const K = holds.get(orderId);
      if (K === undefined) throw new Error('mock-partenaire: capture sans réservation');
      holds.delete(orderId);
      reserved -= K;
      spent += K;
      assertInvariant();
    },
    release(orderId) {
      const K = holds.get(orderId);
      if (K === undefined) throw new Error('mock-partenaire: release sans réservation');
      holds.delete(orderId);
      reserved -= K; // rendu au restant — jamais dépensé (loi 6)
      assertInvariant();
    },
    stop(_campaignId) {
      // arrêter = récupérer : le restant retourne aux gains disponibles,
      // immédiatement (loi 6). The campaign ledger closes (F2 shows zeros;
      // F3 proves the arithmetic: 18 000 + 1 800 restant = 19 800).
      settled += allocated - spent - reserved;
      allocated = 0; reserved = 0; spent = 0; holds.clear();
      assertInvariant();
    },
    recoverUnused() {
      const remaining = allocated - spent - reserved;
      settled += remaining;
      allocated -= remaining;
      assertInvariant();
    },
    ledger() {
      return {
        settledAvailable: settled,
        allocated,
        reserved,
        spent,
        remaining: allocated - spent - reserved,
      };
    },
  };
}

/** The seed mock — F1's exact numbers ([MOCK-PARTENAIRE] table §3.4).
 * settledAvailable EXCLUDES allocated (§3.4 invariant): « Gains disponibles
 * (réglés) 18 000 » IS settledAvailable — F3 proves it (stop ⇒ 18 000 + the
 * 1 800 restant = 19 800). */
export const createSeedPartnerMock = (): PartnerPort =>
  createPartnerMock({ settledAvailable: 18_000, allocated: 6_000, reserved: 600, spent: 3_600 });

/** F-screen model — every figure from `ledger()`; the UI adds NOTHING (§5-F1:
 * « l'UI n'additionne rien — la réconciliation est fournie/validée serveur »). */
export interface FundingView {
  readonly dispo: number;
  readonly alloue: number;
  readonly reserve: number;
  readonly depense: number;
  readonly restant: number;
  readonly hasCampaign: boolean;
}

export function fundingModel(port: PartnerPort, hasCampaign: boolean): FundingView {
  const l = port.ledger();
  return {
    dispo: l.settledAvailable,
    alloue: l.allocated,
    reserve: l.reserved,
    depense: l.spent,
    restant: l.remaining,
    hasCampaign,
  };
}

/* ------------------------------------------------- §5 seed (M1 · avis) ---- */
/* Obviously-fictional demo seed data (names/quotes), NOT chrome — the chrome
 * strings live in the i18n catalog (register-tagged). */

export type MemberSeg = 'Fidèle' | 'Nouvelle' | 'Intéressée' | 'À relancer' | 'Première commande';

export interface CercleMembre {
  readonly name: string;
  readonly zone: string;
  readonly interet: string;
  readonly seg: MemberSeg;
}

/** M1 §5 seed — fixed order. « 1ʳᵉ commande » is a row pill only, absent from
 * the filter chips (§5-M1 ③). */
export const CERCLE_MEMBRES: readonly CercleMembre[] = [
  { name: 'Awa Kaboré', zone: 'Ouaga 2000', interet: 'Mode femme', seg: 'Fidèle' },
  { name: 'Fatou Ilboudo', zone: 'Tampouy', interet: 'Sacs', seg: 'Fidèle' },
  { name: 'Mariam Ouédraogo', zone: 'Tampouy', interet: 'Beauté', seg: 'Intéressée' },
  { name: 'Salif Nikiéma', zone: 'Tampouy', interet: 'Mode homme', seg: 'Première commande' },
  { name: 'Habibou Zongo', zone: 'Cissin', interet: 'Tissus', seg: 'Fidèle' },
  { name: 'Rihanata Sana', zone: 'Gounghin', interet: 'Nouveautés', seg: 'Nouvelle' },
  { name: 'Adja Compaoré', zone: 'Tampouy', interet: 'Beauté', seg: 'À relancer' },
  { name: 'K. Traoré', zone: 'Dassasgho', interet: 'Maison', seg: 'Nouvelle' },
];

/** M1 filter chips (« Toutes » first; segment ∨ zone). */
export const MEMBER_CHIPS: readonly string[] = ['Toutes', 'Fidèle', 'Nouvelle', 'Intéressée', 'À relancer', 'Tampouy'];

export function filterMembres(chip: string): readonly CercleMembre[] {
  if (chip === 'Toutes') return CERCLE_MEMBRES;
  return CERCLE_MEMBRES.filter((m) => m.seg === chip || m.zone === chip);
}

export interface CercleAvis {
  readonly name: string;
  readonly stars: 4 | 5;
  readonly quote: string;
}

/** Hub shows the first two (pill « Vérifié · Séra »); R1 all three (« Achat vérifié »). */
export const CERCLE_AVIS: readonly CercleAvis[] = [
  { name: 'Awa K.', stars: 5, quote: 'Conforme à la photo, scellée et livrée à l’heure.' },
  { name: 'Salif N.', stars: 5, quote: 'Très belle qualité, vérifiée devant moi avant de payer.' },
  { name: 'Habibou Z.', stars: 4, quote: 'Livraison rapide, tissu superbe.' },
];
