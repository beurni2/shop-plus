import { useCallback, useState } from 'react';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { sharedColour, shopColour, type as t2, radius } from '@platform/ui-tokens';
import { spacing, touch, interaction, dimension } from '@platform/ui-tokens/legacy';
import { DISPLAY_FAMILY, TEXT_FAMILY, TEXT_FAMILY_BOLD } from './src/ui/faso-fonts';
import { IconAccueil, IconProduits, IconGains, IconVitrine, IconCoche } from './src/ui/icons';
import { formatFcfa } from './src/earnings';
import { IS_PREVIEW } from './src/preview';
import { t, tf } from './src/i18n';
import { JOURNEY, START, type Screen } from './src/journey';
import { DEMO_SHARE_IDENTITY, composeShareCard } from './src/share/hub';
import { QrCode } from './src/qr/QrCode';
import { DEMO_QR_URL } from './src/qr/identity';
import { FONTS_TO_LOAD } from './src/ui/fonts-load';
import { HeroLedger, SelectionSwap, CornerTicks, DuotoneTile, QuoteRule } from './src/ui/signature';
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
  MONTHLY_NET_DEMO,
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
  // Hub screens present like the planche: brand in the header, the big
  // screen title (Bricolage 800/28) lives IN-CONTENT so the display type
  // lands. `opportunites.title` moves to the in-content heading (frame L113).
  opportunites: 'app.title',
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
          <ScrollView contentContainerStyle={styles.homeScroll} showsVerticalScrollIndicator={false}>
            {/* Header — monogram · « Ma vitrine » + name + canon verified glyph + zone · « Comment ça marche » */}
            <View style={styles.homeHeader}>
              <View style={styles.monogram}>
                <Text style={styles.monogramText}>{DEMO_SHARE_IDENTITY.resellerName.slice(0, 1)}</Text>
              </View>
              <View style={styles.homeHeaderBody}>
                <Text style={styles.homeTitle} numberOfLines={1}>{t('accueil.home_titre')}</Text>
                <View style={styles.homeSubRow}>
                  <Text style={styles.homeSubName} numberOfLines={1}>{DEMO_SHARE_IDENTITY.resellerName}</Text>
                  <IconCoche size={dimension.iconSizePx.badge} color={shopColour.primary} />
                  <Text style={styles.homeSubZone}>{` · ${t('accueil.zone')}`}</Text>
                </View>
              </View>
              <Pressable style={({ pressed }) => [styles.commentPill, pressed && styles.pressed]} accessibilityRole="button">
                <Text style={styles.commentPillText}>{t('accueil.comment')}</Text>
              </Pressable>
            </View>

            {/* Greeting hero (Bricolage 800/28) + tagline */}
            <Text style={styles.greeting}>{tf('accueil.bonjour', { name: DEMO_SHARE_IDENTITY.resellerName })}</Text>
            <Text style={styles.homeTagline}>{t('accueil.tagline')}</Text>

            {/* Two ledger cards — caps label · Bricolage 800/24 tnum · sub-line (net-first: the money is the figure) */}
            <View style={styles.homeStatGrid}>
              <Card style={styles.ledgerCard}>
                <Overline>{t('accueil.gains_mois_label')}</Overline>
                <Text style={styles.ledgerMoneyDeep}>{formatFcfa(MONTHLY_NET_DEMO)}</Text>
                <Text style={styles.ledgerCardSub}>{t('accueil.gains_mois_sub')}</Text>
              </Card>
              <Card style={styles.ledgerCard}>
                <Overline>{t('accueil.attente_label')}</Overline>
                <Text style={styles.ledgerMoney}>{formatFcfa(totals.netFcfa)}</Text>
                <Text style={styles.ledgerCardSub}>{t('accueil.attente_sub')}</Text>
              </Card>
            </View>

            {/* Primary CTA — accent, Bricolage 700/16 + canon IconProduits (frame's decorative
                sparkle is not a canon glyph — the 29-icon set is geometry-locked; divergence listed). */}
            <Pressable style={({ pressed }) => [styles.sparkleCta, pressed && styles.pressed]} onPress={() => go('opportunites')} accessibilityRole="button">
              <IconProduits size={dimension.iconSizePx.tab} color={shopColour.onPrimary} />
              <Text style={styles.sparkleCtaText}>{t('accueil.cta_trouver')}</Text>
            </Pressable>

            {/* Section head — « Ventes en cours » caps + « Tout voir » pill */}
            <View style={styles.homeSectionHead}>
              <Overline>{t('accueil.ventes_en_cours')}</Overline>
              <Pressable style={({ pressed }) => [styles.toutVoirPill, pressed && styles.pressed]} onPress={() => go('ventes')} accessibilityRole="button">
                <Text style={styles.toutVoirText}>{t('accueil.tout_voir')}</Text>
              </Pressable>
            </View>

            {/* Active-sales rows — the duotone art-tile treatment (replaces the letter-chip) */}
            {ventesRows.length === 0 ? (
              <EmptyState glyph={<IconVitrine size={dimension.iconSizePx.emptyState} color={sharedColour.sub} />} title={t('ventes.vide_titre')} hint={t('ventes.vide_hint')} />
            ) : (
              <View style={styles.homeSalesList}>
                {ventesRows.slice(0, 2).map((row) => (
                  <Pressable key={row.id} style={({ pressed }) => [styles.homeSaleRow, pressed && styles.pressed]} onPress={() => go('ventes')} accessibilityRole="button">
                    <View style={styles.artTile}>
                      <View style={styles.artTileStripe} />
                      <Text style={styles.artTileGlyph}>{row.productName.slice(0, 1)}</Text>
                    </View>
                    <View style={styles.homeSaleBody}>
                      <Text style={styles.homeSaleTitle} numberOfLines={1}>{row.clientFirstName}</Text>
                      <Text style={styles.homeSaleSub} numberOfLines={1}>{row.productName}</Text>
                    </View>
                    <StatusChip tone={chipTone(row)} label={t(row.statusKey)} />
                  </Pressable>
                ))}
              </View>
            )}

            {/* Astuce — the rose tip card (net before you share) */}
            <View style={styles.astuceCard}>
              <Text style={styles.astuceText}>{t('accueil.astuce')}</Text>
            </View>
          </ScrollView>
        )}

        {screen === 'opportunites' && (
          <FlatList
            style={styles.listWrap}
            data={world.opportunities}
            keyExtractor={(o) => o.id}
            initialNumToRender={6}
            windowSize={5}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.oppListContent}
            ListHeaderComponent={
              // Frame L113–114 — the big screen title (Bricolage 800/28) lands
              // in-content; the net-first selling subtitle sits under it.
              <View style={styles.oppHead}>
                <Text style={styles.screenTitle}>{t('opportunites.title')}</Text>
                <Text style={styles.oppSub}>{t('opportunites.sous_titre')}</Text>
              </View>
            }
            renderItem={({ item }) => {
              const card = opportunityCard(item);
              return (
                // Frame L126–134 — a tappable product row → « ma sélection »
                // (journey edge opportunites→selection). The 60px duotone
                // art-tile is the ecosystem's product treatment (replaces the
                // letter-chip); the money block is NET-FIRST (SP-I04/I12).
                <Pressable
                  style={({ pressed }) => [styles.oppRow, pressed && styles.pressed]}
                  onPress={() => go('selection')}
                  accessibilityRole="button"
                >
                  <View style={styles.oppArtTile}>
                    <View style={styles.artTileStripe} />
                    <Text style={styles.artTileGlyph}>{item.name.slice(0, 1)}</Text>
                  </View>
                  <View style={styles.homeSaleBody}>
                    <Text style={styles.homeSaleTitle} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.homeSaleSub} numberOfLines={1}>{`${t('opportunites.repere')} : ${item.landmark}`}</Text>
                    <Text style={styles.oppNet}>{`${t('opportunity.net_label')} : ${formatFcfa(card.netFcfa)}`}</Text>
                    <Text style={styles.oppPrice}>{`${t('opportunity.customer_price_label')} : ${formatFcfa(card.customerPriceFcfa)}`}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        )}

        {screen === 'selection' && (
          <View style={styles.listWrap}>
            <Text style={styles.noteLine}>{t('selection.hint')}</Text>
            <FlatList
              data={world.opportunities}
              keyExtractor={(o) => o.id}
              initialNumToRender={6}
              windowSize={5}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const chosen = isSelected(world, item.id);
                const card = opportunityCard(item);
                return (
                  // The Fiche frame's product DNA on a multi-select row: the
                  // duotone art-tile + Bricolage name + NET-FIRST money (Fiche
                  // L149/L150/L176). The corner ticks frame the chosen row
                  // (accent overlay, no layout shift); the swap is the affordance.
                  // Fiche's single-product hero, MARGIN SLIDER, and gross
                  // waterfall are Option-A backlog (see anatomy derivation).
                  <View style={styles.selectFrame}>
                    <Pressable
                      style={({ pressed }) => [styles.oppRow, chosen && styles.rowChosen, pressed && styles.pressed]}
                      onPress={() => setWorld(toggleSelection(world, item.id))}
                      accessibilityRole="button"
                      accessibilityState={{ selected: chosen }}
                    >
                      <View style={styles.oppArtTile}>
                        <View style={styles.artTileStripe} />
                        <Text style={styles.artTileGlyph}>{item.name.slice(0, 1)}</Text>
                      </View>
                      <View style={styles.homeSaleBody}>
                        <Text style={styles.homeSaleTitle} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.homeSaleSub} numberOfLines={1}>{chosen ? t('selection.choisi') : t('selection.ajouter')}</Text>
                        <Text style={styles.oppNet}>{`${t('opportunity.net_label')} : ${formatFcfa(card.netFcfa)}`}</Text>
                      </View>
                      <SelectionSwap selected={chosen} />
                    </Pressable>
                    <CornerTicks show={chosen} />
                  </View>
                );
              }}
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
                numColumns={2}
                columnWrapperStyle={styles.gridRow}
                initialNumToRender={6}
                windowSize={5}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  // the duotone tile (signature module): a two-tone crown carrying
                  // the glyph over the client price — « prix client » only, never net.
                  <DuotoneTile glyph={item.name.slice(0, 1)} style={styles.gridTile}>
                    <Text style={styles.tileName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.tilePrice}>{formatFcfa(opportunityCard(item).customerPriceFcfa)}</Text>
                  </DuotoneTile>
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
              {/* the duotone art-tile hero — the banner the client sees first
                  (frame L206): soft field + gold keyline + product initial. */}
              <View style={styles.shareHero}>
                <View style={styles.artTileStripe} />
                <Text style={styles.shareHeroGlyph}>{shareCard.productName.slice(0, 1)}</Text>
              </View>
              {/* her name + vérifié (frame L208) — the ownable badge language */}
              <View style={styles.shareShopRow}>
                <Text style={styles.shareShopName} numberOfLines={1}>{shareCard.resellerName}</Text>
                <IconCoche size={dimension.iconSizePx.badge} color={shopColour.primary} />
              </View>
              <Text style={styles.cardTitle}>{shareCard.productName}</Text>
              {/* HER price — the big confident figure the client sees (frame L210,
                  Bricolage 800 deep tnum). Never the net, never a commission (SP-I03). */}
              <Text style={styles.shareHeroPrice}>
                {tf('share.prix', { amount: formatFcfa(shareCard.priceFcfa) })}
              </Text>
              {/* WO-7.2a — the price-validity hint (« pied de carte »): which
                  day's price this card shows; the link stays the truth (SP-I19). */}
              <Text style={styles.ogValidite}>
                {tf('share.validite', { date: shareCard.priceValidityDate })}
              </Text>
              <View style={styles.ogBadgeRow}>
                <StatusChip tone="ok" label={t('share.livre_sera')} />
              </View>
              <Text style={styles.ogSigned}>{t('share.og_signe')}</Text>
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
              {/* the quote rule (signature module): the reconcile whisper under the
                  breakdown — restates the net, right-aligned, over a hairline. */}
              <QuoteRule line={tf('gains.net', { amount: formatFcfa(totals.netFcfa) })} />
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
              {/* the hero ledger (signature module): the locked net as the hero,
                  its « réglé » reassurance as the ledger whisper below. */}
              <HeroLedger
                label={t('vente.net_label')}
                amount={formatFcfa(saleDetail.netFcfa)}
                ledger={t('vente.net_regle')}
              />
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
  // selection frame — the corner-tick overlay sits over the row (no layout shift)
  selectFrame: { position: 'relative' },
  // « Ma vitrine » two-up duotone grid
  gridRow: { gap: spacing.md },
  gridTile: { flex: 1 },
  tileName: { color: sharedColour.ink, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.row.size), fontWeight: w(t2.scale.row.wght) },
  tilePrice: {
    color: shopColour.deep,
    fontFamily: DISPLAY_FAMILY,
    fontSize: t2.scale.cardMoney.size,
    fontWeight: w(t2.scale.cardMoney.wght),
    fontVariant: ['tabular-nums'],
  },
  // ── ACCUEIL frame (planche L54–110) — sizes snap to the v2 type scale (token fidelity). ──
  pressed: { opacity: interaction.pressedOpacity, transform: [{ scale: interaction.pressScale }] },
  homeScroll: { gap: spacing.md, paddingBottom: spacing.xxl },
  homeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  monogram: {
    width: spacing.xl + spacing.lg,
    height: spacing.xl + spacing.lg,
    borderRadius: rmax(radius.art),
    backgroundColor: shopColour.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  monogramText: { color: shopColour.onPrimary, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.row.size), fontWeight: w(t2.scale.view.wght) },
  homeHeaderBody: { flex: 1, minWidth: 0 },
  homeTitle: { color: sharedColour.ink, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.view.size), fontWeight: w(t2.scale.view.wght) },
  homeSubRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  homeSubName: { flexShrink: 1, color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  homeSubZone: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  commentPill: {
    minHeight: spacing.xxl + spacing.xs,
    borderRadius: radius.pill,
    borderWidth: interaction.hairline.thin,
    borderColor: sharedColour.hairlineStrong,
    backgroundColor: sharedColour.card,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    flexShrink: 0,
  },
  commentPillText: { color: shopColour.deep, fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.pill.size, fontWeight: w(t2.scale.pill.wght) },
  greeting: { color: sharedColour.ink, fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.screen.size, fontWeight: w(t2.scale.screen.wght) },
  homeTagline: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  homeStatGrid: { flexDirection: 'row', gap: spacing.md },
  ledgerCard: { flex: 1 },
  ledgerMoneyDeep: { color: shopColour.deep, fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.cardMoney.size, fontWeight: w(t2.scale.cardMoney.wght), fontVariant: ['tabular-nums'] },
  ledgerMoney: { color: sharedColour.ink, fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.cardMoney.size, fontWeight: w(t2.scale.cardMoney.wght), fontVariant: ['tabular-nums'] },
  ledgerCardSub: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: t2.scale.pill.size },
  sparkleCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: touch.minTargetPx + spacing.sm,
    borderRadius: radius.button,
    backgroundColor: shopColour.primary,
  },
  sparkleCtaText: { color: shopColour.onPrimary, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.row.size), fontWeight: w(t2.scale.row.wght) },
  homeSectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  toutVoirPill: {
    minHeight: spacing.xl + spacing.sm,
    borderRadius: radius.pill,
    borderWidth: interaction.hairline.thin,
    borderColor: sharedColour.hairlineStrong,
    backgroundColor: sharedColour.card,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  toutVoirText: { color: sharedColour.ink, fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.pill.size, fontWeight: w(t2.scale.pill.wght) },
  homeSalesList: { gap: spacing.sm },
  homeSaleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: sharedColour.card,
    borderRadius: radius.tile,
    borderWidth: interaction.hairline.thin,
    borderColor: sharedColour.hairline,
    padding: spacing.md,
  },
  artTile: {
    width: touch.minTargetPx,
    height: touch.minTargetPx,
    borderRadius: rmax(radius.art),
    backgroundColor: shopColour.soft,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  artTileStripe: { position: 'absolute', bottom: 0, left: 0, right: 0, height: interaction.hairline.strong, backgroundColor: shopColour.gold },
  artTileGlyph: { color: shopColour.deep, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.view.size), fontWeight: w(t2.scale.view.wght) },
  homeSaleBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  homeSaleTitle: { color: sharedColour.ink, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.row.size), fontWeight: w(t2.scale.row.wght) },
  homeSaleSub: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  // ── OPPORTUNITÉS frame (planche L110–138) ──
  // Shared in-content screen heading (Bricolage 800/28) — the display type lands.
  screenTitle: { color: sharedColour.ink, fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.screen.size, fontWeight: w(t2.scale.screen.wght) },
  oppHead: { gap: spacing.xs, paddingBottom: spacing.md },
  oppSub: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  oppListContent: { gap: spacing.sm, paddingBottom: spacing.xxl },
  oppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: sharedColour.card,
    borderRadius: radius.tile,
    borderWidth: interaction.hairline.thin,
    borderColor: sharedColour.hairline,
    padding: spacing.md,
  },
  // The 60px product art-tile (frame's 60·r15) — the larger sibling of the
  // accueil 48px tile; same duotone language (soft field + gold keyline).
  oppArtTile: {
    width: touch.minTargetPx + spacing.md,
    height: touch.minTargetPx + spacing.md,
    borderRadius: rmax(radius.art),
    backgroundColor: shopColour.soft,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  // Net-forward money line (SP-I04/I12 net-first) — deep, bold, tabular.
  oppNet: { color: shopColour.deep, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.row.size), fontWeight: w(t2.scale.row.wght), fontVariant: ['tabular-nums'] },
  oppPrice: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size), fontVariant: ['tabular-nums'] },
  // « Ma sélection » chosen-row accent (mirrors the kit rowSelected border).
  rowChosen: { borderColor: shopColour.primary, borderWidth: interaction.hairline.strong },
  astuceCard: { backgroundColor: shopColour.soft, borderRadius: radius.tile, padding: spacing.lg },
  astuceText: { color: shopColour.deep, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  // ── PARTAGER frame (planche L193–236) — the hero share-card ──
  shareHero: {
    height: touch.minTargetPx * 2 + spacing.xxl,
    borderRadius: rmax(radius.art),
    backgroundColor: shopColour.soft,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareHeroGlyph: { color: shopColour.deep, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.heroMoney.size), fontWeight: w(t2.scale.heroMoney.wght) },
  shareShopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  shareShopName: { color: sharedColour.sub, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.caps.size), fontWeight: w(t2.scale.caps.wght), textTransform: 'uppercase' },
  shareHeroPrice: { color: shopColour.deep, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.heroMoney.size), fontWeight: w(t2.scale.heroMoney.wght), fontVariant: ['tabular-nums'] },
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
