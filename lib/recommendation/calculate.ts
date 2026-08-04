import { isFiniteNumber } from "../physics/stereo";
import { ERROR_MESSAGES } from "../errors";
import type { CalculationResult, CalculatorInputs, FieldError, PresetConfig, RawCalculatorInputs, ResolutionConfig } from "../types";
import { runCalculation } from "./runCalculation";

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

/** Validates the five required user-editable inputs (part length/width/depth, plus
 * the two accuracy magnitudes) and the one optional advanced input (maximum working
 * distance). Blank, NaN, and infinite values are all rejected with the same field
 * message per the ERR table (the spec does not define distinct wording per failure
 * mode). accuracyPlus/accuracyMinus are always positive magnitudes -- the UI is
 * responsible for mirroring one value into both when "symmetric" is on. A blank
 * maxWorkingDistanceMm is valid (the advanced constraint is opt-in); a non-blank
 * one must still be a valid positive number. */
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

  let maxWorkingDistanceMm: number | undefined;
  const maxWorkingDistanceRaw = raw.maxWorkingDistanceMm.trim();
  if (maxWorkingDistanceRaw !== "") {
    const parsed = parseNumber(raw.maxWorkingDistanceMm);
    if (!isValidPositive(parsed)) {
      fieldErrors.push({ field: "maxWorkingDistanceMm", code: "ERR-12", message: ERROR_MESSAGES["ERR-12"] });
    } else {
      maxWorkingDistanceMm = parsed;
    }
  }

  if (fieldErrors.length > 0) {
    return { valid: false, fieldErrors };
  }

  return {
    valid: true,
    inputs: { partLengthMm, partWidthMm, partDepthMm, accuracyPlus, accuracyMinus, maxWorkingDistanceMm },
  };
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
