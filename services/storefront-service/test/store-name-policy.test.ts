import { describe, expect, it } from 'vitest';
import { refuseStoreName } from '../src/store-name-policy.js';
import { decideCreate, decideSaveIdentity, type StorefrontEntry } from '../src/storefront-core.js';

/**
 * NOM-BOUTIQUE-1 (SP5.2) — the store-name policy is DETERMINISTIC and NAMED:
 * the same name always earns the same reason, ordinary names pass, and each
 * refusal is a rule she can read. These pin the rule set the create and the
 * rename both apply (`decideCreate`, `decideSaveIdentity`, the router
 * pre-check) — the doors are proven on the real Worker in the e2e.
 */

describe('NOM-BOUTIQUE-1 — ordinary names pass', () => {
  it('accents, digits, ampersands, the verb « sera », words that merely CONTAIN a listed one', () => {
    for (const ok of [
      'Chez Aïcha', 'Ce sera chic', 'Concorde Mode', 'Confiance Mode', 'Boutique 2000', 'Mode & Co',
      'Faso Dan Fani', 'Chez Fati 3', 'La Séduction', 'Chez Bernard', 'Boutique du fondateur', 'Niquette',
      // The verifier's names: first names, a loaf, an English food word, two years, a newspaper.
      'Chez Séraphine', 'Séraphin Couture', 'Boulangerie Bâtard', 'Quick Bite', 'Collection 2024-2025', 'Le Télégramme',
    ]) {
      expect(refuseStoreName(ok), ok).toBeUndefined();
    }
  });
});

describe('NOM-BOUTIQUE-1 — the three named refusals', () => {
  it('a platform name is refused however it is cased, spaced or accented — « Séra » only WITH its accent', () => {
    for (const bad of [
      'Shop+ Officiel', 'SHOP PLUS Ouaga', 'shopplus', 'Boutik+ Fati', 'Boutik Plus', 'boutikplus', 'Séra Livraison', 'SÉRA express',
    ]) {
      expect(refuseStoreName(bad), bad).toBe('name_impersonates_platform');
    }
    expect(refuseStoreName('Ce sera chic'), 'the verb is not the platform').toBeUndefined();
  });

  it('a phone number, a link, a handle or a messaging app in the name is refused — four digits are still a name', () => {
    for (const bad of [
      'Fati 70 12 34 56', 'Fati 70.12.34.56', 'Chez Ali +226 70123456', 'Fati 70123456', 'www.chezfati.com', 'chezfati.bf', 'https://x.y',
      '@fati_mode', 'Fati WhatsApp', 'wa.me/22670', 'Fati Telegram',
    ]) {
      expect(refuseStoreName(bad), bad).toBe('name_carries_contact');
    }
    expect(refuseStoreName('Boutique 2000')).toBeUndefined();
    expect(refuseStoreName('Chez Fati 3')).toBeUndefined();
  });

  it('an insult is refused as a WHOLE word only, on the accent-stripped form', () => {
    for (const bad of ['Merde Mode', 'PUTAIN de bazin', 'fdp shop', 'Enculé Couture']) {
      expect(refuseStoreName(bad), bad).toBe('name_offensive');
    }
    for (const ok of ['Concorde', 'Confiance Mode', 'Niquette', 'Chic Couture']) {
      expect(refuseStoreName(ok), ok).toBeUndefined();
    }
  });

  it('the FIRST matching rule names the reason — platform before contact before words', () => {
    expect(refuseStoreName('Shop+ 70 12 34 56')).toBe('name_impersonates_platform');
    expect(refuseStoreName('merde www.x.com')).toBe('name_carries_contact');
  });
});

/**
 * THE TWO DOORS IN THE CORE ITSELF — the router pre-checks a create before the
 * slug claim, but the core is the authority every substrate shares (the
 * in-memory registry and the DO), so its own refusal must hold WITHOUT the
 * router: a create is refused before any parse, a rename after the bounds.
 */
describe('NOM-BOUTIQUE-1 — the core refuses at both doors, on its own', () => {
  const cmd = {
    commandId: 'c-1', id: 'sf-1', resellerId: 'rs-1', shortCode: 'FATI-0001',
    name: 'Chez Fati', zone: 'Ouagadougou', category: 'mode', correlationId: 'corr-1', at: '2026-09-17T08:00:00.000Z',
  };

  it('decideCreate: a refused name is `refused` with its reason, and NOTHING is written (no `next`)', () => {
    const r = decideCreate(undefined, { ...cmd, name: 'Shop+ Officiel' });
    expect(r.decision).toEqual({ status: 'refused', reason: 'name_impersonates_platform' });
    expect(r.next).toBeUndefined();
    const ok = decideCreate(undefined, cmd);
    expect(ok.decision.status).toBe('created');
  });

  it('decideCreate: a REPLAY of an existing shop stays idempotent — its name was judged when it was created', () => {
    const created = decideCreate(undefined, cmd);
    const replay = decideCreate(created.next, { ...cmd, name: 'Merde Mode' });
    expect(replay.decision.status).toBe('idempotent');
  });

  it('decideSaveIdentity: a refused rename is `refused` with its reason, after the bounds, and writes nothing', () => {
    const entry = decideCreate(undefined, cmd).next as StorefrontEntry;
    for (const [name, reason] of [
      ['Awa 70 12 34 56', 'name_carries_contact'],
      ['Merde Mode', 'name_offensive'],
      ['Boutik Plus Awa', 'name_impersonates_platform'],
      ['ab', 'name_too_short'],
    ] as const) {
      const r = decideSaveIdentity(entry, { name }, '2026-09-17T09:00:00.000Z');
      expect(r.decision, name).toEqual({ status: 'refused', reason });
      expect(r.next, name).toBeUndefined();
    }
    const ok = decideSaveIdentity(entry, { name: 'Chez Awa' }, '2026-09-17T09:00:00.000Z');
    expect(ok.decision.status).toBe('saved');
  });
});
