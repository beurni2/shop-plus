import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCliente } from '../src/cliente/flow';
import type { QuoteFetch, OrderFetch, RemiseFetch } from '../src/cliente/quote-model';
import type { ServerOrder } from '../src/cliente/quote-port';
import type { ClienteProduit, ClienteQuote } from '../src/cliente/screens';

/**
 * ═══ PORTE-VERS-MERCI — every door road into C9 must still end at C10 ═══
 *
 * THE BUG (founder-reported class — the screen renders and cannot move on):
 * `voir-code` was fixed by e6bcc54 to restart the delivery watch after its
 * `jump('C9')`, because `jump` → `clearT()` kills the watch and bumps the
 * generation. The SAME defect stood on every C8/door road into C9:
 *
 *   · `suivreLaPorte`'s provider-confirmed branch (door leg paid → C9),
 *   · `porte-bon` mode A (« Tout est bon », nothing owed → C9),
 *   · `porte-bon` mode B with nothing left owed (2 600 ms → C9).
 *
 * On a pay-at-door order the remise happens, the server records `livree`, and
 * nobody reads it — her screen shows the code for ever: no C10, no close.
 *
 * These tests DRIVE the real flow (createCliente — no app code stubbed) from
 * C1 through checkout to C8, take each door road into C9, then let the fake
 * service answer `livree` — and assert the thank-you screen is reached and the
 * watch stops asking at terminal.
 *
 * ═══ THE DOUBLES, AND THEIR BOUNDS (stated, per the standing order) ═══
 *
 * Only native boundaries are doubled:
 *  · the DOM container — records `innerHTML` verbatim and delivers events to
 *    the flow's OWN registered listeners. It may NEVER claim anything about
 *    appearance: no layout, no colour, no spacing, no touch targets.
 *  · the service — a scripted stand-in at the flow's own `quoteSource` port
 *    seam (the seam `main.ts` fills from the wire and the harness fills from
 *    seed.ts), contract-certified to the real service's bounds:
 *    `payerALaPorte` NEVER answers `paid` (a 200 is not a payment — only the
 *    webhook moves the door leg), the create carries `buyerRef`, and `livree`
 *    only ever appears on an order read after the remise happened.
 * Every action is pressed only after asserting it is ON the rendered screen.
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
  /** Real-DOM semantics for the one selector the flow uses on a tap target:
   *  an element that carries `data-action` is its own closest match. */
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

/** Press a control — and FIRST prove it is on the screen. A tap on a control
 *  the renderer did not emit would be the test lying about reachability. */
function presser(c: FauxConteneur, action: string, attrs: Record<string, string> = {}): void {
  expect(c.innerHTML, `l'action « ${action} » doit être à l'écran avant d'être pressée`).toContain(
    `data-action="${action}"`,
  );
  c.dispatch('click', { target: new FauxElement({ 'data-action': action, ...attrs }) });
}

/** Type into one of C3's fields through the flow's own input listener. */
function taper(c: FauxConteneur, role: string, valeur: string): void {
  const el = new FauxElement({ 'data-role': role });
  el.value = valeur;
  el.selectionStart = valeur.length;
  c.dispatch('input', { target: el });
}

/** Drain the microtask/timer seam without advancing past any real rung. */
async function souffler(fois = 6): Promise<void> {
  for (let i = 0; i < fois; i += 1) await vi.advanceTimersByTimeAsync(0);
}

/* ─────────────────────── the scripted door service ──────────────────────── */

const ISO = '2026-08-13T09:00:00.000Z';

