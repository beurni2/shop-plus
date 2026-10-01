import { describe, expect, it, vi } from 'vitest';
import { ENTETE_DELAI_MS, avantDelai } from '../src/vitrine/entetes/registry';

/**
 * ENTETE-BORNEE-1 (AUDIT-4 B-01) — a style file that neither answers nor fails
 * must not hold her boutique on « Ouverture de la boutique… » for ever. The walk
 * (`e2e/vitrine-vraie.spec.ts`) holds the real file open in a browser; this pins
 * the bound itself.
 */
describe('avantDelai — the value, or nothing once the bound has passed', () => {
  it('a file that never comes resolves to nothing at the bound, not before', async () => {
    vi.useFakeTimers();
    try {
      let fini = false;
      const r = avantDelai(new Promise<string>(() => undefined), ENTETE_DELAI_MS).then((v) => {
        fini = true;
        return v;
      });
      await vi.advanceTimersByTimeAsync(ENTETE_DELAI_MS - 1);
      expect(fini, 'resolved before the bound').toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await r).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a file that answers in time is the answer; a late one is dropped', async () => {
    expect(await avantDelai(Promise.resolve('pagne'), 1_000)).toBe('pagne');
    vi.useFakeTimers();
    try {
      let lacher: (v: string) => void = () => undefined;
      const tard = new Promise<string>((ok) => { lacher = ok; });
      const r = avantDelai(tard, 100);
      await vi.advanceTimersByTimeAsync(100);
      lacher('pagne');
      expect(await r).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed fetch is still a failure, for the caller to catch', async () => {
    await expect(avantDelai(Promise.reject(new Error('chunk')), 1_000)).rejects.toThrow('chunk');
  });

  it('the bound is six seconds — under the twelve of the boutique read itself', () => {
    expect(ENTETE_DELAI_MS).toBe(6_000);
  });
});
