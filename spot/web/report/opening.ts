/**
 * The graphs' rows folding away and opening (SpotReport.tsx): how far open
 * each row is, eased from where it is to where it is going, and where each
 * row stands in its section's stack while some are part open. The sums are
 * pure, so they are tested without a page.
 */
import { useEffect, useRef, useState } from "react";

/** How long a row takes to fold away or open. */
export const OPEN_MS = 480;

/** Fast out of the start, settling at the end: a cubic ease-out. */
export const easeOut = (t: number) =>
  1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

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

const stillWanted = () =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * How far open each row is, 0 shut to 1 open, following `on`: a row switched
 * on opens and one switched off folds, eased over `OPEN_MS`, from wherever it
 * had got to if it was still moving. With reduced motion asked for, at once.
 */
export function useOpening<K extends string>(
  on: Readonly<Record<K, boolean>>,
): Record<K, number> {
  const target = (rows: Readonly<Record<K, boolean>>) =>
    Object.fromEntries(
      Object.entries(rows).map(([key, value]) => [key, value ? 1 : 0]),
    ) as Record<K, number>;
  const [open, setOpen] = useState<Record<K, number>>(() => target(on));
  const now = useRef(open);
  now.current = open;
  const key = JSON.stringify(on);
  useEffect(() => {
    const to = target(on);
    const from = now.current;
    const keys = Object.keys(to) as K[];
    if (keys.every((k) => from[k] === to[k])) return;
    if (stillWanted() || typeof requestAnimationFrame === "undefined") {
      setOpen(to);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(at) {
      const e = easeOut((at - start) / OPEN_MS);
      setOpen(
        Object.fromEntries(
          keys.map((k) => [
            k,
            (from[k] ?? to[k]) + (to[k] - (from[k] ?? to[k])) * e,
          ]),
        ) as Record<K, number>,
      );
      if (e < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return open;
}
