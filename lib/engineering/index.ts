export { PRESETS } from "./presets";
export {
  computeAccuracyDrivenFocalLength,
  computeDepthError,
  computeDisparities,
  computeFramingDimensions,
  computeLensFocalLengthMm,
  computeNearDistance,
  computePixelRequirement,
  effectiveMaxNearDistanceMm,
} from "./derivation";
export {
  checkDepthAccuracy,
  isPresetConfigValid,
  passesDisparityRangeGate,
  passesFarDisparityGuard,
  passesWorkingDistanceGate,
} from "./gates";
export { pickRecommended } from "./tieBreak";
