import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const at = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

/**
 * ═══ RENDU-RÉEL (Shop+ reseller) — why this app finally has a vitest config ═══
 *
 * It had none: 39 test files, every one a source scan or a pure-model unit,
 * because `App.tsx` imports `react-native` and `react-native` cannot load under
 * vitest. No screen in the reseller app had ever been MOUNTED.
 *
 * The founder's standing order of 2026-08-10 names this surface as one of the
 * three without a harness. The aliases below are what close it — and the slice
 * that needed them (VITRINE-RETRAIT) is exactly the kind the order was written
 * for: a `useEffect` dependency and a new control, both invisible to a scan.
 *
 * THE ALIASES ARE NATIVE BOUNDARIES ONLY. Every one stands in for a module
 * that needs a phone. NOTHING of this app's own code is aliased — the screens,
 * the ports, the money views and the catalog under test are the real files, and
 * the doubles' bounds are stated at the top of each and enforced by
 * `test/rendu-harness.test.ts`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: [at('./test/setup.ts')],
  },
  resolve: {
    alias: [
      // AN ASSET BOUNDARY, not a module: `src/ui/fonts-load.ts` requires .ttf
      // files that only Metro can resolve. Regex form because the imports are
      // relative paths, not a package name. See the double for what it forbids.
      { find: /\.ttf$/, replacement: at('./test/doubles/font-asset.ts') },
      { find: 'react-native-svg', replacement: at('./test/doubles/react-native-svg.tsx') },
      { find: 'react-native', replacement: at('./test/doubles/react-native.tsx') },
      { find: 'expo-crypto', replacement: at('./test/doubles/expo-crypto.ts') },
      { find: 'expo-file-system', replacement: at('./test/doubles/expo-file-system.ts') },
      { find: 'expo-audio', replacement: at('./test/doubles/expo-audio.ts') },
      { find: 'expo-video', replacement: at('./test/doubles/expo-video.ts') },
      // The four small ones share one file — see its header for why they are
      // inert and what that forbids a walk from claiming.
      { find: 'expo-status-bar', replacement: at('./test/doubles/expo-simple.ts') },
      { find: 'expo-font', replacement: at('./test/doubles/expo-simple.ts') },
      { find: 'expo-updates', replacement: at('./test/doubles/expo-simple.ts') },
      { find: 'expo-image-picker', replacement: at('./test/doubles/expo-simple.ts') },
      { find: 'expo-image-manipulator', replacement: at('./test/doubles/expo-simple.ts') },
    ],
  },
});