import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance } from './seance';

/**
 * ═══ REPERE-AUDIO-REEL — the buyer's voice note rides the ORDER (2026-08-08) ═══
 *
 * ACCES-ARME-2 (2026-09-05): the shared write key is retired. The shop each
 * order rides on is seated through `seance()` — signup → the founder mints on
 * key C → admission — and created with HER session bearer; her `resellerId`
 * is the id the book minted. The founder's dispatch read stays on key C.
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

const MEDIA_KEY = 'test-media-write-key-audio1';

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
/** F-64 — when set, the media door awaits this before answering (a barrier a
 *  test raises to hold two uploads open at once, then lowers). */
let barriereMedia: (() => Promise<void>) | null = null;

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
    COMPTES: 'ResellerAccountsDO',
  },
  durableObjectsPersist: persist,
  bindings: {
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
      // F-64 — a test may HOLD the door's answer (see `barriereMedia`): the
      // upload is the one await in `create()` a test can stretch from outside,
      // which is what makes the read-then-write window reproducible.
      if (barriereMedia !== null) await barriereMedia();
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
  const S = await seance(mf, `aud${n}`);
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST',
    headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-aud-${n}`, resellerId: S.accountId,
      shortCode: `AUD-${n}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
      category: 'Général', correlationId: `corr-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST',
    headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-aud-${n}`, storefrontId: `sf-aud-${n}`,
      resellerId: S.accountId, productVersionId: 'pv-audio-1', offerVersion: 'ov-audio-1',
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
      attributionResellerId: S.accountId, requestKey: freshKey(),
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

  it('NOTE-VOCALE-APRES-GARDE-1 (AUDIT-SHOP-2 F-04): a create the hold check REFUSES uploads NOTHING; the real holder uploads exactly once; a replay uploads nothing again', async () => {
    const note = webmNote();
    const quoteId = await reservedQuote('0031');
    const before = mediaCalls.length;
    // THE AUDIT'S MEASURED ROAD: a valid quote id (anonymously mintable) and an
    // invented holder — refused by name, and NOT a byte relayed to Boutik+.
    // Before this slice the router uploaded first and asked the object after:
    // five such calls relayed five megabytes for zero orders.
    const usurpe = await createOrder('0031x', quoteId, {
      phone: '70 12 34 61', quartier: 'Gounghin', repere: 'Face à l\'école', audioB64: b64(note),
    });
    expect(usurpe.status, usurpe.body['reason'] as string).not.toBe(200);
    expect(mediaCalls.length, 'no upload before the hold check').toBe(before);
    expect(await dispatchRow(`ord-${quoteId}`), 'no order was born').toBeUndefined();
    // the REAL holder: exactly one upload, after the gate
    const first = await createOrder('0031', quoteId, {
      phone: '70 12 34 61', quartier: 'Gounghin', repere: 'Face à l\'école', audioB64: b64(note),
    });
    expect(first.status).toBe(200);
    expect(first.body['noteVocale']).toBe('gardee');
    expect(mediaCalls.length).toBe(before + 1);
    expect(mediaCalls[before]!.bytes).toEqual(note);
    // …and a REPLAY of the same command, bytes and all, uploads nothing more
    const replay = await createOrder('0031', quoteId, {
      phone: '70 12 34 61', quartier: 'Gounghin', repere: 'Face à l\'école', audioB64: b64(note),
    });
    expect(replay.status).toBe(200);
    expect(mediaCalls.length, 'a replay uploads nothing').toBe(before + 1);
    // THE LEDGER: the order's contact carries the one minted ref
    const row = await dispatchRow(`ord-${quoteId}`);
    expect((row!['contact'] as { audioRef?: string }).audioRef).toBe(mintedRefs[mintedRefs.length - 1]);
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

/* ═══ GEO-ACHAT-1 — HER PIN, END TO END ON THE REAL WORKER ═══════════════
 * Same law as the phone and the voice ref: the pin exits through the
 * founder's key-C dispatch read and NOWHERE else. Supporting evidence for
 * the rider (SE-I07 upstream) — it decides nothing here and never will. */

describe('GEO-ACHAT-1 — the pin rides the order, end to end on the real Worker', () => {
  it('SEAM: pin at create → stored on the contact → the dispatch read serves it EXACTLY; the public view never carries a coordinate', async () => {
    const quoteId = await reservedQuote('0011');
    const { status } = await createOrder('0011', quoteId, {
      phone: '70 12 34 60', quartier: 'Gounghin', repere: 'Face à la pharmacie',
      pin: { lat: 12.371532, lng: -1.519931, accuracy: 12 },
    });
    expect(status).toBe(200);
    // THE LEDGER: the founder's read serves the very bytes the device produced.
    const row = await dispatchRow(`ord-${quoteId}`);
    expect(row).toBeDefined();
    const contact = row!['contact'] as Record<string, unknown>;
    expect(contact['pin']).toEqual({ lat: 12.371532, lng: -1.519931, accuracy: 12 });
    // THE LEAK PROBE: the public order view — anyone holding the link — has
    // no pin key and no coordinate byte.
    const pub = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(`ord-${quoteId}`)}`);
    const bytes = await pub.text();
    expect(pub.status).toBe(200);
    expect(bytes).not.toContain('"pin"');
    expect(bytes).not.toContain('12.371532');
    expect(bytes).not.toContain('-1.519931');
  });

  it('a contact WITHOUT a pin stays byte-exact BC-1a — no pin key appears anywhere', async () => {
    const quoteId = await reservedQuote('0012');
    const { status } = await createOrder('0012', quoteId, {
      phone: '70 12 34 61', quartier: 'Gounghin', repere: 'Portail vert',
    });
    expect(status).toBe(200);
    const row = await dispatchRow(`ord-${quoteId}`);
    const contact = row!['contact'] as Record<string, unknown>;
    expect(Object.keys(contact).sort()).toEqual(['phone', 'quartier', 'repere']);
  });

  it('the wire REFUSES a malformed pin LOUDLY — off-globe, wrong types, smuggled keys, absurd accuracy', async () => {
    const quoteId = await reservedQuote('0013');
    const mauvais: unknown[] = [
      { lat: 91, lng: 0 }, // north of the pole
      { lat: 0, lng: 181 }, // east of the antimeridian
      { lat: '12.3', lng: -1.5 }, // a string pretending
      { lat: 12.3, lng: -1.5, accuracy: -1 }, // negative metres
      { lat: 12.3, lng: -1.5, accuracy: 100_001 }, // beyond the 100 km bound
      { lat: 12.3, lng: -1.5, alt: 300 }, // a key this wire never allowed
      { lat: null, lng: -1.5 }, // what JSON makes of NaN
      [12.3, -1.5], // an array is not a pin
    ];
    for (let i = 0; i < mauvais.length; i += 1) {
      const r = await createOrder(`0013-${i}`, quoteId, {
        phone: '70 12 34 62', quartier: 'Gounghin', repere: 'x', pin: mauvais[i],
      });
      expect(r.status, `pin fixture ${i} was not refused`).toBe(400);
      expect(r.body).toEqual({ error: 'bad_field', field: 'contact' });
    }
  });

  /* ═══ GEO-ACHAT-2 — THE PHONE-ONLY ROAD (founder, 2026-08-31) ═══
   * A CONFIRMED pin stands in for the quartier: the contact may ride with
   * quartier '' and repere '' when a pin is present. Without one, the
   * standing refusal holds — a contact with no quartier and no pin is not
   * an address anyone can ride to. */

  it('SEAM (phone-only): pin + number with EMPTY quartier/repère → stored → the dispatch read serves all four fields as given', async () => {
    const quoteId = await reservedQuote('0014');
    const { status } = await createOrder('0014', quoteId, {
      phone: '70 12 34 63', quartier: '', repere: '',
      pin: { lat: 12.371532, lng: -1.519931, accuracy: 12 },
    });
    expect(status).toBe(200);
    const row = await dispatchRow(`ord-${quoteId}`);
    expect(row).toBeDefined();
    const contact = row!['contact'] as Record<string, unknown>;
    expect(Object.keys(contact).sort()).toEqual(['phone', 'pin', 'quartier', 'repere']);
    expect(contact['phone']).toBe('70 12 34 63');
    expect(contact['quartier']).toBe('');
    expect(contact['repere']).toBe('');
    expect(contact['pin']).toEqual({ lat: 12.371532, lng: -1.519931, accuracy: 12 });
  });

  it('an empty quartier WITHOUT a pin stays refused — the relaxation is the pin’s alone', async () => {
    const quoteId = await reservedQuote('0015');
    const r = await createOrder('0015', quoteId, {
      phone: '70 12 34 64', quartier: '', repere: 'Face à la pharmacie',
    });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'bad_field', field: 'contact' });
  });

  /* ═══ GEO-CARTE-PRO — THE DRAGGED PIN'S SHAPE (accuracy-less) ═══
   * A pin PLACED by hand on the map carries no accuracy — the device never
   * measured one, and inventing metres would be a fiction. This is the exact
   * shape the buyer PWA now sends for a dragged point; the founder's
   * « I do not see the live localization » report (2026-08-31) is closed by
   * proving THIS shape crosses the real Worker to the dispatch read intact. */

  it('SEAM (dragged pin): {lat, lng} with NO accuracy → stored → the dispatch read serves exactly those two keys', async () => {
    const quoteId = await reservedQuote('0016');
    const { status } = await createOrder('0016', quoteId, {
      phone: '70 12 34 65', quartier: '', repere: '',
      pin: { lat: 12.348271, lng: -1.512837 },
    });
    expect(status).toBe(200);
    const row = await dispatchRow(`ord-${quoteId}`);
    expect(row).toBeDefined();
    const contact = row!['contact'] as Record<string, unknown>;
    // Exactly her two coordinates — no accuracy key invented on the way.
    expect(contact['pin']).toEqual({ lat: 12.348271, lng: -1.512837 });
    expect(Object.keys(contact['pin'] as Record<string, unknown>).sort()).toEqual(['lat', 'lng']);
  });
});

/**
 * ═══ F-64 (AUDIT-SHOP-2) — TWO CREATES IN ONE WINDOW, ON THE REAL OBJECT ═══
 *
 * `create()` decides on reads taken before two awaits that are NOT storage —
 * the attribution-lock subrequest and the note's upload — and a Durable
 * Object's input gate holds other requests only across storage awaits. So a
 * second create for the same quote under a fresh command id (a double tap, a
 * lost first response) can enter in that window, read the same « no order
 * yet », and both write: two charge attempts under ONE leg key, the second's
 * log written over the first's, the record's attempt id absent from its own
 * log. The audit reasoned it and left it unpinned; this suite can hold the
 * upload open from OUTSIDE the Worker (the certified media door above), which
 * makes the window as wide as the test needs. Written RED first: on the code
 * as the audit found it, the record held TWO attempts.
 */
async function auditDe(orderId: string) {
  const ns = await mf.getDurableObjectNamespace('ORDER');
  const res = await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit');
  return (await res.json()) as {
    chain?: Record<string, string>;
    attempts?: { attemptId: string; providerKey: string; outcome: string }[];
  };
}

async function creerSous(quoteId: string, holderRef: string, commandId: string, contact: Record<string, unknown>) {
  const res = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId, holderRef, commandId, contact }),
  });
  return { status: res.status, body: safeJson(await res.text()) };
}

describe('F-64 — two creates in the same window birth ONE order and ONE charge, and the record names its own attempt', () => {
  it('the media door holds both uploads until both have arrived; the second create answers the order AS IT STANDS — one attempt, its id on the journey', async () => {
    const note = webmNote();
    const quoteId = await reservedQuote('0064');
    const holderRef = 'holder-0064';
    const orderId = `ord-${quoteId}`;
    // A barrier that opens once TWO uploads are inside the door.
    let arrivees = 0;
    let ouvrir: () => void = () => {};
    const ouverte = new Promise<void>((resolve) => { ouvrir = resolve; });
    barriereMedia = async () => {
      arrivees += 1;
      if (arrivees >= 2) ouvrir();
      await ouverte;
    };
    try {
      const contact = { phone: '70 12 34 64', quartier: 'Gounghin', repere: 'Face à la mosquée', audioB64: b64(note) };
      const [a, b] = await Promise.all([
        creerSous(quoteId, holderRef, 'cmd-order-0064-a', contact),
        creerSous(quoteId, holderRef, 'cmd-order-0064-b', contact),
      ]);
      expect(arrivees, 'both creates reached the upload — the window was open for both').toBe(2);
      for (const r of [a, b]) {
        expect(r.status, JSON.stringify(r.body)).toBe(200);
        expect(r.body['orderId']).toBe(orderId);
        expect(r.body['state']).toBe('payment_pending');
      }
      // THE OBSERVABLE, FROM OUTSIDE: a first birth names its note (« gardée »);
      // « the order as it stands » does not — the order carries the WINNER's
      // note, and the loser's upload is the best-effort orphan it always was.
      // Two « gardée » answers are two births: the second wrote its log over
      // the first's and charged the leg again, and nothing the record shows
      // afterwards can tell — the overwrite is self-consistent (both attempts
      // asserted below hold on the overwritten record too). This line is the
      // one that went red on the code as the audit found it.
      expect([a, b].filter((r) => r.body['noteVocale'] === 'gardee'), 'exactly one birth').toHaveLength(1);
      const record = await auditDe(orderId);
      expect(record.attempts, 'one leg, one attempt — never two collections').toHaveLength(1);
      expect(record.attempts![0]!.outcome).toBe('accepted');
      // The journey's own attempt id is the one on the record: a log written
      // over by a second birth would name an attempt the record never held.
      expect(record.chain!['payment_attempt_id']).toBe(record.attempts![0]!.attemptId);
    } finally {
      barriereMedia = null;
    }
  });
});
