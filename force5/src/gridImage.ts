// A latitude–longitude grid laid out as a picture for the map: the shared
// geometry of the fields drawn as one image each (the sky and its rain,
// force5/src/sky.ts and rain.ts; the waves, waveField.ts). Pure: nothing here
// draws or fetches.
//
// The picture's rows are evenly spaced in Mercator, the map's own projection,
// which a latitude grid is not; each pixel samples the grid bilinearly
// between the four cells round it, and the picture's edge fades over a few
// cells rather than stopping in a straight line.
import type { Grid } from "./weather";

export interface GridImage {
  width: number;
  height: number;
  /** RGBA, row by row from the north, as an ImageData takes it. */
  data: Uint8ClampedArray;
  /** The image's corners for a MapLibre image source: NW, NE, SE, SW. */
  coordinates: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ];
}

/**
 * Where each pixel samples the grid: for each row of pixels the grid rows
 * either side of it and how far between them, and the same for each column;
 * and how far each is inside the picture's feathered edge (0 at the edge, 1
 * once a few cells in).
 */
export interface GridLayout {
  width: number;
  height: number;
  coordinates: GridImage["coordinates"];
  y0: Int32Array;
  y1: Int32Array;
  ty: Float32Array;
  edgeY: Float32Array;
  x0: Int32Array;
  x1: Int32Array;
  tx: Float32Array;
  edgeX: Float32Array;
}

/** Mercator y of a latitude, in radians of the projection. */
const mercator = (lat: number) =>
  Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latitude = (y: number) =>
  (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * (180 / Math.PI);

/** How many cells the picture's edge fades over. */
const FEATHER = 4;

/**
 * A box of the map to picture a grid over, and the picture's size: the view
 * and a margin round it, say, rather than the grid's own extent.
 */
export interface GridBox {
  west: number;
  east: number;
  north: number;
  south: number;
  width: number;
  height: number;
}

/**
 * The picture of a grid, `scale` pixels to a cell each way; or, given a
 * `box`, of that box at its own size, where every pixel off the grid is past
 * its feathered edge.
 */
export function gridLayout(grid: Grid, scale = 2, box?: GridBox): GridLayout {
  const w = grid.width;
  const yGridN = mercator(grid.north);
  const yGridS = mercator(grid.south);
  // As many rows as the finest cell (the southern, in Mercator) needs.
  const finest = mercator(grid.south + grid.dy) - yGridS;
  const { west, east, north, south } = box ?? grid;
  const width = box ? box.width : Math.max(2, Math.round(w * scale));
  const height = box
    ? box.height
    : Math.max(2, Math.ceil(((yGridN - yGridS) / finest + 1) * scale));
  const yN = mercator(north);
  const yS = mercator(south);
  const y0 = new Int32Array(height);
  const y1 = new Int32Array(height);
  const ty = new Float32Array(height);
  const edgeY = new Float32Array(height);
  for (let row = 0; row < height; row++) {
    const lat = latitude(yN + ((yS - yN) * (row + 0.5)) / height);
    const at = (grid.north - lat) / grid.dy;
    const fy = Math.min(grid.height - 1, Math.max(0, at));
    y0[row] = Math.floor(fy);
    y1[row] = Math.min(grid.height - 1, y0[row] + 1);
    ty[row] = fy - y0[row];
    edgeY[row] = Math.min(1, Math.min(at, grid.height - 1 - at) / FEATHER);
  }
  const x0 = new Int32Array(width);
  const x1 = new Int32Array(width);
  const tx = new Float32Array(width);
  const edgeX = new Float32Array(width);
  for (let col = 0; col < width; col++) {
    const lng = west + ((east - west) * (col + 0.5)) / width;
    const at = ((lng - grid.west) / (grid.east - grid.west)) * (w - 1);
    const fx = Math.min(w - 1, Math.max(0, at));
    x0[col] = Math.floor(fx);
    x1[col] = Math.min(w - 1, x0[col] + 1);
    tx[col] = fx - x0[col];
    edgeX[col] = Math.min(1, Math.min(at, w - 1 - at) / FEATHER);
  }
  return {
    width,
    height,
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
    y0,
    y1,
    ty,
    edgeY,
    x0,
    x1,
    tx,
    edgeX,
  };
}

/**
 * A grid's value at one pixel, bilinear between the four cells round it. An
 * unknown cell (NaN) is left out and the rest reweighted. NaN where none is
 * known, or where those known carry less than `least` of the weight: half,
 * say, to end a field at the line midway between known cells and unknown.
 */
export function sampleAt(
  values: ArrayLike<number>,
  gridWidth: number,
  layout: GridLayout,
  row: number,
  col: number,
  least = 0,
): number {
  const ty = layout.ty[row];
  const tx = layout.tx[col];
  const top = layout.y0[row] * gridWidth;
  const bottom = layout.y1[row] * gridWidth;
  const a = values[top + layout.x0[col]];
  const b = values[top + layout.x1[col]];
  const c = values[bottom + layout.x0[col]];
  const d = values[bottom + layout.x1[col]];
  const ka = a === a ? (1 - tx) * (1 - ty) : 0;
  const kb = b === b ? tx * (1 - ty) : 0;
  const kc = c === c ? (1 - tx) * ty : 0;
  const kd = d === d ? tx * ty : 0;
  const known = ka + kb + kc + kd;
  if (!known || known < least) return NaN;
  const sum = (ka && a * ka) + (kb && b * kb) + (kc && c * kc) + (kd && d * kd);
  return sum / known;
}

/** How far a pixel is inside the picture's feathered edge, 0 to 1. */
export const edgeAt = (layout: GridLayout, row: number, col: number) =>
  Math.max(0, Math.min(layout.edgeY[row], layout.edgeX[col]));
