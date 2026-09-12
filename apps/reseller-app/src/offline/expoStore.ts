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
  return {
    async read(): Promise<string | null> {
      return file.exists ? file.text() : null;
    },
    async write(data: string): Promise<void> {
      if (!file.exists) file.create();
      file.write(data);
    },
  };
}
