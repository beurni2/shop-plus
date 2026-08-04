/**
 * ACCESS-GATE-1 — ONE CODE, AT THE DOOR, AND NOWHERE ELSE.
 *
 * FOUNDER ORDER, 2026-08-04, verbatim: « i do not want resellers feed to have
 * any code gated. the only gate i want is the access gate, something like a new
 * reseller will [have] a code access that i will mint on the console and give
 * so it can have access to the app and start using. build it but make the
 * access gate off for now for shop+ ».
 *
 * ═══ WHAT WAS WRONG, AND WHY HE IS RIGHT ═══
 *
 * The app had TWO code doors — « Mes ventes » and « Mes gains » — both asking
 * for the same feed code, each one a wall in the middle of the app rather than
 * at its entrance. A reseller who had not been given a code met « Ce code
 * n'ouvre pas » on the two screens that matter most, with nothing to do about
 * it. The code was also the only thing that identified her, so the app knew who
 * she was ONLY on the two screens that happened to ask.
 *
 * Now there is ONE code. It is an ACCESS code: minted on the founder's console,
 * handed to a new reseller, typed once at the entrance. Everything inside — her
 * feed, her gains, her home screen — rides that single credential. Nothing
 * inside the app ever asks for a code again.
 *
 * ═══ THE CODE IS STILL THE IDENTITY, AND THAT PROPERTY IS UNCHANGED ═══
 *
 * `reseller-feed-do.ts` derives `resellerId` from the code SERVER-SIDE and
 * never accepts one claimed by a body — because `rs-{4 digits}` is nine
 * thousand values, and a feed that trusted a claimed id would hand any reseller
 * every other reseller's economics. Moving the prompt to the entrance changes
 * WHERE she types it, not what the server trusts. **The money read stays
 * authenticated no matter what this flag says.**
 *
 * ═══ « OFF FOR NOW » IS A CLIENT DECISION, NEVER A SERVER ONE ═══
 *
 * `EXPO_PUBLIC_ACCESS_GATE` decides whether the app ASKS. It cannot and does
 * not open `GET /reseller/ventes`, which still refuses every request without a
 * valid code. That separation is deliberate and is the only way a flag like
 * this is safe to ship disarmed: a flag that also opened the server would be an
 * unauthenticated money-read living in production behind a value someone
 * forgets to flip back.
 *
 * The honest cost, stated rather than hidden: with the gate DISARMED nobody is
 * asked for a code, so no device is identified, so the feed shows its « not
 * connected » state. That is not a failure — it is the truth about an app that
 * has not been told who is holding it.
 *
 * ═══ WHY A STORED CODE IS NOT RE-VERIFIED AT LAUNCH ═══
 *
 * The gate opens on a code being PRESENT, not on a round-trip proving it still
 * works. Verifying at launch would mean a dead network is a dead app, and this
 * app is offline-first by law (Ten Laws #7) on phones whose data drops for
 * hours. A revoked code therefore still opens the shell — and then every read
 * behind it refuses, honestly and by name, which is where a revocation belongs.
 * The gate is onboarding, not authorization; authorization is the server's, and
 * it never moved.
 */

/** ON only for the exact string — an unset, empty, mistyped or « true » value
 *  leaves the gate DISARMED, which is the founder's current instruction and
 *  also the state that cannot lock anyone out by accident.
 *
 *  Dot access on `process.env.EXPO_PUBLIC_*` is required: a computed access is
 *  invisible to the Metro inliner and would ship `undefined` forever. */
export function gateArme(): boolean {
  return process.env.EXPO_PUBLIC_ACCESS_GATE === 'on';
}

export type Acces =
  /** The app is usable. Either the gate is disarmed, or she holds a code. */
  | { readonly kind: 'ouvert' }
  /** Still reading the durable store — never render the door on a maybe. */
  | { readonly kind: 'lecture' }
  /** The gate is armed and this device holds no code: show the entrance. */
  | { readonly kind: 'porte' };

/**
 * The whole rule, pure and total.
 *
 * IT TAKES A BOOLEAN, NEVER THE CODE. The gate's only question is « does this
 * device hold one », so the credential itself has no reason to reach this
 * function and does not. A decision that cannot see a secret cannot leak one,
 * and cannot be tempted into comparing one.
 *
 * `undefined` means the durable store has not answered yet. It is its own
 * state rather than folded into « no code », because flashing the entrance for
 * one frame at every launch — to a reseller who typed her code weeks ago — is
 * exactly the kind of thing that makes an app feel untrustworthy on a slow
 * phone.
 */
export function decideAcces(arme: boolean, codePresent: boolean | undefined): Acces {
  // DISARMED WINS OVER EVERYTHING, and it is checked FIRST so that no storage
  // state, however odd, can produce a door the founder has switched off.
  if (!arme) return { kind: 'ouvert' };
  if (codePresent === undefined) return { kind: 'lecture' };
  return codePresent ? { kind: 'ouvert' } : { kind: 'porte' };
}
