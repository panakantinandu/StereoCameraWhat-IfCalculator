import { describe, expect, it } from "vitest";
import { checkDepthAccuracy, isPresetConfigValid, pickRecommended, PRESETS } from "../engineering";
import { RESOLUTIONS } from "../cameraDatabase";
import type {
  CalculatorInputs,
  PresetConfig,
  PresetEvaluation,
  RawCalculatorInputs,
  ResolutionConfig,
} from "../types";
import { calculate, evaluatePreset, runCalculation, validateInputs } from "./index";

// ---------------------------------------------------------------------------
// Shared fixtures
//
// These numbers are deliberately simple (90 deg FOVs => tan(45deg) = 1, zero
// framing margin, 100% usable fraction) so the expected results can be hand
// verified against spec Sections 5-6 without a calculator, then cross-checked
// against the implementation below. They are test fixtures only, unrelated to
// the placeholder presets in lib/engineering/presets.ts.
// ---------------------------------------------------------------------------

const basePreset: PresetConfig = {
  name: "TestPresetA",
  priority: 1,
  framingMargin: 0,
  baselineMm: 100,
  maxHorizontalFovDeg: 90,
  maxVerticalFovDeg: 90,
  minNearDistanceMm: 0,
  maxNearDistanceMm: 1000,
  disparityUncertaintyPx: 1,
  safetyFactor: 2,
  maxDisparityRangePx: 1000,
  usableHorizontalFraction: 1,
  usableVerticalFraction: 1,
  pixelPitchUm: 3.45,
  active: true,
  formulaVersion: "test-v1",
};

const baseResolutions: ResolutionConfig[] = [
  { name: "Res-Small", horizontalPixels: 800, verticalPixels: 600, megapixels: 0.48, priority: 1, active: true },
  { name: "Res-Mid", horizontalPixels: 1100, verticalPixels: 700, megapixels: 0.77, priority: 2, active: true },
  { name: "Res-Large", horizontalPixels: 2000, verticalPixels: 1500, megapixels: 3.0, priority: 3, active: true },
];

// Hand-verified against the original single-accuracy spec: W_req=300, H_req=200,
// Z_h=200, Z_v=100, Z_near=200, Z_far=300, E_design=1.8, f_req=503,
// N_x_req=1006, N_y_req=503, d_near=251.5, d_far=167.667. Symmetric
// (accuracyPlus == accuracyMinus == 3.6) so f_req_plus == f_req_minus == 503,
// and E_safe_plus lands exactly on 3.6 (the old formula's E_safe, boundary
// case -- see the E_SAFE_EPSILON comment in lib/engineering/gates.ts) while
// E_safe_minus comes in comfortably under it (the asymmetry is inherent to the
// geometry, not a bug -- see the regression test below).
const basePassInputs: CalculatorInputs = {
  partLengthMm: 300,
  partWidthMm: 200,
  partDepthMm: 100,
  accuracyPlus: 3.6,
  accuracyMinus: 3.6,
};

