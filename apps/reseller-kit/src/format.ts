/** (The Intl-based `FCFA` export is retired — PWA-CLEANUP-1 §2: ICU's
 * fr-FR separator is not byte-stable across versions. The ONE formatter is
 * `./money.fmtFCFA` — manual U+202F grouping + the FCFA suffix; SON prix,
 * always a whole confident figure.) */

/** HTML-escape for every MODEL-DERIVED string a DOM renderer interpolates
 * (same discipline as the buyer PWA: nothing non-constant reaches innerHTML
 * raw). Catalog strings stay unescaped — they are OUR copy. */
export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
