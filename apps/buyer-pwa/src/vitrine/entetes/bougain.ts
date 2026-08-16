import { t } from '../../i18n';
import { iconCheckEnt, iconLockEnt, iconPinEnt, iconShieldEnt, iconStarEnt, iconTagEnt } from '../icons';
import {
  avisChip,
  controls,
  etatPhoto,
  framePhoto,
  hasPhoto,
  ventesLine,
  verifieeBare,
  type Vals,
} from '../entetes';
import type { EnteteUnit } from './registry';

/**
 * ENTETES-M · SÉRIE 10 — 53 · BOUGAINVILLIER — « la cour fleurie ».
 *
 * SOURCE OF TRUTH: the id="bougain" block of « En-tetes Boutique - Serie 10 »
 * and its « Relevé — Bougainvillier ». Origine: création originale.
 *
 * THE CANON KEY IS `bougain`, NOT `bougainvillier` — the brief's own `id=`
 * anchor, which is the rule recorded at ENTETES-H. The seller reads
 * « Bougainvillier » in her picker; that string lives in the catalog.
 *
 * A OUAGA COURTYARD UNDER THE BOUGAINVILLEA: you enter by the arch, and the
 * flowers spill over the wall. The branch is one SVG crossing the top of the
 * hero — stem, two leaves, two bract clusters (trios of rotated ellipses, the
 * bougainvillea's real form: three bracts around a cream heart).
 *
 * THE KICKER HALO IS MANDATORY, AND THE RELEVÉ SAYS SO IN CAPITALS. « LA COUR
 * FLEURIE · OUAGADOUGOU » sits under falling petals; without a triple cream
 * text-shadow (and a doubled drop-shadow on its bullet) a petal passing behind
 * it makes the line unreadable — especially at 320, where « Ouagadougou »
 * wraps. This is the 5-second test written as a CSS rule.
 *
 * THE PHOTO IS THE ARCH: 150 wide, from top 24 to the hero's FOOT, radius
 * 110/110/0/0 — a doorway, not a portrait frame. Its triple setting is drawn
 * with box-shadow reaching 7px beyond the box, so the column clears the
 * SETTING, not the arch. That is the Calebasse lesson, applied on purpose.
 *
 * MINIMAL is a crown of bracts, IN THE COLUMN (ENTETES-K). Verified seal on
 * its own line — here a LEAF pastille, not the usual disc. Bio not drawn.
 * 24px tier past 14 characters.
 */

/** The branch: stem, two leaves, two bract clusters. */
const branche = (): string =>
  '<svg class="bg-branche" aria-hidden="true" width="150" height="118" viewBox="0 0 150 118" fill="none">' +
  '<path d="M-4 30C22 22 44 34 62 30 86 24 108 40 150 26" stroke="#8A5A3B" stroke-width="1.6" stroke-linecap="round"/>' +
  '<ellipse cx="74" cy="18" rx="9" ry="5.5" fill="#4E7A52" transform="rotate(-24 74 18)"/>' +
  '<ellipse cx="104" cy="40" rx="8" ry="5" fill="#5E8A5F" transform="rotate(16 104 40)"/>' +
  // the big cluster — tightened UPWARD so the kicker band stays clear (petals ≤ y57)
  '<g fill="url(#bgFu)">' +
  '<ellipse cx="34" cy="26" rx="10" ry="14" transform="rotate(-18 34 26)"/>' +
  '<ellipse cx="17" cy="42" rx="10" ry="15" transform="rotate(-64 17 42)"/>' +
  '<ellipse cx="48" cy="43" rx="10" ry="14" transform="rotate(42 48 43)"/></g>' +
  '<circle cx="33" cy="37" r="3.2" fill="#FFF6EC"/>' +
  '<g fill="url(#bgFu)">' +
  '<ellipse cx="122" cy="14" rx="8.5" ry="13" transform="rotate(-22 122 14)"/>' +
  '<ellipse cx="108" cy="26" rx="8.5" ry="13" transform="rotate(-70 108 26)"/>' +
  '<ellipse cx="134" cy="28" rx="8.5" ry="13" transform="rotate(38 134 28)"/></g>' +
  '<circle cx="121" cy="23" r="2.6" fill="#FFF6EC"/>' +
  '<defs><linearGradient id="bgFu" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#C7326E"/><stop offset="1" stop-color="#E05C93"/></linearGradient></defs></svg>';

