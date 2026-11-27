import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileAttente, type QueueStore } from '../src/offline/queue';
import { expoFileAttenteStore } from '../src/offline/expoStore';
import { PhoneMort, fichierBrut, fichiersSous, planterApres, poserFichier, resetFiles } from './doubles/expo-file-system';

/**
 * ═══ HER WAITING LIST SURVIVES A DYING PHONE — and when it cannot, she is
 *     told, and the bytes are kept ═══
 *
 * D17 (docs/PERF-BUDGETS.md): « every queued action survives app-kill AND
 * device reboot ». Law 7: queued is pending, never done — and a list that
 * vanished must never read as « nothing was waiting ».
 *
 * Two halves:
 *   · THE OUTBOX (`FileAttente.ouvrir`) over a REAL on-disk file: bytes that
 *     do not read are reported (`restauree: false`), kept aside under a new
 *     name, never deleted, and a fresh list opens.
 *   · THE PRODUCTION STORE (`expoFileAttenteStore`) over the expo-file-system
 *     double, whose `write` and `move` walk the native order of acts and can
 *     die between them (bounds at the top of the double). The phone dies;
 *     a cold boot reads what is left.
 */

/* ───────────────────────── the outbox, on a real disk ───────────────────────── */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function disque(opts: { garderCasse?: boolean } = {}): { store: QueueStore; path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'fap-'));
  dirs.push(dir);
  const path = join(dir, 'file-attente.json');
  let n = 0;
  return {
    dir,
    path,
    store: {
      async read() {
        return existsSync(path) ? readFileSync(path, 'utf8') : null;
      },
      async write(data) {
        writeFileSync(path, data);
      },
      async garder(data) {
        if (opts.garderCasse === true) throw new Error('disk full');
        writeFileSync(join(dir, `file-attente.perdu-${(n += 1)}.json`), data);
      },
    },
  };
}
const gardes = (dir: string) => readdirSync(dir).filter((f) => f.includes('.perdu-')).sort();

const MOITIE = '{"version":1,"entries":[{"name":"listing.publish","pid":"p1","payl';

describe('ouvrir — bytes that do not read are reported, kept aside, never deleted', () => {
  it('half a JSON: `restauree` is false, the exact bytes sit under a new name, the list is fresh — and the next boot is quiet', async () => {
    const { store, path, dir } = disque();
    writeFileSync(path, MOITIE);
    const q = await FileAttente.ouvrir(store);
    expect(q.restauree, 'the loss is reported').toBe(false);
    expect(q.tout()).toEqual([]);
    const kept = gardes(dir);
    expect(kept, 'the damaged bytes are kept aside, once').toHaveLength(1);
    expect(readFileSync(join(dir, kept[0]!), 'utf8'), 'byte for byte').toBe(MOITIE);
    // A fresh list was written over the damaged one only AFTER the bytes were kept.
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ version: 1, entries: [] });
    // The next boot reads that fresh list: nothing to report, nothing kept again.
    const again = await FileAttente.ouvrir(store);
    expect(again.restauree).toBe(true);
    expect(gardes(dir)).toHaveLength(1);
  });

  it('a blob of the wrong shape (another version) is a loss too: reported and kept', async () => {
    const { store, path, dir } = disque();
    const autre = JSON.stringify({ version: 2, entries: [{ name: 'listing.publish', pid: 'x', payload: {}, status: 'pending', attempts: 0, enqueuedAt: 1 }] });
    writeFileSync(path, autre);
    const q = await FileAttente.ouvrir(store);
    expect(q.restauree).toBe(false);
    expect(q.tout()).toEqual([]);
    expect(readFileSync(join(dir, gardes(dir)[0]!), 'utf8')).toBe(autre);
  });

  it('an EMPTY file (zero bytes) is a loss too: reported, its empty bytes kept aside once, a fresh list — never « nothing was waiting »', async () => {
    const { store, path, dir } = disque();
    writeFileSync(path, '');
    const q = await FileAttente.ouvrir(store);
    expect(q.restauree, 'an empty file is not a list').toBe(false);
    expect(q.tout()).toEqual([]);
    const kept = gardes(dir);
    expect(kept).toHaveLength(1);
    expect(readFileSync(join(dir, kept[0]!), 'utf8')).toBe('');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ version: 1, entries: [] });
    expect((await FileAttente.ouvrir(store)).restauree, 'the next boot is quiet').toBe(true);
  });

  it('nothing written yet, or a list that reads: `restauree` is true and nothing is kept aside', async () => {
    const { store, dir } = disque();
    expect((await FileAttente.ouvrir(store)).restauree).toBe(true);
    const q = await FileAttente.ouvrir(store);
    await q.deposer('listing.publish', 'p1', { markup: 0 });
    const reboot = await FileAttente.ouvrir(store);
    expect(reboot.restauree).toBe(true);
    expect(reboot.tout().map((e) => e.pid)).toEqual(['p1']);
    expect(gardes(dir)).toEqual([]);
  });

  it('the bytes cannot be kept aside: ouvrir REFUSES, and the damaged file is left exactly as it was', async () => {
    const { store, path } = disque({ garderCasse: true });
    writeFileSync(path, MOITIE);
    await expect(FileAttente.ouvrir(store)).rejects.toThrow('disk full');
    expect(readFileSync(path, 'utf8'), 'never overwritten').toBe(MOITIE);
  });
});

