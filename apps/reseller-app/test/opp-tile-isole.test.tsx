import React, { useCallback, useState } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wiredEnv } from './rendu';
import { resetFiles } from './doubles/expo-file-system';
import { joueurs, resetJoueurs } from './doubles/expo-video';

/**
 * ═══ OPPORTUNITES-LEGER-1 (AUDIT-SHOP-2 F-49) — a photograph that loads, or a
 * keystroke, re-renders ITS tile and nothing else ═══
 *
 * The audit measured an App-level re-render per photograph load (`setCadres`
 * at App level) and per keystroke (`setMarkups`, with the card inline in the
 * list's renderItem). This test mounts the REAL tile and card components
 * (exported from App.tsx, no app code stubbed) under a small parent that holds
 * state the way App does, and asks the tree ITSELF whether a component
 * rendered: the tile's photograph handler and the card's field handler are
 * closures minted fresh on every render of their owner, so an unchanged
 * handler identity is a render that did not happen. (React's Profiler was the
 * first instrument here and was wrong for the job: its callback fires when a
 * parent re-renders the Profiler element, whether or not the memoized child
 * inside it bailed out.)
 *   · tile A's photograph loads → A re-rendered, B did not, the parent did not;
 *   · the parent re-renders for an unrelated reason → neither tile does;
 *   · a digit typed into card A's markup → A re-rendered, B did not.
 *
 * WHAT IT NEVER CLAIMS: anything about appearance. A frame's ratio is state
 * here, not a size; the double lays out nothing.
 */

const offre = (pv: string, name: string, clip = false) => ({
  productVersionId: pv,
  offerVersion: 'ov-1',
  basePrice: 10_000,
  resellerCommission: 1_000,
  available: 5,
  productName: name,
  assetRefs: [`https://media.test/photos/${pv}.jpg`],
  category: 'mode',
  ...(clip ? { videoRef: `https://media.test/clips/${pv}.mp4` } : {}),
});

async function monter(el: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(el);
    await Promise.resolve();
  });
  return tree;
}

/** The product's photograph — the <Image> whose source names its pid. */
function photoDe(tree: ReactTestRenderer, pv: string): ReactTestInstance {
  const img = tree.root
    .findAllByType('Image' as never)
    .find((i) => String((i.props['source'] as { uri?: string } | undefined)?.uri ?? '').includes(`/photos/${pv}.jpg`));
  if (img === undefined) throw new Error(`no <Image> for « ${pv} »`);
  return img;
}
/** The photograph's load handler — a closure the tile mints on EVERY render. */
const chargeur = (tree: ReactTestRenderer, pv: string): unknown => photoDe(tree, pv).props['onLoad'];

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
  resetJoueurs();
  // this file mounts with react-test-renderer's `act` directly (no mountApp):
  // React asks the environment to say so, or it warns on every update
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('OppTile — the photograph’s shape is the tile’s own state', () => {
  it('tile A’s photo loads → A rendered again, B and the parent did not; a parent re-render reaches neither', async () => {
    const { OppTile } = await import('../App');
    // the two items are built ONCE, as the feed hands them to App
    const A = offre('pv-a', 'Bazin riche', true);
    const B = offre('pv-b', 'Sac en cuir');
    const onOuvrir = (): void => {};
    const mesures: Array<[string, number, number]> = [];
    const onMesure = (pid: string, y: number, h: number): void => {
      mesures.push([pid, y, h]);
    };
    let rendusParent = 0;
    let bump: () => void = () => {};
    function Parent(): React.ReactElement {
      const [n, setN] = useState(0);
      bump = () => setN((x) => x + 1);
      rendusParent += 1;
      void n;
      return (
        <>
          <OppTile item={A} net={1_000} deja={false} actif={true} onOuvrir={onOuvrir} onMesure={onMesure} />
          <OppTile item={B} net={1_000} deja={false} actif={false} onOuvrir={onOuvrir} onMesure={onMesure} />
        </>
      );
    }
    const tree = await monter(<Parent />);
    expect(rendusParent).toBe(1);
    // only the ACTIVE tile asked for a player; B is the photograph alone
    expect(joueurs.crees, 'players asked for').toBe(1);
    const a0 = chargeur(tree, 'pv-a');
    const b0 = chargeur(tree, 'pv-b');
    expect(typeof a0).toBe('function');

    // A's photograph loads with a real pixel shape
    await act(async () => {
      (a0 as (e: unknown) => void)({ nativeEvent: { source: { width: 300, height: 400 } } });
      await Promise.resolve();
    });
    const a1 = chargeur(tree, 'pv-a');
    expect(a1, 'A rendered again with its measured frame').not.toBe(a0);
    expect(chargeur(tree, 'pv-b'), 'B never heard of it').toBe(b0);
    expect(rendusParent, 'the parent never heard of it either — the state is the tile’s').toBe(1);

    // the same load again writes nothing: an identical ratio is not a change
    await act(async () => {
      (a1 as (e: unknown) => void)({ nativeEvent: { source: { width: 300, height: 400 } } });
      await Promise.resolve();
    });
    expect(chargeur(tree, 'pv-a')).toBe(a1);

    // the parent re-renders for a reason of its own: neither tile does
    await act(async () => {
      bump();
      await Promise.resolve();
    });
    expect(rendusParent).toBe(2);
    expect(chargeur(tree, 'pv-a'), 'memo: same props, no render').toBe(a1);
    expect(chargeur(tree, 'pv-b')).toBe(b0);
    expect(joueurs.crees, 'no player was created again').toBe(1);

    // THE CALL SITE: the tile's own layout event reaches the grid's measure
    // with its pid — the road the viewport rule is fed by (the double lays
    // out nothing, so the event is delivered here by hand)
    const pressables = tree.root.findAll((n) => typeof n.type === 'string' && typeof n.props['onLayout'] === 'function' && typeof n.props['onPress'] === 'function');
    expect(pressables.length, 'two tiles, two measured pressables').toBe(2);
    await act(async () => {
      (pressables[1]!.props['onLayout'] as (e: unknown) => void)({ nativeEvent: { layout: { x: 0, y: 310, width: 160, height: 300 } } });
      await Promise.resolve();
    });
    expect(mesures).toEqual([['pv-b', 310, 300]]);
    tree.unmount();
  });
});

