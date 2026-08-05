import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');

/** The `screen === 'gains'` render block, sliced out of App.tsx so the
 *  assertions below are about MES GAINS and not about some other screen that
 *  happens to mention the same words. Anchored on the next screen's guard. */
const gainsBlock = (): string => {
  const start = app.indexOf("{screen === 'gains' && (");
  const end = app.indexOf("{screen === 'ventes' && (", start);
  if (start < 0 || end < 0) throw new Error('the gains block moved — this pin is watching nothing');
  return app.slice(start, end);
};

/**
 * GAINS-OPP-1 — « MES GAINS » DOES NOT SEND HER SOMEWHERE ELSE.
 *
 * Founder, on his phone, 2026-08-05: « When I tap on gains screen I see
 * opportunité there ». He was reading a `SecondaryButton` labelled
 * `opportunites.title` — « Les opportunités » — that sat at the bottom of this
 * screen in EVERY state since 2026-07-15.
 *
 * Why it was wrong, and why a pin rather than just a deletion:
 *   · it is a NOUN, not an action — the 5-second test asks « what happens if I
 *     tap this », and a section name does not answer;
 *   · `gains` is in HUBS, so the TabBar is on-screen the whole time this screen
 *     is — the button was a second, worse route to a destination already one
 *     tap away, and the nearer route is permanently visible;
 *   · §5 gives this screen ONE thing to say, the settled net in the hero.
 * A button that reads as a piece of another screen is how the founder read it,
 * and nothing in the suite would have noticed it coming back.
 */
describe('GAINS-OPP-1 — the gains screen keeps its own subject', () => {
  it('no route to opportunités renders inside the gains screen', () => {
    const block = gainsBlock();
    // the exact defect, by name…
    expect(block).not.toContain("go('opportunites')");
    // …and the label that made it read as another screen's furniture
    expect(block).not.toContain('opportunites.title');
    // any other spelling of the same navigation is refused too, so the fix
    // cannot come back wearing a different label
    expect(block).not.toMatch(/opportunites/);
  });

  it('THE CONTROL: the slice really is the gains screen, and it still renders its own content', () => {
    const block = gainsBlock();
    // if this ever fails, the slice is wrong and the assertions above are
    // vacuously passing over the wrong region of the file
    expect(block).toContain('ventesReelles.gains.titreKey');
    expect(block).toContain('ventesReelles.gains.paliers.map');
    expect(block).toContain('PendingHero'); // the one hero, §5
    // and the METRIC is able to see a route at all — the same navigation
    // spelling IS present elsewhere in App.tsx (the accueil entry), so a
    // matcher that simply never matches would fail here
    expect(app).toContain("go('opportunites')");
  });

  it('the offline retry — the one secondary action this screen keeps — is untouched', () => {
    const block = gainsBlock();
    // removing the stray button must not have taken the honest offline path
    // with it: « hors ligne » still offers a reload, and only in that state
    expect(block).toContain("ventesReelles.gains.kind === 'hors_ligne'");
    expect(block).toContain("t('ventes.reel_chargement')");
  });
});
