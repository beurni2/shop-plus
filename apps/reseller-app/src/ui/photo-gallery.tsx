import { useState } from 'react';
import { Dimensions, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { sharedColour, type as t2, radius } from '@platform/ui-tokens';
import { spacing, interaction, touch } from '@platform/ui-tokens/legacy';
import { TEXT_FAMILY_BOLD } from './faso-fonts';
import { t, tf } from '../i18n';

/**
 * RESELLER-UX-2 — THE PHOTO GALLERY (founder walk items 2 + 3): tap a product
 * photo, see EVERY photo the supplier captured (`assetRefs` carries the hero
 * plus the proof shot; only [0] ever rendered before — the rest arrived on the
 * wire and died unseen).
 *
 * One component, two trigger sites (fiche héro · Ma Vitrine card) — §5 doctrine:
 * built once, composed by screens. Full-screen over solid ink (photography on a
 * dark field, no translucency to shimmer on a low-end GPU), a horizontally
 * PAGED strip (one photo per screen-width page — the market-standard gesture),
 * the « {n} sur {total} » counter so she always knows where she is, and one
 * « Fermer » action. Opens ONLY when at least one photo exists: the sans-photo
 * glyph tile stays a non-affordance, never an empty viewer.
 *
 * TOKENS ONLY — colour/spacing/type resolve to Faso Premium v2 (+legacy groups),
 * matching the signature-module discipline. Page width is the live window width
 * (`Dimensions.get('window')` at render — a rotation re-render re-reads it).
 */

const rmax = (v: number | { readonly min: number; readonly max: number }): number =>
  typeof v === 'number' ? v : v.max;

export interface GalleryProduct {
  readonly name: string;
  readonly refs: readonly string[];
}

export function PhotoGallery({
  product,
  onClose,
}: {
  /** null = closed (the voice-sheet idiom: presence drives visibility). */
  product: GalleryProduct | null;
  onClose: () => void;
}): React.ReactElement {
  const [page, setPage] = useState(0);
  const width = Dimensions.get('window').width;
  const refs = product?.refs ?? [];
  const shown = Math.min(page, Math.max(0, refs.length - 1));
  return (
    <Modal visible={product !== null} transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={S.field}>
        <View style={S.topRow}>
          <Text style={S.title} numberOfLines={1}>
            {product?.name ?? ''}
          </Text>
          <Pressable
            style={({ pressed }) => [S.close, pressed && S.pressed]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('galerie.fermer')}
          >
            <Text style={S.closeText}>{t('galerie.fermer')}</Text>
          </Pressable>
        </View>
        <FlatList
          data={refs as string[]}
          keyExtractor={(uri, i) => `${i}-${uri}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))}
          renderItem={({ item }) => (
            <View style={[S.page, { width }]}>
              <Image source={{ uri: item }} style={S.photo} resizeMode="contain" />
            </View>
          )}
        />
        <Text style={S.counter}>{tf('galerie.compteur', { n: String(shown + 1), total: String(refs.length) })}</Text>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  field: { flex: 1, backgroundColor: sharedColour.ink },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: {
    flex: 1,
    color: sharedColour.paper,
    fontFamily: TEXT_FAMILY_BOLD,
    fontSize: rmax(t2.scale.row.size),
    fontWeight: '700',
  },
  close: {
    minHeight: touch.minTargetPx,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: rmax(radius.buttonSecondary),
    borderWidth: interaction.hairline.medium,
    borderColor: sharedColour.paper,
  },
  closeText: { color: sharedColour.paper, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.pill.size), fontWeight: '700' },
  pressed: { opacity: interaction.pressedOpacity },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: '100%' },
  counter: {
    textAlign: 'center',
    color: sharedColour.paper,
    fontFamily: TEXT_FAMILY_BOLD,
    fontSize: rmax(t2.scale.pill.size),
    fontWeight: '700',
    paddingVertical: spacing.lg,
    fontVariant: ['tabular-nums'],
  },
});
