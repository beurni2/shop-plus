# Faso Premium — PWA font payload budget (WO-FP · STEP 0)

The tightest gate on the buyer surface is the **300 KB font payload**. This is the
measured accounting for the Faso Premium face set, established **before any view is
styled**, so the budget is a fact and not a hope.

## The four canon-declared faces (fasoPremium `type.families`, ui-tokens v1.0.0)

| Face | Weight | woff2 |
|------|--------|-------|
| Bricolage Grotesque (display) | 700 | 22 968 B |
| Bricolage Grotesque (display) | 800 | 22 364 B |
| Instrument Sans (text) | 400 | 19 244 B |
| Instrument Sans (text) | 700 | 19 652 B |
| **Faso Premium total** | | **84 168 B = 82.2 KB** |

Only these four ship. Instrument 500/600 are **not** in the canon token, so they are
not built (derive-never-invent).

Each face is subset to the French + franc charset (basic Latin, French accents and
ligature, guillemets, typographic punctuation, the narrow no-break space U+202F the
fr-FR formatter emits in « 11 500 F », and the typographic minus U+2212 the reseller
fee line « Part Shop+ (20 %) : − {amount} » renders). Coverage is proven byte-for-byte
by `faso-premium.coverage.json` + the money-render guard test.

## Budget math against the 300 KB gate

- **Faso Premium alone:** 82.2 KB — **217.7 KB under** the 300 KB gate.
- **Transition peak (Archivo still present):** 84 168 + 30 352 (archivo-latin-var.woff2)
  = 114 580 B = **111.9 KB — 188.1 KB under** the gate. Both sets coexist only while the
  view slices migrate; Archivo is retired in WO-FP-PWA.
- **After Archivo retires:** 82.2 KB.

Every state is comfortably inside the gate.

## Provenance

Built from the upstream OFL variable sources (Bricolage Grotesque, Instrument Sans) via
`scratchpad/build-fonts.py`: variable → static instance per weight → subset → distinct
name-table identity per face → woff2. Licenses ship alongside as `OFL-*.txt`.
