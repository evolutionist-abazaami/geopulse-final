# GeoPulse scientific methods and system assessment

**Review basis:** active frontend, Supabase Edge Functions, shared analysis code,
tests, and repository documentation in this snapshot. This is a code review,
not independent validation of deployed services, output accuracy, or a
manuscript. The repository contains no manuscript to audit.

## Executive assessment

GeoPulse is a geospatial monitoring and reporting application that can obtain
satellite-derived area statistics, ingest Open-Meteo weather data, evaluate
user-configured threshold alerts, display NASA context layers, and generate
AI-written explanations. Its strongest scientific safeguard is separating
measured satellite values from model-generated narrative and leaving measured
numeric fields unavailable when the measurement path cannot produce results.

The implemented science is principally **spectral-index calculation,
temporal summary statistics, simple linear regression, and rule-based alert
logic**. No named physical law or mechanistic environmental theory is encoded.
The indices are remote-sensing proxies; the alert cutoffs and interpretation
bands are application rules, not validated universal scientific thresholds.

Several advanced methods are not active: a classification-controls component
exists in source but has no active render call site, and the satellite
endpoint gates classification and change detection off and returns null
results for those methods. Uploaded non-image files are not geospatially
parsed or scientifically analyzed; the AI sees at most a short text sample.
Consequently, outputs should be treated as monitoring indicators and
illustrative decision support, not validated hazard forecasts or causal
environmental findings.

## System flow and output meaning

1. **Find a place:** the browser calls OpenStreetMap Nominatim. It validates
   coordinates and polygon geometry, retains real returned boundaries, and
   can proceed with a point when no boundary is supplied. The selected
   geometry or point buffer becomes the satellite area of interest (AOI).
2. **Analyze satellite data:** `analyze-satellite` requests two temporal
   windows of satellite statistics. It uses Sentinel-2 MSI L2A for study
   starts on/after June 23, 2015, and Landsat Collection 2 Level-2 via Google
   Earth Engine for earlier starts. It optionally samples one or two
   intermediate periods, computes indices and change/trend summaries, and
   sends measured values (or an explicit no-measurement statement) to Groq
   for narrative text.
3. **Guard the narrative:** reported percentages and NDVI/NDWI/NBR decimals
   are checked against measured values. The function retries once with a
   stricter prompt, then replaces a still-mismatched narrative with a
   deterministic measured summary. This is a numeric consistency check, not
   scientific fact-checking of prose or recommendations.
4. **Ingest weather and evaluate alerts:** `ingest-weather` fetches current
   and daily Open-Meteo data for configured points. `evaluate-hazards` finds a
   nearby weather record, evaluates its selected metric against a configured
   threshold/operator, assigns a rule-based severity, and may attach a
   separately identified Groq assessment.
5. **Show context and export:** NASA GIBS MODIS vegetation, land-surface
   temperature, and GPM IMERG precipitation are map context layers, not
   selected-AOI analysis results. GeoTIFF import is for display, not raster
   pixel analysis; map export is a georeferenced rendered image.

Result origin is represented as measured, model-generated, geocoded, or
unavailable. The satellite endpoint nulls numeric satellite fields when its
analysis method is `model_only`; its narrative may still be generated. A
model's self-reported confidence is not a calibrated probability.

## Implemented algorithms and equations

### Spectral indices

Indices use satellite surface-reflectance bands at the pixel/evaluation level;
the service returns summary statistics over the AOI and time window:

| Index | Implemented equation | Bands / intended interpretation |
|---|---|---|
| NDVI | `(NIR - Red) / (NIR + Red)` | Sentinel-2 B08 and B04; Landsat mission-specific NIR and red. Vegetation greenness proxy. |
| NDWI | `(Green - NIR) / (Green + NIR)` | Sentinel-2 B03 and B08; Landsat mission-specific green and NIR. Water/moisture contrast proxy. This is the green/NIR variant, not the SWIR-based index also called NDWI by some authors. |
| NBR | `(NIR - SWIR2) / (NIR + SWIR2)` | Sentinel-2 B08 and B12; Landsat mission-specific NIR and SWIR2. Burn/vegetation condition proxy. |

For each output, mean/min/max are read from Sentinel Hub statistics or
calculated using Earth Engine reducers. The UI interprets the mean using
fixed bands: NDVI at 0.2 and 0.5; NDWI at 0 and 0.3; NBR at -0.25 and 0.1.
These are simplified display labels, not locally calibrated land-cover or
burn-severity classifications. The NBR values are not differenced into dNBR
by the analysis endpoint.

### Temporal comparison and trend

- The requested period is capped at the current time. A midpoint separates
  the before and after windows; each side is at most 90 days. Invalid/future-
  only periods do not yield windows.
