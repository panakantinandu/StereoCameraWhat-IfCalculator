// Pure calculation module for the Stereo Camera What-If Calculator.
// No side effects, no randomness, no dates, no I/O: same inputs + same preset
// config + same resolution list always produce the same output.
//
// Formula chain and variable names follow spec Sections 5-6 exactly so this
// module can be audited line-by-line against the requirements doc.

import type {
  CalculationResult,
  CalculatorInputs,
  ErrorCode,
  FieldError,
  PresetComputation,
  PresetConfig,
  PresetEvaluation,
  RawCalculatorInputs,
  ResolutionConfig,
} from "./types";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  "ERR-01": "Enter a valid positive part length.",
  "ERR-02": "Enter a valid positive part width.",
  "ERR-03": "Part depth cannot be negative.",
  "ERR-04a": "Enter a valid positive required stereo depth accuracy (+).",
  "ERR-04b": "Enter a valid positive required stereo depth accuracy (-).",
  "ERR-05": "The required working distance exceeds the approved machine limit.",
  "ERR-06": "No listed resolution meets the calculated horizontal and vertical pixel requirement.",
  "ERR-07": "Near disparity exceeds the configured stereo processing range.",
  "ERR-08": "Far disparity is too small for the configured disparity uncertainty.",
  "ERR-09a": "The safety-adjusted theoretical depth error exceeds the requested accuracy (+).",
  "ERR-09b": "The safety-adjusted theoretical depth error exceeds the requested accuracy (-).",
  "ERR-10": "The selected engineering preset is incomplete or invalid.",
  "ERR-11": "No approved internal preset passes this request.",
};

function isFiniteNumber(x: number): boolean {
  return typeof x === "number" && Number.isFinite(x);
}

/** Parses a raw form string into a number. Blank, non-numeric, and "Infinity"-style
 * strings all come back as NaN or +/-Infinity, which the *Valid* helpers below reject. */
function parseNumber(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return NaN;
  return Number(trimmed);
}

function isValidPositive(n: number): boolean {
  return isFiniteNumber(n) && n > 0;
}

function isValidNonNegative(n: number): boolean {
  return isFiniteNumber(n) && n >= 0;
}

/** Validates the five user-editable inputs (part length/width/depth, plus the two
 * accuracy magnitudes). Blank, NaN, and infinite values are all rejected with the
 * same field message per the ERR table (the spec does not define distinct wording
 * per failure mode). accuracyPlus/accuracyMinus are always positive magnitudes --
 * the UI is responsible for mirroring one value into both when "symmetric" is on. */
export function validateInputs(
  raw: RawCalculatorInputs
): { valid: true; inputs: CalculatorInputs } | { valid: false; fieldErrors: FieldError[] } {
  const fieldErrors: FieldError[] = [];

  const partLengthMm = parseNumber(raw.partLengthMm);
  if (!isValidPositive(partLengthMm)) {
    fieldErrors.push({ field: "partLengthMm", code: "ERR-01", message: ERROR_MESSAGES["ERR-01"] });
  }

  const partWidthMm = parseNumber(raw.partWidthMm);
  if (!isValidPositive(partWidthMm)) {
    fieldErrors.push({ field: "partWidthMm", code: "ERR-02", message: ERROR_MESSAGES["ERR-02"] });
  }

  const partDepthMm = parseNumber(raw.partDepthMm);
  if (!isValidNonNegative(partDepthMm)) {
    fieldErrors.push({ field: "partDepthMm", code: "ERR-03", message: ERROR_MESSAGES["ERR-03"] });
  }

  const accuracyPlus = parseNumber(raw.accuracyPlusMm);
  if (!isValidPositive(accuracyPlus)) {
    fieldErrors.push({ field: "accuracyPlusMm", code: "ERR-04a", message: ERROR_MESSAGES["ERR-04a"] });
  }

  const accuracyMinus = parseNumber(raw.accuracyMinusMm);
  if (!isValidPositive(accuracyMinus)) {
    fieldErrors.push({ field: "accuracyMinusMm", code: "ERR-04b", message: ERROR_MESSAGES["ERR-04b"] });
  }

  if (fieldErrors.length > 0) {
    return { valid: false, fieldErrors };
  }

  return { valid: true, inputs: { partLengthMm, partWidthMm, partDepthMm, accuracyPlus, accuracyMinus } };
}

