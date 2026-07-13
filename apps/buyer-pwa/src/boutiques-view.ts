import { t, tf } from './i18n';
import { esc } from './format';
import {
  allBoutiques,
  filterBoutiques,
  BOUTIQUE_ZONES,
  type BoutiqueEntry,
  type BoutiqueQuand,
} from './boutiques-data';

/**
 * WO-7.2a — S3 DÉCOUVERTE (buyer PWA, /boutiques). The buyer's store directory.
 * Stores, never a product feed (SP-I05); the deterministic order (« dernière
 * mise à jour, la plus récente d'abord ») is rendered ON-SCREEN, never a hidden
 * score (SP-I11). No price and no product photo in the list (« le prix vit dans
 * la vitrine ») and no supplier/commission anywhere. Every state is designed:
 * default · skeleton · results · no-results (dignified, one tap out) · offline
 * (yesterday's list, search honestly disabled) · network error (distinct from
 * offline). Copy is copy.md S3, register-tagged; nothing invented.
 */

export type BoutiqueState = 'default' | 'skeleton' | 'results' | 'empty' | 'offline' | 'error';

function quandLabel(q: BoutiqueQuand): string {
  if (q.kind === 'jours') return tf('boutiques.quand_jours', { n: String(q.n ?? 0) });
  return t(q.kind === 'hier' ? 'boutiques.quand_hier' : 'boutiques.quand_semaine');
}

/** Escape, then bold the first case-insensitive match of the query (« engraissé »). */
function highlight(text: string, query: string): string {
  const safe = esc(text);
  const q = query.trim();
  if (q === '') return safe;
  const at = safe.toLowerCase().indexOf(esc(q).toLowerCase());
  if (at < 0) return safe;
  const end = at + esc(q).length;
  return `${safe.slice(0, at)}<strong>${safe.slice(at, end)}</strong>${safe.slice(end)}`;
}

function verifiedCheck(): string {
  // Small ink check disc — the « Vérifiée » mark, only where true (SP-I19).
  return (
    '<svg class="bq-verified-mark" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10" fill="currentColor"></circle>' +
    '<path d="M8 12.5l2.6 2.6L16.5 9" fill="none" stroke="var(--c-paper)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
  );
}

function chevron(): string {
  return (
    '<svg class="bq-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9.5 6l6 6-6 6"></path></svg>'
  );
}

function storeCard(s: BoutiqueEntry, query: string): string {
  const initial = esc(s.storeName.replace(/^(CHEZ|BOUTIQUE)\s+/i, '').charAt(0));
  const meta = tf('boutiques.carte_meta', {
    // « engraissé » applies wherever the term matched — name OR zone.
    zone: highlight(s.zone, query),
    n: String(s.productCount),
    quand: quandLabel(s.quand),
  });
  const verified = s.verified
    ? `${verifiedCheck()}<span class="bq-verified-label">${t('boutiques.carte_verifiee')}</span>`
    : '';
  // Tap opens HER vitrine at the canon /v/{slug} — never a query-string.
  return [
    `<a class="bq-card" data-role="boutique" href="/v/${esc(s.slug)}">`,
    `<span class="bq-avatar" aria-hidden="true"><span class="bq-avatar-initial">${initial}</span></span>`,
    '<span class="bq-card-body">',
    `<span class="bq-card-head"><span class="bq-store-name">${highlight(s.storeName, query)}</span>${verified}</span>`,
    `<span class="bq-card-meta">${meta}</span>`,
    '</span>',
    chevron(),
    '</a>',
  ].join('');
}

function skeletonRow(): string {
  return (
    '<div class="bq-card bq-card-skeleton" aria-hidden="true">' +
    '<span class="bq-avatar skeleton-fill"></span>' +
    '<span class="bq-card-body"><span class="skeleton-line skeleton-line-mid"></span>' +
    '<span class="skeleton-line skeleton-line-wide"></span></span></div>'
  );
}

function header(): string {
  return [
    '<header class="bq-header">',
    `<h1 class="bq-title">${t('boutiques.titre')}</h1>`,
    `<p class="bq-subtitle">${t('boutiques.sous_titre')}</p>`,
    '</header>',
  ].join('');
}

