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
  "ERR-04": "Enter a valid positive required stereo depth accuracy.",
  "ERR-05": "The required working distance exceeds the approved machine limit.",
  "ERR-06": "No listed resolution meets the calculated horizontal and vertical pixel requirement.",
  "ERR-07": "Near disparity exceeds the configured stereo processing range.",
  "ERR-08": "Far disparity is too small for the configured disparity uncertainty.",
  "ERR-09": "The safety-adjusted theoretical depth error exceeds the requested accuracy.",
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

/** Validates the four user-editable inputs. Blank, NaN, and infinite values are all
 * rejected with the same field message per the ERR table (the spec does not define
 * distinct wording per failure mode). */
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

  const requiredAccuracyMm = parseNumber(raw.requiredAccuracyMm);
  if (!isValidPositive(requiredAccuracyMm)) {
    fieldErrors.push({ field: "requiredAccuracyMm", code: "ERR-04", message: ERROR_MESSAGES["ERR-04"] });
  }

  if (fieldErrors.length > 0) {
    return { valid: false, fieldErrors };
  }

  return { valid: true, inputs: { partLengthMm, partWidthMm, partDepthMm, requiredAccuracyMm } };
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

// The formula chain is constructed so that, by algebraic identity, |Z_low - Z_far|
// always equals E_design exactly once f_req is computed from it. That makes
// E_safe (= S * E_Z) equal RequiredAccuracy almost exactly whenever the earlier
// guards (ERR-05..08) pass, up to floating-point representation error alone
// (repeating decimals from the tan()/division chain, not a modeling error). This
// epsilon absorbs that representation error without weakening the ERR-09 check
// the spec calls for.
const E_SAFE_EPSILON = 1e-9;

function fails(a: number, b: number): boolean {
  return a - b > E_SAFE_EPSILON * Math.max(1, Math.abs(b));
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
  const E_design = inputs.requiredAccuracyMm / preset.safetyFactor;
  computation.Z_center = Z_center;
  computation.Z_far = Z_far;
  computation.E_design = E_design;

  const f_req = (preset.disparityUncertaintyPx * Z_far * (Z_far + E_design)) / (B * E_design);
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
  const E_Z = Math.max(Math.abs(Z_low - Z_far), Math.abs(Z_high - Z_far));
  const E_safe = preset.safetyFactor * E_Z;
  computation.Z_low = Z_low;
  computation.Z_high = Z_high;
  computation.E_Z = E_Z;
  computation.E_safe = E_safe;

  if (preset.pixelPitchUm !== undefined) {
    computation.f_mm = (f_req * preset.pixelPitchUm) / 1000;
  }

  if (!isFiniteNumber(E_safe)) {
    return fail("ERR-10", selectedResolution);
  }

  if (fails(E_safe, inputs.requiredAccuracyMm)) {
    return fail("ERR-09", selectedResolution);
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
