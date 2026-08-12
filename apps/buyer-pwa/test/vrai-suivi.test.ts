import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  COMMANDE_CLE, LECTURE_COMMANDE_TIMEOUT_MS, commandeGardee, garderCommande, httpQuotePort,
  oublierCommande, type QuotePort,
} from '../src/cliente/quote-port';
import {
  CODE_REMISE, SUIVI, SUIVI_STEPS, codeAffiche, etapeDeSuivi, renderC10, renderC7, renderC9,
} from '../src/cliente/screens';
import { SUIVI_LIVRAISON_MS, SUIVI_PAIEMENT_MS, attenteLivraison } from '../src/cliente/flow';

/**
 * VRAI-SUIVI-PWA — the buyer's tracking becomes real, and her code becomes hers.
 *
 * These EXECUTE the code (the cliente-quote-wire idiom): the step derivation,
 * the marks' reading at the wire boundary, the remise port's four outcomes, the
 * localStorage record, and the two renderers' real variants. The seam itself —
 * the real bundle polling a scripted service in a real browser — lives in
 * e2e/checkout-real.spec.ts, because a unit test cannot prove a port is CALLED.
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
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

/** A `localStorage` that works, in a Node test. */
function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, v); },
  } as Storage;
}

const ISO = '2026-08-10T09:00:00.000Z';
const ORDRE_BASE = { orderId: 'ord-1', state: 'confirmed', amountPaidAtCheckout: 12_500, amountDueAtDelivery: 0, doorLeg: 'none' };

/* ═══════════════ 1 · the step derives from FACTS, and only facts ══════════ */

describe('etapeDeSuivi — the current step is the furthest PROVEN fact', () => {
  it('no marks at all ⇒ step 1 — the order exists, and that is all it claims', () => {
    expect(etapeDeSuivi({})).toBe(1);
    expect(etapeDeSuivi({ livree: false })).toBe(1);
  });

  it('each fact proves exactly its step: accepted→2, ready→3, departed→4, arrived→5, livree→6', () => {
    expect(etapeDeSuivi({ acceptedAt: ISO })).toBe(2);
    expect(etapeDeSuivi({ acceptedAt: ISO, readyAt: ISO })).toBe(3);
    expect(etapeDeSuivi({ acceptedAt: ISO, readyAt: ISO, departedAt: ISO })).toBe(4);
    expect(etapeDeSuivi({ acceptedAt: ISO, readyAt: ISO, departedAt: ISO, arrivedAt: ISO })).toBe(5);
    expect(etapeDeSuivi({ acceptedAt: ISO, readyAt: ISO, departedAt: ISO, arrivedAt: ISO, livree: true })).toBe(6);
  });

  it('a LATER fact wins even when an earlier one is absent — absence never subtracts from proof', () => {
    // The rider tapped « Je suis arrivé » on an order whose departure was never
    // recorded: the arrival is proven, so the step is 5.
    expect(etapeDeSuivi({ arrivedAt: ISO })).toBe(5);
    expect(etapeDeSuivi({ readyAt: ISO })).toBe(3);
    expect(etapeDeSuivi({ livree: true })).toBe(6);
  });

  it('ABSENCE NEVER ADVANCES — every step above the last fact stays unreached', () => {
    // Ten Laws #7: queued = pending, never done. There is no input with no
    // arrival fact that can yield 5 or 6.
    expect(etapeDeSuivi({ acceptedAt: ISO, readyAt: ISO, departedAt: ISO })).toBeLessThan(5);
    expect(etapeDeSuivi({ acceptedAt: ISO })).toBeLessThan(3);
  });

  it('livree must be the literal true — a truthy string proves nothing', () => {
    expect(etapeDeSuivi({ livree: 'true' as unknown as boolean })).toBe(1);
  });
});

/* ═══════════ 2 · the marks cross the wire, and a bad one dies alone ═══════ */

