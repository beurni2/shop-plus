/**
 * PARCOURS D'ACHAT — the orchestrator (§4 machine à états).
 *
 * `applyTheme` sets the reseller's habillage on the container ONCE (survives the
 * innerHTML re-renders); every screen reads it through the stylesheet, so the
 * whole flow renders in her theme. The state machine walks S1 → S2 → S3 → S4 →
 * S6 → S5 and opens the S7 sheet over the current screen. The vitrine links call
 * back out (the FROZEN attribution seam owned by main.ts). §9.1: « Un souci ? »
 * is only a button — nothing is wired behind it.
 */

import { applyTheme, type VitrineThemeKey } from '../vitrine/themes';
import {
  renderS1, renderS2, renderS3, renderS4, renderS5, renderS6, renderS7,
  type AchatProduit, type Vitesse,
} from './screens';

export type AchatEcran = 'produit' | 'recap' | 'localisation' | 'livraison' | 'confirmation' | 'suivi' | 'protections';

export interface AchatInit {
  readonly produit: AchatProduit;
  readonly theme?: VitrineThemeKey | undefined;
  readonly ecran?: AchatEcran | undefined;
  readonly epuise?: boolean | undefined;
  readonly sansVoix?: boolean | undefined;
  /** S4 initial state (harness: ready | loading | error). */
  readonly etat?: 'ready' | 'loading' | 'error' | undefined;
  readonly vitesse?: Vitesse | undefined;
  /** S5: code révélé (arrivé) vs scellé (en route). */
  readonly revealed?: boolean | undefined;
  /** Navigate to her full vitrine — the frozen attribution seam (main.ts). */
  readonly onVitrine?: ((slug: string) => void) | undefined;
}

interface FlowState {
  ecran: AchatEcran;
  mode: 'especes' | 'mobile';
  vitesse: Vitesse;
  etat: 'ready' | 'loading' | 'error';
  revealed: boolean;
  stack: AchatEcran[];
  beforeSheet: AchatEcran;
}

export function createAchat(container: HTMLElement, init: AchatInit): void {
  // §0 loi 3 — the buyer flow's fallback default is INDIGO (the handoff decree),
  // NOT the vitrine's inherited laterite. The storefront's own theme (Aïcha =
  // laterite) still wins when resolved; indigo is only the themeless fallback.
  // (The canon Storefront.theme default → indigo is a contracts change, flagged
  // to the founder, NOT made here.)
  applyTheme(container, init.theme ?? 'indigo');
  container.classList.add('ac-root');

  const m = init.produit;
  const startEcran: AchatEcran = init.ecran ?? 'produit';
  const state: FlowState = {
    ecran: startEcran,
    mode: 'especes',
    vitesse: init.vitesse ?? 'standard',
    etat: init.etat ?? 'ready',
    revealed: init.revealed ?? false,
    stack: [startEcran],
    beforeSheet: startEcran === 'protections' ? 'produit' : startEcran,
  };

  function screenHtml(): string {
    switch (state.ecran) {
      case 'produit':
        return renderS1(m, { epuise: init.epuise ?? false, sansVoix: init.sansVoix ?? false });
      case 'recap':
        return renderS2(m, { mode: state.mode });
      case 'localisation':
        return renderS3(m);
      case 'livraison':
        return renderS4(m, { etat: state.etat, speed: state.vitesse });
      case 'confirmation':
        return renderS6(m);
      case 'suivi':
        return renderS5(m, { revealed: state.revealed });
      case 'protections':
        return renderS7(m);
    }
  }

  function render(): void {
    container.innerHTML = screenHtml();
  }

  function go(ecran: AchatEcran): void {
    state.stack.push(ecran);
    state.ecran = ecran;
    render();
  }

  function back(): void {
    if (state.stack.length > 1) {
      state.stack.pop();
      state.ecran = state.stack[state.stack.length - 1] ?? 'produit';
      render();
    }
  }

  container.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest('[data-action]');
    if (!(el instanceof HTMLElement)) return;
    const action = el.getAttribute('data-action');
    switch (action) {
      case 'vitrine':
        init.onVitrine?.(el.getAttribute('data-slug') ?? m.slug);
        return;
      case 'protections':
        state.beforeSheet = state.ecran;
        state.ecran = 'protections';
        render();
        return;
      case 'protections-fermer':
        state.ecran = state.beforeSheet;
        render();
        return;
      case 'commander':
        go('recap');
        return;
      case 'choix-paiement':
        state.mode = (el.getAttribute('data-mode') as 'especes' | 'mobile') ?? 'especes';
        render();
        return;
      case 'continuer-recap':
        go('localisation');
        return;
      case 'quartier':
        render();
        return;
      case 'continuer-lieu':
        state.etat = 'ready';
        go('livraison');
        return;
      case 'choix-vitesse':
        state.vitesse = (el.getAttribute('data-speed') as Vitesse) ?? 'standard';
        render();
        return;
      case 'reessayer':
        state.etat = 'ready';
        render();
        return;
      case 'confirmer':
        go('confirmation');
        return;
      case 'suivre':
        go('suivi');
        return;
      case 'retour':
        back();
        return;
      case 'souci':
      case 'voix-play':
      case 'voix-chemin':
        // §9.1 / demo: affordances only — no flow wired behind them.
        return;
    }
  });

  render();
}
