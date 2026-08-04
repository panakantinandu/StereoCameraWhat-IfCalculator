// Shared error-code -> message lookup, used by lib/engineering (gate checks) and
// lib/recommendation (input validation, top-level result assembly) alike. Exact
// strings per spec's ERR table -- do not reword without checking both layers.

import type { ErrorCode } from "./types";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  "ERR-01": "Enter a valid positive part length.",
  "ERR-02": "Enter a valid positive part width.",
  "ERR-03": "Part depth cannot be negative.",
  "ERR-04a": "Enter a valid positive required stereo depth accuracy (+).",
  "ERR-04b": "Enter a valid positive required stereo depth accuracy (-).",
  "ERR-05": "The required working distance exceeds the approved machine limit.",
  "ERR-06": "No listed resolution meets the calculated horizontal and vertical pixel requirement.",
  "ERR-07": "Near disparity exceeds the configured stereo processing range.",
  "ERR-08": "Far disparity is too small for the configured disparity uncertainty.",
  "ERR-09a": "The safety-adjusted theoretical depth error exceeds the requested accuracy (+).",
  "ERR-09b": "The safety-adjusted theoretical depth error exceeds the requested accuracy (-).",
  "ERR-10": "The selected engineering preset is incomplete or invalid.",
  "ERR-11": "No approved internal preset passes this request.",
  "ERR-12": "Enter a valid positive maximum working distance, or leave it blank.",
};
