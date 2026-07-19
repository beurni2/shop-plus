import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Linking, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { sharedColour, shopColour, type as t2, radius } from '@platform/ui-tokens';
import { spacing, touch, interaction, dimension } from '@platform/ui-tokens/legacy';
import { DISPLAY_FAMILY, TEXT_FAMILY, TEXT_FAMILY_BOLD } from './src/ui/faso-fonts';
import { IconAccueil, IconProduits, IconGains, IconVitrine, IconCoche, IconVoix } from './src/ui/icons';
import { formatFcfa } from './src/earnings';
import { IS_PREVIEW } from './src/preview';
import { t, tf } from './src/i18n';
import { JOURNEY, START, type Screen } from './src/journey';
import { DEMO_SHARE_IDENTITY, composeShareCard } from './src/share/hub';
import { QrCode } from './src/qr/QrCode';
import { DEMO_QR_URL, QR_ORIGIN, QR_BASE } from './src/qr/identity';
import { FONTS_TO_LOAD } from './src/ui/fonts-load';
import { foldVitrine, type VitrineEvent } from './src/vitrine/collection';
import { marginBreakdown, markupCap, defaultMarkup } from './src/vitrine/margin';
import { MarginSlider } from './src/ui/margin-slider';
import { HeroLedger, DuotoneTile } from './src/ui/signature';
import { CustomizeStack } from './src/vitrine/customize/screens';
import { useVoiceNotes, VoiceNoteSheet, voiceCardLabel } from './src/vitrine/customize/voice-sheet';
import {
  useCercle, CercleHub, CampWizard, CampaignActive, CampaignFunding, CercleReputation,
  CercleMembres, IconCercleDeux, PendingHero, GainsSaleCard, CercleAccueilCard,
} from './src/cercle/screens';
import { produit as cercleProduit, CERCLE_DIVERS, partagerBadge } from './src/cercle/model';
import {
  ventesListModel,
  demoDetail,
  type SaleRow,
  enAttenteNet,
  payeSemaine,
  gainsCards,
  type SaleDetail,
  type TimelineStep,
} from './src/sales/ventes';
import {
  DEMO_SHARE_LINK,
  createDemoWorld,
  MONTHLY_NET_DEMO,
  type DemoOpportunity,
  type DemoWorld,
} from './src/demo/store';
import {
  AppHeader,
  Card,
  EmptyState,
  GhostButton,
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

/** The dock hubs — WO-VITRINE-FLOW promotes Ma Vitrine to a tab: Accueil ·
 * Opportunités · Ma Vitrine · Gains (the planche dock is 5 incl. Cercle; Cercle
 * stays OUT — gated, SP9). Tabs are waypoint resets, never journey edges. */
const HUBS: readonly Screen[] = ['accueil', 'opportunites', 'vitrine', 'cercle', 'gains'];

/** Screens whose frame renders a big 28/800 title IN-CONTENT (planche) — the
 * chrome header title is suppressed for these so it isn't a duplicate. */
const IN_CONTENT_TITLE: readonly Screen[] = ['vitrine', 'personnaliser', 'cercle', 'campnew', 'campaign', 'funding', 'reput', 'membres'];

const SCREEN_TITLE_KEY: Record<Screen, string> = {
  accueil: 'app.title',
  // Hub screens present like the planche: brand in the header, the big
  // screen title (Bricolage 800/28) lives IN-CONTENT so the display type
  // lands. `opportunites.title` moves to the in-content heading (frame L113).
  opportunites: 'app.title',
  fiche: 'fiche.title',
  vitrine: 'vitrine.title',
  pubvitrine: 'pubvitrine.title',
  personnaliser: 'k.title',
  cercle: 'ce.hub_titre',
  campnew: 'ce.w1_titre',
  campaign: 'ce.hub_titre',
  funding: 'ce.f_titre',
  reput: 'ce.r_titre',
  membres: 'ce.m_titre',
  lien: 'lien.title',
  // Hub — brand in the header; the big « Gains » title lands in-content (frame L644).
  gains: 'app.title',
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

  // WO-VITRINE-FLOW — the vitrine-collection seam, React-backed: an in-memory
  // VitrineEvent log in state + the shared `foldVitrine`. The flow calls the
  // port's interface methods (never demo-state mutation); VITRINE-REAL-BACKING
  // swaps the log for the live storefront source. Ancillary UI state: which
  // product the Fiche shows, which product Partager targets, the per-product
  // markups the reseller sets on Ma Vitrine, the share-card format, and the toast.
  const [vitrineLog, setVitrineLog] = useState<VitrineEvent[]>([]);
  const [ficheId, setFicheId] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [markups, setMarkups] = useState<Record<string, number>>({});
  const [shareFmt, setShareFmt] = useState<'card' | 'story' | 'affiche'>('card');
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  // Notes vocales — ONE controller (real capture, expo-audio) hosted here, so the
  // mic on each Ma Vitrine product card opens a record SHEET for THAT product
  // (founder Option A — recording lives with the product, not behind « Aa »).
  const voice = useVoiceNotes(setToast);
  const [voiceSheet, setVoiceSheet] = useState<{ pid: string; name: string } | null>(null);
  // LE CERCLE — one controller (campaign + draft + the [MOCK-PARTENAIRE] port).
  const cercle = useCercle(setToast);
  // D5 — Partager opened from a Cercle surface carries the campaign badge.
  const [shareCampBadge, setShareCampBadge] = useState(false);
  const campShare = shareCampBadge && partagerBadge(cercle.camp) ? cercle.camp : null;
  const vitrineCol = useMemo(() => {
    const emit = (e: VitrineEvent) => setVitrineLog((l) => [...l, e]);
    const at = () => new Date().toISOString();
    const { live, discoverable } = foldVitrine(vitrineLog);
    return {
      addToVitrine: (listingId: string) => emit({ type: 'listing.published', listingId, at: at() }),
      removeFromVitrine: (listingId: string) => emit({ type: 'listing.auto_hidden', listingId, at: at() }),
      setDiscoverable: (d: boolean) => emit({ type: 'storefront.published', discoverable: d, at: at() }),
      listings: (): readonly string[] => live,
      has: (listingId: string) => live.includes(listingId),
      isDiscoverable: () => discoverable,
      shareSlug: () => DEMO_SHARE_IDENTITY.identityLinkSuffix,
    };
  }, [vitrineLog]);

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

  // WO-VITRINE-FLOW — the vitrine + share derived state, all from the seam's fold,
  // the frozen seed inputs (B, C), and the reseller's own markup. `vitrineOpps` are
  // the products she added (the seam's live listings); `ficheOpp`/`shareOpp` are the
  // tapped / to-share products. `viewOf` is the reseller-margin view at her markup
  // (markups[pid]) or the capped default — the ONE money computation the reseller
  // surfaces share (opp row · fiche · vitrine tile · partager), all reconciling.
  const vitrineLive = vitrineCol.listings();
  const vitrineOpps = world.opportunities.filter((o) => vitrineLive.includes(o.id));
  const ficheOpp = world.opportunities.find((o) => o.id === ficheId);
  const shareOpp = world.opportunities.find((o) => o.id === shareId);
  const viewOf = (opp: DemoOpportunity) => {
    const cap = markupCap(opp.input.sellerBasePrice);
    const m = markups[opp.id] ?? defaultMarkup(cap);
    return marginBreakdown(opp.input.sellerBasePrice, opp.input.sellerFundedCommission, m);
  };
  // Her REAL vitrine link — the canon origin + base + the seam's `/v/{slug}`.
  const shareUrl = `${QR_ORIGIN}${QR_BASE}${vitrineCol.shareSlug()}`;
  // The share channels — production-shaped over RN Share/Linking. The message is
  // catalog copy (never inline), the link is her real signed slug. Deep-links try
  // first (WhatsApp/Facebook), the OS share sheet is the honest fallback (and the
  // « copier » path — a native Clipboard dep would need a full rebuild, not an OTA;
  // FLAG VITRINE-SHARE-CLIPBOARD: swap the sheet for a one-tap copy at integration).
  const shareVia = useCallback(
    async (channel: 'copier' | 'whatsapp' | 'facebook' | 'tiktok') => {
      const message = tf('partager.message', { url: shareUrl });
      try {
        if (channel === 'whatsapp') {
          const wa = `whatsapp://send?text=${encodeURIComponent(message)}`;
          if (await Linking.canOpenURL(wa)) {
            await Linking.openURL(wa);
            return;
          }
        } else if (channel === 'facebook') {
          const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
          if (await Linking.canOpenURL(fb)) {
            await Linking.openURL(fb);
            return;
          }
        }
        await Share.share({ message });
      } catch {
        // best-effort: a declined or unavailable share sheet is not an error state.
      }
    },
    [shareUrl],
  );
  // The demo build stamp — the actual OTA update id (expo-updates), « dev » in
  // the local runtime; honest provenance in the demo footer, never a fake build.
  const buildStamp = Updates.updateId ?? 'dev';
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
      : // Screens that render their OWN big in-content title (frame's 28/800)
        // suppress the chrome title so it isn't a duplicate — the header keeps
        // only the back chip. (Set membership, not a `screen === …` literal, so
        // the net-first block-slice bounds in ui-kit.test stay intact.)
        IN_CONTENT_TITLE.includes(screen)
        ? ''
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
          <ScrollView style={styles.screenScroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
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
                <Text style={styles.ledgerMoney}>{formatFcfa(enAttenteNet())}</Text>
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
            {/* D2 — C-CE23 « Mon Cercle » (second, contextual entry — the dock
                tab stays the canonical one). Living sub-line. */}
            <CercleAccueilCard camp={cercle.camp} membres={CERCLE_DIVERS.membres} onPress={() => go('cercle')} />
          </ScrollView>
        )}

        {screen === 'opportunites' && (
          <FlatList
            style={styles.screenScroll}
            data={world.opportunities}
            keyExtractor={(o) => o.id}
            initialNumToRender={6}
            windowSize={5}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollList}
            ListHeaderComponent={
              // Frame L113–114 — the big screen title (Bricolage 800/28) lands
              // in-content; the net-first selling subtitle sits under it.
              <View style={styles.oppHead}>
                <Text style={styles.screenTitle}>{t('opportunites.title')}</Text>
                <Text style={styles.oppSub}>{t('opportunites.sous_titre')}</Text>
              </View>
            }
            renderItem={({ item }) => (
              // §4 L70 — a tappable product row → its FICHE (journey edge
              // opportunites→fiche). Net-only « Gagnez ≈ {net} net » at the default
              // markup (min(1500, cap)) — the estimate; she sets her exact markup on
              // Ma Vitrine. Net-first: net shown, gross never (SP-I04/I12).
              <Pressable
                style={({ pressed }) => [styles.oppRow, pressed && styles.pressed]}
                onPress={() => { setFicheId(item.id); go('fiche'); }}
                accessibilityRole="button"
              >
                <View style={styles.oppArtTile}>
                  <View style={styles.artTileStripe} />
                  <Text style={styles.artTileGlyph}>{item.name.slice(0, 1)}</Text>
                </View>
                <View style={styles.homeSaleBody}>
                  <Text style={styles.homeSaleTitle} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.homeSaleSub} numberOfLines={1}>{`${t('opportunites.repere')} : ${item.landmark}`}</Text>
                  <Text style={styles.oppNet}>{tf('opportunity.gagnez', { amount: formatFcfa(viewOf(item).net) })}</Text>
                </View>
              </Pressable>
            )}
          />
        )}

        {/* FICHE (frame 03 / HANDOFF §4 L72, RE-SCOPED add-only per founder redirect):
            art héro 170 · titre 24 · identity note · protections chips · sticky CTA
            « Ajouter à ma vitrine ». The marge CARD + slider + waterfall lines are
            REMOVED — the markup now lives on Ma Vitrine (per product). Money here is
            ONE display-only line « Gagnez ≈ {net} net » at the default markup, same
            as the Opportunités row (net-first; gross never shown). Diaspora/PackLab
            special cards are gated (Law #8) — omitted pending an explicit override. */}
        {screen === 'fiche' && ficheOpp !== undefined &&
          ((opp: DemoOpportunity) => {
            const already = vitrineCol.has(opp.id);
            return (
              <ScrollView style={styles.screenScroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
                {/* the vérifié badge language (§4 L72 tier pill) */}
                <View style={styles.ficheTierRow}>
                  <StatusChip tone="ok" label={t('fiche.tier')} />
                </View>
                {/* art héro 170 — the duotone product banner */}
                <View style={styles.ficheHero}>
                  <View style={styles.artTileStripe} />
                  <Text style={styles.ficheHeroGlyph}>{opp.name.slice(0, 1)}</Text>
                </View>
                {/* titre 24 + identity note — the vendor stays hidden */}
                <Text style={styles.ficheTitle}>{opp.name}</Text>
                <Text style={styles.ficheIdentity}>{t('fiche.identity_note')}</Text>
                {/* the ONE money line — « Gagnez ≈ {net} net » at the default markup;
                    she sets her exact markup on Ma Vitrine. No interactive control here. */}
                <Text style={styles.ficheGagnez}>{tf('opportunity.gagnez', { amount: formatFcfa(viewOf(opp).net) })}</Text>
                {/* protections chips — the trust affordances */}
                <View style={styles.ficheChips}>
                  <StatusChip tone="muted" label={t('fiche.chip_inspection')} />
                  <StatusChip tone="muted" label={t('fiche.chip_refus')} />
                </View>
                <PrimaryButton
                  label={t('fiche.cta')}
                  disabled={already}
                  onPress={() => {
                    vitrineCol.addToVitrine(opp.id);
                    setToast(t('fiche.ajoutee_toast'));
                    go('vitrine');
                  }}
                />
              </ScrollView>
            );
          })(ficheOpp)}

        {/* MA VITRINE (frame L239–267): title « Ma vitrine » 28/800 + name + vérifié,
            the œil → aperçu-cliente, the Privée/Publique toggle (the seam's
            `setDiscoverable` + the verbatim toasts), and the product grid read from
            the seam's live listings (`vitrineCol.listings()`). Each tile carries the
            client price (deep) and her net (small) — never a vendor. Empty is a
            designed state: the vitrine waits, with a way back to the opportunities. */}
        {screen === 'vitrine' && (
          vitrineOpps.length === 0 ? (
            <ScrollView style={styles.screenScroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
              <View style={styles.vitrineHead}>
                <Text style={styles.screenTitle}>{t('vitrine.title')}</Text>
                <View style={styles.homeSubRow}>
                  <Text style={styles.homeSubName} numberOfLines={1}>{DEMO_SHARE_IDENTITY.resellerName}</Text>
                  <IconCoche size={dimension.iconSizePx.badge} color={shopColour.primary} />
                </View>
              </View>
              <Text style={styles.noteLine}>{t('vitrine.sous_titre')}</Text>
              <EmptyState
                glyph={<IconVitrine size={dimension.iconSizePx.emptyState} color={sharedColour.sub} />}
                title={t('vitrine.vide')}
              />
              <SecondaryButton label={t('accueil.cta_trouver')} onPress={() => toHub('opportunites')} />
            </ScrollView>
          ) : (
            <FlatList
              style={styles.screenScroll}
              data={vitrineOpps}
              keyExtractor={(o) => o.id}
              initialNumToRender={6}
              windowSize={5}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollList}
              ListHeaderComponent={
                <View style={styles.scrollHead}>
                  <View style={styles.vitrineHeadRow}>
                    <View style={styles.vitrineHead}>
                      <Text style={styles.screenTitle}>{t('vitrine.title')}</Text>
                      <View style={styles.homeSubRow}>
                        <Text style={styles.homeSubName} numberOfLines={1}>{DEMO_SHARE_IDENTITY.resellerName}</Text>
                        <IconCoche size={dimension.iconSizePx.badge} color={shopColour.primary} />
                      </View>
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.vitrineIconBtn, pressed && styles.pressed]}
                      onPress={() => go('personnaliser')}
                      accessibilityRole="button"
                      accessibilityLabel={t('k.entree')}
                    >
                      <Text style={styles.homeSubName}>Aa</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.vitrineIconBtn, pressed && styles.pressed]}
                      onPress={() => go('pubvitrine')}
                      accessibilityRole="button"
                      accessibilityLabel={t('vitrine.apercu_public')}
                    >
                      <IconVitrine size={dimension.iconSizePx.badge} color={shopColour.deep} />
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.vitrineToggle, pressed && styles.pressed]}
                      onPress={() => {
                        const nv = !vitrineCol.isDiscoverable();
                        vitrineCol.setDiscoverable(nv);
                        setToast(nv ? t('vitrine.toast_publique') : t('vitrine.toast_privee'));
                      }}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: vitrineCol.isDiscoverable() }}
                    >
                      <View style={[styles.toggleDot, vitrineCol.isDiscoverable() ? styles.toggleDotPublic : styles.toggleDotPrivate]} />
                      <Text style={styles.toggleLabel}>{vitrineCol.isDiscoverable() ? t('vitrine.toggle_publique') : t('vitrine.toggle_privee')}</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.noteLine}>{t('vitrine.sous_titre')}</Text>
                </View>
              }
              renderItem={({ item }) => {
                // Per-product card (founder recomposition of the planche read-only
                // grid): art 110 · client price (deep) ↔ net (small, live) · the
                // marge SLIDER (0→cap, pas 100 → live net/client via marginBreakdown,
                // reseller-margin only) · a per-product « Partager ». Net-first: the
                // reseller sees her net beside the client price; gross is never shown.
                const v = viewOf(item);
                const markup = markups[item.id] ?? defaultMarkup(v.cap);
                return (
                  <Card style={styles.vitrineCard}>
                    <View style={styles.vitrineCardArt}>
                      <View style={styles.artTileStripe} />
                      <Text style={styles.vitrineCardGlyph}>{item.name.slice(0, 1)}</Text>
                    </View>
                    <Text style={styles.tileName} numberOfLines={1}>{item.name}</Text>
                    {/* NET-FIRST hero — her gain is the biggest, deepest figure on
                        HER vitrine (SP-I04/I12); the cliente price is the secondary
                        context line beneath it. */}
                    <Overline>{t('opportunity.net_label')}</Overline>
                    <Text style={styles.vitrineNetHero}>{formatFcfa(v.net)}</Text>
                    <Text style={styles.vitrineClientLine}>{tf('vitrine.prix_cliente', { amount: formatFcfa(v.client) })}</Text>
                    <View style={styles.margeHeadRow}>
                      <Overline>{t('fiche.marge_titre')}</Overline>
                      <Text style={styles.margeAmount}>{formatFcfa(markup)}</Text>
                    </View>
                    <MarginSlider
                      value={markup}
                      cap={v.cap}
                      onChange={(m) => setMarkups((prev) => ({ ...prev, [item.id]: m }))}
                    />
                    <Text style={styles.noteLine}>{tf('fiche.plafond', { amount: formatFcfa(v.cap) })}</Text>
                    {/* Note vocale — the mic lives WITH the product (founder Option A);
                        tapping opens the record sheet for THIS article. */}
                    <Pressable
                      style={({ pressed }) => [styles.vitrineVoiceBtn, pressed && styles.pressed]}
                      onPress={() => setVoiceSheet({ pid: item.id, name: item.name })}
                      accessibilityRole="button"
                      accessibilityLabel={t('k.voix.note_produit')}
                    >
                      <IconVoix size={dimension.iconSizePx.badge} color={shopColour.primary} />
                      <Text style={styles.vitrineVoiceLabel}>{voiceCardLabel(voice.notes[item.id])}</Text>
                    </Pressable>
                    <SecondaryButton
                      label={t('vitrine.partager')}
                      onPress={() => { setShareCampBadge(false); setShareId(item.id); go('lien'); }}
                    />
                  </Card>
                );
              }}
            />
          )
        )}

        {/* PARTAGER (frame L193–236 / §4 L74, PER-PRODUCT per founder redirect):
            the 3 format segments (Carte/Story/Affiche → art 150/250/190), the client
            preview card at HER markup, the reseller-only net line, the share channels
            over RN Share/Linking (the real signed slug), the signed product link, and
            the QR to her `/v/{slug}`. The ≤3 multi-select is DROPPED (she shares one
            product at a time). Net-first: the card shows HER price; her net is a
            separate, reseller-only whisper — never on the cliente's card. */}
        {screen === 'lien' && (
          <ScrollView style={styles.screenScroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* the 3 card formats — the segmented control (§4 L74) */}
            <View style={styles.fmtSegments}>
              {(['card', 'story', 'affiche'] as const).map((f) => {
                const on = shareFmt === f;
                const key = f === 'card' ? 'partager.fmt_carte' : f === 'story' ? 'partager.fmt_story' : 'partager.fmt_affiche';
                return (
                  <Pressable
                    key={f}
                    style={[styles.fmtSeg, on && styles.fmtSegOn]}
                    onPress={() => setShareFmt(f)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.fmtSegText, on && styles.fmtSegTextOn]}>{t(key)}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* the client PREVIEW — the product she is sharing, at HER markup. HER
                price, « Livré par Séra », signed. Never the net, never a commission,
                never the supplier (SP-I03) — the client-facing card. */}
            <Card>
              <Overline>{t('share.og_titre')}</Overline>
              <View style={[styles.shareHero, shareFmt === 'story' && styles.shareHeroStory, shareFmt === 'affiche' && styles.shareHeroAffiche]}>
                <View style={styles.artTileStripe} />
                <Text style={styles.shareHeroGlyph}>{(shareOpp?.name ?? shareCard.productName).slice(0, 1)}</Text>
              </View>
              <View style={styles.shareShopRow}>
                <Text style={styles.shareShopName} numberOfLines={1}>{DEMO_SHARE_IDENTITY.resellerName}</Text>
                <IconCoche size={dimension.iconSizePx.badge} color={shopColour.primary} />
              </View>
              <Text style={styles.cardTitle}>{campShare !== null ? cercleProduit(campShare.pid).name : shareOpp?.name ?? shareCard.productName}</Text>
              <Text style={styles.shareHeroPrice}>
                {tf('share.prix', { amount: formatFcfa(campShare !== null ? cercleProduit(campShare.pid).B + cercleProduit(campShare.pid).marge : shareOpp !== undefined ? viewOf(shareOpp).client : shareCard.priceFcfa) })}
              </Text>
              <Text style={styles.ogValidite}>
                {tf('share.validite', { date: shareCard.priceValidityDate })}
              </Text>
              {/* D5 — C-CE24c: the campaign line, between validity and the badges. */}
              {campShare !== null && (
                <Text style={styles.campagneLigne}>
                  {campShare.K === 1000
                    ? tf('ce.d5_ligne_offerte', { zone: campShare.zone })
                    : tf('ce.d5_ligne', { part: formatFcfa(1000 - campShare.K), zone: campShare.zone })}
                </Text>
              )}
              <View style={styles.ogBadgeRow}>
                <StatusChip tone="ok" label={t('share.livre_sera')} />
              </View>
              <Text style={styles.ogSigned}>{t('share.og_signe')}</Text>
            </Card>

            {/* reseller-only: her net on this card — « jamais visible par la cliente » */}
            {shareOpp !== undefined && (
              <Text style={styles.netCarte}>
                {campShare !== null
                  ? tf('ce.d5_net_carte', { amount: formatFcfa(cercleProduit(campShare.pid).netNormal - campShare.K) })
                  : tf('partager.net_carte', { amount: formatFcfa(viewOf(shareOpp).net) })}
              </Text>
            )}

            {/* the share channels (frame L217–221) — RN Share/Linking, the real slug */}
            <View style={styles.shareActions}>
              <SecondaryButton label={t('partager.copier')} onPress={() => shareVia('copier')} />
              <GhostButton label={t('partager.whatsapp')} onPress={() => shareVia('whatsapp')} />
              <GhostButton label={t('partager.facebook')} onPress={() => shareVia('facebook')} />
              <GhostButton label={t('partager.tiktok')} onPress={() => shareVia('tiktok')} />
            </View>

            {/* the signed PRODUCT link — the one she sends; the live price/stock
                truth. Fictional sandbox link, honestly marked « lien d'essai ». */}
            <Card>
              <View style={styles.linkBox}>
                <Text style={styles.linkText}>{DEMO_SHARE_LINK}</Text>
                <Text style={styles.linkHint}>{t('lien.hint')}</Text>
              </View>
              <Text style={styles.message}>{t('lien.explication')}</Text>
            </Card>

            {/* the QR to her permanent `/v/{slug}` (frame L223–233) — react-native-svg
                draws the vendored encoder's matrix; the slug + code print beside it,
                so the no-scan fallback still works. */}
            <Card>
              <Overline>{t('share.qr_titre')}</Overline>
              <Text style={styles.message}>{t('share.qr_blurb')}</Text>
              <View style={styles.qrFrame}>
                <QrCode url={DEMO_QR_URL} />
              </View>
              <View style={styles.qrCaption}>
                <Text style={styles.linkText}>{DEMO_SHARE_IDENTITY.identityLinkSuffix}</Text>
                <Text style={styles.qrLegende}>{t('share.qr_legende')}</Text>
                <Text style={styles.codeStrong}>{DEMO_SHARE_IDENTITY.shortCode}</Text>
                <Text style={styles.qrRepli}>
                  {tf('share.qr_repli', { code: DEMO_SHARE_IDENTITY.shortCode })}
                </Text>
              </View>
            </Card>

            <PrimaryButton label={t('lien.action')} onPress={() => go('gains')} />
          </ScrollView>
        )}

        {screen === 'gains' && (
          <ScrollView style={styles.screenScroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Title (Bricolage 800/28, in-content) + net/Mobile-Money subtitle
                (frame L644–645); the header chrome shows the brand (hub). */}
            <Text style={styles.screenTitle}>{t('gains.title')}</Text>
            <Text style={styles.oppSub}>{t('gains.sous_titre')}</Text>
            {/* Accent pending hero — the net « en majesté » on magenta (D4a:
                composed 38+17, §7 count-up in PendingHero, reduced-motion safe). */}
            {/* D4a — « En attente (net) » (compose 38+17, count-up §7) + Payé semaine. */}
            <Card style={styles.gainsHeroCard}>
              <PendingHero label={t('ce.gains_attente_label')} amount={enAttenteNet()} />
              <Text style={styles.gainsPayeLine}>{tf('ce.gains_paye_semaine', { amount: formatFcfa(payeSemaine()) })}</Text>
            </Card>
            {/* D4b — per-sale detail cards; −Cercle line only on campaign orders. */}
            <Overline>{t('ce.gains_detail_caps')}</Overline>
            {gainsCards().map((c) => (
              <GainsSaleCard key={c.code} card={c} />
            ))}
            <Text style={styles.noteLine}>{t('gains.suite')}</Text>
            <SecondaryButton label={t('opportunites.title')} onPress={() => go('opportunites')} />
          </ScrollView>
        )}

        {screen === 'ventes' && (
          ventesRows.length === 0 ? (
            <ScrollView style={styles.screenScroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
              <EmptyState
                glyph={<IconVitrine size={dimension.iconSizePx.emptyState} color={sharedColour.sub} />}
                title={t('ventes.vide_titre')}
                hint={t('ventes.vide_hint')}
              />
              <PrimaryButton label={t('ventes.vide_action')} onPress={() => go('vitrine')} />
            </ScrollView>
          ) : (
            <FlatList
                style={styles.screenScroll}
                data={ventesRows}
                keyExtractor={(r) => r.id}
                initialNumToRender={6}
                windowSize={5}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollList}
                renderItem={({ item }) => (
                  // Frame L294–303 — the sale row on the duotone art-tile; problem
                  // rows carry the danger border (frame L281, « les problèmes
                  // d'abord »). Net stays on the row (net-first, ventes-row gate).
                  <View style={styles.venteRowGroup}>
                    <Pressable
                      style={({ pressed }) => [styles.oppRow, item.status === 'probleme' && styles.rowProbleme, pressed && styles.pressed]}
                      onPress={() => go('vente_detail')}
                      accessibilityRole="button"
                    >
                      <View style={styles.artTile}>
                        <View style={styles.artTileStripe} />
                        <Text style={styles.artTileGlyph}>{item.clientFirstName.slice(0, 1)}</Text>
                      </View>
                      <View style={styles.homeSaleBody}>
                        <Text style={styles.homeSaleTitle} numberOfLines={1}>{item.clientFirstName}</Text>
                        <Text style={styles.homeSaleSub} numberOfLines={1}>{item.productName}</Text>
                        <Text style={styles.oppNet}>{tf('ventes.net_ligne', { amount: formatFcfa(item.netFcfa) })}</Text>
                      </View>
                      <StatusChip tone={chipTone(item)} label={t(item.statusKey)} />
                    </Pressable>
                    {item.status === 'probleme' && (
                      <Card style={styles.problemeEncart}>
                        <Text style={styles.message}>{t('ventes.probleme_encart')}</Text>
                        <Text style={styles.noteLine}>{t('ventes.probleme_rien')}</Text>
                        <SecondaryButton label={t('ventes.probleme_action')} onPress={() => go('vente_detail')} />
                      </Card>
                    )}
                  </View>
                )}
                ListFooterComponent={<Text style={styles.noteLine}>{t('ventes.relais')}</Text>}
              />
          )
        )}

        {screen === 'vente_detail' && (
          <ScrollView style={styles.screenScroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Product card (frame L316–322) — the duotone art-tile, what was
                sold and to whom (her client's first name; no zone in the model,
                no seller ever). A static info card, not a control. */}
            <View style={styles.oppRow}>
              <View style={styles.artTile}>
                <View style={styles.artTileStripe} />
                <Text style={styles.artTileGlyph}>{saleDetail.productName.slice(0, 1)}</Text>
              </View>
              <View style={styles.homeSaleBody}>
                <Text style={styles.homeSaleTitle} numberOfLines={1}>{saleDetail.productName}</Text>
                <Text style={styles.homeSaleSub} numberOfLines={1}>{saleDetail.clientFirstName}</Text>
              </View>
            </View>
            {/* NET FIRST, always — the net before SON prix; the commission
                exists nowhere; only her client's first name (relais). The frame's
                gross « Gain brut » + « Frais Ma Boutique » breakdown is barred
                (Law #1 / #10) — the HeroLedger net hero is the compliant card. */}
            <Card style={styles.netCard}>
              {/* the hero ledger (signature module): the locked net as the hero,
                  its « réglé » reassurance as the ledger whisper below. D3: on a
                  campaign order the hero IS net − camp (1 400) and the derivation
                  renders UNDER it — NET-FIRST (SP-I04/I12) outranks the planche's
                  top-to-bottom ledger order (flagged divergence, journaled). */}
              <HeroLedger
                label={t('vente.net_label')}
                amount={formatFcfa(saleDetail.netPayeFcfa)}
                ledger={t('vente.net_regle')}
              />
              {saleDetail.campFcfa > 0 && (
                <View style={styles.campLedger}>
                  <View style={styles.campLedgerRow}>
                    <Text style={styles.campLedgerLabel}>{t('vente.brut_label')}</Text>
                    <Text style={styles.campLedgerVal}>{formatFcfa(saleDetail.brutFcfa)}</Text>
                  </View>
                  <View style={styles.campLedgerRow}>
                    <Text style={styles.campLedgerLabel}>{t('vente.frais_label')}</Text>
                    <Text style={styles.campLedgerVal}>{`−${formatFcfa(saleDetail.fraisFcfa)}`}</Text>
                  </View>
                  <View style={styles.campLedgerRow}>
                    <Text style={styles.campLedgerLabel}>{t('vente.camp_label')}</Text>
                    <Text style={styles.campLedgerVal}>{`−${formatFcfa(saleDetail.campFcfa)}`}</Text>
                  </View>
                </View>
              )}
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
          </ScrollView>
        )}

        {/* VITRINE PUBLIQUE — APERÇU CLIENTE (frame L714–740): read-only, the
            cliente's exact view. Client price ONLY — never net, never marge, never a
            vendor. The « Lecture seule » pill + the ink banner state the boundary. */}
        {screen === 'personnaliser' && (
          <CustomizeStack onClose={back} onToast={setToast} />
        )}
        {screen === 'pubvitrine' && (
          <FlatList
            style={styles.screenScroll}
            data={vitrineOpps}
            keyExtractor={(o) => o.id}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            initialNumToRender={6}
            windowSize={5}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollList}
            ListHeaderComponent={
              <View style={styles.pubHead}>
                <View style={styles.pubPillRow}>
                  <StatusChip tone="muted" label={t('pubvitrine.lecture')} />
                </View>
                <View style={styles.pubIdentity}>
                  <View style={styles.pubMonogram}>
                    <Text style={styles.pubMonogramText}>{DEMO_SHARE_IDENTITY.resellerName.slice(0, 1)}</Text>
                  </View>
                  <View style={styles.homeSubRow}>
                    <Text style={styles.pubShopName}>{DEMO_SHARE_IDENTITY.resellerName}</Text>
                    <IconCoche size={dimension.iconSizePx.badge} color={shopColour.primary} />
                  </View>
                  <Text style={styles.pubZone}>{t('pubvitrine.zone')}</Text>
                </View>
              </View>
            }
            renderItem={({ item }) => (
              // the cliente's tile — client price ONLY (at her markup), neutral crown
              <DuotoneTile glyph={item.name.slice(0, 1)} crownTone="neutral" style={styles.gridTile}>
                <Text style={styles.tileName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.tilePrice}>{formatFcfa(viewOf(item).client)}</Text>
              </DuotoneTile>
            )}
            ListEmptyComponent={
              <EmptyState
                glyph={<IconVitrine size={dimension.iconSizePx.emptyState} color={sharedColour.sub} />}
                title={t('vitrine.vide')}
              />
            }
            ListFooterComponent={
              <View style={styles.inkBanner}>
                <Text style={styles.inkBannerText}>{t('pubvitrine.ink_banner')}</Text>
              </View>
            }
          />
        )}
        {/* ── LE CERCLE (SP9, scoped override — UI + certified mock) ── */}
        {screen === 'cercle' && (
          <CercleHub
            ctl={cercle}
            onToast={setToast}
            go={(s2) => { if (s2 === 'lien') setShareCampBadge(true); go(s2); }}
          />
        )}
        {screen === 'campnew' && (
          <CampWizard
            ctl={cercle}
            onClose={back}
            onToast={setToast}
            onLaunched={() => { cercle.resetDraft(); setShareCampBadge(true); go('lien'); }}
          />
        )}
        {screen === 'campaign' && (
          <CampaignActive ctl={cercle} onBack={back} onPack={() => { setShareCampBadge(true); go('lien'); }} />
        )}
        {screen === 'funding' && <CampaignFunding ctl={cercle} onBack={back} onToast={setToast} />}
        {screen === 'reput' && <CercleReputation onBack={back} />}
        {screen === 'membres' && <CercleMembres onBack={back} />}
      </View>
      </ScreenTransition>

      {/* the toast — the toggle/add confirmations (auto-clears); pointerEvents none
          so it never eats a tap. Honest, brief, above the chrome. */}
      {toast !== null && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {/* Note vocale — the per-product record sheet (opened from a card mic). */}
      <VoiceNoteSheet product={voiceSheet} ctl={voice} onClose={() => setVoiceSheet(null)} />

      <View style={styles.footer}>
        <View style={styles.footerInfo}>
          <Text style={styles.footerHint}>{t('demo.donnees')}</Text>
          {/* the build stamp — the real OTA update id (« dev » locally): honest
              provenance so a device pass can name the exact bundle it ran. */}
          <Text style={styles.footerBuild}>{tf('demo.build', { id: buildStamp.slice(0, 8) })}</Text>
        </View>
        <Pressable style={styles.resetAction} onPress={reset}>
          <Text style={styles.resetActionText}>{t('nav.recommencer')}</Text>
        </Pressable>
      </View>

      {HUBS.includes(screen) && (
        <TabBar
          items={[
            { key: 'accueil', icon: <IconAccueil size={dimension.iconSizePx.tab} color={navColor(screen === 'accueil')} />, label: t('nav.tab_accueil'), active: screen === 'accueil', onPress: () => toHub('accueil') },
            { key: 'opportunites', icon: <IconProduits size={dimension.iconSizePx.tab} color={navColor(screen === 'opportunites')} />, label: t('nav.tab_opportunites'), active: screen === 'opportunites', onPress: () => toHub('opportunites') },
            { key: 'vitrine', icon: <IconVitrine size={dimension.iconSizePx.tab} color={navColor(screen === 'vitrine')} />, label: t('nav.tab_vitrine'), active: screen === 'vitrine', onPress: () => toHub('vitrine') },
            { key: 'cercle', icon: <IconCercleDeux size={dimension.iconSizePx.tab} color={navColor(screen === 'cercle')} />, label: t('nav.tab_cercle'), active: screen === 'cercle', onPress: () => toHub('cercle') },
            { key: 'gains', icon: <IconGains size={dimension.iconSizePx.tab} color={navColor(screen === 'gains')} />, label: t('nav.tab_gains'), active: screen === 'gains', onPress: () => toHub('gains') },
          ]}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sharedColour.paper },
  content: { flex: 1 },
  // FULL-BLEED SCROLL (founder ruling — the « small window » defect): the screen
  // IS the scroll surface (flex:1, edge-to-edge under the chrome); the padding
  // lives in the scroll CONTENT and footers scroll with it. No nested scroll
  // container, no fixed sub-region.
  screenScroll: { flex: 1 },
  scrollBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md },
  scrollList: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.sm },
  // In-scroll header/footer wrappers (list screens) — spacing lives with the content.
  scrollHead: { gap: spacing.md, paddingBottom: spacing.sm },
  listFooter: { gap: spacing.md, paddingTop: spacing.sm },
  statGrid: { flexDirection: 'row', gap: spacing.md },
  statCard: { flex: 1 },
  statValue: {
    color: sharedColour.ink,
    fontFamily: DISPLAY_FAMILY,
    fontSize: t2.scale.screen.size,
    fontWeight: w(t2.scale.screen.wght),
    fontVariant: ['tabular-nums'],
  },
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
  // « Les problèmes d'abord » (frame L281) — the danger border on a problem row.
  rowProbleme: { borderColor: sharedColour.dangerBorder, borderWidth: interaction.hairline.strong },
  astuceCard: { backgroundColor: shopColour.soft, borderRadius: radius.tile, padding: spacing.lg },
  astuceText: { color: shopColour.deep, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  // ── PARTAGER frame (planche L193–236) — the hero share-card ──
  // PARTAGER art heights per format (planche §4 L74): card 150 · story 250 · affiche 190.
  shareHero: {
    height: touch.minTargetPx * 3 + spacing.xs,
    borderRadius: rmax(radius.art),
    backgroundColor: shopColour.soft,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareHeroStory: { height: touch.minTargetPx * 5 + spacing.sm },
  shareHeroAffiche: { height: touch.minTargetPx * 4 },
  shareHeroGlyph: { color: shopColour.deep, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.heroMoney.size), fontWeight: w(t2.scale.heroMoney.wght) },
  shareShopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  shareShopName: { color: sharedColour.sub, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.caps.size), fontWeight: w(t2.scale.caps.wght), textTransform: 'uppercase' },
  shareHeroPrice: { color: shopColour.deep, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.heroMoney.size), fontWeight: w(t2.scale.heroMoney.wght), fontVariant: ['tabular-nums'] },
  // ── VITRINE frame (planche L239–267) — in-content header (title + name + vérifié) ──
  vitrineHead: { gap: spacing.xs },
  // ── GAINS frame (planche L641–677) — the accent pending hero (magenta card) ──
  gainsHeroCard: { backgroundColor: shopColour.primary, borderColor: shopColour.primary },
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
  // ── FICHE frame (planche L140–191) ──
  ficheTierRow: { flexDirection: 'row' },
  ficheHero: {
    height: touch.minTargetPx * 3 + spacing.xl,
    borderRadius: rmax(radius.art),
    backgroundColor: shopColour.soft,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ficheHeroGlyph: { color: shopColour.deep, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.heroMoney.size), fontWeight: w(t2.scale.heroMoney.wght) },
  ficheTitle: { color: sharedColour.ink, fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.cardMoney.size, fontWeight: w(t2.scale.screen.wght) },
  ficheIdentity: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  margeCard: { gap: spacing.xs },
  margeHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  margeAmount: { color: shopColour.deep, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.view.size), fontWeight: w(t2.scale.cardMoney.wght), fontVariant: ['tabular-nums'] },
  margeDivider: { height: interaction.hairline.medium, backgroundColor: sharedColour.hairlineStrong, marginVertical: spacing.xs },
  margeLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  margeLineLabel: { color: sharedColour.ink, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  margeLineVal: { color: sharedColour.ink, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.body.size), fontWeight: w(t2.scale.row.wght), fontVariant: ['tabular-nums'] },
  margeLineMuted: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  margeLineMutedVal: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size), fontVariant: ['tabular-nums'] },
  margeNetRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: spacing.xs },
  margeNetLabel: { color: sharedColour.ink, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.row.size), fontWeight: w(t2.scale.row.wght) },
  margeNetVal: { color: shopColour.deep, fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.cardMoney.size, fontWeight: w(t2.scale.cardMoney.wght), fontVariant: ['tabular-nums'] },
  margeClientLabel: { color: sharedColour.ink, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  margeClientVal: { color: sharedColour.ink, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.view.size), fontWeight: w(t2.scale.cardMoney.wght), fontVariant: ['tabular-nums'] },
  ficheChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // ── MA VITRINE frame (planche L239–267) — header row + toggle + tile net ──
  vitrineHeadRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  vitrineIconBtn: {
    width: spacing.xxl + spacing.md,
    height: spacing.xxl + spacing.md,
    borderRadius: radius.pill,
    borderWidth: interaction.hairline.thin,
    borderColor: sharedColour.hairlineStrong,
    backgroundColor: sharedColour.card,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  vitrineToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: spacing.xxl + spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: interaction.hairline.thin,
    borderColor: sharedColour.hairlineStrong,
    backgroundColor: sharedColour.card,
    flexShrink: 0,
  },
  toggleDot: { width: spacing.sm, height: spacing.sm, borderRadius: radius.pill },
  toggleDotPublic: { backgroundColor: sharedColour.okFg },
  toggleDotPrivate: { backgroundColor: shopColour.gold },
  toggleLabel: { color: sharedColour.ink, fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.pill.size, fontWeight: w(t2.scale.pill.wght) },
  tilePriceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.xs },
  tileNet: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: t2.scale.pill.size, fontVariant: ['tabular-nums'], flexShrink: 0 },
  // ── PARTAGER frame (planche L193–236) — select-to-feature + share channels ──
  partagerHead: { gap: spacing.xs },
  netCarte: {
    color: shopColour.deep,
    fontFamily: TEXT_FAMILY_BOLD,
    fontSize: rmax(t2.scale.body.size),
    fontWeight: w(t2.scale.row.wght),
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  shareActions: { gap: spacing.sm },
  // ── VITRINE PUBLIQUE frame (planche L714–740) — the cliente's read-only view ──
  pubHead: { gap: spacing.md, paddingBottom: spacing.sm },
  pubPillRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  pubIdentity: { alignItems: 'center', gap: spacing.xs },
  pubMonogram: {
    width: touch.minTargetPx + spacing.sm,
    height: touch.minTargetPx + spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: shopColour.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pubMonogramText: { color: shopColour.onPrimary, fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.cardMoney.size, fontWeight: w(t2.scale.cardMoney.wght) },
  pubShopName: { color: sharedColour.ink, fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.cardMoney.size, fontWeight: w(t2.scale.screen.wght) },
  pubZone: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size), textAlign: 'center' },
  inkBanner: { backgroundColor: sharedColour.ink, borderRadius: radius.tile, padding: spacing.lg, marginTop: spacing.md },
  inkBannerText: { color: sharedColour.paper, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  // ── the toast + the build stamp ──
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: touch.minTargetPx + spacing.lg,
    backgroundColor: sharedColour.ink,
    borderRadius: radius.tile,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  toastText: { color: sharedColour.paper, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.body.size), fontWeight: w(t2.scale.row.wght), textAlign: 'center' },
  footerInfo: { flexShrink: 1 },
  footerBuild: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: t2.scale.pill.size, fontVariant: ['tabular-nums'] },
  // ── FICHE money line (« Gagnez ≈ {net} net », §4 L70/L72) — net-forward, deep ──
  ficheGagnez: {
    color: shopColour.deep,
    fontFamily: DISPLAY_FAMILY,
    fontSize: t2.scale.cardMoney.size,
    fontWeight: w(t2.scale.cardMoney.wght),
    fontVariant: ['tabular-nums'],
  },
  // ── MA VITRINE per-product card (art 110 + live net + slider + share) ──
  vitrineCard: { gap: spacing.sm },
  campLedger: { marginTop: spacing.md, borderTopWidth: interaction.hairline.thin, borderTopColor: sharedColour.hairlineStrong, paddingTop: spacing.sm },
  campLedgerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs, gap: spacing.sm },
  campLedgerLabel: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  campLedgerVal: { color: sharedColour.ink, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.body.size), fontVariant: ['tabular-nums'] },
  gainsPayeLine: { marginTop: spacing.sm, color: shopColour.onPrimary, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size), fontVariant: ['tabular-nums'] },
  campagneLigne: { marginTop: spacing.sm, color: shopColour.deep, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.body.size) },
  vitrineVoiceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    minHeight: touch.minTargetPx, alignSelf: 'flex-start', paddingVertical: spacing.xs,
  },
  vitrineVoiceLabel: { color: shopColour.primary, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.body.size) },
  vitrineCardArt: {
    height: touch.minTargetPx * 2 + spacing.md,
    borderRadius: rmax(radius.art),
    backgroundColor: shopColour.soft,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vitrineCardGlyph: { color: shopColour.deep, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.heroMoney.size), fontWeight: w(t2.scale.heroMoney.wght) },
  // net-first: her gain is the hero figure on her own vitrine (deep, heroMoney).
  vitrineNetHero: {
    color: shopColour.deep,
    fontFamily: DISPLAY_FAMILY,
    fontSize: rmax(t2.scale.heroMoney.size),
    fontWeight: w(t2.scale.heroMoney.wght),
    fontVariant: ['tabular-nums'],
  },
  // the cliente price — the secondary context line under the net hero.
  vitrineClientLine: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size), fontVariant: ['tabular-nums'] },
  // ── PARTAGER format segments (planche piste r14 p4; active = white card) ──
  fmtSegments: { flexDirection: 'row', gap: spacing.xs, backgroundColor: sharedColour.dim, borderRadius: radius.tile, padding: spacing.xs },
  fmtSeg: { flex: 1, minHeight: touch.minTargetPx, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  fmtSegOn: { backgroundColor: sharedColour.card },
  fmtSegText: { color: sharedColour.sub, fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.pill.size, fontWeight: w(t2.scale.pill.wght) },
  fmtSegTextOn: { color: sharedColour.ink },
});