/** Petals falling along the arch. */
const petales = (): string =>
  '<svg class="bg-petales" aria-hidden="true" width="40" height="200" viewBox="0 0 40 200" fill="none">' +
  '<ellipse cx="12" cy="18" rx="3.6" ry="6.4" fill="#E05C93" opacity=".7" transform="rotate(24 12 18)"/>' +
  '<ellipse cx="27" cy="62" rx="3.2" ry="5.6" fill="#C7326E" opacity=".5" transform="rotate(-38 27 62)"/>' +
  '<ellipse cx="9" cy="112" rx="4" ry="7" fill="#E05C93" opacity=".6" transform="rotate(52 9 112)"/>' +
  '<ellipse cx="24" cy="162" rx="3.4" ry="6" fill="#C7326E" opacity=".45" transform="rotate(-16 24 162)"/></svg>';

/** The kicker's petal bullet. */
const petalePuce = (): string =>
  '<svg class="bg-puce" aria-hidden="true" width="9" height="11" viewBox="0 0 9 11" fill="none">' +
  '<ellipse cx="4.5" cy="5.5" rx="4" ry="5.2" fill="#C7326E" transform="rotate(-18 4.5 5.5)"/></svg>';

/** The veined leaf that leads the proof chip. */
const feuille = (): string =>
  '<svg class="bg-feuille" aria-hidden="true" width="16" height="12" viewBox="0 0 16 12" fill="none">' +
  '<path d="M15 2C11 0 3 1 1 7c5 4 12 3 14-5z" fill="#4E7A52"/>' +
  '<path d="M13.5 3.2C10 5 7 6.4 3.4 7.6" stroke="#FFF6EC" stroke-width="1.4" stroke-linecap="round"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="bg-cell"><span class="bg-cell-i">${icon}</span><span class="bg-cell-l">${label}</span><span class="bg-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-bg" data-role="vitrine-hero">',
    '<div class="bg-hero">',
    branche(),
    petales(),
    // the garden arch — full height, flush to the hero's foot
    `<div class="bg-arche" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 22%')
      : `<div class="bg-motif"><span class="bg-mono">${v.mono}</span><span class="bg-pilule" aria-hidden="true"></span></div>`,
    '</div>',
    '<div class="bg-col" data-role="vitrine-identity">',
    `<div class="bg-kick">${petalePuce()}<span>${t('vit.bg_kicker')}</span></div>`,
    v.hasTag
      ? `<div class="bg-bienv"><span class="bg-bienv-t"><v>${v.tagline}</v></span><span class="bg-tiret" aria-hidden="true"></span></div>`
      : '',
    `<div class="bg-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="bg-verif"><span class="bg-verif-i">${iconCheckEnt(9, '#FFF6EC', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="bg-zone">${iconPinEnt(12, '#8A5A3B', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="bg-proof-wrap"><span class="bg-proof">${feuille()}<span class="bg-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="bg-stars" data-role="chip-avis">${iconStarEnt(10, '#C7326E')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="bg-nouv-wrap"><span class="bg-nouv" data-role="chip-nouvelle"><span class="bg-couronne" aria-hidden="true"></span><span class="bg-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="bg-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#33222B', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#33222B', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#33222B', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'bg', 'right', '20px', '72px', '#33222B'),
    '</div>',
  ].join('');
}