describe('readOrder (via the real port) — marks carried verbatim, malformed marks dropped INDIVIDUALLY', () => {
  const lire = (body: unknown) =>
    withFetch(
      (async () => jsonRes(body)) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').orderState('ord-1'),
    );

  it('valid ISO marks and livree:true ride the order read', async () => {
    const got = await lire({ ...ORDRE_BASE, acceptedAt: ISO, readyAt: ISO, departedAt: ISO, arrivedAt: ISO, livree: true });
    expect(got.status).toBe('order');
    if (got.status !== 'order') return;
    expect(got.order.acceptedAt).toBe(ISO);
    expect(got.order.readyAt).toBe(ISO);
    expect(got.order.departedAt).toBe(ISO);
    expect(got.order.arrivedAt).toBe(ISO);
    expect(got.order.livree).toBe(true);
  });

  it('a GARBAGE mark is dropped ALONE — its neighbours and the payment truth survive', async () => {
    const got = await lire({ ...ORDRE_BASE, acceptedAt: 'pas-une-date', readyAt: ISO });
    expect(got.status).toBe('order');
    if (got.status !== 'order') return;
    expect(got.order.acceptedAt, 'a malformed mark travelled').toBeUndefined();
    expect(got.order.readyAt, 'the valid neighbour died with it').toBe(ISO);
    expect(got.order.state).toBe('confirmed');
    // …and the dropped mark UNDERSTATES: readyAt still proves step 3.
    expect(etapeDeSuivi(got.order)).toBe(3);
  });

  it('non-string marks and non-boolean livree are dropped — never coerced', async () => {
    const got = await lire({ ...ORDRE_BASE, arrivedAt: 12345, departedAt: '', livree: 'oui' });
    expect(got.status).toBe('order');
    if (got.status !== 'order') return;
    expect(got.order.arrivedAt).toBeUndefined();
    expect(got.order.departedAt).toBeUndefined();
    expect(got.order.livree).toBeUndefined();
  });

  it('buyerRef rides the CREATE answer verbatim; an empty one is silence', async () => {
    const port = httpQuotePort('https://svc.example');
    const created = await withFetch(
      (async () => jsonRes({ ...ORDRE_BASE, state: 'payment_pending', buyerRef: 'ref-abc' })) as unknown as typeof fetch,
      () => port.order('quote-1', 'cmd-1', 'holder-1'),
    );
    expect(created.status).toBe('order');
    if (created.status !== 'order') return;
    expect(created.order.buyerRef).toBe('ref-abc');
    const sans = await withFetch(
      (async () => jsonRes({ ...ORDRE_BASE, buyerRef: '' })) as unknown as typeof fetch,
      () => port.orderState('ord-1'),
    );
    expect(sans.status).toBe('order');
    if (sans.status !== 'order') return;
    expect(sans.order.buyerRef).toBeUndefined();
  });
});

describe('orderState — the ONE self-scheduled read is bounded in time', () => {
  /**
   * Shipped untested and named in the verification audit; closed here. The
   * delivery watch schedules its next rung from this promise, so a socket that
   * never settles used to freeze the tracking screen with no timer, no failure
   * and nothing to press. The bound: an AbortController fires at
   * LECTURE_COMMANDE_TIMEOUT_MS and the read answers `unreachable` — a failed
   * read, never a failed delivery.
   *
   * The fake fetch below settles ONLY when its signal aborts. If the abort is
   * ever removed, this promise never resolves and the test fails by timeout —
   * which is exactly the frozen screen, reproduced in miniature.
   */
  it('a read that hangs is ABANDONED at the bound and answers unreachable', async () => {
    vi.useFakeTimers();
    try {
      const pendu: typeof fetch = ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })) as unknown as typeof fetch;
      const enCours = withFetch(pendu, () => httpQuotePort('https://svc.example').orderState('ord-pendu'));
      await vi.advanceTimersByTimeAsync(LECTURE_COMMANDE_TIMEOUT_MS);
      expect(await enCours).toEqual({ status: 'unreachable' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a SLOW read that lands inside the bound is NOT aborted — twelve seconds is slow, not broken', async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const lent: typeof fetch = ((_url: string, init?: RequestInit) =>
        new Promise((resolve) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
          });
          setTimeout(() => resolve(jsonRes(ORDRE_BASE)), LECTURE_COMMANDE_TIMEOUT_MS - 1_000);
        })) as unknown as typeof fetch;
      const enCours = withFetch(lent, () => httpQuotePort('https://svc.example').orderState('ord-lent'));
      await vi.advanceTimersByTimeAsync(LECTURE_COMMANDE_TIMEOUT_MS + 1_000);
      const got = await enCours;
      expect(got.status).toBe('order');
      expect(aborted, 'the stall timer must be CLEARED by a read that lands').toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ═══════════ 3 · the remise port — URL, Bearer, four outcomes ═════════════ */

