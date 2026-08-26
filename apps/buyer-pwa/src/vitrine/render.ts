/**
 * VITRINE — Phase-1/2 renderers: C-VIT1…9 composed into V1/V2/V3/V4/V5/V6.
 *
 * SP-I03 (unchanged law): the buyer sees the RESELLER as the commercial
 * relationship and HER prices only — no supplier, no commission, no net, no
 * margin exists in any model this module touches (§8.11 grep-law). Prices are
 * signed-page values rendered verbatim (décret « render-only »).
 *
 * DOM shape mirrors the pixel source node-for-node (tags included — the
 * planche wraps template variables in `<v>` elements; so do we) so the Phase-4
 * property diff can walk both trees in parallel. Product-art glyphs are canon
 * SVG in the planche's `<em>` slot (no-emoji law) — the one masked divergence.
 */

import { t, tf } from '../i18n';
import { esc } from '../format';
import { iconWhatsApp } from '../cliente/icons';
import { fmtFCFA } from '../cliente/money';
import { productFromSeed, seedProduct, type VitrineProduct, type VitrineSeedProduct } from './catalog';
import { focusPosition, type Storefront, type VitrineTrust, type ProductVoiceNote, type ProductVoiceNotes } from './profile';
import { renderVoiceChip } from './voice-player';
import {
  iconBack,
  iconBrokenLink,
  iconCheck,
  iconChevron,
  iconDevanture,
  iconShieldCheck,
  iconBag,
  iconHeart,
  iconLock,
  iconPin,
  iconStar,
  iconTag,
  iconWifiOff,
  productGlyph,
} from './icons';
import { VITRINE_THEMES } from './themes';
import { isFavorite } from './favorites';
import { inPanier, panierOf } from './panier';
import { listeGardee, type ListePublique } from './liste';
import { enteteMontreBio, renderEntete, type EnteteKey } from './entetes';

/** « X\u202fFCFA » — the ONE formatter (cliente/money): U+202F thousands +
 * U+202F before FCFA, built from the escaped constant — never Intl (ICU
 * drift), never a bare « F », never a raw byte in source (PWA-CLEANUP-1 §2). */
export function fmtFcfa(n: number): string {
  return fmtFCFA(n);
}

const AVIS_FLOOR = 3; // §9.4 frozen: the review chip appears at ≥ 3 verified reviews

/* ------------------------------------------------------------ components -- */

/**
 * PARTAGE-HORS-ENTÊTE (2026-08-18) — the bar held two things, « retour » and
 * « partager ». With the share sign gone the bar is EMPTY whenever the buyer
 * did not arrive from a product, and `.vt-topbar` is 40px tall: on the hero
 * screens it is absolutely positioned so an empty one costs nothing, but the
 * OFFLINE screen has no hero and the band sat in normal flow — 40px of blank
 * warm surface above « Pas de connexion ». So the bar is drawn only when it
 * has something to carry.
 */
function topBar(opts: { back: boolean; accent: string }): string {
  return opts.back
    ? `<div class="vt-topbar" data-role="vitrine-topbar"><button class="vt-topbtn" data-action="retour" aria-label="${t('vit.retour_aria')}">${iconBack(17, '#1C1710', 2.1)}</button></div>`
    : '';
}

/**
 * VITRINE-NORTH-STAR-1 — the hero's PHOTO COLUMN (founder mockup, 2026-07-28).
 *
 * The 134px strip cropped her portrait-orientation photograph at the neck — the
 * exact complaint the founder raised on product photos. In the hero the photo
 * fills a full-height column beside the identity panel, so the whole image shows.
 * The three honesty branches are unchanged from MEDIA-2: a real url renders a
 * real <img>; live-without-url is the woven habillage, never a caption claiming
 * a photo; none is the tissé + filigrane. Same data-roles and classes, so the
 * MEDIA-2 tests keep asserting the same truths.
 */
function cover(sf: Storefront): string {
  const initial = esc(sf.name.replace(/^Chez\s+/i, '').charAt(0).toUpperCase());
  if (sf.cover.status === 'live' && sf.cover.url) {
    // ENTETES-C — her framing ONLY when present: an unframed cover emits the
    // exact bytes it always did (the ENTETES-A byte-identity pins hold).
    const pos = focusPosition(sf.cover.focus);
    return [
      '<div class="vt-hero-photo vt-cover-photo" data-role="vitrine-cover" data-etat="live">',
      `<img class="vt-cover-img" src="${esc(sf.cover.url)}" alt="${t('vit.cover_alt')}" loading="lazy" decoding="async"${pos !== undefined ? ` style="object-position:${pos}"` : ''}>`,
      '</div>',
    ].join('');
  }
  if (sf.cover.status === 'live') {
    return [
      '<div class="vt-hero-photo vt-cover-live" data-role="vitrine-cover" data-etat="live">',
      '<div class="vt-cover-stripes vt-cover-stripes-photo"></div>',
      `<em class="vt-glyph" data-glyph="photo">${productGlyph('photo')}</em>`,
      `<div class="vt-cover-caps">${t('vit.cover_caps')}</div>`,
      '</div>',
    ].join('');
  }
  // §4.2/§6: uploading/pending/error are RESELLER-side states — the buyer keeps
  // seeing the previous truth (none → tissé, former live stays live server-side).
  return [
    '<div class="vt-hero-photo" data-role="vitrine-cover" data-etat="none">',
    '<div class="vt-cover-stripes"></div>',
    `<div class="vt-filigrane">${initial}</div>`,
    '</div>',
  ].join('');
}

/**
 * C-VIT3 — the trust chips row (system-locked; never themed beyond §1.2).
 *
 * BUYER-REAL-HONESTY-1 — the NO-HISTORY state (founder ruling). A merchant with
 * no deliveries, no rating and no reviews has earned no social proof, and the
 * page says so plainly: « Nouvelle vendeuse ». Not blank space (which reads as a
 * broken page), and never a borrowed count. The two SYSTEM chips stay in every
 * case — « Livraison Séra vérifiée & scellée » and « Paiement protégé » are
 * promises the platform makes, not history the reseller earned.
 */
