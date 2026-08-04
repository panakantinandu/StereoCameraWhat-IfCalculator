import { describe, expect, it } from "vitest";
import {
  calculate,
  evaluatePreset,
  isPresetConfigValid,
  pickRecommended,
  runCalculation,
  validateInputs,
} from "./calculator";
import type {
  CalculatorInputs,
  PresetConfig,
  PresetEvaluation,
  RawCalculatorInputs,
  ResolutionConfig,
} from "./types";

// ---------------------------------------------------------------------------
// Shared fixtures
//
// These numbers are deliberately simple (90 deg FOVs => tan(45deg) = 1, zero
// framing margin, 100% usable fraction) so the expected results can be hand
// verified against spec Sections 5-6 without a calculator, then cross-checked
// against the implementation below. They are test fixtures only, unrelated to
// the placeholder presets in lib/settings.ts.
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
  maxSupportedDisparityPx: 1000,
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

// Hand-verified: W_req=300, H_req=200, Z_h=200, Z_v=100, Z_near=200,
// Z_far=300, E_design=1.8, f_req=503, N_x_req=1006, N_y_req=503,
// d_near=251.5, d_far=167.667, E_safe=3.6 (== requiredAccuracyMm, the
// boundary case -- see E_SAFE_EPSILON comment in calculator.ts).
const basePassInputs: CalculatorInputs = {
  partLengthMm: 300,
  partWidthMm: 200,
  partDepthMm: 100,
  requiredAccuracyMm: 3.6,
};

describe("validateInputs", () => {
  const validRaw: RawCalculatorInputs = {
    partLengthMm: "300",
    partWidthMm: "200",
    partDepthMm: "100",
    requiredAccuracyMm: "3.6",
  };

  it("accepts valid numeric strings", () => {
    const result = validateInputs(validRaw);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.inputs).toEqual({
        partLengthMm: 300,
        partWidthMm: 200,
        partDepthMm: 100,
        requiredAccuracyMm: 3.6,
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

  it("rejects an infinite required accuracy with ERR-04", () => {
    const result = validateInputs({ ...validRaw, requiredAccuracyMm: "Infinity" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fieldErrors).toContainEqual({
        field: "requiredAccuracyMm",
        code: "ERR-04",
        message: "Enter a valid positive required stereo depth accuracy.",
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
      requiredAccuracyMm: "0",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fieldErrors.map((e) => e.code)).toEqual(["ERR-01", "ERR-02", "ERR-03", "ERR-04"]);
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
    expect(evaluation.computation.E_safe).toBeCloseTo(3.6, 6);
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

  it("disparity-range failure (ERR-07): near disparity exceeds the configured limit", () => {
    const tightDisparityPreset: PresetConfig = { ...basePreset, maxSupportedDisparityPx: 100 };
    const evaluation = evaluatePreset(basePassInputs, tightDisparityPreset, baseResolutions);

    expect(evaluation.passed).toBe(false);
    expect(evaluation.errorCode).toBe("ERR-07");
    expect(evaluation.errorMessage).toBe("Near disparity exceeds the configured stereo processing range.");
    // d_near (251.5) was computed and did exceed the 100px limit.
    expect(evaluation.computation.d_near).toBeCloseTo(251.5, 6);
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
    // An astronomically loose accuracy (1e20mm) drives E_design so large that
    // Z_far + E_design underflows to exactly E_design at double-precision,
    // which in turn makes d_far round down to exactly delta_d (1px). This is
    // the floating-point edge the "guard before dividing" instruction exists
    // for: d_far - delta_d would otherwise be 0.
    const extremeInputs: CalculatorInputs = { ...basePassInputs, requiredAccuracyMm: 1e20 };
    const preset: PresetConfig = { ...basePreset, safetyFactor: 1 };

    const evaluation = evaluatePreset(extremeInputs, preset, baseResolutions);

    expect(evaluation.passed).toBe(false);
    expect(evaluation.errorCode).toBe("ERR-08");
    expect(evaluation.errorMessage).toBe("Far disparity is too small for the configured disparity uncertainty.");
    expect(Number.isFinite(evaluation.computation.d_far)).toBe(true);
    expect(evaluation.computation.Z_low).toBeUndefined();
    expect(evaluation.computation.E_safe).toBeUndefined();
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

describe("evaluatePreset - monotonicity invariants", () => {
  it("tighter (smaller) required accuracy never reduces required focal length or pixels", () => {
    const looser = evaluatePreset({ ...basePassInputs, requiredAccuracyMm: 3.6 }, basePreset, baseResolutions);
    const tighter = evaluatePreset({ ...basePassInputs, requiredAccuracyMm: 1.8 }, basePreset, baseResolutions);

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
      evaluatePreset({ ...basePassInputs, requiredAccuracyMm: 1.8 }, basePreset, baseResolutions),
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

  it("PASS is impossible when the safety-adjusted error exceeds the requested accuracy", () => {
    const scenarios = [
      evaluatePreset(basePassInputs, basePreset, baseResolutions),
      evaluatePreset({ ...basePassInputs, requiredAccuracyMm: 1.8 }, basePreset, baseResolutions),
      evaluatePreset(basePassInputs, { ...basePreset, disparityUncertaintyPx: 2 }, baseResolutions),
      evaluatePreset(basePassInputs, { ...basePreset, safetyFactor: 3 }, baseResolutions),
    ];

    for (const evaluation of scenarios) {
      if (evaluation.passed) {
        expect(evaluation.computation.E_safe!).toBeLessThanOrEqual(basePassInputs.requiredAccuracyMm + 1e-6);
      } else if (evaluation.errorCode === "ERR-09") {
        expect(evaluation.computation.E_safe!).toBeGreaterThan(basePassInputs.requiredAccuracyMm);
      }
    }
  });
});

describe("determinism", () => {
  it("produces identical output for identical inputs and config, every time", () => {
    const raw: RawCalculatorInputs = {
      partLengthMm: "300",
      partWidthMm: "200",
      partDepthMm: "100",
      requiredAccuracyMm: "3.6",
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
      { partLengthMm: "", partWidthMm: "200", partDepthMm: "100", requiredAccuracyMm: "3.6" },
      [basePreset],
      baseResolutions
    );

    expect(result.status).toBe("FAIL");
    expect(result.errorCode).toBe("ERR-01");
    expect(result.evaluations).toHaveLength(0);
  });
});
