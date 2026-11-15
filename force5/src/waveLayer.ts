// The Waves field on the chart: the wave height on the sea at the hour shown
// (force5/src/waveField.ts), as one picture under the chart's ink
// (force5/src/imageLayer.ts). Loaded by WindMap.tsx the first time the field
// has anything to draw.
//
// The picture covers the view and a third of it past each edge, and is drawn
// again each time the map settles: the heights carried to the coast are
// kept to the sea the chart draws, read from the basemap's own water
// (waterMask.ts) for what is on screen. Past the view, where that has not
// been read, it is SWAN's own sea alone, until the next settle.
import type { Map as MapLibreMap } from "maplibre-gl";
import { hideImage, paintImage, showImage } from "./imageLayer";
import { WAVE_STOPS } from "./fieldStops";
import {
  carryToCoast,
  SHORE_LAND,
  SHORE_SEA,
  SHORE_UNKNOWN,
  waveImage,
  waveRamp,
  type WaveView,
} from "./waveField";
import { isSea, waterMask } from "./waterMask";

export const WAVE_LAYER = "waves";

/** Screen pixels to a pixel of the picture: fine enough for the coast. */
const STEP = 3;

interface Shown {
  /** The frame drawn while the field is on; null while it is off. */
  view: WaveView | null;
  /** What the picture was last drawn for: the frame, colours and camera. */
  painted: string;
}

const shown = new WeakMap<MapLibreMap, Shown>();
/** Each frame's heights carried to the coast, worked out once. */
const carried = new WeakMap<Float32Array, Float32Array>();
let mask: HTMLCanvasElement | null = null;

/** Says on the map's box which frame it draws, for the page's own tests. */
function mark(map: MapLibreMap, view: WaveView | null) {
  const box = map.getContainer();
  if (view) box.dataset.waves = new Date(view.time).toISOString();
  else delete box.dataset.waves;
}

/**
 * Draw the picture for the view, again only when the frame, the theme's
 * colours or the camera have changed, or the chart's tiles have since come
 * in: the wave height's ramp is re-themed, so a change of theme draws it
 * afresh in the new one.
 */
function paint(map: MapLibreMap, state: Shown) {
  const view = state.view;
  if (!view) return;
  const box = map.getContainer();
  const style = getComputedStyle(box);
  const read = (token: string) => style.getPropertyValue(token);
  const rect = box.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const zoom = map.getZoom();
  const centre = map.getCenter();
  const loaded = map.areTilesLoaded();
  const key = [
    view.key,
    ...WAVE_STOPS.map(({ token }) => read(token)),
    zoom.toFixed(3),
    centre.lng.toFixed(4),
    centre.lat.toFixed(4),
    `${rect.width}x${rect.height}`,
    loaded,
  ].join("|");
  if (state.painted === key && map.getLayer(WAVE_LAYER)) return;
  const mx = rect.width / 3;
  const my = rect.height / 3;
  const nw = map.unproject([-mx, -my]);
  const se = map.unproject([rect.width + mx, rect.height + my]);
  const width = Math.max(2, Math.round((rect.width + 2 * mx) / STEP));
  const height = Math.max(2, Math.round((rect.height + 2 * my) / STEP));
  const mercator = (lat: number) =>
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const yN = mercator(nw.lat);
  const yS = mercator(se.lat);
  const toPixel = (lng: number, lat: number): [number, number] => [
    ((lng - nw.lng) / (se.lng - nw.lng)) * width,
    ((yN - mercator(lat)) / (yN - yS)) * height,
  ];
  mask ??= document.createElement("canvas");
  const water = waterMask(map, mask, width, height, toPixel, isSea);
  const shore = new Uint8Array(width * height).fill(SHORE_UNKNOWN);
  if (water) {
    // The basemap's sea is known for the view alone: its tiles are loaded.
    const left = Math.floor(mx / STEP);
    const right = Math.min(width, Math.ceil((mx + rect.width) / STEP));
    const top = Math.floor(my / STEP);
    const bottom = Math.min(height, Math.ceil((my + rect.height) / STEP));
    for (let row = top; row < bottom; row++)
      for (let col = left; col < right; col++) {
        const at = row * width + col;
        shore[at] = water[at * 4 + 3] > 127 ? SHORE_SEA : SHORE_LAND;
      }
  }
  let filled = carried.get(view.heights);
  if (!filled) {
    filled = carryToCoast(view.grid, view.heights);
    carried.set(view.heights, filled);
  }
  paintImage(
    map,
    WAVE_LAYER,
    waveImage(view.grid, view.heights, waveRamp(read), 2, {
      box: {
        west: nw.lng,
        east: se.lng,
        north: nw.lat,
        south: se.lat,
        width,
        height,
      },
      carried: filled,
      shore,
    }),
  );
  state.painted = key;
}

/** Draw the frame, and keep it drawn for the view as the camera settles. */
export function drawWaves(map: MapLibreMap, view: WaveView) {
  let state = shown.get(map);
  if (!state) {
    const kept: Shown = { view: null, painted: "" };
    shown.set(map, kept);
    // Once the camera has settled and the tiles for where it settled are in,
    // not on the move's end: the coast is read from the tiles, and at the end
    // of a jump they are still the last view's.
    map.on("idle", () => paint(map, kept));
    state = kept;
  }
  state.view = view;
  paint(map, state);
  showImage(map, WAVE_LAYER);
  mark(map, view);
}

export function hideWaves(map: MapLibreMap) {
  const state = shown.get(map);
  if (state) state.view = null;
  hideImage(map, WAVE_LAYER);
  mark(map, null);
}
