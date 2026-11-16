import { describe, expect, it } from "vitest";
import { easeOut, stack } from "./opening";

const BANDS = [
  ["a", 20, 8],
  ["b", 40, 6],
  ["c", 30, 10],
] as const;
const all = () => true;

describe("a section's stack of rows", () => {
  it("lays every row open under the last, the axis under the last row", () => {
    const st = stack(BANDS, 24, all);
    expect(st.at).toEqual({ a: [24, 20], b: [52, 40], c: [98, 30] });
    // The last row's own gap is not kept: the axis is 8 under it.
    expect(st.axis).toBe(98 + 30 + 8);
    expect(st.height).toBe(st.axis + 22);
  });

  it("takes no room for a row switched off, or one with nothing to draw", () => {
    const off = stack(BANDS, 24, all, { b: 0 });
    expect(off.at.b).toBeUndefined();
    expect(off.at.c).toEqual([52, 30]);
    const none = stack(BANDS, 24, (band) => band !== "b");
    expect(none).toEqual(off);
  });

  it("gives a row part open its share of its height and gap, drawn whole", () => {
    const half = stack(BANDS, 24, all, { b: 0.5 });
    expect(half.at.b).toEqual([52, 40]);
    expect(half.open.b).toBe(0.5);
    expect(half.at.c).toEqual([52 + 23, 30]);
  });

  it("moves the foot smoothly as the last row folds, with no jump at the end", () => {
    const shut = stack(BANDS, 24, all, { c: 0 }).axis;
    const nearly = stack(BANDS, 24, all, { c: 0.001 }).axis;
    expect(Math.abs(nearly - shut)).toBeLessThan(0.1);
    const open = stack(BANDS, 24, all).axis;
    const almost = stack(BANDS, 24, all, { c: 0.999 }).axis;
    expect(Math.abs(open - almost)).toBeLessThan(0.1);
  });

  it("moves the foot smoothly as the first row folds", () => {
    const shut = stack(BANDS, 24, all, { a: 0 });
    const nearly = stack(BANDS, 24, all, { a: 0.001 });
    expect(Math.abs(nearly.at.b![0] - shut.at.b![0])).toBeLessThan(0.1);
  });
});

describe("the ease", () => {
  it("runs from 0 to 1, fast at first, and holds past either end", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
  });
});
