/**
 * K-STYLES — the style values (PURE data, no react-native import) so the
 * property tests can pin them Node-side. Values are the Phase-0 table's bytes
 * (bp-K1…K5), read through the Faso Premium tokens that carry them since
 * PERSONNALISER-JETONS-1 (F-44); `screens.tsx` feeds this straight into
 * StyleSheet.create.
 */
import { sharedColour, shopColour, type as t2, radius } from '@platform/ui-tokens';
import { spacing, touch } from '@platform/ui-tokens/legacy';
import { DISPLAY_FAMILY, TEXT_FAMILY, TEXT_FAMILY_SEMIBOLD, TEXT_FAMILY_BOLD } from '../../ui/faso-fonts';

/**
 * ═══ PERSONNALISER-JETONS-1 (AUDIT-SHOP-2 F-44) — THE BYTES NO TOKEN CARRIES ═══
 *
 * Every other colour in this table is the Faso Premium token that carries its
 * byte (`sharedColour` / `shopColour`), so a token change reaches this screen
 * and the family DNA is enforced by construction. These are the Phase-0
 * table's bytes that NO token carries — a sand family and three soft borders
 * — and they are kept HERE, named, once, rather than scattered as literals or
 * quietly normalised to a neighbouring token (a design change nobody asked
 * for). A test pins this list: nothing may join it unnoticed. Turning any of
 * them into a canon token is a platform-contracts change — the founder's.
 */
export const K_SANS_JETON = {
  /** the sand tint: the sable note, the order-row art, the preview stage */
  sable: '#F1E7D3',
  /** the dashed empty slots' ground */
  creme: '#FCF9F2',
  /** the dashed borders and the sheet handle */
  lisereSable: '#DDD2BC',
  /** the segment track and the progress track */
  piste: '#ECE3D1',
  /** the record sheet's ground */
  feuille: '#FBF7EF',
  /** the listen block's ground */
  ecoute: '#F4EDDF',
  /** the voice card's art placeholder */
  artVoix: '#EFE6D6',
  /** the mic-denied banner's border */
  lisereRefus: '#E7B8B0',
  /** the danger ghost button's border */
  lisereDanger: '#D9A49C',
  /** the demo dashed button's border */
  lisereDemo: '#C9BDA3',
  /** the cover photo slot's ground */
  terre: '#8A5A3A',
  /** the swatch hairline (ink at 8 %) */
  voile: 'rgba(28,23,16,0.08)',
  /** the sheet backdrop (ink at 42 %) */
  scrim: 'rgba(28,22,15,0.42)',
} as const;

