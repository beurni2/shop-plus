import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_FAMILY, FONT_FALLBACK, FONT_WEIGHTS } from '../src/ui/fonts';

/**
 * WO-5.1 — the Grand Teint SUBSTRATE: design reference, typeface, icon
 * components, the two approved deps. NO screen work, NO token consumption.
 * The repo idiom is source-discipline (no RN renderer), so the icon proof is
 * geometry-identity: every component carries the EXACT path/circle/rect
 * geometry of its design-reference SVG, and honors currentColor.
 */

const appDir = join(import.meta.dirname, '..');
const repoRoot = join(appDir, '../..');
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');
const iconsSrc = read('src/ui/icons.tsx');
const svgDir = join(repoRoot, 'design-reference/grand-teint/icons');
const svgNames = readdirSync(svgDir).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();

describe('the 29 icon components carry the design-reference geometry (byte-identity)', () => {
  it('there are exactly 29 canonical glyphs, and 29 components', () => {
    expect(svgNames).toHaveLength(29);
    expect(iconsSrc.match(/export function Icon\w+\(/g)).toHaveLength(29);
  });

  it('every path `d`, circle and rect from every SVG appears verbatim in its component', () => {
    for (const name of svgNames) {
      const svg = readFileSync(join(svgDir, `${name}.svg`), 'utf8');
      // pull the geometry-bearing attributes out of the source SVG
      const ds = [...svg.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
      const circles = [...svg.matchAll(/<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g)];
      for (const d of ds) {
        expect(iconsSrc, `${name}: path d not carried verbatim`).toContain(`d="${d}"`);
      }
      for (const c of circles) {
        expect(iconsSrc, `${name}: circle not carried`).toContain(`cx={${c[1]}}`);
        expect(iconsSrc, `${name}: circle not carried`).toContain(`cy={${c[2]}}`);
      }
    }
  });

  it('every component defaults to currentColor and threads it to every stroke/fill', () => {
    const comps = iconsSrc.split('export function Icon').slice(1);
    expect(comps).toHaveLength(29);
    for (const c of comps) {
      expect(c).toMatch(/color = 'currentColor'/); // the default
      expect(c).toMatch(/stroke=\{color\}/); // stroke threads it
      expect(c).toMatch(/color=\{color\}/); // Svg color prop → resolves currentColor on children
      expect(c).toMatch(/width=\{size\} height=\{size\}/); // sized by prop, default 20
      expect(c).toMatch(/viewBox="0 0 24 24"/);
    }
    expect(iconsSrc).toMatch(/size = 20/); // legible-at-20dp default
    expect(iconsSrc).toMatch(/from 'react-native-svg'/);
  });

  it('the module carries no hardcoded color — currentColor only (zero-hardcode)', () => {
    expect(iconsSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(iconsSrc).not.toMatch(/\brgba?\(|\bhsla?\(/);
  });
});

describe('the typeface substrate (Archivo, Latin) — data only, loads nothing', () => {
  it('the family + fallback match the design tokens (Archivo over a metrics-matched system fallback)', () => {
    const tokens = JSON.parse(
      readFileSync(join(repoRoot, 'design-reference/grand-teint/docs/tokens.json'), 'utf8'),
    ) as { type: { family: string; familyFallback: string } };
    expect(FONT_FAMILY).toBe(tokens.type.family);
    expect(FONT_FAMILY).toBe('Archivo');
    expect(FONT_FALLBACK).toBe('System'); // RN's metrics-close system face
    expect(tokens.type.familyFallback).toContain('system-ui');
  });

  it('the five static weights the design uses exist on disk (400/500/700/800/900)', () => {
    expect(Object.keys(FONT_WEIGHTS).map(Number).sort((a, b) => a - b)).toEqual([400, 500, 700, 800, 900]);
    let total = 0;
    for (const file of Object.values(FONT_WEIGHTS)) {
      const p = join(appDir, 'assets/fonts', file);
      const size = statSync(p).size;
      expect(size, `${file} present + non-trivial`).toBeGreaterThan(10_000);
      total += size;
    }
    // within the design's 180–240 KB estimate (budget.md), no runaway
    expect(total).toBeLessThan(240 * 1024);
  });

  it('the substrate GATES NOTHING: it is data, with no font loader and no expo-font import (cold-start law)', () => {
    // comments stripped: the docblock EXPLAINS the loader belongs elsewhere.
    const src = read('src/ui/fonts.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/expo-font|loadAsync|useFonts/); // no loader here — first paint never waits
    expect(src).not.toMatch(/\brequire\(/); // no binary asset require in the data module
  });
});

describe('the approved dependencies (founder rulings) — nothing else', () => {
  it('react-native-svg + expo-haptics + expo-font + expo-audio at the SDK-54 bundled versions, and no other new dep', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['react-native-svg']).toBe('15.12.1');
    expect(pkg.dependencies['expo-haptics']).toBe('~15.0.8');
    // expo-font — founder ruling 2026-07-14 (WO-FP-SHOP: load the Faso Premium faces
    // so the expo-preview evidence shows the real Bricolage/Instrument, cold-start law).
    expect(pkg.dependencies['expo-font']).toBe('~14.0.12');
    // expo-audio — founder ruling 2026-07-19: REAL on-device per-product voice
    // capture (record/stop/playback + mic permission), no backend (persistence
    // stays mocked). SDK-54 bundled version.
    expect(pkg.dependencies['expo-audio']).toBe('~1.1.1');
    // VIDEO-PARTOUT — expo-video, FOUNDER RULING 2026-08-03, given with the cost
    // stated and accepted: « yes add video to the reseller app ». This app had NO
    // video capability at all, so « opportunités » and « ma vitrine » could not
    // show a clip whatever the wire carried. It is a NATIVE module: the two
    // screens cannot arrive as an over-the-air update — the app needs a rebuild.
    // Version read from `expo/bundledNativeModules.json` for SDK 54, never guessed.
    expect(pkg.dependencies['expo-video']).toBe('~3.0.16');
    // APERÇU EN-TÊTE — react-native-webview, FOUNDER RULING 2026-08-03, given
    // after the cost was stated and the cheaper option offered: I told him a
    // WebView is a NATIVE module and cannot ship over the air, and proposed
    // rendered screenshots instead (OTA, but a representative shop rather than
    // his own). He answered « on the en-tête preview build it with the RN
    // webview ». So the preview sheet is dark until the next eas build, by his
    // choice, and the guarded require in entete-sheet.tsx makes that a smaller
    // promise honestly kept instead of a launch crash.
    //
    // THE ONE NON-EXPO RUNTIME DEP IN THIS APP, and named as such: no first-party
    // Expo module renders arbitrary HTML, so the « prefer expo, it reaches Expo
    // Go over the air » rule below has nothing to prefer here. 13.15.0 is what
    // `expo/bundledNativeModules.json` pins for SDK 54 — read, not guessed.
    expect(pkg.dependencies['react-native-webview']).toBe('13.15.0');
    // RESELLER-IDENTITY-1 — expo-crypto (the OS CSPRNG, replacing a Math.random mint)
    // and expo-file-system (the document directory, so the identity survives restart
    // and an EAS republish). BOTH are first-party Expo SDK modules, at the versions
    // `expo/bundledNativeModules.json` pins for SDK 54 — which is what lets them reach
    // Expo Go over the air with no rebuild. A community module would not have that
    // guarantee, and that is the whole reason for preferring these two.
    expect(pkg.dependencies['expo-crypto']).toBe('~15.0.9');
    expect(pkg.dependencies['expo-file-system']).toBe('~19.0.23');
    // MONEY-SHAPE-1 — @shop-plus/reseller-money is a WORKSPACE package, not a
    // third-party dependency, and it is the founder-ordered home of the markup
    // ceiling now that the SERVICE signs the price: « a service that signs must
    // bound », and the rule may not live only in the app whose authority over money
    // was removed. It is DEPENDENCY-FREE (its own test asserts an empty
    // `dependencies` and no import statements), so it adds nothing to the native
    // surface — and Metro bundling it was PROVEN by `expo export`, with a negative
    // control showing an unresolvable workspace import fails the build outright.
    expect(pkg.dependencies['@shop-plus/reseller-money']).toBe('workspace:*');
    // PERSONNALISER-MEDIA-1 — expo-image-picker, founder ruling 2026-07-27: REAL
    // cover/avatar photos from her gallery. Before it, the app had NO image
    // dependency at all, so K3's « add a photo » was a setTimeout with no file —
    // capture was not broken, it was absent. Same first-party guarantee as
    // expo-crypto/file-system: the version below is what
    // `expo/bundledNativeModules.json` pins for SDK 54 (VERIFIED by reading that
    // manifest, not assumed), which is what lets it reach Expo Go over the air
    // with no rebuild. The PERMISSION prompt on device is the one thing a
    // manifest cannot prove — every failure is therefore named and surfaced.
    expect(pkg.dependencies['expo-image-picker']).toBe('~17.0.11');
    // MEDIA-2 — expo-image-manipulator, and it is what makes the picker USABLE.
    // The picker has NO max-dimension option (read its real `.d.ts`: `quality` is a
    // JPEG compression factor, nothing more), and the service refuses anything over
    // 2048 px — so every photograph from a phone camera (3264 x 2448 and up) was
    // refused, permanently, with advice about file weight that could never fix a
    // DIMENSION problem. The downscale happens on the device, before the bytes
    // leave: it is also the only version that respects a patchy-data budget.
    // ~14.0.8 is what `expo/bundledNativeModules.json` pins for SDK 54 (VERIFIED by
    // reading that manifest), so it reaches Expo Go over the air with no rebuild.
    expect(pkg.dependencies['expo-image-manipulator']).toBe('~14.0.8');
    // the only deps beyond the pre-WO set are exactly these eleven
    const before = new Set([
      '@platform/ui-tokens', 'expo', 'expo-status-bar', 'expo-updates', 'react', 'react-native',
    ]);
    const added = Object.keys(pkg.dependencies).filter((d) => !before.has(d));
    expect(added.sort()).toEqual([
      '@shop-plus/reseller-money',
      'expo-audio', 'expo-crypto', 'expo-file-system', 'expo-font', 'expo-haptics',
      'expo-image-manipulator', 'expo-image-picker', 'expo-video',
      'react-native-svg', 'react-native-webview',
    ]);
    // …and NO third-party runtime dep sneaks in under cover of the workspace one.
    // The two `react-native-*` names are ENUMERATED, not pattern-matched: a
    // prefix rule would silently admit the next community module someone adds,
    // and admitting a native dependency is exactly the decision that must stay
    // the founder's rather than a regex's.
    const NON_EXPO_ALLOWED = new Set(['react-native-svg', 'react-native-webview']);
    for (const d of added) {
      expect(d.startsWith('@shop-plus/') || d.startsWith('expo') || NON_EXPO_ALLOWED.has(d), d).toBe(true);
    }
  });
});
