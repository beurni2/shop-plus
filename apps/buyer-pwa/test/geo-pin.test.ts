import { describe, expect, it } from 'vitest';
import { renderC3, renderC4, type C3State } from '../src/cliente/screens';
import { composeQuote, ROBE } from '../src/cliente/seed';

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
  zone: 'Gounghin', zoneFiltre: '', repere: 'Face à la pharmacie',
  phone: '70 12 34 56', voice: 'idle', recTime: '0:00', geo: 'repos', carte: null, canContinue: true,
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

describe('renderC3 — the carte face (GEO-ACHAT-2)', () => {
  const CARTE: C3State = { ...BASE, geo: 'carte', carte: { lat: 12.371532, lng: -1.519931 } };

  it('the map asks HER question: the app\'s own header, the map a framed card, one confirm, the back chevron as the way out', () => {
    const html = renderC3(CARTE);
    expect(html).toContain('data-role="geo-carte"');
    // Founder amendment: NOT a chromeless full screen — the stepHead anatomy
    // every C-step carries, with the annuler road on its back chevron.
    const carte = html.slice(html.indexOf('data-role="geo-carte"'));
    expect(carte).toContain('cl-stephead');
    expect(carte).toContain('cl-steptitle');
    expect(carte).toContain('Votre position');
    // The frame is OpenStreetMap's own embed, centred on the CANDIDATE —
    // marker=lat,lng carries her exact fix, nothing else does.
    expect(html).toContain('openstreetmap.org/export/embed.html');
    expect(html).toContain('marker=12.371532%2C-1.519931');
    expect(html).toContain('data-action="geo-confirmer"');
    expect(html).toContain('Confirmer ma position');
    expect(carte).toContain('data-action="geo-carte-annuler"');
    expect(carte).toContain('aria-label="Annuler"');
  });

  it('behind the overlay the block keeps the searching face — never a kept pin she has not confirmed', () => {
    const html = renderC3(CARTE);
    expect(html).toContain('data-role="geo-cours"');
    expect(html).not.toContain('data-role="geo-done"');
  });

  it('no candidate, no carte: the overlay cannot paint on coordinates it does not have', () => {
    const html = renderC3({ ...BASE, geo: 'carte', carte: null });
    expect(html).not.toContain('data-role="geo-carte"');
  });
});

describe('the phone-only road (GEO-ACHAT-2)', () => {
  it('faite says what-happens-next: the number is the only requirement now', () => {
    const html = renderC3({ ...BASE, geo: 'faite' });
    expect(html).toContain('data-role="geo-allege"');
    expect(html).toContain('Votre numéro suffit pour continuer.');
  });

  it('« Indication en plus » is GONE — completely (founder, 2026-08-31)', () => {
    const html = renderC3(BASE);
    expect(html).not.toContain('Indication en plus');
    expect(html).not.toContain('data-role="indic"');
  });

  it('the C4 récap on the pin road says the truth, never a fabricated quartier', () => {
    const q = composeQuote(ROBE.priceFcfa);
    const html = renderC4(q, { zone: '', repereRecap: '', positionGps: true, delivery: 'today' });
    expect(html).toContain('data-role="recap-gps"');
    expect(html).toContain('VOTRE POSITION GPS');
    expect(html).toContain('Partagée seulement avec votre livreur.');
    expect(html).not.toContain('GOUNGHIN');
  });
});
