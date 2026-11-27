/**
 * FILE-ATTENTE-1 — the PRODUCTION `QueueStore`: Expo's durable document
 * directory, the same `File(Paths.document, …)` road her identity file rides
 * (`src/identity/expoStore.ts`) and Boutik+'s outbox rides. `Paths.document`
 * is « a place to store files that are safe from being deleted by the system »
 * (expo-file-system 57) — it survives app-kill, reboot and an EAS update, which
 * is what D17 asks. Imported ONLY by the app; the pure outbox (`queue.ts`) and
 * its survival test never touch native.
 */
import { File, Paths } from 'expo-file-system';
import type { QueueStore } from './queue';

export function expoFileAttenteStore(fileName = 'file-attente.v1.json'): QueueStore {
  const file = new File(Paths.document, fileName);
  const tmp = (): File => new File(Paths.document, `${fileName}.tmp`);
  /**
   * P6 — A WRITE NEVER TOUCHES THE LIST IN PLACE. The native `write` truncates
   * then writes (a phone dying in between leaves half a JSON), so the new
   * bytes go to `<name>.tmp` and are then MOVED over the list. The native
   * move deletes an existing destination first, then renames (atomic on one
   * filesystem): a death between those two leaves the whole `.tmp` and no
   * list — so before any read or write, a lone `.tmp` is renamed into place,
   * and the next write can never truncate the only good copy.
   */
  async function promouvoir(): Promise<void> {
    const t = tmp();
    if (!file.exists && t.exists) await t.move(file);
  }
  return {
    async read(): Promise<string | null> {
      await promouvoir();
      return file.exists ? file.text() : null;
    },
    async write(data: string): Promise<void> {
      await promouvoir();
      const t = tmp();
      if (!t.exists) t.create();
      t.write(data);
      await t.move(file, { overwrite: true });
    },
    async garder(data: string): Promise<void> {
      // A new name beside the list, never an existing one: nothing is overwritten.
      let n = 0;
      let kept = new File(Paths.document, `${fileName}.perdu-${Date.now()}.json`);
      while (kept.exists) kept = new File(Paths.document, `${fileName}.perdu-${Date.now()}-${(n += 1)}.json`);
      kept.create();
      kept.write(data);
    },
  };
}
