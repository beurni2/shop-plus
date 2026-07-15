# Faso Premium — French/franc subset, static instances (WO-FP · STEP 0)

**Reproducible build.** The four static faces are produced from the upstream OFL
variable sources, subset to the French + franc charset and pinned to exactly the
weights the canon `fasoPremium type.families` declares (ui-tokens v1.0.0). The
RN surface embeds the **.ttf**; the buyer PWA embeds the **.woff2** — same faces,
two flavours. Licenses ship alongside as `OFL-*.txt`.

## The four faces — and only four

`type.families` declares: display **Bricolage Grotesque** [700, 800], text
**Instrument Sans** [400, 700]. Those four ship. Instrument 500/600 are **not**
in the canon token, so they are **not** built (derive-never-invent).

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
- **Bricolage-Bold.ttf** (700) — 51948 B · sha256 `939cd4f767c1b47f5785544bb24a4d6a1e122ce3a9fc97c2d065b90b5e20162e`
- **Bricolage-ExtraBold.ttf** (800) — 51976 B · sha256 `db8460a567696d67ff9d22169b12c197a49fad7e84f288ec1761c3eb3f10bdf3`
- **Instrument-Regular.ttf** (400) — 45308 B · sha256 `0496954a20d46d39690fe88898275104f1518c6415816ccd082083b5d4a1bf67`
- **Instrument-Bold.ttf** (700) — 45416 B · sha256 `558e2bcdc28a58e0cdd65a75eb72cbd86a3a2c363c8000524f00ed12a3199dd8`

The buyer PWA woff2 shas + payload budget are in
`apps/buyer-pwa/public/fonts/FASO-PREMIUM-BUDGET.md`. Coverage per face is
machine-checked by `faso-premium.coverage.json` (sha-bound to these bytes) +
`test/faso-fonts.test.ts` on each surface.
