# GeoPulse: algorithms, scientific approaches, and system basis

**Audience:** domain scientists, GIS/remote-sensing reviewers, and technical
evaluators
**Prepared:** 2026-11-23
**Basis:** inspection of the active application code, Supabase Edge Functions,
shared methods, tests, and source documentation in this repository snapshot.

## 1. Executive summary

GeoPulse combines geocoding, satellite-derived spectral statistics, weather
provider data, configurable threshold alerts, mapping/GIS utilities, and
language-model-generated explanations.

The implemented quantitative methods are:

- Normalized Difference Vegetation Index (NDVI)
- Green/NIR Normalized Difference Water Index (NDWI)
- Normalized Burn Ratio (NBR)
- Before/after NDVI change using relative-percent or near-zero
  percentage-point calculations
- AOI summary statistics and valid-pixel coverage
- A sparse least-squares linear trend extrapolation
- Rule-based threshold alerting, severity bands, and haversine distance

The code does **not** implement a named physical law or mechanistic
hydrological, ecological, or radiative-transfer model. The indices are
reflectance-ratio indicators; their environmental interpretation is
context-dependent and must be empirically validated for a specific use.
Application thresholds are software rules, not universal scientific limits.

AI-generated narrative is a separate layer from measurement. It does not
become measured data merely because it describes measurements. The current
repository does not establish ground-truth accuracy, forecast skill, hazard
alert skill, or fitness for public-safety use.

## 2. System architecture and information flow

1. **Place search and AOI:** browser-side OpenStreetMap Nominatim search
   returns named places, coordinates, bounds, and sometimes actual polygon
   GeoJSON. Geometry and coordinates are validated. If a valid boundary is
   unavailable, the request can remain point-based; no boundary is invented.
2. **Satellite analysis:** the Supabase `analyze-satellite` Edge Function
   selects Sentinel-2 MSI L2A for study starts on/after 2015-06-23. Earlier
   study starts use date-appropriate Landsat Collection 2 Level-2 data through
   Google Earth Engine. It requests area statistics for before/after windows
   and may request one or two interior samples.
3. **Narrative:** Groq receives the measured values when available, or an
   instruction to state that measurements are unavailable. A numeric guard
   checks percentages and index-like values in generated text, retries once,
   and replaces mismatched numerical narrative with a deterministic summary.
   This guard does not validate scientific reasoning, causal claims, or
   recommendations.
4. **Weather and alerts:** `ingest-weather` stores Open-Meteo API responses.
   `evaluate-hazards` selects a nearby stored record and applies the
   configured metric/operator/threshold. An optional Groq explanation is
   generated after the rule triggers; it is not the trigger calculation.
5. **Map and reports:** MapLibre displays base maps, NASA GIBS context
   products, imported GIS layers, and provider or generated visualizations.
   Reports/export views can combine measured fields, provenance, model text,
   and visualization panels; each has a different evidentiary status.

The result schema identifies field origins as measured, model-generated,
geocoded, or unavailable. In satellite analysis, numeric satellite fields
are nulled when the analysis method is `model_only`.

## 3. Satellite data products and processing

### 3.1 Sources and mission bands

| Product path | Source | Bands used |
|---|---|---|
| Recent study starts | Sentinel-2 MSI L2A through Copernicus Data Space / Sentinel Hub | B03 green, B04 red, B08 NIR, B12 SWIR2 |
| Historical periods | Landsat Collection 2 Level-2 through Earth Engine | TM/ETM+: SR_B2 green, SR_B3 red, SR_B4 NIR, SR_B7 SWIR2; OLI/TIRS: SR_B3 green, SR_B4 red, SR_B5 NIR, SR_B7 SWIR2 |

Landsat Level-2 surface reflectance is scaled before index calculations:

`reflectance = DN * 0.0000275 - 0.2`

Mission start dates used for Landsat selection are TM 1982-08-22, ETM+
1999-04-15, and OLI/TIRS 2013-02-11. No explicit spectral bandpass
harmonization correction between missions is applied.

### 3.2 AOI, grid, masks, and summary statistics

- If no boundary geometry is supplied, the default AOI is a coordinate
  rectangle with half-width `0.05°` in latitude and longitude. Ground
  dimensions vary with latitude; it is not an equal-area fixed-kilometer
  footprint.
- Statistics request a `128 × 128` aggregation grid. This does not imply
  128-by-128 independent native-resolution pixels. Sentinel-2 native
  resolution is 10 m for B02/B03/B04/B08 and 20 m for B11/B12; effective
  support depends on AOI, sensor, service resampling, and aggregation.
