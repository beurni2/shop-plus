import { useCallback, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { shopPlusTheme as theme } from '@platform/ui-tokens';
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

/**
 * WO-4.1 — LE MONDE NAVIGABLE. The SP0.1 net-first card becomes a walkable
 * reseller journey over src/journey.ts: accueil → les opportunités (FlatList,
 * seeded, NET-FIRST — gross-first UI is prohibited by canon) → ma sélection →
 * l'aperçu de la vitrine (what the customer sees) → le lien signé (sandbox,
 * visibly non-functional) → mes gains (net largest; the honest 20 % fee and
 * the gross beside it, never instead of it). No new business capability: the
 * demo world's every franc derives from the pinned waterfall via the
 * checked-in seed snapshot (see src/demo/store.ts — the Metro-safe snapshot
 * law of this repo). « Recommencer la démo » resets world + stack.
 */

function GainsBreakdown({ line, style }: { line: GainsLine; style?: object }) {
  return (
    <View style={style}>
      <Text style={styles.detailLine}>
        {t('gains.brut').replace('{amount}', formatFcfa(line.grossFcfa))}
      </Text>
      <Text style={styles.detailLine}>
        {t('gains.part').replace('{amount}', formatFcfa(line.feeFcfa))}
      </Text>
      <Text style={styles.detailNetLine}>
        {t('gains.net').replace('{amount}', formatFcfa(line.netFcfa))}
      </Text>
    </View>
  );
}

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

  const selection = selectedOpportunities(world);
  const totals = gainsTotal(world.opportunities);
  const baseline = baselineGains();

  return (
    <SafeAreaView style={styles.screen}>
      {/* SDK 54: backgroundColor restored per the WO-4.0d-prep founder
          ruling ③ — pre-edge-to-edge Android draws a default bar; the
          surface token is the correct fill. */}
      <StatusBar style="dark" backgroundColor={theme.colors.surface} />
      {IS_PREVIEW && (
        <View style={styles.previewBanner}>
          <Text style={styles.previewBannerText}>{t('preview.banner')}</Text>
        </View>
      )}

      <View style={styles.header}>
        {stack.length > 1 ? (
          <Pressable style={styles.backAction} onPress={back}>
            <Text style={styles.backActionText}>← {t('nav.retour')}</Text>
          </Pressable>
        ) : (
          <Text style={styles.brand}>{t('app.title')}</Text>
        )}
      </View>

      <View style={styles.content}>
        {screen === 'accueil' && (
          <View style={styles.stackGap}>
            <Text style={styles.brand}>{t('app.title')}</Text>
            <Text style={styles.message}>{t('accueil.tagline')}</Text>
            <Pressable style={styles.primaryAction} onPress={() => go('opportunites')}>
              <Text style={styles.primaryActionText}>{t('accueil.card_opportunites')}</Text>
            </Pressable>
            <Pressable style={styles.secondaryCard} onPress={() => go('gains')}>
              <Text style={styles.secondaryCardText}>{t('accueil.card_gains')}</Text>
            </Pressable>
          </View>
        )}

        {screen === 'opportunites' && (
          <View style={styles.listWrap}>
            <Text style={styles.heading}>{t('opportunites.title')}</Text>
            <FlatList
              data={world.opportunities}
              keyExtractor={(o) => o.id}
              initialNumToRender={6}
              windowSize={5}
              renderItem={({ item }) => {
                const card = opportunityCard(item);
                return (
                  <View style={styles.listRow}>
                    <Text style={styles.listName}>{item.name}</Text>
                    <Text style={styles.listMeta}>
                      {t('opportunites.repere')} : {item.landmark}
                    </Text>
                    <Text style={styles.listNet}>
                      {t('opportunity.net_label')} : {formatFcfa(card.netFcfa)}
                    </Text>
                    <Text style={styles.listMeta}>
                      {t('opportunity.customer_price_label')} : {formatFcfa(card.customerPriceFcfa)}
                    </Text>
                  </View>
                );
              }}
            />
            <Pressable style={styles.primaryAction} onPress={() => go('selection')}>
              <Text style={styles.primaryActionText}>{t('opportunites.action')}</Text>
            </Pressable>
          </View>
        )}

        {screen === 'selection' && (
          <View style={styles.listWrap}>
            <Text style={styles.heading}>{t('selection.title')}</Text>
            <Text style={styles.message}>{t('selection.hint')}</Text>
            <FlatList
              data={world.opportunities}
              keyExtractor={(o) => o.id}
              initialNumToRender={6}
              windowSize={5}
              renderItem={({ item }) => (
                <Pressable
                  style={isSelected(world, item.id) ? styles.listRowSelected : styles.listRow}
                  onPress={() => setWorld(toggleSelection(world, item.id))}
                >
                  <Text style={styles.listName}>{item.name}</Text>
                  <Text style={styles.listNet}>
                    {t('opportunity.net_label')} : {formatFcfa(opportunityCard(item).netFcfa)}
                  </Text>
                  <Text style={isSelected(world, item.id) ? styles.badgeOk : styles.badgeMuted}>
                    {isSelected(world, item.id) ? t('selection.choisi') : t('selection.ajouter')}
                  </Text>
                </Pressable>
              )}
            />
            <Text style={styles.footerHint}>
              {t('selection.compte').replace('{count}', String(world.selectedIds.length))}
            </Text>
            <Pressable style={styles.primaryAction} onPress={() => go('vitrine')}>
              <Text style={styles.primaryActionText}>{t('selection.action')}</Text>
            </Pressable>
          </View>
        )}

        {screen === 'vitrine' && (
          <View style={styles.listWrap}>
            <Text style={styles.heading}>{t('vitrine.title')}</Text>
            <Text style={styles.message}>{t('vitrine.note')}</Text>
            {selection.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.message}>{t('vitrine.vide')}</Text>
              </View>
            ) : (
              <FlatList
                data={selection}
                keyExtractor={(o) => o.id}
                initialNumToRender={6}
                windowSize={5}
                renderItem={({ item }) => (
                  <View style={styles.listRow}>
                    <Text style={styles.listName}>{item.name}</Text>
                    <Text style={styles.vitrinePrice}>
                      {formatFcfa(opportunityCard(item).customerPriceFcfa)}
                    </Text>
                  </View>
                )}
              />
            )}
            <Pressable style={styles.primaryAction} onPress={() => go('lien')}>
              <Text style={styles.primaryActionText}>{t('vitrine.action')}</Text>
            </Pressable>
          </View>
        )}

        {screen === 'lien' && (
          <View style={styles.card}>
            <Text style={styles.heading}>{t('lien.title')}</Text>
            <View style={styles.linkCard}>
              <Text style={styles.linkText}>{DEMO_SHARE_LINK}</Text>
              <Text style={styles.linkHint}>{t('lien.hint')}</Text>
            </View>
            <Text style={styles.message}>{t('lien.explication')}</Text>
            <Pressable style={styles.primaryAction} onPress={() => go('gains')}>
              <Text style={styles.primaryActionText}>{t('lien.action')}</Text>
            </Pressable>
          </View>
        )}

        {screen === 'gains' && (
          <View style={styles.stackGap}>
            <Text style={styles.heading}>{t('gains.title')}</Text>
            <Text style={styles.netLabel}>{t('gains.total_label')}</Text>
            <Text style={styles.netAmount}>{formatFcfa(totals.netFcfa)}</Text>
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>{t('gains.detail_titre')}</Text>
              <GainsBreakdown line={totals} />
            </View>
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>
                {t('gains.baseline_titre').replace(
                  '{amount}',
                  formatFcfa(baselineProductPriceFcfa()),
                )}
              </Text>
              <GainsBreakdown line={baseline} />
            </View>
            <Text style={styles.message}>{t('gains.suite')}</Text>
            <Pressable style={styles.secondaryCard} onPress={() => go('opportunites')}>
              <Text style={styles.secondaryCardText}>{t('opportunites.title')}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerHint}>{t('demo.donnees')}</Text>
        <Pressable style={styles.resetAction} onPress={reset}>
          <Text style={styles.resetActionText}>{t('nav.recommencer')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  header: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.lg,
    justifyContent: 'center',
  },
  stackGap: { gap: theme.spacing.lg },
  brand: {
    color: theme.colors.primary,
    fontSize: theme.typeScale.title.size,
    lineHeight: theme.typeScale.title.lineHeight,
    fontWeight: theme.typeScale.title.weight,
    textAlign: 'center',
  },
  heading: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.heading.size,
    lineHeight: theme.typeScale.heading.lineHeight,
    fontWeight: theme.typeScale.heading.weight,
    textAlign: 'center',
  },
  message: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.bodyLarge.size,
    lineHeight: theme.typeScale.bodyLarge.lineHeight,
    textAlign: 'center',
  },
  card: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.lg,
    borderColor: theme.colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  listWrap: { flex: 1, gap: theme.spacing.md, paddingVertical: theme.spacing.md },
  listRow: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.lg,
    borderColor: theme.colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.xs,
    minHeight: 44,
  },
  listRowSelected: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.lg,
    borderColor: theme.colors.primary,
    borderWidth: StyleSheet.hairlineWidth,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.xs,
    minHeight: 44,
  },
  listName: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.bodyLarge.size,
    lineHeight: theme.typeScale.bodyLarge.lineHeight,
    fontWeight: theme.typeScale.heading.weight,
  },
  listMeta: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.label.size,
    lineHeight: theme.typeScale.label.lineHeight,
  },
  listNet: {
    color: theme.colors.success,
    fontSize: theme.typeScale.bodyLarge.size,
    lineHeight: theme.typeScale.bodyLarge.lineHeight,
    fontWeight: theme.typeScale.title.weight,
  },
  badgeOk: {
    color: theme.colors.primary,
    fontSize: theme.typeScale.label.size,
    lineHeight: theme.typeScale.label.lineHeight,
    fontWeight: theme.typeScale.label.weight,
  },
  badgeMuted: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.label.size,
    lineHeight: theme.typeScale.label.lineHeight,
    fontWeight: theme.typeScale.label.weight,
  },
  vitrinePrice: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.heading.size,
    lineHeight: theme.typeScale.heading.lineHeight,
    fontWeight: theme.typeScale.heading.weight,
  },
  netLabel: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.label.size,
    lineHeight: theme.typeScale.label.lineHeight,
    fontWeight: theme.typeScale.label.weight,
    textAlign: 'center',
  },
  netAmount: {
    color: theme.colors.success,
    fontSize: theme.typeScale.displayFcfa.size,
    lineHeight: theme.typeScale.displayFcfa.lineHeight,
    fontWeight: theme.typeScale.displayFcfa.weight,
    textAlign: 'center',
  },
  detailCard: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.lg,
    borderColor: theme.colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  detailTitle: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.body.size,
    lineHeight: theme.typeScale.body.lineHeight,
    fontWeight: theme.typeScale.heading.weight,
    textAlign: 'center',
  },
  detailLine: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.label.size,
    lineHeight: theme.typeScale.label.lineHeight,
    textAlign: 'center',
  },
  detailNetLine: {
    color: theme.colors.success,
    fontSize: theme.typeScale.bodyLarge.size,
    lineHeight: theme.typeScale.bodyLarge.lineHeight,
    fontWeight: theme.typeScale.title.weight,
    textAlign: 'center',
  },
  linkCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderColor: theme.colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
    alignItems: 'center',
  },
  linkText: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.bodyLarge.size,
    lineHeight: theme.typeScale.bodyLarge.lineHeight,
    fontWeight: theme.typeScale.heading.weight,
    textAlign: 'center',
  },
  linkHint: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.label.size,
    lineHeight: theme.typeScale.label.lineHeight,
    textAlign: 'center',
  },
  primaryAction: {
    minHeight: 44,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  primaryActionText: {
    color: theme.colors.surfaceRaised,
    fontSize: theme.typeScale.bodyLarge.size,
    fontWeight: theme.typeScale.heading.weight,
  },
  secondaryCard: {
    minHeight: 44,
    borderRadius: theme.radius.lg,
    borderColor: theme.colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  secondaryCardText: { color: theme.colors.ink, fontSize: theme.typeScale.bodyLarge.size },
  backAction: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
  },
  backActionText: { color: theme.colors.ink, fontSize: theme.typeScale.bodyLarge.size },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    minHeight: 44,
    gap: theme.spacing.md,
  },
  footerHint: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.label.size,
    lineHeight: theme.typeScale.label.lineHeight,
  },
  resetAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: theme.spacing.md },
  resetActionText: { color: theme.colors.inkMuted, fontSize: theme.typeScale.label.size },
  previewBanner: {
    backgroundColor: theme.colors.ink,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  previewBannerText: {
    color: theme.colors.surface,
    fontSize: theme.typeScale.label.size,
    lineHeight: theme.typeScale.label.lineHeight,
  },
});