function searchBar(disabled: boolean): string {
  const attrs = disabled ? ' aria-disabled="true" data-disabled="true"' : '';
  const note = disabled ? `<p class="bq-search-note">${t('boutiques.recherche_offline')}</p>` : '';
  return [
    `<div class="bq-search"${attrs}>`,
    `<input class="bq-search-input" type="search" placeholder="${esc(t('boutiques.recherche_placeholder'))}"${disabled ? ' disabled' : ''} />`,
    note,
    '</div>',
  ].join('');
}

function zoneChips(): string {
  const toutes = `<span class="chip chip-on bq-zone">${t('boutiques.zone_toutes')}</span>`;
  const zones = BOUTIQUE_ZONES.map((z) => `<span class="chip bq-zone">${esc(z)}</span>`).join('');
  return `<div class="chips bq-zones">${toutes}${zones}</div>`;
}

function countLine(state: BoutiqueState, n: number, query: string): string {
  if (state === 'offline') return tf('boutiques.compte_hier', { n: String(n) });
  if (state === 'results') return tf('boutiques.compte_saisie', { n: String(n), q: esc(query) });
  return tf('boutiques.compte', { n: String(n) });
}

function noResults(query: string): string {
  // copy.md gives ONE string (« Rien pour “{q}” — essayez… »); the « VOIR TOUTES
  // LES BOUTIQUES » exit is the mockup's one-tap-out (never a wall, no « suggestions »).
  return [
    '<div class="bq-empty" data-role="boutiques-empty">',
    `<p class="bq-empty-title">${tf('boutiques.aucun', { q: esc(query) })}</p>`,
    `<a class="secondary-action" data-action="voir-tout" href="/boutiques">${t('boutiques.aucun_action')}</a>`,
    '</div>',
  ].join('');
}

function errorBox(): string {
  return [
    '<div class="bq-error empty-state" data-role="boutiques-error">',
    `<p class="bq-error-title">${t('boutiques.erreur_titre')}</p>`,
    `<p class="bq-error-hint">${t('boutiques.erreur_hint')}</p>`,
    `<a class="secondary-action" data-action="reessayer" href="/boutiques">${t('boutiques.reessayer')}</a>`,
    '</div>',
  ].join('');
}

export function renderBoutiques(opts: { state: BoutiqueState; query?: string } = { state: 'default' }): string {
  const state = opts.state;
  const query = opts.query ?? '';
  const parts: string[] = ['<section class="boutiques" data-screen="boutiques">', header()];

  if (state === 'offline') {
    parts.push(`<p class="offline-banner" data-role="offline">${t('boutiques.hors_ligne')}</p>`);
  }

  parts.push(searchBar(state === 'offline'), zoneChips());

  if (state === 'error') {
    parts.push(errorBox(), `<p class="bq-foot">${t('boutiques.pied')}</p>`, '</section>');
    return parts.join('');
  }

  const stores = state === 'results' || state === 'empty' ? filterBoutiques(query) : allBoutiques();

  if (state === 'skeleton') {
    parts.push('<div class="bq-list" data-role="boutiques-skeleton">', skeletonRow().repeat(4), '</div>');
    parts.push(`<p class="bq-foot">${t('boutiques.pied')}</p>`, '</section>');
    return parts.join('');
  }

  // count + the ON-SCREEN ordering sentence (SP-I11 — never a hidden score).
  parts.push(`<p class="bq-count" data-role="boutiques-count">${countLine(state, stores.length, query)}</p>`);
  parts.push(
    `<p class="bq-order" data-role="ordering-sentence">${t(state === 'results' ? 'boutiques.ordre_court' : 'boutiques.ordre')}</p>`,
  );

  if (state === 'empty' || stores.length === 0) {
    parts.push(noResults(query));
  } else {
    parts.push(
      '<div class="bq-list" data-role="boutiques-list">',
      stores.map((s) => storeCard(s, state === 'results' ? query : '')).join(''),
      '</div>',
    );
  }

  parts.push(`<p class="bq-foot">${t('boutiques.pied')}</p>`, '</section>');
  return parts.join('');
}
