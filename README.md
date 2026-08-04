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

1. The user enters four numbers: part length, part width, part depth, and the
   required stereo depth accuracy (all mm). These are the *only* user-editable
   inputs — everything else (presets, resolution list) is fixed in code.
2. [`lib/calculator.ts`](lib/calculator.ts) validates the inputs, then runs the
   formula chain from spec Sections 5-6 against every active preset in
   [`lib/settings.ts`](lib/settings.ts), in priority order.
3. For each preset, it works out the required working distance, focal length
   (in pixels, and in mm if the preset has a known pixel pitch), required
   sensor resolution, and predicted/safety-adjusted depth error, and checks it
   against six pass conditions (see "Errors" below).
4. If more than one preset passes, the tie-break order is: preset priority →
   smaller listed resolution → shorter working distance → smaller baseline.
5. If nothing passes, the overall result is **NO VALID CONFIGURATION**.

The calculation function is pure and deterministic: the same four inputs plus
the same `settings.ts`/`resolutions.ts` content always produce the same
result — no randomness, no dates, no network calls.

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
- Monotonicity invariants (tighter accuracy, higher disparity uncertainty, and
  higher safety factor never *improve* the result)
- Near disparity > far disparity whenever depth > 0
- Selected resolution is never smaller than the computed requirement
- PASS is impossible when the safety-adjusted error exceeds the requested
  accuracy
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
| ERR-04 | Enter a valid positive required stereo depth accuracy. |
| ERR-05 | The required working distance exceeds the approved machine limit. |
| ERR-06 | No listed resolution meets the calculated horizontal and vertical pixel requirement. |
| ERR-07 | Near disparity exceeds the configured stereo processing range. |
| ERR-08 | Far disparity is too small for the configured disparity uncertainty. |
| ERR-09 | The safety-adjusted theoretical depth error exceeds the requested accuracy. |
| ERR-10 | The selected engineering preset is incomplete or invalid. |
| ERR-11 | No approved internal preset passes this request. |

## Known formula property (not a bug)

Algebraically, once a preset clears the working-distance and disparity-range
gates, `E_safe` (the safety-adjusted depth error) works out to
`SafetyFactor * RequiredAccuracy / SafetyFactor` — i.e. it lands almost exactly
on the requested accuracy by construction of the `f_req` formula, rather than
somewhere below it with margin. `ERR-09` is still implemented exactly as
specified (with a small floating-point epsilon — see the comment above
`E_SAFE_EPSILON` in `lib/calculator.ts`) so it continues to catch any preset
config or input combination that pushes past that boundary, but in the common
case it is not the binding constraint — `ERR-05`/`ERR-06`/`ERR-07` usually are.

## What this tool does not do (out of scope)

No accounts/auth/roles, no database or saved history, no automatic camera/lens
shopping, no lighting/spectral logic, and no AI or external API calls in the
calculation path. It also does not model lens distortion, motion blur,
occlusion, ambient lighting, calibration error, or robot/positioning
uncertainty — see the "What this tool does and does not prove" note on the
page itself, and spec Section 10.2.