describe("validateInputs", () => {
  const validRaw: RawCalculatorInputs = {
    partLengthMm: "300",
    partWidthMm: "200",
    partDepthMm: "100",
    accuracyPlusMm: "3.6",
    accuracyMinusMm: "3.6",
    maxWorkingDistanceMm: "",
  };

  it("accepts valid numeric strings", () => {
    const result = validateInputs(validRaw);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.inputs).toEqual({
        partLengthMm: 300,
        partWidthMm: 200,
        partDepthMm: 100,
        accuracyPlus: 3.6,
        accuracyMinus: 3.6,
        maxWorkingDistanceMm: undefined,
      });
    }
  });

  it("rejects a blank part length with ERR-01", () => {
    const result = validateInputs({ ...validRaw, partLengthMm: "" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fieldErrors).toContainEqual({
        field: "partLengthMm",
        code: "ERR-01",
        message: "Enter a valid positive part length.",
      });
    }
  });

  it("rejects a non-numeric part width (NaN) with ERR-02", () => {
    const result = validateInputs({ ...validRaw, partWidthMm: "abc" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fieldErrors).toContainEqual({
        field: "partWidthMm",
        code: "ERR-02",
        message: "Enter a valid positive part width.",
      });
    }
  });

  it("rejects an infinite accuracy (+) with ERR-04a", () => {
    const result = validateInputs({ ...validRaw, accuracyPlusMm: "Infinity" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fieldErrors).toContainEqual({
        field: "accuracyPlusMm",
        code: "ERR-04a",
        message: "Enter a valid positive required stereo depth accuracy (+).",
      });
    }
  });

  it("rejects a blank accuracy (-) with ERR-04b", () => {
    const result = validateInputs({ ...validRaw, accuracyMinusMm: "" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fieldErrors).toContainEqual({
        field: "accuracyMinusMm",
        code: "ERR-04b",
        message: "Enter a valid positive required stereo depth accuracy (-).",
      });
    }
  });

  it("rejects zero part length with ERR-01 (must be > 0)", () => {
    const result = validateInputs({ ...validRaw, partLengthMm: "0" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fieldErrors[0]).toMatchObject({ code: "ERR-01" });
    }
  });

  it("rejects negative part depth with ERR-03", () => {
    const result = validateInputs({ ...validRaw, partDepthMm: "-1" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fieldErrors).toContainEqual({
        field: "partDepthMm",
        code: "ERR-03",
        message: "Part depth cannot be negative.",
      });
    }
  });

  it("accepts a zero part depth (>= 0 is allowed)", () => {
    const result = validateInputs({ ...validRaw, partDepthMm: "0" });
    expect(result.valid).toBe(true);
  });

  it("collects errors for every invalid field at once", () => {
    const result = validateInputs({
      partLengthMm: "",
      partWidthMm: "-5",
      partDepthMm: "-1",
      accuracyPlusMm: "0",
      accuracyMinusMm: "",
      maxWorkingDistanceMm: "",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fieldErrors.map((e) => e.code)).toEqual(["ERR-01", "ERR-02", "ERR-03", "ERR-04a", "ERR-04b"]);
    }
  });

  it("leaves maxWorkingDistanceMm undefined when blank (it's optional)", () => {
    const result = validateInputs({ ...validRaw, maxWorkingDistanceMm: "" });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.inputs.maxWorkingDistanceMm).toBeUndefined();
    }
  });

  it("parses a valid maxWorkingDistanceMm when provided", () => {
    const result = validateInputs({ ...validRaw, maxWorkingDistanceMm: "500" });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.inputs.maxWorkingDistanceMm).toBe(500);
    }
  });

  it("rejects a negative maxWorkingDistanceMm with ERR-12", () => {
    const result = validateInputs({ ...validRaw, maxWorkingDistanceMm: "-5" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fieldErrors).toContainEqual({
        field: "maxWorkingDistanceMm",
        code: "ERR-12",
        message: "Enter a valid positive maximum working distance, or leave it blank.",
      });
    }
  });
});

