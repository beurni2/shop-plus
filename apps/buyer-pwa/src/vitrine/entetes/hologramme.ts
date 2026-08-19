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
 * ENTETES-L · SÉRIE 9 — 48 · HOLOGRAMME — « la carte de collection ».
 *
 * SOURCE OF TRUTH: the id="hologramme" block of « En-tetes Boutique - Serie 9 »
 * and its « Relevé — Hologramme ». Origine: création originale.
 *
 * A COLLECTOR CARD, and the iridescence is honest CSS: one `conic-gradient`
 * carrying the five-hue spectrum, crossed by a linear sheen. No filter, no
 * animation — a hologram that moved would be a lie about a printed card, and on
 * a 1GB Android it would also be a dropped frame.
 *
 * THE EMBOSSING IS THE DETAIL WORTH KEEPING. The kicker and the wordmark are
 * struck in the GROUND'S OWN COLOUR, then given a light edge above and a dark
 * one below — the way a card press raises a letter without ink. Read at a
 * glance it is texture; read closely it is text.
 *
 * The seal is a spectral conic pill, the proof is led by an engraved gold chip,
 * and MINIMAL is a round holographic sticker — IN THE COLUMN, never over her
 * portrait (ENTETES-K).
 *
 * Verified seal on its own line. Bio not drawn. 24px tier past 14 characters.
 */

