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
import { inPanier, togglePanier } from './panier';
import { t } from '../i18n';
import { recordVitrineArrival, signedHref, vitrineHref } from '../vitrine-link';
import { demoStorefrontPort, resolveStorefrontPort, VitrineOffline, type StorefrontProfilePort } from './profile';
import { garderListe, listeGardee, resolveListePort, LISTE_MAX_ARTICLES, type ListeLecture, type ListeLivraison } from './liste';
import { villeDe } from '../cliente/quote-port';
import type { VitrineProduct } from './catalog';
import {
  articlesPourListe,
  articlesPourModif,
  renderListeGestion,
  renderListeModif,
  renderVitrineEmpty,
  renderVitrineInvalid,
  renderVitrineOffline,
  renderPanierBand,
  renderListeAmie,
  renderListeBand,
  renderListeChargement,
  renderListeHorsLigne,
  renderListeIntrouvable,
  renderListeLien,
  renderListeSheet,
  renderVitrineReady,
  renderVitrineSkeleton,
} from './render';
import { applyTheme, DEFAULT_THEME } from './themes';
import { VITRINE_STYLES } from './styles';
import { ENTETES_STYLES, type EnteteKey } from './entetes';
import { loadEntete, loadedEnteteCss } from './entetes/registry';
import { iconCheck } from './icons';
import { wireVoicePlay } from './voice-player';
import { mountVideoScroll } from './video-scroll';

/** V-1e — the live observer's unmount; replaced on every ready render. */
let demonteVideos: () => void = () => {};

export type VitrineEtat = 'loading' | 'ready' | 'empty' | 'offline' | 'invalid';

export interface VitrineHarness {
  /** Gate/audit-only overrides (harness levers) — never the shared link. */
  readonly etat?: VitrineEtat | undefined;
  readonly profil?: 'default' | 'customised' | 'empty' | undefined;
  readonly fromProduct?: boolean | undefined;
  /** Freeze timers for the audit (no 750 ms transition). */
  readonly fige?: boolean | undefined;
  /** ENTETES-A/B — the founder's `?entete=` preview OVERRIDE. Present ⇒ it wins
   *  over the storefront's own `headerStyle`; ABSENT (undefined) ⇒ the field
   *  drives the render (classique when the field is absent too). */
  readonly entete?: EnteteKey | undefined;
  /** APERÇU NU — render her header with EMPTY photo frames, so the frame itself
   *  is what he sees while choosing. View-only; nothing is saved. */
  readonly sansPhotos?: boolean | undefined;
}

/**
 * ENTETES-B — WHICH HEADER MOUNTS, as a pure decision (the harnessProfil
 * precedent: a rule buried in the mount is a rule no test can fail loudly).
 *
 * The `?entete=` override is the founder's preview lever and WINS when present
 * — byte-for-byte its ENTETES-A behaviour. With no override, HER CHOSEN
 * `headerStyle` drives; a storefront not yet resolved (loading/offline/invalid)
 * renders classique, exactly as the pages before this field did.
 */
export function enteteForRender(
  override: EnteteKey | undefined,
  headerStyle: EnteteKey | undefined,
): EnteteKey {
  return override ?? headerStyle ?? 'classique';
}

/**
 * APERÇU NU — the header WITHOUT her photographs (founder, 2026-08-04: « on the
 * entetes webviews do not put the uploaded photo on frames, just leave it
 * blank »).
 *
 * WHY HE IS RIGHT, and it is not only taste: he is choosing between forty-three
 * FRAMES. With his own cover filling each one, the eye reads the PHOTOGRAPH —
 * the same picture, forty-three times, cropped slightly differently — and the
 * frame itself, which is the only thing that actually differs, is the part he
 * cannot see. Empty, the shape is the subject.
 *
 * PURE, AND EXPORTED, for the reason `enteteForRender` is: a rule buried in the
 * mount is a rule no test can fail loudly.
 *
 * IT REMOVES, NEVER INVENTS. The cover falls back to `status: 'none'` and the
 * avatar to its monogram — the two states a shop that never uploaded anything
 * already has, drawn by the theme's own woven default. No placeholder image, no
 * stand-in photograph: this is the honest empty header, not a fake one.
 *
 * IT IS A RENDER-TIME VIEW ONLY. Nothing is saved, nothing is patched — the
 * preview cannot alter her shop by being looked at, which is the same rule
 * « Appliquer » exists to keep.
 */
