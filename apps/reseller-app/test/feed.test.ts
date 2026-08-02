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
    const vue = vueDesVentes([row()], false);
    expect(vue.kind).toBe('ready');
    if (vue.kind !== 'ready') throw new Error('unreachable');
    expect(vue.ventes[0]!.etatKey).toBe('ventes.etat_payee');
    expect(vue.ventes[0]!.netFcfa).toBe(2_800);
  });

  it('NO unproven state is ever produced: preparation, route, door and delivery are absent from every output', () => {
    const vue = vueDesVentes([row(), row({ orderId: 'ord-2' })], false);
    const bytes = JSON.stringify(vue);
    for (const invented of ['preparation', 'en_route', 'porte', 'livree', 'probleme']) {
      expect(bytes.includes(invented), `invented a state it cannot prove: ${invented}`).toBe(false);
    }
  });

  it('no gross, no commission, no base price is representable in the view at all', () => {
    const bytes = JSON.stringify(vueDesVentes([row()], false));
    for (const banned of ['gross', 'commission', 'basePrice', 'sellerBasePrice', 'markup', 'buyerTotal']) {
      expect(bytes.toLowerCase().includes(banned.toLowerCase()), `leaked ${banned}`).toBe(false);
    }
  });

  it('an empty feed is an HONEST empty state, not an error and not a fake count', () => {
    expect(vueDesVentes([], false).kind).toBe('empty');
  });

  it('a non-confirmed row is never a sale — it is counted, not silently dropped', () => {
    const vue = vueDesVentes([row(), row({ orderId: 'ord-p', state: 'payment_pending' })], false);
    if (vue.kind !== 'ready') throw new Error('expected ready');
    expect(vue.ventes.length).toBe(1);
    expect(vue.ventes[0]!.orderId).toBe('ord-1');
    expect(vue.nonConfirmees).toBe(1);
  });

  it('rows with ONLY unconfirmed orders show empty — an unpaid order is not a sale', () => {
    const vue = vueDesVentes([row({ state: 'payment_pending' }), row({ state: 'payment_failed' })], false);
    expect(vue.kind).toBe('empty');
  });

  it('newest first, by the server clock', () => {
    const vue = vueDesVentes([
      row({ orderId: 'old', createdAt: '2026-08-01T08:00:00.000Z' }),
      row({ orderId: 'new', createdAt: '2026-08-02T09:00:00.000Z' }),
      row({ orderId: 'mid', createdAt: '2026-08-02T08:00:00.000Z' }),
    ], false);
    if (vue.kind !== 'ready') throw new Error('expected ready');
    expect(vue.ventes.map((v) => v.orderId)).toEqual(['new', 'mid', 'old']);
  });

  it('her total is a SUM OF COPIED NETS — never recomputed from a base and a rate', () => {
    const vue = vueDesVentes([row({ resellerNet: 2_800 }), row({ orderId: 'b', resellerNet: 1_200 })], false);
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

describe('RF-1b (verifier B3) — a partial feed is never presented as a complete one', () => {
  it('the server’s incomplet flag reaches her view', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, ventes: [], incomplet: true }), { status: 200 })) as unknown as typeof fetch;
    try {
      const res = await new HttpResellerFeed('https://api.example').mesVentes('SP-x');
      if (!res.ok) throw new Error('expected ok');
      expect(res.incomplet).toBe(true);
      expect(vueDesVentes(res.ventes, res.incomplet)).toEqual({ kind: 'empty', incomplet: true, nonConfirmees: 0 });
    } finally {
      globalThis.fetch = original;
    }
  });

  it('a row THIS reader had to drop also makes the answer incomplete — even when the server called it complete', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, ventes: [row(), { orderId: 'broken' }], incomplet: false }), {
        status: 200,
      })) as unknown as typeof fetch;
    try {
      const res = await new HttpResellerFeed('https://api.example').mesVentes('SP-x');
      if (!res.ok) throw new Error('expected ok');
      expect(res.ventes.length).toBe(1);
      expect(res.incomplet, 'a dropped row must be declared').toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('a READY view carries incomplet TRUE when the server said so — the direction the old test never covered', async () => {
    // VERIFIER ROUND 2, vacuous test closed: the suite only ever asserted the
    // `false` direction on a ready view, so hardcoding the model to
    // `incomplet: false` — B3's exact failure, one layer down — left 397/397
    // green. This constructs the TRUE direction on a NON-EMPTY feed.
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, ventes: [row()], incomplet: true }), { status: 200 })) as unknown as typeof fetch;
    try {
      const res = await new HttpResellerFeed('https://api.example').mesVentes('SP-x');
      if (!res.ok) throw new Error('expected ok');
      const vue = vueDesVentes(res.ventes, res.incomplet);
      if (vue.kind !== 'ready') throw new Error('expected ready');
      expect(vue.ventes.length).toBe(1);
      expect(vue.incomplet, 'a partial feed must never render as the whole truth').toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('an EMPTY view still reports how many rows were not sales — a wire bug must not be invisible', () => {
    // VERIFIER ROUND 2, new defect closed: rows that are ALL unconfirmed
    // produce an empty view, and the count was dropped there — the one place
    // it matters most, while the comment claimed it was surfaced.
    const vue = vueDesVentes([row({ state: 'payment_pending' }), row({ state: 'payment_failed' })], false);
    if (vue.kind !== 'empty') throw new Error('expected empty');
    expect(vue.nonConfirmees, 'she must tell "nothing sent" from "nothing was a sale"').toBe(2);
    const nothing = vueDesVentes([], false);
    if (nothing.kind !== 'empty') throw new Error('expected empty');
    expect(nothing.nonConfirmees).toBe(0);
  });

  it('a fully-read feed says so, so the flag carries information', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, ventes: [row()], incomplet: false }), { status: 200 })) as unknown as typeof fetch;
    try {
      const res = await new HttpResellerFeed('https://api.example').mesVentes('SP-x');
      if (!res.ok) throw new Error('expected ok');
      expect(res.incomplet).toBe(false);
      const vue = vueDesVentes(res.ventes, res.incomplet);
      if (vue.kind !== 'ready') throw new Error('expected ready');
      expect(vue.incomplet).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('READINESS-RETURN-1c — her follow-up continues past payée, and stops where proof stops', () => {
  it('PAYÉE → EN PRÉPARATION → PRÊTE, each only once Boutik+ has actually said so', () => {
    const payee = vueDesVentes([row()], false);
    if (payee.kind !== 'ready') throw new Error('expected ready');
    expect(payee.ventes[0]!.etatKey).toBe('ventes.etat_payee');

    const prep = vueDesVentes([row({ acceptedAt: '2026-08-02T09:00:00.000Z' })], false);
    if (prep.kind !== 'ready') throw new Error('expected ready');
    expect(prep.ventes[0]!.etatKey).toBe('ventes.etat_preparation');

    const prete = vueDesVentes(
      [row({ acceptedAt: '2026-08-02T09:00:00.000Z', readyAt: '2026-08-02T10:30:00.000Z' })],
      false,
    );
    if (prete.kind !== 'ready') throw new Error('expected ready');
    expect(prete.ventes[0]!.etatKey).toBe('ventes.etat_prete');
  });

  it('READY WITHOUT ACCEPTED still reads PRÊTE — the furthest PROVEN fact wins, never a guessed sequence', () => {
    const vue = vueDesVentes([row({ readyAt: '2026-08-02T10:30:00.000Z' })], false);
    if (vue.kind !== 'ready') throw new Error('expected ready');
    expect(vue.ventes[0]!.etatKey).toBe('ventes.etat_prete');
  });

  it('THE WIRE STILL STOPS AT READINESS: no delivery state is reachable from any input', () => {
    const vue = vueDesVentes(
      [row({ acceptedAt: '2026-08-02T09:00:00.000Z', readyAt: '2026-08-02T10:30:00.000Z' })],
      false,
    );
    const bytes = JSON.stringify(vue);
    for (const invented of ['en_route', 'porte', 'livree', 'probleme', 'courier', 'custody']) {
      expect(bytes.includes(invented), `invented a state Séra alone could prove: ${invented}`).toBe(false);
    }
  });

  it('every state key it can emit EXISTS in the catalog — a chip must never render a missing string', async () => {
    const fs = await import('node:fs');
    const catalog = JSON.parse(
      fs.readFileSync(new URL('../i18n/catalog.json', import.meta.url), 'utf8'),
    ) as { key: string; register: string }[];
    const keys = new Set(catalog.map((e) => e.key));
    for (const r of [
      row(),
      row({ acceptedAt: '2026-08-02T09:00:00.000Z' }),
      row({ acceptedAt: '2026-08-02T09:00:00.000Z', readyAt: '2026-08-02T10:30:00.000Z' }),
    ]) {
      const vue = vueDesVentes([r], false);
      if (vue.kind !== 'ready') throw new Error('expected ready');
      expect(keys.has(vue.ventes[0]!.etatKey), `missing catalog key: ${vue.ventes[0]!.etatKey}`).toBe(true);
    }
  });

  it('a malformed preparation instant is DROPPED, and the sale itself survives it', () => {
    expect(readFeedVente({ ...row(), acceptedAt: 42 })).toEqual(row());
    expect(readFeedVente({ ...row(), readyAt: '' })).toEqual(row());
    // …and a good one is kept
    expect(readFeedVente({ ...row(), readyAt: '2026-08-02T10:30:00.000Z' })!.readyAt).toBe(
      '2026-08-02T10:30:00.000Z',
    );
  });
});
