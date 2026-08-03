/**
 * PWA CLIENTE — §4 écrans C1–C9, pixel-for-pixel to `docs/PWA Cliente -
 * Redesign.dc.html`. This module emits structure + copy only; θ lives in the
 * stylesheet (var(--vt-*) set by applyTheme on the container).
 *
 * Copy is the pixel source's, verbatim — typographic apostrophes (U+2019),
 * guillemets, the C4 en dash. Amounts pass through `fmtFCFA`/`groupFr` (the
 * byte-controlled NNBSP, one escaped constant) — never Intl, never a bare
 * « F ». Money is RENDER-ONLY: every fee/total/reconciliation figure is read
 * from the server-frozen ClienteQuote — no renderer ever adds two amounts.
 * Model-derived strings pass through `esc`. No purchase-side economics field
 * exists here — the §0 wall: the four banned buyer-facing terms grep to 0
 * across this module, sources included.
 *
 * The photo placeholder draws the CANON SVG product glyph (vitrine set) — the
 * pixel prototype's emoji is forbidden by the no-emoji-in-chrome gate (the
 * achat precedent). Glyph color on the sable frame is undefined in the
 * handoff → ink, with the pixel drop-shadow (flagged §8-style).
 */

import { esc } from '../format';
import { productGlyph } from '../vitrine/icons';
import { fmtFCFA, groupFr, NNBSP } from './money';
import {
  RECORDED_WAVE_SVG, VOICE_WAVE_HEIGHTS,
  iconBack, iconCheck, iconCheckSquare, iconChevron, iconClock, iconEye, iconFlag,
  iconKey, iconLock, iconLockDot, iconMic, iconMicOff, iconPhone, iconPlay,
  iconPlaySmall, iconScooter, iconShieldCheck, iconWifiOff,
} from './icons';

/** The offered product (the signed page's `prixClient` is `priceFcfa`). */
export interface ClienteProduit {
  readonly shopName: string;
  readonly prenom: string;
  readonly slug: string;
  readonly productName: string;
  /** e.g. « TAILLE M » — absent on real products without a variant. */
  readonly variant?: string;
  /**
   * §6.2's inspection row for this product — one of the three MVP identifiers
   * (`fashion_bags_fabrics` · `shoes` · `sealed_beauty_cosmetics`).
   *
   * OPTIONAL, AND ABSENT ON EVERY PRODUCT TODAY: the service HAS a per-product
   * `category` (`CustomerProductView`) but that projection has no route and no
   * consumer, so nothing carries it to the buyer yet. Absent ⇒ the conservative
   * row (`inspectionPour`), which claims nothing category-specific. Journalled.
   */
  readonly category?: string;
  readonly zone: string;
  readonly priceFcfa: number;
  /** Bare display refs (canon `assetRefs`, v2.0.0); `[0]` is the hero. EMPTY is
   * the honest normal case → the woven « SANS PHOTO » frame, and the « photo
   * réelle » promise is NOT made (REAL-PRODUCT-RENDER-1). */
  readonly assetRefs: readonly string[];
  /**
   * VIDEO-PARTOUT (founder order 2026-08-03: the clip shows « on the buyer's
   * pwa as well ») — the ≤ 6 s clip's ABSOLUTE url, absolutized server-side
   * through the same base as `assetRefs`. Optional: most products have none.
   */
  readonly videoRef?: string;
  readonly voiceDuree?: string;
  /** Playable note url (ready notes only) — tap plays, never autoplay. */
  readonly voiceUrl?: string;
  readonly inStock: boolean;
}

/**
 * WHAT ONE PAYMENT MODE'S SERVER QUOTE SAYS IS PAID **WHEN** — its own two
 * bytes, `amountPaidAtCheckout` and `amountDueAtDelivery`, carried verbatim
 * (SP3.3b1 · §6.1 · SP-I13 « Checkout MUST show exactly what is paid now vs due
 * at delivery »).
 *
 * CARRIED, NEVER DERIVED — and the claim is deliberately small. The screen used
 * to pick mode A's « paid now » as the total and mode B's as the delivery fee: a
 * client-side rule about what a payment mode MEANS. The cross-check in
 * `quote-model.ts` forces the two to be the same francs, so carrying them can
 * never make a different number appear and no test can show that it does. What
 * it changes is WHERE the figure comes from — the server's own field for the
 * mode she is looking at — and it deletes a rule this app had no business
 * holding. That is the whole of it.
 */
export interface ModeSplit {
  readonly paidNow: number;
  readonly dueAtDelivery: number;
}

/**
 * The §6.1 split for ONE delivery leg, per payment mode.
 *
 * `B` is ABSENT — not zero, not a dash — whenever the server did not price
 * pay-at-door for this basket. « Never print a figure for a mode the server did
 * not price »: an absent split is why the « Pas disponible pour cette
 * commande » block draws instead of a card, and it is unrepresentable as a
 * misleading 0.
 */
export interface LegSplits {
  readonly A: ModeSplit;
  readonly B?: ModeSplit | undefined;
}

/**
 * The SERVER-FROZEN quote (§3.2 · §0 « argent = render-only »). Composed once
 * by the seed layer (the contract-certified mock of the quote service — the
 * TOTAUX precedent), rendered as-is: no screen ever recomputes a total.
 *
 * `splitsToday`/`splitsTomorrow` are doubled for exactly the reason
 * `feeToday`/`feeTomorrow` are (see `quote-model.ts`): the canon prices ONE fee
 * per zone pair, so the real path fills both slots with the same server answer,
 * while the `?demo-cliente=` harness still drives two legs and each leg's mock
 * split must match the leg's mock fee.
 */
export interface ClienteQuote {
  readonly produitFcfa: number;
  readonly feeToday: number;
  readonly feeTomorrow: number;
  readonly totalToday: number;
  readonly totalTomorrow: number;
  readonly splitsToday: LegSplits;
  readonly splitsTomorrow: LegSplits;
}

export type Livraison = 'today' | 'tomorrow';
export type ModePaiement = 'A' | 'B';
export type VoiceEtat = 'idle' | 'recording' | 'recorded' | 'queued' | 'refused';
/**
 * SP4.2b — the door's states. `accepted` is « she said it's good and the
 * product charge is on its way to the operator »; `echec` is « the operator did
 * not take it ». Neither ever means paid — only the ORDER's `doorLeg` does.
 */
export type DoorEtat = 'inspecting' | 'accepted' | 'echec' | 'report';
/**
 * WHAT C6 IS ALLOWED TO SAY — and after SP3.3c, all five come from somewhere
 * real rather than from a clock.
 *
 *  · `confirmed`  — the ORDER's own state said `confirmed`, which only a signed
 *                   provider webhook validated to the franc can produce. This is
 *                   the ONLY value that may print « confirmé par l'opérateur ».
 *  · `attente`    — the order EXISTS on the service and the operator has not
 *                   answered yet. NOT « en attente du réseau »: her request
 *                   landed, so her network is not the story, and saying it was
 *                   would be the same lie the unreachable/unreadable split
 *                   exists to remove one screen earlier.
 *  · `echec`      — the order's state said `payment_failed`. Nothing was
 *                   collected; the retry is hers to make.
 *  · `pending`    — the request is QUEUED ON THIS PHONE and has not left it.
 *                   The offline-first state (Ten Laws #7: queued = pending,
 *                   never done). Kept distinct from `attente` because the two
 *                   need opposite sentences about whose problem this is.
 *  · `offline`    — she was offline when she tapped Payer.
 */
export type ConfirmEtat = 'confirmed' | 'attente' | 'echec' | 'pending' | 'offline';

/** Les 8 zones (§4 C3 — l'ensemble exact du pixel source). */
export const ZONES: readonly string[] = ['Gounghin', 'Dassasgho', 'Pissy', 'Tampouy', 'Wemtenga', 'Zogona', 'Cissin', 'Somgandé'];

/** Les 6 étapes du suivi (§4 C7 — titres + descriptions verbatim). */
export const SUIVI_STEPS: ReadonlyArray<{ t: string; d: string }> = [
  { t: 'Commande enregistrée', d: 'Nous avons bien reçu votre commande.' },
  { t: 'Préparée par la vendeuse', d: 'Aïcha prépare votre colis.' },
  { t: 'Vérifiée et scellée par Séra', d: 'Le livreur contrôle le colis avant de partir.' },
  { t: 'En route', d: 'Le colis est en chemin vers votre repère.' },
  { t: 'À votre porte', d: 'Inspectez avant de payer le reste.' },
  { t: 'Remise', d: 'Votre code fait foi.' },
];

/** [DEMO] le libellé de l'étape suivante (index = step courant 1–4). */
export const SIM_LABELS: readonly string[] = ['', 'Préparée', 'Vérifiée et scellée', 'En route', 'À votre porte'];

/** Les 3 motifs de signalement (§4 C8). */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * §6.2 — THE CATEGORY INSPECTION MATRIX, ON THE SCREEN WHERE SHE DECIDES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Build-Spec §6.2 gives three MVP rows, and each one allows DIFFERENT checks at
 * the door, admits DIFFERENT valid rejections, and leaves DIFFERENT things at
 * her own risk. Until now C8 showed all three the same hardcoded lines — « le
 * bon article · la bonne taille · en bon état » — whatever she had bought.
 *
 * ═══ THE THIRD COLUMN IS THE ONE THAT PROTECTS HER, AND IT IS THE HARDEST ═══
 *
 * §6.2's « Buyer-risk (not valid) » names what a refusal will NOT be honoured
 * for: fit dissatisfaction on clothes, fit on shoes (« wearing = buyer risk »),
 * opening the inner seal on cosmetics. Telling her that AT THE DOOR, before she
 * decides, is the difference between a rule and a trap — and it is why every
 * row carries a `risque` line that the screen shows in the same breath as the
 * checklist. « Opened-then-refused … without seller fault → buyer-fault » is
 * the rule this sentence exists to keep out of her way.
 *
 * ═══ THE IDENTIFIERS ARE NOT INVENTED ═══
 *
 * They are the three already committed in `PAY_AT_DOOR_POLICY_DEFAULTS.
 * inspectableCategories` — themselves taken from §6.2's own rows. **The wider
 * category taxonomy is an open FOUNDER DECISION** (`category: z.ZodString` in
 * canon, « the category-floor taxonomy are FOUNDER DECISIONS »), so nothing
 * here invents a fourth name or a mapping from one.
 *
 * ELECTRONICS IS ABSENT BECAUSE §6.2 EXCLUDES IT FROM THE MVP — not overlooked.
 * An unknown or excluded category therefore gets `INSPECTION_PRUDENTE`, which
 * claims nothing category-specific. Fail-closed on a screen means promising
 * LESS, never guessing.
 */
export interface RangeeInspection {
  /** What she may check at the door, in her own words. */
  readonly verifier: readonly string[];
  /** What a refusal WILL be honoured for — §6.2's « valid rejection » column. */
  readonly motifs: readonly string[];
  /** What stays at her own risk — §6.2's « Buyer-risk (not valid) » column. */
  readonly risque: string;
}

/** The conservative row: no category known, or one §6.2 does not cover. */
export const INSPECTION_PRUDENTE: RangeeInspection = {
  verifier: ['C’est le bon article — celui de la photo', 'En bon état', 'Rien ne manque'],
  motifs: ['Ce n’est pas le bon article', 'Il est abîmé', 'Il manque quelque chose'],
  risque: 'Vous ne pouvez pas l’essayer à la porte.',
};

