import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { sharedColour, shopColour, type as t2, radius } from '@platform/ui-tokens';
import {
  spacing,
  touch,
  interaction,
  money,
  skeleton as skeletonToken,
} from '@platform/ui-tokens/legacy';
import { DISPLAY_FAMILY, TEXT_FAMILY, TEXT_FAMILY_BOLD } from './faso-fonts';
import { fp } from './motion';
import { WovenBand } from './signature';

/**
 * WO-FP-SHOP — the reseller kit on FASO PREMIUM (ui-tokens v1.0.0). The visual
 * layer moves off Grand Teint onto the v2 API: colour → sharedColour + shopColour
 * (the Shop+ magenta accent), type → the Bricolage/Instrument scale (families from
 * faso-fonts), radius → the rounded v2 geometry, motion → the seven fp* curves
 * (src/ui/motion.ts). The groups v2 defers to their own reskin slices — spacing,
 * touch, interaction, money, skeleton — resolve to /legacy VERBATIM. Warm paper,
 * rounded cards, one accent per app, tabular francs. Values are all tokens (the
 * ui-scan proves zero hardcode).
 *
 * RANGES → max (RN has no clamp; the fuller legible value — the 5-second test);
 * `rmax` is the one place that choice lives. v2 type carries no line-height, so
 * v2-typed text uses RN natural leading (derive-never-invent — a later type
 * slice may add lh). Typefaces paint in the system fallback until the App loads
 * the faces (cold-start law) — no reflow.
 *
 * The component external API (props) is byte-identical to WO-7.0 — App.tsx's
 * navigation semantics and screen structure are untouched; only the token layer
 * under each component changed. No celebration ships here (shop's first-sale
 * moment still has no honest trigger in the demo world).
 */

/** Resolve a scale/radius value canon may state as a range to its max. */
const rmax = (v: number | { readonly min: number; readonly max: number }): number =>
  typeof v === 'number' ? v : v.max;

/** RN fontWeight wants a weight string; the token carries the number. */
const w = (n: number): '400' | '700' | '800' => String(n) as '400' | '700' | '800';

/* The brand mark: the woven band (signature module) — replaces Grand Teint's
 * flat theme strip. Same slot; App.tsx still calls <WaxBand />. */
export function WaxBand() {
  return <WovenBand />;
}

