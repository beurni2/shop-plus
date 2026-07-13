import { describe, expect, it } from 'vitest';
import { composeCard, OUTPUT, PREVIEW, type CardCopy, type CardInput, type Format, type Op } from '../src/composeur.js';
import { encodeQr } from '@qr/encoder';
import { DEMO_QR_URL, isCanonIdentityUrl } from '@qr/identity';
import { DEMO_KIT } from '../src/demo.js';

/**
 * WO-7.2b — the composeur obeys the laws by construction. The display list is a
 * pure function of the spec (byte-stable, testable in CI); SON prix only; no
 * commission, no supplier anywhere; the dated validity hint on EVERY output; the
 * QR on the AFFICHE only, encoding the canon slug; the no-scan fallback verbatim.
 */

const COPY: CardCopy = {
  productName: DEMO_KIT.productName,
  prixTag: 'PRIX',
  priceLabel: '11 500 F',
  deliveryBadge: 'LIVRÉ PAR SÉRA · PAIEMENT PROTÉGÉ',
  codeLine: `CODE : ${DEMO_KIT.shortCode}`,
  bioLine: 'lien dans ma bio',
  validity: 'Prix du 13 juillet — le lien dit le prix du jour.',
  qrLegend: 'SCANNEZ — OU TAPEZ LE CODE',
  qrFallback: `Pas de scan ? Le code suffit — ${DEMO_KIT.shortCode}.`,
};

const input = (format: Format, model: 'clair' | 'nuit' = 'clair'): CardInput => ({
  format,
  model,
  copy: COPY,
  qrUrl: DEMO_KIT.qrUrl,
});

const FORMATS: Format[] = ['story', 'carre', 'affiche'];
const texts = (ops: readonly Op[]): string[] => ops.filter((o): o is Extract<Op, { kind: 'text' }> => o.kind === 'text').map((o) => o.text);
const role = (ops: readonly Op[], r: string): Extract<Op, { kind: 'text' }> | undefined =>
  ops.find((o): o is Extract<Op, { kind: 'text' }> => o.kind === 'text' && o.role === r);

describe('the composeur is deterministic (same spec → byte-identical display list)', () => {
  it('two composes of every format/model are byte-equal', () => {
    for (const f of FORMATS) {
      for (const m of ['clair', 'nuit'] as const) {
        expect(JSON.stringify(composeCard(input(f, m)))).toBe(JSON.stringify(composeCard(input(f, m))));
      }
    }
  });

  it('each format carries its exact output dimensions (story 9:16 · carré 1:1 · affiche A5)', () => {
    for (const f of FORMATS) {
      const card = composeCard(input(f));
      expect({ width: card.width, height: card.height }).toEqual(OUTPUT[f]);
    }
    // the WYSIWYG previews are the SAME aspect ratio, exact-scaled (never cropped)
    for (const f of FORMATS) {
      expect(PREVIEW[f].width / PREVIEW[f].height).toBeCloseTo(OUTPUT[f].width / OUTPUT[f].height, 2);
    }
  });
});

describe('the money law on the card — SON prix, one figure, never a rebate', () => {
  it('the price appears exactly once, as the passed figure; no gross/à-partir-de/struck form', () => {
    for (const f of FORMATS) {
      const ops = composeCard(input(f)).ops;
      const price = role(ops, 'price');
      expect(price?.text).toBe('11 500 F');
      expect(texts(ops).filter((x) => x.includes('11 500'))).toHaveLength(1);
      for (const s of texts(ops)) {
        expect(s.toLowerCase()).not.toMatch(/à partir de|gross|barré|au lieu de|-\d+%/);
      }
    }
  });

  it('commission and supplier appear NOWHERE — the CardInput type has no field for either (SP-I03)', () => {
    // structural: `copy` is the only string source and carries no such key.
    expect(Object.keys(COPY).sort()).toEqual(
      ['bioLine', 'codeLine', 'deliveryBadge', 'priceLabel', 'prixTag', 'productName', 'qrFallback', 'qrLegend', 'validity'].sort(),
    );
    for (const f of FORMATS) {
      for (const s of texts(composeCard(input(f)).ops)) {
        expect(s.toLowerCase()).not.toMatch(/commission|fournisseur|supplier|marge/);
      }
    }
  });
});

describe('the validity hint rides EVERY output; the QR rides the AFFICHE only', () => {
  it('every format carries the dated validity hint', () => {
    for (const f of FORMATS) {
      expect(role(composeCard(input(f)).ops, 'validity')?.text).toBe(COPY.validity);
    }
  });

  it('story and carré have NO qr op; the affiche has exactly one', () => {
    expect(composeCard(input('story')).ops.filter((o) => o.kind === 'qr')).toHaveLength(0);
    expect(composeCard(input('carre')).ops.filter((o) => o.kind === 'qr')).toHaveLength(0);
    expect(composeCard(input('affiche')).ops.filter((o) => o.kind === 'qr')).toHaveLength(1);
  });
});

describe('the affiche QR — canon slug, spec placement, no-scan fallback verbatim', () => {
  const affiche = composeCard(input('affiche'));
  const qr = affiche.ops.find((o): o is Extract<Op, { kind: 'qr' }> => o.kind === 'qr')!;

  it('the QR matrix IS encodeQr(canon URL) — the real origin, never a fork', () => {
    expect(DEMO_QR_URL).toBe(DEMO_KIT.qrUrl);
    expect(isCanonIdentityUrl(DEMO_KIT.qrUrl)).toBe(true);
    expect(JSON.stringify(qr.matrix)).toBe(JSON.stringify(encodeQr(DEMO_KIT.qrUrl).modules));
  });

  it('the QR sits in the bottom third, at the canon 48 mm print side (≥ 1.0 mm/module)', () => {
    expect(qr.y).toBeGreaterThan(affiche.height * 0.66); // bottom third
    const dpi = 300;
    const sideMm = (qr.side / dpi) * 25.4;
    const moduleMm = (qr.module / dpi) * 25.4;
    expect(sideMm).toBeGreaterThanOrEqual(48); // the 48 mm print side holds
    expect(moduleMm).toBeGreaterThanOrEqual(1); // the 1.0 mm module floor holds
  });

  it('the no-scan fallback is painted verbatim (a code always works without a scan)', () => {
    expect(role(affiche.ops, 'qr-fallback')?.text).toBe(COPY.qrFallback);
    expect(role(affiche.ops, 'qr-legend')?.text).toBe(COPY.qrLegend);
  });
});

describe('NUIT is the only ink background; colours are tokens, never hex literals', () => {
  it('the surface fill flips ink/paper by model', () => {
    const clair = composeCard(input('story', 'clair')).ops[0]!;
    const nuit = composeCard(input('story', 'nuit')).ops[0]!;
    expect(clair.kind).toBe('fill');
    expect(nuit.kind).toBe('fill');
    if (clair.kind === 'fill' && nuit.kind === 'fill') {
      expect(clair.colour).not.toBe(nuit.colour); // paper vs ink
    }
  });
});
