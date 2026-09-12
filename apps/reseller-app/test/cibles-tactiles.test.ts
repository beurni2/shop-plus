import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { touch } from '@platform/ui-tokens/legacy';
import { K_RAW_STYLES } from '../src/vitrine/customize/k-styles';
import { CERCLE_RAW_STYLES } from '../src/cercle/styles';

/**
 * CIBLES-TACTILES-1 (AUDIT-SHOP-2 F-45) — every control she presses meets the
 * touch token (48 px), on every surface, including the two that still carry
 * raw values (Personnaliser, Cercle — F-44's migration is its own slice; the
 * TARGET SIZE is not waiting for it).
 *
 * The audit measured: « Tout voir » 32, « Personnaliser ma boutique » 46,
 * « Retirer » 46, the toggle 46; Personnaliser's back button 40, segments 38,
 * the record sheet's « Arrêter » 40; Cercle's back 40, chips 36–40. A 46 px
 * control beside a comment that says « 44px+ » is exactly how a target drifts:
 * the token is the number, and this file reads the token.
 */

const MIN = touch.minTargetPx;
const app = readFileSync(join(import.meta.dirname, '..', 'App.tsx'), 'utf8');

const taille = (s: Record<string, unknown>, prop: 'height' | 'minHeight' | 'width'): number => {
  const v = s[prop];
  return typeof v === 'number' ? v : Number.NaN;
};

describe('the token is the number', () => {
  it('is 48 — the charter floor is 44, the family token is the one the app reads', () => {
    expect(MIN).toBeGreaterThanOrEqual(44);
  });
});

describe('Personnaliser (k-styles, raw values) — each named control reaches the token', () => {
  it('backBtn · segBtn · vStopBtn', () => {
    const S = K_RAW_STYLES as unknown as Record<string, Record<string, unknown>>;
    expect(taille(S['backBtn']!, 'height'), 'backBtn height').toBeGreaterThanOrEqual(MIN);
    expect(taille(S['backBtn']!, 'width'), 'backBtn width').toBeGreaterThanOrEqual(MIN);
    expect(taille(S['segBtn']!, 'height'), 'segBtn height').toBeGreaterThanOrEqual(MIN);
    expect(taille(S['vStopBtn']!, 'height'), 'vStopBtn height — the « Arrêter » of a running take').toBeGreaterThanOrEqual(MIN);
  });

  // The verifier's list beside the audit's (handled once): the voice sheet's
  // PRIMARY action sat at the charter floor (44) under the 48 token, with its
  // neighbours; the arrows and stars of the sections editor at 30 and 38.
  it('vPublishBtn · vGhost · vPlayBtn · vRecBtn · ghostSmall (height) · vEcouteDisque · starBtn · arrowBtn (square)', () => {
    const S = K_RAW_STYLES as unknown as Record<string, Record<string, unknown>>;
    for (const name of ['vPublishBtn', 'vGhost', 'vPlayBtn', 'vRecBtn', 'ghostSmall']) {
      expect(taille(S[name]!, 'height'), name).toBeGreaterThanOrEqual(MIN);
    }
    for (const name of ['vEcouteDisque', 'starBtn', 'arrowBtn']) {
      expect(taille(S[name]!, 'height'), `${name} height`).toBeGreaterThanOrEqual(MIN);
      expect(taille(S[name]!, 'width'), `${name} width`).toBeGreaterThanOrEqual(MIN);
    }
  });
});

describe('Cercle (raw values) — each named control reaches the token', () => {
  it('backBtn · chipRose · zoneChip · segChip · toutVoir', () => {
    const S = CERCLE_RAW_STYLES as unknown as Record<string, Record<string, unknown>>;
    expect(taille(S['backBtn']!, 'height'), 'backBtn').toBeGreaterThanOrEqual(MIN);
    expect(taille(S['backBtn']!, 'width'), 'backBtn width').toBeGreaterThanOrEqual(MIN);
    for (const name of ['chipRose', 'zoneChip', 'segChip', 'toutVoir']) {
      expect(taille(S[name]!, 'height'), name).toBeGreaterThanOrEqual(MIN);
    }
  });
});

describe('App.tsx (token expressions) — the five sub-token controls now read the touch token', () => {
  const bloc = (name: string): string => {
    const m = new RegExp(`^  ${name}: \\{[\\s\\S]*?^  \\},`, 'm').exec(app);
    expect(m, `style block ${name} must exist`).not.toBeNull();
    return m![0];
  };

  it('toutVoirPill · vitrinePersoBtn · vitrineRetirer · vitrineIconBtn · vitrineToggle', () => {
    for (const name of ['toutVoirPill', 'vitrinePersoBtn', 'vitrineRetirer', 'vitrineToggle']) {
      expect(bloc(name), `${name} minHeight must be the touch token`).toMatch(/minHeight: touch\.minTargetPx/);
      expect(bloc(name), `${name} still carries a spacing-sum height`).not.toMatch(/(?:min)?[Hh]eight: spacing\./);
    }
    const icone = bloc('vitrineIconBtn');
    expect(icone).toMatch(/width: touch\.minTargetPx/);
    expect(icone).toMatch(/height: touch\.minTargetPx/);
  });
});
