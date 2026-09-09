import { describe, expect, it } from 'vitest';
import { hrefDeRoute, renderRacine, routeDepuisLien } from '../src/racine-view';
import { deployBaseFromPath } from '../src/vitrine-link';

/**
 * RACINE-HONNETE-1 (AUDIT-SHOP-2 F-19, F-63) — the honest front door, at the
 * unit level: the parser accepts exactly the two link forms the system emits
 * (and the bare slug), refuses everything else, and every href it builds is
 * base-aware. The card itself is driven for real in e2e/racine.spec.ts.
 */

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'; // a 32-char liste token

describe('routeDepuisLien — what she pastes', () => {
  it('a full /v/ address, in any case, with quotes and spaces around it', () => {
    expect(routeDepuisLien('https://beurni2.github.io/shop-plus/v/aicha-4821')).toEqual({ kind: 'vitrine', slug: 'aicha-4821' });
    expect(routeDepuisLien('  « https://beurni2.github.io/shop-plus/V/AICHA-4821 »  ')).toEqual({ kind: 'vitrine', slug: 'aicha-4821' });
    expect(routeDepuisLien('http://127.0.0.1:4173/v/aicha-4821/')).toEqual({ kind: 'vitrine', slug: 'aicha-4821' });
  });

  it('a bare path and a bare slug', () => {
    expect(routeDepuisLien('/shop-plus/v/mariam-2170')).toEqual({ kind: 'vitrine', slug: 'mariam-2170' });
    expect(routeDepuisLien('/v/mariam-2170')).toEqual({ kind: 'vitrine', slug: 'mariam-2170' });
    expect(routeDepuisLien('Mariam-2170')).toEqual({ kind: 'vitrine', slug: 'mariam-2170' });
  });

  it('the signed offer link keeps its pid; a shared liste keeps its token bytes', () => {
    expect(routeDepuisLien('https://beurni2.github.io/shop-plus/s/aicha-4821?pid=p2')).toEqual({ kind: 'offre', slug: 'aicha-4821', pid: 'p2' });
    expect(routeDepuisLien('/s/aicha-4821')).toEqual({ kind: 'offre', slug: 'aicha-4821' });
    expect(routeDepuisLien(`/shop-plus/v/aicha-4821?liste=${TOKEN}`)).toEqual({ kind: 'vitrine', slug: 'aicha-4821', liste: TOKEN });
    // a mangled token is dropped, never carried: the plain boutique opens
    expect(routeDepuisLien('/v/aicha-4821?liste=court')).toEqual({ kind: 'vitrine', slug: 'aicha-4821' });
  });

  it('refuses what is not a Shop+ link — never a navigation to nowhere', () => {
    for (const texte of ['', '   ', 'https://wa.me/22670000000', 'https://beurni2.github.io/shop-plus/', '/boutiques', 'chez aïcha', 'javascript:alert(1)', 'http://[::1', '/v/', '/x/aicha-4821']) {
      expect(routeDepuisLien(texte), texte).toBeUndefined();
    }
  });
});

describe('hrefDeRoute — base-aware, the ONE link form', () => {
  it('lands under the deploy base the current route carries', () => {
    expect(hrefDeRoute({ kind: 'vitrine', slug: 'aicha-4821' }, '/shop-plus/')).toBe('/shop-plus/v/aicha-4821');
    expect(hrefDeRoute({ kind: 'vitrine', slug: 'aicha-4821' }, '/')).toBe('/v/aicha-4821');
    expect(hrefDeRoute({ kind: 'vitrine', slug: 'aicha-4821', liste: TOKEN }, '/shop-plus/')).toBe(`/shop-plus/v/aicha-4821?liste=${TOKEN}`);
    expect(hrefDeRoute({ kind: 'offre', slug: 'aicha-4821', pid: 'p2' }, '/shop-plus/')).toBe('/shop-plus/s/aicha-4821?pid=p2');
    expect(hrefDeRoute({ kind: 'offre', slug: 'aicha-4821' }, '/')).toBe('/s/aicha-4821');
  });

  it('the retired /boutiques path is stripped like an app route, so the base never absorbs it', () => {
    expect(deployBaseFromPath('/shop-plus/boutiques')).toBe('/shop-plus');
    expect(deployBaseFromPath('/boutiques')).toBe('');
    expect(deployBaseFromPath('/shop-plus/')).toBe('/shop-plus');
  });
});

describe('renderRacine — one sentence, one field, one act; offline is a designed state', () => {
  it('carries the field with a label, the ONE primary action, and the refusal hidden until earned', () => {
    const html = renderRacine({ enLigne: true });
    expect(html).toContain('data-screen="racine"');
    expect(html).toMatch(/<label class="field"><span class="field-label">Le lien de la boutique<\/span>/);
    expect(html).toMatch(/data-role="racine-lien"[^>]*aria-describedby="racine-refus"/);
    expect(html).toContain('data-action="racine-ouvrir"');
    expect(html.match(/class="primary-action"/g)).toHaveLength(1);
    expect(html).toMatch(/data-role="racine-refus" role="alert" hidden/);
    expect(html).toContain('Votre vendeuse vous a envoyé un lien ?');
    expect(html).not.toContain('data-role="offline"');
    // no invented seller, no fabricated count, no franc figure on the front door
    expect(html).not.toMatch(/CHEZ |ventes livrées|\d[\d ]*F(?:CFA)?\b/);
  });

  it('offline paints the ink band and keeps the field — a pasted link still opens the boutique\'s own offline card', () => {
    const html = renderRacine({ enLigne: false });
    expect(html).toMatch(/data-role="offline">Pas de réseau pour le moment\./);
    expect(html).toContain('data-role="racine-lien"');
    expect(html).toContain('data-action="racine-ouvrir"');
  });
});
