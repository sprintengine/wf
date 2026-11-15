// Wave stars: how good an hour's sea is to ride, out of five, apart from the
// wind's stars and never moving them (the owner's ruling of 15 November 2026,
// docs/STAR_RATINGS.md). The wind's stars say whether the hour can be ridden
// on a wing, and safely; the wave stars say how good the waves are. Pure, over
// the sea a spot's pill and card already read (./pillContent.ts, the total
// sea's height, peak period and where it comes from), the beach's facing
// (./shoreFacing.ts) and the wind's direction, so every surface rates a sea
// the same way.
//
// The period is what a wave is worth: the longer, the better.
//
//   period     the stars to start from, on the whole seconds the pill shows:
//              under 6 s none (chop), 6–7 s one, 8 s two, 9 s three, 10–11 s
//              four, 12 s and over five.
//   reach      the swell against the beach's facing: within 45° of straight
//              in, as it is; 45–90°, a star off; past 90° it runs away from
//              the beach and the hour has none (sheltered).
//   wind       an offshore or cross-offshore wind holds the faces up and
//              cleans them, a star on; an onshore or cross-onshore one makes
//              them messy, a star off; cross-shore, neither. A star on only
//              lifts a sea that has one already: chop is chop.
//   size       on the whole feet the pill shows: under 2 ft too small to ride,
//              none; 2 ft three stars at most; from 3 ft any size, however
//              big, may have five.
//
// Two numbers, as the wind's: `potential`, what the swell is worth with the
// wind out of it (period, reach and size), and `stars`, after the wind. The
// stars between them, where the wind took one off, are outlined; a wind that
// adds one lifts the stars over the potential.

import { shoreAngle } from "./stars";
import { FEET_PER_METRE } from "./units";

/** One hour's sea at a spot, and the wind over it. */
export interface WaveHour {
  /** The sea's significant height, metres. */
  height: number;
  /** Its peak period, seconds, or null where none is given. */
  period: number | null;
  /** Where it comes from, degrees, or null. */
  direction: number | null;
  /** Where the wind comes from, degrees, or null. */
  windFrom: number | null;
  /** The beach's seaward bearing (./shoreFacing.ts), or null where unknown. */
  facing: number | null;
}

/** Why the stars are what they are, for a tip to say. */
export type WaveReason =
  "chop" | "too-small" | "small" | "sheltered" | "angled" | "clean" | "messy";

export interface WaveRating {
  /** Out of five, after the wind. */
  stars: number;
  /** Out of five, the swell alone: period, reach and size. */
  potential: number;
  reasons: WaveReason[];
}

/** The smallest sea worth a star, in whole feet. */
export const WAVE_MIN_FT = 2;
/** A sea this many whole feet or less has three stars at most. */
export const WAVE_SMALL_FT = 2;
const SMALL_MOST = 3;

/** The stars a period starts from, on its whole seconds. */
export function periodStars(seconds: number): number {
  const s = Math.round(seconds);
  if (s < 6) return 0;
  if (s < 8) return 1;
  if (s < 9) return 2;
  if (s < 10) return 3;
  if (s < 12) return 4;
  return 5;
}

/** How far apart two bearings are, 0 to 180°. */
const apart = (a: number, b: number) =>
  Math.abs(((((a - b) % 360) + 540) % 360) - 180);

/**
 * An hour's wave stars, or null where the sea has no period to rate it by.
 * A spot the open sea's waves do not reach has no sea, and no rating.
 */
export function waveStars(hour: WaveHour): WaveRating | null {
  if (hour.period === null) return null;
  const reasons: WaveReason[] = [];
  let potential = periodStars(hour.period);
  if (potential === 0) reasons.push("chop");
  // Does the swell reach the beach?
  if (potential > 0 && hour.direction !== null && hour.facing !== null) {
    const off = apart(hour.direction, hour.facing);
    if (off > 90) {
      potential = 0;
      reasons.push("sheltered");
    } else if (off > 45) {
      potential -= 1;
      reasons.push("angled");
    }
  }
  const feet = Math.round(hour.height * FEET_PER_METRE);
  const small = (n: number) => {
    if (feet < WAVE_MIN_FT) return 0;
    if (feet <= WAVE_SMALL_FT) return Math.min(n, SMALL_MOST);
    return n;
  };
  if (feet < WAVE_MIN_FT) reasons.push("too-small");
  else if (feet <= WAVE_SMALL_FT && potential > SMALL_MOST)
    reasons.push("small");
  let stars = potential;
  if (potential > 0 && hour.windFrom !== null && hour.facing !== null) {
    const way = shoreAngle(hour.windFrom, hour.facing);
    if (way === "offshore" || way === "cross-off") {
      stars += 1;
      reasons.push("clean");
    } else if (way === "onshore" || way === "cross-on") {
      stars -= 1;
      reasons.push("messy");
    }
  }
  return {
    stars: Math.max(0, Math.min(5, small(stars))),
    potential: Math.max(0, small(potential)),
    reasons,
  };
}

/** What each reason says, in a tip. */
export const WAVE_REASON: Record<WaveReason, string> = {
  chop: "Short period, chop rather than swell",
  "too-small": "Too small to ride",
  small: "Small, three stars at most",
  sheltered: "The swell runs past the beach",
  angled: "The swell comes in at an angle, 1 star off",
  clean: "The wind holds the faces up, 1 star on",
  messy: "The wind blows onto the waves, 1 star off",
};
