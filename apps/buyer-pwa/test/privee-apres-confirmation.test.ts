import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCliente, SUIVI_PAIEMENT_MS } from '../src/cliente/flow';
import type { QuoteFetch, OrderFetch, RemiseFetch } from '../src/cliente/quote-model';
import type { ServerOrder } from '../src/cliente/quote-port';
import { REPRISE_CLE } from '../src/cliente/reprise';
import type { ClienteProduit, ClienteQuote } from '../src/cliente/screens';
import type { EnregistreurNote, NoteEnregistree } from '../src/cliente/voice-note';

/**
 * ═══ PRIVEE-APRES-CONFIRMATION (AUDIT-SHOP-2 F-58) — what the phone keeps of
 * her, and for how long ═══
 *
 * THE AUDIT'S MEASUREMENT: her number and her repère sat in sessionStorage
 * from C3 to C10 — the whole delivery, on a phone that may be shared — cleared
 * only when the journey ended; and the voice note she recorded (its bytes and
 * its local replay URL) lived until the tab died, one more URL leaking on
 * every REFAIRE, while the liste side revoked. The GPS pin and the audio bytes
 * were memory-only (verified) — the snapshot never carried them.
 *
 * THE LAW THIS PINS: BEFORE the operator confirms, everything stays — a retry
 * after `payment_failed` must send her contact and her note again, and a
 * refresh on « Nous attendons l'opérateur » must resume with them. The MOMENT
 * the operator confirms, the order holds her contact and nothing can need it
 * again: the snapshot stops carrying her number and her repère, and the note
 * is released. REFAIRE releases the take it replaces.
 *
 * These tests DRIVE the real flow (createCliente — no app code stubbed) from
 * C1 through C3 (her answers, a recorded note) to the create and the
 * operator's answer, and read what the storage and the URL registry hold at
 * each step. Written RED first, against the flow as the audit found it.
 *
 * ═══ THE DOUBLES, AND THEIR BOUNDS (stated, per the standing order) ═══
 *  · the DOM container and elements — as in porte-vers-merci: they record
 *    `innerHTML` verbatim and deliver events; they claim NOTHING about
 *    appearance.
 *  · the service — a scripted stand-in at the flow's own `quoteSource` seam;
 *    the order's `state` moves ONLY when the test moves it, the way only the
 *    webhook moves it in production; the create records the contact it was
 *    handed, verbatim.
 *  · the recorder — the flow's own `enregistreur` seam (the harness injects
 *    one too): each take is one base64 body and one fake blob URL, numbered.
 *  · the storage — a Map behind the Storage interface.
 *  · `URL.revokeObjectURL` — spied, never replaced.
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
  expect(c.innerHTML, `l'action « ${action} » doit être à l'écran avant d'être pressée`).toContain(
    `data-action="${action}"`,
  );
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

/* ───────────────────────── the storage stand-in ─────────────────────────── */

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

/** What the tab's snapshot holds right now, as the codec wrote it. */
function carnet(storage: FauxStorage): Record<string, unknown> {
  const raw = storage.getItem(REPRISE_CLE);
  expect(raw, 'le carnet de reprise doit exister').not.toBeNull();
  return JSON.parse(raw!) as Record<string, unknown>;
}

/* ──────────────────────── the recorder stand-in ─────────────────────────── */

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

const ISO = '2026-08-13T09:00:00.000Z';

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

interface Script {
  /** The order's state AS THE SERVER HOLDS IT — moved only by the test. */
  state: 'payment_pending' | 'confirmed' | 'payment_failed';
  /** Every contact a create was handed, verbatim, in order. */
  creates: Array<Record<string, unknown> | undefined>;
  /** How the price ask answers: at once, refused (« Pas de connexion »), or never (still on the wire). */
  quote?: 'ready' | 'unreachable' | 'deferred';
}

