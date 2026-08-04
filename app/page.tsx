"use client";

import { useState } from "react";
import { calculate } from "@/lib/calculator";
import { PRESETS } from "@/lib/settings";
import { RESOLUTIONS } from "@/lib/resolutions";
import type { CalculationResult, FieldError, RawCalculatorInputs } from "@/lib/types";

const EMPTY_INPUTS: RawCalculatorInputs = {
  partLengthMm: "",
  partWidthMm: "",
  partDepthMm: "",
  requiredAccuracyMm: "",
};

const DISCLAIMER =
  "Preliminary theoretical stereo-camera requirement based on the current internal " +
  "engineering settings. Final camera, lens and accuracy must be confirmed through " +
  "calibration and physical prototype testing.";

function fmt(n: number | undefined, decimals = 1): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fieldError(errors: FieldError[] | undefined, field: FieldError["field"]): string | undefined {
  return errors?.find((e) => e.field === field)?.message;
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
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [isStale, setIsStale] = useState(false);

  function updateField(field: keyof RawCalculatorInputs, value: string) {
    setRawInputs((prev) => ({ ...prev, [field]: value }));
    if (result) setIsStale(true);
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
          Preliminary sizing check for machine-vision stereo camera setups against approved engineering presets.
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
                className={fieldError(errors, "partDepthMm") ? "has-error" : ""}
                value={rawInputs.partDepthMm}
                onChange={(e) => updateField("partDepthMm", e.target.value)}
              />
              <span className="unit">mm</span>
            </div>
            {fieldError(errors, "partDepthMm") && <div className="error-text">{fieldError(errors, "partDepthMm")}</div>}
          </div>

          <div className="field">
            <label htmlFor="requiredAccuracyMm">Required Stereo Depth Accuracy (mm)</label>
            <div className="input-row">
              <input
                id="requiredAccuracyMm"
                type="number"
                min="0"
                className={fieldError(errors, "requiredAccuracyMm") ? "has-error" : ""}
                value={rawInputs.requiredAccuracyMm}
                onChange={(e) => updateField("requiredAccuracyMm", e.target.value)}
              />
              <span className="unit">mm</span>
            </div>
            {fieldError(errors, "requiredAccuracyMm") && (
              <div className="error-text">{fieldError(errors, "requiredAccuracyMm")}</div>
            )}
          </div>

          <div className="diagram-box" id="orientation-diagram-box" title="Part orientation relative to the left/right stereo cameras">
            <OrientationDiagram />
            <p className="caption">
              Horizontal, vertical, and depth axes relative to the left (L) and right (R) stereo cameras.
            </p>
          </div>

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

              <StatusBadge status={result.status} />

              {result.status === "PASS" && winner && (
                <>
                  <div className="result-grid">
                    <div className="result-item">
                      <div className="label">Recommended preset</div>
                      <div className="value">{winner.presetName}</div>
                    </div>
                    <div className="result-item">
                      <div className="label">Selected resolution</div>
                      <div className="value">
                        {winner.selectedResolution?.name} ({fmt(winner.selectedResolution?.megapixels, 2)} MP)
                      </div>
                    </div>
                    <div className="result-item">
                      <div className="label">Baseline</div>
                      <div className="value">{fmt(winner.baselineMm, 1)} mm</div>
                    </div>
                    <div className="result-item">
                      <div className="label">Near / Center / Far distance</div>
                      <div className="value">
                        {fmt(c?.Z_near)} / {fmt(c?.Z_center)} / {fmt(c?.Z_far)} mm
                      </div>
                    </div>
                    <div className="result-item">
                      <div className="label">Required focal length</div>
                      <div className="value">
                        {fmt(c?.f_req)} px
                        {c?.f_mm !== undefined ? ` (${fmt(c.f_mm, 2)} mm)` : " — Select sensor first"}
                      </div>
                    </div>
                    <div className="result-item">
                      <div className="label">Predicted / safety-adjusted depth error</div>
                      <div className="value">
                        {fmt(c?.E_Z, 3)} / {fmt(c?.E_safe, 3)} mm
                      </div>
                    </div>
                  </div>
                </>
              )}

              {(result.status === "FAIL" || result.status === "NO VALID CONFIGURATION") && (
                <div className="reason-box">
                  {result.errorMessage}
                  {result.status === "NO VALID CONFIGURATION" && (
                    <ul>
                      {result.evaluations.map((e) => (
                        <li key={e.presetName}>
                          {e.presetName}: {e.errorMessage ?? "unknown reason"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {result.status === "PASS" && winner && (
                <details className="tech-details">
                  <summary>Technical details</summary>
                  <table className="tech-table">
                    <tbody>
                      <tr>
                        <th>Formula version</th>
                        <td>{winner.formulaVersion}</td>
                      </tr>
                      <tr>
                        <th>Near distance (Z_near)</th>
                        <td>{fmt(c?.Z_near)} mm</td>
                      </tr>
                      <tr>
                        <th>Far distance (Z_far)</th>
                        <td>{fmt(c?.Z_far)} mm</td>
                      </tr>
                      <tr>
                        <th>Near disparity (d_near)</th>
                        <td>{fmt(c?.d_near)} px</td>
                      </tr>
                      <tr>
                        <th>Far disparity (d_far)</th>
                        <td>{fmt(c?.d_far)} px</td>
                      </tr>
                      <tr>
                        <th>Required pixels (N_x_req x N_y_req)</th>
                        <td>
                          {c?.N_x_req ?? "—"} x {c?.N_y_req ?? "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {result.evaluations.length > 1 && (
                    <>
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
                    </>
                  )}
                </details>
              )}

              <p className="disclaimer">{DISCLAIMER}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
