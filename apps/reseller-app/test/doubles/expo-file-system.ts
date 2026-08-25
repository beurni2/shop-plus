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
}
export const Paths = { document: 'file:///rendu/', cache: 'file:///rendu-cache/' };
export class File {
  private readonly key: string;
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
    FILES.set(this.key, data);
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
