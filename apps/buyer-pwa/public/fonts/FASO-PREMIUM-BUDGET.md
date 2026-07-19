# Faso Premium — PWA font payload budget (WO-FP · STEP 0, six-face layer)

The tightest gate on the buyer surface is the **300 KB payload**. This is the
measured accounting for the Faso Premium face set, regenerated from the exact
committed woff2 bytes (sha256-bound by `faso-premium.coverage.json` + the
faso-fonts guard test — a stale number here cannot survive CI).

## The six shared faces (the range ruling: text.weights [400, 700] = a RANGE)

| Face | Weight | woff2 |
|------|--------|-------|
| Bricolage Grotesque | 700 | 23 052 B |
| Bricolage Grotesque | 800 | 22 320 B |
| Instrument Sans | 400 | 19 212 B |
| Instrument Sans | 500 | 19 836 B |
| Instrument Sans | 600 | 19 940 B |
| Instrument Sans | 700 | 19 584 B |
| **Faso Premium total** | | **123 944 B = 121.0 KB** |

Instrument 500/600 join the four canon faces per the founder's range ruling
(WO-FP-PWA STEP 0): canon `text.weights: [400  700]` reads as the ENDPOINTS of
a range. 600 backs IS600 (phrase d'accueil  réputation  K-screen sous-titres);
500 completes the range.

Each face is subset to the French + franc charset (basic Latin  French accents 
guillemets  typographic punctuation  U+202F — the narrow no-break space the
fr-FR formatter emits in « 11 500 FCFA » — and U+2212). Coverage is proven
byte-for-byte by `faso-premium.coverage.json` + the money-render guard test.

## Budget math against the 300 KB gate

- **Faso Premium six-face set:** 123 944 B = 121.0 KB.
- **Transition peak (Archivo still present):** 123 944 + 30 352 (archivo-latin-var.woff2)
  = 154 296 B = 150.7 KB — both sets coexist only while the
  shell still renders Archivo; the vitrine surface renders Faso Premium.
- Headroom under the 300 KB per-surface total is consumed by JS + HTML; the
  `pwa-payload-budget` gate measures the real dist on every run.
