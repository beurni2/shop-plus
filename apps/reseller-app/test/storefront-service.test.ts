import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HttpStorefrontService,
  WRITE_KEY_HEADER,
  deriveShortCode,
  resolveStorefrontService,
  type CreateStorefrontCommand,
} from '../src/vitrine/service';
// RESELLER-SEAM-HONESTY-1 — the demo adapter now lives in its OWN module, imported
// here and NOWHERE the app entry can reach. `service.ts` no longer exports it, so
// this import is also the assertion that it stayed out of the app's module.
import { DemoStorefrontService } from '../src/vitrine/service.demo';

/**
 * RESELLER-STOREFRONT-WRITE-1 — the write seam. The DEMO adapter is the CI/local
 * substrate (zero network); the HTTP adapter's REQUEST SHAPE (key header, method,
 * route, body) is asserted against a fetch stub, and its honesty (a non-2xx or a
 * network throw is `{ ok:false }`, never a thrown error) is proven here.
 *
 * BOUNDARY (stated, not hidden): a real device reaching the LIVE Worker is NOT
 * proven by these tests — only that the request the app WOULD send is correct.
 */

const CMD: CreateStorefrontCommand = {
  commandId: 'cmd-1',
  id: 'sf-test-1',
  resellerId: 'rs-1',
  shortCode: 'BOUTIK-0007',
  name: 'Boutique test',
  zone: 'Ouagadougou',
  category: 'Général',
  correlationId: 'corr-1',
  at: '2026-07-24T00:00:00.000Z',
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.EXPO_PUBLIC_STOREFRONT_BASE;
  delete process.env.EXPO_PUBLIC_STOREFRONT_WRITE_KEY;
});

describe('deriveShortCode — a valid [A-Z]{2,12}-[0-9]{4} always', () => {
  const RE = /^[A-Z]{2,12}-[0-9]{4}$/;
  it('strips accents and non-letters, upper-cases, caps at 12', () => {
    expect(deriveShortCode('Chez Aïcha Mode', '4821')).toMatch(RE);
    expect(deriveShortCode('Chez Aïcha Mode', '4821').startsWith('CHEZAICHAMOD')).toBe(true);
  });
  it('falls back to BOUTIK when < 2 ASCII letters, and pads short digit suffixes', () => {
    expect(deriveShortCode('妈妈', '7')).toBe('BOUTIK-7000');
    expect(deriveShortCode('都', '')).toBe('BOUTIK-0000');
  });
});

describe('DemoStorefrontService — the zero-network substrate', () => {
  it('create is idempotent on the id; list reflects live discoverable', async () => {
    const svc = new DemoStorefrontService();
    expect((await svc.create(CMD)).ok && (await svc.create(CMD)).ok).toBe(true);
    const first = await svc.create({ ...CMD, commandId: 'cmd-2' });
    expect(first).toEqual({ ok: true, value: { status: 'idempotent', slug: 'boutik-0007' } });

    await svc.publish(CMD.id, 'c', CMD.at);
    const listed = await svc.list();
    expect(listed.ok && listed.value).toEqual([{ id: 'sf-test-1', slug: 'boutik-0007', name: 'Boutique test', discoverable: true }]);

    await svc.uploadCover(CMD.id, new Uint8Array([1, 2, 3]), 'image/png');
    expect(svc.uploads).toEqual([{ kind: 'cover', storefrontId: 'sf-test-1', size: 3 }]);
  });
});

