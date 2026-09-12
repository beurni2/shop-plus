/**
 * FILE-ATTENTE-1 (AUDIT-SHOP-2 F-17b) — THE DURABLE OUTBOX FOR HER VITRINE.
 *
 * D17 (docs/PERF-BUDGETS.md): « every queued action survives app-kill AND
 * device reboot ». Until this slice nothing in this app queued anything — a
 * tap on « Ajouter à ma vitrine » with no network ended in a sentence and the
 * intent was gone with it (the audit measured it: `/listings` throws → one
 * toast, no second POST, ever). So the D17 row measured nothing.
 *
 * WHAT THIS IS: an OUTBOX of her intents for the two Ma Vitrine writes — put a
 * product in her shop, take one out — persisted to an injected store BEFORE
 * the caller is answered, restored on open, replayed in order. Boutik+'s
 * supplier app keeps the same shape (`apps/supplier-app/src/offline/queue.ts`,
 * WO-6.5 · B2.1); this one is written for what THIS app's wire actually does,
 * and differs in three stated ways:
 *
 *   1. ONE INTENT PER PRODUCT — her LAST word wins. « Ajouter » then
 *      « Retirer » on the same product while the network is down is not two
 *      commands to replay in order; it is a change of mind, and a pending
 *      intent was never sent, so dropping it loses nothing. `deposer` therefore
 *      REPLACES any entry for that pid (pending or failed). Boutik+'s
 *      dedupe-by-command-id is the right rule for a true replay of one command;
 *      here the pid is the key and the wire's own command id
 *      (`publish-${listingId}`, derived) already makes a replayed publish
 *      idempotent on the service side.
 *
 *   2. THE NETWORK NEVER EXPIRES AN INTENT. A queue that marked an entry
 *      « failed » after N tries would fail every intent she made on a market
 *      day with no signal — and « failed » must mean the SERVICE refused, never
 *      that the phone was out of reach. So `rejouer` HALTS on the first
 *      unreachable send (the network is down for everyone behind it) and
 *      counts nothing. Only a service FAULT (5xx, 408, 429 — an answer that
 *      decides nothing) counts an attempt, and only `MAX_FAUTES` of those turn
 *      an entry into a named failure; a NAMED refusal (« plafond », « pas de
 *      boutique ») fails it at once, with the reason kept for her screen.
 *
 *   3. DELIVERED ENTRIES LEAVE THE FILE. This is her outbox, not a ledger:
 *      what landed is on the service and is read back from there. Keeping
 *      every delivered intent would grow the file for the life of the phone.
 *      A FAILED entry stays until she drops it (`abandonner`) — nothing that
 *      did not land is ever silently forgotten.
 *
 * VERDICTS, NOT EXCEPTIONS: the app's service port speaks `ServiceResult`
 * (`{ok, reason}`, never a throw up the UI), so the replay callback answers a
 * `Verdict` in the same voice. The pure rule has no idea what a listing is —
 * the caller classifies the wire's reason and this file keeps the book.
 *
 * Storage is INJECTED (`QueueStore`) so the SAME logic runs on Expo's durable
 * document store (the app) and on a real on-disk file (the survival test):
 * durability is proven by execution across instances, never asserted.
 */

export interface QueueStore {
  /** The persisted blob, or null if nothing has been written yet. */
  read(): Promise<string | null>;
  /** Persist the blob (create-or-overwrite; durable across process death). */
  write(data: string): Promise<void>;
}

/** The two intents this outbox carries. Media bytes (a photo, a note) and the
 *  Personnaliser patch are NOT here — stated in the journal, not smuggled. */
export type IntentName = 'listing.publish' | 'listing.remove';

export type EntryStatus = 'pending' | 'failed';

export interface QueueEntry {
  readonly name: IntentName;
  /** The product this intent is about — the ONE key (her last word per pid wins). */
  readonly pid: string;
  /** The intent's OWN facts (JSON-serializable): the marge she chose, the
   *  product's name for the banner. The replay ADDRESSES her shop from the
   *  device's identity at replay time — nothing here names a shop. */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly status: EntryStatus;
  /** Service FAULTS seen so far (never the network — see the header). */
  readonly attempts: number;
  readonly enqueuedAt: number;
  /** The service's NAMED reason once `status` is 'failed' — never a silent drop. */
  readonly failureReason?: string;
}

/**
 * What ONE send came to, in the port's own vocabulary:
 *   delivered   — the service DECIDED (published, idempotent, removed, not_present…)
 *   refused     — a NAMED, permanent refusal: the entry fails now, reason kept
 *   fault       — the service answered without deciding (5xx/408/429): one
 *                 attempt counted, the replay HALTS (the service is unwell for
 *                 everyone behind); MAX_FAUTES of these fail the entry
 *   unreachable — no network / timed out: nothing counted, the replay HALTS
 *   session     — the book says her session is gone: nothing counted, the
 *                 replay HALTS; the caller walks the session road
 */
export type Verdict =
  | { readonly kind: 'delivered' }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'fault'; readonly reason: string }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'session' };

