/**
 * CERCLE-STYLES — raw style values (PURE data, no react-native import) so the
 * Phase-4 property audit + pins run Node-side. Values are the Phase-0 table's
 * bytes (HANDOFF §1 tokens · §2 component recipes, spot-verified against the
 * extracted computed styles). `screens.tsx` feeds this into StyleSheet.create.
 *
 * RN-medium adaptations (documented in the Phase-4 audit, same class as the K
 * half): CSS gradients (liseré tissé, art duotones, sticky-CTA fade, rayures
 * overlay) render as layered Views/solid fills; emoji product glyphs are
 * BANNED (no-emoji gate) → the app's established initial-letter art tile;
 * IS-800 maps to the Bold(700) face; `backdrop-filter` has no RN equivalent
 * (dock bg stays the .88 tint).
 */
import { DISPLAY_FAMILY, TEXT_FAMILY, TEXT_FAMILY_SEMIBOLD, TEXT_FAMILY_BOLD } from '../ui/faso-fonts';

export const CE = {
  paper: '#F4EFE6', card: '#FFFFFF', ink: '#1C1710', inkSoft: '#4A3F33', sub: '#6F6355',
  faint: '#8A7D6B', hairline: '#EDE4D3', hairline2: '#E5DCC9', hairline3: '#F3EDDE',
  disabledBg: '#DDD5C3', disabledFg: '#8A7D6B',
  okBg: '#DFEEE3', okFg: '#14603A', warnBg: '#F6E9C8', warnFg: '#7A5104', warnDeep: '#5F4403',
  dangerBg: '#F8E1DE', dangerFg: '#8C1D18', dangerDeep: '#7E1A15', neutre: '#EFE8DA',
  sheet: '#FCF9F2', accent: '#A31D4E', deep: '#701134', soft: '#F8E4EC', onAccent: '#FCF4EE',
  gold: '#E0A11B', stars: '#C89A3F', track: '#EFE4D2', chevron: '#B3A78F', dashedDemo: '#C9BDA3',
} as const;

