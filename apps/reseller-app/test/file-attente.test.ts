import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileAttente, MAX_FAUTES, type QueueEntry, type QueueStore, type Verdict } from '../src/offline/queue';

/**
 * FILE-ATTENTE-1 (AUDIT-SHOP-2 F-17b) — the outbox proven BY EXECUTION.
 *
 * The store is a REAL on-disk file (Node fs): a fresh `FileAttente.ouvrir()`
 * over the same path is a genuine COLD BOOT — it reads bytes another instance
 * wrote, exactly as the app's Expo document store reads across an app-kill or
 * a reboot. Nothing is shared in memory between « runs »; the durability IS
 * the file. (The Expo adapter's read/write contract is the one
 * `src/identity/expoStore.ts` already ships on.)
 */

const dirs: string[] = [];
function storeSur(path: string): QueueStore {
  return {
    async read() {
      return existsSync(path) ? readFileSync(path, 'utf8') : null;
    },
    async write(data) {
      writeFileSync(path, data);
    },
  };
}
function disque(): { store: QueueStore; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'fa-'));
  dirs.push(dir);
  const path = join(dir, 'file-attente.json');
  return { store: storeSur(path), path };
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const publie = (pid: string, markup = 0): Readonly<Record<string, unknown>> => ({
  storefrontId: 'SF', resellerId: 'RS', productVersionId: pid, markup, correlationId: 'corr',
});
const livre = async (): Promise<Verdict> => ({ kind: 'delivered' });

describe('D17 — survival across app-kill + reboot (EXECUTED)', () => {
  it('intents kept offline are STILL PENDING, in order, on a cold boot — then deliver and LEAVE the file', async () => {
    const { store, path } = disque();
    // run 1: three adds with no network; the OS kills the app before any lands
    const q1 = await FileAttente.ouvrir(store);
    await q1.deposer('listing.publish', 'p1', publie('p1'));
    await q1.deposer('listing.publish', 'p2', publie('p2', 500));
    await q1.deposer('listing.remove', 'p3', { storefrontId: 'SF', pid: 'p3' });
    expect(existsSync(path)).toBe(true);

    // run 2: COLD BOOT — a fresh outbox over the same file
    const q2 = await FileAttente.ouvrir(storeSur(path));
    expect(q2.enAttente().map((e) => [e.name, e.pid])).toEqual([
      ['listing.publish', 'p1'], ['listing.publish', 'p2'], ['listing.remove', 'p3'],
    ]);
    expect(q2.enAttente()[1]?.payload['markup'], 'the payload rode the file byte for byte').toBe(500);
    expect(q2.tout().every((e) => e.status === 'pending'), 'no success was invented over the reboot').toBe(true);

    const envoyes: string[] = [];
    const bilan = await q2.rejouer(async (e) => {
      envoyes.push(e.pid);
      return { kind: 'delivered' };
    });
    expect(envoyes).toEqual(['p1', 'p2', 'p3']);
    expect(bilan).toEqual({ livres: 3, refuses: 0, restants: 0, arret: 'aucun' });
    // delivered intents are GONE from the file — the outcome lives on the service
    const q3 = await FileAttente.ouvrir(storeSur(path));
    expect(q3.tout()).toEqual([]);
  });

  it('a kill mid-replay: the delivered one is not re-sent, the rest survive', async () => {
    const { store, path } = disque();
    const q1 = await FileAttente.ouvrir(store);
    await q1.deposer('listing.publish', 'p1', publie('p1'));
    await q1.deposer('listing.publish', 'p2', publie('p2'));
    // p1 lands, then the network dies on p2 — the pass halts there
    const bilan = await q1.rejouer(async (e) => (e.pid === 'p1' ? { kind: 'delivered' } : { kind: 'unreachable' }));
    expect(bilan).toEqual({ livres: 1, refuses: 0, restants: 1, arret: 'reseau' });
    // (app killed) — cold boot: only p2 is pending, and p1 never sends again
    const q2 = await FileAttente.ouvrir(storeSur(path));
    expect(q2.enAttente().map((e) => e.pid)).toEqual(['p2']);
    const envoyes: string[] = [];
    await q2.rejouer(async (e) => {
      envoyes.push(e.pid);
      return { kind: 'delivered' };
    });
    expect(envoyes).toEqual(['p2']);
  });

  it('an EMPTY store opens empty; a corrupt blob opens empty rather than crashing', async () => {
    const { store, path } = disque();
    expect((await FileAttente.ouvrir(store)).tout()).toEqual([]);
    writeFileSync(path, '{not json at all');
    expect((await FileAttente.ouvrir(storeSur(path))).tout()).toEqual([]);
    // a blob of the wrong shape (a future version, a foreign file) is refused too
    writeFileSync(path, JSON.stringify({ version: 2, entries: [{ name: 'listing.publish', pid: 'x', payload: {}, status: 'pending', attempts: 0, enqueuedAt: 1 }] }));
    expect((await FileAttente.ouvrir(storeSur(path))).tout()).toEqual([]);
  });
});

