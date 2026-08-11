/**
 * RENDU-RÉEL (Shop+ reseller) — a FONT FILE, doubled.
 *
 * `src/ui/fonts-load.ts` does `require('../../assets/fonts/…ttf')`, which Metro
 * resolves to an asset handle and vitest cannot parse at all — it was the first
 * thing that stopped the real App from importing here.
 *
 * IT IS AN OPAQUE HANDLE AND NOTHING ELSE. No walk may claim anything about
 * typography from it: whether the right face loads, at the right weight, is the
 * font-pipeline suite's job over the real files and the founder's eyes on a
 * phone. This exists so the screens MOUNT.
 */
export default 'rendu:font-asset';
