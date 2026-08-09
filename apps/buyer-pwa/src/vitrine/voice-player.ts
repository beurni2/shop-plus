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
    // VOIX-VISIBLE — the label carries a SECOND line saying whose voice it is.
    // « Écouter la note » alone does not tell a first-time buyer that a real
    // person recorded this about this product, which is the entire reason the
    // row earns its space.
    '<span class="voix-texte">',
    `<span class="voix-label">${t('voix_produit.ecouter')}</span>`,
    `<span class="voix-sous">${t('voix_produit.sous')}</span>`,
    '</span>',
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
    // VOIX-VISIBLE — the WORD, not just the clock. « 0:05 » alone reads as a
    // timestamp; a buyer scanning a grid has no reason to tap it.
    `<span class="vt-tile-voix-mot">${t('voix_produit.ecouter')}</span>`,
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
  /**
   * The note currently playing, held as its URL — NOT as an element.
   *
   * ═══ WHY A URL AND NOT A NODE (journalled debt, closed 2026-08-09) ═══
   *
   * The comment here used to argue that a re-render « can never inherit a stale
   * Pause: the nodes it referred to are gone ». That is exactly backwards, and
   * it is why this bug survived the 2026-08-04 fix. The nodes leave the
   * DOCUMENT; the REFERENCE does not go anywhere. The vitrine replaces
   * `innerHTML` on every state change, so this handler went on writing the
   * counting clock into a DETACHED node while the control the buyer could
   * actually see had been rebuilt from the note — triangle, static total — with
   * the sound still coming out of her phone.
   *
   * Holding the URL means the host is RE-FOUND after every rebuild: the face
   * follows the NOTE rather than the node it happened to be drawn in.
   */
  let hoteUrl: string | null = null;
  /** Its total, restored when playback stops. */
  let total = '';
  /** Marks the control already dressed for playback, so the glyph is swapped
   *  once per rebuild rather than on every `timeupdate` tick. */
  const ETAT = 'data-voix-etat';

  /**
   * ═══ THE PLAYER HAD NO FACE ═══
   *
   * Founder, 2026-08-04: « the seconds are not counting and the play button
   * doesn't change to pause button ». Exactly right, and the cause is that this
   * handler drove the <audio> element and NOTHING ELSE — the icon and the
   * duration were rendered once, from the note, and never touched again. A
   * button that looks identical playing and stopped gives her no way to know
   * whether her tap worked, which on a slow connection is indistinguishable
   * from broken.
   */
  // Found by CLASS, the same way the clock is: `icon()` emits a plain <svg> with
  // no hook of its own, and adding one to a helper eleven other surfaces share
  // would be a change to all of them for the sake of this one.
  const GLYPHE = '.voix-icon, .vt-tile-voix-icon';
  const glyphe = (el: HTMLElement, nom: 'ecouter' | 'pause'): void => {
    const cible = el.querySelector(GLYPHE);
    if (cible instanceof SVGElement) cible.outerHTML = icon(nom, cible.getAttribute('class') ?? '');
  };
  const horloge = (el: HTMLElement, texte: string): void => {
    const cible = el.querySelector('.voix-duration, .vt-tile-voix-dur');
    if (cible instanceof HTMLElement) cible.textContent = texte;
  };
  /** The LIVE control for the note that is playing, whatever render built it.
   *  Matched by READING the attribute rather than by a selector, so a URL
   *  carrying quotes or brackets needs no escaping to be found again. */
  const hoteEl = (): HTMLElement | null => {
    if (hoteUrl === null) return null;
    for (const el of root.querySelectorAll('[data-action="voix-produit-play"]')) {
      if (el instanceof HTMLElement && el.getAttribute('data-voix-url') === hoteUrl) return el;
    }
    return null;
  };
  /** Dress the live control for playback — once per rebuild, not once per tick. */
  const enLecture = (el: HTMLElement): void => {
    if (el.getAttribute(ETAT) === 'lecture') return;
    glyphe(el, 'pause');
    el.setAttribute(ETAT, 'lecture');
  };
  const repos = (): void => {
    if (hoteUrl === null) return;
    const el = hoteEl();
    if (el !== null) {
      glyphe(el, 'ecouter');
      horloge(el, total);
      el.removeAttribute(ETAT);
    }
    hoteUrl = null;
  };

  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest('[data-action="voix-produit-play"]');
    if (!(el instanceof HTMLElement)) return;
    ev.preventDefault();
    const src = el.getAttribute('data-voix-url');
    if (!src) return;
    if (audio && current === src && !audio.paused) {
      audio.pause();
      repos();
      return;
    }
    if (audio === null) {
      audio = new Audio();
      // Every way playback can stop puts the button back — ending, being
      // paused elsewhere, or failing. Silence with a « Pause » glyph over it
      // is the exact lie this is here to prevent.
      audio.addEventListener('ended', repos);
      audio.addEventListener('pause', repos);
      audio.addEventListener('error', repos);
      audio.addEventListener('timeupdate', () => {
        const hote = hoteEl();
        if (hote === null || audio === null) return;
        // A rebuild brings this control back from the note — triangle, static
        // total — while the sound carries on. Put the face back on whatever
        // node is live NOW, rather than on the one that has left the document.
        enLecture(hote);
        horloge(hote, fmtVoiceDuration(audio.currentTime * 1000));
      });
    }
    if (current !== src) {
      audio.src = src;
      current = src;
    }
    repos(); // a second note takes over: the first one's button goes back first
    hoteUrl = src;
    const dur = el.querySelector('.voix-duration, .vt-tile-voix-dur');
    total = dur instanceof HTMLElement ? dur.textContent ?? '' : '';
    enLecture(el);
    horloge(el, fmtVoiceDuration(0));
    void audio.play().catch(() => repos());
  });
}
