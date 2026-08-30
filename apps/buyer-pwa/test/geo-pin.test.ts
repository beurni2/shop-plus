import { describe, expect, it } from 'vitest';
import { renderC3, type C3State } from '../src/cliente/screens';

/**
 * GEO-ACHAT-1 — the position block's four faces on C3. The render never sees
 * a coordinate (C3State carries only the face — the type is the proof), so
 * these tests hold the FACES to their words: the quiet offer, the search
 * under way, the kept pin with its consent sentence and its way out, and the
 * refusal that gates nothing. The driven proof on the live page — grant,
 * deny, retirer, and the pin's exact bytes on the order wire — is
 * e2e/checkout-real.spec.ts's GEO walk.
 */
const BASE: C3State = {
  zone: 'Gounghin', zoneFiltre: '', repere: 'Face à la pharmacie', indic: '',
  phone: '70 12 34 56', voice: 'idle', recTime: '0:00', geo: 'repos', canContinue: true,
};

describe('renderC3 — the position block (GEO-ACHAT-1)', () => {
  it('repos: one quiet offer, pressable, below the voice road', () => {
    const html = renderC3(BASE);
    expect(html).toContain('data-action="geo-demander"');
    expect(html).toContain('Ajouter ma position');
    // It belongs to « où livrer ? »: after the voice block, before her number.
    const geoAt = html.indexOf('geo-demander');
    expect(geoAt).toBeGreaterThan(html.indexOf('voix-demarrer'));
    expect(geoAt).toBeLessThan(html.indexOf('Votre numéro, pour la livraison'));
  });

  it('encours: the search is named, and the offer button is gone', () => {
    const html = renderC3({ ...BASE, geo: 'encours' });
    expect(html).toContain('data-role="geo-cours"');
    expect(html).toContain('Recherche de votre position…');
    expect(html).not.toContain('data-action="geo-demander"');
  });

  it('faite: the consent sentence rides the kept pin, and RETIRER is its way out', () => {
    const html = renderC3({ ...BASE, geo: 'faite' });
    expect(html).toContain('data-role="geo-done"');
    expect(html).toContain('Position ajoutée — partagée seulement avec votre livreur.');
    expect(html).toContain('data-action="geo-retirer"');
  });

  it('refus: honest, calm, and NEVER a gate — the CTA stays live', () => {
    const html = renderC3({ ...BASE, geo: 'refus' });
    expect(html).toContain('data-role="geo-refus"');
    expect(html).toContain('Position introuvable ici. Votre repère écrit suffit.');
    // The refusal face and a pressable « Continuer » coexist: the pin is
    // comfort, never a gate (the quartier-list law, applied to GPS).
    expect(html).toContain('data-action="continuer-c3"');
    expect(html).not.toContain('data-action="continuer-c3" disabled');
  });
});