/** Config-validity gate (ERR-10): every required preset field must be present and
 * within a physically sane range before the formula chain runs at all. */
export function isPresetConfigValid(preset: PresetConfig): boolean {
  const finitePositive = (x: number) => isFiniteNumber(x) && x > 0;
  const finiteNonNegative = (x: number) => isFiniteNumber(x) && x >= 0;
  const fovInRange = (deg: number) => isFiniteNumber(deg) && deg > 0 && deg < 180;
  const fractionInRange = (x: number) => isFiniteNumber(x) && x > 0 && x <= 1;

  if (!isFiniteNumber(preset.priority)) return false;
  if (!finiteNonNegative(preset.framingMargin)) return false;
  if (!finitePositive(preset.baselineMm)) return false;
  if (!fovInRange(preset.maxHorizontalFovDeg)) return false;
  if (!fovInRange(preset.maxVerticalFovDeg)) return false;
  if (!finiteNonNegative(preset.minNearDistanceMm)) return false;
  if (!isFiniteNumber(preset.maxNearDistanceMm) || preset.maxNearDistanceMm <= preset.minNearDistanceMm) return false;
  if (!finitePositive(preset.disparityUncertaintyPx)) return false;
  if (!isFiniteNumber(preset.safetyFactor) || preset.safetyFactor < 1) return false;
  if (!finitePositive(preset.maxSupportedDisparityPx)) return false;
  if (!fractionInRange(preset.usableHorizontalFraction)) return false;
  if (!fractionInRange(preset.usableVerticalFraction)) return false;
  if (preset.pixelPitchUm !== undefined && !finitePositive(preset.pixelPitchUm)) return false;
  if (typeof preset.active !== "boolean") return false;
  if (!preset.formulaVersion || preset.formulaVersion.trim() === "") return false;

  return true;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Resolution selection: first active entry (in priority order) whose pixel counts
 * meet or exceed the requirement wins. Never selects by megapixels alone. */
export function selectResolution(
  resolutions: ResolutionConfig[],
  nxReq: number,
  nyReq: number
): ResolutionConfig | undefined {
  return resolutions
    .filter((r) => r.active && r.horizontalPixels > 0 && r.verticalPixels > 0)
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .find((r) => r.horizontalPixels >= nxReq && r.verticalPixels >= nyReq);
}

// f_req is derived from whichever accuracy bound is stricter (f_req = max(f_req_plus,
// f_req_minus)), and Z_low/Z_high are then computed once from that shared f_req. By
// algebraic identity this means the side that drove f_req always lands its E_safe
// almost exactly on its own accuracy target (up to floating-point representation
// error), while the other side comes in strictly under its target with real margin.
// So in practice ERR-09a/ERR-09b are unreachable except at that one boundary, for
// whichever side is driving -- this epsilon absorbs that representation error
// without weakening the checks the spec calls for.
const E_SAFE_EPSILON = 1e-9;

function fails(a: number, b: number): boolean {
  return a - b > E_SAFE_EPSILON * Math.max(1, Math.abs(b));
}

/** The two-sided depth-accuracy pass check (ERR-09a / ERR-09b), extracted as a small
 * pure function so it can be exercised directly with synthetic values in tests --
 * the algebraic identity above means a *natural* end-to-end scenario where either
 * side genuinely exceeds its own target essentially cannot occur once the earlier
 * gates (ERR-05..08) have passed, so this is the only reliable seam for testing the
 * failure branches themselves. Returns one entry per violated side, in ERR-09a,
 * ERR-09b order; empty when both sides pass. */
export function checkDepthAccuracy(
  E_safe_plus: number,
  E_safe_minus: number,
  accuracyPlus: number,
  accuracyMinus: number
): { code: ErrorCode; message: string }[] {
  const violations: { code: ErrorCode; message: string }[] = [];
  if (fails(E_safe_plus, accuracyPlus)) {
    violations.push({ code: "ERR-09a", message: ERROR_MESSAGES["ERR-09a"] });
  }
  if (fails(E_safe_minus, accuracyMinus)) {
    violations.push({ code: "ERR-09b", message: ERROR_MESSAGES["ERR-09b"] });
  }
  return violations;
}

/** Evaluates one preset against the given inputs, following spec Sections 5-6
 * exactly. Returns as soon as a pass condition fails, with every value computed
 * up to that point preserved for the technical-details view. */
export function evaluatePreset(
  inputs: CalculatorInputs,
  preset: PresetConfig,
  resolutions: ResolutionConfig[]
): PresetEvaluation {
  const base = {
    presetName: preset.name,
    priority: preset.priority,
    baselineMm: preset.baselineMm,
    formulaVersion: preset.formulaVersion,
  };
  const computation: PresetComputation = {};

  const fail = (errorCode: ErrorCode, selectedResolution?: ResolutionConfig): PresetEvaluation => ({
    ...base,
    passed: false,
    errorCode,
    errorMessage: ERROR_MESSAGES[errorCode],
    errorCodes: [errorCode],
    computation,
    selectedResolution,
  });

  const failMulti = (
    violations: { code: ErrorCode; message: string }[],
    selectedResolution?: ResolutionConfig
  ): PresetEvaluation => ({
    ...base,
    passed: false,
    errorCode: violations[0]?.code,
    errorMessage: violations.map((v) => v.message).join(" "),
    errorCodes: violations.map((v) => v.code),
    computation,
    selectedResolution,
  });

  if (!isPresetConfigValid(preset)) {
    return fail("ERR-10");
  }

  const B = preset.baselineMm;
  const W_req = inputs.partLengthMm * (1 + preset.framingMargin);
  const H_req = inputs.partWidthMm * (1 + preset.framingMargin);
  computation.W_req = W_req;
  computation.H_req = H_req;

  const Z_h = (W_req + B) / (2 * Math.tan(degToRad(preset.maxHorizontalFovDeg) / 2));
  const Z_v = H_req / (2 * Math.tan(degToRad(preset.maxVerticalFovDeg) / 2));
  computation.Z_h = Z_h;
  computation.Z_v = Z_v;

  if (!isFiniteNumber(Z_h) || !isFiniteNumber(Z_v)) {
    return fail("ERR-10");
  }

  const Z_near = Math.max(preset.minNearDistanceMm, Z_h, Z_v);
  computation.Z_near = Z_near;

  if (Z_near > preset.maxNearDistanceMm) {
    return fail("ERR-05");
  }

  const Z_center = Z_near + inputs.partDepthMm / 2;
  const Z_far = Z_near + inputs.partDepthMm;
  const E_design_plus = inputs.accuracyPlus / preset.safetyFactor;
  const E_design_minus = inputs.accuracyMinus / preset.safetyFactor;
  computation.Z_center = Z_center;
  computation.Z_far = Z_far;
  computation.E_design_plus = E_design_plus;
  computation.E_design_minus = E_design_minus;

  const f_req_plus = (preset.disparityUncertaintyPx * Z_far * (Z_far + E_design_plus)) / (B * E_design_plus);
  const f_req_minus = (preset.disparityUncertaintyPx * Z_far * (Z_far + E_design_minus)) / (B * E_design_minus);
  const f_req = Math.max(f_req_plus, f_req_minus);
  computation.f_req_plus = f_req_plus;
  computation.f_req_minus = f_req_minus;
  computation.f_req = f_req;

  if (!isFiniteNumber(f_req) || f_req <= 0) {
    return fail("ERR-10");
  }

  const N_x_req = Math.ceil((f_req * (W_req + B)) / (Z_near * preset.usableHorizontalFraction));
  const N_y_req = Math.ceil((f_req * H_req) / (Z_near * preset.usableVerticalFraction));
  const d_near = (f_req * B) / Z_near;
  const d_far = (f_req * B) / Z_far;
  computation.N_x_req = N_x_req;
  computation.N_y_req = N_y_req;
  computation.d_near = d_near;
  computation.d_far = d_far;

  if (!isFiniteNumber(N_x_req) || !isFiniteNumber(N_y_req) || !isFiniteNumber(d_near) || !isFiniteNumber(d_far)) {
    return fail("ERR-10");
  }

  const selectedResolution = selectResolution(resolutions, N_x_req, N_y_req);
  if (!selectedResolution) {
    return fail("ERR-06");
  }

  if (d_near > preset.maxSupportedDisparityPx) {
    return fail("ERR-07", selectedResolution);
  }

  // Guard before dividing by (d_far - delta_d) / (d_far + delta_d) below.
  if (d_far <= preset.disparityUncertaintyPx) {
    return fail("ERR-08", selectedResolution);
  }

  const Z_low = (f_req * B) / (d_far - preset.disparityUncertaintyPx);
  const Z_high = (f_req * B) / (d_far + preset.disparityUncertaintyPx);
  const E_Z_plus = Z_low - Z_far;
  const E_Z_minus = Z_far - Z_high;
  const E_safe_plus = preset.safetyFactor * E_Z_plus;
  const E_safe_minus = preset.safetyFactor * E_Z_minus;
  computation.Z_low = Z_low;
  computation.Z_high = Z_high;
  computation.E_Z_plus = E_Z_plus;
  computation.E_Z_minus = E_Z_minus;
  computation.E_safe_plus = E_safe_plus;
  computation.E_safe_minus = E_safe_minus;

  if (preset.pixelPitchUm !== undefined) {
    computation.f_mm = (f_req * preset.pixelPitchUm) / 1000;
  }

  if (!isFiniteNumber(E_safe_plus) || !isFiniteNumber(E_safe_minus)) {
    return fail("ERR-10", selectedResolution);
  }

  const violations = checkDepthAccuracy(E_safe_plus, E_safe_minus, inputs.accuracyPlus, inputs.accuracyMinus);
  if (violations.length > 0) {
    return failMulti(violations, selectedResolution);
  }

  return { ...base, passed: true, computation, selectedResolution };
}

/** Preferred-answer tie-break, in order: preset priority, then smaller listed
 * resolution (MP), then shorter working distance, then smaller baseline.
 * "Working distance" is taken as Z_near (the near working-distance limit already
 * checked against the preset's configured machine envelope), since the spec does
 * not otherwise define the term. */
export function pickRecommended(passed: PresetEvaluation[]): PresetEvaluation {
  const sorted = passed.slice().sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;

    const mpA = a.selectedResolution?.megapixels ?? Infinity;
    const mpB = b.selectedResolution?.megapixels ?? Infinity;
    if (mpA !== mpB) return mpA - mpB;

    const zA = a.computation.Z_near ?? Infinity;
    const zB = b.computation.Z_near ?? Infinity;
    if (zA !== zB) return zA - zB;

    return a.baselineMm - b.baselineMm;
  });
  // Safe: caller only invokes this with a non-empty array.
  return sorted[0] as PresetEvaluation;
}