export function chips(sf: Storefront, trust: VitrineTrust): string {
  const th = VITRINE_THEMES[sf.theme];
  // FOUNDER ORDER (2026-07-28, logged in JOURNAL): the mockup's full trust row,
  // sublines included — « Rapide & sécurisée », « 100% sécurisé », « Les
  // meilleurs prix garantis / Moins cher, toujours ». I flagged these as
  // commercial promises the platform does not yet measure; the founder reaffirmed
  // them. They are HIS claims to make and they render as ordered. Real REVIEWS
  // still appear only at the floor, as their own row under the cells.
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="vt-cell"><span class="vt-cell-icon">${icon}</span><span class="vt-cell-text"><span class="vt-cell-label">${label}</span><span class="vt-cell-sub">${sub}</span></span></div>`;
  const avis =
    trust.reviewCount >= AVIS_FLOOR
      ? [
          '<div class="vt-avisrow" data-role="chip-avis">',
          iconStar(14, '#C89A3F'),
          `<span class="vt-cell-label"><v>${esc(trust.rating)}</v> · <v>${trust.reviewCount}</v> ${t('vit.avis_verifies')}</span>`,
          '</div>',
        ].join('')
      : '';
  return [
    '<div class="vt-trustrow" data-role="vitrine-trust">',
    cell(iconShieldCheck(15, th.deep, 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLock(15, th.deep, 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTag(15, '#C89A3F', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    avis,
  ].join('');
}

/**
 * VITRINE-NORTH-STAR-1 — the HERO (founder mockup, 2026-07-28): identity panel in
 * the theme's deep tone beside the full-height cover photo. Forêt renders the
 * mockup's exact green; the other three habillages render the same layout in
 * their own DNA — layout from tokens, never a hardcoded color (design-system law).
 *
 * HONESTY LINES HELD AGAINST THE MOCKUP: « +1,2k clientes satisfaites » is NOT
 * built — deliveredCount renders only when ≥ 1 and is real; zero history says
 * « Nouvelle vendeuse » (BUYER-REAL-HONESTY-1, unchanged). Star rows appear only
 * from real reviews at AVIS_FLOOR, in the trust band.
 */
export function hero(sf: Storefront, trust: VitrineTrust, opts: { compact?: boolean } = {}, floatBar = ''): string {
  const th = VITRINE_THEMES[sf.theme];
  const initial = esc(sf.name.replace(/^Chez\s+/i, '').charAt(0).toUpperCase());
  // MEDIA-2 — her portrait or the monogram; photo-mode-without-url falls back.
  // Round 4 (founder mockup): the gold-ringed monogram with the little check
  // bubble riding the circle's edge — the vérifiée mark next to her portrait.
  const badge = `<span class="vt-avatar-badge">${iconCheck(9, '#F6F0E4', 3)}</span>`;
  // ENTETES-C — her portrait framing, only when present (same law as the cover).
  const avatarPos = focusPosition(sf.avatar.focus);
  const avatar =
    sf.avatar.mode === 'photo' && sf.avatar.url
      ? `<span class="vt-avatar vt-avatar-photo"><img class="vt-avatar-img" src="${esc(sf.avatar.url)}" alt="${t('vit.avatar_alt')}" loading="lazy" decoding="async"${avatarPos !== undefined ? ` style="object-position:${avatarPos}"` : ''}>${badge}</span>`
      : `<span class="vt-avatar">${initial}${badge}</span>`;
  const panel = [
    '<div class="vt-hero-id" data-role="vitrine-identity">',
    avatar,
    `<div class="vt-namerow"><v>${esc(sf.name)}</v><span class="vt-rosette">${iconCheck(12, '#FFFFFF', 3)}</span></div>`,
  ];
  if (!opts.compact && sf.tagline) panel.push(`<div class="vt-tagline"><v>${esc(sf.tagline)}</v></div>`);
  panel.push(`<div class="vt-zone">${iconPin(13, '#C89A3F', 2)}${t('vit.verifiee')} <v>${esc(sf.zone)}</v></div>`);
  if (!opts.compact) {
    if (sf.bio) panel.push(`<div class="vt-bio"><v>${esc(sf.bio)}</v></div>`);
    if (trust.deliveredCount >= 1) {
      panel.push(
        `<div class="vt-rep" data-role="reputation"><v>${trust.deliveredCount}</v> ${t('vit.ventes_livrees')}</div>`,
      );
    }
  }
  panel.push('</div>');
  // No earned proof AT ALL → the state is named, never left as suspicious blank.
  // On the PHOTO, as the mockup places it (round 3, founder walk).
  const nouvelle =
    trust.deliveredCount === 0 && trust.reviewCount === 0
      ? `<span class="vt-chip-nouvelle" data-role="chip-nouvelle">${iconStar(12, th.deep)}${t('vit.nouvelle_vendeuse')}</span>`
      : '';
  return [
    '<div class="vt-hero" data-role="vitrine-hero">',
    floatBar,
    panel.join(''),
    `<div class="vt-hero-side">${cover(sf)}${nouvelle}</div>`,
    '</div>',
  ].join('');
}

/** NORTH-STAR round 3 — the mockup's section heading: glyph + sentence-case
 *  title + an optional « Voir tout › » that SCROLLS (a real anchor, not a dead
 *  link — there is no separate page to go to; the boutique IS this page). */
function sectionHead(glyph: string, title: string, linkLabel?: string, anchor?: string, count?: number): string {
  const link =
    linkLabel !== undefined && anchor !== undefined
      ? `<span class="vt-head-link" role="button" data-action="ancre" data-cible="${anchor}">${linkLabel}${iconChevron(12, '#6F6355', 2.2)}</span>`
      : '';
  const n = count !== undefined ? `<i class="vt-head-n">· <v>${count}</v></i>` : '';
  return `<div class="vt-head"><span class="vt-head-glyph">${glyph}</span><b class="vt-head-title">${title}</b>${n}<span class="vt-head-spacer"></span>${link}</div>`;
}

/**
 * C-VIT4 art — the NO-IMAGE state (founder ruling, BUYER-REAL-HONESTY-1).
 *
 * A woven, geometric, clearly ORNAMENTAL placeholder that fills the tile with
 * pattern — and is LABELLED « SANS PHOTO » so it can never be mistaken for the
 * product. The buyer flow promises « Photo réelle — ce que vous recevrez », so an
 * unlabelled ornament that read as the item itself would make the surface lie.
 * The label follows the C1 precedent (`cliente/screens.ts`: the caps label +
 * four corner ticks INSIDE the frame). « Sans photo » describes the state and
 * promises nothing — « à venir » would be a promise the platform makes on the
 * seller's behalf, and if she never adds a photo the platform lied.
 *
 * THEME-DERIVED, NOT SEED-DERIVED: the weave is drawn in CSS from the
 * storefront's own habillage tokens (`--vt-soft` / `--vt-accent`, the same woven
 * vocabulary as the cover stripes), so each of the four habillages produces its
 * own — and it works for a product carrying NO seed data at all. The retired
 * `p.art` gradient + `p.glyph` came from VITRINE_SEED demo data that a real
 * product does not have; the demo now shows what a buyer will actually get.
 */
function tileArt(veiled: boolean, assetRefs: readonly string[] = []): string {
  // REAL-PRODUCT-RENDER-1 — the HERO ref, when there is one. `assetRefs[0]` is
  // the hero by the convention boutik enforces AT ITS PRODUCER (the consumer
  // does not re-rank: no ordering logic, no scoring — loi 5 deterministic).
  // `loading=lazy` + `decoding=async` because a grid of photos on a 1GB Android
  // over patchy data must not block the first paint (perf is a design feature).
  const hero = assetRefs[0];
  const veil = veiled ? `<div class="vt-veil"><span class="vt-tampon">${t('vit.epuise')}</span></div>` : '';
  if (hero !== undefined && hero !== '') {
    return [
      '<div class="vt-tile-art vt-tile-art-photo" data-role="tile-photo">',
      `<img class="vt-tile-photo" src="${esc(hero)}" alt="" loading="lazy" decoding="async">`,
      veil,
      '</div>',
    ].join('');
  }
  return [
    '<div class="vt-tile-art vt-tile-art-sansphoto" data-role="tile-sans-photo">',
    '<div class="vt-weave"></div>',
    '<div class="vt-tick vt-tick-tl"></div><div class="vt-tick vt-tick-tr"></div><div class="vt-tick vt-tick-bl"></div><div class="vt-tick vt-tick-br"></div>',
    `<div class="vt-sansphoto-caps">${t('vit.sans_photo')}</div>`,
    veil,
    '</div>',
  ].join('');
}

/** C-VIT4 — tuile produit v2. Épuisé: voile + tampon, muette (aria-disabled).
 * A `ready` voice note adds the compact « Note vocale » chip (in-stock tiles only —
 * an épuisé tile is muette and carries no interactive child). */
/** The wishlist heart — role=button inside the tile button (voice-chip
 *  precedent: closest() routes its tap to `favori`, never to `produit`). */
function fav(pid: string): string {
  const on = isFavorite(pid);
  return `<span class="vt-fav${on ? ' vt-fav-on' : ''}" role="button" tabindex="0" data-action="favori" data-pid="${esc(pid)}" aria-pressed="${on}" aria-label="${t('vit.favori_aria')}">${iconHeart(16, '#1C1710', 1.9)}</span>`;
}

/** PANIER-VITRINE-1 — the add-to-panier chip, the heart's sibling: top-left of
 *  the art (the heart keeps top-right), device-local truth via panier.ts, and
 *  closest() routes its tap to `panier`, never to `produit` (the fav law). */
function pan(slug: string, pid: string): string {
  const on = inPanier(slug, pid);
  return `<span class="vt-pan${on ? ' vt-pan-on' : ''}" role="button" tabindex="0" data-action="panier" data-pid="${esc(pid)}" aria-pressed="${on}" aria-label="${t('vit.panier_aria')}">${iconBag(15, '#1C1710', 2)}</span>`;
}

function tile(p: VitrineProduct, note: ProductVoiceNote | undefined, slug: string, wa?: WaCtx): string {
  const cls = p.inStock ? 'vt-tile' : 'vt-tile vt-tile-epuise';
  const attrs = p.inStock
    ? `data-action="produit" data-pid="${esc(p.pid)}"`
    : 'aria-disabled="true" disabled';
  // NORTH-STAR-1 — the heart is REAL (favorites.ts) and, since
  // PANIER-VITRINE-1, so is the panier chip: both device-local, both honest,
  // because a decorative chip would be a dead button. Neither renders on an
  // épuisé — an add nobody can complete would lie. « Livraison 24–48h · Séra
  // vérifiée » is the FOUNDER'S delivery promise (his order, logged) — flagged
  // as unmeasured, reaffirmed, rendered as given.
  return [
    `<button class="${cls}" data-role="vitrine-produit" ${attrs}>`,
    `<div class="vt-artwrap">${produitArt(p, !p.inStock)}${p.inStock ? fav(p.pid) : ''}${p.inStock ? pan(slug, p.pid) : ''}${p.inStock && wa !== undefined ? waChip(p, wa) : ''}</div>`,
    '<div class="vt-tile-body">',
    `<div class="vt-tile-name"><v>${esc(p.name)}</v></div>`,
    '<div class="vt-tile-pricerow">',
    `<div class="vt-tile-price"><v>${fmtFcfa(p.priceFcfa)}</v></div>`,
    p.inStock ? `<span class="vt-tile-go" aria-hidden="true">${iconBag(14, '#FFFFFF', 2)}</span>` : '',
    '</div>',
    p.inStock ? `<div class="vt-tile-livree">${t('vit.livraison_2448')}</div>` : '',
    p.inStock ? renderVoiceChip(note) : '',
    '</div>',
    '</button>',
  ].join('');
}

/**
 * C-VIT5 — tuile à la une (jamais un épuisé: auto-retrait à l'affichage).
 *
 * NORTH-STAR-1 — the mockup's featured card, honest: the badge says « À LA UNE »
 * (her true curation choice) and never « BEST SELLER » (a sales claim no data
 * backs). No per-product stars — product reviews do not exist yet, and a star
 * row would be invented. « Commander » is a labeled CTA inside the one button
 * this card already is; it opens her product page, same action as the card.
 */
/**
 * VIDEO-PRODUIT V-1e (founder order 2026-08-02: « I want the short video to be
 * the hero card and will start playing a preview when a client/viewer scrolls
 * and pause on that ») — when the product carries a clip, the FEATURED card's
 * art is a `<video>`: MUTED (the only autoplay browsers permit, and the only
 * one that respects her cliente), `playsinline` (never a fullscreen hijack),
 * `loop`, `preload="metadata"` with the HERO PHOTOGRAPH as poster — so a slow
 * connection sees the photo instantly and the clip's bytes flow only when it
 * actually plays. Play/pause on scroll is `video-scroll.ts`'s observer; this
 * function only DECLARES the element.
 *
 * EVERY CARD, NOT ONLY THE HERO (founder order 2026-08-03: « I want the video
 * to be displayed on any product if it has one not just a la une product »).
 * The first cut kept grid tiles as photographs because a page of autoplaying
 * clips on a 1GB Android is a stutter. That concern is answered by the
 * observer, not by the markup: `video-scroll.ts` plays AT MOST ONE clip at a
 * time (starting one pauses every sibling) and every element is
 * `preload="metadata"` with the photograph as poster — so an unplayed card
 * costs a poster image, exactly what it cost as a photo tile. What the founder
 * asked for and what the phone can carry are the same build.
 *
 * ÉPUISÉ TILES STAY PHOTOGRAPHS: a sold-out tile is veiled and muette, and a
 * clip playing under a « épuisé » stamp advertises what cannot be bought.
 */
function produitArt(p: VitrineProduct, veiled: boolean): string {
  const clip = p.videoRef;
  if (!veiled && clip !== undefined && clip !== '') {
    const poster = p.assetRefs[0];
    return [
      '<div class="vt-tile-art vt-tile-art-photo" data-role="tile-video">',
      `<video class="vt-video-hero" data-role="video-hero" src="${esc(clip)}" muted playsinline loop preload="metadata"${poster !== undefined && poster !== '' ? ` poster="${esc(poster)}"` : ''}></video>`,
      '</div>',
    ].join('');
  }
  return tileArt(veiled, p.assetRefs);
}

function featuredArt(p: VitrineProduct): string {
  return produitArt(p, false); // the hero is never an épuisé (auto-retrait)
}

/**
 * GRILLE-ETAGEE — the storefront's product grid, staggered (founder order
 * 2026-08-03: « Apply all these changes on ma boutique/storefront as well, the
 * size, the space scale, the square, etc »), matching what opportunités got.
 *
 * WHY THIS FUNCTION EXISTS AT ALL: the grid was `<div class="vt-grid">` with
 * every tile as a direct child of a two-column CSS grid — and a CSS grid lays
 * out in ROWS, so the two tiles on a line always shared a top and a bottom.
 * Same defect as the reseller's `numColumns={2}`, same fix: two columns that
 * flow INDEPENDENTLY, so a tall card pushes only its own column down.
 *
 * THE SPLIT IS ALTERNATING INDEX, deliberately the same rule as the reseller
 * app's — evens left, odds right, pure and stable (Loi 5). CSS `column-count`
 * would have done this in one line, but it fills COLUMN-MAJOR: articles 1-2-3
 * would run down the left column and 4-5-6 down the right, silently changing
 * the order she arranged her shop in. Reading order is hers, not the layout's.
 *
 * ONE GRID GOES THROUGH HERE since sections stopped being drawn (2026-08-19).
 * It carried both — the sections and the residual — because a shop where one
 * grid staggers and the other does not looks broken rather than designed.
 */
function grille(prods: readonly VitrineProduct[], notes: ProductVoiceNotes, slug: string, wa?: WaCtx): string {
  const colonne = (c: 0 | 1): string =>
    prods.filter((_, i) => i % 2 === c).map((p) => tile(p, notes[p.pid], slug, wa)).join('');
  return `<div class="vt-grid"><div class="vt-col">${colonne(0)}</div><div class="vt-col">${colonne(1)}</div></div>`;
}

function featuredTile(p: VitrineProduct, note: ProductVoiceNote | undefined, pinnedByHer: boolean, slug: string, wa?: WaCtx): string {
  return [
    `<button class="vt-featured" data-role="vitrine-a-la-une" data-action="produit" data-pid="${esc(p.pid)}">`,
    `<div class="vt-featured-artwrap">${featuredArt(p)}${pinnedByHer ? `<span class="vt-featured-badge">${t('vit.a_la_une')}</span>` : ''}${fav(p.pid)}${pan(slug, p.pid)}${wa !== undefined ? waChip(p, wa) : ''}</div>`,
    '<div class="vt-featured-body">',
    `<span class="vt-featured-name"><v>${esc(p.name)}</v></span>`,
    `<b class="vt-featured-price"><v>${fmtFcfa(p.priceFcfa)}</v></b>`,
    `<span class="vt-featured-livree">${t('vit.livraison_2448')}</span>`,
    renderVoiceChip(note),
    `<span class="vt-featured-cta">${t('vit.commander')}</span>`,
    '</div>',
    '</button>',
  ].join('');
}

/** C-VIT7 — bande encre + footer (« la page signée fait foi »). */
function inkBandAndFooter(sf: Storefront): string {
  return [
    `<div class="vt-band" data-role="vitrine-bande">${tf('vit.bande', {
      lien: `<b>${t('vit.bande_lien')}</b>`,
    })} ${t('vit.bande_recap')}</div>`,
    `<div class="vt-foot1">${t('vit.footer_prive')}</div>`,
    `<div class="vt-foot2">${t('vit.footer_verifiee')} <b><v>/v/${esc(sf.slug)}</v></b></div>`,
  ].join('');
}

/**
 * Grid-order law: curatedItems order, in-stock first inside each group, épuisé
 * last (§6).
 *
 * BUYER-REAL-HONESTY-1 — the DEMO-CATALOGUE FILL IS REMOVED. This function used
 * to append `VITRINE_SEED.filter(p => !sf.curatedItems.includes(p.pid))` whenever
 * no explicit pids were passed, so a store whose curated pids are not demo-seed
 * pids rendered the ENTIRE demo catalogue as if it were hers. It was masked only
 * because `flows.ts` routes a zero-item store to `renderVitrineEmpty` — it would
 * have detonated the moment a real store had one product. A storefront now shows
 * HER items and nothing else; a store with none renders the honest empty state.
 */
function orderedProducts(
  sf: Storefront,
  pids?: readonly string[],
  described?: readonly VitrineProduct[],
): VitrineProduct[] {
  const wanted = pids ?? sf.curatedItems;
  // BUYER-LIVE-WIRE-3 — REAL PRODUCTS WIN. When the service described them, the
  // grid is built from THOSE records; the demo seed is consulted only when nothing
  // was described (the offline harness). The seed lookup was previously the ONLY
  // path, so a real `productVersionId` — which is not a seed pid — resolved to
  // nothing and the grid rendered ZERO TILES for a shop that genuinely had a
  // product. Order still follows `curatedItems`, which stays the membership truth.
  const all =
    described !== undefined
      ? wanted.map((pid) => described.find((p) => p.pid === pid)).filter((p): p is VitrineProduct => p !== undefined)
      : wanted
          .map(seedProduct)
          .filter((p): p is VitrineSeedProduct => !!p)
          .map(productFromSeed);
  return [...all.filter((p) => p.inStock), ...all.filter((p) => !p.inStock)];
}

/* --------------------------------------------------------------- screens -- */

export interface VitrineRenderOpts {
  /** ← appears only when arrived from a product page (§4.1). */
  readonly fromProduct: boolean;
  /** CONTACT-WHATSAPP-2 (founder: « add the whatsapp icon on each tile as
   *  well ») — the reseller's wa.me digits off the resolve, server-vouched.
   *  Absent ⇒ no chip renders anywhere on the grid. */
  readonly whatsapp?: string;
}

/** The per-tile WhatsApp context, computed ONCE from the resolved storefront
 *  (the C1 fiche's own prenom rule, so the two surfaces draft the same
 *  greeting). */
interface WaCtx {
  readonly digits: string;
  readonly prenom: string;
  readonly shopName: string;
}

/** CONTACT-WHATSAPP-2 — the tile chip: fav/pan's third sibling, same 44px
 *  disc, same closest() law (its data-action routes the tap to `whatsapp`,
 *  never to `produit`). The full wa.me URL rides the element so the handler
 *  opens EXACTLY what this render vouched for — the draft names THIS product. */
function waChip(p: VitrineProduct, ctx: WaCtx): string {
  const texte = `Bonjour ${ctx.prenom}, je vous écris au sujet de « ${p.name} » vu sur ${ctx.shopName}.`;
  const href = `https://wa.me/${ctx.digits}?text=${encodeURIComponent(texte)}`;
  return `<span class="vt-wa" role="button" tabindex="0" data-action="whatsapp" data-pid="${esc(p.pid)}" data-wa-href="${esc(href)}" aria-label="${t('vit.whatsapp_aria')}">${iconWhatsApp(17, 1.8)}</span>`;
}

