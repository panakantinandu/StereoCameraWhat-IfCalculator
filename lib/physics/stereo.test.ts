import { describe, expect, it } from "vitest";
import { disparityFromDistance, distanceForFramingWidth, distanceFromDisparity, isFiniteNumber } from "./stereo";

describe("physics/stereo - pure equations", () => {
  it("distanceForFramingWidth: a 90deg FOV (tan(45deg) = 1) halves the width", () => {
    expect(distanceForFramingWidth(400, 90)).toBeCloseTo(200, 6);
  });

  it("disparityFromDistance / distanceFromDisparity are inverses of the same Z = f*B/d relation", () => {
    const f = 500;
    const B = 100;
    const Z = 300;
    const d = disparityFromDistance(f, B, Z);
    expect(distanceFromDisparity(f, B, d)).toBeCloseTo(Z, 9);
  });

  it("disparity grows as distance shrinks (nearer objects have larger disparity)", () => {
    const near = disparityFromDistance(500, 100, 200);
    const far = disparityFromDistance(500, 100, 400);
    expect(near).toBeGreaterThan(far);
  });

  it("isFiniteNumber rejects NaN and +/-Infinity, accepts ordinary numbers", () => {
    expect(isFiniteNumber(42)).toBe(true);
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber(Infinity)).toBe(false);
    expect(isFiniteNumber(-Infinity)).toBe(false);
  });
});
