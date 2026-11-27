/**
 * RENDU-RÉEL (Shop+ reseller) — expo-file-system, inert but for two named holds.
 *
 * The app reads picked files here. No walk drives a real file through it: the
 * byte paths (resize, re-encode, hash, upload) keep their own unit tests, and a
 * double that pretended to hold bytes would make those look covered from here.
 * The two exceptions, each bounded where it lives: the IDENTITY file (below)
 * and the voice take's marker « bytes » (written by the expo-audio double) —
 * strings in a map, so `File.bytes()` can answer the app's upload read with
 * something non-empty. NEVER audio, never an image: a walk may assert the read
 * HAPPENED (`journalOctetsLus`), not that the content was anything.
 */
export const EncodingType = { Base64: 'base64', UTF8: 'utf8' } as const;
export const documentDirectory = 'file:///rendu/';
export const cacheDirectory = 'file:///rendu-cache/';
export async function readAsStringAsync(): Promise<string> {
  return '';
}
export async function writeAsStringAsync(): Promise<void> {}
export async function deleteAsync(): Promise<void> {}
export async function getInfoAsync(): Promise<{ exists: boolean; size: number }> {
  return { exists: false, size: 0 };
}
export async function makeDirectoryAsync(): Promise<void> {}

/**
 * `File` / `Paths` — THE IDENTITY FILE, and the ONE place this double holds
 * real state. `src/identity/expoStore.ts` persists her `resellerId` here, and
 * without it every mount mints a NEW reseller: her storefront id would change
 * between two renders and no walk could assert a shop is hers. So the bytes are
 * kept in a module-level map, and `resetFiles()` gives each walk a clean device.
 *
 * It is still a native boundary and nothing else: no directories, no streaming,
 * no real filesystem. The upload byte paths keep their own tests.
 */
const FILES = new Map<string, string>();
/**
 * VOIX-PRODUIT — every uri whose BYTES the app asked for, in order. The pin a
 * walk needs for « the take was read through the FILE port, not fetch(file://) »
 * — RN Android has refused file:// via fetch, so the call SITE is the fact.
 * An entry says the port was called with that uri; nothing about the content.
 */
export const journalOctetsLus: string[] = [];
export function resetFiles(): void {
  FILES.clear();
  journalOctetsLus.length = 0;
  journalActes.length = 0;
  plantage = null;
}

/**
 * P6 — THE TWO WRITE ROADS OF THE OUTBOX, as the native module walks them
 * (expo-file-system 57.0.6, Android), and a phone that dies in the middle:
 *   · `write` truncates then writes IN PLACE (`FileSystemFile.kt` :76-84):
 *     a death mid-write leaves a PREFIX of the new bytes, the old ones gone;
 *   · `move(dest, { overwrite: true })` first DELETES an existing destination
 *     (`fsops/CopyMoveStrategy.kt` `prepareAsDestination`), then renames —
 *     a death between the two leaves only the source; without `overwrite`
 *     an existing destination is refused. The object then names `dest`.
 * `planterApres` arms ONE death on the next matching act: the act is done
 * (for a `write` with `moitie`, half of it), then the call throws as the
 * process would stop. Nothing after it runs. `journalActes` is every act, in
 * order. Bound: bytes in a map and the order of acts — never timing, never
 * a real filesystem.
 */
export type Acte = 'write' | 'delete' | 'rename';
export const journalActes: { acte: Acte; cle: string; vers?: string }[] = [];
let plantage: { acte: Acte; cle?: RegExp; moitie?: boolean } | null = null;
export function planterApres(p: { acte: Acte; cle?: RegExp; moitie?: boolean }): void {
  plantage = p;
}
function peutPlanter(acte: Acte, cle: string): { moitie: boolean } | null {
  if (plantage === null || plantage.acte !== acte || (plantage.cle !== undefined && !plantage.cle.test(cle))) return null;
  const moitie = plantage.moitie === true;
  plantage = null;
  return { moitie };
}
export class PhoneMort extends Error {
  constructor() {
    super('rendu: le téléphone s’est éteint');
  }
}
/** Seed or read a file's bytes directly (a device state a walk starts from). */
export function fichierBrut(uri: string): string | undefined {
  return FILES.get(uri);
}
export function poserFichier(uri: string, data: string): void {
  FILES.set(uri, data);
}
export function fichiersSous(prefix: string): string[] {
  return [...FILES.keys()].filter((k) => k.startsWith(prefix)).sort();
}
export const Paths = { document: 'file:///rendu/', cache: 'file:///rendu-cache/' };
export class File {
  private key: string;
  /** The real API joins its segments: `new File(uri)` and `new File(dir, name)`
   *  are both how the app builds one (photo-pick, expoStore, code-store). */
  constructor(...parts: string[]) {
    this.key = parts.join('');
  }
  get exists(): boolean {
    return FILES.has(this.key);
  }
  text(): string {
    return FILES.get(this.key) ?? '';
  }
  /** The sync read `code-store.ts` actually uses (SDK `textSync`). Same map,
   *  same bound: bytes in, bytes out, nothing about a real filesystem. */
  textSync(): string {
    return FILES.get(this.key) ?? '';
  }
  create(): void {
    if (!FILES.has(this.key)) FILES.set(this.key, '');
  }
  write(data: string): void {
    journalActes.push({ acte: 'write', cle: this.key });
    const mort = peutPlanter('write', this.key);
    if (mort !== null) {
      FILES.set(this.key, mort.moitie ? data.slice(0, Math.floor(data.length / 2)) : data);
      throw new PhoneMort();
    }
    FILES.set(this.key, data);
  }
  get uri(): string {
    return this.key;
  }
  delete(): void {
    if (!FILES.has(this.key)) throw new Error(`rendu: aucun fichier sous ${this.key}`);
    journalActes.push({ acte: 'delete', cle: this.key });
    FILES.delete(this.key);
    if (peutPlanter('delete', this.key) !== null) throw new PhoneMort();
  }
  async move(dest: File, options: { overwrite?: boolean } = {}): Promise<void> {
    const held = FILES.get(this.key);
    if (held === undefined) throw new Error(`rendu: aucun fichier sous ${this.key}`);
    if (FILES.has(dest.key)) {
      if (options.overwrite !== true) throw new Error(`rendu: ${dest.key} existe déjà`);
      dest.delete();
    }
    journalActes.push({ acte: 'rename', cle: this.key, vers: dest.key });
    FILES.set(dest.key, held);
    FILES.delete(this.key);
    this.key = dest.key;
    if (peutPlanter('rename', this.key) !== null) throw new PhoneMort();
  }
  /** The byte read the upload paths use. THROWS on a missing file, as the
   *  device does — answering empty would hide `file_unreadable` for ever. The
   *  bytes are the stored marker string encoded, never audio (bound above). */
  async bytes(): Promise<Uint8Array> {
    journalOctetsLus.push(this.key);
    const held = FILES.get(this.key);
    if (held === undefined) throw new Error(`rendu: aucun fichier sous ${this.key}`);
    return new TextEncoder().encode(held);
  }
}
