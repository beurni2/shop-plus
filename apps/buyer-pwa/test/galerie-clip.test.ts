import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { galerieSlides, renderGalerie } from '../src/cliente/screens';
import { CLIENTE_STYLES } from '../src/cliente/styles';

const HERO = 'https://media.example/media/h.jpg';
const P2 = 'https://media.example/media/p2.jpg';
const CLIP = 'https://media.example/media/clip.mp4';
const base = {
  shopName: 'Chez Awa', prenom: 'Awa', slug: 'chez-awa', productName: 'bouteille',
  zone: 'Gounghin', priceFcfa: 10_000, assetRefs: [HERO, P2], inStock: true,
};

/**
 * GALERIE-CLIP + CADRE-C1 — two founder reports from one screenshot (2026-08-03):
 *   « the video is previewing but when I tap to view entirely it becomes a
 *     photo and I do not see the video »
 *   « the square frame there on that screen is cropping part of images, drop
 *     the square rule on that screen as well »
 */

describe('the gallery shows the CLIP the buyer just tapped', () => {
  it('the clip LEADS, then every photograph, in order', () => {
    const slides = galerieSlides({ ...base, videoRef: CLIP } as never);
    expect(slides.map((s) => s.kind)).toEqual(['clip', 'photo', 'photo']);
    expect(slides[0]!.src).toBe(CLIP);
    expect(slides[1]!.src).toBe(HERO); // the photographs keep their wire order
    expect(slides[2]!.src).toBe(P2);
  });

  it('NO clip ⇒ the slide list is the photographs, unchanged', () => {
    const slides = galerieSlides(base as never);
    expect(slides.map((s) => s.kind)).toEqual(['photo', 'photo']);
    expect(slides.map((s) => s.src)).toEqual([HERO, P2]);
  });

  it('slide 0 RENDERS A <video>, with controls — this is the full view she asked for', () => {
    const html = renderGalerie({ ...base, videoRef: CLIP } as never, 0);
    const video = html.match(/<video[^>]*>/)?.[0];
    expect(video, 'the tapped clip is still not in the gallery').toBeDefined();
    for (const attr of ['controls', 'autoplay', 'muted', 'playsinline', `src="${CLIP}"`]) {
      expect(video, attr).toContain(attr);
    }
    // muted on arrival is what lets it play at all; controls are what let her
    // choose sound. Both, or the founder's report comes back in another form.
    expect(html).toContain('data-role="galerie-video"');
  });

  it('THE COUNTER COUNTS THE CLIP — « 1 sur 3 », not « 1 sur 2 »', () => {
    // A counter that ignored the clip would tell her a photo is missing.
    expect(renderGalerie({ ...base, videoRef: CLIP } as never, 0)).toContain('1 sur 3');
    expect(renderGalerie(base as never, 0)).toContain('1 sur 2');
  });

  it('the photographs are STILL REACHABLE past the clip — the off-by-one guard', () => {
    const withClip = { ...base, videoRef: CLIP } as never;
    expect(renderGalerie(withClip, 1)).toContain(`src="${HERO}"`);
    expect(renderGalerie(withClip, 2)).toContain(`src="${P2}"`);
    expect(renderGalerie(withClip, 2)).toContain('3 sur 3');
    // and the LAST slide disables « Suivante », so the end is honest
    expect(renderGalerie(withClip, 2)).toMatch(/data-action="galerie-suivante" disabled/);
    expect(renderGalerie(withClip, 0)).toMatch(/data-action="galerie-precedente" disabled/);
  });

  it('THE FLOW BOUND COUNTS SLIDES, not photographs', () => {
    // The bug this pins: `assetRefs.length - 1` with a clip at slide 0 is one
    // short, so the last photo can never be reached. Invisible by tapping —
    // it looks like a missing photo, not an off-by-one.
    const flow = readFileSync(join(__dirname, '..', 'src', 'cliente', 'flow.ts'), 'utf8');
    expect(flow).toContain('galerieSlides(m).length - 1');
    expect(flow).not.toMatch(/galerie-suivante'[\s\S]{0,400}assetRefs\.filter/);
  });
});

describe('CADRE-C1 — the product frame stops cropping', () => {
  it('no fixed height survives on the frame', () => {
    const rule = /\.cl-photo \{[^}]*\}/.exec(CLIENTE_STYLES)?.[0] ?? '';
    expect(rule).not.toBe('');
    expect(rule).not.toMatch(/[^-]height: 238px/); // the crop, gone
    expect(rule).toContain('min-height: 238px'); // …the SANS-PHOTO box, kept
  });

  it('the media sizes ITSELF, bounded — and is not absolutely positioned any more', () => {
    const rule = /\.cl-photo-img \{[^}]*\}/.exec(CLIENTE_STYLES)?.[0] ?? '';
    expect(rule).toContain('height: auto');
    expect(rule).not.toContain('position: absolute');
    expect(rule).toContain('min-height: 200px');
    expect(rule).toContain('max-height: 70vh');
    expect(rule).toContain('object-fit: cover'); // the fit law at the clamped extremes
  });

  it('THE CAPTION STAYS HIDDEN BEHIND THE MEDIA — it was never visible on a photo card', () => {
    // `.cl-photo-caps` is an in-flow flex child the absolute media used to paint
    // over. With the media in flow, without these two rules the caption would
    // appear ACROSS his product photo — a change he never asked for, arriving
    // as a side effect of a crop fix.
    expect(CLIENTE_STYLES).toMatch(/\.cl-photo\[data-role="photo-reelle"\] \.cl-photo-caps \{[^}]*position: absolute/);
    expect(CLIENTE_STYLES).toMatch(/\.cl-photo-img \{[^}]*z-index: 1/);
    // …and the overlays must clear the lifted media, or ticks/count/veil vanish
    expect(CLIENTE_STYLES).toMatch(/\.cl-photo \.cl-tick, \.cl-photo-count, \.cl-photo-veil \{ z-index: 2; \}/);
  });
});
