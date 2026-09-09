import { t } from './i18n';
import { esc } from './format';
import { signedHref, signedProductSlugFromPath, vitrineHref, vitrineSlugFromPath } from './vitrine-link';
import { LISTE_TOKEN } from './vitrine/liste';

/**
 * ═══ RACINE-HONNETE-1 (AUDIT-SHOP-2 F-19, F-63) — THE HONEST FRONT DOOR ═══
 *
 * Until a real discovery producer exists (F-95), a buyer who types the app's
 * address meets NO invented sellers: the root says the one true thing about
 * how Shop+ is entered — a boutique opens from the link her seller sent —
 * and takes that link. The demo directory (`boutiques-view`) survives ONLY
 * behind the `?demo-boutiques=` harness lever, as the gallery it always was.
 *
 * What the card accepts (`routeDepuisLien`): the two link forms the system
 * emits — `/v/{slug}` (the boutique, optionally `?liste=`) and
 * `/s/{slug}?pid=` (the signed offer) — as a full address or a bare path, in
 * any letter case, plus the slug alone. Every outbound href is base-aware
 * (`vitrineHref` / `signedHref`), so it lands under the deploy base on Pages
 * exactly as the C-ENT entries do. Anything else is refused on the card with
 * one sentence and the field kept — never a navigation to nowhere.
 *
 * Offline is a designed state here too (F-63): `navigator.onLine` false
 * paints the ink band, and the field stays usable — a pasted link still opens
 * the boutique's own offline card, whose « Réessayer » speaks when the
 * network returns.
 */

export type RouteLien =
  | { readonly kind: 'vitrine'; readonly slug: string; readonly liste?: string }
  | { readonly kind: 'offre'; readonly slug: string; readonly pid?: string };

const SLUG_SEUL = /^[a-z0-9-]+$/;

/** Parse what she pasted into one of the two canon routes, or nothing. */
export function routeDepuisLien(texte: string): RouteLien | undefined {
  // WhatsApp pastes arrive with quotes, guillemets and stray spaces around them.
  const brut = texte.trim().replace(/^[«»"'\s]+|[«»"'\s]+$/g, '').trim();
  if (brut === '') return undefined;
  const bas = brut.toLowerCase();
  if (SLUG_SEUL.test(bas)) return { kind: 'vitrine', slug: bas };
  let url: URL;
  try {
    url = new URL(bas, 'https://shop-plus.invalid/');
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  const vitrine = vitrineSlugFromPath(url.pathname);
  if (vitrine !== undefined) {
    // `liste` tokens are case-sensitive bytes: read them off the ORIGINAL text.
    const liste = new URL(brut, 'https://shop-plus.invalid/').searchParams.get('liste');
    return liste !== null && LISTE_TOKEN.test(liste) ? { kind: 'vitrine', slug: vitrine, liste } : { kind: 'vitrine', slug: vitrine };
  }
  const offre = signedProductSlugFromPath(url.pathname);
  if (offre !== undefined) {
    const pid = new URL(brut, 'https://shop-plus.invalid/').searchParams.get('pid');
    return pid !== null && pid !== '' ? { kind: 'offre', slug: offre, pid } : { kind: 'offre', slug: offre };
  }
  return undefined;
}

/** The base-aware href for a parsed route, against the CURRENT pathname. */
export function hrefDeRoute(route: RouteLien, pathname: string): string {
  if (route.kind === 'offre') return signedHref(pathname, route.slug, route.pid ?? '');
  const href = vitrineHref(pathname, route.slug);
  return route.liste !== undefined ? `${href}?liste=${route.liste}` : href;
}

export function renderRacine(opts: { readonly enLigne: boolean }): string {
  return [
    '<section class="racine" data-screen="racine">',
    `<header class="racine-tete"><h1 class="racine-marque">${t('app.title')}</h1></header>`,
    opts.enLigne ? '' : `<p class="offline-banner" data-role="offline">${t('racine.hors_ligne')}</p>`,
    `<h2 class="racine-titre">${t('racine.titre')}</h2>`,
    `<p class="racine-sous">${t('racine.sous_titre')}</p>`,
    '<form class="racine-form" data-role="racine-form" novalidate>',
    `<label class="field"><span class="field-label">${t('racine.lien_label')}</span>`,
    `<input class="field-input racine-input" type="text" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" data-role="racine-lien" placeholder="${esc(t('racine.lien_placeholder'))}" aria-describedby="racine-refus"></label>`,
    `<p class="racine-refus" id="racine-refus" data-role="racine-refus" role="alert" hidden>${t('racine.refus')}</p>`,
    `<button class="primary-action" type="submit" data-action="racine-ouvrir">${t('racine.ouvrir')}</button>`,
    '</form>',
    `<p class="racine-pied">${t('racine.pied')}</p>`,
    '</section>',
  ].join('');
}

/**
 * Mount the card and wire its one act. `naviguer` is the browser's own
 * `location.assign` in the app; the walk hands in a recorder.
 */
export function monterRacine(
  main: HTMLElement,
  opts: { readonly enLigne: boolean; readonly pathname: string; readonly naviguer?: (href: string) => void },
): void {
  main.innerHTML = renderRacine({ enLigne: opts.enLigne });
  const form = main.querySelector('[data-role="racine-form"]');
  const champ = main.querySelector('[data-role="racine-lien"]');
  const refus = main.querySelector('[data-role="racine-refus"]');
  if (!(form instanceof HTMLFormElement) || !(champ instanceof HTMLInputElement) || !(refus instanceof HTMLElement)) return;
  const naviguer = opts.naviguer ?? ((href: string) => { window.location.assign(href); });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const route = routeDepuisLien(champ.value);
    if (route === undefined) {
      refus.hidden = false;
      champ.setAttribute('aria-invalid', 'true');
      champ.focus();
      return;
    }
    naviguer(hrefDeRoute(route, opts.pathname));
  });
  champ.addEventListener('input', () => {
    refus.hidden = true;
    champ.removeAttribute('aria-invalid');
  });
}
