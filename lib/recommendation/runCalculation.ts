import { pickRecommended } from "../engineering/tieBreak";
import { ERROR_MESSAGES } from "../errors";
import type { CalculationResult, CalculatorInputs, PresetConfig, ResolutionConfig } from "../types";
import { evaluatePreset } from "./evaluatePreset";

/** When the user's advanced "Maximum Working Distance" input is the reason every
 * preset fails, this builds a specific, actionable message instead of the generic
 * ERR-11 text -- re-evaluating every preset WITHOUT the user's ceiling to confirm
 * the part would otherwise be achievable, and if so, report how much working
 * distance it would actually need. Returns undefined (falling back to the generic
 * message) when the part doesn't work regardless of working-distance room, so we
 * never tell someone "just get more clearance" when that wouldn't actually help. */
function buildMaxWorkingDistanceMessage(
  inputs: CalculatorInputs,
  presets: PresetConfig[],
  resolutions: ResolutionConfig[]
): string | undefined {
  const requestedMaxMm = inputs.maxWorkingDistanceMm;
  if (requestedMaxMm === undefined) return undefined;

  const unconstrained: CalculatorInputs = { ...inputs, maxWorkingDistanceMm: undefined };
  const wouldPassWithoutCeiling = presets
    .filter((p) => p.active)
    .map((p) => evaluatePreset(unconstrained, p, resolutions))
    .filter((e) => e.passed && e.computation.Z_near !== undefined);

  if (wouldPassWithoutCeiling.length === 0) return undefined;

  const best = wouldPassWithoutCeiling.reduce((a, b) => (b.computation.Z_near! < a.computation.Z_near! ? b : a));
  if (best.computation.Z_near! <= requestedMaxMm) return undefined; // shouldn't happen, but don't show a contradictory message

  return `No preset fits within the specified maximum working distance; the next-shortest achievable distance is ${Math.round(
    best.computation.Z_near!
  )} mm with the ${best.presetName} setup.`;
}

/** Evaluates every active preset (in priority order) against already-validated
 * inputs and determines the overall PASS / NO VALID CONFIGURATION result. This is
 * the top-level orchestration function: it's what runs every preset, picks the
 * winner via lib/engineering's tie-break, and assembles the final result object. */
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
    const maxWorkingDistanceMessage = buildMaxWorkingDistanceMessage(inputs, presets, resolutions);
    return {
      status: "NO VALID CONFIGURATION",
      evaluations,
      errorCode: "ERR-11",
      errorMessage: maxWorkingDistanceMessage ?? ERROR_MESSAGES["ERR-11"],
    };
  }

  return { status: "PASS", recommended: pickRecommended(passed), evaluations };
}
