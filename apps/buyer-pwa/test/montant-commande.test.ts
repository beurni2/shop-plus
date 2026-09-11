import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCliente, SUIVI_PAIEMENT_MS } from '../src/cliente/flow';
import type { QuoteFetch, OrderFetch, RemiseFetch } from '../src/cliente/quote-model';
import type { ServerOrder } from '../src/cliente/quote-port';
import { REPRISE_CLE } from '../src/cliente/reprise';
import type { ClienteProduit, ClienteQuote } from '../src/cliente/screens';
import type { EnregistreurNote, NoteEnregistree } from '../src/cliente/voice-note';

/**
 * ═══ MONTANT-COMMANDE-1 (AUDIT-SHOP-2 F-54) — C6 STATES THE ORDER'S OWN AMOUNT ═══
 *
 * « Paiement de X FCFA confirmé par l'opérateur. » X used to be the QUOTE's
 * carried split for the mode she chose, while every order read — the create's
 * answer, the polls, the tracking — already carried the ORDER's own
 * `amountPaidAtCheckout`, validated at the boundary and then dropped. Today
 * the two cannot differ; the doctrine is « ask the ledger, not the response »:
 * a confirmed payment is stated from the order the server confirmed, never
 * from a price screen she looked at before it existed.
 *
 * Written RED first: the scripted service's order carries 12 900 while its
 * quote's split says 12 500, and the flow as the audit found it printed
 * 12 500. These walks DRIVE the real flow (createCliente — no app code
 * stubbed) from C1 to the confirmed C6, on the create road and on the
 * resumed-C6 road (a refresh while the operator was still to answer).
 *
 * ═══ THE DOUBLES, AND THEIR BOUNDS (stated, per the standing order) ═══
 *  · the DOM container and elements — as in privee-apres-confirmation: they
 *    record `innerHTML` verbatim and deliver events; they claim NOTHING about
 *    appearance.
 *  · the service — a scripted stand-in at the flow's own `quoteSource` seam;
 *    the order's `state` and amounts are what the test scripts, the way only
 *    the webhook and the ledger move them in production.
 *  · the recorder — the flow's own `enregistreur` seam.
 *  · the storage — a Map behind the Storage interface.
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

class FauxStorage implements Storage {
  private readonly m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

function fauxEnregistreur(): EnregistreurNote {
  let prise = 0;
  return {
    demarrer: async () => 'recording' as const,
    arreter: async (): Promise<NoteEnregistree> => {
      prise += 1;
      return { audioB64: `PRISE${prise}`, blobUrl: `blob:note-${prise}` };
    },
  };
}

/* ─────────────────────── the scripted service ───────────────────────────── */

const ISO = '2026-09-11T09:00:00.000Z';

/** The quote's split says 12 500 paid now on mode A — the figure C6 used to print. */
const QUOTE: ClienteQuote = {
  produitFcfa: 11_500,
  feeToday: 1_000,
  feeTomorrow: 1_000,
  totalToday: 12_500,
  totalTomorrow: 12_500,
  splitsToday: { A: { paidNow: 12_500, dueAtDelivery: 0 }, B: { paidNow: 1_000, dueAtDelivery: 11_500 } },
  splitsTomorrow: { A: { paidNow: 12_500, dueAtDelivery: 0 }, B: { paidNow: 1_000, dueAtDelivery: 11_500 } },
};

/** The ORDER the server holds says 12 900 — the ledger's word, the one C6 must state. */
const MONTANT_COMMANDE = 12_900;

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

interface Script {
  state: 'payment_pending' | 'confirmed';
}

function ordre(script: Script): ServerOrder {
  return {
    orderId: 'ord-montant-1',
    state: script.state,
    amountPaidAtCheckout: MONTANT_COMMANDE,
    amountDueAtDelivery: 0,
    buyerRef: 'ref-montant-1',
    doorLeg: 'none',
    acceptedAt: ISO,
  };
}

function serviceScripte(script: Script): (quartier: string) => Promise<QuoteFetch> {
  return async (): Promise<QuoteFetch> => ({
    status: 'ready',
    quote: QUOTE,
    bIndisponible: false,
    ids: { fullQuoteId: 'q-full-1', commandId: 'cmd-1', doorQuoteId: 'q-door-1', doorCommandId: 'cmd-door-1' },
    expiry: '2100-01-01T00:00:00.000Z',
    reserve: async (): Promise<{ status: 'reserved' }> => ({ status: 'reserved' }),
    commander: async (): Promise<OrderFetch> => ({ status: 'order', order: ordre(script) }),
    etatCommande: async (): Promise<OrderFetch> => ({ status: 'order', order: ordre(script) }),
    payerALaPorte: async (): Promise<OrderFetch> => ({ status: 'order', order: ordre(script) }),
    remise: async (): Promise<RemiseFetch> => ({ status: 'code', code: '654321' }),
  });
}

