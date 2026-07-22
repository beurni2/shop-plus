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
 * habillages drive the flow the way the vitrine does. The fallback default is
 * INDIGO (founder decree 2026-07-21) — NOT the vitrine's laterite. A resolved
 * storefront's own theme still wins. (The canon `Storefront.theme` default →
 * indigo is a contracts change, flagged to the founder, NOT made here.)
 *
 * « Le code de remise fait foi » — C9 reveals ONLY on `leg2:'confirmed'`:
 * mode A at « Tout est bon »; mode B after the operator confirms the rest
 * (2 600 ms). Never before (§3.2).
 */

import { applyTheme, type VitrineThemeKey } from '../vitrine/themes';
import {
  renderC1, renderC3, renderC4, renderC5, renderC6, renderC7, renderC8, renderC9,
  renderOffline, renderSheet, renderSkeleton, renderToasts,
  fmtPayezMaintenant, SUIVI_STEPS,
  type ClienteProduit, type ClienteQuote, type ConfirmEtat, type DoorEtat,
  type Livraison, type ModePaiement, type VoiceEtat,
} from './screens';

export type ClienteEcran = 'C1' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9';
const ECRANS: readonly ClienteEcran[] = ['C1', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'];

export interface ClienteInit {
  readonly produit: ClienteProduit;
  /** The server-frozen quote (seed.ts composes it — the mock quote service). */
  readonly quote: ClienteQuote;
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
  screen: ClienteEcran;
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
}

export function createCliente(container: HTMLElement, init: ClienteInit): void {
  applyTheme(container, init.theme ?? 'indigo');
  container.classList.add('cl-root');

  const m = init.produit;
  const q = init.quote;
  const demo = init.demo ?? true;
  const startScreen: ClienteEcran = init.ecran ?? 'C1';

  const state: FlowState = {
    loading: (init.etat ?? 'ready') === 'loading',
    screen: startScreen,
    offline: init.offline ?? false,
    stock: (init.epuise ?? false) ? 'out' : 'ok',
    bInel: init.bIndisponible ?? false,
    sheet: false,
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
  };
  // Mounting mid-flow (harness startScreen / the real C1 entry): the same
  // prefill the pixel `jump()` applies, so every screen lands coherent.
  prefill(startScreen);

  let t1: ReturnType<typeof setTimeout> | null = null;
  let t2: ReturnType<typeof setTimeout> | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;

  function clearT(): void {
    if (t1) clearTimeout(t1);
    if (t2) clearTimeout(t2);
    if (ticker) clearInterval(ticker);
    t1 = t2 = ticker = null;
  }

  function prefill(screen: ClienteEcran): void {
    const idx = ECRANS.indexOf(screen);
    if (idx >= 1) {
      state.zone = state.zone || 'Gounghin';
      state.repere = state.repere || 'Face à la pharmacie du marché';
    }
    if (idx >= 2 && screen !== 'C3') state.delivery = state.delivery || 'today';
    if (idx >= 4) state.pay = state.pay || 'B';
  }

  function jump(screen: ClienteEcran, extra?: Partial<FlowState>): void {
    clearT();
    state.sheet = false;
    state.paying = 'idle';
    Object.assign(state, extra);
    state.screen = screen;
    prefill(screen);
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
    switch (state.screen) {
      case 'C1':
        return renderC1(m, { epuise: state.stock === 'out', sansVoix: init.sansVoix ?? false });
      case 'C3':
        return renderC3({
          zone: state.zone, repere: state.repere, indic: state.indic,
          voice: state.voice, recTime: recTime(), canContinue: canC3(),
        });
      case 'C4':
        return renderC4(q, {
          zone: state.zone ?? '',
          repereRecap: state.repere + (state.indic ? ` · ${state.indic}` : ''),
          delivery: state.delivery,
        });
      case 'C5':
        return renderC5(m, q, {
          delivery: state.delivery ?? 'today', pay: state.pay,
          paying: state.paying, bInel: state.bInel,
        });
      case 'C6':
        return renderC6(m, {
          confirmState: state.confirmState,
          payNowStr: fmtPayezMaintenant(q, state.delivery ?? 'today', state.pay ?? 'B'),
        });
      case 'C7':
        return renderC7({ step: state.step, problem: state.problem, demo });
      case 'C8':
        return renderC8(m, q, { door: state.door, pay: state.pay ?? 'B', reason: state.reason });
      case 'C9':
        return renderC9({ revealed: state.leg2 === 'confirmed' });
    }
  }

  function render(): void {
    container.innerHTML = [
      '<div class="cl-status"></div>',
      '<div class="cl-lisere"></div>',
      state.offline ? renderOffline() : '',
      `<div class="cl-stage">${state.loading ? renderSkeleton() : screenHtml()}</div>`,
      state.sheet ? renderSheet() : '',
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
      case 'retour-c1':
        state.screen = 'C1'; render(); return;
      case 'retour-c3':
        state.screen = 'C3'; render(); return;
      case 'retour-c4':
        state.screen = 'C4'; render(); return;
      case 'retour-c7':
        jump('C7', { step: Math.max(state.step, 1) }); return;
      // — C1 —
      case 'voix-lire':
        toast(`La voix d’${m.prenom} — ${m.voiceDuree ?? ''} (démo)`); return;
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
      case 'note-ecouter':
        toast('Lecture de la note — Français · Mooré · Dioula (démo)'); return;
      case 'continuer-c3':
        if (canC3()) jump('C4', { delivery: null });
        return;
      // — C4 —
      case 'choix-livraison':
        state.delivery = (el.getAttribute('data-choix') as Livraison) ?? 'today'; render(); return;
      case 'continuer-c4':
        if (state.delivery) jump('C5', { pay: null });
        return;
      // — C5 —
      case 'choix-paiement':
        state.pay = (el.getAttribute('data-mode') as ModePaiement) ?? 'A'; render(); return;
      case 'payer':
        if (!state.pay) return;
        if (state.offline) { jump('C6', { confirmState: 'offline' }); return; }
        state.paying = 'submitting'; render();
        t1 = setTimeout(() => {
          state.paying = 'provider'; render();
          t2 = setTimeout(() => jump('C6', { confirmState: 'confirmed', step: 1 }), 2400);
        }, 1200);
        return;
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
