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
 *   · STATIC FALLBACK — reduced motion, `saveData`, a photo that fails, a
 *     single photo: the hero stays and nothing is fetched.
 *   · WITH A CLIP (DIAPO-VIDEO-1, founder 2026-09-17) — the clip is the first
 *     slide and the show WAITS for it to end before the photographs; when the
 *     show is off (cancelled, static) the clip loops on its own as before.
 *
 * ═══ THE DOUBLES, AND THEIR BOUNDS ═══
 *  · the DOM container — records `innerHTML` verbatim, delivers events, and
 *    answers `querySelector('.cl-photo-img')` with ONE frame stand-in — the
 *    photograph's <img>, or the clip's <video> — whose `complete` / `load` (or
 *    `loop` / `ended`) are the paint facts the flow reads and whose `src`,
 *    attributes and class list record what the flow patched. An in-place
 *    swap (the flow sets the element's outerHTML) yields a fresh element in
 *    the same place with the tree around it untouched. Setting
 *    `innerHTML` hands out a FRESH stand-in, as a rebuilt tree would — complete
 *    at birth when its src is already in the browser's cache (a photo that
 *    painted once), as a real re-attached <img> is. It claims NOTHING about
 *    appearance: no layout, no size, no fade — the fade is CSS, unwalked;
 *    `offsetWidth` is a number nobody reads.
 *  · `Image` — the browser's loader, stood in by a class that records every
 *    `src` asked for and answers load (or error, for the srcs listed as
 *    failing) on the next microtask — or, for the srcs listed as slow, only
 *    when the walk releases it. That is the native boundary and the only thing
 *    faked besides the DOM.
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
  /** For vitest's printer when an identity assertion on a node fails. */
  getAttributeNames(): string[] {
    return Object.keys(this.attrs);
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

/**
 * The browser's image cache: a src that has painted once (the hero, or a photo
 * the loader delivered) is `complete` the moment a rebuilt <img> carries it —
 * so a re-render never has to wait for a paint that already happened. Without
 * this the walks were blind after any re-render (two mutations survived).
 */
const cache = new Set<string>();

/** The frame's <img>, as the flow sees it and as the flow patches it. */
class FauxImg {
  complete: boolean;
  /** undefined until the flow patches it — then the live src, whatever the markup says. */
  src: string | undefined = undefined;
  attrs: Record<string, string> = {};
  classes = new Set<string>();
  offsetWidth = 0;
  classList = {
    add: (c: string) => this.classes.add(c),
    remove: (c: string) => this.classes.delete(c),
  };
  /** Set by the container: replacing this node's markup swaps the frame's element. */
  remplacer: (markup: string) => void = () => {};
  private charges: Array<() => void> = [];
  constructor(private readonly srcMarkup: string | undefined) {
    this.complete = srcMarkup !== undefined && cache.has(srcMarkup);
  }
  set outerHTML(markup: string) {
    this.remplacer(markup);
  }
  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }
  /** A photograph carries no `data-role="video-hero"` — that is how the flow tells the two apart. */
  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
  addEventListener(type: string, h: () => void): void {
    if (type === 'load') this.charges.push(h);
  }
  /** The hero PAINTS. */
  charger(): void {
    this.complete = true;
    if (this.srcMarkup !== undefined) cache.add(this.srcMarkup);
    const hs = this.charges;
    this.charges = [];
    for (const h of hs) h();
  }
}

/**
 * The frame's <video> (a product with a clip), as the flow sees it: its `loop`
 * (on, from the markup, until the flow decides otherwise), its `ended`, the
 * `ended` listeners the flow attaches, and every `play()` the flow asks for.
 * The walk ENDS the clip by hand (`finir`) — the clip's length is not walked,
 * only what the flow does when it is over. Nothing about appearance.
 */
class FauxVideo {
  loop: boolean;
  ended = false;
  lectures = 0;
  remplacer: (markup: string) => void = () => {};
  private fins: Array<() => void> = [];
  constructor(readonly srcMarkup: string | undefined, loop: boolean) {
    this.loop = loop;
  }
  set outerHTML(markup: string) {
    this.remplacer(markup);
  }
  /** The clip's markup carries `data-role="video-hero"` (VIDEO-PARTOUT). */
  getAttribute(name: string): string | null {
    return name === 'data-role' ? 'video-hero' : null;
  }
  addEventListener(type: string, h: () => void): void {
    if (type === 'ended') this.fins.push(h);
  }
  play(): Promise<void> {
    this.lectures += 1;
    this.ended = false;
    return Promise.resolve();
  }
  /** The clip reaches its end. */
  finir(): void {
    this.ended = true;
    const hs = this.fins;
    this.fins = [];
    for (const h of hs) h();
  }
}

