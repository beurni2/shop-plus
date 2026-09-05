import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import * as double from './doubles/react-native';
import * as svgDouble from './doubles/react-native-svg';
import * as cryptoDouble from './doubles/expo-crypto';
import * as fsDouble from './doubles/expo-file-system';
import * as audioDouble from './doubles/expo-audio';
import * as videoDouble from './doubles/expo-video';
import * as simpleDouble from './doubles/expo-simple';
import * as gradientDouble from './doubles/expo-linear-gradient';

/**
 * ═══ RENDU-RÉEL — the harness holds ITSELF to the mock-certification law ═══
 *
 * Execution Contract §3, and §9.8 in one line: « a mock that makes integration
 * look healthier than it is is a bug you own. » A render harness is the most
 * dangerous mock in a repo — every screen walk stands on it — so its surface is
 * CHECKED against what the app actually imports, not maintained by hand.
 *
 * Without this, adding `import { SectionList } from 'react-native'` to a screen
 * gives `undefined`, React renders nothing where the list was, and every walk
 * keeps passing over the hole.
 */

const appDir = join(import.meta.dirname, '..');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const files = [...sources(join(appDir, 'src')), join(appDir, 'App.tsx')];

/**
 * BOTH QUOTE STYLES, AND THE NON-NAMED FORMS. The rider app paid for this
 * lesson: a single-quote-only regex went green over
 * `import { Modal } from "react-native";` — `Modal` undefined at runtime, the
 * modal rendering as nothing, the sweep's own docblock claiming that could not
 * happen. Namespace imports are swept member by member; a bare default import
 * from anything but the svg module is refused outright as unsweepable.
 */