describe("evaluatePreset - sample scenarios (spec Section 5-6 formula chain)", () => {
  it("PASS: base scenario clears every gate with the hand-verified numbers above", () => {
    const evaluation = evaluatePreset(basePassInputs, basePreset, baseResolutions);

    expect(evaluation.passed).toBe(true);
    expect(evaluation.computation.W_req).toBeCloseTo(300, 6);
    expect(evaluation.computation.H_req).toBeCloseTo(200, 6);
    expect(evaluation.computation.Z_near).toBeCloseTo(200, 6);
    expect(evaluation.computation.Z_far).toBeCloseTo(300, 6);
    expect(evaluation.computation.f_req).toBeCloseTo(503, 6);
    expect(evaluation.computation.N_x_req).toBe(1006);
    expect(evaluation.computation.N_y_req).toBe(503);
    expect(evaluation.computation.d_near).toBeCloseTo(251.5, 6);
    expect(evaluation.computation.E_safe_plus).toBeCloseTo(3.6, 6);
    expect(evaluation.computation.E_safe_minus).toBeLessThanOrEqual(3.6);
    // 1100x700 is the first listed resolution that meets 1006x503.
    expect(evaluation.selectedResolution?.name).toBe("Res-Mid");
  });

  it("resolution failure (ERR-06): no listed resolution is large enough", () => {
    const tinyResolutions: ResolutionConfig[] = [
      { name: "Tiny", horizontalPixels: 500, verticalPixels: 400, megapixels: 0.2, priority: 1, active: true },
    ];
    const evaluation = evaluatePreset(basePassInputs, basePreset, tinyResolutions);

    expect(evaluation.passed).toBe(false);
    expect(evaluation.errorCode).toBe("ERR-06");
    expect(evaluation.errorMessage).toBe(
      "No listed resolution meets the calculated horizontal and vertical pixel requirement."
    );
    // N_x_req/N_y_req were still computed before the resolution gate.
    expect(evaluation.computation.N_x_req).toBe(1006);
  });

  it("disparity-range failure (ERR-07): the near-to-far disparity SPAN exceeds the configured limit", () => {
    // d_near - d_far = 251.5 - 167.667 = 83.833 in the base scenario, so a
    // 50px range cap (well under that span, but well above either d_near or
    // d_far alone) forces the failure -- proving this is a span check, not an
    // absolute-value check re-introduced by accident.
    const tightRangePreset: PresetConfig = { ...basePreset, maxDisparityRangePx: 50 };
    const evaluation = evaluatePreset(basePassInputs, tightRangePreset, baseResolutions);

    expect(evaluation.passed).toBe(false);
    expect(evaluation.errorCode).toBe("ERR-07");
    expect(evaluation.errorMessage).toBe("Near disparity exceeds the configured stereo processing range.");
    expect(evaluation.computation.d_near).toBeCloseTo(251.5, 6);
    expect(evaluation.computation.d_far).toBeCloseTo(167.667, 3);
    expect(evaluation.computation.d_near! - evaluation.computation.d_far!).toBeCloseTo(83.833, 2);
  });

  it("disparity-range failure is a SPAN check: a high absolute d_near does not fail it alone", () => {
    // Same d_near (251.5) as the scenario above, but with a shallow enough
    // depth that d_near - d_far stays under a range cap that the old
    // absolute-value check (d_near > 100) would have failed outright.
    const shallowInputs: CalculatorInputs = { ...basePassInputs, partDepthMm: 1 };
    const preset: PresetConfig = { ...basePreset, maxDisparityRangePx: 100 };
    const evaluation = evaluatePreset(shallowInputs, preset, baseResolutions);

    expect(evaluation.computation.d_near!).toBeGreaterThan(100);
    expect(evaluation.errorCode).not.toBe("ERR-07");
  });

  it("working-distance failure (ERR-05): Z_near exceeds the machine's approved near limit", () => {
    const shortRangePreset: PresetConfig = { ...basePreset, maxNearDistanceMm: 50 };
    const evaluation = evaluatePreset(basePassInputs, shortRangePreset, baseResolutions);

    expect(evaluation.passed).toBe(false);
    expect(evaluation.errorCode).toBe("ERR-05");
    expect(evaluation.errorMessage).toBe("The required working distance exceeds the approved machine limit.");
    expect(evaluation.computation.Z_near).toBeCloseTo(200, 6);
    // Nothing past Z_near should have been computed.
    expect(evaluation.computation.f_req).toBeUndefined();
  });

  it("far-disparity guard (ERR-08) fails gracefully instead of dividing by zero", () => {
    // Astronomically loose accuracy on both sides (1e20mm) drives E_design so
    // large that Z_far + E_design underflows to exactly E_design at
    // double-precision, which in turn makes d_far round down to exactly
    // delta_d (1px). This is the floating-point edge the "guard before
    // dividing" instruction exists for: d_far - delta_d would otherwise be 0.
    const extremeInputs: CalculatorInputs = { ...basePassInputs, accuracyPlus: 1e20, accuracyMinus: 1e20 };
    const preset: PresetConfig = { ...basePreset, safetyFactor: 1 };

    const evaluation = evaluatePreset(extremeInputs, preset, baseResolutions);

    expect(evaluation.passed).toBe(false);
    expect(evaluation.errorCode).toBe("ERR-08");
    expect(evaluation.errorMessage).toBe("Far disparity is too small for the configured disparity uncertainty.");
    expect(Number.isFinite(evaluation.computation.d_far)).toBe(true);
    expect(evaluation.computation.Z_low).toBeUndefined();
    expect(evaluation.computation.E_safe_plus).toBeUndefined();
  });

  it("invalid preset config (ERR-10) fails gracefully instead of crashing on baseline = 0", () => {
    const brokenPreset: PresetConfig = { ...basePreset, baselineMm: 0 };
    expect(isPresetConfigValid(brokenPreset)).toBe(false);

    const evaluation = evaluatePreset(basePassInputs, brokenPreset, baseResolutions);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.errorCode).toBe("ERR-10");
    expect(evaluation.computation).toEqual({});
  });
});

