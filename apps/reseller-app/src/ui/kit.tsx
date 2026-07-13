import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  shopPlusTheme as theme,
  type,
  spacing,
  radius,
  touch,
  band,
  money,
  motion,
  interaction,
  skeleton as skeletonToken,
} from '@platform/ui-tokens';

/**
 * WO-7.0 — the reseller kit on GRAND TEINT (ui-tokens v0.8.0, pin 2472e7ae).
 * This is the SKEW EXECUTIONER: the whole visual layer moves off the retired
 * v0.6.0 token vocabulary (`theme.colors`/`typeScale`/`elevation`/`radius.lg`)
 * onto the Grand Teint API (`theme.colours`, top-level `type`/`spacing`/
 * `radius`/`touch`, `interaction`). Grand Teint is ink-on-paper: radius 0
 * boxes, hairline borders, NO shadows (§8 refuses "elevation theatre"), one
 * accent per app, huge tabular francs. Values are all tokens — the ui-scan
 * proves zero hardcode. RN primitives only; the substrate deps
 * (react-native-svg, expo-haptics) are unchanged.
 *
 * The component external API (props) is byte-identical to WO-4.2R — App.tsx's
 * navigation semantics and screen structure are untouched; only the token
 * layer under each component changed. No celebration ships here (see the
 * kit-celebration pin) — shop's first-sale moment still has no honest trigger
 * in the demo world, so staging it would fake a state.
 */

/** lineHeight helper: v0.8.0 `lh` is a UNITLESS multiplier (v0.6.0 shipped an
 * absolute px). RN needs absolute px, so every text style multiplies the two —
 * an expression, never a literal (the zero-hardcode scan stays green). */
const lh = (s: { readonly size: number; readonly lh: number }): number => s.size * s.lh;

/** The soft-spring easing as an RN curve, DERIVED from the token — v0.8.0
 * `motion.springSoft` is a CSS cubic-bezier string (web-proven), so RN parses
 * its four control points rather than inventing physics. Derive-never-invent. */
const SPRING_SOFT_POINTS = motion.springSoft
  .match(/cubic-bezier\(([^)]+)\)/)![1]!
  .split(',')
  .map((n) => Number(n.trim())) as [number, number, number, number];
const springSoftEasing = Easing.bezier(...SPRING_SOFT_POINTS);

/* The theme strip (Grand Teint §5 move 5): a 4 px app-colour band — "the only
 * permanent brand mark". Replaces WO-4.2R's woven wax band; same slot. */
export function WaxBand() {
  return <View style={styles.themeStrip} accessibilityElementsHidden />;
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
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
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
  icon: string;
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
          <Text style={styles.tabIcon}>{item.icon}</Text>
          <Text style={[styles.tabLabel, item.active && styles.tabLabelActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* Card (Grand Teint §5 move 1: the hairline box): paper surface, hairline
 * border, radius 0, NO shadow. */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/* Section overline (Grand Teint §5 move 6: caps + letterspacing wayfinding). */
export function Overline({ children }: { children: React.ReactNode }) {
  return <Text style={styles.overline}>{children}</Text>;
}

/* List row (prototype tile rows): leading glyph box · title/meta/net/detail
 * · chip · chevron. `net` always renders BEFORE `detail` — the source order
 * IS the net-first law (SP-I04/SP-I12) when the detail line carries the
 * customer price. `selected` draws the accent edge — the sélection screen's
 * chosen state (Grand Teint §5 move 3: selection is structural, not tinted). */
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
 * screen; press feedback within the touch budget (D17 < 100 ms — a style
 * swap on press, no animation to wait for). */
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

/* « L'argent en majesté » (Grand Teint §2): the FCFA amount as the hero of
 * its screen — money.amountScale.hero (52 dp), tabular numerals. */
export function AmountHero({ label, amount }: { label?: string | undefined; amount: string }) {
  return (
    <View style={styles.amountHeroBlock}>
      {label !== undefined && <Text style={styles.amountHeroLabel}>{label}</Text>}
      <Text style={styles.amountHero}>{amount}</Text>
    </View>
  );
}

/* « Le compte-montant » (Grand Teint §2): the gains hero counts up from zero
 * to the net on the money law's count-up clock — the TOKEN
 * (money.countUpMs, ≤ 600 ms, a ref into motion), never a literal — and lands
 * instantly under reduced motion. `template` is the catalog's money string
 * (the « F » belongs to the catalog, never to this code); frame numbers use
 * the same fr-FR grouping as the repo's formatFcfa, so the landed hero is
 * byte-identical to every other franc on screen. */
export function CountUpAmount({
  label,
  amount,
  template,
}: {
  label?: string | undefined;
  amount: number;
  template: string;
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
      easing: springSoftEasing,
      useNativeDriver: false,
    });
    anim.start();
    return () => {
      progress.removeListener(listener);
      anim.stop();
    };
  }, [amount, reduced, progress]);
  return <AmountHero label={label} amount={template.replace('{amount}', shown.toLocaleString('fr-FR'))} />;
}

