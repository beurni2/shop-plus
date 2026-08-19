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
 * ENTETES-H · SÉRIE 5 — 29 · CALEBASSE — « le bol du marché comme écrin ».
 *
 * SOURCE OF TRUTH: the id="calebasse" block of « En-tetes Boutique - Serie 5 »
 * and its « Relevé — Calebasse ». Origine: création originale — aucune image
 * source.
 *
 * PYROGRAPHY ON A GOURD. The ground is the calabash itself — warm amber — and
 * every ornament is a BURN, not a print: two engraved bands (vertical dashes
 * under a solid filet at the top, crossed chevrons at the foot), two clouds of
 * scorched dots, and a seed-vine at the head of the column. All of it is CSS
 * gradients and one SVG, so it costs no image request on a patchy connection.
 *
 * THE BOWL IS THE FRAME: a 160 circle in a triple rim — rebord 4, cream 2.5,
 * brown .45 — with three seeds resting under it. Its MINIMAL face is not a flat
 * panel but the same engraving carried onto the empty bowl, cream monogram
 * over chevrons, so a shop with no photograph still looks made rather than
 * unfinished.
 *
 * THE COLUMN CLEARS THE BOWL BY ARITHMETIC — the lesson Bronze cost. The
 * relevé's « calc(100% − 152px) » is measured against the full width; the
 * column's containing block is the hero's PADDED box, so the number is
 * restated here against the real geometry rather than copied.
 *
 * The accent word is CREAM with a one-pixel brown shadow — the relevé's
 * « l'entaille claire dans l'écorce », the pale cut a hot point leaves in bark.
 *
 * Verified seal on its own line (série 4/5 convention). Bio not drawn.
 * Split column ⇒ the série 5 tier of 24px.
 */

/** The seed-vine at the head of the column — one curve, two seeds. */
const liane = (): string =>
  '<svg class="cb-liane" aria-hidden="true" width="62" height="26" viewBox="0 0 62 26">' +
  '<path d="M2 22C14 22 20 14 28 8c6-4.5 14-6 32-6" fill="none" stroke="#4E3416" stroke-width="2" stroke-linecap="round"/>' +
  '<ellipse cx="22" cy="17" rx="5" ry="6.5" fill="#8A5A20"/>' +
  '<ellipse cx="37" cy="8" rx="4.5" ry="6" fill="#8A5A20"/></svg>';

/** The three seeds resting under the bowl. */
const graines = (): string =>
  '<svg class="cb-graines" aria-hidden="true" width="66" height="20" viewBox="0 0 66 20">' +
  '<ellipse cx="12" cy="12" rx="9" ry="6.5" fill="#8A5A20" transform="rotate(-14 12 12)"/>' +
  '<ellipse cx="33" cy="9" rx="9" ry="6.5" fill="#5C3A14" transform="rotate(6 33 9)"/>' +
  '<ellipse cx="54" cy="13" rx="9" ry="6.5" fill="#8A5A20" transform="rotate(-8 54 13)"/></svg>';