describe("decimal input support (spec Section 2.3: 'Allow decimal values')", () => {
  // Regression coverage for a bug where all four/five numeric inputs were
  // being rejected/truncated. The root cause was the HTML <input type="number">
  // elements having no `step` attribute, which defaults to step="1" and marks
  // any decimal entry as validity.stepMismatch -- fixed by adding step="any"
  // to every numeric input in app/page.tsx. The parsing layer (parseNumber in
  // lib/recommendation/calculate.ts) already used Number(), never parseInt, and
  // there was no integer-only regex in validateInputs, and no rounding of
  // inputs anywhere in lib/physics or lib/engineering -- confirmed by direct
  // source inspection, and by the assertions below on intermediate computed
  // values (not just final PASS/FAIL, so a truncation bug would be caught even
  // if it happened not to flip the result).

  it("partLengthMm (300.75) flows unrounded into W_req", () => {
    const inputs: CalculatorInputs = { ...basePassInputs, partLengthMm: 300.75 };
    const evaluation = evaluatePreset(inputs, basePreset, baseResolutions);
    expect(evaluation.computation.W_req).toBeCloseTo(300.75, 9);
    expect(Number.isInteger(evaluation.computation.W_req)).toBe(false);
  });

  it("partWidthMm (200.25) flows unrounded into H_req", () => {
    const inputs: CalculatorInputs = { ...basePassInputs, partWidthMm: 200.25 };
    const evaluation = evaluatePreset(inputs, basePreset, baseResolutions);
    expect(evaluation.computation.H_req).toBeCloseTo(200.25, 9);
    expect(Number.isInteger(evaluation.computation.H_req)).toBe(false);
  });

  it("partDepthMm (1.2) flows unrounded into Z_far (via Z_near + depth)", () => {
    const inputs: CalculatorInputs = { ...basePassInputs, partDepthMm: 1.2 };
    const evaluation = evaluatePreset(inputs, basePreset, baseResolutions);
    // Compare the gap rather than the absolute Z_far, so this doesn't depend
    // on also hand-deriving Z_near for this scenario.
    expect(evaluation.computation.Z_far! - evaluation.computation.Z_near!).toBeCloseTo(1.2, 9);
  });

  it("accuracyPlus/accuracyMinus (0.05mm, Gary's smallest transcript example) flow unrounded into E_design", () => {
    const inputs: CalculatorInputs = { ...basePassInputs, accuracyPlus: 0.05, accuracyMinus: 0.05 };
    const evaluation = evaluatePreset(inputs, basePreset, baseResolutions);
    // basePreset.safetyFactor = 2, so E_design = 0.05 / 2 = 0.025 exactly.
    expect(evaluation.computation.E_design_plus).toBeCloseTo(0.025, 9);
    expect(evaluation.computation.E_design_minus).toBeCloseTo(0.025, 9);
    expect(Number.isInteger(evaluation.computation.E_design_plus)).toBe(false);
    // N_x_req/N_y_req must still come out as proper (if large) integers --
    // decimal input support must not disturb the spec-mandated ceil() on
    // resolution/pixel fields (cause #5, explicitly out of scope to change).
    expect(Number.isInteger(evaluation.computation.N_x_req)).toBe(true);
    expect(Number.isInteger(evaluation.computation.N_y_req)).toBe(true);
  });

  it("maxWorkingDistanceMm (850.5) parses to the exact decimal, not a truncated integer", () => {
    const raw: RawCalculatorInputs = {
      partLengthMm: "300",
      partWidthMm: "200",
      partDepthMm: "100",
      accuracyPlusMm: "3.6",
      accuracyMinusMm: "3.6",
      maxWorkingDistanceMm: "850.5",
    };
    const result = validateInputs(raw);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.inputs.maxWorkingDistanceMm).toBe(850.5);
    }
  });

  it("all four required inputs together as decimals, plus a 0.05mm accuracy, retain full precision end to end", () => {
    const raw: RawCalculatorInputs = {
      partLengthMm: "300.75",
      partWidthMm: "200.25",
      partDepthMm: "1.2",
      accuracyPlusMm: "0.05",
      accuracyMinusMm: "0.05",
      maxWorkingDistanceMm: "",
    };
    const result = calculate(raw, [basePreset], baseResolutions);
    const evaluation = result.evaluations[0]!;

    expect(evaluation.computation.W_req).toBeCloseTo(300.75, 9);
    expect(evaluation.computation.H_req).toBeCloseTo(200.25, 9);
    expect(evaluation.computation.Z_far! - evaluation.computation.Z_near!).toBeCloseTo(1.2, 9);
    expect(evaluation.computation.E_design_plus).toBeCloseTo(0.025, 9);
  });
});

describe("evaluatePreset - symmetric case matches the original single-accuracy formula", () => {
  it("is the regression check: accuracyPlus == accuracyMinus reproduces the old numbers exactly", () => {
    // These are the exact same numbers the PASS scenario above used back when
    // there was a single `requiredAccuracyMm` field, before the asymmetric
    // generalization. f_req/N_x_req/N_y_req/d_near/d_far are untouched by the
    // formula split (only the accuracy stage became two-sided), and the old
    // single E_safe corresponds to the new E_safe_plus: the original formula's
    // E_Z = max(|Z_low-Z_far|, |Z_high-Z_far|) always took the Z_low
    // (subtraction / "+") branch, since it's structurally always the larger of
    // the two -- see the E_SAFE_EPSILON comment in lib/engineering/gates.ts.
    const evaluation = evaluatePreset(basePassInputs, basePreset, baseResolutions);

    expect(evaluation.passed).toBe(true);
    expect(evaluation.computation.f_req_plus).toBe(evaluation.computation.f_req_minus);
    expect(evaluation.computation.f_req).toBeCloseTo(503, 6);
    expect(evaluation.computation.N_x_req).toBe(1006);
    expect(evaluation.computation.N_y_req).toBe(503);
    expect(evaluation.computation.d_near).toBeCloseTo(251.5, 6);
    expect(evaluation.computation.d_far).toBeCloseTo(167.667, 3);
    expect(evaluation.computation.E_safe_plus).toBeCloseTo(3.6, 6);
  });
});

