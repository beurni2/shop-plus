import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const clip = readFileSync(join(__dirname, '..', 'src', 'ui', 'product-clip.tsx'), 'utf8');
const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
/** Assertions about what the CODE does must not be satisfied by prose about it. */
const code = clip.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/**
 * OTA-SAFETY — a JavaScript-only update must never crash an older binary.
 *
 * FOUNDER CHALLENGE, 2026-08-03: « I do not think the changes on opportunités
 * needs an eas build before deploying and showing. » He was right that the
 * layout work is pure JavaScript. What blocked it was one line: a STATIC
 * `import … from 'expo-video'`, which resolves native code AT IMPORT TIME. On
 * a binary built before that module existed it throws « Cannot find native
 * module » — and because App.tsx imports this file at the top level, that is a
 * crash AT LAUNCH, not a broken card on one screen.
 *
 * The property this file protects: **the reseller app degrades to photographs
 * on a binary without the native module, and never fails to start.** It is
 * worth pinning beyond today's deploy — binary/update skew is normal in Expo,
 * and it should never be fatal.
 */
describe('the reseller app survives an OTA onto a binary with no video module', () => {
  it('THE STATIC IMPORT IS GONE — this exact line is what made an OTA a crash', () => {
    expect(code).not.toMatch(/import\s+[^;]*from\s+'expo-video'/);
    // …and nothing else re-introduced it by another spelling
    expect(code).not.toMatch(/^\s*import\s+'expo-video'/m);
  });

  it('the module is loaded at RUNTIME, guarded, and a failure yields null', () => {
    // The three parts that make the guard real: a require, a catch, and a null.
    expect(code).toMatch(/require\('expo-video'\)/);
    expect(code).toMatch(/try\s*\{[\s\S]*require\('expo-video'\)[\s\S]*\}\s*catch\s*\{[\s\S]*return null;/);
    // A `catch` that rethrows, logs, or returns a stub would satisfy a lazier
    // test than this one and still crash the app.
    const guard = /const EXPO_VIDEO[\s\S]*?\}\)\(\);/.exec(code)?.[0] ?? '';
    expect(guard).not.toBe('');
    expect(guard).not.toContain('throw');
  });

  it('THE FALLBACK IS A REAL PRODUCT CARD — the photograph, not an empty frame', () => {
    // Degrading to a blank box would be worse than the crash: silent, and it
    // would look like the shop had no products.
    const photo = code.slice(code.indexOf('function ClipPhoto'), code.indexOf('const useVideoPlayer'));
    expect(photo).toContain('<Image');
    expect(photo).toContain('resizeMode="cover"'); // the fit law still holds
    expect(photo).toContain('onLoad={mesure(onAspect)}'); // …and CADRE still measures
  });

  it('the implementation is chosen ONCE, at module scope — never inside a render', () => {
    // Branching inside one component would make the hook set conditional, which
    // is a React invariant violation, not a style opinion.
    expect(code).toMatch(/export const ProductClip[\s\S]*EXPO_VIDEO === null \? ClipPhoto : ClipVideo/);
    // the video body must not be reachable when the module is absent
    expect(code).toContain('clip !== null && VideoView !== undefined');
  });

  it('the CALLERS never branch on it — one component, both builds', () => {
    // If a screen had to ask « can this build play video? », every new surface
    // would have to remember to ask too.
    expect(app).not.toContain('CLIP_NATIF_DISPONIBLE');
    expect(app.match(/<ProductClip/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