const SRC_DU_CADRE = /<img class="cl-photo-img[^"]*" data-diapo="\d+" src="([^"]+)"/;
const IMG_DU_CADRE = /<img class="cl-photo-img[^"]*"[^>]*>/;
const VIDEO_DU_CADRE = /<video class="cl-photo-img"[^>]*><\/video>/;
const SRC_DU_CLIP = /<video class="cl-photo-img"[^>]*\bsrc="([^"]+)"/;

interface FauxConteneur {
  innerHTML: string;
  classList: { add: () => void; remove: () => void; toggle: () => void };
  style: { setProperty: () => void };
  addEventListener: (type: string, h: (ev: unknown) => void) => void;
  removeEventListener: () => void;
  querySelector: (sel: string) => FauxImg | FauxVideo | null;
  dispatch: (type: string, ev: unknown) => void;
  /** The CURRENT frame image (fresh after every innerHTML rebuild or in-place swap). */
  readonly img: FauxImg;
  /** The CURRENT frame clip, or null when the frame holds a photograph. */
  readonly video: FauxVideo | null;
  /** How many times the tree was rebuilt. */
  readonly rendus: number;
  /** A control of the CURRENT tree — the same node until the tree is rebuilt, a new one after. */
  noeud: (action: string, attrs?: Record<string, string>) => FauxElement;
}

function fauxConteneur(): FauxConteneur {
  const handlers: Record<string, Array<(ev: unknown) => void>> = {};
  let html = '';
  let cadre: FauxImg | FauxVideo = new FauxImg(undefined);
  let rendus = 0;
  let noeuds = new Map<string, FauxElement>();
  /** The frame's element, read off the markup: a clip's <video>, or the photograph's <img>. */
  const lireCadre = (): FauxImg | FauxVideo => {
    const v = VIDEO_DU_CADRE.exec(html)?.[0];
    const el: FauxImg | FauxVideo =
      v !== undefined ? new FauxVideo(SRC_DU_CLIP.exec(v)?.[1], /\bloop\b/.test(v)) : new FauxImg(SRC_DU_CADRE.exec(html)?.[1]);
    // An in-place swap: the flow sets the element's outerHTML, the browser
    // parses it into a FRESH element in the same place — the tree around it
    // is untouched and `rendus` does not move.
    el.remplacer = (markup) => {
      const cible = cadre instanceof FauxVideo ? VIDEO_DU_CADRE : IMG_DU_CADRE;
      expect(cible.test(html), 'the element being replaced must be in the markup').toBe(true);
      html = html.replace(cible, markup);
      cadre = lireCadre();
    };
    return el;
  };
  return {
    get innerHTML() {
      return html;
    },
    // A rebuilt tree is a FRESH node: the previous stand-in's patches die with
    // it — complete at birth only if its src is already in the cache — and so
    // does every control's identity.
    set innerHTML(v: string) {
      html = v;
      rendus += 1;
      cadre = lireCadre();
      noeuds = new Map();
    },
    get img() {
      expect(cadre instanceof FauxImg, 'the frame holds a photograph').toBe(true);
      return cadre as FauxImg;
    },
    get video() {
      return cadre instanceof FauxVideo ? cadre : null;
    },
    get rendus() {
      return rendus;
    },
    noeud(action, attrs = {}) {
      expect(html, `l'action « ${action} » doit être à l'écran`).toContain(`data-action="${action}"`);
      let el = noeuds.get(action);
      if (el === undefined) {
        el = new FauxElement({ 'data-action': action, ...attrs });
        noeuds.set(action, el);
      }
      return el;
    },
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    style: { setProperty: () => {} },
    addEventListener(type, h) {
      (handlers[type] ??= []).push(h);
    },
    removeEventListener: () => {},
    querySelector(sel) {
      if (!html.includes('class="cl-photo-img')) return null;
      if (sel === '.cl-photo-img') return cadre;
      if (sel === 'video.cl-photo-img') return cadre instanceof FauxVideo ? cadre : null;
      return null;
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
      if (echecs.has(v)) {
        this.onerror?.();
        return;
      }
      cache.add(v);
      this.onload?.();
    };
    if (lentes.has(v)) retenues.push(livrer);
    else queueMicrotask(livrer);
  }
}

