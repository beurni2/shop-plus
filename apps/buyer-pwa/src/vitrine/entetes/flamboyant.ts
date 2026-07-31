import { t } from '../../i18n';
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
 * ENTETES-M · SÉRIE 11 — 54 · FLAMBOYANT — « l'heure dorée ».
 *
 * SOURCE OF TRUTH: the id="flamboyant" block of « En-tetes Boutique - Serie 11 »
 * and its « Relevé — Flamboyant ». Origine: création originale.
 *
 * THE COURTYARD AT FIVE IN THE AFTERNOON: golden light, falling flowers, heat.
 * The canopy spills in from the top as four flat leaf masses — `radial-gradient`
 * ellipses cut hard at 62%, which is what makes them read as foliage rather
 * than as a blur — then an SVG lays three stems and three clusters of fire over
 * them.
 *
 * THE FIRST CLUSTER IS DELIBERATELY HIGH AND SMALL, and the relevé flags it
 * with a warning sign: it must CLEAR THE KICKER BAND. Pulling it down to match
 * its siblings would put « L'HEURE DORÉE » under a corolla. Its centres and
 * radii are the relevé's, not mine, and they are not a style choice.
 *
 * THE PHOTO IS A SUN RING: a 120 circle inside a 150 crown of rays drawn with
 * `repeating-conic-gradient` at 5°/13.5°, a sky-coloured throat inset 11, and a
 * vermilion fillet. Every ring is INSIDE the 150 box, so the column clears the
 * box itself — no box-shadow surprise here.
 *
 * MINIMAL is a sun medal, IN THE COLUMN (ENTETES-K). Verified seal on its own
 * line. Bio not drawn. 24px tier past 14 characters.
 */

/** The canopy: stems with leaflets, three clusters of fire, falling petals. */
const canopee = (): string =>
  '<svg class="fm-canopee" aria-hidden="true" width="336" height="120" viewBox="0 0 336 120" fill="none">' +
  '<path d="M18 2C34 14 42 28 46 44" stroke="#356440" stroke-width="1.5" stroke-linecap="round"/>' +
  '<path d="M150 0C160 12 164 24 166 38" stroke="#356440" stroke-width="1.5" stroke-linecap="round"/>' +
  '<path d="M282 2C292 16 296 30 296 44" stroke="#356440" stroke-width="1.5" stroke-linecap="round"/>' +
  '<g fill="#356440">' +
  '<ellipse cx="26" cy="12" rx="2" ry="5" transform="rotate(28 26 12)"/><ellipse cx="34" cy="24" rx="2" ry="5" transform="rotate(28 34 24)"/>' +
  '<ellipse cx="156" cy="10" rx="2" ry="5" transform="rotate(16 156 10)"/><ellipse cx="161" cy="22" rx="2" ry="5" transform="rotate(16 161 22)"/>' +
  '<ellipse cx="288" cy="12" rx="2" ry="5" transform="rotate(20 288 12)"/><ellipse cx="292" cy="26" rx="2" ry="5" transform="rotate(20 292 26)"/></g>' +
  // CLUSTER 1 — HIGH AND REDUCED, so the kicker band stays clear. Do not lower.
  '<g fill="url(#fmVe)">' +
  '<circle cx="34" cy="38" r="6.4"/><circle cx="25" cy="44" r="5.4"/><circle cx="42" cy="45" r="5.4"/></g>' +
  '<circle cx="33" cy="49" r="4.6" fill="#F2A93B"/>' +
  '<g fill="url(#fmVe)">' +
  '<circle cx="166" cy="52" r="9"/><circle cx="153" cy="61" r="7.6"/><circle cx="178" cy="62" r="7.6"/></g>' +
  '<circle cx="165" cy="66" r="5.6" fill="#F2A93B"/>' +
  '<g fill="url(#fmVe)">' +
  '<circle cx="296" cy="50" r="8.4"/><circle cx="284" cy="58" r="7"/><circle cx="308" cy="59" r="7"/></g>' +
  '<circle cx="295" cy="63" r="5.2" fill="#F2A93B"/>' +
  '<g fill="#E0492E">' +
  '<ellipse cx="86" cy="76" rx="3.4" ry="5.6" opacity=".6" transform="rotate(28 86 76)"/>' +
  '<ellipse cx="214" cy="88" rx="3" ry="5" opacity=".5" transform="rotate(-34 214 88)"/>' +
  '<ellipse cx="122" cy="104" rx="3.6" ry="6" opacity=".7" transform="rotate(48 122 104)"/>' +
  '<ellipse cx="250" cy="110" rx="3.2" ry="5.4" opacity=".55" transform="rotate(-12 250 110)"/></g>' +
  '<defs><linearGradient id="fmVe" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#E0492E"/><stop offset="1" stop-color="#F2703F"/></linearGradient></defs></svg>';

