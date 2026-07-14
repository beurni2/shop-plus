import { useCallback, useState } from 'react';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { sharedColour, shopColour, type as t2, radius } from '@platform/ui-tokens';
import { spacing, touch, dimension } from '@platform/ui-tokens/legacy';
import { DISPLAY_FAMILY, TEXT_FAMILY, TEXT_FAMILY_BOLD } from './src/ui/faso-fonts';
import { IconAccueil, IconProduits, IconGains, IconVitrine } from './src/ui/icons';
import { formatFcfa } from './src/earnings';
import { IS_PREVIEW } from './src/preview';
import { t, tf } from './src/i18n';
import { JOURNEY, START, type Screen } from './src/journey';
import { DEMO_SHARE_IDENTITY, composeShareCard } from './src/share/hub';
import { QrCode } from './src/qr/QrCode';
import { DEMO_QR_URL } from './src/qr/identity';
import { FONTS_TO_LOAD } from './src/ui/fonts-load';
import {
  ventesListModel,
  demoDetail,
  type SaleRow,
  type SaleDetail,
  type TimelineStep,
} from './src/sales/ventes';
import {
  DEMO_SHARE_LINK,
  DEMO_KIT_LINK,
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
  type ChipTone,
} from './src/ui/kit';

/**
 * WO-FP-SHOP — FASO PREMIUM over WO-4.1's walkable world. Same screens, same
 * edges, same back law, same money from the same frozen seed — the visual layer
 * moves off Grand Teint onto the v2 API (colour → sharedColour + shopColour,
 * type → the Bricolage/Instrument scale, radius → the rounded v2 geometry,
 * motion via the kit's seven fp* curves); the /legacy geometry groups (spacing,
 * touch, dimension) stay verbatim per the v2 scope. The navigation SEMANTICS are
 * untouched — tabs are waypoint RESETS (they jump only to states already
 * reachable from START along declared edges); go() and its edge guard are
 * byte-identical to WO-4.1.
 */

/** Resolve a scale value canon may state as a range to its max (RN has no clamp
 * — the fuller legible value; the one documented rule). */
const rmax = (v: number | { readonly min: number; readonly max: number }): number =>
  typeof v === 'number' ? v : v.max;
/** RN fontWeight wants a string; the token carries the number. */
const w = (n: number): '400' | '700' | '800' => String(n) as '400' | '700' | '800';

/** Bottom-nav glyph colour: active = accent deep, inactive = muted (matches label). */
const navColor = (active: boolean): string => (active ? shopColour.deep : sharedColour.sub);

/* The money lines (prototype `.ml`/`.mlTot`): gross and the honest 20 % fee
 * as calm muted lines, a dashed rule, then the net — the strongest line,
 * never gross-first (SP-I04/SP-I12). */
function GainsBreakdown({ line, style }: { line: GainsLine; style?: object }) {
  return (
    <View style={[styles.moneyBlock, style]}>
      <Text style={styles.moneyLine}>
        {tf('gains.brut', { amount: formatFcfa(line.grossFcfa) })}
      </Text>
      <Text style={styles.moneyLine}>
        {tf('gains.part', { amount: formatFcfa(line.feeFcfa) })}
      </Text>
      <View style={styles.moneyRule} />
      <Text style={styles.moneyNetLine}>
        {tf('gains.net', { amount: formatFcfa(line.netFcfa) })}
      </Text>
    </View>
  );
}

/** S7 status → chip tone, matching the mockup palette: a PROBLÈME reads « bad »
 * (danger), À LA PORTE — the nearest to the door — reads « warn » (amber), and
 * LIVRÉE is a server fact in « ink » (never money-green, never a lie before the
 * operator); the in-transit/paid middle states stay calm (muted). */
const chipTone = (row: SaleRow): ChipTone =>
  row.status === 'probleme' ? 'bad'
  : row.status === 'a_la_porte' ? 'warn'
  : row.status === 'livree' ? 'ink'
  : 'muted';

/* S7 detail — the coarse custody timeline (« OÙ EN EST LA COMMANDE »): a dot
 * column (done: ink · now: accent ring + MAINTENANT · later: hairline) + label
 * + note. Never a map, never a GPS point — steps only (SE custody law). */
