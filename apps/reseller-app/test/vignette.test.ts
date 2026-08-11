import { describe, expect, it } from 'vitest';
import { vignette, vignetteSaufHero } from '../src/vitrine/vignette';

/**
 * VIGNETTE (founder 2026-08-11: « implement the vignette on all of them »).
 *
 * The helper is trivial; what these assert is the JUDGEMENT around it — an empty
 * ref stays empty (a designed « sans photo », never a request for nothing), and
 * an existing query is not clobbered.
 */
describe('vignette — the small copy’s url', () => {
  it('asks for the small copy of an absolute product url', () => {
    expect(vignette('https://media.example/media/abc')).toBe('https://media.example/media/abc?v=thumb');
  });

  it('an EMPTY ref passes through — a designed « sans photo » is not a request', () => {
    expect(vignette('')).toBe('');
  });

  it('respects a url that already carries a query instead of clobbering it', () => {
    expect(vignette('https://media.example/media/abc?x=1')).toBe('https://media.example/media/abc?x=1&v=thumb');
  });

  it('is idempotent enough to be safe if it ever ran twice', () => {
    // Not a licence to call it twice — but a second call must not produce a url
    // that means something DIFFERENT, because `?v=thumb` last wins either way.
    expect(vignette(vignette('https://media.example/media/abc'))).toContain('v=thumb');
  });
});

/**
 * THE HERO'S OWN THUMBNAIL — the half that decides whether this change SAVES
 * bytes or costs them.
 *
 * On his catalogue today no photograph has a stored vignette (there is no
 * backfill), so `?v=thumb` answers the full file. A strip that asks for the
 * hero's photograph under a second uri therefore downloads that full file
 * TWICE — three photographs would go from 3 fetches to 4. These pin the rule
 * that keeps the count from rising.
 */
describe('vignetteSaufHero — never fetch the photograph already on screen twice', () => {
  const A = 'https://media.example/media/aaa';

  it('the SELECTED thumbnail re-uses the hero’s exact url, byte for byte', () => {
    // Byte-identical is the whole point: the image cache is keyed on the uri,
    // so « nearly the same » is a second download.
    expect(vignetteSaufHero(A, 2, 2)).toBe(A);
  });

  it('every OTHER thumbnail asks for the small copy', () => {
    expect(vignetteSaufHero(A, 0, 2)).toBe(`${A}?v=thumb`);
    expect(vignetteSaufHero(A, 3, 2)).toBe(`${A}?v=thumb`);
  });

  it('a strip of three produces exactly three DISTINCT urls, one of them the hero’s', () => {
    // The arithmetic the founder pays for, asserted rather than asserted about.
    const refs = [`${A}-0`, `${A}-1`, `${A}-2`];
    const hero = 1;
    const urls = refs.map((r, i) => vignetteSaufHero(r, i, hero));
    const distinctWithHero = new Set([...urls, refs[hero]!]);
    expect(distinctWithHero.size, 'the hero adds no fourth fetch').toBe(3);
  });
});