- Sentinel-2 statistics have a 60% scene-level maximum-cloud-coverage filter.
  The evalscript masks SCL classes 3, 8, 9, and 10 (cloud shadow, cloud, and
  cirrus classes). SCL class 11 (snow/ice) is not included in that exclusion
  list.
- Landsat pixels are masked using QA_PIXEL bits 0–5, covering fill, dilated
  cloud, cirrus, cloud, cloud shadow, and snow.
- The service returns NDVI, NDWI, and NBR mean/min/max for its aggregation
  interval. Valid-pixel ratio is computed from valid and no-data/sample
  counts (Sentinel Hub) or valid and total counts (Earth Engine).
- Earth Engine uses a median temporal composite and region reducers for
  mean/min/max/count on EPSG:3857 at a computed scale based on the larger AOI
  dimension divided by 128.

These are provider processing settings and code choices. Their values do not
by themselves establish local suitability or accuracy.

## 4. Spectral indices and interpretations

| Index | Equation | Bands in this implementation | Scientific interpretation |
|---|---|---|---|
| NDVI | `(NIR - Red) / (NIR + Red)` | Sentinel-2 B08/B04; mission-specific Landsat NIR/red | Spectral contrast commonly used as a vegetation-greenness proxy. It is not a direct measurement of biomass, crop yield, ecosystem health, or land-cover class. |
| NDWI | `(Green - NIR) / (Green + NIR)` | Sentinel-2 B03/B08; mission-specific Landsat green/NIR | Green/NIR water/moisture contrast variant. Other indices are also called NDWI, including SWIR-based variants; this implementation is specifically green/NIR. |
| NBR | `(NIR - SWIR2) / (NIR + SWIR2)` | Sentinel-2 B08/B12; mission-specific Landsat NIR/SWIR2 | Burn/vegetation-condition spectral proxy. The analysis does not calculate differenced NBR (dNBR), so it does not produce a dNBR burn-severity method. |

The UI displays simplified mean-value interpretation bands:

- NDVI: `<=0.2`, `<=0.5`, and `>0.5`
- NDWI: `<=0`, `<=0.3`, and `>0.3`
- NBR: `<=-0.25`, `<=0.1`, and `>0.1`

These labels are not locally calibrated land-cover, water, or burn-severity
classifications. They should not be read as universal ecological thresholds.

## 5. Temporal comparison and trend method

### 5.1 Before/after windows

- The requested end date is capped at the current time.
- A midpoint divides the study interval into before and after windows.
- Each side is capped at 90 days; a valid measured comparison requires NDVI in
  both windows and valid-pixel ratio strictly greater than 0.10 in each.
- If the gap between the windows exceeds 20 days, one interior interval may be
  sampled; if it exceeds 60 days, two may be sampled. Each interior interval
  is centered within the gap and at most 40 days wide.
- Interior samples are omitted if unavailable or if their valid-pixel ratio
  does not exceed 0.10.

### 5.2 NDVI change

Let `b` be before-window mean NDVI and `a` be after-window mean NDVI:

```text
delta = a - b
if abs(b) > 0.05:
    change = 100 * delta / abs(b)   # relative percent
else:
    change = 100 * delta            # percentage points
```

The unit changes for a near-zero baseline. That distinction must remain
visible in downstream reports and comparisons.

### 5.3 Former linear regression/projection path (disabled)

The former implementation formed points from baseline `(month 0, change 0)`,
retained interior samples, and the final measured endpoint. Time was converted
to approximate months using 30 days/month, then fit with an ordinary
least-squares line:

```text
beta1 = (n*sum(x*y) - sum(x)*sum(y)) / (n*sum(x*x) - sum(x)^2)
beta0 = mean(y) - beta1*mean(x)
projection_h = beta0 + beta1*(last_month + h), h in {6, 12}
```

Trend direction is improving for slope `> +0.1`, declining for slope
`< -0.1`, and stable otherwise. Slope units follow the change calculation:
relative-percent units per approximate month, or percentage-point units per
month for the near-zero case.

This projection path is disabled in the current API. The `predictiveModeling`
field is null, its provenance is unavailable, and no R²-derived confidence is
returned. The former `100 * R²` value described fit to sparse points only; it
was not forecast confidence, a probability, a prediction interval, or an
uncertainty bound. Any future projection feature requires independent
time-series validation before release.

