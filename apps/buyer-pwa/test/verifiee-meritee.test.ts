import { beforeAll, describe, expect, it } from 'vitest';
import { renderC1, type ClienteProduit } from '../src/cliente/screens';
import { renderArticles, renderPorteTete, type BoutiqueCompte } from '../src/compte/ecrans';
import { ENTETE_KEYS, renderEntete } from '../src/vitrine/entetes';
import { loadAllEntetes } from '../src/vitrine/entetes/registry';

/**
 * ═══ VERIFIEE-MERITEE-1 — « Vendeuse vérifiée » is EARNED by a delivery
 * (founder ruling 2026-10-02, « Earned by a delivery »; canon 3.27.0 §4.1) ═══
 *
 * « La mention, et toute marque de vérification de la revendeuse sur ses
 * pages, n'apparaît qu'une fois que Séra a livré au moins une de ses ventes
 * (le compte « N ventes livrées », SP8). Tant que ce compte est nul ou
 * inconnu, ses pages ne disent rien de tel. »
 *
 * Every surface that drew the mention or a vérifiée tick is rendered here and
 * its OUTPUT read: every boutique header style the service can name, the
 * product page, the account door and the account's boutique cards. Three
 * states each — no delivery, a count the service did not give, one delivery.
 * The claim this file makes is about WORDS AND MARKUP, never appearance.
 */

const SF = {
  id: 'sf-vm', resellerId: 'rs-vm', slug: 'awa-1001',
  name: 'Chez Awa', zone: 'Gounghin, Ouagadougou', category: 'Général',
  tagline: 'Bienvenue', bio: 'Du bon tissu.', theme: 'foret' as const,
  cover: { status: 'none' as const }, avatar: { mode: 'monogram' as const },
  curatedItems: ['pv-1'], featuredItems: [], sections: [],
  discoverable: true, createdAt: 'T', updatedAt: 'T',
};

const ZERO = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };
const INCONNU = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false, inconnu: true };
const UNE = { deliveredCount: 1, rating: '', reviewCount: 0, demo: false };

const MENTION = 'Vendeuse vérifiée';
/** Every vérifiée tick, seal, badge and chip the headers draw, by class. */
const MARQUE = /class="[^"]*\b(vt-rosette|vt-avatar-badge|[a-z]{2}-av-badge|[a-z]{2}-seal|[a-z]{2}-med-b|[a-z]{2}-verif|he-chip-v|ti-coche)\b/;
const visible = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

beforeAll(async () => {
  await loadAllEntetes();
});

describe('every boutique header — the mention and every vérifiée mark only after a delivery', () => {
  for (const key of ENTETE_KEYS) {
    for (const compact of [false, true]) {
      it(`${key}${compact ? ' (compact)' : ''}: none at 0, none when the count is unknown, the mention at 1`, () => {
        for (const [etat, trust] of [['0', ZERO], ['inconnu', INCONNU]] as const) {
          const html = renderEntete(key, SF as never, trust as never, { compact });
          expect(visible(html), `${key} ${etat}: the mention`).not.toContain(MENTION);
          expect(html.match(MARQUE)?.[0] ?? null, `${key} ${etat}: a vérifiée mark`).toBeNull();
          expect(visible(html), `${key} ${etat}: her zone still shows`).toContain('Gounghin');
        }
        const gagne = renderEntete(key, SF as never, UNE as never, { compact });
        expect(visible(gagne), `${key}: earned, the mention shows`).toContain(MENTION);
      });
    }
  }
});

const PRODUIT: ClienteProduit = {
  shopName: 'Chez Awa', prenom: 'Awa', slug: 'awa-1001', productName: 'Bazin riche',
  zone: 'Gounghin', priceFcfa: 12_000, assetRefs: [], inStock: true,
};

describe('the product page — the mention only after a delivery; « Voir la boutique » always', () => {
  it('not earned (absent or false): no mention, no tick; the way to her boutique stays', () => {
    for (const m of [PRODUIT, { ...PRODUIT, verifiee: false }]) {
      const html = renderC1(m, { epuise: false, sansVoix: true });
      expect(visible(html)).not.toContain(MENTION);
      expect(html).not.toContain('cl-veri-check');
      expect(html).toContain('data-action="voir-boutique"');
    }
  });
  it('earned: the mention and its tick', () => {
    const html = renderC1({ ...PRODUIT, verifiee: true }, { epuise: false, sansVoix: true });
    expect(visible(html)).toContain(MENTION);
    expect(html).toContain('cl-veri-check');
  });
});

const BOUTIQUE: BoutiqueCompte = { nom: 'Chez Awa', lieu: 'Gounghin', theme: 'foret', produits: [{ pid: 'pv-1', nom: 'Bazin riche', disponible: true }] };

describe('« Mon compte » — the door and the boutique cards say it only after a delivery', () => {
  it('the door: no mention and no tick unless earned; her city stays', () => {
    for (const b of [BOUTIQUE, { ...BOUTIQUE, verifiee: false }]) {
      const html = renderPorteTete(b);
      expect(visible(html)).not.toContain(MENTION);
      expect(html).not.toContain('porte-avatar-bulle');
      expect(visible(html)).toContain('Gounghin');
    }
    const gagne = renderPorteTete({ ...BOUTIQUE, verifiee: true });
    expect(visible(gagne)).toContain(MENTION);
    expect(gagne).toContain('porte-avatar-bulle');
  });
  it('a boutique card: no mention unless earned; her city stays', () => {
    const groupes = [{ slug: 'awa-1001', pids: ['pv-1'] }];
    const carte = (b: BoutiqueCompte): string =>
      renderArticles('panier', { groupes, boutiques: new Map([['awa-1001', b]]) } as never);
    expect(visible(carte(BOUTIQUE))).not.toContain(MENTION);
    expect(visible(carte(BOUTIQUE))).toContain('Gounghin');
    expect(visible(carte({ ...BOUTIQUE, verifiee: true }))).toContain(MENTION);
  });
});
