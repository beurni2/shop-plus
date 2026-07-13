/** One FCFA formatter for the whole surface — fr-FR grouping (narrow
 * no-break space); the card renders it tabular on the canvas. SON prix, always
 * a whole confident figure — never « à partir de », never a struck rebate. */
export const FCFA = new Intl.NumberFormat('fr-FR');

/** HTML-escape for every MODEL-DERIVED string a DOM renderer interpolates
 * (same discipline as the buyer PWA: nothing non-constant reaches innerHTML
 * raw). Catalog strings stay unescaped — they are OUR copy. */
export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
