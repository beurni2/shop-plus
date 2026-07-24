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
import { seedProduct, type VitrineSeedProduct } from './catalog';
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
  iconStar,
  iconWifiOff,
  productGlyph,
} from './icons';
import { VITRINE_THEMES } from './themes';

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

/** C-VIT1 — la couverture (default: habillage tissé + filigrane; live: photo). */
function cover(sf: Storefront): string {
  const initial = esc(sf.name.replace(/^Chez\s+/i, '').charAt(0).toUpperCase());
  if (sf.cover.status === 'live') {
    return [
      '<div class="vt-cover vt-cover-live" data-role="vitrine-cover" data-etat="live">',
      '<div class="vt-cover-stripes vt-cover-stripes-photo"></div>',
      `<em class="vt-glyph" data-glyph="photo">${productGlyph('photo')}</em>`,
      `<div class="vt-cover-caps">${t('vit.cover_caps')}</div>`,
      '</div>',
    ].join('');
  }
  // §4.2/§6: uploading/pending/error are RESELLER-side states — the buyer keeps
  // seeing the previous truth (none → tissé, former live stays live server-side).
  return [
    '<div class="vt-cover" data-role="vitrine-cover" data-etat="none">',
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
  const avis =
    trust.reviewCount >= AVIS_FLOOR
      ? [
          '<span class="vt-chip vt-chip-line" data-role="chip-avis">',
          iconStar(12, '#C89A3F'),
          `<v>${esc(trust.rating)}</v> · <v>${trust.reviewCount}</v> ${t('vit.avis_verifies')}`,
          '</span>',
        ].join('')
      : '';
  // No earned proof AT ALL (no delivery, no review) → name the state honestly.
  const nouvelle =
    trust.deliveredCount === 0 && trust.reviewCount === 0
      ? `<span class="vt-chip vt-chip-line" data-role="chip-nouvelle">${t('vit.nouvelle_vendeuse')}</span>`
      : '';
  return [
    '<div class="vt-chips" data-role="vitrine-trust">',
    `<span class="vt-chip vt-chip-full">${iconShieldCheck(13, th.deep, 2)}${t('vit.chip_sera')}</span>`,
    `<span class="vt-chip vt-chip-line">${t('vit.chip_paiement')}</span>`,
    avis,
    nouvelle,
    '</div>',
  ].join('');
}

/** C-VIT2 — le bloc identité (chevauche la couverture). */
function identity(sf: Storefront, trust: VitrineTrust, opts: { compact?: boolean } = {}): string {
  const th = VITRINE_THEMES[sf.theme];
  const initial = esc(sf.name.replace(/^Chez\s+/i, '').charAt(0).toUpperCase());
  const parts = [
    '<div class="vt-identity" data-role="vitrine-identity">',
    `<span class="vt-avatar">${initial}</span>`,
    `<div class="vt-namerow"><v>${esc(sf.name)}</v>${iconCheck(17, th.accent, 2.6)}</div>`,
  ];
  if (!opts.compact && sf.tagline) parts.push(`<div class="vt-tagline"><v>${esc(sf.tagline)}</v></div>`);
  parts.push(`<div class="vt-zone">${t('vit.verifiee')} <v>${esc(sf.zone)}</v></div>`);
  if (!opts.compact) {
    parts.push(chips(sf, trust));
    if (trust.deliveredCount >= 1) {
      parts.push(
        `<div class="vt-rep" data-role="reputation"><v>${trust.deliveredCount}</v> ${t('vit.ventes_livrees')}</div>`,
      );
    }
    if (sf.bio) parts.push(`<div class="vt-bio"><v>${esc(sf.bio)}</v></div>`);
  }
  parts.push('</div>');
  return parts.join('');
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
function tileArt(veiled: boolean): string {
  return [
    '<div class="vt-tile-art vt-tile-art-sansphoto" data-role="tile-sans-photo">',
    '<div class="vt-weave"></div>',
    '<div class="vt-tick vt-tick-tl"></div><div class="vt-tick vt-tick-tr"></div><div class="vt-tick vt-tick-bl"></div><div class="vt-tick vt-tick-br"></div>',
    `<div class="vt-sansphoto-caps">${t('vit.sans_photo')}</div>`,
    veiled ? `<div class="vt-veil"><span class="vt-tampon">${t('vit.epuise')}</span></div>` : '',
    '</div>',
  ].join('');
}

/** C-VIT4 — tuile produit v2. Épuisé: voile + tampon, muette (aria-disabled).
 * A `ready` voice note adds the compact « La voix » chip (in-stock tiles only —
 * an épuisé tile is muette and carries no interactive child). */
function tile(p: VitrineSeedProduct, note?: ProductVoiceNote): string {
  const cls = p.inStock ? 'vt-tile' : 'vt-tile vt-tile-epuise';
  const attrs = p.inStock
    ? `data-action="produit" data-pid="${p.pid}"`
    : 'aria-disabled="true" disabled';
  return [
    `<button class="${cls}" data-role="vitrine-produit" ${attrs}>`,
    tileArt(!p.inStock),
    '<div class="vt-tile-body">',
    `<div class="vt-tile-name"><v>${esc(p.name)}</v></div>`,
    `<div class="vt-tile-price"><v>${fmtFcfa(p.priceFcfa)}</v></div>`,
    p.inStock ? renderVoiceChip(note) : '',
    '</div>',
    '</button>',
  ].join('');
}

/** C-VIT5 — tuile à la une (jamais un épuisé: auto-retrait à l'affichage). */
function featuredTile(p: VitrineSeedProduct, note?: ProductVoiceNote): string {
  return [
    `<button class="vt-featured" data-role="vitrine-a-la-une" data-action="produit" data-pid="${p.pid}">`,
    tileArt(false),
    '<div class="vt-featured-body">',
    `<span class="vt-featured-name"><v>${esc(p.name)}</v></span>`,
    `<b class="vt-featured-price"><v>${fmtFcfa(p.priceFcfa)}</v></b>`,
    renderVoiceChip(note),
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
function orderedProducts(sf: Storefront, pids?: readonly string[]): VitrineSeedProduct[] {
  const all = (pids ?? sf.curatedItems).map(seedProduct).filter((p): p is VitrineSeedProduct => !!p);
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
): string {
  const th = VITRINE_THEMES[sf.theme];
  const parts = [
    topBar({ back: opts.fromProduct, accent: th.accent }),
    cover(sf),
    identity(sf, trust),
  ];

  // « À LA UNE » — ≤ 2 pinned, never an out-of-stock article (auto-retrait).
  const featured = sf.featuredItems
    .map(seedProduct)
    .filter((p): p is VitrineSeedProduct => !!p && p.inStock)
    .slice(0, 2);
  if (featured.length > 0) {
    parts.push(groupTitle(t('vit.a_la_une'), undefined));
    for (const p of featured) parts.push(featuredTile(p, notes[p.pid]));
  }

  // Sections (≤ 4, empty invisible), then the residual « TOUS LES ARTICLES ».
  const sectioned = new Set(sf.sections.flatMap((s) => s.pids));
  const visibleSections = sf.sections.filter((s) => s.pids.length > 0);
  for (const s of visibleSections) {
    const prods = orderedProducts(sf, s.pids);
    parts.push(groupTitle(esc(s.name).toUpperCase(), prods.length, 'section'));
    parts.push(`<div class="vt-grid">${prods.map((p) => tile(p, notes[p.pid])).join('')}</div>`);
  }
  const residual = orderedProducts(sf).filter((p) => !sectioned.has(p.pid));
  if (visibleSections.length === 0 || residual.length > 0) {
    parts.push(
      groupTitle(t('vit.groupe_tous'), residual.length, visibleSections.length === 0 ? 'var' : 'literal'),
    );
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
      topBar({ back: opts.fromProduct, accent: VITRINE_THEMES[sf.theme].accent }),
      cover(sf),
      identity(sf, trust, { compact: true }),
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
  return wrap(
    [
      topBar({ back: false, accent: '#C2571B' }),
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
