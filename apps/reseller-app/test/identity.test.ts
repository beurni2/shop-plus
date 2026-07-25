import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IDENTITY_VERSION, digitsFromBytes, identityFromDigits } from '../src/identity/mint';
import { InMemoryIdentityStore, loadOrMintIdentity, type RandomBytes } from '../src/identity/store';

/**
 * RESELLER-IDENTITY-1 — the identity must SURVIVE a restart and must NEVER be
 * fabricated. These assert the two properties the founder's preview walk exposed:
 * the slug moved every session (`aichomod-8291` → `chezaichamod-4911`), and
 * `resellerId` moved with it, so he was a different reseller each launch.
 */

const bytes = (...b: number[]): Uint8Array => new Uint8Array(b);
const fixed = (...b: number[]): RandomBytes => () => bytes(...b);

describe('digitsFromBytes — 4 digits, no modulo bias, never Math.random', () => {
  it('maps big-endian byte pairs into 0000..9999, zero-padded', () => {
    // 0x0000 = 0 → '0000' proves the padding, which a naive String() would drop and
    // which the canon shortCode shape `[A-Z]{2,12}-[0-9]{4}` would then reject.
    expect(digitsFromBytes(bytes(0x00, 0x00))).toBe('0000');
    expect(digitsFromBytes(bytes(0x00, 0x2a))).toBe('0042');
    expect(digitsFromBytes(bytes(0x27, 0x0f))).toBe('9999'); // 9999
  });

  it('REJECTS biased draws and walks to the next pair — the bias is real, not theoretical', () => {
    // 10000 does not divide 65536, so values >= 60000 would over-represent 0..5535.
    // 0xEA60 = 60000 is the first biased value: it must be skipped, not folded.
    expect(digitsFromBytes(bytes(0xea, 0x60, 0x00, 0x07))).toBe('0007');
    // A naive `% 10000` would have returned '0000' from that first pair.
    expect(digitsFromBytes(bytes(0xea, 0x60, 0x00, 0x07))).not.toBe('0000');
  });

  it('THROWS when every pair is biased — never degrades to a biased value silently', () => {
    expect(() => digitsFromBytes(bytes(0xff, 0xff, 0xff, 0xff))).toThrow(/exhausted/);
  });
});

describe('identityFromDigits — commandId is DERIVED, which is why a re-tap is idempotent', () => {
  it('derives every id from the one persisted value, deterministically', () => {
    const a = identityFromDigits('4821');
    expect(a).toEqual({
      digits: '4821',
      storefrontId: 'sf-4821',
      resellerId: 'rs-4821',
      commandId: 'create-sf-4821',
      correlationId: 'corr-sf-4821',
    });
    // THE property that makes persistence sufficient: same digits ⇒ same commandId.
    // storefront-core's decideCreate returns `idempotent` only on a MATCHING
    // commandId and `collision` otherwise, so an independently-random commandId
    // would turn every restart into a collision. Asserted so the "hygiene" refactor
    // that would break re-tap fails here first.
    expect(identityFromDigits('4821').commandId).toBe(a.commandId);
  });
});

describe('loadOrMintIdentity — survives restart, refuses to fabricate', () => {
  it('mints once, then RETURNS THE SAME IDENTITY on every later launch', async () => {
    const store = new InMemoryIdentityStore();
    const first = await loadOrMintIdentity(store, fixed(0x12, 0xd5));
    expect(first.ok && first.minted).toBe(true);

    // A DIFFERENT random source on the second "launch" — if the stored value were
    // ignored, this would produce different digits and the test would catch it.
    const second = await loadOrMintIdentity(store, fixed(0x00, 0x01));
    expect(second.ok && second.minted).toBe(false);
    expect(second.ok && second.identity).toEqual(first.ok ? first.identity : null);
    // The regression in one line: the reseller is the SAME person across launches.
    expect(second.ok && second.identity.resellerId).toBe(first.ok ? first.identity.resellerId : 'x');
  });

  it('a PERSIST FAILURE returns no identity — a minted id that did not survive is not an identity', async () => {
    const outcome = await loadOrMintIdentity(new InMemoryIdentityStore(true), fixed(0x12, 0xd5));
    expect(outcome).toEqual({ ok: false, reason: 'persist_failed' });
    // This is the confident-success shape refused one layer down: had it returned the
    // identity anyway, the app would write a storefront she could never return to.
  });

  it('a MINT FAILURE (no CSPRNG) returns no identity — never a Math.random fallback', async () => {
    const noCsprng: RandomBytes = () => {
      throw new Error('no secure random source');
    };
    expect(await loadOrMintIdentity(new InMemoryIdentityStore(), noCsprng)).toEqual({ ok: false, reason: 'mint_failed' });
  });

  it('an UNREADABLE store is treated as absent and mints — a read failure is not fatal', async () => {
    const outcome = await loadOrMintIdentity(new InMemoryIdentityStore(false, true), fixed(0x12, 0xd5));
    expect(outcome.ok && outcome.minted).toBe(true);
  });

  it('a stored blob from a FUTURE version is re-minted, never misread as this one', async () => {
    const store = new InMemoryIdentityStore();
    await store.write(JSON.stringify({ version: IDENTITY_VERSION + 1, digits: '1111' }));
    const outcome = await loadOrMintIdentity(store, fixed(0x00, 0x2a));
    expect(outcome.ok && outcome.minted).toBe(true);
    expect(outcome.ok && outcome.identity.digits).toBe('0042');
  });

  it('a corrupt blob is re-minted rather than crashing the app on launch', async () => {
    const store = new InMemoryIdentityStore();
    await store.write('{not json');
    expect((await loadOrMintIdentity(store, fixed(0x00, 0x2a))).ok).toBe(true);
  });
});