- For a valid before/after pair, NDVI change is:
  - `100 * (after - before) / abs(before)` if `abs(before) > 0.05`;
  - `100 * (after - before)` otherwise, reported as percentage points.
- Up to two interior samples are selected depending on the gap between the
  before/after windows: one if the gap exceeds 20 days, two if it exceeds
  60 days. Each is centered within its gap and at most 20 days wide on each
  side. Only samples with valid NDVI and more than 10% valid-pixel coverage
  are retained.
- The previous implementation fitted an ordinary least-squares line to at
  most four sparse samples and extrapolated 6 and 12 months. That projection
  and its `100 * R²` field were disabled because the sparse fit does not
  establish forecast skill or uncertainty. Current responses retain measured
  temporal samples but set `predictiveModeling` to null with unavailable
  provenance; no forecast confidence is emitted.

### Severity and alert rules

- Satellite severity uses absolute measured NDVI change: low below 3%;
  medium from 3% to below 8%; high from 8% to below 15%; critical at 15% or
  greater. This is an application threshold, not a standardized hazard scale.
- Hazard operators are `>`, `<`, `>=`, and `<=`. The observation is selected
  as the nearest available record within 25 km, using the haversine
  great-circle distance formula with Earth radius 6,371 km.
- Hazard severity is calculated from
  `abs(value - threshold) / max(abs(threshold), 1)`. It is low through 0.3,
  moderate above 0.3, high above 0.75, and critical above 1.5 (strict
  boundary comparisons).
- `daily_rain_sum` is read from the matching date in the stored Open-Meteo
  daily response. Other metrics are read from weather-observation columns.
  Alert descriptions now include provider source/time and record-ingestion
  time. There is still no maximum observation-age filter. An unresolved alert
  for the same threshold suppresses another alert.

Alert severity is symmetric distance from the threshold, regardless of
whether crossing above or below is dangerous. There are no hazard-specific
threshold sets, units validation, normalization, exposure/vulnerability
model, or documented calibration procedure in this logic. Treat the severity
label as a configured rule outcome, not a quantified risk estimate.

### Image/rendering and geospatial utilities

- Landsat Collection 2 Level-2 surface reflectance is scaled as
  `DN * 0.0000275 - 0.2` before indices are calculated. QA_PIXEL bits 0–5
  (fill, dilated cloud, cirrus, cloud, cloud shadow, snow) are masked.
- AOI distance uses the haversine formula above. Polygon bounds/area
  calculations and geometry validation are handled in shared GeoJSON
  utilities; coordinate projection for GIS import uses `proj4`.
- Map terrain is a shaded-relief visualization of elevation tiles, not a
  geomorphological model. Sentinel true/false-color and index maps are
  provider-rendered products. Other visualization types can use Gemini image
  generation when explicitly requested, but those outputs are illustrations,
  not measurements. The report generator now explicitly disables AI-generated
  illustration fallback.

## Active configuration parameters

Values below are defined in
[`analysis-constants.ts`](../supabase/functions/_shared/analysis-constants.ts)
unless a source is stated otherwise.

| Parameter | Value | Effect / qualification |
|---|---:|---|
| Point AOI half-width | 0.05 degrees per side | Point buffer is a degree-based bounding box; its ground dimensions vary by latitude. |
| Statistics grid | 128 × 128 | Requested aggregation grid; not a claim of native pixel resolution. |
| Sentinel-2 catalog cloud limit | 60% | Scene-level filter for statistics; not a guarantee of cloud-free AOI pixels. |
| Sentinel-2 excluded SCL classes | 3, 8, 9, 10 | Cloud shadow, cloud probability classes, and cirrus are masked. Snow/ice class 11 is not excluded by this list. |
| Landsat valid-pixel QA | QA_PIXEL bits 0–5 clear | Pixel-level fill/cloud/cirrus/shadow/snow masking. |
| Maximum analysis window | 90 days per side | Used for before/after period windows. |
| Minimum valid-pixel ratio | Strictly greater than 0.1 | Both before and after must exceed 10% for measured analysis. |
| Near-zero NDVI baseline | 0.05 | Switches change expression from relative percent to percentage-point difference. |
| Approximate month | 30 days | Converts sample date offset into regression x-values. |
| Interior sample trigger | >20 days / >60 days | Chooses one / two intermediate sample windows. |
| Interior half-width | At most 20 days | Interior query spans up to 40 days total. |
| NDVI severity boundaries | 3%, 8%, 15% | Low/medium/high/critical absolute change bands. |
| Trend dead-band | ±0.1 change units/month | Slopes within the band are called stable; units depend on the baseline rule. |
| Hazard severity ratios | 0.3, 0.75, 1.5 | Low/moderate/high/critical rule boundaries. |
| Maximum hazard observation distance | 25 km | Observations beyond this radius are excluded. |
| Sentinel-2 start date | 2015-06-23 | Selects newer versus historical data path based on study start. |
| Sentinel-2 native bands | B02/B03/B04/B08: 10 m; B11/B12: 20 m | Native source resolutions; resampled statistics grid and AOI affect effective support. |
| Model-only feature gate | `false` | Disables classification, change-detection, and multi-event features. |
| Narrative numeric tolerance | 0.1 percentage points; 0.005 index units | Checks extracted numeric claims only. |
| File analysis limits | 10 files, 10 MiB/file; first 3 images | Non-image data is not parsed as a GIS dataset; at most 500 characters from the first data file are sent as a sample. |

