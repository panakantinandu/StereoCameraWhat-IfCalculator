// Shared types for the Stereo Camera What-If Calculator.
// See spec Sections 2, 5-6, 11.1 for field definitions and units.

/** One engineering preset (hidden config, never user-editable). */
export interface PresetConfig {
  name: string;
  /** Lower number = more preferred in the tie-break order. */
  priority: number;
  /** Framing margin as a fraction, e.g. 0.1 = 10%. */
  framingMargin: number;
  /** Stereo baseline (distance between left/right cameras), mm. */
  baselineMm: number;
  maxHorizontalFovDeg: number;
  maxVerticalFovDeg: number;
  minNearDistanceMm: number;
  maxNearDistanceMm: number;
  /** Disparity uncertainty in pixels (delta_d). */
  disparityUncertaintyPx: number;
  /** Safety factor (S), must be >= 1. */
  safetyFactor: number;
  /** Max supported disparity SPAN (d_near - d_far) the stereo matcher can search across the part's depth. */
  maxDisparityRangePx: number;
  /** Usable fraction of the horizontal sensor/frame, 0 < x <= 1. */
  usableHorizontalFraction: number;
  /** Usable fraction of the vertical sensor/frame, 0 < x <= 1. */
  usableVerticalFraction: number;
  /** Optional: pixel pitch in micrometers, used to derive lens focal length in mm. */
  pixelPitchUm?: number;
  active: boolean;
  formulaVersion: string;
}

/** One entry in the supported machine-vision resolution list (lib/cameraDatabase).
 * The extra fields are forward-looking schema growth for a real camera catalog --
 * all optional/nullable so existing placeholder entries don't need to supply them. */
export interface ResolutionConfig {
  name: string;
  horizontalPixels: number;
  verticalPixels: number;
  /** Computed as horizontalPixels * verticalPixels / 1e6. Never parsed from `name`. */
  megapixels: number;
  priority: number;
  active: boolean;
  sensorWidthMm?: number | null;
  sensorHeightMm?: number | null;
  pixelPitchUm?: number | null;
  manufacturer?: string | null;
  model?: string | null;
  priceUsd?: number | null;
}

/** Raw, possibly-invalid user input straight from the form (strings, so blanks are representable).
 * accuracyPlusMm / accuracyMinusMm are always entered as positive magnitudes -- the sign is implied
 * by which bound the field represents, not typed by the user. When the "symmetric tolerance" toggle
 * is on, the UI mirrors one typed value into both fields before calling validateInputs/calculate.
 * maxWorkingDistanceMm is the optional "Advanced (engineering only)" input -- leave blank to skip it. */
export interface RawCalculatorInputs {
  partLengthMm: string;
  partWidthMm: string;
  partDepthMm: string;
  accuracyPlusMm: string;
  accuracyMinusMm: string;
  maxWorkingDistanceMm: string;
}

/** Parsed, validated numeric inputs. */
export interface CalculatorInputs {
  partLengthMm: number;
  partWidthMm: number;
  partDepthMm: number;
  /** How far the measured depth is allowed to read FARTHER than actual, mm. Always a positive magnitude. */
  accuracyPlus: number;
  /** How far the measured depth is allowed to read CLOSER than actual, mm. Always a positive magnitude. */
  accuracyMinus: number;
  /** Optional extra ceiling on top of (not instead of) each preset's own maxNearDistanceMm --
   * effective max = min(preset.maxNearDistanceMm, maxWorkingDistanceMm ?? Infinity). Undefined
   * when the user left the advanced field blank. */
  maxWorkingDistanceMm?: number;
}

export type ErrorCode =
  | "ERR-01"
  | "ERR-02"
  | "ERR-03"
  | "ERR-04a"
  | "ERR-04b"
  | "ERR-05"
  | "ERR-06"
  | "ERR-07"
  | "ERR-08"
  | "ERR-09a"
  | "ERR-09b"
  | "ERR-10"
  | "ERR-11"
  | "ERR-12";

export interface FieldError {
  field: "partLengthMm" | "partWidthMm" | "partDepthMm" | "accuracyPlusMm" | "accuracyMinusMm" | "maxWorkingDistanceMm";
  code: ErrorCode;
  message: string;
}

/** All intermediate values computed for a single preset, per spec Section 5-6. Populated
 * progressively; fields past the point of failure are left undefined. The depth-accuracy stage
 * (E_design / f_req / E_Z / E_safe) is two-sided: "_plus" tracks the part reading farther than
 * actual, "_minus" tracks it reading closer than actual. f_req itself stays single-valued --
 * it's the max of the two per-side candidates, since the stricter bound drives the resolution. */
export interface PresetComputation {
  W_req?: number;
  H_req?: number;
  Z_h?: number;
  Z_v?: number;
  Z_near?: number;
  Z_center?: number;
  Z_far?: number;
  E_design_plus?: number;
  E_design_minus?: number;
  f_req_plus?: number;
  f_req_minus?: number;
  f_req?: number;
  N_x_req?: number;
  N_y_req?: number;
  d_near?: number;
  d_far?: number;
  Z_low?: number;
  Z_high?: number;
  E_Z_plus?: number;
  E_Z_minus?: number;
  E_safe_plus?: number;
  E_safe_minus?: number;
  f_mm?: number;
}

export interface PresetEvaluation {
  presetName: string;
  priority: number;
  baselineMm: number;
  formulaVersion: string;
  passed: boolean;
  /** Primary/first violated code, kept for callers that only care about one reason. */
  errorCode?: ErrorCode;
  /** Combined message text -- two sentences, space-joined, when both accuracy bounds fail at once. */
  errorMessage?: string;
  /** Every violated code for this failure. Only the depth-accuracy gate can produce more than one
   * entry (ERR-09a and ERR-09b together); every other gate fails with exactly one code. */
  errorCodes?: ErrorCode[];
  computation: PresetComputation;
  selectedResolution?: ResolutionConfig;
}

export type OverallStatus = "PASS" | "FAIL" | "NO VALID CONFIGURATION";

export interface CalculationResult {
  status: OverallStatus;
  /** Present only when status === "PASS". The tie-break winner. */
  recommended?: PresetEvaluation;
  /** Every active preset that was evaluated, in priority order. */
  evaluations: PresetEvaluation[];
  /** Top-level error, e.g. input validation failures (ERR-01..04) or ERR-11. */
  errorCode?: ErrorCode;
  errorMessage?: string;
  fieldErrors?: FieldError[];
}
