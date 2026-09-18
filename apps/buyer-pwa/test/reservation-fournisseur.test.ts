import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCliente } from '../src/cliente/flow';
import type { OrderFetch, QuoteFetch, ReserveFetch } from '../src/cliente/quote-model';
import { refusVue } from '../src/cliente/screens';
import type { ClienteProduit, ClienteQuote, ModePaiement } from '../src/cliente/screens';

/**
 * ═══ B5.1 (RESERVATION-FOURNISSEUR-1) — the buyer's side ═══
 *
 * BEFORE: the reservation only held an order slot on Shop+; the unit itself
 * was never asked of Boutik+, so two buyers could each reserve and pay for
 * the last one. NOW the service asks Boutik+ for the unit at reservation and,
 * when the producer answers « nobody's unit left », refuses `out_of_stock` on
 * the reserve road — a name this surface already knows from the price ask
 * (« Cet article vient d’être épuisé. Quelqu’un a pris le dernier. »). This
 * walk proves the reserve road renders it the same way, with the boutique
 * as the one way out and the back arrow standing. The real flow is driven
 * (createCliente — no app code stubbed); only the DOM and the service seam are
 * doubled, the double contract-certified to the Worker's `{error}` (422).
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

const visible = (html: string): string => html.replace(/<[^>]+>/g, ' ');

/* ─────────────────────── the scripted service ───────────────────────────── */

const QUOTE: ClienteQuote = {
  produitFcfa: 11_500,
  feeToday: 1_000,
  feeTomorrow: 1_000,
  totalToday: 12_500,
  totalTomorrow: 12_500,
  splitsToday: { A: { paidNow: 12_500, dueAtDelivery: 0 }, B: { paidNow: 1_000, dueAtDelivery: 11_500 } },
  splitsTomorrow: { A: { paidNow: 12_500, dueAtDelivery: 0 }, B: { paidNow: 1_000, dueAtDelivery: 11_500 } },
};

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

const ORDRE: OrderFetch = {
  status: 'order',
  order: {
    orderId: 'ord-rf-1', state: 'payment_pending', amountPaidAtCheckout: 12_500, amountDueAtDelivery: 0,
    buyerRef: 'ref-rf-1', doorLeg: 'none', acceptedAt: '2026-09-18T09:00:00.000Z',
  },
};

function serviceScripte(reserve: ReserveFetch, commandes: ModePaiement[]) {
  return async (): Promise<QuoteFetch> => ({
    status: 'ready',
    quote: QUOTE,
    bIndisponible: false,
    ids: { fullQuoteId: 'q-full-1', commandId: 'cmd-1', doorQuoteId: 'q-door-1', doorCommandId: 'cmd-door-1' },
    expiry: '2100-01-01T00:00:00.000Z',
    reserve: async (): Promise<ReserveFetch> => reserve,
    commander: async (mode: ModePaiement): Promise<OrderFetch> => {
      commandes.push(mode);
      return ORDRE;
    },
    etatCommande: async (): Promise<OrderFetch> => ORDRE,
    payerALaPorte: async (): Promise<OrderFetch> => ORDRE,
    remise: async () => ({ status: 'code' as const, code: '654321' }),
  });
}

describe('RESERVATION-FOURNISSEUR-1 — the reserve refused out_of_stock is the épuisé card, with the boutique as the way out', () => {
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

  it('the table already names it, with the boutique as its one action', () => {
    const vue = refusVue('out_of_stock');
    expect(vue.action).toBe('voir-boutique');
    expect(vue.titre).toBe('Cet article vient d’être épuisé.');
  });

  it('C1 → C3 → C4 → C5 → Payer, the reserve refused ⇒ the honest surface says épuisé; no order was asked; « Voir la boutique » is wired; the back arrow lands her on C3', async () => {
    const commandes: ModePaiement[] = [];
    const vitrines: string[] = [];
    const c = fauxConteneur();
    arrets.push(
      createCliente(c as unknown as HTMLElement, {
        produit: PRODUIT,
        quoteSource: serviceScripte({ status: 'refused', reason: 'out_of_stock' }, commandes),
        onVitrine: (slug) => vitrines.push(slug),
      }),
    );

    expect(c.innerHTML).toContain('data-screen="C1"');
    presser(c, 'commander');
    expect(c.innerHTML).toContain('data-screen="C3"');
    presser(c, 'zone', { 'data-zone': 'Gounghin' });
    taper(c, 'phone', '70 12 34 56');
    taper(c, 'repere', 'Face à la pharmacie du marché');
    presser(c, 'continuer-c3');
    await souffler();
    expect(c.innerHTML).toContain('data-screen="C4"');
    presser(c, 'continuer-c4');
    expect(c.innerHTML).toContain('data-screen="C5"');
    presser(c, 'choix-paiement', { 'data-mode': 'A' });
    presser(c, 'payer');
    await souffler();

    // the tree survived, on the honest surface, under the service's own name
    expect(c.innerHTML).toContain('data-screen="REFUS"');
    expect(c.innerHTML).toContain('data-motif="out_of_stock"');
    const lu = visible(c.innerHTML);
    expect(lu).toContain('Cet article vient d’être épuisé.');
    expect(lu).toContain('Quelqu’un a pris le dernier.');
    expect(lu).toContain('Rien n’a été payé');
    expect(lu, 'the raw name never reaches her').not.toContain('out_of_stock');
    expect(commandes, 'no order is created behind a refused reserve').toEqual([]);
    // ONE primary action — the boutique — wired to the flow's own exit
    expect(c.innerHTML.match(/class="cl-cta /g) ?? []).toHaveLength(1);
    presser(c, 'voir-boutique');
    await souffler();
    expect(vitrines).toEqual(['chez-awa']);
    // …and she is never trapped
    presser(c, 'retour-c3');
    await souffler();
    expect(c.innerHTML).toContain('data-screen="C3"');
  });
});
