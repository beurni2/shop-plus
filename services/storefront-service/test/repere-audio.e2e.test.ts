import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * ═══ REPERE-AUDIO-REEL — the buyer's voice note rides the ORDER (2026-08-08) ═══
 *
 * REQUIRED BY THE NO-LOOP LAW: one test crosses the seam end to end. The seam:
 * the buyer's create body carries `contact.audioB64` → the REAL Worker hands
 * the DECODED BYTES to the media door through the MEDIA binding with its own
 * write key → the minted ref (and ONLY the ref) is stored on the order's
 * contact → the founder's key-C dispatch read serves it back. The media door
 * is another repo's Worker, so it appears here as a CONTRACT-CERTIFIED stub
 * pinned to the real door's own bounds: write-gate 401 first, magic-byte
 * sniff (EBML → 201 audio/webm, JPEG → 400 unsupported_type), opaque
 * `media/{uuid}` mint — each behaviour verbatim from
 * boutik's media-service `/media/audio` + its write gate.
 *
 * And the LAW THE ROUTE LIVES BY, proven, not claimed: the note never blocks
 * the sale — a refused note creates the order anyway, named `perdue`.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'repere-audio-'));
const T0 = '2026-08-08T09:00:00.000Z';

const WRITE_SECRET = 'test-write-secret-audio1';
const OPS_SECRET = 'test-checkout-ops-secret-audio1';
const MEDIA_KEY = 'test-media-write-key-audio1';
const authed = { 'X-Write-Key': WRITE_SECRET };

const SUPPLY = [
  {
    productVersionId: 'pv-audio-1',
    offerVersion: 'ov-audio-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 9,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];

/** A WebM note as the recorder emits one: the EBML head, then opaque data. */
const webmNote = (): Uint8Array => {
  const b = new Uint8Array(180).fill(0x42);
  b[0] = 0x1a; b[1] = 0x45; b[2] = 0xdf; b[3] = 0xa3;
  return b;
};
/** JPEG magic — bytes the real audio door REFUSES (`unsupported_type`). */
const jpegBytes = (): Uint8Array => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/** What the certified media stub observed — the seam's other side. */
const mediaCalls: { key: string | null; bytes: Uint8Array }[] = [];
const mintedRefs: string[] = [];

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  port: 0,
  durableObjects: {
    STOREFRONT: 'StorefrontDO',
    LISTING: 'ListingDO',
    CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO',
    LADDER: 'BuyerLadderDO',
    DISPATCH: 'DispatchIndexDO',
    RESELLER: 'ResellerFeedDO',
  },
  durableObjectsPersist: persist,
  bindings: {
    STOREFRONT_WRITE_SECRET: WRITE_SECRET,
    CHECKOUT_OPS_SECRET: OPS_SECRET,
    MEDIA_WRITE_KEY: MEDIA_KEY,
  },
  serviceBindings: {
    OFFER: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (request.method === 'POST' && path === '/fulfillment/order-confirmed') {
        return Response.json({ ok: true, status: 'registered' });
      }
      const single = /^\/supply-projection\/([^/]+)$/.exec(path);
      if (single) {
        const pid = decodeURIComponent(single[1]!);
        const value = SUPPLY.find((v) => v.productVersionId === pid);
        if (value === undefined) {
          return Response.json({ service: 'offer-service', status: 'not_found' }, { status: 404 });
        }
        return Response.json({ version: 1, asOf: new Date().toISOString(), value });
      }
      return Response.json({ service: 'offer-service', status: 'not_found' }, { status: 404 });
    },
    // The CERTIFIED media door — each clause is the real route's own bound.
    MEDIA: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (request.method !== 'POST' || path !== '/media/audio') {
        return Response.json({ service: 'media-service', status: 'not_found' }, { status: 404 });
      }
      const key = request.headers.get('X-Write-Key');
      const bytes = new Uint8Array(await request.arrayBuffer());
      mediaCalls.push({ key, bytes });
      // Gate FIRST, before any validation — the real entry's order.
      if (key !== MEDIA_KEY) return Response.json({ error: 'unauthorized' }, { status: 401 });
      const isWebm = bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
      if (!isWebm) return Response.json({ error: 'rejected', reason: 'unsupported_type' }, { status: 400 });
      const ref = `media/${crypto.randomUUID()}`;
      mintedRefs.push(ref);
      return Response.json({ ref, contentType: 'audio/webm', durationSeconds: null, byteLength: bytes.length }, { status: 201 });
    },
  },
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

