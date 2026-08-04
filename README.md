# Stereo Camera What-If Calculator

Internal preliminary sizing tool for machine-vision stereo camera setups. Given a
part's size and a required stereo depth accuracy, it checks the part against a
set of pre-approved internal engineering presets and reports whether a
configuration is theoretically achievable, with which resolution and
approximate focal length — with a "customer meeting, quick answer" primary view
and a one-click-away engineering detail tier for verifying the number before a
purchasing conversation.

**This is not a customer-facing tool, and its output is not a final camera/lens
spec.** See the disclaimer shown under every result.

## ⚠️ Placeholder configuration — engineering sign-off required

Every numeric value in [`lib/engineering/presets.ts`](lib/engineering/presets.ts)
(the three presets: Compact, Standard, Long Baseline) and every resolution in
[`lib/cameraDatabase/resolutions.ts`](lib/cameraDatabase/resolutions.ts) is a
**placeholder**, marked inline with:

```ts
// TBD — pending Gary/engineering approval, see spec Section 11.1
```

Do not treat any calculator output as trustworthy until these two files have
been reviewed and the placeholder values replaced with approved numbers. The
UI itself does not warn per-result which config values are placeholders — that
review has to happen at the code level, by someone reading these two files.

`maxDisparityRangePx` (the disparity-span limit — see "The disparity-range fix"
below) is currently 128/192/256 for Compact/Standard/Long Baseline, chosen as
round numDisparities-style values, not measured against real hardware. Flag
this specifically during the Section 11.1 review.

## How it works

1. The user enters the four required numbers — part length, part width, part
   depth, and the required stereo depth accuracy as two separate magnitudes:
   **(+)** how far the part is allowed to measure *farther* than actual, and
   **(-)** how far it's allowed to measure *closer* than actual (all mm). A
   "Symmetric tolerance" checkbox, checked by default, collapses these into a
   single visible field and mirrors its value into both internally — the
   common case stays a one-field experience; unchecking it reveals the two
   fields independently for the asymmetric case. A 5th, optional,
   "Advanced (engineering only)" input — Maximum Working Distance — is
   collapsed and off by default; see below. These are the *only*
   user-editable inputs — everything else (presets, camera database) is fixed
   in code.
2. [`lib/recommendation/calculate.ts`](lib/recommendation/calculate.ts)
   validates the inputs, then runs the formula chain from spec Sections 5-6
   against every active preset in
   [`lib/engineering/presets.ts`](lib/engineering/presets.ts), in priority
   order.
3. For each preset, it works out the required working distance; a focal length
   driven by whichever accuracy bound is stricter (in pixels, and in mm if the
   preset has a known pixel pitch); required sensor resolution; and a
   predicted/safety-adjusted depth error *for each side*, checking both
   independently against the matching accuracy bound (see "Errors" below).
4. If more than one preset passes, the tie-break order is: preset priority →
   smaller listed resolution → shorter working distance → smaller baseline.
5. If nothing passes, the overall result is **NO VALID CONFIGURATION**.

The calculation function is pure and deterministic: the same inputs plus the
same config content always produce the same result — no randomness, no dates,
no network calls.

### Two-tier presentation: quick answer vs. engineering verification

The result card is split so a live customer meeting only ever surfaces
"PASS, here's the camera," while the full depth of the prior build stays one
click away for whoever needs to verify the number before a purchasing
conversation:

- **Always visible:** the four inputs, PASS/FAIL/NO VALID CONFIGURATION status,
  the recommended camera resolution + megapixels, a one-line plain-English
  summary (e.g. "Recommended: 3072×2048 camera at ~850mm working distance"),
  and the permanent theoretical-result disclaimer.
- **Behind "Show engineering details" (collapsed by default):** which preset
  was used, near/far distances, baseline, focal length, near/far disparities,
  sensor size, GSD (ground sample distance), formula version, the predicted
  and safety-adjusted depth error, and the full per-preset PASS/FAIL/reason
  breakdown for every evaluated preset — the same auditable detail the
  ERR-09/disparity-span reasoning has always needed to stay traceable.

