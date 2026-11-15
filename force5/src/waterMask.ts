// The basemap's own water drawn into a picture's pixels, for a field kept off
// the land: the coloured wind's wash (windLayer.ts) and the waves
// (waveLayer.ts). Read from the vector tiles the chart has loaded, so it
// holds for what is on screen and is redrawn as the view settles.
import type { Map as MapLibreMap } from "maplibre-gl";

/** OpenStreetMap's sea, in the tiles' `water` layer: not a lough or a river. */
export const isSea = (properties: Record<string, unknown>) =>
  properties.class === "ocean";

/**
 * The water's polygons filled into `canvas` at `w` by `h`, `toPixel` placing
 * a point; its RGBA, opaque on the water. Only the polygons `keep` takes, when
 * given. Null where the tiles hold no water yet (they have not loaded, or
 * the style has no such source).
 */
export function waterMask(
  map: MapLibreMap,
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  toPixel: (lng: number, lat: number) => [number, number],
  keep?: (properties: Record<string, unknown>) => boolean,
): Uint8ClampedArray | null {
  let features: ReturnType<MapLibreMap["querySourceFeatures"]> = [];
  try {
    features = map.querySourceFeatures("omt", { sourceLayer: "water" });
  } catch {
    return null;
  }
  if (!features.length) return null;
  canvas.width = w;
  canvas.height = h;
  const m = canvas.getContext("2d", { willReadFrequently: true })!;
  m.clearRect(0, 0, w, h);
  m.fillStyle = "#000";
  m.beginPath();
  const ring = (coords: number[][]) => {
    coords.forEach(([lng, lat], i) => {
      const [x, y] = toPixel(lng, lat);
      if (i) m.lineTo(x, y);
      else m.moveTo(x, y);
    });
    m.closePath();
  };
  for (const f of features) {
    if (keep && !keep(f.properties ?? {})) continue;
    const g = f.geometry;
    if (g.type === "Polygon") g.coordinates.forEach(ring);
    else if (g.type === "MultiPolygon")
      g.coordinates.forEach((poly) => poly.forEach(ring));
  }
  // Non-zero, not even-odd: neighbouring tiles overlap by their buffers.
  m.fill("nonzero");
  return m.getImageData(0, 0, w, h).data;
}
