import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { sharedColour, shopColour, type as t2, radius } from '@platform/ui-tokens';
import { spacing, interaction, band, money, dimension } from '@platform/ui-tokens/legacy';
import { DISPLAY_FAMILY, TEXT_FAMILY, TEXT_FAMILY_BOLD } from './faso-fonts';
import { IconCoche } from './icons';

/**
 * WO-FP-SHOP · THE SIGNATURE MODULE — the six ownable Faso Premium elements the
 * reseller surface composes: the woven band · the hero ledger · the duotone tile
 * · the selection swap+check · the corner ticks · the quote rule. Built ONCE,
 * consumed by the screens (§5 doctrine: components built once, themed per app).
 *
 * TOKENS ONLY. Colour/type/radius resolve to Faso Premium v2 (@platform/ui-tokens);
 * the geometry groups the v2 scope defers to their own reskin slices — spacing,
 * interaction, band, money — resolve to Grand Teint (/legacy) VERBATIM. No hex,
 * no raw dimension: every number is a token expression (the ui-scan proves it).
 *
 * RANGES → the fuller value. RN has no CSS clamp, so a { min, max } token resolves
 * to `max` (legibility-first for a hot phone in sunlight — the 5-second test);
 * a later responsive slice may revisit. `rmax` is the one place that choice lives.
 *
 * TYPEFACES are the canon token's names (faso-fonts DISPLAY/TEXT). They paint in
 * the system fallback until the App loads the faces (cold-start law) — no reflow.
 */

/** Resolve a scale/radius value that canon may state as a range to its max. */
const rmax = (v: number | { readonly min: number; readonly max: number }): number =>
  typeof v === 'number' ? v : v.max;

/* ── 1 · THE WOVEN BAND ─────────────────────────────────────────────────────
   The bande tissée — the permanent brand mark, a woven strip of accent + gold
   over paper. The HANDOFF states a repeating gradient; RN has no gradient and
   the band group's precise stripe geometry is a legacy-deferred token slice, so
   the weave is DERIVED from the spacing scale (accent lg · gold sm · paper xs
   gaps) — the woven FEEL from tokens we hold, never invented pixel constants. */
const WEAVE = [
  { c: shopColour.primary, w: spacing.lg },
  { c: sharedColour.paper, w: spacing.xs },
  { c: shopColour.gold, w: spacing.sm },
  { c: sharedColour.paper, w: spacing.xs },
] as const;
export function WovenBand() {
  // Enough repeats to cross any phone width; overflow is clipped by the row.
  const repeats = Array.from({ length: 24 }, (_, i) => i);
  return (
    <View style={styles.wovenBand} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {repeats.map((r) =>
        WEAVE.map((stripe, i) => (
          <View key={`${r}-${i}`} style={{ width: stripe.w, backgroundColor: stripe.c }} />
        )),
      )}
    </View>
  );
}

/* ── 2 · THE HERO LEDGER ────────────────────────────────────────────────────
   « L'argent en majesté » as a ledger: the net figure as the screen's hero
   (heroMoney, Bricolage 800, tabular), its calm label above, and an optional
   ledger sub-line (the reconciliation whisper) below. `amount` is a preformatted
   franc string — the « F » belongs to the catalog, never to this code. */
export function HeroLedger({
  label,
  amount,
  ledger,
}: {
  label?: string | undefined;
  amount: string;
  ledger?: string | undefined;
}) {
  return (
    <View style={styles.heroLedgerBlock}>
      {label !== undefined && <Text style={styles.heroLedgerLabel}>{label}</Text>}
      <Text style={styles.heroLedgerAmount}>{amount}</Text>
      {ledger !== undefined && <Text style={styles.heroLedgerRule}>{ledger}</Text>}
    </View>
  );
}

/* ── 3 · THE DUOTONE TILE ───────────────────────────────────────────────────
   The product/opportunity tile: a two-tone crown (accent-soft field + a gold
   keyline) carrying the leading glyph, over the tile body. Respectful of
   product photography's slot without faking an image (glyph until art loads).
   `crownTone` picks accent (default) or a neutral field for non-accent tiles. */
export function DuotoneTile({
  glyph,
  children,
  crownTone = 'accent',
  style,
}: {
  glyph: string;
  children: React.ReactNode;
  crownTone?: 'accent' | 'neutral';
  style?: StyleProp<ViewStyle>;
}) {
  const crown = crownTone === 'accent' ? styles.tileCrownAccent : styles.tileCrownNeutral;
  return (
    <View style={[styles.tile, style]}>
      <View style={[styles.tileCrown, crown]}>
        <View style={styles.tileKeyline} />
        <Text style={styles.tileGlyph}>{glyph}</Text>
      </View>
      <View style={styles.tileBody}>{children}</View>
    </View>
  );
}

/* ── 4 · THE SELECTION SWAP + CHECK ─────────────────────────────────────────
   Selection is structural, not tinted: an unselected control shows a « + »
   affordance; selected, it SWAPS to a filled accent disc with a check
   (selectedMark). No colour-only signal — the shape itself changes. */