/* Status chip (prototype pills): a dot + label on a calm wash — state is
 * always visible, never a sentence. Grand Teint has no chrome « info » colour
 * (one accent per app), so that tone reads on `muted`. */
export type ChipTone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';
const CHIP_COLOR: Record<ChipTone, string> = {
  ok: theme.colours.success,
  warn: theme.colours.warning,
  bad: theme.colours.danger,
  info: theme.colours.muted,
  muted: theme.colours.muted,
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

/* Skeleton (Grand Teint §2 « la vitesse comme luxe » — never a bare spinner):
 * a calm pulse to the token floor over the token duration; static under
 * reduced motion; exact-dimension placeholders keep layout shift at zero. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: interaction.skeletonPulseFloor, duration: skeletonToken.pulseMs, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: skeletonToken.pulseMs, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return <Animated.View style={[styles.skeleton, { opacity: pulse }, style]} />;
}

/* Honest empty state — designed, never apologetic (Grand Teint §6: empty
 * states state the next action, never sadness). */
export function EmptyState({ glyph, title, hint }: { glyph: string; title: string; hint?: string }) {
  return (
    <Card style={styles.emptyState}>
      <Text style={styles.emptyGlyph}>{glyph}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint !== undefined && <Text style={styles.emptyHint}>{hint}</Text>}
    </Card>
  );
}