## 6. Severity and threshold-alert algorithms

### 6.1 Satellite NDVI severity

Severity is derived from the absolute measured NDVI change:

| Absolute change | Label |
|---:|---|
| `<3%` | low |
| `3% to <8%` | medium |
| `8% to <15%` | high |
| `>=15%` | critical |

This is an application rule, not a standardized hazard scale or locally
validated impact category.

### 6.2 Weather threshold evaluation

- Active user-configured thresholds specify a hazard label, metric,
  comparison operator (`>`, `<`, `>=`, `<=`), and value.
- The evaluator searches a geographic bounding box, computes great-circle
  distance with the haversine formula using Earth radius 6,371 km, and selects
  the nearest stored weather record within 25 km.
- `daily_rain_sum` is extracted from the daily provider response for the date
  matching Open-Meteo `current.time`. Other metrics are read from stored
  observation columns.
- No maximum record-age cutoff is implemented. Alert descriptions include
  provider source/time and record-ingestion time so these can be reviewed;
  the alert may still be based on stale data.
- An unresolved alert for the same threshold suppresses another alert.

Hazard severity uses:

```text
ratio = abs(value - threshold) / max(abs(threshold), 1)
```

The label is low through `0.3`, moderate above `0.3`, high above `0.75`, and
critical above `1.5`. This is symmetric distance from the threshold and does
not encode whether a high or low value is hazardous. It is not a calibrated
risk score.

There is no hazard-specific physical model, probability of exceedance,
return-period analysis, exposure/vulnerability calculation, or documented
threshold calibration procedure in this evaluator.

## 7. Weather products, maps, GIS, and other algorithms

### Weather

Open-Meteo requests include current temperature, relative humidity, rain,
10 m wind speed, and 0–7 cm soil moisture, plus daily maximum/minimum
temperature, rain sum, and maximum wind. The request asks for 7 past days and
3 forecast days. GeoPulse stores the provider response and an ingestion
timestamp. `current.rain` is the preceding model interval's precipitation,
not the daily sum. These are provider API products, not measurements from
GeoPulse-operated field instruments.

### Context imagery and visualization

- NASA GIBS context layers: MODIS/Terra 8-day NDVI, daily land-surface
  temperature, and GPM IMERG precipitation rate. These differ in sensor,
  resolution, temporal support, and meaning from AOI-specific
  Sentinel/Landsat statistics.
- Sentinel visualization evalscripts render true color, false color, NDVI,
  NDWI, or NBR using provider imagery and SCL cloud masking. Color thresholds
  are display palettes, not a scientific classification.
- When explicitly allowed by a caller, Gemini 2.5 Flash Image generates
  prompt-based illustrations for visualization types that the data providers
  do not supply (and as a fallback when provider imagery is unavailable). It
  may draw requested maps, charts, dashboards, risk zones, or causal
  infographics from prompt text, but does not calculate or verify those
  outputs. It can invent geographic features, numbers, legends, and causal
  explanations. Its outputs are labeled as Gemini-generated illustrations,
  not satellite data. The PDF report caller now disables that fallback.
- 3D terrain/hillshade is a map visualization based on elevation tiles, not a
  geomorphological model.

### Geospatial handling

The browser supports documented Shapefile, GeoJSON, KML/KMZ, CSV
coordinate/WKT, and selected GeoTIFF imports. `proj4` is used for supported
coordinate-system transformations. GeoTIFF import is an image overlay and
does not expose raster pixel values to the analysis algorithms. GeoTIFF
export is a rendered EPSG:3857 RGB map snapshot, not an analytical
measurement raster.

### Search and file analysis

- Nominatim geocodes explicit place-name searches and reverse lookups; it is
  not a scientific boundary model. A returned point does not imply a
  validated analysis area.
- File analysis sends up to three image files to a vision-capable language
  model. For non-image files it sends file descriptions and, for the first
  data file, at most 500 characters. It does not parse GeoTIFF pixels,
  shapefile features, raster bands, or full tabular files for scientific
  calculations.
- File-analysis severity, recommendations, and any confidence value are
  model-generated. A returned confidence value is labeled as an uncalibrated
  self-report; missing/invalid confidence is not replaced with a score.
- AI-generated satellite narratives use a Groq model chain and retry policy.
  The numeric guard checks extracted percentages to 0.1 and index values to
  0.005 tolerance, retries once, and can replace the narrative. It is not a
  general factuality detector.