export const INSPECTION: Readonly<Record<string, RangeeInspection>> = {
  /** §6.2 row 1 — « visual: correct item, colour, size label, quantity,
   *  condition, missing parts » · rejection « wrong/mismatch/damage/short » ·
   *  buyer-risk « no try-on; fit dissatisfaction ». */
  fashion_bags_fabrics: {
    verifier: [
      'C’est le bon article — celui de la photo',
      'La bonne couleur',
      'La bonne taille sur l’étiquette',
      'Le bon nombre',
      'En bon état, rien ne manque',
    ],
    motifs: ['Ce n’est pas le bon article', 'Ce n’est pas la bonne couleur', 'Il est abîmé', 'Il en manque'],
    risque: 'Vous ne pouvez pas l’essayer à la porte. La coupe qui ne vous plaît pas ne compte pas comme un problème.',
  },
  /** §6.2 row 2 — « box-open, model, size label, pair, condition » ·
   *  rejection « wrong size-label/model/damage » · buyer-risk « fit (wearing =
   *  buyer risk) ». */
  shoes: {
    verifier: [
      'Ouvrez la boîte',
      'C’est le bon modèle',
      'La bonne pointure sur l’étiquette',
      'Les deux pieds sont là',
      'En bon état',
    ],
    motifs: ['Ce n’est pas le bon modèle', 'Ce n’est pas la bonne pointure', 'Il est abîmé', 'Il manque une chaussure'],
    risque: 'Si vous les portez, elles sont à vous. La pointure qui serre ne compte pas comme un problème.',
  },
  /** §6.2 row 3 — « outer only; mfr seal intact; name, variant, quantity,
   *  expiry, damage » · rejection « broken seal/wrong variant/expired/damage » ·
   *  buyer-risk « opening the inner seal ». */
  sealed_beauty_cosmetics: {
    verifier: [
      'Regardez l’emballage, sans l’ouvrir',
      'Le scellé du fabricant est intact',
      'Le bon nom et la bonne teinte',
      'Le bon nombre',
      'La date n’est pas dépassée',
    ],
    motifs: ['Le scellé est cassé', 'Ce n’est pas la bonne teinte', 'La date est dépassée', 'Il est abîmé'],
    risque: 'N’ouvrez pas le scellé avant d’accepter. Un scellé ouvert par vous ne compte pas comme un problème.',
  },
};

/**
 * THE ROW FOR THIS PRODUCT — §6.2's, or the conservative one.
 *
 * `undefined` (no category on the wire — which is every product today, see the
 * JOURNAL) lands on `INSPECTION_PRUDENTE` exactly as an unknown name does. One
 * branch, so « we do not know » and « we do not cover it » cannot drift apart.
 */
export function inspectionPour(category?: string): RangeeInspection {
  if (category === undefined) return INSPECTION_PRUDENTE;
  // ═══ `Object.hasOwn`, NOT `?? ` — AND THE DIFFERENCE WAS A STUCK BUYER ═══
  //
  // This read `INSPECTION[category] ?? INSPECTION_PRUDENTE`, which is safe for
  // every ORDINARY unknown name and wrong for five: `__proto__`, `constructor`,
  // `toString`, `valueOf`, `hasOwnProperty` all resolve on the prototype chain
  // of an object literal, so they are never nullish and `??` never fires.
  // `inspectionPour('constructor')` returned `Object`, and C8 then called
  // `.motifs.map` on it and THREW.
  //
  // The throw is what made it serious rather than ugly: the flow builds the
  // whole screen string BEFORE assigning `innerHTML`, so nothing replaces the
  // previous screen. A buyer at her door would tap « J'accepte » and watch the
  // screen not change — unable to accept, unable to report a problem, on a
  // product she has already paid the delivery on. Every later render throws too.
  //
  // The category is a FREE-TEXT field a supplier types (boutik validates only
  // non-emptiness), so this is reachable without anyone being hostile.
  // `Object.hasOwn` asks the only question that was ever meant: did WE put this
  // row in the table? Anything else — unknown, inherited, or adversarial — is
  // one branch, the conservative row. The same law this repo already applies to
  // command ids (« a commandId that names an Object.prototype member behaves
  // like any other »).
  return Object.hasOwn(INSPECTION, category) ? INSPECTION[category]! : INSPECTION_PRUDENTE;
}

/** The default refusal reasons — kept as the conservative row's, so any caller
 *  that has no category still offers something true. */
export const MOTIFS: readonly string[] = INSPECTION_PRUDENTE.motifs;

/** Le code de remise du prototype (§4 C9 — espace simple, ce n'est pas un montant). */
export const CODE_REMISE = '734 921';

/** « TAILLE M » → « M » (la ligne récap C5 et la checklist C8 du pixel source). */
export function varianteCourte(variant: string): string {
  return variant.replace(/^TAILLE\s+/i, '');
}

const fee = (q: ClienteQuote, d: Livraison): number => (d === 'tomorrow' ? q.feeTomorrow : q.feeToday);
const total = (q: ClienteQuote, d: Livraison): number => (d === 'tomorrow' ? q.totalTomorrow : q.totalToday);
/**
 * The SERVER'S OWN SPLIT for one mode on one leg — `undefined` for mode B
 * whenever the server did not price it. The caller must render nothing rather
 * than substitute a figure: that `undefined` is the whole of « never print a
 * figure for a mode the server did not price ».
 *
 * The overload says the asymmetry out loud in the type: mode A always has a
 * split (there is no bill without a full-prepay price), mode B may not. A
 * caller that forgets the second case does not compile.
 */
export function splitFor(q: ClienteQuote, d: Livraison, mode: 'A'): ModeSplit;
export function splitFor(q: ClienteQuote, d: Livraison, mode: ModePaiement): ModeSplit | undefined;
export function splitFor(q: ClienteQuote, d: Livraison, mode: ModePaiement): ModeSplit | undefined {
  const legs = d === 'tomorrow' ? q.splitsTomorrow : q.splitsToday;
  return mode === 'A' ? legs.A : legs.B;
}
/**
 * SP3.3b2 — `payezMaintenant` IS GONE, and with it the last place in this
 * module that applied the CLIENT'S OWN RULE about what a payment mode means
 * (« A pays the total, B pays the fee »).
 *
 * SP3.3b1 re-pointed C5's CTA, its operator screens and its two §6.1 lines at
 * the SERVER'S carried split (`splitFor`) and left exactly one caller behind:
 * C6, which states the CONFIRMED amount. C6 now reads the same split, so every
 * franc the buyer sees between choosing and confirming comes from one byte.
 *
 * WHY THE RULE HAD TO DIE RATHER THAN BE KEPT AS A CROSS-CHECK: `flow.ts`
 * called it as `fmtPayezMaintenant(q, delivery, state.pay ?? 'B')`. On any C6
 * mount where she had not chosen — a direct mount is the reachable one — that
 * `?? 'B'` INVENTED a mode and then stated its fee as a confirmed payment. A
 * fallback amount on a confirmation screen is not a smaller bug than a wrong
 * one: it says the operator confirmed a figure she never agreed to.
 */

/* ------------------------------------------------------------- chrome ---- */

function backBtn(action: string): string {
  return `<button class="cl-round-btn" data-action="${action}" aria-label="Retour">${iconBack(17)}</button>`;
}

function stepHead(action: string, title: string): string {
  return `<div class="cl-stephead">${backBtn(action)}<div class="cl-steptitle">${title}</div></div>`;
}

export function renderOffline(): string {
  return `<div class="cl-offline" data-role="offline-banner">${iconWifiOff(14)}Hors ligne : vos actions sont en attente, jamais perdues.</div>`;
}

export function renderSkeleton(): string {
  return [
    '<div class="cl-skel" data-screen="squelette">',
    '<div class="cl-skel-title"></div><div class="cl-skel-photo"></div><div class="cl-skel-name"></div><div class="cl-skel-band"></div><div class="cl-skel-cta"></div>',
    '</div>',
  ].join('');
}

/* ----------------------------------------------------------------- C1 ---- */

/** The hero image ref, or `undefined` when this product has none. */
function hero(m: ClienteProduit): string | undefined {
  const first = m.assetRefs[0];
  return first !== undefined && first !== '' ? first : undefined;
}

/**
 * C1's PHOTO FRAME — the FIFTH STATE (REAL-PRODUCT-RENDER-1, founder-deferred
 * from BUYER-REAL-HONESTY-1 because C1 carried the SAME seed dependency the
 * vitrine did: the frame drew a `VITRINE_SEED` glyph, which a real product does
 * not have).
 *
 * WITH a hero ref: the real photograph fills the frame, and « PHOTO RÉELLE DU
 * PRODUIT » + « Photo réelle — ce que vous recevrez. » are TRUE — the promise is
 * kept, not made on credit.
 * WITHOUT one: the same woven, theme-derived ornament the tiles use, labelled
 * « SANS PHOTO », and the « photo réelle » sentence is NOT rendered. Promising a
 * real photo over an ornament was the lie this state removes; « sans photo »
 * describes what is true and promises nothing.
 */
function photoFrame(m: ClienteProduit, out: boolean): string {
  const src = hero(m);
  const ticks =
    '<div class="cl-tick cl-tick-tl"></div><div class="cl-tick cl-tick-tr"></div><div class="cl-tick cl-tick-bl"></div><div class="cl-tick cl-tick-br"></div>';
  const veil = out ? '<div class="cl-photo-veil"><span class="cl-epuise-stamp">ÉPUISÉ</span></div>' : '';
  if (src !== undefined) {
    // RESELLER-UX-2 item 4 (founder order — his own C1, his own lift): WITH a
    // photo the frame is a TAP TARGET onto the full gallery, because the wire
    // carries EVERY capture (hero + the proof shot) and only [0] rendered here.
    // The photo count rides the corner when there is more than one, so a second
    // photo is discoverable rather than secret. Sans photo: no affordance.
    const count = m.assetRefs.filter((r) => r !== '').length;
    // VIDEO-PARTOUT — a product with a clip plays it IN the frame, with the
    // photograph as poster so a slow connection still sees the product at once
    // and the clip's bytes flow only when it plays. Same honesty kit as the
    // vitrine card (muted · playsinline · loop · metadata-only) and the same
    // `data-role`, so the existing scroll observer adopts it with no wiring.
    // The frame stays the SAME tap target onto the gallery — the clip does not
    // steal the photographs' affordance; « PHOTO RÉELLE » still describes them.
    const clip = m.videoRef !== undefined && m.videoRef !== '' ? m.videoRef : undefined;
    const art =
      clip !== undefined
        ? `<video class="cl-photo-img" data-role="video-hero" src="${esc(clip)}" poster="${esc(src)}" muted playsinline loop preload="metadata"></video>`
        : `<img class="cl-photo-img" src="${esc(src)}" alt="" decoding="async">`;
    return [
      `<div class="cl-photo" data-role="photo-reelle" data-action="photo-galerie" role="button" tabindex="0" aria-label="Voir les photos">`,
      art,
      ticks,
      '<div class="cl-photo-caps">PHOTO RÉELLE DU PRODUIT</div>',
      count > 1 ? `<div class="cl-photo-count">${count} photos</div>` : '',
      veil,
      '</div>',
    ].join('');
  }
  return [
    '<div class="cl-photo cl-photo-sansphoto" data-role="photo-sans">',
    '<div class="cl-weave"></div>',
    ticks,
    '<div class="cl-photo-caps">SANS PHOTO</div>',
    veil,
    '</div>',
  ].join('');
}

