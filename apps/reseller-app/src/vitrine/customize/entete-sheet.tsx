import { useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, PanResponder, Pressable, Text, View } from 'react-native';
import { t } from '../../i18n';
import { apercuEnteteUrl } from '../../qr/identity';
import { K_RAW_STYLES as S } from './k-styles';
import { EnteteApercu } from './screens-apercu';
import { frameSpecFor } from './framing-math';
import type { HeaderStyleKey } from './storefront';

/**
 * APERÇU EN-TÊTE — the founder's own flow (2026-08-03):
 *
 *   « you tap on one theme and a screen slides up from bottom to show the
 *     preview of that en-tête and if the reseller wants that he just taps
 *     appliquer from that screen and if he does not like it he just slide the
 *     screen back down and tap another theme to see »
 *
 * and, on what goes inside it: « for the entete i want to see the preview of
 * the REAL entete not just some blind shapes », « I do not want to leave the app
 * and open it on a browser, I want it to be like a medium sliding window on top
 * of the app screen ».
 *
 * ═══ WHY A WEBVIEW, AND WHAT IT COSTS ═══
 *
 * A WebView draws INSIDE the app — it is not a browser hop, which is what he
 * ruled out. The header styles exist exactly once, as HTML, in the buyer PWA;
 * pointing a WebView at HER OWN LIVE PAGE with `?entete=` means the preview IS
 * the page a client sees — her cover, her name, her products, rendered by the
 * same code. Nothing is reimplemented, so nothing can drift: a header that
 * changes changes its own preview on the next PWA deploy.
 *
 * THE COST IS REAL AND WAS HIS CALL: `react-native-webview` is a NATIVE module,
 * so this screen is dark until the next `eas build`. He was told that and chose
 * it over the alternative (rendered screenshots, which ship over the air but
 * show a representative shop instead of his own).
 *
 * ONE AT A TIME IS WHAT MAKES IT AFFORDABLE. Forty-three WebViews in a scrolling
 * picker would fail the performance law on a 1 GB phone; one, mounted only while
 * the sheet is open and unmounted on dismiss, is an ordinary page load.
 *
 * ═══ WHAT IT NEVER DOES ═══
 *
 * It does not APPLY anything by being looked at. The style is written only when
 * she taps « Appliquer » — sliding the sheet down leaves her shop exactly as it
 * was, which is the whole point of previewing.
 */

/**
 * ═══ OTA-SAFE LOADING OF THE NATIVE WEBVIEW (the expo-video lesson, again) ═══
 *
 * `react-native-webview` resolves its native side AT IMPORT TIME. A static
 * import here would throw « Cannot find native module » on any binary built
 * before it existed — and because `screens.tsx` imports this file at the top
 * level, that is not a broken sheet, it is **the whole Personnaliser flow dead
 * on launch**, delivered over the air to a phone that was working fine.
 *
 * This is the exact hazard `product-clip.tsx` closed for expo-video an hour
 * earlier, and it applies unchanged: guarded runtime require, decided ONCE at
 * module scope (a binary either has the module or it does not, and that cannot
 * change while the app runs — deciding here keeps the hook set stable across
 * renders).
 *
 * WHERE THE MODULE IS ABSENT the sheet still opens and still applies a style;
 * it shows the silhouette and says the real preview needs the app update. That
 * is a smaller promise honestly kept, not a crash.
 */
type RNWebView = typeof import('react-native-webview');
const RN_WEBVIEW: RNWebView | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    return require('react-native-webview') as RNWebView;
  } catch {
    return null; // older binary — the silhouette stands, nothing crashes
  }
})();

/** Past this many points of downward drag the sheet closes; below it, it springs
 *  back. A third of the sheet's height, in round numbers — far enough that a
 *  stray scroll never dismisses, near enough that a deliberate swipe always does. */
export const SEUIL_FERMETURE = 120;

/** True when the running binary can actually draw a web preview. Read by tests. */
export const APERCU_NATIF_DISPONIBLE = RN_WEBVIEW !== null;

/* The url itself is built in `qr/identity.ts`, with the other url builders and
   WITHOUT a native import, so a Node test can actually reach it — this file
   cannot be loaded by vitest at all (Metro-safe law). */

