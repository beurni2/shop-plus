/**
 * TEL-PAIRES (founder order 2026-08-09) — « on the phone make spaced after 2
 * numbers like this 76 16 02 55 ». The C3 field's own placeholder has said
 * « Ex. : 70 12 34 56 » since BC-1b; this makes the field DO what its example
 * shows, as she types.
 *
 * The spaced string rides the order verbatim — safe by construction: the wire
 * bound is length ≤ 32 (order-do `readBuyerContact`), and buyer IDENTITY is
 * keyed by `cleAcheteur`, which strips every non-digit before keying — so
 * « 76 16 02 55 » and « 76160255 » name the same buyer and the same ladder.
 * A leading « + » is HERS and survives; every other non-digit is dropped; 15
 * digits is E.164's ceiling, the same band `cleAcheteur` accepts.
 *
 * Idempotent on purpose: formatting a formatted string changes nothing, so
 * the input handler can run it on every keystroke without drift.
 */
export function telEnPaires(brut: string): string {
  const plus = brut.trimStart().startsWith('+') ? '+' : '';
  const chiffres = brut.replace(/\D/g, '').slice(0, 15);
  return plus + chiffres.replace(/(\d{2})(?=\d)/g, '$1 ');
}

/**
 * Where the caret lands after a reformat: after the same NUMBER OF DIGITS the
 * buyer was behind before it. Counting digits (never characters) is what keeps
 * a deletion in the middle from throwing her to the end of the field.
 */
export function caretApresChiffres(formate: string, chiffresAvant: number): number {
  // Never BEFORE a leading « + »: a caret parked at 0 would put the next
  // keystroke ahead of the plus, and a digit landing there deletes it on the
  // following reformat (a leading digit means « no plus »). Nobody edits
  // before their own +; everybody types after it.
  let pos = formate.startsWith('+') ? 1 : 0;
  let vus = 0;
  while (pos < formate.length && vus < chiffresAvant) {
    if (/\d/.test(formate[pos] as string)) vus += 1;
    pos += 1;
  }
  return pos;
}
