import { describe, expect, it } from 'vitest';
import { readFeedVente, HttpResellerFeed, resolveResellerFeed, type FeedVente } from '../src/sales/feed-service';
import { vueDesVentes, totalNet } from '../src/sales/feed-model';

/**
 * RF-1b — the client seam and the honest-state model for her feed.
 * These tests assert the PROPERTIES, not the plumbing: a malformed row never
 * becomes half a sale, an unproven state never becomes a chip, and no key ever
 * enters the bundle.
 */

const row = (over: Partial<FeedVente> = {}): FeedVente => ({
  orderId: 'ord-1',
  state: 'confirmed',
  createdAt: '2026-08-02T08:00:00.000Z',
  resellerNet: 2_800,
  productVersionId: 'pv-1',
  zoneTo: 'Ouagadougou',
  ...over,
});

describe('RF-1b — the boundary reader drops a bad row WHOLE', () => {
  it('accepts a well-formed row field for field', () => {
    expect(readFeedVente(row())).toEqual(row());
  });

  it('refuses every malformed shape rather than rendering a blank amount', () => {
    for (const bad of [
      null,
      undefined,
      'a string',
      42,
      { ...row(), orderId: '' },
      { ...row(), orderId: 7 },
      { ...row(), state: 'en_route' }, // a state Shop+ cannot prove
      { ...row(), state: '' },
      { ...row(), createdAt: '' },
      { ...row(), resellerNet: '2800' }, // a franc must be a number
      { ...row(), resellerNet: 2_800.5 }, // …an INTEGER number of francs
      { ...row(), resellerNet: -1 },
      { ...row(), zoneTo: null },
      { ...row(), productVersionId: 12 },
    ]) {
      expect(readFeedVente(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('a row missing its net is dropped — it never renders as a sale worth nothing', () => {
    const { resellerNet: _omit, ...withoutNet } = row();
    expect(readFeedVente(withoutNet)).toBeNull();
  });
});

describe('RF-1b — her screen may only claim what Shop+ can prove', () => {
  it('a confirmed sale reads PAYÉE, from the catalog, never an inline string', () => {
    const vue = vueDesVentes([row()]);
    expect(vue.kind).toBe('ready');
    if (vue.kind !== 'ready') throw new Error('unreachable');
    expect(vue.ventes[0]!.etatKey).toBe('ventes.etat_payee');
    expect(vue.ventes[0]!.netFcfa).toBe(2_800);
  });

  it('NO unproven state is ever produced: preparation, route, door and delivery are absent from every output', () => {
    const vue = vueDesVentes([row(), row({ orderId: 'ord-2' })]);
    const bytes = JSON.stringify(vue);
    for (const invented of ['preparation', 'en_route', 'porte', 'livree', 'probleme']) {
      expect(bytes.includes(invented), `invented a state it cannot prove: ${invented}`).toBe(false);
    }
  });

  it('no gross, no commission, no base price is representable in the view at all', () => {
    const bytes = JSON.stringify(vueDesVentes([row()]));
    for (const banned of ['gross', 'commission', 'basePrice', 'sellerBasePrice', 'markup', 'buyerTotal']) {
      expect(bytes.toLowerCase().includes(banned.toLowerCase()), `leaked ${banned}`).toBe(false);
    }
  });

  it('an empty feed is an HONEST empty state, not an error and not a fake count', () => {
    expect(vueDesVentes([]).kind).toBe('empty');
  });

  it('a non-confirmed row is never a sale — it is counted, not silently dropped', () => {
    const vue = vueDesVentes([row(), row({ orderId: 'ord-p', state: 'payment_pending' })]);
    if (vue.kind !== 'ready') throw new Error('expected ready');
    expect(vue.ventes.length).toBe(1);
    expect(vue.ventes[0]!.orderId).toBe('ord-1');
    expect(vue.nonConfirmees).toBe(1);
  });

  it('rows with ONLY unconfirmed orders show empty — an unpaid order is not a sale', () => {
    const vue = vueDesVentes([row({ state: 'payment_pending' }), row({ state: 'payment_failed' })]);
    expect(vue.kind).toBe('empty');
  });

  it('newest first, by the server clock', () => {
    const vue = vueDesVentes([
      row({ orderId: 'old', createdAt: '2026-08-01T08:00:00.000Z' }),
      row({ orderId: 'new', createdAt: '2026-08-02T09:00:00.000Z' }),
      row({ orderId: 'mid', createdAt: '2026-08-02T08:00:00.000Z' }),
    ]);
    if (vue.kind !== 'ready') throw new Error('expected ready');
    expect(vue.ventes.map((v) => v.orderId)).toEqual(['new', 'mid', 'old']);
  });

  it('her total is a SUM OF COPIED NETS — never recomputed from a base and a rate', () => {
    const vue = vueDesVentes([row({ resellerNet: 2_800 }), row({ orderId: 'b', resellerNet: 1_200 })]);
    if (vue.kind !== 'ready') throw new Error('expected ready');
    expect(totalNet(vue.ventes)).toBe(4_000);
  });
});

describe('RF-1b — the door, over a real fetch surface', () => {
  const withFetch = async (impl: typeof fetch, fn: () => Promise<void>): Promise<void> => {
    const original = globalThis.fetch;
    globalThis.fetch = impl;
    try {
      await fn();
    } finally {
      globalThis.fetch = original;
    }
  };

  it('sends her code as a Bearer and NOTHING else — no key, no resellerId in the body', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    await withFetch(
      (async (url: string, init?: RequestInit) => {
        seenUrl = String(url);
        seenInit = init;
        return new Response(JSON.stringify({ ok: true, ventes: [] }), { status: 200 });
      }) as unknown as typeof fetch,
      async () => {
        const res = await new HttpResellerFeed('https://api.example/').mesVentes('SP-AAAA-BBBB-CCCC-DDDD');
        expect(res.ok).toBe(true);
      },
    );
    expect(seenUrl).toBe('https://api.example/reseller/ventes');
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer SP-AAAA-BBBB-CCCC-DDDD');
    // the identity is DERIVED server-side from the code — the client never claims it
    expect(JSON.stringify(seenInit ?? {}).includes('resellerId')).toBe(false);
    expect(seenInit?.method ?? 'GET').toBe('GET');
  });

  it('a 401 is ONE refusal — the client never distinguishes "no such code" from "wrong code"', async () => {
    await withFetch(
      (async () => new Response('{"error":"unauthorized"}', { status: 401 })) as unknown as typeof fetch,
      async () => {
        expect(await new HttpResellerFeed('https://api.example').mesVentes('SP-nope')).toEqual({
          ok: false,
          reason: 'unauthorized',
        });
      },
    );
  });

  it('a dead network is unreachable, never an empty list — offline is not "no sales"', async () => {
    await withFetch(
      (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
      async () => {
        expect(await new HttpResellerFeed('https://api.example').mesVentes('SP-x')).toEqual({
          ok: false,
          reason: 'unreachable',
        });
      },
    );
  });

  it('a malformed body is refused, and a single bad row does not blank the good ones', async () => {
    await withFetch(
      (async () => new Response(JSON.stringify({ ok: true, ventes: 'not an array' }), { status: 200 })) as unknown as typeof fetch,
      async () => {
        expect((await new HttpResellerFeed('https://api.example').mesVentes('SP-x')).ok).toBe(false);
      },
    );
    await withFetch(
      (async () =>
        new Response(JSON.stringify({ ok: true, ventes: [row(), { orderId: 'broken' }] }), {
          status: 200,
        })) as unknown as typeof fetch,
      async () => {
        const res = await new HttpResellerFeed('https://api.example').mesVentes('SP-x');
        if (!res.ok) throw new Error('expected ok');
        expect(res.ventes.length).toBe(1);
      },
    );
  });

  it('resolves to NULL without a base — an unset environment never looks like a working feed', () => {
    const saved = process.env.EXPO_PUBLIC_STOREFRONT_BASE;
    delete process.env.EXPO_PUBLIC_STOREFRONT_BASE;
    try {
      expect(resolveResellerFeed()).toBeNull();
    } finally {
      if (saved !== undefined) process.env.EXPO_PUBLIC_STOREFRONT_BASE = saved;
    }
  });
});

describe('RF-1b — her credential is never in the bundle', () => {
  it('the seam reads NO key from the environment: only the base URL', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/sales/feed-service.ts', import.meta.url), 'utf8'),
    );
    const envReads = [...src.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]);
    expect(envReads).toEqual(['EXPO_PUBLIC_STOREFRONT_BASE']);
    // CONTROL — the scan can see (this very file names the base, so a zero
    // match above would mean a broken regex, not a clean module)
    expect(envReads.length).toBeGreaterThan(0);
    for (const banned of ['WRITE_KEY', 'OPS_SECRET', 'REVOKE_KEY', 'FEED_KEY']) {
      expect(src.includes(`EXPO_PUBLIC_${banned}`), `a credential entered the bundle: ${banned}`).toBe(false);
    }
  });
});
