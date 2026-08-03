import { useEffect } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

/**
 * VIDEO-PARTOUT (founder order 2026-08-03: « I want the video to be showing on
 * opportunités, on ma vitrine ») — the ≤ 6 s product clip, on a PHONE.
 *
 * WHY A NATIVE MODULE EXISTS HERE AT ALL, stated because it cost a build: this
 * app had no video capability whatsoever. `expo-video` (~3.0.16, the version
 * Expo's own `bundledNativeModules.json` pairs with SDK 54 — read, not guessed)
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

export function ProductClip({
  videoRef,
  photoUri,
  style,
}: {
  /** The clip's ABSOLUTE url (the wire absolutizes it); absent ⇒ photo only. */
  readonly videoRef?: string | undefined;
  /** The hero photograph — the resting state, and the fallback that always holds. */
  readonly photoUri?: string | undefined;
  readonly style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const clip = videoRef !== undefined && videoRef !== '' ? videoRef : null;
  // The player is created unconditionally (hooks may not be conditional) but is
  // handed a null source when there is no clip — expo-video treats that as "no
  // media", loads nothing, and costs nothing.
  const player = useVideoPlayer(clip, (p) => {
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
        <Image source={{ uri: photoUri }} style={S.fill} resizeMode="cover" />
      ) : null}
      {clip !== null ? (
        <VideoView
          player={player}
          style={S.fill}
          contentFit="cover"
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />
      ) : null}
    </View>
  );
}

const S = StyleSheet.create({
  wrap: { overflow: 'hidden', position: 'relative' },
  fill: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
});
