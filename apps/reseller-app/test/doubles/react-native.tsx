import React from 'react';

/**
 * ═══ RENDU-RÉEL (Shop+ reseller) — the react-native double, and EXACTLY what it is for ═══
 *
 * FOUNDER STANDING ORDER (2026-08-10) — « THE SCREEN IS DRIVEN, NEVER ONLY
 * READ ». He gave it after a single day in which three bugs reached his hand
 * through a fully green board, all the same shape: a screen that renders and
 * cannot be used. The order names the Shop+ reseller surface among the repos
 * with no harness, and « the first slice that touches a screen there BUILDS the
 * equivalent ». This is that build.
 *
 * WHAT IT REPLACES HERE: every screen test in `test/` was a SOURCE SCAN — a
 * `readFileSync` on a `.tsx` and a regex over the text. A source scan cannot see
 * what mounted, whether a press is wired, or whether an effect ran — and the two
 * changes this harness first covered are exactly that kind: a `useEffect`
 * dependency (does Opportunités RE-READ when she opens it?) and a new control
 * (does « Retirer » reach the service, and does the card go?).
 *
 * THE BOUND OF THIS DOUBLE, STATED SO NOBODY OVER-READS IT (§9.8 — « a mock
 * that makes integration look healthier than it is is a bug you own »):
 *
 *   IT PROVIDES: component identity, prop pass-through, children, and the
 *   press/change handlers. That is enough — and is exactly what is needed —
 *   to answer « did it render », « is this button wired », « did the effect
 *   run », « can he get to the next screen ».
 *
 *   IT PROVIDES NOTHING ELSE. No layout, no styling, no measurement, no
 *   gesture system, no native animation. So a test written on it may NEVER
 *   claim anything about appearance — not spacing, not contrast, not
 *   touch-target size, not animation timing. Those stay where they already
 *   live: the token-fidelity and contrast scans, and the founder's own eyes on
 *   a phone in sunlight.
 *
 * A test that asserted a colour here would be asserting a fiction. There is no
 * colour here.
 *
 * AND ITS SURFACE IS CERTIFIED, NOT GUESSED. `test/rendu-harness.test.ts`
 * sweeps every `from 'react-native'` import in the app tree and fails if this
 * file does not export it — so a new import cannot silently arrive as
 * `undefined` and render nothing while a test passes over it.
 */

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

/** A host element of the given name — react-test-renderer keeps the type
 *  string, so `root.findAllByType('Text')` finds real nodes and the props are
 *  the ones the app actually passed. */
function host(name: string): React.FC<AnyProps> {
  const C: React.FC<AnyProps> = (props) => React.createElement(name, props as never);
  C.displayName = name;
  return C;
}

export const View = host('View');
export const Text = host('Text');
/**
 * Image carries the real module's ONE static the app calls: `getSize`. Here it
 * always reports FAILURE, asynchronously — exactly what a test:// url does on
 * a device with no network — so a screen's unmeasured branch is the branch a
 * walk drives. THE BOUND HOLDS: this double never measures a photograph and
 * never claims one loaded; a walk on it may not assert an image's size.
 */
export const Image: React.FC<AnyProps> & {
  getSize: (uri: string, ok: (w: number, h: number) => void, fail?: (e: unknown) => void) => void;
} = Object.assign(host('Image'), {
  getSize: (_uri: string, _ok: (w: number, h: number) => void, fail?: (e: unknown) => void): void => {
    queueMicrotask(() => fail?.(new Error('rendu-double: no network, no measurement')));
  },
});
export const SafeAreaView = host('SafeAreaView');
export const ScrollView = host('ScrollView');
export const TextInput = host('TextInput');
export const KeyboardAvoidingView = host('KeyboardAvoidingView');

/**
 * Modal renders its children ONLY when visible — the real one's whole point,
 * and the difference between « the overlay is on screen » and « the overlay
 * exists in the file ». A double that always rendered them would let a walk
 * find a control the founder cannot reach.
 */
export const Modal: React.FC<AnyProps> = (props) => {
  const { children, visible, ...rest } = props;
  if (visible === false) return null;
  return React.createElement('Modal', rest as never, children);
};
Modal.displayName = 'Modal';

