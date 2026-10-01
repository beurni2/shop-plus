import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpStorefrontPort, LECTURE_VITRINE_TIMEOUT_MS, VitrineOffline } from '../src/vitrine/profile';
import { httpListePort, LECTURE_LISTE_TIMEOUT_MS } from '../src/vitrine/liste';
import { routeDepuisLien, slugDepuisCode } from '../src/racine-view';
import { lectureRetenue } from '../src/vitrine/video-scroll';

/**
 * VITRINE-VRAIE-1 (AUDIT-3, founder 2026-10-01) — the boundary rules the
 * buyer's boutique now reads by, driven at the port with a scripted fetch.
 * The walks (`e2e/vitrine-vraie.spec.ts`) drive the same rules through the
 * real screens; the Worker's paging and count are pinned on workerd
 * (`services/storefront-service/test/vitrine-vraie.e2e.test.ts`).
 */

const produit = (i: number) => ({ pid: `p${i}`, name: `Article ${i}`, priceFcfa: 10_000 + i, inStock: true, assetRefs: [] });
const boutique = (n: number) => ({
  id: 'sf-vv', slug: 'aicha-4821', resellerId: 'rs-vv', name: 'Chez Aïcha', zone: 'Gounghin, Ouagadougou',
  curatedItems: Array.from({ length: n }, (_, k) => `p${k + 1}`),
});

type Reponse = { status: number; body: unknown } | 'jeter' | 'pendre';
const urls: string[] = [];
function scripter(repondre: (url: URL) => Reponse): void {
  urls.length = 0;
  globalThis.fetch = (async (input: string, init?: { signal?: AbortSignal }) => {
    const url = new URL(input);
    urls.push(url.pathname + url.search);
    const r = repondre(url);
    if (r === 'jeter') throw new TypeError('Failed to fetch');
    if (r === 'pendre') {
      return new Promise((_, rejeter) => init?.signal?.addEventListener('abort', () => rejeter(new DOMException('aborted', 'AbortError'))));
    }
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as unknown as Response;
  }) as typeof fetch;
}
const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the boutique read — every article reaches the buyer (B-01)', () => {
  it('pages the whole shop from the first answer’s `suite`, and merges the pages in order', async () => {
    scripter((url) => {
      const d = Number(url.searchParams.get('depuis') ?? '0');
      const fin = Math.min(d + 14, 30);
      return { status: 200, body: { ...boutique(30), products: Array.from({ length: fin - d }, (_, k) => produit(d + k + 1)), ...(fin < 30 ? { suite: fin } : {}) } };
    });
    const r = await httpStorefrontPort('https://svc.example').resolve('aicha-4821');
    expect(urls.sort()).toEqual(['/s/aicha-4821', '/s/aicha-4821?depuis=14', '/s/aicha-4821?depuis=28'].sort());
    expect(r!.products!.map((p) => p.pid)).toEqual(Array.from({ length: 30 }, (_, k) => `p${k + 1}`));
    expect(r!.incomplet).toBeUndefined();
  });

  it('a later page that does not land costs only its articles — said as `incomplet`, never the shop', async () => {
    scripter((url) => (url.searchParams.get('depuis') === '14'
      ? { status: 503, body: null }
      : { status: 200, body: { ...boutique(20), products: Array.from({ length: 14 }, (_, k) => produit(k + 1)), suite: 14 } }));
    const r = await httpStorefrontPort('https://svc.example').resolve('aicha-4821');
    expect(r!.products).toHaveLength(14);
    expect(r!.incomplet).toBe(true);
  });

  it('a product link asks for ITS article(s) — `?pid=`, shape-checked, at most ten — and pages nothing', async () => {
    scripter(() => ({ status: 200, body: { ...boutique(20), products: [produit(16)] } }));
    const r = await httpStorefrontPort('https://svc.example').resolve('aicha-4821', { pids: ['p16', 'p16', 'bad pid', ...Array.from({ length: 12 }, (_, k) => `q${k}`)] });
    expect(urls).toHaveLength(1);
    const asked = new URL(`https://x${urls[0]}`).searchParams.get('pid')!.split(',');
    expect(asked[0]).toBe('p16');
    expect(asked).not.toContain('bad pid');
    expect(asked).toHaveLength(10);
    expect(r!.products!.map((p) => p.pid)).toEqual(['p16']);
  });

  it('a wire without `products` is a shop with nothing described — never the demo seed path (B-02)', async () => {
    scripter(() => ({ status: 200, body: boutique(3) }));
    const r = await httpStorefrontPort('https://svc.example').resolve('aicha-4821');
    expect(r!.products).toEqual([]);
  });
});