export function renderC1(m: ClienteProduit, o: { epuise: boolean; sansVoix: boolean }): string {
  const out = o.epuise;
  const pbPill = out
    ? '<span class="cl-pb-pill">ÉPUISÉ</span>'
    : `<span class="cl-pb-pill">PAGE SIGNÉE ${iconCheck(10, 3)}</span>`;
  const pbFoot = out
    ? 'Le prix reste signé — il reviendra tel quel si le stock revient.'
    : 'Livraison Séra en plus — affichée à part, jamais cachée.';
  const voix = !o.sansVoix && m.voiceDuree
    ? [
        '<div class="cl-voix" data-role="voix">',
        `<button class="cl-voix-play" data-action="voix-lire"${m.voiceUrl ? ` data-voix-url="${esc(m.voiceUrl)}"` : ''} aria-label="Écouter la voix d’${esc(m.prenom)}">${iconPlay(16)}</button>`,
        '<div class="cl-voix-col"><div class="cl-voix-top">',
        `<span class="cl-voix-title">La voix d’${esc(m.prenom)}</span><span class="cl-voix-dur">${esc(m.voiceDuree)}</span>`,
        '</div><div class="cl-wave">',
        VOICE_WAVE_HEIGHTS.map((h) => `<span class="cl-wavebar" style="height:${h}px;"></span>`).join(''),
        '</div></div></div>',
      ].join('')
    : '';
  return [
    '<div class="cl-screen" data-screen="C1">',
    '<div class="cl-head">',
    `<div class="cl-avatar">${esc(m.prenom.charAt(0).toUpperCase())}</div>`,
    `<div class="cl-idcol"><div class="cl-shopname">${esc(m.shopName)}</div>`,
    `<div class="cl-verirow"><span class="cl-veri-txt">Vendeuse vérifiée</span> <span class="cl-veri-check">${iconCheck(13, 2.6)}</span><span class="cl-dotsep">·</span><button class="cl-voir" data-action="voir-boutique" data-slug="${esc(m.slug)}">Voir la boutique ›</button></div></div>`,
    `<button class="cl-shield" data-action="ouvrir-protections" aria-label="Vos protections">${iconShieldCheck(18, 1.9)}</button>`,
    '</div>',
    photoFrame(m, out),
    `<div class="cl-caption-row">${hero(m) !== undefined ? '<span>Photo réelle — ce que vous recevrez.</span>' : '<span></span>'}<span class="cl-vendu">Vendu par ${esc(m.prenom)}</span></div>`,
    `<div class="cl-prodtitle">${esc(m.productName)}</div>`,
    `<div class="cl-chiprow">${m.variant ? `<span class="cl-variant">${esc(m.variant)}</span>` : ''}<span class="cl-prod-zone">${esc(m.zone)}</span></div>`,
    voix,
    `<div class="cl-pb${out ? ' cl-pb-epuise' : ''}" data-role="price-band">`,
    '<div class="cl-pb-fil"></div><div class="cl-pb-tex"></div><div class="cl-pb-inner">',
    `<div class="cl-pb-top"><span class="cl-pb-overline">PRIX</span>${pbPill}</div>`,
    `<div class="cl-pb-amount"><span class="cl-pb-hero">${groupFr(m.priceFcfa)}</span><span class="cl-pb-suffix">${NNBSP}FCFA</span></div>`,
    `<div class="cl-pb-foot">${pbFoot}</div>`,
    '</div></div>',
    '<div class="cl-trust">',
    `<div class="cl-trust-row"><span class="cl-trust-ic">${iconScooter(17, 1.8)}</span><span class="cl-trust-txt">Livré par Séra, à votre repère</span></div>`,
    `<div class="cl-trust-row"><span class="cl-trust-ic">${iconShieldCheck(17, 1.8)}</span><span class="cl-trust-txt">Paiement protégé — inspectez avant de payer</span></div>`,
    `<button class="cl-trust-link" data-action="ouvrir-protections"><span class="cl-trust-ic">${iconLock(16, 1.9)}</span><span class="cl-trust-link-txt">Vos protections</span><span class="cl-trust-chev">${iconChevron(14)}</span></button>`,
    '</div>',
    out ? `<div class="cl-epuise-card">Ce produit est épuisé pour le moment. Revenez voir la boutique d’${esc(m.prenom)} — elle ajoute souvent de nouveaux articles.</div>` : '',
    `<button class="cl-cta cl-cta-c1${out ? ' cl-cta-off' : ''}" data-action="commander"${out ? ' disabled' : ''}>Commander</button>`,
    '<div class="cl-footnote">Votre numéro reste privé.</div>',
    '</div>',
  ].join('');
}

/* ----------------------------------------------------------------- C3 ---- */

export interface C3State {
  readonly zone: string | null;
  readonly repere: string;
  readonly indic: string;
  /** BC-1b — her number, for the delivery and for nothing else. */
  readonly phone: string;
  readonly voice: VoiceEtat;
  readonly recTime: string;
  readonly canContinue: boolean;
}

function renderVoiceBlock(s: C3State): string {
  switch (s.voice) {
    case 'idle':
      return `<button class="cl-voice-idle" data-action="voix-demarrer">${iconMic(17)}Enregistrer le repère</button>`;
    case 'recording':
      return [
        '<div class="cl-voice-rec" data-role="voice-recording">',
        '<span class="cl-rec-dot"></span>',
        `<span class="cl-rec-time" data-role="rec-time">${esc(s.recTime)}</span>`,
        '<button class="cl-rec-stop" data-action="voix-arreter">ARRÊTER</button>',
        '</div>',
        '<div class="cl-rec-hint">Parlez comme au marché : « Face à la pharmacie, portail bleu. »</div>',
      ].join('');
    case 'recorded':
      return [
        '<div class="cl-voice-done" data-role="voice-recorded">',
        `<button class="cl-voice-done-play" data-action="voix-lire-note" aria-label="Écouter">${iconPlaySmall(13, 14)}</button>`,
        `<span class="cl-voice-done-wave">${RECORDED_WAVE_SVG}</span>`,
        `<span class="cl-voice-done-time">${esc(s.recTime)}</span>`,
        '<button class="cl-refaire" data-action="voix-refaire">REFAIRE</button>',
        '</div>',
      ].join('');
    case 'queued':
      return `<div class="cl-voice-note cl-voice-queued" data-role="voice-queued">${iconClock(16)}Note vocale gardée. C’est noté — en attente du réseau.</div>`;
    case 'refused':
      return `<div class="cl-voice-note cl-voice-refused" data-role="voice-refused">${iconMicOff(16)}Le micro n’est pas disponible. Écrivez le repère au-dessus — ça marche aussi bien.</div>`;
  }
}

export function renderC3(s: C3State): string {
  return [
    '<div class="cl-screen" data-screen="C3">',
    stepHead('retour-c1', 'Où livrer ?'),
    '<div class="cl-intro">Pas besoin d’adresse — ici, un bon repère vaut mieux. Le livreur connaît la ville.</div>',
    '<div class="cl-overline">Votre zone</div>',
    '<div class="cl-chips">',
    ZONES.map((z) => `<button class="cl-chip${s.zone === z ? ' cl-chip-on' : ''}" data-action="zone" data-zone="${esc(z)}">${esc(z)}</button>`).join(''),
    '</div>',
    '<div class="cl-overline">Le repère</div>',
    `<input class="cl-field" data-role="repere" value="${esc(s.repere)}" placeholder="Ex. : Face à la pharmacie du marché">`,
    `<input class="cl-field cl-field-indic" data-role="indic" value="${esc(s.indic)}" placeholder="Indication en plus (facultatif)">`,
    '<div class="cl-overline">Ou dites-le de vive voix</div>',
    renderVoiceBlock(s),
    /**
     * BC-1b — HER NUMBER, WITH ITS CAUSE STATED (founder-approved dispatch
     * contact). It sits AFTER the address block because it belongs to the
     * same question — « où livrer ? » — and BEFORE the privacy line, which
     * now covers it: the number goes to the delivery organiser and nowhere
     * else, never to the seller, never on any public page. That is what
     * keeps every « Votre numéro reste privé » in this app a true sentence.
     */
    '<div class="cl-overline">Votre numéro, pour la livraison</div>',
    `<input class="cl-field" data-role="phone" type="tel" inputmode="tel" value="${esc(s.phone)}" placeholder="Ex. : 70 12 34 56">`,
    `<div class="cl-privline">${iconLock(14)}Le livreur passe par un relais. Votre numéro reste privé.</div>`,
    `<button class="cl-cta cl-cta-c3${s.canContinue ? '' : ' cl-cta-off'}" data-action="continuer-c3"${s.canContinue ? '' : ' disabled'}>Continuer</button>`,
    '</div>',
  ].join('');
}

/* ----------------------------------------------------------------- C4 ---- */

export interface C4State {
  readonly zone: string;
  readonly repereRecap: string;
  readonly delivery: Livraison | null;
  /**
   * TRUE when the SERVER priced this delivery (SP3.2b). Canon prices ONE fee per
   * zone pair — `DeliveryFeeQuote{zoneFrom, zoneTo, fee, serviceable, version}`
   * carries no delivery-speed dimension — so there is nothing to choose between:
   * one line, no cards, no time-window promise, and the CTA live on arrival. A
   * second « demain, un peu moins chère » card at the same fee would be a tariff
   * nobody has promised and a delivery window nobody has committed to.
   *
   * ABSENT ⇒ the two-card render, byte-for-byte as it was, which is what the
   * `?demo-cliente=` harness still drives off the composed mock quote.
   */
  readonly ligneUnique?: boolean | undefined;
}

export function renderC4(q: ClienteQuote, s: C4State): string {
  const options: ReadonlyArray<{ k: Livraison; title: string; feeF: string; sub: string }> = [
    { k: 'today', title: 'Aujourd’hui, avant 19 h', feeF: fmtFCFA(q.feeToday), sub: 'Un livreur Séra vérifie et scelle le colis avant de partir.' },
    { k: 'tomorrow', title: 'Demain, 9 h – 12 h', feeF: fmtFCFA(q.feeTomorrow), sub: 'Course groupée dans votre zone — un peu moins chère.' },
  ];
  // The one server-priced line: her destination, Séra's fee, the custody
  // sentence. Not a button — there is no second thing to pick.
  const ligne = [
    // A PLAIN card, deliberately NOT `cl-opt-on`: the accent border and the
    // check mark mean « you chose this », and she chose nothing. It states a
    // fact. The one primary action on this screen stays the CTA.
    '<div class="cl-opt" data-role="livraison-unique">',
    `<div class="cl-opt-row"><span class="cl-opt-title">Livraison par Séra</span><span class="cl-opt-fee">${fmtFCFA(q.feeToday)}</span></div>`,
    '<div class="cl-opt-sub">Un livreur Séra vérifie et scelle le colis avant de partir.</div>',
    '</div>',
  ].join('');
  const can = s.ligneUnique === true || s.delivery !== null;
  return [
    '<div class="cl-screen" data-screen="C4">',
    stepHead('retour-c3', 'La livraison'),
    '<div class="cl-recap">',
    `<span class="cl-recap-flag">${iconFlag(18)}</span>`,
    `<div class="cl-recap-col"><div class="cl-recap-zone">${esc(s.zone.toUpperCase())}</div><div class="cl-recap-rep">${esc(s.repereRecap)}</div></div>`,
    '<button class="cl-modifier" data-action="retour-c3">MODIFIER</button>',
    '</div>',
    '<div class="cl-law">Le prix de la course est fixé par Séra. Il est affiché à part — jamais caché dans le prix du produit.</div>',
    s.ligneUnique === true ? ligne : options.map((o) => {
      const on = s.delivery === o.k;
      return [
        `<button class="cl-opt${on ? ' cl-opt-on' : ''}" data-action="choix-livraison" data-choix="${o.k}">`,
        on ? `<span class="cl-opt-mark">${iconCheck(14, 3)}</span>` : '',
        `<div class="cl-opt-row"><span class="cl-opt-title">${o.title}</span><span class="cl-opt-fee">${o.feeF}</span></div>`,
        `<div class="cl-opt-sub">${o.sub}</div>`,
        '</button>',
      ].join('');
    }).join(''),
    '<div class="cl-quote">La course est payée à Séra. Chaque franc a sa place.</div>',
    `<button class="cl-cta cl-cta-step${can ? '' : ' cl-cta-off'}" data-action="continuer-c4"${can ? '' : ' disabled'}>Continuer</button>`,
    '</div>',
  ].join('');
}

/* --------------------------------------------------------------- REFUS ---- */

/**
 * THE HONEST REFUSAL SURFACE (SP3.2b · French Voice Standard §10.5).
 *
 * The service answers a NAME, never a wall: `listing_unknown`, `listing_not_live`,
 * `delivery_not_serviceable`, `attribution_missing`, `attribution_mismatch`,
 * `checkout_killed`, `expired`, `already_reserved`, `request_key_reused`,
 * `quote_not_issuable`, `stored_*`. This is where each name becomes one true
 * French sentence a buyer can act on.
 *
 * THE RULES THIS SURFACE KEEPS, and why each one is here:
 *   · ONE cause, ONE consequence, ONE action. « Le refus est aussi digne que
 *     l'achat » — the refusal path gets the same hierarchy as the purchase path,
 *     not an error wall with an OK button.
 *   · « Rien n'a été payé. » on every money refusal. That is the sentence that
 *     makes someone calmer, and it is TRUE at every point this surface is
 *     reachable: no leg exists until the provider confirms one (SP3.3).
 *   · NEVER « en attente », NEVER « c'est noté » here. A price we could not get
 *     is not a queued action; queued = pending, never done (Ten Laws #7), and
 *     nothing at all is queued on this screen.
 *   · An UNKNOWN name gets the generic sentence, never the raw name. A server
 *     word on a buyer's screen is a leak and an insult at the same time.
 *   · No blame, no « erreur », no code number, no « veuillez ».
 */
