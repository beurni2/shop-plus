import { t, tf } from './i18n';
import { FCFA } from './format';
import { icon } from './icons';
import { renderProductPage, type ProductViewModel } from './product-view';
import { renderLocationForm, type LocationViewModel } from './location-view';
import { renderDeliveryQuote, DEMO_SERA_QUOTE } from './delivery-view';
import { renderCheckoutOptions } from './checkout-view';
import { renderTracking, type TrackingViewModel, TRACKING_STEPS, type TrackingStep } from './tracking-view';
import { renderProtections } from './protections-view';
import {
  voiceNoteReduce,
  createMediaRecorderAdapter,
  type VoiceNoteState,
  type RecorderAdapter,
} from './voice-note';

/**
 * WO-4.4 — the walkable buyer journey (§6.2), one screen at a time:
 * produit → localisation → livraison → paiement → confirmation → suivi,
 * with « Vos protections » (§6.3) reachable from produit and suivi. One
 * primary action per screen; back is a quiet step. NO fake progression:
 * the sandbox has no server, so the walk ends on honest pending states and
 * the deeper tracking states are demo-addressable (?demo-journey=suivi&etat=…)
 * exactly like the established ?demo-order harness.
 */

export type JourneyScreen =
  | 'produit'
  | 'localisation'
  | 'livraison'
  | 'paiement'
  | 'confirmation'
  | 'suivi'
  | 'protections';

export const JOURNEY_SCREENS: readonly JourneyScreen[] = [
  'produit', 'localisation', 'livraison', 'paiement', 'confirmation', 'suivi', 'protections',
];

/** The §5.4 demo baseline the whole surface already uses: productSubtotal
 * (B + M — HER price) 11 500 F; Séra's demo quote carries D. Nothing here
 * computes the waterfall — these are the displayed legs. */
export const DEMO_PRODUCT: ProductViewModel = {
  productName: 'Pagne tissé Faso Dan Fani',
  resellerName: 'Chez Awa — Dassasgho',
  priceFcfa: 11_500,
  inStock: true,
};

const DEMO_DROP_CODE = '4732';

interface JourneyState {
  stack: JourneyScreen[];
  location: LocationViewModel;
  deliveryId: string;
  /** Chosen §6.1 mode — set on the paiement screen. */
  mode: 'A' | 'B' | null;
  tracking: TrackingViewModel;
  online: boolean;
}

export interface JourneyInit {
  screen: JourneyScreen;
  trackingEtat?: string | undefined;
  voix?: string | undefined;
}

/** Map the ?etat= demo param onto a tracking view model (the §6.3 order:
 * inspection → door payment provider-confirmed → the code, last). */
export function trackingModelFor(etat: string | undefined): TrackingViewModel {
  switch (etat) {
    case 'porte':
      return { step: 'porte' };
    case 'porte-b':
      return { step: 'porte', amountDueAtDoorFcfa: 11_500 };
    case 'porte-b-attente':
      return { step: 'porte', amountDueAtDoorFcfa: 11_500, doorPaymentPending: true };
    case 'code':
      return { step: 'porte', dropCode: DEMO_DROP_CODE };
    default:
      return {
        step: (TRACKING_STEPS as readonly string[]).includes(etat ?? '')
          ? (etat as TrackingStep)
          : 'confirmee',
      };
  }
}

function renderConfirmation(state: JourneyState): string {
  const fee = DEMO_SERA_QUOTE.find((o) => o.id === state.deliveryId)?.feeFcfa ?? 0;
  const paidNow = state.mode === 'B' ? fee : DEMO_PRODUCT.priceFcfa + fee;
  const dueAtDoor = state.mode === 'B' ? DEMO_PRODUCT.priceFcfa : 0;
  return [
    '<section class="confirmation" data-screen="confirmation">',
    `<h2>${t('confirmation.titre')}</h2>`,
    `<p class="fcfa-line"><span>${t('checkout.pay_now_label')}</span> <strong class="fcfa-figure-inline">${FCFA.format(paidNow)} F</strong></p>`,
    `<p class="fcfa-line"><span>${t('checkout.pay_at_door_label')}</span> <strong class="fcfa-figure-inline">${FCFA.format(dueAtDoor)} F</strong></p>`,
    `<p>${t('confirmation.suite')}</p>`,
    // Queued = pending, never done — there is no server in the sandbox.
    `<p class="status-chip status-pending">${t(state.online ? 'confirmation.en_attente' : 'confirmation.hors_ligne')}</p>`,
    state.location.voice.kind === 'queued'
      ? `<p class="status-chip status-pending" data-voice="queued">${t('voix.en_file')}</p>`
      : '',
    `<button class="primary-action" data-action="voir-suivi">${t('confirmation.suivre')}</button>`,
    '</section>',
  ].join('');
}

