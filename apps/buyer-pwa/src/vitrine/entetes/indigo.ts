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
  weldSeal,
  type Vals,
} from '../entetes';
import type { EnteteUnit } from './registry';

/**
 * ENTETES-H · SÉRIE 2 — 6 · INDIGO — « nuit bleue, cyan électrique ».
 *
 * SOURCE OF TRUTH: « En-tetes Boutique - Serie 2 (standalone).html », the
 * `id="indigo"` block and its « Relevé — Indigo ». Origine: création originale
 * série 2 (aucune image source) — so unlike série 4 there is no photograph to
 * be faithful to, only the contract's own numbers.
 *
 * THE ONE STRUCTURAL DIFFERENCE FROM EVERY HEADER BUILT SO FAR, and the reason
 * this style exists: « la photo est le fond ». Her cover fills a 300px
 * full-width band; a 180° veil darkens it downward; and the identity block
 * rides −92px UP over that veil. Content lives ON the photograph, not beside
 * it. That is why this file has no split column and no `-frame` box: the frame
 * IS the header.
 *
 * THE SEAL IS WELDED TO THE NAME here (cyan 20, ink check, dashed feston),
 * exactly as série 1's royale/chaleureux/dynamique do — NOT the dedicated
 * « Vendeuse vérifiée » line série 4 uses. The two conventions coexist across
 * the set on purpose; each relevé says which it wants, and this one welds.
 *
 * SHE KEEPS HER PRÉSENTATION. Série 4's five had no bio in their visuals, so
 * `bio` went unrendered there. Indigo's relevé gives it a size and a colour
 * (« présentation 400/12/1.5 blanc .85 »), so it is drawn — and, per the
 * MINIMAL rule, removed entirely along with the accueil and the proof when she
 * has no history.
 */

