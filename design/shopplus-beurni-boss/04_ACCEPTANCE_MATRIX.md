# Shop+ Beurni Boss — matrice d’acceptation

## Jeux de données normatifs

Use equivalent fixtures in the repository’s native format.

### F1 — COMPLET + AVIS

```json
{
  "name": "Beurni Boss",
  "zone": "Gounghin, Ouagadougou",
  "avatar": "seller-reference",
  "deliveredCount": 128,
  "rating": 4.9,
  "reviewCount": 28
}
```

Expected: `128 ventes livrées par Séra` and `4,9 · 28 avis`; no `Nouvelle vendeuse`.

### F2 — MINIMAL

```json
{
  "name": "Beurni Boss",
  "zone": "Gounghin, Ouagadougou",
  "avatar": "seller-reference",
  "deliveredCount": 0,
  "reviewCount": 0
}
```

Expected: `Nouvelle vendeuse`; no delivered-sales proof and no rating.

### F3 — COMPLET SANS AVIS

```json
{
  "name": "Beurni Boss",
  "zone": "Gounghin, Ouagadougou",
  "avatar": "seller-reference",
  "deliveredCount": 1,
  "rating": 5,
  "reviewCount": 2
}
```

Expected: `1 ventes livrées par Séra` because the handoff defines the exact invariant string `{N} ventes livrées par Séra`; no rating chip because `reviewCount < 3`; no `Nouvelle vendeuse`.

### F4 — LONGUEUR MAXIMALE

```json
{
  "name": "Atelier Élégance-Burkina",
  "zone": "Secteur 30, Bobo-Dioulasso",
  "avatar": "seller-reference",
  "deliveredCount": 1287,
  "rating": 4.75,
  "reviewCount": 307
}
```

Expected: at most two name lines, no overflow, final segment accent stays attached and `nowrap`, zone at most two lines.

### F5 — SANS PHOTO / MINIMAL

```json
{
  "name": "Beurni Boss",
  "zone": "Gounghin, Ouagadougou",
  "deliveredCount": 0,
  "reviewCount": 0
}
```

Expected: style-specific monogram/pattern fallback, no empty reserved rectangle/oval/circle, minimal badge present.

### F6 — SANS PHOTO / COMPLET

```json
{
  "name": "Beurni Boss",
  "zone": "Gounghin, Ouagadougou",
  "deliveredCount": 42,
  "rating": 4.6,
  "reviewCount": 9
}
```

Expected: monogram fallback, real proof and rating, no minimal badge.

## Captures obligatoires

Generate at minimum 30 screenshots:

- 5 styles × F1 × 360 and 320 = 10
- 5 styles × F2 × 360 and 320 = 10
- 5 styles × F4 × 320 = 5
- 5 styles × F5 × 320 = 5

Recommended additional screenshots for F3 and F6 bring the suite to 40.

Naming convention:

```text
artifacts/shopplus-headers/{style}/{fixture}-{width}x800.png
```

Examples:

```text
artifacts/shopplus-headers/masque/complete-360x800.png
artifacts/shopplus-headers/masque/minimal-320x800.png
artifacts/shopplus-headers/cauris/long-name-320x800.png
```

## Assertions automatiques communes

For every style and primary fixture:

- viewport width exactly 360 or 320; height 800;
- document scroll width equals viewport width;
- app bar height equals 56 at 360 and 52 at 320;
- functional header bottom equals 376 at 360 and 360 at 320;
- page transition band height equals 52;
- no running-text element has `scrollWidth > clientWidth + 1`;
- name occupies at most two lines;
- zone occupies at most two lines;
- name-tail computed `white-space` is `nowrap`;
- all app-bar controls have bounding boxes at least 44×44;
- proof and minimal badge count never exceed one total state container;
- rating chip absent when `reviewCount < 3`;
- seller photo is the only non-icon runtime image inside the header;
- decorative elements have `pointer-events:none`;
- no animation or transition changes visual state after load;
- no forbidden CSS property or runtime texture URL.

## Assertions par style

Use the exact measurements and tokens in the normative handoff. At minimum, assert the app bar, hero, trust strip, photo frame, proof/badge bounding box, primary name size, and transition-band color for each style.

Geometry tolerance:

- structural heights and boundaries: exact integer pixel, tolerance 0–1 px for browser rounding;
- key frame and proof geometry: ±2 px;
- decorative placements: ±3 px unless the handoff gives a responsive simplification;
- colors: exact token values in computed styles; gradients may be serialized differently but must use the specified stops/opacities;
- text: exact string match.

## Visual grading rubric

Each primary screenshot receives a 0–5 score in these dimensions:

1. style identity/signature motifs;
2. composition and visual mass;
3. palette and lighting;
4. typography and hierarchy;
5. photo frame and crop;
6. proof/badge integration;
7. trust-strip fidelity;
8. responsive clarity.

A style passes visual grading only if every dimension is ≥4 and the average is ≥4.6, with no written-spec violation. Use a fresh-context verifier for this rubric.

## Final gate

Release verdict is PASS only when:

- build and all tests pass;
- all required screenshots exist;
- automated assertions pass at 360 and 320;
- zero BLOCKING and zero MAJOR verifier findings;
- all five variants remain visibly distinct;
- no fake social proof or generated-image artifact enters production.