export const CERCLE_RAW_STYLES = {
  screen: { flex: 1 },
  scrollTab: { padding: 16, paddingHorizontal: 20, paddingBottom: 150 },
  scrollStacked: { padding: 16, paddingHorizontal: 20, paddingBottom: 60 },
  scrollWizard: { padding: 18, paddingHorizontal: 20, paddingBottom: 120 },
  pressed: { opacity: 0.85 },

  /* type roles (§1.2) */
  tabTitle: { fontFamily: DISPLAY_FAMILY, fontSize: 28, fontWeight: '800', letterSpacing: -0.56, color: '#1C1710' },
  tabSub: { fontFamily: TEXT_FAMILY, fontSize: 13, color: '#6F6355', marginTop: 4 },
  stepTitle: { fontFamily: DISPLAY_FAMILY, fontSize: 24, fontWeight: '800', letterSpacing: -0.48, color: '#1C1710' },
  screenTitle19: { flex: 1, fontFamily: DISPLAY_FAMILY, fontSize: 19, fontWeight: '800', letterSpacing: -0.38, color: '#1C1710' },
  capsSection: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: '#6F6355' },

  /* C-CE1 stat card */
  statCard: { flex: 1, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: '#EDE4D3', backgroundColor: '#FFFFFF' },
  statCaps: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.05, textTransform: 'uppercase', color: '#6F6355' },
  statValue: { marginTop: 6, fontFamily: DISPLAY_FAMILY, fontSize: 24, fontWeight: '800', color: '#1C1710', fontVariant: ['tabular-nums'] },
  statNoteOk: { marginTop: 3, fontFamily: TEXT_FAMILY_SEMIBOLD, fontSize: 12, color: '#14603A' },
  statNote: { marginTop: 3, fontFamily: TEXT_FAMILY, fontSize: 12, color: '#6F6355' },

  /* C-CE2 campaign tile + gauge */
  campTile: { padding: 15, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#EDE4D3', backgroundColor: '#FFFFFF' },
  campTileRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  campTileTitle: { flex: 1, fontFamily: TEXT_FAMILY_BOLD, fontSize: 14.5, fontWeight: '700', color: '#1C1710' },
  pill: { borderRadius: 99, paddingVertical: 5, paddingHorizontal: 10, flexShrink: 0 },
  pillText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 11, fontWeight: '700' },
  pillOk: { backgroundColor: '#DFEEE3' }, pillOkText: { color: '#14603A' },
  pillNeutre: { backgroundColor: '#EFE8DA' }, pillNeutreText: { color: '#6F6355' },
  pillWarn: { backgroundColor: '#F6E9C8' }, pillWarnText: { color: '#7A5104' },
  pillRose: { backgroundColor: '#F8E4EC' }, pillRoseText: { color: '#701134' },
  gaugeTrack: { marginTop: 10, height: 9, borderRadius: 99, backgroundColor: '#EFE4D2', overflow: 'hidden' },
  gaugeFill: { height: 9, borderRadius: 99, backgroundColor: '#A31D4E' },
  campTileFoot: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  campTileFootText: { fontFamily: TEXT_FAMILY, fontSize: 12, color: '#6F6355', fontVariant: ['tabular-nums'] },
  campTileEmptySub: { marginTop: 6, fontFamily: TEXT_FAMILY, fontSize: 12.5, color: '#6F6355' },

  /* C-CE3 result card */
  resultCard: { padding: 16, paddingHorizontal: 17, borderRadius: 20, borderWidth: 1, borderColor: '#EDE4D3', backgroundColor: '#FFFFFF' },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 5, gap: 10 },
  moneyLabel: { flex: 1, fontFamily: TEXT_FAMILY, fontSize: 14, color: '#1C1710' },
  moneyLabelSub: { flex: 1, fontFamily: TEXT_FAMILY, fontSize: 14, color: '#6F6355' },
  moneyVal: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 14, fontWeight: '700', color: '#1C1710', fontVariant: ['tabular-nums'] },
  moneyValDeep: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 14, fontWeight: '700', color: '#701134', fontVariant: ['tabular-nums'] },
  resultNoteOk: { marginTop: 9, padding: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#DFEEE3' },
  resultNoteOkText: { fontFamily: TEXT_FAMILY, fontSize: 12.5, lineHeight: 18.75, color: '#14603A' },
  resultNoteWarn: { marginTop: 9, padding: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#F6E9C8' },
  resultNoteWarnText: { fontFamily: TEXT_FAMILY, fontSize: 12.5, lineHeight: 18.75, color: '#5F4403' },

  /* C-CE4 suggestion + C-CE5 chip + C-CE6 duo */
  suggestion: { padding: 16, paddingHorizontal: 17, borderRadius: 20, borderWidth: 1, borderColor: '#EDE4D3', backgroundColor: '#FFFFFF' },
  suggestionText: { marginTop: 8, fontFamily: TEXT_FAMILY, fontSize: 14, lineHeight: 21, color: '#1C1710' },
  suggestionWhy: { marginTop: 6, fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: '#6F6355' },
  chipRose: { alignSelf: 'flex-start', height: 38, paddingHorizontal: 15, borderRadius: 99, backgroundColor: '#F8E4EC', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  chipRoseText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 13, fontWeight: '700', color: '#701134' },
  duo: { flexDirection: 'row', gap: 10 },
  duoSoft: { flex: 1, height: 48, borderRadius: 14, backgroundColor: '#F8E4EC', alignItems: 'center', justifyContent: 'center' },
  duoSoftText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 13.5, fontWeight: '700', color: '#701134' },
  duoGhost: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5DCC9', alignItems: 'center', justifyContent: 'center' },
  duoGhostText: { fontFamily: TEXT_FAMILY_SEMIBOLD, fontSize: 13.5, color: '#1C1710' },

  /* C-CE7 review card */
  reviewCard: { padding: 14, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: '#EDE4D3', backgroundColor: '#FFFFFF' },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  reviewName: { flex: 1, fontFamily: TEXT_FAMILY_BOLD, fontSize: 13.5, fontWeight: '700', color: '#1C1710' },
  reviewStars: { color: '#C89A3F', letterSpacing: 0.81 },
  reviewPill: { borderRadius: 99, paddingVertical: 4, paddingHorizontal: 9, backgroundColor: '#DFEEE3' },
  reviewPillText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 10.5, fontWeight: '700', color: '#14603A' },
  reviewQuote: { marginTop: 6, fontFamily: TEXT_FAMILY, fontSize: 13, lineHeight: 19.5, color: '#4A3F33' },

  /* C-CE9 wizard header + dots */
  wizHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 16, paddingHorizontal: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 99, borderWidth: 1, borderColor: '#E5DCC9', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  wizTitle: { flex: 1, fontFamily: DISPLAY_FAMILY, fontSize: 16, fontWeight: '700', color: '#1C1710' },
  wizStep: { fontFamily: TEXT_FAMILY, fontSize: 16, color: '#6F6355', fontVariant: ['tabular-nums'] },
  wizDots: { flexDirection: 'row', gap: 6, marginTop: 14, paddingHorizontal: 20 },
  wizDot: { flex: 1, height: 4, borderRadius: 99, backgroundColor: '#E5DCC9' },
  wizDotOn: { backgroundColor: '#A31D4E' },

  /* C-CE10 recipe card */
  recipeCard: { padding: 15, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: '#EDE4D3', backgroundColor: '#FFFFFF' },
  recipeCardOn: { borderWidth: 2, borderColor: '#A31D4E' },
  recipeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  recipeName: { flex: 1, fontFamily: TEXT_FAMILY_BOLD, fontSize: 15, fontWeight: '700', color: '#1C1710' },
  recipePill: { borderRadius: 99, paddingVertical: 4, paddingHorizontal: 9, backgroundColor: '#F8E4EC' },
  recipePillText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 10.5, fontWeight: '700', color: '#701134' },
  recipeTag: { marginTop: 5, fontFamily: TEXT_FAMILY, fontSize: 13, lineHeight: 19.5, color: '#6F6355' },
  recipeBest: { marginTop: 5, fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: '#6F6355' },
  recipeBestStrong: { fontFamily: TEXT_FAMILY_BOLD, fontWeight: '700', color: '#4A3F33' },

  /* C-CE11 product row (W2) */
  prodRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingHorizontal: 13, borderRadius: 18, borderWidth: 1, borderColor: '#EDE4D3', backgroundColor: '#FFFFFF' },
  prodRowOn: { borderWidth: 2, borderColor: '#A31D4E' },
  prodRowEpuise: { opacity: 0.62 },
  prodArt: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#EFE6D6', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  prodArtGlyph: { fontFamily: DISPLAY_FAMILY, fontSize: 21, fontWeight: '800', color: '#701134' },
  prodName: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 14, fontWeight: '700', color: '#1C1710' },
  prodNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  prodSub: { marginTop: 2, fontFamily: TEXT_FAMILY, fontSize: 12, color: '#6F6355', fontVariant: ['tabular-nums'] },
  prodSubStrong: { fontFamily: TEXT_FAMILY_BOLD, fontWeight: '700' },
  epuisePill: { borderRadius: 99, paddingVertical: 2, paddingHorizontal: 7, backgroundColor: '#EFE8DA' },
  epuisePillText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 9, fontWeight: '700', color: '#6F6355', letterSpacing: 0.45 },

  /* C-CE12 stepper */
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  stepBtn: { width: 52, height: 52, borderRadius: 99, borderWidth: 1, borderColor: '#E5DCC9', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  stepBtnGlyph: { fontFamily: TEXT_FAMILY_SEMIBOLD, fontSize: 20, color: '#1C1710' },
  stepValue: { flex: 1, textAlign: 'center', padding: 13, borderRadius: 16, borderWidth: 1, borderColor: '#EDE4D3', backgroundColor: '#FFFFFF', fontFamily: DISPLAY_FAMILY, fontSize: 19, fontWeight: '800', color: '#1C1710', fontVariant: ['tabular-nums'] },
  stepNote: { marginTop: 8, fontFamily: TEXT_FAMILY, fontSize: 12.5, lineHeight: 18.75, color: '#6F6355' },

  /* C-CE13 zone chips */
  zoneChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 },
  zoneChip: { height: 40, paddingHorizontal: 15, borderRadius: 99, borderWidth: 1.5, borderColor: '#E5DCC9', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  zoneChipOn: { borderColor: '#A31D4E', backgroundColor: '#F8E4EC' },
  zoneChipText: { fontFamily: TEXT_FAMILY_SEMIBOLD, fontSize: 13.5, color: '#1C1710' },
  zoneChipTextOn: { color: '#701134' },

  /* C-CE14 eco card */
  ecoCard: { padding: 17, borderRadius: 20, borderWidth: 2, borderColor: '#A31D4E', backgroundColor: '#FFFFFF', marginTop: 14 },
  ecoDashed: { borderTopWidth: 1.5, borderStyle: 'dashed', borderTopColor: '#E5DCC9', marginTop: 5, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  ecoDashedLabel: { flex: 1, fontFamily: TEXT_FAMILY_BOLD, fontSize: 15, fontWeight: '700', color: '#1C1710' },
  ecoDashedVal: { fontFamily: DISPLAY_FAMILY, fontSize: 20, fontWeight: '800', color: '#701134', fontVariant: ['tabular-nums'] },
  ecoHairline: { height: 1, backgroundColor: '#EDE4D3', marginVertical: 13 },
  moneyRow4: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 4, gap: 10 },

  /* C-CE15 guard cards + C-CE16 consent */
  guardDanger: { marginTop: 12, padding: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#F8E1DE' },
  guardDangerText: { fontFamily: TEXT_FAMILY, fontSize: 12.5, lineHeight: 19.375, color: '#7E1A15' },
  guardWarn: { marginTop: 12, padding: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#F6E9C8' },
  guardWarnText: { fontFamily: TEXT_FAMILY, fontSize: 12.5, lineHeight: 19.375, color: '#5F4403' },
  guardRose: { marginTop: 12, padding: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#F8E4EC' },
  guardRoseText: { fontFamily: TEXT_FAMILY, fontSize: 12.5, lineHeight: 19.375, color: '#701134' },
  consent: { marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 13, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5DCC9' },
  consentOn: { borderColor: '#A31D4E' },
  consentBox: { width: 26, height: 26, borderRadius: 9, borderWidth: 2, borderColor: '#D8CDB8', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  consentBoxOn: { borderColor: '#A31D4E', backgroundColor: '#A31D4E' },
  consentLabel: { flex: 1, fontFamily: TEXT_FAMILY, fontSize: 13.5, lineHeight: 20.25, color: '#1C1710' },
  consentStrong: { fontFamily: TEXT_FAMILY_BOLD, fontWeight: '700', fontVariant: ['tabular-nums'] },

  /* C-CE17 sticky CTA */
  ctaBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, paddingHorizontal: 20, paddingBottom: 40, backgroundColor: '#F4EFE6' },
  cta: { height: 54, borderRadius: 16, backgroundColor: '#A31D4E', alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: DISPLAY_FAMILY, fontSize: 16, fontWeight: '700', color: '#FCF4EE' },
  ctaDisabled: { backgroundColor: '#DDD5C3' },
  ctaTextDisabled: { color: '#8A7D6B' },
  hubCta: { marginTop: 12, height: 52, borderRadius: 16, backgroundColor: '#A31D4E', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  hubCtaText: { fontFamily: DISPLAY_FAMILY, fontSize: 15.5, fontWeight: '700', color: '#FCF4EE' },

  /* C-CE18 budget card + C-CE19 reconciliation */
  budgetCard: { padding: 16, paddingHorizontal: 17, borderRadius: 20, borderWidth: 1, borderColor: '#EDE4D3', backgroundColor: '#FFFFFF' },
  budgetDashed: { borderTopWidth: 1.5, borderStyle: 'dashed', borderTopColor: '#E5DCC9', marginTop: 5, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  budgetDashedLabel: { flex: 1, fontFamily: TEXT_FAMILY_BOLD, fontSize: 14.5, fontWeight: '700', color: '#1C1710' },
  budgetDashedVal: { fontFamily: DISPLAY_FAMILY, fontSize: 18, fontWeight: '800', color: '#701134', fontVariant: ['tabular-nums'] },
  budgetDashedVal19: { fontFamily: DISPLAY_FAMILY, fontSize: 19, fontWeight: '800', color: '#701134', fontVariant: ['tabular-nums'] },
  budgetFootNote: { marginTop: 8, fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 18, color: '#6F6355' },
  reconcile: { marginTop: 7, textAlign: 'right', fontFamily: TEXT_FAMILY_SEMIBOLD, fontSize: 11, color: '#6F6355', fontVariant: ['tabular-nums'] },

  /* C-CE20 reputation hero */
  reputHero: { marginTop: 14, padding: 19, borderRadius: 22, backgroundColor: '#701134' },
  reputCaps: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.05, textTransform: 'uppercase', color: '#FCF4EE', opacity: 0.8 },
  reputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4 },
  reputNote: { fontFamily: DISPLAY_FAMILY, fontSize: 38, fontWeight: '800', color: '#FCF4EE', fontVariant: ['tabular-nums'] },
  reputStars: { fontSize: 16, letterSpacing: 1.6, color: '#E0A11B' },
  reputSub: { marginTop: 4, fontFamily: TEXT_FAMILY, fontSize: 12.5, color: '#FCF4EE', opacity: 0.85 },

  /* C-CE21 member rows + segments */
  segScroll: { marginHorizontal: -20, marginTop: 14 },
  segRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  segChip: { height: 36, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1.5, borderColor: '#E5DCC9', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  segChipOn: { borderColor: '#A31D4E', backgroundColor: '#F8E4EC' },
  segChipText: { fontFamily: TEXT_FAMILY_SEMIBOLD, fontSize: 12.5, color: '#1C1710' },
  segChipTextOn: { color: '#701134' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, paddingHorizontal: 15, borderRadius: 16, borderWidth: 1, borderColor: '#EDE4D3', backgroundColor: '#FFFFFF' },
  memberAvatar: { width: 36, height: 36, borderRadius: 99, backgroundColor: '#F8E4EC', alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 13, fontWeight: '700', color: '#701134' },
  memberName: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 13.5, fontWeight: '700', color: '#1C1710' },
  memberSub: { marginTop: 1, fontFamily: TEXT_FAMILY, fontSize: 12, color: '#6F6355' },
  memberPill: { borderRadius: 99, paddingVertical: 4, paddingHorizontal: 9 },
  memberPillText: { fontFamily: TEXT_FAMILY_BOLD, fontSize: 10.5, fontWeight: '700' },

  /* A1 product card + [DEMO] line */
  aProdCard: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 18, borderWidth: 1, borderColor: '#EDE4D3', backgroundColor: '#FFFFFF' },
  aProdArt: { width: 50, height: 50, borderRadius: 13, backgroundColor: '#EFE6D6', alignItems: 'center', justifyContent: 'center' },
  aProdMeta: { marginTop: 2, fontFamily: TEXT_FAMILY, fontSize: 12, lineHeight: 17.4, color: '#6F6355', fontVariant: ['tabular-nums'] },
  demoLine: { marginTop: 12, fontFamily: TEXT_FAMILY, fontSize: 12.5, color: '#6F6355' },

  /* F1 notes */
  noteOk: { marginTop: 12, padding: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#DFEEE3' },
  noteOkText: { fontFamily: TEXT_FAMILY, fontSize: 12.5, lineHeight: 19.375, color: '#14603A' },
  noteWarn: { marginTop: 9, padding: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#F6E9C8' },
  noteWarnText: { fontFamily: TEXT_FAMILY, fontSize: 12.5, lineHeight: 19.375, color: '#5F4403' },
  ghostWide: { marginTop: 12, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5DCC9', alignItems: 'center', justifyContent: 'center' },
  ghostWideText: { fontFamily: TEXT_FAMILY_SEMIBOLD, fontSize: 13.5, color: '#1C1710' },
  ghostWideDisabled: { opacity: 0.4 },

  /* R1 stat grid */
  statGrid: { flexDirection: 'row', gap: 12, marginTop: 12 },
  rStatCard: { flex: 1, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: '#EDE4D3', backgroundColor: '#FFFFFF' },
  rStatValue: { marginTop: 6, fontFamily: DISPLAY_FAMILY, fontSize: 22, fontWeight: '800', color: '#1C1710', fontVariant: ['tabular-nums'] },

  /* headers (stacked screens) */
  stackedHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stackedHeadCol: { flex: 1 },
  stackedSub: { marginTop: 2, fontFamily: TEXT_FAMILY, fontSize: 12, color: '#6F6355' },

  /* misc */
  gap10: { gap: 10 }, gap11: { gap: 11 }, gap12: { gap: 12 }, gap9: { gap: 9 },
  mt12: { marginTop: 12 }, mt14: { marginTop: 14 }, mt16: { marginTop: 16 }, mt10: { marginTop: 10 }, mt18: { marginTop: 18 },
  rowBody: { flex: 1, minWidth: 0 },
  sectionRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toutVoir: { height: 32, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1, borderColor: '#E5DCC9', alignItems: 'center', justifyContent: 'center' },
  toutVoirText: { fontFamily: TEXT_FAMILY_SEMIBOLD, fontSize: 12, color: '#1C1710' },
  lawNote: { marginTop: 13, padding: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#F8E4EC' },
  lawNoteText: { fontFamily: TEXT_FAMILY, fontSize: 12.5, lineHeight: 19.375, color: '#701134' },
  bold700: { fontFamily: TEXT_FAMILY_BOLD, fontWeight: '700' },
} as const;
