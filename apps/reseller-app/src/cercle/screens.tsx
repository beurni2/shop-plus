/**
 * LE CERCLE — screens (HANDOFF §5, composed in §5 order; chrome §0 from the
 * app shell). Every string via the i18n catalog; every byte from styles.ts
 * (the Phase-0 table); every figure from model.ts (the demo « server ») —
 * screens do NO arithmetic (§0 render-only law).
 *
 * Motion (§7): screen entry rides the app's ScreenTransition; the gauge width
 * animates .6s (useReducedMotion cuts it — the gauge jumps); presses use the
 * app's pressed-opacity convention; toasts ride the App toast rail.
 *
 * SVG glyph law (no-emoji gate, U+2600–27BF banned): stars, checks and the
 * two-heads icon are SVG; product art is the app's initial-letter duotone
 * tile (the planche's emoji glyphs are the documented lawful divergence).
 */

import React, { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { t, tf } from '../i18n';
import { formatFcfa } from '../earnings';
import { useReducedMotion } from '../ui/kit';
import {
  CAMP_SEED, CERCLE_AVIS, CERCLE_DIVERS, CERCLE_MEMBRES, CERCLE_PRODUITS, FENETRE,
  MEMBER_CHIPS, RECIPES, ZONES,
  attribue, createSeedPartnerMock, draftInit, ecoPreview, evalGuards, filterMembres, fundingModel,
  gaugePct, investi, launchCampaign, partagerBadge, pickProduct, places, produit, ratioOk, restant,
  setRecipe, setZone, stepK, stepMax, stepTo, tilePill, toggleConsent, togglePause,
  type CampDraft, type Campagne, type CercleAvis, type PartnerPort, type RecipeId,
} from './model';
import { CERCLE_RAW_STYLES } from './styles';

const S = StyleSheet.create(
  CERCLE_RAW_STYLES as unknown as Record<keyof typeof CERCLE_RAW_STYLES, ViewStyle & TextStyle>,
);
const fmt = formatFcfa;

/* ---------------------------------------------------------------- icons -- */

export function IconCercleDeux({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  // C-CE22 two-heads (viewBox 24) — the dock's Cercle icon, spec paths verbatim.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" color={color}>
      <Circle cx={9} cy={8.5} r={3.2} />
      <Path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
      <Circle cx={17} cy={9.5} r={2.5} />
      <Path d="M16.2 14.6c2.2.3 3.8 1.6 4.3 4" />
    </Svg>
  );
}

function IconBackCe({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#1C1710" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14.5 6l-6 6 6 6" />
    </Svg>
  );
}

function IconPlusCe({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FCF4EE" strokeWidth={2.2} strokeLinecap="round">
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

function IconCheckCe({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

function StarCe({ size, filled }: { size: number; filled: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"
        fill={filled ? '#C89A3F' : 'none'}
        stroke="#C89A3F"
        strokeWidth={1.6}
      />
    </Svg>
  );
}

/** The five-star run as SVG (four-of-five renders one hollow) — no-emoji law. */
function StarRow({ n, size = 13, color }: { n: number; size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) =>
        color === undefined ? (
          <StarCe key={i} size={size} filled={i <= n} />
        ) : (
          <Svg key={i} width={size} height={size} viewBox="0 0 24 24">
            <Path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill={i <= n ? color : 'none'} stroke={color} strokeWidth={1.6} />
          </Svg>
        ),
      )}
    </View>
  );
}

/* ----------------------------------------------------------- controller -- */

export interface CercleController {
  readonly camp: Campagne | null;
  readonly draft: CampDraft;
  readonly port: PartnerPort;
  patchDraft(next: CampDraft): void;
  resetDraft(): void;
  /** W4 launch — §4 effects; returns the new campaign (App opens Partager). */
  launch(): Campagne;
  pauseToggle(): void;
}

/** One controller at the App level — camp + draft + the [MOCK-PARTENAIRE]
 * port. The port is certified-mock ONLY (scoped SP9 override — no real money;
 * CERCLE-REAL-FUNDING swaps the implementation, never this seam). */
export function useCercle(onToast: (m: string) => void): CercleController {
  const [camp, setCamp] = useState<Campagne | null>(CAMP_SEED);
  const [draft, setDraft] = useState<CampDraft>(draftInit());
  const port = useRef<PartnerPort>(createSeedPartnerMock());
  const seq = useRef(0);
  return useMemo<CercleController>(
    () => ({
      camp,
      draft,
      port: port.current,
      patchDraft: setDraft,
      resetDraft: () => setDraft(draftInit()),
      launch() {
        seq.current += 1;
        const next = launchCampaign(draft, seq.current);
        port.current.allocate(next.id, next.budget); // [MOCK-PARTENAIRE]
        setCamp(next);
        onToast(t('ce.toast_lancee'));
        return next;
      },
      pauseToggle() {
        if (camp === null) return;
        const next = togglePause(camp);
        setCamp(next);
        onToast(t(next.state === 'PAUSED' ? 'ce.toast_pause' : 'ce.toast_reactivee'));
      },
    }),
    [camp, draft, onToast],
  );
}

/* ------------------------------------------------------- shared pieces --- */

function Pill({ kind, label }: { kind: 'ok' | 'neutre' | 'warn' | 'rose'; label: string }) {
  const box = kind === 'ok' ? S.pillOk : kind === 'neutre' ? S.pillNeutre : kind === 'warn' ? S.pillWarn : S.pillRose;
  const txt = kind === 'ok' ? S.pillOkText : kind === 'neutre' ? S.pillNeutreText : kind === 'warn' ? S.pillWarnText : S.pillRoseText;
  return (
    <View style={[S.pill, box]}>
      <Text style={[S.pillText, txt]}>{label}</Text>
    </View>
  );
}

/** C-CE2 gauge — width .6s (§7); reduced motion ⇒ jumps to value. */
function Gauge({ pct }: { pct: number }) {
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(pct)).current;
  React.useEffect(() => {
    if (reduced) {
      anim.setValue(pct);
      return;
    }
    Animated.timing(anim, { toValue: pct, duration: 600, useNativeDriver: false }).start();
  }, [pct, reduced, anim]);
  return (
    <View style={S.gaugeTrack}>
      <Animated.View style={[S.gaugeFill, { width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
    </View>
  );
}

function AvisCard({ avis, pillKey }: { avis: CercleAvis; pillKey: string }) {
  return (
    <View style={S.reviewCard}>
      <View style={S.reviewHead}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
          <Text style={S.reviewName} numberOfLines={1}>{avis.name}</Text>
          <StarRow n={avis.stars} />
        </View>
        <View style={S.reviewPill}><Text style={S.reviewPillText}>{t(pillKey)}</Text></View>
      </View>
      <Text style={S.reviewQuote}>{tf('ce.avis_citation', { texte: avis.quote })}</Text>
    </View>
  );
}

function ArtTile({ name, size, radius }: { name: string; size: number; radius: number }) {
  return (
    <View style={[S.prodArt, { width: size, height: size, borderRadius: radius }]}>
      <Text style={S.prodArtGlyph}>{name.slice(0, 1)}</Text>
    </View>
  );
}

/* --------------------------------------------- §5-D delta components ------ */

/** D4a — the composed pending hero (montant BG800/38 + FCFA BG700/17) with the
 * §7 800 ms ease-out-cubic count-up on arrival (reduced motion ⇒ static). */
export function PendingHero({ label, amount }: { label: string; amount: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? amount : 0);
  React.useEffect(() => {
    if (reduced) { setShown(amount); return; }
    const t0 = Date.now();
    const tick = (): void => {
      const p = Math.min(1, (Date.now() - t0) / 800);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(amount * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [amount, reduced]);
  return (
    <View>
      <Text style={[S.statCaps, { color: '#FCF4EE', opacity: 0.85 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <Text style={{ fontFamily: S.reputNote.fontFamily, fontSize: 38, fontWeight: '800', color: '#FCF4EE', fontVariant: ['tabular-nums'] }}>
          {fmt(shown).replace(/\u202fFCFA$/, '')}
        </Text>
        <Text style={{ fontFamily: S.reputNote.fontFamily, fontSize: 17, fontWeight: '700', color: '#FCF4EE' }}>FCFA</Text>
      </View>
    </View>
  );
}

/** D4b — a « Détail par vente » card. NET-FIRST: the net renders first (deep,
 * BG800/16); the brut/frais/−Cercle derivation renders under it on campaign
 * orders only (SP-I04/I12 over the planche's ledger order — flagged). */
export function GainsSaleCard({ card }: { card: { code: string; productName: string; netPayeFcfa: number; campFcfa: number; brutFcfa: number; fraisFcfa: number } }) {
  return (
    <View style={S.reviewCard}>
      <View style={S.reviewHead}>
        <Text style={S.reviewName} numberOfLines={1}>{`${card.code} — ${card.productName}`}</Text>
      </View>
      <View style={[S.moneyRow, { paddingVertical: 3 }]}>
        <Text style={[S.moneyLabel, { fontSize: 13 }]}>{t('ce.gains_net_label')}</Text>
        <Text style={{ fontFamily: S.reputNote.fontFamily, fontSize: 16, fontWeight: '800', color: '#701134', fontVariant: ['tabular-nums'] }}>{fmt(card.netPayeFcfa)}</Text>
      </View>
      {card.campFcfa > 0 && (
        <View>
          <View style={[S.moneyRow, { paddingVertical: 3 }]}>
            <Text style={[S.moneyLabelSub, { fontSize: 13 }]}>{t('ce.gains_brut_label')}</Text>
            <Text style={[S.moneyVal, { fontSize: 13 }]}>{fmt(card.brutFcfa)}</Text>
          </View>
          <View style={[S.moneyRow, { paddingVertical: 3 }]}>
            <Text style={[S.moneyLabelSub, { fontSize: 13 }]}>{t('ce.gains_frais_label')}</Text>
            <Text style={[S.moneyVal, { fontSize: 13 }]}>{`−${fmt(card.fraisFcfa)}`}</Text>
          </View>
          <View style={[S.moneyRow, { paddingVertical: 3 }]}>
            <Text style={[S.moneyLabelSub, { fontSize: 13 }]}>{t('ce.gains_cercle_label')}</Text>
            <Text style={[S.moneyVal, { fontSize: 13 }]}>{`−${fmt(card.campFcfa)}`}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

/** D2 — C-CE23 « Mon Cercle » Accueil card (living sub-line). */
export function CercleAccueilCard({ camp, membres, onPress }: { camp: Campagne | null; membres: number; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [S.aProdCard, { marginTop: 12, padding: 14, paddingHorizontal: 15, borderRadius: 18 }, pressed && { transform: [{ scale: 0.98 }] }]} onPress={onPress} accessibilityRole="button">
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: '#F8E4EC', alignItems: 'center', justifyContent: 'center' }}>
        <IconCercleDeux size={20} color="#701134" />
      </View>
      <View style={S.rowBody}>
        <Text style={S.campTileTitle}>{t('ce.d2_titre')}</Text>
        <Text style={[S.memberSub, { fontSize: 12.5 }]} numberOfLines={1}>
          {camp !== null
            ? tf('ce.d2_sous_ligne', { membres: String(membres), recette: camp.recipe, o: String(camp.orders), max: String(camp.maxOrders) })
            : tf('ce.d2_sous_vide', { membres: String(membres) })}
        </Text>
      </View>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#B3A78F" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M9.5 6l6 6-6 6" />
      </Svg>
    </Pressable>
  );
}

/* ------------------------------------------------------------- C1 · HUB -- */

export function CercleHub({
  ctl,
  onToast,
  go,
}: {
  ctl: CercleController;
  onToast: (m: string) => void;
  go: (s: 'campnew' | 'campaign' | 'funding' | 'reput' | 'membres' | 'lien') => void;
}) {
  const c = ctl.camp;
  const pl = c ? places(c) : 0;
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollTab} showsVerticalScrollIndicator={false}>
      <Text style={S.tabTitle}>{t('ce.hub_titre')}</Text>
      <Text style={S.tabSub}>{t('ce.hub_sous_titre')}</Text>

      {/* ③ stat grid — C-CE1 (Membres · Ma réputation as a button) */}
      <View style={[S.statGrid, S.mt16]}>
        <View style={S.statCard}>
          <Text style={S.statCaps}>{t('ce.caps_membres')}</Text>
          <Text style={S.statValue}>{CERCLE_DIVERS.membres}</Text>
          <Text style={S.statNoteOk}>{tf('ce.membres_mois', { n: String(CERCLE_DIVERS.membresMois) })}</Text>
        </View>
        <Pressable style={({ pressed }) => [S.statCard, pressed && { transform: [{ scale: 0.97 }] }]} onPress={() => go('reput')} accessibilityRole="button">
          <Text style={S.statCaps}>{t('ce.caps_reputation')}</Text>
          <Text style={S.statValue}>{CERCLE_DIVERS.livraisons}</Text>
          <Text style={S.statNote}>{tf('ce.reput_note_ligne', { avis: String(CERCLE_DIVERS.avis), note: CERCLE_DIVERS.note })}</Text>
        </Pressable>
      </View>

      {/* ④ C-CE4 suggestion — one, never auto-sent */}
      <View style={[S.suggestion, S.mt12]}>
        <Text style={S.statCaps}>{t('ce.suggestion_caps')}</Text>
        <Text style={S.suggestionText}>
          {c !== null && pl > 0
            ? tf('ce.suggestion_places', { n: String(pl), zone: c.zone })
            : t('ce.suggestion_prete')}
        </Text>
        <Text style={S.suggestionWhy}>{t('ce.suggestion_pourquoi')}</Text>
        <Pressable style={({ pressed }) => [S.chipRose, pressed && { transform: [{ scale: 0.96 }] }]} onPress={() => { ctl.resetDraft(); go('campnew'); }} accessibilityRole="button">
          <Text style={S.chipRoseText}>{t('ce.utiliser_recette')}</Text>
        </Pressable>
      </View>

      {/* ⑤ C-CE2 campaign tile (Active · En pause · Budget épuisé · empty) */}
      {c !== null ? (
        <Pressable style={({ pressed }) => [S.campTile, S.mt12, pressed && { transform: [{ scale: 0.98 }] }]} onPress={() => go('campaign')} accessibilityRole="button">
          <View style={S.campTileRow}>
            <Text style={S.campTileTitle} numberOfLines={1}>{`${c.recipe} — ${c.zone}`}</Text>
            {tilePill(c) === 'active' && <Pill kind="ok" label={t('ce.pilule_active')} />}
            {tilePill(c) === 'pause' && <Pill kind="neutre" label={t('ce.pilule_pause')} />}
            {tilePill(c) === 'epuise' && <Pill kind="warn" label={t('ce.pilule_epuise')} />}
          </View>
          <Gauge pct={gaugePct(c)} />
          <View style={S.campTileFoot}>
            <Text style={[S.campTileFootText, { flexShrink: 1 }]} numberOfLines={1}>
              {tf('ce.tuile_pied', { o: String(c.orders), max: String(c.maxOrders), fenetre: FENETRE })}
            </Text>
            <Text style={S.campTileFootText}>{`${fmt(investi(c))} / ${fmt(c.budget)}`}</Text>
          </View>
        </Pressable>
      ) : (
        <View style={[S.campTile, S.mt12]}>
          <View style={S.campTileRow}>
            <Text style={S.campTileTitle}>{t('ce.tuile_vide_titre')}</Text>
          </View>
          <Text style={S.campTileEmptySub}>{t('ce.tuile_vide_sous')}</Text>
        </View>
      )}

      {/* ⑥ C-CE3 result — « attribué », jamais « généré » */}
      {c !== null && (
        <View style={[S.resultCard, S.mt12]}>
          <Text style={S.statCaps}>{t('ce.resultat_caps')}</Text>
          <View style={S.moneyRow}>
            <Text style={S.moneyLabel}>{t('ce.resultat_investi')}</Text>
            <Text style={S.moneyVal}>{fmt(investi(c))}</Text>
          </View>
          <View style={S.moneyRow}>
            <Text style={S.moneyLabel}>{t('ce.resultat_attribue')}</Text>
            <Text style={S.moneyValDeep}>{fmt(attribue(c))}</Text>
          </View>
          {ratioOk(c) ? (
            <View style={S.resultNoteOk}><Text style={S.resultNoteOkText}>{t('ce.resultat_note_ok')}</Text></View>
          ) : (
            <View style={S.resultNoteWarn}><Text style={S.resultNoteWarnText}>{t('ce.resultat_note_warn')}</Text></View>
          )}
        </View>
      )}

      {/* ⑦ CTA + ⑧ duo */}
      <Pressable style={({ pressed }) => [S.hubCta, pressed && { transform: [{ scale: 0.98 }] }]} onPress={() => { ctl.resetDraft(); go('campnew'); }} accessibilityRole="button">
        <IconPlusCe size={17} />
        <Text style={S.hubCtaText}>{t('ce.creer_campagne')}</Text>
      </Pressable>
      <View style={[S.duo, S.mt10]}>
        <Pressable style={({ pressed }) => [S.duoSoft, pressed && { transform: [{ scale: 0.97 }] }]} onPress={() => go('membres')} accessibilityRole="button">
          <Text style={S.duoSoftText}>{t('ce.btn_membres')}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [S.duoSoft, pressed && { transform: [{ scale: 0.97 }] }]} onPress={() => go('funding')} accessibilityRole="button">
          <Text style={S.duoSoftText}>{t('ce.btn_financement')}</Text>
        </Pressable>
      </View>

      {/* ⑨⑩ avis — the two hub cards; « Tout voir » → R1 (full list out of scope §0) */}
      <View style={S.sectionRow}>
        <Text style={S.capsSection}>{t('ce.avis_caps')}</Text>
        <Pressable style={({ pressed }) => [S.toutVoir, pressed && S.pressed]} onPress={() => go('reput')} accessibilityRole="button">
          <Text style={S.toutVoirText}>{t('ce.tout_voir')}</Text>
        </Pressable>
      </View>
      <View style={[S.gap10, S.mt10]}>
        {CERCLE_AVIS.slice(0, 2).map((a) => <AvisCard key={a.name} avis={a} pillKey="ce.avis_pill_sera" />)}
      </View>

      {/* ⑪ C-CE8 parrainage — single-level, forever (loi 1) */}
      <View style={[S.suggestion, S.mt12]}>
        <View style={S.campTileRow}>
          <Text style={S.campTileTitle}>{t('ce.parrainage_titre')}</Text>
          <Pill kind="ok" label={t('ce.parrainage_pill')} />
        </View>
        <Text style={[S.suggestionWhy, { marginTop: 6, fontSize: 12.5 }]}>
          {t('ce.parrainage_avant')} <Text style={[S.bold700, { color: '#701134' }]}>{t('ce.parrainage_montant')}</Text> {t('ce.parrainage_apres')}
        </Text>
        <Pressable
          style={({ pressed }) => [S.chipRose, pressed && { transform: [{ scale: 0.96 }] }]}
          onPress={() => onToast(t('ce.toast_parrainage'))}
          accessibilityRole="button"
        >
          <Text style={S.chipRoseText}>{t('ce.copier_parrainage')}</Text>
        </Pressable>
      </View>

      {/* ⑫ duo ghost — Inviter / Pack de partage */}
      <View style={[S.duo, S.mt12]}>
        <Pressable style={({ pressed }) => [S.duoGhost, pressed && { transform: [{ scale: 0.97 }] }]} onPress={() => onToast(t('ce.toast_inviter'))} accessibilityRole="button">
          <Text style={S.duoGhostText}>{t('ce.btn_inviter')}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [S.duoGhost, pressed && { transform: [{ scale: 0.97 }] }]} onPress={() => go('lien')} accessibilityRole="button">
          <Text style={S.duoGhostText}>{t('ce.btn_pack')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------ W1–W4 · WIZARD --- */

export function CampWizard({
  ctl,
  onClose,
  onLaunched,
  onToast,
}: {
  ctl: CercleController;
  onClose: () => void;
  onLaunched: () => void;
  onToast: (m: string) => void;
}) {
  const d = ctl.draft;
  const g = evalGuards(d);
  const eco = ecoPreview(d);
  const back = (): void => {
    if (d.step === 0) onClose();
    else ctl.patchDraft(stepTo(d, (d.step - 1) as 0 | 1 | 2 | 3));
  };
  const next = (): void => {
    if (d.step < 3) ctl.patchDraft(stepTo(d, (d.step + 1) as 0 | 1 | 2 | 3));
  };
  const stepTitleKey = (['ce.w1_titre', 'ce.w2_titre', 'ce.w3_titre', 'ce.w4_titre'] as const)[d.step];
  const ctaLabel = d.step === 3 ? t('ce.w4_lancer') : t('ce.continuer');
  const ctaActive = d.step === 3 ? g.ctaActive : true;
  return (
    <View style={{ flex: 1 }}>
      {/* C-CE9 header + dots */}
      <View style={S.wizHead}>
        <Pressable style={({ pressed }) => [S.backBtn, pressed && { transform: [{ scale: 0.92 }] }]} onPress={back} accessibilityRole="button" accessibilityLabel={t('ce.retour')}>
          <IconBackCe size={17} />
        </Pressable>
        <Text style={S.wizTitle} numberOfLines={1}>{tf('ce.wiz_titre', { recette: d.recipe })}</Text>
        <Text style={S.wizStep}>{`${d.step + 1}/4`}</Text>
      </View>
      <View style={S.wizDots}>
        {[0, 1, 2, 3].map((i) => <View key={i} style={[S.wizDot, i <= d.step && S.wizDotOn]} />)}
      </View>

      <ScrollView style={S.screen} contentContainerStyle={S.scrollWizard} showsVerticalScrollIndicator={false}>
        <Text style={S.stepTitle}>{t(stepTitleKey)}</Text>

        {d.step === 0 && (
          <View style={[S.gap11, S.mt14]}>
            {RECIPES.map((r) => {
              const on = d.recipe === r;
              return (
                <Pressable key={r} style={({ pressed }) => [S.recipeCard, on && S.recipeCardOn, pressed && { transform: [{ scale: 0.98 }] }]} onPress={() => ctl.patchDraft(setRecipe(d, r))} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <View style={S.recipeRow}>
                    <Text style={S.recipeName}>{r}</Text>
                    <View style={S.recipePill}><Text style={S.recipePillText}>{t('ce.w1_2min')}</Text></View>
                  </View>
                  <Text style={S.recipeTag}>{t(`ce.w1_tag_${recipeKey(r)}`)}</Text>
                  <Text style={S.recipeBest}>
                    <Text style={S.recipeBestStrong}>{t('ce.w1_ideal')}</Text> {t(`ce.w1_best_${recipeKey(r)}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {d.step === 1 && (
          <View style={[S.gap10, S.mt14]}>
            {CERCLE_PRODUITS.map((p) => {
              const on = d.pid === p.pid;
              const epuise = p.stock === 0;
              return (
                <Pressable
                  key={p.pid}
                  style={({ pressed }) => [S.prodRow, on && !epuise && S.prodRowOn, epuise && S.prodRowEpuise, pressed && !epuise && { transform: [{ scale: 0.98 }] }]}
                  onPress={() => {
                    const r = pickProduct(d, p.pid);
                    if (r.ok) ctl.patchDraft(r.next);
                    else onToast(t(r.toastKey));
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on && !epuise, disabled: epuise }}
                >
                  <ArtTile name={p.name} size={46} radius={13} />
                  <View style={S.rowBody}>
                    <View style={S.prodNameRow}>
                      <Text style={S.prodName} numberOfLines={1}>{p.name}</Text>
                      {epuise && <View style={S.epuisePill}><Text style={S.epuisePillText}>{t('ce.w2_epuise_pill')}</Text></View>}
                    </View>
                    <Text style={S.prodSub}>
                      {epuise ? t('ce.w2_epuise_sous') : tf('ce.w2_stock', { n: String(p.stock) })}
                      {' '}
                      <Text style={S.prodSubStrong}>{fmt(p.netNormal)}</Text>
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {d.step === 2 && (
          <View>
            <Text style={[S.capsSection, S.mt16]}>{t('ce.w3_caps_avantage')}</Text>
            <Stepper value={`${fmt(d.K)}`} onMinus={() => ctl.patchDraft(stepK(d, -1))} onPlus={() => ctl.patchDraft(stepK(d, 1))} />
            <Text style={S.stepNote}>
              {d.K === 0 ? t('ce.w3_note_zero') : tf('ce.w3_note_k', { part: fmt(Math.max(0, 1_000 - d.K)) })}
            </Text>
            <Text style={[S.capsSection, S.mt16]}>{t('ce.w3_caps_max')}</Text>
            <Stepper value={String(d.maxOrders)} onMinus={() => ctl.patchDraft(stepMax(d, -1))} onPlus={() => ctl.patchDraft(stepMax(d, 1))} />
            {d.recipe === 'Quartier' && (
              <View>
                <Text style={[S.capsSection, S.mt16]}>{t('ce.w3_caps_zone')}</Text>
                <View style={S.zoneChips}>
                  {ZONES.map((z) => {
                    const on = d.zone === z;
                    return (
                      <Pressable key={z} style={({ pressed }) => [S.zoneChip, on && S.zoneChipOn, pressed && { transform: [{ scale: 0.95 }] }]} onPress={() => ctl.patchDraft(setZone(d, z))} accessibilityRole="button" accessibilityState={{ selected: on }}>
                        <Text style={[S.zoneChipText, on && S.zoneChipTextOn]}>{z}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        {d.step === 3 && (
          <View>
            {/* C-CE14 eco card — every figure from the model */}
            <View style={S.ecoCard}>
              <View style={S.moneyRow}>
                <Text style={S.moneyLabel}>{t('ce.w4_gain_normal')}</Text>
                <Text style={S.moneyVal}>{fmt(eco.dNet)}</Text>
              </View>
              <View style={S.moneyRow}>
                <Text style={S.moneyLabelSub}>{t('ce.w4_contribution')}</Text>
                <Text style={S.moneyVal}>{`−${fmt(eco.K)}`}</Text>
              </View>
              <View style={S.ecoDashed}>
                <Text style={S.ecoDashedLabel}>{t('ce.w4_restera')}</Text>
                <Text style={S.ecoDashedVal}>{tf('ce.w4_par_vente', { amount: fmt(eco.reste) })}</Text>
              </View>
              <View style={S.ecoHairline} />
              <View style={S.moneyRow4}>
                <Text style={S.moneyLabel}>{t('ce.w4_invest_max')}</Text>
                <Text style={S.moneyVal}>{fmt(eco.investMax)}</Text>
              </View>
              <View style={S.moneyRow4}>
                <Text style={S.moneyLabel}>{t('ce.w4_ventes_max')}</Text>
                <Text style={S.moneyVal}>{String(eco.maxOrders)}</Text>
              </View>
              {eco.part !== null && (
                <View style={S.moneyRow4}>
                  <Text style={S.moneyLabel}>{t('ce.w4_cliente_paie')}</Text>
                  <Text style={S.moneyVal}>{eco.part === 0 ? t('ce.w4_offerte') : fmt(eco.part)}</Text>
                </View>
              )}
            </View>

            {/* §3.3 guards, in order G1|G2 → G3 → G4 → G5 */}
            {g.g1 && (
              <View style={S.guardDanger}><Text style={S.guardDangerText}>{tf('ce.g1', { k: fmt(d.K), net: fmt(g.dNet) })}</Text></View>
            )}
            {g.g2 && (
              <View style={S.guardDanger}><Text style={S.guardDangerText}>{t('ce.g2')}</Text></View>
            )}
            {g.g3 && (
              <View style={S.guardWarn}><Text style={S.guardWarnText}>{t('ce.g3')}</Text></View>
            )}
            {g.g4 && (
              <View style={S.guardRose}><Text style={S.guardRoseText}>{t('ce.g4')}</Text></View>
            )}
            {g.g5 && (
              <Pressable style={({ pressed }) => [S.consent, d.ok && S.consentOn, pressed && S.pressed]} onPress={() => ctl.patchDraft(toggleConsent(d))} accessibilityRole="checkbox" accessibilityState={{ checked: d.ok }}>
                <View style={[S.consentBox, d.ok && S.consentBoxOn]}>
                  {d.ok && <IconCheckCe size={14} color="#FFFFFF" />}
                </View>
                <Text style={S.consentLabel}>
                  {t('ce.g5_avant')} <Text style={S.consentStrong}>{fmt(eco.investMax)}</Text> {t('ce.g5_apres')}
                </Text>
              </Pressable>
            )}
            <Text style={[S.budgetFootNote, S.mt12, { fontSize: 12, lineHeight: 18.6 }]}>{t('ce.w4_note_remplace')}</Text>
          </View>
        )}
      </ScrollView>

      {/* C-CE17 sticky CTA */}
      <View style={S.ctaBar}>
        <Pressable
          style={[S.cta, !ctaActive && S.ctaDisabled]}
          disabled={!ctaActive}
          onPress={() => {
            if (d.step < 3) next();
            else {
              ctl.launch();
              onLaunched();
            }
          }}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ctaActive }}
        >
          <Text style={[S.ctaText, !ctaActive && S.ctaTextDisabled]}>{ctaLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const recipeKey = (r: RecipeId): string =>
  r === 'Nouveauté' ? 'nouveaute' : r === 'Quartier' ? 'quartier' : 'dernieres';

function Stepper({ value, onMinus, onPlus }: { value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={S.stepperRow}>
      <Pressable style={({ pressed }) => [S.stepBtn, pressed && { transform: [{ scale: 0.9 }] }]} onPress={onMinus} accessibilityRole="button" accessibilityLabel={t('ce.stepper_moins')}>
        <Text style={S.stepBtnGlyph}>{'−'}</Text>
      </Pressable>
      <Text style={S.stepValue}>{value}</Text>
      <Pressable style={({ pressed }) => [S.stepBtn, pressed && { transform: [{ scale: 0.9 }] }]} onPress={onPlus} accessibilityRole="button" accessibilityLabel={t('ce.stepper_plus')}>
        <Text style={S.stepBtnGlyph}>+</Text>
      </Pressable>
    </View>
  );
}

/* --------------------------------------------------- A1 · CAMPAGNE ACTIVE -- */

export function CampaignActive({ ctl, onBack, onPack }: { ctl: CercleController; onBack: () => void; onPack: () => void }) {
  const c = ctl.camp;
  if (c === null) return null;
  const p = produit(c.pid);
  const pill = tilePill(c);
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollStacked} showsVerticalScrollIndicator={false}>
      <View style={S.stackedHead}>
        <Pressable style={({ pressed }) => [S.backBtn, pressed && { transform: [{ scale: 0.92 }] }]} onPress={onBack} accessibilityRole="button" accessibilityLabel={t('ce.retour')}>
          <IconBackCe size={17} />
        </Pressable>
        <Text style={S.screenTitle19} numberOfLines={1}>{`${c.recipe} — ${c.zone}`}</Text>
        {pill === 'active' && <Pill kind="ok" label={t('ce.pilule_active')} />}
        {pill === 'pause' && <Pill kind="neutre" label={t('ce.pilule_pause')} />}
        {pill === 'epuise' && <Pill kind="warn" label={t('ce.pilule_epuise')} />}
      </View>

      {/* ② product card */}
      <View style={S.aProdCard}>
        <ArtTile name={p.name} size={50} radius={13} />
        <View style={S.rowBody}>
          <Text style={S.campTileTitle} numberOfLines={1}>{p.name}</Text>
          <Text style={S.aProdMeta}>
            {c.K === 1_000
              ? tf('ce.a1_meta_prepay', { fenetre: FENETRE, k: fmt(c.K) })
              : tf('ce.a1_meta', { fenetre: FENETRE, k: fmt(c.K), part: fmt(1_000 - c.K) })}
          </Text>
        </View>
      </View>

      {/* ③ progrès */}
      <View style={[S.resultCard, S.mt12]}>
        <Text style={S.statCaps}>{t('ce.a1_progres_caps')}</Text>
        <Gauge pct={gaugePct(c)} />
        <Text style={[S.campTileFootText, { marginTop: 8, fontSize: 12.5 }]}>
          {tf('ce.a1_progres_ligne', { o: String(c.orders), max: String(c.maxOrders), fenetre: FENETRE, places: String(places(c)) })}
        </Text>
      </View>

      {/* ④ budget — [MOCK-PARTENAIRE] figures (render-only) */}
      <View style={[S.budgetCard, S.mt12]}>
        <Text style={S.statCaps}>{t('ce.a1_budget_caps')}</Text>
        <View style={S.moneyRow}>
          <Text style={S.moneyLabel}>{t('ce.f_alloue')}</Text>
          <Text style={S.moneyVal}>{fmt(c.budget)}</Text>
        </View>
        <View style={S.moneyRow}>
          <Text style={S.moneyLabelSub}>{t('ce.f_reserve')}</Text>
          <Text style={S.moneyVal}>{fmt(c.reserved)}</Text>
        </View>
        <View style={S.moneyRow}>
          <Text style={S.moneyLabelSub}>{t('ce.a1_depense')}</Text>
          <Text style={S.moneyVal}>{fmt(c.spent)}</Text>
        </View>
        <View style={S.budgetDashed}>
          <Text style={S.budgetDashedLabel}>{t('ce.f_restant')}</Text>
          <Text style={S.budgetDashedVal}>{fmt(restant(c))}</Text>
        </View>
        <Text style={S.budgetFootNote}>{t('ce.a1_note_faute')}</Text>
      </View>

      {/* ⑤ [DEMO] line (§0.2.d exact) */}
      <Text style={S.demoLine}>{t('ce.a1_demo_ligne')}</Text>

      {/* ⑥ duo */}
      <View style={[S.duo, S.mt12]}>
        <Pressable style={({ pressed }) => [S.duoSoft, pressed && { transform: [{ scale: 0.97 }] }]} onPress={ctl.pauseToggle} accessibilityRole="button">
          <Text style={S.duoSoftText}>{t(c.state === 'ACTIVE' ? 'ce.a1_pause' : 'ce.a1_reactiver')}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [S.duoGhost, pressed && { transform: [{ scale: 0.97 }] }]} onPress={onPack} accessibilityRole="button">
          <Text style={S.duoGhostText}>{t('ce.btn_pack')}</Text>
        </Pressable>
      </View>

      {/* ⑦ note-loi */}
      <View style={S.lawNote}><Text style={S.lawNoteText}>{t('ce.a1_note_loi')}</Text></View>
    </ScrollView>
  );
}

/* -------------------------------------------------------- F1 · FINANCEMENT -- */

export function CampaignFunding({ ctl, onBack, onToast }: { ctl: CercleController; onBack: () => void; onToast: (m: string) => void }) {
  const f = fundingModel(ctl.port, ctl.camp !== null);
  const zeros = !f.hasCampaign;
  const alloue = zeros ? 0 : f.alloue;
  const reserve = zeros ? 0 : f.reserve;
  const depense = zeros ? 0 : f.depense;
  const restantF = zeros ? 0 : f.restant;
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollStacked} showsVerticalScrollIndicator={false}>
      <View style={S.stackedHead}>
        <Pressable style={({ pressed }) => [S.backBtn, pressed && { transform: [{ scale: 0.92 }] }]} onPress={onBack} accessibilityRole="button" accessibilityLabel={t('ce.retour')}>
          <IconBackCe size={17} />
        </Pressable>
        <View style={S.stackedHeadCol}>
          <Text style={S.screenTitle19}>{t('ce.f_titre')}</Text>
          <Text style={S.stackedSub}>{t('ce.f_sous_titre')}</Text>
        </View>
      </View>

      <View style={[S.budgetCard, S.mt14, { padding: 17 }]}>
        <View style={[S.moneyRow, { paddingVertical: 6 }]}>
          <Text style={S.moneyLabel}>{t('ce.f_dispo')}</Text>
          <Text style={S.moneyVal}>{fmt(f.dispo)}</Text>
        </View>
        <View style={[S.moneyRow, { paddingVertical: 6 }]}>
          <Text style={S.moneyLabelSub}>{t('ce.f_alloue_active')}</Text>
          <Text style={S.moneyVal}>{fmt(alloue)}</Text>
        </View>
        <View style={[S.moneyRow, { paddingVertical: 6 }]}>
          <Text style={S.moneyLabelSub}>{t('ce.f_reserve')}</Text>
          <Text style={S.moneyVal}>{fmt(reserve)}</Text>
        </View>
        <View style={[S.moneyRow, { paddingVertical: 6 }]}>
          <Text style={S.moneyLabelSub}>{t('ce.f_depense_mois')}</Text>
          <Text style={S.moneyVal}>{fmt(depense)}</Text>
        </View>
        <View style={S.budgetDashed}>
          <Text style={S.budgetDashedLabel}>{t('ce.f_restant')}</Text>
          <Text style={S.budgetDashedVal19}>{fmt(restantF)}</Text>
        </View>
      </View>
      {/* C-CE19 — the ONE lawful suffix-free equation (§1.3 exception), server-provided */}
      <Text style={S.reconcile}>
        {tf('ce.f_reconciliation', {
          total: String(alloue).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'),
          depense: String(depense).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'),
          reserve: String(reserve).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'),
          restant: String(restantF).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'),
        })}
      </Text>

      <View style={S.noteOk}><Text style={S.noteOkText}>{t('ce.f_note_regles')}</Text></View>
      <View style={S.noteWarn}><Text style={S.noteWarnText}>{t('ce.f_note_recharge')}</Text></View>

      <Pressable
        style={({ pressed }) => [S.ghostWide, zeros && S.ghostWideDisabled, pressed && !zeros && S.pressed]}
        disabled={zeros}
        onPress={() => onToast(t('ce.toast_retrait'))}
        accessibilityRole="button"
        accessibilityState={{ disabled: zeros }}
      >
        <Text style={S.ghostWideText}>{t('ce.f_retirer')}</Text>
      </Pressable>
    </ScrollView>
  );
}

/* --------------------------------------------------------- R1 · RÉPUTATION -- */

export function CercleReputation({ onBack }: { onBack: () => void }) {
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollStacked} showsVerticalScrollIndicator={false}>
      <View style={S.stackedHead}>
        <Pressable style={({ pressed }) => [S.backBtn, pressed && { transform: [{ scale: 0.92 }] }]} onPress={onBack} accessibilityRole="button" accessibilityLabel={t('ce.retour')}>
          <IconBackCe size={17} />
        </Pressable>
        <Text style={S.screenTitle19}>{t('ce.r_titre')}</Text>
        <Pill kind="ok" label={t('ce.r_pill_fiable')} />
      </View>

      <View style={S.reputHero}>
        <Text style={S.reputCaps}>{t('ce.r_caps')}</Text>
        <View style={S.reputRow}>
          <Text style={S.reputNote}>{CERCLE_DIVERS.note}</Text>
          <StarRow n={5} size={16} color="#E0A11B" />
        </View>
        <Text style={S.reputSub}>{tf('ce.r_sous_ligne', { livraisons: String(CERCLE_DIVERS.livraisons), avis: String(CERCLE_DIVERS.avis), litiges: String(CERCLE_DIVERS.litiges) })}</Text>
      </View>

      <View style={S.statGrid}>
        <View style={S.rStatCard}>
          <Text style={S.statCaps}>{t('ce.r_livraisons')}</Text>
          <Text style={S.rStatValue}>{CERCLE_DIVERS.livraisons}</Text>
        </View>
        <View style={S.rStatCard}>
          <Text style={S.statCaps}>{t('ce.r_avis')}</Text>
          <Text style={S.rStatValue}>{CERCLE_DIVERS.avis}</Text>
        </View>
      </View>

      <Text style={[S.capsSection, S.mt16]}>{t('ce.r_derniers')}</Text>
      <View style={[S.gap10, S.mt10]}>
        {CERCLE_AVIS.map((a) => <AvisCard key={a.name} avis={a} pillKey="ce.avis_pill_achat" />)}
      </View>

      <View style={S.lawNote}><Text style={S.lawNoteText}>{t('ce.r_note_loi')}</Text></View>
    </ScrollView>
  );
}

/* ----------------------------------------------------------- M1 · MEMBRES -- */

export function CercleMembres({ onBack }: { onBack: () => void }) {
  const [seg, setSeg] = useState<string>('Toutes');
  const rows = filterMembres(seg);
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.scrollStacked} showsVerticalScrollIndicator={false}>
      <View style={S.stackedHead}>
        <Pressable style={({ pressed }) => [S.backBtn, pressed && { transform: [{ scale: 0.92 }] }]} onPress={onBack} accessibilityRole="button" accessibilityLabel={t('ce.retour')}>
          <IconBackCe size={17} />
        </Pressable>
        <View style={S.stackedHeadCol}>
          <Text style={S.screenTitle19}>{t('ce.m_titre')}</Text>
          <Text style={S.stackedSub}>{tf('ce.m_sous_titre', { n: String(CERCLE_DIVERS.membres) })}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.segScroll} contentContainerStyle={S.segRow}>
        {MEMBER_CHIPS.map((c) => {
          const on = seg === c;
          return (
            <Pressable key={c} style={({ pressed }) => [S.segChip, on && S.segChipOn, pressed && { transform: [{ scale: 0.95 }] }]} onPress={() => setSeg(c)} accessibilityRole="button" accessibilityState={{ selected: on }}>
              <Text style={[S.segChipText, on && S.segChipTextOn]}>{c === 'Toutes' ? t('ce.m_toutes') : c}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[S.gap9, S.mt12]}>
        {rows.map((m) => (
          <View key={m.name} style={S.memberRow}>
            <View style={S.memberAvatar}><Text style={S.memberAvatarText}>{m.name.slice(0, 1)}</Text></View>
            <View style={S.rowBody}>
              <Text style={S.memberName} numberOfLines={1}>{m.name}</Text>
              <Text style={S.memberSub} numberOfLines={1}>{tf('ce.m_sous_ligne', { zone: m.zone, interet: m.interet })}</Text>
            </View>
            <View style={[
              S.memberPill,
              m.seg === 'Fidèle' ? S.pillOk : m.seg === 'À relancer' ? S.pillWarn : S.pillRose,
            ]}>
              <Text style={[
                S.memberPillText,
                m.seg === 'Fidèle' ? S.pillOkText : m.seg === 'À relancer' ? S.pillWarnText : S.pillRoseText,
              ]}>
                {m.seg === 'Première commande' ? t('ce.m_premiere') : m.seg}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={S.lawNote}><Text style={S.lawNoteText}>{t('ce.m_note_loi')}</Text></View>
    </ScrollView>
  );
}