/* ───────────────────────── the production store, a dying phone ───────────────────────── */

const MAIN = 'file:///rendu/file-attente.v1.json';
const TMP = `${MAIN}.tmp`;
const liste = (pids: string[]) =>
  JSON.stringify({ version: 1, entries: pids.map((pid, i) => ({ name: 'listing.publish', pid, payload: { markup: 0 }, status: 'pending', attempts: 0, enqueuedAt: i })) });

beforeEach(() => resetFiles());

describe('expoFileAttenteStore — no death can leave her without a whole list', () => {
  it('the phone dies half-way through writing: the cold boot reads the PREVIOUS list, whole', async () => {
    const q = await FileAttente.ouvrir(expoFileAttenteStore());
    await q.deposer('listing.publish', 'p1', { markup: 0 });
    planterApres({ acte: 'write', moitie: true });
    await expect(q.deposer('listing.publish', 'p2', { markup: 0 })).rejects.toBeInstanceOf(PhoneMort);

    const boot = await FileAttente.ouvrir(expoFileAttenteStore());
    expect(boot.restauree, 'nothing was lost').toBe(true);
    expect(boot.tout().map((e) => e.pid)).toEqual(['p1']);
  });

  it('the phone dies after the old list was deleted and before the new one was renamed in: the cold boot reads the new one, from the temporary file', async () => {
    const q = await FileAttente.ouvrir(expoFileAttenteStore());
    await q.deposer('listing.publish', 'p1', { markup: 0 });
    planterApres({ acte: 'delete', cle: /file-attente\.v1\.json$/ });
    await expect(q.deposer('listing.publish', 'p2', { markup: 0 })).rejects.toBeInstanceOf(PhoneMort);
    expect(fichierBrut(MAIN), 'the death left only the temporary file').toBeUndefined();

    const boot = await FileAttente.ouvrir(expoFileAttenteStore());
    expect(boot.restauree).toBe(true);
    expect(boot.tout().map((e) => e.pid)).toEqual(['p1', 'p2']);
  });

  it('only a whole temporary file is left: it is made the list BEFORE any new write, so a second death mid-write cannot take the only good copy', async () => {
    poserFichier(TMP, liste(['p1', 'p2']));
    const q = await FileAttente.ouvrir(expoFileAttenteStore());
    expect(q.tout().map((e) => e.pid)).toEqual(['p1', 'p2']);
    planterApres({ acte: 'write', moitie: true });
    await expect(q.deposer('listing.publish', 'p3', { markup: 0 })).rejects.toBeInstanceOf(PhoneMort);

    const boot = await FileAttente.ouvrir(expoFileAttenteStore());
    expect(boot.restauree, 'the good copy survived the second death').toBe(true);
    expect(boot.tout().map((e) => e.pid)).toEqual(['p1', 'p2']);
  });

  it('the very first write dies right after the native truncation: the cold boot does not read « nothing was waiting » — the loss is said, and a fresh list opens', async () => {
    const q = await FileAttente.ouvrir(expoFileAttenteStore());
    planterApres({ acte: 'write', vide: true });
    await expect(q.deposer('listing.publish', 'p1', { markup: 0 })).rejects.toBeInstanceOf(PhoneMort);
    expect(fichierBrut(TMP), 'the death left an empty temporary file and no list').toBe('');
    expect(fichierBrut(MAIN)).toBeUndefined();

    const boot = await FileAttente.ouvrir(expoFileAttenteStore());
    expect(boot.restauree, 'an empty file is reported').toBe(false);
    expect(boot.tout()).toEqual([]);
    const kept = fichiersSous(`${MAIN}.perdu-`);
    expect(kept).toHaveLength(1);
    expect(fichierBrut(kept[0]!)).toBe('');
  });

  it('with no open at all: a lone whole temporary file and no list, then a write that dies halfway — the list read afterwards is the old whole one', async () => {
    poserFichier(TMP, liste(['p1', 'p2']));
    const store = expoFileAttenteStore();
    planterApres({ acte: 'write', moitie: true });
    await expect(store.write(liste(['p9']))).rejects.toBeInstanceOf(PhoneMort);
    expect(await expoFileAttenteStore().read(), 'the only good copy was moved into place before the write').toBe(liste(['p1', 'p2']));
  });

  it('two keep-asides in the same millisecond: two names, neither overwritten', async () => {
    const store = expoFileAttenteStore();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
    try {
      await store.garder('premier');
      await store.garder('second');
    } finally {
      now.mockRestore();
    }
    const kept = fichiersSous(`${MAIN}.perdu-`);
    expect(kept).toHaveLength(2);
    expect(kept.map((k) => fichierBrut(k)).sort()).toEqual(['premier', 'second']);
  });

  it('damaged bytes are kept aside under a new name in her document folder — and never deleted', async () => {
    poserFichier(MAIN, MOITIE);
    const q = await FileAttente.ouvrir(expoFileAttenteStore());
    expect(q.restauree).toBe(false);
    const kept = fichiersSous('file:///rendu/file-attente.v1.json.perdu-');
    expect(kept).toHaveLength(1);
    expect(fichierBrut(kept[0]!)).toBe(MOITIE);
    await q.deposer('listing.publish', 'p1', { markup: 0 });
    expect(fichierBrut(kept[0]!), 'still there after the next write').toBe(MOITIE);
  });
});
