import { describe, expect, it } from "vitest";
import { periodStars, waveStars, type WaveHour } from "./waveStars";

/** Feet to the metres a model gives, a touch over so they round back. */
const ft = (feet: number) => (feet + 0.1) / 3.28084;

/** A west-facing beach, the swell straight in from the west, no wind. */
const hour = (over: Partial<WaveHour> = {}): WaveHour => ({
  height: ft(4),
  period: 10,
  direction: 270,
  windFrom: null,
  facing: 270,
  ...over,
});

describe("the period", () => {
  it("starts the stars: chop none, longer better, 12 s and over five", () => {
    expect([5, 6, 7, 8, 9, 10, 11, 12, 16].map(periodStars)).toEqual([
      0, 1, 1, 2, 3, 4, 4, 5, 5,
    ]);
  });

  it("is read on the whole seconds the pill shows", () => {
    expect(periodStars(5.6)).toBe(1);
    expect(periodStars(11.4)).toBe(4);
  });
});

describe("the owner's examples (2026-11-15)", () => {
  it("2 ft at 5 s is nothing", () => {
    expect(waveStars(hour({ height: ft(2), period: 5 }))?.stars).toBe(0);
  });

  it("3 to 5 ft at 6 s with an offshore wind is a star or two", () => {
    for (const feet of [3, 4, 5])
      expect(
        waveStars(hour({ height: ft(feet), period: 6, windFrom: 90 }))?.stars,
      ).toBe(2);
  });

  it("a metre of 11 s swell onto a west-facing beach, cross-offshore, is five", () => {
    const r = waveStars(hour({ height: 1, period: 11, windFrom: 130 }));
    expect(r).toMatchObject({ stars: 5, potential: 4 });
    expect(r?.reasons).toContain("clean");
  });

  it("8 ft at 13 s, cross-shore, is five: no size is too big", () => {
    expect(
      waveStars(hour({ height: ft(8), period: 13, windFrom: 0 }))?.stars,
    ).toBe(5);
    expect(waveStars(hour({ height: ft(20), period: 16 }))?.stars).toBe(5);
  });
});

describe("the size", () => {
  it("under 2 ft is too small, whatever the period", () => {
    const r = waveStars(hour({ height: ft(1), period: 14 }));
    expect(r).toMatchObject({ stars: 0, potential: 0 });
    expect(r?.reasons).toContain("too-small");
  });

  it("2 ft has three stars at most, the wind's star too", () => {
    expect(waveStars(hour({ height: ft(2), period: 14 }))).toMatchObject({
      stars: 3,
      potential: 3,
    });
    expect(
      waveStars(hour({ height: ft(2), period: 14, windFrom: 90 }))?.stars,
    ).toBe(3);
  });
});

describe("the reach", () => {
  it("takes a star off a swell at an angle, and all of one running past", () => {
    expect(waveStars(hour({ direction: 330 }))?.stars).toBe(3);
    const past = waveStars(hour({ direction: 90 }));
    expect(past).toMatchObject({ stars: 0, potential: 0 });
    expect(past?.reasons).toContain("sheltered");
  });

  it("is not judged where the beach's facing or the swell's way is unknown", () => {
    expect(waveStars(hour({ facing: null, direction: 90 }))?.stars).toBe(4);
    expect(waveStars(hour({ direction: null }))?.stars).toBe(4);
  });
});

describe("the wind", () => {
  it("offshore and cross-offshore lift a star, onshore and cross-onshore take one", () => {
    expect(waveStars(hour({ windFrom: 90 }))?.stars).toBe(5);
    expect(waveStars(hour({ windFrom: 130 }))?.stars).toBe(5);
    expect(waveStars(hour({ windFrom: 0 }))?.stars).toBe(4);
    expect(waveStars(hour({ windFrom: 230 }))?.stars).toBe(3);
    expect(waveStars(hour({ windFrom: 270 }))).toMatchObject({
      stars: 3,
      potential: 4,
    });
  });

  it("never lifts chop, nor a swell running past the beach", () => {
    expect(waveStars(hour({ period: 5, windFrom: 90 }))?.stars).toBe(0);
    expect(waveStars(hour({ direction: 90, windFrom: 90 }))?.stars).toBe(0);
  });

  it("never goes past five", () => {
    expect(waveStars(hour({ period: 14, windFrom: 90 }))?.stars).toBe(5);
  });
});

it("has no rating with no period", () => {
  expect(waveStars(hour({ period: null }))).toBeNull();
});
