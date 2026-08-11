/**
 * RENDU-RÉEL (Shop+ reseller) — expo-file-system, inert.
 *
 * The app reads picked files here. No walk drives a real file through it: the
 * byte paths (resize, re-encode, hash, upload) keep their own unit tests, and a
 * double that pretended to hold bytes would make those look covered from here.
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
export function resetFiles(): void {
  FILES.clear();
}
export const Paths = { document: 'file:///rendu/', cache: 'file:///rendu-cache/' };
export class File {
  private readonly key: string;
  constructor(dir: string, name: string) {
    this.key = `${dir}${name}`;
  }
  get exists(): boolean {
    return FILES.has(this.key);
  }
  text(): string {
    return FILES.get(this.key) ?? '';
  }
  create(): void {
    if (!FILES.has(this.key)) FILES.set(this.key, '');
  }
  write(data: string): void {
    FILES.set(this.key, data);
  }
}
