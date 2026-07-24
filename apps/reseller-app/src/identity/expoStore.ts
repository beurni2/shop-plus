/**
 * RESELLER-IDENTITY-1 — the PRODUCTION identity store and the OS CSPRNG, both native.
 * Imported ONLY by the app; the pure rule (`store.ts`) and its tests never touch native.
 *
 * WHY THESE TWO MODULES, confirmed against the installed SDK rather than assumed from
 * the general rule (`node_modules/expo/bundledNativeModules.json`, SDK 54):
 *   expo-file-system  ~19.0.23   expo-crypto  ~15.0.9
 * Both are FIRST-PARTY EXPO SDK modules, so Expo Go ships their native halves by
 * definition and this reaches the founder over the air with no rebuild. A community
 * module would have been the riskier choice on that exact point.
 *
 * WHY NOT expo-secure-store (founder-accepted reasoning): a reseller id is NOT a
 * secret — it appears in slugs and in event payloads. The requirement is DURABILITY,
 * not protection. Keychain/Keystore adds real failure modes on low-end Android and
 * buys nothing here.
 *
 * `Paths.document` is the directory Expo documents as safe from system deletion — it
 * survives app-kill, reboot AND an EAS update republish, which is exactly what a
 * session-scoped value did not. Same choice boutik made for its offline queue.
 */

import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import type { IdentityStore, RandomBytes } from './store';

/** The durable identity file in the document directory. */
export function expoIdentityStore(fileName = 'reseller-identity.v1.json'): IdentityStore {
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

/**
 * The OS CSPRNG. NO `Math.random` FALLBACK ANYWHERE: if expo-crypto cannot provide
 * randomness this THROWS, `loadOrMintIdentity` returns `mint_failed`, and the UI shows
 * an honest state — it never fabricates an identity out of a weaker source. Same
 * honesty contract boutik's command-id mint keeps.
 */
export const expoRandomBytes: RandomBytes = (n) => Crypto.getRandomBytes(n);
