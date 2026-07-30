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
  fmtPayezMaintenant, MESSAGES, SUIVI_STEPS,
  type ClienteProduit, type ClienteQuote, type ConfirmEtat, type DoorEtat,
  type Livraison, type ModePaiement, type VoiceEtat,
} from './screens';
import { fmtFCFA } from './money';
import { prixExpire, type QuoteFetch, type ReserveFetch } from './quote-model';

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
  voice: VoiceEtat;
  vSec: number;
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
  live: { quoteId: string; commandId: string; expiry: string; reserve: (mode: ModePaiement) => Promise<ReserveFetch> } | null;
  /**
   * The phone's clock disagreed with a QUOTE THE SERVICE JUST ISSUED, so the
   * local expiry check is not evidence about the price. See `payer`.
   */
  horlogeDouteuse: boolean;
  /** One automatic refresh per price, so a stale quote cannot loop forever. */
  prixRafraichi: boolean;
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
    voice: (init.microRefuse ?? false) ? 'refused' : 'idle',
    vSec: 0,
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

  let t1: ReturnType<typeof setTimeout> | null = null;
  let t2: ReturnType<typeof setTimeout> | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;

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
    if (ticker) clearInterval(ticker);
    t1 = t2 = ticker = null;
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
  const canC3 = (): boolean =>
    !!state.zone && (state.repere.trim().length > 0 || state.voice === 'recorded' || state.voice === 'queued');

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
          zone: state.zone, repere: state.repere, indic: state.indic,
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
        return q === null ? renderRefus('') : renderC6(m, {
          confirmState: state.confirmState,
          payNowStr: fmtPayezMaintenant(q, state.delivery ?? 'today', state.pay ?? 'B'),
        });
      case 'C7':
        return renderC7({ step: state.step, problem: state.problem, demo });
      case 'C8':
        return q === null ? renderRefus('') : renderC8(m, q, { door: state.door, pay: state.pay ?? 'B', reason: state.reason });
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
    };
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
        state.galerie = Math.min(Math.max(0, m.assetRefs.filter((r) => r !== '').length - 1), (state.galerie ?? 0) + 1);
        render(); return;
      case 'fermer-protections':
      case 'fermer-protections-cta':
        state.sheet = false; render(); return;
      case 'commander':
        if (state.stock !== 'out') {
          jump('C3', {
            zone: null, repere: '', indic: '',
            voice: (init.microRefuse ?? false) ? 'refused' : 'idle', vSec: 0,
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
        const url = el.getAttribute('data-voix-url');
        if (url) {
          if (!voixAudio) voixAudio = new Audio();
          if (voixAudio.src !== url) voixAudio.src = url;
          voixAudio.currentTime = 0;
          void voixAudio.play().catch(() => toast(`La voix d’${m.prenom} — ${m.voiceDuree ?? ''} (démo)`));
        } else {
          toast(`La voix d’${m.prenom} — ${m.voiceDuree ?? ''} (démo)`);
        }
        return;
      }
      // — C3 —
      case 'zone':
        state.zone = el.getAttribute('data-zone'); render(); return;
      case 'voix-demarrer':
      case 'voix-refaire':
        state.voice = 'recording'; state.vSec = 0; render();
        ticker = setInterval(() => {
          state.vSec += 1;
          const t = container.querySelector('[data-role="rec-time"]');
          if (t) t.textContent = recTime();
        }, 1000);
        return;
      case 'voix-arreter':
        if (ticker) clearInterval(ticker);
        ticker = null;
        state.voice = state.offline ? 'queued' : 'recorded';
        render();
        return;
      case 'voix-lire-note':
        toast('Lecture de votre note vocale (démo)'); return;
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
            // Held. Into the EXISTING provider simulation — the real legs are
            // SP3.3 and nothing below this line claims otherwise.
            t1 = setTimeout(() => {
              state.paying = 'provider'; render();
              t2 = setTimeout(() => jump('C6', { confirmState: 'confirmed', step: 1 }), 2400);
            }, 1200);
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
      // — C6 · C7 —
      case 'suivre':
        jump('C7', { step: Math.max(state.step, 1) }); return;
      case 'simuler':
        state.step += 1; render(); return;
      case 'porte':
        jump('C8', { door: 'inspecting', leg2: 'idle', reason: null }); return;
      case 'signaler-c7':
        state.problem = true; render(); return;
      // — C8 —
      case 'porte-bon':
        if (state.pay === 'A') { jump('C9', { leg2: 'confirmed', step: 6 }); return; }
        state.door = 'accepted'; render();
        t1 = setTimeout(() => jump('C9', { leg2: 'confirmed', step: 6, door: 'inspecting' }), 2600);
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