Sensor size and GSD are new: sensor size reads the camera database's optional
`sensorWidthMm`/`sensorHeightMm` (shows "Not specified in camera database" for
today's placeholder entries, since none populate it yet). GSD (mm of the part
per pixel, at the framed distance) is a pure display-layer derivation —
`W_req / selectedResolution.horizontalPixels` and the vertical equivalent — and
does not feed back into any pass/fail check or touch the physics/engineering
formulas.

### Optional "Maximum Working Distance" advanced input

Collapsed under "Advanced (engineering only)," off by default. When provided,
it **adds** an extra ceiling on top of (never instead of) each preset's own
`maxNearDistanceMm`:

```
effective max = min(preset.maxNearDistanceMm, userMaxWorkingDistanceMm ?? Infinity)
```

This lets an engineer narrow the search (e.g. "we only have 1.5m of clearance
in this cell") without inventing a new formula or bypassing a preset's own
mechanical limit — it can only make the effective ceiling *tighter*, never
looser. If this constraint alone is why every preset fails,
[`runCalculation`](lib/recommendation/runCalculation.ts) re-evaluates every
preset *without* the ceiling to confirm the part would otherwise be
achievable, and reports the specific next-shortest achievable distance instead
of the generic "no configuration" message:

> No preset fits within the specified maximum working distance; the
> next-shortest achievable distance is 800 mm with the Long Baseline setup.

If the part wouldn't work regardless of working-distance room (e.g. the
resolution requirement is unmet on its own), the generic message is shown
instead — the tool never suggests "just get more clearance" when that
wouldn't actually fix it.

### Why presets aren't derived from part size

The three presets (Compact/Standard/Long Baseline) encode real mechanical and
optical constraints — baseline, FOV limits, achievable near/far working
distance, disparity-processing range — that come from *the physical rig and
lens options actually available*, not from the geometry of whatever part is
being measured. A part-size-ratio formula ("pick baseline proportional to part
width," etc.) would produce a baseline or working-distance number no physical
camera rig actually has, silently reintroducing the "invented constants"
problem the original spec explicitly prohibited. Presets stay backend-only
config, auto-selected by the existing preferred-answer tie-break, and
deliberately out of the primary customer-facing UI — the customer doesn't need
to know which rig was used, just whether a real one exists that works (Tier 2
still shows which preset was used, for the engineer verifying the number).
**Do not replace this file with a derived-from-part-size formula** without
first getting new rig/lens data from engineering to encode as a new preset.

### The disparity-range fix

The stereo-processing disparity gate (`ERR-07`) checks the SPAN of disparities
the matcher has to search across the part's near-to-far depth —
`d_near - d_far` — against `preset.maxDisparityRangePx`, not the absolute
near-disparity value. This matches how real stereo-matching algorithms are
actually configured (a search-window/`numDisparities` range, e.g. OpenCV's
`StereoSGBM`), not an absolute per-pixel cap. An earlier version of this
checked `d_near > maxSupportedDisparityPx` directly; that's a **span** check
now, deliberately, and should not be reverted to an absolute check.
[`lib/engineering/gates.ts`](lib/engineering/gates.ts) has the check;
[`lib/recommendation/recommendation.test.ts`](lib/recommendation/recommendation.test.ts)
has a dedicated test proving a high absolute `d_near` alone does *not* fail
the gate when the span stays small (shallow depth).

### Asymmetric depth accuracy

The original spec had a single symmetric `RequiredAccuracy`. This is a
**superset generalization, not a redefinition**: entering the same value for
both (+) and (-) — which is what the "Symmetric tolerance" checkbox does by
default — reproduces the original formula's numbers exactly (`f_req`,
`N_x_req`, `N_y_req`, `d_near`, `d_far` are unaffected; only the accuracy stage
became two-sided). See the regression test in
[`lib/recommendation/recommendation.test.ts`](lib/recommendation/recommendation.test.ts)
that checks this directly.

The formula chain:

```
E_design_plus  = AccuracyPlus  / SafetyFactor
E_design_minus = AccuracyMinus / SafetyFactor
f_req_plus  = delta_d * Z_far * (Z_far + E_design_plus)  / (B * E_design_plus)
f_req_minus = delta_d * Z_far * (Z_far + E_design_minus) / (B * E_design_minus)
f_req = max(f_req_plus, f_req_minus)   // the stricter bound drives resolution
```