interface RefusVue {
  readonly overline: string;
  readonly titre: string;
  readonly phrase: string;
  /**
   * `null` = NO primary action, deliberately. Used only where every in-app
   * action provably fails, so a button would be a false affordance; the
   * `stepHead` back arrow still means she is never trapped.
   */
  readonly action: string | null;
  readonly libelle: string;
}

const REFUS_GENERIQUE: RefusVue = {
  overline: 'LE PRIX',
  titre: 'Nous ne pouvons pas afficher le prix.',
  phrase: 'Réessayez dans un instant. Rien n’a été payé.',
  action: 'reessayer-prix',
  libelle: 'Réessayer',
};

const REFUS: Readonly<Record<string, RefusVue>> = {
  listing_unknown: {
    overline: 'L’ARTICLE',
    titre: 'Cet article n’est plus dans cette boutique.',
    phrase: 'Il a été retiré. Rien n’a été payé.',
    action: 'voir-boutique',
    libelle: 'Voir la boutique',
  },
  not_found: {
    overline: 'L’ARTICLE',
    titre: 'Cet article n’est plus dans cette boutique.',
    phrase: 'Il a été retiré. Rien n’a été payé.',
    action: 'voir-boutique',
    libelle: 'Voir la boutique',
  },
  listing_not_live: {
    overline: 'L’ARTICLE',
    titre: 'Cet article n’est plus en vente.',
    phrase: 'La vendeuse l’a retiré. Rien n’a été payé.',
    action: 'voir-boutique',
    libelle: 'Voir la boutique',
  },
  delivery_not_serviceable: {
    overline: 'LA LIVRAISON',
    titre: 'Séra ne livre pas encore ici.',
    phrase: 'Essayez une autre zone. Rien n’a été payé.',
    action: 'retour-c3',
    libelle: 'Changer de zone',
  },
  attribution_missing: {
    overline: 'LE LIEN',
    titre: 'Ce lien ne permet pas de commander.',
    phrase: 'Demandez à la vendeuse son lien à jour. Rien n’a été payé.',
    action: 'voir-boutique',
    libelle: 'Voir la boutique',
  },
  attribution_mismatch: {
    overline: 'LE LIEN',
    titre: 'Ce lien ne permet pas de commander.',
    phrase: 'Demandez à la vendeuse son lien à jour. Rien n’a été payé.',
    action: 'voir-boutique',
    libelle: 'Voir la boutique',
  },
  checkout_killed: {
    overline: 'LES COMMANDES',
    titre: 'Les commandes sont suspendues un moment.',
    // The sentence and the button now say the SAME thing (verifier copy note):
    // « Revenez dans un moment » under a button labelled « Réessayer » told her
    // to do two different things at once.
    phrase: 'Réessayez dans un moment. Rien n’a été payé.',
    action: 'reessayer-prix',
    libelle: 'Réessayer',
  },
  expired: {
    overline: 'LE PRIX',
    titre: 'Ce prix a expiré.',
    phrase: 'Un prix ne reste affiché qu’un moment. Rien n’a été payé.',
    action: 'prix-a-jour',
    libelle: 'Voir le prix à jour',
  },
  already_reserved: {
    overline: 'LA COMMANDE',
    titre: 'Cette commande est déjà en cours.',
    phrase: 'Elle est gardée un court moment. Attendez, puis réessayez.',
    action: 'reessayer-prix',
    libelle: 'Réessayer',
  },
  unreachable: {
    overline: 'HORS LIGNE',
    titre: 'Pas de connexion.',
    phrase: 'Le prix ne peut pas être affiché sans réseau. Rien n’a été payé.',
    action: 'reessayer-prix',
    libelle: 'Réessayer',
  },
  /**
   * ═══ THE REFUSALS WHOSE ONLY CURE IS A NEW KEY (verifier BLOCKER 6) ═══
   *
   * « Réessayez dans un instant » + « Réessayer » re-sends the IDENTICAL body
   * under the IDENTICAL stored request key. For these four names that is the
   * one thing guaranteed to fail forever — the verifier watched the same uuid
   * go out four times against a 409 `request_key_reused`. Telling someone to
   * retry into a wall we built is worse than saying nothing.
   *
   * They get the KEY-MINTING action instead (`prix-a-jour` → `forgetRequestKey`
   * → a new key on the wire), under a label that says what will happen.
   */
  request_key_reused: {
    overline: 'LE PRIX',
    titre: 'Ce prix ne peut plus être utilisé.',
    phrase: 'Nous en demandons un nouveau. Rien n’a été payé.',
    action: 'prix-a-jour',
    libelle: 'Demander un nouveau prix',
  },
  bad_field: {
    overline: 'LE PRIX',
    titre: 'Nous ne pouvons pas afficher le prix.',
    phrase: 'Demandons-en un nouveau. Rien n’a été payé.',
    action: 'prix-a-jour',
    libelle: 'Demander un nouveau prix',
  },
  malformed: {
    overline: 'LE PRIX',
    titre: 'Nous ne pouvons pas afficher le prix.',
    phrase: 'Demandons-en un nouveau. Rien n’a été payé.',
    action: 'prix-a-jour',
    libelle: 'Demander un nouveau prix',
  },
  unknown_field: {
    overline: 'LE PRIX',
    titre: 'Nous ne pouvons pas afficher le prix.',
    phrase: 'Demandons-en un nouveau. Rien n’a été payé.',
    action: 'prix-a-jour',
    libelle: 'Demander un nouveau prix',
  },
  /**
   * No CSPRNG on this device — `mintUuid` found neither API.
   *
   * NO PRIMARY ACTION, on purpose (verifier ITEM 4). It used to offer
   * « Réessayer », which re-enters the same mint and refuses again,
   * deterministically — the verifier watched four identical refusals and zero
   * HTTP asks, the same false affordance the round-3 finding removed from the
   * other four names. The remedy is OUTSIDE this app and the sentence already
   * says so; every in-app button would be a lie about what tapping it does.
   * « Voir la boutique » was the other option and was rejected: browsing leads
   * to the same wall at the same mint, so it merely postpones the dead end.
   * The `stepHead` back arrow remains, so she is not trapped.
   */
  no_secure_random: {
    overline: 'LE PRIX',
    titre: 'Ce téléphone ne peut pas ouvrir la commande.',
    phrase: 'Essayez depuis un autre navigateur. Rien n’a été payé.',
    action: null,
    libelle: '',
  },
};

/* ═══════════════════ COPY-LINT REGION · messages ═════════════════════════ */

/**
 * The short spoken messages the flow raises as toasts. They live here, beside
 * the refusal copy, so the `copy-lint-inline-refus` gate reads them too — a
 * user-facing money sentence that lives in `flow.ts` would have no gate.
 */
export const MESSAGES = {
  /** The price was re-asked automatically because the old one had run out. */
  prixRafraichiIdentique: 'Nouveau prix demandé. Le montant n’a pas changé.',
  /** …and the amount moved. The new total is appended by the caller. */
  prixRafraichiDifferent: 'Le prix a été mis à jour. Nouveau total :',
  /** While the new price is on its way. */
  prixEnCoursDeMiseAJour: 'Nous demandons un nouveau prix…',
  /**
   * THE PAYMENT SCREEN'S « Écouter la note » WOULD NOT PLAY (founder ruling
   * 2026-07-30). The note EXISTS — C5 renders no control otherwise — and this
   * browser refused to start it: an autoplay policy, a codec it cannot decode,
   * a media element the OS took away.
   *
   * IT SAYS ONLY WHAT IS TRUE, and in particular it is NOT C1's « (démo) »
   * toast. That fallback claims she heard a demonstration; here she heard
   * nothing, and a sentence about a demo on the screen where she commits her
   * money is the mock-impersonating-a-feature this project keeps out (Ten Laws
   * #5 · Execution Contract §3). No blame, no code, nothing about her network —
   * the note is on this page, so the network is not the story.
   */
  noteInjouable: 'La note ne se lance pas sur ce téléphone.',
} as const;

/**
 * ═══ THE §6.1 TWO-OPTION CHECKOUT COPY (SP3.3b1) ═══
 *
 * `docs/Shop-Plus-Build-Spec.md` §6.1, VERBATIM. Not paraphrased, not
 * softened, not re-registered — the spec wrote these sentences and this table
 * is where they live so the `copy-lint-inline-refus` gate reads them exactly as
 * it reads the refusal table. They are `register: money`, `screenClass:
 * checkout` — the reading budget the i18n data says is « seeded to accept the
 * canonical Shop+ §6.1 checkout copy ».
 *
 * TWO DEPARTURES FROM THE MARKDOWN'S BYTES, both typographic, neither a
 * paraphrase: the module's apostrophe is U+2019 throughout (its header decrees
 * it), and the narrow no-break space before FCFA is the `\u202f` escape, never
 * a raw byte (`money.ts`'s décret; the source scan locks it).
 *
 * THE PLACEHOLDERS `{X}` `{Y}` `{D}` are the spec's own notation and are filled
 * with `groupFr(…)` of a SERVER byte at render time — never with anything this
 * app computed, and never with prose. The gate allows exactly these three and
 * fails on any other `{…}`: a money sentence assembled at runtime out of
 * unknown parts cannot be linted as the buyer reads it.
 *
 * THE TWO WORDS §6.1 FORBIDS BY NAME — the custody-of-funds pair, French and
 * English — appear nowhere here and nowhere else in this app. The gate scans
 * the whole buyer source for them, comments, class names and data attributes
 * included, which is why this comment names them by description and not by
 * spelling: a gate that its own subject can talk its way around is not a gate.
 */