describe('ONE INTENT PER PRODUCT — her last word wins', () => {
  it('« Ajouter » then « Retirer » on the same product while offline leaves ONE pending intent: the removal', async () => {
    const { store } = disque();
    const q = await FileAttente.ouvrir(store);
    await q.deposer('listing.publish', 'p1', publie('p1'));
    await q.deposer('listing.remove', 'p1', { storefrontId: 'SF', pid: 'p1' });
    expect(q.tout().map((e) => e.name)).toEqual(['listing.remove']);
  });

  it('a marge moved on a pending add REPLACES the payload (the replay must sign what she reads)', async () => {
    const { store, path } = disque();
    const q = await FileAttente.ouvrir(store);
    await q.deposer('listing.publish', 'p1', publie('p1', 0));
    await q.deposer('listing.publish', 'p1', publie('p1', 1_500));
    expect(q.enAttente()).toHaveLength(1);
    expect(q.enAttente()[0]?.payload['markup']).toBe(1_500);
    // …and it is the 1 500 that survives the reboot
    expect((await FileAttente.ouvrir(storeSur(path))).enAttente()[0]?.payload['markup']).toBe(1_500);
  });

  it('a NEW intent on a product whose last one FAILED replaces the failure', async () => {
    const { store } = disque();
    const q = await FileAttente.ouvrir(store);
    await q.deposer('listing.publish', 'p1', publie('p1', 9_000));
    await q.rejouer(async () => ({ kind: 'refused', reason: 'markup_over_cap' }));
    expect(q.echecs().map((e) => e.failureReason)).toEqual(['markup_over_cap']);
    await q.deposer('listing.publish', 'p1', publie('p1', 500));
    expect(q.echecs()).toEqual([]);
    expect(q.enAttente().map((e) => e.payload['markup'])).toEqual([500]);
  });

  it('« Annuler » drops the intent for that product and persists the drop', async () => {
    const { store, path } = disque();
    const q = await FileAttente.ouvrir(store);
    await q.deposer('listing.publish', 'p1', publie('p1'));
    await q.deposer('listing.publish', 'p2', publie('p2'));
    await q.abandonner('p1');
    expect(q.enAttente().map((e) => e.pid)).toEqual(['p2']);
    expect((await FileAttente.ouvrir(storeSur(path))).enAttente().map((e) => e.pid)).toEqual(['p2']);
  });
});

describe('VERDICTS — the network never expires an intent; only the service can refuse one', () => {
  it('UNREACHABLE halts the pass, counts NOTHING, and the entry is still pending after any number of passes', async () => {
    const { store } = disque();
    const q = await FileAttente.ouvrir(store);
    await q.deposer('listing.publish', 'p1', publie('p1'));
    await q.deposer('listing.publish', 'p2', publie('p2'));
    let appels = 0;
    for (let i = 0; i < MAX_FAUTES + 3; i++) {
      const bilan = await q.rejouer(async () => {
        appels += 1;
        return { kind: 'unreachable' };
      });
      expect(bilan.arret).toBe('reseau');
    }
    // one send per pass — the pass HALTED at p1 every time, p2 was never tried
    expect(appels).toBe(MAX_FAUTES + 3);
    expect(q.enAttente().map((e) => [e.pid, e.attempts])).toEqual([['p1', 0], ['p2', 0]]);
    expect(q.echecs()).toEqual([]);
  });

  it('SESSION halts the pass and counts nothing — the entry waits for her to sign in again', async () => {
    const { store } = disque();
    const q = await FileAttente.ouvrir(store);
    await q.deposer('listing.publish', 'p1', publie('p1'));
    const bilan = await q.rejouer(async () => ({ kind: 'session' }));
    expect(bilan).toEqual({ livres: 0, refuses: 0, restants: 1, arret: 'session' });
    expect(q.enAttente()[0]?.attempts).toBe(0);
  });

  it('a NAMED refusal fails the entry at once with the reason kept — and the pass goes on to the next', async () => {
    const { store } = disque();
    const q = await FileAttente.ouvrir(store);
    await q.deposer('listing.publish', 'p1', publie('p1', 9_000));
    await q.deposer('listing.publish', 'p2', publie('p2'));
    const bilan = await q.rejouer(async (e) => (e.pid === 'p1' ? { kind: 'refused', reason: 'markup_over_cap' } : { kind: 'delivered' }));
    expect(bilan).toEqual({ livres: 1, refuses: 1, restants: 0, arret: 'aucun' });
    const echec = q.echecs()[0] as QueueEntry;
    expect(echec.pid).toBe('p1');
    expect(echec.failureReason).toBe('markup_over_cap');
    expect(q.tout(), 'the refusal is STILL in the file — nothing silently dropped').toHaveLength(1);
  });

  it(`a service FAULT counts one attempt and halts; ${MAX_FAUTES} of them name the entry failed`, async () => {
    const { store, path } = disque();
    const q = await FileAttente.ouvrir(store);
    await q.deposer('listing.publish', 'p1', publie('p1'));
    await q.deposer('listing.publish', 'p2', publie('p2'));
    for (let i = 1; i < MAX_FAUTES; i++) {
      const bilan = await q.rejouer(async () => ({ kind: 'fault', reason: 'http_503' }));
      expect(bilan.arret).toBe('service');
      expect(q.enAttente()[0]?.attempts).toBe(i);
    }
    // the count survives a reboot — a fault seen before the kill still counts
    const q2 = await FileAttente.ouvrir(storeSur(path));
    expect(q2.enAttente()[0]?.attempts).toBe(MAX_FAUTES - 1);
    const dernier = await q2.rejouer(async () => ({ kind: 'fault', reason: 'http_503' }));
    expect(dernier.refuses).toBe(1);
    expect(q2.echecs().map((e) => [e.pid, e.failureReason])).toEqual([['p1', 'http_503']]);
    // p2 was never tried in any of those passes — the halt protected it from burning attempts
    expect(q2.enAttente().map((e) => [e.pid, e.attempts])).toEqual([['p2', 0]]);
  });
});