/* ─────────────────────────────── the audio double ───────────────────────── */

/** The browser's audio element, stood in: records plays, answers pause. */
let audio: FauxAudio | null = null;
let lectures = 0;
class FauxAudio {
  src = '';
  currentTime = 0;
  paused = true;
  private h: Record<string, Array<() => void>> = {};
  constructor() {
    audio = this;
  }
  addEventListener(type: string, f: () => void): void {
    (this.h[type] ??= []).push(f);
  }
  play(): Promise<void> {
    this.paused = false;
    lectures += 1;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
    for (const f of this.h['pause'] ?? []) f();
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

const CLIP = 'https://media.test/pagne-clip.mp4';
/** A product with a clip and two photographs: the gallery's order is clip · P0 · P1 (« n sur 3 »). */
const PRODUIT_CLIP: ClienteProduit = { ...PRODUIT, assetRefs: [P0, P1], videoRef: CLIP };

/** The photo the frame SHOWS: the live node's patch when there is one, else the markup. */
const srcDuCadre = (c: FauxConteneur): string | undefined =>
  c.video !== null ? undefined : (c.img.src ?? SRC_DU_CADRE.exec(c.innerHTML)?.[1]);
const diapoDe = (c: FauxConteneur): string | undefined =>
  c.video !== null ? undefined : (c.img.attrs['data-diapo'] ?? /data-diapo="(\d+)"/.exec(c.innerHTML)?.[1]);

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
    cache.clear();
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

  it('ONE photo in flight: a real render mid-fetch (the sheet opens and closes) never arms a second fetch', async () => {
    lentes.add(P1);
    const c = monter();
    c.img.charger();
    await attendre(4_000);
    expect(demandes).toEqual([P1]);

    presser(c, 'ouvrir-protections');
    presser(c, 'fermer-protections');
    c.img.charger();
    await attendre(12_000);
    expect(demandes, 'while a photo is still loading, nothing else may be asked for').toEqual([P1]);

    lentes.clear();
    liberer();
    await souffler();
    expect(diapoDe(c), 'the photo lands on the visit it belongs to').toBe('1');
    await attendre(4_000);
    expect(demandes, 'then the show goes on, one at a time').toEqual([P1, P2]);
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

  /* ═══ DIAPO-VIDEO-1 (founder 2026-09-17: « make sure the slideshow will need
   * to wait for a video to finish before moving to the next ») — the clip is
   * the show's FIRST slide, and the show waits for it to END. ═══ */

  it('WITH A CLIP: the show WAITS for the clip to end — nothing advances and nothing is fetched while it plays; then the photographs, in turn; then the clip again, waited for again', async () => {
    const c = monter(PRODUIT_CLIP);
    expect(c.innerHTML).toContain('data-role="video-hero"');
    const rendusAvant = c.rendus;
    const clip = c.video;
    expect(clip).not.toBeNull();
    expect(clip?.loop, 'the show decides what follows the clip — the loop is off').toBe(false);

    await attendre(12_000);
    expect(demandes, 'while the clip plays, nothing is fetched').toEqual([]);
    expect(c.video, 'and the frame still holds the clip').toBe(clip);

    clip?.finir();
    await souffler();
    expect(demandes, 'the clip is over: the first photograph (its poster, from the cache) is asked for').toEqual([P0]);
    expect(c.video, 'the frame now holds the photograph').toBeNull();
    expect(diapoDe(c)).toBe('1');
    expect(srcDuCadre(c)).toBe(P0);
    expect(c.rendus, 'the swap never rebuilds the screen').toBe(rendusAvant);

    await attendre(4_000);
    expect(demandes).toEqual([P0, P1]);
    expect(diapoDe(c)).toBe('2');
    expect(srcDuCadre(c)).toBe(P1);

    await attendre(4_000);
    expect(c.video, 'back to the clip: a fresh element in the frame, not fetched through the photo loader').not.toBeNull();
    expect(c.video).not.toBe(clip);
    expect(c.video?.loop, 'waited for again: the loop is off on the new element too').toBe(false);
    expect(demandes).toEqual([P0, P1]);
    expect(c.rendus).toBe(rendusAvant);
    await attendre(12_000);
    expect(demandes, 'the second clip is waited for, however long it is').toEqual([P0, P1]);
    c.video?.finir();
    await souffler();
    expect(demandes).toEqual([P0, P1, P0]);
    expect(diapoDe(c)).toBe('1');
  });

  it('WITH A CLIP, CANCELLABLE: a tap while the clip plays opens the gallery on the clip (« 1 sur 3 ») and the show is over; closing it brings the clip back, looping as before this slice', async () => {
    const c = monter(PRODUIT_CLIP);
    await attendre(1_000);
    presser(c, 'photo-galerie');
    expect(c.innerHTML).toContain('data-role="galerie"');
    expect(c.innerHTML, 'the clip leads the gallery').toContain('1 sur 3');
    await attendre(12_000);
    expect(demandes).toEqual([]);

    presser(c, 'galerie-fermer');
    expect(c.innerHTML).not.toContain('data-role="galerie"');
    expect(c.video, 'the frame shows the clip again').not.toBeNull();
    expect(c.video?.loop, 'cancelled: the clip loops on its own, as before this slice').toBe(true);
    c.video?.finir();
    await attendre(12_000);
    expect(demandes, 'and the show never advances past it').toEqual([]);
    expect(c.video).not.toBeNull();
  });

  it('WITH A CLIP, CANCELLABLE: a tap on a photograph after the clip opens the gallery THERE (« 3 sur 3 »)', async () => {
    const c = monter(PRODUIT_CLIP);
    c.video?.finir();
    await souffler();
    await attendre(4_000);
    expect(diapoDe(c)).toBe('2');
    presser(c, 'photo-galerie');
    expect(c.innerHTML).toContain('3 sur 3');
    expect(c.innerHTML).toContain(P1);
  });

  it('WITH A CLIP, STATIC FALLBACK: reduced motion → the clip loops as before, and its end moves nothing', async () => {
    reduit = true;
    const c = monter(PRODUIT_CLIP);
    expect(c.video?.loop, 'no show: the loop is left alone').toBe(true);
    c.video?.finir();
    await attendre(12_000);
    expect(demandes).toEqual([]);
    expect(c.video).not.toBeNull();
  });

  it('WITH A CLIP, STATIC FALLBACK: the photograph after the clip fails → the show stops and the clip loops again, restarted', async () => {
    echecs.add(P0);
    const c = monter(PRODUIT_CLIP);
    const clip = c.video;
    expect(clip?.loop).toBe(false);
    clip?.finir();
    await souffler();
    expect(demandes, 'asked once').toEqual([P0]);
    expect(c.video, 'the frame keeps the clip').toBe(clip);
    expect(clip?.loop, 'the fallback is the clip as before this slice: looping').toBe(true);
    expect(clip?.lectures, 'it had ended, so it is started again').toBe(1);
    await attendre(12_000);
    expect(demandes, 'no retry storm').toEqual([P0]);
    // A re-render must not wake it.
    presser(c, 'ouvrir-protections');
    presser(c, 'fermer-protections');
    c.video?.finir();
    await attendre(12_000);
    expect(demandes).toEqual([P0]);
    expect(c.video).not.toBeNull();
  });

  it('WITH A CLIP: a real render mid-clip (the sheet opens and closes) gives the frame a new clip element — the show follows it, and the old one ending changes nothing', async () => {
    const c = monter(PRODUIT_CLIP);
    const premier = c.video;
    expect(premier?.loop).toBe(false);
    presser(c, 'ouvrir-protections');
    presser(c, 'fermer-protections');
    const second = c.video;
    expect(second).not.toBeNull();
    expect(second).not.toBe(premier);
    expect(second?.loop, 'the show follows the new element').toBe(false);

    premier?.finir();
    await souffler();
    expect(demandes, 'a dead element ending moves nothing').toEqual([]);
    expect(c.video).toBe(second);

    second?.finir();
    await souffler();
    expect(demandes, 'the live one ending moves the show, once').toEqual([P0]);
    expect(diapoDe(c)).toBe('1');
    await attendre(4_000);
    expect(demandes, 'and only once').toEqual([P0, P1]);
  });

  it('WITH A CLIP: the clip ends under her protections sheet — the show holds; closing the sheet restarts the clip, and THAT clip is waited for before anything moves', async () => {
    const c = monter(PRODUIT_CLIP);
    presser(c, 'ouvrir-protections');
    const sousLaFeuille = c.video;
    expect(sousLaFeuille?.loop, 'the show follows the element the sheet render made').toBe(false);
    sousLaFeuille?.finir();
    await souffler();
    await attendre(12_000);
    expect(demandes, 'nothing moves under the sheet').toEqual([]);

    presser(c, 'fermer-protections');
    const relance = c.video;
    expect(relance, 'the sheet render restarted the clip: a fresh element').not.toBe(sousLaFeuille);
    expect(relance?.loop, 'and it is waited for at once, not after a pending turn').toBe(false);
    await attendre(12_000);
    expect(demandes, 'the fresh clip plays to its end before anything moves').toEqual([]);
    expect(c.video).toBe(relance);

    relance?.finir();
    await souffler();
    expect(demandes).toEqual([P0]);
    expect(diapoDe(c)).toBe('1');
  });

  it('WITH A CLIP: a hidden tab holds the place when the clip ends; the show goes on when she looks again', async () => {
    const doc = { visibilityState: 'hidden', addEventListener: () => {}, removeEventListener: () => {} };
    (globalThis as Record<string, unknown>)['document'] = doc;
    try {
      const c = monter(PRODUIT_CLIP);
      c.video?.finir();
      await souffler();
      await attendre(12_000);
      expect(demandes, 'unseen, nothing advances').toEqual([]);
      expect(c.video).not.toBeNull();
      doc.visibilityState = 'visible';
      await attendre(4_000);
      expect(demandes).toEqual([P0]);
      expect(diapoDe(c)).toBe('1');
    } finally {
      for (const arreter of arrets) arreter();
      arrets = [];
      delete (globalThis as Record<string, unknown>)['document'];
    }
  });

  it('STATIC FALLBACK: a single photo is a photo, not a show', async () => {
    const c = monter({ ...PRODUIT, assetRefs: [P0] });
    c.img.charger();
    await attendre(12_000);
    expect(demandes).toEqual([]);
    expect(srcDuCadre(c)).toBe(P0);
    expect(c.innerHTML).not.toContain('cl-diapo');
  });

  it('a playing voice note keeps its face through a swap: the control under her thumb is the same node, and tapping it PAUSES instead of restarting', async () => {
    const NOTE = 'https://media.test/pagne-note.m4a';
    const doc = { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {}, querySelector: () => null };
    const vraiAudio = (globalThis as { Audio?: unknown }).Audio;
    (globalThis as Record<string, unknown>)['document'] = doc;
    (globalThis as Record<string, unknown>)['Audio'] = FauxAudio;
    // Read through a call: the flow creates the element, not this walk.
    const lecteur = (): FauxAudio | null => audio;
    lectures = 0;
    try {
      const c = monter({ ...PRODUIT, voiceDuree: '0:12', voiceUrl: NOTE });
      c.img.charger();
      const bouton = c.noeud('voix-lire', { 'data-voix-url': NOTE });
      c.dispatch('click', { target: bouton });
      await souffler();
      expect(lectures, 'her tap plays the note').toBe(1);
      expect(lecteur()?.paused).toBe(false);

      await attendre(4_000); // a swap, mid-note
      expect(diapoDe(c)).toBe('1');
      const encore = c.noeud('voix-lire', { 'data-voix-url': NOTE });
      expect(encore, 'nothing rebuilt the control under her thumb').toBe(bouton);

      c.dispatch('click', { target: encore });
      expect(lecteur()?.paused, 'the second tap pauses the note — it does not restart it from zero on a stranger node').toBe(true);
      expect(lectures).toBe(1);
    } finally {
      for (const arreter of arrets) arreter();
      arrets = [];
      delete (globalThis as Record<string, unknown>)['document'];
      (globalThis as Record<string, unknown>)['Audio'] = vraiAudio;
    }
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
