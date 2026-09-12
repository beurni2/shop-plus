import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCliente } from '../src/cliente/flow';
import type { OrderFetch, QuoteFetch, ReserveFetch } from '../src/cliente/quote-model';
import { refusVue, renderRefus } from '../src/cliente/screens';
import type { ClienteProduit, ClienteQuote, ModePaiement } from '../src/cliente/screens';

/**
 * ═══ REFUS-NOMMÉS-1 (AUDIT-SHOP-2 F-53) — every name the service answers on
 * the reserve and the order roads gets its own true sentence ═══
 *
 * THE AUDIT'S MEASUREMENT: the honest refusal surface knew the QUOTE road's
 * names and nothing past it. A hold that ran out (`reservation_expired`), a
 * hold that vanished (`quote_not_reserved`), a hold someone else has
 * (`reservation_held_by_another`), a quote the service no longer knows
 * (`quote_unknown`) or cannot read back (`stored_quote_unreadable`), a gift
 * paid at the door (`liste_prepaiement_requis`), a second address on a liste
 * (`liste_contact_conflit`) — and, past the audit's list but on the very road
 * §6.3 designed, a buyer the door ladder turns away
 * (`pay_at_door_not_eligible`) — ALL landed on « Nous ne pouvons pas afficher
 * le prix. Réessayez dans un instant. » with a « Réessayer » that re-asked a
 * price she already had. « Rien n'a été payé » stayed true; the diagnosis did
 * not, and for the door refusals the button led back to the same wall.
 *
 * `charge_rejected` is NOT here on purpose: it never crosses the wire as a
 * refusal name — a rejected charge comes back as an ORDER at
 * `payment_failed`, spoken by the confirmation screen's own échec sentence.
 *
 * The walks DRIVE the real flow (createCliente — no app code stubbed) from
 * the product page to Payer, with the service scripted at the flow's own
 * `quoteSource` seam to answer each name exactly as the Worker does, and read
 * the screen she lands on and the road her one button opens.
 *
 * ═══ THE DOUBLES, AND THEIR BOUNDS ═══
 *  · the DOM container and elements — they record `innerHTML` verbatim and
 *    deliver events; they claim NOTHING about appearance.
 *  · the service — a scripted stand-in at the `quoteSource` seam, CONTRACT-
 *    CERTIFIED to the Worker: a refused reserve or create is
 *    `{ status: 'refused', reason }` carrying the Worker's own `error` name
 *    (quote-port's `refusalName`), never a throw.
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

/** What she reads: the screen's text, tags stripped. */
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

interface Script {
  /** How the FIRST reserve answers; every later one is a hold. */
  reserve: ReserveFetch;
  /** How the create answers for a mode. */
  commander: (mode: ModePaiement) => OrderFetch;
  /** Every price ask, with the key-minting flag the flow passed. */
  asks: boolean[];
  /** Every create, by mode, in order. */
  commandes: ModePaiement[];
}

const ORDRE: OrderFetch = {
  status: 'order',
  order: {
    orderId: 'ord-refus-1', state: 'payment_pending', amountPaidAtCheckout: 12_500, amountDueAtDelivery: 0,
    buyerRef: 'ref-refus-1', doorLeg: 'none', acceptedAt: '2026-09-12T09:00:00.000Z',
  },
};

function serviceScripte(script: Script): (quartier: string, renouveler?: boolean) => Promise<QuoteFetch> {
  let reserves = 0;
  return async (_quartier, renouveler = false): Promise<QuoteFetch> => {
    script.asks.push(renouveler);
    return {
      status: 'ready',
      quote: QUOTE,
      bIndisponible: false,
      ids: { fullQuoteId: 'q-full-1', commandId: 'cmd-1', doorQuoteId: 'q-door-1', doorCommandId: 'cmd-door-1' },
      expiry: '2100-01-01T00:00:00.000Z',
      reserve: async (): Promise<ReserveFetch> => {
        reserves += 1;
        return reserves === 1 ? script.reserve : { status: 'reserved' };
      },
      commander: async (mode: ModePaiement): Promise<OrderFetch> => {
        script.commandes.push(mode);
        return script.commander(mode);
      },
      etatCommande: async (): Promise<OrderFetch> => ORDRE,
      payerALaPorte: async (): Promise<OrderFetch> => ORDRE,
      remise: async () => ({ status: 'code' as const, code: '654321' }),
    };
  };
}