function TimelineRow({ step, last }: { step: TimelineStep; last: boolean }) {
  const done = step.phase === 'done';
  const now = step.phase === 'now';
  return (
    <View style={styles.timelineStep}>
      <View style={styles.timelineDotCol}>
        <View style={[styles.timelineDot, done && styles.timelineDotDone, now && styles.timelineDotNow]} />
        {!last && <View style={[styles.timelineConnector, done && styles.timelineConnectorDone]} />}
      </View>
      <View style={styles.timelineBody}>
        <View style={styles.timelineHead}>
          <Text style={[styles.timelineLabel, now && styles.timelineLabelNow, step.phase === 'later' && styles.timelineLabelLater]}>
            {t(step.labelKey)}
          </Text>
          {now && <StatusChip tone="info" label={t('vente.maintenant')} />}
        </View>
        {step.noteKey !== undefined && <Text style={styles.noteLine}>{t(step.noteKey)}</Text>}
      </View>
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
  ventes: 'ventes.titre',
  vente_detail: 'vente.titre',
};

export default function App() {
  // COLD-START LAW: load the Faso Premium faces asynchronously and DO NOT gate
  // first paint on them — the metrics-close system fallback renders immediately,
  // and the faces swap in when ready (expo-font re-renders on load). First paint
  // never waits; a face that never resolves simply stays in the fallback.
  useFonts(FONTS_TO_LOAD);
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
  // The share card is DETERMINISTIC from her price-free assets + price snapshot
  // (SP-I19). It carries the live-truth signed link by construction — no
  // commission field exists on the type (SP-I03).
  const shareCard = composeShareCard(DEMO_SHARE_IDENTITY);
  // S7 — the sales list (net-first, problems-first) + the demo detail (Mariam).
  const ventesRows = ventesListModel();
  const saleDetail = demoDetail();
  const headerTitle =
    screen === 'vente_detail'
      ? tf('vente.titre', { name: saleDetail.clientFirstName })
      : t(SCREEN_TITLE_KEY[screen]);

  return (
    <SafeAreaView style={styles.screen}>
      {/* SDK 54: backgroundColor restored per the WO-4.0d-prep founder
          ruling ③ — pre-edge-to-edge Android draws a default bar; the
          surface token is the correct fill. */}
      <StatusBar style="dark" backgroundColor={sharedColour.paper} />
      <WaxBand />
      {IS_PREVIEW && (
        <View style={styles.previewBanner}>
          <Text style={styles.previewBannerText}>{t('preview.banner')}</Text>
        </View>
      )}

      <AppHeader
        title={headerTitle}
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
            <SecondaryButton label={t('ventes.nav')} onPress={() => go('ventes')} />
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
              {tf('selection.compte', { count: String(world.selectedIds.length) })}
            </Text>
            <PrimaryButton label={t('selection.action')} onPress={() => go('vitrine')} />
          </View>
        )}

        {screen === 'vitrine' && (
          <View style={styles.listWrap}>
            <Text style={styles.noteLine}>{t('vitrine.note')}</Text>
            {selection.length === 0 ? (
              <EmptyState
                glyph={<IconVitrine size={dimension.iconSizePx.emptyState} color={sharedColour.sub} />}
                title={t('vitrine.vide')}
              />
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
          <ScrollView contentContainerStyle={styles.hubScroll} showsVerticalScrollIndicator={false}>
            {/* The card PREVIEW — « ce que verra votre cliente » (SP-I19): her
                product, HER price, « Livré par Séra », signed. No commission,
                never the supplier (SP-I03) — composeShareCard's type forbids it. */}
            <Card>
              <Overline>{t('share.og_titre')}</Overline>
              <Text style={styles.cardTitle}>{shareCard.productName}</Text>
              <Text style={styles.ogPrice}>
                {tf('share.prix', { amount: formatFcfa(shareCard.priceFcfa) })}
              </Text>
              <View style={styles.ogBadgeRow}>
                <StatusChip tone="ok" label={t('share.livre_sera')} />
              </View>
              <Text style={styles.ogSigned}>{t('share.og_signe')}</Text>
              {/* WO-7.2a — the price-validity hint (« pied de carte »): which
                  day's price this card shows; the link stays the truth (SP-I19). */}
              <Text style={styles.ogValidite}>
                {tf('share.validite', { date: shareCard.priceValidityDate })}
              </Text>
            </Card>

            {/* The signed PRODUCT link — the one she sends; the live price/stock
                truth. Fictional sandbox link, honestly marked « lien d'essai ». */}
            <Card>
              <View style={styles.linkBox}>
                <Text style={styles.linkText}>{DEMO_SHARE_LINK}</Text>
                <Text style={styles.linkHint}>{t('lien.hint')}</Text>
              </View>
              <Text style={styles.message}>{t('lien.explication')}</Text>
            </Card>

            {/* The IDENTITY link — her permanent vitrine (`/v/{slug}`), for the
                bio; the same public code printed on every card. */}
            <Card>
              <Overline>{tf('share.code', { code: DEMO_SHARE_IDENTITY.shortCode })}</Overline>
              <Text style={styles.noteLine}>{t('share.code_hint')}</Text>
              <View style={styles.linkBox}>
                <Text style={styles.linkText}>{shareCard.identityLinkSuffix}</Text>
                <Text style={styles.linkHint}>{t('share.voir_vitrine')}</Text>
              </View>
              <Text style={styles.message}>{t('share.bio')}</Text>
            </Card>

            {/* WO-7.2b — the on-screen QR (ruling #10: react-native-svg draws
                the vendored encoder's matrix). The SAME vitrine slug, made
                scannable in person: her cliente points a phone and lands on
                `/v/{slug}`. The code prints beside it, so no-scan still works —
                the QR is the shortcut, never the only door. */}
            <Card>
              <Overline>{t('share.qr_titre')}</Overline>
              <Text style={styles.message}>{t('share.qr_blurb')}</Text>
              <View style={styles.qrFrame}>
                <QrCode url={DEMO_QR_URL} />
              </View>
              <View style={styles.qrCaption}>
                <Text style={styles.qrLegende}>{t('share.qr_legende')}</Text>
                <Text style={styles.codeStrong}>{DEMO_SHARE_IDENTITY.shortCode}</Text>
                <Text style={styles.qrRepli}>
                  {tf('share.qr_repli', { code: DEMO_SHARE_IDENTITY.shortCode })}
                </Text>
              </View>
            </Card>

            {/* WO-7.2b — the link-out to the media kit (Q5: a LINK, never a
                webview embed). The composeur is a sibling web surface; the
                reseller opens it to turn this card into a publishable image.
                Sandbox link, honestly « d'essai » like every demo link. */}
            <Card>
              <Overline>{t('share.kit')}</Overline>
              <View style={styles.linkBox}>
                <Text style={styles.linkText}>{DEMO_KIT_LINK}</Text>
                <Text style={styles.linkHint}>{t('share.kit_hint')}</Text>
              </View>
            </Card>

            <PrimaryButton label={t('lien.action')} onPress={() => go('gains')} />
          </ScrollView>
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
                {tf('gains.baseline_titre', { amount: formatFcfa(baselineProductPriceFcfa()) })}
              </Text>
              <GainsBreakdown line={baseline} />
            </Card>
            <Text style={styles.noteLine}>{t('gains.suite')}</Text>
            <SecondaryButton label={t('opportunites.title')} onPress={() => go('opportunites')} />
          </View>
        )}

        {screen === 'ventes' && (
          ventesRows.length === 0 ? (
            <View style={styles.stackGap}>
              <EmptyState
                glyph={<IconVitrine size={dimension.iconSizePx.emptyState} color={sharedColour.sub} />}
                title={t('ventes.vide_titre')}
                hint={t('ventes.vide_hint')}
              />
              <PrimaryButton label={t('ventes.vide_action')} onPress={() => go('vitrine')} />
            </View>
          ) : (
            <View style={styles.listWrap}>
              <FlatList
                data={ventesRows}
                keyExtractor={(r) => r.id}
                initialNumToRender={6}
                windowSize={5}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <View style={styles.venteRowGroup}>
                    <ListRow
                      glyph={item.clientFirstName.slice(0, 1)}
                      title={item.clientFirstName}
                      meta={item.productName}
                      net={tf('ventes.net_ligne', { amount: formatFcfa(item.netFcfa) })}
                      chip={<StatusChip tone={chipTone(item)} label={t(item.statusKey)} />}
                      onPress={() => go('vente_detail')}
                    />
                    {item.status === 'probleme' && (
                      <Card style={styles.problemeEncart}>
                        <Text style={styles.message}>{t('ventes.probleme_encart')}</Text>
                        <Text style={styles.noteLine}>{t('ventes.probleme_rien')}</Text>
                        <SecondaryButton label={t('ventes.probleme_action')} onPress={() => go('vente_detail')} />
                      </Card>
                    )}
                  </View>
                )}
              />
              <Text style={styles.noteLine}>{t('ventes.relais')}</Text>
            </View>
          )
        )}

        {screen === 'vente_detail' && (
          <View style={styles.stackGap}>
            {/* NET FIRST, always — the net before SON prix; the commission
                exists nowhere; only her client's first name (relais). */}
            <Card style={styles.netCard}>
              <Overline>{t('vente.net_label')}</Overline>
              <Text style={styles.netFigure}>{formatFcfa(saleDetail.netFcfa)}</Text>
              <Text style={styles.noteLine}>{t('vente.net_regle')}</Text>
            </Card>
            <Card>
              <Text style={styles.cardTitle}>
                {tf('vente.son_prix', { amount: formatFcfa(saleDetail.sonPrixFcfa) })}
              </Text>
            </Card>
            <Card>
              <Overline>{t('vente.timeline_titre')}</Overline>
              <View style={styles.timeline}>
                {saleDetail.timeline.map((step, i) => (
                  <TimelineRow key={String(i)} step={step} last={i === saleDetail.timeline.length - 1} />
                ))}
              </View>
            </Card>
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
            { key: 'accueil', icon: <IconAccueil size={dimension.iconSizePx.tab} color={navColor(screen === 'accueil')} />, label: t('nav.tab_accueil'), active: screen === 'accueil', onPress: () => toHub('accueil') },
            { key: 'opportunites', icon: <IconProduits size={dimension.iconSizePx.tab} color={navColor(screen === 'opportunites')} />, label: t('nav.tab_opportunites'), active: screen === 'opportunites', onPress: () => toHub('opportunites') },
            { key: 'gains', icon: <IconGains size={dimension.iconSizePx.tab} color={navColor(screen === 'gains')} />, label: t('nav.tab_gains'), active: screen === 'gains', onPress: () => toHub('gains') },
          ]}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sharedColour.paper },
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
    color: sharedColour.ink,
    fontFamily: DISPLAY_FAMILY,
    fontSize: t2.scale.screen.size,
    fontWeight: w(t2.scale.screen.wght),
    fontVariant: ['tabular-nums'],
  },
  listWrap: { flex: 1, gap: spacing.md },
  listContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  hubScroll: { gap: spacing.md, paddingBottom: spacing.lg },
  ogPrice: {
    color: shopColour.deep,
    fontFamily: DISPLAY_FAMILY,
    fontSize: t2.scale.cardMoney.size,
    fontWeight: w(t2.scale.cardMoney.wght),
    fontVariant: ['tabular-nums'],
  },
  ogBadgeRow: { flexDirection: 'row', paddingTop: spacing.xs },
  ogSigned: {
    color: sharedColour.sub,
    fontFamily: TEXT_FAMILY,
    fontSize: rmax(t2.scale.body.size),
    paddingTop: spacing.xs,
  },
  ogValidite: {
    color: sharedColour.sub,
    fontFamily: TEXT_FAMILY,
    fontSize: rmax(t2.scale.body.size),
    paddingTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  // S7 — ventes list + detail.
  venteRowGroup: { gap: spacing.xs },
  problemeEncart: { gap: spacing.sm },
  netCard: {
    borderWidth: spacing.xs / 2,
    borderColor: shopColour.primary,
  },
  netFigure: {
    color: shopColour.deep,
    fontFamily: DISPLAY_FAMILY,
    fontSize: rmax(t2.scale.heroMoney.size),
    fontWeight: w(t2.scale.heroMoney.wght),
    fontVariant: ['tabular-nums'],
  },
  timeline: { gap: spacing.md, paddingTop: spacing.sm },
  timelineStep: { flexDirection: 'row', gap: spacing.md },
  timelineDotCol: { alignItems: 'center', width: spacing.md },
  timelineDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sharedColour.hairlineStrong,
    backgroundColor: sharedColour.card,
  },
  timelineDotDone: { backgroundColor: sharedColour.ink, borderColor: sharedColour.ink },
  timelineDotNow: { backgroundColor: shopColour.primary, borderColor: shopColour.primary },
  timelineConnector: {
    flex: 1,
    width: StyleSheet.hairlineWidth,
    minHeight: spacing.md,
    backgroundColor: sharedColour.hairlineStrong,
  },
  timelineConnectorDone: { backgroundColor: sharedColour.ink },
  timelineBody: { flex: 1, gap: spacing.xs, paddingBottom: spacing.sm },
  timelineHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timelineLabel: {
    color: sharedColour.ink,
    fontFamily: TEXT_FAMILY_BOLD,
    fontSize: rmax(t2.scale.row.size),
    fontWeight: w(t2.scale.row.wght),
  },
  timelineLabelNow: { color: sharedColour.ink },
  timelineLabelLater: { color: sharedColour.sub },
  message: {
    color: sharedColour.ink,
    fontFamily: TEXT_FAMILY,
    fontSize: rmax(t2.scale.body.size),
  },
  noteLine: {
    color: sharedColour.sub,
    fontFamily: TEXT_FAMILY,
    fontSize: rmax(t2.scale.body.size),
  },
  cardTitle: {
    color: sharedColour.ink,
    fontFamily: DISPLAY_FAMILY,
    fontSize: rmax(t2.scale.view.size),
    fontWeight: w(t2.scale.view.wght),
  },
  moneyBlock: { gap: spacing.xs },
  moneyLine: {
    color: sharedColour.sub,
    fontFamily: TEXT_FAMILY,
    fontSize: rmax(t2.scale.body.size),
    fontVariant: ['tabular-nums'],
  },
  moneyRule: {
    borderBottomWidth: spacing.xs / 4,
    borderBottomColor: sharedColour.hairlineStrong,
    borderStyle: 'dashed',
    marginTop: spacing.xs,
  },
  moneyNetLine: {
    color: shopColour.deep,
    fontFamily: DISPLAY_FAMILY,
    fontSize: t2.scale.cardMoney.size,
    fontWeight: w(t2.scale.cardMoney.wght),
    fontVariant: ['tabular-nums'],
  },
  linkBox: {
    backgroundColor: sharedColour.dim,
    borderRadius: radius.tile,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sharedColour.hairlineStrong,
    padding: spacing.lg,
    gap: spacing.xs,
    alignItems: 'center',
  },
  linkText: {
    color: sharedColour.ink,
    fontFamily: TEXT_FAMILY_BOLD,
    fontSize: rmax(t2.scale.row.size),
    fontWeight: w(t2.scale.row.wght),
    textAlign: 'center',
  },
  linkHint: {
    color: sharedColour.sub,
    fontFamily: TEXT_FAMILY,
    fontSize: rmax(t2.scale.body.size),
    textAlign: 'center',
  },
  // WO-7.2b — the on-screen QR. Frame hugs the derived side (alignSelf), sits
  // on the tinted surface so the QR's own paper quiet zone reads as a scannable card.
  qrFrame: {
    alignSelf: 'center',
    backgroundColor: sharedColour.dim,
    borderRadius: radius.tile,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sharedColour.hairlineStrong,
    padding: spacing.lg,
  },
  qrCaption: { alignItems: 'center', gap: spacing.xs },
  qrLegende: {
    color: sharedColour.sub,
    fontFamily: TEXT_FAMILY,
    fontSize: rmax(t2.scale.body.size),
    textAlign: 'center',
  },
  codeStrong: {
    color: sharedColour.ink,
    fontFamily: DISPLAY_FAMILY,
    fontSize: rmax(t2.scale.view.size),
    fontWeight: w(t2.scale.view.wght),
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  qrRepli: {
    color: sharedColour.sub,
    fontFamily: TEXT_FAMILY,
    fontSize: rmax(t2.scale.body.size),
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    minHeight: touch.minTargetPx,
  },
  footerHint: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: t2.scale.pill.size },
  resetAction: { minHeight: touch.minTargetPx, justifyContent: 'center', paddingHorizontal: spacing.md },
  resetActionText: { color: sharedColour.sub, fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.pill.size, fontWeight: w(t2.scale.pill.wght) },
  previewBanner: {
    backgroundColor: sharedColour.dim,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sharedColour.hairline,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  previewBannerText: {
    color: sharedColour.sub,
    fontFamily: TEXT_FAMILY,
    fontSize: rmax(t2.scale.body.size),
  },
});