describe("evaluatePreset - asymmetric accuracy: f_req = max(f_req_plus, f_req_minus)", () => {
  it("the (+) bound dominates when it is the stricter (smaller) target", () => {
    const inputs: CalculatorInputs = { ...basePassInputs, accuracyPlus: 1, accuracyMinus: 10 };
    const evaluation = evaluatePreset(inputs, basePreset, baseResolutions);

    expect(evaluation.computation.f_req_plus!).toBeGreaterThan(evaluation.computation.f_req_minus!);
    expect(evaluation.computation.f_req).toBe(evaluation.computation.f_req_plus);
  });

  it("the (-) bound dominates when it is the stricter (smaller) target", () => {
    const inputs: CalculatorInputs = { ...basePassInputs, accuracyPlus: 10, accuracyMinus: 1 };
    const evaluation = evaluatePreset(inputs, basePreset, baseResolutions);

    expect(evaluation.computation.f_req_minus!).toBeGreaterThan(evaluation.computation.f_req_plus!);
    expect(evaluation.computation.f_req).toBe(evaluation.computation.f_req_minus);
  });
});

describe("checkDepthAccuracy - ERR-09a / ERR-09b branch logic", () => {
  // The algebraic identity documented above E_SAFE_EPSILON in lib/engineering/gates.ts
  // means a *natural* evaluatePreset scenario where E_safe genuinely exceeds its own
  // target (beyond floating-point noise) essentially cannot occur once the
  // earlier gates (ERR-05..08) have passed -- whichever side drives f_req lands
  // almost exactly on its own target, and the other side always comes in
  // strictly under. So the ERR-09a/ERR-09b branches themselves are tested
  // directly against the extracted, exported checkDepthAccuracy helper (the same
  // function evaluatePreset calls internally) with synthetic values, the same
  // way the pickRecommended tie-break tiers are tested directly below.

  it("fails ERR-09a only when the (+) side exceeds its target but (-) does not", () => {
    const violations = checkDepthAccuracy(5, 1, 3, 3);
    expect(violations).toEqual([{ code: "ERR-09a", message: "The safety-adjusted theoretical depth error exceeds the requested accuracy (+)." }]);
  });

  it("fails ERR-09b only when the (-) side exceeds its target but (+) does not", () => {
    const violations = checkDepthAccuracy(1, 5, 3, 3);
    expect(violations).toEqual([{ code: "ERR-09b", message: "The safety-adjusted theoretical depth error exceeds the requested accuracy (-)." }]);
  });

  it("reports both codes, in order, when both sides fail at once", () => {
    const violations = checkDepthAccuracy(5, 5, 3, 3);
    expect(violations.map((v) => v.code)).toEqual(["ERR-09a", "ERR-09b"]);
  });

  it("passes (empty array) when both sides are within their own target", () => {
    expect(checkDepthAccuracy(2, 2, 3, 3)).toEqual([]);
  });
});

