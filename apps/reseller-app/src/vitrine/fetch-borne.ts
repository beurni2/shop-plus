/**
 * PORTS-DELAI-1 (AUDIT-SHOP-2 F-15) — EVERY WIRE CALL THIS APP MAKES ENDS.
 *
 * The storefront and offer ports made nine `fetch` calls with no ceiling. RN
 * Android's HTTP client waits for ever unless JS aborts, so one stalled request
 * left « Envoi en cours… » on the primary action for the rest of the session —
 * measured on the mounted App: `/listings` held, the CTA dead, back and reopen,
 * still dead. The feed and account clients already carried a 12 s abort; these
 * two did not.
 *
 * ONE helper, two ceilings: a JSON read or write gets `DELAI_LECTURE_MS`; an
 * upload (a photo, a voice note — real bytes on a 2G link) gets
 * `DELAI_ENVOI_MS`. The abort surfaces as a thrown error, which every caller's
 * existing `catch` already maps to `'offline'` — to her, a request that never
 * came back and a dead network are the same thing: not reached, try again.
 */
export const DELAI_LECTURE_MS = 15_000;
export const DELAI_ENVOI_MS = 60_000;

export async function fetchBorne(input: string, init: RequestInit, delaiMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), delaiMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * BASE-SURE-1 (AUDIT-SHOP-2 F-76) — the service base is https or it is nothing.
 * Every adapter crosses this: a plain-http base (a typo in the workflow secret,
 * a dev value that leaked) would send her password and her session bearer in
 * clear. Refused here, it resolves to the same NULL an unset base does — the
 * honest « non branché » state the app already designs for.
 */
export function baseSure(raw: string | undefined): string | null {
  return raw !== undefined && raw.startsWith('https://') ? raw : null;
}
