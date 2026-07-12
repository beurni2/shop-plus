import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderLocationForm, OUAGA_ZONES, type LocationViewModel } from '../src/location-view';

/**
 * WO-4.4 — LOCATION CAPTURE. DESIGN-LANGUAGE §4 « Le repère, pas l'adresse » :
 * the DoD demands the NEGATIVE on the NEW form — no street-address field
 * EXISTS. Plus the masked relay (« Votre numéro reste privé ») and the
 * voice-note states as designed states.
 */

const BASE: LocationViewModel = {
  selectedZone: null,
  landmark: '',
  directions: '',
  phone: '',
  voice: { kind: 'idle' },
};

const render = (voice: LocationViewModel['voice'] = { kind: 'idle' }) =>
  renderLocationForm({ ...BASE, voice });

describe('§6.2 location capture — landmark-first, map-free', () => {
  it('NO street-address field exists on the form — negative proven on inputs AND source', () => {
    const html = render();
    // EVERY named element (input/textarea/select/whatever — verifier NB②:
    // the extraction binds any element carrying name=) is on the exact list.
    const names = [...html.matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(['repere', 'indications', 'telephone']);
    for (const name of names) {
      expect(name).not.toMatch(/adresse|address|rue|street|voie|avenue/i);
    }
    // No free-text element type beyond the three inputs exists at all.
    expect(html).not.toMatch(/<textarea|<select/);
    // The source declares no such field either.
    const source = readFileSync(join(import.meta.dirname, '../src/location-view.ts'), 'utf8');
    expect(source).not.toMatch(/name="(adresse|address|rue|street|voie|avenue)/i);
    // The copy never ASKS for an address (the one mention SAYS none is required).
    expect(html).toContain("pas d'adresse exigée");
  });

  it('model-derived values are HTML-escaped — an attribute-breakout payload never reaches the DOM raw (verifier NB①)', () => {
    const html = renderLocationForm({
      ...BASE,
      landmark: '"><img src=x onerror=alert(1)>',
      directions: "'/><script>bad()</script>",
      phone: '<b>70</b>',
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<b>70</b>');
    expect(html).toContain('&quot;&gt;&lt;img');
  });

  it('the zone picker is map-free chips over named Ouagadougou quartiers', () => {
    const html = render();
    for (const zone of OUAGA_ZONES) expect(html).toContain(`data-zone="${zone}"`);
    expect(html).not.toMatch(/map|carte|gps/i);
  });

  it('the masked relay is stated: « Votre numéro reste privé »', () => {
    expect(render()).toContain('Votre numéro reste privé');
  });

  it('voice note — idle offers recording; recording offers stop', () => {
    expect(render({ kind: 'idle' })).toContain('data-action="voix-enregistrer"');
    const rec = render({ kind: 'recording' });
    expect(rec).toContain('data-action="voix-arreter"');
    expect(rec).toContain('Enregistrement en cours…');
  });

  it('voice note — recorded offers playback AND re-record at EQUAL weight', () => {
    const html = render({ kind: 'recorded' });
    expect(html).toContain('data-action="voix-ecouter"');
    expect(html).toContain('data-action="voix-reprendre"');
    const equalActions = html.match(/class="action action-equal" data-action="voix-/g);
    expect(equalActions).toHaveLength(2);
    expect(html).toContain('data-role="voice-playback"');
  });

  it('voice note — queued is PENDING, never « envoyé » as done (honesty law)', () => {
    const html = render({ kind: 'queued' });
    expect(html).toContain('data-voice="queued"');
    expect(html).toContain('envoyée dès que le réseau revient');
    expect(html).toContain('status-pending');
    expect(html).not.toContain('status-ok');
  });

  it('mic refused and recorder-absent are designed states, never walls', () => {
    expect(render({ kind: 'unavailable', reasonKey: 'voix.micro_refuse' })).toContain(
      'continuez sans note vocale',
    );
    expect(render({ kind: 'unavailable', reasonKey: 'voix.indisponible' })).toContain(
      'continuez sans note',
    );
  });

  it('ONE primary action: continue', () => {
    const html = render();
    expect(html.match(/class="primary-action"/g)).toHaveLength(1);
  });
});
