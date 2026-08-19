import { t } from '../../i18n';
import { iconCheckEnt, iconLockEnt, iconPinSolid, iconShieldEnt, iconStarEnt, iconTagEnt } from '../icons';
import {
  avisChip,
  controls,
  etatPhoto,
  framePhoto,
  hasPhoto,
  ventesLine,
  weldSeal,
  zoneLine,
  type Vals,
} from '../entetes';
import type { EnteteUnit } from './registry';

/**
 * ENTETES-H · SÉRIE 3 — 19 · BRAISE — « charbon & disque solaire corail ».
 *
 * SOURCE OF TRUTH: the id="braise" block of « En-tetes Boutique - Serie 3 »
 * and its « Relevé — Braise ».
 *
 * A SUN SETTING BEHIND HER. A 236px coral disc rises off the right edge and her
 * photograph — a 172px circle ringed in charcoal — sits on it, offset. That
 * offset is the whole composition: the two circles must not be concentric.
 *
 * The relevé's named deviation, carried as written: the board's cut-out figure
 * becomes a photograph in a circle laid on the disc.
 *
 * PAINT ORDER IS EXPLICIT HERE, and that is deliberate after Artisan: the
 * decorative disc, the dot grid and the wire circle are all absolutely
 * positioned, so every content row that shares their band carries
 * `position: relative`. Artisan lost a word to exactly this and it took three
 * measurements to find; on this style it is designed in rather than debugged
 * out.
 *
 * SPLIT COLUMN, so the > 14 chars → 20px tier applies.
 *
 * Bio not drawn — and since ENTETES-N retired Artisan, no série 3 style
 * shows a présentation at all.
 */

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="br-cell"><span class="br-cell-i">${icon}</span><span class="br-cell-l">${label}</span><span class="br-cell-s">${sub}</span><span class="br-tiret" aria-hidden="true"></span></div>`;
  return [
    '<div class="vt-ent vt-br" data-role="vitrine-hero">',
    '<div class="br-hero">',
    '<span class="br-disque" aria-hidden="true"></span>',
    '<span class="br-pois" aria-hidden="true"></span>',
    '<span class="br-anneau" aria-hidden="true"></span>',
    // her photograph, ringed in charcoal, laid OFF-CENTRE on the disc
    `<div class="br-cercle" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '46% 28%')
      : `<div class="br-motif"><span class="br-mono">${v.mono}</span></div>`,
    '</div>',
    '<div class="br-col" data-role="vitrine-identity">',
    v.hasTag
      ? `<div class="br-bienv"><span class="br-bienv-t"><v>${v.tagline}</v></span><span class="br-virgule" aria-hidden="true"></span></div>`
      : '',
    `<div class="br-name${v.longName ? ' vt-ent-long' : ''}">${weldSeal(v.tail, `<span class="br-seal" aria-hidden="true">${iconCheckEnt(12, '#FFFFFF', 3.4)}</span>`)}</div>`,
    `<div class="br-zone-wrap"><span class="br-zone">${zoneLine(v, iconPinSolid(11, '#F0532D', '#17181A'))}</span></div>`,
    v.showProof
      ? `<div class="br-proof"><span class="br-chip" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="br-stars" data-role="chip-avis">${iconStarEnt(11, '#FF8F70')}${avisChip(v)}</span>`
            : ''
        }</div>`
      : '',
    v.nouvelle
      ? `<div class="br-nouv-wrap"><span class="br-nouv" data-role="chip-nouvelle"><span class="br-nouv-i">${iconStarEnt(14, '#F0532D')}</span><span class="br-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '<div class="br-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#F0532D', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#F0532D', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#F0532D', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    '</div>',
    controls(v, 'br', '#F4E9DC'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 19 · BRAISE (série 3) ══════════════════════
     Relevé — charbon #17181A (chips #1F2023, motif #26272B) · corail #F0532D /
     #FF6B47 / #FF7B57 (disque → #D8431F) · crème #F4E9DC · titres #FAFAF8 ·
     textes #C9C6C0 / #EDEDEF / #8C8072 · séparateur #E5D5C2. */
  .vt-br {
    --br-charbon: #17181A; --br-chip: #1F2023; --br-motif: #26272B;
    --br-corail: #F0532D; --br-corail-2: #FF6B47; --br-corail-3: #FF7B57; --br-corail-4: #D8431F;
    --br-creme: #F4E9DC; --br-titre: #FAFAF8;
    --br-t1: #C9C6C0; --br-t2: #EDEDEF; --br-t3: #8C8072; --br-sep: #E5D5C2;
    background: var(--br-charbon);
  }
  /* padding-top 74 = the relevé's 14 + the shell's 60 status pad */
  .vt-br .br-hero { position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 14px; background: var(--br-charbon); }
  /* THE SUN — relevé top 34, + 60 for the status pad */
  .vt-br .br-disque {
    position: absolute; top: 94px; right: -64px; width: 236px; height: 236px; border-radius: 50%;
    background: radial-gradient(circle at 38% 32%, var(--br-corail-3) 0%, var(--br-corail) 55%, var(--br-corail-4) 100%);
  }
  .vt-br .br-pois {
    position: absolute; left: 12px; bottom: 118px; width: 60px; height: 44px;
    background-image: radial-gradient(circle, rgba(240,83,45,.4) 1.4px, transparent 1.8px);
    background-size: 11px 11px;
  }
  .vt-br .br-anneau {
    position: absolute; left: -46px; top: 150px; width: 150px; height: 150px; border-radius: 50%;
    border: 1.5px solid rgba(240,83,45,.25);
  }
  /* HER PHOTOGRAPH, laid on the disc OFF-CENTRE — the two circles must never
     be concentric; the offset is the composition. */
  .vt-br .br-cercle {
    position: absolute; top: 128px; right: -26px; width: 172px; height: 172px;
    border-radius: 50%; overflow: hidden; box-shadow: 0 0 0 4px var(--br-charbon);
  }
  .vt-br .br-cercle .vt-avatar-img { object-position: 46% 28%; }
  .vt-br .br-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--br-motif);
    background-image: radial-gradient(circle, rgba(240,83,45,.5) 2px, transparent 2.4px);
    background-size: 16px 16px;
  }
  .vt-br .br-mono {
    margin-right: 24px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 60px; line-height: 1; color: rgba(240,83,45,.5);
  }
  /* every content row is RAISED above the decorative absolutes — designed in,
     not debugged out (see the docblock: Artisan lost a word to this) */
  .vt-br .br-col { position: relative; width: calc(100% - 130px); }
  .vt-br .br-bienv { position: relative; display: inline-block; }
  .vt-br .br-bienv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 16px; color: var(--br-corail); }
  .vt-br .br-virgule { display: block; width: 26px; height: 3px; margin-top: 3px; background: var(--br-corail); transform: skew(-30deg); }
  .vt-br .br-name {
    margin-top: 9px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(24px, 8.4cqw, 29px); line-height: 1.05; letter-spacing: -.02em;
    color: var(--br-titre); overflow-wrap: break-word;
  }
  /* split column ⇒ the fixed tier applies */
  .vt-br .br-name.vt-ent-long { font-size: 20px; }
  .vt-br .br-name .vt-ent-acc { color: var(--br-corail); }
  .vt-br .br-seal {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 50%; margin-left: 7px; vertical-align: -3px;
    background: linear-gradient(140deg, var(--br-corail-2), var(--br-corail-4));
  }
  .vt-br .br-zone-wrap { position: relative; margin-top: 9px; }
  /* INLINE-BLOCK for the same reason as the proof chip. zoneLine emits the pin
     and « Vendeuse vérifiée · {zone} » as sibling inline nodes; as flex items
     they became two columns that each wrapped on their own, so the pill read
     « Vendeuse / vérifiée · » beside « Gounghin, / Ouagadougou ». It is one
     sentence and it wraps like one. */
  .vt-br .br-zone {
    display: inline-block; padding: 6px 12px;
    border-radius: 99px; background: rgba(255,255,255,.06);
    box-shadow: inset 0 0 0 1px rgba(240,83,45,.4);
    font-size: 10.5px; font-weight: 600; line-height: 1.4; color: var(--br-t2);
  }
  .vt-br .br-zone svg { vertical-align: -2px; margin-right: 5px; }
  .vt-br .br-proof { position: relative; margin-top: 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  /* INLINE-BLOCK, NOT INLINE-FLEX. ventesLine emits « <b>128</b> ventes
     livrées par Séra » — in a flex container the <b> and the text become two
     flex items and the space BETWEEN them is stripped, rendering « 128ventes ».
     Couture's dateline lost its spacing the same way. Inline text flow keeps
     the sentence a sentence. */
  .vt-br .br-chip {
    display: inline-block; padding: 5px 10px; border-radius: 8px;
    background: var(--br-corail); font-size: 11px; line-height: 1.3; color: var(--br-t1);
  }
  .vt-br .br-chip b {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 13px; color: #FFFFFF;
  }
  .vt-br .br-stars { font-size: 11px; font-weight: 600; color: #FF8F70; white-space: nowrap; }
  .vt-br .br-stars svg { vertical-align: -1.5px; margin-right: 3px; }
  /* MINIMAL — the skewed coral banner; the inner pieces counter-skew */
  .vt-br .br-nouv-wrap { position: relative; margin-top: 12px; }
  .vt-br .br-nouv {
    display: inline-flex; align-items: center; gap: 9px; min-height: 42px; padding: 5px 16px 5px 6px;
    border-radius: 8px; transform: skew(-6deg);
    background: linear-gradient(115deg, var(--br-corail-2), var(--br-corail-4));
  }
  .vt-br .br-nouv-i {
    width: 30px; height: 30px; flex: none; border-radius: 50%; background: var(--br-charbon);
    display: flex; align-items: center; justify-content: center; transform: skew(6deg);
  }
  .vt-br .br-nouv-t {
    transform: skew(6deg);
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic;
    text-transform: uppercase; font-size: 12.5px; line-height: 1.2; color: #FFFFFF;
  }
  .vt-br .br-trust {
    position: relative; margin-top: 14px; padding: 12px 3px 10px; border-radius: 16px; background: var(--br-creme);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-br .br-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .vt-br .br-cell + .br-cell { border-left: 1px solid var(--br-sep); }
  .vt-br .br-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--br-charbon);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-br .br-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: var(--br-chip); }
  .vt-br .br-cell-s { font-size: 8px; line-height: 1.25; color: var(--br-t3); }
  /* the coral dash under each column — the board's signature */
  .vt-br .br-tiret { width: 18px; height: 2.5px; margin-top: 2px; border-radius: 2px; background: var(--br-corail); }
  .vt-br .br-btn { background: rgba(23,24,26,.7); box-shadow: inset 0 0 0 1px rgba(244,233,220,.35); }
  .vt-br .vt-ent-btn { top: 70px; }
  .vt-br .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-br .br-hero { padding: 74px 12px 12px; }
    .vt-br .br-disque { top: 90px; right: -76px; width: 212px; height: 212px; }
    .vt-br .br-cercle { top: 122px; right: -36px; width: 152px; height: 152px; }
    .vt-br .br-col { width: calc(100% - 108px); }
    .vt-br .br-name { font-size: clamp(21px, 8.4cqw, 26px); }
    .vt-br .br-name.vt-ent-long { font-size: 19px; }
    .vt-br .br-mono { font-size: 50px; margin-right: 20px; }
    .vt-br .br-bienv-t { font-size: 15px; }
    .vt-br .br-trust { padding: 11px 2px 9px; }
    .vt-br .br-cell { padding: 0 4px; gap: 4px; }
    .vt-br .br-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
