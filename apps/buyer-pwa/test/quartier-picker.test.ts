import { describe, expect, it } from 'vitest';
import { renderC3, renderQuartierChips } from '../src/cliente/screens';
import { QUARTIERS_OUAGADOUGOU } from '../src/cliente/quartiers-ouagadougou';

/**
 * QUARTIERS-OUAGA-1 — the C3 picker over the official list: complete when
 * untouched, narrowed as she types, and NEVER a dead end (her typed text
 * becomes choosable when the répertoire has no match). The driven proof of
 * the same behavior on the live page is e2e/checkout-real.spec.ts.
 */
const BASE = {
  zone: null, zoneFiltre: '', zoneEdition: false, repere: '', phone: '',
  voice: 'idle' as const, recTime: '0:00', geo: 'repos' as const, carte: null, canContinue: false,
};

describe('renderC3 — the quartier block', () => {
  it('carries the filter field and the FULL official list when the filter is empty', () => {
    const html = renderC3(BASE);
    expect(html).toContain('data-role="quartier-filtre"');
    expect(html).toContain('Votre quartier');
    for (const q of ['Rimkiéta', 'Ouaga 2000', 'Bissighin', 'Kossyam', 'Gounghin']) {
      expect(html).toContain(`data-zone="${q}"`);
    }
    expect((html.match(/data-action="zone"/g) ?? []).length).toBe(QUARTIERS_OUAGADOUGOU.length);
  });

  it('the selected quartier renders pressed, and survives a filter that no longer matches it', () => {
    const html = renderQuartierChips('Somgandé', 'pissy');
    expect(html).toContain('cl-chip-on');
    expect(html).toContain('data-zone="Somgandé"'); // the choice stays visible
    expect(html).toContain('data-zone="Pissy"');
  });

  it('typing narrows accent- and case-insensitively', () => {
    const html = renderQuartierChips(null, 'rimkieta');
    expect(html).toContain('data-zone="Rimkiéta"');
    expect((html.match(/data-action="zone"/g) ?? []).length).toBe(1);
  });

  it('QUARTIER-CHOISI — a chosen quartier FOLDS the picker: one row, her name, CHANGER — no field, no cloud', () => {
    const html = renderC3({ ...BASE, zone: 'Rimkiéta' });
    expect(html).toContain('data-role="zone-choisie"');
    expect(html).toContain('Rimkiéta');
    expect(html).toContain('data-action="zone-changer"');
    expect(html).toContain('CHANGER');
    // The section disappears, as ordered: no search field, no chip cloud.
    expect(html).not.toContain('data-role="quartier-filtre"');
    expect(html).not.toContain('data-role="quartier-chips"');
    expect(html).not.toContain('Chercher votre quartier');
    // The overline stays — the row still answers « Votre quartier ».
    expect(html).toContain('Votre quartier');
    // Her name is escaped in the row like everywhere else.
    const hostile = renderC3({ ...BASE, zone: '<img src=x>' });
    expect(hostile).not.toContain('<img src=x>');
  });

  it('QUARTIER-CHOISI — CHANGER reopens the picker with her chip still pressed', () => {
    const html = renderC3({ ...BASE, zone: 'Rimkiéta', zoneEdition: true });
    expect(html).toContain('data-role="quartier-filtre"');
    expect(html).toContain('data-role="quartier-chips"');
    expect(html).not.toContain('data-role="zone-choisie"');
    // The choice already made is never lost: her chip renders pressed.
    expect(html).toContain(`cl-chip cl-chip-on" data-action="zone" data-zone="Rimkiéta"`);
  });

  it('NO MATCH is never a dead end: her typed text is offered as the chip, escaped', () => {
    const html = renderQuartierChips(null, 'Tanghin-Dassouri');
    expect(html).toContain('Utiliser « Tanghin-Dassouri »');
    expect(html).toContain('data-zone="Tanghin-Dassouri"');
    const hostile = renderQuartierChips(null, '<img src=x onerror=alert(1)>');
    expect(hostile).not.toContain('<img');
    // ATTRIBUTE context too (verifier note): her text also lands inside
    // data-zone="…", so a raw double quote must never survive to break out.
    const guillemet = renderQuartierChips(null, '" onmouseover="alert(1)');
    expect(guillemet).not.toContain('"" onmouseover=');
    expect(guillemet).toContain('&quot;');
  });
});
