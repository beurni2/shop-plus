import { t } from '../../i18n';
import { groupFr } from '../../cliente/money';
import { iconCheckEnt, iconLockEnt, iconPinEnt, iconShieldEnt, iconStarEnt, iconTagEnt } from '../icons';
import {
  avatarImg,
  controls,
  coverImg,
  etat,
  zoneLine,
  type Vals,
} from '../entetes';
import type { EnteteUnit } from './registry';

/**
 * ENTETES-I · 3 · CHALEUREUX — one of the ORIGINAL five (série 1).
 *
 * MOVED, NOT REWRITTEN. Every byte of the drawing and the sheet is the one
 * ENTETES-A/D shipped; only its address changed. These five were compiled into
 * `entetes.ts` and reached every cliente whether or not her seller chose one.
 *
 * Its ENTETES-D full-bleed OVERRIDES are appended at the foot of this sheet,
 * where they keep the cascade position they had: after this style's own rules,
 * which is the whole mechanism by which they override them.
 */

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="ch-cell"><span class="ch-cell-i">${icon}</span><span class="ch-cell-l">${label}</span><span class="ch-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-ch" data-role="vitrine-hero">',
    '<div class="ch-panel">',
    '<span class="ch-pet1"></span><span class="ch-pet2"></span><span class="ch-feuille"></span>',
    // Le galet — 150×198 à top 14 right 12, rayons organiques.
    `<div class="ch-galet" data-role="vitrine-cover" data-etat="${etat(v)}">`,
    v.hasCover
      ? coverImg(v, '50% 24%')
      : `<div class="ch-galet-motif"><span class="ch-galet-mono">${v.mono}</span></div>`,
    '</div>',
    '<div class="ch-col" data-role="vitrine-identity">',
    '<div class="ch-av">',
    v.hasAvatar ? `<span class="ch-av-photo">${avatarImg(v)}</span>` : `<span class="ch-av-mono">${v.mono}</span>`,
    `<span class="ch-av-badge">${iconCheckEnt(9, '#FFFFFF', 3.6)}</span>`,
    '</div>',
    `<div class="ch-name${v.longName ? ' vt-ent-long' : ''}"><v>${v.name}</v><span class="ch-seal"><span class="ch-seal-d">${iconCheckEnt(10, '#FFFFFF', 3.4)}</span><span class="ch-seal-r"></span></span></div>`,
    v.hasTag ? `<div class="ch-tag"><v>${v.tagline}</v></div>` : '',
    `<div class="ch-zone">${zoneLine(v, iconPinEnt(11, '#D95238', 2.3))}</div>`,
    v.hasBio ? `<div class="ch-bio"><v>${v.bio}</v></div>` : '',
    v.showProof || v.showStars
      ? [
          '<div class="ch-proof">',
          v.showProof
            ? `<span data-role="reputation"><b><v>${groupFr(v.delivN)}</v></b> ${t('vit.ventes_livrees')}</span>`
            : '',
          v.showStars
            ? `<span class="ch-stars" data-role="chip-avis">&nbsp;·&nbsp;${iconStarEnt(11, '#E9A83C')} <v>${v.rating}</v> · <v>${v.reviewCount}</v> ${t('vit.avis_verifies')}</span>`
            : '',
          '</div>',
        ].join('')
      : '',
    '</div>',
    v.nouvelle
      ? `<div class="ch-nouv-wrap"><span class="ch-nouv" data-role="chip-nouvelle">${iconStarEnt(15, '#E9A83C')}<span>${t('vit.nouvelle_vendeuse')}</span></span></div>`
      : '',
    v.showProof ? '<div class="ch-gap"></div>' : '',
    '<div class="ch-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(17, '#D95238', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(16, '#D95238', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(16, '#D95238', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    // §2.5 — le « ⋯ » du visuel EST le retour ; partager glisse d'un cran.
    controls(v, 'ch', 'right', '20px', '72px', '#33221C'),
    '</div>',
    '</div>',
  ].join('');
}

