import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCliente } from '../src/cliente/flow';
import type { QuoteFetch } from '../src/cliente/quote-model';
import { refusVue } from '../src/cliente/screens';
import type { ClienteProduit } from '../src/cliente/screens';
import { httpStorefrontPort, VitrinePause } from '../src/vitrine/profile';
import { renderVitrinePause } from '../src/vitrine/render';

/**
 * ═══ PAUSE-VENTE-1 — « paused resellers can not sell anything until they are
 * reactivated » (founder ruling 2026-09-17), on the buyer's side ═══
 *
 * BEFORE: the service answered a paused reseller's shop like any other, so
 * there was nothing for this app to say. NOW the service says two things and
 * this app must hear both: the page read answers `{ enPause: true, name }` on
 * a 200 (the storefront port raises it as a PAUSE, never « lien invalide »),
 * and the quote refuses `reseller_paused` (the honest refusal surface names
 * it, with NO button that would lead back into the same pause).
 *
 * The cliente walk DRIVES the real flow (createCliente — no app code stubbed)
 * from the product page to the price ask, with the service scripted at the
 * flow's own `quoteSource` seam to refuse exactly as the Worker does.
 *
 * ═══ THE DOUBLES, AND THEIR BOUNDS ═══
 *  · the DOM container and elements — they record `innerHTML` verbatim and
 *    deliver events; they claim NOTHING about appearance.
 *  · `globalThis.fetch` for the storefront port — a scripted 200 body.
 *  · the quote service — a scripted stand-in at the `quoteSource` seam,
 *    CONTRACT-CERTIFIED to the Worker: a refused quote is
 *    `{ status: 'refused', reason }` carrying the Worker's own `error` name.
 *
 * The real-browser halves (the page card on the real http port, the signed
 * link, the REFUS reached through the real quote port) live in
 * `e2e/pause-vente.spec.ts`.
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

/* ───────────────────────── the storefront port ──────────────────────────── */

function withStubbedFetch<T>(body: unknown, status: number, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

describe('the storefront port — the service\'s pause is raised as a PAUSE, with her name', () => {
  const port = httpStorefrontPort('https://svc.example');

  it('`{ enPause: true, name }` on a 200 raises VitrinePause carrying the name — never « lien invalide », never a storefront', async () => {
    const attente = withStubbedFetch({ service: 'storefront-service', enPause: true, name: 'Chez Binta', slug: 'binta-7412' }, 200, () =>
      port.resolve('binta-7412'),
    );
    await expect(attente).rejects.toBeInstanceOf(VitrinePause);
    await withStubbedFetch({ service: 'storefront-service', enPause: true, name: 'Chez Binta', slug: 'binta-7412' }, 200, async () => {
      try {
        await port.resolve('binta-7412');
        expect.unreachable('the pause must be raised');
      } catch (e) {
        expect((e as VitrinePause).nom).toBe('Chez Binta');
      }
    });
  });

  it('only the literal pause is a pause: a flag without a name, or a truthy non-boolean, is the honest not-found', async () => {
    expect(await withStubbedFetch({ enPause: true }, 200, () => port.resolve('x'))).toBeUndefined();
    expect(await withStubbedFetch({ enPause: 'oui', name: 'Chez Binta' }, 200, () => port.resolve('x'))).toBeUndefined();
  });

  it('a real storefront body still resolves as the shop (the pause check never eats a shop)', async () => {
    const got = await withStubbedFetch(
      { id: 'sf_1', slug: 'binta-7412', name: 'Chez Binta', resellerId: 'rs-1', curatedItems: [], featuredItems: [], sections: [], cover: { status: 'none' }, avatar: { mode: 'monogram' } },
      200,
      () => port.resolve('binta-7412'),
    );
    expect(got?.storefront.name).toBe('Chez Binta');
  });
});

describe('the pause card — her name, the sentence, the one ghost way out; a server byte travels escaped', () => {
  it('renders the pause state with the name escaped and the same way out as the not-found card', () => {
    const html = renderVitrinePause('Chez <b>Binta</b> & fils');
    expect(html).toContain('data-etat="pause"');
    expect(html).toContain('Chez &lt;b&gt;Binta&lt;/b&gt; &amp; fils fait une pause.');
    expect(html).not.toContain('<b>Binta</b>');
    expect(visible(html)).toContain('La vendeuse ne prend pas de commandes pour le moment.');
    expect(html).toContain('data-action="decouvrir"');
    // no product, no price, no « Commander » on a resting shop
    expect(html).not.toContain('data-action="commander"');
    expect(html).not.toContain('data-role="vitrine-produit"');
  });
});

/* ────────────────────────── the cliente refusal ─────────────────────────── */

describe('the cliente — `reseller_paused` on the price ask is named, with no button into the same pause', () => {
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

  it('the table gives the name no primary action, on purpose', () => {
    const vue = refusVue('reseller_paused');
    expect(vue.action).toBeNull();
    expect(vue.titre).toBe('Cette boutique fait une pause.');
  });

  it('C1 → C3 → the price ask refused ⇒ the honest surface names the pause; no button; the back arrow still lands her on C3', async () => {
    const asks: string[] = [];
    const quoteSource = async (quartier: string): Promise<QuoteFetch> => {
      asks.push(quartier);
      return { status: 'refused', reason: 'reseller_paused' };
    };
    const c = fauxConteneur();
    arrets.push(createCliente(c as unknown as HTMLElement, { produit: PRODUIT, quoteSource }));

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
    expect(c.innerHTML).toContain('data-motif="reseller_paused"');
    const lu = visible(c.innerHTML);
    expect(lu).toContain('Cette boutique fait une pause.');
    expect(lu).toContain('La vendeuse ne prend pas de commandes pour le moment.');
    expect(lu).toContain('Rien n’a été payé');
    expect(lu, 'the generic price sentence is the wrong diagnosis here').not.toContain('afficher le prix');
    expect(lu, 'the raw name never reaches her').not.toContain('reseller_paused');
    // NO primary action: every in-app road meets the same pause
    expect(c.innerHTML).not.toContain('cl-cta-step');
    expect(c.innerHTML).not.toContain('data-action="reessayer-prix"');
    expect(c.innerHTML).not.toContain('data-action="prix-a-jour"');
    expect(c.innerHTML).not.toContain('data-action="voir-boutique"');
    // …but she is not trapped: the back arrow stands and works
    presser(c, 'retour-c3');
    await souffler();
    expect(c.innerHTML).toContain('data-screen="C3"');
    expect(asks, 'going back asked no new price by itself').toEqual(['Gounghin']);
  });
});
