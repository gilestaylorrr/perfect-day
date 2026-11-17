# Perfect Day - build plan

Each step is small enough for one branch. Steps marked **Outline** need a
detailed proposal approved before any code is written.

Status: `[x]` done, `[ ]` not started, `[~]` in progress.

---

## Milestone 0 - Foundations

- [x] 0.1 pnpm workspace (`pnpm-workspace.yaml` with `apps/*` and `packages/*`), `.node-version`,
      `packageManager` field, `.gitignore`
- [x] 0.2 `apps/web` scaffolded with Vite (React + TypeScript), package name `web`
- [x] 0.3 Shared `tsconfig.base.json`; `apps/web` configs extend it; `typecheck` scripts
- [x] 0.4 oxlint (root `.oxlintrc.json`), stylelint, Prettier, and CSS Modules with PostCSS set up; pre-push hook
      runs typecheck, lint, format check and tests
- [x] 0.5 CI workflow: format check, lint, typecheck, test, build. Branch protection on `main` not set up yet;
      work on feature branches

---

## Milestone 1 - `@perfect-day/grid-format`

The file format shared by the pipeline (writes it) and the web app (reads it).

**File layout (version 1)**

| Part        | Contents                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------- |
| Magic bytes | 4 ASCII bytes `PDAY`, so the app can reject a file that isn't ours                          |
| Version     | `uint16`, currently `1`                                                                     |
| Header size | `uint32`, length in bytes of the JSON header that follows                                   |
| Header      | UTF-8 JSON (`GridHeader`), padded with spaces so the data block starts on a 4-byte boundary |
| Data block  | For each time step, for each variable (in header order): `rows × cols` values               |

Values within a block are row-major: row 0 is the southernmost row, column 0 the westernmost.
All multi-byte numbers are little-endian. Each variable block is padded to a 4-byte boundary so typed
arrays can view it without copying.

### [x] 1.1 Variables and value quantisation

Create the package and the rules for converting real values to stored whole numbers and back.

- Package `packages/grid-format`: name `@perfect-day/grid-format`, private, `"type": "module"`,
  `exports` pointing at `./src/index.ts`, scripts `lint`, `typecheck` (`tsc --noEmit`),
  `test` (`vitest run`), `test:watch` (`vitest`). Vitest as a dev dependency of this package only.
- `tsconfig.json` extends the base; `target` ES2022, `lib` `["ES2022"]`, `module` ESNext,
  `moduleResolution` Bundler, `noEmit`, `include` `["src"]`.
- Move the oxlint config from `apps/web` to the root so all packages share it. `typescript` and `oxlint` are
  dev dependencies of the package too, so its `typecheck` and `lint` scripts can run.
- `src/variables.ts`: `StorageType` (`"int16" | "uint8"`), `VariableSpec` (`type`, `scale`, `unit`),
  `VARIABLES` defined `as const satisfies Record<string, VariableSpec>`:
  - `temperature`: int16, scale 10, °C
  - `cloudCover`: uint8, scale 1, %
  - `windSpeed`: uint8, scale 1, km/h
  - `precipitationProbability`: uint8, scale 1, %
  - `sunshine`: uint8, scale 1, `min` (minutes of sunshine per hour)
  - `VariableName` = `keyof typeof VARIABLES`
- `src/quantise.ts`: `NO_DATA` (int16 -32768, uint8 255); valid ranges excluding NO_DATA
  (int16 -32767..32767, uint8 0..254); `quantise(value: number | null, spec)` returns NO_DATA for
  null or non-finite values, otherwise `Math.round(value × scale)` clamped to the valid range;
  `dequantise(stored, spec)` returns null for NO_DATA, otherwise `stored / scale`.
- `src/index.ts` re-exports both modules.
- Tests: 12.3°C round-trips; -4.7 stores as -47; round-trip error within half a step; null and NaN
  store as NO_DATA and read back as null; wind 300 clamps to 254 and -5 to 0.
- Root `"test": "pnpm -r test"`; add `pnpm test` to CI after typecheck.

