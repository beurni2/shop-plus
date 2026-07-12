import { t } from './i18n';
import { esc } from './format';
import { icon } from './icons';

/**
 * WO-4.4 / WO-5.3 — the per-option AUDIO NOTE player (§6.1: "per-option audio
 * note"; GRAND-TEINT §2.5 / §5: « La voix » — the listen affordance is a
 * filled play triangle + caps label, a house standard wherever money is
 * explained). The audio itself is a FOUNDER ASSET: recorded French voice —
 * recorded, never synthesized (deterministic law) — and it is PENDING. Until
 * the recording lands in a slot below, the player renders the honest
 * placeholder « La note vocale arrive bientôt » — visible, disabled, never
 * fake.
 */

export type AudioNoteSlot = 'checkout_option_a' | 'checkout_option_b';

/** Founder-asset slots — a URL to the recorded French audio, or null while
 * the recording is pending. NEVER point these at generated speech. */
export const AUDIO_NOTE_ASSETS: Record<AudioNoteSlot, string | null> = {
  checkout_option_a: null,
  checkout_option_b: null,
};

export function renderAudioNote(slot: AudioNoteSlot): string {
  const asset = AUDIO_NOTE_ASSETS[slot];
  if (asset === null) {
    return [
      `<p class="audio-note audio-note-pending" data-audio-slot="${slot}">`,
      icon('ecouter', 'listen-icon'),
      `<span class="audio-note-label">${t('audio.bientot')}</span>`,
      '</p>',
    ].join('');
  }
  return [
    `<div class="audio-note" data-audio-slot="${slot}">`,
    icon('ecouter', 'listen-icon'),
    `<span class="audio-note-label">${t('audio.ecouter')}</span>`,
    // r② (WO-5.3): esc() the interpolated src — a founder-supplied URL must
    // never break out of the attribute.
    `<audio controls src="${esc(asset)}"></audio>`,
    '</div>',
  ].join('');
}
