import type { PresetEvaluation } from "../types";

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
