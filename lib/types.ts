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
  maxSupportedDisparityPx: number;
  /** Usable fraction of the horizontal sensor/frame, 0 < x <= 1. */
  usableHorizontalFraction: number;
  /** Usable fraction of the vertical sensor/frame, 0 < x <= 1. */
  usableVerticalFraction: number;
  /** Optional: pixel pitch in micrometers, used to derive lens focal length in mm. */
  pixelPitchUm?: number;
  active: boolean;
  formulaVersion: string;
}

/** One entry in the supported machine-vision resolution list. */
export interface ResolutionConfig {
  name: string;
  horizontalPixels: number;
  verticalPixels: number;
  /** Computed as horizontalPixels * verticalPixels / 1e6. Never parsed from `name`. */
  megapixels: number;
  priority: number;
  active: boolean;
}

/** Raw, possibly-invalid user input straight from the form (strings, so blanks are representable). */
export interface RawCalculatorInputs {
  partLengthMm: string;
  partWidthMm: string;
  partDepthMm: string;
  requiredAccuracyMm: string;
}

/** Parsed, validated numeric inputs. */
export interface CalculatorInputs {
  partLengthMm: number;
  partWidthMm: number;
  partDepthMm: number;
  requiredAccuracyMm: number;
}

export type ErrorCode =
  | "ERR-01"
  | "ERR-02"
  | "ERR-03"
  | "ERR-04"
  | "ERR-05"
  | "ERR-06"
  | "ERR-07"
  | "ERR-08"
  | "ERR-09"
  | "ERR-10"
  | "ERR-11";

export interface FieldError {
  field: "partLengthMm" | "partWidthMm" | "partDepthMm" | "requiredAccuracyMm";
  code: ErrorCode;
  message: string;
}

/** All intermediate values computed for a single preset, per spec Section 5-6. Populated
 * progressively; fields past the point of failure are left undefined. */
export interface PresetComputation {
  W_req?: number;
  H_req?: number;
  Z_h?: number;
  Z_v?: number;
  Z_near?: number;
  Z_center?: number;
  Z_far?: number;
  E_design?: number;
  f_req?: number;
  N_x_req?: number;
  N_y_req?: number;
  d_near?: number;
  d_far?: number;
  Z_low?: number;
  Z_high?: number;
  E_Z?: number;
  E_safe?: number;
  f_mm?: number;
}

export interface PresetEvaluation {
  presetName: string;
  priority: number;
  baselineMm: number;
  formulaVersion: string;
  passed: boolean;
  errorCode?: ErrorCode;
  errorMessage?: string;
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