export const PAIEMENT = {
  /** §6.1's first bold line — X is the chosen mode's `amountPaidAtCheckout`. */
  ligneMaintenant: 'À payer maintenant\u00a0:\u00a0{X}\u202fFCFA',
  /** …and the second — Y is that same mode's `amountDueAtDelivery`. */
  ligneLivraison: 'À payer à la livraison : {Y}\u202fFCFA',
  /** Option A's label. « recommandé » IS the label, per §6.1. */
  titreA: 'Tout payer maintenant — recommandé',
  corpsA: 'Votre paiement est protégé auprès de notre partenaire de paiement jusqu’à la confirmation de votre livraison. Le vendeur n’est payé qu’après validation.',
  /** Option B's label — the spec's full name, so the unavailable block and the
   *  card call the same option the same thing. */
  titreB: 'Payer le produit à la livraison',
  /**
   * OPTION B'S TAIL, HELD TOGETHER (round 5, founder reversal of « leave it »).
   *
   * Round 4 measured this title at 0.362 against the 0.35 orphan bar and left
   * it, calling the margin a founder decision. The founder reversed that, and
   * the reasoning belongs here rather than in a commit message:
   *   · IT IS NOT PASSING BECAUSE IT IS WELL SET. It clears the bar by 1.2% on
   *     the accident that « livraison » is nine letters long. A margin that thin
   *     means the next person to trip the guard is someone making a routine copy
   *     tweak, not the person who caused the defect — and that is how a guard
   *     dies: not by being deleted, but by being resented.
   *   · WHAT IT STRANDS IS THE OPTION'S IDENTITY WORD. The title broke as
   *     « Payer le produit à la / livraison », leaving the one word that says
   *     WHICH option this is alone on its own line.
   *   · THE ALTERNATIVE WAS AN EXEMPTION FOR TITLES, and that would have been
   *     the FOURTH narrowing of this sweep in a row (by selector, by state, by
   *     computed display). Each of the previous three hid a real defect.
   *
   * Same device as `rediteFin` and `cl-reconcile-promesse`, for the third time
   * on this screen: the tail is one no-wrap unit, so the break falls before it
   * and reads « Payer le produit / à la livraison ». It carries no amount, so it
   * cannot grow with the basket and cannot force a horizontal scroll. It is a
   * SUBSTRING of `titreB` — pinned as one by test, because a `.replace` that
   * stops matching is a silent no-op.
   */
  titreBFin: 'à la livraison',
  corpsB: 'Payez seulement les frais de livraison ({D}\u202fFCFA) maintenant. À l’arrivée du livreur, vérifiez votre article, puis payez le montant du produit de manière sécurisée avant de le recevoir.',
  /** The clause §6.1 sets in bold inside `corpsB`. Held apart so the emphasis
   *  is markup the renderer adds, and the copy stays copy. */
  corpsBAccent: 'avant de le recevoir',
  avertissementB: 'Frais de livraison non remboursables si vous annulez ou êtes absent(e).',
  /** The one-line replay before payment (§6.1), mode B — both legs are real. */
  redite: 'Vous payez {X}\u202fFCFA maintenant et {Y}\u202fFCFA à la livraison — d’accord ?',
  /**
   * …and mode A's, which is THE SAME NORMATIVE SENTENCE.
   *
   * FOUNDER RULING (2026-07-30). This field used to read « … maintenant, et
   * rien à la livraison — d'accord ? ». It now uses §6.1's form in BOTH modes,
   * so « Tout payer maintenant » replays as « … et 0 FCFA à la livraison —
   * d'accord ? ». Recorded here as DECIDED, not assumed, with the reasoning:
   *   · §6.1 is NORMATIVE and gives ONE sentence, not two. Writing a second one
   *     is interpreting a money sentence, and that is not ours to do.
   *   · The mode A CARD already renders « À payer à la livraison : 0 FCFA », so
   *     the screen was taking both positions at once — a zero on the card and
   *     « rien » in the replay, a few lines apart.
   *   · A VISIBLE ZERO is what makes the two options comparable at a glance,
   *     and that comparison is the entire reason §6.1 puts both lines in front
   *     of her BEFORE she chooses.
   *
   * It stays its own field, byte-identical to `redite`, so both sentences a
   * buyer can read are extracted and linted BY NAME and a deletion still fails
   * the gate's structural floor. The test pinning the two equal is what stops
   * one from being edited without the other.
   */
  rediteA: 'Vous payez {X}\u202fFCFA maintenant et {Y}\u202fFCFA à la livraison — d’accord ?',
  /**
   * THE CLOSING CLAUSE, HELD TOGETHER (round 4, founder review).
   *
   * At 360px the replay wrapped « … à la livraison — » / « d'accord ? », leaving
   * the QUESTION SHE IS BEING ASKED alone on a third line at 28.6% of the block
   * — under the 0.35 orphan threshold this screen already enforces on the
   * honesty line, and §6.1 calls this « a one-line replay », not a three-line
   * one. Same cure as `cl-reconcile-promesse`: the tail is one no-wrap unit, so
   * the break falls BEFORE it and the sentence can only ever end on a full
   * line. It is a SUBSTRING of both replay fields, so one rule covers both
   * modes, and it never grows with the amount — the francs are all upstream of
   * it, which is why gluing here cannot overflow a 360px card.
   */
  rediteFin: 'à la livraison — d’accord ?',
  /**
   * « ÉCOUTER LA NOTE » — THE RESELLER'S OWN RECORDED NOTE, ON THE PAYMENT
   * SCREEN (FOUNDER RULING 2026-07-30; the reversal it carries is recorded at
   * the C5 header).
   *
   * IT NAMES WHOSE VOICE IT IS, and that is the whole reason for this wording
   * rather than a bare « Écouter la note ». §6.1 also asks for a PER-OPTION
   * audio note — a recorded explanation of options A and B — which does not
   * exist and is not built. A label that did not say whose voice this is would
   * sit two elements above « Comment payer ? » and read as that missing
   * explanation, which would be a promise this screen cannot keep. « de la
   * vendeuse » is the word this app already uses for her everywhere else
   * (« Vendeuse vérifiée », « Préparée par la vendeuse »).
   */
  ecouterNote: 'Écouter la note de la vendeuse',
} as const;

/**
 * ═══ C6'S POST-PAYMENT COPY (SP3.3c) — THE TWO STATES THAT USED NOT TO EXIST ═══
 *
 * Until this slice, C6 had one ending: 2 400 ms after she tapped Payer, a
 * `setTimeout` rendered « Paiement de 12 500 FCFA confirmé par l'opérateur. »
 * No operator had answered. No webhook had arrived. On the deployed preview —
 * which is built WITH a service base — that sentence sat in front of a REAL
 * reservation held on a REAL quote, and it was false every time.
 *
 * The confirmation now comes from the order's own state, and the states the
 * server can actually be in needed sentences. These are those sentences.
 *
 * ═══ WHY « attente » IS NOT « pending » ═══
 *
 * `pending` already exists and says « En attente du réseau. Votre commande est
 * gardée sur ce téléphone. » That is TRUE when the request never left. It is a
 * LIE when the service answered, holds her order, and is itself waiting on the
 * operator — she is told her phone is the problem while standing on full 4G.
 * It is the identical distinction the quote port draws between `unreachable`
 * and `unreadable`, one screen later and with more at stake.
 *
 * ═══ WHAT `echec` MAY NOT PROMISE ═══
 *
 * It does NOT say « rien ne vous a été prélevé ». `payment_failed` is reached
 * by the ordinary provider refusal AND by the `provider_amount_divergence`
 * fault, and `order-do.ts` says plainly of the latter that the provider may
 * have collected the amount it echoed. « Rien n'a été confirmé » is true on
 * every path here; « rien n'a été prélevé » is not, and the difference is a
 * buyer being told her money is safe when nobody knows that yet.
 *
 * Linted by `copy-lint-inline-refus.mjs` exactly as `REFUS` and `PAIEMENT` are,
 * on the same structural floor: a DELETED sentence fails as loudly as a
 * violated one.
 */
export const CONFIRMATION = {
  /** The order exists on the service; the operator has not answered. */
  attenteTitre: 'Nous attendons l’opérateur.',
  attenteCorps: 'Votre commande est bien enregistrée. Nous dirons « payé » seulement quand l’opérateur l’aura confirmé.',
  attenteChip: 'EN ATTENTE DE L’OPÉRATEUR',
  /** …and her way to ask again once the automatic checks have stopped. */
  attenteAction: 'Vérifier à nouveau',
  /**
   * THE READ DID NOT REACH THE SERVICE (verifier BLOCKER 2).
   *
   * Without this line « Vérifier à nouveau » was a silent no-op on a dead
   * link: she tapped, eight reads failed at the transport, and the screen was
   * byte-identical before and after. The one action she had acknowledged
   * nothing.
   *
   * IT SAYS WHAT FAILED AND WHAT DID NOT. The READ failed; the ORDER did not —
   * it exists because the service answered 200 when it was created, and no
   * unreachable read can undo that. So this adds a fact and takes none away,
   * which is exactly the line between « we learned nothing » and « something
   * went wrong with your payment ».
   */
  attenteHorsPortee: 'Nous n’arrivons pas à joindre le service pour l’instant. Votre commande est bien là.',
  /** The order's state came back `payment_failed`. No blame, no code, no wall. */
  echecTitre: 'Le paiement n’a pas abouti.',
  echecCorps: 'Rien n’a été confirmé. Votre commande vous attend — vous pouvez réessayer.',
  echecAction: 'Réessayer le paiement',
} as const;

/** The view a refusal name renders as — the generic one for every name this
 *  table does not know (`amounts_disagree`, `quote_not_issuable`, `stored_*`,
 *  `request_key_reused`, and anything the service grows next). */
export function refusVue(reason: string): RefusVue {
  return REFUS[reason] ?? REFUS_GENERIQUE;
}

export function renderRefus(reason: string): string {
  const v = refusVue(reason);
  return [
    `<div class="cl-screen" data-screen="REFUS" data-motif="${esc(reason)}">`,
    stepHead('retour-c3', 'Le prix'),
    '<div class="cl-sub">',
    `<div class="cl-sub-overline">${v.overline}</div>`,
    `<div class="cl-sub-title">${v.titre}</div>`,
    `<div class="cl-sub-body">${v.phrase}</div>`,
    '</div>',
    v.action === null ? '' : `<button class="cl-cta cl-cta-step" data-action="${v.action}">${v.libelle}</button>`,
    '</div>',
  ].join('');
}

/* ----------------------------------------------------------------- C5 ---- */

export interface C5State {
  readonly delivery: Livraison;
  readonly pay: ModePaiement | null;
  readonly paying: 'idle' | 'submitting' | 'provider';
  readonly bInel: boolean;
}

/**
 * ═══ « ÉCOUTER LA NOTE » ON THIS SCREEN — THE FOUR RULINGS ═══
 *
 * READ THIS BEFORE CHANGING ANYTHING HERE: the RESELLER'S OWN recorded note and
 * §6.1's PER-OPTION EXPLANATION are two different things, and taking one ruling
 * about one of them as a ruling about the other is what produced the churn
 * below.
 *
 * All four states are recorded because a reader who sees only the last one
 * cannot tell a settled decision from an unexamined default. His words:
 *
 *   · 2026-07-22 — REMOVED by founder override of HANDOFF §2/acceptance 4.
 *     Listening lives on the C1 player.
 *   · 2026-07-30 — REINSTATED: « I did not mean to remove the Écouter la note,
 *     reimplement it correctly so if a reseller adds a note the buyer will be
 *     able to listen it. »
 *   · 2026-07-30 — REMOVED AGAIN: « for ecouter notes on price leave removed do
 *     not change it. »
 *   · 2026-07-30 — RESTORED, and THIS IS THE OPERATIVE ONE. The founder
 *     clarified that the third ruling was aimed at §6.1's PER-OPTION
 *     EXPLANATION, not at the reseller's note: « i meant the per option
 *     explanation should stay unbuilt. »
 *
 * WHAT IT IS: the RESELLER'S OWN recorded note, played through the C1 player —
 * one audio element, one play call (`flow.ts` `jouerLaNote`). Never a second
 * audio implementation.
 *
 * WHEN IT APPEARS: exactly when `voiceUrl` exists, and never otherwise. No
 * note ⇒ NO control — not disabled, not greyed, not a toast. A control that
 * plays nothing is a promise this screen cannot keep, and this is the screen
 * where she decides to part with money. On the REAL path that is the common
 * case today: `profile.ts`'s real adapter returns no notes at all
 * (BUYER-REAL-HONESTY-1), and `clienteProduitReel` fills `voiceUrl` only from a
 * note that is `ready` AND has a url — so the honest outcome is no control.
 *
 * AND C1'S DEMO FALLBACK MUST NOT REACH HERE. C1 answers a missing url with a
 * « (démo) » toast; on this screen there is no missing-url branch to answer,
 * because there is no button without a url. The play FAILURE is handled by
 * `MESSAGES.noteInjouable`, which claims nothing about what she would have
 * heard (Ten Laws #5, Execution Contract §3).
 *
 * WHAT THIS IS *NOT*: §6.1's PER-OPTION AUDIO NOTE — a recorded explanation of
 * payment options A and B. That is platform copy read aloud, it needs the
 * founder's own two recordings, and it STAYS UNBUILT AND FLAGGED. A player
 * wired to a generated tone would be a mock impersonating a voice on the money
 * screen; absent and journalled beats present and untrue. The label says whose
 * voice this is precisely so the two can never be confused.
 *
 * THE HARNESS GAP, NAMED: under `?demo-cliente=` the seed's `voiceUrl` is
 * `DEMO_VOICE_URL`, a synthetic TONE flagged STOREFRONT-MEDIA-BACKING — the
 * same asset C1's player has always used there. The demo therefore plays a tone
 * where production will play a voice, and that is never evidence that recorded
 * voice works.
 */

/**
 * FILL §6.1's placeholders with SERVER BYTES.
 *
 * `groupFr` — never a second amount, never a sum: the copy carries the
 * NNBSP-FCFA suffix itself, and every value handed in here is one field of one
 * server quote. There is no `+` on this path and there must never be: « total =
 * X+Y » in §6.1 describes what the server's numbers mean, not an instruction to
 * add them, and the total the buyer reads is `buyerTotal`.
 */