const zigzag = (): string =>
  '<svg class="in-zig" aria-hidden="true" viewBox="0 0 58 8" width="58" height="8">' +
  '<path d="M1 6 L8 2 L15 6 L22 2 L29 6 L36 2 L43 6 L50 2 L57 6" fill="none" stroke="#4CC9F0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="in-cell"><span class="in-cell-i">${icon}</span><span class="in-cell-t"><span class="in-cell-l">${label}</span><span class="in-cell-s">${sub}</span></span></div>`;
  return [
    '<div class="vt-ent vt-in" data-role="vitrine-hero">',
    // « la photo est le fond » — 300px full-width band, her cover at 50% 30%,
    // the veil over it. No inner frame: this band IS the header's photograph.
    `<div class="in-photo" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 30%')
      : `<div class="in-motif"><span class="in-mono">${v.mono}</span></div>`,
    '<span class="in-voile" aria-hidden="true"></span>',
    '</div>',
    // …and the identity rides UP over the veil (−92px), which is why it comes
    // after the photo in the DOM and still paints above it.
    '<div class="in-col" data-role="vitrine-identity">',
    `<div class="in-name">${weldSeal(v.tail, `<span class="in-seal" aria-hidden="true"><span class="in-seal-f"></span>${iconCheckEnt(11, '#0D133A', 3.4)}</span>`)}</div>`,
    v.hasTag ? `<div class="in-bienv"><v>${v.tagline}</v></div>` : '',
    `<div class="in-verif"><span class="in-chip">${iconShieldEnt(14, '#4CC9F0', 2)}<span>${verifieeBare()}</span></span></div>`,
    `<div class="in-zone">${iconPinEnt(12, '#4CC9F0', 2.2)}<span><v>${v.zone}</v></span></div>`,
    zigzag(),
    v.hasBio ? `<div class="in-bio"><v>${v.bio}</v></div>` : '',
    v.showProof
      ? `<div class="in-proof"><span data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="in-stars" data-role="chip-avis"> · ${iconStarEnt(11, '#FFD36E')}${avisChip(v)}</span>`
            : ''
        }</div>`
      : '',
    v.nouvelle
      ? `<div class="in-nouv-wrap"><span class="in-nouv" data-role="chip-nouvelle">${iconStarEnt(12, '#0D133A')}<v>${t('vit.nouvelle_vendeuse')}</v></span></div>`
      : '',
    '</div>',
    '<div class="in-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#7FDBFF', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#7FDBFF', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#7FDBFF', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'in', 'right', '12px', '64px', '#FFFFFF'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 6 · INDIGO (série 2) ══════════════════════
     Relevé — fond #0D133A · motif #16215C · avatar #2B3C8F→#131C55 · cyan
     #4CC9F0 (pastille →#2BA6D9) · cyan clair #9BE0FA / icônes #7FDBFF ·
     étoile #FFD36E · blanc pur. « Aucun autre ton » — so every value below
     comes from that list and nothing else. */
  .vt-in {
    --in-fond: #0D133A; --in-motif: #16215C;
    --in-cyan: #4CC9F0; --in-cyan-2: #2BA6D9; --in-cyan-clair: #9BE0FA; --in-icone: #7FDBFF;
    --in-etoile: #FFD36E;
    background: var(--in-fond);
  }
  /* THE PHOTO IS THE BACKGROUND. 300px band, full width, bleeding up under the
     60px status pad the shell reserves (margin-top:-60px) so the image reaches
     the very top edge — the veil is what keeps the chrome legible over it. */
  .vt-in .in-photo { position: relative; height: 300px; margin-top: -60px; overflow: hidden; background: var(--in-fond); }
  .vt-in .in-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--in-motif);
    background-image:
      repeating-linear-gradient(135deg, rgba(76,201,240,.22) 0 2px, transparent 2px 14px),
      repeating-linear-gradient(45deg, rgba(255,255,255,.09) 0 2px, transparent 2px 14px);
  }
  /* the monogram sits at 34 % of the band's height — ABOVE the veil's dark end,
     which is the only place it stays readable */
  .vt-in .in-mono {
    position: absolute; top: 34%; left: 50%; transform: translate(-50%, -50%);
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 96px; line-height: 1; color: rgba(255,255,255,.22);
  }
  .vt-in .in-voile {
    position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(13,19,58,.32) 0%, rgba(13,19,58,0) 26%, rgba(13,19,58,0) 42%, rgba(13,19,58,.85) 76%, var(--in-fond) 100%);
  }
  /* the identity rides UP over the veil — the relevé's −92px */
  .vt-in .in-col { position: relative; margin-top: -92px; padding: 0 16px 16px; }
  .vt-in .in-name {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(26px, 9cqw, 31px); line-height: 1.06; letter-spacing: -.012em;
    color: #FFFFFF; overflow-wrap: break-word;
  }
  /* Relevé §Type — « pleine largeur (pas de règle de taille fixe) »: this style
     has NO long-name tier. The column is the whole width, so a long name wraps
     instead of shrinking, which is the contract's own answer here. */
  .vt-in .in-name .vt-ent-acc { color: #FFFFFF; }
  /* the seal is WELDED to the last segment (série 1 convention), so it travels
     with the accent word and can never wrap onto a line by itself */
  .vt-in .in-seal {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; border-radius: 50%; background: var(--in-cyan);
    margin-left: 6px; vertical-align: middle;
  }
  .vt-in .in-seal-f { position: absolute; inset: -3px; border-radius: 50%; border: 1.5px dashed rgba(76,201,240,.6); }
  .vt-in .in-bienv { margin-top: 6px; font-weight: 700; font-size: 13px; line-height: 1.3; color: var(--in-cyan-clair); }
  .vt-in .in-verif { margin-top: 10px; }
  .vt-in .in-chip {
    display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px;
    border-radius: 12px; background: rgba(13,19,58,.55);
    box-shadow: inset 0 0 0 1px rgba(76,201,240,.45);
    font-size: 12px; font-weight: 600; color: #FFFFFF;
  }
  .vt-in .in-zone { margin-top: 8px; display: flex; align-items: flex-start; gap: 6px; font-weight: 500; font-size: 11.5px; line-height: 1.4; color: rgba(255,255,255,.85); }
  .vt-in .in-zone svg { flex: none; margin-top: 1px; }
  .vt-in .in-zig { display: block; margin-top: 6px; }
  .vt-in .in-bio { margin-top: 8px; font-weight: 400; font-size: 12px; line-height: 1.5; color: rgba(255,255,255,.85); }
  .vt-in .in-proof { margin-top: 8px; font-size: 11.5px; line-height: 1.4; color: rgba(255,255,255,.9); }
  .vt-in .in-proof b { font-weight: 700; color: #FFFFFF; }
  .vt-in .in-stars { color: var(--in-etoile); font-weight: 600; }
  .vt-in .in-stars svg { vertical-align: -1px; margin-right: 3px; }
  .vt-in .in-nouv-wrap { margin-top: 12px; display: flex; justify-content: flex-end; }
  .vt-in .in-nouv {
    display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 16px;
    border-radius: 99px; background: linear-gradient(120deg, var(--in-cyan), var(--in-cyan-2));
    box-shadow: 0 10px 24px -10px rgba(76,201,240,.75);
    font-weight: 700; font-size: 13px; color: var(--in-fond);
  }
  /* The relevé's row is ~64px; ours runs taller because the canon labels are
     one long sentence each (« Livraison Séra vérifiée & scellée ») where the
     contract splits them. The VIGNETTE and the gutters give way — the type
     stays at the relevé's 10 / 8.5, because 320px in Ouaga sun is where
     legibility is already hardest. */
  .vt-in .in-trust {
    margin: 0 16px 16px; padding: 9px 4px; border-radius: 16px;
    background: rgba(76,201,240,.07); box-shadow: inset 0 0 0 1px rgba(76,201,240,.35);
    display: grid; grid-template-columns: 1.1fr 1fr 1.04fr; align-items: center;
  }
  .vt-in .in-cell { padding: 0 5px; display: flex; align-items: center; gap: 7px; }
  .vt-in .in-cell + .in-cell { border-left: 1px solid rgba(76,201,240,.22); }
  .vt-in .in-cell-i {
    width: 30px; height: 30px; flex: none; border-radius: 10px;
    background: rgba(76,201,240,.12); box-shadow: inset 0 0 0 1px rgba(76,201,240,.5);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-in .in-cell-l { display: block; font-weight: 700; font-size: 10px; line-height: 1.2; color: #FFFFFF; }
  .vt-in .in-cell-s { display: block; font-size: 8.5px; line-height: 1.2; color: rgba(155,224,250,.75); }
  /* the controls sit on the photograph, so they carry their own scrim; +60 for
     the status pad the shell reserves (relevé says top 12) */
  .vt-in .in-btn { background: rgba(13,19,58,.5); box-shadow: inset 0 0 0 1px rgba(255,255,255,.28); }
  .vt-in .vt-ent-btn { top: 72px; }
  /* back takes the NEAR slot (12), share slides to FAR (64) — the pairing this
     file's controls() call already declares. Without it the button fell to its
     static position at x=0, hard against the left edge. */
  .vt-in .vt-ent-back { right: 12px; }
  /* her portrait, when she has no cover: the relevé's radial indigo + a Georgia
     monogram — a DIFFERENT treatment from the band's Bricolage 96 */
  .vt-in .in-photo .vt-avatar-img { object-position: 50% 24%; }

  @container (max-width: 339px) {
    .vt-in .in-photo { height: 268px; }
    .vt-in .in-col { margin-top: -84px; padding: 0 12px 12px; }
    .vt-in .in-name { font-size: clamp(23px, 9cqw, 27px); }
    .vt-in .in-mono { font-size: 82px; }
    .vt-in .in-trust { margin: 0 12px 12px; padding: 9px 4px; }
    .vt-in .in-cell { gap: 6px; padding: 0 4px; }
    .vt-in .in-cell-i { width: 26px; height: 26px; }
  }
`;

export const unit: EnteteUnit = { render, css };
