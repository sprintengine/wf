import { describe, expect, it } from "vitest";
import { dayCard, rowAt, smoothPath, weekStart } from "./report";

const HOUR = 3600000;
const row = (time: number) => ({ time }) as never;

describe("the spot report's sums", () => {
  it("finds the row that covers a moment", () => {
    const rows = [row(0), row(HOUR), row(2 * HOUR)];
    expect(rowAt(rows, 1.5 * HOUR)).toBe(rows[1]);
    expect(rowAt(rows, -5)).toBe(rows[0]);
    expect(rowAt([], 0)).toBeNull();
  });

  it("starts the week where the wind does, or at now's hour if that is earlier", () => {
    const wind = (h: number, kn: number | null = 12) =>
      ({
        time: h * HOUR,
        hour: { wind: kn === null ? null : { wind_kn: kn } },
      }) as never;
    const rows = [wind(0, null), wind(1, null), wind(2), wind(3)];
    // The wind starts at 02:00, now is later: from the wind.
    expect(weekStart(rows, 0, 3.5 * HOUR)).toBe(2 * HOUR);
    // Now is before the wind starts: from now's hour.
    expect(weekStart(rows, 0, 1.2 * HOUR)).toBe(1 * HOUR);
    // Never before the first day.
    expect(weekStart(rows, 1.5 * HOUR, 0)).toBe(1.5 * HOUR);
    // No wind at all: the first day's start.
    expect(weekStart([wind(0, null)], 0, 5 * HOUR)).toBe(0);
  });

  it("draws a curve that passes through every point", () => {
    const d = smoothPath([
      [0, 10],
      [10, 0],
      [20, 10],
    ]);
    expect(d.startsWith("M0,10C")).toBe(true);
    expect(d).toContain(" 10,0C");
    expect(d.endsWith(" 20,10")).toBe(true);
    expect(smoothPath([])).toBe("");
  });

  it("marks a day whose daylight hours lost their stars to a warning or a notice", () => {
    const midnight = Date.parse("2026-09-13T23:00:00Z");
    const hour = (h: number, extra: object) =>
      ({
        time: midnight + h * HOUR,
        step: 1,
        hour: {
          daylight: h >= 7 && h <= 19,
          wind: { wind_kn: 18, gust_kn: 24, direction_deg: 270 },
        },
        rating: null,
        shore: null,
        ...extra,
      }) as never;
    const day = {
      date: "2026-09-14",
      windMin: 18,
      windMax: 18,
      rows: [
        hour(3, { warning: { level: "red", ids: [], replaces_rating: true } }),
        hour(9, { water: { ids: [], replaces_rating: true } }),
        hour(13, {
          warning: { level: "orange", ids: [], replaces_rating: true },
        }),
      ],
    } as never;
    // The red one is in the dark: the orange is the day's.
    expect(dayCard(day, midnight, midnight).notice).toEqual({
      level: "orange",
      word: "Orange warning",
    });
  });
});
