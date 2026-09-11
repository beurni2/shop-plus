import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPreviewProfile, IS_PREVIEW, PREVIEW_PROFILE } from '../src/preview.js';

/**
 * WO-4.0 preview honesty — « Aperçu — bac à sable ». No RN renderer exists
 * in this repo (repo test idiom: pure functions + shell source discipline),
 * so the banner law is proven in two halves: the profile signal both ways,
 * and the shell provably rendering the banner GATED on that signal.
 */

const appDir = join(import.meta.dirname, '..');

describe('preview banner (WO-4.0)', () => {
  it('profile signal: preview (explicit and DEFAULT) renders; a non-preview profile does NOT', () => {
    expect(isPreviewProfile('preview')).toBe(true);
    expect(isPreviewProfile(undefined)).toBe(true); // the channel default
    expect(isPreviewProfile('production')).toBe(false); // the negative
    expect(isPreviewProfile('anything-else')).toBe(false);
    expect(PREVIEW_PROFILE).toBe('preview');
    // In THIS environment no production profile exists — the built signal is preview.
    expect(IS_PREVIEW).toBe(true);
  });

  it('the shell renders the banner GATED on IS_PREVIEW — never unconditional, never absent', () => {
    const source = readFileSync(join(appDir, 'App.tsx'), 'utf8');
    expect(source).toMatch(/\{IS_PREVIEW && \(\s*<View style=\{styles\.previewBanner\}>/);
    expect(source).toMatch(/t\('preview\.banner'\)/);
    // The signal comes from the one preview module, not a local literal.
    expect(source).toMatch(/import \{ IS_PREVIEW \} from '\.\/src\/preview'/);
  });

  /**
   * AUDIT-SHOP-2 F-43 — the PUBLISHED channel is not an aperçu. Since
   * ACCES-ARME-2 it is the delivery road to real resellers, and it wore the
   * banner on every screen because the workflow set no profile: unset means
   * `preview`. The publish step now declares the production profile, as a
   * literal readable in review (the same road as `EXPO_PUBLIC_ACCESS_GATE`).
   * The default stays `preview` for local runs — the first test above still
   * holds — so the banner is exactly where it belongs: on the founder's own
   * Expo Go, never on the phones this step publishes to.
   */
  it('the PUBLISHED channel declares the production profile — the banner is for local runs only (F-43)', () => {
    const workflow = readFileSync(join(appDir, '..', '..', '.github', 'workflows', 'expo-preview.yml'), 'utf8');
    const publish = workflow.slice(workflow.indexOf('Publish reseller-app preview update'));
    expect(publish.length, 'the publish step is not in the workflow').toBeGreaterThan(0);
    expect(publish).toMatch(/^\s+EXPO_PUBLIC_PROFILE: 'production'$/m);
    // …and that literal is exactly what the signal reads as NOT preview.
    expect(isPreviewProfile('production')).toBe(false);
  });

  /**
   * F-43, second half — the voice sheet shipped diagnostic text: « Diag micro
   * (…) : <error message> » and a « (stage) » suffix, IS_PREVIEW-gated, planted
   * by BUG 1 step 1 (2026-07-20) as temporary instrumentation « removed once
   * the on-device cause is known ». The cause was found and fixed (VOIX-CARTE);
   * the text stayed, and it stayed on the published channel, since that was
   * the preview profile. Product copy lives in the catalog with a register;
   * this did not, and it is gone with its bug.
   */
  it('the voice sheet ships no diagnostic text — the BUG 1 instrumentation is gone with its bug (F-43)', () => {
    const sheet = readFileSync(join(appDir, 'src', 'vitrine', 'customize', 'voice-sheet.tsx'), 'utf8');
    expect(sheet).not.toContain('Diag micro');
    expect(sheet).not.toMatch(/IS_PREVIEW/);
    // The calm catalog sentences are what the two roads say now — by key.
    expect(sheet).toMatch(/t\('k\.voix\.interrompu'\)/);
    expect(sheet).toMatch(/t\('k\.voix\.lecture_echec'\)/);
  });
});