let keyN = 0;
const freshKey = (): string => `rk-audio-${String((keyN += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

/** The buyer's own road up to a RESERVED quote, ready for the order. */
async function reservedQuote(n: string): Promise<string> {
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-aud-${n}`, resellerId: `rs-aud-${n}`,
      shortCode: `AUD-${n}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
      category: 'Général', correlationId: `corr-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-aud-${n}`, storefrontId: `sf-aud-${n}`,
      resellerId: `rs-aud-${n}`, productVersionId: 'pv-audio-1', offerVersion: 'ov-audio-1',
      markup: 1_500, correlationId: `corr-${n}`, at: T0,
    }),
  });
  const decision = (await pub.json()) as { status?: string };
  if (decision.status !== 'published') throw new Error(`setup: listing ${JSON.stringify(decision)}`);
  const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: `aud-${n}`, pid: 'pv-audio-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
      attributionResellerId: `rs-aud-${n}`, requestKey: freshKey(),
    }),
  });
  const quote = safeJson(await quoteRes.text()) as { quoteId?: string };
  if (quoteRes.status !== 200 || typeof quote.quoteId !== 'string') throw new Error(`setup: quote ${quoteRes.status}`);
  const held = await mf.dispatchFetch(
    `http://c/checkout/quote/${encodeURIComponent(quote.quoteId)}/reserve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` }),
    },
  );
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status}`);
  return quote.quoteId;
}

async function createOrder(n: string, quoteId: string, contact: Record<string, unknown>) {
  const res = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}`, contact }),
  });
  return { status: res.status, body: safeJson(await res.text()) };
}

async function dispatchRow(orderId: string): Promise<Record<string, unknown> | undefined> {
  const res = await mf.dispatchFetch('http://c/checkout/dispatch', {
    headers: { Authorization: `Bearer ${OPS_SECRET}` },
  });
  const body = safeJson(await res.text()) as { orders?: { orderId?: string }[] };
  return (body.orders ?? []).find((o) => o.orderId === orderId) as Record<string, unknown> | undefined;
}

describe('REPERE-AUDIO-REEL — the note rides the order, end to end on the real Worker', () => {
  it('SEAM: audioB64 at create → the media door receives THE BYTES under the write key → the dispatch read serves the minted ref', async () => {
    const note = webmNote();
    const quoteId = await reservedQuote('0001');
    const before = mediaCalls.length;
    const { status, body } = await createOrder('0001', quoteId, {
      phone: '70 12 34 56', quartier: 'Gounghin', repere: 'Face à la pharmacie', audioB64: b64(note),
    });
    expect(status).toBe(200);
    expect(body['noteVocale']).toBe('gardee');
    // The other side of the seam: exactly one call, the very bytes, the key.
    expect(mediaCalls.length).toBe(before + 1);
    expect(mediaCalls[before]!.key).toBe(MEDIA_KEY);
    expect(mediaCalls[before]!.bytes).toEqual(note);
    // The founder's read: the ORDER's own stored contact carries the minted ref.
    const row = await dispatchRow(`ord-${quoteId}`);
    expect(row).toBeDefined();
    const contact = row!['contact'] as { audioRef?: string; phone?: string };
    expect(contact.audioRef).toBe(mintedRefs[mintedRefs.length - 1]);
    expect(contact.phone).toBe('70 12 34 56');
  });

  it('THE LAW: a REFUSED note never blocks the sale — order created, loss NAMED, no ref invented', async () => {
    const quoteId = await reservedQuote('0002');
    const { status, body } = await createOrder('0002', quoteId, {
      phone: '70 12 34 57', quartier: 'Dassasgho', repere: 'Portail bleu', audioB64: b64(jpegBytes()),
    });
    expect(status).toBe(200); // the sale went through
    expect(body['noteVocale']).toBe('perdue'); // and the loss has a name
    const row = await dispatchRow(`ord-${quoteId}`);
    expect(row).toBeDefined();
    expect((row!['contact'] as { audioRef?: string }).audioRef).toBeUndefined();
  });

  it('a contact WITHOUT a note is exactly BC-1a, untouched — no noteVocale field appears at all', async () => {
    const quoteId = await reservedQuote('0003');
    const { status, body } = await createOrder('0003', quoteId, {
      phone: '70 12 34 58', quartier: 'Gounghin', repere: '',
    });
    expect(status).toBe(200);
    expect('noteVocale' in body).toBe(false);
    const row = await dispatchRow(`ord-${quoteId}`);
    expect((row!['contact'] as { audioRef?: string }).audioRef).toBeUndefined();
  });

  it('the wire REFUSES what must not travel: a caller-supplied audioRef, malformed base64, an oversize note', async () => {
    const quoteId = await reservedQuote('0004');
    const before = mediaCalls.length;
    // A ref is minted server-side or it does not exist — never accepted.
    const smuggled = await createOrder('0004a', quoteId, {
      phone: '70 12 34 59', quartier: 'Gounghin', repere: 'x',
      audioRef: 'media/11111111-2222-4333-8444-555555555555',
    });
    expect(smuggled.status).toBe(400);
    expect(smuggled.body).toEqual({ error: 'bad_field', field: 'contact' });
    // Not base64 → refused LOUDLY at the door, not lost quietly on atob.
    const garbled = await createOrder('0004b', quoteId, {
      phone: '70 12 34 59', quartier: 'Gounghin', repere: 'x', audioB64: '!!!not-base64!!!',
    });
    expect(garbled.status).toBe(400);
    // Beyond the ~1 MiB wire bound → refused, never forwarded.
    const huge = await createOrder('0004c', quoteId, {
      phone: '70 12 34 59', quartier: 'Gounghin', repere: 'x', audioB64: 'A'.repeat(1_400_001),
    });
    expect(huge.status).toBe(400);
    // NONE of the refusals reached the media door — refused before the hop.
    expect(mediaCalls.length).toBe(before);
  });
});
