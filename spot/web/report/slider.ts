/**
 * The time slider's sums (TimeSlider.tsx): which hours it holds, where each
 * stands along it, and which one is under its needle. Pure, so they are
 * tested without a page.
 */
import { HOUR, type SpotRow } from "../spot";

/** One hour, or one three-hour row further out, on the slider. */
export interface SliderHour {
  time: number;
  /** Hours it stands for: 1 near, 3 further out, as its row does. */
  step: number;
  /** The wind, in knots, or null with no reading. */
  kn: number | null;
  /** Its stars, 0 with none (in the dark, or no rating). */
  stars: number;
  night: boolean;
  /** The first hour of its day, where the slider marks a day's start. */
  dayStart: boolean;
}

/**
 * Where the week's hours start: where the wind does, the first hour any model
 * has, or now if that is still to come, and never before the first day.
 * Today's earlier hours have no forecast to draw.
 */
export function weekStart(
  rows: readonly Pick<SpotRow, "time" | "hour">[],
  dayStart: number,
  now: number,
): number {
  const firstWind = rows.find((r) => r.hour.wind)?.time ?? null;
  // Now's row, as `rowAt` finds it: the last to start by now, else the first.
  let nowHour = rows[0]?.time ?? now;
  for (const r of rows) if (r.time <= now) nowHour = r.time;
  return firstWind === null
    ? dayStart
    : Math.max(dayStart, Math.min(firstWind, nowHour));
}

/**
 * The slider's hours: the week's rows from its start to the end of its last
 * day, less those after dark where the rider hides them (`dark`, by row).
 */
export function sliderHours(
  rows: readonly Pick<SpotRow, "time" | "step" | "hour" | "rating">[],
  {
    from,
    to,
    dark,
    midnights,
  }: {
    from: number;
    to: number;
    dark: readonly boolean[] | null;
    /** Each day's midnight, so a day's first hour is marked. */
    midnights: readonly number[];
  },
): SliderHour[] {
  const starts = new Set(midnights);
  const out: SliderHour[] = [];
  rows.forEach((r, i) => {
    if (r.time < from || r.time >= to || dark?.[i]) return;
    const prev = out.at(-1);
    out.push({
      time: r.time,
      step: r.step,
      kn: r.hour.wind?.wind_kn ?? null,
      stars: r.hour.daylight ? (r.rating?.stars ?? 0) : 0,
      night: !r.hour.daylight,
      // A day's first hour on the slider: its midnight, or with the night
      // left out its first light, the first kept hour past a day's line.
      dayStart:
        starts.has(r.time) ||
        (prev !== undefined &&
          midnights.some((m) => prev.time < m && r.time >= m)),
    });
  });
  return out;
}

/**
 * The slider hour that holds a moment: the last that starts at or before it,
 * or the next one where the moment falls in hours the slider leaves out (a
 * night hidden, the hours before the wind starts).
 */
export function sliderIndex(
  hours: readonly Pick<SliderHour, "time" | "step">[],
  time: number,
): number {
  if (!hours.length) return -1;
  let at = -1;
  for (let i = 0; i < hours.length && hours[i].time <= time; i++) at = i;
  if (at < 0) return 0;
  const end = hours[at].time + hours[at].step * HOUR;
  return time >= end && at + 1 < hours.length ? at + 1 : at;
}

/** Where each hour starts along the slider, `tick` pixels to an hour. */
export function sliderOffsets(
  hours: readonly Pick<SliderHour, "step">[],
  tick: number,
): number[] {
  const out: number[] = [];
  let x = 0;
  for (const h of hours) {
    out.push(x);
    x += h.step * tick;
  }
  return out;
}

/**
 * How far the slider is scrolled to put an hour under its needle: the
 * needle stands over the middle of the first hour's tick at no scroll, and
 * over the middle of each hour's own width after.
 */
export const sliderLeft = (
  offsets: readonly number[],
  hours: readonly Pick<SliderHour, "step">[],
  i: number,
  tick: number,
) => offsets[i] + (hours[i].step * tick) / 2 - tick / 2;

/** The hour under the needle at a scroll, the nearest at either end. */
export function sliderAt(
  offsets: readonly number[],
  hours: readonly Pick<SliderHour, "step">[],
  scrollLeft: number,
  tick: number,
): number {
  if (!hours.length) return -1;
  const x = scrollLeft + tick / 2;
  let at = 0;
  for (let i = 0; i < offsets.length && offsets[i] <= x; i++) at = i;
  return Math.min(at, hours.length - 1);
}
