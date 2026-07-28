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

describe('STOREFRONT-DELETE-1 — decideDelete, the pure erasure decision', () => {
  it('an existing entry deletes, carries the SLUG for pointer cleanup, and orders the erase', async () => {
    const { decideCreate, decideDelete } = await import('../src/storefront-core.js');
    const { next } = decideCreate(undefined, SELLER_001);
    const { decision, erase } = decideDelete(next);
    expect(decision).toEqual({ status: 'deleted', slug: 'seller-0001' });
    expect(erase).toBe(true);
  });

  it('an absent entry is surfaced, and NOTHING is erased — never a phantom deletion', async () => {
    const { decideDelete } = await import('../src/storefront-core.js');
    const { decision, erase } = decideDelete(undefined);
    expect(decision).toEqual({ status: 'absent' });
    expect(erase).toBe(false);
  });
});

describe('PERSONNALISER-REAL-1 — decideSaveIdentity, the presentation she owns', () => {
  const entry = async () => {
    const { decideCreate } = await import('../src/storefront-core.js');
    return decideCreate(undefined, SELLER_001).next!;
  };
  const T3 = '2026-07-27T12:00:00.000Z';

  it('SAVES the presentation and moves updatedAt — the buyer read path sees it', async () => {
    const { decideSaveIdentity } = await import('../src/storefront-core.js');
    const { decision, next } = decideSaveIdentity(await entry(), { name: 'Chez Bernard', tagline: 'Le bon tissu', bio: 'Ouaga' }, T3);
    expect(decision.status).toBe('saved');
    if (decision.status !== 'saved') throw new Error('unreachable');
    expect(decision.storefront.name).toBe('Chez Bernard');
    expect(decision.storefront.tagline).toBe('Le bon tissu');
    expect(decision.storefront.bio).toBe('Ouaga');
    expect(decision.storefront.updatedAt).toBe(T3);
    expect(next?.storefront.name).toBe('Chez Bernard'); // and it is what gets PERSISTED
    // the LOCKED fields are untouched — slug is never regenerated on a rename
    expect(decision.storefront.slug).toBe('seller-0001');
    expect(decision.storefront.id).toBe('sf-seller-0001');
  });

  it('ABSENT FIELDS ARE UNTOUCHED, never cleared — one screen saves one thing', async () => {
    const { decideSaveIdentity } = await import('../src/storefront-core.js');
    const withBio = decideSaveIdentity(await entry(), { tagline: 'Le bon tissu', bio: 'Ouaga' }, T3).next!;
    // K4 saves ONLY the theme; her tagline and bio must survive it
    const { decision } = decideSaveIdentity(withBio, { theme: 'indigo' }, T3);
    if (decision.status !== 'saved') throw new Error('expected saved');
    expect(decision.storefront.theme).toBe('indigo');
    expect(decision.storefront.tagline).toBe('Le bon tissu');
    expect(decision.storefront.bio).toBe('Ouaga');
  });

  it('A NO-OP SAVE IS `unchanged` AND DOES NOT MOVE updatedAt (the directory ordering truth)', async () => {
    const { decideSaveIdentity } = await import('../src/storefront-core.js');
    const e = await entry();
    const { decision, next } = decideSaveIdentity(e, { name: e.storefront.name, theme: e.storefront.theme }, T3);
    expect(decision.status).toBe('unchanged');
    expect(next).toBeUndefined(); // nothing to write
    expect(e.storefront.updatedAt).not.toBe(T3);
  });

  it('EVERY BOUND IS ENFORCED AT THE SERVICE, each refusal NAMED', async () => {
    const { decideSaveIdentity } = await import('../src/storefront-core.js');
    const e = await entry();
    const reason = (patch: Parameters<typeof decideSaveIdentity>[1]) => {
      const d = decideSaveIdentity(e, patch, T3).decision;
      return d.status === 'refused' ? d.reason : d.status;
    };
    // the app enforces these at the edit boundary; the SERVICE is the authority,
    // because an app is one client of many and its limits stop at its own bundle
    expect(reason({ name: 'ab' })).toBe('name_too_short');
    expect(reason({ name: 'x'.repeat(25) })).toBe('name_too_long');
    expect(reason({ tagline: 'x'.repeat(41) })).toBe('tagline_too_long');
    expect(reason({ bio: 'x'.repeat(161) })).toBe('bio_too_long');
    expect(reason({ theme: 'neon' })).toBe('unknown_theme');
    expect(reason({ featuredItems: ['a', 'b', 'c'] })).toBe('featured_over_cap');
    expect(reason({ sections: [1, 2, 3, 4, 5].map((n) => ({ id: `s${n}`, name: `S${n}`, pids: [] })) })).toBe('sections_over_cap');
    // …and the boundary values PASS, so the bound is a ceiling and not a wall
    expect(reason({ name: 'abc' })).toBe('saved');
    expect(reason({ featuredItems: ['a', 'b'] })).toBe('saved');
  });

  it('AN ABSENT STOREFRONT IS SURFACED — never a phantom save', async () => {
    const { decideSaveIdentity } = await import('../src/storefront-core.js');
    const { decision, next } = decideSaveIdentity(undefined, { name: 'Chez Bernard' }, T3);
    expect(decision).toEqual({ status: 'absent' });
    expect(next).toBeUndefined();
  });

  it('MONEY IS UNREPRESENTABLE IN THE PATCH — presentation only (loi 5)', async () => {
    const { decideSaveIdentity } = await import('../src/storefront-core.js');
    const e = await entry();
    // a caller that smuggles money-shaped keys changes NOTHING: the merge reads
    // only the six presentation fields, so the extra keys cannot reach the store.
    const smuggled = { name: 'Chez Bernard', customerPriceFcfa: 999, markup: 500, resellerCommission: 42 } as never;
    const { decision } = decideSaveIdentity(e, smuggled, T3);
    if (decision.status !== 'saved') throw new Error('expected saved');
    const serialised = JSON.stringify(decision.storefront);
    expect(serialised).not.toContain('customerPriceFcfa');
    expect(serialised).not.toContain('markup');
    expect(serialised).not.toContain('999');
  });

  it('ENTETES-B: headerStyle SAVES, is PERSISTED, and moves updatedAt — every canon key accepted', async () => {
    const { decideSaveIdentity } = await import('../src/storefront-core.js');
    const { decision, next } = decideSaveIdentity(await entry(), { headerStyle: 'royale' }, T3);
    expect(decision.status).toBe('saved');
    if (decision.status !== 'saved') throw new Error('unreachable');
    expect(decision.storefront.headerStyle).toBe('royale');
    expect(decision.storefront.updatedAt).toBe(T3); // a real change moves the clock
    expect(next?.storefront.headerStyle).toBe('royale'); // and it is what gets PERSISTED
    // the whole CANON set is accepted — imported, never a hand-copied list
    const { STOREFRONT_HEADER_STYLES } = await import('@platform/contracts');
    for (const key of STOREFRONT_HEADER_STYLES) {
      const d = decideSaveIdentity(await entry(), { headerStyle: key }, T3).decision;
      expect(d.status, key).toBe(key === 'classique' ? 'unchanged' : 'saved'); // classique IS the created default
    }
  });

  it('ENTETES-B: the SAME headerStyle again is `unchanged` and updatedAt does NOT move', async () => {
    const { decideSaveIdentity } = await import('../src/storefront-core.js');
    const withRoyale = decideSaveIdentity(await entry(), { headerStyle: 'royale' }, T3).next!;
    const T4 = '2026-07-28T12:00:00.000Z';
    const { decision, next } = decideSaveIdentity(withRoyale, { headerStyle: 'royale' }, T4);
    expect(decision.status).toBe('unchanged');
    expect(next).toBeUndefined(); // nothing to write
    expect(withRoyale.storefront.updatedAt).toBe(T3); // the no-op moved nothing
  });

  it('ENTETES-B: an unknown header is REFUSED by its own name — never stored, never anonymous', async () => {
    const { decideSaveIdentity } = await import('../src/storefront-core.js');
    const e = await entry();
    const { decision, next } = decideSaveIdentity(e, { headerStyle: 'baroque' }, T3);
    expect(decision).toEqual({ status: 'refused', reason: 'unknown_header_style' });
    expect(next).toBeUndefined();
    expect(e.storefront.headerStyle).toBe('classique'); // the stored value is untouched
  });

  it('ENTETES-B: a PRE-FIELD entry backfills headerStyle:`classique` through the canon parse — proven, not assumed', async () => {
    const { decideSaveIdentity } = await import('../src/storefront-core.js');
    const { StorefrontSchema } = await import('@platform/contracts');
    // Fabricate the exact stored shape a pre-v2.1.0 write left behind: the canon
    // Storefront WITHOUT the field (DO storage holds bytes, not schemas).
    const created = await entry();
    const { headerStyle: _dropped, ...preFieldSf } = created.storefront as Record<string, unknown> & { headerStyle: string };
    const preField = { ...created, storefront: preFieldSf as typeof created.storefront };
    // 1 · read back through the canon schema: the default backfills
    expect(StorefrontSchema.parse(preFieldSf).headerStyle).toBe('classique');
    // 2 · a real save on the pre-field entry writes a canon shape carrying the default
    const { decision } = decideSaveIdentity(preField, { name: 'Chez Bernard' }, T3);
    if (decision.status !== 'saved') throw new Error(`expected saved, got ${decision.status}`);
    expect(decision.storefront.headerStyle).toBe('classique');
    expect(() => StorefrontSchema.parse(decision.storefront)).not.toThrow();
  });
});

