# Stereo Camera What-If Calculator

Internal preliminary sizing tool for machine-vision stereo camera setups. Given a
part's size and a required stereo depth accuracy, it checks the part against a
set of pre-approved internal engineering presets and reports whether a
configuration is theoretically achievable, with which resolution and
approximate focal length.

**This is not a customer-facing tool, and its output is not a final camera/lens
spec.** See the disclaimer shown under every result.

## ⚠️ Placeholder configuration — engineering sign-off required

Every numeric value in [`lib/settings.ts`](lib/settings.ts) (the three presets:
Compact, Standard, Long Baseline) and every resolution in
[`lib/resolutions.ts`](lib/resolutions.ts) is a **placeholder**, marked inline
with:

```ts
// TBD — pending Gary/engineering approval, see spec Section 11.1
```

Do not treat any calculator output as trustworthy until these two files have
been reviewed and the placeholder values replaced with approved numbers. The
UI itself does not warn per-result which config values are placeholders — that
review has to happen at the code level, by someone reading these two files.

`maxSupportedDisparityPx` on all three presets was raised (400/500/600 →
900/1100/1500) after initial testing showed tight accuracy asks (e.g. 1mm)
failed `ERR-07` across the board at the original values. These are still
unverified placeholders, not a measured stereo-matching search-range limit —
flag this specifically during the Section 11.1 review.

## How it works

1. The user enters five numbers: part length, part width, part depth, and the
   required stereo depth accuracy as two separate magnitudes — **(+)** how far
   the part is allowed to measure *farther* than actual, and **(-)** how far
   it's allowed to measure *closer* than actual (all mm). A "Symmetric
   tolerance" checkbox, checked by default, collapses these into a single
   visible field and mirrors its value into both internally — the common case
   stays a one-field experience; unchecking it reveals the two fields
   independently for the asymmetric case. These are the *only* user-editable
   inputs — everything else (presets, resolution list) is fixed in code.
2. [`lib/calculator.ts`](lib/calculator.ts) validates the inputs, then runs the
   formula chain from spec Sections 5-6 against every active preset in
   [`lib/settings.ts`](lib/settings.ts), in priority order.
3. For each preset, it works out the required working distance; a focal length
   driven by whichever accuracy bound is stricter (in pixels, and in mm if the
   preset has a known pixel pitch); required sensor resolution; and a
   predicted/safety-adjusted depth error *for each side*, checking both
   independently against the matching accuracy bound (see "Errors" below).
4. If more than one preset passes, the tie-break order is: preset priority →
   smaller listed resolution → shorter working distance → smaller baseline.
5. If nothing passes, the overall result is **NO VALID CONFIGURATION**.

The calculation function is pure and deterministic: the same five inputs plus
the same `settings.ts`/`resolutions.ts` content always produce the same
result — no randomness, no dates, no network calls.

### Asymmetric depth accuracy

The original spec had a single symmetric `RequiredAccuracy`. This is a
**superset generalization, not a redefinition**: entering the same value for
both (+) and (-) — which is what the "Symmetric tolerance" checkbox does by
default — reproduces the original formula's numbers exactly (`f_req`,
`N_x_req`, `N_y_req`, `d_near`, `d_far` are unaffected; only the accuracy stage
became two-sided). See the regression test in
[`lib/calculator.test.ts`](lib/calculator.test.ts) that checks this directly.

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

- **Presets** (baseline, FOV limits, safety factor, disparity limits, etc.):
  edit [`lib/settings.ts`](lib/settings.ts). Each preset needs every field in
  `PresetConfig` (see [`lib/types.ts`](lib/types.ts)); an incomplete or
  out-of-range preset is skipped at runtime with `ERR-10` rather than crashing
  or silently guessing a default.
- **Resolution list**: edit [`lib/resolutions.ts`](lib/resolutions.ts).
  `horizontalPixels`/`verticalPixels` are separate integers — never parse them
  back out of the display `name` string. `megapixels` is derived automatically
  from the pixel counts.
- Neither file is reachable from the UI. There is no admin screen and no
  database; config changes only take effect through a code change and
  redeploy.

## Testing

```bash
npm run test        # runs lib/calculator.test.ts once
npm run test:watch  # watch mode
```

The test suite ([`lib/calculator.test.ts`](lib/calculator.test.ts)) covers:

- Determinism (same inputs + config → identical output)
- The symmetric case (`accuracyPlus == accuracyMinus`) reproduces the original
  single-accuracy formula's numbers exactly — the regression check proving the
  asymmetric generalization didn't change existing behavior
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
  directly against `checkDepthAccuracy` (see "Known formula property" above)
- Division-by-zero / floating-point-extreme cases fail gracefully (`ERR-08`,
  `ERR-10`) instead of throwing or returning `NaN`/`Infinity` to the UI
- One sample case each for: PASS, resolution failure (`ERR-06`), disparity-range
  failure (`ERR-07`), and working-distance failure (`ERR-05`)
- The four-tier tie-break order

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

If both accuracy bounds fail at once (`ERR-04a`+`ERR-04b`, or `ERR-09a`+`ERR-09b`),
both messages are shown together rather than only the first one found.

## Known formula property (not a bug)

Algebraically, once a preset clears the working-distance and disparity-range
gates, whichever accuracy bound is stricter (drives `f_req = max(f_req_plus,
f_req_minus)`) lands its own `E_safe` almost exactly on its own target — by
construction of the `f_req` formula, not with margin below it — while the
*other* bound always comes in comfortably under its own target with real room
to spare. This generalizes the original single-accuracy formula's property the
same way: `ERR-09a`/`ERR-09b` are still implemented exactly as specified (with
a small floating-point epsilon — see the comment above `E_SAFE_EPSILON` in
`lib/calculator.ts`) so they continue to catch any preset config or input
combination that pushes past that boundary, but in the common case neither is
the binding constraint — `ERR-05`/`ERR-06`/`ERR-07` usually are. Because a
*natural* end-to-end scenario where either side genuinely fails essentially
can't occur once the earlier gates pass, the ERR-09a/ERR-09b branches
themselves are unit-tested directly against the extracted `checkDepthAccuracy`
helper with synthetic values (see `lib/calculator.test.ts`) rather than through
a contrived full pipeline run.

## What this tool does not do (out of scope)

No accounts/auth/roles, no database or saved history, no automatic camera/lens
shopping, no lighting/spectral logic, and no AI or external API calls in the
calculation path. It also does not model lens distortion, motion blur,
occlusion, ambient lighting, calibration error, or robot/positioning
uncertainty — see spec Section 10.2.