/**
 * PANIER-VITRINE-1 — the band's content: her saved articles for THIS boutique,
 * in the order she added, each card opening its own product page (per-product
 * checkout — §SP9's « no combined cart » holds by construction) with a
 * « retirer » chip riding the same `panier` action as the tile chip. NO TOTAL
 * anywhere: a sum would imply a combined purchase that does not exist. A
 * saved pid absent from the current catalog renders nothing (it may return);
 * an épuisé renders veiled with no product action, the grid's own convention.
 * Exported so flows can refresh the slot in place after a toggle.
 */
export function renderPanierBand(sf: Storefront, described?: readonly VitrineProduct[]): string {
  const saved = panierOf(sf.slug);
  if (saved.length === 0) return '';
  const catalogue = orderedProducts(sf, undefined, described);
  const parPid = new Map(catalogue.map((p) => [p.pid, p]));
  const articles = saved
    .map((pid) => parPid.get(pid))
    .filter((p): p is VitrineProduct => p !== undefined);
  if (articles.length === 0) return '';
  const cartes = articles.map((p) => {
    const dispo = p.inStock;
    return [
      `<div class="vt-pan-card${dispo ? '' : ' vt-pan-card-epuise'}" data-role="panier-article">`,
      `<button class="vt-pan-vis"${dispo ? ` data-action="produit" data-pid="${esc(p.pid)}"` : ' aria-disabled="true" disabled'}>`,
      `<div class="vt-pan-art">${tileArt(!dispo, p.assetRefs)}</div>`,
      `<div class="vt-pan-name"><v>${esc(p.name)}</v></div>`,
      `<div class="vt-pan-price"><v>${fmtFcfa(p.priceFcfa)}</v></div>`,
      '</button>',
      `<button class="vt-pan-retirer" data-action="panier" data-pid="${esc(p.pid)}" aria-label="${t('vit.panier_retirer_aria')}">×</button>`,
      '</div>',
    ].join('');
  });
  return [
    '<div class="vt-panier" data-role="vitrine-panier">',
    `<div class="vt-panier-head">${iconBag(15, '#6F6355', 1.9)}<span class="vt-panier-titre">${t('vit.panier_titre')}</span><span class="vt-panier-compte">· <v>${articles.length}</v></span></div>`,
    `<div class="vt-panier-row">${cartes.join('')}</div>`,
    '</div>',
  ].join('');
}

