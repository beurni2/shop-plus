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
 *
 * ACCESS-GATE-1 — AND IT IS TYPED AT THE ENTRANCE, NEVER HERE. This hook still
 * owns the credential and still exposes `ouvrir`, because verifying a code IS
 * one feed read and there is no second route that could validate one. What
 * changed is WHO calls it: the access screen, once, instead of two walls in the
 * middle of the app. `codePresent` is what the gate reads.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveResellerFeed, type ResellerFeedPort } from './feed-service';
import { vueDesVentes, type FeedVue } from './feed-model';
import { ecranDesVentes, type VentesEcran } from './feed-screen';
import { vueDesGains, type GainsVue } from './gains-model';
import { ecranDesGains, type GainsEcran } from './gains-screen';

/** Where her code lives between sessions. Injected so tests never touch native. */
export interface CodeStore {
  read(): Promise<string | null>;
  write(code: string): Promise<void>;
}

export interface VentesReelles {
  readonly ecran: VentesEcran;
  /**
   * SP6.1 — the SAME rows, sorted onto the settlement ladder. ONE FETCH, TWO
   * SURFACES, deliberately: « Mes ventes » and « Mes gains » are two readings
   * of one answer, so they can never disagree about which sales exist or what
   * each one is worth. A second endpoint would have made that a matter of
   * timing.
   *
   * The gains view is built from the RAW rows, not from `FeedVue` — `FeedVue`
   * has already dropped everything that is not `confirmed`, and the ladder's
   * first rung is precisely the sales that are not confirmed yet.
   */
  readonly gains: GainsEcran;
  /** Submit a code typed at the ENTRANCE. Persists it only once it opens. */
  readonly ouvrir: (code: string) => Promise<void>;
  readonly recharger: () => Promise<void>;
  /**
   * ACCESS-GATE-1 — does this device hold a code?
   *
   * `undefined` while the durable store is still answering, and the gate MUST
   * treat that as « do not know yet » rather than « no »: flashing the entrance
   * for one frame at every launch, to a reseller who typed her code weeks ago,
   * is how an app stops feeling trustworthy on a slow phone.
   */
  readonly codePresent: boolean | undefined;
  /** TRUE while the entrance is verifying a typed code — one feed read. */
  readonly verification: boolean;
  /** The last typed code was refused by the server (401). */
  readonly refuse: boolean;
}

export function useVentesReelles(store: CodeStore, port: ResellerFeedPort | null = resolveResellerFeed()): VentesReelles {
  const [vue, setVue] = useState<FeedVue>(port === null ? { kind: 'not_configured' } : { kind: 'loading' });
  const [gains, setGains] = useState<GainsVue>(port === null ? { kind: 'non_branche' } : { kind: 'chargement' });
  const code = useRef<string | null>(null);
  const [codePresent, setCodePresent] = useState<boolean | undefined>(undefined);
  const [verification, setVerification] = useState(false);
  const [refuse, setRefuse] = useState(false);
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
        setGains({ kind: 'non_branche' });
        return;
      }
      seq.current += 1;
      const mine = seq.current;
      setVue({ kind: 'loading' });
      setGains({ kind: 'chargement' });
      const res = await port.mesVentes(theCode);
      if (mine !== seq.current) return; // a newer read already answered
      if (!res.ok) {
        setRefuse(res.reason === 'unauthorized');
        setVue(res.reason === 'unauthorized' ? { kind: 'refused' } : { kind: 'unreachable' });
        setGains(res.reason === 'unauthorized' ? { kind: 'refus' } : { kind: 'hors_ligne' });
        return;
      }
      code.current = theCode;
      setCodePresent(true);
      setRefuse(false);
      setVue(vueDesVentes(res.ventes, res.incomplet));
      // The RAW rows — see `VentesReelles.gains` for why this cannot read `vue`.
      setGains(vueDesGains(res.ventes, res.incomplet));
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
      if (port === null) {
        // NO FEED CONFIGURED. The gate must still resolve — leaving it on
        // « lecture » forever would be a permanent spinner instead of a
        // sentence — so it resolves to « no code », and the entrance says
        // plainly that the app is not connected rather than offering an input
        // that could never succeed.
        setCodePresent(false);
        return;
      }
      const stored = await store.read().catch(() => null);
      if (!alive) return;
      if (stored === null || stored === '') {
        setCodePresent(false);
        setVue({ kind: 'locked' });
        setGains({ kind: 'verrouille' });
        return;
      }
      // A STORED CODE MEANS THE GATE OPENS NOW, before the read answers. The
      // shell must not wait on the network to let her in (Ten Laws #7); if the
      // code has since been revoked, the read below says so honestly.
      setCodePresent(true);
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
        setRefuse(true);
        setVue({ kind: 'refused' });
        return;
      }
      setVerification(true);
      await lire(trimmed);
      setVerification(false);
      // PERSISTED ONLY AFTER IT OPENED. Storing a refused code would greet her
      // with a refusal on every launch until she found where to clear it.
      if (code.current === trimmed) await store.write(trimmed).catch(() => undefined);
    },
    [lire, store],
  );

  const recharger = useCallback(async (): Promise<void> => {
    if (code.current === null) {
      setVue({ kind: 'locked' });
      setGains({ kind: 'verrouille' });
      return;
    }
    await lire(code.current);
  }, [lire]);

  return {
    ecran: ecranDesVentes(vue),
    gains: ecranDesGains(gains),
    ouvrir,
    recharger,
    codePresent,
    verification,
    refuse,
  };
}
