import { t, tf } from './i18n';
import { FCFA } from './format';
import { icon } from './icons';
import { renderProductPage, type ProductViewModel } from './product-view';
import { renderEnt4 } from './vitrine/entries';
import { demoStorefrontPort } from './vitrine/profile';
import { seedProduct } from './vitrine/catalog';
import { VITRINE_THEMES } from './vitrine/themes';
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
 * computes the waterfall — these are the displayed legs.
 *
 * The signed-link product belongs to Aïcha — the ONE demo storefront the buyer
 * vitrine actually resolves and themes (demoStorefrontPort / aicha-4821). So a
 * buyer who lands straight on the product (no vitrine round trip) still has her
 * boutique one tap away: the reseller resolves to her storefront on EVERY
 * product page (C-ENT1/C-ENT2), not only on the round trip. `resellerName` is
 * her storefront name, so the resolved C-ENT1 anchor and the plain fallback
 * line name the SAME store. */
export const DEMO_PRODUCT: ProductViewModel = {
  productName: 'Pagne tissé Faso Dan Fani',
  resellerName: 'Chez Aïcha Mode',
  priceFcfa: 11_500,
  inStock: true,
};

/** Her storefront slug — the reseller the product page resolves its vitrine
 * entry from on a DIRECT landing (the fix: reachable, not only via a round
 * trip). Matches `demoStorefrontPort`'s themed demo storefront. */
export const DEMO_RESELLER_SLUG = 'aicha-4821';

const DEMO_DROP_CODE = '4732';

interface JourneyState {
  stack: JourneyScreen[];
  location: LocationViewModel;
  deliveryId: string;
  /** Chosen §6.1 mode — set on the paiement screen. */
  mode: 'A' | 'B' | null;
  tracking: TrackingViewModel;
  online: boolean;
  /** E1/E3 — vitrine-entry context: her storefront, resolved on EVERY product
   * landing (from the product's reseller), not only when arrived from a tile. */
  vitrine?: NonNullable<ProductViewModel['vitrine']> | undefined;
  /** V7 — the tapped product's signed-page facts (name/price/stock swap). */
  vitrineProduct?: { name: string; priceFcfa: number; inStock: boolean } | undefined;
  /** E2 — a direct landing on the épuisé product page (renders C-ENT3). */
  stockEpuise: boolean;
}

export interface JourneyInit {
  screen: JourneyScreen;
  trackingEtat?: string | undefined;
  voix?: string | undefined;
  /** ?depuis-vitrine={slug}&pid={pid} — the V7 entry (same attribution). */
  depuisVitrine?: { slug: string; pid: string } | undefined;
  /** ?stock=epuise — land directly on the épuisé product page (E2 · C-ENT3). */
  stockEpuise?: boolean | undefined;
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
    `<p class="fcfa-line"><span>${t('checkout.pay_now_label')}</span> <strong class="fcfa-figure-inline">${FCFA.format(paidNow)} FCFA</strong></p>`,
    `<p class="fcfa-line"><span>${t('checkout.pay_at_door_label')}</span> <strong class="fcfa-figure-inline">${FCFA.format(dueAtDoor)} FCFA</strong></p>`,
    `<p>${t('confirmation.suite')}</p>`,
    // Queued = pending, never done — there is no server in the sandbox.
    `<p class="status-chip status-pending">${t(state.online ? 'confirmation.en_attente' : 'confirmation.hors_ligne')}</p>`,
    state.location.voice.kind === 'queued'
      ? `<p class="status-chip status-pending" data-voice="queued">${t('voix.en_file')}</p>`
      : '',
    `<button class="primary-action" data-action="voir-suivi">${t('confirmation.suivre')}</button>`,
    // E3 — C-ENT4: after confirmation only (§4.1), the quiet way back to her boutique.
    ...(state.vitrine
      ? [renderEnt4({ prenom: state.vitrine.prenom, slug: state.vitrine.slug, accent: state.vitrine.accent })]
      : []),
    '</section>',
  ].join('');
}

/** Resolve a storefront slug to the buyer-side vitrine ENTRY (C-ENT context) —
 * shop name, first name, the /v/ slug, and the theme colours. ONE resolution,
 * used by BOTH the direct product landing (from the product's reseller) and the
 * vitrine round trip, so the entry is byte-identical whichever way she arrived.
 * undefined = the reseller has no reachable storefront (the plain reseller line
 * is the honest fallback — no entry is invented). */
export function resolveVitrineEntry(slug: string): NonNullable<ProductViewModel['vitrine']> | undefined {
  const resolved = demoStorefrontPort().resolve(slug);
  if (!resolved) return undefined;
  const sf = resolved.storefront;
  const th = VITRINE_THEMES[sf.theme];
  const prenom = sf.name.replace(/^Chez\s+/i, '').split(' ')[0] ?? sf.name;
  return { shopName: sf.name, prenom, slug: sf.slug, accent: th.accent, on: th.on, soft: th.soft, deep: th.deep };
}

/** V7 — the vitrine context rides the journey when arrived via a vitrine tile:
 * the SIGNED page of THAT product (name/price swapped from the seed), the SAME
 * attribution (already recorded on vitrine land), and the C-ENT4 exit on C6. */
export function vitrineJourneyContext(
  slug: string,
  pid: string,
): { vitrine: NonNullable<ProductViewModel['vitrine']>; product?: { name: string; priceFcfa: number; inStock: boolean } } | undefined {
  const vitrine = resolveVitrineEntry(slug);
  if (!vitrine) return undefined;
  const seed = seedProduct(pid);
  return {
    vitrine,
    ...(seed ? { product: { name: seed.name, priceFcfa: seed.priceFcfa, inStock: seed.inStock } } : {}),
  };
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
    stockEpuise: init.stockEpuise ?? false,
  };
  if (init.depuisVitrine) {
    const ctx = vitrineJourneyContext(init.depuisVitrine.slug, init.depuisVitrine.pid);
    if (ctx) {
      state.vitrine = ctx.vitrine;
      state.vitrineProduct = ctx.product;
    }
  }
  // The fix (VITRINE-ENTRY-REACH): a DIRECT landing (signed link, no round
  // trip) still resolves her boutique from the product's reseller — so C-ENT1/
  // C-ENT2 (and C-ENT4 on confirmation) render on every product page, not only
  // after a vitrine tile. Round-trip context, if present, already won above.
  if (!state.vitrine) {
    state.vitrine = resolveVitrineEntry(DEMO_RESELLER_SLUG);
  }
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
      case 'produit': {
        // Base landing product: ?stock=epuise lands on the épuisé page (E2).
        const base: ProductViewModel = { ...DEMO_PRODUCT, inStock: state.stockEpuise ? false : DEMO_PRODUCT.inStock };
        return renderProductPage(
          state.vitrine
            ? {
                ...base,
                // Round-trip (vitrine tile) swaps in THAT product's signed facts,
                // stock included; a direct landing keeps the base (épuisé-aware).
                ...(state.vitrineProduct
                  ? {
                      productName: state.vitrineProduct.name,
                      priceFcfa: state.vitrineProduct.priceFcfa,
                      inStock: state.vitrineProduct.inStock,
                      resellerName: state.vitrine.shopName,
                    }
                  : { resellerName: state.vitrine.shopName }),
                vitrine: state.vitrine,
              }
            : base,
        );
      }
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