`N_x_req`, `N_y_req`, `d_near`, `d_far`, `Z_low`, `Z_high` are then computed
exactly as before from this single shared `f_req`. The depth-accuracy pass
check is then split two ways instead of collapsed into one:

```
E_Z_plus  = Z_low - Z_far
E_Z_minus = Z_far - Z_high
E_safe_plus  = SafetyFactor * E_Z_plus
E_safe_minus = SafetyFactor * E_Z_minus
```

A preset only passes the depth-accuracy gate when **both**
`E_safe_plus <= AccuracyPlus` **and** `E_safe_minus <= AccuracyMinus` hold.

## Code organization

```
lib/
  types.ts               Shared types for every layer below.
  errors.ts               Shared ErrorCode -> message lookup.
  physics/                 Pure stereo equations only (Z = f*B/d, disparity-to-
                            depth-error relationships). No assumptions, no
                            config values baked in -- every value is a function
                            parameter.
  engineering/              The assumption layer: presets.ts (config data),
                            framing margin logic, the E_design/f_req
                            derivation, resolution/pixel requirement
                            calculation, PASS rule evaluation (gates.ts), and
                            the preferred-answer tie-break. This is where
                            preset config gets applied to lib/physics.
  cameraDatabase/           The camera/resolution catalog (resolutions.ts).
                            Schema includes optional sensorWidthMm/
                            sensorHeightMm/pixelPitchUm/manufacturer/model/
                            priceUsd fields for forward-looking growth into a
                            real camera catalog.
  recommendation/            Top-level orchestration: evaluatePreset (the only
                            place that calls both lib/engineering and
                            lib/cameraDatabase), selectResolution,
                            runCalculation (all-presets + tie-break + result
                            assembly), and calculate (the UI's entry point).
```

Each preset evaluation follows physics → engineering → (camera database via
`selectResolution`) → result assembly, in that order, so any layer can be
audited independently against spec Sections 5-6.

## Running it

```bash
npm install
npm run dev      # starts the dev server at http://localhost:3000
```

```bash
npm run build     # production build
npm run start      # serve the production build
```

## Editing the configuration

- **Presets** (baseline, FOV limits, safety factor, disparity range, etc.):
  edit [`lib/engineering/presets.ts`](lib/engineering/presets.ts). Each preset
  needs every field in `PresetConfig` (see [`lib/types.ts`](lib/types.ts)); an
  incomplete or out-of-range preset is skipped at runtime with `ERR-10` rather
  than crashing or silently guessing a default. See "Why presets aren't
  derived from part size" above before proposing to replace this file with a
  formula.
- **Camera/resolution database**: edit
  [`lib/cameraDatabase/resolutions.ts`](lib/cameraDatabase/resolutions.ts).
  `horizontalPixels`/`verticalPixels` are separate integers — never parse them
  back out of the display `name` string. `megapixels` is derived
  automatically from the pixel counts. `sensorWidthMm`/`sensorHeightMm`/
  `pixelPitchUm`/`manufacturer`/`model`/`priceUsd` are optional — populate
  them per-entry as real camera data becomes available; nothing requires them
  today.
- Neither file is reachable from the UI. There is no admin screen and no
  database; config changes only take effect through a code change and
  redeploy.

## Testing

```bash
npm run test        # runs every lib/**/*.test.ts file once
npm run test:watch  # watch mode
```

[`lib/physics/stereo.test.ts`](lib/physics/stereo.test.ts) covers the pure
equations directly. The main suite,
[`lib/recommendation/recommendation.test.ts`](lib/recommendation/recommendation.test.ts),
covers:

- Determinism (same inputs + config → identical output)
- The symmetric case (`accuracyPlus == accuracyMinus`) reproduces the original
  single-accuracy formula's numbers exactly — the regression check proving the
  asymmetric generalization didn't change existing behavior
- The disparity-range fix is a SPAN check, not an absolute-value check: a high
  absolute `d_near` alone does not fail the gate when the span stays small
