/**
 * ACCESS-GATE-1 → RESELLER-ACCOUNTS — where HER SESSION lives between launches.
 *
 * The app's single credential: the `SPS-` session her account gets at signup
 * or sign-in (the admission code is typed once and never stored). Every read
 * inside the app rides it.
 *
 * CODES-EFFACES-1 (founder order 2026-09-30): this file once also read the
 * pre-accounts `reseller-feed-code.v1.txt`, where a reseller kept the `SP-`
 * code the founder minted by hand. Those codes are retired and erased on the
 * server, so that old file is no longer read: a phone holding only it is a
 * phone that has not signed in, and it meets the entrance — it never sends a
 * dead code to her sales door.
 *
 * The SAME durability choice `identity/expoStore.ts` made, for the same
 * reasons, verified against the same installed SDK: `Paths.document` survives
 * app-kill, reboot AND an EAS update republish. A session-scoped value would
 * make her sign in again every launch, which on a low-end phone in a market
 * is not a minor annoyance — it is the reason she stops opening the screen.
 *
 * NOT `expo-secure-store`, and here the reasoning DIFFERS from the identity
 * store's, so it is written out rather than copied: this value IS a credential.
 * But the threat it defends against is another RESELLER reading her sales, not
 * someone holding her unlocked phone — and Keychain/Keystore on low-end
 * Android brings real failure modes that would lock her out of her own
 * earnings. Her way back from a lost or ended session is signing in again.
 *
 * NATIVE-ONLY, imported by the app alone: the pure hook takes a `CodeStore`
 * so every test runs without touching the filesystem.
 */

import { File, Paths } from 'expo-file-system';
import type { CodeStore } from './use-ventes-reelles';

function lire(file: File): string | null {
  try {
    if (!file.exists) return null;
    const raw = file.textSync().trim();
    return raw === '' ? null : raw;
  } catch {
    return null;
  }
}

export function expoAccessCodeStore(fileName = 'reseller-access-code.v1.txt'): CodeStore {
  const file = new File(Paths.document, fileName);
  return {
    async read(): Promise<string | null> {
      try {
        return lire(file);
      } catch {
        // An unreadable file is « no code », never a crash: she is shown the
        // door and can type it again.
        return null;
      }
    },
    async write(code: string): Promise<void> {
      try {
        file.write(code);
      } catch {
        // Persisting is a convenience, not a correctness requirement — the
        // read already succeeded, so her sales are on screen either way.
      }
    },
  };
}