/* ------------------------------------------------- LISTE-ENVIES-1 (2026-08-25) -- */

/** The articles the builder sheet OFFERS — her catalogue's in-stock rows, in
 *  her own curation order. Exported so flows opens the sheet from the same
 *  resolution every band renders from (one source, two surfaces). */
export function articlesPourListe(sf: Storefront, described?: readonly VitrineProduct[]): VitrineProduct[] {
  return orderedProducts(sf, undefined, described).filter((p) => p.inStock);
}

/** LISTE-RETRAIT — the WHOLE catalogue keyed by pid, épuisé included: the
 *  manage sheet must offer removing an article precisely because it can no
 *  longer be bought. (The builder keeps its in-stock filter — ADDING a dead
 *  fiche to a liste stays banned.) */
export function articlesPourModif(sf: Storefront, described?: readonly VitrineProduct[]): Map<string, VitrineProduct> {
  return new Map(orderedProducts(sf, undefined, described).map((p) => [p.pid, p]));
}

/**
 * THE CREATOR'S ENTRY — one quiet row, deliberately a whisper: the boutique's
 * primary action stays « buy », and the liste must invite without shouting.
 * Two states from the device-local record: never made one here → the
 * invitation; made one → her liste's card with the share action first (the
 * link is the product of this feature) and « refaire » as the secondary road
 * (a remake mints a fresh link; the old one keeps working on the service).
 */