describe('VitrineCard — a digit typed into card A renders A and no other card', () => {
  it('two cards under a parent holding the markups map, as App does', async () => {
    const { VitrineCard } = await import('../App');
    const A = offre('pv-a', 'Bazin riche');
    const B = offre('pv-b', 'Sac en cuir');
    // a voice controller with no note in hand, STABLE — as App's memoized one is
    const ctl = {
      notes: {}, micDenied: false, playingPid: null, playingSec: 0, anyRecording: false,
      startRec: () => {}, stopRec: () => {}, cancelRec: () => {}, playRec: () => {}, publishRec: () => {}, deleteRec: () => {}, retryPermission: () => {},
    };
    const noop = (): void => {};
    let rendusParent = 0;
    function Parent(): React.ReactElement {
      const [markups, setMarkups] = useState<Record<string, number>>({});
      rendusParent += 1;
      const onMarge = useCallback((pid: string, m: number) => setMarkups((prev) => ({ ...prev, [pid]: m })), []);
      return (
        <>
          {[A, B].map((o) => (
            <VitrineCard
              key={o.productVersionId}
              item={o}
              markup={markups[o.productVersionId] ?? 0}
              cap={5_000}
              net={1_000 + (markups[o.productVersionId] ?? 0)}
              client={10_000 + (markups[o.productVersionId] ?? 0)}
              ctl={ctl as never}
              retiring={null}
              onGalerie={noop}
              onVoix={noop}
              onPartager={noop}
              onRetirer={noop}
              onMarge={onMarge}
              onFocusField={noop}
              attente={null}
              onAnnulerAttente={noop}
            />
          ))}
        </>
      );
    }
    const tree = await monter(<Parent />);
    expect(rendusParent).toBe(1);
    // the cards render in order: the first markup field is A's, the second B's
    const champs = (): ReactTestInstance[] => tree.root.findAllByType('TextInput' as never);
    expect(champs()).toHaveLength(2);
    const saisieA0 = champs()[0]!.props['onChangeText'] as (v: string) => void;
    const saisieB0 = champs()[1]!.props['onChangeText'];
    expect(typeof saisieB0).toBe('function');

    // she types a digit into A's markup field: the commit-as-she-types write
    // reaches the parent (its map changed) and card A — and stops there
    await act(async () => {
      saisieA0('5');
      await Promise.resolve();
    });
    expect(rendusParent, 'the parent holds the map, so it re-rendered').toBe(2);
    expect(champs()[0]!.props['onChangeText'], 'her card rendered again with the new markup').not.toBe(saisieA0);
    expect(champs()[1]!.props['onChangeText'], 'the other card did not').toBe(saisieB0);
    tree.unmount();
  });
});
