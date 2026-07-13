import { shopPlusTheme as theme, shopColour, dimension } from '@platform/ui-tokens';
import { encodeQr } from '@qr/encoder';

/**
 * WO-7.2b — THE COMPOSEUR (PWA path, Q5 ruling). A deterministic layout engine:
 * `composeCard` turns a spec into an ordered DISPLAY LIST of primitives in
 * OUTPUT-pixel space — no `Date`, no random, no I/O — so the same input yields
 * a byte-identical list, testable in CI. `paint.ts` is the dumb executor that
 * strokes the list onto a canvas at any scale (WYSIWYG: preview and full output
 * share ONE composition). This mirrors the RN QR (compute the maths, paint it
 * plainly) and the share hub (the type forbids what must never appear).
 *
 * The laws the list holds by construction:
 *  · SON prix only — the caller passes one formatted figure; there is no gross,
 *    no « à partir de », no struck rebate field on `CardCopy`.
 *  · commission NOWHERE · supplier NOWHERE — `CardInput` has no field for either
 *    (SP-I03), so the composeur cannot paint them.
 *  · the dated validity hint is on EVERY output · the QR rides the AFFICHE only.
 */

export type Format = 'story' | 'carre' | 'affiche';
export type Model = 'clair' | 'nuit';

/** Every string the card paints — resolved from the catalog by the caller, so
 * copy never lives inline (Contract §10.5). No gross/commission/supplier field
 * exists here: the type is the guarantee. */
export interface CardCopy {
  readonly productName: string;
  readonly prixTag: string; // "PRIX"
  readonly priceLabel: string; // "11 500 F" — SON prix, one confident figure
  readonly deliveryBadge: string; // "LIVRÉ PAR SÉRA · PAIEMENT PROTÉGÉ"
  readonly codeLine: string; // "CODE : AICHA-4821"
  readonly bioLine: string; // "lien dans ma bio"
  readonly validity: string; // "Prix du 13 juillet — le lien dit le prix du jour."
  readonly qrLegend: string; // "SCANNEZ — OU TAPEZ LE CODE"  (affiche)
  readonly qrFallback: string; // "Pas de scan ? Le code suffit — AICHA-4821."  (affiche)
}

export interface CardInput {
  readonly format: Format;
  readonly model: Model;
  readonly copy: CardCopy;
  readonly qrUrl: string; // the canon slug at the real origin (affiche QR)
}

export type Align = 'left' | 'center' | 'right';

export type Op =
  | { readonly kind: 'fill'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly colour: string }
  | { readonly kind: 'tick'; readonly path: readonly (readonly [number, number])[]; readonly colour: string; readonly width: number }
  | {
      readonly kind: 'text';
      readonly role: string;
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly px: number;
      readonly weight: number;
      readonly colour: string;
      readonly align: Align;
    }
  | {
      readonly kind: 'qr';
      readonly x: number;
      readonly y: number;
      readonly module: number;
      readonly quiet: number;
      readonly side: number;
      readonly matrix: readonly (readonly boolean[])[];
      readonly dark: string;
      readonly light: string;
    };

export interface Card {
  readonly format: Format;
  readonly model: Model;
  readonly width: number;
  readonly height: number;
  readonly ops: readonly Op[];
}

/** Full-resolution outputs (spec): story 9:16 · carré 1:1 · affiche A5 @300 dpi. */
export const OUTPUT: Record<Format, { readonly width: number; readonly height: number }> = {
  story: { width: 1080, height: 1920 },
  carre: { width: 1080, height: 1080 },
  affiche: { width: 1748, height: 2480 },
};

/** Exact-scale previews (spec) — never cropped, the SAME composition scaled. */
export const PREVIEW: Record<Format, { readonly width: number; readonly height: number }> = {
  story: { width: 202, height: 360 },
  carre: { width: 296, height: 296 },
  affiche: { width: 232, height: 330 },
};

/** How much of the height the product photo occupies before the content band. */
const PHOTO_FRACTION: Record<Format, number> = { story: 0.5, carre: 0.56, affiche: 0.42 };

const surfaces = (model: Model) => ({
  bg: model === 'nuit' ? theme.colours.ink : theme.colours.paper,
  fg: model === 'nuit' ? theme.colours.onInk : theme.colours.ink,
  muted: model === 'nuit' ? theme.colours.sand : theme.colours.muted,
  photo: theme.colours.sand, // the only ink background is the card itself (NUIT)
  accent: shopColour.primaryStrong, // terracotta — ticks, price, tri-band
});

/** The affiche QR: canon `dimension.qr` primitives at 300 dpi print — the 48 mm
 * side and 1.0 mm module floor hold regardless of version (ruling ledger). */