export function renderListeBand(sf: Storefront): string {
  const gardee = listeGardee(sf.slug);
  if (gardee === undefined) {
    return [
      '<div class="vt-liste-inviter" data-role="vitrine-liste-inviter">',
      `<div class="vt-liste-inviter-txt">${iconHeart(15, '#B4544B', 1.9)}<div><div class="vt-liste-titre">${t('vit.liste_entree_titre')}</div><div class="vt-liste-texte">${t('vit.liste_entree_texte')}</div></div></div>`,
      `<button class="vt-liste-cta" data-action="liste-creer">${t('vit.liste_entree_cta')}</button>`,
      '</div>',
    ].join('');
  }
  const detail =
    gardee.pids.length === 1
      ? tf('vit.liste_votre_detail_un', { nom: gardee.nom })
      : tf('vit.liste_votre_detail', { nom: gardee.nom, n: String(gardee.pids.length) });
  return [
    '<div class="vt-liste-carte" data-role="vitrine-liste-carte">',
    `<div class="vt-liste-inviter-txt">${iconHeart(15, '#B4544B', 1.9)}<div><div class="vt-liste-titre">${t('vit.liste_votre_titre')}</div><div class="vt-liste-texte"><v>${esc(detail)}</v></div></div></div>`,
    '<div class="vt-liste-actions">',
    `<button class="vt-liste-cta" data-action="liste-partager">${t('vit.liste_partager')}</button>`,
    // LISTE-RETRAIT — the edit road KEEPS her link; « refaire » stays the
    // separate road that mints a new one. Both whisper; share stays primary.
    `<button class="vt-liste-secondaire" data-action="liste-modifier">${t('vit.liste_modifier')}</button>`,
    `<button class="vt-liste-secondaire" data-action="liste-creer">${t('vit.liste_refaire')}</button>`,
    '</div>',
    '</div>',
  ].join('');
}

/**
 * THE BUILDER SHEET — her boutique's IN-STOCK articles as check rows, her
 * first name, one primary action. Pre-checked rows are her hearts (the
 * device-local favoris ∩ this boutique): the liste starts from what she
 * already told us she loves. Épuisé articles are not offered — a liste that
 * sends friends to a dead fiche would be a dead button wearing a gift bow.
 */
export function renderListeSheet(articles: readonly VitrineProduct[], precoche: ReadonlySet<string>): string {
  const rows = articles.map((p) => [
    `<label class="vt-liste-row" data-role="liste-choix">`,
    `<input type="checkbox" class="vt-liste-case" data-liste-pid="${esc(p.pid)}"${precoche.has(p.pid) ? ' checked' : ''}>`,
    `<div class="vt-liste-row-art">${tileArt(false, p.assetRefs)}</div>`,
    `<div class="vt-liste-row-infos"><div class="vt-liste-row-nom"><v>${esc(p.name)}</v></div><div class="vt-liste-row-prix"><v>${fmtFcfa(p.priceFcfa)}</v></div></div>`,
    '</label>',
  ].join(''));
  return [
    '<div class="vt-liste-voile" data-role="liste-sheet">',
    '<div class="vt-liste-sheet">',
    `<div class="vt-liste-sheet-head"><div class="vt-liste-sheet-titre">${t('vit.liste_sheet_titre')}</div><button class="vt-liste-fermer" data-action="liste-fermer" aria-label="${t('vit.liste_fermer_aria')}">×</button></div>`,
    `<div class="vt-liste-texte">${t('vit.liste_sheet_texte')}</div>`,
    `<div class="vt-liste-rows">${rows.join('')}</div>`,
    `<label class="vt-liste-nom"><span class="vt-liste-nom-label">${t('vit.liste_nom_label')}</span>`,
    `<input type="text" class="vt-liste-nom-input" data-role="liste-nom" maxlength="24" autocomplete="given-name">`,
    `<span class="vt-liste-texte">${t('vit.liste_nom_aide')}</span></label>`,
    // LISTE-MERCI — the WhatsApp opt-in IS filling this field (one optional
    // input beats a checkbox that reveals one — fewer controls, same choice).
    // The number never appears on the shared liste; the aide says who will
    // see it and why.
    `<label class="vt-liste-nom"><span class="vt-liste-nom-label">${t('vit.liste_tel_label')}</span>`,
    `<input type="tel" class="vt-liste-nom-input" data-role="liste-tel" maxlength="24" inputmode="tel" autocomplete="tel">`,
    `<span class="vt-liste-texte">${t('vit.liste_tel_aide')}</span></label>`,
    '<div class="vt-liste-alerte" data-role="liste-alerte" hidden></div>',
    `<button class="vt-liste-valider" data-action="liste-valider">${t('vit.liste_creer_cta')}</button>`,
    '</div>',
    '</div>',
  ].join('');
}