export function SelectionSwap({ selected }: { selected: boolean }) {
  return (
    <View
      style={[styles.swap, selected ? styles.swapOn : styles.swapOff]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
    >
      {selected ? (
        // the check is the CANON SVG glyph on a size token — never an emoji (§8)
        <IconCoche size={dimension.iconSizePx.badge} color={shopColour.onPrimary} />
      ) : (
        <Text style={styles.swapPlus}>+</Text>
      )}
    </View>
  );
}

/* ── 5 · THE CORNER TICKS ───────────────────────────────────────────────────
   The structural selection frame: four L-shaped accent ticks at the corners of
   a chosen element (interaction.cornerTick). An overlay — it never shifts
   layout, never tints; it draws the choice at the corners and nowhere else. */
export function CornerTicks({ show = true }: { show?: boolean }) {
  if (!show) return null;
  return (
    <View style={styles.ticksLayer} pointerEvents="none" accessibilityElementsHidden>
      <View style={[styles.tick, styles.tickTL]} />
      <View style={[styles.tick, styles.tickTR]} />
      <View style={[styles.tick, styles.tickBL]} />
      <View style={[styles.tick, styles.tickBR]} />
    </View>
  );
}

/* ── 6 · THE QUOTE RULE ─────────────────────────────────────────────────────
   The reconciliation rule: a hairline over the byte-stable quote line — the
   right-aligned reconcile whisper that proves the franc adds up (money.reconcile
   -Line). It states the sum; it never recomputes it (the amounts arrive
   preformatted from the money core). */
export function QuoteRule({ line }: { line: string }) {
  return (
    <View style={styles.quoteRuleBlock}>
      <View style={styles.quoteHairline} />
      <Text style={styles.quoteRuleLine}>{line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // 1 · woven band
  wovenBand: { flexDirection: 'row', height: band.themeStripPx + spacing.xs, overflow: 'hidden' },

  // 2 · hero ledger
  heroLedgerBlock: { alignItems: 'center', gap: spacing.xs },
  heroLedgerLabel: {
    color: sharedColour.sub,
    fontFamily: TEXT_FAMILY,
    fontSize: rmax(t2.scale.body.size),
  },
  heroLedgerAmount: {
    color: shopColour.deep,
    fontFamily: DISPLAY_FAMILY,
    fontSize: rmax(t2.scale.heroMoney.size),
    fontWeight: String(t2.scale.heroMoney.wght) as '800',
    fontVariant: ['tabular-nums'],
  },
  heroLedgerRule: {
    color: sharedColour.sub,
    fontFamily: TEXT_FAMILY,
    fontSize: money.reconcileLine.size,
    fontWeight: String(money.reconcileLine.wght) as '600',
    letterSpacing: money.reconcileLine.ls,
    fontVariant: ['tabular-nums'],
  },

  // 3 · duotone tile
  tile: {
    backgroundColor: sharedColour.card,
    borderRadius: radius.tile,
    borderWidth: interaction.hairline.thin,
    borderColor: sharedColour.hairline,
    overflow: 'hidden',
  },
  tileCrown: {
    height: rmax(radius.art) + spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCrownAccent: { backgroundColor: shopColour.soft },
  tileCrownNeutral: { backgroundColor: sharedColour.dim },
  tileKeyline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: interaction.hairline.strong,
    backgroundColor: shopColour.gold,
  },
  tileGlyph: {
    color: shopColour.deep,
    fontFamily: DISPLAY_FAMILY,
    fontSize: t2.scale.cardMoney.size,
    fontWeight: String(t2.scale.cardMoney.wght) as '800',
  },
  tileBody: { padding: spacing.md, gap: spacing.xs },

  // 4 · selection swap + check
  swap: {
    width: interaction.selectedMark.sizePx,
    height: interaction.selectedMark.sizePx,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapOff: { borderWidth: interaction.hairline.strong, borderColor: sharedColour.hairlineStrong, backgroundColor: sharedColour.card },
  swapOn: { backgroundColor: shopColour.primary },
  swapPlus: { color: sharedColour.sub, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.body.size), fontWeight: String(t2.scale.row.wght) as '700' },

  // 5 · corner ticks
  ticksLayer: { ...StyleSheet.absoluteFillObject },
  tick: {
    position: 'absolute',
    width: interaction.cornerTick.sizePx,
    height: interaction.cornerTick.sizePx,
    borderColor: shopColour.primary,
  },
  tickTL: { top: interaction.cornerTick.insetPx, left: interaction.cornerTick.insetPx, borderTopWidth: interaction.cornerTick.strokePx, borderLeftWidth: interaction.cornerTick.strokePx },
  tickTR: { top: interaction.cornerTick.insetPx, right: interaction.cornerTick.insetPx, borderTopWidth: interaction.cornerTick.strokePx, borderRightWidth: interaction.cornerTick.strokePx },
  tickBL: { bottom: interaction.cornerTick.insetPx, left: interaction.cornerTick.insetPx, borderBottomWidth: interaction.cornerTick.strokePx, borderLeftWidth: interaction.cornerTick.strokePx },
  tickBR: { bottom: interaction.cornerTick.insetPx, right: interaction.cornerTick.insetPx, borderBottomWidth: interaction.cornerTick.strokePx, borderRightWidth: interaction.cornerTick.strokePx },

  // 6 · quote rule
  quoteRuleBlock: { gap: spacing.xs },
  quoteHairline: { height: interaction.hairline.medium, backgroundColor: sharedColour.hairlineStrong },
  quoteRuleLine: {
    color: sharedColour.sub,
    fontFamily: TEXT_FAMILY,
    fontSize: money.reconcileLine.size,
    fontWeight: String(money.reconcileLine.wght) as '600',
    letterSpacing: money.reconcileLine.ls,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