/** The dotted string of the market label — hangs from its eyelet. */
const ficelle = (): string =>
  '<svg class="cb-ficelle" aria-hidden="true" width="34" height="16" viewBox="0 0 34 16">' +
  '<path d="M1 3C9 12 20 14 33 9" fill="none" stroke="#8A5A20" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="2 3.5"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="cb-cell"><span class="cb-cell-i">${icon}</span><span class="cb-cell-l">${label}</span><span class="cb-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-cb" data-role="vitrine-hero">',
    '<div class="cb-hero">',
    '<span class="cb-band-t" aria-hidden="true"></span>',
    '<span class="cb-band-b" aria-hidden="true"></span>',
    '<span class="cb-pois-a" aria-hidden="true"></span>',
    '<span class="cb-pois-b" aria-hidden="true"></span>',
    // the bowl — a circle in a triple rim, three seeds resting under it
    '<div class="cb-photo-wrap">',
    `<div class="cb-photo" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 26%')
      : `<div class="cb-motif"><span class="cb-mono">${v.mono}</span></div>`,
    '</div>',
    graines(),
    '</div>',
    '<div class="cb-col" data-role="vitrine-identity">',
    liane(),
    v.hasTag ? `<div class="cb-bienv"><span class="cb-bienv-t"><v>${v.tagline}</v></span></div>` : '',
    `<div class="cb-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="cb-verif"><span class="cb-verif-i">${iconCheckEnt(9, '#FFF6E3', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="cb-zone">${iconPinEnt(12, '#5C3A14', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="cb-proof-wrap"><span class="cb-proof"><span class="cb-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="cb-stars" data-role="chip-avis">${iconStarEnt(10, '#C08A38')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="cb-nouv-wrap">${ficelle()}<span class="cb-nouv" data-role="chip-nouvelle"><span class="cb-oeillet" aria-hidden="true"></span><span class="cb-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="cb-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#4E3416', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#4E3416', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#4E3416', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'cb', '#4E3416'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 29 · CALEBASSE (série 5) ══════════════════════
     Relevé — ambre calebasse #D9A24E vers #C08A38 (motif MINIMAL #B37E2E) ·
     brun brûlé #4E3416 / #5C3A14 / #3E2A10 · rebord #8A5A20 · crème #FFF6E3 ·
     sable #E8C287. */
  .vt-cb {
    --cb-ambre: #D9A24E; --cb-ambre-2: #C08A38; --cb-motif: #B37E2E;
    --cb-brun: #4E3416; --cb-brun-2: #5C3A14; --cb-brun-3: #3E2A10;
    --cb-rebord: #8A5A20; --cb-creme: #FFF6E3; --cb-sable: #E8C287;
    background: var(--cb-ambre-2);
  }
  /* padding-top 74 = the relevé's 14 + the shell's 60 status pad */
  .vt-cb .cb-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 18px;
    background: linear-gradient(168deg, var(--cb-ambre) 0%, var(--cb-ambre-2) 100%);
  }
  /* GRAVURE AU FEU — two engraved bands, both pure gradient. Top: vertical
     dashes at .5 under a solid filet. Foot: chevrons crossed at .55, drawn as
     two opposed repeating gradients so they read as a woven burn. */
  .vt-cb .cb-band-t {
    position: absolute; left: 0; right: 0; top: 60px; height: 13px;
    background-image:
      linear-gradient(180deg, rgba(78,52,22,.85) 0 1.5px, transparent 1.5px),
      repeating-linear-gradient(90deg, rgba(78,52,22,.5) 0 1.5px, transparent 1.5px 9px);
  }
  .vt-cb .cb-band-b {
    position: absolute; left: 0; right: 0; bottom: 0; height: 16px;
    background-image:
      repeating-linear-gradient(56deg, rgba(78,52,22,.55) 0 1.5px, transparent 1.5px 11px),
      repeating-linear-gradient(-56deg, rgba(78,52,22,.55) 0 1.5px, transparent 1.5px 11px);
  }
  .vt-cb .cb-pois-a, .vt-cb .cb-pois-b {
    position: absolute; background-image: radial-gradient(circle, rgba(62,42,16,.42) 1.4px, transparent 1.7px);
    background-size: 12px 12px;
  }
  .vt-cb .cb-pois-a { left: 10px; bottom: 44px; width: 96px; height: 60px; }
  /* the second cloud lives in the band beside the vine and ABOVE the tagline —
     at 82 it scattered dots behind « Bienvenue chez moi » */
  .vt-cb .cb-pois-b { right: 152px; top: 74px; width: 62px; height: 30px; }
  /* THE BOWL — a circle in a triple rim, the seeds resting under it.
     THE RIM IS 7.5px OUTSIDE the circle and it is drawn with box-shadow, which
     no layout box accounts for: the relevé's 160 at right 8 put the outer rim
     at 359.5 of 360, so the hero's overflow shaved it. 150 at right 10 leaves
     it 4.5px of air, and the column's clearance is measured from the RIM.
     Top 116, not 100: at 100 the circle ran under the two controls (70..114). */
  .vt-cb .cb-photo-wrap { position: absolute; top: 116px; right: 10px; width: 150px; height: 182px; }
  .vt-cb .cb-photo {
    position: absolute; left: 0; top: 0; width: 150px; height: 150px;
    border-radius: 50%; overflow: hidden;
    box-shadow: 0 0 0 4px var(--cb-rebord), 0 0 0 6.5px var(--cb-creme), 0 0 0 7.5px rgba(78,52,22,.45);
  }
  .vt-cb .cb-photo .vt-avatar-img { object-position: 50% 26%; }
  /* MINIMAL — the engraving carried onto the empty bowl, never a flat panel */
  .vt-cb .cb-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--cb-motif);
    background-image:
      repeating-linear-gradient(56deg, rgba(78,52,22,.5) 0 1.5px, transparent 1.5px 12px),
      repeating-linear-gradient(-56deg, rgba(78,52,22,.5) 0 1.5px, transparent 1.5px 12px);
  }
  .vt-cb .cb-mono {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 58px; line-height: 1; color: var(--cb-creme); text-shadow: 0 2px 0 rgba(62,42,16,.45);
  }
  .vt-cb .cb-graines { position: absolute; left: 42px; top: 158px; display: block; }
  /* THE COLUMN CLEARS THE BOWL: the circle sits at right 10 and is 150 wide,
     and its rim reaches 7.5px further, so the bowl owns everything past
     x=192.5. 100% here is the hero's PADDED box (332 at 360) — 168 off it,
     indented 6, lands the right edge at 184. */
  .vt-cb .cb-col { position: relative; margin-left: 6px; width: calc(100% - 168px); min-height: 246px; }
  .vt-cb .cb-liane { display: block; }
  .vt-cb .cb-bienv { margin-top: 5px; }
  .vt-cb .cb-bienv-t {
    display: inline-block; padding-bottom: 4px;
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px;
    color: var(--cb-brun); border-bottom: 1.5px dotted rgba(78,52,22,.6);
  }
  .vt-cb .cb-name {
    margin-top: 8px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.05; letter-spacing: -.015em;
    color: var(--cb-brun); overflow-wrap: break-word;
  }
  /* série 5's split columns take 24px (Karité alone takes 20) */
  .vt-cb .cb-name.vt-ent-long { font-size: 24px; }
  /* the pale cut a hot point leaves in bark: cream over a one-pixel brown */
  .vt-cb .cb-name .vt-ent-acc { color: var(--cb-creme); text-shadow: 0 1px 0 rgba(62,42,16,.6); }
  .vt-cb .cb-verif { margin-top: 11px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--cb-brun); }
  .vt-cb .cb-verif-i {
    width: 15px; height: 15px; flex: none; border-radius: 50%; background: var(--cb-rebord);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-cb .cb-zone { margin-top: 6px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--cb-brun-2); }
  .vt-cb .cb-zone svg { vertical-align: -2px; margin-right: 5px; }
  /* COMPLET — a cream card, the count in the rim's own brown */
  .vt-cb .cb-proof-wrap { margin-top: 12px; }
  .vt-cb .cb-proof {
    display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 9px 13px; border-radius: 14px; background: var(--cb-creme);
    box-shadow: 0 3px 0 rgba(78,52,22,.22);
  }
  .vt-cb .cb-proof-l { font-size: 11px; line-height: 1.35; color: var(--cb-brun); }
  .vt-cb .cb-proof-l b {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif;
    font-weight: 800; font-size: 19px; color: var(--cb-rebord);
  }
  .vt-cb .cb-stars { font-size: 10.5px; font-weight: 700; color: var(--cb-ambre-2); white-space: nowrap; }
  .vt-cb .cb-stars svg { vertical-align: -1px; margin-right: 3px; }
  /* MINIMAL — a market label on a dotted string, tilted two degrees */
  .vt-cb .cb-nouv-wrap { margin-top: 12px; }
  .vt-cb .cb-ficelle { display: block; margin-left: 16px; }
  .vt-cb .cb-nouv {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 9px 14px 9px 11px; border-radius: 6px; background: var(--cb-creme);
    transform: rotate(2deg); box-shadow: 0 3px 0 rgba(78,52,22,.22);
  }
  .vt-cb .cb-oeillet {
    width: 13px; height: 13px; flex: none; border-radius: 50%;
    background: var(--cb-ambre); box-shadow: inset 0 0 0 2px var(--cb-rebord);
  }
  .vt-cb .cb-nouv-t {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif;
    font-weight: 800; font-size: 12.5px; color: var(--cb-brun);
  }
  .vt-cb .cb-trust {
    position: relative; padding: 12px 3px; background: var(--cb-brun);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-cb .cb-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-cb .cb-cell + .cb-cell { border-left: 1px solid rgba(232,194,135,.24); }
  .vt-cb .cb-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--cb-ambre);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-cb .cb-cell-l { font-size: 9.5px; font-weight: 800; line-height: 1.28; color: var(--cb-creme); }
  .vt-cb .cb-cell-s { font-size: 8px; line-height: 1.25; color: var(--cb-sable); }
  .vt-cb .cb-btn { background: rgba(255,246,227,.88); box-shadow: inset 0 0 0 1px rgba(138,90,32,.55); }
  .vt-cb .vt-ent-btn { top: 70px; }
  .vt-cb .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-cb .cb-hero { padding: 74px 12px 16px; }
    .vt-cb .cb-photo-wrap { top: 112px; right: 12px; width: 128px; height: 156px; }
    .vt-cb .cb-photo { width: 128px; height: 128px; }
    .vt-cb .cb-graines { left: 31px; top: 134px; }
    /* same arithmetic at 320: bowl at right 12, 128 wide, rim 7.5 further out
       ⇒ it owns past x=172.5, and the column stops at 164 */
    .vt-cb .cb-col { margin-left: 6px; width: calc(100% - 150px); min-height: 228px; }
    .vt-cb .cb-name { font-size: clamp(23px, 9.4cqw, 28px); }
    .vt-cb .cb-name.vt-ent-long { font-size: 21px; }
    .vt-cb .cb-mono { font-size: 50px; }
    .vt-cb .cb-bienv-t { font-size: 16px; }
    .vt-cb .cb-pois-b { right: 132px; top: 74px; width: 52px; height: 30px; }
    .vt-cb .cb-trust { padding: 11px 2px; }
    .vt-cb .cb-cell { padding: 0 4px; gap: 5px; }
    .vt-cb .cb-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
