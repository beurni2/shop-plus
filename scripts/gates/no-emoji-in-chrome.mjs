#!/usr/bin/env node
import { runScanGate } from './scan.mjs';

/**
 * CI gate: no-emoji-in-chrome (Grand Teint §8 — "What Grand Teint refuses:
 * … emoji in chrome"; the design system is inline-SVG + flat colour, ZERO
 * rasters, and emoji are rasters that vary per platform and die in the sun).
 *
 * Chrome = the app surfaces (apps/). Every glyph in chrome must be a canon
 * SVG icon (icons.tsx / grand-teint-icons.ts) sized on a dimension token —
 * never a 🏠/🛍️/💰. This gate is WO-7.0's executioner for the reseller tab
 * bar's emoji: it fires if any pictographic emoji re-enters a rendered surface.
 *
 * The pattern targets the emoji/pictograph blocks only — NOT arrows (←, ›),
 * NOT French accents (é, à), which are legitimate text glyphs.
 */
runScanGate({
  gateName: 'no-emoji-in-chrome',
  invariant: 'Grand Teint §8 — no emoji/rasters in chrome; glyphs are canon SVG icons on a size token',
  defaultRoots: ['apps'],
  patterns: [
    {
      name: 'emoji',
      // Misc Symbols & Pictographs / Emoticons / Transport / Supplemental &
      // Extended-A (1F000–1FAFF) · Misc Symbols & Dingbats (2600–27BF) ·
      // Misc Symbols & Arrows pictographs (2B00–2BFF) · emoji presentation
      // selector (FE0F) · regional-indicator flags (1F1E6–1F1FF).
      regex: /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u,
    },
  ],
});
