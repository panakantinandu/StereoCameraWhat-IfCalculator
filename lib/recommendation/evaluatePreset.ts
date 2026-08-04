// Per-preset orchestration: the only place that calls both lib/engineering
// (physics + preset config applied) and lib/cameraDatabase (via
// selectResolution), and assembles the resulting PresetEvaluation. Follows spec
// Sections 5-6 exactly; stops at the first failed gate, with every value
// computed up to that point preserved for the technical-details view.

import { isFiniteNumber } from "../physics/stereo";
import {
  computeAccuracyDrivenFocalLength,
  computeDepthError,
  computeDisparities,
  computeFramingDimensions,
  computeLensFocalLengthMm,
  computeNearDistance,
  computePixelRequirement,
  effectiveMaxNearDistanceMm,
} from "../engineering/derivation";
import {
  checkDepthAccuracy,
  isPresetConfigValid,
  passesDisparityRangeGate,
  passesFarDisparityGuard,
  passesWorkingDistanceGate,
} from "../engineering/gates";
import { ERROR_MESSAGES } from "../errors";
import type { CalculatorInputs, ErrorCode, PresetComputation, PresetConfig, PresetEvaluation, ResolutionConfig } from "../types";
import { selectResolution } from "./selectResolution";

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

  const { W_req, H_req } = computeFramingDimensions(inputs, preset);
  computation.W_req = W_req;
  computation.H_req = H_req;

  const { Z_h, Z_v, Z_near } = computeNearDistance(W_req, H_req, preset);
  computation.Z_h = Z_h;
  computation.Z_v = Z_v;

  if (!isFiniteNumber(Z_h) || !isFiniteNumber(Z_v)) {
    return fail("ERR-10");
  }

  computation.Z_near = Z_near;

  const effectiveMax = effectiveMaxNearDistanceMm(preset, inputs.maxWorkingDistanceMm);
  if (!passesWorkingDistanceGate(Z_near, effectiveMax)) {
    return fail("ERR-05");
  }

  const Z_center = Z_near + inputs.partDepthMm / 2;
  const Z_far = Z_near + inputs.partDepthMm;
  computation.Z_center = Z_center;
  computation.Z_far = Z_far;

  const { E_design_plus, E_design_minus, f_req_plus, f_req_minus, f_req } = computeAccuracyDrivenFocalLength(
    inputs,
    preset,
    Z_far
  );
  computation.E_design_plus = E_design_plus;
  computation.E_design_minus = E_design_minus;
  computation.f_req_plus = f_req_plus;
  computation.f_req_minus = f_req_minus;
  computation.f_req = f_req;

  if (!isFiniteNumber(f_req) || f_req <= 0) {
    return fail("ERR-10");
  }

  const { N_x_req, N_y_req } = computePixelRequirement(f_req, W_req, H_req, Z_near, preset);
  const { d_near, d_far } = computeDisparities(f_req, preset, Z_near, Z_far);
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

  if (!passesDisparityRangeGate(d_near, d_far, preset.maxDisparityRangePx)) {
    return fail("ERR-07", selectedResolution);
  }

  // Guard before dividing by (d_far - delta_d) / (d_far + delta_d) below.
  if (!passesFarDisparityGuard(d_far, preset.disparityUncertaintyPx)) {
    return fail("ERR-08", selectedResolution);
  }

  const { Z_low, Z_high, E_Z_plus, E_Z_minus, E_safe_plus, E_safe_minus } = computeDepthError(
    f_req,
    preset,
    d_far,
    Z_far
  );
  computation.Z_low = Z_low;
  computation.Z_high = Z_high;
  computation.E_Z_plus = E_Z_plus;
  computation.E_Z_minus = E_Z_minus;
  computation.E_safe_plus = E_safe_plus;
  computation.E_safe_minus = E_safe_minus;

  const f_mm = computeLensFocalLengthMm(f_req, preset);
  if (f_mm !== undefined) {
    computation.f_mm = f_mm;
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