describe('the boutique read — the service not answering is never « no boutique » (B-06, B-09)', () => {
  it.each([
    [429, 'service'],
    [503, 'service'],
  ])('%i ⇒ the offline card (%s), never the not-found', async (status, raison) => {
    scripter(() => ({ status, body: null }));
    const err = await httpStorefrontPort('https://svc.example').resolve('aicha-4821').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VitrineOffline);
    expect((err as VitrineOffline).raison).toBe(raison);
  });

  it('404 stays the honest not-found', async () => {
    scripter(() => ({ status: 404, body: null }));
    expect(await httpStorefrontPort('https://svc.example').resolve('aicha-4821')).toBeUndefined();
  });

  it(`a read that hangs is abandoned after ${LECTURE_VITRINE_TIMEOUT_MS} ms as « pas de réseau »`, async () => {
    vi.useFakeTimers();
    scripter(() => 'pendre');
    const lecture = httpStorefrontPort('https://svc.example').resolve('aicha-4821').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(LECTURE_VITRINE_TIMEOUT_MS - 1);
    let fini = false;
    void lecture.then(() => { fini = true; });
    await Promise.resolve();
    expect(fini).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await lecture;
    expect(err).toBeInstanceOf(VitrineOffline);
    expect((err as VitrineOffline).raison).toBe('reseau');
  });
});

describe('the liste read — « n’existe pas » only when it does not (B-15, B-06)', () => {
  const T = 'A'.repeat(32);
  it.each([503, 429])('%i ⇒ hors-ligne (« Réessayer »)', async (status) => {
    scripter(() => ({ status, body: null }));
    expect(await httpListePort('https://svc.example').lire(T)).toEqual({ status: 'hors-ligne' });
  });
  it('a 200 that is not JSON (a proxy page) ⇒ hors-ligne', async () => {
    scripter(() => ({ status: 200, body: null }));
    expect(await httpListePort('https://svc.example').lire(T)).toEqual({ status: 'hors-ligne' });
  });
  it('404 ⇒ introuvable', async () => {
    scripter(() => ({ status: 404, body: null }));
    expect(await httpListePort('https://svc.example').lire(T)).toEqual({ status: 'introuvable' });
  });
  it(`a liste read that hangs is abandoned after ${LECTURE_LISTE_TIMEOUT_MS} ms`, async () => {
    vi.useFakeTimers();
    scripter(() => 'pendre');
    const lecture = httpListePort('https://svc.example').lire(T);
    await vi.advanceTimersByTimeAsync(LECTURE_LISTE_TIMEOUT_MS);
    expect(await lecture).toEqual({ status: 'hors-ligne' });
  });
  it('her gifts read: a 5xx is hors-ligne, never « introuvable »', async () => {
    scripter(() => ({ status: 502, body: null }));
    expect(await httpListePort('https://svc.example').cadeaux(T, 'B'.repeat(32))).toEqual({ status: 'hors-ligne' });
  });
});

describe('her code, typed the way people type it (B-07, §4.1 saisie tolérante)', () => {
  it.each([
    ['aicha 4821', 'aicha-4821'],
    ['aicha4821', 'aicha-4821'],
    ['AICHA-4821', 'aicha-4821'],
    ['  Aicha - 4821 ', 'aicha-4821'],
    ['a i c h a 4 8 2 1', 'aicha-4821'],
  ])('« %s » ⇒ /v/%s', (tape, slug) => {
    expect(slugDepuisCode(tape)).toBe(slug);
    expect(routeDepuisLien(tape)).toEqual({ kind: 'vitrine', slug });
  });
  it.each(['a4821', 'aicha482', 'aicha48210', '4821aicha', 'aïcha 4821', 'abcdefghijklm-4821'])('« %s » is not a code', (tape) => {
    expect(slugDepuisCode(tape)).toBeUndefined();
  });
  it('a pasted link still reads as a link', () => {
    expect(routeDepuisLien('https://beurni2.github.io/shop-plus/s/aicha-4821?pid=p3')).toEqual({ kind: 'offre', slug: 'aicha-4821', pid: 'p3' });
  });
});

describe('a clip never costs data when she asked for less (B-14)', () => {
  const avec = (reduit: boolean, conn?: { saveData?: boolean; effectiveType?: string }) => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduit && q.includes('reduce') }));
    vi.stubGlobal('navigator', conn === undefined ? {} : { connection: conn });
  };
  it.each([
    ['reduced motion', true, undefined],
    ['data saver', false, { saveData: true }],
    ['2g', false, { effectiveType: '2g' }],
    ['slow-2g', false, { effectiveType: 'slow-2g' }],
  ])('%s ⇒ held', (_n, reduit, conn) => {
    avec(reduit as boolean, conn as { saveData?: boolean; effectiveType?: string } | undefined);
    expect(lectureRetenue()).toBe(true);
  });
  it('4g, motion allowed ⇒ plays', () => {
    avec(false, { effectiveType: '4g' });
    expect(lectureRetenue()).toBe(false);
  });
});