/**
 * ═══ LISTE-RETRAIT-1 — THE MANAGE SHEET (founder order, 2026-08-26) ═══
 *
 * « option where wishlist creator can remove items from their wishlist »
 *
 * Her CURRENT liste as checked rows — SERVER truth, read fresh when the sheet
 * opens, because the marks live there: a row already given wears « Déjà
 * offert » where its price would sit (the price of a gift already made is not
 * the point; knowing she is removing a granted wish is). Unchecking is the
 * removal; ONE action saves; the LINK STAYS THE SAME — that sentence is on
 * the sheet, because it is the reason this road exists beside « refaire ».
 * Épuisé articles still render (removing one is exactly why she came); a pid
 * the catalogue can no longer resolve is not offered and leaves on her next
 * save — the service's own membership law (`pids ⊆ curatedItems`) would
 * refuse any update still carrying it. Chargement, hors-ligne (retry = the
 * same open action) and introuvable (way out: refaire) are designed states.
 */
export type ListeModifEtat =
  | { readonly etape: 'chargement' }
  | { readonly etape: 'hors-ligne' }
  | { readonly etape: 'introuvable' }
  | { readonly etape: 'prete'; readonly rows: readonly { readonly p: VitrineProduct; readonly offert: boolean }[] };

export function renderListeModif(etat: ListeModifEtat): string {
  let corps: string;
  if (etat.etape === 'chargement') {
    corps = `<div class="vt-liste-attente" data-role="liste-modif-attente">${t('vit.liste_chargement')}</div>`;
  } else if (etat.etape === 'hors-ligne') {
    corps = [
      `<div class="vt-liste-texte" data-role="liste-modif-horsligne">${t('vit.liste_hors_ligne')}</div>`,
      `<button class="vt-liste-valider" data-action="liste-modifier">${t('vit.reessayer')}</button>`,
    ].join('');
  } else if (etat.etape === 'introuvable') {
    corps = [
      `<div class="vt-liste-texte" data-role="liste-modif-introuvable">${t('vit.liste_introuvable')}</div>`,
      `<button class="vt-liste-valider" data-action="liste-creer">${t('vit.liste_refaire')}</button>`,
    ].join('');
  } else {
    const rows = etat.rows.map(({ p, offert }) => [
      `<label class="vt-liste-row" data-role="liste-modif-row">`,
      `<input type="checkbox" class="vt-liste-case" data-liste-pid="${esc(p.pid)}" checked>`,
      `<div class="vt-liste-row-art">${tileArt(!p.inStock, p.assetRefs)}</div>`,
      `<div class="vt-liste-row-infos"><div class="vt-liste-row-nom"><v>${esc(p.name)}</v></div>`,
      offert
        ? `<div class="vt-liste-offert-badge">${iconCheck(12, '#3F7D5C', 2.6)}${t('vit.liste_offert')}</div>`
        : `<div class="vt-liste-row-prix"><v>${fmtFcfa(p.priceFcfa)}</v></div>`,
      '</div></label>',
    ].join(''));
    corps = [
      `<div class="vt-liste-texte">${t('vit.liste_modif_texte')}</div>`,
      `<div class="vt-liste-rows">${rows.join('')}</div>`,
      '<div class="vt-liste-alerte" data-role="liste-alerte" hidden></div>',
      `<button class="vt-liste-valider" data-action="liste-enregistrer">${t('vit.liste_modif_cta')}</button>`,
    ].join('');
  }
  return [
    '<div class="vt-liste-voile" data-role="liste-sheet">',
    '<div class="vt-liste-sheet">',
    `<div class="vt-liste-sheet-head"><div class="vt-liste-sheet-titre">${t('vit.liste_sheet_titre')}</div><button class="vt-liste-fermer" data-action="liste-fermer" aria-label="${t('vit.liste_fermer_aria')}">×</button></div>`,
    corps,
    '</div>',
    '</div>',
  ].join('');
}

/**
 * THE LINK-READY STATE — the sheet's second face, the feature's emotional
 * peak (celebration with dignity: a check, the truth, the link, no confetti).
 * The link is SHOWN, not only shareable: seeing the thing makes it real, and
 * copying by hand must stay possible on a phone whose share sheet fails.
 */
export function renderListeLien(lien: string): string {
  return [
    '<div class="vt-liste-voile" data-role="liste-sheet">',
    '<div class="vt-liste-sheet">',
    `<div class="vt-liste-sheet-head"><div class="vt-liste-sheet-titre">${iconCheck(16, '#3F7D5C', 2.4)} ${t('vit.liste_prete')}</div><button class="vt-liste-fermer" data-action="liste-fermer" aria-label="${t('vit.liste_fermer_aria')}">×</button></div>`,
    `<div class="vt-liste-texte">${t('vit.liste_prete_texte')}</div>`,
    `<div class="vt-liste-lien" data-role="liste-lien"><v>${esc(lien)}</v></div>`,
    `<button class="vt-liste-valider" data-action="liste-partager" data-lien="${esc(lien)}">${t('vit.liste_partager')}</button>`,
    `<button class="vt-liste-secondaire" data-action="liste-copier" data-lien="${esc(lien)}">${t('vit.liste_copier')}</button>`,
    '</div>',
    '</div>',
  ].join('');
}

/**
 * THE FRIEND'S BANNER — « La liste de {nom} », her wishes as cards. Each
 * ungiven article opens its OWN fiche carrying the liste token (per-product
 * checkout — the no-combined-cart law holds on the gift road too); a given
 * one wears « Déjà offert » and offers no action — PROVIDER-CONFIRMED truth,
 * displayed, never computed here. « Tout mettre au panier » fills the
 * device-local shelf only: a convenience, never a checkout.
 */