function serviceScripte(script: Script): (quartier: string) => Promise<QuoteFetch> {
  const ordre = (): ServerOrder => ({
    orderId: 'ord-privee-1',
    state: script.state,
    amountPaidAtCheckout: 12_500,
    amountDueAtDelivery: 0,
    buyerRef: 'ref-privee-1',
    doorLeg: 'none',
    acceptedAt: ISO,
  });
  return async (): Promise<QuoteFetch> => {
    if (script.quote === 'unreachable') return { status: 'unreachable' };
    if (script.quote === 'deferred') return new Promise<QuoteFetch>(() => {});
    return {
    status: 'ready',
    quote: QUOTE,
    bIndisponible: false,
    ids: { fullQuoteId: 'q-full-1', commandId: 'cmd-1', doorQuoteId: 'q-door-1', doorCommandId: 'cmd-door-1' },
    expiry: '2100-01-01T00:00:00.000Z',
    reserve: async (): Promise<{ status: 'reserved' }> => ({ status: 'reserved' }),
    commander: async (_mode: unknown, _essai: unknown, contact?: unknown): Promise<OrderFetch> => {
      script.creates.push(contact as Record<string, unknown> | undefined);
      return { status: 'order', order: ordre() };
    },
    etatCommande: async (): Promise<OrderFetch> => ({ status: 'order', order: ordre() }),
    payerALaPorte: async (): Promise<OrderFetch> => ({ status: 'order', order: ordre() }),
    remise: async (): Promise<RemiseFetch> => ({ status: 'code', code: '654321' }),
    };
  };
}

/** A snapshot as a C6-attente refresh leaves it: the order exists, the operator has not answered. */
function snapshotC6(): string {
  return JSON.stringify({
    lien: LIEN, ecran: 'C6', zone: 'Gounghin', repere: REPERE, phone: PHONE,
    delivery: 'today', pay: 'A', orderId: 'ord-privee-1', buyerRef: 'ref-privee-1', essai: 1,
  });
}

/* ─────────────────────────────── the walks ──────────────────────────────── */

const LIEN = 'chez-awa#pagne-1';
const PHONE = '70 12 34 56';
const REPERE = 'Face à la pharmacie du marché';