describe('httpQuotePort.remise — GET with her bearer ref, four honest outcomes', () => {
  it('asks the remise route with Authorization: Bearer <buyerRef> and no body', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const got = await withFetch(
      (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return jsonRes({ ok: true, code: '123456' });
      }) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example/').remise('ord-1', 'ref-abc'),
    );
    expect(seen?.url).toBe('https://svc.example/checkout/order/ord-1/remise');
    expect(seen?.init.method).toBe('GET');
    expect((seen?.init.headers as Record<string, string>)['Authorization']).toBe('Bearer ref-abc');
    expect(seen?.init.body).toBeUndefined();
    expect(got).toEqual({ status: 'code', code: '123456' });
  });

  it('the uniform `{ok:false}` 404 is a NAMELESS refusal — the service explains nothing on purpose', async () => {
    const got = await withFetch(
      (async () => jsonRes({ ok: false }, 404)) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').remise('ord-1', 'ref-abc'),
    );
    expect(got).toEqual({ status: 'refused' });
  });

  it('a thrown fetch is `unreachable` — the only outcome « Pas de connexion » could be true of', async () => {
    const got = await withFetch(
      (async () => { throw new Error('no route'); }) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').remise('ord-1', 'ref-abc'),
    );
    expect(got).toEqual({ status: 'unreachable' });
  });

  it('an answer that is not the contract is `unreadable` — a 200 without a code, a 404 without the shape', async () => {
    const sansCode = await withFetch(
      (async () => jsonRes({ ok: true })) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').remise('ord-1', 'ref-abc'),
    );
    expect(sansCode).toEqual({ status: 'unreadable' });
    const html500 = await withFetch(
      (async () => ({ ok: false, status: 500, json: async () => { throw new Error('html'); } }) as unknown as Response) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').remise('ord-1', 'ref-abc'),
    );
    expect(html500).toEqual({ status: 'unreadable' });
  });

  it('a URL the browser refuses to build is `unreadable`, and NO request goes out (the reserve law)', async () => {
    let asks = 0;
    const got = await withFetch(
      (async () => { asks += 1; return jsonRes({}); }) as unknown as typeof fetch,
      () => httpQuotePort('https://svc.example').remise('\uD800', 'ref-abc'), // lone surrogate
    );
    expect(got).toEqual({ status: 'unreadable' });
    expect(asks, 'a request the browser could not construct was still sent').toBe(0);
  });
});

/* ═══════════ 4 · the phone's memory of her order ══════════════════════════ */

