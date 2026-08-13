/**
 * ENTETES-C — the FRAMING sheet: she slides her photo inside a REPRESENTATIVE
 * frame of her current header, and what she saves is a canon photo focus
 * ({x, y} integers 0–100 — CSS object-position percentages) the buyer render
 * crops to exactly.
 *
 * TWO ENTRY POINTS (screens.tsx): automatically after a successful cover or
 * portrait upload, and « Ajuster le cadrage » next to each live photo on K3.
 * One sheet, two kinds.
 *
 * THE PREVIEW IS THE TESTED MATH: every geometry number on this screen comes
 * from `framing-math.ts` — cover-scale, translate, drag→percent — the same
 * functions the Node tests pin. Nothing is re-derived inline, so what she sees
 * while dragging is what CSS does on her real page. The frame here is
 * REPRESENTATIVE (aspect + silhouette per style, never a pixel replica of the
 * five headers) and the sheet SAYS so — « voir comme cliente » stays the truth
 * mirror.
 *
 * Drag is core RN `PanResponder` — no new gesture/animation dependency.
 * Deterministic only (loi 5): her hand, no detection of any kind.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Image, Modal, PanResponder, Pressable, Text, View, type LayoutChangeEvent, type TextStyle, type ViewStyle } from 'react-native';
import { t } from '../../i18n';
import { focusOf, headerStyleOf, type PhotoFocus, type Storefront } from './storefront';
import {
  coverScaledSize,
  defaultFocusFor,
  dragToPercent,
  frameSpecFor,
  translateFor,
  type FrameKind,
  type Size,
} from './framing-math';
import { K_RAW_STYLES } from './k-styles';

const S = K_RAW_STYLES as unknown as Record<keyof typeof K_RAW_STYLES, ViewStyle & TextStyle>;

/** The stage never overruns a small phone: the frame fits this box. */
const STAGE_MAX_W = 300;
const STAGE_MAX_H = 320;

export interface FramingSheetProps {
  readonly visible: boolean;
  readonly kind: FrameKind;
  readonly sf: Storefront;
  /** « Enregistrer » hands the pair; « Réinitialiser » hands null (CLEAR). The
   *  caller owns the save + toast + close — one save, one thing. */
  readonly onSave: (kind: FrameKind, order: PhotoFocus | null) => void;
  /** Cancel — backdrop press / Android back. Leaves everything untouched. */
  readonly onClose: () => void;
}

export function FramingSheet({ visible, kind, sf, onSave, onClose }: FramingSheetProps) {
  const style = headerStyleOf(sf);
  const part = kind === 'cover' ? sf.cover : sf.avatar;
  const url = typeof part.url === 'string' && part.url !== '' ? part.url : undefined;
  const saved = focusOf(part);
  const start = saved ?? defaultFocusFor(style, kind);

  const spec = frameSpecFor(style, kind);
  const frameW = Math.min(STAGE_MAX_W, STAGE_MAX_H * spec.aspect);
  const frame: Size = { width: frameW, height: frameW / spec.aspect };
  const [tl, tr, br, bl] = spec.radii;
  const radiusPx = (r: number): number => (spec.circle ? Math.min(frame.width, frame.height) / 2 : r * frame.width);

  const [percent, setPercent] = useState<PhotoFocus>(start);
  const [imgSize, setImgSize] = useState<Size | undefined>(undefined);

  // Re-open = a fresh act on the CURRENT photo: reset to what is saved (or the
  // style default) and re-measure the real image.
  useEffect(() => {
    if (!visible) return;
    setPercent(start);
    percentRef.current = start;
    setImgSize(undefined);
    if (url !== undefined) {
      Image.getSize(
        url,
        (width, height) => setImgSize({ width, height }),
        // Unmeasurable (offline, a demo:// url in tests): the photo renders at
        // frame size — nothing overflows, nothing drags, nothing lies.
        () => setImgSize(frame),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, kind, url]);

  const scaled = coverScaledSize(imgSize ?? frame, frame);

  // PanResponder callbacks fire outside React's render cycle — refs carry the
  // live values so a long drag never reads a stale closure.
  const percentRef = useRef<PhotoFocus>(start);
  const grabRef = useRef<PhotoFocus>(start);
  const geomRef = useRef<{ scaled: Size; frame: Size }>({ scaled, frame });
  geomRef.current = { scaled, frame };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        grabRef.current = percentRef.current;
      },
      onPanResponderMove: (_evt, g) => {
        const geo = geomRef.current;
        const next: PhotoFocus = {
          x: dragToPercent(grabRef.current.x, g.dx, geo.scaled.width, geo.frame.width),
          y: dragToPercent(grabRef.current.y, g.dy, geo.scaled.height, geo.frame.height),
        };
        percentRef.current = next;
        setPercent(next);
      },
    }),
  ).current;

  const frameStyle: ViewStyle = {
    width: frame.width,
    height: frame.height,
    borderTopLeftRadius: radiusPx(tl),
    borderTopRightRadius: radiusPx(tr),
    borderBottomRightRadius: radiusPx(br),
    borderBottomLeftRadius: radiusPx(bl),
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={S.vSheetBackdrop} onPress={onClose} accessibilityLabel={t('k.retour')}>
        <Pressable style={S.vSheetCard} onPress={() => undefined} accessibilityViewIsModal>
          <View style={S.vSheetHandle} />
          <Text style={S.vSheetTitle}>{t('k.cadrage.title')}</Text>
          <Text style={S.frHint}>{t('k.cadrage.hint')}</Text>
          <View style={S.frStage}>
            <View style={[S.frFrame, frameStyle]} {...pan.panHandlers}>
              {url !== undefined && (
                <Image
                  source={{ uri: url }}
                  style={{
                    position: 'absolute',
                    width: scaled.width,
                    height: scaled.height,
                    transform: [
                      { translateX: translateFor(scaled.width, frame.width, percent.x) },
                      { translateY: translateFor(scaled.height, frame.height, percent.y) },
                    ],
                  }}
                  // CADRAGE-PARITÉ — `cover`, not `stretch`: identical once
                  // the photo is measured (the scaled box has the image's own
                  // aspect), and an honest center-crop while unmeasured or
                  // when getSize fails — stretch would distort in exactly
                  // those states.
                  resizeMode="cover"
                />
              )}
            </View>
          </View>
          <Text style={S.frVerite}>{t('k.cadrage.verite')}</Text>
          <View style={S.frActions}>
            <Pressable
              style={({ pressed }) => [S.cta, pressed && S.pressed]}
              onPress={() => onSave(kind, percentRef.current)}
              accessibilityRole="button"
            >
              <Text style={S.ctaText}>{t('k.enregistrer')}</Text>
            </Pressable>
            {saved !== undefined && (
              <Pressable
                style={({ pressed }) => [S.frGhostWide, pressed && S.pressed]}
                onPress={() => onSave(kind, null)}
                accessibilityRole="button"
              >
                <Text style={S.ghostSmallText}>{t('k.cadrage.reinitialiser')}</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
