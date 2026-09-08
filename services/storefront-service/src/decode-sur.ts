/**
 * PUBLIC-DECODE-1 (AUDIT-SHOP-2 F-03, F-26) — decode ONE path segment, or say
 * that it will not decode.
 *
 * `decodeURIComponent` THROWS a `URIError` on a lone escape (`/s/%FF`), and an
 * uncaught throw on any route answers 500 — the one shape this Worker's DoD
 * bans (« every failure is a named refusal ») and the one the founder's
 * dashboard counts as « Worker threw exception », cheap to trigger anonymously.
 * A segment that will not decode names nothing: the caller answers its honest
 * not-found (or its named 400), never a 500.
 *
 * ONE helper for every road — the buyer's public reads, the key-C roads, the
 * session's pid segment and the webhook's leg-key read — so the roads cannot
 * drift apart again: the a2a fix guarded the session roads at the composition
 * root and left these five open.
 *
 * `decoder` defaults to `decodeURIComponent`; the media key's road passes
 * `decodeURI`, whose keys keep their slashes.
 */
export function decodeSur(segment: string, decoder: (raw: string) => string = decodeURIComponent): string | null {
  try {
    return decoder(segment);
  } catch {
    return null;
  }
}
