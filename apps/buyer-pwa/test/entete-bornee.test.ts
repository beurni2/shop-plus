import { describe, expect, it, vi } from 'vitest';
import { ENTETE_DELAI_MS, avantDelai, loadAllEntetes, loadEntete, loadedEntete, resetEntetes } from '../src/vitrine/entetes/registry';

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

  it('a style file that arrives after the bound is never registered — no later draw can swap to it', async () => {
    resetEntetes();
    vi.useFakeTimers();
    let charge: Promise<void>;
    try {
      charge = loadEntete('pagne', 5);
      // The bound passes before the file has arrived.
      vi.advanceTimersByTime(5);
    } finally {
      vi.useRealTimers();
    }
    await charge;
    // Now let the file itself arrive, and every follow-up settle.
    await import('../src/vitrine/entetes/pagne');
    await new Promise((ok) => setTimeout(ok, 0));
    expect(loadedEntete('pagne'), 'a late file was registered').toBeUndefined();
  });

  it('the « every style » test seam is NOT bounded — a slow machine never quietly skips a style', async () => {
    resetEntetes();
    vi.useFakeTimers();
    let tout: Promise<void>;
    try {
      tout = loadAllEntetes();
      // Past the buyer's bound before a single file has arrived.
      vi.advanceTimersByTime(ENTETE_DELAI_MS + 1);
    } finally {
      vi.useRealTimers();
    }
    await tout;
    expect(loadedEntete('pagne'), 'a style dropped by the buyer bound').toBeDefined();
  });
});
