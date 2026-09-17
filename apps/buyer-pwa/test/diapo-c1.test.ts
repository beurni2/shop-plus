import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCliente } from '../src/cliente/flow';
import type { ClienteProduit } from '../src/cliente/screens';

/**
 * ═══ DIAPO-C1 — SP2.3 « Lazy slideshow + fallback: queued, cancellable, static
 * fallback », walked on the REAL flow (createCliente — no app code stubbed) ═══
 *
 * What the C1 frame promises when a product has several photographs:
 *   · LAZY / QUEUED — nothing beyond the hero is fetched until the hero has
 *     painted; then ONE photo at a time, in order, each only when its turn
 *     comes, looping back to the hero.
 *   · IN PLACE — a swap touches the frame's ONE <img> (src, index, fade class)
 *     and never rebuilds the screen: the markup around it is byte-identical
 *     before and after a swap (verifier: a rebuild replayed the page's entry
 *     motion, reset the sheet's scroll and broke a playing voice note).
 *   · CANCELLABLE — a tap on the frame ends the show for this visit and opens
 *     the gallery on the photo she is looking at; leaving C1 clears the queue;
 *     a hidden tab and an open protections sheet hold the place.
 *   · STATIC FALLBACK — reduced motion, `saveData`, a photo that fails, a clip,
 *     a single photo: the hero stays and nothing is fetched.
 *
 * ═══ THE DOUBLES, AND THEIR BOUNDS ═══
 *  · the DOM container — records `innerHTML` verbatim, delivers events, and
 *    answers `querySelector('.cl-photo-img')` with ONE image stand-in whose
 *    `complete` / `load` are the paint facts the flow reads and whose `src`,
 *    attributes and class list record what the flow patched. Setting
 *    `innerHTML` hands out a FRESH stand-in, as a rebuilt tree would. It claims
 *    NOTHING about appearance: no layout, no size, no fade — the fade is CSS,
 *    unwalked; `offsetWidth` is a number nobody reads.
 *  · `Image` — the browser's loader, stood in by a class that records every
 *    `src` asked for and answers load (or error, for the srcs listed as
 *    failing) on the next microtask. That is the native boundary and the only
 *    thing faked besides the DOM.
 *  · `matchMedia` / `navigator.connection` / `document.visibilityState` — the
 *    device's own facts, set per walk.
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

/** The frame's <img>, as the flow sees it and as the flow patches it. */
class FauxImg {
  complete = false;
  /** undefined until the flow patches it — then the live src, whatever the markup says. */
  src: string | undefined = undefined;
  attrs: Record<string, string> = {};
  classes = new Set<string>();
  offsetWidth = 0;
  classList = {
    add: (c: string) => this.classes.add(c),
    remove: (c: string) => this.classes.delete(c),
  };
  private charges: Array<() => void> = [];
  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }
  addEventListener(type: string, h: () => void): void {
    if (type === 'load') this.charges.push(h);
  }
  /** The hero PAINTS. */
  charger(): void {
    this.complete = true;
    const hs = this.charges;
    this.charges = [];
    for (const h of hs) h();
  }
}

interface FauxConteneur {
  innerHTML: string;
  classList: { add: () => void; remove: () => void; toggle: () => void };
  style: { setProperty: () => void };
  addEventListener: (type: string, h: (ev: unknown) => void) => void;
  removeEventListener: () => void;
  querySelector: (sel: string) => FauxImg | null;
  dispatch: (type: string, ev: unknown) => void;
  /** The CURRENT frame image (fresh after every innerHTML rebuild). */
  readonly img: FauxImg;
  /** How many times the tree was rebuilt. */
  readonly rendus: number;
}

