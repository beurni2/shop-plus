import { describe, expect, it } from 'vitest';
import { httpQuotePort, type ContactLivraison } from '../src/cliente/quote-port';
import { creerEnregistreurNote } from '../src/cliente/voice-note';

/**
 * REPERE-AUDIO-REEL — the note's WIRE and the recorder's honest refusal.
 *
 * These EXECUTE the code (this repo's standard). The full seam — a REAL
 * MediaRecorder against Chromium's fake microphone, riding a real order
 * body — lives in `e2e/checkout-real.spec.ts`; what is pinned here is the
 * port's exact wire shape (the part a unit can hold byte-steady) and the
 * recorder's behaviour on a device with no microphone road at all.
 */

/** Swap `globalThis.fetch` for one run — the `buyer-real-honesty` idiom. */
async function withFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const jsonRes = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;

describe('the order wire — audioB64 rides INSIDE contact, and a ref can never leave this app', () => {
  it('with a note: contact carries exactly {phone, quartier, repere, audioB64}, the bytes verbatim', async () => {
    let sent: Record<string, unknown> | null = null;
    const contact: ContactLivraison = {
      phone: '70 12 34 56', quartier: 'Gounghin', repere: 'Face à la pharmacie', audioB64: 'GkXfow==',
    };
    await withFetch(
      (async (_url: unknown, init?: RequestInit) => {
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonRes({ orderId: 'ord-1', state: 'payment_pending' });
      }) as unknown as typeof fetch,
      () => httpQuotePort('http://s').order('q-1', 'cmd-1', 'holder-1', contact),
    );
    expect(sent).not.toBeNull();
    const body = sent as unknown as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['commandId', 'contact', 'holderRef', 'quoteId']);
    const wired = body['contact'] as Record<string, unknown>;
    expect(Object.keys(wired).sort()).toEqual(['audioB64', 'phone', 'quartier', 'repere']);
    expect(wired['audioB64']).toBe('GkXfow=='); // the very bytes, base64'd, untouched
    expect('audioRef' in wired).toBe(false); // a ref is minted server-side or not at all
  });

  it('without a note: BC-1b exactly as it was — three keys, nothing invented', async () => {
    let sent: Record<string, unknown> | null = null;
    await withFetch(
      (async (_url: unknown, init?: RequestInit) => {
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonRes({ orderId: 'ord-2', state: 'payment_pending' });
      }) as unknown as typeof fetch,
      () => httpQuotePort('http://s').order('q-2', 'cmd-2', 'holder-2', {
        phone: '70 12 34 56', quartier: 'Gounghin', repere: '',
      }),
    );
    const wired = (sent as unknown as Record<string, unknown>)['contact'] as Record<string, unknown>;
    expect(Object.keys(wired).sort()).toEqual(['phone', 'quartier', 'repere']);
  });
});

describe('the create answer — what became of her note travels back, or stays silent', () => {
  const order = (extra: Record<string, unknown>) => ({
    orderId: 'ord-1', state: 'payment_pending', amountPaidAtCheckout: 12_500, amountDueAtDelivery: 0, ...extra,
  });
  const fetchAnswering = (body: unknown): typeof fetch =>
    (async () => jsonRes(body)) as unknown as typeof fetch;

  it('gardee and perdue pass through; anything else is silence, never an invented state', async () => {
    for (const [wire, kept] of [
      ['gardee', 'gardee'], ['perdue', 'perdue'], ['n_importe_quoi', undefined], [undefined, undefined],
    ] as const) {
      const out = await withFetch(fetchAnswering(order(wire !== undefined ? { noteVocale: wire } : {})), () =>
        httpQuotePort('http://s').order('q', 'cmd', 'h'),
      );
      expect(out.status).toBe('order');
      if (out.status === 'order') expect(out.order.noteVocale).toBe(kept);
    }
  });
});

describe('the recorder — a device with no microphone road answers the honest refusal', () => {
  it('no mediaDevices / no MediaRecorder (this Node) → demarrer says refused, arreter says null', async () => {
    const rec = creerEnregistreurNote();
    expect(await rec.demarrer()).toBe('refused');
    expect(await rec.arreter()).toBeNull();
  });
});

describe('LISTE-VOIX — the bitrate request reaches the recorder', () => {
  it('reglages.audioBitsPerSecond rides the MediaRecorder constructor; absent means absent (the checkout unchanged)', async () => {
    // A stub recorder at the NATIVE boundary only (the doubles law): it
    // captures the constructor options — which is the whole claim under
    // test, because the voice bitrate is what keeps a 5-minute note inside
    // the wire's 1.4M-char bound.
    const constructions: (MediaRecorderOptions | undefined)[] = [];
    class FauxRecorder {
      constructor(_stream: unknown, options?: MediaRecorderOptions) {
        constructions.push(options);
      }
      static isTypeSupported(): boolean { return true; }
      addEventListener(): void {}
      start(): void {}
    }
    const held = {
      MediaRecorder: (globalThis as { MediaRecorder?: unknown }).MediaRecorder,
      navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    };
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = FauxRecorder;
    // Node's `navigator` is getter-only — replaced via defineProperty, and
    // the original descriptor restored whole in the finally.
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } },
    });
    try {
      const { creerEnregistreurNote } = await import('../src/cliente/voice-note');
      expect(await creerEnregistreurNote({ audioBitsPerSecond: 24_000 }).demarrer()).toBe('recording');
      expect(constructions[0]?.audioBitsPerSecond).toBe(24_000);
      expect(await creerEnregistreurNote().demarrer()).toBe('recording');
      expect(constructions[1]).not.toHaveProperty('audioBitsPerSecond');
    } finally {
      (globalThis as { MediaRecorder?: unknown }).MediaRecorder = held.MediaRecorder;
      if (held.navigator !== undefined) Object.defineProperty(globalThis, 'navigator', held.navigator);
    }
  });
});
