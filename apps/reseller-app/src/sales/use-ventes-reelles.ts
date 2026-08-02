/**
 * RF-1c — the live wiring for « Mes ventes »: her code, her feed, her states.
 *
 * Everything DECIDABLE lives in `feed-model.ts` and `feed-screen.ts`, which are
 * pure and exhaustively tested. This module owns only the two things a hook
 * must own — the durable code on her device, and when to fetch — so that no
 * rendering decision hides inside an effect.
 *
 * HER CODE NEVER ENTERS THE BUNDLE. It is typed once, stored in the same
 * document directory the reseller identity uses (durable across app-kill,
 * reboot and an EAS republish), and sent as a Bearer. The only value read from
 * the environment is the base URL.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveResellerFeed, type ResellerFeedPort } from './feed-service';
import { vueDesVentes, type FeedVue } from './feed-model';
import { ecranDesVentes, type VentesEcran } from './feed-screen';

/** Where her code lives between sessions. Injected so tests never touch native. */
export interface CodeStore {
  read(): Promise<string | null>;
  write(code: string): Promise<void>;
}

export interface VentesReelles {
  readonly ecran: VentesEcran;
  /** Submit a code typed at the door. Persists it only once it actually opens. */
  readonly ouvrir: (code: string) => Promise<void>;
  readonly recharger: () => Promise<void>;
}

export function useVentesReelles(store: CodeStore, port: ResellerFeedPort | null = resolveResellerFeed()): VentesReelles {
  const [vue, setVue] = useState<FeedVue>(port === null ? { kind: 'not_configured' } : { kind: 'loading' });
  const code = useRef<string | null>(null);
  /**
   * A monotonic read token. Two reads can be in flight when she retries on a
   * slow connection, and only the NEWEST may write the screen — otherwise a
   * stale answer overwrites a fresh one and she sees yesterday's list. The
   * same law the founder's console needed after this bit us there.
   */
  const seq = useRef(0);

  const lire = useCallback(
    async (theCode: string): Promise<void> => {
      if (port === null) {
        setVue({ kind: 'not_configured' });
        return;
      }
      seq.current += 1;
      const mine = seq.current;
      setVue({ kind: 'loading' });
      const res = await port.mesVentes(theCode);
      if (mine !== seq.current) return; // a newer read already answered
      if (!res.ok) {
        setVue(res.reason === 'unauthorized' ? { kind: 'refused' } : { kind: 'unreachable' });
        return;
      }
      code.current = theCode;
      setVue(vueDesVentes(res.ventes, res.incomplet));
    },
    [port],
  );

  // On mount: open with the stored code if she has one, else show the door.
  // NOTE the empty dependency list is deliberate — this runs once, and every
  // later read goes through `ouvrir`/`recharger`, which carry the code
  // explicitly rather than through a dependency React may skip.
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (port === null) return;
      const stored = await store.read().catch(() => null);
      if (!alive) return;
      if (stored === null || stored === '') {
        setVue({ kind: 'locked' });
        return;
      }
      await lire(stored);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ouvrir = useCallback(
    async (typed: string): Promise<void> => {
      const trimmed = typed.trim();
      if (trimmed === '') {
        setVue({ kind: 'refused' });
        return;
      }
      await lire(trimmed);
      // PERSISTED ONLY AFTER IT OPENED. Storing a refused code would greet her
      // with a refusal on every launch until she found where to clear it.
      if (code.current === trimmed) await store.write(trimmed).catch(() => undefined);
    },
    [lire, store],
  );

  const recharger = useCallback(async (): Promise<void> => {
    if (code.current === null) {
      setVue({ kind: 'locked' });
      return;
    }
    await lire(code.current);
  }, [lire]);

  return { ecran: ecranDesVentes(vue), ouvrir, recharger };
}