/** The kicker's sun bullet — vermilion heart, four pollen rays. */
const soleilPuce = (): string =>
  '<svg class="fm-puce" aria-hidden="true" width="11" height="11" viewBox="0 0 11 11" fill="none">' +
  '<circle cx="5.5" cy="5.5" r="2.6" fill="#E0492E"/>' +
  '<path d="M5.5 0v2.2M5.5 8.8V11M0 5.5h2.2M8.8 5.5H11" stroke="#F2A93B" stroke-width="1.6" stroke-linecap="round"/></svg>';

/** A flamboyant flower — three petals and a heart — leading the proof chip. */
const fleurFeu = (): string =>
  '<svg class="fm-fleur" aria-hidden="true" width="16" height="15" viewBox="0 0 16 15" fill="none">' +
  '<ellipse cx="8" cy="5" rx="3.4" ry="4.6" fill="#E0492E"/>' +
  '<ellipse cx="4" cy="9.6" rx="3.4" ry="4.4" fill="#F2703F" transform="rotate(-52 4 9.6)"/>' +
  '<ellipse cx="12" cy="9.6" rx="3.4" ry="4.4" fill="#F2703F" transform="rotate(52 12 9.6)"/>' +
  '<circle cx="8" cy="8.4" r="2.4" fill="#F2A93B"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="fm-cell"><span class="fm-cell-i">${icon}</span><span class="fm-cell-l">${label}</span><span class="fm-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-fm" data-role="vitrine-hero">',
    '<div class="fm-hero">',
    '<span class="fm-masses" aria-hidden="true"></span>',
    canopee(),
    // the sun ring
    '<div class="fm-anneau-wrap">',
    '<span class="fm-rayons" aria-hidden="true"></span>',
    `<div class="fm-photo" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 26%')
      : `<div class="fm-motif"><span class="fm-mono">${v.mono}</span></div>`,
    '</div>',
    '</div>',
    '<div class="fm-col" data-role="vitrine-identity">',
    `<div class="fm-kick">${soleilPuce()}<span>${t('vit.fm_kicker')}</span></div>`,
    v.hasTag
      ? `<div class="fm-bienv"><span class="fm-bienv-t"><v>${v.tagline}</v></span><span class="fm-tiret" aria-hidden="true"></span></div>`
      : '',
    `<div class="fm-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="fm-verif"><span class="fm-verif-i">${iconCheckEnt(9, '#FFEFCB', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="fm-zone">${iconPinEnt(12, '#B33520', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="fm-proof-wrap"><span class="fm-proof">${fleurFeu()}<span class="fm-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="fm-stars" data-role="chip-avis">${iconStarEnt(10, '#F2A93B')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="fm-nouv-wrap"><span class="fm-nouv" data-role="chip-nouvelle"><span class="fm-medaille" aria-hidden="true"></span><span class="fm-coeur"><span class="fm-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="fm-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#2E5936', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#2E5936', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#2E5936', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'fm', 'right', '20px', '72px', '#3A2418'),
    '</div>',
  ].join('');
}

