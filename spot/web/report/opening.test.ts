import { describe, expect, it } from "vitest";
import { between, easeOut, sameEased, stack, zeroed } from "./opening";

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

describe("a value part way to the next", () => {
  it("moves each number by its key or its place", () => {
    const from = { most: 2, hours: { 10: [12, 20], 11: [8, null] } };
    const to = { most: 4, hours: { 10: [16, 24], 11: [10, 14] } };
    expect(between(from, to, 0.5)).toEqual({
      most: 3,
      hours: { 10: [14, 22], 11: [9, 14] },
    });
    expect(between(from, to, 0)).toEqual({
      most: 2,
      hours: { 10: [12, 20], 11: [8, 14] },
    });
    expect(between(from, to, 1)).toBe(to);
  });

  it("brings in at once what was not there, and leaves out what has gone", () => {
    const from = { 10: 5, 11: 7 };
    const to = { 11: 9, 12: 3 };
    expect(between(from, to, 0.5)).toEqual({ 11: 8, 12: 3 });
    expect(between([1, 2], [3, 4, 5], 0.5)).toEqual([2, 3, 5]);
    expect(between(4, null, 0.5)).toBeNull();
  });

  it("grows what comes from nothing and shrinks what goes, where asked", () => {
    // An hour one model has and the other has not: its bar grows from the
    // foot, or goes down to it and is gone at the end.
    const from = { 10: [5, 8], 11: [7, null] };
    const to = { 11: [9, 12], 12: [4, null] };
    expect(between(from, to, 0.5, true)).toEqual({
      10: [2.5, 4],
      11: [8, 12],
      12: [2, null],
    });
    expect(between(from, to, 0, true)).toEqual({
      10: [5, 8],
      11: [7, 12],
      12: [0, null],
    });
    expect(between(from, to, 1, true)).toBe(to);
    // Nested records too: a model's dots that come and go.
    expect(
      between({ ecmwf: { 1: 10 } }, { harmonie: { 1: 20 } }, 0.5, true),
    ).toEqual({ ecmwf: { 1: 5 }, harmonie: { 1: 10 } });
    expect(zeroed({ a: [3, null], b: 2 })).toEqual({ a: [0, null], b: 0 });
  });

  it("knows a value the same, number for number, from one that moved", () => {
    expect(sameEased({ a: [1, null], b: 2 }, { a: [1, null], b: 2 })).toBe(
      true,
    );
    expect(sameEased({ a: [1, null] }, { a: [1, 0] })).toBe(false);
    expect(sameEased({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameEased([1, 2], [1, 2, 3])).toBe(false);
    expect(sameEased(3, 3)).toBe(true);
  });
});
