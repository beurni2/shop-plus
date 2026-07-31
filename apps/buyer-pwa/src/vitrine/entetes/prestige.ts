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
 * ENTETES-I · 21 · PRESTIGE — the série 4 unit for the canon key `masque`.
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
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="pr-cell"><span class="pr-cell-i">${icon}</span><span class="pr-cell-t"><span class="pr-cell-l">${label}</span><span class="pr-cell-s">${sub}</span></span></div>`;
  const [nA = '', ...nB] = t('vit.nouvelle_vendeuse').split(' ');
  return [
    '<div class="vt-ent vt-pr" data-role="vitrine-hero">',
    '<div class="pr-hero">',
    '<div class="pr-scene">',
    // Relevé « Photo » — panneau 186 à droite, clip-path diagonal, la couche or
    // dessous fait le liseré 3px : deux calques, jamais une bordure.
    '<div class="pr-panneau">',
    '<span class="pr-or" aria-hidden="true"></span>',
    `<div class="pr-frame" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '62% 24%')
      : `<div class="pr-motif"><span class="pr-mono">${v.mono}</span></div>`,
    '</div>',
    '</div>',
    '<div class="pr-col" data-role="vitrine-identity">',
    // Relevé « Type » — crest « B » or filaire 46×30 en tête.
    '<svg class="pr-crest" aria-hidden="true" viewBox="0 0 46 30" width="46" height="30"><path d="M23 4c-3 0-5 2-5 5 0 4 5 8 5 8s5-4 5-8c0-3-2-5-5-5z" fill="none" stroke="#D9A441" stroke-width="1.6"/><path d="M6 15c4-1 6-4 6-8M40 15c-4-1-6-4-6-8M6 15c4 1 6 4 6 8M40 15c-4 1-6 4-6 8" fill="none" stroke="#D9A441" stroke-width="1.2"/></svg>',
    `<div class="pr-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    '<span class="pr-dots" aria-hidden="true"><i></i><i></i></span>',
    `<div class="pr-bienv">${t('vit.bienvenue')}<svg class="pr-eclats" aria-hidden="true" viewBox="0 0 16 14" width="16" height="14"><path d="M2 12L8 2M7 13l6-9M12 12l3-4" stroke="#D9A441" stroke-width="2" stroke-linecap="round" fill="none"/></svg></div>`,
    // §Casse — le sceau est une LIGNE dédiée sur ces visuels, jamais soudé au nom.
    `<div class="pr-verif">${iconCheckEnt(15, '#D9A441', 2)}<span>${verifieeBare()}</span></div>`,
    `<div class="pr-zone">${iconPinSolid(14, '#D9A441', '#141210')}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? [
          '<div class="pr-proof">',
          `<span class="pr-pastille" data-role="reputation-count"><v>${groupFr(v.delivN)}</v></span>`,
          '<span class="pr-proof-t">',
          `<span data-role="reputation">${ventesLine(v)}</span>`,
          v.showStars
            ? `<span class="pr-stars" data-role="chip-avis">${iconStarEnt(10, '#D9A441')}${avisChip(v)}</span>`
            : '',
          '</span>',
          '</div>',
        ].join('')
      : '',
    v.nouvelle
      ? `<div class="pr-nouv-wrap"><span class="pr-nouv" data-role="chip-nouvelle"><svg class="pr-nouv-s" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="#17130E"><path d="M12 2l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9L8.4 13l.7-4L6.2 6.2l4-.6z"/><circle cx="12" cy="18.5" r="1.4"/></svg><span class="pr-nouv-t"><v>${nA}</v><br><v>${nB.join(' ')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '</div>',
    // Relevé « Bandes » — bande tissée h14 (noir + croisillons or) sous le héros.
    '<div class="pr-bande" aria-hidden="true"></div>',
    '<div class="pr-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(17, '#D9A441', 1.9), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#D9A441', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#D9A441', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'pr', 'right', '20px', '72px', '#17130E'),
    '</div>',
  ].join('');
}

const css = `
/* ══════════════════════ 21 · PRESTIGE ══════════════════════
     Relevé — noir #141210 (cercles #17130E) · ivoire #F2E9D8 / crème #F4EDE0
     · or #D9A441 (.txg #EFCB78/#D9A441/#B37F24/#E7C069) · textes #E9E0CE /
     #8C7B68 · séparateurs #DBD0BC. Photo : panneau 186 à droite, clip-path
     polygon(15% 0,100% 0,100% 100%,0 92%), liseré or 3px = couche or dessous. */
  .vt-pr {
    --pr-noir: #141210; --pr-encre: #17130E;
    --pr-ivoire: #F2E9D8; --pr-creme: #F4EDE0;
    --pr-or: #D9A441; --pr-or-fonce: #B37F24; --pr-or-clair: #EFCB78; --pr-or-2: #E7C069;
    --pr-txt: #E9E0CE; --pr-txt2: #8C7B68; --pr-sep: #DBD0BC;
    background: var(--pr-noir);
  }
  .vt-pr .pr-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 18px;
    background-color: var(--pr-noir);
    background-image:
      radial-gradient(40% 30% at 20% 20%, rgba(255,255,255,.045) 0%, transparent 70%),
      radial-gradient(36% 26% at 30% 80%, rgba(217,169,65,.07) 0%, transparent 70%);
  }
  .vt-pr .pr-scene { position: relative; min-height: 266px; }
  .vt-pr .pr-panneau { position: absolute; top: -74px; right: -14px; bottom: -18px; width: 186px; }
  .vt-pr .pr-or { position: absolute; inset: 0; background: var(--pr-or); clip-path: polygon(15% 0, 100% 0, 100% 100%, 0 92%); }
  .vt-pr .pr-frame { position: absolute; inset: 3px 3px 7px 3px; clip-path: polygon(15% 0, 100% 0, 100% 100%, 0 92%); overflow: hidden; }
  .vt-pr .pr-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--pr-encre);
    background-image:
      repeating-linear-gradient(45deg, rgba(217,169,65,.3) 0 2px, transparent 2px 11px),
      repeating-linear-gradient(-45deg, rgba(242,233,216,.14) 0 2px, transparent 2px 11px);
  }
  .vt-pr .pr-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 54px; color: rgba(217,169,65,.55); margin-left: 20px; }
  /* Chaque colonne DÉGAGE son cadre de 12px (elle le touchait au pixel près :
     les bords arrondis et déchirés des cartes info disparaissaient, et la
     tolérance de 2px du garde-fou était tout ce qui restait). */
  /* Le portrait de secours garde le biais haut du contrat (§5 : 18–30 %),
     donc aucune tête n'est coupée quand elle n'a pas de couverture. */
  /* Le portrait de secours garde le biais haut du contrat (§5 : 18-30 %),
     donc aucune tete n'est coupee quand elle n'a pas de couverture.
     ENTETES-I : la regle groupait les cinq racines de la serie 4 dans une
     seule declaration ; chaque style en porte desormais sa part, sinon la
     boutique qui choisit ce style-la telecharge un chunk sans elle. */
  .vt-pr .pr-frame .vt-avatar-img { object-position: 50% 24%; }
  .vt-pr .pr-col { position: relative; width: calc(100% - 184px); }
  .vt-pr .pr-crest { display: block; }
  .vt-pr .pr-name {
    margin-top: 8px; font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.06; letter-spacing: .005em;
    color: var(--pr-ivoire); overflow-wrap: break-word;
  }
  /* Relevé §Casse — > 14 caractères : 24 px FIXE (une seule marche sur ces cinq). */
  .vt-pr .pr-name.vt-ent-long { font-size: 24px; }
  /* Le dernier segment en or brossé : dégradé de texte, fallback plein or. */
  .vt-pr .pr-name .vt-ent-acc { color: var(--pr-or); }
  @supports (background-clip: text) or (-webkit-background-clip: text) {
    .vt-pr .pr-name .vt-ent-acc {
      background-image: linear-gradient(96deg, var(--pr-or-clair) 0%, var(--pr-or) 38%, var(--pr-or-fonce) 68%, var(--pr-or-2) 100%);
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
    }
  }
  .vt-pr .pr-dots { display: flex; gap: 4px; margin-top: 6px; }
  .vt-pr .pr-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--pr-or); }
  .vt-pr .pr-bienv { margin-top: 9px; display: flex; align-items: center; gap: 8px; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 19px; line-height: 1.2; color: var(--pr-ivoire); }
  .vt-pr .pr-eclats { flex: none; }
  .vt-pr .pr-verif { margin-top: 10px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: #FFFFFF; }
  .vt-pr .pr-zone { margin-top: 6px; display: flex; align-items: flex-start; gap: 7px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--pr-txt); }
  .vt-pr .pr-zone svg { flex: none; margin-top: 1px; }
  .vt-pr .pr-proof { margin-top: 12px; display: flex; align-items: center; gap: 9px; }
  .vt-pr .pr-pastille {
    width: 44px; height: 44px; flex: none; border-radius: 50%; background: var(--pr-or);
    box-shadow: 0 0 0 1.5px var(--pr-noir), 0 0 0 3px rgba(217,169,65,.5);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 15px; color: var(--pr-encre);
  }
  .vt-pr .pr-proof-t { font-size: 11px; line-height: 1.35; color: var(--pr-txt); }
  .vt-pr .pr-proof-t b { color: #FFFFFF; font-weight: 700; }
  .vt-pr .pr-stars { display: flex; align-items: center; gap: 3px; margin-top: 2px; color: var(--pr-or); font-weight: 600; font-size: 10.5px; }
  .vt-pr .pr-nouv-wrap { margin-top: 14px; }
  .vt-pr .pr-nouv {
    position: relative; display: inline-flex; align-items: center; gap: 9px;
    padding: 10px 14px; background: var(--pr-or); border-radius: 4px; transform: rotate(-3deg);
    box-shadow: 0 10px 22px -10px rgba(217,169,65,.7), inset 0 0 0 1.5px rgba(23,19,14,.25);
  }
  .vt-pr .pr-nouv-t { font-weight: 700; font-size: 13px; line-height: 1.2; color: var(--pr-encre); }
  .vt-pr .pr-bande {
    height: 14px; background-color: var(--pr-encre);
    background-image:
      repeating-linear-gradient(45deg, rgba(217,169,65,.7) 0 2px, transparent 2px 11px),
      repeating-linear-gradient(-45deg, rgba(217,169,65,.7) 0 2px, transparent 2px 11px);
  }
  .vt-pr .pr-trust { background: var(--pr-creme); padding: 13px 10px; display: grid; grid-template-columns: 1.12fr 1fr 1.06fr; }
  .vt-pr .pr-cell { padding: 0 5px; display: flex; align-items: center; gap: 8px; }
  .vt-pr .pr-cell + .pr-cell { border-left: 1px solid var(--pr-sep); }
  .vt-pr .pr-cell-i { width: 38px; height: 38px; flex: none; border-radius: 50%; background: var(--pr-encre); display: flex; align-items: center; justify-content: center; }
  .vt-pr .pr-cell-l { display: block; font-size: 9.5px; font-weight: 700; line-height: 1.3; color: var(--pr-encre); }
  .vt-pr .pr-cell-s { display: block; font-size: 9.5px; font-weight: 600; line-height: 1.3; color: var(--pr-txt2); }
  .vt-pr .pr-btn { background: var(--pr-or); }
  .vt-pr .vt-ent-btn { top: 70px; }
  /* The back button takes the NEAR slot and share slides to FAR — the same
     pairing every controls() call site declares. It was missing on the five
     Série 4 units and on Indigo, so an absolutely-positioned button with no
     left/right fell back to its STATIC position: x=0, flush on the left edge,
     over the content. Invisible to the suites because no test rendered a
     header with a provenance — e2e/entetes-retour.spec.ts now does. */
  .vt-pr .vt-ent-back { right: 20px; }


  /* ENTETES-I — RULES RECOVERED FROM A NEIGHBOUR'S CHUNK. In the compiled
     sheet these sat in a shared trailing region after all five style blocks,
     so the first extraction swept them into whichever module owned that
     region. They belong to THIS root: without them a shop that chose this
     style would load a chunk missing its own rules. Their relative order is
     preserved, and they stay LAST, which is the cascade position they had. */
  .vt-pr .pr-trust { padding: 9px 8px; align-items: center; }
  .vt-pr .pr-nouv-wrap { margin-top: 10px; }


  /* ENTETES-I — this trust-strip block grouped four série 4 roots in one
     declaration. Each style now carries its own; a grouped rule can only
     ship inside ONE chunk, and the other three shops would load without it. */
  .vt-pr .pr-cell-i { width: 32px; height: 32px; }
  .vt-pr .pr-cell-l { font-size: 9.5px; line-height: 1.22; }
  .vt-pr .pr-cell-s { font-size: 9.5px; line-height: 1.22; }
  .vt-pr .pr-cell { gap: 7px; padding: 0 4px; }
  @container (max-width: 339px) {
    .vt-pr .pr-scene { min-height: 250px; }
    .vt-pr .pr-panneau { width: 162px; }
    .vt-pr .pr-col { width: calc(100% - 158px); }
    .vt-pr .pr-name { font-size: clamp(24px, 9.4cqw, 28px); }
    .vt-pr .pr-crest { width: 40px; height: 26px; }
    .vt-pr .pr-bienv { font-size: 17px; }
    .vt-pr .pr-cell-i { width: 30px; height: 30px; }
    .vt-pr .pr-cell-l { font-size: 9.5px; line-height: 1.2; }
    .vt-pr .pr-cell-s { font-size: 9.5px; line-height: 1.2; }
    .vt-pr .pr-cell { gap: 6px; padding: 0 3px; }
  }

`;

export const unit: EnteteUnit = { render, css };