/** The card's gold chip — frame and engraved contacts. */
const puce = (): string =>
  '<svg class="ho-puce" aria-hidden="true" width="26" height="20" viewBox="0 0 26 20" fill="none" stroke="#D9A93F">' +
  '<rect x="1" y="1" width="24" height="18" rx="3" stroke-width="1.6"/>' +
  '<path d="M1 7h7M18 7h7M1 13h7M18 13h7M9 1v18M17 1v18" stroke-width="1.3"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="ho-cell"><span class="ho-cell-i">${icon}</span><span class="ho-cell-l">${label}</span><span class="ho-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-ho" data-role="vitrine-hero">',
    '<div class="ho-hero">',
    '<span class="ho-perf" aria-hidden="true"></span>',
    '<span class="ho-bande" aria-hidden="true"></span>',
    '<span class="ho-disque" aria-hidden="true"></span>',
    `<span class="ho-gaufre ho-gaufre--k" aria-hidden="true"><v>${t('vit.ho_kicker')}</v></span>`,
    '<span class="ho-gaufre ho-gaufre--m" aria-hidden="true">Séra</span>',
    // the portrait in its iridescent crown
    '<div class="ho-anneau-wrap">',
    `<div class="ho-anneau" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 26%')
      : `<div class="ho-motif"><span class="ho-mono">${v.mono}</span></div>`,
    '</div>',
    '<span class="ho-eclat" aria-hidden="true"></span>',
    '</div>',
    '<div class="ho-col" data-role="vitrine-identity">',
    `<div class="ho-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    v.hasTag
      ? `<div class="ho-bienv"><span class="ho-bienv-t"><v>${v.tagline}</v></span><span class="ho-spectre" aria-hidden="true"></span></div>`
      : '',
    `<div class="ho-verif"><span class="ho-verif-i">${iconCheckEnt(9, '#17171E', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="ho-zone">${iconPinEnt(12, '#B9AAE8', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="ho-proof-wrap"><span class="ho-proof">${puce()}<span class="ho-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="ho-stars" data-role="chip-avis">${iconStarEnt(10, '#F2E3A0')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="ho-nouv-wrap"><span class="ho-nouv" data-role="chip-nouvelle"><span class="ho-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="ho-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#17171E', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#17171E', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#17171E', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'ho', '#ECECF4'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 48 · HOLOGRAMME (série 9) ══════════════════════
     Relevé — graphite #1B1B22 / #141419 / #17171E (rangee #0C0C10, chip
     #1E1E26) · spectre #B8A6F2 / #8FD0E8 / #A8E8C0 / #F2E3A0 / #F2B8C6 ·
     lilas #B9AAE8 · nacre #ECECF4 / #C9CBE8 · or de puce #D9A93F. */
  .vt-ho {
    --ho-g1: #1B1B22; --ho-g2: #141419; --ho-g3: #17171E; --ho-rangee: #0C0C10; --ho-chip: #1E1E26;
    --ho-lilas: #B9AAE8; --ho-nacre: #ECECF4; --ho-nacre-2: #C9CBE8;
    --ho-or: #D9A93F; --ho-sous: #8F93B8; --ho-jaune: #F2E3A0;
    background: var(--ho-g2);
  }
  /* padding-top 74 = the relevé's 14 + the shell's 60 status pad */
  .vt-ho .ho-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 58px;
    background-color: var(--ho-g2);
    background-image: linear-gradient(158deg, var(--ho-g1) 0%, var(--ho-g2) 56%, var(--ho-g3) 100%);
  }
  .vt-ho .ho-perf {
    position: absolute; inset: 0;
    background-image: radial-gradient(circle, rgba(236,236,244,.05) 1px, transparent 1.3px);
    background-size: 12px 12px;
  }
  /* the holographic band: one conic spectrum, crossed by a linear sheen */
  .vt-ho .ho-bande {
    position: absolute; right: 56px; top: -30px; bottom: -30px; width: 54px; transform: rotate(8deg);
    background-image:
      linear-gradient(12deg, transparent 30%, rgba(255,255,255,.5) 50%, transparent 70%),
      linear-gradient(180deg, rgba(184,166,242,.5) 0%, rgba(143,208,232,.5) 26%, rgba(168,232,192,.5) 50%, rgba(242,227,160,.5) 74%, rgba(242,184,198,.5) 100%);
  }
  .vt-ho .ho-disque {
    position: absolute; left: -60px; bottom: -54px; width: 190px; height: 190px; border-radius: 50%;
    background-image: conic-gradient(#B8A6F2, #8FD0E8, #A8E8C0, #F2E3A0, #F2B8C6, #B8A6F2);
    opacity: .16;
  }
  /* THE EMBOSSING — struck in the ground's own colour, lit above, shadowed
     below. That pair of one-pixel shadows is the entire illusion. */
  .vt-ho .ho-gaufre {
    position: absolute; font-weight: 800; color: #101014;
    text-shadow: 0 1px 0 rgba(255,255,255,.18), 0 -1px 0 rgba(0,0,0,.55);
  }
  .vt-ho .ho-gaufre--k { left: 14px; top: 76px; font-size: 9px; letter-spacing: .3em; text-transform: uppercase; }
  .vt-ho .ho-gaufre--m { right: 16px; bottom: 16px; font-size: 15px; letter-spacing: .34em; text-transform: uppercase; }
  /* THE IRIDESCENT CROWN. The conic ring and its lilac glow reach ~10px past
     the circle, so the column clears the CROWN (x=190 at 360), not the 144. */
  .vt-ho .ho-anneau-wrap { position: absolute; top: 122px; right: 16px; width: 144px; height: 144px; }
  .vt-ho .ho-anneau {
    position: absolute; inset: 0; border-radius: 50%; overflow: hidden;
    box-shadow:
      0 0 0 3.5px var(--ho-g3),
      0 0 0 10px rgba(184,166,242,.9),
      0 0 22px rgba(185,170,232,.5);
  }
  .vt-ho .ho-anneau .vt-avatar-img { object-position: 50% 26%; }
  .vt-ho .ho-eclat {
    position: absolute; inset: -10px; border-radius: 50%; pointer-events: none;
    background-image: linear-gradient(150deg, transparent 38%, rgba(255,255,255,.55) 50%, transparent 62%);
  }
  .vt-ho .ho-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: #17171E;
    background-image: conic-gradient(rgba(184,166,242,.3), rgba(143,208,232,.3), rgba(168,232,192,.3), rgba(242,227,160,.3), rgba(242,184,198,.3), rgba(184,166,242,.3));
  }
  .vt-ho .ho-mono { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 54px; color: var(--ho-nacre); }
  /* the column starts under the embossed kicker (the relevé's margin-top 16) */
  .vt-ho .ho-col { position: relative; margin-top: 16px; width: calc(100% - 176px); min-height: 232px; }
  .vt-ho .ho-name {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.05; letter-spacing: -.015em;
    color: var(--ho-nacre); overflow-wrap: break-word;
  }
  .vt-ho .ho-name.vt-ent-long { font-size: 24px; }
  .vt-ho .ho-name .vt-ent-acc { color: var(--ho-lilas); }
  .vt-ho .ho-bienv { margin-top: 8px; }
  .vt-ho .ho-bienv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px; color: var(--ho-nacre); }
  .vt-ho .ho-spectre {
    display: block; margin-top: 6px; width: 64px; height: 2.5px;
    background-image: linear-gradient(90deg, #B8A6F2 0%, #8FD0E8 26%, #A8E8C0 50%, #F2E3A0 74%, #F2B8C6 100%);
  }
  .vt-ho .ho-verif { margin-top: 11px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--ho-nacre); }
  /* the seal is a spectral conic pill with a graphite check */
  .vt-ho .ho-verif-i {
    width: 15px; height: 15px; flex: none; border-radius: 50%;
    background-image: conic-gradient(#B8A6F2, #8FD0E8, #A8E8C0, #F2E3A0, #F2B8C6, #B8A6F2);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ho .ho-zone { margin-top: 6px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--ho-sous); }
  .vt-ho .ho-zone svg { vertical-align: -2px; margin-right: 5px; }
  /* COMPLET — the card-pill, led by the gold chip */
  .vt-ho .ho-proof-wrap { margin-top: 12px; }
  .vt-ho .ho-proof {
    display: inline-flex; align-items: center; gap: 9px; flex-wrap: wrap;
    padding: 9px 14px; border-radius: 8px; background: var(--ho-chip);
    box-shadow: inset 0 0 0 1px rgba(236,236,244,.4);
  }
  .vt-ho .ho-puce { flex: none; }
  .vt-ho .ho-proof-l { font-size: 11px; line-height: 1.35; color: var(--ho-nacre-2); }
  .vt-ho .ho-proof-l b {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif;
    font-weight: 800; font-size: 19px; color: var(--ho-nacre);
  }
  .vt-ho .ho-stars { font-size: 10.5px; font-weight: 700; color: var(--ho-jaune); white-space: nowrap; }
  .vt-ho .ho-stars svg { vertical-align: -1px; margin-right: 3px; }
  /* MINIMAL — the holographic sticker, IN THE COLUMN */
  .vt-ho .ho-nouv-wrap { margin-top: 13px; }
  .vt-ho .ho-nouv {
    display: inline-flex; align-items: center; justify-content: center; text-align: center;
    width: 92px; height: 92px; border-radius: 50%; padding: 10px; transform: rotate(-3deg);
    background-image:
      linear-gradient(140deg, transparent 34%, rgba(255,255,255,.5) 50%, transparent 66%),
      conic-gradient(#B8A6F2, #8FD0E8, #A8E8C0, #F2E3A0, #F2B8C6, #B8A6F2);
    box-shadow: inset 0 0 0 4px rgba(255,255,255,.75), 0 12px 26px -14px rgba(0,0,0,.9);
  }
  .vt-ho .ho-nouv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 12.5px; line-height: 1.2; color: #17171C; }
  .vt-ho .ho-trust {
    position: relative; padding: 12px 3px; background: var(--ho-rangee);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-ho .ho-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-ho .ho-cell + .ho-cell { border-left: 1px solid rgba(236,236,244,.25); }
  .vt-ho .ho-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--ho-nacre);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ho .ho-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: var(--ho-nacre); }
  .vt-ho .ho-cell-s { font-size: 8px; line-height: 1.25; color: var(--ho-sous); }
  .vt-ho .ho-btn { background: rgba(16,16,20,.85); box-shadow: inset 0 0 0 1px rgba(185,170,232,.6); }
  .vt-ho .vt-ent-btn { top: 70px; }
  .vt-ho .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-ho .ho-hero { padding: 74px 12px 54px; }
    .vt-ho .ho-anneau-wrap { top: 118px; right: 12px; width: 126px; height: 126px; }
    /* same arithmetic at 320: circle at right 12, 126 wide, crown 10 further
       ⇒ it owns past x=172, and the column stops at 156 */
    .vt-ho .ho-col { width: calc(100% - 156px); min-height: 214px; }
    .vt-ho .ho-name { font-size: clamp(23px, 9.4cqw, 28px); }
    .vt-ho .ho-name.vt-ent-long { font-size: 21px; }
    .vt-ho .ho-mono { font-size: 46px; }
    .vt-ho .ho-bienv-t { font-size: 16px; }
    .vt-ho .ho-bande { right: 44px; width: 46px; }
    .vt-ho .ho-gaufre--m { font-size: 13px; }
    .vt-ho .ho-trust { padding: 11px 2px; }
    .vt-ho .ho-cell { padding: 0 4px; gap: 5px; }
    .vt-ho .ho-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
