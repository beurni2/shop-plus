import Module from 'node:module';

/**
 * RENDU-RÉEL (Shop+ reseller) — the CJS `require` hook, and the one thing it is for.
 *
 * `src/ui/fonts-load.ts` does `require('../../assets/fonts/…ttf')`. Vite's
 * `resolve.alias` rewrites IMPORT specifiers; it does not intercept a CommonJS
 * `require` executed at runtime, so the .ttf still reached Node's loader and
 * failed to parse — the last thing standing between this repo and its first
 * mounted screen. The rider app's harness needed the identical hook.
 *
 * IT INTERCEPTS FONT ASSETS AND NOTHING ELSE. Every other specifier falls
 * straight through to the real loader, so no app module can be silently
 * replaced from here — the aliases in `vitest.config.ts` are the only
 * substitution surface, and they are certified by `test/rendu-harness.test.ts`.
 */
type Loader = (request: string, parent: unknown, isMain: boolean) => unknown;
const M = Module as unknown as { _load: Loader };
const original = M._load;
M._load = function patched(this: unknown, request: string, parent: unknown, isMain: boolean): unknown {
  if (/\.(ttf|otf|woff2?|png|jpg|jpeg|svg)$/.test(request)) return 'rendu:asset';
  return original.call(this, request, parent, isMain);
} as Loader;