- Monotonicity invariants: tightening AccuracyPlus alone, tightening
  AccuracyMinus alone, higher disparity uncertainty, and higher safety factor
  never *improve* the result
- `f_req = max(f_req_plus, f_req_minus)` is actually exercised, with cases
  where each side visibly dominates the other
- Near disparity > far disparity whenever depth > 0
- Selected resolution is never smaller than the computed requirement
- PASS is impossible when either safety-adjusted error exceeds its own
  requested accuracy
- `ERR-09a`/`ERR-09b` branch logic, including both firing at once, tested
  directly against `checkDepthAccuracy` (see "Known formula property" below)
- Division-by-zero / floating-point-extreme cases fail gracefully (`ERR-08`,
  `ERR-10`) instead of throwing or returning `NaN`/`Infinity` to the UI
- One sample case each for: PASS, resolution failure (`ERR-06`), disparity-range
  failure (`ERR-07`), and working-distance failure (`ERR-05`)
- The four-tier tie-break order
- The optional maximum working distance: it adds a ceiling on top of (never
  instead of) a preset's own limit, and the "next-shortest achievable"
  message only appears when the ceiling is genuinely the sole blocker
- A regression check against the real placeholder config (not just the test
  fixture preset) for a known 250×150×200mm @ 1mm reference case

## Errors

| Code | Message |
|---|---|
| ERR-01 | Enter a valid positive part length. |
| ERR-02 | Enter a valid positive part width. |
| ERR-03 | Part depth cannot be negative. |
| ERR-04a | Enter a valid positive required stereo depth accuracy (+). |
| ERR-04b | Enter a valid positive required stereo depth accuracy (-). |
| ERR-05 | The required working distance exceeds the approved machine limit. |
| ERR-06 | No listed resolution meets the calculated horizontal and vertical pixel requirement. |
| ERR-07 | Near disparity exceeds the configured stereo processing range. |
| ERR-08 | Far disparity is too small for the configured disparity uncertainty. |
| ERR-09a | The safety-adjusted theoretical depth error exceeds the requested accuracy (+). |
| ERR-09b | The safety-adjusted theoretical depth error exceeds the requested accuracy (-). |
| ERR-10 | The selected engineering preset is incomplete or invalid. |
| ERR-11 | No approved internal preset passes this request. |
| ERR-12 | Enter a valid positive maximum working distance, or leave it blank. |

If both accuracy bounds fail at once (`ERR-04a`+`ERR-04b`, or `ERR-09a`+`ERR-09b`),
both messages are shown together rather than only the first one found. When
`ERR-11` is caused solely by the optional maximum-working-distance ceiling, the
message is replaced with the more specific "next-shortest achievable distance"
text described above.

## Known formula property (not a bug)

Algebraically, once a preset clears the working-distance and disparity-range
gates, whichever accuracy bound is stricter (drives `f_req = max(f_req_plus,
f_req_minus)`) lands its own `E_safe` almost exactly on its own target — by
construction of the `f_req` formula, not with margin below it — while the
*other* bound always comes in comfortably under its own target with real room
to spare. This generalizes the original single-accuracy formula's property the
same way: `ERR-09a`/`ERR-09b` are still implemented exactly as specified (with
a small floating-point epsilon — see the comment above `E_SAFE_EPSILON` in
[`lib/engineering/gates.ts`](lib/engineering/gates.ts)) so they continue to
catch any preset config or input combination that pushes past that boundary,
but in the common case neither is the binding constraint —
`ERR-05`/`ERR-06`/`ERR-07` usually are. Because a *natural* end-to-end scenario
where either side genuinely fails essentially can't occur once the earlier
gates pass, the ERR-09a/ERR-09b branches themselves are unit-tested directly
against the extracted `checkDepthAccuracy` helper with synthetic values (see
`lib/recommendation/recommendation.test.ts`) rather than through a contrived
full pipeline run.

## What this tool does not do (out of scope)

No accounts/auth/roles, no database or saved history, no automatic camera/lens
shopping, no lighting/spectral logic, and no AI or external API calls in the
calculation path. It also does not model lens distortion, motion blur,
occlusion, ambient lighting, calibration error, or robot/positioning
uncertainty — see spec Section 10.2.