- Gemini image generation is not needed for report tables or measured charts.
  PDF tables and the measured NDVI chart are rendered locally from the
  structured analysis response; optional provider imagery is retrieved
  separately and omitted/marked unavailable if no source-backed image returns.

## 8. Theoretical basis: what is and is not encoded

The scientific basis in code consists of established remote-sensing index
definitions and statistical/geospatial procedures:

- **Spectral reflectance contrast:** normalized differences compare selected
  visible, NIR, and SWIR reflectance bands. The indices exploit different
  surface spectral responses, but do not invert a radiative-transfer model
  or correct all atmospheric, illumination, soil-background, canopy,
  topographic, or sensor effects themselves.
- **Descriptive statistics:** provider/Earth Engine reducers summarize
  spatial/temporal samples as mean, minimum, maximum, and coverage.
- **Ordinary least squares:** a statistical line summarizes sparse temporal
  samples and is extrapolated. No causal mechanism or seasonality model is
  included.
- **Geodesic approximation:** haversine distance estimates point-to-point
  great-circle distance for choosing nearby observations.
- **Rule-based thresholds:** comparisons and fixed ratio bins implement
  application policy. They are not probabilistic risk theory or validated
  hazard science.

No named physical law or mechanistic environmental theory is explicitly
implemented in the application logic. In particular, this code does not
implement a hydrological rainfall-runoff model, drought-balance model,
ecosystem-process model, crop-yield model, flood-inundation model, radiative-
transfer inversion, or causal attribution method. Provider datasets may
themselves rely on scientific models; those provider methodologies are
external to GeoPulse and are not independently reimplemented or validated
here.

## 9. Inactive or unsupported capabilities

- A source component defines K-means, ISODATA, maximum-likelihood, Random
  Forest, and SVM choices with 2–15 classes, but it has no active UI render
  call site. The backend feature gate is false, and no classifier is executed.
  No training data, labels, fitting, confusion matrix, or accuracy metrics
  exist in the active workflow.
- Pixel-wise change detection/change matrix are not produced; the active
  analysis function returns null for change-detection output.
- Drought and flood labels in the alert UI are not backed by dedicated,
  validated physical hazard models.
- No performance or accuracy claims are supported by the repository's tests.
  Existing tests exercise selected helpers and mocked provider responses;
  they do not establish ground-truth accuracy or real-world forecast/alert
  skill.

## 10. Scientific interpretation and release limits

Until a pilot-specific independent validation protocol is completed:

- Describe satellite indices as measured spectral indicators, not direct
  measures of ecosystem condition, drought, crop yield, or land-cover change.
- Do not treat sparse regression or projection as a current output: the
  projection path is disabled pending independent validation.
- Treat alert severities as configured rule outcomes, not risk probabilities.
- Keep provider/context imagery, AI-generated text, unavailable measurements,
  and measured statistics distinct in interface, reports, and exports.
- Do not use the system as an official warning or life-safety service.

For the chosen Ghana research pilot, AOI, vegetation target, reference data,
validation metrics, and numeric acceptance limits still require agreement
with the named partner and an independent scientific reviewer.

## 11. Source-code references

- Satellite indices, filtering, and statistics:
  [`sentinel-statistics.ts`](../supabase/functions/_shared/sentinel-statistics.ts),
  [`earth-engine-statistics.ts`](../supabase/functions/_shared/earth-engine-statistics.ts)
- Temporal calculations and configuration:
  [`satellite-analysis.ts`](../supabase/functions/_shared/satellite-analysis.ts),
  [`analysis-constants.ts`](../supabase/functions/_shared/analysis-constants.ts)
- Hazard and distance rules:
  [`hazard-severity.ts`](../supabase/functions/_shared/hazard-severity.ts),
  [`evaluate-hazards`](../supabase/functions/evaluate-hazards/index.ts)
- Weather ingestion:
  [`ingest-weather`](../supabase/functions/ingest-weather/index.ts)
- AI file analysis:
  [`analyze-files`](../supabase/functions/analyze-files/index.ts),
  [`FileUploadAnalysis.tsx`](../src/components/FileUploadAnalysis.tsx)
- User-facing early-warning limitations:
  [`EarlyWarningPage.tsx`](../src/pages/EarlyWarningPage.tsx)
- Existing source notes:
  [`DATA_SOURCES.md`](./DATA_SOURCES.md),
  [`PAPER_CLAIMS.md`](./PAPER_CLAIMS.md)