export function EnteteApercuSheet({
  visible,
  styleKey,
  label,
  liveSlug,
  themeTones,
  onApply,
  onClose,
}: {
  readonly visible: boolean;
  readonly styleKey: HeaderStyleKey | null;
  readonly label: string;
  readonly liveSlug?: string | undefined;
  readonly themeTones: { readonly deep: string; readonly soft: string; readonly accent: string };
  readonly onApply: (key: HeaderStyleKey) => void;
  readonly onClose: () => void;
}): React.ReactElement | null {
  // `chargement` while the page paints, `echec` when it cannot be reached.
  // A WebView that fails renders a BLANK WHITE BOX by default, which on this
  // screen reads as « your header is empty » — a lie about her shop caused by
  // her network. Both states are designed here instead (§5: honest states are
  // designed states).
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'echec'>('chargement');
  // Re-mounting on each open is deliberate: a stale WebView would show the
  // PREVIOUS style for a moment after she taps a new card.
  const [nonce, setNonce] = useState(0);

  /**
   * GLISSER POUR FERMER (founder, 2026-08-04: « if I want to slide it down it's
   * not smooth and takes a lot of time and I have to do it multiple times »).
   *
   * HE WAS DESCRIBING A REAL DEAD END, not slowness. A `Modal` with
   * `animationType="slide"` animates on OPEN and CLOSE but has no drag: the only
   * way out was a tap on the thin backdrop strip above the sheet, and every
   * downward swipe he tried landed INSIDE THE WEBVIEW, which swallows touches
   * and did nothing. « Multiple times » is exactly what a person does when a
   * gesture is silently ignored.
   *
   * So the sheet now has a real drag, on the HEADER — the handle and title
   * strip, which is outside the WebView and therefore actually receives the
   * gesture. Down follows the finger; past a third of the sheet (or on a fast
   * flick) it closes; anything less springs back so a half-swipe never leaves
   * her wondering whether it worked.
   */
  const glisse = useRef(new Animated.Value(0)).current;
  const pan = useRef(
    PanResponder.create({
      // Claim the gesture only once it is clearly a DOWNWARD drag, so a tap on
      // the handle still reads as a tap.
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) glisse.setValue(g.dy); // never drag it UPWARD past its seat
      },
      onPanResponderRelease: (_e, g) => {
        const parti = g.dy > SEUIL_FERMETURE || g.vy > 0.8; // distance OR a flick
        if (parti) {
          onClose();
          glisse.setValue(0); // reset for the next open
          return;
        }
        Animated.spring(glisse, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    }),
  ).current;

  if (styleKey === null) return null;
  // Two different reasons for the same fallback, and both are true statements:
  // no live page to show, or no native module to show it with.
  const Web = RN_WEBVIEW === null ? null : RN_WEBVIEW.WebView;
  const url = liveSlug === undefined ? null : apercuEnteteUrl(liveSlug, styleKey);
  const raison = RN_WEBVIEW === null ? 'k.entete.apercu_maj' : 'k.entete.apercu_hors_ligne';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={S.vSheetBackdrop} onPress={onClose} accessibilityLabel={t('k.retour')}>
        {/* The card swallows taps itself (a tap inside must never reach the
            dismissing backdrop), so the old inert <Pressable> wrapper is gone —
            it would have sat between the drag zone and the card and eaten the
            gesture. */}
        <Animated.View
          style={[S.vSheetCard, { transform: [{ translateY: glisse }] }]}
          accessibilityViewIsModal
          onStartShouldSetResponder={() => true}
        >
          {/* THE DRAG ZONE. It must live OUTSIDE the WebView — a WebView
              consumes its own touches, so a handle drawn over it would be as
              dead as the swipe he was attempting. */}
          <View {...pan.panHandlers} style={S.entGrip}>
            <View style={S.vSheetHandle} />
            <Text style={S.vSheetTitle}>{label}</Text>
          </View>

          <View style={S.entScene}>
            {Web === null || url === null ? (
              /* NOT PUBLISHED YET — there is no live page to show, so the
                 silhouette stands in and the sentence says why. Inventing a
                 fake shop here would be the pretend this app refuses. */
              <View style={S.entVide}>
                <EnteteApercu
                  spec={frameSpecFor(styleKey, 'cover')}
                  deep={themeTones.deep}
                  soft={themeTones.soft}
                  accent={themeTones.accent}
                />
                <Text style={S.entVideText}>{t(raison)}</Text>
              </View>
            ) : (
              <>
                <Web
                  key={`${styleKey}-${String(nonce)}`}
                  source={{ uri: url }}
                  style={S.entWeb}
                  onLoadEnd={() => setEtat((cur) => (cur === 'echec' ? cur : 'pret'))}
                  onError={() => setEtat('echec')}
                  // ═══ THE 404 IS THE MECHANISM, NOT A FAULT ═══
                  //
                  // Founder screenshot, 2026-08-04: « Aperçu pas affiché »
                  // over a shop that is perfectly online. The bug was mine.
                  //
                  // Her vitrine is served by GitHub Pages, a STATIC host with
                  // no router: `/shop-plus/v/{slug}` matches no file, so Pages
                  // answers **404** with `404.html`, whose script rewrites the
                  // path into `/?/v/{slug}` and the app boots from there. That
                  // 404 is the SPA fallback WORKING — it is how every `/v/`
                  // link in this product resolves, including « Voir comme
                  // cliente ». Treating it as an error painted the failure
                  // state over a page that was about to load fine.
                  //
                  // So a 404 is ignored and the load is allowed to continue;
                  // every OTHER status is still a real failure and still says
                  // so. `onError` remains untouched — a dead network is a dead
                  // network.
                  onHttpError={(e) => {
                    if (e.nativeEvent.statusCode !== 404) setEtat('echec');
                  }}
                  // Her own page, read-only: nothing here needs to run a
                  // download, open a window, or leave the origin.
                  javaScriptEnabled
                  domStorageEnabled={false}
                  allowsInlineMediaPlayback
                  // A preview is for LOOKING. Scrolling it invites her to treat
                  // the sheet as the shop; the header is at the top, which is
                  // the whole subject.
                  scrollEnabled={false}
                />
                {etat === 'chargement' && (
                  <View style={S.entOverlay} pointerEvents="none">
                    <ActivityIndicator color={themeTones.deep} />
                    <Text style={S.entVideText}>{t('k.entete.apercu_chargement')}</Text>
                  </View>
                )}
                {etat === 'echec' && (
                  <View style={S.entOverlay}>
                    <Text style={S.entVideText}>{t('k.entete.apercu_echec')}</Text>
                    <Pressable
                      style={({ pressed }) => [S.ghostSmall, pressed && S.pressed]}
                      onPress={() => {
                        setEtat('chargement');
                        setNonce((n) => n + 1);
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={S.ghostSmallText}>{t('k.cover.reessayer')}</Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}
          </View>

          {/* ONE primary action (§5). Dismiss is the swipe on the header, or a
              tap on the backdrop — a « Annuler » button beside Appliquer would
              give the screen two weights and no clear one. */}
          <Pressable
            style={({ pressed }) => [S.cta, pressed && S.pressed]}
            onPress={() => onApply(styleKey)}
            accessibilityRole="button"
          >
            <Text style={S.ctaText}>{t('k.entete.appliquer')}</Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
