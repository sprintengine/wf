import { describe, expect, it } from "vitest";
import {
  sliderAt,
  sliderHours,
  sliderIndex,
  sliderLeft,
  sliderOffsets,
  weekStart,
} from "./slider";

const HOUR = 3600000;
const DAY = 24 * HOUR;
const TICK = 14;

/** A row of the week: hourly, or three-hourly with `step`. */
const row = (
  h: number,
  {
    step = 1,
    kn = 12 as number | null,
    stars = 0,
    daylight = true,
  }: {
    step?: number;
    kn?: number | null;
    stars?: number;
    daylight?: boolean;
  } = {},
) =>
  ({
    time: h * HOUR,
    step,
    hour: {
      daylight,
      wind: kn === null ? null : { wind_kn: kn },
    },
    rating: stars ? { stars } : null,
  }) as never;

describe("the time slider's sums", () => {
  it("starts the week where the wind does, or at now's hour if that is earlier", () => {
    const rows = [row(0, { kn: null }), row(1, { kn: null }), row(2), row(3)];
    // The wind starts at 02:00, now is later: from the wind.
    expect(weekStart(rows, 0, 3.5 * HOUR)).toBe(2 * HOUR);
    // Now is before the wind starts: from now's hour.
    expect(weekStart(rows, 0, 1.2 * HOUR)).toBe(1 * HOUR);
    // Never before the first day.
    expect(weekStart(rows, 1.5 * HOUR, 0)).toBe(1.5 * HOUR);
    // No wind at all: the first day's start.
    expect(weekStart([row(0, { kn: null })], 0, 5 * HOUR)).toBe(0);
  });

  it("holds the week's hours, its stars, its nights and its days' starts", () => {
    const rows = [
      row(22, { daylight: false, stars: 3 }),
      row(23, { daylight: false }),
      row(24, { stars: 2, kn: 18 }),
      row(25, { kn: null }),
      row(27, { step: 3 }),
      row(48),
    ];
    const hours = sliderHours(rows, {
      from: 22 * HOUR,
      to: 48 * HOUR,
      dark: null,
      midnights: [0, DAY],
    });
    expect(hours.map((h) => h.time / HOUR)).toEqual([22, 23, 24, 25, 27]);
    // No stars in the dark, whatever the rating says.
    expect(hours.map((h) => h.stars)).toEqual([0, 0, 2, 0, 0]);
    expect(hours.map((h) => h.night)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(hours.map((h) => h.kn)).toEqual([12, 12, 18, null, 12]);
    expect(hours.map((h) => h.dayStart)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(hours[4].step).toBe(3);
  });

  it("leaves out the hours after dark where the rider hides them, and marks the next day's first light", () => {
    const rows = [row(20), row(21), row(30), row(31)];
    const hours = sliderHours(rows, {
      from: 0,
      to: 2 * DAY,
      dark: [false, true, false, false],
      midnights: [0, DAY],
    });
    expect(hours.map((h) => h.time / HOUR)).toEqual([20, 30, 31]);
    expect(hours.map((h) => h.dayStart)).toEqual([false, true, false]);
  });

  it("finds the hour that holds a moment, or the next one past a gap", () => {
    const hours = [
      { time: 5 * HOUR, step: 1 },
      { time: 6 * HOUR, step: 1 },
      { time: 9 * HOUR, step: 3 },
      { time: 30 * HOUR, step: 1 },
    ];
    expect(sliderIndex(hours, 6.5 * HOUR)).toBe(1);
    expect(sliderIndex(hours, 10 * HOUR)).toBe(2);
    // Before the first hour: the first.
    expect(sliderIndex(hours, 0)).toBe(0);
    // In a night left out: the next first light.
    expect(sliderIndex(hours, 7.5 * HOUR)).toBe(2);
    expect(sliderIndex(hours, 20 * HOUR)).toBe(3);
    // Past the last: the last.
    expect(sliderIndex(hours, 99 * HOUR)).toBe(3);
    expect(sliderIndex([], 0)).toBe(-1);
  });

  it("puts every hour under the needle at its own scroll, and reads it back", () => {
    const hours = [{ step: 1 }, { step: 1 }, { step: 3 }, { step: 3 }];
    const offsets = sliderOffsets(hours, TICK);
    expect(offsets).toEqual([0, 14, 28, 70]);
    hours.forEach((_, i) => {
      const left = sliderLeft(offsets, hours, i, TICK);
      expect(sliderAt(offsets, hours, left, TICK)).toBe(i);
    });
    // A three-hour row's middle is under the needle.
    expect(sliderLeft(offsets, hours, 2, TICK)).toBe(28 + 21 - 7);
    // Either end: the nearest hour.
    expect(sliderAt(offsets, hours, -50, TICK)).toBe(0);
    expect(sliderAt(offsets, hours, 5000, TICK)).toBe(3);
    expect(sliderAt([], [], 0, TICK)).toBe(-1);
  });
});