For Landsat, mission selection uses these coverage start dates: TM from
1982-08-22, ETM+ from 1999-04-15, and OLI-TIRS from 2013-02-11. The source
uses the corresponding Landsat 4/5, 7, or 8/9 Collection 2 Level-2 Earth Engine
collections. Earth Engine reductions use EPSG:3857 and a computed scale based
on the AOI's larger dimension divided by 128.

The satellite narrative Groq chain is `openai/gpt-oss-120b`,
`openai/gpt-oss-20b`, then `qwen/qwen3.6-27b`; each permits up to two attempts
inside an 18-second overall retry budget with an 8-second per-request timeout.
The narrative guard uses a retry temperature of 0.1. AI models and prompts
are external dependencies, not scientific algorithms.

## Other system parameters and scientific applicability

- **Location search:** Nominatim search accepts 2–200 characters, requests up
  to 8 results, requests polygon GeoJSON with simplification threshold `0.01`,
  and caches up to 40 search/reverse results per browser module. Requests are
  spaced at least 1 second apart in that module only; this does not enforce a
  shared application-wide request limit. A returned place boundary is used
  only if it passes GeoJSON type/coordinate/size validation (at most 20,000
  ring coordinates). Otherwise the location remains a point/bounds result.
- **Weather ingestion:** defaults to 8 named African-city points and accepts
  at most 20 supplied locations. Open-Meteo is queried with current
  temperature, relative humidity, preceding-interval rain, 10 m wind speed,
  and 0–7 cm soil moisture, plus daily max/min temperature, rain sum, and
  maximum wind. It requests 7 past days and 3 forecast days with provider
  timezone handling. These product values should not be labeled in-situ
  observations.
- **Uploads:** the file endpoint accepts report types `simple` and
  `professional`; these only alter narrative style. The endpoint asks Groq
  for JSON including severity and confidence 1–100, but those are not
  statistically calibrated scientific estimates. Confidence is displayed only
  when the model returns a finite value from 1 to 100 and is labeled
  uncalibrated; malformed or unavailable values remain absent. For images it
  sends up to 3 image data URIs. For non-image-only input it sends only the
  first 500 characters of the first file.
- **GIS support:** documented imports include Shapefile, GeoJSON, KML/KMZ,
  CSV with coordinates/WKT, and supported GeoTIFF coordinate systems.
  Imports are displayed as map layers; GeoTIFF values are not exposed to the
  scientific analysis pipeline. GeoTIFF export is a rendered EPSG:3857 RGB
  map snapshot rather than an analytical raster product. GeoPackage, Esri
  File Geodatabase, CAD, and remote GIS services are not direct supported
  formats.
- **Context products:** the map can show NASA GIBS MODIS/Terra 8-day NDVI,
  daily land-surface temperature, and near-real-time GPM IMERG precipitation
  rate. These products differ in sensor, scale, time step, and meaning from
  selected-AOI Sentinel/Landsat statistics, and are explicitly context only.
- **Application services:** Supabase stores user-scoped monitoring thresholds
  and alerts, weather records, and analysis history; Edge Functions perform
  provider requests. The AI assistant, file-analysis narrative, and
  model-generated satellite/hazard explanations are not measurement
  algorithms. Public basemap and geocoder quotas, provider credentials, and
  service availability are deployment dependencies.

## What is not implemented or independently established

- **Classification controls:** an unreferenced component defines K-means,
  ISODATA, maximum likelihood, Random Forest, and SVM choices with 2–15
  classes, but it is not mounted in the current UI. The active backend sets
  `ENABLE_UNVERIFIED_MODEL_FEATURES` to false, so it does not execute these
  classifiers; results remain null. No training labels, feature stack,
  fitting, validation, or accuracy metrics are provided. The visualization
  endpoint rejects classification-map requests instead of using Gemini to
  fabricate a thematic map.
- **Change detection map / change matrix:** controls and visualization names
  exist, but the analysis endpoint disables the model feature and returns
  null for `changeDetection`. The visualization endpoint also rejects
  pixel-wise change-map requests instead of using Gemini to invent
  transitions. Do not describe this as a validated change-detection method.
