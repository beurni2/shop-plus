import { t } from './i18n';

/**
 * WO-4.4 — the per-option AUDIO NOTE player (§6.1: "per-option audio note";
 * DESIGN-LANGUAGE §5: the little listen icon is a house standard). The audio
 * itself is a FOUNDER ASSET: recorded French voice — recorded, never
 * synthesized (deterministic law) — and it is PENDING. Until the recording
 * lands in a slot below, the player renders the honest placeholder
 * « Note vocale bientôt disponible » — visible, disabled, never fake.
 */

export type AudioNoteSlot = 'checkout_option_a' | 'checkout_option_b';

/** Founder-asset slots — a URL to the recorded French audio, or null while
 * the recording is pending. NEVER point these at generated speech. */
export const AUDIO_NOTE_ASSETS: Record<AudioNoteSlot, string | null> = {
  checkout_option_a: null,
  checkout_option_b: null,
};

const LISTEN_ICON =
  '<svg class="listen-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M11 5 6.5 9H3v6h3.5L11 19z"/>' +
  '<path d="M15 9.5a4 4 0 0 1 0 5"/>' +
  '<path d="M17.5 7a7.5 7.5 0 0 1 0 10"/>' +
  '</svg>';

export function renderAudioNote(slot: AudioNoteSlot): string {
  const asset = AUDIO_NOTE_ASSETS[slot];
  if (asset === null) {
    return [
      `<p class="audio-note audio-note-pending" data-audio-slot="${slot}">`,
      LISTEN_ICON,
      `<span>${t('audio.bientot')}</span>`,
      '</p>',
    ].join('');
  }
  return [
    `<div class="audio-note" data-audio-slot="${slot}">`,
    LISTEN_ICON,
    `<span>${t('audio.ecouter')}</span>`,
    `<audio controls src="${asset}"></audio>`,
    '</div>',
  ].join('');
}
