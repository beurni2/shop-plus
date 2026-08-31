import { describe, expect, it } from 'vitest';
import { renderC3, renderC4, renderGeoCarte, type C3State } from '../src/cliente/screens';
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
  zone: 'Gounghin', zoneFiltre: '', zoneEdition: false, repere: 'Face à la pharmacie',
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

  it('the reference anatomy (GEO-CARTE-PRO): full-bleed view, fixed pin, the pill instruction, floating annuler + recentre, the live coordinates, one confirm', () => {
    // The face is a TOP layer the flow paints BESIDE the screen (inside
    // `.cl-screen` its entry animation's transform would capture the
    // position:fixed — driven red on the real build), so the walk composes
    // the two exactly as the flow does.
    const carte = renderGeoCarte(CARTE, CARTE.carte!);
    expect(renderC3(CARTE)).not.toContain('data-role="geo-carte"');
    expect(carte).toContain('data-role="geo-carte"');
    // The view she drags: the tile layer, the centre pin, the one instruction.
    expect(carte).toContain('data-role="geo-vue"');
    expect(carte).toContain('data-role="geo-tuiles"');
    expect(carte).toContain('cl-geo-epingle');
    expect(carte).toContain('Déplacez la carte pour placer le point');
    // Floating chrome: the × way out and the viseur back to her fix.
    expect(carte).toContain('data-action="geo-carte-annuler"');
    expect(carte).toContain('aria-label="Annuler"');
    expect(carte).toContain('data-action="geo-recentrer"');
    expect(carte).toContain('aria-label="Revenir à ma position"');
    // The sheet: the candidate's coordinates spoken (five decimals), one
    // primary confirm in the reference's own words.
    expect(carte).toContain('data-role="geo-coords"');
    expect(carte).toContain('12.37153, -1.51993');
    expect(carte).toContain('data-action="geo-confirmer"');
    expect(carte).toContain('Confirmer ce lieu');
    // The tiles are OSM's raster, never the retired embed; their credit rides.
    expect(carte).toContain('© OpenStreetMap');
    expect(carte).not.toContain('openstreetmap.org/export/embed.html');
    expect(carte).not.toContain('<iframe');
  });

  it('her quartier and repère live IN the sheet while the face stands — each role exactly once across screen + face, in BOTH quartier states', () => {
    // QUARTIER-CHOISI — with a zone chosen the sheet carries the FOLDED row,
    // not the picker; without one it carries the picker. Either way each
    // role exists exactly once, so the standing handlers never find a twin.
    const carteChoisi = renderGeoCarte(CARTE, CARTE.carte!);
    const choisi = renderC3(CARTE) + carteChoisi;
    expect(carteChoisi).toContain('data-role="zone-choisie"');
    expect(carteChoisi).toContain('data-role="repere"');
    for (const role of ['data-role="zone-choisie"', 'data-role="repere"']) {
      expect(choisi.split(role).length - 1).toBe(1);
    }
    expect(choisi).not.toContain('data-role="quartier-filtre"');

    const SANS_ZONE: C3State = { ...CARTE, zone: null };
    const carteSans = renderGeoCarte(SANS_ZONE, SANS_ZONE.carte!);
    const sans = renderC3(SANS_ZONE) + carteSans;
    expect(carteSans).toContain('data-role="quartier-filtre"');
    expect(carteSans).toContain('data-role="quartier-chips"');
    for (const role of ['data-role="quartier-filtre"', 'data-role="quartier-chips"', 'data-role="repere"']) {
      expect(sans.split(role).length - 1).toBe(1);
    }
    // And with the face down, the same blocks stand in the body as before.
    const repos = renderC3({ ...BASE, zone: null });
    for (const role of ['data-role="quartier-filtre"', 'data-role="quartier-chips"', 'data-role="repere"']) {
      expect(repos.split(role).length - 1).toBe(1);
    }
  });

  it('behind the overlay the block keeps the searching face — never a kept pin she has not confirmed', () => {
    const html = renderC3(CARTE);
    expect(html).toContain('data-role="geo-cours"');
    expect(html).not.toContain('data-role="geo-done"');
  });

  it('no candidate, no carte — and the address blocks stay in the BODY when the face has nothing to paint on', () => {
    // The flow's layer guard requires a candidate; renderC3's own duty here
    // is to keep her quartier/repère reachable when the overlay cannot open
    // (the folded row for her chosen zone, the picker without one).
    const html = renderC3({ ...BASE, geo: 'carte', carte: null });
    expect(html).not.toContain('data-role="geo-carte"');
    expect(html).toContain('data-role="zone-choisie"');
    expect(html).toContain('data-role="repere"');
    const sans = renderC3({ ...BASE, zone: null, geo: 'carte', carte: null });
    expect(sans).toContain('data-role="quartier-filtre"');
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