describe('the mint path carries NO Math.random — the defect that started this', () => {
  const read = (p: string): string => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

  it('App.tsx no longer mints an identity from Math.random', () => {
    // Scans CODE for the call, not prose: the comments here legitimately name
    // `Math.random` as the thing being forbidden.
    const app = read('App.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(app).not.toMatch(/Math\.random/);
  });

  it('neither identity module reaches for Math.random, in code or as a fallback', () => {
    for (const f of ['src/identity/mint.ts', 'src/identity/store.ts', 'src/identity/expoStore.ts']) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      expect(src, `${f} must not draw from Math.random`).not.toMatch(/Math\.random/);
    }
  });

  it('the production store draws from expo-crypto, so the CSPRNG claim is not vacuous', () => {
    expect(read('src/identity/expoStore.ts')).toMatch(/from 'expo-crypto'/);
    expect(read('src/identity/expoStore.ts')).toMatch(/getRandomBytes/);
  });
});

/**
 * SEAM-PRESENCE-1 — THE OPERATOR LINE STATES PRESENCE, NEVER THE VALUE.
 *
 * The write key had exactly the failure the host line was added to catch: the app
 * sent a key, the Worker refused it 401, and unconfigured / 401 / unreachable /
 * genuinely-empty all render as one identical card BY DESIGN. The card is right for
 * the reseller and useless for the operator, so the footer carries what it cannot.
 * These assert the boundary: PRESENCE, never the value, never a prefix, never a hash.
 */
describe('the operator line never leaks the key', () => {
  const app = readFileSync(join(import.meta.dirname, '..', 'App.tsx'), 'utf8');

  it('the key is reduced to a BOOLEAN at its only read site — nothing downstream can render it', () => {
    // The one permitted read is the presence test itself.
    const reads = [...app.matchAll(/process\.env\.EXPO_PUBLIC_STOREFRONT_WRITE_KEY/g)];
    expect(reads).toHaveLength(1);
    expect(app).toContain("const SEAM_KEY_PRESENT = (process.env.EXPO_PUBLIC_STOREFRONT_WRITE_KEY ?? '') !== '';");
  });

  it('no substring, slice or hash of the key reaches a rendered string', () => {
    const code = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    // A prefix is a value with fewer characters; a hash of a short secret is a value
    // with extra steps. Neither is permitted, so neither shape may appear near it.
    expect(code).not.toMatch(/EXPO_PUBLIC_STOREFRONT_WRITE_KEY[^\n]*\.(slice|substring|substr)/);
    expect(code).not.toMatch(/EXPO_PUBLIC_STOREFRONT_WRITE_KEY[^\n]*(hash|digest|sha)/i);
    // …and the boolean, not the env read, is what the render site consumes.
    expect(code).toMatch(/SEAM_KEY_PRESENT \? 'seam\.cle_presente' : 'seam\.cle_absente'/);
  });

  it('the feed state maps every branch to a catalog key — the fourth fact the empty card hides', () => {
    for (const key of ['seam.produits_chargement', 'seam.produits_recus', 'seam.produits_non_relie', 'seam.produits_indisponibles']) {
      expect(app, `${key} must be reachable from feedStateKey`).toContain(key);
    }
  });
});