describe('HttpStorefrontService — the request the app WOULD send', () => {
  function stubFetch(status: number, body: unknown) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fn = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
    });
    vi.stubGlobal('fetch', fn);
    return calls;
  }

  it('create → POST /storefronts with the X-Write-Key header and the command body', async () => {
    const calls = stubFetch(200, { status: 'created', storefront: { slug: 'boutik-0007' } });
    const svc = new HttpStorefrontService('https://sf.example.dev/', 'SECRET-KEY');
    const r = await svc.create(CMD);
    expect(r).toEqual({ ok: true, value: { status: 'created', slug: 'boutik-0007' } });
    expect(calls[0]!.url).toBe('https://sf.example.dev/storefronts');
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>)[WRITE_KEY_HEADER]).toBe('SECRET-KEY');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual(CMD);
  });

  it('uploadCover → POST /media/upload?kind=cover&storefrontId=… with the key and raw bytes', async () => {
    const calls = stubFetch(201, { status: 'pending', url: '/media/storefronts/sf-test-1/cover/abc.png' });
    const svc = new HttpStorefrontService('https://sf.example.dev', 'SECRET-KEY');
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const r = await svc.uploadCover('sf-test-1', bytes, 'image/png');
    expect(r.ok && r.value.url).toBe('/media/storefronts/sf-test-1/cover/abc.png');
    expect(calls[0]!.url).toBe('https://sf.example.dev/media/upload?kind=cover&storefrontId=sf-test-1');
    expect((calls[0]!.init.headers as Record<string, string>)[WRITE_KEY_HEADER]).toBe('SECRET-KEY');
    expect(calls[0]!.init.body).toBe(bytes);
  });

  it('list → GET /storefronts with the key', async () => {
    const calls = stubFetch(200, [{ id: 'sf-test-1', slug: 'boutik-0007', name: 'B', discoverable: true }]);
    const svc = new HttpStorefrontService('https://sf.example.dev', 'SECRET-KEY');
    const r = await svc.list();
    expect(r.ok && r.value.length).toBe(1);
    expect(calls[0]!.init.method).toBe('GET');
    expect((calls[0]!.init.headers as Record<string, string>)[WRITE_KEY_HEADER]).toBe('SECRET-KEY');
  });

  it('a non-2xx is an honest { ok:false }, never a throw', async () => {
    stubFetch(401, { error: 'unauthorized' });
    const svc = new HttpStorefrontService('https://sf.example.dev', 'WRONG');
    expect(await svc.create(CMD)).toEqual({ ok: false, reason: 'http_401' });
  });

  it('a network throw is an honest { ok:false, reason:offline }, never a throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const svc = new HttpStorefrontService('https://sf.example.dev', 'K');
    expect(await svc.list()).toEqual({ ok: false, reason: 'offline' });
  });
});

/**
 * RESELLER-SEAM-HONESTY-1 — the resolver returns `null` when unset, NEVER a
 * silently-succeeding demo. These assertions are the invariant, not decoration: while
 * the resolver returned `DemoStorefrontService`, an unset or mistyped
 * `EXPO_PUBLIC_STOREFRONT_*` produced a SUCCESS toast and wrote nothing anywhere.
 */
describe('resolveStorefrontService — null on unset, never a fallback that cannot fail', () => {
  it('unset env → null (the caller MUST have an honest unconfigured state)', () => {
    expect(resolveStorefrontService()).toBeNull();
  });
  it('base + key set → the real HTTP adapter', () => {
    process.env.EXPO_PUBLIC_STOREFRONT_BASE = 'https://sf.example.dev';
    process.env.EXPO_PUBLIC_STOREFRONT_WRITE_KEY = 'SECRET-KEY';
    expect(resolveStorefrontService()).toBeInstanceOf(HttpStorefrontService);
  });
  it('base without key → null (fail safe, never a keyless write)', () => {
    process.env.EXPO_PUBLIC_STOREFRONT_BASE = 'https://sf.example.dev';
    expect(resolveStorefrontService()).toBeNull();
  });
  it('key without base → null (the pair is set together or not at all)', () => {
    process.env.EXPO_PUBLIC_STOREFRONT_WRITE_KEY = 'SECRET-KEY';
    expect(resolveStorefrontService()).toBeNull();
  });
  it('NEVER returns an adapter whose create cannot fail — the resolved value is null or HTTP, nothing else', () => {
    const unset = resolveStorefrontService();
    expect(unset).not.toBeInstanceOf(DemoStorefrontService);
    expect(unset).toBeNull();
  });
});

/**
 * The demo adapter is still contract-shaped and still used by tests — moving it out
 * of the app's reachable graph must not have quietly changed its behaviour, or the
 * substrate every other test stands on would have shifted underneath them.
 */
describe('DemoStorefrontService — unchanged behaviour in its new module', () => {
  it('still cannot fail, which is exactly why it may not be reachable from the app', async () => {
    const svc = new DemoStorefrontService();
    expect((await svc.create(CMD)).ok).toBe(true);
    expect((await svc.publish(CMD.id, 'c', CMD.at)).ok).toBe(true);
    expect((await svc.publish('never-created', 'c', CMD.at)).ok).toBe(true);
  });
});

/**
 * PERSONNALISER-REAL-1 — the presentation actually persists.
 *
 * The founder's finding: every edit in Personnaliser lived in React state and
 * died on leaving the screen, because the customize stack was never handed the
 * service at all. These pin the seam half (the wire shape, the named refusals,
 * the honest absence) and the wiring half (App hands the shop and the save down,
 * and the screens call it on EVERY edit).
 */