const css = `
  /* ═════════════════ 54 · FLAMBOYANT (série 11) ═════════════════
     Relevé — ciel doré #FFEFCB→#FFE3B0 58%→#FFD99E · vermillon
     #E0492E→#F2703F (sombre #B33520) · pollen #F2A93B · canopée
     #2E5936 / #356440 · rangée #22402A, sous-lignes #DFA377 · bois #3A2418. */
  .vt-fm {
    --fm-ciel: #FFEFCB; --fm-ciel-2: #FFD99E; --fm-verm: #E0492E; --fm-verm-2: #F2703F;
    --fm-verm-d: #B33520; --fm-pollen: #F2A93B; --fm-canopee: #2E5936;
    --fm-canopee-2: #356440; --fm-rangee: #22402A; --fm-sous: #DFA377; --fm-bois: #3A2418;
    background: var(--fm-ciel);
  }
  .vt-fm .fm-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 22px;
    background: linear-gradient(180deg, var(--fm-ciel) 0%, #FFE3B0 58%, var(--fm-ciel-2) 100%);
  }
  /* FOUR FLAT LEAF MASSES, cut hard at 62%. The hard cut is the whole point:
     a soft radial reads as a blur or a bad shadow, a cut one reads as foliage. */
  .vt-fm .fm-masses {
    position: absolute; left: 0; right: 0; top: 0; height: 44px;
    background-image:
      radial-gradient(96px 48px at 6% 0, var(--fm-canopee) 62%, transparent 63%),
      radial-gradient(70px 40px at 32% 0, var(--fm-canopee-2) 62%, transparent 63%),
      radial-gradient(86px 46px at 60% 0, var(--fm-canopee) 62%, transparent 63%),
      radial-gradient(78px 42px at 90% 0, var(--fm-canopee-2) 62%, transparent 63%);
  }
  .vt-fm .fm-canopee { position: absolute; left: 12px; top: 8px; }
  /* THE SUN RING — rays, throat, fillet, all inside the 150 box. */
  .vt-fm .fm-anneau-wrap { position: absolute; top: 118px; right: 12px; width: 150px; height: 150px; }
  .vt-fm .fm-rayons {
    position: absolute; inset: 0; border-radius: 50%;
    background: repeating-conic-gradient(from 4deg, rgba(242,169,59,.65) 0 5deg, transparent 5deg 13.5deg);
  }
  .vt-fm .fm-photo {
    position: absolute; inset: 11px; border-radius: 50%; overflow: hidden;
    background: var(--fm-ciel);
    box-shadow: inset 0 0 0 2px var(--fm-verm), 0 0 0 4px var(--fm-ciel);
  }
  .vt-fm .fm-photo .vt-avatar-img { object-position: 50% 26%; }
  .vt-fm .fm-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(180deg, #FFDFA8 0%, #FFC985 100%);
  }
  .vt-fm .fm-mono {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 56px; color: var(--fm-verm-d);
  }
  /* 44px clear of the canopy, per the relevé */
  .vt-fm .fm-col { position: relative; margin-top: 44px; width: calc(100% - 158px); min-height: 220px; }
  /* the cream halo — the canopy and the falling petals run behind this line */
  .vt-fm .fm-kick {
    display: flex; align-items: center; gap: 6px; font-size: 9px; font-weight: 700;
    letter-spacing: .18em; text-transform: uppercase; color: #A34A22;
    text-shadow: 0 0 5px var(--fm-ciel), 0 0 5px var(--fm-ciel), 0 0 8px var(--fm-ciel);
  }
  .vt-fm .fm-puce {
    flex: none; display: block;
    filter: drop-shadow(0 0 3px var(--fm-ciel)) drop-shadow(0 0 3px var(--fm-ciel));
  }
  .vt-fm .fm-bienv { margin-top: 9px; }
  .vt-fm .fm-bienv-t {
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px;
    color: #6E3A1C;
  }
  .vt-fm .fm-tiret {
    display: block; margin-top: 7px; width: 64px; height: 2.5px; border-radius: 2px;
    background: linear-gradient(90deg, var(--fm-verm) 0%, var(--fm-pollen) 100%);
  }
  .vt-fm .fm-name {
    margin-top: 10px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(30px, 10.6cqw, 36px); line-height: 1.02; letter-spacing: -.02em;
    color: var(--fm-bois);
  }
  .vt-fm .fm-name .vt-ent-acc { color: var(--fm-verm); }
  .vt-fm .fm-name.vt-ent-long { font-size: 24px; }
  .vt-fm .fm-verif { display: flex; align-items: center; gap: 7px; margin-top: 10px; font-size: 13px; font-weight: 700; color: var(--fm-bois); }
  .vt-fm .fm-verif-i {
    display: inline-flex; align-items: center; justify-content: center; flex: none;
    width: 17px; height: 17px; border-radius: 50%; background: var(--fm-verm);
    box-shadow: 0 0 0 1.5px var(--fm-ciel), 0 0 0 2.8px rgba(224,73,46,.4);
  }
  .vt-fm .fm-zone { display: flex; align-items: center; gap: 6px; margin-top: 7px; font-size: 12.5px; color: #7A5232; }
  .vt-fm .fm-proof-wrap { margin-top: 12px; }
  .vt-fm .fm-proof {
    display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 34px;
    padding: 9px 14px; border-radius: 13px; background: #FFFAF0;
    box-shadow: inset 0 0 0 1.5px rgba(224,73,46,.4), 0 10px 20px -16px rgba(58,36,24,.5);
  }
  .vt-fm .fm-fleur { flex: none; display: block; }
  .vt-fm .fm-proof-l { font-size: 13px; color: #6E5240; }
  .vt-fm .fm-proof-l b { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 19px; color: var(--fm-verm-d); }
  .vt-fm .fm-stars { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: #96714C; }
  /* THE SUN MEDAL — rays at 7°/18°, ivory heart set in vermilion. In the
     column, in the proof's own slot (ENTETES-K). */
  .vt-fm .fm-nouv-wrap { margin-top: 14px; }
  .vt-fm .fm-nouv {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 94px; height: 94px; transform: rotate(-3deg);
  }
  .vt-fm .fm-medaille {
    position: absolute; inset: 0; border-radius: 50%;
    background: repeating-conic-gradient(from 0deg, var(--fm-pollen) 0 7deg, #FFF6E2 7deg 18deg);
  }
  .vt-fm .fm-coeur {
    position: relative; display: flex; align-items: center; justify-content: center;
    width: 66px; height: 66px; border-radius: 50%; background: #FFFAF0;
    box-shadow: 0 0 0 2.5px var(--fm-verm);
  }
  .vt-fm .fm-nouv-t {
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 12px;
    line-height: 1.15; text-align: center; color: var(--fm-verm-d); max-width: 54px;
  }
  .vt-fm .fm-trust {
    display: flex; align-items: stretch; padding: 13px 4px; background: var(--fm-rangee);
  }
  .vt-fm .fm-cell {
    flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 0 6px; text-align: center;
  }
  .vt-fm .fm-cell + .fm-cell { border-left: 1px solid rgba(255,239,203,.22); }
  .vt-fm .fm-cell-i {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: #FFF3DC;
  }
  .vt-fm .fm-cell-l { font-size: 11.5px; font-weight: 700; line-height: 1.2; color: #FFF3DC; }
  .vt-fm .fm-cell-s { font-size: 10px; line-height: 1.2; color: var(--fm-sous); }
  .vt-fm .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-fm .fm-hero { padding: 74px 12px 20px; }
    .vt-fm .fm-canopee { left: 0; }
    /* 132 at right 10 ⇒ the ring owns past x=178, and the column stops at 164. */
    .vt-fm .fm-anneau-wrap { top: 116px; right: 10px; width: 132px; height: 132px; }
    .vt-fm .fm-col { width: calc(100% - 140px); min-height: 208px; }
    .vt-fm .fm-name { font-size: clamp(26px, 10.6cqw, 30px); }
    .vt-fm .fm-name.vt-ent-long { font-size: 22px; }
    .vt-fm .fm-mono { font-size: 48px; }
    .vt-fm .fm-bienv-t { font-size: 16px; }
    .vt-fm .fm-trust { padding: 11px 2px; }
    .vt-fm .fm-cell { padding: 0 4px; gap: 5px; }
    .vt-fm .fm-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
