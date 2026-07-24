/**
 * SERVICE-WRITE-AUTH-1 — the shared-secret WRITE gate for the storefront service.
 *
 * THE FINDING it closes: every write endpoint on the live Worker
 * (POST /storefronts · /storefronts/:id/publish · /unpublish · /listings ·
 * /listings/:id/hide · /media/upload) was reachable with NO credential — anyone
 * with the URL could create storefronts or write objects into the founder's R2
 * bucket. This gate sits at the ONE deployed entry (worker/index.ts) BEFORE any
 * dispatch, so a rejected write never reaches a Durable Object or an existence
 * lookup — the 401 can never become an existence oracle.
 *
 * WHAT IT IS AND IS NOT: a shared secret, inlined in the reseller app bundle
 * (EXPO_PUBLIC_*). It stops scanners and casual abuse. It does NOT stop a
 * determined attacker who decompiles the app, and — because the secret is shared —
 * it does NOT stop one reseller writing to another's storefront. Real per-reseller
 * identity is a HARD GATE before any reseller other than the founder onboards
 * (journaled).
 *
 * Reads (GET/HEAD/OPTIONS) carry no credential and are never gated — buyers hold
 * no secret and must never need one.
 */

/** Methods that only ever read. Everything else is a write and needs the key. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The header the reseller app presents the shared write key in. */
export const WRITE_KEY_HEADER = 'X-Write-Key';

/** The env the gate reads its configured secret from — a wrangler SECRET, NEVER a
 * `[vars]` entry (all five repos are public; a var there would be published). */
export interface WriteAuthEnv {
  readonly STOREFRONT_WRITE_SECRET?: string;
}

/** A write is any request whose method is not a safe read method. */
export function isWrite(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

/**
 * Constant-time equality that leaks neither length nor content through timing:
 * both inputs are HMAC-SHA-256'd under a fresh per-call random key, then the two
 * fixed 32-byte digests are compared with a branch-free XOR fold. WebCrypto is
 * present in both workerd (prod / Miniflare) and Node 20+.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const [da, db] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(a)),
    crypto.subtle.sign('HMAC', key, enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i += 1) diff |= (va[i] as number) ^ (vb[i] as number);
  return diff === 0;
}

/**
 * The shared key check, FAIL CLOSED. True iff a non-empty secret is configured AND
 * the request's `X-Write-Key` matches it (constant-time). The compare runs
 * unconditionally (even with no secret configured) so timing does not reveal
 * whether a secret exists; the length guard keeps it fail-closed — an unset/empty
 * secret can never match a non-empty presented key.
 */
export async function keyAuthorized(request: Request, env: WriteAuthEnv): Promise<boolean> {
  const secret = env.STOREFRONT_WRITE_SECRET ?? '';
  const provided = request.headers.get(WRITE_KEY_HEADER) ?? '';
  const match = await timingSafeEqual(provided, secret);
  return secret.length > 0 && match;
}

/** The one 401 — IDENTICAL for every rejection, so it can never leak. */
export function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

/**
 * WRITE gate. Resolves to `null` iff authorised; else a 401, computed BEFORE any
 * target lookup so it can never be an existence oracle. A Worker with no secret
 * set refuses every write. Reads (safe methods) short-circuit to `null` — the
 * admin list (a key-gated GET) is gated separately at the composition root.
 */
export async function rejectUnauthorizedWrite(request: Request, env: WriteAuthEnv): Promise<Response | null> {
  if (!isWrite(request.method)) return null;
  return (await keyAuthorized(request, env)) ? null : unauthorized();
}
