// Hidden engineering configuration for the Stereo Camera What-If Calculator.
//
// *** ALL VALUES IN THIS FILE ARE PLACEHOLDERS. ***
// Every field below is marked TBD — pending Gary/engineering approval, see spec
// Section 11.1. None of these numbers have been validated against real hardware,
// approved machine envelopes, or measured stereo processing limits. Do not treat
// any output of this tool as final until this file has been reviewed and signed
// off by engineering.
//
// This file is NOT user-editable from the UI by design (see spec: "editable only
// in code/config, never in the UI"). To change a preset, edit this file directly
// and get it re-reviewed.

import type { PresetConfig } from "./types";

export const PRESETS: PresetConfig[] = [
  {
    name: "Compact", // TBD — pending Gary/engineering approval, see spec Section 11.1
    priority: 1, // TBD — pending Gary/engineering approval, see spec Section 11.1
    framingMargin: 0.1, // TBD — pending Gary/engineering approval, see spec Section 11.1
    baselineMm: 60, // TBD — pending Gary/engineering approval, see spec Section 11.1
    maxHorizontalFovDeg: 50, // TBD — pending Gary/engineering approval, see spec Section 11.1
    maxVerticalFovDeg: 40, // TBD — pending Gary/engineering approval, see spec Section 11.1
    minNearDistanceMm: 150, // TBD — pending Gary/engineering approval, see spec Section 11.1
    maxNearDistanceMm: 600, // TBD — pending Gary/engineering approval, see spec Section 11.1
    disparityUncertaintyPx: 0.5, // TBD — pending Gary/engineering approval, see spec Section 11.1
    safetyFactor: 1.5, // TBD — pending Gary/engineering approval, see spec Section 11.1
    maxSupportedDisparityPx: 400, // TBD — pending Gary/engineering approval, see spec Section 11.1
    usableHorizontalFraction: 0.9, // TBD — pending Gary/engineering approval, see spec Section 11.1
    usableVerticalFraction: 0.9, // TBD — pending Gary/engineering approval, see spec Section 11.1
    pixelPitchUm: 3.45, // TBD — pending Gary/engineering approval, see spec Section 11.1
    active: true, // TBD — pending Gary/engineering approval, see spec Section 11.1
    formulaVersion: "spec-v1-draft", // TBD — pending Gary/engineering approval, see spec Section 11.1
  },
  {
    name: "Standard", // TBD — pending Gary/engineering approval, see spec Section 11.1
    priority: 2, // TBD — pending Gary/engineering approval, see spec Section 11.1
    framingMargin: 0.15, // TBD — pending Gary/engineering approval, see spec Section 11.1
    baselineMm: 120, // TBD — pending Gary/engineering approval, see spec Section 11.1
    maxHorizontalFovDeg: 60, // TBD — pending Gary/engineering approval, see spec Section 11.1
    maxVerticalFovDeg: 45, // TBD — pending Gary/engineering approval, see spec Section 11.1
    minNearDistanceMm: 300, // TBD — pending Gary/engineering approval, see spec Section 11.1
    maxNearDistanceMm: 1500, // TBD — pending Gary/engineering approval, see spec Section 11.1
    disparityUncertaintyPx: 0.5, // TBD — pending Gary/engineering approval, see spec Section 11.1
    safetyFactor: 2, // TBD — pending Gary/engineering approval, see spec Section 11.1
    maxSupportedDisparityPx: 500, // TBD — pending Gary/engineering approval, see spec Section 11.1
    usableHorizontalFraction: 0.9, // TBD — pending Gary/engineering approval, see spec Section 11.1
    usableVerticalFraction: 0.9, // TBD — pending Gary/engineering approval, see spec Section 11.1
    pixelPitchUm: 3.45, // TBD — pending Gary/engineering approval, see spec Section 11.1
    active: true, // TBD — pending Gary/engineering approval, see spec Section 11.1
    formulaVersion: "spec-v1-draft", // TBD — pending Gary/engineering approval, see spec Section 11.1
  },
  {
    name: "Long Baseline", // TBD — pending Gary/engineering approval, see spec Section 11.1
    priority: 3, // TBD — pending Gary/engineering approval, see spec Section 11.1
    framingMargin: 0.15, // TBD — pending Gary/engineering approval, see spec Section 11.1
    baselineMm: 250, // TBD — pending Gary/engineering approval, see spec Section 11.1
    maxHorizontalFovDeg: 70, // TBD — pending Gary/engineering approval, see spec Section 11.1
    maxVerticalFovDeg: 55, // TBD — pending Gary/engineering approval, see spec Section 11.1
    minNearDistanceMm: 800, // TBD — pending Gary/engineering approval, see spec Section 11.1
    maxNearDistanceMm: 4000, // TBD — pending Gary/engineering approval, see spec Section 11.1
    disparityUncertaintyPx: 0.5, // TBD — pending Gary/engineering approval, see spec Section 11.1
    safetyFactor: 2, // TBD — pending Gary/engineering approval, see spec Section 11.1
    maxSupportedDisparityPx: 600, // TBD — pending Gary/engineering approval, see spec Section 11.1
    usableHorizontalFraction: 0.85, // TBD — pending Gary/engineering approval, see spec Section 11.1
    usableVerticalFraction: 0.85, // TBD — pending Gary/engineering approval, see spec Section 11.1
    pixelPitchUm: 3.45, // TBD — pending Gary/engineering approval, see spec Section 11.1
    active: true, // TBD — pending Gary/engineering approval, see spec Section 11.1
    formulaVersion: "spec-v1-draft", // TBD — pending Gary/engineering approval, see spec Section 11.1
  },
];
