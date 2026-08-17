import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Image, KeyboardAvoidingView, Linking, Platform, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View, findNodeHandle } from 'react-native';
import { File } from 'expo-file-system';
import { sharedColour, shopColour, type as t2, radius } from '@platform/ui-tokens';
import { spacing, touch, interaction, dimension } from '@platform/ui-tokens/legacy';
import { DISPLAY_FAMILY, TEXT_FAMILY, TEXT_FAMILY_BOLD } from './src/ui/faso-fonts';
import { IconAccueil, IconProduits, IconGains, IconVitrine, IconCoche, IconVoix } from './src/ui/icons';
import { formatFcfa } from './src/earnings';
import { IS_PREVIEW } from './src/preview';
import { t, tf } from './src/i18n';
import { JOURNEY, START, type Screen } from './src/journey';
import { frenchDate } from './src/share/hub';
import { QrCode } from './src/qr/QrCode';
import { afficheQrUrl, boutiqueShareUrl, signedProductShareUrl } from './src/qr/identity';
import { FONTS_TO_LOAD } from './src/ui/fonts-load';
import { foldVitrine, type VitrineEvent } from './src/vitrine/collection';
import { marginBreakdown, markupCap, defaultMarkup, snapMarkup } from './src/vitrine/margin';
import { PhotoGallery } from './src/ui/photo-gallery';
import { ProductClip } from './src/ui/product-clip';
import { vignetteSaufHero } from './src/vitrine/vignette';
import { cadreRatio, CADRE_DEFAUT } from './src/ui/cadre';
import { HeroLedger, DuotoneTile } from './src/ui/signature';
import { CustomizeStack } from './src/vitrine/customize/screens';
import { resolveStorefrontService, deriveShortCode, saveRefusalToastKey, type StorefrontIdentityPatch } from './src/vitrine/service';
import type { Storefront } from './src/vitrine/customize/storefront';
import { loadOrMintIdentity } from './src/identity/store';
import { resolveOfferSource, type Offer, type OfferFeed } from './src/vitrine/offers';
import type { ResellerIdentity } from './src/identity/mint';
import { expoIdentityStore, expoRandomBytes } from './src/identity/expoStore';
import { useVoiceNotes, VoiceCardRow, VoiceNoteSheet, voiceCardLabel, type VoiceRemover, type VoiceUploader } from './src/vitrine/customize/voice-sheet';
import { noteOf } from './src/vitrine/customize/voice';
import {
  useCercle, CercleHub, CampWizard, CampaignActive, CampaignFunding, CercleReputation,
  CercleMembres, IconCercleDeux, PendingHero, CercleAccueilCard,
} from './src/cercle/screens';
import { produit as cercleProduit, partagerBadge } from './src/cercle/model';
import { useVentesReelles } from './src/sales/use-ventes-reelles';
import { expoAccessCodeStore } from './src/sales/code-store';
import { decideAcces, gateArme } from './src/access/gate';
import {
  compteStoreSur,
  resolveCompteService,
  type CompteLocal,
  type CompteServicePort,
} from './src/access/compte-service';
import { identityFromDigits } from './src/identity/mint';
import { ecranAccueil } from './src/sales/accueil-model';
import {
  demoDetail,
  type SaleDetail,
  type TimelineStep,
} from './src/sales/ventes';
import {
  createDemoWorld,
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

/* ACCUEIL-HONESTY-1 — `chipTone(row: SaleRow)` lived here and mapped a DEMO
 * sale's status onto a chip colour. Its only caller was the accueil preview,
 * which now paints real `VenteLigne`s in « ink » exactly as « Mes ventes »
 * does, so the mapping had no input left. Deleted with its caller rather than
 * left behind for a future screen to rediscover and trust. */

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

// BANDEAUX-RETIRÉS (2026-08-14) — SEAM-ERROR-VISIBILITY-1 and SEAM-PRESENCE-1
// stood here. They surfaced the resolved storefront base, the write key's
// PRESENCE and the feed's true state in the bottom strip, because unconfigured,
// 401, unreachable and genuinely-empty all render as ONE identical card by
// design. The founder ordered the strip removed; those three diagnostics went
// with it, and that loss is recorded in JOURNAL.md rather than left implicit.

/**
 * MARGE-EXACTE (founder, 2026-08-15) — SHE TYPES THE FIGURE, AND IT STAYS.
 *
 * « remove the slide where resellers use to add their margin and just let it be
 * typable, make sure i can type any number without rounding it up, cause right
 * now if i type 750, the system rounds it to 800 ».
 *
 * THE ROUNDING WAS A MONEY BUG IN A UI COSTUME. This committed through
 * `snapMarkup(parsed, cap)`, whose DEFAULT step is 100 — so 750 became 800 on
 * blur, silently, and her cliente was quoted a price she never chose. The step
 * was never canon: it came from the planche's `<input step=100>`, and
 * `signPrice` in storefront-service — the thing that actually BOUNDS a published
 * markup — accepts any safe non-negative integer up to the cap and knows nothing
 * of hundreds. So the step existed only to match a slider that no longer exists.
 *
 * AND THE CLAMP IS STILL THE SHARED RULE, not a local one. `snapMarkup` takes
 * its step as a parameter; passing 1 rounds to the franc — which is identity on
 * an integer — and keeps the SAME [0, cap] clamp the money tests pin. A local
 * `Math.min(cap, …)` here would be a second copy of a pricing bound, which is
 * exactly what `vitrine/margin.ts` exists to prevent.
 *
 * While she types, nothing commits: committing per keystroke would fight the
 * digits under her thumb. A cleared or unparseable field commits nothing and
 * falls back to the last real value on blur — never NaN, never a silent zero.
 */
function MarkupControl({
  value,
  cap,
  onChange,
  onFocusField,
}: {
  value: number;
  cap: number;
  onChange: (m: number) => void;
  /** CLAVIER-MARGE — the caller owns the scroll surface and is the only thing
   *  that can lift this card clear of the keypad. It gets the field's native
   *  handle so it can scroll to THIS row rather than to the end of the list. */
  onFocusField?: ((handle: number | null) => void) | undefined;
}) {
  const [text, setText] = useState<string | null>(null); // null = not editing; show the value
  const champ = useRef<TextInput>(null);
  /**
   * COMMIT AS SHE TYPES, and this is a correction rather than a preference.
   *
   * It used to commit ONLY on blur/submit, and `keyboardShouldPersistTaps`
   * ("handled") is precisely what stops her first tap from dismissing the
   * keypad — which is what used to blur the field. So the button began firing
   * while the field was still first responder, and the app published markup 0:
   * she types 750, taps once, her cliente is quoted the base price. On iOS a
   * `number-pad` has NO return key, so `onSubmitEditing` could not save it.
   *
   * Committing live is safe NOW in a way it was not before: MARGE-EXACTE took
   * the step-100 snap out, so nothing rewrites her digits under her thumb. The
   * only transformation left is the clamp, which bites at the ceiling alone.
   * `text` is deliberately NOT cleared here — it holds exactly what she typed
   * until she leaves the field, so a leading zero or a paste never jumps.
   */
  const pousser = (raw: string) => {
    const parsed = Number.parseInt(raw.replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(parsed)) onChange(snapMarkup(parsed, cap, 1));
  };
  const commit = (raw: string) => {
    setText(null); // leave editing: the field falls back to the canonical value
    pousser(raw);
  };
  return (
    <View>
      <View style={styles.margeHeadRow}>
        <Overline>{t('fiche.marge_titre')}</Overline>
        <TextInput
          ref={champ}
          style={styles.margeInput}
          value={text ?? String(value)}
          onChangeText={(v) => {
            setText(v);
            pousser(v);
          }}
          onFocus={() => onFocusField?.(findNodeHandle(champ.current))}
          onBlur={() => commit(text ?? String(value))}
          onSubmitEditing={() => commit(text ?? String(value))}
          keyboardType="number-pad"
          accessibilityLabel={t('fiche.marge_titre')}
        />
      </View>
      <Text style={styles.noteLine}>{tf('fiche.plafond', { amount: formatFcfa(cap) })}</Text>
    </View>
  );
}

/** RF-1c — module scope on purpose: a store recreated each render would
 *  restart the hook's mount effect on every keystroke. */
const accessCodeStore = expoAccessCodeStore();
/** RESELLER-ACCOUNTS-1d — what the device knows about HER account (id, name,
 *  last-known state). Durable beside the bearer; never a credential. */
const compteStore = compteStoreSur(expoAccessCodeStore('reseller-compte.v1.txt'));

export default function App() {
  // COLD-START LAW: load the Faso Premium faces asynchronously and DO NOT gate
  // first paint on them — the metrics-close system fallback renders immediately,
  // and the faces swap in when ready (expo-font re-renders on load). First paint
  // never waits; a face that never resolves simply stays in the fallback.
  useFonts(FONTS_TO_LOAD);
  const [world, setWorld] = useState<DemoWorld>(() => createDemoWorld());
  const [stack, setStack] = useState<Screen[]>([START]);
  const screen = stack[stack.length - 1] ?? START;
  /**
   * THE RE-READ TRIGGERS, NAMED (not inlined into the dep arrays below).
   *
   * Two reasons, and the second is not style. First, a dep array reads better
   * as « re-read when she opens Ma Vitrine » than as a comparison. Second, and
   * concretely: `test/ui-kit.test.ts` slices this file per screen to pin the
   * net-first money law, and it anchors on the RENDER blocks. Naming the
   * triggers keeps the comparison out of the dep arrays, and the pin's anchors
   * were tightened to the render form in the same slice — a money pin that
   * quietly stops looking is worse than one that fails.
   */
  const surOpportunites = screen === 'opportunites';
  const surVitrine = screen === 'vitrine';
  const surPersonnaliser = screen === 'personnaliser';

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
  // RESELLER-UX-2 (founder walk, item 2) — the untouched-slider CTA gate is GONE
  // and so is the `markupTouched` state that carried it. The gate guarded against
  // signing the old defaulted 1 500 she never chose; with DEFAULT_MARKUP now 0
  // (founder override), the un-acted default signs the LOWEST cliente price and
  // her net is what the commission alone pays — publishing on arrival is a safe
  // deliberate act, not a trap, so the button lives the moment the seam is wired.
  const [publishing, setPublishing] = useState(false);
  /**
   * PAS-DE-BOUTIQUE (verifier MAJOR) — the service said « no boutique », and
   * that fact must OUTLIVE A TOAST. The recovery sentence first shipped as a
   * toast, which auto-clears in 2.6 s: the one sentence naming her next step,
   * for the exact founder-reported bug, flashed and was gone mid-read. The
   * state is identity-level, not per-product — no boutique means no adds at
   * all — so one flag serves every fiche. It renders as the persistent note
   * under the CTA (the `cta_non_relie` pattern: why this button cannot work,
   * stated where the button is) and clears the moment a publish succeeds.
   */
  const [sansBoutique, setSansBoutique] = useState(false);
  // RESELLER-UX-2 (items 2 + 3) — the photo gallery: which product's photos are
  // open full-screen. null = closed (the voice-sheet idiom).
  const [gallery, setGallery] = useState<{ name: string; refs: readonly string[]; startAt?: number } | null>(null);
  // RESELLER-UX-3 — which capture the fiche héro shows (the reference's
  // thumbnail-switches-hero behaviour). Reset to 0 at every fiche open.
  const [ficheHeroIdx, setFicheHeroIdx] = useState(0);
  /**
   * CADRE (founder order 2026-08-03: « Drop the square rule ») — each product's
   * measured photo shape, keyed by productVersionId, filled in as photographs
   * load. A pid absent here has not been measured yet (or its photo failed), and
   * `cadreRatio`'s neutral square stands in — so the grid renders correctly on
   * the very first frame and simply grows into its true proportions.
   *
   * WHY STATE AND NOT A LAYOUT MEASUREMENT: the shape must come from the
   * PHOTOGRAPH, not from the space the card happens to occupy. Measuring the
   * rendered view would read back whatever the frame already imposed — the
   * square — and dutifully confirm it forever.
   */
  const [cadres, setCadres] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  // Notes vocales — ONE controller (real capture, expo-audio) hosted here, so the
  // mic on each Ma Vitrine product card opens a record SHEET for THAT product
  // (founder Option A — recording lives with the product, not behind « Aa »).
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
  // Waypoint reset, never an edge: each hub state is already reachable
  // from START along declared edges; the tab jumps to that exact state.
  const toHub = useCallback((hub: Screen) => {
    setStack(hub === START ? [START] : [START, hub]);
  }, []);

  // RESELLER-STOREFRONT-WRITE-1 — the app's FIRST real outbound calls. The seam
  // resolves to the live service iff EXPO_PUBLIC_STOREFRONT_{BASE,WRITE_KEY} are
  // inlined; otherwise **null** (RESELLER-SEAM-HONESTY-1), never a demo adapter that
  // cannot fail. A re-tap is idempotent (same commandId/id), never a second shop —
  // and the identity behind it is now device-stored rather than per-session.
  const service = useMemo(() => resolveStorefrontService(), []);
  // BROWSE-SUPPLY-1 — Opportunités now reads boutik's LIVE offers through this
  // Worker. The seven « (démo) » products are GONE, not filtered and not a fallback:
  // an unconfigured or failing wire shows the honest empty state, because a demo
  // label on a browse surface is something she would learn to ignore rather than
  // notice. `undefined` = still loading.
  const offerSource = useMemo(() => resolveOfferSource(), []);
  const [feed, setFeed] = useState<OfferFeed | undefined>(undefined);
  useEffect(() => {
    let live = true;
    if (offerSource === null) {
      setFeed({ status: 'unconfigured' });
      return;
    }
    // ON ENTERING, NOT ON LEAVING (verifier MAJOR). A boolean dependency changes
    // in BOTH directions, so the first cut also re-read when she walked away —
    // roughly double the requests this comment promised, on a metered
    // connection. The first read still happens whatever screen she starts on
    // (`feed === undefined`); after that, only being on one of the two screens
    // asks again.
    if (feed !== undefined && !surOpportunites && !surVitrine) return;
    void offerSource.list().then((f) => {
      if (live) setFeed(f);
    });
    return () => {
      live = false;
    };
    /**
     * ═══ OPPORTUNITÉS RE-READS (founder, 2026-08-11) ═══
     *
     * « When products are deleted from another supplier's listing, these
     * products are still present in opportunité on shop+. »
     *
     * `offerSource` is a `useMemo` with no deps, so this used to fire EXACTLY
     * ONCE per app process. A product deleted in Boutik+ therefore stayed on her
     * browse screen — and on Ma Vitrine, which filters the same list — until she
     * killed and reopened the app, which on a phone can be days. (Boutik+'s own
     * delete is sound: driven against its real Worker, the deleted offer leaves
     * the very collection this list reads, in the same request.)
     *
     * Opening the screen is the natural, deliberate refresh — the same idiom
     * `liveStorefront` already uses for Personnaliser, and it costs one request
     * per visit rather than a poll on a metered connection.
     *
     * The read is ADDITIVE, never a blanking one: `setFeed` replaces the list
     * only when an answer arrives, so a failed refresh leaves what she was
     * already reading on screen instead of emptying her shop over a hiccup.
     */
  }, [offerSource, surOpportunites, surVitrine]);
  const offers: readonly Offer[] = feed?.status === 'ok' ? feed.offers : [];
  // RESELLER-IDENTITY-1 — the identity is now DEVICE-STORED and minted ONCE from the
  // OS CSPRNG, replacing a `Math.random` mint that was stable only per SESSION. That
  // regenerated `resellerId` on every restart and every preview republish, so the
  // founder was a DIFFERENT RESELLER each session and his slug moved every time
  // (aichomod-8291 → chezaichamod-4911). `undefined` = still loading; `null` = the
  // mint or the persist FAILED, which is an honest state and never a fabricated id.
  const [identity, setIdentity] = useState<ResellerIdentity | null | undefined>(undefined);
  /**
   * RESELLER-UX-1 items 5+6 — HER LIVE SHOP, READ BACK, NEVER COMPUTED. `undefined`
   * = not yet asked; `null` = asked, none exists. The slug here comes from the
   * service's own list (or the create response), which is the toast law applied to
   * navigation and sharing: an address nobody stored must never be printed, opened,
   * or SHARED. Sharing was the sharpest instance — a live product shared under the
   * demo slug opened a stranger's demo shop, which is exactly what the founder saw.
   */
  const [liveShop, setLiveShop] = useState<{ slug: string } | null | undefined>(undefined);
  useEffect(() => {
    if (service === null || identity === null || identity === undefined) return;
    // BADGE-FIABLE (founder, 2026-08-17) — `undefined` is « never answered »:
    // the read failed or has not landed. This effect used to run ONCE per
    // session, so one patchy-2G failure at launch hid the vérifié mark until
    // restart, for a genuinely live shop. It now re-asks on every navigation
    // until an answer exists; an ANSWER (row or null) is stable — publish and
    // the create-response adoption move it from there.
    if (liveShop !== undefined) return;
    let live = true;
    void service.list().then((res) => {
      if (!live || !res.ok) return;
      const mine = res.value.find((r) => r.id === identity.storefrontId);
      setLiveShop(mine !== undefined ? { slug: mine.slug } : null);
    });
    return () => {
      live = false;
    };
  }, [service, identity, liveShop, screen]);

  /**
   * PERSONNALISER-REAL-1 — HER STOREFRONT AS THE SERVICE HOLDS IT.
   *
   * Personnalisation used to open on `DEFAULT_STOREFRONT` — a hardcoded demo shop
   * (« Chez Aïcha Mode », slug `aicha-4821`) — so the values she read on arrival
   * were never hers, and every edit lived in React state until she left the screen.
   * This is the read half: `undefined` = not asked yet, `null` = asked and no shop
   * exists (she has not gone live), a value = the real one. Nothing is fabricated
   * on a failed read — a fault leaves it `undefined` rather than inventing a shop.
   */
  const [liveStorefront, setLiveStorefront] = useState<Storefront | null | undefined>(undefined);
  /**
   * ONE ADOPTER, AND IT ONLY EVER MOVES FORWARD (verifier MAJOR — a stale
   * response could bring the removed card back). Two writers set this value:
   * the entry effect and the removal. Enter Ma Vitrine, tap « Retirer » before
   * the entry read lands, and the OLDER answer could resolve last and restore
   * the pre-removal shop — the same symptom as the bug being fixed. `updatedAt`
   * is the server's own clock and moves on every real change, so refusing an
   * answer older than the one held makes the order deterministic.
   */
  const adopterStorefront = useCallback((next: Storefront): void => {
    setLiveStorefront((held) =>
      held !== null && held !== undefined && held.updatedAt > next.updatedAt ? held : next,
    );
  }, []);
  useEffect(() => {
    if (service === null || identity === null || identity === undefined) return;
    // ON ENTERING, NOT ON LEAVING — the same reason as the supply feed above.
    // `liveStorefront === undefined` is « never asked », so the first read
    // always runs; a re-read costs a screen she deliberately opened.
    if (liveStorefront !== undefined && !surPersonnaliser && !surVitrine) return;
    let live = true;
    void service.getById(identity.storefrontId).then((res) => {
      if (!live || !res.ok) return; // a fault leaves it UNASKED, never a fabricated shop
      // `null` (no shop yet) still lands directly — there is no clock to compare.
      if (res.value === undefined) setLiveStorefront(null);
      else adopterStorefront(res.value);
    });
    return () => {
      live = false;
    };
    // RE-READ ON ENTERING PERSONNALISER (verifier finding): a read that failed at
    // launch used to leave this `undefined` forever, and with the save gated on it
    // her edits would never persist for the rest of the session with no way back.
    // Opening the screen is the natural, deliberate retry.
    // VITRINE-RETRAIT — « vitrine » joins « personnaliser » as a re-read trigger:
    // the Ma Vitrine grid now RENDERS this value, so opening the screen must be
    // able to correct a read that failed at launch. Without it a launch-time
    // fault would show her an empty shop with no way back for the session.
  }, [service, identity, surPersonnaliser, surVitrine]);

  /**
   * PERSONNALISER-REAL-1 — THE SAVE. Optimistic on her screen, then persisted;
   * a refusal is SAID rather than swallowed, because a change she watched happen
   * and that did not survive is the fabricated-success shape this project refuses
   * everywhere else. The service's NAMED reasons map to the strings that already
   * exist for the same rules on the client side; anything else gets the honest
   * « pas enregistré » rather than a fake success.
   *
   * NOT LIVE YET ⇒ NO SAVE, and the screen says so: her shop does not exist on
   * the service until « mettre ma boutique en ligne », and the create carries her
   * name up at that moment. Silently dropping the write would be the same lie.
   */
  /**
   * PERSONNALISER-MEDIA-1 — SEND THE BYTES, LET THE SERVICE OWN THE ADDRESS.
   *
   * The app hands over the file it genuinely has and nothing else: the service
   * validates the real type from the magic bytes, stores it, and writes the URL
   * onto her storefront itself. So the app cannot point her cover at an address
   * it invented — the same law the price obeys, applied to media.
   *
   * The read-back is the proof: her photograph appears because the SERVICE says
   * it is there, never because the upload call returned.
   */
  const uploadCover = useCallback(
    async (bytes: Uint8Array, contentType: string): Promise<{ ok: boolean; reason?: string }> => {
      if (service === null || identity === null || identity === undefined) return { ok: false, reason: 'unconfigured' };
      if (liveStorefront === null || liveStorefront === undefined) return { ok: false, reason: 'not_live' };
      const res = await service.uploadCover(identity.storefrontId, bytes, contentType);
      if (!res.ok) return { ok: false, reason: res.reason };
      const fresh = await service.getById(identity.storefrontId);
      if (fresh.ok && fresh.value !== undefined) adopterStorefront(fresh.value);
      // ═══ MEDIA-2 — SUCCESS IS WHAT THE READ-BACK SHOWS, NOT WHAT 201 SAID ═══
      //
      // A 201 with no confirming read left the slot spinning « ENVOI… » forever
      // under a success toast. « Queued = pending, never done »: if the re-read
      // did not come back carrying a cover url, we have not SEEN her photograph
      // arrive, so we do not claim it did.
      // Compare against the URL THIS upload minted. `Boolean(cover.url)` would be
      // true of a cover she uploaded last week, so a failed replacement could have
      // reported success — the very shape B5 closed on the server side.
      const confirmed = fresh.ok && fresh.value !== undefined && fresh.value.cover.url === res.value.url;
      return confirmed ? { ok: true } : { ok: false, reason: 'not_confirmed' };
    },
    [service, identity, liveStorefront],
  );

  /**
   * VOIX-PRODUIT — her note's bytes to the service, and the SERVICE's url back.
   *
   * READ THE FILE HERE, not in the sheet: the take is a local `file://` uri from
   * expo-audio, and turning it into bytes is a platform act that belongs beside
   * the other upload call sites, not inside a pure-ish controller.
   *
   * CONFIRMED BY READ-BACK, exactly as MEDIA-2 made the cover do: a 201 is not
   * proof. We re-read the shop and check that the note under THIS pid carries
   * the url THIS upload minted — `Boolean(note)` would be true of a note she
   * recorded last week, so a failed replacement could have reported success.
   */
  const uploadVoiceNote = useCallback<VoiceUploader>(
    async (pid, fileUri, durationMs) => {
      if (service === null || identity === null || identity === undefined) return { ok: false, reason: 'unconfigured' };
      /**
       * ═══ THE TAKE'S BYTES COME THROUGH expo-file-system, NOT fetch(file://) ═══
       *
       * RN Android has historically refused `file://` through fetch. The old
       * read (`await fetch(fileUri)`) then threw, landed as `file_unreadable`
       * → « Note pas envoyée » — with NO upload ever attempted, on the
       * founder's device, under a fully green board. `File.bytes()` is the
       * same read the photo path has shipped on since MEDIA-2 (photo-pick.ts).
       * fetch stays as the FALLBACK for a platform where the File read itself
       * throws — two roads to the same bytes, and only both failing is
       * `file_unreadable`.
       */
      let bytes: Uint8Array;
      try {
        bytes = await new File(fileUri).bytes();
      } catch {
        try {
          const res = await fetch(fileUri);
          bytes = new Uint8Array(await res.arrayBuffer());
        } catch {
          return { ok: false, reason: 'file_unreadable' };
        }
      }
      if (bytes.length === 0) return { ok: false, reason: 'file_empty' };
      const up = await service.uploadVoiceNote(identity.storefrontId, pid, bytes, 'audio/mp4', durationMs);
      if (!up.ok) return { ok: false, reason: up.reason };
      const fresh = await service.getById(identity.storefrontId);
      // The clock-guarded adoption, same as the cover's read-back: a bare
      // setLiveStorefront here could let an older answer overwrite a newer shop.
      if (fresh.ok && fresh.value !== undefined) adopterStorefront(fresh.value);
      const confirmed =
        fresh.ok && fresh.value !== undefined && fresh.value.productNotes?.[pid]?.url === up.value.url;
      return confirmed ? { ok: true, url: up.value.url } : { ok: false, reason: 'not_confirmed' };
    },
    [service, identity],
  );
  // VOIX-PRODUIT (founder 2026-08-12) — the shop's OWN notes reach the
  // controller. Without this third argument it only knew the takes made in this
  // session, so a note the service had stored was invisible on the card and had
  // no url to play. `liveStorefront` is the service's truth, re-read on every
  // load; the merge inside refuses to overwrite a take she is holding.
  /**
   * VOIX-SUPPRIMER-1 (founder, 2026-08-12: « build the real delete ») — the act
   * behind « Supprimer ». It removes the note from HER SHOP, so the buyers on
   * the fiche stop hearing it, and it refreshes the held storefront off the
   * answer rather than making a second read: a POST that lands followed by a
   * GET that does not would leave the note on screen under a message saying it
   * is gone. Same law as `removeItem`, and for the same reason.
   */
  const removeVoiceNote = useCallback<VoiceRemover>(
    async (pid) => {
      if (service === null || identity === null || identity === undefined) {
        return { ok: false, reason: 'unconfigured' };
      }
      const r = await service.removeVoiceNote(identity.storefrontId, pid, new Date().toISOString());
      if (!r.ok) return { ok: false, reason: r.reason };
      if (r.value.storefront !== undefined) setLiveStorefront(r.value.storefront);
      // `no_note` is a success with nothing to show — the note is not on her
      // shop, which is what she asked for. Only a refusal is a refusal.
      return { ok: true };
    },
    [service, identity],
  );
  const voice = useVoiceNotes(setToast, uploadVoiceNote, liveStorefront?.productNotes, removeVoiceNote);

  /** MEDIA-2 — her PORTRAIT, same law as the cover: bytes up, URL owned by the
   *  service, success only once the read-back shows it. */
  const uploadAvatar = useCallback(
    async (bytes: Uint8Array, contentType: string): Promise<{ ok: boolean; reason?: string }> => {
      if (service === null || identity === null || identity === undefined) return { ok: false, reason: 'unconfigured' };
      if (liveStorefront === null || liveStorefront === undefined) return { ok: false, reason: 'not_live' };
      const res = await service.uploadAvatar(identity.storefrontId, bytes, contentType);
      if (!res.ok) return { ok: false, reason: res.reason };
      const fresh = await service.getById(identity.storefrontId);
      if (fresh.ok && fresh.value !== undefined) setLiveStorefront(fresh.value);
      const confirmed = fresh.ok && fresh.value !== undefined && fresh.value.avatar.url === res.value.url;
      return confirmed ? { ok: true } : { ok: false, reason: 'not_confirmed' };
    },
    [service, identity, liveStorefront],
  );

  /**
   * PERSONNALISER-HONESTY-1 — the save now ANSWERS. It returned `void`, so every
   * caller had to assume it worked: K4 drew its check mark on the tap, and a
   * refused header style looked chosen on a screen where nothing had been
   * stored. The boolean is the read the screens actually need — `true` only
   * when the service accepted AND the read-back landed.
   */
  const saveIdentity = useCallback(
    async (patch: StorefrontIdentityPatch): Promise<boolean> => {
      if (service === null || identity === null || identity === undefined) return false;
      // ═══ NEVER SAVE FROM AN UNADOPTED DRAFT (verifier finding, blocking) ═══
      //
      // The gate used to be `liveShop` — a DIFFERENT read (the admin list) from
      // the one that fills these screens (`getById`). One can succeed while the
      // other fails or is merely slow, and in that window the stack still holds
      // `DEFAULT_STOREFRONT`: one tap on a theme would have PERSISTED the demo
      // seed — « Chez Aïcha Mode », empty tagline, empty sections — over her real
      // shop, buyer-visible, with no undo, driving a RETIRED NAME (law 10) into
      // live data. Strictly worse than the defect this slice fixes.
      //
      // So the gate is now the SAME read the screens edit: a save is possible
      // only once her real storefront has been loaded AND adopted. `undefined`
      // (not asked / read failed) and `null` (no shop yet) both refuse.
      if (liveStorefront === null || liveStorefront === undefined) return false;
      const res = await service.saveIdentity(identity.storefrontId, patch, new Date().toISOString());
      if (res.ok) {
        // READ BACK, never assumed: the service owns `updatedAt` and the canon
        // shape, so the next screen reads what was actually stored.
        const fresh = await service.getById(identity.storefrontId);
        if (fresh.ok && fresh.value !== undefined) setLiveStorefront(fresh.value);
        return true;
      }
      // PERSONNALISER-HONESTY-1 — the reason earns its own sentence, and only a
      // genuinely transient one earns « Réessayez dans un moment » (see
      // `saveRefusalToastKey`: an unknown reason is treated as permanent).
      setToast(t(saveRefusalToastKey(res.reason)));
      return false;
    },
    [service, identity, liveStorefront],
  );
  useEffect(() => {
    let live = true;
    void loadOrMintIdentity(expoIdentityStore(), expoRandomBytes).then((outcome) => {
      if (!live) return;
      setIdentity(outcome.ok ? outcome.identity : null);
    });
    return () => {
      live = false;
    };
  }, []);
  const publishOnline = useCallback(
    async (sf: { name: string; zone: string; category: string }) => {
      // RESELLER-SEAM-HONESTY-1 — the seam resolves to `null` when the
      // EXPO_PUBLIC_STOREFRONT_* pair is not inlined. It used to resolve to a demo
      // adapter whose create/publish CANNOT FAIL, so this function always reached
      // « En ligne : {slug} » — a success toast for a storefront that exists nowhere,
      // with nothing written. The honest state is stated FIRST and returns; nothing
      // below runs, so « Envoi en cours… » never appears for a send that cannot happen.
      if (service === null) return setToast(t('k.publier.non_relie'));
      // RESELLER-IDENTITY-1 — never write under a fabricated identity. `undefined` is
      // still loading (a disk read, so effectively instant); `null` means the CSPRNG
      // mint or the persist failed. Publishing under an unpersisted id would create a
      // shop she could never return to — the very defect this slice closes.
      if (identity === undefined) return setToast(t('k.publier.identite_attente'));
      if (identity === null) return setToast(t('k.publier.identite_absente'));
      // SEED-NEUTRE — the first-run seed is empty now, so an unfilled form is a
      // reachable state. The canon schema refuses blank name/zone server-side;
      // this sentence says the same true thing in her language, before a send.
      if (sf.name.trim() === '' || sf.zone.trim() === '') {
        return setToast(t('k.publier.identite_dabord'));
      }
      setToast(t('k.publier.envoi'));
      const shortCode = deriveShortCode(sf.name, identity.digits);
      const at = new Date().toISOString();
      const created = await service.create({
        commandId: identity.commandId,
        id: identity.storefrontId,
        resellerId: identity.resellerId,
        shortCode,
        name: sf.name,
        zone: sf.zone,
        category: sf.category,
        correlationId: identity.correlationId,
        at,
      });
      if (!created.ok) return setToast(tf('k.publier.erreur', { raison: created.reason }));
      const pub = await service.publish(identity.storefrontId, identity.correlationId, at);
      if (!pub.ok) return setToast(tf('k.publier.erreur', { raison: pub.reason }));
      // MONEY-SHAPE-1 item 4 — THE TOAST THAT COULD NOT FAIL. This read
      // `created.value.slug ?? shortCode.toLowerCase()`, so when the service returned
      // NO slug the app COMPUTED one locally and printed it — « En ligne : {slug} »
      // naming a slug the service never stored, looking identical either way, on the
      // screen that tells her the shop is live. It cost the founder an hour.
      // No slug from the service is a state, not a gap to paper over: say so.
      if (created.value.slug === null || created.value.slug === '') {
        return setToast(t('k.publier.en_ligne_sans_slug'));
      }
      // ACCUEIL-PRO (verifier) — adopt the created storefront off the create
      // response itself. With only `liveShop` set, the accueil's honest-absent
      // sentence could outlive the publish (the vitrine re-read is dropped when
      // she leaves the screen early) and tell her to create the shop the toast
      // just confirmed. The response IS a read-back; the adopter's updatedAt
      // guard keeps ordering deterministic.
      if (created.value.storefront !== undefined) adopterStorefront(created.value.storefront);
      setLiveShop({ slug: created.value.slug }); // the create response IS a read-back
      setToast(tf('k.publier.en_ligne', { slug: created.value.slug }));
    },
    [service, identity, adopterStorefront],
  );
  const listOnline = useCallback(async () => {
    // Same honesty on the read side: an unconfigured build cannot list what is online,
    // and « Aucune boutique en ligne » would be a lie shaped like a fact.
    if (service === null) return setToast(t('k.publier.non_relie'));
    const res = await service.list();
    if (!res.ok) return setToast(tf('k.publier.erreur', { raison: res.reason }));
    if (res.value.length === 0) return setToast(t('k.publier.aucune'));
    setToast(tf('k.publier.compte', { n: String(res.value.length), noms: res.value.map((r) => r.name).join(', ') }));
  }, [service]);

  // WO-VITRINE-FLOW — the vitrine + share derived state, all from the seam's fold,
  // the frozen seed inputs (B, C), and the reseller's own markup. `vitrineOpps` are
  // the products she added (the seam's live listings); `ficheOpp`/`shareOffer` are the
  // tapped / to-share products. `viewOf` is the reseller-margin view at her markup
  // (markups[pid]) or the capped default — the ONE money computation the reseller
  // surfaces share (opp row · fiche · vitrine tile · partager), all reconciling.
  // PUBLISH-PRICE-1 — ONE KEYSPACE, `productVersionId`, EVERYWHERE.
  //
  // THE DEFECT THIS CLOSES (founder finding): `markups` was written by the Ma Vitrine
  // slider keyed on DEMO SEED IDS (`o.id`) and read by the fiche keyed on
  // `productVersionId`. The two keyspaces never intersected, so on a LIVE offer the
  // only reachable markup was `defaultMarkup(cap)` — and enabling publish then would
  // have signed `B + 1500`, a price she never chose, attributed to her.
  //
  // The grid therefore reads the LIVE offer feed filtered by membership, not the demo
  // world: the product she publishes, the card she adjusts and the price that gets
  // signed are now the same object under the same key.
  /**
   * ═══ VITRINE-RETRAIT (founder, 2026-08-11) — MA VITRINE READS THE SERVICE ═══
   *
   * « when they delete products from their ma vitrine these products still show
   * on their boutique. »
   *
   * THE GRID USED TO READ `vitrineCol.listings()` — a SESSION-LOCAL event log
   * initialized empty on every launch and never hydrated (`useState([])`, and
   * `VITRINE-REAL-BACKING` names the slice that was meant to replace it). So Ma
   * Vitrine and her boutique were two different answers to « what is in my
   * shop »: the grid forgot everything when she reopened the app, while the
   * boutique kept rendering `curatedItems` forever. The Personnaliser catalogue
   * was moved onto `curatedItems` for exactly this reason and this grid was left
   * behind; it joins it now, so ONE membership answers both.
   *
   * THE FALLBACK IS `undefined` ONLY (verifier BLOCKER). The first cut also fell
   * back on `null`, and in this file `null` means « asked, and she has no shop
   * yet » — every other consumer REFUSES on it (`:491`, `:551`, `:584`). Falling
   * back there rendered cards for a woman with no boutique at all: they came
   * from the session log, the service had never heard of them, and « Retirer »
   * could only ever answer 404 — a dead control telling her to retry something
   * that can never work. `undefined` (« not asked yet ») keeps the interim
   * answer; `null` shows the designed empty state, which is the truth.
   */
  const vitrineLive: readonly string[] =
    liveStorefront === undefined ? vitrineCol.listings() : (liveStorefront?.curatedItems ?? []);
  const vitrineOffers = offers.filter((o) => vitrineLive.includes(o.productVersionId));
  /**
   * ═══ DÉJÀ-DANS-MA-VITRINE (founder, 2026-08-12) — ONE MEMBERSHIP, BOTH SCREENS ═══
   *
   * « when i add a product on ma vitrine, it still shows on opportunites the
   * option the add the same product on ma vitrine instead of displaying this
   * product is already added. »
   *
   * He is right, and the second half of the sentence is the part that matters.
   * The membership was already computed — `vitrineLive`, one line up, the same
   * `curatedItems` Ma Vitrine reads — and Opportunités simply never asked it.
   * The CTA's only gate was « is the service reachable », so a product she had
   * just added kept offering to be added.
   *
   * AND THE SECOND TAP WAS NOT HARMLESS. Verified against the real Worker
   * (miniflare, `decidePublish`): the command id is DERIVED from the listing id,
   * so a re-publish answers `200 {"status":"idempotent"}` and returns the
   * ORIGINAL listing — `markup: 0, version: 1` — while the app read that 200 as
   * success and toasted « C'est ajouté à votre vitrine. » So if she moved the
   * marge and tapped again, the screen told her a marge that HER CLIENTE WILL
   * NEVER BE CHARGED. A button whose only outcome is a silent no-op with a
   * success message over it is the fabricated-success shape this project
   * refuses everywhere else.
   *
   * NAMED, NOT FIXED HERE — AND THE CONSTRAINT IS THIS APP'S, NOT THE SERVICE'S
   * (verifier: my first version of this comment blamed the wrong repo, which
   * would have sent the next engineer looking in storefront-service).
   * `listing-core.ts` says the opposite in its own header, under a founder
   * ruling: « idempotent on the publish command_id; A NEW COMMAND_ID
   * (RE)PUBLISHES … REPUBLISH IS A NEW VERSION, NEVER A MUTATION », and the
   * Worker re-signs against live supply on every accepted POST. Re-pricing is
   * blocked HERE, by one line — `commandId: publish-${listingId}` in
   * `src/vitrine/service.ts` — which pins every re-tap to the first command.
   * Reading her signed marge back is available too: `GET
   * /listings/by-pid/{sfId}/{pid}` exists, behind the key this app already
   * holds.
   *
   * So a published marge is frozen at its first value, which makes Ma Vitrine's
   * marge slider a control that moves numbers on screen and signs nothing. What
   * is open is not « can the service do it » but « should the app offer a
   * re-price act, and what happens to a cliente holding the old price » — the
   * founder's call, not something to invent inside a screen fix. Journalled and
   * reported; this fix removes the trap, it does not open the door.
   */
  const dejaDansVitrine = (pid: string): boolean => vitrineLive.includes(pid);
  const ficheOpp = world.opportunities.find((o) => o.id === ficheId);
  // RESELLER-UX-1 item 5 — THE SHARE LOOKUP JOINS THE LIVE KEYSPACE. `shareId` is a
  // productVersionId since PUBLISH-PRICE-1, but this screen still looked it up in
  // the DEMO world by seed id — so tapping « Partager » on her real product found
  // nothing, fell back to the composed demo card, and the founder shared A PRODUCT
  // THAT WAS NOT THE ONE HE TAPPED. Same family as the markup keyspace defect:
  // one id, two worlds, and the join silently picking the wrong one.
  const shareOffer = offers.find((o) => o.productVersionId === shareId);
  const viewOf = (opp: DemoOpportunity) => marginOf(opp.id, opp.input.sellerBasePrice, opp.input.sellerFundedCommission);
  /**
   * BROWSE-SUPPLY-1 — THE ONE money computation, now reachable from a LIVE offer as
   * well as a seed. Nothing new is calculated here: it is the same `marginBreakdown`
   * from src/vitrine/margin.ts (gross = C + M · fee = round(gross × 0.20) · net =
   * gross − fee), fed the projection's `basePrice` (B) and `resellerCommission` (C)
   * instead of the seed's. The figure stays an ESTIMATE — « Gagnez environ … » — at
   * the DEFAULT markup min(1500, cap); she sets her exact markup on Ma Vitrine, and
   * it is never presented as a commitment.
   */
  function marginOf(id: string, basePrice: number, commission: number) {
    const cap = markupCap(basePrice);
    return marginBreakdown(basePrice, commission, markups[id] ?? defaultMarkup(cap));
  }
  const viewOfOffer = (o: Offer) => marginOf(o.productVersionId, o.basePrice, o.resellerCommission);
  /**
   * PUBLISH-PRICE-1 — « Ajouter à ma vitrine », for real.
   *
   * THE APP SENDS THE MARKUP AND NOTHING ELSE ABOUT MONEY. It does not send, and
   * cannot send, `customerPriceFcfa`: the request shape has no such field. The
   * service reads the live base through its own binding and signs `B + M` itself.
   *
   * SUCCESS IS ONLY CLAIMED ON A CONFIRMED WRITE. Membership is recorded AFTER the
   * service says `published` — recording it first would put the product on Ma Vitrine
   * whether or not anything was written, which is the fabricated-success shape this
   * project refuses everywhere else.
   */
  const publishListing = useCallback(
    async (o: Offer) => {
      if (service === null) return setToast(t('k.publier.non_relie'));
      if (identity === undefined) return setToast(t('k.publier.identite_attente'));
      if (identity === null) return setToast(t('k.publier.identite_absente'));
      // THE MARKUP SENT IS THE MARKUP DISPLAYED — the same `markups[pid] ??
      // defaultMarkup(cap)` the fiche renders, so what she reads is what signs.
      // With DEFAULT_MARKUP = 0 (founder override 2026-07-26) an untouched fiche
      // publishes at marge 0: base-price cliente price, commission-only net.
      const markup = viewOfOffer(o).markup;
      setPublishing(true);
      setToast(t('k.publier.envoi'));
      const res = await service.publishListing({
        storefrontId: identity.storefrontId,
        resellerId: identity.resellerId,
        productVersionId: o.productVersionId,
        markup,
        correlationId: identity.correlationId,
        at: new Date().toISOString(),
      });
      setPublishing(false);
      if (!res.ok) {
        // The service's NAMED refusal decides what she is told. « Supply unavailable »
        // is a retry, not a defect, and saying so is the difference between a calm
        // money moment and an anxious one.
        //
        // PAS-DE-BOUTIQUE (founder screenshot, 2026-08-13): `storefront_absent`
        // reached his phone RAW, inside « L'envoi n'a pas marché —
        // storefront_absent — réessayez ». Three failures in one sentence: a
        // wire token where a reseller reads (Law 6), « réessayez » for a state
        // the service refuses BY DESIGN until her boutique exists (« no
        // boutique, no publication », 2026-08-11), and not a word about the
        // step that is actually hers to take. The refusal is permanent-until-
        // she-acts, so the sentence names the act — and the empty vitrine now
        // carries the « Personnaliser ma boutique » door it points at.
        //
        // NOT A TOAST (verifier MAJOR): it sets the persistent state above, so
        // the sentence renders under the CTA she just pressed and STAYS — a
        // 2.6 s toast was the sole carrier of the recovery path and died
        // mid-read. One state, one sentence, one voice: no toast beside it.
        if (res.reason === 'storefront_absent') {
          setToast(null);
          return setSansBoutique(true);
        }
        return setToast(res.reason === 'supply_unavailable' ? t('fiche.publier.reessayer') : tf('k.publier.erreur', { raison: res.reason }));
      }
      // CONFIRMED. Membership is recorded now, keyed by productVersionId — the one
      // keyspace the fiche, the grid and the signed price all share.
      vitrineCol.addToVitrine(o.productVersionId);
      // A publish that landed proves the boutique exists — the persistent
      // « créez d'abord » note comes down with the fact that made it true.
      setSansBoutique(false);
      /**
       * `idempotent` IS NOT `published`, AND SHE IS TOLD SO (verifier MAJOR).
       *
       * The status was read as « ok » and reported as « C'est ajouté à votre
       * vitrine » whatever it said. That is right for `published` and a lie for
       * `idempotent`: the service recognised the command, wrote NOTHING, and
       * kept the marge it signed the first time. Her product IS in her shop
       * (so the membership above still stands, and this is not an error) — but
       * if she had moved her marge expecting this tap to apply it, the toast
       * was telling her a price her cliente will never be charged.
       *
       * This closes the hole in EVERY state, including the ones the screen
       * cannot see: the « déjà » guard is a screen-level check over a shop read
       * that can fail, and when it does the button comes back. Here the answer
       * comes from the service itself, so it cannot be out of date.
       *
       * RE-AJOUT (founder bug, 2026-08-13): « When I add a product to ma
       * vitrine, remove it and trying t re-add it, it says the product exist
       * already » — over an EMPTY vitrine. The service now states membership
       * on the idempotent road too, and when the product was genuinely gone it
       * says so: `remise: true`, with the post-add shop riding on the write
       * (the removeItem precedent). Adopting it through the clock-guarded
       * adopter puts the card back on Ma Vitrine BEFORE any re-read, and the
       * toast tells the truth: it is BACK, at the marge she signed before —
       * the replay re-signs nothing, so « déjà » would be the wrong sentence
       * and « ajouté » would promise a marge the replay never applied.
       */
      if (res.value.status === 'idempotent' && res.value.remise === true) {
        if (res.value.storefront !== undefined) adopterStorefront(res.value.storefront);
        setToast(t('fiche.publier.retour'));
      } else {
        setToast(res.value.status === 'idempotent' ? t('fiche.publier.deja') : t('fiche.publier.ajoute'));
      }
      // RESELLER-UX-1 item 4 (founder walk: « I am still in that screen ») — the
      // add lands her ON the vitrine so the product she just added is the first
      // thing she sees. Cause and effect on one screen; toHub resets the stack so
      // « Retour » from here does not replay the fiche.
      toHub('vitrine');
    },
    [service, identity, markups, vitrineCol, toHub, adopterStorefront],
  );
  /**
   * VITRINE-RETRAIT — « Retirer de ma vitrine », the act that was missing.
   *
   * It goes to the SERVICE and re-reads her shop from it, because the whole
   * defect this fixes was a removal that lived only on her phone. Optimism is
   * deliberately absent here: the card disappears when the shop says it is gone,
   * not when the tap lands — a product she watched leave and that comes back on
   * the next read is the fabricated-success shape refused everywhere else.
   *
   * The local log is updated too, so a session with no readable shop (the interim
   * answer above) still behaves.
   */
  const [retiring, setRetiring] = useState<string | null>(null);
  const retirerDeVitrine = useCallback(
    async (pid: string): Promise<void> => {
      if (service === null || identity === null || identity === undefined) return;
      setRetiring(pid);
      const res = await service.removeItem(identity.storefrontId, pid, new Date().toISOString());
      if (!res.ok) {
        setRetiring(null);
        return setToast(t('vitrine.retirer_echec'));
      }
      vitrineCol.removeFromVitrine(pid);
      /**
       * THE SHOP COMES OFF THE WRITE, not a second read (verifier BLOCKER). The
       * first cut re-read with `getById` and swallowed its failure, so a POST
       * that landed followed by a GET that did not left the removed product on
       * screen under « Retiré de votre boutique. » — the founder's own symptom
       * with a success message painted over it. The decision body already
       * carries the post-removal shop; a fallback read runs only if an older
       * Worker sent none, and its failure is now SAID rather than swallowed.
       */
      if (res.value.storefront !== undefined) {
        adopterStorefront(res.value.storefront);
      } else {
        const fresh = await service.getById(identity.storefrontId);
        if (fresh.ok && fresh.value !== undefined) adopterStorefront(fresh.value);
        else {
          setRetiring(null);
          return setToast(t('vitrine.retirer_incertain'));
        }
      }
      setRetiring(null);
      setToast(t('vitrine.retirer_fait'));
    },
    [service, identity, vitrineCol],
  );
  const ficheOffer = offers.find((o) => o.productVersionId === ficheId);
  /**
   * PARTAGER-PRO (founder, 2026-08-15: « more professional, very simple and
   * well detailed … not display many partager buttons … remove all the mocks
   * and use the real data »).
   *
   * THE SCREEN IS REAL-ONLY. It renders from three live facts and nothing
   * else: HER product (`shareOffer`, from the live feed), HER shop's slug
   * (`liveShop`, the admin list) and HER storefront (`liveStorefront`, the
   * service's own record — the name on the card). No demo identity, no frozen
   * link, no fallback card: a missing fact renders the honest guard, never a
   * stranger's shop. The ONE exception is Cercle's campaign hand-off, which
   * stays on its own gated demo surface (SP9) and is journalled.
   *
   * ONE SHARE PATH: the OS share sheet. WhatsApp, Facebook, TikTok and copy
   * all live INSIDE the sheet the system already owns — four app buttons that
   * each re-implemented one row of it were noise, and the founder called them.
   */
  const partage =
    shareOffer !== undefined && liveShop !== null && liveShop !== undefined &&
    liveStorefront !== null && liveStorefront !== undefined
      ? {
          offre: shareOffer,
          vue: viewOfOffer(shareOffer),
          nomBoutique: liveStorefront.name,
          lienProduit: signedProductShareUrl(liveShop.slug, shareOffer.productVersionId),
          lienBoutique: boutiqueShareUrl(liveShop.slug),
          lienAffiche: afficheQrUrl(liveShop.slug),
          // The spoken no-scan fallback — the slug itself, said out loud.
          codeDit: liveShop.slug.toUpperCase(),
        }
      : null;
  const partagerProduit = useCallback(async () => {
    if (partage === null) return;
    try {
      await Share.share({
        message: tf('partager.message_produit', { nom: partage.offre.productName, url: partage.lienProduit }),
      });
    } catch {
      // best-effort: a declined share sheet is not an error state.
    }
  }, [partage]);
  const partagerBoutique = useCallback(async () => {
    if (partage === null) return;
    try {
      await Share.share({ message: tf('partager.message', { url: partage.lienBoutique }) });
    } catch {
      // best-effort: a declined share sheet is not an error state.
    }
  }, [partage]);
  const imprimerQr = useCallback(() => {
    if (partage === null) return;
    // The browser prints (see `afficheQrUrl`): the poster page carries the
    // print button, and the browser's dialog also saves a PDF for a kiosk.
    void Linking.openURL(partage.lienAffiche).catch(() => {});
  }, [partage]);
  // The demo build stamp — the actual OTA update id (expo-updates), « dev » in
  // the local runtime; honest provenance in the demo footer, never a fake build.
  /**
   * RF-1c — HER REAL SALES. The code lives in the same document directory the
   * reseller identity uses — durable across app-kill, reboot and an EAS
   * republish — and never in the bundle.
   *
   * ACCUEIL-HONESTY-1 — and ACCUEIL now reads the same hook. The home screen
   * used to render `ventesListModel()` and two demo money constants; it is a
   * projection of these two honest screens instead, so it cannot disagree with
   * the tab it links to. ONE fetch still, for all three surfaces.
   */
  const [codeSaisi, setCodeSaisi] = useState('');
  const ventesReelles = useVentesReelles(accessCodeStore);
  const accueil = ecranAccueil(ventesReelles.gains, ventesReelles.ecran);

  /* ── RESELLER-ACCOUNTS-1d — the account at the entrance ─────────────────── */
  const compteService = useMemo<CompteServicePort | null>(() => resolveCompteService(), []);
  const [compte, setCompte] = useState<CompteLocal | null | undefined>(undefined);
  const [compteEnvoi, setCompteEnvoi] = useState(false);
  const [compteErreurKey, setCompteErreurKey] = useState<string | null>(null);

  /**
   * HER ACCOUNT ID BECOMES HER APP IDENTITY. The server minted `rs-{4 digits}`;
   * `identityFromDigits` derives the same storefront/command ids from those
   * digits, so everything she creates from here on — shop, listings, orders —
   * rides the id her feed and the founder's suivi are keyed by. Without this
   * write, her sales would ride the device-random id and her feed would be
   * forever empty: the exact split-brain this slice exists to end.
   */
  const adopterCompte = async (nouveau: CompteLocal, session?: string): Promise<void> => {
    if (session !== undefined) await accessCodeStore.write(session);
    await compteStore.write(nouveau);
    setCompte(nouveau);
    setCompteErreurKey(null);
    const digits = /^rs-(\d{4})$/.exec(nouveau.accountId)?.[1];
    if (digits !== undefined) {
      await expoIdentityStore().write(JSON.stringify({ version: 1, digits })).catch(() => undefined);
      setIdentity(identityFromDigits(digits));
    }
  };

  useEffect(() => {
    void (async () => {
      const connu = await compteStore.read();
      setCompte(connu);
      // THE BACKGROUND REFRESH — how a founder's pause reaches a device that
      // is already inside. Best-effort: a dead network changes nothing (the
      // last-known state rules, Ten Laws #7); a fresh answer replaces it.
      if (connu !== null && compteService !== null) {
        const bearer = await accessCodeStore.read();
        if (bearer !== null && bearer.startsWith('SPS-')) {
          const res = await compteService.session(bearer);
          if (res.ok) {
            await compteStore.write(res.compte);
            setCompte(res.compte);
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

  /**
   * ACCESS-GATE-1 — THE ONE DOOR, AND IT IS AT THE ENTRANCE.
   *
   * Disarmed today by founder order, so `decideAcces` returns « ouvert » for
   * everyone and this branch never renders. Armed, it is the whole app: no tab,
   * no screen and no read is reachable until a code opens it, which is what
   * makes it an ACCESS gate rather than another wall in the middle.
   */
  const acces = decideAcces(gateArme(), compte);
  if (acces.kind !== 'ouvert') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" backgroundColor={sharedColour.paper} />
        <WaxBand />
        {acces.kind === 'lecture' ? (
          <View style={styles.accesEcran} />
        ) : acces.kind === 'coupe' ? (
          <View style={styles.accesEcran}>
            <Text style={styles.accesTitre}>{t('coupe.titre')}</Text>
            <Text style={styles.accesSous}>{t('coupe.texte')}</Text>
            <PrimaryButton
              label={t('coupe.reessayer')}
              onPress={() => {
                void (async () => {
                  if (compteService === null) return;
                  const bearer = await accessCodeStore.read();
                  if (bearer === null) return;
                  const res = await compteService.session(bearer);
                  if (res.ok) await adopterCompte(res.compte);
                })();
              }}
            />
          </View>
        ) : acces.kind === 'admission' ? (
          <EcranAdmission
            code={codeSaisi}
            onCode={setCodeSaisi}
            envoi={compteEnvoi}
            erreurKey={compteErreurKey}
            onEntrer={() => {
              void (async () => {
                if (compteService === null || compte === null || compte === undefined) return;
                setCompteEnvoi(true);
                setCompteErreurKey(null);
                const bearer = await accessCodeStore.read();
                const res = bearer === null
                  ? ({ ok: false, reason: 'unreachable' } as const)
                  : await compteService.admission(bearer, codeSaisi.trim());
                setCompteEnvoi(false);
                if (res.ok) {
                  setCodeSaisi('');
                  await adopterCompte({ ...compte, state: 'active' });
                } else {
                  setCompteErreurKey(
                    res.reason === 'code_refuse' ? 'admission.refuse'
                    : res.reason === 'acces_coupe' ? 'coupe.texte'
                    : 'compte.reseau',
                  );
                  if (res.reason === 'acces_coupe') await adopterCompte({ ...compte, state: 'paused' });
                }
              })();
            }}
          />
        ) : (
          <EcranCompte
            service={compteService}
            envoi={compteEnvoi}
            erreurKey={compteErreurKey}
            onEnvoi={setCompteEnvoi}
            onErreur={setCompteErreurKey}
            onCompte={(c, session) => { void adopterCompte(c, session); }}
          />
        )}
      </SafeAreaView>
    );
  }

  /**
   * CLAVIER-MARGE — the two surfaces that carry the markup field, so the field
   * can ask to be lifted CLEAR OF THE KEYPAD when it takes focus.
   *
   * `automaticallyAdjustKeyboardInsets` alone is not enough and that is a fact
   * about what it does, not a preference: it scrolls the CARET to the keyboard's
   * top edge (RN insets from `firstResponderFocus`, the selection rect + 15pt),
   * so everything BELOW the caret inside the card — the ceiling note and « Prix
   * cliente », the figure she is typing this number FOR — stays underneath. And
   * when the field already sits above the keypad it scrolls nothing at all.
   *
   * `scrollResponderScrollNativeHandleToKeyboard` is the one RN path that takes
   * an `additionalOffset`, i.e. slack BELOW the target. The offset is the height
   * of what follows the field inside the money card.
   */
  const ficheScroll = useRef<ScrollView>(null);
  const vitrineListe = useRef<FlatList<(typeof vitrineOffers)[number]>>(null);
  /** Enough for the ceiling note + the « Prix cliente » row + the card's foot. */
  const SOUS_LE_CHAMP = 120;
  const leverFiche = useCallback((handle: number | null) => {
    if (handle === null) return;
    ficheScroll.current?.scrollResponderScrollNativeHandleToKeyboard?.(handle, SOUS_LE_CHAMP, true);
  }, []);
  const leverVitrine = useCallback((handle: number | null) => {
    if (handle === null) return;
    // RN types `getScrollResponder()` as `Element`, which does not carry the
    // scroll-responder methods it actually returns; the cast names the ONE
    // method used and nothing more.
    const responder = vitrineListe.current?.getScrollResponder?.() as
      | { scrollResponderScrollNativeHandleToKeyboard?: (h: number, offset: number, prevent: boolean) => void }
      | undefined;
    responder?.scrollResponderScrollNativeHandleToKeyboard?.(handle, SOUS_LE_CHAMP, true);
  }, []);

  return (
    /**
     * OPPORTUNITÉS-BLANC (founder order 2026-08-14, with an Alibaba grid as the
     * reference): « make the background of opportunités screen all white ».
     *
     * THE GROUND MOVES, NOT THE SCREEN'S CONTENTS. The header band, the scroll
     * area, the footer strip and the overscroll are ALL transparent over this
     * root, so tinting the ROOT turns every one of them white together — a
     * per-block background would have left the header on warm paper with a
     * seam across the middle of his screen.
     *
     * WHAT STAYS WARM, NAMED HONESTLY (the comment this replaced said « the
     * whole screen », which was not true and is exactly how a comment becomes
     * a lie): the bottom TAB BAR keeps its own fill in `kit.tsx`, and in a
     * preview build the « aperçu » BANNER keeps its own — and the 8px
     * WOVEN BAND at the very top carries paper slivers inside its weave.
     * All three are opaque chrome with their own backgrounds — this root
     * never reached them. The founder's call, put to him with the build.
     *
     * ONLY THIS TAB, and that is deliberate: `styles.screen` is the ground for
     * all five hubs, so changing it there would have repainted accueil, ma
     * vitrine, cercle and gains — four screens he did not ask about. The
     * bottom tab bar keeps its own warm fill (`kit.tsx`), because it is ONE
     * continuous chrome band across every tab: tinting it here would make it
     * flash warm→white→warm as he moves between hubs.
     *
     * `sharedColour.card` IS the white the design system already owns — the
     * very token the product tiles on this screen are filled with. No colour
     * is typed here: the scan below this file forbids a literal, and rightly.
     */
    <SafeAreaView style={[styles.screen, surOpportunites && styles.screenBlanc]}>
      {/* SDK 54: backgroundColor restored per the WO-4.0d-prep founder
          ruling ③ — pre-edge-to-edge Android draws a default bar; the
          surface token is the correct fill. OPPORTUNITÉS-BLANC: the bar
          follows the ground it sits on, or Android draws a warm strip
          above a white screen. */}
      <StatusBar style="dark" backgroundColor={surOpportunites ? sharedColour.card : sharedColour.paper} />
      <WaxBand />
      {IS_PREVIEW && (
        <View style={styles.previewBanner}>
          <Text style={styles.previewBannerText}>{t('preview.banner')}</Text>
        </View>
      )}

      {/* CTA-ENTIÈRE (verifier) — the accueil subtitle is GONE, not the hero
          line. This slot is `numberOfLines={1}`, so the 69-character promise
          « Choisissez de beaux produits… » was cut here at every font scale,
          for ever. It now renders ONCE, under « Bonjour », where it wraps and
          can be read whole. */}
      <AppHeader
        title={headerTitle}
        backLabel={`← ${t('nav.retour')}`}
        onBack={stack.length > 1 ? back : undefined}
      />

      {/**
        * CLAVIER-MARGE (founder, 2026-08-15) — « When I tap to add the number the
        * keypad is hiding the section ». The numeric keypad covered « Prix de
        * base / Vous ajoutez / Prix cliente » — the three rows the figure she is
        * typing is FOR, so she typed blind into the one card whose job is to show
        * her the arithmetic.
        *
        * NOTHING IN THIS APP YIELDED TO THE KEYBOARD: no KeyboardAvoidingView
        * anywhere, and — bar `EcranCompte`, which already had
        * `keyboardShouldPersistTaps` — no scroll surface that let a tap through
        * while the keypad was up. Expo SDK 54 draws Android edge-to-edge and iOS
        * never resized for the IME either, so the keypad simply sat on whatever
        * was underneath it.
        *
        * ONE MECHANISM PER PLATFORM, deliberately not two. Android gets this
        * view's `height` behaviour; iOS gets `automaticallyAdjustKeyboardInsets`
        * on the scroll surfaces themselves, which insets by the keypad AND brings
        * the FOCUSED field into view — the right tool for a field sitting in the
        * middle of a card rather than at the end of a scroll. Doing both on iOS
        * would count the keyboard's height twice.
        */}
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? undefined : 'height'}
      >
      <ScreenTransition screenKey={screen}>
      <View style={styles.content}>
        {screen === 'accueil' && (
          <ScrollView style={styles.screenScroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* ACCUEIL-PRO (founder, 2026-08-17: « remove all mocks … very
                professional … very simple ») — the header is HER shop or an
                honest absence. Real initial, real name, her real zone; the
                vérifié mark ONLY when her shop is live (an unconditional badge
                is a fake badge). While the read is in flight the row stays
                empty — brief and honest — and a resolved « no shop yet » says
                where the shop is created. The demo identity (« Aïcha »,
                « Gounghin ») and the « Comment ça marche » pill — a control
                wired to NOTHING since the day it was drawn — are gone. */}
            <View style={styles.homeHeader}>
              <View style={styles.monogram}>
                {liveStorefront !== null && liveStorefront !== undefined ? (
                  <Text style={styles.monogramText}>{liveStorefront.name.slice(0, 1).toUpperCase()}</Text>
                ) : (
                  <IconVitrine size={dimension.iconSizePx.badge} color={shopColour.deep} />
                )}
              </View>
              <View style={styles.homeHeaderBody}>
                <Text style={styles.homeTitle} numberOfLines={1}>{t('accueil.home_titre')}</Text>
                {liveStorefront !== null && liveStorefront !== undefined ? (
                  <View style={styles.homeSubRow}>
                    <Text style={styles.homeSubName} numberOfLines={1}>{liveStorefront.name}</Text>
                    {liveShop !== null && liveShop !== undefined ? (
                      <IconCoche size={dimension.iconSizePx.badge} color={shopColour.primary} />
                    ) : null}
                    {liveStorefront.zone !== '' ? (
                      <Text style={styles.homeSubZone} numberOfLines={1}>{` · ${liveStorefront.zone}`}</Text>
                    ) : null}
                  </View>
                ) : liveStorefront === null ? (
                  <Text style={styles.homeSubZone}>{t('accueil.sans_boutique')}</Text>
                ) : null}
              </View>
            </View>

            {/* Greeting hero — « Bonjour », plain: the app knows her SHOP, not
                her first name, and a borrowed name is worse than none. The
                tagline is said HERE and only here: a plain Text in a stretch
                column, so it wraps and reads whole (the header's one-line slot
                could only ever cut it). */}
            <Text style={styles.greeting}>{t('accueil.bonjour')}</Text>
            <Text style={styles.homeTagline}>{t('accueil.tagline')}</Text>

            {/* ACCUEIL-HONESTY-1 — the ledger cards, from her REAL ladder.
                Every figure here is a sum of amounts copied off frozen quotes
                for sales that exist; when there is no honest number the block
                says a sentence instead of a zero. Which cards appear is
                derived (`accueil-model.ts`), never chosen. */}
            {accueil.gains.kind === 'chiffres' ? (
              <View style={styles.homeStatGrid}>
                {accueil.gains.cartes.map((c, i) => (
                  <Card key={c.etat} style={styles.ledgerCard}>
                    <Overline>{t(c.libelleKey)}</Overline>
                    <Text style={i === 0 ? styles.ledgerMoney : styles.ledgerMoneyDeep}>{formatFcfa(c.netFcfa)}</Text>
                    <Text style={styles.ledgerCardSub}>
                      {c.compteN === undefined ? t(c.compteKey) : tf(c.compteKey, { n: c.compteN })}
                    </Text>
                  </Card>
                ))}
              </View>
            ) : (
              <Card style={styles.ledgerSilence}>
                <Text style={styles.cardTitle}>{t(accueil.gains.titreKey)}</Text>
                {/* ACCESS-GATE-1 — no button to a code door, because there is
                    no code door inside the app any more. The sentence is the
                    whole card. */}
                <Text style={styles.ledgerCardSub}>{t(accueil.gains.texteKey)}</Text>
              </Card>
            )}

            {/* Primary CTA (founder, 2026-08-17: « the end is cut … remove the
                little cube »). The label now stands alone in a padded, centred
                box — the kit's own button geometry — so a long French sentence
                wraps inside the button instead of running past its edge. */}
            <Pressable style={({ pressed }) => [styles.sparkleCta, pressed && styles.pressed]} onPress={() => go('opportunites')} accessibilityRole="button">
              <Text style={styles.sparkleCtaText}>{t('accueil.cta_trouver')}</Text>
            </Pressable>

            {/* Section head — « Ventes en cours » caps + « Tout voir » pill */}
            <View style={styles.homeSectionHead}>
              <Overline>{t('accueil.ventes_en_cours')}</Overline>
              <Pressable style={({ pressed }) => [styles.toutVoirPill, pressed && styles.pressed]} onPress={() => go('ventes')} accessibilityRole="button">
                <Text style={styles.toutVoirText}>{t('accueil.tout_voir')}</Text>
              </Pressable>
            </View>

            {/* ACCUEIL-HONESTY-1 — HER sales, or the feed's own honest sentence.
                These rows used to come from `ventesListModel()` over DEMO_SALES
                and named customers who are not hers. A reseller surface has
                never seen a buyer's name and does not start now (SP-I03), so
                the row is net-first with its state chip — the same shape « Mes
                ventes » paints, because it is the same row. */}
            {accueil.apercuEtatKey !== undefined ? (
              <EmptyState
                glyph={<IconVitrine size={dimension.iconSizePx.emptyState} color={sharedColour.sub} />}
                title={t(accueil.apercuEtatKey)}
                {...(accueil.apercuHintKey === undefined ? {} : { hint: t(accueil.apercuHintKey) })}
              />
            ) : (
              <View style={styles.homeSalesList}>
                {accueil.apercu.map((ligne) => (
                  <Pressable key={ligne.orderId} style={({ pressed }) => [styles.homeSaleRow, pressed && styles.pressed]} onPress={() => go('ventes')} accessibilityRole="button">
                    <View style={styles.artTile}>
                      <View style={styles.artTileStripe} />
                    </View>
                    <View style={styles.homeSaleBody}>
                      <Text style={styles.homeSaleTitle} numberOfLines={1}>
                        {tf('ventes.net_ligne', { amount: formatFcfa(ligne.netFcfa) })}
                      </Text>
                    </View>
                    <StatusChip tone="ink" label={t(ligne.etatKey)} />
                  </Pressable>
                ))}
                <Text style={styles.noteLine}>{t('accueil.apercu_suite')}</Text>
              </View>
            )}

            {/* Astuce — the rose tip card (net before you share) */}
            <View style={styles.astuceCard}>
              <Text style={styles.astuceText}>{t('accueil.astuce')}</Text>
            </View>
            {/* D2 — C-CE23 « Mon Cercle » (second, contextual entry — the dock
                tab stays the canonical one). ACCUEIL-PRO: the sub-line carries
                NO figures — the demo world's « 214 membres · campagne … » was
                a fake count on the real home screen. The invitation is the
                whole line until SP9 makes a real one possible. */}
            <CercleAccueilCard onPress={() => go('cercle')} />
          </ScrollView>
        )}

        {screen === 'opportunites' && (
          /**
           * RESELLER-UX-5 — THE STAGGERED GRID (founder correction 2026-08-03:
           * « on the reference the products card are NOT aligned horizontally at
           * the same level, make opportunité the same thing as well »).
           *
           * WHAT THIS REPLACES, and why the replacement had to be structural:
           * this was a `FlatList numColumns={2}`, which lays out in ROWS — every
           * row is a flex row whose children stretch to the tallest, so the two
           * cards on a line ALWAYS started and ended together. No styling could
           * stagger that; rows are what FlatList's multi-column mode is.
           *
           * So the two columns now FLOW INDEPENDENTLY: each is its own stack, a
           * card sits directly under the card above it, and the columns drift
           * out of step exactly as his reference does.
           *
           * THE SPLIT IS ALTERNATING INDEX — evens left, odds right. Pure,
           * stable, and identical on every render (Loi 5: nothing ranked,
           * nothing measured, nothing clever). A shortest-column heuristic would
           * pack tighter and would also mean the same catalogue could land in a
           * different order on two phones, which is not a trade worth making.
           *
           * THE GHOST SPACER IS GONE, and its absence is the point: it existed
           * because an odd count left a lone tile stretching across a ROW. There
           * are no rows now — an odd count simply ends one column one card
           * earlier, which is what a staggered grid is supposed to look like.
           *
           * VIRTUALISATION, STATED HONESTLY: `ScrollView` renders every card,
           * where `FlatList` windowed them. That is the cost of independent
           * columns without a masonry dependency, and it is acceptable HERE and
           * NOW because this feed is one founder's catalogue — tens of products.
           * It is not acceptable at hundreds. THE THRESHOLD IS NAMED so it is a
           * decision and not a surprise: past ~100 offers this needs a windowed
           * masonry, and the first sign will be a slow first paint on a 1GB
           * Android, not a crash.
           */
          <ScrollView
            style={styles.screenScroll}
            // RESELLER-UX-4 — its OWN container, deliberately not the shared
            // `scrollList`: three other screens use that one, and widening them
            // all to serve this order would be a change he did not ask for.
            contentContainerStyle={styles.oppGrid}
            showsVerticalScrollIndicator={false}
          >
            {/* Frame L113–114 — the big screen title (Bricolage 800/28) lands
                in-content; the net-first selling subtitle sits under it. */}
            <View style={styles.oppHead}>
              <Text style={styles.screenTitle}>{t('opportunites.title')}</Text>
              <Text style={styles.oppSub}>{t('opportunites.sous_titre')}</Text>
            </View>
            {/* THE HONEST EMPTY STATE — shown while loading resolves to nothing,
                when nothing is published, and when the wire is unconfigured or
                unreachable. Deliberately ONE state for all of them: the reseller
                gets an honest screen, never a diagnosis. The WHY is operator-
                facing and lives on the service's `diagnostic`, which this app
                never reads. */}
            {offers.length === 0 ? (
              feed === undefined ? null : (
                <EmptyState
                  glyph={<IconProduits size={dimension.iconSizePx.emptyState} color={sharedColour.sub} />}
                  title={t('opportunites.vide')}
                  hint=""
                />
              )
            ) : (
              <View style={styles.oppColumns}>
                {([0, 1] as const).map((col) => (
                  <View key={col} style={styles.oppColumn}>
                    {offers.filter((_, i) => i % 2 === col).map((item) => (
                      // §4 L70 — a tappable product TILE → its FICHE (journey edge
                      // opportunites→fiche). RESELLER-UX-3 (founder reference): the
                      // marketplace tile — SQUARE photo edge-to-edge on top (cover; a
                      // square frame barely trims, which is why the reference looks
                      // professional), then the compact detail: 2-line name, « Gagnez ≈
                      // {net} net » as the price position (NET FIRST in render order —
                      // SP-I04/I12; gross never), the base as the quiet metadata line,
                      // the source pill and the honest épuisé chip. The estimate reads
                      // at the default markup (0 — founder override), same figure the
                      // fiche opens on.
                      <Pressable
                        key={item.productVersionId}
                        style={({ pressed }) => [styles.oppTile, pressed && styles.pressed]}
                        onPress={() => { setFicheId(item.productVersionId); setFicheHeroIdx(0); go('fiche'); }}
                        accessibilityRole="button"
                      >
                        {/* CADRE (founder order: « Drop the square rule ») — the frame
                            takes THIS photograph's proportions, bounded by cadreRatio.
                            Unmeasured ⇒ the neutral square, so nothing jumps on first
                            paint; measured ⇒ tall stays tall, and it is this per-product
                            height that finally makes the two columns fall out of step. */}
                        <View style={[styles.oppTileArt, { aspectRatio: cadres[item.productVersionId] ?? CADRE_DEFAUT }]}>
                          {/* RESELLER-PHOTOS-1 — the REAL photograph when the wire carries
                              one (absolute URL, absolutized server-side with the same base
                              as the buyer wire). No ref ⇒ the designed glyph tile. */}
                          {/* VIDEO-PARTOUT — a clip PLAYS here when the product has one
                              (muted, looping, the photograph underneath as the resting
                              state); no clip ⇒ ProductClip renders the photo alone, so
                              this branch reads exactly as it did before. */}
                          {item.assetRefs[0] || item.videoRef ? (
                            <ProductClip
                              videoRef={item.videoRef}
                              photoUri={item.assetRefs[0]}
                              style={styles.artPhoto}
                              onAspect={(w, h) => {
                                const ratio = cadreRatio(w, h);
                                // Written ONCE per product: `onLoad` can fire again on
                                // re-mount, and a state write on every fire would
                                // re-render the whole grid for an identical value.
                                setCadres((prev) => (prev[item.productVersionId] === ratio ? prev : { ...prev, [item.productVersionId]: ratio }));
                              }}
                            />
                          ) : (
                            <>
                              <View style={styles.artTileStripe} />
                              <Text style={styles.ficheHeroGlyph}>{item.productName.slice(0, 1)}</Text>
                            </>
                          )}
                        </View>
                        <View style={styles.oppCardBody}>
                          <Text style={styles.oppTileName} numberOfLines={2}>{item.productName}</Text>
                          {/* NET FIRST, in RENDER ORDER (SP-I04/I12): gagnez holds the
                              tile's price position; the base is the metadata whisper. */}
                          <Text style={styles.oppNet}>{tf('opportunity.gagnez', { amount: formatFcfa(viewOfOffer(item).net) })}</Text>
                          <View style={styles.margeHeadRow}>
                            <Overline>{t('fiche.prix_base')}</Overline>
                            <Text style={styles.oppTileBase}>{formatFcfa(item.basePrice)}</Text>
                          </View>
                          {/* THE SOURCE MARK (founder ruling) — a PROVENANCE mark, not a
                              location: boutik strips zone deliberately (supplier-
                              identifying). Same pill family as « livré par Séra »,
                              deliberately quieter than « Vérifiée ». CONSTANT, never data.
                              HARD GATE: a second supplier makes this line a LIE. */}
                          <View style={styles.oppSourcePill}>
                            <Text style={styles.oppSourcePillText}>{t('opportunites.source')}</Text>
                          </View>
                          {/* Honest stock: a zero-stock offer says so on the tile, before
                              she invests a tap (the wire's `available`, stated not styled). */}
                          {item.available === 0 && <StatusChip tone="muted" label={t('opportunites.epuise')} />}
                          {/* DÉJÀ-DANS-MA-VITRINE — said on the TILE, before she spends
                              a tap on a fiche that can only tell her the same thing.
                              Same chip family as « épuisé »: a fact about this product,
                              stated rather than styled. */}
                          {dejaDansVitrine(item.productVersionId) && (
                            <StatusChip tone="ok" label={t('opportunites.deja')} />
                          )}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}

        {/* FICHE (frame 03 / HANDOFF §4 L72, RE-SCOPED add-only per founder redirect):
            art héro 170 · titre 24 · identity note · protections chips · sticky CTA
            « Ajouter à ma vitrine ». The marge CARD + slider + waterfall lines are
            REMOVED — the markup now lives on Ma Vitrine (per product). Money here is
            ONE display-only line « Gagnez ≈ {net} net » at the default markup, same
            as the Opportunités row (net-first; gross never shown). Diaspora/PackLab
            special cards are gated (Law #8) — omitted pending an explicit override. */}
        {/* BROWSE-SUPPLY-1 — the fiche now opens from a LIVE offer, because
            Opportunités is live and a tap that led nowhere would be a dead end. The
            layout is unchanged; only its source is. `ficheId` is now a
            productVersionId (canon), never a seed id.
            NAMED BOUNDARY, NOT FIXED HERE: « Ajouter à ma vitrine » still writes into
            `vitrineCol`, whose grid reads the DEMO world — so adding a live offer
            would not appear on Ma Vitrine. That is the LISTING half (the next slice),
            and until it lands the CTA is disabled with the honest reason rather than
            silently succeeding — the fabricated-success shape refused everywhere else. */}
        {screen === 'fiche' && ficheOffer !== undefined &&
          ((opp: Offer) => {
            // (`const already = false` lived here — a hardcoded « not already
            // added » flag nobody read, inside the very block whose subject is
            // now already-added. `dejaDansVitrine` answers that question for
            // real; a dead one beside it would only mislead. Verifier minor.)
            return (
              <ScrollView
              ref={ficheScroll}
              style={styles.screenScroll}
              contentContainerStyle={styles.scrollBody}
              showsVerticalScrollIndicator={false}
              // CLAVIER-MARGE — iOS insets this scroll by the keypad and brings the
              // FOCUSED field into view; the money card sits mid-scroll, so scrolling
              // to the end would not have found it.
              automaticallyAdjustKeyboardInsets
              // …and her NEXT tap lands on « Ajouter à ma vitrine » instead of being
              // spent dismissing the keypad.
              keyboardShouldPersistTaps="handled"
            >
                {/* the vérifié badge language (§4 L72 tier pill) */}
                <View style={styles.ficheTierRow}>
                  <StatusChip tone="ok" label={t('fiche.tier')} />
                </View>
                {/* RESELLER-UX-3 — the PRODUCT-PAGE héro (founder reference): a
                    SQUARE cover photograph (the frame shape that barely trims),
                    the thumbnail strip under it switching the héro, and a tap on
                    the héro opening the gallery ON that capture. Sans photo, the
                    duotone banner and no affordance. */}
                {/* VIDEO-FICHE-1 (founder-found, 2026-08-05: « The product video is
                    not playing in this screen »). The clip played on the opportunités
                    GRID and on Ma Vitrine, but this page — the one she actually reads
                    before deciding — rendered a bare <Image>. It was simply never
                    wired; ProductClip has always taken both and needs no branch.

                    THE CLIP RIDES THE COVER ONLY, and that is the whole rule. There is
                    ONE clip per product and it is not one of the captures, so it
                    belongs on the capture the grid also shows — index 0. Tapping
                    thumbnail 3 is an explicit request to look at THAT photograph, and a
                    video covering it (ProductClip fills over the photo) would make her
                    own tap look broken. Back on the first thumbnail, the clip returns. */}
                {opp.assetRefs.length > 0 || (opp.videoRef !== undefined && opp.videoRef !== '') ? (
                  <>
                    <Pressable
                      style={({ pressed }) => [styles.ficheHero, pressed && styles.pressed]}
                      onPress={() => {
                        // NEVER A DEAD TAP: a clip-only product has no gallery to open,
                        // so the press does nothing and says so by doing nothing —
                        // rather than opening an empty viewer.
                        if (opp.assetRefs.length === 0) return;
                        setGallery({ name: opp.productName, refs: opp.assetRefs, startAt: ficheHeroIdx });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('galerie.ouvrir')}
                    >
                      <ProductClip
                        videoRef={ficheHeroIdx === 0 ? opp.videoRef : undefined}
                        photoUri={opp.assetRefs[Math.min(ficheHeroIdx, opp.assetRefs.length - 1)]}
                        style={styles.artPhoto}
                      />
                    </Pressable>
                    {opp.assetRefs.length > 1 && (
                      <View style={styles.thumbRow}>
                        {opp.assetRefs.map((ref, i) => (
                          <Pressable
                            key={`${i}-${ref}`}
                            style={[styles.thumb, i === Math.min(ficheHeroIdx, opp.assetRefs.length - 1) && styles.thumbOn]}
                            onPress={() => setFicheHeroIdx(i)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: i === Math.min(ficheHeroIdx, opp.assetRefs.length - 1) }}
                            accessibilityLabel={t('galerie.ouvrir')}
                          >
                            {/* VIGNETTE — the 52 px strip asks for the SMALL copy.
                                The hero above it does NOT: it renders at full card
                                width, where 320 px would look soft. And the SELECTED
                                thumbnail asks for nothing either — it is the same
                                photograph the hero is already showing, and a second
                                uri for it would fetch that file twice. */}
                            <Image
                              source={{ uri: vignetteSaufHero(ref, i, Math.min(ficheHeroIdx, opp.assetRefs.length - 1)) }}
                              style={styles.artPhoto}
                              resizeMode="cover"
                            />
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.ficheHero}>
                    <View style={styles.artTileStripe} />
                    <Text style={styles.ficheHeroGlyph}>{opp.productName.slice(0, 1)}</Text>
                  </View>
                )}
                {/* titre 24 + identity note — the vendor stays hidden */}
                <Text style={styles.ficheTitle}>{opp.productName}</Text>
                <Text style={styles.ficheIdentity}>{t('fiche.identity_note')}</Text>
                {/* RESELLER-UX-1 item 2 — THE MONEY, STRUCTURED (founder walk: base
                    price visible, less confusing). NET FIRST — her gain stays the
                    loudest figure on the screen (SP-I04/I12; gross never shown) —
                    then ONE card with the three lines she reasons over, each named:
                    what it costs (Prix de base), what she adds (the typable control),
                    what the cliente pays (Prix cliente, live). Cause and effect in
                    three labelled rows instead of one floating estimate. */}
                {/* THE ESTIMATE AND THE MARGE ROWS ARE A QUOTE FOR ADDING — they
                    belong to a product she has NOT added yet, and on a product she
                    HAS they would be a claim about a live listing this app cannot
                    make (verifier BLOCKER).

                    Every one of these figures comes from `markups[pid] ??
                    defaultMarkup(cap)` — REACT STATE, which dies with the session —
                    while the signed marge lives in the listing and is never read
                    back. Session 1 she types 2 000 and publishes: the service signs
                    a cliente price of 12 000. Session 2, same fiche: the app has
                    forgotten, renders the default 0, and would print « Prix cliente
                    10 000 » and a net a third of the truth — DIRECTLY UNDER a
                    sentence asserting the listing exists. Law 1, « every quote
                    reconciling to the franc », and the trust test both fail there.

                    So on an added product the fiche states the ONE figure it can
                    vouch for — the base price — and sends her to Ma Vitrine for her
                    own terms. Silence beats a confident wrong number.

                    (The real remedy is to READ her signed marge: the service already
                    exposes `GET /listings/by-pid/{sfId}/{pid}` behind the key this
                    app holds. That is a port this slice did not add — journalled,
                    and it belongs with the founder's re-price decision.) */}
                {/* THE NOT-ADDED BRANCH IS WRITTEN FIRST, and that is load-bearing:
                    `publish-listing.test.ts` pins SP-I04 by SOURCE ORDER over the
                    fiche region — « gagnez » must precede « prix de base » must
                    precede « prix cliente ». Putting the déjà card first moved a
                    `prix_base` above `gagnez` and turned that pin red. The pin was
                    right and the layout was wrong way round; net stays first. */}
                {!dejaDansVitrine(opp.productVersionId) ? (
                  <>
                    <Text style={styles.ficheGagnez}>{tf('opportunity.gagnez', { amount: formatFcfa(viewOfOffer(opp).net) })}</Text>
                    <Card style={styles.ficheMoneyCard}>
                      <View style={styles.margeHeadRow}>
                        <Overline>{t('fiche.prix_base')}</Overline>
                        <Text style={styles.margeAmount}>{formatFcfa(opp.basePrice)}</Text>
                      </View>
                      <MarkupControl
                        onFocusField={leverFiche}
                        value={viewOfOffer(opp).markup}
                        cap={viewOfOffer(opp).cap}
                        onChange={(m) => setMarkups((prev) => ({ ...prev, [opp.productVersionId]: m }))}
                      />
                      <View style={styles.margeHeadRow}>
                        <Overline>{t('fiche.prix_cliente')}</Overline>
                        <Text style={styles.margeAmount}>{formatFcfa(viewOfOffer(opp).client)}</Text>
                      </View>
                    </Card>
                  </>
                ) : (
                  <Card style={styles.ficheMoneyCard}>
                    <View style={styles.margeHeadRow}>
                      <Overline>{t('fiche.prix_base')}</Overline>
                      <Text style={styles.margeAmount}>{formatFcfa(opp.basePrice)}</Text>
                    </View>
                  </Card>
                )}
                {/* protections chips — the trust affordances */}
                <View style={styles.ficheChips}>
                  <StatusChip tone="muted" label={t('fiche.chip_inspection')} />
                  <StatusChip tone="muted" label={t('fiche.chip_refus')} />
                </View>
                {/* DÉJÀ-DANS-MA-VITRINE — the fiche of a product she already has
                    offers the way IN, never a second add. The state is said first
                    (« c'est déjà à vous »), then the one action that is true here:
                    go and see it. Same rule as everywhere on this app — one primary
                    action per screen, and it must be one that can succeed. */}
                {dejaDansVitrine(opp.productVersionId) ? (
                  <>
                    <Text style={styles.noteLine}>{t('fiche.deja')}</Text>
                    <PrimaryButton label={t('fiche.cta_voir')} onPress={() => toHub('vitrine')} />
                  </>
                ) : (
                  <>
                    <PrimaryButton
                      label={t('fiche.cta')}
                      // ONE HONEST GATE (RESELLER-UX-2, founder walk item 2 — « the
                      // button was dead on arrival »): no seam ⇒ no write is possible,
                      // so the button must not pretend. The old second gate (slider
                      // untouched) is retired WITH its reason: the default it guarded
                      // against is now 0, so an on-arrival publish signs the lowest
                      // cliente price and pays her the commission net — a safe act.
                      disabled={service === null || publishing}
                      onPress={() => void publishListing(opp)}
                    />
                    {/* The reason the button is asleep, stated plainly — never a dead
                        control the user has to guess about. */}
                    {service === null ? (
                      <Text style={styles.noteLine}>{t('fiche.cta_non_relie')}</Text>
                    ) : null}
                    {/* PAS-DE-BOUTIQUE — the same pattern, for the refusal the
                        service just gave: why the add cannot land yet, and the
                        step that is hers, PERSISTENT under the button she
                        pressed. The CTA stays pressable on purpose — once her
                        boutique exists the same tap succeeds and clears this. */}
                    {sansBoutique ? (
                      <Text style={styles.noteLine}>{t('fiche.publier.pas_de_boutique')}</Text>
                    ) : null}
                  </>
                )}
              </ScrollView>
            );
          })(ficheOffer)}

        {/* MA VITRINE (frame L239–267): title « Ma vitrine » 28/800 + name + vérifié,
            the œil → aperçu-cliente, the Privée/Publique toggle (the seam's
            `setDiscoverable` + the verbatim toasts), and the product grid read from
            the seam's live listings (`vitrineCol.listings()`). Each tile carries the
            client price (deep) and her net (small) — never a vendor. Empty is a
            designed state: the vitrine waits, with a way back to the opportunities. */}
        {screen === 'vitrine' && (
          vitrineOffers.length === 0 ? (
            <ScrollView style={styles.screenScroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
              <View style={styles.vitrineHead}>
                <Text style={styles.screenTitle}>{t('vitrine.title')}</Text>
                {/* ACCUEIL-PRO — HER shop name (never the demo's), the vérifié
                    mark only when the shop is live. No shop resolved: no row. */}
                {liveStorefront !== null && liveStorefront !== undefined ? (
                  <View style={styles.homeSubRow}>
                    <Text style={styles.homeSubName} numberOfLines={1}>{liveStorefront.name}</Text>
                    {liveShop !== null && liveShop !== undefined ? (
                      <IconCoche size={dimension.iconSizePx.badge} color={shopColour.primary} />
                    ) : null}
                  </View>
                ) : null}
              </View>
              <Text style={styles.noteLine}>{t('vitrine.sous_titre')}</Text>
              <EmptyState
                glyph={<IconVitrine size={dimension.iconSizePx.emptyState} color={sharedColour.sub} />}
                title={t('vitrine.vide')}
              />
              {/* PAS-DE-BOUTIQUE (founder screenshot, 2026-08-13) — the same door
                  the non-empty header carries, because the reseller who NEEDS the
                  mise-en-ligne screen is precisely the one with no shop and no
                  products: the add refuses `storefront_absent` and the sentence
                  it shows points HERE. Until this, the empty branch offered only
                  the way back to Opportunités — an instruction naming a door
                  that did not exist. Same control, same label (`k.entree`), one
                  door one sentence. It comes FIRST (verifier minor):
                  for the reseller with no shop, creating the boutique is the
                  step everything else waits on, and it is the door the
                  refusal names. */}
              <Pressable
                style={({ pressed }) => [styles.vitrinePersoBtn, pressed && styles.pressed]}
                onPress={() => go('personnaliser')}
                accessibilityRole="button"
                accessibilityLabel={t('k.entree')}
              >
                <IconVitrine size={dimension.iconSizePx.badge} color={shopColour.deep} />
                <Text style={styles.vitrinePersoLabel}>{t('k.entree')}</Text>
              </Pressable>
              <SecondaryButton label={t('accueil.cta_trouver')} onPress={() => toHub('opportunites')} />
            </ScrollView>
          ) : (
            <FlatList
              ref={vitrineListe}
              style={styles.screenScroll}
              data={vitrineOffers}
              keyExtractor={(o) => o.productVersionId}
              initialNumToRender={6}
              windowSize={5}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollList}
              // CLAVIER-MARGE — Ma Vitrine's cards are a LIST, not the sibling
              // ScrollView above, and each card now carries the markup field.
              // FlatList forwards both of these to its own scroll surface.
              automaticallyAdjustKeyboardInsets
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <View style={styles.scrollHead}>
                  <View style={styles.vitrineHeadRow}>
                    <View style={styles.vitrineHead}>
                      <Text style={styles.screenTitle}>{t('vitrine.title')}</Text>
                      {/* ACCUEIL-PRO — same law as the empty branch above. */}
                      {liveStorefront !== null && liveStorefront !== undefined ? (
                        <View style={styles.homeSubRow}>
                          <Text style={styles.homeSubName} numberOfLines={1}>{liveStorefront.name}</Text>
                          {liveShop !== null && liveShop !== undefined ? (
                            <IconCoche size={dimension.iconSizePx.badge} color={shopColour.primary} />
                          ) : null}
                        </View>
                      ) : null}
                    </View>
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
                  {/* PERSONNALISER-LISIBLE (founder orders 2026-08-03: « make the
                      personnaliser button more understandable and professional
                      instead of just Aa », then « put 'personnaliser ma boutique'
                      instead of just personnaliser »).

                      IT MOVED OUT OF THE HEADER ROW to carry his full sentence.
                      « Personnaliser ma boutique » beside the public/private
                      toggle on a narrow phone truncates — and a label that
                      ellipsises is the 5-second failure « Aa » already was, in a
                      longer form. Full width, one line, no competition.

                      The string is `k.entree`, the name the screen reader has
                      always spoken for this door: one door, one sentence. */}
                  <Pressable
                    style={({ pressed }) => [styles.vitrinePersoBtn, pressed && styles.pressed]}
                    onPress={() => go('personnaliser')}
                    accessibilityRole="button"
                    accessibilityLabel={t('k.entree')}
                  >
                    <IconVitrine size={dimension.iconSizePx.badge} color={shopColour.deep} />
                    <Text style={styles.vitrinePersoLabel}>{t('k.entree')}</Text>
                  </Pressable>
                  <Text style={styles.noteLine}>{t('vitrine.sous_titre')}</Text>
                </View>
              }
              renderItem={({ item }) => {
                // Per-product card (founder recomposition of the planche read-only
                // grid): art 110 · client price (deep) ↔ net (small, live) · the
                // marge SLIDER (0→cap, pas 100 → live net/client via marginBreakdown,
                // reseller-margin only) · a per-product « Partager ». Net-first: the
                // reseller sees her net beside the client price; gross is never shown.
                // PUBLISH-PRICE-1 — the card now reads the LIVE offer under the SAME
                // key the fiche and the signed price use. `item.id`/`item.name` were
                // demo-world fields, and keying the slider on `item.id` is exactly why
                // the control never reached a live offer.
                const v = viewOfOffer(item);
                const markup = v.markup;
                // VOIX-CARTE — which state the card's voice block draws. A note
                // in hand (recorded | pending | ready) gets the player row; the
                // no-note states keep the plain invitation strip unchanged.
                const noteVocale = noteOf(voice.notes, item.productVersionId);
                const noteEnMain =
                  noteVocale.status === 'recorded' || noteVocale.status === 'pending' || noteVocale.status === 'ready';
                return (
                  <Card style={styles.vitrineCard}>
                    {/* RESELLER-UX-3 — the PRODUCT-PAGE treatment on HER card
                        (founder reference): a SQUARE cover photograph, and the
                        thumbnail strip under it — each capture visible, each a
                        tap into the gallery ON that photo. Sans photo, the
                        duotone tile and no affordance. */}
                    {item.assetRefs.length > 0 ? (
                      <>
                        <Pressable
                          style={({ pressed }) => [styles.vitrineCardArt, pressed && styles.pressed]}
                          onPress={() => setGallery({ name: item.productName, refs: item.assetRefs })}
                          accessibilityRole="button"
                          accessibilityLabel={t('galerie.ouvrir')}
                        >
                          <ProductClip videoRef={item.videoRef} photoUri={item.assetRefs[0]} style={styles.artPhoto} />
                        </Pressable>
                        {item.assetRefs.length > 1 && (
                          <View style={styles.thumbRow}>
                            {item.assetRefs.map((ref, i) => (
                              <Pressable
                                key={`${i}-${ref}`}
                                style={styles.thumb}
                                onPress={() => setGallery({ name: item.productName, refs: item.assetRefs, startAt: i })}
                                accessibilityRole="button"
                                accessibilityLabel={t('galerie.ouvrir')}
                              >
                                {/* VIGNETTE — same rule as the fiche strip: small
                                    render, small file; the card hero stays full. Here
                                    the hero is always capture 0 (this strip does not
                                    switch it), so index 0 re-uses the hero's file. */}
                                <Image
                                  source={{ uri: vignetteSaufHero(ref, i, 0) }}
                                  style={styles.artPhoto}
                                  resizeMode="cover"
                                />
                              </Pressable>
                            ))}
                          </View>
                        )}
                      </>
                    ) : (
                      <View style={styles.vitrineCardArt}>
                        <View style={styles.artTileStripe} />
                        <Text style={styles.vitrineCardGlyph}>{item.productName.slice(0, 1)}</Text>
                      </View>
                    )}
                    <Text style={styles.tileName} numberOfLines={2}>{item.productName}</Text>
                    {/* NET-FIRST hero — her gain is the biggest, deepest figure on
                        HER vitrine (SP-I04/I12). RESELLER-UX-2 item 3 (founder walk:
                        « the base amount, the gain and everything else »): under it,
                        the SAME three named money rows the fiche reasons over —
                        Prix de base · Marge · Prix cliente — so the two screens
                        speak one vocabulary and neither leaves her guessing. */}
                    <Overline>{t('opportunity.net_label')}</Overline>
                    <Text style={styles.vitrineNetHero}>{formatFcfa(v.net)}</Text>
                    <View style={styles.margeHeadRow}>
                      <Overline>{t('fiche.prix_base')}</Overline>
                      <Text style={styles.margeAmount}>{formatFcfa(item.basePrice)}</Text>
                    </View>
                    {/* MARGE-EXACTE — the SAME control as the fiche, not a
                        read-only row plus a slider underneath it. She sets the
                        figure where she reads it, and « Prix cliente » below is
                        the arithmetic answering her in place. */}
                    <MarkupControl
                      onFocusField={leverVitrine}
                      value={markup}
                      cap={v.cap}
                      onChange={(m) => setMarkups((prev) => ({ ...prev, [item.productVersionId]: m }))}
                    />
                    <View style={styles.margeHeadRow}>
                      <Overline>{t('fiche.prix_cliente')}</Overline>
                      <Text style={styles.margeAmount}>{formatFcfa(v.client)}</Text>
                    </View>
                    {/* Note vocale — the mic lives WITH the product (founder Option A);
                        tapping opens the record sheet for THIS article. */}
                    {/* VOIX-VISIBLE (founder 2026-08-04: « I was talking about
                        the "ajouter une note vocale" on the product card … make
                        it be more visible, nice and professional on both sides »).

                        IT WAS A BARE TEXT LINK — a small magenta line with a mic
                        beside it, sitting under the price rows with no surface of
                        its own. Next to a full-width « Partager » button it read
                        as fine print, which is the wrong weight for the one act
                        that makes her shop sound like a person.

                        It is a real card now: tinted panel, the mic in a filled
                        disc, the state sentence on top and a second line saying
                        what it is for. The STATE SENTENCE IS UNCHANGED —
                        `voiceCardLabel` still decides between « ajouter »,
                        « à publier » and « en attente », so the card never
                        claims more than the note actually is. */}
                    <Pressable
                      style={({ pressed }) => [styles.vitrineVoiceBtn, pressed && styles.pressed]}
                      onPress={() => setVoiceSheet({ pid: item.productVersionId, name: item.productName })}
                      accessibilityRole="button"
                      accessibilityLabel={t('k.voix.note_produit')}
                    >
                      <View style={styles.vitrineVoiceDisc}>
                        <IconVoix size={dimension.iconSizePx.badge} color={shopColour.onPrimary} />
                      </View>
                      <View style={styles.vitrineVoiceTexte}>
                        <Text style={styles.vitrineVoiceLabel}>{voiceCardLabel(voice.notes[item.productVersionId])}</Text>
                        {/* VOIX-CARTE — « Parlez de ce produit à vos clientes »
                            is the INVITATION to add a note; under a note that
                            already exists it is a wrong invitation, and the
                            player row below carries the real acts instead. */}
                        {!noteEnMain && <Text style={styles.vitrineVoiceSous}>{t('k.voix.carte_sous')}</Text>}
                      </View>
                    </Pressable>
                    {/* VOIX-CARTE (founder 2026-08-13) — play/pause + the clock
                        + « Refaire » at the row's end, ON the product. Refaire
                        opens the sheet AND starts the take — the sheet owns the
                        mic-permission banner, Annuler and the recording UI, so
                        a Refaire that only opened it would be a two-tap lie. */}
                    {noteEnMain && (
                      <VoiceCardRow
                        pid={item.productVersionId}
                        ctl={voice}
                        onRefaire={() => {
                          setVoiceSheet({ pid: item.productVersionId, name: item.productName });
                          voice.startRec(item.productVersionId);
                        }}
                      />
                    )}
                    <SecondaryButton
                      label={t('vitrine.partager')}
                      onPress={() => { setShareCampBadge(false); setShareId(item.productVersionId); go('lien'); }}
                    />
                    {/* VITRINE-RETRAIT — « Retirer de ma vitrine ». It WHISPERS
                        (§5: one primary action per screen; Partager is the loud
                        one on this card) and it is disabled while the service is
                        answering, so a second tap cannot fire a second removal.
                        It carries no confirmation step on purpose: putting the
                        product back is one tap from Opportunités, so a mistap
                        costs her a tap — not a confirmation dialog on every
                        card she ever tidies. */}
                    <Pressable
                      style={({ pressed }) => [styles.vitrineRetirer, pressed && styles.pressed]}
                      onPress={() => void retirerDeVitrine(item.productVersionId)}
                      disabled={retiring !== null}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: retiring !== null }}
                      accessibilityLabel={t('vitrine.retirer')}
                    >
                      <Text style={styles.vitrineRetirerLabel}>
                        {retiring === item.productVersionId ? t('vitrine.retirer_encours') : t('vitrine.retirer')}
                      </Text>
                    </Pressable>
                  </Card>
                );
              }}
            />
          )
        )}

        {/* PARTAGER-PRO (founder, 2026-08-15) — one product, three clear sections,
            every byte real: the cliente's card (her shop name, her price, today's
            date), ONE share action per thing she can share (the OS sheet carries
            WhatsApp/Facebook/copy itself), her boutique's permanent link, and the
            QR with a printable poster behind it. The Cercle campaign hand-off
            keeps its own card below — a gated demo surface, journalled. */}
        {screen === 'lien' && (
          <ScrollView style={styles.screenScroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* PRECEDENCE (verifier finding, fixed once): the campaign arm comes
                FIRST. The badge is the discriminator — every Cercle hand-off
                sets it true, the vitrine's Partager sets it false — but shareId
                is never cleared, so a product-first ternary would shadow the
                campaign card for anyone who ever shared a product. */}
            {campShare !== null ? (
              /* CERCLE'S CAMPAIGN CARD — the gated demo surface (SP9) sharing
                 its pack. It keeps its own preview and nothing of the real
                 sections below: mixing demo campaign money with her real links
                 on one screen is how a mock sneaks back. Journalled. */
              <Card>
                <Overline>{t('share.og_titre')}</Overline>
                <Text style={styles.cardTitle}>{cercleProduit(campShare.pid).name}</Text>
                <Text style={styles.shareHeroPrice}>
                  {tf('share.prix', { amount: formatFcfa(cercleProduit(campShare.pid).B + cercleProduit(campShare.pid).marge) })}
                </Text>
                <Text style={styles.campagneLigne}>
                  {campShare.K === 1000
                    ? tf('ce.d5_ligne_offerte', { zone: campShare.zone })
                    : tf('ce.d5_ligne', { part: formatFcfa(1000 - campShare.K), zone: campShare.zone })}
                </Text>
                <Text style={styles.netCarte}>
                  {tf('ce.d5_net_carte', { amount: formatFcfa(cercleProduit(campShare.pid).netNormal - campShare.K) })}
                </Text>
                <View style={styles.ogBadgeRow}>
                  <StatusChip tone="ok" label={t('share.livre_sera')} />
                </View>
              </Card>
            ) : partage !== null ? (
              <>
                {/* the client PREVIEW — what she is about to send, exactly. HER
                    shop name, HER price, today's date. Never the net, never a
                    commission, never the supplier (SP-I03). */}
                <Card>
                  <Overline>{t('share.og_titre')}</Overline>
                  <View style={styles.shareHero}>
                    <View style={styles.artTileStripe} />
                    {partage.offre.assetRefs[0] ? (
                      <Image source={{ uri: partage.offre.assetRefs[0] }} style={styles.artPhoto} resizeMode="cover" />
                    ) : (
                      <Text style={styles.shareHeroGlyph}>{partage.offre.productName.slice(0, 1)}</Text>
                    )}
                  </View>
                  <View style={styles.shareShopRow}>
                    <Text style={styles.shareShopName} numberOfLines={1}>{partage.nomBoutique}</Text>
                    <IconCoche size={dimension.iconSizePx.badge} color={shopColour.primary} />
                  </View>
                  <Text style={styles.cardTitle}>{partage.offre.productName}</Text>
                  <Text style={styles.shareHeroPrice}>{tf('share.prix', { amount: formatFcfa(partage.vue.client) })}</Text>
                  {/* TODAY, because today is when she is sharing — the frozen
                      « Prix du 13 juillet » was the demo's clock, not hers. */}
                  <Text style={styles.ogValidite}>{tf('share.validite', { date: frenchDate(new Date().toISOString()) })}</Text>
                  <View style={styles.ogBadgeRow}>
                    <StatusChip tone="ok" label={t('share.livre_sera')} />
                  </View>
                  <Text style={styles.ogSigned}>{t('share.og_signe')}</Text>
                </Card>

                {/* reseller-only: her net — « jamais visible par la cliente » */}
                <Text style={styles.netCarte}>{tf('partager.net_carte', { amount: formatFcfa(partage.vue.net) })}</Text>

                {/* ONE action for the product. The OS sheet owns the channels. */}
                <PrimaryButton label={t('partager.action_produit')} onPress={() => { void partagerProduit(); }} />
                <Card>
                  <View style={styles.linkBox}>
                    <Text style={styles.linkText}>{partage.lienProduit}</Text>
                  </View>
                  <Text style={styles.message}>{t('lien.explication')}</Text>
                </Card>

                {/* HER BOUTIQUE — the durable link: every product, one address,
                    never changes. Its own section, its own ONE action. */}
                <Card>
                  <Overline>{t('partager.boutique_titre')}</Overline>
                  <Text style={styles.message}>{t('share.bio')}</Text>
                  <View style={styles.linkBox}>
                    <Text style={styles.linkText}>{partage.lienBoutique}</Text>
                  </View>
                  <SecondaryButton label={t('partager.action_boutique')} onPress={() => { void partagerBoutique(); }} />
                </Card>

                {/* THE QR — scanned in person, or PRINTED. The poster opens in
                    the browser: its print dialog reaches a real printer AND
                    saves the PDF a print kiosk asks for. */}
                <Card>
                  <Overline>{t('share.qr_titre')}</Overline>
                  <Text style={styles.message}>{t('share.qr_blurb')}</Text>
                  <View style={styles.qrFrame}>
                    <QrCode url={partage.lienBoutique} />
                  </View>
                  <View style={styles.qrCaption}>
                    <Text style={styles.qrLegende}>{t('share.qr_legende')}</Text>
                    <Text style={styles.codeStrong}>{partage.codeDit}</Text>
                    <Text style={styles.qrRepli}>{tf('share.qr_repli', { code: partage.codeDit })}</Text>
                  </View>
                  <SecondaryButton label={t('share.qr_imprimer')} onPress={imprimerQr} />
                </Card>
              </>
            ) : (
              /* NO LIVE PRODUCT AND NO SHOP — the honest guard. A screen that
                 invented a link here would print a stranger's demo shop, which
                 is exactly what the founder once saw. */
              <Card>
                <Text style={styles.message}>{t('partager.indisponible')}</Text>
              </Card>
            )}
          </ScrollView>
        )}

        {/* SP6.1 — « MES GAINS » ON REAL DATA. This screen used to render
            `enAttenteNet()`, `payeSemaine()` and `gainsCards()` — all three
            from the DEMO model over DEMO_SALES, which meant it showed a « Payé
            cette semaine » figure on a platform where nothing has ever been
            paid out. Every figure below is a sum of nets copied from frozen
            quotes, sorted onto the eight settlement states of the plan by
            `gains-model.ts`, which cannot express a payout at all. */}
        {screen === 'gains' && (
          <ScrollView style={styles.screenScroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.screenTitle}>{t(ventesReelles.gains.titreKey)}</Text>
            {ventesReelles.gains.sousTitreKey !== undefined && (
              <Text style={styles.oppSub}>{t(ventesReelles.gains.sousTitreKey)}</Text>
            )}
            {/* GAINS-OPP-1 — the second line of the five non-ladder states.
                Removing the stray button left four of them (locked · refused ·
                not-yet-open · offline) as a bare title on an empty screen, and
                « Mes gains » alone tells her nothing about why nothing is
                there. Same words « Mes ventes » shows for the same states. */}
            {ventesReelles.gains.hintKey !== undefined && (
              <Text style={styles.noteLine}>{t(ventesReelles.gains.hintKey)}</Text>
            )}

            {ventesReelles.gains.noticeKeys.map((k) => (
              <Text key={k} style={styles.noteLine}>
                {ventesReelles.gains.noticeParams[k] === undefined ? t(k) : tf(k, ventesReelles.gains.noticeParams[k]!)}
              </Text>
            ))}

            {/* THE LADDER. Reachable rungs carry her net in the money face;
                the six that no fact can reach yet stay quiet and SAY so —
                never a 0 FCFA, which would read as « you earned nothing »
                rather than « this step does not exist yet ». */}
            {ventesReelles.gains.paliers.map((p) => (
              /* ONE HERO, AND IT IS « LOCKED » (§5: one primary thing per
                 screen, hierarchy ruthless). There is deliberately NO total on
                 this screen — a running total is what an ACCOUNT has, and Shop+
                 keeps none — so the hero is instead the one figure that is
                 unambiguously, settledly HERS: the net on
                 sales whose payment the provider confirmed. Projected is not
                 hers yet; the six dormant rungs hold nothing. The hero is
                 therefore a true number, not a composed one. */
              <Card
                key={p.etat}
                style={p.etat === 'Locked' ? styles.gainsHeroCard : p.enSommeil ? styles.gainsPalierSommeil : undefined}
              >
                {p.etat === 'Locked' ? (
                  <PendingHero label={t(p.titreKey)} amount={p.netFcfa} />
                ) : (
                  <>
                    <Overline>{t(p.titreKey)}</Overline>
                    {p.enSommeil ? (
                      <Text style={styles.gainsSommeilMontant}>{t('gains.pas_encore')}</Text>
                    ) : (
                      <Text style={styles.gainsMontant}>{formatFcfa(p.netFcfa)}</Text>
                    )}
                  </>
                )}
                <Text style={styles.gainsCompte}>
                  {p.compteN === undefined ? t(p.compteKey) : tf(p.compteKey, { n: p.compteN })}
                </Text>
                <Text style={styles.message}>{p.enSommeil ? t('gains.etape_absente') : t(p.texteKey)}</Text>
                {p.enSommeil && <Text style={styles.gainsCompte}>{t(p.texteKey)}</Text>}
              </Card>
            ))}

            {ventesReelles.gains.kind === 'hors_ligne' && (
              <SecondaryButton label={t('ventes.reel_chargement')} onPress={() => { void ventesReelles.recharger(); }} />
            )}
            {/* GAINS-OPP-1 (founder-found 2026-08-05: « When I tap on gains
                screen I see opportunité there »). A « Les opportunités » button
                used to sit here unconditionally — a NOUN, not an action, on the
                money screen, going somewhere the dock already reaches in one
                tap from this very screen (`gains` is in HUBS, so the TabBar is
                always on-screen here). Two routes to one place, and the nearer
                one is permanently visible: the button read as a stray piece of
                another screen, which is exactly how he read it.
                §5: one primary action per screen, secondary actions whisper —
                and « Mes gains » already has its one thing to say, the settled
                net in the hero. */}
          </ScrollView>
        )}

        {/* RF-1c — « MES VENTES » ON REAL DATA (founder order 2026-08-02).
            This screen used to render `ventesListModel()` — the DEMO model,
            whose hardcoded rows carry `en_route`, `livrée` and `problème`,
            states no part of this platform can prove. She was reading a
            delivery story nobody had verified. Every state below comes from
            `ecranDesVentes`, which is pure, exhaustively tested, and cannot
            express a delivery fact at all. */}
        {screen === 'ventes' && (
          ventesReelles.ecran.kind === 'liste' ? (
            <FlatList
              style={styles.screenScroll}
              data={ventesReelles.ecran.lignes}
              keyExtractor={(l) => l.orderId}
              initialNumToRender={6}
              windowSize={5}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollList}
              ListHeaderComponent={
                ventesReelles.ecran.noticeKeys.length === 0 ? null : (
                  <Card style={styles.problemeEncart}>
                    {ventesReelles.ecran.noticeKeys.map((k) => (
                      <Text key={k} style={styles.message}>{t(k)}</Text>
                    ))}
                  </Card>
                )
              }
              renderItem={({ item }) => (
                <View style={styles.venteRowGroup}>
                  <View style={styles.oppRow}>
                    <View style={styles.artTile}>
                      <View style={styles.artTileStripe} />
                    </View>
                    <View style={styles.homeSaleBody}>
                      {/* Net first, always (SP-I04/SP-I12). No buyer name: a
                          reseller surface has never seen one and does not
                          start now. */}
                      <Text style={styles.oppNet}>{tf('ventes.net_ligne', { amount: formatFcfa(item.netFcfa) })}</Text>
                    </View>
                    <StatusChip tone="ink" label={t(item.etatKey)} />
                  </View>
                </View>
              )}
              ListFooterComponent={<Text style={styles.noteLine}>{t('ventes.reel_suite')}</Text>}
            />
          ) : (
            <ScrollView style={styles.screenScroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
              <EmptyState
                glyph={<IconVitrine size={dimension.iconSizePx.emptyState} color={sharedColour.sub} />}
                title={t(ventesReelles.ecran.titreKey)}
                {...(ventesReelles.ecran.hintKey === undefined ? {} : { hint: t(ventesReelles.ecran.hintKey) })}
              />
              {ventesReelles.ecran.noticeKeys.map((k) => (
                <Text key={k} style={styles.noteLine}>{t(k)}</Text>
              ))}
              {ventesReelles.ecran.kind === 'hors_ligne' && (
                <SecondaryButton label={t('ventes.reel_chargement')} onPress={() => { void ventesReelles.recharger(); }} />
              )}
              {ventesReelles.ecran.kind === 'vide' && (
                <PrimaryButton label={t('ventes.vide_action')} onPress={() => go('vitrine')} />
              )}
            </ScrollView>
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
          <CustomizeStack
            onClose={back}
            onToast={setToast}
            onPublishOnline={publishOnline}
            onListStorefronts={listOnline}
            serviceUnconfigured={service === null}
            // PERSONNALISER-REAL-1 — HER shop, read back from the service, and the
            // save that persists every edit. A null read (not live yet) leaves the
            // screens on their local draft, which the K1 note states plainly.
            storefront={liveStorefront ?? undefined}
            onSaveIdentity={saveIdentity}
            savesPersist={liveStorefront !== null && liveStorefront !== undefined}
            // Her shop EXISTS (the admin list saw it) but its settings have not
            // loaded yet — a different sentence from « you are not online yet ».
            shopIsLive={liveShop !== null && liveShop !== undefined}
            // PERSONNALISER-MEDIA-1 — the real upload. Absent ⇒ the cover slot
            // stays inert rather than opening a picker that leads nowhere.
            onUploadCover={uploadCover}
            onUploadAvatar={uploadAvatar}
            // PERSONNALISER-PARITY-1 round 2 (verifier blocker B1) — the catalog
            // joins the SERVICE's curatedItems against the live offers. The first
            // version joined against `vitrineLive` — the SESSION-LOCAL event log,
            // initialized empty on every launch and never hydrated — so after any
            // relaunch her real pids resolved to nothing and K5 was blank: the
            // exact defect the slice claimed to close, surviving it. curatedItems
            // is the service's persisted truth; offers is the live supply detail.
            // No liveStorefront yet ⇒ undefined ⇒ the demo/seed fallback.
            catalog={
              liveStorefront === null || liveStorefront === undefined
                ? undefined
                : offers
                    .filter((o) => liveStorefront.curatedItems.includes(o.productVersionId))
                    .map((o) => ({
                      pid: o.productVersionId,
                      name: o.productName,
                      priceFcfa: viewOfOffer(o).client,
                      inStock: o.available > 0,
                      assetRefs: o.assetRefs,
                    }))
            }
            // RESELLER-UX-1 item 6 — her shop's REAL slug, read back from the
            // service; null/undefined ⇒ not live (or not yet known), so the
            // publish CTA shows and « voir » keeps the listing fallback.
            liveSlug={liveShop?.slug}
            onOpenBoutique={(slug) => {
              // Opens HER PUBLIC PAGE — the same URL a cliente gets. Read-back
              // slug only; best-effort open (a browserless device is not an error).
              void Linking.openURL(boutiqueShareUrl(slug)).catch(() => undefined);
            }}
          />
        )}
        {/* APERÇU-CLIENTE RETIRÉ (founder order 2026-08-03: « on ma vitrine
            remove the aperçu cliente screen and its button »). The screen that
            stood here was a REPLICA of the cliente view, drawn from the same
            offers with a neutral crown — a second thing claiming to be the shop
            page. « Voir comme cliente » inside Personnaliser already opens the
            REAL page once the shop is live, which is the view that cannot drift.
            Removing the replica removes the only copy that could. */}
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
      </KeyboardAvoidingView>

      {/* the toast — the toggle/add confirmations (auto-clears); pointerEvents none
          so it never eats a tap. Honest, brief, above the chrome. */}
      {toast !== null && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {/* Note vocale — the per-product record sheet (opened from a card mic). */}
      <VoiceNoteSheet product={voiceSheet} ctl={voice} onClose={() => setVoiceSheet(null)} />
      {/* RESELLER-UX-2 — every product photo's full gallery (fiche héro + Ma
          Vitrine card both open it; refs carry the hero AND the proof shot). */}
      <PhotoGallery product={gallery} onClose={() => setGallery(null)} />

      {/**
        * BANDEAUX-RETIRÉS (founder order 2026-08-14): « On Shop+ remove the
        * demo banner at bottom ». The strip that stood here carried « Données
        * d'essai », the build stamp, the resolved storefront host, the
        * operator line (key PRESENCE + feed state) and « Recommencer la
        * démo » — operator and developer chrome, which the operator line's
        * own comment had already marked for deletion at onboarding.
        *
        * WHAT HE LOSES, NAMED IN THE JOURNAL RATHER THAN DISCOVERED LATER:
        * that operator line was the ONLY place the feed's true state showed,
        * because the empty card deliberately wears the same face for
        * unconfigured, 401, unreachable and genuinely-empty. Diagnosing a
        * blank Opportunités now needs the service, not the screen.
        */}

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
  /**
   * OPPORTUNITÉS-BLANC — the white ground for the opportunités hub ONLY,
   * composed OVER `screen` (never replacing it), so every other hub keeps the
   * warm paper untouched. `card` is the system's own white — and it is ALSO
   * what the product tiles are filled with, which is the honest trade of this
   * change: the tile's FILL stops separating it from the ground entirely
   * (1.15:1 → 1.00:1), so the card is drawn by its hairline and its
   * photograph alone. The hairline itself gains against white rather than
   * losing (1.10:1 → 1.26:1 — measured, both pinned in
   * `test/opportunites-blanc.test.ts`), but 1.26:1 is faint on a hot phone in
   * sunlight: the reference this came from carries full-bleed photography
   * where ours carries a tinted art block, so the card edge is the thing to
   * judge with eyes on a real screen, not with a ratio.
   */
  screenBlanc: { backgroundColor: sharedColour.card },
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
  // RESELLER-PHOTOS-1 — the photograph fills its art container; every container
  // already clips (overflow hidden) and carries the token radius.
  artPhoto: { width: '100%', height: '100%' },
  // RESELLER-UX-1 item 3 — the typed-markup field. Sized to the touch law, framed
  // with the same hairline grammar as the cards; tabular figure styling comes from
  // margeAmount's family via fontFamily below.
  margeInput: {
    minHeight: touch.minTargetPx,
    minWidth: touch.minTargetPx + spacing.xl,
    borderWidth: interaction.hairline.medium,
    borderColor: sharedColour.hairlineStrong,
    borderRadius: rmax(radius.buttonSecondary),
    paddingHorizontal: spacing.md,
    textAlign: 'right',
    color: sharedColour.ink,
    fontFamily: TEXT_FAMILY_BOLD,
    fontSize: t2.scale.row.size,
    backgroundColor: sharedColour.paper,
  },
  // RESELLER-UX-1 item 2 — the one money card on the fiche: three named rows.
  ficheMoneyCard: { gap: spacing.sm },
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
  // `flexShrink: 1` because this sits in a ROW (`homeSubRow`) where RN's
  // default shrink of 0 would paint a long quartier past the screen edge.
  homeSubZone: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size), flexShrink: 1 },
  greeting: { color: sharedColour.ink, fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.screen.size, fontWeight: w(t2.scale.screen.wght) },
  homeTagline: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  homeStatGrid: { flexDirection: 'row', gap: spacing.md },
  ledgerCard: { flex: 1 },
  // ACCESS-GATE-1 — the entrance. Generous, centred, nothing else on it.
  accesEcran: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, gap: spacing.md },
  accesTitre: { color: sharedColour.ink, fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.screen.size, fontWeight: w(t2.scale.screen.wght) },
  accesSous: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: t2.scale.pill.size },
  accesMessage: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: t2.scale.pill.size },
  // ACCUEIL-HONESTY-1 — the no-figure block. Full width because it replaces
  // BOTH cards: half a grid with one card in it would read as a figure that
  // failed to load, which is the opposite of what it says.
  ledgerSilence: { gap: spacing.xs, alignItems: 'flex-start' },
  ledgerMoneyDeep: { color: shopColour.deep, fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.cardMoney.size, fontWeight: w(t2.scale.cardMoney.wght), fontVariant: ['tabular-nums'] },
  ledgerMoney: { color: sharedColour.ink, fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.cardMoney.size, fontWeight: w(t2.scale.cardMoney.wght), fontVariant: ['tabular-nums'] },
  ledgerCardSub: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: t2.scale.pill.size },
  // CTA-ENTIÈRE — the kit's `buttonBase` geometry (plus its own vertical
  // padding and fill): centred, PADDED,
  // and NOT a row. As a row with no horizontal padding, the label (flexShrink
  // defaults to 0 in RN) could neither shrink nor wrap and was clipped
  // mid-word at the button's edge — the founder's « the end is cut ».
  sparkleCta: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: touch.minTargetPx + spacing.sm,
    borderRadius: radius.button,
    backgroundColor: shopColour.primary,
  },
  sparkleCtaText: { color: shopColour.onPrimary, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.row.size), fontWeight: w(t2.scale.row.wght), textAlign: 'center' },
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
  // The compact row — STILL the ventes/detail row idiom (those screens list
  // transactions, not photography; their small art goes through `artTile`).
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
  // RESELLER-UX-3 — the MARKETPLACE GRID (founder reference, 2026-07-27): two
  // columns of photo-first tiles, SQUARE cover photos edge-to-edge (the square
  // frame is what makes cover honest — it barely trims), compact named detail
  // under. Replaces the single-column card of UX-2.
  /**
   * RESELLER-UX-4 — THE WIDER OPPORTUNITÉS GRID (founder reference 2026-08-03).
   *
   * He sent a two-up marketplace grid whose cards run nearly edge-to-edge and
   * asked for « card sizes to be like this ». The card was already half-width;
   * what made his reference's cards bigger was the CHROME AROUND them, not the
   * column count. So the two numbers that decide card width come down — outer
   * padding `lg`→`xs`, gutter `md`→`xs` — and the photograph, being square,
   * grows in BOTH dimensions with it.
   *
   * FOUNDER OVERRIDE, LOGGED (§6): I first stopped at `spacing.sm`, arguing §5's
   * « generous whitespace even on small screens ». He answered « you can make
   * the spacing scale to be like the reference ». His call, and it costs nothing
   * I was right about: `spacing.xs` is a REAL STEP ON OUR SCALE, so the tighter
   * grid is still token-pure — no snowflake value entered the app to get here.
   *
   * MEASURED, not eyeballed, on a 390pt phone:
   *   original  390 − (16×2) − 12 = 346 ⇒ 173pt card (44.4%)
   *   interim   390 − ( 8×2) −  8 = 366 ⇒ 183pt card (46.9%)
   *   NOW       390 − ( 4×2) −  4 = 378 ⇒ 189pt card (48.5%) · 189×189 photo
   * The reference measures ~206pt of a 428pt screen = 48.1%. We are within half
   * a point of it, which is as close as arithmetic on this scale can land.
   */
  oppGrid: { paddingHorizontal: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.sm },
  /**
   * RESELLER-UX-5 — the two INDEPENDENT column stacks (founder correction: the
   * cards must NOT line up across the two columns). `oppColumns` is the pair
   * side by side with the gutter between them; each `oppColumn` is a stack whose
   * cards sit directly under one another. Nothing here aligns anything to the
   * other column — that absence IS the feature, and it is why the old
   * `oppGridRow` (a FlatList row wrapper) no longer exists.
   */
  oppColumns: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  oppColumn: { flex: 1, gap: spacing.xs },
  oppTile: {
    // RESELLER-UX-5 — `flex: 1` REMOVED, and this is a correctness fix, not
    // tidying. It used to give the tile its half-width as a child of a flex ROW.
    // The tile is now a child of a COLUMN, where flex governs the MAIN axis =
    // HEIGHT: leaving it would have asked every card to share the column's
    // height and stretch, which is precisely the row-locked look the founder
    // asked me to remove. Width now comes from the column's own `flex: 1`, and
    // the card fills it by the default cross-axis stretch. Height is the card's
    // content — which is what lets the two columns fall out of step.
    backgroundColor: sharedColour.card,
    borderRadius: radius.tile,
    borderWidth: interaction.hairline.thin,
    borderColor: sharedColour.hairline,
    overflow: 'hidden',
  },
  oppTileArt: {
    width: '100%',
    // CADRE — NO `aspectRatio` HERE ANY MORE (founder order 2026-08-03: « Drop
    // the square rule »). The ratio is supplied per card at the call site from
    // the photograph's own measured shape, because a value pinned in the
    // stylesheet is by definition the same for every product — which is exactly
    // what kept the two columns in lockstep. The fiche héro and the Ma Vitrine
    // card KEEP their square: this order was about the opportunités stagger,
    // and those two surfaces were not in it.
    backgroundColor: shopColour.soft,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // RESELLER-UX-5 — the odd-count ghost spacer is DELETED, not orphaned. It
  // existed to stop a lone last tile stretching across its ROW; there are no
  // rows any more, so an odd count just ends one column a card early, which is
  // the staggered look the founder asked for. Left in place it would have been
  // dead style nobody could explain in six months.
  oppTileName: { color: sharedColour.ink, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.body.size), fontWeight: '700', lineHeight: rmax(t2.scale.body.size) * 1.3 },
  oppTileBase: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size), fontVariant: ['tabular-nums'] },
  // RESELLER-UX-4 — the text block tightens by one step (`md`→`sm`) so the
  // PHOTOGRAPH holds more of the taller card, which is what the founder's
  // reference actually looks like. NOTHING IS REMOVED to buy that room: the
  // net line, the base whisper, the source mark and the épuisé chip are each
  // a standing ruling, and dropping one to win pixels would be me editing his
  // product. Padding is the only thing here that was never load-bearing.
  oppCardBody: { padding: spacing.sm, gap: spacing.xs },
  // The thumbnail strip (fiche + Ma Vitrine) — every capture visible, the
  // reference's « Photos 1/6 » made tangible. Square thumbs, hairline, the
  // active one keylined in the shop accent on the fiche.
  thumbRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  thumb: {
    width: touch.minTargetPx + spacing.sm,
    height: touch.minTargetPx + spacing.sm,
    borderRadius: rmax(radius.art),
    borderWidth: interaction.hairline.thin,
    borderColor: sharedColour.hairline,
    overflow: 'hidden',
    backgroundColor: shopColour.soft,
  },
  thumbOn: { borderColor: shopColour.primary, borderWidth: interaction.hairline.strong },
  // Net-forward money line (SP-I04/I12 net-first) — deep, bold, tabular.
  // BROWSE-SUPPLY-1 — THE SOURCE MARK. A provenance chip, not a location line: a
  // place answers WHERE and a source answers WHOSE, so this reads as a mark rather
  // than an address. Same pill family as the vitrine's « livré par Séra » (soft
  // surface, radius 99, small bold caps-weight text) and DELIBERATELY QUIETER than
  // « Vérifiée » — Shop+ is offering these goods, not vouching for them, and that
  // distinction is what the hub-assurance slice exists to protect.
  oppSourcePill: { alignSelf: 'flex-start', borderRadius: radius.pill, backgroundColor: shopColour.soft, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, marginTop: spacing.xs },
  oppSourcePillText: { color: shopColour.deep, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.pill.size), fontWeight: w(t2.scale.pill.wght) },
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
  /* SP6.1 — the ladder. A dormant rung is QUIETER, never hidden: same card,
     same geometry, lower contrast, so the road ahead is visible without
     competing with the money she actually has. */
  gainsPalierSommeil: { opacity: 0.55 },
  gainsMontant: { color: shopColour.deep, fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.cardMoney.size, fontWeight: w(t2.scale.cardMoney.wght), fontVariant: ['tabular-nums' as const] },
  gainsSommeilMontant: { color: sharedColour.sub, fontFamily: DISPLAY_FAMILY, fontSize: rmax(t2.scale.view.size), fontWeight: w(t2.scale.view.wght) },
  gainsCompte: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
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
    // RESELLER-UX-3 — SQUARE product-page héro (was a wide 156px banner: the
    // frame shape that made cover crop badly and contain letterbox).
    width: '100%',
    aspectRatio: 1,
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
  /**
   * PERSONNALISER-LISIBLE — the labelled entry to Personnaliser. Same pill
   * family and same minimum height as the toggle beside it, so the header row
   * still reads as one band; it simply carries a WORD instead of two letters.
   * `flexShrink` lets the label give way before the toggle does on a narrow
   * phone — French is long, and « Personnaliser » must not push the public/
   * private switch off the screen.
   */
  vitrinePersoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: spacing.xxl + spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: interaction.hairline.thin,
    borderColor: sharedColour.hairlineStrong,
    backgroundColor: sharedColour.card,
  },
  vitrinePersoLabel: {
    color: sharedColour.ink,
    fontFamily: TEXT_FAMILY_BOLD,
    fontSize: rmax(t2.scale.body.size),
    fontWeight: '700',
  },
  /* VITRINE-RETRAIT — the quiet exit. Same 44px+ touch box every control on this
     screen carries, no border and no fill: it must be reachable and legible, and
     it must never compete with « Partager », which is what she came to do. */
  vitrineRetirer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: spacing.xxl + spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  vitrineRetirerLabel: {
    color: sharedColour.sub,
    fontFamily: TEXT_FAMILY,
    fontSize: rmax(t2.scale.pill.size),
    fontWeight: '600',
  },
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
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    minHeight: touch.minTargetPx, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.card, borderWidth: interaction.hairline.thin,
    borderColor: sharedColour.hairline, backgroundColor: shopColour.soft,
  },
  vitrineVoiceDisc: {
    width: spacing.xxl, height: spacing.xxl, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center', backgroundColor: shopColour.primary,
  },
  vitrineVoiceTexte: { flex: 1, gap: spacing.xs / 2 },
  vitrineVoiceLabel: { color: sharedColour.ink, fontFamily: TEXT_FAMILY_BOLD, fontSize: rmax(t2.scale.body.size) },
  vitrineVoiceSous: { color: sharedColour.sub, fontFamily: TEXT_FAMILY, fontSize: rmax(t2.scale.body.size) },
  vitrineCardArt: {
    // RESELLER-UX-3 — SQUARE product-page photo on HER card (founder reference).
    width: '100%',
    aspectRatio: 1,
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
  // ── PARTAGER format segments (planche piste r14 p4; active = white card) ──
});

/**
 * RESELLER-ACCOUNTS-1d — THE ENTRANCE, now an account.
 *
 * Two modes on one screen — « Créer mon compte » (nom · email · téléphone ·
 * mot de passe) and « J'ai déjà un compte » (email · mot de passe) — because a
 * woman handed a phone in a market must not hunt across screens for the one
 * she needs. One primary action per mode (§5). Errors name the field and the
 * way out; a refused login is ONE sentence, because the server is not an email
 * oracle and this screen does not paint one.
 */
function EcranCompte({ service, envoi, erreurKey, onEnvoi, onErreur, onCompte }: {
  service: CompteServicePort | null;
  envoi: boolean;
  erreurKey: string | null;
  onEnvoi: (v: boolean) => void;
  onErreur: (k: string | null) => void;
  onCompte: (c: CompteLocal, session: string) => void;
}) {
  const [mode, setMode] = useState<'creer' | 'connexion'>('creer');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [tel, setTel] = useState('');
  const [mdp, setMdp] = useState('');

  if (service === null) {
    return (
      <View style={styles.accesEcran}>
        <Text style={styles.accesTitre}>{t('acces.titre')}</Text>
        <Text style={styles.accesMessage}>{t('acces.non_branche')}</Text>
      </View>
    );
  }

  const soumettre = () => {
    onEnvoi(true);
    onErreur(null);
    void (async () => {
      const res = mode === 'creer'
        ? await service.inscrire({ name: nom.trim(), email: email.trim(), phone: tel.trim(), password: mdp })
        : await service.connecter(email.trim(), mdp);
      onEnvoi(false);
      if (res.ok) {
        onCompte(res.compte, res.session);
        return;
      }
      onErreur(
        res.reason === 'email_pris' ? 'compte.email_pris'
        : res.reason === 'champ_invalide' ? 'compte.champ_invalide'
        : res.reason === 'refuse' ? 'compte.refuse'
        : 'compte.reseau',
      );
    })();
  };

  const pret = mode === 'creer'
    ? nom.trim() !== '' && email.trim() !== '' && tel.trim() !== '' && mdp.length >= 8
    : email.trim() !== '' && mdp !== '';

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.accesEcran} keyboardShouldPersistTaps="handled">
      <Text style={styles.accesTitre}>{t('acces.titre')}</Text>
      <Text style={styles.accesSous}>{t(mode === 'creer' ? 'compte.creer_sous' : 'compte.connexion_sous')}</Text>

      {mode === 'creer' && (
        <>
          <TextInput style={styles.margeInput} value={nom} onChangeText={setNom} autoCorrect={false} placeholder={t('compte.nom')} accessibilityLabel={t('compte.nom')} editable={!envoi} />
          <TextInput style={styles.margeInput} value={tel} onChangeText={setTel} keyboardType="phone-pad" placeholder={t('compte.telephone')} accessibilityLabel={t('compte.telephone')} editable={!envoi} />
        </>
      )}
      <TextInput style={styles.margeInput} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder={t('compte.email')} accessibilityLabel={t('compte.email')} editable={!envoi} />
      {/* visible on purpose: she is alone with her screen, and seeing what she
          types beats a masked field she cannot check — the console key made the
          same call. A masking toggle can come with a founder ask. */}
      <TextInput style={styles.margeInput} value={mdp} onChangeText={setMdp} autoCapitalize="none" autoCorrect={false} placeholder={t('compte.mot_de_passe')} accessibilityLabel={t('compte.mot_de_passe')} editable={!envoi} />

      {envoi && <Text style={styles.accesMessage}>{t('compte.envoi')}</Text>}
      {!envoi && erreurKey !== null && <Text style={styles.accesMessage}>{t(erreurKey)}</Text>}

      <PrimaryButton
        label={t(mode === 'creer' ? 'compte.creer' : 'compte.se_connecter')}
        onPress={soumettre}
        disabled={envoi || !pret}
      />
      <Pressable
        onPress={() => { onErreur(null); setMode(mode === 'creer' ? 'connexion' : 'creer'); }}
        accessibilityRole="button"
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Text style={styles.accesMessage}>
          {t(mode === 'creer' ? 'compte.deja' : 'compte.nouveau')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

/**
 * RESELLER-ACCOUNTS-1d — THE ADMISSION SCREEN. Her account exists; the app
 * stays closed until the one-time code the founder minted for HER account
 * opens it. One field, one action, and the sentence says who gives the code —
 * the founder's access gate, in her words.
 */
function EcranAdmission({ code, onCode, envoi, erreurKey, onEntrer }: {
  code: string;
  onCode: (v: string) => void;
  envoi: boolean;
  erreurKey: string | null;
  onEntrer: () => void;
}) {
  return (
    <View style={styles.accesEcran}>
      <Text style={styles.accesTitre}>{t('admission.titre')}</Text>
      <Text style={styles.accesSous}>{t('admission.sous_titre')}</Text>
      <TextInput
        style={styles.margeInput}
        value={code}
        onChangeText={onCode}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="SPA-"
        accessibilityLabel={t('admission.champ')}
        editable={!envoi}
      />
      {envoi && <Text style={styles.accesMessage}>{t('acces.verification')}</Text>}
      {!envoi && erreurKey !== null && <Text style={styles.accesMessage}>{t(erreurKey)}</Text>}
      <PrimaryButton label={t('admission.action')} onPress={onEntrer} disabled={envoi || code.trim() === ''} />
    </View>
  );
}
