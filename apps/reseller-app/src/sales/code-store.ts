/**
 * RF-1c — where her feed code lives between sessions.
 *
 * The SAME durability choice `identity/expoStore.ts` made, for the same
 * reasons, verified against the same installed SDK: `Paths.document` survives
 * app-kill, reboot AND an EAS update republish. A session-scoped value would
 * make her retype the code every launch, which on a low-end phone in a market
 * is not a minor annoyance — it is the reason she stops opening the screen.
 *
 * NOT `expo-secure-store`, and here the reasoning DIFFERS from the identity
 * store's, so it is written out rather than copied: this code IS a credential.
 * But the threat it defends against is another RESELLER reading her sales, not
 * someone holding her unlocked phone — and Keychain/Keystore on low-end
 * Android brings real failure modes that would lock her out of her own
 * earnings. The founder can revoke and re-mint a code in one action, which is
 * the recovery path that actually matters here.
 *
 * NATIVE-ONLY, imported by the app alone: the pure hook takes a `CodeStore`
 * so every test runs without touching the filesystem.
 */

import { File, Paths } from 'expo-file-system';
import type { CodeStore } from './use-ventes-reelles';

export function expoVenteCodeStore(fileName = 'reseller-feed-code.v1.txt'): CodeStore {
  const file = new File(Paths.document, fileName);
  return {
    async read(): Promise<string | null> {
      try {
        if (!file.exists) return null;
        const raw = file.textSync().trim();
        return raw === '' ? null : raw;
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
