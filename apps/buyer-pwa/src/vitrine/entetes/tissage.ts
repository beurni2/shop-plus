import { t } from '../../i18n';
import { groupFr } from '../../cliente/money';
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
 * ENTETES-I · 25 · TISSAGE — the série 4 unit for the canon key `cauris`.
 *
 * MOVED, NOT REWRITTEN. Every byte of the drawing and the sheet is the one
 * ENTETES-F shipped; only its address changed. It used to be compiled into
 * `entetes.ts` and reached every cliente whether or not her seller chose it.
 * Now it is a chunk, like the twenty-five after it.
 *
 * Its 320px rules travelled with it, INCLUDING this root's share of the three
 * grouped trust-cell rules the shared container held — same declarations, one
 * selector instead of five.
 */

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="ti-cell"><span class="ti-cell-i">${icon}<span class="ti-cell-c" aria-hidden="true">${iconCheckEnt(9, '#17351F', 3.4)}</span></span><span class="ti-cell-t"><span class="ti-cell-l">${label}</span><span class="ti-cell-s">${sub}</span></span></div>`;
  const [nA = '', ...nB] = t('vit.nouvelle_vendeuse').split(' ');
  return [
    '<div class="vt-ent vt-ti" data-role="vitrine-hero">',
    '<div class="ti-hero">',
    '<div class="ti-scene">',
    // Relevé « Héros fendu » — liseré kente vertical 32 à gauche (casiers 14).
    '<span class="ti-lisere" aria-hidden="true"></span>',
    `<div class="ti-frame" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '52% 28%')
      : `<div class="ti-motif"><span class="ti-mono">${v.mono}</span></div>`,
    '</div>',
    '<div class="ti-col" data-role="vitrine-identity">',
    '<svg class="ti-couronne" aria-hidden="true" viewBox="0 0 40 24" width="40" height="24"><path d="M5 20l2-10 6 5 7-12 7 12 6-5 2 10z" fill="none" stroke="#D9A441" stroke-width="2" stroke-linejoin="round"/><circle cx="20" cy="4" r="1.8" fill="#D9A441"/></svg>',
    `<div class="ti-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="ti-bienv"><span class="ti-bienv-t">${t('vit.bienvenue')}</span><span class="ti-brosse" aria-hidden="true"></span></div>`,
    // Relevé « Carte info » — carte #0F2717 r16 à filet or : vérifié, zone, preuve.
    '<div class="ti-carte">',
    `<div class="ti-verif">${iconShieldEnt(15, '#D9A441', 2)}<span>${verifieeBare()}</span><span class="ti-coche" aria-hidden="true">${iconCheckEnt(11, '#F1E9D6', 3.2)}</span></div>`,
    `<div class="ti-zone">${iconPinEnt(13, '#D9A441', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? [
          '<div class="ti-proof">',
          `<span class="ti-rond" data-role="reputation-count"><v>${groupFr(v.delivN)}</v></span>`,
          '<span class="ti-proof-t">',
          `<span data-role="reputation">${ventesLine(v)}</span>`,
          v.showStars
            ? `<span class="ti-stars" data-role="chip-avis">${iconStarEnt(10, '#D9A441')}${avisChip(v)}</span>`
            : '',
          '</span>',
          '</div>',
        ].join('')
      : '',
    '</div>',
    v.nouvelle
      ? `<div class="ti-nouv-wrap"><span class="ti-nouv" data-role="chip-nouvelle"><span class="ti-nouv-r" aria-hidden="true"></span><span class="ti-nouv-t"><span class="ti-nouv-a"><v>${nA}</v></span><span class="ti-nouv-b"><v>${nB.join(' ')}</v></span></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '</div>',
    // Relevé — reprise horizontale du tissage h12 sous le héros.
    '<div class="ti-bande" aria-hidden="true"></div>',
    '<div class="ti-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(17, '#D9A441', 1.8), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#D9A441', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#D9A441', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'ti', '#17351F'),
    '</div>',
  ].join('');
}

