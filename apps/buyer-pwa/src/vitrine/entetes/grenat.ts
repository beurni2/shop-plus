import { t } from '../../i18n';
import { iconCheckEnt, iconLockEnt, iconPinSolid, iconShieldEnt, iconStarEnt, iconTagEnt } from '../icons';
import {
  avisChip,
  controls,
  etatPhoto,
  framePhoto,
  hasPhoto,
  ventesLine,
  zoneLine,
  weldSeal,
  type Vals,
} from '../entetes';
import type { EnteteUnit } from './registry';

/**
 * ENTETES-H · SÉRIE 2 — 9 · GRENAT — « camée ovale, bordeaux sur blush ».
 *
 * SOURCE OF TRUTH: the id="grenat" block of « En-tetes Boutique - Serie 2 »
 * and its « Relevé — Grenat ». Origine: création originale série 2.
 *
 * A FAIRE-PART — an invitation card. Everything is centred inside a hairline
 * frame (« filet intérieur, esprit faire-part »), and the photograph is an
 * OVAL cameo: 136×176 at border-radius 50%, triple-ringed bordeaux / page /
 * bordeaux, with her portrait overlapping its lower edge on a page-coloured
 * halo. Georgia throughout, because the whole thing is meant to read as
 * something printed and handed to you.
 *
 * THE ONE DARK TRUST CARD IN THE SERIES, and the relevé is explicit that this
 * is deliberate: « seule carte sombre sur page claire de la série ». Indigo
 * puts a light row on its own ground; Grenat inverts it, and the inversion is
 * what anchors the bottom of a very pale composition.
 *
 * FULL WIDTH, so NO fixed long-name tier — « Pleine largeur (Indigo, Couture,
 * Grenat) : pas de règle fixe ». A long name wraps; it never shrinks.
 *
 * THE FRAME STARTS BELOW THE STATUS PAD. The relevé insets it 8px on all four
 * sides, but this header also owns the shell's 60px status bleed, and a
 * hairline drawn up there would sit behind the phone's own status bar. So the
 * top inset is 68 (60 + 8) and the other three stay at 8 — the frame goes
 * around what she can actually see.
 */

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="gr-cell"><span class="gr-cell-i">${icon}</span><span class="gr-cell-l">${label}</span><span class="gr-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-gr" data-role="vitrine-hero">',
    '<div class="gr-hero">',
    '<span class="gr-filet" aria-hidden="true"></span>',
    // THE CAMEO — an oval, triple-ringed, her cover at the relevé's crop
    `<div class="gr-camee" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 22%')
      : `<div class="gr-motif"><span class="gr-mono">${v.mono}</span></div>`,
    '</div>',
    // her portrait rides the cameo's lower edge, on a page-coloured halo
    `<div class="gr-av" data-etat="${v.hasAvatar ? 'live' : 'none'}">`,
    v.hasAvatar
      ? framePhoto({ ...v, hasCover: false }, '50% 32%')
      : `<span class="gr-av-mono">${v.mono}</span>`,
    `<span class="gr-av-badge" aria-hidden="true">${iconCheckEnt(9, '#F2C8CF', 3.6)}</span>`,
    '</div>',
    '<div class="gr-col" data-role="vitrine-identity">',
    `<div class="gr-name">${weldSeal(v.tail, `<span class="gr-seal" aria-hidden="true"><span class="gr-seal-d">${iconCheckEnt(11, '#FFFFFF', 3.4)}</span><span class="gr-seal-f"></span></span>`)}</div>`,
    v.hasTag ? `<div class="gr-bienv"><v>${v.tagline}</v></div>` : '',
    // the dashed rule with its lozenge — the invitation's divider
    '<div class="gr-rule" aria-hidden="true"><span></span><i></i><span></span></div>',
    `<div class="gr-zone">${zoneLine(v, iconPinSolid(12, '#C25E75', '#FBEFF1'))}</div>`,
    v.hasBio ? `<div class="gr-bio"><v>${v.bio}</v></div>` : '',
    v.showProof
      ? `<div class="gr-proof"><span data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="gr-stars" data-role="chip-avis"> · ${iconStarEnt(11, '#C25E75')}${avisChip(v)}</span>`
            : ''
        }</div>`
      : '',
    v.nouvelle
      ? `<div class="gr-nouv-wrap"><span class="gr-nouv" data-role="chip-nouvelle">${iconStarEnt(15, '#C25E75')}<v>${t('vit.nouvelle_vendeuse')}</v></span></div>`
      : '',
    '</div>',
    '<div class="gr-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(17, '#F2C8CF', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(16, '#F2C8CF', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(16, '#F2C8CF', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    '</div>',
    // « retour gauche 16, partager droite 16 » — both fixed: share does NOT
    // slide here, so near === far, the same shape Couture uses.
    controls(v, 'gr', 'right', '16px', '16px', '#5E1224'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 9 · GRENAT (série 2) ══════════════════════
     Relevé — page #FBEFF1 (radials #F6DCE1, #F3D3DA) · bordeaux #5E1224
     (clair #8A2138, titre #4A0E1E) · rose #C25E75, italique #B04A62 ·
     blush #F2C8CF / #FDF3F5 · textes #6E4A52 / #7A5560. */
  .vt-gr {
    --gr-page: #FBEFF1; --gr-bordeaux: #5E1224; --gr-clair: #8A2138; --gr-titre: #4A0E1E;
    --gr-rose: #C25E75; --gr-ital: #B04A62;
    --gr-blush: #F2C8CF; --gr-blush-clair: #FDF3F5;
    --gr-t1: #6E4A52; --gr-t2: #7A5560;
    background: var(--gr-page);
  }
  /* padding-top 78 = the relevé's 18 + the shell's 60 status pad */
  .vt-gr .gr-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 78px 16px 16px; text-align: center;
    background-color: var(--gr-page);
    background-image:
      radial-gradient(60% 40% at 92% 4%, #F6DCE1 0%, rgba(246,220,225,0) 60%),
      radial-gradient(50% 36% at 4% 98%, #F3D3DA 0%, rgba(243,211,218,0) 60%);
  }
  /* the faire-part hairline — top inset 68 = 60 status pad + the relevé's 8,
     so the frame surrounds the VISIBLE card and not the status bar */
  .vt-gr .gr-filet {
    position: absolute; top: 68px; left: 8px; right: 8px; bottom: 8px;
    border-radius: 20px; border: 1px solid rgba(94,18,36,.22); pointer-events: none;
  }
  /* THE CAMEO: an oval (136×176 at 50%), ringed bordeaux / page / bordeaux */
  .vt-gr .gr-camee {
    position: relative; width: 136px; height: 176px; margin: 6px auto 0;
    border-radius: 50%; overflow: hidden;
    box-shadow: 0 0 0 2px var(--gr-bordeaux), 0 0 0 7px var(--gr-page),
      0 0 0 8.5px rgba(94,18,36,.35), 0 16px 34px -16px rgba(94,18,36,.45);
  }
  .vt-gr .gr-camee .vt-avatar-img { border-radius: 50%; }
  .vt-gr .gr-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--gr-bordeaux);
    background-image: radial-gradient(circle, rgba(227,174,184,.4) 1.4px, transparent 1.6px);
    background-size: 11px 11px;
  }
  .vt-gr .gr-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 62px; line-height: 1; color: rgba(249,231,234,.55); }
  /* her portrait overlaps the cameo's lower edge */
  .vt-gr .gr-av {
    position: relative; z-index: 2; width: 44px; height: 44px; margin: -22px auto 0;
    border-radius: 50%;
    background: radial-gradient(120% 120% at 32% 22%, var(--gr-clair) 0%, var(--gr-bordeaux) 78%);
    box-shadow: 0 0 0 2.5px var(--gr-page), 0 6px 14px -6px rgba(94,18,36,.5);
  }
  .vt-gr .gr-av .vt-avatar-img { border-radius: 50%; }
  .vt-gr .gr-av-mono {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 21px; color: var(--gr-blush);
  }
  .vt-gr .gr-av-badge {
    position: absolute; right: -4px; bottom: -1px; width: 17px; height: 17px; border-radius: 50%;
    background: var(--gr-bordeaux); border: 2px solid var(--gr-page);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-gr .gr-col { position: relative; }
  .vt-gr .gr-name {
    margin-top: 10px;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(26px, 9cqw, 31px); line-height: 1.06; letter-spacing: -.01em;
    color: var(--gr-titre); overflow-wrap: break-word;
  }
  /* « pleine largeur : pas de règle fixe » — a long name wraps, never shrinks */
  .vt-gr .gr-name .vt-ent-acc { color: var(--gr-titre); }
  .vt-gr .gr-seal { position: relative; display: inline-flex; width: 20px; height: 20px; vertical-align: -2px; margin-left: 7px; }
  .vt-gr .gr-seal-d {
    position: absolute; inset: 0; border-radius: 50%;
    background: linear-gradient(150deg, var(--gr-clair), var(--gr-bordeaux));
    display: flex; align-items: center; justify-content: center;
  }
  .vt-gr .gr-seal-f { position: absolute; inset: -2.5px; border-radius: 50%; border: 1.5px dashed rgba(138,33,56,.55); }
  .vt-gr .gr-bienv { margin-top: 4px; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 16px; color: var(--gr-ital); }
  /* the divider: 150px of dashed rule with a lozenge sewn at its centre */
  .vt-gr .gr-rule { margin: 10px auto 0; width: 150px; display: flex; align-items: center; gap: 8px; }
  .vt-gr .gr-rule span { flex: 1; border-top: 1px dashed rgba(94,18,36,.35); }
  .vt-gr .gr-rule i { width: 5px; height: 5px; flex: none; background: var(--gr-bordeaux); transform: rotate(45deg); }
  .vt-gr .gr-zone { margin-top: 9px; font-size: 11.5px; font-weight: 500; line-height: 1.45; color: var(--gr-t2); }
  .vt-gr .gr-zone svg { vertical-align: -2px; margin-right: 4px; }
  .vt-gr .gr-bio { margin: 9px auto 0; max-width: 280px; font-size: 12.5px; line-height: 1.55; color: var(--gr-t1); }
  .vt-gr .gr-proof { margin-top: 10px; font-size: 12px; line-height: 1.45; color: var(--gr-t1); }
  .vt-gr .gr-proof b { font-weight: 700; color: var(--gr-titre); }
  .vt-gr .gr-stars { white-space: nowrap; }
  .vt-gr .gr-stars svg { vertical-align: -1.5px; margin-right: 3px; }
  .vt-gr .gr-nouv-wrap { margin-top: 12px; display: flex; justify-content: center; }
  .vt-gr .gr-nouv {
    display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px;
    border-radius: 99px; background: #FFFFFF; box-shadow: 0 10px 24px -12px rgba(94,18,36,.5);
    font-size: 13px; font-weight: 700; color: var(--gr-bordeaux); white-space: nowrap;
  }
  .vt-gr .gr-nouv svg { flex: none; }
  /* « seule carte sombre sur page claire de la série » — deliberate inversion */
  .vt-gr .gr-trust {
    position: relative; margin-top: 13px; padding: 12px 2px; border-radius: 16px;
    background: var(--gr-bordeaux); box-shadow: 0 16px 34px -18px rgba(94,18,36,.7);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-gr .gr-cell { padding: 0 7px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-gr .gr-cell + .gr-cell { border-left: 1px solid rgba(249,231,234,.16); }
  .vt-gr .gr-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 12px;
    background: rgba(249,231,234,.1); box-shadow: inset 0 0 0 1px rgba(249,231,234,.35);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-gr .gr-cell-l { font-size: 10px; font-weight: 700; line-height: 1.28; color: var(--gr-blush-clair); }
  .vt-gr .gr-cell-s { font-size: 8.5px; line-height: 1.25; color: rgba(242,200,207,.75); }
  /* relevé: boutons blancs top 16 (+60), retour GAUCHE 16, partager DROITE 16 */
  .vt-gr .gr-btn { background: #FFFFFF; box-shadow: 0 4px 12px -3px rgba(94,18,36,.3); }
  .vt-gr .vt-ent-btn { top: 76px; }
  .vt-gr .vt-ent-back { left: 16px; }

  @container (max-width: 339px) {
    .vt-gr .gr-hero { padding: 78px 12px 12px; }
    .vt-gr .gr-camee { width: 122px; height: 158px; }
    .vt-gr .gr-mono { font-size: 55px; }
    .vt-gr .gr-name { font-size: clamp(23px, 9cqw, 27px); }
    .vt-gr .gr-bienv { font-size: 15px; }
    .vt-gr .gr-rule { width: 132px; }
    .vt-gr .gr-trust { padding: 11px 1px; }
    .vt-gr .gr-cell { padding: 0 5px; gap: 5px; }
    .vt-gr .gr-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
