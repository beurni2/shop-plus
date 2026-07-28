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
import { fmtFCFA } from '../cliente/money';
import { productFromSeed, seedProduct, type VitrineProduct, type VitrineSeedProduct } from './catalog';
import type { Storefront, VitrineTrust, ProductVoiceNote, ProductVoiceNotes } from './profile';
import { renderVoiceChip } from './voice-player';
import {
  iconBack,
  iconBrokenLink,
  iconCheck,
  iconChevron,
  iconDevanture,
  iconShare,
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

/** « X\u202fFCFA » — the ONE formatter (cliente/money): U+202F thousands +
 * U+202F before FCFA, built from the escaped constant — never Intl (ICU
 * drift), never a bare « F », never a raw byte in source (PWA-CLEANUP-1 §2). */
export function fmtFcfa(n: number): string {
  return fmtFCFA(n);
}

const AVIS_FLOOR = 3; // §9.4 frozen: the review chip appears at ≥ 3 verified reviews

/* ------------------------------------------------------------ components -- */

function topBar(opts: { back: boolean; accent: string }): string {
  return [
    '<div class="vt-topbar" data-role="vitrine-topbar">',
    opts.back
      ? `<button class="vt-topbtn" data-action="retour" aria-label="${t('vit.retour_aria')}">${iconBack(17, '#1C1710', 2.1)}</button>`
      : '',
    '<div class="vt-spacer"></div>',
    `<div class="vt-topbtn" data-action="partager" role="button" aria-label="${t('vit.partager_aria')}">${iconShare(17, '#1C1710', 1.9)}</div>`,
    '</div>',
  ].join('');
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
    return [
      '<div class="vt-hero-photo vt-cover-photo" data-role="vitrine-cover" data-etat="live">',
      `<img class="vt-cover-img" src="${esc(sf.cover.url)}" alt="${t('vit.cover_alt')}" loading="lazy" decoding="async">`,
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
function chips(sf: Storefront, trust: VitrineTrust): string {
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
function hero(sf: Storefront, trust: VitrineTrust, opts: { compact?: boolean } = {}, floatBar = ''): string {
  const th = VITRINE_THEMES[sf.theme];
  const initial = esc(sf.name.replace(/^Chez\s+/i, '').charAt(0).toUpperCase());
  // MEDIA-2 — her portrait or the monogram; photo-mode-without-url falls back.
  // Round 4 (founder mockup): the gold-ringed monogram with the little check
  // bubble riding the circle's edge — the vérifiée mark next to her portrait.
  const badge = `<span class="vt-avatar-badge">${iconCheck(9, '#F6F0E4', 3)}</span>`;
  const avatar =
    sf.avatar.mode === 'photo' && sf.avatar.url
      ? `<span class="vt-avatar vt-avatar-photo"><img class="vt-avatar-img" src="${esc(sf.avatar.url)}" alt="${t('vit.avatar_alt')}" loading="lazy" decoding="async">${badge}</span>`
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

/** C-VIT6 — titre de groupe « CAPS · N ». The planche authors the count as a
 * `<v>` on the day-1 screen and as literal text on the customised one; we
 * mirror node-for-node (zero-diff law) — same rendered bytes either way. */
function groupTitle(
  label: string,
  count: number | undefined,
  mode: 'var' | 'literal' | 'section' = 'var',
): string {
  const b = mode === 'section' ? `<b><v>${label}</v></b>` : `<b>${label}</b>`;
  const i =
    count === undefined ? '' : mode === 'var' ? `<i>· <v>${count}</v></i>` : `<i>· ${count}</i>`;
  return `<div class="vt-group">${b}${i}</div>`;
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
 * A `ready` voice note adds the compact « La voix » chip (in-stock tiles only —
 * an épuisé tile is muette and carries no interactive child). */
/** The wishlist heart — role=button inside the tile button (voice-chip
 *  precedent: closest() routes its tap to `favori`, never to `produit`). */
function fav(pid: string): string {
  const on = isFavorite(pid);
  return `<span class="vt-fav${on ? ' vt-fav-on' : ''}" role="button" tabindex="0" data-action="favori" data-pid="${pid}" aria-pressed="${on}" aria-label="${t('vit.favori_aria')}">${iconHeart(16, '#1C1710', 1.9)}</span>`;
}

function tile(p: VitrineProduct, note?: ProductVoiceNote): string {
  const cls = p.inStock ? 'vt-tile' : 'vt-tile vt-tile-epuise';
  const attrs = p.inStock
    ? `data-action="produit" data-pid="${p.pid}"`
    : 'aria-disabled="true" disabled';
  // NORTH-STAR-1 — the go circle is a chevron, not a cart (no cart exists). The
  // heart is REAL: a working device-local wishlist (favorites.ts), because a
  // decorative heart would be a dead button. « Livraison 24–48h · Séra
  // vérifiée » is the FOUNDER'S delivery promise (his order, logged) — flagged
  // as unmeasured, reaffirmed, rendered as given.
  return [
    `<button class="${cls}" data-role="vitrine-produit" ${attrs}>`,
    `<div class="vt-artwrap">${tileArt(!p.inStock, p.assetRefs)}${p.inStock ? fav(p.pid) : ''}</div>`,
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
function featuredTile(p: VitrineProduct, note?: ProductVoiceNote, pinnedByHer = true): string {
  return [
    `<button class="vt-featured" data-role="vitrine-a-la-une" data-action="produit" data-pid="${p.pid}">`,
    `<div class="vt-featured-artwrap">${tileArt(false, p.assetRefs)}${pinnedByHer ? `<span class="vt-featured-badge">${t('vit.a_la_une')}</span>` : ''}${fav(p.pid)}</div>`,
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
): string {
  const th = VITRINE_THEMES[sf.theme];
  const parts = [
    hero(sf, trust, {}, topBar({ back: opts.fromProduct, accent: th.accent })),
    chips(sf, trust),
  ];

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
  // computed BEFORE the featured header so « Voir tout » renders only when the
  // anchor it targets will exist (verifier NB3: a link to a missing id is the
  // dead button its own comment banned).
  const sectionedEarly = new Set(sf.sections.flatMap((sec) => sec.pids));
  const featuredShownEarly = new Set(featured.map((p) => p.pid));
  const anythingBelow =
    sf.sections.some((sec) => sec.pids.length > 0) ||
    orderedProducts(sf, undefined, described).some(
      (p) => !sectionedEarly.has(p.pid) && !featuredShownEarly.has(p.pid),
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
    for (const p of featured) parts.push(featuredTile(p, notes[p.pid], pinned.length > 0));
    if (anythingBelow) parts.push('<div id="vt-anchor-grid"></div>');
  }

  // Sections (≤ 4, empty invisible), then the residual « TOUS LES ARTICLES ».
  const sectioned = new Set(sf.sections.flatMap((s) => s.pids));
  const visibleSections = sf.sections.filter((s) => s.pids.length > 0);
  for (const s of visibleSections) {
    const prods = orderedProducts(sf, s.pids, described);
    parts.push(groupTitle(esc(s.name).toUpperCase(), prods.length, 'section'));
    parts.push(`<div class="vt-grid">${prods.map((p) => tile(p, notes[p.pid])).join('')}</div>`);
  }
  // NORTH-STAR-1 fix (verifier blocker): a featured article also rendered in the
  // grid — two tiles, two hearts, desynced on tap; and « AUTRES ARTICLES » that
  // contains the same article is a title lying about its own list. The exclusion
  // is the pids the featured section ACTUALLY rendered: an épuisé featured item
  // never reaches the hero, so it still appears (voilé) in the grid.
  const featuredShown = new Set(featured.map((p) => p.pid));
  const residual = orderedProducts(sf, undefined, described).filter(
    (p) => !sectioned.has(p.pid) && !featuredShown.has(p.pid),
  );
  // Round 4 (verifier B3): a one-product shop's only article IS the auto-lead, so
  // the residual is empty — a heading announcing « Autres articles · 0 » over an
  // empty grid is a heading lying about its own list. Nothing renders instead.
  if (residual.length > 0) {
    // « AUTRES ARTICLES » only when something CAME BEFORE it (à la une or a
    // section) — with nothing above, « autres » would refer to nothing and the
    // honest title is « TOUS LES ARTICLES ».
    const residualLabel = featured.length > 0 || visibleSections.length > 0 ? t('vit.head_autres') : t('vit.head_tous');
    parts.push(sectionHead(iconBag(15, '#6F6355', 1.9), residualLabel, undefined, undefined, residual.length));
    parts.push(`<div class="vt-grid">${residual.map((p) => tile(p, notes[p.pid])).join('')}</div>`);
  }

  parts.push(inkBandAndFooter(sf));
  return wrap(parts.join(''));
}

/** V6 — vide (avant le premier article): identité compacte + carte dashed. */
export function renderVitrineEmpty(sf: Storefront, trust: VitrineTrust, opts: VitrineRenderOpts): string {
  const first = esc(sf.name.replace(/^Chez\s+/i, '').split(' ')[0] ?? sf.name);
  return wrap(
    [
      hero(sf, trust, { compact: true }, topBar({ back: opts.fromProduct, accent: VITRINE_THEMES[sf.theme].accent })),
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