**Done when:** all checks pass and five tests pass in `@perfect-day/grid-format`.

### [ ] 1.2 Grid geometry and indexing

- `src/grid.ts`:
  - `GridGeometry`: `origin` (`{ lat, lon }` of the south-west point), `step` (degrees), `rows`, `cols`
  - `pointCount(geometry)`
  - `cellIndex(geometry, row, col)` → index within one variable block (row-major)
  - `pointLatLon(geometry, row, col)` → `{ lat, lon }`
  - `nearestCell(geometry, lat, lon)` → `{ row, col }` or `null` if outside the grid
- Throw a clear error for out-of-range rows or columns in `cellIndex`.
- Tests: corners, a middle point, rounding to the nearest cell, points outside the grid.

**Done when:** all checks pass; geometry functions fully tested.

### [ ] 1.3 Header type and validation

- `src/header.ts`:
  - `GridHeader`: `version`, `generatedAt` (ISO string), `geometry` (`GridGeometry`),
    `times` (ISO strings, one per time step, in order), `variables` (array of `VariableName`, in file
    order), `source` (attribution text)
  - `FORMAT_VERSION = 1`, `MAGIC = "PDAY"`
  - `validateHeader(value: unknown): GridHeader` - hand-written checks, no dependencies. Throws a
    clear error naming the first problem found.
- `TextEncoder` and `TextDecoder` exist in both browsers and Node but aren't in the ES2022 lib.
  Add a minimal ambient declaration for them in this package (`src/text-codec.d.ts`) rather than
  adding DOM or Node types.
- Tests: a valid header passes; each missing or wrong field fails with a useful message; unknown
  variable names fail.

**Done when:** all checks pass; validation covers every field.

### [ ] 1.4 Encoder

- `src/encode.ts`: `encode(header: GridHeader, data: RawGridData): Uint8Array` where `RawGridData`
  gives, for each variable and time step, an array of `rows × cols` real values (`number | null`).
- Writes the layout described at the top of this milestone: magic, version, header size, padded JSON
  header, then the padded data blocks, quantising each value with `quantise`.
- Throw a clear error if any array has the wrong length or a variable is missing.

**Done when:** all checks pass; tests check the magic bytes, version, header size, padding and
alignment, and the stored value at known positions.

### [ ] 1.5 Decoder

- `src/decode.ts`: `decode(bytes: ArrayBuffer): Grid`
  - checks the magic bytes and version, with clear errors for "not a Perfect Day file" and
    "unsupported version N"
  - validates the header with `validateHeader`
  - `Grid` exposes `header` and `get(variable, timeIndex): Float32Array` returning real values,
    with `NaN` for missing data. Create views over the buffer with typed arrays (no copying), and
    convert to real units lazily, caching each converted block.
- Round-trip tests: encode then decode gives back every value within half a step; missing values
  come back as `NaN`; a file with wrong magic or a newer version is rejected.

**Done when:** all checks pass; round-trip tests cover every variable and several time steps.

### [ ] 1.6 Interpolation

- `src/interpolate.ts`: `valueAt(grid, variable, timeIndex, lat, lon): number` using bilinear
  interpolation between the four surrounding grid points. Returns `NaN` outside the grid or if any
  of the four points is missing.
- Tests: exactly on a grid point; halfway between two points; centre of a cell; edges; outside.

**Done when:** all checks pass. Milestone 1 complete: add a short section to the root README
describing the format and why it's a custom binary format rather than JSON.

---

## Milestone 2 - `@perfect-day/scoring`

The "how perfect is this morning" score, shared so the app and any pipeline summaries agree.

### [ ] 2.1 Preferences and the score function

- New package `packages/scoring` set up like `grid-format`. Depends on nothing.
- `Preferences`: ideal temperature range (default 10-16°C), and a weight of 0-1 for each of
  temperature, cloud, wind and rain.
- `scoreMorning(conditions, preferences): number` returning 0-100, where `conditions` has
  temperature, cloud cover, wind speed, precipitation probability and sunshine minutes.
  Each factor gives a 0-1 sub-score (for example temperature is 1 inside the ideal range and falls
  away smoothly outside it); combine them as a weighted average.
