// PASS rule evaluation: every gate a preset must clear, per spec Section 5-6's
// "PRESET PASS CONDITIONS". Each function is a small, independently testable
// predicate/violation-list; lib/recommendation/evaluatePreset.ts calls them in
// sequence and stops at the first failure.

import { isFiniteNumber } from "../physics/stereo";
import type { ErrorCode, PresetConfig } from "../types";
import { ERROR_MESSAGES } from "../errors";

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
  if (!finitePositive(preset.maxDisparityRangePx)) return false;
  if (!fractionInRange(preset.usableHorizontalFraction)) return false;
  if (!fractionInRange(preset.usableVerticalFraction)) return false;
  if (preset.pixelPitchUm !== undefined && !finitePositive(preset.pixelPitchUm)) return false;
  if (typeof preset.active !== "boolean") return false;
  if (!preset.formulaVersion || preset.formulaVersion.trim() === "") return false;

  return true;
}

/** ERR-05: Z_near must not exceed the effective max near distance (the preset's
 * own limit, optionally tightened by the user's advanced max-working-distance input). */
export function passesWorkingDistanceGate(Z_near: number, effectiveMaxNearDistanceMm: number): boolean {
  return Z_near <= effectiveMaxNearDistanceMm;
}

/** ERR-07: the disparity SPAN the stereo matcher has to search across the part's
 * near-to-far depth (d_near - d_far), not the absolute near-disparity value --
 * matches how real stereo-matching algorithms are configured (a search-window/
 * numDisparities range), not an absolute cap. */
export function passesDisparityRangeGate(d_near: number, d_far: number, maxDisparityRangePx: number): boolean {
  return d_near - d_far <= maxDisparityRangePx;
}

/** ERR-08: guard before dividing by (d_far - delta_d) downstream. */
export function passesFarDisparityGuard(d_far: number, disparityUncertaintyPx: number): boolean {
  return d_far > disparityUncertaintyPx;
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