const NAMED = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
const WHOLE = /import\s+(?!type\s)(\w+|\*\s+as\s+\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s*['"]([^'"]+)['"]/g;

/**
 * Each doubled module, with the module object the app will actually get.
 *
 * THIS LIST MIRRORS `vitest.config.ts` AND NOTHING ELSE. A module the config
 * aliases but this list omits would be swept by nobody; a module this list
 * carries but the config does not alias would be certified against a double
 * the app never receives. Both are lies, so the first test below pins them
 * equal rather than trusting the reader to keep two lists in step.
 */
const DOUBLED: readonly { readonly spec: string; readonly mod: Record<string, unknown> }[] = [
  { spec: 'react-native', mod: double as unknown as Record<string, unknown> },
  { spec: 'react-native-svg', mod: svgDouble as unknown as Record<string, unknown> },
  { spec: 'expo-crypto', mod: cryptoDouble as unknown as Record<string, unknown> },
  { spec: 'expo-file-system', mod: fsDouble as unknown as Record<string, unknown> },
  { spec: 'expo-audio', mod: audioDouble as unknown as Record<string, unknown> },
  { spec: 'expo-video', mod: videoDouble as unknown as Record<string, unknown> },
  { spec: 'expo-status-bar', mod: simpleDouble as unknown as Record<string, unknown> },
  { spec: 'expo-font', mod: simpleDouble as unknown as Record<string, unknown> },
  { spec: 'expo-updates', mod: simpleDouble as unknown as Record<string, unknown> },
  { spec: 'expo-image-picker', mod: simpleDouble as unknown as Record<string, unknown> },
  { spec: 'expo-image-manipulator', mod: simpleDouble as unknown as Record<string, unknown> },
  { spec: 'expo-linear-gradient', mod: gradientDouble as unknown as Record<string, unknown> },
];

describe('every double is CERTIFIED to what the app imports', () => {
  it('the sweep covers exactly the modules the vitest config aliases', () => {
    const config = readFileSync(join(appDir, 'vitest.config.ts'), 'utf8');
    // The alias block is the ARRAY form (a regex entry for .ttf assets sits
    // beside the module names); only the named modules are swept here, and the
    // asset entry is deliberately excluded — a font file has no members.
    const aliased = [...config.matchAll(/\{ find: '([^']+)', replacement: at\(/g)].map((m) => m[1]);
    expect(aliased.length, 'the alias block is empty or its shape changed').toBeGreaterThan(0);
    expect([...aliased].sort()).toEqual(DOUBLED.map((d) => d.spec).sort());
  });

  it('each named import the app takes from a doubled module exists on that double', () => {
    const missing: string[] = [];
    let seen = 0;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const rel = f.replace(appDir, '.');
      for (const m of src.matchAll(NAMED)) {
        const target = DOUBLED.find((d) => d.spec === m[2]);
        if (target === undefined) continue;
        const typeOnly = /import\s*type\s*\{/.test(m[0]);
        for (const raw of (m[1] ?? '').split(',')) {
          const trimmed = raw.trim();
          if (trimmed === '') continue;
          seen += 1;
          const name = trimmed.replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim();
          // Types vanish at runtime; only values must exist on the double.
          if (typeOnly || trimmed.startsWith('type ')) continue;
          if (!(name in target.mod)) missing.push(`${name} from '${m[2]}' (${rel})`);
        }
      }
      for (const m of src.matchAll(WHOLE)) {
        const target = DOUBLED.find((d) => d.spec === m[2]);
        if (target === undefined) continue;
        const form = (m[1] ?? '').trim();
        const ns = /^\*\s+as\s+(\w+)$/.exec(form);
        if (ns !== null) {
          /**
           * A NAMESPACE IMPORT LETS EVERY MEMBER THROUGH UNSWEPT — and this
           * app has four (`import * as Crypto from 'expo-crypto'`). Exempting
           * them would be the sweep excusing its own blind spot, so every
           * `Alias.member` the file actually uses is checked against the
           * double. A new `Crypto.digestString(...)` the double lacks fails
           * HERE rather than arriving as `undefined` inside an upload.
           */
          const used = new RegExp(`\\b${ns[1]}\\.(\\w+)`, 'g');
          let any = false;
          for (const u of src.matchAll(used)) {
            any = true;
            seen += 1;
            const name = u[1]!;
            if (!(name in target.mod)) missing.push(`${ns[1]}.${name} from '${m[2]}' (${rel})`);
          }
          if (!any) missing.push(`namespace import « ${form} » from '${m[2]}' with no readable use (${rel})`);
          continue;
        }
        // A DEFAULT import. `react-native-svg` legitimately has one (the icons
        // import `Svg` that way); anything else is unsweepable and refused.
        if (m[2] !== 'react-native-svg') {
          missing.push(`unsweepable import form « ${form} » from '${m[2]}' (${rel})`);
        }
      }
    }
    expect(seen, 'the sweep found no imports — it has stopped looking').toBeGreaterThan(30);
    expect(missing, 'the app imports these and the doubles do not provide them').toEqual([]);
  });

  it('the svg double keeps its default export — the icons import Svg that way', () => {
    expect((svgDouble as unknown as { default?: unknown }).default).toBeDefined();
  });

  it('the .ttf asset alias is present — without it the real App cannot even import', () => {
    const config = readFileSync(join(appDir, 'vitest.config.ts'), 'utf8');
    expect(config).toMatch(/find: \/\\.ttf\$\//);
  });

  it('the double provides the handlers a control is driven by', () => {
    // The harness presses by `onPress` and types by `onChangeText`; if the host
    // components stopped passing props through, every press would silently do
    // nothing and every walk would still pass.
    expect(typeof double.View).toBe('function');
    expect(typeof double.Pressable).toBe('function');
    expect(typeof double.StyleSheet.create).toBe('function');
    expect(typeof double.Animated.Value).toBe('function');
  });

  /** RENDER it, never inspect the element tree: `React.createElement(fn)` holds
   *  a function, and a check that stringified it would pass over a header that
   *  renders nothing. The defect below was exactly « present as a prop, absent
   *  on screen », so only rendering can tell. */
  const renderList = (props: Record<string, unknown>): string => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(double.FlatList, props));
    });
    // READ AFTER act RETURNS: React 19 commits on the way out, so a toJSON
    // taken inside the callback answers `null` — which would have looked like
    // « the header does not render » no matter what the double does.
    return JSON.stringify(tree.toJSON());
  };

  it('FlatList renders its HEADER and FOOTER, not only its rows', () => {
    // THE DEFECT THIS PINS, found on 2026-08-11 while walking the 44 px
    // arrangement rows: `ListHeaderComponent` fell into the rest-props and was
    // handed to the host element as a plain prop, so it never rendered. Ma
    // Vitrine keeps its title, its public/privée toggle and « Personnaliser ma
    // boutique » in that header — every one of them reported NOT ON SCREEN to
    // every walk, and any walk asserting one had disappeared would have passed
    // over a region that was never drawn. A double that shows less than the app
    // is still a double that lies (§9.8).
    const flat = renderList({
      data: ['ligne'],
      renderItem: ({ item }: { item: unknown }) => String(item),
      ListHeaderComponent: () => 'EN-TETE',
      ListFooterComponent: 'PIED',
    });
    expect(flat, 'the header must render').toContain('EN-TETE');
    expect(flat, 'a footer given as an ELEMENT, not a component, renders too').toContain('PIED');
    expect(flat, 'and the rows are still there').toContain('ligne');
  });

  it('FlatList draws header and footer even when the list is EMPTY', () => {
    // The real list does, and Ma Vitrine's « no articles yet » state relies on
    // it: a walk on an empty shop must still be able to reach the door.
    const flat = renderList({
      data: [],
      renderItem: () => null,
      ListHeaderComponent: () => 'EN-TETE',
      ListEmptyComponent: () => 'VIDE',
      ListFooterComponent: () => 'PIED',
    });
    expect(flat).toContain('EN-TETE');
    expect(flat).toContain('VIDE');
    expect(flat).toContain('PIED');
  });

  it('a control answers to its accessibilityLabel, not only to its text', () => {
    // The thumbnail strips are `<Pressable>`s holding ONE `<Image>` and no text
    // at all. Matching on text alone made them unpressable by any walk — and
    // `press` would have called them « not on screen », which is the WRONG
    // diagnosis, not merely a missing one.
    const src = readFileSync(join(appDir, 'test/rendu.tsx'), 'utf8');
    expect(src).toContain("const a11y = n.props['accessibilityLabel'];");
    // Both finders must use it, or « is it there » and « is it pressable »
    // answer from two different worlds.
    expect(src.match(/labelOf\(p\)\.includes\(label\)/g) ?? []).toHaveLength(2);
  });

  it('Modal hides its children when it is not visible', () => {
    // A double that always rendered them would let a walk « find » a control
    // behind a closed overlay — the exact false green this harness exists to
    // stop, one layer down.
    expect(double.Modal({ visible: false, children: 'x' })).toBeNull();
    expect(double.Modal({ visible: true, children: 'x' })).not.toBeNull();
  });

  // The marker stays in the comment, never in the title: `no-emoji` scans
  // string literals in app chrome and a test name is one.
  it('and it states its own bound — no walk may claim appearance from it', () => {
    /**
     * The one thing a reader must not do with this harness is trust it about
     * how a screen LOOKS. `StyleSheet.create` is identity and nothing here lays
     * anything out. That bound is written at the top of the double, and this
     * asserts the warning is still there — a bound nobody can read is a bound
     * nobody keeps.
     */
    const src = readFileSync(join(appDir, 'test/doubles/react-native.tsx'), 'utf8');
    expect(src).toContain('IT PROVIDES NOTHING ELSE');
    expect(src).toContain('may NEVER\n *   claim anything about appearance');
  });
});