export function sansPhotos<T extends { cover: unknown; avatar: unknown }>(sf: T): T {
  return { ...sf, cover: { status: 'none' }, avatar: { mode: 'monogram' } };
}

/** ENTETES-A perf guard, kept for BOTH sources: classique — every shop that
 *  never chose — must not pay the entetes sheet parse for CSS it cannot match. */
export function needsEnteteSheet(key: EnteteKey): boolean {
  return key !== 'classique';
}

/**
 * WHICH STATE ACTUALLY RENDERS — a pure decision (founder field report: « voir
 * ma boutique en ligne » showed « Ce lien ne mène à aucune boutique » BEFORE
 * the shop appeared).
 *
 * ONLY the states that READ the storefront (`ready`, `empty` — they dereference
 * it) fall back to the honest not-found when there is none. The old inline
 * guard was `etat !== 'invalid' && !resolved ⇒ invalid`, which also swallowed
 * `loading`: every real visit painted the terminal « aucune boutique » card for
 * the whole network round-trip, then replaced it with the shop. A designed
 * loading state exists precisely so a slow network never reads as a dead link —
 * showing a terminal error while still loading is a lie about her boutique.
 *
 * `loading` / `offline` / `invalid` render no storefront field, so they pass
 * through untouched.
 */
export function etatForRender(etat: VitrineEtat, hasResolved: boolean): VitrineEtat {
  if (hasResolved) return etat;
  return etat === 'ready' || etat === 'empty' ? 'invalid' : etat;
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

export function mountVitrine(
  host: HTMLElement,
  slug: string,
  harness: VitrineHarness = {},
  /** LISTE-ENVIES-1 — the `?liste=` token a shared liste link carries. A REAL
   *  param (shape-checked in main.ts), never a harness lever: present, the
   *  liste slot renders the FRIEND's banner from a service read; absent, it
   *  renders the creator's own band from the device-local record. */
  listeToken?: string,
): void {
  const style = document.createElement('style');
  style.setAttribute('data-vitrine', '');
  style.textContent = VITRINE_STYLES;
  document.head.appendChild(style);

  // ENTETES-A/B — the five headers' sheet, its own element so the vitrine sheet
  // stays byte-unchanged. Every rule is scoped under a per-style root class
  // (.vt-ry/.vt-he/.vt-ch/.vt-cr/.vt-dy), so nothing leaks into the page or
  // between styles even though all five are always present.
  //
  // Verifier (perf, HANDOFF §6): classique — every EXISTING shop — must not pay
  // the 33.7 KB parse for CSS it never matches; the sheet mounts only when one
  // of the five is actually selected. ENTETES-B: the selected key can now
  // arrive WITH the storefront (`headerStyle`), which resolves after mount — so
  // the sheet mounts lazily at render time, once, whichever source names a
  // non-classique key first (`?entete=` at the loading render, the field at the
  // ready render).
  //
  // ENTETES-G: a lazily-loaded style carries its OWN css in its chunk, so the
  // sheet is re-written (not appended to) whenever a new unit has arrived. One
  // <style data-entetes> element, always — appending a second would leave the
  // page's cascade depending on fetch order.
  let enteteSheetText = '';
  const ensureEnteteSheet = (): void => {
    const text = ENTETES_STYLES + loadedEnteteCss();
    if (text === enteteSheetText) return;
    enteteSheetText = text;
    const existing = document.head.querySelector('style[data-entetes]');
    const enteteStyle = existing ?? document.createElement('style');
    enteteStyle.setAttribute('data-entetes', '');
    enteteStyle.textContent = text;
    if (existing === null) document.head.appendChild(enteteStyle);
  };

  // The audit harness (a profil override) drives the DEMO adapter; a real entry
  // uses the env-gated port — the real HTTP adapter iff a service base is
  // configured at build time, the in-process demo otherwise (offline-safe).
  const port: StorefrontProfilePort = harness.profil ? demoStorefrontPort(harness.profil) : resolveStorefrontPort();
  const root = document.createElement('div');
  root.className = 'vt-root';
  root.setAttribute('data-screen', 'vitrine');
  host.appendChild(root);

  const fromProduct = harness.fromProduct ?? false;

  // « Note vocale » tile chips play here (tap only, never autoplay). Attached once;
  // it no-ops on every non-voice click and survives re-renders (delegated).
  wireVoicePlay(root);

  type Resolved = Awaited<ReturnType<StorefrontProfilePort['resolve']>>;
  // audit F3 — the mount's local view of a resolution: the storefront, a
  // not-found (`undefined`), or « pas de connexion » (`'offline'`, never a
  // value the port's own return type carries).
  type RenderInput = Resolved | 'offline';

  // PANIER-VITRINE-1 — what the last READY render drew from, kept so a panier
  // tap can refresh the band in place without re-resolving or re-rendering
  // the page (a full re-render would stop a playing voice note mid-word).
  let dernierPret: { sf: Parameters<typeof renderPanierBand>[0]; described?: Parameters<typeof renderPanierBand>[1] } | null = null;

  /* ── LISTE-ENVIES-1 — the liste slot's own little machine ──────────────── */
  const listePort = resolveListePort();
  // The friend's liste, as last read: 'chargement' while the read is in
  // flight, the port's own answer after. Cached so a band refresh never
  // refetches; « Réessayer » is the one deliberate refetch.
  let listeAmie: ListeLecture | 'chargement' = 'chargement';
  let listeDemandee = false;
  // LISTE-REFAIRE-2 — the gestion sheet's truth while it is open: her liste
  // as LAST ANSWERED BY THE SERVICE (pids + offert marks). Every Retirer /
  // Ajouter recomputes the next selection from THIS, never from the DOM.
  let listeEnGestion: { pid: string; offert: boolean }[] | null = null;
  // One act at a time (an airborne act's answer is the only truth-mover), and
  // an epoch so a READ served before an act's write can never paint over the
  // act's fresher answer (verifier MAJOR 2 — the close-and-reopen race).
  let acteEnCours = false;
  let gestionEpoch = 0;
  /** Hold ONLY what the catalogue can resolve (verifier MAJOR 1): a delisted
   *  pid renders nowhere AND rides no act — the door's membership law would
   *  422 the whole update — so it genuinely leaves on her next act, and the
   *  last-item mirror counts what she actually sees. */
  const tenirGestion = (articles: readonly { pid: string; offert: boolean }[]): void => {
    if (dernierPret === null) {
      listeEnGestion = null;
      return;
    }
    const catalogue = articlesPourModif(dernierPret.sf, dernierPret.described);
    listeEnGestion = articles.filter((a) => catalogue.has(a.pid)).map((a) => ({ pid: a.pid, offert: a.offert }));
  };
  const composeGestion = (): { miennes: { p: VitrineProduct; offert: boolean }[]; ajoutables: VitrineProduct[] } | null => {
    if (dernierPret === null || listeEnGestion === null) return null;
    // Every in-stock article is addable; her own articles render even when
    // épuisé (removing one is a reason she came).
    const catalogue = articlesPourModif(dernierPret.sf, dernierPret.described);
    const miennes: { p: VitrineProduct; offert: boolean }[] = [];
    for (const a of listeEnGestion) {
      const p = catalogue.get(a.pid);
      if (p !== undefined) miennes.push({ p, offert: a.offert });
    }
    const surListe = new Set(listeEnGestion.map((a) => a.pid));
    const ajoutables = [...catalogue.values()].filter((p) => p.inStock && !surListe.has(p.pid));
    return { miennes, ajoutables };
  };
  const remplirListeSlot = (): void => {
    const slot = root.querySelector('[data-role="vitrine-liste-slot"]');
    if (slot === null || dernierPret === null) return;
    if (listeToken === undefined) {
      slot.innerHTML = renderListeBand(dernierPret.sf);
      return;
    }
    if (listeAmie === 'chargement') {
      slot.innerHTML = renderListeChargement();
    } else if (listeAmie.status === 'liste' && listeAmie.liste.slug === dernierPret.sf.slug) {
      slot.innerHTML = renderListeAmie(listeAmie.liste, dernierPret.sf, dernierPret.described);
    } else if (listeAmie.status === 'hors-ligne') {
      slot.innerHTML = renderListeHorsLigne();
    } else {
      // Unknown token — or a token whose liste belongs to ANOTHER boutique
      // (a mismatched pairing must not drape a stranger's wishes over this
      // shop). One honest state for both.
      slot.innerHTML = renderListeIntrouvable();
    }
  };
  const chargerListe = (): void => {
    if (listeToken === undefined) return;
    listeAmie = 'chargement';
    remplirListeSlot();
    void listePort.lire(listeToken).then((res) => {
      listeAmie = res;
      remplirListeSlot();
    });
  };
  // The full absolute link — what the share sheet and the clipboard carry.
  const lienDeListe = (token: string): string =>
    `${window.location.origin}${vitrineHref(window.location.pathname, slug)}?liste=${encodeURIComponent(token)}`;
  const partagerLien = async (lien: string): Promise<void> => {
    // OS share first (the phone's own sheet — WhatsApp lives there); the
    // clipboard is the fallback, and its failure is NAMED, never silent.
    const nav = navigator as { share?: (data: { url: string }) => Promise<void>; clipboard?: { writeText(t: string): Promise<void> } };
    if (typeof nav.share === 'function') {
      try {
        await nav.share({ url: lien });
        return;
      } catch {
        /* she closed the sheet — nothing to say */
        return;
      }
    }
    await copierLien(lien);
  };
  const copierLien = async (lien: string): Promise<void> => {
    const nav = navigator as { clipboard?: { writeText(t: string): Promise<void> } };
    try {
      await nav.clipboard!.writeText(lien);
      toast(root, t('vit.liste_copie'));
    } catch {
      // No clipboard (old WebView) — the link is drawn on the sheet, so the
      // honest answer is the erreur line, not a fake « copié ».
      toast(root, t('vit.liste_erreur'));
    }
  };

  // Render from an ALREADY-RESOLVED value — the resolve happens ONCE per load
  // (never re-resolved per state), the widened async seam feeding this.
  const render = (etatDemande: VitrineEtat, resolved: RenderInput): void => {
    // audit F3 — a thrown fetch resolves to `'offline'`: force the designed
    // offline surface, never « lien invalide ». Below, `resolu` is the storefront
    // value only (the sentinel is not a resolution), so no branch reads it.
    const horsLigne = resolved === 'offline';
    const resolu = horsLigne ? undefined : resolved;
    const etat = horsLigne ? 'offline' : etatForRender(etatDemande, resolu !== undefined && resolu !== null);
    // APERÇU NU — applied HERE, at the single point every render reads the
    // storefront from, so no branch below can accidentally keep the photograph.
    const sfBrut = resolu?.storefront;
    const sf = sfBrut !== undefined && harness.sansPhotos === true ? sansPhotos(sfBrut) : sfBrut;
    // ENTETES-B — the mounted key: `?entete=` (the founder's preview override)
    // when present, else HER `headerStyle`, now that the storefront is in hand.
    // The port already normalised the field (absent/unknown wire ⇒ classique).
    const entete = enteteForRender(harness.entete, sf?.headerStyle);
    // VIDEO-PRODUIT V-1e — every render below REPLACES innerHTML, so the
    // previous observer must die with the nodes it watched (observers piling
    // up across navigations is a leak wearing a feature's clothes).
    demonteVideos();
    if (needsEnteteSheet(entete)) ensureEnteteSheet();
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
        root.innerHTML = renderVitrineEmpty(sf!, resolu!.trust, { fromProduct }, entete);
        break;
      case 'ready': {
        // BUYER-LIVE-WIRE-3 — the empty/ready decision follows WHAT CAN ACTUALLY
        // BE SHOWN, not membership alone. `curatedItems` is the membership truth,
        // but a pid the service could not describe yields no tile — so deciding on
        // membership alone rendered the READY screen with an EMPTY GRID, which
        // reads as a broken page rather than an honest state. When the service
        // described products, THAT list decides; otherwise membership does.
        const described = resolu!.products;
        const showable = described !== undefined ? described.length : sf!.curatedItems.length;
        root.innerHTML =
          showable === 0
            ? renderVitrineEmpty(sf!, resolu!.trust, { fromProduct }, entete)
            : renderVitrineReady(
                sf!,
                resolu!.trust,
                // CONTACT-WHATSAPP-2 — the resolved contact rides into the grid
                // exactly as it rides into the fiche (main.ts): conditionally,
                // absent stays absent.
                { fromProduct, ...(resolu!.whatsapp !== undefined ? { whatsapp: resolu!.whatsapp } : {}) },
                resolu!.notes,
                described,
                entete,
              );
        dernierPret = showable === 0 ? null : { sf: sf!, described };
        // VIDEO-PRODUIT V-1e — the scroll-play observer mounts over the nodes
        // just rendered; no video hero on the page ⇒ it mounts nothing.
        demonteVideos = mountVideoScroll(root);
        // LISTE-ENVIES-1 — fill the liste slot the renderer reserved: the
        // creator's band synchronously, the friend's banner from ONE read
        // (kicked off on the first ready render, cached across re-renders).
        if (listeToken !== undefined && !listeDemandee) {
          listeDemandee = true;
          chargerListe();
        } else {
          remplirListeSlot();
        }
        break;
      }
    }
  };

  // Arrival attribution — best-effort, never blocks the render (unchanged seam).
  const recordArrival = (resolved: RenderInput): void => {
    if (!resolved || resolved === 'offline') return;
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
  // ENTETES-G — resolve the storefront AND her header style before any screen
  // that draws a header. Both `empty` and `ready` come after this; `loading`
  // draws a skeleton with no header at all, so there is no flash and no swap.
  // A style that fails to fetch leaves the key unregistered and `classique`
  // draws — her products still reach the buyer (the ENTETES-E0 law).
  const resolveWithStyle = async (): Promise<RenderInput> => {
    let resolved: RenderInput;
    try {
      resolved = await port.resolve(slug);
    } catch (e) {
      if (e instanceof VitrineOffline) resolved = 'offline';
      else throw e;
    }
    await loadEntete(enteteForRender(harness.entete, resolved === 'offline' ? undefined : resolved?.storefront?.headerStyle));
    return resolved;
  };

  const load = (skeletonMs: number, isInitial: boolean): void => {
    if (harness.etat !== undefined) {
      void resolveWithStyle().then((resolved) => {
        if (isInitial) recordArrival(resolved);
        render(harness.etat!, resolved);
      });
      return;
    }
    if (harness.fige === true) {
      void resolveWithStyle().then((resolved) => {
        if (isInitial) recordArrival(resolved);
        render('ready', resolved);
      });
      return;
    }
    render('loading', undefined);
    const started = Date.now();
    void resolveWithStyle().then((resolved) => {
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
    } else if (action === 'panier') {
      // PANIER-VITRINE-1 — the panier is REAL (the favori law): toggle the
      // device-local store, flip EVERY chip carrying this pid (a product can
      // sit in the featured card AND the grid), refresh the band in place,
      // and say honestly where it went. Same action serves the tile chip and
      // the band's « retirer » — one toggle, two surfaces.
      ev.preventDefault();
      // ONE key for write AND read (verifier MINOR): the store is keyed by
      // the same sf.slug the chips and band render from — never the mount's
      // URL slug, so a future alias/redirect cannot split the panier. Chips
      // exist only on READY screens, where dernierPret is always set.
      const pid = target.getAttribute('data-pid') ?? '';
      if (dernierPret !== null) {
        const on = togglePanier(dernierPret.sf.slug, pid);
        applyPanierState(root, pid, on);
        const slot = root.querySelector('[data-role="vitrine-panier-slot"]');
        if (slot !== null) {
          slot.innerHTML = renderPanierBand(dernierPret.sf, dernierPret.described);
        }
        toast(root, t(on ? 'vit.panier_ajoute' : 'vit.panier_retire'));
      }
    } else if (action === 'whatsapp') {
      // CONTACT-WHATSAPP-2 — closest() resolved THIS chip, so the tile's
      // `produit` navigation does not fire (the fav law). The chip carries the
      // URL its own render vouched for; `ouvrirWhatsApp` refuses anything that
      // is not a wa.me address, so no other bytes can ever be opened from here.
      ev.preventDefault();
      ouvrirWhatsApp(target.getAttribute('data-wa-href') ?? '');
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
    } else if (action === 'liste-creer') {
      // LISTE-REFAIRE — ONE action, two lives. No liste yet (or the way out
      // of a dead handle, data-mode="nouvelle") → the builder that CREATES,
      // pre-checked from her hearts. A liste already → the GESTION sheet
      // (server truth first — the marks live there): « Retirer » on hers,
      // « Ajouter » on the rest, every tap an immediate act, the link stays.
      if (dernierPret === null) return;
      const gardee = listeGardee(dernierPret.sf.slug);
      root.querySelector('[data-role="liste-sheet"]')?.remove();
      if (gardee === undefined || target.getAttribute('data-mode') === 'nouvelle') {
        const articles = articlesPourListe(dernierPret.sf, dernierPret.described);
        const precoche = new Set(articles.filter((p) => isFavorite(p.pid)).map((p) => p.pid));
        root.insertAdjacentHTML('beforeend', renderListeSheet(articles, precoche));
        return;
      }
      root.insertAdjacentHTML('beforeend', renderListeModif({ etape: 'chargement' }));
      const epochAuDepart = gestionEpoch;
      void listePort.lire(gardee.token).then((res) => {
        // Closed while the read was out → paint nothing (the torn-down
        // container law, LISTE-MERCI MINOR 2's lesson). An act that answered
        // meanwhile moved the epoch: this read is then STALE by construction
        // (served before the act's write) and is discarded — the act's own
        // continuation painted the fresher truth.
        const attente = root.querySelector('[data-role="liste-modif-attente"]');
        const sheet = attente?.closest('[data-role="liste-sheet"]');
        if (attente === null || sheet === null || sheet === undefined || dernierPret === null) return;
        if (gestionEpoch !== epochAuDepart) return;
        if (res.status === 'hors-ligne') {
          sheet.outerHTML = renderListeModif({ etape: 'hors-ligne' });
          return;
        }
        if (res.status === 'introuvable') {
          sheet.outerHTML = renderListeModif({ etape: 'introuvable' });
          return;
        }
        tenirGestion(res.liste.articles);
        const composed = composeGestion();
        if (composed === null || (composed.miennes.length === 0 && composed.ajoutables.length === 0)) {
          sheet.outerHTML = renderListeModif({ etape: 'introuvable' });
          return;
        }
        sheet.outerHTML = renderListeGestion(composed.miennes, composed.ajoutables);
      });
    } else if (action === 'liste-fermer') {
      root.querySelector('[data-role="liste-sheet"]')?.remove();
    } else if (action === 'liste-valider') {
      // Read what she checked and how she signs — refusals are INLINE and
      // actionable (« dites-nous votre prénom » is a field she can fill),
      // never an error wall over the sheet.
      if (dernierPret === null) return;
      const sfSlug = dernierPret.sf.slug;
      const pids: string[] = [];
      for (const box of root.querySelectorAll<HTMLInputElement>('input[data-liste-pid]')) {
        if (box.checked) pids.push(box.getAttribute('data-liste-pid') ?? '');
      }
      const nom = (root.querySelector<HTMLInputElement>('[data-role="liste-nom"]')?.value ?? '').trim();
      const alerte = root.querySelector<HTMLElement>('[data-role="liste-alerte"]');
      const direAlerte = (message: string): void => {
        if (alerte !== null) {
          alerte.textContent = message;
          alerte.hidden = false;
        }
      };
      if (pids.length === 0) return direAlerte(t('vit.liste_vide_choix'));
      // The door's ceiling, mirrored INLINE (verifier MINOR 2): a 21st check
      // must be told the rule, never met with a generic erreur a retry can
      // never fix.
      if (pids.length > LISTE_MAX_ARTICLES) return direAlerte(t('vit.liste_trop'));
      if (nom === '') return direAlerte(t('vit.liste_nom_manque'));
      // LISTE-MERCI — the optional WhatsApp opt-in. Present, it must satisfy
      // the SAME bands `whatsappDigits` will apply server-side (8 Burkina
      // digits, or 10–15 international — a bare 9 is neither), so she learns
      // about a typo while the field is still under her thumb, never from a
      // served refusal wearing the generic erreur (verifier MINOR 1).
      const tel = (root.querySelector<HTMLInputElement>('[data-role="liste-tel"]')?.value ?? '').trim();
      if (tel !== '') {
        const chiffres = tel.replace(/^\+/, '').replace(/^00/, '').replace(/[\s.\-()]/g, '');
        const bande = chiffres.length === 8 || (chiffres.length >= 10 && chiffres.length <= 15);
        if (!/^\d+$/.test(chiffres) || !bande) return direAlerte(t('vit.liste_tel_invalide'));
      }
      // LISTE-ADRESSE — the optional private-address block. Touching ANY of
      // its fields is the choice, and then the two a delivery cannot happen
      // without (quartier, phone) refuse inline while under her thumb. The
      // zone is composed EXACTLY as this boutique's own checkout composes a
      // buyer's destination — same trust, same bytes.
      const quartierL = (root.querySelector<HTMLSelectElement>('[data-role="liste-quartier"]')?.value ?? '').trim();
      const telL = (root.querySelector<HTMLInputElement>('[data-role="liste-tel-livraison"]')?.value ?? '').trim();
      const repereL = (root.querySelector<HTMLInputElement>('[data-role="liste-repere"]')?.value ?? '').trim();
      let livraison: ListeLivraison | undefined;
      if (quartierL !== '' || telL !== '' || repereL !== '') {
        if (quartierL === '') return direAlerte(t('vit.liste_quartier_manque'));
        if (telL === '') return direAlerte(t('vit.liste_tel_livraison_manque'));
        livraison = { telephone: telL, quartier: quartierL, repere: repereL, zone: `${quartierL}, ${villeDe(dernierPret.sf.zone)}` };
      }
      const bouton = target as HTMLButtonElement;
      bouton.disabled = true;
      bouton.textContent = t('vit.liste_creation');
      void listePort.creer(sfSlug, nom, pids, tel === '' ? undefined : tel, livraison).then((res) => {
        if (res.status !== 'creee') {
          bouton.disabled = false;
          bouton.textContent = t('vit.liste_creer_cta');
          direAlerte(t('vit.liste_erreur'));
          return;
        }
        // The handle is kept BEFORE the link is shown, so a phone that dies
        // mid-celebration still owns its liste on the next visit.
        garderListe(sfSlug, {
          token: res.liste.token,
          editCle: res.liste.editCle,
          nom,
          pids,
          createdAt: new Date().toISOString(),
        });
        const sheet = root.querySelector('[data-role="liste-sheet"]');
        if (sheet !== null) sheet.outerHTML = renderListeLien(lienDeListe(res.liste.token));
        remplirListeSlot();
      });
    } else if (action === 'liste-retirer' || action === 'liste-ajouter') {
      // LISTE-REFAIRE-2 — ONE TAP, ONE ACT (founder: the save word confused
      // « remove »). The next selection is computed from the held SERVER
      // truth, the door refusals are mirrored inline BEFORE the wire is
      // spent, and while an act is on the road every row button sleeps so
      // two taps can never race each other's selection.
      if (dernierPret === null || listeEnGestion === null || acteEnCours) return;
      const sfSlug = dernierPret.sf.slug;
      const gardee = listeGardee(sfSlug);
      if (gardee === undefined) return;
      const pid = target.getAttribute('data-pid') ?? '';
      const alerte = root.querySelector<HTMLElement>('[data-role="liste-alerte"]');
      const direAlerte = (message: string): void => {
        if (alerte !== null) {
          alerte.textContent = message;
          alerte.hidden = false;
          // A refusal must be SEEN to be a refusal (verifier MAJOR 4): on a
          // full sheet the tapped row can sit far below the message.
          alerte.scrollIntoView?.({ block: 'nearest' });
        }
      };
      const actuels = listeEnGestion.map((a) => a.pid);
      if (action === 'liste-retirer' && actuels.length <= 1) return direAlerte(t('vit.liste_garder_un'));
      if (action === 'liste-ajouter' && actuels.length >= LISTE_MAX_ARTICLES) return direAlerte(t('vit.liste_trop'));
      const pids = action === 'liste-retirer' ? actuels.filter((p) => p !== pid) : [...actuels, pid];
      const boutons = [...root.querySelectorAll<HTMLButtonElement>('[data-role="liste-sheet"] .vt-liste-row-btn')];
      for (const b of boutons) b.disabled = true;
      acteEnCours = true;
      void listePort.modifier(gardee.token, gardee.editCle, pids).then((res) => {
        acteEnCours = false;
        if (res.status !== 'modifiee') {
          // The way out of a failed act: the buttons wake, the reason shows.
          for (const b of boutons) b.disabled = false;
          direAlerte(t('vit.liste_erreur'));
          return;
        }
        gestionEpoch += 1;
        // The handle may have been REPLACED while the act was on the road (a
        // dead liste's nouvelle-create, verifier MINOR 5) — a stale act must
        // never overwrite the fresh handle nor repaint another liste's sheet.
        if (listeGardee(sfSlug)?.token !== gardee.token) return;
        // The SERVICE's answer drives everything: the handle (so the card
        // can never drift), the held truth, and the repaint — the row she
        // acted on visibly moves, which IS the feedback.
        garderListe(sfSlug, { ...gardee, pids: res.liste.articles.map((a) => a.pid) });
        tenirGestion(res.liste.articles);
        remplirListeSlot();
        // Closed while the act was out → the act still happened (the server
        // answered; handle and card above are already true); only the paint
        // is skipped. The paint targets ONLY the marked faces — never the
        // create builder or the link celebration.
        const sheet = root.querySelector('[data-role="liste-sheet"][data-face]');
        const composed = composeGestion();
        if (sheet !== null && composed !== null) sheet.outerHTML = renderListeGestion(composed.miennes, composed.ajoutables);
      });
    } else if (action === 'liste-partager') {
      const porte = target.getAttribute('data-lien');
      const gardee = dernierPret !== null ? listeGardee(dernierPret.sf.slug) : undefined;
      const lien = porte ?? (gardee !== undefined ? lienDeListe(gardee.token) : undefined);
      if (lien !== undefined) void partagerLien(lien);
    } else if (action === 'liste-copier') {
      const lien = target.getAttribute('data-lien');
      if (lien !== null) void copierLien(lien);
    } else if (action === 'liste-produit') {
      // The friend's card → THAT product's own signed fiche, carrying the
      // liste token so the order can name it (per-product checkout — the
      // no-combined-cart law holds on the gift road).
      const pid = target.getAttribute('data-pid') ?? '';
      if (listeToken !== undefined) {
        window.location.href = `${signedHref(window.location.pathname, slug, pid)}&liste=${encodeURIComponent(listeToken)}`;
      }
    } else if (action === 'liste-tout-panier') {
      // A convenience for the friend: every ungiven, in-stock wish onto the
      // device-local shelf. NEVER a checkout — the panier's own law.
      if (dernierPret !== null && listeAmie !== 'chargement' && listeAmie.status === 'liste') {
        const catalogue = articlesPourListe(dernierPret.sf, dernierPret.described);
        const disponibles = new Set(catalogue.map((p) => p.pid));
        for (const a of listeAmie.liste.articles) {
          if (!a.offert && disponibles.has(a.pid) && !inPanier(dernierPret.sf.slug, a.pid)) {
            const on = togglePanier(dernierPret.sf.slug, a.pid);
            applyPanierState(root, a.pid, on);
          }
        }
        const slot = root.querySelector('[data-role="vitrine-panier-slot"]');
        if (slot !== null) slot.innerHTML = renderPanierBand(dernierPret.sf, dernierPret.described);
        toast(root, t('vit.liste_panier_fait'));
      }
    } else if (action === 'liste-reessayer') {
      chargerListe();
    }
  });
}

/** CONTACT-WHATSAPP-2 — open the WhatsApp draft, wa.me ONLY. Exported so the
 *  guard is testable by execution (the applyFavoriteState precedent): a chip
 *  whose attribute was somehow not a wa.me URL opens nothing, returns false. */
export function ouvrirWhatsApp(href: string): boolean {
  if (!href.startsWith('https://wa.me/')) return false;
  window.open(href, '_blank', 'noopener');
  return true;
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

/** PANIER-VITRINE-1 — flip every panier chip carrying this pid (the
 *  applyFavoriteState law, same reason: twins must never disagree). */
export function applyPanierState(
  scope: { querySelectorAll(sel: string): ArrayLike<Element> & Iterable<Element> },
  pid: string,
  on: boolean,
): void {
  for (const el of scope.querySelectorAll(`[data-action="panier"][data-pid="${pid}"]`)) {
    el.classList.toggle('vt-pan-on', on);
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
