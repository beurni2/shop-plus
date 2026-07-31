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
 * ENTETES-I · 23 · ÉTENDARD — the série 4 unit for the canon key `balafon`.
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
    `<div class="et-cell"><span class="et-cell-i et-cell-i--${mod}">${icon}</span><span class="et-cell-t"><span class="et-cell-l">${label}</span><span class="et-cell-s et-cell-s--${mod}">${sub}</span></span></div>`;
  return [
    '<div class="vt-ent vt-et" data-role="vitrine-hero">',
    '<div class="et-hero">',
    '<div class="et-scene">',
    // Relevé « Décor » — blobs verts, barre rouge, damier, tours abstraites,
    // serpentin. Écart du contrat lui-même : le livreur Séra et le paysage
    // photographique sont OMIS (ce sont des éléments photo, pas du CSS).
    '<span class="et-blob et-blob1" aria-hidden="true"></span>',
    '<span class="et-blob et-blob2" aria-hidden="true"></span>',
    '<span class="et-barre" aria-hidden="true"></span>',
    '<span class="et-damier" aria-hidden="true"></span>',
    '<svg class="et-tours" aria-hidden="true" viewBox="0 0 96 54" width="96" height="54"><path d="M4 54V26h11v28M19 54V14h9v40M32 54V32h12v22M48 54V20h8v34M60 54V38h10v16M74 54V28h9v26" fill="#121212" opacity=".36"/></svg>',
    '<svg class="et-serpentin" aria-hidden="true" viewBox="0 0 70 20" width="70" height="20"><path d="M2 12c8-12 16 8 24-2s16 10 24 0" fill="none" stroke="#C1272D" stroke-width="2.6" stroke-linecap="round"/></svg>',
    `<div class="et-frame" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '55% 22%')
      : `<div class="et-motif"><span class="et-mono">${v.mono}</span></div>`,
    '</div>',
    '<div class="et-col" data-role="vitrine-identity">',
    '<svg class="et-couronne" aria-hidden="true" viewBox="0 0 38 26" width="38" height="26"><path d="M5 21l2-11 6 6 5-13 5 13 6-6 2 11z" fill="none" stroke="#121212" stroke-width="2.4" stroke-linejoin="round"/></svg>',
    // Relevé « Type » — le nom repose sur une éclaboussure noire (clip-path).
    '<div class="et-nameblock">',
    '<span class="et-splash" aria-hidden="true"></span>',
    `<div class="et-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    '</div>',
    `<div class="et-bienv-wrap"><span class="et-bienv"><span class="et-bienv-t">${t('vit.bienvenue')}</span></span></div>`,
    // Relevé « Carte info » — carte noire déchirée : coche, épingle, filet, preuve.
    '<div class="et-carte">',
    `<div class="et-verif">${iconCheckEnt(17, '#2E9C52', 2.2)}<span>${verifieeBare()}</span></div>`,
    `<div class="et-zone">${iconPinSolid(14, '#D9A31C', '#121212')}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? [
          '<span class="et-filet" aria-hidden="true"></span>',
          '<div class="et-proof">',
          `<span class="et-pilule" data-role="reputation-count"><v>${groupFr(v.delivN)}</v></span>`,
          '<span class="et-proof-t">',
          `<span data-role="reputation">${ventesLine(v)}</span>`,
          v.showStars
            ? `<span class="et-stars" data-role="chip-avis">${iconStarEnt(10, '#D9A31C')}${avisChip(v)}</span>`
            : '',
          '</span>',
          '</div>',
        ].join('')
      : '',
    '</div>',
    v.nouvelle
      ? `<div class="et-nouv-wrap"><span class="et-nouv" data-role="chip-nouvelle"><span class="et-nouv-r" aria-hidden="true"></span><span class="et-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '</div>',
    '<div class="et-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#FFFFFF', 1.9), t('vit.chip_sera'), t('vit.cell_sera_sub'), 'vert'),
    cell(iconLockEnt(15, '#121212', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub'), 'jaune'),
    cell(iconTagEnt(15, '#FFFFFF', 2), t('vit.cell_prix'), t('vit.cell_prix_sub'), 'rouge'),
    '</div>',
    controls(v, 'et', 'right', '20px', '72px', '#121212'),
    '</div>',
  ].join('');
}

