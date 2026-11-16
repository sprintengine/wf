/**
 * The map's one field: the colour laid over the sea and the land, chosen with
 * the lit chips in the map's dock (src/MapDock.tsx). At most one is on. Wind
 * is the coloured wind, Waves the wave height on the sea, Weather the sky
 * (grey cloud, yellow clear sky, black night) with the rain over it, and Tide
 * the tidal depth: the shallows round the coast coloured by how deep the
 * water over them is at the hour shown (./foilDepth.ts). Tide is a first
 * visit's field; with none on, the map is dark and plain.
 *
 * Apart from the map, so the choice is read and kept the same way wherever it
 * is shown: the finder's map and the full chart share it.
 */
import type { WindLayers } from "./windLayers";

/** A field the map can lay over the sea. */
export type FieldId = "wind" | "waves" | "weather" | "tide";
/** The rider's choice: one field, or none. */
export type MapField = FieldId | "none";

/**
 * Where the choice is kept, "none" too. Since Tide became a chip
 * (2026-11-16), "none" here is the plain map.
 */
export const FIELD_KEY = "wingfoil.map.field.v2";
/**
 * Where it was kept before Tide had a chip: there "none" was the map with the
 * shallows glowing, which is the Tide field now.
 */
export const OLD_FIELD_KEY = "wingfoil.map.field.v1";

/** Every field, in the order their chips stand. */
export const FIELDS: readonly FieldId[] = ["wind", "waves", "weather", "tide"];

/** A field's name on its chip and in the legend. */
export const FIELD_NAMES: Record<FieldId, string> = {
  wind: "Wind",
  waves: "Waves",
  weather: "Weather",
  tide: "Tide",
};

/** A first visit's map: the tidal depth, the shallows glowing round the coast. */
export const DEFAULT_FIELD: MapField = "tide";

const isField = (value: unknown): value is MapField =>
  value === "none" || FIELDS.includes(value as FieldId);

/**
 * The rider's field from the store. A choice made with the chips is kept as
 * it was, "none" too. One made before Tide had a chip (`older`, the old key)
 * is kept too, but its "none" was the shallows glowing, so it is Tide now.
 * Before the chips there was the wind's Coloured wind layer (`wind`, as
 * windLayers.ts reads it): a rider who had it on starts on Wind, and everyone
 * else on Tide.
 */
export function parseMapField(
  saved: string | null,
  older: string | null = null,
  wind: WindLayers | null = null,
): MapField {
  if (isField(saved)) return saved;
  if (isField(older)) return older === "none" ? "tide" : older;
  return wind?.wash ? "wind" : DEFAULT_FIELD;
}

/**
 * The field after a chip is pressed: that chip's field, or none when it was
 * the one on already.
 */
export const pressField = (on: MapField, pressed: FieldId): MapField =>
  on === pressed ? "none" : pressed;

/** Which fields have something to draw them with. */
export interface FieldSources {
  /**
   * The wave height as frames for the map: whether the wave model's pointer
   * lists any, as the page finds once it is idle (src/useWaves.ts). With none
   * there is no Waves chip; the cards still have their waves.
   */
  waves: boolean;
}

/** The fields offered as chips: every one with a source, in their order. */
export const offeredFields = (sources: FieldSources): FieldId[] =>
  FIELDS.filter((field) => field !== "waves" || sources.waves);

/**
 * The field the map draws: the rider's, while it is offered; a first visit's
 * while it is not (Waves chosen where no wave frames are), the choice itself
 * kept.
 */
export const shownField = (
  chosen: MapField,
  offered: readonly FieldId[],
): MapField =>
  chosen !== "none" && !offered.includes(chosen) ? DEFAULT_FIELD : chosen;

/**
 * The wind's two layers with the field: the coloured wind is the Wind field,
 * the particles the rider's own switch on the chart's rail.
 */
export const windWith = (field: MapField, particles: boolean): WindLayers => ({
  wash: field === "wind",
  particles,
});
