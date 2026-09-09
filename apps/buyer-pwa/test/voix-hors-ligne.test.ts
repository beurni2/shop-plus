import { describe, expect, it, vi } from 'vitest';

/**
 * VOIX-HORS-LIGNE — the demo shop opens even when its voice-note chunk cannot.
 *
 * ci #633 on the Tier 3 merge: `hors-ligne.spec.ts`'s cold offline deep open
 * found no vitrine hero on the runner. The demo port awaited the lazy
 * `voice-asset` chunk (SW-PRECACHE-1 stopped precaching it; F-88 made it
 * lazy) with no guard, so on a truly offline browser the import rejected and
 * the WHOLE resolve rejected — the offline card drew instead of the shop.
 * Locally the walk stayed green because Chromium 141's offline emulation does
 * not reach a service worker's own fetch; the runner's Chromium 149 does.
 *
 * The chunk is mocked to REJECT, as an offline import does. Written RED first:
 * without the catch, `resolve` throws « chunk unreachable ».
 */
vi.mock('../src/vitrine/voice-asset', () => {
  throw new Error('chunk unreachable (offline)');
});

describe('VOIX-HORS-LIGNE — the demo shop resolves without its voice-note chunk', () => {
  it('resolve(aicha-4821) still answers the storefront and trust, with NO notes, when the chunk import rejects', async () => {
    const { demoStorefrontPort } = await import('../src/vitrine/profile');
    const port = demoStorefrontPort('default');
    const resolved = await port.resolve('aicha-4821');
    expect(resolved).not.toBeNull();
    expect(resolved!.storefront.slug).toBe('aicha-4821');
    expect(resolved!.trust).toBeDefined();
    // Honest degradation: no invented note, no note at all — an empty map.
    expect(resolved!.notes).toEqual({});
  });
});
