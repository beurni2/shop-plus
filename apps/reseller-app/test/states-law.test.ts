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
/** ACCUEIL-HONESTY-1 — the decisions moved here; the pins follow them. */
const feedScreen = readFileSync(join(appDir, 'src/sales/feed-screen.ts'), 'utf8');

describe('WO-FP-SHOP states-law — every existing rendered state survives the reskin', () => {
  it('EMPTY — the vitrine empty state (kit EmptyState + canon glyph + catalog copy)', () => {
    expect(app).toMatch(/<EmptyState\s+glyph=\{<IconVitrine/);
    expect(app).toMatch(/title=\{t\('vitrine\.vide'\)\}/);
  });

  /**
   * ACCUEIL-HONESTY-1 — THE CLAIM IS THE SAME, THE PIN MOVED WITH THE CODE.
   *
   * `ventes.vide_titre` and `ventes.vide_hint` used to be App.tsx literals, in
   * the ACCUEIL preview — the block that rendered `ventesListModel()` over
   * DEMO_SALES. That block is gone: accueil now paints her real feed and, when
   * there is no list, renders the FEED'S OWN sentence for whatever state it is
   * in. The empty state therefore lives in `feed-screen.ts`, which is where a
   * decision belongs; App.tsx only paints it.
   *
   * So the property is asserted in TWO places, exactly where each half now is,
   * and the state is still title + hint + a way forward.
   */
  it('EMPTY — the ventes empty state (title + hint + a way forward), decided in the model and painted by the screen', () => {
    expect(feedScreen).toMatch(/titreKey: 'ventes\.vide_titre'/);
    expect(feedScreen).toMatch(/hintKey: 'ventes\.vide_hint'/);
    // the way forward is an ACTION, so it stays in the screen
    expect(app).toMatch(/label=\{t\('ventes\.vide_action'\)\}/);
    // …and the screen must actually render whatever title/hint the model chose —
    // a model that decides an empty state nobody paints is not a state.
    expect(app).toMatch(/title=\{t\(ventesReelles\.ecran\.titreKey\)\}/);
    expect(app).toMatch(/title=\{t\(accueil\.apercuEtatKey\)\}/);
  });

  /**
   * ACCUEIL-HONESTY-1 — the home screen's own honest states. Before this slice
   * it had none: it always had two FCFA figures to show, because both were
   * invented. Now the no-figure case is a designed state.
   */
  it('SILENCE — accueil shows a sentence instead of a figure when no honest number exists', () => {
    expect(app).toMatch(/accueil\.gains\.kind === 'chiffres' \? \(/);
    expect(app).toMatch(/styles\.ledgerSilence/);
    expect(app).toMatch(/\{t\(accueil\.gains\.titreKey\)\}/);
    expect(app).toMatch(/\{t\(accueil\.gains\.texteKey\)\}/);
    // AND THE DEMO SOURCES ARE NOT REACHABLE FROM THIS SCREEN AT ALL.
    // Asserted on the IMPORT, not on the word: a comment explaining why they
    // were removed is worth keeping, and a substring ban would forbid the
    // explanation while still permitting a re-import written differently.
    // Un-imported is the property — what cannot be named cannot be rendered.
    for (const demo of ['MONTHLY_NET_DEMO', 'enAttenteNet', 'ventesListModel']) {
      expect(app, `${demo} must not be imported by App.tsx`).not.toMatch(
        new RegExp(`^\\s*${demo},\\s*$`, 'm'),
      );
    }
  });

  it('PREVIEW/SANDBOX — the honest « aperçu » banner rides behind IS_PREVIEW', () => {
    expect(app).toMatch(/\{IS_PREVIEW && \(/);
    expect(app).toMatch(/styles\.previewBanner/);
    expect(app).toMatch(/t\('preview\.banner'\)/);
  });

  /**
   * RF-1c — THE RULING, recorded where the pin used to be.
   *
   * The « problème » encart was a DEMO state: `sales/ventes.ts` invented a
   * `probleme` status alongside `en_route` and `livrée`, none of which this
   * platform can prove. The ventes screen now reads the REAL feed, and the
   * real wire has no problem state — a `payment_failed` order never becomes a
   * sale at all, so there is nothing to render. Pinning a problem encart on
   * this screen would have forced a designed state for a condition that
   * cannot occur, which is the same lie in the other direction.
   *
   * The states-law property is UNCHANGED and better served: the screen now
   * carries MORE honest states than it did, and they are pinned below. When a
   * real failure path exists (E2–E3 refusal ladder / refunds), its designed
   * state comes back here with a wire behind it.
   */
  it('HONEST STATES — the real ventes screen designs every outcome it can reach', () => {
    // RESELLER-ACCOUNTS-1d — the entrance is the ACCOUNT (signup/login →
    // admission code → open). The pin follows the door: the account screens
    // mount inside the gate branch, and the legacy type-a-feed-code path has
    // NO mount left anywhere.
    expect(app).toMatch(/<EcranCompte/);
    expect(app).toMatch(/<EcranAdmission/);
    expect([...app.matchAll(/ventesReelles\.ouvrir\(/g)]).toHaveLength(0);
    // offline gets a way forward, not an error wall
    expect(app).toMatch(/ecran\.kind === 'hors_ligne'/);
    expect(app).toMatch(/ventesReelles\.recharger\(\)/);
    // a partial read and a non-sale row are SHOWN, in the designed encart
    expect(app).toMatch(/ecran\.noticeKeys/);
    expect(app).toMatch(/styles\.problemeEncart/);
    // and the follow-up says plainly where it stops
    expect(app).toMatch(/t\('ventes\.reel_suite'\)/);
  });

  it('MARKUP — the per-product marge slider is a designed interactive state (Ma Vitrine)', () => {
    // WO-VITRINE-FLOW (founder redirect): the ≤3 multi-select is dropped; the
    // designed interactive state is now the per-product markup slider on Ma Vitrine.
    expect(app).toMatch(/<MarginSlider/);
    expect(app).toMatch(/setMarkups\(\(prev\) =>/);
    // the empty vitrine surface is honest too — an EmptyState when the seam's
    // live listings are empty, never a blank screen. PUBLISH-PRICE-1: the grid now
    // reads the LIVE offer feed filtered by membership, so the name changed with it.
    expect(app).toMatch(/vitrineOffers\.length === 0 \? \(/);
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