export type Arret = 'aucun' | 'reseau' | 'service' | 'session';

export interface Bilan {
  readonly livres: number;
  readonly refuses: number;
  readonly restants: number;
  readonly arret: Arret;
}

interface Persisted {
  version: 1;
  entries: QueueEntry[];
}

const SCHEMA_VERSION = 1 as const;
/** Service faults tolerated on one entry before it is named failed. */
export const MAX_FAUTES = 5;

export class FileAttente {
  private constructor(
    private readonly store: QueueStore,
    private entries: QueueEntry[],
    private readonly now: () => number,
  ) {}

  /** Open the outbox, RESTORING what was persisted (the reboot road). A corrupt
   *  or wrong-version blob opens EMPTY rather than crashing — the file is
   *  never trusted blindly — and the loss is the caller's to say, not to hide:
   *  `restauree` is false when bytes existed and could not be read. */
  static async ouvrir(store: QueueStore, opts: { now?: () => number } = {}): Promise<FileAttente> {
    const raw = await store.read();
    let entries: QueueEntry[] = [];
    if (raw !== null && raw.length > 0) {
      try {
        const parsed = JSON.parse(raw) as Persisted;
        if (parsed.version === SCHEMA_VERSION && Array.isArray(parsed.entries)) {
          entries = parsed.entries.filter(
            (e) =>
              (e.name === 'listing.publish' || e.name === 'listing.remove') &&
              typeof e.pid === 'string' &&
              (e.status === 'pending' || e.status === 'failed') &&
              typeof e.payload === 'object' && e.payload !== null,
          );
        }
      } catch {
        entries = [];
      }
    }
    return new FileAttente(store, entries, opts.now ?? Date.now);
  }

  private async persist(): Promise<void> {
    const blob: Persisted = { version: SCHEMA_VERSION, entries: this.entries };
    await this.store.write(JSON.stringify(blob));
  }

  /**
   * Keep an intent. ONE PER PRODUCT — any earlier entry for this pid (pending
   * or failed) is REPLACED, because a pending intent was never sent and her
   * last word is the true one. Persisted BEFORE returning, so an app-kill the
   * instant after cannot lose it (D17).
   */
  async deposer(name: IntentName, pid: string, payload: Readonly<Record<string, unknown>>): Promise<QueueEntry> {
    const entry: QueueEntry = { name, pid, payload, status: 'pending', attempts: 0, enqueuedAt: this.now() };
    this.entries = [...this.entries.filter((e) => e.pid !== pid), entry];
    await this.persist();
    return entry;
  }

  /** Her call: drop the intent for this product — a pending one she changed
   *  her mind about, or a failed one she has read. Persisted. */
  async abandonner(pid: string): Promise<void> {
    const avant = this.entries.length;
    this.entries = this.entries.filter((e) => e.pid !== pid);
    if (this.entries.length !== avant) await this.persist();
  }

  /** Pending intents, in the order she made them. */
  enAttente(): readonly QueueEntry[] {
    return this.entries.filter((e) => e.status === 'pending');
  }

  /** Intents the SERVICE refused, with their reasons — shown until she drops them. */
  echecs(): readonly QueueEntry[] {
    return this.entries.filter((e) => e.status === 'failed');
  }

  /** Everything the file holds, in order — nothing hidden. */
  tout(): readonly QueueEntry[] {
    return this.entries.slice();
  }

  /**
   * Replay the pending intents IN ORDER through `envoyer`. A delivered entry
   * LEAVES the file (its outcome now lives on the service); a refused one is
   * named failed and stays; a fault counts one attempt and HALTS the pass;
   * an unreachable network or a dead session HALTS the pass and counts
   * nothing. Persisted after every outcome — durable mid-replay.
   */
  async rejouer(envoyer: (entry: QueueEntry) => Promise<Verdict>): Promise<Bilan> {
    let livres = 0;
    let refuses = 0;
    let arret: Arret = 'aucun';
    for (const entry of this.entries.slice()) {
      if (entry.status !== 'pending') continue;
      const verdict = await envoyer(entry);
      if (verdict.kind === 'delivered') {
        this.entries = this.entries.filter((e) => e !== entry);
        livres++;
      } else if (verdict.kind === 'refused') {
        this.remplacer(entry, { ...entry, status: 'failed', failureReason: verdict.reason });
        refuses++;
      } else if (verdict.kind === 'fault') {
        const attempts = entry.attempts + 1;
        if (attempts >= MAX_FAUTES) {
          this.remplacer(entry, { ...entry, attempts, status: 'failed', failureReason: verdict.reason });
          refuses++;
        } else {
          this.remplacer(entry, { ...entry, attempts });
        }
        arret = 'service';
      } else {
        arret = verdict.kind === 'session' ? 'session' : 'reseau';
      }
      await this.persist();
      if (arret !== 'aucun') break;
    }
    return { livres, refuses, restants: this.enAttente().length, arret };
  }

  private remplacer(old: QueueEntry, next: QueueEntry): void {
    this.entries = this.entries.map((e) => (e === old ? next : e));
  }
}
