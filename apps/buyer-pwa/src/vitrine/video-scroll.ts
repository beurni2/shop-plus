/**
 * VIDEO-PRODUIT V-1e — scroll-play for the vitrine's video hero (founder:
 * « will start playing a preview when a client/viewer scrolls and pause on
 * that »). An IntersectionObserver watches every `[data-role="video-hero"]`:
 * mostly visible ⇒ play, otherwise ⇒ pause — and AT MOST ONE plays at a time
 * (several featured cards can carry clips; two competing videos on a 1GB
 * Android is a stutter, and a page that plays everything respects no one).
 *
 * EVERY FAILURE IS QUIET AND HONEST: no IntersectionObserver (an old WebView)
 * ⇒ nothing mounts and the poster photograph simply stands, exactly the
 * photo-only card; `play()` refusals (battery saver, data saver) are caught
 * and the poster stands. The observer never throws into the page.
 */

/** The visibility fraction at which a hero starts playing. */
export const SEUIL_LECTURE = 0.6;

/** The pure rule, testable without a DOM: play iff mostly visible. */
export const decideLecture = (ratio: number): 'lire' | 'pause' => (ratio >= SEUIL_LECTURE ? 'lire' : 'pause');

interface VideoLike {
  play(): Promise<void> | void;
  pause(): void;
}

/**
 * Mount the observer over `root`. Returns an unmount that disconnects it —
 * the caller re-renders by replacing innerHTML, so observers must not pile up
 * across navigations.
 */
export function mountVideoScroll(root: {
  querySelectorAll(sel: string): ArrayLike<unknown> & Iterable<unknown>;
}): () => void {
  const IO = (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
  if (IO === undefined) return () => {}; // the poster stands — the photo-only card
  const videos = [...root.querySelectorAll('[data-role="video-hero"]')] as (VideoLike & Element)[];
  if (videos.length === 0) return () => {};
  const observer = new IO(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target as unknown as VideoLike;
        if (decideLecture(entry.intersectionRatio) === 'lire') {
          // ONE AT A TIME: starting this hero pauses every other one.
          for (const other of videos) if (other !== entry.target) other.pause();
          try {
            const p = el.play();
            if (p !== undefined && typeof (p as Promise<void>).catch === 'function') {
              (p as Promise<void>).catch(() => {/* refused autoplay — the poster stands */});
            }
          } catch {
            /* same: the poster stands */
          }
        } else {
          el.pause();
        }
      }
    },
    { threshold: [0, SEUIL_LECTURE] },
  );
  for (const v of videos) observer.observe(v);
  return () => observer.disconnect();
}
