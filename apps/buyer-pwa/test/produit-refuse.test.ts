import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCliente } from '../src/cliente/flow';
import type { QuoteFetch } from '../src/cliente/quote-model';
import { refusVue } from '../src/cliente/screens';
import type { ClienteProduit } from '../src/cliente/screens';

/**
 * ═══ PRODUIT-REFUSÉ-1 — « fix the 5 that is still open » (founder order
 * 2026-09-17), on the buyer's side ═══
 *
 * BEFORE: a buyer holding a page opened before the product was frozen (B5.2:
 * nobody confirmed its stock in a week), expired or retired could ask for a
 * price and PAY — the service folded the producer's « no » into the same
 * silence as an outage, and this app had no word for it. NOW the service
 * refuses `product_unavailable` at the price ask, and this app names it: not
 * « épuisé » (nobody took the last one), not « lien invalide » (her page was
 * real) — « pas en vente en ce moment », with ONE way out, the boutique.
 *
 * The cliente walk DRIVES the real flow (createCliente — no app code stubbed)
 * from the product page to the price ask, with the service scripted at the
 * flow's own `quoteSource` seam to refuse exactly as the Worker does.
 *
 * ═══ THE DOUBLES, AND THEIR BOUNDS ═══
 *  · the DOM container and elements — they record `innerHTML` verbatim and
 *    deliver events; they claim NOTHING about appearance.
 *  · the quote service — a scripted stand-in at the `quoteSource` seam,
 *    CONTRACT-CERTIFIED to the Worker: a refused quote is
 *    `{ status: 'refused', reason }` carrying the Worker's own `error` name
 *    (`checkout-do.ts` → `refuse('product_unavailable')`, 422).
 *
 * The real-browser half lives in `e2e/produit-refuse.spec.ts`.
 */

/* ─────────────────────────── the DOM stand-ins ──────────────────────────── */

class FauxElement {
  attrs: Record<string, string>;
  value = '';
  selectionStart: number | null = null;
  constructor(attrs: Record<string, string>) {
    this.attrs = attrs;
  }
  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }
  closest(selector: string): FauxElement | null {
    return selector === '[data-action]' && this.attrs['data-action'] !== undefined ? this : null;
  }
  querySelector(): null {
    return null;
  }
  setSelectionRange(): void {}
}

interface FauxConteneur {
  innerHTML: string;
  classList: { add: () => void; remove: () => void; toggle: () => void };
  style: { setProperty: () => void };
  addEventListener: (type: string, h: (ev: unknown) => void) => void;
  removeEventListener: () => void;
  querySelector: () => null;
  dispatch: (type: string, ev: unknown) => void;
}

function fauxConteneur(): FauxConteneur {
  const handlers: Record<string, Array<(ev: unknown) => void>> = {};
  return {
    innerHTML: '',
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    style: { setProperty: () => {} },
    addEventListener(type, h) {
      (handlers[type] ??= []).push(h);
    },
    removeEventListener: () => {},
    querySelector: () => null,
    dispatch(type, ev) {
      for (const h of handlers[type] ?? []) h(ev);
    },
  };
}

function presser(c: FauxConteneur, action: string, attrs: Record<string, string> = {}): void {
  expect(c.innerHTML, `l'action « ${action} » doit être à l'écran avant d'être pressée`).toContain(`data-action="${action}"`);
  c.dispatch('click', { target: new FauxElement({ 'data-action': action, ...attrs }) });
}

function taper(c: FauxConteneur, role: string, valeur: string): void {
  const el = new FauxElement({ 'data-role': role });
  el.value = valeur;
  el.selectionStart = valeur.length;
  c.dispatch('input', { target: el });
}

async function souffler(fois = 6): Promise<void> {
  for (let i = 0; i < fois; i += 1) await vi.advanceTimersByTimeAsync(0);
}

/** What she reads: the screen's text, tags stripped. */
const visible = (html: string): string => html.replace(/<[^>]+>/g, ' ');

const PRODUIT: ClienteProduit = {
  shopName: 'Chez Awa',
  prenom: 'Awa',
  slug: 'chez-awa',
  productName: 'Pagne tissé main',
  zone: 'Gounghin',
  priceFcfa: 11_500,
  assetRefs: [],
  inStock: true,
};

describe('the cliente — `product_unavailable` on the price ask is named, with the boutique as the one way out', () => {
  const vraiHTMLElement = globalThis.HTMLElement as unknown;
  let arrets: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as Record<string, unknown>)['HTMLElement'] = FauxElement;
  });

  afterEach(() => {
    for (const arreter of arrets) arreter();
    arrets = [];
    (globalThis as Record<string, unknown>)['HTMLElement'] = vraiHTMLElement;
    vi.useRealTimers();
  });

  it('the table gives the name ONE action — the boutique — and its own sentence, never épuisé’s', () => {
    const vue = refusVue('product_unavailable');
    expect(vue.action).toBe('voir-boutique');
    expect(vue.titre).toBe('Cet article n’est pas en vente en ce moment.');
    expect(vue.titre).not.toBe(refusVue('out_of_stock').titre);
  });

  it('C1 → C3 → the price ask refused ⇒ the honest surface names it; « Voir la boutique » is present, pressable and wired; the back arrow still lands her on C3', async () => {
    const asks: string[] = [];
    const vitrines: string[] = [];
    const quoteSource = async (quartier: string): Promise<QuoteFetch> => {
      asks.push(quartier);
      return { status: 'refused', reason: 'product_unavailable' };
    };
    const c = fauxConteneur();
    arrets.push(
      createCliente(c as unknown as HTMLElement, { produit: PRODUIT, quoteSource, onVitrine: (slug) => vitrines.push(slug) }),
    );

    expect(c.innerHTML).toContain('data-screen="C1"');
    presser(c, 'commander');
    expect(c.innerHTML).toContain('data-screen="C3"');
    presser(c, 'zone', { 'data-zone': 'Gounghin' });
    taper(c, 'phone', '70 12 34 56');
    taper(c, 'repere', 'Face à la pharmacie du marché');
    presser(c, 'continuer-c3');
    await souffler();

    // the tree survived, on the honest surface, under the service's own name
    expect(asks).toEqual(['Gounghin']);
    expect(c.innerHTML).toContain('data-screen="REFUS"');
    expect(c.innerHTML).toContain('data-motif="product_unavailable"');
    const lu = visible(c.innerHTML);
    expect(lu).toContain('Cet article n’est pas en vente en ce moment.');
    expect(lu).toContain('Il sera peut-être de retour bientôt.');
    expect(lu).toContain('Rien n’a été payé');
    expect(lu, 'not épuisé — nobody took the last one').not.toContain('épuisé');
    expect(lu, 'the generic price sentence is the wrong diagnosis here').not.toContain('afficher le prix');
    expect(lu, 'the raw name never reaches her').not.toContain('product_unavailable');
    // ONE primary action, the boutique — wired to the flow's own exit
    expect(c.innerHTML.match(/class="cl-cta /g) ?? []).toHaveLength(1);
    expect(c.innerHTML).not.toContain('data-action="reessayer-prix"');
    expect(c.innerHTML).not.toContain('data-action="prix-a-jour"');
    presser(c, 'voir-boutique');
    await souffler();
    expect(vitrines, 'the button must reach the boutique, not merely exist').toEqual(['chez-awa']);
    // …and she is never trapped: the back arrow stands and works
    presser(c, 'retour-c3');
    await souffler();
    expect(c.innerHTML).toContain('data-screen="C3"');
    expect(asks, 'going back asked no new price by itself').toEqual(['Gounghin']);
  });
});