/**
 * PERSONNALISER-REAL-1 — the VERIFIER's findings, pinned closed.
 *
 * Each of these is a defect that shipped in the first cut and would have reached
 * the founder's device: a trailing space that could never be retried away, a
 * reorder that silently did nothing, and a section name that refused anonymously.
 */
describe('PERSONNALISER-REAL-1 — verifier findings', () => {
  const entry = async () => {
    const { decideCreate } = await import('../src/storefront-core.js');
    const created = decideCreate(undefined, SELLER_001).next!;
    // give her three curated products, as publishing would
    return { ...created, storefront: { ...created.storefront, curatedItems: ['pv-1', 'pv-2', 'pv-3'] } };
  };
  const T3 = '2026-07-27T12:00:00.000Z';

  it('A TRAILING SPACE IS TRIMMED, not refused with advice that can never work', async () => {
    const { decideSaveIdentity } = await import('../src/storefront-core.js');
    // canon's string type is a REGEX that refuses surrounding whitespace, so this
    // used to clear every bound and then die anonymously as `not_canon_shape`,
    // surfacing to her as « réessayez dans un moment » — retrying never worked.
    const { decision } = decideSaveIdentity(await entry(), { name: 'Chez Bernard ', tagline: ' Le bon tissu ' }, T3);
    if (decision.status !== 'saved') throw new Error(`expected saved, got ${decision.status}`);
    expect(decision.storefront.name).toBe('Chez Bernard');
    expect(decision.storefront.tagline).toBe('Le bon tissu');
    // …and a name that is ONLY whitespace is still the honest « too short »
    const blank = decideSaveIdentity(await entry(), { name: '   ' }, T3).decision;
    expect(blank.status === 'refused' && blank.reason).toBe('name_too_short');
  });

  it('A SECTION NAME REFUSES BY ITS OWN NAME — never the anonymous canon-shape refusal', async () => {
    const { decideSaveIdentity } = await import('../src/storefront-core.js');
    const e = await entry();
    const reason = (name: string) => {
      const d = decideSaveIdentity(e, { sections: [{ id: 's1', name, pids: [] }] }, T3).decision;
      return d.status === 'refused' ? d.reason : d.status;
    };
    expect(reason('')).toBe('section_name_empty'); // mid-retype: not « retry »
    expect(reason('   ')).toBe('section_name_empty');
    expect(reason('x'.repeat(21))).toBe('section_name_too_long');
    expect(reason('Robes ')).toBe('saved'); // trimmed, then accepted
  });

  it('K5 ▲▼ REORDERS — the silent no-op is closed', async () => {
    const { decideSaveIdentity } = await import('../src/storefront-core.js');
    const { decision } = decideSaveIdentity(await entry(), { curatedItems: ['pv-2', 'pv-1', 'pv-3'] }, T3);
    if (decision.status !== 'saved') throw new Error(`expected saved, got ${decision.status}`);
    expect(decision.storefront.curatedItems).toEqual(['pv-2', 'pv-1', 'pv-3']);
  });

  it('A REORDER CANNOT ADD OR DROP A PRODUCT — membership is not editable here', async () => {
    const { decideSaveIdentity } = await import('../src/storefront-core.js');
    const e = await entry();
    const reason = (curatedItems: string[]) => {
      const d = decideSaveIdentity(e, { curatedItems }, T3).decision;
      return d.status === 'refused' ? d.reason : d.status;
    };
    // dropping one would retire a product through a reorder…
    expect(reason(['pv-1', 'pv-2'])).toBe('curation_not_a_reorder');
    // …and adding one would list a product no publish ever signed.
    expect(reason(['pv-1', 'pv-2', 'pv-3', 'pv-4'])).toBe('curation_not_a_reorder');
    expect(reason(['pv-1', 'pv-2', 'pv-9'])).toBe('curation_not_a_reorder');
    // the same set in a new order is the ONE accepted form
    expect(reason(['pv-3', 'pv-2', 'pv-1'])).toBe('saved');
    // …and the stored membership is untouched by a refusal
    expect(e.storefront.curatedItems).toEqual(['pv-1', 'pv-2', 'pv-3']);
  });
});

