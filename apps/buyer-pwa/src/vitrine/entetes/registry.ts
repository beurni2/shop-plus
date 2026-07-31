import type { EnteteKey } from '../entetes';
import type { Vals } from '../entetes';

/**
 * ENTETES-G — THE PAYLOAD ARCHITECTURE, and why it exists.
 *
 * MEASURED, not assumed: `entetes.ts` is ~30 KB gzipped for TEN styles — 15.9 KB
 * of CSS and 14.3 KB of render code, about 3 KB per style. The founder has
 * authorised twenty more, which is ~60 KB against roughly 20 KB of remaining
 * budget headroom. They cannot ship in the initial bundle, and splitting only
 * the CSS would recover half and still miss.
 *
 * A SHOP DRAWS EXACTLY ONE HEADER. So every new style lives in its own module
 * carrying BOTH its render unit and its CSS, reached through a dynamic
 * `import()` that Vite emits as its own chunk. A cliente downloads the shared
 * shell plus the ONE style her seller chose; the other nineteen cost her
 * nothing — no parse, no bytes, no battery.
 *
 * TWO-TIER DISPATCH, DELIBERATELY AND TEMPORARILY. The ten styles that already
 * shipped stay compiled into `entetes.ts`: they are already inside the budget,
 * and moving working code earns a regression risk with nothing visible in
 * return. `renderEntete` therefore checks this registry FIRST and falls back to
 * its built-in switch. That is one dispatch with a documented two-tier lookup,
 * not two mechanisms — and collapsing it (migrating the ten into modules, which
 * would return ~22 KB to the budget) is a named follow-up slice, not a
 * permanent shape.
 *
 * NO RACE BY CONSTRUCTION. `renderEntete` stays SYNCHRONOUS — 667 tests and two
 * call sites depend on that — so a unit must be registered before it is drawn.
 * `flows.ts` awaits `loadEntete` inside the same `.then` that already awaits the
 * storefront, and the only screens that draw a header (`empty`, `ready`) come
 * after it. The loading skeleton draws no header at all, so nothing flashes and
 * nothing swaps under the cliente's eyes.
 */

/** One style: its drawing and its stylesheet, which travel together or not at all. */
export interface EnteteUnit {
  readonly render: (v: Vals) => string;
  readonly css: string;
}

/**
 * The lazily-loaded styles, key → chunk. Each entry MUST be a literal
 * `import()` of a literal path: that is what lets the bundler see the edge and
 * emit a separate chunk. A computed specifier silently collapses back into one
 * bundle, which is the whole failure this file exists to prevent — and the
 * chunk-count test would catch it.
 *
 * ENTETES-H — the first of the twenty. Each entry is a literal path so the
 * bundler emits `indigo` as its own chunk; a shop that has not chosen it never
 * downloads a byte of it.
 */
const LOADERS: Partial<Record<EnteteKey, () => Promise<{ unit: EnteteUnit }>>> = {
  indigo: () => import('./indigo'),
  couture: () => import('./couture'),
  safran: () => import('./safran'),
  grenat: () => import('./grenat'),
  kraft: () => import('./kraft'),
  audace: () => import('./audace'),
  fleurie: () => import('./fleurie'),
  prisme: () => import('./prisme'),
  pop: () => import('./pop'),
  chrome: () => import('./chrome'),
};

const LOADED = new Map<EnteteKey, EnteteUnit>();

/** Register a fetched unit. The loader below is the only production caller;
 *  it is exported so the mechanism can be exercised without a real chunk. */
export const registerEntete = (key: EnteteKey, unit: EnteteUnit): void => void LOADED.set(key, unit);

/** Drop every registration — test hygiene, so one case cannot leak into the next. */
export const resetEntetes = (): void => LOADED.clear();

/** Is this key served by a lazy module (rather than the compiled-in ten)? */
export const isLazyEntete = (key: EnteteKey): boolean => LOADERS[key] !== undefined;

/** The unit, iff it has already been fetched. Never triggers a fetch itself:
 *  a synchronous renderer must not start async work it cannot wait for. */
export const loadedEntete = (key: EnteteKey): EnteteUnit | undefined => LOADED.get(key);

/**
 * Fetch and register the style, once. Safe to call for any key: a compiled-in
 * style (or `classique`) has no loader and resolves immediately, so callers do
 * not branch on which tier a key belongs to.
 *
 * A FAILED FETCH IS NOT A CRASH. Patchy data is this market's normal condition,
 * and a header that throws would take the whole shop page with it. On failure
 * the key simply stays unregistered and `renderEntete` draws `classique` — her
 * products, her prices and her proof all still reach the buyer, in the shipped
 * default header. That is the ENTETES-E0 law, and it is why it exists.
 */
export async function loadEntete(key: EnteteKey): Promise<void> {
  if (LOADED.has(key)) return;
  const loader = LOADERS[key];
  if (loader === undefined) return;
  try {
    const mod = await loader();
    registerEntete(key, mod.unit);
  } catch {
    /* offline or a failed chunk — classique draws instead, never a blank shop */
  }
}

/** TEST SEAM — load every lazy style, so a suite can assert across all of them
 *  without knowing the chunk layout. Never called by the app. */
export async function loadAllEntetes(): Promise<void> {
  await Promise.all((Object.keys(LOADERS) as EnteteKey[]).map((k) => loadEntete(k)));
}

/** The CSS of every style fetched so far — what `flows.ts` mounts alongside the
 *  base sheet. A style's rules reach the page only once its chunk has arrived,
 *  which is exactly when its markup can appear. */
export const loadedEnteteCss = (): string =>
  [...LOADED.values()].map((u) => u.css).join('\n');