describe("evaluatePreset - monotonicity invariants", () => {
  it("tightening AccuracyPlus alone never reduces f_req", () => {
    // AccuracyMinus held loose (10mm) so it never becomes the driving side.
    const looser = evaluatePreset({ ...basePassInputs, accuracyPlus: 3.6, accuracyMinus: 10 }, basePreset, baseResolutions);
    const tighter = evaluatePreset({ ...basePassInputs, accuracyPlus: 1.8, accuracyMinus: 10 }, basePreset, baseResolutions);

    expect(tighter.computation.f_req!).toBeGreaterThanOrEqual(looser.computation.f_req!);
    expect(tighter.computation.N_x_req!).toBeGreaterThanOrEqual(looser.computation.N_x_req!);
    expect(tighter.computation.N_y_req!).toBeGreaterThanOrEqual(looser.computation.N_y_req!);
  });

  it("tightening AccuracyMinus alone never reduces f_req", () => {
    // AccuracyPlus held loose (10mm) so it never becomes the driving side.
    const looser = evaluatePreset({ ...basePassInputs, accuracyPlus: 10, accuracyMinus: 3.6 }, basePreset, baseResolutions);
    const tighter = evaluatePreset({ ...basePassInputs, accuracyPlus: 10, accuracyMinus: 1.8 }, basePreset, baseResolutions);

    expect(tighter.computation.f_req!).toBeGreaterThanOrEqual(looser.computation.f_req!);
    expect(tighter.computation.N_x_req!).toBeGreaterThanOrEqual(looser.computation.N_x_req!);
    expect(tighter.computation.N_y_req!).toBeGreaterThanOrEqual(looser.computation.N_y_req!);
  });

  it("higher disparity uncertainty (delta_d) never improves the result", () => {
    const lowUncertainty = evaluatePreset(
      basePassInputs,
      { ...basePreset, disparityUncertaintyPx: 0.5 },
      baseResolutions
    );
    const highUncertainty = evaluatePreset(
      basePassInputs,
      { ...basePreset, disparityUncertaintyPx: 2 },
      baseResolutions
    );

    expect(highUncertainty.computation.f_req!).toBeGreaterThanOrEqual(lowUncertainty.computation.f_req!);
    expect(highUncertainty.computation.N_x_req!).toBeGreaterThanOrEqual(lowUncertainty.computation.N_x_req!);
    expect(highUncertainty.computation.N_y_req!).toBeGreaterThanOrEqual(lowUncertainty.computation.N_y_req!);
    expect(highUncertainty.computation.d_near!).toBeGreaterThanOrEqual(lowUncertainty.computation.d_near!);
  });

  it("higher safety factor never improves the result", () => {
    const lowSafety = evaluatePreset(basePassInputs, { ...basePreset, safetyFactor: 1.5 }, baseResolutions);
    const highSafety = evaluatePreset(basePassInputs, { ...basePreset, safetyFactor: 3 }, baseResolutions);

    expect(highSafety.computation.f_req!).toBeGreaterThanOrEqual(lowSafety.computation.f_req!);
    expect(highSafety.computation.N_x_req!).toBeGreaterThanOrEqual(lowSafety.computation.N_x_req!);
    expect(highSafety.computation.N_y_req!).toBeGreaterThanOrEqual(lowSafety.computation.N_y_req!);
  });

  it("near disparity is always greater than far disparity whenever depth > 0", () => {
    const evaluation = evaluatePreset(basePassInputs, basePreset, baseResolutions);
    expect(basePassInputs.partDepthMm).toBeGreaterThan(0);
    expect(evaluation.computation.d_near!).toBeGreaterThan(evaluation.computation.d_far!);
  });

  it("selected resolution is never smaller than the computed N_x_req/N_y_req", () => {
    const scenarios = [
      evaluatePreset(basePassInputs, basePreset, baseResolutions),
      evaluatePreset({ ...basePassInputs, accuracyPlus: 1.8, accuracyMinus: 1.8 }, basePreset, baseResolutions),
      evaluatePreset({ ...basePassInputs, partDepthMm: 40 }, basePreset, baseResolutions),
    ];

    for (const evaluation of scenarios) {
      if (evaluation.passed) {
        expect(evaluation.selectedResolution!.horizontalPixels).toBeGreaterThanOrEqual(
          evaluation.computation.N_x_req!
        );
        expect(evaluation.selectedResolution!.verticalPixels).toBeGreaterThanOrEqual(evaluation.computation.N_y_req!);
      }
    }
  });

  it("PASS is impossible when either safety-adjusted error exceeds its own requested accuracy", () => {
    const scenarios = [
      { inputs: basePassInputs, preset: basePreset },
      { inputs: { ...basePassInputs, accuracyPlus: 1.8, accuracyMinus: 1.8 }, preset: basePreset },
      { inputs: basePassInputs, preset: { ...basePreset, disparityUncertaintyPx: 2 } },
      { inputs: basePassInputs, preset: { ...basePreset, safetyFactor: 3 } },
      { inputs: { ...basePassInputs, accuracyPlus: 1, accuracyMinus: 10 }, preset: basePreset },
      { inputs: { ...basePassInputs, accuracyPlus: 10, accuracyMinus: 1 }, preset: basePreset },
    ];

    for (const { inputs, preset } of scenarios) {
      const evaluation = evaluatePreset(inputs, preset, baseResolutions);
      if (evaluation.passed) {
        expect(evaluation.computation.E_safe_plus!).toBeLessThanOrEqual(inputs.accuracyPlus + 1e-6);
        expect(evaluation.computation.E_safe_minus!).toBeLessThanOrEqual(inputs.accuracyMinus + 1e-6);
      } else if (evaluation.errorCode === "ERR-09a" || evaluation.errorCode === "ERR-09b") {
        const violatesPlus = evaluation.computation.E_safe_plus! > inputs.accuracyPlus;
        const violatesMinus = evaluation.computation.E_safe_minus! > inputs.accuracyMinus;
        expect(violatesPlus || violatesMinus).toBe(true);
      }
    }
  });
});

