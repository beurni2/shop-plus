import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t, tf } from '../src/i18n.js';

/**
 * RESELLER-I18N — the reseller-app gains a `tf()` interpolator (the buyer-pwa
 * convention), and it is LOUD-FAIL: a mistyped or missing placeholder THROWS,
 * it never silently leaves « {amount} » on a money screen. These are the planted
 * negatives — the whole reason the 11 manual `.replace()` sites were ported.
 */

describe('reseller-app tf() — loud-fail interpolation', () => {
  it('resolves every placeholder from its params (round-trip, no braces left)', () => {
    const out = tf('share.code', { code: 'AICHA-4821' });
    expect(out).toBe(t('share.code').replace('{code}', 'AICHA-4821'));
    expect(out).toContain('AICHA-4821');
    expect(out).not.toContain('{code}');
    // a multi-nothing string with one placeholder still resolves cleanly
    expect(tf('gains.brut', { amount: '2 000 F' })).toContain('2 000 F');
    expect(tf('gains.brut', { amount: '2 000 F' })).not.toMatch(/\{amount\}/);
  });

  it('THROWS on a mistyped placeholder — the string keeps {code}, the param never lands', () => {
    // `cede` is a typo for `code`: the old `.replace('{code}', …)` would have
    // silently shipped « Code : {code} ». Now it fails loud.
    expect(() => tf('share.code', { cede: 'AICHA-4821' })).toThrow(/\{code\}/);
  });

  it('THROWS when a placeholder the string carries has no value', () => {
    expect(() => tf('gains.brut', {})).toThrow(/no value for placeholder \{amount\}/);
  });

  it('THROWS when a provided param matches no placeholder (extra/mistyped param)', () => {
    expect(() => tf('share.validite', { date: '13 juillet', montant: 'x' })).toThrow(/matches no placeholder/);
  });

  it('no manual t(...).replace() interpolation survives in App.tsx — tf is the only path (multiline-aware, so a line-wrapped call cannot slip)', () => {
    const app = readFileSync(join(import.meta.dirname, '..', 'App.tsx'), 'utf8');
    // `\s*` spans newlines, so `t('k')\n  .replace(` is caught too — the exact
    // shape that gave a false green when the 12th site was line-wrapped.
    const offenders = [...app.matchAll(/\bt\('([^']+)'\)\s*\.replace\(/g)].map((m) => m[1]);
    expect(offenders, `manual replace still on: ${offenders.join(', ')}`).toEqual([]);
  });
});