function qrOp(url: string, x: number, yCentre: number): Extract<Op, { kind: 'qr' }> {
  const dpi = 300;
  const mmToPx = (mm: number) => Math.round((mm / 25.4) * dpi);
  const qr = encodeQr(url);
  const quiet = dimension.qr.quietZoneModules;
  const total = qr.size + 2 * quiet;
  const module = Math.max(mmToPx(dimension.qr.printModuleMinMm), Math.round(mmToPx(dimension.qr.printSideMm) / total));
  const side = module * total;
  return {
    kind: 'qr',
    x,
    y: Math.round(yCentre - side / 2),
    module,
    quiet,
    side,
    matrix: qr.modules,
    dark: theme.colours.ink,
    light: theme.colours.paper, // the QR keeps its own paper quiet zone even on NUIT
  };
}

/**
 * Compose a card into its deterministic display list. Pure: same input → the
 * same ops, always.
 */
export function composeCard(input: CardInput): Card {
  const { format, model, copy } = input;
  const { width: W, height: H } = OUTPUT[format];
  const s = surfaces(model);
  const M = Math.round(W * 0.06); // margin
  const ops: Op[] = [];

  // 1 — the surface (NUIT is the only ink background allowed).
  ops.push({ kind: 'fill', x: 0, y: 0, w: W, h: H, colour: s.bg });

  // 2 — the product photo area (exact bytes, never stretched → a designed sable
  // placeholder here; the real kit blits the reseller's photo into this box).
  const photoBottom = Math.round(H * PHOTO_FRACTION[format]);
  ops.push({ kind: 'fill', x: M, y: M, w: W - 2 * M, h: photoBottom - M, colour: s.photo });

  // 3 — the premium frame: four terracotta corner ticks, OUTSIDE the content.
  const tick = Math.round(W * 0.05);
  const tw = Math.max(2, Math.round(W * 0.006));
  const i = Math.round(M * 0.4); // inset from the very edge
  ops.push({ kind: 'tick', path: [[i, i + tick], [i, i], [i + tick, i]], colour: s.accent, width: tw });
  ops.push({ kind: 'tick', path: [[W - i - tick, i], [W - i, i], [W - i, i + tick]], colour: s.accent, width: tw });
  ops.push({ kind: 'tick', path: [[i, H - i - tick], [i, H - i], [i + tick, H - i]], colour: s.accent, width: tw });
  ops.push({ kind: 'tick', path: [[W - i - tick, H - i], [W - i, H - i], [W - i, H - i - tick]], colour: s.accent, width: tw });

  // 4 — the content band, stacked from the photo's edge.
  let y = photoBottom + Math.round(H * 0.02);
  const line = (role: string, text: string, px: number, weight: number, colour: string, gap = 0.4): void => {
    ops.push({ kind: 'text', role, x: M, y, text, px, weight, colour, align: 'left' });
    y += Math.round(px * (1 + gap));
  };

  line('product', copy.productName, Math.round(W * 0.05), 700, s.fg, 0.5);
  line('prix-tag', copy.prixTag, Math.round(W * 0.026), 700, s.muted, 0.25);
  line('price', copy.priceLabel, Math.round(W * 0.095), 800, s.accent, 0.5);
  line('delivery', copy.deliveryBadge, Math.round(W * 0.024), 700, s.muted, 0.6);
  ops.push({ kind: 'text', role: 'code', x: M, y, text: copy.codeLine, px: Math.round(W * 0.03), weight: 700, colour: s.fg, align: 'left' });
  ops.push({ kind: 'text', role: 'bio', x: W - M, y, text: copy.bioLine, px: Math.round(W * 0.028), weight: 500, colour: s.muted, align: 'right' });
  y += Math.round(W * 0.03 * 1.6);
  line('validity', copy.validity, Math.round(W * 0.024), 500, s.muted, 0.5);

  // 5 — the QR block: the AFFICHE only, in the bottom third (scan or type).
  if (format === 'affiche') {
    const bandTop = Math.round(H * 0.7);
    const qrCentre = Math.round((bandTop + (H - M)) / 2);
    const qr = qrOp(input.qrUrl, M, qrCentre);
    ops.push({ kind: 'fill', x: qr.x - M * 0.4, y: qr.y - M * 0.4, w: qr.side + M * 0.8, h: qr.side + M * 0.8, colour: theme.colours.sand });
    ops.push(qr);
    const tx = qr.x + qr.side + Math.round(M * 0.8);
    let ty = qr.y + Math.round(qr.side * 0.1);
    const rline = (role: string, text: string, px: number, weight: number, colour: string, gap = 0.7): void => {
      ops.push({ kind: 'text', role, x: tx, y: ty, text, px, weight, colour, align: 'left' });
      ty += Math.round(px * (1 + gap));
    };
    rline('qr-legend', copy.qrLegend, Math.round(W * 0.026), 700, s.muted);
    rline('qr-code', copy.codeLine, Math.round(W * 0.05), 800, s.fg);
    rline('qr-fallback', copy.qrFallback, Math.round(W * 0.024), 500, s.muted);
  }

  // 6 — the discreet tri-band at the foot (Séra's road-and-custody accent).
  ops.push({ kind: 'fill', x: 0, y: H - Math.round(H * 0.006), w: W, h: Math.round(H * 0.006), colour: s.accent });

  return { format, model, width: W, height: H, ops };
}
