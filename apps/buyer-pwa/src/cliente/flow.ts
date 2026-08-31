/**
 * PWA CLIENTE — the orchestrator (§3 modèle & machine à états), the pixel
 * prototype's logic class ported behavior-for-behavior: the same state shape,
 * the same gates (canC3/canC4/canC5), the same timers (§3.4 — 1 200 ms envoi,
 * 2 400 ms opérateur, 2 600 ms porte, 1 000 ms chrono vocal, 2.8 s toast), the
 * same `jump()` prefill (zone Gounghin · repère « Face à la pharmacie du
 * marché » · livraison today · mode B).
 *
 * `applyTheme` sets the habillage on the container ONCE (survives innerHTML
 * re-renders); every screen reads it through the stylesheet, so all four §1.2
 * habillages drive the flow the way the vitrine does — as a GATE/AUDIT lever.
 * FOUNDER RULING (2026-07-22): the buyer flow renders INDIGO ALWAYS on every
 * real entry; main.ts passes 'indigo' on the signed path and the storefront
 * theme no longer wins here. (The canon `Storefront.theme` default → indigo
 * remains a contracts change, flagged, NOT made here.)
 *
 * « Le code de remise fait foi » — C9 reveals ONLY on `leg2:'confirmed'`:
 * mode A at « Tout est bon »; mode B after the operator confirms the rest
 * (2 600 ms). Never before (§3.2).
 */

import { fmtCoords, monterCarteVue } from '../geo-carte';
import { applyTheme, type VitrineThemeKey } from '../vitrine/themes';
import {
  renderC1, renderC10, renderC3,
  renderQuartierChips, renderC4, renderC5, renderC6, renderC7, renderC8, renderC9,
  renderGalerie, renderGeoCarte, renderOffline, renderRefus, renderSheet, renderSkeleton, renderToasts,
  galerieSlides,
  etapeDeSuivi,
  splitFor, MERCI, MESSAGES, SUIVI_STEPS, VOIX,
  type ClienteProduit, type ClienteQuote, type ConfirmEtat, type DoorEtat,
  type GeoEtat, type Livraison, type ModePaiement, type VoiceEtat,
} from './screens';
import { fmtFCFA } from './money';
import { caretApresChiffres, telEnPaires } from './telephone';
import { iconPause, iconPauseSmall, iconPlay, iconPlaySmall } from './icons';

/**
 * « m:ss » for the ticking clock — the SAME shape `m.voiceDuree` already shows
 * (« 0:12 »), so the number that appears while it plays and the number that was
 * there before it started belong to one another instead of being two formats.
 */
