// Pure stereo-vision equations. No assumptions, no preset config baked in --
// baseline, focal length, FOV, and distance are all plain function parameters.
// lib/engineering/ is where preset config gets applied to these.

export function isFiniteNumber(x: number): boolean {
  return typeof x === "number" && Number.isFinite(x);
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distance at which a target of the given width exactly fills a camera's field of
 * view: width = 2*Z*tan(fov/2), solved for Z. Used for both Z_h (width = W_req + B)
 * and Z_v (width = H_req). */
export function distanceForFramingWidth(widthMm: number, fovDeg: number): number {
  return widthMm / (2 * Math.tan(degToRad(fovDeg) / 2));
}

/** The classic stereo relation Z = f*B/d, solved for disparity given distance. */
export function disparityFromDistance(focalLengthPx: number, baselineMm: number, distanceMm: number): number {
  return (focalLengthPx * baselineMm) / distanceMm;
}

/** The same stereo relation Z = f*B/d, solved for distance given disparity
 * (used to turn a disparity +/- uncertainty into a depth +/- error). */
export function distanceFromDisparity(focalLengthPx: number, baselineMm: number, disparityPx: number): number {
  return (focalLengthPx * baselineMm) / disparityPx;
}
