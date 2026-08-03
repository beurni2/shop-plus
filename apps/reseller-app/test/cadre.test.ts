import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cadreRatio, CADRE_MIN, CADRE_MAX, CADRE_DEFAUT } from '../src/ui/cadre';

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

/**
 * CADRE — « Drop the square rule » (founder order 2026-08-03).
 *
 * The square frame was a standing ruling (RESELLER-UX-3) and it is now retired
 * BY THE FOUNDER, on the record, because it was what stopped the opportunités
 * columns from staggering: identical frames make identical heights.
 *
 * What must hold now: a photograph's own proportions decide its card's height,
 * WITHIN BOUNDS, and every way a measurement can fail lands on the old square
 * rather than on a broken card.
 */
describe('cadreRatio — the photo decides the frame, within bounds', () => {
  it('an ordinary photo is obeyed EXACTLY — this is the whole point of the order', () => {
    expect(cadreRatio(1000, 1000)).toBe(1); // square in, square out
    expect(cadreRatio(800, 1000)).toBe(0.8); // 4:5 portrait — the reference's tall card
    expect(cadreRatio(1200, 1000)).toBe(1.2); // gentle landscape
    // …and the ratio is width ÷ height, so PORTRAIT IS BELOW 1. Getting this
    // backwards would render tall photos as wide cards and vice versa — the
    // failure would look deliberate, which is why it is pinned by direction.
    expect(cadreRatio(800, 1000)).toBeLessThan(1);
    expect(cadreRatio(1200, 1000)).toBeGreaterThan(1);
  });

  it('EXTREMES ARE CLAMPED — one bad upload cannot own the column', () => {
    // A panorama: without the clamp this is a 3-to-1 letterbox sliver.
    expect(cadreRatio(3000, 1000)).toBe(CADRE_MAX);
    // A full-length screenshot: without the clamp, a card taller than the phone.
    expect(cadreRatio(1000, 3000)).toBe(CADRE_MIN);
    // the bounds are the ones documented, and they are a real range — a clamp
    // where min === max is just the square rule wearing a disguise
    expect(CADRE_MIN).toBeLessThan(CADRE_DEFAUT);
    expect(CADRE_MAX).toBeGreaterThan(CADRE_DEFAUT);
    // and the tallest card is meaningfully taller than the widest is wide,
    // which is what produces visible stagger rather than a rounding difference
    expect(CADRE_MAX / CADRE_MIN).toBeGreaterThan(1.5);
  });

  it('EVERY FAILED MEASUREMENT LANDS ON THE SQUARE — never a divide-by-zero card', () => {
    for (const [w, h] of [[0, 100], [100, 0], [0, 0], [-5, 100], [100, -5], [NaN, 100], [100, NaN], [Infinity, 100], [100, Infinity]] as const) {
      expect(cadreRatio(w, h), `cadreRatio(${String(w)}, ${String(h)})`).toBe(CADRE_DEFAUT);
    }
  });

  it('the clamp is TOTAL — no input of any shape escapes the bounds', () => {
    for (const w of [1, 7, 50, 640, 4000]) {
      for (const h of [1, 9, 50, 480, 4000]) {
        const r = cadreRatio(w, h);
        expect(r).toBeGreaterThanOrEqual(CADRE_MIN);
        expect(r).toBeLessThanOrEqual(CADRE_MAX);
      }
    }
  });
});

describe('CADRE, wired — the square is gone from opportunités and KEPT elsewhere', () => {
  const app = read('App.tsx');
  const clip = read('src/ui/product-clip.tsx');

  it('the opportunités frame carries NO fixed aspectRatio — a stylesheet value is the same for every product', () => {
    const frame = app.slice(app.indexOf('oppTileArt: {'), app.indexOf('}', app.indexOf('justifyContent', app.indexOf('oppTileArt: {'))));
    expect(frame).not.toMatch(/aspectRatio:/);
    // …and the per-card ratio is supplied at the call site from the measurement
    expect(app).toContain('{ aspectRatio: cadres[item.productVersionId] ?? CADRE_DEFAUT }');
  });

  it('the measurement comes from the PHOTOGRAPH, once, and is bounded before use', () => {
    expect(clip).toContain('onLoad');
    expect(clip).toContain('e.nativeEvent.source');
    expect(app).toContain('cadreRatio(w, h)'); // bounded — never the raw pixels
    // written once per product: an unguarded setState on every onLoad re-renders
    // the whole grid for a value that did not change
    expect(app).toMatch(/prev\[item\.productVersionId\] === ratio \? prev :/);
  });

  it('THE FICHE AND MA VITRINE KEEP THEIR SQUARE — the order was about the opportunités stagger', () => {
    // Scoping matters: dropping the rule on surfaces the founder never raised
    // would be me redesigning screens he did not ask about.
    for (const frame of ['ficheHero', 'vitrineCardArt']) {
      expect(app, `${frame} lost its square without an order`).toMatch(new RegExp(`${frame}: \\{\\n[^}]*aspectRatio: 1,`));
    }
  });

  it('the fit law SURVIVES the frame change — cover, so a bounded photo still fills its card', () => {
    // The square rule's real job was stopping bad crops. With the frame now
    // agreeing with the photo, `cover` trims only the clamped extremes — but it
    // must still be `cover`, or a bounded photo letterboxes inside its own frame.
    expect(clip).toContain('resizeMode="cover"');
    expect(clip).toContain('contentFit="cover"');
    expect(app).not.toContain('resizeMode="contain"');
  });
});