export function createJourney(container: HTMLElement, init: JourneyInit): void {
  const state: JourneyState = {
    stack: [init.screen === 'protections' ? 'produit' : init.screen],
    location: {
      selectedZone: null,
      landmark: '',
      directions: '',
      phone: '',
      voice: init.voix === 'en_file' ? { kind: 'queued' } : { kind: 'idle' },
    },
    deliveryId: 'standard',
    mode: null,
    tracking: trackingModelFor(init.trackingEtat),
    online: navigator.onLine,
  };
  if (init.screen === 'protections') state.stack.push('protections');

  let adapter: RecorderAdapter | null = null;
  let playbackUrl: string | null = null;

  const current = (): JourneyScreen => state.stack[state.stack.length - 1] ?? 'produit';

  function dispatchVoice(event: Parameters<typeof voiceNoteReduce>[1]): void {
    state.location.voice = voiceNoteReduce(state.location.voice, event);
    render();
  }

  function readFormInto(): void {
    const get = (name: string): string =>
      (container.querySelector(`input[name="${name}"]`) as HTMLInputElement | null)?.value ?? '';
    if (current() === 'localisation') {
      state.location.landmark = get('repere');
      state.location.directions = get('indications');
      state.location.phone = get('telephone');
    }
  }

  function go(screen: JourneyScreen): void {
    readFormInto();
    state.stack.push(screen);
    render();
  }

  function back(): void {
    if (state.stack.length > 1) {
      state.stack.pop();
      render();
    }
  }

  function screenHtml(): string {
    switch (current()) {
      case 'produit':
        return renderProductPage(DEMO_PRODUCT);
      case 'localisation':
        return renderLocationForm(state.location);
      case 'livraison':
        return renderDeliveryQuote({ options: DEMO_SERA_QUOTE, selectedId: state.deliveryId });
      case 'paiement': {
        const fee = DEMO_SERA_QUOTE.find((o) => o.id === state.deliveryId)?.feeFcfa ?? 0;
        return [
          `<div data-screen="paiement"><p class="step-line">${t('etape.paiement')}</p>`,
          renderCheckoutOptions({
            buyerTotalFcfa: DEMO_PRODUCT.priceFcfa + fee,
            optionA: { payNowFcfa: DEMO_PRODUCT.priceFcfa + fee, dueAtDoorFcfa: 0 },
            optionB: { available: true, payNowFcfa: fee, dueAtDoorFcfa: DEMO_PRODUCT.priceFcfa },
          }),
          '</div>',
        ].join('');
      }
      case 'confirmation':
        return renderConfirmation(state);
      case 'suivi':
        return renderTracking(state.tracking);
      case 'protections':
        return renderProtections();
    }
  }

  function render(): void {
    const offlineBanner = state.online
      ? ''
      : `<p class="offline-banner" data-role="offline">${t('hors_ligne.bandeau')}</p>`;
    const backButton =
      state.stack.length > 1
        ? `<button class="link-quiet back-step" data-action="retour">${icon('chevron', 'back-icon')}<span>${t('retour')}</span></button>`
        : '';
    container.innerHTML = `${offlineBanner}${backButton}<div class="journey-screen">${screenHtml()}</div>`;
  }

  container.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest('[data-action],[data-zone],[data-delivery],[data-key]');
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset['action'];
    const zone = target.dataset['zone'];
    const delivery = target.dataset['delivery'];
    const key = target.dataset['key'];
    if (zone !== undefined) {
      readFormInto();
      state.location.selectedZone = zone;
      render();
      return;
    }
    if (delivery !== undefined) {
      state.deliveryId = delivery;
      render();
      return;
    }
    switch (action) {
      case 'retour': back(); return;
      case 'acheter': go('localisation'); return;
      case 'lieu-continuer':
        // A recorded take is KEPT with the order: queued honestly (pending).
        if (state.location.voice.kind === 'recorded') dispatchVoice({ type: 'KEEP' });
        go('livraison');
        return;
      case 'livraison-continuer': go('paiement'); return;
      case 'protections': go('protections'); return;
      case 'protections-fermer': back(); return;
      case 'voir-suivi': go('suivi'); return;
      case 'souci': return; // the report path renders via order-view states (E2)
      case 'voix-enregistrer':
      case 'voix-reprendre':
        adapter ??= createMediaRecorderAdapter();
        if (adapter === null) { dispatchVoice({ type: 'RECORDER_ABSENT' }); return; }
        void adapter.start().then(
          () => dispatchVoice({ type: 'RECORD_STARTED' }),
          () => dispatchVoice({ type: 'MIC_REFUSED' }),
        );
        return;
      case 'voix-arreter':
        if (adapter === null) return;
        void adapter.stop().then((url) => {
          playbackUrl = url;
          dispatchVoice({ type: 'RECORD_STOPPED' });
        });
        return;
      case 'voix-ecouter': {
        const audio = container.querySelector('audio[data-role="voice-playback"]');
        if (audio instanceof HTMLAudioElement && playbackUrl !== null) {
          audio.src = playbackUrl;
          audio.hidden = false;
          void audio.play();
        }
        return;
      }
    }
    // §6.1 choice → confirmation (both options land on the same honest screen).
    if (key === 'checkout.option_a.choose') { state.mode = 'A'; go('confirmation'); return; }
    if (key === 'checkout.option_b.choose') { state.mode = 'B'; go('confirmation'); return; }
  });

  // Offline is a designed state (Ten Laws §7): the banner appears, nothing
  // is lost, queued stays queued — coming back online never fakes « done ».
  window.addEventListener('offline', () => { state.online = false; readFormInto(); render(); });
  window.addEventListener('online', () => { state.online = true; readFormInto(); render(); });

  render();
}
