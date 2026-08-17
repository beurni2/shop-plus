/**
 * PERSONNALISATION — K1…K7 (+K2b/K3b states), HANDOFF §5, Shop+ chrome §1.3.
 *
 * Values are the Phase-0 table's bytes (bp-K* blueprints): row 64/pad 10 16/
 * icon 38 r12 #F8E4EC/#701134, titles IS700 14.5, subs IS400 12 #6F6355,
 * theme cards r18 with the woven band, selected border 2 #A31D4E + check 26,
 * counted fields r14 border 1.5 #E5DCC9 focus #A31D4E, K5 rows 62, pills 9/800.
 * The dock is hidden by construction ('personnaliser' is not a HUB screen).
 *
 * RN-medium adaptations (documented in the Phase-4 audit — the PIXEL surface
 * is the buyer web; K is chrome on the reseller device):
 *  - woven bands render as striped Views (RN core has no CSS gradients);
 *  - cover art states use the soft/sand fills + monogram, no rayures pattern;
 *  - IS-800 pills map to the Bold(700) face — the planche's variable font
 *    clamps at 700 anyway (Instrument ships no 800);
 *  - the camera and star row glyphs are SVG (no-emoji gate); « Aa ◐ ≡ » stay text (lawful).
 *
 * §8.10: K7 is READ-ONLY — a product tap toasts, never navigates.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, findNodeHandle, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { t, tf } from '../../i18n';
import {
  DEFAULT_STOREFRONT,
  FEATURED_CAP,
  NAME_MIN,
  PICKABLE_HEADER_STYLES,
  ZONE_MAX,
  THEMES,
  coverTo,
  headerStyleOf,
  moveItem,
  saveIdentity,
  setTheme,
  togglePin,
  withFocus,
  type HeaderStyleKey,
  type PhotoFocus,
  type Storefront,
  type VitrineThemeKey,
} from './storefront';
// ENTETES-C — the framing sheet (drag-to-frame) + its kind. The sheet's
// geometry is the PURE math in framing-math.ts, executed by Node tests.
import { FramingSheet } from './framing';
import { apercuBox, frameSpecFor, type FrameKind, type FrameSpec } from './framing-math';



import { formatFcfa } from '../../earnings';
import { K_SEED } from './storefront';

import { fromCatalog, type KCatalogItem } from './catalog';
import { vignette } from '../vignette';
// PERSONNALISER-REAL-1 — the WIRE shape, imported rather than re-declared: two
// copies of a patch shape are two shapes that drift on the first field added.
import type { StorefrontIdentityPatch } from '../service';
import { pickPhoto } from './photo-pick';
import { cadreRatio } from '../../ui/cadre';
import { EnteteApercu } from './screens-apercu';
import { EnteteApercuSheet } from './entete-sheet';
import { uploadFailureCopy } from './upload-outcome';
import { K_RAW_STYLES } from './k-styles';
/** ONE money source — the app's canonical formatter (U+202F+FCFA, re-pin site). */
export const fmtFcfa = formatFcfa;

const SHOP = { accent: '#A31D4E', deep: '#701134', soft: '#F8E4EC' }; // §1.3 chrome fixe
const GOLD_K = '#E0A11B'; // §1.3 liseré or (K chrome)
const GOLD_BUYER = '#C89A3F';

/* SECTIONS RETIRÉES (founder order, 2026-08-13: « remove 'Sections' from
   personnaliser ») — the k6/k6b routes, their two screens, the K1 row and the
   four pure actions are gone. UI ONLY: the canon Storefront keeps `sections`,
   the service keeps accepting the field on the wire (absent = untouched, never
   cleared — storefront-core's own merge law), and a buyer shop already holding
   sections keeps rendering them (customer-projection and render.ts are
   untouched, and ApercuCliente below still groups by them for parity). */
type KRoute = 'k1' | 'k2' | 'k3' | 'k4' | 'k5' | 'k7';

export interface CustomizeProps {
  onClose: () => void;
  onToast: (msg: string) => void;
  storefront?: Storefront | undefined;
  onStorefrontChange?: (sf: Storefront) => void;
  /** RESELLER-STOREFRONT-WRITE-1 — publish this storefront's identity to the LIVE
   * service (create + publish). Absent (default/tests) ⇒ the button is hidden. */
  onPublishOnline?: (sf: Storefront) => void;
  /** Show what the founder has already put online (the admin list). */
  onListStorefronts?: () => void;
  /** RESELLER-UX-1 item 6 — her shop's REAL slug once it is live (read back from
   * the service, never computed). Present ⇒ the publish CTA is retired and
   * « voir » opens the public page; absent ⇒ first-time flow, unchanged. */
  liveSlug?: string | undefined;
  onOpenBoutique?: (slug: string) => void;
  /** PERSONNALISER-REAL-1 — persist the presentation. Absent (tests/default) ⇒
   *  the screens stay local-only, exactly as they were. */
  /** PERSONNALISER-HONESTY-1 — resolves TRUE only when the service accepted and
   *  the read-back landed. A screen may not draw a stored state without it. */
  onSaveIdentity?: (patch: StorefrontIdentityPatch) => Promise<boolean>;
  /** Does a save actually reach the service today? False before she goes live —
   *  stated on K1 rather than left for her to discover when it vanishes. */
  savesPersist?: boolean;
  /** Her shop exists on the service, even if its settings have not loaded yet.
   *  Distinguishes « pas encore en ligne » from « pas encore chargé ». */
  shopIsLive?: boolean;
  /** PERSONNALISER-MEDIA-1 — send the REAL bytes. The App owns the service call
   *  (same idiom as onPublishOnline); absent ⇒ the slot stays inert, never a
   *  tap that pretends. Resolves to the honest outcome so the screen can state it. */
  onUploadCover?: (bytes: Uint8Array, contentType: string) => Promise<{ ok: boolean; reason?: string }>;
  /** MEDIA-2 — the same seam for her PORTRAIT. The service half (uploadAvatar,
   *  decideSetMedia kind:'avatar') shipped in MEDIA-1 with NO caller: the « Photo »
   *  segment rendered a camera-icon slot that was a plain View — she tapped it and
   *  nothing happened, which is exactly the « still some mocks » the founder named. */
  onUploadAvatar?: (bytes: Uint8Array, contentType: string) => Promise<{ ok: boolean; reason?: string }>;
  /** RESELLER-SEAM-HONESTY-1 — `true` when the write seam resolved to `null` (the
   * `EXPO_PUBLIC_STOREFRONT_*` pair is not inlined in this build). The CTA STAYS
   * VISIBLE and an honest note sits under it: a button that vanishes hides the truth
   * too, just more quietly. NOT an error state — nothing is broken and she did
   * nothing wrong; this build simply has not been told where to write. */
  serviceUnconfigured?: boolean;
  /** PERSONNALISER-PARITY-1 — her REAL listings for K5/K7 (K6b left with the
   *  sections editor, 2026-08-13). Absent (tests, demo) ⇒ the K_SEED fallback,
   *  exactly as before. */
  catalog?: readonly KCatalogItem[] | undefined;
}

/* -------------------------------------------------------------- helpers -- */

function IconCamera({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.4-2h5.8l1.4 2h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
      <Circle cx={12} cy={12.2} r={3.4} />
    </Svg>
  );
}

function IconStarK({ size, filled }: { size: number; filled: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? SHOP.accent : 'none'} stroke={filled ? SHOP.accent : '#8A7D6B'} strokeWidth={1.8} strokeLinejoin="round">
      <Path d="M12 3.4l2.7 5.4 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.7l6-.9z" />
    </Svg>
  );
}

function IconEye({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <Circle cx={12} cy={12} r={3} />
    </Svg>
  );
}

function IconBackK({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#1C1710" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14.5 6l-6 6 6 6" />
    </Svg>
  );
}

