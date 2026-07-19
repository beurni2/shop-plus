/**
 * VITRINE — the buyer-side « La voix » per-product player (DESIGN-LANGUAGE §5:
 * the house listen affordance — the filled play triangle + a caps label). Used
 * BOTH on the vitrine tile (compact chip) and on the product page (full row).
 *
 * Rules (founder): tap to play, NEVER autoplay (playback only ever begins from
 * a tap here), duration always visible. A note with no `ready` url renders
 * NOTHING — no placeholder gap. The audio itself is a [DEMO] tone behind the
 * sandbox « aperçu » ribbon (STOREFRONT-MEDIA-BACKING); the real recorded voice
 * swaps the url, never this player.
 */

import { t } from '../i18n';
import { esc } from '../format';
import { icon } from '../icons';
import type { ProductVoiceNote } from './profile';

/** A note is playable on the buyer side ONLY when it is `ready` with a url —
 * a reseller's freshly-recorded `pending` note is never buyer-visible (honesty:
 * queued = pending, nothing persists it yet). */
export function isPlayable(note: ProductVoiceNote | undefined): note is ProductVoiceNote & { url: string } {
  return !!note && note.status === 'ready' && typeof note.url === 'string' && note.url.length > 0;
}

/** « m:ss » — a short note reads « 0:01 »; never a bare number. */
export function fmtVoiceDuration(durationMs: number): string {
  const total = Math.max(0, Math.round(durationMs / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Product page — the full house-standard row (a real <button>, tap to play). */
export function renderVoicePlayer(note: ProductVoiceNote | undefined): string {
  if (!isPlayable(note)) return '';
  return [
    '<div class="voix-note" data-role="voix-produit">',
    `<button class="voix-btn" type="button" data-action="voix-produit-play" data-voix-url="${esc(note.url)}" aria-label="${t('voix_produit.aria')}">`,
    icon('ecouter', 'voix-icon'),
    `<span class="voix-label">${t('voix_produit.ecouter')}</span>`,
    `<span class="voix-duration">${fmtVoiceDuration(note.durationMs)}</span>`,
    '</button>',
    '</div>',
  ].join('');
}

/** Vitrine tile — the compact chip. It lives INSIDE the tile <button>, so it is
 * a <span role="button"> (never a nested <button>); the ONE delegated handler
 * (wireVoicePlay) plays it, and because closest() returns this span first the
 * tile's own « produit » navigation never fires on a voice tap. */
export function renderVoiceChip(note: ProductVoiceNote | undefined): string {
  if (!isPlayable(note)) return '';
  return [
    `<span class="vt-tile-voix" role="button" tabindex="0" data-action="voix-produit-play" data-voix-url="${esc(note.url)}" aria-label="${t('voix_produit.aria')}">`,
    icon('ecouter', 'vt-tile-voix-icon'),
    `<span class="vt-tile-voix-dur">${fmtVoiceDuration(note.durationMs)}</span>`,
    '</span>',
  ].join('');
}

/**
 * Tap-to-play, delegated. One shared <audio> element: tapping a note plays it;
 * tapping the note that is currently playing pauses it. Playback ONLY ever
 * starts from this user gesture — nothing autoplays. Safe to attach alongside
 * the surface's existing click listener (it no-ops on the voice action).
 */
export function wireVoicePlay(root: HTMLElement): void {
  let audio: HTMLAudioElement | null = null;
  let current: string | null = null;
  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest('[data-action="voix-produit-play"]');
    if (!(el instanceof HTMLElement)) return;
    ev.preventDefault();
    const src = el.getAttribute('data-voix-url');
    if (!src) return;
    if (audio && current === src && !audio.paused) {
      audio.pause();
      return;
    }
    if (audio === null) audio = new Audio();
    if (current !== src) {
      audio.src = src;
      current = src;
    }
    void audio.play().catch(() => undefined);
  });
}
