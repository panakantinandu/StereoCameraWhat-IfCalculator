"use client";

import { useState } from "react";
import { calculate } from "@/lib/recommendation";
import { PRESETS } from "@/lib/engineering";
import { RESOLUTIONS } from "@/lib/cameraDatabase";
import type { CalculationResult, FieldError, PresetEvaluation, RawCalculatorInputs } from "@/lib/types";

const EMPTY_INPUTS: RawCalculatorInputs = {
  partLengthMm: "",
  partWidthMm: "",
  partDepthMm: "",
  accuracyPlusMm: "",
  accuracyMinusMm: "",
  maxWorkingDistanceMm: "",
};

const DISCLAIMER =
  "Preliminary theoretical stereo-camera requirement based on the current internal " +
  "engineering settings. Final camera, lens and accuracy must be confirmed through " +
  "calibration and physical prototype testing.";

function fmt(n: number | undefined, decimals = 1): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Formats an asymmetric +/- pair as "+X.XX mm / -Y.YY mm" (OUT-11 / OUT-12). */
function fmtPlusMinus(plus: number | undefined, minus: number | undefined, decimals = 3): string {
  if (plus === undefined || minus === undefined || !Number.isFinite(plus) || !Number.isFinite(minus)) return "—";
  return `+${fmt(plus, decimals)} mm / -${fmt(minus, decimals)} mm`;
}

function fieldError(errors: FieldError[] | undefined, field: FieldError["field"]): string | undefined {
  return errors?.find((e) => e.field === field)?.message;
}

/** Plain-English, jargon-free one-liner for the customer-facing tier, e.g.
 * "Recommended: 3072x2048 camera at ~850mm working distance". */
function plainSummary(result: CalculationResult): string | undefined {
  if (result.status !== "PASS" || !result.recommended?.selectedResolution) return undefined;
  const res = result.recommended.selectedResolution;
  const zNear = result.recommended.computation.Z_near;
  const distance = zNear !== undefined ? `~${Math.round(zNear)}mm working distance` : "an unspecified working distance";
  return `Recommended: ${res.horizontalPixels}×${res.verticalPixels} camera at ${distance}`;
}

/** Physical sensor dimensions, when the selected camera's database entry has them
 * (lib/cameraDatabase's optional sensorWidthMm/sensorHeightMm -- schema growth,
 * not populated for the current placeholder entries). */
function sensorSizeText(winner: PresetEvaluation): string {
  const res = winner.selectedResolution;
  if (res?.sensorWidthMm == null || res?.sensorHeightMm == null) return "Not specified in camera database";
  return `${fmt(res.sensorWidthMm, 2)} x ${fmt(res.sensorHeightMm, 2)} mm`;
}

/** Ground sample distance: mm of the part each pixel represents at the framed
 * distance, for the actual selected camera (not just the theoretical minimum
 * requirement). Pure display-layer derivation from already-computed values --
 * does not feed back into any pass/fail check. */
function gsdText(winner: PresetEvaluation): string {
  const res = winner.selectedResolution;
  const { W_req, H_req } = winner.computation;
  if (!res || W_req === undefined || H_req === undefined) return "—";
  const gsdH = W_req / res.horizontalPixels;
  const gsdV = H_req / res.verticalPixels;
  return `${fmt(gsdH, 4)} / ${fmt(gsdV, 4)} mm/px`;
}

