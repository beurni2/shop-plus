# Faso Premium — French/franc subset, static instances (WO-FP · STEP 0)

**Reproducible build.** The four static faces are produced from the upstream OFL
variable sources, subset to the French + franc charset and pinned to exactly the
weights the canon `fasoPremium type.families` declares (ui-tokens v1.0.0). The
RN surface embeds the **.ttf**; the buyer PWA embeds the **.woff2** — same faces,
two flavours. Licenses ship alongside as `OFL-*.txt`.

## The six shared faces

`type.families` declares: display **Bricolage Grotesque** [700, 800], text
**Instrument Sans** [400, 700]. **Founder ruling (2026-07-14):** the text
`[400, 700]` is an ENDPOINT ARRAY OF A RANGE (400→700), so **Instrument 500 + 600
ship** (WO-FP-PWA STEP 0) — 600 backs the reconcile whisper. Display stays
[700, 800] (Bricolage; the scale uses 800, 700 declared). A canon `$note` encoding
question is journaled (the token should say range vs exhaustive list).

The reseller app LOADS Bricolage 800 + Instrument 400/600/700 (600 for the whisper);
Instrument 500 ships in the shared assets for the PWA but the reseller doesn't render
it, so it is embedded-not-loaded here.

## Sources
- **Bricolage Grotesque** variable — © 2022 The Bricolage Grotesque Project Authors, OFL 1.1
  (`github.com/google/fonts/ofl/bricolagegrotesque`, axes `wght 200..800`, `opsz`, `wdth`).
- **Instrument Sans** variable — © 2022 The Instrument Sans Project Authors, OFL 1.1
  (`github.com/google/fonts/ofl/instrumentsans`, axes `wght 400..700`, `wdth`).

## Pipeline (deterministic — `scratchpad/build-fonts.py`)
1. `fontTools.varLib.instancer.instantiateVariableFont` → pin `wght` per face
   (Bricolage also pins `opsz 12`, `wdth 100`; Instrument pins `wdth 100`).
2. `fontTools.subset.Subsetter` (`layout_features='*'`, keeps `tnum`/`kern`) →
   keep U+0020–007E · U+00A0–00FF · œŒ · «»‹› · curly quotes · – — … · · £ · **U+202F** · **U+2212**.
3. Rename the name-table to a **distinct family identity per face** (no faux-weight synthesis).
4. Save plain TTF (RN asset loader) **and** woff2 (PWA).
- Toolchain: **fontTools 4.63.0 + brotli** (pip).

## The narrow no-break space (U+202F) — the gap Archivo left open, now closed
`Intl.NumberFormat('fr-FR')` emits **U+202F** between franc thousands (« 11 500 F »).
Bricolage carries it natively; **Instrument Sans does not**. Rather than fall back to
invisible ink (Archivo's honest gap), the build **consciously maps U+202F to the font's
own space advance** in the cmap of every face that lacks it, so every weight draws the
franc figure with no tofu and no fallback swap. This is a deliberate cmap pin, recorded
here — not a silent papering-over. The money-render guard test asserts it holds.

## U+2212 (MINUS SIGN)
The reseller fee line renders « Part Shop+ (20 %) : − {amount} » with the typographic
minus U+2212. It is in the subset charset; every face draws it. (Caught by the
money-render guard deriving its charset from the real catalog.)

## Faces + sha256 (the .ttf this surface embeds)
- **Bricolage-Bold.ttf** (700) — 51948 B · sha256 `88c35a0a95f42bb54d50dc9a20cfd1769dfa39739319bdeb1efd237dd987ed60`
- **Bricolage-ExtraBold.ttf** (800) — 51932 B · sha256 `3211763e0a903ff8f7af0e2429d71e0d6da5c1616c2bbb15f7aaf04b5605f776`
- **Instrument-Regular.ttf** (400) — 45308 B · sha256 `5d93105b90928a7a978a3fb04397632d888f5130dffab1600c993c74635d9438`
- **Instrument-Medium.ttf** (500) — 45420 B · sha256 `f50da88f7b00921eeda8cbebc1f7a0342a192802f9e83a2269281848a423855e`
- **Instrument-SemiBold.ttf** (600) — 45436 B · sha256 `354c9212d3e7854c77e3322ae47f0fbb806cf8a796989d9c72d9b416223a6a72`
- **Instrument-Bold.ttf** (700) — 45444 B · sha256 `b61b535075683ef91b34a2824b7d69a8f006409e4c297dbcc7f39df97b4c43e9`

The buyer PWA woff2 shas + payload budget are in
`apps/buyer-pwa/public/fonts/FASO-PREMIUM-BUDGET.md`. Coverage per face is
machine-checked by `faso-premium.coverage.json` (sha-bound to these bytes) +
`test/faso-fonts.test.ts` on each surface.
