import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance, type Seance } from './seance';

/**
 * ═══ REVENDEUSE-VRAIE-1 (AUDIT-3 A-03 + A-06) — HER BOUTIQUE EDITS AGAINST THE REAL WORKER ═══
 *
 * The seam the slice crosses: an edit to her boutique (phrase, bio) made with
 * no network is KEPT on the phone (the app's own `FileAttente`, on a real
 * file, under `PID_BOUTIQUE`), survives a cold boot, and leaves through the
 * app's own port (`HttpStorefrontService.saveIdentity`) when the network
 * returns. The LEDGER decides: the page a cliente opens (`GET /s/{slug}`),
 * never the write's own answer.
 *
 * It also CERTIFIES the walks' fake to the Worker's real words: a refused
 * name is a 422 the app reads as `name_too_short` — a named refusal, failed at
 * once, never « waiting » — and an accepted save answers `{ status }`.
 *
 * The replay below is the App's (App.tsx `rejouer`, `storefront.identity`
 * branch) and the deposit is the App's (`saveIdentity`: the earlier kept
 * patch, overlaid by her newest word per field) — the same two steps, on the
 * app's own port, outbox and verdict rule.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'revendeuse-vraie-'));
const disque = mkdtempSync(join(tmpdir(), 'revendeuse-vraie-outbox-'));

const SF_ID = 'sf-revendeuse-001';
const SLUG = 'revendeuse-0001';

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', COMPTES: 'ResellerAccountsDO' },
  durableObjectsPersist: persist,
  bindings: { CHECKOUT_OPS_SECRET: OPS_SECRET },
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
  rmSync(disque, { recursive: true, force: true });
});

/** The network switch around the app's `fetch`: dead ⇒ RN's own throw. */
const reseau = { mort: false };
let S: Seance;
beforeAll(async () => {
  S = await seance(mf, 'revendeuse');
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (reseau.mort) throw new TypeError('Network request failed');
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const { signal: _signal, ...reste } = init ?? {};
    return (await mf.dispatchFetch(url, reste as never)) as unknown as Response;
  }) as typeof fetch;
});

type App = typeof import('../../../apps/reseller-app/src/vitrine/service.js');
type Outbox = typeof import('../../../apps/reseller-app/src/offline/queue.js');
async function app(): Promise<{ svc: App; box: Outbox }> {
  return {
    svc: await import('../../../apps/reseller-app/src/vitrine/service.js'),
    box: await import('../../../apps/reseller-app/src/offline/queue.js'),
  };
}

function store(path: string) {
  return {
    async read(): Promise<string | null> {
      return existsSync(path) ? readFileSync(path, 'utf8') : null;
    },
    async write(data: string): Promise<void> {
      writeFileSync(path, data);
    },
  };
}

/** THE LEDGER — the page a cliente opens. Credential-free, as it must be. */
async function boutique(): Promise<{ name: string; tagline: string; bio: string }> {
  const res = await mf.dispatchFetch(`http://sf/s/${SLUG}`, { method: 'GET' });
  expect(res.status).toBe(200);
  return (await res.json()) as never;
}

