import type { ResolutionConfig } from "../types";

/** Resolution selection: first active entry (in priority order) whose pixel counts
 * meet or exceed the requirement wins. Never selects by megapixels alone. This is
 * the only place lib/engineering's numbers (N_x_req/N_y_req) get matched against
 * lib/cameraDatabase's catalog, which is why it lives in recommendation/. */
export function selectResolution(
  resolutions: ResolutionConfig[],
  nxReq: number,
  nyReq: number
): ResolutionConfig | undefined {
  return resolutions
    .filter((r) => r.active && r.horizontalPixels > 0 && r.verticalPixels > 0)
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .find((r) => r.horizontalPixels >= nxReq && r.verticalPixels >= nyReq);
}
