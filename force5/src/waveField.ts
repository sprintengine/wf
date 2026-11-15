// The map's Waves field: the wave height on the sea at the hour shown, from
// Irish Shelf SWAN's frames (force5/src/waveFrames.ts), coloured as the
// finder's cards colour a wave height. Pure: the colours are read from the
// theme by whoever draws (force5/src/waveLayer.ts) and given, and the legend
// (src/MapScales.tsx) builds its ramp from the same stops.
//
// SWAN leaves the water next to much of the coast unsolved, as land: most of
// Dublin Bay, and the first few kilometres off Portmarnock, Malahide, Rush
// and Skerries. So the heights are carried in from the nearest cell it did
// solve, 8 km at most (carryToCoast), and the picture is kept to
// the basemap's own sea, which the layer reads off the chart (WaveShore): the
// colour reaches the coast the chart draws, and never crosses it.
import { WAVE_STOPS } from "./fieldStops";
import { parseColour } from "./foilDepth";
import {
  edgeAt,
  gridLayout,
  sampleAt,
  type GridBox,
  type GridImage,
} from "./gridImage";
import type { RainRgba } from "./rain";
import type { Grid } from "./weather";

export { WAVE_STOPS };

/**
 * How solid the sea's colour is: nearly, since the height is the field and
 * its steps must read true, but not quite, so the depth tints' banks and the
 * chart's soundings still show faintly through it near the shore.
 */
export const WAVE_ALPHA = 0.85;

/** The wave map at one hour, as the map draws it. */
export interface WaveView {
  /** Changes whenever the picture would: the run and the frame. */
  key: string;
  grid: Grid;
  /** Metres per cell, rows north to south; NaN on land and off the model. */
  heights: Float32Array;
  /** The frame's hour, in UTC milliseconds. */
  time: number;
}

export type WaveRamp = { metres: number; rgba: RainRgba }[];

/** The ramp's colours, read from the theme (or given, in a test). */
export const waveRamp = (read: (token: string) => string): WaveRamp =>
  WAVE_STOPS.map(({ metres, token }) => ({
    metres,
    rgba: parseColour(read(token)) ?? [0, 0, 0, 0],
  }));

/** The colour of a wave height; the last stop's above it, null where unknown. */
export function waveColour(ramp: WaveRamp, metres: number): RainRgba | null {
  if (!Number.isFinite(metres) || !ramp.length) return null;
  const at = ramp.findIndex((stop) => stop.metres >= metres);
  if (at === 0) return ramp[0].rgba;
  if (at < 0) return ramp[ramp.length - 1].rgba;
  const a = ramp[at - 1];
  const b = ramp[at];
  const t = (metres - a.metres) / (b.metres - a.metres);
  return a.rgba.map((v, i) => v + (b.rgba[i] - v) * t) as unknown as RainRgba;
}

/**
 * How far the heights are carried from the nearest cell SWAN solved, in
 * kilometres: as far as the ingest looks for a spot's own wet cell
 * (force5/ingest/fetch_mi_swan.py, `searchKm`), so the map colours the water
 * wherever a card reads its figure from SWAN, and no further. Dublin Bay's
 * inner shore is some 5 km from the nearest solved cell, and a pixel there
 * needs the cells round it, a cell further on.
 */
export const COAST_REACH_KM = 8;

const KM_PER_DEGREE = 111.32;

/**
 * The heights with the unsolved cells near the sea filled: each cell within
 * `reachKm` of a solved one takes the height of the nearest (the mean of
 * those equally near), as a spot's figure does. Cells further from any solved
 * cell stay unknown, so a lough inland, or a harbour far up from the open
 * sea, is never given a height. A solved cell is kept as it is.
 */
