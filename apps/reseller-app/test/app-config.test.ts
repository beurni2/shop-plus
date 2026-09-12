import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sharedColour } from '@platform/ui-tokens';

/**
 * CONFIG-APP-1 (AUDIT-SHOP-2 F-77) — the app manifest tells the truth about the
 * app it launches.
 *
 * · The cold-start colour is the paper token, not a near-white the palette never
 *   had: a launch used to flash `#FFFDF7` and then paint `#F4EFE6` under it.
 * · The photo library is USED (the cover and portrait pickers) and was never
 *   DECLARED: a standalone build asks for the permission with the OS's own
 *   sentence, or is refused review for it. Declared, in French Voice, with the
 *   camera kept out (the app never opens one).
 * · The fonts plugin keeps naming the four faces the app loads.
 */

const app = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'app.json'), 'utf8')) as {
  expo: { backgroundColor: string; plugins: unknown[] };
};

const plugin = (name: string): Record<string, unknown> | undefined => {
  for (const p of app.expo.plugins) {
    if (Array.isArray(p) && p[0] === name) return (p[1] ?? {}) as Record<string, unknown>;
  }
  return undefined;
};

describe('CONFIG-APP-1 — app.json', () => {
  it('the cold-start colour IS the paper token', () => {
    expect(app.expo.backgroundColor.toUpperCase()).toBe(sharedColour.paper.toUpperCase());
  });

  it('the photo library is declared, in French, and the camera is not asked for', () => {
    const picker = plugin('expo-image-picker');
    expect(picker, 'expo-image-picker must be configured').toBeDefined();
    const photos = String(picker!['photosPermission'] ?? '');
    expect(photos).toMatch(/photos/);
    expect(photos).toMatch(/[éèà]/); // a French sentence, not the SDK's English default
    expect(picker!['cameraPermission'], 'the app opens no camera').toBe(false);
  });

  it('the microphone sentence and the four font faces stay', () => {
    expect(String(plugin('expo-audio')?.['microphonePermission'] ?? '')).toMatch(/micro/);
    expect((plugin('expo-font')?.['fonts'] as string[]).length).toBe(4);
  });
});
