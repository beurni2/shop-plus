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
import { seedProduct } from '../src/vitrine/catalog';

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

describe('the demo port carries a ready note for EVERY curated product (founder order 2026-07-22)', () => {
  it('each pid in the storefront’s curatedItems resolves to a ready, playable note', async () => {
    const r = (await demoStorefrontPort('customised').resolve('aicha-4821'))!;
    // The founder retired the « exactly p1 & p5 » demo: « la voix d’Aïcha »
    // rides every product she curated, so a shared link on ANY of them opens
    // C1 with the player present.
    for (const pid of r.storefront.curatedItems) {
      expect(r.notes[pid]?.status, `${pid} must carry a ready note`).toBe('ready');
      expect(isPlayable(r.notes[pid]), `${pid} note must be playable`).toBe(true);
    }
  });

  it('the empty (day-1) variant carries no notes', async () => {
    const r = (await demoStorefrontPort('empty').resolve('aicha-4821'))!;
    expect(Object.keys(r.notes)).toHaveLength(0);
  });
});

describe('integration — the chip appears on a noted tile, never on a note-less one', () => {
  it('renderVitrineReady shows a voice chip on every in-stock noted render, none when notes are absent', async () => {
    const r = (await demoStorefrontPort('customised').resolve('aicha-4821'))!;
    const html = renderVitrineReady(r.storefront, r.trust, { fromProduct: false }, r.notes);
    const chips = html.match(/data-action="voix-produit-play"/g) ?? [];
    // A chip fires for every IN-STOCK render of a noted product: each in-stock
    // featured tile (pinned « à la une ») PLUS each in-stock curated grid tile.
    // An épuisé product carries a note but renders no chip (honesty §6), so we
    // derive the expected count from the catalog's stock, never a magic number.
    const inStock = (pid: string): boolean => seedProduct(pid)?.inStock === true;
    const featuredChips = r.storefront.featuredItems.filter(inStock).length;
    const gridChips = r.storefront.curatedItems.filter(inStock).length;
    expect(chips.length).toBe(featuredChips + gridChips);
    // …but the same render with NO notes has zero chips (no gap, no phantom)
    const bare = renderVitrineReady(r.storefront, r.trust, { fromProduct: false }, {});
    expect(bare).not.toContain('voix-produit-play');
  });
});