export function carryToCoast(
  grid: Grid,
  heights: Float32Array,
  reachKm = COAST_REACH_KM,
): Float32Array {
  const { width, height } = grid;
  const carried = Float32Array.from(heights);
  const kmY = grid.dy * KM_PER_DEGREE;
  const rows = Math.floor(reachKm / kmY);
  for (let y = 0; y < height; y++) {
    const lat = grid.north - y * grid.dy;
    const kmX = grid.dx * KM_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
    const cols = Math.floor(reachKm / kmX);
    for (let x = 0; x < width; x++) {
      if (heights[y * width + x] === heights[y * width + x]) continue;
      let best = reachKm * reachKm + 1e-9;
      let sum = 0;
      let count = 0;
      const top = Math.max(0, y - rows);
      const bottom = Math.min(height - 1, y + rows);
      const left = Math.max(0, x - cols);
      const right = Math.min(width - 1, x + cols);
      for (let j = top; j <= bottom; j++)
        for (let i = left; i <= right; i++) {
          const value = heights[j * width + i];
          if (value !== value) continue;
          const d = ((j - y) * kmY) ** 2 + ((i - x) * kmX) ** 2;
          if (d < best - 1e-9) {
            best = d;
            sum = value;
            count = 1;
          } else if (d <= best + 1e-9) {
            sum += value;
            count++;
          }
        }
      if (count) carried[y * width + x] = sum / count;
    }
  }
  return carried;
}

/** What the basemap says a pixel of the picture is. */
export const SHORE_LAND = 0;
export const SHORE_SEA = 1;
/** Off the part of the chart whose coast was read: the margin past the view. */
export const SHORE_UNKNOWN = 2;

/**
 * The picture drawn for the view rather than the grid: its box, the heights
 * carried to the coast, and the shore under each pixel, row by row from the
 * north. On the sea the carried heights are drawn, on the land nothing, and
 * where the shore is unknown SWAN's own sea alone, as with no shore at all.
 */
export interface WaveShore {
  box: GridBox;
  carried: Float32Array;
  shore: Uint8Array;
}

/** The table's steps: a centimetre in five is finer than a colour shows. */
const TABLE_STEP_M = 0.05;

/**
 * The Waves field's picture: the heights coloured, on the sea alone, laid out
 * for the map (force5/src/gridImage.ts), `scale` pixels to a cell each way,
 * or over a `shore`'s box. Between sea cells the height is bilinear; the land
 * and anywhere the model does not reach (NaN) is transparent, the sea ending
 * midway between a wet cell and a dry one, so the coast is not drawn half a
 * cell inland. With a shore, the carried heights fill the sea up to the
 * basemap's coast, and nothing is drawn on its land.
 */
export function waveImage(
  grid: Grid,
  heights: Float32Array,
  ramp: WaveRamp,
  scale = 2,
  shore?: WaveShore,
): GridImage {
  const layout = gridLayout(grid, scale, shore?.box);
  const { width, height } = layout;
  const data = new Uint8ClampedArray(width * height * 4);
  const top = ramp.length ? ramp[ramp.length - 1].metres : 0;
  const steps = Math.round(top / TABLE_STEP_M);
  // The ramp read once, a colour every 5 cm up to its last stop.
  const table = Array.from(
    { length: steps + 1 },
    (_, k) => waveColour(ramp, k * TABLE_STEP_M) ?? [0, 0, 0, 0],
  );
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const edge = edgeAt(layout, row, col);
      if (!edge) continue;
      const at = shore ? shore.shore[row * width + col] : SHORE_UNKNOWN;
      if (at === SHORE_LAND) continue;
      let metres = sampleAt(heights, grid.width, layout, row, col, 0.5);
      if (metres !== metres && at === SHORE_SEA)
        metres = sampleAt(shore!.carried, grid.width, layout, row, col, 0.5);
      if (metres !== metres) continue;
      const [r, g, b, a] =
        table[Math.min(steps, Math.max(0, Math.round(metres / TABLE_STEP_M)))];
      const i = (row * width + col) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = Math.round(a * WAVE_ALPHA * 255 * edge);
    }
  }
  return { width, height, data, coordinates: layout.coordinates };
}
