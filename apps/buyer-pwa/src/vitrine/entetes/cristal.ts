import { t } from '../../i18n';
import { groupFr } from '../../cliente/money';
import { iconCheckEnt, iconLockEnt, iconPinSolid, iconShieldEnt, iconStarEnt, iconTagEnt } from '../icons';
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
 * ENTETES-I · 4 · CRISTAL — one of the ORIGINAL five (série 1).
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
    `<div class="cr-cell"><span class="cr-cell-i">${icon}</span><span class="cr-cell-l">${label}</span><span class="cr-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-cr" data-role="vitrine-hero">',
    '<div class="cr-panel">',
    '<div class="glz cr-card">',
    '<div class="cr-top" data-role="vitrine-identity">',
    '<div class="cr-av">',
    v.hasAvatar ? `<span class="cr-av-photo">${avatarImg(v)}</span>` : `<span class="cr-av-mono">${v.mono}</span>`,
    `<span class="cr-av-badge">${iconCheckEnt(10, '#FFFFFF', 3.6)}</span>`,
    '</div>',
    '<div class="cr-id">',
    `<div class="cr-namerow"><span class="cr-name"><v>${v.name}</v></span><span class="cr-seal"><span class="cr-seal-d">${iconCheckEnt(11, '#FFFFFF', 3.4)}</span><span class="cr-seal-r"></span></span></div>`,
    v.hasTag ? `<div class="cr-tag"><v>${v.tagline}</v></div>` : '',
    `<div class="cr-zone">${zoneLine(v, iconPinSolid(12, '#1E9E62', '#F4F8F3'))}</div>`,
    '</div>',
    '</div>',
    v.hasBio ? `<div class="cr-bio"><v>${v.bio}</v></div>` : '',
    v.showProof || v.showStars
      ? [
          '<div class="cr-proof">',
          v.showProof
            ? (() => {
                // Contract split: <b>{N} ventes</b> / « livrées par Séra », both
                // nowrap — derived from the one catalog string (first word joins
                // the bold), so no second string is authored.
                const [premier = '', ...reste] = t('vit.ventes_livrees').split(' ');
                return `<span class="glz cr-pave" data-role="reputation"><b class="cr-pave-l1"><v>${groupFr(v.delivN)}</v> ${premier}</b> <span class="cr-pave-l2">${reste.join(' ')}</span></span>`;
              })()
            : '',
          v.showStars
            ? `<span class="cr-stars" data-role="chip-avis">${iconStarEnt(12, '#1E9E62')}<span><v>${v.rating}</v> · <v>${v.reviewCount}</v> ${t('vit.avis_verifies')}</span></span>`
            : '',
          '</div>',
        ].join('')
      : '',
    `<div class="cr-frame" data-role="vitrine-cover" data-etat="${etat(v)}">`,
    v.hasCover
      ? coverImg(v, '50% 22%')
      : `<div class="cr-frame-motif"><span class="cr-frame-mono">${v.mono}</span></div>`,
    v.nouvelle
      ? `<span class="cr-nouv-wrap"><span class="glz cr-nouv" data-role="chip-nouvelle">${iconStarEnt(15, '#1D7A4F')}<span>${t('vit.nouvelle_vendeuse')}</span></span></span>`
      : '',
    controls(v, 'cr', 'right', '10px', '62px', '#14402F'),
    '</div>',
    '</div>',
    '<div class="glz cr-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(18, '#177A4C', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(17, '#177A4C', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(17, '#177A4C', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    '</div>',
    '</div>',
  ].join('');
}

const css = `
/* ══════════════════════ 4 · CRISTAL ══════════════════════ */
  .vt-cr {
    --cr-vert: #14402F; --cr-titre: #17352A; --cr-vif: #22B573; --cr-vif-sourd: #1E9E62;
    --cr-icone: #177A4C; --cr-laiton: #A98B54; --cr-mono: #D8B778;
    --cr-texte: #4C5F55; --cr-texte-doux: #5C6E63; --cr-sourd: #7C8D84;
    background: #EDF2ED;
  }
  /* §6 — la SEULE classe du contrat, exigée par le @supports : fallback opaque
     fini d'abord, le flou seulement là où le navigateur le porte. */
  .vt-cr .glz { background: rgba(255,255,255,.66); }
  @supports ((backdrop-filter: blur(16px)) or (-webkit-backdrop-filter: blur(16px))) {
    .vt-cr .glz { -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); background: rgba(255,255,255,.44); }
  }
  .vt-cr .cr-panel {
    position: relative; background: #EDF2ED;
    background-image:
      radial-gradient(46% 34% at -4% 10%, #BED8BE 0%, rgba(190,216,190,0) 70%),
      radial-gradient(40% 30% at 104% 88%, #CBE0CB 0%, rgba(203,224,203,0) 70%),
      linear-gradient(170deg, #F4F8F3, #E7EEE7);
    padding: 14px 12px;
  }
  .vt-cr .cr-card { position: relative; border-radius: 24px; box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.85), 0 18px 40px -22px rgba(20,64,47,.4); padding: 14px; }
  .vt-cr .cr-top { display: flex; align-items: flex-start; gap: 12px; }
  .vt-cr .cr-av { position: relative; width: 56px; height: 56px; flex: none; }
  .vt-cr .cr-av-photo { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; background: linear-gradient(160deg,#9A9084,#574E43); box-shadow: 0 0 0 3px rgba(255,255,255,.92), 0 6px 14px -6px rgba(20,64,47,.5); }
  .vt-cr .cr-av-mono {
    position: absolute; inset: 0; border-radius: 50%;
    background: radial-gradient(120% 120% at 32% 22%, #1C4A37 0%, #0F3527 76%);
    box-shadow: 0 0 0 3px rgba(255,255,255,.92), 0 6px 14px -6px rgba(20,64,47,.5);
    display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 27px; color: var(--cr-mono);
  }
  .vt-cr .cr-av-badge {
    position: absolute; right: -3px; bottom: -2px; width: 20px; height: 20px; border-radius: 50%;
    background: var(--cr-vif); border: 2.5px solid #F4F8F3;
    display: flex; align-items: center; justify-content: center;
  }
  .vt-cr .cr-id { flex: 1; min-width: 0; }
  .vt-cr .cr-namerow { display: flex; align-items: flex-start; gap: 7px; }
  .vt-cr .cr-name {
    font-weight: 700; font-size: clamp(23px, 8cqw, 28px); line-height: 1.06; letter-spacing: -.02em;
    color: var(--cr-titre); flex: 1 1 auto; min-width: 0; overflow-wrap: break-word;
  }
  .vt-cr .cr-seal { position: relative; flex: none; margin-top: 5px; width: 20px; height: 20px; }
  .vt-cr .cr-seal-d { position: absolute; inset: 0; border-radius: 50%; background: var(--cr-vif); display: flex; align-items: center; justify-content: center; }
  .vt-cr .cr-seal-r { position: absolute; inset: -2.5px; border-radius: 50%; border: 1.5px dashed rgba(34,181,115,.55); }
  .vt-cr .cr-tag { margin-top: 3px; font-size: 14px; font-weight: 600; color: var(--cr-laiton); }
  .vt-cr .cr-zone { margin-top: 5px; font-size: 11.5px; font-weight: 500; line-height: 1.4; color: var(--cr-texte); }
  .vt-cr .cr-zone svg { vertical-align: -2px; margin-right: 4px; }
  .vt-cr .cr-bio { text-wrap: pretty;  margin-top: 11px; font-size: 12.5px; line-height: 1.55; color: var(--cr-texte-doux); }
  .vt-cr .cr-proof { margin-top: 11px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .vt-cr .cr-pave-l1, .vt-cr .cr-pave-l2 { white-space: nowrap; display: block; }
  .vt-cr .cr-pave { display: inline-flex; flex-direction: column; padding: 7px 14px; border-radius: 14px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.9); }
  .vt-cr .cr-pave b { font-size: 14px; font-weight: 700; color: var(--cr-vert); line-height: 1.15; }
  .vt-cr .cr-pave span { font-size: 10px; color: var(--cr-sourd); line-height: 1.2; }
  .vt-cr .cr-stars { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .vt-cr .cr-stars span { font-size: 11.5px; font-weight: 600; color: var(--cr-texte); }
  .vt-cr .cr-frame {
    position: relative; margin-top: 12px; height: 196px; border-radius: 18px; overflow: hidden;
    box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.9), 0 0 24px rgba(80,200,120,.38);
  }
  .vt-cr .cr-frame-motif {
    position: absolute; inset: 0; background-color: #DCEBDF;
    background-image:
      repeating-linear-gradient(90deg, rgba(20,64,47,.14) 0 3px, transparent 3px 13px),
      repeating-linear-gradient(0deg, rgba(34,160,90,.12) 0 2px, transparent 2px 11px);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-cr .cr-frame-mono { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 70px; color: rgba(20,64,47,.22); }
  .vt-cr .cr-nouv-wrap { position: absolute; right: 10px; bottom: 10px; }
  .vt-cr .cr-nouv {
    display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 15px; border-radius: 99px;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.9), 0 8px 20px -10px rgba(20,64,47,.5); white-space: nowrap;
  }
  .vt-cr .cr-nouv svg { flex: none; }
  .vt-cr .cr-nouv span { font-size: 13px; font-weight: 700; color: var(--cr-vert); }
  .vt-cr .cr-trust {
    position: relative; margin-top: 10px; border-radius: 20px;
    box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.85), 0 12px 26px -20px rgba(20,64,47,.45);
    padding: 12px 2px; display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-cr .cr-cell { padding: 0 7px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-cr .cr-cell + .cr-cell { border-left: 1px solid rgba(20,64,47,.1); }
  .vt-cr .cr-cell-i {
    width: 38px; height: 38px; border-radius: 50%; background: rgba(255,255,255,.88);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.9), 0 4px 10px -6px rgba(20,64,47,.4);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-cr .cr-cell-l { font-size: 10px; font-weight: 700; line-height: 1.28; color: var(--cr-vert); }
  .vt-cr .cr-cell-s { font-size: 8.5px; line-height: 1.25; color: var(--cr-sourd); }
  .vt-cr .cr-btn { background: rgba(255,255,255,.88); box-shadow: inset 0 0 0 1px rgba(255,255,255,.9), 0 6px 16px -8px rgba(20,64,47,.45); }
  .vt-cr .vt-ent-btn { top: 10px; }
  .vt-cr .vt-ent-back { right: 10px; }

  /* ═══════════════ ENTETES-D · full-bleed (founder order) ═══════════════
     This style FILLS THE SCREEN like the classique hero: its top surface
     rides up under the unit's 60px status padding and pads itself back
     down, so its background paints to the very top edge with no seam.
     THESE ARE OVERRIDES and their position is load-bearing — they sit
     AFTER this style's own rules, which is how they win by cascade order.
     They lived in one shared block in the compiled sheet; it was split by
     root, and each root's share kept its relative position. */
  .vt-cr .cr-panel { margin-top: -60px; padding-top: 74px; }   /* 14 + 60 */
`;

export const unit: EnteteUnit = { render, css };
