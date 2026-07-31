import { t } from '../../i18n';
import { iconCheckEnt, iconLockEnt, iconPinEnt, iconShieldEnt, iconStarEnt, iconTagEnt } from '../icons';
import {
  avisChip,
  controls,
  etatPhoto,
  framePhoto,
  hasPhoto,
  ventesLine,
  zoneLine,
  type Vals,
} from '../entetes';
import type { EnteteUnit } from './registry';

/**
 * ENTETES-H · SÉRIE 2 — 8 · SAFRAN — « soleil safran & cacao, photo en cercle
 * à gauche ».
 *
 * SOURCE OF TRUTH: the id="safran" block of « En-tetes Boutique - Serie 2 »
 * and its « Relevé — Safran ». Origine: création originale série 2.
 *
 * THE ONE STYLE WHERE THE PHOTOGRAPH LIVES ON THE LEFT, and the relevé says
 * why: « un cercle qui mord le bord, comme un soleil levant ». A 190px circle
 * sits at left −58, so only 132px of it are ever on screen; the header's own
 * overflow does the cutting. Everything else — the sunburst fan in the corner,
 * the dashed solar ring, the seed grid — is a sunrise built out of gradients.
 *
 * A SPLIT COLUMN, so the long-name rule APPLIES here. « Colonnes fendues
 * (Safran, Kraft) : nom > 14 caractères → 20 px fixe ». Indigo and Couture run
 * full-width and have no fixed tier; this one does, because the text column is
 * only 132px narrower than the card and a 24-char name at 26px would run into
 * the photograph. That is `v.longName` → `.vt-ent-long`, the mechanism série 1
 * and série 4 already use.
 *
 * THE SEAL IS WELDED TO THE NAME (« soudé au dernier segment (nowrap) »),
 * safran 18 with a dashed feston — the série 1 convention, same as Indigo.
 *
 * VERTICAL OFFSETS CARRY +58. The relevé positions its decorations inside a
 * 16px pad; this header also owns the shell's 60px status pad, so its own
 * padding-top is 74 and every absolutely-positioned element that must line up
 * with the TEXT is written as (relevé + 58). The fan keeps its raw −120: it is
 * anchored to the card's real top-left corner, which is where a sunrise
 * belongs, not to the text.
 */

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="sa-cell"><span class="sa-cell-i">${icon}</span><span class="sa-cell-l">${label}</span><span class="sa-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-sa" data-role="vitrine-hero">',
    '<div class="sa-hero">',
    // the sunrise, in two gradients — never an image at runtime
    '<span class="sa-eventail" aria-hidden="true"></span>',
    '<span class="sa-graines" aria-hidden="true"></span>',
    // « un cercle qui mord le bord » — 190px at left −58, so 132 are visible
    `<div class="sa-cercle" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '58% 30%')
      : `<div class="sa-motif"><span class="sa-mono">${v.mono}</span></div>`,
    '</div>',
    '<span class="sa-solaire" aria-hidden="true"></span>',
    '<div class="sa-col" data-role="vitrine-identity">',
    // her portrait beside the name, with the vérifiée badge the relevé draws
    `<div class="sa-av" data-etat="${v.hasAvatar ? 'live' : 'none'}">`,
    v.hasAvatar
      ? framePhoto({ ...v, hasCover: false }, '50% 30%')
      : `<span class="sa-av-mono">${v.mono}</span>`,
    `<span class="sa-av-badge" aria-hidden="true">${iconCheckEnt(9, '#FFFFFF', 3.6)}</span>`,
    '</div>',
    `<div class="sa-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}<span class="sa-seal" aria-hidden="true"><span class="sa-seal-d">${iconCheckEnt(10, '#FFFFFF', 3.4)}</span><span class="sa-seal-f"></span></span></div>`,
    v.hasTag ? `<div class="sa-bienv"><v>${v.tagline}</v></div>` : '',
    `<div class="sa-zone">${zoneLine(v, iconPinEnt(11, '#C96F2C', 2.3))}</div>`,
    v.hasBio ? `<div class="sa-bio"><v>${v.bio}</v></div>` : '',
    v.showProof
      ? `<div class="sa-proof"><span data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="sa-stars" data-role="chip-avis"> · ${iconStarEnt(11, '#E8A020')}${avisChip(v)}</span>`
            : ''
        }</div>`
      : '',
    v.nouvelle
      ? `<div class="sa-nouv-wrap"><span class="sa-nouv" data-role="chip-nouvelle">${iconStarEnt(15, '#F4B942')}<v>${t('vit.nouvelle_vendeuse')}</v></span></div>`
      : '',
    '</div>',
    '<div class="sa-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(17, '#F4B942', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(16, '#F4B942', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(16, '#F4B942', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    '</div>',
    controls(v, 'sa', 'right', '12px', '64px', '#3A2413'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 8 · SAFRAN (série 2) ══════════════════════
     Relevé — page #FFF6E4 (radials #FBE3B5, #FBE9C6) · safran #E8A020
     (clair #F4B942, sombre #DD8E12, texte #C77E10) · cacao #3A2413 ·
     terracotta #C96F2C · textes #6B5238 / #7A5B3B / #A2814F · séparateur
     #F3E2C2 · blanc. */
  .vt-sa {
    --sa-page: #FFF6E4; --sa-safran: #E8A020; --sa-clair: #F4B942;
    --sa-sombre: #DD8E12; --sa-txt-safran: #C77E10; --sa-cacao: #3A2413;
    --sa-terracotta: #C96F2C;
    --sa-t1: #6B5238; --sa-t2: #7A5B3B; --sa-t3: #A2814F; --sa-sep: #F3E2C2;
    background: var(--sa-page);
  }
  /* padding-top 74 = the relevé's 16 + the shell's 60 status pad */
  .vt-sa .sa-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 16px 16px;
    background-color: var(--sa-page);
    background-image:
      radial-gradient(90% 70% at -10% 20%, #FBE3B5 0%, rgba(251,227,181,0) 60%),
      radial-gradient(50% 40% at 105% 90%, #FBE9C6 0%, rgba(251,233,198,0) 60%);
  }
  /* THE SUNBURST — anchored to the card's real corner, so it keeps the
     relevé's raw −120 rather than the +58 the text-aligned pieces take */
  .vt-sa .sa-eventail {
    position: absolute; left: -120px; top: -120px; width: 300px; height: 300px; border-radius: 50%;
    background: repeating-conic-gradient(from -20deg at 50% 50%, rgba(232,160,32,.14) 0 9deg, transparent 9deg 18deg);
  }
  /* the seed grid — relevé top 158, + 58 */
  .vt-sa .sa-graines {
    position: absolute; right: 18px; top: 216px; width: 60px; height: 44px;
    background-image: radial-gradient(circle, rgba(201,111,44,.45) 1.3px, transparent 1.5px);
    background-size: 10px 10px;
  }
  /* THE RISING SUN: 190 at left −58 (132 visible), page ring then safran ring.
     Relevé top 44, + 58. */
  .vt-sa .sa-cercle {
    position: absolute; left: -58px; top: 102px; width: 190px; height: 190px;
    border-radius: 50%; overflow: hidden;
    box-shadow: 0 0 0 3px var(--sa-page), 0 0 0 5px var(--sa-safran), 0 18px 40px -18px rgba(160,105,20,.5);
  }
  .vt-sa .sa-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--sa-clair);
    background-image: radial-gradient(circle, rgba(58,36,19,.28) 1.6px, transparent 1.8px);
    background-size: 13px 13px;
  }
  /* the monogram shifts +44 toward the part of the circle that is on screen */
  .vt-sa .sa-mono {
    margin-left: 44px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 64px; line-height: 1; color: rgba(58,36,19,.45);
  }
  /* her portrait in the big circle when she has no cover: the relevé's own
     bias, so the subject still flees the cut edge */
  .vt-sa .sa-cercle .vt-avatar-img { object-position: 58% 30%; }
  /* the separate solar ring — relevé top 30, + 58 */
  .vt-sa .sa-solaire {
    position: absolute; left: -72px; top: 88px; width: 218px; height: 218px;
    border-radius: 50%; border: 1.5px dashed rgba(232,160,32,.6);
  }
  .vt-sa .sa-col { position: relative; margin-left: 132px; min-height: 224px; padding-top: 2px; }
  .vt-sa .sa-av { position: relative; width: 44px; height: 44px; border-radius: 50%; box-shadow: 0 0 0 2px var(--sa-safran); background: var(--sa-cacao); }
  .vt-sa .sa-av .vt-avatar-img { border-radius: 50%; }
  .vt-sa .sa-av-mono {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 21px; color: var(--sa-clair);
  }
  .vt-sa .sa-av-badge {
    position: absolute; right: -3px; bottom: -2px; width: 17px; height: 17px; border-radius: 50%;
    background: var(--sa-safran); border: 2px solid var(--sa-page);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-sa .sa-name {
    margin-top: 10px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(22px, 7.8cqw, 26px); line-height: 1.14; letter-spacing: -.02em;
    color: var(--sa-cacao); overflow-wrap: break-word;
  }
  /* « colonnes fendues : nom > 14 caractères → 20 px fixe » — the split-column
     rule, because the text column stops 132px short of the card's left edge */
  .vt-sa .sa-name.vt-ent-long { font-size: 20px; }
  .vt-sa .sa-name .vt-ent-acc { color: var(--sa-cacao); }
  /* welded to the last segment, so it never wraps onto a line of its own */
  .vt-sa .sa-seal {
    position: relative; display: inline-flex; width: 18px; height: 18px;
    vertical-align: -2px; margin-left: 6px;
  }
  .vt-sa .sa-seal-d {
    position: absolute; inset: 0; border-radius: 50%;
    background: linear-gradient(150deg, var(--sa-clair), var(--sa-sombre));
    display: flex; align-items: center; justify-content: center;
  }
  .vt-sa .sa-seal-f { position: absolute; inset: -2.5px; border-radius: 50%; border: 1.5px dashed rgba(232,160,32,.7); }
  .vt-sa .sa-bienv { margin-top: 3px; font-size: 13px; font-weight: 700; color: var(--sa-txt-safran); }
  .vt-sa .sa-zone { margin-top: 5px; font-size: 11px; font-weight: 500; line-height: 1.4; color: var(--sa-t2); }
  .vt-sa .sa-zone svg { vertical-align: -1.5px; margin-right: 3px; }
  .vt-sa .sa-bio { margin-top: 9px; font-size: 12px; line-height: 1.5; color: var(--sa-t1); }
  .vt-sa .sa-proof { margin-top: 9px; font-size: 11.5px; line-height: 1.45; color: var(--sa-t1); }
  .vt-sa .sa-proof b { font-weight: 700; color: var(--sa-cacao); }
  .vt-sa .sa-stars { white-space: nowrap; }
  .vt-sa .sa-stars svg { vertical-align: -1.5px; margin-right: 3px; }
  /* « alignée droite dans la colonne » */
  .vt-sa .sa-nouv-wrap { margin-top: 12px; display: flex; justify-content: flex-end; }
  .vt-sa .sa-nouv {
    display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 15px;
    border-radius: 99px; background: var(--sa-cacao);
    box-shadow: 0 10px 24px -10px rgba(58,36,19,.6);
    font-size: 13px; font-weight: 700; color: var(--sa-page); white-space: nowrap;
  }
  .vt-sa .sa-nouv svg { flex: none; }
  /* the white card, warm shadow, cacao coin chips — the row is CENTRED here
     (icon above its words), unlike Indigo's and Couture's side-by-side cells */
  .vt-sa .sa-trust {
    position: relative; margin-top: 14px; padding: 12px 2px; border-radius: 16px; background: #FFFFFF;
    box-shadow: 0 10px 26px -16px rgba(160,105,20,.4);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-sa .sa-cell { padding: 0 7px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-sa .sa-cell + .sa-cell { border-left: 1px solid var(--sa-sep); }
  .vt-sa .sa-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--sa-cacao);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-sa .sa-cell-l { font-size: 10px; font-weight: 700; line-height: 1.28; color: var(--sa-cacao); }
  .vt-sa .sa-cell-s { font-size: 8.5px; line-height: 1.25; color: var(--sa-t3); }
  /* relevé: boutons blancs, top 12 (+60 status pad), retour right 12 */
  .vt-sa .sa-btn { background: #FFFFFF; box-shadow: 0 4px 12px -3px rgba(160,105,20,.35); }
  .vt-sa .vt-ent-btn { top: 72px; }
  .vt-sa .vt-ent-back { right: 12px; }

  @container (max-width: 339px) {
    .vt-sa .sa-hero { padding: 74px 12px 12px; }
    /* the circle bites deeper so the text column keeps its room at 320 */
    .vt-sa .sa-cercle { left: -66px; width: 178px; height: 178px; }
    .vt-sa .sa-solaire { left: -78px; width: 202px; height: 202px; }
    .vt-sa .sa-col { margin-left: 118px; }
    .vt-sa .sa-name { font-size: clamp(20px, 7.8cqw, 24px); }
    .vt-sa .sa-name.vt-ent-long { font-size: 19px; }
    .vt-sa .sa-mono { font-size: 56px; margin-left: 40px; }
    .vt-sa .sa-trust { padding: 11px 1px; }
    .vt-sa .sa-cell { padding: 0 5px; gap: 5px; }
    .vt-sa .sa-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