function fillMontants(copy: string, montants: Readonly<Record<string, number>>): string {
  let out = copy;
  for (const [token, value] of Object.entries(montants)) out = out.split(`{${token}}`).join(groupFr(value));
  return out;
}

/**
 * OPTION B'S TITLE, with its tail as one no-wrap unit (see `PAIEMENT.titreBFin`).
 *
 * BOTH places that name option B read this: the payable card and the « Pas
 * disponible pour cette commande » head. One string, one rule, both sites — the
 * same reason `rediteFin` is a substring of both replay fields. The rendered
 * TEXT is byte-identical to `PAIEMENT.titreB`; only the break point changes.
 */
const TITRE_B = PAIEMENT.titreB.replace(
  PAIEMENT.titreBFin,
  `<span class="cl-titre-fin">${PAIEMENT.titreBFin}</span>`,
);

/** §6.1's two bold lines for ONE mode, from that mode's own server split. */
function lignesSplit(split: ModeSplit): string {
  return [
    `<div class="cl-payline" data-role="payline-maintenant">${fillMontants(PAIEMENT.ligneMaintenant, { X: split.paidNow })}</div>`,
    `<div class="cl-payline" data-role="payline-livraison">${fillMontants(PAIEMENT.ligneLivraison, { Y: split.dueAtDelivery })}</div>`,
  ].join('');
}

export function renderC5(m: ClienteProduit, q: ClienteQuote, s: C5State): string {
  const feeStr = fmtFCFA(fee(q, s.delivery));
  const totalStr = fmtFCFA(total(q, s.delivery));
  const produitStr = fmtFCFA(q.produitFcfa);
  /**
   * THE HONESTY LINE, IN TWO UNBREAKABLE HALVES (SP3.3b1, founder finding).
   *
   * At 360px the sentence needs 422px and the column is 273px, so it MUST wrap.
   * Wrapping it as one run left « sa place. » stranded alone on the second
   * line — the screen's own promise, rendered as a layout accident. The promise
   * clause is therefore its own element and its own no-wrap unit: the break can
   * only ever fall AT the em dash, so the identity reads on one line and the
   * promise on the next, on every engine, with no modern-CSS dependency (Ten
   * Laws #7 — the oldest WebView gets the same result as Chromium).
   *
   * The rendered TEXT is byte-identical to before: the tests below and the e2e
   * read it through `textContent`, which is what the buyer reads.
   */
  const reconcileIdentite = `${groupFr(total(q, s.delivery))} = ${groupFr(q.produitFcfa)} + ${groupFr(fee(q, s.delivery))} — `;
  const reconcile = `${reconcileIdentite}<span class="cl-reconcile-promesse">chaque franc a sa place.</span>`;
  // ANTI-ORPHAN (CI-caught 2026-07-30, latent since §6.1): « Robe brodée
  // bogolan · M » wraps here, and with a NARROWER face than Instrument Sans —
  // any phone whose fallback wins the font-display:optional race — the line
  // broke at the spaces around « · » and left the variant ALONE on line two
  // (8 % of the block). The separator's two spaces become non-breaking, so the
  // variant always travels with the word before it. The rendered TEXT is
  // unchanged; only where the browser may break is. `overflow-wrap: anywhere`
  // stays the safety valve, so a truly narrow box still breaks rather than
  // overflows.
  const ligneProduit = `${esc(m.productName)}${m.variant ? `&nbsp;·&nbsp;${esc(varianteCourte(m.variant))}` : ''}`;

  /**
   * HER VOICE, WHEN THERE IS ONE (founder ruling 2026-07-30 — see the header).
   *
   * THE CONDITION IS THE FEATURE: a url, or nothing at all. There is no empty
   * state, no disabled twin and no explanatory line, because every one of those
   * would be this screen mentioning a note that does not exist.
   *
   * WHERE IT SITS, AND WHY (5-second test). Below the bill and its honesty
   * line — which is where the ARTICLE is named and priced — and ABOVE the
   * « Comment payer ? » heading, outside the payment-options section entirely.
   * Read top to bottom the screen says: what you are buying · her words about
   * it · how to pay. Put inside or beside an option card it would read as the
   * per-option explanation §6.1 asks for and this app does not have.
   *
   * IT WHISPERS. One primary action per screen (§5): the CTA is the only thing
   * on this screen that looks like a button. This is a small underlined link
   * with the play glyph, icon paired with text.
   *
   * ITS OWN ACTION NAME, not C1's. `voix-lire` carries C1's « (démo) » toast
   * fallback; naming this handler separately is what keeps that fallback off
   * the money screen structurally rather than by care.
   */
  const ecouterNote =
    m.voiceUrl === undefined || m.voiceUrl === ''
      ? ''
      : `<button class="cl-ecouter" data-role="ecouter-note" data-action="voix-lire-paiement" data-voix-url="${esc(m.voiceUrl)}">${iconPlaySmall(13, 14)}${PAIEMENT.ecouterNote}</button>`;

  /* ═══ §6.1 — ONE AVAILABILITY DECISION, AND EVERY PART OF THE SCREEN OBEYS IT ═══
   *
   * THE DEFECT THIS CLOSES (fresh verifier, round 2). The CARD consulted two
   * signals — `s.bInel` and an absent split — but the REPLAY consulted only the
   * split and the CTA consulted neither. With `bInel: true` and a door split
   * still in hand, ONE screen rendered « Pas disponible pour cette commande »
   * beside « Vous payez … et … à la livraison — d'accord ? » under an ENABLED
   * Payer button. Not reachable through `flow.ts` today, which resets the mode;
   * but the comment here claimed render-level fail-closure, and a claim the code
   * does not keep is the species of lie this project exists not to ship.
   *
   * So availability is decided ONCE, and every consumer reads the SAME value:
   * `splitBPayable` is the door split ONLY when both signals agree. From it the
   * card, the replay, the CTA and the operator screens all follow. Fail-closed
   * is now structural — there is no second expression to drift.
   */
  const splitA = splitFor(q, s.delivery, 'A');
  /** The door split, or `undefined` when EITHER signal says mode B is off:
   *  the flow's flag, or a server that never priced the mode. */
  const splitBPayable = s.bInel ? undefined : splitFor(q, s.delivery, 'B');
  /**
   * THE SPLIT THE BUYER'S CHOSEN MODE IS PRICED BY — the one source for every
   * figure that follows her choice. `undefined` means « nothing is payable
   * here », which is a state with no amount, not a state with a fallback
   * amount: no mode chosen, or a chosen mode that is not payable on this
   * screen. The CTA is then disabled and carries no figure at all.
   */
  const chosen: ModeSplit | undefined = s.pay === 'A' ? splitA : s.pay === 'B' ? splitBPayable : undefined;
  /**
   * EVERY FRANC BELOW IS THE SERVER'S BYTE FOR THE MODE SHE CHOSE.
   *
   * This used to read `payezMaintenant`, i.e. « mode A pays the total, mode B
   * pays the fee » — the client re-encoding what a payment mode MEANS, which is
   * exactly what carrying the split removed from the two bold lines. The CTA
   * and the operator screens now read the same carried field the lines do, so
   * no two figures on this screen can come from two different rules.
   */
  const payNowStr = chosen === undefined ? '' : fmtFCFA(chosen.paidNow);
  const ctaLabel =
    chosen === undefined
      ? 'Choisissez pour continuer'
      : s.pay === 'A'
        ? `Payer ${payNowStr}`
        : `Payer ${payNowStr} maintenant`;
  const can = chosen !== undefined;
  // THE ONE-LINE REPLAY (§6.1), after she has chosen and before the payment
  // leaves. ONE SENTENCE, BOTH MODES, BOTH LEGS FILLED (founder ruling
  // 2026-07-30 — see `PAIEMENT.rediteA`): mode A's Y is the server's own 0, and
  // it is SHOWN, because the card above already shows it and because a visible
  // zero is what makes the two options comparable. Both fields are filled from
  // the SAME chosen split, so the replay can never quote a leg the card does
  // not.
  const redite =
    chosen === undefined
      ? ''
      : fillMontants(s.pay === 'A' ? PAIEMENT.rediteA : PAIEMENT.redite, {
          X: chosen.paidNow,
          Y: chosen.dueAtDelivery,
        }).replace(PAIEMENT.rediteFin, `<span class="cl-redite-fin">${PAIEMENT.rediteFin}</span>`);

  if (s.paying === 'submitting') {
    return [
      '<div class="cl-screen" data-screen="C5" data-etat="envoi">',
      stepHead('retour-c4', 'Le paiement'),
      '<div class="cl-sub">',
      '<div class="cl-sub-overline">ENVOI SÉCURISÉ</div>',
      '<div class="cl-sub-title">Un instant.</div>',
      `<div class="cl-sub-body">Nous envoyons votre demande de paiement de <b>${payNowStr}</b>\u00a0<span class="cl-envoi-fin">à l’opérateur.</span></div>`,
      '<div class="cl-bar-track"><div class="cl-bar-fill"></div></div>',
      '</div></div>',
    ].join('');
  }
  if (s.paying === 'provider') {
    return [
      '<div class="cl-screen" data-screen="C5" data-etat="operateur">',
      stepHead('retour-c4', 'Le paiement'),
      '<div class="cl-prov">',
      `<div class="cl-prov-phone">${iconPhone(30)}</div>`,
      '<div class="cl-prov-title">Confirmez sur votre téléphone</div>',
      `<div class="cl-prov-body">Composez votre <span class="cl-prov-cle">code secret <b>Orange Money</b></span> pour valider <b>${payNowStr}</b>.</div>`,
      '<div class="cl-prov-wait"><span class="cl-prov-dots"><span class="cl-prov-dot"></span><span class="cl-prov-dot"></span><span class="cl-prov-dot"></span></span><span>En attente de la confirmation de l’opérateur…</span></div>',
      '<div class="cl-prov-law">Rien n’est confirmé tant que l’opérateur n’a pas répondu. Nous ne dirons\u00a0jamais\u00a0le\u00a0contraire.</div>',
      '</div></div>',
    ].join('');
  }
  return [
    '<div class="cl-screen" data-screen="C5" data-etat="choix">',
    stepHead('retour-c4', 'Le paiement'),
    '<div class="cl-bill">',
    `<div class="cl-bill-row"><span>${ligneProduit}</span><b>${produitStr}</b></div>`,
    `<div class="cl-bill-row cl-bill-liv"><span>Livraison Séra — jamais\u00a0cachée</span><b>${feeStr}</b></div>`,
    `<div class="cl-bill-total"><span>Total</span><b>${totalStr}</b></div>`,
    '</div>',
    `<div class="cl-reconcile" data-role="reconcile">${reconcile}</div>`,
    ecouterNote,
    '<div class="cl-overline cl-overline-pay">Comment payer ?</div>',
    `<button class="cl-opt cl-payopt${s.pay === 'A' ? ' cl-opt-on' : ''}" data-action="choix-paiement" data-mode="A">`,
    s.pay === 'A' ? `<span class="cl-opt-mark">${iconCheck(14, 3)}</span>` : '',
    `<div class="cl-opt-row"><span class="cl-payopt-ic">${iconLockDot(17)}</span><span class="cl-opt-title">${PAIEMENT.titreA}</span></div>`,
    lignesSplit(splitA),
    `<div class="cl-payopt-body">${PAIEMENT.corpsA}</div>`,
    '</button>',
    splitBPayable === undefined
      ? [
          '<div class="cl-payinel" data-role="pay-inel">',
          `<div class="cl-payinel-head">${iconScooter(18)}<span>${TITRE_B}</span></div>`,
          '<div class="cl-payinel-body">Pas disponible pour cette commande. Vous pouvez tout payer maintenant, en sécurité — et toujours inspecter avant d’accepter.</div>',
          '</div>',
        ].join('')
      : [
          `<button class="cl-opt cl-payopt${s.pay === 'B' ? ' cl-opt-on' : ''}" data-action="choix-paiement" data-mode="B">`,
          s.pay === 'B' ? `<span class="cl-opt-mark">${iconCheck(14, 3)}</span>` : '',
          `<div class="cl-opt-row"><span class="cl-payopt-ic">${iconScooter(18)}</span><span class="cl-opt-title">${TITRE_B}</span></div>`,
          lignesSplit(splitBPayable),
          `<div class="cl-payopt-body">${fillMontants(PAIEMENT.corpsB, { D: fee(q, s.delivery) }).replace(
            PAIEMENT.corpsBAccent,
            `<b>${PAIEMENT.corpsBAccent}</b>`,
          )}</div>`,
          `<div class="cl-payopt-warn" data-role="frais-non-remboursables">${PAIEMENT.avertissementB}</div>`,
          '</button>',
        ].join(''),
    // GLUED AS ONE CLAUSE. Set in Instrument Sans at 360px this sentence needs
    // 301px of a 299px box, so « reste. » — the word that says what she still
    // owes — dropped alone onto a second line at 0.137 of the block. It only
    // ever showed up in CI when the face WON its `font-display: optional`
    // window; every run that fell back to the wider system face measured 0.426
    // and passed, which is why it read as a flake for three runs. Welding the
    // whole clause moves the only break point to after « colis », measured at
    // 0.553 (real face) and 0.700 (fallback) at 360px, 0.639 / 0.808 at 320px.
    '<div class="cl-quote">Vous inspectez le colis avant\u00a0de\u00a0payer\u00a0le\u00a0reste.</div>',
    redite === '' ? '' : `<div class="cl-redite" data-role="redite">${redite}</div>`,
    `<button class="cl-cta cl-cta-c5${can ? '' : ' cl-cta-off'}" data-action="payer"${can ? '' : ' disabled'}>${ctaLabel}</button>`,
    '<div class="cl-providers">ORANGE MONEY · MOOV MONEY</div>',
    '<div class="cl-footnote cl-footnote-c5">Votre numéro reste privé.</div>',
    '</div>',
  ].join('');
}

