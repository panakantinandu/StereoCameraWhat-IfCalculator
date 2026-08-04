// Supported machine-vision resolution/camera list for the Stereo Camera What-If
// Calculator.
//
// *** ALL ENTRIES IN THIS FILE ARE PLACEHOLDERS. ***
// These are common industrial machine-vision sensor resolutions used only to
// exercise the calculator during development. They are TBD — pending
// Gary/engineering approval, see spec Section 11.1 — and must be replaced with
// the actual approved/stocked sensor list before this tool is relied on.
//
// horizontalPixels / verticalPixels are stored as separate integers (never
// parsed from `name`). `megapixels` is derived, not hand-entered, to avoid
// drift between the name, the pixel counts, and the displayed MP figure.
//
// sensorWidthMm/sensorHeightMm/pixelPitchUm/manufacturer/model/priceUsd are
// forward-looking schema growth for a real camera catalog -- all optional, so
// existing entries don't need to supply them until a real one is sourced.

import type { ResolutionConfig } from "../types";

type OptionalCameraFields = Partial<
  Pick<ResolutionConfig, "sensorWidthMm" | "sensorHeightMm" | "pixelPitchUm" | "manufacturer" | "model" | "priceUsd">
>;

function resolution(
  name: string,
  horizontalPixels: number,
  verticalPixels: number,
  priority: number,
  active: boolean,
  extra: OptionalCameraFields = {}
): ResolutionConfig {
  return {
    name,
    horizontalPixels,
    verticalPixels,
    megapixels: (horizontalPixels * verticalPixels) / 1e6,
    priority,
    active,
    ...extra,
  };
}

export const RESOLUTIONS: ResolutionConfig[] = [
  // TBD — pending Gary/engineering approval, see spec Section 11.1
  resolution("1280 x 1024", 1280, 1024, 1, true),
  // TBD — pending Gary/engineering approval, see spec Section 11.1
  resolution("1920 x 1200", 1920, 1200, 2, true),
  // TBD — pending Gary/engineering approval, see spec Section 11.1
  resolution("2448 x 2048", 2448, 2048, 3, true),
  // TBD — pending Gary/engineering approval, see spec Section 11.1
  resolution("3072 x 2048", 3072, 2048, 4, true),
  // TBD — pending Gary/engineering approval, see spec Section 11.1
  resolution("4096 x 3000", 4096, 3000, 5, true),
];