function fauxConteneur(): FauxConteneur {
  const handlers: Record<string, Array<(ev: unknown) => void>> = {};
  let html = '';
  let img = new FauxImg();
  let rendus = 0;
  return {
    get innerHTML() {
      return html;
    },
    // A rebuilt tree is a FRESH node: the previous stand-in's patches die with it.
    set innerHTML(v: string) {
      html = v;
      rendus += 1;
      img = new FauxImg();
    },
    get img() {
      return img;
    },
    get rendus() {
      return rendus;
    },
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    style: { setProperty: () => {} },
    addEventListener(type, h) {
      (handlers[type] ??= []).push(h);
    },
    removeEventListener: () => {},
    querySelector(sel) {
      return sel === '.cl-photo-img' && html.includes('class="cl-photo-img') ? img : null;
    },
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

async function souffler(fois = 6): Promise<void> {
  for (let i = 0; i < fois; i += 1) await vi.advanceTimersByTimeAsync(0);
}

/** Time passes AND the queue's microtasks settle. */
async function attendre(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await souffler();
}

/* ───────────────────────────── the loader double ────────────────────────── */

const demandes: string[] = [];
const echecs = new Set<string>();
/** Srcs the network is slow on: their load waits until `liberer()` — a fetch genuinely in flight. */
const lentes = new Set<string>();
const retenues: Array<() => void> = [];
function liberer(): void {
  const rs = retenues.splice(0);
  for (const r of rs) r();
}

class FauxImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';
  get src(): string {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
    demandes.push(v);
    const livrer = (): void => {
      if (echecs.has(v)) this.onerror?.();
      else this.onload?.();
    };
    if (lentes.has(v)) retenues.push(livrer);
    else queueMicrotask(livrer);
  }
}

/* ─────────────────────────────── the product ────────────────────────────── */

const P0 = 'https://media.test/pagne-0.jpg';
const P1 = 'https://media.test/pagne-1.jpg';
const P2 = 'https://media.test/pagne-2.jpg';

const PRODUIT: ClienteProduit = {
  shopName: 'Chez Awa',
  prenom: 'Awa',
  slug: 'chez-awa',
  productName: 'Pagne tissé main',
  zone: 'Gounghin',
  priceFcfa: 11_500,
  assetRefs: [P0, P1, P2],
  inStock: true,
};

/** The photo the frame SHOWS: the live node's patch when there is one, else the markup. */
const srcDuCadre = (c: FauxConteneur): string | undefined =>
  c.img.src ?? /<img class="cl-photo-img[^"]*" data-diapo="\d+" src="([^"]+)"/.exec(c.innerHTML)?.[1];
const diapoDe = (c: FauxConteneur): string | undefined =>
  c.img.attrs['data-diapo'] ?? /data-diapo="(\d+)"/.exec(c.innerHTML)?.[1];

/* ─────────────────────────────── the walks ──────────────────────────────── */

describe('DIAPO-C1 — the lazy slideshow on the product frame, walked', () => {
  const vraiHTMLElement = globalThis.HTMLElement as unknown;
  const vraiImage = (globalThis as { Image?: unknown }).Image;
  const vraiMatchMedia = (globalThis as { matchMedia?: unknown }).matchMedia;
  let arrets: Array<() => void> = [];
  let reduit = false;

  beforeEach(() => {
    vi.useFakeTimers();
    demandes.length = 0;
    echecs.clear();
    lentes.clear();
    retenues.length = 0;
    reduit = false;
    (globalThis as Record<string, unknown>)['HTMLElement'] = FauxElement;
    (globalThis as Record<string, unknown>)['Image'] = FauxImage;
    (globalThis as Record<string, unknown>)['matchMedia'] = () => ({ matches: reduit });
  });

  afterEach(() => {
    for (const arreter of arrets) arreter();
    arrets = [];
    (globalThis as Record<string, unknown>)['HTMLElement'] = vraiHTMLElement;
    (globalThis as Record<string, unknown>)['Image'] = vraiImage;
    (globalThis as Record<string, unknown>)['matchMedia'] = vraiMatchMedia;
    vi.useRealTimers();
  });

  function monter(produit: ClienteProduit = PRODUIT): FauxConteneur {
    const c = fauxConteneur();
    arrets.push(createCliente(c as unknown as HTMLElement, { produit }));
    expect(c.innerHTML).toContain('data-screen="C1"');
    return c;
  }

  it('LAZY, QUEUED, IN PLACE: nothing beyond the hero is fetched before it paints; then one photo at a time, in order, looping — and the screen is never rebuilt for a swap', async () => {
    const c = monter();
    expect(diapoDe(c)).toBe('0');
    expect(srcDuCadre(c)).toBe(P0);
    expect(c.innerHTML, 'three photos → the count badge').toContain('3 photos');
    const rendusAvant = c.rendus;
    const markupAvant = c.innerHTML;

    await attendre(12_000);
    expect(demandes, 'the hero has not painted: NOTHING may be fetched').toEqual([]);
    expect(diapoDe(c)).toBe('0');

    c.img.charger(); // the hero paints
    await attendre(3_999);
    expect(demandes, 'before its turn, the next photo is not asked for').toEqual([]);
    await attendre(1);
    expect(demandes, 'ONE photo in flight, the second one').toEqual([P1]);
    expect(diapoDe(c)).toBe('1');
    expect(srcDuCadre(c)).toBe(P1);
    expect(c.img.classes.has('cl-diapo'), 'the fade class is back on the node after the swap').toBe(true);

    await attendre(4_000);
    expect(demandes).toEqual([P1, P2]);
    expect(srcDuCadre(c)).toBe(P2);

    await attendre(4_000);
    expect(demandes, 'back to the hero — fetched through the same one-at-a-time road').toEqual([P1, P2, P0]);
    expect(diapoDe(c)).toBe('0');

    // IN PLACE: three swaps, zero rebuilds — the page around the frame is untouched.
    expect(c.rendus, 'a swap must never rebuild the screen').toBe(rendusAvant);
    expect(c.innerHTML, 'the markup is byte-identical: only the live node moved').toBe(markupAvant);
    expect(c.innerHTML, 'the frame is still the tap target onto the gallery').toContain('data-action="photo-galerie"');
  });

  it('a LATER real render draws the photo the show is on — the index lives in state, not only on the node', async () => {
    const c = monter();
    c.img.charger();
    await attendre(4_000);
    expect(diapoDe(c)).toBe('1');
    // The protections sheet opens (a real render) and closes (another).
    presser(c, 'ouvrir-protections');
    presser(c, 'fermer-protections');
    expect(/data-diapo="1"/.test(c.innerHTML), 'the rebuilt frame shows photo two, not the hero').toBe(true);
    expect(/data-diapo="1" src="([^"]+)"/.exec(c.innerHTML)?.[1]).toBe(P1);
  });

  it('CANCELLABLE: a tap ends the show and opens the gallery ON THE PHOTO SHE IS LOOKING AT; closing it does not restart', async () => {
    const c = monter();
    c.img.charger();
    await attendre(4_000);
    expect(diapoDe(c)).toBe('1');

    presser(c, 'photo-galerie');
    expect(c.innerHTML).toContain('data-role="galerie"');
    expect(c.innerHTML, 'the gallery opens where she was, not on photo one').toContain('2 sur 3');
    expect(c.innerHTML).toContain(P1);

    await attendre(12_000);
    expect(demandes, 'under the gallery the queue is dead').toEqual([P1]);

    presser(c, 'galerie-fermer');
    expect(c.innerHTML).not.toContain('data-role="galerie"');
    expect(diapoDe(c), 'the frame keeps the photo she chose to look at').toBe('1');
    await attendre(12_000);
    expect(demandes, 'cancelled stays cancelled for this visit').toEqual([P1]);
    expect(diapoDe(c)).toBe('1');
  });

  it('CANCELLABLE: leaving C1 clears the queue — nothing is fetched for a screen she has left', async () => {
    const c = monter();
    c.img.charger();
    await attendre(4_000);
    expect(diapoDe(c)).toBe('1');

    presser(c, 'commander');
    expect(c.innerHTML).toContain('data-screen="C3"');
    await attendre(12_000);
    expect(demandes).toEqual([P1]);
    expect(c.innerHTML).toContain('data-screen="C3"');
  });

  it('a photo still in flight when she leaves C1 never blocks the show on her way back — and never paints a screen she left', async () => {
    lentes.add(P1);
    const c = monter();
    c.img.charger();
    await attendre(4_000);
    expect(demandes, 'the second photo is asked for and the network is slow on it').toEqual([P1]);
    expect(diapoDe(c), 'nothing swaps before the photo lands').toBe('0');

    // She goes to the order screen and comes straight back, the fetch still in flight.
    presser(c, 'commander');
    expect(c.innerHTML).toContain('data-screen="C3"');
    presser(c, 'retour-c1');
    expect(c.innerHTML).toContain('data-screen="C1"');
    expect(diapoDe(c)).toBe('0');
    c.img.charger(); // the hero paints again on the rebuilt screen

    // The old fetch lands now: it belongs to a visit that ended — the frame stays.
    liberer();
    await souffler();
    expect(diapoDe(c), 'a fetch from the visit she left never paints the new one').toBe('0');

    // The show of THIS visit is alive: its turn comes, it asks (again — the
    // stale one was dropped), it lands, it swaps.
    lentes.clear();
    await attendre(4_000);
    expect(demandes, 'the in-flight guard of the old visit did not stall the new one').toEqual([P1, P1]);
    expect(diapoDe(c)).toBe('1');
    expect(srcDuCadre(c)).toBe(P1);
  });

  it('HOLDS under her protections sheet — a money moment she is reading — and goes on when it closes', async () => {
    const c = monter();
    c.img.charger();
    presser(c, 'ouvrir-protections');
    expect(c.innerHTML).toContain('data-action="fermer-protections"');
    await attendre(12_000);
    expect(demandes, 'nothing moves under the sheet').toEqual([]);
    presser(c, 'fermer-protections');
    await attendre(4_000);
    expect(demandes).toEqual([P1]);
    expect(diapoDe(c)).toBe('1');
  });

  it('STATIC FALLBACK: reduced motion → the hero stays and nothing is fetched', async () => {
    reduit = true;
    const c = monter();
    c.img.charger();
    await attendre(12_000);
    expect(demandes).toEqual([]);
    expect(diapoDe(c)).toBe('0');
    expect(srcDuCadre(c)).toBe(P0);
  });

  it('STATIC FALLBACK: a slow or metered network (saveData) → the hero stays and nothing is fetched', async () => {
    const nav = (globalThis as { navigator?: object }).navigator;
    const avait = nav !== undefined;
    if (avait) {
      Object.defineProperty(nav, 'connection', { value: { saveData: true }, configurable: true });
    } else {
      (globalThis as Record<string, unknown>)['navigator'] = { connection: { saveData: true } };
    }
    try {
      const c = monter();
      c.img.charger();
      await attendre(12_000);
      expect(demandes).toEqual([]);
      expect(diapoDe(c)).toBe('0');
    } finally {
      if (avait) delete (nav as { connection?: unknown }).connection;
      else delete (globalThis as Record<string, unknown>)['navigator'];
    }
  });

  it('STATIC FALLBACK: a photo that fails to load stops the show on the last good photo — no retry storm, and no re-render wakes it', async () => {
    echecs.add(P2);
    const c = monter();
    c.img.charger();
    await attendre(4_000);
    expect(srcDuCadre(c)).toBe(P1);
    await attendre(4_000);
    expect(demandes, 'the third photo was asked for once').toEqual([P1, P2]);
    expect(srcDuCadre(c), 'the frame never shows a photo that did not arrive').toBe(P1);
    await attendre(12_000);
    expect(demandes, 'and never again').toEqual([P1, P2]);
    // A re-render (the protections sheet opens and closes) must not re-arm a
    // show that ended on a failure — stopping is a decision, not a stall.
    presser(c, 'ouvrir-protections');
    presser(c, 'fermer-protections');
    await attendre(12_000);
    expect(demandes, 'a re-render woke the dead show').toEqual([P1, P2]);
    expect(srcDuCadre(c)).toBe(P1);
  });

  it('STATIC FALLBACK: a clip plays instead — no show, nothing fetched', async () => {
    const c = monter({ ...PRODUIT, videoRef: 'https://media.test/pagne.mp4' });
    expect(c.innerHTML).toContain('data-role="video-hero"');
    await attendre(12_000);
    expect(demandes).toEqual([]);
    presser(c, 'photo-galerie');
    expect(c.innerHTML, 'with a clip the gallery still leads with it').toContain('1 sur 4');
  });

  it('STATIC FALLBACK: a single photo is a photo, not a show', async () => {
    const c = monter({ ...PRODUIT, assetRefs: [P0] });
    c.img.charger();
    await attendre(12_000);
    expect(demandes).toEqual([]);
    expect(srcDuCadre(c)).toBe(P0);
    expect(c.innerHTML).not.toContain('cl-diapo');
  });

  it('a hidden tab holds its place; the show resumes when she looks again', async () => {
    const doc = { visibilityState: 'hidden', addEventListener: () => {}, removeEventListener: () => {} };
    (globalThis as Record<string, unknown>)['document'] = doc;
    try {
      const c = monter();
      c.img.charger();
      await attendre(12_000);
      expect(demandes, 'unseen, nothing advances and nothing is fetched').toEqual([]);
      doc.visibilityState = 'visible';
      await attendre(4_000);
      expect(demandes).toEqual([P1]);
      expect(diapoDe(c)).toBe('1');
    } finally {
      // The flow registered its visibility listener on THIS document (it exists
      // at mount), so the instance is stopped while the document still stands.
      for (const arreter of arrets) arreter();
      arrets = [];
      delete (globalThis as Record<string, unknown>)['document'];
    }
  });
});
