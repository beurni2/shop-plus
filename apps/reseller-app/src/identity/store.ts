/**
 * RESELLER-IDENTITY-1 — the durable identity store PORT plus the load-or-mint rule.
 *
 * THE HONESTY CONTRACT, and it is the whole point of this file: **if the write fails,
 * the identity is NOT returned.** Returning a minted-but-unpersisted id would give the
 * caller something that works for exactly one session and silently becomes a different
 * reseller on the next launch — which is the defect this slice removes, reappearing one
 * layer down. It is also the same shape as the seam that used to answer « En ligne »
 * having written nothing: a confident success over a failed write. Refused here.
 *
 * The port keeps native OUT of the tests: `expoStore.ts` (app-only) implements it over
 * expo-file-system's document directory; the tests run the identical logic over an
 * in-memory store, including the failure paths a native module cannot be made to
 * produce on demand.
 */

import { IDENTITY_VERSION, type ResellerIdentity, type StoredIdentity, digitsFromBytes, identityFromDigits } from './mint';

/** Durable key/value for one small JSON blob. Mirrors boutik's QueueStore shape. */
export interface IdentityStore {
  read(): Promise<string | null>;
  write(data: string): Promise<void>;
}

/** Bytes from the OS CSPRNG. Injected so the pure path is testable and so there is
 *  no import of a random source in here that could be swapped for `Math.random`. */
export type RandomBytes = (n: number) => Uint8Array;

export type IdentityOutcome =
  | { readonly ok: true; readonly identity: ResellerIdentity; readonly minted: boolean }
  | { readonly ok: false; readonly reason: 'mint_failed' | 'persist_failed' };

/** Bytes drawn per mint — 16 gives 8 rejection-sampling attempts (see digitsFromBytes). */
export const MINT_BYTES = 16;

function parseStored(raw: string): StoredIdentity | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredIdentity>;
    // A future version is NOT read as if it were this one — an unknown shape is
    // treated as absent, which re-mints rather than misreading someone else's schema.
    if (parsed.version !== IDENTITY_VERSION) return undefined;
    if (typeof parsed.digits !== 'string' || !/^[0-9]{4}$/.test(parsed.digits)) return undefined;
    return { version: parsed.version, digits: parsed.digits };
  } catch {
    return undefined;
  }
}

/**
 * Load the stored identity, or mint one and persist it BEFORE returning it.
 *
 * A read failure is NOT fatal — it is indistinguishable from "nothing stored yet", and
 * both lead to a mint. A WRITE failure IS fatal to the outcome, per the contract above.
 */
export async function loadOrMintIdentity(store: IdentityStore, randomBytes: RandomBytes): Promise<IdentityOutcome> {
  let raw: string | null = null;
  try {
    raw = await store.read();
  } catch {
    raw = null; // unreadable == absent; the mint below is the honest response
  }

  if (raw !== null) {
    const stored = parseStored(raw);
    if (stored !== undefined) return { ok: true, identity: identityFromDigits(stored.digits), minted: false };
  }

  let digits: string;
  try {
    digits = digitsFromBytes(randomBytes(MINT_BYTES));
  } catch {
    return { ok: false, reason: 'mint_failed' }; // no CSPRNG, or exhausted — never Math.random
  }

  const record: StoredIdentity = { version: IDENTITY_VERSION, digits };
  try {
    await store.write(JSON.stringify(record));
  } catch {
    // THE CONTRACT: a minted id that did not persist is not an identity. Refused.
    return { ok: false, reason: 'persist_failed' };
  }
  return { ok: true, identity: identityFromDigits(digits), minted: true };
}

/**
 * RECOMMENCER (founder, 2026-08-18: « each time a reseller creates a boutique,
 * the QR address reads the newly created boutique's name ») — mint a FRESH
 * identity over the stored one, so the next create derives a new address from
 * the shop's current name.
 *
 * THE ONE RULE BEYOND loadOrMintIdentity: the new digits MUST differ from the
 * current ones. `commandId` is `create-sf-{digits}`, so re-minting the SAME
 * digits would make the next create answer `idempotent` and hand back the OLD
 * shop under the OLD address — a « new address » button that silently changes
 * nothing. 4 digits give a 1/9000 collision per draw; three draws make the
 * failure odds ignorable, and past them the mint REFUSES rather than lies.
 *
 * The persistence contract is inherited unchanged: a minted id that did not
 * persist is not an identity, so the write happens before the return.
 */
export async function remintIdentity(
  store: IdentityStore,
  randomBytes: RandomBytes,
  currentDigits: string,
): Promise<IdentityOutcome> {
  let digits: string | undefined;
  for (let essai = 0; essai < 3 && digits === undefined; essai += 1) {
    try {
      const tirage = digitsFromBytes(randomBytes(MINT_BYTES));
      if (tirage !== currentDigits) digits = tirage;
    } catch {
      return { ok: false, reason: 'mint_failed' };
    }
  }
  if (digits === undefined) return { ok: false, reason: 'mint_failed' };

  const record: StoredIdentity = { version: IDENTITY_VERSION, digits };
  try {
    await store.write(JSON.stringify(record));
  } catch {
    return { ok: false, reason: 'persist_failed' };
  }
  return { ok: true, identity: identityFromDigits(digits), minted: true };
}

/** In-memory store — TESTS ONLY. Never imported by the app (it persists nothing). */
export class InMemoryIdentityStore implements IdentityStore {
  private data: string | null = null;
  constructor(private readonly failWrite = false, private readonly failRead = false) {}
  async read(): Promise<string | null> {
    if (this.failRead) throw new Error('read failed');
    return this.data;
  }
  async write(data: string): Promise<void> {
    if (this.failWrite) throw new Error('write failed');
    this.data = data;
  }
}
