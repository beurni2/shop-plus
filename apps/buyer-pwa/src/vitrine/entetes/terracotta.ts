import { t } from '../../i18n';
import { groupFr } from '../../cliente/money';
import { iconLockEnt, iconPinSolid, iconShieldEnt, iconSparkle, iconStarEnt, iconTagEnt } from '../icons';
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
 * ENTETES-I · 22 · TERRACOTTA — the série 4 unit for the canon key `harmattan`.
 *
 * MOVED, NOT REWRITTEN. Every byte of the drawing and the sheet is the one
 * ENTETES-F shipped; only its address changed. It was compiled into
 * `entetes.ts` and reached every cliente whether or not her seller chose it.
 *
 * Its 320px rules travelled with it, including this root's share of the three
 * grouped trust-cell rules the shared container held — same declarations, one
 * selector instead of five.
 */

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string, mod: string): string =>
    `<div class="te-cell"><span class="te-cell-i te-cell-i--${mod}">${icon}</span><span class="te-cell-t"><span class="te-cell-l">${label}</span><span class="te-cell-s te-cell-s--${mod}">${sub}</span></span></div>`;
  const [nA = '', ...nB] = t('vit.nouvelle_vendeuse').split(' ');
  return [
    '<div class="vt-ent vt-te" data-role="vitrine-hero">',
    '<div class="te-hero">',
    '<div class="te-scene">',
    // Relevé « Décor » — patch vert 216×222 rotate(−1°) DERRIÈRE le titre, deux
    // blocs de glyphes crème, couronne doodle or : décor pur, jamais tappable.
    '<span class="te-patch" aria-hidden="true"></span>',
    '<span class="te-glyphes te-glyphes1" aria-hidden="true"></span>',
    '<span class="te-glyphes te-glyphes2" aria-hidden="true"></span>',
    '<svg class="te-couronne" aria-hidden="true" viewBox="0 0 34 22" width="34" height="22"><path d="M4 18l2-9 5 5 6-11 6 11 5-5 2 9z" fill="none" stroke="#D9A441" stroke-width="2" stroke-linejoin="round"/></svg>',
    `<div class="te-frame" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '55% 30%')
      : `<div class="te-motif"><span class="te-mono">${v.mono}</span></div>`,
    '</div>',
    '<div class="te-col" data-role="vitrine-identity">',
    `<div class="te-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    '<span class="te-brosse" aria-hidden="true"></span>',
    `<div class="te-bienv-wrap"><span class="te-bienv"><span class="te-couture" aria-hidden="true"></span><span class="te-accroc" aria-hidden="true"></span><span class="te-bienv-t">${t('vit.bienvenue')}</span></span></div>`,
    `<div class="te-verif">${iconShieldEnt(15, '#D9A441', 2)}<span>${verifieeBare()}</span>${iconSparkle(12, '#D9A441')}</div>`,
    `<div class="te-zone">${iconPinSolid(14, '#F5EFE4', '#A65A33')}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? [
          '<div class="te-proof">',
          `<span class="te-chip" data-role="reputation-count"><v>${groupFr(v.delivN)}</v></span>`,
          '<span class="te-proof-t">',
          `<span data-role="reputation">${ventesLine(v)}</span>`,
          v.showStars
            ? `<span class="te-stars" data-role="chip-avis">${iconStarEnt(10, '#FBD98A')}${avisChip(v)}</span>`
            : '',
          '</span>',
          '</div>',
        ].join('')
      : '',
    v.nouvelle
      ? `<div class="te-nouv-wrap"><span class="te-nouv" data-role="chip-nouvelle"><span class="te-nouv-r" aria-hidden="true"></span><svg class="te-nouv-c" aria-hidden="true" viewBox="0 0 34 22" width="16" height="11"><path d="M4 18l2-9 5 5 6-11 6 11 5-5 2 9z" fill="none" stroke="#F2E9D8" stroke-width="2.4" stroke-linejoin="round"/></svg><span class="te-nouv-t"><v>${nA}</v><br><v>${nB.join(' ')}</v></span><span class="te-nouv-b" aria-hidden="true"></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '</div>',
    // Relevé « Déchirure » — bande déchirée h14, clip-path dentelé crème.
    '<div class="te-dechirure" aria-hidden="true"></div>',
    '<div class="te-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(17, '#F2E9D8', 1.8), t('vit.chip_sera'), t('vit.cell_sera_sub'), 'vert'),
    cell(iconLockEnt(15, '#F5EFE4', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub'), 'rouille'),
    cell(iconTagEnt(15, '#F2E9D8', 2), t('vit.cell_prix'), t('vit.cell_prix_sub'), 'vert'),
    '</div>',
    controls(v, 'te', 'right', '20px', '72px', '#7E3F20'),
    '</div>',
  ].join('');
}

const css = `
/* ══════════════════════ 22 · TERRACOTTA ══════════════════════
     Relevé — terre cuite #A65A33 (radials #B96B40/#7E3F20) · patch vert
     #46573A→#35472B, chips #3E4E33 · cuir #B97F46→#96602F · or #D9A441,
     étoile #FBD98A · crème #F5EFE4 / #EFE6D4 · rouille #A24E22. Photo pleine
     colonne droite 47 %. Écusson cuir cousu = « Bienvenue ». */
  .vt-te {
    --te-terre: #A65A33; --te-terre-c: #B96B40; --te-terre-f: #7E3F20;
    --te-vert-a: #46573A; --te-vert-b: #35472B; --te-chip: #3E4E33;
    --te-cuir-a: #B97F46; --te-cuir-b: #96602F;
    --te-or: #D9A441; --te-etoile: #FBD98A;
    --te-creme: #F5EFE4; --te-creme2: #EFE6D4; --te-ivoire: #F2E9D8;
    --te-rouille: #A24E22; --te-txt: #FFF6E8;
    background: var(--te-terre);
  }
  .vt-te .te-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 20px;
    background-color: var(--te-terre);
    background-image:
      radial-gradient(60% 46% at 88% 10%, var(--te-terre-c) 0%, rgba(185,107,64,0) 70%),
      radial-gradient(50% 40% at 6% 96%, var(--te-terre-f) 0%, rgba(126,63,32,0) 70%);
  }
  .vt-te .te-scene { position: relative; min-height: 250px; padding-top: 34px; }
  .vt-te .te-frame { position: absolute; top: -74px; right: -14px; bottom: -20px; width: 47%; overflow: hidden; }
  .vt-te .te-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: #7A4526;
    background-image:
      repeating-linear-gradient(90deg, rgba(240,231,210,.16) 0 3px, transparent 3px 12px),
      repeating-linear-gradient(0deg, rgba(30,20,12,.22) 0 2px, transparent 2px 14px);
  }
  .vt-te .te-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 52px; color: rgba(245,239,228,.6); }
  .vt-te .te-patch { position: absolute; left: -26px; top: 18px; width: 216px; height: 222px; background: radial-gradient(120% 100% at 30% 20%, var(--te-vert-a) 0%, var(--te-vert-b) 70%); opacity: .94; border-radius: 6px; transform: rotate(-1deg); }
  .vt-te .te-glyphes {
    position: absolute;
    background-image: radial-gradient(circle 1.6px at 4px 4px, rgba(240,231,210,.5) 96%, transparent);
    background-size: 10px 9px;
  }
  .vt-te .te-glyphes1 { left: 118px; top: 4px; width: 54px; height: 27px; opacity: .5; }
  .vt-te .te-glyphes2 { left: 4px; bottom: 62px; width: 44px; height: 27px; opacity: .42; }
  .vt-te .te-couronne { position: absolute; left: 4px; top: 0; }
  .vt-te .te-col { position: relative; width: calc(100% - 154px); }
  .vt-te .te-name {
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.06; color: var(--te-ivoire); overflow-wrap: break-word;
  }
  .vt-te .te-name.vt-ent-long { font-size: 24px; }
  /* Relevé §Type — le dernier segment passe en Bricolage 800 ITALIQUE or. */
  .vt-te .te-name .vt-ent-acc { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic; color: var(--te-or); }
  @supports (background-clip: text) or (-webkit-background-clip: text) {
    .vt-te .te-name .vt-ent-acc {
      background-image: linear-gradient(96deg, #EFCB78 0%, var(--te-or) 38%, #B37F24 68%, #E7C069 100%);
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
    }
  }
  .vt-te .te-brosse { display: block; margin-top: 5px; width: 64px; height: 5px; border-radius: 3px; background: #5E7048; transform: rotate(-2deg); }
  .vt-te .te-bienv-wrap { margin-top: 12px; }
  .vt-te .te-bienv {
    position: relative; display: inline-flex; padding: 9px 16px 10px; border-radius: 10px;
    background: linear-gradient(140deg, var(--te-cuir-a), var(--te-cuir-b));
    box-shadow: 0 8px 18px -8px rgba(60,35,15,.7); transform: rotate(-1.5deg);
  }
  .vt-te .te-couture { position: absolute; inset: 3px; border-radius: 7px; border: 1.5px dashed rgba(58,36,16,.5); }
  .vt-te .te-accroc { position: absolute; left: -5px; top: 50%; transform: translateY(-50%); width: 8px; height: 22px; background: var(--te-cuir-b); clip-path: polygon(100% 0, 0 20%, 100% 40%, 0 60%, 100% 80%, 0 100%); }
  .vt-te .te-bienv-t { position: relative; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 17px; line-height: 1.2; color: #4A2A10; }
  .vt-te .te-verif { margin-top: 12px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: var(--te-txt); }
  .vt-te .te-zone { margin-top: 6px; display: flex; align-items: flex-start; gap: 7px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--te-txt); }
  .vt-te .te-zone svg { flex: none; margin-top: 1px; }
  .vt-te .te-proof { margin-top: 12px; display: flex; align-items: center; gap: 8px; }
  .vt-te .te-chip { flex: none; display: inline-flex; align-items: center; padding: 8px 12px; border-radius: 10px; background: var(--te-chip); font-weight: 800; font-size: 15px; color: var(--te-ivoire); }
  .vt-te .te-proof-t { font-size: 10.5px; line-height: 1.35; font-weight: 600; color: var(--te-txt); }
  .vt-te .te-stars { display: flex; align-items: center; gap: 3px; margin-top: 1px; color: var(--te-etoile); }
  .vt-te .te-nouv-wrap { margin-top: 14px; }
  .vt-te .te-nouv {
    position: relative; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    width: 96px; height: 96px; border-radius: 50%; background: var(--te-chip);
    box-shadow: 0 12px 26px -12px rgba(20,30,12,.8);
  }
  .vt-te .te-nouv-r { position: absolute; inset: 5px; border-radius: 50%; border: 1.5px dashed rgba(242,233,216,.55); }
  .vt-te .te-nouv-t { font-size: 12px; font-weight: 700; line-height: 1.15; text-align: center; color: var(--te-txt); }
  .vt-te .te-nouv-b { width: 26px; height: 2px; background: var(--te-or); }
  .vt-te .te-dechirure { height: 14px; background: var(--te-creme2); clip-path: polygon(0 68%, 3% 22%, 8% 74%, 13% 26%, 18% 80%, 23% 20%, 28% 66%, 33% 14%, 38% 74%, 43% 30%, 48% 84%, 53% 22%, 58% 64%, 63% 12%, 68% 72%, 73% 28%, 78% 80%, 83% 24%, 88% 66%, 93% 14%, 100% 58%, 100% 100%, 0 100%); }
  .vt-te .te-trust {
    background-color: var(--te-creme2);
    background-image: radial-gradient(circle at 6% 40%, rgba(160,120,80,.14) 1.4px, transparent 1.6px);
    background-size: 11px 11px; padding: 12px 10px; display: grid; grid-template-columns: 1.14fr 1fr 1.04fr; margin-top: -1px;
  }
  .vt-te .te-cell { padding: 0 5px; display: flex; align-items: center; gap: 8px; }
  .vt-te .te-cell + .te-cell { border-left: 1.5px solid var(--te-terre); }
  .vt-te .te-cell-i { width: 38px; height: 38px; flex: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .vt-te .te-cell-i--vert { background: var(--te-chip); }
  .vt-te .te-cell-i--rouille { background: var(--te-rouille); }
  .vt-te .te-cell-l { display: block; font-size: 9.5px; font-weight: 700; line-height: 1.3; color: #2E2A20; }
  .vt-te .te-cell-s { display: block; font-size: 9.5px; font-weight: 600; line-height: 1.3; }
  .vt-te .te-cell-s--vert { color: #7C6A50; }
  .vt-te .te-cell-s--rouille { color: var(--te-rouille); }
  .vt-te .te-btn { background: var(--te-creme); }
  .vt-te .vt-ent-btn { top: 70px; }
  .vt-te .vt-ent-back { right: 20px; }


  /* ENTETES-I — recovered from a neighbour's chunk. In the compiled sheet
     these were GROUPED with other roots, or sat in a shared trailing region.
     A grouped rule can only ship inside ONE chunk, so every other shop would
     have loaded without it. Same declarations, this root's selector only. */
  .vt-te .te-nouv-wrap { margin-top: 9px; }

  /* ENTETES-I — RULES RECOVERED FROM A NEIGHBOUR'S CHUNK. In the compiled
     sheet these sat in a shared trailing region after all five style blocks,
     so the first extraction swept them into whichever module owned that
     region. They belong to THIS root: without them a shop that chose this
     style would load a chunk missing its own rules. Their relative order is
     preserved, and they stay LAST, which is the cascade position they had. */
  .vt-te .te-trust { padding: 9px 8px; align-items: center; }
  .vt-te .te-nouv { width: 78px; height: 78px; }


  /* Le portrait de secours garde le biais haut du contrat (§5 : 18-30 %),
     donc aucune tete n'est coupee quand elle n'a pas de couverture.
     ENTETES-I : la regle groupait les cinq racines de la serie 4 dans une
     seule declaration ; chaque style en porte desormais sa part, sinon la
     boutique qui choisit ce style-la telecharge un chunk sans elle. */
  .vt-te .te-frame .vt-avatar-img { object-position: 50% 24%; }

  /* ENTETES-I — this trust-strip block grouped four série 4 roots in one
     declaration. Each style now carries its own; a grouped rule can only
     ship inside ONE chunk, and the other three shops would load without it. */
  .vt-te .te-cell-i { width: 32px; height: 32px; }
  .vt-te .te-cell-l { font-size: 9.5px; line-height: 1.22; }
  .vt-te .te-cell-s { font-size: 9.5px; line-height: 1.22; }
  .vt-te .te-cell { gap: 7px; padding: 0 4px; }
  @container (max-width: 339px) {
    .vt-te .te-scene { min-height: 238px; padding-top: 30px; }
    .vt-te .te-frame { width: 44%; }
    .vt-te .te-col { width: calc(100% - 126px); }
    .vt-te .te-name { font-size: clamp(24px, 9.4cqw, 28px); }
    .vt-te .te-patch { width: 188px; height: 200px; }
    .vt-te .te-glyphes2 { display: none; }
    .vt-te .te-bienv-t { font-size: 15px; }
    .vt-te .te-nouv { width: 84px; height: 84px; }
    .vt-te .te-cell-i { width: 30px; height: 30px; }
    .vt-te .te-cell-l { font-size: 9.5px; line-height: 1.2; }
    .vt-te .te-cell-s { font-size: 9.5px; line-height: 1.2; }
    .vt-te .te-cell { gap: 6px; padding: 0 3px; }
  }

`;

export const unit: EnteteUnit = { render, css };