function fmtSecondes(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
import { prixExpire, type OrderFetch, type QuoteFetch, type RemiseFetch, type ReserveFetch } from './quote-model';
import { garderCommande, localStorageOrUndefined, oublierCommande, type ServerOrder } from './quote-port';
import { garderReprise, lireReprise, oublierReprise, type Reprise } from './reprise';
import { creerEnregistreurNote, type EnregistreurNote, type NoteEnregistree } from './voice-note';

export type ClienteEcran = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9' | 'C10';
/** C2 is the protections SHEET, not a linear stop — mounting at C2 opens the
 * sheet over C1 (PWA-CLEANUP-1 §5: the reachability gate covers every screen,
 * C2 included). The linear machine walks the pixel's 8-screen list. */
type EcranLineaire = Exclude<ClienteEcran, 'C2'>;
const ECRANS: readonly EcranLineaire[] = ['C1', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'];

export interface ClienteInit {
  readonly produit: ClienteProduit;
  /**
   * The frozen quote for the HARNESS path (seed.ts composes it — the mock quote
   * service). OPTIONAL on purpose (SP3.2b): the real signed path passes NONE and
   * supplies `quoteSource` instead, so a locally composed price is not merely
   * unused there — it is absent, and therefore unrenderable. That is the
   * structural half of « no price we invented ever reaches a buyer ».
   */
  readonly quote?: ClienteQuote | undefined;
  /**
   * ASK THE SERVER FOR THE PRICE (SP3.2b). Present ⇒ the flow asks ONCE, at
   * `continuer-c3` — the first moment the destination is known — shows the
   * existing skeleton while it waits, and renders ONLY what comes back.
   * ABSENT ⇒ today's behaviour, byte for byte, off `init.quote`.
   *
   * The argument is the buyer's chosen QUARTIER (`state.zone`); the caller
   * composes it into the wire `zoneTo` (« {quartier}, {ville} ») because only
   * the caller knows her shop's city. `renouveler` asks for a NEW request key —
   * the « Voir le prix à jour » action after an expiry, and nothing else.
   */
  readonly quoteSource?: ((quartier: string, renouveler?: boolean) => Promise<QuoteFetch>) | undefined;
  /**
   * LISTE-ADRESSE — the liste this fiche was opened through STORED AN ADDRESS
   * (its public boolean said so; the address itself never reaches this app).
   * Present ⇒ C3 is never mounted: « Commander » asks the price directly (the
   * caller's quoteSource names the liste, and the service prices her private
   * zone), C4 says « Livré chez {nom}, à son adresse. » instead of a récap the
   * friend never wrote, and every step-back from the price lands on C1.
   */
  readonly livraisonListe?: { readonly nom: string } | undefined;
  readonly theme?: VitrineThemeKey | undefined;
  readonly ecran?: ClienteEcran | undefined;
  /** §6 props (the pixel prototype's exact set). */
  readonly epuise?: boolean | undefined;
  readonly sansVoix?: boolean | undefined;
  readonly offline?: boolean | undefined;
  readonly bIndisponible?: boolean | undefined;
  readonly microRefuse?: boolean | undefined;
  readonly demo?: boolean | undefined;
  /** Harness levers (reachability): squelette · C6 variant · C9 révélé. */
  readonly etat?: 'ready' | 'loading' | undefined;
  readonly conf?: ConfirmEtat | undefined;
  readonly revealed?: boolean | undefined;
  /** Navigate to her full vitrine — the frozen attribution seam (main.ts). */
  readonly onVitrine?: ((slug: string) => void) | undefined;
  /** REPERE-AUDIO-REEL — the recorder seam. Tests and the harness inject a
   *  fake; the real app records with the phone's own MediaRecorder. */
  readonly enregistreur?: EnregistreurNote | undefined;
  /**
   * ═══ VRAI-SUIVI — THE RE-ENTRY MOUNT (« Ma commande ») ═══
   *
   * Present ⇒ this flow opens ON AN EXISTING ORDER: it mounts at C7, polls the
   * order's own state through `etatCommande`, and asks the remise route for
   * the code through `remise`, with the buyer's stored bearer ref. There is NO
   * live checkout handle on this path — no quote, no hold, no door charge —
   * which is why C7 withholds « Je suis à la porte » here: a door payment
   * cannot be started from a re-entry, and a button that cannot complete is a
   * false affordance. The tracking and the code are the whole of it.
   */
  readonly suivi?: {
    readonly orderId: string;
    readonly buyerRef: string | null;
    readonly etatCommande: (orderId: string) => Promise<OrderFetch>;
    readonly remise: (orderId: string, buyerRef: string) => Promise<RemiseFetch>;
  } | undefined;
  /** VRAI-SUIVI — after « C'est terminé » clears the stored order, the host
   *  decides where she lands (main.ts reloads onto the shell). */
  readonly onTerminee?: (() => void) | undefined;
  /**
   * ═══ REPRISE-PWA — THE TAB'S JOURNEY SURVIVES A REFRESH (2026-08-13) ═══
   *
   * Present ⇒ the flow KEEPS a journey snapshot in sessionStorage on every
   * state change and field commit (screen + what she entered — reprise.ts
   * names what may never be in it), and on mount RESUMES a snapshot matching
   * this link instead of opening at C1. Only the plain signed entry passes
   * this; the harness and the « Ma commande » re-entry never do.
   *
   * The two port functions are the ORDER-SCOPED reads a resumed tracking
   * polls with — the same pair the re-entry uses — because a reload destroys
   * the live checkout handle, and the order's truth lives with the server,
   * never in the snapshot.
   */
  readonly reprise?: {
    readonly lien: string;
    readonly storage: Storage | undefined;
    readonly etatCommande: (orderId: string) => Promise<OrderFetch>;
    readonly remise: (orderId: string, buyerRef: string) => Promise<RemiseFetch>;
  } | undefined;
  /**
   * ═══ LISTE-MERCI — « PRÉVENIR {nom} » (founder order, 2026-08-26) ═══
   *
   * Present ⇒ this checkout was opened THROUGH a wishlist link. Once the
   * payment is PROVIDER-CONFIRMED, the flow asks `charger` for the creator's
   * notify facts (a read gated server-side on this order's own buyer token —
   * every refusal is one uniform 404 that simply renders no block), and C6
   * offers the purchaser « Prévenir {nom} » : their prénom, one tap, and the
   * message leaves from THEIR OWN WhatsApp with `lienCadeau(orderId)` inside
   * so the creator can follow the delivery. The number never enters the DOM.
   */
  readonly merci?: {
    readonly charger: (orderId: string, buyerRef: string) => Promise<
      { status: 'merci'; nom: string; telephone: string } | { status: 'indisponible' }
    >;
    readonly lienCadeau: (orderId: string) => string;
  } | undefined;
}

interface FlowState {
  loading: boolean;
  screen: EcranLineaire;
  offline: boolean;
  stock: 'ok' | 'out';
  bInel: boolean;
  sheet: boolean;
  toasts: Array<{ id: number; m: string }>;
  zone: string | null;
  /** QUARTIERS-OUAGA-1 — the quartier filter's text. UI state only: it is
   *  deliberately NOT part of the reprise snapshot (the pinned key list). */
  zoneFiltre: string;
  repere: string;
  /** BC-1b — her number, captured on C3 for the dispatch contact. */
  phone: string;
  voice: VoiceEtat;
  vSec: number;
  /** REPERE-AUDIO-REEL — the RECORDED note (bytes + her replay URL), held on
   *  the phone until it rides the order create. null = nothing recorded. */
  note: NoteEnregistree | null;
  /** GEO-ACHAT-1 — the position block's face. Like `zoneFiltre`, deliberately
   *  NOT in the reprise snapshot: a refresh forgets the pin (no coordinates
   *  ever sit in sessionStorage) and one tap brings it back. */
  geo: GeoEtat;
  /** The captured pin, held on the phone until it rides the order create
   *  beside the rest of the contact. null = none captured. */
  pin: { lat: number; lng: number; accuracy?: number } | null;
  delivery: Livraison | null;
  pay: ModePaiement | null;
  paying: 'idle' | 'submitting' | 'provider';
  confirmState: ConfirmEtat;
  step: number;
  problem: boolean;
  door: DoorEtat;
  leg2: 'idle' | 'confirmed';
  reason: string | null;
  /** RESELLER-UX-2 item 4 — the photo gallery: open at this index, null = closed. */
  galerie: number | null;
  /* ── SP3.2b — the server's price, and only the server's ────────────────── */
  /** The quote the SERVER issued, filled from its bytes. null until it answers. */
  serverQuote: ClienteQuote | null;
  /** The refusal NAME currently on screen (server's word, or 'unreachable'). */
  refus: string | null;
  /**
   * The live quote's handles: its expiry instant and its reservation. `reserve`
   * takes NO argument — the command id was minted once with the quote and is
   * closed over, so every tap of Payer holds under the SAME command and the
   * buyer's own retry replays her own hold instead of colliding with it.
   */
  live: {
    quoteId: string;
    commandId: string;
    expiry: string;
    reserve: (mode: ModePaiement) => Promise<ReserveFetch>;
    /** SP3.3c — create the order for the chosen mode, and read it back. Bound
     *  to the same per-mode quote the hold was taken on. */
    commander: (mode: ModePaiement, essai: number, contact?: { phone: string; quartier: string; repere: string; audioB64?: string; pin?: { lat: number; lng: number; accuracy?: number } }) => Promise<OrderFetch>;
    etatCommande: (orderId: string) => Promise<OrderFetch>;
    /** SP4.2b — ask for the product leg to be collected at her door. */
    payerALaPorte: (orderId: string, essai: number) => Promise<OrderFetch>;
    /** VRAI-SUIVI — ask the remise route for the code, with her bearer ref. */
    remise: (orderId: string, buyerRef: string) => Promise<RemiseFetch>;
  } | null;
  /**
   * The phone's clock disagreed with a QUOTE THE SERVICE JUST ISSUED, so the
   * local expiry check is not evidence about the price. See `payer`.
   */
  horlogeDouteuse: boolean;
  /** One automatic refresh per price, so a stale quote cannot loop forever. */
  prixRafraichi: boolean;
  /* ── SP3.3c — the order, and the operator's answer ─────────────────────── */
  /** The order this checkout created, once the service has created one. */
  orderId: string | null;
  /** Which ORDER attempt this is — 0, then +1 per deliberate retry after a
   *  failed payment. It is part of the order command id's storage slot, so a
   *  double-tap replays and a retry does not. */
  essai: number;
  /** The automatic checks have stopped ⇒ C6 offers « Vérifier à nouveau ». */
  relance: boolean;
  /** The LAST read of the order did not reach the service. Says nothing
   *  about the payment — only that we could not ask (verifier BLOCKER 2). */
  horsPortee: boolean;
  /**
   * SP4.2b — where the DOOR leg stands, as the SERVER last reported it.
   * `null` until an order exists. See `revelationPermise`.
   */
  doorLeg: string | null;
  /** Which DOOR-charge attempt this is — +1 per deliberate retry. */
  essaiPorte: number;
  /* ── VRAI-SUIVI — the delivery's facts, and her code ───────────────────── */
  /** Her bearer ref for the remise route — the CREATE's own byte, or the
   *  stored one on a re-entry. null = this session never learned one. */
  buyerRef: string | null;
  /** LISTE-MERCI — the creator's notify facts, once the confirmed order's
   *  merci read answered. The telephone lives HERE and only here: it becomes
   *  the wa.me address at tap time and never enters the DOM. */
  merci: { nom: string; telephone: string } | null;
  /** One merci read per order — the ask fires on the FIRST confirmed sight. */
  merciDemande: boolean;
  /** The four delivery marks, EXACTLY as the server last reported them.
   *  Replaced wholesale on every read: absence = « pas encore », never done. */
  marques: {
    acceptedAt?: string | undefined;
    readyAt?: string | undefined;
    departedAt?: string | undefined;
    arrivedAt?: string | undefined;
  };
  /** The remise happened — terminal. Once the server says it, it stays said:
   *  a delivered order cannot un-deliver, and a glitchy later read must not
   *  resurrect a live tracking. */
  livree: boolean;
  /** The code the REMISE ROUTE answered — the only code the real C9 can show.
   *  null until the service hands one over (post-arrival, by its design). */
  codeRemise: string | null;
  /** The C7 ladder ran out ⇒ « Vérifier à nouveau » on the tracking. */
  suiviRelance: boolean;
  /** The LAST tracking read did not reach the service. Same law as C6's
   *  `horsPortee`: it says nothing about the delivery, ever. */
  suiviHorsPortee: boolean;
  /** She tapped « C'est terminé » — the button goes away, the screen stays. */
  termineeVue: boolean;
}

/**
 * ═══ HOW OFTEN THE CLIENT ASKS THE SERVER WHETHER THE OPERATOR ANSWERED ═══
 *
 * NEITHER §6.1 NOR §6.3 NAMES A CADENCE — this is a documented safest default
 * under Ten Laws #7 (« offline-first, low-end Android first »), founder-tunable,
 * and it is one constant so tuning it is one edit.
 *
 * BACKOFF, AND THEN A STOP. Six reads over about 35 seconds: quick at first,
 * because a sandbox webhook can land in a second and a buyer staring at a
 * waiting screen deserves the answer as soon as it exists; slowing down,
 * because after ten seconds it is no longer arriving quickly and every extra
 * read is her data and her battery. THEN IT STOPS — and this is the part that
 * matters most on this market's phones: a client that polls forever is a client
 * that drains a 1 GB Android in a pocket for an answer that may take an hour.
 * When it stops, the screen does NOT change its meaning; it grows a « Vérifier
 * à nouveau » button, so asking again is her choice and costs one request.
 *
 * NOTHING HERE IS A DEADLINE ON THE PAYMENT. Running out of reads means « we
 * stopped asking », never « it failed » — the order is exactly as alive as it
 * was, and the screen keeps saying the same true sentence.
 */
export const SUIVI_PAIEMENT_MS: readonly number[] = [1_500, 2_500, 4_000, 6_000, 9_000, 12_000];

/**
 * ═══ THE DELIVERY IS NOT A PAYMENT, AND IT NEEDED ITS OWN CADENCE ═══
 *
 * Founder, 2026-08-12: « le suivi screen there is not updating in real time
 * with product movements. »
 *
 * THE CAUSE: the delivery watch reused {@link SUIVI_PAIEMENT_MS}. That ladder is
 * right for what it was built for — a payment confirms in seconds, so six reads
 * over ~35 s then stop is generous. A DELIVERY takes half an hour or more. Thirty
 * five seconds after she lands on C7 the reads were exhausted, the screen froze
 * on whatever step it had, and « Vérifier à nouveau » made every subsequent
 * movement something she had to ask for by hand. Nothing was broken; it had
 * simply stopped looking.
 *
 * SO IT RAMPS AND THEN HOLDS. Quick at first (she has just paid and wants to see
 * the rider accept), settling to one read every twenty seconds for as long as
 * the parcel is moving. The last value REPEATS — reaching the end of this array
 * is no longer « stop asking », it is « keep asking at this rate ».
 *
 * AND THE BATTERY ARGUMENT IN THE COMMENT ABOVE IS ANSWERED, NOT IGNORED: a
 * client that polls forever in a pocket is exactly what that comment refuses,
 * and it was right. The watch now SLEEPS WHENEVER THE PAGE IS HIDDEN and takes
 * one immediate read when she comes back — so it costs nothing at all while the
 * phone is in her pocket, and it is current the instant she looks. That is the
 * behaviour « real time » actually means on a 1 GB Android on paid data.
 *
 * It still ends for good at `livree`: a finished order costs her no further read.
 */
export const SUIVI_LIVRAISON_MS: readonly number[] = [2_000, 3_000, 5_000, 8_000, 12_000, 20_000];

/**
 * How many CONSECUTIVE refused reads before the watch stops asking by itself.
 *
 * The hold added above is only safe while the reads can land. Three in a row
 * means the service is not answering for this order, and continuing would be a
 * poll every twenty seconds, for ever, on a screen with no control on it and on
 * her paid data. At three the ladder stops and « Vérifier à nouveau » returns —
 * one request, on her choice. A single read that lands resets the count.
 */
export const SUIVI_ECHECS_AVANT_PAUSE = 3;

/** The wait before read `etape`, holding at the last rung instead of running
 *  out. Exported so a test can pin « it never stops » by value. */
export function attenteLivraison(etape: number): number {
  const dernier = SUIVI_LIVRAISON_MS[SUIVI_LIVRAISON_MS.length - 1]!;
  return SUIVI_LIVRAISON_MS[etape] ?? dernier;
}

/**
 * THE SERVER'S ORDER STATE → WHAT C6 IS ALLOWED TO SAY. An ALLOWLIST, in one
 * place, and everything it does not name falls to « we are waiting ».
 *
 *  · `confirmed` ALONE prints the confirmation. It is the state the vault
 *    reaches only through `confirmOrder`, which re-reads the order's own funding
 *    record and refuses `no_funded_checkout_leg` — so it cannot exist without a
 *    funded leg (SP-I13, and the gate of that name).
 *  · `paid` DOES NOT. It looks like the happier word and it is the trap: the
 *    webhook path advances to `paid` and confirms in the same breath, so an
 *    order OBSERVED at `paid` is one where confirmation was REFUSED. Reading it
 *    as « confirmé » would print the confirmation for exactly the orders whose
 *    funding the vault rejected.
 *  · `payment_failed` is the only failure. There is no generic « failed »
 *    terminal in this system (Ten Laws #3) and this function invents none.
 *  · `quote_issued` · `reserved` · `payment_pending` · `cancelled` · `refunded`
 *    — and any state this client has never heard of — all mean « not confirmed,
 *    not failed », which is the waiting screen. FAIL CLOSED: an unknown state
 *    must never be able to print a confirmation.
 */
/**
 * ═══ MAY THE DROP CODE BE REVEALED AT ALL? — §6.3, IN ONE FUNCTION ═══
 *
 * §6.3, verbatim: « the buyer enters the drop code **last, after** any door
 * payment is provider-confirmed ». Ten Laws #3: custody transfers only after
 * provider-confirmed payment of **every due leg**.
 *
 * ═══ THE DEFECT THIS CLOSES, AND IT WENT LIVE-SHAPED IN ONE COMMIT ═══
 *
 * SP3.3c's guard asked only « is the order `confirmed`? ». On FULL_PREPAY that
 * is the whole bill and the guard was right. **On Option B, `confirmed` means
 * the DELIVERY FEE is funded — 1 000 FCFA — while the product's 11 500 is still
 * owed at the door.** So a mode-B buyer could inspect, tap « Tout est bon », and
 * be shown « Le code de remise » having paid a twelfth of her order.
 *
 * IT WAS UNREACHABLE ONLY BECAUSE MODE B WAS UNREACHABLE — the empty zone
 * allowlist refused every pay-at-door quote. The founder opened that rule on
 * 2026-08-01, so this stopped being theoretical in the same change, and closing
 * it is part of that change rather than a later slice.
 *
 * ═══ ABSENT MEANS OWED ═══
 *
 * `doorLeg === null` — an older Worker that does not send the field, a read that
 * never landed — WITHHOLDS the code. The unknown case and the owed case get the
 * same answer, so nothing can be revealed by a field going missing. `'none'` is
 * the only value that means « nothing was ever owed here », and it is the
 * server's word, never inferred from an amount.
 *
 * THE HARNESS PATH (`reel === false`) keeps its documented levers: it has no
 * order to consult and is labelled a demo everywhere it is offered.
 */
export function revelationPermise(reel: boolean, confirmState: ConfirmEtat, doorLeg: string | null): boolean {
  if (!reel) return true;
  if (confirmState !== 'confirmed') return false;
  return doorLeg === 'none' || doorLeg === 'paid';
}

export function etatDeC6(state: string): ConfirmEtat {
  if (state === 'confirmed') return 'confirmed';
  if (state === 'payment_failed') return 'echec';
  return 'attente';
}

/**
 * Mount the buyer's flow into `container`.
 *
 * ═══ IT RETURNS A TEARDOWN, AND THAT IS NOT OPTIONAL ANY MORE ═══
 *
 * It used to return nothing, and the `visibilitychange` listener it registers
 * was never removed. That was harmless only by accident: the delivery watch ran
 * out after six rungs, so an instance whose DOM had been thrown away stopped by
 * itself in about thirty-five seconds. SUIVI-VIVANT made the ladder hold, and
 * the accident became a leak — a detached instance polling the service every
 * twenty seconds for as long as the tab is open, rendering into a container
 * that is no longer in the document, its listener holding the whole closure
 * alive. Two of them, in the ordinary case where she opens « Ma commande » over
 * a signed product page.
 *
 * So the caller is handed the way to stop it, and `main.ts` stops the previous
 * instance before mounting the next.
 */
export function createCliente(container: HTMLElement, init: ClienteInit): () => void {
  applyTheme(container, init.theme ?? 'indigo');
  container.classList.add('cl-root');

  const m = init.produit;
  const demo = init.demo ?? true;
  // C2 mounts as C1 with the protections sheet open (it is an overlay, not a stop).
  const startScreen: EcranLineaire = init.ecran === 'C2' ? 'C1' : (init.ecran ?? 'C1');

  const state: FlowState = {
    loading: (init.etat ?? 'ready') === 'loading',
    screen: startScreen,
    offline: init.offline ?? false,
    stock: (init.epuise ?? false) ? 'out' : 'ok',
    bInel: init.bIndisponible ?? false,
    sheet: init.ecran === 'C2',
    toasts: [],
    zone: null,
    zoneFiltre: '',
    repere: '',
    phone: '',
    voice: (init.microRefuse ?? false) ? 'refused' : 'idle',
    vSec: 0,
    note: null,
    geo: 'repos',
    pin: null,
    delivery: null,
    pay: null,
    paying: 'idle',
    confirmState: init.conf ?? 'confirmed',
    step: 1,
    problem: false,
    door: 'inspecting',
    leg2: (init.revealed ?? false) ? 'confirmed' : 'idle',
    reason: null,
    galerie: null,
    serverQuote: null,
    refus: null,
    live: null,
    horlogeDouteuse: false,
    prixRafraichi: false,
    orderId: null,
    essai: 0,
    relance: false,
    horsPortee: false,
    doorLeg: null,
    essaiPorte: 0,
    buyerRef: null,
    merci: null,
    merciDemande: false,
    marques: {},
    livree: false,
    codeRemise: null,
    suiviRelance: false,
    suiviHorsPortee: false,
    termineeVue: false,
  };

  /**
   * ═══ VRAI-SUIVI — IS THIS A REAL BUYER'S FLOW? ═══
   *
   * TRUE on both real roads: the signed checkout (`quoteSource` — every franc
   * asked of the service) and the re-entry (`suivi` — an order this phone
   * remembers). On either, C7 derives its step from server facts, « Simuler »
   * is unrenderable, and C9 can only ever show a code the remise route
   * answered. FALSE only on the `?demo-cliente=` harness, which keeps its
   * documented levers and its clearly-labelled demo code.
   */
  const reel = init.quoteSource !== undefined || init.suivi !== undefined;
  if (init.suivi !== undefined) {
    state.orderId = init.suivi.orderId;
    state.buyerRef = init.suivi.buyerRef;
  }
  /** WHO ANSWERS A TRACKING READ — the re-entry's own port, the live
   *  checkout's handle, or (REPRISE-PWA) the resumed journey's order-scoped
   *  port. null = nobody can (the harness), so nothing polls. */
  const lireCommande = (): ((orderId: string) => Promise<OrderFetch>) | null =>
    init.suivi?.etatCommande ?? (state.live !== null ? state.live.etatCommande : null) ?? init.reprise?.etatCommande ?? null;
  const lireRemise = (): ((orderId: string, buyerRef: string) => Promise<RemiseFetch>) | null =>
    init.suivi?.remise ?? (state.live !== null ? state.live.remise : null) ?? init.reprise?.remise ?? null;

  /**
   * THE ONE QUOTE EVERY SCREEN READS. The server's answer wins the moment it
   * exists; otherwise the harness's composed quote; otherwise NOTHING — and
   * « nothing » is a real answer here, not a bug to paper over. On the real path
   * `init.quote` is absent, so a screen reached without a server quote has no
   * figures to show and says so (`renderRefus`) rather than showing figures it
   * made up.
   */
  const quoteOrNull = (): ClienteQuote | null => state.serverQuote ?? init.quote ?? null;
  // No mount-time prefill — the pixel mounts startScreen on the RAW state and
  // keeps mid-flow screens coherent with RENDER-TIME fallbacks (zone/repère on
  // C4, today/B on C5·C6·C8). C4 therefore mounts with NO option selected and
  // C3 mounts empty, exactly like the prototype.

  // ONE audio element for « Note vocale » — created on the FIRST TAP only (never
  // autoplay, law 5: recorded audio; the [DEMO] tone until the media backend).
  let voixAudio: HTMLAudioElement | null = null;

  /**
   * THE ONE AUDIO PATH IN THIS APP (founder ruling 2026-07-30).
   *
   * C1's player and C5's « Écouter la note » both come through here: one
   * element, one src assignment, one `play()`. The ruling asked for the note to
   * be listenable from the payment screen and the work order forbade a second
   * audio implementation, so the shared part was lifted rather than copied.
   *
   * WHAT THE CALLER OWNS IS ONLY THE REFUSAL SENTENCE, and that is the entire
   * difference between the two screens: C1 keeps its « (démo) » toast, and C5
   * must never say that word — see `MESSAGES.noteInjouable`. The `catch` is not
   * decoration: `play()` rejects on autoplay policy and on a codec this device
   * cannot decode, and an unhandled rejection on the payment screen is a
   * console error where a true sentence belongs.
   */
  /**
   * ═══ VOIX-ÉTAT — THE PLAYER HAD NO FACE (founder, 2026-08-04) ═══
   *
   * « the seconds are still not counting when i tap play the audio here and the
   * play button doesn't change to pause button. » Literally true, twice over:
   * this function drove the <audio> element and touched NO DOM. The triangle
   * was drawn once by `renderC1` and never swapped; the duration was
   * `m.voiceDuree`, a static string. Tapping did play the note — and looked
   * exactly like tapping nothing.
   *
   * (I had fixed the vitrine's player first. Same defect, different file: the
   * screen he was pointing at is C1, and « the buyer's pwa » means THIS one.)
   *
   * `bouton` is the element that was tapped, so the state lives on the control
   * that caused it and dies with it: every screen here replaces innerHTML, so a
   * re-render cannot inherit a stale « pause » — the node it belonged to is
   * gone. Both C1 and C5 come through here, so both gain this at once, which is
   * the reason the shared part was lifted in the first place.
   */
  let voixHote: HTMLElement | null = null;
  let voixTotal = '';

  /**
   * VOIX-ÉTAT-2 — THE GLYPH KEEPS ITS OWN FORM. C1's control carries the
   * 24-grid triangle; C5's carries the small 10×12 one. Swapping both to the
   * 24-grid pause would resize C5's button mid-tap. The existing svg's viewBox
   * says which family it belongs to, so the pair is chosen from the DOM rather
   * than assumed from the screen.
   */
  const voixGlyphe = (el: HTMLElement, lecture: boolean): void => {
    const cible = el.querySelector('svg');
    if (cible === null) return;
    const petit = cible.getAttribute('viewBox') === '0 0 10 12';
    cible.outerHTML = petit
      ? (lecture ? iconPauseSmall(13, 14) : iconPlaySmall(13, 14))
      : (lecture ? iconPause(16) : iconPlay(16));
  };
  const voixHorloge = (texte: string): void => {
    const cible = document.querySelector('.cl-voix-dur');
    if (cible instanceof HTMLElement) cible.textContent = texte;
  };
  /** Back to rest: the triangle returns and the clock shows the total again. */
  const voixRepos = (): void => {
    if (voixHote === null) return;
    voixGlyphe(voixHote, false);
    // ALWAYS restore, including to the empty string. C5 has no total to go back
    // to, and the old `if (voixTotal !== '')` guard would have stranded the
    // counting position on that button for ever.
    voixHorloge(voixTotal);
    voixHote = null;
  };

  function jouerLaNote(url: string, siRefus: () => void, bouton?: HTMLElement): void {
    if (!voixAudio) {
      voixAudio = new Audio();
      // EVERY way playback can stop puts the control back. A pause glyph over
      // silence is the same lie as a play glyph over sound.
      voixAudio.addEventListener('ended', voixRepos);
      voixAudio.addEventListener('pause', voixRepos);
      voixAudio.addEventListener('error', voixRepos);
      voixAudio.addEventListener('timeupdate', () => {
        if (voixHote !== null && voixAudio !== null) voixHorloge(fmtSecondes(voixAudio.currentTime));
      });
    }
    // Tapping the note that is PLAYING pauses it — the pause glyph has to mean
    // something when she taps it.
    if (voixHote !== null && bouton === voixHote && !voixAudio.paused) {
      voixAudio.pause();
      return;
    }
    if (voixAudio.src !== url) voixAudio.src = url;
    voixAudio.currentTime = 0;
    voixRepos(); // a second control takes over: the first goes back to rest
    if (bouton !== undefined) {
      voixHote = bouton;
      const dur = document.querySelector('.cl-voix-dur');
      voixTotal = dur instanceof HTMLElement ? dur.textContent ?? '' : '';
      voixGlyphe(bouton, true);
      voixHorloge(fmtSecondes(0));
    }
    void voixAudio.play().catch((e: unknown) => {
      voixRepos(); // a refusal must not leave a pause glyph over nothing
      siRefus();
      return e;
    });
  }

  let t1: ReturnType<typeof setTimeout> | null = null;
  let t2: ReturnType<typeof setTimeout> | null = null;
  /** SP3.3c — the next scheduled read of the order. Cleared by `clearT()` with
   *  the rest, so leaving the screen stops asking. */
  let tSuivi: ReturnType<typeof setTimeout> | null = null;
  /**
   * Where the delivery watch parked when the page went hidden — `null` when it
   * is not parked. The pocket case: no timer runs, so a screen she is not
   * looking at costs nothing, and `reprendreSuivi` reads once on return.
   */
  let suiviEnAttenteDeRetour: number | null = null;
  /**
   * CONSECUTIVE refused reads on the delivery watch. Reset by any read that
   * lands; at {@link SUIVI_ECHECS_AVANT_PAUSE} the automatic ladder stops and
   * the manual control comes back. See the run-of-refusals block below.
   */
  let echecsSuivi = 0;
  let ticker: ReturnType<typeof setInterval> | null = null;

  /** REPERE-AUDIO-REEL — the recorder behind « Enregistrer le repère ». One
   *  per flow; tests and the harness inject a fake through `init`. */
  const enregistreur: EnregistreurNote = init.enregistreur ?? creerEnregistreurNote();
  /** The capture ceiling — a repère is a sentence, not a speech. The media
   *  door's own walls (2 MiB / 60 s) sit far behind this. */
  const NOTE_MAX_SEC = 30;
  /** One replay element for HER OWN note (blob URL — never leaves the phone). */
  let noteAudio: HTMLAudioElement | null = null;
  /** GEO-ACHAT-2 — the UNCONFIRMED fix the carte face is asking about. A
   *  closure variable, never state: it exists only between the capture and
   *  her answer, dies on Annuler and on every screen change, and cannot be
   *  serialised into a snapshot by construction. Only `geo-confirmer` may
   *  promote it to `state.pin`. */
  let pinCandidat: { lat: number; lng: number; accuracy?: number } | null = null;
  /** GEO-CARTE-PRO — the CAPTURED fix, kept beside the candidate so the
   *  viseur can undo her drags without a second sensor read. Same lifetime
   *  as the candidate; never state, never a snapshot. */
  let fixOrigine: { lat: number; lng: number; accuracy?: number } | null = null;
  /**
   * ═══ VOIX-ÉTAT-2 — HER OWN NOTE HAD NO FACE EITHER (founder, 2026-08-09) ═══
   *
   * « When buyer records the audio and then plays to listen back the button is
   * not displaying the pause sign and the seconds are not counting. » Exactly
   * right, and for the third time in this codebase for the same reason: the
   * handler drove the <audio> element and touched NO DOM. C1/C5's player and
   * the vitrine's were fixed on 2026-08-04; THIS one — the note she just
   * recorded, the moment she most wants to know « did that work? » — was never
   * given the same treatment.
   *
   * The DOM it drives is the recorded block, which `render()` rebuilds on every
   * state change, so a stale pause glyph cannot outlive it.
   */
  const noteBloc = (role: 'note-play' | 'note-time'): HTMLElement | null => {
    const el = container.querySelector(`[data-role="${role}"]`);
    return el instanceof HTMLElement ? el : null;
  };
  const noteGlyphe = (lecture: boolean): void => {
    const bouton = noteBloc('note-play');
    const cible = bouton?.querySelector('svg');
    if (cible !== null && cible !== undefined) cible.outerHTML = lecture ? iconPauseSmall(13, 14) : iconPlaySmall(13, 14);
    // The control's NAME, from the one table the inline-copy gate reads —
    // the same strings `renderVoiceBlock` puts on the button at rest, so the
    // markup and this handler cannot drift into two different words.
    bouton?.setAttribute('aria-label', lecture ? VOIX.pause : VOIX.ecouter);
  };
  const noteHorloge = (texte: string): void => {
    const cible = noteBloc('note-time');
    if (cible !== null) cible.textContent = texte;
  };
  /** Back to rest — the triangle returns and the clock shows the TOTAL again
   *  (`recTime()`, the length she actually recorded), never a frozen position. */
  const noteRepos = (): void => {
    noteGlyphe(false);
    noteHorloge(recTime());
  };

  /** Stop = the button AND the 30 s cap, one act: assemble the note, keep it
   *  for the order, and say the honest state (queued when offline — kept, it
   *  rides the order once the network is back; the order needs network too). */
  const arreterNote = (): void => {
    if (ticker) clearInterval(ticker);
    ticker = null;
    void enregistreur.arreter().then((note) => {
      state.note = note;
      state.voice = note === null ? 'refused' : state.offline ? 'queued' : 'recorded';
      render();
    });
  };

  /**
   * THE PAYMENT ATTEMPT'S GENERATION (verifier BLOCKER 3).
   *
   * Cancelling has to cancel what is ALREADY IN FLIGHT, not just what is
   * scheduled. `clearT()` kills the pending timers, but a reservation request
   * already on the wire resolves later and would happily schedule the provider
   * simulation onto a buyer who left. Every `clearT()` bumps this counter; a
   * resolved `reserve` compares the generation it started in and does nothing if
   * it has moved. « Nous ne dirons jamais le contraire » has to survive her
   * pressing Retour.
   */
  let generation = 0;

  function clearT(): void {
    if (t1) clearTimeout(t1);
    if (t2) clearTimeout(t2);
    if (tSuivi) clearTimeout(tSuivi);
    if (ticker) clearInterval(ticker);
    t1 = t2 = tSuivi = null;
    suiviEnAttenteDeRetour = null;
    echecsSuivi = 0;
    ticker = null;
    generation += 1;
  }

  function prefill(screen: EcranLineaire): void {
    const idx = ECRANS.indexOf(screen);
    // GEO-ACHAT-2 — a confirmed pin is a real destination: fabricating a
    // demo zone/repère over it would put an invented quartier ON THE WIRE
    // (the contact is assembled from these fields at send). The prefill
    // exists for direct harness mounts, where no pin can exist.
    if (idx >= 1 && state.pin === null) {
      state.zone = state.zone || 'Gounghin';
      state.repere = state.repere || 'Face à la pharmacie du marché';
    }
    if (idx >= 2 && screen !== 'C3') state.delivery = state.delivery || 'today';
    if (idx >= 4) state.pay = state.pay || 'B';
  }

  function jump(screen: EcranLineaire, extra?: Partial<FlowState>): void {
    clearT();
    // LEAVING C3 STOPS HER NOTE (verifier, 2026-08-09). Nothing paused it, so
    // her own voice followed her onto C4 and C5 with no control anywhere on
    // screen to stop it — the same defect Séra already treats as a bug when the
    // rider accepts a course. The control is gone; the sound goes with it.
    noteAudio?.pause();
    // GEO-ACHAT-2 — a question she walked away from is a question answered
    // « non »: the candidate dies with the screen, and a carte face never
    // survives a navigation (the LISTE-VOIX consent lesson, on the map).
    pinCandidat = null;
    if (state.geo === 'carte') state.geo = 'repos';
    state.sheet = false;
    state.paying = 'idle';
    // Landing on a screen ends the refusal that was standing in front of it.
    state.refus = null;
    // Pixel order (§3): prefill FIRST, the explicit extra LAST — so a jump's
    // own resets (« Commander » → C3 vide · C4 → livraison non choisie) always
    // win over the prefill. Inverting this leaked the demo zone/repère into
    // the live buyer path (verifier finding, 2026-07-22).
    prefill(screen);
    Object.assign(state, extra);
    state.screen = screen;
    render();
  }

  function toast(msg: string): void {
    const id = Date.now() + Math.random();
    state.toasts.push({ id, m: msg });
    render();
    setTimeout(() => {
      state.toasts = state.toasts.filter((t) => t.id !== id);
      render();
    }, 2800);
  }

  const recTime = (): string => `0:${String(state.vSec).padStart(2, '0')}`;
  const telValide = (): boolean => (state.phone.match(/[0-9]/g) ?? []).length >= 8;
  // GEO-ACHAT-2 (founder, 2026-08-31): a CONFIRMED position makes the number
  // the only requirement — the quartier and the repère still help the rider
  // but gate nothing. Without a pin, the standing law is untouched: quartier
  // + number + (written repère or her voice).
  const canC3 = (): boolean =>
    telValide() &&
    (state.pin !== null ||
      (!!state.zone && (state.repere.trim().length > 0 || state.voice === 'recorded' || state.voice === 'queued')));

  const c3State = (): Parameters<typeof renderC3>[0] => ({
    zone: state.zone, zoneFiltre: state.zoneFiltre, repere: state.repere, phone: state.phone,
    voice: state.voice, recTime: recTime(), geo: state.geo,
    // GEO-ACHAT-2 — the carte face's unconfirmed fix; the ONE place a
    // coordinate reaches a render, because the map must centre on it.
    carte: state.geo === 'carte' && pinCandidat !== null ? { lat: pinCandidat.lat, lng: pinCandidat.lng } : null,
    canContinue: canC3(),
  });

  function screenHtml(): string {
    // A NAMED REFUSAL OUTRANKS EVERY SCREEN. It is not an overlay and not a
    // toast: while it stands, there is no price, so no priced screen may draw.
    if (state.refus !== null) return renderRefus(state.refus);
    const q = quoteOrNull();
    switch (state.screen) {
      case 'C1':
        return renderC1(m, { epuise: state.stock === 'out', sansVoix: init.sansVoix ?? false });
      case 'C3':
        return renderC3(c3State());
      case 'C4':
        // Render-time fallbacks — the pixel's zoneUpper/repereRecap `||` pair,
        // so a direct C4 mount shows a coherent récap without touching state.
        // GEO-ACHAT-2 — on the pin road NOTHING is fabricated: an invented
        // « Gounghin » or demo repère would end up in the dispatch contact.
        return q === null ? renderRefus('') : renderC4(q, {
          zone: state.zone || (state.pin !== null ? '' : 'Gounghin'),
          repereRecap: state.pin !== null ? state.repere.trim() : state.repere || 'Face à la pharmacie du marché',
          positionGps: state.pin !== null,
          delivery: state.delivery,
          ligneUnique: state.serverQuote !== null,
          // LISTE-ADRESSE — the récap the friend never wrote is replaced by
          // the one true sentence; the fallbacks above become unreachable
          // fiction on this road and must never paint.
          ...(init.livraisonListe !== undefined ? { livreChez: init.livraisonListe.nom } : {}),
        });
      case 'C5':
        return q === null ? renderRefus('') : renderC5(m, q, {
          delivery: state.delivery ?? 'today', pay: state.pay,
          paying: state.paying, bInel: state.bInel,
        });
      case 'C6':
        // SP3.3b2 — THE `?? 'B'` IS GONE. It invented a mode on any mount where
        // she had not chosen one, and then stated that mode's fee as a payment
        // the operator had confirmed. `state.pay === null` now yields no split,
        // and C6 renders the sentence without an amount rather than with a
        // guessed one.
        return q === null ? renderRefus('') : renderC6(m, {
          confirmState: state.confirmState,
          paid: state.pay === null ? undefined : splitFor(q, state.delivery ?? 'today', state.pay),
          relance: state.relance,
          horsPortee: state.horsPortee,
          // SANDBOX-PAY-1 — the server's own order id, or nothing: the
          // offline/outbox states have no server order to name yet.
          commande: state.orderId ?? undefined,
          // LISTE-MERCI — the creator's prénom alone; the number stays in
          // state and never enters the DOM.
          merci: state.merci !== null ? { nom: state.merci.nom } : undefined,
        });
      case 'C7': {
        if (reel) {
          /**
           * ═══ VRAI-SUIVI — THE REAL TIMELINE DERIVES FROM FACTS ═══
           *
           * The step is `etapeDeSuivi` over the marks the SERVER last reported
           * — never `state.step`, never a tap, never a clock. « Simuler » is
           * unrenderable on this branch (`reel: true` wins over the `demo`
           * default). « Je suis à la porte » needs the live checkout handle
           * (the door charge rides it), so the re-entry mount withholds it.
           */
          return renderC7({
            step: etapeDeSuivi({ ...state.marques, livree: state.livree }),
            problem: state.problem,
            demo,
            reel: true,
            commande: state.orderId ?? undefined,
            // ═══ CODE-VISIBLE (founder 2026-08-13): « when i am on the suivi
            // screen i can not go back to the previous screen to see the code
            // to give the rider. » The arrivedAt gate is GONE — her own code
            // road stays open for the whole live delivery. The gate protected
            // nothing: the reveal authority is the REMISE ROUTE, which answers
            // by its own rules (and refuses before them), so pre-arrival C9
            // shows the honest waiting card — while the gate locked her out at
            // the door whenever the arrival fact lagged. Only `livree` still
            // closes the road: a delivered order has no code left to give.
            voirCode: !state.livree,
            porte: state.live !== null,
            relance: state.suiviRelance,
            horsPortee: state.suiviHorsPortee,
            terminee: state.livree && !state.termineeVue,
          });
        }
        return renderC7({ step: state.step, problem: state.problem, demo });
      }
      case 'C8':
        return q === null ? renderRefus('') : renderC8(m, q, {
          door: state.door,
          pay: state.pay ?? 'B',
          reason: state.reason,
          // THE SERVER'S SPLIT for her chosen mode, or NO figure at all. Same
          // rule as C6's amount clause: `undefined` is a state with no amount,
          // never a state with a fallback one.
          duAlaPorte: state.pay === null
            ? undefined
            : splitFor(q, state.delivery ?? 'today', state.pay)?.dueAtDelivery,
        });
      case 'C10':
        // The end of the road. It takes no state: everything it says is true of
        // any finished delivery, and a finished order must not depend on a read.
        return renderC10();
      case 'C9': {
        if (reel) {
          /**
           * ═══ VRAI-SUIVI — THE REAL C9 SHOWS THE REMISE ROUTE'S CODE, OR
           *     WAITS HONESTLY. `CODE_REMISE` (the '734 921' demo constant) is
           *     UNREACHABLE from this branch: the renderer's real variant reads
           *     only `state.codeRemise`, which only the service can fill. ═══
           */
          return renderC9({
            revealed: state.codeRemise !== null,
            reel: true,
            ...(state.codeRemise !== null ? { code: state.codeRemise } : {}),
            arrivee: state.marques.arrivedAt !== undefined,
          });
        }
        return renderC9({ revealed: state.leg2 === 'confirmed' });
      }
    }
  }

  /**
   * WHICH TRUE SENTENCE THIS ANSWER GETS. The server's own name when it refused;
   * `unreachable` ONLY when nothing answered (that is the screen that says « Pas
   * de connexion », and it must not be shown to someone on full 4G);
   * `answer_unreadable` when a reply arrived that we could not read — an unnamed
   * 500, a proxy's HTML, amounts that fail the money shape-check. The latter is
   * not in the refusal table, so it renders the GENERIC card (« Nous ne pouvons
   * pas afficher le prix. »), which is the only thing true about it.
   */
  function nomDuRefus(r: { status: 'refused'; reason: string } | { status: 'unreachable' } | { status: 'unreadable' }): string {
    if (r.status === 'refused') return r.reason;
    return r.status === 'unreadable' ? 'answer_unreadable' : 'unreachable';
  }

  /**
   * ASK THE SERVER FOR THE PRICE — once, at the first moment the destination
   * exists. The skeleton stands while it waits; the answer decides the screen.
   * NOTHING here composes, guesses, or falls back to a local price: a refusal
   * and an unreachable service both land on the honest surface, because a price
   * we invented is worse than no price.
   */
  async function demanderLePrix(renouveler = false, auto = false, reprendre?: Reprise): Promise<void> {
    const ask = init.quoteSource;
    if (ask === undefined) return;
    // WHAT SHE HAD CHOSEN, so an automatic refresh does not quietly throw it
    // away (verifier ITEM 3): she tapped « Payer 12 500 FCFA », not « take me
    // back to the delivery screen and forget which button I pressed ».
    const modeAvant = state.pay;
    const totalAvant = state.serverQuote?.totalToday ?? null;
    state.refus = null;
    state.loading = true;
    // SAY THAT IT IS HAPPENING. The skeleton alone reads as « still loading »;
    // this names the reason she was moved off the Payer button.
    if (auto) toast(MESSAGES.prixEnCoursDeMiseAJour);
    render();
    let fetched: QuoteFetch;
    try {
      fetched = await ask(state.zone ?? '', renouveler);
    } catch {
      // ANY REJECTION, FROM ANY CAUSE, LANDS ON A SCREEN WITH AN ACTION
      // (verifier BLOCKER 4). Without this the throw escaped, `loading` stayed
      // true, and the buyer sat on the skeleton forever — no message, no back
      // button, no request ever sent. A frozen screen on the money path is the
      // worst answer available; the honest generic card is the least bad.
      state.loading = false;
      state.refus = 'answer_unreadable';
      render();
      return;
    }
    state.loading = false;
    if (fetched.status !== 'ready') {
      state.refus = nomDuRefus(fetched);
      render();
      return;
    }
    state.serverQuote = fetched.quote;
    state.bInel = fetched.bIndisponible;
    state.live = {
      quoteId: fetched.ids.fullQuoteId,
      commandId: fetched.ids.commandId,
      expiry: fetched.expiry,
      reserve: fetched.reserve,
      commander: fetched.commander,
      etatCommande: fetched.etatCommande,
      payerALaPorte: fetched.payerALaPorte,
      remise: fetched.remise,
    };
    // A NEW PRICE IS A NEW CHECKOUT. The old order id belonged to the old
    // quote; carrying it forward would let « Vérifier à nouveau » poll an order
    // that no longer describes what she is about to pay.
    state.orderId = null;
    state.essai = 0;
    state.relance = false;
    state.horsPortee = false;
    state.doorLeg = null;
    state.essaiPorte = 0;
    // …and the old order's delivery facts die with its id (VRAI-SUIVI).
    state.buyerRef = null;
    state.marques = {};
    state.livree = false;
    state.codeRemise = null;
    state.suiviRelance = false;
    state.suiviHorsPortee = false;
    state.termineeVue = false;
    // ═══ IS THIS PHONE'S CLOCK TRUSTWORTHY? (verifier BLOCKER 5) ═══
    // A quote the service JUST issued is alive by construction. If this device
    // reads it as already expired, the wrong clock is the phone's — so the local
    // expiry gate is not evidence about the price and must not be allowed to
    // refuse forever. An unparsable/absent expiry lands here too: « this phone
    // cannot tell » is the same situation.
    state.horlogeDouteuse = prixExpire(fetched.expiry, Date.now());
    // « THIS PRICE CAME FROM AN AUTOMATIC REFRESH », and nothing else.
    //
    // THE DEFECT THIS CLOSES (found while writing the round-5 spec): this line
    // read `= false` unconditionally, so the flag was cleared by the very
    // refresh that set it. The « one automatic refresh, then tell her » rule it
    // exists to enforce could therefore never fire — every Payer tap on a stale
    // price silently re-asked, forever, and `Ce prix a expiré` was unreachable.
    // That is exactly why the verifier's mutation of the `!state.prixRafraichi`
    // guard survived: the guard was already dead. A MANUAL ask (Continuer,
    // Réessayer, « Voir le prix à jour ») still clears it — she asked, so she
    // gets a fresh allowance.
    state.prixRafraichi = auto;

    if (auto) {
      // TELL HER WHAT CHANGED, calmly, and only if something did.
      const total = fetched.quote.totalToday;
      toast(
        totalAvant !== null && totalAvant !== total
          ? `${MESSAGES.prixRafraichiDifferent} ${fmtFCFA(total)}`
          : MESSAGES.prixRafraichiIdentique,
      );
      // KEEP HER WHERE SHE WAS, WITH HER MODE — unless the new quote makes that
      // mode impossible, in which case the existing « Pas disponible » state on
      // C5 already speaks for itself and she chooses again.
      const modeEncorePossible = modeAvant === 'A' || (modeAvant === 'B' && !fetched.bIndisponible);
      if (modeAvant !== null) {
        jump('C5', { delivery: 'today', pay: modeEncorePossible ? modeAvant : null });
        return;
      }
    }
    // ═══ REPRISE-PWA — the refresh lands back on HER screen, not on ours ═══
    //
    // C4, C5 and C6 cannot render without the server's price, so the resume
    // came through this ask. The request key and command ids are deliberately
    // reload-stable (quote-port.ts), so on the real service this re-ask is
    // answered with the SAME quote and her own hold/order replay — the exact
    // reload road those storage slots were built for.
    if (reprendre !== undefined) {
      // Her C3 answers travel as jump EXTRAS so the demo prefill can never
      // dress a real journey (the 2026-07-22 leak class): extras win last.
      const extras = { zone: reprendre.zone, repere: reprendre.repere, phone: reprendre.phone };
      if (reprendre.ecran === 'C6' && reprendre.orderId !== null && reprendre.buyerRef !== null) {
        // The order is hers again — but its truth is the SERVER'S: C6 mounts
        // WAITING and the payment watch re-asks, so a payment that was in
        // flight resumes as « nous attendons », never as paid (the SP3.3c law,
        // kept across the reload). `essai` restored ⇒ a retry from here mints
        // a genuinely new command instead of replaying the old attempt.
        state.orderId = reprendre.orderId;
        state.buyerRef = reprendre.buyerRef;
        state.essai = reprendre.essai;
        jump('C6', { ...extras, confirmState: 'attente', delivery: reprendre.delivery ?? 'today', pay: reprendre.pay, step: 1 });
        suivreLePaiement(reprendre.orderId, generation, 0);
        return;
      }
      // Mode B may have died with the re-asked quote — the same rule the
      // automatic refresh applies: an impossible mode is unchosen, never
      // silently swapped for another.
      const modePossible = reprendre.pay === 'A' || (reprendre.pay === 'B' && !fetched.bIndisponible);
      jump(reprendre.ecran === 'C5' ? 'C5' : 'C4', {
        ...extras,
        delivery: reprendre.delivery ?? 'today',
        pay: modePossible ? reprendre.pay : null,
      });
      return;
    }
    // ONE fee for this zone pair ⇒ nothing to choose ⇒ the C4 CTA is live on
    // arrival. `delivery` is set only so the selectors have a slot to read; both
    // slots carry the SAME server figure, so the choice cannot change a franc.
    jump('C4', { delivery: 'today' });
  }

  /**
   * ═══ SP3.3c — ASK THE SERVER WHETHER THE OPERATOR ANSWERED ═══
   *
   * ONE READ, then it schedules the next one from `SUIVI_PAIEMENT_MS` — or
   * stops and hands the buyer the button. Reads the order's OWN state and
   * nothing else; there is no clock in this function and no branch in which it
   * can decide, by itself, that a payment happened.
   *
   * A FAILED READ IS NOT A FAILED PAYMENT, and the code says so structurally:
   * `refused`, `unreachable` and `unreadable` all leave `confirmState`
   * UNTOUCHED and simply schedule the next read. Her order is exactly as alive
   * as it was a second ago — we merely did not learn anything. Turning a lost
   * poll into a visible failure would be this app inventing a payment outcome,
   * which is the whole class of bug this slice exists to remove.
   *
   * `gen` IS THE ATTEMPT'S GENERATION (the BLOCKER-3 device, reused): she may
   * tap « Suivre ma commande » or « Réessayer » while a read is on the wire, and
   * a read that resolves into a screen it no longer belongs to must write
   * nothing at all.
   */
  function suivreLePaiement(orderId: string, gen: number, etape: number): void {
    const live = state.live;
    if (live === null) return;
    void live.etatCommande(orderId).then((r) => {
      if (gen !== generation) return;
      // DID THE READ ARRIVE? That is ALL this records. It never becomes a
      // payment outcome — `confirmState` is untouched on every failure branch,
      // exactly as before. It exists so « Vérifier à nouveau » always answers
      // her instead of being a tap that changes nothing (verifier BLOCKER 2).
      state.horsPortee = r.status !== 'order';
      if (r.status === 'order') {
        const etat = etatDeC6(r.order.state);
        state.confirmState = etat;
        state.doorLeg = r.order.doorLeg ?? null;
        absorberMarques(r.order); // VRAI-SUIVI — every order read carries the marks
        // SETTLED, EITHER WAY ⇒ STOP ASKING. `confirmed` and `echec` are the two
        // states the server will not move off on its own, so a further read
        // could only ever return the same answer at her expense.
        if (etat !== 'attente') {
          state.relance = false;
          // LISTE-MERCI — the poll is the ordinary road to a confirmed sight.
          if (etat === 'confirmed') chargerMerci();
          render();
          return;
        }
      }
      const attente = SUIVI_PAIEMENT_MS[etape];
      if (attente === undefined) {
        // OUT OF SCHEDULED READS — not out of hope. The sentence on screen does
        // not change; she gains a way to ask again, one request at a time.
        state.relance = true;
        render();
        return;
      }
      render();
      tSuivi = setTimeout(() => suivreLePaiement(orderId, gen, etape + 1), attente);
    });
  }

  /**
   * ═══ SP4.2b — SHE PAYS FOR THE PRODUCT AT HER DOOR, AND THEN WAITS ═══
   *
   * §5.5: « product paid by MoMo AT THE DOOR BEFORE CUSTODY TRANSFER; not COD ».
   * §6.3: the drop code comes AFTER that payment is provider-confirmed.
   *
   * THE 2 600 ms `setTimeout` THAT USED TO STAND HERE IS GONE. It showed her
   * « Payez le reste » and then, two and a half seconds later, revealed her drop
   * code — with no charge sent, no operator asked and no confirmation received.
   * The same clock-instead-of-a-server defect SP3.3c removed from C6, one screen
   * later and with custody on it.
   *
   * WHAT HAPPENS NOW: the charge is requested, `door = 'accepted'` stands while
   * the operator is asked (that screen already says the right thing — « Le
   * livreur ne peut pas dire "payé" à votre place. Seul l'opérateur confirme. »),
   * and the ORDER is polled until its own `doorLeg` says `paid`. Only then does
   * `revelationPermise` let C9 exist.
   */
  function payerALaPorte(gen: number): void {
    const live = state.live;
    const id = state.orderId;
    if (live === null || id === null) return;
    state.door = 'accepted';
    render();
    void live.payerALaPorte(id, state.essaiPorte).then((r) => {
      if (gen !== generation) return;
      if (r.status !== 'order') {
        // The service refused to start the collection, or we could not read the
        // answer. NOTHING was paid — the charge lives past this point.
        state.door = 'echec';
        render();
        return;
      }
      // A 200 IS NOT A PAYMENT. The order comes back with the door leg still
      // `due` by the service's own design; the webhook is what moves it.
      state.doorLeg = r.order.doorLeg ?? null;
      suivreLaPorte(id, gen, 0);
    });
  }

  /**
   * WATCH THE DOOR LEG, on the same bounded schedule the checkout leg uses and
   * for the same reasons (Ten Laws #7 — her data, her battery, at her door).
   *
   * A FAILED READ IS NOT A FAILED PAYMENT: the loop keeps its state and simply
   * asks again. Running out of reads leaves her on the waiting screen with the
   * money owed and nothing claimed — never on a drop code.
   */
  function suivreLaPorte(orderId: string, gen: number, etape: number): void {
    const live = state.live;
    if (live === null) return;
    void live.etatCommande(orderId).then((r) => {
      if (gen !== generation) return;
      if (r.status === 'order') {
        state.doorLeg = r.order.doorLeg ?? null;
        absorberMarques(r.order); // VRAI-SUIVI — the door watch reads orders too
        if (state.doorLeg === 'paid') {
          // PROVIDER-CONFIRMED. Only now, and §6.3 is satisfied. On the real
          // path C9 shows the REMISE ROUTE'S code (or its honest wait) — the
          // ask goes out AFTER the jump, so it lives in the NEW generation and
          // its answer is not discarded as a stale one.
          jump('C9', { leg2: 'confirmed', step: 6, door: 'inspecting' });
          if (state.marques.arrivedAt !== undefined) demanderLeCode();
          // ═══ THE WATCH FOLLOWS HER TO C9 — the voir-code fix (e6bcc54),
          // owed on this road too. `jump` killed the delivery watch; without
          // this restart the remise happens, the server records `livree`, and
          // her screen shows the code for ever — no C10, no close.
          demarrerSuivi();
          return;
        }
      }
      const attente = SUIVI_PAIEMENT_MS[etape];
      if (attente === undefined) {
        // Out of scheduled reads. She stays where she is — owed, unconfirmed,
        // and told so — with the retry under her thumb.
        state.door = 'echec';
        render();
        return;
      }
      render();
      tSuivi = setTimeout(() => suivreLaPorte(orderId, gen, etape + 1), attente);
    });
  }

  /**
   * ═══ VRAI-SUIVI — THE DELIVERY'S FACTS, TAKEN FROM EVERY ORDER READ ═══
   *
   * The marks are REPLACED WHOLESALE with what the server just said — this
   * client holds no memory a fresh read cannot overrule, because the server is
   * the only party that ever recorded a fact. `livree` alone is a ratchet: a
   * remise that happened cannot un-happen, and a glitchy later read must not
   * resurrect a finished tracking.
   */
  function absorberMarques(order: ServerOrder): void {
    state.marques = {
      ...(order.acceptedAt !== undefined ? { acceptedAt: order.acceptedAt } : {}),
      ...(order.readyAt !== undefined ? { readyAt: order.readyAt } : {}),
      ...(order.departedAt !== undefined ? { departedAt: order.departedAt } : {}),
      ...(order.arrivedAt !== undefined ? { arrivedAt: order.arrivedAt } : {}),
    };
    if (order.livree === true) state.livree = true;
  }

  /**
   * ═══ VRAI-SUIVI — ASK FOR HER CODE, ONCE THE ARRIVAL FACT EXISTS ═══
   *
   * Fired from exactly two places: a tracking read that just observed
   * `arrivedAt`, and the C9 entry/retry. Single-flight (`codeEnDemande`), and
   * idempotent once a code exists. A refusal is SILENT here on purpose: the
   * waiting card already says the true sentence, and the service's nameless
   * 404 carries nothing further to say. The generation guard is the standing
   * BLOCKER-3 device — an answer that lands after she navigated writes nothing.
   */
  let codeEnDemande = false;
  function demanderLeCode(): void {
    const id = state.orderId;
    const ref = state.buyerRef;
    const lire = lireRemise();
    if (id === null || ref === null || lire === null) return;
    if (codeEnDemande || state.codeRemise !== null) return;
    codeEnDemande = true;
    const gen = generation;
    void lire(id, ref).then((r) => {
      codeEnDemande = false;
      if (gen !== generation) return;
      if (r.status === 'code') state.codeRemise = r.code;
      render();
    });
  }

  /**
   * ═══ VRAI-SUIVI — WATCH THE DELIVERY, on the SAME bounded ladder the
   *     payment watch uses, and for the same Ten-Laws-#7 reasons ═══
   *
   * One read, then the next from `SUIVI_PAIEMENT_MS` — or it stops and hands
   * her « Vérifier à nouveau ». It reads the order's OWN marks and nothing
   * else: there is no clock here and no branch that can advance a step by
   * itself. A FAILED READ IS NOT A FAILED DELIVERY — `suiviHorsPortee` adds a
   * fact about the network and removes none about the parcel. The ladder ends
   * for good at `livree`: a finished order costs her no further data.
   */
  function suivreLaLivraison(orderId: string, gen: number, etape: number): void {
    const lire = lireCommande();
    if (lire === null) return;
    void lire(orderId).then((r) => {
      if (gen !== generation) return;
      state.suiviHorsPortee = r.status !== 'order';
      if (r.status === 'order') {
        absorberMarques(r.order);
        state.doorLeg = r.order.doorLeg ?? null;
        // THE ARRIVAL FACT LANDED ⇒ her code exists on the service. Fetch it
        // now, so « Voir mon code » opens on the figure and not on a spinner.
        if (state.marques.arrivedAt !== undefined && state.codeRemise === null) demanderLeCode();
        if (state.livree) {
          // ═══ THE DELIVERY IS PROVEN ⇒ THE SCREEN ENDS (founder 2026-08-12) ══
          //
          // It used to stay on C7 — a six-step timeline with a « C'est terminé »
          // button bolted on — so a finished order still read as one being
          // waited for. `jump` bumps the generation, which also stops this watch
          // for good: a finished order costs her no further read.
          state.suiviRelance = false;
          jump('C10');
          return;
        }
        // A read that ANSWERED clears the run: the ladder holds for as long as
        // the service is actually talking to her.
        echecsSuivi = 0;
      } else {
        /**
         * ═══ THE WATCH HOLDS ONLY WHILE IT CAN SUCCEED (verifier BLOCKER) ═══
         *
         * SUIVI-VIVANT made the ladder infinite and, in the same stroke, deleted
         * the only `suiviRelance = true` — so « Vérifier à nouveau » could no
         * longer render and C7's other controls are all gated on facts a failing
         * read never delivers. Two states were therefore reachable and
         * INESCAPABLE: an order the service will never answer for (a purged id,
         * a record written against another base) and a link that keeps refusing.
         * The screen froze with no control on it while her phone spent a request
         * every twenty seconds on paid data — the founder's original bug in a
         * worse dress, and caused by its fix.
         *
         * So the hold is CONDITIONAL on the reads landing. A run of refusals
         * stops the automatic ladder and hands her back the one honest control:
         * asking again, one request, on her choice. That is Ten-Laws #7 read
         * correctly — a failed read is still not a failed delivery, so the
         * timeline keeps every proven step and `suiviHorsPortee` says only that
         * the network is missing.
         */
        echecsSuivi += 1;
        if (echecsSuivi >= SUIVI_ECHECS_AVANT_PAUSE) {
          state.suiviRelance = true;
          render();
          return;
        }
      }
      // NO LONGER RUNS OUT (founder 2026-08-12). The ladder ramps and then holds,
      // so the timeline keeps following the parcel instead of freezing 35 s in
      // and making every later movement something she has to ask for.
      render();
      if (cacheeMaintenant()) {
        // Hidden page ⇒ no timer at all. `reprendreSuivi` takes one read the
        // moment she returns, so nothing is missed and nothing is spent.
        suiviEnAttenteDeRetour = etape;
        return;
      }
      tSuivi = setTimeout(() => suivreLaLivraison(orderId, gen, etape + 1), attenteLivraison(etape));
    });
  }

  /** Start (or restart) the tracking watch — every road INTO C7 calls this,
   *  after its `jump` has already bumped the generation. */
  function demarrerSuivi(): void {
    const id = state.orderId;
    if (!reel || id === null || state.livree) return;
    state.suiviRelance = false;
    suiviEnAttenteDeRetour = null;
    echecsSuivi = 0;
    suivreLaLivraison(id, generation, 0);
  }

  /**
   * Is the page hidden right now? Guarded rather than assumed: this module runs
   * under a test DOM and inside a service-worker-less shell where `document`
   * may not carry `visibilityState`, and a wrong answer here would either
   * park a watch that never resumes or poll a pocket forever.
   */
  function cacheeMaintenant(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  /**
   * SHE CAME BACK — take one read immediately, then resume the ladder where it
   * parked. Immediately, because the whole point of sleeping in her pocket is
   * that the screen is CURRENT the instant she looks at it; waiting out a rung
   * first would show her a stale step and prove the sleep was a downgrade.
   */
  function reprendreSuivi(): void {
    if (suiviEnAttenteDeRetour === null || cacheeMaintenant()) return;
    const id = state.orderId;
    const etape = suiviEnAttenteDeRetour;
    suiviEnAttenteDeRetour = null;
    if (!reel || id === null || state.livree) return;
    suivreLaLivraison(id, generation, etape + 1);
  }

  const ecouteVisibilite =
    typeof document !== 'undefined' && typeof document.addEventListener === 'function';
  if (ecouteVisibilite) document.addEventListener('visibilitychange', reprendreSuivi);

  /**
   * STOP THIS INSTANCE FOR GOOD. Bumps the generation first, so any read
   * already on the wire is discarded when it lands rather than rendering into a
   * detached container; then kills every timer and takes the listener off
   * `document`. Idempotent — calling it twice is a no-op, which matters because
   * the caller cannot always know whether a mount happened.
   */
  function arreter(): void {
    generation += 1;
    clearT();
    if (ecouteVisibilite && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', reprendreSuivi);
    }
  }

  /**
   * CREATE THE ORDER, THEN WATCH IT. The « ENVOI SÉCURISÉ » screen stands while
   * the order request is on the wire; C6 mounts on the state the SERVICE
   * returned, which today is `payment_pending` and therefore « Nous attendons
   * l'opérateur. » — never a confirmation, because a created order is not a
   * paid one.
   */
  /** BC-1b — the dispatch contact, from C3's own answers: her number, her
   *  quartier, and the repère (possibly '' when she chose the voice note or
   *  the pin — the service accepts an empty repère). GEO-ACHAT-2: a confirmed
   *  pin stands in for the quartier, so the contact rides with quartier ''
   *  on the phone-only road — the service holds the same law at its door.
   *  Assembled at SEND, so a corrected number on a retry travels corrected. */
  function contactLivraison(): { phone: string; quartier: string; repere: string; audioB64?: string; pin?: { lat: number; lng: number; accuracy?: number } } | undefined {
    const phone = state.phone.trim();
    const quartier = state.zone ?? '';
    if (phone === '' || (quartier === '' && state.pin === null)) return undefined;
    const repere = state.repere.trim().slice(0, 200);
    return {
      phone: phone.slice(0, 32),
      quartier: quartier.slice(0, 120),
      repere,
      // REPERE-AUDIO-REEL — her recorded note rides the create beside the
      // text, assembled at SEND like everything else here.
      ...(state.note !== null ? { audioB64: state.note.audioB64 } : {}),
      // GEO-ACHAT-1 — her pin rides the same way: present only while the
      // « Position ajoutée » face stands, gone the moment she retires it.
      ...(state.pin !== null ? { pin: state.pin } : {}),
    };
  }

  function passerLaCommande(mode: ModePaiement, gen: number): void {
    const live = state.live;
    if (live === null) return;
    state.paying = 'provider';
    render();
    void live.commander(mode, state.essai, contactLivraison()).then((r) => {
      if (gen !== generation) return;
      if (r.status !== 'order') {
        // The service refused to create the order (an expired hold, a hold
        // someone else has, a dead quote) — or we could not read its answer.
        // Its own name reaches the honest refusal surface, exactly as a refused
        // reserve does. NOTHING was charged: the charge happens inside the
        // order path we did not get through.
        state.paying = 'idle';
        state.refus = nomDuRefus(r);
        render();
        return;
      }
      state.orderId = r.order.orderId;
      state.doorLeg = r.order.doorLeg ?? null;
      absorberMarques(r.order);
      /**
       * ═══ VRAI-SUIVI — THE ORDER FOLLOWS HER PHONE HOME ═══
       *
       * The CREATE (and only the create — the service's design) carries her
       * bearer ref. It is kept, and the {orderId, buyerRef, at} record lands
       * in localStorage so « Ma commande » can reopen this tracking after the
       * tab dies. ONE slot, newest wins — pilot scale. Best-effort: a dead
       * storage costs the shortcut, never the order.
       */
      if (r.order.buyerRef !== undefined) {
        state.buyerRef = r.order.buyerRef;
        garderCommande(
          { orderId: r.order.orderId, buyerRef: r.order.buyerRef, at: new Date().toISOString() },
          localStorageOrUndefined(),
        );
      }
      const etat = etatDeC6(r.order.state);
      jump('C6', { confirmState: etat, step: 1, orderId: r.order.orderId, relance: false, horsPortee: false });
      // REPERE-AUDIO-REEL — a LOST note gets its sentence, spoken once, calm:
      // her order is untouched and her written repère travelled. Silence here
      // was the diagnostic hole the founder hit — a note could die on the
      // media hop with nothing anywhere saying so.
      if (r.order.noteVocale === 'perdue') {
        toast('Votre note vocale n’a pas pu être gardée. Votre repère écrit est bien transmis.');
      }
      // `jump` cleared the timers and bumped the generation — so the watch must
      // start from the NEW one, or its first read would discard itself.
      if (etat === 'attente') suivreLePaiement(r.order.orderId, generation, 0);
      // LISTE-MERCI — a create that answered ALREADY-CONFIRMED (the replay /
      // double-tap road) is a confirmed sight too.
      if (etat === 'confirmed') chargerMerci();
    });
  }

  /**
   * LISTE-MERCI — ask ONCE, on the first confirmed sight, for the creator's
   * notify facts. Total by construction: `indisponible` (which is also every
   * network failure, the port's law) simply never renders the block — the
   * confirmation screen must not grow an error wall about a gift affordance.
   * The generation is deliberately NOT consulted: the answer mutates no
   * money state, and a purchaser who navigated away and back still deserves
   * the block on the confirmed screen she returns to. What IS consulted is
   * the container's own liveness (verifier MINOR 2): an answer landing after
   * teardown renders nothing — the instance's standing law that no read may
   * land in a detached container.
   */
  function chargerMerci(): void {
    const source = init.merci;
    if (source === undefined || state.merciDemande) return;
    if (state.orderId === null || state.buyerRef === null) return;
    state.merciDemande = true;
    void source.charger(state.orderId, state.buyerRef).then((r) => {
      if (r.status !== 'merci' || !container.isConnected) return;
      state.merci = { nom: r.nom, telephone: r.telephone };
      render();
    });
  }

  /**
   * REPRISE-PWA — write the journey where a refresh will look for it. Called
   * from `render()` (the one choke point every state change crosses) and from
   * every field commit, so the snapshot is never older than the screen. C1 and
   * C10 CLEAR the slot instead of writing: the start and the end of a journey
   * are not places a refresh should resurrect. What is written — and what may
   * never be — is the codec's law (reprise.ts): no code, no server truth, no
   * amount.
   */
  function noterReprise(): void {
    const rep = init.reprise;
    if (rep === undefined) return;
    if (state.screen === 'C1' || state.screen === 'C10') {
      oublierReprise(rep.storage);
      return;
    }
    garderReprise(
      {
        lien: rep.lien,
        ecran: state.screen,
        zone: state.zone,
        repere: state.repere,
        phone: state.phone,
        delivery: state.delivery,
        pay: state.pay,
        orderId: state.orderId,
        buyerRef: state.buyerRef,
        essai: state.essai,
      },
      rep.storage,
    );
  }

  function render(): void {
    // VOIX-ÉTAT-2 — THE FACE MUST SURVIVE THE REBUILD (verifier, 2026-08-09).
    // This replaces the WHOLE of `container.innerHTML`, so the recorded block
    // comes back from `renderVoiceBlock` with the play triangle and the static
    // total — while `noteAudio` keeps playing and `timeupdate` keeps writing the
    // running position into the freshly-built clock node. Tapping a zone chip
    // mid-note left her looking at a play triangle over a counting clock, which
    // is the same lie as a pause glyph over silence, inverted.
    //
    // The audio is NOT stopped here: a re-render is not her asking for silence
    // (a toast alone triggers one), and cutting her own note because a chip
    // moved would be its own defect. The face is re-applied instead.
    const noteEnCours = noteAudio !== null && !noteAudio.paused;
    container.innerHTML = [
      '<div class="cl-status"></div>',
      '<div class="cl-lisere"></div>',
      state.offline ? renderOffline() : '',
      `<div class="cl-stage">${state.loading ? renderSkeleton() : screenHtml()}</div>`,
      state.sheet ? renderSheet() : '',
      state.galerie !== null ? renderGalerie(m, state.galerie) : '',
      // GEO-CARTE-PRO — the carte face is a TOP layer like the galerie, a
      // SIBLING of the stage: inside `.cl-screen` its entry animation's
      // transform would capture the face's position:fixed and pin it to the
      // scrolled screen box (driven red before this line existed).
      state.screen === 'C3' && state.refus === null && !state.loading && state.geo === 'carte' && pinCandidat !== null
        ? renderGeoCarte(c3State(), { lat: pinCandidat.lat, lng: pinCandidat.lng })
        : '',
      renderToasts(state.toasts),
    ].join('');
    if (noteEnCours && noteAudio !== null) {
      noteGlyphe(true);
      noteHorloge(fmtSecondes(noteAudio.currentTime));
    }
    // GEO-CARTE-PRO — the carte face just rebuilt: fill its tile grid around
    // the candidate and wire the drag. A finished drag COMMITS to the
    // candidate (accuracy dropped — the ±m described the sensor's fix, not
    // the point her hand chose) and re-renders; mid-drag only the coordinate
    // readout moves. Promotion to a kept pin stays `geo-confirmer`'s alone.
    if (state.geo === 'carte' && pinCandidat !== null) {
      const vue = container.querySelector('[data-role="geo-vue"]');
      if (vue instanceof HTMLElement) {
        monterCarteVue(
          vue,
          pinCandidat,
          (c) => {
            if (state.geo !== 'carte') return;
            pinCandidat = { lat: Math.round(c.lat * 1e6) / 1e6, lng: Math.round(c.lng * 1e6) / 1e6 };
            render();
          },
          (c) => {
            const noeud = container.querySelector('[data-role="geo-coords"]');
            if (noeud !== null) noeud.textContent = fmtCoords(c);
          },
        );
      }
    }
    noterReprise();
  }

  /** Live-enable the C3 CTA while she types — no re-render, no lost focus. */
  function patchC3Cta(): void {
    const btn = container.querySelector<HTMLButtonElement>('[data-action="continuer-c3"]');
    if (!btn) return;
    const on = canC3();
    btn.classList.toggle('cl-cta-off', !on);
    btn.disabled = !on;
  }

  container.addEventListener('input', (ev) => {
    const el = ev.target as HTMLInputElement;
    const role = el.getAttribute('data-role');
    if (role === 'repere') { state.repere = el.value; patchC3Cta(); }
    if (role === 'quartier-filtre') {
      // QUARTIERS-OUAGA-1 — typing filters the répertoire; only the chip
      // cloud is patched (a full re-render would steal her caret, the same
      // law the repère and phone fields already live by).
      state.zoneFiltre = el.value;
      const nuage = container.querySelector('[data-role="quartier-chips"]');
      if (nuage !== null) nuage.innerHTML = renderQuartierChips(state.zone, state.zoneFiltre);
    }
    if (role === 'phone') {
      /**
       * TEL-PAIRES (founder order 2026-08-09) — the field does what its own
       * placeholder shows: pairs, as she types. The caret is restored after
       * the same COUNT OF DIGITS it stood behind, so a correction in the
       * middle never throws her to the end of her number.
       */
      const caret = el.selectionStart ?? el.value.length;
      const chiffresAvant = el.value.slice(0, caret).replace(/\D/g, '').length;
      const net = telEnPaires(el.value);
      if (net !== el.value) {
        el.value = net;
        const pos = caretApresChiffres(net, chiffresAvant);
        el.setSelectionRange(pos, pos);
      }
      state.phone = net;
      patchC3Cta();
    }
    // REPRISE-PWA — a field commit is journey state too: the typed repère and
    // her number survive a refresh even though typing never re-renders.
    noterReprise();
  });

  container.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest('[data-action]');
    if (!(el instanceof HTMLElement)) return;
    const action = el.getAttribute('data-action');
    switch (action) {
      case 'sheet-noop':
        return;
      case 'voir-boutique':
        init.onVitrine?.(el.getAttribute('data-slug') ?? m.slug);
        return;
      case 'ouvrir-protections':
        state.sheet = true; render(); return;
      // — la galerie photos (RESELLER-UX-2 item 4) — only reachable when the
      // frame rendered the affordance, i.e. at least one photo exists.
      case 'photo-galerie':
        state.galerie = 0; render(); return;
      case 'galerie-fermer':
        state.galerie = null; render(); return;
      case 'galerie-precedente':
        state.galerie = Math.max(0, (state.galerie ?? 0) - 1); render(); return;
      case 'galerie-suivante':
        // THE BOUND COUNTS SLIDES, NOT PHOTOGRAPHS. It used to count
        // `assetRefs` alone; once the clip became slide 0 that was one short,
        // and the LAST PHOTO became unreachable — a silent off-by-one that no
        // amount of tapping would reveal as a bug, only as a missing photo.
        state.galerie = Math.min(Math.max(0, galerieSlides(m).length - 1), (state.galerie ?? 0) + 1);
        render(); return;
      case 'fermer-protections':
      case 'fermer-protections-cta':
        state.sheet = false; render(); return;
      case 'commander':
        if (state.stock !== 'out') {
          // LISTE-ADRESSE — her address is stored; the friend only pays. The
          // price is asked NOW (the destination is the liste's own), and the
          // delivery form never mounts.
          if (init.livraisonListe !== undefined) {
            if (init.quoteSource !== undefined) { void demanderLePrix(); return; }
            jump('C4', { delivery: null });
            return;
          }
          jump('C3', {
            zone: null, repere: '', phone: '',
            voice: (init.microRefuse ?? false) ? 'refused' : 'idle', vSec: 0, note: null,
            geo: 'repos', pin: null,
          });
        }
        return;
      // ── LEAVING A SCREEN CANCELS WHAT THAT SCREEN STARTED ──────────────────
      // `clearT()` was missing here (verifier BLOCKER 3, pre-existing): backing
      // out of « ENVOI SÉCURISÉ » left the provider simulation's timers running,
      // and 2 400 ms later the flow teleported her onto « Paiement de 12 500
      // FCFA confirmé par l'opérateur. » — directly against that same screen's
      // « Rien n'est confirmé tant que l'opérateur n'a pas répondu. Nous ne
      // dirons jamais le contraire. » It also now sits in front of a REAL
      // server-side hold. `clearT()` bumps the generation, so a reservation
      // already in flight cannot schedule anything either.
      case 'retour-c1':
        clearT(); state.paying = 'idle'; state.refus = null; state.screen = 'C1'; render(); return;
      case 'retour-c3':
        // Also the « Changer de zone » action on the refusal surface: she goes
        // back to the one thing she can change, and the next Continuer re-asks.
        // LISTE-ADRESSE — with a stored address there IS no C3 to go back to:
        // the step behind the price is the product itself.
        clearT(); state.paying = 'idle'; state.refus = null;
        state.screen = init.livraisonListe !== undefined ? 'C1' : 'C3';
        render(); return;
      case 'retour-c4':
        clearT(); state.paying = 'idle'; state.refus = null; state.screen = 'C4'; render(); return;
      case 'retour-c7':
        jump('C7', { step: Math.max(state.step, 1) });
        // VRAI-SUIVI — landing back on the tracking restarts its watch, in
        // the generation the jump just opened.
        demarrerSuivi();
        return;
      // ── LISTE-MERCI — the purchaser tells the creator, from their OWN phone ──
      case 'merci-whatsapp': {
        const source = init.merci;
        if (source === undefined || state.merci === null || state.orderId === null) return;
        const prenom = (container.querySelector<HTMLInputElement>('[data-role="merci-prenom"]')?.value ?? '').trim();
        const alerte = container.querySelector<HTMLElement>('[data-role="merci-alerte"]');
        // The refusal is INLINE and actionable — a prénom she can type, never
        // a wall on a money screen.
        if (prenom === '') {
          if (alerte !== null) {
            alerte.textContent = MERCI.prenomManque;
            alerte.hidden = false;
          }
          return;
        }
        // The address is the service's wa.me digits, re-checked here so a
        // corrupted value can never open anything but a wa.me link — the
        // ouvrirWhatsApp law, applied where the URL is born.
        if (!/^\d{8,15}$/.test(state.merci.telephone)) return;
        // Replacement-FUNCTION form (verifier MINOR 3): `$&`-class patterns
        // in a prénom or product name travel verbatim instead of expanding.
        const texte = MERCI.message
          .replace('{prenom}', () => prenom)
          .replace('{article}', () => m.productName)
          .replace('{lien}', () => source.lienCadeau(state.orderId as string));
        window.open(`https://wa.me/${state.merci.telephone}?text=${encodeURIComponent(texte)}`, '_blank', 'noopener');
        return;
      }
      // — C1 —
      case 'voix-lire': {
        // REAL tap-to-play (founder order 2026-07-22): the reseller's note
        // plays here. No url (no ready note) → the honest demo toast.
        //
        // UNCHANGED BEHAVIOUR, one level of extraction (2026-07-30): the play
        // itself moved into `jouerLaNote` so C5 can reuse it. This screen keeps
        // its demo toast on BOTH the missing-url branch and the refusal branch,
        // exactly as before — the work order that added C5's control put C1's
        // behaviour explicitly out of scope.
        const url = el.getAttribute('data-voix-url');
        const demo = (): void => toast(`${VOIX.titre} — ${m.voiceDuree ?? ''} (démo)`);
        if (url) jouerLaNote(url, demo, el);
        else demo();
        return;
      }
      // — C5 — « Écouter la note », the founder's 2026-07-30 reversal.
      //
      // THERE IS NO « no url » BRANCH HERE, AND THAT IS THE POINT. `renderC5`
      // emits this button only when `voiceUrl` exists, so the state C1 answers
      // with a « (démo) » toast is UNREACHABLE from the payment screen — not
      // handled differently, absent. A control that plays nothing never exists
      // on the screen where she is deciding to part with money.
      case 'voix-lire-paiement': {
        const url = el.getAttribute('data-voix-url');
        // `el` — THE THIRD ARGUMENT WAS MISSING HERE (verifier, 2026-08-09).
        // C1 has passed its button since 2026-08-04; this call site never did,
        // so `voixHote` stayed null, the `timeupdate` handler was gated out,
        // the glyph never swapped, and the pause-toggle (which compares against
        // `voixHote`) could never match — tapping a playing note RESTARTED it
        // with no way to stop. On the screen where she decides to part with
        // money. The shared player was right; one call site was not using it.
        if (url) jouerLaNote(url, () => toast(MESSAGES.noteInjouable), el);
        return;
      }
      // — C3 —
      case 'zone':
        state.zone = el.getAttribute('data-zone'); render(); return;
      case 'voix-demarrer':
      case 'voix-refaire':
        // REPERE-AUDIO-REEL — the REAL microphone, no more pantomime. The
        // permission prompt answers first; a refusal (hers, or a browser with
        // no recorder) lands on the standing honest state, and the typed
        // repère stays the primary road.
        state.note = null;
        // VOIX-ÉTAT-2 — REFAIRE while her old note is playing must silence it:
        // recording over her own voice coming out of the speaker is a note
        // nobody can use.
        noteAudio?.pause();
        void enregistreur.demarrer().then((debut) => {
          if (debut === 'refused') {
            state.voice = 'refused';
            render();
            return;
          }
          state.voice = 'recording';
          state.vSec = 0;
          render();
          ticker = setInterval(() => {
            state.vSec += 1;
            const t = container.querySelector('[data-role="rec-time"]');
            if (t) t.textContent = recTime();
            // The cap is the SAME act as her own ARRÊTER — never a lost note.
            if (state.vSec >= NOTE_MAX_SEC) arreterNote();
          }, 1000);
        });
        return;
      case 'voix-arreter':
        arreterNote();
        return;
      case 'voix-lire-note': {
        // HER OWN replay, from the phone's blob — nothing fetched, nothing sent.
        const url = state.note?.blobUrl;
        if (url === undefined || typeof Audio === 'undefined') return;
        if (noteAudio === null) {
          noteAudio = new Audio();
          // EVERY way playback can stop puts the control back. A pause glyph
          // over silence is the same lie as a play glyph over sound.
          noteAudio.addEventListener('ended', noteRepos);
          noteAudio.addEventListener('pause', noteRepos);
          noteAudio.addEventListener('error', noteRepos);
          noteAudio.addEventListener('timeupdate', () => {
            if (noteAudio !== null && !noteAudio.paused) noteHorloge(fmtSecondes(noteAudio.currentTime));
          });
        }
        // Tapping her note WHILE it plays pauses it — the pause glyph has to
        // mean something when she taps it.
        if (!noteAudio.paused && noteAudio.src === url) {
          noteAudio.pause();
          return;
        }
        if (noteAudio.src !== url) noteAudio.src = url;
        noteAudio.currentTime = 0;
        noteGlyphe(true);
        noteHorloge(fmtSecondes(0));
        void noteAudio.play().catch(() => {
          noteRepos(); // a refusal must not leave a pause glyph over nothing
          toast(MESSAGES.noteInjouable);
        });
        return;
      }
      case 'geo-demander': {
        /**
         * GEO-ACHAT-1 — one tap, HER choice; the browser's permission prompt
         * answers first. A refusal (hers, a phone without GPS, a fix that
         * never comes — the 10 s timeout is the way out of this automatic
         * act) lands on the honest face, and the written address stays the
         * whole road: the pin is comfort for the rider, never a gate.
         */
        if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
          state.geo = 'refus'; render(); return;
        }
        state.geo = 'encours';
        render();
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            // A fix landing after she moved on is DROPPED (the LISTE-VOIX
            // lesson: an act she can no longer see is an act she cannot
            // retract) — and the face returns to the quiet offer so a later
            // C3 never shows a search that is not running.
            if (state.screen !== 'C3' || state.geo !== 'encours') {
              if (state.geo === 'encours') state.geo = 'repos';
              return;
            }
            // GEO-ACHAT-2 — the fix is a CANDIDATE, not a pin: the carte face
            // shows it on a real map and asks; only « Confirmer » keeps it.
            pinCandidat = {
              // Six decimals ≈ 11 cm — every digit past that is noise on the
              // wire pretending to be precision.
              lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
              lng: Math.round(pos.coords.longitude * 1e6) / 1e6,
              ...(Number.isFinite(pos.coords.accuracy)
                ? { accuracy: Math.min(100_000, Math.max(0, Math.round(pos.coords.accuracy))) }
                : {}),
            };
            // GEO-CARTE-PRO — the capture is also the RECENTRE anchor: the
            // viseur returns the dragged map to this fix, never to a fresh
            // sensor read (SE-I08: one static capture seeds everything).
            fixOrigine = pinCandidat;
            state.geo = 'carte';
            render();
          },
          () => {
            if (state.screen !== 'C3' || state.geo !== 'encours') {
              if (state.geo === 'encours') state.geo = 'repos';
              return;
            }
            state.geo = 'refus';
            render();
          },
          { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
        );
        return;
      }
      case 'geo-confirmer':
        // GEO-ACHAT-2 — HER answer to the map's one question. This is the
        // only line in the app that turns a candidate into a kept pin.
        if (state.geo !== 'carte' || pinCandidat === null) return;
        state.pin = pinCandidat;
        pinCandidat = null;
        state.geo = 'faite';
        render();
        return;
      case 'geo-carte-annuler':
        // « Ce n'est pas là » is a full answer: the candidate dies here and
        // the quiet offer returns — nothing was kept, nothing rides.
        pinCandidat = null;
        fixOrigine = null;
        state.geo = 'repos';
        render();
        return;
      case 'geo-recentrer':
        // GEO-CARTE-PRO — the viseur undoes her drags: the candidate returns
        // to the CAPTURED fix, accuracy and all (the ±m byte describes that
        // point again). Never a new sensor read.
        if (state.geo !== 'carte' || fixOrigine === null) return;
        pinCandidat = { ...fixOrigine };
        render();
        return;
      case 'geo-retirer':
        // Retirer is total: no coordinate survives it anywhere in this app.
        state.pin = null; state.geo = 'repos'; render(); return;
      case 'continuer-c3':
        if (!canC3()) return;
        // SP3.2b — the destination is now known, so this is where the price is
        // asked for. No quoteSource ⇒ the harness path, unchanged.
        if (init.quoteSource !== undefined) { void demanderLePrix(); return; }
        jump('C4', { delivery: null });
        return;
      // — the refusal surface's own two actions —
      case 'reessayer-prix':
        void demanderLePrix(); return;
      case 'prix-a-jour':
        // An expired price is dead. A NEW price needs a NEW request key, or the
        // server hands back the same expired quote forever.
        void demanderLePrix(true); return;
      // — C4 —
      case 'choix-livraison':
        state.delivery = (el.getAttribute('data-choix') as Livraison) ?? 'today'; render(); return;
      case 'continuer-c4':
        if (state.delivery) jump('C5', { pay: null });
        return;
      // — C5 —
      case 'choix-paiement':
        state.pay = (el.getAttribute('data-mode') as ModePaiement) ?? 'A'; render(); return;
      case 'payer': {
        if (!state.pay) return;
        const live = state.live;
        if (live !== null) {
          const mode = state.pay;
          // ─── THE REAL PATH, IN THIS ORDER, AND THE ORDER IS THE POINT ───
          //
          // 1. THE EXPIRY FAST-PATH — A COURTESY, NOT THE AUTHORITY.
          //
          //    THE SERVER OWNS EXPIRY (verifier BLOCKER 5). This gate used to
          //    treat the PHONE'S clock as the sole authority, and a phone one
          //    hour fast could then never buy anything: every refresh minted a
          //    genuinely live quote, every Payer tap died on « Ce prix a
          //    expiré », and NOT ONE reserve request was ever sent. The screen
          //    blamed the price for the clock.
          //
          //    Fail-closed is right; fail-closed WITH NO ESCAPE is not. So:
          //    read as expired ⇒ refresh ONCE automatically (a new key, a new
          //    price). If the freshly issued quote ALSO reads expired, this
          //    phone cannot tell the time — `horlogeDouteuse` — and we SEND THE
          //    RESERVE and let the only authority that can actually answer,
          //    answer. Nothing unsafe can follow: the service refuses an
          //    expired quote BY NAME, and a named server refusal is a true
          //    sentence where a clock-skew guess is not.
          if (prixExpire(live.expiry, Date.now()) && !state.horlogeDouteuse) {
            if (!state.prixRafraichi) {
              state.paying = 'idle';
              // AUTOMATIC: a new key, a new price, a word on screen, and she
              // lands back on C5 with her mode intact (verifier ITEM 3).
              void demanderLePrix(true, true);
              return;
            }
            state.paying = 'idle'; state.refus = 'expired'; render(); return;
          }
          // 2. THEN THE HOLD, ON THE QUOTE FOR THE MODE SHE CHOSE. « ENVOI
          //    SÉCURISÉ » stands while it is taken — the reservation IS the
          //    first step of sending her request, and it is the only screen
          //    this slice is allowed to show here. `reserve` takes no COMMAND
          //    id: each mode's command was minted with its quote, so tapping
          //    back and paying again REPLAYS her own hold (the vault's
          //    `reserveCommandId` match) instead of colliding with it.
          const gen = generation;
          state.paying = 'submitting'; render();
          void live.reserve(mode).then((r) => {
            // SHE LEFT WHILE THIS WAS ON THE WIRE — cancel means cancel, so a
            // late answer schedules nothing and says nothing (BLOCKER 3).
            if (gen !== generation) return;
            if (r.status !== 'reserved') {
              state.paying = 'idle';
              state.refus = nomDuRefus(r);
              render();
              return;
            }
            /**
             * ═══ SP3.3c — THE 2 400 ms `setTimeout` THAT USED TO LIVE HERE IS
             *     GONE, AND IT WAS THE WORST LINE IN THIS APP ═══
             *
             * It read: `t2 = setTimeout(() => jump('C6', { confirmState:
             * 'confirmed' }), 2400)`. Two and a half seconds after she tapped
             * Payer, the screen said « Paiement de 12 500 FCFA confirmé par
             * l'opérateur. » No order had been created. No charge had been
             * initiated. No webhook had arrived. And this was NOT a demo path:
             * `pwa-preview.yml` builds with `VITE_STOREFRONT_BASE`, so the
             * sentence stood in front of a REAL hold on a REAL quote at the real
             * Worker. Ten Laws #2 — « provider webhooks are the only payment
             * truth » — was being contradicted by a clock.
             *
             * The order is now CREATED, and C6 mounts on the state the service
             * returns. The only thing that can produce « confirmé » is the
             * order's own `confirmed`, and only a signed webhook validated to
             * the franc can produce that.
             */
            passerLaCommande(mode, gen);
          });
          return;
        }
        if (state.offline) { jump('C6', { confirmState: 'offline' }); return; }
        state.paying = 'submitting'; render();
        t1 = setTimeout(() => {
          state.paying = 'provider'; render();
          t2 = setTimeout(() => jump('C6', { confirmState: 'confirmed', step: 1 }), 2400);
        }, 1200);
        return;
      }
      // — C6 (SP3.3c) —
      //
      // « VÉRIFIER À NOUVEAU » — ONE read, on her word, after the automatic
      // ones stopped. It does not restart the schedule: she asked once, she
      // gets one answer, and the button stays if the answer is still « we are
      // waiting ». That is the shape that respects a metered connection.
      case 'verifier-paiement': {
        const id = state.orderId;
        if (id === null) return;
        state.relance = false;
        render();
        suivreLePaiement(id, generation, SUIVI_PAIEMENT_MS.length);
        return;
      }
      // « RÉESSAYER LE PAIEMENT » — a NEW attempt, and therefore a new order
      // command id (`state.essai` is part of its storage slot). Reusing the old
      // one would replay the first answer: the button would look like it worked
      // and nothing would have been retried. The PROVIDER key is untouched by
      // this — it belongs to the leg, is minted once server-side and is reused
      // across every retry, which is what stops a retry from collecting twice.
      case 'reessayer-paiement': {
        const mode = state.pay;
        if (mode === null || state.live === null) return;
        clearT();
        state.essai += 1;
        state.relance = false;
        /**
         * SHOW HER THE TAP LANDED, BEFORE ANYTHING IS ON THE WIRE.
         *
         * THE DEFECT THIS CLOSES, found re-reading this handler: without this
         * line the screen does not change at all until `commander` RESOLVES —
         * C6 keeps rendering « Le paiement n'a pas abouti. » with the retry
         * button still sitting under her thumb. On a Ouaga 2G link that is
         * several seconds of a dead tap on a money screen, and a dead tap on a
         * money screen gets tapped again.
         *
         * It goes back to C5's operator screen, which is where the FIRST
         * attempt already waits while its order request is in flight — so the
         * retry walks the same visual path as the attempt it is repeating,
         * rather than inventing a second waiting surface. `passerLaCommande`
         * renders it immediately and jumps to C6 on the answer.
         *
         * A SECOND TAP CANNOT DOUBLE-CHARGE, and that was checked rather than
         * assumed: the button is gone the instant this renders, and even a
         * racing tap only reaches `order-do.ts`'s « an order exists and its
         * payment has not failed » branch, which returns the order as it
         * stands — never a second order, never a second charge.
         */
        state.screen = 'C5';
        passerLaCommande(mode, generation);
        return;
      }
      // — C6 · C7 —
      case 'suivre':
        // BELT AND BRACES ON THE SAME LAW `renderC6` now enforces by omission
        // (verifier BLOCKER 1). The button is not rendered unless the payment is
        // confirmed; this makes the rule hold even if some future screen, or a
        // stray harness mount, emits the action anyway. A tracking timeline for
        // an unconfirmed payment is the first step of the walk that ended in a
        // revealed drop code.
        // FOLLOWING a delivery is NOT custody transfer, so this keeps SP3.3c's
        // rule and does NOT wait on the door leg. §6.3 governs the DROP CODE;
        // tracking an order whose product money is still owed is the whole
        // point of Option B — she tracks, the rider arrives, she inspects, she
        // pays, and only THEN does the code exist. (Caught by its own e2e: the
        // first version of this guard blocked the tracking screen too.)
        if (state.live !== null && state.confirmState !== 'confirmed') return;
        jump('C7', { step: Math.max(state.step, 1) });
        // VRAI-SUIVI — the real tracking starts watching the order the moment
        // it is on screen (bounded ladder; stops at livree or hands her the
        // manual check).
        demarrerSuivi();
        return;
      case 'simuler':
        // BELT AND BRACES on the renderer's own omission: the simulation must
        // never advance a REAL order's timeline, even if something emits the
        // action anyway — the real step derives from server facts and ignores
        // `state.step`, but a guard that costs one line keeps the invariant
        // even if that derivation ever changes.
        if (reel) return;
        state.step += 1; render(); return;
      // ── VRAI-SUIVI — the code, and the tracking's own manual check ────────
      case 'voir-code':
        // §6.3 — THE CODE COMES LAST, AFTER THE DOOR LEG IS PAID (founder,
        // 2026-08-21; audit A1/A2). On Option B the product is still owed at
        // the door (`doorLeg === 'due'`): the reveal road would only earn the
        // honest « pas encore » (the server withholds too, now), so « Voir mon
        // code » takes her to the DOOR — the SAME screen « Je suis à la porte »
        // opens — where she pays and the code reveals on confirmation. Full
        // prepay and an already-paid door keep the direct reveal below.
        if (state.live !== null && state.confirmState === 'confirmed' && state.doorLeg === 'due') {
          jump('C8', { door: 'inspecting', leg2: 'idle', reason: null });
          return;
        }
        // CODE-VISIBLE (2026-08-13): offered for the whole live delivery —
        // the arrival gate is gone; the REMISE ROUTE stays the sole reveal
        // authority, and the fetch goes out in the generation the jump opens.
        jump('C9');
        demanderLeCode();
        // ═══ THE WATCH FOLLOWS HER TO C9 (verifier MAJOR, 2026-08-12) ═══
        //
        // C9 is where she IS at the moment the delivery is proven: the rider is
        // at the door, she has opened her code to show him. `jump` bumps the
        // generation and kills the delivery watch, and nothing restarted it
        // here — so the rider took the remise, the server set `livree`, and her
        // screen went on showing the code for ever. She only ever reached the
        // closing screen by pressing back to C7 first, which is a road she has
        // no reason to take while holding her phone up to a stranger.
        //
        // The watch's own rule does the rest: when it proves `livree` it jumps
        // to C10 from wherever it is running.
        demarrerSuivi();
        return;
      case 'verifier-code':
        demanderLeCode();
        return;
      case 'verifier-suivi': {
        /**
         * REACHABLE AGAIN, and this is the way out of a frozen C7.
         *
         * It was dead for one commit: SUIVI-VIVANT made the ladder hold and
         * deleted the only `suiviRelance = true`, so `renderC7` could not emit
         * this action and a screen whose reads all failed had no control on it
         * at all. The run-of-refusals rule raises the flag again, which is what
         * puts « Vérifier à nouveau » back under her thumb.
         *
         * It resumes at the HELD rung, not at the top: the ladder's early rungs
         * are for a parcel that has just started moving, and an order she has
         * been watching for an hour does not need them. And it clears the run,
         * so a service that has come back gets the full benefit of the hold
         * again rather than pausing after one more stumble.
         */
        const id = state.orderId;
        if (id === null) return;
        state.suiviRelance = false;
        echecsSuivi = 0;
        render();
        suivreLaLivraison(id, generation, SUIVI_LIVRAISON_MS.length);
        return;
      }
      case 'suivi-terminer': {
        // « Terminer » — the phone forgets the finished order. The order itself
        // lives on the service; only the shortcut goes away.
        oublierCommande(localStorageOrUndefined());
        state.termineeVue = true;
        if (init.onTerminee !== undefined) {
          // A host that wants to own the ending gets it (the shell uses this to
          // return to its own home) — unchanged.
          init.onTerminee();
          return;
        }
        // ═══ AND IT CLOSES (founder 2026-08-12: « make it close nicely and
        //     return to the initial state ») ═══
        //
        // Without a host hook this used to `render()` — repainting the very
        // screen she had just dismissed, so the one action on it appeared to do
        // nothing. She goes back to the beginning, and the ORDER'S OWN STATE is
        // cleared with her: leaving `orderId` and the marks behind would let a
        // later screen resurrect a delivery she has finished with.
        state.orderId = null;
        state.buyerRef = null;
        state.marques = {};
        state.livree = false;
        state.codeRemise = null;
        state.suiviRelance = false;
        state.suiviHorsPortee = false;
        // `problem` IS THE ONE THAT COULD STRAND HER NEXT ORDER (verifier
        // BLOCKER, 2026-08-12). Nothing else in this module ever clears it. If
        // she reported a problem on THIS order and the delivery completed
        // anyway, the flag rode through « Terminer » into her next checkout —
        // where `renderC7` withholds BOTH « Je suis à la porte » and « Voir mon
        // code » on `!s.problem`, and prints « Problème signalé » over an order
        // that has none. She could not open her drop code and could not pay at
        // the door. That road exists only because this reset opened C1 as a
        // destination, so closing it belongs here.
        state.problem = false;
        jump('C1');
        return;
      }
      case 'porte':
        jump('C8', { door: 'inspecting', leg2: 'idle', reason: null }); return;
      case 'signaler-c7':
        state.problem = true; render(); return;
      // — C8 —
      case 'porte-bon':
        /**
         * ═══ THE DROP CODE NEVER REVEALS ON AN UNCONFIRMED PAYMENT ═══
         *
         * `leg2: 'confirmed'` is the single flag `renderC9` reveals on, so this
         * is the one line that decides whether « Le code de remise » appears.
         * §6.3: « the buyer enters the drop code last, after any door payment is
         * provider-confirmed. » Ten Laws #3: custody transfers only after
         * provider-confirmed payment of every due leg.
         *
         * ON THE REAL PATH (`state.live !== null`) THE ONLY EVIDENCE OF PAYMENT
         * IS THE ORDER'S OWN STATE, so that is what is read. The harness path
         * keeps its documented reachability levers (`?revealed=`,
         * `?demo-cliente=C9`) — it has no order to consult and it is labelled a
         * demo everywhere it is offered.
         */
        // ═══ SP4.2b — « TOUT EST BON » NOW BRANCHES ON WHAT SHE STILL OWES ═══
        //
        // The order must exist and be confirmed before anything at the door
        // happens at all. Then: money owed ⇒ COLLECT IT; nothing owed ⇒ the
        // reveal, still behind `revelationPermise`.
        if (state.live !== null && state.confirmState !== 'confirmed') return;
        if (state.live !== null && state.doorLeg === 'due') {
          payerALaPorte(generation);
          return;
        }
        // `reel`, not `state.live !== null` (VRAI-SUIVI): the re-entry mount
        // has no live handle but is every bit a real buyer, and the harness
        // levers must not open for it. Unreachable there today — C7 withholds
        // « Je suis à la porte » without a live handle — but a guard that is
        // satisfied only by unreachability is the exact shape §6bis warns of.
        if (!revelationPermise(reel, state.confirmState, state.doorLeg)) return;
        // ═══ EVERY C9 ENTRY RESTARTS THE DELIVERY WATCH — the voir-code fix
        // (e6bcc54), owed on both of these roads too. `jump` kills the watch;
        // without the restart the server records `livree` and nobody reads it:
        // the code stands on screen for ever, no C10, no close. On C9 the
        // watch's own arrivedAt rule fetches her code, and its `livree` rule
        // ends the screen. (No-op on the demo path — `demarrerSuivi` holds on
        // `!reel`.)
        if (state.pay === 'A') { jump('C9', { leg2: 'confirmed', step: 6 }); demarrerSuivi(); return; }
        state.door = 'accepted'; render();
        t1 = setTimeout(() => { jump('C9', { leg2: 'confirmed', step: 6, door: 'inspecting' }); demarrerSuivi(); }, 2600);
        return;
      // SP4.2b — a NEW attempt, and therefore a new command id, exactly as C6's
      // retry works. The provider key belongs to the LEG and is reused, so a
      // retry cannot collect twice.
      case 'reessayer-porte':
        if (state.live === null || state.orderId === null) return;
        clearT();
        state.essaiPorte += 1;
        payerALaPorte(generation);
        return;
      case 'porte-probleme':
        state.door = 'report'; state.reason = null; render(); return;
      case 'motif':
        state.reason = el.getAttribute('data-motif'); render(); return;
      case 'confirmer-signalement':
        jump('C7', { step: 5, problem: true, door: 'inspecting' });
        // VRAI-SUIVI — a reported problem does not stop the truth: the watch
        // keeps reading the order (the banner and the facts coexist).
        demarrerSuivi();
        return;
    }
  });

  /**
   * ═══ REPRISE-PWA — RESUME THE TAB'S JOURNEY (founder, 2026-08-13) ═══
   *
   * Each screen resumes through a road the flow ALREADY owns — never a bespoke
   * one, so every guard on those roads still guards:
   *
   *  · C3 — her fields come back; there is nobody to ask.
   *  · C4 · C5 · C6 — unrenderable without the server's price, so the resume
   *    ASKS AGAIN through `demanderLePrix` (reload-stable keys ⇒ the real
   *    service answers the same quote and her own hold/order replay). A
   *    refusal lands on the flow's own refusal surface. C6 then re-asks the
   *    ORDER: a payment in flight resumes as WAITING, never as paid.
   *  · C7 · C9 — the tracking needs no price: it polls through the
   *    order-scoped `init.reprise` ports (the « Ma commande » pair). Every
   *    entry restarts the delivery watch (the e6bcc54 law), and C9 re-asks the
   *    remise route for the code — the snapshot never carried it.
   *  · C8 resumes to C7, not C8: the door screen rides the LIVE checkout
   *    handle (the door charge, the C8 bill) and a reload cannot resurrect
   *    it — a « Tout est bon » that cannot complete is a false affordance, the
   *    same withholding the re-entry mount applies to « Je suis à la porte ».
   *    Her code stays one tap away (« Voir mon code », CODE-VISIBLE).
   *  · `livree` is NOT trusted from the snapshot: if the order finished while
   *    the tab was away, the restarted watch proves it and ends the screen
   *    (C10) by its own rule.
   */
  function reprendreParcours(r: Reprise): void {
    state.zone = r.zone;
    state.repere = r.repere;
    state.phone = r.phone;
    state.delivery = r.delivery;
    state.pay = r.pay;
    state.essai = r.essai;
    if (r.ecran === 'C3') {
      // Extras, not prefill: a resumed journey must never inherit the demo
      // zone/repère (the 2026-07-22 leak class) — what she typed, even empty,
      // wins last.
      // GEO-ACHAT-1 — the snapshot never carries a pin (no coordinates in
      // sessionStorage), so a resumed C3 opens on the quiet offer.
      jump('C3', { zone: r.zone, repere: r.repere, phone: r.phone, geo: 'repos', pin: null });
      return;
    }
    if (r.ecran === 'C4' || r.ecran === 'C5' || r.ecran === 'C6') {
      // The target screen AND the order linkage are claimed BEFORE the ask, so
      // the snapshot keeps naming a valid journey while the skeleton (or a
      // refusal) stands — a second refresh mid-ask resumes the same journey
      // instead of falling to C1. (`demanderLePrix`'s own « a new price is a
      // new checkout » reset still runs; the C6 resume tail restores after it.)
      state.screen = r.ecran;
      state.orderId = r.orderId;
      state.buyerRef = r.buyerRef;
      void demanderLePrix(false, false, r);
      return;
    }
    // C7 · C8 · C9 — the tracking road. The codec guarantees the linkage; the
    // guard is belt-and-braces against a future codec loosening.
    if (r.orderId === null || r.buyerRef === null) return;
    state.orderId = r.orderId;
    state.buyerRef = r.buyerRef;
    if (r.ecran === 'C9') {
      // The voir-code entry, verbatim: jump, ask the remise route for the
      // code, restart the watch (e6bcc54 — a C9 whose watch is dead shows the
      // code for ever, no C10, no close).
      jump('C9', { repere: r.repere, phone: r.phone });
      demanderLeCode();
      demarrerSuivi();
      return;
    }
    jump('C7', { step: Math.max(state.step, 1), repere: r.repere, phone: r.phone });
    demarrerSuivi();
  }

  // REPRISE-PWA — read BEFORE the first render: rendering C1 clears the slot
  // (C1 is the fresh start), so reading after would erase what we came for.
  const repriseAvant = init.reprise !== undefined ? lireReprise(init.reprise.storage, init.reprise.lien) : undefined;

  render();
  // VRAI-SUIVI — the re-entry mount opens ON the tracking, so its watch starts
  // with it: first read on the ladder's first rung, exactly as « Suivre ma
  // commande » starts it in-flow.
  if (init.suivi !== undefined && state.screen === 'C7') demarrerSuivi();
  // REPRISE-PWA — a matching snapshot resumes her journey instead of C1. Only
  // the plain signed entry (mounted at C1, no re-entry source) carries
  // `reprise`, so an explicit-screen mount can never be overridden by it.
  else if (repriseAvant !== undefined && startScreen === 'C1') reprendreParcours(repriseAvant);

  return arreter;
}

export { SUIVI_STEPS };