/**
 * FlatList renders EVERY item — no windowing. Windowing is a performance
 * behaviour and this double makes no performance claim; what a walk needs is
 * that the rows the data produces are reachable.
 *
 * AND IT RENDERS THE HEADER AND THE FOOTER, which this double did NOT until
 * 2026-08-11. They fell into `...rest` and were handed to the host element as
 * plain props, so they never rendered — and Ma Vitrine puts its screen title,
 * its public/privée toggle and « Personnaliser ma boutique » in the header.
 * Every control in that region was invisible to every walk in this repo: a walk
 * asking for one was told it is NOT ON SCREEN, and a walk asserting one is gone
 * would have passed over a header that never existed. That is §9.8 exactly — a
 * double that makes the app look different from what it is — and it is why the
 * K5 walk below could not reach the door it needed.
 *
 * The real list draws header → (items | empty) → footer, and draws header and
 * footer even when `data` is empty; that order is reproduced here.
 */
export const FlatList: React.FC<AnyProps> = (props) => {
  const {
    data,
    renderItem,
    keyExtractor,
    ListEmptyComponent,
    ListHeaderComponent,
    ListFooterComponent,
    ...rest
  } = props;
  const rows = Array.isArray(data) ? data : [];
  const render = renderItem as ((info: { item: unknown; index: number }) => React.ReactNode) | undefined;
  const key = keyExtractor as ((item: unknown, index: number) => string) | undefined;
  /** RN accepts a component TYPE or an already-built element for these three. */
  const slot = (c: unknown): React.ReactNode =>
    typeof c === 'function' ? React.createElement(c as React.FC) : ((c as React.ReactNode) ?? null);
  const body =
    rows.length === 0
      ? slot(ListEmptyComponent)
      : rows.map((item, index) =>
          React.createElement(
            React.Fragment,
            { key: key?.(item, index) ?? String(index) },
            render?.({ item, index }),
          ),
        );
  return React.createElement(
    'FlatList',
    rest as never,
    React.createElement(React.Fragment, { key: 'h' }, slot(ListHeaderComponent)),
    body,
    React.createElement(React.Fragment, { key: 'f' }, slot(ListFooterComponent)),
  );
};
FlatList.displayName = 'FlatList';

/**
 * Pressable renders a function-child in the real library (`({pressed}) => …`).
 * Both forms are supported because the kit uses both; anything else about
 * pressing — ripple, delay, hit slop — is layout, and layout is not here.
 */
export const Pressable: React.FC<AnyProps> = (props) => {
  const { children, ...rest } = props;
  const resolved = typeof children === 'function'
    ? (children as (s: { pressed: boolean }) => React.ReactNode)({ pressed: false })
    : children;
  return React.createElement('Pressable', rest as never, resolved);
};
Pressable.displayName = 'Pressable';

export const StyleSheet = {
  /** Identity: the app's styles are asserted by the token-fidelity scans, not
   *  here, and flattening them would invite exactly the appearance claims the
   *  header forbids. */
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten: (style: unknown): Record<string, unknown> =>
    Array.isArray(style)
      ? Object.assign({}, ...style.filter((s) => s !== null && s !== undefined && s !== false))
      : ((style ?? {}) as Record<string, unknown>),
  absoluteFill: {},
  hairlineWidth: 1,
};

/** Animation is DRIVEN, not simulated: `start()` invokes its callback at once
 *  so a component that waits on completion is never left hanging in a test.
 *  Nothing here interpolates — a value is whatever it was last set to. */
class AnimatedValue {
  constructor(private value: number) {}
  setValue(v: number): void {
    this.value = v;
  }
  interpolate(): AnimatedValue {
    return this;
  }
  addListener(): string {
    return '0';
  }
  removeAllListeners(): void {}
  stopAnimation(): void {}
}

const timing = (
  value: AnimatedValue,
  config: { toValue: number },
): { start: (cb?: () => void) => void; stop: () => void } => ({
  start: (cb?: () => void) => {
    value.setValue(config.toValue);
    cb?.();
  },
  stop: () => {},
});