- Also return the sub-scores, so the app can explain a score ("Lost points for wind").
- Tests: a perfect morning scores near 100; heavy rain scores low; weights of 0 remove a factor;
  scores always stay in 0-100.

### [ ] 2.2 Scoring a whole grid

- `scoreGrid(grid, timeIndex, preferences): Float32Array` scoring every grid point for one time step
  in a tight loop over typed arrays (no per-point object creation).
- Benchmark test (Vitest `bench`) on a full-size grid, recorded in the README later.
- Add `@perfect-day/grid-format` as a workspace dependency (`"workspace:*"`).

---

## Milestone 3 - `@perfect-day/pipeline`

### [ ] 3.1 Grid definition and land mask - Outline

- New package `packages/pipeline`; runs TypeScript with `tsx`.
- UK grid: latitude 49.75-61.0, longitude -8.5-2.0, step 0.25°.
- Keep only points on land or within about 15 km of the coast, using a simplified coastline
  (Natural Earth, public domain). Generate the list of kept points once and commit it as a small
  JSON file, so every pipeline run requests the same points.
- **Rate-limit budget:** Open-Meteo's free tier allows 10,000 calls a day, and each location in a
  multi-location request counts towards that (check the docs for the exact weighting). Keep
  `points × runs per day` comfortably under the limit - for example about 1,200 points × 4 runs.

### [ ] 3.2 Fetching the forecast - Outline

- Request the kept points in batches (at most 1,000 locations per request) from the forecast API:
  `hourly=temperature_2m,cloud_cover,wind_speed_10m,precipitation_probability,sunshine_duration`,
  `timezone=Europe/London`, `forecast_days=7`.
- Keep only the morning hours, 07:00-10:00 local time (4 per day, 28 time steps).
- Convert sunshine from seconds to minutes. Map results back onto the full grid, with `null` for
  points not requested.
- Retry with backoff on failure; fail the run clearly if data is incomplete.
- Tests use a recorded fixture response, never the live API.

### [ ] 3.3 Writing the output - Outline

- Encode with `@perfect-day/grid-format` and write to `data/` (git-ignored):
  - `forecast.<short-hash>.bin` - the grid, with a content hash in the name so it can be cached forever
  - `manifest.json` - `generatedAt`, format version and the current file name. The app fetches this
    first, uncached, to find the latest file.
- A CLI entry point: `pnpm --filter @perfect-day/pipeline run fetch`.

### [ ] 3.4 Towns list - Outline

- Preprocess Ordnance Survey Open Names (Open Government Licence) into `towns.json`: name,
  latitude, longitude and a size rank, cities and towns only, a few thousand entries.
- Generated once by a script and committed; credit OS in the README and the app.

### [ ] 3.5 Scheduled data and deploy workflow - Outline

- Host on GitHub Pages. One workflow, triggered by a schedule (every 6 hours), manually, and on
  pushes to `main`: run the pipeline, build the web app with the data files in its public folder,
  and deploy.
- Fail the deploy if the pipeline output is missing, empty or older than expected.

---

## Milestone 4 - The core experience

### [ ] 4.1 Loading data in a web worker - Outline

- A web worker fetches `manifest.json` then the grid file, decodes it and keeps it in memory.
- Typed messages between the app and worker (one shared TypeScript union of message types).
- Loading, error and "data is out of date" states in the UI.

### [ ] 4.2 Finding the user's location - Outline

- Ask for geolocation with a clear explanation; never ask on page load without context.
- Fallback place search using the Open-Meteo geocoding API, limited to the UK.

### [ ] 4.3 The text answer - Outline

- Using `valueAt` and `scoreGrid`, show: "Your best morning this week is Thursday, 7-9am:
  13°C, sunny, light breeze." Plus, when somewhere within a set distance scores clearly better:
  "For a perfect Saturday morning, head to <town>, 25 miles away."
