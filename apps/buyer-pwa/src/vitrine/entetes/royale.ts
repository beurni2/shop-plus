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
 * ENTETES-I · 1 · ROYALE — one of the ORIGINAL five (série 1).
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
    `<div class="ry-cell"><span class="ry-cell-i">${icon}</span><span class="ry-cell-l">${label}</span><span class="ry-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-ry" data-role="vitrine-hero">',
    '<div class="ry-panel">',
    '<span class="ry-vol1"></span><span class="ry-vol2"></span><span class="ry-dots"></span>',
    // Le médaillon — 188 à top −22 right −30, il sort du cadre (clipped by the card).
    `<div class="ry-med" data-role="vitrine-cover" data-etat="${etat(v)}">`,
    v.hasCover
      ? coverImg(v, '42% 28%')
      : `<div class="ry-med-motif"><span class="ry-med-mono">${v.mono}</span></div>`,
    '</div>',
    '<div class="ry-col" data-role="vitrine-identity">',
    '<div class="ry-av">',
    v.hasAvatar
      ? `<span class="ry-av-photo">${avatarImg(v)}</span>`
      : `<span class="ry-av-mono">${v.mono}</span>`,
    `<span class="ry-av-badge">${iconCheckEnt(11, '#E9CF8F', 3.2)}</span>`,
    '</div>',
    `<div class="ry-name${v.longName ? ' vt-ent-long' : ''}"><v>${v.name}</v><span class="ry-seal"><span class="ry-seal-d">${iconCheckEnt(14, '#FFFFFF', 3.6)}</span><span class="ry-seal-r"></span></span></div>`,
    v.hasTag ? `<div class="ry-tag"><v>${v.tagline}</v></div>` : '',
    `<div class="ry-zone">${zoneLine(v, iconPinEnt(13, '#D4739C', 2.2))}</div>`,
    '</div>',
    '<div class="ry-filet"><span class="ry-filet-a"></span><span class="ry-filet-d"></span><span class="ry-filet-b"></span></div>',
    v.hasBio ? `<div class="ry-bio"><v>${v.bio}</v></div>` : '',
    v.showProof || v.showStars
      ? [
          '<div class="ry-proof">',
          v.showProof
            ? `<span class="ry-proof-line" data-role="reputation"><b><v>${groupFr(v.delivN)}</v></b> ${t('vit.ventes_livrees')}</span>`
            : '',
          v.showStars
            ? `<span class="ry-stars" data-role="chip-avis">${iconStarEnt(12, '#D4A857')}<span><v>${v.rating}</v> · <v>${v.reviewCount}</v> ${t('vit.avis_verifies')}</span></span>`
            : '',
          '</div>',
        ].join('')
      : '',
    v.nouvelle
      ? `<div class="ry-nouv-wrap"><span class="ry-nouv" data-role="chip-nouvelle"><span class="ry-nouv-r">${iconStarEnt(16, '#E9CF8F')}</span><span class="ry-nouv-t">${t('vit.nouvelle_vendeuse')}</span></span></div>`
      : '',
    '<div class="ry-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(20, '#E9CF8F', 1.9), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(19, '#E9CF8F', 1.9), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(19, '#E9CF8F', 1.9), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    // B1 (verifier, browser-measured): at left the pair covered 58% of her
    // avatar AND the vérifié badge — the one thing this page exists to show.
    // Right side, same offsets, over the medallion's empty margin.
    controls(v, 'ry', 'right', '14px', '66px', '#E9CF8F'),
    '</div>',
    '</div>',
  ].join('');
}

const css = `
/* ══════════════════════ 1 · ROYALE ══════════════════════ */
  .vt-ry {
    --ry-fond: #26082C; --ry-magenta: #A81E62; --ry-prune: #6E1252;
    --ry-p1: #2C0A31; --ry-p2: #3C0D3C; --ry-p3: #54104A; --ry-p4: #671350;
    --ry-or: #D4A857; --ry-or-clair: #E9CF8F;
    --ry-medaille-a: #F0D796; --ry-medaille-b: #C79A45;
    --ry-rose: #E4779F; --ry-epingle: #D4739C;
    --ry-ivoire: #FFFCF6; --ry-ivoire-doux: #F6EBDC;
    --ry-pastille-a: #3E0E3A; --ry-pastille-b: #5E1149;
    background: var(--ry-fond);
  }
  .vt-ry .ry-panel {
    position: relative; background: var(--ry-fond);
    background-image:
      radial-gradient(56% 60% at 88% 6%, var(--ry-magenta) 0%, rgba(168,30,98,0) 62%),
      radial-gradient(50% 56% at 6% 98%, var(--ry-prune) 0%, rgba(110,18,82,0) 66%),
      linear-gradient(152deg, var(--ry-p1) 0%, var(--ry-p2) 46%, var(--ry-p3) 78%, var(--ry-p4) 100%);
    padding: 18px 16px;
  }
  .vt-ry .ry-vol1 { position: absolute; left: -140px; top: -170px; width: 520px; height: 520px; border-radius: 50%; border: 1.5px solid rgba(212,168,87,.14); }
  .vt-ry .ry-vol2 { position: absolute; left: -90px; top: -110px; width: 520px; height: 520px; border-radius: 50%; border: 1px solid rgba(232,120,180,.12); }
  .vt-ry .ry-dots {
    position: absolute; right: 26px; bottom: 170px; width: 92px; height: 66px;
    background-image: radial-gradient(circle, rgba(232,120,180,.5) 1.3px, transparent 1.5px);
    background-size: 11px 11px;
  }
  .vt-ry .ry-med {
    position: absolute; top: -22px; right: -30px; width: 188px; height: 188px;
    border-radius: 50%; overflow: hidden;
    box-shadow: 0 0 0 2px var(--ry-or), 0 0 0 7px rgba(212,168,87,.14), 0 18px 44px -16px rgba(0,0,0,.7);
  }
  .vt-ry .ry-med-motif {
    position: absolute; inset: 0; background-color: var(--ry-pastille-a);
    background-image:
      repeating-linear-gradient(45deg, rgba(212,168,87,.20) 0 2px, transparent 2px 16px),
      repeating-linear-gradient(-45deg, rgba(168,30,98,.30) 0 2px, transparent 2px 16px);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ry .ry-med-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 74px; color: rgba(212,168,87,.4); margin-right: 30px; }
  .vt-ry .ry-col { position: relative; width: calc(100% - 132px); }
  .vt-ry .ry-av { position: relative; width: 54px; height: 54px; }
  .vt-ry .ry-av-photo { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; background: linear-gradient(160deg,#9A9084,#574E43); box-shadow: 0 0 0 1.5px var(--ry-or); }
  .vt-ry .ry-av-mono {
    position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid var(--ry-or);
    display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 27px; color: var(--ry-or-clair);
  }
  .vt-ry .ry-av-badge {
    position: absolute; right: -1px; bottom: -3px; width: 21px; height: 21px; border-radius: 50%;
    background: var(--ry-fond); border: 1.5px solid var(--ry-or);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ry .ry-name {
    margin-top: 13px; font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(28px, 9.6cqw, 33px); line-height: 1.08; letter-spacing: -.012em;
    color: var(--ry-ivoire); overflow-wrap: break-word;
  }
  .vt-ry .ry-name.vt-ent-long { font-size: 25px; }
  .vt-ry .ry-seal { position: relative; display: inline-flex; width: 27px; height: 27px; vertical-align: -4px; margin-left: 8px; }
  .vt-ry .ry-seal-d { position: absolute; inset: 0; border-radius: 50%; background: linear-gradient(150deg, var(--ry-medaille-a), var(--ry-medaille-b)); display: flex; align-items: center; justify-content: center; }
  .vt-ry .ry-seal-r { position: absolute; inset: -3px; border-radius: 50%; border: 1.5px dashed rgba(212,168,87,.75); }
  .vt-ry .ry-tag { margin-top: 6px; font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 19px; color: var(--ry-or-clair); }
  .vt-ry .ry-zone { margin-top: 7px; font-size: 12px; font-weight: 500; line-height: 1.4; color: var(--ry-ivoire-doux); }
  .vt-ry .ry-zone svg { vertical-align: -2px; margin-right: 4px; }
  .vt-ry .ry-filet { position: relative; margin-top: 14px; display: flex; align-items: center; gap: 8px; width: calc(100% - 24px); }
  .vt-ry .ry-filet-a { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(212,168,87,.7), rgba(212,168,87,.3)); }
  .vt-ry .ry-filet-d { width: 8px; height: 8px; flex: none; background: var(--ry-or); transform: rotate(45deg); }
  .vt-ry .ry-filet-b { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(212,168,87,.3), rgba(212,168,87,0)); }
  .vt-ry .ry-bio { text-wrap: pretty;  position: relative; margin-top: 12px; font-size: 13px; line-height: 1.5; color: var(--ry-ivoire-doux); max-width: 236px; }
  .vt-ry .ry-proof { position: relative; margin-top: 13px; display: flex; align-items: center; flex-wrap: wrap; gap: 5px 12px; }
  .vt-ry .ry-proof-line { font-size: 13px; color: var(--ry-ivoire-doux); white-space: nowrap; }
  .vt-ry .ry-proof-line b { font-weight: 700; color: var(--ry-or-clair); font-size: 14.5px; }
  .vt-ry .ry-stars { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .vt-ry .ry-stars span { font-size: 11.5px; font-weight: 600; color: var(--ry-rose); }
  .vt-ry .ry-nouv-wrap { position: relative; margin-top: 14px; display: flex; justify-content: flex-end; }
  .vt-ry .ry-nouv {
    display: inline-flex; align-items: center; gap: 9px; height: 44px; padding: 0 17px 0 6px;
    border-radius: 99px; background: linear-gradient(115deg, var(--ry-pastille-a), var(--ry-pastille-b));
    border: 1.5px solid var(--ry-or); box-shadow: 0 10px 26px -12px rgba(0,0,0,.75); white-space: nowrap;
  }
  .vt-ry .ry-nouv-r {
    width: 32px; height: 32px; flex: none; border-radius: 50%;
    background: rgba(212,168,87,.14); border: 1px solid rgba(212,168,87,.7);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ry .ry-nouv-t { font-size: 14.5px; font-weight: 600; color: var(--ry-ivoire); }
  .vt-ry .ry-trust {
    position: relative; margin-top: 15px; border-radius: 18px;
    border: 1px solid rgba(212,168,87,.55); background: rgba(255,255,255,.045);
    padding: 13px 2px; display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-ry .ry-cell { padding: 0 8px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 7px; }
  .vt-ry .ry-cell + .ry-cell { border-left: 1px solid rgba(212,168,87,.3); }
  .vt-ry .ry-cell-i {
    width: 40px; height: 40px; border-radius: 50%;
    border: 1px solid rgba(212,168,87,.6); background: rgba(212,168,87,.09);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ry .ry-cell-l { font-size: 10.5px; font-weight: 600; line-height: 1.28; color: var(--ry-ivoire); }
  .vt-ry .ry-cell-s { font-size: 9px; line-height: 1.25; color: var(--ry-rose); }
  .vt-ry .ry-btn { background: linear-gradient(115deg, var(--ry-pastille-a), var(--ry-pastille-b)); border: 1px solid rgba(212,168,87,.7); }
  .vt-ry .vt-ent-back { right: 14px; }

  /* ═══════════════ ENTETES-D · full-bleed (founder order) ═══════════════
     This style FILLS THE SCREEN like the classique hero: its top surface
     rides up under the unit's 60px status padding and pads itself back
     down, so its background paints to the very top edge with no seam.
     THESE ARE OVERRIDES and their position is load-bearing — they sit
     AFTER this style's own rules, which is how they win by cascade order.
     They lived in one shared block in the compiled sheet; it was split by
     root, and each root's share kept its relative position. */
  .vt-ry .ry-panel { margin-top: -60px; padding-top: 78px; }   /* 18 + 60 */
  .vt-ry .vt-ent-btn { top: 74px; }
`;

export const unit: EnteteUnit = { render, css };