const css = `
/* ══════════════════════ 3 · CHALEUREUX ══════════════════════ */
  .vt-ch {
    --ch-page: #FDEEE7; --ch-brique: #B8452F; --ch-corail: #D95238; --ch-corail-pale: #FBE4DC;
    --ch-encre: #33221C; --ch-texte: #6B564D; --ch-sourd: #7A5C53; --ch-sourd-clair: #97837A;
    --ch-verifie: #1E9E62; --ch-etoile: #E9A83C; --ch-sep: #F5E3DC;
    background: var(--ch-page);
  }
  .vt-ch .ch-panel {
    position: relative; background: var(--ch-page);
    background-image:
      radial-gradient(70% 55% at 96% 4%, #F9D8CA 0%, rgba(249,216,202,0) 60%),
      radial-gradient(60% 45% at 2% 100%, #FBE2D6 0%, rgba(251,226,214,0) 58%);
    padding: 16px;
  }
  .vt-ch .ch-pet1 { position: absolute; left: -34px; top: 190px; width: 130px; height: 130px; border-radius: 62% 38% 55% 45% / 48% 62% 38% 52%; background: #F6C9B8; opacity: .55; }
  .vt-ch .ch-pet2 { position: absolute; right: -16px; bottom: 120px; width: 96px; height: 96px; border-radius: 45% 55% 40% 60% / 55% 45% 60% 40%; background: #F3BCA9; opacity: .5; }
  .vt-ch .ch-feuille {
    position: absolute; right: 34px; top: 236px; width: 56px; height: 74px; opacity: .6;
    background:
      radial-gradient(ellipse 50% 44% at 50% 30%, #F3BCA9 0%, rgba(243,188,169,0) 70%),
      radial-gradient(ellipse 44% 38% at 50% 72%, #F3BCA9 0%, rgba(243,188,169,0) 70%);
  }
  .vt-ch .ch-galet {
    position: absolute; top: 14px; right: 12px; width: 150px; height: 198px;
    border-radius: 76px 58px 72px 62px / 64px 76px 58px 72px; overflow: hidden;
    box-shadow: 0 16px 34px -14px rgba(150,70,45,.38);
  }
  .vt-ch .ch-galet-motif {
    position: absolute; inset: 0; background-color: #F8D3C6;
    background-image:
      repeating-linear-gradient(90deg, rgba(220,92,66,.35) 0 3px, transparent 3px 12px),
      repeating-linear-gradient(0deg, rgba(184,69,47,.14) 0 2px, transparent 2px 10px);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ch .ch-galet-mono { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 64px; color: rgba(184,69,47,.4); }
  .vt-ch .ch-col { position: relative; width: calc(100% - 160px); }
  .vt-ch .ch-av { position: relative; width: 46px; height: 46px; }
  .vt-ch .ch-av-photo { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; background: linear-gradient(160deg,#9A9084,#574E43); box-shadow: 0 0 0 2px #FFFFFF; }
  .vt-ch .ch-av-mono {
    position: absolute; inset: 0; border-radius: 50%; background: var(--ch-brique); box-shadow: 0 0 0 2px #FFFFFF;
    display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 23px; color: #FFF6F2;
  }
  .vt-ch .ch-av-badge {
    position: absolute; right: -3px; bottom: -1px; width: 17px; height: 17px; border-radius: 50%;
    background: var(--ch-brique); border: 2px solid var(--ch-page);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ch .ch-name {
    margin-top: 10px; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800;
    font-size: clamp(23px, 8cqw, 28px); line-height: 1.12; letter-spacing: -.025em;
    color: var(--ch-encre); overflow-wrap: break-word;
  }
  .vt-ch .ch-name.vt-ent-long { font-size: 21px; }
  .vt-ch .ch-seal { position: relative; display: inline-flex; width: 19px; height: 19px; vertical-align: -2px; margin-left: 6px; }
  .vt-ch .ch-seal-d { position: absolute; inset: 0; border-radius: 50%; background: var(--ch-verifie); display: flex; align-items: center; justify-content: center; }
  .vt-ch .ch-seal-r { position: absolute; inset: -2.5px; border-radius: 50%; border: 1.5px dashed rgba(30,158,98,.55); }
  .vt-ch .ch-tag { margin-top: 3px; font-size: 13.5px; font-weight: 700; color: var(--ch-corail); }
  .vt-ch .ch-zone { margin-top: 5px; font-size: 11px; font-weight: 500; line-height: 1.4; color: var(--ch-sourd); }
  .vt-ch .ch-zone svg { vertical-align: -1.5px; margin-right: 3px; }
  .vt-ch .ch-bio { text-wrap: pretty;  margin-top: 9px; font-size: 12px; line-height: 1.5; color: var(--ch-texte); }
  .vt-ch .ch-proof { margin-top: 10px; font-size: 11.5px; color: var(--ch-texte); line-height: 1.45; }
  .vt-ch .ch-proof b { font-weight: 700; color: var(--ch-encre); }
  .vt-ch .ch-stars { white-space: nowrap; }
  .vt-ch .ch-stars svg { vertical-align: -1.5px; }
  .vt-ch .ch-nouv-wrap { position: relative; margin-top: 12px; display: flex; justify-content: flex-end; }
  .vt-ch .ch-nouv {
    display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 15px; border-radius: 99px;
    background: #FFFFFF; box-shadow: 0 10px 24px -10px rgba(150,70,45,.45); white-space: nowrap;
  }
  .vt-ch .ch-nouv svg { flex: none; }
  .vt-ch .ch-nouv span { font-size: 13px; font-weight: 700; color: var(--ch-encre); }
  .vt-ch .ch-gap { height: 12px; }
  .vt-ch .ch-trust {
    position: relative; margin-top: 8px; border-radius: 16px; background: #FFFFFF;
    box-shadow: 0 8px 22px -14px rgba(150,70,45,.4);
    padding: 12px 2px; display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-ch .ch-cell { padding: 0 7px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-ch .ch-cell + .ch-cell { border-left: 1px solid var(--ch-sep); }
  .vt-ch .ch-cell-i { width: 34px; height: 34px; border-radius: 11px; background: var(--ch-corail-pale); display: flex; align-items: center; justify-content: center; }
  .vt-ch .ch-cell-l { font-size: 10px; font-weight: 700; line-height: 1.28; color: var(--ch-encre); }
  .vt-ch .ch-cell-s { font-size: 8.5px; line-height: 1.25; color: var(--ch-sourd-clair); }
  .vt-ch .ch-btn { background: #FFFFFF; box-shadow: 0 4px 12px -3px rgba(150,70,45,.35); }
  .vt-ch .vt-ent-btn { top: 22px; }
  .vt-ch .vt-ent-back { right: 20px; }

  /* ═══════════════ ENTETES-D · full-bleed (founder order) ═══════════════
     This style FILLS THE SCREEN like the classique hero: its top surface
     rides up under the unit's 60px status padding and pads itself back
     down, so its background paints to the very top edge with no seam.
     THESE ARE OVERRIDES and their position is load-bearing — they sit
     AFTER this style's own rules, which is how they win by cascade order.
     They lived in one shared block in the compiled sheet; it was split by
     root, and each root's share kept its relative position. */
  .vt-ch .ch-panel { margin-top: -60px; padding-top: 76px; }   /* 16 + 60 */
  .vt-ch .vt-ent-btn { top: 82px; }
`;

export const unit: EnteteUnit = { render, css };