/** Evaluates every active preset (in priority order) against already-validated
 * inputs and determines the overall PASS / NO VALID CONFIGURATION result. */
export function runCalculation(
  inputs: CalculatorInputs,
  presets: PresetConfig[],
  resolutions: ResolutionConfig[]
): CalculationResult {
  const evaluations = presets
    .filter((p) => p.active)
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((p) => evaluatePreset(inputs, p, resolutions));

  const passed = evaluations.filter((e) => e.passed);

  if (passed.length === 0) {
    return {
      status: "NO VALID CONFIGURATION",
      evaluations,
      errorCode: "ERR-11",
      errorMessage: ERROR_MESSAGES["ERR-11"],
    };
  }

  return { status: "PASS", recommended: pickRecommended(passed), evaluations };
}

/** Top-level entry point used by the UI: validates raw form strings, then runs
 * the calculation. Pure and deterministic — same raw inputs + same config always
 * produce the same result. */
export function calculate(
  raw: RawCalculatorInputs,
  presets: PresetConfig[],
  resolutions: ResolutionConfig[]
): CalculationResult {
  const validation = validateInputs(raw);
  if (!validation.valid) {
    const first = validation.fieldErrors[0];
    return {
      status: "FAIL",
      evaluations: [],
      fieldErrors: validation.fieldErrors,
      errorCode: first?.code,
      errorMessage: first?.message,
    };
  }
  return runCalculation(validation.inputs, presets, resolutions);
}
