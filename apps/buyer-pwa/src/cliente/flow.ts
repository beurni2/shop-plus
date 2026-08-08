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

import { applyTheme, type VitrineThemeKey } from '../vitrine/themes';
import {
  renderC1, renderC3, renderC4, renderC5, renderC6, renderC7, renderC8, renderC9,
  renderGalerie, renderOffline, renderRefus, renderSheet, renderSkeleton, renderToasts,
  galerieSlides,
  splitFor, MESSAGES, SUIVI_STEPS,
  type ClienteProduit, type ClienteQuote, type ConfirmEtat, type DoorEtat,
  type Livraison, type ModePaiement, type VoiceEtat,
} from './screens';
import { fmtFCFA } from './money';
import { iconPause, iconPlay } from './icons';

/**
 * « m:ss » for the ticking clock — the SAME shape `m.voiceDuree` already shows
 * (« 0:12 »), so the number that appears while it plays and the number that was
 * there before it started belong to one another instead of being two formats.
 */
function fmtSecondes(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
import { prixExpire, type OrderFetch, type QuoteFetch, type ReserveFetch } from './quote-model';
import { creerEnregistreurNote, type EnregistreurNote, type NoteEnregistree } from './voice-note';

export type ClienteEcran = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9';
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
  repere: string;
  indic: string;
  /** BC-1b — her number, captured on C3 for the dispatch contact. */
  phone: string;
  voice: VoiceEtat;
  vSec: number;
  /** REPERE-AUDIO-REEL — the RECORDED note (bytes + her replay URL), held on
   *  the phone until it rides the order create. null = nothing recorded. */
  note: NoteEnregistree | null;
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
    commander: (mode: ModePaiement, essai: number, contact?: { phone: string; quartier: string; repere: string; audioB64?: string }) => Promise<OrderFetch>;
    etatCommande: (orderId: string) => Promise<OrderFetch>;
    /** SP4.2b — ask for the product leg to be collected at her door. */
    payerALaPorte: (orderId: string, essai: number) => Promise<OrderFetch>;
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

export function createCliente(container: HTMLElement, init: ClienteInit): void {
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
    repere: '',
    indic: '',
    phone: '',
    voice: (init.microRefuse ?? false) ? 'refused' : 'idle',
    vSec: 0,
    note: null,
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
  };

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

  // ONE audio element for « La voix » — created on the FIRST TAP only (never
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

  const voixGlyphe = (el: HTMLElement, lecture: boolean): void => {
    const cible = el.querySelector('svg');
    if (cible !== null) cible.outerHTML = lecture ? iconPause(16) : iconPlay(16);
  };
  const voixHorloge = (texte: string): void => {
    const cible = document.querySelector('.cl-voix-dur');
    if (cible instanceof HTMLElement) cible.textContent = texte;
  };
  /** Back to rest: the triangle returns and the clock shows the total again. */
  const voixRepos = (): void => {
    if (voixHote === null) return;
    voixGlyphe(voixHote, false);
    if (voixTotal !== '') voixHorloge(voixTotal);
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
  let ticker: ReturnType<typeof setInterval> | null = null;

  /** REPERE-AUDIO-REEL — the recorder behind « Enregistrer le repère ». One
   *  per flow; tests and the harness inject a fake through `init`. */
  const enregistreur: EnregistreurNote = init.enregistreur ?? creerEnregistreurNote();
  /** The capture ceiling — a repère is a sentence, not a speech. The media
   *  door's own walls (2 MiB / 60 s) sit far behind this. */
  const NOTE_MAX_SEC = 30;
  /** One replay element for HER OWN note (blob URL — never leaves the phone). */
  let noteAudio: HTMLAudioElement | null = null;

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
    ticker = null;
    generation += 1;
  }

  function prefill(screen: EcranLineaire): void {
    const idx = ECRANS.indexOf(screen);
    if (idx >= 1) {
      state.zone = state.zone || 'Gounghin';
      state.repere = state.repere || 'Face à la pharmacie du marché';
    }
    if (idx >= 2 && screen !== 'C3') state.delivery = state.delivery || 'today';
    if (idx >= 4) state.pay = state.pay || 'B';
  }

  function jump(screen: EcranLineaire, extra?: Partial<FlowState>): void {
    clearT();
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
  const canC3 = (): boolean =>
    !!state.zone && telValide() && (state.repere.trim().length > 0 || state.voice === 'recorded' || state.voice === 'queued');

  function screenHtml(): string {
    // A NAMED REFUSAL OUTRANKS EVERY SCREEN. It is not an overlay and not a
    // toast: while it stands, there is no price, so no priced screen may draw.
    if (state.refus !== null) return renderRefus(state.refus);
    const q = quoteOrNull();
    switch (state.screen) {
      case 'C1':
        return renderC1(m, { epuise: state.stock === 'out', sansVoix: init.sansVoix ?? false });
      case 'C3':
        return renderC3({
          zone: state.zone, repere: state.repere, indic: state.indic, phone: state.phone,
          voice: state.voice, recTime: recTime(), canContinue: canC3(),
        });
      case 'C4':
        // Render-time fallbacks — the pixel's zoneUpper/repereRecap `||` pair,
        // so a direct C4 mount shows a coherent récap without touching state.
        return q === null ? renderRefus('') : renderC4(q, {
          zone: state.zone || 'Gounghin',
          repereRecap: (state.repere || 'Face à la pharmacie du marché') + (state.indic ? ` · ${state.indic}` : ''),
          delivery: state.delivery,
          ligneUnique: state.serverQuote !== null,
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
        });
      case 'C7':
        return renderC7({ step: state.step, problem: state.problem, demo });
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
      case 'C9':
        return renderC9({ revealed: state.leg2 === 'confirmed' });
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
  async function demanderLePrix(renouveler = false, auto = false): Promise<void> {
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
        // SETTLED, EITHER WAY ⇒ STOP ASKING. `confirmed` and `echec` are the two
        // states the server will not move off on its own, so a further read
        // could only ever return the same answer at her expense.
        if (etat !== 'attente') {
          state.relance = false;
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
        if (state.doorLeg === 'paid') {
          // PROVIDER-CONFIRMED. Only now, and §6.3 is satisfied.
          jump('C9', { leg2: 'confirmed', step: 6, door: 'inspecting' });
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
   * CREATE THE ORDER, THEN WATCH IT. The « ENVOI SÉCURISÉ » screen stands while
   * the order request is on the wire; C6 mounts on the state the SERVICE
   * returned, which today is `payment_pending` and therefore « Nous attendons
   * l'opérateur. » — never a confirmation, because a created order is not a
   * paid one.
   */
  /** BC-1b — the dispatch contact, from C3's own answers: her number, her
   *  quartier, and the repère (text plus the optional indication; possibly ''
   *  when she chose the voice note — the service accepts an empty repère).
   *  Assembled at SEND, so a corrected number on a retry travels corrected. */
  function contactLivraison(): { phone: string; quartier: string; repere: string; audioB64?: string } | undefined {
    const phone = state.phone.trim();
    const quartier = state.zone ?? '';
    if (phone === '' || quartier === '') return undefined;
    const repere = [state.repere.trim(), state.indic.trim()].filter((v) => v !== '').join(' · ').slice(0, 200);
    return {
      phone: phone.slice(0, 32),
      quartier: quartier.slice(0, 120),
      repere,
      // REPERE-AUDIO-REEL — her recorded note rides the create beside the
      // text, assembled at SEND like everything else here.
      ...(state.note !== null ? { audioB64: state.note.audioB64 } : {}),
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
      const etat = etatDeC6(r.order.state);
      jump('C6', { confirmState: etat, step: 1, orderId: r.order.orderId, relance: false, horsPortee: false });
      // `jump` cleared the timers and bumped the generation — so the watch must
      // start from the NEW one, or its first read would discard itself.
      if (etat === 'attente') suivreLePaiement(r.order.orderId, generation, 0);
    });
  }

  function render(): void {
    container.innerHTML = [
      '<div class="cl-status"></div>',
      '<div class="cl-lisere"></div>',
      state.offline ? renderOffline() : '',
      `<div class="cl-stage">${state.loading ? renderSkeleton() : screenHtml()}</div>`,
      state.sheet ? renderSheet() : '',
      state.galerie !== null ? renderGalerie(m, state.galerie) : '',
      renderToasts(state.toasts),
    ].join('');
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
    if (role === 'indic') state.indic = el.value;
    if (role === 'phone') { state.phone = el.value; patchC3Cta(); }
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
          jump('C3', {
            zone: null, repere: '', indic: '', phone: '',
            voice: (init.microRefuse ?? false) ? 'refused' : 'idle', vSec: 0, note: null,
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
        clearT(); state.paying = 'idle'; state.refus = null; state.screen = 'C3'; render(); return;
      case 'retour-c4':
        clearT(); state.paying = 'idle'; state.refus = null; state.screen = 'C4'; render(); return;
      case 'retour-c7':
        jump('C7', { step: Math.max(state.step, 1) }); return;
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
        const demo = (): void => toast(`La voix d’${m.prenom} — ${m.voiceDuree ?? ''} (démo)`);
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
        if (url) jouerLaNote(url, () => toast(MESSAGES.noteInjouable));
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
        if (noteAudio === null) noteAudio = new Audio();
        if (noteAudio.src !== url) noteAudio.src = url;
        noteAudio.currentTime = 0;
        void noteAudio.play().catch(() => toast(MESSAGES.noteInjouable));
        return;
      }
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
        jump('C7', { step: Math.max(state.step, 1) }); return;
      case 'simuler':
        state.step += 1; render(); return;
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
        if (!revelationPermise(state.live !== null, state.confirmState, state.doorLeg)) return;
        if (state.pay === 'A') { jump('C9', { leg2: 'confirmed', step: 6 }); return; }
        state.door = 'accepted'; render();
        t1 = setTimeout(() => jump('C9', { leg2: 'confirmed', step: 6, door: 'inspecting' }), 2600);
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
        jump('C7', { step: 5, problem: true, door: 'inspecting' }); return;
    }
  });

  render();
}

export { SUIVI_STEPS };
