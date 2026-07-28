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

import { isFavorite, toggleFavorite } from './favorites';
import { t } from '../i18n';
import { recordVitrineArrival, signedHref } from '../vitrine-link';
import { demoStorefrontPort, resolveStorefrontPort, type StorefrontProfilePort } from './profile';
import {
  renderVitrineEmpty,
  renderVitrineInvalid,
  renderVitrineOffline,
  renderVitrineReady,
  renderVitrineSkeleton,
} from './render';
import { applyTheme, DEFAULT_THEME } from './themes';
import { VITRINE_STYLES } from './styles';
import { ENTETES_STYLES, type EnteteKey } from './entetes';
import { iconCheck } from './icons';
import { wireVoicePlay } from './voice-player';

export type VitrineEtat = 'loading' | 'ready' | 'empty' | 'offline' | 'invalid';

export interface VitrineHarness {
  /** Gate/audit-only overrides (harness levers) — never the shared link. */
  readonly etat?: VitrineEtat | undefined;
  readonly profil?: 'default' | 'customised' | 'empty' | undefined;
  readonly fromProduct?: boolean | undefined;
  /** Freeze timers for the audit (no 750 ms transition). */
  readonly fige?: boolean | undefined;
  /** ENTETES-A — the founder's `?entete=` header preview. Absent ⇒ classique. */
  readonly entete?: EnteteKey | undefined;
}

/**
 * BUYER-LIVE-WIRE-2 — WHICH PORT A `/v/{slug}` ENTRY GETS, made a decision that can
 * be TESTED instead of a ternary buried in the route dispatch.
 *
 * ═══ THE DEFECT THIS CLOSES (founder-caught on the live deploy) ═══
 *
 * `mountVitrine` picks `harness.profil ? demoStorefrontPort(profil) :
 * resolveStorefrontPort()`. The `/v/` route in `main.ts` passed
 * `profil: profilParam === 'perso' ? 'customised' : profilParam === 'vide' ? 'empty'
 * : 'default'` — a ternary chain with **NO undefined branch**, so an absent
 * `?demo-vitrine-profil` still produced the truthy `'default'`.
 *
 * **`harness.profil` was therefore ALWAYS truthy, and `resolveStorefrontPort()` was
 * UNREACHABLE from the one route that carries real shared links.** Wiring
 * `VITE_STOREFRONT_BASE` put the service URL in the bundle correctly and the route
 * never read it: a real storefront resolved against the DEMO adapter, where only
 * `aicha-4821` exists, so every real slug rendered the honest not-found.
 *
 * The `/s/{slug}` route already had this right (`isRealPath ? resolveStorefrontPort()
 * : demoStorefrontPort(profil)`), which is why the two routes disagreed.
 *
 * ═══ WHY THIS IS A FUNCTION AND NOT A ONE-CHARACTER FIX ═══
 *
 * The bug was invisible to every check that existed: the value WAS in the bundle, the
 * build WAS green, the content hash DID match. None of those could see that nothing
 * read it. A decision that can be unit-tested is the only kind that fails loudly, so
 * the rule lives here with a test that drives both branches by value.
 *
 * THE RULE: a harness profil applies ONLY to a harness entry (`?demo-vitrine=…`).
 * A REAL path entry gets `undefined`, which is what routes it to the env-gated port.
 */