describe('sp-commande:v1 — one slot, newest wins, garbage reads as nothing', () => {
  it('stores {orderId, buyerRef, at} and reads it back', () => {
    const s = memStorage();
    garderCommande({ orderId: 'ord-1', buyerRef: 'ref-1', at: ISO }, s);
    expect(commandeGardee(s)).toEqual({ orderId: 'ord-1', buyerRef: 'ref-1', at: ISO });
    expect(s.getItem(COMMANDE_CLE)).not.toBeNull();
  });

  it('newest wins — one order at pilot scale', () => {
    const s = memStorage();
    garderCommande({ orderId: 'ord-1', buyerRef: 'ref-1', at: ISO }, s);
    garderCommande({ orderId: 'ord-2', buyerRef: 'ref-2', at: ISO }, s);
    expect(commandeGardee(s)?.orderId).toBe('ord-2');
  });

  it('« C’est terminé » clears the slot', () => {
    const s = memStorage();
    garderCommande({ orderId: 'ord-1', buyerRef: 'ref-1', at: ISO }, s);
    oublierCommande(s);
    expect(commandeGardee(s)).toBeUndefined();
    expect(s.getItem(COMMANDE_CLE)).toBeNull();
  });

  it('a malformed or half-written record is NOTHING — never a tracking that cannot poll', () => {
    const s = memStorage();
    for (const bad of ['not json', '42', 'null', '{}', '{"orderId":"ord-1"}', '{"orderId":"","buyerRef":"r","at":"t"}', '{"orderId":"o","buyerRef":"","at":"t"}']) {
      s.setItem(COMMANDE_CLE, bad);
      expect(commandeGardee(s), bad).toBeUndefined();
    }
  });

  it('a dead storage is tolerated everywhere — best-effort, never a crash', () => {
    const dead = {
      getItem: () => { throw new Error('quota'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('quota'); },
    } as unknown as Storage;
    expect(() => garderCommande({ orderId: 'o', buyerRef: 'r', at: ISO }, dead)).not.toThrow();
    expect(commandeGardee(dead)).toBeUndefined();
    expect(() => oublierCommande(dead)).not.toThrow();
    // …and no storage at all is the same non-event.
    expect(commandeGardee(undefined)).toBeUndefined();
    expect(() => garderCommande({ orderId: 'o', buyerRef: 'r', at: ISO }, undefined)).not.toThrow();
  });
});

/* ═══════════ 5 · the code's display shape ═════════════════════════════════ */

describe('codeAffiche — a code, not an amount', () => {
  it('six digits pair as « 123 456 » with a plain space', () => {
    expect(codeAffiche('123456')).toBe('123 456');
  });
  it('any other shape passes through untouched — reformatting an unknown code is inventing one', () => {
    for (const raw of ['12345', '1234567', 'AB1234', '']) expect(codeAffiche(raw)).toBe(raw);
  });
});

/* ═══════════ 6 · C7 real — facts on screen, simulation unrenderable ═══════ */

describe('renderC7 réel — the real timeline', () => {
  const REEL = { step: 2, problem: false, demo: true, reel: true, commande: 'ord-abc-123' };

  it('« Simuler » is UNRENDERABLE on the real path, whatever the demo flag says', () => {
    // `demo: true` is the DEFAULT every real mount inherits — that default is
    // exactly how the button reached a real buyer. `reel` must beat it.
    for (let step = 1; step <= 4; step += 1) {
      expect(renderC7({ ...REEL, step })).not.toContain('data-action="simuler"');
    }
    // …while the demo path keeps its documented lever.
    expect(renderC7({ step: 2, problem: false, demo: true })).toContain('data-action="simuler"');
  });

  it('the corner chip is the REAL order id — CMD-2417 is dead, and no id means no chip', () => {
    const html = renderC7(REEL);
    expect(html).toContain('ord-abc-123');
    expect(html).not.toContain('CMD-2417');
    expect(renderC7({ step: 2, problem: false, demo: true })).not.toContain('CMD-2417');
    expect(renderC7({ step: 2, problem: false, demo: true })).not.toContain('cl-cmd');
  });

  it('arrivedAt ⇒ « Voir mon code »; before it, no code affordance exists', () => {
    expect(renderC7({ ...REEL, step: 5, voirCode: true })).toContain('data-action="voir-code"');
    expect(renderC7({ ...REEL, step: 4 })).not.toContain('data-action="voir-code"');
  });

  it('« Je suis à la porte » needs the live checkout handle — the re-entry withholds it', () => {
    expect(renderC7({ ...REEL, step: 5, porte: true })).toContain('data-action="porte"');
    expect(renderC7({ ...REEL, step: 5, porte: false })).not.toContain('data-action="porte"');
  });

  it('the ladder’s end offers « Vérifier à nouveau »; a dead link is SAID; livree offers « C’est terminé »', () => {
    expect(renderC7({ ...REEL, relance: true })).toContain('data-action="verifier-suivi"');
    expect(renderC7(REEL)).not.toContain('data-action="verifier-suivi"');
    expect(renderC7({ ...REEL, horsPortee: true })).toContain(SUIVI.horsPortee);
    expect(renderC7({ ...REEL, step: 6, terminee: true })).toContain('data-action="suivi-terminer"');
    expect(renderC7({ ...REEL, step: 6 })).not.toContain('data-action="suivi-terminer"');
  });

  it('the false promises are gone: no « nous vous prévenons », and readyAt claims « prête », never « scellée »', () => {
    const html = renderC7(REEL);
    expect(html.toLowerCase()).not.toContain('prévenons');
    expect(SUIVI_STEPS[2]!.t).toBe('Prête chez la vendeuse');
    expect(SUIVI_STEPS[2]!.t.toLowerCase()).not.toContain('scellée');
    expect(SUIVI_STEPS[2]!.d.toLowerCase()).not.toContain('scellé');
    // the steps render FROM the linted table, so demo and real say one thing
    for (const st of SUIVI_STEPS) expect(html).toContain(st.t);
  });
});

/* ═══════════ 7 · C9 real — the service’s code, or the honest wait ═════════ */

describe('renderC9 réel — her code, from the remise route only', () => {
  it('with the service’s code: shown big, paired, and the demo constant nowhere', () => {
    const html = renderC9({ revealed: true, reel: true, code: '123456', arrivee: true });
    expect(html).toContain('>123 456</div>');
    expect(html).not.toContain(CODE_REMISE);
    expect(html).not.toContain('data-role="code-demo"');
  });

  it('before arrival: the honest waiting card — the code appears at ARRIVAL, never a payment claim', () => {
    const html = renderC9({ revealed: false, reel: true, arrivee: false });
    expect(html).toContain('data-role="code-cache"');
    expect(html).toContain(SUIVI.c9Attente);
    expect(html).not.toContain('confirmé par l’opérateur');
    expect(html).not.toContain(CODE_REMISE);
    expect(html).not.toContain('data-action="verifier-code"');
  });

  it('arrived but no code yet: the rider-is-there card, with ONE manual retry', () => {
    const html = renderC9({ revealed: false, reel: true, arrivee: true });
    expect(html).toContain(SUIVI.c9Arrivee);
    expect(html).toContain('data-action="verifier-code"');
    expect(html).not.toContain(CODE_REMISE);
  });

  it('the REAL revealed card ignores `revealed` without a code — only the service can fill the figure', () => {
    // Belt over the flow's wiring: even a lying `revealed: true` renders the
    // waiting card when no code exists, because the real figure IS the code.
    const html = renderC9({ revealed: true, reel: true, arrivee: false });
    expect(html).toContain('data-role="code-cache"');
    expect(html).not.toContain('data-role="code-revele"');
  });

  it('the demo keeps its pixel code and now SAYS it is a demonstration', () => {
    const html = renderC9({ revealed: true });
    expect(html).toContain(CODE_REMISE);
    expect(html).toContain('data-role="code-demo"');
    expect(html).toContain(SUIVI.codeDemo);
  });
});

/* ═══════════ 8 · call-site pins (the BC-1b idiom) ═════════════════════════ */

describe('[source-text checks] the flow wires the real tracking, not just declares it', () => {
  const flow = readFileSync(join(import.meta.dirname, '..', 'src/cliente/flow.ts'), 'utf8');

  it('the CREATE stores {orderId, buyerRef, at} — the re-entry record is written where the ref is born', () => {
    expect(flow).toContain('garderCommande(');
    expect(flow).toMatch(/orderId: r\.order\.orderId, buyerRef: r\.order\.buyerRef/);
  });

  it('a tracking read that observes arrivedAt fetches the code — the port is CALLED, not merely present', () => {
    expect(flow).toMatch(/state\.marques\.arrivedAt !== undefined && state\.codeRemise === null\) demanderLeCode\(\);/);
  });

  it('every road into C7 restarts the watch: suivre, retour-c7, signalement, and the re-entry mount', () => {
    const sites = flow.match(/demarrerSuivi\(\);/g) ?? [];
    expect(sites.length).toBeGreaterThanOrEqual(4);
  });

  it('« C’est terminé » clears the phone’s memory of the order', () => {
    expect(flow).toMatch(/case 'suivi-terminer':\s*[\s\S]{0,400}oublierCommande\(localStorageOrUndefined\(\)\)/);
  });
});