function OrientationDiagram() {
  return (
    <svg viewBox="0 0 300 190" width="100%" height="auto" role="img" aria-labelledby="orientation-diagram-title">
      <title id="orientation-diagram-title">
        Diagram of part orientation relative to the left and right stereo cameras
      </title>
      {/* Cameras */}
      <rect x="70" y="14" width="26" height="18" rx="2" fill="#1d5fa3" />
      <text x="83" y="27" textAnchor="middle" fontSize="10" fill="#fff">
        L
      </text>
      <rect x="204" y="14" width="26" height="18" rx="2" fill="#1d5fa3" />
      <text x="217" y="27" textAnchor="middle" fontSize="10" fill="#fff">
        R
      </text>
      <line x1="96" y1="23" x2="204" y2="23" stroke="#5b6b7a" strokeDasharray="3 3" />
      <text x="150" y="14" textAnchor="middle" fontSize="9" fill="#5b6b7a">
        baseline
      </text>

      {/* Sight lines */}
      <line x1="83" y1="32" x2="150" y2="150" stroke="#c9d2da" />
      <line x1="217" y1="32" x2="150" y2="150" stroke="#c9d2da" />

      {/* Part: front face + depth face */}
      <rect x="105" y="95" width="90" height="55" fill="#e6f4ea" stroke="#2e7d43" strokeWidth="1.5" />
      <polygon
        points="105,95 122,80 212,80 195,95"
        fill="#f4f6f8"
        stroke="#2e7d43"
        strokeWidth="1.5"
      />
      <polygon
        points="195,95 212,80 212,135 195,150"
        fill="#eef1f3"
        stroke="#2e7d43"
        strokeWidth="1.5"
      />

      {/* Horizontal arrow (length) */}
      <line x1="105" y1="163" x2="195" y2="163" stroke="#1c2733" markerEnd="url(#arrow)" markerStart="url(#arrow)" />
      <text x="150" y="176" textAnchor="middle" fontSize="9" fill="#1c2733">
        Horizontal (Length)
      </text>

      {/* Vertical arrow (width) */}
      <line x1="92" y1="95" x2="92" y2="150" stroke="#1c2733" markerEnd="url(#arrow)" markerStart="url(#arrow)" />
      <text x="70" y="125" textAnchor="middle" fontSize="9" fill="#1c2733" transform="rotate(-90 70 125)">
        Vertical (Width)
      </text>

      {/* Depth arrow */}
      <line x1="220" y1="90" x2="220" y2="128" stroke="#1c2733" markerEnd="url(#arrow)" markerStart="url(#arrow)" />
      <text x="255" y="112" textAnchor="middle" fontSize="9" fill="#1c2733">
        Depth
      </text>
      <text x="255" y="123" textAnchor="middle" fontSize="9" fill="#1c2733">
        (Front-Back)
      </text>

      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#1c2733" />
        </marker>
      </defs>
    </svg>
  );
}

function StatusBadge({ status }: { status: CalculationResult["status"] }) {
  if (status === "PASS") {
    return <span className="status-badge pass">✔ PASS</span>;
  }
  if (status === "FAIL") {
    return <span className="status-badge fail">✖ FAIL</span>;
  }
  return <span className="status-badge no-config">⚠ NO VALID CONFIGURATION</span>;
}

