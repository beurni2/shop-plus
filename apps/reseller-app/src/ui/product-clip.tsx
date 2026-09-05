import { useEffect } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * ═══ OTA-SAFE LOADING OF THE NATIVE VIDEO MODULE (founder challenge) ═══
 *
 * Founder, 2026-08-03: « I do not think the changes on opportunités needs an
 * eas build before deploying and showing. » He was RIGHT about the layout work
 * — the grid, the spacing and the frame rule are pure JavaScript, and an
 * over-the-air update carries JavaScript perfectly well.
 *
 * He was right about the wrong thing standing in the way, though. A STATIC
 * `import … from 'expo-video'` at the top of this file made the whole screen
 * depend on NATIVE code, and `expo-video` resolves its native side at import
 * time: on a binary built before it existed, that import throws « Cannot find
 * native module » — at launch, because App.tsx imports this file at the top
 * level. The layout changes were never the problem; this line was.
 *
 * SO THE IMPORT IS NOW A GUARDED, RUNTIME ONE. Where the native module exists
 * the component is exactly what it was. Where it does not, `require` throws,
 * we catch, and the app renders THE PHOTOGRAPH — which is what these screens
 * showed yesterday and is a perfectly honest product card. Nothing crashes,
 * and the layout work ships over the air today.
 *
 * THE CHOICE IS MADE ONCE, AT MODULE SCOPE, and never re-evaluated: a binary
 * either contains the native module or it does not, and that cannot change
 * while the app is running. Deciding here rather than inside the component
 * means the hook set never varies between renders — the correctness reason to
 * pick the implementation up front rather than branch inside it.
 *
 * THIS ALSO CLOSES A HAZARD CLASS, not just today's blocker: any future OTA
 * that reaches an older binary now degrades to photographs instead of a
 * launch crash. Binary/update skew is normal in Expo; it should never be fatal.
 */
type ExpoVideo = typeof import('expo-video');
const EXPO_VIDEO: ExpoVideo | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    return require('expo-video') as ExpoVideo;
  } catch {
    return null; // older binary — the photograph stands, exactly as before
  }
})();

/** True when the running binary can actually play a clip. Read by the tests. */
export const CLIP_NATIF_DISPONIBLE = EXPO_VIDEO !== null;

/**
 * VIDEO-PARTOUT (founder order 2026-08-03: « I want the video to be showing on
 * opportunités, on ma vitrine ») — the ≤ 6 s product clip, on a PHONE.
 *
 * WHY A NATIVE MODULE EXISTS HERE AT ALL, stated because it cost a build: this
 * app had no video capability whatsoever. `expo-video` (~57.0.3, the version
 * Expo's own `bundledNativeModules.json` pairs with SDK 57 — read, not guessed)
 * is a native module, so this screen cannot arrive as an over-the-air update;
 * the founder authorized the rebuild explicitly.
 *
 * THE SAME HONESTY KIT AS THE BUYER'S WEB CARD, in this platform's vocabulary:
 *   · MUTED — the only autoplay that respects someone in a market, and the only
 *     one iOS permits inline at all.
 *   · LOOP — a 6-second clip that stops after one pass reads as broken.
 *   · THE PHOTOGRAPH UNDERNEATH — rendered as a real `<Image>` behind the video
 *     surface, so a clip that never loads (patchy data, a codec the device
 *     refuses) leaves the product looking exactly as it did before this
 *     component existed. `poster` has no RN equivalent; a photo BEHIND is the
 *     honest one, and it costs what the photo always cost.
 *   · NO CONTROLS, NO FULLSCREEN, NO PiP — this is a card, not a player. A tap
 *     belongs to the card's own action (open the fiche), never to a scrub bar.
 *
 * NO CLIP ⇒ THIS COMPONENT RENDERS THE PHOTOGRAPH AND NOTHING ELSE — the caller
 * passes both and never has to branch, so a surface can never accidentally show
 * a video frame for a product that has none.
 */

