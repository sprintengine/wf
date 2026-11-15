import { describe, expect, it } from "vitest";
import {
  carryToCoast,
  COAST_REACH_KM,
  SHORE_LAND,
  SHORE_SEA,
  SHORE_UNKNOWN,
  WAVE_ALPHA,
  WAVE_STOPS,
  waveColour,
  waveImage,
  waveRamp,
} from "./waveField";
import type { Grid } from "./weather";

/** The light theme's stops (ui/theme.css), as getComputedStyle reads them. */
const THEME: Record<string, string> = {
  "--color-waves-m0": "#c9ece4",
  "--color-waves-m05": "#86d8cb",
  "--color-waves-m1": "#3fb6b4",
  "--color-waves-m2": "#1f83a8",
  "--color-waves-m3": "#2a55a3",
  "--color-waves-m5": "#3b2c8e",
  "--color-waves-m8": "#27105e",
};
const ramp = waveRamp((token) => THEME[token]);

describe("the wave height's colour", () => {
  it("reads every stop from the theme, from flat water to 8 m", () => {
    expect(WAVE_STOPS.map((stop) => stop.metres)).toEqual([
      0, 0.5, 1, 2, 3, 5, 8,
    ]);
    expect(waveColour(ramp, 0)).toEqual([0xc9, 0xec, 0xe4, 1]);
    expect(waveColour(ramp, 0.5)).toEqual([0x86, 0xd8, 0xcb, 1]);
    expect(waveColour(ramp, 2)).toEqual([0x1f, 0x83, 0xa8, 1]);
    expect(waveColour(ramp, 8)).toEqual([0x27, 0x10, 0x5e, 1]);
  });

  it("mixes in a straight line between two stops", () => {
    // Halfway from 3 m to 5 m.
    expect(waveColour(ramp, 4)).toEqual([
      (0x2a + 0x3b) / 2,
      (0x55 + 0x2c) / 2,
      (0xa3 + 0x8e) / 2,
      1,
    ]);
  });

  it("holds the last stop above 8 m, and has none for an unknown height", () => {
    expect(waveColour(ramp, 12)).toEqual(waveColour(ramp, 8));
    expect(waveColour(ramp, NaN)).toBeNull();
    expect(waveColour(ramp, Infinity)).toBeNull();
  });
});

describe("the wave map's picture", () => {
  // Twelve cells by twelve: the sea in the west, land in the east half.
  const grid: Grid = {
    width: 12,
    height: 12,
    west: -12,
    east: -1,
    north: 56,
    south: 45,
    dx: 1,
    dy: 1,
  };
  const heights = new Float32Array(144);
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++) heights[y * 12 + x] = x < 6 ? 2 : NaN;
  const image = waveImage(grid, heights, ramp, 4);
  const pixel = (x: number, y = Math.floor(image.height / 2)) => [
    ...image.data.slice(
      (y * image.width + x) * 4,
      (y * image.width + x) * 4 + 4,
    ),
  ];

  it("colours the sea, a little see-through", () => {
    // Four and a half cells in: past the picture's feathered edge.
    const sea = pixel(Math.round((image.width * 4.5) / 11));
    expect(sea).toEqual([0x1f, 0x83, 0xa8, Math.round(WAVE_ALPHA * 255)]);
  });

  it("leaves the land clear, the sea ending midway between the cells", () => {
    expect(pixel(Math.round(image.width * 0.75))[3]).toBe(0);
    // The last sea cell is the sixth of twelve, at 5/11 of the way across;
    // the first land cell at 6/11. Their midway is the coast.
    const coast = (5.5 / 11) * image.width;
    expect(pixel(Math.floor(coast) - 2)[3]).toBeGreaterThan(0);
    expect(pixel(Math.ceil(coast) + 1)[3]).toBe(0);
  });

  it("draws nothing where nothing is known", () => {
    const blank = waveImage(grid, new Float32Array(144).fill(NaN), ramp);
    expect(blank.data.every((value) => value === 0)).toBe(true);
  });
});