export const K_RAW_STYLES = {
  root: { flex: 1, backgroundColor: sharedColour.paper },
  screen: { flex: 1 },
  scrollPad: { padding: spacing.lg, paddingBottom: 46 },
  pressed: { opacity: 0.85 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  // CIBLES-TACTILES-1 (F-45) — the touch token on every control here; the
  // table's 40 / 38 were under it.
  backBtn: {
    width: touch.minTargetPx, height: touch.minTargetPx, borderRadius: radius.pill, backgroundColor: sharedColour.card,
    borderWidth: 1, borderColor: sharedColour.hairlineStrong, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.view.size.min, fontWeight: '800', color: sharedColour.ink, letterSpacing: -0.19 },
  etatPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingVertical: spacing.xs, paddingHorizontal: 9 },
  etatPillOk: { backgroundColor: sharedColour.okBg },
  etatPillNeutre: { backgroundColor: sharedColour.mutedBg },
  etatPillText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.caps.size.min, fontWeight: '700', color: sharedColour.sub },
  etatDot: { width: 6, height: 6, borderRadius: radius.pill },
  caps: { fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.caps.size.max, fontWeight: '700', letterSpacing: 1.1, color: sharedColour.sub, marginTop: spacing.lg, marginBottom: 10 },
  capsGap: { marginTop: 22 },
  subTitle: { fontFamily: TEXT_FAMILY, fontSize: 12.5, color: sharedColour.sub, marginBottom: 10 },

  /* C-K1 aperçu card */
  previewCard: {
    borderRadius: radius.card, backgroundColor: sharedColour.card, borderWidth: 1, borderColor: sharedColour.hairline,
    shadowColor: sharedColour.ink, shadowOpacity: 0.14, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 4,
    overflow: 'hidden',
  },
  previewCover: { height: 84, alignItems: 'flex-end', justifyContent: 'flex-end' },
  previewFiligrane: { fontFamily: DISPLAY_FAMILY, fontSize: 76, fontWeight: '800', lineHeight: 76, opacity: 0.16, marginRight: 2, marginBottom: -22 },
  previewBody: { paddingHorizontal: spacing.lg, paddingBottom: 14 },
  previewAvatar: {
    width: 40, height: 40, borderRadius: radius.pill, marginTop: -20,
    borderWidth: 2.5, borderColor: sharedColour.card, alignItems: 'center', justifyContent: 'center',
  },
  previewAvatarText: { fontFamily: DISPLAY_FAMILY, fontSize: 16, fontWeight: '800' },
  previewNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.xs },
  previewName: { fontFamily: DISPLAY_FAMILY, fontSize: 15, fontWeight: '800', color: sharedColour.ink },
  previewTagline: { fontFamily: TEXT_FAMILY_SEMIBOLD, fontSize: t2.scale.pill.size, fontWeight: '600', color: sharedColour.body, marginTop: 3 },
  previewChip: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 9, marginTop: 5 },
  previewChipText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 9.5, fontWeight: '700' },
  previewLegend: { fontFamily: TEXT_FAMILY, fontSize: 11.5, color: sharedColour.sub, textAlign: 'center', marginTop: 7 },

  /* C-K2 rows */
  rowsCard: {
    borderRadius: radius.card, backgroundColor: sharedColour.card, borderWidth: 1, borderColor: sharedColour.hairline,
    marginTop: spacing.lg, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 64, paddingVertical: 10, paddingHorizontal: spacing.lg },
  rowDivider: { borderTopWidth: 1, borderTopColor: sharedColour.hairline },
  rowGlyph: { width: 38, height: 38, borderRadius: 12, backgroundColor: shopColour.soft, alignItems: 'center', justifyContent: 'center' },
  rowGlyphText: { fontFamily: DISPLAY_FAMILY, fontSize: 15, fontWeight: '800', color: shopColour.deep },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.row.size, fontWeight: '700', color: sharedColour.ink },
  rowSub: { fontFamily: TEXT_FAMILY, fontSize: 12, color: sharedColour.sub, marginTop: 2 },
  rowChevron: { fontFamily: TEXT_FAMILY, fontSize: 15, color: sharedColour.disabledCtaFg },

  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    height: 50, borderRadius: radius.button, backgroundColor: sharedColour.card, borderWidth: 1.5, borderColor: sharedColour.hairlineStrong, marginTop: spacing.lg,
  },
  ghostBtnText: { fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.row.size, fontWeight: '700', color: sharedColour.ink },
  inkBand: { borderRadius: radius.tile, backgroundColor: sharedColour.ink, padding: 14, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  inkBandText: { fontFamily: TEXT_FAMILY, fontSize: 12.5, lineHeight: 19, color: sharedColour.paper },
  inkBandBold: { fontFamily: TEXT_FAMILY_BOLD, fontWeight: '700' },

  /* C-K3 counted fields */
  field: { marginTop: 14 },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  fieldLabel: { fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.caps.size.max, fontWeight: '700', letterSpacing: 1.1, color: sharedColour.sub },
  fieldCount: { fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.pill.size, fontWeight: '700', color: sharedColour.disabledCtaFg },
  fieldCountLimit: { color: sharedColour.warnFgAlt },
  fieldInput: {
    fontFamily: TEXT_FAMILY, fontSize: 16, color: sharedColour.ink,
    paddingVertical: 14, paddingHorizontal: 15, borderRadius: radius.art.max,
    borderWidth: 1.5, borderColor: sharedColour.hairlineStrong, backgroundColor: sharedColour.card,
  },
  fieldInputMulti: { minHeight: 88, textAlignVertical: 'top' },
  fieldInputFocus: { borderColor: shopColour.primary },
  fieldInputError: { borderColor: sharedColour.dangerBorder },
  fieldError: { fontFamily: TEXT_FAMILY_SEMIBOLD, fontSize: 12, fontWeight: '600', color: sharedColour.dangerFg, marginTop: 6 },
  noteRose: { borderRadius: radius.art.max, backgroundColor: shopColour.soft, padding: spacing.md, marginTop: spacing.lg },
  // RECOMMENCER — the confirm card's title and the spacing its two buttons share.
  recommencerTitre: { fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.row.size, fontWeight: '700', color: shopColour.deep, marginBottom: spacing.xs },
  mt8: { marginTop: spacing.sm },
  noteRoseText: { fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: shopColour.deep },
  cta: {
    height: 54, borderRadius: radius.button, backgroundColor: shopColour.primary, alignItems: 'center', justifyContent: 'center', marginTop: 18,
    shadowColor: shopColour.primary, shadowOpacity: 0.5, shadowRadius: 13, shadowOffset: { width: 0, height: 12 }, elevation: 5,
  },
  ctaDisabled: { backgroundColor: sharedColour.disabledCta, shadowOpacity: 0, elevation: 0 },
  ctaText: { fontFamily: DISPLAY_FAMILY, fontSize: 16.5, fontWeight: '700', color: shopColour.onPrimary },
  ctaTextDisabled: { color: sharedColour.disabledCtaFg },
  /* RESELLER-SEAM-HONESTY-1 — the unconfigured note under the CTA. Deliberately the
     SAME quiet warm-neutral treatment as `previewLegend`, NOT an error style: no red,
     no alarm surface. Nothing is broken; this build has simply not been told where to
     write, and copy that reads like a failure sends her hunting a bug that does not
     exist. Secondary actions whisper — so does this. */
  unconfiguredNote: { fontFamily: TEXT_FAMILY, fontSize: 11.5, color: sharedColour.sub, textAlign: 'center', marginTop: spacing.sm },

  /* C-K4 cover slot */
  coverSlot: { height: 120, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', gap: 6 },
  coverSlotDashed: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: K_SANS_JETON.lisereSable, backgroundColor: K_SANS_JETON.creme },
  coverSlotFilled: { backgroundColor: K_SANS_JETON.creme, borderWidth: 1.5, borderColor: sharedColour.hairlineStrong },
  coverSlotPhoto: { backgroundColor: K_SANS_JETON.terre, alignItems: 'flex-start', justifyContent: 'flex-start', padding: 10, overflow: 'hidden' },
  coverSlotError: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: sharedColour.dangerBorder, backgroundColor: sharedColour.dangerBg, padding: 14 },
  coverAddText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 13.5, fontWeight: '700', color: shopColour.primary },
  coverSpecs: { fontFamily: TEXT_FAMILY, fontSize: t2.scale.pill.size, color: sharedColour.disabledCtaFg },
  coverCapsState: { fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.caps.size.max, fontWeight: '700', letterSpacing: 1.1, color: sharedColour.sub },
  coverTrack: { width: 190, height: 4, borderRadius: radius.pill, backgroundColor: K_SANS_JETON.piste, overflow: 'hidden' },
  coverBar: { width: '34%', height: 4, borderRadius: radius.pill, backgroundColor: shopColour.primary },
  pill: { borderRadius: radius.pill, paddingVertical: spacing.xs, paddingHorizontal: 9 },
  // The badge BELOW the photograph (founder, 2026-08-18) — it hugs its text
  // instead of stretching, and keeps its distance from the frame above.
  pillSous: { alignSelf: 'flex-start', marginTop: spacing.sm },
  pillWarn: { backgroundColor: sharedColour.warnBg },
  pillOk: { backgroundColor: sharedColour.okBg },
  pillText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  coverErrTitle: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 13.5, fontWeight: '700', color: sharedColour.dangerFg },
  coverErrBody: { fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: sharedColour.dangerFg, textAlign: 'center' },
  noteSable: { borderRadius: radius.art.max, backgroundColor: K_SANS_JETON.sable, padding: spacing.md, marginTop: spacing.md },
  noteSableText: { fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: sharedColour.body },
  noteWarn: { borderRadius: radius.art.max, backgroundColor: sharedColour.warnBg, padding: spacing.md, marginTop: spacing.md },
  noteWarnText: { fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: sharedColour.warnFgAlt },
  ghostSmall: {
    height: touch.minTargetPx, borderRadius: radius.art.max, backgroundColor: sharedColour.card, borderWidth: 1.5, borderColor: sharedColour.hairlineStrong,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, paddingHorizontal: 18, alignSelf: 'flex-start',
  },
  ghostSmallText: { fontFamily: DISPLAY_FAMILY, fontSize: 13.5, fontWeight: '700', color: sharedColour.ink },
  demoRow: { flexDirection: 'row', gap: 10, marginTop: spacing.md },
  demoBtn: { borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: K_SANS_JETON.lisereDemo, paddingVertical: 9, paddingHorizontal: spacing.md },
  demoBtnText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 11.5, fontWeight: '700', color: sharedColour.sub },

  /* C-K5 segments portrait */
  segTrack: { flexDirection: 'row', backgroundColor: K_SANS_JETON.piste, borderRadius: radius.art.max, padding: spacing.xs, gap: spacing.xs },
  segBtn: { flex: 1, height: touch.minTargetPx, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segBtnActive: {
    backgroundColor: sharedColour.card,
    shadowColor: sharedColour.ink, shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  segText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.body.size.min, fontWeight: '700', color: sharedColour.sub },
  segTextActive: { color: sharedColour.ink },
  portraitRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  portraitDisc: { width: 64, height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  portraitDiscText: { fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.cardMoney.size, fontWeight: '800' },
  portraitSlotDashed: {
    width: 64, height: 64, borderRadius: radius.pill, borderWidth: 1.5, borderStyle: 'dashed', borderColor: K_SANS_JETON.lisereSable,
    backgroundColor: K_SANS_JETON.creme, alignItems: 'center', justifyContent: 'center',
  },
  portraitNote: { flex: 1, fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: sharedColour.sub },

  /* C-K6 theme cards */
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  themeCard: { width: '47%', borderRadius: radius.tile, backgroundColor: sharedColour.card, paddingBottom: 14, overflow: 'hidden' },
  themeCardRest: { borderWidth: 1.5, borderColor: sharedColour.hairlineInput },
  themeCardSelected: {
    borderWidth: 2, borderColor: shopColour.primary,
    shadowColor: shopColour.primary, shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 12 }, elevation: 5,
  },
  // ENTETES-APERÇU — the silhouette band, sized like the habillage card's
  // colour row so the two grids sit at the same rhythm.
  enteteApercu: { height: 62, marginTop: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  enteteApercuLigne: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  themeSwatches: { flexDirection: 'row', gap: 6, paddingTop: 13, paddingHorizontal: 14 },
  swatch: { width: 20, height: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: K_SANS_JETON.voile },
  themeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 9, paddingHorizontal: 14 },
  themeName: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 14, fontWeight: '700', color: sharedColour.ink },
  defautPill: { borderRadius: radius.pill, backgroundColor: sharedColour.mutedBg, paddingVertical: 3, paddingHorizontal: spacing.sm },
  defautPillText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 9.5, fontWeight: '700', color: sharedColour.sub },
  themeCheck: {
    position: 'absolute', top: 16, right: 10, width: 26, height: 26, borderRadius: radius.pill,
    backgroundColor: shopColour.primary, alignItems: 'center', justifyContent: 'center',
  },
  /* ENTETES-B — the header cards reuse themeCard/themeCardSelected/themeCheck
     wholesale; this is the one net-new entry (the one-line whisper under the
     name), on EXISTING palette bytes only (#6F6355 = rowSub/caps). */
  enteteSub: { fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: sharedColour.sub, paddingTop: 6, paddingHorizontal: 14 },
  // PERSONNALISER-HONESTY-1 — « Enregistrement… » sits where the check mark
  // would be, so the card says PENDING rather than drawing a stored state it
  // has not earned. Deliberately quiet: it is a status, not an action.
  enteteEnCours: { position: 'absolute', top: 12, right: 12, fontFamily: TEXT_FAMILY, fontSize: t2.scale.pill.size, lineHeight: 14, color: sharedColour.sub },
  noteCard: { borderRadius: radius.tile, backgroundColor: sharedColour.card, borderWidth: 1, borderColor: sharedColour.hairline, padding: 14, marginTop: spacing.lg },
  noteCardText: { fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: sharedColour.body },

  /* C-K7 order rows */
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 62, paddingVertical: 9, paddingHorizontal: spacing.md },
  orderRowEpuise: { opacity: 0.62 },
  grip: { fontFamily: TEXT_FAMILY, fontSize: 15, color: sharedColour.disabledCtaFg },
  orderArt: { width: 44, height: 44, borderRadius: 12, backgroundColor: K_SANS_JETON.sable },
  orderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderName: { flexShrink: 1, fontFamily: TEXT_FAMILY_BOLD, fontSize: 13.5, fontWeight: '700', color: sharedColour.ink },
  orderPrice: { fontFamily: TEXT_FAMILY, fontSize: 11.5, color: sharedColour.sub, marginTop: 2 },
  unePill: { borderRadius: radius.pill, backgroundColor: shopColour.soft, paddingVertical: 2, paddingHorizontal: 7 },
  unePillText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 9, fontWeight: '700', color: shopColour.deep },
  epuisePill: { borderRadius: radius.pill, backgroundColor: sharedColour.mutedBg, paddingVertical: 2, paddingHorizontal: 7 },
  epuisePillText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 9, fontWeight: '700', color: sharedColour.sub },
  arrowBtn: {
    width: touch.minTargetPx, height: touch.minTargetPx, borderRadius: 9, borderWidth: 1, borderColor: sharedColour.hairlineStrong, backgroundColor: sharedColour.card,
    alignItems: 'center', justifyContent: 'center',
  },
  arrowText: { fontSize: t2.scale.pill.size, color: sharedColour.ink },
  starBtn: {
    width: touch.minTargetPx, height: touch.minTargetPx, borderRadius: 12, backgroundColor: sharedColour.card, borderWidth: 1, borderColor: sharedColour.hairlineStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  starBtnPinned: { backgroundColor: shopColour.soft, borderColor: shopColour.soft },

  /* K5 dashed empty/charge card (createBtn/checkbox/dangerGhost left with the
     K6 sections editor — founder order 2026-08-13) */
  dashedCard: {
    borderRadius: radius.card, borderWidth: 1.5, borderStyle: 'dashed', borderColor: K_SANS_JETON.lisereSable, backgroundColor: K_SANS_JETON.creme,
    padding: 22, alignItems: 'center', marginTop: spacing.xs,
  },
  dashedTitle: { fontFamily: DISPLAY_FAMILY, fontSize: 15, fontWeight: '800', color: sharedColour.ink },
  dashedBody: { fontFamily: TEXT_FAMILY, fontSize: 12.5, lineHeight: 19, color: sharedColour.sub, textAlign: 'center', marginTop: 6 },

  /* Notes vocales (per-product) — a card per article, controls by state.
     (Cards after the first get S.rowDivider; the card itself carries no border.) */
  vCard: { paddingVertical: 14, paddingHorizontal: spacing.xs, gap: spacing.md },
  vHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  vArt: { width: 44, height: 44, borderRadius: 12, backgroundColor: K_SANS_JETON.artVoix },
  vName: { fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.row.size, fontWeight: '700', color: sharedColour.ink },
  vPrice: { fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.body.size.min, fontWeight: '800', color: shopColour.deep, marginTop: 2 },
  vRecBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    height: touch.minTargetPx, borderRadius: radius.art.max, borderWidth: 1.5, borderColor: sharedColour.hairlineStrong, backgroundColor: sharedColour.card,
  },
  vRecBtnText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 13.5, fontWeight: '700', color: shopColour.primary },
  vRecording: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vRecDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: sharedColour.dangerBorder },
  vRecLabel: { flex: 1, fontFamily: TEXT_FAMILY, fontSize: t2.scale.body.size.min, color: sharedColour.sub },
  vStopBtn: { height: touch.minTargetPx, borderRadius: 12, paddingHorizontal: spacing.lg, backgroundColor: shopColour.primary, alignItems: 'center', justifyContent: 'center' },
  vStopText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.body.size.min, fontWeight: '700', color: shopColour.onPrimary },
  vActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  vPublishBtn: { height: touch.minTargetPx, borderRadius: radius.art.max, paddingHorizontal: 18, backgroundColor: shopColour.primary, alignItems: 'center', justifyContent: 'center' },
  vPublishText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 13.5, fontWeight: '700', color: shopColour.onPrimary },
  vGhost: { height: touch.minTargetPx, borderRadius: radius.art.max, paddingHorizontal: 14, borderWidth: 1.5, borderColor: sharedColour.hairlineStrong, backgroundColor: sharedColour.card, alignItems: 'center', justifyContent: 'center' },
  vGhostText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.body.size.min, fontWeight: '700', color: sharedColour.ink },
  vDanger: { borderColor: K_SANS_JETON.lisereDanger },
  vDangerText: { color: sharedColour.dangerFg },
  vDur: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 12.5, fontWeight: '700', color: sharedColour.sub },
  vPendingPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 11, backgroundColor: sharedColour.warnBg },
  vPendingText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 11.5, fontWeight: '700', color: sharedColour.warnFgAlt },
  // ── A LIVE note is not a waiting one, and it must not look like one ──────
  // Same geometry as the pending pill, on the app's existing « ok » ground
  // (`etatPillOk`, #DFEEE3). The ink is deeper than that pill's warm grey
  // because this one carries a fact she is checking rather than a passive
  // status: 6.98:1 on its ground, against the shipped pending pair's 5.79:1.
  vLivePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 11, backgroundColor: sharedColour.okBg },
  vLiveText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 11.5, fontWeight: '700', color: sharedColour.okFg },
  vPlayBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: touch.minTargetPx, borderRadius: radius.art.max, paddingHorizontal: 14, borderWidth: 1.5, borderColor: sharedColour.hairlineStrong, backgroundColor: sharedColour.card },
  /* ÉCOUTE — the take she just made, given its own block (founder 2026-08-04:
     « make its area more visible, nice and professional … I am able to replay
     it, listen before adding it to the product »).

     WHY A BLOCK AND NOT ANOTHER BUTTON IN THE ROW: « Écouter » already existed,
     but it sat as one of five equal chips (écouter · durée · publier · refaire ·
     supprimer) wrapping on a narrow phone — so the one act she wants FIRST,
     hearing herself before committing, looked exactly as important as
     « Supprimer ». Hierarchy is ruthless (§5): listening gets the surface,
     publishing gets the primary button under it, and the two destructive
     verbs whisper. */
  vEcouteBloc: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radius.button, paddingVertical: spacing.md, paddingHorizontal: 14,
    backgroundColor: K_SANS_JETON.ecoute, borderWidth: 1, borderColor: sharedColour.hairlineStrong,
  },
  vEcouteDisque: {
    width: touch.minTargetPx, height: touch.minTargetPx, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: shopColour.primary,
  },
  vEcouteTexte: { flex: 1, gap: 2 },
  vEcouteTitre: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 14, fontWeight: '700', color: sharedColour.ink },
  vEcouteSous: { fontFamily: TEXT_FAMILY, fontSize: 12, color: sharedColour.sub },
  vEcouteDur: { fontFamily: DISPLAY_FAMILY, fontSize: 16, fontWeight: '800', color: shopColour.deep },
  /* The two verbs that undo — deliberately quiet, and on their own row so
     neither sits beside the primary action. */
  vSecondaires: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  /* VOIX-CARTE — pushes « Refaire » to the card row's right edge (the founder's
     « button at the end right »); the flex spacer, as a margin. */
  vCarteRefaire: { marginLeft: 'auto' },

  vDeniedBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderRadius: radius.art.max, backgroundColor: sharedColour.dangerBg, borderWidth: 1, borderColor: K_SANS_JETON.lisereRefus, paddingVertical: spacing.md, paddingHorizontal: 14, marginBottom: spacing.md },
  vDeniedText: { flex: 1, fontFamily: TEXT_FAMILY, fontSize: 12.5, color: sharedColour.dangerFg, minWidth: 170 },
  /* The record SHEET (per-product, opened from the Ma Vitrine card mic). */
  vSheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: K_SANS_JETON.scrim },
  vSheetCard: { backgroundColor: K_SANS_JETON.feuille, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: 18, paddingBottom: 30, maxHeight: '86%' },
  vSheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: radius.pill, backgroundColor: K_SANS_JETON.lisereSable, marginBottom: 14 },
  vSheetKicker: { fontFamily: TEXT_FAMILY_BOLD, fontSize: t2.scale.caps.size.max, fontWeight: '700', letterSpacing: 1.1, color: sharedColour.sub },
  vSheetTitle: { fontFamily: DISPLAY_FAMILY, fontSize: t2.scale.view.size.max, fontWeight: '800', color: sharedColour.ink, letterSpacing: -0.2 },

  /* APERÇU EN-TÊTE — the preview sheet (founder flow 2026-08-03). Shares the
     vSheet chrome above; own rows, EXISTING palette bytes only.
     `entScene` is a fixed 300 band rather than a fraction of the sheet: the
     header it shows is the top of a real page, and a stage that changed height
     between styles would read as the styles being different sizes. */
  entScene: { height: 430, marginTop: spacing.md, borderRadius: radius.tile, overflow: 'hidden', backgroundColor: K_SANS_JETON.sable },
  entGrip: { paddingBottom: spacing.xs },
  entWeb: { flex: 1, backgroundColor: K_SANS_JETON.sable },
  entOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18, backgroundColor: K_SANS_JETON.sable },
  entVide: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: 18 },
  entVideText: { fontFamily: TEXT_FAMILY, fontSize: t2.scale.body.size.min, lineHeight: 19, color: sharedColour.body, textAlign: 'center' },

  /* ENTETES-C — the FRAMING sheet (drag-to-frame). Shares the vSheet chrome
     above; these are its own rows, on EXISTING palette bytes only. */
  frHint: { fontFamily: TEXT_FAMILY, fontSize: t2.scale.body.size.min, lineHeight: 19, color: sharedColour.body, marginTop: 6 },
  frStage: { alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  frFrame: { overflow: 'hidden', backgroundColor: K_SANS_JETON.sable },
  frVerite: { fontFamily: TEXT_FAMILY, fontSize: 11.5, lineHeight: 17, color: sharedColour.sub, textAlign: 'center', marginTop: 10 },
  frActions: { marginTop: 14 },
  frGhostWide: {
    height: 48, borderRadius: radius.art.max, backgroundColor: sharedColour.card, borderWidth: 1.5, borderColor: sharedColour.hairlineStrong,
    alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
} as const;