/* Header (prototype `Top`): back chip · title + one-line context · right slot. */
export function AppHeader({
  title,
  subtitle,
  backLabel,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string | undefined;
  backLabel?: string | undefined;
  onBack?: (() => void) | undefined;
  right?: React.ReactNode | undefined;
}) {
  return (
    <View style={styles.header}>
      {onBack !== undefined && (
        <Pressable
          style={({ pressed }) => [styles.backChip, pressed && styles.pressed]}
          onPress={onBack}
          accessibilityRole="button"
        >
          <Text style={styles.backChipText}>{backLabel}</Text>
        </Pressable>
      )}
      <View style={styles.headerTitleBlock}>
        {title !== '' && (
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
        )}
        {subtitle !== undefined && (
          <Text style={styles.headerSub} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

/* Bottom hub bar (prototype `.tabbar`): icon + label, active = soft pill.
 * Tabs are waypoint RESETS under the ratified two-level-ladder law —
 * they never add journey edges; App.tsx owns the semantics. */
export interface TabItem {
  key: string;
  /** A canon SVG glyph node (icons.tsx), sized to dimension.iconSizePx.tab —
   * NEVER an emoji. */
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onPress: () => void;
}
export function TabBar({ items }: { items: readonly TabItem[] }) {
  return (
    <View style={styles.tabBar}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          style={[styles.tab, item.active && styles.tabActive]}
          onPress={item.onPress}
          accessibilityRole="tab"
          accessibilityState={{ selected: item.active }}
        >
          <View style={styles.tabIcon}>{item.icon}</View>
          <Text style={[styles.tabLabel, item.active && styles.tabLabelActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* Card (the rounded Faso Premium surface): card fill, hairline border, radius
 * 20. Warm and premium; the flat ink-on-paper box is retired. */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/* Section overline (caps + letterspacing wayfinding — the Instrument caps). */
export function Overline({ children }: { children: React.ReactNode }) {
  return <Text style={styles.overline}>{children}</Text>;
}

/* List row (prototype tile rows): leading glyph box · title/meta/net/detail
 * · chip · chevron. `net` always renders BEFORE `detail` — the source order
 * IS the net-first law (SP-I04/SP-I12) when the detail line carries the
 * customer price. `selected` draws the accent edge — the sélection screen's
 * chosen state (selection is structural, not tinted). */
export function ListRow({
  glyph,
  title,
  meta,
  net,
  detail,
  chip,
  selected,
  onPress,
}: {
  glyph: string;
  title: string;
  meta?: string | undefined;
  net?: string | undefined;
  detail?: string | undefined;
  chip?: React.ReactNode | undefined;
  selected?: boolean | undefined;
  onPress?: (() => void) | undefined;
}) {
  const body = (
    <>
      <View style={styles.rowGlyphBox}>
        <Text style={styles.rowGlyph}>{glyph}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {meta !== undefined && (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {meta}
          </Text>
        )}
        {net !== undefined && <Text style={styles.rowNet}>{net}</Text>}
        {detail !== undefined && <Text style={styles.rowDetail}>{detail}</Text>}
        {chip !== undefined && <View style={styles.rowChipLine}>{chip}</View>}
      </View>
      {onPress !== undefined && <Text style={styles.rowChevron}>›</Text>}
    </>
  );
  if (onPress === undefined) {
    return <View style={[styles.row, selected === true && styles.rowSelected]}>{body}</View>;
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.row, selected === true && styles.rowSelected, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityState={{ selected: selected === true }}
    >
      {body}
    </Pressable>
  );
}

/* Button hierarchy (prototype `.btn .pri/.sec/.ghost`): one primary per
 * screen; press feedback within the touch budget (a style swap on press). */
function buttonStyle(base: StyleProp<ViewStyle>) {
  return ({ pressed }: { pressed: boolean }) => [base, pressed && styles.pressed];
}
export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      style={buttonStyle([styles.buttonBase, styles.buttonPrimary, disabled === true && styles.buttonDisabled])}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text style={styles.buttonPrimaryText}>{label}</Text>
    </Pressable>
  );
}
export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={buttonStyle([styles.buttonBase, styles.buttonSecondary])} onPress={onPress} accessibilityRole="button">
      <Text style={styles.buttonSecondaryText}>{label}</Text>
    </Pressable>
  );
}
export function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={buttonStyle([styles.buttonBase, styles.buttonGhost])} onPress={onPress} accessibilityRole="button">
      <Text style={styles.buttonGhostText}>{label}</Text>
    </Pressable>
  );
}

/* « L'argent en majesté »: the FCFA amount as the hero of its screen —
 * heroMoney (Bricolage 800), tabular numerals. */
export function AmountHero({
  label,
  amount,
  onAccent,
}: {
  label?: string | undefined;
  amount: string;
  onAccent?: boolean | undefined;
}) {
  return (
    <View style={styles.amountHeroBlock}>
      {label !== undefined && (
        <Text style={onAccent === true ? styles.amountHeroLabelAccent : styles.amountHeroLabel}>{label}</Text>
      )}
      <Text style={onAccent === true ? styles.amountHeroAccent : styles.amountHero}>{amount}</Text>
    </View>
  );
}

/* « Le compte-montant »: the gains hero counts up from zero to the net on the
 * money law's count-up clock — the TOKEN (money.countUpMs, ≤ 600 ms), never a
 * literal — eased on the fp curve, landing instantly under reduced motion.
 * `template` is the catalog's money string (the « F » belongs to the catalog);
 * frame numbers use the same fr-FR grouping as the repo's formatFcfa. */
export function CountUpAmount({
  label,
  amount,
  template,
  onAccent,
}: {
  label?: string | undefined;
  amount: number;
  template: string;
  onAccent?: boolean | undefined;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      setShown(amount);
      return;
    }
    progress.setValue(0);
    const listener = progress.addListener(({ value }) => setShown(Math.round(value)));
    const anim = Animated.timing(progress, {
      toValue: amount,
      duration: money.countUpMs,
      easing: fp.fpUp.easing,
      useNativeDriver: false,
    });
    anim.start();
    return () => {
      progress.removeListener(listener);
      anim.stop();
    };
  }, [amount, reduced, progress]);
  return <AmountHero label={label} amount={template.replace('{amount}', shown.toLocaleString('fr-FR'))} onAccent={onAccent} />;
}