const css = `
/* ══════════════════════ 23 · ÉTENDARD ══════════════════════
     Relevé — jaune d'or #D9A31C→#C89117 (radial #E5B322) · verts #1F7A3D /
     #2E9C52 · rouge #C1272D · noir #121212. Nom Bricolage 800 italique sur
     éclaboussure noire ; carte info noire déchirée ; rangée noire.
     ÉCART DU CONTRAT LUI-MÊME : livreur Séra et paysage photo omis. */
  .vt-et {
    --et-jaune: #D9A31C; --et-jaune-b: #C89117; --et-jaune-c: #E5B322;
    --et-vert: #1F7A3D; --et-vert-c: #2E9C52;
    --et-rouge: #C1272D; --et-rouge-c: #E85055;
    --et-noir: #121212;
    background: var(--et-jaune);
  }
  .vt-et .et-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 18px;
    background-color: var(--et-jaune);
    background-image: radial-gradient(58% 44% at 74% 8%, var(--et-jaune-c) 0%, rgba(229,179,34,0) 70%), linear-gradient(168deg, var(--et-jaune) 0%, var(--et-jaune-b) 100%);
  }
  .vt-et .et-scene { position: relative; min-height: 206px; }
  .vt-et .et-blob { position: absolute; background: var(--et-vert); opacity: .9; }
  .vt-et .et-blob1 { left: -34px; top: -40px; width: 132px; height: 118px; border-radius: 62% 38% 46% 54% / 54% 46% 58% 42%; }
  .vt-et .et-blob2 { left: 22px; bottom: -46px; width: 104px; height: 92px; border-radius: 44% 56% 62% 38% / 48% 58% 42% 52%; opacity: .82; }
  .vt-et .et-barre { position: absolute; left: -18px; top: 96px; width: 148px; height: 10px; background: var(--et-rouge); transform: rotate(-14deg); }
  .vt-et .et-damier { position: absolute; left: 0; top: -60px; width: 96px; height: 64px; background-image: repeating-conic-gradient(var(--et-noir) 0% 25%, var(--et-rouge) 0% 50%); background-size: 16px 16px; opacity: .5; }
  .vt-et .et-tours { position: absolute; left: 2px; bottom: -18px; }
  .vt-et .et-serpentin { position: absolute; right: 84px; bottom: 2px; }
  .vt-et .et-frame { position: absolute; top: 44px; right: -6px; width: 158px; height: 212px; border-radius: 4px; overflow: hidden; box-shadow: 0 14px 30px -14px rgba(18,18,18,.7); }
  .vt-et .et-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--et-jaune-b);
    background-image:
      radial-gradient(circle 14px at 22% 30%, rgba(18,18,18,.55) 96%, transparent),
      radial-gradient(circle 9px at 68% 18%, rgba(18,18,18,.4) 96%, transparent),
      radial-gradient(circle 18px at 74% 72%, rgba(18,18,18,.45) 96%, transparent),
      radial-gradient(circle 7px at 30% 82%, rgba(18,18,18,.5) 96%, transparent);
  }
  .vt-et .et-mono { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic; font-size: 52px; color: rgba(18,18,18,.62); }
  .vt-et .et-col { position: relative; width: calc(100% - 170px); }
  .vt-et .et-couronne { display: block; }
  .vt-et .et-nameblock { position: relative; margin-top: 4px; padding: 8px 10px 9px 6px; }
  .vt-et .et-splash { position: absolute; inset: 0; background: var(--et-noir); clip-path: polygon(2% 14%, 22% 2%, 52% 9%, 78% 0, 99% 12%, 96% 62%, 99% 92%, 62% 99%, 28% 94%, 0 100%); transform: rotate(-2deg); }
  .vt-et .et-name {
    position: relative; font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif;
    font-weight: 800; font-style: italic; font-size: clamp(27px, 9.4cqw, 32px);
    line-height: 1.04; color: #FFFFFF; overflow-wrap: break-word;
  }
  .vt-et .et-name.vt-ent-long { font-size: 24px; }
  .vt-et .et-name .vt-ent-acc { color: var(--et-jaune); }
  .vt-et .et-bienv-wrap { margin-top: 9px; }
  .vt-et .et-bienv { display: inline-flex; padding: 5px 14px 6px; background: var(--et-rouge); transform: rotate(-3deg) skew(-4deg); box-shadow: 0 8px 16px -8px rgba(120,20,24,.7); }
  .vt-et .et-bienv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 17px; line-height: 1.2; color: #FFFFFF; }
  .vt-et .et-carte { position: relative; margin: 11px -6px 0 -8px; padding: 11px 12px 12px; background: var(--et-noir); clip-path: polygon(0 6%, 100% 0, 98% 96%, 2% 100%); }
  .vt-et .et-verif { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: #FFFFFF; }
  .vt-et .et-zone { margin-top: 5px; display: flex; align-items: flex-start; gap: 7px; font-size: 11px; font-weight: 600; line-height: 1.4; color: #F2EFE8; }
  .vt-et .et-zone svg { flex: none; margin-top: 1px; }
  .vt-et .et-filet { display: block; margin: 8px 0; height: 1px; background: rgba(255,255,255,.22); }
  .vt-et .et-proof { display: flex; align-items: center; gap: 8px; }
  .vt-et .et-pilule { flex: none; display: inline-flex; align-items: center; padding: 5px 11px; border-radius: 99px; background: var(--et-jaune); font-weight: 800; font-size: 13px; color: var(--et-noir); }
  .vt-et .et-proof-t { font-size: 10px; line-height: 1.35; font-weight: 600; color: #FFFFFF; }
  .vt-et .et-stars { display: flex; align-items: center; gap: 3px; margin-top: 1px; color: var(--et-jaune); }
  .vt-et .et-nouv-wrap { margin-top: 12px; }
  .vt-et .et-nouv {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 84px; height: 84px; border-radius: 50%; background: var(--et-vert); transform: rotate(4deg);
    box-shadow: 0 12px 26px -12px rgba(16,60,30,.85);
  }
  .vt-et .et-nouv-r { position: absolute; inset: 6px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,.8); }
  .vt-et .et-nouv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 13px; line-height: 1.15; text-align: center; color: #FFFFFF; padding: 0 10px; }
  .vt-et .et-trust { background: var(--et-noir); padding: 12px 10px; display: grid; grid-template-columns: 1.14fr 1fr 1.06fr; }
  .vt-et .et-cell { padding: 0 5px; display: flex; align-items: center; gap: 8px; }
  .vt-et .et-cell-i { width: 36px; height: 36px; flex: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .vt-et .et-cell-i--vert { background: var(--et-vert); box-shadow: inset 0 0 0 1.5px rgba(18,18,18,.3), 0 0 0 2px rgba(46,156,82,.35); }
  .vt-et .et-cell-i--jaune { background: var(--et-jaune); box-shadow: inset 0 0 0 1.5px rgba(18,18,18,.3), 0 0 0 2px rgba(217,163,28,.35); }
  .vt-et .et-cell-i--rouge { background: var(--et-rouge); box-shadow: inset 0 0 0 1.5px rgba(18,18,18,.3), 0 0 0 2px rgba(232,80,85,.35); }
  .vt-et .et-cell-l { display: block; font-size: 9.5px; font-weight: 700; font-style: italic; line-height: 1.3; color: #FFFFFF; }
  .vt-et .et-cell-s { display: block; font-size: 9.5px; font-weight: 600; line-height: 1.3; }
  .vt-et .et-cell-s--vert { color: var(--et-vert-c); }
  .vt-et .et-cell-s--jaune { color: var(--et-jaune); }
  .vt-et .et-cell-s--rouge { color: var(--et-rouge-c); }
  .vt-et .et-btn { background: #FFFFFF; }
  .vt-et .vt-ent-btn { top: 70px; }
  .vt-et .vt-ent-back { right: 20px; }


  /* ENTETES-I — recovered from a neighbour's chunk. In the compiled sheet
     these were GROUPED with other roots, or sat in a shared trailing region.
     A grouped rule can only ship inside ONE chunk, so every other shop would
     have loaded without it. Same declarations, this root's selector only. */
  .vt-et .et-nouv-wrap { margin-top: 9px; }

  /* ENTETES-I — RULES RECOVERED FROM A NEIGHBOUR'S CHUNK. In the compiled
     sheet these sat in a shared trailing region after all five style blocks,
     so the first extraction swept them into whichever module owned that
     region. They belong to THIS root: without them a shop that chose this
     style would load a chunk missing its own rules. Their relative order is
     preserved, and they stay LAST, which is the cascade position they had. */
  .vt-et .et-trust { padding: 9px 8px; align-items: center; }
  .vt-et .et-nouv { width: 72px; height: 72px; }
  .vt-et .et-nouv-t { font-size: 12px; padding: 0 8px; }
  .vt-et .et-carte { margin-top: 9px; padding: 9px 12px 10px; }
  .vt-et .et-nameblock { margin-top: 2px; }


  /* Le portrait de secours garde le biais haut du contrat (§5 : 18-30 %),
     donc aucune tete n'est coupee quand elle n'a pas de couverture.
     ENTETES-I : la regle groupait les cinq racines de la serie 4 dans une
     seule declaration ; chaque style en porte desormais sa part, sinon la
     boutique qui choisit ce style-la telecharge un chunk sans elle. */
  .vt-et .et-frame .vt-avatar-img { object-position: 50% 24%; }

  /* ENTETES-I — this trust-strip block grouped four série 4 roots in one
     declaration. Each style now carries its own; a grouped rule can only
     ship inside ONE chunk, and the other three shops would load without it. */
  .vt-et .et-cell-i { width: 32px; height: 32px; }
  .vt-et .et-cell-l { font-size: 9.5px; line-height: 1.22; }
  .vt-et .et-cell-s { font-size: 9.5px; line-height: 1.22; }
  .vt-et .et-cell { gap: 7px; padding: 0 4px; }
  @container (max-width: 339px) {
    .vt-et .et-scene { min-height: 196px; }
    .vt-et .et-frame { width: 136px; height: 190px; }
    .vt-et .et-col { width: calc(100% - 148px); }
    .vt-et .et-name { font-size: clamp(24px, 9.4cqw, 28px); }
    .vt-et .et-tours, .vt-et .et-serpentin { display: none; }
    .vt-et .et-bienv-t { font-size: 15px; }
    .vt-et .et-cell-i { width: 30px; height: 30px; }
    .vt-et .et-cell-l { font-size: 9.5px; line-height: 1.2; }
    .vt-et .et-cell-s { font-size: 9.5px; line-height: 1.2; }
    .vt-et .et-cell { gap: 6px; padding: 0 3px; }
  }

`;

export const unit: EnteteUnit = { render, css };
