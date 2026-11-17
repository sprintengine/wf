/**
 * The graphs' motion (SpotReport.tsx): how far open each row is, and every
 * bar, line and scale, eased from where it is to where it is going, and
 * where each row stands in its section's stack while some are part open.
 * The sums are pure, so they are tested without a page.
 */
import { useEffect, useMemo, useRef, useState } from "react";

/** How long a row takes to fold away or open, and a bar to move. */
export const OPEN_MS = 480;

/** Fast out of the start, settling at the end: a cubic ease-out. */
export const easeOut = (t: number) =>
  1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** `easeOut` as CSS draws it, for what moves by a transform. */
export const EASE_OUT_CSS = "cubic-bezier(0.33, 1, 0.68, 1)";

/** Each band of a section: its key, its height and the gap under it. */
export type BandSpec<K extends string> = readonly [K, number, number];

export interface Stack<K extends string> {
  /**
   * Each band drawn, open or opening: its top and its whole height. A band
   * part open is drawn whole and cut to its open share (`open`).
   */
  at: Partial<Record<K, readonly [number, number]>>;
  /** How far open each band drawn is, 0 to 1; 1 for most. */
  open: Partial<Record<K, number>>;
  /** Where the hours run along the foot. */
  axis: number;
  height: number;
}

/**
 * Where each band of a section sits, the hours' axis under the last, and the
 * height, with each band open as far as `open` says (1 where it says
 * nothing): a band takes its share of its height and of the gap under it, so
 * the bands under it move up as it folds away and down as it opens, and the
 * section's foot moves with them. `keep` is whether a band has anything to
 * draw at all; one it leaves out, or none open, takes no room.
 */
export function stack<K extends string>(
  bands: readonly BandSpec<K>[],
  top: number,
  keep: (band: K) => boolean,
  open: Partial<Record<K, number>> = {},
): Stack<K> {
  const at: Partial<Record<K, readonly [number, number]>> = {};
  const shown: Partial<Record<K, number>> = {};
  let y = top;
  // The gap under the last band open, which the axis does not keep: blended
  // as a band opens or folds, so the foot moves smoothly when the last band
  // is the one moving.
  let trailing = 0;
  for (const [band, h, g] of bands) {
    if (!keep(band)) continue;
    const f = Math.min(1, Math.max(0, open[band] ?? 1));
    if (f <= 0) continue;
    at[band] = [y, h];
    shown[band] = f;
    y += (h + g) * f;
    trailing = trailing * (1 - f) + g * f;
  }
  const axis = y - trailing + 8;
  return { at, open: shown, axis, height: axis + 22 };
}

export const stillWanted = () =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * What the graphs ease: a number, nothing (null: none to draw), or lists and
 * records of them. A bar's height, a line's points, a scale's top.
 */
export type Eased =
  number | null | readonly Eased[] | { readonly [key: string]: Eased };

/** The same shape with every number 0: where a bar grows from or goes to. */
export function zeroed<T extends Eased>(value: T): T {
  if (value === null) return value;
  if (typeof value === "number") return 0 as T;
  if (Array.isArray(value))
    return value.map((v: Eased) => zeroed(v)) as unknown as T;
  const out: Record<string, Eased> = {};
  for (const [key, v] of Object.entries(value)) out[key] = zeroed(v);
  return out as T;
}

/**
 * `e` of the way from `from` to `to` (0 is `from`, 1 is `to`): each number
 * by its place in a list or its key in a record, so a bar keyed by its hour
 * moves from its own height. What `to` has and `from` has not is `to`'s at
 * once, as is nothing (null); what `from` has and `to` has not is gone.
 * With `grow`, a key of a record that one side has and the other has not
 * grows from 0 or goes to 0 instead (a bar for an hour one model has and
 * another has not), the one going kept until the end.
 */
export function between<T extends Eased>(
  from: Eased | undefined,
  to: T,
  e: number,
  grow = false,
): T {
  if (e >= 1 || to === null) return to;
  if (typeof to === "number")
    return (typeof from === "number" ? from + (to - from) * e : to) as T;
  if (Array.isArray(to)) {
    const was: readonly Eased[] = Array.isArray(from) ? from : [];
    return to.map((v: Eased, i) => between(was[i], v, e, grow)) as unknown as T;
  }
  const was = (
    from !== null && typeof from === "object" && !Array.isArray(from)
      ? from
      : {}
  ) as Record<string, Eased>;
  const out: Record<string, Eased> = {};
  const goal = to as Record<string, Eased>;
  for (const key of Object.keys(goal))
    out[key] = between(
      grow && !(key in was) ? zeroed(goal[key]) : was[key],
      goal[key],
      e,
      grow,
    );
  if (grow)
    for (const key of Object.keys(was))
      if (!(key in goal))
        out[key] = between(was[key], zeroed(was[key]), e, grow);
  return out as T;
}

/** Whether two eased values are the same, number for number. */
export function sameEased(a: Eased | undefined, b: Eased | undefined): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined)
    return false;
  if (typeof a === "number" || typeof b === "number") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    return a.every((v: Eased, i) => sameEased(v, b[i]));
  }
  const x = a as Record<string, Eased>;
  const y = b as Record<string, Eased>;
  const keys = Object.keys(x);
  return (
    keys.length === Object.keys(y).length &&
    keys.every((key) => key in y && sameEased(x[key], y[key]))
  );
}

/**
 * `to`, eased: when it changes, the value returned runs from wherever it had
 * got to (still moving, or at rest) to the new one over `OPEN_MS`, frame by
 * frame, and the component that holds it draws each frame. The first value
 * is drawn as it is, never grown from nothing; a new `to` the same number
 * for number as the last moves nothing. With reduced motion asked for, at
 * once. Keep `to` the same object while it means the same (`useMemo`):
 * that is what says it has not changed. `grow` is `between`'s: what comes
 * grows from 0 and what goes shrinks to it.
 */
export function useEased<T extends Eased>(to: T, grow = false): T {
  const [shown, setShown] = useState<T>(to);
  const now = useRef(shown);
  now.current = shown;
  useEffect(() => {
    const from = now.current;
    if (from === to) return;
    // Nothing to move (the same numbers, or only some come and go at once):
    // the new value, without drawing every frame of an ease for it.
    if (sameEased(from, to) || sameEased(between(from, to, 0, grow), to)) {
      setShown(to);
      return;
    }
    if (stillWanted() || typeof requestAnimationFrame === "undefined") {
      setShown(to);
      return;
    }
    // The clock starts on the first frame after the change, not when it was
    // asked: a slow phone can take longer than the whole ease to draw the
    // change itself, and would then skip straight to the end.
    let start = -1;
    let frame = requestAnimationFrame(function step() {
      const at = performance.now();
      if (start < 0) start = at;
      const e = easeOut((at - start) / OPEN_MS);
      setShown(between(from, to, e, grow));
      if (e < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);
  return shown;
}

/**
 * How far open each row is, 0 shut to 1 open, following `on`: a row switched
 * on opens and one switched off folds, eased over `OPEN_MS`, from wherever it
 * had got to if it was still moving. With reduced motion asked for, at once.
 */
export function useOpening<K extends string>(
  on: Readonly<Record<K, boolean>>,
): Record<K, number> {
  const key = JSON.stringify(on);
  const to = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(on).map(([row, value]) => [row, value ? 1 : 0]),
      ) as Record<K, number>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return useEased(to);
}
