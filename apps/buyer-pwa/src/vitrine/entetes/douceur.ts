import { t } from '../../i18n';
import { groupFr } from '../../cliente/money';
import { iconCheckEnt, iconLockEnt, iconPinSolid, iconShieldEnt, iconStarEnt, iconTagEnt } from '../icons';
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
 * ENTETES-I · 24 · DOUCEUR — the série 4 unit for the canon key `seance`.
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
    `<div class="do-cell"><span class="do-cell-i do-cell-i--${mod}">${icon}</span><span class="do-cell-t"><span class="do-cell-l">${label}</span><span class="do-cell-s">${sub}</span></span></div>`;
  const [nA = '', ...nB] = t('vit.nouvelle_vendeuse').split(' ');
  return [
    '<div class="vt-ent vt-do" data-role="vitrine-hero">',
    '<div class="do-hero">',
    '<div class="do-scene">',
    // Relevé « Décor » — bande textile gauche 44 à bord déchiré, blob sauge
    // derrière la photo, anneau filaire, fleurs en trait or.
    '<span class="do-textile" aria-hidden="true"></span>',
    '<span class="do-blob" aria-hidden="true"></span>',
    '<span class="do-anneau" aria-hidden="true"></span>',
    '<svg class="do-fleurs" aria-hidden="true" viewBox="0 0 40 46" width="40" height="46"><path d="M20 44V18M20 18c-6 0-9-5-6-9 4-2 8 2 6 9zM20 18c6 0 9-5 6-9-4-2-8 2-6 9zM20 30c-5-1-8-5-6-8 3-2 7 2 6 8z" fill="none" stroke="#C9A45C" stroke-width="1.4" stroke-linecap="round"/></svg>',
    `<div class="do-frame" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '60% 30%')
      : `<div class="do-motif"><span class="do-mono">${v.mono}</span></div>`,
    '</div>',
    '<div class="do-col" data-role="vitrine-identity">',
    // Relevé « Type » — monogramme double cercle or 56 à « {initiale}{initiale} ».
    `<span class="do-sceau-mono" aria-hidden="true"><span class="do-sceau-i">${v.mono}${v.mono}</span></span>`,
    `<div class="do-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="do-bienv"><span class="do-bienv-t">${t('vit.bienvenue')}</span><span class="do-souligne" aria-hidden="true"></span></div>`,
    `<div class="do-verif"><span class="do-verif-r">${iconCheckEnt(11, '#FFFFFF', 3)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="do-zone">${iconPinSolid(14, '#C9A45C', '#F7F0E6')}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? [
          '<div class="do-proof">',
          `<span class="do-chip" data-role="reputation-count"><v>${groupFr(v.delivN)}</v></span>`,
          '<span class="do-proof-t">',
          `<span data-role="reputation">${ventesLine(v)}</span>`,
          v.showStars
            ? `<span class="do-stars" data-role="chip-avis">${iconStarEnt(10, '#C9A45C')}${avisChip(v)}</span>`
            : '',
          '</span>',
          '</div>',
        ].join('')
      : '',
    v.nouvelle
      ? `<div class="do-nouv-wrap"><span class="do-nouv" data-role="chip-nouvelle"><span class="do-feston" aria-hidden="true"></span><span class="do-nouv-t"><span class="do-nouv-a"><v>${nA}</v></span><span class="do-nouv-b"><v>${nB.join(' ')}</v></span></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '</div>',
    '<div class="do-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(17, '#FFFFFF', 1.8), t('vit.chip_sera'), t('vit.cell_sera_sub'), 'sauge'),
    cell(iconLockEnt(15, '#FFFFFF', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub'), 'blush'),
    cell(iconTagEnt(15, '#FFFFFF', 2), t('vit.cell_prix'), t('vit.cell_prix_sub'), 'or'),
    '</div>',
    controls(v, 'do', 'right', '20px', '72px', '#6B7455'),
    '</div>',
  ].join('');
}

const css = `
/* ══════════════════════ 24 · DOUCEUR ══════════════════════
     Relevé — crème #F7F0E6 · olive #6B7455, sauge #8A9B77 · blush #C98A92 /
     #C97B84, textes rosés #B06A73 · or #C9A45C · brun #3E3428. Galet photo
     organique 196×264 ; sceau festonné or 12 lobes en MINIMAL. Ce visuel n'a
     AUCUN sceau soudé au nom — le dernier segment blush le remplace. */
  .vt-do {
    --do-creme: #F7F0E6; --do-creme2: #F9F2E9;
    --do-olive: #6B7455; --do-sauge: #8A9B77; --do-sauge2: #7C8B67;
    --do-blush: #C98A92; --do-blush2: #C97B84; --do-rose: #B06A73;
    --do-or: #C9A45C; --do-or2: #B98A3A; --do-brun: #3E3428;
    background: var(--do-creme);
  }
  .vt-do .do-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 18px;
    background-color: var(--do-creme);
    background-image: radial-gradient(60% 44% at 84% 12%, var(--do-creme2) 0%, rgba(249,242,233,0) 72%);
  }
  .vt-do .do-scene { position: relative; min-height: 250px; }
  .vt-do .do-textile {
    position: absolute; left: -14px; top: -74px; bottom: -18px; width: 44px;
    background-image:
      linear-gradient(180deg, var(--do-blush) 0 18%, var(--do-sauge) 18% 34%, var(--do-creme2) 34% 46%, var(--do-blush2) 46% 62%, var(--do-sauge2) 62% 78%, var(--do-creme2) 78% 100%),
      repeating-linear-gradient(0deg, rgba(255,255,255,.32) 0 2px, transparent 2px 7px);
    clip-path: polygon(0 0, 100% 0, 88% 6%, 100% 13%, 86% 20%, 100% 27%, 88% 34%, 100% 41%, 86% 48%, 100% 55%, 88% 62%, 100% 69%, 86% 76%, 100% 83%, 88% 90%, 100% 96%, 92% 100%, 0 100%);
  }
  .vt-do .do-blob { position: absolute; right: -6px; top: 6px; width: 210px; height: 246px; background: var(--do-sauge); opacity: .34; border-radius: 58% 42% 46% 54% / 46% 52% 48% 54%; }
  .vt-do .do-anneau { position: absolute; right: 132px; top: 128px; width: 76px; height: 76px; border-radius: 50%; border: 1.4px solid var(--do-or); opacity: .55; }
  .vt-do .do-fleurs { position: absolute; right: 148px; top: 16px; opacity: .8; }
  .vt-do .do-frame { position: absolute; right: 0; top: 0; width: 196px; height: 264px; overflow: hidden; border-radius: 54% 46% 42% 58% / 40% 44% 56% 60%; }
  .vt-do .do-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--do-creme2);
    background-image:
      radial-gradient(circle 4px at 12px 16px, rgba(201,138,146,.42) 96%, transparent),
      radial-gradient(circle 4px at 40px 44px, rgba(138,155,119,.4) 96%, transparent);
    background-size: 56px 60px;
  }
  .vt-do .do-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 52px; color: rgba(107,116,85,.5); }
  .vt-do .do-col { position: relative; width: calc(100% - 158px); padding-left: 44px; }
  .vt-do .do-sceau-mono { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; border: 1.4px solid var(--do-or); box-shadow: inset 0 0 0 4px var(--do-creme), inset 0 0 0 5.4px rgba(201,164,92,.6); }
  .vt-do .do-sceau-i { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 19px; letter-spacing: .04em; color: var(--do-or2); }
  .vt-do .do-name {
    margin-top: 10px; font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(24px, 8.4cqw, 29px); line-height: 1.08; color: var(--do-olive); overflow-wrap: break-word;
  }
  /* Relevé §Casse — Douceur est la seule des cinq à 20 px fixe past 14 car. */
  .vt-do .do-name.vt-ent-long { font-size: 20px; }
  .vt-do .do-name .vt-ent-acc { color: var(--do-blush2); }
  .vt-do .do-bienv { position: relative; margin-top: 8px; display: inline-block; transform: rotate(-3deg); }
  .vt-do .do-bienv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 19px; line-height: 1.2; color: var(--do-or2); }
  .vt-do .do-souligne { display: block; margin-top: 2px; height: 1.2px; background: var(--do-or); opacity: .8; }
  .vt-do .do-verif { margin-top: 11px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: var(--do-brun); }
  .vt-do .do-verif-r { width: 17px; height: 17px; flex: none; border-radius: 50%; background: var(--do-sauge); display: flex; align-items: center; justify-content: center; }
  .vt-do .do-zone { margin-top: 6px; display: flex; align-items: flex-start; gap: 7px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--do-brun); }
  .vt-do .do-zone svg { flex: none; margin-top: 1px; }
  .vt-do .do-proof { margin-top: 12px; display: flex; align-items: center; gap: 8px; }
  .vt-do .do-chip { flex: none; display: inline-flex; align-items: center; padding: 7px 12px; border-radius: 12px; background: var(--do-blush2); font-weight: 800; font-size: 14px; color: #FFFFFF; }
  .vt-do .do-proof-t { font-size: 10.5px; line-height: 1.35; font-weight: 600; color: var(--do-rose); }
  .vt-do .do-stars { display: flex; align-items: center; gap: 3px; margin-top: 1px; color: var(--do-or2); }
  .vt-do .do-nouv-wrap { margin-top: 13px; }
  .vt-do .do-nouv {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 100px; height: 100px;
  }
  /* Le sceau festonné 12 lobes : un dégradé or masqué par une couronne conique. */
  .vt-do .do-feston {
    position: absolute; inset: 0; background: linear-gradient(150deg, #D8B060, var(--do-or2));
    clip-path: polygon(50% 0%, 62% 6%, 75% 4%, 82% 15%, 94% 20%, 95% 33%, 100% 45%, 94% 57%, 96% 70%, 85% 78%, 80% 90%, 67% 92%, 56% 99%, 44% 94%, 32% 97%, 23% 87%, 11% 83%, 7% 70%, 0 58%, 5% 46%, 2% 33%, 13% 24%, 17% 12%, 30% 9%, 39% 2%);
  }
  .vt-do .do-nouv-t { position: relative; text-align: center; line-height: 1.15; }
  .vt-do .do-nouv-a { display: block; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 16px; color: #FFFFFF; }
  .vt-do .do-nouv-b { display: block; margin-top: 1px; font-size: 8.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #FFFFFF; }
  .vt-do .do-trust { margin: 0 10px 12px; padding: 12px 6px; background: #FFFFFF; border-radius: 20px; box-shadow: 0 12px 26px -16px rgba(62,52,40,.5); display: grid; grid-template-columns: 1.12fr 1fr 1.04fr; }
  .vt-do .do-cell { padding: 0 5px; display: flex; align-items: center; gap: 8px; }
  .vt-do .do-cell-i { width: 38px; height: 38px; flex: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .vt-do .do-cell-i--sauge { background: var(--do-sauge); }
  .vt-do .do-cell-i--blush { background: var(--do-blush2); }
  .vt-do .do-cell-i--or { background: var(--do-or); }
  .vt-do .do-cell-l { display: block; font-size: 9.5px; font-weight: 700; line-height: 1.3; color: var(--do-brun); }
  .vt-do .do-cell-s { display: block; font-size: 9.5px; font-weight: 600; line-height: 1.3; color: var(--do-rose); }
  .vt-do .do-btn { background: #FFFFFF; box-shadow: 0 6px 16px -8px rgba(62,52,40,.5); }
  .vt-do .vt-ent-btn { top: 70px; }
  .vt-do .vt-ent-back { right: 20px; }


  /* ENTETES-I — RULES RECOVERED FROM A NEIGHBOUR'S CHUNK. In the compiled
     sheet these sat in a shared trailing region after all five style blocks,
     so the first extraction swept them into whichever module owned that
     region. They belong to THIS root: without them a shop that chose this
     style would load a chunk missing its own rules. Their relative order is
     preserved, and they stay LAST, which is the cascade position they had. */
  .vt-do .do-trust { padding: 9px 4px; align-items: center; }
  .vt-do .do-cell-i { width: 32px; height: 32px; }
  .vt-do .do-cell-l { font-size: 9.5px; line-height: 1.22; }
  .vt-do .do-cell-s { font-size: 9.5px; line-height: 1.22; }
  .vt-do .do-cell { gap: 7px; padding: 0 4px; }
  .vt-do .do-nouv { width: 66px; height: 66px; }
  .vt-do .do-nouv-wrap { margin-top: 9px; }
  .vt-do .do-nouv-a { font-size: 12px; }
  .vt-do .do-nouv-b { font-size: 8px; }
  .vt-do .do-col { width: calc(100% - 180px); padding-left: 32px; }
  .vt-do .do-textile { width: 32px; }
  .vt-do .do-frame { width: 168px; height: 240px; }
  .vt-do .do-zone { margin-top: 5px; }
  .vt-do .do-proof { margin-top: 9px; }
  .vt-do .do-sceau-mono { width: 40px; height: 40px; }
  .vt-do .do-sceau-i { font-size: 14px; }
  .vt-do .do-name { margin-top: 5px; }
  .vt-do .do-verif { margin-top: 8px; }


  /* Le portrait de secours garde le biais haut du contrat (§5 : 18-30 %),
     donc aucune tete n'est coupee quand elle n'a pas de couverture.
     ENTETES-I : la regle groupait les cinq racines de la serie 4 dans une
     seule declaration ; chaque style en porte desormais sa part, sinon la
     boutique qui choisit ce style-la telecharge un chunk sans elle. */
  .vt-do .do-frame .vt-avatar-img { object-position: 50% 24%; }
  @container (max-width: 339px) {
    .vt-do .do-scene { min-height: 238px; }
    .vt-do .do-frame { width: 138px; height: 208px; }
    .vt-do .do-col { width: calc(100% - 150px); padding-left: 22px; }
    .vt-do .do-name { font-size: clamp(20px, 8.4cqw, 24px); }
    .vt-do .do-zone, .vt-do .do-verif { font-size: 11px; }
    .vt-do .do-textile { width: 22px; }
    .vt-do .do-fleurs, .vt-do .do-anneau { display: none; }
    .vt-do .do-sceau-mono { width: 48px; height: 48px; }
    .vt-do .do-bienv-t { font-size: 17px; }
    .vt-do .do-cell-i { width: 30px; height: 30px; }
    .vt-do .do-cell-l { font-size: 9.5px; line-height: 1.2; }
    .vt-do .do-cell-s { font-size: 9.5px; line-height: 1.2; }
    .vt-do .do-cell { gap: 6px; padding: 0 3px; }
  }

`;

export const unit: EnteteUnit = { render, css };