describe("evaluatePreset - optional maximum working distance (advanced input)", () => {
  it("adds an additional ceiling on top of the preset's own maxNearDistanceMm", () => {
    // Base scenario's Z_near = 200mm, well inside the preset's own 1000mm limit.
    // A user-supplied 150mm ceiling should fail it even though the preset's own
    // limit alone would have allowed it.
    const constrained: CalculatorInputs = { ...basePassInputs, maxWorkingDistanceMm: 150 };
    const evaluation = evaluatePreset(constrained, basePreset, baseResolutions);

    expect(evaluation.passed).toBe(false);
    expect(evaluation.errorCode).toBe("ERR-05");
    expect(evaluation.computation.Z_near).toBeCloseTo(200, 6);
  });

  it("never loosens the preset's own maxNearDistanceMm (min, not replace)", () => {
    // A generous 5000mm user ceiling should have zero effect versus the
    // preset's own (tighter) 1000mm limit -- same PASS as the unconstrained case.
    const loose: CalculatorInputs = { ...basePassInputs, maxWorkingDistanceMm: 5000 };
    const unconstrained = evaluatePreset(basePassInputs, basePreset, baseResolutions);
    const withLooseCeiling = evaluatePreset(loose, basePreset, baseResolutions);

    expect(withLooseCeiling.passed).toBe(unconstrained.passed);
    expect(withLooseCeiling.computation.Z_near).toBe(unconstrained.computation.Z_near);
  });

  it("leaving it undefined is identical to not having the feature at all", () => {
    const withUndefined = evaluatePreset({ ...basePassInputs, maxWorkingDistanceMm: undefined }, basePreset, baseResolutions);
    const withoutField = evaluatePreset(basePassInputs, basePreset, baseResolutions);
    expect(JSON.stringify(withUndefined)).toBe(JSON.stringify(withoutField));
  });
});

describe("runCalculation - optional maximum working distance surfaces a specific message", () => {
  it("reports the next-shortest achievable distance when the ceiling is the sole blocker", () => {
    // TestPresetA's Z_near for the base scenario is 200mm; a 150mm user ceiling
    // blocks it even though everything else about the request is achievable.
    const constrained: CalculatorInputs = { ...basePassInputs, maxWorkingDistanceMm: 150 };
    const result = runCalculation(constrained, [basePreset], baseResolutions);

    expect(result.status).toBe("NO VALID CONFIGURATION");
    expect(result.errorMessage).toBe(
      "No preset fits within the specified maximum working distance; the next-shortest achievable distance is 200 mm with the TestPresetA setup."
    );
  });

  it("falls back to the generic ERR-11 message when the part wouldn't work even without the ceiling", () => {
    // A resolution list too small for the request fails ERR-06 regardless of
    // any working-distance ceiling -- the specific message would be misleading
    // here ("more room" would not fix a resolution shortfall).
    const tinyResolutions: ResolutionConfig[] = [
      { name: "Tiny", horizontalPixels: 10, verticalPixels: 10, megapixels: 0.0001, priority: 1, active: true },
    ];
    const constrained: CalculatorInputs = { ...basePassInputs, maxWorkingDistanceMm: 150 };
    const result = runCalculation(constrained, [basePreset], tinyResolutions);

    expect(result.status).toBe("NO VALID CONFIGURATION");
    expect(result.errorMessage).toBe("No approved internal preset passes this request.");
  });

  it("does not affect the generic message when no ceiling was requested", () => {
    const tinyResolutions: ResolutionConfig[] = [
      { name: "Tiny", horizontalPixels: 10, verticalPixels: 10, megapixels: 0.0001, priority: 1, active: true },
    ];
    const result = runCalculation(basePassInputs, [basePreset], tinyResolutions);

    expect(result.errorMessage).toBe("No approved internal preset passes this request.");
  });
});

describe("real placeholder config (lib/engineering/presets.ts + lib/cameraDatabase) - known reference case", () => {
  it("250x150x200mm @ 1mm accuracy: Long Baseline passes on the disparity-range fix, Compact/Standard fail ERR-07", () => {
    // Regression check for the real product config (not the basePreset test
    // fixture): confirms the disparity-RANGE fix (d_near - d_far vs
    // maxDisparityRangePx) behaves as verified by hand before the folder
    // reorganization -- same numbers, moved code.
    const raw: RawCalculatorInputs = {
      partLengthMm: "250",
      partWidthMm: "150",
      partDepthMm: "200",
      accuracyPlusMm: "1",
      accuracyMinusMm: "1",
      maxWorkingDistanceMm: "",
    };
    const result = calculate(raw, PRESETS, RESOLUTIONS);

    expect(result.status).toBe("PASS");
    expect(result.recommended?.presetName).toBe("Long Baseline");

    const byName = Object.fromEntries(result.evaluations.map((e) => [e.presetName, e]));
    expect(byName["Compact"]?.errorCode).toBe("ERR-07");
    expect(byName["Standard"]?.errorCode).toBe("ERR-07");
    expect(byName["Long Baseline"]?.passed).toBe(true);
  });
});