/** The props both implementations accept — one contract, two bodies. */
interface ProductClipProps {
  /** The clip's ABSOLUTE url (the wire absolutizes it); absent ⇒ photo only. */
  readonly videoRef?: string | undefined;
  /** The hero photograph — the resting state, and the fallback that always holds. */
  readonly photoUri?: string | undefined;
  readonly style?: StyleProp<ViewStyle>;
  /**
   * CADRE (founder order 2026-08-03: « Drop the square rule ») — reports the
   * PHOTOGRAPH'S true pixel shape once it has loaded, so the caller can let the
   * frame take the photo's own proportions instead of forcing a square.
   *
   * IT IS THE PHOTO THAT IS MEASURED, NEVER THE CLIP, and that is deliberate on
   * two counts: the photograph is the resting state every card shows (the clip
   * only plays over it), and it is the one this component already renders, so
   * measuring costs a callback rather than a second network round. A product
   * with a clip and no photograph reports nothing — and the caller's own
   * fallback, the old square, is the honest answer to an unmeasured frame.
   */
  readonly onAspect?: ((width: number, height: number) => void) | undefined;
}

/** The photograph's own measurement handler — identical in both bodies. */
function mesure(onAspect: ProductClipProps['onAspect']) {
  return onAspect === undefined
    ? undefined
    : (e: { nativeEvent: { source?: { width?: number; height?: number } } }): void => {
        const src = e.nativeEvent.source;
        if (src?.width !== undefined && src?.height !== undefined) onAspect(src.width, src.height);
      };
}

/**
 * THE PHOTOGRAPH, on its own. Rendered when the running binary has no video
 * module — and it is NOT a degraded state to apologise for: it is exactly the
 * card these screens showed before clips existed. `videoRef` is accepted and
 * deliberately unused, so no caller ever has to know which build it is on.
 */
function ClipPhoto({ photoUri, style, onAspect }: ProductClipProps): React.ReactElement {
  return (
    <View style={[S.wrap, style]}>
      {photoUri !== undefined && photoUri !== '' ? (
        <Image source={{ uri: photoUri }} style={S.fill} resizeMode="cover" onLoad={mesure(onAspect)} />
      ) : null}
    </View>
  );
}

// Bound at module scope, where the null check has already happened. The `use…`
// name is what keeps the rules-of-hooks lint meaningful at the call site below.
const useVideoPlayer = EXPO_VIDEO?.useVideoPlayer;
const VideoView = EXPO_VIDEO?.VideoView;

function ClipVideo({ videoRef, photoUri, style, onAspect }: ProductClipProps): React.ReactElement {
  const clip = videoRef !== undefined && videoRef !== '' ? videoRef : null;
  // The player is created unconditionally (hooks may not be conditional) but is
  // handed a null source when there is no clip — expo-video treats that as "no
  // media", loads nothing, and costs nothing.
  const player = useVideoPlayer!(clip, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (clip === null) return;
    // `play()` can refuse (data saver, an unreadable codec). The refusal is
    // caught and the photograph simply stays — never a thrown render.
    try {
      player.play();
    } catch {
      /* the photo underneath is the honest resting state */
    }
  }, [clip, player]);
  return (
    <View style={[S.wrap, style]}>
      {photoUri !== undefined && photoUri !== '' ? (
        <Image
          source={{ uri: photoUri }}
          style={S.fill}
          resizeMode="cover"
          // CADRE — the real pixel shape, straight off the decoded image. No
          // extra fetch and no `Image.getSize` round: this element is loading
          // the bytes anyway, so the measurement is a by-product of the render
          // the card already pays for. A failed load never fires it, which is
          // exactly when the caller should keep its neutral frame.
          onLoad={mesure(onAspect)}
        />
      ) : null}
      {clip !== null && VideoView !== undefined ? (
        <VideoView
          player={player}
          style={S.fill}
          contentFit="cover"
          nativeControls={false}
          fullscreenOptions={{ enable: false }}
          allowsPictureInPicture={false}
        />
      ) : null}
    </View>
  );
}

const S = StyleSheet.create({
  wrap: { overflow: 'hidden', position: 'relative' },
  fill: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
});

/**
 * THE ONE EXPORT — chosen once, from what the binary actually contains.
 *
 * A binary either has the native video module or it does not, and that cannot
 * change while the app runs; so this is a constant, and picking here means the
 * hook set never varies between renders of a mounted component. Branching
 * INSIDE a single component would have made the hooks conditional — the bug
 * this shape exists to make impossible.
 */
export const ProductClip: (props: ProductClipProps) => React.ReactElement =
  EXPO_VIDEO === null ? ClipPhoto : ClipVideo;