/**
 * ═══ LE SUIVI NE S'ARRÊTE PLUS (founder, 2026-08-12) ═══
 *
 * « le suivi screen there is not updating in real time with product movements. »
 *
 * THE CAUSE: the delivery watch reused the PAYMENT ladder — six reads over about
 * thirty-five seconds, then stop. Right for a payment, which confirms in
 * seconds; wrong for a delivery, which takes half an hour. The screen froze
 * almost immediately and every later movement became something she had to ask
 * for by hand.
 *
 * These pin the two halves of the fix by value: it never runs out, and it holds
 * at a cadence that is honest on a 1 GB Android paying for its own data.
 */
describe('suivi de livraison — the ladder ramps, then holds, and never runs out', () => {
  it('RAMPS from a quick first read to a steady cadence', () => {
    expect(SUIVI_LIVRAISON_MS[0], 'the rider accepting is the moment she is watching for').toBeLessThanOrEqual(2_000);
    for (let i = 1; i < SUIVI_LIVRAISON_MS.length; i += 1) {
      expect(SUIVI_LIVRAISON_MS[i]!, `rung ${String(i)} must not be quicker than the one before`)
        .toBeGreaterThanOrEqual(SUIVI_LIVRAISON_MS[i - 1]!);
    }
  });

  it('HOLDS at the last rung instead of running out — this is the whole bug', () => {
    const dernier = SUIVI_LIVRAISON_MS[SUIVI_LIVRAISON_MS.length - 1]!;
    // Past the end of the array is exactly where the old ladder gave up.
    for (const etape of [SUIVI_LIVRAISON_MS.length, 20, 200, 5_000]) {
      expect(attenteLivraison(etape), `read #${String(etape)} still has a next one`).toBe(dernier);
    }
    // …and it is a REAL wait, never zero — a hold at 0 ms is a spin loop, which
    // is the opposite failure and worse than the one being fixed.
    expect(dernier).toBeGreaterThanOrEqual(10_000);
  });

  it('is SLOWER than the payment ladder’s tail — a parcel is not a payment', () => {
    // The distinction the bug erased: the payment watch is allowed to be eager
    // because it ends in seconds. This one runs for the length of a delivery.
    expect(attenteLivraison(99)).toBeGreaterThanOrEqual(SUIVI_PAIEMENT_MS[SUIVI_PAIEMENT_MS.length - 1]!);
  });
});

