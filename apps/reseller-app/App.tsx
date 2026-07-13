import { useCallback, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { shopPlusTheme as theme, type, spacing, radius, touch, money } from '@platform/ui-tokens';
import { formatFcfa } from './src/earnings';
import { IS_PREVIEW } from './src/preview';
import { t } from './src/i18n';
import { JOURNEY, START, type Screen } from './src/journey';
import {
  DEMO_SHARE_LINK,
  baselineGains,
  baselineProductPriceFcfa,
  createDemoWorld,
  gainsTotal,
  isSelected,
  opportunityCard,
  selectedOpportunities,
  toggleSelection,
  type DemoWorld,
  type GainsLine,
} from './src/demo/store';
import {
  AppHeader,
  Card,
  CountUpAmount,
  EmptyState,
  ListRow,
  Overline,
  PrimaryButton,
  ScreenTransition,
  SecondaryButton,
  StatusChip,
  TabBar,
  WaxBand,
} from './src/ui/kit';

/**
 * WO-7.0 — GRAND TEINT over WO-4.1's walkable world. Same screens, same
 * edges, same back law, same money from the same frozen seed — the visual
 * layer is the kit (src/ui/kit.tsx, now ui-tokens v0.8.0 Grand Teint), the
 * navigation SEMANTICS are untouched. This file's own styles move off the
 * retired v0.6.0 token vocabulary onto the Grand Teint API in the same skew
 * kill. Tabs are waypoint RESETS under the ratified two-level-ladder law
 * (they jump only to states already reachable from START along declared
 * edges — accueil→opportunites, accueil→gains); go() and its edge guard are
 * byte-identical to WO-4.1.
 */

/** lineHeight helper — v0.8.0 `lh` is a unitless multiplier; RN needs px. */
const lh = (s: { readonly size: number; readonly lh: number }): number => s.size * s.lh;

/* The money lines (prototype `.ml`/`.mlTot`): gross and the honest 20 % fee
 * as calm muted lines, a dashed rule, then the net — the strongest line,
 * never gross-first (SP-I04/SP-I12). */
function GainsBreakdown({ line, style }: { line: GainsLine; style?: object }) {
  return (
    <View style={[styles.moneyBlock, style]}>
      <Text style={styles.moneyLine}>
        {t('gains.brut').replace('{amount}', formatFcfa(line.grossFcfa))}
      </Text>
      <Text style={styles.moneyLine}>
        {t('gains.part').replace('{amount}', formatFcfa(line.feeFcfa))}
      </Text>
      <View style={styles.moneyRule} />
      <Text style={styles.moneyNetLine}>
        {t('gains.net').replace('{amount}', formatFcfa(line.netFcfa))}
      </Text>
    </View>
  );
}

/** The bottom hubs (WO-4.2R): Accueil · Opportunités · Gains. */
const HUBS: readonly Screen[] = ['accueil', 'opportunites', 'gains'];

const SCREEN_TITLE_KEY: Record<Screen, string> = {
  accueil: 'app.title',
  opportunites: 'opportunites.title',
  selection: 'selection.title',
  vitrine: 'vitrine.title',
  lien: 'lien.title',
  gains: 'gains.title',
};

export default function App() {
  const [world, setWorld] = useState<DemoWorld>(() => createDemoWorld());
  const [stack, setStack] = useState<Screen[]>([START]);
  const screen = stack[stack.length - 1] ?? START;

  const go = useCallback(
    (next: Screen) => {
      if (!JOURNEY[stack[stack.length - 1] ?? START].includes(next)) return;
      setStack((s) => [...s, next]);
    },
    [stack],
  );
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const reset = useCallback(() => {
    setWorld(createDemoWorld());
    setStack([START]);
  }, []);
  // Waypoint reset, never an edge: each hub state is already reachable
  // from START along declared edges; the tab jumps to that exact state.
  const toHub = useCallback((hub: Screen) => {
    setStack(hub === START ? [START] : [START, hub]);
  }, []);

  const selection = selectedOpportunities(world);
  const totals = gainsTotal(world.opportunities);
  const baseline = baselineGains();

  return (
    <SafeAreaView style={styles.screen}>
      {/* SDK 54: backgroundColor restored per the WO-4.0d-prep founder
          ruling ③ — pre-edge-to-edge Android draws a default bar; the
          surface token is the correct fill. */}
      <StatusBar style="dark" backgroundColor={theme.colours.paper} />
      <WaxBand />
      {IS_PREVIEW && (
        <View style={styles.previewBanner}>
          <Text style={styles.previewBannerText}>{t('preview.banner')}</Text>
        </View>
      )}

      <AppHeader
        title={t(SCREEN_TITLE_KEY[screen])}
        subtitle={screen === 'accueil' ? t('accueil.tagline') : undefined}
        backLabel={`← ${t('nav.retour')}`}
        onBack={stack.length > 1 ? back : undefined}
      />

      <ScreenTransition screenKey={screen}>
      <View style={styles.content}>
        {screen === 'accueil' && (
          <View style={styles.stackGap}>
            <View style={styles.statGrid}>
              <Card style={styles.statCard}>
                <Overline>{t('opportunites.title')}</Overline>
                <Text style={styles.statValue}>{world.opportunities.length}</Text>
              </Card>
              <Card style={styles.statCard}>
                <Overline>{t('selection.title')}</Overline>
                <Text style={styles.statValue}>{world.selectedIds.length}</Text>
              </Card>
            </View>
            <PrimaryButton label={t('accueil.card_opportunites')} onPress={() => go('opportunites')} />
            <SecondaryButton label={t('accueil.card_gains')} onPress={() => go('gains')} />
          </View>
        )}

        {screen === 'opportunites' && (
          <View style={styles.listWrap}>
            <FlatList
              data={world.opportunities}
              keyExtractor={(o) => o.id}
              initialNumToRender={6}
              windowSize={5}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const card = opportunityCard(item);
                return (
                  <ListRow
                    glyph={item.name.slice(0, 1)}
                    title={item.name}
                    meta={`${t('opportunites.repere')} : ${item.landmark}`}
                    net={`${t('opportunity.net_label')} : ${formatFcfa(card.netFcfa)}`}
                    detail={`${t('opportunity.customer_price_label')} : ${formatFcfa(card.customerPriceFcfa)}`}
                  />
                );
              }}
            />
            <PrimaryButton label={t('opportunites.action')} onPress={() => go('selection')} />
          </View>
        )}

        {screen === 'selection' && (
          <View style={styles.listWrap}>
            <Text style={styles.noteLine}>{t('selection.hint')}</Text>
            <FlatList
              data={world.opportunities}
              keyExtractor={(o) => o.id}
              initialNumToRender={6}
              windowSize={5}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <ListRow
                  glyph={item.name.slice(0, 1)}
                  title={item.name}
                  net={`${t('opportunity.net_label')} : ${formatFcfa(opportunityCard(item).netFcfa)}`}
                  chip={
                    isSelected(world, item.id) ? (
                      <StatusChip tone="ok" label={t('selection.choisi')} />
                    ) : (
                      <StatusChip tone="muted" label={t('selection.ajouter')} />
                    )
                  }
                  selected={isSelected(world, item.id)}
                  onPress={() => setWorld(toggleSelection(world, item.id))}
                />
              )}
            />
            <Text style={styles.noteLine}>
              {t('selection.compte').replace('{count}', String(world.selectedIds.length))}
            </Text>
            <PrimaryButton label={t('selection.action')} onPress={() => go('vitrine')} />
          </View>
        )}

        {screen === 'vitrine' && (
          <View style={styles.listWrap}>
            <Text style={styles.noteLine}>{t('vitrine.note')}</Text>
            {selection.length === 0 ? (
              <EmptyState glyph="🛍️" title={t('vitrine.vide')} />
            ) : (
              <FlatList
                data={selection}
                keyExtractor={(o) => o.id}
                initialNumToRender={6}
                windowSize={5}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <ListRow
                    glyph={item.name.slice(0, 1)}
                    title={item.name}
                    net={formatFcfa(opportunityCard(item).customerPriceFcfa)}
                  />
                )}
              />
            )}
            <PrimaryButton label={t('vitrine.action')} onPress={() => go('lien')} />
          </View>
        )}

        {screen === 'lien' && (
          <Card>
            <View style={styles.linkBox}>
              <Text style={styles.linkText}>{DEMO_SHARE_LINK}</Text>
              <Text style={styles.linkHint}>{t('lien.hint')}</Text>
            </View>
            <Text style={styles.message}>{t('lien.explication')}</Text>
            <PrimaryButton label={t('lien.action')} onPress={() => go('gains')} />
          </Card>
        )}

        {screen === 'gains' && (
          <View style={styles.stackGap}>
            <Card>
              <CountUpAmount
                label={t('gains.total_label')}
                amount={totals.netFcfa}
                template={t('money.amount_f')}
              />
            </Card>
            <Card>
              <Overline>{t('gains.detail_titre')}</Overline>
              <GainsBreakdown line={totals} />
            </Card>
            <Card>
              <Text style={styles.cardTitle}>
                {t('gains.baseline_titre').replace(
                  '{amount}',
                  formatFcfa(baselineProductPriceFcfa()),
                )}
              </Text>
              <GainsBreakdown line={baseline} />
            </Card>
            <Text style={styles.noteLine}>{t('gains.suite')}</Text>
            <SecondaryButton label={t('opportunites.title')} onPress={() => go('opportunites')} />
          </View>
        )}
      </View>
      </ScreenTransition>

      <View style={styles.footer}>
        <Text style={styles.footerHint}>{t('demo.donnees')}</Text>
        <Pressable style={styles.resetAction} onPress={reset}>
          <Text style={styles.resetActionText}>{t('nav.recommencer')}</Text>
        </Pressable>
      </View>

      {HUBS.includes(screen) && (
        <TabBar
          items={[
            { key: 'accueil', icon: '🏠', label: t('nav.tab_accueil'), active: screen === 'accueil', onPress: () => toHub('accueil') },
            { key: 'opportunites', icon: '🛍️', label: t('nav.tab_opportunites'), active: screen === 'opportunites', onPress: () => toHub('opportunites') },
            { key: 'gains', icon: '💰', label: t('nav.tab_gains'), active: screen === 'gains', onPress: () => toHub('gains') },
          ]}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colours.paper },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  stackGap: { gap: spacing.md, paddingTop: spacing.sm },
  statGrid: { flexDirection: 'row', gap: spacing.md },
  statCard: { flex: 1 },
  statValue: {
    color: theme.colours.ink,
    fontSize: type.scale.display.size,
    lineHeight: lh(type.scale.display),
    fontWeight: type.scale.display.wght,
    fontVariant: ['tabular-nums'],
  },
  listWrap: { flex: 1, gap: spacing.md },
  listContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  message: {
    color: theme.colours.ink,
    fontSize: type.scale.body.size,
    lineHeight: lh(type.scale.body),
  },
  noteLine: {
    color: theme.colours.muted,
    fontSize: type.scale.body.size,
    lineHeight: lh(type.scale.body),
  },
  cardTitle: {
    color: theme.colours.ink,
    fontSize: type.scale.body.size,
    lineHeight: lh(type.scale.body),
    fontWeight: type.scale.title.wght,
  },
  moneyBlock: { gap: spacing.xs },
  moneyLine: {
    color: theme.colours.muted,
    fontSize: type.scale.body.size,
    lineHeight: lh(type.scale.body),
    fontVariant: ['tabular-nums'],
  },
  moneyRule: {
    borderBottomWidth: spacing.xs / 4,
    borderBottomColor: theme.colours.hairlineStrong,
    borderStyle: 'dashed',
    marginTop: spacing.xs,
  },
  moneyNetLine: {
    color: theme.colours.primaryStrong,
    fontSize: money.amountScale.section.size,
    lineHeight: money.amountScale.section.size * money.amountScale.section.lh,
    fontWeight: money.amountScale.section.wght,
    fontVariant: ['tabular-nums'],
  },
  linkBox: {
    backgroundColor: theme.colours.sand,
    borderRadius: radius.box,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colours.hairlineStrong,
    padding: spacing.lg,
    gap: spacing.xs,
    alignItems: 'center',
  },
  linkText: {
    color: theme.colours.ink,
    fontSize: type.scale.body.size,
    lineHeight: lh(type.scale.body),
    fontWeight: type.scale.bodyStrong.wght,
    textAlign: 'center',
  },
  linkHint: {
    color: theme.colours.muted,
    fontSize: type.scale.caption.size,
    lineHeight: lh(type.scale.caption),
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    minHeight: touch.minTargetPx,
  },
  footerHint: { color: theme.colours.soft, fontSize: type.scale.caption.size },
  resetAction: { minHeight: touch.minTargetPx, justifyContent: 'center', paddingHorizontal: spacing.md },
  resetActionText: { color: theme.colours.muted, fontSize: type.scale.caption.size, fontWeight: type.scale.label.wght },
  previewBanner: {
    backgroundColor: theme.colours.sand,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colours.hairline,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  previewBannerText: {
    color: theme.colours.muted,
    fontSize: type.scale.caption.size,
    lineHeight: lh(type.scale.caption),
  },
});