- **Forecast science:** forecast projections and R²-derived confidence are
  disabled. Measured temporal samples are not forecasts.
- **Sensor harmonization:** the index equations are shared across sensor
  missions, but no explicit spectral bandpass correction or cross-mission
  harmonization step is implemented. Mission transitions and differences in
  band response, resolution, acquisition timing, and processing can affect
  comparisons.
- **Weather observations:** Open-Meteo's API supplies modeled/reanalysis/
  forecast products, not measurements from GeoPulse-installed field
  instruments. The ingestion request includes 7 past days and 3 forecast
  days, but saves the returned current values with ingestion time. `current.rain`
  is preceding-interval precipitation, not daily total. Daily totals require
  the separate `daily_rain_sum` path.
- **Uploaded geospatial files:** `analyze-files` sends images to a vision
  model and sends only a 500-character text excerpt from the first non-image
  file. It does not parse GeoTIFF values, geometries, band metadata, units, or
  raster statistics for scientific analysis. The returned AI `confidenceLevel`
  is self-reported and not calibrated.
- **Hazard science:** no physical process model, return-period analysis,
  probability of exceedance, impact/exposure/vulnerability model, or
  event-specific threshold calibration is present in the alert evaluator.
- **Causal attribution:** none. Index changes alone do not establish why a
  surface changed.
- **Named scientific laws/theories:** the implementation does not encode a
  named physical law or mechanistic environmental theory (for example a
  radiative-transfer inversion, hydrological model, or ecosystem process
  model). It uses normalized band ratios, statistical summaries/regression,
  geospatial distance, and configurable threshold rules.
- **Accuracy/ground truth:** tests mock service responses and verify selected
  helpers. They do not compare estimates against field measurements,
  independently reproduce provider outputs, establish classification
  accuracy, or validate alert performance. The source repository provides no
  field-validation study or independent benchmark.

## Expert review priorities

1. Specify intended use, target hazards, spatial/temporal scales, and
   acceptable false-positive/false-negative rates before interpreting any
   severity or trend as operational.
2. Validate each index and change metric against sensor-specific reference
   data and representative field observations; document seasonality,
   topography, land-cover context, saturation, cloud/shadow/snow handling,
   mixed pixels, and sensor harmonization.
3. If projections are proposed in future, validate temporal-window selection
   and regression against longer, denser time series. Report sample count and
   uncertainty; never call `R²` forecast confidence.
4. Define hazard-specific thresholds with units and direction, enforce metric
   schemas, test boundary cases, and measure alert skill against an
   independent event record. Set a maximum observation age and disclose
   point-to-region distance.
5. If classification is required, implement it end to end with documented
   inputs/training data and spatially independent validation (confusion
   matrix, class-wise precision/recall, and uncertainty).
6. Preserve enough provenance for reproducibility: provider/product and
   collection version, acquisition/observation dates, query window,
   processing parameters, AOI geometry/CRS, pixel scale, valid-pixel counts,
   model ID/prompt version, and whether values are measured or generated.
7. Review service quotas, Nominatim policy, licensing/attribution, data
   retention, and operational monitoring separately from scientific validity.

## Code and evidence map

- Satellite calculations and constants:
  [`satellite-analysis.ts`](../supabase/functions/_shared/satellite-analysis.ts),
  [`sentinel-statistics.ts`](../supabase/functions/_shared/sentinel-statistics.ts),
  [`earth-engine-statistics.ts`](../supabase/functions/_shared/earth-engine-statistics.ts),
  [`analysis-constants.ts`](../supabase/functions/_shared/analysis-constants.ts)
- Narrative validation:
  [`narrative-guard.ts`](../supabase/functions/_shared/narrative-guard.ts)
- Hazard rules and ingestion:
  [`hazard-severity.ts`](../supabase/functions/_shared/hazard-severity.ts),
  [`evaluate-hazards`](../supabase/functions/evaluate-hazards/index.ts),
  [`ingest-weather`](../supabase/functions/ingest-weather/index.ts)
- Active feature gate and output assembly:
  [`analyze-satellite`](../supabase/functions/analyze-satellite/index.ts)
- UI classifier labels and simplified index interpretation:
  [`ClassificationControls.tsx`](../src/components/ClassificationControls.tsx),
  [`SpectralIndicesDisplay.tsx`](../src/components/SpectralIndicesDisplay.tsx)
- Existing tests:
  [`analysis_test.ts`](../supabase/functions/_shared/analysis_test.ts)
- Provider/source notes:
  [`DATA_SOURCES.md`](./DATA_SOURCES.md),
  [`PAPER_CLAIMS.md`](./PAPER_CLAIMS.md)