/* Status chip (prototype pills): a dot + label on a calm wash — state is
 * always visible, never a sentence. */
export type ChipTone = 'ok' | 'warn' | 'bad' | 'info' | 'muted' | 'ink';
const CHIP_COLOR: Record<ChipTone, string> = {
  ok: sharedColour.okFg,
  warn: sharedColour.warnFg,
  bad: sharedColour.dangerFg,
  info: sharedColour.mutedFg,
  muted: sharedColour.mutedFg,
  // A SETTLED server fact reads in ink — the strongest, calmest colour; never
  // money-green, never a lie (« LIVRÉE = chip encre, fait serveur »).
  ink: sharedColour.ink,
};
export function StatusChip({ tone, label }: { tone: ChipTone; label: string }) {
  return (
    <View style={styles.chip}>
      <View style={[styles.chipDot, { backgroundColor: CHIP_COLOR[tone] }]} />
      <Text style={[styles.chipText, { color: CHIP_COLOR[tone] }]}>{label}</Text>
    </View>
  );
}

/* Reduced-motion hook — the doctrine's flag, honored everywhere motion runs. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/* Skeleton (« la vitesse comme luxe » — never a bare spinner): a calm pulse to
 * the token floor over the skeleton clock, on the fp shimmer curve; static
 * under reduced motion; exact-dimension placeholders keep layout shift at zero. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: interaction.skeletonPulseFloor, duration: skeletonToken.pulseMs, easing: fp.fpShimmer.easing, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: skeletonToken.pulseMs, easing: fp.fpShimmer.easing, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return <Animated.View style={[styles.skeleton, { opacity: pulse }, style]} />;
}

/* Honest empty state — designed, never apologetic (empty states state the next
 * action, never sadness). */
export function EmptyState({ glyph, title, hint }: { glyph: React.ReactNode; title: string; hint?: string }) {
  return (
    <Card style={styles.emptyState}>
      <View style={styles.emptyGlyph}>{glyph}</View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint !== undefined && <Text style={styles.emptyHint}>{hint}</Text>}
    </Card>
  );
}

/* The screen change eases in on the fp UP curve, DERIVED from the v2 motion
 * token (transform+opacity only, layout animation forbidden). It explains,
 * never decorates, NEVER blocks input (content is interactive from the first
 * frame; static under reduced motion). */
