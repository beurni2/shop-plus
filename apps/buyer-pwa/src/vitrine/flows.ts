/**
 * VITRINE — §4 machine à états & flux (buyer side).
 *
 * §4.2 loading (squelette C-VIT8) → ready · offline (retry → 900 ms squelette)
 * · invalid (unknown slug — honest not-found; a PRIVATE vitrine resolves like
 * a public one, loi 4: no « boutique fermée » state exists in this machine) ·
 * empty (0 articles → V6). §4.4 timers: squelette 750 ms; « Réessayer »
 * 900 ms. Attribution: an IDENTITY-scope arrival (A8, last-touch) is recorded
 * on land — the same seam as before, byte-unchanged (§0 loi 3: the attribution
 * is locked to the link; navigating vitrine → product keeps it).
 *
 * Tile tap → the SIGNED product page of THAT product under the SAME
 * attribution (the existing journey spine is ENTERED, never modified).
 */

import { t } from '../i18n';
import { recordVitrineArrival, signedHref } from '../vitrine-link';
import { demoStorefrontPort, type StorefrontProfilePort } from './profile';
import {
  renderVitrineEmpty,
  renderVitrineInvalid,
  renderVitrineOffline,
  renderVitrineReady,
  renderVitrineSkeleton,
} from './render';
import { applyTheme, DEFAULT_THEME } from './themes';
import { VITRINE_STYLES } from './styles';
import { iconCheck } from './icons';
import { wireVoicePlay } from './voice-player';

export type VitrineEtat = 'loading' | 'ready' | 'empty' | 'offline' | 'invalid';

export interface VitrineHarness {
  /** Gate/audit-only overrides (like ?demo-journey) — never the shared link. */
  readonly etat?: VitrineEtat | undefined;
  readonly profil?: 'default' | 'customised' | 'empty' | undefined;
  readonly fromProduct?: boolean | undefined;
  /** Freeze timers for the audit (no 750 ms transition). */
  readonly fige?: boolean | undefined;
}

const SKELETON_MS = 750;
const RETRY_MS = 900;
const enum Never {}
void 0 as unknown as Never; // keep const enum from being elided as unused

export function mountVitrine(host: HTMLElement, slug: string, harness: VitrineHarness = {}): void {
  const style = document.createElement('style');
  style.setAttribute('data-vitrine', '');
  style.textContent = VITRINE_STYLES;
  document.head.appendChild(style);

  const port: StorefrontProfilePort = demoStorefrontPort(harness.profil ?? 'default');
  const root = document.createElement('div');
  root.className = 'vt-root';
  root.setAttribute('data-screen', 'vitrine');
  host.appendChild(root);

  const fromProduct = harness.fromProduct ?? false;

  // « La voix » tile chips play here (tap only, never autoplay). Attached once;
  // it no-ops on every non-voice click and survives re-renders (delegated).
  wireVoicePlay(root);

  const show = (etat: VitrineEtat): void => {
    const resolved = port.resolve(slug);
    if (etat !== 'invalid' && !resolved) etat = 'invalid';
    const sf = resolved?.storefront;
    applyTheme(root, sf?.theme ?? DEFAULT_THEME);
    root.setAttribute('data-etat', etat);
    switch (etat) {
      case 'loading':
        root.innerHTML = renderVitrineSkeleton();
        break;
      case 'offline':
        root.innerHTML = renderVitrineOffline();
        break;
      case 'invalid':
        root.innerHTML = renderVitrineInvalid();
        break;
      case 'empty':
        root.innerHTML = renderVitrineEmpty(sf!, resolved!.trust, { fromProduct });
        break;
      case 'ready':
        root.innerHTML =
          sf!.curatedItems.length === 0
            ? renderVitrineEmpty(sf!, resolved!.trust, { fromProduct })
            : renderVitrineReady(sf!, resolved!.trust, { fromProduct }, resolved!.notes);
        break;
    }
  };

  // Arrival attribution — best-effort, never blocks the render (unchanged seam).
  const resolved = port.resolve(slug);
  if (resolved) {
    try {
      recordVitrineArrival(
        {
          resellerId: resolved.storefront.resellerId,
          shortCode: '',
          slug,
          view: { resellerName: resolved.storefront.name, zone: resolved.storefront.zone, products: [] },
          reputation: { count: resolved.trust.deliveredCount, demo: resolved.trust.demo },
        },
        new Date().toISOString(),
        `vitrine-${slug}-${Date.now()}`,
        window.sessionStorage,
      );
    } catch {
      /* storage unavailable — arrival is best-effort */
    }
  }

  // §4.2: harness state wins (frozen for the audit); else loading → ready.
  if (harness.etat) {
    show(harness.etat);
  } else if (harness.fige) {
    show('ready');
  } else {
    show('loading');
    window.setTimeout(() => show('ready'), SKELETON_MS);
  }

  root.addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest('[data-action]');
    if (!target) return;
    const action = target.getAttribute('data-action');
    if (action === 'produit') {
      // → the signed offer of THAT product — the pixel PARCOURS D'ACHAT S1, in
      // her habillage, pid resolving against her real catalog (base-aware, the
      // same `/s/{slug}` route the reseller shares). Attribution already locked.
      const pid = target.getAttribute('data-pid') ?? '';
      window.location.href = signedHref(window.location.pathname, slug, pid);
    } else if (action === 'retour') {
      window.history.back();
    } else if (action === 'reessayer') {
      show('loading');
      window.setTimeout(() => show('ready'), RETRY_MS);
    } else if (action === 'decouvrir') {
      window.location.href = '/boutiques';
    } else if (action === 'partager') {
      const url = `${window.location.origin}${window.location.pathname}`;
      const done = (): void => toast(root, t('vit.toast_copie'));
      if (navigator.share) {
        navigator.share({ url }).catch(() => void 0);
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(done, done);
      } else {
        done();
      }
    }
  });
}

function toast(root: HTMLElement, message: string): void {
  root.querySelector('.vt-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'vt-toast';
  el.innerHTML = `${iconCheck(14, '#8FD4B4', 2.6)}${message}`;
  root.appendChild(el);
  window.setTimeout(() => el.remove(), 2800);
}
