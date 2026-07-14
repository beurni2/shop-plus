import { describe, expect, it } from 'vitest';
import { StorefrontSchema } from '@platform/contracts';
import {
  StorefrontRegistry,
  StorefrontShortCodeError,
  type CreateStorefrontCommand,
} from '../src/storefront-aggregate.js';

/**
 * SP#001-A — the storefront aggregate obeys its command law. The four RED-first
 * fixtures: create-idempotent-on-command_id · collision-refused-surfaced ·
 * publish-toggle-emits-once · shortcode-shape-enforced. Plus SELLER #001 created
 * through the REAL command path (never seeded), and `updatedAt` moving ONLY on a
 * real change (the directory ordering truth).
 */

const T0 = '2026-07-14T08:00:00.000Z';
const T1 = '2026-07-14T09:00:00.000Z';
const T2 = '2026-07-14T10:00:00.000Z';

// SELLER #001 — the founder's store, created THROUGH the command (not seeded).
// name/zone/category are the command's onboarding INPUT (founder-supplied in
// production); the fixture proves the real create path, not baked canon values.
const SELLER_001: CreateStorefrontCommand = {
  commandId: 'cmd-seller001-create',
  id: 'sf-seller-0001',
  resellerId: 'rs-seller-0001',
  shortCode: 'SELLER-0001',
  name: 'Boutique du fondateur',
  zone: 'Ouagadougou',
  category: 'Général',
  correlationId: 'corr-001',
  at: T0,
};

describe('storefront aggregate — SELLER #001 through the real command path', () => {
  it('create builds a canon Storefront (slug DERIVED from the short code, discoverable=false) and emits storefront.created.v1', () => {
    const reg = new StorefrontRegistry();
    const out = reg.create(SELLER_001);
    expect(out.status).toBe('created');
    if (out.status !== 'created') return;
    // the stored shape IS the canon shape, verbatim
    expect(() => StorefrontSchema.parse(out.storefront)).not.toThrow();
    expect(out.storefront.slug).toBe('seller-0001'); // derived from SELLER-0001
    expect(out.storefront.discoverable).toBe(false); // created unpublished
    expect(out.storefront.createdAt).toBe(T0);
    expect(out.storefront.updatedAt).toBe(T0);
    expect(out.event.name).toBe('storefront.created.v1');
    expect(out.event.payload['slug']).toBe('seller-0001');
    expect(out.event.payload['reseller_id']).toBe('rs-seller-0001');
  });

  it('CREATE-IDEMPOTENT-ON-COMMAND_ID: the same create command returns the same identity, no re-create', () => {
    const reg = new StorefrontRegistry();
    reg.create(SELLER_001);
    const replay = reg.create(SELLER_001);
    expect(replay.status).toBe('idempotent');
    if (replay.status === 'idempotent') expect(replay.storefront.id).toBe('sf-seller-0001');
    // still exactly one storefront, unchanged
    expect(reg.get('sf-seller-0001')?.updatedAt).toBe(T0);
  });

  it('COLLISION-REFUSED-SURFACED: a DIFFERENT command_id on an existing storefront is refused, the existing returned', () => {
    const reg = new StorefrontRegistry();
    reg.create(SELLER_001);
    const collision = reg.create({ ...SELLER_001, commandId: 'cmd-different', name: 'Autre nom' });
    expect(collision.status).toBe('collision');
    if (collision.status === 'collision') {
      expect(collision.existing.name).toBe('Boutique du fondateur'); // NEVER overwritten
      expect(collision.existing.id).toBe('sf-seller-0001');
    }
    expect(reg.get('sf-seller-0001')?.name).toBe('Boutique du fondateur');
  });

  it('SHORTCODE-SHAPE-ENFORCED: an invalid short code is refused at create (never a malformed slug)', () => {
    const reg = new StorefrontRegistry();
    expect(() => reg.create({ ...SELLER_001, id: 'sf-bad', shortCode: 'seller-1' })).toThrow(StorefrontShortCodeError);
    expect(() => reg.create({ ...SELLER_001, id: 'sf-bad2', shortCode: 'X' })).toThrow(StorefrontShortCodeError);
    expect(reg.get('sf-bad')).toBeUndefined();
  });
});

describe('publish / unpublish — the discoverable toggle, updatedAt on real change only', () => {
  it('PUBLISH-TOGGLE-EMITS-ONCE: publish fires storefront.published.v1 once; a repeat publish is a no-op (no event, updatedAt frozen)', () => {
    const reg = new StorefrontRegistry();
    reg.create(SELLER_001);

    const pub = reg.publish({ id: 'sf-seller-0001', correlationId: 'corr-001', at: T1 });
    expect(pub.status).toBe('changed');
    if (pub.status === 'changed') {
      expect(pub.storefront.discoverable).toBe(true);
      expect(pub.storefront.updatedAt).toBe(T1); // real change → updatedAt moves
      expect(pub.event.name).toBe('storefront.published.v1');
      expect(pub.event.payload['discoverable']).toBe(true);
    }

    const again = reg.publish({ id: 'sf-seller-0001', correlationId: 'corr-001', at: T2 });
    expect(again.status).toBe('unchanged'); // already discoverable → NO second event
    expect(reg.get('sf-seller-0001')?.updatedAt).toBe(T1); // updatedAt did NOT move on the no-op
  });

  it('unpublish is the same toggle in reverse — one event on the real change, discoverable=false', () => {
    const reg = new StorefrontRegistry();
    reg.create(SELLER_001);
    reg.publish({ id: 'sf-seller-0001', correlationId: 'corr-001', at: T1 });
    const unpub = reg.unpublish({ id: 'sf-seller-0001', correlationId: 'corr-001', at: T2 });
    expect(unpub.status).toBe('changed');
    if (unpub.status === 'changed') {
      expect(unpub.storefront.discoverable).toBe(false);
      expect(unpub.storefront.updatedAt).toBe(T2);
      expect(unpub.event.name).toBe('storefront.published.v1');
      expect(unpub.event.payload['discoverable']).toBe(false);
    }
    // a repeat unpublish is a no-op
    expect(reg.unpublish({ id: 'sf-seller-0001', correlationId: 'corr-001', at: '2026-07-14T11:00:00.000Z' }).status).toBe('unchanged');
    expect(reg.get('sf-seller-0001')?.updatedAt).toBe(T2);
  });

  it('publish/unpublish on an absent storefront is surfaced (never a phantom write)', () => {
    const reg = new StorefrontRegistry();
    expect(reg.publish({ id: 'sf-nope', correlationId: 'c', at: T1 }).status).toBe('absent');
  });
});