const css = `
/* ══════════════════════ 25 · TISSAGE ══════════════════════
     Relevé — vert profond #17351F (carte #0F2717) · ivoire #F1E9D6 · or
     #D9A441 (.txg) · ambre #C77B2B · coche #2E7A44 · sous-lignes #2E5B3A.
     Héros fendu : liseré kente vertical 32 à gauche (casiers 14) + reprise
     horizontale h12 sous le héros ; photo pleine colonne droite 46 %. */
  .vt-ti {
    --ti-vert: #17351F; --ti-carte: #0F2717; --ti-badge: #12301B;
    --ti-ivoire: #F1E9D6; --ti-blanc: #F7F5F0;
    --ti-or: #D9A441; --ti-ambre: #C77B2B; --ti-coche: #2E7A44; --ti-sous: #2E5B3A; --ti-liser: #142E14;
    background: var(--ti-vert);
  }
  .vt-ti .ti-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 18px;
    background-color: var(--ti-vert);
    background-image: radial-gradient(54% 40% at 82% 8%, rgba(217,164,65,.09) 0%, transparent 70%);
  }
  .vt-ti .ti-scene { position: relative; min-height: 248px; }
  .vt-ti .ti-lisere {
    position: absolute; left: -14px; top: -74px; bottom: -18px; width: 32px;
    background-color: var(--ti-liser);
    background-image:
      repeating-linear-gradient(45deg, rgba(217,164,65,.55) 0 2px, transparent 2px 9px),
      repeating-linear-gradient(-45deg, rgba(241,233,214,.3) 0 2px, transparent 2px 9px),
      repeating-linear-gradient(180deg, rgba(241,233,214,.16) 0 1px, transparent 1px 14px);
  }
  .vt-ti .ti-frame { position: absolute; top: -74px; right: -14px; bottom: -18px; width: 46%; overflow: hidden; }
  .vt-ti .ti-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--ti-badge);
    background-image:
      repeating-linear-gradient(45deg, rgba(217,164,65,.34) 0 2px, transparent 2px 11px),
      repeating-linear-gradient(-45deg, rgba(217,164,65,.2) 0 2px, transparent 2px 11px);
  }
  .vt-ti .ti-mono { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 52px; color: rgba(217,164,65,.55); }
  .vt-ti .ti-col { position: relative; width: calc(100% - 151px); padding-left: 24px; }
  .vt-ti .ti-couronne { display: block; }
  .vt-ti .ti-name {
    margin-top: 6px; font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.05; letter-spacing: -.012em;
    color: var(--ti-ivoire); overflow-wrap: break-word;
  }
  .vt-ti .ti-name.vt-ent-long { font-size: 24px; }
  .vt-ti .ti-name .vt-ent-acc { color: var(--ti-or); }
  @supports (background-clip: text) or (-webkit-background-clip: text) {
    .vt-ti .ti-name .vt-ent-acc {
      background-image: linear-gradient(96deg, #EFCB78 0%, var(--ti-or) 38%, #B37F24 68%, #E7C069 100%);
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
    }
  }
  .vt-ti .ti-bienv { margin-top: 7px; display: flex; align-items: center; gap: 8px; }
  .vt-ti .ti-bienv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 18px; line-height: 1.2; color: #FFFFFF; }
  .vt-ti .ti-brosse { width: 30px; height: 4px; border-radius: 3px; background: var(--ti-or); transform: rotate(-2deg); }
  .vt-ti .ti-carte { margin-top: 11px; padding: 11px 12px 12px; background: var(--ti-carte); border-radius: 16px; box-shadow: inset 0 0 0 1px rgba(217,164,65,.28); }
  .vt-ti .ti-verif { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: #FFFFFF; }
  .vt-ti .ti-coche { width: 15px; height: 15px; flex: none; border-radius: 50%; background: var(--ti-coche); display: flex; align-items: center; justify-content: center; }
  .vt-ti .ti-zone { margin-top: 5px; display: flex; align-items: flex-start; gap: 7px; font-size: 11px; font-weight: 600; line-height: 1.4; color: var(--ti-ivoire); }
  .vt-ti .ti-zone svg { flex: none; margin-top: 1px; }
  .vt-ti .ti-proof { margin-top: 9px; display: flex; align-items: center; gap: 8px; }
  .vt-ti .ti-rond { min-width: 38px; width: auto; padding: 0 8px; height: 38px; flex: none; border-radius: 99px; border-radius: 50%; border: 1.4px solid var(--ti-or); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; color: var(--ti-or); }
  /* Relevé — la ligne de preuve est en italique doré sur ce visuel. */
  .vt-ti .ti-proof-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 11px; line-height: 1.35; color: var(--ti-or); }
  .vt-ti .ti-stars { display: flex; align-items: center; gap: 3px; margin-top: 1px; font-style: normal; font-family: 'Instrument Sans', system-ui, sans-serif; font-weight: 600; font-size: 10.5px; }
  .vt-ti .ti-nouv-wrap { margin-top: 12px; }
  .vt-ti .ti-nouv {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 88px; height: 88px; border-radius: 50%; background: var(--ti-badge);
    box-shadow: 0 12px 26px -12px rgba(10,30,16,.85);
  }
  .vt-ti .ti-nouv-r { position: absolute; inset: 5px; border-radius: 50%; border: 1.5px dashed rgba(217,164,65,.7); }
  .vt-ti .ti-nouv-t { position: relative; text-align: center; line-height: 1.15; }
  .vt-ti .ti-nouv-a { display: block; font-weight: 800; font-size: 13px; color: #FFFFFF; }
  .vt-ti .ti-nouv-b { display: block; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 13px; color: var(--ti-or); }
  .vt-ti .ti-bande {
    height: 12px; background-color: var(--ti-vert);
    background-image:
      repeating-linear-gradient(45deg, rgba(217,164,65,.55) 0 2px, transparent 2px 9px),
      repeating-linear-gradient(-45deg, rgba(241,233,214,.3) 0 2px, transparent 2px 9px);
  }
  .vt-ti .ti-trust { background: var(--ti-blanc); padding: 12px 10px; display: grid; grid-template-columns: 1.12fr 1fr 1.06fr; }
  .vt-ti .ti-cell { padding: 0 5px; display: flex; align-items: center; gap: 8px; }
  .vt-ti .ti-cell-i { position: relative; width: 38px; height: 38px; flex: none; border-radius: 50%; background: var(--ti-vert); display: flex; align-items: center; justify-content: center; }
  .vt-ti .ti-cell-c { position: absolute; right: -3px; bottom: -3px; width: 15px; height: 15px; border-radius: 50%; background: var(--ti-or); border: 2px solid var(--ti-blanc); display: flex; align-items: center; justify-content: center; }
  .vt-ti .ti-cell-l { display: block; font-size: 9.5px; font-weight: 700; line-height: 1.3; color: #14251A; }
  .vt-ti .ti-cell-s { display: block; font-size: 9.5px; font-weight: 600; line-height: 1.3; color: var(--ti-sous); }
  .vt-ti .ti-btn { background: var(--ti-or); }
  .vt-ti .vt-ent-btn { top: 70px; }
  .vt-ti .vt-ent-back { right: 20px; }


  /* ENTETES-F — the strip stays a strip. Measured: the catalog carries the FULL
     label in one string (« Livraison Séra vérifiée & scellée ») where the
     contract splits it over two short lines, so at the relevé's own 9.5px it
     wrapped to three lines and pushed the strip to 86–100px against the
     contract's ~64. What gives is the VIGNETTE (38 → 32) and the LEADING
     (1.3 → 1.22) — never the type: every relevé says « titres 700/9.5 +
     sous-lignes 600 », and 9px labels on a 320px 1GB Android in the sun is
     failure mode #9, not a rounding decision. */
  .vt-ti .ti-trust { padding: 9px 8px; align-items: center; }
  /* ENTETES-I — this trust-strip block grouped four série 4 roots in one
     declaration. Each style now carries its own; a grouped rule can only
     ship inside ONE chunk, and the other three shops would load without it. */
  .vt-ti .ti-cell-i { width: 32px; height: 32px; }
  .vt-ti .ti-cell-l { font-size: 9.5px; line-height: 1.22; }
  .vt-ti .ti-cell-s { font-size: 9.5px; line-height: 1.22; }
  .vt-ti .ti-cell { gap: 7px; padding: 0 4px; }

  /* 2 — THE MINIMAL BADGE. Each style's pastille is the contract's own shape,
     but stacked AFTER the greeting, the verified line and the zone it pushed
     the column 60–90px past its relevé min-height. The badge keeps its
     identity at a size the column can hold. */
  .vt-ti .ti-nouv { width: 74px; height: 74px; }.vt-ti .ti-nouv-wrap{ margin-top: 9px; }

  /* 3 — COLUMN RHYTHM. The greeting is a line the contract's MINIMAL does not
     carry (« ni accueil ») but this build keeps always — a new seller needs the
     warm word most. The margins absorb it instead of the height. */
  /* Douceur measured tallest of the five: its column is the narrowest (the
     44px textile band eats it) so the zone wrapped to three lines at 320. The
     band and the gutter give the words their room back. */
  .vt-ti .ti-carte { margin-top: 9px; padding: 9px 12px 10px; }
  .vt-ti .ti-zone { margin-top: 8px; }


  /* ENTETES-I — RULES RECOVERED FROM A NEIGHBOUR'S CHUNK. In the compiled
     sheet these sat in a shared trailing region after all five style blocks,
     so the first extraction swept them into whichever module owned that
     region. They belong to THIS root: without them a shop that chose this
     style would load a chunk missing its own rules. Their relative order is
     preserved, and they stay LAST, which is the cascade position they had. */
  .vt-ti .ti-frame .vt-avatar-img { object-position: 50% 24%; }
  @container (max-width: 339px) {
    .vt-ti .ti-scene { min-height: 236px; }
    .vt-ti .ti-frame { width: 43%; }
    .vt-ti .ti-col { width: calc(100% - 124px); padding-left: 20px; }
    .vt-ti .ti-name { font-size: clamp(24px, 9.4cqw, 28px); }
    .vt-ti .ti-lisere { width: 26px; }
    .vt-ti .ti-couronne { width: 34px; height: 20px; }
    .vt-ti .ti-bienv-t { font-size: 16px; }
    .vt-ti .ti-nouv { width: 78px; height: 78px; }
    .vt-ti .ti-cell-i { width: 30px; height: 30px; }
    .vt-ti .ti-cell-l { font-size: 9.5px; line-height: 1.2; }
    .vt-ti .ti-cell-s { font-size: 9.5px; line-height: 1.2; }
    .vt-ti .ti-cell { gap: 6px; padding: 0 3px; }
  }

`;

export const unit: EnteteUnit = { render, css };