/**
 * ═══ C10 « MERCI » — the delivery ENDS, on screen (founder, 2026-08-12) ═══
 *
 * « once delivery and everything is confirmé on the buyer's payment pwa … make
 * it close nicely and return to the initial state … and a thank you screen for
 * buyer's pwa. »
 *
 * WHAT IT REPLACED: when `livree` landed, C7 stayed exactly where it was — a
 * six-step timeline — and grew a « C'est terminé » button. The order was over
 * and the screen still read as one being waited for.
 */
describe('C10 — the thank-you screen', () => {
  it('says what happened before it says thank you, and offers ONE action', () => {
    const html = renderC10();
    expect(html).toContain('data-screen="C10"');
    // The FACT, not just the warmth — a thank-you that never names what it is
    // thanking her for is decoration.
    expect(html).toContain('livrée');
    expect(html).toContain(SUIVI.merciTitre);
    // The reassurance the screen provokes: closing it does not close the proof.
    expect(html).toContain(SUIVI.merciPreuve);
    // ONE primary action (§5), wired to the act that forgets the order.
    expect(html).toContain('data-action="suivi-terminer"');
    const actions = html.match(/data-action="/g) ?? [];
    expect(actions, 'exactly one action on the closing screen').toHaveLength(1);
  });

  it('carries NO step timeline — the waiting screen is over', () => {
    // The defect this closes: a finished order rendered as a thing in progress.
    const html = renderC10();
    for (const mot of ['data-screen="C7"', SUIVI.verifier, SUIVI.voirCode]) {
      expect(html, `${mot} belongs to the waiting screen, not the ending`).not.toContain(mot);
    }
  });
});