export default function Page() {
  const [rawInputs, setRawInputs] = useState<RawCalculatorInputs>(EMPTY_INPUTS);
  const [symmetricTolerance, setSymmetricTolerance] = useState(true);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [isStale, setIsStale] = useState(false);

  function updateField(field: keyof RawCalculatorInputs, value: string) {
    setRawInputs((prev) => ({ ...prev, [field]: value }));
    if (result) setIsStale(true);
  }

  function updateSymmetricAccuracy(value: string) {
    setRawInputs((prev) => ({ ...prev, accuracyPlusMm: value, accuracyMinusMm: value }));
    if (result) setIsStale(true);
  }

  function toggleSymmetric(next: boolean) {
    setSymmetricTolerance(next);
    if (next) {
      // Re-entering symmetric mode: collapse back to a single value so the one
      // visible field isn't silently hiding a leftover asymmetric minus value.
      setRawInputs((prev) => ({ ...prev, accuracyMinusMm: prev.accuracyPlusMm }));
      if (result) setIsStale(true);
    }
  }

  function handleCalculate() {
    const next = calculate(rawInputs, PRESETS, RESOLUTIONS);
    setResult(next);
    setIsStale(false);
  }

  function handleReset() {
    setRawInputs(EMPTY_INPUTS);
    setResult(null);
    setIsStale(false);
  }

  const errors = result?.fieldErrors;
  const winner = result?.status === "PASS" ? result.recommended : undefined;
  const c = winner?.computation;

  return (
    <div className="page">
      <header className="header">
        <h1>Stereo Camera What-If Calculator</h1>
        <p className="purpose">
          Preliminary sizing check for machine-vision stereo camera setups.
        </p>
        <span className="internal-badge">Internal preliminary tool</span>
      </header>

      <div className="layout">
        <section className="panel" aria-label="Inputs">
          <h2>Part &amp; Accuracy Inputs</h2>

          <div className="field">
            <label htmlFor="partLengthMm">Part Length – Horizontal (mm)</label>
            <div className="input-row">
              <input
                id="partLengthMm"
                type="number"
                min="0"
                step="any"
                className={fieldError(errors, "partLengthMm") ? "has-error" : ""}
                value={rawInputs.partLengthMm}
                onChange={(e) => updateField("partLengthMm", e.target.value)}
              />
              <span className="unit">mm</span>
            </div>
            {fieldError(errors, "partLengthMm") && <div className="error-text">{fieldError(errors, "partLengthMm")}</div>}
          </div>

          <div className="field">
            <label htmlFor="partWidthMm">Part Width – Vertical (mm)</label>
            <div className="input-row">
              <input
                id="partWidthMm"
                type="number"
                min="0"
                step="any"
                className={fieldError(errors, "partWidthMm") ? "has-error" : ""}
                value={rawInputs.partWidthMm}
                onChange={(e) => updateField("partWidthMm", e.target.value)}
              />
              <span className="unit">mm</span>
            </div>
            {fieldError(errors, "partWidthMm") && <div className="error-text">{fieldError(errors, "partWidthMm")}</div>}
          </div>

          <div className="field">
            <label htmlFor="partDepthMm">Part Depth – Front to Back (mm)</label>
            <div className="input-row">
              <input
                id="partDepthMm"
                type="number"
                min="0"
                step="any"
                className={fieldError(errors, "partDepthMm") ? "has-error" : ""}
                value={rawInputs.partDepthMm}
                onChange={(e) => updateField("partDepthMm", e.target.value)}
              />
              <span className="unit">mm</span>
            </div>
            {fieldError(errors, "partDepthMm") && <div className="error-text">{fieldError(errors, "partDepthMm")}</div>}
          </div>

          <div className="field">
            <label htmlFor="symmetricTolerance" className="checkbox-label">
              <input
                id="symmetricTolerance"
                type="checkbox"
                checked={symmetricTolerance}
                onChange={(e) => toggleSymmetric(e.target.checked)}
              />
              Symmetric tolerance
            </label>
          </div>

          {symmetricTolerance ? (
            <div className="field">
              <label htmlFor="accuracySymmetricMm">Required Stereo Depth Accuracy (mm)</label>
              <div className="input-row">
                <input
                  id="accuracySymmetricMm"
                  type="number"
                  min="0"
                  step="any"
                  className={
                    fieldError(errors, "accuracyPlusMm") || fieldError(errors, "accuracyMinusMm") ? "has-error" : ""
                  }
                  value={rawInputs.accuracyPlusMm}
                  onChange={(e) => updateSymmetricAccuracy(e.target.value)}
                />
                <span className="unit">mm</span>
              </div>
              {(fieldError(errors, "accuracyPlusMm") || fieldError(errors, "accuracyMinusMm")) && (
                <div className="error-text">
                  {fieldError(errors, "accuracyPlusMm") ?? fieldError(errors, "accuracyMinusMm")}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="accuracyPlusMm">Required Stereo Depth Accuracy (+) (mm)</label>
                <div className="input-row">
                  <input
                    id="accuracyPlusMm"
                    type="number"
                    min="0"
                    step="any"
                    className={fieldError(errors, "accuracyPlusMm") ? "has-error" : ""}
                    value={rawInputs.accuracyPlusMm}
                    onChange={(e) => updateField("accuracyPlusMm", e.target.value)}
                  />
                  <span className="unit">mm</span>
                </div>
                {fieldError(errors, "accuracyPlusMm") && (
                  <div className="error-text">{fieldError(errors, "accuracyPlusMm")}</div>
                )}
              </div>

              <div className="field">
                <label htmlFor="accuracyMinusMm">Required Stereo Depth Accuracy (-) (mm)</label>
                <div className="input-row">
                  <input
                    id="accuracyMinusMm"
                    type="number"
                    min="0"
                    step="any"
                    className={fieldError(errors, "accuracyMinusMm") ? "has-error" : ""}
                    value={rawInputs.accuracyMinusMm}
                    onChange={(e) => updateField("accuracyMinusMm", e.target.value)}
                  />
                  <span className="unit">mm</span>
                </div>
                {fieldError(errors, "accuracyMinusMm") && (
                  <div className="error-text">{fieldError(errors, "accuracyMinusMm")}</div>
                )}
              </div>
            </>
          )}

          <div className="diagram-box" id="orientation-diagram-box" title="Part orientation relative to the left/right stereo cameras">
            <OrientationDiagram />
            <p className="caption">
              Horizontal, vertical, and depth axes relative to the left (L) and right (R) stereo cameras. For depth
              accuracy: <strong>(+)</strong> is how much the part is allowed to measure FARTHER than actual;{" "}
              <strong>(-)</strong> is how much it's allowed to measure CLOSER than actual.
            </p>
          </div>

          <details className="advanced-section">
            <summary>Advanced (engineering only)</summary>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="maxWorkingDistanceMm">Maximum Working Distance (mm), optional</label>
              <div className="input-row">
                <input
                  id="maxWorkingDistanceMm"
                  type="number"
                  min="0"
                  step="any"
                  className={fieldError(errors, "maxWorkingDistanceMm") ? "has-error" : ""}
                  value={rawInputs.maxWorkingDistanceMm}
                  onChange={(e) => updateField("maxWorkingDistanceMm", e.target.value)}
                />
                <span className="unit">mm</span>
              </div>
              {fieldError(errors, "maxWorkingDistanceMm") && (
                <div className="error-text">{fieldError(errors, "maxWorkingDistanceMm")}</div>
              )}
              <p className="hint" style={{ marginTop: 4 }}>
                Narrows the search on top of each rig&apos;s own mechanical limit (e.g. &quot;we only have 1.5m of
                clearance in this cell&quot;) -- it never loosens a preset&apos;s own limit.
              </p>
            </div>
          </details>

          <div className="button-row">
            <button type="button" className="primary" onClick={handleCalculate}>
              Calculate
            </button>
            <button type="button" className="secondary" onClick={handleReset}>
              Reset
            </button>
          </div>
        </section>

        <section aria-label="Results">
          {!result && (
            <div className="result-card">
              <p className="empty-state">Enter the four inputs and press Calculate to see a result.</p>
            </div>
          )}

          {result && (
            <div className={`result-card${isStale ? " stale" : ""}`}>
              {isStale && <div className="stale-banner">Inputs changed — press Calculate to refresh this result</div>}

              {/* ---------- Tier 1: always visible, meeting-ready ---------- */}
              <StatusBadge status={result.status} />

              {result.status === "PASS" && winner && (
                <>
                  <p className="plain-summary">{plainSummary(result)}</p>
                  <div className="result-grid">
                    <div className="result-item">
                      <div className="label">Recommended camera</div>
                      <div className="value">
                        {winner.selectedResolution?.name} ({fmt(winner.selectedResolution?.megapixels, 2)} MP)
                      </div>
                    </div>
                  </div>
                </>
              )}

              {(result.status === "FAIL" || result.status === "NO VALID CONFIGURATION") && (
                <div className="reason-box">{result.errorMessage}</div>
              )}

              <p className="disclaimer">{DISCLAIMER}</p>

              {/* ---------- Tier 2: collapsed engineering details ---------- */}
              {result.evaluations.length > 0 && (
                <details className="tech-details">
                  <summary>Show engineering details</summary>

                  {result.status === "PASS" && winner && (
                    <table className="tech-table">
                      <tbody>
                        <tr>
                          <th>Preset used</th>
                          <td>{winner.presetName}</td>
                        </tr>
                        <tr>
                          <th>Formula version</th>
                          <td>{winner.formulaVersion}</td>
                        </tr>
                        <tr>
                          <th>Near / Far distance</th>
                          <td>
                            {fmt(c?.Z_near)} / {fmt(c?.Z_far)} mm
                          </td>
                        </tr>
                        <tr>
                          <th>Baseline</th>
                          <td>{fmt(winner.baselineMm, 1)} mm</td>
                        </tr>
                        <tr>
                          <th>Required focal length</th>
                          <td>
                            {fmt(c?.f_req)} px
                            {c?.f_mm !== undefined ? ` (${fmt(c.f_mm, 2)} mm)` : " — Select sensor first"}
                          </td>
                        </tr>
                        <tr>
                          <th>Near / Far disparity</th>
                          <td>
                            {fmt(c?.d_near)} / {fmt(c?.d_far)} px
                          </td>
                        </tr>
                        <tr>
                          <th>Required pixels (N_x_req x N_y_req)</th>
                          <td>
                            {c?.N_x_req ?? "—"} x {c?.N_y_req ?? "—"}
                          </td>
                        </tr>
                        <tr>
                          <th>Sensor size</th>
                          <td>{sensorSizeText(winner)}</td>
                        </tr>
                        <tr>
                          <th>GSD (H / V)</th>
                          <td>{gsdText(winner)}</td>
                        </tr>
                        <tr>
                          <th>Predicted theoretical depth error</th>
                          <td>{fmtPlusMinus(c?.E_Z_plus, c?.E_Z_minus)}</td>
                        </tr>
                        <tr>
                          <th>Safety-adjusted depth error</th>
                          <td>{fmtPlusMinus(c?.E_safe_plus, c?.E_safe_minus)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}

                  <p style={{ marginTop: 12, marginBottom: 4, fontWeight: 600, fontSize: "0.85rem" }}>
                    All evaluated presets
                  </p>
                  <table className="preset-audit-table">
                    <thead>
                      <tr>
                        <th>Preset</th>
                        <th>Priority</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.evaluations.map((e) => (
                        <tr key={e.presetName}>
                          <td>{e.presetName}</td>
                          <td>{e.priority}</td>
                          <td>{e.passed ? "PASS" : `${e.errorCode}: ${e.errorMessage}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