/**
 * ═══ SP4.2b — THE DOOR'S COPY: SHE PAYS THE PRODUCT, THEN GETS HER CODE ═══
 *
 * §5.5: « product paid by MoMo **at the door before custody transfer**; **not
 * COD** ». §6.3: « the buyer enters the drop code **last, after** any door
 * payment is provider-confirmed ».
 *
 * `echecCorps` DOES NOT SAY « rien n'a été prélevé », for the same reason C6's
 * failure does not: the amount-divergence fault reaches this state with the
 * provider possibly having collected. « Rien n'a été confirmé » is true on
 * every path here; the stronger sentence is not.
 *
 * Linted by `copy-lint-inline-refus.mjs` on the same terms as REFUS, PAIEMENT
 * and CONFIRMATION — structural floor, unknown-field hard failure, and NO
 * placeholders: the one amount on this screen is rendered by the caller from a
 * server byte, never interpolated into a sentence.
 */
export const PORTE = {
  /** The row above the two door buttons — what is still owed, with the figure
   *  appended by the renderer from the server's own split. */
  resteAPayer: 'Reste à payer, après inspection',
  echecTitre: 'Le paiement n’a pas abouti.',
  echecCorps: 'Rien n’a été confirmé. Votre commande est toujours là — vous pouvez réessayer.',
  echecAction: 'Réessayer le paiement',
} as const;

/* ----------------------------------------------------------------- C6 ---- */

/**
 * SP3.3b2 — C6 TAKES THE SERVER'S SPLIT, NOT A PRE-FORMATTED FIGURE.
 *
 * `paid` is the `ModeSplit` her chosen mode is priced by — the SAME object C5's
 * CTA and its §6.1 replay read — or `undefined` when there is no split to
 * speak for: she reached this screen without a chosen, payable mode.
 *
 * `undefined` IS A STATE WITH NO AMOUNT, NOT A STATE WITH A FALLBACK AMOUNT.
 * That rule is not new here; it is SP3.3b1's, written for this exact shape one
 * screen earlier, where a missing split disables the CTA and it « carries no
 * figure at all ». C6 now obeys the same rule: the confirmation keeps its
 * sentence and loses its amount clause, because « Paiement confirmé par
 * l'opérateur » is true without a figure, while any figure we supplied would be
 * one the operator never confirmed.
 */
export function renderC6(
  m: ClienteProduit,
  o: {
    confirmState: ConfirmEtat;
    paid: ModeSplit | undefined;
    /**
     * SP3.3c — the automatic checks have STOPPED, so she gets a way to ask
     * again. Absent while they are still running: a « Vérifier à nouveau »
     * button beside a check that is already running invites her to spend data
     * on an answer already on its way.
     */
    relance?: boolean | undefined;
    /**
     * SP3.3c — the LAST read of the order did not reach the service. It says
     * nothing about the payment and is never allowed to: it only stops
     * « Vérifier à nouveau » from being a tap that answers nothing.
     */
    horsPortee?: boolean | undefined;
  },
): string {
  let body: string;
  if (o.confirmState === 'confirmed') {
    // ONE BYTE, ONE SENTENCE. The amount clause exists only when the server
    // carried an amount for the mode she chose.
    const montant = o.paid === undefined ? '' : ` de <b>${fmtFCFA(o.paid.paidNow)}</b>`;
    body = [
      '<div class="cl-conf" data-etat="confirmee">',
      `<div class="cl-conf-disc">${iconCheck(36, 2.6)}</div>`,
      '<div class="cl-conf-title">Commande enregistrée.</div>',
      `<div class="cl-conf-body">Paiement${montant} confirmé par l’opérateur.</div>`,
      '</div>',
      '<div class="cl-steps">',
      `<div class="cl-step-row"><span class="cl-step-num">1</span><span class="cl-step-txt">${esc(m.prenom)} prépare votre commande</span></div>`,
      '<div class="cl-step-row"><span class="cl-step-num">2</span><span class="cl-step-txt">Séra vérifie et scelle le colis</span></div>',
      '<div class="cl-step-row"><span class="cl-step-num">3</span><span class="cl-step-txt">Nous vous prévenons à chaque étape</span></div>',
      '</div>',
    ].join('');
  } else if (o.confirmState === 'attente') {
    // THE ORDER EXISTS AND NOBODY HAS PAID YET. No amount is printed here on
    // purpose: an amount belongs to a payment, and there is no payment. What
    // she gets instead is the one thing that is true and the one action she has.
    body = [
      '<div class="cl-conf" data-etat="attente-operateur">',
      `<div class="cl-conf-ring">${iconClock(34)}</div>`,
      `<div class="cl-conf-title cl-conf-title-pending">${CONFIRMATION.attenteTitre}</div>`,
      `<div class="cl-conf-body cl-conf-body-max">${CONFIRMATION.attenteCorps}</div>`,
      // THE LAST READ DID NOT ARRIVE — said plainly, so the manual check always
      // answers her (verifier BLOCKER 2). It ADDS a fact about the network and
      // takes none away about the order.
      o.horsPortee === true
        ? `<div class="cl-conf-horsportee" data-role="hors-portee">${CONFIRMATION.attenteHorsPortee}</div>`
        : '',
      `<div class="cl-conf-chip">${CONFIRMATION.attenteChip}</div>`,
      o.relance === true
        ? `<button class="cl-conf-relance" data-action="verifier-paiement">${CONFIRMATION.attenteAction}</button>`
        : '',
      '</div>',
    ].join('');
  } else if (o.confirmState === 'echec') {
    body = [
      '<div class="cl-conf" data-etat="echec">',
      // A FLAG, NOT A CLOCK (verifier NOTE 11). The waiting state and this one
      // shared an icon, so in sunlight on a low-end screen the only difference
      // between « we are waiting » and « it did not go through » was a border
      // colour — and a clock beside « Le paiement n'a pas abouti » contradicts
      // the sentence it sits next to. The 5-second test decides this.
      `<div class="cl-conf-ring cl-conf-ring-echec">${iconFlag(32)}</div>`,
      `<div class="cl-conf-title cl-conf-title-pending">${CONFIRMATION.echecTitre}</div>`,
      `<div class="cl-conf-body cl-conf-body-max">${CONFIRMATION.echecCorps}</div>`,
      `<button class="cl-cta cl-cta-echec" data-action="reessayer-paiement">${CONFIRMATION.echecAction}</button>`,
      '</div>',
    ].join('');
  } else if (o.confirmState === 'pending') {
    body = [
      '<div class="cl-conf" data-etat="attente">',
      `<div class="cl-conf-ring">${iconClock(34)}</div>`,
      '<div class="cl-conf-title cl-conf-title-pending">C’est noté.</div>',
      '<div class="cl-conf-body cl-conf-body-max">En attente du réseau. Votre commande est gardée sur ce téléphone — elle part dès que le réseau revient.</div>',
      '<div class="cl-conf-chip">EN ATTENTE — JAMAIS PERDUE</div>',
      '</div>',
    ].join('');
  } else {
    body = [
      '<div class="cl-conf" data-etat="hors-ligne">',
      `<div class="cl-conf-ring">${iconWifiOff(32)}</div>`,
      '<div class="cl-conf-title cl-conf-title-offline">Hors ligne — rien n’est perdu.</div>',
      '<div class="cl-conf-body cl-conf-body-max">Votre commande attend sur ce téléphone. Le paiement partira quand le réseau reviendra. Nous ne dirons jamais « payé » avant l’opérateur.</div>',
      '</div>',
    ].join('');
  }
  return [
    '<div class="cl-screen" data-screen="C6">',
    body,
    /**
     * ═══ « SUIVRE MA COMMANDE » EXISTS ONLY ONCE THE PAYMENT IS CONFIRMED ═══
     *
     * THE DEFECT THIS CLOSES (fresh-context verifier, BLOCKER 1 — reproduced in
     * a real browser against the real bundle, and created by SP3.3c itself).
     * With the order honestly held at `payment_pending`, this CTA was still the
     * screen's primary action. Six taps later — C7's simulated steps, « Je suis
     * à la porte », « Tout est bon » — C9 revealed the drop code, under its own
     * caption « Votre code apparaîtra ici dès que le paiement sera confirmé par
     * l'opérateur. Jamais avant. » The app broke that promise on screen, and
     * with it Ten Laws #3 and §6.3 (« the buyer enters the drop code last,
     * after any door payment is provider-confirmed »).
     *
     * BEFORE THIS SLICE THE WALK WAS AT LEAST SELF-CONSISTENT, because C6 always
     * claimed `confirmed`. Making C6 honest is what exposed the contradiction,
     * so closing it belongs here and not to a later slice.
     *
     * ON `attente` THERE IS NO PRIMARY ACTION, and that is the honest answer:
     * she is waiting. « Vérifier à nouveau » appears in the body once the
     * automatic checks stop, and that is the only thing there is to offer.
     */
    o.confirmState === 'confirmed'
      ? '<button class="cl-cta cl-cta-c6" data-action="suivre">Suivre ma commande</button>'
      : '',
    '<div class="cl-footnote">Votre numéro reste privé.</div>',
    '</div>',
  ].join('');
}

/* ----------------------------------------------------------------- C7 ---- */

export interface C7State {
  readonly step: number;
  readonly problem: boolean;
  readonly demo: boolean;
}

