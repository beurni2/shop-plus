import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PICKABLE_HEADER_STYLES } from '../src/vitrine/customize/storefront.js';

const read = (...rel: string[]): string => readFileSync(join(import.meta.dirname, '..', ...rel), 'utf8');
const sheet = read('src', 'vitrine', 'customize', 'entete-sheet.tsx');
const screens = read('src', 'vitrine', 'customize', 'screens.tsx');
const catalog = JSON.parse(read('i18n', 'catalog.json')) as { entries?: unknown } | unknown[];
const entries = (Array.isArray(catalog) ? catalog : (catalog.entries as unknown[])) as ReadonlyArray<{
  key: string; fr: string; register?: string; screenClass?: string;
}>;

/**
 * APERÇU EN-TÊTE — the founder's flow, 2026-08-03:
 *   « you tap on one theme and a screen slides up from bottom to show the
 *     preview of that en-tête … he just taps appliquer from that screen … or
 *     slide the screen back down and tap another theme »
 *   « I do not want to leave the app and open it on a browser »
 */

describe('1 · the WebView can never crash an older binary', () => {
  it('the native module is a GUARDED RUNTIME REQUIRE, never a static import', () => {
    // THE HAZARD, stated because it already cost this project a launch crash:
    // `screens.tsx` imports this file at the top level, so a static import of a
    // native module is not a broken sheet — it is the whole Personnaliser flow
    // dead on launch, delivered over the air to a phone that worked.
    expect(sheet).not.toMatch(/^import .*from 'react-native-webview'/m);
    expect(sheet).toContain("require('react-native-webview')");
    expect(sheet).toMatch(/catch\s*\{\s*\n\s*return null;/);
  });

  it('the decision is made ONCE at module scope, so the hook set never varies', () => {
    const compStart = sheet.indexOf('export function EnteteApercuSheet');
    expect(sheet.indexOf("require('react-native-webview')")).toBeLessThan(compStart);
    expect(compStart).toBeGreaterThan(0); // CONTROL — the component really is there
  });

  it('WITHOUT the module the sheet still opens, still applies, and SAYS WHY', () => {
    // A smaller promise honestly kept, not a crash and not a blank box.
    expect(sheet).toContain("const Web = RN_WEBVIEW === null ? null : RN_WEBVIEW.WebView;");
    expect(sheet).toContain('{Web === null || url === null ? (');
    expect(sheet).toContain("RN_WEBVIEW === null ? 'k.entete.apercu_maj' : 'k.entete.apercu_hors_ligne'");
    // « Appliquer » sits OUTSIDE that branch — she can choose a style on a
    // binary that cannot yet preview it.
    const after = sheet.slice(sheet.indexOf('</View>', sheet.indexOf('S.entScene')));
    expect(after).toContain("t('k.entete.appliquer')");
  });
});

describe('2 · looking is not applying', () => {
  it('a card TAP opens the sheet; only « Appliquer » writes the style', () => {
    // The old grid saved on every tap, so browsing 43 styles meant 43 writes to
    // her LIVE shop, each visible to any client who happened to be looking.
    expect(screens).toContain('onPress={() => setApercu(key)}');
    const grid = screens.slice(screens.indexOf('PICKABLE_HEADER_STYLES.map'), screens.indexOf('<EnteteApercuSheet'));
    expect(grid.length).toBeGreaterThan(200); // CONTROL — a real slice, not an empty one
    expect(grid).not.toContain('onPickEntete(');
    // the sheet is the ONLY caller now
    expect(screens).toMatch(/onApply=\{\(k\) => \{\s*\n\s*setApercu\(null\);\s*\n\s*onPickEntete\(k\);/);
  });

  it('dismissing changes NOTHING — no apply on close', () => {
    const sheetProps = screens.slice(screens.indexOf('<EnteteApercuSheet'), screens.indexOf('</ScrollView>', screens.indexOf('<EnteteApercuSheet')));
    expect(sheetProps).toContain('onClose={() => setApercu(null)}');
    expect(sheetProps).not.toMatch(/onClose=\{[^}]*onPickEntete/);
  });
});

describe('3 · the preview is HER REAL PAGE, not a drawing', () => {
  it('the url is her live shop with the buyer PWA’s own ?entete= override', () => {
    // Built in qr/identity.ts — WITHOUT a native import — precisely so a test
    // can reach it. A builder that no test can load is a builder nobody checks,
    // and this one puts a slug straight into a path segment.
    expect(sheet).toContain("import { apercuEnteteUrl } from '../../qr/identity'");
    expect(sheet).toContain('apercuEnteteUrl(liveSlug, styleKey)');
  });

  it('EVERY pickable style produces a well-formed, escaped url', async () => {
    const { apercuEnteteUrl: apercuUrl } = await import('../src/qr/identity.js');
    for (const key of PICKABLE_HEADER_STYLES) {
      const u = apercuUrl('chez-aicha-1', key);
      // PIN EVOLVED 2026-08-04: the url now also carries `apercu-nu`, which
      // blanks the photo frames on the previewed page — he is comparing FRAMES,
      // and his own cover filling each one is what hides the difference.
      expect(u, key).toMatch(/^https:\/\/[^ ]+\/v\/chez-aicha-1\?entete=[a-z0-9]+&apercu-nu=1$/);
    }
    // a hostile slug cannot break out of the path segment
    expect(apercuUrl('a/b?x=1', 'royale')).toContain('a%2Fb%3Fx%3D1');
    // and the blanking flag is on EVERY preview, not just the sampled one
    for (const key of PICKABLE_HEADER_STYLES) {
      expect(apercuUrl('s', key), key).toContain('&apercu-nu=1');
    }
  });
});

describe('4 · the honest states are real states', () => {
  it('loading and failure are DESIGNED, never a blank white box', () => {
    // A WebView that fails renders white by default, which on this screen reads
    // as « your header is empty » — a lie about her shop caused by her network.
    expect(sheet).toContain("t('k.entete.apercu_chargement')");
    expect(sheet).toContain("t('k.entete.apercu_echec')");
    expect(sheet).toContain('onError={() => setEtat(\'echec\')}');
    // PIN EVOLVED 2026-08-04: `onHttpError` is no longer a blanket failure —
    // the SPA fallback's 404 is the mechanism, not a fault (see describe 5).
    // It still fails on every other status, which is what this asserts.
    expect(sheet).toContain('setEtat(\'echec\');');
    expect(sheet).toContain('e.nativeEvent.statusCode !== 404');
    // and a failure offers the way out, not just the news
    expect(sheet).toContain("t('k.cover.reessayer')");
  });

  it('every string it shows is IN THE CATALOG with a register tag', () => {
    for (const key of ['k.entete.appliquer', 'k.entete.apercu_chargement', 'k.entete.apercu_echec', 'k.entete.apercu_hors_ligne', 'k.entete.apercu_maj']) {
      const e = entries.find((x) => x.key === key);
      expect(e, `${key} missing from the catalog`).toBeDefined();
      expect(e!.fr.length, `${key} empty`).toBeGreaterThan(0);
      expect(e!.register, `${key} untagged`).toBeTruthy();
    }
  });
});

describe('5 · the founder’s three defects, 2026-08-04', () => {
  it('THE SPA FALLBACK’S 404 IS NOT A FAILURE — it is how every /v/ link resolves', () => {
    // His screenshot showed « Aperçu pas affiché » over a shop that was online.
    // GitHub Pages is a STATIC host: /shop-plus/v/{slug} matches no file, so it
    // answers 404 with 404.html, whose script rewrites the path and the app
    // boots. Treating that as an error painted failure over a page that was
    // about to load. Every OTHER status is still a real failure.
    expect(sheet).toContain('if (e.nativeEvent.statusCode !== 404) setEtat(\'echec\');');
    expect(sheet).toContain("onError={() => setEtat('echec')}"); // a dead network still fails
  });

  it('THE SHEET CAN BE SWIPED DOWN, and the drag lives OUTSIDE the WebView', () => {
    // « it's not smooth and takes a lot of time and I have to do it multiple
    // times » — there was no drag at all: Modal slide animates open/close only,
    // and every downward swipe landed inside the WebView, which swallows
    // touches. A handle drawn OVER the WebView would be just as dead.
    expect(sheet).toContain('PanResponder.create');
    expect(sheet).toContain('onPanResponderRelease');
    // the grip wraps the handle + title, and the WebView is NOT inside it
    const grip = sheet.slice(sheet.indexOf('{...pan.panHandlers}'), sheet.indexOf('S.entScene'));
    expect(grip.length).toBeGreaterThan(60); // CONTROL — a real slice
    expect(grip).not.toContain('<Web');
    // a half-swipe springs back rather than leaving her guessing
    expect(sheet).toContain('Animated.spring(glisse');
  });

  it('the dismiss threshold is a real distance OR a flick, not a hair trigger', async () => {
    /**
     * THIS USED TO ASSERT THE MODULE COULD NOT BE IMPORTED, and said so: « the
     * module cannot be imported (native WebView), so the value is read from
     * source — the honest way, rather than pretending the import worked. » That
     * was true and is no longer: RENDU-RÉEL doubles the native boundaries, so
     * the real module loads and the real constant can be read BY EXECUTION —
     * strictly stronger than a regex over its declaration. Asserting `null` now
     * would be asserting the harness is absent.
     */
    const { SEUIL_FERMETURE } = (await import('../src/vitrine/customize/entete-sheet.js')) as {
      SEUIL_FERMETURE: number;
    };
    expect(SEUIL_FERMETURE).toBe(120);
    // The CONDITION still comes from source — it is a branch inside a gesture
    // handler this harness deliberately does not simulate (see the double's
    // stated bound: no gesture system).
    expect(sheet).toContain('g.dy > SEUIL_FERMETURE || g.vy > 0.8');
  });

  it('the preview band is TALLER than it was', () => {
    const kstyles = read('src', 'vitrine', 'customize', 'k-styles.ts');
    const m = /entScene: \{ height: (\d+),/.exec(kstyles);
    expect(m, 'entScene height not found').not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(300); // it shipped at 300; he asked for more
  });
});

describe('6 · listening comes before publishing', () => {
  it('the take gets its OWN tappable block, above the primary action', () => {
    // « make its area more visible … I am able to replay it, listen before
    // adding it to the product ». The playback was always real — it sat as one
    // of five equal chips, the same size as « Supprimer ».
    const sheetVoice = read('src', 'vitrine', 'customize', 'voice-sheet.tsx');
    const bloc = sheetVoice.slice(sheetVoice.indexOf("n.status === 'recorded'"), sheetVoice.indexOf("{kept && ("));
    expect(bloc.length).toBeGreaterThan(400); // CONTROL — a real slice
    expect(bloc).toContain('S.vEcouteBloc');
    expect(bloc).toContain("t('k.voix.avant_publier')");
    // listening is ABOVE publishing, and publishing is the primary CTA
    expect(bloc.indexOf('S.vEcouteBloc')).toBeLessThan(bloc.indexOf("t('k.voix.publier')"));
    expect(bloc).toContain('S.cta');
    // …and the two undo verbs are on their own row, no longer beside it
    expect(bloc.indexOf("t('k.voix.publier')")).toBeLessThan(bloc.indexOf('S.vSecondaires'));
  });

  it('it plays the SAME real take — no new playback path was invented', () => {
    const sheetVoice = read('src', 'vitrine', 'customize', 'voice-sheet.tsx');
    expect(sheetVoice).toContain('onPress={() => ctl.playRec(pid, n.url!)}');
  });
});

describe('7 · the three reports of 2026-08-04, round two', () => {
  it('PLAYBACK IS AUDIBLE — the mode never drops `playsInSilentMode`', () => {
    // « I am still not able to listen to the audio recording from ma vitrine
    // before publishing », three times. The button was there, the take was
    // there, the player ran — and setAudioModeAsync SETS the whole mode rather
    // than merging, so releasing the recorder dropped the flag that lets an
    // iPhone on silent make any sound at all. Nothing errored; it just had no
    // volume.
    const capture = read('src', 'vitrine', 'customize', 'voice-capture.ts');
    const appels = capture.match(/setAudioModeAsync\(\{[^}]*\}\)/g) ?? [];
    expect(appels.length, 'no setAudioModeAsync calls found').toBeGreaterThanOrEqual(3);
    for (const a of appels) {
      expect(a, `a partial mode forgets the other half: ${a}`).toContain('playsInSilentMode: true');
    }
  });

  it('the button COMES BACK when a take finishes on its own', () => {
    const capture = read('src', 'vitrine', 'customize', 'voice-capture.ts');
    const sheet = read('src', 'vitrine', 'customize', 'voice-sheet.tsx');
    expect(capture).toContain('didJustFinish');
    expect(capture).toContain("fin.current?.remove()"); // one listener, never a pile
    expect(sheet).toContain('setPlayingPid((cur) => (cur === pid ? null : cur))');
  });

  it('APPLIQUER OPENS THE FRAMING, and only when there IS a photo to frame', () => {
    // One decision, not two: every header frames the cover differently, so the
    // moment a style is applied is the moment the framing is wrong.
    expect(screens).toContain('onCadrerApres?.();');
    // the guard is the SAME one K3's « Ajuster le cadrage » uses
    const call = screens.slice(screens.indexOf('onCadrerApres={'), screens.indexOf('onBack={back}', screens.indexOf('onCadrerApres={')));
    expect(call).toContain("sf.cover.status === 'live'");
    expect(call).toContain('sf.cover.url');
    expect(call).toContain('onSaveIdentity !== undefined');
    expect(call).toContain("setFraming('cover')");
  });
});