/* ─────────────────────────────── the walks ──────────────────────────────── */

describe('REFUS-NOMMÉS-1 — the reserve and order roads, walked', () => {
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

  function monter(script: Script): FauxConteneur {
    const c = fauxConteneur();
    arrets.push(createCliente(c as unknown as HTMLElement, { produit: PRODUIT, quoteSource: serviceScripte(script) }));
    return c;
  }

  /** C1 → C3 (her answers) → C4 → C5, mode chosen → Payer. */
  async function payer(c: FauxConteneur, mode: ModePaiement): Promise<void> {
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
  }

  it('the hold ran out (reserve → reservation_expired): she reads WHY, never the price sentence, and her one button asks a NEW price', async () => {
    const script: Script = { reserve: { status: 'refused', reason: 'reservation_expired' }, commander: () => ORDRE, asks: [], commandes: [] };
    const c = monter(script);
    await payer(c, 'A');
    // the tree survived, on the honest surface, under the service's own name
    expect(c.innerHTML).toContain('data-screen="REFUS"');
    expect(c.innerHTML).toContain('data-motif="reservation_expired"');
    const lu = visible(c.innerHTML);
    expect(lu).toContain('Le temps de garde est passé.');
    expect(lu).toContain('Rien n’a été payé');
    expect(lu, 'the generic price sentence is the wrong diagnosis here').not.toContain('afficher le prix');
    expect(lu, 'the raw name never reaches her').not.toContain('reservation_expired');
    // the primary action is present, pressable, and wired to a NEW key
    expect(c.innerHTML).toContain('data-action="prix-a-jour"');
    expect(c.innerHTML).not.toContain('data-action="reessayer-prix"');
    expect(script.asks).toEqual([false]);
    presser(c, 'prix-a-jour');
    await souffler();
    expect(script.asks, 'the button minted a new key').toEqual([false, true]);
    expect(c.innerHTML).not.toContain('data-screen="REFUS"');
    expect(c.innerHTML, 'she is back on her road').toMatch(/data-screen="C[45]"/);
    expect(script.commandes, 'nothing was created').toEqual([]);
  });

  it('the door ladder turns her away (create → pay_at_door_not_eligible): the sentence names the door, and the button lands her on « Tout payer maintenant », already chosen', async () => {
    const script: Script = {
      reserve: { status: 'reserved' },
      commander: (mode) => (mode === 'B' ? { status: 'refused', reason: 'pay_at_door_not_eligible' } : ORDRE),
      asks: [], commandes: [],
    };
    const c = monter(script);
    await payer(c, 'B');
    expect(script.commandes).toEqual(['B']);
    expect(c.innerHTML).toContain('data-screen="REFUS"');
    expect(c.innerHTML).toContain('data-motif="pay_at_door_not_eligible"');
    const lu = visible(c.innerHTML);
    expect(lu).toContain('Le paiement à la porte n’est pas possible pour cette commande.');
    expect(lu).toContain('Rien n’a été payé');
    expect(lu).not.toContain('afficher le prix');
    expect(lu).not.toContain('pay_at_door_not_eligible');
    // « Réessayer » would send her into the same wall; the way out is the other mode
    expect(c.innerHTML).not.toContain('data-action="reessayer-prix"');
    expect(c.innerHTML).toContain('data-action="payer-tout"');
    presser(c, 'payer-tout');
    await souffler();
    expect(c.innerHTML).toContain('data-screen="C5"');
    expect(c.innerHTML, 'mode A is the one chosen').toMatch(/class="cl-opt cl-payopt cl-opt-on" data-action="choix-paiement" data-mode="A"/);
    expect(c.innerHTML, 'mode B is no longer chosen').not.toMatch(/cl-opt-on" data-action="choix-paiement" data-mode="B"/);
    // …and the next step is reachable: Payer creates the FULL order
    presser(c, 'payer');
    await souffler();
    expect(script.commandes).toEqual(['B', 'A']);
    expect(c.innerHTML).toContain('data-screen="C6"');
  });

  it('a gift paid at the door (create → liste_prepaiement_requis) takes the same road to « Tout payer maintenant »', async () => {
    const script: Script = {
      reserve: { status: 'reserved' },
      commander: (mode) => (mode === 'B' ? { status: 'refused', reason: 'liste_prepaiement_requis' } : ORDRE),
      asks: [], commandes: [],
    };
    const c = monter(script);
    await payer(c, 'B');
    expect(c.innerHTML).toContain('data-motif="liste_prepaiement_requis"');
    expect(visible(c.innerHTML)).toContain('Pour un cadeau, on paie tout maintenant.');
    presser(c, 'payer-tout');
    await souffler();
    expect(c.innerHTML).toMatch(/cl-opt-on" data-action="choix-paiement" data-mode="A"/);
  });

  it('the quote is gone (create → quote_unknown): named, and the button asks a new price', async () => {
    const script: Script = {
      reserve: { status: 'reserved' },
      commander: () => ({ status: 'refused', reason: 'quote_unknown' }),
      asks: [], commandes: [],
    };
    const c = monter(script);
    await payer(c, 'A');
    expect(c.innerHTML).toContain('data-motif="quote_unknown"');
    expect(visible(c.innerHTML)).toContain('Ce prix n’est plus connu.');
    presser(c, 'prix-a-jour');
    await souffler();
    expect(script.asks).toEqual([false, true]);
    expect(c.innerHTML).toMatch(/data-screen="C[45]"/);
  });
});

/* ────────────────── the table — every name, one true sentence ───────────── */

describe('REFUS-NOMMÉS-1 — the eight names render their own sentence, one action, « Rien n’a été payé »', () => {
  // `null` = NO primary action, on purpose: `liste_contact_conflit`'s one
  // reachable road is a stale fiche whose contact every in-app retry would
  // re-send into the same refusal (verifier, handled once); the sentence names
  // the true road — the liste's link, reopened — and the back arrow stands.
  const cases: Array<[string, string, string | null]> = [
    ['reservation_expired', 'Le temps de garde est passé.', 'prix-a-jour'],
    ['quote_not_reserved', 'Cette commande n’est plus gardée.', 'prix-a-jour'],
    ['reservation_held_by_another', 'Quelqu’un d’autre garde cette commande.', 'prix-a-jour'],
    ['quote_unknown', 'Ce prix n’est plus connu.', 'prix-a-jour'],
    ['stored_quote_unreadable', 'Ce prix ne peut plus être lu.', 'prix-a-jour'],
    ['liste_prepaiement_requis', 'Pour un cadeau, on paie tout maintenant.', 'payer-tout'],
    ['liste_contact_conflit', 'La liste a déjà une adresse.', null],
    ['pay_at_door_not_eligible', 'Le paiement à la porte n’est pas possible pour cette commande.', 'payer-tout'],
  ];
  for (const [reason, titre, action] of cases) {
    it(`« ${reason} » → « ${titre} » with ${action === null ? 'NO primary action (the back arrow only)' : `the one action « ${action} »`}`, () => {
      const html = renderRefus(reason);
      const lu = visible(html);
      expect(lu).toContain(titre);
      expect(lu).toContain('Rien n’a été payé');
      expect(lu, 'not the generic price sentence').not.toContain('afficher le prix');
      expect(lu, 'the raw name is never shown').not.toContain(reason);
      expect(html.match(/class="cl-cta /g) ?? [], action === null ? 'no primary action' : 'exactly one primary action').toHaveLength(action === null ? 0 : 1);
      expect(html, 'the back arrow always stands').toContain('data-action="retour-c3"');
      expect(refusVue(reason).action).toBe(action);
      expect(html).not.toContain('FCFA');
      for (const banned of ['erreur', 'Erreur', 'veuillez', 'Veuillez', 'invalide', 'échec', 'en attente']) {
        expect(lu.includes(banned), `« ${reason} » says « ${banned} »`).toBe(false);
      }
    });
  }

  it('an unknown name still gets the generic sentence — the table grew, the fallback did not move', () => {
    expect(visible(renderRefus('some_name_the_service_grows_next'))).toContain('afficher le prix');
  });
});
