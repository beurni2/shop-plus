import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderProtections } from '../src/protections-view';
import { renderAudioNote, AUDIO_NOTE_ASSETS } from '../src/audio-note';
import { renderCheckoutOptions } from '../src/checkout-view';
import { CHECKOUT_ICON_NAMES } from '../src/icons';

const appDir = join(import.meta.dirname, '..');

/**
 * WO-4.4 — « Vos protections » (§6.3) + the carried §6.1 checkout items
 * (lock/scooter icons paired with text; per-option audio note with an HONEST
 * placeholder while the founder recording is pending).
 */

describe('§6.3 — « Vos protections », calm and compact', () => {
  const html = renderProtections();

  it('states the rights: verify first, dignified refusal, protected payment, honest fee rule, the code as proof, no cash, private number', () => {
    expect(html).toContain('Vos protections');
    expect(html).toContain('vérifiez d\'abord');
    expect(html).toContain('Vous refusez, vous êtes remboursé.');
    expect(html).toContain('protégé chez notre partenaire de paiement');
    expect(html).toContain('les frais de livraison ne sont pas remboursés');
    expect(html).toContain('Le code de livraison est votre preuve.');
    expect(html).toContain("Jamais d'argent liquide au livreur.");
    expect(html).toContain('Votre numéro reste privé');
  });

  it('every protection string is register:money (calm, never marketing)', () => {
    const catalog = JSON.parse(readFileSync(join(appDir, 'i18n/catalog.json'), 'utf8')) as Array<{
      key: string;
      register: string;
    }>;
    const rows = catalog.filter((e) => e.key.startsWith('protections.') && e.key !== 'protections.fermer');
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const row of rows) expect(row.register, row.key).toBe('money');
  });

  it('closes with one action — a sheet, never a wall', () => {
    expect(html).toContain('data-action="protections-fermer"');
    expect(html.match(/class="primary-action"/g)).toHaveLength(1);
  });
});

describe('carried §6.1 — icons and audio notes on the two-option checkout', () => {
  const html = renderCheckoutOptions({
    buyerTotalFcfa: 12_500,
    optionA: { payNowFcfa: 12_500, dueAtDoorFcfa: 0 },
    optionB: { available: true, payNowFcfa: 1_000, dueAtDoorFcfa: 11_500 },
  });

  it('the lock rides Option A and the scooter rides Option B — icons paired with the titles', () => {
    expect(CHECKOUT_ICON_NAMES).toEqual({ optionA: 'cadenas', optionB: 'moto' });
    expect(html).toContain('data-icon="cadenas"');
    expect(html).toContain('data-icon="moto"');
    // paired with text, never alone: the icon slot sits inside the h3 title
    expect(html).toMatch(/<h3><span class="option-icon-slot" data-icon="cadenas">.*?<\/span>Tout payer maintenant/);
  });

  it('icons draw ONLY from token custom properties — currentColor stroke, var-sized (import + source asserted)', () => {
    const source = readFileSync(join(appDir, 'src/icons.ts'), 'utf8');
    expect(source).toContain('stroke="currentColor"');
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // The <svg> root carries NO size attributes — sizing is the CSS var
    // (inner rect/circle geometry lives in viewBox units, not px).
    const svgTag = source.match(/<svg[^>]*>/)?.[0] ?? '';
    expect(svgTag).not.toMatch(/(?<![\w-])(width|height)=/); // stroke-width is a stroke style, not a size
    expect(svgTag).toContain('class="option-icon"');
  });

  it('per-option audio note: founder asset PENDING → the honest placeholder shows on both options', () => {
    expect(AUDIO_NOTE_ASSETS.checkout_option_a).toBeNull();
    expect(AUDIO_NOTE_ASSETS.checkout_option_b).toBeNull();
    expect(html).toContain('data-audio-slot="checkout_option_a"');
    expect(html).toContain('data-audio-slot="checkout_option_b"');
    const placeholders = html.match(/La note vocale arrive bientôt\./g);
    expect(placeholders).toHaveLength(2);
    expect(html.match(/audio-note-pending/g)).toHaveLength(2);
  });

  it('a filled slot renders a real player for RECORDED audio (never synthesized — the slot doc says so)', () => {
    const source = readFileSync(join(appDir, 'src/audio-note.ts'), 'utf8');
    expect(source).toContain('NEVER point these at generated speech');
    expect(renderAudioNote('checkout_option_a')).toContain('audio-note-pending'); // pending today
    expect(source).toContain('<audio controls'); // the player exists for the day the asset lands
  });
});