export function ScreenTransition({ screenKey, children }: { screenKey: string; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: fp.fpUp.durationMs,
      easing: fp.fpUp.easing,
      useNativeDriver: true,
    }).start();
  }, [screenKey, reduced, progress]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [spacing.md, 0] });
  return (
    <Animated.View style={[styles.transitionFill, { opacity: progress, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: touch.minTargetPx,
  },
  backChip: {
    minHeight: touch.minTargetPx,
    minWidth: touch.minTargetPx,
    borderRadius: radius.button,
    borderWidth: interaction.hairline.medium,
    borderColor: sharedColour.hairlineStrong,
    backgroundColor: sharedColour.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  backChipText: { color: sharedColour.ink, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.row.size), fontWeight: w(t2.scale.row.wght) },
  headerTitleBlock: { flex: 1 },
  headerTitle: {
    color: sharedColour.ink,
    fontFamily: DISPLAY_FAMILY,
    fontSize: rmax(t2.scale.view.size),
    fontWeight: w(t2.scale.view.wght),
  },
  headerSub: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: sharedColour.paper,
    borderTopWidth: interaction.hairline.thin,
    borderTopColor: sharedColour.hairline,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    minHeight: touch.minTargetPx,
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: shopColour.soft },
  tabIcon: { alignItems: 'center', justifyContent: 'center' },
  tabLabel: { color: sharedColour.sub, fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.pill.size, fontWeight: w(t2.scale.pill.wght) },
  tabLabelActive: { color: shopColour.deep },
  card: {
    backgroundColor: sharedColour.card,
    borderRadius: radius.card,
    borderWidth: interaction.hairline.thin,
    borderColor: sharedColour.hairline,
    padding: spacing.lg,
    gap: spacing.md,
  },
  overline: {
    color: sharedColour.sub,
    fontFamily: TEXT_FAMILY_BOLD,
    fontSize: rmax(t2.scale.caps.size),
    fontWeight: w(t2.scale.caps.wght),
    textTransform: 'uppercase',
    letterSpacing: Number.parseFloat(t2.scale.caps.letterSpacing) * rmax(t2.scale.caps.size),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: sharedColour.card,
    borderRadius: radius.tile,
    borderWidth: interaction.hairline.thin,
    borderColor: sharedColour.hairline,
    padding: spacing.md,
    minHeight: touch.minTargetPx,
  },
  rowSelected: {
    borderColor: shopColour.primary,
    borderLeftWidth: interaction.accentEdgePx,
    backgroundColor: shopColour.soft,
  },
  rowGlyphBox: {
    width: touch.minTargetPx,
    height: touch.minTargetPx,
    borderRadius: radius.tile,
    backgroundColor: sharedColour.dim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowGlyph: { fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.view.size), color: shopColour.deep, fontWeight: w(t2.scale.view.wght) },
  rowBody: { flex: 1, gap: spacing.xs },
  rowTitle: { color: sharedColour.ink, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.row.size), fontWeight: w(t2.scale.row.wght) },
  rowMeta: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  rowNet: {
    color: shopColour.deep,
    fontFamily: DISPLAY_FAMILY,
    fontSize: t2.scale.cardMoney.size,
    fontWeight: w(t2.scale.cardMoney.wght),
    fontVariant: ['tabular-nums'],
  },
  rowDetail: {
    color: sharedColour.sub,
    fontFamily: TEXT_FAMILY,
    fontSize: rmax(t2.scale.body.size),
    fontVariant: ['tabular-nums'],
  },
  rowChipLine: { flexDirection: 'row' },
  rowChevron: { color: sharedColour.sub, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.view.size) },
  pressed: { opacity: interaction.pressedOpacity, transform: [{ scale: interaction.pressScale }] },
  buttonBase: {
    minHeight: touch.minTargetPx + spacing.sm,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonPrimary: { backgroundColor: shopColour.primary },
  buttonPrimaryText: { color: shopColour.onPrimary, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.row.size), fontWeight: w(t2.scale.row.wght) },
  buttonSecondary: { backgroundColor: shopColour.soft },
  buttonSecondaryText: { color: shopColour.deep, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.row.size), fontWeight: w(t2.scale.row.wght) },
  buttonGhost: { borderWidth: interaction.hairline.medium, borderColor: sharedColour.hairlineStrong, backgroundColor: sharedColour.card },
  buttonGhostText: { color: sharedColour.ink, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.row.size), fontWeight: w(t2.scale.row.wght) },
  buttonDisabled: { opacity: interaction.disabledOpacity },
  amountHeroBlock: { alignItems: 'center', gap: spacing.xs },
  amountHeroLabel: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  amountHero: {
    color: shopColour.deep,
    fontFamily: DISPLAY_FAMILY,
    fontSize: rmax(t2.scale.heroMoney.size),
    fontWeight: w(t2.scale.heroMoney.wght),
    fontVariant: ['tabular-nums'],
  },
  // On-accent variant (the gains pending hero, frame L648–649 — light on magenta).
  amountHeroLabelAccent: { color: shopColour.onPrimary, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  amountHeroAccent: {
    color: shopColour.onPrimary,
    fontFamily: DISPLAY_FAMILY,
    fontSize: rmax(t2.scale.heroMoney.size),
    fontWeight: w(t2.scale.heroMoney.wght),
    fontVariant: ['tabular-nums'],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: sharedColour.dim,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
  },
  chipDot: { width: spacing.sm, height: spacing.sm, borderRadius: radius.pill },
  chipText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.pill.size, fontWeight: w(t2.scale.pill.wght) },
  skeleton: { backgroundColor: skeletonToken.bg, borderRadius: radius.tile, minHeight: spacing.xl },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyGlyph: { alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  emptyTitle: { color: sharedColour.ink, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.view.size), fontWeight: w(t2.scale.view.wght), textAlign: 'center' },
  emptyHint: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size), textAlign: 'center' },
  transitionFill: { flex: 1 },
});
