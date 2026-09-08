import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELAI_ENVOI_MS, DELAI_LECTURE_MS, fetchBorne } from '../src/vitrine/fetch-borne';
import { HttpStorefrontService } from '../src/vitrine/service';
import { HttpOfferSource } from '../src/vitrine/offers';

/**
 * PORTS-DELAI-1 (AUDIT-SHOP-2 F-15) — every wire call this app makes ENDS.
 * The helper is proven alone, then THROUGH the two ports it now guards: a
 * `fetch` that never answers becomes `offline` / `unavailable` after the
 * ceiling, and a `fetch` that answers leaves no timer behind.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A fetch that never resolves — and REJECTS when its signal aborts, as the
 *  real one does. Without honouring the signal a fake would prove nothing. */
function fetchQuiPend(): ReturnType<typeof vi.fn> {
  return vi.fn((_input: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }),
  );
}

describe('fetchBorne — the ceiling', () => {
  it('a hanging fetch is aborted at the ceiling (not one tick before), and the abort is what the caller sees', async () => {
    vi.useFakeTimers();
    const spy = fetchQuiPend();
    vi.stubGlobal('fetch', spy);
    const p = fetchBorne('http://shop.test/x', { method: 'GET' }, DELAI_LECTURE_MS);
    let issue: unknown = 'pending';
    void p.then(() => { issue = 'resolved'; }, (e: unknown) => { issue = e; });
    await vi.advanceTimersByTimeAsync(DELAI_LECTURE_MS - 1);
    expect(issue).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(issue).toBeInstanceOf(DOMException);
    // …and the signal it was handed is the one that fired
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.signal?.aborted).toBe(true);
  });

  it('a fetch that answers clears its timer — nothing left to fire later', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const res = await fetchBorne('http://shop.test/x', { method: 'GET' }, DELAI_LECTURE_MS);
    expect(res.status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the two ceilings are what the file says: 15 s for a read or a JSON write, 60 s for an upload', () => {
    expect(DELAI_LECTURE_MS).toBe(15_000);
    expect(DELAI_ENVOI_MS).toBe(60_000);
  });
});

describe('PORTS-DELAI-1 — through the ports: a stalled wire is « offline », never a call that waits for ever', () => {
  it('HttpStorefrontService: list, getById, publishListing and removeItem each end after the read ceiling as offline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchQuiPend());
    const svc = new HttpStorefrontService('http://shop.test', async () => 'SPS-AAAA');
    const pendants = [
      svc.list(),
      svc.getById('SF'),
      svc.publishListing({ storefrontId: 'SF', resellerId: 'RS', productVersionId: 'pv', markup: 0, correlationId: 'c', at: 't' }),
      svc.removeItem('SF', 'pv', 't'),
    ];
    await vi.advanceTimersByTimeAsync(DELAI_LECTURE_MS + 1);
    for (const r of await Promise.all(pendants)) expect(r).toEqual({ ok: false, reason: 'offline' });
  });

  it('an upload waits the LONG ceiling — alive at 15 s, offline at 60 s', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchQuiPend());
    const svc = new HttpStorefrontService('http://shop.test', async () => 'SPS-AAAA');
    let issue: unknown = 'pending';
    void svc.uploadCover('SF', new Uint8Array([1, 2, 3]), 'image/jpeg').then((r) => { issue = r; });
    await vi.advanceTimersByTimeAsync(DELAI_LECTURE_MS + 1);
    expect(issue, 'a photo on a 2G link is not cut at the read ceiling').toBe('pending');
    await vi.advanceTimersByTimeAsync(DELAI_ENVOI_MS - DELAI_LECTURE_MS);
    expect(issue).toEqual({ ok: false, reason: 'offline' });
  });

  it('HttpOfferSource: the browse read ends as unavailable, never invented products', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchQuiPend());
    const src = new HttpOfferSource('http://shop.test', async () => 'SPS-AAAA');
    const p = src.list();
    await vi.advanceTimersByTimeAsync(DELAI_LECTURE_MS + 1);
    expect(await p).toEqual({ status: 'unavailable' });
  });
});
