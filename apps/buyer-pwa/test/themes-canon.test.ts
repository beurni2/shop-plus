import { describe, expect, it } from 'vitest';
import { STOREFRONT_THEMES } from '@platform/contracts';
import { VITRINE_THEMES, DEFAULT_THEME, applyTheme, type VitrineThemeKey } from '../src/vitrine/themes';

/**
 * THEMES-8b — THE BUYER'S HABILLAGE RECORD IS PINNED TO CANON, AND THE WIRE
 * CANNOT HAND IT A KEY IT HAS NO TOKENS FOR.
 *
 * Written after a verifier finding, and the finding was right: the reseller app
 * had this mirror (`customize.test.ts`) and the headers had it
 * (`entetes.test.ts`, « pinned to the EXECUTED canon import »), but the buyer's
 * own theme record had neither a pin nor a boundary guard. The failure was not
 * a wrong colour — `applyTheme` reads `VITRINE_THEMES[key].accent` and
 * `render.ts` indexes the same record at four more sites, so an unknown key
 * throws BEFORE `root.innerHTML` is assigned and the buyer gets a blank page.
 *
 * Two independent defences, because they fail in different directions:
 *   · the MIRROR catches a canon habillage this bundle has no tokens for —
 *     at build time, in CI, before anyone ships it;
 *   · the BOUNDARY catches a deployed service that is one habillage ahead of a
 *     cached bundle — at runtime, on her phone, where CI cannot reach.
 * « Pas enregistré » was this same three-artifact skew pointing the other way.
 */
describe('THEMES-8b — the buyer habillage record ⇄ canon', () => {
  it('VITRINE_THEMES is exactly the canon STOREFRONT_THEMES (executed import), both directions', () => {
    expect(Object.keys(VITRINE_THEMES).sort()).toEqual([...STOREFRONT_THEMES].sort());
    // …and the default is one of them, so the boundary's fallback can never be
    // the very hole it is there to plug.
    expect(STOREFRONT_THEMES as readonly string[]).toContain(DEFAULT_THEME);
  });

  it('every canon habillage carries a COMPLETE token set — no undefined reaches a CSS variable', () => {
    for (const key of STOREFRONT_THEMES) {
      const t = VITRINE_THEMES[key as VitrineThemeKey];
      expect(t, `${key} has no tokens`).toBeDefined();
      for (const field of ['name', 'accent', 'deep', 'soft', 'on', 'sh'] as const) {
        expect(typeof t[field], `${key}.${field}`).toBe('string');
        expect(t[field], `${key}.${field} is empty`).not.toBe('');
      }
      // the four colour fields are real hex, not a placeholder that would paint
      // nothing: `--vt-accent: undefined` fails silently in CSS, which is how a
      // missing token becomes an invisible price band rather than a red test.
      for (const field of ['accent', 'deep', 'soft', 'on'] as const) {
        expect(t[field], `${key}.${field}`).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });

  /** This suite runs on the node environment (no jsdom anywhere in it — the
   *  buyer tests assert on rendered HTML strings). `applyTheme` touches exactly
   *  two things, so a recording stub covers its whole surface and costs the
   *  project no new dependency. */
  const stubRoot = () => {
    const classes = new Set<string>();
    const vars = new Map<string, string>();
    return {
      classes,
      vars,
      el: {
        classList: { add: (c: string) => void classes.add(c), remove: (c: string) => void classes.delete(c) },
        style: { setProperty: (k: string, v: string) => void vars.set(k, v) },
      } as unknown as HTMLElement,
    };
  };

  it('applyTheme sets every --vt-* variable from the record, for EVERY canon habillage', () => {
    for (const key of STOREFRONT_THEMES) {
      const { el, classes, vars } = stubRoot();
      applyTheme(el, key as VitrineThemeKey);
      const t = VITRINE_THEMES[key as VitrineThemeKey];
      expect(vars.get('--vt-accent'), key).toBe(t.accent);
      expect(vars.get('--vt-deep'), key).toBe(t.deep);
      expect(vars.get('--vt-soft'), key).toBe(t.soft);
      expect(vars.get('--vt-on'), key).toBe(t.on);
      expect(vars.get('--vt-sh'), key).toBe(t.sh);
      expect(vars.get('--vt-accent10'), key).toBe(`${t.accent}1A`);
      // no variable may be handed the string "undefined" — CSS swallows that
      // silently, which is how a missing token becomes an invisible price band
      // instead of a red test
      for (const [k, v] of vars) expect(v, `${key} ${k}`).not.toMatch(/undefined/);
      expect([...classes], key).toEqual([`vt-theme-${key}`]);
    }
  });

  it('a RE-THEME leaves exactly one habillage class, across the whole set', () => {
    const { el, classes } = stubRoot();
    for (const key of STOREFRONT_THEMES) applyTheme(el, key as VitrineThemeKey);
    const last = STOREFRONT_THEMES[STOREFRONT_THEMES.length - 1]!;
    // the removal list in applyTheme is derived from the record; a hand-typed
    // one would leave the earlier seven classes stacked here
    expect([...classes]).toEqual([`vt-theme-${last}`]);
  });

  it('the cliente harness list is DERIVED from the record — no second hand-typed habillage list', async () => {
    // `clienteTheme` lives in main.ts, which mounts the app on import, so it
    // cannot be driven directly from here — this reads the source instead. The
    // defect it pins is concrete: this list said four while the set was eight,
    // so `?theme=brique` — the founder's own new habillage — silently rendered
    // indigo. The mutation that restores the literal must go red.
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
    const line = src.split('\n').find((l) => l.includes('const CLIENTE_THEMES'));
    expect(line, 'CLIENTE_THEMES not found — renamed or moved, so this pin is watching nothing').toBeDefined();
    expect(line).toContain('Object.keys(VITRINE_THEMES)');
    expect(line, 'a hand-typed list of quoted keys is the defect').not.toMatch(/\[\s*'/);
  });

  it('THE BOUNDARY: an unknown wire theme becomes the default instead of throwing on her phone', async () => {
    const { httpStorefrontPort } = await import('../src/vitrine/profile');
    const base = {
      id: 'sf-1', slug: 'aicha-4821', resellerId: 'rs-1', name: 'Chez Aïcha',
      zone: 'Ouagadougou', category: 'Général', theme: 'laterite', headerStyle: 'classique',
      discoverable: true, curatedItems: [], featuredItems: [], sections: [],
      createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z',
    };
    const withTheme = async (theme: unknown): Promise<string | undefined> => {
      const original = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ ...base, theme }), { status: 200 })) as typeof fetch;
      try {
        const resolved = await httpStorefrontPort('http://x').resolve('aicha-4821');
        return resolved?.storefront.theme;
      } finally {
        globalThis.fetch = original;
      }
    };
    // the CONTROL — a real habillage rides through untouched, so the guard is
    // not simply flattening everything to the default
    expect(await withTheme('aubergine')).toBe('aubergine');
    // …and everything that would have crashed `VITRINE_THEMES[key].accent`
    // lands on the default instead
    expect(await withTheme('sahel')).toBe(DEFAULT_THEME); // the retired key
    expect(await withTheme('neuvieme')).toBe(DEFAULT_THEME); // a habillage this bundle predates
    expect(await withTheme(undefined)).toBe(DEFAULT_THEME); // a service older than the field
    expect(await withTheme(42)).toBe(DEFAULT_THEME); // a hostile wire
    expect(await withTheme('constructor')).toBe(DEFAULT_THEME); // and an inherited property is not a habillage
  });
});
