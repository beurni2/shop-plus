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
 *   · CANCELLABLE — a tap on the frame ends the show for this visit and opens
 *     the gallery on the photo she is looking at; leaving C1 clears the queue;
 *     a hidden tab holds its place.
 *   · STATIC FALLBACK — reduced motion, `saveData`, a photo that fails, a clip,
 *     a single photo: the hero stays and nothing is fetched.
 *
 * ═══ THE DOUBLES, AND THEIR BOUNDS ═══
 *  · the DOM container — records `innerHTML` verbatim, delivers events, and
 *    answers `querySelector('.cl-photo-img')` with ONE image stand-in whose
 *    `complete` / `load` are the paint facts the flow reads. It claims NOTHING
 *    about appearance: no layout, no size, no fade — the fade is CSS, unwalked.
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

/** The frame's <img>, as the flow sees it: has it painted, and who wants to know. */
class FauxImg {
  complete = false;
  private charges: Array<() => void> = [];
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
  img: FauxImg;
}

function fauxConteneur(): FauxConteneur {
  const handlers: Record<string, Array<(ev: unknown) => void>> = {};
  const img = new FauxImg();
  return {
    innerHTML: '',
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    style: { setProperty: () => {} },
    addEventListener(type, h) {
      (handlers[type] ??= []).push(h);
    },
    removeEventListener: () => {},
    // ONE image on the frame; the flow reads `complete` and listens for `load`.
    // Only answered while the frame is on screen — like a real query would.
    querySelector(sel) {
      return sel === '.cl-photo-img' && this.innerHTML.includes('class="cl-photo-img') ? img : null;
    },
    dispatch(type, ev) {
      for (const h of handlers[type] ?? []) h(ev);
    },
    img,
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
    queueMicrotask(() => {
      if (echecs.has(v)) this.onerror?.();
      else this.onload?.();
    });
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

const diapoDe = (c: FauxConteneur): string | undefined => /data-diapo="(\d+)"/.exec(c.innerHTML)?.[1];
const srcDuCadre = (c: FauxConteneur): string | undefined =>
  /<img class="cl-photo-img[^"]*" data-diapo="\d+" src="([^"]+)"/.exec(c.innerHTML)?.[1];

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

  it('LAZY, QUEUED: nothing beyond the hero is fetched before it paints; then one photo at a time, in order, looping', async () => {
    const c = monter();
    expect(diapoDe(c)).toBe('0');
    expect(srcDuCadre(c)).toBe(P0);
    expect(c.innerHTML, 'three photos → the count badge').toContain('3 photos');

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

    await attendre(4_000);
    expect(demandes).toEqual([P1, P2]);
    expect(srcDuCadre(c)).toBe(P2);

    await attendre(4_000);
    expect(demandes, 'back to the hero — fetched through the same one-at-a-time road').toEqual([P1, P2, P0]);
    expect(diapoDe(c)).toBe('0');
    expect(c.innerHTML, 'the frame is still the tap target onto the gallery').toContain('data-action="photo-galerie"');
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

  it('CANCELLABLE: leaving C1 clears the queue; coming back, the frame is whole', async () => {
    const c = monter();
    c.img.charger();
    await attendre(4_000);
    expect(diapoDe(c)).toBe('1');

    presser(c, 'commander');
    expect(c.innerHTML).toContain('data-screen="C3"');
    await attendre(12_000);
    expect(demandes, 'no photo is fetched for a screen she has left').toEqual([P1]);
    expect(c.innerHTML).toContain('data-screen="C3"');
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

  it('STATIC FALLBACK: a photo that fails to load stops the show on the last good photo — no retry storm', async () => {
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