describe('PERSONNALISER-REAL-1 — the identity seam', () => {
  const patch = { name: 'Chez Bernard', tagline: 'Le bon tissu', bio: 'Ouaga', theme: 'indigo' as const };

  it('THE WIRE: POST /storefronts/{id}/identity with the key, the patch and the timestamp', async () => {
    let seen: { url?: string | undefined; method?: string | undefined; key?: string | undefined; body?: unknown } = {};
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
      seen = { url, method: init.method, key: init.headers[WRITE_KEY_HEADER], body: JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => ({ status: 'saved' }) } as unknown as Response;
    }) as unknown as typeof fetch;
    try {
      const svc = new HttpStorefrontService('https://svc.example', 'k-test');
      expect(await svc.saveIdentity('sf-1', patch, 'T0')).toEqual({ ok: true, value: { status: 'saved' } });
    } finally {
      globalThis.fetch = original;
    }
    expect(seen.url).toBe('https://svc.example/storefronts/sf-1/identity');
    expect(seen.method).toBe('POST');
    expect(seen.key).toBe('k-test');
    expect(seen.body).toEqual({ patch, at: 'T0' });
    // NO MONEY ON THIS WIRE — presentation only (loi 5)
    const wire = JSON.stringify(seen.body);
    expect(wire).not.toMatch(/customerPriceFcfa|markup|basePrice|resellerCommission/);
  });

  it("THE SERVICE'S NAMED REFUSAL SURVIVES to the caller — « nom trop court » is not « une erreur »", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({ ok: false, status: 422, json: async () => ({ status: 'refused', reason: 'name_too_short' }) }) as unknown as Response) as unknown as typeof fetch;
    try {
      const svc = new HttpStorefrontService('https://svc.example', 'k');
      expect(await svc.saveIdentity('sf-1', { name: 'ab' }, 'T0')).toEqual({ ok: false, reason: 'name_too_short' });
    } finally {
      globalThis.fetch = original;
    }
  });

  it('A 404 READ IS AN HONEST ABSENCE, a broken body is a FAULT — the two are never confused', async () => {
    const original = globalThis.fetch;
    const svc = new HttpStorefrontService('https://svc.example', 'k');
    try {
      globalThis.fetch = (async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
      // no shop yet ⇒ ok with NO value: she has simply not gone live
      expect(await svc.getById('sf-1')).toEqual({ ok: true, value: undefined });
      // a 200 whose body will not parse is a FAULT, never an empty shop —
      // rendering « pas encore de boutique » over a broken read is disappearance.
      globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => null }) as unknown as Response) as unknown as typeof fetch;
      expect(await svc.getById('sf-1')).toEqual({ ok: false, reason: 'unreadable' });
    } finally {
      globalThis.fetch = original;
    }
  });

  it('THE DEMO ADAPTER ROUND-TRIPS AND CAN REFUSE (certified-mock rule)', async () => {
    const svc = new DemoStorefrontService();
    await svc.create(CMD);
    // saved → read back, by value
    expect((await svc.saveIdentity(CMD.id, patch, 'T1')).ok).toBe(true);
    const read = await svc.getById(CMD.id);
    expect(read.ok && read.value?.name).toBe('Chez Bernard');
    expect(read.ok && read.value?.theme).toBe('indigo');
    expect(read.ok && read.value?.updatedAt).toBe('T1');
    // an unknown shop is an honest absence, not a fabricated one
    expect(await svc.getById('sf-never')).toEqual({ ok: true, value: undefined });
    // …and the mock CAN fail, or it would make every test greener than the system
    svc.refuseIdentityFor.add(CMD.id);
    expect(await svc.saveIdentity(CMD.id, patch, 'T2')).toEqual({ ok: false, reason: 'name_too_short' });
  });

  it('ENTETES-B THE WIRE: the HTTP adapter posts a headerStyle patch AS-IS — nothing strips or renames it', async () => {
    let seen: { url?: string | undefined; body?: unknown } = {};
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
      seen = { url, body: JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => ({ status: 'saved' }) } as unknown as Response;
    }) as unknown as typeof fetch;
    try {
      const svc = new HttpStorefrontService('https://svc.example', 'k-test');
      expect(await svc.saveIdentity('sf-1', { headerStyle: 'royale' }, 'T0')).toEqual({ ok: true, value: { status: 'saved' } });
    } finally {
      globalThis.fetch = original;
    }
    expect(seen.url).toBe('https://svc.example/storefronts/sf-1/identity');
    expect(seen.body).toEqual({ patch: { headerStyle: 'royale' }, at: 'T0' });
  });

  it("ENTETES-B THE SERVICE'S NAMED REFUSAL SURVIVES — « unknown_header_style » is not « une erreur »", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({ ok: false, status: 422, json: async () => ({ status: 'refused', reason: 'unknown_header_style' }) }) as unknown as Response) as unknown as typeof fetch;
    try {
      const svc = new HttpStorefrontService('https://svc.example', 'k');
      expect(await svc.saveIdentity('sf-1', { headerStyle: 'baroque' }, 'T0')).toEqual({ ok: false, reason: 'unknown_header_style' });
    } finally {
      globalThis.fetch = original;
    }
  });

  it('ENTETES-B THE DEMO ADAPTER honors headerStyle with the SAME named refusal as the service', async () => {
    const svc = new DemoStorefrontService();
    await svc.create(CMD);
    // saved → read back, by value, with the other fields untouched
    expect((await svc.saveIdentity(CMD.id, { headerStyle: 'royale' }, 'T1')).ok).toBe(true);
    const read = await svc.getById(CMD.id);
    expect(read.ok && read.value?.headerStyle).toBe('royale');
    expect(read.ok && read.value?.name).toBe(CMD.name); // absent fields stay untouched
    // an unknown key refuses by the service's own name, and writes NOTHING
    expect(await svc.saveIdentity(CMD.id, { headerStyle: 'baroque' }, 'T2')).toEqual({ ok: false, reason: 'unknown_header_style' });
    const after = await svc.getById(CMD.id);
    expect(after.ok && after.value?.headerStyle).toBe('royale');
  });
});