function IconCheckK({ size, color, width = 2.8 }: { size: number; color: string; width?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

function IconDevantureK({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4.5 9.5L5.8 5h12.4l1.3 4.5" />
      <Path d="M5.5 9.5V19h13V9.5" />
      <Path d="M10 19v-5.5h4V19" />
    </Svg>
  );
}


/** Woven band — the §1.2/§1.3 liseré as striped Views (RN adaptation). */
export function WovenBand({ accent, gold, height }: { accent: string; gold: string; height: number }) {
  const seq: { c: string; w: number }[] = [];
  for (let i = 0; i < 12; i++) {
    seq.push({ c: accent, w: 18 }, { c: '#F4EFE6', w: 6 }, { c: gold, w: 8 }, { c: '#F4EFE6', w: 6 });
  }
  return (
    <View style={{ height, flexDirection: 'row', overflow: 'hidden' }}>
      {seq.map((s, i) => (
        <View key={i} style={{ width: s.w, height, backgroundColor: s.c }} />
      ))}
    </View>
  );
}

function KHeader({ title, onBack, pill }: { title: string; onBack: () => void; pill?: React.ReactNode }) {
  return (
    <View style={S.header}>
      <Pressable style={({ pressed }) => [S.backBtn, pressed && S.pressed]} onPress={onBack} accessibilityRole="button" accessibilityLabel={t('k.retour')}>
        <IconBackK size={17} />
      </Pressable>
      <Text style={S.headerTitle} numberOfLines={1}>{title}</Text>
      {pill}
    </View>
  );
}

/* ------------------------------------------------------------- the stack -- */

export function CustomizeStack({ onClose, onToast, storefront, onStorefrontChange, onPublishOnline, onListStorefronts, serviceUnconfigured, liveSlug, onOpenBoutique, onSaveIdentity, savesPersist, shopIsLive, onUploadCover, onUploadAvatar, catalog }: CustomizeProps) {
  const [route, setRoute] = useState<KRoute>('k1');
  const [sf, setSfRaw] = useState<Storefront>(storefront ?? DEFAULT_STOREFRONT);
  // PERSONNALISER-HONESTY-1 — which header save is in flight, so K4 can say
  // « Enregistrement… » on that card instead of drawing a check it has not earned.
  const [enteteEnCours, setEnteteEnCours] = useState<HeaderStyleKey | undefined>(undefined);
  // MEDIA-2 — the error SLOT must say the same true thing the toast says. It
  // used to be hard-coded « Image trop lourde — 2 Mo max. », which was honest
  // only for the [DEMO] button that once drove it; rewiring that state to real
  // failures made it a wrong cause AND a wrong number on the surface she is
  // still reading ten seconds after the toast has gone.
  const [coverError, setCoverError] = useState<{ title: string; body: string } | null>(null);
  // MEDIA-2 — the portrait upload had NO visible state: she tapped the square and
  // nothing changed for the whole round-trip, so on patchy data she taps again and
  // starts a second pick. The cover has its five states; the portrait gets the one
  // that matters, and the square is inert while it is in flight.
  const [avatarSending, setAvatarSending] = useState(false);
  // ENTETES-C — which kind the framing sheet is open on (null = closed). It
  // opens automatically after a successful upload, and from « Ajuster le
  // cadrage » next to each live photo on K3.
  const [framing, setFraming] = useState<FrameKind | null>(null);
  const catalogTotal = catalog !== undefined ? catalog.length : K_SEED.length;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // PERSONNALISER-REAL-1 — HER shop arrives asynchronously (the service read
  // resolves after mount), so adopt it when it lands. Guarded on `updatedAt` so a
  // re-render cannot stomp an edit she just made with the value we loaded first.
  const adopted = useRef<string | null>(null);
  useEffect(() => {
    if (storefront === undefined || adopted.current === storefront.updatedAt) return;
    adopted.current = storefront.updatedAt;
    setSfRaw(storefront);
  }, [storefront]);
  // NOTE: per-product voice notes moved OUT of « Aa »/K8 to the Ma Vitrine card
  // mic (founder Option A — recording lives with the product). See voice-sheet.tsx.

  /**
   * PERSONNALISER-REAL-1 — every edit both RENDERS and PERSISTS.
   *
   * The presentation fields ride on every save rather than only the changed
   * one: the service compares field by field and answers `unchanged` for a no-op,
   * so sending them all costs nothing and makes it impossible to forget one at a
   * call site. Cover cycles through here too and simply never matches a patch
   * field — it is not part of the presentation patch (its own slice).
   *
   * SECTIONS RETIRÉES (founder order, 2026-08-13): `sections` no longer rides.
   * This app has no sections editor any more, so carrying `next.sections` would
   * only ever echo a value it can no longer change — and the wire's own law is
   * that an ABSENT field is UNTOUCHED, never cleared (storefront-core merges
   * `...(sections !== undefined ? { sections } : {})`), so a shop already
   * holding sections keeps them through every save made here.
   */
  const setSf = (next: Storefront, opts?: { readonly withOrder?: boolean }): void => {
    setSfRaw(next);
    onStorefrontChange?.(next);
    onSaveIdentity?.({
      name: next.name,
      tagline: next.tagline,
      bio: next.bio,
      zone: next.zone, // VITRINE-QUARTIER-1 — her quartier finally has a write path
      theme: next.theme,
      featuredItems: next.featuredItems,
      // K5 ▲▼ ONLY (verifier finding): carrying the order on EVERY save let a
      // STALE membership refuse an unrelated edit — publish a product, re-enter,
      // tap a theme before the re-read lands, and the theme was rejected for a
      // curation mismatch it had nothing to do with. The order rides only the
      // save that actually changes it. The service accepts a PERMUTATION only.
      ...(opts?.withOrder === true ? { curatedItems: next.curatedItems } : {}),
    });
  };
  const th = THEMES[sf.theme];

  /**
   * PERSONNALISER-MEDIA-1 — PICK, THEN UPLOAD, THEN SAY WHAT HAPPENED.
   *
   * The states are the same five the design specifies; what drives them is now a
   * real file and a real request instead of two timers. `uploading` lasts exactly
   * as long as the network takes — a state that is TRUE rather than 1 400 ms of
   * theatre. Every failure keeps its own name, because « vous avez refusé
   * l'accès » and « la photo est trop lourde » are different things to tell her.
   */
  /** The reason → sentence mapping is a PURE module so it can be tested by
   *  EXECUTING it. It used to live inline here, where the only reachable tests
   *  were source-text greps — and a verifier proved those stayed green with every
   *  arm of the map scrambled. */
  const uploadFailureMessage = (reason?: string): string => t(uploadFailureCopy(reason).body);

  /** MEDIA-2 — her PORTRAIT, through the seam that shipped with no caller. */
  const pickAndUploadAvatar = async (): Promise<void> => {
    if (onUploadAvatar === undefined) return;
    // THE LOCK COVERS THE PICK, NOT ONLY THE UPLOAD. The decode + resize + re-encode
    // of a 12 MP photo is the SLOWEST leg on a 1 GB phone, and it happens back on
    // this screen. Locking only the network leg left the square tappable through
    // exactly the wait that makes her tap again.
    setAvatarSending(true);
    const picked = await pickPhoto();
    if (!picked.ok) {
      setAvatarSending(false);
      if (picked.reason === 'refused') onToast(t('k.cover.acces_refuse'));
      else if (picked.reason === 'unreadable') onToast(t('k.cover.illisible'));
      else if (picked.reason === 'too_small') onToast(t('k.cover.trop_petite'));
      return;
    }
    const res = await onUploadAvatar(picked.bytes, picked.contentType);
    setAvatarSending(false);
    onToast(res.ok ? t('k.portrait.toast_en_ligne') : uploadFailureMessage(res.reason));
    // ENTETES-C — a fresh photo starts UNFRAMED (the service dropped any old
    // focus with the new URL); the framing sheet opens right away so placing
    // it is one gesture, not a hunt.
    if (res.ok) setFraming('avatar');
  };

  const pickAndUploadCover = async (): Promise<void> => {
    if (onUploadCover === undefined) return;
    // Same law as the portrait: « ENVOI… » covers the decode too, so the slot is
    // not a live target through the longest part of the wait.
    setSfRaw(coverTo(sf, 'uploading'));
    const picked = await pickPhoto();
    if (!picked.ok) {
      // Her own cancel is NOT an error and says nothing; a refusal explains.
      // Returning to the cover she actually has — NOT to 'none', which would erase
      // a live photograph from the screen because she changed her mind.
      setSfRaw(sf);
      if (picked.reason === 'refused') onToast(t('k.cover.acces_refuse'));
      else if (picked.reason === 'unreadable') onToast(t('k.cover.illisible'));
      else if (picked.reason === 'too_small') onToast(t('k.cover.trop_petite'));
      return;
    }
    const res = await onUploadCover(picked.bytes, picked.contentType);
    if (res.ok) {
      // The SERVICE owns the URL and writes it onto her shop; the App re-reads
      // and the real photograph arrives through `storefront`. No local guess.
      //
      // MEDIA-2: the toast used to read « vérifiée par Séra » — a badge this
      // ecosystem cannot spend falsely, and nothing verifies it since the founder
      // flipped covers to live-on-upload. It says what is true and no more.
      setCoverError(null);
      onToast(t('k.cover.toast_en_ligne'));
      // ENTETES-C — same as the portrait: the new (unframed) cover goes
      // straight to the framing sheet, in her header's own silhouette.
      setFraming('cover');
      return;
    }
    const copy = uploadFailureCopy(res.reason);
    setCoverError({ title: t(copy.title), body: t(copy.body) });
    setSfRaw(coverTo(sf, 'error'));
    onToast(t(copy.body));
  };

  /**
   * ENTETES-C — save HER framing. ONE SAVE, ONE THING (the ENTETES-B
   * headerStyle law): the focus rides ALONE on the wire, never the six-field
   * ride-along, so a stale unrelated field can never refuse it. `null` is the
   * CLEAR order (« Réinitialiser » — back to the header's own framing). Local
   * state mirrors the service's tri-state merge (`withFocus`) for the moment
   * between save and re-read; the adopted service truth then arrives via
   * `storefront`, and a refusal lands as a toast through the App's save seam.
   */
  const saveFraming = (kind: FrameKind, order: PhotoFocus | null): void => {
    const next: Storefront =
      kind === 'cover' ? { ...sf, cover: withFocus(sf.cover, order) } : { ...sf, avatar: withFocus(sf.avatar, order) };
    setSfRaw(next);
    onStorefrontChange?.(next);
    onSaveIdentity?.(kind === 'cover' ? { coverFocus: order } : { avatarFocus: order });
    onToast(t(order === null ? 'k.cadrage.toast_defaut' : 'k.cadrage.toast'));
    setFraming(null);
  };

  const back = (): void => {
    if (route === 'k1') onClose();
    else setRoute('k1');
  };

  return (
    <View style={S.root}>
      {route === 'k1' && (
        <K1
          catalogTotal={catalogTotal}
          sf={sf}
          th={th}
          onBack={onClose}
          go={setRoute}
          onPublishOnline={onPublishOnline ? () => onPublishOnline(sf) : undefined}
          onListStorefronts={onListStorefronts}
          serviceUnconfigured={serviceUnconfigured ?? false}
          liveSlug={liveSlug}
          onOpenBoutique={onOpenBoutique}
          saveWired={onSaveIdentity !== undefined}
          savesPersist={savesPersist ?? false}
          shopIsLive={shopIsLive ?? false}
        />
      )}
      {route === 'k2' && (
        <K2
          sf={sf}
          onBack={back}
          onSave={(patch) => {
            const r = saveIdentity(sf, patch);
            if (r.ok) {
              setSf(r.next);
              // « Enregistré — visible immédiatement » is TRUE only when the save
              // reaches the service. Before she is live it is a draft, and saying
              // « visible » would be the fabricated success this project refuses.
              // THREE STATES, THREE SENTENCES (verifier finding): saved for real ·
              // her shop exists but its settings have not arrived · not live yet.
              // Keying only on `savesPersist` told an ALREADY-PUBLISHED seller to
              // publish, because that flag now means « settings loaded ».
              onToast(
                savesPersist !== false
                  ? t(r.toastKey ?? 'k.toast_enregistre')
                  : shopIsLive === true
                    ? t('k.enreg.pas_charge')
                    : t('k.enreg.brouillon_toast'),
              );
              setRoute('k1');
            }
          }}
        />
      )}
      {route === 'k3' && (
        <K3
          sf={sf}
          onBack={back}
          onPickCover={() => void pickAndUploadCover()}
          onRetry={() => {
            setCoverError(null);
            setSfRaw(coverTo(sf, 'none'));
          }}
          coverError={coverError}
          uploadWired={onUploadCover !== undefined && serviceUnconfigured !== true && shopIsLive === true}
          // A slot that cannot succeed says WHY, rather than sitting there dead. She
          // used to be allowed to grant photo access and sit through a full decode
          // before being told to publish her boutique — work that could not help.
          disabledNote={
            serviceUnconfigured === true
              ? t('k.cover.pas_configuree')
              : shopIsLive === true
                ? undefined
                : t('k.cover.pas_encore')
          }
          onPickAvatar={onUploadAvatar !== undefined && serviceUnconfigured !== true && shopIsLive === true ? () => void pickAndUploadAvatar() : undefined}
          avatarSending={avatarSending}
          // ENTETES-C — « Ajuster le cadrage » next to each LIVE photo. Needs a
          // photo to frame AND the save seam (the framing persists through
          // onSaveIdentity, exactly like every K save).
          onAdjustCover={
            onSaveIdentity !== undefined && sf.cover.status === 'live' && sf.cover.url ? () => setFraming('cover') : undefined
          }
          onAdjustAvatar={onSaveIdentity !== undefined && sf.avatar.url ? () => setFraming('avatar') : undefined}
        />
      )}
      {route === 'k4' && (
        <K4
          sf={sf}
          liveSlug={liveSlug}
          // Same guard as K3's « Ajuster le cadrage »: a framing sheet needs a
          // photo to frame AND the save seam the framing persists through.
          onCadrerApres={
            onSaveIdentity !== undefined && sf.cover.status === 'live' && sf.cover.url ? () => setFraming('cover') : undefined
          }
          onBack={back}
          onPick={(key) => {
            setSf(setTheme(sf, key));
            onToast(tf('k.theme.toast', { nom: THEMES[key].name }));
          }}
          enteteEnCours={enteteEnCours}
          onPickEntete={(key) => {
            // ENTETES-B — ONE SAVE, ONE THING: the header rides ALONE, never the
            // six-field ride-along, so a stale unrelated field can never refuse
            // it.
            //
            // PERSONNALISER-HONESTY-1 — and it no longer writes local state on
            // the tap. It used to `setSfRaw` immediately, so the card drew its
            // check mark before the service had agreed: the founder tapped
            // « Masque » against a service that still spoke the six-style canon,
            // saw a chosen card AND « Pas enregistré » at once, and nothing was
            // stored. The truth now arrives one way only — the App's read-back
            // lands in `storefront` and the adoption effect sets `sf`.
            setEnteteEnCours(key);
            void (async () => {
              const ok = await onSaveIdentity?.({ headerStyle: key });
              setEnteteEnCours(undefined);
              if (ok === true) onToast(tf('k.entete.toast', { nom: t(`k.entete.nom_${key}`) }));
              // a refusal already carries its own true sentence from the App
            })();
          }}
        />
      )}
      {route === 'k5' && (
        <K5
          sf={sf}
          onBack={back}
          onPin={(pid, inStock) => {
            const r = togglePin(sf, pid, inStock);
            if (r.ok) setSf(r.next);
            else onToast(t(r.toastKey));
          }}
          onMove={(pid, dir) => setSf(moveItem(sf, pid, dir), { withOrder: true })}
          catalog={catalog}
        />
      )}
      {route === 'k7' && <ApercuCliente sf={sf} catalog={catalog} onBack={() => setRoute('k1')} onReadOnlyTap={() => onToast(t('k.apercu.lecture_toast'))} />}
      {/* ENTETES-C — ONE framing sheet, two kinds; it reads the LIVE sf, so
          the photo a just-finished upload wrote arrives through adoption. */}
      <FramingSheet
        visible={framing !== null}
        kind={framing ?? 'cover'}
        sf={sf}
        onSave={saveFraming}
        onClose={() => setFraming(null)}
      />
    </View>
  );
}

/* ------------------------------------------------------------------- K1 -- */

function K1({ sf, th, onBack, go, onPublishOnline, onListStorefronts, serviceUnconfigured, liveSlug, onOpenBoutique, saveWired, savesPersist, shopIsLive, catalogTotal }: { sf: Storefront; th: (typeof THEMES)[VitrineThemeKey]; onBack: () => void; go: (r: KRoute) => void; onPublishOnline?: (() => void) | undefined; onListStorefronts?: (() => void) | undefined; serviceUnconfigured?: boolean; liveSlug?: string | undefined; onOpenBoutique?: ((slug: string) => void) | undefined; saveWired?: boolean; savesPersist?: boolean; shopIsLive?: boolean; catalogTotal?: number | undefined }) {
  const initial = sf.name.replace(/^Chez\s+/i, '').charAt(0).toUpperCase();
  const coverSub =
    sf.cover.status === 'live' ? t('k.row.cover_live') : sf.cover.status === 'pending' ? t('k.row.cover_pending') : t('k.row.cover_defaut');
  const rows: { key: KRoute; glyph: React.ReactNode; title: string; sub: string }[] = [
    { key: 'k2', glyph: <Text style={S.rowGlyphText}>Aa</Text>, title: t('k.row.identite'), sub: sf.tagline || t('k.row.identite_sub') },
    { key: 'k3', glyph: <IconCamera size={18} color={SHOP.deep} />, title: t('k.row.cover'), sub: coverSub },
    { key: 'k4', glyph: <Text style={S.rowGlyphText}>◐</Text>, title: t('k.row.theme'), sub: sf.theme === 'laterite' ? tf('k.row.theme_defaut', { nom: th.name }) : th.name },
    { key: 'k5', glyph: <IconStarK size={18} filled={false} />, title: t('k.row.une'), sub: tf('k.row.une_sub', { n: String(sf.featuredItems.length), total: String(catalogTotal ?? K_SEED.length) }) },
    // SECTIONS RETIRÉES (founder order, 2026-08-13) — the « Sections » row left
    // with its two screens; the canon `sections` FIELD stays, and the aperçu
    // below keeps grouping by it for buyer parity.
  ];
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollPad}>
      <KHeader
        title={t('k.title')}
        onBack={onBack}
        pill={
          <View style={[S.etatPill, sf.discoverable ? S.etatPillOk : S.etatPillNeutre]}>
            <View style={[S.etatDot, { backgroundColor: sf.discoverable ? '#14603A' : '#6F6355' }]} />
            <Text style={[S.etatPillText, { color: sf.discoverable ? '#14603A' : '#6F6355' }]}>{t(sf.discoverable ? 'k.etat_publiee' : 'k.etat_privee')}</Text>
          </View>
        }
      />
      {/* C-K1 — carte aperçu en direct */}
      <View style={S.previewCard}>
        <View style={[S.previewCover, { backgroundColor: th.soft }]}>
          <Text style={[S.previewFiligrane, { color: th.accent }]}>{initial}</Text>
        </View>
        <View style={S.previewBody}>
          <View style={[S.previewAvatar, { backgroundColor: th.accent }]}>
            <Text style={[S.previewAvatarText, { color: th.on }]}>{initial}</Text>
          </View>
          <View style={S.previewNameRow}>
            <Text style={S.previewName} numberOfLines={1}>{sf.name}</Text>
            <IconCheckK size={13} color={th.accent} />
          </View>
          {sf.tagline ? <Text style={S.previewTagline} numberOfLines={1}>{sf.tagline}</Text> : null}
          <View style={[S.previewChip, { backgroundColor: th.soft }]}>
            <Text style={[S.previewChipText, { color: th.deep }]}>{t('vit.chip_sera')}</Text>
          </View>
        </View>
      </View>
      <Text style={S.previewLegend}>{t('k.apercu_legende')}</Text>
      {/* C-K2 — la carte 5 rangées */}
      <View style={S.rowsCard}>
        {rows.map((r, i) => (
          <Pressable key={r.key} style={({ pressed }) => [S.row, i > 0 && S.rowDivider, pressed && S.pressed]} onPress={() => go(r.key)} accessibilityRole="button">
            <View style={S.rowGlyph}>{r.glyph}</View>
            <View style={S.rowBody}>
              <Text style={S.rowTitle}>{r.title}</Text>
              <Text style={S.rowSub} numberOfLines={1}>{r.sub}</Text>
            </View>
            <Text style={S.rowChevron}>›</Text>
          </Pressable>
        ))}
      </View>
      {/* PERSONNALISER-PARITY-1 (founder walk): « Voir comme cliente » showed the
          K7 replica while « Voir ma boutique en ligne » opened the real page —
          two different things claiming the same view. For a LIVE shop the cliente
          view IS the real page, so that is what opens: identical by construction,
          and it can never drift again. The K7 replica remains only before the
          shop exists online, where there is no real page to show. */}
      <Pressable
        style={({ pressed }) => [S.ghostBtn, pressed && S.pressed]}
        onPress={() => (liveSlug !== undefined && onOpenBoutique !== undefined ? onOpenBoutique(liveSlug) : go('k7'))}
        accessibilityRole="button"
      >
        <IconEye size={17} color="#1C1710" />
        <Text style={S.ghostBtnText}>{t('k.voir_cliente')}</Text>
      </Pressable>
      {/* RESELLER-STOREFRONT-WRITE-1 — the app's real calls to the live service.
          Shown only when the seam is wired (App passes the handlers); the K-screen
          tests, which mount nothing here, are unaffected. */}
      {/* RESELLER-UX-1 item 6 (founder walk) — « Mettre ma boutique en ligne » is a
          FIRST-TIME action: once her shop is live (liveSlug read back from the
          service), the CTA retires. A create button on an already-created shop is
          a promise the tap cannot keep — the service would answer `idempotent`
          and nothing would change, a button that appears to work and does not. */}
      {onPublishOnline && liveSlug === undefined && (
        <Pressable style={({ pressed }) => [S.cta, pressed && S.pressed]} onPress={onPublishOnline} accessibilityRole="button">
          <Text style={S.ctaText}>{t('k.publier.cta')}</Text>
        </Pressable>
      )}
      {/* RESELLER-SEAM-HONESTY-1 — the seam resolved to `null`, so this build cannot
          write. The note is stated BEFORE the tap, not only after it: the old
          behaviour showed « En ligne » and wrote nothing. Deliberately NOT styled as
          an error — no red, no icon, quiet secondary type — because nothing is broken
          and she did nothing wrong. */}
      {onPublishOnline && liveSlug === undefined && serviceUnconfigured && (
        <Text style={S.unconfiguredNote}>{t('k.publier.non_relie_note')}</Text>
      )}
      {/* PERSONNALISER-REAL-1 — BEFORE she is live, her shop does not exist on the
          service, so an edit here is a DRAFT: it rides up with « mettre en ligne ».
          Stated before she types, not discovered when it vanishes. Same quiet
          secondary type as the note above — nothing is broken. */}
      {saveWired === true && savesPersist === false && !serviceUnconfigured && (
        <Text style={S.unconfiguredNote}>{shopIsLive === true ? t('k.enreg.pas_charge') : t('k.enreg.brouillon')}</Text>
      )}
      {/* « Voir ma boutique en ligne » — with a LIVE slug it OPENS HER PUBLIC PAGE
          (the founder tapped this and saw nothing: it only ever listed names in a
          toast). Without one it keeps the honest listing fallback. */}
      {liveSlug !== undefined && onOpenBoutique !== undefined ? (
        <Pressable style={({ pressed }) => [S.ghostBtn, pressed && S.pressed]} onPress={() => onOpenBoutique(liveSlug)} accessibilityRole="button">
          <Text style={S.ghostBtnText}>{t('k.publier.voir')}</Text>
        </Pressable>
      ) : onListStorefronts ? (
        <Pressable style={({ pressed }) => [S.ghostBtn, pressed && S.pressed]} onPress={onListStorefronts} accessibilityRole="button">
          <Text style={S.ghostBtnText}>{t('k.publier.voir')}</Text>
        </Pressable>
      ) : null}
      {/* bande encre — jamais modifiable */}
      <View style={S.inkBand}>
        <Text style={S.inkBandText}>
          <Text style={S.inkBandBold}>{t('k.jamais_titre')}</Text> {tf('k.jamais_corps', { slug: `/v/${sf.slug}` })}
        </Text>
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------- K2 / K2b -- */

function K2({ sf, onBack, onSave }: { sf: Storefront; onBack: () => void; onSave: (p: { name: string; tagline: string; bio: string; zone: string }) => void }) {
  const [name, setName] = useState(sf.name);
  const [tagline, setTagline] = useState(sf.tagline);
  const [bio, setBio] = useState(sf.bio);
  // VITRINE-QUARTIER-1 (founder defect report 2026-08-02): the quartier was
  // written once at CREATE and no screen could ever change it — every shop
  // stayed on the seeded « Gounghin, Ouagadougou » for ever. Same required
  // rule as the name: a shop must keep a quartier, so blank disables save.
  const [zone, setZone] = useState(sf.zone);
  const nameInvalid = name.trim().length < NAME_MIN; // K2b state
  const zoneInvalid = zone.trim().length === 0;
  const invalid = nameInvalid || zoneInvalid;
  /**
   * CLAVIER-K2 (founder, 2026-08-15: « fix K2 ») — THE KEYPAD COMES OFF THE FORM.
   *
   * This module had no keyboard handling at all: not one of its scroll surfaces
   * yielded an inch or let a tap through. The app shell's KeyboardAvoidingView
   * covers Android; it is deliberately inert on iOS, where the work is done by
   * the scroll surface itself — so on an iPhone the keypad sat on the BIO, the
   * multiline field at the bottom of four, and on « Enregistrer » beneath it.
   *
   * `automaticallyAdjustKeyboardInsets` only brings the CARET to the keyboard's
   * edge, which would leave the save button underneath, so the focused row also
   * asks to be lifted with slack below it — the same pair the fiche uses.
   *
   * `keyboardShouldPersistTaps="handled"` is SAFE HERE, and that is checked
   * rather than assumed: these four fields write live through `onChange`, and
   * `CountedField`'s blur-time `onCommit` is not passed by this screen. On the
   * fiche the same prop published a markup of 0 precisely because that field
   * committed on blur alone.
   */
  const liste = useRef<ScrollView>(null);
  /** Enough for the field below plus « Enregistrer » and the pad under it. */
  const SOUS_LE_CHAMP = 140;
  const lever = (handle: number | null): void => {
    if (handle === null) return;
    liste.current?.scrollResponderScrollNativeHandleToKeyboard?.(handle, SOUS_LE_CHAMP, true);
  };
  return (
    <ScrollView
      ref={liste}
      style={S.screen}
      contentContainerStyle={S.scrollPad}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      <KHeader title={t('k.identite.title')} onBack={onBack} />
      <CountedField label={t('k.identite.nom_label')} value={name} max={24} onChange={setName} onFocusField={lever} invalid={nameInvalid} invalidNote={t('k.identite.nom_requis')} />
      <CountedField label={t('k.identite.zone_label')} value={zone} max={ZONE_MAX} onChange={setZone} onFocusField={lever} placeholder={t('k.identite.zone_ph')} invalid={zoneInvalid} invalidNote={t('k.identite.zone_requise')} />
      <CountedField label={t('k.identite.tagline_label')} value={tagline} max={40} onChange={setTagline} onFocusField={lever} placeholder={t('k.identite.tagline_ph')} />
      <CountedField label={t('k.identite.bio_label')} value={bio} max={160} onChange={setBio} onFocusField={lever} placeholder={t('k.identite.bio_ph')} multiline />
      <View style={S.noteRose}>
        <Text style={S.noteRoseText}>{tf('k.identite.note_slug', { slug: `/v/${sf.slug}` })}</Text>
      </View>
      <Pressable
        style={({ pressed }) => [S.cta, invalid && S.ctaDisabled, pressed && !invalid && S.pressed]}
        disabled={invalid}
        onPress={() => onSave({ name, tagline, bio, zone })}
        accessibilityRole="button"
        accessibilityState={{ disabled: invalid }}
      >
        <Text style={[S.ctaText, invalid && S.ctaTextDisabled]}>{t('k.enregistrer')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function CountedField({ label, value, max, onChange, onCommit, placeholder, multiline, invalid, invalidNote, onFocusField }: { label: string; value: string; max: number; onChange: (v: string) => void; onCommit?: (v: string) => void; placeholder?: string; multiline?: boolean; invalid?: boolean; invalidNote?: string; onFocusField?: ((handle: number | null) => void) | undefined }) {
  const [focused, setFocused] = useState(false);
  const champ = useRef<TextInput>(null);
  return (
    <View style={S.field}>
      <View style={S.fieldHead}>
        <Text style={S.fieldLabel}>{label}</Text>
        <Text style={[S.fieldCount, value.length >= max && S.fieldCountLimit]}>{value.length}/{max}</Text>
      </View>
      <TextInput
        ref={champ}
        style={[S.fieldInput, multiline && S.fieldInputMulti, focused && S.fieldInputFocus, invalid && S.fieldInputError]}
        value={value}
        maxLength={max}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#8A7D6B"
        multiline={multiline}
        onFocus={() => {
          setFocused(true);
          // CLAVIER-K2 — the screen owns the scroll surface and is the only
          // thing that can lift THIS row clear of the keypad.
          onFocusField?.(findNodeHandle(champ.current));
        }}
        onBlur={() => {
          setFocused(false);
          // The COMMIT point (verifier finding): typing is local, leaving the
          // field is the save. Absent `onCommit` ⇒ unchanged behaviour.
          onCommit?.(value);
        }}
      />
      {invalid && invalidNote ? <Text style={S.fieldError}>{invalidNote}</Text> : null}
    </View>
  );
}

/* ------------------------------------------------------------- K3 / K3b -- */

function K3({ sf, onBack, onPickCover, onRetry, uploadWired, onPickAvatar, coverError, avatarSending, disabledNote, onAdjustCover, onAdjustAvatar }: { sf: Storefront; onBack: () => void; onPickCover: () => void; onRetry: () => void; uploadWired?: boolean; onPickAvatar?: (() => void) | undefined; coverError?: { title: string; body: string } | null; avatarSending?: boolean | undefined; disabledNote?: string | undefined; onAdjustCover?: (() => void) | undefined; onAdjustAvatar?: (() => void) | undefined }) {
  const st = sf.cover.status;
  /**
   * CADRE-COUVERTURE (founder order 2026-08-03: « on couverture & portrait
   * change the photo frame and remove the square rule there, cause the frame
   * badly cropped it »).
   *
   * The slot was a FIXED 120px band with `resizeMode="cover"`, so a portrait
   * photograph was beheaded — he sent the screenshot. This is the same defect
   * the opportunités grid and the buyer's product page already had, on the one
   * screen whose whole job is showing him his photograph.
   *
   * The measurement is the photo's own, via `onLoad`, bounded by `cadreRatio`
   * — the SAME rule the product cards use, so « what a frame may do to a photo »
   * has one answer in this app rather than three.
   *
   * UNMEASURED ⇒ the old 120px band, unchanged: the empty, uploading and error
   * states have no photograph to measure and must keep the box they had.
   */
  const [coverRatio, setCoverRatio] = useState<number | null>(null);
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollPad}>
      <KHeader title={t('k.cover.title')} onBack={onBack} />
      <Text style={S.caps}>{t('k.cover.caps')}</Text>
      {/* C-K4 — le slot 5 états */}
      {/* PERSONNALISER-MEDIA-1 — THE SLOT IS THE ACTION. It used to be an inert
          View beside a « [DEMO] simuler » button; tapping it now opens her photos
          and uploads the real bytes. Sans seam (`uploadWired` false) it stays
          inert rather than pretending. */}
      {st === 'none' && (
        <Pressable
          style={({ pressed }) => [S.coverSlot, S.coverSlotDashed, pressed && S.pressed]}
          onPress={uploadWired === true ? onPickCover : undefined}
          accessibilityRole="button"
          accessibilityLabel={t('k.cover.ajouter')}
        >
          <IconCamera size={26} color={SHOP.accent} />
          <Text style={S.coverAddText}>{t('k.cover.ajouter')}</Text>
          <Text style={S.coverSpecs}>{t('k.cover.specs')}</Text>
        </Pressable>
      )}
      {st === 'uploading' && (
        <View style={[S.coverSlot, S.coverSlotFilled]}>
          <Text style={S.coverCapsState}>{t('k.cover.envoi')}</Text>
          <View style={S.coverTrack}><View style={S.coverBar} /></View>
        </View>
      )}
      {(st === 'pending' || st === 'live') && (
        <View style={[S.coverSlot, S.coverSlotPhoto, coverRatio !== null ? { height: undefined, aspectRatio: coverRatio } : null]}>
          {/* HER ACTUAL PHOTOGRAPH — the slot used to draw a coloured field with a
              pill and no image, so « en ligne » was a claim about nothing.
              CADRE-COUVERTURE: the slot now takes THIS photo's proportions, so
              nothing is cut off; `contain` because on this screen he is checking
              his picture, not previewing a crop — « Ajuster le cadrage » is
              where the header's real framing is decided. */}
          {sf.cover.url ? (
            <Image
              source={{ uri: sf.cover.url }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
              onLoad={(e) => {
                const src = e.nativeEvent.source as { width?: number; height?: number } | undefined;
                if (src?.width !== undefined && src?.height !== undefined) {
                  const r = cadreRatio(src.width, src.height);
                  setCoverRatio((prev) => (prev === r ? prev : r));
                }
              }}
            />
          ) : null}
          <View style={[S.pill, st === 'pending' ? S.pillWarn : S.pillOk]}>
            <Text style={[S.pillText, { color: st === 'pending' ? '#7A5104' : '#14603A' }]}>{t(st === 'pending' ? 'k.cover.pilule_verif' : 'k.cover.pilule_ligne')}</Text>
          </View>
        </View>
      )}
      {st === 'error' && (
        <View style={[S.coverSlot, S.coverSlotError]}>
          <Text style={S.coverErrTitle}>{coverError?.title ?? t('k.cover.err_titre')}</Text>
          <Text style={S.coverErrBody}>{coverError?.body ?? t('k.cover.err_corps')}</Text>
          <Pressable style={({ pressed }) => [S.ghostSmall, pressed && S.pressed]} onPress={onRetry}><Text style={S.ghostSmallText}>{t('k.cover.reessayer')}</Text></Pressable>
        </View>
      )}
      {st === 'none' && (
        <View style={S.noteSable}>
          <Text style={S.noteSableText}>{disabledNote ?? t('k.cover.note_defaut')}</Text>
        </View>
      )}
      {st === 'pending' && <View style={S.noteWarn}><Text style={S.noteWarnText}>{t('k.cover.note_verif')}</Text></View>}
      {/* MEDIA-2 — « Retirer la couverture » REMOVED NOTHING. It flipped local
          state only: no remove route exists, so her cliente kept seeing the old
          cover and it reappeared on the next read. A silent fabricated removal on
          real data. Replacing the photo is the thing that genuinely works today —
          the upload overwrites — so that is what the button now offers. */}
      {st === 'live' && uploadWired === true && (
        <Pressable style={({ pressed }) => [S.ghostSmall, pressed && S.pressed]} onPress={onPickCover}>
          <Text style={S.ghostSmallText}>{t('k.cover.changer')}</Text>
        </Pressable>
      )}
      {/* ENTETES-C — the second act on a LIVE photo: slide it inside her
          header's own frame. A secondary action, so it whispers (ghost). */}
      {st === 'live' && onAdjustCover !== undefined && (
        <Pressable style={({ pressed }) => [S.ghostSmall, pressed && S.pressed]} onPress={onAdjustCover} accessibilityRole="button">
          <Text style={S.ghostSmallText}>{t('k.cadrage.ajuster')}</Text>
        </Pressable>
      )}
      {/* The [DEMO] simulate row is GONE (founder: « there are still some mocks in
          every feature »). The states above are now driven by a real upload. */}
      <Text style={[S.caps, S.capsGap]}>{t('k.portrait.caps')}</Text>
      {/* C-K5 — segments portrait */}
      <PortraitSegments sf={sf} onPickAvatar={onPickAvatar} sending={avatarSending} onAdjust={onAdjustAvatar} />
    </ScrollView>
  );
}

function PortraitSegments({ sf, onPickAvatar, sending, onAdjust }: { sf: Storefront; onPickAvatar?: (() => void) | undefined; sending?: boolean | undefined; onAdjust?: (() => void) | undefined }) {
  const [mode, setMode] = useState<'monogram' | 'photo'>(sf.avatar.mode);
  const th = THEMES[sf.theme];
  const initial = sf.name.replace(/^Chez\s+/i, '').charAt(0).toUpperCase();
  return (
    <View>
      <View style={S.segTrack}>
        {(['monogram', 'photo'] as const).map((m) => (
          <Pressable key={m} style={[S.segBtn, mode === m && S.segBtnActive]} onPress={() => setMode(m)} accessibilityRole="button" accessibilityState={{ selected: mode === m }}>
            <Text style={[S.segText, mode === m && S.segTextActive]}>{t(m === 'monogram' ? 'k.portrait.monogramme' : 'k.portrait.photo')}</Text>
          </Pressable>
        ))}
      </View>
      {mode === 'monogram' ? (
        <View style={S.portraitRow}>
          <View style={[S.portraitDisc, { backgroundColor: th.accent }]}>
            <Text style={[S.portraitDiscText, { color: th.on }]}>{initial}</Text>
          </View>
          <Text style={S.portraitNote}>{t('k.portrait.note_monogramme')}</Text>
        </View>
      ) : (
        <View style={S.portraitRow}>
          {/* MEDIA-2 — THIS SLOT WAS A DEAD VIEW. The service could already store an
              avatar; the app had no caller, so she tapped a camera icon and nothing
              happened. It is a Pressable now, and it shows the portrait she chose.
              Without the seam it stays visibly inert rather than pretending. */}
          <Pressable
            style={({ pressed }) => [S.portraitSlotDashed, pressed && onPickAvatar !== undefined && S.pressed]}
            onPress={sending === true ? undefined : onPickAvatar}
            accessibilityRole="button"
            accessibilityState={{ busy: sending === true }}
            accessibilityLabel={t('k.portrait.photo')}
          >
            {sending === true ? (
              <Text style={S.coverCapsState}>{t('k.cover.envoi')}</Text>
            ) : sf.avatar.url ? (
              <Image source={{ uri: sf.avatar.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <IconCamera size={20} color="#8A7D6B" />
            )}
          </Pressable>
          <Text style={S.portraitNote}>{t('k.portrait.note_photo')}</Text>
        </View>
      )}
      {/* ENTETES-C — her portrait's framing: same secondary act as the cover,
          shown only when a real photo exists to frame. */}
      {mode === 'photo' && sf.avatar.url !== undefined && onAdjust !== undefined && (
        <Pressable style={({ pressed }) => [S.ghostSmall, pressed && S.pressed]} onPress={onAdjust} accessibilityRole="button">
          <Text style={S.ghostSmallText}>{t('k.cadrage.ajuster')}</Text>
        </Pressable>
      )}
    </View>
  );
}

function K4({ sf, onBack, onPick, onPickEntete, enteteEnCours, liveSlug, onCadrerApres }: { sf: Storefront; onBack: () => void; onPick: (k: VitrineThemeKey) => void; onPickEntete: (k: HeaderStyleKey) => void; enteteEnCours?: HeaderStyleKey | undefined; liveSlug?: string | undefined; onCadrerApres?: (() => void) | undefined }) {
  /**
   * APERÇU AVANT D'APPLIQUER (founder flow, 2026-08-03): a tap no longer
   * changes her shop — it opens the sheet showing that header on her REAL page.
   * « Appliquer » in the sheet is what writes it, and sliding the sheet down
   * leaves everything as it was.
   *
   * WHY THIS IS THE SAFER SHAPE, not just the prettier one: the old grid saved
   * on every tap, so browsing forty-three styles meant forty-three writes to
   * her live shop, each one visible to any client who happened to be looking.
   */
  const [apercu, setApercu] = useState<HeaderStyleKey | null>(null);
  // THEMES-8 — the picker offers EVERY curated preset, derived from the record
  // so a canon preset can never exist without a card to choose it. (The header
  // grid opposite deliberately does NOT do this: header keys can be canon
  // vocabulary with no render unit yet, and offering one would draw the default
  // silently. A theme has no such gap — its four tokens ARE its render.)
  const ORDER = Object.keys(THEMES) as VitrineThemeKey[];
  // ENTETES-B — the canon headers as cards: name + a one-line whisper of
  // character. ENTETES-APERÇU (founder order 2026-08-03) added the SILHOUETTE
  // above the name, so the shape each style gives her cover is visible before
  // the tap — the comment that used to stand here said there were no preview
  // thumbnails, and that is no longer true.
  const currentEntete = headerStyleOf(sf);
  const enCours = enteteEnCours;
  // The previews wear HER chosen habillage, so the two grids answer the same
  // question — « what will my shop look like » — in one visual language.
  const thCourant = THEMES[sf.theme];
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollPad}>
      <KHeader title={t('k.theme.title')} onBack={onBack} />
      <Text style={S.caps}>{t('k.theme.caps')}</Text>
      <View style={S.themeGrid}>
        {ORDER.map((key) => {
          const th = THEMES[key];
          const selected = sf.theme === key;
          return (
            <Pressable key={key} style={[S.themeCard, selected ? S.themeCardSelected : S.themeCardRest]} onPress={() => onPick(key)} accessibilityRole="button" accessibilityState={{ selected }}>
              <WovenBand accent={th.accent} gold={GOLD_BUYER} height={10} />
              <View style={S.themeSwatches}>
                <View style={[S.swatch, { backgroundColor: th.accent }]} />
                <View style={[S.swatch, { backgroundColor: th.deep }]} />
                <View style={[S.swatch, { backgroundColor: th.soft }]} />
              </View>
              <View style={S.themeNameRow}>
                <Text style={S.themeName}>{th.name}</Text>
                {key === 'laterite' && (
                  <View style={S.defautPill}><Text style={S.defautPillText}>{t('k.theme.defaut')}</Text></View>
                )}
              </View>
              {selected && (
                <View style={S.themeCheck}>
                  <IconCheckK size={14} color="#FCF4EE" />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      {/* ENTETES-B — « En-tête de boutique »: the SAME card / selected / check
          pattern as the theme grid above, one tap = one save (headerStyle only).
          ENTETES-E0/E — the grid maps the PICKABLE list, not the canon
          vocabulary; with the Beurni Boss five built, that list is the eleven. */}
      <Text style={[S.caps, S.capsGap]}>{t('k.entete.caps')}</Text>
      <View style={S.themeGrid}>
        {PICKABLE_HEADER_STYLES.map((key) => {
          const selected = currentEntete === key;
          return (
            <Pressable key={key} style={[S.themeCard, selected ? S.themeCardSelected : S.themeCardRest]} onPress={() => setApercu(key)} accessibilityRole="button" accessibilityState={{ selected }}>
              <EnteteApercu spec={frameSpecFor(key, 'cover')} deep={thCourant.deep} soft={thCourant.soft} accent={thCourant.accent} />
              <View style={S.themeNameRow}>
                <Text style={S.themeName}>{t(`k.entete.nom_${key}`)}</Text>
                {key === 'classique' && (
                  <View style={S.defautPill}><Text style={S.defautPillText}>{t('k.theme.defaut')}</Text></View>
                )}
              </View>
              <Text style={S.enteteSub}>{t(`k.entete.sub_${key}`)}</Text>
              {/* PERSONNALISER-HONESTY-1 — the check mark means STORED, never
                  « tapped ». `selected` reads the adopted storefront, so it
                  appears when the service has accepted and the read-back has
                  landed; while the save is in flight the card says so, and a
                  refusal simply never becomes a check (law 7: queued is
                  pending, never done). */}
              {enCours === key ? (
                <Text style={S.enteteEnCours}>{t('k.entete.en_cours')}</Text>
              ) : selected ? (
                <View style={S.themeCheck}>
                  <IconCheckK size={14} color="#FCF4EE" />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={S.noteCard}><Text style={S.noteCardText}>{t('k.theme.note')}</Text></View>
      <EnteteApercuSheet
        visible={apercu !== null}
        styleKey={apercu}
        label={apercu === null ? '' : t(`k.entete.nom_${apercu}`)}
        liveSlug={liveSlug}
        themeTones={{ deep: thCourant.deep, soft: thCourant.soft, accent: thCourant.accent }}
        onApply={(k) => {
          setApercu(null);
          onPickEntete(k);
          // CADRER TOUT DE SUITE (founder 2026-08-04: « when a reseller decides
          // to appliquer a theme and tap on it I want the next slide to be to
          // adjust the photo on the frame at the same time instead going back
          // to another screen couverture & portrait to do that »).
          //
          // HE IS DESCRIBING ONE DECISION, NOT TWO. Every header frames the
          // cover differently — Royale's medallion and Héritage's strip keep
          // completely different parts of the same photograph — so the moment a
          // style is applied is exactly the moment the framing is wrong and she
          // knows it. Sending her to another screen to fix what this screen just
          // broke is the app making its own structure her problem.
          //
          // ONLY WHEN THERE IS SOMETHING TO FRAME: the caller passes this
          // undefined unless a LIVE cover exists, so applying a style on a shop
          // with no photograph does what it always did and opens nothing.
          onCadrerApres?.();
        }}
        onClose={() => setApercu(null)}
      />
    </ScrollView>
  );
}

/* ------------------------------------------------------------------- K5 -- */

function K5({ sf, onBack, onPin, onMove, catalog }: { sf: Storefront; onBack: () => void; onPin: (pid: string, inStock: boolean) => void; onMove: (pid: string, dir: -1 | 1) => void; catalog?: readonly KCatalogItem[] | undefined }) {
  const ordered = sf.curatedItems.map((pid) => fromCatalog(catalog, pid)).filter((p): p is KCatalogItem => p !== undefined);
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollPad}>
      <KHeader
        title={t('k.une.title')}
        onBack={onBack}
        pill={<View style={[S.etatPill, S.etatPillNeutre]}><Text style={S.etatPillText}>{tf('k.une.pill', { n: String(sf.featuredItems.length), cap: String(FEATURED_CAP) })}</Text></View>}
      />
      <Text style={S.subTitle}>{t('k.une.sous_titre')}</Text>
      {/* B2 (verifier): a blank card is not a state. Two honest causes, told
          apart by what the SERVICE says she has: no articles yet vs a catalog
          that could not load while her shop has articles. The pill above reads
          featuredItems (service truth), so it must never sit over silence. */}
      {ordered.length === 0 && (
        <View style={S.dashedCard}>
          <Text style={S.dashedTitle}>{t(sf.curatedItems.length === 0 ? 'k.une.zero_titre' : 'k.une.charge_titre')}</Text>
          <Text style={S.dashedBody}>{t(sf.curatedItems.length === 0 ? 'k.une.zero_corps' : 'k.une.charge_corps')}</Text>
        </View>
      )}
      <View style={S.rowsCard}>
        {ordered.map((p, i) => {
          const pinned = sf.featuredItems.includes(p.pid);
          return (
            <View key={p.pid} style={[S.orderRow, i > 0 && S.rowDivider, !p.inStock && S.orderRowEpuise]}>
              <Text style={S.grip}>≡</Text>
              {/* VIGNETTE — 44 px of art, the SMALLEST product render in the app,
                  and the one that repeats most: twelve curated articles pulled
                  twelve full-size photographs to fill twelve 44 px squares. No
                  hero sits beside these rows, so every one of them asks for the
                  small copy. */}
              {p.assetRefs[0] !== undefined ? (
                <Image source={{ uri: vignette(p.assetRefs[0]) }} style={S.orderArt as unknown as ImageStyle} resizeMode="cover" />
              ) : (
                <View style={S.orderArt} />
              )}
              <View style={S.rowBody}>
                <View style={S.orderNameRow}>
                  <Text style={S.orderName} numberOfLines={1}>{p.name}</Text>
                  {pinned && <View style={S.unePill}><Text style={S.unePillText}>{t('k.une.pilule')}</Text></View>}
                  {!p.inStock && <View style={S.epuisePill}><Text style={S.epuisePillText}>{t('vit.epuise')}</Text></View>}
                </View>
                <Text style={S.orderPrice}>{fmtFcfa(p.priceFcfa)}</Text>
              </View>
              <Pressable style={({ pressed }) => [S.arrowBtn, pressed && S.pressed]} onPress={() => onMove(p.pid, -1)} accessibilityRole="button" accessibilityLabel={t('k.une.monter')}>
                <Text style={S.arrowText}>▲</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [S.arrowBtn, pressed && S.pressed]} onPress={() => onMove(p.pid, 1)} accessibilityRole="button" accessibilityLabel={t('k.une.descendre')}>
                <Text style={S.arrowText}>▼</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [S.starBtn, pinned && S.starBtnPinned, pressed && S.pressed]} onPress={() => onPin(p.pid, p.inStock)} accessibilityRole="button" accessibilityState={{ selected: pinned }}>
                <IconStarK size={17} filled={pinned} />
              </Pressable>
            </View>
          );
        })}
      </View>
      <View style={S.noteSable}><Text style={S.noteSableText}>{t('k.une.note_epuise')}</Text></View>
    </ScrollView>
  );
}

/* -------------------------------------------------------------- K7 (vue) -- */

/** K7 — aperçu vue cliente (READ-ONLY, §8.10). Also mounted as the pubvitrine
 * screen's content (it replaces the old « Vitrine publique (aperçu) »). */
export function ApercuCliente({ sf, onBack, onReadOnlyTap, catalog }: { sf: Storefront; onBack: () => void; onReadOnlyTap: () => void; catalog?: readonly KCatalogItem[] | undefined }) {
  const th = THEMES[sf.theme];
  const initial = sf.name.replace(/^Chez\s+/i, '').charAt(0).toUpperCase();
  const sectioned = new Set(sf.sections.flatMap((s) => s.pids));
  const featured = sf.featuredItems.map((pid) => fromCatalog(catalog, pid)).filter((p): p is KCatalogItem => p !== undefined && p.inStock);
  const groups: { title: string; count: number; items: KCatalogItem[] }[] = [];
  for (const s of sf.sections) {
    if (s.pids.length === 0) continue; // section vide = invisible côté cliente
    const items = s.pids.map((pid) => fromCatalog(catalog, pid)).filter((p): p is KCatalogItem => p !== undefined);
    groups.push({ title: s.name.toUpperCase(), count: items.length, items: [...items.filter((p) => p.inStock), ...items.filter((p) => !p.inStock)] });
  }
  const residual = sf.curatedItems.map((pid) => fromCatalog(catalog, pid)).filter((p): p is KCatalogItem => p !== undefined && !sectioned.has(p.pid));
  if (groups.length === 0 || residual.length > 0) {
    groups.push({ title: t('vit.groupe_tous'), count: residual.length, items: [...residual.filter((p) => p.inStock), ...residual.filter((p) => !p.inStock)] });
  }
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollPad}>
      <View style={S.header}>
        <Pressable style={({ pressed }) => [S.backBtn, pressed && S.pressed]} onPress={onBack} accessibilityRole="button" accessibilityLabel={t('k.retour')}>
          <IconBackK size={17} />
        </Pressable>
        <Text style={S.apercuTitle} numberOfLines={1}>{t('k.apercu.title')}</Text>
        <View style={[S.etatPill, S.etatPillNeutre]}><Text style={S.etatPillText}>{t('k.apercu.lecture')}</Text></View>
      </View>
      {/* APERCU-PHOTOS-1 (founder-caught 2026-07-30) — HER ACTUAL PHOTOGRAPHS.
          This block drew a flat #8A5A3A rectangle whenever a cover was live and
          the monogram whenever it was not, so « aperçu » showed her the SAME
          brown field on every habillage and every en-tête, on a screen whose
          only job is to tell her what her cliente will see. She reported the
          cover « not showing on any of the en-têtes » from here — and the buyer
          page had been drawing it correctly all along. The K3 slot had this
          exact defect and was fixed (« a coloured field with no image, so « en
          ligne » was a claim about nothing »); the aperçu was left behind.
          Same idiom as K3 and the portrait cap: the real URL or nothing. */}
      <View style={[S.apercuCover, { backgroundColor: sf.cover.status === 'live' ? th.deep : th.soft }]}>
        {sf.cover.status === 'live' && sf.cover.url ? (
          <Image source={{ uri: sf.cover.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Text style={[S.previewFiligrane, { color: th.accent }]}>{initial}</Text>
        )}
      </View>
      <View style={S.apercuIdentity}>
        <View style={[S.apercuAvatar, { backgroundColor: th.accent }]}>
          {sf.avatar.url ? (
            <Image source={{ uri: sf.avatar.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <Text style={[S.apercuAvatarText, { color: th.on }]}>{initial}</Text>
          )}
        </View>
        <View style={S.previewNameRow}>
          <Text style={S.apercuName}>{sf.name}</Text>
          <IconCheckK size={17} color={th.accent} width={2.6} />
        </View>
        {sf.tagline ? <Text style={S.previewTagline}>{sf.tagline}</Text> : null}
        <Text style={S.apercuZone}>{tf('k.apercu.verifiee', { zone: sf.zone })}</Text>
      </View>
      {featured.length > 0 && (
        <View>
          <Text style={S.caps}>{t('vit.a_la_une')}</Text>
          {featured.map((p) => (
            <Pressable key={p.pid} style={S.apercuFeatured} onPress={onReadOnlyTap} accessibilityRole="button">
              <View style={[S.apercuFeaturedArt, { backgroundColor: th.soft }]} />
              <View style={S.apercuFeaturedBody}>
                <Text style={S.apercuTileName}>{p.name}</Text>
                <Text style={[S.apercuTilePrice, { color: th.deep }]}>{fmtFcfa(p.priceFcfa)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      {groups.map((g) => (
        <View key={g.title}>
          <View style={S.groupRow}>
            <Text style={S.caps}>{g.title}</Text>
            <Text style={S.groupCount}>· {g.count}</Text>
          </View>
          <View style={S.apercuGrid}>
            {g.items.map((p) => (
              <Pressable key={p.pid} style={S.apercuTile} onPress={onReadOnlyTap} accessibilityRole="button">
                <View style={[S.apercuTileArt, { backgroundColor: th.soft }]}>
                  {!p.inStock && (
                    <View style={S.apercuVeil}><Text style={S.apercuTampon}>{t('vit.epuise')}</Text></View>
                  )}
                </View>
                <Text style={S.apercuTileName} numberOfLines={2}>{p.name}</Text>
                <Text style={[S.apercuTilePrice, !p.inStock ? S.apercuPriceEpuise : { color: th.deep }]}>{fmtFcfa(p.priceFcfa)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <View style={S.inkBand}><Text style={S.inkBandText}>{t('vit.bande_apercu')}</Text></View>
    </ScrollView>
  );
}

/* ---------------------------------------------------------------- styles -- */
/** Exported for the property tests — values are the Phase-0 table's bytes
 * (bp-K1…K7 blueprints); the test pins its own independently-derived literals. */
export const S = StyleSheet.create(K_RAW_STYLES as unknown as Record<keyof typeof K_RAW_STYLES, ViewStyle & TextStyle>);

