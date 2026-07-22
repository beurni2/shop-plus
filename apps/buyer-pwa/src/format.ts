/** (The Intl-based `FCFA` export is retired — PWA-CLEANUP-1 §2: ICU's
 * fr-FR separator is not byte-stable across versions. The ONE formatter is
 * `cliente/money.fmtFCFA`, manual grouping from the escaped constant.) */

/** HTML-escape for every MODEL-DERIVED string a renderer interpolates
 * (verifier NB①: the render layer writes innerHTML — nothing non-constant
 * may reach it raw, today self-XSS, tomorrow stored-XSS when supplier
 * names flow in). Catalog strings stay unescaped: they are OUR copy. */
export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