describe('REVENDEUSE-VRAIE-1 — a boutique edit made offline waits on the phone and lands when the network returns', () => {
  it('two offline edits keep her last word per field · survive a cold boot · land on the first live pass · the cliente’s page shows them · the entry leaves the file', async () => {
    const { svc, box } = await app();
    const port = new svc.HttpStorefrontService('https://sf', async () => S.session);

    const created = await port.create({
      commandId: 'c-revendeuse-001', id: SF_ID, resellerId: S.accountId, shortCode: 'REVENDEUSE-0001',
      name: 'Boutique Awa', zone: 'Ouagadougou', category: 'Général', correlationId: 'corr-revendeuse-001',
    });
    expect(created.ok, JSON.stringify(created)).toBe(true);
    expect((await port.publish(SF_ID, 'corr-revendeuse-001')).ok).toBe(true);
    expect((await boutique()).tagline).toBe('');

    // THE APP'S DEPOSIT: the earlier kept patch, overlaid by her newest word.
    const garder = async (q: InstanceType<Outbox['FileAttente']>, patch: Record<string, unknown>) => {
      const deja = q.tout().find((e) => e.name === 'storefront.identity');
      const avant = (deja?.payload['patch'] ?? {}) as Record<string, unknown>;
      await q.deposer('storefront.identity', box.PID_BOUTIQUE, { patch: { ...avant, ...patch } });
    };
    // THE APP'S REPLAY of a kept boutique change.
    const envoyer = async (entry: { name: string; payload: Readonly<Record<string, unknown>> }) => {
      expect(entry.name).toBe('storefront.identity');
      const res = await port.saveIdentity(SF_ID, (entry.payload['patch'] ?? {}) as never);
      return res.ok ? ({ kind: 'delivered' } as const) : svc.verdictReplay(res.reason);
    };

    // ── run 1: no network. Each save fails on the network — the App's queue road.
    const fichier = join(disque, 'file-attente.v1.json');
    const q1 = await box.FileAttente.ouvrir(store(fichier));
    reseau.mort = true;
    const direct = await port.saveIdentity(SF_ID, { tagline: 'Le wax de Gounghin' });
    expect(direct.ok).toBe(false);
    expect(!direct.ok && svc.raisonReseau(direct.reason), 'the dead network is the reason the App keeps it').toBe(true);
    await garder(q1, { tagline: 'Première phrase' });
    await garder(q1, { tagline: 'Le wax de Gounghin', bio: 'Livré par Séra.' });
    expect(q1.tout(), 'ONE entry for her boutique, her last word per field').toHaveLength(1);
    const mort = await q1.rejouer(envoyer);
    expect(mort).toEqual({ livres: 0, refuses: 0, restants: 1, arret: 'reseau' });
    expect((await boutique()).tagline, 'THE LEDGER: nothing landed').toBe('');

    // ── (app killed) run 2: cold boot over the same file, the network is back
    reseau.mort = false;
    const q2 = await box.FileAttente.ouvrir(store(fichier));
    expect(q2.enAttente().map((e) => [e.name, e.pid]), 'the kept boutique change survives the reboot').toEqual([['storefront.identity', box.PID_BOUTIQUE]]);
    expect(await q2.rejouer(envoyer)).toEqual({ livres: 1, refuses: 0, restants: 0, arret: 'aucun' });
    const page = await boutique();
    expect(page.tagline, 'THE LEDGER: her newest phrase, not the one she replaced').toBe('Le wax de Gounghin');
    expect(page.bio).toBe('Livré par Séra.');
    expect(page.name, 'a field she did not touch is untouched').toBe('Boutique Awa');
    expect((await box.FileAttente.ouvrir(store(fichier))).tout(), 'the delivered change left the file').toEqual([]);
  }, 60_000);

  it('CERTIFIES the walks’ fake: an accepted save answers `{ status }`; a refused name is `name_too_short` — kept, it fails at once with that word, never « waiting »', async () => {
    const { svc, box } = await app();
    const port = new svc.HttpStorefrontService('https://sf', async () => S.session);
    reseau.mort = false;

    const ok = await port.saveIdentity(SF_ID, { tagline: 'Phrase du jour' });
    expect(ok.ok && typeof ok.value.status, JSON.stringify(ok)).toBe('string');

    const refus = await port.saveIdentity(SF_ID, { name: 'A' });
    expect(!refus.ok && refus.reason).toBe('name_too_short');

    const q = await box.FileAttente.ouvrir(store(join(disque, 'refus.json')));
    await q.deposer('storefront.identity', box.PID_BOUTIQUE, { patch: { name: 'A' } });
    const bilan = await q.rejouer(async (entry) => {
      const res = await port.saveIdentity(SF_ID, (entry.payload['patch'] ?? {}) as never);
      return res.ok ? { kind: 'delivered' } : svc.verdictReplay(res.reason);
    });
    expect(bilan).toEqual({ livres: 0, refuses: 1, restants: 0, arret: 'aucun' });
    expect(q.echecs().map((e) => e.failureReason)).toEqual(['name_too_short']);
    expect((await boutique()).name, 'THE LEDGER: the refused name never landed').toBe('Boutique Awa');
  }, 60_000);
});
