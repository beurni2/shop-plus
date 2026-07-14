import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dimension } from '@platform/ui-tokens/legacy';
import { encodeQr } from '../src/qr/encoder.js';
import { DEMO_QR_URL, isCanonIdentityUrl } from '../src/qr/identity.js';

/**
 * WO-7.2b — the on-screen QR, in the share hub. `react-native-svg` cannot load
 * under node (Flow types), so — per the source-discipline convention (no RN
 * renderer in this env) — the renderer's maths is proven through the importable
 * pure module (`encodeQr` + the canon `dimension.qr` primitives), and the
 * component + hub WIRING is proven by reading the source: the side is DERIVED
 * (never a magic number), the colours are TOKENS (never hex), the payload is the
 * real-origin canon slug (never a baked domain).
 */

const appDir = join(import.meta.dirname, '..');
const qrSource = readFileSync(join(appDir, 'src/qr/QrCode.tsx'), 'utf8');
const appSource = readFileSync(join(appDir, 'App.tsx'), 'utf8');

// The render-time side derivation the component uses (the WO's math), recomputed
// here straight from the canon primitives so the test owns the number, not the code.
const QUIET = dimension.qr.quietZoneModules;
const MOD = dimension.qr.moduleMinPx;
const derivedSide = (modules: number) => (modules + 2 * QUIET) * MOD;

describe('the on-screen QR side is DERIVED from canon dimension.qr (never hand-picked)', () => {
  it('the canon URL encodes to V4 (33 modules) → 164 dp = (33 + 2·4)·4', () => {
    const qr = encodeQr(DEMO_QR_URL);
    expect(qr.size).toBe(33); // V4
    expect(QUIET).toBe(4);
    expect(MOD).toBe(4);
    expect(derivedSide(qr.size)).toBe(164);
  });

  it('the side rides the version — a smaller/larger matrix moves it by the same law', () => {
    expect(derivedSide(21)).toBe(116); // V1
    expect(derivedSide(37)).toBe(180); // V5
  });
});

describe('QrCode.tsx source discipline — tokens, the RN renderer, the real-origin payload', () => {
  it('draws with react-native-svg (ruling #10), never a raster/webview', () => {
    expect(qrSource).toMatch(/from 'react-native-svg'/);
    expect(qrSource).toMatch(/<Svg\b/);
    expect(qrSource).not.toMatch(/WebView|<Image\b|require\(/);
  });

  it('the side is derived from dimension.qr primitives — no baked pixel number', () => {
    expect(qrSource).toMatch(/dimension\.qr\.quietZoneModules/);
    expect(qrSource).toMatch(/dimension\.qr\.moduleMinPx/);
    // the qrSideDp helper multiplies the primitives; the literal 164 is nowhere.
    expect(qrSource).not.toMatch(/\b164\b/);
  });

  it('fills are theme tokens, never hardcoded hex', () => {
    expect(qrSource).toMatch(/theme\.colours\.paper/);
    expect(qrSource).toMatch(/theme\.colours\.ink/);
    expect(qrSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('defaults to DEMO_QR_URL and bakes no domain of its own', () => {
    expect(qrSource).toMatch(/from '\.\/identity'/);
    expect(qrSource).toMatch(/url = DEMO_QR_URL/);
    expect(qrSource).not.toMatch(/https?:\/\//); // the URL lives in identity.ts, not here
  });
});

describe('the hub wiring — the QR card sends the canon vitrine, with a no-scan door', () => {
  it('App renders <QrCode url={DEMO_QR_URL}/> and bakes no live URL of its own', () => {
    expect(appSource).toMatch(/<QrCode url=\{DEMO_QR_URL\}/);
    expect(appSource).toMatch(/from '\.\/src\/qr\/identity'/);
    // no hand-typed https vitrine URL smuggled into the screen.
    expect(appSource).not.toMatch(/https:\/\/beurni2\.github\.io/);
  });

  it('the QR card carries its title, the scan/type legend, and the no-scan fallback', () => {
    expect(appSource).toMatch(/t\('share\.qr_titre'\)/);
    expect(appSource).toMatch(/t\('share\.qr_legende'\)/);
    expect(appSource).toMatch(/tf\('share\.qr_repli', \{ code:/);
  });

  it('the payload the QR carries IS a canon identity URL (real origin, canon slug)', () => {
    expect(isCanonIdentityUrl(DEMO_QR_URL)).toBe(true);
  });
});
