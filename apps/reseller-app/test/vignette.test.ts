import { describe, expect, it } from 'vitest';
import { vignette } from '../src/vitrine/vignette';

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
