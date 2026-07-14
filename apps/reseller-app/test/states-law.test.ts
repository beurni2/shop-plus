import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WO-FP-SHOP · THE STATES-LAW LIST — every state the reseller surface renders
 * survives the Faso Premium reskin (honest states are designed states, §5). The
 * reskin changed the TOKEN layer, never the state logic, so each state below
 * must still render; this test is the enumerated proof (source-discipline — the
 * repo asserts the source, there being no RN renderer in the sandbox).
 *
 * NOT a state: the kit's <Skeleton> exists as a component but the demo world
 * loads synchronously, so no screen mounts a skeleton today — it is available,
 * not rendered. Listing it as a live state would be a lie (honest states law).
 */

const appDir = join(import.meta.dirname, '..');
const app = readFileSync(join(appDir, 'App.tsx'), 'utf8');

describe('WO-FP-SHOP states-law — every existing rendered state survives the reskin', () => {
  it('EMPTY — the vitrine empty state (kit EmptyState + canon glyph + catalog copy)', () => {
    expect(app).toMatch(/<EmptyState\s+glyph=\{<IconVitrine/);
    expect(app).toMatch(/title=\{t\('vitrine\.vide'\)\}/);
  });

  it('EMPTY — the ventes empty state (title + hint + a way forward)', () => {
    expect(app).toMatch(/title=\{t\('ventes\.vide_titre'\)\}/);
    expect(app).toMatch(/hint=\{t\('ventes\.vide_hint'\)\}/);
    expect(app).toMatch(/label=\{t\('ventes\.vide_action'\)\}/);
  });

  it('PREVIEW/SANDBOX — the honest « aperçu » banner rides behind IS_PREVIEW', () => {
    expect(app).toMatch(/\{IS_PREVIEW && \(/);
    expect(app).toMatch(/styles\.previewBanner/);
    expect(app).toMatch(/t\('preview\.banner'\)/);
  });

  it('PROBLÈME — the ventes problem encart (a designed problem state, never an error wall)', () => {
    expect(app).toMatch(/item\.status === 'probleme'/);
    expect(app).toMatch(/styles\.problemeEncart/);
    expect(app).toMatch(/t\('ventes\.probleme_encart'\)/);
  });

  it('SELECTION — chosen ⇄ unchosen (the signature swap + accent frame, driven by isSelected)', () => {
    expect(app).toMatch(/const chosen = isSelected\(world, item\.id\)/);
    expect(app).toMatch(/<SelectionSwap selected=\{chosen\}/);
    expect(app).toMatch(/<CornerTicks show=\{chosen\}/);
    // the empty selection surface is honest too — the vitrine shows an EmptyState
    // when nothing is chosen (selection.length === 0), never a blank screen.
    expect(app).toMatch(/selection\.length === 0 \? \(/);
  });

  it('TIMELINE — done · now · later custody phases all render (S7 detail)', () => {
    const timeline = readFileSync(join(appDir, 'App.tsx'), 'utf8');
    expect(timeline).toMatch(/step\.phase === 'done'/);
    expect(timeline).toMatch(/step\.phase === 'now'|const now = step\.phase === 'now'/);
    expect(timeline).toMatch(/step\.phase === 'later'/);
    expect(timeline).toMatch(/styles\.timelineDotNow/);
  });

  it('DISABLED — the primary button carries a disabled state (kit buttonDisabled)', () => {
    const kit = readFileSync(join(appDir, 'src/ui/kit.tsx'), 'utf8');
    expect(kit).toMatch(/disabled === true && styles\.buttonDisabled/);
    expect(kit).toMatch(/buttonDisabled: \{ opacity: interaction\.disabledOpacity \}/);
  });
});
