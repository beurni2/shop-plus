import { describe, expect, it } from 'vitest';
import {
  fmtVoiceDuration,
  isPlayable,
  renderVoiceChip,
  renderVoicePlayer,
} from '../src/vitrine/voice-player';
import type { ProductVoiceNote } from '../src/vitrine/profile';
import { demoStorefrontPort } from '../src/vitrine/profile';
import { renderVitrineReady } from '../src/vitrine/render';
import { renderProductPage } from '../src/product-view';

/**
 * PER-PRODUCT VOICE NOTE (buyer side). The founder's rules, as assertions:
 * a ready note shows the « La voix » affordance with a visible duration and tap
 * (never autoplay); a pending/none/absent note shows NOTHING (no gap); the
 * buyer never sees a reseller-only capture state; SP-I03 leak law still holds.
 */

const READY: ProductVoiceNote = { status: 'ready', url: 'data:audio/wav;base64,AAAA', durationMs: 12_000 };
const PENDING: ProductVoiceNote = { status: 'pending', url: null, durationMs: 8_000 };
const RECORDED: ProductVoiceNote = { status: 'recorded', url: 'blob:x', durationMs: 8_000 };

describe('isPlayable — only a ready note with a url is buyer-visible', () => {
  it('ready+url ⇒ playable; pending/recorded/recording/none/undefined ⇒ not', () => {
    expect(isPlayable(READY)).toBe(true);
    expect(isPlayable(PENDING)).toBe(false); // no url yet, and pending ≠ ready
    expect(isPlayable(RECORDED)).toBe(false); // reseller-only capture state
    expect(isPlayable({ status: 'ready', url: null, durationMs: 3_000 })).toBe(false);
    expect(isPlayable({ status: 'none', url: null, durationMs: 0 })).toBe(false);
    expect(isPlayable(undefined)).toBe(false);
  });
});

describe('fmtVoiceDuration — always m:ss, never a bare number', () => {
  it('formats short and long durations', () => {
    expect(fmtVoiceDuration(1_100)).toBe('0:01');
    expect(fmtVoiceDuration(12_000)).toBe('0:12');
    expect(fmtVoiceDuration(65_000)).toBe('1:05');
    expect(fmtVoiceDuration(0)).toBe('0:00');
  });
});

describe('renderVoicePlayer — product page « La voix » (tap to play, duration visible)', () => {
  it('a ready note renders the player: play action, url, label, duration — and NO autoplay', () => {
    const html = renderVoicePlayer(READY);
    expect(html).toContain('data-action="voix-produit-play"');
    expect(html).toContain('data-voix-url="data:audio/wav;base64,AAAA"');
    expect(html).toContain('La voix');
    expect(html).toContain('0:12'); // duration is visible
    expect(html.toLowerCase()).not.toContain('autoplay'); // never autoplays
    expect(html).not.toContain('<audio'); // playback is JS-driven from the tap, not an embedded control
  });

  it('a pending / none / absent note renders NOTHING (no placeholder gap)', () => {
    expect(renderVoicePlayer(PENDING)).toBe('');
    expect(renderVoicePlayer(RECORDED)).toBe('');
    expect(renderVoicePlayer(undefined)).toBe('');
  });
});

describe('renderVoiceChip — the tile affordance is a span (never a nested button)', () => {
  it('renders a role="button" span with the play action + duration, no nested <button>', () => {
    const chip = renderVoiceChip(READY);
    expect(chip).toContain('<span');
    expect(chip).toContain('role="button"');
    expect(chip).toContain('data-action="voix-produit-play"');
    expect(chip).toContain('0:12');
    expect(chip).not.toContain('<button'); // must not nest a button inside the tile button
  });

  it('no chip for a non-ready or absent note', () => {
    expect(renderVoiceChip(PENDING)).toBe('');
    expect(renderVoiceChip(undefined)).toBe('');
  });
});

describe('the demo port carries ready notes for exactly p1 & p5, nothing else', () => {
  it('p1 and p5 are ready; p2 has no note', () => {
    const r = demoStorefrontPort('customised').resolve('aicha-4821')!;
    expect(r.notes['p1']?.status).toBe('ready');
    expect(r.notes['p5']?.status).toBe('ready');
    expect(r.notes['p2']).toBeUndefined();
  });

  it('the empty (day-1) variant carries no notes', () => {
    const r = demoStorefrontPort('empty').resolve('aicha-4821')!;
    expect(Object.keys(r.notes)).toHaveLength(0);
  });
});

describe('integration — the chip appears on a noted tile, never on a note-less one', () => {
  it('renderVitrineReady shows a voice chip for p1/p5 tiles and none elsewhere', () => {
    const r = demoStorefrontPort('customised').resolve('aicha-4821')!;
    const html = renderVitrineReady(r.storefront, r.trust, { fromProduct: false }, r.notes);
    // p1 & p5 tiles carry the play chip
    const chips = html.match(/data-action="voix-produit-play"/g) ?? [];
    expect(chips.length).toBeGreaterThanOrEqual(2);
    // …but the same render with NO notes has zero chips (no gap, no phantom)
    const bare = renderVitrineReady(r.storefront, r.trust, { fromProduct: false }, {});
    expect(bare).not.toContain('voix-produit-play');
  });
});

describe('integration — the product page shows the player only with a note', () => {
  it('renders the player when a ready voice rides the model, nothing without', () => {
    const withVoice = renderProductPage({
      productName: 'Robe brodée bogolan', resellerName: 'Chez Aïcha Mode', priceFcfa: 11_500, inStock: true, voice: READY,
    });
    expect(withVoice).toContain('voix-produit-play');
    const without = renderProductPage({
      productName: 'Robe brodée bogolan', resellerName: 'Chez Aïcha Mode', priceFcfa: 11_500, inStock: true,
    });
    expect(without).not.toContain('voix-produit-play');
  });

  it('SP-I03 stays intact — the voice affordance leaks no supplier / commission / net', () => {
    const html = renderProductPage({
      productName: 'Robe brodée bogolan', resellerName: 'Chez Aïcha Mode', priceFcfa: 11_500, inStock: true, voice: READY,
    });
    expect(html.toLowerCase()).not.toMatch(/fournisseur|supplier|commission|marge|markup|sellerbase|resellernet/);
  });
});