/**
 * MEDIA-2 — decideSetMedia had NO unit tests at all. A fresh-context verifier
 * proved it: deleting the ENTIRE avatar branch, and forcing the absent branch to
 * answer 200, both left 197/197 green. One e2e assertion touched the cover branch
 * and nothing else. These are the mutations that must now fail.
 */
describe('PERSONNALISER-MEDIA — decideSetMedia, the URL the SERVICE owns', () => {
  const entry = async () => {
    const { decideCreate } = await import('../src/storefront-core.js');
    return decideCreate(undefined, SELLER_001).next!;
  };
  const T4 = '2026-07-28T09:00:00.000Z';
  const URL_OK = 'https://storefront-service.example.workers.dev/media/storefronts/sf-1/cover/a.jpg';

  it('A COVER URL LANDS ON THE STOREFRONT, with the status the buyer reads', async () => {
    const { decideSetMedia } = await import('../src/storefront-core.js');
    const { decision, next } = decideSetMedia(await entry(), 'cover', URL_OK, T4);
    if (decision.status !== 'set') throw new Error(`expected set, got ${decision.status}`);
    expect(decision.storefront.cover).toEqual({ status: 'live', url: URL_OK });
    expect(decision.storefront.updatedAt).toBe(T4);
    // the persisted entry carries it too — a decision nobody stores is no decision
    expect(next!.storefront.cover.url).toBe(URL_OK);
  });

  it('AN AVATAR URL FLIPS THE MODE TO photo AND CARRIES THE URL (branch was untested)', async () => {
    const { decideSetMedia } = await import('../src/storefront-core.js');
    const { decision, next } = decideSetMedia(await entry(), 'avatar', URL_OK, T4);
    if (decision.status !== 'set') throw new Error(`expected set, got ${decision.status}`);
    expect(decision.storefront.avatar).toEqual({ mode: 'photo', url: URL_OK });
    expect(next!.storefront.avatar.url).toBe(URL_OK);
    // …and setting the avatar must not disturb the cover
    expect(decision.storefront.cover.status).toBe('none');
  });

  it('AN ABSENT STOREFRONT IS SURFACED, never a phantom write (branch was untested)', async () => {
    const { decideSetMedia } = await import('../src/storefront-core.js');
    const { decision, next } = decideSetMedia(undefined, 'cover', URL_OK, T4);
    expect(decision.status).toBe('absent');
    expect(next).toBeUndefined();
  });

  it('A RELATIVE URL IS REFUSED — RN cannot resolve it and a browser 404s on it', async () => {
    const { decideSetMedia } = await import('../src/storefront-core.js');
    // this is EXACTLY what shipped: MEDIA_PUBLIC_BASE was "" so the minted url was
    // `/media/{key}`. The e2e compared two equally-relative strings and stayed green.
    for (const bad of ['/media/storefronts/sf-1/cover/a.jpg', 'media/x.jpg', 'ftp://h/x.jpg', '//h/x.jpg']) {
      const { decision, next } = decideSetMedia(await entry(), 'cover', bad, T4);
      if (decision.status !== 'refused') throw new Error(`expected refused for ${bad}, got ${decision.status}`);
      expect(decision.reason).toBe('url_not_absolute');
      expect(next).toBeUndefined();
    }
    // http and https both pass — the check is "a client can fetch this", not a host allowlist
    expect(decideSetMedia(await entry(), 'cover', 'http://h/x.jpg', T4).decision.status).toBe('set');
  });
});