- Text first, before any map. Announced politely to screen readers when it changes.

### [ ] 4.4 The table view - Outline

- Every morning this week for the user's location, and the best nearby places, as an accessible,
  sortable table.

---

## Milestone 5 - The map

### [ ] 5.1 Coastline and canvas map - Outline

- Simplified UK and Ireland outline (Natural Earth) drawn on canvas, with correct scaling for
  high-density screens and responsive resizing.

### [ ] 5.2 Score layer and legend - Outline

- Draw the score for every grid point for the selected morning, smoothly shaded, with a
  colour-blind-safe scale that works in light and dark mode, and a legend.

### [ ] 5.3 Morning slider and URL state - Outline

- Keyboard-friendly slider through the 28 morning hours, optional play/pause (respecting reduced
  motion). Location, morning and preferences stored in the URL hash.

---

## Milestone 6 - Personalisation and performance

### [ ] 6.1 Preference controls - Outline

- Sliders for ideal temperature and how much the user minds wind, cloud and rain. Rescoring runs in
  the worker; the UI stays responsive while dragging.

### [ ] 6.2 Performance budgets - Outline

- Measure and document against these budgets:
  - text answer within 1.5 s on a mid-range phone over 4G
  - slider and preference changes at 60 fps (rescoring a morning in under 16 ms)
  - JavaScript under about 100 KB compressed
- Record before-and-after numbers for each optimisation in the README.

---

## Milestone 7 - Quality

### [ ] 7.1 Playwright end-to-end tests - Outline

- Main journeys: allow location, search a place, change the morning, open the table view.
- Uses a fixture grid file so tests don't depend on live data. Runs as a separate CI job.

### [ ] 7.2 Accessibility pass - Outline

- axe checks in Playwright; full keyboard use; visible focus; screen reader announcements;
  reduced motion; dark mode; colour contrast.

### [ ] 7.3 README and release - Outline

- What it is, a screenshot or GIF, the live link, architecture overview, the data format, key
  decisions and trade-offs, performance results, accessibility approach, credits
  (Open-Meteo CC BY 4.0, Ordnance Survey OGL, Natural Earth), and what's next.

---

## Stretch goals

- **Replay a past spring:** use Open-Meteo historical data to publish "best mornings of April
  2025", so the app is useful out of season.
- **Season presets:** perfect crisp winter morning, perfect summer evening.
- **Flowering layer:** iNaturalist reports of bluebells or blossom in flower nearby, with a clear
  note that sightings reflect where people looked.
- **Plain-English question box:** "Where's best within an hour's drive on Sunday?" turned into
  structured settings by a model. Needs a small serverless function so no API key is exposed.

---

## Decisions log

Add a line for each decision: date, decision, and why.

- Custom binary file format instead of JSON: about 6 bytes per point per time step, read straight
  into typed arrays without parsing.
- Scoring lives in its own package (`@perfect-day/scoring`) rather than inside `grid-format`: the format
  shouldn't know what the data means.
- The browser never calls the forecast API for the grid: one published file avoids rate limits
  and keeps the app fast.
- Hosting on GitHub Pages, with the pipeline and deploy in one scheduled workflow.
- 2026-11-17: oxlint instead of ESLint, with stylelint for CSS. Faster, and rules are built in rather
  than added through plugins. The oxlint config lives at the root and every package shares it.
- 2026-11-17: Internal packages list `typescript` and `oxlint` as their own dev dependencies, at the
  same versions as `apps/web`, so their `typecheck` and `lint` scripts can run.
- 2026-11-17: Package scope `@perfect-day/*`, to match the repo.
- 2026-11-17: `const` arrow functions everywhere, enforced by `func-style`. This matches the house
  style in other Audio Network repos.
- 2026-11-17: In `grid-format`, types and constants stay in the module that defines them (no shared
  `types.ts` or `constants.ts` yet), and `RANGE` stays private to `quantise.ts`. Split if files grow.
- 2026-11-17: `quantise` and `dequantise` take positional arguments: two parameters of different
  types, called once per grid cell in tight loops.
