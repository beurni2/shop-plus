/**
 * RENDU-RÉEL DOUBLES (audit F1) — the NATIVE boundaries only, never app code.
 *
 * reseller-kit's `main.ts` builds a LIVE DOM (createElement/addEventListener) and
 * paints a real <canvas> (getContext/toBlob) — browser APIs node has not. There is
 * no jsdom/happy-dom in this monorepo and adding one is a dependency decision, so
 * this file hand-rolls JUST the DOM + canvas surface `main.ts` actually touches, so
 * the walk drives the REAL `main.ts`, `composeCard`, and `paint` end to end.
 *
 * BOUNDS — what these doubles may and may not do:
 *  · They stand in for `document`, element nodes, the 2D canvas context, `toBlob`,
 *    the anchor download, `URL.createObjectURL`, and `navigator.onLine`. Nothing else.
 *  · The 2D context is a NO-OP recorder: `paint` runs against it for real, but the
 *    double asserts NOTHING about pixels, layout, colour, spacing or size — those
 *    stay with the token/anatomy checks and the founder's eyes (screen-walk law).
 *  · Failure is injected ONLY at the native seam: `contextFor` may return null (a
 *    canvas that cannot draw) and `toBlob` may yield null (encode failed) — the two
 *    real 1GB-Android outcomes F1 is about. No app function is stubbed.
 */

export interface DomOptions {
  /** Return null to simulate a canvas that yields no 2D context. `role` tells the
   *  preview canvas (role="img") from the output canvas (no role). Default: draws. */
  readonly contextFor?: (roleAttr: string | null) => object | null;
  /** The blob `toBlob` hands back; null simulates a failed JPEG encode. Default: a real Blob. */
  readonly toBlob?: () => Blob | null;
  /** navigator.onLine. Default true. */
  readonly online?: boolean;
}

export interface DownloadRecord {
  href: string;
  download: string;
  clicked: boolean;
}

class Node {
  readonly tag: string;
  className = '';
  type = '';
  private _text = '';
  readonly attrs = new Map<string, string>();
  readonly children: Node[] = [];
  readonly listeners = new Map<string, Array<() => void>>();
  readonly style = { setProperty: (_k: string, _v: string): void => undefined };
  // anchor-only: main.ts sets href/download then calls .click()
  href = '';
  download = '';
  clicked = false;
  // canvas-only
  width = 0;
  height = 0;

  constructor(
    tag: string,
    private readonly opts: DomOptions,
    private readonly downloads: DownloadRecord[],
  ) {
    this.tag = tag;
  }

  set textContent(v: string) {
    this._text = v;
  }
  get textContent(): string {
    return this._text;
  }

  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }

  addEventListener(type: string, fn: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  appendChild(child: Node): Node {
    this.children.push(child);
    return child;
  }
  append(...kids: Node[]): void {
    this.children.push(...kids);
  }
  replaceChildren(...kids: Node[]): void {
    this.children.length = 0;
    this.children.push(...kids);
  }

  // canvas.getContext — the native seam F1b fails at.
  getContext(_kind: '2d'): object | null {
    const decide = this.opts.contextFor ?? (() => makeCtx());
    return decide(this.getAttribute('role'));
  }

  // canvas.toBlob — the native seam F1a fails at.
  toBlob(cb: (b: Blob | null) => void, _type?: string, _q?: number): void {
    const make = this.opts.toBlob ?? (() => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }));
    cb(make());
  }

  // anchor.click() — the "reached the next step" record.
  click(): void {
    this.clicked = true;
    if (this.tag === 'a') this.downloads.push({ href: this.href, download: this.download, clicked: true });
  }

  /** Fire the click listeners a user's tap would (distinct from anchor.click()). */
  dispatchClick(): void {
    for (const fn of this.listeners.get('click') ?? []) fn();
  }

  /** Depth-first search of this subtree. */
  find(pred: (n: Node) => boolean): Node | undefined {
    if (pred(this)) return this;
    for (const c of this.children) {
      const hit = c.find(pred);
      if (hit) return hit;
    }
    return undefined;
  }
}

/** A no-op 2D context: `paint` strokes onto it for real; it records nothing. */
export function makeCtx(): object {
  return new Proxy(
    {},
    {
      get: () => () => undefined,
      set: () => true,
    },
  );
}

export interface InstalledDom {
  readonly appNode: Node;
  readonly downloads: DownloadRecord[];
  /** Find a node in the mounted tree (searches from documentElement). */
  find(pred: (n: Node) => boolean): Node | undefined;
  restore(): void;
}

/** Install a minimal `document`/`navigator`/`URL` on globalThis for one mount. */
export function installDom(opts: DomOptions = {}): InstalledDom {
  const downloads: DownloadRecord[] = [];
  const make = (tag: string): Node => new Node(tag, opts, downloads);
  const documentElement = make('html');
  const head = make('head');
  const body = make('body');
  const appNode = make('div');
  appNode.setAttribute('id', 'app');

  const documentDouble = {
    documentElement,
    head,
    body,
    createElement: (tag: string): Node => make(tag),
    getElementById: (id: string): Node | null => (id === 'app' ? appNode : null),
  };

  const g = globalThis as Record<string, unknown>;
  const saved = {
    document: g['document'],
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    createObjectURL: (URL as unknown as { createObjectURL?: unknown }).createObjectURL,
    revokeObjectURL: (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL,
  };

  g['document'] = documentDouble;
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: opts.online ?? true },
    configurable: true,
    writable: true,
  });
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => 'blob:kit';
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => undefined;

  return {
    appNode,
    downloads,
    find: (pred) => documentElement.find(pred) ?? appNode.find(pred),
    restore(): void {
      g['document'] = saved.document;
      if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator);
      (URL as unknown as { createObjectURL?: unknown }).createObjectURL = saved.createObjectURL;
      (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL = saved.revokeObjectURL;
    },
  };
}