describe('PERSONNALISER-REAL-1 — the wiring (source-pinned)', () => {
  const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
  const screens = readFileSync(join(__dirname, '..', 'src/vitrine/customize/screens.tsx'), 'utf8');

  it('APP READS HER REAL SHOP and hands it, the save and the persist-state to the stack', () => {
    expect(app).toMatch(/service\.getById\(identity\.storefrontId\)/);
    expect(app).toMatch(/storefront=\{liveStorefront \?\? undefined\}/);
    expect(app).toMatch(/onSaveIdentity=\{saveIdentity\}/);
    expect(app).toMatch(/savesPersist=\{liveStorefront !== null && liveStorefront !== undefined\}/);
    // the DEMO seed is no longer what she edits — the read is the source
    expect(app).not.toMatch(/storefront=\{DEFAULT_STOREFRONT\}/);
  });

  it('EVERY EDIT PERSISTS — setSf saves all six presentation fields, never a subset', () => {
    const setSf = /const setSf = \(next: Storefront, opts\?[\s\S]*?\n  \};/.exec(screens)?.[0] ?? '';
    expect(setSf).toContain('onSaveIdentity?.(');
    for (const field of ['name', 'tagline', 'bio', 'theme', 'featuredItems', 'sections']) {
      expect(setSf, `setSf must save ${field}`).toContain(`${field}: next.${field}`);
    }
    // …and no money field can ride along: the patch names exactly the six
    expect(setSf).not.toMatch(/markup|priceFcfa|commission/);
  });

  it('A SAVE THAT CANNOT PERSIST IS SAID, NOT SWALLOWED (before she types, and on refusal)', () => {
    // before going live her shop does not exist on the service: the screen says so
    expect(screens).toMatch(/savesPersist === false/);
    expect(screens).toContain("t('k.enreg.brouillon')");
    // and a refusal maps to the true sentence, not a generic one.
    // PERSONNALISER-HONESTY-1 — the App no longer inlines the ternary chain that
    // ended in « Réessayez dans un moment » for everything it did not recognise;
    // it routes EVERY reason through `saveRefusalToastKey`, whose own executed
    // tests pin the mapping (including that an unknown reason makes no retry
    // promise). What is pinned here is that the App still SAYS something and
    // says it from that one decision.
    expect(app).toContain('setToast(t(saveRefusalToastKey(res.reason)))');
    expect(app).toMatch(/import \{[^}]*saveRefusalToastKey[^}]*\} from '\.\/src\/vitrine\/service'/);
    // the save is SKIPPED (never fabricated) until HER shop is loaded and adopted
    // — gated on the SAME read the screens edit (verifier finding). It now
    // ANSWERS that refusal (`false`) instead of returning silently, because K4
    // may not draw a stored state without it.
    expect(app).toMatch(/if \(liveStorefront === null \|\| liveStorefront === undefined\) return false;/);
  });

  it('THE SAVE IS READ BACK, never assumed — the service owns updatedAt and the canon shape', () => {
    const handler = /const saveIdentity = useCallback\([\s\S]*?\n  \);/.exec(app)?.[0] ?? '';
    const saveIdx = handler.indexOf('service.saveIdentity');
    const readIdx = handler.indexOf('service.getById');
    expect(saveIdx).toBeGreaterThan(-1);
    expect(readIdx).toBeGreaterThan(saveIdx); // read AFTER the write, not instead of it
  });
});

