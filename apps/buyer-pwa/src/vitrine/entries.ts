/**
 * VITRINE — the C-ENT entry components (E1/E2/E3 deltas, HANDOFF §2).
 *
 * Four buyer-side entries into the reseller's public vitrine, styled to the
 * Phase-0 table's exact bytes and grafted into TODAY'S product/confirmation
 * screens. §9.5 (founder-frozen): BOTH E1 entries ship — C-ENT1 is the
 * canonical anchor (the reseller line, plain text until now), C-ENT2 the
 * labelled, discoverable affordance. The surrounding C1 chrome is WO-FP-PWA's
 * rebuild lane — these components carry their own styles so they land whole
 * today and survive that rebuild unchanged.
 *
 * Élision (§2 C-ENT2): « de {prénom} » → « d'{prénom} » devant voyelle — the
 * planche authors the elided form with the apostrophe INSIDE the label text.
 */

import { t } from '../i18n';
import { esc } from '../format';
import { iconCheck, iconChevron, iconDevanture } from './icons';

/** Élision (§2/§3.3): « d'{prénom} » devant voyelle, sinon « de {prénom} » —
 * returned as the PREFIX ONLY so the name stays a `<v>` template node. */
export function elideDe(prenom: string): string {
  return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(prenom) ? 'd’' : 'de ';
}
export function elideQue(prenom: string): string {
  return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(prenom) ? 'qu’' : 'que ';
}

/** C-ENT1 — en-tête identité tappable (page produit → vitrine). */
export function renderEnt1(model: { shopName: string; slug: string; accent: string; on: string }): string {
  return [
    `<button class="ent1" data-role="vitrine-entree" data-action="vitrine" data-slug="${esc(model.slug)}">`,
    `<span class="ent1-avatar" style="background:${model.accent};color:${model.on}">${esc(model.shopName.replace(/^Chez\s+/i, '').charAt(0).toUpperCase())}</span>`,
    '<span class="ent1-id">',
    `<span class="ent1-name"><v>${esc(model.shopName)}</v></span>`,
    `<span class="ent1-verified">${iconCheck(13, '#6F6355', 2.6)}${t('produit.vendeuse_verifiee')}</span>`,
    '</span>',
    iconChevron(15, '#8A7D6B', 2.1),
    '</button>',
  ].join('');
}

/** C-ENT2 — 4ᵉ rangée de la carte confiance : « Voir toute la boutique d'Aïcha ». */
export function renderEnt2(model: { prenom: string; slug: string; accent: string }): string {
  return [
    `<button class="ent2" data-role="vitrine-entree" data-action="vitrine" data-slug="${esc(model.slug)}">`,
    iconDevanture(17, model.accent, 1.9),
    `<span class="ent2-label">${t('vit.voir_toute')} ${elideDe(model.prenom)}<v>${esc(model.prenom)}</v></span>`,
    iconChevron(14, model.accent, 2),
    '</button>',
  ].join('');
}

/** C-ENT3 — bouton boutique de l'encart épuisé (E2). */
export function renderEnt3(model: { prenom: string; slug: string; soft: string; deep: string }): string {
  return [
    `<div class="ent3-encart"><span class="ent3-texte">${t('vit.epuise_encart_avant')} <v>${esc(model.prenom)}</v> ${t('vit.epuise_encart_apres')}</span>`,
    `<button class="ent3" style="background:${model.soft};color:${model.deep}" data-role="vitrine-entree" data-action="vitrine" data-slug="${esc(model.slug)}">`,
    iconDevanture(16, model.deep, 1.9),
    `${t('vit.voir_boutique')} ${elideDe(model.prenom)}<v>${esc(model.prenom)}</v>`,
    '</button></div>',
  ].join('');
}

/** C-ENT4 — ghost boutique (C6 confirmée) + sous-ligne. */
export function renderEnt4(model: { prenom: string; slug: string; accent: string }): string {
  return [
    `<button class="ent4" style="color:${model.accent}" data-role="vitrine-entree" data-action="vitrine" data-slug="${esc(model.slug)}">`,
    iconDevanture(16, model.accent, 1.9),
    `<span>${t('vit.decouvrir_reste')}</span>`,
    '</button>',
    `<p class="ent4-sous">${t('vit.pendant')} ${elideQue(model.prenom)}<v>${esc(model.prenom)}</v> ${t('vit.boutique_ouverte')}</p>`,
  ].join('');
}

/** The C-ENT stylesheet — Phase-0 bytes, self-contained (survives the C1 rebuild). */
export const ENT_STYLES = `
  .ent1 {
    display: flex; align-items: center; gap: 12px;
    padding: 2px 4px 2px 2px; margin: -2px 0 -2px -2px;
    border: 0; border-radius: 14px; background: transparent;
    min-height: 44px; cursor: pointer; text-align: left;
    font: inherit; color: inherit; width: auto;
  }
  .ent1:active { background: #FBF6EB; }
  .ent1-avatar {
    display: flex; align-items: center; justify-content: center; flex: none;
    width: 40px; height: 40px; border-radius: 14px;
    font-family: 'Bricolage Grotesque', sans-serif; font-size: 15px; font-weight: 800;
  }
  .ent1-id { display: block; flex: 1; min-width: 0; }
  .ent1-name {
    display: inline; font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 17px; font-weight: 800; letter-spacing: -0.17px; color: #1C1710;
  }
  .ent1-verified {
    display: flex; align-items: center; gap: 4px;
    font-size: 12px; font-weight: 400; color: #6F6355;
  }
  .ent2 {
    display: flex; align-items: center; gap: 11px;
    min-height: 46px; padding: 0 16px; width: 100%;
    border: 0; background: transparent; cursor: pointer; text-align: left;
    font-family: 'Instrument Sans', system-ui, sans-serif;
    font-size: 13.5px; font-weight: 700; color: var(--ent-accent, #C2571B);
  }
  .ent2:active { background: #FBF6EB; }
  .ent2-label { display: block; flex: 1; }
  .ent3-encart {
    display: block; margin-top: 12px; border-radius: 16px;
    background: #F1E7D3; color: #4A3F33; padding: 14px 15px;
    font-family: 'Instrument Sans', system-ui, sans-serif;
    font-size: 12.5px; font-weight: 400; line-height: 19.375px;
  }
  .ent3 {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; height: 48px; margin-top: 11px;
    border: 0; border-radius: 14px; cursor: pointer;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 14.5px; font-weight: 700; line-height: 22.475px;
  }
  .ent3:active { transform: scale(.98); }
  .ent4 {
    display: flex; align-items: center; justify-content: center; gap: 9px;
    width: 100%; height: 50px; margin-top: 10px;
    background: #FFFFFF; border: 1px solid #E5DCC9; border-radius: 16px;
    cursor: pointer;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 14.5px; font-weight: 700;
  }
  .ent4:active { background: #FBF6EB; }
  .ent4-sous {
    margin: 12px 0 0; text-align: center;
    font-family: 'Instrument Sans', system-ui, sans-serif;
    font-size: 11.5px; font-weight: 400; color: #6F6355;
  }
`;