export const Animated = {
  View: host('Animated.View'),
  Text: host('Animated.Text'),
  Value: AnimatedValue,
  timing,
  spring: timing,
  loop: (a: { start: (cb?: () => void) => void; stop: () => void }) => a,
  sequence: (list: { start: (cb?: () => void) => void }[]) => ({
    start: (cb?: () => void) => {
      for (const a of list) a.start();
      cb?.();
    },
    stop: () => {},
  }),
  parallel: (list: { start: (cb?: () => void) => void }[]) => ({
    start: (cb?: () => void) => {
      for (const a of list) a.start();
      cb?.();
    },
    stop: () => {},
  }),
};

const easingFn = (t: number): number => t;
export const Easing = {
  ease: easingFn,
  linear: easingFn,
  bezier: (): ((t: number) => number) => easingFn,
  inOut: (): ((t: number) => number) => easingFn,
  in: (): ((t: number) => number) => easingFn,
  out: (): ((t: number) => number) => easingFn,
};

/** The real one asks the OS. Here it always answers « reduce motion: no » and
 *  never changes — the reduced-motion BRANCHES are covered by their own unit
 *  tests. */
export const AccessibilityInfo = {
  isReduceMotionEnabled: async (): Promise<boolean> => false,
  addEventListener: (): { remove: () => void } => ({ remove: () => {} }),
};

/**
 * LINKING IS A NATIVE BOUNDARY AND IT RECORDS. The console's « appeler le
 * fournisseur » leaves the app through `openURL`; a walk that presses it must
 * be able to ask WHAT was dialled, and a double that silently swallowed the
 * url would let a broken `tel:` pass. `canOpenURL` answers true — whether the
 * OS has a dialler is not this harness's claim to make.
 */
export const Linking = {
  opened: [] as string[],
  openURL: async (url: string): Promise<void> => {
    Linking.opened.push(url);
  },
  canOpenURL: async (): Promise<boolean> => true,
  addEventListener: (): { remove: () => void } => ({ remove: () => {} }),
};

/**
 * The native handle a screen passes to a scroll responder so it can lift THAT
 * row clear of the keypad.
 *
 * BOUND: there is no native view tree here, so this answers a stable sentinel
 * rather than a real tag — enough to prove the screen ASKED, never enough to
 * claim anything moved. `null` for a null ref, because « no field yet » is a
 * case the caller must still handle.
 */
export const findNodeHandle = (ref: unknown): number | null => (ref === null || ref === undefined ? null : 1);

export const Platform = { OS: 'android' as const, select: <T,>(o: { android?: T; default?: T }): T | undefined => o.android ?? o.default };
export const Dimensions = { get: () => ({ width: 360, height: 640, scale: 2, fontScale: 1 }) };
/** A 1GB Android in portrait — the device the whole app is designed for. It is
 *  a NUMBER a component may branch on, never a claim about how anything looks. */
export const useWindowDimensions = (): { width: number; height: number; scale: number; fontScale: number } => ({
  width: 360,
  height: 640,
  scale: 2,
  fontScale: 1,
});

/** A spinner is a spinner. It renders, it says nothing about motion. */
export const ActivityIndicator = host('ActivityIndicator');

/**
 * PanResponder — the gesture system is NOT simulated (see the bound above).
 * The handlers are handed back untouched so a component that builds one still
 * mounts; no test may drive a drag through this, and none does.
 */
export const PanResponder = {
  create: (config: Record<string, unknown>): { panHandlers: Record<string, unknown> } => ({ panHandlers: config }),
};

/**
 * Share is a NATIVE BOUNDARY and it RECORDS, like Linking: « Partager » is a
 * primary act on this app's cards, and a walk that pressed it must be able to
 * ask WHAT would have been shared rather than trust that something was.
 */
export const Share = {
  shared: [] as Record<string, unknown>[],
  share: async (content: Record<string, unknown>): Promise<{ action: string }> => {
    Share.shared.push(content);
    return { action: 'sharedAction' };
  },
};

export type StyleProp<T> = T | T[] | null | undefined;
export type DimensionValue = number | string | null;
export type LayoutChangeEvent = { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } };
export type EasingFunction = (t: number) => number;
export type ViewStyle = Record<string, unknown>;
export type TextStyle = Record<string, unknown>;
export type ImageStyle = Record<string, unknown>;