export function renderListeAmie(liste: ListePublique, sf: Storefront, described?: readonly VitrineProduct[]): string {
  const catalogue = orderedProducts(sf, undefined, described);
  const parPid = new Map(catalogue.map((p) => [p.pid, p]));
  const cartes: string[] = [];
  let restants = 0;
  for (const a of liste.articles) {
    const p = parPid.get(a.pid);
    if (p === undefined) continue; // delisted — renders nothing (the panier convention)
    if (a.offert) {
      cartes.push([
        '<div class="vt-pan-card vt-liste-offerte" data-role="liste-article" data-offert="1">',
        '<div class="vt-pan-vis" aria-disabled="true">',
        `<div class="vt-pan-art">${tileArt(true, p.assetRefs)}</div>`,
        `<div class="vt-pan-name"><v>${esc(p.name)}</v></div>`,
        `<div class="vt-liste-offert-badge">${iconCheck(12, '#3F7D5C', 2.6)}${t('vit.liste_offert')}</div>`,
        '</div>',
        '</div>',
      ].join(''));
      continue;
    }
    const dispo = p.inStock;
    if (dispo) restants += 1;
    cartes.push([
      `<div class="vt-pan-card${dispo ? '' : ' vt-pan-card-epuise'}" data-role="liste-article">`,
      `<button class="vt-pan-vis"${dispo ? ` data-action="liste-produit" data-pid="${esc(p.pid)}"` : ' aria-disabled="true" disabled'}>`,
      `<div class="vt-pan-art">${tileArt(!dispo, p.assetRefs)}</div>`,
      `<div class="vt-pan-name"><v>${esc(p.name)}</v></div>`,
      `<div class="vt-pan-price"><v>${fmtFcfa(p.priceFcfa)}</v></div>`,
      dispo ? `<div class="vt-liste-offrir">${t('vit.liste_offrir')}</div>` : '',
      '</button>',
      '</div>',
    ].join(''));
  }
  if (cartes.length === 0) return renderListeIntrouvable();
  return [
    '<div class="vt-liste-amie" data-role="vitrine-liste-amie">',
    `<div class="vt-panier-head">${iconHeart(15, '#B4544B', 1.9)}<span class="vt-panier-titre"><v>${esc(tf('vit.liste_amie_titre', { nom: liste.nom }))}</v></span></div>`,
    `<div class="vt-liste-texte">${t('vit.liste_amie_texte')}</div>`,
    `<div class="vt-panier-row">${cartes.join('')}</div>`,
    restants > 0 ? `<button class="vt-liste-secondaire" data-action="liste-tout-panier">${t('vit.liste_tout_panier')}</button>` : '',
    '</div>',
  ].join('');
}

/** The friend band's three honest non-ready states (designed, never a wall). */
export function renderListeChargement(): string {
  return `<div class="vt-liste-amie vt-liste-attente" data-role="vitrine-liste-attente">${t('vit.liste_chargement')}</div>`;
}
export function renderListeIntrouvable(): string {
  return `<div class="vt-liste-amie vt-liste-attente" data-role="vitrine-liste-introuvable">${t('vit.liste_introuvable')}</div>`;
}
export function renderListeHorsLigne(): string {
  return [
    '<div class="vt-liste-amie vt-liste-attente" data-role="vitrine-liste-horsligne">',
    `<div>${t('vit.liste_hors_ligne')}</div>`,
    `<button class="vt-liste-secondaire" data-action="liste-reessayer">${t('vit.reessayer')}</button>`,
    '</div>',
  ].join('');
}

/** V1/V2 — the vitrine, ready state. One renderer; the profile decides.
 * `notes` (pid → voice note) is render-only: a `ready` note adds the tile chip;
 * everything else renders no chip (§ honesty — a `pending` note never shows). */
export function renderVitrineReady(
  sf: Storefront,
  trust: VitrineTrust,
  opts: VitrineRenderOpts,
  notes: ProductVoiceNotes = {},
  /** BUYER-LIVE-WIRE-3 — the service's described products. Absent ⇒ the demo seed
   *  path (offline harness). Present ⇒ the ONLY source of tiles. */
  described?: readonly VitrineProduct[],
  /** ENTETES-A — which of the five selectable headers to draw. `'classique'`
   *  (the default, and every existing caller) renders the unchanged hero+chips;
   *  the founder's `?entete=` preview swaps ONLY this header unit. Everything
   *  below — à la une, grid, bande, footer — is shared and untouched. */
  entete: EnteteKey = 'classique',
): string {
  const th = VITRINE_THEMES[sf.theme];
  // CONTACT-WHATSAPP-2 — computed once; the prenom rule is the C1 fiche's own.
  const waCtx: WaCtx | undefined =
    opts.whatsapp !== undefined
      ? { digits: opts.whatsapp, prenom: sf.name.replace(/^Chez\s+/i, '').split(' ')[0] ?? sf.name, shopName: sf.name }
      : undefined;
  const parts = [
    renderEntete(
      entete,
      sf,
      trust,
      { fromProduct: opts.fromProduct },
      topBar({ back: opts.fromProduct, accent: th.accent }),
    ),
  ];

  // VITRINE-PRESENTATION-1 (founder defect report 2026-08-02) — the sentence
  // she typed in K2 must reach her cliente. Eight styled units carry it inside
  // the header; the cinematic families deliberately do not, and until now the
  // page rendered it nowhere for them. It appears here, once, directly under
  // the en-tête — and never twice: `enteteMontreBio` mirrors the dispatch's own
  // resolution, so a fallback-to-classique draw (unloaded chunk) counts as the
  // hero, which already shows it.
  if (sf.bio !== '' && !enteteMontreBio(entete)) {
    parts.push(`<div class="vt-presentation" data-role="vitrine-presentation"><v>${esc(sf.bio)}</v></div>`);
  }

  // LISTE-ENVIES-1 — the liste's slot, ABOVE the panier: a friend who tapped
  // a shared liste link came for exactly this, so it is the first thing under
  // the header. FLOWS fills it after mount (the friend's liste is a network
  // read; the creator's band is drawn from the device-local record) — the
  // renderer only reserves the place, so a re-render never flashes a stale
  // liste.
  parts.push('<div data-role="vitrine-liste-slot"></div>');

  // PANIER-VITRINE-1 — HER shelf, back where she left it (founder order
  // 2026-08-22): rendered from the device-local store on every load, above the
  // seller's showcase because a returning buyer's first question is « où en
  // étais-je ? ». The slot always renders so a tap can refresh the band in
  // place; an empty panier renders nothing inside it (honest silence, not an
  // empty box).
  parts.push(`<div data-role="vitrine-panier-slot">${renderPanierBand(sf, described)}</div>`);

  // « PRODUIT À LA UNE » — ≤ 2 pinned, never an out-of-stock article. When she
  // pinned NOTHING (K5), the page still leads with her FIRST in-stock article —
  // deterministic (her own curation order, position 1), so the page has the
  // mockup's shape from day one. The « À LA UNE » badge stays HER claim only:
  // the auto-lead renders without it.
  const pinned = orderedProducts(sf, sf.featuredItems, described)
    .filter((p) => p.inStock)
    .slice(0, 2);
  const autoLead = pinned.length === 0
    ? orderedProducts(sf, undefined, described).filter((p) => p.inStock).slice(0, 1)
    : [];
  const featured = pinned.length > 0 ? pinned : autoLead;
  // UNE SEULE GRILLE (founder, 2026-08-19: « remove sections on buyers page as
  // well ») — the page no longer draws her stored `sections`. He removed the
  // EDITOR on 2026-08-13 (« Sans sections, une seule grille. ») but the page
  // kept drawing groupings nobody could change any more, and BOTH duplicate
  // defects of 2026-08-19 lived in that gap: a pinned article redrawn inside
  // its group, and an article listed in two groups drawn twice. One grid can
  // draw one article once, by construction.
  //
  // The FIELD is canon (§5) and untouched: the wire still carries her grouping
  // and the service still stores it. Only the rendering ends.
  const featuredShown = new Set(featured.map((p) => p.pid));
  // computed BEFORE the featured header so « Voir tout » renders only when the
  // anchor it targets will exist (verifier NB3: a link to a missing id is the
  // dead button its own comment banned).
  const anythingBelow = orderedProducts(sf, undefined, described).some(
    (p) => !featuredShown.has(p.pid),
  );
  if (featured.length > 0) {
    parts.push(
      sectionHead(
        iconStar(15, '#C89A3F'),
        t('vit.head_une'),
        anythingBelow ? t('vit.voir_tout') : undefined,
        anythingBelow ? 'vt-anchor-grid' : undefined,
      ),
    );
    for (const p of featured) parts.push(featuredTile(p, notes[p.pid], pinned.length > 0, sf.slug, waCtx));
    if (anythingBelow) parts.push('<div id="vt-anchor-grid"></div>');
  }

  // THE ONE GRID — every article she curated, in her own order.
  //
  // NORTH-STAR-1 fix (verifier blocker): a featured article also rendered in the
  // grid, and « AUTRES ARTICLES » containing the same article is a title lying
  // about its own list. The exclusion is the pids the featured block ACTUALLY
  // rendered: an épuisé featured item never reaches the hero, so it still
  // appears (voilé) here.
  const residual = orderedProducts(sf, undefined, described).filter(
    (p) => !featuredShown.has(p.pid),
  );
  // Round 4 (verifier B3): a one-product shop's only article IS the auto-lead, so
  // the residual is empty — a heading announcing « Autres articles · 0 » over an
  // empty grid is a heading lying about its own list. Nothing renders instead.
  if (residual.length > 0) {
    // « AUTRES ARTICLES » only when something CAME BEFORE it — since sections
    // left, that is the « à la une » block alone. With nothing above, « autres »
    // would refer to nothing and the honest title is « TOUS LES ARTICLES ».
    const residualLabel = featured.length > 0 ? t('vit.head_autres') : t('vit.head_tous');
    parts.push(sectionHead(iconBag(15, '#6F6355', 1.9), residualLabel, undefined, undefined, residual.length));
    parts.push(grille(residual, notes, sf.slug, waCtx));
  }

  parts.push(inkBandAndFooter(sf));
  return wrap(parts.join(''));
}

