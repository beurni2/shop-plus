import { t } from './i18n';
import { esc } from './format';
import { icon } from './icons';
import type { VoiceNoteState } from './voice-note';

/**
 * WO-4.4 §6.2 / WO-5.3 (Grand Teint) — LOCATION CAPTURE, map-free and
 * landmark-first (GRAND-TEINT §5.4 « Le repère, pas l'adresse »): the zone as
 * a letterspaced cap label above chips, the repère in bold, free directions,
 * phone. NO street-address field EXISTS — not hidden, not optional: absent
 * (the negative test proves it on this form). The rider reaches the buyer
 * through a masked relay: « Votre numéro reste privé ».
 * The voice note (GRAND-TEINT §5 « La voix ») lets the buyer SAY the landmark
 * — record → playback → re-record, queued honestly offline; the listen
 * affordance is the filled play triangle + caps label.
 */

export const OUAGA_ZONES = [
  'Gounghin',
  'Dassasgho',
  'Tampouy',
  'Cissin',
  'Pissy',
  'Ouaga 2000',
] as const;

export interface LocationViewModel {
  selectedZone: string | null;
  landmark: string;
  directions: string;
  phone: string;
  voice: VoiceNoteState;
}

function voiceBlock(state: VoiceNoteState): string {
  const rows: string[] = [
    `<p class="field-label">${t('voix.titre')}</p>`,
    `<p class="quiet-line">${t('voix.explique')}</p>`,
  ];
  switch (state.kind) {
    case 'idle':
      rows.push(
        `<button class="secondary-action voice-action" data-action="voix-enregistrer">${icon('voix', 'btn-icon')}<span>${t('voix.enregistrer')}</span></button>`,
      );
      break;
    case 'recording':
      rows.push(
        `<p class="status-chip status-info" data-voice="recording"><span class="rec-dot" aria-hidden="true"></span>${t('voix.en_cours')}</p>`,
        `<button class="secondary-action voice-action" data-action="voix-arreter">${t('voix.arreter')}</button>`,
      );
      break;
    case 'recorded':
      rows.push(
        `<p class="status-chip status-ok" data-voice="recorded">${t('voix.enregistree')}</p>`,
        '<div class="action-row">',
        `<button class="action action-equal" data-action="voix-ecouter">${icon('ecouter', 'listen-icon')}<span>${t('voix.ecouter')}</span></button>`,
        `<button class="action action-equal" data-action="voix-reprendre">${icon('reprendre', 'btn-icon')}<span>${t('voix.reprendre')}</span></button>`,
        '</div>',
        '<audio data-role="voice-playback" controls hidden></audio>',
      );
      break;
    case 'queued':
      rows.push(`<p class="status-chip status-pending" data-voice="queued">${t('voix.en_file')}</p>`);
      break;
    case 'unavailable':
      rows.push(`<p class="status-chip status-muted" data-voice="unavailable">${t(state.reasonKey)}</p>`);
      break;
  }
  return `<div class="voice-note" data-voice-kind="${state.kind}">${rows.join('')}</div>`;
}

export function renderLocationForm(model: LocationViewModel): string {
  const zones = OUAGA_ZONES.map(
    (zone) =>
      `<button class="chip${model.selectedZone === zone ? ' chip-on' : ''}" data-zone="${esc(zone)}">${esc(zone)}</button>`,
  ).join('');
  return [
    '<section class="location-form" data-screen="localisation">',
    `<p class="step-line">${t('etape.lieu')}</p>`,
    `<h2>${t('lieu.titre')}</h2>`,
    `<p class="field-label">${t('lieu.quartier')}</p>`,
    `<div class="chips">${zones}</div>`,
    `<label class="field"><span class="field-label">${t('lieu.repere')}</span>`,
    `<input name="repere" class="field-input field-repere" value="${esc(model.landmark)}" placeholder="${t('lieu.repere_exemple')}"></label>`,
    `<label class="field"><span class="field-label">${t('lieu.indications')}</span>`,
    `<input name="indications" class="field-input" value="${esc(model.directions)}" placeholder="${t('lieu.indications_exemple')}"></label>`,
    `<label class="field"><span class="field-label">${t('lieu.telephone')}</span>`,
    `<input name="telephone" class="field-input" inputmode="tel" value="${esc(model.phone)}"></label>`,
    `<p class="quiet-line">${t('lieu.relais')}</p>`,
    voiceBlock(model.voice),
    `<button class="primary-action" data-action="lieu-continuer">${t('lieu.continuer')}</button>`,
    '</section>',
  ].join('');
}
