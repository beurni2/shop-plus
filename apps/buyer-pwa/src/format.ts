/** One FCFA formatter for the whole surface — fr-FR grouping (narrow
 * no-break space), tabular rendering handled by the type layer
 * (money.tabularNumerals). */
export const FCFA = new Intl.NumberFormat('fr-FR');

/** HTML-escape for every MODEL-DERIVED string a renderer interpolates
 * (verifier NB①: the render layer writes innerHTML — nothing non-constant
 * may reach it raw, today self-XSS, tomorrow stored-XSS when supplier
 * names flow in). Catalog strings stay unescaped: they are OUR copy. */
export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