/**
 * PERSONNALISER-REAL-1 — the VERIFIER's blocking findings, pinned closed.
 *
 * The first cut gated the save on `liveShop` (the ADMIN LIST read) while the
 * screens were filled by `liveStorefront` (the BY-ID read). One can fail while
 * the other succeeds, and in that window the stack still held the demo seed — so
 * a single tap would have persisted « Chez Aïcha Mode » over her real shop,
 * buyer-visible, driving a RETIRED name (law 10) into live data.
 */
describe('PERSONNALISER-REAL-1 — the demo seed can never be saved over her shop', () => {
  const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
  const screens = readFileSync(join(__dirname, '..', 'src/vitrine/customize/screens.tsx'), 'utf8');

  it('THE SAVE IS GATED ON THE SAME READ THE SCREENS EDIT — never on a different one', () => {
    const handler = /const saveIdentity = useCallback\([\s\S]*?\n  \);/.exec(app)?.[0] ?? '';
    expect(handler).toMatch(/if \(liveStorefront === null \|\| liveStorefront === undefined\) return false;/);
    // the OLD gate — a different read — must not survive anywhere in the handler
    expect(handler).not.toMatch(/liveShop === null \|\| liveShop === undefined/);
    // …and the callback re-runs when that read changes, or the gate reads stale
    expect(handler).toMatch(/\[service, identity, liveStorefront\]/);
  });

  it('« ce sera gardé » TRACKS THE SAME READ, so the note cannot promise what the gate refuses', () => {
    expect(app).toMatch(/savesPersist=\{liveStorefront !== null && liveStorefront !== undefined\}/);
  });

  it('A FAILED READ SELF-HEALS — opening Personnaliser re-asks, never a dead session', () => {
    // the read used to leave `undefined` forever on a fault; with the save gated
    // on it, her edits would never persist again for the whole session.
    expect(app).toMatch(/\[service, identity, screen === 'personnaliser'\]/);
  });

  it('NOT-LIVE AND NOT-LOADED ARE DIFFERENT SENTENCES', () => {
    expect(screens).toContain("t('k.enreg.pas_charge')");
    expect(screens).toContain("t('k.enreg.brouillon')");
    expect(screens).toMatch(/shopIsLive === true \? t\('k\.enreg\.pas_charge'\) : t\('k\.enreg\.brouillon'\)/);
  });

  it('K2 NEVER CLAIMS « visible immédiatement » FOR A DRAFT', () => {
    expect(screens).toContain("t('k.enreg.brouillon_toast')");
    expect(screens).not.toMatch(/savesPersist === false \? t\('k\.toast_enregistre'\)/);
  });

  it('K5 ▲▼ PERSISTS — the order rides ONLY the save that changes it', () => {
    // it must reach the wire (the silent no-op)…
    expect(screens).toMatch(/onMove=\{\(pid, dir\) => setSf\(moveItem\(sf, pid, dir\), \{ withOrder: true \}\)\}/);
    expect(screens).toMatch(/opts\?\.withOrder === true \? \{ curatedItems: next\.curatedItems \}/);
    // …but NOT on every save: a stale membership would refuse an unrelated edit
    const setSf = /const setSf = \(next: Storefront, opts\?[\s\S]*?\n  \};/.exec(screens)?.[0] ?? '';
    expect(setSf).not.toMatch(/^\s+curatedItems: next\.curatedItems,$/m);
  });

  it('K2 NEVER TELLS AN ALREADY-PUBLISHED SELLER TO PUBLISH — three states, three sentences', () => {
    expect(screens).toMatch(/savesPersist !== false\s*\n\s*\? t\(r\.toastKey \?\? 'k\.toast_enregistre'\)\s*\n\s*: shopIsLive === true\s*\n\s*\? t\('k\.enreg\.pas_charge'\)\s*\n\s*: t\('k\.enreg\.brouillon_toast'\)/);
  });

  it('A SECTION RENAME SAVES ON LEAVING THE FIELD, not on every keystroke', () => {
    // one POST + one read-back per character on a patchy connection is a loi-7
    // failure, and an emptied field toasted a refusal on each one.
    expect(screens).toMatch(/onRename=\{\(name\) => setSfRaw\(renameSection/);
    expect(screens).toMatch(/onRenameCommit=\{\(name\) => setSf\(renameSection/);
    expect(screens).toMatch(/onCommit\?\.\(value\)/);
  });
});

/**
 * PERSONNALISER-PARITY-1 — K5/K6b/K7 run on HER REAL LISTINGS.
 *
 * They mapped curatedItems through K_SEED (the eight demo products), so her real
 * pids resolved to NOTHING: K5 listed nothing to pin, and she could not feature
 * a real product — which is why her live page had no « Produit à la une ».
 */
describe('PERSONNALISER-PARITY-1 — the catalog seam, executed', () => {
  it('A REAL CATALOG RESOLVES REAL PIDS; the demo seed no longer swallows them — EXECUTED', async () => {
    const { fromCatalog } = await import('../src/vitrine/customize/catalog');
    const catalog = [
      { pid: 'pv-real-1', name: 'Bazin riche', priceFcfa: 11_500, inStock: true, assetRefs: ['https://m/x.jpg'] },
    ];
    // a REAL pid resolves against HER catalog — the exact lookup that returned
    // undefined for every real product when K_SEED was the only source
    expect(fromCatalog(catalog, 'pv-real-1')?.name).toBe('Bazin riche');
    expect(fromCatalog(catalog, 'pv-real-1')?.assetRefs[0]).toBe('https://m/x.jpg');
    // a real catalog NEVER falls back to the seed: an unknown pid is honestly absent
    expect(fromCatalog(catalog, 'p1')).toBeUndefined();
    // no catalog (tests, demo) → the seed still serves, shaped like the seam
    const seed = fromCatalog(undefined, 'p1');
    expect(seed?.name).toBeTruthy();
    expect(seed?.assetRefs).toEqual([]);
  });

  it('WIRING: K5, K6b and K7 consume the catalog, and K_SEED is only the fallback', () => {
    const screens = readFileSync(new URL('../src/vitrine/customize/screens.tsx', import.meta.url), 'utf8');
    // every arrangement surface resolves pids through the seam…
    expect(screens.match(/fromCatalog\(catalog, pid\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    // …and no arrangement surface maps curatedItems/featuredItems through K_SEED any more
    expect(screens).not.toMatch(/curatedItems\.map\(\(pid\) => K_SEED\.find/);
    expect(screens).not.toMatch(/featuredItems\.map\(\(pid\) => K_SEED\.find/);
    // the App passes her real join, priced by the SAME derivation Ma vitrine uses
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    // ROUND 2 (verifier B1): the join reads the SERVICE's curatedItems — the
    // session-local vitrineLive log emptied on every relaunch, so her real pids
    // resolved to nothing after any restart. liveStorefront is the persisted
    // truth; absent ⇒ undefined ⇒ the demo fallback, never a lying empty.
    expect(app).toContain('liveStorefront.curatedItems.includes(o.productVersionId)');
    expect(app).not.toContain('catalog={vitrineOffers.map');
    expect(app).toContain('priceFcfa: viewOfOffer(o).client,');
    expect(app).toMatch(/liveStorefront === null \|\| liveStorefront === undefined\s*\n\s*\? undefined/);
  });

  it('« VOIR COMME CLIENTE » OPENS THE REAL PAGE WHEN THE SHOP IS LIVE', () => {
    // The K7 replica and the real page were two different things claiming the
    // same view (founder walk). For a live shop the cliente view IS the real
    // page — identical by construction, it can never drift again.
    const screens = readFileSync(new URL('../src/vitrine/customize/screens.tsx', import.meta.url), 'utf8');
    expect(screens).toContain(
      "onPress={() => (liveSlug !== undefined && onOpenBoutique !== undefined ? onOpenBoutique(liveSlug) : go('k7'))}",
    );
  });
});

/**
 * ENTETES-C — the framing rides the SAME wire as every K save, tri-state:
 * absent = untouched · null = CLEAR · pair = set. The HTTP adapter posts it
 * AS-IS (JSON keeps null, drops undefined — that IS the tri-state); the demo
 * adapter mirrors the service's two NAMED refusals against the CANON schema
 * and applies the same merge, or it would be a mock greener than the system.
 */
describe('ENTETES-C — coverFocus / avatarFocus on the wire and in the demo', () => {
  it('THE WIRE: a SET pair posts as-is; a CLEAR posts `null` (never dropped, never undefined)', async () => {
    const bodies: unknown[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ status: 'saved' }) } as unknown as Response;
    }) as unknown as typeof fetch;
    try {
      const svc = new HttpStorefrontService('https://svc.example', 'k-test');
      await svc.saveIdentity('sf-1', { coverFocus: { x: 10, y: 90 } }, 'T0');
      await svc.saveIdentity('sf-1', { coverFocus: null, avatarFocus: { x: 40, y: 20 } }, 'T1');
    } finally {
      globalThis.fetch = original;
    }
    expect(bodies[0]).toEqual({ patch: { coverFocus: { x: 10, y: 90 } }, at: 'T0' });
    // the CLEAR really is on the wire as null — JSON.stringify keeps it
    expect(bodies[1]).toEqual({ patch: { coverFocus: null, avatarFocus: { x: 40, y: 20 } }, at: 'T1' });
    expect(JSON.stringify(bodies[1])).toContain('"coverFocus":null');
  });

  it("THE SERVICE'S NAMED REFUSALS SURVIVE — `bad_focus` and `no_photo_to_frame` are not « une erreur »", async () => {
    const original = globalThis.fetch;
    try {
      for (const reason of ['bad_focus', 'no_photo_to_frame']) {
        globalThis.fetch = (async () =>
          ({ ok: false, status: 422, json: async () => ({ status: 'refused', reason }) }) as unknown as Response) as unknown as typeof fetch;
        const svc = new HttpStorefrontService('https://svc.example', 'k');
        expect(await svc.saveIdentity('sf-1', { coverFocus: { x: 1, y: 2 } }, 'T0')).toEqual({ ok: false, reason });
      }
    } finally {
      globalThis.fetch = original;
    }
  });

  it('THE DEMO ADAPTER refuses framing NOTHING by the same name — and a malformed pair by ITS name (canon-checked)', async () => {
    const svc = new DemoStorefrontService();
    await svc.create(CMD);
    // no photo yet (cover none, avatar monogram) → no_photo_to_frame, nothing stored
    expect(await svc.saveIdentity(CMD.id, { coverFocus: { x: 50, y: 50 } }, 'T1')).toEqual({ ok: false, reason: 'no_photo_to_frame' });
    expect(await svc.saveIdentity(CMD.id, { avatarFocus: { x: 50, y: 50 } }, 'T1')).toEqual({ ok: false, reason: 'no_photo_to_frame' });
    // a real photo, then malformed pairs → bad_focus, by the canon schema
    await svc.uploadCover(CMD.id, new Uint8Array([1]), 'image/jpeg');
    for (const bad of [{ x: 50 }, { x: -1, y: 50 }, { x: 1.5, y: 2 }, { x: '50', y: '50' }, { x: 5, y: 6, z: 7 }]) {
      expect(await svc.saveIdentity(CMD.id, { coverFocus: bad as never }, 'T1'), JSON.stringify(bad)).toEqual({
        ok: false,
        reason: 'bad_focus',
      });
    }
  });

  it('THE DEMO ADAPTER round-trips set → read back → clear (key gone), and a NEW upload starts UNFRAMED', async () => {
    const svc = new DemoStorefrontService();
    await svc.create(CMD);
    // the upload WRITES THE URL onto the shop, as the real service does
    await svc.uploadCover(CMD.id, new Uint8Array([1]), 'image/jpeg');
    const withCover = await svc.getById(CMD.id);
    expect(withCover.ok && withCover.value?.cover.url).toBe(`demo://cover/${CMD.id}`);
    // set → read back by value
    expect((await svc.saveIdentity(CMD.id, { coverFocus: { x: 10, y: 90 } }, 'T1')).ok).toBe(true);
    const framed = await svc.getById(CMD.id);
    expect(framed.ok && framed.value?.cover.focus).toEqual({ x: 10, y: 90 });
    // clear → the KEY is gone, never focus:null; the photo itself untouched
    expect((await svc.saveIdentity(CMD.id, { coverFocus: null }, 'T2')).ok).toBe(true);
    const cleared = await svc.getById(CMD.id);
    expect(cleared.ok && cleared.value !== undefined && 'focus' in cleared.value.cover).toBe(false);
    expect(cleared.ok && cleared.value?.cover.url).toBe(`demo://cover/${CMD.id}`);
    // frame again, then a NEW upload — the fresh photo starts unframed
    await svc.saveIdentity(CMD.id, { coverFocus: { x: 33, y: 44 } }, 'T3');
    await svc.uploadCover(CMD.id, new Uint8Array([1, 2]), 'image/jpeg');
    const fresh = await svc.getById(CMD.id);
    expect(fresh.ok && fresh.value !== undefined && 'focus' in fresh.value.cover).toBe(false);
    // …and the AVATAR framing is its own: set on avatar survives a COVER upload
    await svc.uploadAvatar(CMD.id, new Uint8Array([1]), 'image/jpeg');
    await svc.saveIdentity(CMD.id, { avatarFocus: { x: 40, y: 20 } }, 'T4');
    await svc.uploadCover(CMD.id, new Uint8Array([1, 2, 3]), 'image/jpeg');
    const after = await svc.getById(CMD.id);
    expect(after.ok && after.value?.avatar.focus).toEqual({ x: 40, y: 20 });
  });
});

/**
 * PERSONNALISER-HONESTY-1 (founder-caught 2026-07-30, on his own phone) — WHICH
 * SENTENCE A REFUSED SAVE EARNS.
 *
 * He tapped « Masque » in Personnaliser. The service refused it
 * (`unknown_header_style` — the deployed Worker still spoke the six-style canon
 * while the app offered eleven) and the screen answered « Pas enregistré.
 * Réessayez dans un moment. » That refusal was PERMANENT: retrying could never
 * have worked, and the screen sent her to do exactly that.
 *
 * The rule these tests pin is the INVERSION: the retry sentence is earned only by
 * reasons that are genuinely transient, and an UNRECOGNISED reason is treated as
 * permanent — the safe default is the one that makes no promise we cannot keep.
 */
describe('PERSONNALISER-HONESTY-1 — a refused save says the true thing', () => {
  it('the header style the service does not know gets its OWN sentence, never « retry »', async () => {
    const { saveRefusalToastKey } = await import('../src/vitrine/service');
    const { t } = await import('../src/i18n');
    expect(saveRefusalToastKey('unknown_header_style')).toBe('k.enreg.entete_indisponible');
    // …and that sentence does not tell her to try again
    const phrase = t('k.enreg.entete_indisponible');
    expect(phrase).not.toMatch(/[Rr]éessay/);
    expect(phrase.length).toBeGreaterThan(0);
  });

  it('ONLY genuinely transient reasons earn « Réessayez dans un moment »', async () => {
    const { saveRefusalToastKey } = await import('../src/vitrine/service');
    for (const reason of ['offline', 'unreadable', 'http_500', 'http_502', 'http_429', 'http_408']) {
      expect(saveRefusalToastKey(reason), reason).toBe('k.enreg.echec');
    }
    // …and the retry sentence really is the retry sentence (not a stale key)
    const { t } = await import('../src/i18n');
    expect(t('k.enreg.echec')).toMatch(/[Rr]éessay/);
  });

  it('a permanent refusal — including one this app has never heard of — makes NO retry promise', async () => {
    const { saveRefusalToastKey } = await import('../src/vitrine/service');
    const { t } = await import('../src/i18n');
    // 4xx that is not a timeout/rate-limit: the request was understood and refused
    expect(saveRefusalToastKey('http_400')).toBe('k.enreg.refus');
    expect(saveRefusalToastKey('http_403')).toBe('k.enreg.refus');
    // a reason from a NEWER service this build has never seen
    expect(saveRefusalToastKey('unknown_theme')).toBe('k.enreg.refus');
    expect(saveRefusalToastKey('some_reason_from_the_future')).toBe('k.enreg.refus');
    expect(t('k.enreg.refus')).not.toMatch(/[Rr]éessay/);
  });

  it('the NAMED field refusals keep their own existing sentences (nothing regressed)', async () => {
    const { saveRefusalToastKey } = await import('../src/vitrine/service');
    expect(saveRefusalToastKey('name_too_short')).toBe('k.identite.nom_requis');
    expect(saveRefusalToastKey('name_too_long')).toBe('k.identite.nom_requis');
    expect(saveRefusalToastKey('featured_over_cap')).toBe('k.une.refus_cap');
    expect(saveRefusalToastKey('sections_over_cap')).toBe('k.sections.refus_cap');
    expect(saveRefusalToastKey('section_name_empty')).toBe('k.enreg.section_nom');
    expect(saveRefusalToastKey('section_name_too_long')).toBe('k.enreg.section_nom');
  });

  it('every key this decision can return EXISTS in the catalog (t throws otherwise)', async () => {
    const { saveRefusalToastKey } = await import('../src/vitrine/service');
    const { t } = await import('../src/i18n');
    const reasons = [
      'offline', 'unreadable', 'http_500', 'http_400', 'name_too_short', 'name_too_long',
      'featured_over_cap', 'sections_over_cap', 'section_name_empty', 'section_name_too_long',
      'unknown_header_style', 'unknown_theme', 'anything_else',
    ];
    for (const r of reasons) {
      expect(t(saveRefusalToastKey(r)).length, r).toBeGreaterThan(0);
    }
  });
});