describe("the heights carried to the coast", () => {
  // SWAN's own grid off Dublin: 0.025° cells, about 2.8 km north to south
  // and 1.7 km east to west at 53° N. Fifteen cells across, five down.
  const grid: Grid = {
    width: 15,
    height: 5,
    west: -6.4,
    east: -6.05,
    north: 53.45,
    south: 53.35,
    dx: 0.025,
    dy: 0.025,
  };
  const cells = (row: (x: number) => number) =>
    Float32Array.from({ length: 75 }, (_, i) => row(i % 15));
  const at = (values: Float32Array, x: number, y = 2) => values[y * 15 + x];

  it("keeps every cell SWAN solved as it is", () => {
    const heights = cells((x) => (x >= 10 ? 1 + x / 10 : NaN));
    const carried = carryToCoast(grid, heights);
    for (let x = 10; x < 15; x++) expect(at(carried, x)).toBe(at(heights, x));
  });

  it("fills the unsolved water from the nearest solved cell, out to its reach", () => {
    // The open sea from the eleventh column east, a metre and a half; the
    // ten columns west of it unsolved, as SWAN leaves the water by a coast.
    const heights = cells((x) => (x >= 10 ? 1.5 : NaN));
    const carried = carryToCoast(grid, heights);
    const kmX = 0.025 * 111.32 * Math.cos((53.4 * Math.PI) / 180);
    const reach = Math.floor(COAST_REACH_KM / kmX);
    // Within the reach (four cells, some 6.6 km), the sea's height...
    for (let x = 10 - reach; x < 10; x++) expect(at(carried, x)).toBe(1.5);
    // ...and past it nothing, as a lough inland is given none.
    for (let x = 0; x < 10 - reach; x++) expect(at(carried, x)).toBeNaN();
  });

  it("takes the nearest of the solved cells, by the kilometre, not the cell", () => {
    // A cell north is 2.8 km off, a cell east 1.7 km: the east one is nearer.
    const heights = new Float32Array(75).fill(NaN);
    heights[1 * 15 + 7] = 3; // north
    heights[2 * 15 + 8] = 1; // east
    expect(at(carryToCoast(grid, heights), 7)).toBe(1);
  });

  it("means those equally near", () => {
    const heights = new Float32Array(75).fill(NaN);
    heights[2 * 15 + 6] = 1; // west
    heights[2 * 15 + 8] = 2; // east
    expect(at(carryToCoast(grid, heights), 7)).toBe(1.5);
  });

  it("gives nothing where nothing is solved", () => {
    const carried = carryToCoast(grid, new Float32Array(75).fill(NaN));
    expect(carried.every((value) => Number.isNaN(value))).toBe(true);
  });
});

describe("the wave map's picture kept to the shore", () => {
  // Twelve cells by twelve, as above: SWAN's sea in the west four columns,
  // the rest unsolved; the heights carried to the coast across all of it.
  const grid: Grid = {
    width: 12,
    height: 12,
    west: -12,
    east: -1,
    north: 56,
    south: 45,
    dx: 1,
    dy: 1,
  };
  const heights = new Float32Array(144);
  for (let i = 0; i < 144; i++) heights[i] = i % 12 < 4 ? 2 : NaN;
  const carried = new Float32Array(144).fill(2);
  const box = { west: -12, east: -1, north: 56, south: 45, width: 44 };
  const picture = (shoreOf: (col: number) => number) => {
    const height = 44;
    const shore = new Uint8Array(box.width * height);
    for (let row = 0; row < height; row++)
      for (let col = 0; col < box.width; col++)
        shore[row * box.width + col] = shoreOf(col);
    return waveImage(grid, heights, ramp, 2, {
      box: { ...box, height },
      carried,
      shore,
    });
  };
  const alpha = (image: ReturnType<typeof picture>, col: number) =>
    image.data[(22 * image.width + col) * 4 + 3];
  // SWAN's sea ends at 3.5 cells of 11, the 14th of 44 columns; the column
  // at six cells is well past it, and clear of the picture's feathered edge.
  const past = 24;

  it("carries the colour past SWAN's own sea on the basemap's sea", () => {
    const image = picture(() => SHORE_SEA);
    expect(alpha(image, past)).toBe(Math.round(WAVE_ALPHA * 255));
  });

  it("draws nothing on the basemap's land, SWAN's own cells included", () => {
    // Land from the 9th column: inside SWAN's sea, as a coarse cell's edge
    // can be.
    const image = picture((col) => (col < 9 ? SHORE_SEA : SHORE_LAND));
    expect(alpha(image, 6)).toBeGreaterThan(0);
    expect(alpha(image, 10)).toBe(0);
    expect(alpha(image, past)).toBe(0);
  });

  it("where the shore is unknown, draws SWAN's own sea alone", () => {
    const image = picture(() => SHORE_UNKNOWN);
    expect(alpha(image, 6)).toBeGreaterThan(0);
    expect(alpha(image, past)).toBe(0);
  });

  it("draws nothing off the grid", () => {
    const shore = new Uint8Array(40 * 40).fill(SHORE_SEA);
    const image = waveImage(grid, heights, ramp, 2, {
      box: { west: 10, east: 20, north: 30, south: 20, width: 40, height: 40 },
      carried,
      shore,
    });
    expect(image.data.every((value) => value === 0)).toBe(true);
  });
});
