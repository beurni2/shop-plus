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
    // COMMENTS STRIPPED FIRST, and that is load-bearing: the block now carries
    // prose ABOUT this defect, so a case-insensitive scan of the raw region
    // matches the explanation rather than any code. Un-accent one word in a
    // comment and the pin would fail spuriously; scan the code only.
    const code = gainsBlock().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    // the exact defect, by name…
    expect(code).not.toContain("go('opportunites')");
    // …and the label that made it read as another screen's furniture
    expect(code).not.toContain('opportunites.title');
    // …and ANY spelling of the word in code — accented or not, upper or lower,
    // so an extracted `<OpportunitesLink />` or a `const OPP = 'opportunites'`
    // hop cannot walk the button back in under a different name.
    expect(code).not.toMatch(/opportunit/i);
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

  it('NO STATE IS A BARE TITLE: every non-ladder state says what is happening', async () => {
    // The other half of the founder's report. That button was the last element
    // on four of these states; deleting it would have left « Mes gains » alone
    // on an empty screen — including on a fresh install, which is the FIRST
    // thing a new reseller sees when she taps Gains.
    const { ecranDesGains } = await import('../src/sales/gains-screen');
    const vues = [
      { kind: 'non_branche' }, { kind: 'verrouille' }, { kind: 'chargement' },
      { kind: 'refus' }, { kind: 'hors_ligne' },
    ] as const;
    const titres = new Set<string>();
    for (const vue of vues) {
      const e = ecranDesGains(vue as Parameters<typeof ecranDesGains>[0]);
      expect(e.paliers, `${vue.kind} has no ladder`).toHaveLength(0);
      // chargement is the one state that legitimately says only « Lecture… » —
      // a hint under a spinner is noise, and it is transient by definition
      if (vue.kind !== 'chargement') {
        expect(e.hintKey, `${vue.kind} is a bare title`).toBeDefined();
      }
      titres.add(e.titreKey);
    }
    // …and no two of the five wear the same face. « Mes gains » used to title
    // both `verrouille` and `chargement`: two different truths, one screen.
    expect(titres.size).toBe(vues.length);
    // the ladder state keeps its own voice and gains no hint — it has the
    // ladder to speak with
    const echelle = ecranDesGains({ kind: 'echelle', paliers: [], incomplet: false, sansObligation: 0 } as Parameters<typeof ecranDesGains>[0]);
    expect(echelle.hintKey).toBeUndefined();
    expect(echelle.sousTitreKey).toBe('gains.sous_titre');
  });
});