const css = `
  /* ═══════════════ 53 · BOUGAINVILLIER (série 10) ═══════════════
     Relevé — crème chaude #FFF6EC · fuchsia #C7326E→#E05C93 · feuille
     #4E7A52 / #5E8A5F · branche #8A5A3B · prune de cour #33222B ·
     rangée #33222B, sous-lignes #DE95B7. */
  .vt-bg {
    --bg-creme: #FFF6EC; --bg-fu: #C7326E; --bg-fu-2: #E05C93;
    --bg-feuille: #4E7A52; --bg-branche: #8A5A3B; --bg-prune: #33222B;
    --bg-sous: #DE95B7;
    background: var(--bg-creme);
  }
  /* the courtyard wall — a warm cream flat, nothing more */
  .vt-bg .bg-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 0;
    background: var(--bg-creme);
  }
  .vt-bg .bg-branche { position: absolute; left: -12px; top: -10px; }
  .vt-bg .bg-petales { position: absolute; left: 150px; top: 96px; opacity: .75; }
  /* THE ARCH — 150 wide, top 24 to the hero's FOOT. The triple setting is a
     box-shadow reaching 7px past the box and NO layout box accounts for it, so
     the column clears the SETTING at x=203, not the arch's own 196. Third time
     this arithmetic has mattered (Calebasse's rim); it is
     written here rather than rediscovered. */
  .vt-bg .bg-arche {
    position: absolute; right: 14px; top: 24px; bottom: 0; width: 150px;
    border-radius: 110px 110px 0 0; overflow: hidden; background: #F6D0DF;
    box-shadow: 0 0 0 2px var(--bg-fu), 0 0 0 6px var(--bg-creme), 0 0 0 7px rgba(199,50,110,.35),
      0 16px 30px -20px rgba(51,34,43,.6);
  }
  .vt-bg .bg-arche .vt-avatar-img { object-position: 50% 22%; }
  .vt-bg .bg-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(180deg, #FBE3ED 0%, #F6D0DF 100%);
  }
  .vt-bg .bg-mono {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 84px; color: var(--bg-fu);
  }
  .vt-bg .bg-pilule {
    position: absolute; left: 16px; bottom: 22px; width: 22px; height: 10px;
    border-radius: 99px; background: var(--bg-feuille); transform: rotate(-24deg);
  }
  /* the column drops 34px clear of the branch, per the relevé */
  .vt-bg .bg-col { position: relative; margin-top: 34px; width: calc(100% - 156px); min-height: 224px; padding-bottom: 22px; }
  /* THE KICKER'S CREAM HALO — obligatoire. A falling petal behind this line
     would otherwise take it out entirely, and « Ouagadougou » wraps at 320,
     which puts more of the line under the arch's petals. */
  .vt-bg .bg-kick {
    display: flex; align-items: center; gap: 6px; font-size: 9px; font-weight: 700;
    letter-spacing: .18em; text-transform: uppercase; color: #A03A63;
    text-shadow: 0 0 5px var(--bg-creme), 0 0 5px var(--bg-creme), 0 0 8px var(--bg-creme);
  }
  .vt-bg .bg-puce {
    flex: none; display: block;
    filter: drop-shadow(0 0 3px var(--bg-creme)) drop-shadow(0 0 3px var(--bg-creme));
  }
  .vt-bg .bg-bienv { margin-top: 9px; }
  .vt-bg .bg-bienv-t {
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px;
    color: #5A3040;
  }
  .vt-bg .bg-tiret {
    display: block; margin-top: 7px; width: 64px; height: 2.5px; border-radius: 2px;
    background: linear-gradient(90deg, var(--bg-fu) 0%, var(--bg-fu-2) 60%, var(--bg-feuille) 100%);
  }
  .vt-bg .bg-name {
    margin-top: 10px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(30px, 10.6cqw, 36px); line-height: 1.02; letter-spacing: -.02em;
    color: var(--bg-prune);
  }
  .vt-bg .bg-name .vt-ent-acc { color: var(--bg-fu); }
  .vt-bg .bg-name.vt-ent-long { font-size: 24px; }
  .vt-bg .bg-verif { display: flex; align-items: center; gap: 7px; margin-top: 10px; font-size: 13px; font-weight: 700; color: var(--bg-prune); }
  /* the seal is a LEAF here, not the usual disc — the courtyard's own badge */
  .vt-bg .bg-verif-i {
    display: inline-flex; align-items: center; justify-content: center; flex: none;
    width: 17px; height: 17px; background: var(--bg-feuille);
    border-radius: 50% 12% 50% 12%;
  }
  .vt-bg .bg-zone { display: flex; align-items: center; gap: 6px; margin-top: 7px; font-size: 12.5px; color: #7A5F68; }
  .vt-bg .bg-proof-wrap { margin-top: 12px; }
  .vt-bg .bg-proof {
    display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 34px;
    padding: 9px 14px; border-radius: 14px; background: #FFFFFF;
    box-shadow: inset 0 0 0 1.5px rgba(199,50,110,.35), 0 10px 20px -16px rgba(51,34,43,.5);
  }
  .vt-bg .bg-feuille { flex: none; display: block; }
  .vt-bg .bg-proof-l { font-size: 13px; color: #6E5560; }
  .vt-bg .bg-proof-l b { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 19px; color: var(--bg-fu); }
  .vt-bg .bg-stars { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: #9B7A89; }
  /* THE CROWN — ten bracts in a ring with four cardinal leaves, drawn as one
     conic + one repeating-conic so it costs no SVG. In the column (ENTETES-K). */
  .vt-bg .bg-nouv-wrap { margin-top: 14px; }
  .vt-bg .bg-nouv {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 96px; height: 96px; border-radius: 50%;
  }
  .vt-bg .bg-couronne {
    position: absolute; inset: 0; border-radius: 50%;
    background:
      repeating-conic-gradient(from 0deg, var(--bg-fu) 0 12deg, transparent 12deg 36deg),
      repeating-conic-gradient(from 18deg, rgba(224,92,147,.85) 0 12deg, transparent 12deg 36deg),
      repeating-conic-gradient(from 0deg, var(--bg-feuille) 0 5deg, transparent 5deg 90deg);
    -webkit-mask-image: radial-gradient(circle, transparent 27px, #000 28px);
    mask-image: radial-gradient(circle, transparent 27px, #000 28px);
  }
  .vt-bg .bg-nouv-t {
    position: relative; font-family: Georgia, 'Times New Roman', serif; font-style: italic;
    font-size: 12px; line-height: 1.15; text-align: center; color: #8C2350; max-width: 54px;
  }
  .vt-bg .bg-trust {
    display: flex; align-items: stretch; padding: 13px 4px; background: var(--bg-prune);
  }
  .vt-bg .bg-cell {
    flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 0 6px; text-align: center;
  }
  .vt-bg .bg-cell + .bg-cell { border-left: 1px solid rgba(255,246,236,.22); }
  .vt-bg .bg-cell-i {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: #FBEFE2;
  }
  .vt-bg .bg-cell-l { font-size: 11.5px; font-weight: 700; line-height: 1.2; color: #FFF6EC; }
  .vt-bg .bg-cell-s { font-size: 10px; line-height: 1.2; color: var(--bg-sous); }
  .vt-bg .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-bg .bg-hero { padding: 74px 12px 0; }
    /* 132 at right 12, setting 7 further out ⇒ it owns past x=169, and the
       column stops at 156. */
    .vt-bg .bg-arche { right: 12px; width: 132px; border-radius: 96px 96px 0 0; }
    .vt-bg .bg-petales { left: 132px; }
    .vt-bg .bg-col { width: calc(100% - 140px); min-height: 214px; }
    .vt-bg .bg-name { font-size: clamp(26px, 10.6cqw, 30px); }
    .vt-bg .bg-name.vt-ent-long { font-size: 22px; }
    .vt-bg .bg-mono { font-size: 70px; }
    .vt-bg .bg-bienv-t { font-size: 16px; }
    .vt-bg .bg-trust { padding: 11px 2px; }
    .vt-bg .bg-cell { padding: 0 4px; gap: 5px; }
    .vt-bg .bg-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
