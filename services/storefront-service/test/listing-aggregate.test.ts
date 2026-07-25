import { describe, expect, it } from 'vitest';
import { ResellerListingSchema } from '@platform/contracts';
import {
  LISTING_AUTO_HIDDEN,
  LISTING_PUBLISHED,
  ListingRegistry,
  type PublishListingCommand,
} from '../src/listing-aggregate.js';

/**
 * SP#001-B — the listing seam obeys its command law. A storefront lists an offer
 * at HER price (canon `ResellerListing`, real events), auto-hides on
 * out-of-stock, and the money value is CARRIED, never recomputed here.
 */

const T0 = '2026-07-14T08:00:00.000Z';
const T1 = '2026-07-14T09:00:00.000Z';

const OFFER: PublishListingCommand = {
  commandId: 'cmd-listing-001',
  listingId: 'lst-seller-0001',
  storefrontId: 'sf-seller-0001',
  resellerId: 'rs-seller-0001',
  productVersionId: 'pv-bazin-0001',
  offerVersion: 'ov-1',
  markup: 2_000, // HER markup M
  customerPriceFcfa: 11_500, // HER price = productSubtotal (B + M), supplied
  stockAssurance: { source: 'hub' },
  correlationId: 'corr-001',
  at: T0,
};

describe('listing aggregate — a storefront lists an offer at HER price', () => {
  it('publish builds a canon ResellerListing (status published) and emits listing.published.v1 carrying HER price + the stock assurance', () => {
    const reg = new ListingRegistry();
    const out = reg.publish(OFFER);
    expect(out.status).toBe('published');
    if (out.status !== 'published') return;
    expect(() => ResellerListingSchema.parse(out.listing)).not.toThrow(); // canon shape, verbatim
    expect(out.listing.status).toBe(LISTING_PUBLISHED);
    expect(out.listing.markup).toBe(2_000);
    expect(out.event.name).toBe('listing.published.v1');
    expect(out.event.payload['storefront_id']).toBe('sf-seller-0001');
    // HUB-ASSURANCE-1 — provenance, not a verdict (was `hub_verified: true`).
    expect(out.event.payload['stock_assurance']).toEqual({ source: 'hub' });
    expect(out.event.payload['customer_price_fcfa']).toBe(11_500); // HER price rides the event, carried not recomputed
  });

  it('PUBLISH-IDEMPOTENT-ON-COMMAND_ID: the same publish command returns the same listing, no re-publish', () => {
    const reg = new ListingRegistry();
    reg.publish(OFFER);
    const replay = reg.publish(OFFER);
    expect(replay.status).toBe('idempotent');
    if (replay.status === 'idempotent') expect(replay.listing.id).toBe('lst-seller-0001');
  });

  it('AUTO-HIDE emits listing.auto_hidden.v1 once; the canon status flips; a repeat hide is a no-op', () => {
    const reg = new ListingRegistry();
    reg.publish(OFFER);
    const hide = reg.autoHide({ listingId: 'lst-seller-0001', correlationId: 'corr-001', at: T1 });
    expect(hide.status).toBe('hidden');
    if (hide.status === 'hidden') {
      expect(hide.listing.status).toBe(LISTING_AUTO_HIDDEN);
      expect(hide.event.name).toBe('listing.auto_hidden.v1');
      expect(hide.event.payload['listing_id']).toBe('lst-seller-0001');
    }
    // already hidden → no second event
    expect(reg.autoHide({ listingId: 'lst-seller-0001', correlationId: 'corr-001', at: T1 }).status).toBe('unchanged');
  });

  it('auto-hiding an absent listing is surfaced (never a phantom write)', () => {
    const reg = new ListingRegistry();
    expect(reg.autoHide({ listingId: 'lst-nope', correlationId: 'c', at: T1 }).status).toBe('absent');
  });
});

/**
 * HUB-ASSURANCE-1 — the publish command carries PROVENANCE, and omitting it is safe.
 * The event payload is what `store-projection` folds into the customer-visible badge,
 * so what rides here decides whether a « Vérifiée » mark appears beside a shop name.
 */
describe('stock assurance on listing.published.v1 — fail-closed, never a verdict', () => {
  it('an OMITTED assurance is declared, never hub — a caller who forgets cannot publish a trust claim', () => {
    const registry = new ListingRegistry();
    // Deliberately built WITHOUT stockAssurance — this is the shape the frozen
    // attribution-service e2e sends, and the shape any future forgetful caller sends.
    const { stockAssurance: _omitted, ...withoutAssurance } = OFFER;
    const decision = registry.publish(withoutAssurance);
    expect(decision.status).toBe('published');
    if (decision.status !== 'published') return;
    expect(decision.event.payload.stock_assurance).toEqual({ source: 'declared' });
  });

  it('a DECLARED assurance travels as declared — the claim is recorded, not discarded', () => {
    const registry = new ListingRegistry();
    const decision = registry.publish({ ...OFFER, stockAssurance: { source: 'declared' } });
    expect(decision.status === 'published' && decision.event.payload.stock_assurance).toEqual({ source: 'declared' });
  });

  it('a HUB assurance travels as hub — the only value that may ever light the badge', () => {
    const registry = new ListingRegistry();
    const decision = registry.publish({ ...OFFER, stockAssurance: { source: 'hub' } });
    expect(decision.status === 'published' && decision.event.payload.stock_assurance).toEqual({ source: 'hub' });
  });

  it('no boolean survives on the payload — a rename would have left one behind', () => {
    const registry = new ListingRegistry();
    const decision = registry.publish({ ...OFFER, stockAssurance: { source: 'hub' } });
    if (decision.status !== 'published') throw new Error('setup');
    expect(Object.keys(decision.event.payload)).not.toContain('hub_verified');
  });
});