/* The screen change eases in on the ONE soft spring, DERIVED from the token
 * curve (Grand Teint motion: transform+opacity only, layout animation
 * forbidden). It explains, never decorates, NEVER blocks input (content is
 * interactive from the first frame; static under reduced motion). */
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
      duration: motion.standardMs,
      easing: springSoftEasing,
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
  themeStrip: { height: band.themeStripPx, backgroundColor: theme.colours.themeStrip },
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
    borderColor: theme.colours.hairlineStrong,
    backgroundColor: theme.colours.paper,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  backChipText: { color: theme.colours.ink, fontSize: type.scale.body.size, fontWeight: type.scale.label.wght },
  headerTitleBlock: { flex: 1 },
  headerTitle: {
    color: theme.colours.ink,
    fontSize: type.scale.title.size,
    lineHeight: lh(type.scale.title),
    fontWeight: type.scale.title.wght,
  },
  headerSub: { color: theme.colours.muted, fontSize: type.scale.caption.size, lineHeight: lh(type.scale.caption) },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colours.paper,
    borderTopWidth: interaction.hairline.thin,
    borderTopColor: theme.colours.hairline,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.chip,
    minHeight: touch.minTargetPx,
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: theme.colours.primarySoft },
  tabIcon: { fontSize: type.scale.title.size, lineHeight: lh(type.scale.title) },
  tabLabel: { color: theme.colours.muted, fontSize: type.scale.caption.size, fontWeight: type.scale.label.wght },
  tabLabelActive: { color: theme.colours.primaryStrong },
  card: {
    backgroundColor: theme.colours.paper,
    borderRadius: radius.card,
    borderWidth: interaction.hairline.medium,
    borderColor: theme.colours.hairlineStrong,
    padding: spacing.lg,
    gap: spacing.md,
  },
  overline: {
    color: theme.colours.muted,
    fontSize: type.scale.label.size,
    lineHeight: lh(type.scale.label),
    fontWeight: type.scale.label.wght,
    textTransform: 'uppercase',
    letterSpacing: type.scale.label.ls,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: theme.colours.paper,
    borderRadius: radius.box,
    borderWidth: interaction.hairline.thin,
    borderColor: theme.colours.hairline,
    padding: spacing.md,
    minHeight: touch.minTargetPx,
  },
  rowSelected: {
    borderColor: theme.colours.primary,
    borderLeftWidth: interaction.accentEdgePx,
    backgroundColor: theme.colours.surfaceMuted,
  },
  rowGlyphBox: {
    width: touch.minTargetPx,
    height: touch.minTargetPx,
    borderRadius: radius.box,
    backgroundColor: theme.colours.sand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowGlyph: { fontSize: type.scale.title.size, color: theme.colours.primaryStrong, fontWeight: type.scale.title.wght },
  rowBody: { flex: 1, gap: spacing.xs },
  rowTitle: { color: theme.colours.ink, fontSize: type.scale.body.size, lineHeight: lh(type.scale.body), fontWeight: type.scale.bodyStrong.wght },
  rowMeta: { color: theme.colours.muted, fontSize: type.scale.caption.size, lineHeight: lh(type.scale.caption) },
  rowNet: {
    color: theme.colours.primaryStrong,
    fontSize: money.amountScale.section.size,
    lineHeight: lh({ size: money.amountScale.section.size, lh: money.amountScale.section.lh }),
    fontWeight: money.amountScale.section.wght,
    fontVariant: ['tabular-nums'],
  },
  rowDetail: {
    color: theme.colours.muted,
    fontSize: type.scale.caption.size,
    lineHeight: lh(type.scale.caption),
    fontVariant: ['tabular-nums'],
  },
  rowChipLine: { flexDirection: 'row' },
  rowChevron: { color: theme.colours.soft, fontSize: type.scale.title.size },
  pressed: { opacity: interaction.pressedOpacity, transform: [{ scale: interaction.pressScale }] },
  buttonBase: {
    minHeight: touch.minTargetPx + spacing.sm,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonPrimary: { backgroundColor: theme.colours.primary },
  buttonPrimaryText: { color: theme.colours.onPrimary, fontSize: type.scale.body.size, fontWeight: type.scale.bodyStrong.wght },
  buttonSecondary: { backgroundColor: theme.colours.primarySoft },
  buttonSecondaryText: { color: theme.colours.primaryStrong, fontSize: type.scale.body.size, fontWeight: type.scale.bodyStrong.wght },
  buttonGhost: { borderWidth: interaction.hairline.medium, borderColor: theme.colours.hairlineStrong, backgroundColor: theme.colours.paper },
  buttonGhostText: { color: theme.colours.ink, fontSize: type.scale.body.size, fontWeight: type.scale.label.wght },
  buttonDisabled: { opacity: interaction.disabledOpacity },
  amountHeroBlock: { alignItems: 'center', gap: spacing.xs },
  amountHeroLabel: { color: theme.colours.muted, fontSize: type.scale.body.size, lineHeight: lh(type.scale.body) },
  amountHero: {
    color: theme.colours.primaryStrong,
    fontSize: money.amountScale.hero.size,
    lineHeight: lh({ size: money.amountScale.hero.size, lh: money.amountScale.hero.lh }),
    fontWeight: money.amountScale.hero.wght,
    fontVariant: ['tabular-nums'],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: theme.colours.sand,
    borderRadius: radius.chip,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
  },
  chipDot: { width: spacing.sm, height: spacing.sm, borderRadius: radius.pill },
  chipText: { fontSize: type.scale.caption.size, fontWeight: type.scale.label.wght },
  skeleton: { backgroundColor: skeletonToken.bg, borderRadius: radius.box, minHeight: spacing.xl },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyGlyph: { fontSize: money.amountScale.hero.size, lineHeight: lh({ size: money.amountScale.hero.size, lh: money.amountScale.hero.lh }) },
  emptyTitle: { color: theme.colours.ink, fontSize: type.scale.title.size, fontWeight: type.scale.title.wght, textAlign: 'center' },
  emptyHint: { color: theme.colours.muted, fontSize: type.scale.body.size, lineHeight: lh(type.scale.body), textAlign: 'center' },
  transitionFill: { flex: 1 },
});