describe("determinism", () => {
  it("produces identical output for identical inputs and config, every time", () => {
    const raw: RawCalculatorInputs = {
      partLengthMm: "300",
      partWidthMm: "200",
      partDepthMm: "100",
      accuracyPlusMm: "3.6",
      accuracyMinusMm: "3.6",
      maxWorkingDistanceMm: "",
    };
    const presets = [basePreset];

    const first = calculate(raw, presets, baseResolutions);
    const second = calculate(raw, presets, baseResolutions);
    const third = calculate(raw, presets, baseResolutions);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(second)).toBe(JSON.stringify(third));
  });
});

describe("runCalculation - overall status and tie-break", () => {
  it("NO VALID CONFIGURATION (ERR-11) when every active preset fails", () => {
    const tinyResolutions: ResolutionConfig[] = [
      { name: "Tiny", horizontalPixels: 10, verticalPixels: 10, megapixels: 0.0001, priority: 1, active: true },
    ];
    const result = runCalculation(basePassInputs, [basePreset], tinyResolutions);

    expect(result.status).toBe("NO VALID CONFIGURATION");
    expect(result.errorCode).toBe("ERR-11");
    expect(result.recommended).toBeUndefined();
    expect(result.evaluations).toHaveLength(1);
    expect(result.evaluations[0]!.errorCode).toBe("ERR-06");
  });

  it("recommends the lower-priority-number preset when a higher-priority one fails", () => {
    const failingHighPriority: PresetConfig = { ...basePreset, name: "Fails", priority: 1, maxNearDistanceMm: 50 };
    const passingLowerPriority: PresetConfig = { ...basePreset, name: "Passes", priority: 2 };

    const result = runCalculation(basePassInputs, [failingHighPriority, passingLowerPriority], baseResolutions);

    expect(result.status).toBe("PASS");
    expect(result.recommended?.presetName).toBe("Passes");
  });

  // pickRecommended's four tie-break tiers are tested directly against synthetic
  // PresetEvaluation fixtures rather than through the full formula chain: baseline
  // feeds into f_req (and therefore the required resolution) directly, so in
  // practice changing only baselineMm on an otherwise-identical preset changes
  // which resolution it needs long before the "smaller baseline" tier is ever
  // reached -- there's no physically-consistent scenario that isolates just one
  // tier via evaluatePreset. Testing pickRecommended directly is more precise.
  function makeEvaluation(
    presetName: string,
    priority: number,
    megapixels: number,
    zNear: number,
    baselineMm: number
  ): PresetEvaluation {
    return {
      presetName,
      priority,
      baselineMm,
      formulaVersion: "test-v1",
      passed: true,
      computation: { Z_near: zNear },
      selectedResolution: {
        name: `${presetName}-res`,
        horizontalPixels: 100,
        verticalPixels: 100,
        megapixels,
        priority: 1,
        active: true,
      },
    };
  }

  it("tie-break tier 1: prefers the lower priority number", () => {
    const evaluations = [makeEvaluation("A", 2, 1, 100, 100), makeEvaluation("B", 1, 5, 200, 200)];
    expect(pickRecommended(evaluations).presetName).toBe("B");
  });

  it("tie-break tier 2: falls back to smaller listed resolution (MP) when priority ties", () => {
    const evaluations = [makeEvaluation("A", 1, 2, 100, 100), makeEvaluation("B", 1, 1, 200, 200)];
    expect(pickRecommended(evaluations).presetName).toBe("B");
  });

  it("tie-break tier 3: falls back to shorter working distance when priority and MP tie", () => {
    const evaluations = [makeEvaluation("A", 1, 1, 200, 100), makeEvaluation("B", 1, 1, 100, 200)];
    expect(pickRecommended(evaluations).presetName).toBe("B");
  });

  it("tie-break tier 4: falls back to smaller baseline when priority, MP, and Z_near all tie", () => {
    const evaluations = [makeEvaluation("A", 1, 1, 100, 200), makeEvaluation("B", 1, 1, 100, 50)];
    expect(pickRecommended(evaluations).presetName).toBe("B");
  });

  it("top-level calculate() surfaces input validation failures as status FAIL", () => {
    const result = calculate(
      {
        partLengthMm: "",
        partWidthMm: "200",
        partDepthMm: "100",
        accuracyPlusMm: "3.6",
        accuracyMinusMm: "3.6",
        maxWorkingDistanceMm: "",
      },
      [basePreset],
      baseResolutions
    );

    expect(result.status).toBe("FAIL");
    expect(result.errorCode).toBe("ERR-01");
    expect(result.evaluations).toHaveLength(0);
  });
});
