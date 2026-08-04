// The assumption layer: this is where preset config (framing margin, safety
// factor, disparity uncertainty, usable sensor fraction) gets applied to the
// pure physics relations in lib/physics/stereo.ts. Variable names follow spec
// Sections 5-6 exactly so this stays auditable against the requirements doc.

import { disparityFromDistance, distanceForFramingWidth, distanceFromDisparity } from "../physics/stereo";
import type { CalculatorInputs, PresetConfig } from "../types";

/** W_req / H_req: the part's framed dimensions after applying the preset's framing margin. */
export function computeFramingDimensions(
  inputs: CalculatorInputs,
  preset: PresetConfig
): { W_req: number; H_req: number } {
  return {
    W_req: inputs.partLengthMm * (1 + preset.framingMargin),
    H_req: inputs.partWidthMm * (1 + preset.framingMargin),
  };
}

/** Z_h, Z_v, and Z_near -- the near working distance the preset's FOV and minimum
 * near-distance limit require for this framing. */
export function computeNearDistance(
  W_req: number,
  H_req: number,
  preset: PresetConfig
): { Z_h: number; Z_v: number; Z_near: number } {
  const Z_h = distanceForFramingWidth(W_req + preset.baselineMm, preset.maxHorizontalFovDeg);
  const Z_v = distanceForFramingWidth(H_req, preset.maxVerticalFovDeg);
  return { Z_h, Z_v, Z_near: Math.max(preset.minNearDistanceMm, Z_h, Z_v) };
}

/** Effective max near distance: the preset's own maxNearDistanceMm, optionally
 * tightened further (never loosened) by the user's advanced "Maximum Working
 * Distance" input. */
export function effectiveMaxNearDistanceMm(preset: PresetConfig, userMaxWorkingDistanceMm?: number): number {
  return Math.min(preset.maxNearDistanceMm, userMaxWorkingDistanceMm ?? Infinity);
}

/** E_design_plus/minus and f_req_plus/minus/req: the accuracy-driven focal length
 * derivation, asymmetric across the (+) and (-) accuracy bounds. f_req is the max
 * of the two per-side candidates -- the stricter bound drives the resolution. */
export function computeAccuracyDrivenFocalLength(
  inputs: CalculatorInputs,
  preset: PresetConfig,
  Z_far: number
): {
  E_design_plus: number;
  E_design_minus: number;
  f_req_plus: number;
  f_req_minus: number;
  f_req: number;
} {
  const E_design_plus = inputs.accuracyPlus / preset.safetyFactor;
  const E_design_minus = inputs.accuracyMinus / preset.safetyFactor;
  const f_req_plus = (preset.disparityUncertaintyPx * Z_far * (Z_far + E_design_plus)) / (preset.baselineMm * E_design_plus);
  const f_req_minus = (preset.disparityUncertaintyPx * Z_far * (Z_far + E_design_minus)) / (preset.baselineMm * E_design_minus);
  return { E_design_plus, E_design_minus, f_req_plus, f_req_minus, f_req: Math.max(f_req_plus, f_req_minus) };
}

/** N_x_req / N_y_req: required sensor pixel counts, applying the preset's usable
 * sensor/frame fraction to the framed dimensions. */
export function computePixelRequirement(
  f_req: number,
  W_req: number,
  H_req: number,
  Z_near: number,
  preset: PresetConfig
): { N_x_req: number; N_y_req: number } {
  return {
    N_x_req: Math.ceil((f_req * (W_req + preset.baselineMm)) / (Z_near * preset.usableHorizontalFraction)),
    N_y_req: Math.ceil((f_req * H_req) / (Z_near * preset.usableVerticalFraction)),
  };
}

/** d_near / d_far: near and far disparities for the resolved focal length. */
export function computeDisparities(
  f_req: number,
  preset: PresetConfig,
  Z_near: number,
  Z_far: number
): { d_near: number; d_far: number } {
  return {
    d_near: disparityFromDistance(f_req, preset.baselineMm, Z_near),
    d_far: disparityFromDistance(f_req, preset.baselineMm, Z_far),
  };
}

/** Z_low/Z_high, E_Z_plus/minus, and E_safe_plus/minus: the two-sided theoretical
 * and safety-adjusted depth error, from the far disparity +/- the preset's
 * disparity uncertainty. Caller must guard d_far > disparityUncertaintyPx first
 * (dividing by d_far - disparityUncertaintyPx below). */
export function computeDepthError(
  f_req: number,
  preset: PresetConfig,
  d_far: number,
  Z_far: number
): {
  Z_low: number;
  Z_high: number;
  E_Z_plus: number;
  E_Z_minus: number;
  E_safe_plus: number;
  E_safe_minus: number;
} {
  const Z_low = distanceFromDisparity(f_req, preset.baselineMm, d_far - preset.disparityUncertaintyPx);
  const Z_high = distanceFromDisparity(f_req, preset.baselineMm, d_far + preset.disparityUncertaintyPx);
  const E_Z_plus = Z_low - Z_far;
  const E_Z_minus = Z_far - Z_high;
  return {
    Z_low,
    Z_high,
    E_Z_plus,
    E_Z_minus,
    E_safe_plus: preset.safetyFactor * E_Z_plus,
    E_safe_minus: preset.safetyFactor * E_Z_minus,
  };
}

/** f_mm: lens focal length in mm, only when the preset has a known pixel pitch. */
export function computeLensFocalLengthMm(f_req: number, preset: PresetConfig): number | undefined {
  return preset.pixelPitchUm !== undefined ? (f_req * preset.pixelPitchUm) / 1000 : undefined;
}