export function harnessProfil(
  isRealPath: boolean,
  profilParam: string | null,
): 'default' | 'customised' | 'empty' | undefined {
  // A real shared link NEVER takes a demo profil — not even the default one.
  if (isRealPath) return undefined;
  if (profilParam === 'perso') return 'customised';
  if (profilParam === 'vide') return 'empty';
  return 'default';
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

  // ENTETES-A — the five headers' sheet, its own element so the vitrine sheet
  // stays byte-unchanged. Every rule is scoped under a per-style root class
  // (.vt-ry/.vt-he/.vt-ch/.vt-cr/.vt-dy), so nothing leaks into the page or
  // between styles even though all five are always present.
  //
  // Verifier (perf, HANDOFF §6): classique — every EXISTING shop — must not pay
  // the 33.7 KB parse for CSS it never matches; the sheet mounts only when one
  // of the five is actually selected.
  const entete: EnteteKey = harness.entete ?? 'classique';
  if (entete !== 'classique') {
    const enteteStyle = document.createElement('style');
    enteteStyle.setAttribute('data-entetes', '');
    enteteStyle.textContent = ENTETES_STYLES;
    document.head.appendChild(enteteStyle);
  }

  // The audit harness (a profil override) drives the DEMO adapter; a real entry
  // uses the env-gated port — the real HTTP adapter iff a service base is
  // configured at build time, the in-process demo otherwise (offline-safe).
  const port: StorefrontProfilePort = harness.profil ? demoStorefrontPort(harness.profil) : resolveStorefrontPort();
  const root = document.createElement('div');
  root.className = 'vt-root';
  root.setAttribute('data-screen', 'vitrine');
  host.appendChild(root);

  const fromProduct = harness.fromProduct ?? false;

  // « La voix » tile chips play here (tap only, never autoplay). Attached once;
  // it no-ops on every non-voice click and survives re-renders (delegated).
  wireVoicePlay(root);

  type Resolved = Awaited<ReturnType<StorefrontProfilePort['resolve']>>;

  // Render from an ALREADY-RESOLVED value — the resolve happens ONCE per load
  // (never re-resolved per state), the widened async seam feeding this.
  const render = (etat: VitrineEtat, resolved: Resolved): void => {
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
        root.innerHTML = renderVitrineEmpty(sf!, resolved!.trust, { fromProduct }, entete);
        break;
      case 'ready': {
        // BUYER-LIVE-WIRE-3 — the empty/ready decision follows WHAT CAN ACTUALLY
        // BE SHOWN, not membership alone. `curatedItems` is the membership truth,
        // but a pid the service could not describe yields no tile — so deciding on
        // membership alone rendered the READY screen with an EMPTY GRID, which
        // reads as a broken page rather than an honest state. When the service
        // described products, THAT list decides; otherwise membership does.
        const described = resolved!.products;
        const showable = described !== undefined ? described.length : sf!.curatedItems.length;
        root.innerHTML =
          showable === 0
            ? renderVitrineEmpty(sf!, resolved!.trust, { fromProduct }, entete)
            : renderVitrineReady(sf!, resolved!.trust, { fromProduct }, resolved!.notes, described, entete);
        break;
      }
    }
  };

  // Arrival attribution — best-effort, never blocks the render (unchanged seam).
  const recordArrival = (resolved: Resolved): void => {
    if (!resolved) return;
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
  };

  // Resolve ONCE per load and drive the state. §4.2: harness state wins (frozen
  // for the audit); else the existing squelette shows WHILE the resolve is in
  // flight (no new spinner) and holds ≥ SKELETON_MS, then ready/empty/invalid.
  const load = (skeletonMs: number, isInitial: boolean): void => {
    if (harness.etat !== undefined) {
      void port.resolve(slug).then((resolved) => {
        if (isInitial) recordArrival(resolved);
        render(harness.etat!, resolved);
      });
      return;
    }
    if (harness.fige === true) {
      void port.resolve(slug).then((resolved) => {
        if (isInitial) recordArrival(resolved);
        render('ready', resolved);
      });
      return;
    }
    render('loading', undefined);
    const started = Date.now();
    void port.resolve(slug).then((resolved) => {
      if (isInitial) recordArrival(resolved);
      const wait = Math.max(0, skeletonMs - (Date.now() - started));
      window.setTimeout(() => render('ready', resolved), wait);
    });
  };

  load(SKELETON_MS, true);

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
    } else if (action === 'favori') {
      // NORTH-STAR-1 — the REAL heart. closest() resolved THIS element, so the
      // tile's `produit` navigation does not fire; preventDefault for parity with
      // the voice chip. EVERY heart carrying this pid flips (verifier blocker: a
      // product can sit in the featured card AND a section — updating only the
      // tapped node left its twin stale, and a tap on the stale twin silently
      // REVERSED the store while looking like a fix).
      ev.preventDefault();
      const pid = target.getAttribute('data-pid') ?? '';
      applyFavoriteState(root, pid, toggleFavorite(pid));
      toast(root, t(isFavorite(pid) ? 'vit.favori_garde' : 'vit.favori_retire'));
    } else if (action === 'ancre') {
      // NORTH-STAR round 3 — « Voir tout » is a SCROLL, not a page (the boutique
      // IS this page); a link to nowhere would be the dead button the canon bans.
      const cible = target.getAttribute('data-cible') ?? '';
      document.getElementById(cible)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (action === 'retour') {
      window.history.back();
    } else if (action === 'reessayer') {
      load(RETRY_MS, false);
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

/** Flip every heart carrying this pid — exported so the sync is testable by
 *  execution against a stub root, not by grepping source text. */
export function applyFavoriteState(
  scope: { querySelectorAll(sel: string): ArrayLike<Element> & Iterable<Element> },
  pid: string,
  on: boolean,
): void {
  for (const el of scope.querySelectorAll(`[data-action="favori"][data-pid="${pid}"]`)) {
    el.classList.toggle('vt-fav-on', on);
    el.setAttribute('aria-pressed', String(on));
  }
}

function toast(root: HTMLElement, message: string): void {
  root.querySelector('.vt-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'vt-toast';
  el.innerHTML = `${iconCheck(14, '#8FD4B4', 2.6)}${message}`;
  root.appendChild(el);
  window.setTimeout(() => el.remove(), 2800);
}
