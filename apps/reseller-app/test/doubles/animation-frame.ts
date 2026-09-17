/**
 * ═══ DOUBLE — the device's animation frame ═══
 *
 * BOUNDS, stated first: a frame is a 16 ms timer that hands the callback the
 * clock, and a cancel clears it. NOTHING is drawn, measured, or timed against
 * a screen — this stand-in makes an animated component RUN in a walk (the
 * locked hero counts up with `requestAnimationFrame`); it can never say what
 * the animation looked like. The bound is absolute: no walk may assert
 * appearance through it.
 */

type Frame = (time: number) => void;

export function installAnimationFrame(): () => void {
  const g = globalThis as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown };
  const before = { raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame };
  g.requestAnimationFrame = (cb: Frame): number =>
    Number(setTimeout(() => cb(Date.now()), 16));
  g.cancelAnimationFrame = (id: number): void => {
    clearTimeout(id);
  };
  return () => {
    if (before.raf === undefined) delete g.requestAnimationFrame;
    else g.requestAnimationFrame = before.raf;
    if (before.caf === undefined) delete g.cancelAnimationFrame;
    else g.cancelAnimationFrame = before.caf;
  };
}
