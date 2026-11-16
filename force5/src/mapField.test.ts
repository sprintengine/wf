import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIELD,
  FIELDS,
  offeredFields,
  parseMapField,
  pressField,
  shownField,
  windWith,
} from "./mapField";

describe("parseMapField", () => {
  it("opens a first visit on Tide", () => {
    expect(DEFAULT_FIELD).toBe("tide");
    expect(parseMapField(null)).toBe("tide");
    expect(parseMapField(null, null, { wash: false, particles: true })).toBe(
      "tide",
    );
  });

  it("keeps the rider's choice, none too", () => {
    for (const field of [...FIELDS, "none"] as const)
      expect(
        parseMapField(field, "weather", { wash: true, particles: true }),
      ).toBe(field);
  });

  it("reads a choice from before Tide had a chip, its none as Tide", () => {
    expect(parseMapField(null, "none")).toBe("tide");
    expect(parseMapField(null, "none", { wash: true, particles: true })).toBe(
      "tide",
    );
    for (const field of ["wind", "waves", "weather"] as const)
      expect(parseMapField(null, field)).toBe(field);
    expect(parseMapField("junk", "weather")).toBe("weather");
  });

  it("starts a rider who had Coloured wind on on Wind", () => {
    expect(parseMapField(null, null, { wash: true, particles: false })).toBe(
      "wind",
    );
    expect(parseMapField("rain", "rain", { wash: true, particles: true })).toBe(
      "wind",
    );
  });

  it("reads anything else as Tide", () => {
    expect(parseMapField("")).toBe("tide");
    expect(parseMapField('"wind"')).toBe("tide");
  });
});

describe("pressField", () => {
  it("turns the pressed field on, and the one on off", () => {
    expect(pressField("none", "wind")).toBe("wind");
    expect(pressField("wind", "weather")).toBe("weather");
    expect(pressField("weather", "weather")).toBe("none");
    expect(pressField("none", "tide")).toBe("tide");
    expect(pressField("tide", "tide")).toBe("none");
  });
});

describe("the fields offered", () => {
  it("leaves Waves out until there are wave frames", () => {
    expect(offeredFields({ waves: false })).toEqual([
      "wind",
      "weather",
      "tide",
    ]);
    expect(offeredFields({ waves: true })).toEqual([
      "wind",
      "waves",
      "weather",
      "tide",
    ]);
  });

  it("draws a first visit's field for one not offered, and the rest as chosen", () => {
    const offered = offeredFields({ waves: false });
    expect(shownField("waves", offered)).toBe("tide");
    expect(shownField("tide", offered)).toBe("tide");
    expect(shownField("wind", offered)).toBe("wind");
    expect(shownField("none", offered)).toBe("none");
    expect(shownField("waves", offeredFields({ waves: true }))).toBe("waves");
  });
});

describe("windWith", () => {
  it("is the coloured wind under Wind alone, the particles as they were", () => {
    expect(windWith("wind", false)).toEqual({ wash: true, particles: false });
    expect(windWith("weather", true)).toEqual({ wash: false, particles: true });
    expect(windWith("none", true)).toEqual({ wash: false, particles: true });
    expect(windWith("tide", false)).toEqual({ wash: false, particles: false });
  });
});
