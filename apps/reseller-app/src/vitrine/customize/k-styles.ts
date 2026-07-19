/**
 * K-STYLES — the raw style values (PURE data, no react-native import) so the
 * property tests can pin them Node-side. Values are the Phase-0 table's bytes
 * (bp-K1…K7). `screens.tsx` feeds this straight into StyleSheet.create.
 */
import { DISPLAY_FAMILY, TEXT_FAMILY, TEXT_FAMILY_SEMIBOLD, TEXT_FAMILY_BOLD } from '../../ui/faso-fonts';

export const K_RAW_STYLES = {
  root: { flex: 1, backgroundColor: '#F4EFE6' },
  screen: { flex: 1 },
  scrollPad: { padding: 16, paddingBottom: 46 },
  pressed: { opacity: 0.85 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  backBtn: {
    width: 40, height: 40, borderRadius: 99, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E5DCC9', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontFamily: DISPLAY_FAMILY, fontSize: 19, fontWeight: '800', color: '#1C1710', letterSpacing: -0.19 },
  apercuTitle: { flex: 1, fontFamily: DISPLAY_FAMILY, fontSize: 15, fontWeight: '700', color: '#6F6355' },
  etatPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 99, paddingVertical: 4, paddingHorizontal: 9 },
  etatPillOk: { backgroundColor: '#DFEEE3' },
  etatPillNeutre: { backgroundColor: '#EFE8DA' },
  etatPillText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 10.5, fontWeight: '700', color: '#6F6355' },
  etatDot: { width: 6, height: 6, borderRadius: 99 },
  caps: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: '#6F6355', marginTop: 16, marginBottom: 10 },
  capsGap: { marginTop: 22 },
  subTitle: { fontFamily: TEXT_FAMILY, fontSize: 12.5, color: '#6F6355', marginBottom: 10 },

  /* C-K1 aperçu card */
  previewCard: {
    borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EDE4D3',
    shadowColor: '#1C160F', shadowOpacity: 0.14, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 4,
    overflow: 'hidden',
  },
  previewCover: { height: 84, alignItems: 'flex-end', justifyContent: 'flex-end' },
  previewFiligrane: { fontFamily: DISPLAY_FAMILY, fontSize: 76, fontWeight: '800', lineHeight: 76, opacity: 0.16, marginRight: 2, marginBottom: -22 },
  previewBody: { paddingHorizontal: 16, paddingBottom: 14 },
  previewAvatar: {
    width: 40, height: 40, borderRadius: 99, marginTop: -20,
    borderWidth: 2.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  previewAvatarText: { fontFamily: DISPLAY_FAMILY, fontSize: 16, fontWeight: '800' },
  previewNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  previewName: { fontFamily: DISPLAY_FAMILY, fontSize: 15, fontWeight: '800', color: '#1C1710' },
  previewTagline: { fontFamily: TEXT_FAMILY_SEMIBOLD, fontSize: 11, fontWeight: '600', color: '#4A3F33', marginTop: 3 },
  previewChip: { alignSelf: 'flex-start', borderRadius: 99, paddingVertical: 5, paddingHorizontal: 9, marginTop: 5 },
  previewChipText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 9.5, fontWeight: '700' },
  previewLegend: { fontFamily: TEXT_FAMILY, fontSize: 11.5, color: '#6F6355', textAlign: 'center', marginTop: 7 },

  /* C-K2 rows */
  rowsCard: {
    borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EDE4D3',
    marginTop: 16, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 64, paddingVertical: 10, paddingHorizontal: 16 },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#F3EDDE' },
  rowGlyph: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F8E4EC', alignItems: 'center', justifyContent: 'center' },
  rowGlyphText: { fontFamily: DISPLAY_FAMILY, fontSize: 15, fontWeight: '800', color: '#701134' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 14.5, fontWeight: '700', color: '#1C1710' },
  rowSub: { fontFamily: TEXT_FAMILY, fontSize: 12, color: '#6F6355', marginTop: 2 },
  rowChevron: { fontFamily: TEXT_FAMILY, fontSize: 15, color: '#8A7D6B' },

  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    height: 50, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5DCC9', marginTop: 16,
  },
  ghostBtnText: { fontFamily: DISPLAY_FAMILY, fontSize: 14.5, fontWeight: '700', color: '#1C1710' },
  inkBand: { borderRadius: 18, backgroundColor: '#1C1710', padding: 14, paddingHorizontal: 16, marginTop: 16 },
  inkBandText: { fontFamily: TEXT_FAMILY, fontSize: 12.5, lineHeight: 19, color: '#F6F0E4' },
  inkBandBold: { fontFamily: TEXT_FAMILY_BOLD, fontWeight: '700' },

  /* C-K3 counted fields */
  field: { marginTop: 14 },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  fieldLabel: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: '#6F6355' },
  fieldCount: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 11, fontWeight: '700', color: '#8A7D6B' },
  fieldCountLimit: { color: '#7A5104' },
  fieldInput: {
    fontFamily: TEXT_FAMILY, fontSize: 16, color: '#1C1710',
    paddingVertical: 14, paddingHorizontal: 15, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5DCC9', backgroundColor: '#FFFFFF',
  },
  fieldInputMulti: { minHeight: 88, textAlignVertical: 'top' },
  fieldInputFocus: { borderColor: '#A31D4E' },
  fieldInputError: { borderColor: '#C4574B' },
  fieldError: { fontFamily: TEXT_FAMILY_SEMIBOLD, fontSize: 12, fontWeight: '600', color: '#8C1D18', marginTop: 6 },
  noteRose: { borderRadius: 14, backgroundColor: '#F8E4EC', padding: 12, marginTop: 16 },
  noteRoseText: { fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: '#701134' },
  cta: {
    height: 54, borderRadius: 16, backgroundColor: '#A31D4E', alignItems: 'center', justifyContent: 'center', marginTop: 18,
    shadowColor: '#A31D4E', shadowOpacity: 0.5, shadowRadius: 13, shadowOffset: { width: 0, height: 12 }, elevation: 5,
  },
  ctaDisabled: { backgroundColor: '#DDD5C3', shadowOpacity: 0, elevation: 0 },
  ctaText: { fontFamily: DISPLAY_FAMILY, fontSize: 16.5, fontWeight: '700', color: '#FCF4EE' },
  ctaTextDisabled: { color: '#8A7D6B' },

  /* C-K4 cover slot */
  coverSlot: { height: 120, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 6 },
  coverSlotDashed: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#DDD2BC', backgroundColor: '#FCF9F2' },
  coverSlotFilled: { backgroundColor: '#FCF9F2', borderWidth: 1.5, borderColor: '#E5DCC9' },
  coverSlotPhoto: { backgroundColor: '#8A5A3A', alignItems: 'flex-start', justifyContent: 'flex-start', padding: 10 },
  coverSlotError: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C4574B', backgroundColor: '#F8E1DE', padding: 14 },
  coverAddText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 13.5, fontWeight: '700', color: '#A31D4E' },
  coverSpecs: { fontFamily: TEXT_FAMILY, fontSize: 11, color: '#8A7D6B' },
  coverCapsState: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: '#6F6355' },
  coverTrack: { width: 190, height: 4, borderRadius: 99, backgroundColor: '#ECE3D1', overflow: 'hidden' },
  coverBar: { width: '34%', height: 4, borderRadius: 99, backgroundColor: '#A31D4E' },
  pill: { borderRadius: 99, paddingVertical: 4, paddingHorizontal: 9 },
  pillWarn: { backgroundColor: '#F6E9C8' },
  pillOk: { backgroundColor: '#DFEEE3' },
  pillText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  coverErrTitle: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 13.5, fontWeight: '700', color: '#8C1D18' },
  coverErrBody: { fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: '#7E1A15', textAlign: 'center' },
  noteSable: { borderRadius: 14, backgroundColor: '#F1E7D3', padding: 12, marginTop: 12 },
  noteSableText: { fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: '#4A3F33' },
  noteWarn: { borderRadius: 14, backgroundColor: '#F6E9C8', padding: 12, marginTop: 12 },
  noteWarnText: { fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: '#7A5104' },
  ghostSmall: {
    height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5DCC9',
    alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingHorizontal: 18, alignSelf: 'flex-start',
  },
  ghostSmallText: { fontFamily: DISPLAY_FAMILY, fontSize: 13.5, fontWeight: '700', color: '#1C1710' },
  demoRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  demoBtn: { borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9BDA3', paddingVertical: 9, paddingHorizontal: 12 },
  demoBtnText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 11.5, fontWeight: '700', color: '#6F6355' },

  /* C-K5 segments portrait */
  segTrack: { flexDirection: 'row', backgroundColor: '#ECE3D1', borderRadius: 14, padding: 4, gap: 4 },
  segBtn: { flex: 1, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#1C160F', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  segText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 13, fontWeight: '700', color: '#6F6355' },
  segTextActive: { color: '#1C1710' },
  portraitRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  portraitDisc: { width: 64, height: 64, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  portraitDiscText: { fontFamily: DISPLAY_FAMILY, fontSize: 24, fontWeight: '800' },
  portraitSlotDashed: {
    width: 64, height: 64, borderRadius: 99, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#DDD2BC',
    backgroundColor: '#FCF9F2', alignItems: 'center', justifyContent: 'center',
  },
  portraitNote: { flex: 1, fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: '#6F6355' },

  /* C-K6 theme cards */
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  themeCard: { width: '47%', borderRadius: 18, backgroundColor: '#FFFFFF', paddingBottom: 14, overflow: 'hidden' },
  themeCardRest: { borderWidth: 1.5, borderColor: '#E0D6C2' },
  themeCardSelected: {
    borderWidth: 2, borderColor: '#A31D4E',
    shadowColor: '#A31D4E', shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 12 }, elevation: 5,
  },
  themeSwatches: { flexDirection: 'row', gap: 6, paddingTop: 13, paddingHorizontal: 14 },
  swatch: { width: 20, height: 20, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(28,23,16,0.08)' },
  themeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 9, paddingHorizontal: 14 },
  themeName: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 14, fontWeight: '700', color: '#1C1710' },
  defautPill: { borderRadius: 99, backgroundColor: '#EFE8DA', paddingVertical: 3, paddingHorizontal: 8 },
  defautPillText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 9.5, fontWeight: '700', color: '#6F6355' },
  themeCheck: {
    position: 'absolute', top: 16, right: 10, width: 26, height: 26, borderRadius: 99,
    backgroundColor: '#A31D4E', alignItems: 'center', justifyContent: 'center',
  },
  noteCard: { borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EDE4D3', padding: 14, marginTop: 16 },
  noteCardText: { fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: '#4A3F33' },

  /* C-K7 order rows */
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 62, paddingVertical: 9, paddingHorizontal: 12 },
  orderRowEpuise: { opacity: 0.62 },
  grip: { fontFamily: TEXT_FAMILY, fontSize: 15, color: '#8A7D6B' },
  orderArt: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F1E7D3' },
  orderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderName: { flexShrink: 1, fontFamily: TEXT_FAMILY_BOLD, fontSize: 13.5, fontWeight: '700', color: '#1C1710' },
  orderPrice: { fontFamily: TEXT_FAMILY, fontSize: 11.5, color: '#6F6355', marginTop: 2 },
  unePill: { borderRadius: 99, backgroundColor: '#F8E4EC', paddingVertical: 2, paddingHorizontal: 7 },
  unePillText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 9, fontWeight: '700', color: '#701134' },
  epuisePill: { borderRadius: 99, backgroundColor: '#EFE8DA', paddingVertical: 2, paddingHorizontal: 7 },
  epuisePillText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 9, fontWeight: '700', color: '#6F6355' },
  arrowBtn: {
    width: 30, height: 30, borderRadius: 9, borderWidth: 1, borderColor: '#E5DCC9', backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  arrowText: { fontSize: 11, color: '#1C1710' },
  starBtn: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5DCC9',
    alignItems: 'center', justifyContent: 'center',
  },
  starBtnPinned: { backgroundColor: '#F8E4EC', borderColor: '#F8E4EC' },

  /* K6 dashed + danger */
  dashedCard: {
    borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#DDD2BC', backgroundColor: '#FCF9F2',
    padding: 22, alignItems: 'center', marginTop: 4,
  },
  dashedTitle: { fontFamily: DISPLAY_FAMILY, fontSize: 15, fontWeight: '800', color: '#1C1710' },
  dashedBody: { fontFamily: TEXT_FAMILY, fontSize: 12.5, lineHeight: 19, color: '#6F6355', textAlign: 'center', marginTop: 6 },
  createBtn: {
    height: 50, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9BDA3',
    alignItems: 'center', justifyContent: 'center', marginTop: 14,
  },
  createBtnText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 13.5, fontWeight: '700', color: '#6F6355' },
  checkbox: { width: 26, height: 26, borderRadius: 9, borderWidth: 1.5, borderColor: '#E5DCC9', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: '#A31D4E', borderColor: '#A31D4E' },
  dangerGhost: {
    height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: '#D9A49C', backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', marginTop: 16,
  },
  dangerGhostText: { fontFamily: DISPLAY_FAMILY, fontSize: 14, fontWeight: '700', color: '#8C1D18' },

  /* K7 aperçu */
  apercuCover: { height: 116, borderRadius: 22, overflow: 'hidden', alignItems: 'flex-end', justifyContent: 'flex-end' },
  apercuIdentity: { alignItems: 'center', marginTop: -30 },
  apercuAvatar: { width: 64, height: 64, borderRadius: 99, borderWidth: 3, borderColor: '#F4EFE6', alignItems: 'center', justifyContent: 'center' },
  apercuAvatarText: { fontFamily: DISPLAY_FAMILY, fontSize: 24, fontWeight: '800' },
  apercuName: { fontFamily: DISPLAY_FAMILY, fontSize: 24, fontWeight: '800', letterSpacing: -0.48, color: '#1C1710' },
  apercuZone: { fontFamily: TEXT_FAMILY, fontSize: 12.5, color: '#6F6355', marginTop: 4 },
  groupRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  groupCount: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 11, fontWeight: '700', color: '#8A7D6B' },
  apercuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  apercuTile: {
    width: '47%', borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EDE4D3',
    overflow: 'hidden', paddingBottom: 12,
  },
  apercuTileArt: { height: 132, marginBottom: 10 },
  apercuVeil: { flex: 1, backgroundColor: 'rgba(244,239,230,0.72)', alignItems: 'center', justifyContent: 'center' },
  apercuTampon: {
    fontFamily: DISPLAY_FAMILY, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.89, color: '#1C1710',
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#1C1710', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 11,
    overflow: 'hidden',
  },
  apercuTileName: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 13.5, fontWeight: '700', color: '#1C1710', paddingHorizontal: 12, minHeight: 34 },
  apercuTilePrice: { fontFamily: DISPLAY_FAMILY, fontSize: 14.5, fontWeight: '800', paddingHorizontal: 12, marginTop: 4 },
  apercuPriceEpuise: { color: '#6F6355' },
  apercuFeatured: {
    borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EDE4D3', overflow: 'hidden', marginBottom: 12,
  },
  apercuFeaturedArt: { height: 140 },
  apercuFeaturedBody: { flexDirection: 'row', alignItems: 'baseline', gap: 10, padding: 12, paddingHorizontal: 15 },
} as const;