/** V6 — vide (avant le premier article): identité compacte + carte dashed. */
export function renderVitrineEmpty(
  sf: Storefront,
  trust: VitrineTrust,
  opts: VitrineRenderOpts,
  /** ENTETES-A — same law as the ready screen: the header unit is the only
   *  thing the key swaps; the dashed empty card and the bande never change. */
  entete: EnteteKey = 'classique',
): string {
  const first = esc(sf.name.replace(/^Chez\s+/i, '').split(' ')[0] ?? sf.name);
  return wrap(
    [
      renderEntete(
        entete,
        sf,
        trust,
        { compact: true, fromProduct: opts.fromProduct },
        topBar({ back: opts.fromProduct, accent: VITRINE_THEMES[sf.theme].accent }),
      ),
      '<div class="vt-empty" data-role="vitrine-vide">',
      iconDevanture(40, '#8A7D6B', 1.7),
      `<div class="vt-empty-titre">${t('vit.vide_titre')}</div>`,
      `<div class="vt-empty-corps"><v>${first}</v> ${t('vit.vide_corps')}</div>`,
      '</div>',
      `<div class="vt-band" data-role="vitrine-bande">${tf('vit.bande', {
        lien: `<b>${t('vit.bande_lien')}</b>`,
      })} ${t('vit.bande_recap')}</div>`,
    ].join(''),
  );
}

/** V3 — squelette (750 ms; exact-box, CLS 0). */
export function renderVitrineSkeleton(): string {
  const skTile =
    '<div class="vt-sk-tile"><div class="vt-sk-art vt-shim"></div><div class="vt-sk-body"><div class="vt-sk-line1"></div><div class="vt-sk-line2"></div></div></div>';
  // NB2 (verifier): the skeleton mirrors the READY layout — the hero is the
  // first child and the topbar lives inside it, so the load has no 40px jolt.
  return wrap(
    [
      '<div class="vt-sk-cover vt-shim"></div>',
      '<div class="vt-sk-identity">',
      '<div class="vt-sk-avatar"></div>',
      '<div class="vt-sk-name vt-shim"></div>',
      '<div class="vt-sk-zone"></div>',
      '</div>',
      `<div class="vt-sk-grid">${skTile}${skTile}${skTile}${skTile}</div>`,
      `<div class="vt-sk-note">${t('vit.ouverture')}</div>`,
    ].join(''),
  );
}

/** V4 — hors ligne (sans cache). C-VIT9. */
export function renderVitrineOffline(): string {
  return wrap(
    [
      topBar({ back: false, accent: '#C2571B' }),
      '<div class="vt-state" data-etat="horsligne">',
      `<div class="vt-picto">${iconWifiOff(30, '#1C1710', 1.9)}</div>`,
      `<h3>${t('vit.horsligne_titre')}</h3>`,
      `<p>${t('vit.horsligne_corps')}</p>`,
      `<span class="vt-ghostbtn" role="button" data-action="reessayer">${t('vit.reessayer')}</span>`,
      '</div>',
    ].join(''),
  );
}

/** V5 — lien invalide (honest not-found; the ONLY exit from the identity). */
export function renderVitrineInvalid(): string {
  return wrap(
    [
      '<div class="vt-state" data-etat="invalide">',
      `<div class="vt-picto">${iconBrokenLink(28, '#1C1710', 1.9)}</div>`,
      `<h3>${t('vit.invalide_titre')}</h3>`,
      `<p>${t('vit.invalide_corps')}</p>`,
      `<span class="vt-ghostbtn" role="button" data-action="decouvrir">${t('vit.decouvrir')}</span>`,
      '</div>',
    ].join(''),
  );
}

function wrap(inner: string): string {
  return `<div class="vt-status"></div><div class="vt-lisere"></div><div class="vt-scroll vt-screen">${inner}</div>`;
}

/** C-ENT icons re-exported for the E-screen grafts (product page entries). */
export const entIcons = { iconChevron, iconDevanture, iconCheck };