export function renderC7(s: C7State): string {
  const atDoor = s.step >= 5 && !s.problem && s.step < 6;
  const canSim = s.demo && s.step < 5 && !s.problem;
  return [
    '<div class="cl-screen" data-screen="C7">',
    '<div class="cl-stephead"><div class="cl-steptitle">Le suivi</div><span class="cl-cmd">CMD-2417</span></div>',
    '<div class="cl-c7-intro">Nous vous prévenons à chaque étape. Pas besoin de rester sur cette page.</div>',
    s.problem ? '<div class="cl-problem" data-role="problem-banner">Problème signalé. Une personne s’en occupe. La commande reste protégée.</div>' : '',
    '<div class="cl-tl">',
    SUIVI_STEPS.map((st, i) => {
      const n = i + 1;
      const done = n < s.step;
      const current = n === s.step;
      const dot = done
        ? `<div class="cl-tl-dot cl-tl-dot-done">${iconCheck(11, 3.4)}</div>`
        : current
          ? '<div class="cl-tl-dot cl-tl-dot-now"><span class="cl-tl-heart"></span></div>'
          : '<div class="cl-tl-dot"></div>';
      const bar = n < 6 ? `<div class="cl-tl-bar${done ? ' cl-tl-bar-done' : ''}"></div>` : '';
      const tClass = current ? 'cl-tl-t-now' : done ? 'cl-tl-t-done' : 'cl-tl-t-future';
      return [
        '<div class="cl-tl-row">',
        `<div class="cl-tl-rail">${dot}${bar}</div>`,
        '<div class="cl-tl-body"><div class="cl-tl-toprow">',
        `<span class="cl-tl-t ${tClass}">${st.t}</span>`,
        current ? '<span class="cl-now-badge">MAINTENANT</span>' : '',
        `</div><div class="cl-tl-d">${st.d}</div></div>`,
        '</div>',
      ].join('');
    }).join(''),
    '</div>',
    atDoor ? '<button class="cl-cta cl-cta-door" data-action="porte">Je suis à la porte</button>' : '',
    canSim ? `<button class="cl-sim" data-action="simuler">▶ Simuler l’étape suivante — ${SIM_LABELS[s.step] ?? ''} (démo)</button>` : '',
    '<div class="cl-c7-actions">',
    '<button class="cl-c7-btn" data-action="ouvrir-protections">Vos protections</button>',
    '<button class="cl-c7-btn cl-c7-report" data-action="signaler-c7">Signaler un problème</button>',
    '</div>',
    '<div class="cl-footnote">Pas de point GPS — des étapes claires, et nous vous prévenons.</div>',
    '</div>',
  ].join('');
}

/* ----------------------------------------------------------------- C8 ---- */

export interface C8State {
  readonly door: DoorEtat;
  readonly pay: ModePaiement;
  readonly reason: string | null;
  /**
   * SP4.2b — what she still owes at the door, as the SERVER split it for her
   * mode. `undefined` ⇒ no split to speak for, and the screen shows no figure
   * rather than a guessed one (SP3.3b1's rule, third screen to obey it).
   */
  readonly duAlaPorte?: number | undefined;
}

export function renderC8(m: ClienteProduit, q: ClienteQuote, s: C8State): string {
  // THE SERVER'S OWN BYTE for what is owed at the door, never `produitFcfa`
  // re-read as if the two were the same thing. They are equal by §5.5 today;
  // the day a mode splits differently, this screen must follow the split.
  const produitStr = s.duAlaPorte === undefined ? '' : fmtFCFA(s.duAlaPorte);
  let body: string;
  if (s.door === 'accepted') {
    body = [
      '<div class="cl-door-pay" data-etat="paiement-porte">',
      `<div class="cl-prov-phone">${iconPhone(30)}</div>`,
      '<div class="cl-prov-title">Payez le reste, en sécurité</div>',
      `<div class="cl-prov-body">Composez votre <span class="cl-prov-cle">code secret <b>Orange Money</b></span> pour valider <b>${produitStr}</b>.</div>`,
      '<div class="cl-prov-wait"><span class="cl-prov-dots"><span class="cl-prov-dot"></span><span class="cl-prov-dot"></span><span class="cl-prov-dot"></span></span><span>En attente de la confirmation de l’opérateur…</span></div>',
      '<div class="cl-prov-law">Le livreur ne peut pas dire « payé » à votre place. Seul l’opérateur confirme.</div>',
      '</div>',
    ].join('');
  } else if (s.door === 'echec') {
    // THE OPERATOR DID NOT TAKE IT. No blame, no code, and — as on C6's own
    // failure — NO claim that nothing was debited: the amount-divergence fault
    // reaches this state with the money possibly already collected.
    body = [
      '<div class="cl-door-echec" data-etat="porte-echec">',
      `<div class="cl-conf-ring cl-conf-ring-echec">${iconFlag(32)}</div>`,
      `<div class="cl-conf-title cl-conf-title-pending">${PORTE.echecTitre}</div>`,
      `<div class="cl-conf-body cl-conf-body-max">${PORTE.echecCorps}</div>`,
      `<button class="cl-cta cl-cta-echec" data-action="reessayer-porte">${PORTE.echecAction}</button>`,
      '</div>',
    ].join('');
  } else if (s.door === 'report') {
    body = [
      '<div data-etat="signalement">',
      '<div class="cl-report-title">Qu’est-ce qui ne va pas ?</div>',
      '<div class="cl-report-sub">Dites-le simplement. Vous ne payez rien de plus.</div>',
      '<div class="cl-reasons">',
      inspectionPour(m.category).motifs
        .map((r) => `<button class="cl-reason${s.reason === r ? ' cl-reason-on' : ''}" data-action="motif" data-motif="${esc(r)}">${r}</button>`)
        .join(''),
      '</div>',
      s.reason
        ? [
            '<div class="cl-report-note" data-role="report-note">Le colis repart avec le livreur. Vous ne payez rien de plus. La commande reste protégée.</div>',
            '<button class="cl-report-cta" data-action="confirmer-signalement">C’est noté</button>',
          ].join('')
        : '',
      '</div>',
    ].join('');
  } else {
    // §6.2's row for THIS product — or the conservative one when we do not know.
    const rangee = inspectionPour(m.category);
    // The variant she actually bought, appended to whichever size/pointure line
    // the row carries, so « la bonne taille » names the size on her order.
    const variante = m.variant;
    const checklist = variante === undefined
      ? rangee.verifier
      : rangee.verifier.map((c) =>
          /taille|pointure/i.test(c) ? `${c} — ${esc(varianteCourte(variante))}` : c,
        );
    body = [
      '<div data-etat="inspection">',
      '<div class="cl-door-title">Ouvrez. Vérifiez.<br>Ensuite seulement, payez.</div>',
      '<div class="cl-door-sub">Prenez votre temps — 2 à 4 minutes, c’est votre droit. Le livreur attend.</div>',
      '<div class="cl-checklist">',
      checklist.map((c) => `<div class="cl-check-row">${iconCheckSquare(17)}<span>${c}</span></div>`).join(''),
      '</div>',
      s.pay !== 'A' && s.duAlaPorte !== undefined
        ? `<div class="cl-owing" data-role="owing"><span>${PORTE.resteAPayer}</span><b>${produitStr}</b></div>`
        : '',
      '<div class="cl-door-paths">',
      '<button class="cl-door-good" data-action="porte-bon">Tout est bon</button>',
      '<button class="cl-door-bad" data-action="porte-probleme">Un problème</button>',
      '</div>',
      // §6.2's THIRD column, said before she chooses — what a refusal will NOT
      // be honoured for. « Opened-then-refused … without seller fault →
      // buyer-fault » is the rule this line exists to keep out of her way.
      `<div class="cl-door-risque" data-role="risque">${rangee.risque}</div>`,
      '<div class="cl-door-equal">Les deux chemins se valent. Un refus justifié ne compte jamais contre vous.</div>',
      '</div>',
    ].join('');
  }
  return [
    '<div class="cl-screen" data-screen="C8">',
    stepHead('retour-c7', 'À la porte'),
    body,
    '</div>',
  ].join('');
}

/* ----------------------------------------------------------------- C9 ---- */

export function renderC9(o: { revealed: boolean }): string {
  const body = o.revealed
    ? [
        '<div class="cl-code-revealed" data-role="code-revele">',
        '<div class="cl-code-overline">VOTRE PREUVE</div>',
        '<div class="cl-code-card">',
        '<div class="cl-code-tick cl-code-tick-tl"></div><div class="cl-code-tick cl-code-tick-tr"></div><div class="cl-code-tick cl-code-tick-bl"></div><div class="cl-code-tick cl-code-tick-br"></div>',
        `<div class="cl-code-figure">${CODE_REMISE}</div>`,
        '</div>',
        '<div class="cl-code-proof">Ce code est votre preuve.</div>',
        '<div class="cl-code-how">Donnez-le au livreur seulement au moment de la remise. Montrez-le, ou dites-le à voix haute.</div>',
        `<div class="cl-code-kept">${iconShieldCheck(15, 1.9)}Gardé sur ce téléphone — même sans réseau.</div>`,
        '</div>',
      ].join('')
    : [
        '<div class="cl-code-hidden" data-role="code-cache">',
        iconLock(34, 1.7),
        '<div class="cl-code-dots">••• •••</div>',
        '<div class="cl-code-hidden-body">Votre code apparaîtra ici dès que le paiement sera confirmé par l’opérateur. Jamais avant.</div>',
        '</div>',
      ].join('');
  return [
    '<div class="cl-screen" data-screen="C9">',
    stepHead('retour-c7', 'Le code de remise'),
    body,
    '</div>',
  ].join('');
}

/* ------------------------------------------------------------ C2 sheet --- */

export function renderSheet(): string {
  const row = (icon: string, t: string, d: string): string =>
    `<div class="cl-prot-row"><span class="cl-prot-ic">${icon}</span><div><div class="cl-prot-t">${t}</div><div class="cl-prot-d">${d}</div></div></div>`;
  return [
    '<div class="cl-scrim" data-action="fermer-protections">',
    '<div class="cl-sheet" data-screen="C2" data-role="sheet" data-action="sheet-noop">',
    '<div class="cl-grabber"></div>',
    '<div class="cl-sheet-title">Vos protections</div>',
    row(iconEye(19), 'Vous inspectez avant de payer', 'Ouvrez le colis à la porte. Prenez 2 à 4 minutes. Payez seulement si c’est bon.'),
    row(iconShieldCheck(19, 1.8), 'Le remboursement n’est jamais bloqué', 'Un problème avéré, c’est un remboursement. Sans condition cachée, sans attente d’un fonds.'),
    row(iconLock(18, 1.8), 'Votre numéro reste privé', 'Le livreur passe par un relais. Personne ne voit votre numéro.'),
    row(iconKey(18), 'Le code de remise fait foi', 'La remise n’existe que quand vous donnez votre code. C’est votre preuve.'),
    '<button class="cl-sheet-cta" data-action="fermer-protections-cta">Compris</button>',
    '</div></div>',
  ].join('');
}

/* ------------------------------------------------------------- galerie --- */

/**
 * RESELLER-UX-2 item 4 — the FULL photo gallery, opened from C1's photo frame.
 * Every capture on the wire (hero + proof), one at a time over solid ink, with
 * « Précédente / Suivante » at the ends disabled (no wrap — she always knows
 * where she is) and the « {n} sur {N} » counter. One close action.
 */
export function renderGalerie(m: ClienteProduit, idx: number): string {
  const refs = m.assetRefs.filter((r) => r !== '');
  const shown = Math.min(Math.max(idx, 0), Math.max(0, refs.length - 1));
  const src = refs[shown];
  if (src === undefined) return '';
  return [
    '<div class="cl-galerie" data-role="galerie" role="dialog" aria-label="Photos du produit">',
    '<div class="cl-galerie-top">',
    `<span class="cl-galerie-titre">${esc(m.productName)}</span>`,
    '<button class="cl-galerie-fermer" data-action="galerie-fermer">Fermer</button>',
    '</div>',
    `<div class="cl-galerie-scene"><img class="cl-galerie-img" src="${esc(src)}" alt="" decoding="async"></div>`,
    '<div class="cl-galerie-bas">',
    `<button class="cl-galerie-nav" data-action="galerie-precedente"${shown === 0 ? ' disabled' : ''}>‹ Précédente</button>`,
    `<span class="cl-galerie-compteur" data-role="galerie-compteur">${shown + 1} sur ${refs.length}</span>`,
    `<button class="cl-galerie-nav" data-action="galerie-suivante"${shown === refs.length - 1 ? ' disabled' : ''}>Suivante ›</button>`,
    '</div>',
    '</div>',
  ].join('');
}

/* -------------------------------------------------------------- toasts --- */

export function renderToasts(toasts: ReadonlyArray<{ id: number; m: string }>): string {
  if (toasts.length === 0) return '';
  return `<div class="cl-toasts">${toasts.map((t) => `<div class="cl-toast">${esc(t.m)}</div>`).join('')}</div>`;
}