const LIEN = 'chez-awa#pagne-1';
const PHONE = '70 12 34 56';
const REPERE = 'Face à la pharmacie du marché';

/** The confirmed sentence, read through the markup: the amount is bold and its
 *  thousands separator is whatever `fmtFCFA` chose — the figure is what matters. */
const SEP = '(?:\\s|\\u00a0|\\u202f|&nbsp;|&#8239;)';
const phrase = (montant: number): RegExp =>
  new RegExp(`Paiement de (?:<b>)?${String(montant).slice(0, -3)}${SEP}${String(montant).slice(-3)}${SEP}FCFA(?:</b>)? confirmé par l’opérateur\\.`);

describe('MONTANT-COMMANDE-1 (F-54) — the confirmed sentence states the ORDER\'s amount, never the quote\'s split', () => {
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
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function monter(script: Script, storage = new FauxStorage()): FauxConteneur {
    const c = fauxConteneur();
    const arreter = createCliente(c as unknown as HTMLElement, {
      produit: PRODUIT,
      quoteSource: serviceScripte(script),
      enregistreur: fauxEnregistreur(),
      reprise: {
        lien: LIEN,
        storage,
        etatCommande: async (): Promise<OrderFetch> => ({ status: 'order', order: ordre(script) }),
        remise: async (): Promise<RemiseFetch> => ({ status: 'code', code: '654321' }),
      },
    });
    arrets.push(arreter);
    return c;
  }

  /** C1 → C3 with her answers → C4 → C5 (mode A) → Payer. */
  async function jusquAuPaiement(c: FauxConteneur): Promise<void> {
    expect(c.innerHTML).toContain('data-screen="C1"');
    presser(c, 'commander');
    expect(c.innerHTML).toContain('data-screen="C3"');
    presser(c, 'zone', { 'data-zone': 'Gounghin' });
    taper(c, 'phone', PHONE);
    taper(c, 'repere', REPERE);
    presser(c, 'voix-demarrer');
    await souffler();
    presser(c, 'voix-arreter');
    await souffler();
    presser(c, 'continuer-c3');
    await souffler();
    expect(c.innerHTML).toContain('data-screen="C4"');
    presser(c, 'continuer-c4');
    expect(c.innerHTML).toContain('data-screen="C5"');
    presser(c, 'choix-paiement', { 'data-mode': 'A' });
    presser(c, 'payer');
    await souffler();
    expect(c.innerHTML).toContain('data-screen="C6"');
  }

  it('the create road: the server answers the order confirmed at 12 900 — C6 prints 12 900, and the quote\'s 12 500 nowhere', async () => {
    const c = monter({ state: 'confirmed' });
    await jusquAuPaiement(c);
    expect(c.innerHTML).toContain('data-etat="confirmee"');
    expect(c.innerHTML, 'the ORDER\'s amount').toMatch(phrase(MONTANT_COMMANDE));
    expect(c.innerHTML, 'the QUOTE\'s split leaked onto the confirmed sentence').not.toMatch(phrase(12_500));
  });

  it('the poll road: the order is pending at the create, then the operator confirms — the poll\'s order carries the amount C6 prints', async () => {
    const script: Script = { state: 'payment_pending' };
    const c = monter(script);
    await jusquAuPaiement(c);
    expect(c.innerHTML).toContain('data-etat="attente-operateur"');
    expect(c.innerHTML, 'no amount while nobody has paid').not.toMatch(/Paiement de/);
    // The webhook moves the order; the flow's own poll reads it at its first rung.
    script.state = 'confirmed';
    await vi.advanceTimersByTimeAsync(SUIVI_PAIEMENT_MS[0]! + 10);
    await souffler();
    expect(c.innerHTML).toContain('data-etat="confirmee"');
    expect(c.innerHTML).toMatch(phrase(MONTANT_COMMANDE));
    expect(c.innerHTML).not.toMatch(phrase(12_500));
  });

  it('the resumed road: a refresh on C6-attente re-asks the server; the confirmed sentence is the order\'s, with no quote split in hand at all', async () => {
    const storage = new FauxStorage();
    storage.setItem(
      REPRISE_CLE,
      JSON.stringify({
        lien: LIEN, ecran: 'C6', zone: 'Gounghin', repere: REPERE, phone: PHONE,
        delivery: 'today', pay: 'A', orderId: 'ord-montant-1', buyerRef: 'ref-montant-1', essai: 1,
      }),
    );
    const c = monter({ state: 'confirmed' }, storage);
    await souffler(12);
    expect(c.innerHTML).toContain('data-screen="C6"');
    expect(c.innerHTML).toContain('data-etat="confirmee"');
    expect(c.innerHTML).toMatch(phrase(MONTANT_COMMANDE));
    expect(c.innerHTML).not.toMatch(phrase(12_500));
  });
});
