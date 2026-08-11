import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * ═══ VITRINE-RETRAIT — SHE TAKES A PRODUCT OUT, AND THE BUYER SEES IT GO ═══
 *
 * Founder, 2026-08-11: « when they delete products from their ma vitrine these
 * products still show on their boutique. »
 *
 * WHY THIS IS A SEAM TEST AND NOT A UNIT: the removal only means anything if it
 * survives to `GET /s/{slug}` — the page a cliente actually opens. That crosses
 * the router, the per-storefront Durable Object, the stored entry and the
 * buyer-safe projection, and a fake at any one of those hops would prove
 * nothing about the screen the founder is complaining about. So it runs on real
 * workerd, and it ASKS THE BUYER'S PAGE for the outcome rather than believing
 * the write's own answer.
 *
 * IT ALSO PINS THE PART THAT IS EASY TO FORGET: a pid can be PINNED (« à la
 * une ») and placed in a SECTION. A removal that dropped only the membership
 * would leave the buyer projection carrying ids the catalogue can no longer
 * describe — so the pin and the section row must go in the same act.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'vitrine-retrait-'));
const WRITE_SECRET = 'test-write-secret-r001';
const authed = { 'X-Write-Key': WRITE_SECRET, 'Content-Type': 'application/json' };

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { STOREFRONT: 'StorefrontDO' },
  durableObjectsPersist: persist,
  bindings: { STOREFRONT_WRITE_SECRET: WRITE_SECRET },
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

const SF_ID = 'sf-retrait-001';
const SLUG = 'retrait-0001';

/** The create command shape the existing e2e already proves against this Worker. */
const CREATE = {
  commandId: 'c-retrait-001',
  id: SF_ID,
  resellerId: 'rs-retrait-001',
  shortCode: 'RETRAIT-0001',
  name: 'Boutique retrait',
  zone: 'Ouagadougou',
  category: 'Général',
  correlationId: 'corr-retrait-001',
  at: '2026-08-11T08:00:00.000Z',
};

async function post(path: string, body: unknown): Promise<Response> {
  return mf.dispatchFetch(`http://sf${path}`, {
    method: 'POST',
    headers: authed,
    body: JSON.stringify(body),
  }) as unknown as Promise<Response>;
}

/** The page a CLIENTE opens — the only answer that settles the founder's report. */
async function boutique(): Promise<{
  curatedItems: string[];
  featuredItems: string[];
  sections: { id: string; name: string; pids: string[] }[];
}> {
  const res = await mf.dispatchFetch(`http://sf/s/${SLUG}`, { method: 'GET' });
  expect(res.status).toBe(200);
  return (await res.json()) as never;
}

describe('VITRINE-RETRAIT — the removal reaches the buyer’s page', () => {
  it('a removed product leaves the boutique, with its pin and its section row', async () => {
    const created = await post('/storefronts', CREATE);
    expect(created.status, await created.clone().text()).toBe(200);

    // Three products in her shop, through the REAL membership write.
    for (const pid of ['pv-a', 'pv-b', 'pv-c']) {
      const added = await post(`/storefronts/${SF_ID}/items`, { pid, at: '2026-08-11T08:05:00.000Z' });
      expect(added.status, `${pid}: ${await added.clone().text()}`).toBe(200);
    }
    // …and pv-b is PINNED and placed in a section, so the removal has something
    // to forget besides the membership.
    const arranged = await post(`/storefronts/${SF_ID}/identity`, {
      patch: {
        featuredItems: ['pv-b'],
        sections: [{ id: 's1', name: 'Nouveautés', pids: ['pv-b', 'pv-c'] }],
      },
      at: '2026-08-11T08:06:00.000Z',
    });
    expect(arranged.status, await arranged.clone().text()).toBe(200);

    const before = await boutique();
    expect(before.curatedItems).toEqual(['pv-a', 'pv-b', 'pv-c']);
    expect(before.featuredItems).toEqual(['pv-b']);
    expect(before.sections[0]?.pids).toEqual(['pv-b', 'pv-c']);

    // ── SHE REMOVES pv-b ────────────────────────────────────────────────────
    const removed = await post(`/storefronts/${SF_ID}/items/remove`, { pid: 'pv-b', at: '2026-08-11T09:00:00.000Z' });
    expect(removed.status, await removed.clone().text()).toBe(200);
    expect(((await removed.json()) as { status: string }).status).toBe('removed');

    // ── AND THE CLIENTE'S PAGE AGREES ───────────────────────────────────────
    const after = await boutique();
    expect(after.curatedItems, 'the product must be OFF her boutique').toEqual(['pv-a', 'pv-c']);
    expect(after.featuredItems, 'a pin to a product she no longer holds is a dangling pin').toEqual([]);
    expect(after.sections[0]?.pids, 'the section row goes with the membership').toEqual(['pv-c']);
    // Her OTHER products are untouched — a removal removes ONE thing.
    expect(after.curatedItems).toContain('pv-a');
    expect(after.sections[0]?.name, 'an emptied-of-one section is not deleted').toBe('Nouveautés');
  });

  it('removing it again is quiet — the outcome she asked for is already true', async () => {
    const again = await post(`/storefronts/${SF_ID}/items/remove`, { pid: 'pv-b', at: '2026-08-11T09:01:00.000Z' });
    expect(again.status).toBe(200);
    expect(((await again.json()) as { status: string }).status).toBe('not_present');
    expect((await boutique()).curatedItems).toEqual(['pv-a', 'pv-c']);
  });

  it('an unknown shop is the honest 404, never a phantom removal', async () => {
    const res = await post('/storefronts/sf-jamais-creee/items/remove', { pid: 'pv-a' });
    expect(res.status).toBe(404);
  });

  it('the write gate still stands — no key, no removal', async () => {
    const res = (await mf.dispatchFetch(`http://sf/storefronts/${SF_ID}/items/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid: 'pv-a' }),
    })) as unknown as Response;
    expect(res.status).toBe(401);
    // …and the shop is untouched by the refused call.
    expect((await boutique()).curatedItems).toEqual(['pv-a', 'pv-c']);
  });

  it('a malformed body is refused, never read as « remove nothing » or « remove all »', async () => {
    for (const body of [{}, { pid: '' }, { pid: 42 }]) {
      const res = await post(`/storefronts/${SF_ID}/items/remove`, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect((await boutique()).curatedItems).toEqual(['pv-a', 'pv-c']);
  });
});