describe('PRIVEE-APRES-CONFIRMATION — what the phone keeps of her, and for how long', () => {
  const vraiHTMLElement = globalThis.HTMLElement as unknown;
  let arrets: Array<() => void> = [];
  let revoques: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as Record<string, unknown>)['HTMLElement'] = FauxElement;
    revoques = [];
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
      revoques.push(url);
    });
  });

  afterEach(() => {
    for (const arreter of arrets) arreter();
    arrets = [];
    (globalThis as Record<string, unknown>)['HTMLElement'] = vraiHTMLElement;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function monter(script: Script, storageDonne?: FauxStorage): { c: FauxConteneur; storage: FauxStorage; arreter: () => void } {
    const c = fauxConteneur();
    const storage = storageDonne ?? new FauxStorage();
    const service = serviceScripte(script);
    const ordre = async (): Promise<OrderFetch> => ({
      status: 'order',
      order: { orderId: 'ord-privee-1', state: script.state, amountPaidAtCheckout: 12_500, amountDueAtDelivery: 0, buyerRef: 'ref-privee-1', doorLeg: 'none', acceptedAt: ISO },
    });
    const arreter = createCliente(c as unknown as HTMLElement, {
      produit: PRODUIT,
      quoteSource: service,
      enregistreur: fauxEnregistreur(),
      reprise: {
        lien: LIEN,
        storage,
        etatCommande: ordre,
        remise: async (): Promise<RemiseFetch> => ({ status: 'code', code: '654321' }),
      },
    });
    arrets.push(arreter);
    return { c, storage, arreter };
  }

  /** C1 → C3 with her answers and ONE recorded take → C4 → C5 (mode A) → Payer.
   *  `aC3` runs once her answers are typed, BEFORE any order exists. */
  async function jusquAuPaiement(c: FauxConteneur, aC3?: () => void): Promise<void> {
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
    aC3?.();
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

  it('BEFORE the operator answers, the snapshot keeps her number and her repère, and her note is still hers', async () => {
    const script: Script = { state: 'payment_pending', creates: [] };
    const { c, storage } = monter(script);
    await jusquAuPaiement(c, () => {
      // BEFORE ANY ORDER — the default confirm state is the demo's « confirmed »,
      // and that alone must never blank what she typed: the order is the guard.
      const k3 = carnet(storage);
      expect(k3['ecran']).toBe('C3');
      expect(k3['phone']).toBe(PHONE);
      expect(k3['repere']).toBe(REPERE);
    });
    // « Nous attendons l'opérateur » — a refresh here must resume WITH her contact.
    expect(c.innerHTML).toContain('data-etat="attente-operateur"');
    const k = carnet(storage);
    expect(k['ecran']).toBe('C6');
    expect(k['phone']).toBe(PHONE);
    expect(k['repere']).toBe(REPERE);
    expect(k['orderId']).toBe('ord-privee-1');
    // The create carried the contact and the note, verbatim.
    expect(script.creates).toHaveLength(1);
    expect(script.creates[0]?.['phone']).toBe(PHONE);
    expect(script.creates[0]?.['repere']).toBe(REPERE);
    expect(script.creates[0]?.['audioB64']).toBe('PRISE1');
    expect(revoques, 'nothing is released while the operator has not answered').toEqual([]);
  });

  it('a retry after payment_failed sends her contact and her note AGAIN — nothing was released', async () => {
    const script: Script = { state: 'payment_failed', creates: [] };
    const { c, storage } = monter(script);
    await jusquAuPaiement(c);
    expect(c.innerHTML).toContain('data-action="reessayer-paiement"');
    expect(carnet(storage)['phone']).toBe(PHONE);
    presser(c, 'reessayer-paiement');
    await souffler();
    expect(script.creates).toHaveLength(2);
    expect(script.creates[1]?.['phone']).toBe(PHONE);
    expect(script.creates[1]?.['repere']).toBe(REPERE);
    expect(script.creates[1]?.['audioB64']).toBe('PRISE1');
    expect(revoques).toEqual([]);
  });

  it('THE MOMENT the operator confirms, the snapshot drops her number and her repère and the note is released — and stays so on the tracking', async () => {
    const script: Script = { state: 'payment_pending', creates: [] };
    const { c, storage } = monter(script);
    await jusquAuPaiement(c);
    // The webhook moves the order; the flow's own poll reads it at its first rung.
    script.state = 'confirmed';
    await vi.advanceTimersByTimeAsync(SUIVI_PAIEMENT_MS[0]! + 10);
    expect(c.innerHTML).toContain('data-etat="confirmee"');
    const k = carnet(storage);
    expect(k['ecran']).toBe('C6');
    expect(k['phone'], 'her number must not sit in the tab for the whole delivery').toBe('');
    expect(k['repere'], 'her repère must not sit in the tab for the whole delivery').toBe('');
    // …while what the tracking needs to resume stays.
    expect(k['zone']).toBe('Gounghin');
    expect(k['orderId']).toBe('ord-privee-1');
    expect(k['buyerRef']).toBe('ref-privee-1');
    expect(revoques, 'the note that rode the order is released once, by its own URL').toEqual(['blob:note-1']);
    // On the tracking road the snapshot stays empty of her contact.
    presser(c, 'suivre');
    await souffler();
    expect(c.innerHTML).toContain('data-screen="C7"');
    const k7 = carnet(storage);
    expect(k7['ecran']).toBe('C7');
    expect(k7['phone']).toBe('');
    expect(k7['repere']).toBe('');
    expect(revoques).toEqual(['blob:note-1']);
  });

  it('a create that answers ALREADY-CONFIRMED releases on that road too', async () => {
    const script: Script = { state: 'confirmed', creates: [] };
    const { c, storage } = monter(script);
    await jusquAuPaiement(c);
    expect(c.innerHTML).toContain('data-etat="confirmee"');
    expect(carnet(storage)['phone']).toBe('');
    expect(carnet(storage)['repere']).toBe('');
    expect(script.creates[0]?.['audioB64'], 'the note rode the create BEFORE being released').toBe('PRISE1');
    expect(revoques).toEqual(['blob:note-1']);
  });

  it('REFAIRE releases the take it replaces, and the new take is the one that rides', async () => {
    const script: Script = { state: 'payment_pending', creates: [] };
    const { c } = monter(script);
    presser(c, 'commander');
    presser(c, 'zone', { 'data-zone': 'Gounghin' });
    taper(c, 'phone', PHONE);
    presser(c, 'voix-demarrer');
    await souffler();
    presser(c, 'voix-arreter');
    await souffler();
    expect(revoques).toEqual([]);
    presser(c, 'voix-refaire');
    await souffler();
    expect(revoques, 'the first take is released when she records over it').toEqual(['blob:note-1']);
    presser(c, 'voix-arreter');
    await souffler();
    presser(c, 'continuer-c3');
    await souffler();
    presser(c, 'continuer-c4');
    presser(c, 'choix-paiement', { 'data-mode': 'A' });
    presser(c, 'payer');
    await souffler();
    expect(script.creates[0]?.['audioB64']).toBe('PRISE2');
  });
});

/**
 * THE VERIFIER'S ROAD (F-58, handled once): a refresh WHILE « Nous attendons
 * l'opérateur » is on screen. The resumed order id plus the flow's mount
 * default (the demo's « confirmed ») made the first cut blank her contact on
 * the skeleton render, BEFORE the server had been re-asked — and when that
 * re-ask was refused, the blank stood. A second refresh then resumed with no
 * number, and a later retry went out contactless. Only the server's own word
 * may say « confirmed ».
 */
describe('PRIVEE-APRES-CONFIRMATION — a refresh on « Nous attendons l’opérateur » keeps her contact until the server itself confirms', () => {
  const vraiHTMLElement = globalThis.HTMLElement as unknown;
  let arrets: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as Record<string, unknown>)['HTMLElement'] = FauxElement;
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const arreter of arrets) arreter();
    arrets = [];
    (globalThis as Record<string, unknown>)['HTMLElement'] = vraiHTMLElement;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function remonter(script: Script, storage: FauxStorage): { c: FauxConteneur; arreter: () => void } {
    const c = fauxConteneur();
    const service = serviceScripte(script);
    const ordre = async (): Promise<OrderFetch> => ({
      status: 'order',
      order: { orderId: 'ord-privee-1', state: script.state, amountPaidAtCheckout: 12_500, amountDueAtDelivery: 0, buyerRef: 'ref-privee-1', doorLeg: 'none', acceptedAt: ISO },
    });
    const arreter = createCliente(c as unknown as HTMLElement, {
      produit: PRODUIT,
      quoteSource: service,
      enregistreur: fauxEnregistreur(),
      reprise: { lien: LIEN, storage, etatCommande: ordre, remise: async (): Promise<RemiseFetch> => ({ status: 'code', code: '654321' }) },
    });
    arrets.push(arreter);
    return { c, arreter };
  }

  it('while the resumed C6 still waits for the price (the skeleton), the snapshot carries her contact', () => {
    const storage = new FauxStorage();
    storage.setItem(REPRISE_CLE, snapshotC6());
    remonter({ state: 'payment_pending', creates: [], quote: 'deferred' }, storage);
    const k = carnet(storage);
    expect(k['ecran']).toBe('C6');
    expect(k['phone']).toBe(PHONE);
    expect(k['repere']).toBe(REPERE);
  });

  it('a resumed C6 whose price ask is REFUSED keeps her contact in the standing snapshot', async () => {
    const storage = new FauxStorage();
    storage.setItem(REPRISE_CLE, snapshotC6());
    const { c } = remonter({ state: 'payment_pending', creates: [], quote: 'unreachable' }, storage);
    await souffler();
    expect(c.innerHTML).toContain('data-screen="REFUS"');
    const k = carnet(storage);
    expect(k['phone'], 'refused ask: the standing snapshot must still carry her number').toBe(PHONE);
    expect(k['repere']).toBe(REPERE);
  });

  it('two refreshes on C6-attente (the first ask refused), then payment_failed: the retry still sends what she typed', async () => {
    const storage = new FauxStorage();
    storage.setItem(REPRISE_CLE, snapshotC6());
    const un = remonter({ state: 'payment_pending', creates: [], quote: 'unreachable' }, storage);
    await souffler();
    un.arreter();
    const s2: Script = { state: 'payment_failed', creates: [], quote: 'ready' };
    const { c } = remonter(s2, storage);
    await souffler();
    expect(c.innerHTML).toContain('data-screen="C6"');
    await vi.advanceTimersByTimeAsync(SUIVI_PAIEMENT_MS[0]! + 10);
    expect(c.innerHTML).toContain('data-action="reessayer-paiement"');
    presser(c, 'reessayer-paiement');
    await souffler();
    expect(s2.creates).toHaveLength(1);
    expect(s2.creates[0], 'the retry after two refreshes must still carry her contact').toBeDefined();
    expect(s2.creates[0]?.['phone']).toBe(PHONE);
    expect(s2.creates[0]?.['repere']).toBe(REPERE);
  });

  it('CONTROL — a resumed C6 whose price answers at once, then the operator confirms: the contact leaves the snapshot only then', async () => {
    const storage = new FauxStorage();
    storage.setItem(REPRISE_CLE, snapshotC6());
    const script: Script = { state: 'payment_pending', creates: [], quote: 'ready' };
    const { c } = remonter(script, storage);
    await souffler();
    expect(c.innerHTML).toContain('data-etat="attente-operateur"');
    expect(carnet(storage)['phone']).toBe(PHONE);
    script.state = 'confirmed';
    await vi.advanceTimersByTimeAsync(SUIVI_PAIEMENT_MS[0]! + 10);
    expect(c.innerHTML).toContain('data-etat="confirmee"');
    expect(carnet(storage)['phone']).toBe('');
    expect(carnet(storage)['repere']).toBe('');
  });

});