const QUOTE: ClienteQuote = {
  produitFcfa: 11_500,
  feeToday: 1_000,
  feeTomorrow: 1_000,
  totalToday: 12_500,
  totalTomorrow: 12_500,
  splitsToday: {
    A: { paidNow: 12_500, dueAtDelivery: 0 },
    B: { paidNow: 1_000, dueAtDelivery: 11_500 },
  },
  splitsTomorrow: {
    A: { paidNow: 12_500, dueAtDelivery: 0 },
    B: { paidNow: 1_000, dueAtDelivery: 11_500 },
  },
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

interface ScriptPorte {
  /** The door leg AS THE SERVER HOLDS IT — moved only by the test, the way
   *  only the webhook moves it in production. */
  doorLeg: 'none' | 'due' | 'paid';
  /** The remise happened on the service — terminal, set only by the test. */
  livree: boolean;
  /** Every order read the flow makes, counted — the watch's pulse. */
  etatReads: number;
}

function serviceScripte(script: ScriptPorte): (quartier: string) => Promise<QuoteFetch> {
  const ordre = (surcharge?: Partial<ServerOrder>): ServerOrder => ({
    orderId: 'ord-porte-1',
    state: 'confirmed',
    amountPaidAtCheckout: script.doorLeg === 'none' ? 12_500 : 1_000,
    amountDueAtDelivery: script.doorLeg === 'none' ? 0 : 11_500,
    buyerRef: 'ref-porte-1',
    doorLeg: script.doorLeg,
    acceptedAt: ISO,
    readyAt: ISO,
    departedAt: ISO,
    arrivedAt: ISO,
    ...(script.livree ? { livree: true } : {}),
    ...surcharge,
  });
  return async (): Promise<QuoteFetch> => ({
    status: 'ready',
    quote: QUOTE,
    bIndisponible: false,
    ids: { fullQuoteId: 'q-full-1', commandId: 'cmd-1', doorQuoteId: 'q-door-1', doorCommandId: 'cmd-door-1' },
    expiry: '2100-01-01T00:00:00.000Z',
    reserve: async (): Promise<{ status: 'reserved' }> => ({ status: 'reserved' }),
    commander: async (): Promise<OrderFetch> => ({ status: 'order', order: ordre() }),
    etatCommande: async (): Promise<OrderFetch> => {
      script.etatReads += 1;
      return { status: 'order', order: ordre() };
    },
    // BOUND (contract-certified): a 200 here is NOT a payment. The real
    // service answers the order with the door leg STILL DUE; only the
    // provider webhook moves it. This double must never answer `paid`.
    payerALaPorte: async (): Promise<OrderFetch> => ({ status: 'order', order: ordre({ doorLeg: 'due' }) }),
    // BOUND (contract-certified to the fixed server, 2026-08-21): §6.3 — the
    // code comes AFTER door payment. The real remise route withholds (uniform
    // `{ok:false}` 404 → `refused`) while the door leg is `due`; it answers the
    // code only for `none` (full-prepay) or `paid`. A double that revealed on
    // `due` would be kinder than the service it stands for.
    remise: async (): Promise<RemiseFetch> =>
      script.doorLeg === 'due' ? { status: 'refused' } : { status: 'code', code: '654321' },
  });
}

/* ───────────────────────────── the shared walk ──────────────────────────── */

/** C1 → C3 (her answers) → C4 → C5 (mode) → paid+confirmed C6 → C7 → C8. */
async function jusquALaPorte(c: FauxConteneur, mode: 'A' | 'B'): Promise<void> {
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
  presser(c, 'choix-paiement', { 'data-mode': mode });
  presser(c, 'payer');
  await souffler();
  expect(c.innerHTML).toContain('data-screen="C6"');
  presser(c, 'suivre');
  await souffler(); // the C7 watch's first read lands: arrivedAt is a fact
  expect(c.innerHTML).toContain('data-screen="C7"');
  presser(c, 'porte');
  expect(c.innerHTML).toContain('data-screen="C8"');
}

/** The remise happens on the service, and the screen must END: C10, and the
 *  watch dead at terminal (a finished order costs her no further read). */
async function laRemiseDoitFermer(c: FauxConteneur, script: ScriptPorte): Promise<void> {
  script.livree = true;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(c.innerHTML, 'livree est un fait serveur — l’écran doit finir sur C10').toContain(
    'data-screen="C10"',
  );
  // …and the ending is usable: the one action is on it.
  expect(c.innerHTML).toContain('data-action="suivi-terminer"');
  // The watch dies at terminal: no read is ever taken again.
  const avant = script.etatReads;
  await vi.advanceTimersByTimeAsync(600_000);
  expect(script.etatReads, 'la montre doit mourir sur livree').toBe(avant);
}

/* ─────────────────────────────── the tests ──────────────────────────────── */

describe('PORTE-VERS-MERCI — chaque route C8 → C9 garde la montre vivante', () => {
  const vraiHTMLElement = globalThis.HTMLElement as unknown;
  let arrets: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    // The flow's tap dispatch checks `instanceof HTMLElement` — in this node
    // environment the class does not exist, so the stand-in takes the name.
    (globalThis as Record<string, unknown>)['HTMLElement'] = FauxElement;
  });

  afterEach(() => {
    for (const arreter of arrets) arreter();
    arrets = [];
    (globalThis as Record<string, unknown>)['HTMLElement'] = vraiHTMLElement;
    vi.useRealTimers();
  });

  function monter(script: ScriptPorte): FauxConteneur {
    const c = fauxConteneur();
    arrets.push(
      createCliente(c as unknown as HTMLElement, {
        produit: PRODUIT,
        quoteSource: serviceScripte(script),
      }),
    );
    return c;
  }

  it('mode B — le paiement à la porte confirmé par l’opérateur mène à C9, puis livree mène à C10', async () => {
    const script: ScriptPorte = { doorLeg: 'due', livree: false, etatReads: 0 };
    const c = monter(script);
    await jusquALaPorte(c, 'B');

    // « Tout est bon » — money is owed, so the charge goes out…
    presser(c, 'porte-bon');
    await souffler();
    // …and the door watch polls: still due (a 200 is not a payment)…
    expect(c.innerHTML).toContain('data-etat="paiement-porte"');
    // …until the WEBHOOK moves the leg, and the next rung reads `paid`.
    script.doorLeg = 'paid';
    await vi.advanceTimersByTimeAsync(1_500);
    expect(c.innerHTML).toContain('data-screen="C9"');

    await souffler(); // her code arrives from the remise route
    expect(c.innerHTML).toContain('654 321');

    // The rider takes the remise; the server records livree. The screen ENDS.
    await laRemiseDoitFermer(c, script);
  });

  it('mode A — « Tout est bon » sans reste à payer mène à C9, puis livree mène à C10', async () => {
    const script: ScriptPorte = { doorLeg: 'none', livree: false, etatReads: 0 };
    const c = monter(script);
    await jusquALaPorte(c, 'A');

    presser(c, 'porte-bon');
    expect(c.innerHTML).toContain('data-screen="C9"');
    await souffler(); // the watch's arrivedAt rule fetches her code
    expect(c.innerHTML).toContain('654 321');

    await laRemiseDoitFermer(c, script);
  });

  it('mode B, déjà payé — revenir à C8 et repasser par « Tout est bon » (2 600 ms) mène à C9, puis livree mène à C10', async () => {
    const script: ScriptPorte = { doorLeg: 'due', livree: false, etatReads: 0 };
    const c = monter(script);
    await jusquALaPorte(c, 'B');

    // She pays at the door once (the site-A road, above)…
    presser(c, 'porte-bon');
    await souffler();
    script.doorLeg = 'paid';
    await vi.advanceTimersByTimeAsync(1_500);
    expect(c.innerHTML).toContain('data-screen="C9"');

    // …then steps back to the tracking, and to the door again — the real road
    // of a buyer who closed her code screen while the rider stands there.
    presser(c, 'retour-c7');
    await souffler();
    expect(c.innerHTML).toContain('data-screen="C7"');
    presser(c, 'porte');
    expect(c.innerHTML).toContain('data-screen="C8"');
    // Nothing left owed (doorLeg `paid`): the accepted card stands, and the
    // delayed jump lands her on C9.
    presser(c, 'porte-bon');
    await vi.advanceTimersByTimeAsync(2_600);
    expect(c.innerHTML).toContain('data-screen="C9"');

    await laRemiseDoitFermer(c, script);
  });

  /**
   * §6.3 — « VOIR MON CODE » NEVER HANDS HER THE CODE BEFORE SHE PAYS THE DOOR.
   *
   * FOUNDER (2026-08-21): « if buyer chooses pay at the [door], code must be
   * released after payment confirmation. » Audit finding A1/A2: on a door-DUE
   * order the « Voir mon code » shortcut called `demanderLeCode` directly,
   * bypassing the door-leg gate `revelationPermise` already encodes — and the
   * server (now fixed) withholds, so the road only ever led to an honest « pas
   * encore » card. This walk drives the REAL flow: on a due order the shortcut
   * takes her to the DOOR (C8), the same screen « Je suis à la porte » opens,
   * where she pays and the code reveals on confirmation. It was RED before the
   * routing fix (the shortcut jumped to C9 and asked for a code it cannot have).
   */
  it('voir-code sur une commande à payer à la porte mène à la porte, jamais au code', async () => {
    const script: ScriptPorte = { doorLeg: 'due', livree: false, etatReads: 0 };
    const c = monter(script);

    // C1 → C7 (tracking), the live door-due delivery — « Voir mon code » is on it.
    presser(c, 'commander');
    presser(c, 'zone', { 'data-zone': 'Gounghin' });
    taper(c, 'phone', '70 12 34 56');
    taper(c, 'repere', 'Face à la pharmacie du marché');
    presser(c, 'continuer-c3');
    await souffler();
    presser(c, 'continuer-c4');
    presser(c, 'choix-paiement', { 'data-mode': 'B' });
    presser(c, 'payer');
    await souffler();
    presser(c, 'suivre');
    await souffler();
    expect(c.innerHTML).toContain('data-screen="C7"');

    // §6.3: the product is still owed. « Voir mon code » must NOT open a code
    // screen — it routes her to the door to pay first.
    presser(c, 'voir-code');
    expect(c.innerHTML, 'voir-code sur une commande due doit mener à la porte, pas au code').toContain('data-screen="C8"');
    expect(c.innerHTML, 'aucun code avant le paiement de la porte').not.toContain('654 321');

    // From the door she pays; the operator confirms; NOW the code, then C10.
    presser(c, 'porte-bon');
    await souffler();
    expect(c.innerHTML).toContain('data-etat="paiement-porte"');
    script.doorLeg = 'paid';
    await vi.advanceTimersByTimeAsync(1_500);
    expect(c.innerHTML).toContain('data-screen="C9"');
    await souffler();
    expect(c.innerHTML).toContain('654 321');

    await laRemiseDoitFermer(c, script);
  });
});
