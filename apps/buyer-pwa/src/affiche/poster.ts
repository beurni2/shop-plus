import { encodeQr } from '../qr/encoder';
import { t, tf } from '../i18n';
import { resolveStorefrontPort } from '../vitrine/profile';
import { vitrineHref } from '../vitrine-link';

/**
 * ═══ AFFICHE-QR (founder, 2026-08-15: « the option to print the QR code ») ═══
 *
 * The reseller app's « Imprimer le code QR » opens `/v/{slug}?affiche=qr` —
 * THIS page: her boutique QR as a print-ready sheet. Printing goes through the
 * BROWSER deliberately: a print kiosk in Ouagadougou prints from a link or a
 * browser tab, not from a phone's own printer dialog — and the browser's print
 * dialog also saves the PDF she forwards on WhatsApp. Same query-param dress
 * pattern as `apercu-nu` (the en-tête preview): it changes what this one render
 * draws and nothing that is stored.
 *
 * WHAT THE SHEET ENCODES is the boutique URL derived from the CURRENT route
 * (`vitrineHref` — base-aware, so a Pages sub-path deploy prints a QR that
 * lands). The QR matrix comes from the vendored ISO 18004 encoder — the SAME
 * file the reseller app carries, pinned byte-identical by `test/affiche.test.ts`
 * — so what her phone previews and what the paper says can never drift.
 *
 * HER NAME arrives from the real storefront port, best-effort: the sheet
 * renders complete without it (QR, link, spoken code) and the name lands when
 * the resolve does. A failed read prints an honest sheet, never a fabricated
 * shop. Server bytes (the name) travel through `textContent` only — the repo's
 * standing law; the slug is safe by construction (`/v/([a-z0-9-]+)`).
 */

/** The print sheet's own styles — mounted with the page, print rules included. */
const AFFICHE_STYLES = `
  .af-page { min-height: 100vh; background: #FFFFFF; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 18px; padding: 32px 24px; text-align: center; }
  .af-nom { font-size: 28px; font-weight: 800; color: #1C1710; margin: 0; overflow-wrap: anywhere; }
  .af-qr { width: min(72vw, 340px); height: auto; }
  .af-legende { font-size: 15px; color: #6F6355; margin: 0; }
  .af-lien { font-size: 14px; color: #1C1710; margin: 0; overflow-wrap: anywhere; }
  .af-code { font-size: 20px; font-weight: 800; letter-spacing: 1px; color: #1C1710; margin: 0; }
  .af-imprimer { font-size: 16px; font-weight: 700; padding: 14px 28px; border-radius: 14px;
    border: none; background: #A31D4E; color: #FCF4EE; min-height: 44px; }
  @media print {
    .af-imprimer { display: none; }
    .af-page { min-height: auto; }
  }
`;

/** The QR as an inline SVG — the encoder's matrix, run-merged per row into as
 *  few rects as possible, a 4-module quiet zone carried by the viewBox. Pure
 *  string composition from module booleans; no external input enters it. */
export function qrSvg(url: string): string {
  const qr = encodeQr(url);
  const quiet = 4;
  const side = qr.size + 2 * quiet;
  const rects: string[] = [];
  for (let r = 0; r < qr.size; r++) {
    let c = 0;
    while (c < qr.size) {
      if (!qr.modules[r]![c]) { c++; continue; }
      let run = 1;
      while (c + run < qr.size && qr.modules[r]![c + run]) run++;
      rects.push(`<rect x="${c + quiet}" y="${r + quiet}" width="${run}" height="1"/>`);
      c += run;
    }
  }
  return `<svg class="af-qr" viewBox="0 0 ${side} ${side}" role="img" aria-hidden="true" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="#FFFFFF"/><g fill="#1C1710">${rects.join('')}</g></svg>`;
}

export function mountAffiche(host: HTMLElement, slug: string): void {
  const style = document.createElement('style');
  style.setAttribute('data-affiche', '');
  style.textContent = AFFICHE_STYLES;
  document.head.appendChild(style);

  const url = `${window.location.origin}${vitrineHref(window.location.pathname, slug)}`;

  const page = document.createElement('main');
  page.className = 'af-page';
  page.setAttribute('data-role', 'affiche-qr');

  const nom = document.createElement('h1');
  nom.className = 'af-nom';
  nom.setAttribute('data-role', 'affiche-nom');
  nom.textContent = ''; // the real name lands with the resolve; empty is honest

  const qrHost = document.createElement('div');
  qrHost.innerHTML = qrSvg(url); // composed above from booleans only

  const legende = document.createElement('p');
  legende.className = 'af-legende';
  legende.textContent = t('affiche.legende');

  const lien = document.createElement('p');
  lien.className = 'af-lien';
  lien.textContent = url;

  const code = document.createElement('p');
  code.className = 'af-code';
  code.textContent = tf('affiche.code', { code: slug.toUpperCase() });

  const imprimer = document.createElement('button');
  imprimer.className = 'af-imprimer';
  imprimer.setAttribute('data-role', 'affiche-imprimer');
  imprimer.textContent = t('affiche.imprimer');
  imprimer.addEventListener('click', () => window.print());

  page.append(nom, qrHost, legende, lien, code, imprimer);
  host.append(page);

  // Best-effort: the sheet is already complete; the name is a courtesy.
  void resolveStorefrontPort()
    .resolve(slug)
    .then((res) => {
      if (res !== undefined) nom.textContent = res.storefront.name;
    })
    .catch(() => {});
}
