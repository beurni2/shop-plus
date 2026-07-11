import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';

/**
 * WO-4.0 Part B — the visual evidence pack: one screenshot per BUILT state,
 * driven through the exact demo-state params the E2 harness already uses.
 * The inventory (and its named GAPS) lives in /gallery/states.json — a
 * state listed there with no screenshot is a listed gap, never silent.
 */

const repoRoot = join(import.meta.dirname, '../../..');
const manifest = JSON.parse(readFileSync(join(repoRoot, 'gallery/states.json'), 'utf8')) as {
  viewport: { width: number; height: number };
  groups: { title: string; states: { id: string; url: string }[] }[];
};

test.use({ viewport: manifest.viewport });

const imgDir = join(repoRoot, 'gallery/img');
mkdirSync(imgDir, { recursive: true });

for (const group of manifest.groups) {
  for (const state of group.states) {
    test(`gallery: ${state.id}`, async ({ page }) => {
      await page.goto(state.url);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: join(imgDir, `${state.id}.png`), fullPage: true });
    });
  }
}
